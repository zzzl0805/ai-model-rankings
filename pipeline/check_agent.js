const puppeteer = require('puppeteer-core');
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function check() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

    console.log('打开 Agent 排行榜...');
    await page.goto('https://arena.ai/leaderboard/agent', { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 5000));

    // 检查表头
    const headers = await page.evaluate(() => {
      const ths = document.querySelectorAll('table thead th');
      return Array.from(ths).map(th => th.textContent.trim());
    });
    console.log('表头:', headers);

    // 检查前5行数据
    const rows = await page.evaluate(() => {
      const results = [];
      const trs = document.querySelectorAll('table tbody tr');
      for (let i = 0; i < 5 && i < trs.length; i++) {
        const cells = trs[i].querySelectorAll('td');
        results.push(Array.from(cells).map(c => c.textContent.trim().substring(0, 60)));
      }
      return results;
    });
    console.log('\n前5行:');
    rows.forEach((r, i) => console.log('  ' + (i+1) + ': ' + r.join(' | ')));

    // 检查维度按钮
    const buttons = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button'))
        .filter(b => {
          const text = b.textContent.trim();
          return text.length > 2 && text.length < 50 &&
                 (text.includes('Overall') || text.includes('Coding') || text.includes('Math') ||
                  text.includes('Writing') || text.includes('Expert') || text.includes('Hard'));
        })
        .map(b => b.textContent.trim());
    });
    console.log('\n维度按钮:', buttons);

    // 检查页面结构
    const pageStructure = await page.evaluate(() => {
      const tables = document.querySelectorAll('table');
      const divs = document.querySelectorAll('[class*="leaderboard"], [class*="ranking"], [class*="table"]');
      return {
        tables: tables.length,
        leaderboardDivs: divs.length,
        bodyText: document.body.innerText.substring(0, 500),
      };
    });
    console.log('\n页面结构:', pageStructure);

  } finally {
    await browser.close();
  }
}

check();
