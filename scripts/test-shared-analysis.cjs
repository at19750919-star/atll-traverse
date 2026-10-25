// Fresh browser, fixture-only shoes; every external request is blocked.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.CODEX_NODE_MODULES ? path.join(process.env.CODEX_NODE_MODULES,'playwright') : 'playwright');
const ROOT=path.resolve(__dirname,'..');
const fixture=JSON.parse(fs.readFileSync(path.join(ROOT,'scripts/validation/safe-cuts-research-2026-10-08.json'))).shoes[0];
(async()=>{
 const browser=await chromium.launch(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH,headless:true}:{channel:'chrome',headless:true});
 try{
 const p=await browser.newPage({viewport:{width:2560,height:1080}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route(/^https?:/,r=>r.abort());
 await p.goto(require('node:url').pathToFileURL(path.join(ROOT,'integrated.html')).href);
 await p.waitForFunction(()=>window.DashboardUI);
 async function settle(){await p.evaluate(()=>{DashboardUI.refresh();return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});}
 async function verify(){await settle();const v=await p.evaluate(()=>{const a=DashboardUI.analysis,r=IntegratedAnalysis.recovery(currentRounds),tv=IntegratedModes.mode==='traverse';const cards=tv?TraverseOptimizer.prepare(IntegratedModes.traversal.result):currentRounds.flatMap(r=>r.cards);const options={tripleTie:document.getElementById(tv?'tvTriple':'tripleTieRule').checked,signalRule:tv?document.getElementById('tvSignal').checked:true,signalConfig:SIGNAL_CONFIG};return {r:JSON.stringify(r),actual:JSON.stringify(a.recovery),safe:JSON.stringify(IntegratedAnalysis.safe(cards,options,tv)),actualSafe:JSON.stringify(a.safe),rows:document.querySelectorAll('.shared-recovery-row').length,avg:document.getElementById('dashAvg').textContent,map:document.querySelectorAll('.cut-cell').length};});assert.equal(v.actual,v.r);assert.equal(v.actualSafe,v.safe);assert.equal(v.rows,416);assert.equal(v.map,416);assert.match(v.avg,/局$/);}
 async function install(mode){await p.evaluate(({mode,fixture})=>{IntegratedModes.switchMode(mode);const result={cards:fixture.baselineCards,chains:fixture.baselineChains,leftoverCount:0,stats:{ms:1},signal:{issues:[]}};if(mode.startsWith('traverse')){IntegratedModes.traversal.result=result;IntegratedModes.cutTraverse(0);}else{currentRounds=TraverseExport.dealRounds(fixture.baselineCards).map(r=>({...r,cards:r.cards.map(c=>Object.assign(new Card(c.rank,c.suit),{back_color:c.back_color}))}));renderRoundsTable(currentRounds,null);updateStats(buildStatsFromRounds());}DashboardUI.refresh();},{mode,fixture});await verify();}
 for(const mode of ['red0','a2','traverse-red0','traverse-a2']){
  await install(mode);
  const before=await p.evaluate(()=>JSON.stringify(currentRounds));await settle();await verify();assert.equal(await p.evaluate(()=>JSON.stringify(currentRounds)),before);
  // In-place edits invalidate the cache even when the array identity is unchanged.
  await p.evaluate(()=>{const c=currentRounds[0].cards;[c[0],c[1]]=[c[1],c[0]];if(IntegratedModes.mode==='traverse')refreshAnalysisAndRender();else renderRoundsTable(currentRounds,null);});await verify();
  if(!mode.startsWith('traverse')){await p.evaluate(()=>saveOriginalDeckOrder());for(const cut of [1,415,0]){assert(await p.evaluate(c=>performCut(c),cut));await verify();}}
  if(mode.startsWith('traverse'))for(const cut of [1,415,0]){await p.evaluate(c=>IntegratedModes.cutTraverse(c),cut);await verify();}
  const signature=await p.evaluate(()=>JSON.stringify(currentRounds));
  await p.evaluate(mode=>IntegratedModes.switchMode(mode==='red0'?'a2':'red0'),mode);await settle();await p.evaluate(mode=>IntegratedModes.switchMode(mode),mode);await verify();assert.equal(await p.evaluate(()=>JSON.stringify(currentRounds)),signature);
  console.log('PASS '+mode+': parity, details, no mutation, edit/cut refresh, snapshot restore');
 }
 await p.locator('#chipClear').click();await settle();assert.equal(await p.locator('.shared-recovery-row').count(),0);assert.equal(await p.locator('#dashAvg').textContent(),'—');assert.match(await p.locator('#tvSafeCount').textContent(),/尚未排牌/);
 await p.evaluate(()=>IntegratedModes.switchMode('red0'));await verify();
 await p.evaluate(()=>{SIGNAL_CONFIG.ranks=['9'];document.dispatchEvent(new Event('change'));});await verify();
 assert.deepEqual(errors,[]);console.log('PASS clear/no stale values and signal setting invalidation; no page errors');
 if(process.env.SHARED_ANALYSIS_SCREENSHOT){await p.screenshot({path:process.env.SHARED_ANALYSIS_SCREENSHOT,scale:'css'});}
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
