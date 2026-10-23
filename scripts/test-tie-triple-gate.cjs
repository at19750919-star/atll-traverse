const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
 for(const mode of ['modeRed0','modeA2','modeTraverse','modeTraverseA2'])for(const triple of [false,true]){
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://script.google.com/**',r=>r.abort());await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:''}));
  const excel=path.join(process.env.CODEX_NODE_MODULES||'','exceljs/dist/exceljs.min.js');if(fs.existsSync(excel))await page.route('https://cdn.jsdelivr.net/npm/exceljs@*/dist/exceljs.min.js',r=>r.fulfill({path:path.resolve(excel),contentType:'text/javascript'}));
  await page.goto(pathToFileURL(path.resolve(process.env.ATLL_ROOT||path.join(__dirname,'..'),'integrated.html')).href);
  await page.click('#'+mode);
  await page.evaluate(({mode,triple})=>{
   const std=!mode.startsWith('modeTraverse');
   const ids=std?['avgRecoveryLimit','maxSideLimit','maxTieLimit','maxFourCardRate','max7PtReversal','maxBankerSixWin','maxTwoThirteenReversal','swapBanker6Target']:['tvLeft','tvSideLimit','tvTieMax','tvBankerSixMax','tvSevenReversalMax','tvRareReversalMax'];
   ids.forEach(id=>document.getElementById(id).value='');document.getElementById(std?'tripleTieRule':'tvTriple').checked=triple;document.getElementById(std?'lastCardNine':'tvNine').checked=false;
   let seed=triple?332:139;Math.random=()=>{let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};
   window.__spreadCalls=0;window.__metricCalls=0;window.__baseDisperse=TieSpread.disperse;window.__baseMetrics=TieSpread.metrics;
   TieSpread.disperse=async(...args)=>{__spreadCalls++;return __baseDisperse(...args);};TieSpread.metrics=(...args)=>{__metricCalls++;return __baseMetrics(...args);};
  },{mode,triple});
  await page.click('#chipGen');await page.waitForFunction(()=>!__isGeneratingShoe,null,{timeout:60000});
  const result=await page.evaluate(({mode,triple})=>({mode,triple,cards:currentRounds?.flatMap(r=>r.cards).length,calls:__spreadCalls,metrics:__metricCalls,report:window.__lastTieSpread,status:document.getElementById(mode.startsWith('modeTraverse')?'tvProgress':'logArea').textContent.slice(-1500)}),{mode,triple});
  assert.equal(result.cards,416,result.status);assert.deepEqual(errors,[]);
  if(mode==='modeRed0'||mode==='modeTraverse'){
   if(triple){assert.equal(result.calls,0);assert.equal(result.metrics,0);assert.equal(result.report,null);assert.match(result.status,/三條已開啟，略過和局分散/);}
   else {assert(result.report);assert(result.calls>0||result.metrics>0);}
  }else {assert.equal(result.calls,0);assert.equal(result.metrics,0);assert(!result.status.includes('三條已開啟，略過和局分散'));}
  console.log('PASS '+JSON.stringify({mode,triple,cards:result.cards,optimizerCalls:result.calls,safetySkip:result.report?.reason}));
  if(mode==='modeRed0'&&!triple){
   const proof=await page.evaluate(()=>{
    const cards=[new Card('K','♥',0),new Card('Q','♣',1),new Card('8','♣',2),new Card('8','♠',3)];
    const round={cards,result:standardRoundOutcome({cards})};
    const old={...TraverseBuilder.rules};Object.assign(TraverseBuilder.rules,{tripleTie:false,signalConfig:{suits:['♥','♦'],ranks:['10','J','Q','K']}});
    const need=TraverseBuilder.neededAfter(cards.map(c=>({rank:c.rank,suit:c.suit,point:c.point()})));
    Object.assign(TraverseBuilder.rules,old);
    return {actual:round.result,sensitive:standardRoundIsSensitive(round),hasSignal:cards.some(isSignalCardByConfig),standardNext:standardExpectedResult([round,{cards:[]}],1),traverseNext:need};
   });
   assert.deepEqual(proof,{actual:'和',sensitive:true,hasSignal:true,standardNext:'莊',traverseNext:'莊'});console.log('PASS 含紅0的合法敏感和局在點數／訊號判斷上成立，非全面禁止；一般挑局排除另有明文篩選');
  }
  await page.close();
 }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
