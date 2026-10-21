/* 完整牌庫比例下，1/13與2/13的單方補牌逆轉；依實際牌序判定。 */
(function (root) {
    'use strict';
    const point = card => {
        if (typeof card?.point === 'function') return card.point();
        const rank = String(card?.rank ?? card?.value ?? '');
        if (['K', 'Q', 'J', 'T', '10', '0'].includes(rank)) return 0;
        if (rank === 'A') return 1;
        return /^[1-9]$/.test(rank) ? Number(rank) : NaN;
    };
    const bankerDraws = (b, t) => b <= 2 || (b === 3 && t !== 8)
        || (b === 4 && t >= 2 && t <= 7) || (b === 5 && t >= 4 && t <= 7)
        || (b === 6 && (t === 6 || t === 7));
    function classify(round) {
        if (!Array.isArray(round?.cards) || round.cards.length !== 5) return null;
        const a = round.cards.map(point);
        if (a.some(v => !Number.isInteger(v) || v < 0 || v > 9)) return null;
        const p = (a[0] + a[2]) % 10, b = (a[1] + a[3]) % 10;
        if (p >= 8 || b >= 8) return null;
        let winner, wins;
        if (p <= 5 && p < b) {
            winner = '閒';
            wins = Array.from({length: 10}, (_, t) => t)
                .filter(t => !bankerDraws(b, t) && (p + t) % 10 > b);
        } else if (p >= 6 && b <= 5) {
            winner = '莊';
            wins = Array.from({length: 10}, (_, t) => t).filter(t => (b + t) % 10 > p);
        } else return null;
        // 0點有10/J/Q/K四種牌面，其餘點數各一種；不是把十種點數視為等機率。
        const weight = wins.reduce((sum, t) => sum + (t === 0 ? 4 : 1), 0);
        return weight >= 1 && weight <= 2 && wins.includes(a[4])
            ? { winner, playerInitial: p, bankerInitial: b, draws: wins, numerator: weight } : null;
    }
    function count(rounds) {
        return (rounds || []).reduce((n, r) => n + Number(Boolean(classify(r))), 0);
    }
    function read(doc) {
        const input = doc.getElementById('maxTwoThirteenReversal');
        const raw = input?.value.trim() ?? '';
        if (raw === '') return { limit: null, enabled: Boolean(input) };
        const limit = Number(raw);
        if (!Number.isSafeInteger(limit) || limit < 0) return {
            error: '逆轉上限（1／13＋2／13）請填0以上的整數，或留白不限。', focus: 'maxTwoThirteenReversal'
        };
        return { limit, enabled: true };
    }
    function check(rounds, limit) {
        const roundNumbers = [];
        (rounds || []).forEach((r, i) => { if (classify(r)) roundNumbers.push(i + 1); });
        const actual = roundNumbers.length;
        const okCount = limit === null || actual <= limit;
        // 只檢查當副牌的前後次序，不把靴尾與靴頭循環相接；兩次之間至少21局。
        const spacingViolations = [];
        for (let i = 1; i < roundNumbers.length; i++) {
            const firstRound = roundNumbers[i - 1], nextRound = roundNumbers[i];
            const gap = nextRound - firstRound - 1;
            if (gap <= 20) spacingViolations.push({ firstRound, nextRound, gap });
        }
        const okSpacing = spacingViolations.length === 0;
        const v = spacingViolations[0];
        const reason = !okCount ? `逆轉（1／13＋2／13）${actual}局 > 上限${limit}`
            : !okSpacing ? `第${v.firstRound}、${v.nextRound}局逆轉之間只隔${v.gap}局，須超過20局` : '';
        return { ok: okCount && okSpacing, okCount, okSpacing, count: actual, limit, roundNumbers, spacingViolations, reason };
    }
    // 搜尋各種同類位置的組合，再把逆轉局與一般局整局交換；失敗不改輸入。
    async function repairSpacing(rounds, options = {}) {
        const originalCheck = check(rounds, null);
        if (originalCheck.okSpacing) return { ok: true, rounds, swaps: [], nodes: 0 };
        const keyFor = options.keyFor;
        if (typeof keyFor !== 'function') return { ok: false, reason: '缺少整局交換的規則檢查' };
        const canMove = options.canMove || (() => true);
        const groups = new Map(), fixed = [];
        const keys = rounds.map(keyFor);
        rounds.forEach((r, i) => {
            if (!classify(r)) return;
            if (!canMove(i)) { fixed.push(i); return; }
            const key = keys[i];
            if (!groups.has(key)) groups.set(key, { key, sources: [], slots: [] });
            groups.get(key).sources.push(i);
        });
        const items = [...groups.values()];
        for (const group of items) group.slots = rounds.map((_, i) => i)
            .filter(i => canMove(i) && keys[i] === group.key && fixed.every(j => Math.abs(i - j) >= 22));
        const impossible = originalCheck.count > Math.floor((rounds.length - 1) / 22) + 1
            || fixed.some((v, i) => fixed.slice(i + 1).some(w => Math.abs(v - w) < 22))
            || items.some(g => g.slots.length < g.sources.length);
        if (impossible) return { ok: false, reason: '沒有足夠的同結果、同訊號安全位置可交換' };
        items.sort((a, b) => (a.slots.length - a.sources.length) - (b.slots.length - b.sources.length));
        let nodes = 0, validations = 0, stopped = false, exhausted = false, answer = null;
        const chosen = fixed.slice(), targets = new Map();
        const maxNodes = options.maxNodes ?? 50000, maxValidations = options.maxValidations ?? 128;
        async function search(groupIndex, offset = 0, after = -1) {
            if (answer || stopped || exhausted) return;
            if (options.shouldStop?.()) { stopped = true; return; }
            if (++nodes > maxNodes) { exhausted = true; return; }
            if (nodes % 128 === 0) {
                await new Promise(resolve => setTimeout(resolve, 0));
                if (options.shouldStop?.()) { stopped = true; return; }
            }
            if (groupIndex === items.length) {
                const work = rounds.slice(), swaps = [];
                for (const group of items) {
                    const dest = targets.get(group.key), destSet = new Set(dest), sourceSet = new Set(group.sources);
                    const leaving = group.sources.filter(i => !destSet.has(i));
                    const entering = dest.filter(i => !sourceSet.has(i));
                    leaving.forEach((from, i) => {
                        const to = entering[i];
                        [work[from], work[to]] = [work[to], work[from]];
                        swaps.push({ from: from + 1, to: to + 1 });
                    });
                }
                if (++validations > maxValidations) { exhausted = true; return; }
                if (!options.validate || await options.validate(work)) answer = { ok: true, rounds: work, swaps, nodes };
                return;
            }
            const group = items[groupIndex];
            if (offset === group.sources.length) { await search(groupIndex + 1); return; }
            if (!targets.has(group.key)) targets.set(group.key, []);
            // 優先保留原逆轉位置，避免不必要的交換；仍會回溯找其他組合。
            const candidates = group.slots.filter(i => i > after)
                .sort((a, b) => Number(!group.sources.includes(a)) - Number(!group.sources.includes(b)) || a - b);
            for (const i of candidates) {
                if (chosen.some(j => Math.abs(i - j) < 22)) continue;
                if (group.slots.filter(j => j > i).length < group.sources.length - offset - 1) continue;
                targets.get(group.key).push(i); chosen.push(i);
                await search(groupIndex, offset + 1, i);
                chosen.pop(); targets.get(group.key).pop();
                if (answer || stopped || exhausted) return;
            }
        }
        await search(0);
        return answer || { ok: false, stopped, exhausted, nodes, reason: stopped ? '已停止整局交換'
            : exhausted ? '在本次搜尋範圍內找不到符合其他限制的整局交換'
            : '找不到符合其他限制的同結果、同訊號整局交換' };
    }
    const api = { classify, count, read, check, repairSpacing };
    root.TwoThirteenReversals = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
