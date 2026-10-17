// 同一副牌的局內排列優化；不重洗、不跨局換牌，也不把卡色納入目標。
(function (global) {
    'use strict';
    const B = global.TraverseBuilder, E = global.TraverseExport;
    const clone = x => JSON.parse(JSON.stringify(x));
    const settings = o => ({ tripleTie: o.tripleTie !== false, signalRule: o.signalRule !== false, signalConfig: B.normalizeSignal(o.signalConfig || B.rules.signalConfig),
        strong: o.strong === true, secondStart: o.secondStart === true });

    function prepare(result) {
        const cards = result.cards.map(c => ({ ...c, traverse: false }));
        for (const ch of result.chains) for (let j = 0; j < ch.length; j++) cards[(ch.start - 1 + j) % cards.length].traverse = true;
        return cards;
    }
    function handInfo(cards, start, opts) {
        const cs = Array.from({ length: 6 }, (_, k) => cards[(start + k) % cards.length]);
        const ps = cs.map(c => c.point), h = B.simulateHand(ps, 0, 6);
        const pts = ps.slice(0, h.size), swp = pts.slice();
        [swp[0], swp[1]] = [swp[1], swp[0]];
        const sw = B.simulateHand(swp, 0, h.size);
        return { ...h, start, trip: B.isTriple(pts), signal: B.isSignalHand(cs.slice(0, h.size), opts.signalConfig), sw,
            trav: cs.slice(0, h.size).every(c => c.traverse),
            noSwap: !sw || sw.size !== h.size,
            same: !!sw && sw.size === h.size && (h.result === '和' ? sw.result !== '和' : sw.result === '和' || sw.result === h.result) };
    }
    function issues(h, prev, index, opts) {
        if (!h.trav) return [];
        const out = [];
        if (h.noSwap) out.push('前兩張對調後，用牌張數不同或無法成局');
        if (h.same) out.push(h.result === '和' || h.sw.result === '和' ? '和局與莊閒互換，不符合敏感局' : '前兩張對調後，莊閒沒有互換');
        if (prev && prev.trav) {
            const need = opts.tripleTie && prev.trip ? '和' : prev.signal ? '莊' : '閒';
            const tripleBad = opts.tripleTie && prev.trip !== (h.result === '和');
            const signalBad = opts.signalRule && index > 0 && !(opts.tripleTie && prev.trip)
                && (h.result === '和' ? !opts.tripleTie : h.result !== need);
            const fixable = h.result === need || (h.sw && h.sw.size === h.size && h.sw.result === need);
            if ((tripleBad || signalBad) && !fixable) out.push(`上一局要求開${need}，對調前兩張也調不成`);
        }
        return out;
    }
    // 與主頁 cutLastViolation(false) 同一規則：只檢查穿越區，第一局略過訊號、仍計三條。
    function analyze(cards, options = {}) {
        const opts = settings(options), n = cards.length;
        const hands = cards.map((_, i) => handInfo(cards, i, opts));
        const safe = [], depths = [];
        for (let cut = 0; cut < n; cut++) {
            const rounds = [];
            for (let used = 0; used < n;) {
                const h = hands[(cut + used) % n];
                if (used + h.size > n) break;
                rounds.push(h); used += h.size;
            }
            let depth = 0;
            rounds.forEach((h, i) => {
                const prev = rounds.length > 1 ? rounds[(i + rounds.length - 1) % rounds.length] : null;
                if (issues(h, prev, i, opts).length) depth = i + 1;
            });
            depths.push(depth);
            if (!depth) safe.push(cut);
        }
        return { count: safe.length, safe, depths };
    }
    function traceCut(cards, cut, options = {}) {
        const opts = settings(options);
        const rs = E.dealRounds(E.cutDeck(cards, cut)).filter(r => r.hand);
        const hs = rs.map(r => handInfo(cards, (r.start + cut) % cards.length, opts));
        return rs.map((r, i) => ({ no: i + 1, start: (r.start + cut) % cards.length, cards: r.cards,
            result: r.result, issues: issues(hs[i], hs.length > 1 ? hs[(i + hs.length - 1) % hs.length] : null, i, opts) }));
    }
    function chainPoints(cards, ch) {
        const ps = Array.from({ length: ch.length }, (_, j) => cards[(ch.start - 1 + j) % cards.length].point);
        if (ch.parts) ps.parts = ch.parts.slice();
        if (ch.secondParts) ps.secondParts = ch.secondParts.slice();
        return ps;
    }
    // 共用引擎目前使用全域規則；只在同步驗證期間暫存，避免 await 期間影響其他操作。
    function validChain(cards, ch, opts) {
        const saved = { ...B.rules };
        try { Object.assign(B.rules, { tripleTie: opts.tripleTie, strong: opts.strong, secondStart: opts.secondStart }); return B.qualifiesFinal(chainPoints(cards, ch)); }
        finally { Object.assign(B.rules, saved); }
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
    const pointCounts = cards => cards.reduce((a, c) => (a[c.point]++, a), new Array(10).fill(0)).join(',');
    const sameHand = (a, b) => a.start === b.start && a.hand.size === b.hand.size && a.result === b.result && pointCounts(a.cards) === pointCounts(b.cards);
    async function optimize(result, options = {}) {
        const opts = settings(options), before = clone(result);
        if (!before.cards || before.cards.length !== 416 || !before.chains.length) throw new Error('這副牌尚未排出可調整的穿越段');
        const base = prepare(before);
        if (before.chains.some(ch => !validChain(base, ch, opts))) throw new Error('原牌有長段尚未通過實際驗收，請先查看「訊號調整檢查」或長段驗證');
        const originalRounds = E.dealRounds(base).filter(r => r.hand);
        if (opts.signalRule && originalRounds.some((r, i) => {
            if (r.segment !== 'A' || originalRounds.length < 2) return false;
            const p = originalRounds[(i + originalRounds.length - 1) % originalRounds.length].cards;
            const need = opts.tripleTie && B.isTriple(p.map(c => c.point)) ? '和' : B.isSignalHand(p, opts.signalConfig) ? '莊' : '閒';
            return r.result !== need;
        })) throw new Error('原牌的訊號結果尚未符合，局內優化會保留原結果，請先釐清原牌的訊號問題');
        const owners = new Array(base.length).fill(null);
        before.chains.forEach(ch => { for (let k = 0; k < ch.length; k++) owners[(ch.start - 1 + k) % base.length] = ch; });
        const rounds = originalRounds.filter(r => owners[r.start] && r.cards.every((_, j) => owners[r.start + j] === owners[r.start]));
        const initial = analyze(base, opts);
        let cards = base.slice(), current = initial, accepted = 0, evaluated = 0, lastYield = Date.now();
        const progress = options.onProgress || (() => {}), stopped = options.isCancelled || (() => false);
        const preserveNine = options.preserveLastNine === true && base.at(-1).rank === '9';
        outer: for (let pass = 0; pass < (options.maxPasses ?? 4); pass++) {
            const passAccepted = accepted;
            for (let ri = 0; ri < rounds.length; ri++) {
                if (stopped()) break outer;
                const round = rounds[ri], ch = owners[round.start];
                let bestCards = null, best = current;
                for (const alt of permutations(cards.slice(round.start, round.start + round.hand.size))) {
                    if (alt.every((c, i) => c.point === cards[round.start + i].point)) continue;
                    const ps = alt.map(c => c.point), h = B.simulateHand(ps, 0, ps.length);
                    if (!h || h.size !== round.hand.size || h.result !== round.result || !B.handSensitive(ps)) continue;
                    const test = cards.slice(); test.splice(round.start, round.hand.size, ...alt);
                    if (preserveNine && test.at(-1).rank !== '9') continue;
                    if (!validChain(test, ch, opts)) continue;
                    const analysis = analyze(test, opts); evaluated++;
                    if (analysis.count > best.count) { bestCards = test; best = analysis; }
                    if (Date.now() - lastYield > 45) {
                        progress({ pass: pass + 1, round: ri + 1, total: rounds.length, before: initial.count, best: current.count, accepted });
                        await new Promise(resolve => setTimeout(resolve, 0)); lastYield = Date.now();
                        if (stopped()) break outer;
                    }
                }
                if (bestCards) { cards = bestCards; current = best; accepted++; }
            }
            if (passAccepted === accepted) break;
        }
        const finalRounds = E.dealRounds(cards).filter(r => r.hand);
        if (finalRounds.length !== originalRounds.length || finalRounds.some((r, i) => !sameHand(r, originalRounds[i]))) throw new Error('驗證失敗：局內調整改變了局數、結果或用牌');
        if (before.chains.some(ch => !validChain(cards, ch, opts))) throw new Error('驗證失敗：長段不合格');
        if (new Set(cards).size !== base.length || cards.some(c => !base.includes(c))) throw new Error('驗證失敗：牌張不守恆');
        const after = clone(before);
        after.cards = cards.map(c => ({ ...c }));
        after.colorOk = finalRounds.every(r => ['RRRB', 'BBBR'].includes(r.cards.slice(0, 4).map(c => c.back_color).join('')));
        after.chains.forEach(ch => {
            const ps = chainPoints(cards, ch), rs = B.roundsFromStart(ps);
            ch.traverse = B.isTraverse(ps); ch.rounds = rs ? rs.length : 0;
            ch.allSensitive = !!rs && rs.every(r => B.handSensitive(ps.slice(r.start, r.start + r.size)));
            ch.qualified = validChain(cards, ch, opts);
        });
        const changes = originalRounds.flatMap((r, i) => {
            const moved = r.cards.map((c, k) => cards[r.start + k] !== base[r.start + k]);
            if (!moved.some(Boolean)) return [];
            return [{ round: i + 1, start: r.start, before: r.cards, after: finalRounds[i].cards, moved,
                from: finalRounds[i].cards.map(c => r.cards.indexOf(c) + 1), result: r.result, size: r.hand.size,
                sensitiveBefore: B.handSensitive(r.cards.map(c => c.point)), sensitiveAfter: B.handSensitive(finalRounds[i].cards.map(c => c.point)) }];
        });
        return { before, after, initial, final: current, changes,
            gained: current.safe.filter(c => !initial.safe.includes(c)), lost: initial.safe.filter(c => !current.safe.includes(c)),
            accepted, evaluated, cancelled: stopped(), rules: opts };
    }
    global.TraverseOptimizer = { prepare, analyze, traceCut, optimize };
})(typeof window !== 'undefined' ? window : globalThis);
