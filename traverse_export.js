// ============================================================
// 穿越排牌：發牌、切牌、Excel 導出
// Excel 格式照搬百家3.0 exportRoundsAsExcelWithDrive（預覽／原始數據／直立式牌靴／回復分析統計）
// 不檢查卡色與訊號牌：色序依花色（♥♦=R、♠♣=B），訊號欄留空
// ============================================================

(function (global) {
    'use strict';

    const PREVIEW_GRID_COLS = 21;
    const PREVIEW_GRID_ROWS = 31;
    const PREVIEW_GRID_GROUP = 7;

    function pointOf(card) {
        if (typeof card.point === 'number') return card.point;
        if (card.rank === 'A') return 1;
        if (['10', 'J', 'Q', 'K'].includes(card.rank)) return 0;
        return parseInt(card.rank, 10);
    }

    // 一局的閒/莊分牌與點數；牌不夠回傳 null
    function dealHand(points, start, limit) {
        if (start + 4 > limit) return null;
        const P = [start, start + 2];
        const B = [start + 1, start + 3];
        let pp = (points[start] + points[start + 2]) % 10;
        let bb = (points[start + 1] + points[start + 3]) % 10;
        if (pp < 8 && bb < 8) {
            if (pp <= 5) {
                if (start + 5 > limit) return null;
                const p3 = points[start + 4];
                P.push(start + 4);
                pp = (pp + p3) % 10;
                let bd;
                if (bb <= 2) bd = true;
                else if (bb === 3) bd = p3 !== 8;
                else if (bb === 4) bd = p3 >= 2 && p3 <= 7;
                else if (bb === 5) bd = p3 >= 4 && p3 <= 7;
                else if (bb === 6) bd = p3 === 6 || p3 === 7;
                else bd = false;
                if (bd) {
                    if (start + 6 > limit) return null;
                    B.push(start + 5);
                    bb = (bb + points[start + 5]) % 10;
                }
            } else if (bb <= 5) {
                if (start + 5 > limit) return null;
                B.push(start + 4);
                bb = (bb + points[start + 4]) % 10;
            }
        }
        const result = pp > bb ? '閒' : (bb > pp ? '莊' : '和');
        return { P, B, pp, bb, result, size: P.length + B.length };
    }

    // 純發牌：從頭發到尾，最後不足一局的牌成為「殘牌」局
    function dealRounds(cards) {
        const points = cards.map(pointOf);
        const rounds = [];
        let cur = 0;
        while (cur < cards.length) {
            const d = dealHand(points, cur, cards.length);
            if (!d) {
                rounds.push({ cards: cards.slice(cur), result: '殘牌', start: cur, hand: null });
                break;
            }
            const roundCards = cards.slice(cur, cur + d.size);
            rounds.push({
                cards: roundCards,
                result: d.result,
                start: cur,
                hand: d,
                segment: roundCards.every(c => c.traverse) ? 'A' : '',
            });
            cur += d.size;
        }
        return rounds;
    }

    // 切牌：cutPos=N 代表從原本第 N+1 張開始發（與百家3.0 performCut 相同）
    function cutDeck(cards, cutPos) {
        const n = cards.length;
        const out = [];
        for (let i = 0; i < n; i++) out.push(cards[(i + cutPos) % n]);
        return out;
    }

    // 對調第一、二張後的莊閒點數
    function swappedTotals(round) {
        if (!round.hand) return null;
        const pts = round.cards.map(pointOf);
        [pts[0], pts[1]] = [pts[1], pts[0]];
        return dealHand(pts, 0, pts.length);
    }

    const cardLabel = (c) => `${c.rank === '10' ? 'T' : c.rank}${c.suit}`;
    const colorCode = (c) => (c.suit === '♥' || c.suit === '♦') ? 'R' : 'B';
    function gridValue(c) {
        if (c.rank === 'A') return '1';
        if (['10', 'J', 'Q', 'K'].includes(c.rank)) return '0';
        return c.rank;
    }

    function buildPreviewGrid(rounds) {
        const COLS = PREVIEW_GRID_COLS;
        const ROWS = PREVIEW_GRID_ROWS;
        const ROUND_COLS = 7;
        const ROUNDS_PER_ROW = COLS / ROUND_COLS;
        const MAX_ROUNDS = ROWS * ROUNDS_PER_ROW;
        const grid = Array.from({ length: COLS * ROWS }, () => ({ className: 'cell', value: '' }));
        const total = Math.min(rounds.length, MAX_ROUNDS);
        for (let ri = 0; ri < total; ri++) {
            const round = rounds[ri];
            const base = Math.floor(ri / ROUNDS_PER_ROW) * COLS + (ri % ROUNDS_PER_ROW) * ROUND_COLS;
            const resultCls = { '莊': ['result-banker', 'O'], '閒': ['result-player', 'X'], '和': ['result-tie', '和'] }[round.result];
            grid[base] = resultCls
                ? { className: `cell result-cell ${resultCls[0]}`, value: resultCls[1] }
                : { className: 'cell result-cell', value: '' };
            round.cards.forEach((card, ci) => {
                if (ci >= ROUND_COLS - 1) return;
                grid[base + 1 + ci] = {
                    className: `cell ${colorCode(card) === 'R' ? 'card-red' : 'card-blue'}`,
                    value: gridValue(card),
                };
            });
        }
        return grid;
    }

    // 回復分析：每個切牌點發到第幾局會回到原本的局起點（與百家3.0 analyzeShoeRecovery 相同）
    function analyzeShoeRecovery(rounds) {
        const roundStarts = new Set();
        let total = 0;
        for (const r of rounds) { roundStarts.add(total); total += r.cards.length; }
        const deckPoints = rounds.flatMap(r => r.cards.map(pointOf));
        const maxSimRounds = rounds.length * 2;
        const details = [];
        for (let cut = 0; cut < total; cut++) {
            if (roundStarts.has(cut)) {
                details.push({ cutPoint: cut, roundsUsed: 0, cardsUsed: 0, immediate: true });
                continue;
            }
            const pts = [];
            for (let i = 0; i < total; i++) pts.push(deckPoints[(cut + i) % total]);
            let idx = 0, roundsUsed = 0, recovered = false;
            while (idx < total && roundsUsed < maxSimRounds) {
                const d = dealHand(pts, idx, total);
                if (!d) break;
                idx += d.size;
                roundsUsed++;
                if (roundStarts.has((cut + idx) % total)) { recovered = true; break; }
            }
            details.push({ cutPoint: cut, roundsUsed, cardsUsed: idx, immediate: false, failed: !recovered });
        }
        return details;
    }

    async function buildWorkbook(rounds) {
        if (typeof ExcelJS === 'undefined' || !ExcelJS.Workbook) throw new Error('ExcelJS 載入失敗');
        const deckCards = rounds.flatMap(r => r.cards);
        const wb = new ExcelJS.Workbook();

        // === 工作表1：預覽 ===
        const ws1 = wb.addWorksheet('預覽');
        const COLS = PREVIEW_GRID_COLS, ROWS = PREVIEW_GRID_ROWS, GROUP = PREVIEW_GRID_GROUP;
        const totalSheetCols = COLS + Math.floor((COLS - 1) / GROUP);
        const lastColStr = String.fromCharCode(64 + totalSheetCols);
        ws1.properties.defaultRowHeight = 56;
        ws1.pageSetup = {
            paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 1,
            horizontalCentered: true, verticalCentered: false,
            margins: { left: 0.15, right: 0.15, top: 0.15, bottom: 0.15, header: 0.0, footer: 0.0 },
        };
        const widths = [];
        for (let c = 0; c < COLS; c++) {
            widths.push(9);
            if ((c + 1) % GROUP === 0 && c < COLS - 1) widths.push(1.5);
        }
        widths.forEach((w, i) => { ws1.getColumn(i + 1).width = w; });
        ws1.pageSetup.printArea = `A1:${lastColStr}${ROWS}`;
        const borderThin = { style: 'thin', color: { argb: 'FF333333' } };
        const grid = buildPreviewGrid(rounds);
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const sheetCol = c + 1 + Math.floor(c / GROUP);
                const cellData = grid[r * COLS + c];
                const cell = ws1.getCell(r + 1, sheetCol);
                cell.value = cellData.value || '';
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
                cell.font = { name: 'Microsoft JhengHei', size: 36, bold: true, color: { argb: 'FF000000' } };
                cell.border = { top: borderThin, left: borderThin, bottom: borderThin, right: borderThin };
                const cls = cellData.className;
                if (cls.includes('result-')) {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
                } else if (cls.includes('card-red')) {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
                } else if (cls.includes('card-blue')) {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00CFCF' } };
                    cell.font = { ...cell.font, color: { argb: 'FFFFFFFF' } };
                }
                if (cls.includes('result-banker')) cell.font = { ...cell.font, color: { argb: 'FFCC0000' } };
                else if (cls.includes('result-player')) cell.font = { ...cell.font, color: { argb: 'FF0033AA' } };
                else if (cls.includes('result-tie')) cell.font = { ...cell.font, color: { argb: 'FF006633' } };
            }
        }

        // === 工作表2：原始數據 ===
        const ws2 = wb.addWorksheet('原始數據');
        ws2.addRow(['局號', '段標', '色序', '卡片1', '卡片2', '卡片3', '卡片4', '卡片5', '卡片6', '結果', '莊', '閒', '訊號', '對調莊', '對調閒']);
        const headerRow = ws2.getRow(1);
        headerRow.font = { bold: true };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F3FF' } };
        rounds.forEach((round, idx) => {
            const row = [idx + 1, round.segment || '', round.cards.map(colorCode).join('')];
            for (let i = 0; i < 6; i++) row.push(round.cards[i] ? cardLabel(round.cards[i]) : '');
            row.push(round.result || '');
            row.push(round.hand ? round.hand.bb : '');
            row.push(round.hand ? round.hand.pp : '');
            row.push('');
            const sw = swappedTotals(round);
            row.push(sw ? sw.bb : '');
            row.push(sw ? sw.pp : '');
            ws2.addRow(row);
        });
        ws2.columns.forEach(col => { col.width = 12; });
        ws2.eachRow(row => {
            row.eachCell({ includeEmpty: true }, cell => {
                cell.font = Object.assign({}, cell.font || {}, { size: 14 });
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
            });
        });

        // === 工作表3：直立式牌靴 ===
        const ws3 = wb.addWorksheet('直立式牌靴');
        deckCards.forEach((card, i) => {
            const dataRow = ws3.addRow([i + 1, cardLabel(card)]);
            const cardCell = dataRow.getCell(2);
            cardCell.alignment = { vertical: 'middle', horizontal: 'center' };
            cardCell.font = { size: 16, bold: true, color: { argb: 'FF000000' } };
            cardCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colorCode(card) === 'R' ? 'FFFFFF00' : 'FF00FFFF' } };
            const posCell = dataRow.getCell(1);
            posCell.alignment = { vertical: 'middle', horizontal: 'center' };
            posCell.font = { size: 11 };
        });
        ws3.getColumn(1).width = 8;
        ws3.getColumn(2).width = 10;

        // === 工作表4：回復分析統計 ===
        const ws4 = wb.addWorksheet('回復分析統計');
        const totalRounds = rounds.length;
        const count = (n) => rounds.filter(r => r.cards.length === n).length;
        const pct = (k) => totalRounds > 0 ? ((k / totalRounds) * 100).toFixed(1) : '0.0';
        const c4 = count(4), c5 = count(5), c6 = count(6);
        ws4.addRow(['局數統計', '局數', '比例', '備註']);
        ws4.addRow(['4張局', c4, `${pct(c4)}%`, `${c4}/${totalRounds}`]);
        ws4.addRow(['5張局', c5, `${pct(c5)}%`, `${c5}/${totalRounds}`]);
        ws4.addRow(['6張局', c6, `${pct(c6)}%`, `${c6}/${totalRounds}`]);
        ws4.addRow([]);
        const headerIdx = ws4.rowCount + 1;
        ws4.addRow(['切牌點位置', '回復局數', '消耗牌數', '是否立即回復']);
        const h4 = ws4.getRow(headerIdx);
        h4.font = { bold: true };
        h4.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F3FF' } };
        analyzeShoeRecovery(rounds).forEach(d => {
            ws4.addRow([d.cutPoint + 1, d.roundsUsed, d.cardsUsed, d.immediate ? '是' : (d.failed ? '失敗' : '否')]);
        });
        ws4.getColumn(1).width = 12;
        ws4.getColumn(2).width = 12;
        ws4.getColumn(3).width = 12;
        ws4.getColumn(4).width = 15;

        const buffer = await wb.xlsx.writeBuffer();
        return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    }

    global.TraverseExport = { dealHand, dealRounds, cutDeck, swappedTotals, buildWorkbook, analyzeShoeRecovery, cardLabel };

})(typeof window !== 'undefined' ? window : globalThis);
