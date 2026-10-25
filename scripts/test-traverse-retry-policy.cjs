// 使用先前真實失敗牌例，驗證原頁／批次流程的重跑政策；不導出、不上傳。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '..');
require(path.join(ROOT, 'traverse_builder.js'));
require(path.join(ROOT, 'traverse_export.js'));
const B = globalThis.TraverseBuilder, E = globalThis.TraverseExport;
const html = fs.readFileSync(path.join(ROOT, 'traverse_builder.html'), 'utf8');
const batch = fs.readFileSync(path.join(ROOT, 'scripts/batch-traverse.mjs'), 'utf8');
const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/validation/traverse-reruns-2026-10-08.json'), 'utf8'));
const witness = fixture.groups.find(g => g.scenario === 'unlimited').witnesses;
const copy = x => JSON.parse(JSON.stringify(x));
const checks = [];
async function check(name, fn) {
  try { await fn(); checks.push({ name, pass: true }); }
  catch (e) { checks.push({ name, pass: false, error: e.message }); }
}
function harness(mode, results, settings = {}, signalRetry = B.SIGNAL_RETRY_ENABLED) {
  const nodes = new Map(), errors = [], logs = [];
  let calls = 0;
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, {
      value: '', checked: false, textContent: '', innerHTML: '', listeners: {},
      classList: { add() {}, remove() {}, toggle() {} },
      addEventListener(type, fn) { this.listeners[type] = fn; },
      querySelector(sel) { return node(id + sel); }, focus() {},
    });
    return nodes.get(id);
  }
  for (const m of html.matchAll(/<input\b[^>]*>/g)) {
    const id = m[0].match(/\bid="([^"]+)"/)?.[1];
    if (id) Object.assign(node(id), { value: m[0].match(/\bvalue="([^"]*)"/)?.[1] || '', checked: /\bchecked\b/.test(m[0]) });
  }
  const options = { maxLeftover: '', sideRule: false, endingNine: false, ...settings };
  for (const [id, value] of Object.entries(options)) node(id)[typeof value === 'boolean' ? 'checked' : 'value'] = value;
  const builder = { ...B, SIGNAL_RETRY_ENABLED: signalRetry, async build() {
    const result = results[calls++];
    if (!result) throw new Error('unexpected extra build');
    return copy(result);
  } };
  const math = Object.create(Math); math.random = () => 0;
  const ctx = vm.createContext({
    TraverseBuilder: builder, TraverseExport: E, B: builder, E,
    document: { getElementById: node, querySelectorAll: () => [] },
    OptimizerDialog: { reset() { node('optimizerPanel').hidden = true; } },
    console: { error: e => errors.push(e.message) }, Math: math, setTimeout,
    fetch: async () => ({ ok: true, json: async () => ({ success: true, files: [] }) }),
    path, os: require('node:os'), process: { argv: ['node', 'batch'], stdout: { write: s => logs.push(s) } },
  });
  let run;
  if (mode === 'page') {
    vm.runInContext([...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1], ctx);
    run = async () => {
      await node('btnRun').listeners.click();
      assert.deepEqual(errors, []);
      assert.match(node('progress').textContent, /^完成/);
    };
  } else {
    const source = batch.slice(batch.indexOf('// ===== 參數'), batch.indexOf('// ===== 雲端'));
    vm.runInContext(source + '\nglobalThis.testAPI = { buildOne, opt };', ctx);
    Object.assign(ctx.testAPI.opt, { maxLeftover: options.maxLeftover === '' ? null : +options.maxLeftover, sideRule: options.sideRule, endingNine: options.endingNine, sideLimit: +(options.sideLimit ?? 8) });
    run = () => ctx.testAPI.buildOne('[test]');
  }
  return { run, node, calls: () => calls, logs };
}
function rng(seed) {
  return () => { let t = seed += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
(async () => {
  for (const mode of ['page', 'batch']) {
    await check(`${mode}: 訊號失敗保留當副`, async () => {
      const h = harness(mode, [witness.signal.result]); await h.run(); assert.equal(h.calls(), 1);
    });
    await check(`${mode}: 訊號重跑程式仍保留、開啟時可作用`, async () => {
      const h = harness(mode, [witness.signal.result, witness.nine.result], {}, true);
      await h.run(); assert.equal(h.calls(), 2);
    });
    await check(`${mode}: 沒有安全末張9仍完成`, async () => {
      const h = harness(mode, [witness.nine.result], { endingNine: true }); await h.run(); assert.equal(h.calls(), 1);
    });
    await check(`${mode}: 卡色失敗仍完成（故障注入）`, async () => {
      const result = copy(witness.nine.result); result.colorOk = false;
      const h = harness(mode, [result]); await h.run(); assert.equal(h.calls(), 1);
    });
    await check(`${mode}: 剩牌上限仍重跑`, async () => {
      const h = harness(mode, [{ rejected: true, leftoverCount: 416 }, witness.nine.result], { maxLeftover: '415' });
      await h.run(); assert.equal(h.calls(), 2);
    });
    await check(`${mode}: 莊閒差距仍重跑`, async () => {
      const high = copy(witness.side.result), low = copy(witness.nine.result);
      const diff = r => { const rounds = E.dealRounds(r.cards).filter(r => r.hand); return Math.abs(2 * rounds.filter(r => r.result === '莊').length - rounds.length); };
      assert.ok(diff(high) > diff(low));
      const h = harness(mode, [high, low], { sideRule: true, sideLimit: String(diff(low)) });
      await h.run(); assert.equal(h.calls(), 2);
    });
  }
  await check('使用者第9長段：實際牌序合格，不再假設反向判失敗', () => {
    const points = [0, 8, 0, 1, 5, 7, 6, 5, 0, 1];
    assert.equal(B.qualifies(points), false, '撿段時仍保留原本的對調承受條件');
    assert.equal(B.qualifiesFinal(points), true);
    assert.equal(B.diagnoseChain(points), null);
  });
  await check('實際牌序本身不能穿越時仍不合格', () => {
    const points = [8, 0, 0, 1, 5, 7, 6, 5, 0, 1];
    assert.equal(B.qualifiesFinal(points), false);
    const issue = B.diagnoseChain(points);
    assert.equal(issue.kind, 'traverse');
    assert.equal(issue.from, 2);
    assert.equal(issue.remaining, 3);
  });
  await check('歷史上僅因假設反向失敗的長段，現在可通過最終驗收', () => {
    const result = witness.signal.result, c = result.chains.find(c => !c.qualified);
    const points = result.cards.slice(c.start - 1, c.start - 1 + c.length).map(card => card.point);
    assert.equal(B.qualifiesFinal(points), true);
    assert.equal(B.diagnoseChain(points), null);
  });
  await check('真實引擎停用訊號重接、保留診斷並顯示', async () => {
    let chainSteps = 0;
    const result = await B.build({ chainMerge: false, rng: rng(1000), onProgress: m => { if (m.startsWith('階段 3 接段：')) chainSteps++; } });
    assert.equal(chainSteps, 20);
    assert.equal(result.signal.ok, false);
    assert.ok(result.signal.issues.length > 0);
    assert.ok(result.signal.issues.some(issue => issue.kind === 'signal' && issue.message.includes('三條')));
    for (const c of result.chains) {
      const points = result.cards.slice(c.start - 1, c.start - 1 + c.length).map(card => card.point);
      assert.equal(c.qualified, B.qualifiesFinal(points));
      assert.equal(B.diagnoseChain(points) === null, c.qualified);
    }
    assert.ok(result.signal.issues.every(issue => issue.kind !== 'swap-traverse'));
    const h = harness('page', [result]); await h.run();
    assert.match(h.node('signalDiagnostics').innerHTML, /重跑已停用/);
    assert.match(h.node('signalDiagnostics').innerHTML, /第 \d+ 長段/);
  });
  await check('真實整副牌僅有假設反向失敗時，訊號、結果與畫面均通過', async () => {
    const result = await B.build({ chainMerge: false, rng: rng(1002) });
    assert.ok(result.chains.some(c => !B.qualifies(result.cards.slice(c.start - 1, c.start - 1 + c.length).map(card => card.point))));
    assert.equal(result.signal.ok, true);
    assert.deepEqual(result.signal.issues, []);
    assert.ok(result.chains.every(c => c.qualified));
    const h = harness('page', [result]); await h.run();
    assert.equal(h.node('signalDiagnosticPanel').hidden, true);
    assert.match(h.node('stats').innerHTML, />通過</);
  });
  console.log(JSON.stringify({ passed: checks.filter(c => c.pass).length, total: checks.length, failures: checks.filter(c => !c.pass) }, null, 2));
  if (checks.some(c => !c.pass)) process.exitCode = 1;
})();
