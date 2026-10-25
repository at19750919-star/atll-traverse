// Fresh browser profile; never touches the user's existing tabs or settings.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const ROOT=path.resolve(process.env.ATLL_ROOT||path.join(__dirname,'..'));
const row=JSON.parse(fs.readFileSync(path.join(ROOT,'scripts/validation/safe-cuts-research-2026-10-08.json'))).shoes.find(x=>x.seed===1139);
const fixture={cards:row.baselineCards,chains:row.baselineChains,leftoverCount:0,stats:{ms:0,shuffles:1,phase2Segments:0},signal:{ok:true,issues:[]},colorOk:true};
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://**',r=>r.fulfill({status:200,body:'',contentType:'text/plain'}));
 await page.goto(require('node:url').pathToFileURL(path.join(ROOT,'integrated.html')).href);await page.waitForFunction(()=>!!window.IntegratedModes);
 await page.evaluate(()=>(IntegratedModes.switchMode('traverse-a2'),document.getElementById('tvTailFill').checked=true));
 const load=async()=>page.evaluate(f=>{currentRounds=null;const s=IntegratedModes.traversal;s.result=JSON.parse(JSON.stringify(f));s.cut=0;for(const id of ['tvSideLimit','tvTieMax','tvBankerSixMax','tvSevenReversalMax','tvRareReversalMax'])document.getElementById(id).value='';document.getElementById('tvNine').checked=false;document.getElementById('tvP7').checked=false;document.getElementById('tvSecond').checked=false;IntegratedModes.cutTraverse(0);},fixture);
 await load();assert.equal(await page.locator('#tvRecoveryOptimize').isDisabled(),false);
 for(const id of ['tvOptimize','tvRecoveryOptimize']){
  await load();await page.evaluate(id=>document.getElementById(id).click(),id);await page.waitForFunction(()=>!IntegratedModes.busy);
  const summary=await page.locator('#optimizerSummary').textContent();assert.match(summary,/平均回復/);assert.match(summary,/完整 416/);assert.match(summary,/未回復 0 → 0/);
  assert.equal(await page.locator('#optimizerPanel').isVisible(),true);console.log('PASS integrated '+id+' '+summary);
 }
 await load();const sig=await page.evaluate(()=>JSON.stringify(IntegratedModes.traversal.result.cards));
 await page.evaluate(()=>{document.getElementById('tvRecoveryOptimize').click();document.getElementById('chipStop').click();});await page.waitForFunction(()=>!IntegratedModes.busy);
 assert.equal(await page.evaluate(()=>JSON.stringify(IntegratedModes.traversal.result.cards)),sig);assert.match(await page.locator('#tvProgress').textContent(),/已停止，保留原牌/);
 console.log('PASS integrated stop retains deck and unlocks controls');
 await load();await page.locator('#tvSevenReversalMax').evaluate(el=>el.value='0');await page.evaluate(()=>document.getElementById('tvRecoveryOptimize').click());await page.waitForFunction(()=>!IntegratedModes.busy);
 assert.match(await page.locator('#tvProgress').textContent(),/原牌驗收不合格/);assert.equal(await page.evaluate(()=>JSON.stringify(IntegratedModes.traversal.result.cards)),sig);console.log('PASS active invalid-original cap rejects without publishing');
 assert.deepEqual(errors,[]);console.log('PASS no page errors');
 await page.goto(require('node:url').pathToFileURL(path.join(ROOT,'traverse_builder.html')).href);await page.waitForFunction(()=>!!window.TraverseOptimizer);
 assert.equal(await page.locator('#btnRecoveryOptimize').count(),1);assert.equal(await page.locator('#btnRecoveryOptimize').isDisabled(),true);assert.deepEqual(errors,[]);console.log('PASS standalone dependency and recovery button');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
