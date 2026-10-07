// ============================================================
// 穿越段挑選器 (Traverse Segment Picker)
// ============================================================
// 用途：在隨機洗牌後的 416 張牌中，挑出 N 段連續的「穿越段」
//
// 穿越段定義：
//   - 連續 L 張牌（L 預設 14，找不到則嘗試 13、12、11）
//   - 從段內任一張開始按百家樂規則發牌，最後一張剛好用完
//   - 豁免：剩餘 1, 2, 3, 7 張時不檢查（與 traverse.js 一致）
//
// 額外條件（可選）：
//   - 最後一局必和局：不論是 4/5/6 張收尾，閒總和 == 莊總和
//   - 排除 A、2：段內不含 rank='A' 或 rank='2' 的牌
//
// 對外 API：
//   pickTraverseSegments(deck, options) → [{ start, length }, ...] 或 null
//   buildTraverseRounds(deck, segment) → [round1, round2, ...]
// ============================================================

(function (global) {
    'use strict';

    // 豁免：剩餘這些張數時不檢查（與 AT666 traverse.js 一致）
    const ALLOWED_RESIDUE = new Set([1, 2, 3, 7]);

    // 取得牌的點數
    function pointOf(card) {
        if (!card) return 0;
        if (typeof card.point === 'function') return card.point();
        const rank = card.rank || card.value;
        if (['10', 'J', 'Q', 'K'].includes(rank)) return 0;
        if (rank === 'A' || rank === '1') return 1;
        return parseInt(rank) || 0;
    }

    // 段內是否含被排除的點數（整段）
    function segmentHasExcluded(deck, start, length, excludePoints) {
        if (!excludePoints || excludePoints.size === 0) return false;
        for (let i = start; i < start + length; i++) {
            if (excludePoints.has(pointOf(deck[i]))) return true;
        }
        return false;
    }

    // 段內第一局是否含被排除的點數
    function segmentFirstHandHasExcluded(deck, start, length, excludePoints) {
        if (!excludePoints || excludePoints.size === 0) return false;
        const firstHandSize = handSizeAt(deck, start, start + length);
        if (!firstHandSize) return false;
        for (let i = start; i < start + firstHandSize; i++) {
            if (excludePoints.has(pointOf(deck[i]))) return true;
        }
        return false;
    }

    /**
     * 從 start 開始的一局用幾張牌
     * @param {Array} deck
     * @param {number} start - 0-indexed
     * @param {number} limit - 可用的最大 idx + 1（不能超過）
     * @returns {number|null}
     */
    function handSizeAt(deck, start, limit) {
        if (start + 4 > limit) return null;
        const p1 = pointOf(deck[start]);
        const b1 = pointOf(deck[start + 1]);
        const p2 = pointOf(deck[start + 2]);
        const b2 = pointOf(deck[start + 3]);
        const pp = (p1 + p2) % 10;
        const bb = (b1 + b2) % 10;

        if (pp >= 8 || bb >= 8) return 4;

        if (pp <= 5) {
            if (start + 5 > limit) return null;
            const p3 = pointOf(deck[start + 4]);
            let bDraws;
            if (bb <= 2) bDraws = true;
            else if (bb === 3) bDraws = (p3 !== 8);
            else if (bb === 4) bDraws = (p3 >= 2 && p3 <= 7);
            else if (bb === 5) bDraws = (p3 >= 4 && p3 <= 7);
            else if (bb === 6) bDraws = (p3 === 6 || p3 === 7);
            else bDraws = false;

            if (bDraws) {
                if (start + 6 > limit) return null;
                return 6;
            }
            return 5;
        }
        if (bb <= 5) {
            if (start + 5 > limit) return null;
            return 5;
        }
        return 4;
    }

    /**
     * 從 start 連續發到 limit，是否剛好用完
     */
    function chainOk(deck, start, limit) {
        let cur = start;
        while (cur < limit) {
            const size = handSizeAt(deck, cur, limit);
            if (size === null) return false;
            cur += size;
        }
        return cur === limit;
    }

    /**
     * 段 [start, start+length) 是否符合穿越條件
     */
    function isTraverseSegment(deck, start, length) {
        const limit = start + length;
        for (let p = start; p < limit; p++) {
            const remaining = limit - p;
            if (ALLOWED_RESIDUE.has(remaining)) continue;
            if (!chainOk(deck, p, limit)) return false;
        }
        return true;
    }

    /**
     * 指定的一局（start 起，size 張）是否和局
     */
    function handIsTie(deck, start, size) {
        const p1 = pointOf(deck[start]);
        const b1 = pointOf(deck[start + 1]);
        const p2 = pointOf(deck[start + 2]);
        const b2 = pointOf(deck[start + 3]);
        const pp = (p1 + p2) % 10;
        const bb = (b1 + b2) % 10;
        if (size === 4) return pp === bb;
        if (size === 5) {
            const p3 = pointOf(deck[start + 4]);
            if (pp <= 5) return ((pp + p3) % 10) === bb;
            return pp === ((bb + p3) % 10);
        }
        if (size === 6) {
            const p3 = pointOf(deck[start + 4]);
            const b3 = pointOf(deck[start + 5]);
            return ((pp + p3) % 10) === ((bb + b3) % 10);
        }
        return false;
    }

    /**
     * 段 [start, start+length) 的「最後一局」三種可能（4/5/6張）是否都和局
     * 對應到「不管從哪一張起手，最後一局都和局」
     */
    function lastHandAllTie(deck, start, length) {
        const end = start + length - 1;
        const limit = start + length;
        // 三種可能的最後一局起點
        const candidates = [
            { handStart: end - 3, expectedSize: 4 },
            { handStart: end - 4, expectedSize: 5 },
            { handStart: end - 5, expectedSize: 6 },
        ];
        for (const { handStart, expectedSize } of candidates) {
            if (handStart < start) continue;
            const size = handSizeAt(deck, handStart, limit);
            // 只在實際大小符合時才需要檢查（這樣才會被某個鏈當成最後一局）
            if (size !== expectedSize) continue;
            if (!handIsTie(deck, handStart, expectedSize)) return false;
        }
        return true;
    }

    // ===== 模板生成（純點數，0-9）=====
    // 從 0-9 點數的純數字陣列開始，跑同樣的穿越判定邏輯

    function pointsTraverse(arr) {
        const limit = arr.length;
        const _hand = (start) => {
            if (start + 4 > limit) return null;
            const pp = (arr[start] + arr[start + 2]) % 10;
            const bb = (arr[start + 1] + arr[start + 3]) % 10;
            if (pp >= 8 || bb >= 8) return 4;
            if (pp <= 5) {
                if (start + 5 > limit) return null;
                const p3 = arr[start + 4];
                let bd;
                if (bb <= 2) bd = true;
                else if (bb === 3) bd = (p3 !== 8);
                else if (bb === 4) bd = (p3 >= 2 && p3 <= 7);
                else if (bb === 5) bd = (p3 >= 4 && p3 <= 7);
                else if (bb === 6) bd = (p3 === 6 || p3 === 7);
                else bd = false;
                if (bd) {
                    if (start + 6 > limit) return null;
                    return 6;
                }
                return 5;
            }
            if (bb <= 5) {
                if (start + 5 > limit) return null;
                return 5;
            }
            return 4;
        };
        for (let p = 0; p < limit; p++) {
            const remaining = limit - p;
            if (ALLOWED_RESIDUE.has(remaining)) continue;
            let cur = p;
            while (cur < limit) {
                const sz = _hand(cur);
                if (sz === null) return false;
                cur += sz;
            }
            if (cur !== limit) return false;
        }
        return true;
    }

    function pointsTieLast(arr) {
        const end = arr.length - 1;
        const limit = arr.length;
        const _hand = (start) => {
            if (start + 4 > limit) return null;
            const pp = (arr[start] + arr[start + 2]) % 10;
            const bb = (arr[start + 1] + arr[start + 3]) % 10;
            if (pp >= 8 || bb >= 8) return 4;
            if (pp <= 5) {
                if (start + 5 > limit) return null;
                const p3 = arr[start + 4];
                let bd;
                if (bb <= 2) bd = true;
                else if (bb === 3) bd = (p3 !== 8);
                else if (bb === 4) bd = (p3 >= 2 && p3 <= 7);
                else if (bb === 5) bd = (p3 >= 4 && p3 <= 7);
                else if (bb === 6) bd = (p3 === 6 || p3 === 7);
                else bd = false;
                if (bd) {
                    if (start + 6 > limit) return null;
                    return 6;
                }
                return 5;
            }
            if (bb <= 5) {
                if (start + 5 > limit) return null;
                return 5;
            }
            return 4;
        };
        const _tieAt = (start, sz) => {
            const pp = (arr[start] + arr[start + 2]) % 10;
            const bb = (arr[start + 1] + arr[start + 3]) % 10;
            if (sz === 4) return pp === bb;
            if (sz === 5) {
                if (pp <= 5) return ((pp + arr[start + 4]) % 10) === bb;
                return pp === ((bb + arr[start + 4]) % 10);
            }
            if (sz === 6) {
                return ((pp + arr[start + 4]) % 10) === ((bb + arr[start + 5]) % 10);
            }
            return false;
        };
        for (const cand of [{ s: end - 3, sz: 4 }, { s: end - 4, sz: 5 }, { s: end - 5, sz: 6 }]) {
            if (cand.s < 0) continue;
            const actualSz = _hand(cand.s);
            if (actualSz !== cand.sz) continue;
            if (!_tieAt(cand.s, cand.sz)) return false;
        }
        return true;
    }

    /**
     * 模擬一局，回傳 { result, size } 或 null（無法完成）
     */
    function simulatePointHand(arr, start) {
        const limit = arr.length;
        if (start + 4 > limit) return null;
        const p1 = arr[start], b1 = arr[start + 1], p2 = arr[start + 2], b2 = arr[start + 3];
        let pp = (p1 + p2) % 10;
        let bb = (b1 + b2) % 10;
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
        let result;
        if (pp > bb) result = '閒';
        else if (bb > pp) result = '莊';
        else result = '和';
        return { result, size };
    }

    /**
     * 點數模板的首局是否「真敏感」（對調前後結果在莊↔閒之間切換，不能有和）
     * 條件：
     *   1. 對調後可完成（不會無法對調）
     *   2. 對調後使用張數等於原本
     *   3. 原本與對調後皆為莊或閒（都不能是和）
     *   4. 兩邊結果不同（莊↔閒）
     */
    function firstHandSensitive(arr) {
        const orig = simulatePointHand(arr, 0);
        if (!orig) return false;
        if (orig.result === '和') return false;
        const swapped = arr.slice(0, orig.size);
        const tmp = swapped[0]; swapped[0] = swapped[1]; swapped[1] = tmp;
        const sw = simulatePointHand(swapped, 0);
        if (!sw) return false;
        if (sw.size !== orig.size) return false;
        if (sw.result === '和') return false;
        return orig.result !== sw.result;
    }

    /**
     * 隨機產生一個符合條件的點數模板
     */
    function generateTemplate(length, opts) {
        const { tieLast = true, excludePoints = null, firstSensitive = true, roundCount = null, maxTries = 200000 } = opts;
        const basePool = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
        for (let i = 0; i < maxTries; i++) {
            const arr = new Array(length);
            for (let j = 0; j < length; j++) arr[j] = basePool[Math.floor(Math.random() * basePool.length)];
            // 只排除第一局含有的點數
            if (excludePoints && excludePoints.size > 0) {
                const fh = simulatePointHand(arr, 0);
                if (fh) {
                    let hit = false;
                    for (let k = 0; k < fh.size; k++) { if (excludePoints.has(arr[k])) { hit = true; break; } }
                    if (hit) continue;
                }
            }
            if (tieLast && length === 14) {
                // 剪枝：pos9=pos10=0 大幅提升和局命中率
                arr[8] = 0;
                arr[9] = 0;
            } else if (tieLast && length >= 11) {
                // 對其他長度也試 pos[L-6]=pos[L-5]=0 的剪枝
                arr[length - 6] = 0;
                arr[length - 5] = 0;
            }
            if (!pointsTraverse(arr)) continue;
            if (tieLast && !pointsTieLast(arr)) continue;
            if (firstSensitive && !firstHandSensitive(arr)) continue;
            if (roundCount !== null && countRoundsInTemplate(arr) !== roundCount) continue;
            return arr;
        }
        return null;
    }

    /**
     * 從 deck 中挑出符合 template 點數順序的牌（維持原本 deck 順序的索引集合，但段內順序按 template）
     */
    function matchTemplateToDeck(deck, template, usedPos) {
        // 為每個點數建立可用卡牌的 pos 列表
        const byPoint = new Map();
        for (const c of deck) {
            if (usedPos.has(c.pos)) continue;
            const p = pointOf(c);
            if (!byPoint.has(p)) byPoint.set(p, []);
            byPoint.get(p).push(c);
        }
        // 按模板順序取卡
        const result = [];
        const taken = new Set();
        for (const tp of template) {
            const pool = byPoint.get(tp);
            if (!pool) return null;
            let picked = null;
            for (const c of pool) {
                if (!taken.has(c.pos)) { picked = c; break; }
            }
            if (!picked) return null;
            result.push(picked);
            taken.add(picked.pos);
        }
        return result;
    }

    /**
     * 主要入口：在 deck 中挑出 count 段穿越段
     * 模式：
     *   1. 自動模式（預設）：先試「在原序找連續子段」；找不到 → 用模板建構
     *   2. 強制建構模式：直接用模板建構
     *
     * @returns {Array<{cards: Card[], length: number}> | null}
     */
    function countRoundsInTemplate(arr) {
        const limit = arr.length;
        let cur = 0, count = 0;
        while (cur < limit) {
            const sz = handSize(arr, cur, limit);
            if (sz === null) return -1;
            cur += sz;
            count++;
        }
        return count;
    }

    function pickTraverseSegments(deck, options = {}) {
        const count = options.count || 3;
        const lengths = options.lengths || [14, 13, 12, 11];
        const tieLast = options.tieLast !== false;
        const excludePoints = options.excludePoints instanceof Set ? options.excludePoints : new Set();
        const firstSensitive = options.firstSensitive !== false; // 預設要求首局敏感
        const roundCount = options.roundCount || null; // null = 不限制局數
        const logFn = options.log || (() => {});
        const buildMode = options.buildMode || 'auto'; // 'auto' | 'inline' | 'construct'

        const usedPos = new Set();
        const found = []; // [{cards, length}]

        // ===== 嘗試 1：在原序找連續子段（inline） =====
        if (buildMode !== 'construct') {
            for (const length of lengths) {
                if (found.length >= count) break;
                const candidates = [];
                for (let start = 0; start + length <= deck.length; start++) {
                    if (segmentFirstHandHasExcluded(deck, start, length, excludePoints)) continue;
                    if (!isTraverseSegment(deck, start, length)) continue;
                    if (tieLast && !lastHandAllTie(deck, start, length)) continue;
                    if (firstSensitive) {
                        // 用點數陣列檢查首局敏感
                        const points = [];
                        for (let i = 0; i < length; i++) points.push(pointOf(deck[start + i]));
                        if (!firstHandSensitive(points)) continue;
                    }
                    if (roundCount !== null) {
                        const points = [];
                        for (let i = 0; i < length; i++) points.push(pointOf(deck[start + i]));
                        if (countRoundsInTemplate(points) !== roundCount) continue;
                    }
                    candidates.push(start);
                }
                if (candidates.length === 0) continue;
                logFn(`🔍 inline 模式 長度 ${length}：候選 ${candidates.length} 個`, 'info');
                for (let i = candidates.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
                }
                for (const start of candidates) {
                    if (found.length >= count) break;
                    let overlap = false;
                    for (let i = start; i < start + length; i++) {
                        if (usedPos.has(deck[i].pos)) { overlap = true; break; }
                    }
                    if (overlap) continue;
                    const cards = deck.slice(start, start + length);
                    for (const c of cards) usedPos.add(c.pos);
                    found.push({ cards, length });
                }
            }
            if (found.length >= count) {
                logFn(`✅ inline 模式完成：找到 ${found.length} 段`, 'success');
                return found;
            }
            logFn(`⚠️ inline 模式只找到 ${found.length}/${count} 段，改用建構模式`, 'warn');
        }

        // ===== 嘗試 2：建構模式（template + 從 deck 配牌）=====
        if (buildMode !== 'inline') {
            for (const length of lengths) {
                let consecutiveFails = 0;
                const MAX_FAILS = 100;
                while (found.length < count && consecutiveFails < MAX_FAILS) {
                    const template = generateTemplate(length, { tieLast, excludePoints, firstSensitive, roundCount });
                    if (!template) {
                        logFn(`⚠️ 建構模板失敗（長度 ${length}）`, 'warn');
                        break;
                    }
                    const cards = matchTemplateToDeck(deck, template, usedPos);
                    if (!cards) {
                        consecutiveFails++;
                        continue;
                    }
                    consecutiveFails = 0;
                    for (const c of cards) usedPos.add(c.pos);
                    found.push({ cards, length });
                    logFn(`🟣 建構段 ${found.length}（長度 ${length}）：${template.join(' ')}`, 'info');
                }
                if (found.length >= count) break;
                if (consecutiveFails >= MAX_FAILS) {
                    logFn(`⚠️ 建構連續配牌失敗 ${MAX_FAILS} 次（長度 ${length}），改試更短長度`, 'warn');
                }
            }
        }

        if (found.length < count) {
            logFn(`❌ 穿越段挑選失敗：只找到 ${found.length}/${count} 段`, 'warn');
            return null;
        }

        return found;
    }

    /**
     * 把穿越段拆成 round 物件（從段第一張開始發，自然形成 N 個局）
     * @param {Array} segmentCards - 段內依順序排好的卡片陣列
     * @param {Object} ctx - { Simulator, makeRoundInfo }
     * @returns {Array} - round 物件陣列
     */
    function buildTraverseRounds(segmentCards, ctx) {
        // 把 segmentCards 視為一個獨立 sub-deck 來算
        const subDeck = segmentCards;
        const length = subDeck.length;
        // 每張卡片標記為穿越段卡（不論之後切牌移到哪都跟著走）
        for (const c of subDeck) {
            if (c) c.isTraverseCard = true;
        }
        const rounds = [];
        let cur = 0;
        while (cur < length) {
            const size = handSizeAt(subDeck, cur, length);
            if (size === null) break;
            const cards = subDeck.slice(cur, cur + size);
            // 用 simulate 取得 result（莊/閒/和）
            const sim = new ctx.Simulator(cards.map((c, i) => c.clone(i)));
            const sr = sim.simulate_round(0, { no_swap: true });
            const result = sr ? sr.result : '?';
            const startPos = cards[0].pos;
            const round = ctx.makeRoundInfo(startPos, cards, result, false);
            round.segment = 'A';        // UI 標籤：A 段（穿越段）
            round.isTraverse = true;    // 內部旗標：屬於穿越段
            rounds.push(round);
            cur += size;
        }
        return rounds;
    }

    // 匯出
    global.TraverseSegment = {
        pickTraverseSegments,
        buildTraverseRounds,
        // 工具函數（測試用）
        isTraverseSegment,
        lastHandAllTie,
        handSizeAt,
        pointOf,
    };

})(typeof window !== 'undefined' ? window : globalThis);
