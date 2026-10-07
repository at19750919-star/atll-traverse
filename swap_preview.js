// ============================================================
// 換牌全局預覽功能
// ============================================================
// 當選擇要交換的牌時，即時預覽交換後「整副牌 416 張」重新發牌的結果
// 
// 功能：
// 1. 選擇兩張牌後，不立即交換
// 2. 模擬交換後整副牌重新發牌
// 3. 顯示每局的變化（結果、牌數、敏感局狀態）
// 4. 顯示回復分析的變化
// 5. 確認後才真正執行交換
// ============================================================

// 預覽狀態
let previewState = {
    active: false,
    originalRounds: null,      // 原始局資料
    previewRounds: null,       // 預覽後的局資料
    originalRecovery: null,    // 原始回復分析
    previewRecovery: null,     // 預覽後的回復分析
    swapInfo: null             // 交換資訊 {r1, c1, r2, c2}
};

/**
 * 從 currentRounds 建立完整牌組（416張）
 */
function buildFullDeckFromCurrentRounds() {
    if (!Array.isArray(currentRounds)) return [];
    const deck = [];
    currentRounds.forEach(round => {
        if (round && Array.isArray(round.cards)) {
            round.cards.forEach(card => {
                if (card) {
                    // 深拷貝牌物件，避免引用問題
                    if (typeof card.clone === 'function') {
                        deck.push(card.clone());
                    } else {
                        deck.push({ ...card });
                    }
                }
            });
        }
    });
    return deck;
}

/**
 * 模擬一局百家樂，回傳用了幾張牌和結果
 */
function simulateOneRound(deck, startIdx) {
    if (startIdx + 3 >= deck.length) return null;

    const getPoint = (card) => {
        if (!card) return 0;
        if (typeof card.point === 'function') return card.point();
        return 0;
    };

    const p1 = deck[startIdx];
    const b1 = deck[startIdx + 1];
    const p2 = deck[startIdx + 2];
    const b2 = deck[startIdx + 3];

    let pTotal = (getPoint(p1) + getPoint(p2)) % 10;
    let bTotal = (getPoint(b1) + getPoint(b2)) % 10;

    const playerCards = [p1, p2];
    const bankerCards = [b1, b2];
    let cardCount = 4;

    // 天牌
    if (pTotal >= 8 || bTotal >= 8) {
        const result = pTotal === bTotal ? '和' : (pTotal > bTotal ? '閒' : '莊');
        return {
            cardCount,
            result,
            playerCards,
            bankerCards,
            playerTotal: pTotal,
            bankerTotal: bTotal,
            cards: deck.slice(startIdx, startIdx + cardCount)
        };
    }

    let p3Point = null;

    // 閒家補牌
    if (pTotal <= 5) {
        if (startIdx + 4 >= deck.length) return null;
        const p3 = deck[startIdx + 4];
        playerCards.push(p3);
        p3Point = getPoint(p3);
        pTotal = (pTotal + p3Point) % 10;
        cardCount = 5;
    }

    // 莊家補牌規則
    const shouldBankerDraw = (bt, p3) => {
        if (p3 === null) return bt <= 5;
        if (bt <= 2) return true;
        if (bt === 3) return p3 !== 8;
        if (bt === 4) return p3 >= 2 && p3 <= 7;
        if (bt === 5) return p3 >= 4 && p3 <= 7;
        if (bt === 6) return p3 === 6 || p3 === 7;
        return false;
    };

    if (shouldBankerDraw(bTotal, p3Point)) {
        if (startIdx + cardCount >= deck.length) return null;
        const b3 = deck[startIdx + cardCount];
        bankerCards.push(b3);
        bTotal = (bTotal + getPoint(b3)) % 10;
        cardCount++;
    }

    const result = pTotal === bTotal ? '和' : (pTotal > bTotal ? '閒' : '莊');

    return {
        cardCount,
        result,
        playerCards,
        bankerCards,
        playerTotal: pTotal,
        bankerTotal: bTotal,
        cards: deck.slice(startIdx, startIdx + cardCount)
    };
}

/**
 * 檢查一局是否為敏感局
 */
function checkSensitive(deck, startIdx) {
    const original = simulateOneRound(deck, startIdx);
    if (!original) return { sensitive: false, swapResult: null };

    // 交換前兩張
    const swappedDeck = deck.slice();
    [swappedDeck[startIdx], swappedDeck[startIdx + 1]] = [swappedDeck[startIdx + 1], swappedDeck[startIdx]];

    const swapped = simulateOneRound(swappedDeck, startIdx);
    if (!swapped) return { sensitive: false, swapResult: null };

    // 敏感局條件：用牌數相同、結果改變、都不是和局
    const sensitive = (
        original.cardCount === swapped.cardCount &&
        original.result !== swapped.result &&
        original.result !== '和' &&
        swapped.result !== '和'
    );

    return { sensitive, swapResult: swapped.result };
}

/**
 * 從牌組重新發牌，建立所有局
 */
function rebuildRoundsFromDeck(deck) {
    const rounds = [];
    let pos = 0;

    while (pos < deck.length - 3) {
        const roundInfo = simulateOneRound(deck, pos);
        if (!roundInfo) break;

        const sensInfo = checkSensitive(deck, pos);

        rounds.push({
            start_index: pos,
            cards: roundInfo.cards,
            result: roundInfo.result,
            sensitive: sensInfo.sensitive,
            swapResult: sensInfo.swapResult,
            playerTotal: roundInfo.playerTotal,
            bankerTotal: roundInfo.bankerTotal,
            segment: 'A'  // 預覽時暫時都標 A
        });

        pos += roundInfo.cardCount;
    }

    // 處理剩餘的殘牌
    if (pos < deck.length) {
        const remainingCards = deck.slice(pos);
        rounds.push({
            start_index: pos,
            cards: remainingCards,
            result: '殘牌',
            sensitive: false,
            swapResult: null,
            playerTotal: null,
            bankerTotal: null,
            segment: 'C'
        });
    }

    return rounds;
}

/**
 * 執行全局預覽
 * @param {number} r1 - 第一張牌的局索引
 * @param {number} c1 - 第一張牌在局內的索引
 * @param {number} r2 - 第二張牌的局索引
 * @param {number} c2 - 第二張牌在局內的索引
 */
function generateSwapPreview(r1, c1, r2, c2) {
    if (!Array.isArray(currentRounds) || currentRounds.length === 0) {
        console.error('無法預覽：沒有牌靴資料');
        return null;
    }

    // 建立原始牌組
    const originalDeck = buildFullDeckFromCurrentRounds();
    if (originalDeck.length === 0) {
        console.error('無法預覽：牌組為空');
        return null;
    }

    // 計算兩張牌在整副牌中的位置
    let pos1 = 0;
    for (let i = 0; i < r1; i++) {
        pos1 += currentRounds[i].cards.length;
    }
    pos1 += c1;

    let pos2 = 0;
    for (let i = 0; i < r2; i++) {
        pos2 += currentRounds[i].cards.length;
    }
    pos2 += c2;

    // 建立交換後的牌組
    const swappedDeck = originalDeck.map(card => {
        if (card && typeof card.clone === 'function') {
            return card.clone();
        }
        return { ...card };
    });

    // 執行交換
    [swappedDeck[pos1], swappedDeck[pos2]] = [swappedDeck[pos2], swappedDeck[pos1]];

    // 重新發牌建立所有局
    const previewRounds = rebuildRoundsFromDeck(swappedDeck);

    // 計算變化
    const changes = analyzeChanges(currentRounds, previewRounds);

    // 儲存預覽狀態
    previewState = {
        active: true,
        originalRounds: currentRounds,
        previewRounds: previewRounds,
        originalRecovery: null,  // 稍後計算
        previewRecovery: null,
        swapInfo: { r1, c1, r2, c2, pos1, pos2 },
        changes: changes
    };

    // 計算回復分析（如果函數存在）
    if (typeof analyzeShoeRecovery === 'function') {
        try {
            previewState.originalRecovery = analyzeShoeRecovery(currentRounds);
            previewState.previewRecovery = analyzeShoeRecovery(previewRounds);
        } catch (e) {
            console.warn('回復分析計算失敗:', e);
        }
    }

    return previewState;
}

/**
 * 分析交換前後的變化
 */
function analyzeChanges(originalRounds, previewRounds) {
    const changes = {
        totalRounds: {
            before: originalRounds.filter(r => r.result !== '殘牌').length,
            after: previewRounds.filter(r => r.result !== '殘牌').length
        },
        resultChanges: [],      // 結果改變的局
        cardCountChanges: [],   // 牌數改變的局
        sensitiveChanges: [],   // 敏感局狀態改變
        summary: {
            bankerBefore: 0,
            bankerAfter: 0,
            playerBefore: 0,
            playerAfter: 0,
            tieBefore: 0,
            tieAfter: 0,
            sensitiveBefore: 0,
            sensitiveAfter: 0
        }
    };

    // 統計原始結果
    originalRounds.forEach(r => {
        if (r.result === '莊') changes.summary.bankerBefore++;
        else if (r.result === '閒') changes.summary.playerBefore++;
        else if (r.result === '和') changes.summary.tieBefore++;
        if (r.sensitive) changes.summary.sensitiveBefore++;
    });

    // 統計預覽結果
    previewRounds.forEach(r => {
        if (r.result === '莊') changes.summary.bankerAfter++;
        else if (r.result === '閒') changes.summary.playerAfter++;
        else if (r.result === '和') changes.summary.tieAfter++;
        if (r.sensitive) changes.summary.sensitiveAfter++;
    });

    // 逐局比較（以較短的為準）
    const minLen = Math.min(
        originalRounds.filter(r => r.result !== '殘牌').length,
        previewRounds.filter(r => r.result !== '殘牌').length
    );

    for (let i = 0; i < minLen; i++) {
        const orig = originalRounds[i];
        const prev = previewRounds[i];

        if (!orig || !prev) continue;
        if (orig.result === '殘牌' || prev.result === '殘牌') continue;

        // 結果改變
        if (orig.result !== prev.result) {
            changes.resultChanges.push({
                round: i + 1,
                before: orig.result,
                after: prev.result
            });
        }

        // 牌數改變
        const origCards = orig.cards ? orig.cards.length : 0;
        const prevCards = prev.cards ? prev.cards.length : 0;
        if (origCards !== prevCards) {
            changes.cardCountChanges.push({
                round: i + 1,
                before: origCards,
                after: prevCards
            });
        }

        // 敏感局狀態改變
        if (orig.sensitive !== prev.sensitive) {
            changes.sensitiveChanges.push({
                round: i + 1,
                before: orig.sensitive,
                after: prev.sensitive
            });
        }
    }

    return changes;
}

/**
 * 渲染預覽對比表格（彈出式對話框）
 */
function renderPreviewComparison() {
    if (!previewState.active || !previewState.previewRounds) {
        return;
    }

    // 移除舊的預覽對話框
    const existing = document.getElementById('swapPreviewDialog');
    if (existing) existing.remove();

    const changes = previewState.changes;
    const recovery = {
        before: previewState.originalRecovery,
        after: previewState.previewRecovery
    };

    let html = `
        <div class="preview-dialog-overlay" id="swapPreviewDialog">
            <div class="preview-dialog">
                <div class="preview-header">
                    <h3>🔍 交換預覽</h3>
                    <span class="preview-swap-info">
                        交換: 第${previewState.swapInfo.pos1 + 1}張 ↔ 第${previewState.swapInfo.pos2 + 1}張
                    </span>
                    <button class="preview-close" onclick="cancelPreview()">✕</button>
                </div>

                <div class="preview-body">
                    <div class="preview-summary">
                        <div class="summary-section">
                            <h4>局數變化</h4>
                            <table class="summary-table">
                                <tr>
                                    <th></th><th>交換前</th><th>交換後</th><th>變化</th>
                                </tr>
                                <tr>
                                    <td>總局數</td>
                                    <td>${changes.totalRounds.before}</td>
                                    <td>${changes.totalRounds.after}</td>
                                    <td class="${changes.totalRounds.after !== changes.totalRounds.before ? 'changed' : ''}">
                                        ${formatDiff(changes.totalRounds.after - changes.totalRounds.before)}
                                    </td>
                                </tr>
                                <tr>
                                    <td>莊</td>
                                    <td>${changes.summary.bankerBefore}</td>
                                    <td>${changes.summary.bankerAfter}</td>
                                    <td class="${changes.summary.bankerAfter !== changes.summary.bankerBefore ? 'changed' : ''}">
                                        ${formatDiff(changes.summary.bankerAfter - changes.summary.bankerBefore)}
                                    </td>
                                </tr>
                                <tr>
                                    <td>閒</td>
                                    <td>${changes.summary.playerBefore}</td>
                                    <td>${changes.summary.playerAfter}</td>
                                    <td class="${changes.summary.playerAfter !== changes.summary.playerBefore ? 'changed' : ''}">
                                        ${formatDiff(changes.summary.playerAfter - changes.summary.playerBefore)}
                                    </td>
                                </tr>
                                <tr>
                                    <td>和</td>
                                    <td>${changes.summary.tieBefore}</td>
                                    <td>${changes.summary.tieAfter}</td>
                                    <td class="${changes.summary.tieAfter !== changes.summary.tieBefore ? 'changed' : ''}">
                                        ${formatDiff(changes.summary.tieAfter - changes.summary.tieBefore)}
                                    </td>
                                </tr>
                                <tr>
                                    <td>敏感局</td>
                                    <td>${changes.summary.sensitiveBefore}</td>
                                    <td>${changes.summary.sensitiveAfter}</td>
                                    <td class="${changes.summary.sensitiveAfter !== changes.summary.sensitiveBefore ? 'changed' : ''}">
                                        ${formatDiff(changes.summary.sensitiveAfter - changes.summary.sensitiveBefore)}
                                    </td>
                                </tr>
                            </table>
                        </div>
                        
                        ${recovery.before && recovery.after ? `
                        <div class="summary-section">
                            <h4>回復分析</h4>
                            <table class="summary-table">
                                <tr>
                                    <th></th><th>交換前</th><th>交換後</th><th>變化</th>
                                </tr>
                                <tr>
                                    <td>平均回復</td>
                                    <td>${recovery.before.avgRounds} 局</td>
                                    <td>${recovery.after.avgRounds} 局</td>
                                    <td class="${parseFloat(recovery.after.avgRounds) < parseFloat(recovery.before.avgRounds) ? 'improved' : parseFloat(recovery.after.avgRounds) > parseFloat(recovery.before.avgRounds) ? 'worse' : ''}">
                                        ${formatDiffFloat(parseFloat(recovery.after.avgRounds) - parseFloat(recovery.before.avgRounds))}
                                    </td>
                                </tr>
                                <tr>
                                    <td>最大回復</td>
                                    <td>${recovery.before.maxRounds} 局</td>
                                    <td>${recovery.after.maxRounds} 局</td>
                                    <td class="${recovery.after.maxRounds < recovery.before.maxRounds ? 'improved' : recovery.after.maxRounds > recovery.before.maxRounds ? 'worse' : ''}">
                                        ${formatDiff(recovery.after.maxRounds - recovery.before.maxRounds)}
                                    </td>
                                </tr>
                            </table>
                        </div>
                        ` : ''}

                        <div class="summary-section">
                            <h4>結果改變的局 (${changes.resultChanges.length} 局)</h4>
                            ${changes.resultChanges.length > 0 ? `
                            <div class="change-list">
                                ${changes.resultChanges.slice(0, 20).map(c => `
                                    <span class="change-item">
                                        第${c.round}局: 
                                        <span class="result-${c.before}">${c.before}</span> → 
                                        <span class="result-${c.after}">${c.after}</span>
                                    </span>
                                `).join('')}
                                ${changes.resultChanges.length > 20 ? `<span class="more">...還有 ${changes.resultChanges.length - 20} 局</span>` : ''}
                            </div>
                            ` : '<div class="no-changes">無變化</div>'}
                        </div>

                        <div class="summary-section">
                            <h4>牌數改變的局 (${changes.cardCountChanges.length} 局)</h4>
                            ${changes.cardCountChanges.length > 0 ? `
                            <div class="change-list">
                                ${changes.cardCountChanges.slice(0, 10).map(c => `
                                    <span class="change-item">第${c.round}局: ${c.before}張 → ${c.after}張</span>
                                `).join('')}
                                ${changes.cardCountChanges.length > 10 ? `<span class="more">...還有 ${changes.cardCountChanges.length - 10} 局</span>` : ''}
                            </div>
                            ` : '<div class="no-changes">無變化</div>'}
                        </div>
                    </div>
                </div>

                <div class="preview-footer">
                    <button id="btnCancelPreview" class="btn btn-secondary" onclick="cancelPreview()">✗ 取消</button>
                    <button id="btnConfirmSwap" class="btn btn-primary" onclick="confirmSwapFromPreview()">✓ 確認交換</button>
                </div>
            </div>
        </div>
    `;

    // 插入到 body
    document.body.insertAdjacentHTML('beforeend', html);
    
    // 確保樣式已加載
    addPreviewStyles();
}

/**
 * 加入預覽相關的 CSS 樣式
 */
function addPreviewStyles() {
    if (document.getElementById('previewStyles')) return;

    const style = document.createElement('style');
    style.id = 'previewStyles';
    style.textContent = `
        .preview-dialog-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            animation: fadeIn 0.2s ease;
        }

        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        .preview-dialog {
            background: linear-gradient(135deg, #1a1f2e 0%, #0d1117 100%);
            border: 2px solid #3d9970;
            border-radius: 12px;
            width: 90vw;
            max-width: 900px;
            max-height: 85vh;
            display: flex;
            flex-direction: column;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
            animation: slideIn 0.3s ease;
        }

        @keyframes slideIn {
            from { transform: translateY(-30px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }

        .preview-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 20px 24px;
            border-bottom: 1px solid #334155;
            flex-shrink: 0;
        }

        .preview-header h3 {
            margin: 0;
            color: #3d9970;
            font-size: 20px;
        }

        .preview-swap-info {
            color: #94a3b8;
            font-size: 14px;
        }

        .preview-close {
            background: none;
            border: none;
            color: #94a3b8;
            font-size: 28px;
            cursor: pointer;
            padding: 0;
            width: 32px;
            height: 32px;
            line-height: 1;
            transition: color 0.2s;
        }

        .preview-close:hover {
            color: #f1f5f9;
        }

        .preview-body {
            flex: 1;
            overflow-y: auto;
            padding: 20px 24px;
        }

        .preview-body::-webkit-scrollbar {
            width: 8px;
        }

        .preview-body::-webkit-scrollbar-thumb {
            background: #475569;
            border-radius: 4px;
        }

        .preview-summary {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 16px;
        }

        .summary-section {
            background: rgba(255, 255, 255, 0.03);
            border-radius: 8px;
            padding: 16px;
            border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .summary-section h4 {
            margin: 0 0 12px 0;
            color: #cbd5e1;
            font-size: 15px;
            border-bottom: 1px solid #334155;
            padding-bottom: 8px;
        }

        .summary-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
        }

        .summary-table th,
        .summary-table td {
            padding: 8px 10px;
            text-align: center;
        }

        .summary-table th {
            color: #94a3b8;
            font-weight: 600;
            background: rgba(0, 0, 0, 0.2);
        }

        .summary-table td {
            color: #e2e8f0;
            border-top: 1px solid rgba(255, 255, 255, 0.05);
        }

        .summary-table .changed {
            color: #fbbf24;
            font-weight: bold;
        }

        .summary-table .improved {
            color: #10b981;
            font-weight: bold;
        }

        .summary-table .worse {
            color: #ef4444;
            font-weight: bold;
        }

        .change-list {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            max-height: 150px;
            overflow-y: auto;
        }

        .change-list::-webkit-scrollbar {
            width: 6px;
        }

        .change-list::-webkit-scrollbar-thumb {
            background: #475569;
            border-radius: 3px;
        }

        .change-item {
            background: rgba(255, 255, 255, 0.08);
            padding: 6px 10px;
            border-radius: 6px;
            font-size: 12px;
            color: #cbd5e1;
            white-space: nowrap;
        }

        .result-莊 { 
            color: #ff6b6b; 
            font-weight: bold;
        }
        
        .result-閒 { 
            color: #4dabf7; 
            font-weight: bold;
        }
        
        .result-和 { 
            color: #69db7c; 
            font-weight: bold;
        }

        .no-changes {
            color: #64748b;
            font-style: italic;
            font-size: 13px;
            text-align: center;
            padding: 10px;
        }

        .more {
            color: #94a3b8;
            font-style: italic;
            font-size: 11px;
        }

        .preview-footer {
            padding: 16px 24px;
            border-top: 1px solid #334155;
            display: flex;
            gap: 12px;
            justify-content: flex-end;
            flex-shrink: 0;
        }

        .preview-footer .btn {
            padding: 10px 20px;
            border-radius: 6px;
            border: none;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
        }

        .preview-footer .btn-primary {
            background: #3d9970;
            color: white;
        }

        .preview-footer .btn-primary:hover {
            background: #2d7a57;
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(61, 153, 112, 0.3);
        }

        .preview-footer .btn-secondary {
            background: #475569;
            color: #f1f5f9;
        }

        .preview-footer .btn-secondary:hover {
            background: #334155;
        }
    `;
    document.head.appendChild(style);
}

/**
 * 格式化差異數值
 */
function formatDiff(diff) {
    if (diff === 0) return '-';
    return diff > 0 ? `+${diff}` : `${diff}`;
}

function formatDiffFloat(diff) {
    if (Math.abs(diff) < 0.01) return '-';
    return diff > 0 ? `+${diff.toFixed(2)}` : `${diff.toFixed(2)}`;
}

/**
 * 確認交換（從預覽）
 */
function confirmSwapFromPreview() {
    if (!previewState.active || !previewState.swapInfo) {
        console.error('無法確認：沒有預覽資料');
        return;
    }

    const { r1, c1, r2, c2 } = previewState.swapInfo;

    // 執行實際的交換
    const card1 = currentRounds?.[r1]?.cards?.[c1];
    const card2 = currentRounds?.[r2]?.cards?.[c2];
    if (!card1 || !card2) {
        console.error('無法確認：交換卡片不存在');
        cancelPreview();
        return;
    }

    currentRounds[r1].cards[c1] = card2;
    currentRounds[r2].cards[c2] = card1;

    // 重新計算受影響局的結果
    if (typeof recomputeRoundOutcome === 'function') {
        recomputeRoundOutcome(currentRounds[r1]);
        if (r2 !== r1) {
            recomputeRoundOutcome(currentRounds[r2]);
        }
    }

    // 重新計算結果
    if (typeof refreshAnalysisAndRender === 'function') {
        refreshAnalysisAndRender();
    }

    // 清除預覽
    cancelPreview();

    // 記錄日誌
    if (typeof log === 'function') {
        log(`✅ 已交換第${previewState.swapInfo.pos1 + 1}張 ↔ 第${previewState.swapInfo.pos2 + 1}張`, 'success');
    }
}

/**
 * 取消預覽
 */
function cancelPreview() {
    previewState = {
        active: false,
        originalRounds: null,
        previewRounds: null,
        originalRecovery: null,
        previewRecovery: null,
        swapInfo: null,
        changes: null
    };

    // 移除對話框
    const dialog = document.getElementById('swapPreviewDialog');
    if (dialog) {
        dialog.remove();
    }

    // 重設編輯狀態
    if (typeof resetEditState === 'function') {
        resetEditState();
    }
}

/**
 * 修改原本的交換流程，加入預覽
 * 這個函數應該在選擇完兩張牌後被呼叫
 */
function initiateSwapWithPreview(r1, c1, r2, c2) {
    // 產生預覽
    const preview = generateSwapPreview(r1, c1, r2, c2);
    
    if (!preview) {
        if (typeof log === 'function') {
            log('❌ 無法產生預覽', 'error');
        }
        return false;
    }

    // 渲染預覽
    renderPreviewComparison();
    
    return true;
}

// 匯出函數到全域
if (typeof window !== 'undefined') {
    window.generateSwapPreview = generateSwapPreview;
    window.renderPreviewComparison = renderPreviewComparison;
    window.confirmSwapFromPreview = confirmSwapFromPreview;
    window.cancelPreview = cancelPreview;
    window.initiateSwapWithPreview = initiateSwapWithPreview;
    window.previewState = previewState;
}
