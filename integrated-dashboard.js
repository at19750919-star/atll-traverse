// Presentation only: retain the original handlers and all four mode states.
(function () {
  'use strict';
  function buildDashboard() {
    const $ = id => document.getElementById(id);
    function el(tag, cls, html) { const n = document.createElement(tag); n.className = cls; if (html) n.innerHTML = html; return n; }
    function button(id, text) { const n = el('button','tool-btn'); n.id = id; n.type = 'button'; n.textContent = text; n.dataset.dashboardUi = ''; return n; }
    function move(ids, target) { ids.forEach(id => { if ($(id)) target.append($(id)); }); }
    const deck = document.querySelector('.deck'), modeNav = document.querySelector('.mode-switch');
    const layout = el('main','dashboard-layout');
    const sidebar = el('aside','dashboard-sidebar'); sidebar.setAttribute('aria-label','設定與工具');
    const tabs = el('div','dashboard-tabs'); tabs.setAttribute('role','tablist'); tabs.setAttribute('aria-label','左欄功能');
    const settingsTab = button('dashboardSettingsTab','排牌設定'), toolsTab = button('dashboardToolsTab','牌靴工具');
    const middle = el('div','dashboard-sidebar-scroll');
    const settings = el('section','dashboard-settings'); settings.id = 'dashboardSettings';
    const tools = el('section','dashboard-tools'); tools.id = 'dashboardTools'; tools.hidden = true;
    [[settingsTab,settings],[toolsTab,tools]].forEach(([tab,panel]) => {
      tab.setAttribute('role','tab'); tab.setAttribute('aria-controls',panel.id);
      panel.setAttribute('role','tabpanel'); panel.setAttribute('aria-labelledby',tab.id);
    });
    tabs.append(settingsTab,toolsTab);
    document.body.insertBefore(layout,modeNav); layout.append(sidebar);
    const counts = $('sharedCardCounts');
    settings.append(document.querySelector('.signal'),$('sharedSignalSettings'),document.querySelector('.expanders'));
    middle.append(settings,tools);
    const actions = document.querySelector('.chip-col'); $('chipClear').querySelector('.lbl').textContent = '清空';
    const progress = el('div','dashboard-progress'); progress.append($('tvProgress'));
    sidebar.append(modeNav,tabs,middle,progress,actions);
    const workspace = el('section','dashboard-workspace'); workspace.setAttribute('aria-label','牌靴資料'); layout.append(workspace);
    const overview = el('section','dashboard-overview'), metrics = el('div','dashboard-metrics'), stats = $('stats'); workspace.append(overview); overview.append(metrics);
    // Original sinks remain available to the analysis code, without duplicate calculations.
    const legacy = el('div','compat-hidden'); legacy.id = 'dashboardLegacyStats';
    legacy.append(...Array.from(stats.children)); $('compatLayer').append(legacy);
    stats.innerHTML = `
      <section class="dash-stat"><h2>回復分析</h2><div class="dash-kpis">
      <div><span>平均回復</span><strong id="dashAvg">—</strong><small id="dashAvgCards">—</small></div>
      <div><span>最大消耗</span><strong id="dashMax">—</strong><small id="dashMaxCards">—</small></div></div>
      <p id="dashMaxAt" class="dash-detail"></p><p id="dashB6" class="dash-detail b6-meta"></p></section>
      <section class="dash-stat"><h2>本副牌靴 <strong id="dashTotal">0</strong><small> 局</small></h2>
      <div id="dashOutcomeLegend" class="dash-legend"></div><div id="dashOutcomeBar" class="dash-proportion"></div>
      <div id="dashSizeLegend" class="dash-legend"></div><div id="dashSizeBar" class="dash-proportion"></div></section>
      <section class="dash-stat dash-distribution"><h2>回復間距分布</h2><div id="dashRecoveryBars"></div></section>`;
    metrics.append(stats,$('statsVioCard'));
    const traverseSlot = el('div','dashboard-traverse-slot'), traverse = $('traverseTools');
    traverseSlot.append(traverse); overview.append(metrics,traverseSlot);
    const groups = [
      ['牌序編修','edit',['btnSwap','btnRound','btnAutoReorder','btnAutoColor','btnAutoFix','btnCancelEdit','btnApplyChanges','tvOptimize','btnOptOpen']],
      ['切牌定位','cut',['btnRecordDeckOrder']],
      ['分析與參考','analysis',['btnShoeMap','btnPointMatrix','btnPointStats','btnValidate','btnApplyTools']],
      ['檔案與輸入','files',['btnImport','importFileInput','btnExportCombined','btnManualInput']],
      ['發牌與示範','demo',['btnDealer','btnSpeech','tvDemo']]
    ];
    const groupBodies = {};
    groups.forEach(([name,key,ids],i) => {
      const group = el('details','dashboard-tool-group'); group.dataset.group = key; group.open = i === 0;
      const content = el('div','dashboard-tool-buttons'); groupBodies[key] = content;
      move(ids,content); group.append(el('summary','',name),content); tools.append(group);
    });
    const preview = document.querySelector('.swap-preview-toggle'); if (preview) groupBodies.edit.append(preview);
    document.querySelectorAll('#tpView .view-num-group').forEach(n => groupBodies.cut.append(n));
    traverse.querySelectorAll('a.tool-btn').forEach(a => groupBodies.demo.append(a));
    $('btnApplyChanges').textContent = '套用編輯'; $('btnRecordDeckOrder').textContent = '記錄牌序';
    $('btnRecordDeckOrder').title = '記錄目前牌序，作為切牌起點';
    $('btnPointMatrix').textContent = '點數機率參考'; $('btnPointStats').textContent = 'Excel 點數統計';
    $('btnValidate').textContent = 'Excel 驗算'; $('btnApplyTools').textContent = '計算工具'; $('tvDemo').textContent = '生成示範牌靴';
    const oldToolbar = $('toolCats'), oldPanels = document.querySelector('.tool-panels');
    oldToolbar.hidden = oldPanels.hidden = true; $('compatLayer').append(oldToolbar,oldPanels);
    traverse.classList.remove('tool-panel'); traverse.querySelector('.mode-actions')?.remove();
    const pit = document.querySelector('.pit'), tableBar = el('div','dashboard-table-bar');
    tableBar.append(el('span','dashboard-table-title','牌靴主表'),counts);
    const openData = button('btnTraverseData','穿越資料'), openTable = button('btnTableWindow','彈出主表 ↗');
    tableBar.append(openData,openTable);
    const density = el('select','density-control','<option value="normal">一般</option><option value="compact">緊湊</option>');
    density.setAttribute('aria-label','主表顯示密度'); pit.querySelector('.felt-head').append(density);
    let tableDensity = 'normal';
    try { tableDensity = localStorage.getItem('integrated-table-density') === 'compact' ? 'compact' : 'normal'; } catch (_) {}
    function setDensity(value) {
      tableDensity = value === 'compact' ? 'compact' : 'normal'; document.body.dataset.density = tableDensity; density.value = tableDensity;
      try { localStorage.setItem('integrated-table-density',tableDensity); } catch (_) {}
      syncTableWindow();
    }
    density.addEventListener('change',() => setDensity(density.value));
    const windowStatus = el('p','table-window-status'); windowStatus.id = 'tableWindowStatus'; windowStatus.hidden = true; windowStatus.setAttribute('role','status');
    const logbox = document.querySelector('.logbox'); logbox.classList.add('closed');
    workspace.append(overview,tableBar,windowStatus,$('shoeMap'),pit,logbox);
    layout.append(sidebar,workspace); deck.remove(); document.body.classList.add('dashboard');
    function selectTab(name) {
      const on = name !== 'tools'; settings.hidden = !on; tools.hidden = on;
      [[settingsTab,on],[toolsTab,!on]].forEach(([tab,selected]) => { tab.setAttribute('aria-selected',String(selected)); tab.tabIndex = selected ? 0 : -1; });
      middle.scrollTop = 0;
    }
    settingsTab.addEventListener('click',() => selectTab('settings')); toolsTab.addEventListener('click',() => selectTab('tools'));
    tabs.addEventListener('keydown',e => {
      if (['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) {
        e.preventDefault(); const tab = e.key === 'Home' ? settingsTab : e.key === 'End' ? toolsTab : e.target === settingsTab ? toolsTab : settingsTab;
        tab.click(); tab.focus();
      }
    });
    oldToolbar.addEventListener('click',e => {
      const key = {tpEdit:'edit',tpData:'files',tpVerify:'analysis',tpView:'cut',traverseTools:'demo'}[e.target.closest('[data-tp]')?.dataset.tp];
      if (key) { selectTab('tools'); groupBodies[key].parentElement.open = true; }
    });
    selectTab('settings');
    // A modeless window keeps the main table usable while diagnostics are open.
    const dataDialog = el('section','dashboard-data-dialog gframe'); dataDialog.id = 'traverseDataDialog'; dataDialog.hidden = true;
    dataDialog.setAttribute('role','dialog'); dataDialog.setAttribute('aria-label','穿越資料');
    const dialogHead = el('div','dashboard-dialog-head','<strong>穿越資料</strong>'), closeData = button('btnCloseTraverseData','關閉'); dialogHead.append(closeData);
    const dialogBody = el('div','dashboard-dialog-body'); dataDialog.append(dialogHead,dialogBody); document.body.append(dataDialog);
    let floatingData = false, checkingPlacement = false;
    function closeDataDialog() { dataDialog.hidden = true; openData.setAttribute('aria-expanded','false'); }
    function updateDataPlacement() {
      if (checkingPlacement) return; checkingPlacement = true;
      const isTraverse = document.body.dataset.mode === 'traverse'; openData.hidden = !isTraverse; progress.hidden = !isTraverse;
      if (!isTraverse) closeDataDialog();
      const expanded = Array.from(traverse.querySelectorAll('details')).some(d => d.open && d.id !== 'tvSafePanel');
      const shouldFloat = workspace.clientWidth < 1450 || workspace.clientHeight < 650 || expanded;
      if (shouldFloat !== floatingData || (!shouldFloat && traverse.parentElement !== traverseSlot)) {
        floatingData = shouldFloat; (shouldFloat ? dialogBody : traverseSlot).append(traverse); if (!shouldFloat) closeDataDialog();
      }
      traverseSlot.hidden = !isTraverse || floatingData; overview.classList.toggle('has-traverse',isTraverse && !floatingData);
      openData.textContent = floatingData ? '穿越資料 ↗' : '穿越資料'; checkingPlacement = false;
    }
    openData.addEventListener('click',() => {
      updateDataPlacement(); if (!floatingData) { $('tvSafePanel').open = true; return; }
      dataDialog.hidden = !dataDialog.hidden; openData.setAttribute('aria-expanded',String(!dataDialog.hidden));
    });
    closeData.addEventListener('click',closeDataDialog);
    traverse.addEventListener('toggle',() => {
      const wasInline = !floatingData; updateDataPlacement();
      if (wasInline && floatingData) { dataDialog.hidden = false; openData.setAttribute('aria-expanded','true'); }
    },true);
    let drag = null;
    dialogHead.addEventListener('pointerdown',e => {
      if (e.target.closest('button') || e.button !== 0) return;
      const r = dataDialog.getBoundingClientRect(); drag = {x:e.clientX,y:e.clientY,left:r.left,top:r.top}; dialogHead.setPointerCapture(e.pointerId);
    });
    dialogHead.addEventListener('pointermove',e => {
      if (!drag) return;
      dataDialog.style.left = Math.max(0,Math.min(innerWidth - 100,drag.left + e.clientX - drag.x)) + 'px';
      dataDialog.style.top = Math.max(0,Math.min(innerHeight - 44,drag.top + e.clientY - drag.y)) + 'px'; dataDialog.style.right = 'auto';
    });
    dialogHead.addEventListener('pointerup',() => { drag = null; }); dialogHead.addEventListener('pointercancel',() => { drag = null; });
    document.addEventListener('keydown',e => { if (e.key === 'Escape' && !dataDialog.hidden) closeDataDialog(); });
    function sourceText(id,fallback = '—') { return $(id)?.textContent.trim() || fallback; }
    function proportional(barId,legendId,items,total) {
      const bar = $(barId), legend = $(legendId); bar.replaceChildren(); legend.replaceChildren();
      items.forEach(([name,count,color]) => {
        const pct = total ? count / total * 100 : 0;
        legend.append(el('span','',`<i style="background:${color}"></i>${name} <b>${count}</b> <small>${pct.toFixed(1)}%</small>`));
        const segment = el('span',''); segment.style.width = pct + '%'; segment.style.background = color; segment.title = `${name} ${count} 局（${pct.toFixed(1)}%）`; bar.append(segment);
      });
      bar.setAttribute('role','img'); bar.setAttribute('aria-label',items.map(([name,count]) => `${name}${count}局`).join('，'));
    }
    let lastCutAnalysis, lastCutResult;
    function renderCutMap() {
      const state = window.IntegratedModes.traversal, analysis = state.analysis, result = state.result;
      if (lastCutAnalysis === analysis && lastCutResult === result) return;
      lastCutAnalysis = analysis; lastCutResult = result;
      const cuts = $('tvSafeCuts'); cuts.classList.add('cut-map'); cuts.replaceChildren();
      const depths = result && analysis ? analysis.depths : Array(416).fill(null), maxDepth = Math.max(1,...depths.filter(Number.isFinite));
      depths.forEach((depth,index) => {
        const cell = el('button','cut-cell'); cell.type = 'button'; cell.dataset.position = index + 1;
        const safe = depth === 0, label = depth === null ? `第 ${index + 1} 張，尚未排牌` : `第 ${index + 1} 張，${safe ? '安全切點' : `第 ${depth} 局違規`}`;
        cell.title = label; cell.setAttribute('aria-label',label); cell.disabled = !safe;
        cell.classList.toggle('safe',safe); cell.classList.toggle('pending',depth === null);
        if (safe) cell.dataset.tvCut = index; else if (depth !== null) cell.style.setProperty('--cut-light',(18 + depth / maxDepth * 40).toFixed(1) + '%');
        cuts.append(cell);
      });
      $('tvSafePanel').open = true;
      if (!$('cutMapLegend')) { const legend = el('div','cut-map-legend','<span><i class="safe-key"></i>安全</span><span><i class="depth-key"></i>越亮＝越晚出現違規</span><span>滑過看張號・點綠格切牌</span>'); legend.id = 'cutMapLegend'; cuts.before(legend); }
    }
    function refreshDashboard() {
      const rounds = typeof currentRounds === 'undefined' ? [] : currentRounds || [], full = rounds.filter(r => r.cards && [4,5,6].includes(r.cards.length)), has = full.length > 0;
      const outcomeTotal = has ? Number(sourceText('totalRounds','0')) : 0;
      $('dashTotal').textContent = outcomeTotal; $('dashAvg').textContent = has ? sourceText('recoveryAvg') : '—'; $('dashAvgCards').textContent = has ? sourceText('recoveryAvgCards') : '— 張';
      $('dashMax').textContent = has ? sourceText('recoveryMaxRoundsLeft') + ' 局' : '—'; $('dashMaxCards').textContent = has ? sourceText('recoveryMaxCardsLeft') + ' 張' : '— 張';
      $('dashMaxAt').textContent = has ? `最大消耗起點：第 ${sourceText('recoveryMaxIdxCards')} 張／第 ${sourceText('recoveryMaxIdxRounds')} 局` : '尚未生成牌靴';
      $('dashB6').textContent = has ? `對調莊6 ${sourceText('recoverySwapB6Count')}　莊6點贏 ${sourceText('recoveryBanker6Count')}` : '';
      proportional('dashOutcomeBar','dashOutcomeLegend',[['莊',has ? Number(sourceText('bankerCount','0')) : 0,'var(--banker)'],['閒',has ? Number(sourceText('playerCount','0')) : 0,'var(--player)'],['和',has ? Number(sourceText('tieCount','0')) : 0,'var(--tie)']],outcomeTotal);
      proportional('dashSizeBar','dashSizeLegend',[4,5,6].map((n,i)=>[`${n}張`,full.filter(r=>r.cards.length===n).length,['#cfe8d6','#62a683','#2f6e51'][i]]),full.length);
      const imm = sourceText('recoveryImmediateDetail','').match(/\(([\d.]+)%\)/);
      const ranges = [['立即',has && imm ? Number(imm[1]) : 0],...['1to5','6to10','11to15','16plus'].map((key,i)=>[['1–5局','6–10局','11–15局','16局以上'][i],has ? parseFloat(sourceText('recoveryRange'+key,'0')) || 0 : 0])];
      $('dashRecoveryBars').replaceChildren(...ranges.map(([name,pct])=>el('div','dash-range',`<span>${name}</span><div><i style="width:${pct}%"></i></div><b>${pct.toFixed(1)}%</b>`)));
      renderCutMap(); if (window.IntegratedModes.traversal.result) openData.title = sourceText('tvSummary'); updateDataPlacement();
    }
    let refreshScheduled = false;
    function scheduleRefresh() { if (refreshScheduled) return; refreshScheduled = true; requestAnimationFrame(()=>{ refreshScheduled = false; refreshDashboard(); syncTableWindow(); }); }
    let tableWindow = null;
    const windowName = 'shoe-table-' + Date.now().toString(36) + Math.random().toString(36).slice(2,8);
    function liveWindow() { try { return tableWindow && !tableWindow.closed && tableWindow.document.body.classList.contains('table-window'); } catch (_) { return false; } }
    function syncTableWindow() {
      if (!liveWindow()) return;
      const target = tableWindow.document; target.title = $('modeStatus').textContent + ' · 主表';
      target.body.className = 'table-window' + (document.body.classList.contains('table-zoom') ? ' table-zoom' : ''); Object.assign(target.body.dataset,document.body.dataset);
      target.body.dataset.density = tableDensity; target.querySelector('.density-control').value = tableDensity;
      const theme = document.documentElement.getAttribute('data-theme'); if (theme) target.documentElement.setAttribute('data-theme',theme); else target.documentElement.removeAttribute('data-theme');
      const scroll = target.querySelector('.table-scroll'), x = scroll.scrollLeft, y = scroll.scrollTop;
      scroll.replaceChildren(...Array.from(pit.querySelector('.table-scroll').children,child=>target.importNode(child,true))); scroll.scrollLeft = x; scroll.scrollTop = y;
    }
    function createTableWindow() {
      if (liveWindow()) { syncTableWindow(); tableWindow.focus(); return; }
      const opened = window.open('',windowName,'popup=yes,width=1280,height=900,resizable=yes,scrollbars=yes');
      if (!opened) { windowStatus.textContent = '請允許此頁面開啟彈出式視窗，再按「彈出主表」。'; windowStatus.hidden = false; return; }
      tableWindow = opened; windowStatus.hidden = true; const target = opened.document;
      target.open(); target.write('<!doctype html><html lang="zh-Hant"><head><title>牌靴主表</title></head><body class="table-window"></body></html>'); target.close();
      const base = target.createElement('base'); base.href = document.baseURI; target.head.append(base);
      const viewport = target.createElement('meta'); viewport.name = 'viewport'; viewport.content = 'width=device-width, initial-scale=1'; target.head.append(viewport);
      // Copy loaded rules: about:blank must not depend on imported stylesheet links loading.
      document.querySelectorAll('style,link[rel="stylesheet"]').forEach(source => {
        const style = target.createElement('style');
        try { style.textContent = Array.from(source.sheet.cssRules,rule=>rule.cssText).join('\n'); }
        catch (_) { if (source.tagName === 'STYLE') style.textContent = source.textContent; else { if (!source.href.startsWith('file:')) { const link = target.createElement('link'); link.rel = 'stylesheet'; link.href = source.href; target.head.append(link); } return; } }
        target.head.append(style);
      });
      // file:// stylesheets may be opaque to CSSOM. Copy the rendered table's
      // visual properties and provide its small layout contract without file requests.
      const windowLayout = target.createElement('style');
      function visual(selector,node,properties) {
        const css = getComputedStyle(node);
        return selector + '{' + properties.map(p=>p+':'+css.getPropertyValue(p)).join(';') + '}';
      }
      windowLayout.textContent = [
        'body.table-window{height:100dvh;min-height:0;padding:10px;display:flex;overflow:hidden}',
        'body.table-window .pit{display:flex;flex:1;min-width:0;min-height:0;margin:0;width:100%}',
        visual('body.table-window .pit',pit,['padding','border-radius','background','box-shadow']),
        'body.table-window .felt{display:flex;flex-direction:column;flex:1;min-width:0;min-height:0;overflow:hidden}',
        visual('body.table-window .felt',pit.querySelector('.felt'),['padding','border-radius']),
        'body.table-window .felt-head{flex:none;margin-bottom:8px;gap:12px}',
        'body.table-window .felt-head .arc-text{font-size:10px;letter-spacing:.2em;white-space:nowrap}',
        'body.table-window .table-scroll{flex:1;min-height:0;overflow:auto;max-height:none;overscroll-behavior:contain}',
        visual('body.table-window #roundsTable', $('roundsTable'), ['min-width']),
        'body.table-window #roundsTable th{padding:9px 5px;font-size:11px;letter-spacing:.1em;text-indent:0}',
        'body.table-window #roundsTable td{padding:7px 5px;font-size:13px}',
        'body.table-window[data-density=compact] #roundsTable td{padding-top:3px;padding-bottom:3px}',
        'body.table-window[data-density=compact] #roundsTable .card-label{width:27px;height:27px;font-size:12px}',
        visual('.density-control',density,['border','border-radius','background','color','padding','font'])
      ].join('\n');
      target.head.append(windowLayout);
      target.body.replaceChildren(target.importNode(pit,true));
      target.body.addEventListener('click',event => {
        if (document.body.classList.contains('running')) return;
        const card = event.target.closest('[data-action="card"]'), row = event.target.closest('tr[data-r]');
        const selector = card ? `#roundsBody [data-action="card"][data-r="${Number(card.dataset.r)}"][data-c="${Number(card.dataset.c)}"]` : row ? `#roundsBody tr[data-r="${Number(row.dataset.r)}"] td` : null;
        if (selector) document.querySelector(selector)?.click();
      });
      target.body.addEventListener('change',event=>{ if (event.target.matches('.density-control')) setDensity(event.target.value); });
      syncTableWindow(); opened.focus();
    }
    openTable.addEventListener('click',createTableWindow);
    const observer = new MutationObserver(scheduleRefresh);
    observer.observe(pit,{subtree:true,childList:true,attributes:true,characterData:true});
    observer.observe(legacy,{subtree:true,childList:true,characterData:true});
    observer.observe($('modeStatus'),{subtree:true,childList:true,characterData:true}); observer.observe($('tvSummary'),{subtree:true,childList:true,characterData:true});
    new MutationObserver(scheduleRefresh).observe(document.body,{attributes:true,attributeFilter:['class','data-mode','data-sub','data-tsub']});
    new MutationObserver(scheduleRefresh).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
    new ResizeObserver(updateDataPlacement).observe(workspace);
    window.addEventListener('pagehide',()=>{ if (liveWindow()) tableWindow.close(); });
    window.DashboardUI = {refresh:scheduleRefresh,selectTab}; setDensity(tableDensity); refreshDashboard();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',buildDashboard); else buildDashboard();
})();
