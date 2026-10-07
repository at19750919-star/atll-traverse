// ==================== 路單輸入(反向)對話框 ====================
// 使用者按 莊/閒/和/6 → 即時建構大路 → 套用生成牌靴

(function () {
    // 軟性局數上限參考(自然平均 5 張/局,416/5≈82,留點 buffer)
    const SOFT_MAX_ROUNDS = 90;
    const HARD_MAX_ROUNDS = 104; // 全 4 張的理論上限
    const MIN_RECOMMENDED = 75;

    // 模組層級保存,讓對話框關掉後再開仍保留路單內容
    let savedItems = [];

    function buildBigRoadFrom(items) {
        // items: array of 'B' / 'P' / 'T' / 'B6'
        const rows = 6;
        const grid = [];
        for (let r = 0; r < rows; r++) grid.push({});
        let curCol = -1, curRow = -1, curColor = null, curStartCol = -1, maxCol = -1;

        function lastCell() {
            if (curCol < 0 || curRow < 0) return null;
            return grid[curRow][curCol] || null;
        }
        function putCell(row, col, cell) {
            grid[row][col] = cell;
            if (col > maxCol) maxCol = col;
        }
        function placeNext(color) {
            if (curCol < 0) {
                curCol = 0; curRow = 0; curColor = color; curStartCol = 0;
                return { row: 0, col: 0 };
            }
            if (color === curColor) {
                let nextRow = curRow + 1;
                if (nextRow < rows && !grid[nextRow][curCol]) {
                    curRow = nextRow;
                    return { row: nextRow, col: curCol };
                }
                let nextCol = curCol + 1;
                while (grid[curRow][nextCol]) nextCol++;
                curCol = nextCol;
                return { row: curRow, col: nextCol };
            } else {
                let nextCol = curStartCol + 1;
                while (grid[0][nextCol]) nextCol++;
                curCol = nextCol;
                curRow = 0;
                curColor = color;
                curStartCol = nextCol;
                return { row: 0, col: nextCol };
            }
        }

        let tieQueueOnStart = 0;
        for (let i = 0; i < items.length; i++) {
            const it = items[i];
            const r = it === 'B6' ? 'B' : it;
            if (r === 'T') {
                const lc = lastCell();
                if (lc) lc.tie = (lc.tie || 0) + 1;
                else tieQueueOnStart += 1;
                continue;
            }
            const pos = placeNext(r);
            const cell = { r, tie: 0, l6: it === 'B6', idx: i };
            if (tieQueueOnStart > 0 && curCol === 0 && curRow === 0 && pos.row === 0 && pos.col === 0) {
                cell.tie = tieQueueOnStart;
                tieQueueOnStart = 0;
            }
            putCell(pos.row, pos.col, cell);
        }
        return { grid, cols: maxCol + 1, rows };
    }

    function showRoadInputDialog() {
        if (document.querySelector('.road-input-dialog-overlay')) return;

        // 從模組層級還原(關掉再開仍保留)
        const items = savedItems.slice();

        const dialog = document.createElement('div');
        dialog.className = 'road-input-dialog-overlay';
        dialog.innerHTML = `
            <div class="rid-dialog">
                <div class="rid-header">
                    <div class="rid-brand">路單編輯 → 生成牌靴</div>
                    <button class="rid-close" type="button">✕</button>
                </div>
                <div class="rid-toolbar">
                    <button class="rid-btn rid-btn-b" data-act="B">莊</button>
                    <button class="rid-btn rid-btn-p" data-act="P">閒</button>
                    <button class="rid-btn rid-btn-t" data-act="T">和</button>
                    <button class="rid-btn rid-btn-6" data-act="B6">6</button>
                    <span class="rid-sep"></span>
                    <button class="rid-btn rid-btn-undo" data-act="undo">退</button>
                    <button class="rid-btn rid-btn-clear" data-act="clear">清</button>
                </div>
                <div class="rid-stats" id="ridStats">
                    <span class="rid-st-total">總: <b>0</b></span>
                    <span>莊: <b id="ridCntB">0</b></span>
                    <span>閒: <b id="ridCntP">0</b></span>
                    <span>和: <b id="ridCntT">0</b></span>
                    <span>莊6: <b id="ridCntL6">0</b></span>
                    <span class="rid-budget" id="ridBudget"></span>
                </div>
                <div class="rid-board-wrap">
                    <div class="rid-board" id="ridBoard"></div>
                </div>
                <div class="rid-footer">
                    <span class="rid-hint">快捷鍵:1=莊 2=閒 3=和 6=莊6 Backspace=退 ESC=取消</span>
                    <button class="rid-btn rid-btn-cancel" type="button" id="ridCancelBtn">取消</button>
                    <button class="rid-btn rid-btn-apply" type="button" id="ridApplyBtn">套用生成</button>
                </div>
            </div>
        `;
        document.body.appendChild(dialog);

        if (!document.getElementById('road-input-dialog-styles')) {
            const style = document.createElement('style');
            style.id = 'road-input-dialog-styles';
            style.textContent = `
                .road-input-dialog-overlay {
                    position: fixed; inset: 0;
                    background: rgba(0,0,0,0.25);
                    display: flex; align-items: center; justify-content: center;
                    z-index: 10001;
                    font-family: 'Microsoft JhengHei', sans-serif;
                }
                .rid-dialog {
                    background: #fdf3df;
                    border: 4px solid #c41e3a;
                    border-radius: 6px;
                    width: 96vw; max-width: 1500px;
                    max-height: 92vh;
                    display: flex; flex-direction: column;
                    overflow: hidden;
                    box-shadow: 0 12px 40px rgba(0,0,0,0.5);
                }
                .rid-header {
                    padding: 10px 16px;
                    background: #c41e3a; color: #fff;
                    display: flex; justify-content: space-between; align-items: center;
                }
                .rid-brand { font-size: 18px; font-weight: bold; letter-spacing: 2px; }
                .rid-close {
                    background: rgba(255,255,255,0.18); color: #fff;
                    border: none; font-size: 18px;
                    width: 30px; height: 30px; border-radius: 50%;
                    cursor: pointer;
                }
                .rid-close:hover { background: rgba(255,255,255,0.32); }
                .rid-toolbar {
                    padding: 10px 16px;
                    background: #f3e0b8;
                    display: flex; gap: 8px; align-items: center;
                    border-bottom: 1px solid #c8a978;
                }
                .rid-toolbar .rid-sep { width: 12px; }
                .rid-btn {
                    padding: 8px 18px;
                    border: 2px solid #999;
                    background: #fff;
                    font-size: 16px; font-weight: bold;
                    cursor: pointer;
                    border-radius: 4px;
                    font-family: inherit;
                    color: #333;
                    min-width: 60px;
                }
                .rid-btn:hover { background: #f0f0f0; }
                .rid-btn:active { transform: translateY(1px); }
                .rid-btn-b { background: #c41e3a; color: #fff; border-color: #8a1226; }
                .rid-btn-b:hover { background: #a01828; }
                .rid-btn-p { background: #1e7fc4; color: #fff; border-color: #0e5a9a; }
                .rid-btn-p:hover { background: #185f96; }
                .rid-btn-t { background: #2e8b57; color: #fff; border-color: #1d5d3a; }
                .rid-btn-t:hover { background: #246a43; }
                .rid-btn-6 { background: #ffc107; color: #6b3a00; border-color: #d4a000; }
                .rid-btn-6:hover { background: #e6a800; }
                .rid-btn-undo, .rid-btn-clear { background: #777; color: #fff; border-color: #555; }
                .rid-btn-undo:hover, .rid-btn-clear:hover { background: #555; }
                .rid-stats {
                    padding: 8px 16px;
                    background: #fffbe9;
                    border-bottom: 1px solid #c8a978;
                    display: flex; gap: 18px; align-items: center;
                    font-size: 14px;
                }
                .rid-stats b { color: #c41e3a; font-size: 16px; padding: 0 2px; }
                .rid-stats .rid-st-total b { color: #333; font-size: 18px; }
                .rid-stats .rid-budget {
                    margin-left: auto;
                    padding: 4px 10px;
                    border-radius: 4px;
                    font-size: 13px;
                    background: #d8f5d8; color: #1d5d3a;
                }
                .rid-stats .rid-budget.warn { background: #ffe8b3; color: #8a5a00; }
                .rid-stats .rid-budget.over { background: #ffcccc; color: #8a0000; }
                .rid-board-wrap {
                    flex: 1;
                    overflow: auto;
                    padding: 12px 16px;
                    background: #fdf3df;
                }
                .rid-board {
                    display: grid;
                    grid-template-rows: repeat(6, 32px);
                    grid-template-columns: repeat(var(--cols, 40), 32px);
                    gap: 0;
                    background: #fffbe9;
                    border: 1px solid #c8a978;
                }
                .rid-board > .rid-grid-cell {
                    border-right: 1px solid #e8d9b8;
                    border-bottom: 1px solid #e8d9b8;
                    box-sizing: border-box;
                }
                .rid-board > .rid-cell {
                    width: 32px; height: 32px;
                    display: flex; align-items: center; justify-content: center;
                    box-sizing: border-box;
                    z-index: 2;
                    position: relative;
                }
                .rid-circle {
                    width: 26px; height: 26px;
                    border-radius: 50%;
                    background: transparent;
                    box-sizing: border-box;
                    position: relative;
                }
                .rid-circle.banker { border: 3px solid #c41e3a; }
                .rid-circle.player { border: 3px solid #1e7fc4; }
                .rid-circle.l6 { background: radial-gradient(circle, #ffd54f 60%, transparent 65%); }
                .rid-circle.l6::after {
                    content: '6'; position: absolute; top: 50%; left: 50%;
                    transform: translate(-50%, -50%);
                    color: #6b3a00; font-size: 12px; font-weight: bold;
                }
                .rid-tie-line { position: absolute; width: 32px; height: 32px; pointer-events: none; }
                .rid-tie-line::before {
                    content: ''; position: absolute;
                    top: 50%; left: 0; width: 100%; height: 2px;
                    background: #2e8b57; transform: rotate(-45deg);
                }
                .rid-tie-count {
                    position: absolute; top: 1px; right: 2px;
                    font-size: 9px; color: #2e8b57; font-weight: bold;
                }
                .rid-footer {
                    padding: 12px 16px;
                    background: #f3e0b8;
                    border-top: 1px solid #c8a978;
                    display: flex; gap: 12px; align-items: center;
                }
                .rid-footer .rid-hint {
                    font-size: 12px; color: #555;
                    margin-right: auto;
                }
                .rid-btn-cancel { min-width: 80px; }
                .rid-btn-apply {
                    background: #2e8b57; color: #fff; border-color: #1d5d3a;
                    min-width: 110px;
                }
                .rid-btn-apply:hover { background: #246a43; }
                .rid-btn-apply:disabled {
                    background: #aaa; color: #fff; cursor: not-allowed; border-color: #888;
                }
            `;
            document.head.appendChild(style);
        }

        const board = dialog.querySelector('#ridBoard');
        const elTotal = dialog.querySelector('.rid-st-total b');
        const elB = dialog.querySelector('#ridCntB');
        const elP = dialog.querySelector('#ridCntP');
        const elT = dialog.querySelector('#ridCntT');
        const elL6 = dialog.querySelector('#ridCntL6');
        const elBudget = dialog.querySelector('#ridBudget');
        const applyBtn = dialog.querySelector('#ridApplyBtn');

        function render() {
            // 統計
            const stats = items.reduce((acc, it) => {
                if (it === 'B') acc.B++;
                else if (it === 'P') acc.P++;
                else if (it === 'T') acc.T++;
                else if (it === 'B6') { acc.B++; acc.L6++; }
                return acc;
            }, { B: 0, P: 0, T: 0, L6: 0 });

            elTotal.textContent = items.length;
            elB.textContent = stats.B;
            elP.textContent = stats.P;
            elT.textContent = stats.T;
            elL6.textContent = stats.L6;

            // 預算提示
            const total = items.length;
            const remaining = SOFT_MAX_ROUNDS - total;
            elBudget.classList.remove('warn', 'over');
            if (total < MIN_RECOMMENDED) {
                elBudget.textContent = `建議 ${MIN_RECOMMENDED}~${SOFT_MAX_ROUNDS} 局(差 ${MIN_RECOMMENDED - total} 局到下限)`;
            } else if (total <= SOFT_MAX_ROUNDS) {
                elBudget.textContent = `剩餘額度約 ${remaining} 局`;
            } else if (total <= HARD_MAX_ROUNDS) {
                elBudget.textContent = `已超出建議上限(${total} > ${SOFT_MAX_ROUNDS}),仍可生成但失敗率高`;
                elBudget.classList.add('warn');
            } else {
                elBudget.textContent = `已超出硬上限(${total} > ${HARD_MAX_ROUNDS}),416 張不夠`;
                elBudget.classList.add('over');
            }

            applyBtn.disabled = (total === 0 || total > HARD_MAX_ROUNDS);

            // 大路渲染
            const big = buildBigRoadFrom(items);
            const totalCols = Math.max(40, big.cols + 2);
            board.style.setProperty('--cols', totalCols);
            board.innerHTML = '';
            for (let row = 0; row < 6; row++) {
                for (let col = 0; col < totalCols; col++) {
                    const c = document.createElement('div');
                    c.className = 'rid-grid-cell';
                    c.style.gridRow = row + 1;
                    c.style.gridColumn = col + 1;
                    board.appendChild(c);
                }
            }
            for (let row = 0; row < big.rows; row++) {
                for (const colKey in big.grid[row]) {
                    const cell = big.grid[row][colKey];
                    if (!cell) continue;
                    const wrap = document.createElement('div');
                    wrap.className = 'rid-cell';
                    wrap.style.gridRow = row + 1;
                    wrap.style.gridColumn = (Number(colKey) + 1);
                    const circle = document.createElement('div');
                    circle.className = 'rid-circle ' + (cell.r === 'B' ? 'banker' : 'player');
                    if (cell.l6) circle.classList.add('l6');
                    wrap.appendChild(circle);
                    if (cell.tie > 0) {
                        const tieLine = document.createElement('div');
                        tieLine.className = 'rid-tie-line';
                        wrap.appendChild(tieLine);
                        if (cell.tie > 1) {
                            const cnt = document.createElement('div');
                            cnt.className = 'rid-tie-count';
                            cnt.textContent = cell.tie;
                            wrap.appendChild(cnt);
                        }
                    }
                    board.appendChild(wrap);
                }
            }
            // 自動捲到最右
            const wrap = dialog.querySelector('.rid-board-wrap');
            if (wrap) wrap.scrollLeft = wrap.scrollWidth;
        }

        function handleAction(act) {
            if (act === 'undo') {
                items.pop();
            } else if (act === 'clear') {
                items.length = 0;
            } else if (['B', 'P', 'T', 'B6'].includes(act)) {
                if (items.length >= HARD_MAX_ROUNDS) {
                    if (typeof log === 'function') log(`已達硬上限 ${HARD_MAX_ROUNDS} 局,無法再加`, 'warn');
                    return;
                }
                items.push(act);
            }
            // 同步到模組層級
            savedItems = items.slice();
            render();
        }

        // 按鈕
        dialog.querySelectorAll('.rid-toolbar .rid-btn').forEach(btn => {
            btn.addEventListener('click', () => handleAction(btn.dataset.act));
        });

        // 鍵盤快捷鍵
        const keyHandler = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            switch (e.key) {
                case '1': case 'b': case 'B': handleAction('B'); e.preventDefault(); break;
                case '2': case 'p': case 'P': handleAction('P'); e.preventDefault(); break;
                case '3': case 't': case 'T': handleAction('T'); e.preventDefault(); break;
                case '6': handleAction('B6'); e.preventDefault(); break;
                case 'Backspace': handleAction('undo'); e.preventDefault(); break;
                case 'Escape': close(); break;
            }
        };
        document.addEventListener('keydown', keyHandler);

        function close() {
            document.removeEventListener('keydown', keyHandler);
            dialog.remove();
        }

        dialog.querySelector('.rid-close').addEventListener('click', close);
        dialog.querySelector('#ridCancelBtn').addEventListener('click', close);

        // 套用 → 呼叫主程式生成(不關閉對話框,可連續多次生成)
        let generateCount = 0;
        applyBtn.addEventListener('click', () => {
            if (items.length === 0) return;
            applyBtn.disabled = true;
            applyBtn.textContent = '生成中...';

            setTimeout(() => {
                try {
                    const rounds = generateShoeByItemList(items);

                    currentRounds = rounds;
                    window.__importedShoeMode = true;
                    window.__regenerateCount = 0;

                    const logArea = document.getElementById('logArea');
                    if (logArea) logArea.innerHTML = '';
                    const roundsBody = document.getElementById('roundsBody');
                    if (roundsBody) roundsBody.innerHTML = '';

                    if (typeof refreshAnalysisAndRender === 'function') {
                        refreshAnalysisAndRender({ mutate: false, skipVerify: true });
                    }
                    if (typeof setEditButtonsAvailability === 'function') setEditButtonsAvailability(true);
                    if (typeof resetEditState === 'function') resetEditState();

                    if (typeof analyzeShoeRecovery === 'function' && typeof updateRecoveryDisplay === 'function') {
                        try {
                            const rr = analyzeShoeRecovery(currentRounds);
                            if (rr) updateRecoveryDisplay(rr);
                        } catch (_) {}
                    }

                    generateCount++;
                    if (typeof log === 'function') {
                        log(`✅ 路單編輯生成第 ${generateCount} 條:${rounds.length} 局`, 'success');
                    }
                    applyBtn.disabled = false;
                    applyBtn.textContent = `套用生成 (#${generateCount + 1})`;

                    // 短暫顯示成功提示在預算列
                    const oldText = elBudget.textContent;
                    const oldClass = elBudget.className;
                    elBudget.className = 'rid-budget';
                    elBudget.style.background = '#d8f5d8';
                    elBudget.style.color = '#1d5d3a';
                    elBudget.textContent = `✓ 第 ${generateCount} 條已生成(可繼續點套用再生一條)`;
                    setTimeout(() => {
                        elBudget.style.background = '';
                        elBudget.style.color = '';
                        elBudget.className = oldClass;
                        elBudget.textContent = oldText;
                    }, 2500);
                } catch (e) {
                    applyBtn.disabled = false;
                    applyBtn.textContent = '套用生成';
                    alert('生成失敗:' + (e && e.message ? e.message : e));
                }
            }, 30);
        });

        render();
    }

    function renderInlineRoadEdit(container) {
        if (!container) return;

        if (!document.getElementById('road-input-inline-styles')) {
            const style = document.createElement('style');
            style.id = 'road-input-inline-styles';
            style.textContent = `
                .rid-btn {
                    padding: 6px 14px; border: 2px solid #999; background: #fff;
                    font-size: 14px; font-weight: bold; cursor: pointer;
                    border-radius: 4px; font-family: inherit; color: #333; min-width: 48px;
                }
                .rid-btn:hover { background: #f0f0f0; }
                .rid-btn:active { transform: translateY(1px); }
                .rid-btn-b { background: #c41e3a; color: #fff; border-color: #8a1226; }
                .rid-btn-b:hover { background: #a01828; }
                .rid-btn-p { background: #1e7fc4; color: #fff; border-color: #0e5a9a; }
                .rid-btn-p:hover { background: #185f96; }
                .rid-btn-t { background: #2e8b57; color: #fff; border-color: #1d5d3a; }
                .rid-btn-t:hover { background: #246a43; }
                .rid-btn-6 { background: #ffc107; color: #6b3a00; border-color: #d4a000; }
                .rid-btn-6:hover { background: #e6a800; }
                .rid-btn-undo, .rid-btn-clear { background: #777; color: #fff; border-color: #555; }
                .rid-btn-undo:hover, .rid-btn-clear:hover { background: #555; }
                .rid-btn-apply { background: #2e8b57; color: #fff; border-color: #1d5d3a; min-width: 90px; }
                .rid-btn-apply:hover { background: #246a43; }
                .rid-btn-apply:disabled { background: #aaa; color: #fff; cursor: not-allowed; border-color: #888; }
                .rid-budget { padding: 3px 8px; border-radius: 4px; font-size: 12px; background: #d8f5d8; color: #1d5d3a; }
                .rid-budget.warn { background: #ffe8b3; color: #8a5a00; }
                .rid-budget.over { background: #ffcccc; color: #8a0000; }
                .ire-toolbar { display: flex; gap: 6px; align-items: center; padding: 8px 0; border-bottom: 1px solid #c8a978; margin-bottom: 6px; flex-wrap: wrap; }
                .ire-stats { display: flex; gap: 12px; align-items: center; font-size: 12px; padding: 4px 0; border-bottom: 1px solid #e8d9b8; margin-bottom: 6px; flex-wrap: wrap; }
                .ire-stats b { color: #c41e3a; font-size: 13px; }
                .ire-board-wrap { overflow-x: auto; margin-bottom: 8px; }
                .ire-board {
                    display: grid;
                    grid-template-rows: repeat(6, 26px);
                    grid-template-columns: repeat(var(--cols, 40), 26px);
                    gap: 0; background: #fffbe9; border: 1px solid #c8a978; width: fit-content;
                }
                .ire-board > .ire-grid-cell { border-right: 1px solid #e8d9b8; border-bottom: 1px solid #e8d9b8; box-sizing: border-box; }
                .ire-board > .ire-cell {
                    width: 26px; height: 26px; display: flex; align-items: center; justify-content: center;
                    box-sizing: border-box; z-index: 2; position: relative;
                }
                .ire-circle { width: 20px; height: 20px; border-radius: 50%; background: transparent; box-sizing: border-box; position: relative; }
                .ire-circle.banker { border: 2.5px solid #c41e3a; }
                .ire-circle.player { border: 2.5px solid #1e6fc4; }
                .ire-circle.l6 { background: radial-gradient(circle, #ffd54f 60%, transparent 65%); }
                .ire-circle.l6::after {
                    content: '6'; position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%);
                    color: #6b3a00; font-size: 10px; font-weight: bold;
                }
                .ire-tie-line { position: absolute; width: 26px; height: 26px; pointer-events: none; }
                .ire-tie-line::before {
                    content: ''; position: absolute; top: 50%; left: 0; width: 100%; height: 2px;
                    background: #2e8b57; transform: rotate(-45deg); transform-origin: center;
                }
                .ire-tie-count { position: absolute; top: 1px; right: 2px; font-size: 8px; color: #2e8b57; font-weight: bold; }
                .ire-footer { display: flex; gap: 10px; align-items: center; padding-top: 8px; border-top: 1px solid #e8d9b8; flex-wrap: wrap; }
                .ire-footer .ire-hint { font-size: 11px; color: #888; margin-right: auto; }
            `;
            document.head.appendChild(style);
        }

        container.dataset.mode = 'edit';
        container.innerHTML = `
            <div class="ire-toolbar">
                <button class="rid-btn rid-btn-b" data-act="B">莊</button>
                <button class="rid-btn rid-btn-p" data-act="P">閒</button>
                <button class="rid-btn rid-btn-t" data-act="T">和</button>
                <button class="rid-btn rid-btn-6" data-act="B6">6</button>
                <span style="display:inline-block;width:8px"></span>
                <button class="rid-btn rid-btn-undo" data-act="undo">退</button>
                <button class="rid-btn rid-btn-clear" data-act="clear">清</button>
            </div>
            <div class="ire-stats">
                <span>總: <b id="ireTotal">0</b></span>
                <span>莊: <b id="ireCntB">0</b></span>
                <span>閒: <b id="ireCntP">0</b></span>
                <span>和: <b id="ireCntT">0</b></span>
                <span>莊6: <b id="ireCntL6">0</b></span>
                <span id="ireBudget" class="rid-budget" style="margin-left:auto"></span>
            </div>
            <div class="ire-board-wrap">
                <div class="ire-board" id="ireBoardInline"></div>
            </div>
            <div class="ire-footer">
                <span class="ire-hint">快捷鍵: 1=莊 2=閒 3=和 6=莊6 Backspace=退</span>
                <button class="rid-btn rid-btn-apply" id="ireApplyBtn">套用生成</button>
            </div>
        `;

        const items = savedItems.slice();
        const elTotal = container.querySelector('#ireTotal');
        const elB = container.querySelector('#ireCntB');
        const elP = container.querySelector('#ireCntP');
        const elT = container.querySelector('#ireCntT');
        const elL6 = container.querySelector('#ireCntL6');
        const elBudget = container.querySelector('#ireBudget');
        const applyBtn = container.querySelector('#ireApplyBtn');
        const board = container.querySelector('#ireBoardInline');

        function render() {
            const stats = items.reduce((acc, it) => {
                if (it === 'B') acc.B++;
                else if (it === 'P') acc.P++;
                else if (it === 'T') acc.T++;
                else if (it === 'B6') { acc.B++; acc.L6++; }
                return acc;
            }, { B: 0, P: 0, T: 0, L6: 0 });
            elTotal.textContent = items.length;
            elB.textContent = stats.B;
            elP.textContent = stats.P;
            elT.textContent = stats.T;
            elL6.textContent = stats.L6;

            const total = items.length;
            const remaining = SOFT_MAX_ROUNDS - total;
            elBudget.classList.remove('warn', 'over');
            if (total < MIN_RECOMMENDED) {
                elBudget.textContent = `建議 ${MIN_RECOMMENDED}~${SOFT_MAX_ROUNDS} 局(差 ${MIN_RECOMMENDED - total} 局)`;
            } else if (total <= SOFT_MAX_ROUNDS) {
                elBudget.textContent = `剩餘額度約 ${remaining} 局`;
            } else if (total <= HARD_MAX_ROUNDS) {
                elBudget.textContent = `超出建議上限(${total}>${SOFT_MAX_ROUNDS})`;
                elBudget.classList.add('warn');
            } else {
                elBudget.textContent = `超出硬上限(${total}>${HARD_MAX_ROUNDS})`;
                elBudget.classList.add('over');
            }
            applyBtn.disabled = (total === 0 || total > HARD_MAX_ROUNDS);

            const big = buildBigRoadFrom(items);
            const totalCols = Math.max(40, big.cols + 2);
            board.style.setProperty('--cols', totalCols);
            board.innerHTML = '';
            for (let row = 0; row < 6; row++) {
                for (let col = 0; col < totalCols; col++) {
                    const c = document.createElement('div');
                    c.className = 'ire-grid-cell';
                    c.style.gridRow = row + 1;
                    c.style.gridColumn = col + 1;
                    board.appendChild(c);
                }
            }
            for (let row = 0; row < big.rows; row++) {
                for (const colKey in big.grid[row]) {
                    const cell = big.grid[row][colKey];
                    if (!cell) continue;
                    const wrap = document.createElement('div');
                    wrap.className = 'ire-cell';
                    wrap.style.gridRow = row + 1;
                    wrap.style.gridColumn = (Number(colKey) + 1);
                    const circle = document.createElement('div');
                    circle.className = 'ire-circle ' + (cell.r === 'B' ? 'banker' : 'player');
                    if (cell.l6) circle.classList.add('l6');
                    wrap.appendChild(circle);
                    if (cell.tie > 0) {
                        const tieLine = document.createElement('div');
                        tieLine.className = 'ire-tie-line';
                        wrap.appendChild(tieLine);
                        if (cell.tie > 1) {
                            const cnt = document.createElement('div');
                            cnt.className = 'ire-tie-count';
                            cnt.textContent = cell.tie;
                            wrap.appendChild(cnt);
                        }
                    }
                    board.appendChild(wrap);
                }
            }
            const boardWrap = container.querySelector('.ire-board-wrap');
            if (boardWrap) boardWrap.scrollLeft = boardWrap.scrollWidth;
        }

        function handleAction(act) {
            if (act === 'undo') {
                items.pop();
            } else if (act === 'clear') {
                items.length = 0;
            } else if (['B', 'P', 'T', 'B6'].includes(act)) {
                if (items.length >= HARD_MAX_ROUNDS) {
                    if (typeof log === 'function') log(`已達硬上限 ${HARD_MAX_ROUNDS} 局`, 'warn');
                    return;
                }
                items.push(act);
            }
            savedItems = items.slice();
            render();
        }

        container.querySelectorAll('.ire-toolbar .rid-btn').forEach(btn => {
            btn.addEventListener('click', () => handleAction(btn.dataset.act));
        });

        const keyHandler = (e) => {
            if (!container.isConnected || container.dataset.mode !== 'edit') {
                document.removeEventListener('keydown', keyHandler);
                return;
            }
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            switch (e.key) {
                case '1': case 'b': case 'B': handleAction('B'); e.preventDefault(); break;
                case '2': case 'p': case 'P': handleAction('P'); e.preventDefault(); break;
                case '3': case 't': case 'T': handleAction('T'); e.preventDefault(); break;
                case '6': handleAction('B6'); e.preventDefault(); break;
                case 'Backspace': handleAction('undo'); e.preventDefault(); break;
            }
        };
        document.addEventListener('keydown', keyHandler);

        let generateCount = 0;
        applyBtn.addEventListener('click', () => {
            if (items.length === 0) return;
            applyBtn.disabled = true;
            applyBtn.textContent = '生成中...';
            setTimeout(() => {
                try {
                    const rounds = generateShoeByItemList(items);
                    currentRounds = rounds;
                    window.__importedShoeMode = true;
                    window.__regenerateCount = 0;
                    const logArea = document.getElementById('logArea');
                    if (logArea) logArea.innerHTML = '';
                    const roundsBody = document.getElementById('roundsBody');
                    if (roundsBody) roundsBody.innerHTML = '';
                    if (typeof refreshAnalysisAndRender === 'function') {
                        refreshAnalysisAndRender({ mutate: false, skipVerify: true });
                    }
                    if (typeof setEditButtonsAvailability === 'function') setEditButtonsAvailability(true);
                    if (typeof resetEditState === 'function') resetEditState();
                    if (typeof analyzeShoeRecovery === 'function' && typeof updateRecoveryDisplay === 'function') {
                        try { const rr = analyzeShoeRecovery(currentRounds); if (rr) updateRecoveryDisplay(rr); } catch (_) {}
                    }
                    generateCount++;
                    if (typeof log === 'function') log(`✅ 路單編輯生成第 ${generateCount} 條:${rounds.length} 局`, 'success');
                    applyBtn.disabled = false;
                    applyBtn.textContent = `套用生成 (#${generateCount + 1})`;
                    // brief success flash
                    const oldText = elBudget.textContent;
                    const oldCls = elBudget.className;
                    elBudget.style.background = '#d8f5d8';
                    elBudget.style.color = '#1d5d3a';
                    elBudget.textContent = `✓ 第 ${generateCount} 條已生成`;
                    setTimeout(() => {
                        elBudget.style.background = '';
                        elBudget.style.color = '';
                        elBudget.className = oldCls;
                        elBudget.textContent = oldText;
                    }, 2500);
                } catch (err) {
                    applyBtn.disabled = false;
                    applyBtn.textContent = '套用生成';
                    alert('生成失敗:' + (err && err.message ? err.message : err));
                }
            }, 30);
        });

        render();
    }

    window.showRoadInputDialog = showRoadInputDialog;
    window.renderInlineRoadEdit = renderInlineRoadEdit;
})();
