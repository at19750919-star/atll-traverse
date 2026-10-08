// 研究用：原引擎只在隔離 VM 中公開內部函式；不修改正式演算法、不導出、不上傳。
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '..');
const builderSource = fs.readFileSync(path.join(ROOT, 'traverse_builder.js'), 'utf8');
const batchSource = fs.readFileSync(path.join(ROOT, 'scripts/batch-traverse.mjs'), 'utf8');
const ctx = vm.createContext({ console, setTimeout, performance });
const instrumented = builderSource
  .replace('const segs = p1.segs.concat(p2.segs);', 'const segs = p1.segs.concat(p2.segs); globalThis.researchSegments = segs.map(s => s.slice());')
  .replace('global.TraverseBuilder = {', 'global.research = { phaseChain, applySignalRule, assignCards, shuffleInPlace }; global.TraverseBuilder = {');
vm.runInContext(instrumented, ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'traverse_export.js'), 'utf8'), ctx);
const B = ctx.TraverseBuilder, E = ctx.TraverseExport, R = ctx.research;
const ref = vm.createContext({ B, E, opt: { tripleTie: true, signalRule: true } });
vm.runInContext(batchSource.slice(batchSource.indexOf('function violationOf('), batchSource.indexOf('// ===== 一副')) + '\nglobalThis.api = { cutLastViolation, prepareBase, collectViolations };', ref);
const original = ref.api;
const copy = x => JSON.parse(JSON.stringify(x));
function rng(seed) { return () => { let t = seed += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// 預先算好每個位置的一局；判定與現行批次逐點發牌交叉驗證。
function analyze(cards, verify = false) {
  const n = cards.length;
  const hands = cards.map((_, start) => {
    const cs = Array.from({ length: 6 }, (_, k) => cards[(start + k) % n]);
    const ps = cs.map(c => c.point), h = B.simulateHand(ps, 0, 6);
    const pts = ps.slice(0, h.size), swp = pts.slice();
    [swp[0], swp[1]] = [swp[1], swp[0]];
    const sw = B.simulateHand(swp, 0, h.size);
    return { ...h, start, trip: B.isTriple(pts), signal: B.isSignalHand(pts),
      trav: cs.slice(0, h.size).every(c => c.traverse), sw,
      noSwap: !sw || sw.size !== h.size,
      same: !!sw && sw.size === h.size && sw.result === h.result && sw.result !== '和',
      color: !['RRRB', 'BBBR'].includes(cs.slice(0, 4).map(c => c.back_color).join('')) };
  });
  const depths = [], colorDepths = [], safe = [], safeColor = [];
  const causes = { noSwap: 0, same: 0, tripleSignal: 0, color: 0 };
  const firstBadPositions = {}, badPositions = {};
  for (let cut = 0; cut < n; cut++) {
    const rounds = [];
    for (let used = 0; used < n;) {
      const h = hands[(cut + used) % n];
      if (used + h.size > n) break;
      rounds.push(h); used += h.size;
    }
    let depth = 0, colorDepth = 0;
    const cutCauses = new Set();
    let firstBad = null;
    rounds.forEach((h, i) => {
      if (!h.trav) return;
      const why = [];
      if (h.noSwap) why.push('noSwap');
      if (h.same) why.push('same');
      if (rounds.length > 1) {
        const prev = rounds[(i + rounds.length - 1) % rounds.length];
        const need = prev.trip ? '和' : prev.signal ? '莊' : '閒';
        const tripleBad = prev.trip !== (h.result === '和');
        const signalBad = i > 0 && !prev.trip && h.result !== '和' && h.result !== need;
        const fixable = h.result === need || (h.sw && h.sw.size === h.size && h.sw.result === need);
        if (prev.trav && (tripleBad || signalBad) && !fixable) why.push('tripleSignal');
      }
      if (why.length) {
        depth = i + 1;
        for (const k of why) cutCauses.add(k);
        firstBad ??= h.start;
        badPositions[h.start] = (badPositions[h.start] || 0) + 1;
      }
      if (h.color) { colorDepth = i + 1; cutCauses.add('color'); }
    });
    colorDepth = Math.max(depth, colorDepth);
    if (firstBad !== null) firstBadPositions[firstBad] = (firstBadPositions[firstBad] || 0) + 1;
    for (const k of cutCauses) causes[k]++;
    depths.push(depth); colorDepths.push(colorDepth);
    if (!depth) safe.push(cut);
    if (!colorDepth) safeColor.push(cut);
    if (verify) {
      assert.equal(depth, original.cutLastViolation(cards, cut), `cut=${cut}`);
      assert.equal(colorDepth, original.cutLastViolation(cards, cut, true), `color cut=${cut}`);
    }
  }
  const firstRounds = E.dealRounds(cards).filter(r => r.hand);
  const bankers = firstRounds.filter(r => r.result === '莊').length;
  const nine = firstRounds.filter(r => r.cards.at(-1).rank === '9')
    .map(r => (r.start + r.cards.length) % n).filter(c => safe.includes(c));
  const viableNine = nine.filter(c => {
    const rs = E.dealRounds(E.cutDeck(cards, c)).filter(r => r.hand);
    return Math.abs(rs.filter(r => r.result === '莊').length * 2 - rs.length) <= 8;
  });
  return { count: safe.length, colorCount: safeColor.length, causes, safe, safeColor, depths,
    nine: nine.length, viableNine: viableNine.length, sideDiff: Math.abs(bankers * 2 - firstRounds.length),
    firstBadPositions, badPositions };
}
function compact(a) { const { safe, safeColor, depths, firstBadPositions, badPositions, ...r } = a; return r; }
function cardCounts(cards) { return cards.reduce((a, c) => (a[c.point]++, a), new Array(10).fill(0)); }
function candidate(chains, leftover, random) {
  chains = chains.map(ch => { const x = ch.slice(); x.parts = ch.parts; return x; });
  leftover = leftover.slice();
  const signal = R.applySignalRule(chains, leftover);
  const pts = chains.flat().concat(leftover);
  const assigned = R.assignCards(pts, random);
  const cards = assigned.cards.map((c, i) => ({ ...c, traverse: i < pts.length - leftover.length }));
  assert.deepEqual(cardCounts(cards), [128, 32, 32, 32, 32, 32, 32, 32, 32, 32]);
  return { chains, cards, signal, colorOk: assigned.colorOk, analysis: analyze(cards) };
}
const noop = { progress() {}, cancelled: () => false };
const outputPath = path.join(ROOT, 'scripts/validation/safe-cuts-research-2026-10-08.json');

async function main() {
  // 先前 300 個固定種子中全部 8 個零剩牌種子；不是依安全點數挑選。
  const seeds = [1110, 1124, 1139, 1197, 1220, 1230, 1284, 1292];
  const output = { date: '2026-10-08', baseCommit: '49bc1cf', builderHash: crypto.createHash('sha256').update(builderSource).digest('hex'),
    method: '全部 8 個已知零剩牌種子；三條與訊號開啟、強關閉、8~12 張；正式引擎未修改；每副測試同批短段重新接段 40 次及長段換序 100 次。', shoes: [] };
  for (const seed of seeds) {
    const started = Date.now();
    const res = await B.build({ rng: rng(seed) });
    assert.equal(res.leftoverCount, 0);
    const segments = copy(ctx.researchSegments);
    const base = original.prepareBase(res);
    const baseline = analyze(base, true);
    const originalChains = res.chains.map(ch => res.cards.slice(ch.start - 1, ch.start - 1 + ch.length).map(c => c.point));
    const row = { seed, baseline: { ...compact(baseline), signalOk: res.signal.ok, chains: res.chains.length, longest: res.chains[0].length }, trials: {},
      baselineCards: copy(base), baselineChains: copy(res.chains), baselineTopBad: Object.entries(baseline.badPositions).sort((a,b) => b[1]-a[1]).slice(0, 5) };
    for (const method of ['reorder', 'rechain']) {
      const random = rng(seed + (method === 'reorder' ? 100000 : 200000));
      let best = null, bestValid = null, bestReady = null, valid = 0;
      const count = method === 'reorder' ? 100 : 40;
      for (let trial = 0; trial < count; trial++) {
        const chains = method === 'reorder'
          ? R.shuffleInPlace(originalChains.map(ch => ch.slice()), random)
          : await R.phaseChain(segments, { chainAttempts: 1, rng: random }, noop);
        const c = candidate(chains, [], random);
        if (!best || c.analysis.count > best.analysis.count) best = c;
        if (c.signal.ok && c.colorOk) {
          valid++;
          if (!bestValid || c.analysis.count > bestValid.analysis.count) bestValid = c;
          if (c.analysis.viableNine > 0 && (!bestReady || c.analysis.count > bestReady.analysis.count)) bestReady = c;
        }
      }
      for (const c of [best, bestValid, bestReady].filter(Boolean)) analyze(c.cards, true);
      row.trials[method] = { count, valid, best: compact(best.analysis),
        bestValid: bestValid && compact(bestValid.analysis), bestReady: bestReady && compact(bestReady.analysis),
        bestReadyCards: bestReady && copy(bestReady.cards), bestReadyChains: bestReady && copy(bestReady.chains) };
    }
    row.ms = Date.now() - started;
    output.shoes.push(row);
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n');
    console.log(JSON.stringify({ seed, baseline: row.baseline, reorder: row.trials.reorder.bestReady, rechain: row.trials.rechain.bestReady, ms: row.ms }));
  }
}
function permutations(cards) {
  const out = [], used = new Array(cards.length).fill(false), current = [];
  function visit() {
    if (current.length === cards.length) { out.push(current.slice()); return; }
    const seen = new Set();
    cards.forEach((c, i) => {
      if (used[i] || seen.has(c.point)) return;
      seen.add(c.point); used[i] = true; current.push(c); visit(); current.pop(); used[i] = false;
    });
  }
  visit(); return out;
}
async function localSearch(exhaustive = false) {
  const output = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  for (const row of output.shoes) {
    // 保留現行莊閒差距；不用不合格基線證明改善。
    if (!row.baseline.signalOk || !row.baseline.viableNine) continue;
    const started = Date.now();
    let cards = copy(row.baselineCards), a = analyze(cards), accepted = 0, evaluated = 0;
    const hands = E.dealRounds(cards).filter(r => r.hand);
    const passes = [];
    for (let pass = 0; pass < 4; pass++) {
      const before = accepted;
      for (const hand of hands) {
        const ch = row.baselineChains.find(ch => hand.start >= ch.start - 1 && hand.start < ch.start - 1 + ch.length);
        let bestCards = null, bestAnalysis = a;
        const alternatives = [];
        if (exhaustive) alternatives.push(...permutations(cards.slice(hand.start, hand.start + hand.hand.size)));
        else for (let i = 0; i < hand.hand.size; i++) for (let j = i + 1; j < hand.hand.size; j++) {
          const alt = cards.slice(hand.start, hand.start + hand.hand.size);
          if (alt[i].point === alt[j].point) continue;
          [alt[i], alt[j]] = [alt[j], alt[i]]; alternatives.push(alt);
        }
        for (const alt of alternatives) {
          const test = cards.slice();
          test.splice(hand.start, hand.hand.size, ...alt);
          const ps = test.slice(hand.start, hand.start + hand.hand.size).map(c => c.point);
          const h = B.simulateHand(ps, 0, ps.length);
          if (!h || h.size !== hand.hand.size || h.result !== hand.result || !B.handSensitive(ps)) continue;
          if (!B.qualifiesFinal(test.slice(ch.start - 1, ch.start - 1 + ch.length).map(c => c.point))) continue;
          const ta = analyze(test); evaluated++;
          if (ta.count > bestAnalysis.count && ta.viableNine > 0) { bestCards = test; bestAnalysis = ta; }
        }
        if (bestCards) { cards = bestCards; a = bestAnalysis; accepted++; }
      }
      passes.push({ pass: pass + 1, count: a.count, accepted: accepted - before });
      if (accepted === before) break;
    }
    const chains = row.baselineChains.map(ch => cards.slice(ch.start - 1, ch.start - 1 + ch.length).map(c => c.point));
    const final = candidate(chains, [], rng(row.seed + 300000));
    assert.equal(final.signal.flips, 0, '局內修改不得改變訊號方向');
    assert.equal(final.signal.ok, true);
    assert.equal(final.colorOk, true);
    assert.equal(final.analysis.count, a.count);
    assert.equal(final.analysis.sideDiff, row.baseline.sideDiff);
    analyze(final.cards, true);
    const key = exhaustive ? 'permutationSearch' : 'localSearch';
    row[key] = { passes, accepted, evaluated, result: compact(final.analysis), cards: copy(final.cards), ms: Date.now() - started };
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n');
    console.log(JSON.stringify({ seed: row.seed, before: row.baseline.count, ...row[key], cards: undefined }));
  }
}
function colorCompatibility(cards) {
  const a = analyze(cards), rounds = E.dealRounds(cards).filter(r => r.hand);
  const baselineStarts = new Set(rounds.map(r => r.start));
  const extra = a.safe.filter(c => !baselineStarts.has(c));
  const compatible = [];
  for (const cut of extra) {
    const parent = cards.map((_, i) => i), parity = cards.map(() => 0);
    function find(x) {
      if (parent[x] === x) return [x, 0];
      const [root, p] = find(parent[x]); parity[x] ^= p; parent[x] = root; return [root, parity[x]];
    }
    function link(x, y, different) {
      const [rx, px] = find(x), [ry, py] = find(y);
      if (rx === ry) return (px ^ py) === different;
      parent[rx] = ry; parity[rx] = px ^ py ^ different; return true;
    }
    function constrain(rs, offset) {
      for (const r of rs) if (r.hand) {
        const p = (r.start + offset) % cards.length;
        if (!link(p, (p + 1) % cards.length, 0) || !link(p, (p + 2) % cards.length, 0) || !link(p, (p + 3) % cards.length, 1)) return false;
      }
      return true;
    }
    assert.equal(constrain(rounds, 0), true);
    if (constrain(E.dealRounds(E.cutDeck(cards, cut)), cut)) compatible.push(cut);
  }
  return { baselineRounds: rounds.length, extraPointSafe: extra.length, colorCompatibleExtra: compatible };
}
function colorTest() {
  const output = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  for (const row of output.shoes) {
    row.colorCompatibility = { baseline: colorCompatibility(row.baselineCards) };
    if (row.permutationSearch) row.colorCompatibility.permutation = colorCompatibility(row.permutationSearch.cards);
    if (row.exploreLocal) row.colorCompatibility.explore = colorCompatibility(row.exploreLocal.cards);
    console.log(JSON.stringify({ seed: row.seed, ...row.colorCompatibility }));
  }
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n');
}
function validateSaved() {
  const output = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  let comparisons = 0, optimized = 0;
  for (const row of output.shoes) {
    const base = E.dealRounds(row.baselineCards).filter(r => r.hand);
    for (const item of [{ cards: row.baselineCards, result: row.baseline }, ...['localSearch', 'permutationSearch', 'exploreLocal'].map(k => row[k]).filter(Boolean)]) {
      const a = analyze(item.cards, true); comparisons += item.cards.length * 2;
      assert.equal(a.count, item.result.count); assert.equal(a.colorCount, item.result.colorCount);
      const ids = new Map();
      for (const c of item.cards) { const k = `${c.rank}|${c.suit}|${c.back_color}`; ids.set(k, (ids.get(k) || 0) + 1); }
      assert.equal(ids.size, 104); assert.ok([...ids.values()].every(n => n === 4));
      if (item.result === row.baseline) continue;
      const rs = E.dealRounds(item.cards).filter(r => r.hand);
      assert.equal(rs.length, base.length);
      rs.forEach((r, i) => {
        assert.equal(r.start, base[i].start); assert.equal(r.hand.size, base[i].hand.size); assert.equal(r.result, base[i].result);
        assert.deepEqual(cardCounts(r.cards), cardCounts(base[i].cards));
      });
      const chains = row.baselineChains.map(ch => item.cards.slice(ch.start - 1, ch.start - 1 + ch.length).map(c => c.point));
      assert.ok(chains.every(ch => B.qualifiesFinal(ch)));
      const signal = R.applySignalRule(chains, []);
      assert.equal(signal.ok, true); assert.equal(signal.flips, 0);
      assert.equal(a.sideDiff, row.baseline.sideDiff); assert.ok(a.viableNine > 0); optimized++;
    }
  }
  console.log(JSON.stringify({ passed: true, shoes: output.shoes.length, optimized, originalCutChecks: comparisons }));
}
async function exploreLocal() {
  const output = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  for (const row of output.shoes.filter(r => r.permutationSearch)) {
    const started = Date.now(), random = rng(row.seed + 400000);
    let bestCards = copy(row.permutationSearch.cards), bestAnalysis = analyze(bestCards), evaluated = 0, accepted = 0;
    const hands = E.dealRounds(bestCards).filter(r => r.hand);
    const alternatives = hands.map(hand => permutations(hand.cards).filter(cs => {
      const ps = cs.map(c => c.point), h = B.simulateHand(ps, 0, ps.length);
      return h && h.size === hand.hand.size && h.result === hand.result && B.handSensitive(ps);
    }));
    const runCounts = [];
    for (let run = 0; run < 8; run++) {
      let cards = bestCards.slice(), a = bestAnalysis;
      for (let step = 0; step < 5000; step++) {
        const hi = Math.floor(random() * hands.length), hand = hands[hi];
        const alt = alternatives[hi][Math.floor(random() * alternatives[hi].length)];
        if (alt.every((c, i) => c.point === cards[hand.start + i].point)) continue;
        const test = cards.slice(); test.splice(hand.start, hand.hand.size, ...alt);
        const ch = row.baselineChains.find(ch => hand.start >= ch.start - 1 && hand.start < ch.start - 1 + ch.length);
        if (!B.qualifiesFinal(test.slice(ch.start - 1, ch.start - 1 + ch.length).map(c => c.point))) continue;
        const ta = analyze(test); evaluated++;
        const temperature = 0.1 + 1.4 * (1 - step / 5000);
        if (ta.viableNine > 0 && (ta.count >= a.count || random() < Math.exp((ta.count - a.count) / temperature))) {
          cards = test; a = ta; accepted++;
          if (a.count > bestAnalysis.count) { bestAnalysis = a; bestCards = cards.slice(); }
        }
      }
      runCounts.push(bestAnalysis.count);
    }
    const chains = row.baselineChains.map(ch => bestCards.slice(ch.start - 1, ch.start - 1 + ch.length).map(c => c.point));
    const final = candidate(chains, [], rng(row.seed + 500000));
    assert.equal(final.signal.ok, true); assert.equal(final.signal.flips, 0); assert.equal(final.colorOk, true);
    assert.equal(final.analysis.count, bestAnalysis.count); assert.equal(final.analysis.sideDiff, row.baseline.sideDiff);
    analyze(final.cards, true);
    row.exploreLocal = { runCounts, evaluated, accepted, result: compact(final.analysis), cards: copy(final.cards), ms: Date.now() - started };
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n');
    console.log(JSON.stringify({ seed: row.seed, before: row.baseline.count, ...row.exploreLocal, cards: undefined }));
  }
}

async function strongTest() {
  const output = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  output.strong = [];
  for (const seed of [1124, 1139, 1197, 1220]) {
    const started = Date.now();
    const res = await B.build({ rng: rng(seed), strong: true });
    const a = analyze(original.prepareBase(res), true);
    const item = { seed, leftover: res.leftoverCount, signalOk: res.signal.ok, chains: res.chains.length, ...compact(a), ms: Date.now() - started };
    output.strong.push(item);
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n');
    console.log(JSON.stringify(item));
  }
}
const modes = { local: () => localSearch(), permutations: () => localSearch(true), explore: exploreLocal, strong: strongTest,
  color: () => Promise.resolve(colorTest()), validate: () => Promise.resolve(validateSaved()) };
if (require.main === module) (modes[process.argv[2]] || main)()
  .catch(e => { console.error(e); process.exitCode = 1; });
module.exports = { B, E, R, ctx, rng, analyze, compact, candidate, original };
