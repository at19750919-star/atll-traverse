const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ROOT=path.resolve(__dirname,'..'),P=require('../standard/player_seven_limits.js');
const hit={cards:[3,2,4,4]}, swapped={cards:[2,3,4,4]},plain={cards:[4,4,4,4]};
assert(P.classify(hit));assert(P.classify(swapped));assert(!P.classify(plain));
function shoe(gap){return [hit,...Array.from({length:gap},()=>plain),swapped];}
assert(!P.check(shoe(19),null).okSpacing);assert(P.check(shoe(20),null).ok);assert(!P.check(shoe(20),1).okCount);assert(!P.check([hit],0).ok);assert.equal(P.check([hit],1).count,1);
const e=vm.createContext({console,setTimeout,performance});for(const f of ['standard/two_thirteen_reversals.js','traverse_quota.js','traverse_builder.js','traverse_export.js','standard/player_seven_limits.js','traverse_limits.js'])vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'),e);
// Exhaustively compare both directions against the existing baccarat simulator.
for(let n=0;n<100000;n++){
 const digits=String(n).padStart(5,'0').split('').map(Number),h=e.TraverseBuilder.simulateHand(digits,0,digits.length);if(!h||h.size!==digits.length)continue;
 const sw=digits.slice();[sw[0],sw[1]]=[sw[1],sw[0]];const hs=e.TraverseBuilder.simulateHand(sw,0,sw.length);
 const expected=h.player===7&&h.banker===6||!!hs&&hs.size===sw.length&&hs.player===7&&hs.banker===6;
 assert.equal(P.classify(digits),expected);
}
console.log('PASS 閒7定義、對調計一次、0與上限、19／20局邊界、100000種5張牌與既有引擎一致');
const result=gap=>({cards:shoe(gap).flatMap(r=>r.cards.map(point=>({point}))),chains:[]});
const limits={bankerSix:null,seven:null,rare:null,enforceSpacing:false,playerSevenEnabled:true,playerSeven:null};
assert(!e.TraverseLimits.check(result(19),limits).ok);assert(e.TraverseLimits.check(result(20),limits).ok);assert(!e.TraverseLimits.check(result(20),{...limits,playerSeven:1}).ok);
console.log('PASS 穿越最終驗收拒絕間隔不足與超額，接受正好隔20局');
(async()=>{
 const R=require('../standard/two_thirteen_reversals.js');
 const adjacent=[hit,swapped,...Array.from({length:20},()=>plain)],before=JSON.stringify(adjacent);
 const repaired=await R.repairSpacing(adjacent,{classify:P.classify,minGap:20,keyFor:()=>'',validate:rs=>P.check(rs,2).ok});
 assert(repaired.ok);assert(P.check(repaired.rounds,2).ok);assert.equal(JSON.stringify(adjacent),before);
 const impossible=await R.repairSpacing([hit,swapped],{classify:P.classify,minGap:20,keyFor:()=>''});assert(!impossible.ok);
 console.log('PASS 閒7整局交換修正間隔、原牌不變、無安全位置拒絕');
 const {chromium}=require('playwright'),browser=await chromium.launch({channel:'chrome',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1791,height:900}}),errors=[];page.on('pageerror',x=>errors.push(x.message));await page.route('https://**',r=>r.fulfill({body:''}));
 await page.goto(require('node:url').pathToFileURL(path.join(ROOT,'integrated.html')).href);await page.waitForFunction(()=>!!window.IntegratedModes);
 await page.evaluate(()=>IntegratedModes.switchMode('a2'));
 assert(await page.locator('#maxPlayerSeven').isVisible());assert(await page.locator('#skipPlayer7Banker6').isHidden());await page.locator('#maxPlayerSeven').fill('2');
 const standard=await page.evaluate(()=>{
   const r={cards:[3,2,4,4].map(n=>new Card(String(n),'♠','R'))};
   const rs=[r,...Array.from({length:19},()=>({cards:[4,4,4,4].map(n=>new Card(String(n),'♠','R'))})),r];
   const v=validateStandardGeneratedShoe(rs);
   const budget=StandardGenerationBudget.create([]);
   return {reason:v.reason,counts:budget.measure(rs).playerSeven,max:budget.maxima.playerSeven};
 });
 assert.match(standard.reason,/閒7之間只隔19局/);assert.equal(standard.counts,2);assert.equal(standard.max,2);
 await page.evaluate(()=>IntegratedModes.switchMode('traverse-a2'));assert(await page.locator('#tvPlayerSevenMax').isVisible());assert(await page.locator('#tvP7').isHidden());await page.locator('#tvPlayerSevenMax').fill('3');
 await page.evaluate(()=>IntegratedModes.switchMode('red0'));assert(await page.locator('#maxPlayerSeven').isHidden());assert(await page.locator('#skipPlayer7Banker6').isVisible());
 await page.evaluate(()=>IntegratedModes.switchMode('traverse-red0'));assert(await page.locator('#tvPlayerSevenMax').isHidden());assert(await page.locator('#tvP7').isVisible());
 await page.reload();await page.waitForFunction(()=>!!window.IntegratedModes);await page.evaluate(()=>IntegratedModes.switchMode('a2'));assert.equal(await page.locator('#maxPlayerSeven').inputValue(),'2');await page.evaluate(()=>IntegratedModes.switchMode('traverse-a2'));assert.equal(await page.locator('#tvPlayerSevenMax').inputValue(),'3');
 for(const id of ['maxPlayerSeven','tvPlayerSevenMax']){
  await page.evaluate(mode=>IntegratedModes.switchMode(mode),id==='maxPlayerSeven'?'a2':'traverse-a2');
  for(const raw of ['0','','-1','1.5','105']){await page.locator('#'+id).fill(raw);const setting=await page.evaluate(id=>PlayerSevenLimits.read(document,id),id);if(['0',''].includes(raw))assert.equal(setting.limit,raw===''?null:0);else assert(setting.error);}
 }
 await page.evaluate(()=>{
  IntegratedModes.switchMode('a2');
  for(const id of ['avgRecoveryLimit','range16Limit','maxTieLimit','maxFourCardRate','swapBanker6Target','maxSideLimit','maxBankerSixWin','max7PtReversal','maxTwoThirteenReversal']){const el=document.getElementById(id);if(el)el.value='';}
  document.getElementById('maxPlayerSeven').value='2';
  for(const id of ['tripleTieRule','lastCardNine'])document.getElementById(id).checked=false;
  let seed=1;Math.random=()=>{let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};
  window.__p7StandardDone=false;(async()=>{for(let n=0;n<10;n++){await generateShoe();if(currentRounds?.length)break;}})().finally(()=>window.__p7StandardDone=true);
 });
 await page.waitForFunction(()=>window.__p7StandardDone,null,{timeout:60000});
 const standardGenerated=await page.evaluate(()=>({cards:currentRounds?.flatMap(r=>r.cards).length||0,logs:document.getElementById('logArea').textContent.slice(-1200),p7:PlayerSevenLimits.check(currentRounds,2),validation:validateStandardGeneratedShoe(currentRounds)}));
 assert.equal(standardGenerated.cards,416,JSON.stringify(standardGenerated));assert(standardGenerated.validation.ok);assert(standardGenerated.p7.ok);
 console.log('PASS 實際一般A2完整416張、全規則驗收、閒7上限2及間隔20局：'+JSON.stringify(standardGenerated.p7.roundNumbers));
 await page.evaluate(()=>{
  IntegratedModes.switchMode('traverse-a2');
  for(const id of ['tvLeft','tvSideLimit','tvTieMax','tvBankerSixMax','tvSevenReversalMax','tvRareReversalMax'])document.getElementById(id).value='';
  document.getElementById('tvPlayerSevenMax').value='2';
  for(const id of ['tvTriple','tvSecond','tvTailFill'])document.getElementById(id).checked=true;
  document.getElementById('tvNine').checked=false;
  for(const [id,value] of Object.entries({tvIdle:150,tvTries:2000,tvChain:1}))document.getElementById(id).value=value;
  let seed=112;Math.random=()=>{let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};
  window.__p7Done=false;IntegratedModes.generateTraverse().finally(()=>window.__p7Done=true);
 });
 await page.waitForFunction(()=>window.__p7Done,null,{timeout:60000});
 const generated=await page.evaluate(()=>{
  const r=IntegratedModes.traversal.result,rs=TraverseExport.dealRounds(r.cards).filter(r=>r.hand),stock={};
  for(const c of r.cards){const k=c.rank+c.suit+c.back_color;stock[k]=(stock[k]||0)+1;}
  return {cards:r.cards.length,p7:PlayerSevenLimits.check(rs,2),full:TraverseTailFill.validate(r.cards,{...TraverseBuilder.rules,signalConfig:r.signalConfig}),stock};
 });
 assert.equal(generated.cards,416);assert(generated.full.ok);assert(generated.p7.ok);assert.equal(generated.p7.count,2);assert.equal(Object.keys(generated.stock).length,104);assert(Object.values(generated.stock).every(n=>n===4));
 console.log('PASS 實際穿越A2完整416張、訊號與敏感局驗收、閒7上限2及間隔20局：'+JSON.stringify(generated.p7.roundNumbers));
 assert.deepEqual(errors,[]);console.log('PASS 實際頁面：兩A2顯示數字框、紅0保留開關、分開保存重載、非法值、一般驗收與挑局預算');
 }finally{await browser.close();}
 const built=await e.TraverseBuilder.build({tripleTie:false,signalRule:false,idleLimit:15,computeTries:250,chainAttempts:2,specialLimits:{playerSeven:0}});
 assert.equal(built.cards.length,416);assert.equal(built.stats.specialPicked.playerSeven,0);assert.equal(e.TraverseBuilder.specialRoundCounts(built.chains.flatMap(c=>built.cards.slice(c.start-1,c.start-1+c.length).map(x=>x.point))).playerSeven,0);
 console.log('PASS 實際穿越建立牌靴416張，撿段／補排遵守閒7零上限');
})().catch(e=>{console.error(e);process.exitCode=1;});
