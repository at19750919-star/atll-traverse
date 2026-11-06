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

    const overviewPanel = await page.$('#reviewOverview');
    assert.ok(overviewPanel, '頁內牌靴總覽存在');
    assert.equal(await overviewPanel.evaluate(el => el.open), false, '牌靴總覽預設收起');

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
    assert.ok(swapBtn && swapPreview && autoColor, '換牌與編輯工具存在');
    assert.equal(autoReorder, null, '審核頁移除自動重排');

    const calcBtn = await page.$('#btnApplyTools');
    assert.ok(calcBtn, '計算工具按鈕存在');
    assert.equal(await calcBtn.evaluate(el => el.closest('.review-sidebar') !== null), true,
      '計算工具按鈕移到左側工具欄');

    const table = await page.$('#roundsTable');
    const tbody = await page.$('#roundsBody');
    assert.ok(table && tbody, '主表格與主體 tbody 存在');

    const shoeOverviewBtn = await page.$('#btnShoeOverview');
    assert.equal(shoeOverviewBtn, null, '頁首不顯示牌靴總覽按鈕');

    // 寬畫面工具在左、牌表在右；1539px 以下工具移到牌表上方。
    for (const width of [1401, 1920, 2560, 1000]) {
      await page.setViewportSize({ width, height: 884 });
      const layout = await page.evaluate(() => {
        const tool = document.querySelector('.review-toolbar').getBoundingClientRect();
        const content = document.querySelector('.review-content').getBoundingClientRect();
        const input = document.querySelector('#cutPos').getBoundingClientRect();
        const locateInput = document.querySelector('#highlightCardPos').getBoundingClientRect();
        const header = document.querySelector('.review-header').getBoundingClientRect();
        const branding = document.querySelector('.review-branding').getBoundingClientRect();
        const actions = [...document.querySelector('.review-header-actions').children]
          .filter(el => getComputedStyle(el).display !== 'none')
          .map(el => el.getBoundingClientRect());
        return {
          toolLeft: tool.left < content.left,
          columns: Math.abs(tool.top - content.top) < 2,
          sidebarWidth: Math.round(tool.width),
          inputUsable: input.width >= 70 && locateInput.width >= 70,
          headerSingleLine: actions.every(box =>
            Math.abs((box.top + box.bottom) / 2 - (branding.top + branding.bottom) / 2) < 2),
          headerNoOverlap: actions.every((box, i) =>
            i === 0 ? box.left >= branding.right + 4 : box.left >= actions[i - 1].right + 2),
          headerFits: actions.every(box => box.right <= header.right + 1),
          horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
          oldStatsGone: !document.querySelector('#reviewStatsCard'),
          singleColumn: [...document.querySelectorAll('.review-tool-group')].every(group => getComputedStyle(group).gridTemplateColumns.trim().split(/\s+/).length === 1)
        };
      });
      assert.equal(layout.columns, width >= 1540, '1539px 以下工具應移到牌表上方');
      if (width >= 1540) assert.ok(layout.toolLeft && layout.sidebarWidth === 180);
      if (width >= 1920) assert.ok(layout.headerSingleLine && layout.headerNoOverlap && layout.headerFits,
        `${width}px 頁首品牌與操作須同列、互不重疊且不超出容器: ${JSON.stringify(layout)}`);
      if (width >= 1401) assert.equal(layout.horizontalOverflow, false, `${width}px 不應橫向溢出`);
      assert.ok(layout.inputUsable && layout.oldStatsGone && (width < 1540 || layout.singleColumn), JSON.stringify({width, ...layout}));
    }
    const initialVioOpen = await page.$eval('#statsVioCard', el => el.open);
    await page.click('#statsVioCard summary');
    assert.equal(await page.$eval('#statsVioCard', el => el.open), !initialVioOpen, '違規卡可手動切換');
    await page.keyboard.press('Enter');
    assert.equal(await page.$eval('#statsVioCard', el => el.open), initialVioOpen, '違規卡可用鍵盤切換');
    await page.setViewportSize({ width: 1920, height: 1080 });

    // 切牌造成實際違規時亮紅展開；有效無違規的牌局解除並收起。
    await page.fill('#cutPos', '1');
    await cutBtn.click();
    await page.waitForFunction(() => {
      const card = document.querySelector('#statsVioCard');
      return card.open && card.classList.contains('has-violations');
    });
    const violationState = await page.$eval('#statsVioCard', el => ({
      clear: el.classList.contains('all-clear'),
      border: getComputedStyle(el).borderTopColor,
      visible: [...el.querySelectorAll('.has-violation')].some(item => getComputedStyle(item).display !== 'none')
    }));
    assert.equal(violationState.clear, false);
    assert.equal(violationState.border, 'rgb(255, 107, 94)');
    assert.equal(violationState.visible, true);
    await page.fill('#cutPos', '0');
    await cutBtn.click();
    const clearState = await page.evaluate(() => {
      const previous = currentRounds;
      try {
        const cards = [['4','♣','R'],['2','♠','R'],['4','♥','R'],['5','♦','B']]
          .map(([rank,suit,back], pos) => Object.assign(new Card(rank,suit,pos), {back_color:back}));
        currentRounds = [{start_index:0,cards,result:'閒',sensitive:true,segment:'A'}];
        DashboardUI.refreshNow();
        const card = document.querySelector('#statsVioCard');
        return { open: card.open, clear: card.classList.contains('all-clear'), red: card.classList.contains('has-violations') };
      } finally { currentRounds = previous; DashboardUI.refreshNow(); }
    });
    assert.deepEqual(clearState, {open:false,clear:true,red:false});

    // 2. 計算工具初始隱藏，開啟後仍可輸入、清空、關閉。
    console.log('Testing calculation tool modal...');
    const floatAssistant = await page.$('#floatingAssistant');
    assert.ok(floatAssistant, '計算工具浮窗已注入');
    assert.equal(await floatAssistant.isVisible(), false, '初始不可露在頁尾');
    assert.equal(await floatAssistant.evaluate(el => getComputedStyle(el).position), 'fixed');
    await calcBtn.click();
    assert.equal(await floatAssistant.isVisible(), true, '計算工具可開啟');
    await page.fill('#sim_p1', '2');
    await page.fill('#sim_b1', '3');
    await page.fill('#sim_p2', '3');
    await page.fill('#sim_b2', '2');
    assert.notEqual(await page.$eval('#sim_normal-p-points', el => el.textContent), '---', '輸入後應計算');
    await page.click('#sim_reset-btn');
    assert.equal(await page.$eval('#sim_p1', el => el.value), '', '清空會清除輸入');
    assert.equal(await page.$eval('#sim_normal-p-points', el => el.textContent), '---', '清空會重設結果');
    await page.click('#closeWidgetBtn');
    assert.equal(await floatAssistant.isVisible(), false, '關閉後不露出');

    // 3. 模擬載入牌靴資料並驗證渲染與統計 (含紅0訊號判定測試)
    console.log('Injecting mock shoe data into review page...');
    await page.evaluate(() => {
      // 構造包含紅0與非訊號A/2的牌局
      const rounds = [];
      let globalPos = 0;
      for (let i = 0; i < 60; i++) {
        const cards = [];
        if (i === 0) {
          // 第0局放入紅0 (Q♥, 10♦) 與非訊號牌 (A♣, 2♠)
          cards.push(new Card('Q', '♥', globalPos++));
          cards.push(new Card('A', '♣', globalPos++));
          cards.push(new Card('10', '♦', globalPos++));
          cards.push(new Card('2', '♠', globalPos++));
        } else {
          const ranks = ['3', '4', '5', '6', '7', '8', '9', 'J', 'K'];
          const suits = ['♠', '♥', '♣', '♦'];
          for (let c = 0; c < 4; c++) {
            cards.push(new Card(ranks[(i * 4 + c) % ranks.length], suits[(i + c) % 4], globalPos++));
          }
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

    // 驗證主表已顯示與雙欄排版
    const isTableVisible = await page.$eval('#roundsTable', el => el.style.display !== 'none');
    assert.ok(isTableVisible, '載入牌靴後主表格正常顯示');

    const rowCount = await page.$$eval('#roundsBody tr', rows => rows.length);
    assert.equal(rowCount, 60, '主表格應有 60 局');

    // 右側實際寬度決定單／雙欄，不讓牌板溢出或互撞。
    for (const width of [1280, 1401, 1540, 1920]) {
      await page.setViewportSize({ width, height: 884 });
      const tableLayout = await page.evaluate(() => {
        const table = document.querySelector('#roundsTable').getBoundingClientRect();
        const content = document.querySelector('.review-content').getBoundingClientRect();
        const first = document.querySelector('#roundsBody tr:nth-child(1)').getBoundingClientRect();
        const later = document.querySelector('#roundsBody tr:nth-child(46)').getBoundingClientRect();
        return { overflow: table.right > content.right + 1, twoColumns: later.left > first.right - 1 };
      });
      assert.equal(tableLayout.overflow, false, '主表不可溢出右欄');
      assert.equal(tableLayout.twoColumns, width >= 1280, '1280 以上皆為雙欄');
    }
    await page.setViewportSize({ width: 1920, height: 1080 });

    // 驗證紅0訊號牌樣式：Q♥, 10♦ 為紅0訊號 (.s-signal-card)，A♣, 2♠ 絕不為訊號 (.non-s-signal-card)
    const cardLabelsRound0 = await page.$$eval('#roundsBody tr:nth-child(1) .card-label', cards => {
      return cards.map(c => ({
        text: c.textContent.trim(),
        isSignal: c.classList.contains('s-signal-card'),
        isNonSignal: c.classList.contains('non-s-signal-card')
      }));
    });
    console.log('Round 0 card classes:', cardLabelsRound0);
    const qHeart = cardLabelsRound0.find(c => c.text === 'Q♥');
    const tenDiamond = cardLabelsRound0.find(c => c.text === '10♦' || c.text === 'T♦');
    const aClub = cardLabelsRound0.find(c => c.text === 'A♣');
    const twoSpade = cardLabelsRound0.find(c => c.text === '2♠');

    assert.ok(qHeart && qHeart.isSignal, 'Q♥ 必須是紅0訊號牌 (.s-signal-card)');
    assert.ok(tenDiamond && tenDiamond.isSignal, '10♦ 必須是紅0訊號牌 (.s-signal-card)');
    assert.ok(aClub && aClub.isNonSignal && !aClub.isSignal, 'A♣ 絕不可被標記為訊號牌');
    assert.ok(twoSpade && twoSpade.isNonSignal && !twoSpade.isSignal, '2♠ 絕不可被標記為訊號牌');

    // 依使用者指定的 integrated.html 字型分工驗證。
    const bodyFontFamily = await page.evaluate(() => window.getComputedStyle(document.body).fontFamily);
    console.log('Computed body font-family:', bodyFontFamily);
    assert.ok(bodyFontFamily.includes('Noto Sans TC'), 'Body 字型依 integrated 主頁使用 Noto Sans TC');

    // 頁內摘要展開報表；舊彈窗不再開啟。
    await page.click('#reviewOverview summary');
    await page.waitForFunction(() => document.querySelector('#reviewOverview')?.open && document.querySelector('#shoeOverviewMetrics')?.textContent.includes('莊6贏'));
    const inlineReport = await page.evaluate(() => ({
      open: document.querySelector('#reviewOverview').open,
      dialogOpen: document.querySelector('#shoeOverview').open,
      inside: document.querySelector('#reviewOverviewContent').contains(document.querySelector('#shoeOverviewMetrics')),
      metrics: document.querySelector('#shoeOverviewMetrics').textContent,
      meta: document.querySelector('#shoeOverviewMeta').textContent,
      recovery: document.querySelector('#shoeOverviewRecovery').textContent
    }));
    assert.equal(inlineReport.open, true);
    assert.equal(inlineReport.dialogOpen, false);
    assert.equal(inlineReport.inside, true);
    assert.ok(inlineReport.metrics.includes('莊6贏'));
    assert.ok(inlineReport.meta.includes('60 局'));
    assert.ok(inlineReport.recovery.includes('平均回復'));
    await page.click('#reviewOverview summary');
    assert.equal(await page.$eval('#reviewOverview', el => el.open), false, '牌靴總覽可收起');

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
    await page.click('#reviewOverview summary');
    await page.waitForFunction(() => document.querySelector('#shoeOverviewMeta')?.textContent.includes(`${currentRounds.filter(r => ['莊', '閒', '和'].includes(r.result)).length} 局`));
    assert.ok(await page.$eval('#shoeOverviewRecovery', el => el.textContent.includes('平均回復')), '切牌後頁內總覽仍顯示更新的分析');

    // 8. 測試卡牌高亮定位
    console.log('Testing card highlight...');
    await page.fill('#highlightCardPos', '5');
    await highlightBtn.click();
    await page.waitForTimeout(200);

    // 9. 密度選單與路單地圖鈕已移除，審核頁固定一般密度
    console.log('Testing density controls removed...');
    assert.equal(await page.$('#densityControl'), null, '密度下拉應已移除');
    assert.equal(await page.$('#btnShoeMap'), null, '路單地圖鈕應已移除');
    assert.equal(await page.$eval('body', el => el.dataset.density), 'normal', 'body 固定一般密度');

    // 10. 測試導出檔名自動處理
    console.log('Testing export filename input...');
    await page.fill('#exportFilename', 'TEST-REVIEW-001');
    const exportVal = await page.$eval('#exportFilename', el => el.value);
    assert.equal(exportVal, 'TEST-REVIEW-001', '導出檔名應可正常輸入');

    // 匯入資料與操作紀錄收合，不應讓浮窗重新露在頁尾。
    assert.equal(await floatAssistant.isVisible(), false);
    await page.click('#logHead');
    await page.click('#logHead');
    assert.equal(await floatAssistant.isVisible(), false);

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
