// Counts of completed 4/5/6-card rounds. Blank bounds are unlimited; zero is a real bound.
(function (global) {
    'use strict';
    function read(doc) {
        const limits = {};
        let any = false;
        for (const n of [4, 5, 6]) {
            const bound = {};
            for (const [key, suffix] of [['min', 'Min'], ['max', 'Max']]) {
                const id = `st${n}${suffix}`, input = doc?.getElementById(id);
                const raw = String(input?.value ?? '').trim();
                const value = raw === '' ? null : Number(raw);
                if (input?.validity?.badInput || (value !== null && (!Number.isInteger(value) || value < 0 || value > 104))) {
                    return { error: `${n}張局上下限須為 0～104 的整數或留白`, focus: id };
                }
                bound[key] = value;
                if (value !== null) any = true;
            }
            if (bound.min !== null && bound.max !== null && bound.min > bound.max) {
                return { error: `${n}張局下限不能大於上限`, focus: `st${n}Min` };
            }
            limits[n] = bound;
        }
        return { limits: any ? limits : null };
    }
    function count(rounds) {
        const counts = { 4: 0, 5: 0, 6: 0 };
        for (const round of rounds || []) {
            const n = round?.cards?.length;
            if (counts[n] !== undefined) counts[n]++;
        }
        return counts;
    }
    function check(rounds, limits) {
        const counts = count(rounds);
        for (const n of [4, 5, 6]) {
            const { min = null, max = null } = limits?.[n] || {};
            if (min !== null && counts[n] < min) return { ok: false, counts, reason: `${n}張局 ${counts[n]} 局，低於下限 ${min}` };
            if (max !== null && counts[n] > max) return { ok: false, counts, reason: `${n}張局 ${counts[n]} 局，超過上限 ${max}` };
        }
        return { ok: true, counts, reason: '' };
    }
    global.RoundSizeLimits = { read, count, check };
    if (typeof module !== 'undefined' && module.exports) module.exports = global.RoundSizeLimits;
})(typeof window !== 'undefined' ? window : globalThis);
