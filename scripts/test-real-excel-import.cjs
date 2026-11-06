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
const ExcelJS = dependency('exceljs');
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

async function createSampleExcelBuffer() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('原始數據');
  ws.addRow(['局數', '段標', '色序', '卡片1', '卡片2', '卡片3', '卡片4', '閒家', '莊家', '結果', '訊號']);

  // 加入 50 局資料，第一局包含紅0 (Q♥, 10♦)，色序全部採用標準紅0卡色 BBBR / RRRB
  for (let i = 1; i <= 50; i++) {
    const color = i % 2 === 0 ? 'BBBR' : 'RRRB';
    if (i === 1) {
      ws.addRow([1, 'A', 'RRRB', 'Q♥', 'A♣', '10♦', '2♠', 'Q♥ 10♦', 'A♣ 2♠', '閒', 'S']);
    } else {
      const suits = ['♠', '♥', '♣', '♦'];
      const ranks = ['3', '4', '5', '6', '7', '8', '9', 'J', 'K'];
      const c1 = `${ranks[(i * 4) % ranks.length]}${suits[i % 4]}`;
      const c2 = `${ranks[(i * 4 + 1) % ranks.length]}${suits[(i + 1) % 4]}`;
      const c3 = `${ranks[(i * 4 + 2) % ranks.length]}${suits[(i + 2) % 4]}`;
      const c4 = `${ranks[(i * 4 + 3) % ranks.length]}${suits[(i + 3) % 4]}`;
      ws.addRow([i, 'A', color, c1, c2, c3, c4, `${c1} ${c3}`, `${c2} ${c4}`, i % 2 === 0 ? '莊' : '閒', '']);
    }
  }

  const tmpPath = path.join(ROOT, 'temp-test-shoe.xlsx');
  await wb.xlsx.writeFile(tmpPath);
  return tmpPath;
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  const testXlsxPath = await createSampleExcelBuffer();

  try {
    console.log(`Navigating to http://127.0.0.1:${port}/review.html ...`);
    await page.goto(`http://127.0.0.1:${port}/review.html`);
    await page.waitForLoadState('networkidle');

    console.log('Testing import button menu popup...');
    const importBtn = await page.$('#btnImport');
    assert.ok(importBtn, '匯入按鈕存在');

    await importBtn.click();
    await page.waitForTimeout(100);

    const importMenu = await page.$('#importMenu');
    assert.ok(importMenu, '點擊匯入後，#importMenu 選單應順利彈出');

    const menuBtns = await page.$$eval('#importMenu button', btns => btns.map(b => b.textContent.trim()));
    console.log('Import menu buttons:', menuBtns);
    assert.ok(menuBtns.includes('本機檔案'), '選單應包含「本機檔案」');
    assert.ok(menuBtns.includes('Google 雲端'), '選單應包含「Google 雲端」');

    // 模擬上傳真實 xlsx 檔案
    console.log(`Setting input files to ${testXlsxPath}...`);
    const fileInput = await page.$('#importFileInput');
    await fileInput.setInputFiles(testXlsxPath);

    // 等待匯入解析完成
    console.log('Waiting for import process and feedback...');
    await page.waitForFunction(() => {
      const fb = document.getElementById('importFeedback');
      return fb && (fb.dataset.state === 'success' || fb.dataset.state === 'warning');
    }, { timeout: 10000 });

    const statusTitle = await page.$eval('#importStatusTitle', el => el.textContent);
    console.log('Import finished with title:', statusTitle);
    assert.ok(statusTitle.includes('匯入完成') || statusTitle.includes('已載入'), '狀態應為匯入完成');

    // 驗證主表格已渲染
    const isTableVisible = await page.$eval('#roundsTable', el => el.style.display !== 'none');
    assert.ok(isTableVisible, '匯入完成後主表格應呈現顯示狀態');

    const rowCount = await page.$$eval('#roundsBody tr', rows => rows.length);
    console.log('Rendered row count:', rowCount);
    assert.equal(rowCount, 50, '應成功載入並渲染 50 局');

    // 驗證紅0訊號
    const cardLabelsRound0 = await page.$$eval('#roundsBody tr:nth-child(1) .card-label', cards => {
      return cards.map(c => ({
        text: c.textContent.trim(),
        isSignal: c.classList.contains('s-signal-card')
      }));
    });
    console.log('Round 0 card classes after Excel import:', cardLabelsRound0);
    const qHeart = cardLabelsRound0.find(c => c.text === 'Q♥');
    const aClub = cardLabelsRound0.find(c => c.text === 'A♣');
    assert.ok(qHeart && qHeart.isSignal, 'Q♥ 在匯入後必須是紅0訊號牌');
    assert.ok(aClub && !aClub.isSignal, 'A♣ 絕不可被標記為訊號牌');

    // 驗證回復統計有值
    const avgText = await page.$eval('#dashAvg', el => el.textContent);
    console.log('Avg recovery text after import:', avgText);
    assert.notEqual(avgText, '—', '平均回復應成功計算');

    const totalText = await page.$eval('#dashTotal', el => el.textContent);
    assert.equal(totalText, '50', '總局數應為 50');

    // 驗證違規卡片項目完全參照主頁 5 項標準，且卡色無誤判
    const vioItems = await page.$$eval('#violationsGrid .vio', els => els.map(e => ({
      name: e.querySelector('.v-name')?.textContent.trim(),
      val: e.querySelector('.v-val')?.textContent.trim()
    })));
    console.log('Violation items after import:', vioItems);
    assert.equal(vioItems.length, 5, '違規項目卡片必須為主頁標準 5 項');
    assert.deepEqual(vioItems.map(v => v.name), ['訊號牌違規', '連5局4張', '連莊閒', '無法對調', '其他違規']);
    const otherVio = vioItems.find(v => v.name === '其他違規');
    assert.ok(otherVio && !otherVio.val.includes('卡色'), '標準紅0卡色絕不可誤判為卡色違規');

    // 驗證無重大錯誤
    const fatalErrors = errors.filter(e => !e.includes('favicon') && !e.includes('net::ERR_'));
    if (fatalErrors.length > 0) {
      console.error('Fatal errors during import:', fatalErrors);
    }
    assert.equal(fatalErrors.length, 0, `匯入流程不應拋出重大錯誤: ${fatalErrors.join(', ')}`);

    console.log('🎉 REAL EXCEL IMPORT TEST PASSED 100%!');
  } finally {
    if (fs.existsSync(testXlsxPath)) {
      try { fs.unlinkSync(testXlsxPath); } catch (_) {}
    }
    await browser.close();
    server.close();
  }
})();
