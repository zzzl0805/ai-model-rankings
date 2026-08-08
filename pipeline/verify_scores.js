const puppeteer = require('puppeteer-core');
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function verify() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

    console.log('实时抓取 LMArena Overall 排行...\n');
    await page.goto('https://arena.ai/leaderboard/text', { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector('table', { timeout: 30000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 5000));

    // 获取前10名
    const liveData = await page.evaluate(() => {
      const results = [];
      const trs = document.querySelectorAll('table tbody tr');
      for (let i = 0; i < 10 && i < trs.length; i++) {
        const cells = trs[i].querySelectorAll('td');
        if (cells.length >= 4) {
          results.push({
            rank: cells[0].textContent.trim(),
            model: cells[2].textContent.trim().substring(0, 40),
            score: cells[3].textContent.trim(),
            votes: cells[4] ? cells[4].textContent.trim() : '',
          });
        }
      }
      return results;
    });

    console.log('LMArena 官网实时数据:');
    liveData.forEach(d => {
      console.log('  ' + d.rank + '. ' + d.model + ' | ' + d.score + ' | ' + d.votes + '票');
    });

    // 读取我们存储的数据
    const r = require('/Users/hanzilong/定位/ai-model-rankings/data/rankings.js');
    const stored = (r.data.text || {}).overall || [];

    console.log('\n我们存储的数据:');
    stored.slice(0, 10).forEach((m, i) => {
      console.log('  ' + (i+1) + '. ' + m.name + ' | Elo:' + m.elo + '±' + m.margin + ' | ' + m.votes + '票');
    });

    // 对比
    console.log('\n=== 核验对比 ===');
    let match = 0;
    for (let i = 0; i < 10; i++) {
      const live = liveData[i];
      const ours = stored[i];
      if (live && ours) {
        const liveElo = parseInt(live.score.match(/(\d+)/)[1]);
        const same = liveElo === ours.elo;
        if (same) match++;
        console.log((i+1) + '. ' + ours.name + ' | 官网:' + liveElo + ' | 我们:' + ours.elo + ' | ' + (same ? '✅' : '❌'));
      }
    }
    console.log('\n匹配率: ' + match + '/10');

  } finally {
    await browser.close();
  }
}

verify();
