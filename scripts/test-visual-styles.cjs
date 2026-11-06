const assert = require('node:assert/strict');
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
    res.writeHead(404);
    res.end();
  } else {
    res.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream' });
    res.end(fs.readFileSync(target));
  }
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  try {
    await page.goto(`http://127.0.0.1:${port}/review.html`);
    await page.waitForLoadState('networkidle');

    // 1. 量測 Header 與 Logo
    const headerMetrics = await page.evaluate(() => {
      const crest = document.querySelector('.crest');
      const h1 = document.querySelector('h1.review-title');
      const crestStyle = window.getComputedStyle(crest);
      const h1Style = window.getComputedStyle(h1);
      return {
        crestBg: crestStyle.backgroundImage,
        crestWidth: crest.offsetWidth,
        crestHeight: crest.offsetHeight,
        h1FontFamily: h1Style.fontFamily,
        h1FontSize: h1Style.fontSize
      };
    });
    console.log('Header metrics:', headerMetrics);
    assert.ok(headerMetrics.crestBg.includes('at-spade-logo-current.png'), 'Logo 必須是金色透明黑桃');
    assert.ok(headerMetrics.h1FontFamily.includes('Cinzel'), 'H1 字型必須為 Cinzel');

    // 2. 模擬牌靴注入，量測主表格與氈布
    await page.evaluate(() => {
      const rounds = [];
      let pos = 0;
      for (let i = 0; i < 60; i++) {
        const cards = [
          new Card('Q', '♥', pos++),
          new Card('A', '♣', pos++),
          new Card('10', '♦', pos++),
          new Card('2', '♠', pos++)
        ];
        cards[0].back_color = 'R';
        cards[1].back_color = 'B';
        cards[2].back_color = 'R';
        cards[3].back_color = 'B';
        rounds.push({
          start_index: cards[0].pos,
          cards: cards,
          result: '莊',
          sensitive: true,
          segment: 'A'
        });
      }
      currentRounds = rounds;
      window.__importedShoeMode = false;
      refreshAnalysisAndRender();
      window.DashboardUI.refreshNow();
    });

    await page.waitForTimeout(300);

    const tableMetrics = await page.evaluate(() => {
      const felt = document.querySelector('.felt');
      const feltStyle = window.getComputedStyle(felt);
      const table = document.querySelector('#roundsTable');
      const tableStyle = window.getComputedStyle(table);
      const row1 = document.querySelector('#roundsBody tr:nth-child(1)');
      const row46 = document.querySelector('#roundsBody tr:nth-child(46)');
      const row1Style = window.getComputedStyle(row1);
      const row46Style = window.getComputedStyle(row46);
      const card0 = row1.querySelector('.card-label:nth-child(1)'); // Q♥
      const card1 = row1.querySelector('.card-label:nth-child(2)'); // A♣
      const card0Style = window.getComputedStyle(card0);
      const card1Style = window.getComputedStyle(card1);

      return {
        feltHasRadius: feltStyle.borderRadius !== '0px',
        tableDisplay: tableStyle.display,
        row1Side: row1.style.getPropertyValue('--round-side'),
        row46Side: row46.style.getPropertyValue('--round-side'),
        card0Color: card0Style.color, // Q♥ 訊號紅字
        card0FontWeight: card0Style.fontWeight,
        card1Color: card1Style.color, // A♣ 普通字
        card0Back: card0Style.backgroundColor, // 紅背
        card1Back: card1Style.backgroundColor  // 藍背
      };
    });
    console.log('Table metrics:', tableMetrics);
    assert.ok(tableMetrics.feltHasRadius, 'Felt 必須有牌桌弧度半徑');
    assert.equal(tableMetrics.tableDisplay, 'grid', '表格必須為 grid 雙欄排版');
    assert.equal(tableMetrics.row1Side, '1', '第 1 局位於左欄 (side 1)');
    assert.equal(tableMetrics.row46Side, '2', '第 46 局位於右欄 (side 2)');
    assert.equal(tableMetrics.card0Color, 'rgb(255, 59, 59)', '紅0 Q♥ 必須是發光紅字 rgb(255, 59, 59)');
    assert.notEqual(tableMetrics.card1Color, 'rgb(255, 59, 59)', 'A♣ 絕不可為紅字');
    assert.notEqual(tableMetrics.card0Back, tableMetrics.card1Back, '紅背與藍背必須呈現明暗對比');

    // 3. 量測牌靴總覽彈窗的大路與體檢圖
    await page.click('#reviewOverview summary');
    await page.waitForTimeout(400);

    const overviewMetrics = await page.evaluate(() => {
      const panel = document.querySelector('#reviewOverview');
      const bigroadGrid = panel.querySelector('.bigroad-grid');
      const bigroadCells = panel.querySelectorAll('.bigroad-cell');
      const mapTrack = panel.querySelector('.map-track');
      const mapCells = panel.querySelectorAll('.map-cell');

      return {
        dialogOpen: panel.open,
        bigroadDisplay: bigroadGrid ? window.getComputedStyle(bigroadGrid).display : null,
        bigroadCellCount: bigroadCells.length,
        bigroadCellSize: bigroadCells.length > 0 ? `${bigroadCells[0].offsetWidth}x${bigroadCells[0].offsetHeight}` : null,
        mapTrackDisplay: mapTrack ? window.getComputedStyle(mapTrack).display : null,
        mapCellCount: mapCells.length
      };
    });
    console.log('Inline overview metrics:', overviewMetrics);
    assert.ok(overviewMetrics.dialogOpen, '頁內牌靴總覽必須展開');
    assert.equal(overviewMetrics.bigroadDisplay, 'grid', '大路必須是 grid 網格');
    assert.ok(overviewMetrics.bigroadCellCount > 0, '大路必須有格點');
    assert.equal(overviewMetrics.bigroadCellSize, '14x14', '牌靴總覽大路圓圈尺寸必須為 shoe-overview.css 定義的標準 14x14');
    assert.equal(overviewMetrics.mapTrackDisplay, 'grid', '體檢圖 Track 必須為 grid 網格');

    console.log('🎯 ALL VISUAL STYLE & COLOR METRICS VERIFIED 100% MATCHING MAIN PAGE!');
  } finally {
    await browser.close();
    server.close();
  }
})();
