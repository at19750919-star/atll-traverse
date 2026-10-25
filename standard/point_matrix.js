// 點數對戰矩陣彈窗：莊、閒最終點數組合的理論機率與每靴平均次數（8 副）＋ 4/5/6張敏感局點數結果矩陣與明細
// 資料來源：Wizard of Odds, Baccarat Appendix 1；次數＝機率 × 每靴平均局數
(function () {
    'use strict';
    const ROUNDS_PER_SHOE = 80.99;
    const SENSITIVE_TOTAL = 41970;
    // 列＝莊 0～9，欄＝閒 0～9，單位 %
    const PCT = [
        [0.580, 0.493, 0.484, 0.475, 0.493, 0.505, 1.148, 1.167, 1.764, 1.768],
        [0.486, 0.410, 0.402, 0.393, 0.411, 0.423, 0.980, 0.999, 1.211, 1.213],
        [0.484, 0.410, 0.400, 0.391, 0.409, 0.421, 0.978, 0.996, 1.207, 1.208],
        [0.539, 0.464, 0.455, 0.445, 0.411, 0.422, 0.980, 0.999, 1.294, 1.267],
        [0.921, 0.812, 0.772, 0.763, 0.726, 0.687, 1.031, 0.997, 1.290, 1.345],
        [0.924, 0.815, 0.858, 0.903, 0.836, 0.794, 1.139, 1.106, 1.347, 1.349],
        [0.973, 0.812, 0.856, 0.900, 0.916, 0.929, 1.924, 1.899, 1.448, 1.450],
        [1.082, 0.921, 0.911, 0.903, 0.920, 0.932, 2.018, 2.035, 1.559, 1.561],
        [1.702, 1.156, 1.144, 1.138, 1.153, 1.167, 1.560, 1.582, 1.098, 1.104],
        [1.708, 1.159, 1.148, 1.141, 1.156, 1.171, 1.565, 1.587, 1.106, 1.103],
    ];
    const BANKER_TOTAL = [8.878, 6.928, 6.905, 7.278, 9.343, 10.070, 12.108, 12.843, 12.803, 12.844];
    // 每局張數：機率與每靴平均局數（8 副）
    const SIZES = [[4, 37.89, 30.7], [5, 30.34, 24.6], [6, 31.77, 25.7]];
    const PLAYER_TOTAL = [9.399, 7.453, 7.432, 7.453, 7.431, 7.451, 13.323, 13.367, 13.324, 13.369];

    const cell = (pct, cls) => `<td class="${cls || ''}"><span class="pm-count">${(pct * ROUNDS_PER_SHOE / 100).toFixed(2)}次</span><span class="pm-pct">${pct.toFixed(3)}%</span></td>`;

    let cachedSensitive = null;
    const blobUrls = new Map();

    function sim4(c0, c1, c2, c3) {
        const pp = (c0 + c2) % 10;
        const bb = (c1 + c3) % 10;
        if (pp >= 8 || bb >= 8 || (pp >= 6 && bb >= 6)) {
            const out = pp > bb ? 1 : bb > pp ? 2 : 0;
            return { size: 4, pp, bb, out };
        }
        return { size: 0, pp, bb };
    }

    function sim56(pp0, bb0, c4, c5, has6) {
        let pp = pp0, bb = bb0, size = 4;
        if (pp <= 5) {
            const p3 = c4;
            pp = (pp + p3) % 10;
            let bd = false;
            if (bb <= 2) bd = true;
            else if (bb === 3) bd = (p3 !== 8);
            else if (bb === 4) bd = (p3 >= 2 && p3 <= 7);
            else if (bb === 5) bd = (p3 >= 4 && p3 <= 7);
            else if (bb === 6) bd = (p3 === 6 || p3 === 7);
            if (bd) {
                if (!has6) return null;
                bb = (bb + c5) % 10;
                size = 6;
            } else {
                size = 5;
            }
        } else {
            bb = (bb + c4) % 10;
            size = 5;
        }
        const out = pp > bb ? 1 : bb > pp ? 2 : 0;
        return { size, pp, bb, out };
    }

    function sensitiveOutcomeMatch(o1, o2) {
        if (o1 === 0 && o2 === 0) return true;
        return (o1 === 1 && o2 === 2) || (o1 === 2 && o2 === 1);
    }

    function ensureSensitiveData() {
        if (cachedSensitive) return cachedSensitive;
        const groups = Array.from({ length: 10 }, (_, b) =>
            Array.from({ length: 10 }, (_, p) => ({
                banker: b,
                player: p,
                outcome: b > p ? '莊贏' : p > b ? '閒贏' : '和局',
                total: 0,
                counts: { '4': 0, '5': 0, '6': 0 },
                hands: { '4': [], '5': [], '6': [] }
            }))
        );
        const rowTotals = Array.from({ length: 10 }, () => ({ total: 0, counts: { '4': 0, '5': 0, '6': 0 } }));
        const colTotals = Array.from({ length: 10 }, () => ({ total: 0, counts: { '4': 0, '5': 0, '6': 0 } }));

        function add(b, p, lenStr, code) {
            const g = groups[b][p];
            g.hands[lenStr].push(code);
            g.counts[lenStr]++;
            g.total++;
            rowTotals[b].counts[lenStr]++;
            rowTotals[b].total++;
            colTotals[p].counts[lenStr]++;
            colTotals[p].total++;
        }

        for (let c0 = 0; c0 <= 9; c0++) {
            for (let c1 = 0; c1 <= 9; c1++) {
                for (let c2 = 0; c2 <= 9; c2++) {
                    for (let c3 = 0; c3 <= 9; c3++) {
                        const a4 = sim4(c0, c1, c2, c3);
                        const b4 = sim4(c1, c0, c2, c3);
                        if (a4.size === 4 && b4.size === 4) {
                            if (sensitiveOutcomeMatch(a4.out, b4.out)) {
                                add(a4.bb, a4.pp, '4', `${c0}${c1}${c2}${c3}`);
                            }
                            continue;
                        }
                        if (a4.size === 0 && b4.size === 0) {
                            for (let c4 = 0; c4 <= 9; c4++) {
                                const a5 = sim56(a4.pp, a4.bb, c4, 0, false);
                                const b5 = sim56(b4.pp, b4.bb, c4, 0, false);
                                if (a5 && b5 && a5.size === 5 && b5.size === 5) {
                                    if (sensitiveOutcomeMatch(a5.out, b5.out)) {
                                        add(a5.bb, a5.pp, '5', `${c0}${c1}${c2}${c3}${c4}`);
                                    }
                                } else if (!a5 && !b5) {
                                    for (let c5 = 0; c5 <= 9; c5++) {
                                        const a6 = sim56(a4.pp, a4.bb, c4, c5, true);
                                        const b6 = sim56(b4.pp, b4.bb, c4, c5, true);
                                        if (a6 && b6 && a6.size === 6 && b6.size === 6 && sensitiveOutcomeMatch(a6.out, b6.out)) {
                                            add(a6.bb, a6.pp, '6', `${c0}${c1}${c2}${c3}${c4}${c5}`);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        cachedSensitive = { groups, rowTotals, colTotals };
        return cachedSensitive;
    }

    function getBlobUrl(b, p) {
        const key = `${b}_${p}`;
        if (blobUrls.has(key)) return blobUrls.get(key);
        const g = ensureSensitiveData().groups[b][p];
        const payload = {
            score: `${b}:${p}`,
            label: `莊${b}點 : 閒${p}點`,
            outcome: g.outcome,
            total: g.total,
            counts: g.counts,
            hands: g.hands
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        blobUrls.set(key, url);
        return url;
    }

    function renderSensitiveDetail(dlg, b, p, filterLen) {
        const data = ensureSensitiveData();
        const g = data.groups[b][p];
        const mode = filterLen || 'all';
        dlg.querySelectorAll('.pm-sens-cell').forEach(td => {
            td.classList.toggle('active', Number(td.dataset.banker) === b && Number(td.dataset.player) === p);
        });
        const host = dlg.querySelector('#pmSensitiveDetail');
        if (!host) return;
        host.hidden = false;
        const fileName = `莊${b}_閒${p}.json`;
        const diskPath = `D:\\穿越點數範本庫\\敏感局_依點數結果分類\\${fileName}`;
        const blobUrl = getBlobUrl(b, p);
        const lengths = mode === 'all' ? ['4', '5', '6'] : [String(mode)];
        const sectionsHtml = lengths.map(lenStr => {
            const list = g.hands[lenStr] || [];
            if (!list.length) {
                return `<div class="pm-sens-group"><p class="pm-sens-group-title">${lenStr} 張敏感局（0 筆）</p></div>`;
            }
            const badges = list.map(code => {
                const swapped = code[1] + code[0] + code.slice(2);
                return `<span class="pm-sens-code" data-code="${code}" title="點擊複製 ${code}｜對調首兩張 → ${swapped}">${code}</span>`;
            }).join('');
            return `<div class="pm-sens-group">
                <p class="pm-sens-group-title">${lenStr} 張敏感局（共 ${list.length} 筆）</p>
                <div class="pm-sens-codes">${badges}</div>
            </div>`;
        }).join('');

        host.innerHTML = `
            <div class="pm-sens-detail-head">
                <div class="pm-sens-detail-title">敏感局點數結果 — 莊 ${b} 點 : 閒 ${p} 點（${g.outcome}）｜共 ${g.total} 筆</div>
                <div class="pm-sens-detail-actions">
                    <button type="button" class="pm-sens-btn ${mode === 'all' ? 'active' : ''}" data-filter="all">全部 (${g.total})</button>
                    <button type="button" class="pm-sens-btn ${mode === '4' ? 'active' : ''}" data-filter="4">4張 (${g.counts['4']})</button>
                    <button type="button" class="pm-sens-btn ${mode === '5' ? 'active' : ''}" data-filter="5">5張 (${g.counts['5']})</button>
                    <button type="button" class="pm-sens-btn ${mode === '6' ? 'active' : ''}" data-filter="6">6張 (${g.counts['6']})</button>
                    <a class="pm-sens-link" href="${blobUrl}" target="_blank" rel="noopener">開啟 ${fileName} ↗</a>
                    <a class="pm-sens-link" href="${blobUrl}" download="${fileName}">下載 JSON</a>
                </div>
            </div>
            <div class="pm-sens-path">對應分類檔：${diskPath}（點擊下方點數排列可直接複製）</div>
            ${sectionsHtml}`;

        host.querySelectorAll('.pm-sens-btn[data-filter]').forEach(btn => {
            btn.addEventListener('click', () => renderSensitiveDetail(dlg, b, p, btn.dataset.filter));
        });
        host.querySelectorAll('.pm-sens-code').forEach(badge => {
            badge.addEventListener('click', () => {
                const code = badge.dataset.code;
                if (navigator.clipboard?.writeText) navigator.clipboard.writeText(code).catch(() => {});
                const prev = badge.textContent;
                badge.textContent = '已複製';
                setTimeout(() => { badge.textContent = prev; }, 600);
            });
        });
    }

    function buildSensitiveSection() {
        const { groups, rowTotals, colTotals } = ensureSensitiveData();
        const head = '<tr><th scope="col">莊＼閒</th>' + groups[0].map((_, p) => `<th scope="col">${p}</th>`).join('') + '<th scope="col">莊合計</th></tr>';
        const body = groups.map((row, b) => {
            const cells = row.map((g, p) => {
                const pct = (g.total * 100 / SENSITIVE_TOTAL).toFixed(2);
                const cls = b === p ? 'pm-tie' : (b > p ? 'pm-banker-win' : 'pm-player-win');
                return `<td class="pm-sens-cell ${cls}" tabindex="0" role="button" data-banker="${b}" data-player="${p}" title="點擊查看 莊${b}點 : 閒${p}點（4張:${g.counts['4']} / 5張:${g.counts['5']} / 6張:${g.counts['6']}）">
                    <span class="pm-sens-line"><span class="pm-count">${g.total}筆</span><span class="pm-pct">${pct}%</span></span>
                    <span class="pm-sub-sizes">${g.counts['4']}/${g.counts['5']}/${g.counts['6']}</span>
                </td>`;
            }).join('');
            const rt = rowTotals[b];
            const rPct = (rt.total * 100 / SENSITIVE_TOTAL).toFixed(2);
            const rTotalCell = `<td class="pm-total"><span class="pm-sens-line"><span class="pm-count">${rt.total}筆</span><span class="pm-pct">${rPct}%</span></span><span class="pm-sub-sizes">${rt.counts['4']}/${rt.counts['5']}/${rt.counts['6']}</span></td>`;
            return `<tr><th scope="row">${b}</th>${cells}${rTotalCell}</tr>`;
        }).join('');
        const footCells = colTotals.map(ct => {
            const cPct = (ct.total * 100 / SENSITIVE_TOTAL).toFixed(2);
            return `<td class="pm-total"><span class="pm-sens-line"><span class="pm-count">${ct.total}筆</span><span class="pm-pct">${cPct}%</span></span><span class="pm-sub-sizes">${ct.counts['4']}/${ct.counts['5']}/${ct.counts['6']}</span></td>`;
        }).join('');
        const grandCell = `<td class="pm-total"><span class="pm-sens-line"><span class="pm-count">${SENSITIVE_TOTAL}筆</span><span class="pm-pct">100.0%</span></span><span class="pm-sub-sizes">760/5430/35780</span></td>`;
        const foot = `<tr><th scope="row">閒合計</th>${footCells}${grandCell}</tr>`;

        return `
            <div class="pm-sens-section" id="pmSensitiveSection">
                <div class="pm-subhead">
                    <h4>敏感局點數結果矩陣（4／5／6 張，共 41,970 筆）</h4>
                </div>
                <p class="pm-note">每格：該「莊 : 閒」最終點數的敏感局總數／佔比，下排小字為「4張／5張／6張」筆數。點擊任一格可展開對應點數排列清單並開啟 <code>莊X_閒Y.json</code>。</p>
                <div class="pm-scroll"><table class="pm-table pm-sens-table" id="pmSensitiveTable"><thead>${head}</thead><tbody>${body}</tbody><tfoot>${foot}</tfoot></table></div>
                <div class="pm-sens-detail" id="pmSensitiveDetail" hidden></div>
            </div>`;
    }

    function build() {
        const dlg = document.createElement('dialog');
        dlg.id = 'pointMatrixDialog';
        dlg.className = 'pm-dialog';
        dlg.setAttribute('aria-labelledby', 'pointMatrixTitle');
        const head = '<tr><th scope="col">莊＼閒</th>' + PCT.map((_, p) => `<th scope="col">${p}</th>`).join('') + '<th scope="col">莊合計</th></tr>';
        const body = PCT.map((row, b) => `<tr><th scope="row">${b}</th>`
            + row.map((v, p) => cell(v, b === p ? 'pm-tie' : '')).join('')
            + cell(BANKER_TOTAL[b], 'pm-total') + '</tr>').join('');
        const foot = '<tr><th scope="row">閒合計</th>' + PLAYER_TOTAL.map(v => cell(v, 'pm-total')).join('') + cell(100, 'pm-total') + '</tr>';
        dlg.innerHTML = `
            <div class="pm-head">
                <h3 id="pointMatrixTitle">點數對戰矩陣</h3>
                <button type="button" class="pm-close" aria-label="關閉">✕</button>
            </div>
            <p class="pm-note">每格：每靴平均出現次數（8 副、每靴平均 ${ROUNDS_PER_SHOE} 局）／機率。列為莊點數、欄為閒點數，對角線為和局。</p>
            <div class="pm-scroll"><table class="pm-table"><thead>${head}</thead><tbody>${body}</tbody><tfoot>${foot}</tfoot></table></div>
            <table class="pm-table pm-sizes"><thead><tr><th scope="col">每局張數</th><th scope="col">機率（8 副）</th><th scope="col">每靴局數（8 副）</th></tr></thead>
            <tbody>${SIZES.map(([n, pct, per]) => `<tr><th scope="row">${n} 張</th><td>${pct.toFixed(2)}%</td><td>${per.toFixed(1)}</td></tr>`).join('')}</tbody>
            <tfoot><tr><th scope="row">合計</th><td class="pm-total">100.00%</td><td class="pm-total">81.0</td></tr></tfoot></table>
            <p class="pm-note">莊贏 45.86%（37.1 次）／閒贏 44.62%（36.1 次）／和局 9.52%（7.7 次）　來源：Wizard of Odds, Baccarat Appendix 1</p>
            ${buildSensitiveSection()}`;
        dlg.querySelector('.pm-close').addEventListener('click', () => dlg.close());
        dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
        dlg.querySelectorAll('.pm-sens-cell').forEach(td => {
            const selectCell = () => {
                const b = Number(td.dataset.banker);
                const p = Number(td.dataset.player);
                renderSensitiveDetail(dlg, b, p, 'all');
                dlg.querySelector('#pmSensitiveDetail')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            };
            td.addEventListener('click', selectCell);
            td.addEventListener('keydown', e => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    selectCell();
                }
            });
        });
        document.body.appendChild(dlg);
        return dlg;
    }

    function open() {
        const dlg = document.getElementById('pointMatrixDialog') || build();
        if (!dlg.open) dlg.showModal();
    }

    window.openPointMatrix = open;
    const bind = () => {
        const btn = document.getElementById('btnPointMatrix');
        if (btn && !btn.dataset.pmBound) { btn.dataset.pmBound = '1'; btn.addEventListener('click', open); }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind); else bind();
})();
