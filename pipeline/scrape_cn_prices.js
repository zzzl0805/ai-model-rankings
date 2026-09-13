#!/usr/bin/env node
/**
 * 国产模型定价自动抓取
 * 抓取智谱、Kimi(月之暗面)、阿里通义 的官网定价
 *
 * 用法: node scrape_cn_prices.js
 * 输出: cn_prices.json
 *
 * 设计要点（2026-09-13 重构）：
 *   - 各站页面结构会变，**一律按表头名定位列**，不写死列序号
 *   - 智谱已改为「模型卡片 + 键值对表格」布局，用 extract 自定义提取
 *   - 阿里定价页已迁移到 help.aliyun.com/zh/model-studio/model-pricing
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

// 支持 CHROME_PATH 环境变量（CI/云端用），本地默认 Mac Chrome
const CHROME_PATH = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUTPUT_FILE = path.join(__dirname, 'cn_prices.json');

// 从价格文本里取数字；"免费/限时免费" 视为 0
function parsePrice(text) {
  if (!text) return null;
  if (/免费|Free/i.test(text)) return 0;
  const m = text.replace(/,/g, '').match(/([\d.]+)/);
  return m ? parseFloat(m[1]) : null;
}

// 在表头里按正则找列下标，找不到返回 -1
function findCol(headers, re) {
  return headers.findIndex((h) => re.test(h || ''));
}

const PROVIDERS = [
  {
    id: 'zhipu',
    name: '智谱AI',
    url: 'https://open.bigmodel.cn/pricing',
    // 智谱现为卡片布局：.model-card 内含模型名 + table.price-table（键值对）
    extract: async function (page) {
      return await page.evaluate(() => {
        const models = [];
        document.querySelectorAll('.model-card').forEach((card) => {
          const body = card.querySelector('.card-body') || card;
          const lines = (body.innerText || '').split('\n').map((s) => s.trim()).filter(Boolean);
          let name = (lines[0] || '').replace(/\s+/g, '-').toLowerCase();
          if (!name) return;

          let input = null;
          let output = null;
          card.querySelectorAll('table tr').forEach((tr) => {
            const cells = Array.from(tr.querySelectorAll('td,th')).map((c) => c.textContent.trim());
            const key = cells[0] || '';
            const val = cells[1] || '';
            if (/输入单价/.test(key)) {
              if (/免费/.test(val)) input = 0;
              else {
                const m = val.match(/([\d.]+)\s*元/);
                if (m) input = parseFloat(m[1]);
              }
            }
            if (/输出单价/.test(key)) {
              if (/免费/.test(val)) output = 0;
              else {
                const m = val.match(/([\d.]+)\s*元/);
                if (m) output = parseFloat(m[1]);
              }
            }
          });

          if (input === null) return;
          models.push({
            name: name,
            input: input,
            output: output === null ? input : output,
            currency: 'CNY',
            source: '智谱官网',
            context: '',
          });
        });
        return models;
      });
    },
  },
  {
    id: 'moonshot',
    name: 'Kimi(月之暗面)',
    url: 'https://platform.moonshot.cn/docs/pricing/chat',
    // 表头: 模型 | 计费单位 | 输入价格（缓存命中）| 输入价格（缓存未命中）| 输出价格 | 上下文窗口
    // 取「缓存未命中」作为输入价（缓存命中价过低，不代表真实成本）
    parseTables: function (tables) {
      const models = [];
      tables.forEach(function (t) {
        const iModel = findCol(t.headers, /模型/);
        let iIn = findCol(t.headers, /输入.*未命中/);
        if (iIn < 0) iIn = findCol(t.headers, /输入/);
        const iOut = findCol(t.headers, /输出/);
        if (iModel < 0 || iIn < 0 || iOut < 0) return;

        t.rows.forEach(function (cells) {
          const raw = (cells[iModel] || '').split('\n')[0].trim();
          if (!raw) return;
          const input = parsePrice(cells[iIn]);
          const output = parsePrice(cells[iOut]);
          if (input === null) return;
          const name = raw.toLowerCase().indexOf('kimi') === 0
            ? raw.toLowerCase()
            : 'kimi-' + raw.toLowerCase().replace(/\s+/g, '-');
          models.push({
            name: name,
            input: input,
            output: output === null ? input : output,
            currency: 'CNY',
            source: 'Kimi官网',
            context: '',
          });
        });
      });
      return models;
    },
  },
  {
    id: 'aliyun',
    name: '阿里通义',
    url: 'https://help.aliyun.com/zh/model-studio/model-pricing',
    // 表头: 模型 ID | [服务部署范围] | 模式 | 单次请求的输入Token数 | 输入单价（每百万Token）| 输出单价（每百万Token）| 免费额度
    // 价格已是「元/百万Token」，无需换算
    parseTables: function (tables) {
      const models = [];
      tables.forEach(function (t) {
        const iModel = findCol(t.headers, /模型\s*ID/i);
        const iIn = findCol(t.headers, /输入单价/);
        const iOut = findCol(t.headers, /输出单价/);
        if (iModel < 0 || iIn < 0 || iOut < 0) return;

        t.rows.forEach(function (cells) {
          const raw = (cells[iModel] || '').split('\n')[0].trim();
          if (!raw || /模型\s*ID/i.test(raw)) return;
          const input = parsePrice(cells[iIn]);
          const output = parsePrice(cells[iOut]);
          if (input === null) return;
          models.push({
            name: raw.toLowerCase().replace(/\s+/g, '-'),
            input: input,
            output: output === null ? input : output,
            currency: 'CNY',
            source: '阿里云官网',
            context: (cells[findCol(t.headers, /输入的?Token数|阶梯/)] || '').trim(),
          });
        });
      });
      return models;
    },
  },
];

// 通用表格提取：返回 [{ headers: [...], rows: [[...]] }]
async function extractTables(page) {
  return await page.evaluate(function () {
    const out = [];
    document.querySelectorAll('table').forEach(function (table) {
      const headers = [];
      const firstRow = table.querySelector('tr');
      if (firstRow) {
        firstRow.querySelectorAll('th, td').forEach(function (cell) {
          headers.push(cell.textContent.trim());
        });
      }
      const rows = [];
      table.querySelectorAll('tbody tr, tr').forEach(function (tr, idx) {
        if (idx === 0) return; // 跳过表头行
        const cells = Array.from(tr.querySelectorAll('td')).map(function (c) {
          return c.textContent.trim();
        });
        if (cells.length < 2) return;
        rows.push(cells);
      });
      if (rows.length) out.push({ headers: headers, rows: rows });
    });
    return out;
  });
}

async function scrapeProvider(browser, provider) {
  console.log('\n📊 抓取 ' + provider.name + '...');
  let page;
  try {
    page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
    await page.goto(provider.url, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(function (r) { setTimeout(r, 5000); });

    var models;
    if (provider.extract) {
      models = await provider.extract(page);
      console.log('  提取到 ' + models.length + ' 个模型定价');
    } else {
      var tables = await extractTables(page);
      console.log('  提取到 ' + tables.length + ' 个表格');
      models = provider.parseTables(tables);
      console.log('  解析出 ' + models.length + ' 个模型定价');
    }

    // 去重（同名取第一个）
    var seen = {};
    models = models.filter(function (m) {
      if (seen[m.name]) return false;
      seen[m.name] = true;
      return true;
    });

    if (models.length > 0) {
      models.slice(0, 5).forEach(function (m) {
        console.log('    ' + m.name + ': ¥' + m.input + '/¥' + m.output);
      });
    }

    return models;
  } catch (err) {
    console.log('  ⚠️ 抓取失败: ' + err.message);
    return [];
  } finally {
    if (page) await page.close();
  }
}

async function main() {
  console.log('=== 国产模型定价抓取 ===');

  var browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  var allPrices = {};

  for (var i = 0; i < PROVIDERS.length; i++) {
    var provider = PROVIDERS[i];
    var models = await scrapeProvider(browser, provider);
    models.forEach(function (m) {
      // 先到先得：阿里百炼页会列出第三方托管模型（kimi/glm 等），
      // 不能让它覆盖厂商官网价，所以先写入的优先保留
      if (allPrices[m.name]) return;
      allPrices[m.name] = {
        input: m.input,
        output: m.output,
        currency: m.currency,
        source: m.source,
        context: m.context,
      };
    });
  }

  await browser.close();

  // 保存
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allPrices, null, 2));
  console.log('\n✅ 保存到 ' + OUTPUT_FILE);
  console.log('   共 ' + Object.keys(allPrices).length + ' 个模型定价');

  // 按厂商统计
  var byProvider = {};
  Object.keys(allPrices).forEach(function (name) {
    var src = allPrices[name].source;
    byProvider[src] = (byProvider[src] || 0) + 1;
  });
  Object.keys(byProvider).forEach(function (src) {
    console.log('   ' + src + ': ' + byProvider[src] + '个');
  });
}

main().catch(function (err) {
  console.error('错误:', err);
  process.exit(1);
});
