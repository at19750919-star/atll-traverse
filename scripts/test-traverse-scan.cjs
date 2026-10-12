const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const context = vm.createContext({ console, Math });
for (const file of ['traverse_builder.js', 'traverse_process_engine.js', 'traverse_scan.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
}
const { TraverseScan: S, TraverseProcess: P, TraverseBuilder: B } = context;
const plain = value => JSON.parse(JSON.stringify(value));
const ids = cards => Array.from(cards, c => c.id);
const rulesBefore = JSON.stringify(B.rules);
const model = S.build();
let direct, directEvents = 0;
const directPicks = [], directAttempts = [];
for (const e of P.run(S.OPTIONS)) {
    direct = e; directEvents++;
    if (e.kind === 'pick') directPicks.push(ids(e.candidate));
    if (e.kind === 'attemptDone') directAttempts.push(e.chains.map(ids));
}
assert.deepEqual(plain(model.summary), plain(S.counts(direct)), '動畫好段／輪數／長段／剩牌與直接引擎一致');
assert.deepEqual(ids(model.final.shoe), ids(direct.shoe), '不只數量，整副實體牌順序也須相同');
assert.equal(model.final.shoe.length, 416);
assert.equal(new Set(ids(model.final.shoe)).size, 416);
assert.deepEqual(plain(model.events.filter(e => e.kind === 'pick').map(e => ids(e.candidate))), directPicks);
assert.deepEqual(plain(model.events.filter(e => e.kind === 'attemptDone').map(e => e.chains.map(ids))), plain(directAttempts));
assert.equal(model.events.filter(e => e.kind !== 'inspect').length, directEvents, '保留原引擎所有一般事件');
assert.ok(model.events.filter(e => e.kind === 'inspect').length > 0, '有保存逐視窗事件');
assert.equal(model.events.filter(e => e.kind === 'shuffle').length, model.summary.rounds);
assert.equal(model.frames.filter(f => model.events[f.eventIndex].kind === 'shuffle').length, model.summary.rounds, '每輪重洗都有動畫畫格');
assert.equal(model.frames.filter(f => model.events[f.eventIndex].kind === 'pick').length, model.summary.good, '每次撿段都有動畫');
assert.equal(model.frames.filter(f => model.events[f.eventIndex].kind === 'join').length,
    model.events.filter(e => e.kind === 'join').length, '每次接成功都有動畫');
for (let i = 1; i < model.events.length - 1; i++) {
    const e = model.events[i];
    if (e.kind !== 'pick' || e.phase !== 1 || model.events[i + 1].kind !== 'inspect') continue;
    const found = model.events[i - 1], after = model.eventAt(i + 1);
    assert.equal(after.start, found.rest.findIndex(c => c.id === found.candidate[0].id), '拉出後仍從同一位置掃描');
}
assert.ok(model.duration >= 120000 && model.duration <= 240000, '預設總時長 2～4 分鐘');
assert.equal(model.keypoints[0].number, 1);
for (let i = 0; i < model.keypoints.length; i++) {
    const k = model.keypoints[i], f = model.frames[k.frameIndex], e = model.eventAt(k.eventIndex);
    assert.equal(k.number, i + 1);
    assert.equal(f.key, k.number);
    assert.ok(!i || k.frameIndex > model.keypoints[i - 1].frameIndex);
    const explanation = S.explain(e, f);
    assert.ok(explanation.title.length && explanation.text.length);
    assert.ok(!/undefined|NaN/.test(explanation.text));
}
for (const f of model.frames) {
    const e = model.eventAt(f.eventIndex);
    assert.deepEqual(plain(S.counts(e)), plain(S.counts(e.kind === 'inspect' ? model.events[model.events[f.eventIndex].source] : model.events[f.eventIndex])));
    const all = e.segments.flat().concat(e.rest);
    assert.equal(all.length, 416);
    assert.equal(new Set(ids(all)).size, 416);
    if (e.kind === 'inspect') {
        const p = P.check(e.candidate);
        const z = e.candidate.filter(c => c.point === 0).length;
        const totalZ = e.rest.filter(c => c.point === 0).length;
        assert.equal(e.verdict, p.ok && z * e.rest.length >= totalZ * e.candidate.length);
        assert.deepEqual(ids(e.candidate), ids(e.rest.slice(e.start, e.start + e.candidate.length)));
    }
    if (e.kind === 'pick' || e.kind === 'join') assert.ok(P.check(e.candidate).ok);
}
assert.ok(model.keypoints.some(k => /第一次不合格/.test(k.title)));
assert.ok(model.keypoints.some(k => /第一次合格/.test(k.title)));
assert.ok(model.keypoints.some(k => /不能接/.test(k.title)));
assert.ok(model.keypoints.some(k => /可接/.test(k.title)));
assert.equal(model.keypoints.filter(k => /次拼接/.test(k.title)).length, 3);
assert.ok(model.keypoints.some(k => k.title.includes(`最後一輪洗牌：第 ${direct.shuffles} 輪`)));
const firstFound = model.events.find(e => e.kind === 'found');
assert.equal(S.trace(firstFound.candidate.map(c => c.point)).filter(r => r.exempt).length, 4);
assert.ok(!S.trace(firstFound.candidate.map(c => c.point)).some(r => r.failure !== undefined));
assert.equal(JSON.stringify(B.rules), rulesBefore, '不改共用引擎設定');
for (const filename of ['traverse_scan.html', 'traverse_scan.css', 'traverse_scan.js']) {
    const text = fs.readFileSync(path.join(root, filename), 'utf8');
    assert.ok(!/https?:\/\/|\bfetch\s*\(|\bimport\s*\(/.test(text), '新增頁面不依賴網路');
}
console.log(JSON.stringify({ ok: true, seed: S.OPTIONS.seed, summary: model.summary,
    events: model.events.length, frames: model.frames.length, seconds: Math.round(model.duration / 1000),
    keypoints: model.keypoints.map(k => `${k.number}. ${k.title}`) }, null, 2));
