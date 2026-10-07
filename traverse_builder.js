// ============================================================
// 穿越排牌器 (Traverse Builder)
// 獨立實驗功能，不接入原本生成流程
// ============================================================
//
// 合格段條件（只看點數，不管卡色、訊號牌）：
//   1. 穿越：從段內任一張開始照百家樂規則發牌，最後一局剛好用完段尾
//      （剩 1、2、3、7 張時豁免，與 traverse_segment.js 一致）
//   2. 每局敏感：從段頭發出的每一局，對調前兩張後莊↔閒互換，
//      雙方都不能是和，且用牌張數不變
//   3. 對調後仍穿越：任一局單獨對調前兩張後，整段仍符合條件 1
//
// 流程：
//   階段 1  洗牌 → 撿出所有合格段 → 剩下的重洗再撿，直到連續 N 次撿不到
//   階段 2  剩下的牌改用「敏感局組合」計算排列，再撿出合格段
//   階段 3  把合格段接成長段（接縫處重新完整檢查）
//   剩下撿不進去的牌放在整條牌最後面
//
// 對外 API：
//   TraverseBuilder.build(options) → Promise<result>
//   TraverseBuilder.qualifies(points) → boolean
// ============================================================

(function (global) {
    'use strict';

    const ALLOWED_RESIDUE = new Set([1, 2, 3, 7]);
    const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const SUITS = ['♠', '♥', '♦', '♣'];

    function rankPoint(rank) {
        if (rank === 'A') return 1;
        if (rank === '10' || rank === 'J' || rank === 'Q' || rank === 'K') return 0;
        return parseInt(rank, 10);
    }

    // 從 start 起的一局：回傳 { result, size }，牌不夠回傳 null
    function simulateHand(arr, start, limit) {
        if (start + 4 > limit) return null;
        let pp = (arr[start] + arr[start + 2]) % 10;
        let bb = (arr[start + 1] + arr[start + 3]) % 10;
        let size = 4;
        if (pp < 8 && bb < 8) {
            if (pp <= 5) {
                if (start + 5 > limit) return null;
                const p3 = arr[start + 4];
                pp = (pp + p3) % 10;
                let bd;
                if (bb <= 2) bd = true;
                else if (bb === 3) bd = (p3 !== 8);
                else if (bb === 4) bd = (p3 >= 2 && p3 <= 7);
                else if (bb === 5) bd = (p3 >= 4 && p3 <= 7);
                else if (bb === 6) bd = (p3 === 6 || p3 === 7);
                else bd = false;
                if (bd) {
                    if (start + 6 > limit) return null;
                    bb = (bb + arr[start + 5]) % 10;
                    size = 6;
                } else {
                    size = 5;
                }
            } else if (bb <= 5) {
                if (start + 5 > limit) return null;
                bb = (bb + arr[start + 4]) % 10;
                size = 5;
            }
        }
        const result = pp > bb ? '閒' : (bb > pp ? '莊' : '和');
        return { result, size };
    }

    function isTraverse(arr) {
        const limit = arr.length;
        for (let p = 0; p < limit; p++) {
            if (ALLOWED_RESIDUE.has(limit - p)) continue;
            let cur = p;
            while (cur < limit) {
                const h = simulateHand(arr, cur, limit);
                if (!h) return false;
                cur += h.size;
            }
            if (cur !== limit) return false;
        }
        return true;
    }

    // 從段頭發出的各局 [{ start, size, result }]
    function roundsFromStart(arr) {
        const out = [];
        let cur = 0;
        while (cur < arr.length) {
            const h = simulateHand(arr, cur, arr.length);
            if (!h) return null;
            out.push({ start: cur, size: h.size, result: h.result });
            cur += h.size;
        }
        return out;
    }

    // 一局（點數陣列，恰好 size 張）是否敏感：莊↔閒互換、皆非和、張數不變
    function handSensitive(hand) {
        const orig = simulateHand(hand, 0, hand.length);
        if (!orig || orig.size !== hand.length || orig.result === '和') return false;
        const sw = hand.slice();
        [sw[0], sw[1]] = [sw[1], sw[0]];
        const h = simulateHand(sw, 0, sw.length);
        if (!h || h.size !== hand.length || h.result === '和') return false;
        return h.result !== orig.result;
    }

    function qualifies(arr) {
        if (!isTraverse(arr)) return false;
        const rounds = roundsFromStart(arr);
        if (!rounds) return false;
        for (const r of rounds) {
            if (!handSensitive(arr.slice(r.start, r.start + r.size))) return false;
        }
        for (const r of rounds) {
            const sw = arr.slice();
            [sw[r.start], sw[r.start + 1]] = [sw[r.start + 1], sw[r.start]];
            if (!isTraverse(sw)) return false;
        }
        return true;
    }

    function shuffleInPlace(a, rng) {
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    // 讓出執行緒給畫面更新。分頁在背景時 setTimeout 會被節流到每秒一次，
    // 改用 MessageChannel，且只在距上次讓出超過 100ms 時才讓出
    let lastYield = 0;
    function yieldNow() {
        if (typeof MessageChannel === 'undefined') return new Promise(r => setTimeout(r, 0));
        return new Promise(r => {
            const ch = new MessageChannel();
            ch.port1.onmessage = () => { ch.port1.close(); r(); };
            ch.port2.postMessage(null);
        });
    }
    async function tick() {
        const now = Date.now();
        if (now - lastYield < 100) return;
        lastYield = now;
        await yieldNow();
    }

    // ===== 階段 1：洗牌撿段 =====
    async function phaseShuffle(rest, opts, ctx) {
        const segs = [];
        let idle = 0;
        let shuffles = 0;
        while (idle < opts.idleLimit && rest.length >= opts.minLen) {
            if (ctx.cancelled()) break;
            shuffles++;
            shuffleInPlace(rest, opts.rng);
            const used = new Uint8Array(rest.length);
            let got = 0;
            for (let s = 0; s < rest.length; s++) {
                for (const L of opts.scanLengths) {
                    if (s + L > rest.length) continue;
                    let overlap = false;
                    for (let k = s; k < s + L; k++) if (used[k]) { overlap = true; break; }
                    if (overlap) continue;
                    const a = rest.slice(s, s + L);
                    if (qualifies(a)) {
                        segs.push(a);
                        for (let k = s; k < s + L; k++) used[k] = 1;
                        got++;
                        s += L - 1;
                        break;
                    }
                }
            }
            if (got) rest = rest.filter((_, i) => !used[i]);
            idle = got ? 0 : idle + 1;
            if (shuffles % 5 === 0) {
                ctx.progress(`階段 1 洗牌撿段：第 ${shuffles} 次，已撿 ${segs.length} 段，剩 ${rest.length} 張`);
                await tick();
            }
        }
        return { segs, rest, shuffles };
    }

    // ===== 階段 2：用敏感局組合計算排列 =====
    // 預先列出所有敏感局（4/5/6 張的點數組合），再從剩餘牌中挑幾局接成段
    let sensitiveHandsCache = null;
    function allSensitiveHands() {
        if (sensitiveHandsCache) return sensitiveHandsCache;
        const out = [];
        const h = [0, 0, 0, 0, 0, 0];
        for (let a = 0; a < 10; a++) for (let b = 0; b < 10; b++)
            for (let c = 0; c < 10; c++) for (let d = 0; d < 10; d++) {
                h[0] = a; h[1] = b; h[2] = c; h[3] = d;
                const base = simulateHand([a, b, c, d, 0, 0], 0, 4);
                if (base) { // 4 張完局
                    if (handSensitive([a, b, c, d])) out.push([a, b, c, d]);
                    continue;
                }
                for (let e = 0; e < 10; e++) {
                    const five = [a, b, c, d, e];
                    const s5 = simulateHand(five, 0, 5);
                    if (s5) {
                        if (handSensitive(five)) out.push(five);
                        continue;
                    }
                    for (let f = 0; f < 10; f++) {
                        const six = [a, b, c, d, e, f];
                        if (handSensitive(six)) out.push(six);
                    }
                }
            }
        sensitiveHandsCache = out;
        return out;
    }

    function countsOf(points) {
        const c = new Array(10).fill(0);
        for (const p of points) c[p]++;
        return c;
    }

    function fits(hand, counts) {
        const need = new Array(10).fill(0);
        for (const p of hand) need[p]++;
        for (let i = 0; i < 10; i++) if (need[i] > counts[i]) return false;
        return true;
    }

    async function phaseCompute(rest, opts, ctx) {
        const hands = allSensitiveHands();
        const segs = [];
        let tries = 0;
        let idle = 0;
        while (idle < opts.computeTries && rest.length >= opts.minLen) {
            if (ctx.cancelled()) break;
            const counts = countsOf(rest);
            const usable = hands.filter(h => fits(h, counts));
            if (usable.length === 0) break;
            let found = null;
            // 隨機挑敏感局一局一局接，長度落在範圍內就檢查整段
            for (let t = 0; t < 2000 && !found; t++) {
                tries++;
                idle++;
                const c = counts.slice();
                let seq = [];
                while (seq.length < opts.maxLen) {
                    const cand = usable[Math.floor(opts.rng() * usable.length)];
                    if (seq.length + cand.length > opts.maxLen) break;
                    if (!fits(cand, c)) break;
                    for (const p of cand) c[p]--;
                    seq = seq.concat(cand);
                    if (seq.length >= opts.minLen && qualifies(seq)) { found = seq; break; }
                }
            }
            if (found) {
                segs.push(found);
                const c = countsOf(found);
                rest = rest.filter(p => (c[p] > 0 ? (c[p]--, false) : true));
                idle = 0;
            }
            ctx.progress(`階段 2 計算排列：已試 ${tries} 組，補撿 ${segs.length} 段，剩 ${rest.length} 張`);
            await tick();
        }
        return { segs, rest, tries };
    }

    // ===== 階段 3：接段 =====
    async function phaseChain(segs, opts, ctx) {
        let best = null;
        for (let attempt = 0; attempt < opts.chainAttempts; attempt++) {
            if (ctx.cancelled()) break;
            const pool = shuffleInPlace(segs.map(s => s.slice()), opts.rng);
            const chains = [];
            while (pool.length) {
                let chain = pool.shift();
                let extended = true;
                while (extended) {
                    extended = false;
                    for (let i = 0; i < pool.length; i++) {
                        const joined = chain.concat(pool[i]);
                        if (qualifies(joined)) {
                            chain = joined;
                            pool.splice(i, 1);
                            extended = true;
                            break;
                        }
                    }
                }
                chains.push(chain);
            }
            chains.sort((a, b) => b.length - a.length);
            const score = chains[0].length * 1000 - chains.length;
            if (!best || score > best.score) best = { chains, score };
            ctx.progress(`階段 3 接段：第 ${attempt + 1}/${opts.chainAttempts} 次，目前最長 ${best.chains[0].length} 張`);
            await tick();
        }
        // 中途停止且一次都沒接完：原段照放，確保牌數仍是 416
        return best ? best.chains : segs.slice().sort((a, b) => b.length - a.length);
    }

    // 點數 → 實際牌（每個點數從 8 副牌的牌池隨機取）
    function assignCards(points, rng) {
        const pool = new Map();
        for (let p = 0; p < 10; p++) pool.set(p, []);
        for (let deck = 0; deck < 8; deck++)
            for (const suit of SUITS)
                for (const rank of RANKS) pool.get(rankPoint(rank)).push({ rank, suit });
        for (const list of pool.values()) shuffleInPlace(list, rng);
        return points.map(p => {
            const card = pool.get(p).pop();
            return { rank: card.rank, suit: card.suit, point: p };
        });
    }

    async function build(options = {}) {
        const opts = {
            idleLimit: options.idleLimit ?? 1000,
            computeTries: options.computeTries ?? 20000,
            chainAttempts: options.chainAttempts ?? 20,
            minLen: options.minLen ?? 8,
            maxLen: options.maxLen ?? 12,
            rng: options.rng || Math.random,
        };
        opts.scanLengths = [];
        for (let L = opts.maxLen; L >= opts.minLen; L--) opts.scanLengths.push(L);
        const ctx = {
            progress: options.onProgress || (() => {}),
            cancelled: options.isCancelled || (() => false),
        };
        const t0 = Date.now();

        let rest = [];
        for (let p = 1; p <= 9; p++) for (let k = 0; k < 32; k++) rest.push(p);
        for (let k = 0; k < 128; k++) rest.push(0);

        const p1 = await phaseShuffle(rest, opts, ctx);
        const p2 = await phaseCompute(p1.rest, opts, ctx);
        const segs = p1.segs.concat(p2.segs);
        const chains = await phaseChain(segs, opts, ctx);
        const leftover = shuffleInPlace(p2.rest.slice(), opts.rng);

        const points = chains.flat().concat(leftover);
        const cards = assignCards(points, opts.rng);

        // 每條長段的驗證結果
        let offset = 0;
        const chainReports = chains.map(ch => {
            const rounds = roundsFromStart(ch);
            const report = {
                start: offset + 1,
                length: ch.length,
                rounds: rounds ? rounds.length : 0,
                traverse: isTraverse(ch),
                allSensitive: !!rounds && rounds.every(r => handSensitive(ch.slice(r.start, r.start + r.size))),
                qualified: qualifies(ch),
            };
            offset += ch.length;
            return report;
        });

        return {
            cards,
            chains: chainReports,
            leftoverCount: leftover.length,
            stats: {
                shuffles: p1.shuffles,
                phase1Segments: p1.segs.length,
                phase1Rest: p1.rest.length,
                phase2Segments: p2.segs.length,
                totalCards: points.length,
                ms: Date.now() - t0,
            },
        };
    }

    global.TraverseBuilder = { build, qualifies, isTraverse, roundsFromStart, handSensitive, simulateHand };

})(typeof window !== 'undefined' ? window : globalThis);
