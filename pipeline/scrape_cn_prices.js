#!/usr/bin/env node
/**
 * 国产模型定价自动抓取
 * 抓取智谱、Kimi、阿里通义、百度、字节豆包、腾讯混元的官网定价
 *
 * 用法: node scrape_cn_prices.js
 * 输出: cn_prices.json
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

// 支持 CHROME_PATH 环境变量（CI/云端用），本地默认 Mac Chrome
const CHROME_PATH = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUTPUT_FILE = path.join(__dirname, 'cn_prices.json');

// 各厂商定价页配置
const PROVIDERS = [
  {
    id: 'zhipu',
    name: '智谱AI',
    url: 'https://open.bigmodel.cn/pricing',
    // 智谱表格格式: 模型名 | 上下文 | 输入单价(百万tokens) | 输出单价 | 缓存存储 | 缓存命中
    parse: function (rows) {
      var models = [];
      rows.forEach(function (row) {
        // 智谱价格格式: "8元" 或 "限时免费" 或 "免费"
        var inputMatch = row.input.match(/([\d.]+)\s*元/);
        var outputMatch = row.output.match(/([\d.]+)\s*元/);
        if (row.model && inputMatch) {
          models.push({
            name: row.model.toLowerCase().replace(/\s+/g, '-'),
            input: parseFloat(inputMatch[1]),
            output: outputMatch ? parseFloat(outputMatch[1]) : parseFloat(inputMatch[1]),
            currency: 'CNY',
            source: '智谱官网',
            context: row.context || '',
          });
        }
        // 免费模型
        if (row.model && (row.input.indexOf('免费') >= 0 || row.input.indexOf('Free') >= 0)) {
          models.push({
            name: row.model.toLowerCase().replace(/\s+/g, '-'),
            input: 0, output: 0,
            currency: 'CNY', source: '智谱官网(免费)',
            context: row.context || '',
          });
        }
      });
      return models;
    }
  },
  {
    id: 'moonshot',
    name: 'Kimi(月之暗面)',
    url: 'https://platform.moonshot.cn/docs/pricing/chat',
    parse: function (rows) {
      var models = [];
      rows.forEach(function (row) {
        // Kimi 价格格式: "¥X / 百万tokens"
        var inputMatch = row.input.match(/([\d.]+)/);
        var outputMatch = row.output.match(/([\d.]+)/);
        if (row.model && inputMatch) {
          models.push({
            name: 'kimi-' + row.model.toLowerCase().replace(/\s+/g, '-'),
            input: parseFloat(inputMatch[1]),
            output: outputMatch ? parseFloat(outputMatch[1]) : parseFloat(inputMatch[1]),
            currency: 'CNY',
            source: 'Kimi官网',
            context: '',
          });
        }
      });
      return models;
    }
  },
  {
    id: 'aliyun',
    name: '阿里通义',
    url: 'https://help.aliyun.com/zh/model-studio/getting-started/models',
    parse: function (rows) {
      var models = [];
      rows.forEach(function (row) {
        // 阿里价格格式: "0.0032元" (每千token)
        var inputMatch = row.input.match(/([\d.]+)\s*元/);
        var outputMatch = row.output.match(/([\d.]+)\s*元/);
        if (row.model && inputMatch) {
          // 阿里价格是每千token，需要×1000转为每百万token
          models.push({
            name: row.model.toLowerCase().replace(/\s+/g, '-'),
            input: parseFloat(inputMatch[1]) * 1000,
            output: outputMatch ? parseFloat(outputMatch[1]) * 1000 : parseFloat(inputMatch[1]) * 1000,
            currency: 'CNY',
            source: '阿里云官网',
            context: row.context || '',
          });
        }
        // 免费模型
        if (row.model && (row.input.indexOf('免费') >= 0 || row.input.indexOf('Free') >= 0)) {
          models.push({
            name: row.model.toLowerCase().replace(/\s+/g, '-'),
            input: 0, output: 0,
            currency: 'CNY', source: '阿里云官网(免费)',
            context: row.context || '',
          });
        }
      });
      return models;
    }
  },
];

async function scrapeProvider(browser, provider) {
  console.log('\n📊 抓取 ' + provider.name + '...');
  var page;
  try {
    page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
    await page.goto(provider.url, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(function (r) { setTimeout(r, 5000); });

    // 通用表格提取：提取所有表格的所有行
    var allRows = await page.evaluate(function () {
      var results = [];
      var tables = document.querySelectorAll('table');
      tables.forEach(function (table) {
        var headerCells = [];
        var headerRow = table.querySelector('tr');
        if (headerRow) {
          headerRow.querySelectorAll('th, td').forEach(function (cell) {
            headerCells.push(cell.textContent.trim());
          });
        }

        var dataRows = table.querySelectorAll('tbody tr, tr');
        dataRows.forEach(function (tr, idx) {
          if (idx === 0 && headerCells.length > 0) return; // 跳过表头
          var cells = tr.querySelectorAll('td');
          if (cells.length < 3) return;
          var cellTexts = Array.from(cells).map(function (c) { return c.textContent.trim(); });

          // 智谱格式: 模型名(含描述) | 上下文 | 输入 | 输出 | ...
          // 阿里格式: 模型名 | 版本 | 模式 | 上下文 | 最大输入 | ... | 输入 | 输出 | ...
          // Kimi格式: 模型名 | 上下文 | 输入 | 输出 | ...

          var model = cellTexts[0] || '';
          // 清理模型名（去掉描述文字）
          model = model.split(' ')[0].split('\n')[0].replace(/当前与.*/, '').replace(/又称.*/, '').trim();

          // 找包含价格/元的列
          var inputPrice = '';
          var outputPrice = '';
          var context = '';

          cellTexts.forEach(function (text, i) {
            if (text.indexOf('元') >= 0 || text.indexOf('免费') >= 0 || text.indexOf('Free') >= 0) {
              if (!inputPrice) inputPrice = text;
              else if (!outputPrice) outputPrice = text;
            }
            if (text.match(/^\d+[KMk百万]/) || text.match(/\d+\s*[,，]\d{3}/)) {
              if (!context) context = text;
            }
          });

          if (model && inputPrice) {
            results.push({
              model: model,
              input: inputPrice,
              output: outputPrice || inputPrice,
              context: context,
            });
          }
        });
      });
      return results;
    });

    console.log('  提取到 ' + allRows.length + ' 行原始数据');

    // 用厂商特定解析器处理
    var models = provider.parse(allRows);
    console.log('  解析出 ' + models.length + ' 个模型定价');

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
