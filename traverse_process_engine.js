(function (global) {
    'use strict';
    const B = global.TraverseBuilder;
    const points = cards => cards.map(c => c.point);
    function check(cards) {
        const p = points(cards);
        if (!B.isTraverse(p)) return { ok: false, reason: '有起點無法剛好發完段尾' };
        const rounds = B.roundsFromStart(p);
        if (!rounds) return { ok: false, reason: '段頭無法完整發完' };
        for (const r of rounds) {
            if (!B.handSensitive(p.slice(r.start, r.start + r.size)))
                return { ok: false, reason: `第 ${rounds.indexOf(r) + 1} 局不敏感` };
            const sw = p.slice();
            [sw[r.start], sw[r.start + 1]] = [sw[r.start + 1], sw[r.start]];
            if (!B.isTraverse(sw)) return { ok: false, reason: `第 ${rounds.indexOf(r) + 1} 局對調後不穿越` };
        }
        return { ok: true, reason: '三項條件全部通過', rounds };
    }
    function deck() {
        const cards = [];
        for (let d = 1; d <= 8; d++) for (const suit of ['♠', '♥', '♦', '♣'])
            for (const rank of ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'])
                cards.push({ id: cards.length + 1, deck: d, suit, rank, point: rank === 'A' ? 1 : Number(rank) < 10 ? Number(rank) : 0 });
        return cards;
    }
    function rngFor(seed) {
        let n = Number(seed) >>> 0;
        return () => { n += 0x6D2B79F5; let t = Math.imul(n ^ n >>> 15, 1 | n); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    }
    function shuffle(a, rng) {
        for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    }
    function* run(options = {}) {
        const opts = { idleLimit: 100, computeTries: 20000, chainAttempts: 3, minLen: 8, maxLen: 12, seed: 416, ...options };
        for (const key of ['idleLimit', 'computeTries', 'chainAttempts', 'minLen', 'maxLen'])
            if (!Number.isInteger(opts[key]) || opts[key] < 1) throw new Error('參數必須是正整數');
        if (opts.minLen < 4 || opts.maxLen < opts.minLen || opts.maxLen > 32) throw new Error('段長須介於 4～32，且最長不得小於最短');
        const rng = rngFor(opts.seed);
        let rest = deck(), segments = [], chains = [], pool = [], active = [];
        let phase = 0, shuffles = 0, tries = 0, idle = 0;
        const snapshot = (kind, message, extra = {}) => ({ kind, message, phase, shuffles, tries, idle,
            rest: rest.slice(), segments: segments.slice(), chains: chains.slice(), pool: pool.slice(), active: active.slice(), ...extra });
        yield snapshot('initial', '原始 8 副牌，共 416 張；每張牌都有固定編號');
        phase = 1;
        while (idle < opts.idleLimit && rest.length >= opts.minLen) {
            shuffle(rest, rng); shuffles++;
            yield snapshot('shuffle', `第 ${shuffles} 次洗牌：洗亂剩餘 ${rest.length} 張`);
            let got = 0, s = 0;
            while (s <= rest.length - opts.minLen) {
                let pick = null;
                // 比例以每次撿取前的實際剩餘牌堆為準，不向下取整。
                const zeros = rest.filter(c => c.point === 0).length;
                for (let len = opts.maxLen; len >= opts.minLen; len--) {
                    if (s + len > rest.length) continue;
                    const candidate = rest.slice(s, s + len), result = check(candidate);
                    const z = candidate.filter(c => c.point === 0).length;
                    const quota = z * rest.length >= zeros * len;
                    if (opts.inspect?.()) yield snapshot('inspect', `檢查第 ${s + 1}～${s + len} 張：${!result.ok ? result.reason : !quota ? '0 點比例不足' : '合格'}`, { candidate, verdict: result.ok && quota });
                    if (result.ok && quota && (!pick || z / len > pick.filter(c => c.point === 0).length / pick.length)) pick = candidate;
                }
                if (!pick) { s++; continue; }
                yield snapshot('found', `找到 ${pick.length} 張合格段，0 點 ${pick.filter(c => c.point === 0).length}/${pick.length}；牌堆 ${zeros}/${rest.length}`, { candidate: pick, verdict: true });
                rest.splice(s, pick.length); segments.push(pick); got++;
                yield snapshot('pick', `撿出第 ${segments.length} 段，剩下 ${rest.length} 張`, { candidate: pick, verdict: true });
            }
            idle = got ? 0 : idle + 1;
            yield snapshot('sweep', `本次撿 ${got} 段；連續 ${idle}/${opts.idleLimit} 次撿不到`);
        }
        phase = 2; idle = 0;
        yield snapshot('phase', '階段 2：用剩餘牌組合敏感局，再完整檢查候選段');
        const hands = B.allSensitiveHands();
        while (rest.length >= opts.minLen && idle < opts.computeTries) {
            let found = null, candidate = [], reason = '';
            const counts = Array(10).fill(0); rest.forEach(c => counts[c.point]++);
            const fits = (h, c) => { const n = Array(10).fill(0); h.forEach(p => n[p]++); return n.every((v, i) => v <= c[i]); };
            const usable = hands.filter(h => fits(h, counts));
            if (!usable.length) break;
            // 一般播放每 100 次回報一次；逐候選模式逐次停下。
            const batch = opts.inspect?.() ? 1 : 100;
            for (let t = 0; t < batch && idle < opts.computeTries && !found; t++) {
                tries++; idle++;
                candidate = []; reason = '';
                const c = counts.slice(), seq = [];
                while (seq.length < opts.maxLen) {
                    let h = null, score = -1;
                    for (let k = 0; k < 3; k++) { const a = usable[Math.floor(rng() * usable.length)], z = a.filter(p => p === 0).length / a.length; if (z > score) { h = a; score = z; } }
                    if (seq.length + h.length > opts.maxLen || !fits(h, c)) break;
                    h.forEach(p => { c[p]--; seq.push(p); });
                    const supply = Array.from({ length: 10 }, () => []); rest.forEach(card => supply[card.point].push(card));
                    candidate = seq.map(p => supply[p].shift());
                    if (seq.length >= opts.minLen) { const result = check(candidate); reason = result.reason; if (result.ok) { found = candidate; break; } }
                    else reason = '尚未達最短段長';
                }
            }
            yield snapshot('compute', `已試 ${tries} 組，${found ? '找到合格排列' : '最近候選：' + (reason || '剩餘牌不足以組合')}`, { candidate, verdict: !!found });
            if (found) {
                const ids = new Set(found.map(c => c.id)); rest = rest.filter(c => !ids.has(c.id)); segments.push(found); idle = 0;
                yield snapshot('pick', `計算補撿第 ${segments.length} 段，剩 ${rest.length} 張`, { candidate: found, verdict: true });
            }
        }
        phase = 3;
        let best = null;
        for (let attempt = 1; attempt <= opts.chainAttempts; attempt++) {
            pool = segments.slice(); shuffle(pool, rng); chains = []; active = [];
            yield snapshot('chainStart', `階段 3：第 ${attempt}/${opts.chainAttempts} 次接段，接縫重新完整檢查`);
            while (pool.length) {
                active = pool.shift();
                yield snapshot('chainSeed', `取 ${active.length} 張作為長段起點`);
                let extended = true;
                while (extended) {
                    extended = false;
                    for (let i = 0; i < pool.length; i++) {
                        const candidate = active.concat(pool[i]), result = check(candidate);
                        yield snapshot('joinTest', `試接 ${active.length} + ${pool[i].length} 張：${result.reason}`, { candidate, verdict: result.ok, seam: active.length });
                        if (result.ok) {
                            active = candidate; pool.splice(i, 1); extended = true;
                            yield snapshot('join', `接成 ${active.length} 張，三項條件全部通過`, { candidate: active, verdict: true }); break;
                        }
                    }
                }
                chains.push(active); active = [];
                yield snapshot('chainDone', `完成第 ${chains.length} 條長段`);
            }
            chains.sort((a, b) => b.length - a.length);
            const score = (chains[0]?.length || 0) * 1000 - chains.length;
            if (!best || score > best.score) best = { score, chains: chains.slice() };
            yield snapshot('attemptDone', `第 ${attempt} 次接段完成；目前最佳 ${best.chains.length} 條長段`);
        }
        chains = best.chains; pool = []; active = []; phase = 4;
        const shoe = chains.flat().concat(rest);
        if (shoe.length !== 416 || new Set(shoe.map(c => c.id)).size !== 416) throw new Error('牌數或編號驗證失敗');
        if (!chains.every(c => check(c).ok)) throw new Error('長段驗證失敗');
        yield snapshot('done', `完成 416 張：${chains.length} 條合格長段 + 尾端 ${rest.length} 張未排入牌`, { shoe });
    }
    global.TraverseProcess = { deck, check, run };
})(typeof window !== 'undefined' ? window : globalThis);
