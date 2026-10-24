// 同一副牌的局內排列優化；不重洗、不跨局換牌，也不把卡色納入目標。
(function (global) {
    'use strict';
    const B = global.TraverseBuilder, E = global.TraverseExport;
    const clone = x => JSON.parse(JSON.stringify(x));
    const settings = o => ({ tripleTie: o.tripleTie !== false, signalRule: o.signalRule !== false, signalConfig: B.normalizeSignal(o.signalConfig || B.rules.signalConfig),
        skipBanker6: o.skipBanker6 === true, skipPlayer7: o.skipPlayer7 === true, mixedColor: o.mixedColor === true, strong: o.strong === true, secondStart: o.secondStart === true });

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
                && (h.result === '和' ? (!opts.tripleTie && need === '莊') : h.result !== need);
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
        try { Object.assign(B.rules, opts); return B.qualifiesFinal(chainPoints(cards, ch)); }
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
    // Use the existing point-only recovery engine; compare integer totals, never display rounding.
    const recoveryEngine = () => global.RecoverySearch || (typeof require === 'function' ? require('./standard/recovery_search.js') : null);
    function recoveryRounds(cards) {
        const rounds = E.dealRounds(cards).map(r => ({ cards: r.cards.map(c => ({ ...c, point: () => c.point })) }));
        const dealt = E.dealRounds(cards);
        if (!dealt.at(-1)?.hand && rounds.length > 1) rounds[rounds.length - 2].cards.push(...rounds.pop().cards);
        return rounds;
    }
    function measureRecovery(cards) {
        const engine = recoveryEngine();
        if (!engine) throw new Error('回復分析模組尚未載入');
        return engine.measure(recoveryRounds(cards), true);
    }
    const failures = r => r.cuts.filter(c => c.failed).length;
    function accepts(mode, safe, recovery, bestSafe, bestRecovery) {
        if (failures(recovery) > failures(bestRecovery)) return false;
        return mode === 'recovery'
            ? recovery.sum < bestRecovery.sum && safe.count >= bestSafe.count
            : safe.count > bestSafe.count && recovery.sum <= bestRecovery.sum;
    }
    function summary(o) {
        return `安全切點 ${o.initial.count} → ${o.final.count}｜平均回復 ${o.initialRecovery.score.toFixed(6)} → ${o.finalRecovery.score.toFixed(6)} 局（完整 416 切點）｜未回復 ${failures(o.initialRecovery)} → ${failures(o.finalRecovery)}`;
    }
    async function optimize(result, options = {}) {
        const opts = settings(options), before = clone(result), objective = options.objective === 'recovery' ? 'recovery' : 'safe';
        if (!before.cards || before.cards.length !== 416 || !before.chains?.length) throw new Error('這副牌尚未排出可調整的穿越段');
        const base = prepare(before);
        const inventory = new Map();
        base.forEach(c => { const k = `${c.rank}|${c.suit}|${c.back_color}`; inventory.set(k, (inventory.get(k) || 0) + 1); });
        if (inventory.size !== 104 || [...inventory.values()].some(n => n !== 4)) throw new Error('原牌不是完整 416 張牌庫，保留原牌');
        if (before.chains.some(ch => !validChain(base, ch, opts))) throw new Error('原牌有長段尚未通過實際驗收，請先查看「訊號調整檢查」或長段驗證');
        const originalRounds = E.dealRounds(base).filter(r => r.hand);
        const signalsValid = rs => rs.every((r, i) => {
            if (r.segment !== 'A' || rs.length < 2) return true;
            const p = rs[(i + rs.length - 1) % rs.length].cards;
            const trip = opts.tripleTie && B.isTriple(p.map(c => c.point));
            if (opts.tripleTie && trip !== (r.result === '和')) return false;
            if (!opts.signalRule || trip) return true;
            const need = B.isSignalHand(p, opts.signalConfig) ? '莊' : '閒';
            return r.result === need || (!opts.tripleTie && r.result === '和' && need === '閒');
        });
        if (!signalsValid(originalRounds)) throw new Error('原牌的訊號結果尚未符合，局內優化會保留原結果，請先釐清原牌的訊號問題');
        const extraValidation = cards => options.validate ? options.validate({ ...before, cards }) : { ok: true };
        const baselineCheck = extraValidation(base);
        if (!baselineCheck.ok) throw new Error(`原牌驗收不合格，保留原牌：${baselineCheck.reason || '規則不符'}`);
        const owners = new Array(base.length).fill(null);
        before.chains.forEach(ch => { for (let k = 0; k < ch.length; k++) owners[(ch.start - 1 + k) % base.length] = ch; });
        const rounds = originalRounds.filter(r => owners[r.start] && r.cards.every((_, j) => owners[r.start + j] === owners[r.start]));
        const initial = analyze(base, opts), initialRecovery = measureRecovery(base);
        let cards = base.slice(), current = initial, currentRecovery = initialRecovery, accepted = 0, evaluated = 0, attempted = 0;
        const progress = options.onProgress || (() => {}), stopped = options.isCancelled || (() => false);
        const started = Date.now(), deadline = started + (options.budgetMs ?? 12000);
        let lastYield = started, limited = false;
        const pause = async (pass, ri) => {
            if (Date.now() - lastYield < 12) return;
            progress({ pass: pass + 1, round: ri + 1, total: rounds.length, before: initial.count, best: current.count, accepted,
                recoveryBefore: initialRecovery.score, recoveryBest: currentRecovery.score });
            await new Promise(resolve => setTimeout(resolve, 0)); lastYield = Date.now();
        };
        const preserveNine = options.preserveLastNine === true && base.at(-1).rank === '9';
        outer: for (let pass = 0; pass < (options.maxPasses ?? 4); pass++) {
            const passAccepted = accepted;
            // Recompute slow routes after each pass. Only rank rounds: all 416 cuts still decide acceptance.
            const heat = new Map(rounds.map(r => [r.start, 0]));
            const own = new Array(416).fill(null);
            rounds.forEach(r => r.cards.forEach((_, j) => own[r.start + j] = r.start));
            if (objective === 'recovery') for (const cut of currentRecovery.cuts.filter(c => c.roundsUsed).sort((a,b) => b.roundsUsed-a.roundsUsed).slice(0, 16)) {
                for (const at of cut.route) for (let k=0;k<6;k++) { const id=own[(at+k)%416]; if(id!==null) heat.set(id,heat.get(id)+cut.roundsUsed); }
            }
            const ordered = rounds.slice().sort((a,b) => (heat.get(b.start)-heat.get(a.start)) || a.start-b.start);
            for (let ri = 0; ri < ordered.length; ri++) {
                const round = ordered[ri], ch = owners[round.start];
                const evaluator = recoveryEngine().createEvaluator(recoveryRounds(cards));
                const roundIndex = originalRounds.indexOf(round);
                let bestCards = null, best = current, bestRecovery = currentRecovery;
                for (const alt of permutations(cards.slice(round.start, round.start + round.hand.size))) {
                    await pause(pass, ri);
                    if (stopped()) break outer;
                    if (Date.now() >= deadline || evaluated >= (options.maxEvaluations ?? 2000)) { limited=true; break outer; }
                    attempted++;
                    if (alt.every((c, i) => c.point === cards[round.start + i].point)) continue;
                    const ps = alt.map(c => c.point), h = B.simulateHand(ps, 0, ps.length);
                    if (!h || h.size !== round.hand.size || h.result !== round.result || !B.handSensitive(ps)) continue;
                    if (JSON.stringify(B.specialRoundCounts(ps)) !== JSON.stringify(B.specialRoundCounts(round.cards.map(c=>c.point)))) continue;
                    const test = cards.slice(); test.splice(round.start, round.hand.size, ...alt);
                    if (preserveNine && test.at(-1).rank !== '9') continue;
                    if (!validChain(test, ch, opts)) continue;
                    const recovery = evaluator.evaluate(recoveryRounds(test), [roundIndex]); evaluated++;
                    if (failures(recovery) > failures(bestRecovery) || recovery.sum > bestRecovery.sum || objective==='recovery' && recovery.sum === bestRecovery.sum) continue;
                    const analysis = analyze(test, opts);
                    if (accepts(objective, analysis, recovery, best, bestRecovery) && extraValidation(test).ok) { bestCards = test; best = analysis; bestRecovery = recovery; }
                }
                if (bestCards) { cards = bestCards; current = best; currentRecovery = bestRecovery; accepted++; }
            }
            if (passAccepted === accepted) break;
        }
        // Cancellation never applies a partially searched result to the page.
        if (stopped()) { cards=base.slice();current=initial;currentRecovery=initialRecovery;accepted=0; }
        const finalRounds = E.dealRounds(cards).filter(r => r.hand);
        if (finalRounds.length !== originalRounds.length || finalRounds.some((r, i) => !sameHand(r, originalRounds[i]))) throw new Error('驗證失敗：局內調整改變了局數、結果或用牌');
        if (finalRounds.some((r,i)=>JSON.stringify(B.specialRoundCounts(r.cards.map(c=>c.point)))!==JSON.stringify(B.specialRoundCounts(originalRounds[i].cards.map(c=>c.point))))) throw new Error('驗證失敗：局內調整改變莊6或逆轉牌型');
        if (!signalsValid(finalRounds) || before.chains.some(ch => !validChain(cards, ch, opts))) throw new Error('驗證失敗：訊號或長段不合格');
        if (new Set(cards).size !== base.length || cards.some(c => !base.includes(c))) throw new Error('驗證失敗：牌張不守恆');
        currentRecovery = measureRecovery(cards); current=analyze(cards,opts);
        if (accepted && !accepts(objective,current,currentRecovery,initial,initialRecovery)) throw new Error('驗證失敗：安全切點或精確回復目標未符合');
        const finalCheck=extraValidation(cards); if(!finalCheck.ok)throw new Error(`最終驗收失敗：${finalCheck.reason || '規則不符'}`);
        if (global.IntegratedAnalysis && typeof global.analyzeShoeRecovery === 'function') {
            const reference=global.IntegratedAnalysis.recovery(E.dealRounds(cards));
            if (!reference || reference.recoveryDetails.reduce((s,c)=>s+c.roundsUsed,0)!==currentRecovery.sum || reference.recoveryDetails.filter(c=>c.failed).length!==failures(currentRecovery)) throw new Error('完整回復分析對照失敗，保留原牌');
        }
        const after = clone(before);
        after.cards = cards.map(c => ({ ...c }));
        const colorPatterns = E.dealRounds(after.cards).filter(r=>r.hand).map(r=>r.cards.slice(0,4).map(c=>c.back_color).join(''));
        after.colorOk = global.CardColorRules ? !global.CardColorRules.violations(colorPatterns,opts.mixedColor).length
            : colorPatterns.every(p => ['RRRB','BBBR'].includes(p));
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
        return { before, after, initial, final: current, initialRecovery, finalRecovery: currentRecovery, objective, limited, attempted, ms:Date.now()-started, changes,
            gained: current.safe.filter(c => !initial.safe.includes(c)), lost: initial.safe.filter(c => !current.safe.includes(c)),
            accepted, evaluated, cancelled: stopped(), rules: opts };
    }
    global.TraverseOptimizer = { prepare, analyze, traceCut, optimize, measureRecovery, accepts, summary, optimizeRecovery:(result,options={})=>optimize(result,{...options,objective:'recovery'}) };
})(typeof window !== 'undefined' ? window : globalThis);
