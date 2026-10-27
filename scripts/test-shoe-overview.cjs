const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const {chromium} = require('playwright');
const ROOT = path.resolve(__dirname,'..');
const server = http.createServer((req,res)=>{
  const file=path.resolve(ROOT,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));
  if(!file.startsWith(ROOT+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1791,height:1000}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://**',r=>r.fulfill({body:''}));
    await page.goto(`http://127.0.0.1:${server.address().port}/integrated.html`);
    await page.waitForFunction(()=>!!window.ShoeOverview);
    assert(await page.locator('#btnShoeOverview').isDisabled());assert(await page.locator('#shoeOverview').isHidden());
    assert.deepEqual(await page.evaluate(()=>ShoeOverview.longestRuns(['莊','莊','和','莊','閒','閒','閒','和'].map(result=>({result})))),{莊:2,閒:3});
    const swapCases=await page.evaluate(()=>{
      let onlyAfter=null,onlyActual=null,neither=null;
      for(let n=0;n<10000&&(!onlyAfter||!onlyActual||!neither);n++){
        const cards=String(n).padStart(4,'0').split('').map((digit,i)=>new Card(digit==='0'?'10':digit,'♠',i));
        const hand={cards},actual=isBankerSixWinRound(hand),after=isSwapBankerSixRound(hand);
        if(!actual&&after)onlyAfter=String(n).padStart(4,'0');
        if(actual&&!after)onlyActual=String(n).padStart(4,'0');
        if(!actual&&!after)neither=String(n).padStart(4,'0');
      }
      return {onlyAfter,onlyActual,neither};
    });
    assert(Object.values(swapCases).every(Boolean),JSON.stringify(swapCases));
    console.log('PASS 對調後才莊6、只有原牌莊6與兩者都不是三種實際牌型分別判定');
    await page.evaluate(()=>{window.generatedEvents=0;document.addEventListener('shoe-generated',()=>window.generatedEvents++);});
    async function checkOverview(label){
      try { await page.waitForFunction(()=>document.getElementById('shoeOverview').open,null,{timeout:90000}); }
      catch(e){console.error(await page.evaluate(()=>({busy:IntegratedModes.busy,standard:window.__isGeneratingShoe,events:window.generatedEvents,log:document.getElementById('logArea').textContent.slice(-1800),errors:document.getElementById('tvProgress').textContent})));throw e;}
      const snapshot=await page.evaluate(()=>{
        const rounds=currentRounds.filter(r=>['莊','閒','和'].includes(r.result));
        const key=()=>JSON.stringify(currentRounds.map(r=>r.cards.map(c=>[c.rank,c.suit,c.back_color,c.pos])));
        const before=key();ShoeOverview.show();
        const metrics=Object.fromEntries([...document.querySelectorAll('[data-metric]')].map(e=>[e.dataset.metric,e.querySelector('strong').textContent]));
        const stats=calculateViolationStats(currentRounds),noSwap=calculateCannotSwapViolations(currentRounds);
        const b6=rounds.filter(isBankerSixWinRound).length,swappedB6=rounds.filter(isSwapBankerSixRound).length,seven=count7PtReversals(rounds).count,p7=PlayerSevenLimits.check(rounds,null).count,rare=TwoThirteenReversals.count(rounds);
        const outcomes=[...document.querySelectorAll('.shoe-overview-outcome strong')].map(e=>parseInt(e.textContent));
        const recovery=IntegratedAnalysis.recovery(currentRounds);
        return {unchanged:key()===before,metrics,b6,swappedB6,sourceSwap:document.getElementById('recoverySwapB6Count').textContent.trim(),seven,p7,rare,outcomes,expectedOutcomes:['莊','閒','和'].map(s=>rounds.filter(r=>r.result===s).length),
          stats,noSwap,violations:document.getElementById('shoeOverviewViolations').textContent,
          mapCells:document.querySelectorAll('#shoeOverviewMap .map-cell').length,rounds:rounds.length,
          recovery:document.getElementById('shoeOverviewRecovery').textContent,avg:recovery.avgRounds,
          safeCells:document.querySelectorAll('.shoe-overview-cut-grid span').length,mainMapVisible:shoeMapVisible,
          duplicateIds:[...document.querySelectorAll('[id]')].map(e=>e.id).filter((id,i,a)=>a.indexOf(id)!==i)};
      });
      assert(snapshot.unchanged);assert.deepEqual(snapshot.duplicateIds,[]);assert.equal(snapshot.mapCells,snapshot.rounds);assert.equal(snapshot.safeCells,416);
      assert.equal(snapshot.metrics.bankerSix,`${snapshot.b6} 局`);assert.equal(snapshot.metrics.swapBankerSix,`${snapshot.swappedB6} 局`);assert.equal(parseInt(snapshot.sourceSwap),snapshot.swappedB6);assert.equal(snapshot.metrics.playerSeven,`${snapshot.p7} 局`);
      assert.equal(snapshot.metrics.seven,`${snapshot.seven} 局`);assert.equal(snapshot.metrics.rare,`${snapshot.rare} 局`);
      assert.deepEqual(snapshot.outcomes,snapshot.expectedOutcomes);assert(snapshot.recovery.includes(snapshot.avg+' 局'));assert(!snapshot.recovery.includes('NaN'));assert(!snapshot.mainMapVisible);
      if(snapshot.noSwap.count)assert(snapshot.violations.includes(snapshot.noSwap.count+' 處'));
      assert.deepEqual(errors,[]);console.log('PASS '+label+' 自動開啟、統計一致、完整416切點、原牌與原面板不變');
    }
    const layoutOnly=process.env.OVERVIEW_LAYOUT_ONLY==='1';
    for(const mode of (layoutOnly?['red0']:['red0','a2'])){
      await page.evaluate(mode=>{
        IntegratedModes.switchMode(mode);
        for(const id of ['avgRecoveryLimit','range16Limit','maxTieLimit','maxFourCardRate','swapBanker6Target','maxSideLimit','maxBankerSixWin','max7PtReversal','maxTwoThirteenReversal']){const input=document.getElementById(id);if(input)input.value='';}
        document.getElementById('maxPlayerSeven').value='2';
        for(const id of ['tripleTieRule','lastCardNine'])document.getElementById(id).checked=false;
        let seed=1;Math.random=()=>{let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};
        void (async()=>{const before=window.generatedEvents;for(let n=0;n<10&&window.generatedEvents===before;n++)await generateShoe();})();
      },mode);
      await checkOverview(mode);
      await page.locator('#shoeOverviewClose').click();assert(await page.locator('#shoeOverview').isHidden());
      await page.locator('#btnShoeOverview').click();assert(await page.locator('#shoeOverview').isVisible());
      await page.keyboard.press('Escape');assert(await page.locator('#shoeOverview').isVisible());
      await page.locator('#shoeOverviewClose').click();
    }
    for(const mode of (layoutOnly?[]:['traverse-red0','traverse-a2','traverse-asred0','traverse-asa2'])){
      await page.evaluate(mode=>{
        IntegratedModes.switchMode(mode);
        for(const id of ['tvLeft','tvSideLimit','tvTieMax','tvBankerSixMax','tvSevenReversalMax','tvRareReversalMax'])document.getElementById(id).value='';
        document.getElementById('tvPlayerSevenMax').value='2';
        for(const id of ['tvTriple','tvSecond','tvTailFill'])document.getElementById(id).checked=true;
        document.getElementById('tvNine').checked=false;
        for(const [id,value] of Object.entries({tvIdle:150,tvTries:2000,tvChain:1}))document.getElementById(id).value=value;
        let seed=112;Math.random=()=>{let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};
        void IntegratedModes.generateTraverse();
      },mode);
      await checkOverview(mode);
      await page.keyboard.press('Escape');assert(await page.locator('#shoeOverview').isVisible());
      await page.locator('#shoeOverviewClose').click();
    }
    // Invalid settings and a stopped generation must not reopen the previous result.
    if(!layoutOnly){const count=await page.evaluate(()=>window.generatedEvents);
    await page.evaluate(()=>{document.getElementById('tvMin').value='0';void IntegratedModes.generateTraverse();});
    await page.waitForTimeout(100);assert(await page.locator('#shoeOverview').isHidden());assert.equal(await page.evaluate(()=>window.generatedEvents),count);
    await page.evaluate(()=>{document.getElementById('tvMin').value='8';document.getElementById('chipGen').click();document.getElementById('chipStop').click();});
    await page.waitForFunction(()=>!IntegratedModes.busy&&!document.body.classList.contains('running'));
    await page.waitForTimeout(100);assert(await page.locator('#shoeOverview').isHidden());assert.equal(await page.evaluate(()=>window.generatedEvents),count);
    console.log('PASS 設定錯誤與停止不彈舊牌總覽');}
    await page.evaluate(()=>ShoeOverview.show());
    for(const [width,height] of [[1791,800],[2048,800],[2560,900],[1280,720],[800,900],[390,900]]){
      await page.setViewportSize({width,height});
      const size=await page.locator('#shoeOverview').evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth,left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right,
        contentHeight:e.querySelector('.shoe-overview-body').scrollHeight,visibleHeight:e.querySelector('.shoe-overview-body').clientHeight,
        analysisBottom:e.querySelector('.shoe-overview-analysis').getBoundingClientRect().bottom,dialogBottom:e.getBoundingClientRect().bottom}));
      assert(size.scroll<=size.width+1&&size.left>=0&&size.right<=width,JSON.stringify(size));
      if(width>=1280)assert(size.contentHeight<=size.visibleHeight+1&&size.analysisBottom<=size.dialogBottom,JSON.stringify({width,height,size}));
      if(width>=1280)console.log(`LAYOUT ${width}x${height} body ${size.visibleHeight}/${size.contentHeight} dialogBottom ${size.dialogBottom.toFixed(1)}`);
      if(process.env.OVERVIEW_SCREENSHOT&&[1791,2048,1280].includes(width))await page.locator('#shoeOverview').screenshot({path:process.env.OVERVIEW_SCREENSHOT.replace(/\.png$/,`-${width}.png`)});
    }
    await page.setViewportSize({width:1791,height:1000});
    if(process.env.OVERVIEW_SCREENSHOT)await page.locator('#shoeOverview').screenshot({path:process.env.OVERVIEW_SCREENSHOT});
    if(layoutOnly){
      assert(await page.locator('#shoeOverviewViolationStrip').isHidden());
      await page.evaluate(()=>{
        window.__originalOverviewViolations=window.calculateViolationStats;
        window.calculateViolationStats=rounds=>({...window.__originalOverviewViolations(rounds),signalViolations:2,signalViolationRounds:[3,7],cardColorChecked:false});
        ShoeOverview.show();
      });
      assert(await page.locator('#shoeOverviewViolationStrip').isVisible());
      assert.equal(await page.locator('#shoeOverviewViolations .shoe-overview-violation').count(),2);
      assert.match(await page.locator('#shoeOverviewHeaderStats').textContent(),/違規 1 項.*部分未檢查/);
      await page.evaluate(()=>{window.calculateViolationStats=window.__originalOverviewViolations;ShoeOverview.show();});
      assert(await page.locator('#shoeOverviewViolationStrip').isHidden());
      console.log('PASS 無違規時不留空欄；有違規只顯示非零項目，未檢查如實標明');
    }
    await page.setViewportSize({width:2048,height:800});
    await page.locator('#shoeOverviewMap .map-cell').first().click();
    assert(await page.locator('#shoeOverview').isVisible());
    const header=await page.locator('.shoe-overview-head').boundingBox(),beforeDrag=await page.locator('#shoeOverview').boundingBox();
    await page.mouse.move(header.x+45,header.y+20);await page.mouse.down();await page.mouse.move(header.x+155,header.y+90,{steps:5});await page.mouse.up();
    const moved=await page.locator('#shoeOverview').boundingBox();
    assert(moved.x>beforeDrag.x+30&&moved.y>beforeDrag.y+30,JSON.stringify({beforeDrag,moved}));
    await page.keyboard.press('Escape');assert(await page.locator('#shoeOverview').isVisible());
    const oldCount=await page.evaluate(()=>window.generatedEvents);
    await page.evaluate(()=>document.getElementById('chipGen').click());
    await page.waitForFunction(()=>document.body.classList.contains('running'));
    assert(await page.locator('#shoeOverview').isVisible());
    assert.match(await page.locator('#shoeOverviewMeta').textContent(),/生成中，顯示上次總覽/);
    await page.waitForFunction(count=>window.generatedEvents>count,oldCount,{timeout:60000});
    await page.waitForFunction(()=>!document.body.classList.contains('running'));
    assert(await page.locator('#shoeOverview').isVisible());
    const afterGenerate=await page.locator('#shoeOverview').boundingBox();
    assert(Math.abs(afterGenerate.x-moved.x)<2&&Math.abs(afterGenerate.y-moved.y)<2,JSON.stringify({moved,afterGenerate}));
    const beforeStopEvents=await page.evaluate(()=>window.generatedEvents);
    await page.evaluate(()=>document.getElementById('chipGen').click());
    await page.waitForFunction(()=>document.body.classList.contains('running'));
    await page.evaluate(()=>document.getElementById('chipStop').click());
    await page.waitForFunction(()=>!document.body.classList.contains('running'));
    assert(await page.locator('#shoeOverview').isVisible());
    assert.equal(await page.evaluate(()=>window.generatedEvents),beforeStopEvents);
    await page.evaluate(()=>IntegratedModes.switchMode('a2'));
    assert(await page.locator('#shoeOverview').isVisible());
    await page.waitForFunction(()=>document.getElementById('shoeOverviewMeta').textContent.includes('A2'));
    await page.evaluate(()=>IntegratedModes.switchMode('red0'));
    await page.waitForFunction(()=>document.getElementById('shoeOverviewMetrics').children.length===6);
    await page.evaluate(()=>document.getElementById('chipClear').click());
    await page.waitForFunction(()=>!currentRounds?.length&&document.getElementById('shoeOverviewMeta').textContent.includes('尚無牌靴'));
    assert(await page.locator('#shoeOverview').isVisible());assert(await page.locator('#btnShoeOverview').isDisabled());
    const afterClear=await page.locator('#shoeOverview').boundingBox();
    assert(Math.abs(afterClear.x-moved.x)<2&&Math.abs(afterClear.y-moved.y)<2,JSON.stringify({moved,afterClear}));
    await page.locator('#shoeOverviewClose').click();assert(await page.locator('#shoeOverview').isHidden());
    assert.deepEqual(errors,[]);console.log('PASS 可拖曳且生成／切模式／清空維持原位，只有關閉鈕收起；零頁面錯誤');
  }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
