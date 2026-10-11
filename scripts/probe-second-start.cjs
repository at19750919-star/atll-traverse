// 固定種子比較三種設定；保留剩牌完成單次試排，不自動重跑或切末張 9。
const fs = require('node:fs');
const path = require('node:path');
require('../traverse_builder.js'); require('../traverse_export.js'); require('../traverse_optimizer.js');
const B = globalThis.TraverseBuilder, O = globalThis.TraverseOptimizer;
function rng(seed) {
  return () => { let t = seed += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
(async () => {
  const report = { method: 'Five fixed seeds per setting, real build and point-only cut analysis, default phase budgets/triple/signal rules. One build per seed, keep leftovers, no automatic reruns or ending-nine rotation. Generated shoes differ; not a same-shoe optimization comparison or general success rate.', rows: [] };
  for (const settings of [{ minLen: 8, secondStart: false }, { minLen: 9, secondStart: false }, { minLen: 9, secondStart: true }]) {
    for (let seed = 1000; seed < 1005; seed++) {
      const result = await B.build({ ...settings, maxLen: 12, rng: rng(seed) });
      const safe = O.analyze(O.prepare(result));
      const row = { ...settings, maxLen: 12, seed, safeCuts: safe.count, leftover: result.leftoverCount,
        signalOk: result.signal.ok, allQualified: result.chains.every(ch => ch.qualified),
        secondStartIssues: result.signal.issues.filter(i => i.kind === 'secondStart').length };
      report.rows.push(row);
      console.log(JSON.stringify(row));
    }
  }
  const output = path.join(__dirname, 'validation/second-start-2026-10-11.json');
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
})().catch(e => { console.error(e); process.exitCode = 1; });
