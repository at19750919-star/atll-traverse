const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const ROOT = path.resolve(__dirname, '..');
function dependency(name) {
  for (const base of [
    process.env.CODEX_NODE_MODULES,
    path.join(process.env.USERPROFILE || '', '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'),
    path.resolve(ROOT, '../百家3.0/node_modules')
  ].filter(Boolean)) {
    try { return require(path.join(base, name)); } catch (_) {}
  }
  return require(name);
}

const { chromium } = dependency('playwright');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };

const server = http.createServer((req, res) => {
  const target = path.resolve(ROOT, '.' + decodeURIComponent(new URL(req.url, 'http://local').pathname));
  if (!target.startsWith(ROOT + path.sep) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) {
    res.writeHead(404); res.end();
  } else {
    res.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream' });
    res.end(fs.readFileSync(target));
  }
});

async function runInspect(viewportWidth = 1600, viewportHeight = 1000, screenshotName = 'review-inspect.png') {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: viewportWidth, height: viewportHeight } });

  try {
    await page.goto(`http://127.0.0.1:${port}/review.html`);
    await page.waitForLoadState('networkidle');

    // 注入真實 83 局資料（含紅0訊號、4~6張牌）
    await page.evaluate(() => {
      const rounds = [];
      let pos = 0;
      const suits = ['♠', '♥', '♣', '♦'];
      const ranks = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
      
      for (let i = 1; i <= 83; i++) {
        const isRed0 = i % 4 === 1;
        const cards = [];
        const cardCount = i % 3 === 0 ? 6 : i % 2 === 0 ? 5 : 4;
        const colorSeq = i % 2 === 0 ? 'BBBR' : 'RRRB';
        
        for (let c = 0; c < cardCount; c++) {
          let r = ranks[(i * 3 + c) % ranks.length];
          let s = suits[(i + c) % 4];
          if (isRed0 && c === 0) { r = 'Q'; s = '♥'; }
          if (isRed0 && c === 1) { r = '10'; s = '♦'; }
          const back = colorSeq[c] || (c % 2 === 0 ? 'B' : 'R');
          cards.push(new Card(r, s, pos++, back));
        }

        const pTotal = (cards[0].point() + cards[2].point()) % 10;
        const bTotal = (cards[1].point() + cards[3].point()) % 10;
        const res = pTotal > bTotal ? '閒' : pTotal < bTotal ? '莊' : '和';
        rounds.push({
          start_index: cards[0].pos,
          cards,
          result: res,
          sensitive: true,
          segment: 'A'
        });
      }

      currentRounds = rounds;
      window.__importedShoeMode = false;
      refreshAnalysisAndRender();
      if (window.DashboardUI) window.DashboardUI.refreshNow();
    });

    await page.waitForTimeout(600);

    // 擷取可視畫面截圖供檢查
    const outDir = path.join(ROOT, 'codex-tasks');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const screenshotPath = path.join(outDir, screenshotName);
    await page.screenshot({ path: screenshotPath, fullPage: false });

    // 量測關鍵排版指標
    const metrics = await page.evaluate(() => {
      const card = document.querySelector('.card-label');
      const table = document.querySelector('#roundsTable');
      const ths = Array.from(document.querySelectorAll('thead th')).map(th => ({
        text: th.textContent.trim(),
        width: Math.round(th.getBoundingClientRect().width),
        fontSize: window.getComputedStyle(th).fontSize
      }));
      const row1 = document.querySelector('tbody tr');
      const row46 = document.querySelector('tbody tr:nth-child(46)');
      const tds = row1 ? Array.from(row1.querySelectorAll('td')).map((td, i) => ({
        idx: i,
        width: Math.round(td.getBoundingClientRect().width),
        fontSize: window.getComputedStyle(td).fontSize
      })) : [];

      const statsGrid = document.querySelector('.review-dashboard-grid');
      const recCard = document.querySelector('.review-metrics-panel');
      const vioCard = document.querySelector('#statsVioCard');

      return {
        tableWidth: table ? table.offsetWidth : 0,
        isSplit: table ? table.classList.contains('split-rounds') : false,
        row1Side: row1 ? row1.style.getPropertyValue('--round-side') : null,
        row46Side: row46 ? row46.style.getPropertyValue('--round-side') : null,
        card: card ? {
          width: Math.round(card.getBoundingClientRect().width),
          height: Math.round(card.getBoundingClientRect().height),
          fontSize: window.getComputedStyle(card).fontSize,
          fontWeight: window.getComputedStyle(card).fontWeight,
          lineHeight: window.getComputedStyle(card).lineHeight,
        } : null,
        rowHeight: row1 ? row1.offsetHeight : 0,
        statsBalance: {
          gridWidth: statsGrid ? statsGrid.offsetWidth : 0,
          recWidth: recCard ? recCard.offsetWidth : 0,
          vioWidth: vioCard ? vioCard.offsetWidth : 0,
        },
        ths,
        tds
      };
    });

    console.log(`METRICS @ ${viewportWidth}x${viewportHeight}:`, JSON.stringify(metrics, null, 2));
    console.log(`Screenshot saved to: ${screenshotPath}`);
    return metrics;
  } finally {
    await browser.close();
    server.close();
  }
}

if (require.main === module) {
  const width = parseInt(process.argv[2] || '1600', 10);
  runInspect(width, 1000, `review-${width}.png`);
}

module.exports = { runInspect };
