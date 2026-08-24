#!/usr/bin/env node
/**
 * LMArena 全量排行榜爬虫
 * 抓取所有13个大类 × 8个维度的真实 Elo
 *
 * 用法: node scrape_lmarena.js
 * 输出: rankings.json
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

// 支持 CHROME_PATH 环境变量（CI/云端用），本地默认 Mac Chrome
const CHROME_PATH = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUTPUT_FILE = path.join(__dirname, 'rankings.json');

// 13个大类
const CATEGORIES = [
  { id: 'agent', name: 'Agent', url: 'https://arena.ai/leaderboard/agent' },
  { id: 'text', name: 'Text', url: 'https://arena.ai/leaderboard/text' },
  { id: 'webdev', name: 'WebDev', url: 'https://arena.ai/leaderboard/code/webdev' },
  { id: 'vision', name: 'Vision', url: 'https://arena.ai/leaderboard/vision' },
  { id: 'document', name: 'Document', url: 'https://arena.ai/leaderboard/document' },
  { id: 'search', name: 'Search', url: 'https://arena.ai/leaderboard/search' },
  { id: 'image-to-webdev', name: 'Image-to-WebDev', url: 'https://arena.ai/leaderboard/code/image-to-webdev' },
  { id: 'text-to-image', name: 'Text to Image', url: 'https://arena.ai/leaderboard/text-to-image' },
  { id: 'image-edit', name: 'Image Edit', url: 'https://arena.ai/leaderboard/image-edit' },
  { id: 'text-to-video', name: 'Text to Video', url: 'https://arena.ai/leaderboard/text-to-video' },
  { id: 'image-to-video', name: 'Image to Video', url: 'https://arena.ai/leaderboard/image-to-video' },
  { id: 'video-edit', name: 'Video Edit', url: 'https://arena.ai/leaderboard/video-edit' },
];

// 8个维度按钮文本
const DIMENSIONS = [
  { text: '🏆Overall', key: 'overall' },
  { text: '💻Coding', key: 'coding' },
  { text: '🧮Math', key: 'math' },
  { text: '✍️Creative Writing', key: 'writing' },
  { text: '🌶️Hard Prompts', key: 'hardprompts' },
  { text: '📝Instruction Following', key: 'instruction' },
  { text: '🤓Expert', key: 'expert' },
  { text: '💬Multi-Turn', key: 'multiturn' },
];

function cleanModelName(rawName) {
  let name = rawName;
  const providers = ['Anthropic', 'Google', 'OpenAI', 'Meta', 'DeepSeek', 'xAI', 'SpaceXAI',
    'Mistral', 'Alibaba', 'Qwen', 'Moonshot', 'MoonshotAI', 'Zhipu', 'Z.ai',
    'ByteDance', 'Bytedance', 'Baidu', 'Nvidia', 'Ai2', 'Microsoft',
    'Xiaomi', 'MiniMax', 'Tencent', 'StepFun', 'Stepfun',
    'Thinking Machines', 'Thinky', 'Reve', 'Dola', 'Perplexity', 'Cohere', '01.AI'];

  // 移除末尾的 "Provider · License" 部分
  name = name.replace(/·.*/, '').replace(/Proprietary|Open Source|Free|MIT|Apache|Modified/g, '').trim();

  // 移除开头的 provider 名
  for (const p of providers) {
    if (name.startsWith(p)) {
      name = name.substring(p.length);
      break;
    }
  }

  // 移除结尾的 provider 名
  for (const p of providers) {
    if (name.endsWith(p)) {
      name = name.substring(0, name.length - p.length);
      break;
    }
  }

  name = name.replace(/\([^)]*\)/g, '').trim();
  return name;
}

async function scrape() {
  console.log('启动 Chrome...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

    const allData = {};

    for (const cat of CATEGORIES) {
      console.log(`\n========== ${cat.name} ==========`);
      await page.goto(cat.url, { waitUntil: 'networkidle2', timeout: 60000 });
      await new Promise(r => setTimeout(r, 5000));

      allData[cat.id] = {};

      // 检测是否为 Agent 页面（Agent 用 Net Improvement % 而非 Elo）
      const isAgentPage = cat.id === 'agent';

      // Agent 页面的 Sessions 列位置会随 arena.ai 增删列而变（已新增 Cost/Task、
      // Output Tokens、Price 三列），按表头动态定位，避免 cells.length-1 取错列
      let agentSessionsIdx = -1;
      if (isAgentPage) {
        agentSessionsIdx = await page.evaluate(() => {
          const headers = Array.from(document.querySelectorAll('table thead th')).map(th => th.textContent.trim());
          return headers.findIndex(h => /sessions/i.test(h));
        });
        if (agentSessionsIdx < 0) console.warn('⚠️ 未找到 Sessions 列');
      }

      // 先抓取默认表格
      const defaultRows = await page.evaluate(() => {
        const results = [];
        const trs = document.querySelectorAll('table tbody tr, table tr');
        trs.forEach(tr => {
          const cells = tr.querySelectorAll('td');
          if (cells.length < 4) return;
          results.push(Array.from(cells).map(c => c.textContent.trim()));
        });
        return results;
      });

      // 解析默认数据
      const defaultModels = [];
      defaultRows.forEach(cells => {
        if (cells.length < 4) return;
        const rank = parseInt(cells[0]);

        if (isAgentPage) {
          // Agent 页面: 全局编号 | Model | Net Improvement(%) | Confirmed Success | ... | Sessions
          // cells[0] 是 Arena 全局编号，用 defaultModels.length + 1 作为真实序号
          const rawName = cells[1] || '';
          const netImpStr = cells[2] || '';
          const pctMatch = netImpStr.match(/([\d.]+)\s*%/);
          if (!pctMatch) return;
          const elo = parseFloat(pctMatch[1]);
          const cleanName = cleanModelName(rawName);
          const sessionsStr = (agentSessionsIdx >= 0 ? cells[agentSessionsIdx] : '') || '0';
          const votes = parseInt(sessionsStr.replace(/,/g, '')) || 0;

          defaultModels.push({
            rank: defaultModels.length + 1, name: cleanName, rawName, elo, margin: 0, votes,
            price: null, context: '',
            isAgent: true,
            agentMetrics: {
              netImprovement: cells[2] || '',
              confirmedSuccess: cells[3] || '',
              praiseVsComplaint: cells[4] || '',
              steerability: cells[5] || '',
              bashRecovery: cells[6] || '',
              toolHallucination: cells[7] || '',
              sessions: sessionsStr,
            }
          });
        } else {
          // 常规页面: Rank | ? | Model | Elo ± margin | Votes | Price | Context
          const rawName = cells[2];
          const scoreCell = cells[3];
          const eloMatch = scoreCell.match(/(\d{3,4})\s*[±+]\s*(\d+)?/);
          if (!eloMatch || isNaN(rank)) return;
          const elo = parseInt(eloMatch[1]);
          const margin = eloMatch[2] ? parseInt(eloMatch[2]) : 0;
          const cleanName = cleanModelName(rawName);
          let votes = 0;
          let price = null;
          let context = '';
          if (cells.length >= 6) {
            votes = parseInt((cells[4] || '0').replace(/,/g, '')) || 0;
            const priceMatch = (cells[5] || '').match(/\$?([\d.]+)\s*\/\s*\$?([\d.]+)/);
            if (priceMatch) price = { input: parseFloat(priceMatch[1]), output: parseFloat(priceMatch[2]) };
            context = cells[6] || '';
          }
          defaultModels.push({ rank, name: cleanName, rawName, elo, margin, votes, price, context });
        }
      });

      // 尝试点击维度按钮
      let hasDimensions = false;
      for (const dim of DIMENSIONS) {
        const clicked = await page.evaluate((buttonText) => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const btn = buttons.find(b => {
            const text = b.textContent.trim();
            return text === buttonText || text.startsWith(buttonText);
          });
          if (btn) { btn.click(); return btn.textContent.trim(); }
          return null;
        }, dim.text);

        if (!clicked) continue;

        hasDimensions = true;
        await new Promise(r => setTimeout(r, 2000));

        const rows = await page.evaluate(() => {
          const results = [];
          const trs = document.querySelectorAll('table tbody tr, table tr');
          trs.forEach(tr => {
            const cells = tr.querySelectorAll('td');
            if (cells.length < 4) return;
            results.push(Array.from(cells).map(c => c.textContent.trim()));
          });
          return results;
        });

        const models = [];
        rows.forEach(cells => {
          if (cells.length < 4) return;
          const rank = parseInt(cells[0]);

          if (isAgentPage) {
            // Agent 子维度: 全局编号 | Model | Net Improvement(%) | ... | Sessions
            const rawName = cells[1] || '';
            const netImpStr = cells[2] || '';
            const pctMatch = netImpStr.match(/([\d.]+)\s*%/);
            if (!pctMatch) return;
            const elo = parseFloat(pctMatch[1]);
            const cleanName = cleanModelName(rawName);
            const sessionsStr = (agentSessionsIdx >= 0 ? cells[agentSessionsIdx] : '') || '0';
            const votes = parseInt(sessionsStr.replace(/,/g, '')) || 0;
            models.push({
              rank: models.length + 1, name: cleanName, rawName, elo, margin: 0, votes,
              price: null, context: '',
              isAgent: true,
              agentMetrics: {
                netImprovement: cells[2] || '',
                confirmedSuccess: cells[3] || '',
                praiseVsComplaint: cells[4] || '',
                steerability: cells[5] || '',
                bashRecovery: cells[6] || '',
                toolHallucination: cells[7] || '',
                sessions: sessionsStr,
              }
            });
          } else {
            const rawName = cells[2];
            const scoreCell = cells[3];
            const eloMatch = scoreCell.match(/(\d{3,4})\s*[±+]\s*(\d+)?/);
            if (!eloMatch || isNaN(rank)) return;
            const elo = parseInt(eloMatch[1]);
            const margin = eloMatch[2] ? parseInt(eloMatch[2]) : 0;
            const cleanName = cleanModelName(rawName);
            let votes = 0;
            let price = null;
            let context = '';
            if (cells.length >= 6) {
              votes = parseInt((cells[4] || '0').replace(/,/g, '')) || 0;
              const priceMatch = (cells[5] || '').match(/\$?([\d.]+)\s*\/\s*\$?([\d.]+)/);
              if (priceMatch) price = { input: parseFloat(priceMatch[1]), output: parseFloat(priceMatch[2]) };
              context = cells[6] || '';
            }
            models.push({ rank, name: cleanName, rawName, elo, margin, votes, price, context });
          }
        });

        allData[cat.id][dim.key] = models;
        console.log(`  ${dim.key}: ${models.length}个模型`);
      }

      // 如果没有维度按钮，使用默认数据作为 overall
      if (!hasDimensions && defaultModels.length > 0) {
        allData[cat.id]['overall'] = defaultModels;
        console.log(`  overall(默认): ${defaultModels.length}个模型`);
      }
    }

    // 保存
    const output = {
      lastUpdated: new Date().toISOString().split('T')[0],
      source: 'arena.ai',
      data: allData,
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    console.log(`\n✅ 保存到 ${OUTPUT_FILE}`);

    // 统计
    let totalModels = 0;
    for (const cat of CATEGORIES) {
      for (const dim of DIMENSIONS) {
        totalModels += (allData[cat.id]?.[dim.key] || []).length;
      }
    }
    console.log(`总计: ${CATEGORIES.length}个大类 × ${DIMENSIONS.length}个维度 = ${totalModels}条数据`);

    return output;
  } catch (err) {
    console.error('爬取失败:', err.message);
    return null;
  } finally {
    await browser.close();
  }
}

scrape().then(data => {
  console.log(data ? '\n✅ 完成' : '\n❌ 失败');
});
