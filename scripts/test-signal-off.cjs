// A.2 關閉時撿段不檢查「單局對調後仍穿越」；開啟時照舊。
const assert = require('node:assert/strict');
require('../traverse_builder.js');
require('../traverse_export.js');
const B = globalThis.TraverseBuilder, E = globalThis.TraverseExport;
function rng(seed) {
  return () => { let t = seed += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
(async () => {
  // 實際牌序合格，但某局單獨對調前兩張後不再穿越
  const seg = [4, 8, 5, 4, 3, 7, 9, 0, 0];
  Object.assign(B.rules, { tripleTie: true, signalRule: true, strong: false, secondStart: false });
  assert.equal(B.qualifies(seg, true), false, 'A.2 開啟時仍要檢查對調後穿越');
  assert.ok(B.qualifiesFinal(seg));
  B.rules.signalRule = false;
  assert.ok(B.qualifies(seg, true), 'A.2 關閉時不檢查對調後穿越');
  console.log('PASS 對調後穿越只在 A.2 開啟時檢查');

  // 三條、A.2 都關：和局回到一般比例（原本約 23%），莊閒經平衡對調後相差不大（未平衡時約 55%：33%）
  let hands = 0, ties = 0, banker = 0, player = 0, flips = 0;
  for (let seed = 13000; seed < 13005; seed++) {
    const res = await B.build({ minLen: 8, maxLen: 12, tripleTie: false, signalRule: false, chainAttempts: 3, rng: rng(seed) });
    assert.equal(B.rules.signalRule, false);
    for (let p = 0; p < 10; p++) assert.equal(res.cards.filter(c => c.point === p).length, p ? 32 : 128);
    assert.ok(res.chains.every(ch => ch.qualified), '平衡對調後長段仍須合格');
    let diff = 0;
    for (const ch of res.chains) {
      const pts = Array.from({ length: ch.length }, (_, j) => res.cards[(ch.start - 1 + j) % 416].point);
      for (const r of B.roundsFromStart(pts)) diff += r.result === '莊' ? 1 : r.result === '閒' ? -1 : 0;
    }
    assert.equal(diff, res.balance.diff);
    assert.ok(Math.abs(diff) <= 3, `穿越段莊閒相差 ${diff} 局`);
    flips += res.balance.flips;
    E.dealRounds(res.cards).filter(r => r.hand).forEach(r => {
      hands++;
      if (r.result === '和') ties++; else if (r.result === '莊') banker++; else player++;
    });
  }
  const pct = n => (n / hands * 100).toFixed(1);
  assert.ok(ties / hands > 0.05 && ties / hands < 0.15, `和局比例 ${pct(ties)}% 應接近一般的 9.5%`);
  assert.ok(flips > 0 && Math.abs(banker - player) / (banker + player) < 0.05, `莊 ${pct(banker)}% 閒 ${pct(player)}%`);
  console.log(`PASS 三條、A.2 都關：莊 ${pct(banker)}% 閒 ${pct(player)}% 和 ${pct(ties)}%，平衡對調 ${flips} 局`);

  const signaled = await B.build({ minLen: 8, maxLen: 12, chainAttempts: 1, rng: rng(13000) });
  assert.equal(signaled.balance, null, 'A.2 開啟時由訊號決定莊閒，不做平衡對調');

  await B.build({ idleLimit: 1, computeTries: 1, chainAttempts: 1, rng: rng(1) });
  assert.equal(B.rules.signalRule, true, '預設 A.2 開啟，不得沿用上一副的關閉狀態');
  console.log('PASS 預設恢復 A.2 檢查');
})().catch(e => { console.error(e); process.exitCode = 1; });
