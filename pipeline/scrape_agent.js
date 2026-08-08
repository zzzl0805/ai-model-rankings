const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

// 支持 CHROME_PATH 环境变量（CI/云端用），本地默认 Mac Chrome
const CHROME_PATH = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const PROVIDERS = ['Anthropic', 'Google', 'OpenAI', 'Meta', 'DeepSeek', 'xAI', 'SpaceXAI',
  'Mistral', 'Alibaba', 'Qwen', 'Moonshot', 'MoonshotAI', 'Zhipu', 'Z.ai', 'ByteDance',
  'Bytedance', 'Baidu', 'Nvidia', 'Ai2', 'Microsoft', 'Xiaomi', 'MiniMax', 'Tencent',
  'StepFun', 'Stepfun', 'Thinking Machines', 'Thinky', 'KlingAI'];

function cleanName(rawName) {
  let name = rawName.replace(/·.*/, '').replace(/Proprietary|Open Source|Free|MIT|Apache|Modified/g, '').trim();
  for (const p of PROVIDERS) {
    if (name.startsWith(p)) { name = name.substring(p.length); break; }
  }
  for (const p of PROVIDERS) {
    if (name.endsWith(p)) { name = name.substring(0, name.length - p.length); break; }
  }
  return name.replace(/\([^)]*\)/g, '').trim();
}

async function scrape() {
  const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
    await page.goto('https://arena.ai/leaderboard/agent', { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 5000));

    const rows = await page.evaluate(() => {
      const results = [];
      document.querySelectorAll('table tbody tr').forEach(tr => {
        const cells = tr.querySelectorAll('td');
        if (cells.length < 3) return;
        results.push(Array.from(cells).map(c => c.textContent.trim()));
      });
      return results;
    });

    const models = rows.map((cells, idx) => {
      // Agent 列: Rank(全局编号), Model, Net Improvement, ..., Sessions(最后一列)
      // cells[0] 是 Arena 全局编号，不是 1/2/3 序号，用 index 重新编号
      const rawName = cells[1] || '';
      const netImp = cells[2] || '';
      const pctMatch = netImp.match(/([\d.]+)%/);
      if (!pctMatch) return null;

      // Sessions 是最后一列
      const sessionsStr = cells[cells.length - 1] || '0';
      const sessions = parseInt(sessionsStr.replace(/,/g, '')) || 0;

      return {
        rank: idx + 1, name: cleanName(rawName), rawName,
        elo: parseFloat(pctMatch[1]), margin: 0, votes: sessions,
        price: null, context: '', isAgent: true,
        metrics: {
          netImprovement: cells[2] || '', confirmedSuccess: cells[3] || '',
          praiseVsComplaint: cells[4] || '', steerability: cells[5] || '',
          bashRecovery: cells[6] || '', toolHallucination: cells[7] || '',
          sessions: sessionsStr,
        }
      };
    }).filter(Boolean);

    console.log(`Agent: ${models.length} 个模型`);
    models.slice(0, 5).forEach((m, i) => {
      console.log(`  ${i+1}. ${m.name} | 净提升:${m.elo}% | 会话:${m.votes}`);
    });

    // 更新 rankings.json
    const rankingsFile = path.join(__dirname, 'rankings.json');
    const rankings = JSON.parse(fs.readFileSync(rankingsFile, 'utf8'));
    rankings.data.agent = { overall: models };
    fs.writeFileSync(rankingsFile, JSON.stringify(rankings, null, 2));
    console.log('✅ 已更新 rankings.json');
  } finally {
    await browser.close();
  }
}

scrape();
