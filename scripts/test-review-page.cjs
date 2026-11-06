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
    return;
  }
  res.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream' });
  res.end(fs.readFileSync(target));
});

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

  try {
    console.log(`Navigating to http://127.0.0.1:${port}/review.html ...`);
    await page.goto(`http://127.0.0.1:${port}/review.html`);
    await page.waitForLoadState('networkidle');

    // 1. 檢查 10 大核心功能元素
    console.log('Checking 10 key features presence...');
    const importBtn = await page.$('#btnImport');
    const importInput = await page.$('#importFileInput');
    assert.ok(importBtn && importInput, '匯入按鈕與檔案輸入框存在');

    const exportBtn = await page.$('#btnExportCombined');
    const exportFilename = await page.$('#exportFilename');
    assert.ok(exportBtn && exportFilename, '導出按鈕與導出檔名欄位存在');

    const avgEl = await page.$('#dashAvg');
    const maxEl = await page.$('#dashMax');
    const distEl = await page.$('#dashRecoveryBars');
    assert.ok(avgEl && maxEl && distEl, '回復統計與分佈容器存在');

    const vioCard = await page.$('#statsVioCard');
    const vioEmpty = await page.$('#vioEmpty');
    assert.ok(vioCard && vioEmpty, '違規審核面板與目前無違規卡片存在');

    const cutBtn = await page.$('#btnCut');
    const cutPos = await page.$('#cutPos');
    const recordBtn = await page.$('#btnRecordDeckOrder');
    const highlightBtn = await page.$('#btnHighlightCard');
    assert.ok(cutBtn && cutPos && recordBtn && highlightBtn, '切牌與定位元件存在');

    const roundBtn = await page.$('#btnRound');
    assert.ok(roundBtn, '換局按鈕存在');

    const swapBtn = await page.$('#btnSwap');
    const swapPreview = await page.$('#toggleSwapPreview');
    const autoReorder = await page.$('#btnAutoReorder');
    const autoColor = await page.$('#btnAutoColor');
    assert.ok(swapBtn && swapPreview && autoReorder && autoColor, '換牌與編輯工具存在');

    const calcBtn = await page.$('#btnApplyTools');
    assert.ok(calcBtn, '計算工具按鈕存在');

    const table = await page.$('#roundsTable');
    const tbody = await page.$('#roundsBody');
    assert.ok(table && tbody, '主表格與主體 tbody 存在');

    const shoeOverviewBtn = await page.$('#btnShoeOverview');
    assert.ok(shoeOverviewBtn, '牌靴總覽按鈕已被 shoe-overview.js 成功生成');

    // 2. 測試計算工具彈出
    console.log('Testing calculation tool modal...');
    await calcBtn.click();
    await page.waitForTimeout(100);
    const floatAssistant = await page.$('#floatingAssistant');
    assert.ok(floatAssistant, '計算工具浮窗已注入');
    const isVisible = await floatAssistant.isVisible();
    assert.ok(isVisible, '計算工具浮窗已開啟可見');

    // 關閉計算工具
    const closeWidgetBtn = await page.$('#closeWidgetBtn');
    if (closeWidgetBtn) await closeWidgetBtn.click();

    // 3. 模擬載入牌靴資料並驗證渲染與統計
    console.log('Injecting mock shoe data into review page...');
    await page.evaluate(() => {
      // 構造簡單合法牌局
      const suits = ['♠', '♥', '♣', '♦'];
      const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
      const rounds = [];
      let globalPos = 0;
      for (let i = 0; i < 60; i++) {
        const cards = [];
        for (let c = 0; c < 4; c++) {
          cards.push(new Card(ranks[(i * 4 + c) % 13], suits[(i + c) % 4], globalPos++));
        }
        const pTotal = (cards[0].point() + cards[2].point()) % 10;
        const bTotal = (cards[1].point() + cards[3].point()) % 10;
        const res = pTotal > bTotal ? '閒' : pTotal < bTotal ? '莊' : '和';
        rounds.push({
          start_index: cards[0].pos,
          cards: cards,
          result: res,
          sensitive: true,
          segment: 'A'
        });
      }
      currentRounds = rounds;
      window.__importedShoeMode = false;
      refreshAnalysisAndRender();
      window.DashboardUI.refreshNow();
      setEditButtonsAvailability(true);
      document.dispatchEvent(new Event('shoe-generated'));
    });

    await page.waitForTimeout(300);

    // 驗證主表已顯示
    const isTableVisible = await page.$eval('#roundsTable', el => el.style.display !== 'none');
    assert.ok(isTableVisible, '載入牌靴後主表格正常顯示');

    const rowCount = await page.$$eval('#roundsBody tr', rows => rows.length);
    assert.equal(rowCount, 60, '主表格應有 60 局');

    // 驗證回復統計已計算
    const avgText = await page.$eval('#dashAvg', el => el.textContent);
    assert.notEqual(avgText, '—', '平均回復局數應已計算並顯示');

    // 驗證總局數
    const totalRoundsText = await page.$eval('#dashTotal', el => el.textContent);
    assert.equal(totalRoundsText, '60', '總局數應為 60');

    // 4. 測試牌靴總覽彈窗
    console.log('Testing opening Shoe Overview modal with shoe data...');
    const debugInfo = await page.evaluate(() => {
      return {
        hasCurrentRounds: typeof currentRounds !== 'undefined',
        currentRoundsLen: typeof currentRounds !== 'undefined' && currentRounds ? currentRounds.length : null,
        bodyClasses: document.body.className,
        btnDisabled: document.getElementById('btnShoeOverview')?.disabled
      };
    });
    console.log('Debug info before click:', debugInfo);
    await shoeOverviewBtn.click();
    console.log('Errors caught so far:', errors);
    await page.waitForTimeout(300);
    const dialogOpen = await page.$eval('#shoeOverview', el => el.open);
    assert.ok(dialogOpen, '牌靴總覽彈窗已成功開啟');

    const overviewMetrics = await page.$eval('#shoeOverviewMetrics', el => el.textContent);
    assert.ok(overviewMetrics.includes('莊6贏'), '牌靴總覽內含莊6贏指標');

    // 關閉牌靴總覽
    await page.click('#shoeOverviewClose');
    await page.waitForTimeout(100);
    const dialogClosed = await page.$eval('#shoeOverview', el => !el.open);
    assert.ok(dialogClosed, '牌靴總覽彈窗已成功關閉');

    // 5. 測試換牌模式激活
    console.log('Testing swap card activation...');
    await swapBtn.click();
    const isSwapActive = await page.$eval('#btnSwap', el => el.classList.contains('active'));
    assert.ok(isSwapActive, '換牌按鈕進入 active 狀態');
    await page.click('#btnCancelEdit');

    // 6. 測試換局模式激活
    console.log('Testing swap round activation...');
    await roundBtn.click();
    const isRoundActive = await page.$eval('#btnRound', el => el.classList.contains('active'));
    assert.ok(isRoundActive, '換局按鈕進入 active 狀態');
    await page.click('#btnCancelEdit');

    // 7. 測試記錄牌序與切牌
    console.log('Testing deck order record and cutting...');
    await recordBtn.click();
    await page.fill('#cutPos', '12');
    await cutBtn.click();
    await page.waitForTimeout(200);
    const cutRowCount = await page.$$eval('#roundsBody tr', rows => rows.length);
    assert.ok(cutRowCount > 0, '切牌後應重新渲染牌桌');

    // 8. 測試卡牌高亮定位
    console.log('Testing card highlight...');
    await page.fill('#highlightCardPos', '5');
    await highlightBtn.click();
    await page.waitForTimeout(200);

    // 9. 測試密度切換
    console.log('Testing density toggle...');
    await page.selectOption('#densityControl', 'compact');
    const bodyDensity = await page.$eval('body', el => el.dataset.density);
    assert.equal(bodyDensity, 'compact', 'body 應切換為 compact 密度');

    // 10. 測試導出檔名自動處理
    console.log('Testing export filename input...');
    await page.fill('#exportFilename', 'TEST-REVIEW-001');
    const exportVal = await page.$eval('#exportFilename', el => el.value);
    assert.equal(exportVal, 'TEST-REVIEW-001', '導出檔名應可正常輸入');

    // 11. 驗證無致命報錯
    const fatalErrors = errors.filter(e => !e.includes('favicon') && !e.includes('net::ERR_'));
    if (fatalErrors.length > 0) {
      console.error('Page errors encountered:', fatalErrors);
    }
    assert.equal(fatalErrors.length, 0, `頁面不應有重大錯誤: ${fatalErrors.join(', ')}`);

    console.log('🎉 ALL INTEGRATION TESTS PASSED PERFECTLY!');
  } finally {
    await browser.close();
    server.close();
  }
})();
