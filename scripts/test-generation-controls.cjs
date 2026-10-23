const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:!process.argv.includes('--headed')});
 const page=await browser.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://script.google.com/**',r=>r.abort());
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:''}));
 try {
 await page.goto(pathToFileURL(path.resolve(process.env.ATLL_ROOT||path.join(__dirname,'..'),'integrated.html')).href);
 for(const mode of ['modeRed0','modeTraverse']){
  await page.click('#'+mode);
  const input=mode==='modeRed0'?'maxTwoThirteenReversal':'tvRareReversalMax';
  const panel=mode==='modeRed0'?'standardControls':'traverseControls';
  for(const value of ['','2','', '0','2']){
   await page.fill('#'+input,value);
   assert((await page.locator('#'+panel+' .rare-reversal-note').textContent()).includes(value===''?'不限間隔':'超過20局'));
   const result=await page.evaluate(({mode,value})=>{
    const cards=[0,0,3,6,5,0,0,3,6,5].map((n,i)=>({rank:n===0?'K':String(n),suit:'♠',point:n,back_color:'B',pos:i}));
    const limit=value===''?null:Number(value);
    if(mode==='modeTraverse')return TraverseLimits.check({cards},{bankerSix:null,seven:null,rare:limit,enforceSpacing:IntegratedModes.tsub!=='a2'&&limit!==null});
    return checkStandardRareReversals([cards.slice(0,5),cards.slice(5)].map(cs=>({cards:cs.map(c=>new Card(c.rank,c.suit,c.pos))})),limit);
   },{mode,value});
   assert.equal(result.okSpacing,value==='');assert.equal(result.okCount,value!=='0');
  }
  console.log('PASS '+mode+' 不限／有限／0反覆切換、提示及真實規則檢查');
 }
 // Exercise the production engines with impossible count targets so work remains active.
 for(const mode of ['modeRed0','modeTraverse']){
  await page.click('#'+mode);
  await page.fill(mode==='modeRed0'?'#st4Min':'#tv4Min','104');
  await page.fill(mode==='modeRed0'?'#maxTwoThirteenReversal':'#tvRareReversalMax','');
  await page.click('#chipGen');
  await page.waitForFunction(()=>window.__isGeneratingShoe);
  for(const id of ['chipGen','chipStop','chipClear']){
   assert(await page.locator('#'+id).isEnabled());
   assert.equal(await page.locator('#'+id).evaluate(e=>getComputedStyle(e).pointerEvents),'auto');
  }
  await page.click('#chipGen');await page.click('#chipGen');
  await page.click('#chipStop');
  await page.waitForFunction(()=>!window.__isGeneratingShoe,null,{timeout:30000});
  await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>window.__isGeneratingShoe),false);
  await page.click('#chipGen');await page.waitForFunction(()=>window.__isGeneratingShoe);
  await page.click('#chipClear');
  await page.click('#chipStop');
  await page.waitForFunction(()=>!window.__isGeneratingShoe&&(!currentRounds||currentRounds.length===0),null,{timeout:30000});
  await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>currentRounds?.length||0),0);
  if(mode==='modeTraverse')assert.equal(await page.evaluate(()=>IntegratedModes.traversal.result),null);
  await page.click('#chipGen');await page.waitForFunction(()=>window.__isGeneratingShoe);
  await page.click('#chipClear');await page.click('#chipGen');await page.click('#chipStop');
  await page.waitForFunction(()=>!window.__isGeneratingShoe,null,{timeout:30000});
  await page.fill(mode==='modeRed0'?'#st4Min':'#tv4Min','');
  console.log('PASS '+mode+' 真實引擎重複生成／停止／清空／再生成，無舊工作回填');
 }
 // Deterministically hold the engine across cancellation to prove no overlapping jobs.
 await page.evaluate(()=>{
  window.__realBuild=TraverseBuilder.build;window.__buildCalls=0;window.__activeBuilds=0;window.__maxBuilds=0;
  TraverseBuilder.build=async opts=>{
   __buildCalls++;__activeBuilds++;__maxBuilds=Math.max(__maxBuilds,__activeBuilds);
   while(!opts.isCancelled())await new Promise(r=>setTimeout(r,10));
   await new Promise(r=>setTimeout(r,50));__activeBuilds--;return {cards:[],rejected:true};
  };
 });
 await page.click('#chipGen');await page.waitForFunction(()=>__buildCalls===1);
 await page.click('#chipGen');await page.click('#chipGen');
 await page.waitForFunction(()=>__buildCalls>=2);
 await page.click('#chipClear');
 await page.waitForFunction(()=>!window.__isGeneratingShoe);
 assert.equal(await page.evaluate(()=>__maxBuilds),1);
 assert.equal(await page.evaluate(()=>IntegratedModes.traversal.result),null);
 await page.evaluate(()=>TraverseBuilder.build=__realBuild);
 assert.deepEqual(errors,[]);console.log('PASS 延遲取消仍只有一個工作、清空不回填，無頁面錯誤');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
