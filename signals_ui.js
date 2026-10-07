// ============================================================
// 切牌功能（修正版 v4）- 加到 signals_ui.js 的最開頭
// 修正：切牌=0 時恢復原始順序
// ============================================================

// 儲存套用時的原始牌序
let originalDeckOrder = null;

// 儲存套用時的原始 rounds（用於切牌=0時恢復）
let originalRounds = null;

// 儲存凍結的網格 HTML
let frozenGridHTML = null;

// 控制換牌預覽功能
let swapPreviewEnabled = false;
const SWAP_PREVIEW_STORAGE_KEY = 'swapPreviewEnabled';

// 追蹤目前是否已有排程中的違規亮顯，避免重複執行造成多餘 reflow
let pendingViolationHighlightFrame = null;
let violationHighlightRetryTimer = null;

// 從 currentRounds 中提取所有牌，按局的順序排列（不用 pos）
function extractDeckFromRounds() {
    if (!Array.isArray(currentRounds) || currentRounds.length === 0) {
        return [];
    }
    
    // 按照局的順序依次提取牌（第1局的牌、第2局的牌...）
    const allCards = [];
    currentRounds.forEach(round => {
        if (round && Array.isArray(round.cards)) {
            round.cards.forEach(card => {
                if (card) {
                    allCards.push(card);
                }
            });
        }
    });
    
    return allCards;
}

// 深拷貝 rounds
function deepCloneRounds(rounds) {
    if (!Array.isArray(rounds)) return [];
    
    return rounds.map(round => {
        const clonedRound = {
            start_index: round.start_index,
            result: round.result,
            sensitive: round.sensitive,
            segment: round.segment,
            isHeartMarker: round.isHeartMarker,
            skipColorAdjust: round.skipColorAdjust,
            isTraverse: round.isTraverse,
            cards: []
        };
        
        if (Array.isArray(round.cards)) {
            clonedRound.cards = round.cards.map(card => {
                if (card && typeof card.clone === 'function') {
                    return card.clone();
                }
                const newCard = new Card(card.rank, card.suit, card.pos);
                newCard.back_color = card.back_color;
                return newCard;
            });
        }
        
        return clonedRound;
    });
}

// 記錄當前牌組的起始順序，並凍結網格
function saveOriginalDeckOrder() {
    // 檢查是否有牌靴資料
    if (!currentRounds || currentRounds.length === 0) {
        log('請先生成牌靴', 'error');
        return false;
    }
    
    const deck = extractDeckFromRounds();
    if (deck.length === 0) {
        log('無法記錄牌序：沒有牌組資料', 'error');
        return false;
    }
    
    // 深拷貝牌組
    originalDeckOrder = deck.map((card, index) => {
        let newCard;
        if (card && typeof card.clone === 'function') {
            newCard = card.clone();
        } else {
            newCard = new Card(card.rank, card.suit, index);
            newCard.back_color = card.back_color;
        }
        // 重新設定 pos 為在牌組中的實際位置
        newCard.pos = index;
        return newCard;
    });
    
    // 深拷貝當前 rounds（用於切牌=0時恢復）
    originalRounds = deepCloneRounds(currentRounds);
    
    // 凍結當前網格
    freezeCurrentGrid();
    
    log('已記錄原始牌序，共 ' + originalDeckOrder.length + ' 張牌', 'success');
    return true;
}

// 凍結當前網格到日誌上方
function freezeCurrentGrid() {
    const currentGrid = document.getElementById('statsGridPreview');
    if (!currentGrid) return;
    
    // 複製當前網格的 HTML
    frozenGridHTML = currentGrid.innerHTML;
    
    // 找到或創建凍結網格容器
    let frozenContainer = document.getElementById('frozenGridContainer');
    
    if (!frozenContainer) {
        // 創建凍結網格的容器
        frozenContainer = document.createElement('div');
        frozenContainer.id = 'frozenGridContainer';
        frozenContainer.className = 'frozen-grid-wrapper';
        frozenContainer.innerHTML = 
            '<div class="frozen-grid-title">【套用時牌序】點擊切牌後可對照</div>' +
            '<div class="grid-preview mini frozen" id="frozenGrid"></div>';
        
        // 插入到日誌區域上方
        const logArea = document.getElementById('logArea');
        if (logArea && logArea.parentNode) {
            logArea.parentNode.insertBefore(frozenContainer, logArea);
        }
    }
    
    // 更新凍結網格內容
    const frozenGrid = document.getElementById('frozenGrid');
    if (frozenGrid) {
        frozenGrid.innerHTML = frozenGridHTML;
    }
    
    // 顯示凍結容器
    frozenContainer.style.display = 'block';
}

// 清除凍結網格
function clearFrozenGrid() {
    const frozenContainer = document.getElementById('frozenGridContainer');
    if (frozenContainer) {
        frozenContainer.style.display = 'none';
    }
    frozenGridHTML = null;
    originalDeckOrder = null;
    originalRounds = null;
}

// 執行切牌
function performCut(cutPosition) {
    if (!originalDeckOrder || originalDeckOrder.length === 0) {
        log('請先點擊「套用」按鈕記錄牌序', 'error');
        return false;
    }
    
    const cutPos = parseInt(cutPosition, 10);
    if (isNaN(cutPos) || cutPos < 0) {
        log('切牌張數必須是 0 或正整數', 'error');
        return false;
    }
    
    if (cutPos >= originalDeckOrder.length) {
        log('切牌張數不能超過牌組總數 (' + originalDeckOrder.length + ')', 'error');
        return false;
    }
    
    // 如果切牌張數是 0，恢復到原始順序
    if (cutPos === 0) {
        if (originalRounds && originalRounds.length > 0) {
            currentRounds = deepCloneRounds(originalRounds);
            
            // 重新渲染
            if (typeof renderRoundsTable === 'function') {
                renderRoundsTable(currentRounds, null);
            }
            if (typeof buildStatsFromRounds === 'function' && typeof updateStats === 'function') {
                updateStats(buildStatsFromRounds());
            }
            if (typeof computeDeckSummary === 'function' && typeof renderDeckSummary === 'function') {
                renderDeckSummary(computeDeckSummary(currentRounds));
            }
            if (typeof renderStatsGridPreview === 'function') {
                renderStatsGridPreview(currentRounds);
            }
            if (typeof resetEditState === 'function') {
                resetEditState();
            }
            // 更新回復分析（切牌/恢復不會觸發 refreshAnalysisAndRender）
            if (typeof runRecoveryAnalysis === 'function') {
                runRecoveryAnalysis();
            }
            
            log('已恢復到原始牌序', 'success');
            return true;
        } else {
            log('無法恢復：沒有原始資料', 'error');
            return false;
        }
    }
    
    // 旋轉牌組：cutPos=1 從第2張開始，cutPos=N 從第N+1張開始
    const rotatedDeck = [];
    for (let i = 0; i < originalDeckOrder.length; i++) {
        const srcIdx = (i + cutPos) % originalDeckOrder.length;
        const srcCard = originalDeckOrder[srcIdx];
        let newCard;
        if (srcCard.clone) {
            newCard = srcCard.clone();
        } else {
            newCard = new Card(srcCard.rank, srcCard.suit, i);
        }
        newCard.pos = i;
        newCard.back_color = srcCard.back_color;
        rotatedDeck.push(newCard);
    }
    
    log('切牌位置: ' + cutPos + '，從原始牌序第 ' + (cutPos + 1) + ' 張開始發牌', 'info');
    
    try {
        // 純發牌模式，不套用任何規則
        const newRounds = simulateRoundsFromDeckPure(rotatedDeck);
        
        if (!newRounds || newRounds.length === 0) {
            log('切牌後重新發牌失敗', 'error');
            return false;
        }
        
        currentRounds = newRounds;
        
        // 重新渲染表格（不做規則驗證）
        if (typeof renderRoundsTable === 'function') {
            renderRoundsTable(currentRounds, null);
        }
        if (typeof buildStatsFromRounds === 'function' && typeof updateStats === 'function') {
            updateStats(buildStatsFromRounds());
        }
        if (typeof computeDeckSummary === 'function' && typeof renderDeckSummary === 'function') {
            renderDeckSummary(computeDeckSummary(currentRounds));
        }
        if (typeof renderStatsGridPreview === 'function') {
            renderStatsGridPreview(currentRounds);
        }
        if (typeof resetEditState === 'function') {
            resetEditState();
        }

        // 更新回復分析（切牌不做規則驗證，但需要同步回復統計）
        if (typeof runRecoveryAnalysis === 'function') {
            runRecoveryAnalysis();
        }
        
        log('切牌完成！共 ' + newRounds.length + ' 局', 'success');
        return true;
        
    } catch (err) {
        log('切牌失敗: ' + (err && err.message ? err.message : err), 'error');
        console.error('切牌錯誤詳情:', err);
        return false;
    }
}

function clearHighlightedCardPos() {
    const els = document.querySelectorAll('#roundsBody span[data-action="card"].highlighted-card-pos');
    els.forEach(el => el.classList.remove('highlighted-card-pos'));
    const rows = document.querySelectorAll('#roundsBody tr.highlighted-row');
    rows.forEach(row => row.classList.remove('highlighted-row'));
}

function highlightGlobalCardPos(cardPos) {
    const pos = Number(cardPos);
    if (!Number.isFinite(pos) || pos < 1) return false;
    if (!Array.isArray(currentRounds) || currentRounds.length === 0) return false;

    const total = currentRounds.reduce((sum, r) => sum + ((r && Array.isArray(r.cards)) ? r.cards.length : 0), 0);
    if (pos > total) return false;

    let cursor = 0;
    let rIdx = -1;
    let cIdx = -1;
    for (let i = 0; i < currentRounds.length; i++) {
        const len = (currentRounds[i] && Array.isArray(currentRounds[i].cards)) ? currentRounds[i].cards.length : 0;
        if (pos <= cursor + len) {
            rIdx = i;
            cIdx = (pos - cursor) - 1;
            break;
        }
        cursor += len;
    }
    if (rIdx < 0 || cIdx < 0) return false;

    clearHighlightedCardPos();
    const el = document.querySelector(`#roundsBody span[data-action="card"][data-r="${rIdx}"][data-c="${cIdx}"]`);
    if (!el) return false;
    el.classList.add('highlighted-card-pos');
    const row = document.querySelector(`#roundsBody tr[data-r="${rIdx}"]`);
    if (row) row.classList.add('highlighted-row');

    // 先把整列捲到畫面中央
    if (typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }

    // 再嘗試捲動卡牌列（水平卷軸），確保目標卡片真的出現在卡牌欄位可視區
    const strip = el.closest('.card-strip');
    if (strip && typeof strip.scrollLeft === 'number') {
        try {
            const stripRect = strip.getBoundingClientRect();
            const elRect = el.getBoundingClientRect();
            const delta = (elRect.left - stripRect.left) - (strip.clientWidth / 2 - elRect.width / 2);
            strip.scrollLeft += delta;
        } catch (_) {}
    }
    return true;
}

function getRoundNumberForCardPosition(cardPos) {
    const pos = Number(cardPos);
    if (!Number.isFinite(pos) || pos < 1) return null;
    if (!Array.isArray(currentRounds) || currentRounds.length === 0) return null;
    let cursor = 0;
    for (let i = 0; i < currentRounds.length; i++) {
        const len = (currentRounds[i] && Array.isArray(currentRounds[i].cards)) ? currentRounds[i].cards.length : 0;
        if (pos <= cursor + len) {
            return i + 1;
        }
        cursor += len;
    }
    return null;
}

// 從牌組模擬發牌（純模式，不套用任何規則）
function simulateRoundsFromDeckPure(deck) {
    if (!Array.isArray(deck) || deck.length < 4) {
        return [];
    }
    
    const rounds = [];
    let currentIdx = 0;
    
    while (currentIdx + 4 <= deck.length) {
        // 手動模擬百家樂發牌
        const roundCards = [];
        let idx = currentIdx;
        
        // 前四張牌
        if (idx + 3 >= deck.length) break;
        const p1 = deck[idx++];
        const b1 = deck[idx++];
        const p2 = deck[idx++];
        const b2 = deck[idx++];
        
        roundCards.push(p1, b1, p2, b2);
        
        let playerTotal = (p1.point() + p2.point()) % 10;
        let bankerTotal = (b1.point() + b2.point()) % 10;
        
        const natural = (playerTotal >= 8 || bankerTotal >= 8);
        
        if (!natural) {
            // 閒家補牌規則
            if (playerTotal <= 5) {
                if (idx >= deck.length) break;
                const p3 = deck[idx++];
                roundCards.push(p3);
                const p3Val = p3.point();
                playerTotal = (playerTotal + p3Val) % 10;
                
                // 莊家根據閒家第三張決定是否補牌
                let bankerDraws = false;
                if (bankerTotal <= 2) {
                    bankerDraws = true;
                } else if (bankerTotal === 3 && p3Val !== 8) {
                    bankerDraws = true;
                } else if (bankerTotal === 4 && [2,3,4,5,6,7].includes(p3Val)) {
                    bankerDraws = true;
                } else if (bankerTotal === 5 && [4,5,6,7].includes(p3Val)) {
                    bankerDraws = true;
                } else if (bankerTotal === 6 && [6,7].includes(p3Val)) {
                    bankerDraws = true;
                }
                
                if (bankerDraws) {
                    if (idx >= deck.length) break;
                    const b3 = deck[idx++];
                    roundCards.push(b3);
                    bankerTotal = (bankerTotal + b3.point()) % 10;
                }
            } else {
                // 閒家不補牌，莊家 <= 5 補牌
                if (bankerTotal <= 5) {
                    if (idx >= deck.length) break;
                    const b3 = deck[idx++];
                    roundCards.push(b3);
                    bankerTotal = (bankerTotal + b3.point()) % 10;
                }
            }
        }
        
        // 決定結果
        let result;
        if (playerTotal === bankerTotal) {
            result = '和';
        } else if (playerTotal > bankerTotal) {
            result = '閒';
        } else {
            result = '莊';
        }
        
        // 建立局資訊
        const round = {
            start_index: currentIdx,
            cards: roundCards,
            result: result,
            sensitive: false,
            segment: 'CUT'
        };
        
        rounds.push(round);
        currentIdx = idx;
    }
    
    return rounds;
}

// 更新訊號牌張數顯示
function updateSignalCardCount() {
    // 收集花色選擇
    // 先讀圓形按鈕
let suits = Array.from(document.querySelectorAll('.suit-button.selected'))
  .map(btn => btn.dataset.value);

// 若沒有圓形按鈕(或沒選),才退回舊的 checkbox
if (suits.length === 0) {
  suits = Array.from(document.querySelectorAll('.suit-checkbox:checked'))
    .map(cb => cb.value);
}

    
    // 收集數字選擇
    // 優先從數字按鈕(.rank-button.selected)讀取，如有則使用；
    // 若按鈕沒有選中項目，再退回讀取隱藏的 .rank-checkbox。
    let ranks = Array.from(document.querySelectorAll('.rank-button.selected'))
        .map(btn => btn.dataset.value);
    if (ranks.length === 0) {
        ranks = [];
        document.querySelectorAll('.rank-checkbox:checked').forEach(cb => {
            ranks.push(cb.value);
        });
    }
    
    // 計算總張數 (花色數量 × 數字數量 × 8副牌)
    const totalCards = suits.length * ranks.length * 8;
    
    // 更新顯示
    const countElement = document.getElementById('signalCardCount');
    if (countElement) {
        countElement.textContent = totalCards;
        countElement.style.color = '#3A342F';
    }
}

// 應用訊號設定
function applySignalConfig() {
    // 先讀圓形按鈕
let suits = Array.from(document.querySelectorAll('.suit-button.selected'))
  .map(btn => btn.dataset.value);

// 若沒有圓形按鈕(或沒選),才退回舊的 checkbox
if (suits.length === 0) {
  suits = Array.from(document.querySelectorAll('.suit-checkbox:checked'))
    .map(cb => cb.value);
}

    
    // 收集數字選擇
    const ranks = [];
    document.querySelectorAll('.rank-checkbox:checked').forEach(cb => {
        ranks.push(cb.value);
    });
    
    const updated = persistSignalConfig({ suits, ranks });
    const expectedTotal = updated.suits.length * updated.ranks.length * 8;
    
    log(`訊號設定已更新:花色[${updated.suits.join(',')}] 數字[${updated.ranks.join(',')}] (預計訊號牌總數:${expectedTotal}張)`, 'success');
    updateSignalConfigDisplay();
}

// 更新訊號牌設定顯示
function updateSignalConfigDisplay() {
    const el = document.getElementById('signalConfigDisplay');
    if (!el) return;
    const suits = (SIGNAL_CONFIG.suits || []).join('');
    const ranks = (SIGNAL_CONFIG.ranks || []).join(',');
    if (suits && ranks) {
        el.textContent = `${suits} ${ranks}`;
    } else {
        el.textContent = '';
    }
}

// 根據傳入設定或 UI 直接更新訊號配置
function updateSignalConfig(newConfig) {
    const hasExternalConfig = newConfig && typeof newConfig === 'object' &&
        (Array.isArray(newConfig.suits) || Array.isArray(newConfig.ranks));

    if (hasExternalConfig) {
        const suits = Array.isArray(newConfig.suits) ? newConfig.suits : SIGNAL_CONFIG.suits;
        const ranks = Array.isArray(newConfig.ranks) ? newConfig.ranks : SIGNAL_CONFIG.ranks;
        persistSignalConfig({ suits, ranks });
        syncUiFromSignalConfig();
        updateSignalConfigDisplay();
        return;
    }

    applySignalConfig();
}

// 搭配主程式的封裝函式，轉發至核心生成器
function generateShoe_Signal(...args) {
    return generateShoe(...args);
}





// 取得所有花色圓形按鈕（供其他邏輯重用）
function getSuitButtons() {
    return Array.from(document.querySelectorAll('.suit-button'));
}

// 清除花色與數字選擇，並更新顯示
function clearSignalSelections() {
    // 清空花色按鈕與對應 checkbox
    getSuitButtons().forEach(btn => btn.classList.remove('selected'));
    document.querySelectorAll('.suit-checkbox').forEach(cb => {
        cb.checked = false;
    });

    // 清空數字 checkbox 與圓形按鈕
    document.querySelectorAll('.rank-checkbox').forEach(cb => {
        cb.checked = false;
    });

    updateSignalCardCount();
}

// 清除訊號牌設定（UI + 儲存的設定 + localStorage）
function clearSignalConfig() {
    clearSignalSelections();
    persistSignalConfig({ suits: [], ranks: [] });
    updateSignalConfigDisplay();
    if (typeof log === 'function') log('訊號牌設定已清除', 'success');
}


// 將 UI 的選單狀態同步為目前儲存的訊號設定
function syncUiFromSignalConfig() {
    if (typeof document === 'undefined') return;
    const suits = Array.isArray(SIGNAL_CONFIG.suits) ? SIGNAL_CONFIG.suits : [];
    const ranks = Array.isArray(SIGNAL_CONFIG.ranks) ? SIGNAL_CONFIG.ranks : [];
    const suitSet = new Set(suits);
    const rankSet = new Set(ranks);

    const suitButtons = document.querySelectorAll('.suit-button');
    suitButtons.forEach(btn => {
        const value = btn.dataset ? btn.dataset.value : btn.value;
        if (value && suitSet.has(value)) {
            btn.classList.add('selected');
        } else {
            btn.classList.remove('selected');
        }
    });

    document.querySelectorAll('.rank-checkbox').forEach(cb => {
        cb.checked = rankSet.has(cb.value);
    });
    document.querySelectorAll('.rank-button').forEach(btn => {
        const value = btn.dataset ? btn.dataset.value : null;
        if (value && rankSet.has(value)) btn.classList.add('selected');
        else btn.classList.remove('selected');
    });

    if (typeof updateSignalCardCount === 'function') {
        updateSignalCardCount();
    }
    // 更新訊號牌設定顯示文字
    const configEl = document.getElementById('signalConfigDisplay');
    if (configEl) {
        const suitStr = suits.join('');
        const rankStr = ranks.join(',');
        configEl.textContent = (suitStr && rankStr) ? `${suitStr} × ${rankStr}` : '';
    }
}


if (typeof window !== 'undefined') {
    // Avoid overwriting existing implementations, but ensure the global
    // functions are set when absent.
    if (typeof window.updateSignalCardCount !== 'function') {
        window.updateSignalCardCount = updateSignalCardCount;
    }
    if (typeof window.applySignalConfig !== 'function') {
        window.applySignalConfig = applySignalConfig;
    }
    if (typeof window.syncSignalUiFromConfig !== 'function') {
        window.syncSignalUiFromConfig = syncUiFromSignalConfig;
    }
    if (typeof window.clearSignalSelections !== 'function') {
        window.clearSignalSelections = clearSignalSelections;
    }
    if (typeof window.clearSignalConfig !== 'function') {
        window.clearSignalConfig = clearSignalConfig;
    }
    if (typeof window.updateSignalConfigDisplay !== 'function') {
        window.updateSignalConfigDisplay = updateSignalConfigDisplay;
    }
}

// 更新訊號牌張數顯示
// 完整複製多重洗牌邏輯
function multi_pass_candidates_from_cards_simple(card_pool) {
    if (card_pool.length < 2) return []; // 改為至少需要2張牌
    
    // 複製一份牌池並隨機洗牌    
    let shuffled = [...card_pool];
    shuffle(shuffled);   
    
    const temp_cards = shuffled.map((c, i) => c.clone(i));
    const idx2orig = new Map(shuffled.map((c, i) => [i, c]));
    const temp_sim = new Simulator(temp_cards);
    
    const out = []; 
    const used_idx = new Set();
    let i = 0;
    
    while (i < temp_cards.length - 1) { // 改為至少保留1張牌      
        if (used_idx.has(i)) { i++; continue; }
        
        const r = temp_sim.simulate_round(i); 
        if (!r) { i++; continue; }
        
        const temp_indices = r.cards.map(c => c.pos);
        if (temp_indices.some(ti => used_idx.has(ti))) { i++; continue; }
        
        if (!r.sensitive) { i += r.cards.length; continue; } 
        if (typeof shouldSkipSensitiveRound === 'function' && shouldSkipSensitiveRound(r)) {
            i += r.cards.length;
            continue;
        }
        
        // 準備把臨時卡牌對照回原始卡牌     
        const ordered = [];
        const seen = new Set();
        let valid = true;
        
        for (const ti of temp_indices) {
            const oc = idx2orig.get(ti);
            if (seen.has(oc.pos)) { valid = false; break; }
            ordered.push(oc); 
            seen.add(oc.pos);
        }
        
        if (!valid) { i++; continue; }
        
        const start_pos = ordered[0].pos;
        out.push({
            start_index: start_pos,
            cards: ordered,
            result: r.result,
            sensitive: true
        });
        
        temp_indices.forEach(ti => used_idx.add(ti));
        i = Math.max(...temp_indices) + 1;
    }
   
    return out;
}


// 完整複製原系統的AC段排列邏輯
function pack_all_sensitive_and_segment(deck) {
    log(`🔍 開始處理：總共 ${deck.length} 張牌`, 'info');

    // ===== 穿越段挑選（在敏感局掃描之前）=====
    const segCount = parseInt(document.getElementById('traverseSegCountToggle')?.value) || 0;
    const traverseEnabled = segCount > 0;
    const traverseGroups = []; // [[round, round, ...], ...]
    const traverseUsedPos = new Set();

    if (traverseEnabled && typeof TraverseSegment !== 'undefined') {
        const segLenMin = parseInt(document.getElementById('traverseSegLenMin')?.value) || 11;
        const segLenMax = parseInt(document.getElementById('traverseSegLenMax')?.value) || 14;
        const firstSensitive = document.getElementById('traverseFirstSensitive')?.checked !== false;
        const tieLast = document.getElementById('traverseTieLast')?.checked !== false;
        const isExcludeOn = document.getElementById('traverseExcludeToggle')?.classList.contains('selected');
        const excludePoints = new Set();
        if (isExcludeOn) {
            document.querySelectorAll('.trv-exclude-btn.selected').forEach(btn => {
                const rank = btn.dataset.value;
                if (['10', 'J', 'Q', 'K'].includes(rank)) excludePoints.add(0);
                else if (rank === 'A') excludePoints.add(1);
                else { const n = parseInt(rank); if (!isNaN(n)) excludePoints.add(n); }
            });
        }

        const lengths = [];
        for (let L = segLenMax; L >= segLenMin; L--) lengths.push(L);

        log(`🟣 穿越段挑選：${segCount} 段 × ${segLenMin}-${segLenMax} 張, 第一局敏感=${firstSensitive}, 和局=${tieLast}, 排除點數=${[...excludePoints].join(',') || '無'}`, 'info');

        const segments = TraverseSegment.pickTraverseSegments(deck, {
            count: segCount,
            lengths,
            tieLast,
            excludePoints,
            firstSensitive,
            buildMode: 'auto',
            log,
        });

        if (!segments) {
            throw new Error(`穿越段挑選失敗：找不到 ${segCount} 段（${segLenMin}-${segLenMax} 張）`);
        }

        // 把每段拆成 round 物件
        for (const seg of segments) {
            const rounds = TraverseSegment.buildTraverseRounds(seg.cards, {
                Simulator,
                makeRoundInfo,
            });
            traverseGroups.push(rounds);
            // 標記這段牌位已用（用 card.pos）
            for (const c of seg.cards) traverseUsedPos.add(c.pos);
            log(`🟣 穿越段 (${seg.length} 張, ${rounds.length} 局)`, 'info');
        }
    }

    const sim = new Simulator(deck);
    // 掃描所有敏感局
    const scanSensitive = (typeof scan_all_sensitive_rounds === 'function')
        ? scan_all_sensitive_rounds
        : (window.SignalLogic && window.SignalLogic.helpers && window.SignalLogic.helpers.scan_all_sensitive_rounds);
    if (typeof scanSensitive !== 'function') {
        throw new Error('scan_all_sensitive_rounds 未定義');
    }
    const all_sensitive = scanSensitive(sim);
    log(`🔍 自然掃描敏感局：找到 ${all_sensitive.length} 局`, 'info');
    // 記錄已用過的牌位置（先把穿越段的位置塞進去，後續敏感局挑選會自動避開）
    const used_pos = new Set(traverseUsedPos);
    // 儲存 A 段敏感局（注意：這裡的 a_rounds 是 AT666 既有的「敏感局集合」，UI 上稱為「B 段」）
    const a_rounds = [];

    // 4張局比例控制：讀取 UI 上限設定，預估總局數約 88 局
    const fourCardRateLimit = (typeof getMaxFourCardRateSetting === 'function') ? getMaxFourCardRateSetting() : null;
    const estimatedTotalRounds = 88;
    const maxFourCardRounds = (fourCardRateLimit && fourCardRateLimit > 0)
        ? Math.floor(estimatedTotalRounds * (fourCardRateLimit / 100))
        : Infinity;
    let fourCardCount = 0;

    // 七點逆轉上限控制
    const max7PtInput = document.getElementById('max7PtReversal');
    const max7PtLimit = max7PtInput && max7PtInput.value !== '' ? parseInt(max7PtInput.value) : null;
    let sevenPtReversalCount = 0;

    const is7PtReversal = (round) => {
        if (!round || !Array.isArray(round.cards) || round.cards.length < 5) return false;
        if (!round.result || round.result === '和') return false;
        const pt = (c) => {
            if (!c) return 0;
            const rank = c.rank || c.value;
            if (['K', 'Q', 'J', 'T', '10', '0'].includes(rank)) return 0;
            if (rank === 'A' || rank === '1') return 1;
            return parseInt(rank) || 0;
        };
        const pi = (pt(round.cards[0]) + pt(round.cards[2])) % 10;
        const bi = (pt(round.cards[1]) + pt(round.cards[3])) % 10;
        if (pi >= 8 || bi >= 8) return false;
        if (pi !== 7 && bi !== 7) return false;
        const who7 = pi === 7 ? '閒' : '莊';
        return (who7 === '閒' && round.result === '莊') || (who7 === '莊' && round.result === '閒');
    };

    // 莊6局數上限：空白=不檢查、有值=上限
    const swapB6Input = document.getElementById('swapBanker6Target');
    const swapB6LimitRaw = swapB6Input ? swapB6Input.value.trim() : '';
    const swapB6Limit = swapB6LimitRaw !== '' ? parseInt(swapB6LimitRaw) : null;
    let swapB6Count = 0;

    // 原始莊6：不對調，直接看莊家點數=6 且閒≤5（即原始牌型即為莊6贏）
    const isSwapBankerSix = (round) => {
        if (!round || !Array.isArray(round.cards) || round.cards.length < 4) return false;
        const info = computeRoundHands(round.cards);
        if (!info || typeof info.bankerTotal !== 'number' || typeof info.playerTotal !== 'number') return false;
        return info.bankerTotal === 6 && info.playerTotal <= 5;
    };

    // 檢查整局是否不含訊號牌（B6 必須不含訊號牌，才能避免 S 局規則衝突）
    const hasNoSignalCard = (round) => {
        if (!round || !Array.isArray(round.cards)) return false;
        if (typeof isSignalCardByConfig !== 'function') return true;
        return !round.cards.some(c => c && isSignalCardByConfig(c));
    };

    // 上限模式：不再優先挑 B6，自然挑選時遇到就跳過超出上限的

    // 共用：把一個 round 加入 a_rounds 並更新 used_pos / 計數（含所有上限檢查）
    const tryAddSensitive = (r) => {
        if (!r || !Array.isArray(r.cards) || r.cards.length === 0) return false;
        if (typeof shouldSkipSensitiveRound === 'function' && shouldSkipSensitiveRound(r)) return false;
        if (r.cards.some(c => used_pos.has(c.pos))) return false;
        if (r.cards.length === 4 && fourCardCount >= maxFourCardRounds) return false;
        if (max7PtLimit !== null && is7PtReversal(r) && sevenPtReversalCount >= max7PtLimit) return false;
        if (swapB6Limit !== null && swapB6Count >= swapB6Limit && isSwapBankerSix(r)) return false;
        r.segment = 'A';
        a_rounds.push(r);
        r.cards.forEach(c => used_pos.add(c.pos));
        if (r.cards.length === 4) fourCardCount++;
        if (is7PtReversal(r)) sevenPtReversalCount++;
        if (isSwapBankerSix(r)) swapB6Count++;
        return true;
    };

    // ===== 6 張敏感局優先挑選（目標由 UI 設定，空白=隨機不優先）=====
    const sixCardTargetInput = document.getElementById('sixCardTarget');
    const sixCardTargetRaw = sixCardTargetInput ? sixCardTargetInput.value.trim() : '';
    const SIX_CARD_TARGET = sixCardTargetRaw === '' ? 0 : Math.max(0, parseInt(sixCardTargetRaw) || 0);
    const MAX_SIX_CARD_RESHUFFLE = 100;
    let sixCardPicked = 0;

    if (SIX_CARD_TARGET > 0) {
        // Phase 1：從自然掃描的 all_sensitive 挑 6 張的
        for (const r of all_sensitive) {
            if (sixCardPicked >= SIX_CARD_TARGET) break;
            if (r.cards.length !== 6) continue;
            if (tryAddSensitive(r)) sixCardPicked++;
        }
        log(`🔍 ✅ 6張敏感局 Phase1（自然掃描）：${sixCardPicked}/${SIX_CARD_TARGET} 局`, 'info');

        // Phase 2：不夠 → 重新洗牌補 6 張敏感局
        if (sixCardPicked < SIX_CARD_TARGET) {
            let reshuffleAttempts = 0;
            let phase2Added = 0;
            while (sixCardPicked < SIX_CARD_TARGET && reshuffleAttempts < MAX_SIX_CARD_RESHUFFLE) {
                reshuffleAttempts++;
                const remaining = deck.filter(c => !used_pos.has(c.pos));
                if (remaining.length < 6) break;
                const cands = multi_pass_candidates_from_cards_simple(remaining);
                if (!Array.isArray(cands)) continue;
                const sixCand = cands.find(r => r && Array.isArray(r.cards) && r.cards.length === 6);
                if (!sixCand) continue;
                if (tryAddSensitive(sixCand)) {
                    sixCardPicked++;
                    phase2Added++;
                }
            }
            const phase2Prefix = sixCardPicked >= SIX_CARD_TARGET ? '🔍 ✅' : '🔍 ⚠️';
            log(`${phase2Prefix} 6張敏感局 Phase2（重洗 ${reshuffleAttempts} 次）：補 ${phase2Added} 局，累計 ${sixCardPicked}/${SIX_CARD_TARGET}`,
                sixCardPicked >= SIX_CARD_TARGET ? 'success' : 'warn');
        }
    }

    // 把所有敏感局加入 A 段（按原始順序，已塞過的會被 used_pos 自動跳過；4/5/6 張都收）
    for (const r of all_sensitive) {
        tryAddSensitive(r);
    }
    log(`🔍 自然敏感局加入完成：A段 ${a_rounds.length} 局(4張=${fourCardCount}${SIX_CARD_TARGET > 0 ? `, 6張優先=${sixCardPicked}` : ''})，已用牌 ${used_pos.size} 張`, 'info');
    
    // 持續多重洗牌挑選敏感局
    const MAX_MULTI_PASS_ATTEMPTS = 200;
    let multi_pass_attempts = 0;
    
    const harvestAdditionalSensitiveRounds = (label = '多重洗牌') => {
        let attempts = 0;
        let added = 0;
        while (attempts < MAX_MULTI_PASS_ATTEMPTS) {
        const remaining = deck.filter(c => !used_pos.has(c.pos));
        if (remaining.length <= MULTI_PASS_MIN_CARDS) {
            // 剩餘牌數 ≤ 6:只要能湊出敏感局,就把它當成一個正常回合附加進結果
            if (remaining.length >= 4 && canFormSensitiveRound(remaining)) {
                const tempCards = remaining.map((c, i) => c.clone(i));
                const tempSim = new Simulator(tempCards);
                const last = tempSim.simulate_round(0);
                if (last && last.sensitive) {
                    if (typeof shouldSkipSensitiveRound === 'function' && shouldSkipSensitiveRound(last)) {
                        return null;
                    }
                    // 將排列結果映射回原始卡牌(保持正確的 pos / 引用)
                    const orderedOriginalCards = last.cards.map(cloneCard => {
                        const original = remaining[cloneCard.pos];
                        return original;
                    });
                    const startPos = orderedOriginalCards.length ? orderedOriginalCards[0].pos : 0;
                    const finalRound = makeRoundInfo(startPos, orderedOriginalCards, last.result, true);
                    // 七點逆轉已達上限就跳過
                    if (max7PtLimit !== null && is7PtReversal(finalRound) && sevenPtReversalCount >= max7PtLimit) {
                        return null;
                    }
                    // B6 達上限就不再加入新的 B6 局
                    if (swapB6Limit !== null && swapB6Count >= swapB6Limit && isSwapBankerSix(finalRound)) {
                        return null;
                    }
                    finalRound.segment = 'A';
                    a_rounds.push(finalRound);
                    orderedOriginalCards.forEach(card => used_pos.add(card.pos));
                    if (last.cards.length === 4) fourCardCount++;
                    if (is7PtReversal(finalRound)) sevenPtReversalCount++;
                    if (isSwapBankerSix(finalRound)) swapB6Count++;
                    break;
                }
            }
            return null;
        }
        
        const cands = multi_pass_candidates_from_cards_simple(remaining);
        // 4 張局已達上限就跳過，七點逆轉已達上限也跳過，B6 達上限不再挑 B6
        const isValidCandidate = (r) => Array.isArray(r.cards) && r.cards.length > 0
                && !r.cards.some(c => used_pos.has(c.pos))
                && !(r.cards.length === 4 && fourCardCount >= maxFourCardRounds)
                && !(max7PtLimit !== null && is7PtReversal(r) && sevenPtReversalCount >= max7PtLimit)
                && !(swapB6Limit !== null && swapB6Count >= swapB6Limit && isSwapBankerSix(r));
        // 上限模式：不再優先挑 B6，按候選順序就好
        let picked = Array.isArray(cands) ? cands.find(r => isValidCandidate(r)) : cands;
            
        // 檢查挑出來的敏感局是否合法
        if (!picked || !Array.isArray(picked.cards) || picked.cards.length === 0) {
             multi_pass_attempts++;
            if (multi_pass_attempts >= MAX_MULTI_PASS_ATTEMPTS) break;
            continue;
        }
        if (typeof shouldSkipSensitiveRound === 'function' && shouldSkipSensitiveRound(picked)) {
            multi_pass_attempts++;
            if (multi_pass_attempts >= MAX_MULTI_PASS_ATTEMPTS) break;
            continue;
        }
        if (picked.cards.some(c => used_pos.has(c.pos))) break;
        
        picked.segment = 'A';
        a_rounds.push(picked);
        picked.cards.forEach(c => used_pos.add(c.pos));
        if (picked.cards.length === 4) fourCardCount++;
        if (is7PtReversal(picked)) sevenPtReversalCount++;
        if (isSwapBankerSix(picked)) swapB6Count++;
            added++;
    }
        if (added > 0) {
            log(`🔍 ${label}：加入 ${added} 局，已使用 ${used_pos.size} 張牌`, 'info');
        }
        return added;
    };
    log('🔍 開始多重洗牌挑選敏感局', 'info');
    harvestAdditionalSensitiveRounds();
    log(`🔍 多重洗牌結束：A段 ${a_rounds.length} 局，已用牌 ${used_pos.size} 張`, 'info');
    if (max7PtLimit !== null) {
        log(`🔍 七點逆轉：${sevenPtReversalCount} 局（上限=${max7PtLimit}）`, 'info');
    }
    if (swapB6Limit !== null) {
        log(`🔍 莊6：${swapB6Count}/${swapB6Limit} 局（上限）`, swapB6Count <= swapB6Limit ? 'success' : 'warn');
    }
      
    a_rounds.sort((a, b) => a.start_index - b.start_index);
    
    
    
    const tail_cards = deck.filter(c => !used_pos.has(c.pos));
    log(`🔍 多重挑選結束後剩餘 ${tail_cards.length} 張牌`, 'info');
    log(`🔍 準備建立殘牌：剩餘 ${tail_cards.length} 張牌`, 'info');
    log(`🔍 驗證：${used_pos.size} + ${tail_cards.length} = ${used_pos.size + tail_cards.length} (應為 416)`, 'info');
    
    if (used_pos.size + tail_cards.length !== 416) {
        log(`❌ 錯誤：A 段處理後就少牌了！`, 'error');
        const all_pos_in_deck = new Set(deck.map(c => c.pos));
        const accounted_pos = new Set([...used_pos, ...tail_cards.map(c => c.pos)]);
        const missing_pos = [...all_pos_in_deck].filter(pos => !accounted_pos.has(pos));
        log(`❌ 消失的 pos: ${missing_pos.join(', ')}`, 'error');
    }
    
    let c_cards = tail_cards.slice();
    let c_round = null;
    if (c_cards.length > 0) {
        const c_start = Math.min(...c_cards.map(c => c.pos));
        c_round = makeRoundInfo(c_start, c_cards, '殘牌', false);
        c_round.segment = 'C';
    }

    let final_rounds;

    if (traverseEnabled && traverseGroups.length > 0) {
        // ===== 穿越模式：A1→B1→A2→B2→A3→B3 重排 =====
        // 把敏感局（a_rounds）依數量平均分成 traverseGroups.length 段
        const N = a_rounds.length;
        const G = traverseGroups.length;
        const sensitiveChunks = [];
        // 讓每塊大小盡量平均：前 (N % G) 塊多一個
        const baseSize = Math.floor(N / G);
        const extras = N % G;
        let cursor = 0;
        for (let i = 0; i < G; i++) {
            const size = baseSize + (i < extras ? 1 : 0);
            sensitiveChunks.push(a_rounds.slice(cursor, cursor + size));
            cursor += size;
        }

        // 標記每個 B 段的最後 2 局：跳過卡色調整與檢查
        // 每段的最後 1 局：愛心標記局（會被花色交換成 4 張愛心）
        for (const chunk of sensitiveChunks) {
            const len = chunk.length;
            for (let k = Math.max(0, len - 2); k < len; k++) {
                if (chunk[k]) chunk[k].skipColorAdjust = true;
            }
            if (len > 0 && chunk[len - 1]) {
                chunk[len - 1].isHeartMarker = true;
            }
        }

        final_rounds = [];
        for (let i = 0; i < G; i++) {
            // A 段（穿越）→ B 段（敏感）
            for (const r of traverseGroups[i]) final_rounds.push(r);
            for (const r of sensitiveChunks[i]) final_rounds.push(r);
        }
        if (c_round) final_rounds.push(c_round);

        log(`🟣 穿越重排：${G} 個 A 段（${traverseGroups.map(g => g.length).join('+')} 局）` +
            `+ ${G} 個 B 段（${sensitiveChunks.map(c => c.length).join('+')} 局，每段末2局免卡色檢查）` +
            `+ ${c_round ? '殘牌' : '無殘牌'}` +
            `，共 ${final_rounds.length} 局`, 'success');

    } else {
        // ===== 原本流程（無穿越段）=====
        final_rounds = [...a_rounds, ...(c_round ? [c_round] : [])];
    }

    // 莊6閒≤5 不再於生成階段強制重來，改由最終驗證提示

    // 取得所有卡牌
    const final_card_deck = final_rounds.flatMap(r => r.cards);
    log(`A段: ${a_rounds.length}局, C段: ${c_cards.length > 0 ? 1 : 0}局`, 'info');
    
    return {
        a_rounds,
        c_cards,
        final_rounds,
        final_card_deck
    };
}

// 檢查剩餘牌是否能組成敏感局(排列組合測試)
function canFormSensitiveRound(cards) {
    // 至少需要4張牌才能進行一局百家樂
    if (!cards || cards.length < 4) return false;
    
    // 生成所有可能的排列(例如6張牌 = 6! = 720種排列)
    const permutations = generatePermutations(cards);
    
    // 逐一測試每種排列是否能構成敏感局
    for (const perm of permutations) {
        // 為每個排列建立臨時模擬器
        const tempCards = perm.map((c, i) => c.clone(i));
        const sim = new Simulator(tempCards);
        
        // 測試第一局是否為敏感局
        const result = sim.simulate_round(0);
        if (result && result.sensitive) {
            return true; // 找到可行的排列,表示這些牌可以組成敏感局
        }
    }
    
    return false; // 所有排列都無法構成敏感局
}

// 生成陣列的所有排列(遞迴方式)
function generatePermutations(arr) {
    // 基礎情況:1張或0張牌直接返回
    if (arr.length <= 1) return [arr];
    
    const result = [];
    // 取出每一張牌作為第一張
    for (let i = 0; i < arr.length; i++) {
        const current = arr[i];
        // 剩餘的牌
        const remaining = arr.slice(0, i).concat(arr.slice(i + 1));
        // 對剩餘牌進行排列
        const permutations = generatePermutations(remaining);
        
        // 將當前牌與剩餘牌的所有排列組合
        for (const perm of permutations) {
            result.push([current, ...perm]);
        }
    }
    
    return result;
}



const exported = {
    generateShoe_Signal: generateShoe_Signal,
    runAutoColorSwap_Signal: runAutoColorSwap_Signal,
    analyzeRounds: analyze_external_rounds,
    updateSignalConfig: updateSignalConfig,
    syncSignalUiFromConfig: syncUiFromSignalConfig,
    log: log,
    helpers: {
        swapFirstTwoCards: swapFirstTwoCards,
        scan_all_sensitive_rounds: scan_all_sensitive_rounds
    },
    Simulator: Simulator,
    ui: {
        generateShoe: generateShoe,
        analyzeSignals: analyzeSignals,
        clearAll: clearAll,
        applySignalConfig: applySignalConfig,
        updateSignalCardCount: updateSignalCardCount,
        clearSignalSelections: clearSignalSelections,
        clearSignalConfig: clearSignalConfig,
        syncUiFromSignalConfig: syncUiFromSignalConfig
    }
};

if (typeof window !== 'undefined') {
    if (!window.Simulator) {
        window.Simulator = Simulator;
    }
    if (!window.SignalSystem) {
        window.SignalSystem = {
            analyze(rounds, _Simulator, config, statusCallback) {
                return analyze_external_rounds(rounds, _Simulator, config || {}, statusCallback);
            }
        };
    }
    const ui = exported.ui;


    if (typeof document !== 'undefined') {
        // Wrap all initialisation logic into a named function so that it can be
        // invoked either on DOMContentLoaded or immediately if the event
        // has already fired. Without this, loading this script after
        // DOMContentLoaded prevents any of these handlers from attaching.
        const __signalUIInit = function() {
            const genBtn = document.getElementById('generateBtn');
            if (genBtn) genBtn.addEventListener('click', ui.generateShoe);
            const clearBtn = document.getElementById('clearBtn');
            if (clearBtn) clearBtn.addEventListener('click', ui.clearAll);
            const applyConfigBtn = document.getElementById('applyConfigBtn');
            if (applyConfigBtn) applyConfigBtn.addEventListener('click', ui.applySignalConfig);
            initSwapPreviewToggle();

        // 換色按鈕由 setupViolationStatsListeners 處理（直接套用，不用預覽）
        const autoReorderBtn = document.getElementById('btnAutoReorder');
        if (autoReorderBtn) autoReorderBtn.addEventListener('click', () => {
            if (!editEnabled || !currentRounds || currentRounds.length === 0) {
                log('請先生成牌靴,再進行編輯。', 'error');
                return;
            }

            const selectedRoundIndex = (() => {
                if (EDIT_STATE && EDIT_STATE.first && typeof EDIT_STATE.first.r === 'number') return EDIT_STATE.first.r;
                if (EDIT_STATE && EDIT_STATE.mode === 'card' && EDIT_STATE.first && typeof EDIT_STATE.first.r === 'number') return EDIT_STATE.first.r;
                return null;
            })();

            if (typeof selectedRoundIndex !== 'number') {
                log('請先用「換牌」或「換局」選取要處理的那一局。', 'warn');
                return;
            }
            
            // 彈出智能重排對話框
            showSmartReorderDialog(selectedRoundIndex);
        });
        // 快捷鍵：C → 自動重排（避免在輸入框內誤觸）
        document.addEventListener('keydown', (event) => {
            const key = event.key;
            if (key !== 'c' && key !== 'C') return;
            if (event.ctrlKey || event.metaKey || event.altKey) return;
            const target = event.target;
            const tag = target && target.tagName ? String(target.tagName).toUpperCase() : '';
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (target && target.isContentEditable)) return;
            const btn = document.getElementById('btnAutoReorder');
            if (!btn || btn.disabled) return;
            event.preventDefault();
            btn.click();
        });
        const swapBtn = document.getElementById('btnSwap');
        if (swapBtn) swapBtn.addEventListener('click', () => {
            if (!editEnabled) {
                log('請先生成牌靴,再進行編輯。', 'error');
                    return;
                }
                if (EDIT_STATE.mode === 'card') {
                    const ready = EDIT_STATE.first && EDIT_STATE.second;
                    if (ready) {
                        executeSwapAction();
                    } else {
                        log('換牌模式:請先選擇兩張要交換的牌。', 'info');
                    }
                    return;
                }
                activateEditMode('card');
            });
            const roundBtn = document.getElementById('btnRound');
            if (roundBtn) roundBtn.addEventListener('click', () => {
                if (!editEnabled) {
                    log('請先生成牌靴,再進行編輯。', 'error');
                    return;
                }
                if (EDIT_STATE.mode === 'round') {
                    const ready = EDIT_STATE.first && EDIT_STATE.second;
                    if (ready) {
                        executeSwapAction();
                    } else {
                        log('換局模式:請先選擇兩個要交換的局。', 'info');
                    }
                    return;
                }
                activateEditMode('round');
            });
            const cutBtn = document.getElementById('btnCut');
            if (cutBtn) {
                cutBtn.addEventListener('click', () => {
                    if (!editEnabled) {
                        log('請先生成牌靴', 'error');
                        return;
                    }
                    if (!originalDeckOrder || originalDeckOrder.length === 0) {
                        log('請先點擊「套用」按鈕記錄牌序', 'error');
                        return;
                    }
                    const cutPosInput = document.getElementById('cutPos');
                    const cutPos = cutPosInput ? parseInt(cutPosInput.value, 10) || 0 : 0;
                    performCut(cutPos);
                });
            }
            const highlightBtn = document.getElementById('btnHighlightCard');
            if (highlightBtn) {
                highlightBtn.addEventListener('click', () => {
                    if (!currentRounds || currentRounds.length === 0) {
                        log('請先生成牌靴', 'error');
                        return;
                    }
                    const input = document.getElementById('highlightCardPos');
                    const value = input ? parseInt(input.value, 10) : NaN;
                    const ok = highlightGlobalCardPos(value);
                    if (ok) {
                        log(`🔍 ✅ 已高亮第 ${value} 張`, 'info');
                    } else {
                        const total = currentRounds.reduce((sum, r) => sum + ((r && Array.isArray(r.cards)) ? r.cards.length : 0), 0);
                        log(`🔍 ⚠️ 無法高亮：請輸入 1~${total} 的張數`, 'warn');
                    }
                });
            }

            const exportCombinedBtn = document.getElementById('btnExportCombined');
            exportCombinedBtn.addEventListener('click', exportRoundsAsExcelWithDrive);

            const importBtn = document.getElementById('btnImport');
            const importFileInput = document.getElementById('importFileInput');
            if (importBtn && importFileInput) {
                importBtn.addEventListener('click', () => {
                    // 移除舊選單
                    const old = document.getElementById('importMenu');
                    if (old) { old.remove(); return; }

                    const menu = document.createElement('div');
                    menu.id = 'importMenu';
                    menu.style.cssText = 'position:absolute;z-index:9999;background:#1a1a2e;border:1px solid #444;border-radius:6px;padding:4px;display:flex;flex-direction:column;gap:2px;box-shadow:0 4px 12px rgba(0,0,0,0.5);';

                    const btnLocal = document.createElement('button');
                    btnLocal.textContent = '本機檔案';
                    btnLocal.style.cssText = 'padding:8px 18px;background:#2a2a4a;color:#eee;border:none;border-radius:4px;cursor:pointer;font-size:14px;';
                    btnLocal.onmouseenter = () => btnLocal.style.background = '#3a3a6a';
                    btnLocal.onmouseleave = () => btnLocal.style.background = '#2a2a4a';
                    btnLocal.onclick = () => { menu.remove(); importFileInput.click(); };

                    const btnCloud = document.createElement('button');
                    btnCloud.textContent = 'Google 雲端';
                    btnCloud.style.cssText = 'padding:8px 18px;background:#2a2a4a;color:#eee;border:none;border-radius:4px;cursor:pointer;font-size:14px;';
                    btnCloud.onmouseenter = () => btnCloud.style.background = '#3a3a6a';
                    btnCloud.onmouseleave = () => btnCloud.style.background = '#2a2a4a';
                    btnCloud.onclick = () => { menu.remove(); loadFromGoogleDrive(); };

                    menu.appendChild(btnLocal);
                    menu.appendChild(btnCloud);

                    // 定位在按鈕旁邊
                    const rect = importBtn.getBoundingClientRect();
                    menu.style.left = (rect.right + 4) + 'px';
                    menu.style.top = rect.top + 'px';
                    document.body.appendChild(menu);

                    // 點其他地方關閉
                    setTimeout(() => {
                        document.addEventListener('click', function closeMenu(e) {
                            if (!menu.contains(e.target) && e.target !== importBtn) {
                                menu.remove();
                                document.removeEventListener('click', closeMenu);
                            }
                        });
                    }, 0);
                });
                importFileInput.addEventListener('change', async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    await importRoundsFromExcel(file);
                    importFileInput.value = '';
                });
            }

            const validateBtn = document.getElementById('btnValidate');
            if (validateBtn) validateBtn.addEventListener('click', () => {
                window.open('validator.html', '_blank');
            });
            const speechBtn = document.getElementById('btnSpeech');
            if (speechBtn) speechBtn.addEventListener('click', openSpeechAssistant);
            const dealerBtn = document.getElementById('btnDealer');
            if (dealerBtn) dealerBtn.addEventListener('click', () => {
                window.open('dealer.html', '_blank');
            });
            const calcBtn = document.getElementById('btnApplyTools');
            if (calcBtn) calcBtn.addEventListener('click', showCalcTool);
            ensureFloatingWidget();
            const cancelBtn = document.getElementById('btnCancelEdit');
            if (false && cancelBtn) cancelBtn.addEventListener('click', () => {
                return;
                if (!editEnabled) return;
                const hadSelection = EDIT_STATE.mode !== 'none' || EDIT_STATE.first || EDIT_STATE.second;
                resetEditState();
                if (hadSelection) log('已取消編輯。', 'info');
            });
            if (cancelBtn) cancelBtn.addEventListener('click', () => {
                ui.clearAll();
                if (typeof updateViolationUI === 'function') {
                    updateViolationUI(null);
                }
            });
            const applyChangesBtn = document.getElementById('btnApplyChanges');
            if (applyChangesBtn) applyChangesBtn.addEventListener('click', () => {
                if (!editEnabled) {
                    log('請先生成牌靴。', 'error');
                    return;
                }
                // 記錄原始牌序（供切牌使用）
                saveOriginalDeckOrder();
                refreshAnalysisAndRender();
                resetEditState();
                log('已重新套用並更新統計。', 'success');
            });
            const tableBody = document.getElementById('roundsBody');
            if (tableBody) tableBody.addEventListener('click', handleTableClick);

            document.addEventListener('keydown', (event) => {
                const activeTag = event.target && event.target.tagName ? event.target.tagName.toLowerCase() : '';
                if (activeTag === 'input' || activeTag === 'textarea' || event.target?.isContentEditable) return;
                if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
                if (event.key === 'x' || event.key === 'X') {
                    if (swapBtn && !swapBtn.disabled) {
                        event.preventDefault();
                        swapBtn.click();
                    }
                }
                if (event.key === 'z' || event.key === 'Z') {
                    const btnRound = document.getElementById('btnRound');
                    if (btnRound && !btnRound.disabled) {
                        event.preventDefault();
                        btnRound.click();
                    }
                }
            });

            const checkboxes = document.querySelectorAll('.suit-checkbox, .rank-checkbox');
            checkboxes.forEach(checkbox => {
                checkbox.addEventListener('change', ui.updateSignalCardCount);
            });

            // Some UI interactions (especially the rank and suit buttons) are handled
            // by inline bridge code in signals.html. That code toggles CSS
            // classes and synchronises hidden checkboxes, but it doesn't always
            // call updateSignalCardCount directly. To ensure the signal card
            // count stays in sync when a user clicks on a rank or suit button,
            // also attach click listeners to those elements here. These
            // listeners simply call the existing update function after the
            // bridge script finishes its own handling.
            const suitButtonsForUpdate = document.querySelectorAll('.suit-button');
            suitButtonsForUpdate.forEach(btn => {
                btn.addEventListener('click', () => {
                    // Use the globally exposed function if available; fall back to
                    // the ui version. This avoids scoping issues where `ui`
                    // might not yet be initialised when this handler runs.
                    if (typeof window !== 'undefined' && typeof window.updateSignalCardCount === 'function') {
                        window.updateSignalCardCount();
                    } else if (ui && typeof ui.updateSignalCardCount === 'function') {
                        ui.updateSignalCardCount();
                    }
                });
            });
            const rankButtonsForUpdate = document.querySelectorAll('.rank-button');
            rankButtonsForUpdate.forEach(btn => {
                btn.addEventListener('click', () => {
                    if (typeof window !== 'undefined' && typeof window.updateSignalCardCount === 'function') {
                        window.updateSignalCardCount();
                    } else if (ui && typeof ui.updateSignalCardCount === 'function') {
                        ui.updateSignalCardCount();
                    }
                });
            });

            syncUiFromSignalConfig();
            ui.updateSignalCardCount();

            setEditButtonsAvailability(false);
            renderDeckSummary(null);
            updateSignalConfigDisplay();
            log('訊號牌測試系統初始化完成', 'success');
        };
        // Immediately initialise the UI. The script tag is placed at the end of
        // the HTML body, so DOM elements are available at this point. Calling
        // the init function here ensures event handlers are attached even if
        // DOMContentLoaded has already fired. We no longer rely on
        // DOMContentLoaded because this script may be loaded after that event.
        __signalUIInit();
    }
}

// We previously wrapped the entire UI module in an IIFE.  Removing that
// wrapper eliminates the need for a trailing `})();`.  The closing braces
// above terminate the nested `if` blocks.  No additional parentheses are
// required here.

// ════════════════════════════════════════════════════════════════
// 違規統計 UI 整合
// ════════════════════════════════════════════════════════════════

/**
 * 包裝原本的 refreshAnalysisAndRender，加入違規統計更新
 */
const _originalRefreshAnalysisAndRender = window.refreshAnalysisAndRender;
if (typeof _originalRefreshAnalysisAndRender === 'function') {
    window.refreshAnalysisAndRender = function(...args) {
        const result = _originalRefreshAnalysisAndRender.apply(this, args);
        // 更新違規統計
        if (typeof refreshViolationStats === 'function') {
            refreshViolationStats();
        }
        // 顯示回復分析按鈕
        const recoveryBtn = document.getElementById('recoveryBtn');
        if (recoveryBtn && currentRounds && currentRounds.length > 0) {
            recoveryBtn.style.display = 'inline-block';
        }
        // 更新內嵌路單（編輯模式時不覆蓋）
        if (typeof window.renderInlineRoadmap === 'function') {
            const _ctr = document.getElementById('inlineRoadmapContainer');
            if (!_ctr || _ctr.dataset.mode !== 'edit') {
                window.renderInlineRoadmap();
                if (_ctr) _ctr.dataset.mode = 'road';
            }
        }
        return result;
    };
}

/**
 * 監聽手動編輯事件，更新違規統計
 */
function setupViolationStatsListeners() {
    // 初始化：頁面載入時顯示「無」
    if (typeof updateViolationUI === 'function') {
        updateViolationUI(null);
    }
    // 監聽套用按鈕
    const applyBtn = document.getElementById('btnApplyChanges');
    if (applyBtn) {
        const originalHandler = applyBtn.onclick;
        applyBtn.addEventListener('click', () => {
            // 延遲更新，確保資料已經更新
            setTimeout(() => {
                if (typeof refreshViolationStats === 'function') {
                    refreshViolationStats();
                }
            }, 100);
        });
    }

    // 監聽換牌按鈕
    const swapBtn = document.getElementById('btnSwap');
    if (swapBtn) {
        swapBtn.addEventListener('click', () => {
            setTimeout(() => {
                if (typeof refreshViolationStats === 'function') {
                    refreshViolationStats();
                }
            }, 100);
        });
    }

    // 監聽換局按鈕
    const roundBtn = document.getElementById('btnRound');
    if (roundBtn) {
        roundBtn.addEventListener('click', () => {
            setTimeout(() => {
                if (typeof refreshViolationStats === 'function') {
                    refreshViolationStats();
                }
            }, 100);
        });
    }

    // 監聽換色按鈕
    const colorBtn = document.getElementById('btnAutoColor');
if (colorBtn) {
    colorBtn.addEventListener('click', () => {
        if (!currentRounds || currentRounds.length === 0) {
            log('請先生成牌靴', 'error');
            return;
        }
        
        log('開始執行卡色邏輯...', 'info');
        try {
            currentRounds = runAutoColorSwap_Signal(currentRounds);
            refreshAnalysisAndRender();
            resetEditState();
            
            // 執行卡色檢查
            const colorViolations = calculateCardColorViolations(currentRounds);
            if (colorViolations > 0) {
                log(`⚠️ 發現 ${colorViolations} 處卡色違規`, 'warn');
            } else {
                log('✅ 卡色檢查通過', 'success');
            }
            
            // 更新違規顯示（包含卡色）
            const stats = calculateViolationStats(currentRounds);
            stats.cardColorViolations = colorViolations;
            stats.cardColorChecked = true;  // 標記已檢查
            
            // 收集卡色違規的局號
            let colorRounds = [];
            if (typeof collectCardColorViolationRounds === 'function') {
                colorRounds = collectCardColorViolationRounds(currentRounds);
            } else {
                const validSet = (typeof getValidCardColorStrings === 'function')
                    ? getValidCardColorStrings()
                    : new Set(['BBBR', 'RRRB']);
                for (let i = 0; i < currentRounds.length; i++) {
                    const round = currentRounds[i];
                    if (!round || !Array.isArray(round.cards) || round.cards.length < 4) continue;
                    const colors = round.cards.slice(0, 4).map(c => c.back_color || '?').join('');
                    if (!validSet.has(colors)) {
                        colorRounds.push(i + 1);
                    }
                }
            }
            stats.cardColorRounds = colorRounds;
            
            updateViolationUI(stats);
            applyViolationHighlights();
            
        } catch (err) {
            log(`卡色失敗: ${err && err.message ? err.message : err}`, 'error');
        }
    });
}

    // 監聽清空按鈕 - 違規統計歸零
    const clearBtn = document.getElementById('clearBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            setTimeout(() => {
                if (typeof updateViolationUI === 'function') {
                    updateViolationUI(null);
                }
            }, 100);
        });
    }

    // 監聽生成按鈕
    const generateBtn = document.getElementById('generateBtn');
    if (generateBtn) {
        // 使用事件監聽器而不是覆蓋 onclick
        generateBtn.addEventListener('click', () => {
            setTimeout(() => {
                if (typeof refreshViolationStats === 'function') {
                    refreshViolationStats();
                }
            }, 500);  // 生成需要更長時間
        });
    }
}

// 頁面載入完成後設置監聽器
if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupViolationStatsListeners);
    } else {
        setupViolationStatsListeners();
    }
}



// ========== 牌靴回復分析 UI ==========
function getRoundCardCountStats(rounds) {
    const stats = {
        totalRounds: 0,
        fourCardCount: 0,
        fiveCardCount: 0,
        sixCardCount: 0
    };
    if (!Array.isArray(rounds) || rounds.length === 0) return stats;
    stats.totalRounds = rounds.length;
    rounds.forEach((round) => {
        const cardCount = (round && Array.isArray(round.cards)) ? round.cards.length : 0;
        if (cardCount === 4) stats.fourCardCount++;
        else if (cardCount === 5) stats.fiveCardCount++;
        else if (cardCount === 6) stats.sixCardCount++;
    });
    return stats;
}

// 更新頂部回復分析顯示
function updateRecoveryDisplay(result) {
    const display = document.getElementById('recoveryDisplay');
    if (!display) return;

    if (!result) {
        display.classList.add('hidden');
        return;
    }

    // 計算評分
    const avgRounds = parseFloat(result.avgRounds);
    let rating = 0;
    
    let ratingText = '';
    let ratingColor = '';

    if (avgRounds <= 3) {
        rating = 5;
        ratingText = '極佳';
        ratingColor = '#22c55e';
    } else if (avgRounds <= 4) {
        rating = 4;
        ratingText = '良好';
        ratingColor = '#84cc16';
    } else if (avgRounds <= 5) {
        rating = 3;
        ratingText = '普通';
        ratingColor = '#eab308';
    } else {
        rating = 2;
        ratingText = '較慢';
        ratingColor = '#ef4444';
    }

    const stars = '⭐'.repeat(rating);
    
    // 計算各區間佔比
    const total = result.totalCards;
    const dist = result.distribution || {};
    const pct1to5 = total > 0 ? ((dist.range1to5 || 0) / total * 100).toFixed(1) : '0.0';
    const pct6to10 = total > 0 ? ((dist.range6to10 || 0) / total * 100).toFixed(1) : '0.0';
    const pct11to15 = total > 0 ? ((dist.range11to15 || 0) / total * 100).toFixed(1) : '0.0';
    const pct16plus = total > 0 ? ((dist.range16plus || 0) / total * 100).toFixed(1) : '0.0';

    // 更新 DOM
    document.getElementById('recoveryAvg').textContent = result.avgRounds;
    document.getElementById('recoveryStars').textContent = stars;
    
    const ratingTextEl = document.getElementById('recoveryRatingText');
    if (ratingTextEl) {
        ratingTextEl.textContent = ratingText;
        ratingTextEl.style.color = ratingColor;
    }

    document.getElementById('recoveryAvgDetail').textContent = `${result.avgCards} 張 / ${result.avgRounds} 局`;
    document.getElementById('recoveryMaxDetail').textContent = `${result.maxCards} 張 / ${result.maxRounds} 局`;
    const maxCardsLeftEl = document.getElementById('recoveryMaxCardsLeft');
    const maxRoundsLeftEl = document.getElementById('recoveryMaxRoundsLeft');
    if (maxCardsLeftEl) maxCardsLeftEl.textContent = ` ${result.maxCards} `;
    if (maxRoundsLeftEl) maxRoundsLeftEl.textContent = ` ${result.maxRounds} `;
    const maxCardsIdxLabelEl = document.getElementById('recoveryMaxCardsIdxLabel');
    if (maxCardsIdxLabelEl) {
        const pos = typeof result.maxCardIdx === 'number' && result.maxCardIdx >= 0 ? result.maxCardIdx + 1 : null;
        maxCardsIdxLabelEl.textContent = pos ? `第${pos}張` : '';
    }
    const maxRoundsIdxLabelEl = document.getElementById('recoveryMaxRoundsIdxLabel');
    if (maxRoundsIdxLabelEl) {
        const pos = typeof result.maxRoundsIdx === 'number' && result.maxRoundsIdx >= 0 ? result.maxRoundsIdx + 1 : null;
        maxRoundsIdxLabelEl.textContent = pos ? `第${pos}張` : '';
    }
    document.getElementById('recoveryImmediateDetail').textContent = `${result.immediateRecovery} 個 (${result.immediatePercent}%)`;
    const maxIdxEl = document.getElementById('recoveryMaxIndexDetail');
    if (maxIdxEl) {
        const cardPosition = (typeof result.maxCardIdx === 'number' ? result.maxCardIdx + 1 : null);
        if (cardPosition && cardPosition > 0) {
            const roundNumber = getRoundNumberForCardPosition(cardPosition);
            if (roundNumber) {
                maxIdxEl.textContent = `第 ${cardPosition} 張（第 ${roundNumber} 局）`;
            } else {
                maxIdxEl.textContent = `第 ${cardPosition} 張`;
            }
        } else {
            maxIdxEl.textContent = '第 -- 張';
        }
    }
    
    document.getElementById('recoveryRange1to5').textContent = `${dist.range1to5 || 0} 張 (${pct1to5}%)`;
    document.getElementById('recoveryRange6to10').textContent = `${dist.range6to10 || 0} 張 (${pct6to10}%)`;
    document.getElementById('recoveryRange11to15').textContent = `${dist.range11to15 || 0} 張 (${pct11to15}%)`;
    document.getElementById('recoveryRange16plus').textContent = `${dist.range16plus || 0} 張 (${pct16plus}%)`;

    const roundStats = getRoundCardCountStats((typeof currentRounds !== 'undefined') ? currentRounds : []);
    const totalRounds = roundStats.totalRounds;
    const fourPct = totalRounds > 0 ? ((roundStats.fourCardCount / totalRounds) * 100).toFixed(1) : '0.0';
    const fivePct = totalRounds > 0 ? ((roundStats.fiveCardCount / totalRounds) * 100).toFixed(1) : '0.0';
    const sixPct = totalRounds > 0 ? ((roundStats.sixCardCount / totalRounds) * 100).toFixed(1) : '0.0';
    const fourEl = document.getElementById('recoveryFourCardRate');
    const fiveEl = document.getElementById('recoveryFiveCardRate');
    const sixEl = document.getElementById('recoverySixCardRate');
    const applyDevColor = (el, actualPct, expectedPct) => {
        if (!el) return;
        el.classList.remove('dev-warn', 'dev-danger');
        const diff = Math.abs(parseFloat(actualPct) - expectedPct);
        if (diff >= 5) el.classList.add('dev-danger');
        else if (diff >= 3) el.classList.add('dev-warn');
    };
    if (fourEl) fourEl.innerHTML = `<span class="big-num">${roundStats.fourCardCount}</span> 局 <span class="sub-num">(${fourPct}%)</span>`;
    if (fiveEl) fiveEl.innerHTML = `<span class="big-num">${roundStats.fiveCardCount}</span> 局 <span class="sub-num">(${fivePct}%)</span>`;
    if (sixEl)  sixEl.innerHTML  = `<span class="big-num">${roundStats.sixCardCount}</span> 局 <span class="sub-num">(${sixPct}%)</span>`;
    applyDevColor(fourEl, fourPct, 37.89);
    applyDevColor(fiveEl, fivePct, 30.34);
    applyDevColor(sixEl, sixPct, 31.77);

    // 對調莊6統計
    const rounds = (typeof currentRounds !== 'undefined') ? currentRounds : [];
    const swapB6List = [];
    rounds.forEach((rd, ri) => {
        if (!rd || !Array.isArray(rd.cards) || rd.cards.length < 4) return;
        const tmp = rd.cards.map(c => c.clone());
        [tmp[0], tmp[1]] = [tmp[1], tmp[0]];
        const hi = computeRoundHands(tmp);
        if (hi && hi.bankerTotal === 6 && hi.playerTotal <= 5) {
            swapB6List.push(ri + 1);
        }
    });
    const swapB6CountEl = document.getElementById('recoverySwapB6Count');
    const swapB6RoundsEl = document.getElementById('recoverySwapB6Rounds');
    if (swapB6CountEl) swapB6CountEl.textContent = `${swapB6List.length} 局`;
    if (swapB6RoundsEl) swapB6RoundsEl.textContent = swapB6List.length > 0 ? swapB6List.join(', ') : '--';

    // 莊6點贏統計（原始牌型即為莊6且閒≤5）
    const banker6List = [];
    rounds.forEach((rd, ri) => {
        if (!rd || !Array.isArray(rd.cards) || rd.cards.length < 4) return;
        const hi = computeRoundHands(rd.cards);
        if (hi && hi.bankerTotal === 6 && hi.playerTotal <= 5) {
            banker6List.push(ri + 1);
        }
    });
    const banker6CountEl = document.getElementById('recoveryBanker6Count');
    const banker6RoundsEl = document.getElementById('recoveryBanker6Rounds');
    if (banker6CountEl) banker6CountEl.textContent = `${banker6List.length} 局`;
    if (banker6RoundsEl) banker6RoundsEl.textContent = banker6List.length > 0 ? banker6List.join(', ') : '--';

    display.classList.remove('hidden');
}

// 舊函數保留但改為空操作或直接呼叫更新
function runRecoveryAnalysis() {
    if (!currentRounds || currentRounds.length === 0) return;
    try {
        const result = analyzeShoeRecovery(currentRounds);
        updateRecoveryDisplay(result);
    } catch (err) {
        log(`分析失敗: ${err.message}`, 'error');
        console.error(err);
    }
}

// ════════════════════════════════════════════════════════════════
// 從 signals.js 移至 signals_ui.js 的 UI 相關函數
// ════════════════════════════════════════════════════════════════

// 日誌顯示相關
function shouldDisplayLogMessage(message, type = 'info') {
    if (typeof window !== 'undefined' && window.__suppressVerifyViolationLogs && typeof message === 'string') {
        if (message.startsWith('違規') || message.startsWith('❌ 驗證失敗') || message.startsWith('提示:')) {
            return false;
        }
    }
    if (type === 'error') return true;
    if (typeof message !== 'string') return false;
    return LOG_ALLOW_PATTERNS.some(pattern => pattern.test(message));
}

// 中央日誌輸出，會篩選後才寫入畫面
function log(message, type = 'info') {
    if (window.__muteLog) return;
    if (!shouldDisplayLogMessage(message, type)) return;

    const logArea = document.getElementById('logArea');
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    if (logArea) {
        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry ' + type;
        const iconMap = { info: '●', warn: '▲', error: '●', success: '●' };
        const ico = document.createElement('span');
        ico.className = 'ico';
        ico.textContent = iconMap[type] || '●';
        const ts = document.createElement('span');
        ts.className = 'ts';
        ts.textContent = timestamp;
        const msg = document.createElement('span');
        msg.className = 'msg';
        msg.textContent = message;
        logEntry.appendChild(ico);
        logEntry.appendChild(ts);
        logEntry.appendChild(msg);
        logArea.appendChild(logEntry);
        logArea.scrollTop = logArea.scrollHeight;
    }
    console.log(`[${type.toUpperCase()}] ${message}`);
}

// 更新統計
function updateStats(data) {
    // 安全更新元素 - 只有元素存在時才更新
    const totalRoundsEl = document.getElementById('totalRounds');
    if (totalRoundsEl) totalRoundsEl.textContent = data.totalRounds || 0;
    
    const bankerCountEl = document.getElementById('bankerCount');
    if (bankerCountEl) bankerCountEl.textContent = data.bankerCount || 0;
    
    const playerCountEl = document.getElementById('playerCount');
    if (playerCountEl) playerCountEl.textContent = data.playerCount || 0;
    
    const tieCountEl = document.getElementById('tieCount');
    if (tieCountEl) tieCountEl.textContent = data.tieCount || 0;
    
    const sSignalCardsEl = document.getElementById('sSignalCards');
    if (sSignalCardsEl) sSignalCardsEl.textContent = data.sSignalCards || 0;
    
    const tSignalCardsEl = document.getElementById('tSignalCards');
    if (tSignalCardsEl) tSignalCardsEl.textContent = data.nonSSignalCards ?? 0;

    updateResultCircle({
        totalRounds: data.totalRounds || 0,
        bankerCount: data.bankerCount || 0,
        playerCount: data.playerCount || 0,
        tieCount: data.tieCount || 0
    });
}

function updateResultCircle({ totalRounds, bankerCount, playerCount, tieCount }) {
    const circleBankerLabel = document.getElementById('circleBankerLabel');
    const circlePlayerLabel = document.getElementById('circlePlayerLabel');
    const circleTieLabel = document.getElementById('circleTieLabel');
    const circleTotal = document.getElementById('circleTotal');
    const hudBankerBar = document.getElementById('hudBankerBar');
    const hudPlayerBar = document.getElementById('hudPlayerBar');
    const hudTieBar = document.getElementById('hudTieBar');

    if (circleTotal) {
        circleTotal.textContent = totalRounds > 0 ? totalRounds : '0';
    }
    if (circleBankerLabel) circleBankerLabel.textContent = bankerCount;
    if (circlePlayerLabel) circlePlayerLabel.textContent = playerCount;
    if (circleTieLabel) circleTieLabel.textContent = tieCount;

    const maxCount = Math.max(bankerCount, playerCount, tieCount, 1);
    if (hudBankerBar) hudBankerBar.style.width = `${(bankerCount / maxCount) * 100}%`;
    if (hudPlayerBar) hudPlayerBar.style.width = `${(playerCount / maxCount) * 100}%`;
    if (hudTieBar) hudTieBar.style.width = `${(tieCount / maxCount) * 100}%`;
}

// 將一局的卡片轉成「A♠ ...」的字串備用
function formatHandDisplay(cards) {
    if (!Array.isArray(cards) || cards.length === 0) {
        return '<span class="card-label card-label-empty non-s-signal-card">--</span>';
    }

    return cards.map(card => {
        const cardText = (card && typeof card.short === 'function') ? card.short() : '--';

        const classes = ['card-label'];

        if (card && typeof card.isSignalCard === 'function' && card.isSignalCard()) {
            classes.push('s-signal-card');
        } else {
            classes.push('non-s-signal-card');
        }

        if (card && card.back_color === 'R') {
            classes.push('card-back-red');
        } else if (card && card.back_color === 'B') {
            classes.push('card-back-blue');
        } else {
            classes.push('card-back-unknown');
        }

        return `<span class="${classes.join(' ')}">${cardText}</span>`;
    }).join('');
}

// 計算一輪牌的總點數與站點視窗信息
function computeRoundHands(cards) {
    const playerCards = [];
    const bankerCards = [];
    const getPoint = (card) => (card && typeof card.point === 'function') ? card.point() : 0;
    if (!Array.isArray(cards) || cards.length < 4) {
        return { playerCards, bankerCards, playerTotal: null, bankerTotal: null };
    }

    const seq = cards.slice();
    let idx = 0;
    const draw = () => {
        if (idx >= seq.length) return null;
        return seq[idx++];
    };

    const assign = (target, card) => {
        if (card) target.push(card);
        return card;
    };

    const p1 = assign(playerCards, draw());
    const b1 = assign(bankerCards, draw());
    const p2 = assign(playerCards, draw());
    const b2 = assign(bankerCards, draw());

    let p_tot = (getPoint(p1) + getPoint(p2)) % 10;
    let b_tot = (getPoint(b1) + getPoint(b2)) % 10;
    const natural = (p_tot >= 8 || b_tot >= 8);

    if (!natural) {
        if (p_tot <= 5) {
            const p3 = assign(playerCards, draw());
            const pt = getPoint(p3);
            if (p3) {
                p_tot = (p_tot + pt) % 10;
                let bankerDraw = false;
                if (b_tot <= 2) bankerDraw = true;
                else if (b_tot === 3 && pt !== 8) bankerDraw = true;
                else if (b_tot === 4 && [2,3,4,5,6,7].includes(pt)) bankerDraw = true;
                else if (b_tot === 5 && [4,5,6,7].includes(pt)) bankerDraw = true;
                else if (b_tot === 6 && [6,7].includes(pt)) bankerDraw = true;
                if (bankerDraw) {
                    const b3 = assign(bankerCards, draw());
                    if (b3) {
                        b_tot = (b_tot + getPoint(b3)) % 10;
                    }
                }
            }
        } else if (b_tot <= 5) {
            const b3 = assign(bankerCards, draw());
            if (b3) {
                b_tot = (b_tot + getPoint(b3)) % 10;
            }
        }
    }

    return {
        playerCards,
        bankerCards,
        playerTotal: playerCards.length ? p_tot : null,
        bankerTotal: bankerCards.length ? b_tot : null
    };
}

// 重新依據實際牌組決定這局的結果文字與註記
function recomputeRoundOutcome(round) {
    if (!round || !Array.isArray(round.cards)) return;
    const handInfo = computeRoundHands(round.cards);
    const p = handInfo.playerTotal;
    const b = handInfo.bankerTotal;
    if (typeof p !== 'number' || typeof b !== 'number') return;
    if (p === b) {
        round.result = '和';
    } else if (p > b) {
        round.result = '閒';
    } else {
        round.result = '莊';
    }
}

function computeRoundUsedCardCount(cards) {
    const handInfo = computeRoundHands(cards);
    return (handInfo.playerCards?.length || 0) + (handInfo.bankerCards?.length || 0);
}

// 標準化結果格式
function normalizeOutcome(value) {
    if (value === undefined || value === null) return null;
    const txt = String(value).trim();
    if (!txt) return null;
    if (['莊', 'B', 'Banker'].includes(txt)) return 'banker';
    if (['閒', 'P', 'Player'].includes(txt)) return 'player';
    if (['和', 'T', 'Tie'].includes(txt)) return 'tie';
    return null;
}

// 根據結果回傳對應的 CSS class
function outcomeClass(value) {
    const type = normalizeOutcome(value);
    return type ? `outcome-${type}` : '';
}

// 產生 rounds table 的表頭 DOM
function renderRoundsTableHeader() {
    const head = document.getElementById('roundsHead');
    if (!head) return;
    const headerHtml = ROUNDS_TABLE_COLUMNS.map(col => {
        const headerClass = col.headerClass ? ` class="${col.headerClass}"` : '';
        return `<th${headerClass}>${col.label}</th>`;
    }).join('');
    head.innerHTML = `<tr>${headerHtml}</tr>`;
}

// 根據上一輪分析渲染 table 的身體
function renderRoundsTable(rounds, analysis) {
    const table = document.getElementById('roundsTable');
    const tbody = document.getElementById('roundsBody');
    
    renderRoundsTableHeader();
    tbody.innerHTML = '';
    
    if (!rounds || rounds.length === 0) {
        table.style.display = 'none';
        return;
    }
    
    const tieIndices = new Set();
    rounds.forEach((round, index) => {
        if (round.result === '和') {
            tieIndices.add(index);
        }
    });

    rounds.forEach((round, index) => {
        const row = document.createElement('tr');

        if (round.isTraverse) {
            row.classList.add('traverse-round');
        }
        
        const segmentLabel = (round.segment === 'A' || round.segment === 'C') ? round.segment : '';
        const segmentMap = { A: 'A', C: 'C' };
        let typeDisplay = segmentMap[segmentLabel] || segmentLabel || '一般';
        const nextIndex = (index + 1) % rounds.length;
        if (tieIndices.has(nextIndex)) {
            typeDisplay = segmentLabel ? segmentMap[segmentLabel] || segmentLabel : 'T段';
        } else if (segmentLabel) {
            typeDisplay = segmentMap[segmentLabel] || segmentLabel;
        }

        const cards_html = (round.cards || []).map((card, cardIdx) => {
            if (!card) {
                return `<span class="card-label non-s-signal-card" data-action="card" data-r="${index}" data-c="${cardIdx}">--</span>`;
            }
            const classes = ['card-label'];
            
            if (card.back_color === 'B') {
                classes.push('card-back-blue');
            } else if (card.back_color === 'R') {
                classes.push('card-back-red');
            } else {
                classes.push('card-back-unknown');
            }

            const isSignalCard = typeof card.isSignalCard === 'function' && card.isSignalCard();
            if (isSignalCard) {
                classes.push('s-signal-card');
            } else {
                classes.push('non-s-signal-card');
            }
            if (card.isTraverseCard) {
                classes.push('traverse-card');
            }
            if (round.isHeartMarker && card.suit === '♥') {
                classes.push('heart-marker-card');
            }

            return `<span class="${classes.join(' ')}" data-action="card" data-r="${index}" data-c="${cardIdx}">${card.short()}</span>`;
        }).join('');
        const cardsCell = `<span class="card-strip">${cards_html}</span>`;
        
        const swapped_result = swapFirstTwoCards(round);
        const swapped_display = swapped_result || '無法對調';
        
        const chipCount = 6;
        const colorChips = Array.from({ length: chipCount }, (_, chipIndex) => {
            const card = round.cards && round.cards[chipIndex] ? round.cards[chipIndex] : null;
            if (!card) {
                return `<span class="color-chip unknown"></span>`;
            }
            const color = card.back_color === 'R' ? 'red' : card.back_color === 'B' ? 'blue' : 'unknown';
            return `<span class="color-chip ${color}"></span>`;
        }).join('');
        const colorCell = `<span class="color-chips">${colorChips}</span>`;

        const handInfo = computeRoundHands(round.cards || []);
        const playerHandText = `<span class="hand-chip-strip">${formatHandDisplay(handInfo.playerCards)}</span>`;
        const bankerHandText = `<span class="hand-chip-strip">${formatHandDisplay(handInfo.bankerCards)}</span>`;
        const playerPoints = typeof handInfo.playerTotal === 'number' ? handInfo.playerTotal : '';
        const bankerPoints = typeof handInfo.bankerTotal === 'number' ? handInfo.bankerTotal : '';
        const usedCardCount = (handInfo.playerCards?.length || 0) + (handInfo.bankerCards?.length || 0);
        const totalCardCount = Array.isArray(round.cards) ? round.cards.length : 0;
        
        const resultDisplay = round.result || '';
        const canComplete = canCompleteGame(round);

        const hasSignalCard = round.cards && round.cards.some(card => typeof card.isSignalCard === 'function' && card.isSignalCard());
        if (hasSignalCard) {
            row.classList.add('s-signal-round');
        }
        if (usedCardCount !== totalCardCount) {
            row.classList.add('card-count-mismatch');
        }

        // 結果 badge
        const resultType = normalizeOutcome(resultDisplay);
        const resultBadge = resultType
            ? `<span class="outcome outcome-${resultType}">${resultDisplay}</span>`
            : (resultDisplay ? `<span class="outcome outcome-none">${resultDisplay}</span>` : '');

        const isSwapBankerSix = typeof swapBankerSixIndexes !== 'undefined' && swapBankerSixIndexes.has(index);
        const isBankerSixWin = round.result === '莊' && Number(bankerPoints) === 6 && Number(playerPoints) <= 5;

        // 調欄 badge
        let swapCellContent;
        if (!canComplete || !swapped_result) {
            swapCellContent = '<span class="row-tag tag-warn-red">無法對調</span>';
        } else if (isBankerSixWin) {
            swapCellContent = '<span class="row-tag tag-warn-amber">莊6贏</span>';
        } else if (isSwapBankerSix) {
            swapCellContent = '<span class="row-tag tag-warn-purple">對調莊6</span>';
        } else {
            const swapType = normalizeOutcome(swapped_display);
            swapCellContent = swapType ? `<span class="outcome outcome-${swapType}">${swapped_display}</span>` : (swapped_display || '');
        }

        const columnContent = {
            index: index + 1,
            segment: typeDisplay,
            cards: cardsCell,
            colors: colorCell,
            result: resultBadge,
            playerCards: playerHandText,
            bankerCards: bankerHandText,
            playerPoints,
            bankerPoints,
            swapPreview: swapCellContent
        };
        const rowHtml = ROUNDS_TABLE_COLUMNS.map(col => {
            const classes = [];
            if (col.cellClass) classes.push(col.cellClass);
            const content = columnContent[col.key];
            const cellContent = (content === undefined || content === null) ? '' : content;
            const isBankerSixCell = col.key === 'bankerPoints' && Number(cellContent) === 6;
            if (isBankerSixCell) {
                classes.push('banker-six-point');
            }
            const classAttr = classes.length ? ` class="${classes.join(' ')}"` : '';
            return `<td${classAttr}>${cellContent}</td>`;
        }).join('');
        row.innerHTML = rowHtml;
        row.dataset.r = index;
        row.classList.add('round-row');

        tbody.appendChild(row);
    });
    
    table.style.display = 'table';
    updateSelectionHighlights();
    updateEditUI();
    applyViolationHighlights();
}

// 根據 violationRoundIndexes 設定整行的背景標記
function applyViolationHighlights() {
    const schedule = (cb) => {
        if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
            if (pendingViolationHighlightFrame !== null) {
                window.cancelAnimationFrame(pendingViolationHighlightFrame);
            }
            pendingViolationHighlightFrame = window.requestAnimationFrame(() => {
                pendingViolationHighlightFrame = null;
                cb();
            });
        } else {
            setTimeout(cb, 0);
        }
    };

    clearTimeout(violationHighlightRetryTimer);
    violationHighlightRetryTimer = null;
    schedule(runViolationHighlightNow);
}

function runViolationHighlightNow() {
    const tbody = document.getElementById('roundsBody');
    if (!tbody) return;
    const rows = tbody.querySelectorAll('tr[data-r]');
    if (rows.length === 0) {
        // 表格尚未渲染完成，稍後再嘗試一次
        clearTimeout(violationHighlightRetryTimer);
        violationHighlightRetryTimer = setTimeout(runViolationHighlightNow, 30);
        return;
    }
    rows.forEach(row => {
        const idx = Number(row.dataset.r);
        const hasRuleViolation = (typeof violationRoundIndexes !== 'undefined') && violationRoundIndexes.has(idx);
        const hasStatsViolation = (typeof statsViolationRoundIndexes !== 'undefined') && statsViolationRoundIndexes.has(idx);
        const isViolation = hasRuleViolation || hasStatsViolation;
        const isSwapBankerSix = swapBankerSixIndexes.has(idx);
        const isBankerSix = (typeof bankerSixIndexes !== 'undefined') && bankerSixIndexes.has(idx);
        const isCardColorViolation = (typeof cardColorViolationIndexes !== 'undefined') && cardColorViolationIndexes.has(idx);
        row.classList.toggle('violation-row', isViolation);
        // 對調莊6：只亮結果欄的字，不亮整行
        const resultCell = isSwapBankerSix ? row.querySelector('td.result-cell') : null;
        if (resultCell) {
            resultCell.classList.add('swap-banker-six-result');
        } else if (!isSwapBankerSix) {
            const prevResult = row.querySelector('td.swap-banker-six-result');
            if (prevResult) prevResult.classList.remove('swap-banker-six-result');
        }
        row.classList.toggle('banker-six-win-row', isBankerSix);
        row.classList.toggle('card-color-violation-row', isCardColorViolation);
    });
}

// 取消待處理的自動重生成
function cancelPendingAutoRegenerate() {
    if (typeof window === 'undefined') return;
    if (window.__regenerateTimerId) {
        clearTimeout(window.__regenerateTimerId);
        window.__regenerateTimerId = null;
    }
}

// 控制編輯相關按鈕的可用狀態
function setEditButtonsAvailability(enabled) {
    editEnabled = Boolean(enabled);
    if (!editEnabled) {
        EDIT_STATE.mode = 'none';
        EDIT_STATE.first = null;
        EDIT_STATE.second = null;
    }
    updateEditUI();
    updateSelectionHighlights();
}

// 更新右側編輯工具的按鈕狀態與提示
function updateEditUI() {
    const canModify = editEnabled && Array.isArray(currentRounds) && currentRounds.length > 0;
    const btnRound = document.getElementById('btnRound');
    const btnSwap = document.getElementById('btnSwap');
    const btnAutoReorder = document.getElementById('btnAutoReorder');
    const btnCancel = document.getElementById('btnCancelEdit');
    const btnApply = document.getElementById('btnApplyChanges');
    if (btnRound) {
        btnRound.disabled = !canModify;
        btnRound.classList.toggle('active', canModify && EDIT_STATE.mode === 'round');
    }
    const hasFirst = Boolean(EDIT_STATE.first);
    const hasSecond = Boolean(EDIT_STATE.second);
    if (btnSwap) {
        btnSwap.disabled = !canModify;
        btnSwap.classList.toggle('active', canModify && EDIT_STATE.mode === 'card');
    }
    if (btnAutoReorder) {
        const selectedRoundIndex = (EDIT_STATE && EDIT_STATE.first && typeof EDIT_STATE.first.r === 'number')
            ? EDIT_STATE.first.r
            : null;
        const selectedRound = (canModify && typeof selectedRoundIndex === 'number') ? currentRounds?.[selectedRoundIndex] : null;
        const needed = Boolean(selectedRound && isRoundAutoReorderNeeded(selectedRound));
        btnAutoReorder.disabled = !(canModify && typeof selectedRoundIndex === 'number' && needed);
        btnAutoReorder.title = (canModify && typeof selectedRoundIndex === 'number')
            ? (needed ? '僅重排目前選取的異常局' : '此局沒有藍底/無法對調，不需重排')
            : '請先用換牌/換局選取一局';
    }
    if (btnCancel) {
        const canCancel = canModify && (EDIT_STATE.mode !== 'none' || hasFirst || hasSecond);
        btnCancel.disabled = !canCancel;
    }
    if (btnCancel) {
        btnCancel.disabled = !canModify;
    }
    if (btnApply) {
        btnApply.disabled = !canModify;
    }
    const btnAutoColor = document.getElementById('btnAutoColor');
    if (btnAutoColor) {
        btnAutoColor.disabled = !(Array.isArray(currentRounds) && currentRounds.length > 0);
    }
    if (typeof document !== 'undefined' && document.body) {
        const zoomEnabled = canModify && EDIT_STATE.mode !== 'none';
        document.body.classList.toggle('table-zoom', zoomEnabled);
    }
}

// 同步表格選取的高亮樣式
function updateSelectionHighlights() {
    const cardEls = document.querySelectorAll('#roundsBody span[data-action="card"]');
    cardEls.forEach(el => {
        el.classList.remove('selected-first', 'selected-second');
    });
    const rowEls = document.querySelectorAll('#roundsBody tr[data-r]');
    rowEls.forEach(row => {
        row.classList.remove('selected-first', 'selected-second');
    });
    if (!editEnabled) return;
    if (EDIT_STATE.mode === 'card') {
        if (EDIT_STATE.first) {
            const el = document.querySelector(`#roundsBody span[data-action="card"][data-r="${EDIT_STATE.first.r}"][data-c="${EDIT_STATE.first.c}"]`);
            if (el) el.classList.add('selected-first');
        }
        if (EDIT_STATE.second) {
            const el = document.querySelector(`#roundsBody span[data-action="card"][data-r="${EDIT_STATE.second.r}"][data-c="${EDIT_STATE.second.c}"]`);
            if (el) el.classList.add('selected-second');
        }
    } else if (EDIT_STATE.mode === 'round') {
        if (EDIT_STATE.first) {
            const row = document.querySelector(`#roundsBody tr[data-r="${EDIT_STATE.first.r}"]`);
            if (row) row.classList.add('selected-first');
        }
        if (EDIT_STATE.second) {
            const row = document.querySelector(`#roundsBody tr[data-r="${EDIT_STATE.second.r}"]`);
            if (row) row.classList.add('selected-second');
        }
    }
}

// 渲染牌組摘要
function renderDeckSummary(summary) {
    const container = document.getElementById('signalSummary');
    if (!container) return;
    if (!summary || !summary.by_rank_suit) {
        container.innerHTML = '';
        return;
    }
    const ranks = SIGNAL_RANKS_ORDER;
    const suits = SIGNAL_SUITS_ORDER;
    const byRankSuit = summary.by_rank_suit;
    const cardsByRankSuit = summary.cards_by_rank_suit || {};
    const suitTotals = summary.suit_totals || {};
    const totalCards = summary.total_cards || 0;
    const warnHtml = totalCards !== 416
        ? `<div class="stats-warning">⚠ 張數異常：${totalCards} / 416</div>`
        : '';
    let html = warnHtml + '<div class="summary-title">牌靴分布</div>';
    html += '<table class="stats-table signal-table"><thead><tr><th></th>';
    html += ranks.map(r => `<th>${r}</th>`).join('');
    html += '<th>合計</th></tr></thead><tbody>';
    for (const suit of suits) {
        const symbol = SUIT_LETTER_TO_SYMBOL_MAP[suit] || suit;
        html += `<tr><td>${symbol}</td>`;
        let rowTotal = 0;
        for (const rank of ranks) {
            const key = `${suit}_${rank}`;
            const val = byRankSuit[key] || 0;
            rowTotal += val;
            let black = 0, red = 0;
            if (val && cardsByRankSuit[key]) {
                for (const card of cardsByRankSuit[key]) {
                    if (card.color === 'B' || card.back_color === 'B') black++;
                    else if (card.color === 'R' || card.back_color === 'R') red++;
                }
            }
            html += `<td>${black}/${red}</td>`;
        }
        html += `<td>${rowTotal}</td></tr>`;
    }
    const columnTotals = {};
    for (const rank of ranks) {
        columnTotals[rank] = 0;
        for (const suit of suits) {
            columnTotals[rank] += byRankSuit[`${suit}_${rank}`] || 0;
        }
    }
    html += '<tr><td>合計</td>';
    for (const rank of ranks) {
        html += `<td>${columnTotals[rank] || 0}</td>`;
    }
    html += `<td>${totalCards}</td></tr>`;
    html += '</tbody></table>';
    html += `<div class="stats-total">牌靴總張數:<strong>${totalCards}/416</strong></div>`;
    container.innerHTML = html;
}

// 重設編輯狀態與按鈕
function resetEditState() {
    EDIT_STATE.mode = 'none';
    EDIT_STATE.first = null;
    EDIT_STATE.second = null;
    updateEditUI();
    updateSelectionHighlights();
}

// 啟動某種編輯模式（交換/拖移等）
function activateEditMode(mode) {
    if (!editEnabled || !Array.isArray(currentRounds) || currentRounds.length === 0) {
        log('請先生成牌靴,再進行編輯。', 'error');
        return;
    }
    cancelPendingAutoRegenerate();
    if (EDIT_STATE.mode === mode) {
        resetEditState();
        return;
    }
    EDIT_STATE.mode = mode;
    EDIT_STATE.first = null;
    EDIT_STATE.second = null;
    updateEditUI();
    updateSelectionHighlights();
    if (mode === 'card') {
        log('換牌模式:請點選第一張牌，再按一次「換牌」完成交換。', 'info');
    } else if (mode === 'round') {
        log('換局模式:請點選第一局，再按一次「換局」完成交換。', 'info');
    }
}

// 處理表格中某個卡片的選取事件
function handleCardSelection(r, c) {
    if (EDIT_STATE.mode !== 'card' || !editEnabled) return;
    if (!EDIT_STATE.first || (EDIT_STATE.first && EDIT_STATE.second)) {
        EDIT_STATE.first = { r, c };
        EDIT_STATE.second = null;
    } else if (EDIT_STATE.first && EDIT_STATE.first.r === r && EDIT_STATE.first.c === c) {
        EDIT_STATE.first = null;
    } else if (!EDIT_STATE.second) {
        EDIT_STATE.second = { r, c };
    } else {
        EDIT_STATE.first = { r, c };
        EDIT_STATE.second = null;
    }
    updateEditUI();
    updateSelectionHighlights();
}

// 處理整行的選取（標示與高亮）
function handleRowSelection(r) {
    if (EDIT_STATE.mode !== 'round' || !editEnabled) return;
    if (!EDIT_STATE.first || (EDIT_STATE.first && EDIT_STATE.second)) {
        EDIT_STATE.first = { r };
        EDIT_STATE.second = null;
    } else if (EDIT_STATE.first && EDIT_STATE.first.r === r) {
        EDIT_STATE.first = null;
    } else if (!EDIT_STATE.second) {
        EDIT_STATE.second = { r };
    } else {
        EDIT_STATE.first = { r };
        EDIT_STATE.second = null;
    }
    updateEditUI();
    updateSelectionHighlights();
}

// 錨點表格的各種 click 行為
function handleTableClick(event) {
    if (!editEnabled) return;
    const cardSpan = event.target.closest('span[data-action="card"]');
    if (cardSpan) {
        const r = Number(cardSpan.dataset.r);
        const c = Number(cardSpan.dataset.c);
        handleCardSelection(r, c);
        return;
    }
    const row = event.target.closest('tr[data-r]');
    if (row) {
        const r = Number(row.dataset.r);
        handleRowSelection(r);
    }
}

// 執行目前選取的交換動作
function executeSwapAction() {
    if (!editEnabled || !Array.isArray(currentRounds) || currentRounds.length === 0) {
        log('請先生成牌靴,再進行編輯。', 'error');
        return;
    }
    if (EDIT_STATE.mode === 'card') {
    if (!EDIT_STATE.first || !EDIT_STATE.second) {
        log('請先選擇兩張要交換的牌。', 'warn');
        return;
    }
    const { r: r1, c: c1 } = EDIT_STATE.first;
    const { r: r2, c: c2 } = EDIT_STATE.second;
    const cardA = currentRounds?.[r1]?.cards?.[c1];
    const cardB = currentRounds?.[r2]?.cards?.[c2];
    if (!cardA || !cardB) {
        log('卡交換失敗:選取的牌不存在。', 'error');
        return;
    }
    
    // ✅ 改用預覽模式 (可透過開關停用)
    if (swapPreviewEnabled && typeof initiateSwapWithPreview === 'function') {
        initiateSwapWithPreview(r1, c1, r2, c2);
        return;  // 預覽會處理後續，這裡先 return
    }
    
    // 備用：如果沒有預覽功能，維持原本的直接交換
    [currentRounds[r1].cards[c1], currentRounds[r2].cards[c2]] = [cardB, cardA];
    recomputeRoundOutcome(currentRounds[r1]);
    recomputeRoundOutcome(currentRounds[r2]);
    log(`已交換第 ${r1 + 1} 局第 ${c1 + 1} 張與第 ${r2 + 1} 局第 ${c2 + 1} 張。`, 'success');
    EDIT_STATE.first = null;
    EDIT_STATE.second = null;
    refreshAnalysisAndRender();
    updateEditUI();
    updateSelectionHighlights();
}
    else if (EDIT_STATE.mode === 'round') {
        if (!EDIT_STATE.first || !EDIT_STATE.second) {
            log('請先選擇兩個要交換的局。', 'warn');
            return;
        }
        const r1 = EDIT_STATE.first.r;
        const r2 = EDIT_STATE.second.r;
        if (r1 === r2) {
            log('同一局不需要交換。', 'info');
            return;
        }
        const roundA = currentRounds?.[r1];
        const roundB = currentRounds?.[r2];
        if (!roundA || !roundB) {
            log('局交換失敗:找不到指定的局。', 'error');
            return;
        }
        [currentRounds[r1], currentRounds[r2]] = [roundB, roundA];
        log(`已交換第 ${r1 + 1} 局與第 ${r2 + 1} 局。`, 'success');
        EDIT_STATE.first = null;
        EDIT_STATE.second = null;
        refreshAnalysisAndRender();
        updateEditUI();
        updateSelectionHighlights();
    } else {
        log('請先選擇編輯或局交換模式。', 'info');
    }
}

// 清空所有資料
function clearAll() {
    currentRounds = null;
    currentAnalysis = null;
    
    updateStats({
        totalRounds: 0,
        bankerCount: 0,
        playerCount: 0,
        tieCount: 0,
        sSignalCards: 0,
        nonSSignalCards: 0,
        deckSummary: null
    });
    renderDeckSummary(null);
    renderStatsGridPreview(null);
    
    document.getElementById('roundsTable').style.display = 'none';
    document.getElementById('logArea').innerHTML = '';
    const autoColorBtn = document.getElementById('btnAutoColor');
    if (autoColorBtn) autoColorBtn.disabled = true;
    setEditButtonsAvailability(false);
    if (typeof updateViolationUI === 'function') {
        updateViolationUI(null);
    }
    log('已清空所有資料', 'info');
}

// 確認牌靴已生成再執行其他功能
function ensureRoundsReady(featureName) {
    if (!currentRounds || currentRounds.length === 0) {
        log(`請先生成牌靴,再使用「${featureName}」功能。`, 'error');
        return false;
    }
    return true;
}

// 將牌靴資料轉為每個格子所需的 class/value，包含 T 框與段別
function buildPreviewGrid(deckCards, rounds) {
    const COLS = PREVIEW_GRID_COLS;
    const ROWS = PREVIEW_GRID_ROWS;
    const ROUND_COLS = 7;
    const ROUNDS_PER_ROW = COLS / ROUND_COLS;
    const MAX_ROUNDS = ROWS * ROUNDS_PER_ROW;
    const gridSize = COLS * ROWS;
    const grid = Array.from({ length: gridSize }, () => ({ classes: ['cell'], value: '', deckIndex: null }));
    const segmentByIndex = new Map();
    if (Array.isArray(rounds)) {
        let cursor = 0;
        rounds.forEach(round => {
            const cards = Array.isArray(round?.cards) ? round.cards : [];
            const len = cards.length;
            for (let i = 0; i < len; i++) {
                segmentByIndex.set(cursor + i, (round.segment === 'A' || round.segment === 'C') ? round.segment : '');
            }
            cursor += len;
        });
    }

    const totalRounds = Math.min(Array.isArray(rounds) ? rounds.length : 0, MAX_ROUNDS);
    let cardCursor = 0;
    for (let roundIndex = 0; roundIndex < totalRounds; roundIndex++) {
        const round = rounds[roundIndex];
        const row = Math.floor(roundIndex / ROUNDS_PER_ROW);
        const slot = roundIndex % ROUNDS_PER_ROW;
        const baseIndex = row * COLS + slot * ROUND_COLS;
        const resultClasses = ['cell', 'result-cell'];
        let resultValue = '';
        if (round.result === '莊') {
            resultClasses.push('result-banker');
            resultValue = 'O';
        } else if (round.result === '閒') {
            resultClasses.push('result-player');
            resultValue = 'X';
        } else if (round.result === '和') {
            resultClasses.push('result-tie');
            resultValue = '和';
        }
        grid[baseIndex] = { classes: resultClasses, value: resultValue, deckIndex: null };
        const cards = Array.isArray(round?.cards) ? round.cards : [];
        for (let cardIdx = 0; cardIdx < cards.length; cardIdx++) {
            const card = cards[cardIdx];
            const deckIndex = cardCursor;
            cardCursor += 1;
            if (cardIdx >= ROUND_COLS - 1) continue;
            const gridIndex = baseIndex + 1 + cardIdx;
            if (gridIndex >= gridSize) continue;
            const classes = ['cell'];
            const color = getCardColorCode(card);
            if (color === 'R') classes.push('card-red');
            else if (color === 'B') classes.push('card-blue');
            const isSignal = typeof card?.isSignalCard === 'function'
                ? card.isSignalCard()
                : isSignalConfiguredCard(card);
            if (isSignal) classes.push('signal-match');
            const seg = segmentByIndex.get(deckIndex);
            if (seg === 'A') classes.push('segment-a');
            else if (seg === 'C') classes.push('segment-c');
            if (round && round.isHeartMarker && card && card.suit === '♥') {
                classes.push('heart-marker');
            }
            grid[gridIndex] = {
                classes,
                value: gridValueFromCard(card),
                deckIndex
            };
        }
    }

    return grid.map(cell => ({
        className: (cell.classes && cell.classes.length) ? cell.classes.join(' ') : 'cell',
        value: cell.value || '',
        deckIndex: cell.deckIndex
    }));
}

// 在右側小格中渲染目前牌靴的預覽圖
function renderStatsGridPreview(rounds) {
    if (typeof document === 'undefined') return;
    const container = document.getElementById('statsGridPreview');
    if (!container) return;
    const deckCards = flattenDeckFromRounds(rounds);
    if (!deckCards.length) {
        container.innerHTML = '<div class="grid-placeholder">尚無牌靴資料</div>';
        return;
    }
    const COLS = 21;
    const ROWS = PREVIEW_GRID_ROWS;
    const MAX = COLS * ROWS;
    const gridData = buildPreviewGrid(deckCards, rounds);
    const padded = gridData.slice(0, MAX);
    while (padded.length < MAX) {
        padded.push({ className: 'cell', value: '' });
    }
    container.innerHTML = padded
        .map(cell => {
            const dataAttr = cell.deckIndex != null ? ` data-card-index="${cell.deckIndex}"` : '';
            return `<div class="${cell.className}"${dataAttr}>${cell.value || ''}</div>`;
        })
        .join('');
}

// 把目前牌靴轉成 Excel，包含預覽與原始數據工作表並下載
async function exportRoundsAsExcel() {
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

        const ws1 = wb.addWorksheet('預覽');
        ws1.properties.defaultRowHeight = 27;
        ws1.pageSetup = {
            paperSize: 9,
            orientation: 'portrait',
            fitToPage: true,
            fitToWidth: 1,
            fitToHeight: 1,
            horizontalCentered: true,
            verticalCentered: true,
            margins: { left: 0.15, right: 0.15, top: 0.2, bottom: 0.2, header: 0.1, footer: 0.1 },
            printArea: null
        };

        const COLS = 21;
        const ROWS = PREVIEW_GRID_ROWS;
        const GROUP = PREVIEW_GRID_GROUP;
        const columnWidths = [];
        for (let colIndex = 0; colIndex < COLS; colIndex++) {
            columnWidths.push(4.8);
            if ((colIndex + 1) % GROUP === 0 && colIndex < COLS - 1) {
                columnWidths.push(1.2);
            }
        }
        columnWidths.forEach((width, index) => {
            ws1.getColumn(index + 1).width = width;
        });

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
                wsCell.font = { size: 16, bold: true, color: { argb: 'FF000000' } };
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
                } else if (classes.includes('card-blue')) {
                    wsCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00FFFF' } };
                }
                if (classes.includes('signal-match')) {
                    wsCell.font = { ...wsCell.font, color: { argb: 'FFDC3545' } };
                }
                if (isBankerResult) {
                    wsCell.font = { ...wsCell.font, color: { argb: 'FFCC3333' } };
                } else if (isPlayerResult) {
                    wsCell.font = { ...wsCell.font, color: { argb: 'FF0052CC' } };
                } else if (isTieResult) {
                    wsCell.font = { ...wsCell.font, color: { argb: 'FF2E8B57' } };
                }
            }
        }

        // 設定列印範圍：精確覆蓋資料區域
        const totalSheetCols = COLS + Math.floor((COLS - 1) / GROUP);
        const lastColLetter = String.fromCharCode(64 + (totalSheetCols > 26 ? 0 : totalSheetCols));
        const lastColStr = totalSheetCols > 26
            ? String.fromCharCode(64 + Math.floor((totalSheetCols - 1) / 26)) + String.fromCharCode(65 + ((totalSheetCols - 1) % 26))
            : String.fromCharCode(64 + totalSheetCols);
        ws1.pageSetup.printArea = `A1:${lastColStr}${ROWS}`;

        const ws2 = wb.addWorksheet('原始數據');
        const headers = ['局號', '段標', '色序', '卡片1', '卡片2', '卡片3', '卡片4', '卡片5', '卡片6', '結果', '訊號'];
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
            const signalTag = sIndexes.has(idx) ? 'S' : '';
            row.push(signalTag);
            ws2.addRow(row);
        });

        ws2.columns.forEach(column => {
            column.width = 12;
        });

        const ws3 = wb.addWorksheet('局數統計');
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

        ws3.addRow(['項目', '局數', '比例', '備註']);
        ws3.addRow(['4張局', fourCardRounds, `${fourCardPct}%`, `${fourCardRounds}/${totalRounds}`]);
        ws3.addRow(['5張局', fiveCardRounds, `${fiveCardPct}%`, `${fiveCardRounds}/${totalRounds}`]);
        ws3.addRow(['6張局', sixCardRounds, `${sixCardPct}%`, `${sixCardRounds}/${totalRounds}`]);
        const headerRow3 = ws3.getRow(1);
        headerRow3.font = { bold: true };
        headerRow3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F3FF' } };
        ws3.getColumn(1).width = 12;
        ws3.getColumn(2).width = 10;
        ws3.getColumn(3).width = 10;
        ws3.getColumn(4).width = 14;

        const buffer = await wb.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.href = url;
        link.download = (typeof getNextExportFilename === 'function') ? getNextExportFilename() : `signal-analysis-${Date.now()}.xlsx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        log('合併Excel檔案已導出成功!', 'success');
    } catch (error) {
        console.error('紅0 導出失敗:', error);
        const message = error && error.message ? error.message : error;
        log(`導出失敗:${message}`, 'error');
    }
}

// 打開語音助理頁面
function openSpeechAssistant() {
    const win = window.open('assistant.html', '_blank');
    if (!win) {
        log('瀏覽器阻擋了語音視窗，請允許快顯視窗。', 'error');
    } else {
        log('已開啟語音助手視窗，請在新視窗上傳 Excel 後朗讀。', 'info');
    }
}

// 顯示懸浮計算工具
function showCalcTool() {
    ensureFloatingWidget();
    const widget = document.getElementById('floatingAssistant');
    if (widget) widget.style.display = 'block';
}

// 確保懸浮工具 widget 已建立
function ensureFloatingWidget() {
    if (typeof document === 'undefined') return false;
    if (!document.getElementById('floatingAssistant')) {
        const widgetHTML = `
        <div class="floating-widget" id="floatingAssistant">
        <div class="widget-content">
            <div class="widget-actions">
                <button id="closeWidgetBtn" class="widget-action widget-close" type="button">關閉</button>
                <button id="sim_reset-btn" class="widget-action widget-reset" type="button">清空</button>
            </div>
            <div class="card-inputs">
                <input type="number" inputmode="numeric" class="card-input" id="sim_p1" min="0" max="9" placeholder="閒1">
                <input type="number" inputmode="numeric" class="card-input" id="sim_b1" min="0" max="9" placeholder="莊1">
                <input type="number" inputmode="numeric" class="card-input" id="sim_p2" min="0" max="9" placeholder="閒2">
                <input type="number" inputmode="numeric" class="card-input" id="sim_b2" min="0" max="9" placeholder="莊2">
                <input type="number" inputmode="numeric" class="card-input disabled" id="sim_p3" min="0" max="9" placeholder="閒3">
                <input type="number" inputmode="numeric" class="card-input disabled" id="sim_b3" min="0" max="9" placeholder="莊3">
            </div>
            <div class="results">
                <div class="result-strip">
                    <span class="result-value metric-value result-player" id="sim_normal-p-points">---</span>
                    <span class="result-value metric-value result-banker" id="sim_normal-b-points">---</span>
                    <span class="result-value metric-value result-outcome" id="sim_normal-tie-result">---</span>
                </div>
                <div class="result-strip">
                    <span class="result-value metric-value result-player" id="sim_swapped-p-points">---</span>
                    <span class="result-value metric-value result-banker" id="sim_swapped-b-points">---</span>
                    <span class="result-value metric-value result-outcome" id="sim_swapped-tie-result">---</span>
                </div>
            </div>
        </div>
    </div>`;
        document.body.insertAdjacentHTML('beforeend', widgetHTML);
        bindSimulatorLogic();
        const widget = document.getElementById('floatingAssistant');
        widget.style.display = 'none';
        const closeBtn = document.getElementById('closeWidgetBtn');
        if (closeBtn) closeBtn.onclick = () => widget.style.display = 'none';
        let isDragging = false, offsetX = 0, offsetY = 0;
        const startDrag = (e) => {
            if (e.target.closest('.card-inputs') || e.target.closest('.result-strip') || e.target.closest('.widget-close') || e.target.id === 'sim_reset-btn') return;
            isDragging = true;
            offsetX = e.clientX - widget.offsetLeft;
            offsetY = e.clientY - widget.offsetTop;
            e.preventDefault();
        };
        const onDrag = (e) => {
            if (!isDragging) return;
            widget.style.left = `${e.clientX - offsetX}px`;
            widget.style.top = `${e.clientY - offsetY}px`;
        };
        const stopDrag = () => { isDragging = false; };
        widget.addEventListener('mousedown', startDrag);
        document.addEventListener('mousemove', onDrag);
        document.addEventListener('mouseup', stopDrag);
    }
    return true;
}

// 綁定模擬器 UI 按鈕的事件
function bindSimulatorLogic() {
    const inputs = {
        p1: document.getElementById('sim_p1'),
        b1: document.getElementById('sim_b1'),
        p2: document.getElementById('sim_p2'),
        b2: document.getElementById('sim_b2'),
        p3: document.getElementById('sim_p3'),
        b3: document.getElementById('sim_b3')
    };
    const resetButton = document.getElementById('sim_reset-btn');
    const normalPPointsEl = document.getElementById('sim_normal-p-points');
    const normalBPointsEl = document.getElementById('sim_normal-b-points');
    const normalTieResultEl = document.getElementById('sim_normal-tie-result');
    const swappedPPointsEl = document.getElementById('sim_swapped-p-points');
    const swappedBPointsEl = document.getElementById('sim_swapped-b-points');
    const swappedTieResultEl = document.getElementById('sim_swapped-tie-result');

    function simulate(p1, b1, p2, b2, p3, b3) {
        let p_tot = (p1 + p2) % 10;
        let b_tot = (b1 + b2) % 10;
        const natural = (p_tot >= 8 || b_tot >= 8);
        let p3_val = null;
        let needs_p3 = false;
        let needs_b3 = false;
        let final_p_tot = p_tot;
        let final_b_tot = b_tot;

        if (!natural) {
            if (p_tot <= 5) {
                needs_p3 = true;
                if (p3 !== null) {
                    p3_val = p3;
                    final_p_tot = (p_tot + p3) % 10;
                }
            }
            if (p3_val === null) {
                if (b_tot <= 5) {
                    needs_b3 = true;
                    if (b3 !== null) final_b_tot = (b_tot + b3) % 10;
                }
            } else {
                const pt = p3_val;
                if (
                    b_tot <= 2 ||
                    (b_tot === 3 && pt !== 8) ||
                    (b_tot === 4 && [2, 3, 4, 5, 6, 7].includes(pt)) ||
                    (b_tot === 5 && [4, 5, 6, 7].includes(pt)) ||
                    (b_tot === 6 && [6, 7].includes(pt))
                ) {
                    needs_b3 = true;
                }
                if (needs_b3 && b3 !== null) final_b_tot = (b_tot + b3) % 10;
            }
        }

        const result = (final_p_tot > final_b_tot) ? '閒' : ((final_b_tot > final_p_tot) ? '莊' : '和');
        return { result, p_tot: final_p_tot, b_tot: final_b_tot, needs_p3, needs_b3 };
    }

    function updateUI() {
        const values = {};
        let allFourFilled = true;
        Object.keys(inputs).forEach((key) => {
            const parsed = parseInt(inputs[key].value, 10);
            values[key] = Number.isNaN(parsed) ? null : parsed;
            if (['p1', 'b1', 'p2', 'b2'].includes(key) && values[key] === null) {
                allFourFilled = false;
            }
        });

        // 預設：第5、6張都隱藏 + 取消高亮
        inputs.p3.classList.add('hidden');
        inputs.p3.classList.remove('highlight');
        inputs.b3.classList.add('hidden');
        inputs.b3.classList.remove('highlight');

        const resetOutput = (el, extraClass) => {
            el.textContent = '---';
            el.className = `result-value metric-value ${extraClass}`;
        };

        if (!allFourFilled) {
            // 還沒填滿前 4 張：清空第5、6張的值
            inputs.p3.value = '';
            inputs.b3.value = '';
            resetOutput(normalPPointsEl, 'result-player');
            resetOutput(normalBPointsEl, 'result-banker');
            resetOutput(normalTieResultEl, 'result-outcome');
            resetOutput(swappedPPointsEl, 'result-player');
            resetOutput(swappedBPointsEl, 'result-banker');
            resetOutput(swappedTieResultEl, 'result-outcome');
            return;
        }

        const normalResult = simulate(values.p1, values.b1, values.p2, values.b2, values.p3, values.b3);
        normalPPointsEl.textContent = normalResult.p_tot;
        normalBPointsEl.textContent = normalResult.b_tot;
        normalTieResultEl.textContent = normalResult.result;
        normalTieResultEl.className = `result-value metric-value result-outcome outcome-${normalResult.result === '莊' ? 'banker' : normalResult.result === '閒' ? 'player' : 'tie'}`;

        // 第5張（閒第三張）：需要時才顯示並高亮
        if (normalResult.needs_p3) {
            inputs.p3.classList.remove('hidden');
            inputs.p3.classList.add('highlight');
        } else {
            inputs.p3.value = '';
        }
        // 第6張（莊第三張）：需要時才顯示並高亮
        if (normalResult.needs_b3) {
            inputs.b3.classList.remove('hidden');
            inputs.b3.classList.add('highlight');
        } else {
            inputs.b3.value = '';
        }

        const swappedResult = simulate(values.b1, values.p1, values.b2, values.p2, values.p3, values.b3);
        swappedPPointsEl.textContent = swappedResult.p_tot;
        swappedBPointsEl.textContent = swappedResult.b_tot;
        swappedTieResultEl.textContent = swappedResult.result;
        swappedTieResultEl.className = `result-value metric-value result-outcome outcome-${swappedResult.result === '莊' ? 'banker' : swappedResult.result === '閒' ? 'player' : 'tie'}`;
    }

    Object.values(inputs).forEach(input => {
        if (!input) return;
        input.addEventListener('input', updateUI);
    });

    if (resetButton) {
        resetButton.addEventListener('click', () => {
            Object.values(inputs).forEach(input => {
                if (input) input.value = '';
            });
            updateUI();
        });
    }

    updateUI();
}

function initSwapPreviewToggle() {
    if (typeof document === 'undefined') return;
    const checkbox = document.getElementById('toggleSwapPreview');
    if (!checkbox) return;

    let initialState = checkbox.checked;
    if (typeof window !== 'undefined' && window.localStorage) {
        const saved = localStorage.getItem(SWAP_PREVIEW_STORAGE_KEY);
        if (saved === 'true') initialState = true;
        else if (saved === 'false') initialState = false;
    }

    swapPreviewEnabled = initialState;
    checkbox.checked = initialState;

    checkbox.addEventListener('change', () => {
        swapPreviewEnabled = checkbox.checked;
        if (typeof window !== 'undefined' && window.localStorage) {
            try {
                localStorage.setItem(SWAP_PREVIEW_STORAGE_KEY, swapPreviewEnabled ? 'true' : 'false');
            } catch (_) {}
        }
        log(`換牌預覽已${swapPreviewEnabled ? '開啟' : '關閉'}`, swapPreviewEnabled ? 'info' : 'warn');
    });
}

// ============================================================
// 新增對話框按鈕事件監聽器
// ============================================================
function initNewDialogButtons() {
    if (typeof document === 'undefined') return;
    
    // 依序列生成按鈕
    const btnSequence = document.getElementById('btnSequence');
    if (btnSequence && typeof showSequenceInputDialog === 'function') {
        btnSequence.addEventListener('click', showSequenceInputDialog);
    }
    
    // 路單 / 路單編輯 toggle（共用 inlineRoadmapContainer）
    const btnRoadMap = document.getElementById('btnRoadMap');
    const btnRoadInput = document.getElementById('btnRoadInput');
    const _roadCtr = document.getElementById('inlineRoadmapContainer');

    function _setRoadActiveBtn(which) {
        if (btnRoadMap) btnRoadMap.classList.toggle('btn-road-active', which === 'road');
        if (btnRoadInput) btnRoadInput.classList.toggle('btn-road-active', which === 'edit');
    }

    if (btnRoadMap) {
        btnRoadMap.addEventListener('click', () => {
            if (_roadCtr && _roadCtr.dataset.mode === 'road') {
                _roadCtr.innerHTML = '';
                delete _roadCtr.dataset.mode;
                _setRoadActiveBtn(null);
            } else {
                if (typeof window.renderInlineRoadmap === 'function') window.renderInlineRoadmap();
                if (_roadCtr) _roadCtr.dataset.mode = 'road';
                _setRoadActiveBtn('road');
            }
        });
    }

    if (btnRoadInput) {
        btnRoadInput.addEventListener('click', () => {
            if (_roadCtr && _roadCtr.dataset.mode === 'edit') {
                _roadCtr.innerHTML = '';
                delete _roadCtr.dataset.mode;
                _setRoadActiveBtn(null);
            } else {
                if (typeof window.renderInlineRoadEdit === 'function') {
                    window.renderInlineRoadEdit(_roadCtr);
                } else if (typeof window.showRoadInputDialog === 'function') {
                    window.showRoadInputDialog();
                }
                _setRoadActiveBtn('edit');
            }
        });
    }
}

// 當 DOM 準備好時初始化
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initNewDialogButtons);
    } else {
        initNewDialogButtons();
    }
}
