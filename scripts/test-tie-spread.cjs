const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
 const cases=[['modeRed0',false,5],['modeRed0',false,139],['modeRed0',true,332],['modeA2',false,139],['modeA2',true,332],['modeTraverse',false,5],['modeTraverse',false,1],['modeTraverse',false,2],['modeTraverse',false,3],['modeTraverse',true,332],['modeTraverseA2',false,139],['modeTraverseA2',true,332]];
 try{
 for(const [mode,triple,seed] of cases){
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://script.google.com/**',r=>r.abort());await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:''}));
  const excel=path.join(process.env.CODEX_NODE_MODULES||'','exceljs/dist/exceljs.min.js');if(fs.existsSync(excel))await page.route('https://cdn.jsdelivr.net/npm/exceljs@*/dist/exceljs.min.js',r=>r.fulfill({path:path.resolve(excel),contentType:'text/javascript'}));
  await page.goto(pathToFileURL(path.resolve(process.env.ATLL_ROOT||path.join(__dirname,'..'),'integrated.html')).href);
  await page.click('#'+mode);
  await page.evaluate(({mode,triple,seed})=>{
   const std=!mode.startsWith('modeTraverse'),ids=std?['avgRecoveryLimit','maxSideLimit','maxTieLimit','maxFourCardRate','max7PtReversal','maxBankerSixWin','maxTwoThirteenReversal','swapBanker6Target']:['tvLeft','tvSideLimit','tvTieMax','tvBankerSixMax','tvSevenReversalMax','tvRareReversalMax'];
   ids.forEach(id=>document.getElementById(id).value='');document.getElementById(std?'tripleTieRule':'tvTriple').checked=triple;document.getElementById(std?'lastCardNine':'tvNine').checked=false;
   if(mode==='modeTraverse'&&!triple){document.getElementById('tvMin').value='4';document.getElementById('tvMax').value='4';}
   let s=seed;Math.random=()=>{let t=s+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};
   window.__calls=0;window.__realSpread=TieSpread.disperse;
   const inventory=rs=>rs.flatMap(r=>r.cards.map(c=>c.rank+c.suit+c.back_color)).sort().join(',');
   TieSpread.disperse=async (rounds,opts)=>{
    __calls++;const before=inventory(rounds),order=rounds.slice(),validate=opts.validate;let accepted=rounds.slice(),verified=0;
    const report=await __realSpread(rounds,{...opts,validate:async candidate=>{
     const changed=candidate.flatMap((r,i)=>r!==accepted[i]?[i]:[]);
     if(changed.length!==2||candidate[changed[0]]!==accepted[changed[1]]||candidate[changed[1]]!==accepted[changed[0]])throw new Error('不是直接兩局互換');
     const v=await validate(candidate);if(typeof v==='boolean'?v:v?.ok){accepted=candidate.slice();verified++;}return v;
    }});
    if(inventory(report.rounds)!==before||rounds.some((r,i)=>r!==order[i]))throw new Error('牌庫或原輸入被改動');
    for(const t of report.targets)if(report.rounds.indexOf(order[t.original-1])+1!==t.actual)throw new Error('已定位和局被移走');
    window.__evidence={sameInventory:true,directSwaps:verified,valid:report.cancelled?null:await validate(report.rounds)};return report;
   };
  },{mode,triple,seed});
  const started=Date.now();await page.click('#chipGen');await page.waitForFunction(()=>!__isGeneratingShoe,null,{timeout:90000});
  const out=await page.evaluate(({mode,triple,seed})=>({mode,triple,seed,cards:currentRounds?.flatMap(r=>r.cards).length,calls:__calls,report:window.__lastTieSpread,evidence:window.__evidence,status:document.getElementById(mode.startsWith('modeTraverse')?'tvProgress':'logArea').textContent.slice(-1200)}),{mode,triple,seed});out.totalMs=Date.now()-started;
  assert.equal(out.cards,416,out.status);assert.deepEqual(errors,[]);
  const red=mode==='modeRed0'||mode==='modeTraverse';
  if(!red||triple){assert.equal(out.calls,0);if(red){assert.equal(out.report,null);assert.match(out.status,/三條已開啟/);}}
  else{
   assert(out.report,out.status);assert.equal(out.report.before.positions.length,out.report.after.positions.length);
   assert(out.report.targets.every(t=>Math.abs(t.error)<=Math.abs(t.original-t.ideal)+.001));
   if(out.evidence){const v=out.evidence.valid;assert(typeof v==='boolean'?v:v?.ok,out.status);assert.equal(out.evidence.directSwaps,out.report.moves);}
  }
  delete out.status;results.push(out);console.log('PASS '+JSON.stringify(out));
  if(!triple&&((mode==='modeRed0'&&seed===139)||(mode==='modeTraverse'&&seed===2))){
   await page.evaluate(mode=>{
    if(mode==='modeTraverse'){const fixture=JSON.parse(JSON.stringify(IntegratedModes.traversal.result));TraverseBuilder.build=async()=>JSON.parse(JSON.stringify(fixture));}
    window.__waitEntered=false;TieSpread.disperse=async(rounds,opts)=>{__waitEntered=true;while(!__stopGenerateRequested)await new Promise(r=>setTimeout(r,5));return __realSpread(rounds,opts);};
   },mode);
   const signature=await page.evaluate(()=>currentRounds.flatMap(r=>r.cards.map(c=>c.rank+c.suit+c.back_color)).join(','));
   await page.click('#chipGen');await page.waitForFunction(()=>__waitEntered);await page.click('#chipStop');await page.waitForFunction(()=>!__isGeneratingShoe);
   assert.equal(await page.evaluate(()=>currentRounds.flatMap(r=>r.cards.map(c=>c.rank+c.suit+c.back_color)).join(',')),signature);
   await page.evaluate(()=>__waitEntered=false);await page.click('#chipGen');await page.waitForFunction(()=>__waitEntered);await page.click('#chipClear');await page.waitForFunction(()=>!__isGeneratingShoe&&!currentRounds?.length);await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>currentRounds?.length||0),0);
   console.log('PASS '+mode+' 定位階段停止保留舊牌、清空後舊工作不回填');
  }
  await page.close();
 }
 fs.writeFileSync(path.join(__dirname,'validation','tie-target-results.json'),JSON.stringify(results,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
