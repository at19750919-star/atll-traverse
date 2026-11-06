const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const ROOT = path.resolve(__dirname, '..');
const { chromium } = require(path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const server = http.createServer((req, res) => {
  const target = path.resolve(ROOT, '.' + decodeURIComponent(new URL(req.url, 'http://local').pathname));
  if (!target.startsWith(ROOT + path.sep) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', ({ '.html':'text/html', '.js':'text/javascript', '.css':'text/css' })[path.extname(target)] || 'application/octet-stream');
  res.end(fs.readFileSync(target));
});
const signature = page => page.evaluate(() => JSON.stringify(currentRounds.map(r => ({ result:r.result, cards:r.cards.map(c => [c.rank,c.suit,c.pos,c.back_color]) }))));
const loaded = page => page.waitForFunction(() => window.ReviewStorage && Array.isArray(currentRounds) && currentRounds.length > 0);
async function run(page, url, label) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await loaded(page);
  const original = await signature(page);
  assert.equal(await page.evaluate(() => currentRounds.length), 83, label + ': XX04 default rounds');
  assert.equal(await page.evaluate(() => currentRounds.flatMap(r=>r.cards).length), 416, label + ': all 416 cards');
  assert.equal(await page.locator('#roundsBody tr').count(), 83, label + ': main table shown at first load');
  assert.equal(await page.evaluate(() => currentRounds[0].cards[0] instanceof Card && typeof currentRounds[0].cards[0].point === 'function'), true);
  await page.reload({ waitUntil:'domcontentloaded' });
  await loaded(page);
  assert.equal(await signature(page), original, label + ': refresh preserves exact shoe');

  // A fresh/default shoe must cut immediately without pressing 記錄牌序 first.
  assert.equal(await page.evaluate(() => originalDeckOrder.length), 416, label + ': initial baseline is ready');
  await page.fill('#cutPos', '12');
  await page.click('#btnCut');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem(ReviewStorage.key)).cutPos === 12);
  const directCut = await signature(page);
  assert.notEqual(directCut, original, label + ': fresh direct cut actually changes order');
  await page.reload({waitUntil:'domcontentloaded'});
  await loaded(page);
  assert.equal(await signature(page), directCut, label + ': fresh direct cut persists');
  await page.fill('#cutPos', '0');
  await page.click('#btnCut');
  assert.equal(await signature(page), original, label + ': cut zero returns exact default including backs');

  // Restoring an older snapshot without a baseline must also be cuttable.
  await page.evaluate(() => ReviewStorage.restore({...window.REVIEW_DEFAULT_SHOE,originalRounds:null,originalDeckOrder:null,cutPos:12}));
  assert.equal(await page.evaluate(() => originalDeckOrder.length), 416);
  assert.equal(await page.inputValue('#cutPos'), '', label + ': missing baseline resets stale cut offset');

  // An unconfirmed selection/preview must not replace the saved card order.
  await page.click('#btnSwap');
  await page.locator('#roundsBody [data-action="card"]').first().click();
  await page.click('#btnSaveReview');
  const selectedSave = await page.evaluate(() => JSON.parse(localStorage.getItem(ReviewStorage.key)));
  assert.equal(JSON.stringify(selectedSave.rounds.map(r=>({result:r.result,cards:r.cards.map(c=>[c.rank,c.suit,c.pos,c.back_color])}))), original);
  await page.click('#btnCancelEdit');

  // Confirmed round exchange is real data and must survive reload.
  await page.click('#btnRound');
  await page.locator('#roundsBody tr:nth-child(1) td:first-child').click();
  await page.locator('#roundsBody tr:nth-child(2) td:first-child').click();
  await page.click('#btnRound');
  const swapped = await signature(page);
  assert.notEqual(swapped, original, label + ': confirmed exchange changes rounds');
  await page.reload({waitUntil:'domcontentloaded'});
  await loaded(page);
  assert.equal(await signature(page), swapped, label + ': confirmed exchange persists immediately on navigation');
  await page.evaluate(() => ReviewStorage.restore(window.REVIEW_DEFAULT_SHOE));
  await page.click('#btnSaveReview');

  await page.click('#btnRecordDeckOrder');
  await page.fill('#cutPos', '12');
  await page.click('#btnCut');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem(ReviewStorage.key)).cutPos === 12);
  const cut = await signature(page);
  assert.notEqual(cut, original, label + ': cut actually changes order');
  await page.reload({ waitUntil:'domcontentloaded' });
  await loaded(page);
  assert.equal(await signature(page), cut, label + ': cut order survives reload');
  assert.equal(await page.inputValue('#cutPos'), '12');
  await page.fill('#cutPos', '99');
  await page.click('#btnSaveReview');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem(ReviewStorage.key)).cutPos), 12, label + ': unexecuted cut input is not committed');
  assert.equal(await page.evaluate(() => originalDeckOrder.length), 416);
  assert.equal(await page.evaluate(() => originalDeckOrder[0] instanceof Card), true);
  await page.fill('#cutPos', '0');
  await page.click('#btnCut');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem(ReviewStorage.key)).cutPos === 0);
  assert.equal(await signature(page), original, label + ': cut zero restores exact recorded baseline including card backs');

  await page.fill('#exportFilename', 'Saved-XX04');
  await page.click('#btnSaveReview');
  assert.match(await page.locator('#reviewSaveStatus').innerText(), /已保存於本機/);
  await page.reload({ waitUntil:'domcontentloaded' });
  await loaded(page);
  assert.equal(await page.inputValue('#exportFilename'), 'Saved-XX04', label + ': manual save and filename restore');

  const savedSignature = await signature(page);
  const reopened = await page.context().newPage();
  await reopened.goto(url, {waitUntil:'domcontentloaded'});
  await loaded(reopened);
  assert.equal(await signature(reopened), savedSignature, label + ': a newly opened page restores the latest shoe');
  assert.equal(await reopened.inputValue('#exportFilename'), 'Saved-XX04');
  await reopened.close();

  // Import a real workbook through the page's existing importer, then cut without recording.
  const buffer = await page.evaluate(async () => {
    const book = new ExcelJS.Workbook(), sheet = book.addWorksheet('原始數據');
    sheet.addRow(['局數','段標','色序','卡片1','卡片2','卡片3','卡片4','卡片5','卡片6','結果','訊號']);
    window.REVIEW_DEFAULT_SHOE.rounds.forEach((round,i) => {
      const labels = round.cards.map(c=>c.rank+c.suit);
      while (labels.length < 6) labels.push('');
      sheet.addRow([i+1,round.segment||'A',round.cards.map(c=>c.back_color||'').join(''),...labels,round.result,'']);
    });
    return Array.from(new Uint8Array(await book.xlsx.writeBuffer()));
  });
  await page.locator('#importFileInput').setInputFiles({name:'XX04-import-test.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(buffer)});
  await page.waitForFunction(() => document.querySelector('#reviewSaveStatus').textContent.includes('XX04-import-test.xlsx'));
  const imported = await signature(page);
  assert.equal(await page.evaluate(() => originalDeckOrder.length), 416, label + ': successful import creates full cut baseline');
  await page.fill('#cutPos','12');
  await page.click('#btnCut');
  assert.notEqual(await signature(page), imported, label + ': imported shoe cuts without 記錄牌序');
  await page.fill('#cutPos','0');
  await page.click('#btnCut');
  assert.equal(await signature(page), imported, label + ': imported cut zero restores exact source');
  const baselineBeforeFailure = await page.evaluate(() => JSON.stringify(originalDeckOrder));
  await page.locator('#importFileInput').setInputFiles({name:'invalid.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from('invalid workbook')});
  await page.waitForFunction(() => document.querySelector('#importFeedback')?.dataset.state === 'error');
  assert.equal(await page.evaluate(() => JSON.stringify(originalDeckOrder)), baselineBeforeFailure, label + ': failed import retains old cut baseline');

  // A write error must report failure and preserve the previous stored entry.
  const quota = await page.evaluate(() => {
    const before = localStorage.getItem(ReviewStorage.key), set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) { if (key === ReviewStorage.key) throw new DOMException('full','QuotaExceededError'); return set.call(this,key,value); };
    try { return { ok: ReviewStorage.save(true), unchanged: before === localStorage.getItem(ReviewStorage.key), status: document.querySelector('#reviewSaveStatus').textContent }; }
    finally { Storage.prototype.setItem = set; }
  });
  assert.equal(quota.ok, false); assert.equal(quota.unchanged, true); assert.match(quota.status, /保存失敗/);

  // Corrupt data recovers the bundled default with a visible warning and usable table.
  await page.evaluate(() => { localStorage.setItem(ReviewStorage.key, '{invalid'); window.addEventListener('pagehide', () => localStorage.setItem(ReviewStorage.key, '{invalid')); });
  await page.reload({ waitUntil:'domcontentloaded' });
  await loaded(page);
  assert.match(await page.locator('#reviewSaveStatus').innerText(), /上次保存無法讀取/);
  assert.equal(await page.locator('#roundsBody tr').count(), 83);
  console.log(label + ': default / direct cut / import direct cut / reload / manual / confirmed edit / baseline / quota / corrupt PASS');
}
(async () => {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser = await chromium.launch({ headless:true, channel:'chrome' });
  try {
    for (const [label,url] of [['http',`http://127.0.0.1:${server.address().port}/review.html`],['file',pathToFileURL(path.join(ROOT,'review.html')).href]]) {
      const context=await browser.newContext({viewport:{width:1401,height:884}}), page=await context.newPage();
      const errors=[]; page.on('pageerror',e=>errors.push(e.message));
      await run(page,url,label);
      assert.deepEqual(errors, [], label + ': no page exceptions');
      await context.close();
    }
  } finally { await browser.close(); server.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
