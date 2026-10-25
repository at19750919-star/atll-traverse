const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const ROOT=path.resolve(process.env.ATLL_ROOT||path.join(__dirname,'..'));
const f=JSON.parse(fs.readFileSync(path.join(ROOT,'scripts/validation/safe-cuts-research-2026-10-08.json'))).shoes.find(x=>x.seed===1139);
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('https://**',r=>r.fulfill({body:''}));
 await page.goto(require('node:url').pathToFileURL(path.join(ROOT,'integrated.html')).href);await page.waitForFunction(()=>!!window.IntegratedModes);assert(await page.evaluate(()=>!!window.TraverseRed0Balance));
 await page.evaluate(()=>(IntegratedModes.switchMode('traverse-red0'),document.getElementById('tvTailFill').checked=true));
 for(const value of ['0','2','']){
  const out=await page.evaluate(async({f,value})=>{
   currentRounds=null;IntegratedModes.traversal.result={cards:f.baselineCards,chains:f.baselineChains,leftoverCount:0,stats:{ms:0,shuffles:0,phase2Segments:0},signal:{ok:true,issues:[]}};IntegratedModes.cutTraverse(0);
   const before=JSON.stringify(IntegratedModes.traversal.result.cards),saved=TraverseBuilder.build;let observed;
   document.getElementById('tvSideLimit').value=value;
   TraverseBuilder.build=async o=>{observed={enabled:o.red0Balance,side:o.sideLimit};return {signalBalance:{kind:'traverse-red0-target',ok:false,status:'search-limit',reason:'合成搜尋上限'},cards:[]};};
   try{await IntegratedModes.generateTraverse();}finally{TraverseBuilder.build=saved;}
   return {observed,unchanged:before===JSON.stringify(IntegratedModes.traversal.result.cards),message:document.getElementById('tvProgress').textContent,busy:IntegratedModes.busy};
  },{f,value});
  assert.equal(out.observed.enabled,true);assert.equal(out.observed.side,value===''?null:Number(value));assert(out.unchanged&&!out.busy);assert.match(out.message,/搜尋上限.*保留上次牌靴/);console.log('PASS red0 UI limit '+JSON.stringify(out));
 }
 await page.evaluate(()=>(IntegratedModes.switchMode('traverse-a2'),document.getElementById('tvTailFill').checked=true));
 const a2=await page.evaluate(async()=>{const saved=TraverseBuilder.build;let enabled;TraverseBuilder.build=async o=>{enabled=o.red0Balance;throw new Error('合成停止');};try{await IntegratedModes.generateTraverse();}finally{TraverseBuilder.build=saved;}return enabled;});assert.equal(a2,false);
 const cancel=await page.evaluate(async()=>{let requested=false,seed=101;const rng=()=>{let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};const result=await TraverseBuilder.build({rng,red0Balance:true,sideLimit:2,tripleTie:false,signalConfig:{suits:['♥','♦'],ranks:['10','J','Q','K']},idleLimit:100,computeTries:1000,chainAttempts:2,onProgress:m=>{if(/穿越紅0.*規劃/.test(m))requested=true;},isCancelled:()=>requested});return {cancelled:requested,status:result.cancelled?'cancelled':result.signalBalance?.status};});assert(cancel.cancelled);assert.equal(cancel.status,'cancelled');
 assert.deepEqual(errors,[]);console.log('PASS A2 gate, cooperative cancellation, no page errors');
 await page.evaluate(()=>(IntegratedModes.switchMode('traverse-red0'),document.getElementById('tvTailFill').checked=true));
 const generated=await page.evaluate(async()=>{
  for(const [id,value]of Object.entries({tvMin:'8',tvMax:'12',tvIdle:'100',tvTries:'1000',tvChain:'2',tvLeft:'3',tvSideLimit:'2',tvTieMax:'',tvBankerSixMax:'',tvSevenReversalMax:'',tvRareReversalMax:''}))document.getElementById(id).value=value;
  for(const id of ['tvTriple','tvP7','tvSecond','tvStrong','tvNine','tvMixedColor'])document.getElementById(id).checked=false;
  const saved=TraverseBuilder.build;let seed=101,report;
  const rng=()=>{let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};
  TraverseBuilder.build=async o=>{const r=await saved({...o,rng,fillSensitiveTail:false});report=r.signalBalance;return r;};
  try{await IntegratedModes.generateTraverse();}finally{TraverseBuilder.build=saved;}
  const r=IntegratedModes.traversal.result,rs=TraverseExport.dealRounds(r.cards).filter(x=>x.hand),banker=rs.filter(x=>x.result==='莊').length;
  return {status:report.status,signal:r.signal.ok,chains:r.chains.every(c=>c.qualified),N:rs.length,B:banker,diff:Math.abs(2*banker-rs.length),cards:r.cards.length,message:document.getElementById('tvProgress').textContent};
 });assert.equal(generated.status,'solved');assert(generated.signal&&generated.chains);assert.equal(generated.cards,416);assert(generated.diff<=2);assert.match(generated.message,/完成/);assert.deepEqual(errors,[]);console.log('PASS actual fixed-seed browser generation '+JSON.stringify(generated));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
