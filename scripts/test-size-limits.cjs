// 4／5／6 張局上下限：不設時與原演算法相同、上限不被撿段超過、下限讓該張數局變多。
// 用法：node scripts/test-size-limits.cjs [副數，預設 40]
const assert = require('node:assert/strict');
const path = require('node:path');
require(path.join(__dirname, '..', 'traverse_builder.js'));
const B = globalThis.TraverseBuilder;
const N = Math.max(10, parseInt(process.argv[2], 10) || 40);
const seeded = seed => () => { let t = seed += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const pct = c => { const n = c[4] + c[5] + c[6]; return [4, 5, 6].map(k => `${k}張 ${(c[k] / n * 100).toFixed(1)}%`).join(' / '); };
const median = a => a.slice().sort((x, y) => x - y)[a.length >> 1];

(async () => {
  // 1. 留白／全空等同不設，牌序與原本完全相同
  assert.equal(B.normalizeSizeLimits(null), null);
  assert.equal(B.normalizeSizeLimits({ 4: { min: null, max: null }, 5: {}, 6: {} }), null);
  for (const seed of [11, 416]) {
    const a = await B.build({ rng: seeded(seed) });
    const b = await B.build({ rng: seeded(seed), sizeLimits: { 4: {}, 5: {}, 6: {} } });
    assert.deepEqual(a.cards, b.cards);
    assert.equal(b.stats.sizeTally, null);
  }
  console.log('PASS 不設上下限時牌序與原本相同');

  // 2. 上限：撿段計數不超過上限
  for (let i = 0; i < 10; i++) {
    const r = await B.build({ sizeLimits: { 4: { max: 30 }, 6: { max: 25 } } });
    assert(r.stats.sizeTally[4] <= 30 && r.stats.sizeTally[6] <= 25, JSON.stringify(r.stats.sizeTally));
  }
  console.log('PASS 上限：撿段計數不超過上限（10 副）');

  // 3. 下限：5 張局下限 25 與不設比較
  const runs = async limits => {
    const all = { 4: 0, 5: 0, 6: 0 }, five = [], left = [];
    let hit = 0;
    for (let i = 0; i < N; i++) {
      const r = await B.build(limits ? { sizeLimits: limits } : {});
      const c = B.roundSizeCounts(r.cards.map(x => x.point));
      [4, 5, 6].forEach(k => { all[k] += c[k]; });
      five.push(c[5]); left.push(r.leftoverCount);
      if (c[5] >= 25) hit++;
    }
    return { all, five: median(five), left: median(left), hit };
  };
  const base = await runs(null);
  const lim = await runs({ 5: { min: 25 } });
  console.log(`  不設：${pct(base.all)}｜5張局中位 ${base.five}｜≥25 ${base.hit}/${N}｜剩牌中位 ${base.left}`);
  console.log(`  5張下限25：${pct(lim.all)}｜5張局中位 ${lim.five}｜≥25 ${lim.hit}/${N}｜剩牌中位 ${lim.left}`);
  assert(lim.five > base.five + 3, '5 張局下限沒有讓 5 張局變多');
  console.log('PASS 下限：5 張局明顯變多');
})().catch(e => { console.error(e); process.exit(1); });
