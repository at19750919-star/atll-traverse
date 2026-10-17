// ═══════════════════════════════════════════════════════════════
// 自動修正違規插件 v1.0
// 獨立腳本 - 不修改原本檔案
//
// 使用方式：
// 1. 在 index.html 最底部（</body> 之前）加入：
//    <script src="auto_fix_plugin.js"></script>
//
// 2. 或者直接在瀏覽器 Console 貼上此檔案內容執行
// ═══════════════════════════════════════════════════════════════

(function() {
    'use strict';

    // ========== 設定 ==========
    const CONFIG = {
        maxRetries: 15,           // 最多嘗試幾輪修正
        avgRecoveryLimit: 4.5,    // 平均回復上限（0=關閉）
        autoUpdateInput: true     // 是否自動更新輸入框的值
    };

    // ========== 初始化：僅在無 localStorage 設定時套用預設值 ==========
    function initDefaultValues() {
        try {
            const saved = JSON.parse(localStorage.getItem('at-settings') || '{}');
            if (saved.avgRecoveryLimit !== undefined) return; // localStorage 已有值，不覆蓋
        } catch(e){}
        const avgInput = document.getElementById('avgRecoveryLimit');
        if (avgInput && CONFIG.autoUpdateInput) {
            avgInput.value = CONFIG.avgRecoveryLimit;
            console.log(`✓ 平均回復上限已設為 ${CONFIG.avgRecoveryLimit}`);
        }
    }

    // ========== 核心：自動修正所有違規 ==========
    async function autoFixAllViolations() {
        console.log('🚀 開始自動修正違規...');
        log('🚀 開始自動修正違規...', 'info');

        if (!currentRounds || currentRounds.length === 0) {
            console.error('❌ 請先生成牌靴！');
            log('❌ 請先生成牌靴！', 'error');
            return false;
        }

        // 暫時抑制回復分析的 console 輸出
        const originalConsoleLog = console.log;
        const suppressRecoveryLogs = (msg, ...args) => {
            if (typeof msg === 'string') {
                // 過濾掉回復分析相關的日誌
                if (msg.includes('回復分析') ||
                    msg.includes('平均消耗') ||
                    msg.includes('最大消耗') ||
                    msg.includes('立即回復') ||
                    msg.includes('分佈統計') ||
                    msg.includes('總切牌點') ||
                    msg.includes('1~5 局') ||
                    msg.includes('6~10 局') ||
                    msg.includes('11~15 局') ||
                    msg.includes('16 局以上') ||
                    msg.includes('牌靴總共')) {
                    return; // 不輸出
                }
            }
            originalConsoleLog.call(console, msg, ...args);
        };
        console.log = suppressRecoveryLogs;

        let iteration = 0;
        let totalFixed = 0;

        try {

        while (iteration < CONFIG.maxRetries) {
            iteration++;
            console.log(`\n═══ 第 ${iteration} 輪修正 ═══`);

            // 1. 計算當前違規統計
            const stats = calculateViolationStats(currentRounds);

            const totalViolations =
                stats.signalViolations +
                stats.fourCardViolations +
                stats.streakViolations +
                stats.cardCountMismatchViolations +
                (stats.cannotSwapViolations || 0);

            console.log(`📊 當前違規: 訊號=${stats.signalViolations}, 連續4張=${stats.fourCardViolations}, 連續莊閒=${stats.streakViolations}, 張數不符=${stats.cardCountMismatchViolations}`);

            if (totalViolations === 0) {
                console.log('✅ 所有核心違規已修正！');
                log('✅ 所有核心違規已修正！', 'success');
                break;
            }

            let fixedThisRound = 0;

            // 2. 優先修正「張數不符」（藍底）
            if (stats.cardCountMismatchRounds && stats.cardCountMismatchRounds.length > 0) {
                for (const roundNum of stats.cardCountMismatchRounds) {
                    console.log(`🔧 嘗試重排第 ${roundNum} 局（張數不符）...`);

                    // 嚴格模式：必須是敏感局且可對調
                    const success = tryReorderRoundToClearMismatch(roundNum, {
                        requireSwap: true,
                        requireSensitive: true,
                        mutate: true
                    });

                    if (success) {
                        // 額外驗證：確保重排後真的是有效的敏感局
                        const roundIdx = roundNum - 1;
                        const round = currentRounds[roundIdx];
                        if (round && isValidSensitiveRound(round)) {
                            console.log(`   ✓ 第 ${roundNum} 局重排成功`);
                            fixedThisRound++;
                            totalFixed++;
                        } else {
                            console.log(`   ✗ 第 ${roundNum} 局重排後不符合敏感局條件`);
                            // 不算成功，繼續嘗試其他方法
                        }
                    } else {
                        console.log(`   ✗ 第 ${roundNum} 局重排失敗`);
                    }
                }
            }

            // 3. 修正訊號牌違規（嘗試對調前兩張）
            if (stats.signalViolationRounds && stats.signalViolationRounds.length > 0) {
                for (const roundNum of stats.signalViolationRounds) {
                    const roundIdx = roundNum - 1;
                    const currentRound = currentRounds[roundIdx];
                    const nextIdx = (roundIdx + 1) % currentRounds.length;
                    const nextRound = currentRounds[nextIdx];

                    if (!nextRound || !currentRound) continue;

                    // 判斷期望結果
                    const isT = currentRound.isT || hasFullHouse(currentRound);
                    const hasSignal = currentRound.cards && currentRound.cards.some(c => c && isSignalCardByConfig(c));

                    let expectedResult;
                    if (isT) {
                        expectedResult = '和';
                    } else if (hasSignal) {
                        expectedResult = '莊';
                    } else {
                        expectedResult = null; // 不應該是莊
                    }

                    const currentResult = getTrueRoundResult(nextRound);
                    const swapped = swapFirstTwoCards(nextRound);

                    // 檢查是否需要對調
                    let shouldSwap = false;
                    if (expectedResult === '和' && currentResult !== '和' && swapped === '和') {
                        shouldSwap = true;
                    } else if (expectedResult === '莊' && currentResult !== '莊' && swapped === '莊') {
                        shouldSwap = true;
                    } else if (expectedResult === null && currentResult === '莊' && swapped !== '莊' && swapped !== '和') {
                        shouldSwap = true;
                    }

                    // 檢查對調後是否會產生莊6點贏
                    if (shouldSwap && swapped) {
                        const _b6El = document.getElementById('skipBanker6');
                        if (_b6El && _b6El.checked && nextRound.cards && nextRound.cards.length >= 4) {
                            const tmp = nextRound.cards.map(c => c.clone());
                            [tmp[0], tmp[1]] = [tmp[1], tmp[0]];
                            const hi = computeRoundHands(tmp);
                            if (hi && hi.bankerTotal === 6 && hi.playerTotal <= 5) {
                                console.log(`⚠️ 第 ${nextIdx + 1} 局對調後會產生莊6點贏，跳過`);
                                shouldSwap = false;
                            }
                        }
                    }
                    if (shouldSwap && swapped) {
                        console.log(`🔧 對調第 ${nextIdx + 1} 局前兩張 (${currentResult} → ${swapped})...`);
                        executeCardSwap(nextRound);
                        recomputeRoundOutcome(nextRound);
                        fixedThisRound++;
                        totalFixed++;
                    }
                }
            }

            // 4. 如果這輪沒修正任何東西，嘗試更激進的方法
            if (fixedThisRound === 0 && totalViolations > 0) {
                console.log('⚠️ 簡單修正無效，嘗試批次重排...');

                // 嘗試對違規區域做批次重排
                let batchFixed = false;

                // 處理連續4張違規
                if (stats.fourCardBlocks && stats.fourCardBlocks.length > 0) {
                    for (const block of stats.fourCardBlocks) {
                        const success = tryBatchReorderForBlock(block.startIdx, block.endIdx);
                        if (success) {
                            batchFixed = true;
                            totalFixed++;
                        }
                    }
                }

                // 處理連續莊閒違規
                if (stats.streakBlocks && stats.streakBlocks.length > 0) {
                    for (const block of stats.streakBlocks) {
                        const success = tryBatchReorderForBlock(block.startIdx, block.endIdx);
                        if (success) {
                            batchFixed = true;
                            totalFixed++;
                        }
                    }
                }

                if (!batchFixed) {
                    console.log('⚠️ 批次重排也無法解決，可能需要重新生成牌靴');
                    log('⚠️ 部分違規無法自動修正，建議重新生成', 'warn');
                    break;
                }
            }

            // 刷新分析
            if (typeof refreshAnalysisAndRender === 'function') {
                refreshAnalysisAndRender({ mutate: false });
            }
        }

        // 5. 最後處理卡色
        console.log('\n🎨 處理卡色...');
        log('🎨 處理卡色...', 'info');
        if (typeof runAutoColorSwap_Signal === 'function') {
            try {
                currentRounds = runAutoColorSwap_Signal(currentRounds);
                console.log('   ✓ 卡色處理完成');
            } catch (e) {
                console.warn('   ⚠️ 卡色處理出現問題:', e);
            }
        }

        // 6. 最終刷新
        if (typeof refreshAnalysisAndRender === 'function') {
            refreshAnalysisAndRender();
        }
        if (typeof refreshViolationStats === 'function') {
            refreshViolationStats();
        }

        // 7. 輸出最終結果
        const finalStats = calculateViolationStats(currentRounds);
        console.log('\n═══ 最終結果 ═══');
        console.log(`訊號牌違規: ${finalStats.signalViolations}`);
        console.log(`連續4張違規: ${finalStats.fourCardViolations}`);
        console.log(`連續莊閒違規: ${finalStats.streakViolations}`);
        console.log(`張數不符: ${finalStats.cardCountMismatchViolations}`);
        console.log(`卡色違規: ${finalStats.cardColorViolations}`);
        console.log(`總共修正: ${totalFixed} 處`);

        const remainingViolations =
            finalStats.signalViolations +
            finalStats.fourCardViolations +
            finalStats.streakViolations +
            finalStats.cardCountMismatchViolations;

        // 恢復 console.log
        console.log = originalConsoleLog;

        if (remainingViolations === 0) {
            console.log('\n🎉 自動修正完成！可以導出了。');
            log(`🎉 自動修正完成！共修正 ${totalFixed} 處，可以導出了。`, 'success');
            return true;
        } else {
            console.log(`\n⚠️ 仍有 ${remainingViolations} 處違規需要手動處理。`);
            log(`⚠️ 仍有 ${remainingViolations} 處違規，建議重新生成牌靴`, 'warn');
            return false;
        }

        } catch (error) {
            // 發生錯誤時也要恢復 console.log
            console.log = originalConsoleLog;
            console.error('自動修正過程發生錯誤:', error);
            log('❌ 自動修正過程發生錯誤: ' + error.message, 'error');
            return false;
        }
    }

    // ========== 輔助函數：取得局的真實結果 ==========
    function getTrueRoundResult(round) {
        if (!round || !Array.isArray(round.cards)) return null;
        const handInfo = computeRoundHands(round.cards);
        const p = handInfo.playerTotal;
        const b = handInfo.bankerTotal;
        if (typeof p !== 'number' || typeof b !== 'number') return null;
        if (p === b) return '和';
        return (p > b) ? '閒' : '莊';
    }

    // ========== 輔助函數：驗證是否為有效的敏感局 ==========
    function isValidSensitiveRound(round) {
        if (!round || !Array.isArray(round.cards) || round.cards.length < 4) {
            return false;
        }

        // 1. 檢查張數是否符合補牌規則
        const handInfo = computeRoundHands(round.cards);
        const usedCardCount = (handInfo.playerCards?.length || 0) + (handInfo.bankerCards?.length || 0);
        const totalCardCount = round.cards.length;
        if (usedCardCount !== totalCardCount) {
            return false; // 張數不符
        }

        // 2. 檢查是否可以對調
        const swapped = swapFirstTwoCards(round);
        if (swapped === null) {
            return false; // 無法對調
        }

        // 3. 檢查對調後是否改變結果（敏感局定義）
        const currentResult = getTrueRoundResult(round);
        if (swapped === currentResult) {
            return false; // 對調後結果相同，不是敏感局
        }

        // 4. 對調後不能是和局（除非原本就是和局且對調後也是和局）
        if (currentResult !== '和' && swapped === '和') {
            return false; // 對調後變成和局，不算有效敏感局
        }

        return true;
    }

    // ========== 輔助函數：嘗試對區塊做批次重排 ==========
    function tryBatchReorderForBlock(startIdx, endIdx) {
        if (typeof tryBatchReorder === 'function') {
            const conditions = [];
            for (let i = startIdx; i <= endIdx; i++) {
                conditions.push({
                    roundIndex: i,
                    desiredResult: 'any',
                    requireSensitive: true
                });
            }
            return tryBatchReorder(startIdx, endIdx, conditions);
        }
        return false;
    }

    // ========== 新增按鈕到 UI ==========
    function addAutoFixButton() {
        const toolbar = document.querySelector('.tool-sidebar');
        if (!toolbar) {
            console.warn('找不到工具列，無法新增按鈕');
            return;
        }

        // 檢查是否已經新增過
        if (document.getElementById('btnAutoFix')) {
            return;
        }

        // 建立按鈕
        const btn = document.createElement('button');
        btn.id = 'btnAutoFix';
        btn.className = 'tool-btn';
        btn.textContent = '一鍵修正';

        btn.addEventListener('click', async function() {
            btn.disabled = true;
            btn.textContent = '修正中...';
            btn.style.opacity = '0.7';

            try {
                await autoFixAllViolations();
            } catch (e) {
                console.error('自動修正出錯:', e);
                log('❌ 自動修正出錯: ' + e.message, 'error');
            }

            btn.disabled = false;
            btn.textContent = '一鍵修正';
            btn.style.opacity = '1';
        });

        // 找到「換色」按鈕，在它後面插入
        const colorBtn = document.getElementById('btnAutoColor');
        if (colorBtn && colorBtn.parentNode) {
            colorBtn.parentNode.insertBefore(btn, colorBtn.nextSibling);
        } else {
            // 備用：直接加到工具列最後
            toolbar.appendChild(btn);
        }

        console.log('✓ 「一鍵修正」按鈕已新增');
    }

    // ========== 暴露全局函數 ==========
    window.autoFixAllViolations = autoFixAllViolations;
    window.AutoFixPlugin = {
        fix: autoFixAllViolations,
        config: CONFIG
    };

    // ========== 初始化 ==========
    function init() {
        console.log('═══════════════════════════════════════');
        console.log('  自動修正違規插件 v1.0 已載入');
        console.log('═══════════════════════════════════════');

        initDefaultValues();
        addAutoFixButton();

        console.log('');
        console.log('使用方式：');
        console.log('  1. 點擊「一鍵修正」按鈕');
        console.log('  2. 或在 Console 輸入: autoFixAllViolations()');
        console.log('');
    }

    // DOM 載入完成後初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // DOM 已經載入完成
        init();
    }

})();
