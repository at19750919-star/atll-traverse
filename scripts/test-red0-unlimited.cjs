const assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:!process.argv.includes('--headed')});
 try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://script.google.com/**',r=>r.abort());await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:''}));
 await page.goto(pathToFileURL(path.resolve(process.env.ATLL_ROOT||path.join(__dirname,'..'),'integrated.html')).href);
 for(const mode of ['modeRed0','modeTraverse']){
  await page.click('#'+mode);
  await page.evaluate(mode=>{
   const ids=mode==='modeRed0'?['avgRecoveryLimit','maxSideLimit','maxTieLimit','maxFourCardRate','max7PtReversal','maxBankerSixWin','maxTwoThirteenReversal','swapBanker6Target']:['tvLeft','tvSideLimit','tvTieMax','tvBankerSixMax','tvSevenReversalMax','tvRareReversalMax'];
   ids.forEach(id=>document.getElementById(id).value='');
   window.__checks=[];window.__realCheck=mode==='modeRed0'?TwoThirteenReversals.check:TraverseLimits.check;
   if(mode==='modeRed0')TwoThirteenReversals.check=(rounds,limit,opts)=>{__checks.push(opts?.enforceSpacing);return __realCheck(rounds,limit,opts);};
   else TraverseLimits.check=(result,limits)=>{__checks.push(limits.enforceSpacing);return __realCheck(result,limits);};
  },mode);
  await page.click('#chipGen');await page.waitForFunction(()=>!window.__isGeneratingShoe,null,{timeout:120000});
  const out=await page.evaluate(mode=>{
   const cards=currentRounds.flatMap(r=>r.cards),rare=mode==='modeRed0'?__realCheck(currentRounds,null):TwoThirteenReversals.check(TraverseExport.dealRounds(IntegratedModes.traversal.result.cards).filter(r=>r.hand),null);
   const inventory={};cards.forEach(c=>{const k=c.rank+c.suit+c.back_color;inventory[k]=(inventory[k]||0)+1;});
   return {cards:cards.length,inventory,checks:__checks,rare:rare.count,close:rare.spacingViolations.length,valid:mode==='modeRed0'?validateStandardGeneratedShoe(currentRounds).ok:__realCheck(IntegratedModes.traversal.result,{bankerSix:null,seven:null,rare:null,enforceSpacing:false}).ok,
    ties:currentRounds.flatMap((r,i)=>r.result==='和'?[i+1]:[]),triple:document.getElementById(mode==='modeRed0'?'tripleTieRule':'tvTriple').checked,
    status:document.getElementById(mode==='modeRed0'?'logArea':'tvProgress').textContent.slice(-700)};
  },mode);
  assert.equal(out.cards,416,out.status);assert(out.valid,out.status);assert(out.checks.length&&out.checks.every(v=>v===false));
  assert.equal(Object.keys(out.inventory).length,104);assert(Object.values(out.inventory).every(n=>n===4));
  console.log('PASS '+mode+' 真實416張不限逆轉生成、完整牌庫、所有驗收通過 '+JSON.stringify({rare:out.rare,close:out.close,ties:out.ties,triple:out.triple}));
  await page.evaluate(mode=>{if(mode==='modeRed0')TwoThirteenReversals.check=__realCheck;else TraverseLimits.check=__realCheck;},mode);
  await page.evaluate(()=>document.getElementById('clearBtn').click());
  assert.equal(await page.evaluate(()=>currentRounds?.length||0),0);
  if(mode==='modeTraverse')assert.equal(await page.evaluate(()=>IntegratedModes.traversal.result),null);
 }
 assert.deepEqual(errors,[]);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
