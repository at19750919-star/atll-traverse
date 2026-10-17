// Two generators share the same signal controls, Card model, table and editing UI.
// Standard code is vendored under standard/; the source project remains untouched.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  // Keep both modes' settings in the original black-and-gold control deck.
  document.querySelector('.expanders').appendChild($('traverseControls'));
  $('sharedSignalSettings').addEventListener('click',()=>{ if(!busy&&!window.__isGeneratingShoe)document.querySelector('[data-panel="pSet"]').click(); });
  const B = TraverseBuilder, E = TraverseExport, O = TraverseOptimizer;
  const copy = x => JSON.parse(JSON.stringify(x));
  const esc = x => String(x).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const original = { refresh: refreshAnalysisAndRender, violations: calculateViolationStats,
    cannotSwap: calculateCannotSwapViolations, verify: verifyShoeRules, clear: clearAll, export: exportRoundsAsExcelWithDrive, stats: updateStats };
  updateStats=function(data){original.stats(data);const rs=(currentRounds||[]).filter(r=>r.cards&&[4,5,6].includes(r.cards.length));$('sharedCardCounts').textContent=rs.length?[4,5,6].map(n=>{const count=rs.filter(r=>r.cards.length===n).length;return `${n}張 ${count}局（${(count/rs.length*100).toFixed(1)}%）`;}).join('／'):'';};
  let mode = 'standard', busy = false, stopped = false, optimization = null;
  const states = { standard: null, traverse: { result: null, cut: 0, analysis: null, view: 'after' } };
  const controlIds = ['tvMin','tvMax','tvIdle','tvTries','tvChain','tvLeft','tvTriple','tvSignal','tvStrong','tvSecond','tvNine','tvSide','tvSideLimit'];
  const num = id => Number($(id).value);
  const config = () => ({ suits: SIGNAL_CONFIG.suits.slice(), ranks: SIGNAL_CONFIG.ranks.slice() });
  function rules() { return { tripleTie: $('tvTriple').checked, signalRule: $('tvSignal').checked,
    strong: $('tvStrong').checked, secondStart: $('tvSecond').checked, signalConfig: config(), preserveLastNine: $('tvNine').checked }; }
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
        if (r.result==='和' ? !$('tvTriple').checked : r.result!==need) out.signal.push(i+1);
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
    if(!result){original.clear();$('roundsBody').innerHTML='';$('tblEmpty').style.display='';return;}
    recheckChains();
    currentRounds=toRounds(displayedCards());
    refreshSharedTable();
    t.analysis=O.analyze(baseCards(),rules());
    const s=result.stats, g=violationGroups(E.dealRounds(displayedCards()));
    $('tvSummary').textContent=`穿越段 ${416-result.leftoverCount} 張｜剩牌 ${result.leftoverCount} 張｜長段 ${result.chains.length} 段｜長段驗證 ${result.chains.every(c=>c.qualified)?'通過':'有問題'}｜重跑 ${result.reruns||0} 次｜卡色違規 ${g.color.length} 局｜敏感局違規 ${g.noSwap.length+g.same.length} 局｜三條 ${g.triple.length} 局｜訊號 ${g.signal.length} 局｜${((result.totalMs??s.ms)/1000).toFixed(1)} 秒`;
    $('tvSafeCount').textContent=`${t.analysis.count}／416`;
    const buckets=new Map();t.analysis.depths.forEach(d=>buckets.set(d,(buckets.get(d)||0)+1));
    $('tvCutBuckets').textContent=[...buckets].sort((a,b)=>a[0]-b[0]).map(([d,n])=>d?`違規到第 ${d} 局：${n} 點`:`安全：${n} 點`).join('｜');
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
  function switchMode(next) {
    if(next===mode||busy||window.__isGeneratingShoe)return;
    if(mode==='standard')states.standard=snapshot();else{absorbEdits();OptimizerDialog.reset();}
    mode=next;document.body.dataset.mode=mode;
    $('modeStandard').classList.toggle('active',mode==='standard');$('modeTraverse').classList.toggle('active',mode==='traverse');
    $('modeStandard').setAttribute('aria-pressed',mode==='standard');$('modeTraverse').setAttribute('aria-pressed',mode==='traverse');
    $('traverseControls').hidden=$('traverseTools').hidden=mode!=='traverse';
    $('modeStatus').textContent=mode==='standard'?'百家 3.0 模式':'穿越排牌模式';
    $('btnAutoColor').textContent=mode==='traverse'?'卡色':'換色';
    $('pCond').classList.remove('open');document.querySelector('[data-panel="pCond"]').classList.remove('active');
    $('pSet').classList.remove('open');document.querySelector('[data-panel="pSet"]').classList.remove('active');
    if(mode==='standard'){
      const st=states.standard;
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
    log(`已切換${mode==='standard'?'百家 3.0':'穿越排牌'}；各模式保留各自牌靴。`,'info');
  }
  function lock(value) {
    busy=value;window.__isGeneratingShoe=value;window.__stopGenerateRequested=false;
    $('generateBtn').disabled=value;$('stopGenerateBtn').disabled=!value;
    $('generatingOverlay').classList.toggle('active',value);document.body.classList.toggle('running',value);
    ['modeStandard','modeTraverse','sharedSignalSettings',...controlIds,'tvDemo','tvOptimize','btnOptBefore','btnOptAfter','btnOptOriginalCut'].forEach(id=>$(id).disabled=value);
    document.querySelectorAll('.suit-button,.rank-button,.quick').forEach(el=>{el.style.pointerEvents=value?'none':'';el.setAttribute('aria-disabled',value);});
    document.querySelectorAll('.suit-checkbox,.rank-checkbox').forEach(el=>el.disabled=value);
    if(!value)$('tvOptimize').disabled=!states.traverse.result;
  }
  function status(message) { $('tvProgress').textContent=message;$('generatingText').textContent=message; }
  function rotateResult(result,k) { if(!k)return;result.cards=E.cutDeck(result.cards,k);result.chains.forEach(c=>c.start=(c.start-1-k+416)%416+1); }
  function sideDiff(cards,cut=0){const rs=E.dealRounds(E.cutDeck(cards,cut)).filter(r=>r.hand);return Math.abs(rs.filter(r=>r.result==='莊').length-rs.filter(r=>r.result!=='莊').length);}
  function nineCut(result) {
    const cs=O.prepare(result), a=O.analyze(cs,rules());
    const candidates=E.dealRounds(cs).filter(r=>r.hand&&r.cards.at(-1).rank==='9').map(r=>(r.start+r.cards.length)%416).filter(c=>a.depths[c]===0);
    return candidates.length?candidates[Math.floor(Math.random()*candidates.length)]:null;
  }
  async function generateTraverse(demo=false) {
    if(busy||window.__isGeneratingShoe)return;
    const min=num('tvMin'),max=num('tvMax');
    if(!Number.isInteger(min)||!Number.isInteger(max)||min<4||max>416||min>max){status('張數範圍須為 4～416 的整數，最少不能大於最多');return;}
    for(const id of ['tvIdle','tvTries','tvChain'])if(!Number.isInteger(num(id))||num(id)<1){status('撿段、補排與接段次數須為正整數');$(id).focus();return;}
    if($('tvSide').checked&&(!Number.isInteger(num('tvSideLimit'))||num('tvSideLimit')<0)){status('莊閒差距上限須為非負整數');return;}
    applySignalConfig();stopped=false;clearOptimization();lock(true);const started=Date.now();let reruns=0,result,cut=null;
    const limit=$('tvLeft').value.trim()===''?null:num('tvLeft');
    if(limit!==null&&(!Number.isInteger(limit)||limit<0||limit>416)){status('剩牌上限須為 0～416 的整數或留白');lock(false);return;}
    try {
      let seed=1139;const rng=()=>{let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};
      if(demo){persistSignalConfig({suits:['♠','♥','♦','♣'],ranks:['A','2']});syncUiFromSignalConfig();updateSignalConfigDisplay();$('tvTriple').checked=$('tvSignal').checked=$('tvNine').checked=true;$('tvStrong').checked=$('tvSecond').checked=false;}
      for(;;){
        const opts={...rules(),minLen:demo?8:min,maxLen:demo?12:max,idleLimit:num('tvIdle'),computeTries:num('tvTries'),chainAttempts:num('tvChain'),
          onProgress:m=>status(`${reruns?`［重跑 ${reruns} 次］`:''}${m}`),isCancelled:()=>stopped};
        if(demo)opts.rng=rng;else if(limit!==null&&!opts.strong)opts.rejectAbove=limit;
        result=await B.build(opts);
        if(result.rejected){if(stopped){delete opts.rejectAbove;result=await B.build({...opts,idleLimit:50});break;}reruns++;continue;}
        if(stopped||opts.strong)break;
        if(!demo&&limit!==null&&result.leftoverCount>limit){reruns++;continue;}
        if(B.SIGNAL_RETRY_ENABLED&&result.signal&&!result.signal.ok&&!demo){reruns++;continue;}
        cut=$('tvNine').checked?nineCut(result):null;
        if(!demo&&$('tvSide').checked&&sideDiff(result.cards,cut||0)>num('tvSideLimit')){reruns++;continue;}
        break;
      }
      result.reruns=reruns;result.totalMs=Date.now()-started;rotateResult(result,cut||0);
      states.traverse.result=result;states.traverse.cut=0;$('cutPos').value=0;
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
      const fh = await dir.getFileHandle(filename, { create: true });
      const w = await fh.createWritable();
      await w.write(blob);
      await w.close();
      return dir.name;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return '下載';
  }


  async function exportTraverse() {
    if(!states.traverse.result||busy)return;absorbEdits();const source=copy(states.traverse.result),cut=states.traverse.cut;
    const rs=E.dealRounds(E.cutDeck(O.prepare(source),cut));
    const dirPromise=getExportDir();lock(true);
    try{
      const dir=await dirPromise,g=violationGroups(rs),items=Object.entries(g).filter(([,a])=>a.length);
      if(items.length&&!confirm('牌表仍有違規，是否繼續導出？\n'+items.map(([k,a])=>`${({noSwap:'無法對調',same:'不符敏感局',triple:'三條',signal:'訊號',color:'卡色'})[k]}：${a.length} 局`).join('\n'))){status('已取消導出');return;}
      const a=O.analyze(O.prepare(source),rules());const startRounds=Array.from({length:416},(_,i)=>a.depths[(cut+i)%416]);
      const blob=await E.buildWorkbook(rs,{startRounds});const files=await cloudFiles();const name=await nextExportFilename(files);
      const where=await saveLocal(blob,name,dir);status(`已存到${where}：${name}，正在上傳穿越牌…`);
      try{await uploadToDrive(blob,name,files);files.push({name});status(`已導出 ${name}，本機與雲端「穿越牌」皆已存好`);}catch(e){status(`已存本機 ${name}；雲端上傳失敗：${e.message}`);}
    }catch(e){status(`導出失敗：${e.message}`);}finally{lock(false);}
  }
  // Capture only mode-dependent actions; all standard-mode handlers run unchanged.
  document.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(mode==='standard'&&button.id==='btnExportCombined'){event.preventDefault();event.stopImmediatePropagation();if(!busy){lock(true);Promise.resolve(original.export()).catch(e=>log(`導出失敗：${e.message}`,'error')).finally(()=>lock(false));}return;}
    if(mode!=='traverse')return;
    if(busy&&!['stopGenerateBtn','chipStop','logHead'].includes(button.id)){event.preventDefault();event.stopImmediatePropagation();return;}
    const id=button.id;
    const handlers={chipStop:()=>{if(busy){stopped=true;status('停止中，整理目前結果…');}},generateBtn:()=>generateTraverse(),stopGenerateBtn:()=>{stopped=true;status('停止中，整理目前結果…');},btnCut:()=>cutTraverse(Number($('cutPos').value)),btnAutoColor:recolor,
      btnExportCombined:exportTraverse,btnRecordDeckOrder:()=>{absorbEdits();rotateResult(states.traverse.result,states.traverse.cut);states.traverse.cut=0;$('cutPos').value=0;clearOptimization();renderTraverse();status('已套用目前牌序，切牌起點歸零');},
      btnApplyChanges:()=>{absorbEdits();clearOptimization();renderTraverse();status('已套用編輯並重新檢查目前牌序');},
      clearBtn:()=>{clearOptimization();states.traverse.result=null;states.traverse.cut=0;original.clear();$('tvSummary').textContent='';$('tvSafeCount').textContent='尚未排牌';$('tvSafeCuts').innerHTML='';$('tvCutBuckets').textContent='';$('tvChains').querySelector('tbody').innerHTML='';$('tvDiagnostics').innerHTML='';$('tvOptimize').disabled=true;status('已清空穿越牌靴');}};
    if(handlers[id]){event.preventDefault();event.stopImmediatePropagation();if(!busy||id==='stopGenerateBtn'||id==='chipStop')handlers[id]();}
  },true);
  $('modeStandard').addEventListener('click',()=>switchMode('standard'));$('modeTraverse').addEventListener('click',()=>switchMode('traverse'));
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
  try{const saved=JSON.parse(localStorage.getItem('integrated-traverse-settings')||'{}');controlIds.forEach(id=>{if(saved[id]!==undefined)$(id)[$(id).type==='checkbox'?'checked':'value']=saved[id];});}catch(_){}
  controlIds.forEach(id=>$(id).addEventListener('change',()=>{
    const saved={};controlIds.forEach(k=>saved[k]=$(k)[$(k).type==='checkbox'?'checked':'value']);try{localStorage.setItem('integrated-traverse-settings',JSON.stringify(saved));}catch(_){}
    clearOptimization();if(mode==='traverse'&&states.traverse.result){renderTraverse();status('條件已變更，請重新排牌套用。');}
  }));
  // Signal controls run their existing handlers first, then refresh the current mode.
  document.querySelectorAll('.suit-button,.rank-button,.quick').forEach(el=>el.addEventListener('click',()=>{
    setTimeout(()=>{clearOptimization();if(mode==='traverse'&&states.traverse.result){renderTraverse();status('訊號設定已變更，請重新排牌套用。');}},0);
  }));
  new MutationObserver(()=>{const running=busy||$('generateBtn').disabled;['modeStandard','modeTraverse','sharedSignalSettings'].forEach(id=>$(id).disabled=running);}).observe($('generateBtn'),{attributes:true,attributeFilter:['disabled']});
  document.body.dataset.mode='standard';
  if(new URLSearchParams(location.search).get('mode')==='traverse')switchMode('traverse');
  window.IntegratedModes={get mode(){return mode;},get busy(){return busy;},get traversal(){return states.traverse;},switchMode,generateTraverse,cutTraverse,recolor,exportTraverse};
})();
