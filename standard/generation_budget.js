// Shared admission checks for picking, recycling and replacing completed rounds.
// Read the live round list on each check, so removals release their quota immediately.
(function (global) {
    'use strict';
    function create(rounds, options = {}) {
        const sizes = RoundSizeLimits.read(document);
        if (sizes.error) throw new Error(sizes.error);
        const a2 = global.StandardProfiles?.current === 'a2'
            && !(typeof TargetRoadmap !== 'undefined' && TargetRoadmap.isActive('standard'));
        const numeric = id => {
            const raw = document.getElementById(id)?.value;
            return raw == null || raw === '' ? null : Number(raw);
        };
        const limits = { b6: numeric('maxBankerSixWin'), seven: numeric('max7PtReversal'), rare: numeric('maxTwoThirteenReversal') };
        const cache = new WeakMap();
        function row(round) {
            const old = cache.get(round);
            if (old?.source === round.cards) return old;
            const variants = [round.cards, (() => { const c = round.cards.slice(); [c[0],c[1]] = [c[1],c[0]]; return c; })()];
            const choices = variants.map(cards => {
                const r = { ...round, cards }, result = standardRoundOutcome(r);
                return { result, b6: Number(isBankerSixWinRound(r)), seven: count7PtReversals([r]).count,
                    rare: Number(Boolean(TwoThirteenReversals.classify(r))) };
            });
            const value = { source: round.cards, choices, triple: hasFullHouse(round), signal: round.cards.some(isSignalCardByConfig) };
            cache.set(round, value);
            return value;
        }
        function measure(input, closed = false) {
            const list = input.filter(r => r?.segment !== 'C' && r?.cards?.length >= 4 && r.cards.length <= 6);
            if (options.sortByStart) list.sort((a,b) => a.start_index - b.start_index);
            const counts = { ...RoundSizeLimits.count(list), b6: 0, seven: 0, rare: 0, blocked: 0 };
            if (!a2) return counts;
            for (let i = 0; i < list.length; i++) {
                const current = row(list[i]), prev = i || closed ? row(list[(i + list.length - 1) % list.length]) : null;
                const actual = current.choices[0].result;
                const expected = !prev ? null : prev.triple ? '和' : prev.signal ? '莊' : !isTripleRuleOn() && actual === '和' ? '和' : '閒';
                const chosen = expected == null ? null : current.choices.find(x => x.result === expected);
                if (!chosen && expected != null) counts.blocked++;
                for (const key of ['b6','seven','rare']) {
                    // The first open edge and pending triple/tie repair have no fixed direction yet.
                    counts[key] += chosen ? chosen[key] : Math.min(...current.choices.map(x => x[key]));
                }
            }
            return counts;
        }
        const maxima = { 4: sizes.limits?.[4]?.max, 5: sizes.limits?.[5]?.max, 6: sizes.limits?.[6]?.max,
            ...(a2 ? limits : {}) };
        function allows(next) {
            if (Object.values(maxima).every(max=>max==null) && [4,5,6].every(n=>sizes.limits?.[n]?.min==null)) return true;
            const before = measure(rounds), after = measure(next);
            return Object.entries(maxima).every(([key, max]) => max == null || after[key] <= Math.max(max, before[key]))
                && [4,5,6].every(n => sizes.limits?.[n]?.min == null || after[n] >= Math.min(before[n],sizes.limits[n].min));
        }
        return {
            a2, limits, measure, maxima,
            canAdd(round) { return allows([...rounds, round]); },
            canReplace(index, round) { const next = rounds.slice(); next[index] = round; return allows(next); }
        };
    }
    async function repairOrder(rounds, options = {}) {
        if (options.shouldStop?.()) return { ok: false, cancelled: true, reason: '已停止' };
        const budget = create(rounds), working = rounds.slice();
        if (!budget.a2 || Object.values(budget.limits).every(x => x == null)) return { ok: true, rounds: working, swaps: 0 };
        const score = counts => counts.blocked * 100 + Object.entries(budget.limits)
            .reduce((n,[key,max]) => n + (max == null ? 0 : Math.max(0,counts[key]-max)),0);
        let cost = score(budget.measure(working,true)), swaps = 0, deadline = performance.now() + 8;
        // Keep triple/tie units in place; only exchange ordinary sensitive rounds.
        const movable = working.map((r,i) => standardRoundOutcome(r) !== '和' && !hasFullHouse(r)
            && !hasFullHouse(working[(i+working.length-1)%working.length]) ? i : -1).filter(i=>i>=0);
        for (let pass = 0; cost && pass < 6; pass++) {
            let best = null, bestCost = cost;
            for (let a = 0; a < movable.length; a++) {
                if (options.shouldStop?.()) return { ok: false, cancelled: true, reason: '已停止' };
                for (let b = a+1; b < movable.length; b++) {
                    const i = movable[a], j = movable[b];
                    [working[i],working[j]] = [working[j],working[i]];
                    const next = score(budget.measure(working,true));
                    [working[i],working[j]] = [working[j],working[i]];
                    if (next < bestCost) { best = [i,j]; bestCost = next; }
                    if (!bestCost) break;
                }
                if (!bestCost) break;
                if (performance.now() >= deadline) { await new Promise(r=>setTimeout(r,0)); deadline = performance.now()+8; }
            }
            if (!best) break;
            const [i,j] = best;
            [working[i],working[j]] = [working[j],working[i]];
            cost = bestCost; swaps++;
        }
        if (cost) return { ok: false, reason: '訊號後莊6／逆轉預算或敏感接局無安全局部排法' };
        return { ok: true, rounds: working, swaps };
    }
    global.StandardGenerationBudget = { create, repairOrder };
})(typeof window !== 'undefined' ? window : globalThis);
