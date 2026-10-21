// Two generators share the same signal controls, Card model, table and editing UI.
// Standard code is vendored under standard/; the source project remains untouched.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  // Keep both modes' settings in the original black-and-gold control deck.
  document.querySelector('.expanders').appendChild($('traverseControls'));
  document.querySelector('.expanders').appendChild($('standardControls'));
  $('sharedSignalSettings').addEventListener('click',()=>{ if(!busy&&!window.__isGeneratingShoe)document.querySelector('[data-panel="pSet"]').click(); });
  const B = TraverseBuilder, E = TraverseExport, O = TraverseOptimizer;
  const copy = x => JSON.parse(JSON.stringify(x));
  const esc = x => String(x).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const original = { refresh: refreshAnalysisAndRender, violations: calculateViolationStats,
    cannotSwap: calculateCannotSwapViolations, verify: verifyShoeRules, clear: clearAll, export: exportRoundsAsExcelWithDrive, stats: updateStats };
  updateStats=function(data){original.stats(data);const rs=(currentRounds||[]).filter(r=>r.cards&&[4,5,6].includes(r.cards.length));$('sharedCardCounts').textContent=rs.length?[4,5,6].map(n=>{const count=rs.filter(r=>r.cards.length===n).length;return `${n}張 ${count}局（${(count/rs.length*100).toFixed(1)}%）`;}).join('／'):'';};
  let mode = 'standard', sub = (window.StandardProfiles&&StandardProfiles.current)||'red0', busy = false, stopped = false, optimization = null;
  const controlIds = ['tvMin','tvMax','tvIdle','tvTries','tvChain','tvLeft','tvTriple','tvB6','tvP7','tvSignal','tvStrong','tvSecond','tvNine','tvSide','tvSideLimit','tvTieMax','tv4Min','tv4Max','tv5Min','tv5Max','tv6Min','tv6Max'];
  const standardSizeControlIds = [4,5,6].flatMap(n=>[`st${n}Min`,`st${n}Max`]);
  // 穿越紅0／穿越A2：同一個穿越引擎，各自保存設定、訊號牌與牌靴；states.traverse 永遠指向目前的穿越牌靴
  const TV_NAME = { red0:'穿越紅0', a2:'穿越A2' };
  const TV_KEY = { red0:'integrated-traverse-red0', a2:'integrated-traverse-a2' }, TV_SUB_KEY = 'integrated-traverse-sub';
  const TV_RULES = {
    red0: { tvTriple:true, tvB6:true, tvP7:true, tvNine:false, tvTieMax:'4', tvSideLimit:'8', tvSignal:true, signal:{ suits:['♥','♦'], ranks:['10','J','Q','K'] } },
    a2:   { tvTriple:true, tvB6:false, tvP7:false, tvNine:true, tvTieMax:'', tvSideLimit:'8', tvSignal:true, signal:{ suits:['♠','♥','♦','♣'], ranks:['A','2'] } }
  };
  const tvBase = (() => {   // 非規則欄位起始值：HTML 預設，再套用舊的 integrated-traverse-settings（只讀，不搬移）
    const o = {}; controlIds.forEach(id => { const el = $(id); o[id] = el.type === 'checkbox' ? el.checked : el.value; });
    try { const old = JSON.parse(localStorage.getItem('integrated-traverse-settings') || '{}'); controlIds.forEach(id => { if (old[id] !== undefined) o[id] = old[id]; }); } catch (_) {}
    return o;
  })();
  let tsub = (() => { try { const v = localStorage.getItem(TV_SUB_KEY); if (v === 'red0' || v === 'a2') return v; } catch (_) {} return 'red0'; })();
  const fresh = () => ({ result: null, cut: 0, analysis: null, view: 'after', optimization: null });
  const tstates = { red0: fresh(), a2: fresh() };
  const states = { red0: null, a2: null };
  Object.defineProperty(states, 'traverse', { get: () => tstates[tsub], enumerable: true });
  function tvLoad(t) {
    const p = Object.assign({}, tvBase, TV_RULES[t]); p.signal = copy(TV_RULES[t].signal);
    try { const raw = localStorage.getItem(TV_KEY[t]); if (raw) { const s = JSON.parse(raw); Object.keys(s).forEach(k => { if (s[k] !== undefined && s[k] !== null) p[k] = s[k]; }); } } catch (_) {}
    return p;
  }
  function tvCollect(signal) { const p = {}; controlIds.forEach(id => { const el = $(id); p[id] = el.type === 'checkbox' ? el.checked : el.value; }); p.signal = copy(signal); return p; }
  function tvSave(t, signal) {
    const p = tvLoad(t); controlIds.forEach(id => { const el = $(id); p[id] = el.type === 'checkbox' ? el.checked : el.value; });
    if (signal) p.signal = copy(signal);
    try { localStorage.setItem(TV_KEY[t], JSON.stringify(p)); } catch (_) {}
  }
  const num = id => Number($(id).value);
  const config = () => ({ suits: SIGNAL_CONFIG.suits.slice(), ranks: SIGNAL_CONFIG.ranks.slice() });
  function rules() { return { tripleTie: $('tvTriple').checked, signalRule: $('tvSignal').checked,
    strong: $('tvStrong').checked, secondStart: $('tvSecond').checked, skipBanker6: $('tvB6').checked, skipPlayer7: $('tvP7').checked, signalConfig: config(), preserveLastNine: $('tvNine').checked }; }
  function setRules() { Object.assign(B.rules, rules()); }
  function plain(card) { return { rank: card.rank, suit: card.suit, point: typeof card.point === 'function' ? card.point() : card.point,
    back_color: card.back_color, traverse: !!card.traverse }; }
  function toRounds(cards) {
    return E.dealRounds(cards).map(r => ({ start_index: r.start, result: r.result, segment: r.segment,
      sensitive: !!r.hand && B.handSensitive(r.cards.map(c => c.point)),
      cards: r.cards.map((c,i) => Object.assign(new Card(c.rank,c.suit,r.start+i), {back_color:c.back_color,traverse:c.traverse})),
      isT: !!r.hand && B.isTriple(r.cards.map(c => c.point)) }));
  }
  function baseCards() { return states.traverse.result ? O.prepare(states.traverse.result) : []; }
  function displayedCards() { return E.cutDeck(baseCards(), states.traverse.cut); }
  function absorbEdits() {
    if (!states.traverse.result || !currentRounds) return;
    const cards = currentRounds.flatMap(r => r.cards.map(plain));
    if (cards.length !== 416) return;
    const cut = states.traverse.cut;
    states.traverse.result.cards = cut ? cards.slice(416-cut).concat(cards.slice(0,416-cut)) : cards;
  }
  function violationGroups(rounds) {
    const out = { noSwap:[],same:[],triple:[],signal:[],color:[] };
    const full = rounds.filter(r => r.hand);
    full.forEach((r,i) => {
      const p = r.cards.map(c=>c.point), sw = E.swappedTotals(r);
      if (!sw || sw.size !== r.hand.size) out.noSwap.push(i+1);
      else if (!B.handSensitive(p)) out.same.push(i+1);
      if (!['RRRB','BBBR'].includes(r.cards.slice(0,4).map(c=>c.back_color).join(''))) out.color.push(i+1);
      if (full.length < 2) return;
      const prev=full[(i+full.length-1)%full.length], trip=B.isTriple(prev.cards.map(c=>c.point));
      if ($('tvTriple').checked && trip !== (r.result==='和')) out.triple.push(i+1);
      if (i && $('tvSignal').checked && !($('tvTriple').checked && trip)) {
        const need=B.isSignalHand(prev.cards,config())?'莊':'閒';
        if (r.result==='和' ? (!$('tvTriple').checked && need==='莊') : r.result!==need) out.signal.push(i+1);
      }
    });
    return out;
  }
  function traversalStats(rounds) {
    const g=violationGroups(E.dealRounds(rounds.flatMap(r=>r.cards.map(plain))));
    return { signalViolations:g.signal.length+g.triple.length,signalViolationRounds:[...new Set([...g.signal,...g.triple])],
      fourCardViolations:0,fourCardBlocks:[],streakViolations:0,streakBlocks:[],
      cannotSwapViolations:g.noSwap.length+g.same.length,cannotSwapRounds:[...new Set([...g.noSwap,...g.same])],
      cardCountMismatchViolations:0,cardCountMismatchRounds:[],cardColorViolations:g.color.length,cardColorRounds:g.color,cardColorChecked:true };
  }
  calculateViolationStats = function(rounds) { return mode==='traverse' ? traversalStats(rounds) : original.violations(rounds); };
  calculateCannotSwapViolations = function(rounds) { if(mode!=='traverse')return original.cannotSwap(rounds); const s=traversalStats(rounds);return {count:s.cannotSwapViolations,rounds:s.cannotSwapRounds}; };
  verifyShoeRules = function(rounds,options) { if(mode==='standard')return original.verify(rounds,options); renderTraverse();return true; };
  refreshAnalysisAndRender = function(options={}) {
    if(mode==='standard')return original.refresh(options);
    absorbEdits(); clearOptimization(); renderTraverse();
  };
  function clearOptimization() { optimization=null;OptimizerDialog.reset(); }
  function recheckChains() {
    const result=states.traverse.result;if(!result)return;
    setRules();const cards=baseCards();
    result.chains.forEach(ch=>{
      const points=Array.from({length:ch.length},(_,i)=>cards[(ch.start-1+i)%416].point);
      points.parts=ch.parts;points.secondParts=ch.secondParts;
      const rs=B.roundsFromStart(points);
      ch.traverse=B.isTraverse(points);ch.rounds=rs?rs.length:0;
      ch.allSensitive=!!rs&&rs.every(r=>B.handSensitive(points.slice(r.start,r.start+r.size)));
      ch.qualified=B.qualifiesFinal(points);
    });
  }
  function refreshSharedTable(preserveMarks=false) {
    if(!preserveMarks){swapBankerSixIndexes=new Set();bankerSixIndexes=new Set();currentAnalysis=null;}editEnabled=!!currentRounds?.length;
    updateStats(buildStatsFromRounds());
    renderRoundsTable(currentRounds,null);
    renderDeckSummary(computeDeckSummary(currentRounds));
    renderStatsGridPreview(currentRounds);
    refreshViolationStats();
    if(currentRounds?.length)runRecoveryAnalysis();
    setEditButtonsAvailability(editEnabled);resetEditState();
    $('tblEmpty').style.display=editEnabled?'none':'';
  }
  function renderTraverse() {
    const t=states.traverse, result=t.result;
    setRules();
    if(!result){original.clear();$('roundsBody').innerHTML='';$('tblEmpty').style.display='';$('tvSummary').textContent='';$('tvSafeCount').textContent='尚未排牌';$('tvBucketSummary').textContent='';$('tvSafeCuts').innerHTML='';$('tvCutBuckets').textContent='';$('tvChains').querySelector('tbody').innerHTML='';$('tvDiagnostics').innerHTML='';$('tvProgress').textContent='尚未排牌';return;}
    recheckChains();
    currentRounds=toRounds(displayedCards());
    refreshSharedTable();
    t.analysis=O.analyze(baseCards(),rules());
    const s=result.stats, g=violationGroups(E.dealRounds(displayedCards()));
    $('tvSummary').textContent=`穿越段 ${416-result.leftoverCount} 張｜剩牌 ${result.leftoverCount} 張｜長段 ${result.chains.length} 段｜長段驗證 ${result.chains.every(c=>c.qualified)?'通過':'有問題'}｜重跑 ${result.reruns||0} 次｜卡色違規 ${g.color.length} 局｜敏感局違規 ${g.noSwap.length+g.same.length} 局｜三條 ${g.triple.length} 局｜訊號 ${g.signal.length} 局｜${((result.totalMs??s.ms)/1000).toFixed(1)} 秒`;
    $('tvSafeCount').textContent=`${t.analysis.count}／416`;
    const buckets=new Map();t.analysis.depths.forEach(d=>buckets.set(d,(buckets.get(d)||0)+1));
    const sortedBuckets=[...buckets].sort((a,b)=>a[0]-b[0]);
    const deepest=sortedBuckets.at(-1)?.[0]||0;
    $('tvBucketSummary').textContent=`安全 ${t.analysis.count} 點／其餘 ${416-t.analysis.count} 點${deepest?`；違規最深至第 ${deepest} 局`:''}。`;
    $('tvCutBuckets').innerHTML=sortedBuckets.map(([d,n])=>`<div class="cut-bucket"><span>${d?`第 ${d} 局`:'安全'}</span><strong>${n} 點</strong></div>`).join('');
    $('tvSafeCuts').innerHTML=t.analysis.safe.map(c=>`<button class="tool-btn" data-tv-cut="${c}">${c+1}</button>`).join('')||'沒有安全切點';
    $('tvChains').querySelector('tbody').innerHTML=result.chains.map((c,i)=>`<tr><td>${i+1}</td><td>${c.start}</td><td>${c.length}</td><td>${c.rounds}</td><td>${c.traverse?'✓':'✗'}</td><td>${c.allSensitive?'✓':'✗'}</td><td>${c.qualified?'✓':'✗'}</td></tr>`).join('');
    const issues=result.signal?.issues||[];
    $('tvDiagnostics').innerHTML=(issues.length?'<p>生成時訊號調整檢查（保留當時紀錄）：</p>'+issues.map(i=>`<p>${esc(i.message||JSON.stringify(i))}</p>`).join(''):'<p>生成時沒有訊號調整診斷。</p>')+'<p>長段驗證及上方違規統計依目前牌表重新計算。</p>';
    $('tvOptimize').disabled=busy; $('btnRecordDeckOrder').disabled=false;
    document.body.classList.add('finished');
  }
  function snapshot() { return { rounds:currentRounds,analysis:currentAnalysis,deck:originalDeckOrder,originalRounds,
    editEnabled, imported:window.__importedShoeMode,cut:$('cutPos').value,frozen:frozenGridHTML,
    swapSix:new Set(swapBankerSixIndexes),bankerSix:new Set(bankerSixIndexes),violations:new Set(violationRoundIndexes) }; }
  const SUB_NAME = { red0:'紅0模式', a2:'A2模式' };
  function currentSignal() { return { suits:SIGNAL_CONFIG.suits.slice(), ranks:SIGNAL_CONFIG.ranks.slice() }; }
  function applyProfile(name) {
    // 套用該模式的設定欄與訊號牌（走真實 updateSignalConfig → persist／sync／display）
    const p = StandardProfiles.fillInputs(name);
    StandardProfiles.setCurrent(name);
    updateSignalConfig({ suits:p.signal.suits.slice(), ranks:p.signal.ranks.slice() });
    $('stTitle').textContent = SUB_NAME[name]+' 設定';
    document.body.dataset.sub = name;
    ExportFilename.setMode('standard-' + name);
    setStandardCollapsed($('standardControls').classList.contains('collapsed'));
  }
  function applyTraverseProfile(t) {
    const p = tstates[t].live || tvLoad(t);   // 離開時的即時狀態（含示範改過的值）優先，確保回來時與牌靴一致
    controlIds.forEach(id => { const el = $(id); el[el.type === 'checkbox' ? 'checked' : 'value'] = p[id]; });
    tsub = t; try { localStorage.setItem(TV_SUB_KEY, t); } catch (_) {}
    updateSignalConfig({ suits:p.signal.suits.slice(), ranks:p.signal.ranks.slice() });
    $('tvTitle').textContent = TV_NAME[t] + '設定';
    document.body.dataset.tsub = t;
    ExportFilename.setMode('traverse-' + t);
    setSettingsCollapsed(document.body.classList.contains('dashboard') ? $('traverseControls').classList.contains('collapsed') : !!tstates[t].result);
  }
  function refreshModeButtons() {
    [['modeRed0','standard','red0'],['modeA2','standard','a2'],['modeTraverse','traverse','red0'],['modeTraverseA2','traverse','a2']].forEach(([id,m,s]) => {
      const on = mode === m && (m === 'standard' ? sub : tsub) === s;
      $(id).classList.toggle('active', on); $(id).setAttribute('aria-pressed', on);
    });
  }
  function switchMode(next) {
    if(next==='standard')next=sub;
    if(next==='traverse')next='traverse-'+tsub;
    if(next==='traverse-red0'||next==='traverse-a2'){} else if(next!=='red0'&&next!=='a2')return;
    const isTr=next.startsWith('traverse-'), nextSub=isTr?next.slice(9):next;
    if(busy||window.__isGeneratingShoe||(isTr?(mode==='traverse'&&nextSub===tsub):(mode==='standard'&&nextSub===sub)))return;
    if(mode==='standard'){states[sub]=snapshot();StandardProfiles.save(sub,currentSignal());}else{absorbEdits();OptimizerDialog.reset();tstates[tsub].optimization=optimization;optimization=null;tstates[tsub].live=tvCollect(currentSignal());}
    mode=isTr?'traverse':'standard';document.body.dataset.mode=mode;
    if(isTr){tsub=nextSub;applyTraverseProfile(tsub);optimization=tstates[tsub].optimization||null;$('tvOptimize').disabled=!tstates[tsub].result;$('btnOptOpen').disabled=!optimization;}
    else{sub=nextSub;applyProfile(sub);}
    refreshModeButtons();
    $('traverseControls').hidden=$('traverseTools').hidden=mode!=='traverse';$('standardControls').hidden=mode==='traverse';
    $('modeStatus').textContent=mode==='standard'?SUB_NAME[sub]:TV_NAME[tsub]+'模式';
    $('btnAutoColor').textContent=mode==='traverse'?'卡色':'換色';
    document.querySelectorAll('#toolCats .tool').forEach(t=>t.classList.remove('active'));
    document.querySelectorAll('.tool-panel').forEach(p=>p.classList.remove('open'));
    $('pCond').classList.remove('open');document.querySelector('[data-panel="pCond"]').classList.remove('active');
    $('pSet').classList.remove('open');document.querySelector('[data-panel="pSet"]').classList.remove('active');
    if(mode==='standard'){
      const st=states[sub];
      currentRounds=st?.rounds||null;currentAnalysis=st?.analysis||null;originalDeckOrder=st?.deck||null;originalRounds=st?.originalRounds||null;editEnabled=!!st?.editEnabled;window.__importedShoeMode=!!st?.imported;
      frozenGridHTML=st?.frozen||null;if($('frozenGridContainer')){$('frozenGridContainer').style.display=frozenGridHTML?'block':'none';if($('frozenGrid'))$('frozenGrid').innerHTML=frozenGridHTML||'';}
      swapBankerSixIndexes=st?.swapSix||new Set();bankerSixIndexes=st?.bankerSix||new Set();violationRoundIndexes=st?.violations||new Set();
      $('cutPos').value=st?.cut||'';
      // Standard analysis calls ensureTRoundHasNoSignal even with mutate:false.
      // Restoring a mode must only render; never run that mutating analysis here.
      if(currentRounds)refreshSharedTable(true);else{original.clear();}
      setEditButtonsAvailability(editEnabled);resetEditState();$('tblEmpty').style.display=currentRounds?'none':'';
      if(currentRounds)runRecoveryAnalysis();
    }else{if($('frozenGridContainer'))$('frozenGridContainer').style.display='none';frozenGridHTML=null;window.__importedShoeMode=false;originalDeckOrder=null;originalRounds=null;$('cutPos').value=states.traverse.cut;renderTraverse();if(optimization)$('btnOptOpen').disabled=false;}
    document.body.classList.toggle('finished',!!currentRounds?.length);
    log(`已切換${mode==='standard'?SUB_NAME[sub]:TV_NAME[tsub]}；各模式保留各自牌靴。`,'info');
  }
  function lock(value) {
    busy=value;window.__isGeneratingShoe=value;window.__stopGenerateRequested=false;
    $('generateBtn').disabled=value;$('stopGenerateBtn').disabled=!value;
    $('generatingOverlay').classList.toggle('active',value);document.body.classList.toggle('running',value);
    ['modeRed0','modeA2','modeTraverse','modeTraverseA2','sharedSignalSettings','exportFilename',...controlIds,'tvDemo','tvOptimize','btnOptBefore','btnOptAfter','btnOptOriginalCut'].forEach(id=>$(id).disabled=value);
    document.querySelectorAll('.suit-button,.rank-button,.quick').forEach(el=>{el.style.pointerEvents=value?'none':'';el.setAttribute('aria-disabled',value);});
    document.querySelectorAll('.suit-checkbox,.rank-checkbox').forEach(el=>el.disabled=value);
    if(!value)$('tvOptimize').disabled=!states.traverse.result;
  }
  function status(message) { $('tvProgress').textContent=message;$('generatingText').textContent=message; }
  function rotateResult(result,k) { if(!k)return;result.cards=E.cutDeck(result.cards,k);result.chains.forEach(c=>c.start=(c.start-1-k+416)%416+1); }
  // 4／5／6 張局上下限：留白＝不限；回傳 { limits } 或 { error }
  function sizeLimits() {
    const out={};let any=false;
    for(const k of [4,5,6]){
      const read=id=>{const raw=$(id).value.trim();if(raw==='')return null;const v=Number(raw);return Number.isInteger(v)&&v>=0&&v<=104?v:NaN;};
      const min=read(`tv${k}Min`),max=read(`tv${k}Max`);
      if(Number.isNaN(min)||Number.isNaN(max))return {error:`${k}張局上下限須為 0～104 的整數或留白`,focus:Number.isNaN(min)?`tv${k}Min`:`tv${k}Max`};
      if(min!==null&&max!==null&&min>max)return {error:`${k}張局下限不能大於上限`,focus:`tv${k}Min`};
      out[k]={min,max};if(min!==null||max!==null)any=true;
    }
    return {limits:any?out:null};
  }
  // 整副（依實際發牌起點）不符合上下限時回傳說明，符合回傳空字串
  function sizeMiss(cards,cut,limits){
    if(!limits)return '';
    const rs=E.dealRounds(E.cutDeck(cards,cut)).filter(r=>r.hand),c={4:0,5:0,6:0};rs.forEach(r=>{if(c[r.cards.length]!==undefined)c[r.cards.length]++;});
    for(const k of [4,5,6]){const {min,max}=limits[k];if(min!==null&&c[k]<min)return `${k}張局 ${c[k]} 局，低於下限 ${min}`;if(max!==null&&c[k]>max)return `${k}張局 ${c[k]} 局，超過上限 ${max}`;}
    return '';
  }
  // 排好牌後把設定收成一行摘要，主表格往上移；點「展開設定」可再展開
  function settingsSummary() {
    const parts=[`${$('tvMin').value}～${$('tvMax').value}張`,`剩牌${$('tvLeft').value.trim()===''?'不限':'≤'+$('tvLeft').value}`];
    if($('tvTieMax').value.trim()!=='')parts.push(`和局≤${$('tvTieMax').value}`);
    if($('tvSideLimit').value.trim()!=='')parts.push(`莊閒差距≤${$('tvSideLimit').value}`);
    for(const k of [4,5,6]){const lo=$(`tv${k}Min`).value.trim(),hi=$(`tv${k}Max`).value.trim();if(lo||hi)parts.push(`${k}張局${lo?'≥'+lo:''}${lo&&hi?'、':''}${hi?'≤'+hi:''}`);}
    const on=[['tvTriple','三條'],['tvB6','莊6'],['tvP7','閒7'],['tvSignal','訊號牌'],['tvStrong','強'],['tvSecond','第二張敏感'],['tvNine','末張9']].filter(([id])=>$(id).checked).map(([,n])=>n);
    return parts.join('｜')+'｜'+(on.length?on.join('・'):'規則全關');
  }
  function setSettingsCollapsed(value) {
    $('traverseControls').classList.toggle('collapsed',value);$('tvSettingsSummary').textContent=value?settingsSummary():'';
    $('tvSettingsToggle').textContent=value?'展開設定':'收合設定';$('tvSettingsToggle').setAttribute('aria-expanded',String(!value));
  }
  function tieCount(cards,cut=0){return E.dealRounds(E.cutDeck(cards,cut)).filter(r=>r.hand&&r.result==='和').length;}
  function sideDiff(cards,cut=0){const rs=E.dealRounds(E.cutDeck(cards,cut)).filter(r=>r.hand);return Math.abs(rs.filter(r=>r.result==='莊').length-rs.filter(r=>r.result!=='莊').length);}
  function nineCut(result) {
    const cs=O.prepare(result), a=O.analyze(cs,rules());
    const candidates=E.dealRounds(cs).filter(r=>r.hand&&r.cards.at(-1).rank==='9').map(r=>(r.start+r.cards.length)%416).filter(c=>a.depths[c]===0);
    return candidates.length?candidates[Math.floor(Math.random()*candidates.length)]:null;
  }
  async function generateTraverse(demo=false) {
    if(busy||window.__isGeneratingShoe)return;
    // 先送出正在輸入的設定，避免排完收合設定時才觸發「條件已變更」蓋掉結果訊息
    if($('traverseControls').contains(document.activeElement))document.activeElement.blur();
    const min=num('tvMin'),max=num('tvMax');
    if(!Number.isInteger(min)||!Number.isInteger(max)||min<4||max>416||min>max){status('張數範圍須為 4～416 的整數，最少不能大於最多');return;}
    for(const id of ['tvIdle','tvTries','tvChain'])if(!Number.isInteger(num(id))||num(id)<1){status('撿段、補排與接段次數須為正整數');$(id).focus();return;}
    const optLimit=id=>{const raw=$(id).value.trim();if(raw==='')return null;const v=Number(raw);return Number.isInteger(v)&&v>=0&&v<=104?v:NaN;};
    const sideLimit=optLimit('tvSideLimit'),tieMax=optLimit('tvTieMax');
    if(Number.isNaN(sideLimit)){status('莊閒差距須為 0～104 的整數或留白');$('tvSideLimit').focus();return;}
    if(Number.isNaN(tieMax)){status('和局上限須為 0～104 的整數或留白');$('tvTieMax').focus();return;}
    applySignalConfig();stopped=false;clearOptimization();lock(true);const started=Date.now();let reruns=0,result,cut=null;
    const limit=$('tvLeft').value.trim()===''?null:num('tvLeft');
    if(limit!==null&&(!Number.isInteger(limit)||limit<0||limit>416)){status('剩牌上限須為 0～416 的整數或留白');lock(false);return;}
    const sizes=demo?{limits:null}:sizeLimits();
    if(sizes.error){status(sizes.error);$(sizes.focus).focus();lock(false);return;}
    let lastMiss='';
    try {
      let seed=1139;const rng=()=>{let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};
      if(demo){persistSignalConfig({suits:['♠','♥','♦','♣'],ranks:['A','2']});syncUiFromSignalConfig();updateSignalConfigDisplay();$('tvTriple').checked=$('tvSignal').checked=$('tvNine').checked=true;$('tvStrong').checked=$('tvSecond').checked=$('tvB6').checked=$('tvP7').checked=false;}
      for(;;){
        const opts={...rules(),minLen:demo?8:min,maxLen:demo?12:max,idleLimit:num('tvIdle'),computeTries:num('tvTries'),chainAttempts:num('tvChain'),sizeLimits:sizes.limits,sideLimit:demo?null:sideLimit,tieMax:demo?null:tieMax,
          onProgress:m=>status(`${reruns?`［重跑 ${reruns} 次${lastMiss?`｜上一副${lastMiss}`:''}］`:''}${m}`),isCancelled:()=>stopped};
        if(demo)opts.rng=rng;else if(limit!==null&&!opts.strong)opts.rejectAbove=limit;
        result=await B.build(opts);
        if(result.rejected){if(stopped){delete opts.rejectAbove;result=await B.build({...opts,idleLimit:50});break;}reruns++;continue;}
        if(stopped||opts.strong)break;
        if(!demo&&limit!==null&&result.leftoverCount>limit){reruns++;continue;}
        if(B.SIGNAL_RETRY_ENABLED&&result.signal&&!result.signal.ok&&!demo){reruns++;continue;}
        cut=$('tvNine').checked?nineCut(result):null;
        if(!demo&&sideLimit!==null&&sideDiff(result.cards,cut||0)>sideLimit){lastMiss=`莊閒差距超過 ${sideLimit}`;reruns++;continue;}
        if(!demo&&tieMax!==null&&tieCount(result.cards,cut||0)>tieMax){lastMiss=`和局超過 ${tieMax} 局`;reruns++;continue;}
        if(!demo){const miss=sizeMiss(result.cards,cut||0,sizes.limits);if(miss){lastMiss=miss;reruns++;continue;}}
        break;
      }
      result.reruns=reruns;result.totalMs=Date.now()-started;rotateResult(result,cut||0);
      states.traverse.result=result;states.traverse.cut=0;$('cutPos').value=0;
      if(!document.body.classList.contains('dashboard'))setSettingsCollapsed(true);document.querySelectorAll('#traverseTools details').forEach(d=>{d.open=false;});
      renderTraverse();status(`${stopped?'已停止，保留目前結果':demo?'示範牌已排好':'完成'}｜重跑 ${reruns} 次${$('tvNine').checked?(cut!==null?'｜末張 9 已套用':'｜未找到安全末張 9，保留牌序'):''}`);
      log($('tvProgress').textContent,'success');
    }catch(e){status(`排牌失敗：${e.message}`);console.error(e);}finally{lock(false);}
  }
  function cutTraverse(cut) {
    if(!states.traverse.result)return;
    if(!Number.isInteger(cut)||cut<0||cut>415){status('切牌張數須為 0～415 的整數');return;}
    absorbEdits();states.traverse.cut=cut;$('cutPos').value=cut;renderTraverse();status(`已切 ${cut} 張，從原第 ${cut+1} 張發牌（${states.traverse.analysis.depths[cut]===0?'安全':'不安全'}）`);
  }
  function recolor() {
    if(!states.traverse.result)return;absorbEdits();const colored=B.reassignColors(displayedCards());
    if(!colored.ok){status('找不到完整牌庫可用的卡色配置，保留原牌');return;}
    currentRounds=toRounds(colored.cards);absorbEdits();clearOptimization();renderTraverse();status(`已依目前起點重新卡色（調整 ${colored.changed} 張），牌面順序保留`);
  }
  const cardLabel=c=>`<span class="card-label ${B.isSignalCard(c,config())?'s-signal-card ':''}card-back-${c.back_color==='R'?'red':'blue'}">${esc(c.rank==='10'?'T':c.rank)}${esc(c.suit)}</span>`;
  function showVersion(version) {
    if(!optimization||busy)return;states.traverse.view=version;states.traverse.result=copy(optimization[version]);renderTraverse();
    $('optimizerView').textContent=`下方牌表：${version==='before'?'調整前':'調整後'}｜切 ${states.traverse.cut} 張`;
  }
  function comparisonRow(cards,moved,origins) {
    return cards.map((c,i)=>`<div class="optimizer-card-slot">${moved[i]?cardLabel(c).replace('class="card-label ','class="card-label moved '):cardLabel(c)}<span>${origins?'原第 '+origins[i]+' 張':'第 '+(i+1)+' 張'}</span></div>`).join('');
  }
  function comparison() {
    const o=optimization;
    $('optimizerSummary').textContent=`安全切點 ${o.initial.count} → ${o.final.count}（增加 ${o.final.count-o.initial.count}）｜調整 ${o.changes.length} 局`;
    $('optimizerChecks').textContent='同副 416 張牌；每局結果、張數、敏感局與訊號狀態保留；長段實際穿越驗證通過。';
    $('optimizerChanges').innerHTML=o.changes.map(c=>`<article class="optimizer-change"><h3>原序第 ${c.round} 局｜${c.result}｜${c.size} 張</h3><div class="optimizer-pair"><div>調整前<div class="optimizer-cards">${comparisonRow(c.before,c.moved)}</div></div><div>調整後<div class="optimizer-cards">${comparisonRow(c.after,c.moved,c.from)}</div></div></div><p>${c.from.map((p,i)=>`局內第 ${p} 張 → 第 ${i+1} 張`).join('；')}</p></article>`).join('')||'<p>未找到更多安全切點，保留原牌序。</p>';
    $('optimizerExample').innerHTML='<h3>新增安全起點</h3>'+o.gained.map(c=>`<button class="tool-btn" data-opt-example="${c}">${c+1}</button>`).join('')+'<div id="tvCutExample"></div>';
    showVersion('after');OptimizerDialog.show();
  }
  async function optimize() {
    if(!states.traverse.result||busy)return;absorbEdits();clearOptimization();stopped=false;lock(true);
    try{optimization=await O.optimize(copy(states.traverse.result),{...rules(),isCancelled:()=>stopped,onProgress:p=>status(`局內優化 ${p.round}/${p.total} 局｜安全點 ${p.before} → ${p.best}`)});lock(false);comparison();status(`優化${optimization.cancelled?'已停止':'完成'}：${optimization.initial.count} → ${optimization.final.count} 個安全切點`);}catch(e){status(`局內優化：${e.message}`);}finally{lock(false);}
  }
  // Keep the existing TR numbering, folder, local directory permission and workbook.
  // Helpers are copied from the standalone exporter with their own closure.
  const DRIVE_FOLDER_ID='17RvOVNDc0a_JEem1SnRPsTEvm8otkJdx', EXPORT_PREFIX='TR', CLOUD_UPLOAD_ENABLED=true;
  async function fetchFolderFiles() {
    let lastError = null;
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        const res = await fetch(`${GOOGLE_APPS_SCRIPT_URL}?folderId=${DRIVE_FOLDER_ID}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data && data.success && Array.isArray(data.files)) return data.files;
        throw new Error((data && data.error) || '檔案清單格式錯誤');
      } catch (e) {
        lastError = e;
        if (attempt < 4) await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
    throw new Error(`讀取雲端「穿越牌」清單失敗：${lastError && lastError.message}`);
  }

  // 雲端清單預先讀取：排好牌就在背景讀，按導出時多半已經讀好，不用再等
  let cloudFilesPromise = null;
  function prefetchCloudList() {
    if (!CLOUD_UPLOAD_ENABLED) return;
    const p = fetchFolderFiles();
    p.catch(() => {}); // 背景失敗先不吵，導出時會重讀
    cloudFilesPromise = p;
  }
  async function cloudFiles() {
    if (!cloudFilesPromise) prefetchCloudList();
    try {
      return await cloudFilesPromise;
    } catch (e) {
      cloudFilesPromise = fetchFolderFiles(); // 預讀失敗：當場重讀一次
      return await cloudFilesPromise;
    }
  }

  async function nextExportFilename(files) {
    const custom = ExportFilename.read();
    if (custom) return ExportFilename.resolve(files, custom);
    const re = new RegExp(`^${EXPORT_PREFIX}(\\d+)\\.xlsx$`, 'i');
    let max = 0;
    files.forEach((f) => { const m = (f.name || '').match(re); if (m) max = Math.max(max, parseInt(m[1], 10)); });
    return `${EXPORT_PREFIX}${String(max + 1).padStart(3, '0')}.xlsx`;
  }

  // knownFiles：編號時讀到的雲端清單，直接拿來比對，不用上傳前再讀一次
  async function uploadToDrive(blob, filename, knownFiles) {
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    const body = JSON.stringify({ filename, base64Data: btoa(bin), folderId: DRIVE_FOLDER_ID });
    const countSame = async () => (await fetchFolderFiles()).filter((f) => f.name === filename).length;
    const before = knownFiles.filter((f) => f.name === filename).length;
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        // 上一次可能已寫進雲端、只是回應出錯；先確認，避免重複上傳
        if (attempt > 1 && (await countSame()) > before) return;
        const res = await fetch(GOOGLE_APPS_SCRIPT_URL, { method: 'POST', body });
        const data = await res.json();
        if (data && data.success) return;
        throw new Error((data && data.error) || '上傳失敗');
      } catch (e) {
        lastError = e;
        if (attempt < 3) await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
    throw lastError;
  }

  // ===== 本機存檔位置：使用者指定的資料夾（例如「下載\穿越」），瀏覽器記住授權 =====
  // 第一次導出會跳出選資料夾視窗；重開瀏覽器後第一次導出可能要再按一次允許。
  // 沒有這個功能（或使用者取消）就照舊下載到預設的「下載」資料夾。
  function exportDirStore(mode, value) {
    return new Promise((resolve, reject) => {
      const open = indexedDB.open('traverse-export-dir', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('h');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const tx = open.result.transaction('h', mode);
        const req = mode === 'readonly' ? tx.objectStore('h').get('dir') : tx.objectStore('h').put(value, 'dir');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      };
    });
  }
  // 必須在按鈕點擊當下（還沒 await 其他東西前）呼叫，瀏覽器才允許跳視窗
  async function getExportDir() {
    if (!window.showDirectoryPicker) return null;
    try {
      let dir = null;
      try { dir = await exportDirStore('readonly'); } catch (e) { dir = null; }
      if (dir) {
        if ((await dir.queryPermission({ mode: 'readwrite' })) === 'granted') return dir;
        if ((await dir.requestPermission({ mode: 'readwrite' })) === 'granted') return dir;
      }
      dir = await window.showDirectoryPicker({ id: 'traverse-export', startIn: 'downloads', mode: 'readwrite' });
      try { await exportDirStore('readwrite', dir); } catch (e) { /* 記不住就下次再選 */ }
      return dir;
    } catch (e) {
      return null; // 使用者取消或不支援：改用一般下載
    }
  }
  async function saveLocal(blob, filename, dir) {
    if (dir) {
      if (ExportFilename.read()) filename = await ExportFilename.resolveLocal(dir, filename);
      const fh = await dir.getFileHandle(filename, { create: true });
      const w = await fh.createWritable();
      await w.write(blob);
      await w.close();
      return { where: dir.name, filename };
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return { where: '下載', filename };
  }


  async function exportTraverse() {
    try { ExportFilename.read(); } catch (error) { status(error.message); return; }
    if(!states.traverse.result||busy)return;absorbEdits();const source=copy(states.traverse.result),cut=states.traverse.cut,signalConfig=currentSignal();
    const rs=E.dealRounds(E.cutDeck(O.prepare(source),cut));
    const dirPromise=getExportDir();lock(true);
    try{
      const dir=await dirPromise,g=violationGroups(rs),items=Object.entries(g).filter(([,a])=>a.length);
      if(items.length&&!confirm('牌表仍有違規，是否繼續導出？\n'+items.map(([k,a])=>`${({noSwap:'無法對調',same:'不符敏感局',triple:'三條',signal:'訊號',color:'卡色'})[k]}：${a.length} 局`).join('\n'))){status('已取消導出');return;}
      const a=O.analyze(O.prepare(source),rules());const startRounds=Array.from({length:416},(_,i)=>a.depths[(cut+i)%416]);
      const blob=await E.buildWorkbook(rs,{startRounds,signalConfig});const files=await cloudFiles();let name=await nextExportFilename(files);
      const saved=await saveLocal(blob,name,dir);name=saved.filename;ExportFilename.advance(name);status(`已存到${saved.where}：${name}，正在上傳穿越牌…`);
      try{await uploadToDrive(blob,name,files);files.push({name});status(`已導出 ${name}，本機與雲端「穿越牌」皆已存好`);}catch(e){status(`已存本機 ${name}；雲端上傳失敗：${e.message}`);}
    }catch(e){status(`導出失敗：${e.message}`);}finally{lock(false);}
  }
  // Capture only mode-dependent actions; all standard-mode handlers run unchanged.
  document.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(mode==='standard'&&window.__pendingSizeShoe&&!['chipStop','stopGenerateBtn'].includes(button.id)&&!button.hasAttribute('data-dashboard-ui')){event.preventDefault();event.stopImmediatePropagation();return;}
    if(mode==='standard'&&button.id==='btnExportCombined'){event.preventDefault();event.stopImmediatePropagation();if(!busy&&!window.__isGeneratingShoe){lock(true);Promise.resolve(original.export()).catch(e=>log(`導出失敗：${e.message}`,'error')).finally(()=>lock(false));}return;}
    if(mode!=='traverse')return;
    if(busy&&!['stopGenerateBtn','chipStop','logHead','btnTableWindow'].includes(button.id)&&!button.hasAttribute('data-dashboard-ui')){event.preventDefault();event.stopImmediatePropagation();return;}
    const id=button.id;
    const handlers={chipStop:()=>{if(busy){stopped=true;status('停止中，整理目前結果…');}},generateBtn:()=>generateTraverse(),stopGenerateBtn:()=>{stopped=true;status('停止中，整理目前結果…');},btnCut:()=>cutTraverse(Number($('cutPos').value)),btnAutoColor:recolor,
      btnExportCombined:exportTraverse,btnRecordDeckOrder:()=>{absorbEdits();rotateResult(states.traverse.result,states.traverse.cut);states.traverse.cut=0;$('cutPos').value=0;clearOptimization();renderTraverse();status('已套用目前牌序，切牌起點歸零');},
      btnApplyChanges:()=>{absorbEdits();clearOptimization();renderTraverse();status('已套用編輯並重新檢查目前牌序');},
      clearBtn:()=>{clearOptimization();states.traverse.result=null;states.traverse.cut=0;original.clear();$('tvSummary').textContent='';$('tvSafeCount').textContent='尚未排牌';$('tvSafeCuts').innerHTML='';$('tvCutBuckets').textContent='';$('tvChains').querySelector('tbody').innerHTML='';$('tvDiagnostics').innerHTML='';$('tvOptimize').disabled=true;setSettingsCollapsed(false);status('已清空穿越牌靴');}};
    if(handlers[id]){event.preventDefault();event.stopImmediatePropagation();if(!busy||id==='stopGenerateBtn'||id==='chipStop')handlers[id]();}
  },true);
  $('modeRed0').addEventListener('click',()=>switchMode('red0'));$('modeA2').addEventListener('click',()=>switchMode('a2'));$('modeTraverse').addEventListener('click',()=>switchMode('traverse-red0'));$('modeTraverseA2').addEventListener('click',()=>switchMode('traverse-a2'));
  $('tvSettingsToggle').addEventListener('click',()=>setSettingsCollapsed(!$('traverseControls').classList.contains('collapsed')));
  $('tvDemo').addEventListener('click',()=>generateTraverse(true));$('tvOptimize').addEventListener('click',optimize);
  $('tvSafeCuts').addEventListener('click',e=>{const b=e.target.closest('[data-tv-cut]');if(b&&!busy)cutTraverse(Number(b.dataset.tvCut));});
  $('btnOptBefore').addEventListener('click',()=>showVersion('before'));$('btnOptAfter').addEventListener('click',()=>showVersion('after'));$('btnOptOriginalCut').addEventListener('click',()=>cutTraverse(0));
  $('optimizerExample').addEventListener('click',e=>{
    const b=e.target.closest('[data-opt-example]');if(!b||!optimization)return;const c=Number(b.dataset.optExample);
    const trace=version=>O.traceCut(O.prepare(optimization[version]),c,optimization.rules);
    const before=trace('before'),after=trace('after'),bad=before.find(r=>r.issues.length);
    $('tvCutExample').innerHTML=`<h3>第 ${c+1} 張起發</h3><p>調整前：${bad?`第 ${bad.no} 局 ${esc(bad.issues.join('；'))}`:'安全'}</p><div>${bad?bad.cards.map(cardLabel).join(''):''}</div><p>調整後：${after.every(r=>!r.issues.length)?'安全':'仍有問題'}</p><div>${bad?after[bad.no-1].cards.map(cardLabel).join(''):''}</div><button class="tool-btn" id="tvExampleCut">牌表查看此切點</button>`;
    $('tvExampleCut').onclick=()=>cutTraverse(c);
  });
  controlIds.forEach(id=>$(id).addEventListener('change',()=>{
    if(mode==='traverse')tvSave(tsub,currentSignal());
    clearOptimization();if(mode==='traverse'&&states.traverse.result){renderTraverse();status('條件已變更，請重新排牌套用。');}
  }));
  // Signal controls run their existing handlers first, then refresh the current mode.
  document.querySelectorAll('.suit-button,.rank-button,.quick').forEach(el=>el.addEventListener('click',()=>{
    setTimeout(()=>{if(mode==='standard')StandardProfiles.save(sub,currentSignal());else tvSave(tsub,currentSignal());clearOptimization();if(mode==='traverse'&&states.traverse.result){renderTraverse();status('訊號設定已變更，請重新排牌套用。');}},0);
  }));
  // 百家 3.0 設定區：與穿越設定相同的收合列；生成完成後自動收成一行摘要
  function standardSummary() {
    const v=id=>$(id).value.trim();
    const parts=[`回復${Number(v('avgRecoveryLimit'))>0?'≤'+v('avgRecoveryLimit'):'不限'}`,`和局${v('maxTieLimit')===''?'不限':'≤'+v('maxTieLimit')}`];
    if(v('maxFourCardRate')!=='')parts.push(`四張≤${v('maxFourCardRate')}%`);
    if(v('maxSideLimit')!=='')parts.push(`莊閒差距≤${v('maxSideLimit')}`);
    if(v('maxTwoThirteenReversal')!=='')parts.push(`1/13＋2/13逆轉≤${v('maxTwoThirteenReversal')}`);
    parts.push('逆轉間隔>20局');
    for(const n of [4,5,6]){const lo=v(`st${n}Min`),hi=v(`st${n}Max`);if(lo||hi)parts.push(`${n}張局${lo?'≥'+lo:''}${lo&&hi?'、':''}${hi?'≤'+hi:''}`);}
    const on=[['tripleTieRule','三條'],['skipBanker6','莊6'],['skipPlayer7Banker6','閒7'],['lastCardNine','末張9']].filter(([id])=>$(id).checked).map(([,n])=>n);
    return parts.join('｜')+'｜'+(on.length?on.join('・'):'規則全關');
  }
  function setStandardCollapsed(value) {
    $('standardControls').classList.toggle('collapsed',value);$('stSettingsSummary').textContent=value?standardSummary():'';
    $('stSettingsToggle').textContent=value?'展開設定':'收合設定';$('stSettingsToggle').setAttribute('aria-expanded',String(!value));
  }
  $('stSettingsToggle').addEventListener('click',()=>setStandardCollapsed(!$('standardControls').classList.contains('collapsed')));
  let standardWasRunning=false;
  new MutationObserver(()=>{const running=busy||$('generateBtn').disabled;['modeRed0','modeA2','modeTraverse','modeTraverseA2','sharedSignalSettings'].forEach(id=>$(id).disabled=running);
    [...standardSizeControlIds,'maxTwoThirteenReversal','exportFilename'].forEach(id=>$(id).disabled=running);
    if(mode==='standard'){if(running)standardWasRunning=true;else if(standardWasRunning){standardWasRunning=false;if(currentRounds?.length&&!document.body.classList.contains('dashboard'))setStandardCollapsed(true);}}
  }).observe($('generateBtn'),{attributes:true,attributeFilter:['disabled']});
  document.body.dataset.mode='standard';
  {const q=new URLSearchParams(location.search).get('mode');if(q==='red0'||q==='a2')sub=q;
   applyProfile(sub);refreshModeButtons();
   $('modeStatus').textContent=SUB_NAME[sub];
   if(q==='traverse')switchMode('traverse-'+tsub);else if(q==='traverse-red0'||q==='traverse-a2')switchMode(q);}
  window.IntegratedModes={get mode(){return mode;},get sub(){return sub;},get tsub(){return tsub;},get busy(){return busy;},get traversal(){return states.traverse;},switchMode,generateTraverse,cutTraverse,recolor,exportTraverse};
})();
