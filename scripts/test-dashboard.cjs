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
      assert.equal(await page.locator('body > header .chip-col .chip').count(),3);
      assert.equal(await page.locator('.dashboard-sidebar .chip-col').count(),0);
      assert(await page.evaluate(()=>['.dashboard-sidebar','.dashboard-sidebar-scroll','.dashboard-progress','#fanStage'].every(s=>{
        const el=document.querySelector(s),style=getComputedStyle(el);
        return style.overflowY==='visible'&&style.overflowX==='visible'&&el.scrollHeight<=el.clientHeight+1;
      })),'left column must grow naturally without its own scroll containers');
      assert(await page.locator('#standardControls').isVisible());
      assert(await page.locator('#btnTableWindow').isVisible());
      assert(await page.evaluate(() => getComputedStyle(document.body).overflowY === 'visible' && getComputedStyle(document.querySelector('.table-scroll')).overflow === 'visible'));
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
      await popup.waitForFunction(() => getComputedStyle(document.body).display === 'block');
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
      assert(await page.locator('#traverseTools').isVisible(),JSON.stringify(await page.evaluate(()=>['.dashboard-overview','.dashboard-workspace','#stats','#traverseTools','#tvSafeCuts'].map(s=>{const e=document.querySelector(s);return {s,height:e.getBoundingClientRect().height,display:getComputedStyle(e).display};}))));
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
      assert.equal(await page.locator('#dashAvg').textContent(), (await page.evaluate(() => IntegratedModes.traversal.analysis.count)) + ' 點');
      assert.equal(await page.locator('#dashDistTitle').textContent(), '違規深度分布');
      const before = await page.locator('.pit').boundingBox();
      await page.locator('#tvDiagnosticsPanel > summary').click();
      await page.locator('#traverseDataDialog').waitFor({state:'visible'});
      assert(await page.locator('#traverseDataDialog').isVisible());
      const after = await page.locator('.pit').boundingBox();
      assert(after.height >= before.height - 2);
      await page.locator('#tvDiagnosticsPanel > summary').click();
      await page.waitForFunction(() => document.getElementById('traverseTools').parentElement.classList.contains('dashboard-traverse-slot'));
      assert(await page.locator('#traverseDataDialog').isHidden());
    });
    await check('在主表滾輪帶動整頁，表頭貼在視窗頂端且沒有內部捲軸', async () => {
      await page.evaluate(()=>scrollTo(0,0));
      const before = await page.locator('#stats').boundingBox();
      const sideBefore = await page.locator('.dashboard-sidebar').boundingBox();
      const table = page.locator('.pit .table-scroll');
      const tableBox=await table.boundingBox();
      await page.mouse.move(tableBox.x+40,tableBox.y+80);await page.mouse.wheel(0,600);
      await page.waitForFunction(()=>scrollY>0);
      const pageY=await page.evaluate(()=>scrollY);
      assert(await table.evaluate(el=>el.scrollTop===0&&el.scrollHeight<=el.clientHeight+1&&el.scrollWidth<=el.clientWidth+1));
      assert(Math.abs((await page.locator('#stats').boundingBox()).y-(before.y-pageY))<2);
      assert(Math.abs((await page.locator('.dashboard-sidebar').boundingBox()).y-(sideBefore.y-pageY))<2);
      const th = await page.locator('#roundsHead th').first().boundingBox();
      assert(Math.abs(th.y)<3);
      await page.evaluate(()=>scrollTo(0,0));
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
      await popup.setViewportSize({width:700,height:700});
      const scrollBefore = await popup.evaluate(() => { scrollTo(180,450); return { left:scrollX,top:scrollY,height:innerHeight,total:document.scrollingElement.scrollHeight }; });
      await page.evaluate(() => IntegratedModes.cutTraverse(36));
      await sameTable(page, popup);
      const scrollAfter = await popup.evaluate(() => ({ left:scrollX,top:scrollY,height:innerHeight,total:document.scrollingElement.scrollHeight }));
      assert(scrollBefore.top > 400 && scrollAfter.top > 400, JSON.stringify({scrollBefore,scrollAfter}));
      assert(scrollBefore.left>0&&scrollAfter.left===scrollBefore.left,JSON.stringify({scrollBefore,scrollAfter}));
      assert(await popup.locator('.table-scroll').evaluate(e=>getComputedStyle(e).overflow==='visible'&&e.scrollHeight<=e.clientHeight+1&&e.scrollWidth<=e.clientWidth+1));
      await popup.setViewportSize({width:1280,height:900});
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
    await check('短視窗完整牌表隨整頁延伸，設定可達且訊號牌不超框', async () => {
      // Regression: the user's 2561×908 capture is a 1791×636 CSS viewport.
      // A large body font also catches accidental dependence on browser defaults.
      await page.addStyleTag({ content: 'body{font-size:20px}' });
      for (const [width,height] of [[1791,636],[1707,605],[1920,720],[1280,720],[1024,768]]) {
        await page.setViewportSize({width,height});
        await page.locator('#dashboardSettingsTab').click();
        await page.locator('.pit .table-scroll').evaluate(e=>{e.scrollTop=0;});
        await page.evaluate(()=>window.scrollTo(0,0));
        const geometry = await page.evaluate(()=>{
          const box=s=>document.querySelector(s).getBoundingClientRect();
          const table=box('.pit .table-scroll'),head=box('#roundsHead'),row=box('#roundsBody tr');
          const side=box('.dashboard-sidebar-scroll'),signal=box('.signal');
          const last=box('#roundsBody tr:last-child'),container=document.querySelector('.pit .table-scroll');
          return {allRowsContained:last.bottom<=table.bottom+1&&container.scrollHeight<=container.clientHeight+1&&container.scrollWidth<=container.clientWidth+1,tableHeight:table.height,sideHeight:side.height,
            areas:['header','.dashboard-layout','.dashboard-overview','#stats','#statsVioCard','.dashboard-table-bar','.pit','.felt-head','.logbox','#roundsBody tr'].map(s=>({s,height:box(s).height,y:box(s).y})),
            signalContained:[...document.querySelectorAll('.signal .mini-card')].every(e=>{const r=e.getBoundingClientRect();return r.top>=signal.top&&r.bottom<=signal.bottom&&r.left>=signal.left&&r.right<=signal.right;}),
            actionsContained:[...document.querySelectorAll('.chip-col .chip')].every(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}),
            pageCanGrow:getComputedStyle(document.body).overflowY!=='hidden'&&document.documentElement.scrollHeight>innerHeight};
        });
        assert(geometry.allRowsContained,JSON.stringify({width,height,...geometry}));
        assert(geometry.sideHeight>=230,JSON.stringify({width,height,...geometry}));
        assert(geometry.signalContained&&geometry.actionsContained&&geometry.pageCanGrow,JSON.stringify({width,height,...geometry}));
        await page.locator('#tvSecond').scrollIntoViewIfNeeded();
        assert(await page.locator('#tvSecond').isVisible());
        await page.locator('#dashboardSettingsTab').click();
      }
      await page.setViewportSize({width:2560,height:1080});
    });
    await check('整頁可捲到主表最後一局與日誌，主表沒有隱藏捲動區', async () => {
      await page.setViewportSize({width:1791,height:636});
      await page.locator('#logHead').scrollIntoViewIfNeeded();
      const pageY=await page.evaluate(()=>scrollY);
      assert(pageY>0,'page must scroll to content below the viewport');
      const table=page.locator('.pit .table-scroll');
      await table.evaluate(e=>{e.scrollTop=700;});
      assert(await table.evaluate(e=>e.scrollTop===0&&e.scrollHeight<=e.clientHeight+1));
      assert.equal(await page.evaluate(()=>scrollY),pageY);
      await page.locator('#roundsBody tr').last().scrollIntoViewIfNeeded();
      const last=await page.locator('#roundsBody tr').last().boundingBox();
      assert(last.y>=0&&last.y+last.height<=636);
      await page.keyboard.press('Control+Home');
      await page.setViewportSize({width:2560,height:1080});
    });
    await check('路單與日誌自然展開，不遮住或縮小主表', async () => {
      await page.setViewportSize({width:1791,height:636});
      const before=await page.locator('.pit .table-scroll').evaluate(e=>e.clientHeight);
      await toolGroup(page,'analysis');
      await page.locator('#btnShoeMap').click();
      const {road,pit}=await page.evaluate(()=>({road:document.querySelector('#shoeMap').getBoundingClientRect().toJSON(),pit:document.querySelector('.pit').getBoundingClientRect().toJSON()}));
      assert(road.height>0&&road.y+road.height<=pit.y+1,JSON.stringify({road,pit,state:await page.locator('#shoeMap').getAttribute('class')}));
      assert.equal(await page.locator('.pit .table-scroll').evaluate(e=>e.clientHeight),before);
      await page.locator('#btnShoeMap').click();
      await page.locator('#logHead').click();
      const {log,table}=await page.evaluate(()=>({log:document.querySelector('.logbox').getBoundingClientRect().toJSON(),table:document.querySelector('.pit').getBoundingClientRect().toJSON()}));
      assert(log.y>=table.y+table.height,'log must be below the table');
      assert.equal(await page.locator('.pit .table-scroll').evaluate(e=>e.clientHeight),before);
      await page.locator('#logHead').click();
      await page.keyboard.press('Control+Home');
      await page.setViewportSize({width:2560,height:1080});
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
        assert(await page.evaluate(()=>['.dashboard-sidebar-scroll','.dashboard-progress','#fanStage'].every(s=>{
          const el=document.querySelector(s),style=getComputedStyle(el);
          return style.overflowY==='visible'&&style.overflowX==='visible'&&el.scrollHeight<=el.clientHeight+1;
        })),'left column must not scroll internally at width '+width);
        await page.locator('#sharedSignalSettings').click();
      }
    });
    await check('自訂全部十三種訊號牌或清空時，訊號卡與張數仍留在左欄', async () => {
      await page.locator('#modeRed0').click();
      for (const width of [1791,390]) {
        await page.setViewportSize({width,height:720});
        await page.locator('#dashboardSettingsTab').click();
        await page.locator('#sharedSignalSettings').click();
        for(const pick of await page.locator('.suit-button,.rank-button').all()) {
          if(!await pick.evaluate(e=>e.classList.contains('selected'))) await pick.click();
        }
        assert.equal(await page.locator('#fanStage .mini-card').count(),13);
        assert.match(await page.locator('#formula').textContent(),/416/);
        assert(await page.evaluate(()=>{
          const s=document.querySelector('.signal').getBoundingClientRect(),f=document.querySelector('#fanStage').getBoundingClientRect(),n=document.querySelector('#formula').getBoundingClientRect();
          return f.right<=s.right&&n.right<=s.right&&document.documentElement.scrollWidth<=innerWidth;
        }),'all ranks must not push the count out of the signal panel');
        for(const pick of await page.locator('.rank-button').all()) {
          if(await pick.evaluate(e=>e.classList.contains('selected'))) await pick.click();
        }
        assert.match(await page.locator('#formula').textContent(),/未設定/);
        await page.locator('.pick.quick[data-q="red0"]').click();
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
      await filePage.locator('#modeTraverse').click();await toolGroup(filePage,'demo');await filePage.locator('#tvDemo').click();
      await filePage.waitForFunction(()=>!IntegratedModes.busy&&currentRounds?.length>0);
      const opening = context.waitForEvent('page');
      await filePage.locator('#btnTableWindow').click(); const fileWindow = await opening;
      await fileWindow.waitForFunction(() => getComputedStyle(document.body).display === 'block');
      assert.equal(await fileWindow.evaluate(() => document.compatMode),'CSS1Compat');
      await fileWindow.locator('#roundsBody tr').last().scrollIntoViewIfNeeded();
      assert(await fileWindow.evaluate(()=>scrollY>0&&document.querySelector('.table-scroll').scrollTop===0));
      assert(await fileWindow.locator('.table-scroll').evaluate(e=>getComputedStyle(e).overflow==='visible'&&e.scrollHeight<=e.clientHeight+1));
      const closed = fileWindow.waitForEvent('close');await filePage.close();await closed;
    });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: checks.length, pageErrors: errors }));
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(e => { console.error(e); process.exitCode = 1; server.close(); });
