// Dashboard and live table-window checks. No cloud writes or user browser state.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const ROOT = path.resolve(__dirname, '..');
function dependency(name) {
  for (const base of [process.env.CODEX_NODE_MODULES, path.join(process.env.USERPROFILE || '', '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'), path.resolve(ROOT, '../百家3.0/node_modules')].filter(Boolean)) {
    try { return require(path.join(base, name)); } catch (_) {}
  }
  return require(name);
}
const { chromium } = dependency('playwright');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const target = path.resolve(ROOT, '.' + decodeURIComponent(new URL(req.url, 'http://local').pathname));
  if (!target.startsWith(ROOT + path.sep) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream' });
  res.end(fs.readFileSync(target));
});
const checks = [];
async function check(name, fn) { await fn(); checks.push(name); console.log('PASS ' + name); }
async function sameTable(page, popup) {
  const source = await page.locator('#roundsTable').innerHTML();
  await popup.waitForFunction(html => document.getElementById('roundsTable')?.innerHTML === html, source);
}
async function toolGroup(page, name) {
  await page.locator('#dashboardToolsTab').click();
  const group = page.locator(`[data-group="${name}"]`);
  if (!(await group.evaluate(el => el.open))) await group.locator('summary').click();
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 2560, height: 1080 } });
    const errors = [];
    context.on('page', p => p.on('pageerror', e => { errors.push(e.message); console.error(e.stack); }));
    await context.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
    await context.route('https://script.google.com/**', r => r.fulfill({ json: { success: true, files: [] } }));
    const dist = path.resolve(ROOT, '../百家3.0/node_modules/exceljs/dist/exceljs.min.js');
    if (fs.existsSync(dist)) await context.route('https://cdn.jsdelivr.net/npm/exceljs@*/dist/exceljs.min.js', r => r.fulfill({ path: dist, contentType: 'text/javascript' }));
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/integrated.html`);
    await page.waitForFunction(() => !!window.IntegratedModes);
    assert.deepEqual(errors, []);
    await check('設定在左、統計在右上，空牌表也能開獨立視窗', async () => {
      const side = await page.locator('.dashboard-sidebar').boundingBox();
      const stats = await page.locator('#stats').boundingBox();
      const table = await page.locator('.pit').boundingBox();
      assert(side && stats && table); assert(side.x < table.x); assert(stats.y < table.y);
      assert(await page.locator('#standardControls').isVisible());
      assert(await page.locator('#btnTableWindow').isVisible());
      assert(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight));
    });
    await check('左欄兩分頁、五組工具及原有模式適用範圍', async () => {
      await toolGroup(page, 'edit');
      assert.equal(await page.locator('.dashboard-tool-group').count(), 5);
      for (const id of ['btnRound','btnAutoReorder','btnAutoFix']) assert(await page.locator('#' + id).isVisible(), id);
      assert.equal(await page.locator('#btnApplyChanges').textContent(), '套用編輯');
      await toolGroup(page, 'cut');
      assert.equal(await page.locator('#btnRecordDeckOrder').textContent(), '記錄牌序');
      assert.equal(await page.locator('.dashboard-sidebar #clearBtn').count(), 0);
      await page.locator('#dashboardSettingsTab').click();
      assert(await page.locator('#standardControls').isVisible());
    });
    let popup;
    await check('獨立視窗只有主表，重複點擊沿用同一視窗', async () => {
      const opened = context.waitForEvent('page');
      await page.locator('#btnTableWindow').click(); popup = await opened;
      await popup.waitForSelector('#tblEmpty');
      await popup.waitForFunction(() => getComputedStyle(document.body).display === 'flex');
      assert.equal(await popup.evaluate(() => document.compatMode), 'CSS1Compat');
      assert.equal(await popup.locator('header, nav, .stats, .dashboard-sidebar, script').count(), 0);
      assert(await popup.locator('#tblEmpty').isVisible());
      await page.locator('#btnTableWindow').click();
      assert.equal(context.pages().length, 2);
    });
    await check('四個模式、清空和重新載入牌靴同步到獨立視窗', async () => {
      await page.locator('#modeTraverseA2').click();
      await toolGroup(page, 'demo');
      await page.locator('#tvDemo').click();
      await page.waitForFunction(() => !IntegratedModes.busy && currentRounds?.length > 0);
      await sameTable(page, popup);
      assert(await popup.locator('#roundsBody tr').count() > 70);
      await page.locator('#dashboardSettingsTab').click();
      assert(await page.locator('#tvControlGroups').isVisible());
      for (const id of ['modeRed0', 'modeA2', 'modeTraverse', 'modeTraverseA2']) {
        await page.locator('#' + id).click();
        await sameTable(page, popup);
        assert.equal(await popup.title(), (await page.locator('#modeStatus').textContent()) + ' · 主表');
      }
    });
    await check('416格安全切點與原分析一致，點安全格實際切牌', async () => {
      await page.waitForFunction(() => document.querySelectorAll('.cut-cell').length === 416);
      assert.equal(await page.locator('.cut-cell.safe').count(), await page.evaluate(() => IntegratedModes.traversal.analysis.count));
      assert(await page.locator('#traverseTools').isVisible());
      assert(await page.locator('#traverseDataDialog').isHidden());
      const cut = await page.evaluate(() => IntegratedModes.traversal.analysis.safe.find(n => n > 0));
      await page.locator(`.cut-cell[data-tv-cut="${cut}"]`).click();
      await page.waitForFunction(n => IntegratedModes.traversal.cut === n, cut);
      await sameTable(page, popup);
      await page.evaluate(() => IntegratedModes.cutTraverse(0));
    });
    await check('比例條顯示真實局數，長段資料過高改浮窗且不擠壓主表', async () => {
      await page.waitForFunction(() => document.getElementById('dashTotal').textContent === document.getElementById('totalRounds').textContent);
      const count = await page.evaluate(() => currentRounds.filter(r=>r.result==='莊').length);
      assert.match(await page.locator('#dashOutcomeBar').getAttribute('aria-label'), new RegExp('莊' + count + '局'));
      assert.match(await page.locator('#dashAvg').textContent(), /局/);
      const before = await page.locator('.pit').boundingBox();
      await page.locator('#traverseTools > details').last().locator('summary').click();
      assert(await page.locator('#traverseDataDialog').isVisible());
      const after = await page.locator('.pit').boundingBox();
      assert(after.height >= before.height - 2);
      await page.locator('#traverseTools > details').last().locator('summary').click();
      await page.waitForFunction(() => document.getElementById('traverseTools').parentElement.classList.contains('dashboard-traverse-slot'));
      assert(await page.locator('#traverseDataDialog').isHidden());
    });
    await check('捲動主表不移動設定和統計，表頭留在捲動區頂端', async () => {
      const before = await page.locator('#stats').boundingBox();
      const sideBefore = await page.locator('.dashboard-sidebar').boundingBox();
      const table = page.locator('.pit .table-scroll');
      await table.evaluate(el => { el.scrollTop = 600; });
      assert(await table.evaluate(el => el.scrollTop > 0));
      assert.deepEqual(await page.locator('#stats').boundingBox(), before);
      assert.deepEqual(await page.locator('.dashboard-sidebar').boundingBox(), sideBefore);
      const th = await page.locator('#roundsHead th').first().boundingBox();
      const scroll = await table.boundingBox();
      assert(Math.abs(th.y - scroll.y) < 3);
      assert(await page.evaluate(() => window.scrollY === 0));
      await table.evaluate(el => { el.scrollTop = 0; });
    });
    await check('彈窗可選牌，切牌後同步並保留彈窗捲動位置', async () => {
      await toolGroup(page, 'edit');
      for (const id of ['btnRound','btnAutoReorder','btnAutoFix']) assert(await page.locator('#' + id).isHidden(), id);
      await page.locator('#btnSwap').click();
      await popup.locator('[data-action="card"][data-r="0"][data-c="0"]').click();
      await page.waitForFunction(() => document.querySelector('[data-action="card"][data-r="0"][data-c="0"]').classList.contains('selected-first'));
      await sameTable(page, popup);
      const beforeSwap = await page.evaluate(() => JSON.stringify(currentRounds.flatMap(r=>r.cards.map(c=>[c.rank,c.suit,c.back_color]))));
      const other = await page.evaluate(() => {
        const first = currentRounds[0].cards[0];
        for (let r=0;r<currentRounds.length;r++) for(let c=0;c<currentRounds[r].cards.length;c++) {
          const card=currentRounds[r].cards[c];
          if(card.rank!==first.rank||card.suit!==first.suit)return {r,c};
        }
      });
      await popup.locator(`[data-action="card"][data-r="${other.r}"][data-c="${other.c}"]`).click();
      await page.locator('#btnSwap').click();
      assert.notEqual(await page.evaluate(() => JSON.stringify(currentRounds.flatMap(r=>r.cards.map(c=>[c.rank,c.suit,c.back_color])))),beforeSwap);
      const inventory = await page.evaluate(() => {
        const counts={};currentRounds.flatMap(r=>r.cards).forEach(c=>{const key=c.rank+c.suit+c.back_color;counts[key]=(counts[key]||0)+1;});return counts;
      });
      assert.equal(Object.keys(inventory).length,104);assert(Object.values(inventory).every(n=>n===4));
      await sameTable(page, popup);
      const scrollBefore = await popup.locator('.table-scroll').evaluate(el => { el.scrollTop = 450; return { top:el.scrollTop, height:el.clientHeight, total:el.scrollHeight }; });
      await page.evaluate(() => IntegratedModes.cutTraverse(36));
      await sameTable(page, popup);
      const scrollAfter = await popup.locator('.table-scroll').evaluate(el => ({ top:el.scrollTop, height:el.clientHeight, total:el.scrollHeight }));
      assert(scrollBefore.top > 400 && scrollAfter.top > 400, JSON.stringify({scrollBefore,scrollAfter}));
    });
    await check('一般與緊湊密度在兩邊同步，切換不改牌序', async () => {
      const signature = await page.locator('#roundsBody').textContent();
      const normal = await page.locator('#roundsBody tr').first().boundingBox();
      await popup.locator('.density-control').selectOption('compact');
      await page.waitForFunction(() => document.body.dataset.density === 'compact');
      const compact = await page.locator('#roundsBody tr').first().boundingBox();
      assert(compact.height < normal.height);
      assert.equal(await page.locator('#roundsBody').textContent(), signature);
      await page.locator('.density-control').selectOption('normal');
      await popup.waitForFunction(() => document.body.dataset.density === 'normal');
    });
    await check('關閉後可重開；清空也同步；瀏覽器阻擋彈窗時顯示提示', async () => {
      await popup.close();
      const reopened = context.waitForEvent('page');
      await page.locator('#btnTableWindow').click(); popup = await reopened;
      await sameTable(page, popup);
      await page.locator('#chipClear').click();
      await popup.waitForFunction(() => getComputedStyle(document.getElementById('tblEmpty')).display !== 'none');
      assert(await popup.locator('#roundsTable').isHidden());
      await popup.close();
      await page.evaluate(() => { window.__openForTest = window.open; window.open = () => null; });
      await page.locator('#btnTableWindow').click();
      assert.match(await page.locator('#tableWindowStatus').textContent(), /允許.*彈出/);
      await page.evaluate(() => { window.open = window.__openForTest; });
    });
    await check('桌面與手機不整頁水平溢出，訊號與各模式設定仍可操作', async () => {
      for (const width of [1920, 1280, 1024, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await page.locator('#dashboardSettingsTab').click();
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'overflow ' + width);
        await page.locator('#sharedSignalSettings').click();
        assert(await page.locator('#pSet').isVisible());
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'signal overflow ' + width);
        await page.locator('#sharedSignalSettings').click();
      }
    });
    if (process.env.DASHBOARD_SCREENSHOT) {
      await page.setViewportSize({ width: 2560, height: 1080 });
      await toolGroup(page, 'demo'); await page.locator('#tvDemo').click();
      await page.waitForFunction(() => !IntegratedModes.busy && currentRounds?.length > 0);
      await page.locator('#dashboardSettingsTab').click();
      await page.waitForFunction(() => document.querySelectorAll('.cut-cell').length === 416);
      const recovered = context.waitForEvent('page');
      await page.locator('#btnTableWindow').click(); const recoveredWindow = await recovered;
      await recoveredWindow.waitForSelector('#roundsBody tr');
      await recoveredWindow.close();
      await page.locator('#fanStage').evaluate(async el => { await Promise.all(el.getAnimations({subtree:true}).map(a=>a.finished)); });
      await page.screenshot({ path: process.env.DASHBOARD_SCREENSHOT, scale: 'css' });
    }
    await check('直接開HTML仍可使用；關閉原頁會關閉其獨立牌表視窗', async () => {
      const filePage = await context.newPage();
      await filePage.goto(require('node:url').pathToFileURL(path.join(ROOT,'integrated.html')).href);
      await filePage.waitForFunction(() => !!window.DashboardUI);
      const opening = context.waitForEvent('page');
      await filePage.locator('#btnTableWindow').click(); const fileWindow = await opening;
      await fileWindow.waitForFunction(() => getComputedStyle(document.body).display === 'flex');
      assert.equal(await fileWindow.evaluate(() => document.compatMode),'CSS1Compat');
      const closed = fileWindow.waitForEvent('close');await filePage.close();await closed;
    });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: checks.length, pageErrors: errors }));
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(e => { console.error(e); process.exitCode = 1; server.close(); });
