// ==================== 智能重排對話框 ====================

/**
 * 顯示智能重排對話框
 * @param {number} roundIndex - 要重排的局索引（0-based）
 */
function showSmartReorderDialog(roundIndex) {
    const roundNumber = roundIndex + 1;
    const round = currentRounds?.[roundIndex];
    
    if (!round || !Array.isArray(round.cards)) {
        log(`找不到第 ${roundNumber} 局資料。`, 'error');
        return;
    }

    // 計算當前狀態
    const handInfo = computeRoundHands(round.cards);
    const currentResult = (typeof handInfo.playerTotal === 'number' && typeof handInfo.bankerTotal === 'number')
        ? (handInfo.playerTotal === handInfo.bankerTotal ? '和' : (handInfo.playerTotal > handInfo.bankerTotal ? '閒' : '莊'))
        : null;
    const swapped = swapFirstTwoCards(round);
    const cardsText = round.cards.map(c => c.short()).join(' ');
    const statusText = (() => {
        if (swapped === null) return '❌ 無法對調';
        if (swapped === '和') return '⚠️ 對調後會變成和局';
        if (swapped === currentResult) return '⚠️ 可對調但不改輸贏';
        return '✓ 敏感局';
    })();

    // 創建對話框
    const dialog = document.createElement('div');
    dialog.className = 'smart-reorder-dialog-overlay';
    dialog.innerHTML = `
        <div class="smart-reorder-dialog">
            <div class="dialog-header">
                <h3>智能重排 - 第 ${roundNumber} 局</h3>
                <button class="dialog-close" onclick="this.closest('.smart-reorder-dialog-overlay').remove()">✕</button>
            </div>
            
            <div class="dialog-body">
                <!-- 模式切換 -->
                <div class="mode-switch">
                    <label class="mode-option">
                        <input type="radio" name="reorderMode" value="single" checked onchange="switchReorderMode('single', ${roundIndex})">
                        <span>單局重排</span>
                    </label>
                    <label class="mode-option">
                        <input type="radio" name="reorderMode" value="batch" onchange="switchReorderMode('batch', ${roundIndex})">
                        <span>批次重排（多局合併）</span>
                    </label>
                </div>

                <!-- 單局模式 -->
                <div id="singleModePanel">
                    <div class="current-status">
                        <h4>📊 當前狀態</h4>
                        <div class="status-info">
                            <div>卡片：${cardsText}</div>
                            <div>結果：${currentResult || '未知'}</div>
                            <div>狀態：${statusText}</div>
                        </div>
                    </div>

                    <div class="reorder-settings">
                        <h4>⚙️ 重排條件</h4>
                        
                        <div class="setting-group">
                            <label>期望結果：</label>
                            <div class="radio-group">
                                <label><input type="radio" name="desiredResult" value="莊"> 莊贏</label>
                                <label><input type="radio" name="desiredResult" value="閒" checked> 閒贏</label>
                                <label><input type="radio" name="desiredResult" value="和"> 和局</label>
                                <label><input type="radio" name="desiredResult" value="any"> 任意</label>
                            </div>
                        </div>

                        <div class="setting-group">
                            <label class="required-label">必要條件（固定）：</label>
                            <div class="checkbox-group">
                                <label><input type="checkbox" checked disabled> 敏感局（對調會改輸贏）</label>
                            </div>
                        </div>

                        <div class="setting-group">
                            <label>額外條件（可選）：</label>
                            <div class="checkbox-group">
                                <label><input type="checkbox" id="requireSwap" checked> 必須可對調</label>
                                <label><input type="checkbox" id="preserveCardCount"> 保持原用牌數</label>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 批次模式 -->
                <div id="batchModePanel" style="display:none;">
                    <div class="batch-config">
                        <h4>📦 批次範圍設定</h4>
                        <div class="range-input">
                            <label>從第 <input type="number" id="batchStartRound" value="${roundNumber}" min="1" max="${currentRounds?.length || 100}" style="width:60px;"> 局</label>
                            <label>到第 <input type="number" id="batchEndRound" value="${Math.min(roundNumber + 2, currentRounds?.length || 100)}" min="1" max="${currentRounds?.length || 100}" style="width:60px;"> 局</label>
                            <button class="btn-mini" onclick="updateBatchRoundsList()">更新</button>
                        </div>
                        <div class="batch-info" id="batchInfo" style="margin-top:10px; font-size:12px; color:#94a3b8;"></div>
                    </div>
                    
                    <div class="batch-rounds-list" id="batchRoundsList" style="max-height:300px; overflow-y:auto; margin-top:15px;">
                        <!-- 動態生成每局的條件設定 -->
                    </div>
                </div>

                <div class="dialog-result" id="reorderResult" style="display:none;"></div>
            </div>

            <div class="dialog-footer">
                <button class="btn-secondary" onclick="this.closest('.smart-reorder-dialog-overlay').remove()">取消</button>
                <button class="btn-primary" id="executeReorderBtn" onclick="executeSmartReorder(${roundIndex})">開始重排</button>
            </div>
        </div>
    `;

    // 添加樣式
    if (!document.getElementById('smart-reorder-styles')) {
        const style = document.createElement('style');
        style.id = 'smart-reorder-styles';
        style.textContent = `
            .smart-reorder-dialog-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                display: flex;
                align-items: center;
                justify-content: flex-end;
                z-index: 10000;
                padding-right: 20px;
            }
            .smart-reorder-dialog {
                background: #1e293b;
                border-radius: 12px;
                width: 500px;
                max-width: 90vw;
                max-height: 90vh;
                overflow: auto;
                box-shadow: 0 10px 40px rgba(0,0,0,0.5);
            }
            .dialog-header {
                padding: 20px;
                border-bottom: 1px solid #334155;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .dialog-header h3 {
                margin: 0;
                color: #e0f2fe;
                font-size: 18px;
            }
            .dialog-close {
                background: none;
                border: none;
                color: #94a3b8;
                font-size: 24px;
                cursor: pointer;
                padding: 0;
                width: 30px;
                height: 30px;
            }
            .dialog-close:hover {
                color: #f1f5f9;
            }
            .dialog-body {
                padding: 20px;
            }
            .current-status {
                background: #334155;
                padding: 15px;
                border-radius: 8px;
                margin-bottom: 20px;
            }
            .current-status h4 {
                margin: 0 0 10px 0;
                color: #cbd5e1;
                font-size: 14px;
            }
            .status-info {
                color: #f1f5f9;
                font-size: 13px;
            }
            .status-info > div {
                padding: 4px 0;
            }
            .reorder-settings h4 {
                margin: 0 0 15px 0;
                color: #cbd5e1;
                font-size: 14px;
            }
            .setting-group {
                margin-bottom: 20px;
            }
            .setting-group > label {
                display: block;
                color: #94a3b8;
                font-size: 13px;
                margin-bottom: 8px;
            }
            .required-label {
                color: #fbbf24 !important;
            }
            .radio-group, .checkbox-group {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            .radio-group label, .checkbox-group label {
                color: #f1f5f9;
                font-size: 14px;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .radio-group input, .checkbox-group input {
                cursor: pointer;
            }
            .dialog-result {
                margin-top: 20px;
                padding: 15px;
                border-radius: 8px;
                font-size: 14px;
            }
            .dialog-result.success {
                background: #064e3b;
                border: 1px solid #10b981;
                color: #d1fae5;
            }
            .dialog-result.error {
                background: #7f1d1d;
                border: 1px solid #ef4444;
                color: #fecaca;
            }
            .swap-suggestion {
                background: #1e40af;
                border: 1px solid #3b82f6;
                color: #dbeafe;
                padding: 10px;
                border-radius: 6px;
                margin-top: 10px;
                cursor: pointer;
            }
            .swap-suggestion:hover {
                background: #1e3a8a;
            }
            .dialog-footer {
                padding: 15px 20px;
                border-top: 1px solid #334155;
                display: flex;
                gap: 10px;
                justify-content: flex-end;
            }
            .btn-primary, .btn-secondary {
                padding: 8px 16px;
                border-radius: 6px;
                border: none;
                font-size: 14px;
                cursor: pointer;
                transition: all 0.2s;
            }
            .btn-primary {
                background: #3b82f6;
                color: white;
            }
            .btn-primary:hover {
                background: #2563eb;
            }
            .btn-secondary {
                background: #475569;
                color: #f1f5f9;
            }
            .btn-secondary:hover {
                background: #334155;
            }
            .mode-switch {
                display: flex;
                gap: 10px;
                margin-bottom: 20px;
                padding: 10px;
                background: #0f172a;
                border-radius: 8px;
            }
            .mode-option {
                flex: 1;
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px 12px;
                background: #1e293b;
                border-radius: 6px;
                cursor: pointer;
                transition: all 0.2s;
            }
            .mode-option:has(input:checked) {
                background: #1e40af;
                border: 1px solid #3b82f6;
            }
            .mode-option input {
                cursor: pointer;
            }
            .mode-option span {
                color: #f1f5f9;
                font-size: 13px;
            }
            .batch-config {
                background: #0f172a;
                padding: 15px;
                border-radius: 8px;
                margin-bottom: 15px;
            }
            .batch-config h4 {
                margin: 0 0 10px 0;
                color: #cbd5e1;
                font-size: 14px;
            }
            .range-input {
                display: flex;
                gap: 10px;
                align-items: center;
                flex-wrap: wrap;
            }
            .range-input label {
                color: #f1f5f9;
                font-size: 13px;
            }
            .range-input input[type="number"] {
                padding: 4px 8px;
                border: 1px solid #475569;
                border-radius: 4px;
                background: #1e293b;
                color: #f1f5f9;
                font-size: 13px;
            }
            .btn-mini {
                padding: 4px 12px;
                background: #475569;
                color: #f1f5f9;
                border: none;
                border-radius: 4px;
                font-size: 12px;
                cursor: pointer;
            }
            .btn-mini:hover {
                background: #334155;
            }
            .batch-round-item {
                background: #1e293b;
                padding: 12px;
                border-radius: 6px;
                margin-bottom: 10px;
                border: 1px solid #334155;
            }
            .batch-round-header {
                display: flex;
                gap: 10px;
                align-items: center;
                margin-bottom: 8px;
            }
            .batch-round-header strong {
                color: #3b82f6;
                font-size: 13px;
            }
            .batch-round-options {
                display: flex;
                gap: 10px;
                align-items: center;
                flex-wrap: wrap;
            }
            .batch-round-options label {
                color: #cbd5e1;
            }
            .batch-result-select {
                background: #0f172a;
                color: #f1f5f9;
                border: 1px solid #475569;
                border-radius: 4px;
            }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(dialog);
    
    // 初始化批次列表（如果預設是批次模式）
    const batchModeRadio = dialog.querySelector('input[value="batch"]');
    if (batchModeRadio && batchModeRadio.checked) {
        updateBatchRoundsList();
    }
}

/**
 * 執行智能重排
 * @param {number} roundIndex - 要重排的局索引（0-based）
 */
function executeSmartReorder(roundIndex) {
    const roundNumber = roundIndex + 1;
    const resultEl = document.getElementById('reorderResult');
    
    // 獲取用戶選擇的條件
    const desiredResultRadio = document.querySelector('input[name="desiredResult"]:checked');
    const desiredResult = desiredResultRadio ? desiredResultRadio.value : 'any';
    const requireSwap = document.getElementById('requireSwap')?.checked ?? true;
    const preserveCardCount = document.getElementById('preserveCardCount')?.checked ?? false;

    // 構建選項
    const options = {
        preserveResult: desiredResult === 'any' ? null : desiredResult,
        requireSwap: requireSwap,
        requireSensitive: true, // 固定必須是敏感局
        preserveCardCount: preserveCardCount
    };

    // 顯示處理中
    resultEl.style.display = 'block';
    resultEl.className = 'dialog-result';
    resultEl.innerHTML = '⏳ 正在重排...';

    // 延遲執行以顯示動畫
    setTimeout(() => {
        // 嘗試重排
        const ok = (typeof window.tryReorderRoundToClearMismatch === 'function')
            ? window.tryReorderRoundToClearMismatch(roundNumber, options)
            : false;

        if (ok) {
            // 成功
            const round = currentRounds?.[roundIndex];
            const handInfo = computeRoundHands(round.cards);
            const newResult = (typeof handInfo.playerTotal === 'number' && typeof handInfo.bankerTotal === 'number')
                ? (handInfo.playerTotal === handInfo.bankerTotal ? '和' : (handInfo.playerTotal > handInfo.bankerTotal ? '閒' : '莊'))
                : null;
            const swapped = swapFirstTwoCards(round);
            const cardsText = round.cards.map(c => c.short()).join(' ');

            resultEl.className = 'dialog-result success';
            resultEl.innerHTML = `
                ✅ 重排成功！<br>
                新排列：${cardsText}<br>
                結果：${newResult}<br>
                對調後：${swapped} ✓
            `;

            log(`第 ${roundNumber} 局自動重排完成（調會改輸贏）。`, 'success');

            // 3秒後自動關閉
            setTimeout(() => {
                document.querySelector('.smart-reorder-dialog-overlay')?.remove();
            }, 3000);
        } else {
            // 失敗，掃描附近局找換牌建議
            const suggestions = findNearbySwapSuggestions(roundIndex, options);
            
            if (suggestions.length > 0) {
                resultEl.className = 'dialog-result error';
                let html = '❌ 本局無法達成條件<br><br>🔍 找到以下換牌建議：<br>';
                
                suggestions.forEach((sug, idx) => {
                    html += `
                        <div class="swap-suggestion" onclick="executeSwapSuggestion(${roundIndex}, ${sug.fromRound}, ${sug.fromCard}, ${sug.toCard})">
                            建議${idx + 1}：與第${sug.fromRound + 1}局交換<br>
                            • 交換：${sug.fromCardText}(${sug.fromRound + 1}) ↔ ${sug.toCardText}(${roundNumber})<br>
                            • 第${sug.fromRound + 1}局：仍保持正常 ✓<br>
                            • 第${roundNumber}局：可達成條件 ✓<br>
                            [點擊執行]
                        </div>
                    `;
                });
                
                resultEl.innerHTML = html;
            } else {
                resultEl.className = 'dialog-result error';
                resultEl.innerHTML = '❌ 本局無法達成條件，且附近局也找不到可安全交換的牌。<br>請嘗試放寬條件或手動調整。';
            }

            log(`第 ${roundNumber} 局無法達成條件。`, 'warn');
        }
    }, 100);
}

/**
 * 尋找附近局的換牌建議
 * @param {number} targetRoundIndex - 目標局索引
 * @param {object} options - 重排選項
 * @returns {Array} 換牌建議列表
 */
function findNearbySwapSuggestions(targetRoundIndex, options) {
    const suggestions = [];
    const targetRound = currentRounds?.[targetRoundIndex];
    if (!targetRound) return suggestions;

    const scanRange = 5; // 掃描前後5局
    const startIdx = Math.max(0, targetRoundIndex - scanRange);
    const endIdx = Math.min(currentRounds.length - 1, targetRoundIndex + scanRange);

    // 掃描附近局
    for (let fromIdx = startIdx; fromIdx <= endIdx; fromIdx++) {
        if (fromIdx === targetRoundIndex) continue; // 跳過目標局自己

        const fromRound = currentRounds[fromIdx];
        if (!fromRound || !fromRound.cards) continue;

        // 嘗試交換每張牌
        for (let fromCardIdx = 0; fromCardIdx < fromRound.cards.length; fromCardIdx++) {
            for (let toCardIdx = 0; toCardIdx < targetRound.cards.length; toCardIdx++) {
                // 模擬交換
                const fromCard = fromRound.cards[fromCardIdx];
                const toCard = targetRound.cards[toCardIdx];
                
                // 執行交換
                [fromRound.cards[fromCardIdx], targetRound.cards[toCardIdx]] = [toCard, fromCard];

                // 檢查被交換局是否仍然正常
                const fromStillValid = !isRoundAutoReorderNeeded(fromRound);
                
                // 檢查目標局是否能達成條件
                let targetCanAchieve = false;
                if (fromStillValid) {
                    targetCanAchieve = (typeof window.tryReorderRoundToClearMismatch === 'function')
                        ? window.tryReorderRoundToClearMismatch(targetRoundIndex + 1, { ...options, mutate: false })
                        : false;
                }

                // 還原交換
                [fromRound.cards[fromCardIdx], targetRound.cards[toCardIdx]] = [fromCard, toCard];

                // 如果兩個條件都滿足，加入建議
                if (fromStillValid && targetCanAchieve) {
                    suggestions.push({
                        fromRound: fromIdx,
                        fromCard: fromCardIdx,
                        toCard: toCardIdx,
                        fromCardText: fromCard.short(),
                        toCardText: toCard.short()
                    });
                    
                    // 最多找3個建議
                    if (suggestions.length >= 3) return suggestions;
                }
            }
        }
    }

    return suggestions;
}

/**
 * 執行換牌建議
 */
function executeSwapSuggestion(targetIdx, fromIdx, fromCardIdx, toCardIdx) {
    const fromRound = currentRounds?.[fromIdx];
    const targetRound = currentRounds?.[targetIdx];
    
    if (!fromRound || !targetRound) return;

    // 執行交換
    const fromCard = fromRound.cards[fromCardIdx];
    const toCard = targetRound.cards[toCardIdx];
    [fromRound.cards[fromCardIdx], targetRound.cards[toCardIdx]] = [toCard, fromCard];

    // 重新計算結果
    recomputeRoundOutcome(fromRound);
    recomputeRoundOutcome(targetRound);

    log(`已交換第${fromIdx + 1}局與第${targetIdx + 1}局的牌：${fromCard.short()} ↔ ${toCard.short()}`, 'success');

    // 嘗試重排目標局
    const desiredResultRadio = document.querySelector('input[name="desiredResult"]:checked');
    const desiredResult = desiredResultRadio ? desiredResultRadio.value : 'any';
    const requireSwap = document.getElementById('requireSwap')?.checked ?? true;
    const preserveCardCount = document.getElementById('preserveCardCount')?.checked ?? false;

    const options = {
        preserveResult: desiredResult === 'any' ? null : desiredResult,
        requireSwap: requireSwap,
        requireSensitive: true,
        preserveCardCount: preserveCardCount
    };

    if (typeof window.tryReorderRoundToClearMismatch === 'function') {
        window.tryReorderRoundToClearMismatch(targetIdx + 1, options);
    }

    // 刷新顯示
    if (typeof refreshAnalysisAndRender === 'function') {
        refreshAnalysisAndRender({ mutate: false });
    }

    // 關閉對話框
    document.querySelector('.smart-reorder-dialog-overlay')?.remove();
}

// ==================== 批次模式相關函數 ====================

/**
 * 切換重排模式（單局/批次）
 */
function switchReorderMode(mode, currentRoundIndex) {
    const singlePanel = document.getElementById('singleModePanel');
    const batchPanel = document.getElementById('batchModePanel');
    const executeBtn = document.getElementById('executeReorderBtn');
    
    if (mode === 'single') {
        singlePanel.style.display = 'block';
        batchPanel.style.display = 'none';
        executeBtn.onclick = () => executeSmartReorder(currentRoundIndex);
        executeBtn.textContent = '開始重排';
    } else {
        singlePanel.style.display = 'none';
        batchPanel.style.display = 'block';
        executeBtn.onclick = () => executeBatchReorder();
        executeBtn.textContent = '批次重排';
        updateBatchRoundsList();
    }
}

/**
 * 更新批次局列表
 */
function updateBatchRoundsList() {
    const startInput = document.getElementById('batchStartRound');
    const endInput = document.getElementById('batchEndRound');
    const listContainer = document.getElementById('batchRoundsList');
    const infoDiv = document.getElementById('batchInfo');
    
    const start = parseInt(startInput.value) || 1;
    const end = parseInt(endInput.value) || start;
    
    if (start > end) {
        infoDiv.textContent = '❌ 起始局必須 ≤ 結束局';
        infoDiv.style.color = '#ef4444';
        listContainer.innerHTML = '';
        return;
    }
    
    if (end - start > 10) {
        infoDiv.textContent = '⚠️ 批次範圍過大（最多11局），建議縮小範圍';
        infoDiv.style.color = '#f59e0b';
    } else {
        const totalCards = Array.from({length: end - start + 1}, (_, i) => {
            const round = currentRounds?.[start - 1 + i];
            return round?.cards?.length || 0;
        }).reduce((a, b) => a + b, 0);
        infoDiv.textContent = `共 ${end - start + 1} 局，合計 ${totalCards} 張牌`;
        infoDiv.style.color = '#94a3b8';
    }
    
    // 生成每局的設定項
    let html = '';
    for (let i = start; i <= end; i++) {
        const round = currentRounds?.[i - 1];
        if (!round) continue;
        
        const handInfo = computeRoundHands(round.cards);
        const currentResult = (typeof handInfo.playerTotal === 'number' && typeof handInfo.bankerTotal === 'number')
            ? (handInfo.playerTotal === handInfo.bankerTotal ? '和' : (handInfo.playerTotal > handInfo.bankerTotal ? '閒' : '莊'))
            : null;
        const cardsText = round.cards.map(c => c.short()).join(' ');
        
        html += `
            <div class="batch-round-item" data-round="${i}">
                <div class="batch-round-header">
                    <strong>第 ${i} 局</strong>
                    <span style="font-size:11px; color:#94a3b8;">${cardsText}</span>
                    <span style="font-size:11px; color:#60a5fa;">當前:${currentResult}</span>
                </div>
                <div class="batch-round-options">
                    <label style="font-size:12px;">期望結果：</label>
                    <select class="batch-result-select" data-round="${i}" style="font-size:11px; padding:2px 4px;">
                        <option value="any">任意</option>
                        <option value="莊" ${currentResult === '莊' ? 'selected' : ''}>莊</option>
                        <option value="閒" ${currentResult === '閒' ? 'selected' : ''}>閒</option>
                        <option value="和" ${currentResult === '和' ? 'selected' : ''}>和</option>
                    </select>
                    <label style="font-size:11px; margin-left:10px;">
                        <input type="checkbox" class="batch-sensitive-check" data-round="${i}" checked>
                        敏感局
                    </label>
                </div>
            </div>
        `;
    }
    
    listContainer.innerHTML = html;
}

/**
 * 執行批次重排
 */
function executeBatchReorder() {
    const startInput = document.getElementById('batchStartRound');
    const endInput = document.getElementById('batchEndRound');
    const resultEl = document.getElementById('reorderResult');
    
    const start = parseInt(startInput.value) || 1;
    const end = parseInt(endInput.value) || start;
    const startIdx = start - 1;
    const endIdx = end - 1;
    
    if (start > end || !currentRounds || startIdx < 0 || endIdx >= currentRounds.length) {
        resultEl.style.display = 'block';
        resultEl.className = 'dialog-result error';
        resultEl.innerHTML = '❌ 範圍設定錯誤';
        return;
    }
    
    // 收集每局的條件
    const roundConditions = [];
    for (let i = start; i <= end; i++) {
        const resultSelect = document.querySelector(`.batch-result-select[data-round="${i}"]`);
        const sensitiveCheck = document.querySelector(`.batch-sensitive-check[data-round="${i}"]`);
        roundConditions.push({
            roundIndex: i - 1,
            desiredResult: resultSelect?.value || 'any',
            requireSensitive: sensitiveCheck?.checked ?? true
        });
    }
    
    resultEl.style.display = 'block';
    resultEl.className = 'dialog-result';
    resultEl.innerHTML = '⏳ 正在批次重排...';
    
    setTimeout(() => {
        const success = tryBatchReorder(startIdx, endIdx, roundConditions);
        
        if (success) {
            resultEl.className = 'dialog-result success';
            resultEl.innerHTML = `✅ 批次重排成功！第 ${start}-${end} 局已完成。`;
            log(`批次重排成功：第 ${start}-${end} 局`, 'success');
            
            setTimeout(() => {
                document.querySelector('.smart-reorder-dialog-overlay')?.remove();
            }, 2000);
        } else {
            resultEl.className = 'dialog-result error';
            resultEl.innerHTML = '❌ 批次重排失敗，無法找到滿足所有條件的排列。<br>建議：<br>1. 放寬部分條件<br>2. 縮小批次範圍<br>3. 使用單局模式逐一處理';
            log(`批次重排失敗：第 ${start}-${end} 局`, 'warn');
        }
    }, 100);
}

/**
 * 嘗試批次重排（合併多局的牌重新分配）
 */
function tryBatchReorder(startIdx, endIdx, roundConditions) {
    if (!currentRounds || startIdx < 0 || endIdx >= currentRounds.length) return false;

    // Snapshot：確保批次操作要嘛全成功，要嘛完全不動
    const snapshots = [];
    for (let i = startIdx; i <= endIdx; i++) {
        const round = currentRounds[i];
        snapshots.push({
            index: i,
            cards: Array.isArray(round?.cards) ? round.cards.slice() : null,
            result: round?.result,
            sensitive: round?.sensitive
        });
    }

    const restoreSnapshots = () => {
        snapshots.forEach(s => {
            const round = currentRounds[s.index];
            if (!round) return;
            if (s.cards) round.cards = s.cards;
            if (s.result !== undefined) round.result = s.result;
            if (s.sensitive !== undefined) round.sensitive = s.sensitive;
        });
    };

    // A) 先做「逐局重排」（不跨局換牌）：等同你手動逐局按單局重排，但整批成功才套用
    const sequentialOk = (() => {
        if (typeof window.tryReorderRoundToClearMismatch !== 'function') return false;

        for (let i = startIdx; i <= endIdx; i++) {
            const cond = roundConditions.find(c => c.roundIndex === i) || {};
            const preserveResult = cond.desiredResult && cond.desiredResult !== 'any' ? cond.desiredResult : null;
            const ok = window.tryReorderRoundToClearMismatch(i + 1, {
                preserveResult,
                requireSwap: true,
                requireSensitive: cond.requireSensitive !== undefined ? Boolean(cond.requireSensitive) : true,
                mutate: true,
                refresh: false
            });
            if (!ok) return false;
        }
        return true;
    })();

    if (sequentialOk) {
        if (typeof refreshAnalysisAndRender === 'function') {
            refreshAnalysisAndRender({ mutate: false });
        }
        return true;
    }

    // 逐局失敗：回復原狀，改走 B) 合併牌池跨局重分配
    restoreSnapshots();

    // B) 收集所有牌
    const allCards = [];
    const cardCounts = [];
    for (let i = startIdx; i <= endIdx; i++) {
        const round = currentRounds[i];
        if (round && round.cards) {
            allCards.push(...round.cards);
            cardCounts.push(round.cards.length);
        }
    }

    log(`批次重排：收集到 ${allCards.length} 張牌`, 'info');

    // 2. 嘗試重新分配（先分配牌組，再對每一局做「局內重排」確保張數規則成立）
    const maxAttempts = 2000;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const shuffled = [...allCards];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }

        const orderedByRound = [];
        let cardIndex = 0;
        let allValid = true;

        for (let offset = 0; offset < cardCounts.length; offset++) {
            const roundIndex = startIdx + offset;
            const condition = roundConditions.find(c => c.roundIndex === roundIndex) || {};
            const cardCount = cardCounts[offset];
            const slice = shuffled.slice(cardIndex, cardIndex + cardCount);
            cardIndex += cardCount;

            const requireSensitive = Object.prototype.hasOwnProperty.call(condition, 'requireSensitive')
                ? Boolean(condition.requireSensitive)
                : true;
            const requireSwap = true;
            const preserveResult = condition.desiredResult && condition.desiredResult !== 'any'
                ? condition.desiredResult
                : null;

            if (typeof findValidDealOrderForCards !== 'function') {
                allValid = false;
                break;
            }

            const ordered = findValidDealOrderForCards(slice, {
                requireSwap,
                requireSensitive,
                preserveResult
            });

            if (!ordered) {
                allValid = false;
                break;
            }

            if (typeof baccarat_getExpectedCardCount === 'function') {
                if (baccarat_getExpectedCardCount(ordered) !== ordered.length) {
                    allValid = false;
                    break;
                }
            }
            if (typeof computeRoundUsedCardCount === 'function') {
                if (computeRoundUsedCardCount(ordered) !== ordered.length) {
                    allValid = false;
                    break;
                }
            }
            if (typeof canCompleteGame === 'function') {
                if (!canCompleteGame({ cards: ordered })) {
                    allValid = false;
                    break;
                }
            }

            orderedByRound.push(ordered);
        }

        if (!allValid) continue;

        for (let offset = 0; offset < orderedByRound.length; offset++) {
            const round = currentRounds[startIdx + offset];
            if (!round) continue;
            round.cards = orderedByRound[offset];
            recomputeRoundOutcome(round);
            const swapped = swapFirstTwoCards(round);
            const swapIsNonTie = (swapped === '莊' || swapped === '閒');
            round.sensitive = (swapIsNonTie && swapped !== round.result);
        }

        if (typeof refreshAnalysisAndRender === 'function') {
            refreshAnalysisAndRender({ mutate: false });
        }

        return true;
    }

    // B 也失敗：回復原狀
    restoreSnapshots();
    if (typeof refreshAnalysisAndRender === 'function') {
        refreshAnalysisAndRender({ mutate: false });
    }
    return false;
}

