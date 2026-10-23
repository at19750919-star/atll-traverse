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
    sidebar.append(modeNav,tabs,middle,progress);
    document.querySelector('body > header').insertBefore(actions,document.querySelector('.shoe-state'));
    const exportTools = el('div','dashboard-header-export');
    exportTools.setAttribute('aria-label','導出Excel');
    $('exportFilenameField').title = '僅存本機；尾碼自動接續，編號保存在本機';
    move(['exportFilenameField','btnExportCombined'],exportTools);
    document.querySelector('body > header').insertBefore(exportTools,document.querySelector('.shoe-state'));
    const workspace = el('section','dashboard-workspace'); workspace.setAttribute('aria-label','牌靴資料'); layout.append(workspace);
    const overview = el('section','dashboard-overview'), metrics = el('div','dashboard-metrics'), stats = $('stats'); workspace.append(overview); overview.append(metrics);
    // Original sinks remain available to the analysis code, without duplicate calculations.
    const legacy = el('div','compat-hidden'); legacy.id = 'dashboardLegacyStats';
    legacy.append(...Array.from(stats.children)); $('compatLayer').append(legacy);
    stats.innerHTML = `
      <section class="dash-stat"><h2 id="dashRecTitle">回復分析</h2><div class="dash-kpis">
      <div><span id="dashAvgLabel">平均回復</span><strong id="dashAvg">—</strong><small id="dashAvgCards">—</small></div>
      <div><span id="dashMaxLabel">最大消耗</span><strong id="dashMax">—</strong><small id="dashMaxCards">—</small></div></div>
      <p id="dashMaxAt" class="dash-detail"></p><p id="dashB6" class="dash-detail b6-meta"></p></section>
      <section class="dash-stat"><h2>本副牌靴 <strong id="dashTotal">0</strong><small> 局</small></h2>
      <div id="dashOutcomeLegend" class="dash-legend"></div><div id="dashOutcomeBar" class="dash-proportion"></div>
      <div id="dashSizeLegend" class="dash-legend"></div><div id="dashSizeBar" class="dash-proportion"></div></section>
      <section class="dash-stat dash-distribution"><h2 id="dashDistTitle">回復間距分布</h2><div id="dashRecoveryBars"></div></section>`;
    metrics.append(stats,$('statsVioCard'));
    const traverseSlot = el('div','dashboard-traverse-slot'), traverse = $('traverseTools');
    traverseSlot.append(traverse); overview.append(metrics,traverseSlot);
    const groups = [
      ['牌序編修','edit',['btnSwap','btnRound','btnAutoReorder','btnAutoColor','btnAutoFix','btnCancelEdit','btnApplyChanges','tvOptimize','btnOptOpen']],
      ['切牌定位','cut',['btnRecordDeckOrder']],
      ['分析與參考','analysis',['btnShoeMap','btnPointMatrix','btnPointStats','btnValidate','btnApplyTools']],
      ['檔案與輸入','files',['btnImport','importFileInput','btnManualInput']],
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
    const recoveryDetails = el('details','shared-recovery-details'); recoveryDetails.id = 'sharedRecoveryDetails';
    recoveryDetails.innerHTML = '<summary>逐切點回復明細</summary><p class="mode-note">回復＝不對調發牌後接回原局起點；不是違規深度。張號依目前牌表；尾端未成局的牌保留參與模擬，但不視為局起點。</p><div id="sharedRecoveryRows"></div>';
    const moreData = el('div','dashboard-data-more'), diagnostics = $('tvDiagnostics').closest('details');
    diagnostics.id = 'tvDiagnosticsPanel'; moreData.append($('tvBucketsDetail'),recoveryDetails,diagnostics); traverse.append(moreData);
    const pit = document.querySelector('.pit'), tableBar = el('div','dashboard-table-bar');
    tableBar.append(el('span','dashboard-table-title','牌靴主表'),counts);
    const openData = button('btnTraverseData','穿越資料'), openTable = button('btnTableWindow','彈出主表 ↗');
    tableBar.append(openData,openTable);
    const density = el('select','density-control','<option value="normal">一般</option><option value="compact">緊湊</option>');
    density.setAttribute('aria-label','主表顯示密度'); tableBar.insertBefore(density,openData);
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
    dataDialog.setAttribute('role','dialog'); dataDialog.setAttribute('aria-label','分析明細');
    const dialogHead = el('div','dashboard-dialog-head','<strong>分析明細</strong>'), closeData = button('btnCloseTraverseData','關閉'); dialogHead.append(closeData);
    const dialogBody = el('div','dashboard-dialog-body'); dataDialog.append(dialogHead,dialogBody); document.body.append(dataDialog);
    let floatingData = false, checkingPlacement = false;
    function closeDataDialog() { dataDialog.hidden = true; openData.setAttribute('aria-expanded','false'); }
    function updateDataPlacement() {
      if (checkingPlacement) return; checkingPlacement = true;
      const isTraverse = document.body.dataset.mode === 'traverse'; openData.hidden = false; progress.hidden = !isTraverse; traverse.hidden = false;
      $('tvSummary').hidden = !isTraverse; diagnostics.hidden = !isTraverse;
      
      const expanded = Array.from(traverse.querySelectorAll('details')).some(d => d.open && d.id !== 'tvSafePanel');
      let shouldFloat = workspace.clientWidth < 1180 || innerHeight < 560 || expanded;
      // Judge the real inline height, including loaded fonts and wrapped summaries.
      // Keep at least the majority of the workspace available to the card table.
      if (!shouldFloat) {
        if (traverse.parentElement !== traverseSlot) traverseSlot.append(traverse);
        traverseSlot.hidden = false; overview.classList.add('has-traverse');
        shouldFloat = overview.getBoundingClientRect().height > Math.min(280,innerHeight * .35);
      }
      floatingData = shouldFloat;
      const parent = shouldFloat ? dialogBody : traverseSlot;
      if (traverse.parentElement !== parent) parent.append(traverse);
      if (!shouldFloat) closeDataDialog();
      traverseSlot.hidden = floatingData; overview.classList.toggle('has-traverse',!floatingData);
      openData.textContent = floatingData ? '分析明細 ↗' : '分析明細'; checkingPlacement = false;
    }
    openData.addEventListener('click',() => {
      updateDataPlacement(); if (!floatingData) { $('tvSafePanel').open = true; return; }
      dataDialog.hidden = !dataDialog.hidden; openData.setAttribute('aria-expanded',String(!dataDialog.hidden));
    });
    closeData.addEventListener('click',closeDataDialog);
    traverse.addEventListener('toggle',event => {
      updateDataPlacement();
      if (floatingData && event.target.open && event.target.id !== 'tvSafePanel') { dataDialog.hidden = false; openData.setAttribute('aria-expanded','true'); }
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
    let analysisKey = '', shared = { safe:null, recovery:null };
    function sharedAnalysis(rounds) {
      const tv = document.body.dataset.mode === 'traverse';
      const state = window.IntegratedModes.traversal;
      const cards = tv && state.result ? TraverseOptimizer.prepare(state.result) : rounds.flatMap(r => r.cards);
      const options = { tripleTie:$(tv ? 'tvTriple' : 'tripleTieRule').checked,
        signalRule:tv ? $('tvSignal').checked : true, signalConfig:{suits:SIGNAL_CONFIG.suits.slice(),ranks:SIGNAL_CONFIG.ranks.slice()} };
      const key = JSON.stringify([document.body.dataset.mode,document.body.dataset.sub,document.body.dataset.tsub,
        options,cards.map(c=>[c.rank,c.suit,c.traverse]),rounds.map(r=>[r.result,r.cards.map(c=>[c.rank,c.suit])])]);
      if (key !== analysisKey) {
        analysisKey = key;
        shared = { safe:rounds.length ? IntegratedAnalysis.safe(cards,options,tv) : null,
          recovery:IntegratedAnalysis.recovery(rounds), excluded:tv ? cards.filter(c=>!c.traverse).length : 0 };
        renderCutMap(tv);
        renderRecoveryDetails();
      }
      if (!$('tvSafeCuts').querySelector('.cut-cell')) renderCutMap(tv);
      return shared;
    }
    function renderCutMap(tv) {
      const analysis = shared.safe, cuts = $('tvSafeCuts'); cuts.classList.add('cut-map'); cuts.replaceChildren();
      const depths = analysis?.depths || Array(416).fill(null), total = depths.length;
      const maxDepth = Math.max(1,...depths.filter(Number.isFinite));
      $('tvSafeCount').textContent = analysis ? `${analysis.count}／${total}（${(analysis.count/total*100).toFixed(1)}%）` : '尚未排牌';
      $('tvBucketSummary').textContent = analysis ? `${tv ? '原始牌序' : '目前牌表'}張號；違規深度＝最後違規局，不是回復局數。${shared.excluded ? `不檢查含剩牌的局（剩牌 ${shared.excluded} 張）。` : '全副完整局納入檢查。'}` : '';
      const buckets = new Map(); depths.filter(Number.isFinite).forEach(d=>buckets.set(d,(buckets.get(d)||0)+1));
      $('tvCutBuckets').replaceChildren(...[...buckets].sort((a,b)=>a[0]-b[0]).map(([d,n])=>el('div','cut-bucket',`<span>${d ? `最後違規第 ${d} 局` : '安全'}</span><strong>${n} 點</strong>`)));
      if (analysis) { const unsafe=depths.filter(d=>d>0); $('tvCutBuckets').append(el('p','mode-note',`違規最深：${maxDepth === 1 && !unsafe.length ? '無' : `第 ${Math.max(0,...depths)} 局`}；非安全切點平均最後違規深度：${unsafe.length ? (unsafe.reduce((a,b)=>a+b,0)/unsafe.length).toFixed(1)+' 局' : '無'}`)); }
      depths.forEach((depth,index) => {
        const cell = el(tv ? 'button' : 'span','cut-cell'); if(tv) cell.type = 'button'; cell.dataset.position = index + 1;
        const safe = depth === 0, label = depth === null ? `第 ${index + 1} 張，尚未排牌` : `第 ${index + 1} 張，${safe ? '安全切點' : `最後違規第 ${depth} 局`}`;
        cell.title = label; cell.setAttribute('aria-label',label); if(tv) cell.disabled = depth === null;
        cell.classList.toggle('safe',safe); cell.classList.toggle('pending',depth === null);
        if (tv && depth !== null) cell.dataset.tvCut = index;
        if (!safe && depth !== null) cell.style.setProperty('--cut-light',(18 + depth / maxDepth * 40).toFixed(1) + '%');
        cuts.append(cell);
      });
      $('tvSafePanel').open = true;
      if (!$('cutMapLegend')) { const legend = el('div','cut-map-legend'); legend.id = 'cutMapLegend'; cuts.before(legend); }
      $('cutMapLegend').innerHTML = '<span><i class="safe-key"></i>安全</span><span><i class="depth-key"></i>越亮＝最後違規越深</span><span>' + (tv ? '滑過看張號・點任一格切牌' : '滑過看目前牌表張號・切牌請用切牌定位') + '</span>';
    }
    function renderRecoveryDetails() {
      const recovery = shared.recovery;
      $('sharedRecoveryRows').replaceChildren(...(recovery?.recoveryDetails || []).map(d=>el('div','shared-recovery-row',
        `<span>第 ${d.cutPoint+1} 張</span><span>${d.immediate ? '立即回復' : `${d.roundsUsed} 局／${d.cardsUsed} 張${d.failed ? '（未回復）' : ''}`}</span>`)));
    }
    function refreshDashboard() {
      const rounds = typeof currentRounds === 'undefined' ? [] : currentRounds || [], full = rounds.filter(r => r.cards && [4,5,6].includes(r.cards.length)), has = full.length > 0;
      const analysis = sharedAnalysis(rounds), recovery = analysis.recovery;
      const outcomeTotal = has ? Number(sourceText('totalRounds','0')) : 0;
      $('dashTotal').textContent = outcomeTotal; $('dashAvg').textContent = has ? sourceText('recoveryAvg') : '—'; $('dashAvgCards').textContent = has ? sourceText('recoveryAvgCards') : '— 張';
      $('dashMax').textContent = has ? sourceText('recoveryMaxRoundsLeft') + ' 局' : '—'; $('dashMaxCards').textContent = has ? sourceText('recoveryMaxCardsLeft') + ' 張' : '— 張';
      $('dashMaxAt').textContent = has ? `最大消耗起點：第 ${sourceText('recoveryMaxIdxCards')} 張／第 ${sourceText('recoveryMaxIdxRounds')} 局` : '尚未生成牌靴';
      $('dashB6').textContent = has ? `對調莊6 ${sourceText('recoverySwapB6Count')}　莊6點贏 ${sourceText('recoveryBanker6Count')}` : '';
      proportional('dashOutcomeBar','dashOutcomeLegend',[['莊',has ? Number(sourceText('bankerCount','0')) : 0,'var(--banker)'],['閒',has ? Number(sourceText('playerCount','0')) : 0,'var(--player)'],['和',has ? Number(sourceText('tieCount','0')) : 0,'var(--tie)']],outcomeTotal);
      proportional('dashSizeBar','dashSizeLegend',[4,5,6].map((n,i)=>[`${n}張`,full.filter(r=>r.cards.length===n).length,['#cfe8d6','#62a683','#2f6e51'][i]]),full.length);
      $('dashRecTitle').textContent = '回復分析'; $('dashAvgLabel').textContent = '平均回復'; $('dashMaxLabel').textContent = '最大消耗'; $('dashDistTitle').textContent = '回復間距分布';
      $('dashAvg').textContent = recovery ? recovery.avgRounds + ' 局' : '—';
      $('dashAvgCards').textContent = recovery ? recovery.avgCards + ' 張' : '— 張';
      $('dashMax').textContent = recovery ? recovery.maxRounds + ' 局' : '—';
      $('dashMaxCards').textContent = recovery ? recovery.maxCards + ' 張' : '— 張';
      const failed = recovery?.recoveryDetails.filter(d=>d.failed).length || 0;
      $('dashMaxAt').textContent = recovery ? (recovery.maxCardIdx >= 0 ? `最大張數消耗起點：第 ${recovery.maxCardIdx+1} 張` : (failed ? '無成功回復的非起點樣本' : '全部立即回復')) + (failed ? `；${failed} 點未回復（含於平均及16局以上）` : '') : '尚未生成牌靴';
      const ranges = [['立即','immediate'],['1–5局','range1to5'],['6–10局','range6to10'],['11–15局','range11to15'],['16局以上*','range16plus']];
      $('dashRecoveryBars').replaceChildren(...ranges.map(([name,key])=>{const pct=recovery ? recovery.distribution[key]/recovery.totalCards*100 : 0;return el('div','dash-range',`<span>${name}</span><div><i style="width:${pct}%"></i></div><b>${pct.toFixed(1)}%</b>`);}));
      $('dashDistTitle').title = '* 沿用原分析：未回復切點也列於16局以上，詳見逐切點明細';
      updateDataPlacement();
    }
    // Keep the original rows and event handlers. Grid only changes where they
    // appear; all data-r/data-c indexes still refer to the original shoe.
    // Inline rules also survive the file:// popup's opaque external stylesheets.
    const splitStyles = el('style',''); splitStyles.id = 'splitRoundsStyles';
    splitStyles.textContent = `
      #roundsTable.split-rounds{min-width:580px;grid-template-columns:minmax(0,1fr);gap:0 18px;align-content:start}
      #roundsTable.split-rounds colgroup{display:none}
      #roundsTable.split-rounds thead,#roundsTable.split-rounds tbody{display:contents}
      #roundsTable.split-rounds tr{display:grid;grid-template-columns:30px minmax(196px,2fr) 42px repeat(2,minmax(100px,1fr)) repeat(3,28px);grid-column:1;align-items:stretch;min-width:0}
      #roundsTable.split-rounds thead tr{position:sticky;top:0;z-index:3;background:var(--felt-1);grid-row:1}
      #roundsTable.split-rounds thead .split-right-head{display:none}
      #roundsTable.split-rounds.split-rounds th{position:static;display:flex;align-items:center;justify-content:center;padding:6px 3px;letter-spacing:0;text-indent:0;min-width:0}
      #roundsTable.split-rounds.split-rounds td{display:flex;align-items:center;justify-content:center;padding:3px;min-width:0;width:auto;font-size:13px}
      #roundsTable.split-rounds.split-rounds :is(th,td):nth-child(3){display:none}
      #roundsTable.split-rounds.split-rounds :is(td.cards-column,td.hand-card-cell){justify-content:flex-start}
      #roundsTable.split-rounds.split-rounds td.result-cell{flex-direction:column}
      #roundsTable.split-rounds :is(.card-strip,.hand-chip-strip){gap:2px;flex-wrap:nowrap}
      #roundsTable.split-rounds.split-rounds .card-label{width:30px;height:30px;flex:none;font-size:12px;letter-spacing:0}
      body[data-density=compact] #roundsTable.split-rounds.split-rounds td{padding-top:2px;padding-bottom:2px}
      body[data-density=compact] #roundsTable.split-rounds.split-rounds .card-label{width:27px;height:27px}
      @media(min-width:1600px){
        #roundsTable.split-rounds{min-width:1180px;grid-template-columns:repeat(2,minmax(0,1fr))}
        #roundsTable.split-rounds tbody tr{grid-column:var(--round-side);grid-row:var(--round-line)}
        #roundsTable.split-rounds thead .split-right-head{display:grid;grid-column:2}
      }
    `;
    document.head.append(splitStyles);
    function layoutRoundTable() {
      const table = $('roundsTable'), head = $('roundsHead'), rows = Array.from($('roundsBody').children);
      if (!table.classList.contains('split-rounds')) table.classList.add('split-rounds');
      if (rows.length && table.style.display !== 'none' && table.style.display !== 'grid') table.style.display = 'grid';
      if (head.firstElementChild && !head.querySelector('.split-right-head')) {
        const right = head.firstElementChild.cloneNode(true); right.classList.add('split-right-head'); head.append(right);
      }
      rows.forEach((row,index) => {
        const side = String(index < 45 ? 1 : 2), line = String(index < 45 ? index + 2 : index - 43);
        if (row.style.getPropertyValue('--round-side') !== side) row.style.setProperty('--round-side',side);
        if (row.style.getPropertyValue('--round-line') !== line) row.style.setProperty('--round-line',line);
      });
    }
    let refreshScheduled = false;
    function scheduleRefresh() { if (refreshScheduled) return; refreshScheduled = true; requestAnimationFrame(()=>{ refreshScheduled = false; layoutRoundTable(); refreshDashboard(); syncTableWindow(); }); }
    let tableWindow = null;
    const windowName = 'shoe-table-' + Date.now().toString(36) + Math.random().toString(36).slice(2,8);
    function liveWindow() { try { return tableWindow && !tableWindow.closed && tableWindow.document.body.classList.contains('table-window'); } catch (_) { return false; } }
    function syncTableWindow() {
      if (!liveWindow() || window.__pendingSizeShoe) return;
      const target = tableWindow.document; target.title = $('modeStatus').textContent + ' · 主表';
      target.body.className = 'table-window' + (document.body.classList.contains('table-zoom') ? ' table-zoom' : ''); Object.assign(target.body.dataset,document.body.dataset);
      target.body.dataset.density = tableDensity; target.querySelector('.density-control').value = tableDensity;
      const theme = document.documentElement.getAttribute('data-theme'); if (theme) target.documentElement.setAttribute('data-theme',theme); else target.documentElement.removeAttribute('data-theme');
      const scroll = target.querySelector('.table-scroll'), x = tableWindow.scrollX, y = tableWindow.scrollY;
      scroll.replaceChildren(...Array.from(pit.querySelector('.table-scroll').children,child=>target.importNode(child,true))); tableWindow.scrollTo(x,y);
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
        'body.table-window{height:auto;min-height:100dvh;padding:10px;display:block;overflow:visible;font-size:14px;line-height:1.4}',
        'body.table-window .pit{display:flex;flex:none;min-width:min-content;min-height:0;height:auto;margin:0;width:100%}',
        visual('body.table-window .pit',pit,['padding','border-radius','background','box-shadow']),
        'body.table-window .felt{display:flex;flex-direction:column;flex:1;min-width:min-content;min-height:0;overflow:clip}',
        visual('body.table-window .felt',pit.querySelector('.felt'),['padding','border-radius']),
        'body.table-window .felt-head{flex:none;margin-bottom:4px;gap:12px;height:24px}',
        'body.table-window .felt-head .arc-text{font-size:10px;letter-spacing:.2em;white-space:nowrap}',
        'body.table-window .table-scroll{flex:none;min-height:0;height:auto;overflow:visible;max-height:none}',
        visual('body.table-window #roundsTable', $('roundsTable'), ['min-width']),
        'body.table-window #roundsTable th{padding:6px 5px;font-size:11px;line-height:16px;letter-spacing:.1em;text-indent:0}',
        'body.table-window #roundsTable td{padding:4px 5px;font-size:13px}',
        'body.table-window[data-density=compact] #roundsTable td{padding-top:3px;padding-bottom:3px}',
        'body.table-window[data-density=compact] #roundsTable .card-label{width:27px;height:27px;font-size:12px}',
        visual('.density-control',density,['border','border-radius','background','color','padding','font'])
      ].join('\n');
      target.head.append(windowLayout);
      target.body.replaceChildren(target.importNode(pit,true));
      target.querySelector('.felt-head').append(target.importNode(density,true));
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
    document.addEventListener('change',scheduleRefresh);
    const observer = new MutationObserver(scheduleRefresh);
    observer.observe(pit,{subtree:true,childList:true,attributes:true,characterData:true});
    observer.observe(legacy,{subtree:true,childList:true,characterData:true});
    observer.observe($('modeStatus'),{subtree:true,childList:true,characterData:true}); observer.observe($('tvSummary'),{subtree:true,childList:true,characterData:true});
    new MutationObserver(scheduleRefresh).observe(document.body,{attributes:true,attributeFilter:['class','data-mode','data-sub','data-tsub']});
    new MutationObserver(scheduleRefresh).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
    new ResizeObserver(updateDataPlacement).observe(workspace);
    window.addEventListener('pagehide',()=>{ if (liveWindow()) tableWindow.close(); });
    window.DashboardUI = {refresh:scheduleRefresh,selectTab,get analysis(){return shared;}}; setDensity(tableDensity); layoutRoundTable(); refreshDashboard();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',buildDashboard); else buildDashboard();
})();
