// 匯入狀態保留到使用者關閉；不以估算百分比冒充實際進度。
const importFeedback = (() => {
    let busy = false;
    let timer;
    let startedAt;
    let panel;
    let button;
    let previousDisabled;
    function ensurePanel() {
        if (panel) return;
        panel = document.createElement('section');
        panel.id = 'importFeedback';
        panel.className = 'gframe';
        panel.hidden = true;
        panel.innerHTML = '<span class="import-status-icon" aria-hidden="true"><span class="import-card">♠</span><span class="import-card">♥</span><span class="import-card">♣</span></span>' +
            '<div class="import-status-copy"><strong id="importStatusTitle" role="status" aria-live="polite"></strong>' +
            '<div id="importStatusDetail"></div><small id="importStatusTime"></small></div>' +
            '<button type="button" aria-label="關閉匯入提示">×</button>';
        panel.querySelector('button').onclick = () => { if (!busy) panel.hidden = true; };
        document.body.appendChild(panel);
    }
    function elapsed() { return Math.floor((Date.now() - startedAt) / 1000); }
    function tick() {
        document.getElementById('importStatusTime').textContent = `已等待 ${elapsed()} 秒` +
            (elapsed() >= 15 ? ' · 處理時間較長，請稍候，無需重複匯入' : '');
    }
    function begin(detail) {
        if (busy) return false;
        ensurePanel();
        busy = true;
        startedAt = Date.now();
        panel.hidden = false;
        panel.dataset.state = 'loading';
        panel.querySelector('button').hidden = true;
        document.getElementById('importStatusTitle').textContent = '準備匯入…';
        document.getElementById('importStatusDetail').textContent = detail;
        button = document.getElementById('btnImport');
        if (button) { previousDisabled = button.disabled; button.disabled = true; }
        tick();
        timer = setInterval(tick, 1000);
        return true;
    }
    async function stage(title) {
        document.getElementById('importStatusTitle').textContent = title;
        // 讓瀏覽器先畫出狀態，再開始下一段同步工作。
        await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
    }
    function finish(state, title, detail) {
        clearInterval(timer);
        busy = false;
        if (button) button.disabled = previousDisabled;
        panel.dataset.state = state;
        panel.querySelector('button').hidden = false;
        document.getElementById('importStatusTitle').textContent = title;
        document.getElementById('importStatusDetail').textContent = detail;
        document.getElementById('importStatusTime').textContent = `耗時 ${elapsed()} 秒`;
    }
    function hide() {
        finish('success', '', '');
        panel.hidden = true;
    }
    return { begin, stage, finish, hide };
})();
