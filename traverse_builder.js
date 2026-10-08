// ============================================================
// 穿越排牌器 (Traverse Builder)
// 獨立實驗功能，不接入原本生成流程
// ============================================================
//
// 撿段／接段的候選條件（只看點數，不管卡色、訊號牌）：
//   1. 穿越：從段內任一張開始照百家樂規則發牌，最後一局剛好用完段尾
//      （剩 1、2、3、7 張時豁免，與 traverse_segment.js 一致）
//   2. 每局敏感：從段頭發出的每一局，對調前兩張後莊↔閒互換，或和局對調後仍是和，
//      且用牌張數不變
//   3. 對調後仍穿越：任一局單獨對調前兩張後，整段仍符合條件 1
//
// 流程：
//   階段 1  洗牌 → 撿出所有合格段 → 剩下的重洗再撿，直到連續 N 次撿不到
//           每段 0 點比例不得低於剩餘牌堆的 0 點比例（避免最後剩一堆 0 點）
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

    // 一局（點數陣列，恰好 size 張）是否敏感：張數不變，且莊↔閒互換或和→和
    function handSensitive(hand) {
        const orig = simulateHand(hand, 0, hand.length);
        if (!orig || orig.size !== hand.length) return false;
        const sw = hand.slice();
        [sw[0], sw[1]] = [sw[1], sw[0]];
        const h = simulateHand(sw, 0, sw.length);
        if (!h || h.size !== hand.length) return false;
        if (orig.result === '和') return h.result === '和';
        return h.result !== '和' && h.result !== orig.result;
    }

    // 三條：一局裡至少 3 張同點數（1~9，0 點不算），與百家3.0 hasFullHouse 相同
    function isTriple(hand) {
        const c = new Array(10).fill(0);
        for (const p of hand) if (p > 0 && ++c[p] >= 3) return true;
        return false;
    }

    // 三條規則（百家3.0 雙向）：三條的下一局一定開和，不是三條的下一局不能開和。
    // 段頭那局的上一局在別段，所以段頭不能是和、段尾不能是三條，接段後規則仍成立。
    const rules = { tripleTie: true, strong: false };
    // 使用者暫停訊號失敗的重接與整副重跑；保留兩類重試程式供日後明確要求時恢復。
    const SIGNAL_RETRY_ENABLED = false;
    function tripleRuleOk(arr, rounds) {
        const trip = rounds.map(r => isTriple(arr.slice(r.start, r.start + r.size)));
        if (rounds[0].result === '和' || trip[trip.length - 1]) return false;
        for (let k = 0; k + 1 < rounds.length; k++) {
            if (trip[k] !== (rounds[k + 1].result === '和')) return false;
        }
        return true;
    }

    // 強條件（實驗）：段內每個非豁免起點（剩 1、2、3、7 張除外）發出的每一局都要是敏感局
    function strongOk(seg) {
        for (let p = 1; p < seg.length; p++) {
            if (ALLOWED_RESIDUE.has(seg.length - p)) continue;
            for (let cur = p; cur < seg.length;) {
                const h = simulateHand(seg, cur, seg.length);
                if (!h || !handSensitive(seg.slice(cur, cur + h.size))) return false;
                cur += h.size;
            }
        }
        return true;
    }

    // 長段由哪些短段接成（豁免位置以各短段自己的段尾計算）
    function segmentsStrong(ch) {
        const parts = ch.parts || [ch.length];
        let off = 0;
        for (const len of parts) {
            if (!strongOk(ch.slice(off, off + len))) return false;
            off += len;
        }
        return true;
    }

    // 實際牌序：穿越、每局敏感、三條規則。此處不再假設把某局反向。
    function actualChainRounds(arr) {
        if (!isTraverse(arr)) return null;
        const rounds = roundsFromStart(arr);
        if (!rounds) return null;
        for (const r of rounds) {
            if (!handSensitive(arr.slice(r.start, r.start + r.size))) return null;
        }
        if (rules.tripleTie && !tripleRuleOk(arr, rounds)) return null;
        return rounds;
    }

    // 撿段、接段仍使用原候選規則，為之後依訊號調整方向做準備。
    // single：只有撿單一短段時套 strongOk；接好的長段用 segmentsStrong。
    function qualifies(arr, single = false) {
        if (single && rules.strong && !strongOk(arr)) return false;
        const rounds = actualChainRounds(arr);
        if (!rounds) return false;
        for (const r of rounds) {
            const sw = arr.slice();
            [sw[r.start], sw[r.start + 1]] = [sw[r.start + 1], sw[r.start]];
            if (!isTraverse(sw)) return false;
        }
        return true;
    }

    // 最終驗收使用已按訊號調整的實際牌序，不再要求不會採用的反向也能穿越。
    function qualifiesFinal(arr) {
        return !!actualChainRounds(arr) && (!rules.strong || segmentsStrong(arr));
    }

    // 只在失敗結果上找第一個具體原因，不改動 qualifies 的判定與撿段效能。
    function traversalFailure(arr) {
        for (let p = 0; p < arr.length; p++) {
            if (ALLOWED_RESIDUE.has(arr.length - p)) continue;
            let cur = p;
            while (cur < arr.length) {
                const h = simulateHand(arr, cur, arr.length);
                if (!h) return { from: p + 1, stoppedAt: cur + 1, remaining: arr.length - cur };
                cur += h.size;
            }
        }
        return null;
    }

    function diagnoseChain(arr) {
        const fail = traversalFailure(arr);
        const tail = (f) => `從段內第 ${f.from} 張開始發，到了第 ${f.stoppedAt} 張，剩 ${f.remaining} 張無法成局`;
        if (fail) return { kind: 'traverse', ...fail, before: arr.slice(), message: tail(fail) };
        const rounds = roundsFromStart(arr);
        if (!rounds) return { kind: 'incomplete', message: '從段頭發牌也無法剛好發完' };
        for (let i = 0; i < rounds.length; i++) {
            const r = rounds[i];
            if (!handSensitive(arr.slice(r.start, r.start + r.size))) {
                return { kind: 'sensitive', round: i + 1, message: `段內第 ${i + 1} 局對調前兩張後，不符合敏感局條件` };
            }
        }
        if (rules.tripleTie && !tripleRuleOk(arr, rounds)) return { kind: 'triple', message: '段內三條與下一局結果不符，或段頭為和／段尾為三條' };
        if (rules.strong && !segmentsStrong(arr)) return { kind: 'strong', message: '短段內有起點不符合強條件' };
        return null;
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
            const zerosInRest = rest.reduce((n, p) => n + (p === 0 ? 1 : 0), 0);
            const zeroShare = zerosInRest / rest.length;
            for (let s = 0; s < rest.length; s++) {
                let pick = null;
                for (const L of opts.scanLengths) {
                    if (s + L > rest.length) continue;
                    let overlap = false;
                    for (let k = s; k < s + L; k++) if (used[k]) { overlap = true; break; }
                    if (overlap) continue;
                    const a = rest.slice(s, s + L);
                    if (!qualifies(a, true)) continue;
                    const z = a.filter(p => p === 0).length;
                    if (opts.zeroPolicy === 'quota' && z < Math.floor(zeroShare * L * opts.quotaFactor)) continue;
                    if (opts.zeroPolicy === 'none') { pick = { L, a }; break; }
                    const score = z / L;
                    if (!pick || score > pick.score) pick = { L, a, score };
                }
                if (pick) {
                    segs.push(pick.a);
                    for (let k = s; k < s + pick.L; k++) used[k] = 1;
                    got++;
                    s += pick.L - 1;
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

    // 從可用敏感局隨機抽 3 個，取 0 點比例最高的
    function pickZeroHeavy(usable, rng) {
        let best = null, bs = -1;
        for (let i = 0; i < 3; i++) {
            const h = usable[Math.floor(rng() * usable.length)];
            const z = h.filter(p => p === 0).length / h.length;
            if (z > bs) { bs = z; best = h; }
        }
        return best;
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
                    const cand = opts.zeroPolicy === 'none' ? usable[Math.floor(opts.rng() * usable.length)] : pickZeroHeavy(usable, opts.rng);
                    if (seq.length + cand.length > opts.maxLen) break;
                    if (!fits(cand, c)) break;
                    for (const p of cand) c[p]--;
                    seq = seq.concat(cand);
                    if (seq.length >= opts.minLen && qualifies(seq, true)) { found = seq; break; }
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
            const pool = shuffleInPlace(segs.map(s => { const c = s.slice(); c.parts = [s.length]; return c; }), opts.rng);
            const chains = [];
            while (pool.length) {
                let chain = pool.shift();
                let extended = true;
                while (extended) {
                    extended = false;
                    for (let i = 0; i < pool.length; i++) {
                        const joined = chain.concat(pool[i]);
                        joined.parts = chain.parts.concat(pool[i].parts);
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
            const score = (chains.length ? chains[0].length : 0) * 1000 - chains.length;
            if (!best || score > best.score) best = { chains, score };
            ctx.progress(`階段 3 接段：第 ${attempt + 1}/${opts.chainAttempts} 次，目前最長 ${best.chains.length ? best.chains[0].length : 0} 張`);
            await tick();
        }
        // 中途停止且一次都沒接完：原段照放，確保牌數仍是 416
        return best ? best.chains : segs.slice().sort((a, b) => b.length - a.length);
    }

    // 點數 → 實際牌（每個點數從 8 副牌的牌池隨機取）
    // 卡色（牌背）：8 副牌中 4 副紅背、4 副藍背（同百家3.0 generateDeck）。
    // 每局前 4 張必須是 RRRB 或 BBBR（百家3.0 預設、不開混色），第 5、6 張與殘牌不限。
    // 這兩種樣式前兩張同色，所以對調前兩張不會破壞卡色。
    const COLOR_PATTERNS = [['R', 'R', 'R', 'B'], ['B', 'B', 'B', 'R']];

    // 依點數決定每局用哪個卡色樣式，使各點數紅背／藍背的需求不超過牌數。
    // 回傳每個位置要的顏色（'R'／'B'／null＝不限），做不到回傳 null
    function planColors(points, rng) {
        const rounds = [];
        for (let cur = 0; cur < points.length;) {
            const h = simulateHand(points, cur, points.length);
            if (!h) break;
            rounds.push(cur);
            cur += h.size;
        }
        const supply = new Array(10).fill(0);
        for (const p of points) supply[p]++;
        const half = supply.map(n => n / 2); // 每個點數紅、藍各半
        for (let attempt = 0; attempt < 50; attempt++) {
            const pick = rounds.map(() => (rng() < 0.5 ? 0 : 1));
            const demand = () => {
                const d = { R: new Array(10).fill(0), B: new Array(10).fill(0) };
                rounds.forEach((st, i) => COLOR_PATTERNS[pick[i]].forEach((c, k) => d[c][points[st + k]]++));
                return d;
            };
            const overflow = (d) => {
                let o = 0;
                for (let p = 0; p < 10; p++) o += Math.max(0, d.R[p] - half[p]) + Math.max(0, d.B[p] - half[p]);
                return o;
            };
            let d = demand(), cur = overflow(d);
            for (let step = 0; step < 4000 && cur > 0; step++) {
                const i = Math.floor(rng() * rounds.length);
                pick[i] ^= 1;
                const d2 = demand(), o2 = overflow(d2);
                if (o2 <= cur) { d = d2; cur = o2; } else pick[i] ^= 1;
            }
            if (cur === 0) {
                const need = new Array(points.length).fill(null);
                rounds.forEach((st, i) => COLOR_PATTERNS[pick[i]].forEach((c, k) => { need[st + k] = c; }));
                return need;
            }
        }
        return null;
    }

    // 點數 → 實際牌（含牌背顏色）。colorOk＝每局前 4 張都符合卡色樣式
    function assignCards(points, rng) {
        const pool = new Map();
        for (let p = 0; p < 10; p++) pool.set(p, { R: [], B: [] });
        for (let deck = 0; deck < 8; deck++)
            for (const suit of SUITS)
                for (const rank of RANKS) pool.get(rankPoint(rank))[deck < 4 ? 'R' : 'B'].push({ rank, suit });
        for (const v of pool.values()) { shuffleInPlace(v.R, rng); shuffleInPlace(v.B, rng); }
        const need = planColors(points, rng);
        const cards = new Array(points.length);
        const take = (p, c) => { const card = pool.get(p)[c].pop(); return { rank: card.rank, suit: card.suit, point: p, back_color: c }; };
        // 先放指定顏色的位置，再用剩下的牌填不限顏色的位置
        points.forEach((p, i) => { if (need && need[i]) cards[i] = take(p, need[i]); });
        points.forEach((p, i) => {
            if (cards[i]) return;
            const v = pool.get(p);
            cards[i] = take(p, v.R.length >= v.B.length ? 'R' : 'B');
        });
        return { cards, colorOk: !!need };
    }

    // 訊號牌：全花色 A、2（百家3.0 預設 A.2 模式）
    const isSignalHand = (hand) => hand.some(p => p === 1 || p === 2);
    const neededAfter = (prevHand) =>
        (rules.tripleTie && isTriple(prevHand)) ? '和' : (isSignalHand(prevHand) ? '莊' : '閒');

    // 訊號牌規則（照百家3.0）：上一局是三條 → 這局和（三條優先，含三條 A／2）；
    // 上一局有 A 或 2 → 這局莊；都沒有 → 這局閒。第 1 局的上一局是最後一局（完整局）。
    // 做法：排好後由前往後，把不符合的局對調前兩張（敏感局對調必定莊閒互換、張數不變），
    // 對調後只驗證實際牌序（任一張當起點都穿越、每局敏感、三條規則），不再假設另一次反向。
    // 直接改 chains / leftover 內的點數；回傳 { ok, flips, conflicts }
    function applySignalRule(chains, leftover) {
        const seq = chains.flat().concat(leftover);
        // 從頭發到不足一局為止（排不進去的牌最後可能剩殘牌）
        const rounds = [];
        for (let cur = 0; cur < seq.length;) {
            const h = simulateHand(seq, cur, seq.length);
            if (!h) break;
            rounds.push({ start: cur, size: h.size });
            cur += h.size;
        }
        let flips = 0, conflicts = 0;
        // 依序處理第 2 局到最後一局，最後再處理第 1 局：牌靴頭尾相連，第 1 局看最後一局（完整局）
        const n = rounds.length;
        const order = [];
        for (let k = 1; k < n; k++) order.push(k);
        if (n > 1) order.push(0);
        for (const k of order) {
            const prev = rounds[(k - 1 + n) % n], cur = rounds[k];
            const need = neededAfter(seq.slice(prev.start, prev.start + prev.size));
            const h = simulateHand(seq, cur.start, cur.start + cur.size);
            if (!h || h.result === need) continue;
            if (need === '和' || h.result === '和') { conflicts++; continue; }
            [seq[cur.start], seq[cur.start + 1]] = [seq[cur.start + 1], seq[cur.start]];
            const after = simulateHand(seq, cur.start, cur.start + cur.size);
            if (!after || after.size !== cur.size || after.result !== need) {
                // 對調不成就換回來，記為衝突
                [seq[cur.start], seq[cur.start + 1]] = [seq[cur.start + 1], seq[cur.start]];
                conflicts++;
                continue;
            }
            flips++;
        }
        // 寫回原陣列
        let off = 0;
        for (const ch of chains) { for (let i = 0; i < ch.length; i++) ch[i] = seq[off + i]; off += ch.length; }
        for (let i = 0; i < leftover.length; i++) leftover[i] = seq[off + i];
        // 只算穿越段的衝突；排不進去的牌本來就不保證
        const travEnd = off;
        let travConflicts = 0;
        const issues = [];
        for (let k = 0; k < n; k++) {
            if (rounds[k].start >= travEnd) break;
            if (k === 0 && n < 2) continue;
            const prev = rounds[(k - 1 + n) % n];
            const prevPoints = seq.slice(prev.start, prev.start + prev.size);
            const need = neededAfter(prevPoints);
            const actual = simulateHand(seq, rounds[k].start, rounds[k].start + rounds[k].size).result;
            if (actual !== need) {
                travConflicts++;
                const why = rules.tripleTie && isTriple(prevPoints) ? '上一局是三條，依三條優先應開和'
                    : isSignalHand(prevPoints) ? '上一局有 A／2，應開莊' : '上一局沒有 A／2，應開閒';
                issues.push({ kind: 'signal', round: k + 1, start: rounds[k].start + 1, need, actual,
                    message: `原排牌第 ${k + 1} 局：${k === 0 ? '以最後一個完整局為上一局；' : ''}${why}，調整後仍是${actual}` });
            }
        }
        const ok = travConflicts === 0 && chains.every(ch => qualifiesFinal(ch));
        if (!ok) {
            let start = 1;
            chains.forEach((ch, i) => {
                if (!qualifiesFinal(ch)) {
                    const issue = diagnoseChain(ch);
                    if (issue) issues.push({ ...issue, chain: i + 1, start });
                }
                start += ch.length;
            });
        }
        return { ok, flips, conflicts: travConflicts, issues };
    }

    async function build(options = {}) {
        const opts = {
            idleLimit: options.idleLimit ?? 1000,
            computeTries: options.computeTries ?? 20000,
            chainAttempts: options.chainAttempts ?? 20,
            minLen: options.minLen ?? 8,
            maxLen: options.maxLen ?? 12,
            rng: options.rng || Math.random,
            tripleTie: options.tripleTie !== false,
            signalRule: options.signalRule !== false,
            strong: options.strong === true,
            zeroPolicy: options.zeroPolicy || 'quota',
            quotaFactor: options.quotaFactor ?? 1,
        };
        rules.tripleTie = opts.tripleTie;
        rules.strong = opts.strong;
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
        // 剩下的張數已超過上限：注定要重跑，跳過接段／A、2／卡色，省時間
        if (options.rejectAbove != null && p2.rest.length > options.rejectAbove && !ctx.cancelled()) {
            return { rejected: true, leftoverCount: p2.rest.length, stats: { ms: Date.now() - t0 } };
        }
        const segs = p1.segs.concat(p2.segs);
        let chains = await phaseChain(segs, opts, ctx);
        let leftover = shuffleInPlace(p2.rest.slice(), opts.rng);

        let signal = opts.signalRule ? applySignalRule(chains, leftover) : null;
        // 訊號牌對調後長段不合格：段不變，只換接段順序再試，省掉整副重排
        for (let t = 0; SIGNAL_RETRY_ENABLED && signal && !signal.ok && t < 30 && !ctx.cancelled(); t++) {
            chains = await phaseChain(segs, { ...opts, chainAttempts: 1 }, ctx);
            leftover = shuffleInPlace(p2.rest.slice(), opts.rng);
            signal = applySignalRule(chains, leftover);
        }
        const points = chains.flat().concat(leftover);
        const { cards, colorOk } = assignCards(points, opts.rng);

        // 每條長段的驗證結果
        let offset = 0;
        const chainReports = chains.map(ch => {
            const rounds = roundsFromStart(ch);
            const report = {
                start: offset + 1,
                length: ch.length,
                parts: (ch.parts || [ch.length]).slice(),
                rounds: rounds ? rounds.length : 0,
                traverse: isTraverse(ch),
                allSensitive: !!rounds && rounds.every(r => handSensitive(ch.slice(r.start, r.start + r.size))),
                qualified: qualifiesFinal(ch),
            };
            offset += ch.length;
            return report;
        });

        return {
            cards,
            chains: chainReports,
            leftoverCount: leftover.length,
            colorOk,
            signal,
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

    global.TraverseBuilder = { allSensitiveHands, COLOR_PATTERNS, SIGNAL_RETRY_ENABLED, build, diagnoseChain, qualifies, qualifiesFinal, isTraverse, roundsFromStart, handSensitive, simulateHand, isTriple, isSignalHand, neededAfter, rules };

})(typeof window !== 'undefined' ? window : globalThis);
