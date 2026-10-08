// 實跑原主頁 click handler 與原排牌引擎；DOM、雲端清單僅以無副作用替身承接。
// 不偽造排牌結果或失敗旗標。固定種子讓每副牌能重現。
// node scripts/test-traverse-reruns.cjs [default|unlimited] [試排數] [輸出JSON]
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '..');
const scenario = process.argv[2] || 'default';
const limit = Number(process.argv[3] || 100);
assert.ok(['default', 'unlimited'].includes(scenario));
assert.ok(Number.isSafeInteger(limit) && limit > 0);
const output = path.resolve(process.argv[4] || path.join(require('node:os').tmpdir(), `traverse-reruns-${scenario}.json`));
const html = fs.readFileSync(path.join(ROOT, 'traverse_builder.html'), 'utf8');
require(path.join(ROOT, 'traverse_builder.js'));
require(path.join(ROOT, 'traverse_export.js'));
const B = globalThis.TraverseBuilder, E = globalThis.TraverseExport;
function rng(seed) {
  return () => {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const attempts = [], events = [], errors = [], witnesses = {};
let current = null, exhausted = false, clickNo = 0;
const budget = new Error('TEST_ATTEMPT_BUDGET');
const nodes = new Map();
function reasonOf(message) {
  if (/^剩 \d+ 張排不進去.*重跑第/.test(message)) return 'leftover';
  if (/^訊號牌對調後有長段不合格，重跑第/.test(message)) return 'signal';
  if (/^卡色排不出來，重跑第/.test(message)) return 'color';
  if (/^找不到末張是 9 的安全切點，重跑第/.test(message)) return 'nine';
  if (/^莊閒差距 \d+ 局，超過上限，重跑第/.test(message)) return 'side';
  return null;
}
function node(id) {
  if (nodes.has(id)) return nodes.get(id);
  let text = '';
  const n = {
    value: '', checked: false, listeners: {}, dataset: {}, style: {},
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener(type, fn) { this.listeners[type] = fn; },
    querySelector(selector) { return node(`${id} ${selector}`); },
    querySelectorAll() { return []; }, focus() {},
    get textContent() { return text; },
    set textContent(value) {
      text = String(value);
      if (id !== 'progress') return;
      const reason = reasonOf(text);
      if (!reason) return;
      assert.ok(current);
      const event = { attempt: current.attempt, seed: current.seed, clickNo, reason, message: text, nextBuildStarted: false };
      events.push(event);
      current.reason = reason;
      if (!witnesses[reason]) witnesses[reason] = { ...event, result: current.raw };
    },
  };
  nodes.set(id, n);
  return n;
}
for (const match of html.matchAll(/<input\b[^>]*>/g)) {
  const tag = match[0], id = tag.match(/\bid="([^"]+)"/)?.[1];
  if (!id) continue;
  node(id).value = tag.match(/\bvalue="([^"]*)"/)?.[1] || '';
  node(id).checked = /\bchecked\b/.test(tag);
}
if (scenario === 'unlimited') node('maxLeftover').value = '';
const settings = Object.fromEntries([...nodes].map(([id, n]) => [id, /Rule|Tie|Mode|Nine/.test(id) ? n.checked : n.value]));
const math = Object.create(Math);
let cutRng = rng(1);
math.random = () => cutRng();
const context = vm.createContext({
  TraverseExport: E,
  TraverseBuilder: { ...B, async build(opts) {
    if (attempts.length >= limit) { exhausted = true; throw budget; }
    const previous = events.at(-1);
    if (previous && previous.clickNo === clickNo && !previous.nextBuildStarted) previous.nextBuildStarted = true;
    const seed = 1000 + attempts.length;
    cutRng = rng(seed ^ 0x9e3779b9);
    let chainProgress = 0;
    const result = await B.build({ ...opts, rng: rng(seed), onProgress(message) {
      if (message.startsWith('階段 3 接段：')) chainProgress++;
      opts.onProgress(message);
    } });
    if (!result.rejected) {
      assert.equal(result.cards.length, 416);
      for (let p = 0; p < 10; p++) assert.equal(result.cards.filter(c => c.point === p).length, p ? 32 : 128);
    }
    current = {
      attempt: attempts.length + 1, seed, clickNo, rejected: !!result.rejected,
      leftover: result.leftoverCount, signal: result.signal, colorOk: result.colorOk,
      badChains: result.chains?.filter(c => !c.qualified).length,
      chainProgress, ms: result.stats.ms, raw: JSON.parse(JSON.stringify(result)),
    };
    attempts.push(current);
    if (attempts.length % 25 === 0) console.log(JSON.stringify({ scenario, attempts: attempts.length, reruns: counts(events), colorFailures: attempts.filter(a => a.colorOk === false).length }));
    return result;
  } },
  document: { getElementById: node, querySelectorAll: () => [] },
  console: { error(e) { if (e !== budget) errors.push(String(e.stack || e)); } },
  Math: math, setTimeout,
  // 只承接完成後的背景清單預讀，不進行外部存取或上傳。
  fetch: async () => ({ ok: true, json: async () => ({ success: true, files: [] }) }),
});
// 執行原頁完整行內 JavaScript，未複製或改寫重跑條件。
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
assert.equal(inline.length, 1);
vm.runInContext(inline[0], context, { filename: 'traverse_builder.html:inline' });
function counts(list) {
  const out = { leftover: 0, signal: 0, color: 0, nine: 0, side: 0 };
  for (const item of list) out[item.reason]++;
  return out;
}
(async () => {
  const start = Date.now();
  let completed = 0;
  while (!exhausted && attempts.length < limit) {
    clickNo++;
    await node('btnRun').listeners.click();
    assert.equal(errors.length, 0, errors.join('\n'));
    if (!exhausted) {
      assert.ok(node('progress').textContent.startsWith('完成'), node('progress').textContent);
      completed++;
    }
  }
  for (const witness of Object.values(witnesses)) {
    witness.nextBuildStarted = events.find(e => e.attempt === witness.attempt).nextBuildStarted;
  }
  const report = {
    scenario, settings, method: 'original page click handler in Node vm + real unmodified build/deal functions; DOM and cloud-list stub only; seeded random; no forced failure results',
    sourceHashes: Object.fromEntries(['traverse_builder.html', 'traverse_builder.js', 'traverse_export.js'].map(f => [f, crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, f))).digest('hex')])),
    summary: { attempts: attempts.length, completed, elapsedMs: Date.now() - start,
      rerunMessages: counts(events), confirmedNextBuilds: counts(events.filter(e => e.nextBuildStarted)),
      fullBuilds: attempts.filter(a => !a.rejected).length,
      colorFailures: attempts.filter(a => a.colorOk === false).length, errors },
    events, attempts: attempts.map(({ raw, ...a }) => a), witnesses,
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ scenario, output, ...report.summary }));
})().catch(e => { console.error(e); process.exitCode = 1; });
