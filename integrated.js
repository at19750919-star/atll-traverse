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
  let mode = 'standard', sub = (window.StandardProfiles&&StandardProfiles.current)||'red0', busy = false, stopped = false, optimization = null, templateCollectionTask=null, sensitiveCollectionTask=null;
  const controlIds = ['tvMin','tvMax','tvIdle','tvTries','tvChain','tvLeft','tvTriple','tvMixedColor','tvBankerSixMax','tvSevenReversalMax','tvRareReversalMax','tvP7','tvSignal','tvStrong','tvSecond','tvNine','tvTailFill','tvSide','tvSideLimit','tvTieMax','tv4Min','tv4Max','tv5Min','tv5Max','tv6Min','tv6Max'];
  const standardSizeControlIds = [4,5,6].flatMap(n=>[`st${n}Min`,`st${n}Max`]);
  // 穿越紅0／穿越A2：同一個穿越引擎，各自保存設定、訊號牌與牌靴；states.traverse 永遠指向目前的穿越牌靴
  const TV_NAME = { red0:'穿越紅0', a2:'穿越A2' };
  const TV_KEY = { red0:'integrated-traverse-red0', a2:'integrated-traverse-a2' }, TV_SUB_KEY = 'integrated-traverse-sub';
  const TV_RULES = {
    red0: { tvTriple:true, tvBankerSixMax:'', tvSevenReversalMax:'2', tvRareReversalMax:'', tvP7:true, tvNine:false, tvTieMax:'4', tvSideLimit:'8', tvSignal:true, tvMixedColor:false, signal:{ suits:['♥','♦'], ranks:['10','J','Q','K'] } },
    a2:   { tvTriple:true, tvBankerSixMax:'', tvSevenReversalMax:'2', tvRareReversalMax:'', tvP7:false, tvNine:true, tvTieMax:'', tvSideLimit:'8', tvSignal:true, tvMixedColor:false, signal:{ suits:['♠','♥','♦','♣'], ranks:['A','2'] } }
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
  function rules() { return { mixedColor: $('tvMixedColor').checked, tripleTie: $('tvTriple').checked, signalRule: $('tvSignal').checked,
    strong: $('tvStrong').checked, secondStart: $('tvSecond').checked, skipBanker6: $('tvBankerSixMax').value.trim()!=='', skipPlayer7: $('tvP7').checked, signalConfig: config(), preserveLastNine: $('tvNine').checked }; }
  function setRules() { Object.assign(B.rules, rules()); }
  function plain(card) { return { rank: card.rank, suit: card.suit, point: typeof card.point === 'function' ? card.point() : card.point,
    back_color: card.back_color, ...(card.sensitiveFill?{sensitiveFill:true}:{}), traverse: !!card.traverse }; }
  function toRounds(cards) {
    return E.dealRounds(cards).map(r => ({ start_index: r.start, result: r.result, segment: r.segment,
      sensitive: !!r.hand && B.handSensitive(r.cards.map(c => c.point)),
      cards: r.cards.map((c,i) => Object.assign(new Card(c.rank,c.suit,r.start+i), {back_color:c.back_color,traverse:c.traverse,...(c.sensitiveFill?{sensitiveFill:true}:{})})),
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
    out.color = CardColorRules.violations(full.map(r=>r.cards.slice(0,4).map(c=>c.back_color).join('')), $('tvMixedColor').checked);
    full.forEach((r,i) => {
      const p = r.cards.map(c=>c.point), sw = E.swappedTotals(r);
      if (!sw || sw.size !== r.hand.size) out.noSwap.push(i+1);
      else if (!B.handSensitive(p)) out.same.push(i+1);
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
    const segmentColumn=typeof ROUNDS_TABLE_COLUMNS==='undefined'?-1:ROUNDS_TABLE_COLUMNS.findIndex(c=>c.key==='segment');
    currentRounds.forEach((round,i)=>{if(round.segment!=='敏感補排')return;const row=$('roundsBody').querySelector(`tr[data-r="${i}"]`);if(!row)return;row.dataset.tailFill='true';row.title='敏感補排（非穿越段；不宣稱第二張敏感）';if(segmentColumn>=0&&row.children[segmentColumn])row.children[segmentColumn].textContent='敏感補排';});
    t.analysis=O.analyze(baseCards(),rules());
    updateTemplateStats();
    const s=result.stats, g=violationGroups(E.dealRounds(displayedCards()));
    $('tvSummary').textContent=`穿越段 ${416-result.leftoverCount} 張｜剩牌 ${result.leftoverCount} 張${result.tailFill?`｜原序敏感補排 ${result.tailFill.roundCount||0} 局｜原序未處理 ${result.tailFill.unprocessed} 張`:''}｜長段 ${result.chains.length} 段｜長段驗證 ${result.chains.every(c=>c.qualified)?'通過':'有問題'}｜重跑 ${result.reruns||0} 次｜卡色違規 ${g.color.length} 局｜敏感局違規 ${g.noSwap.length+g.same.length} 局｜三條 ${g.triple.length} 局｜訊號 ${g.signal.length} 局｜${((result.totalMs??s.ms)/1000).toFixed(1)} 秒`;
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
    $('tvOptimize').disabled=busy; $('tvRecoveryOptimize').disabled=busy; $('btnRecordDeckOrder').disabled=false;
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
    persistCardColorMixedMode($('mixedCardColor').checked);
    updateSignalConfig({ suits:p.signal.suits.slice(), ranks:p.signal.ranks.slice() });
    $('stTitle').textContent = SUB_NAME[name]+' 設定';
    document.body.dataset.sub = name;
    ExportFilename.setMode('standard-' + name);
    if(window.TargetRoadmap)TargetRoadmap.syncUI();
    setStandardCollapsed($('standardControls').classList.contains('collapsed'));
  }
  function applyTraverseProfile(t) {
    const p = tstates[t].live || tvLoad(t);   // 離開時的即時狀態（含示範改過的值）優先，確保回來時與牌靴一致
    controlIds.forEach(id => { const el = $(id); el[el.type === 'checkbox' ? 'checked' : 'value'] = p[id]; });
    persistCardColorMixedMode($('tvMixedColor').checked); setRules();
    tsub = t; try { localStorage.setItem(TV_SUB_KEY, t); } catch (_) {}
    updateSignalConfig({ suits:p.signal.suits.slice(), ranks:p.signal.ranks.slice() });
    $('tvTitle').textContent = TV_NAME[t] + '設定';
    document.body.dataset.tsub = t;
    ExportFilename.setMode('traverse-' + t);
    setSettingsCollapsed(document.body.classList.contains('dashboard') ? $('traverseControls').classList.contains('collapsed') : !!tstates[t].result);
  }
  function refreshModeButtons() {
    $('tvTemplateControls').hidden=mode!=='traverse'||tsub!=='red0';$('sensitiveControls').hidden=mode!=='traverse';
    [['modeRed0','standard','red0'],['modeA2','standard','a2'],['modeTraverse','traverse','red0'],['modeTraverseA2','traverse','a2']].forEach(([id,m,s]) => {
      const on = mode === m && (m === 'standard' ? sub : tsub) === s;
      $(id).classList.toggle('active', on); $(id).setAttribute('aria-pressed', on);
    });
    for(const [panel,input,key] of [['standardControls','maxTwoThirteenReversal',sub],['traverseControls','tvRareReversalMax',tsub]]){
      const spacing=key==='a2'||$(input).value.trim()===''?'不限間隔；次數依上限設定':'兩次之間須隔超過20局；不足時安全交換整局';
      $(panel).querySelector('.rare-reversal-note').textContent=`逆轉：1/13＋2/13，${spacing}`;
      $(input).closest('label').title=`1／13＋2／13補牌逆轉合計上限；留白局數不限、0禁止；${spacing}`;
    }
  }
  function switchMode(next) {
    if(next==='standard')next=sub;
    if(next==='traverse')next='traverse-'+tsub;
    if(next==='traverse-red0'||next==='traverse-a2'){} else if(next!=='red0'&&next!=='a2')return;
    const isTr=next.startsWith('traverse-'), nextSub=isTr?next.slice(9):next;
    if(busy||window.__isGeneratingShoe||(isTr?(mode==='traverse'&&nextSub===tsub):(mode==='standard'&&nextSub===sub)))return;
    if(mode==='standard'){states[sub]=snapshot();StandardProfiles.save(sub,currentSignal());}else{absorbEdits();OptimizerDialog.reset();tstates[tsub].optimization=optimization;optimization=null;tstates[tsub].live=tvCollect(currentSignal());}
    mode=isTr?'traverse':'standard';document.body.dataset.mode=mode;
    if(isTr){tsub=nextSub;applyTraverseProfile(tsub);optimization=tstates[tsub].optimization||null;$('tvOptimize').disabled=!tstates[tsub].result;$('tvRecoveryOptimize').disabled=!tstates[tsub].result;$('btnOptOpen').disabled=!optimization;}
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
    $('btnExportCombined').disabled=value;$('btnExportCombined').textContent=value?'處理中…':'導出';
    $('generatingOverlay').classList.toggle('active',value);document.body.classList.toggle('running',value);
    ['modeRed0','modeA2','modeTraverse','modeTraverseA2','sharedSignalSettings','exportFilename',...controlIds,'sensitiveConnect','sensitiveResume','sensitiveStart','sensitiveLength','sensitiveExport','tvTemplateConnect','tvTemplateResume','tvTemplateStart','tvTemplateExportLength','tvTemplateExport','tvTemplateExportPending','tvTemplateImport','tvDemo','tvOptimize','tvRecoveryOptimize','btnOptBefore','btnOptAfter','btnOptOriginalCut'].forEach(id=>$(id).disabled=value);
    document.querySelectorAll('.suit-button,.rank-button,.quick').forEach(el=>{el.style.pointerEvents=value?'none':'';el.setAttribute('aria-disabled',value);});
    document.querySelectorAll('.suit-checkbox,.rank-checkbox').forEach(el=>el.disabled=value);
    if(!value){$('tvOptimize').disabled=!states.traverse.result;$('tvRecoveryOptimize').disabled=!states.traverse.result;updateSensitiveStats();}
  }
  function status(message) { $('tvProgress').textContent=message;$('generatingText').textContent=message; }
  function rotateResult(result,k) { if(!k)return;result.cards=E.cutDeck(result.cards,k);result.chains.forEach(c=>c.start=(c.start-1-k+416)%416+1); }
  // 4／5／6 張局上下限：留白＝不限；回傳 { limits } 或 { error }
  function sizeLimits() {
    const out={};let any=false;
    for(const k of [4,5,6]){
      const read=id=>{const raw=$(id).value.trim();if($(id).validity.badInput)return NaN;if(raw==='')return null;const v=Number(raw);return Number.isInteger(v)&&v>=0&&v<=104?v:NaN;};
      const min=read(`tv${k}Min`),max=read(`tv${k}Max`);
      if(Number.isNaN(min)||Number.isNaN(max))return {error:`${k}張局上下限須為 0～104 的整數或留白`,focus:Number.isNaN(min)?`tv${k}Min`:`tv${k}Max`};
      if(min!==null&&max!==null&&min>max)return {error:`${k}張局下限不能大於上限`,focus:`tv${k}Min`};
      out[k]={min,max};if(min!==null||max!==null)any=true;
    }
    return {limits:any?out:null};
  }
  // 整副（依實際發牌起點）不符合上下限時回傳說明，符合回傳空字串
  function quotaReport(cards,cut,limits,tieMax=null){return TraverseQuota.check(B.roundSizeCounts(E.cutDeck(cards,cut).map(c=>c.point)),limits,tieMax);}
  function sizeMiss(cards,cut,limits){return quotaReport(cards,cut,limits).reason;}
  function tieMiss(cards,cut,max){return quotaReport(cards,cut,null,max).reason;}

  // 排好牌後把設定收成一行摘要，主表格往上移；點「展開設定」可再展開
  function settingsSummary() {
    const parts=[`${$('tvMin').value}～${$('tvMax').value}張`,`剩牌${$('tvLeft').value.trim()===''?'不限':'≤'+$('tvLeft').value}`];
    if($('tvTieMax').value.trim()!=='')parts.push(`和局≤${$('tvTieMax').value}`);
    if($('tvSideLimit').value.trim()!=='')parts.push(`莊閒差距≤${$('tvSideLimit').value}`);
    for(const [id,name] of [['tvBankerSixMax','莊6贏'],['tvSevenReversalMax','七點逆轉'],['tvRareReversalMax','逆轉']])if($(id).value.trim()!=='')parts.push(`${name}≤${$(id).value}`);
    parts.push(tsub==='a2'||$('tvRareReversalMax').value.trim()===''?'逆轉不限間隔':'逆轉間隔>20局');
    for(const k of [4,5,6]){const lo=$(`tv${k}Min`).value.trim(),hi=$(`tv${k}Max`).value.trim();if(lo||hi)parts.push(`${k}張局${lo?'≥'+lo:''}${lo&&hi?'、':''}${hi?'≤'+hi:''}`);}
    const on=[['tvMixedColor','混色（同組≤3局）'],['tvTriple','三條'],['tvP7','閒7'],['tvSignal','訊號牌'],['tvStrong','強'],['tvSecond','第二張敏感'],['tvNine','末張9'],['tvTailFill','敏感補排']].filter(([id])=>$(id).checked).map(([,n])=>n);
    parts.push('局數驗收允差≤3局（上限0仍禁止）');
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
  async function spreadTraverseTies(result,policy,limits) {
    const dealt=E.dealRounds(result.cards),rounds=dealt.filter(r=>r.hand),tail=dealt.filter(r=>!r.hand).flatMap(r=>r.cards);
    const owners=new Map();
    result.chains.forEach((ch,i)=>{for(let j=0;j<ch.length;j++)owners.set(result.cards[(ch.start-1+j)%result.cards.length],i);});
    function rebuild(candidate) {
      const cards=candidate.flatMap(r=>r.cards).concat(tail),n=cards.length,chainOwners=cards.map(c=>owners.get(c)??-1),chains=[];
      for(let i=0;i<result.chains.length;i++){
        const ch=result.chains[i],positions=chainOwners.flatMap((id,j)=>id===i?[j]:[]);
        if(positions.length!==ch.length)return null;
        const starts=positions.filter(j=>chainOwners[(j+n-1)%n]!==i);
        if(starts.length>1)return null; // Never split a long chain or silently change its coverage.
        const start=starts[0]??0;
        if(result.tailFill&&start!==ch.start-1)return null; // Tail filling never moves an original chain boundary.
        chains.push({...ch,start:start+1});
      }
      return {...result,cards,chains};
    }
    const baseline=violationGroups(dealt),last=result.cards.at(-1);
    if(['noSwap','same','triple','signal'].some(key=>baseline[key].length)||!TraverseLimits.chainsValid(result,policy)){
      const before=TieSpread.metrics(rounds);
      return {result,report:{before,after:before,targets:[],checks:0,moves:0,ms:0,mode:'traverse-red0',reason:'原牌靴未通過穿越／訊號驗收，略過和局定位'}};
    }
    const spread=await TieSpread.disperse(rounds,{
      hasSignal: round=>B.isSignalHand(round.cards,policy.signalConfig),
      shouldStop:()=>stopped,
      validate:candidate=>{
        const next=rebuild(candidate);if(!next)return {ok:false,reason:'會拆散穿越長段'};
        if(policy.preserveLastNine&&next.cards.at(-1)!==last)return {ok:false,reason:'末張9限制不符'};
        const groups=violationGroups(E.dealRounds(next.cards));
        if(Object.keys(baseline).some(key=>groups[key].length>baseline[key].length))return {ok:false,reason:'訊號／敏感局／卡色驗收不符'};
        const miss=sizeMiss(next.cards,0,policy.sizeLimits);if(miss)return {ok:false,reason:miss};
        if(policy.sideLimit!==null&&sideDiff(next.cards)>policy.sideLimit)return {ok:false,reason:'莊閒差距不符'};
        if(tieMiss(next.cards,0,policy.tieMax))return {ok:false,reason:tieMiss(next.cards,0,policy.tieMax)};
        const final=TraverseLimits.check(next,limits);if(!final.ok)return final;
        return TraverseLimits.chainsValid(next,policy)?{ok:true}:{ok:false,reason:'穿越長段重驗不符'};
      }
    });
    const next=spread.moves?rebuild(spread.rounds):result;
    return {result:next,report:{...spread,rounds:undefined,mode:'traverse-red0'}};
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
    const specialLimits={bankerSix:optLimit('tvBankerSixMax'),seven:optLimit('tvSevenReversalMax'),rare:optLimit('tvRareReversalMax')};
    const finalLimits={...specialLimits,enforceSpacing:tsub!=='a2'&&specialLimits.rare!==null};
    for(const [key,id,name] of [['bankerSix','tvBankerSixMax','莊6贏'],['seven','tvSevenReversalMax','七點逆轉'],['rare','tvRareReversalMax','逆轉']]){
      if(!demo&&Number.isNaN(specialLimits[key])){status(`${name}上限須為0～104整數或留白`);$(id).focus();return;}
    }
    applySignalConfig();stopped=false;clearOptimization();lock(true);const started=Date.now();let reruns=0,result,cut=null;
    const limit=$('tvLeft').value.trim()===''?null:num('tvLeft');
    if(limit!==null&&(!Number.isInteger(limit)||limit<0||limit>416)){status('剩牌上限須為 0～416 的整數或留白');lock(false);return;}
    const sizes=demo?{limits:null}:sizeLimits();
    if(sizes.error){status(sizes.error);$(sizes.focus).focus();lock(false);return;}
    let lastMiss='',spreadMessage='',activeTemplate=null,pendingTemplate=null;
    // 每次重跑都把原因寫進日誌，方便看出卡在哪一項
    const rerun=reason=>{if(activeTemplate&&B.hasTemplateContinuation(activeTemplate)){log(`穿越範本：${activeTemplate.templateLibrary?.length?`候選 ${activeTemplate.templateLibrary.selectedIndex}`:`敏感補排第 ${activeTemplate.tailFill?.solutionIndex||1} 種（非穿越段）`} 未通過完整驗收｜${reason}｜續試同池下一筆；本次失敗不永久排除範本`,'info');pendingTemplate=activeTemplate;activeTemplate=null;lastMiss=reason;return;}reruns++;lastMiss=reason;log(`第 ${reruns} 次穿越重跑：${reason}，重新生成...`,'warn');};
    const retryTail=reason=>{rerun(reason);return true;};
    try {
      await TraverseTemplateFile.ready;if(stopped)return;
      let seed=1139;const rng=()=>{let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};
      if(demo){persistSignalConfig({suits:['♠','♥','♦','♣'],ranks:['A','2']});syncUiFromSignalConfig();updateSignalConfigDisplay();$('tvTriple').checked=$('tvSignal').checked=$('tvNine').checked=true;$('tvStrong').checked=$('tvSecond').checked=$('tvP7').checked=false;}
      for(;;){
        const opts={...rules(),red0Balance:!demo&&tsub==='red0',fillSensitiveTail:!demo,sensitiveTail:$('tvTailFill').checked,a2Tail:!demo&&tsub==='a2',specialLimits:demo?null:specialLimits,minLen:demo?8:min,maxLen:demo?12:max,idleLimit:num('tvIdle'),computeTries:num('tvTries'),chainAttempts:num('tvChain'),sizeLimits:sizes.limits,sideLimit:demo?null:sideLimit,tieMax:demo?null:tieMax,
          onTemplateLog:m=>log(m,'info'),onProgress:m=>status(`${reruns?`［重跑 ${reruns} 次${lastMiss?`｜上一副${lastMiss}`:''}］`:''}${m}`),isCancelled:()=>stopped};
        if(demo){opts.rng=rng;opts.skipBanker6=false;}else if(limit!==null&&(!opts.strong||opts.fillSensitiveTail))opts.rejectAbove=limit;
        if(pendingTemplate){const previous=pendingTemplate;pendingTemplate=null;result=await B.nextTemplate(previous);}else result=await B.build(opts);
        activeTemplate=B.hasTemplateContinuation(result)?result:null;cut=null;spreadMessage='';
        if(stopped){status('已停止，保留上次完成的牌靴');return;}
        if(result.tailFill&&(!result.tailFill.ok||!result.tailFill.fullOk)){
          if(result.tailFill.status==='unsupported'){if(activeTemplate){rerun(result.tailFill.reason);continue;}status(result.tailFill.reason+'；保留上次牌靴');return;}
          if(!retryTail(`敏感補排／全靴驗收未通過：${result.tailFill.reason||result.signalBalance?.reason||'無合法配置'}`))return;continue;
        }
        if(result.signalBalance?.kind==='traverse-red0-target'&&!result.signalBalance.ok){if(activeTemplate){rerun(result.signalBalance.reason||'本次規劃未成功');continue;}status(`穿越紅0差距規劃${result.signalBalance.status==='search-limit'?'達搜尋上限':'未找到合法配置'}：${result.signalBalance.reason}；保留上次牌靴`);log($('tvProgress').textContent,'warn');return;}
        if(result.rejected){rerun(`剩牌 ${result.leftoverCount} 張超過上限 ${limit}`);continue;}
        if(!demo&&!opts.strong&&limit!==null&&result.leftoverCount>limit){rerun(`剩牌 ${result.leftoverCount} 張超過上限 ${limit}`);continue;}
        if(B.SIGNAL_RETRY_ENABLED&&result.signal&&!result.signal.ok&&!demo&&!opts.strong){rerun('訊號調整失敗');continue;}
        cut=!opts.strong&&$('tvNine').checked?nineCut(result):null;
        if(!demo&&!opts.strong&&sideLimit!==null&&sideDiff(result.cards,cut||0)>sideLimit){rerun(`莊閒差距 ${sideDiff(result.cards,cut||0)} 超過 ${sideLimit}`);continue;}
        if(!demo&&!opts.strong){const miss=tieMiss(result.cards,cut||0,tieMax);if(miss){rerun(miss);continue;}}
        if(!demo&&!opts.strong){const miss=sizeMiss(result.cards,cut||0,sizes.limits);if(miss){rerun(miss);continue;}}
        // Rotate before checking spacing: the limits apply to the displayed shoe.
        if(!demo)rotateResult(result,cut||0);
        if(!demo){
          const check=TraverseLimits.check(result,finalLimits);
          if(!check.okCount){rerun(check.reason);continue;}
          if(!check.okSpacing){
            const repaired=await TraverseLimits.repairSpacing(result,{limits:finalLimits,policy:opts,preserveLastNine:$('tvNine').checked,shouldStop:()=>stopped});
            if(stopped){status('已停止，保留上次完成的牌靴');return;}
            if(!repaired.ok){if(activeTemplate){rerun(`逆轉間隔交換失敗：${repaired.reason}`);continue;}status(`逆轉間隔交換失敗：${repaired.reason}；保留上次牌靴，不整副重跑`);log($('tvProgress').textContent,'warn');return;}
            result=repaired.result;
            if(repaired.swaps.length)log(`穿越逆轉間隔整局交換：${repaired.swaps.map(x=>`第${x.from}局 ↔ 第${x.to}局`).join('、')}`,'success');
          }
        }
        if(!demo&&$('tvMixedColor').checked){const colored=B.reassignColors(result.cards);if(colored.ok){result.cards=colored.cards;result.colorOk=true;}else result.colorOk=false;}
        if(!demo){
          const final=TraverseLimits.check(result,finalLimits);
          if(!final.okCount){rerun(`最後調整後${final.reason}`);continue;}
          if(!final.okSpacing){if(activeTemplate){rerun(`最後逆轉間隔不符：${final.reason}`);continue;}status(`最後逆轉間隔不符：${final.reason}；保留上次牌靴，不整副重跑`);return;}
        }
        if(!demo&&tsub==='red0'&&!opts.tripleTie){
          const spread=await spreadTraverseTies(result,opts,finalLimits);
          if(stopped){status('已停止，保留上次完成的牌靴');return;}
          result=spread.result;window.__lastTieSpread=spread.report;
          spreadMessage=TieSpread.summary(spread.report);
          log(spreadMessage,'info');
        }else if(!demo&&tsub==='red0'){
          window.__lastTieSpread=null;spreadMessage='三條已開啟，略過和局分散';log(spreadMessage,'info');
        }
        if(result.tailFill){const full=TraverseTailFill.validate(result.cards,rules());if(!full.ok||!TraverseLimits.chainsValid(result,opts)){if(!retryTail(`敏感補排最終全靴驗收：${full.reason||'穿越段不合格'}`))return;continue;}}
        if(!demo){const q=quotaReport(result.cards,0,sizes.limits,tieMax);if(!q.ok){if(activeTemplate){rerun(`穿越局數驗收未通過：${q.reason}`);continue;}status(`穿越局數驗收未通過：${q.reason}；保留上次牌靴`);log($('tvProgress').textContent,'warn');return;}}
        break;
      }

      if(result.templateLibrary){result.templateLibrary.finalAdopted=result.templateLibrary.length&&result.tailFill?.fullOk?1:0;log(`穿越範本：最終驗收完成｜候選命中 ${result.templateLibrary.candidateHits}／實體重驗 ${result.templateLibrary.physicalPassed}／最終採用 ${result.templateLibrary.finalAdopted}${result.templateLibrary.finalAdopted?'，已採用為穿越段':'，本副未使用範本'}`,'info');}
      result.reruns=reruns;result.totalMs=Date.now()-started;
      if(demo)rotateResult(result,cut||0);
      if (demo&&$('tvMixedColor').checked) {
        const colored=B.reassignColors(result.cards);
        if(colored.ok){result.cards=colored.cards;result.colorOk=true;}else result.colorOk=false;
      }
      states.traverse.result=result;states.traverse.cut=0;$('cutPos').value=0;
      if(!document.body.classList.contains('dashboard'))setSettingsCollapsed(true);document.querySelectorAll('#traverseTools details').forEach(d=>{d.open=false;});
      renderTraverse();status(`${stopped?'已停止，保留目前結果':demo?'示範牌已排好':'完成'}｜重跑 ${reruns} 次${$('tvNine').checked?(cut!==null?'｜末張 9 已套用':'｜未找到安全末張 9，保留牌序'):''}${$('tvMixedColor').checked&&!result.colorOk?'｜混色卡色配置失敗，請查看違規':''}${spreadMessage?'｜'+spreadMessage:''}`);
      if(!demo){const q=quotaReport(result.cards,0,sizes.limits,tieMax);if(q.summary)status($('tvProgress').textContent+'｜'+q.summary);}
      log($('tvProgress').textContent,'success');
    }catch(e){status(`排牌失敗：${e.message}`);console.error(e);}finally{await B.releaseTemplateContinuation(activeTemplate||pendingTemplate);if(result?.templateLibrary?.length&&!result.templateLibrary.finalAdopted)log(`穿越範本：本次未最終採用｜${$('tvProgress').textContent}`,'info');await TraverseTemplateFile.flush();updateTemplateStats();lock(false);}
  }
  function cutTraverse(cut) {
    if(!states.traverse.result)return;
    if(!Number.isInteger(cut)||cut<0||cut>415){status('切牌張數須為 0～415 的整數');return;}
    absorbEdits();states.traverse.cut=cut;$('cutPos').value=cut;renderTraverse();status(`已切 ${cut} 張，從原第 ${cut+1} 張發牌（${states.traverse.analysis.depths[cut]===0?'安全':'不安全'}）`);
  }
  function recolor() {
    if(!states.traverse.result)return;setRules();absorbEdits();const colored=B.reassignColors(displayedCards());
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
    $('optimizerTitle').textContent=o.objective==='recovery'?'同一副牌・回復優化前後比較':'同一副牌・局內優化前後比較';
    $('optimizerSummary').textContent=O.summary(o)+`｜調整 ${o.changes.length} 局${o.limited?'｜已達本次搜尋上限':''}`;
    $('optimizerChecks').textContent='同副 416 張牌；每局原牌、結果、張數、敏感局與訊號狀態保留；長段與已啟用的第二張敏感驗收通過。卡色依牌表另行檢查。';
    $('optimizerChanges').innerHTML=o.changes.map(c=>`<article class="optimizer-change"><h3>原序第 ${c.round} 局｜${c.result}｜${c.size} 張</h3><div class="optimizer-pair"><div>調整前<div class="optimizer-cards">${comparisonRow(c.before,c.moved)}</div></div><div>調整後<div class="optimizer-cards">${comparisonRow(c.after,c.moved,c.from)}</div></div></div><p>${c.from.map((p,i)=>`局內第 ${p} 張 → 第 ${i+1} 張`).join('；')}</p></article>`).join('')||'<p>未找到符合本次目標的合法改善，保留原牌序。</p>';
    $('optimizerExample').innerHTML='<h3>新增安全起點</h3>'+o.gained.map(c=>`<button class="tool-btn" data-opt-example="${c}">${c+1}</button>`).join('')+'<div id="tvCutExample"></div>';
    showVersion('after');OptimizerDialog.show();
  }
  async function optimize(objective='safe') {
    if(!states.traverse.result||busy)return;absorbEdits();clearOptimization();stopped=false;lock(true);
    const source=states.traverse.result, label=objective==='recovery'?'回復優化':'局內優化';
    const optional=id=>$(id).value.trim()===''?null:Number($(id).value);
    const limits={bankerSix:optional('tvBankerSixMax'),seven:optional('tvSevenReversalMax'),rare:optional('tvRareReversalMax'),enforceSpacing:tsub!=='a2'&&optional('tvRareReversalMax')!==null};
    const sizes=sizeLimits(),policy=rules();
    const validate=result=>{
      if(sizes.error)return {ok:false,reason:sizes.error};
      const left=optional('tvLeft');if(left!==null&&O.prepare(result).filter(c=>!c.traverse).length>left)return {ok:false,reason:'剩牌超過設定上限'};
      const groups=violationGroups(E.dealRounds(result.cards));
      if(['noSwap','same','triple','signal'].some(k=>groups[k].length))return {ok:false,reason:'敏感局／三條／訊號規則不符'};
      const miss=sizeMiss(result.cards,0,sizes.limits);if(miss)return {ok:false,reason:miss};
      const side=optional('tvSideLimit'),tie=optional('tvTieMax');
      if(side!==null&&sideDiff(result.cards)>side)return {ok:false,reason:'莊閒差距超標'};
      if(tieMiss(result.cards,0,tie))return {ok:false,reason:tieMiss(result.cards,0,tie)};
      return TraverseLimits.check(result,limits);
    };
    try{
      status(`${label}：正在檢查原牌及完整 416 切點…`);
      const output=await O.optimize(copy(source),{...policy,objective,validate,isCancelled:()=>stopped,
        onProgress:p=>status(`${label} ${p.round}/${p.total} 局｜安全點 ${p.before} → ${p.best}｜平均回復 ${p.recoveryBefore.toFixed(6)} → ${p.recoveryBest.toFixed(6)}`)});
      if(output.cancelled||stopped){status(`${label}已停止，保留原牌`);return;}
      // 點數優化完成後才配置混色，不把卡色當成安全切點搜尋條件。
      if(policy.mixedColor && !output.after.colorOk){
        setRules();
        const colored=B.reassignColors(output.after.cards);
        if(!colored.ok){status(`${label}後混色配置失敗，保留原牌`);return;}
        output.after.cards=colored.cards;output.after.colorOk=true;
        for(const change of output.changes)change.after=colored.cards.slice(change.start,change.start+change.size);
      }
      optimization=output;lock(false);comparison();status(`${label}${output.accepted?'完成':'未找到合法改善，保留原牌'}：${O.summary(output)}${output.limited?'｜已達本次搜尋上限':''}`);
    }catch(e){status(`${label}：${e.message}`);}finally{lock(false);}
  }
  // 整合頁只存本機；雲端helper保留但不由導出或編號流程呼叫。
  // 本機目錄授權與Excel內容沿用既有流程。
  const DRIVE_FOLDER_ID='17RvOVNDc0a_JEem1SnRPsTEvm8otkJdx', EXPORT_PREFIX='TR', CLOUD_UPLOAD_ENABLED=false;
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
    if (ExportFilename.localOnly) return ExportFilename.localName(custom, 'TR001.xlsx');
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
      filename = await ExportFilename.resolveLocal(dir, filename);
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
    const dirPromise=getExportDir();lock(true);$('generatingText').textContent='正在建立本機Excel檔案…';
    try{
      const dir=await dirPromise,g=violationGroups(rs),items=Object.entries(g).filter(([,a])=>a.length);
      if(items.length&&!confirm('牌表仍有違規，是否繼續導出？\n'+items.map(([k,a])=>`${({noSwap:'無法對調',same:'不符敏感局',triple:'三條',signal:'訊號',color:'卡色'})[k]}：${a.length} 局`).join('\n'))){status('已取消導出');return;}
      const a=O.analyze(O.prepare(source),rules());const startRounds=Array.from({length:416},(_,i)=>a.depths[(cut+i)%416]);
      const blob=await E.buildWorkbook(rs,{startRounds,signalConfig});let name=await nextExportFilename([]);
      const saved=await saveLocal(blob,name,dir);name=saved.filename;ExportFilename.advance(name);
      status(`已導出本機：${name}（${saved.where}，不讀取或上傳雲端）`);
    }catch(e){status(`導出失敗：${e.message}`);}finally{lock(false);}
  }
  // Serialize generation commands. Latest user intent wins; an old job must finish
  // its cancellation/finally (including restoring its snapshot) before clear/restart.
  function clearTraverse() {clearOptimization();states.traverse.result=null;states.traverse.cut=0;original.clear();$('tvSummary').textContent='';$('tvSafeCount').textContent='尚未排牌';$('tvSafeCuts').innerHTML='';$('tvCutBuckets').textContent='';$('tvChains').querySelector('tbody').innerHTML='';$('tvDiagnostics').innerHTML='';$('tvOptimize').disabled=true;$('tvRecoveryOptimize').disabled=true;setSettingsCollapsed(false);status('已清空穿越牌靴');}
  let generationTask = null, generationCommand = null, pendingClear = false;
  function cancelGeneration() {
    stopped = true;
    TraverseTemplateCollector.stop();
    if(sensitiveCollectionTask)void SensitiveHandLibrary.stopAndSave();
    stopGenerateShoe();
  }
  async function drainGenerationCommands() {
    try {
      while (pendingClear || generationCommand) {
        const command = pendingClear ? 'clear' : generationCommand;
        if (command === 'clear') pendingClear = false;
        else generationCommand = null;
        if (command === 'clear') {
          if (mode === 'traverse') clearTraverse();
          else original.clear();
          document.body.classList.remove('running','finished');
          syncDesignStats();
        } else {
          await (mode === 'traverse' ? generateTraverse() : generateShoe());
        }
      }
    } catch (e) { console.error(e); log(`生成操作失敗：${e.message}`, 'error'); }
    finally { generationTask = null; }
  }
  document.addEventListener('click', event => {
    const id = event.target.closest('button')?.id;
    const command = ({chipGen:'generate',generateBtn:'generate',chipStop:'stop',stopGenerateBtn:'stop',chipClear:'clear',clearBtn:'clear'})[id];
    if (!command) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if(sensitiveCollectionTask){if(command==='stop')requestSensitiveStop();else status('請先停止敏感局累積並等待保存，再操作牌靴');return;}
    if(templateCollectionTask){if(command==='stop'){requestTemplateStop();}else status('請先停止範本累積並等待保存，再操作牌靴');return;}
    if (command === 'stop') {
      generationCommand = null;
      cancelGeneration();
      return;
    }
    // Export/optimization retain their existing lock; only generation is cancellable.
    if (busy && !generationTask) return;
    if (command === 'clear') { pendingClear = true; generationCommand = null; }
    else generationCommand = command;
    if (generationTask) cancelGeneration();
    else {
      // Install the task before starting the engine, which can synchronously update UI.
      generationTask = true;
      void drainGenerationCommands();
    }
  }, true);
  ['maxTwoThirteenReversal','tvRareReversalMax'].forEach(id => {
    $(id).addEventListener('input', () => {
      refreshModeButtons();
      if ($('standardControls').classList.contains('collapsed')) setStandardCollapsed(true);
      if ($('traverseControls').classList.contains('collapsed')) setSettingsCollapsed(true);
    });
  });
  // Capture only mode-dependent actions; all standard-mode handlers run unchanged.
  document.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(mode==='standard'&&window.__pendingSizeShoe&&!['chipStop','stopGenerateBtn'].includes(button.id)&&!button.hasAttribute('data-dashboard-ui')){event.preventDefault();event.stopImmediatePropagation();return;}
    if(mode==='standard'&&button.id==='btnExportCombined'){event.preventDefault();event.stopImmediatePropagation();if(!busy&&!window.__isGeneratingShoe){lock(true);$('generatingText').textContent='正在建立本機Excel檔案…';Promise.resolve(original.export()).catch(e=>log(`導出失敗：${e.message}`,'error')).finally(()=>lock(false));}return;}
    if(mode!=='traverse')return;
    if(busy&&!['stopGenerateBtn','chipStop','tvTemplateStop','sensitiveStop','logHead','btnTableWindow'].includes(button.id)&&!button.hasAttribute('data-dashboard-ui')){event.preventDefault();event.stopImmediatePropagation();return;}
    const id=button.id;
    const handlers={chipStop:()=>{if(busy){stopped=true;status('停止中，整理目前結果…');}},generateBtn:()=>generateTraverse(),stopGenerateBtn:()=>{stopped=true;status('停止中，整理目前結果…');},btnCut:()=>cutTraverse(Number($('cutPos').value)),btnAutoColor:recolor,
      btnExportCombined:exportTraverse,btnRecordDeckOrder:()=>{absorbEdits();rotateResult(states.traverse.result,states.traverse.cut);states.traverse.cut=0;$('cutPos').value=0;clearOptimization();renderTraverse();status('已套用目前牌序，切牌起點歸零');},
      btnApplyChanges:()=>{absorbEdits();clearOptimization();renderTraverse();status('已套用編輯並重新檢查目前牌序');},
      clearBtn:clearTraverse};
    if(handlers[id]){event.preventDefault();event.stopImmediatePropagation();if(!busy||id==='stopGenerateBtn'||id==='chipStop')handlers[id]();}
  },true);
  $('modeRed0').addEventListener('click',()=>switchMode('red0'));$('modeA2').addEventListener('click',()=>switchMode('a2'));$('modeTraverse').addEventListener('click',()=>switchMode('traverse-red0'));$('modeTraverseA2').addEventListener('click',()=>switchMode('traverse-a2'));
  $('tvSettingsToggle').addEventListener('click',()=>setSettingsCollapsed(!$('traverseControls').classList.contains('collapsed')));
  function updateTemplateStats(){const s=TraverseTemplates.stats(),f=TraverseTemplateFile.status();const file=f.saving?'分批保存中':!f.ready?'載入索引中':f.needsPermission?'待恢復資料夾授權':!f.connected?'未選資料夾：僅在瀏覽器待存／快取，不算電腦檔案；請選 D:\\穿越點數範本庫或匯出備份':f.dirty?'有待合併資料':`已寫入本機資料夾 ${f.name}`;$('tvTemplateStats').textContent=`${[8,9,10,11,12].map(n=>`${n}張 ${s.banks[n].count}/1000000`).join('｜')}｜${f.connected?'磁碟已存':'記憶體'} ${s.templates} 個／${s.keys} 種組合｜待合併 ${s.pending} 個｜本頁已保存淨新增 ${f.totals.added} 個／磁碟重複 ${f.totals.duplicates} 個／待存重複 ${s.counters.duplicates} 個／容量滿未收錄 ${f.totals.full+s.counters.full} 個／驗證拒絕 ${s.counters.invalid} 個｜${file}${f.fileError?'｜'+f.fileError:''}${f.cacheError?'｜'+f.cacheError:''}${s.storageError?'｜'+s.storageError:''}`;}

  let templateStatusTimer=null;TraverseTemplateFile.onChange(()=>{if(!templateStatusTimer)templateStatusTimer=setTimeout(()=>{templateStatusTimer=null;updateTemplateStats();},150);});
  $('tvTemplateExport').addEventListener('click',async()=>{if(busy)return;lock(true);try{const n=Number($('tvTemplateExportLength').value),blob=await TraverseTemplateFile.exportJSON(n),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=TraverseTemplateFile.status().connected?`ATLL-穿越點數範本-${n}張.json`:'ATLL-穿越點數範本-暫存.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){status('匯出未完成：'+e.message);}finally{lock(false);}});
  $('tvTemplateExportPending').addEventListener('click',async()=>{if(busy)return;lock(true);try{const b=await TraverseTemplateFile.exportPendingJSON();if(!b.count){status('目前沒有待存範本，不需匯出');return;}const a=document.createElement('a'),url=URL.createObjectURL(b.blob);a.href=url;a.download=`ATLL-穿越範本-待存-${b.count}筆-${b.hash.slice(0,12)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status(`已送出 ${b.count} 筆待存備份下載｜SHA256 ${b.hash}｜原待存資料保留${b.validationRejected?`；其中 ${b.validationRejected} 筆重驗未過，已原樣備份但未合併`:''}；未合併磁碟，請確認瀏覽器下載完成`);}catch(e){status('待存備份未完成：'+e.message);}finally{lock(false);}});
  $('tvTemplateImport').addEventListener('click',()=>{if(!busy)$('tvTemplateFile').click();});
  $('tvTemplateFile').addEventListener('change',async()=>{const input=$('tvTemplateFile'),file=input.files[0];if(!file||busy)return;stopped=false;lock(true);try{await TraverseTemplateFile.ready;const merged=await TraverseTemplateFile.importJSON(await file.text(),{cancelled:()=>stopped});await TraverseTemplateFile.flush();updateTemplateStats();status(`範本已重驗合併；新增 ${merged.added??'見庫數'} 個${merged.skipped?`／因該張數庫一百萬容量未收錄 ${merged.skipped} 個（原檔保留）`:''}；實體檔案是否保存請看範本狀態`);}catch(e){status('範本未匯入：'+e.message);}finally{input.value='';lock(false);}});
  for(const [id,action]of [['tvTemplateConnect','connect'],['tvTemplateResume','resume']])$(id).addEventListener('click',async()=>{if(busy)return;lock(true);try{await TraverseTemplateFile[action]();updateTemplateStats();}catch(e){status(e.message);}finally{lock(false);}});
  let templateStopHome=null;
  function floatTemplateStop(active){const b=$('tvTemplateStop');if(active){templateStopHome=document.createComment('範本停止按鈕原位');b.before(templateStopHome);$('generatingOverlay').append(b);b.classList.add('collection-stop-floating');}else{templateStopHome?.replaceWith(b);templateStopHome=null;b.classList.remove('collection-stop-floating');b.textContent='停止累積／保存';}}
  function requestTemplateStop(){if(!templateCollectionTask)return;stopped=true;TraverseTemplateCollector.stop();$('tvTemplateStop').disabled=true;$('tvTemplateStop').textContent='停止中／等待保存…';status('停止範本累積，等待本機檔案保存完成…');}
  $('tvTemplateStart').addEventListener('click',async()=>{if(busy||templateCollectionTask||mode!=='traverse'||tsub!=='red0')return;const policy=rules(),min=num('tvMin'),max=num('tvMax');stopped=false;lock(true);$('tvTemplateStop').disabled=false;floatTemplateStop(true);
    templateCollectionTask=(async()=>{try{await TraverseTemplateFile.ready;const result=await TraverseTemplateCollector.run({rules:policy,minLen:min,maxLen:max,cancelled:()=>stopped,progress:r=>{status(`專門累積：已保存淨新增 ${r.added} 個｜待合併 ${r.pending} 個｜真正重複 ${r.duplicates} 個｜容量滿未收錄 ${r.full} 個｜${(r.added/Math.max(.001,r.ms/1000)).toFixed(1)} 已存個/秒`);updateTemplateStats();}});status(`累積${result.reason}：已保存淨新增 ${result.keys} 種組合／${result.added} 個排列｜待合併 ${result.pending} 個｜真正重複 ${result.duplicates} 個｜容量滿未收錄 ${result.full} 個；等待批次保存…`);}catch(e){status('範本累積停止：'+e.message);}finally{await TraverseTemplateFile.flush();updateTemplateStats();$('tvTemplateStop').disabled=true;floatTemplateStop(false);templateCollectionTask=null;lock(false);status($('tvProgress').textContent.replace('；等待批次保存…','；保存處理完成，請查看本機檔案狀態'));}})();await templateCollectionTask;
  });
  $('tvTemplateStop').addEventListener('click',async()=>{if(!templateCollectionTask)return;requestTemplateStop();await templateCollectionTask;});
  void TraverseTemplateFile.ready.then(updateTemplateStats);updateTemplateStats();
  let sensitiveStopHome=null,sensitiveUiTimer=null;
  function updateSensitiveStats(){const s=SensitiveHandLibrary.status(),p=s.progress,total=[4,5,6].reduce((n,k)=>n+s.banks[k].saved,0),state=s.saving?'正在寫入本機':s.error?'未保存／錯誤：'+s.error:s.needsPermission?'待恢復資料夾授權':s.complete?`全部枚舉完成，已保存 ${total} 個不同敏感局排列，不需再次累積`:s.connected?'已連接獨立敏感局資料夾':'未連接資料夾，只在記憶體，關閉前請匯出JSON';$('sensitiveStats').textContent=`${[4,5,6].map(n=>`${n}張：已存${s.banks[n].saved}個／${s.banks[n].keys}種組合`).join('｜')}｜待合併${s.pending}個｜${state}${s.handleError?'｜'+s.handleError:''}${p?`｜本次已保存淨新增${p.saved}個／已確認重複${p.duplicates}個｜已枚舉${p.tested}種${p.reason?'／'+p.reason:''}`:''}`;const b=$('sensitiveStart');b.textContent=!s.ready?'正在載入敏感局庫…':s.complete?`敏感局已全部完成（${total}個）`:s.enumerationComplete?'枚舉完成，請保存／恢復授權':'開始累積4／5／6張敏感局';b.title=s.enumerationComplete?'有限4／5／6張點數排列已檢查完；已有資料不需重跑；未保存可恢復授權或匯出備份':'';if(!busy)b.disabled=!s.ready||s.enumerationComplete||s.saving;}

  SensitiveHandLibrary.onChange(()=>{if(!sensitiveUiTimer)sensitiveUiTimer=setTimeout(()=>{sensitiveUiTimer=null;updateSensitiveStats();},120);});
  function floatSensitiveStop(active){const b=$('sensitiveStop');if(active){sensitiveStopHome=document.createComment('敏感局停止按鈕原位');b.before(sensitiveStopHome);$('generatingOverlay').append(b);b.classList.add('collection-stop-floating');}else{sensitiveStopHome?.replaceWith(b);sensitiveStopHome=null;b.classList.remove('collection-stop-floating');b.textContent='停止敏感局累積／保存';}}
  function requestSensitiveStop(){if(!sensitiveCollectionTask)return;stopped=true;$('sensitiveStop').disabled=true;$('sensitiveStop').textContent='停止中／等待敏感局保存…';status('停止敏感局累積，等待本機保存…');void SensitiveHandLibrary.stopAndSave();}
  for(const [id,action]of [['sensitiveConnect','connect'],['sensitiveResume','resume']])$(id).addEventListener('click',async()=>{if(busy)return;lock(true);try{await SensitiveHandLibrary[action]();updateSensitiveStats();status('敏感局庫獨立保存；建議選 D:\\穿越點數範本庫，程式使用其中「敏感局」子資料夾');}catch(e){status('敏感局資料夾未完成：'+e.message);}finally{lock(false);}});
  $('sensitiveStart').addEventListener('click',async()=>{if(busy||sensitiveCollectionTask)return;stopped=false;lock(true);$('sensitiveStop').disabled=false;floatSensitiveStop(true);sensitiveCollectionTask=(async()=>{try{await SensitiveHandLibrary.run({profile:{capturedSettings:rules(),definition:'完整用完4/5/6張；對調首兩張後同張數，莊閒互換或和仍和；三條與訊號僅記錄設定，不當成局間條件'},cancelled:()=>stopped,progress:s=>status(`敏感局累積：已保存淨新增 ${s.progress.saved} 個｜待合併 ${s.pending} 個｜已確認重複 ${s.progress.duplicates} 個｜可按停止／保存`)});}catch(e){status('敏感局收集未完成：'+e.message);}finally{updateSensitiveStats();$('sensitiveStop').disabled=true;floatSensitiveStop(false);sensitiveCollectionTask=null;lock(false);const s=SensitiveHandLibrary.status();status(`敏感局${s.progress?.reason||'已停止'}｜已保存淨新增 ${s.progress?.saved||0} 個｜待合併 ${s.pending} 個${s.error?'｜未保存：'+s.error:!s.connected?'｜僅在記憶體，請匯出JSON備份':'｜本機保存完成'}`);}})();await sensitiveCollectionTask;});
  $('sensitiveStop').addEventListener('click',requestSensitiveStop);
  $('sensitiveExport').addEventListener('click',async()=>{if(busy)return;lock(true);try{const n=Number($('sensitiveLength').value),blob=await SensitiveHandLibrary.exportJSON(n),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`ATLL-敏感局點數範本-${n}張.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){status('敏感局匯出失敗：'+e.message);}finally{lock(false);}});
  void SensitiveHandLibrary.ready.then(updateSensitiveStats);

  $('tvDemo').addEventListener('click',()=>generateTraverse(true));$('tvOptimize').addEventListener('click',()=>optimize('safe'));$('tvRecoveryOptimize').addEventListener('click',()=>optimize('recovery'));
  $('tvSafeCuts').addEventListener('click',e=>{const b=e.target.closest('[data-tv-cut]');if(b&&!busy)cutTraverse(Number(b.dataset.tvCut));
    const s=e.target.closest('[data-std-cut]');if(s&&!busy&&!window.__isGeneratingShoe&&typeof cutStandardAtTablePosition==='function')cutStandardAtTablePosition(Number(s.dataset.stdCut));});
  $('btnOptBefore').addEventListener('click',()=>showVersion('before'));$('btnOptAfter').addEventListener('click',()=>showVersion('after'));$('btnOptOriginalCut').addEventListener('click',()=>cutTraverse(0));
  $('optimizerExample').addEventListener('click',e=>{
    const b=e.target.closest('[data-opt-example]');if(!b||!optimization)return;const c=Number(b.dataset.optExample);
    const trace=version=>O.traceCut(O.prepare(optimization[version]),c,optimization.rules);
    const before=trace('before'),after=trace('after'),bad=before.find(r=>r.issues.length);
    $('tvCutExample').innerHTML=`<h3>第 ${c+1} 張起發</h3><p>調整前：${bad?`第 ${bad.no} 局 ${esc(bad.issues.join('；'))}`:'安全'}</p><div>${bad?bad.cards.map(cardLabel).join(''):''}</div><p>調整後：${after.every(r=>!r.issues.length)?'安全':'仍有問題'}</p><div>${bad?after[bad.no-1].cards.map(cardLabel).join(''):''}</div><button class="tool-btn" id="tvExampleCut">牌表查看此切點</button>`;
    $('tvExampleCut').onclick=()=>cutTraverse(c);
  });
  controlIds.forEach(id=>$(id).addEventListener('change',()=>{
    if(id==='tvMixedColor'){persistCardColorMixedMode($('tvMixedColor').checked);setRules();}
    if(mode==='traverse')tvSave(tsub,currentSignal());
    clearOptimization();if(mode==='traverse'&&states.traverse.result){renderTraverse();status('條件已變更，請重新排牌套用。');}
  }));
  ['tvBankerSixMax','tvSevenReversalMax','tvRareReversalMax'].forEach(id=>$(id).addEventListener('input',()=>{
    if(mode==='traverse')tvSave(tsub,currentSignal());
  }));
  $('mixedCardColor').addEventListener('change',()=>{persistCardColorMixedMode($('mixedCardColor').checked);clearOptimization();if(currentRounds?.length)refreshViolationStats();});
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
    if(v('maxBankerSixWin')!=='')parts.push(`莊6贏≤${v('maxBankerSixWin')}（禁補牌莊6）`);
    if(v('maxTwoThirteenReversal')!=='')parts.push(`1/13＋2/13逆轉≤${v('maxTwoThirteenReversal')}`);
    parts.push(sub==='a2'||v('maxTwoThirteenReversal')===''?'逆轉不限間隔':'逆轉間隔>20局');
    for(const n of [4,5,6]){const lo=v(`st${n}Min`),hi=v(`st${n}Max`);if(lo||hi)parts.push(`${n}張局${lo?'≥'+lo:''}${lo&&hi?'、':''}${hi?'≤'+hi:''}`);}
    if((sub==='red0'||sub==='a2')&&window.TargetRoadmap&&TargetRoadmap.isActive('standard'))parts.push(TargetRoadmap.summarizeShort('standard'));
    const on=[['mixedCardColor','混色（同組≤3局）'],['tripleTieRule','三條'],['skipPlayer7Banker6','閒7'],['lastCardNine','末張9']].filter(([id])=>$(id).checked).map(([,n])=>n);
    return parts.join('｜')+'｜'+(on.length?on.join('・'):'規則全關');
  }
  function setStandardCollapsed(value) {
    $('standardControls').classList.toggle('collapsed',value);$('stSettingsSummary').textContent=value?standardSummary():'';
    $('stSettingsToggle').textContent=value?'展開設定':'收合設定';$('stSettingsToggle').setAttribute('aria-expanded',String(!value));
  }
  $('stSettingsToggle').addEventListener('click',()=>setStandardCollapsed(!$('standardControls').classList.contains('collapsed')));
  let standardWasRunning=false;
  new MutationObserver(()=>{const running=busy||$('generateBtn').disabled;['modeRed0','modeA2','modeTraverse','modeTraverseA2','sharedSignalSettings'].forEach(id=>$(id).disabled=running);
    [...standardSizeControlIds,'maxTwoThirteenReversal','maxBankerSixWin','mixedCardColor','exportFilename'].forEach(id=>$(id).disabled=running);
    ['stTargetRoadSelect','stTargetRoadImportBtn'].forEach(id=>{if($(id))$(id).disabled=running;});
    if(window.TargetRoadmap&&!running)TargetRoadmap.syncUI();
    if(mode==='standard'){if(running)standardWasRunning=true;else if(standardWasRunning){standardWasRunning=false;if(currentRounds?.length&&!document.body.classList.contains('dashboard'))setStandardCollapsed(true);}}
  }).observe($('generateBtn'),{attributes:true,attributeFilter:['disabled']});
  document.body.dataset.mode='standard';
  {const q=new URLSearchParams(location.search).get('mode');if(q==='red0'||q==='a2')sub=q;
   applyProfile(sub);refreshModeButtons();
   $('modeStatus').textContent=SUB_NAME[sub];
   if(q==='traverse')switchMode('traverse-'+tsub);else if(q==='traverse-red0'||q==='traverse-a2')switchMode(q);}
  window.IntegratedModes={get mode(){return mode;},get sub(){return sub;},get tsub(){return tsub;},get busy(){return busy;},get traversal(){return states.traverse;},switchMode,generateTraverse,cutTraverse,recolor,exportTraverse};
})();
