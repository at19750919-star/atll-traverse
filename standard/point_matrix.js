// 點數對戰矩陣彈窗：莊、閒最終點數組合的理論機率與每靴平均次數（8 副）
// 資料來源：Wizard of Odds, Baccarat Appendix 1；次數＝機率 × 每靴平均局數
(function () {
    'use strict';
    const ROUNDS_PER_SHOE = 80.99;
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
            <p class="pm-note">莊贏 45.86%（37.1 次）／閒贏 44.62%（36.1 次）／和局 9.52%（7.7 次）　來源：Wizard of Odds, Baccarat Appendix 1</p>`;
        dlg.querySelector('.pm-close').addEventListener('click', () => dlg.close());
        dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
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
