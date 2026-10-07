// ════════════════════════════════════════════════════════════════
// 訊號牌系統 - 百家樂牌靴生成與分析工具  
// ════════════════════════════════════════════════════════════════
// 
// 【核心功能】
// 1. 自訂訊號牌配置（任意花色 + 數字組合）
// 2. 生成包含敏感局的牌靴
// 3. S 局：敏感局中包含訊號牌，自動調整為莊家勝
// 
//
// 【重要概念】
// - 訊號牌：使用者自訂的花色+數字組合（例如：紅心10,J,Q,K）
// - 敏感局：交換莊閒前兩張牌會改變結果的局
// - S 局：敏感局 + 包含訊號牌
// 
//
// ════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════
// 卡牌張數修復功能`
// ════════════════════════════════════════════════════════════════
// 用於修復殘牌處理導致的「卡牌張數與補牌規則不符」問題

// 計算百家樂點數
function baccarat_cardPoint(card) {
    if (!card) return null;
    if (typeof card.point === 'function') {
        const p = card.point();
        return (typeof p === 'number' && Number.isFinite(p)) ? p : null;
    }
    if (typeof card.value === 'number' && Number.isFinite(card.value)) {
        return card.value;
    }
    return null;
}

function baccarat_calculatePoint(cards) {
    if (!Array.isArray(cards)) return 0;
    return cards.reduce((sum, card) => {
        const p = baccarat_cardPoint(card);
        if (typeof p !== 'number') return sum;
        return sum + p;
    }, 0) % 10;
}

// 檢查閒家是否補牌
function baccarat_shouldPlayerDraw(playerFirst2Point) {
    return playerFirst2Point <= 5;
}

// 檢查莊家是否補牌
function baccarat_shouldBankerDraw(bankerFirst2Point, playerThirdCard) {
    if (bankerFirst2Point <= 2) return true;
    if (bankerFirst2Point >= 7) return false;

    if (playerThirdCard === null) {
        return bankerFirst2Point <= 5;
    }

    const p3Value = baccarat_cardPoint(playerThirdCard);
    if (typeof p3Value !== 'number') return false;

    if (bankerFirst2Point === 3) return p3Value !== 8;
    if (bankerFirst2Point === 4) return p3Value >= 2 && p3Value <= 7;
    if (bankerFirst2Point === 5) return p3Value >= 4 && p3Value <= 7;
    if (bankerFirst2Point === 6) return p3Value >= 6 && p3Value <= 7;

    return false;
}

// 檢查是否為敏感局（對調前兩張會改變結果）
function baccarat_isSensitiveRound(cards) {
    if (!cards || cards.length < 4) return false;

    const calculateResult = (cardOrder) => {
        const p1 = cardOrder[0], b1 = cardOrder[1];
        const p2 = cardOrder[2], b2 = cardOrder[3];

        const playerFirst2 = baccarat_calculatePoint([p1, p2]);
        const bankerFirst2 = baccarat_calculatePoint([b1, b2]);

        let playerTotal = playerFirst2;
        let bankerTotal = bankerFirst2;

        if (baccarat_shouldPlayerDraw(playerFirst2) && cardOrder[4]) {
            playerTotal = baccarat_calculatePoint([p1, p2, cardOrder[4]]);
        }

        const p3Card = (cardOrder[4] && baccarat_shouldPlayerDraw(playerFirst2)) ? cardOrder[4] : null;
        const b3Index = p3Card ? 5 : 4;

        if (baccarat_shouldBankerDraw(bankerFirst2, p3Card) && cardOrder[b3Index]) {
            bankerTotal = baccarat_calculatePoint([b1, b2, cardOrder[b3Index]]);
        }

        return playerTotal === bankerTotal ? '和' :
            playerTotal > bankerTotal ? '閒' : '莊';
    };

    const originalResult = calculateResult(cards);

    const swapped = [...cards];
    [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
    const swappedResult = calculateResult(swapped);

    return originalResult !== swappedResult;
}

// 計算這個排列實際需要多少張牌
function baccarat_getExpectedCardCount(cards) {
    if (!cards || cards.length < 4) return 4;

    const playerFirst2 = baccarat_calculatePoint([cards[0], cards[2]]);
    const bankerFirst2 = baccarat_calculatePoint([cards[1], cards[3]]);

    // 天牌 (Natural 8/9)：雙方都不補牌
    if (playerFirst2 >= 8 || bankerFirst2 >= 8) return 4;

    const playerDraws = baccarat_shouldPlayerDraw(playerFirst2);

    const p3Card = (playerDraws && cards[4]) ? cards[4] : null;
    const bankerDraws = baccarat_shouldBankerDraw(bankerFirst2, p3Card);

    let expected = 4;
    if (playerDraws) expected++;
    if (bankerDraws) expected++;

    return expected;
}

// 嘗試調整6張牌的順序，使其符合補牌規則
function baccarat_tryFixCardOrder(cards) {
    if (!cards || cards.length !== 6) return null;

    const attempts = [];
    const sortedByValue = [...cards].sort((a, b) => {
        const pa = baccarat_cardPoint(a) ?? 0;
        const pb = baccarat_cardPoint(b) ?? 0;
        return pa - pb;
    });

    for (let i = 0; i < cards.length - 1; i++) {
        for (let j = i + 1; j < cards.length; j++) {
            const p1 = sortedByValue[i];
            const p2 = sortedByValue[j];
            const playerFirst2 = baccarat_calculatePoint([p1, p2]);

            if (playerFirst2 > 5) continue;

            const remaining = cards.filter(c => c !== p1 && c !== p2);

            for (let bi = 0; bi < remaining.length - 1; bi++) {
                for (let bj = bi + 1; bj < remaining.length; bj++) {
                    const b1 = remaining[bi];
                    const b2 = remaining[bj];
                    const bankerFirst2 = baccarat_calculatePoint([b1, b2]);

                    const remainingForDraw = remaining.filter(c => c !== b1 && c !== b2);
                    if (remainingForDraw.length !== 2) continue;

                    const p3 = remainingForDraw[0];
                    const b3 = remainingForDraw[1];

                    const playerDraws = baccarat_shouldPlayerDraw(playerFirst2);
                    if (!playerDraws) continue;

                    const bankerDraws = baccarat_shouldBankerDraw(bankerFirst2, p3);
                    if (!bankerDraws) continue;

                    const newOrder = [p1, b1, p2, b2, p3, b3];

                    if (baccarat_isSensitiveRound(newOrder)) {
                        attempts.push({
                            order: newOrder,
                            playerFirst2,
                            bankerFirst2,
                            score: Math.abs(playerFirst2 - 5)
                        });
                    }
                }
            }
        }
    }

    if (attempts.length > 0) {
        attempts.sort((a, b) => a.score - b.score);
        return attempts[0].order;
    }

    return null;
}

// 主函數：修復卡牌張數問題
function fixCardCountViolation(round, roundNum) {
    if (!round || !round.cards) return null;

    const cards = round.cards;
    const expectedCount = baccarat_getExpectedCardCount(cards);
    const actualCount = cards.length;

    if (actualCount !== expectedCount && actualCount === 6) {
        log(`🔧 第 ${roundNum} 局: 有${actualCount}張牌，但應該有${expectedCount}張`, 'info');

        const newOrder = baccarat_tryFixCardOrder(cards);

        if (newOrder) {
            round.cards = newOrder;

            const playerTotal = baccarat_calculatePoint([newOrder[0], newOrder[2], newOrder[4]]);
            const bankerTotal = baccarat_calculatePoint([newOrder[1], newOrder[3], newOrder[5]]);
            const newResult = playerTotal === bankerTotal ? '和' :
                playerTotal > bankerTotal ? '閒' : '莊';
            round.result = newResult;

            log(`🔧   ✅ 已調整順序，閒:${playerTotal}點 莊:${bankerTotal}點 → ${newResult}`, 'success');
            return true;
        } else {
            log(`🔧   ❌ 無法找到合法的6張牌排列`, 'error');
            return false;
        }
    }

    return null;
}

const ENABLE_S_LOGS = false;
// 控制性日誌輸出，只在 ENABLE_S_LOGS 開啟時呼叫 log
function sLog(message, type = 'info') {
    if (ENABLE_S_LOGS) log(message, type);
}

// 是否啟用「初始違規過多→自動重新生成」的前置檢查（目前不需要，預設關閉）
const ENABLE_PREFLIGHT_REGENERATE = false;

const SIGNAL_STORAGE_KEY = 'signal_config';
const CARD_COLOR_PATTERNS_STORAGE_KEY = 'card_color_patterns_selected';
const VALID_CARD_COLOR_PATTERNS = ['BBBR', 'RRRB', 'BBRR', 'RRBB'];
const VALID_SUITS = ['♠', '♥', '♦', '♣'];
const VALID_RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SIGNAL_DEFAULT_CONFIG = { suits: ['♠','♥','♦','♣'], ranks: ['A','2'] };

const CARD_COLOR_MIXED_MODE = true;

function isValidCardColorPattern(p) {
    return typeof p === 'string' && /^[RB_]{4}$/.test(p);
}
function cardColorPatternMatches(pattern, colorStr) {
    if (!pattern || !colorStr || pattern.length !== 4 || colorStr.length !== 4) return false;
    for (let i = 0; i < 4; i++) {
        if (pattern[i] !== '_' && pattern[i] !== colorStr[i]) return false;
    }
    return true;
}

function loadCardColorPatternsSelected() {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    try {
        const v = window.localStorage.getItem(CARD_COLOR_PATTERNS_STORAGE_KEY);
        if (!v) return [];
        const parsed = JSON.parse(v);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(isValidCardColorPattern);
    } catch (e) {
        return [];
    }
}

let CARD_COLOR_PATTERNS_SELECTED = loadCardColorPatternsSelected();

function persistCardColorPatternsSelected(list) {
    const sanitized = Array.isArray(list)
        ? list.filter(isValidCardColorPattern)
        : [];
    CARD_COLOR_PATTERNS_SELECTED = sanitized;
    if (typeof window !== 'undefined') {
        window.__cardColorPatternsSelected = CARD_COLOR_PATTERNS_SELECTED.slice();
        try {
            if (window.localStorage) {
                window.localStorage.setItem(
                    CARD_COLOR_PATTERNS_STORAGE_KEY,
                    JSON.stringify(CARD_COLOR_PATTERNS_SELECTED)
                );
            }
        } catch (e) {
            console.warn('Failed to persist card color patterns:', e);
        }
    }
    return CARD_COLOR_PATTERNS_SELECTED.slice();
}

const CARD_COLOR_RANGE_RULES_STORAGE_KEY = 'card_color_range_rules';

function _normalizeRangeRule(r) {
    if (!r.patterns && r.pattern) return { from: r.from, to: r.to, patterns: [r.pattern] };
    return r;
}
function _isValidRangeRule(r) {
    return Number.isInteger(r.from) && Number.isInteger(r.to) &&
        r.from >= 1 && r.to >= r.from &&
        Array.isArray(r.patterns) &&
        r.patterns.every(isValidCardColorPattern); // 空陣列 = 隨機(不檢查)
}

function loadCardColorRangeRules() {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    try {
        const v = window.localStorage.getItem(CARD_COLOR_RANGE_RULES_STORAGE_KEY);
        if (!v) return [];
        const parsed = JSON.parse(v);
        if (!Array.isArray(parsed)) return [];
        return parsed.map(_normalizeRangeRule).filter(_isValidRangeRule);
    } catch (e) { return []; }
}

let CARD_COLOR_RANGE_RULES = loadCardColorRangeRules();

function persistCardColorRangeRules(rules) {
    const sanitized = Array.isArray(rules)
        ? rules.map(_normalizeRangeRule).filter(_isValidRangeRule)
        : [];
    CARD_COLOR_RANGE_RULES = sanitized;
    if (typeof window !== 'undefined') {
        window.__cardColorRangeRules = CARD_COLOR_RANGE_RULES.slice();
        try {
            if (window.localStorage) {
                window.localStorage.setItem(CARD_COLOR_RANGE_RULES_STORAGE_KEY, JSON.stringify(CARD_COLOR_RANGE_RULES));
            }
        } catch (e) {}
    }
    return CARD_COLOR_RANGE_RULES.slice();
}

function getCardColorPatternsForRound(ridx) {
    const roundNum = ridx + 1;
    const rule = CARD_COLOR_RANGE_RULES.find(r => roundNum >= r.from && roundNum <= r.to);
    if (!rule) return getCardColorPatterns();
    if (rule.patterns.length === 0) return getCardColorPatterns(); // 隨機：同全域預設
    return rule.patterns.map(s => s.split(''));
}

function getValidCardColorStringsForRound(ridx) {
    const roundNum = ridx + 1;
    const rule = CARD_COLOR_RANGE_RULES.find(r => roundNum >= r.from && roundNum <= r.to);
    if (!rule) return getValidCardColorStrings();
    if (rule.patterns.length === 0) return null; // null = 跳過驗證
    return rule.patterns.slice();
}

function getCardColorPatterns() {
    if (CARD_COLOR_PATTERNS_SELECTED && CARD_COLOR_PATTERNS_SELECTED.length > 0) {
        return CARD_COLOR_PATTERNS_SELECTED.map(s => s.split(''));
    }
    const base = [['B', 'B', 'B', 'R'], ['R', 'R', 'R', 'B']];
    if (!CARD_COLOR_MIXED_MODE) return base;
    return base.concat([['B', 'B', 'R', 'R'], ['R', 'R', 'B', 'B']]);
}

function getValidCardColorStrings() {
    if (CARD_COLOR_PATTERNS_SELECTED && CARD_COLOR_PATTERNS_SELECTED.length > 0) {
        return CARD_COLOR_PATTERNS_SELECTED.slice();
    }
    return CARD_COLOR_MIXED_MODE
        ? ['BBBR', 'RRRB', 'BBRR', 'RRBB']
        : ['BBBR', 'RRRB'];
}
const SUIT_SYMBOL_TO_LETTER_MAP = { '♠': 'S', '♥': 'H', '♦': 'D', '♣': 'C', 'S': 'S', 'H': 'H', 'D': 'D', 'C': 'C' };
const SUIT_LETTER_TO_SYMBOL_MAP = { S: '♠', H: '♥', D: '♦', C: '♣' };
const SIGNAL_RANKS_ORDER = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SIGNAL_SUITS_ORDER = ['S', 'H', 'D', 'C'];
const MULTI_PASS_MIN_CARDS = 6;

// 將設定值過濾為允許的內容
function sanitizeConfigArray(values, allowed) {
    if (!Array.isArray(values)) return [];
    const allowSet = new Set(allowed);
    return values.filter(value => allowSet.has(value));
}

// 將傳入設定整理為合法花色/數字
function sanitizeSignalConfig(config) {
    if (!config || typeof config !== 'object') return { suits: [], ranks: [] };
    const suits = sanitizeConfigArray(config.suits, VALID_SUITS);
    const ranks = sanitizeConfigArray(config.ranks, VALID_RANKS);
    return { suits, ranks };
}

// 從 localStorage 讀取先前儲存的訊號設定
function loadInitialSignalConfig() {
    if (typeof window === 'undefined' || !window.localStorage) {
        return { ...SIGNAL_DEFAULT_CONFIG };
    }
    try {
        const stored = window.localStorage.getItem(SIGNAL_STORAGE_KEY);
        if (!stored) return { ...SIGNAL_DEFAULT_CONFIG };
        const parsed = JSON.parse(stored);
        // 舊模式遷移：♥♦ × 10,J,Q,K → 強制使用新預設 ♠♥♦♣ × A,2
        const isLegacyConfig = (
            Array.isArray(parsed.suits) &&
            parsed.suits.length === 2 &&
            parsed.suits.includes('♥') && parsed.suits.includes('♦') &&
            Array.isArray(parsed.ranks) &&
            parsed.ranks.some(r => ['10','J','Q','K','T'].includes(r))
        );
        if (isLegacyConfig) {
            window.localStorage.removeItem(SIGNAL_STORAGE_KEY);
            return { ...SIGNAL_DEFAULT_CONFIG };
        }
        const sanitized = sanitizeSignalConfig(parsed);
        return {
            suits: sanitized.suits,
            ranks: sanitized.ranks
        };
    } catch (error) {
        console.warn('Failed to load saved signal config:', error);
        return { ...SIGNAL_DEFAULT_CONFIG };
    }
}

const initialSignalConfig = loadInitialSignalConfig();
let SIGNAL_CONFIG = {
    suits: Array.isArray(initialSignalConfig.suits) ? initialSignalConfig.suits.slice() : [],
    ranks: Array.isArray(initialSignalConfig.ranks) ? initialSignalConfig.ranks.slice() : []
};

// 儲存訊號設定到記憶體與 localStorage
function persistSignalConfig(config) {
    const sanitized = sanitizeSignalConfig(config);
    SIGNAL_CONFIG.suits = sanitized.suits.slice();
    SIGNAL_CONFIG.ranks = sanitized.ranks.slice();
    if (typeof window !== 'undefined') {
        window.__signalConfig = {
            suits: sanitized.suits.slice(),
            ranks: sanitized.ranks.slice()
        };
        try {
            if (window.localStorage) {
                window.localStorage.setItem(SIGNAL_STORAGE_KEY, JSON.stringify(window.__signalConfig));
            }
        } catch (error) {
            console.warn('Failed to persist signal config:', error);
        }
    }
    return {
        suits: SIGNAL_CONFIG.suits.slice(),
        ranks: SIGNAL_CONFIG.ranks.slice()
    };
}

persistSignalConfig(SIGNAL_CONFIG);
// === 標準化的 round 建構函式(來自主程式,保留敏感局資訊)
// 建立包含段別、敏感與卡片明細的 round 物件
function makeRoundInfo(start, cards, result, sensitive) {
    return {
        start_index: start,
        cards: cards,
        result: result,
        sensitive: sensitive,
        segment: null,
        // 提供即時計算花色統計的 getter
        get suit_counts() {
            const counts = new Map();
            for (const card of this.cards) {
                const key = card && card.suit ? card.suit : '未知';
                counts.set(key, (counts.get(key) || 0) + 1);
            }
            return counts;
        },
        // 方便取得本局總張數
        get card_count() {
            return Array.isArray(this.cards) ? this.cards.length : 0;
        }
    };
}


class Card {
    constructor(rank, suit, pos) {
        this.rank = rank;
        this.suit = suit;
        this.pos = pos;
    }

    point() {
        const values = { 'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 0, 'J': 0, 'Q': 0, 'K': 0 };
        return values[this.rank];
    }

    // 新增一個方法來取得路單顯示值 (T, J, Q, K 顯示為 0)
    roadRank() {
        if (['10', 'J', 'Q', 'K'].includes(this.rank)) {
            return '0';
        }
        return this.rank;
    }

    clone() {
        return new Card(this.rank, this.suit, this.pos);
    }

    short() {
        const face = this.rank === '10' ? 'T' : this.rank;
        return `${face}${this.suit}`;
    }

    isZero() {
        return this.point() === 0;
    }

    isSignalCard() {
        const hasSuits = Array.isArray(SIGNAL_CONFIG.suits) && SIGNAL_CONFIG.suits.length > 0;
        const hasRanks = Array.isArray(SIGNAL_CONFIG.ranks) && SIGNAL_CONFIG.ranks.length > 0;
        if (!hasSuits || !hasRanks) return false;
        const suitMatch = SIGNAL_CONFIG.suits.includes(this.suit);
        const rankMatch = SIGNAL_CONFIG.ranks.includes(this.rank);
        return suitMatch && rankMatch;
    }

    clone(newPos = this.pos) {
        const copy = new Card(this.rank, this.suit, newPos);
        if (this.back_color) copy.back_color = this.back_color;
        if (this.color) copy.color = this.color;
        if (this.isTraverseCard) copy.isTraverseCard = true;
        return copy;
    }
}

class Simulator {
    constructor(deck) {
        this.deck = deck;
    }

    simulate_round(start, options = {}) {
        const no_swap = options.no_swap || false;
        const d = this.deck;
        let idx = start;

        if (idx + 3 >= d.length) return null;

        // 前四張牌
        const p1 = d[idx++].point();
        const b1 = d[idx++].point();
        const p2 = d[idx++].point();
        const b2 = d[idx++].point();

        let p_tot = (p1 + p2) % 10;
        let b_tot = (b1 + b2) % 10;

        const natural = (p_tot >= 8 || b_tot >= 8);

        const draw = () => {
            if (idx >= d.length) return false;
            idx++;
            return true;
        };

        // ...
        // 補牌邏輯
        if (!natural) {
            if (p_tot <= 5) { // 閒家補牌
                if (!draw()) return null;
                const pt = d[idx - 1].point(); // 取得閒家第三張牌點數
                p_tot = (p_tot + pt) % 10;    // 更新閒家總點數

                let banker_draws = false; // 判斷莊家是否需要補牌
                if (b_tot <= 2) {
                    banker_draws = true;
                } else if (b_tot === 3 && pt !== 8) {
                    banker_draws = true;
                } else if (b_tot === 4 && [2, 3, 4, 5, 6, 7].includes(pt)) {
                    banker_draws = true;
                } else if (b_tot === 5 && [4, 5, 6, 7].includes(pt)) {
                    banker_draws = true;
                } else if (b_tot === 6 && [6, 7].includes(pt)) {
                    banker_draws = true;
                }

                if (banker_draws) {
                    if (!draw()) return null; // 莊家補牌
                    const bt = d[idx - 1].point(); // 【修正】取得莊家第三張牌點數
                    b_tot = (b_tot + bt) % 10;     // 【修正】更新莊家總點數
                }
            } else if (b_tot <= 5) { // 閒家不補牌，莊家補牌
                if (!draw()) return null;
                const bt = d[idx - 1].point(); // 【修正】取得莊家第三張牌點數
                b_tot = (b_tot + bt) % 10;     // 【修正】更新莊家總點數
            }
        }


        const res = (p_tot === b_tot) ? '和' : ((p_tot > b_tot) ? '閒' : '莊');
        const used = d.slice(start, idx);

        if (no_swap) {
            return {
                start_index: start,
                cards: used,
                result: res,
                sensitive: false
            };
        }

        // 檢查敏感性
        const swapInfo = this._swap_result(start);
        const swap_res = swapInfo.result;
        const swap_len = Array.isArray(swapInfo.cards) ? swapInfo.cards.length : 0;
        // 敏感規則：
        // - 和局：一律不算敏感（B 段不收和局）
        // - 莊/閒→對方：算敏感（換後不可為和，且用牌數相同）
        let sensitive = false;
        if (res !== '和') {
            sensitive = (
                swap_res !== null &&
                swap_res !== res &&
                swap_res !== '和' &&
                swap_len === used.length
            );
        }

        return {
            start_index: start,
            cards: used,
            result: res,
            sensitive: sensitive,
            swap_info: swapInfo
        };
    }

    _swap_result(start) {
        let d2 = [...this.deck];
        if (start + 1 >= d2.length) return { result: null, cards: [] };

        // 交換第1、2張牌
        [d2[start], d2[start + 1]] = [d2[start + 1], d2[start]];

        const sim2 = new Simulator(d2);
        const r2 = sim2.simulate_round(start, { no_swap: true });
        if (!r2) return { result: null, cards: [] };

        return {
            result: r2.result,
            cards: Array.isArray(r2.cards) ? r2.cards.slice() : []
        };
    }
}

// 對陣列就地洗牌（Fisher–Yates）
function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

// 建立 8 副牌組並隨機洗勻，包含顏色標記
function build_shuffled_deck() {
    const suits = ['♠', '♥', '♦', '♣'];
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const baseR = [];
    const baseB = [];

    for (const s of suits) {
        for (const r of ranks) {
            baseR.push(new Card(r, s, -1));
            baseB.push(new Card(r, s, -1));
        }
    }

    let deck = [];
    for (let i = 0; i < 4; i++) {
        deck.push(...baseR.map(c => {
            const card = new Card(c.rank, c.suit, -1);
            card.back_color = 'R';
            return card;
        }));
        deck.push(...baseB.map(c => {
            const card = new Card(c.rank, c.suit, -1);
            card.back_color = 'B';
            return card;
        }));
    }

    shuffle(deck);
    deck.forEach((c, i) => c.pos = i);
    return deck;
}

// 檢查禁止的第三張牌組合
// - 莊家初始 3 點且閒家第三張為 8
// - 莊家初始 6 點且閒家第三張為 6 或 7
function isBannedThirdCardPatternOnCards(cards) {
    if (!Array.isArray(cards) || cards.length < 5) return false;
    const getPoint = (card) => (card && typeof card.point === 'function') ? card.point() : null;
    const p1p = getPoint(cards[0]);
    const b1p = getPoint(cards[1]);
    const p2p = getPoint(cards[2]);
    const b2p = getPoint(cards[3]);
    const p3p = getPoint(cards[4]); // 閒家第三張
    if ([p1p, b1p, p2p, b2p, p3p].some(v => v === null)) return false;
    const p_tot = (p1p + p2p) % 10;
    const b_tot = (b1p + b2p) % 10;
    const natural = (p_tot >= 8 || b_tot >= 8);
    if (natural) return false;
    if (b_tot === 3 && p3p === 8) return true;
    if (b_tot === 6 && (p3p === 6 || p3p === 7)) return true;
    return false;
}

function isBannedThirdCardPattern(round) {
    if (!round || !Array.isArray(round.cards)) return false;
    return isBannedThirdCardPatternOnCards(round.cards);
}

// 判斷敏感局是否因莊家6點違規而需要跳過
function shouldSkipSensitiveRound(round) {
    // 「避開莊6點贏」勾選時，連 B6 局（對調後莊6贏）也一併排除
    const skipBanker6El = document.getElementById('skipBanker6');
    const skipBanker6 = skipBanker6El ? skipBanker6El.checked : false;
    if (skipBanker6 && Array.isArray(round.cards) && round.cards.length >= 4) {
        const tmp = round.cards.map(c => c.clone());
        [tmp[0], tmp[1]] = [tmp[1], tmp[0]];
        const swappedInfo = computeRoundHands(tmp);
        if (swappedInfo && swappedInfo.bankerTotal === 6 && swappedInfo.playerTotal <= 5) {
            return true;
        }
    }

    return false;
}

// 掃描所有敏感局，會在這裡就先略過違規局
function scan_all_sensitive_rounds(sim) {
    const out = [];
    const last = sim.deck.length - 1;

    for (let i = 0; i < last; i++) {
        const r = sim.simulate_round(i);
        if (r && r.sensitive) {
            const handInfo = computeRoundHands(r.cards || []);
            if (r.result === '莊' && handInfo.bankerTotal === 6) {
                const totalUsed = (handInfo.playerCards?.length || 0) + (handInfo.bankerCards?.length || 0);
                log(`🔍 掃到敏感莊6點: 用牌數=${r.cards?.length ?? 0}, 實際共用=${totalUsed}`, 'info');
            }
            if (shouldSkipSensitiveRound(r)) continue;
            out.push(r);
        }
    }

    return out;
}

// 計算S局索引
// 計算每個段別中符合 S 局定義的索引
function compute_sidx_for_segment(rounds, segment = 'A') {
    const S = [];
    for (let i = 0; i < rounds.length - 1; i++) {
        if (rounds[i].segment === segment && rounds[i + 1].result === '莊') {
            S.push(i);
        }
    }
    // 額外檢查最後一局是否能成為S局(下一局是第一局)
    if (rounds.length > 1 && rounds[rounds.length - 1].segment === segment && rounds[0].result === '莊') {
        S.push(rounds.length - 1);
    }
    return S;
}

// 將所有局的牌攤平成單一陣列
function flattenDeckFromRounds(rounds) {
    const deck = [];
    if (!Array.isArray(rounds)) return deck;
    rounds.forEach(round => {
        if (round && Array.isArray(round.cards)) {
            deck.push(...round.cards);
        }
    });
    return deck;
}

// 把卡片轉為顯示用文字（例如: rank+suit 或 short）
function getCardLabel(card) {
    if (!card) return '';
    if (typeof card.short === 'function') return card.short();
    if (typeof card.label === 'string') return card.label;
    // 根據使用者要求，在原始數據中也使用 roadRank 點數，但保留花色
    const rank = card.roadRank();
    return `${rank}${card.suit}`;
    const suit = card.suit || '';
    return `${rank}${suit}`;
}

// 根據花色推斷卡片的顏色編碼（紅/藍）
function getCardColorCode(card) {
    if (!card) return '';
    if (card.back_color) return card.back_color;
    const suitLetter = suitLetterFromSymbol(card.suit);
    if (!suitLetter) return '';
    return (suitLetter === 'H' || suitLetter === 'D') ? 'R' : 'B';
}

// 依據牌卡資料決定格子要顯示哪些文字（A→1、10/J/Q/K→0）
function gridValueFromCard(card) {
    if (!card) return '';
    const rank = (card.rank || '').toString().toUpperCase();
    if (!rank) return '';
    if (rank === 'A') return '1';
    if (['10', 'J', 'Q', 'K'].includes(rank)) return '0';
    const parsed = parseInt(rank, 10);
    if (!Number.isNaN(parsed)) return String(parsed);
    return rank;
}

// 判斷手上的牌是否屬於目前設定的訊號牌
function isSignalConfiguredCard(card) {
    if (!card) return false;
    const suits = Array.isArray(SIGNAL_CONFIG?.suits) ? SIGNAL_CONFIG.suits : [];
    const ranks = Array.isArray(SIGNAL_CONFIG?.ranks) ? SIGNAL_CONFIG.ranks : [];
    if (!suits.length || !ranks.length) return false;
    return suits.includes(card.suit) && ranks.includes(card.rank);
}

/**
 * 對外提供分析能力,供主頁面傳入牌局資料時使用
 * @param {Array} sourceRounds - 來自主頁面的牌局資料
 * @param {Object} [options] - 設定紅0訊號所使用的花色與數字
 * @param {Array<string>} [options.suits]
 * @param {Array<string>} [options.ranks]
 * @param {Function} [statusCallback] - 供主頁面顯示進度用
 * @returns {{ final_rounds: Array, analysis: Object }}
 */
function analyze_external_rounds(sourceRounds, options = {}, statusCallback) {
    const suits = Array.isArray(options.suits) ? options.suits.slice() : SIGNAL_CONFIG.suits.slice();
    const ranks = Array.isArray(options.ranks) ? options.ranks.slice() : SIGNAL_CONFIG.ranks.slice();

    SIGNAL_CONFIG.suits = suits;
    SIGNAL_CONFIG.ranks = ranks;

    const rounds = Array.isArray(sourceRounds) ? sourceRounds.map((round, idx) => {
        const clonedRound = Object.assign({}, round);
        const startIndex = typeof round.start_index === 'number' ? round.start_index : idx * 4;

        clonedRound.cards = Array.isArray(round.cards)
            ? round.cards.map((card, cardIdx) => {
                if (!card) return card;
                if (card instanceof Card) {
                    return card.clone();
                }
                const pos = typeof card.pos === 'number' ? card.pos : startIndex + cardIdx;
                const newCard = new Card(card.rank, card.suit, pos);
                Object.keys(card).forEach((key) => {
                    if (key === 'rank' || key === 'suit' || key === 'pos') return;
                    newCard[key] = card[key];
                });
                return newCard;
            })
            : [];

        return clonedRound;
    }) : [];

    if (typeof statusCallback === 'function') {
        statusCallback(`紅0 模式:開始分析 ${rounds.length} 局資料...`);
    }

    const analysis = analyze_signal_cards(rounds);

    if (typeof statusCallback === 'function') {
        statusCallback(`完成分析,調整 ${analysis.adjustments_made} 局。`);
    }

    return {
        final_rounds: rounds,
        analysis
    };
}

// 模擬交換前兩張牌的結果
// 檢查原始牌型是否能完成遊戲（不進行對調，檢查是否需要補牌但牌數不足）
function canCompleteGame(round) {
    if (!round.cards || round.cards.length < 4) return false;

    try {
        const p1 = round.cards[0].point();
        const b1 = round.cards[1].point();
        const p2 = round.cards[2].point();
        const b2 = round.cards[3].point();

        let p_tot = (p1 + p2) % 10;
        let b_tot = (b1 + b2) % 10;

        const natural = (p_tot >= 8 || b_tot >= 8);

        if (!natural) {
            // 檢查是否需要補牌（需要第 5 張或第 6 張）
            if (p_tot <= 5) {
                // 閒家需要補牌，檢查是否有第 5 張牌
                if (round.cards.length < 5) {
                    return false; // 無法補牌
                }
                const pt = round.cards[4].point();
                p_tot = (p_tot + pt) % 10;

                // 檢查莊家是否需要補牌
                let banker_draws = false;
                if (b_tot <= 2) {
                    banker_draws = true;
                } else if (b_tot === 3 && pt !== 8) {
                    banker_draws = true;
                } else if (b_tot === 4 && [2, 3, 4, 5, 6, 7].includes(pt)) {
                    banker_draws = true;
                } else if (b_tot === 5 && [4, 5, 6, 7].includes(pt)) {
                    banker_draws = true;
                } else if (b_tot === 6 && [6, 7].includes(pt)) {
                    banker_draws = true;
                }

                if (banker_draws && round.cards.length < 6) {
                    return false; // 莊家需要補牌但無第 6 張牌
                }
            } else if (b_tot <= 5) {
                // 閒家不補牌，莊家補牌
                if (round.cards.length < 5) {
                    return false; // 無法補牌
                }
            }
        }

        return true; // 能完成遊戲
    } catch (e) {
        return false;
    }
}

function swapFirstTwoCards(round) {
    if (!round?.cards || round.cards.length < 4) return null;
    const originalUsedCount = round.cards.length;

    // 創建副本進行模擬
    const temp_cards = round.cards.map(c => (c && typeof c.clone === 'function') ? c.clone() : c);
    [temp_cards[0], temp_cards[1]] = [temp_cards[1], temp_cards[0]];
    if (temp_cards.slice(0, 4).some(c => !c || typeof c.point !== 'function')) return null;

    // 手動計算對調後的點數（不依賴 Simulator，避免補牌邏輯導致的 null 返回）
    try {
        const p1 = temp_cards[0].point();
        const b1 = temp_cards[1].point();
        const p2 = temp_cards[2].point();
        const b2 = temp_cards[3].point();

        let p_tot = (p1 + p2) % 10;
        let b_tot = (b1 + b2) % 10;

        const natural = (p_tot >= 8 || b_tot >= 8);

        let usedAfterSwap = 4;
        if (!natural) {
            // 檢查是否需要補牌（需要第 5 張或第 6 張）
            if (p_tot <= 5) {
                // 閒家需要補牌，檢查是否有第 5 張牌
                if (temp_cards.length < 5) {
                    return null; // 無法補牌
                }
                usedAfterSwap = 5;
                const pt = temp_cards[4].point();
                p_tot = (p_tot + pt) % 10;

                // 檢查莊家是否需要補牌
                let banker_draws = false;
                if (b_tot <= 2) {
                    banker_draws = true;
                } else if (b_tot === 3 && pt !== 8) {
                    banker_draws = true;
                } else if (b_tot === 4 && [2, 3, 4, 5, 6, 7].includes(pt)) {
                    banker_draws = true;
                } else if (b_tot === 5 && [4, 5, 6, 7].includes(pt)) {
                    banker_draws = true;
                } else if (b_tot === 6 && [6, 7].includes(pt)) {
                    banker_draws = true;
                }

                if (banker_draws && temp_cards.length < 6) {
                    return null; // 莊家需要補牌但無第 6 張牌
                }

                if (banker_draws) {
                    usedAfterSwap = 6;
                    const bt = temp_cards[5].point();
                    b_tot = (b_tot + bt) % 10;
                }
            } else if (b_tot <= 5) {
                // 閒家不補牌，莊家補牌
                if (temp_cards.length < 5) {
                    return null; // 無法補牌
                }
                usedAfterSwap = 5;
                const bt = temp_cards[4].point();
                b_tot = (b_tot + bt) % 10;
            }
        }

        // 若對調後「實際用牌張數」改變，視為無法對調（避免把 6 張局對調成只用 5 張的情況）
        if (usedAfterSwap !== originalUsedCount) {
            return null;
        }

        const result = (p_tot === b_tot) ? '和' : ((p_tot > b_tot) ? '閒' : '莊');
        return result;
    } catch (e) {
        return null;
    }
}

// 執行實際的卡牌交換
function executeCardSwap(round) {
    if (!round.cards || round.cards.length < 2) return;
    [round.cards[0], round.cards[1]] = [round.cards[1], round.cards[0]];
}

// 日誌系統
const LOG_ALLOW_PATTERNS = [
    /^訊號牌測試系統初始化完成/,
    /^訊號設定已更新/,
    // 僅顯示關鍵檢測/結果，避免過多前置檢測細節刷屏
    /^\s*🔍 (檢測到|✅|✗|⚠️)/,
    /^\s*⚙️/,
    /^\s*🔁/,
    /^第\s*\d+\s*局(?!\(非S\))/, // 例如：自動重排、結果提示（排除非S訊號提示）
    /^生成完成!?$/,
    /^卡色交換成功/,
    /^卡色交換失敗/
];

// [UI 函數已移至 signals_ui.js: shouldDisplayLogMessage, log]

// [UI 函數已移至 signals_ui.js: updateStats, updateResultCircle, formatHandDisplay, computeRoundHands]

// [UI 函數已移至 signals_ui.js: recomputeRoundOutcome, computeRoundUsedCardCount]

function isRoundAutoReorderNeeded(round) {
    if (!round || !Array.isArray(round.cards)) return false;
    if (round.cards.length < 4) return false;
    const usedCount = computeRoundUsedCardCount(round.cards);
    const totalCount = round.cards.length;
    if (usedCount !== totalCount) return true; // 藍底：用牌張數不符
    if (!canCompleteGame(round)) return true; // 原局就無法完整發牌
    const trueResult = (() => {
        const handInfo = computeRoundHands(round.cards);
        const p = handInfo.playerTotal;
        const b = handInfo.bankerTotal;
        if (typeof p !== 'number' || typeof b !== 'number') return null;
        if (p === b) return '和';
        return (p > b) ? '閒' : '莊';
    })();
    const swapped = swapFirstTwoCards(round);
    if (swapped === null) return true; // 調：無法對調
    if (trueResult && swapped === trueResult) return true; // 可對調但不改輸贏（非敏感局）
    return false;
}

function findValidDealOrderForCards(cards, options = {}) {
    if (!Array.isArray(cards)) return null;
    const n = cards.length;
    if (n < 4 || n > 6) return null;

    const requireSwap = Object.prototype.hasOwnProperty.call(options, 'requireSwap')
        ? Boolean(options.requireSwap)
        : true;
    const requireSensitive = Object.prototype.hasOwnProperty.call(options, 'requireSensitive')
        ? Boolean(options.requireSensitive)
        : false;
    const preserveResult = Object.prototype.hasOwnProperty.call(options, 'preserveResult')
        ? options.preserveResult
        : null;
    const requireValidColor = Object.prototype.hasOwnProperty.call(options, 'requireValidColor')
        ? Boolean(options.requireValidColor)
        : false;

    const used = new Array(n).fill(false);
    const perm = new Array(n);
    let found = null;

    const calcResultFromCards = (ordered) => {
        const handInfo = computeRoundHands(ordered);
        const p = handInfo.playerTotal;
        const b = handInfo.bankerTotal;
        if (typeof p !== 'number' || typeof b !== 'number') return null;
        if (p === b) return '和';
        return (p > b) ? '閒' : '莊';
    };

    const backtrack = (depth) => {
        if (found) return;
        if (depth === n) {
            const ordered = perm.slice();
            if (baccarat_getExpectedCardCount(ordered) !== n) return;
            if (computeRoundUsedCardCount(ordered) !== n) return;
            const result = calcResultFromCards(ordered);
            if (!result) return;
            if (preserveResult && result !== preserveResult) return;
            const swapped = swapFirstTwoCards({ cards: ordered });
            if (requireSwap && swapped === null) return;
            if (requireSensitive) {
                const isTiePair = (result === '和' && swapped === '和');
                if (!isTiePair) {
                    if (swapped === null) return;
                    if (swapped === result) return;
                    if (swapped === '和' || result === '和') return;
                    if (swapped !== '莊' && swapped !== '閒') return;
                    if (result !== '莊' && result !== '閒') return;
                }
            }
            if (requireValidColor) {
                const colors4 = ordered.slice(0, 4).map(c => (c && c.back_color) ? c.back_color : '?').join('');
                if (colors4 !== 'RRRB' && colors4 !== 'BBBR') return;
            }
            found = ordered;
            return;
        }

        for (let i = 0; i < n; i++) {
            if (found) return;
            if (used[i]) continue;
            const card = cards[i];
            if (!card || typeof card.point !== 'function') continue;
            used[i] = true;
            perm[depth] = card;
            backtrack(depth + 1);
            used[i] = false;
        }
    };

    backtrack(0);
    return found;
}

function findQualifiedSensitiveOrder(cards, options = {}) {
    if (!Array.isArray(cards) || cards.length < 4 || cards.length > 6) return null;

    const preserveResult = Object.prototype.hasOwnProperty.call(options, 'preserveResult')
        ? options.preserveResult
        : null;
    const requireValidColor = Object.prototype.hasOwnProperty.call(options, 'requireValidColor')
        ? Boolean(options.requireValidColor)
        : false;

    const ordered = findValidDealOrderForCards(cards, {
        requireSwap: true,
        requireSensitive: true,
        requireValidColor,
        preserveResult
    });

    if (!ordered) return null;

    const clonedOrdered = ordered.map((card, idx) => {
        if (card && typeof card.clone === 'function') return card.clone(idx);
        if (typeof Card !== 'undefined' && card) {
            const cloned = new Card(card.rank, card.suit, idx);
            if (card.back_color) cloned.back_color = card.back_color;
            if (card.color) cloned.color = card.color;
            return cloned;
        }
        return { ...card, pos: idx };
    });

    const sim = new Simulator(clonedOrdered);
    const simulatedRound = sim.simulate_round(0);
    if (!simulatedRound || !simulatedRound.sensitive) return null;
    if (typeof shouldSkipSensitiveRound === 'function' && shouldSkipSensitiveRound(simulatedRound)) {
        return null;
    }

    return {
        ordered,
        result: simulatedRound.result,
        swap_info: simulatedRound.swap_info || null
    };
}

function tryReorderRoundToClearMismatch(roundNumberOrIndex, options = {}) {
    if (!Array.isArray(currentRounds) || currentRounds.length === 0) return false;
    const raw = Number(roundNumberOrIndex);
    if (!Number.isFinite(raw)) return false;

    const idx = (raw >= 1) ? (raw - 1) : raw;
    if (idx < 0 || idx >= currentRounds.length) return false;

    const round = currentRounds[idx];
    if (!round || !Array.isArray(round.cards)) return false;
    if (round.cards.length < 4 || round.cards.length > 6) return false;

    const trueResult = (() => {
        const handInfo = computeRoundHands(round.cards);
        const p = handInfo.playerTotal;
        const b = handInfo.bankerTotal;
        if (typeof p !== 'number' || typeof b !== 'number') return null;
        if (p === b) return '和';
        return (p > b) ? '閒' : '莊';
    })();

    const total = round.cards.length;
    const used = computeRoundUsedCardCount(round.cards);
    const preserveResult = Object.prototype.hasOwnProperty.call(options, 'preserveResult')
        ? options.preserveResult
        : trueResult;
    const requireSwap = Object.prototype.hasOwnProperty.call(options, 'requireSwap')
        ? Boolean(options.requireSwap)
        : true;
    const requireSensitive = Object.prototype.hasOwnProperty.call(options, 'requireSensitive')
        ? Boolean(options.requireSensitive)
        : true;
    const mutate = Object.prototype.hasOwnProperty.call(options, 'mutate')
        ? Boolean(options.mutate)
        : true; // 預設為 true（會修改）

    // 若原本用牌張數正常且可對調：
    // - 未要求敏感局：直接視為 OK
    // - 已要求敏感局：若對調不改輸贏，仍允許重排去找「可對調且會改輸贏」的排列
    if (used === total) {
        const swapped = swapFirstTwoCards(round);
        if (swapped !== null) {
            if (!requireSensitive) return true;
            if (trueResult && swapped !== trueResult) return true;
        }
    }

    let ordered = findValidDealOrderForCards(round.cards, { requireSwap, preserveResult, requireSensitive });
    // 預設會盡量保留原本輸贏；若找不到，再放寬允許改變輸贏（除非使用者明確指定 preserveResult）
    if (!ordered && !Object.prototype.hasOwnProperty.call(options, 'preserveResult')) {
        ordered = findValidDealOrderForCards(round.cards, { requireSwap, preserveResult: null, requireSensitive });
    }
    if (!ordered) return false;

    // 如果 mutate 為 false，只返回是否可行，不實際修改
    if (!mutate) {
        return true;
    }

    // 執行實際修改
    round.cards = ordered;
    recomputeRoundOutcome(round);
    if (requireSensitive) {
        const swapped = swapFirstTwoCards(round);
        round.sensitive = (swapped !== null && swapped !== round.result);
    }
    if (typeof refreshAnalysisAndRender === 'function') refreshAnalysisAndRender({ mutate: false });
    return true;
}

if (typeof window !== 'undefined') {
    if (typeof window.tryReorderRoundToClearMismatch !== 'function') {
        window.tryReorderRoundToClearMismatch = tryReorderRoundToClearMismatch;
    }
}

// ==================================================================
// === 請用這個新版本,替換掉您 signals.js 裡的舊版本 ===
// ==================================================================
const ROUNDS_TABLE_COLUMNS = [
    { key: 'index', label: '局', cellClass: 'minor-column' },
    { key: 'cards', label: '卡牌', headerClass: 'cards-column', cellClass: 'cards-column' },
    { key: 'colors', label: '卡色', headerClass: 'color-column', cellClass: 'color-column' },
    { key: 'result', label: '結', cellClass: 'result-cell' },
    { key: 'playerCards', label: '閒家', cellClass: 'hand-card-cell' },
    { key: 'bankerCards', label: '莊家', cellClass: 'hand-card-cell' },
    { key: 'playerPoints', label: '閒', cellClass: 'hand-point-cell minor-column' },
    { key: 'bankerPoints', label: '莊', cellClass: 'hand-point-cell minor-column' },
    { key: 'swapPreview', label: '調', cellClass: 'compare-cell' }
];

// 將結果文字統一為標準的「莊/閒/和」
// [UI 函數已移至 signals_ui.js: normalizeOutcome, outcomeClass, renderRoundsTableHeader, renderRoundsTable, applyViolationHighlights]


// 全域變數
let currentRounds = null;
let currentAnalysis = null;
const EDIT_STATE = { mode: 'none', first: null, second: null };
let editEnabled = false;
let violationRoundIndexes = new Set();
let swapBankerSixIndexes = new Set();
let bankerSixIndexes = new Set();
let statsViolationRoundIndexes = new Set();
let cardColorViolationIndexes = new Set();

// [UI 函數已移至 signals_ui.js: cancelPendingAutoRegenerate, setEditButtonsAvailability, updateEditUI, updateSelectionHighlights]

// 將花色符號轉成信號用的單字母
function suitLetterFromSymbol(symbol) {
    if (!symbol) return null;
    return SUIT_SYMBOL_TO_LETTER_MAP[symbol] || SUIT_SYMBOL_TO_LETTER_MAP[symbol.toUpperCase()] || null;
}

// 統計符合條件的訊號牌在所有局中的數量
function countSignalCardsInRounds(rounds, predicate) {
    if (!Array.isArray(rounds) || rounds.length === 0) return 0;
    let total = 0;
    rounds.forEach((round, idx) => {
        if (!round || !Array.isArray(round.cards)) return;
        if (typeof predicate === 'function' && !predicate(round, idx)) return;
        for (const card of round.cards) {
            if (!card) continue;
            if (isSignalCardByConfig(card)) total++;
        }
    });
    return total;
}

/**
 * 判斷一張牌是否依照設定為訊號牌（含 fallback）
 */
/**
 * 判斷一張牌是否為目前訊號設定所定義的訊號牌（優先使用牌物件自身方法）。
 */
function isSignalCardByConfig(card) {
    if (!card) return false;
    if (typeof card.isSignalCard === 'function') {
        return card.isSignalCard();
    }
    const suits = Array.isArray(SIGNAL_CONFIG?.suits) ? SIGNAL_CONFIG.suits : [];
    const ranks = Array.isArray(SIGNAL_CONFIG?.ranks) ? SIGNAL_CONFIG.ranks : [];
    return suits.includes(card.suit) && ranks.includes(card.rank);
}

// 建立牌靴整體統計（勝率、段落、訊號牌數）
// 直接統計各 round.cards 中實際存在的每一張牌（不去重），
// 確保「總張數」等於牌靴實際使用的牌數。
function computeDeckSummary(rounds) {
    if (!Array.isArray(rounds) || rounds.length === 0) return null;
    const byRankSuit = {}; // 花色 + 點數 -> 張數
    const cardsByRankSuit = {}; // 花色 + 點數 -> 實際卡牌陣列,用來計算紅背/藍背
    const suitTotals = {}; // 每個花色的總張數
    let totalCards = 0;
    rounds.forEach(round => {
        (round.cards || []).forEach(card => {
            if (!card) return;
            totalCards++;
            const suitLetter = suitLetterFromSymbol(card.suit);
            const rank = card.rank || null;
            if (!suitLetter || !rank) return;
            const key = `${suitLetter}_${rank}`;
            byRankSuit[key] = (byRankSuit[key] || 0) + 1;
            if (!cardsByRankSuit[key]) cardsByRankSuit[key] = [];
            cardsByRankSuit[key].push(card);
            suitTotals[suitLetter] = (suitTotals[suitLetter] || 0) + 1;
        });
    });
    return {
        by_rank_suit: byRankSuit,
        suit_totals: suitTotals,
        cards_by_rank_suit: cardsByRankSuit,
        total_cards: totalCards
    };
}

// 在右側摘要卡片填入計算後的統計數據
// [UI 函數已移至 signals_ui.js: renderDeckSummary, resetEditState, activateEditMode, handleCardSelection, handleRowSelection, handleTableClick, executeSwapAction]

// 簡化版訊號牌邏輯
// 分析每局訊號牌位置與 S 局統計資料
function analyze_signal_cards(rounds, options = {}) {
    const mutate = options.mutate !== false;
    sLog('使用簡化版邏輯:有訊號牌的局 → 下一局變莊家');

    // 預先計算目前牌靴符合 S 定義的索引集合
    let adjustments = 0;
    let signal_rounds = 0;
    const signalRoundSet = new Set();
    rounds.forEach((round, idx) => {
        if (!round || !Array.isArray(round.cards)) return;
        if (round.cards.some(card => card && isSignalCardByConfig(card))) {
            signalRoundSet.add(idx);
        }
    });

    // 莊6 上限保護：S 局對調可能把某局變成 B6，達上限就不再讓 S 調整新增 B6
    let banker6Skipped = 0;
    const _swapB6El_ = (typeof document !== 'undefined') ? document.getElementById('swapBanker6Target') : null;
    const _swapB6Raw_ = _swapB6El_ ? _swapB6El_.value.trim() : '';
    const swapB6Limit = _swapB6Raw_ !== '' ? parseInt(_swapB6Raw_) : null;

    const isOriginalB6 = (round) => {
        if (!round || !Array.isArray(round.cards) || round.cards.length < 4) return false;
        const info = computeRoundHands(round.cards);
        return !!(info && info.bankerTotal === 6 && info.playerTotal <= 5);
    };
    const countCurrentB6 = () => {
        let n = 0;
        for (const r of rounds) if (isOriginalB6(r)) n++;
        return n;
    };
    const wouldSwapProduceBanker6 = (round) => {
        if (!round || !Array.isArray(round.cards) || round.cards.length < 4) return false;
        const tmp = round.cards.map(c => c.clone());
        [tmp[0], tmp[1]] = [tmp[1], tmp[0]];
        const info = computeRoundHands(tmp);
        const willBeB6 = !!(info && info.bankerTotal === 6 && info.playerTotal <= 5);
        if (!willBeB6) return false;
        // 對調前若已是 B6，對調後仍是 B6，count 不變 → 不擋
        if (isOriginalB6(round)) return false;
        // 達上限就阻擋
        if (swapB6Limit === null) return false;
        return countCurrentB6() >= swapB6Limit;
    };

    for (let i = 0; i < rounds.length - 1; i++) {
        const current_round = rounds[i];
        const next_round = rounds[i + 1];
        if (!current_round.cards) continue;
        // 穿越段保護：當前或下一局屬於穿越段就不動，避免破壞穿越條件
        if ((current_round && current_round.isTraverse) || (next_round && next_round.isTraverse)) {
            sLog(`第${i + 1}/${i + 2}局含穿越段，跳過S局訊號處理`);
            continue;
        }
        const has_signal = current_round.cards.some(card => isSignalCardByConfig(card));
        if (has_signal) {
            signal_rounds++;
            if (next_round.result !== '莊') {
                if (mutate && wouldSwapProduceBanker6(next_round)) {
                    banker6Skipped++;
                    sLog(`第${i + 2}局對調後會產生莊6點贏，跳過調整`);
                    continue;
                }
                adjustments++;
                if (mutate) {
                    const original_result = next_round.result;
                    executeCardSwap(next_round);
                    next_round.result = '莊';
                    next_round.swapped = true;
                    sLog(`第${i + 1}局有紅色0點牌 → 第${i + 2}局:${original_result} → 莊`);
                }
            }
        } else if (next_round.result === '莊') {
            if (mutate && wouldSwapProduceBanker6(next_round)) {
                banker6Skipped++;
                sLog(`第${i + 2}局對調後會產生莊6點贏，跳過調整`);
                continue;
            }
            adjustments++;
            if (mutate) {
                executeCardSwap(next_round);
                next_round.result = '閒';
                next_round.swapped = true;
                sLog(`第${i + 1}局無紅色0點牌 → 第${i + 2}局:莊 → 閒`);
            }
        }
    }

    if (rounds.length > 1) {
        const last_round = rounds[rounds.length - 1];
        const first_round = rounds[0];
        // 穿越段保護：尾首相連時若任一是穿越段就跳過
        if ((last_round && last_round.isTraverse) || (first_round && first_round.isTraverse)) {
            sLog(`尾首相連含穿越段，跳過S局訊號處理`);
        } else if (last_round.cards) {
            const has_signal_in_last = last_round.cards.some(card => isSignalCardByConfig(card));
            if (has_signal_in_last) {
                signal_rounds++;
                if (first_round.result !== '莊') {
                    if (mutate && wouldSwapProduceBanker6(first_round)) {
                        banker6Skipped++;
                        sLog(`第1局對調後會產生莊6點贏，跳過調整`);
                    } else {
                        adjustments++;
                        if (mutate) {
                            const original_result = first_round.result;
                            executeCardSwap(first_round);
                            first_round.result = '莊';
                            first_round.swapped = true;
                            sLog(`第${rounds.length}局有紅色0點牌 → 第1局:${original_result} → 莊`);
                        }
                    }
                }
            } else if (first_round.result === '莊') {
                if (mutate && wouldSwapProduceBanker6(first_round)) {
                    banker6Skipped++;
                    sLog(`第1局對調後會產生莊6點贏，跳過調整`);
                } else {
                    adjustments++;
                    if (mutate) {
                        executeCardSwap(first_round);
                        first_round.result = '閒';
                        first_round.swapped = true;
                        sLog(`第${rounds.length}局無紅色0點牌 → 第1局:莊 → 閒`);
                    }
                }
            }
        }
    }
    if (banker6Skipped > 0) {
        sLog(`避開莊6點贏：跳過 ${banker6Skipped} 局調整（可能產生訊號牌違規）`);
    }

    sLog(`完成調整:${adjustments} 局被修改`, 'success');
    sLog(`包含紅色0點牌的局數:${signal_rounds}`);

    const s_indices = compute_sidx_for_segment(rounds, 'A');
    const analysis = {
        total_s_rounds: s_indices.length,
        s_rounds_data: [],
        total_zero_in_s: 0,
        total_signal_in_s: 0,
        signal_rounds_total: signal_rounds,
        target_banker_count: signal_rounds,
        actual_banker_count: rounds.filter(r => r.result === '莊').length,
        adjustments_made: adjustments
    };

    s_indices.forEach(idx => {
        const round = rounds[idx];
        if (!round) return;
        const zero_cards = round.cards.filter(card => card.isZero());
        const signal_cards = round.cards.filter(card => card.isSignalCard());
        analysis.s_rounds_data.push({
            round_index: idx,
            round,
            zero_count: zero_cards.length,
            signal_count: signal_cards.length,
            zero_cards,
            signal_cards,
            signal_value: signal_cards.length > 0 ? 1 : 0
        });
        analysis.total_zero_in_s += zero_cards.length;
        analysis.total_signal_in_s += signal_cards.length;
    });

    return analysis;
}

// 整合分析結果以提供統計與摘要用途
function buildStatsFromRounds() {
    const totalRounds = Array.isArray(currentRounds) ? currentRounds.length : 0;
    const bankerCount = currentRounds ? currentRounds.filter(r => r.result === '莊').length : 0;
    const playerCount = currentRounds ? currentRounds.filter(r => r.result === '閒').length : 0;
    const tieCount = currentRounds ? currentRounds.filter(r => r.result === '和').length : 0;
    const deckSummary = computeDeckSummary(currentRounds || []);
    const sIndices = Array.isArray(currentRounds) ? new Set(compute_sidx_for_segment(currentRounds, 'A')) : new Set();
    const sSignalCards = countSignalCardsInRounds(currentRounds, (_, idx) => sIndices.has(idx));
    const nonSSignalCards = countSignalCardsInRounds(currentRounds, (_, idx) => !sIndices.has(idx));
    return {
        totalRounds,
        bankerCount,
        playerCount,
        tieCount,
        sSignalCards,
        nonSSignalCards,
        deckSummary
    };
}

// 讀取 UI 的莊/閒比例限制（空白或<=0 代表不檢查）
function getMaxSideLimitSetting() {
    if (typeof document === 'undefined') return null;
    const el = document.getElementById('maxSideLimit');
    if (!el) return null;
    const raw = String(el.value ?? '').trim();
    if (raw === '') return null;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
}

// 讀取 UI 的和局上限（空白代表不檢查）
function getMaxTieLimitSetting() {
    if (typeof document === 'undefined') return null;
    const el = document.getElementById('maxTieLimit');
    if (!el) return null;
    const raw = String(el.value ?? '').trim();
    if (raw === '') return null; // 空白 = 不檢查
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 0) return null;
    return n; // 0 = 不允許任何和局；正數 = 最高幾局和（穿越段數=0 時生效）
}

// 讀取 UI 的穿越段數（0 = 不穿越）
function getTraverseSegCount() {
    if (typeof document === 'undefined') return 0;
    const el = document.getElementById('traverseSegCountToggle');
    if (!el) return 0;
    const n = parseInt(String(el.value ?? '').trim(), 10);
    return (Number.isFinite(n) && n > 0) ? n : 0;
}

// 讀取 UI 的4張局比例上限（百分比，空白或<=0 代表不檢查）
function getMaxFourCardRateSetting() {
    if (typeof document === 'undefined') return null;
    const el = document.getElementById('maxFourCardRate');
    if (!el) return null;
    const raw = String(el.value ?? '').trim();
    if (raw === '') return null;
    const n = parseFloat(raw);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.min(n, 100);
}

function countFourCardRate(rounds) {
    const out = { fourCardCount: 0, totalRounds: 0, rate: 0 };
    if (!Array.isArray(rounds) || rounds.length === 0) return out;
    let fourCardCount = 0;
    for (const round of rounds) {
        const cardCount = (round && Array.isArray(round.cards)) ? round.cards.length : 0;
        if (cardCount === 4) fourCardCount++;
    }
    const totalRounds = rounds.length;
    const rate = totalRounds > 0 ? (fourCardCount / totalRounds) * 100 : 0;
    out.fourCardCount = fourCardCount;
    out.totalRounds = totalRounds;
    out.rate = rate;
    return out;
}


function getTrueRoundResultSafe(round) {
    if (!round || !Array.isArray(round.cards) || typeof computeRoundHands !== 'function') {
        return round && round.result ? round.result : null;
    }
    try {
        const handInfo = computeRoundHands(round.cards);
        const p = handInfo && handInfo.playerTotal;
        const b = handInfo && handInfo.bankerTotal;
        if (typeof p !== 'number' || typeof b !== 'number') return round.result || null;
        if (p === b) return '和';
        return (p > b) ? '閒' : '莊';
    } catch (_) {
        return round && round.result ? round.result : null;
    }
}

function countBankerPlayerTie(rounds) {
    const out = { banker: 0, player: 0, tie: 0, total: 0 };
    if (!Array.isArray(rounds)) return out;
    for (const r of rounds) {
        // 穿越段不計入莊閒和統計（不受上限管制）
        if (r && r.isTraverse) continue;
        const res = getTrueRoundResultSafe(r);
        if (res === '莊') out.banker++;
        else if (res === '閒') out.player++;
        else if (res === '和') out.tie++;
        out.total++;
    }
    return out;
}

function cloneRoundsDeep(rounds) {
    if (!Array.isArray(rounds)) return [];
    return rounds.map(r => {
        if (!r || typeof r !== 'object') return r;
        const copy = { ...r };
        copy.cards = Array.isArray(r.cards)
            ? r.cards.map(c => (c && typeof c.clone === 'function') ? c.clone(c.pos) : c)
            : [];
        // 生成/檢查用：避免帶入上一輪 swapped 標記造成混淆
        delete copy.swapped;
        return copy;
    });
}

// 在「殘牌分配完成」後，先模擬跑一次 S 局調整，再檢查莊/閒是否超過上限。
// 注意：這裡只做篩選（不改動原 rounds），用來決定要不要進入 finalize。
function preflightCheckMaxSideLimit(rounds, options = {}) {
    const alreadyAdjusted = Object.prototype.hasOwnProperty.call(options, 'alreadyAdjusted')
        ? Boolean(options.alreadyAdjusted)
        : false;
    const sideLimit = getMaxSideLimitSetting();
    const tieLimit = getMaxTieLimitSetting();
    const fourCardRateLimit = getMaxFourCardRateSetting();
    if (!sideLimit && tieLimit == null && !fourCardRateLimit) {
        const fourCardStats = countFourCardRate(rounds);
        return {
            enabled: false,
            limit: null,
            sideLimit: null,
            tieLimit: null,
            fourCardRateLimit: null,
            ok: true,
            okSide: true,
            okTie: true,
            okFourCard: true,
            counts: countBankerPlayerTie(rounds),
            fourCardStats
        };
    }

    const sourceRounds = alreadyAdjusted ? rounds : cloneRoundsDeep(rounds);
    try {
        if (!alreadyAdjusted) {
            analyze_signal_cards(sourceRounds, { mutate: true });
        }
    } catch (e) {
        const counts = countBankerPlayerTie(sourceRounds);
        const fourCardStats = countFourCardRate(sourceRounds);
        const okFourCard = (!fourCardRateLimit) || (fourCardStats.rate <= fourCardRateLimit);
        return {
            enabled: true,
            limit: sideLimit,
            sideLimit,
            tieLimit,
            fourCardRateLimit,
            ok: false,
            okSide: false,
            okTie: false,
            okFourCard,
            counts,
            fourCardStats,
            error: e
        };
    }

    const counts = countBankerPlayerTie(sourceRounds);
    const fourCardStats = countFourCardRate(sourceRounds);
    const sideDiff = Math.abs(counts.banker - counts.player);
    const okSide = (!sideLimit) || (sideDiff <= sideLimit);
    // 和局上限只在「穿越段數=0」時生效；穿越時和局數由段數決定，此欄位無意義
    // 語意為「最高幾局和」：counts.tie <= tieLimit（0 = 不允許任何和局，空白 = 不檢查）
    const okTie = (tieLimit == null) || (getTraverseSegCount() > 0) || (counts.tie <= tieLimit);
    const okFourCard = (!fourCardRateLimit) || (fourCardStats.rate <= fourCardRateLimit);
    const ok = okSide && okTie && okFourCard;

    return {
        enabled: true,
        limit: sideLimit, // 保留舊欄位：莊/閒上限
        sideLimit,
        tieLimit,
        fourCardRateLimit,
        ok,
        okSide,
        okTie,
        okFourCard,
        counts,
        fourCardStats
    };
}


// 重新分析牌靴並更新畫面與統計
function refreshAnalysisAndRender(options = {}) {
    if (!Array.isArray(currentRounds)) return;
    const mutate = Object.prototype.hasOwnProperty.call(options, 'mutate')
        ? Boolean(options.mutate)
        : false;
    const skipVerify = Object.prototype.hasOwnProperty.call(options, 'skipVerify')
        ? Boolean(options.skipVerify)
        : false;

    try {
        currentAnalysis = analyze_signal_cards(currentRounds, { mutate });
    } catch (error) {
        log(`重新分析失敗:${error && error.message ? error.message : error}`, 'error');
        currentAnalysis = null;
    }
    const stats = buildStatsFromRounds();
    updateStats(stats);
    renderRoundsTable(currentRounds, currentAnalysis);
    renderDeckSummary(stats.deckSummary);
    renderStatsGridPreview(currentRounds);
    if (typeof refreshViolationStats === 'function') {
        refreshViolationStats();
    }

    // 更新回復分析（僅在編輯模式下重新計算）
    if (editEnabled && currentRounds && currentRounds.length > 0) {
        try {
            const recoveryResult = analyzeShoeRecovery(currentRounds);
            updateRecoveryDisplay(recoveryResult);
        } catch (e) {
            console.warn('回復分析失敗:', e);
        }
    }
    // 【新增】在編輯後重新驗證所有規則，標記違規局
    if (!skipVerify && editEnabled && currentRounds && currentRounds.length > 0) {
        if (typeof window !== 'undefined') window.__roundsModified = false;
        // 編輯階段僅做稽核與標記，不自動修復/不自動重新生成，避免覆寫手動換牌。
        if (typeof window !== 'undefined') window.__suppressVerifyViolationLogs = true;
        try {
            verifyShoeRules(currentRounds, { allowMutations: false, allowAutoRegenerate: false });
        } finally {
            if (typeof window !== 'undefined') window.__suppressVerifyViolationLogs = false;
        }
    }
}

// ==================================================================
// === 【新增】牌靴規則自動驗證 (稽核) 函式 ===
// ==================================================================
/**
 * 驗證最終牌靴是否符合所有 S 局規則
 * @param {Array} rounds - 最終的 currentRounds 陣列
 */
// 檢測連續 5 局以上都是莊或閒的情況（不包含和局）
function findConsecutiveBankerPlayerBlocks(rounds) {
    if (!Array.isArray(rounds) || rounds.length === 0) return [];

    const blocks = [];
    let currentSide = null; // '莊' 或 '閒'
    let consecutiveCount = 0;
    let blockStart = -1;

    for (let i = 0; i < rounds.length; i++) {
        const round = rounds[i];
        if (!round) continue;

        // 穿越段視為打斷連續計數
        if (round.isTraverse) {
            if (consecutiveCount >= 5) {
                blocks.push({
                    startIdx: blockStart,
                    endIdx: i - 1,
                    count: consecutiveCount,
                    side: currentSide,
                    indices: Array.from({ length: consecutiveCount }, (_, j) => blockStart + j)
                });
            }
            currentSide = null;
            consecutiveCount = 0;
            blockStart = -1;
            continue;
        }

        const result = round.result;

        // 和局打斷連續計數
        if (result !== '莊' && result !== '閒') {
            if (consecutiveCount >= 5) {
                blocks.push({
                    startIdx: blockStart,
                    endIdx: i - 1,
                    count: consecutiveCount,
                    side: currentSide,
                    indices: Array.from({ length: consecutiveCount }, (_, j) => blockStart + j)
                });
            }
            currentSide = null;
            consecutiveCount = 0;
            blockStart = -1;
            continue;
        }

        // 如果是莊或閒
        if (result === currentSide) {
            consecutiveCount++;
        } else {
            if (consecutiveCount >= 5) {
                blocks.push({
                    startIdx: blockStart,
                    endIdx: i - 1,
                    count: consecutiveCount,
                    side: currentSide,
                    indices: Array.from({ length: consecutiveCount }, (_, j) => blockStart + j)
                });
            }
            currentSide = result;
            consecutiveCount = 1;
            blockStart = i;
        }
    }

    // 檢查最後的連續計數
    if (consecutiveCount >= 5) {
        blocks.push({
            startIdx: blockStart,
            endIdx: rounds.length - 1,
            count: consecutiveCount,
            side: currentSide,
            indices: Array.from({ length: consecutiveCount }, (_, j) => blockStart + j)
        });
    }

    return blocks;
}

// ════════════════════════════════════════════════════════════════
// 連續五局四張牌 - 全新簡化版本
// ════════════════════════════════════════════════════════════════
// 設計理念：
// 1. 檢測連續 5 局以上都是 4 張牌
// 2. 在牌靴中找任何一個「結果相同、張數不同」的局來交換
// 3. 優先嘗試區塊中間的局，因為打斷中間最有效
// ════════════════════════════════════════════════════════════════

// 1. 檢測連續 4 張牌的區塊
function findConsecutiveFourCardBlocks(rounds) {
    if (!Array.isArray(rounds) || rounds.length === 0) return [];

    const blocks = [];
    let consecutiveCount = 0;
    let blockStart = -1;

    for (let i = 0; i < rounds.length; i++) {
        // 穿越段視為打斷連續性
        if (rounds[i] && rounds[i].isTraverse) {
            if (consecutiveCount >= 5) {
                blocks.push({ startIdx: blockStart, endIdx: i - 1, count: consecutiveCount });
            }
            consecutiveCount = 0;
            blockStart = -1;
            continue;
        }
        const cardCount = (rounds[i] && Array.isArray(rounds[i].cards)) ? rounds[i].cards.length : 0;

        if (cardCount === 4) {
            if (consecutiveCount === 0) blockStart = i;
            consecutiveCount++;
        } else {
            if (consecutiveCount >= 5) {
                blocks.push({
                    startIdx: blockStart,
                    endIdx: i - 1,
                    count: consecutiveCount
                });
            }
            consecutiveCount = 0;
            blockStart = -1;
        }
    }

    // 檢查結尾
    if (consecutiveCount >= 5) {
        blocks.push({
            startIdx: blockStart,
            endIdx: rounds.length - 1,
            count: consecutiveCount
        });
    }

    return blocks;
}

// 2. 尋找可交換的對象（簡化版：只看結果和張數）
function findSwapForFourCardBlock(rounds, blockStart, blockEnd) {
    const isProtectedIndex = (idx) => {
        const r = rounds[idx];
        if (!r) return true;
        if (r.isTraverse) return true; // 穿越段不可被自動修復動到
        if (r.result === '和') return true;
        return false;
    };

    const getTrueResult = (r) => {
        if (!r || !Array.isArray(r.cards)) return null;
        const handInfo = computeRoundHands(r.cards);
        const p = handInfo.playerTotal;
        const b = handInfo.bankerTotal;
        if (typeof p !== 'number' || typeof b !== 'number') return null;
        if (p === b) return '和';
        return (p > b) ? '閒' : '莊';
    };

    const hasSignal = (r) => {
        if (!r || !Array.isArray(r.cards)) return false;
        return r.cards.some(card => card && typeof card.isSignalCard === 'function' && card.isSignalCard());
    };

    const countLocalSignalViolations = (indices) => {
        const n = rounds.length;
        let count = 0;
        for (const raw of indices) {
            const i = ((raw % n) + n) % n;
            const cur = rounds[i];
            const next = rounds[(i + 1) % n];
            if (!cur || !next) continue;
            const nextTrue = getTrueResult(next);
            if (!nextTrue) continue;
            if (hasSignal(cur)) {
                if (nextTrue !== '莊') count++;
            } else {
                if (nextTrue === '莊') count++;
            }
        }
        return count;
    };

    // 從區塊中間開始嘗試（打斷中間最有效）
    const blockSize = blockEnd - blockStart + 1;
    const middleIdx = blockStart + Math.floor(blockSize / 2);

    // 嘗試順序：中間 → 前後擴散
    const tryOrder = [middleIdx];
    for (let offset = 1; offset < blockSize; offset++) {
        if (middleIdx - offset >= blockStart) tryOrder.push(middleIdx - offset);
        if (middleIdx + offset <= blockEnd) tryOrder.push(middleIdx + offset);
    }

    log(`🔍 嘗試修復第 ${blockStart + 1}~${blockEnd + 1} 局，嘗試順序: ${tryOrder.map(i => i + 1).join(', ')}`, 'info');

    for (const targetIdx of tryOrder) {
        const targetRound = rounds[targetIdx];
        if (!targetRound || !targetRound.cards) continue;
        if (isProtectedIndex(targetIdx)) continue;

        const targetResult = targetRound.result;
        const targetCardCount = targetRound.cards.length;

        // 在整個牌靴中找「結果相同、張數不同」的局
        for (let candidateIdx = 0; candidateIdx < rounds.length; candidateIdx++) {
            const candidateRound = rounds[candidateIdx];
            if (!candidateRound || !candidateRound.cards) continue;

            // 排除條件
            if (candidateIdx === targetIdx) continue; // 不能是自己
            if (candidateIdx >= blockStart && candidateIdx <= blockEnd) continue; // 不能在區塊內
            if (isProtectedIndex(candidateIdx)) continue;

            // 必要條件
            const candidateResult = candidateRound.result;
            const candidateCardCount = candidateRound.cards.length;

            if (candidateResult !== targetResult) continue; // 結果必須相同
            if (candidateCardCount === targetCardCount) continue; // 張數必須不同

            const indicesToCheck = new Set([
                targetIdx - 1, targetIdx, targetIdx + 1,
                candidateIdx - 1, candidateIdx, candidateIdx + 1
            ]);
            const beforeViolations = countLocalSignalViolations(indicesToCheck);

            // 執行交換（先做，若造成訊號違規上升就回滾）
            [rounds[targetIdx], rounds[candidateIdx]] = [rounds[candidateIdx], rounds[targetIdx]];

            const afterViolations = countLocalSignalViolations(indicesToCheck);
            if (afterViolations > beforeViolations) {
                [rounds[targetIdx], rounds[candidateIdx]] = [rounds[candidateIdx], rounds[targetIdx]];
                log(`🔍 ⚠️ 修復4張交換會增加訊號違規，略過 (第 ${targetIdx + 1} ↔ 第 ${candidateIdx + 1})`, 'warn');
                continue;
            }

            // 交換局後，重新套一次 S 局調整，避免鄰接關係改變造成訊號違規
            analyze_signal_cards(rounds, { mutate: true });
            // log(`🔍 ✅ 成功修復第 ${blockStart + 1}~${blockEnd + 1} 局`, 'success');
            return { success: true, targetIdx, candidateIdx };
        }
    }

    return { success: false };
}

// 3. 自動修復所有連續 4 張牌區塊
function autoFixConsecutiveFourCardIssues(rounds) {
    if (!Array.isArray(rounds) || rounds.length === 0) return { swapped: [], unfixed: [] };

    const swapped = [];
    const MAX_PASSES = 20;
    for (let pass = 0; pass < MAX_PASSES; pass++) {
        const blocks = findConsecutiveFourCardBlocks(rounds);
        if (blocks.length === 0) return { swapped, unfixed: [] };

        let fixedAny = false;
        for (const block of blocks) {
            // log(`🔍 檢測到連續 ${block.count} 局都是 4 張牌 (第 ${block.startIdx + 1}~${block.endIdx + 1} 局)`, 'warn');
            const result = findSwapForFourCardBlock(rounds, block.startIdx, block.endIdx);
            if (result.success) {
                swapped.push({
                    blockStart: block.startIdx,
                    blockEnd: block.endIdx,
                    swappedIndices: [result.targetIdx, result.candidateIdx]
                });
                fixedAny = true;
                break; // 牌靴已改變，重新掃描
            }
        }

        if (!fixedAny) {
            const remaining = findConsecutiveFourCardBlocks(rounds);
            if (remaining.length > 0) {
                log(`🔍 ✗ 無法自動修復: 仍有 ${remaining.length} 個連續 4 張牌區塊 (找不到合適的交換對象)`, 'error');
            }
            return { swapped, unfixed: remaining };
        }
    }

    const remaining = findConsecutiveFourCardBlocks(rounds);
    return { swapped, unfixed: remaining };
}

function verifyShoeRules(rounds, options = {}) {
    if (!rounds || rounds.length === 0) return;
    const allowMutations = Object.prototype.hasOwnProperty.call(options, 'allowMutations')
        ? Boolean(options.allowMutations)
        : true;
    const allowAutoRegenerate = Object.prototype.hasOwnProperty.call(options, 'allowAutoRegenerate')
        ? Boolean(options.allowAutoRegenerate)
        : true;
    log('========== 牌靴規則驗證開始 ==========', 'info');
    violationRoundIndexes = new Set();
    swapBankerSixIndexes = new Set();
    bankerSixIndexes = new Set();
    const _skipB6El = document.getElementById('skipBanker6');
    const avoidBanker6Swap = _skipB6El ? _skipB6El.checked : false;
    let errors = 0;

    // 輔助函式：使用 computeRoundHands (無Bug版) 來取得真實結果
    const getTrueResult = (r) => {
        if (!r || !r.cards) return '未知';
        const handInfo = computeRoundHands(r.cards); //
        const p = handInfo.playerTotal;
        const b = handInfo.bankerTotal;
        if (typeof p !== 'number' || typeof b !== 'number') return '錯誤';
        if (p === b) return '和';
        return (p > b) ? '閒' : '莊';
    };

    // ═══════════════════════════════════════════════════════════
    // 前置檢查：統計初始違規數量，決定是否重新生成
    // ═══════════════════════════════════════════════════════════
    // 這段原本用來「初始違規過多→自動重新生成」，目前已不需要且會造成噪音/干擾，
    // 先保留開關以便日後需要時再啟用。
    if (ENABLE_PREFLIGHT_REGENERATE && allowAutoRegenerate) {
        const initialViolations = {
            signalCard: 0,
            consecutive4Card: 0,
            consecutive7: 0
        };

        for (let i = 0; i < rounds.length; i++) {
            const current_round = rounds[i];
            if (!current_round || !current_round.cards) continue;

            const next_round = rounds[(i + 1) % rounds.length];
            const has_signal = current_round.cards.some(card => card.isSignalCard && card.isSignalCard());
            const true_result_next = getTrueResult(next_round);

            if (has_signal) {
                if (true_result_next !== '莊') initialViolations.signalCard++;
            } else {
                if (true_result_next === '莊') initialViolations.signalCard++;
            }
        }

        initialViolations.consecutive4Card = findConsecutiveFourCardBlocks(rounds).length;
        initialViolations.consecutive7 = findConsecutiveBankerPlayerBlocks(rounds).length;

        const totalViolations = initialViolations.signalCard +
            initialViolations.consecutive4Card +
            initialViolations.consecutive7;

        const REGENERATE_THRESHOLD = {
            signalCard: 3,
            consecutive4Card: 2,
            consecutive7: 2,
            total: 5
        };

        const shouldRegenerate =
            initialViolations.signalCard >= REGENERATE_THRESHOLD.signalCard ||
            initialViolations.consecutive7 >= REGENERATE_THRESHOLD.consecutive7 ||
            totalViolations >= REGENERATE_THRESHOLD.total;

        if (shouldRegenerate && typeof window !== 'undefined') {
            if (!window.__regenerateCount) window.__regenerateCount = 0;
            window.__regenerateCount++;
            cancelPendingAutoRegenerate();
            window.__regenerateTimerId = setTimeout(() => {
                generateShoe();
            }, 500);
            return;
        }
    }

    // ═══════════════════════════════════════════════════════════
    // 第一階段：基本規則檢查（不受自動修復影響的規則）
    // ═══════════════════════════════════════════════════════════
    log('--- 第一階段：基本規則檢查與修復 ---', 'info');

    // 首先修復卡牌張數問題（殘牌處理導致的違規）
    log('--- 卡牌張數檢查 ---', 'info');
    let cardCountFixed = 0;
    let cardCountUnfixed = 0;

    if (allowMutations) {
        for (let i = 0; i < rounds.length; i++) {
            const current_round = rounds[i];
            if (!current_round || !current_round.cards) continue;

            const success = fixCardCountViolation(current_round, i + 1);
            if (success === true) {
                cardCountFixed++;
            } else if (success === false) {
                cardCountUnfixed++;
                violationRoundIndexes.add(i);
            }
        }

        if (cardCountFixed > 0) {
            log(`✅ 已自動修復 ${cardCountFixed} 局的卡牌張數問題`, 'success');
            if (typeof window !== 'undefined') {
                window.__roundsModified = true;
            }
        }
        if (cardCountUnfixed > 0) {
            log(`⚠️ 發現 ${cardCountUnfixed} 局無法自動修復卡牌張數`, 'warn');
            errors += cardCountUnfixed;
        }
    } else {
        // 目前 round.cards 在某些情境只包含已使用的牌，僅靠前4張無法可靠推導「應有張數」。
        // 避免在手動編輯/稽核時輸出錯誤的張數不符警告。
        log('（手動編輯/稽核模式：略過卡牌張數檢查）', 'info');
    }

    // 繼續其他基本規則檢查
    for (let i = 0; i < rounds.length; i++) {
        const current_round = rounds[i];
        if (!current_round || !current_round.cards) continue;

        const round_num = i + 1;
        const true_result_current = getTrueResult(current_round);
        const currentHandInfo = computeRoundHands(current_round.cards || []);

        // 莊6點贏（原始牌型即為莊家 6 點且閒 ≤ 5）
        if (currentHandInfo && currentHandInfo.bankerTotal === 6 && currentHandInfo.playerTotal <= 5) {
            bankerSixIndexes.add(i);
        }

        // 規則 1: 檢查「結果欄位」和「實際點數」是否一致
        if (current_round.result !== true_result_current) {
            log(`違規(1): 第 ${round_num} 局 結果欄位是「${current_round.result}」，但實際點數計算為「${true_result_current}」`, 'error');
            errors++;
        }

        // 提醒：對調後若成為莊6且閒≤5，僅標記不排除
        if (current_round && current_round.cards && current_round.cards.length >= 2) {
            const swappedCards = current_round.cards.map(c => c ? c.clone() : c);
            [swappedCards[0], swappedCards[1]] = [swappedCards[1], swappedCards[0]];
            const swappedInfo = computeRoundHands(swappedCards);
            const sp = swappedInfo.playerTotal;
            const sb = swappedInfo.bankerTotal;
            if (typeof sp === 'number' && typeof sb === 'number') {
                const swappedResult = (sp === sb) ? '和' : (sp > sb ? '閒' : '莊');
                if (swappedResult === '莊' && sb === 6 && sp <= 5 && !bankerSixIndexes.has(i)) {
                    log(`提示: 第 ${round_num} 局對調後為莊6點且閒 ≤5（僅標記，不排除）`, 'warn');
                    swapBankerSixIndexes.add(i);
                }
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // 第二階段：自動修復（會改變牌局結構的操作）
    // ═══════════════════════════════════════════════════════════
    log(allowMutations ? '--- 第二階段：自動修復 ---' : '--- 第二階段：結構性檢查(不自動修復) ---', 'info');

    // 規則 6: 檢查並修復連續 5 局都是 4 張牌的問題
    log('--- 連續 4 張牌局數檢查 ---', 'info');
    if (allowMutations) {
        const fixResult = autoFixConsecutiveFourCardIssues(rounds);

        if (fixResult.unfixed.length > 0) {
            log(`⚠️ 發現 ${fixResult.unfixed.length} 個無法自動修復的連續 4 張牌區塊，請手動調整`, 'warn');
            fixResult.unfixed.forEach(block => {
                for (let idx = block.startIdx; idx <= block.endIdx; idx++) {
                    violationRoundIndexes.add(idx);
                }
            });
            errors += fixResult.unfixed.length;
        } else if (fixResult.swapped.length > 0) {
            log(`✅ 已自動修復 ${fixResult.swapped.length} 個連續 4 張牌區塊`, 'success');
            if (typeof window !== 'undefined') {
                window.__roundsModified = true;
            }
        } else {
            log('檢查通過：沒有連續 5 局都是 4 張牌的情況。', 'info');
        }
    } else {
        const blocks = findConsecutiveFourCardBlocks(rounds);
        if (blocks.length > 0) {
            log(`⚠️ 發現 ${blocks.length} 個連續 4 張牌違規區塊(未自動修復)，請手動調整`, 'warn');
            blocks.forEach(block => {
                for (let idx = block.startIdx; idx <= block.endIdx; idx++) {
                    violationRoundIndexes.add(idx);
                }
            });
            errors += blocks.length;
        } else {
            log('檢查通過：沒有連續 5 局都是 4 張牌的情況。', 'info');
        }
    }

    // 規則 7: 檢查連續莊/閒（最多允許2段連續7局，連續8局以上直接視為違規）
    log('--- 連續莊/閒局數檢查 ---', 'info');
    {
        const allBlocks = findConsecutiveBankerPlayerBlocks(rounds);
        // 連續8局以上一律違規；5-7局最多允許2段
        const violationBlocks = [];
        let allowedStreaks = 0;
        for (const block of allBlocks) {
            if (block.count >= 8) {
                violationBlocks.push(block);
            } else {
                allowedStreaks++;
                if (allowedStreaks > 2) {
                    violationBlocks.push(block);
                }
            }
        }

        if (violationBlocks.length > 0) {
            log(`⚠️ 發現 ${violationBlocks.length} 個連續莊/閒違規區塊（超過允許的2段）`, 'warn');
            violationBlocks.forEach(block => {
                const sideLabel = block.side === '莊' ? '莊' : '閒';
                log(`違規(7): 第 ${block.startIdx + 1}~${block.endIdx + 1} 局連續 ${block.count} 局都是${sideLabel}`, 'error');
                for (let idx = block.startIdx; idx <= block.endIdx; idx++) {
                    violationRoundIndexes.add(idx);
                }
            });
            errors += violationBlocks.length;
        } else {
            const allowedInfo = allBlocks.length > 0 ? `（允許範圍內 ${allBlocks.length} 段）` : '';
            log(`檢查通過：連續莊/閒在允許範圍內${allowedInfo}`, 'info');
        }
    }

    // 規則 2/5: 自動修復訊號牌違規（對調下一局前兩張）
    if (allowMutations) {
        log('--- 訊號牌違規自動修復 ---', 'info');
        let signalFixed = 0;
        let signalUnfixed = 0;
        for (let i = 0; i < rounds.length; i++) {
            const current_round = rounds[i];
            if (!current_round || !current_round.cards) continue;
            const nextIdx = (i + 1) % rounds.length;
            const next_round = rounds[nextIdx];
            if (!next_round || !next_round.cards) continue;

            const has_signal = current_round.cards.some(card => card.isSignalCard());
            const true_result_next = getTrueResult(next_round);

            let needFix = false;
            let expectedResult = null;
            if (has_signal) {
                if (true_result_next !== '莊') { needFix = true; expectedResult = '莊'; }
            } else {
                if (true_result_next === '莊') { needFix = true; expectedResult = '非莊'; }
            }

            if (!needFix) continue;

            // 嘗試對調下一局前兩張
            const swapped = swapFirstTwoCards(next_round);
            let shouldSwap = false;
            if (expectedResult === '莊' && swapped === '莊') shouldSwap = true;
            else if (expectedResult === '非莊' && swapped && swapped !== '莊') shouldSwap = true;

            if (shouldSwap) {
                executeCardSwap(next_round);
                if (typeof recomputeRoundOutcome === 'function') recomputeRoundOutcome(next_round);
                else next_round.result = swapped;
                signalFixed++;
                log(`✅ 第 ${i + 1} 局訊號牌違規：對調第 ${nextIdx + 1} 局前兩張 (${true_result_next} → ${swapped})`, 'success');
            } else {
                signalUnfixed++;
            }
        }
        if (signalFixed > 0) {
            log(`✅ 已自動修復 ${signalFixed} 個訊號牌違規`, 'success');
            if (typeof window !== 'undefined') window.__roundsModified = true;
        }
        if (signalUnfixed > 0) {
            log(`⚠️ ${signalUnfixed} 個訊號牌違規無法自動修復（對調後不符合預期），需手動處理`, 'warn');
        }
    }

    // 修復結果欄位不一致（result 與實際點數不符）
    if (allowMutations) {
        let resultFixed = 0;
        for (let i = 0; i < rounds.length; i++) {
            const r = rounds[i];
            if (!r || !r.cards) continue;
            const trueResult = getTrueResult(r);
            if (r.result !== trueResult && trueResult !== '未知' && trueResult !== '錯誤') {
                r.result = trueResult;
                resultFixed++;
            }
        }
        if (resultFixed > 0) {
            log(`✅ 已修正 ${resultFixed} 局結果欄位不一致`, 'success');
            if (typeof window !== 'undefined') window.__roundsModified = true;
        }
    }

    // ═══════════════════════════════════════════════════════════
    // 第三階段：修復後檢查（檢查受自動修復影響的規則）
    // ═══════════════════════════════════════════════════════════
    log('--- 第三階段：修復後驗證 ---', 'info');

    for (let i = 0; i < rounds.length; i++) {
        const current_round = rounds[i];
        if (!current_round || !current_round.cards) continue;

        const next_round = rounds[(i + 1) % rounds.length];
        const round_num = i + 1;
        const next_round_num = (i === rounds.length - 1) ? 1 : round_num + 1;

        const true_result_next = getTrueResult(next_round);

        const has_signal = current_round.cards.some(card => card.isSignalCard());

        // 檢查 S 局 邏輯
        if (has_signal) {
            // 規則 2: `S局(有訊號牌)下一局不是莊`
            if (true_result_next !== '莊') {
                log(`違規(2): 第 ${round_num} 局有訊號牌，但下一局 (第 ${next_round_num} 局) 實際結果是「${true_result_next}」(應為 莊)`, 'error');
                errors++;
                violationRoundIndexes.add(i);
            }
        } else {
            // 規則 5: `非訊號局的下一局是莊`
            if (true_result_next === '莊') {
                log(`違規(5): 第 ${round_num} 局 (非S)，但下一局 (第 ${next_round_num} 局) 實際結果是「${true_result_next}」(不應為 莊)`, 'error');
                errors++;
                violationRoundIndexes.add(i);
            }
        }
    }

    // 規則 3: `不是S局卻出現訊號牌`
    log('--- 非 S 局的訊號牌檢查 ---', 'info');
    let nonSSignalCount = 0;
    const sIndicesForLog = new Set(compute_sidx_for_segment(rounds, 'A'));
    rounds.forEach((round, idx) => {
        if (!round || sIndicesForLog.has(idx)) return;
        const signalCards = round.cards.filter(card => card && card.isSignalCard());
        if (signalCards.length > 0) {
            log(`資訊(3): 第 ${idx + 1} 局 (非S局定義)，但有 ${signalCards.length} 張訊號牌: ${signalCards.map(c => c.short()).join(', ')}`, 'warn');
            nonSSignalCount++;
        }
    });
    if (nonSSignalCount === 0) {
        log('資訊(3): 檢查通過，所有訊號牌都在 S 局定義中。', 'info');
    }

    // 規則 8: 檢查連續和局（不能有連續 2 局以上都是和）
    log('--- 連續和局檢查 ---', 'info');
    let consecutiveTieCount = 0;
    for (let i = 0; i < rounds.length; i++) {
        const current = getTrueResult(rounds[i]);
        const next = getTrueResult(rounds[(i + 1) % rounds.length]);

        if (current === '和' && next === '和') {
            log(`違規(8): 第 ${i + 1} 局和第 ${(i + 1) % rounds.length + 1} 局連續出現和局`, 'error');
            violationRoundIndexes.add(i);
            consecutiveTieCount++;
            errors++;
        }
    }

    if (consecutiveTieCount === 0) {
        log('檢查通過：沒有連續和局的情況。', 'info');
    } else {
        log(`⚠️ 發現 ${consecutiveTieCount} 處連續和局違規，請手動調整或重新生成`, 'warn');
    }

    // 規則 9: 檢查「無法對調」的情況
    log('--- 對調可行性檢查 ---', 'info');
    let swapFailureCount = 0;
    rounds.forEach((round, idx) => {
        if (!round || !round.cards) return;
        // 穿越段（A 段）不檢查無法對調
        if (round.isTraverse) return;

        const swappedResult = swapFirstTwoCards(round);
        if (swappedResult === null) {
            // 無法對調，標記為違規
            violationRoundIndexes.add(idx);
            swapFailureCount++;
            log(`違規(9): 第 ${idx + 1} 局無法對調（牌組不足或模擬失敗）`, 'warn');
        }
    });

    if (swapFailureCount > 0) {
        log(`⚠️ 發現 ${swapFailureCount} 局無法對調的情況`, 'warn');
        errors += swapFailureCount;
    } else {
        log('檢查通過：所有局都可以對調。', 'info');
    }

    log('------------------------------------', 'info');
    if (errors === 0) {
        log('✅ 驗證通過：所有主要規則 (1, 2, 4, 5, 6, 7, 8, 9) 均符合。', 'success');
    } else {
        log(`❌ 驗證失敗：共發現 ${errors} 處主要規則違規。`, 'error');
    }
    applyViolationHighlights();
    log('========== 牌靴規則驗證結束 ==========', 'info');
}

// ════════════════════════════════════════════════════════════════
// 從序列與項目生成牌靴的函數
// ════════════════════════════════════════════════════════════════

/**
 * 根據 B/P 序列和限制條件生成牌靴
 * @param {string} seq - B/P 序列 (例: "BPBPP...")
 * @param {number} tieCount - 和局數量
 * @param {number} b6Count - 莊6局數量
 * @returns {Array} 牌局陣列
 */
function generateShoeBySequence(seq, tieCount = 0, b6Count = 0) {
    if (!seq || typeof seq !== 'string') {
        console.error('序列為空或類型錯誤');
        return [];
    }

    const rounds = [];
    let deckCards = [];
    
    // 初始化牌組 (8副牌，416張)
    const deck = createFullDeck();
    let cardIndex = 0;

    // 根據序列生成牌局
    for (let i = 0; i < seq.length; i++) {
        if (cardIndex + 4 > deck.length) break;

        const result = seq[i].toUpperCase() === 'B' ? '莊' : '閒';
        const roundCards = [];

        // 取 4-6 張牌
        for (let j = 0; j < 4 && cardIndex < deck.length; j++) {
            roundCards.push(deck[cardIndex++]);
        }

        if (roundCards.length < 4) break;

        // 模擬補牌規則
        const playerTotal = (roundCards[0].point() + roundCards[2].point()) % 10;
        const bankerTotal = (roundCards[1].point() + roundCards[3].point()) % 10;
        
        if (playerTotal < 8 && bankerTotal < 8) {
            if (playerTotal <= 5 && cardIndex < deck.length) {
                roundCards.push(deck[cardIndex++]);
            }
            if (bankerTotal <= 5 && cardIndex < deck.length) {
                roundCards.push(deck[cardIndex++]);
            }
        }

        const round = {
            start_index: cardIndex - roundCards.length,
            cards: roundCards,
            result: result,
            sensitive: false,
            segment: 'A'
        };

        rounds.push(round);
    }

    // 添加和局
    for (let i = 0; i < tieCount && rounds.length < 80; i++) {
        const roundCards = [];
        for (let j = 0; j < 4 && cardIndex < deck.length; j++) {
            roundCards.push(deck[cardIndex++]);
        }
        if (roundCards.length < 4) break;

        rounds.push({
            start_index: cardIndex - roundCards.length,
            cards: roundCards,
            result: '和',
            sensitive: false,
            segment: 'A'
        });
    }

    // 添加殘牌
    if (cardIndex < deck.length) {
        const tailCards = deck.slice(cardIndex);
        if (tailCards.length > 0) {
            rounds.push({
                start_index: cardIndex,
                cards: tailCards,
                result: '殘牌',
                sensitive: false,
                segment: 'C'
            });
        }
    }

    return rounds;
}

/**
 * 根據項目列表 (大路圖) 生成牌靴
 * @param {Array} items - 項目列表，每個項目包含 {result, ...}
 * @returns {Array} 牌局陣列
 */
function generateShoeByItemList(items) {
    if (!Array.isArray(items) || items.length === 0) {
        console.error('項目列表為空');
        return [];
    }

    const rounds = [];
    const deck = createFullDeck();
    let cardIndex = 0;

    for (const item of items) {
        if (cardIndex + 4 > deck.length) break;

        const result = item.result || '莊';
        const roundCards = [];

        // 取 4-6 張牌
        for (let j = 0; j < 4 && cardIndex < deck.length; j++) {
            roundCards.push(deck[cardIndex++]);
        }

        if (roundCards.length < 4) break;

        // 模擬補牌規則
        const playerTotal = (roundCards[0].point() + roundCards[2].point()) % 10;
        const bankerTotal = (roundCards[1].point() + roundCards[3].point()) % 10;
        
        if (playerTotal < 8 && bankerTotal < 8) {
            if (playerTotal <= 5 && cardIndex < deck.length) {
                roundCards.push(deck[cardIndex++]);
            }
            if (bankerTotal <= 5 && cardIndex < deck.length) {
                roundCards.push(deck[cardIndex++]);
            }
        }

        const round = {
            start_index: cardIndex - roundCards.length,
            cards: roundCards,
            result: result,
            sensitive: false,
            segment: 'A'
        };

        rounds.push(round);
    }

    // 添加殘牌
    if (cardIndex < deck.length) {
        const tailCards = deck.slice(cardIndex);
        if (tailCards.length > 0) {
            rounds.push({
                start_index: cardIndex,
                cards: tailCards,
                result: '殘牌',
                sensitive: false,
                segment: 'C'
            });
        }
    }

    return rounds;
}

/**
 * 建立完整牌組 (8副牌，416張)
 */
function createFullDeck() {
    const deck = [];
    const suits = ['♠', '♥', '♦', '♣'];
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const colors = ['R', 'B']; // Red, Black

    let pos = 0;
    // 8 副牌
    for (let numDecks = 0; numDecks < 8; numDecks++) {
        for (const suit of suits) {
            for (const rank of ranks) {
                for (const color of colors) {
                    const card = new Card(rank, suit, pos);
                    card.back_color = color;
                    deck.push(card);
                    pos++;
                }
            }
        }
    }

    // 洗牌
    shuffle(deck);
    return deck;
}

// 隨機模式：416 張洗亂後直接依序發牌，不套用任何條件、不調整、不驗證、不修復
function generateRandomShoe() {
    try {
        const logArea = document.getElementById('logArea');
        if (logArea) logArea.innerHTML = '';
        const roundsBody = document.getElementById('roundsBody');
        if (roundsBody) roundsBody.innerHTML = '';

        if (typeof window !== 'undefined') {
            window.__importedShoeMode = true; // 跳過所有後續違規檢查
            window.__roundsModified = false;
        }

        if (typeof applySignalConfig === 'function') applySignalConfig();

        const deck = build_shuffled_deck();
        log(`🎲 隨機模式：洗 ${deck.length} 張牌`, 'info');

        const sim = new Simulator(deck);
        const rounds = [];
        let pos = 0;
        while (pos + 3 < deck.length) {
            const r = sim.simulate_round(pos, { no_swap: true });
            if (!r || !Array.isArray(r.cards) || r.cards.length === 0) break;
            r.segment = '隨機';
            rounds.push(r);
            pos += r.cards.length;
        }

        currentRounds = rounds;
        log(`🎲 共 ${rounds.length} 局，剩 ${deck.length - pos} 張未發`, 'success');

        if (typeof refreshAnalysisAndRender === 'function') {
            refreshAnalysisAndRender({ mutate: false, skipVerify: true });
        }
        if (typeof setEditButtonsAvailability === 'function') setEditButtonsAvailability(true);
        if (typeof resetEditState === 'function') resetEditState();
    } catch (e) {
        log(`隨機模式失敗: ${e && e.message ? e.message : e}`, 'error');
    }
}
if (typeof window !== 'undefined') window.generateRandomShoe = generateRandomShoe;

// 主要生成函數 - 使用完整的ABC段排列並自動分析
// 生成整副牌靴並進行分析
async function generateShoe() {
    const btn = document.getElementById('generateBtn');
    const stopBtn = document.getElementById('stopGenerateBtn');
    const autoColorBtn = document.getElementById('btnAutoColor');
    const isStopRequested = () => (typeof window !== 'undefined' && window.__stopGenerateRequested === true);
    const ensureNotStopped = () => {
        if (!isStopRequested()) return false;
        log('已停止生成牌靴', 'warn');
        return true;
    };

    if (typeof window !== 'undefined' && window.__isGeneratingShoe) {
        log('目前已有生成流程進行中', 'warn');
        return;
    }
    if (typeof window !== 'undefined') {
        window.__isGeneratingShoe = true;
        window.__stopGenerateRequested = false;
        // 重新生成 → 取消「匯入模式」的違規檢查跳過
        window.__importedShoeMode = false;
    }

    // 檢查是否為自動重新生成
    const isAutoRegenerate = (typeof window !== 'undefined' && window.__regenerateCount > 0);

    // 如果不是自動重新生成，重置計數器
    if (!isAutoRegenerate && typeof window !== 'undefined') {
        window.__regenerateCount = 0;
    }

    // 清空上一副牌的日誌和表格
    const logArea = document.getElementById('logArea');
    if (logArea) {
        logArea.innerHTML = '';
    }
    const roundsBody = document.getElementById('roundsBody');
    if (roundsBody) {
        roundsBody.innerHTML = '';
    }

    btn.disabled = true;
    btn.textContent = '生成中...';
    btn.classList.add('generating-pulse');
    const overlay = document.getElementById('generatingOverlay');
    const overlayText = document.getElementById('generatingText');
    if (overlay) overlay.classList.add('active');
    if (stopBtn) {
        stopBtn.disabled = false;
        stopBtn.textContent = '停止';
    }
    if (autoColorBtn) autoColorBtn.disabled = true;

    try {
        if (isAutoRegenerate) {
            log(`🔄 自動重新生成 (第 ${window.__regenerateCount} 次)`, 'warn');
        } else {
            log('開始生成牌靴...', 'info');
        }

        // 確保使用目前 UI 選擇的花色與數字
        applySignalConfig();

        let result = null;
        let finalizedRounds = null;
        let validatedRecoveryResult = null;
        let attempt = 0;

        // 重試直到成功為止（不設上限，由用戶條件決定）
        while (!finalizedRounds) {
            if (ensureNotStopped()) return;
            attempt++;

            // 每次更新按鈕文字
            btn.textContent = `${attempt}`;
            if (overlayText) overlayText.textContent = `生成中 (第 ${attempt} 次嘗試)`;

            // 避免 UI 凍結
            await new Promise(r => setTimeout(r, 0));
            if (ensureNotStopped()) return;

            log(`嘗試生成第 ${attempt} 次...`, 'info');

            // 1. 建立牌組
            const deck = build_shuffled_deck();
            log(`建立了 ${deck.length} 張牌的牌組`, 'info');

            // 2. 使用完整的ABC段排列邏輯
            try {
                result = pack_all_sensitive_and_segment(deck);
            } catch (e) {
                log(`第 ${attempt} 次嘗試失敗,重新生成... (${e && e.message ? e.message : e})`, 'warn');
                result = null;
                continue;
            }

            if (!result || !result.final_rounds || result.final_rounds.length === 0) {
                log(`第 ${attempt} 次嘗試失敗,重新生成...`, 'warn');
                result = null; // 確保繼續重試
                continue;
            }

            // 3. 立即處理殘牌分配（確保檢查的對象就是最終結果）
            let roundsToCheck = result.final_rounds;
            const remaining = result.c_cards || [];
            const autoDistribute = (typeof window === 'undefined' || window.autoDistributeRemainingCards !== false);

            log(`🔍 殘牌檢查：殘牌數 = ${remaining.length}, 自動分配 = ${autoDistribute}`, 'info');

            if (remaining.length > 0 && autoDistribute) {
                log(`第 ${attempt} 次生成：檢測到 ${remaining.length} 張殘牌，進行分配...`, 'info');
                try {
                    roundsToCheck = distributeRemainingCards(roundsToCheck, remaining);
                    roundsToCheck = recalculateRoundsAfterDistribution(roundsToCheck);
                } catch (e) {
                    log(`第 ${attempt} 次殘牌處理失敗，重新生成... (${e && e.message ? e.message : e})`, 'warn');
                    result = null;
                    continue;
                }
            } else if (remaining.length === 0) {
                log(`✓ 沒有殘牌，直接進入檢查`, 'info');
            } else {
                log(`⚠️ 自動分配已關閉，跳過殘牌處理`, 'warn');
            }

            // 4. 全段檢查原始莊6且閒≤5
            try {
                analyze_signal_cards(roundsToCheck, { mutate: true });
            } catch (e) {
                log(`第 ${attempt} 次 S 局處理失敗，重新生成... (${e && e.message ? e.message : e})`, 'warn');
                result = null;
                continue;
            }

            // 5. 檢查牌靴回復速度（這是檢查S局調整前的原始結果）
            try {
                const recoveryResult = analyzeShoeRecovery(roundsToCheck);
                if (recoveryResult) {
                    const avg = parseFloat(recoveryResult.avgRounds);
                    const range16plus = (recoveryResult.distribution && recoveryResult.distribution.range16plus) || 0;

                    // 讀取用戶設定的檢查條件
                    const avgLimitInput = document.getElementById('avgRecoveryLimit');
                    const range16LimitInput = document.getElementById('range16Limit');
                    const avgLimit = avgLimitInput ? (parseFloat(avgLimitInput.value) || 0) : 0;
                    const range16Limit = range16LimitInput && range16LimitInput.value !== '' ? parseInt(range16LimitInput.value) : null;

                    const avgCheckStatus = avgLimit > 0 ? `檢查≤${avgLimit}` : '不檢查';
                    const range16CheckStatus = range16Limit !== null ? `檢查≤${range16Limit}張` : '不檢查';
                    log(`第 ${attempt} 次生成回復分析：平均 ${avg} 局(${avgCheckStatus})，16局以上 ${range16plus} 張(${range16CheckStatus})`, 'info');

                    // 平均回復局數檢查
                    if (avgLimit > 0 && avg > avgLimit) {
                        log(`第 ${attempt} 次生成失敗：平均回復局數 ${avg} > ${avgLimit}，重新生成...`, 'warn');
                        result = null;
                        continue;
                    }

                    // 16局以上檢查
                    if (range16Limit !== null && range16plus > range16Limit) {
                        log(`第 ${attempt} 次生成失敗：有 ${range16plus} 張切牌點需要 16 局以上回復 (上限=${range16Limit})，重新生成...`, 'warn');
                        result = null;
                        continue;
                    }

                    // 保存通過檢查的回復結果
                    validatedRecoveryResult = recoveryResult;
                }
            } catch (e) {
                log(`第 ${attempt} 次回復分析失敗，重新生成... (${e.message})`, 'warn');
                result = null;
                continue;
            }

            // 6. 莊閒差距檢查 + 和局上限檢查（和局上限僅穿越段數=0 時生效，語意為「最高幾局和」）
            const preflightLimits = preflightCheckMaxSideLimit(roundsToCheck, { alreadyAdjusted: true });
            if (preflightLimits.enabled) {
                const c = preflightLimits.counts;
                const sideDiff = Math.abs(c.banker - c.player);
                const sideText = preflightLimits.sideLimit ? `莊閒差距上限=${preflightLimits.sideLimit}` : '莊閒差距不檢查';
                log(`🔍 檢測到：莊=${c.banker}、閒=${c.player}、和=${c.tie}、差距=${sideDiff}（${sideText}）`, 'info');
                if (!preflightLimits.okSide && preflightLimits.sideLimit) {
                    log(`🔍 ⚠️ 莊閒差距超標（莊=${c.banker} vs 閒=${c.player}，差距=${sideDiff} > ${preflightLimits.sideLimit}），重新生成...`, 'warn');
                    result = null;
                    continue;
                }
                if (!preflightLimits.okTie) {
                    log(`🔍 ⚠️ 和局數超標（和=${c.tie} > 上限${preflightLimits.tieLimit}），重新生成...`, 'warn');
                    result = null;
                    continue;
                }
            }


            // 9. 連續莊/閒檢查（≥8 局違規；5-7 局最多 2 段）
            try {
                const allBlocks = findConsecutiveBankerPlayerBlocks(roundsToCheck);
                let bad = false;
                let allowed = 0;
                for (const block of allBlocks) {
                    if (block.count >= 8) { bad = true; break; }
                    allowed++;
                    if (allowed > 2) { bad = true; break; }
                }
                if (bad) {
                    log(`第 ${attempt} 次生成失敗：連續莊/閒超標，重新生成...`, 'warn');
                    result = null;
                    continue;
                }
            } catch (e) {
                log(`⚠️ 連續莊/閒檢查異常: ${e && e.message ? e.message : e}`, 'warn');
                result = null;
                continue;
            }

            // 通過所有檢查，確認使用此結果
            finalizedRounds = roundsToCheck;
        }

        log(`生成成功!總共嘗試 ${attempt} 次`, 'success');
        btn.textContent = '生成';
        currentRounds = finalizedRounds;

        // 3. 統計各段數量 (僅供參考，因為已經分配完畢)
        const a_count = result.a_rounds.length;
        const remainingCardCount = (result.c_cards && result.c_cards.length) || 0;

        log(`原始 A段: ${a_count}局`, 'info');
        if (remainingCardCount > 0) {
            log(`原始 C段殘牌: ${remainingCardCount} 張 (已分配)`, 'info');
        } else {
            log('✅ 原始牌靴完美生成 (無殘牌)', 'success');
        }

        log(`總計: ${currentRounds.length}局`, 'info');

        // 4. 進行 S 局訊號分析
        sLog('開始分析S局訊號並調整莊閒...');
        refreshAnalysisAndRender({ mutate: false, skipVerify: true });
        setEditButtonsAvailability(true);
        resetEditState();

        // 【規則驗證 + 自動修復】
        if (typeof window !== 'undefined') window.__roundsModified = false;
        verifyShoeRules(currentRounds);

        // 如果有自動修復，重新渲染
        if (typeof window !== 'undefined' && window.__roundsModified) {
            refreshAnalysisAndRender({ mutate: false, skipVerify: true });
            window.__roundsModified = false;
        }

        // 【後處理 sideDiff 復查】verifyShoeRules 內的 S 局/連續莊閒修復
        // 會對調前兩張 → 莊↔閒翻面，可能讓原本通過的莊閒差距超標
        {
            const sideLimitForRecheck = getMaxSideLimitSetting();
            if (sideLimitForRecheck) {
                const counts = countBankerPlayerTie(currentRounds);
                const sideDiff = Math.abs(counts.banker - counts.player);
                if (sideDiff > sideLimitForRecheck) {
                    log(`🔁 後處理後莊閒差距超標（莊=${counts.banker} vs 閒=${counts.player}，差距=${sideDiff} > ${sideLimitForRecheck}），重新生成...`, 'warn');
                    if (typeof window !== 'undefined') {
                        if (!window.__regenerateCount) window.__regenerateCount = 0;
                        window.__regenerateCount++;
                        if (window.__regenerateTimerId) clearTimeout(window.__regenerateTimerId);
                        window.__regenerateTimerId = setTimeout(() => { generateShoe(); }, 100);
                    }
                    return;
                }
            }
        }

        // 【自動卡色調整】
        if (typeof runAutoColorSwap_Signal === 'function') {
            try {
                log('🔁 自動卡色調整啟動（生成流程）...', 'info');
                const swapped = runAutoColorSwap_Signal(currentRounds);
                if (Array.isArray(swapped) && swapped.length > 0) {
                    currentRounds = swapped;
                    log('✅ 生成流程內卡色調整完成', 'success');
                    refreshAnalysisAndRender({ mutate: false, skipVerify: true });
                } else {
                    log('⚠️ 自動卡色調整未回傳有效結果，維持原牌序', 'warn');
                }
            } catch (e) {
                log(`⚠️ 自動卡色調整失敗: ${e && e.message ? e.message : e}`, 'error');
            }
        }

        // 【愛心標記：B 段每段最後一局換 4 張愛心】
        if (typeof applyHeartMarking === 'function') {
            try {
                applyHeartMarking(currentRounds);
                refreshAnalysisAndRender({ mutate: false, skipVerify: true });
            } catch (e) {
                log(`⚠️ 愛心標記失敗: ${e && e.message ? e.message : e}`, 'error');
            }
        }

        // 【輸出統計日誌】
        const stats = buildStatsFromRounds();
        log(`生成完成!`, 'success');
        if (currentAnalysis) {
            log(`包含訊號牌的局數: ${currentAnalysis.signal_rounds_total}`, 'info');
            log(`調整局數: ${currentAnalysis.adjustments_made}`, 'info');
            log(`實際莊家局數: ${currentAnalysis.actual_banker_count}`, 'info');
            sLog(`S局數量: ${currentAnalysis.total_s_rounds}`);
            sLog(`S局中紅色0點牌: ${currentAnalysis.total_signal_in_s}`);
        }
        log(`莊家局數: ${stats.bankerCount}、閒家局數: ${stats.playerCount}、和局數: ${stats.tieCount}`, 'info');
        log(`S局訊號牌張數: ${stats.sSignalCards} (非S局訊號牌張數: ${stats.nonSSignalCards})`, 'info');

        // 【統計對調莊6贏】
        const swapB6Rounds = [];
        currentRounds.forEach((rd, ri) => {
            if (!rd || !Array.isArray(rd.cards) || rd.cards.length < 4) return;
            const tmp = rd.cards.map(c => c.clone());
            [tmp[0], tmp[1]] = [tmp[1], tmp[0]];
            const hi = computeRoundHands(tmp);
            if (hi && hi.bankerTotal === 6 && hi.playerTotal <= 5) {
                swapB6Rounds.push(ri + 1);
            }
        });
        log(`對調莊6贏：${swapB6Rounds.length} 局 → 第 ${swapB6Rounds.join('、')} 局`, swapB6Rounds.length > 0 ? 'success' : 'info');

        if (stats.deckSummary) {
            log(`牌靴已統計張數: ${stats.deckSummary.total_cards}/416`, 'info');
        }
        const sIndicesForLog = new Set(compute_sidx_for_segment(currentRounds, 'A'));
        log('=== 非 S 局訊號牌檢查 ===', 'info');
        let manualNonSSignalCount = 0;
        currentRounds.forEach((round, idx) => {
            if (!round || sIndicesForLog.has(idx)) return;
            const signalCards = round.cards.filter(card => card && card.isSignalCard());
            if (signalCards.length > 0) {
                log(`第${idx + 1}局(非S)：有 ${signalCards.length} 張訊號牌 - ${signalCards.map(c => c.short()).join(', ')}`, 'info');
                manualNonSSignalCount += signalCards.length;
            }
        });
        log(`手動統計非 S 局訊號牌總數：${manualNonSSignalCount}`, 'info');
        let totalSignalInDeck = 0;
        const seenSignalCardKeys = new Set();
        currentRounds.forEach(round => {
            if (!round || !Array.isArray(round.cards)) return;
            round.cards.forEach(card => {
                if (!card || !card.isSignalCard()) return;
                const key = (card.pos !== undefined && card.pos !== null)
                    ? `pos:${card.pos}`
                    : `fallback:${card.suit || ''}_${card.rank || ''}_${card.label || ''}_${typeof card.short === 'function' ? card.short() : ''}`;
                if (seenSignalCardKeys.has(key)) return;
                seenSignalCardKeys.add(key);
                totalSignalInDeck++;
            });
        });
        if (currentAnalysis && Array.isArray(currentAnalysis.s_rounds_data)) {
            currentAnalysis.s_rounds_data.forEach(sr => {
                if (sr.signal_value > 0) {
                    sLog(`第${sr.round_index + 1}局(S局): 訊號值=${sr.signal_value}, 紅色0點牌=${sr.signal_cards.map(c => c.short()).join(',')}`);
                }
            });
        }

        // 更新回復分析顯示
        try {
            const finalRecoveryCheck = analyzeShoeRecovery(currentRounds);
            if (finalRecoveryCheck && typeof updateRecoveryDisplay === 'function') {
                updateRecoveryDisplay(finalRecoveryCheck);
            }
        } catch (e) {
            log(`回復分析顯示更新失敗: ${e.message}`, 'error');
        }

    } catch (error) {
        log(`生成失敗: ${error.message}`, 'error');
        setEditButtonsAvailability(false);
    } finally {
        if (typeof window !== 'undefined') {
            window.__isGeneratingShoe = false;
            window.__stopGenerateRequested = false;
        }
        btn.disabled = false;
        btn.textContent = '生成';
        btn.classList.remove('generating-pulse');
        if (overlay) overlay.classList.remove('active');
        if (stopBtn) {
            stopBtn.disabled = true;
            stopBtn.textContent = '停止';
        }
        if (autoColorBtn && currentRounds && currentRounds.length) autoColorBtn.disabled = false;
    }
}

function stopGenerateShoe() {
    if (typeof window === 'undefined') return;
    const isGenerating = Boolean(window.__isGeneratingShoe);
    window.__stopGenerateRequested = true;
    if (typeof cancelPendingAutoRegenerate === 'function') {
        cancelPendingAutoRegenerate();
    }
    if (window.__regenerateTimerId) {
        clearTimeout(window.__regenerateTimerId);
        window.__regenerateTimerId = null;
    }
    const stopBtn = document.getElementById('stopGenerateBtn');
    if (stopBtn) {
        stopBtn.disabled = true;
        stopBtn.textContent = '停止中...';
    }
    if (isGenerating) {
        log('已送出停止指令，正在結束生成流程...', 'warn');
    } else {
        log('目前沒有進行中的生成流程', 'info');
    }
}

// 分析S局訊號
// 根據目前訊號設定分析牌靴並顯示結果
async function analyzeSignals() {
    if (!currentRounds) {
        log('請先生成牌靴', 'error');
        return;
    }

    sLog('開始分析S局訊號...');

    try {
        // 分析紅色0點牌訊號並調整莊家局數量
        currentAnalysis = analyze_signal_cards(currentRounds);

        const totalSensitiveEl = document.getElementById('totalSensitive');
        const stats = {
            totalSensitive: totalSensitiveEl ? totalSensitiveEl.textContent : '0',
            sRoundsCount: currentAnalysis.total_s_rounds,
            zeroInS: currentAnalysis.total_zero_in_s,
            signalInS: currentAnalysis.total_signal_in_s,
            bankerCount: currentRounds.filter(r => r.result === '莊').length,
            playerCount: currentRounds.filter(r => r.result === '閒').length,
            tieCount: currentRounds.filter(r => r.result === '和').length,
            signalRounds: currentAnalysis.signal_rounds_total
        };

        updateStats(stats);
        renderRoundsTable(currentRounds, currentAnalysis);

        log(`分析完成!`, 'success');
        log(`包含紅色0點牌的局數: ${currentAnalysis.signal_rounds_total}`, 'info');
        log(`調整局數: ${currentAnalysis.adjustments_made}`, 'info');
        log(`實際莊家局數: ${currentAnalysis.actual_banker_count}`, 'info');
        sLog(`S局數量: ${currentAnalysis.total_s_rounds}`);
        sLog(`S局中紅色0點牌: ${currentAnalysis.total_signal_in_s}`);

        // 顯示詳細訊號資訊
        currentAnalysis.s_rounds_data.forEach(sr => {
            if (sr.signal_value > 0) {
                sLog(`第${sr.round_index + 1}局(S局): 訊號值=${sr.signal_value}, 紅色0點牌=${sr.signal_cards.map(c => c.short()).join(',')}`);
            }
        });

    } catch (error) {
        log(`分析失敗: ${error.message}`, 'error');
    }
}

// 清空
// 重設整個模擬器狀態與面板
// [UI 函數已移至 signals_ui.js: clearAll, ensureRoundsReady, buildPreviewGrid, renderStatsGridPreview, exportRoundsAsExcel, previewRoundsInWindow]










// === 語音:開啟主程式語音工具 (上傳 Excel 再朗讀) ===
// 打開語音助理頁面
// [UI 函數已移至 signals_ui.js: openSpeechAssistant, showCalcTool, ensureFloatingWidget, bindSimulatorLogic]

// Excel 預覽/導出共用常數（signals_ui.js 會使用）
const PREVIEW_GRID_COLS = 21;
const PREVIEW_GRID_ROWS = 31;
const PREVIEW_GRID_GROUP = 7;

// =============================================
// === 【新增】卡色 (BBBR/RRRB) 邏輯 ===
// =============================================

// 全域變數,用來儲存當前牌局資料
let $ROUNDS = [];

/**
 * 【新增】卡色邏輯的啟動函式
 */
// 針對卡色邏輯抽換備援牌
function runAutoColorSwap_Signal(rounds) {
    log('SIG: 啟動訊號牌專用的卡色邏輯...', 'info');
    $ROUNDS = rounds; // 儲存牌局資料

    // 1. 穿越段 + 跳過卡色的 B 末局都要鎖定
    const lockedFullRounds = new Set();
    const semiLockedRounds = new Set();
    let traverseLocked = 0;
    let bSkipLocked = 0;
    $ROUNDS.forEach((round, idx) => {
        if (round?.isTraverse) {
            lockedFullRounds.add(idx);
            traverseLocked++;
        }
        if (round?.skipColorAdjust) {
            lockedFullRounds.add(idx);
            bSkipLocked++;
        }
    });

    log(`SIG: 穿越段 ${traverseLocked}，B段末2局 ${bSkipLocked} 已鎖定`, 'info');

    const sRoundSet = new Set(compute_sidx_for_segment($ROUNDS, 'A'));

    const processRound = (ridx, { force = false } = {}) => {
        if (ridx < 0 || ridx >= $ROUNDS.length) return false;
        const round = $ROUNDS[ridx];
        if (!round || round.segment === 'B') return false;
        // 穿越段不參與卡色調整
        if (round.isTraverse) return false;
        // B 段每段末 2 局跳過卡色調整
        if (round.skipColorAdjust) return false;
        // 段落設定為隨機（空 patterns）→ 不強制卡色，保留初始顏色
        const _rangeRule = CARD_COLOR_RANGE_RULES.find(r => (ridx + 1) >= r.from && (ridx + 1) <= r.to);
        if (_rangeRule && _rangeRule.patterns.length === 0) return false;
        if (!force && (lockedFullRounds.has(ridx) || semiLockedRounds.has(ridx))) return false;

        const patterns = getCardColorPatternsForRound(ridx);
        let sortedPatterns;
        if (CARD_COLOR_MIXED_MODE) {
            // 混和模式：隨機選 pattern，避免集中在 BBBR/RRRB
            sortedPatterns = [...patterns];
            for (let i = sortedPatterns.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [sortedPatterns[i], sortedPatterns[j]] = [sortedPatterns[j], sortedPatterns[i]];
            }
        } else {
            sortedPatterns = patterns
                .map(p => ({ p, s: scoreRound(round, p) }))
                .sort((a, b) => (b.s.match - a.s.match) || (a.s.deficit - b.s.deficit))
                .map(x => x.p);
        }

        for (const pat of sortedPatterns) {
            if (solvePattern(ridx, pat, lockedFullRounds, semiLockedRounds, { rankStrict: force, sRoundSet })) {
                if (force) {
                    lockedFullRounds.add(ridx);
                } else {
                    semiLockedRounds.add(ridx);
                }
                return true;
            }
        }
        return false;
    };

    // 2. 處理所有牌局
    for (let ridx = 0; ridx < $ROUNDS.length; ridx++) {
        processRound(ridx);
    }

    // 3. 穿越段 + B段末2局：排除 BBBR/RRRB，只允許 RRBB/BBRR
    for (let ridx = 0; ridx < $ROUNDS.length; ridx++) {
        const round = $ROUNDS[ridx];
        if (!round || !round.cards || round.cards.length < 4) continue;
        if (!round.isTraverse && !round.skipColorAdjust) continue;
        const colors4 = round.cards.slice(0, 4).map(c => (c && c.back_color) ? c.back_color : '?').join('');
        if (colors4 !== 'BBBR' && colors4 !== 'RRRB') continue;
        const targets = Math.random() < 0.5 ? ['RRBB', 'BBRR'] : ['BBRR', 'RRBB'];
        let fixed = false;
        for (const pat of targets) {
            if (solvePattern(ridx, pat, lockedFullRounds, semiLockedRounds, { rankStrict: false, sRoundSet })) {
                fixed = true;
                break;
            }
        }
        if (!fixed) {
            log(`SIG: 第${ridx + 1}局(鎖定)卡色 ${colors4} 無法改為 RRBB/BBRR，保留原色`, 'warn');
        }
    }

    log('SIG: 卡色邏輯執行完畢。', 'success');
    return $ROUNDS; // 返回修改後的牌局
}

/**
 * 【新增】計分
 */
function scoreRound(r, pattern) {
    if (!r || !r.cards) return { match: 0, deficit: 99 };
    const n = Math.min(4, r.cards.length);
    let match = 0, deficit = 0;
    for (let i = 0; i < n; i++) {
        if (r.cards[i] && r.cards[i].back_color === pattern[i]) match++;
        else deficit++;
    }
    return { match, deficit };
}

/**
 * 【新增】核心:解決一局的卡色
 */
function solvePattern(ridx, pattern, lockedFullRounds, semiLockedRounds, options = {}) {
    const round_to_solve = $ROUNDS[ridx];
    if (!round_to_solve || !round_to_solve.cards) return false;
    const { rankStrict = false, sRoundSet } = options;
    const srSet = sRoundSet instanceof Set ? sRoundSet : new Set();

    const n = Math.min(4, round_to_solve.cards.length); // 只處理前4張
    const sandbox_cards = round_to_solve.cards.map(c => c.clone()); // 建立沙盒

    for (let p = 0; p < n; p++) {
        if (pattern[p] === '_') continue; // 空白位置：不限顏色，跳過
        if (sandbox_cards[p].back_color === pattern[p]) continue;

        const needColor = pattern[p];
        const currentCard = sandbox_cards[p];

        let best_swap_cand = null; // { r_idx, c_idx }

        for (const cand of sourceCandidates(needColor, ridx, p, lockedFullRounds, semiLockedRounds)) {
            const { r: cand_r, c: cand_c, sameRound } = cand;
            const candRound = $ROUNDS[cand_r];
            if (!candRound || !candRound.cards) continue;
            const candCard = candRound.cards[cand_c];
            if (!candCard) continue;

            // === 【保護邏輯】 ===

            // 規則1:必須是相同「牌面」(Rank)
            const isExactRank = (currentCard.rank === candCard.rank);
            const isZeroFamily = ['10', 'J', 'Q', 'K'].includes(currentCard.rank) &&
                ['10', 'J', 'Q', 'K'].includes(candCard.rank);
            const allowRank = rankStrict ? isExactRank : (isExactRank || isZeroFamily);
            if (!allowRank) {
                continue;
            }

            // 規則2:檢查 S 局訊號牌
            const isCurrentSignal = currentCard.isSignalCard();
            const isCandSignal = candCard.isSignalCard();

            if (isCurrentSignal !== isCandSignal) {
                const currentIsSRound = srSet.has(ridx);
                const candIsSRound = srSet.has(cand_r);
                const allowSignalMismatch = currentIsSRound && candIsSRound;
                if (!allowSignalMismatch) {
                    continue;
                }
                if (
                    !willRoundKeepSignal(ridx, p, candCard) ||
                    !willRoundKeepSignal(cand_r, cand_c, currentCard)
                ) {
                    continue;
                }
            }

            // === 保護邏輯結束 ===

            best_swap_cand = { r_idx: cand_r, c_idx: cand_c, sameRound: Boolean(sameRound) };
            break;
        }

        if (best_swap_cand) {
            const { r_idx, c_idx } = best_swap_cand;
            const donorCard = $ROUNDS[r_idx].cards[c_idx];
            sandbox_cards[p] = donorCard;

            swapCards_Internal($ROUNDS,
                { r: ridx, c: p },
                { r: r_idx, c: c_idx }
            );
        } else {
            const colorLabel = needColor === 'R' ? '紅背' : needColor === 'B' ? '藍背' : needColor;
            const cardLabel = currentCard ? currentCard.short() : `位置${p + 1}`;
            log(`卡色交換失敗:第 ${ridx + 1} 局 位置 ${p + 1}(目標 ${colorLabel},牌 ${cardLabel})找不到安全可行的交換方案。`, 'error');
            return false;
        }
    }

    return true;
}

/**
 * 【新增】尋找候選牌
 */
function willRoundKeepSignal(roundIndex, removedIdx, incomingCard) {
    const round = $ROUNDS[roundIndex];
    if (!round || !Array.isArray(round.cards)) return false;
    let hasSignal = false;
    for (let i = 0; i < round.cards.length; i++) {
        if (i === removedIdx) continue;
        const card = round.cards[i];
        if (card && typeof card.isSignalCard === 'function' && card.isSignalCard()) {
            hasSignal = true;
            break;
        }
    }
    if (!hasSignal && typeof incomingCard?.isSignalCard === 'function' && incomingCard.isSignalCard()) {
        hasSignal = true;
    }
    return hasSignal;
}

function* sourceCandidates(needColor, current_ridx, current_pidx, lockedFullRounds, semiLockedRounds) {
    const current_round = $ROUNDS[current_ridx];
    if (!current_round || !current_round.cards) return;

    const extraIndices = [4, 5];
    for (const idx of extraIndices) {
        if (current_round.cards.length > idx && current_round.cards[idx] && current_round.cards[idx].back_color === needColor) {
            yield { r: current_ridx, c: idx, sameRound: true };
        }
    }

    const searchOrder = [];
    for (let i = current_ridx + 1; i < $ROUNDS.length; i++) {
        searchOrder.push(i);
    }
    for (let i = 0; i < current_ridx; i++) {
        searchOrder.push(i);
    }

    for (const i of searchOrder) {
        if (lockedFullRounds.has(i)) continue;
        const round_to_search = $ROUNDS[i];
        if (!round_to_search || !round_to_search.cards) continue;

        const indices = (() => {
            if (semiLockedRounds.has(i)) {
                const out = [];
                for (let q = 4; q < round_to_search.cards.length; q++) out.push(q);
                return out;
            }
            return (i < current_ridx) ? [4, 5] : [0, 1, 2, 3];
        })();
        if (!indices || indices.length === 0) continue;

        for (const q of indices) {
            if (q >= round_to_search.cards.length) continue;
            if (round_to_search.cards[q] && round_to_search.cards[q].back_color === needColor) {
                yield { r: i, c: q, sameRound: false };
            }
        }
    }
}

/**
 * 【新增】在 $ROUNDS 陣列中實際交換兩張牌
 */
function swapCards_Internal(rounds, a, b) {
    if (!a || !b) return;
    const A = rounds?.[a.r]?.cards?.[a.c];
    const B = rounds?.[b.r]?.cards?.[b.c];
    if (A === undefined || B === undefined) {
        log("SIG: 卡色交換失敗:找不到卡牌物件。", 'error');
        return;
    }
    [rounds[a.r].cards[a.c], rounds[b.r].cards[b.c]] = [B, A];
    // const beforeA = rounds[a.r].cards[a.c];
    // const beforeB = rounds[b.r].cards[b.c];
    // log(`卡色交換成功:第 ${a.r + 1} 局 位置 ${a.c + 1}(${beforeA?.short() || '未知'}) ↔ 第 ${b.r + 1} 局 位置 ${b.c + 1}(${beforeB?.short() || '未知'})`, 'success');
}

// ════════════════════════════════════════════════════════════════
// 違規統計功能
// ════════════════════════════════════════════════════════════════

/**
  計算當前牌靴的所有違規統計
 @param {Array} rounds - 局數陣列
  @returns {Object} 包含各種違規數量的物件
 */
function calculateViolationStats(rounds) {
    if (!Array.isArray(rounds) || rounds.length === 0) {
        return {
            signalViolations: 0,
            fourCardViolations: 0,
            streakViolations: 0,
            cardCountMismatchViolations: 0,
            signalViolationRounds: [],
            fourCardBlocks: [],
            streakBlocks: [],
            cardCountMismatchRounds: [],
            cannotSwapViolations: 0,
            cannotSwapRounds: [],
            cardColorViolations: 0,
            cardColorRounds: [],
            cardColorChecked: false
        };
    }

    const signalRounds = [];
    const mismatchRounds = [];

    const getTrueResult = (r) => {
        if (!r || !Array.isArray(r.cards)) return null;
        const handInfo = computeRoundHands(r.cards);
        const p = handInfo.playerTotal;
        const b = handInfo.bankerTotal;
        if (typeof p !== 'number' || typeof b !== 'number') return null;
        if (p === b) return '和';
        return (p > b) ? '閒' : '莊';
    };
    const hasSignal = (r) => {
        if (!r || !Array.isArray(r.cards)) return false;
        return r.cards.some(card => card && isSignalCardByConfig(card));
    };

    // 1. 計算訊號牌違規（S 局下一局必須開莊，非 S 局下一局不能開莊）
    // 匯入外部 xlsx(window.__importedShoeMode=true)時跳過此檢查 — 真實牌局不必符合人造規則
    let signalViolations = 0;

    if (typeof window !== 'undefined' && window.__importedShoeMode === true) {
        // 跳過訊號牌違規檢查
    } else {
        for (let i = 0; i < rounds.length; i++) {
        const currentRound = rounds[i];
        const nextRound = rounds[(i + 1) % rounds.length];
        if (!currentRound || !nextRound) continue;
        // 穿越段不檢查訊號牌違規（穿越段內 A、2 不當訊號牌）
        if (currentRound.isTraverse || nextRound.isTraverse) continue;
        const nextTrue = getTrueResult(nextRound);
        if (!nextTrue) continue;

        let isViolation = false;
        if (hasSignal(currentRound)) {
            if (nextTrue !== '莊') isViolation = true;
        } else {
            if (nextTrue === '莊') isViolation = true;
        }

        if (isViolation) {
            signalViolations++;
            signalRounds.push(i + 1);
        }
        }
    }

    // 2. 計算連續 5 局 4 張牌違規
    const fourCardBlocks = findConsecutiveFourCardBlocks(rounds);
    const fourCardViolations = fourCardBlocks.length;

    // 3. 計算連續莊或閒違規
    // 規則：最多接受2段連續7局，連續8局以上一律違規，超過2段的也算違規
    const allStreakBlocks = (() => {
        const blocks = [];
        let currentSide = null; // '莊' 或 '閒'
        let consecutiveCount = 0;
        let blockStart = -1;
        for (let i = 0; i < rounds.length; i++) {
            // 穿越段視為打斷連續計數
            if (rounds[i] && rounds[i].isTraverse) {
                if (consecutiveCount >= 5) {
                    blocks.push({ startIdx: blockStart, endIdx: i - 1, count: consecutiveCount, side: currentSide });
                }
                currentSide = null;
                consecutiveCount = 0;
                blockStart = -1;
                continue;
            }
            const side = getTrueResult(rounds[i]);
            if (side !== '莊' && side !== '閒') {
                if (consecutiveCount >= 5) {
                    blocks.push({ startIdx: blockStart, endIdx: i - 1, count: consecutiveCount, side: currentSide });
                }
                currentSide = null;
                consecutiveCount = 0;
                blockStart = -1;
                continue;
            }
            if (side === currentSide) {
                consecutiveCount++;
            } else {
                if (consecutiveCount >= 5) {
                    blocks.push({ startIdx: blockStart, endIdx: i - 1, count: consecutiveCount, side: currentSide });
                }
                currentSide = side;
                consecutiveCount = 1;
                blockStart = i;
            }
        }
        if (consecutiveCount >= 5) {
            blocks.push({ startIdx: blockStart, endIdx: rounds.length - 1, count: consecutiveCount, side: currentSide });
        }
        return blocks;
    })();
    // 連續8局以上一律違規；5-7局最多允許2段，超過的算違規
    const streakBlocks = [];
    let allowedCount = 0;
    for (const block of allStreakBlocks) {
        if (block.count >= 8) {
            // 連續8局以上一律違規
            streakBlocks.push(block);
        } else {
            // 5-7局：前2段允許，之後算違規
            allowedCount++;
            if (allowedCount > 2) {
                streakBlocks.push(block);
            }
        }
    }
    const streakViolations = streakBlocks.length;

    // 4. 計算藍底張數違規（卡牌張數 ≠ 莊家使用張數 + 閒家使用張數）
    let cardCountMismatchViolations = 0;
    for (let i = 0; i < rounds.length; i++) {
        const round = rounds[i];
        if (!round || !Array.isArray(round.cards)) continue;
        // 穿越段不檢查藏底張數違規
        if (round.isTraverse) continue;
        const handInfo = computeRoundHands(round.cards);
        const usedCardCount = (handInfo.playerCards?.length || 0) + (handInfo.bankerCards?.length || 0);
        const totalCardCount = round.cards.length;
        if (usedCardCount !== totalCardCount) {
            cardCountMismatchViolations++;
            mismatchRounds.push(i + 1);
        }
    }

    const cardColorRounds = collectCardColorViolationRounds(rounds);
    const cardColorViolations = cardColorRounds.length;

    return {
        signalViolations,
        fourCardViolations,
        streakViolations,
        cardCountMismatchViolations,
        fourCardBlocks,
        streakBlocks,
        signalViolationRounds: signalRounds,
        cardCountMismatchRounds: mismatchRounds,
        cannotSwapViolations: 0,
        cannotSwapRounds: [],
        cardColorViolations,
        cardColorRounds,
        cardColorChecked: true
    };
}

function syncViolationIndexesFromStats(stats) {
    if (typeof statsViolationRoundIndexes === 'undefined') return;
    statsViolationRoundIndexes = new Set();
    if (!stats) return;

    const addRoundNumber = (roundNum) => {
        const idx = Number(roundNum) - 1;
        if (Number.isInteger(idx) && idx >= 0) {
            statsViolationRoundIndexes.add(idx);
        }
    };
    const addRange = (start, end) => {
        if (!Number.isInteger(start) || !Number.isInteger(end)) return;
        for (let i = start; i <= end; i++) {
            statsViolationRoundIndexes.add(i);
        }
    };

    (stats.signalViolationRounds || []).forEach(addRoundNumber);
    (stats.cardCountMismatchRounds || []).forEach(addRoundNumber);
    if (Array.isArray(stats.cannotSwapRounds)) {
        stats.cannotSwapRounds.forEach(addRoundNumber);
    }
    if (Array.isArray(stats.fourCardBlocks)) {
        stats.fourCardBlocks.forEach(block => addRange(block.startIdx, block.endIdx));
    }
    if (Array.isArray(stats.streakBlocks)) {
        stats.streakBlocks.forEach(block => addRange(block.startIdx, block.endIdx));
    }
}

/**
 * 更新違規統計的 UI 顯示
 * @param {Object} stats - 違規統計物件
 */
function updateViolationUI(stats) {
    if (!stats) {
        stats = {
            signalViolations: 0,
            fourCardViolations: 0,
            streakViolations: 0,
            cardCountMismatchViolations: 0,
            cannotSwapViolations: 0,
            cardColorViolations: 0,
            signalViolationRounds: [],
            fourCardBlocks: [],
            streakBlocks: [],
            cardCountMismatchRounds: [],
            cannotSwapRounds: [],
            cardColorRounds: [],
            cardColorChecked: false
        };
    }

    function _applyCard(el, card, hasViol) {
        if (!card) return;
        if (hasViol) { card.classList.remove('no-violation'); card.classList.add('has-violation'); }
        else         { card.classList.remove('has-violation'); card.classList.add('no-violation'); }
    }

    // 1. 訊號牌違規
    const signalEl = document.getElementById('signalViolationDetail');
    if (signalEl) {
        const rounds = stats.signalViolationRounds || [];
        const hasV = stats.signalViolations > 0;
        signalEl.textContent = hasV ? (rounds.length > 0 ? rounds.join(', ') : `${stats.signalViolations}`) : '無';
        _applyCard(signalEl, signalEl.closest('.violation-card'), hasV);
    }

    // 2. 連續5局4張違規
    const fourCardEl = document.getElementById('fourCardViolationDetail');
    if (fourCardEl) {
        const blocks = stats.fourCardBlocks || [];
        const hasV = stats.fourCardViolations > 0;
        fourCardEl.textContent = hasV ? (blocks.length > 0 ? blocks.map(b => `${b.startIdx+1}-${b.endIdx+1}`).join(', ') : `${stats.fourCardViolations}`) : '無';
        _applyCard(fourCardEl, fourCardEl.closest('.violation-card'), hasV);
    }

    // 3. 連續莊閒違規
    const streakEl = document.getElementById('streakViolationDetail');
    if (streakEl) {
        const blocks = stats.streakBlocks || [];
        const hasV = stats.streakViolations > 0;
        streakEl.textContent = hasV ? (blocks.length > 0 ? blocks.map(b => `${b.startIdx+1}-${b.endIdx+1}`).join(', ') : `${stats.streakViolations}`) : '無';
        _applyCard(streakEl, streakEl.closest('.violation-card'), hasV);
    }

    // 4. 無法對調違規
    const cannotSwapEl = document.getElementById('cannotSwapViolationDetail');
    if (cannotSwapEl) {
        const rounds = stats.cannotSwapRounds || [];
        const hasV = stats.cannotSwapViolations > 0;
        cannotSwapEl.textContent = hasV ? (rounds.length > 0 ? rounds.join(', ') : `${stats.cannotSwapViolations}`) : '無';
        _applyCard(cannotSwapEl, cannotSwapEl.closest('.violation-card'), hasV);
    }

    // 5. 其他違規（張數不符 + 卡色）
    const otherEl = document.getElementById('otherViolationDetail');
    const otherCard = otherEl ? otherEl.closest('.violation-card') : null;
    if (otherEl) {
        const allRounds = [];
        if (stats.cardCountMismatchViolations > 0) {
            const rounds = stats.cardCountMismatchRounds || [];
            if (rounds.length > 0) allRounds.push(...rounds); else allRounds.push(stats.cardCountMismatchViolations);
        }
        if (stats.cardColorChecked && stats.cardColorViolations > 0) {
            const rounds = stats.cardColorRounds || [];
            if (rounds.length > 0) allRounds.push(...rounds); else allRounds.push(stats.cardColorViolations);
        }
        const hasV = allRounds.length > 0;
        otherEl.textContent = hasV ? [...new Set(allRounds)].sort((a, b) => a - b).join(', ') : '無';
        _applyCard(otherEl, otherCard, hasV);
    }

    // 同步卡色違規索引供表格亮顯
    if (typeof cardColorViolationIndexes !== 'undefined' && cardColorViolationIndexes instanceof Set) {
        cardColorViolationIndexes.clear();
        let roundsForHighlight = Array.isArray(stats.cardColorRounds) ? stats.cardColorRounds.slice() : [];
        if ((!roundsForHighlight || roundsForHighlight.length === 0) && stats.cardColorViolations > 0 && typeof collectCardColorViolationRounds === 'function' && Array.isArray(currentRounds)) {
            roundsForHighlight = collectCardColorViolationRounds(currentRounds);
            stats.cardColorRounds = roundsForHighlight;
        }
        (roundsForHighlight || []).forEach(roundNum => {
            const idx = Number(roundNum) - 1;
            if (Number.isInteger(idx) && idx >= 0) {
                cardColorViolationIndexes.add(idx);
            }
        });
    }

    syncViolationIndexesFromStats(stats);
    if (typeof applyViolationHighlights === 'function') {
        applyViolationHighlights();
    }
}

/**
 * 在生成或編輯牌靴後自動更新違規統計
 */
function refreshViolationStats() {
    if (typeof currentRounds !== 'undefined' && currentRounds) {
        const stats = calculateViolationStats(currentRounds);
        // 計算無法對調違規
        const cannotSwapResult = calculateCannotSwapViolations(currentRounds);
        stats.cannotSwapViolations = cannotSwapResult.count;
        stats.cannotSwapRounds = cannotSwapResult.rounds;

        updateViolationUI(stats);
    } else {
        updateViolationUI(null);
    }
}

// ════════════════════════════════════════════════════════════════
// 匯入功能 — 從導出的 Excel 反向載入牌靴
// ════════════════════════════════════════════════════════════════

function parseCardLabel(label, pos, backColor) {
    if (!label || typeof label !== 'string') return null;
    label = label.trim();
    if (label.length < 2) return null;
    const suit = label.slice(-1);
    let rank = label.slice(0, -1);
    if (rank === '0') rank = '10';
    if (rank === 'T') rank = '10';
    const card = new Card(rank, suit, pos);
    if (backColor) card.back_color = backColor;
    return card;
}

async function importRoundsFromExcel(file) {
    if (typeof ExcelJS === 'undefined' || !ExcelJS.Workbook) {
        log('ExcelJS 載入失敗，無法匯入。', 'error');
        return;
    }

    try {
        log(`正在匯入: ${file.name}...`, 'info');
        const wb = new ExcelJS.Workbook();
        const buffer = await file.arrayBuffer();
        await wb.xlsx.load(buffer);

        const ws = wb.getWorksheet('原始數據');
        if (!ws) {
            log('找不到「原始數據」工作表，無法匯入。', 'error');
            return;
        }

        // 用 header 動態對應欄位（容錯新舊版）
        const headerMap = {};
        ws.getRow(1).eachCell((cell, colNumber) => {
            const name = String(cell.value || '').trim();
            if (name) headerMap[name] = colNumber;
        });
        const colSegment = headerMap['段標'] || 2;
        const colColorSeq = headerMap['色序'] || 3;
        const colCard1 = headerMap['卡片1'] || 4;
        const colResult = headerMap['結果'] || 10;
        const colSignal = headerMap['訊號'] || 11;

        const rounds = [];
        let globalPos = 0;

        ws.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return;

            const segment = (row.getCell(colSegment).value || '').toString();
            const colorSeq = (row.getCell(colColorSeq).value || '').toString();
            const result = (row.getCell(colResult).value || '').toString();
            const signal = (row.getCell(colSignal).value || '').toString();

            const cards = [];
            for (let i = 0; i < 6; i++) {
                const cellValue = row.getCell(colCard1 + i).value;
                if (!cellValue || cellValue.toString().trim() === '') continue;
                const backColor = colorSeq[i] || '';
                const card = parseCardLabel(cellValue.toString(), globalPos, backColor);
                if (card) {
                    cards.push(card);
                    globalPos++;
                }
            }

            if (cards.length < 4) return;

            const computed = computeRoundResult(cards);
            const finalResult = result || (computed ? computed.result : '');

            const round = {
                start_index: cards[0].pos,
                cards: cards,
                result: finalResult,
                sensitive: true,
                segment: segment || 'A',
            };

            if (signal === 'S') round.isS = true;

            rounds.push(round);
        });

        if (rounds.length === 0) {
            log('匯入失敗：沒有找到有效的局數資料。', 'error');
            return;
        }

        currentRounds = rounds;
        // 匯入外部 xlsx 時跳過訊號牌/連續莊閒/連續4張等「人造規則」違規檢查
        // 「生成牌靴」會自動 reset 這個 flag(見 generateShoe)
        window.__importedShoeMode = true;
        log(`✅ 匯入成功：${rounds.length} 局（已停用訊號牌違規檢查）`, 'success');

        refreshAnalysisAndRender({ mutate: false, skipVerify: true });
        setEditButtonsAvailability(true);
        resetEditState();

        const stats = buildStatsFromRounds();
        log(`莊家局數: ${stats.bankerCount}、閒家局數: ${stats.playerCount}、和局數: ${stats.tieCount}`, 'info');

        // 匯入後跑回復分析,讓「平均N局/最大消耗/4-5-6張局/對調莊6/莊6點贏」面板顯示出來
        try {
            if (typeof analyzeShoeRecovery === 'function' && typeof updateRecoveryDisplay === 'function') {
                const recoveryResult = analyzeShoeRecovery(currentRounds);
                if (recoveryResult) updateRecoveryDisplay(recoveryResult);
            }
        } catch (e) {
            console.warn('匯入後回復分析失敗:', e);
        }

    } catch (error) {
        console.error('匯入失敗:', error);
        log(`匯入失敗: ${error.message}`, 'error');
    }
}

// ════════════════════════════════════════════════════════════════
// 殘牌處理功能 - 依序補牌版（優化）
// 從倒數第二局開始，一局一局往前補滿到 6 張
// 加入智能驗證，確保補牌後結果合理
// ════════════════════════════════════════════════════════════════

/**
 * 計算單局結果（用於驗證）
 * @param {Array} cards - 卡片陣列
 * @return {Object} 包含結果的物件
 */
function computeRoundResult(cards) {
    if (!cards || cards.length < 4) return null;

    // 簡化版的百家樂邏輯計算
    const getPoint = (card) => {
        const rank = card.rank || card.value;
        if (['K', 'Q', 'J', 'T', '10', '0'].includes(rank)) return 0;
        if (rank === 'A' || rank === '1') return 1;
        return parseInt(rank) || 0;
    };

    const p1 = getPoint(cards[0]);
    const b1 = getPoint(cards[1]);
    const p2 = getPoint(cards[2]);
    const b2 = getPoint(cards[3]);

    let pTotal = (p1 + p2) % 10;
    let bTotal = (b1 + b2) % 10;

    let idx = 4;
    const natural = (pTotal >= 8 || bTotal >= 8);

    if (!natural && cards.length > 4) {
        if (pTotal <= 5 && idx < cards.length) {
            const p3 = getPoint(cards[idx++]);
            pTotal = (pTotal + p3) % 10;
        }
        if (bTotal <= 5 && idx < cards.length) {
            const b3 = getPoint(cards[idx++]);
            bTotal = (bTotal + b3) % 10;
        }
    }

    let result;
    if (pTotal > bTotal) result = '閒';
    else if (pTotal < bTotal) result = '莊';
    else result = '和';

    return { result, pTotal, bTotal };
}

/**
 * 智能處理殘牌 - 依序從後往前補牌
 * @param {Array} rounds - 已生成的局數陣列
 * @param {Array} remainingCards - C 段殘牌陣列
 * @returns {Array} 處理後的局數陣列
 */
function distributeRemainingCards(rounds, remainingCards) {
    if (!Array.isArray(remainingCards) || remainingCards.length === 0) {
        return rounds;
    }

    // log(`⚙️ [殘牌處理] 開始分配 ${remainingCards.length} 張殘牌`, 'info');

    if (!Array.isArray(rounds) || rounds.length === 0) {
        log('無法分配殘牌：沒有可用的局', 'error');
        return rounds;
    }

    const lastRoundIndex = rounds.length - 1;
    const lastRound = rounds[lastRoundIndex];
    const lastRoundCardCount = lastRound.cards ? lastRound.cards.length : 0;
    const remainingCount = remainingCards.length;

    log(`📦 C 段殘牌：${remainingCount} 張（第 ${lastRoundIndex + 1} 局）`, 'info');

    // 計算總張數（處理前）
    const totalCardsBefore = rounds.reduce((sum, r) => sum + (r.cards ? r.cards.length : 0), 0);
    log(`處理前總張數：${totalCardsBefore}`, 'info');

    // ==================== 情況 1：5-6 張，可手動調整 ====================
    if (lastRoundCardCount >= 5) {
        log(`✓ 最後一局已有 ${lastRoundCardCount} 張，不需補牌`, 'info');
        log(`→ 將段別從 C 改為 A，並計算正確結果`, 'info');

        // 深層複製避免修改原始資料
        const updatedRounds = rounds.map((r, idx) => {
            const copiedRound = {
                ...r,
                cards: r.cards ? r.cards.map(c => c.clone ? c.clone() : { ...c }) : []
            };
            if (idx === lastRoundIndex) {
                copiedRound.segment = 'A';
                // 嘗試找符合敏感局+卡色的排列
                const sensCandidate = findQualifiedSensitiveOrder(copiedRound.cards, { requireValidColor: true });
                // 和局檢查：最後一局結果一律不允許和局
                // 偵測候選排列是否為原始 B6（不對調，直接看莊6 贏閒≤5），用於 swapBanker6Target 上限檢查
                let candidateIsB6 = false;
                if (sensCandidate && Array.isArray(sensCandidate.ordered)) {
                    const swInfo = computeRoundHands(sensCandidate.ordered);
                    if (swInfo && swInfo.bankerTotal === 6 && swInfo.playerTotal <= 5) {
                        candidateIsB6 = true;
                    }
                }
                // 若 B6 已達上限，不能再讓最後一局變 B6
                const swapB6TargetEl_ = document.getElementById('swapBanker6Target');
                const swapB6Limit_ = swapB6TargetEl_ && swapB6TargetEl_.value !== '' ? parseInt(swapB6TargetEl_.value) : null;
                let currentB6Count_ = 0;
                if (swapB6Limit_ !== null) {
                    for (const rd of rounds) {
                        if (!rd || !Array.isArray(rd.cards) || rd.cards.length < 4) continue;
                        if (rd === rounds[lastRoundIndex]) continue; // 排除最後一局（要替換）
                        const hi_ = computeRoundHands(rd.cards);
                        if (hi_ && hi_.bankerTotal === 6 && hi_.playerTotal <= 5) currentB6Count_++;
                    }
                }
                const b6Overflow = swapB6Limit_ !== null && currentB6Count_ >= swapB6Limit_ && candidateIsB6;
                const candidateOk = sensCandidate && sensCandidate.result !== '和' && !b6Overflow;
                if (candidateOk) {
                    copiedRound.cards = sensCandidate.ordered.map((c, pos) => {
                        if (c && typeof c.clone === 'function') return c.clone(pos);
                        return { ...c, pos };
                    });
                    copiedRound.result = sensCandidate.result;
                    copiedRound.sensitive = true;
                    copiedRound.swap_info = sensCandidate.swap_info || null;
                    log(`  → 最後一局重排為敏感局，結果：${sensCandidate.result}`, 'info');
                } else {
                    // 找不到敏感排列時退回原本計算
                    const computed = computeRoundResult(copiedRound.cards);
                    if (computed) {
                        copiedRound.result = computed.result;
                        log(`  → 最後一局無法排出敏感局，結果更新為：${computed.result}（可能需要修復）`, 'warn');
                    }
                }
            }
            return copiedRound;
        });

        const totalCardsAfter = updatedRounds.reduce((sum, r) => sum + (r.cards ? r.cards.length : 0), 0);
        log(`處理後總張數：${totalCardsAfter}`, 'info');

        return updatedRounds;
    }

    // ==================== 情況 2：≤4 張，需要補牌處理 ====================
    log(`⚠️ 最後一局只有 ${lastRoundCardCount} 張（≤4），開始補牌...`, 'warn');
    log(``, 'info');
    log(`**## 分配策略 ##**`, 'info');
    log(``, 'info');

    // 深層複製前 N-1 局（移除最後一局）
    const updatedRounds = rounds.slice(0, -1).map(r => ({
        ...r,
        cards: r.cards ? r.cards.map(c => {
            if (c.clone) return c.clone();
            if (typeof Card !== 'undefined') return new Card(c.rank, c.suit, c.pos);
            return { ...c };
        }) : [],
        segment: r.segment,
        result: r.result,
        sensitive: r.sensitive,
        start_index: r.start_index
    }));

    // 收集所有殘牌（使用深層複製）
    const allRemainingCards = remainingCards.map(c => {
        if (c.clone) return c.clone();
        if (typeof Card !== 'undefined') return new Card(c.rank, c.suit, c.pos);
        return { ...c };
    });

    log(`→ 移除第 ${lastRoundIndex + 1} 局，需分配 ${allRemainingCards.length} 張牌`, 'info');
    log(``, 'info');

    let distributed = 0;

    // 核心邏輯：從後往前分配殘牌，補完後該局仍需符合敏感局條件
    const formatCardLabel = (card) => {
        if (!card) return '--';
        if (typeof card.short === 'function') return card.short();
        const rank = card.rank ?? '?';
        const suit = card.suit ?? '';
        return `${rank}${suit}`;
    };

    for (let i = updatedRounds.length - 1; i >= 0 && allRemainingCards.length > 0; i--) {
        const round = updatedRounds[i];
        // 穿越段不可被殘牌動到，否則會破壞穿越條件
        if (round && round.isTraverse) continue;
        const currentCardCount = round.cards.length;

        // 計算這一局最多可以補幾張（補到 6 張為止）
        const maxCanAdd = 6 - currentCardCount;

        if (maxCanAdd > 0) {
            log(`🔧 正在處理第 ${i + 1} 局：目前 ${currentCardCount} 張，最多可補 ${maxCanAdd} 張`, 'info');

            let successfullyAdded = 0;
            let failedAttempts = 0;

            while (
                successfullyAdded < maxCanAdd &&
                allRemainingCards.length > 0 &&
                failedAttempts < allRemainingCards.length
            ) {
                const cardToAdd = allRemainingCards.shift();
                const candidate = findQualifiedSensitiveOrder([...round.cards, cardToAdd], { requireValidColor: true });

                if (candidate) {
                    // 和局檢查：補牌後一律不允許產生和局
                    if (candidate.result === '和') {
                        allRemainingCards.push(cardToAdd);
                        failedAttempts++;
                        log(`  ✗ ${formatCardLabel(cardToAdd)} 補入後結果為和局，改試下一張`, 'warn');
                        continue;
                    }

                    // 訊號牌違規檢查：若補牌後此局含訊號牌，下一局必須是莊
                    const hasSignal = candidate.ordered.some(c => c && isSignalCardByConfig(c));
                    const nextRound = updatedRounds[i + 1];
                    if (hasSignal && nextRound && nextRound.result !== '莊') {
                        allRemainingCards.push(cardToAdd);
                        failedAttempts++;
                        log(`  ✗ ${formatCardLabel(cardToAdd)} 補入後有訊號牌但下一局(${i + 2})非莊，改試下一張`, 'warn');
                        continue;
                    }

                    // B6 達上限後，不能讓補牌產生新的 B6（原始莊6：不對調，直接看莊6 贏閒≤5）
                    const _swapB6LimitEl = document.getElementById('swapBanker6Target');
                    const _swapB6Limit = _swapB6LimitEl && _swapB6LimitEl.value.trim() !== '' ? parseInt(_swapB6LimitEl.value) : null;
                    if (_swapB6Limit !== null) {
                        const _swInfo = computeRoundHands(candidate.ordered);
                        const candidateIsB6 = _swInfo && _swInfo.bankerTotal === 6 && _swInfo.playerTotal <= 5;
                        if (candidateIsB6) {
                            let _curB6 = 0;
                            for (const _rd of updatedRounds) {
                                if (!_rd || !Array.isArray(_rd.cards) || _rd.cards.length < 4) continue;
                                if (_rd === round) continue;
                                const _h2 = computeRoundHands(_rd.cards);
                                if (_h2 && _h2.bankerTotal === 6 && _h2.playerTotal <= 5) _curB6++;
                            }
                            if (_curB6 >= _swapB6Limit) {
                                allRemainingCards.push(cardToAdd);
                                failedAttempts++;
                                log(`  ✗ ${formatCardLabel(cardToAdd)} 補入後會讓 B6 超過上限 ${_swapB6Limit}，改試下一張`, 'warn');
                                continue;
                            }
                        }
                    }

                    round.cards = candidate.ordered;
                    round.result = candidate.result;
                    round.sensitive = true;
                    round.swap_info = candidate.swap_info;
                    distributed++;
                    successfullyAdded++;
                    failedAttempts = 0;

                    log(`  ✓ 補入 ${formatCardLabel(cardToAdd)}：此局仍符合敏感局條件`, 'success');
                } else {
                    allRemainingCards.push(cardToAdd);
                    failedAttempts++;
                    log(`  ✗ ${formatCardLabel(cardToAdd)} 無法讓第 ${i + 1} 局維持敏感局（含卡色/訊號牌），改試下一張`, 'warn');
                }
            }

            if (successfullyAdded > 0) {
                log(`  → 完成：第 ${i + 1} 局成功補入 ${successfullyAdded} 張（${currentCardCount} → ${round.cards.length} 張）`, 'info');
            } else if (allRemainingCards.length > 0) {
                log(`  → 第 ${i + 1} 局無法補牌（補入後都不符合敏感局條件）`, 'warn');
            }
            log(``, 'info');
        }

        // 如果已經沒有殘牌了，就停止
        if (allRemainingCards.length === 0) {
            break;
        }
    }

    if (allRemainingCards.length > 0) {
        throw new Error(`仍有 ${allRemainingCards.length} 張殘牌無法在保持敏感局條件下分配`);
    }

    log(``, 'info');
    log(`✅ ${distributed} 張殘牌全部分配完成`, 'success');

    // 驗證總張數
    const totalCardsAfter = updatedRounds.reduce((sum, r) => sum + (r.cards ? r.cards.length : 0), 0);
    log(`處理後總張數：${totalCardsAfter}（預期 ${totalCardsBefore}）`, totalCardsAfter === totalCardsBefore ? 'success' : 'error');

    if (totalCardsAfter !== totalCardsBefore) {
        log(`⚠️ 警告：張數不符！差異 ${totalCardsBefore - totalCardsAfter} 張`, 'error');
    }

    log(`→ 最終共 ${updatedRounds.length} 局`, 'info');

    return updatedRounds;
}

/**
 * 重新計算受影響局的結果（不改變卡片數量）
 */
function recalculateRoundsAfterDistribution(rounds) {
    if (!Array.isArray(rounds)) return rounds;

    log('🔄 重新計算所有局的結果...', 'info');
    let changedCount = 0;

    // 計算總張數（重算前）
    const totalCardsBefore = rounds.reduce((sum, r) => sum + (r.cards ? r.cards.length : 0), 0);

    const updatedRounds = rounds.map((round, idx) => {
        if (!round || !Array.isArray(round.cards) || round.cards.length < 4) {
            return round;
        }

        // 保存原始卡片陣列
        const originalCards = round.cards;

        // 使用 Simulator 計算結果
        const sim = new Simulator(originalCards);
        const simResult = sim.simulate_round(0);

        if (simResult) {
            const oldResult = round.result;
            const updatedRound = {
                ...round,
                result: simResult.result,
                // 保持原始卡片陣列，不使用 simResult.cards
                cards: originalCards
            };

            if (oldResult !== simResult.result) {
                log(`  第 ${idx + 1} 局：${oldResult} → ${simResult.result}`, 'info');
                changedCount++;
            }

            return updatedRound;
        }

        return round;
    });

    // 驗證總張數（重算後）
    const totalCardsAfter = updatedRounds.reduce((sum, r) => sum + (r.cards ? r.cards.length : 0), 0);

    if (totalCardsBefore !== totalCardsAfter) {
        log(`❌ 重算後張數改變！${totalCardsBefore} → ${totalCardsAfter}`, 'error');
    } else {
        log(`✓ 張數保持不變：${totalCardsAfter}`, 'success');
    }

    if (changedCount > 0) {
        log(`⚠️ ${changedCount} 局結果改變，請檢查違規統計`, 'warn');
    } else {
        log(`✓ 所有局結果保持不變`, 'success');
    }

    return updatedRounds;
}
// ============================================================================
// Google Drive 整合功能 (使用 Google Apps Script)
// 在原有 exportRoundsAsExcel 之後自動上傳
// ============================================================================

// Google Apps Script Web App URL
const GOOGLE_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbypt3_PnEL5TgdDPaBwg1M5bWAjQMR9dD5Jslicn3eZCtuNSTtqO35RafhQpuX-l9_m/exec';

/**
 * 產生下一個導出檔名：L001.xlsx, L002.xlsx, ...，編號存於 localStorage 自動遞增
 */
function getNextExportFilename() {
    const key = 'at-export-counter-l2';
    const raw = parseInt(localStorage.getItem(key) || '0', 10);
    const last = Math.max(Number.isFinite(raw) && raw >= 0 ? raw : 0, 20);
    const next = last + 1;
    localStorage.setItem(key, String(next));
    const padded = String(next).padStart(3, '0');
    return `L${padded}.xlsx`;
}

/**
 * 上傳檔案到 Google Drive (透過 Apps Script)
 * 失敗會自動重試最多 3 次（針對 Drive 服務暫時性錯誤）
 */
async function uploadToGoogleDrive(blob, filename) {
    const MAX_ATTEMPTS = 3;
    const base64Data = await blobToBase64(blob);
    const uploadData = {
        filename: filename,
        base64Data: base64Data.split(',')[1]
    };

    let lastError = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            log(`正在上傳到 Google Drive... (第 ${attempt} 次嘗試)`, 'info');

            const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                method: 'POST',
                body: JSON.stringify(uploadData)
            });

            const result = await response.json();

            if (result.success) {
                log(`✓ 已上傳到 Google Drive: ${result.fileName}`, 'success');
                log(`📁 檔案連結: ${result.fileUrl}`, 'info');
                return result;
            }

            // 後端回 success:false → 留下錯誤訊息進入重試
            const errMsg = result.message || result.error || '上傳失敗';
            lastError = new Error(errMsg);
            log(`⚠ 第 ${attempt} 次嘗試失敗：${errMsg}`, 'warn');
        } catch (error) {
            lastError = error;
            log(`⚠ 第 ${attempt} 次嘗試失敗：${error.message || error}`, 'warn');
        }

        // 還沒到最後一次 → 等待後重試（指數退避：2s、4s）
        if (attempt < MAX_ATTEMPTS) {
            const waitMs = 2000 * attempt;
            log(`等待 ${waitMs / 1000} 秒後重試...`, 'info');
            await new Promise(resolve => setTimeout(resolve, waitMs));
        }
    }

    console.error('Google Drive 上傳錯誤（重試 3 次後仍失敗）:', lastError);
    throw lastError;
}

/**
 * 從 Google Drive 載入檔案列表
 */
async function loadFromGoogleDrive() {
    try {
        log('正在從 Google Drive 載入檔案列表...', 'info');

        // 同時載入資料夾和檔案
        const [folderRes, fileRes] = await Promise.all([
            fetch(`${GOOGLE_APPS_SCRIPT_URL}?action=listFolders`).then(r => r.json()).catch(() => null),
            fetch(GOOGLE_APPS_SCRIPT_URL).then(r => r.json())
        ]);

        if (!fileRes.success) {
            throw new Error(fileRes.error || '載入檔案列表失敗');
        }

        const folders = (folderRes && folderRes.success && folderRes.folders) ? folderRes.folders : [];
        let files = fileRes.files || [];

        if (files.length === 0 && folders.length === 0) {
            log('Google Drive 中沒有找到任何檔案', 'warn');
            return;
        }

        // 建立選擇對話框
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:10000;display:flex;align-items:center;justify-content:center;';

        const dialog = document.createElement('div');
        dialog.style.cssText = 'background:#1a1a2e;border:1px solid #444;border-radius:10px;padding:20px;min-width:400px;max-width:500px;color:#eee;font-family:sans-serif;';

        dialog.innerHTML = `
            <h3 style="margin:0 0 15px;color:#ffd700;">從 Google 雲端匯入</h3>
            ${folders.length > 0 ? `
            <label style="display:block;margin-bottom:4px;font-size:13px;color:#aaa;">資料夾</label>
            <select id="driveImportFolder" style="width:100%;padding:8px;margin-bottom:12px;background:#2a2a4a;color:#eee;border:1px solid #555;border-radius:4px;font-size:14px;">
                <option value="">根目錄</option>
                ${folders.map(f => `<option value="${f.id}">${f.name}</option>`).join('')}
            </select>` : ''}
            <label style="display:block;margin-bottom:4px;font-size:13px;color:#aaa;">檔案</label>
            <select id="driveImportFile" style="width:100%;padding:8px;margin-bottom:16px;background:#2a2a4a;color:#eee;border:1px solid #555;border-radius:4px;font-size:14px;">
                ${files.map(f => {
                    const date = new Date(f.lastModified).toLocaleString('zh-TW');
                    return `<option value="${f.id}">${f.name} (${date})</option>`;
                }).join('')}
            </select>
            <div style="display:flex;gap:8px;justify-content:flex-end;">
                <button id="driveImportCancel" style="padding:8px 20px;background:#444;color:#eee;border:none;border-radius:4px;cursor:pointer;font-size:14px;">取消</button>
                <button id="driveImportOk" style="padding:8px 20px;background:#2d6a4f;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:14px;">匯入</button>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        // 資料夾切換時重新載入檔案
        const folderSelect = dialog.querySelector('#driveImportFolder');
        const fileSelect = dialog.querySelector('#driveImportFile');

        if (folderSelect) {
            folderSelect.addEventListener('change', async () => {
                fileSelect.innerHTML = '<option value="">載入中...</option>';
                try {
                    const folderId = folderSelect.value;
                    const url = folderId
                        ? `${GOOGLE_APPS_SCRIPT_URL}?folderId=${folderId}`
                        : GOOGLE_APPS_SCRIPT_URL;
                    const res = await fetch(url);
                    const data = await res.json();
                    files = (data.success && data.files) ? data.files : [];
                    fileSelect.innerHTML = files.length === 0
                        ? '<option value="">沒有檔案</option>'
                        : files.map(f => {
                            const date = new Date(f.lastModified).toLocaleString('zh-TW');
                            return `<option value="${f.id}">${f.name} (${date})</option>`;
                        }).join('');
                } catch (e) {
                    fileSelect.innerHTML = '<option value="">載入失敗</option>';
                }
            });
        }

        // 按鈕事件
        return new Promise((resolve) => {
            dialog.querySelector('#driveImportCancel').onclick = () => {
                overlay.remove();
                log('取消匯入', 'info');
                resolve();
            };
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) { overlay.remove(); resolve(); }
            });
            dialog.querySelector('#driveImportOk').onclick = async () => {
                const fileId = fileSelect.value;
                if (!fileId) { alert('請選擇檔案'); return; }
                const fileName = fileSelect.options[fileSelect.selectedIndex].textContent;
                overlay.remove();

                log(`正在下載: ${fileName}...`, 'info');
                const downloadUrl = `${GOOGLE_APPS_SCRIPT_URL}?fileId=${fileId}`;
                const response = await fetch(downloadUrl);
                const base64Data = await response.text();

                // base64 轉 ArrayBuffer
                const binaryString = atob(base64Data);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }

                const file = new File([bytes.buffer], fileName, {
                    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                });

                log(`✓ 下載完成，正在匯入資料...`, 'success');
                await importRoundsFromExcel(file);
                resolve();
            };
        });

    } catch (error) {
        console.error('從 Google Drive 載入錯誤:', error);
        log(`從 Google Drive 載入失敗: ${error.message}`, 'error');
    }
}

/**
 * 將 Blob 轉換為 Base64
 */
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}


/**
 * 導出牌局為 Excel 並上傳到 Google Drive
 * 這個函數包裝原始的 exportRoundsAsExcel，並在之後上傳
 */
// ========== 導出前違規檢查（包含無法對調 + 卡色）==========

function checkViolationsBeforeExport() {
    if (!currentRounds || currentRounds.length === 0) {
        return { hasViolation: false, stats: null };
    }

    const stats = calculateViolationStats(currentRounds);

    // 新增：計算無法對調違規
    const cannotSwapResult = calculateCannotSwapViolations(currentRounds);
    stats.cannotSwapViolations = cannotSwapResult.count;
    stats.cannotSwapRounds = cannotSwapResult.rounds;

    // 新增：計算卡色違規
    const cardColorRounds = collectCardColorViolationRounds(currentRounds);
    stats.cardColorViolations = cardColorRounds.length;
    stats.cardColorRounds = cardColorRounds;
    stats.cardColorChecked = true;

    const hasViolation =
        (stats.signalViolations > 0) ||
        (stats.fourCardViolations > 0) ||
        (stats.streakViolations > 0) ||
        (stats.cardCountMismatchViolations > 0) ||
        (stats.cannotSwapViolations > 0) ||
        (stats.cardColorViolations > 0);

    return { hasViolation, stats };
}

function calculateCannotSwapViolations(rounds) {
    if (!Array.isArray(rounds) || rounds.length === 0) {
        return { count: 0, rounds: [] };
    }

    let cannotSwapCount = 0;
    const cannotSwapRoundNums = [];

    for (let i = 0; i < rounds.length; i++) {
        const round = rounds[i];
        if (!round || !Array.isArray(round.cards)) continue;
        // 穿越段（A 段）不檢查無法對調
        if (round.isTraverse) continue;

        // 檢查原始牌型是否能完成遊戲
        const canComplete = canCompleteGame(round);
        if (!canComplete) {
            cannotSwapCount++;
            cannotSwapRoundNums.push(i + 1);
            continue;
        }

        // 檢查對調後是否使用張數改變
        const swappedResult = swapFirstTwoCards(round);
        if (swappedResult === null) {
            cannotSwapCount++;
            cannotSwapRoundNums.push(i + 1);
        }
    }

    return { count: cannotSwapCount, rounds: cannotSwapRoundNums };
}

/**
 * 愛心標記：B 段每段最後一局換成 4 張愛心，其他局不能有 4 張愛心
 * 用花色交換（同 rank 不同 suit），不改變局的點數結果
 */
function applyHeartMarking(rounds) {
    if (!Array.isArray(rounds)) {
        log('💗 愛心標記：rounds 不是陣列，跳過', 'warn');
        return;
    }

    const targetIdxSet = new Set();
    rounds.forEach((r, i) => { if (r && r.isHeartMarker) targetIdxSet.add(i); });

    log(`💗 愛心標記檢查：rounds.length=${rounds.length}，目標局=${targetIdxSet.size} 個`, 'info');

    if (targetIdxSet.size === 0) {
        log('💗 沒有 isHeartMarker 標記，跳過', 'warn');
        return;
    }

    const countHearts = (round) => {
        if (!round || !Array.isArray(round.cards)) return 0;
        return round.cards.filter(c => c && c.suit === '♥').length;
    };

    const swapTwoCards = (rA, cA, rB, cB) => {
        const a = rounds[rA] && rounds[rA].cards ? rounds[rA].cards[cA] : null;
        const b = rounds[rB] && rounds[rB].cards ? rounds[rB].cards[cB] : null;
        if (!a || !b) return false;
        // 交換 isTraverseCard：紫色格子要留在原本位置（不跟著卡片走）
        const aWasTraverse = !!a.isTraverseCard;
        const bWasTraverse = !!b.isTraverseCard;
        a.isTraverseCard = bWasTraverse;
        b.isTraverseCard = aWasTraverse;
        rounds[rA].cards[cA] = b;
        rounds[rB].cards[cB] = a;
        return true;
    };

    // Step 1：每個 target round 補滿 4 張愛心
    for (const ti of targetIdxSet) {
        const target = rounds[ti];
        if (!target || !Array.isArray(target.cards)) continue;
        let heartCount = countHearts(target);
        let safety = 30;
        while (heartCount < 4 && safety-- > 0) {
            // 找一張本局非愛心的位置
            let nonHeartIdx = -1;
            for (let i = 0; i < target.cards.length; i++) {
                if (target.cards[i] && target.cards[i].suit !== '♥') { nonHeartIdx = i; break; }
            }
            if (nonHeartIdx === -1) break;
            const nonHeartRank = target.cards[nonHeartIdx].rank;
            const nonHeartBack = target.cards[nonHeartIdx].back_color;

            // 找另一個非 target 的同 rank + 同 back_color 愛心（A 段也可以當來源；紫色標記留在原位）
            let donor = null;
            for (let ri = 0; ri < rounds.length; ri++) {
                if (targetIdxSet.has(ri)) continue;
                const r = rounds[ri];
                if (!r || !Array.isArray(r.cards)) continue;
                for (let ci = 0; ci < r.cards.length; ci++) {
                    const c = r.cards[ci];
                    if (c && c.rank === nonHeartRank && c.suit === '♥' && c.back_color === nonHeartBack) {
                        donor = { r: ri, c: ci };
                        break;
                    }
                }
                if (donor) break;
            }
            if (!donor) {
                log(`💗 第 ${ti + 1} 局找不到 rank=${nonHeartRank} 卡背=${nonHeartBack} 的愛心牌可換`, 'warn');
                break;
            }
            swapTwoCards(ti, nonHeartIdx, donor.r, donor.c);
            heartCount++;
        }
        log(`💗 第 ${ti + 1} 局：${heartCount} 張愛心${heartCount >= 4 ? ' ✓' : ' ✗'}`, heartCount >= 4 ? 'success' : 'warn');
    }

    // Step 2：其他局（含 A 段）如果有 ≥4 張愛心，把多的愛心換成非愛心同 rank
    for (let ri = 0; ri < rounds.length; ri++) {
        if (targetIdxSet.has(ri)) continue;
        const r = rounds[ri];
        if (!r || !Array.isArray(r.cards)) continue;
        let heartCount = countHearts(r);
        let safety = 30;
        while (heartCount >= 4 && safety-- > 0) {
            // 找本局一張愛心
            let heartIdx = -1;
            for (let i = 0; i < r.cards.length; i++) {
                if (r.cards[i] && r.cards[i].suit === '♥') { heartIdx = i; break; }
            }
            if (heartIdx === -1) break;
            const heartRank = r.cards[heartIdx].rank;
            const heartBack = r.cards[heartIdx].back_color;

            // 找另一個非 target、非當前 round、不會因此變 4+ 愛心的同 rank + 同 back_color 非愛心
            let donor = null;
            for (let oi = 0; oi < rounds.length; oi++) {
                if (oi === ri || targetIdxSet.has(oi)) continue;
                const or_ = rounds[oi];
                if (!or_ || !Array.isArray(or_.cards)) continue;
                if (countHearts(or_) >= 3) continue; // 換進來會超過 3 張愛心
                for (let oci = 0; oci < or_.cards.length; oci++) {
                    const c = or_.cards[oci];
                    if (c && c.rank === heartRank && c.suit !== '♥' && c.back_color === heartBack) {
                        donor = { r: oi, c: oci };
                        break;
                    }
                }
                if (donor) break;
            }
            if (!donor) {
                log(`💗 第 ${ri + 1} 局有 ${heartCount} 張愛心，找不到可換的同 rank + 同卡背 非愛心`, 'warn');
                break;
            }
            swapTwoCards(ri, heartIdx, donor.r, donor.c);
            heartCount--;
        }
    }
    log('💗 愛心標記完成', 'success');
}

function collectCardColorViolationRounds(rounds) {
    const violationRounds = [];
    if (!Array.isArray(rounds) || rounds.length === 0) {
        return violationRounds;
    }

    for (let i = 0; i < rounds.length; i++) {
        const round = rounds[i];
        if (!round || !Array.isArray(round.cards) || round.cards.length < 4) continue;
        // 穿越段、B 段末 2 局不檢查卡色違規
        if (round.isTraverse) continue;
        if (round.skipColorAdjust) continue;
        const validPatterns = getValidCardColorStringsForRound(i);
        if (validPatterns === null) continue; // 段落設定為隨機，跳過驗證
        const colors = round.cards.slice(0, 4).map(c => (c && c.back_color) ? c.back_color : '?').join('');
        if (!validPatterns.some(pat => cardColorPatternMatches(pat, colors))) {
            violationRounds.push(i + 1);
        }
    }
    return violationRounds;
}

function calculateCardColorViolations(rounds) {
    return collectCardColorViolationRounds(rounds).length;
}

function showViolationConfirmDialog(stats) {
    return new Promise((resolve) => {
        let message = '⚠️ 檢測到以下違規:\n\n';

        if (stats.signalViolations > 0)
            message += `• 訊號牌違規: ${stats.signalViolations} 處\n`;
        if (stats.fourCardViolations > 0)
            message += `• 連續5局4張牌違規: ${stats.fourCardViolations} 處\n`;
        if (stats.streakViolations > 0)
            message += `• 連續莊/閒違規: ${stats.streakViolations} 處\n`;
        if (stats.cardCountMismatchViolations > 0)
            message += `• 藏底張數違規: ${stats.cardCountMismatchViolations} 處\n`;
        if (stats.cannotSwapViolations > 0)
            message += `• 無法對調違規: ${stats.cannotSwapViolations} 處\n`;
        if (stats.cardColorViolations > 0)
            message += `• 卡色違規: ${stats.cardColorViolations} 處\n`;

        message += '\n是否仍要繼續導出 Excel？';
        resolve(confirm(message));
    });
}

async function exportRoundsAsExcelWithDrive() {
    // === 違規檢查（包含無法對調 + 卡色）===
    const { hasViolation, stats } = checkViolationsBeforeExport();
    if (hasViolation) {
        const userConfirmed = await showViolationConfirmDialog(stats);
        if (!userConfirmed) {
            log('已取消導出，請先修正違規問題。', 'info');
            return;
        }
        log('⚠️ 用戶確認在有違規的情況下繼續導出。', 'warn');
    } else {
        log('✅ 牌局檢查通過，無違規問題。', 'success');
    }

    // === 原有導出邏輯 ===
    if (!ensureRoundsReady('導出')) return;
    if (typeof ExcelJS === 'undefined' || !ExcelJS.Workbook) {
        log('ExcelJS 載入失敗,無法導出Excel。', 'error');
        return;
    }

    const deckCards = flattenDeckFromRounds(currentRounds);
    if (!deckCards.length) {
        log('找不到牌靴資料,請先生成牌靴。', 'error');
        return;
    }

    try {
        const wb = new ExcelJS.Workbook();

        // === 工作表1:預覽 === (完全保留原始代碼)

        // === 工作表1:預覽 === (完全保留原始代碼)
        const ws1 = wb.addWorksheet('預覽');

        const COLS = 21;
        const ROWS = PREVIEW_GRID_ROWS;
        const GROUP = PREVIEW_GRID_GROUP;

        // 計算實際 Excel 欄數（含分隔欄）
        const totalSheetCols = COLS + Math.floor((COLS - 1) / GROUP);  // 21 + 2 = 23
        const lastColStr = totalSheetCols > 26
            ? String.fromCharCode(64 + Math.floor((totalSheetCols - 1) / 26)) + String.fromCharCode(65 + ((totalSheetCols - 1) % 26))
            : String.fromCharCode(64 + totalSheetCols);

        // A4 直向列印設定 — 剛好佔滿一頁
        ws1.properties.defaultRowHeight = 56;
        ws1.pageSetup = {
            paperSize: 9,
            orientation: 'portrait',
            fitToPage: true,
            fitToWidth: 1,
            fitToHeight: 1,
            horizontalCentered: true,
            verticalCentered: false,
            margins: { left: 0.15, right: 0.15, top: 0.15, bottom: 0.15, header: 0.0, footer: 0.0 }
        };

        // 欄寬：資料欄大幅加寬確保撐滿 A4 寬度，分隔欄極窄
        const columnWidths = [];
        for (let colIndex = 0; colIndex < COLS; colIndex++) {
            columnWidths.push(9);
            if ((colIndex + 1) % GROUP === 0 && colIndex < COLS - 1) {
                columnWidths.push(1.5);
            }
        }
        columnWidths.forEach((width, index) => {
            ws1.getColumn(index + 1).width = width;
        });
        // 設定列印範圍
        ws1.pageSetup.printArea = `A1:${lastColStr}${ROWS}`;

        const borderThin = { style: 'thin', color: { argb: 'FF333333' } };
        const borderBold = { style: 'medium', color: { argb: 'FFFF4D4F' } };
        const gridData = buildPreviewGrid(deckCards, currentRounds);
        const MAX = COLS * ROWS;
        const padded = gridData.slice(0, MAX);
        while (padded.length < MAX) padded.push({ className: 'cell', value: '' });

        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const sheetCol = c + 1 + Math.floor(c / GROUP);
                const cellData = padded[r * COLS + c];
                const wsCell = ws1.getCell(r + 1, sheetCol);
                wsCell.value = cellData.value || '';
                wsCell.alignment = { vertical: 'middle', horizontal: 'center' };
                wsCell.font = { name: 'Microsoft JhengHei', size: 36, bold: true, color: { argb: 'FF000000' } };
                wsCell.border = { top: borderThin, left: borderThin, bottom: borderThin, right: borderThin };

                const classes = cellData.className || '';
                const isBankerResult = classes.includes('result-banker');
                const isPlayerResult = classes.includes('result-player');
                const isTieResult = classes.includes('result-tie');
                const isResultCell = isBankerResult || isPlayerResult || isTieResult;
                if (isResultCell) {
                    wsCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
                } else if (classes.includes('card-red')) {
                    wsCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
                    wsCell.font = { ...wsCell.font, color: { argb: 'FF000000' } };
                } else if (classes.includes('card-blue')) {
                    wsCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00CFCF' } };
                    wsCell.font = { ...wsCell.font, color: { argb: 'FFFFFFFF' } };
                }
                if (classes.includes('signal-match')) {
                    wsCell.font = { ...wsCell.font, color: { argb: 'FFDC3545' } };
                }
                if (isBankerResult) {
                    wsCell.font = { ...wsCell.font, color: { argb: 'FFCC0000' } };
                } else if (isPlayerResult) {
                    wsCell.font = { ...wsCell.font, color: { argb: 'FF0033AA' } };
                } else if (isTieResult) {
                    wsCell.font = { ...wsCell.font, color: { argb: 'FF006633' } };
                }
                // 愛心標記局：粉紅色粗框（assistant 會偵測這個邊框顏色）+ 粉紅色文字
                if (classes.includes('heart-marker')) {
                    const heartBorder = { style: 'medium', color: { argb: 'FFFF1493' } };
                    wsCell.border = {
                        top: heartBorder, left: heartBorder, bottom: heartBorder, right: heartBorder
                    };
                    wsCell.font = { ...wsCell.font, color: { argb: 'FF8B00FF' } };
                }
            }
        }

        // === 工作表2:原始數據 === (完全保留原始代碼)
        const ws2 = wb.addWorksheet('原始數據');
        const headers = ['局號', '段標', '色序', '卡片1', '卡片2', '卡片3', '卡片4', '卡片5', '卡片6', '結果', '莊', '閒', '訊號', '對調莊', '對調閒'];
        ws2.addRow(headers);
        const headerRow = ws2.getRow(1);
        headerRow.font = { bold: true };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F3FF' } };

        const sIndexes = new Set(compute_sidx_for_segment(currentRounds, 'A'));

        currentRounds.forEach((round, idx) => {
            const cards = Array.isArray(round?.cards) ? round.cards : [];
            const colorSeq = cards.map(getCardColorCode).join('');
            const row = [
                idx + 1,
                round?.segment || '',
                colorSeq
            ];
            for (let i = 0; i < 6; i++) {
                row.push(cards[i] ? getCardLabel(cards[i]) : '');
            }
            row.push(round?.result || '');

            // 莊家、閒家點數
            const handInfo = (cards.length >= 4) ? computeRoundHands(cards) : null;
            const bankerPt = handInfo && typeof handInfo.bankerTotal === 'number' ? handInfo.bankerTotal : '';
            const playerPt = handInfo && typeof handInfo.playerTotal === 'number' ? handInfo.playerTotal : '';
            row.push(bankerPt);
            row.push(playerPt);

            // 訊號
            const signalTag = sIndexes.has(idx) ? 'S' : '';
            row.push(signalTag);

            // 對調第一二張後的莊家、閒家點數
            let swapBankerPt = '', swapPlayerPt = '';
            if (cards.length >= 4) {
                const swapped = cards.map(c => c && c.clone ? c.clone() : { ...c });
                [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
                const swapInfo = computeRoundHands(swapped);
                if (swapInfo) {
                    if (typeof swapInfo.bankerTotal === 'number') swapBankerPt = swapInfo.bankerTotal;
                    if (typeof swapInfo.playerTotal === 'number') swapPlayerPt = swapInfo.playerTotal;
                }
            }
            row.push(swapBankerPt);
            row.push(swapPlayerPt);

            ws2.addRow(row);
        });

        ws2.columns.forEach(column => {
            column.width = 12;
        });

        // 整頁字體 14，全部置中
        ws2.eachRow((row) => {
            row.eachCell({ includeEmpty: true }, (cell) => {
                cell.font = Object.assign({}, cell.font || {}, { size: 14 });
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
            });
        });

        // === 工作表3:直立式牌靴 === (416張牌垂直排列)
        const ws3 = wb.addWorksheet('直立式牌靴');

        // 將所有牌從第一張排到最後一張，格式同預覽分頁
        for (let i = 0; i < deckCards.length; i++) {
            const card = deckCards[i];
            const cardLabel = getCardLabel(card);
            const backColor = getCardColorCode(card);
            const isSignal = typeof card.isSignalCard === 'function' ? card.isSignalCard() : isSignalCardByConfig(card);

            const dataRow = ws3.addRow([i + 1, cardLabel]);

            // 牌面格：卡背底色（黃=紅卡背, 青=藍卡背）+ 訊號牌紅字
            const cardCell = dataRow.getCell(2);
            cardCell.alignment = { vertical: 'middle', horizontal: 'center' };
            cardCell.font = { size: 16, bold: true, color: { argb: isSignal ? 'FFDC3545' : 'FF000000' } };
            cardCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: backColor === 'R' ? 'FFFFFF00' : 'FF00FFFF' } };

            // 位置格
            const posCell = dataRow.getCell(1);
            posCell.alignment = { vertical: 'middle', horizontal: 'center' };
            posCell.font = { size: 11 };
        }

        // 設定欄寬
        ws3.getColumn(1).width = 8;   // 位置
        ws3.getColumn(2).width = 10;  // 牌面

        // === 工作表4:回復分析統計 === 
        const ws4 = wb.addWorksheet('回復分析統計');

        // 執行回復分析
        const recoveryResult = analyzeShoeRecovery(currentRounds);
        const totalRounds = Array.isArray(currentRounds) ? currentRounds.length : 0;
        let fourCardRounds = 0;
        let fiveCardRounds = 0;
        let sixCardRounds = 0;
        (currentRounds || []).forEach((round) => {
            const cardCount = (round && Array.isArray(round.cards)) ? round.cards.length : 0;
            if (cardCount === 4) fourCardRounds++;
            else if (cardCount === 5) fiveCardRounds++;
            else if (cardCount === 6) sixCardRounds++;
        });
        const fourCardPct = totalRounds > 0 ? ((fourCardRounds / totalRounds) * 100).toFixed(1) : '0.0';
        const fiveCardPct = totalRounds > 0 ? ((fiveCardRounds / totalRounds) * 100).toFixed(1) : '0.0';
        const sixCardPct = totalRounds > 0 ? ((sixCardRounds / totalRounds) * 100).toFixed(1) : '0.0';

        ws4.addRow(['局數統計', '局數', '比例', '備註']);
        ws4.addRow(['4張局', fourCardRounds, `${fourCardPct}%`, `${fourCardRounds}/${totalRounds}`]);
        ws4.addRow(['5張局', fiveCardRounds, `${fiveCardPct}%`, `${fiveCardRounds}/${totalRounds}`]);
        ws4.addRow(['6張局', sixCardRounds, `${sixCardPct}%`, `${sixCardRounds}/${totalRounds}`]);
        ws4.addRow([]);

        if (recoveryResult && recoveryResult.recoveryDetails) {
            const headerRowIndex = ws4.rowCount + 1;
            const headers4 = ['切牌點位置', '回復局數', '消耗牌數', '是否立即回復'];
            ws4.addRow(headers4);
            const headerRow4 = ws4.getRow(headerRowIndex);
            headerRow4.font = { bold: true };
            headerRow4.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F3FF' } };

            // 添加每個切牌點的回復資料
            recoveryResult.recoveryDetails.forEach(detail => {
                const row = [
                    detail.cutPoint + 1,                              // 切牌點位置（從1開始）
                    detail.roundsUsed,                                 // 回復局數
                    detail.cardsUsed,                                  // 消耗牌數
                    detail.immediate ? '是' : (detail.failed ? '失敗' : '否')  // 是否立即回復
                ];
                ws4.addRow(row);
            });

            // 設定欄寬
            ws4.getColumn(1).width = 12;  // 切牌點位置
            ws4.getColumn(2).width = 12;  // 回復局數
            ws4.getColumn(3).width = 12;  // 消耗牌數
            ws4.getColumn(4).width = 15;  // 是否立即回復
        } else {
            ws4.getColumn(1).width = 12;
            ws4.getColumn(2).width = 12;
            ws4.getColumn(3).width = 12;
            ws4.getColumn(4).width = 15;
        }

        // === 生成 Excel 檔案 ===
        const buffer = await wb.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

        // 生成檔名（F01.xlsx, F02.xlsx, ... 自動遞增）
        const filename = getNextExportFilename();

        // === 下載到本機 ===
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        log('合併Excel檔案已導出成功!', 'success');

        // === 上傳到 Google Drive ===
        try {
            await uploadToGoogleDrive(blob, filename);
        } catch (driveError) {
            log('上傳到 Google Drive 時發生錯誤，但本機下載已完成', 'warn');
            console.error('Drive upload error:', driveError);
        }

    } catch (error) {
        console.error('紅0 導出失敗:', error);
        const message = error && error.message ? error.message : error;
        log(`導出失敗:${message}`, 'error');
    }
}

// 牌靴回復分析 V3 - 支援切牌旋轉
function analyzeShoeRecovery(rounds) {
    if (!rounds || rounds.length === 0) {
        return null;
    }

    // 1. 建立原始牌靴的局起點索引表
    const roundStarts = [];
    let totalCards = 0;

    for (let i = 0; i < rounds.length; i++) {
        roundStarts.push(totalCards);
        totalCards += rounds[i].cards.length;
    }

    console.log(`牌靴總共 ${totalCards} 張牌，${rounds.length} 局`);

    // 2. 建立完整牌組
    const fullDeck = [];
    for (const round of rounds) {
        for (const card of round.cards) {
            fullDeck.push(new Card(card.rank, card.suit));
        }
    }

    // 3. 創建旋轉後的牌組函數
    function createRotatedDeck(startIdx) {
        const rotated = [];
        for (let i = 0; i < totalCards; i++) {
            rotated.push(fullDeck[(startIdx + i) % totalCards]);
        }
        return rotated;
    }

    // 4. 模擬每個切牌點
    let sumCards = 0;
    let sumRounds = 0;
    let maxCards = 0;
    let maxRounds = 0;
    let maxCardIdx = -1;
    let maxRoundsIdx = -1;
    let immediateRecovery = 0;

    // 新增：記錄每個切牌點的回復局數
    const recoveryDetails = [];

    // 新增：分佈統計
    const distribution = {
        immediate: 0,      // 立即回復 (0局)
        range1to5: 0,      // 1~5 局
        range6to10: 0,     // 6~10 局
        range11to15: 0,    // 11~15 局
        range16plus: 0     // 16 局以上
    };

    const maxSimRounds = rounds.length * 2;

    for (let cutPoint = 0; cutPoint < totalCards; cutPoint++) {
        // 檢查是否本身就是局起點
        if (roundStarts.includes(cutPoint)) {
            immediateRecovery++;
            distribution.immediate++;
            recoveryDetails.push({ cutPoint, roundsUsed: 0, cardsUsed: 0, immediate: true });
            continue;
        }

        // 創建旋轉後的牌組
        const rotatedDeck = createRotatedDeck(cutPoint);
        const simulator = new Simulator(rotatedDeck);

        let currentIdx = 0;
        let cardsUsed = 0;
        let roundsUsed = 0;
        let recovered = false;

        while (currentIdx < totalCards && roundsUsed < maxSimRounds) {
            const result = simulator.simulate_round(currentIdx, { no_swap: true });
            if (!result) break;

            const used = result.cards.length;
            cardsUsed += used;
            roundsUsed++;
            currentIdx += used;

            const originalIdx = (cutPoint + currentIdx) % totalCards;

            if (roundStarts.includes(originalIdx)) {
                recovered = true;
                sumCards += cardsUsed;
                sumRounds += roundsUsed;

                if (cardsUsed > maxCards) {
                    maxCards = cardsUsed;
                    maxCardIdx = cutPoint;
                }
                if (roundsUsed > maxRounds) {
                    maxRounds = roundsUsed;
                    maxRoundsIdx = cutPoint;
                }

                // 記錄分佈
                if (roundsUsed <= 5) {
                    distribution.range1to5++;
                } else if (roundsUsed <= 10) {
                    distribution.range6to10++;
                } else if (roundsUsed <= 15) {
                    distribution.range11to15++;
                } else {
                    distribution.range16plus++;
                }

                recoveryDetails.push({ cutPoint, roundsUsed, cardsUsed, immediate: false });
                break;
            }
        }

        if (!recovered) {
            console.warn(`切牌點 ${cutPoint} 無法回復（已模擬 ${roundsUsed} 局）`);
            distribution.range16plus++;
            recoveryDetails.push({ cutPoint, roundsUsed, cardsUsed, immediate: false, failed: true });
            sumCards += cardsUsed;
            sumRounds += roundsUsed;
        }
    }

    // 5. 計算統計
    const validCount = totalCards;
    const avgCards = (sumCards / validCount).toFixed(1);
    const avgRounds = (sumRounds / validCount).toFixed(1);
    const immediatePercent = ((immediateRecovery / totalCards) * 100).toFixed(1);

    console.log('=== 回復分析結果 ===');
    console.log('總切牌點:', totalCards);
    console.log('平均消耗:', avgCards, '張 /', avgRounds, '局');
    console.log('最大消耗:', maxCards, '張 /', maxRounds, '局 (第', maxCardIdx + 1, '張)');
    console.log('立即回復:', immediateRecovery, '個 (', immediatePercent, '%)');
    console.log('=== 分佈統計 ===');
    console.log('立即回復 (0局):', distribution.immediate);
    console.log('1~5 局:', distribution.range1to5);
    console.log('6~10 局:', distribution.range6to10);
    console.log('11~15 局:', distribution.range11to15);
    console.log('16 局以上:', distribution.range16plus);

    return {
        totalCards,
        validCount: totalCards,
        avgCards,
        avgRounds,
        maxCards,
        maxRounds,
        maxCardIdx,
        maxRoundsIdx,
        immediateRecovery,
        immediatePercent,
        distribution,
        recoveryDetails
    };
}

