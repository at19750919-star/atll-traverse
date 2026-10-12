const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const context = vm.createContext({ console });
for (const file of ['traverse_builder.js', 'traverse_process_engine.js', 'traverse_story.js'])
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
const { TraverseStory: S, TraverseProcess: P, TraverseBuilder: B } = context;
const rulesBefore = JSON.stringify(B.rules);
const counts = new Map(), phases = new Set();
let last, events = 0, rejected = 0, quotaRejected = 0;
// 真實生成器走完；逐候選模式另跑前段以覆蓋實際拒絕解說。
for (const e of P.run()) {
    const info = S.explain(e);
    assert.ok(info.text.includes(`剩牌 ${e.rest.length} 張`));
    assert.ok(info.text.includes(`已排 ${e.segments.length} 段`));
    assert.equal(info.action, e.message);
    if (e.kind === 'pick' || e.kind === 'join') assert.ok(P.check(e.candidate).ok);
    phases.add(e.phase); counts.set(e.kind, (counts.get(e.kind) || 0) + 1);
    events++; last = e;
}
assert.equal(last.kind, 'done');
assert.equal(last.shoe.length, 416);
assert.equal(new Set(last.shoe.map(c => c.id)).size, 416);
assert.ok(last.chains.every(c => P.check(c).ok));
assert.deepEqual([...phases], [0, 1, 2, 3, 4]);
assert.ok(S.explain(last).reason.includes(`尾端 ${last.rest.length} 張`));
for (const e of P.run({ inspect: () => true, idleLimit: 10, computeTries: 5, chainAttempts: 1 })) {
    const info = S.explain(e);
    assert.ok(info.text.includes(`剩牌 ${e.rest.length} 張`));
    assert.ok(info.text.includes(`已排 ${e.segments.length} 段`));
    if (e.verdict === false && e.candidate?.length) {
        rejected++;
        assert.ok(info.reason.length > 0);
        if (e.kind === 'inspect' && P.check(e.candidate).ok) {
            quotaRejected++; assert.ok(info.reason.includes('比例不足'));
        }
    }
}
assert.ok(rejected > 0); assert.ok(quotaRejected > 0);
const cards = pts => pts.map((point, i) => ({ point, id: i + 1 }));
assert.match(S.diagnose(cards([0, 0, 0, 0, 0, 0, 0, 0])), /從第 1 張起發，到第 7 張時只剩 2 張/);
// 在真實點數空間找一個穿越但不敏感的例子，以及對調後不穿越的例子。
let insensitive = false, swappedFailure = false;
const rng = (() => { let n = 7; return () => (n = Math.imul(n, 1664525) + 1013904223 >>> 0) / 4294967296; })();
for (let i = 0; i < 100000 && (!insensitive || !swappedFailure); i++) {
    const c = cards(Array.from({ length: 8 + Math.floor(rng() * 5) }, () => Math.floor(rng() * 10)));
    const result = P.check(c);
    if (result.reason.includes('局不敏感')) { assert.match(S.diagnose(c), /第 \d+ 局（段內第 \d+ 張起）不敏感/); insensitive = true; }
    if (result.reason.includes('對調後不穿越')) { assert.match(S.diagnose(c), /單獨對調後不穿越：從第 \d+ 張起發/); swappedFailure = true; }
}
assert.ok(insensitive); assert.ok(swappedFailure);
// 每個 phase 第一個 snapshot 之前只有一張說明卡；不能提前顯示新階段結果。
const source = [...P.run({ idleLimit: 1, computeTries: 5, chainAttempts: 1 })];
const player = S.createPlayer(source[Symbol.iterator]());
let prior = null, seen = [], index = 0, frame;
while ((frame = player.next())) {
    if (frame.intro) {
        seen.push(frame.phase); assert.equal(frame.snapshot, prior || source[0]);
        assert.equal(frame.step, index);
    } else { assert.equal(frame.snapshot, source[index++]); prior = frame.snapshot; }
}
assert.equal(index, source.length); assert.deepEqual(seen, [0, 1, 2, 3, 4]); assert.equal(player.next(), null);
assert.equal(JSON.stringify(B.rules), rulesBefore, '不改動共用規則');
const html = fs.readFileSync(path.join(root, 'traverse_story.html'), 'utf8');
assert.ok(html.includes('value="2200" selected'));
assert.ok(!/https?:\/\//.test(html), '只載入本地資源');
assert.deepEqual([...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map(m => m[1]), ['traverse_builder.js', 'traverse_process_engine.js', 'traverse_story.js']);
console.log(JSON.stringify({ passed: true, events, phases: [...phases], rejected, quotaRejected, finalCards: last.shoe.length, leftover: last.rest.length, kinds: Object.fromEntries(counts) }));
