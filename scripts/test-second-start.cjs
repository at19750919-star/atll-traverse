const assert = require('node:assert/strict');
require('../traverse_builder.js');
require('../traverse_export.js');
require('../traverse_optimizer.js');
const B = globalThis.TraverseBuilder, O = globalThis.TraverseOptimizer;
const good = [7, 8, 0, 0, 1, 2, 5, 5];
const bad = [8, 7, 0, 0, 1, 2, 5, 5];
function rng(seed) {
  return () => { let t = seed += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function verifyParts(result) {
  for (const ch of result.chains) {
    const points = Array.from({ length: ch.length }, (_, j) => result.cards[(ch.start - 1 + j) % 416].point);
    points.parts = ch.parts;
    points.secondParts = ch.secondParts;
    assert.equal(ch.secondParts.length, ch.parts.length);
    let off = 0, ok = true;
    for (const [i, len] of ch.parts.entries()) {
      const seg = points.slice(off, off + len);
      // 原條件續排的短段不檢查第二張
      if (!ch.secondParts[i]) { off += len; continue; }
      // 逐局獨立檢查，不用 secondStartOk 算預期值。
      let cur = 1, complete = 0;
      while (cur < seg.length) {
        const h = B.simulateHand(seg, cur, seg.length);
        if (!h) break;
        if (!B.handSensitive(seg.slice(cur, cur + h.size))) ok = false;
        complete++; cur += h.size;
      }
      if (!complete) ok = false;
      off += len;
    }
    assert.equal(off, ch.length);
    if (ch.qualified) assert.ok(ok, '合格長段中的每個短段都須通過第二張起發檢查');
    assert.equal(ch.qualified, B.qualifiesFinal(points));
  }
}
(async () => {
  Object.assign(B.rules, { tripleTie: true, strong: false, secondStart: false });
  assert.ok(B.qualifies(good, true) && B.qualifies(bad, true));
  assert.ok(B.secondStartOk(good), '8 張段不能因剩 7 張就跳過；完整敏感局後剩 3 張可接受');
  assert.equal(B.secondStartOk(bad), false, '第一個完整局不敏感，即使尾牌不足一局也不接受');
  assert.equal(B.secondStartOk([1, 2, 3, 4]), false, '至少要有一個完整局');
  const laterBad = [0, 7, 8, 0, 0, 9, 8, 0, 1];
  assert.ok(B.handSensitive(laterBad.slice(1, 5)));
  assert.equal(B.secondStartOk(laterBad), false, '不能只查第一局、略過後面的非敏感局');
  B.rules.secondStart = true;
  assert.ok(B.qualifies(good, true));
  assert.equal(B.qualifies(bad, true), false);
  assert.equal(B.qualifiesFinal(bad), false);
  assert.equal(B.diagnoseChain(bad).kind, 'secondStart');
  const joined = good.concat(bad); joined.parts = [8, 8];
  assert.equal(B.qualifiesFinal(joined), false, '接段後也檢查後面短段的第二張');
  B.rules.secondStart = false;
  const baseOk = B.qualifiesFinal(joined);
  B.rules.secondStart = true;
  joined.secondParts = [true, false];
  assert.equal(B.qualifiesFinal(joined), baseOk, '原條件續排的短段不檢查第二張');
  joined.secondParts = [false, true];
  assert.equal(B.qualifiesFinal(joined), false, '有標記的短段仍要檢查第二張');
  console.log('PASS 第二張起發、尾牌豁免、後續完整局、短段邊界、續排標記及診斷');

  // 與 200 副離線實驗同種子：第二張排不下的牌改用原條件續排後剛好排滿
  // 實驗時撿段都有 A.2 的對調後穿越檢查，所以用 A.2 開啟重現；訊號對調可能破壞第二張，這裡不要求全部合格
  const mixed = await B.build({ minLen: 8, maxLen: 12, secondStart: true, chainAttempts: 1, rng: rng(5076) });
  assert.equal(mixed.leftoverCount, 0);
  for (let p = 0; p < 10; p++) assert.equal(mixed.cards.filter(c => c.point === p).length, p ? 32 : 128);
  const fbCards = mixed.chains.reduce((n, ch) => n + ch.parts.reduce((m, len, i) => m + (ch.secondParts[i] ? 0 : len), 0), 0);
  assert.ok(mixed.stats.fallbackSegments > 0);
  assert.equal(fbCards, mixed.stats.fallbackCards);
  verifyParts(mixed);
  assert.equal(B.rules.secondStart, true, '續排結束後要恢復第二張檢查');
  console.log(`PASS 原條件續排排滿整副（原條件 ${fbCards} 張）`);

  const result = await B.build({ minLen: 8, maxLen: 12, secondStart: true, signalRule: false, chainMerge: false, rng: rng(1002) }); // 測短段邊界與切牌，固定用原本接段方式
  assert.equal(result.cards.length, 416);
  for (let p = 0; p < 10; p++) assert.equal(result.cards.filter(c => c.point === p).length, p ? 32 : 128);
  assert.ok(result.chains.length > 0 && result.chains.every(ch => ch.qualified));
  verifyParts(result);
  const out = await O.optimize(result, { secondStart: true, signalRule: false, maxPasses: 1 });
  assert.equal(out.rules.secondStart, true);
  verifyParts(out.after);
  assert.ok(out.after.chains.every(ch => ch.qualified));
  const shifted = JSON.parse(JSON.stringify(result));
  shifted.cards = shifted.cards.slice(37).concat(shifted.cards.slice(0, 37));
  shifted.chains.forEach(ch => { ch.start = ((ch.start - 1 - 37 + 416) % 416) + 1; });
  const rotated = await O.optimize(shifted, { secondStart: true, signalRule: false, maxPasses: 0 });
  verifyParts(rotated.after);
  console.log('PASS 完整牌庫、接段、局內優化及切牌後短段邊界');

  const signaled = await B.build({ minLen: 8, maxLen: 12, secondStart: true, rng: rng(1002) });
  verifyParts(signaled);
  const secondFailures = signaled.signal.issues.filter(i => i.kind === 'secondStart');
  assert.ok(secondFailures.length > 0, '固定樣本的訊號移牌破壞新增條件，必須明確報錯');
  assert.equal(signaled.signal.ok, false);
  await assert.rejects(O.optimize(signaled, { secondStart: true }), /原牌有長段尚未通過/);
  console.log(`PASS 訊號移牌後重新驗收並攔下不合格優化（${secondFailures.length} 段）`);
  await B.build({ idleLimit: 1, computeTries: 1, chainAttempts: 1, rng: rng(1) });
  assert.equal(B.rules.secondStart, false, '未勾選時不得沿用上副牌的新限制');
  console.log('PASS 預設不啟用新增條件');
})().catch(e => { console.error(e); process.exitCode = 1; });
