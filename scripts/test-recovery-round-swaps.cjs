// 實際牌靴：保留每個位置的規則、整局牌面、所有上限；拒絕與停止不改輸入。
const assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  for(const mode of ['modeRed0','modeA2']) {
   const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('https://**/*',r=>r.abort());
   await page.goto(pathToFileURL(path.resolve(__dirname,'../integrated.html')).href);
   await page.click('#'+mode);
   const result=await page.evaluate(async()=>{
    for(const id of ['maxSideLimit','maxTieLimit','maxFourCardRate','max7PtReversal','maxBankerSixWin','maxTwoThirteenReversal','swapBanker6Target','st4Min','st4Max','st5Min','st5Max','st6Min','st6Max'])document.getElementById(id).value='';
    document.getElementById('avgRecoveryLimit').value='4.5';
    document.getElementById('tripleTieRule').checked=false;document.getElementById('lastCardNine').checked=false;
    let seed=5;Math.random=()=>{let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};
    const optimize=optimizeRecoveryRoundSwaps;
    window.optimizeRecoveryRoundSwaps=async rounds=>({rounds});
    await generateShoe();window.optimizeRecoveryRoundSwaps=optimize;
    const original=currentRounds,serialized=JSON.stringify(original);
    const target=original.map(standardRoundOutcome).filter(r=>r!=='和');
    TargetRoadmap.isActive=()=>true;TargetRoadmap.getTargetOutcomes=()=>target;
    const signature=rs=>rs.map(r=>JSON.stringify([standardRoundOutcome(r),r.cards.some(isSignalCardByConfig),r.cards.length,Boolean(r.isT),hasFullHouse(r),r.segment||'']));
    const hands=rs=>rs.map(r=>r.cards.map(c=>c.rank+c.suit).join(',')).sort();
    const score=rs=>RecoverySearch.measure(rs).score;
    // Tighten caps to the original shoe, so acceptance really checks all three.
    document.getElementById('maxBankerSixWin').value=''; // Draw exclusion would invalidate this unrestricted fixture.
    document.getElementById('max7PtReversal').value=count7PtReversals(original).count;
    document.getElementById('maxTwoThirteenReversal').value=TwoThirteenReversals.count(original);
    const cancelled=await optimize(original,{shouldStop:()=>true});
    let stopChecks=0;const interrupted=await optimize(original,{shouldStop:()=>++stopChecks>100});
    const validate=validateStandardGeneratedShoe;let rejections=0;
    window.validateStandardGeneratedShoe=(rs,...args)=>rs===original?validate(rs,...args):(rejections++,{ok:false});
    const rejected=await optimize(original);window.validateStandardGeneratedShoe=validate;
    const color=calculateCardColorViolations,plan=planBackColorsKeepFaces;let colorRejects=0;
    window.calculateCardColorViolations=()=>1;window.planBackColorsKeepFaces=()=>{colorRejects++;return {ok:false};};
    const badColor=await optimize(original);window.calculateCardColorViolations=color;window.planBackColorsKeepFaces=plan;
    const adopted=await optimize(original),rs=adopted.rounds;
    let pos=0;const positions=rs.every(r=>r.start_index===pos&&r.cards.every(c=>c.pos===pos++));
    return {cards:original.flatMap(r=>r.cards).length,unchanged:serialized===JSON.stringify(original),
     cancelled:cancelled.cancelled,cancelSame:cancelled.rounds===original,interrupted:interrupted.cancelled,stopChecks,rejections,rejected:rejected.rounds===original,
     colorRejects,colorRejected:badColor.rounds===original,adopted:adopted.adopted,ms:adopted.ms,
     before:score(original),after:score(rs),signatures:[signature(original),signature(rs)],hands:[hands(original),hands(rs)],
     positions,validation:validate(rs),color:color(rs),spacing:TwoThirteenReversals.check(rs,null,{enforceSpacing:StandardProfiles.current!=='a2'}).ok};
   });
   assert.deepEqual(errors,[]);assert.equal(result.cards,416);assert(result.unchanged);
   assert(result.cancelled&&result.cancelSame&&result.interrupted&&result.stopChecks>100);assert(result.rejections>0&&result.rejected);
   assert(result.colorRejects>0&&result.colorRejected);assert(result.adopted>0);assert(result.after<result.before);
   assert.deepEqual(...result.signatures);assert.deepEqual(...result.hands);
   assert(result.positions&&result.validation.ok&&result.spacing);assert.equal(result.color,0);
   assert(result.ms<550,`搜尋超出約500ms預算：${result.ms}`);
   console.log(`PASS ${mode} 整局／位置規則／上限／卡色／拒絕／取消／不改輸入；${result.before.toFixed(3)} → ${result.after.toFixed(3)}，${Math.round(result.ms)}ms`);
   await page.close();
  }
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
