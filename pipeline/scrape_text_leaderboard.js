const puppeteer = require('puppeteer-core');
const fs = require('fs');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function scrape() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

    // 尝试 Text 排行榜
    console.log('打开 Text 排行榜...');
    await page.goto('https://arena.ai/leaderboard/text', { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 5000));

    // 获取表头
    const headers = await page.evaluate(() => {
      const ths = document.querySelectorAll('table thead th, table tr:first-child th');
      return Array.from(ths).map(th => th.textContent.trim());
    });
    console.log('表头:', headers);

    // 获取前5行数据
    const data = await page.evaluate(() => {
      const rows = document.querySelectorAll('table tbody tr, table tr');
      const results = [];
      for (let i = 0; i < 10 && i < rows.length; i++) {
        const cells = rows[i].querySelectorAll('td');
        if (cells.length > 1) {
          results.push(Array.from(cells).map(c => c.textContent.trim()));
        }
      }
      return results;
    });

    console.log('\n前10行:');
    data.forEach((row, i) => {
      console.log(`  ${i+1}: ${row.join(' | ')}`);
    });

    // 检查是否有 Elo 分数（可能在 title 属性或 tooltip 中）
    const withElo = await page.evaluate(() => {
      const results = [];
      const rows = document.querySelectorAll('table tbody tr');
      for (let i = 0; i < 5 && i < rows.length; i++) {
        const cells = rows[i].querySelectorAll('td');
        const cellData = [];
        cells.forEach(cell => {
          cellData.push({
            text: cell.textContent.trim(),
            title: cell.title || '',
            ariaLabel: cell.getAttribute('aria-label') || '',
            dataAttr: cell.dataset ? JSON.stringify(cell.dataset) : '',
          });
        });
        results.push(cellData);
      }
      return results;
    });

    console.log('\n单元格详细信息:');
    withElo.forEach((row, i) => {
      console.log(`行${i+1}:`);
      row.forEach((cell, j) => {
        if (cell.title || cell.ariaLabel || cell.dataAttr !== '{}') {
          console.log(`  列${j}: text="${cell.text}" title="${cell.title}" aria="${cell.ariaLabel}" data=${cell.dataAttr}`);
        }
      });
    });

    // 检查 Next.js 数据
    const nextData = await page.evaluate(() => {
      const el = document.getElementById('__NEXT_DATA__');
      return el ? el.textContent.substring(0, 2000) : '无';
    });
    console.log('\n__NEXT_DATA__:', nextData.substring(0, 500));

  } catch(err) {
    console.error('错误:', err.message);
  } finally {
    await browser.close();
  }
}

scrape();
