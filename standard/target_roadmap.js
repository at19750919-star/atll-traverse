// 目標路單模組：支援從「百家樂路單」共用儲存或匯入 .json 路單，並在紅0模式／穿越紅0依目標路單排牌。
(function (global) {
    'use strict';

    const SAVED_ROADS_KEY = 'at_baccarat_saved_roads_v1';
    const SELECTED_KEY = {
        'standard-red0': 'at-target-road-standard-red0',
        'traverse-red0': 'at-target-road-traverse-red0',
    };

    function expandAlternatingRuns(runs, firstSide = '莊') {
        const out = [];
        let side = firstSide === '閒' ? '閒' : '莊';
        for (const len of runs) {
            const count = Number(len) || 0;
            for (let i = 0; i < count; i++) out.push(side);
            side = side === '莊' ? '閒' : '莊';
        }
        return out;
    }

    const BUILTIN_PRESETS = [
        {
            id: 'preset-hard-1',
            name: '難打路1｜破規律陷阱（84局）',
            builtin: true,
            nonTieOutcomes: expandAlternatingRuns([
                2, 2, 2, 3, 1, 1, 1, 1, 2, 5, 1, 2, 3, 1, 2, 2, 1, 1, 4, 1,
                1, 2, 1, 3, 2, 1, 1, 1, 1, 3, 2, 2, 2, 1, 3, 2, 1, 1, 2, 4,
                1, 1, 2, 2, 1,
            ], '莊'),
        },
        {
            id: 'preset-hard-2',
            name: '難打路2｜大眼仔小路對跳（84局）',
            builtin: true,
            nonTieOutcomes: expandAlternatingRuns([
                1, 2, 3, 1, 2, 3, 1, 2, 4, 1, 2, 3, 1, 1, 3, 2, 1, 3, 2, 1,
                4, 2, 1, 3, 2, 1, 3, 2, 1, 4, 2, 1, 3, 2, 1, 3, 2, 2, 1, 2,
                1, 2,
            ], '莊'),
        },
        {
            id: 'preset-hard-3',
            name: '難打路3｜假單跳與三連魔咒（84局）',
            builtin: true,
            nonTieOutcomes: expandAlternatingRuns([
                1, 1, 1, 1, 1, 3, 1, 1, 1, 2, 2, 1, 1, 1, 3, 1, 1, 2, 1, 1,
                2, 2, 1, 1, 1, 3, 2, 1, 1, 1, 2, 3, 1, 1, 1, 2, 3, 1, 1, 1,
                2, 1, 1, 2, 1, 1, 2, 3, 1, 1, 2, 2, 1, 1, 2,
            ], '閒'),
        },
        {
            id: 'preset-hard-4',
            name: '難打路4｜假長龍與雙跳死穴（84局）',
            builtin: true,
            nonTieOutcomes: expandAlternatingRuns([
                4, 1, 1, 2, 2, 1, 3, 3, 1, 1, 4, 2, 1, 1, 2, 4, 1, 2, 2, 1,
                3, 1, 1, 3, 2, 2, 4, 1, 1, 2, 1, 3, 2, 1, 3, 2, 1, 4, 2, 1,
                1, 2, 2,
            ], '莊'),
        },
    ];

    function normalizeOutcomeToken(token) {
        const s = String(token ?? '').trim().toUpperCase();
        if (s === 'B' || s === '莊' || s === 'BANKER') return '莊';
        if (s === 'P' || s === '閒' || s === '閑' || s === 'PLAYER') return '閒';
        if (s === 'T' || s === '和' || s === 'TIE') return '和';
        return null;
    }

    function normalizeRoadEntry(entry, index = 0) {
        if (!entry || typeof entry !== 'object') return null;
        let raw = [];
        if (Array.isArray(entry.raw)) {
            raw = entry.raw.map(normalizeOutcomeToken).filter(Boolean);
        } else if (Array.isArray(entry.outcomes)) {
            raw = entry.outcomes.map(normalizeOutcomeToken).filter(Boolean);
        } else if (Array.isArray(entry.nonTieOutcomes)) {
            raw = entry.nonTieOutcomes.map(normalizeOutcomeToken).filter(Boolean);
        } else if (typeof entry.sequence === 'string') {
            raw = Array.from(entry.sequence).map(normalizeOutcomeToken).filter(Boolean);
        }
        const nonTieOutcomes = Array.isArray(entry.nonTieOutcomes) && entry.nonTieOutcomes.length
            ? entry.nonTieOutcomes.map(normalizeOutcomeToken).filter(x => x === '莊' || x === '閒')
            : raw.filter(x => x === '莊' || x === '閒');
        if (!nonTieOutcomes.length) return null;
        const name = String(entry.name || `匯入路單-${String(index + 1).padStart(3, '0')}`).trim();
        const id = String(entry.id || `road-${name}`).trim();
        return {
            id,
            name,
            builtin: Boolean(entry.builtin),
            createdAt: entry.createdAt || new Date().toISOString(),
            raw: raw.length ? raw : nonTieOutcomes.slice(),
            nonTieOutcomes,
        };
    }

    function loadUserRoads() {
        try {
            const raw = global.localStorage && global.localStorage.getItem(SAVED_ROADS_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            return parsed.map((item, idx) => normalizeRoadEntry(item, idx)).filter(Boolean);
        } catch (_) {
            return [];
        }
    }

    function saveUserRoads(list) {
        try {
            if (global.localStorage) {
                global.localStorage.setItem(SAVED_ROADS_KEY, JSON.stringify(list));
            }
        } catch (_) {}
    }

    function listAllRoads() {
        const userRoads = loadUserRoads();
        return [...userRoads, ...BUILTIN_PRESETS];
    }

    function getSelectedId(modeKey) {
        const key = SELECTED_KEY[modeKey];
        if (!key) return '';
        try {
            const id = (global.localStorage && global.localStorage.getItem(key)) || '';
            if (!id) return '';
            const exists = listAllRoads().some(r => r.id === id);
            return exists ? id : '';
        } catch (_) {
            return '';
        }
    }

    function setSelectedId(modeKey, id) {
        const key = SELECTED_KEY[modeKey];
        if (!key) return;
        try {
            if (global.localStorage) {
                if (id) global.localStorage.setItem(key, String(id));
                else global.localStorage.removeItem(key);
            }
        } catch (_) {}
        syncUI();
    }

    function getRoadById(id) {
        if (!id) return null;
        return listAllRoads().find(r => r.id === id) || null;
    }

    function getModeKeyForScope(scope) {
        if (scope !== 'standard' && scope !== 'standard-red0') return null;
        const sub = typeof document !== 'undefined'
            ? (document.body?.dataset?.sub || (global.StandardProfiles && global.StandardProfiles.current) || 'red0')
            : 'red0';
        if (scope === 'standard' && sub !== 'red0') return null;
        return 'standard-red0';
    }

    function getActiveRoad(scope = 'standard') {
        const modeKey = getModeKeyForScope(scope);
        if (!modeKey) return null;
        const id = getSelectedId(modeKey);
        return getRoadById(id);
    }

    function isActive(scope = 'standard') {
        const road = getActiveRoad(scope);
        return Boolean(road && Array.isArray(road.nonTieOutcomes) && road.nonTieOutcomes.length > 0);
    }

    function getTargetOutcomes(scope = 'standard') {
        const road = getActiveRoad(scope);
        return road ? road.nonTieOutcomes.slice() : null;
    }

    function formatRoadSummary(road) {
        if (!road || !Array.isArray(road.nonTieOutcomes) || !road.nonTieOutcomes.length) {
            return '未指定（隨機路）';
        }
        const b = road.nonTieOutcomes.filter(x => x === '莊').length;
        const p = road.nonTieOutcomes.filter(x => x === '閒').length;
        const preview = road.nonTieOutcomes.slice(0, 12).join('');
        return `${road.name}：莊${b}／閒${p}（共${road.nonTieOutcomes.length}局，前12局：${preview}…）`;
    }

    function summarizeShort(scope = 'standard') {
        const road = getActiveRoad(scope);
        if (!road) return '';
        const b = road.nonTieOutcomes.filter(x => x === '莊').length;
        const p = road.nonTieOutcomes.filter(x => x === '閒').length;
        return `目標路單：${road.name}（莊${b}/閒${p}）`;
    }

    function importRoadFromJsonText(jsonText, fallbackName = '匯入路單') {
        let parsed;
        try {
            parsed = JSON.parse(jsonText);
        } catch (_) {
            throw new Error('無法解析路單 JSON 檔案，請確認檔案格式正確。');
        }
        const candidates = [];
        if (Array.isArray(parsed)) {
            if (parsed.every(x => typeof x === 'string')) {
                const one = normalizeRoadEntry({ name: fallbackName, raw: parsed }, 0);
                if (one) candidates.push(one);
            } else {
                parsed.forEach((item, i) => {
                    const norm = normalizeRoadEntry(item, i);
                    if (norm) candidates.push(norm);
                });
            }
        } else if (parsed && typeof parsed === 'object') {
            if (Array.isArray(parsed.roads)) {
                parsed.roads.forEach((item, i) => {
                    const norm = normalizeRoadEntry(item, i);
                    if (norm) candidates.push(norm);
                });
            } else {
                const norm = normalizeRoadEntry({ name: parsed.name || fallbackName, ...parsed }, 0);
                if (norm) candidates.push(norm);
            }
        }
        if (!candidates.length) {
            throw new Error('路單檔案中沒有有效的莊／閒紀錄。');
        }
        const userRoads = loadUserRoads();
        let lastAdded = null;
        for (const item of candidates) {
            item.builtin = false;
            item.id = `road-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            const existingIdx = userRoads.findIndex(r => r.name === item.name);
            if (existingIdx >= 0) {
                item.id = userRoads[existingIdx].id;
                userRoads[existingIdx] = item;
            } else {
                userRoads.unshift(item);
            }
            lastAdded = item;
        }
        saveUserRoads(userRoads);
        return lastAdded;
    }

    // ════════════════════════════════════════════════════════════════
    // 紅0模式（一般模式）目標路單對齊演算法
    // 利用紅0（♥♦ 10/J/Q/K）與黑0（♠♣ 10/J/Q/K）同為 0 點且非三條牌（A~9）的特性：
    // 互換紅0與黑0完全不改變各局點數、用牌張數、敏感性、逆轉與回復分析！
    // ════════════════════════════════════════════════════════════════
    function isRedZeroCard(card) {
        if (!card) return false;
        const rank = String(card.rank || '').toUpperCase();
        const isZeroRank = rank === '10' || rank === 'J' || rank === 'Q' || rank === 'K' || rank === 'T';
        if (!isZeroRank) return false;
        return card.suit === '♥' || card.suit === '♦';
    }

    function isZeroPointCard(card) {
        if (!card) return false;
        if (typeof card.point === 'function') return card.point() === 0;
        if (typeof card.point === 'number') return card.point === 0;
        const rank = String(card.rank || '').toUpperCase();
        return rank === '10' || rank === 'J' || rank === 'Q' || rank === 'K' || rank === 'T' || rank === '0';
    }

    function isTRoundStandard(round) {
        if (!round) return false;
        if (round.isT) return true;
        if (typeof global.hasFullHouse === 'function' && global.hasFullHouse(round)) return true;
        return false;
    }

    function countZerosInRound(round) {
        if (!round || !Array.isArray(round.cards)) return 0;
        let c = 0;
        for (const card of round.cards) {
            if (isZeroPointCard(card)) c++;
        }
        return c;
    }

    function hasB6PotentialStandard(round) {
        if (!round || !Array.isArray(round.cards) || round.cards.length < 4) return false;
        if (typeof global.computeRoundHands !== 'function') return false;
        const h1 = global.computeRoundHands(round.cards);
        if (h1 && h1.bankerTotal === 6 && h1.playerTotal <= 5) return true;
        const sw = round.cards.slice();
        [sw[0], sw[1]] = [sw[1], sw[0]];
        const h2 = global.computeRoundHands(sw);
        return Boolean(h2 && h2.bankerTotal === 6 && h2.playerTotal <= 5);
    }

    function buildTargetWantOutcomes(rounds, targetOutcomes) {
        const n = rounds.length;
        const wantOutcome = new Array(n).fill('閒');
        let ptr = 0;
        let lastNonTie = '莊';
        for (let k = 0; k < n; k++) {
            const res = rounds[k]?.result;
            if (res === '和') {
                wantOutcome[k] = '和';
            } else if (ptr < targetOutcomes.length) {
                wantOutcome[k] = targetOutcomes[ptr++];
                lastNonTie = wantOutcome[k];
            } else {
                lastNonTie = lastNonTie === '莊' ? '閒' : '莊';
                wantOutcome[k] = lastNonTie;
            }
        }
        return wantOutcome;
    }

    function alignStandardRounds(rounds) {
        if (!Array.isArray(rounds) || rounds.length < 2) return false;
        if (!isActive('standard')) return false;
        const targetOutcomes = getTargetOutcomes('standard');
        if (!targetOutcomes || !targetOutcomes.length) return false;

        // 確認目前訊號設定為 0 點花色區分（如紅0 ♥♦ × 10,J,Q,K）
        const zeroSlotsAll = [];
        const redZeroCards = [];
        const blackZeroCards = [];
        rounds.forEach((r, rIdx) => {
            (r?.cards || []).forEach((c, cIdx) => {
                if (isZeroPointCard(c)) {
                    zeroSlotsAll.push({ rIdx, cIdx });
                    if (isRedZeroCard(c)) redZeroCards.push(c);
                    else blackZeroCards.push(c);
                }
            });
        });
        if (!redZeroCards.length || !blackZeroCards.length) return false;

        const n = rounds.length;
        const preserveLastNine = Boolean(
            typeof document !== 'undefined' &&
            document.getElementById('lastCardNine')?.checked &&
            String(rounds[n - 1]?.cards?.at(-1)?.rank) === '9'
        );

        // 0a. 若末張9固定在最後一局且第1局目標為莊，確保最後一局至少有 1 張 0 點牌
        if (preserveLastNine && targetOutcomes[0] === '莊' && countZerosInRound(rounds[n - 1]) === 0) {
            for (let k = 0; k < n - 1; k++) {
                const rk = rounds[k];
                if (!rk || rk.result === '和' || isTRoundStandard(rk)) continue;
                const prev = k > 0 ? rounds[k - 1] : null;
                if (prev && isTRoundStandard(prev)) continue;
                if (String(rk.cards?.at(-1)?.rank) === '9' && countZerosInRound(rk) >= 1) {
                    const tmp = rounds[n - 1];
                    rounds[n - 1] = rounds[k];
                    rounds[k] = tmp;
                    break;
                }
            }
        }

        // 0b. 若和局本身沒有 0 點牌，但和局的下一局目標為莊（需要和局帶紅0訊號）：
        // 先嘗試與其他有 0 點牌的和局交換；若仍無 0 點牌，將（三條T局＋和局）整組移到目標為「閒」的前方位置
        for (let pass = 0; pass < n; pass++) {
            const curWant = buildTargetWantOutcomes(rounds, targetOutcomes);
            let badTieIdx = -1;
            for (let i = 0; i < n; i++) {
                if (rounds[i]?.result === '和' && curWant[(i + 1) % n] === '莊' && countZerosInRound(rounds[i]) === 0) {
                    badTieIdx = i;
                    break;
                }
            }
            if (badTieIdx < 0) break;

            // 先找另一個有 0 點牌且下一局目標不是莊的和局交換
            let swappedTie = false;
            for (let j = 0; j < n; j++) {
                if (j === badTieIdx || rounds[j]?.result !== '和') continue;
                if (countZerosInRound(rounds[j]) >= 1 && curWant[(j + 1) % n] !== '莊') {
                    const tmp = rounds[badTieIdx];
                    rounds[badTieIdx] = rounds[j];
                    rounds[j] = tmp;
                    swappedTie = true;
                    break;
                }
            }
            if (swappedTie) continue;

            // 將 (T局, 和局) 或單獨和局移到下一局目標為「閒」的位置
            const hasPrevT = badTieIdx > 0 && isTRoundStandard(rounds[badTieIdx - 1]);
            const unitStart = hasPrevT ? badTieIdx - 1 : badTieIdx;
            const unitLen = hasPrevT ? 2 : 1;
            if (preserveLastNine && unitStart + unitLen > n - 1) break;

            const removed = rounds.splice(unitStart, unitLen);
            const maxIns = preserveLastNine ? rounds.length - 1 : rounds.length;
            let bestIns = unitStart;
            for (let ins = 1; ins <= maxIns; ins++) {
                if (ins === unitStart) continue;
                if (ins > 0 && isTRoundStandard(rounds[ins - 1])) continue;
                rounds.splice(ins, 0, ...removed);
                const testWant = buildTargetWantOutcomes(rounds, targetOutcomes);
                const newTieIdx = ins + unitLen - 1;
                const okHere = testWant[(newTieIdx + 1) % n] === '閒';
                rounds.splice(ins, unitLen);
                if (okHere) {
                    bestIns = ins;
                    break;
                }
            }
            rounds.splice(bestIns, 0, ...removed);
            if (bestIns === unitStart) break;
        }

        // 固定不可移動局：和局、T局、T局的下一局、以及末張9時的最後一局
        const fixedPos = new Uint8Array(n);
        for (let i = 0; i < n; i++) {
            const r = rounds[i];
            if (!r || r.result === '和' || isTRoundStandard(r)) {
                fixedPos[i] = 1;
            }
            const prev = rounds[(i - 1 + n) % n];
            if (prev && isTRoundStandard(prev)) {
                fixedPos[i] = 1;
            }
        }
        if (preserveLastNine) fixedPos[n - 1] = 1;

        const wantOutcome = buildTargetWantOutcomes(rounds, targetOutcomes);
        const needSig = new Uint8Array(n);
        for (let i = 0; i < n; i++) {
            if (isTRoundStandard(rounds[i])) {
                needSig[i] = 0;
                continue;
            }
            const nextWant = wantOutcome[(i + 1) % n];
            if (nextWant === '莊') {
                needSig[i] = 1;
            } else {
                needSig[i] = 0;
            }
        }

        // 若固定位置中有 needSig[i] === 1 但該局沒有 0 點牌，若下一局不是和局則改設下一局為閒
        for (let i = 0; i < n; i++) {
            if (fixedPos[i] && needSig[i] && countZerosInRound(rounds[i]) === 0) {
                needSig[i] = 0;
                const nextIdx = (i + 1) % n;
                if (wantOutcome[nextIdx] === '莊') wantOutcome[nextIdx] = '閒';
            }
        }

        // 收集可移動的莊/閒局，依目標位置需求分配：
        // 1. needSig[pos] === 1 的位置必須分配有 0 點牌的局，且優先給 0 點牌多的局（確保總 0 點容量 >= 64）
        // 2. wantOutcome[pos] === '閒' 的位置優先分配具 B6 潛力的局（對調後變對調莊6，不增加實際莊6贏）
        const movableIndices = [];
        const pool = [];
        for (let i = 0; i < n; i++) {
            if (!fixedPos[i]) {
                movableIndices.push(i);
                pool.push({
                    round: rounds[i],
                    zeros: countZerosInRound(rounds[i]),
                    b6: hasB6PotentialStandard(rounds[i]),
                    len: rounds[i]?.cards?.length || 0,
                });
            }
        }

        const assigned = new Array(n).fill(null);
        for (let i = 0; i < n; i++) {
            if (fixedPos[i]) assigned[i] = rounds[i];
        }

        const usedPool = new Uint8Array(pool.length);
        const needSigPositions = movableIndices.filter(pos => needSig[pos] === 1);
        const noSigPositions = movableIndices.filter(pos => needSig[pos] === 0);

        // 先為 needSig === 1 且 wantOutcome === '閒' 的位置挑 (zeros >= 1, b6優先, zeros多優先)
        // 再為其餘 needSig === 1 的位置挑 (zeros >= 1, !b6優先, zeros多優先)
        const orderNeedSig = [
            ...needSigPositions.filter(pos => wantOutcome[pos] === '閒'),
            ...needSigPositions.filter(pos => wantOutcome[pos] !== '閒'),
        ];

        for (const pos of orderNeedSig) {
            const preferB6 = wantOutcome[pos] === '閒';
            let bestIdx = -1;
            let bestScore = -1e9;
            for (let j = 0; j < pool.length; j++) {
                if (usedPool[j]) continue;
                const item = pool[j];
                if (item.zeros < 1) continue;
                const b6Score = (preferB6 ? (item.b6 ? 20 : 0) : (item.b6 ? -10 : 10));
                const score = item.zeros * 100 + b6Score;
                if (score > bestScore) {
                    bestScore = score;
                    bestIdx = j;
                }
            }
            if (bestIdx < 0) {
                // 萬一有 0 點牌的局不夠，退回任一未用局並取消該位置訊號需求
                for (let j = 0; j < pool.length; j++) {
                    if (!usedPool[j]) { bestIdx = j; break; }
                }
                needSig[pos] = 0;
                const nextIdx = (pos + 1) % n;
                if (wantOutcome[nextIdx] === '莊') wantOutcome[nextIdx] = '閒';
            }
            usedPool[bestIdx] = 1;
            assigned[pos] = pool[bestIdx].round;
        }

        // 再為 needSig === 0 的位置分配剩餘局（wantOutcome === '閒' 優先拿 b6 局）
        const orderNoSig = [
            ...noSigPositions.filter(pos => wantOutcome[pos] === '閒'),
            ...noSigPositions.filter(pos => wantOutcome[pos] !== '閒'),
        ];
        for (const pos of orderNoSig) {
            const preferB6 = wantOutcome[pos] === '閒';
            let bestIdx = -1;
            let bestScore = -1e9;
            for (let j = 0; j < pool.length; j++) {
                if (usedPool[j]) continue;
                const item = pool[j];
                const b6Score = preferB6 ? (item.b6 ? 50 : 0) : (item.b6 ? -25 : 10);
                // 把 0 點牌較多的局留給可能需要的交換
                const score = b6Score - item.zeros;
                if (score > bestScore) {
                    bestScore = score;
                    bestIdx = j;
                }
            }
            usedPool[bestIdx] = 1;
            assigned[pos] = pool[bestIdx].round;
        }

        // 檢查 needSig === 1 的總 0 點容量是否足以容納全部 64 張紅0；
        // 若不足，將 needSig === 1 中只有 1 張 0 點的局與 needSig === 0 中有 2~4 張 0 點的局互換
        const calcSignalZeroCapacity = () => {
            let cap = 0;
            for (let i = 0; i < n; i++) {
                if (needSig[i] === 1) cap += countZerosInRound(assigned[i]);
            }
            return cap;
        };
        let cap = calcSignalZeroCapacity();
        if (cap < redZeroCards.length) {
            for (const posA of needSigPositions) {
                if (cap >= redZeroCards.length) break;
                const zA = countZerosInRound(assigned[posA]);
                let bestPosB = -1;
                let bestGain = 0;
                for (const posB of noSigPositions) {
                    const zB = countZerosInRound(assigned[posB]);
                    if (zB - zA > bestGain) {
                        bestGain = zB - zA;
                        bestPosB = posB;
                    }
                }
                if (bestPosB >= 0) {
                    const tmp = assigned[posA];
                    assigned[posA] = assigned[bestPosB];
                    assigned[bestPosB] = tmp;
                    cap += bestGain;
                }
            }
        }

        // 避免出現連續 5 局 4 張牌：在相同 needSig 且相同 wantOutcome 的可移動位置之間互換 4 張局與 5/6 張局
        for (let pass = 0; pass < 6; pass++) {
            let run = 0, broken = false;
            for (let i = 0; i < n; i++) {
                if ((assigned[i]?.cards?.length || 0) === 4) {
                    run++;
                    if (run >= 5) {
                        // 在這 5 局中找可移動局，與外面同 needSig 的 5/6 張局交換
                        for (let k = i; k >= i - 4; k--) {
                            if (fixedPos[k]) continue;
                            const candidate = movableIndices.find(m =>
                                (m < i - 4 || m > i) &&
                                (assigned[m]?.cards?.length || 0) !== 4 &&
                                needSig[m] === needSig[k] &&
                                (needSig[k] === 0 || countZerosInRound(assigned[m]) >= countZerosInRound(assigned[k]))
                            );
                            if (candidate !== undefined) {
                                const tmp = assigned[k];
                                assigned[k] = assigned[candidate];
                                assigned[candidate] = tmp;
                                broken = true;
                                break;
                            }
                        }
                        run = 0;
                    }
                } else {
                    run = 0;
                }
            }
            if (!broken) break;
        }

        for (let i = 0; i < n; i++) rounds[i] = assigned[i];

        // 重新分配全靴 128 個 0 點位置的紅0（64張）與黑0（64張）
        const sigRoundZeroSlots = new Map();
        const extraRedZeroSlots = [];
        const blackOnlyZeroSlots = [];

        for (let i = 0; i < n; i++) {
            const slots = [];
            (rounds[i]?.cards || []).forEach((c, cIdx) => {
                if (isZeroPointCard(c)) slots.push({ rIdx: i, cIdx });
            });
            if (!slots.length) continue;
            if (needSig[i] === 1) {
                sigRoundZeroSlots.set(i, slots);
            } else {
                blackOnlyZeroSlots.push(...slots);
            }
        }

        const redSlotSet = new Set();
        const slotKey = s => `${s.rIdx}:${s.cIdx}`;

        // 每個 needSig[i] === 1 的局先放 1 張紅0
        for (const [, slots] of sigRoundZeroSlots.entries()) {
            if (redSlotSet.size < redZeroCards.length) {
                redSlotSet.add(slotKey(slots[0]));
                for (let k = 1; k < slots.length; k++) extraRedZeroSlots.push(slots[k]);
            } else {
                blackOnlyZeroSlots.push(...slots);
            }
        }

        // 剩餘的紅0全部放進 needSig[i] === 1 的多餘 0 點位置
        for (const slot of extraRedZeroSlots) {
            if (redSlotSet.size < redZeroCards.length) {
                redSlotSet.add(slotKey(slot));
            } else {
                blackOnlyZeroSlots.push(slot);
            }
        }

        // 若還是放不完（極罕見），優先放進下一局是和局的位置，最後才放進尾段位置
        if (redSlotSet.size < redZeroCards.length) {
            const tiePrevSlots = blackOnlyZeroSlots.filter(s => rounds[(s.rIdx + 1) % n]?.result === '和' && !isTRoundStandard(rounds[s.rIdx]));
            const otherSlots = blackOnlyZeroSlots.filter(s => !tiePrevSlots.includes(s)).reverse();
            for (const slot of [...tiePrevSlots, ...otherSlots]) {
                if (redSlotSet.size >= redZeroCards.length) break;
                redSlotSet.add(slotKey(slot));
            }
        }

        const redPool = redZeroCards.slice();
        const blackPool = blackZeroCards.slice();
        let posCounter = 0;
        for (let i = 0; i < n; i++) {
            const r = rounds[i];
            if (!r || !Array.isArray(r.cards)) continue;
            r.start_index = posCounter;
            for (let cIdx = 0; cIdx < r.cards.length; cIdx++) {
                const c = r.cards[cIdx];
                if (isZeroPointCard(c)) {
                    const wantRed = redSlotSet.has(`${i}:${cIdx}`);
                    const picked = wantRed
                        ? (redPool.length ? redPool.pop() : blackPool.pop())
                        : (blackPool.length ? blackPool.pop() : redPool.pop());
                    if (picked) {
                        // 移動的是整張牌；保留自己的牌背，避免破壞每牌面紅藍各4張。
                        // 牌背圖樣由生成流程後續的同牌面配置統一處理。
                        r.cards[cIdx] = picked;
                    }
                }
                if (r.cards[cIdx]) r.cards[cIdx].pos = posCounter++;
            }
            if (typeof global.recomputeRoundOutcome === 'function') {
                global.recomputeRoundOutcome(r);
            }
        }
        return true;
    }

    // ════════════════════════════════════════════════════════════════
    // 介面綁定與同步
    // ════════════════════════════════════════════════════════════════
    const UI_BINDINGS = [
        {
            modeKey: 'standard-red0',
            scope: 'standard',
            selectId: 'stTargetRoadSelect',
            importBtnId: 'stTargetRoadImportBtn',
            clearBtnId: 'stTargetRoadClearBtn',
            fileInputId: 'stTargetRoadFileInput',
            summaryId: 'stTargetRoadSummary',
        },
    ];

    function syncUI() {
        if (typeof document === 'undefined') return;
        const roads = listAllRoads();
        for (const cfg of UI_BINDINGS) {
            const selectEl = document.getElementById(cfg.selectId);
            const summaryEl = document.getElementById(cfg.summaryId);
            const clearBtn = document.getElementById(cfg.clearBtnId);
            const selectedId = getSelectedId(cfg.modeKey);

            if (selectEl) {
                selectEl.innerHTML = '';
                const emptyOpt = document.createElement('option');
                emptyOpt.value = '';
                emptyOpt.textContent = '不指定（隨機路）';
                selectEl.appendChild(emptyOpt);

                const userGroup = roads.filter(r => !r.builtin);
                const presetGroup = roads.filter(r => r.builtin);

                if (userGroup.length) {
                    const og = document.createElement('optgroup');
                    og.label = '已儲存／匯入路單';
                    userGroup.forEach(r => {
                        const opt = document.createElement('option');
                        opt.value = r.id;
                        const b = r.nonTieOutcomes.filter(x => x === '莊').length;
                        const p = r.nonTieOutcomes.filter(x => x === '閒').length;
                        opt.textContent = `${r.name}（莊${b}/閒${p}，${r.nonTieOutcomes.length}局）`;
                        og.appendChild(opt);
                    });
                    selectEl.appendChild(og);
                }

                if (presetGroup.length) {
                    const og = document.createElement('optgroup');
                    og.label = '內建難打路範本';
                    presetGroup.forEach(r => {
                        const opt = document.createElement('option');
                        opt.value = r.id;
                        const b = r.nonTieOutcomes.filter(x => x === '莊').length;
                        const p = r.nonTieOutcomes.filter(x => x === '閒').length;
                        opt.textContent = `${r.name}（莊${b}/閒${p}）`;
                        og.appendChild(opt);
                    });
                    selectEl.appendChild(og);
                }

                selectEl.value = selectedId;
            }

            const activeRoad = getRoadById(selectedId);
            if (summaryEl) {
                summaryEl.textContent = formatRoadSummary(activeRoad);
            }
            if (clearBtn) {
                clearBtn.disabled = !selectedId;
            }
        }
    }

    function bindUI() {
        if (typeof document === 'undefined') return;
        for (const cfg of UI_BINDINGS) {
            const selectEl = document.getElementById(cfg.selectId);
            const importBtn = document.getElementById(cfg.importBtnId);
            const clearBtn = document.getElementById(cfg.clearBtnId);
            const fileInput = document.getElementById(cfg.fileInputId);

            if (selectEl && !selectEl.dataset.boundTargetRoad) {
                selectEl.dataset.boundTargetRoad = '1';
                selectEl.addEventListener('change', () => {
                    setSelectedId(cfg.modeKey, selectEl.value);
                    const road = getRoadById(selectEl.value);
                    if (typeof global.log === 'function') {
                        global.log(
                            road ? `已選擇目標路單：${formatRoadSummary(road)}` : '已取消目標路單，恢復隨機路排牌',
                            'info'
                        );
                    }
                });
            }

            if (importBtn && fileInput && !importBtn.dataset.boundTargetRoad) {
                importBtn.dataset.boundTargetRoad = '1';
                importBtn.addEventListener('click', () => {
                    fileInput.value = '';
                    fileInput.click();
                });
                fileInput.addEventListener('change', async () => {
                    const file = fileInput.files && fileInput.files[0];
                    if (!file) return;
                    try {
                        const text = await file.text();
                        const baseName = file.name.replace(/\.json$/i, '').trim() || '匯入路單';
                        const added = importRoadFromJsonText(text, baseName);
                        setSelectedId(cfg.modeKey, added.id);
                        if (typeof global.log === 'function') {
                            global.log(`✅ 已匯入並套用目標路單：${formatRoadSummary(added)}`, 'success');
                        }
                    } catch (err) {
                        const msg = err && err.message ? err.message : String(err);
                        if (typeof global.log === 'function') global.log(`匯入路單失敗：${msg}`, 'error');
                        if (typeof global.alert === 'function') global.alert(`匯入路單失敗：${msg}`);
                    }
                });
            }

            if (clearBtn && !clearBtn.dataset.boundTargetRoad) {
                clearBtn.dataset.boundTargetRoad = '1';
                clearBtn.addEventListener('click', () => {
                    setSelectedId(cfg.modeKey, '');
                    if (typeof global.log === 'function') {
                        global.log('已清除目標路單設定，恢復隨機路排牌', 'info');
                    }
                });
            }
        }
        syncUI();
    }

    if (typeof window !== 'undefined') {
        window.addEventListener('storage', (e) => {
            if (!e || e.key === SAVED_ROADS_KEY || Object.values(SELECTED_KEY).includes(e.key)) {
                syncUI();
            }
        });
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', bindUI);
        } else {
            setTimeout(bindUI, 0);
        }
    }

    global.TargetRoadmap = {
        SAVED_ROADS_KEY,
        BUILTIN_PRESETS,
        listAllRoads,
        loadUserRoads,
        importRoadFromJsonText,
        getSelectedId,
        setSelectedId,
        getActiveRoad,
        isActive,
        getTargetOutcomes,
        formatRoadSummary,
        summarizeShort,
        alignStandardRounds,
        syncUI,
        bindUI,
    };
})(typeof window !== 'undefined' ? window : globalThis);
