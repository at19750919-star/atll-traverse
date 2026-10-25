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
//      （A.2 關閉時不檢查，改在排好後對調前兩張平衡莊閒）
//
// 流程：
//   階段 1  洗牌 → 撿出所有合格段 → 剩下的重洗再撿，直到連續 N 次撿不到
//           每段 0 點比例不得低於剩餘牌堆的 0 點比例（避免最後剩一堆 0 點）
//   階段 2  剩下的牌改用「敏感局組合」計算排列，再撿出合格段
//           開啟第二張敏感時，補排也照 0 點比例；排不下的牌關掉第二張條件，重做階段 1、2
//   階段 3  把合格段接成長段（接縫處重新完整檢查）
//   剩下撿不進去的牌放在整條牌最後面
//   可選 4／5／6 張局上下限（sizeLimits）：撿段與補排時計數，超過上限不收、
//   下限進度落後時不收沒有該張數局的段
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
        return { result, size, player: pp, banker: bb };
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
    const rules = { tripleTie: true, signalRule: true, strong: false, secondStart: false, skipBanker6: false, skipPlayer7: false, mixedColor: false };
    // 莊6／閒7（比照百家3.0）：原牌或前兩張對調後，莊補牌（6 張）後 6 點贏、或閒 7 點贏莊 6 點的局不撿（閒補牌莊不補的 5 張莊6贏不排除）
    function excludedHand(hand) {
        if (!rules.skipBanker6 && !rules.skipPlayer7) return false;
        const bad = (a) => {
            const h = simulateHand(a, 0, a.length);
            if (!h) return false;
            if (rules.skipBanker6 && h.banker === 6 && h.player <= 5 && h.size === 6) return true;
            return rules.skipPlayer7 && h.player === 7 && h.banker === 6;
        };
        const sw = hand.slice();
        [sw[0], sw[1]] = [sw[1], sw[0]];
        return bad(hand) || bad(sw);
    }
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

    // 每個短段從第二張發牌；不足一局的尾牌略過，但至少須有一個完整局。
    function secondStartOk(seg) {
        let complete = 0;
        for (let cur = 1; cur < seg.length;) {
            const h = simulateHand(seg, cur, seg.length);
            if (!h) break;
            if (!handSensitive(seg.slice(cur, cur + h.size))) return false;
            complete++;
            cur += h.size;
        }
        return complete > 0;
    }

    // secondParts 標記哪些短段須檢查第二張；原條件續排撿到的短段為 false，沒有標記時全部檢查。
    function segmentsSecondStart(ch) {
        const parts = ch.parts || [ch.length];
        let off = 0;
        for (let i = 0; i < parts.length; i++) {
            const check = !ch.secondParts || ch.secondParts[i];
            if (check && !secondStartOk(ch.slice(off, off + parts[i]))) return false;
            off += parts[i];
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
            const hand = arr.slice(r.start, r.start + r.size);
            if (!handSensitive(hand) || excludedHand(hand)) return null;
        }
        if (rules.tripleTie && !tripleRuleOk(arr, rounds)) return null;
        return rounds;
    }

    // 撿段、接段仍使用原候選規則，為之後依訊號調整方向做準備。
    // single：只有撿單一短段時套 strongOk；接好的長段用 segmentsStrong。
    function qualifies(arr, single = false) {
        if (single && rules.strong && !strongOk(arr)) return false;
        if (rules.secondStart && !(single ? secondStartOk(arr) : segmentsSecondStart(arr))) return false;
        const rounds = actualChainRounds(arr);
        if (!rounds) return false;
        // 單局對調後仍穿越只為 A.2 訊號對調預留；A.2 關閉時不會對調，跳過（否則前兩張同點的和局會被大量撿入）
        if (!rules.signalRule) return true;
        for (const r of rounds) {
            const sw = arr.slice();
            [sw[r.start], sw[r.start + 1]] = [sw[r.start + 1], sw[r.start]];
            if (!isTraverse(sw)) return false;
        }
        return true;
    }

    // 最終驗收使用已按訊號調整的實際牌序，不再要求不會採用的反向也能穿越。
    function qualifiesFinal(arr) {
        return !!actualChainRounds(arr) && (!rules.strong || segmentsStrong(arr))
            && (!rules.secondStart || segmentsSecondStart(arr));
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
        for (let i = 0; i < rounds.length; i++) {
            const r = rounds[i];
            if (excludedHand(arr.slice(r.start, r.start + r.size))) return { kind: 'banker6', round: i + 1, message: `段內第 ${i + 1} 局原牌或對調後是莊6點贏／閒7贏莊6` };
        }
        if (rules.tripleTie && !tripleRuleOk(arr, rounds)) return { kind: 'triple', message: '段內三條與下一局結果不符，或段頭為和／段尾為三條' };
        if (rules.strong && !segmentsStrong(arr)) return { kind: 'strong', message: '短段內有起點不符合強條件' };
        if (rules.secondStart && !segmentsSecondStart(arr)) return { kind: 'secondStart', message: '短段從第二張起發的完整局不全是敏感局（不足一局的尾牌不檢查）' };
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

    // ===== 穿越挑段原目標：上限不放寬；下限依缺額優先挑選，避免剩餘牌數無法補足 =====
    // 最終整副的3局允差僅由 TraverseQuota 驗收；挑段不使用放寬後界限。
    const SIZE_KEYS = [4, 5, 6];
    function normalizeSizeLimits(limits) {
        if (!limits) return null;
        const out = {};
        let any = false;
        for (const k of SIZE_KEYS) {
            const v = limits[k] || {};
            const min = Number.isInteger(v.min) && v.min >= 0 ? v.min : null;
            const max = Number.isInteger(v.max) && v.max >= 0 ? v.max : null;
            out[k] = { min, max };
            if (min !== null || max !== null) any = true;
        }
        return any ? out : null;
    }
    function roundSizeCounts(points) {
        const c = { 4: 0, 5: 0, 6: 0, tie: 0 };
        for (let cur = 0; cur < points.length;) {
            const h = simulateHand(points, cur, points.length);
            if (!h) break;
            c[h.size]++;
            if (h.result === '和') c.tie++;
            cur += h.size;
        }
        return c;
    }
    // Actual-round counters are shared by picking, final acceptance and the
    // optimizer. Reversing a candidate may change these counts, so the final
    // physical shoe is checked again after applying signals.
    function specialRoundCounts(points) {
        const out = { bankerSix: 0, seven: 0, rare: 0, drawSix: 0 };
        for (let cur = 0; cur < points.length;) {
            const h = simulateHand(points, cur, points.length);
            if (!h) break;
            const hand = points.slice(cur, cur + h.size), p = (hand[0] + hand[2]) % 10, b = (hand[1] + hand[3]) % 10;
            if (h.banker === 6 && h.player <= 5) out.bankerSix++;
            if (p < 8 && b < 8 && ((p === 7 && h.result === '莊') || (b === 7 && h.result === '閒'))) out.seven++;
            if (global.TwoThirteenReversals && global.TwoThirteenReversals.classify({ cards: hand.map(n => ({ rank: String(n) })) })) out.rare++;
            const sw = hand.slice(); [sw[0],sw[1]] = [sw[1],sw[0]];
            const swapped = simulateHand(sw, 0, sw.length);
            const drawSix = r => r && r.size === 6 && r.banker === 6 && r.player <= 5;
            if (drawSix(h) || drawSix(swapped)) out.drawSix++;
            cur += h.size;
        }
        return out;
    }

    // 三條開／關都按原和局上限撿段；三條與和的相鄰要求仍由 qualifies 驗證。
    function sizeLimitOk(seg, opts) {
        if (!opts.sizeLimits && opts.tieMax === null && !opts.specialLimits) return true;
        if (opts.specialLimits) {
            const special = specialRoundCounts(seg);
            for (const k of ['bankerSix','seven','rare']) {
                const max = opts.specialLimits[k];
                if (max !== null && opts.specialTally[k] + special[k] > max) return false;
            }
        }
        const c = roundSizeCounts(seg), t = opts.sizeTally;
        if (opts.tieMax !== null && opts.tieTally + c.tie > opts.tieMax) return false;
        if (!opts.sizeLimits) return true;
        for (const k of SIZE_KEYS) {
            const { min, max } = opts.sizeLimits[k];
            if (max !== null && t[k] + c[k] > max) return false;

        }
        const remaining=416-opts.sizeUsedCards,after=remaining-seg.length;
        const need=extra=>SIZE_KEYS.reduce((n,k)=>n+Math.max(0,(opts.sizeLimits[k].min??0)-t[k]-(extra?c[k]:0))*k,0);
        if(need(false)<=remaining&&need(true)>after)return false;
        return true;
    }
    // 穿越A2莊閒控制：前一局有 A／2 這局就開莊，所以莊局數約等於「含 A／2、非三條、下一局不是和」的局數。
    // sideDelta＝這段讓（莊－閒和）多出幾局；sideScore＝挑這段後，依剩牌 A／2 比例推估整副最終差距的絕對值。
    const SIDE_HAND = 4.94;
    const sideSigCount = seg => seg.reduce((n, p) => n + (p === 1 || p === 2 ? 1 : 0), 0);
    function sideDelta(seg) {
        const rs = roundsFromStart(seg);
        if (!rs) return 0;
        let banker = 0;
        rs.forEach((r, i) => {
            const hand = seg.slice(r.start, r.start + r.size);
            if (!hand.some(p => p === 1 || p === 2) || rules.tripleTie && isTriple(hand) || rs[i + 1]?.result === '和') return;
            banker++;
        });
        return 2 * banker - rs.length;
    }
    function sideScore(seg, opts, sigLeft, lenLeft) {
        const sig = sigLeft - sideSigCount(seg), len = lenLeft - seg.length;
        const q = len > 0 ? Math.max(0, sig) / len : 0, p = 1 - Math.pow(1 - q, SIDE_HAND);
        return Math.abs(opts.sideE + sideDelta(seg) + len / SIDE_HAND * (2 * p - 1));
    }
    // 候選比較：有局數配額時配額優先，相同才看莊閒；沒有配額時開了莊閒控制才換成推估差距較小者
    function pickBetter(a, b, opts, quota, sigLeft, lenLeft) {
        if (!b) return true;
        if (quota) { if (preferQuota(a, b, opts)) return true; if (preferQuota(b, a, opts)) return false; }
        return !!opts.sideCtl && sideScore(a, opts, sigLeft, lenLeft) < sideScore(b, opts, sigLeft, lenLeft);
    }

    // sign＝-1 時扣回（借回短段重排時用）
    function sizeLimitAdd(seg, opts, sign = 1) {
        if (opts.sideCtl) opts.sideE += sign * sideDelta(seg);
        if (!opts.sizeLimits && opts.tieMax === null && !opts.specialLimits) return;
        if (opts.specialLimits) {
            const special = specialRoundCounts(seg);
            for (const k of ['bankerSix','seven','rare']) opts.specialTally[k] += sign * special[k];
        }
        const c = roundSizeCounts(seg);
        opts.tieTally += sign * c.tie;
        for (const k of SIZE_KEYS) opts.sizeTally[k] += sign * c[k];
        opts.sizeUsedCards += sign * seg.length;
    }

    const quotaActive=opts=>!!opts.sizeLimits||opts.tieMax!==null;
    function segmentStats(seg){return roundSizeCounts(seg);}
    // Lexicographic priorities: reduce cards still required for minima, then
    // preserve proportional upper budgets, then lower-bound progress and zeros.
    function quotaPriority(seg,opts){
        const c=segmentStats(seg),used=opts.sizeUsedCards+seg.length,ratio=used/416;
        let upper=0,lag=0,neededCards=0;
        for(const k of SIZE_KEYS){const bound=opts.sizeLimits?.[k];if(!bound)continue;
            if(bound.max!==null)upper=Math.max(upper,opts.sizeTally[k]+c[k]-bound.max*ratio);
            if(bound.min!==null){lag+=Math.max(0,bound.min*ratio-opts.sizeTally[k]-c[k]);neededCards+=Math.max(0,bound.min-opts.sizeTally[k]-c[k])*k;}}
        if(opts.tieMax!==null)upper=Math.max(upper,opts.tieTally+c.tie-opts.tieMax*ratio);
        return [neededCards,Math.max(0,upper),lag,-seg.filter(p=>p===0).length/seg.length];
    }
    function preferQuota(a,b,opts){if(!b)return true;const x=quotaPriority(a,opts),y=quotaPriority(b,opts);for(let i=0;i<x.length;i++){if(x[i]!==y[i])return x[i]<y[i];}return false;}

    async function rememberTemplate(seg,opts){if(opts.collectTemplates&&global.TraverseTemplates){const L=global.TraverseTemplates;if(L.collectAsync)await L.collectAsync([seg]);else L.collect([seg]);}}
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
            let sigLeft = sideSigCount(rest), lenLeft = rest.length;
            for (let s = 0; s < rest.length; s++) {
                if(quotaActive(opts)&&s%24===0){await tick();if(ctx.cancelled())break;}
                let pick = null;
                if(quotaActive(opts)){
                    let candidates=0;
                    scan:for(let at=s;at<Math.min(rest.length,s+24);at++)for(const L of opts.scanLengths){
                        if(ctx.cancelled())break scan;
                        if(at+L>rest.length)continue;
                        let overlap=false;for(let k=at;k<at+L;k++)if(used[k]){overlap=true;break;}if(overlap)continue;
                        const a=rest.slice(at,at+L);if(!qualifies(a,true))continue;await rememberTemplate(a,opts);
                        const z=a.filter(p=>p===0).length;if(opts.zeroPolicy==='quota'&&z<Math.floor(zeroShare*L*opts.quotaFactor))continue;
                        if(!sizeLimitOk(a,opts))continue;
                        candidates++;if(pickBetter(a,pick?.a,opts,true,sigLeft,lenLeft))pick={L,a,at};
                        if(candidates>=8)break scan;
                    }
                }else{

                for (const L of opts.scanLengths) {
                    if (s + L > rest.length) continue;
                    let overlap = false;
                    for (let k = s; k < s + L; k++) if (used[k]) { overlap = true; break; }
                    if (overlap) continue;
                    const a = rest.slice(s, s + L);
                    if (!qualifies(a, true)) continue;await rememberTemplate(a,opts);
                    const z = a.filter(p => p === 0).length;
                    if (opts.zeroPolicy === 'quota' && z < Math.floor(zeroShare * L * opts.quotaFactor)) continue;
                    if (!sizeLimitOk(a, opts)) continue;
                    if (opts.sideCtl) { const side = sideScore(a, opts, sigLeft, lenLeft); if (!pick || side < pick.side) pick = { L, a, side }; continue; }
                    if (opts.zeroPolicy === 'none') { pick = { L, a }; break; }
                    const score = z / L;
                    if (!pick || score > pick.score) pick = { L, a, score };
                }
                }
                if(ctx.cancelled())break;
                if (pick) {
                    sizeLimitAdd(pick.a, opts);
                    sigLeft -= sideSigCount(pick.a); lenLeft -= pick.a.length;
                    segs.push(pick.a);
                    for (let k = (pick.at??s); k < (pick.at??s) + pick.L; k++) used[k] = 1;
                    got++;
                    if(!quotaActive(opts))s += pick.L - 1;
                }else if(quotaActive(opts)){s+=23;}
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

    // 計算補排先查穿越範本庫：找剩牌湊得出的點數組成，依目前規則重驗（穿越／敏感／三條／第二張、0點比例、局數配額）後直接採用
    async function templatePick(rest, opts, ctx) {
        const groups = opts.templateIndex;
        if (!groups?.length || rest.length < opts.minLen) return null;
        if (!opts.templateOrder || opts.templateOrder.source !== groups || opts.templateOrder.length !== groups.length) {
            // 0 點比例高、張數長的組成先試，與原本撿段偏好 0 點多的段相同
            opts.templateOrder = groups.slice().sort((a, b) => b.zeros / b.length - a.zeros / a.length || b.length - a.length);
            opts.templateOrder.source = groups;
        }
        const counts = countsOf(rest), quota = quotaActive(opts), compare = quota || opts.sideCtl;
        const sigLeft = counts[1] + counts[2], lenLeft = rest.length;
        let best = null, found = 0, checked = 0;
        for (const g of opts.templateOrder) {
            if (g.length < opts.minLen || g.length > opts.maxLen || g.length > rest.length) continue;
            let fit = true;
            for (let k = 0; k < 10; k++) if (g.counts[k] > counts[k]) { fit = false; break; }
            if (!fit) continue;
            if (opts.computeQuota && g.zeros < Math.floor(counts[0] / rest.length * g.length * opts.quotaFactor)) continue;
            for (const p of g.points) {
                if (++checked % 256 === 0) { await tick(); if (ctx.cancelled()) return best; }
                if (!qualifies(p, true) || !sizeLimitOk(p, opts)) continue;
                if (!compare) return p.slice();
                found++;
                if (pickBetter(p, best, opts, quota, sigLeft, lenLeft)) best = p.slice();
                break;
            }
            if (compare && found >= 8) break;
        }
        return best;
    }

    // 剩牌太少湊不出範本時，借回一段已撿的短段和剩牌合併，改用範本重新分段；剩牌真的變少才採用，否則原樣還回
    async function borrowWithTemplates(segs, rest, opts, ctx) {
        // 範本庫是空的就不借段，也不動到亂數，維持原本排牌結果
        if (!opts.templateIndex?.length || !rest.length || !segs.length) return rest;
        let improved = true, tries = 0;
        while (improved && rest.length && !ctx.cancelled()) {
            improved = false;
            const order = shuffleInPlace(segs.map((_, i) => i), opts.rng);
            for (const i of order) {
                if (++tries > opts.borrowTries || ctx.cancelled()) return rest;
                const seg = segs[i];
                sizeLimitAdd(seg, opts, -1);
                let pool = rest.concat(seg);
                const picks = [];
                for (let t; pool.length >= opts.minLen && (t = await templatePick(pool, opts, ctx));) {
                    picks.push(t);
                    sizeLimitAdd(t, opts);
                    const c = countsOf(t);
                    pool = pool.filter(p => (c[p] > 0 ? (c[p]--, false) : true));
                }
                if (pool.length < rest.length) {
                    segs.splice(i, 1, ...picks);
                    opts.templateBorrowHits = (opts.templateBorrowHits || 0) + 1;
                    ctx.progress(`階段 2 計算排列：借回短段改用範本，剩 ${pool.length} 張`);
                    rest = pool;
                    improved = true;
                    break;
                }
                picks.forEach(t => sizeLimitAdd(t, opts, -1));
                sizeLimitAdd(seg, opts);
            }
        }
        return rest;
    }

    async function phaseCompute(rest, opts, ctx) {
        const hands = allSensitiveHands();
        const segs = [];
        let tries = 0;
        let idle = 0;
        let templateDry = !opts.templateIndex;
        while (idle < opts.computeTries && rest.length >= opts.minLen) {
            if (ctx.cancelled()) break;
            if (!templateDry) {
                const t = await templatePick(rest, opts, ctx);
                if (t) {
                    sizeLimitAdd(t, opts);
                    segs.push(t);
                    const c = countsOf(t);
                    rest = rest.filter(p => (c[p] > 0 ? (c[p]--, false) : true));
                    opts.templateComputeHits = (opts.templateComputeHits || 0) + 1;
                    idle = 0;
                    ctx.progress(`階段 2 計算排列：範本庫補撿 ${opts.templateComputeHits} 段，剩 ${rest.length} 張`);
                    continue;
                }
                templateDry = true;
            }
            const counts = countsOf(rest);
            const usable = hands.filter(h => fits(h, counts));
            if (usable.length === 0) break;
            let found = null, candidates=0;
            const quota=quotaActive(opts), compare=quota||opts.sideCtl, sigLeft=counts[1]+counts[2], lenLeft=rest.length;
            // 隨機挑敏感局一局一局接，長度落在範圍內就檢查整段
            for (let t = 0; t < 2000 && (!found || compare&&candidates<8); t++) {
                if(ctx.cancelled())break;
                if(quota&&t%32===0)await tick();
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
                    if (seq.length >= opts.minLen && qualifies(seq, true)) {
                        await rememberTemplate(seq,opts);
                        // 第二張敏感開啟時補排也照 0 點比例，否則 0 點會堆到最後排不進去
                        if (opts.computeQuota && seq.filter(p => p === 0).length < Math.floor(counts[0] / rest.length * seq.length * opts.quotaFactor)) continue;
                        if (!sizeLimitOk(seq, opts)) continue;
                        candidates++;
                        if(pickBetter(seq,found,opts,quota,sigLeft,lenLeft))found=seq;
                        break;
                    }
                }
            }
            if (found) {
                sizeLimitAdd(found, opts);
                segs.push(found);
                const c = countsOf(found);
                rest = rest.filter(p => (c[p] > 0 ? (c[p]--, false) : true));
                idle = 0;
                templateDry = !opts.templateIndex;
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
            const pool = shuffleInPlace(segs.map(s => {
                const c = s.slice();
                c.parts = [s.length];
                c.secondParts = [s.secondStart !== false];
                return c;
            }), opts.rng);
            const chains = [];
            while (pool.length) {
                let chain = pool.shift();
                let extended = true;
                while (extended) {
                    extended = false;
                    for (let i = 0; i < pool.length; i++) {
                        const joined = chain.concat(pool[i]);
                        joined.parts = chain.parts.concat(pool[i].parts);
                        joined.secondParts = chain.secondParts.concat(pool[i].secondParts);
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
        if (!best) return segs.slice().sort((a, b) => b.length - a.length);
        return opts.chainMerge ? await mergeChains(best.chains, ctx) : best.chains;
    }

    // 長段與長段之間的交界沒有穿越保證，切牌溢出會一段接一段延長；同一長段內則有保證。
    // 貪心接段後再試著把長段兩兩合併（前接或後接，整條須重新通過穿越檢查），減少沒有保證的交界。
    function joinChains(a, b) {
        const joined = a.concat(b);
        joined.parts = (a.parts || [a.length]).concat(b.parts || [b.length]);
        joined.secondParts = (a.secondParts || [a.secondStart !== false]).concat(b.secondParts || [b.secondStart !== false]);
        return qualifies(joined) ? joined : null;
    }
    async function mergeChains(chains, ctx) {
        const list = chains.slice().sort((a, b) => a.length - b.length);
        let merged = true;
        while (merged && list.length > 1 && !ctx.cancelled()) {
            merged = false;
            outer: for (let i = 0; i < list.length; i++) {
                for (let j = 0; j < list.length; j++) {
                    if (i === j) continue;
                    const joined = joinChains(list[i], list[j]);
                    if (joined) {
                        const keep = list.filter((_, k) => k !== i && k !== j);
                        keep.push(joined);
                        list.splice(0, list.length, ...keep.sort((a, b) => a.length - b.length));
                        merged = true;
                        break outer;
                    }
                }
                await tick();
            }
            ctx.progress(`階段 3 接段：合併長段，剩 ${list.length} 條`);
        }
        return list.sort((a, b) => b.length - a.length);
    }

    // 點數 → 實際牌（每個點數從 8 副牌的牌池隨機取）
    // 卡色（牌背）：8 副牌中 4 副紅背、4 副藍背（同百家3.0 generateDeck）。
    // 預設只用 RRRB／BBBR；混色時再加 BBRR／RRBB，兩組各最多連續3局。
    // 第 5、6 張與殘牌不限。
    // 這兩種樣式前兩張同色，所以對調前兩張不會破壞卡色。
    const COLOR_PATTERNS = [['R', 'R', 'R', 'B'], ['B', 'B', 'B', 'R']];

    // 依點數決定每局用哪個卡色樣式，使各點數紅背／藍背的需求不超過牌數。
    // 回傳每個位置要的顏色（'R'／'B'／null＝不限），做不到回傳 null
    function planColors(points, rng, groups = points, limits = null) {
        const rounds = [];
        for (let cur = 0; cur < points.length;) {
            const h = simulateHand(points, cur, points.length);
            if (!h) break;
            rounds.push(cur);
            cur += h.size;
        }
        const supply = new Array(Math.max(...groups) + 1).fill(0);
        for (const p of groups) supply[p]++;
        const half = supply.map(n => n / 2); // 每個點數紅、藍各半
        const available = limits || { R: half, B: half };
        if (typeof CardColorRules !== 'undefined') {
            return CardColorRules.plan(rounds, groups, available, points.length, { mixed: rules.mixedColor === true, rng });
        }
        for (let attempt = 0; attempt < 50; attempt++) {
            const pick = rounds.map(() => (rng() < 0.5 ? 0 : 1));
            const demand = () => {
                const d = { R: new Array(supply.length).fill(0), B: new Array(supply.length).fill(0) };
                rounds.forEach((st, i) => COLOR_PATTERNS[pick[i]].forEach((c, k) => d[c][groups[st + k]]++));
                return d;
            };
            const overflow = (d) => {
                let o = 0;
                for (let p = 0; p < supply.length; p++) o += Math.max(0, d.R[p] - available.R[p]) + Math.max(0, d.B[p] - available.B[p]);
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

    // 只重配牌背，保留每個位置的牌面、點數及同牌面紅藍張數。
    function reassignColors(cards, rng = Math.random) {
        if (!Array.isArray(cards) || !cards.length || cards.some(c =>
            !Number.isInteger(c.point) || c.point < 0 || c.point > 9 || !['R', 'B'].includes(c.back_color))) {
            throw new Error('牌張或牌背資料不完整，無法重新分配卡色');
        }
        const ids = new Map(), groups = cards.map(c => {
            const key = `${c.rank}|${c.suit}`;
            if (!ids.has(key)) ids.set(key, ids.size);
            return ids.get(key);
        });
        const limits = { R: new Array(ids.size).fill(0), B: new Array(ids.size).fill(0) };
        cards.forEach((c, i) => limits[c.back_color][groups[i]]++);
        const need = planColors(cards.map(c => c.point), rng, groups, limits);
        if (!need) return { ok: false, cards, changed: 0 };
        const remaining = { R: limits.R.slice(), B: limits.B.slice() };
        need.forEach((color, i) => { if (color) remaining[color][groups[i]]--; });
        const assigned = cards.map((card, i) => {
            let color = need[i];
            if (!color) {
                color = remaining[card.back_color][groups[i]] > 0 ? card.back_color : card.back_color === 'R' ? 'B' : 'R';
                remaining[color][groups[i]]--;
            }
            return { ...card, back_color: color };
        });
        return { ok: true, cards: assigned, changed: assigned.filter((c, i) => c.back_color !== cards[i].back_color).length };
    }

    // 訊號牌依花色 × 牌面選取；未設定時維持全花色 A、2。
    const defaultSignal = () => ({ suits: SUITS.slice(), ranks: ['A', '2'] });
    function normalizeSignal(config) {
        if (!config) return defaultSignal();
        return { suits: SUITS.filter(s => config.suits?.includes(s)), ranks: RANKS.filter(r => config.ranks?.includes(r)) };
    }
    const isSignalCard = (card, config = rules.signalConfig) => {
        const c = normalizeSignal(config);
        return c.suits.includes(card.suit) && c.ranks.includes(card.rank);
    };
    const isSignalHand = (hand, config = rules.signalConfig) => hand.some(c => typeof c === 'number'
        ? normalizeSignal(config).ranks.some(r => rankPoint(r) === c) : isSignalCard(c, config));
    const neededAfter = (prevHand) =>
        (rules.tripleTie && isTriple(prevHand.map(c => typeof c === 'number' ? c : c.point))) ? '和' : (isSignalHand(prevHand) ? '莊' : '閒');

    // 三條關閉時，上一局沒有訊號牌（應開閒）的和局視為符合（照百家3.0：任何局都可開和，但不能接在訊號局後面）
    const tieAllowed = (need, result) => !rules.tripleTie && need === '閒' && result === '和';

    // 訊號牌靠花色區分時（例：紅0＝♥♦ 的 10JQK），同點數的牌可互換位置而不影響點數、勝負與穿越。
    // 用這個自由度決定哪些局含訊號牌：讓和局不接在訊號局後面，並把莊／閒＋和的差距壓到 sideTarget 以內。
    // 只在同點數之間交換實際牌（physicalCards），回傳 { moves, diff, tieBad }；沒有可調的牌時回傳 null
    function arrangeSignalCards(seq, physicalCards, opts) {
        const rounds = [];
        for (let cur = 0; cur < seq.length;) {
            const h = simulateHand(seq, cur, seq.length);
            if (!h) break;
            rounds.push({ start: cur, size: h.size, result: h.result, trip: rules.tripleTie && isTriple(seq.slice(cur, cur + h.size)) });
            cur += h.size;
        }
        const R = rounds.length;
        if (R < 2) return null;
        const roundOf = new Int32Array(seq.length).fill(-1);
        rounds.forEach((r, i) => { for (let k = 0; k < r.size; k++) roundOf[r.start + k] = i; });
        const isSig = c => isSignalCard(c);
        const sig = new Int32Array(R);
        const groups = new Map();
        physicalCards.forEach((c, i) => {
            if (isSig(c) && roundOf[i] >= 0) sig[roundOf[i]]++;
            if (!groups.has(c.point)) groups.set(c.point, []);
            groups.get(c.point).push(i);
        });
        const flex = [...groups.values()].filter(pos => {
            const s = pos.filter(i => isSig(physicalCards[i])).length;
            return s > 0 && s < pos.length;
        });
        if (!flex.length) return null;
        // 只有一組可調的點數時（紅0：0 點的 10JQK），先「集中放」：挑約一半的局放訊號牌，
        // 優先挑 0 點牌多的局（三張公的局三張都放紅0），讓開莊的局數接近其他局；
        // 訊號局的下一局不能是和局（三條局除外，三條優先下一局本來就開和），三條局與局外位置可多放、不影響莊數
        if (flex.length === 1) packSignalCards(flex[0]);
        const target = Number.isInteger(opts.sideTarget) && opts.sideTarget >= 0 ? opts.sideTarget : null;
        const evaluate = () => {
            let banker = 0, other = 0, tieBad = 0;
            for (let k = 0; k < R; k++) {
                const prev = rounds[(k - 1 + R) % R], cur = rounds[k];
                const need = prev.trip ? '和' : sig[(k - 1 + R) % R] > 0 ? '莊' : '閒';
                let res = cur.result;
                if (res === '和') { if (need === '莊') tieBad++; }
                else if (need !== '和') res = need;
                if (res === '莊') banker++; else other++;
            }
            const diff = Math.abs(banker - other);
            return { diff, tieBad, cost: tieBad * 1000 + (target === null ? 0 : Math.max(0, diff - target)) };
        };
        function packSignalCards(pos) {
            const rng = opts.rng;
            const sigCards = pos.filter(i => isSig(physicalCards[i])).map(i => physicalCards[i]);
            const plainCards = pos.filter(i => !isSig(physicalCards[i])).map(i => physicalCards[i]);
            const K = sigCards.length;
            const inPos = new Set(pos);
            const flexOf = new Int32Array(R), fixedSig = new Int32Array(R);
            pos.forEach(i => { if (roundOf[i] >= 0) flexOf[roundOf[i]]++; });
            physicalCards.forEach((c, i) => { if (!inPos.has(i) && isSig(c) && roundOf[i] >= 0) fixedSig[roundOf[i]]++; });
            const nextTie = k => rounds[(k + 1) % R].result === '和';
            // 不會產生莊的位置：三條局、局外（剩牌）位置
            const sinkPos = pos.filter(i => roundOf[i] < 0 || rounds[roundOf[i]].trip);
            // 已固定是訊號局（含不可調的訊號牌）且不是三條局：一定會讓下一局開莊
            let forced = 0;
            for (let k = 0; k < R; k++) if (fixedSig[k] > 0 && !rounds[k].trip) forced++;
            const want = Math.max(0, Math.round(R / 2) - forced);
            const eligible = [];
            for (let k = 0; k < R; k++) {
                if (rounds[k].trip || fixedSig[k] > 0 || flexOf[k] === 0 || nextTie(k)) continue;
                eligible.push(k);
            }
            shuffleInPlace(eligible, rng);
            eligible.sort((x, y) => flexOf[y] - flexOf[x]);
            const sinkCap = sinkPos.length;
            let count = Math.min(want, eligible.length, K);
            const capOf = n => eligible.slice(0, n).reduce((s, k) => s + flexOf[k], 0) + sinkCap;
            while (count < Math.min(eligible.length, K) && capOf(count) < K) count++;
            if (capOf(count) < K) return false;
            const chosen = new Set(eligible.slice(0, count));
            // 每個選中的局先放一張，剩下的訊號牌隨機放進選中局的其他 0 點位置或三條局／局外位置
            const sigAt = new Set();
            const rest = [];
            const byRound = new Map();
            pos.forEach(i => { const k = roundOf[i]; if (chosen.has(k)) { if (!byRound.has(k)) byRound.set(k, []); byRound.get(k).push(i); } });
            for (const list of byRound.values()) {
                shuffleInPlace(list, rng);
                sigAt.add(list[0]);
                rest.push(...list.slice(1));
            }
            rest.push(...sinkPos);
            shuffleInPlace(rest, rng);
            for (const i of rest) { if (sigAt.size >= K) break; sigAt.add(i); }
            if (sigAt.size !== K) return false;
            shuffleInPlace(sigCards, rng); shuffleInPlace(plainCards, rng);
            pos.forEach(i => { physicalCards[i] = sigAt.has(i) ? sigCards.pop() : plainCards.pop(); });
            sig.fill(0);
            physicalCards.forEach((c, i) => { if (isSig(c) && roundOf[i] >= 0) sig[roundOf[i]]++; });
            return true;
        }
        let best = evaluate(), moves = 0;
        const rng = opts.rng;
        for (let step = 0; step < 20000 && best.cost > 0; step++) {
            const pos = flex[Math.floor(rng() * flex.length)];
            const i = pos[Math.floor(rng() * pos.length)], j = pos[Math.floor(rng() * pos.length)];
            const si = isSig(physicalCards[i]), sj = isSig(physicalCards[j]);
            if (si === sj || roundOf[i] === roundOf[j]) continue;
            const apply = () => {
                [physicalCards[i], physicalCards[j]] = [physicalCards[j], physicalCards[i]];
                const d = si ? -1 : 1;
                if (roundOf[i] >= 0) sig[roundOf[i]] += d;
                if (roundOf[j] >= 0) sig[roundOf[j]] -= d;
            };
            apply();
            const now = evaluate();
            if (now.cost <= best.cost) { best = now; moves++; }
            else {
                // 換回來：交換後 i、j 的訊號身分互換，反向更新
                [physicalCards[i], physicalCards[j]] = [physicalCards[j], physicalCards[i]];
                const d = si ? -1 : 1;
                if (roundOf[i] >= 0) sig[roundOf[i]] -= d;
                if (roundOf[j] >= 0) sig[roundOf[j]] += d;
            }
        }
        return { moves, diff: best.diff, tieBad: best.tieBad };
    }

    // 訊號牌規則（照百家3.0）：上一局是三條 → 這局和（三條優先，含三條 A／2）；
    // 上一局有訊號牌 → 這局莊；沒有 → 這局閒。第 1 局的上一局是最後一局（完整局）。
    // 做法：排好後由前往後，把不符合的局對調前兩張（敏感局對調必定莊閒互換、張數不變），
    // 對調後只驗證實際牌序（任一張當起點都穿越、每局敏感、三條規則），不再假設另一次反向。
    // 直接改 chains / leftover 內的點數；回傳 { ok, flips, conflicts }
    // A2 membership is invariant under a within-round first-two swap. Test each
    // possible tail->head requirement on a COPY, then retain only fully legal chains.
    function planA2TailBoundaries(chains) {
        const plans=[];
        for(const incoming of ['莊','閒','和']){
            const seq=chains.flat(),rounds=roundsFromStart(seq);if(!rounds?.length)continue;
            let ok=true,flips=0;
            for(let k=0;k<rounds.length;k++){
                const cur=rounds[k],prev=rounds[k-1],need=k?neededAfter(seq.slice(prev.start,prev.start+prev.size)):incoming;
                const hand=seq.slice(cur.start,cur.start+cur.size),h=simulateHand(hand,0,hand.length);
                if(h.result===need||tieAllowed(need,h.result))continue;
                if(h.result==='和'||need==='和'){ok=false;break;}
                [seq[cur.start],seq[cur.start+1]]=[seq[cur.start+1],seq[cur.start]];
                const after=simulateHand(seq,cur.start,cur.start+cur.size);
                if(!after||after.size!==cur.size||after.result!==need||!handSensitive(seq.slice(cur.start,cur.start+cur.size))){ok=false;break;}flips++;
            }
            if(!ok)continue;
            let offset=0;const proposed=chains.map(ch=>{const copy=Object.assign(ch.slice(),{parts:ch.parts?.slice(),secondParts:ch.secondParts?.slice()});for(let i=0;i<copy.length;i++)copy[i]=seq[offset+i];offset+=copy.length;return copy;});
            if(!proposed.every(ch=>qualifiesFinal(ch)))continue;
            const last=rounds.at(-1),first=rounds[0],lastHand=seq.slice(last.start,last.start+last.size);
            plans.push({chains:proposed,points:seq,flips,firstResult:simulateHand(seq,0,first.size).result,previousTrip:rules.tripleTie&&isTriple(lastHand),previousSignal:isSignalHand(lastHand)});
        }
        return plans;
    }

    function applySignalRule(chains, leftover, physicalCards = null) {
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
            const need = neededAfter((physicalCards || seq).slice(prev.start, prev.start + prev.size));
            const h = simulateHand(seq, cur.start, cur.start + cur.size);
            if (!h || h.result === need || tieAllowed(need, h.result)) continue;
            if (need === '和' || h.result === '和') { conflicts++; continue; }
            [seq[cur.start], seq[cur.start + 1]] = [seq[cur.start + 1], seq[cur.start]];
            if (physicalCards) [physicalCards[cur.start], physicalCards[cur.start + 1]] = [physicalCards[cur.start + 1], physicalCards[cur.start]];
            const after = simulateHand(seq, cur.start, cur.start + cur.size);
            if (!after || after.size !== cur.size || after.result !== need) {
                // 對調不成就換回來，記為衝突
                [seq[cur.start], seq[cur.start + 1]] = [seq[cur.start + 1], seq[cur.start]];
                if (physicalCards) [physicalCards[cur.start], physicalCards[cur.start + 1]] = [physicalCards[cur.start + 1], physicalCards[cur.start]];
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
            const prevCards = (physicalCards || seq).slice(prev.start, prev.start + prev.size);
            const need = neededAfter(prevCards);
            const actual = simulateHand(seq, rounds[k].start, rounds[k].start + rounds[k].size).result;
            if (actual !== need && !tieAllowed(need, actual)) {
                travConflicts++;
                const why = rules.tripleTie && isTriple(prevPoints) ? '上一局是三條，依三條優先應開和'
                    : isSignalHand(prevCards) ? '上一局有訊號牌，應開莊' : '上一局沒有訊號牌，應開閒';
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

    // A.2 關閉時不檢查對調後穿越，挑出的段偏莊；排好後把多出來那一方的局對調前兩張，
    // 整條長段仍須通過最終驗收才保留，直到莊閒相差不超過 1 局或沒有可對調的局。
    function balanceSides(chains, rng) {
        const hands = [];
        let diff = 0;
        for (const ch of chains) {
            for (const r of roundsFromStart(ch) || []) {
                if (r.result === '和') continue;
                hands.push({ ch, start: r.start, result: r.result });
                diff += r.result === '莊' ? 1 : -1;
            }
        }
        shuffleInPlace(hands, rng);
        let flips = 0;
        for (const { ch, start, result } of hands) {
            if (Math.abs(diff) <= 1) break;
            if ((diff > 0) !== (result === '莊')) continue;
            [ch[start], ch[start + 1]] = [ch[start + 1], ch[start]];
            if (qualifiesFinal(ch)) {
                flips++;
                diff += result === '莊' ? -2 : 2;
            } else {
                [ch[start], ch[start + 1]] = [ch[start + 1], ch[start]];
            }
        }
        return { flips, diff };
    }

    async function* buildCandidates(options = {}) {
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
            secondStart: options.secondStart === true,
            zeroPolicy: options.zeroPolicy || 'quota',
            chainMerge: options.chainMerge !== false,
            quotaFactor: options.quotaFactor ?? 1,
            sizeLimits: normalizeSizeLimits(options.sizeLimits),
            sizeTally: { 4: 0, 5: 0, 6: 0 },
            sizeUsedCards: 0,
            tieMax: Number.isInteger(options.tieMax) && options.tieMax >= 0 ? options.tieMax : null,
            tieTally: 0,
            sideTarget: Number.isInteger(options.sideLimit) && options.sideLimit >= 0 ? options.sideLimit : null,
        };
        opts.computeQuota = opts.secondStart && opts.zeroPolicy === 'quota';
        rules.tripleTie = opts.tripleTie;
        rules.signalRule = opts.signalRule;
        rules.signalConfig = normalizeSignal(options.signalConfig);
        rules.strong = opts.strong;
        rules.secondStart = opts.secondStart;
        opts.specialLimits = options.specialLimits ? { bankerSix: null, seven: null, rare: null, ...options.specialLimits } : null;
        if (opts.specialLimits) for (const value of Object.values(opts.specialLimits)) {
            if (value !== null && (!Number.isInteger(value) || value < 0 || value > 104)) throw new Error('莊6與逆轉上限須為0～104的整數或null');
        }
        if (opts.specialLimits?.rare != null && !global.TwoThirteenReversals) throw new Error('缺少1／13＋2／13逆轉判定模組');
        opts.specialTally = { bankerSix: 0, seven: 0, rare: 0 };
        rules.skipBanker6 = options.skipBanker6 === true || opts.specialLimits?.bankerSix != null;
        rules.skipPlayer7 = options.skipPlayer7 === true;
        rules.mixedColor = options.mixedColor === true;
        opts.scanLengths = [];
        for (let L = opts.maxLen; L >= opts.minLen; L--) opts.scanLengths.push(L);
        const ctx = {
            progress: options.onProgress || (() => {}),
            cancelled: options.isCancelled || (() => false),
        };
        opts.collectTemplates=options.templateLibrary!==false&&options.fillSensitiveTail===true&&!options.a2Tail&&global.TraverseRed0Balance?.enabled(rules.signalConfig);
        const t0 = Date.now();

        let rest = [];
        for (let p = 1; p <= 9; p++) for (let k = 0; k < 32; k++) rest.push(p);
        for (let k = 0; k < 128; k++) rest.push(0);

        // 穿越A2（全花色A、2訊號）有填莊閒差距時，挑段就控制推估的最終莊閒差距；紅0另有目標規劃
        opts.sideCtl = options.sideControl !== false && opts.signalRule && Number.isInteger(opts.sideTarget)
            && JSON.stringify(normalizeSignal(rules.signalConfig)) === JSON.stringify(defaultSignal());
        opts.sideE = 0;
        opts.templateComputeHits = 0;
        opts.templateBorrowHits = 0;
        opts.borrowTries = Number.isInteger(options.borrowTries) ? options.borrowTries : 40;
        // 範本只存點數排列，取用前依目前規則重驗，穿越紅0與穿越A2都適用
        opts.templateIndex = options.templateCompute === false || !global.TraverseTemplates?.compositionIndex ? null
            : await global.TraverseTemplates.compositionIndex({ cancelled: ctx.cancelled });
        const p1 = await phaseShuffle(rest, opts, ctx);
        const p2 = await phaseCompute(p1.rest, opts, ctx);
        const segs = p1.segs.concat(p2.segs);
        let restCards = p2.rest;
        let fallbackSegs = [];
        // 第二張敏感排不下的牌改用原條件續撿、續補；這些短段標記為不檢查第二張
        if (opts.secondStart && restCards.length >= opts.minLen) {
            segs.forEach(s => { s.secondStart = true; });
            const fbCtx = { ...ctx, progress: m => ctx.progress(`原條件續排｜${m}`) };
            rules.secondStart = false;
            try {
                const p3 = await phaseShuffle(restCards.slice(), opts, fbCtx);
                const p4 = await phaseCompute(p3.rest, opts, fbCtx);
                fallbackSegs = p3.segs.concat(p4.segs);
                restCards = p4.rest;
            } finally {
                rules.secondStart = true;
            }
            fallbackSegs.forEach(s => { s.secondStart = false; });
            segs.push(...fallbackSegs);
        }
        restCards = await borrowWithTemplates(segs, restCards, opts, ctx);
        const templateLog=message=>options.onTemplateLog?.('穿越範本：'+message);
        // 敏感補排關閉時，剩牌只能整段換成範本（穿越紅0、8～12 張且在段長範圍內），否則注定重跑
        const tailOff = options.fillSensitiveTail === true && options.sensitiveTail === false;
        if (tailOff && restCards.length > 0 && !ctx.cancelled()) {
            const n = restCards.length, templateable = !options.a2Tail && global.TraverseRed0Balance?.enabled(rules.signalConfig) && options.templateLibrary !== false
                && n >= 8 && n <= 12 && n >= opts.minLen && n <= opts.maxLen;
            if (!templateable) {
                templateLog(`未查找｜敏感補排關閉，剩牌 ${n} 張無法整段換成範本，先整副重跑`);
                return { rejected: true, rejectionKind: 'sensitive-tail', leftoverCount: n, tailFill: { ok: false, status: 'disabled', reason: `敏感補排關閉，剩牌 ${n} 張未能排進穿越段` }, stats: { ms: Date.now() - t0, templateComputeHits: opts.templateComputeHits, templateBorrowHits: opts.templateBorrowHits } };
            }
        }
        // 剩下的張數已超過上限：注定要重跑，跳過接段／A、2／卡色，省時間
        if (options.rejectAbove != null && restCards.length > options.rejectAbove && !ctx.cancelled()) {
            if(options.fillSensitiveTail===true&&!options.a2Tail)templateLog(`未查找｜剩牌 ${restCards.length} 張超過上限 ${options.rejectAbove}，先整副重跑`);
            return { rejected: true, leftoverCount: restCards.length, stats: { ms: Date.now() - t0, templateComputeHits: opts.templateComputeHits, templateBorrowHits: opts.templateBorrowHits } };
        }
        let chains = await phaseChain(segs, opts, ctx);
        let leftover = shuffleInPlace(restCards.slice(), opts.rng);

        let templateLibrary=null;
        const library=options.templateLibrary===false?null:global.TraverseTemplates;
        const useLibrary=options.fillSensitiveTail===true&&!options.a2Tail&&global.TraverseRed0Balance?.enabled(rules.signalConfig)&&library;
        const cloneChains=xs=>xs.map(ch=>{const out=ch.slice();for(const k of Object.keys(ch))if(!/^\d+$/.test(k))out[k]=Array.isArray(ch[k])?ch[k].slice():ch[k];return out;});
        const baseChains=cloneChains(chains),baseLeftover=leftover.slice(),baseRules={...rules,signalConfig:normalizeSignal(rules.signalConfig)};
        const quotaSnapshot={sizeTally:{...opts.sizeTally},sizeUsedCards:opts.sizeUsedCards,tieTally:opts.tieTally,specialTally:{...opts.specialTally}};
        const restore=()=>{chains=cloneChains(baseChains);leftover=baseLeftover.slice();opts.sizeTally={...quotaSnapshot.sizeTally};opts.sizeUsedCards=quotaSnapshot.sizeUsedCards;opts.tieTally=quotaSnapshot.tieTally;opts.specialTally={...quotaSnapshot.specialTally};Object.assign(rules,baseRules,{signalConfig:normalizeSignal(baseRules.signalConfig)});};
        let candidates=[],lookupInfo=null,pointPassed=0,attempted=0;
        if(options.fillSensitiveTail===true&&!options.a2Tail&&!useLibrary&&!ctx.cancelled())templateLog(`未查找｜剩牌 ${leftover.length} 張｜${!library?'庫模組未載入':'目前訊號設定不適用標準紅0範本'}`);
        if(useLibrary){
            lookupInfo={candidateHits:0,pointPassed:0,physicalPassed:0,finalAdopted:0,start:null,length:0,...library.stats()};
            if(leftover.length>=8&&leftover.length<=12&&leftover.length>=opts.minLen&&leftover.length<=opts.maxLen&&!ctx.cancelled()){
                try{candidates=library.lookupAsync?await library.lookupAsync(leftover,{cancelled:ctx.cancelled}):library.lookup(leftover);}catch(e){lookupInfo.lookupError=e.message;templateLog(`查找失敗｜${e.message}｜未採用範本，改走原剩牌敏感補排`);}lookupInfo.candidateHits=candidates.length;
                const loading=global.TraverseTemplateFile?.status().ready===false;
                templateLog(`查找｜剩牌 ${leftover.length} 張｜庫${loading?'檔案／快取仍載入中，使用目前記憶體':'已載入'} ${lookupInfo.templates} 個排列／${lookupInfo.keys} 種組合｜命中候選 ${candidates.length} 筆`);
            }else if(!ctx.cancelled())templateLog(`未查找｜剩牌 ${leftover.length} 張不在8～12張且符合目前段長 ${opts.minLen}～${opts.maxLen} 的範圍`);
        }
        const red0PrefixCache={};
        let candidateYield=performance.now()+8,tailSource=null;
        try{for(let candidateIndex=0;candidateIndex<=candidates.length;candidateIndex++){
            if(performance.now()>=candidateYield){await new Promise(resolve=>setTimeout(resolve,0));candidateYield=performance.now()+8;}
            if(ctx.cancelled())return {cancelled:true,stats:{ms:Date.now()-t0}};
            restore();
            templateLibrary=lookupInfo?{...lookupInfo,pointPassed,attempted,selectedIndex:0,physicalPassed:0,finalAdopted:0,start:null,length:0}:null;
            const candidate=candidates[candidateIndex];
            if(candidate){
                attempted++;templateLibrary.attempted=attempted;templateLibrary.selectedIndex=candidateIndex+1;
                // 範本命中即豁免候選檢查（使用者要求），只記下原本會擋的項目；後續整靴驗收照舊
                const waived=[!qualifies(candidate,true)&&'短段穿越／敏感／三條／第二張條件',!sizeLimitOk(candidate,opts)&&'局數／和局／特殊局配額'].filter(Boolean);
                if(waived.length)templateLog(`候選 ${candidateIndex+1} 命中豁免｜原本未過：${waived.join('、')}`);
                templateLibrary.pointPassed=++pointPassed;
                let attached=false,offset=0;
                for(let i=0;i<chains.length;i++){
                    const ch=chains[i],joined=ch.concat(candidate);joined.parts=(ch.parts||[ch.length]).concat(candidate.length);joined.secondParts=(ch.secondParts||[ch.secondStart!==false]).concat(opts.secondStart);
                    if(qualifies(joined)){chains[i]=joined;templateLibrary.start=offset+ch.length;attached=true;break;}offset+=ch.length;
                }
                if(!attached){const independent=candidate.slice();independent.parts=[candidate.length];independent.secondParts=[opts.secondStart];templateLibrary.start=chains.reduce((n,c)=>n+c.length,0);chains.push(independent);}
                templateLibrary.length=candidate.length;leftover=[];sizeLimitAdd(candidate,opts);
                templateLog(`候選 ${candidateIndex+1}/${candidates.length} 暫採用為 ${candidate.length} 張穿越短段｜等待實體牌、訊號及整靴驗收，尚非最終成功`);
            }else if(lookupInfo){
                templateLibrary.exhausted=true;
                if(candidates.length)templateLog(`同池 ${candidates.length} 筆範本已逐筆檢查／續試完畢｜恢復原段、剩牌與配額，改走原剩牌敏感補排；不把本次規劃預算失敗當永久無解`);
                else templateLog(lookupInfo.lookupError?'查找失敗，未當作未命中｜未採用範本':'未命中｜未採用範本，改走原剩牌敏感補排');
            }
            const result=await finishCandidate();
            if(ctx.cancelled())return {cancelled:true,stats:{ms:Date.now()-t0}};
            if(!candidate){
                if(!tailSource)return result;
                let current=result;
                for(;;){
                    if(ctx.cancelled())return {cancelled:true,stats:{ms:Date.now()-t0}};
                    yield current;
                    await new Promise(resolve=>setTimeout(resolve,0));
                    const step=await tailSource.next();
                    if(step.done){const terminal=step.value||{status:'exhausted',reason:'本剩牌敏感點數分局已遍歷'};return {rejected:true,rejectionKind:'sensitive-tail-final',leftoverCount:baseLeftover.length,tailFill:{...terminal,rounds:undefined,ok:false,fullOk:false},templateLibrary:lookupInfo?{...lookupInfo,length:0,exhausted:true,pointPassed,attempted}:null,stats:{ms:Date.now()-t0}};}
                    restore();templateLibrary=lookupInfo?{...lookupInfo,length:0,exhausted:true,pointPassed,attempted,finalAdopted:0}:null;
                    current=await finishCandidate(step.value);
                }
            }
            if(!result.templateLibrary)result.templateLibrary=templateLibrary;
            yield result;
            // The caller resumes only after all of its final checks reject this candidate.
            await new Promise(resolve=>setTimeout(resolve,0));
        }}finally{if(tailSource)await tailSource.return();}
        async function finishCandidate(resumedTail=null){
        let tailFill=null;
        const a2Tail=options.a2Tail===true&&leftover.length>0;
        const fillTail=options.fillSensitiveTail===true&&(!options.a2Tail||a2Tail);
        if(fillTail&&options.sensitiveTail===false&&leftover.length)return {rejected:true,rejectionKind:'sensitive-tail',leftoverCount:leftover.length,tailFill:{ok:false,status:'disabled',reason:`敏感補排關閉，範本未能接走剩牌 ${leftover.length} 張`},templateLibrary,stats:{ms:Date.now()-t0}};
        if(fillTail){
            if(!global.TraverseTailFill||(!global.TraverseRed0Balance?.enabled(rules.signalConfig)&&!a2Tail))return {rejected:true,rejectionKind:'sensitive-tail',leftoverCount:leftover.length,tailFill:{ok:false,status:'unsupported',reason:'敏感補排需要支援的訊號設定與補排模組'},stats:{ms:Date.now()-t0}};
            const prefix=chains.flat(),before=JSON.stringify(chains);
            const originalRounds=roundsFromStart(prefix)||[];
            const last=originalRounds.at(-1),previousTrip=!!last&&opts.tripleTie&&isTriple(prefix.slice(last.start,last.start+last.size));
            const fillOptions={rng:opts.rng,tripleTie:opts.tripleTie,previousTrip,firstTie:originalRounds[0]?.result==='和',
                baseCounts:roundSizeCounts(prefix),baseSpecial:specialRoundCounts(prefix),sizeLimits:opts.sizeLimits,tieMax:opts.tieMax,specialLimits:opts.specialLimits};
            let selected=null;
            if(a2Tail){
                if(opts.signalRule&&JSON.stringify(normalizeSignal(rules.signalConfig))!==JSON.stringify(defaultSignal()))return {rejected:true,rejectionKind:'sensitive-tail',leftoverCount:leftover.length,tailFill:{ok:false,status:'unsupported',reason:'A2敏感補排目前只支援全花色A／2訊號'},stats:{ms:Date.now()-t0}};
                if(!global.TraverseA2Tail)throw new Error('缺少A2剩牌敏感分局模組，請重新載入完整頁面');
                const planPrefix=()=>!prefix.length?[{chains:[],points:[],firstResult:null,previousTrip:false,previousSignal:false}]:opts.signalRule?planA2TailBoundaries(chains):[{chains,points:prefix,firstResult:originalRounds[0]?.result,previousTrip,previousSignal:false}];
                tailFill=await global.TraverseA2Tail.fill(leftover,{...opts,signalConfig:rules.signalConfig,sideLimit:opts.sideTarget,baseCounts:roundSizeCounts(prefix),planPrefix,
                    accept:(plan,tailRounds)=>global.TraverseTailFill.validate(plan.points.concat(tailRounds.flat()),{tripleTie:opts.tripleTie,signalRule:opts.signalRule,signalConfig:rules.signalConfig}).ok&&plan.chains.every(ch=>qualifiesFinal(ch))},ctx);
                if(tailFill.prefixChains){selected={chains:tailFill.prefixChains,flips:tailFill.a2BoundaryFlips};delete tailFill.prefixChains;}
            }else if(resumedTail)tailFill={...resumedTail,rounds:resumedTail.rounds.map(h=>h.slice())};
            else if(leftover.length&&global.TraverseTailFill.search){tailSource=global.TraverseTailFill.search(leftover,fillOptions,ctx);const first=await tailSource.next();tailFill=first.value;if(first.done)tailSource=null;}
            else tailFill=await global.TraverseTailFill.fill(leftover,fillOptions,ctx);
            if(tailFill.finiteTail)tailFill.solutionIndex=tailFill.solutions;
            if(JSON.stringify(chains)!==before)throw new Error('敏感補排不應修改原穿越段');
            if(selected&&tailFill.ok){chains=selected.chains;tailFill.a2BoundaryFlips=selected.flips;}
            if(a2Tail)tailFill.mode='a2';
            if(!tailFill.ok)return {rejected:true,rejectionKind:'sensitive-tail',leftoverCount:leftover.length,tailFill,templateLibrary,stats:{ms:Date.now()-t0}};
            leftover=tailFill.rounds.flat();tailFill.roundCount=tailFill.rounds.length;delete tailFill.rounds;
        }
        const customSignal = opts.signalRule && JSON.stringify(rules.signalConfig) !== JSON.stringify(defaultSignal());
        let physicalCards = customSignal ? assignCards(chains.flat().concat(leftover), opts.rng).cards : null;
        let templateMapped=true;
        if(templateLibrary?.length&&physicalCards){
            const desired=chains.flat().slice(templateLibrary.start,templateLibrary.start+templateLibrary.length);
            const mapped=library.mapPhysical(desired,physicalCards.slice(templateLibrary.start,templateLibrary.start+templateLibrary.length));
            templateMapped=!!mapped;if(mapped)physicalCards.splice(templateLibrary.start,templateLibrary.length,...mapped);
        }
        if(options.red0Balance===true&&opts.signalRule&&(opts.sideTarget!==null||fillTail)&&JSON.stringify(rules.signalConfig)===JSON.stringify({suits:['♥','♦'],ranks:['10','J','Q','K']})&&!global.TraverseRed0Balance)throw new Error('缺少穿越紅0目標規劃模組');
        const targetEnabled=(options.red0Balance===true||fillTail)&&opts.signalRule&&(opts.sideTarget!==null||fillTail)&&global.TraverseRed0Balance?.enabled(rules.signalConfig);
        let signalBalance,signal;
        if(targetEnabled){
            signalBalance=await global.TraverseRed0Balance.plan(chains,leftover,physicalCards,{...opts,strictTail:fillTail,prefixPlanCache:red0PrefixCache,
                balanceBudgetMs:options.balanceBudgetMs,balanceMaxStates:options.balanceMaxStates,balanceMaxNodes:options.balanceMaxNodes,balanceMaxValidations:options.balanceMaxValidations},ctx);
            if(signalBalance.ok){
                physicalCards=signalBalance.cards;
                let offset=0;for(const ch of chains){for(let j=0;j<ch.length;j++)ch[j]=signalBalance.points[offset+j];offset+=ch.length;}
                for(let j=0;j<leftover.length;j++)leftover[j]=signalBalance.points[offset+j];
                // Keep the existing actual-direction signal and long-chain final check.
                signal=applySignalRule(chains,leftover,physicalCards);
                let count=0,banker=0;const actual=chains.flat().concat(leftover);
                for(let at=0;at<actual.length;){const hand=simulateHand(actual,at,actual.length);if(!hand)break;count++;banker+=hand.result==='莊'?1:0;at+=hand.size;}
                if(!signal.ok||count!==signalBalance.rounds||banker!==signalBalance.banker||opts.sideTarget!==null&&Math.abs(2*banker-count)>opts.sideTarget){
                    signalBalance.ok=false;signalBalance.status='invalid';signalBalance.reason='既有訊號／穿越／實際莊局目標最終驗收未通過';signal.ok=false;
                }
                delete signalBalance.cards;delete signalBalance.points;
            }else signal={ok:false,flips:0,conflicts:0,issues:[{kind:'red0-balance',message:signalBalance.reason}]};
        }else{
            signalBalance=physicalCards?arrangeSignalCards(chains.flat().concat(leftover),physicalCards,opts):null;
            signal=opts.signalRule?applySignalRule(chains,leftover,physicalCards):null;
        }
        // 訊號牌對調後長段不合格：段不變，只換接段順序再試，省掉整副重排
        for (let t = 0; SIGNAL_RETRY_ENABLED && signal && !signal.ok && t < 30 && !ctx.cancelled(); t++) {
            chains = await phaseChain(segs, { ...opts, chainAttempts: 1 }, ctx);
            leftover = shuffleInPlace(restCards.slice(), opts.rng);
            physicalCards = customSignal ? assignCards(chains.flat().concat(leftover), opts.rng).cards : null;
            signalBalance = physicalCards ? arrangeSignalCards(chains.flat().concat(leftover), physicalCards, opts) : null;
            signal = applySignalRule(chains, leftover, physicalCards);
        }
        const balance = opts.signalRule ? null : balanceSides(chains, opts.rng);
        const points = chains.flat().concat(leftover);
        let { cards, colorOk } = physicalCards ? { cards: physicalCards, colorOk: false } : assignCards(points, opts.rng);
        if(templateLibrary?.length&&!physicalCards){
            const desired=points.slice(templateLibrary.start,templateLibrary.start+templateLibrary.length);
            const mapped=library.mapPhysical(desired,cards.slice(templateLibrary.start,templateLibrary.start+templateLibrary.length));
            templateMapped=!!mapped;if(mapped)cards.splice(templateLibrary.start,templateLibrary.length,...mapped);
        }
        if (physicalCards && opts.signalRule) {
            const colored = reassignColors(physicalCards, opts.rng);
            cards = colored.ok ? colored.cards : physicalCards;
            colorOk = colored.ok;
        }

        if(templateLibrary?.length){
            const part=cards.slice(templateLibrary.start,templateLibrary.start+templateLibrary.length),pts=part.map(c=>c.point);
            const mapped=library.mapPhysical(pts,part);
            templateLibrary.physicalPassed=templateMapped&&!!mapped&&qualifiesFinal(pts)?1:0;
            if(!templateLibrary.physicalPassed){templateLog('暫採用候選拒絕｜實體牌／訊號調整後短段驗收失敗，未最終採用');if(tailFill){tailFill.ok=false;tailFill.reason='穿越範本實體牌／訊號調整後短段重驗失敗';}}
        }
        if(tailFill){
            const full=global.TraverseTailFill.validate(cards,{tripleTie:opts.tripleTie,signalRule:opts.signalRule,signalConfig:rules.signalConfig});
            tailFill.fullOk=full.ok&&(!signal||signal.ok)&&chains.every(ch=>qualifiesFinal(ch))&&(!templateLibrary?.length||!!templateLibrary.physicalPassed);tailFill.unprocessed=full.ok?0:(full.unprocessed??tailFill.initialCount);
            if(!tailFill.fullOk){
                tailFill.fullValidationReason=full.reason||null;
                const plannerFailed=signalBalance&&signalBalance.ok===false;
                tailFill.failureStage=plannerFailed?'red0-planning':!full.ok?'full-tail-validation':'traverse-final-validation';
                tailFill.plannerStatus=plannerFailed?signalBalance.status:null;
                tailFill.reason=plannerFailed?('紅0規劃階段'+(signalBalance.status==='search-limit'?'（本次預算未找到方案，非永久無解）':'')+'：'+signalBalance.reason):(full.reason||'穿越段或全靴訊號驗收失敗');
            }
            if(templateLibrary?.length)templateLog(tailFill.fullOk?'暫採用候選通過生成器驗收｜仍待介面最後驗收，尚未記為最終採用':`暫採用後整靴驗收失敗｜未最終採用｜${tailFill.reason}`);
            const start=chains.reduce((n,ch)=>n+ch.length,0);cards=cards.map((c,i)=>i>=start?{...c,sensitiveFill:true}:c);
        }

        // 每條長段的驗證結果
        let offset = 0;
        const chainReports = chains.map(ch => {
            const rounds = roundsFromStart(ch);
            const report = {
                start: offset + 1,
                length: ch.length,
                parts: (ch.parts || [ch.length]).slice(),
                secondParts: (ch.secondParts || [ch.secondStart !== false]).slice(),
                rounds: rounds ? rounds.length : 0,
                traverse: isTraverse(ch),
                allSensitive: !!rounds && rounds.every(r => handSensitive(ch.slice(r.start, r.start + r.size))),
                qualified: qualifiesFinal(ch),
            };
            offset += ch.length;
            return report;
        });

        return {
            ...(tailFill&&!tailFill.fullOk?{rejected:true,rejectionKind:'sensitive-tail-final'}:{}),
            cards,
            signalConfig: normalizeSignal(rules.signalConfig),
            chains: chainReports,
            leftoverCount: leftover.length,
            tailFill,
            templateLibrary,
            colorOk,
            signal,
            balance,
            signalBalance,
            stats: {
                templateComputeHits: opts.templateComputeHits,
                templateBorrowHits: opts.templateBorrowHits,
                shuffles: p1.shuffles,
                phase1Segments: p1.segs.length,
                phase1Rest: p1.rest.length,
                phase2Segments: p2.segs.length,
                fallbackSegments: fallbackSegs.length,
                fallbackCards: fallbackSegs.reduce((n, s) => n + s.length, 0),
                sizeTally: opts.sizeLimits ? { ...opts.sizeTally } : null,
                tiePicked: opts.tieMax !== null ? opts.tieTally : null,
                specialPicked: opts.specialLimits ? { ...opts.specialTally } : null,
                totalCards: points.length,
                ms: Date.now() - t0,
            },
        };
        }
    }

    // Continuations stay outside result serialization and published shoe state.
    const templateContinuations=new WeakMap();
    async function advanceTemplate(iterator){const step=await iterator.next();if(!step.done&&step.value&&typeof step.value==='object')templateContinuations.set(step.value,iterator);return step.value;}
    async function build(options={}){return advanceTemplate(buildCandidates(options));}
    function hasTemplateContinuation(result){return !!result&&templateContinuations.has(result);}
    async function nextTemplate(result){const iterator=templateContinuations.get(result);if(!iterator)throw Error('此候選已無同池續試工作');templateContinuations.delete(result);return advanceTemplate(iterator);}
    async function releaseTemplateContinuation(result){const iterator=result&&templateContinuations.get(result);if(iterator){templateContinuations.delete(result);await iterator.return();}}

    global.TraverseBuilder = { segmentStats, quotaPriority, preferQuota, sizeLimitOk, specialRoundCounts, roundSizeCounts, normalizeSizeLimits, allSensitiveHands, COLOR_PATTERNS, SIGNAL_RETRY_ENABLED, reassignColors, build, hasTemplateContinuation, nextTemplate, releaseTemplateContinuation, diagnoseChain, qualifies, qualifiesFinal, secondStartOk, isTraverse, roundsFromStart, handSensitive, simulateHand, isTriple, normalizeSignal, isSignalCard, isSignalHand, neededAfter, rules };

})(typeof window !== 'undefined' ? window : globalThis);
