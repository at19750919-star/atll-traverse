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

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  try {
    await page.goto(`http://127.0.0.1:${port}/review.html`);
    await page.waitForLoadState('networkidle');

    // 模擬完全無違規的牌靴 (莊閒交替，前局紅0後局開莊，標準卡色BBBR/RRRB，4~6張局交替)
    await page.evaluate(() => {
      const rounds = [];
      let pos = 0;
      for (let i = 1; i <= 60; i++) {
        const isB = i % 2 === 0;
        const cards = [];
        // 偶數局放入紅0，讓下一局開莊
        if (i % 2 === 1) {
          cards.push(new Card('Q', '♥', pos++, 'B'));
          cards.push(new Card('10', '♦', pos++, 'B'));
          cards.push(new Card('5', '♣', pos++, 'B'));
          cards.push(new Card('6', '♦', pos++, 'R'));
        } else {
          cards.push(new Card('3', '♠', pos++, 'B'));
          cards.push(new Card('4', '♥', pos++, 'B'));
          cards.push(new Card('5', '♣', pos++, 'B'));
          cards.push(new Card('7', '♦', pos++, 'R'));
        }
        rounds.push({
          start_index: cards[0].pos,
          cards,
          result: isB ? '莊' : '閒',
          sensitive: true,
          segment: 'A'
        });
      }
      currentRounds = rounds;
      window.__importedShoeMode = true; // 外部合格牌靴審核
      refreshAnalysisAndRender();
      if (window.DashboardUI) window.DashboardUI.refreshNow();
    });

    await page.waitForTimeout(500);

    const outDir = path.join(ROOT, 'codex-tasks');
    const screenshotPath = path.join(outDir, 'review-all-clear.png');
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`Saved screenshot to: ${screenshotPath}`);
  } finally {
    await browser.close();
    server.close();
  }
})();
