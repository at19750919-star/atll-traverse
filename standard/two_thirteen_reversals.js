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
    const api = { classify, count, read, check };
    root.TwoThirteenReversals = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
