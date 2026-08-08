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

    console.log('=== Overall 排行榜 ===');
    await page.goto('https://arena.ai/leaderboard', { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 5000));

    const buttons = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button'))
        .filter(b => {
          const text = b.textContent.trim();
          return text.length > 2 && text.length < 80 &&
                 !['Log In', 'Cookies', 'Hide this', 'Hide Filters', 'Filters', 'View all', 'View as', 'Ranking', 'Pareto', 'Adjustments'].includes(text);
        })
        .map(b => b.textContent.trim());
    });

    console.log('\n所有按钮:');
    buttons.forEach(b => console.log('  [' + b + ']'));

    const headers = await page.evaluate(() => {
      const ths = document.querySelectorAll('table thead th');
      return Array.from(ths).map(th => th.textContent.trim());
    });
    console.log('\n表头:', headers);

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

    const navLinks = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a[href*="leaderboard"]'))
        .map(a => ({ text: a.textContent.trim(), href: a.href }))
        .filter(l => l.text.length > 1);
    });
    console.log('\n排行榜分类:');
    navLinks.forEach(l => console.log('  ' + l.text + ' → ' + l.href));

  } finally {
    await browser.close();
  }
}

check();
