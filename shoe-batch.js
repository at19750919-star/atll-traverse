// 一次連續生成多副：條數 ≥2 時按生成會連跑，每副要走完原本生成流程且成功（shoe-generated）才收進清單；
// 停止或失敗的那副不算。牌靴總覽標題列可切換上一副／下一副、導出目前這副或全部、刪除不要的那副。
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const COUNT_KEY = 'integrated-batch-count', MAX = 100;
  const MODE_IDS = ['modeRed0','modeA2','modeTraverse','modeTraverseA2','modeAllSens','modeAllSensA2'];
  const M = () => window.IntegratedModes;
  const busy = () => !!(M().busy || window.__isGeneratingShoe || $('generateBtn').disabled);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  let list = [], index = -1, key = null, running = false, stopReq = false, exporting = false, internal = false, note = '', prog = '', armTimer = 0;

  function readCount() {
    const n = Math.floor(Number($('batchCount').value));
    return Number.isFinite(n) && n >= 1 ? Math.min(n, MAX) : 1;
  }
  const sameMode = () => key !== null && key === M().shoeKey;
  // 離開目前這副前把畫面上的狀態（含切牌、編輯）存回清單
  function saveCurrent() { if (index >= 0 && sameMode() && !busy()) list[index] = M().captureShoe(); }
  function reset() { list = []; index = -1; key = null; note = ''; update(); }

  function generateOne() {
    return new Promise(resolve => {
      let ok = false, started = false; const t0 = Date.now();
      const onDone = () => { ok = true; };
      document.addEventListener('shoe-generated', onDone);
      internal = true; try { $('chipGen').click(); } finally { internal = false; }
      const tick = () => {
        if (busy()) started = true;
        if ((started && !busy()) || (!started && Date.now() - t0 > 1500)) {
          document.removeEventListener('shoe-generated', onDone); resolve({ ok, started }); return;
        }
        setTimeout(tick, 150);
      };
      setTimeout(tick, 30);
    });
  }

  async function run(total) {
    list = []; index = -1; key = M().shoeKey; running = true; stopReq = false; note = '';
    document.body.classList.add('batch-running'); update();
    await wait(0); // 等使用者這次點擊事件結束，按鈕才能再被程式點一次
    let fails = 0;
    while (list.length < total && !stopReq) {
      saveCurrent();
      update(`第 ${list.length + 1}／${total} 副`);
      const r = await generateOne();
      if (stopReq) break;
      if (!r.started) { note = '無法開始生成，請檢查設定'; break; }
      if (r.ok) { list.push(null); index = list.length - 1; saveCurrent(); fails = 0; }
      else {
        if (index >= 0) M().restoreShoe(list[index]);
        if (++fails >= 3) { note = '連續 3 次沒有排成，已停止'; break; }
      }
      await wait(60);
    }
    while (busy()) await wait(150);
    // 停止時畫面可能留著沒走完的那副，換回清單最後一副
    if (index >= 0) { if (stopReq) M().restoreShoe(list[index]); else saveCurrent(); }
    running = false; document.body.classList.remove('batch-running');
    if (!note) note = stopReq ? `已停止，完成 ${list.length}／${total} 副` : `完成 ${list.length} 副`;
    update();
    if (list.length && window.ShoeOverview) ShoeOverview.show();
  }

  function go(i) {
    if (running || exporting || busy() || !sameMode() || i < 0 || i >= list.length || i === index) return;
    saveCurrent(); index = i; M().restoreShoe(list[i]); update();
    if (window.ShoeOverview) ShoeOverview.show();
  }

  function waitExport() {
    return (async () => { await wait(30); while (M().busy || $('btnExportCombined').disabled) await wait(150); })();
  }
  async function exportAll() {
    if (running || exporting || busy() || !sameMode() || !list.length) return;
    saveCurrent(); exporting = true; const back = index; update();
    try {
      for (let i = 0; i < list.length; i++) {
        index = i; M().restoreShoe(list[i]); update(`導出 ${i + 1}／${list.length}`);
        $('btnExportCombined').click(); await waitExport();
      }
    } finally {
      index = back; M().restoreShoe(list[back]); exporting = false; update();
      if (window.ShoeOverview) ShoeOverview.show();
    }
  }

  function remove() {
    const b = $('sbDelete');
    if (!b.classList.contains('armed')) {
      b.classList.add('armed'); b.textContent = '確定刪除？';
      clearTimeout(armTimer); armTimer = setTimeout(disarm, 3000); return;
    }
    disarm();
    if (running || exporting || busy() || !sameMode() || index < 0) return;
    list.splice(index, 1);
    if (!list.length) { index = -1; key = null; $('chipClear').click(); note = '已全部刪除'; update(); return; }
    index = Math.min(index, list.length - 1); M().restoreShoe(list[index]); update();
    if (window.ShoeOverview) ShoeOverview.show();
  }
  function disarm() { clearTimeout(armTimer); const b = $('sbDelete'); if (b) { b.classList.remove('armed'); b.textContent = '刪除'; } }

  function update(progress) {
    if (progress !== undefined) prog = progress;
    const box = $('batchProgress'); if (!box) return;
    const n = list.length, mine = sameMode() && n > 0;
    box.textContent = running ? `連跑 ${prog}` : exporting ? prog : note && mine ? note : mine ? `本批 ${n} 副` : '';
    $('batchOverlayText').textContent = running ? `連續生成 ${prog}` : '';
    $('batchCount').disabled = running || exporting;
    const tools = $('shoeBatchTools'); if (!tools) return;
    const lock = running || exporting || busy();
    $('shoeBatchNav').hidden = !mine; $('sbExportAll').hidden = !mine; $('sbDelete').hidden = !mine;
    $('sbPos').textContent = mine ? `第 ${index + 1}／${n} 副` : '';
    $('sbPrev').disabled = lock || index <= 0; $('sbNext').disabled = lock || index >= n - 1;
    $('sbExportAll').disabled = lock; $('sbDelete').disabled = lock;
    $('sbExport').disabled = lock || !(currentRounds || []).length;
    if (lock) disarm();
  }

  function init() {
    const ctl = document.createElement('div'); ctl.className = 'batch-ctl'; ctl.dataset.dashboardUi = '';
    ctl.innerHTML = '<label class="batch-count" title="1＝一般生成；2 以上按生成會連續排多副，每副都要通過驗收才算"><span>條數</span><input id="batchCount" type="number" min="1" max="100" step="1" inputmode="numeric" autocomplete="off"></label><span id="batchProgress" class="batch-progress" aria-live="polite"></span>';
    document.querySelector('.chip-col').after(ctl);
    let saved = 1; try { saved = Number(localStorage.getItem(COUNT_KEY)) || 1; } catch (_) {}
    $('batchCount').value = Math.min(Math.max(1, Math.floor(saved)), MAX);
    $('batchCount').addEventListener('change', () => { const n = readCount(); $('batchCount').value = n; try { localStorage.setItem(COUNT_KEY, String(n)); } catch (_) {} });
    const overlayText = document.createElement('div'); overlayText.id = 'batchOverlayText'; overlayText.className = 'generating-batch';
    $('generatingOverlay').append(overlayText);

    const close = $('shoeOverviewClose');
    const tools = document.createElement('div'); tools.id = 'shoeBatchTools'; tools.className = 'shoe-batch-tools';
    tools.innerHTML = '<div id="shoeBatchNav" class="shoe-batch-nav" hidden><button type="button" class="tool-btn" id="sbPrev" aria-label="上一副">◀</button><span id="sbPos"></span><button type="button" class="tool-btn" id="sbNext" aria-label="下一副">▶</button></div>'
      + '<button type="button" class="tool-btn" id="sbExport">導出</button><button type="button" class="tool-btn" id="sbExportAll" hidden>全部導出</button><button type="button" class="tool-btn sb-delete" id="sbDelete" hidden>刪除</button>';
    close.before(tools);
    $('sbPrev').onclick = () => go(index - 1); $('sbNext').onclick = () => go(index + 1);
    $('sbExport').onclick = () => { if (!busy() && !running && !exporting) { saveCurrent(); $('btnExportCombined').click(); } };
    $('sbExportAll').onclick = () => { void exportAll(); };
    $('sbDelete').onclick = remove;

    // 視窗捕捉階段先於整合層：條數 ≥2 改走連跑；停止、清空、切模式同步本批狀態
    window.addEventListener('click', e => {
      const id = e.target.closest?.('button')?.id; if (!id || internal) return;
      if (id === 'chipGen' || id === 'generateBtn') {
        if (running || exporting) { e.preventDefault(); e.stopImmediatePropagation(); return; }
        const n = readCount();
        if (n >= 2 && !busy()) { e.preventDefault(); e.stopImmediatePropagation(); void run(n); }
        else if (!busy()) reset();
      } else if (id === 'chipStop' || id === 'stopGenerateBtn') {
        if (running) { stopReq = true; update('停止中…'); }
      } else if (id === 'chipClear' || id === 'clearBtn') {
        if (exporting) { e.preventDefault(); e.stopImmediatePropagation(); return; }
        if (running) stopReq = true; else if (sameMode()) reset();
      } else if (MODE_IDS.includes(id)) {
        if (running || exporting) { e.preventDefault(); e.stopImmediatePropagation(); return; }
        saveCurrent();
      }
    }, true);
    new MutationObserver(() => update()).observe(document.body, { attributes: true, attributeFilter: ['class','data-mode','data-sub','data-tsub'] });
    update();
    window.ShoeBatch = { get list() { return list; }, get index() { return index; }, get running() { return running; }, run, go, remove, exportAll };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
