// 離線實驗：只在記憶體中的引擎副本限制短段局數，正式頁面與引擎不變。
// node scripts/probe-fixed-rounds.cjs [每組試排次數=30] [輸出JSON]
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const file = path.join(root, 'traverse_builder.js');
const source = fs.readFileSync(file, 'utf8');
const count = Number(process.argv[2] || 30);
assert.ok(Number.isSafeInteger(count) && count > 0);
const output = path.resolve(process.argv[3] || path.join(root, 'scripts/validation/fixed-rounds-2026-10-11.json'));
function replaceOnce(text, before, after) {
  assert.equal(text.split(before).length, 2, `Expected exactly one anchor: ${before}`);
  return text.replace(before, after);
}
function rng(seed) {
  return () => {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function engine(roundCount, capture) {
  let code = replaceOnce(source, 'function qualifies(arr, single = false) {',
    `function qualifies(arr, single = false) {\n        if (single && roundsFromStart(arr)?.length !== ${roundCount}) return false;`);
  code = replaceOnce(code, 'const p2 = await phaseCompute(p1.rest, opts, ctx);',
    'const p2 = await phaseCompute(p1.rest, opts, ctx);\n        module.capture(p1, p2);');
  const mod = new Module(file, module);
  mod.filename = file;
  mod.paths = module.paths;
  mod.capture = capture;
  mod._compile(code, file);
  return globalThis.TraverseBuilder;
}
const settings = { idleLimit: 1000, computeTries: 20000, chainAttempts: 20,
  tripleTie: true, signalRule: true, strong: false, zeroPolicy: 'quota', rejectAbove: 0 };
const report = { method: 'Real engine compiled in memory; only single-segment qualification gains exact round count; phase 1/2 capture is read-only. No production edits. All other rules and search budgets unchanged. Seeds 1000 onward, same seeds in both groups. Full chain/signal/color stages run only if no cards remain. Does not simulate the page ending-nine/side-difference checks.',
  sourceSha256: crypto.createHash('sha256').update(source).digest('hex'), settings, groups: [] };
function save() {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
}
(async () => {
  for (const roundCount of [2, 3]) {
    let sample;
    const B = engine(roundCount, (p1, p2) => {
      const segs = p1.segs.concat(p2.segs);
      const points = segs.flat().concat(p2.rest);
      assert.equal(points.length, 416);
      for (let p = 0; p < 10; p++) assert.equal(points.filter(x => x === p).length, p ? 32 : 128);
      for (const seg of segs) {
        assert.equal(B.roundsFromStart(seg).length, roundCount);
        assert.ok(B.qualifies(seg, true));
      }
      sample = { phase1Segments: p1.segs.length, phase1Rest: p1.rest.length,
        phase2Segments: p2.segs.length, computeTries: p2.tries,
        lengths: segs.reduce((o, s) => (o[s.length] = (o[s.length] || 0) + 1, o), {}),
        leftover: p2.rest.length, segments: segs, rest: p2.rest };
    });
    const group = { rounds: roundCount, minLen: roundCount * 4, maxLen: roundCount * 6, attempts: [], best: null };
    report.groups.push(group);
    for (let i = 0; i < count; i++) {
      const seed = 1000 + i, start = Date.now();
      const result = await B.build({ ...settings, minLen: group.minLen, maxLen: group.maxLen, rng: rng(seed) });
      assert.equal(result.leftoverCount, sample.leftover);
      if (!result.rejected) assert.equal(result.cards.length, 416);
      const { segments, rest, ...metrics } = sample;
      const row = { seed, ...metrics, ms: Date.now() - start, rejected: !!result.rejected,
        badChains: result.chains?.filter(c => !c.qualified).length, signalOk: result.signal?.ok, colorOk: result.colorOk };
      group.attempts.push(row);
      if (!group.best || row.leftover < group.best.leftover) group.best = { ...row, segments, rest, result };
      if ((i + 1) % 5 === 0) {
        save();
        console.log(JSON.stringify({ rounds: roundCount, attempts: i + 1, bestLeftover: group.best.leftover,
          zeroLeftover: group.attempts.filter(a => a.leftover === 0).length }));
      }
    }
    const a = group.attempts;
    group.summary = { attempts: a.length, zeroLeftover: a.filter(x => x.leftover === 0).length,
      minLeftover: Math.min(...a.map(x => x.leftover)), maxLeftover: Math.max(...a.map(x => x.leftover)),
      meanLeftover: a.reduce((n, x) => n + x.leftover, 0) / a.length,
      totalPhase1Segments: a.reduce((n, x) => n + x.phase1Segments, 0),
      totalPhase2Segments: a.reduce((n, x) => n + x.phase2Segments, 0),
      elapsedMs: a.reduce((n, x) => n + x.ms, 0) };
    save();
    console.log(JSON.stringify({ rounds: roundCount, ...group.summary }));
  }
  console.log(JSON.stringify({ output }));
})().catch(e => { console.error(e); process.exitCode = 1; });
