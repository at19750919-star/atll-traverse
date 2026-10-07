// ==================== 路單對話框(大路) ====================
// 演算法參考 C:/Users/user/Desktop/baccarat-roadmap/app.js 的 buildBigRoad

(function () {
    // 把 currentRounds 轉成 baccarat-roadmap 用的 {r, bp, pp, l6} 格式
    function roundsToBacRoad(rounds) {
        if (!Array.isArray(rounds)) return [];
        const b6Set = (typeof bankerSixIndexes !== 'undefined' && bankerSixIndexes instanceof Set)
            ? bankerSixIndexes : new Set();
        return rounds.map((rd, idx) => {
            let r = 'B';
            if (rd.result === '莊') r = 'B';
            else if (rd.result === '閒') r = 'P';
            else if (rd.result === '和') r = 'T';
            const l6 = r === 'B' && b6Set.has(idx);
            return { r, bp: false, pp: false, l6 };
        });
    }

    function buildBigRoad(roundsBP) {
        const rows = 6;
        const grid = [];
        for (let r = 0; r < rows; r++) grid.push({});

        let curCol = -1;
        let curRow = -1;
        let curColor = null;
        let curStartCol = -1;
        let maxCol = -1;

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
        for (let i = 0; i < roundsBP.length; i++) {
            const rd = roundsBP[i];
            if (rd.r === 'T') {
                const lc = lastCell();
                if (lc) lc.tie = (lc.tie || 0) + 1;
                else tieQueueOnStart += 1;
                continue;
            }
            const pos = placeNext(rd.r);
            const cell = {
                r: rd.r,
                tie: 0,
                l6: !!rd.l6,
                idx: i,
            };
            if (tieQueueOnStart > 0 && curCol === 0 && curRow === 0 && pos.row === 0 && pos.col === 0) {
                cell.tie = tieQueueOnStart;
                tieQueueOnStart = 0;
            }
            putCell(pos.row, pos.col, cell);
        }

        return { grid, cols: maxCol + 1, rows };
    }

    function showRoadMapDialog() {
        if (typeof currentRounds === 'undefined' || !Array.isArray(currentRounds) || currentRounds.length === 0) {
            if (typeof log === 'function') log('沒有牌靴資料,請先生成或匯入', 'warn');
            else alert('沒有牌靴資料');
            return;
        }
        if (document.querySelector('.roadmap-dialog-overlay')) return;

        const roundsBP = roundsToBacRoad(currentRounds);
        const big = buildBigRoad(roundsBP);
        const totalCols = Math.max(40, big.cols + 2);

        const dialog = document.createElement('div');
        dialog.className = 'roadmap-dialog-overlay';
        const stats = roundsBP.reduce((acc, r) => {
            if (r.r === 'B') acc.B++;
            else if (r.r === 'P') acc.P++;
            else acc.T++;
            if (r.l6) acc.L6++;
            return acc;
        }, { B: 0, P: 0, T: 0, L6: 0 });

        dialog.innerHTML = `
            <div class="roadmap-dialog">
                <div class="rmap-header">
                    <div class="rmap-brand">正版路單 — 大路</div>
                    <div class="rmap-stats">
                        共 ${roundsBP.length} 局 ｜
                        <span class="rmap-st-b">莊 ${stats.B}</span> ｜
                        <span class="rmap-st-p">閒 ${stats.P}</span> ｜
                        <span class="rmap-st-t">和 ${stats.T}</span> ｜
                        <span class="rmap-st-l6">幸運6 ${stats.L6}</span>
                    </div>
                    <button class="rmap-close" type="button">✕</button>
                </div>
                <div class="rmap-body">
                    <div class="rmap-board" style="--cols:${totalCols}"></div>
                </div>
            </div>
        `;
        document.body.appendChild(dialog);

        // 注入樣式
        if (!document.getElementById('roadmap-dialog-styles')) {
            const style = document.createElement('style');
            style.id = 'roadmap-dialog-styles';
            style.textContent = `
                .roadmap-dialog-overlay {
                    position: fixed; inset: 0;
                    background: rgba(0,0,0,0.6);
                    display: flex; align-items: center; justify-content: center;
                    z-index: 10001;
                    font-family: 'Microsoft JhengHei', sans-serif;
                }
                .roadmap-dialog {
                    background: #fdf3df;
                    border: 4px solid #c41e3a;
                    border-radius: 6px;
                    width: 96vw; max-width: 1500px;
                    max-height: 90vh;
                    overflow: hidden;
                    display: flex; flex-direction: column;
                    box-shadow: 0 12px 40px rgba(0,0,0,0.5);
                }
                .rmap-header {
                    display: flex; align-items: center; justify-content: space-between;
                    padding: 10px 16px;
                    background: #c41e3a; color: #fff;
                    border-bottom: 2px solid #8a1226;
                }
                .rmap-brand { font-size: 18px; font-weight: bold; letter-spacing: 2px; }
                .rmap-stats { font-size: 14px; }
                .rmap-stats .rmap-st-b { color: #ffe5e5; }
                .rmap-stats .rmap-st-p { color: #d6e9ff; }
                .rmap-stats .rmap-st-t { color: #d8f5d8; }
                .rmap-stats .rmap-st-l6 { color: #fff7c2; }
                .rmap-close {
                    background: rgba(255,255,255,0.18); color: #fff;
                    border: none; font-size: 18px;
                    width: 30px; height: 30px; border-radius: 50%;
                    cursor: pointer;
                }
                .rmap-close:hover { background: rgba(255,255,255,0.32); }
                .rmap-body {
                    overflow: auto; padding: 12px;
                    background: #fdf3df;
                }
                .rmap-board {
                    display: grid;
                    grid-template-rows: repeat(6, 32px);
                    grid-template-columns: repeat(var(--cols, 40), 32px);
                    gap: 0;
                    background: #fffbe9;
                    border: 1px solid #c8a978;
                }
                .rmap-board > .rmap-grid-cell {
                    border-right: 1px solid #e8d9b8;
                    border-bottom: 1px solid #e8d9b8;
                    box-sizing: border-box;
                    position: relative;
                }
                .rmap-board > .rmap-cell {
                    width: 32px; height: 32px;
                    display: flex; align-items: center; justify-content: center;
                    box-sizing: border-box;
                    z-index: 2;
                    position: relative;
                }
                .rmap-circle {
                    width: 26px; height: 26px;
                    border-radius: 50%;
                    background: transparent;
                    box-sizing: border-box;
                    position: relative;
                }
                .rmap-circle.banker { border: 3px solid #c41e3a; }
                .rmap-circle.player { border: 3px solid #1e7fc4; }
                .rmap-circle.l6 {
                    background: radial-gradient(circle, #ffd54f 60%, transparent 65%);
                }
                .rmap-circle.l6::after {
                    content: '6';
                    position: absolute;
                    top: 50%; left: 50%;
                    transform: translate(-50%, -50%);
                    color: #6b3a00;
                    font-size: 12px;
                    font-weight: bold;
                }
                .rmap-tie-line {
                    position: absolute;
                    width: 32px; height: 32px;
                    pointer-events: none;
                }
                .rmap-tie-line::before {
                    content: '';
                    position: absolute;
                    top: 50%; left: 0;
                    width: 100%; height: 2px;
                    background: #2e8b57;
                    transform: rotate(-45deg);
                    transform-origin: center;
                }
                .rmap-tie-count {
                    position: absolute;
                    top: 1px; right: 2px;
                    font-size: 9px;
                    color: #2e8b57;
                    font-weight: bold;
                }
            `;
            document.head.appendChild(style);
        }

        // 渲染:先畫底層格線(每格一個 div),再疊上 cell 圓圈
        const board = dialog.querySelector('.rmap-board');
        // 底層格線:6 列 × totalCols 欄
        for (let row = 0; row < 6; row++) {
            for (let col = 0; col < totalCols; col++) {
                const c = document.createElement('div');
                c.className = 'rmap-grid-cell';
                c.style.gridRow = row + 1;
                c.style.gridColumn = col + 1;
                board.appendChild(c);
            }
        }
        // 疊上 cell
        for (let row = 0; row < big.rows; row++) {
            for (const colKey in big.grid[row]) {
                const cell = big.grid[row][colKey];
                if (!cell) continue;
                const wrap = document.createElement('div');
                wrap.className = 'rmap-cell';
                wrap.style.gridRow = row + 1;
                wrap.style.gridColumn = (Number(colKey) + 1);

                const circle = document.createElement('div');
                circle.className = 'rmap-circle ' + (cell.r === 'B' ? 'banker' : 'player');
                if (cell.l6) circle.classList.add('l6');
                wrap.appendChild(circle);

                if (cell.tie > 0) {
                    const tieLine = document.createElement('div');
                    tieLine.className = 'rmap-tie-line';
                    wrap.appendChild(tieLine);
                    if (cell.tie > 1) {
                        const cnt = document.createElement('div');
                        cnt.className = 'rmap-tie-count';
                        cnt.textContent = cell.tie;
                        wrap.appendChild(cnt);
                    }
                }
                board.appendChild(wrap);
            }
        }

        // 關閉
        const close = () => dialog.remove();
        dialog.querySelector('.rmap-close').addEventListener('click', close);
        dialog.addEventListener('click', (e) => { if (e.target === dialog) close(); });
        document.addEventListener('keydown', function escClose(e) {
            if (e.key === 'Escape') {
                close();
                document.removeEventListener('keydown', escClose);
            }
        });
    }

    function renderInlineRoadmap() {
        const container = document.getElementById('inlineRoadmapContainer');
        if (!container) return;
        if (typeof currentRounds === 'undefined' || !Array.isArray(currentRounds) || currentRounds.length === 0) {
            container.innerHTML = '';
            return;
        }

        const roundsBP = roundsToBacRoad(currentRounds);
        const big = buildBigRoad(roundsBP);
        const cellSize = 26;
        const totalCols = Math.max(43, big.cols + 5);

        const stats = roundsBP.reduce((acc, r) => {
            if (r.r === 'B') acc.B++;
            else if (r.r === 'P') acc.P++;
            else acc.T++;
            if (r.l6) acc.L6++;
            return acc;
        }, { B: 0, P: 0, T: 0, L6: 0 });

        container.innerHTML = '';

        const row = document.createElement('div');
        row.className = 'irmap-row';

        const statsPanel = document.createElement('div');
        statsPanel.className = 'irmap-stats';
        statsPanel.innerHTML = `
            <div>共 ${roundsBP.length} 局</div>
            <div class="rmap-st-b">莊 ${stats.B}</div>
            <div class="rmap-st-p">閒 ${stats.P}</div>
            <div class="rmap-st-t">和 ${stats.T}</div>
            <div class="rmap-st-l6">幸運6 ${stats.L6}</div>
        `;
        row.appendChild(statsPanel);

        const boardWrap = document.createElement('div');
        boardWrap.className = 'irmap-board-wrap';
        const board = document.createElement('div');
        board.className = 'irmap-board';
        board.style.cssText = `grid-template-rows:repeat(6,${cellSize}px);grid-template-columns:repeat(${totalCols},${cellSize}px);`;
        boardWrap.appendChild(board);
        row.appendChild(boardWrap);
        container.appendChild(row);

        for (let row = 0; row < 6; row++) {
            for (let col = 0; col < totalCols; col++) {
                const c = document.createElement('div');
                c.className = 'irmap-grid-cell';
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
                wrap.className = 'irmap-cell';
                wrap.style.gridRow = row + 1;
                wrap.style.gridColumn = (Number(colKey) + 1);

                const circle = document.createElement('div');
                circle.className = 'irmap-circle ' + (cell.r === 'B' ? 'banker' : 'player');
                if (cell.l6) circle.classList.add('l6');
                wrap.appendChild(circle);

                if (cell.tie > 0) {
                    const tieLine = document.createElement('div');
                    tieLine.className = 'irmap-tie-line';
                    wrap.appendChild(tieLine);
                    if (cell.tie > 1) {
                        const cnt = document.createElement('div');
                        cnt.className = 'irmap-tie-count';
                        cnt.textContent = cell.tie;
                        wrap.appendChild(cnt);
                    }
                }
                board.appendChild(wrap);
            }
        }
    }

    // 公開
    window.showRoadMapDialog = showRoadMapDialog;
    window.renderInlineRoadmap = renderInlineRoadmap;
})();
