// Read-only overview of the currently displayed shoe. Opening never edits cards.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const fullRounds = () => (currentRounds || []).filter(r => ['莊','閒','和'].includes(r.result));
  function longestRuns(rounds) {
    const best = {莊:0, 閒:0}; let side = null, run = 0;
    for (const r of rounds) {
      if (!(r.result in best)) { side = null; run = 0; continue; }
      run = r.result === side ? run + 1 : 1; side = r.result;
      best[side] = Math.max(best[side], run);
    }
    return best;
  }
  function init() {
    const button = document.createElement('button');
    button.id = 'btnShoeOverview'; button.className = 'tool-btn'; button.type = 'button';
    button.textContent = '牌靴總覽'; button.dataset.dashboardUi = '';
    button.setAttribute('aria-haspopup','dialog');
    $('btnTableWindow').before(button);
    const dialog = document.createElement('dialog'); dialog.id = 'shoeOverview';
    dialog.setAttribute('aria-labelledby','shoeOverviewTitle');
    dialog.innerHTML = `<header class="shoe-overview-head"><div class="shoe-overview-heading"><h2 id="shoeOverviewTitle">牌靴總覽</h2><p id="shoeOverviewMeta"></p></div><div id="shoeOverviewHeaderStats" class="shoe-overview-header-stats"></div><button type="button" class="tool-btn" id="shoeOverviewClose" aria-label="關閉牌靴總覽">關閉 ×</button></header>
      <div class="shoe-overview-body"><div id="shoeOverviewMetrics" class="shoe-overview-metrics"></div>
      <div class="shoe-overview-map"><div id="shoeOverviewMap"></div><div id="shoeOverviewViolationStrip" hidden><div id="shoeOverviewViolations"></div></div></div>
      <div class="shoe-overview-analysis"><section><h3>回復分析 <span>／ 分布</span></h3><div id="shoeOverviewRecovery"></div></section>
      <section><h3>安全切點</h3><div id="shoeOverviewSafe"></div></section></div></div>`;
    document.body.append(dialog);
    let returnFocus = null, frame = 0;
    function close() { if (!dialog.open) return; const focused = dialog.contains(document.activeElement); dialog.close(); if (focused && returnFocus?.isConnected) returnFocus.focus({preventScroll:true}); }
    $('shoeOverviewClose').onclick = close;
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && dialog.open) { e.preventDefault(); close(); } });
    function metric(label, value, note, key) {
      return `<div class="shoe-overview-metric" data-metric="${key}"><span>${label}</span><strong>${value}</strong><small title="${note}">${note}</small></div>`;
    }
    function render() {
      window.DashboardUI.refreshNow();
      const rounds = fullRounds(), all = currentRounds || [], total = rounds.length;
      const tv = document.body.dataset.mode === 'traverse', shared = window.DashboardUI.analysis;
      const cards = tv && IntegratedModes.traversal.result ? TraverseOptimizer.prepare(IntegratedModes.traversal.result) : all.flatMap(r=>r.cards);
      const recovery = shared.recovery || IntegratedAnalysis.recovery(all);
      const safe = shared.safe || IntegratedAnalysis.safe(cards, {
        tripleTie:$(tv ? 'tvTriple' : 'tripleTieRule').checked,
        signalRule:tv ? $('tvSignal').checked : true,
        signalConfig:{suits:SIGNAL_CONFIG.suits.slice(),ranks:SIGNAL_CONFIG.ranks.slice(),...(document.body.dataset.tsub==='asred0'?{allHearts:true}:{})}
      }, tv);
      const streaks = longestRuns(rounds), p7 = PlayerSevenLimits.check(rounds,null), seven = count7PtReversals(rounds);
      const b6 = rounds.flatMap((r,i)=>isBankerSixWinRound(r)?[i+1]:[]);
      const rare = rounds.flatMap((r,i)=>TwoThirteenReversals.classify(r)?[i+1]:[]);
      const list = numbers => numbers.length ? `第 ${numbers.join('、')} 局` : '無';
      $('shoeOverviewMeta').textContent = `${$('modeStatus').textContent.trim()} · ${total} 局 · ${cards.length} 張`;
      $('shoeOverviewMetrics').innerHTML = metric('莊6贏',`${b6.length} 局`,list(b6),'bankerSix')
        + metric('閒7莊6',`${p7.count} 局`,`${list(p7.roundNumbers)}（含對調）`,'playerSeven')
        + metric('七點逆轉',`${seven.count} 局`,list(seven.details.map(d=>d.roundIndex+1)),'seven')
        + metric('逆轉',`${rare.length} 局`,`1／13＋2／13 · ${list(rare)}`,'rare')
        + metric('最高連續莊／閒',`${streaks.莊}／${streaks.閒} 局`,'和局中斷連續計數','streaks');
      const stats = calculateViolationStats(all);
      const cannotSwap = calculateCannotSwapViolations(all);
      stats.cannotSwapViolations = cannotSwap.count; stats.cannotSwapRounds = cannotSwap.rounds;
      renderShoeMap(rounds, stats, $('shoeOverviewMap'));
      const outcomes = [['莊','var(--banker)'],['閒','var(--player)'],['和','var(--tie)']].map(([name,color])=>({name,color,count:rounds.filter(r=>r.result===name).length}));
      const violations = [
        ['訊號牌',stats.signalViolations,list(stats.signalViolationRounds || [])],
        ['連續5局4張',stats.fourCardViolations,$('fourCardViolationDetail').textContent],
        ['連續莊閒',stats.streakViolations,$('streakViolationDetail').textContent],
        ['無法對調',stats.cannotSwapViolations,list(stats.cannotSwapRounds || [])],
        ['張數',stats.cardCountMismatchViolations,list(stats.cardCountMismatchRounds || [])],
        ['卡色',stats.cardColorChecked ? stats.cardColorViolations : null,list(stats.cardColorRounds || [])]
      ];
      const violatingTypes=violations.filter(([,count])=>count>0).length, unchecked=violations.filter(([,count])=>count===null).map(([name])=>name);
      const state=violatingTypes?`違規 ${violatingTypes} 項${unchecked.length?' · 部分未檢查':''}`:unchecked.length?`已檢查項目無違規 · ${unchecked.join('、')}未檢查`:'無違規';
      $('shoeOverviewHeaderStats').innerHTML = outcomes.map(o=>`<span class="shoe-overview-outcome" style="--outcome:${o.color}"><b>${o.name}</b><strong>${o.count}</strong><small>${(o.count/total*100).toFixed(1)}%</small></span>`).join('')+`<span class="shoe-overview-status ${violatingTypes?'has-violation':''}">${state}</span>`;
      const vio = $('shoeOverviewViolations'); vio.replaceChildren();
      for (const [name,count,detail] of violations) {
        if (count===0) continue;
        const row = document.createElement('div'); row.className = 'shoe-overview-violation' + (count ? ' has-violation' : '');
        const label = document.createElement('span'), value = document.createElement('span'); label.textContent = name;
        value.textContent = count === null ? '未檢查' : count ? `${count} 處 · ${detail}` : '無'; value.title=value.textContent; row.append(label,value); vio.append(row);
      }
      $('shoeOverviewViolationStrip').hidden = !vio.childElementCount;
      const failed = recovery?.recoveryDetails.filter(d=>d.failed).length || 0;
      $('shoeOverviewRecovery').innerHTML = recovery ? `<div class="shoe-overview-recovery"><div>平均回復<strong>${recovery.avgRounds} 局</strong><small>${recovery.avgCards} 張</small></div><div>最大消耗<strong>${recovery.maxRounds} 局</strong><small>${recovery.maxCards} 張</small></div></div>
        ${[['立即','immediate'],['1–5局','range1to5'],['6–10局','range6to10'],['11–15局','range11to15'],['16局以上','range16plus']].map(([name,key])=>{
          const pct = recovery.distribution[key]/recovery.totalCards*100;
          return `<div class="dash-range"><span>${name}</span><div><i style="width:${pct}%"></i></div><b>${pct.toFixed(1)}%</b></div>`;
        }).join('')}<p class="shoe-overview-note">回復＝接回原局起點；${failed} 個切點未回復（列入16局以上）。</p>` : '<p>尚無回復資料</p>';
      const safeBox = $('shoeOverviewSafe'); safeBox.replaceChildren();
      if (safe) {
        const summary = document.createElement('p'); summary.className = 'shoe-overview-safe-total';
        summary.innerHTML = `<strong>${safe.count}</strong>／${safe.depths.length} 點 <span>（${(safe.count/safe.depths.length*100).toFixed(1)}%）</span>`; safeBox.append(summary);
        const grid = document.createElement('div'); grid.className = 'shoe-overview-cut-grid';
        safe.depths.forEach((depth,i)=>{ const cell=document.createElement('span'); cell.className=depth===0?'safe':''; cell.title=`第 ${i+1} 張：${depth===0?'安全':`最後違規第 ${depth} 局`}`; grid.append(cell); }); safeBox.append(grid);
        const note = document.createElement('p'); note.className='shoe-overview-note';
        const excluded = tv ? cards.filter(c=>!c.traverse).length : 0;
        note.textContent = `${tv?'原始牌序':'目前牌表'}張號；綠色＝安全，其餘＝有違規，不計卡色。${excluded?`不檢查含剩牌的局（剩牌 ${excluded} 張）。`:''}`;
        if (shared.sens) note.textContent += ` 全敏分析：平均不敏感 ${shared.sens.avg.toFixed(1)} 局；全敏感切點 ${shared.sens.counts.filter(n=>n===0).length}／416。`;
        safeBox.append(note);
      } else safeBox.textContent='尚無安全切點資料';
    }
    function show() {
      if (!fullRounds().length || document.body.classList.contains('running')) return;
      render();
      if (!dialog.open) { returnFocus=document.activeElement; dialog.style.left=''; dialog.style.top=''; dialog.style.transform=''; dialog.show(); $('shoeOverviewClose').focus({preventScroll:true}); }
    }
    button.onclick = show;
    $('shoeOverviewMap').addEventListener('click',e=>{ if(e.target.closest('[data-round]'))close(); });
    document.addEventListener('shoe-generated',()=>{ cancelAnimationFrame(frame); frame=requestAnimationFrame(show); });
    let signature = '';
    const sync = () => {
      const next = [document.body.dataset.mode,document.body.dataset.sub,document.body.dataset.tsub].join('/');
      const running = document.body.classList.contains('running'), empty = !fullRounds().length;
      button.disabled = running || empty;
      if (running || empty || next !== signature) { close(); cancelAnimationFrame(frame); }
      signature=next;
    };
    new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['class','data-mode','data-sub','data-tsub']}); sync();
    // Match the existing draggable analysis window, keeping its close control reachable.
    const head = dialog.querySelector('header'); let drag = null;
    head.addEventListener('pointerdown',e=>{ if(e.button!==0||e.target.closest('button'))return; const r=dialog.getBoundingClientRect(); drag={x:e.clientX,y:e.clientY,left:r.left,top:r.top}; head.setPointerCapture(e.pointerId); });
    head.addEventListener('pointermove',e=>{ if(!drag)return; dialog.style.transform='none'; dialog.style.left=Math.max(0,Math.min(innerWidth-dialog.offsetWidth,drag.left+e.clientX-drag.x))+'px'; dialog.style.top=Math.max(0,Math.min(innerHeight-64,drag.top+e.clientY-drag.y))+'px'; });
    ['pointerup','pointercancel'].forEach(name=>head.addEventListener(name,()=>{drag=null;}));
    window.ShoeOverview = {show,close,longestRuns};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
