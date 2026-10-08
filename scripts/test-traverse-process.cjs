const assert = require('node:assert/strict');
require('../traverse_builder.js');
require('../traverse_process_engine.js');
const P = globalThis.TraverseProcess, B = globalThis.TraverseBuilder;
B.rules.tripleTie = false; B.rules.strong = false;
function conservation(cards) {
    assert.equal(cards.length, 416);
    assert.equal(new Set(cards.map(c => c.id)).size, 416);
    for (let p = 0; p < 10; p++) assert.equal(cards.filter(c => c.point === p).length, p ? 32 : 128);
}
function run(seed, inspect = false) {
    let last, count = 0, picks = 0, joins = 0;
    for (const e of P.run({ seed, idleLimit: inspect ? 5 : 100, computeTries: 300, chainAttempts: 2, inspect: () => inspect })) {
        count++;
        conservation(e.phase < 3 ? e.rest.concat(e.segments.flat()) : e.rest.concat(e.chains.flat(), e.active, e.pool.flat()));
        if (e.kind === 'found') {
            const z = e.candidate.filter(c => !c.point).length, zeros = e.rest.filter(c => !c.point).length;
            assert.ok(z * e.rest.length >= zeros * e.candidate.length);
        }
        if (e.kind === 'pick') {
            picks++; assert.ok(B.qualifies(e.candidate.map(c => c.point)));
            assert.ok(e.candidate.every(c => !e.rest.some(r => r.id === c.id)));
        }
        if (e.kind === 'join') { joins++; assert.ok(B.qualifies(e.active.map(c => c.point))); }
        if (e.kind === 'joinTest') assert.equal(e.verdict, B.qualifies(e.candidate.map(c => c.point)));
        last = e;
    }
    assert.equal(last.kind, 'done'); conservation(last.shoe);
    assert.deepEqual(last.shoe.slice(416 - last.rest.length), last.rest);
    assert.ok(last.chains.every(c => B.qualifies(c.map(c => c.point))));
    return { ids: last.shoe.map(c => c.id), count, picks, joins, leftover: last.rest.length };
}
const a = run(416), b = run(416), c = run(73, true);
assert.deepEqual(a, b, '同種子須重現');
assert.notDeepEqual(a.ids, c.ids);
assert.ok(a.picks && a.joins && c.picks && c.joins);
assert.throws(() => P.run({ minLen: 12, maxLen: 8 }).next());
console.log(JSON.stringify({ passed: true, runs: [a, c].map(({ ids, ...stats }) => stats) }));
