const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
require('../traverse_builder.js'); require('../traverse_export.js'); require('../traverse_optimizer.js');
const B = globalThis.TraverseBuilder, E = globalThis.TraverseExport, O = globalThis.TraverseOptimizer;
const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/validation/safe-cuts-research-2026-10-08.json'), 'utf8'));
const batch = fs.readFileSync(path.join(ROOT, 'scripts/batch-traverse.mjs'), 'utf8');
const opt = { tripleTie: true, signalRule: true };
const ref = vm.createContext({ B, E, opt });
vm.runInContext(batch.slice(batch.indexOf('function violationOf('), batch.indexOf('// ===== 一副')) + '\nglobalThis.cut = cutLastViolation;', ref);
const clone = x => JSON.parse(JSON.stringify(x));
const resultOf = seed => { const row = fixture.shoes.find(x => x.seed === seed); return {
  cards: clone(row.baselineCards), chains: clone(row.baselineChains), leftoverCount: 0,
  stats: { shuffles: 1, phase2Segments: 1, ms: 1 }, signal: { ok: row.baseline.signalOk, flips: 0, conflicts: 0, issues: [] }, colorOk: true,
}; };
const identity = cards => cards.map(c => `${c.rank}|${c.suit}|${c.back_color}`).sort();
const pointCounts = cards => cards.map(c => c.point).sort((a, b) => a - b);
let checks = 0;
async function check(name, fn) { await fn(); checks++; console.log(`PASS ${name}`); }
function compareReference(cards, options) {
  Object.assign(opt, options); B.rules.tripleTie = opt.tripleTie;
  const a = O.analyze(cards, options);
  for (let cut = 0; cut < 416; cut++) {
    assert.equal(a.depths[cut], ref.cut(cards, cut), `cut=${cut}`);
    const trace = O.traceCut(cards, cut, options);
    assert.equal(Math.max(0, ...trace.filter(r => r.issues.length).map(r => r.no)), a.depths[cut]);
  }
  return a;
}
function verify(out, original) {
  assert.deepEqual(identity(out.after.cards), identity(original.cards));
  const old = E.dealRounds(O.prepare(original)), now = E.dealRounds(O.prepare(out.after));
  assert.equal(old.length, now.length);
  old.forEach((r, i) => {
    assert.equal(now[i].start, r.start); assert.equal(now[i].result, r.result);
    assert.deepEqual(pointCounts(now[i].cards), pointCounts(r.cards));
    if (r.hand) {
      assert.equal(now[i].hand.size, r.hand.size);
      assert.equal(B.handSensitive(now[i].cards.map(c => c.point)), B.handSensitive(r.cards.map(c => c.point)));
    }
  });
  assert.ok(out.final.count >= out.initial.count);
  assert.ok(out.after.chains.every(c => c.qualified));
  compareReference(O.prepare(out.after), out.rules);
  out.changes.forEach(change => {
    assert.ok(change.sensitiveBefore && change.sensitiveAfter);
    assert.deepEqual(change.after.map(c => change.before.indexOf(c) + 1), change.from);
  });
}
function uiHarness() {
  const html = fs.readFileSync(path.join(ROOT, 'traverse_builder.html'), 'utf8');
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { value: '', checked: false, disabled: false, hidden: false, textContent: '', innerHTML: '', listeners: {},
      classList: { add() {}, remove() {}, toggle() {} }, addEventListener(t, fn) { this.listeners[t] = fn; },
      querySelector(sel) { return node(id + sel); }, scrollIntoView() {}, focus() {} });
    return nodes.get(id);
  };
  for (const m of html.matchAll(/<input\b[^>]*>/g)) {
    const id = m[0].match(/\bid="([^"]+)"/)?.[1];
    if (id) Object.assign(node(id), { value: m[0].match(/\bvalue="([^"]*)"/)?.[1] || '', checked: /\bchecked\b/.test(m[0]) });
  }
  const ctx = vm.createContext({ TraverseBuilder: B, TraverseExport: E, TraverseOptimizer: O,
    document: { getElementById: node, querySelectorAll: () => [] }, console, setTimeout,
    OptimizerDialog: { show() { node('optimizerPanel').hidden = false; }, reset() { node('optimizerPanel').hidden = true; } },
    fetch: async () => ({ json: async () => ({ success: true, files: [] }) }) });
  let inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
  inline = inline.replace(/\}\)\(\);\s*$/, 'globalThis.testUI = { get: () => ({ lastResult, baseCards, cutPos, optimization, optimizationBusy }), load: r => { lastResult=r; prepareBase(r); render(r); computeSafeCuts(); setReady(true); } }; })();');
  vm.runInContext(inline, ctx);
  return { node, api: ctx.testUI };
}
(async () => {
  await check('和→閒、閒→和即使張數相同，也必須排除安全切點', () => {
    for (const pts of [[9, 0, 6, 5, 0], [0, 9, 6, 5, 0]]) {
      const cards = pts.map(point => ({ point, rank: point ? String(point) : 'K', suit: '♠', back_color: 'R', traverse: true }));
      assert.equal(B.handSensitive(pts), false);
      assert.ok(O.analyze(cards).depths[0] > 0);
      assert.ok(ref.cut(cards, 0) > 0);
    }
  });
  await check('416 切點與原批次判定一致，涵蓋三條與訊號四種開關', () => {
    const cards = O.prepare(resultOf(1139));
    for (const tripleTie of [true, false]) for (const signalRule of [true, false]) compareReference(cards, { tripleTie, signalRule });
    B.rules.tripleTie = true;
  });
  for (const seed of [1124, 1139, 1197, 1220]) await check(`真實牌 ${seed}：增加安全點、保留每局及全部原牌`, async () => {
    const original = resultOf(seed), saved = clone(original), out = await O.optimize(original);
    assert.deepEqual(original, saved, '不能改寫输入'); verify(out, original);
    assert.ok(out.final.count > out.initial.count);
    for (const cut of out.final.safe) {
      const rs = E.dealRounds(E.cutDeck(O.prepare(out.after), cut));
      assert.ok(rs.filter(r => r.hand && r.segment === 'A').every(r => B.handSensitive(r.cards.map(c => c.point))), `安全切點 ${cut} 必須全部敏感`);
    }
    console.log(JSON.stringify({ seed, before: out.initial.count, after: out.final.count }));
  });
  await check('末張 9 旋轉後仍能處理跨頭尾長段、末張 9 不變', async () => {
    const original = resultOf(1139), cards = O.prepare(original), a = O.analyze(cards);
    const r = E.dealRounds(cards).find(r => r.hand && r.cards.at(-1).rank === '9' && a.safe.includes((r.start + r.cards.length) % 416));
    const cut = (r.start + r.cards.length) % 416;
    original.cards = E.cutDeck(original.cards, cut);
    original.chains.forEach(ch => { ch.start = (ch.start - 1 - cut + 416) % 416 + 1; });
    const out = await O.optimize(original, { preserveLastNine: true }); verify(out, original);
    assert.equal(out.after.cards.at(-1).rank, '9'); assert.ok(out.final.count > out.initial.count);
  });
  await check('停止保留原牌，不新增任何重跑', async () => {
    const original = resultOf(1139), out = await O.optimize(original, { isCancelled: () => true });
    assert.equal(out.cancelled, true); assert.equal(out.changes.length, 0); assert.equal(out.final.count, out.initial.count);
  });
  await check('有剩牌時保留原剩牌，不靠縮小檢查區增加安全點', async () => {
    let seed = 1002;
    const rng = () => { let t = seed += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const original = await B.build({ rng }), saved = clone(original);
    assert.equal(original.leftoverCount, 6);
    const out = await O.optimize(original); verify(out, original);
    assert.equal(out.after.leftoverCount, 6);
    assert.deepEqual(out.after.cards.slice(-6), O.prepare(saved).slice(-6));
  });
  await check('原牌不合格不能假稱維持驗收、全剩牌不能當成 416 安全點', async () => {
    await assert.rejects(() => O.optimize(resultOf(1292)), /尚未通過/);
    const noSegments = resultOf(1139); noSegments.chains = []; noSegments.leftoverCount = 416;
    await assert.rejects(() => O.optimize(noSegments), /尚未排出/);
  });
  await check('主頁示範→優化→前後切換，牌表與安全點統計一致', async () => {
    const h = uiHarness();
    await h.node('btnOptimizeDemo').listeners.click();
    assert.equal(h.api.get().lastResult.leftoverCount, 0); assert.equal(h.api.get().baseCards.at(-1).rank, '9');
    await h.node('btnOptimize').listeners.click();
    const o = h.api.get().optimization;
    assert.ok(o && o.final.count > o.initial.count); assert.equal(h.node('optimizerPanel').hidden, false);
    assert.match(h.node('optimizerChanges').innerHTML, /敏感局：是 → 是/);
    assert.match(h.node('optimizerExample').innerHTML, /新增安全切點示範/);
    h.node('btnOptBefore').listeners.click();
    assert.deepEqual(JSON.parse(JSON.stringify(h.api.get().lastResult.cards)), JSON.parse(JSON.stringify(o.before.cards)));
    assert.ok(h.node('safeTotal').textContent.includes(`不含卡色 ${o.initial.count}`));
    h.node('btnOptAfter').listeners.click();
    assert.ok(h.node('safeTotal').textContent.includes(`不含卡色 ${o.final.count}`));
    assert.equal(h.api.get().optimizationBusy, false); assert.equal(h.node('btnOptimize').disabled, false);
    h.node('tripleTie').listeners.change(); assert.equal(h.api.get().optimization, null);
    console.log(JSON.stringify({ demoBefore: o.initial.count, demoAfter: o.final.count, changed: o.changes.length, firstNewCut: o.gained[0] }));
    fs.writeFileSync(path.join(ROOT, 'scripts/validation/optimizer-demo-2026-10-08.json'), JSON.stringify({
      date: '2026-10-08', seed: 1139, rule: '莊閒互換或和仍和；不含卡色；訊號三條依現行安全判定',
      beforeCount: o.initial.count, afterCount: o.final.count, changedRounds: o.changes.length,
      gained: Array.from(o.gained), lost: Array.from(o.lost),
      before: o.before, after: o.after, changes: o.changes,
    }, null, 2) + '\n');
  });
  console.log(JSON.stringify({ passed: checks }));
})().catch(e => { console.error(e); process.exitCode = 1; });
