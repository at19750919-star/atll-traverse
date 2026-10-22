const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const R = require('../standard/two_thirteen_reversals.js');
const rare = () => ({ cards:[0,0,3,6,5].map(n=>({rank:n===0?'K':String(n)})) });
(async()=>{
  const adjacent=[rare(),rare()];
  assert.equal(R.check(adjacent,2).okSpacing,false,'紅0／舊呼叫仍限制間隔');
  assert.equal(R.check(adjacent,2,{enforceSpacing:false}).ok,true,'取消間隔後相鄰逆轉可接受');
  assert.equal(R.check(adjacent,1,{enforceSpacing:false}).okCount,false,'次數上限不能取消');
  assert.equal(R.check(adjacent,0,{enforceSpacing:false}).okCount,false,'0仍禁止逆轉');
  assert.equal(R.check(adjacent,null,{enforceSpacing:false}).count,2);
  const untouched=await R.repairSpacing(adjacent,{enforceSpacing:false});
  assert(untouched.ok);assert.equal(untouched.rounds,adjacent);assert.deepEqual(untouched.swaps,[]);
  console.log('PASS A2只取消間隔，留白／0／數字次數上限保留，不做整局交換；紅0預設保留');
  if(process.argv.includes('--unit'))return;
  const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://script.google.com/**',r=>r.abort());
    await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:''}));
    await page.goto(pathToFileURL(path.resolve(__dirname,'../integrated.html')).href);
    for(const [mode,scope,limited] of [['modeRed0','standardControls',true],['modeA2','standardControls',false],['modeTraverse','traverseControls',true],['modeTraverseA2','traverseControls',false]]){
      await page.click('#'+mode);
      const note=await page.locator('#'+scope+' .rare-reversal-note').textContent();
      assert(limited?note.includes('超過20局'):note.includes('不限間隔'),mode+': '+note);
      const out=await page.evaluate(({mode})=>{
        const cards=[0,0,3,6,5,0,0,3,6,5].map((n,i)=>({rank:n===0?'K':String(n),suit:'♠',point:n,back_color:'B',pos:i}));
        const rounds=[cards.slice(0,5),cards.slice(5)].map(cards=>({cards:cards.map((c,i)=>new Card(c.rank,c.suit,i))}));
        if(mode.startsWith('modeTraverse'))return TraverseLimits.check({cards},{bankerSix:null,seven:null,rare:2,enforceSpacing:IntegratedModes.tsub!=='a2'});
        return checkStandardRareReversals(rounds,2);
      },{mode});
      assert.equal(out.okSpacing,!limited,mode);assert.equal(out.okCount,true,mode);
      await page.click('#'+(scope==='standardControls'?'stSettingsToggle':'tvSettingsToggle'));
      const summary=await page.locator('#'+(scope==='standardControls'?'stSettingsSummary':'tvSettingsSummary')).textContent();
      assert(limited?summary.includes('間隔>20局'):summary.includes('不限間隔'),mode+': '+summary);
      await page.click('#'+(scope==='standardControls'?'stSettingsToggle':'tvSettingsToggle'));
    }
    console.log('PASS 四模式切換：兩個A2無間隔，兩個紅0保留間隔，提示與摘要一致');
    await page.click('#modeA2');
    await page.evaluate(()=>{
      for(const id of ['avgRecoveryLimit','maxSideLimit','maxTieLimit','maxFourCardRate','max7PtReversal','swapBanker6Target'])document.getElementById(id).value='';
      document.getElementById('maxTwoThirteenReversal').value='4';
      window.__spacingChecks=[];window.__oldRareCheck=TwoThirteenReversals.check;
      TwoThirteenReversals.check=(rounds,limit,options)=>{__spacingChecks.push(options?.enforceSpacing);return __oldRareCheck(rounds,limit,options);};
      window.__oldSpacingRepair=repairRareReversalSpacing;
      repairRareReversalSpacing=()=>{throw new Error('A2不應呼叫逆轉間隔交換');};
    });
    let standard;
    for(let n=0;n<8;n++){
      await page.click('#chipGen');await page.waitForFunction(()=>!window.__isGeneratingShoe,null,{timeout:120000});
      standard=await page.evaluate(()=>({done:/生成完成!/.test(document.getElementById('logArea').textContent),
        validation:currentRounds&&validateStandardGeneratedShoe(currentRounds),checks:__spacingChecks,
        rare:currentRounds&&__oldRareCheck(currentRounds,null),inventory:currentRounds?.flatMap(r=>r.cards).length,
        log:document.getElementById('logArea').textContent.slice(-700)}));
      if(standard.done&&standard.rare.spacingViolations.length)break;
    }
    assert(standard.done,standard.log);assert(standard.validation.ok);assert(standard.checks.length&&standard.checks.every(x=>x===false));
    assert(standard.rare.count<=4);assert(standard.rare.spacingViolations.length>0,'實際A2須有相鄰逆轉樣本');assert.equal(standard.inventory,416);
    console.log('PASS 一般A2實際生成416張，逆轉間隔不足仍完成、次數≤4且其他驗收通過');
    await page.evaluate(()=>{TwoThirteenReversals.check=__oldRareCheck;repairRareReversalSpacing=__oldSpacingRepair;});
    await page.click('#modeTraverseA2');
    await page.evaluate(()=>{
      for(const id of ['tvLeft','tvSideLimit','tvTieMax','tvBankerSixMax','tvSevenReversalMax'])document.getElementById(id).value='';
      document.getElementById('tvRareReversalMax').value='4';
      window.__traverseSpacingChecks=[];window.__oldTraverseCheck=TraverseLimits.check;
      TraverseLimits.check=(result,limits)=>{__traverseSpacingChecks.push(limits.enforceSpacing);return __oldTraverseCheck(result,limits);};
      TraverseLimits.repairSpacing=()=>{throw new Error('穿越A2不應呼叫逆轉間隔交換');};
    });
    let traverse;
    for(let n=0;n<8;n++){
      await page.click('#chipGen');await page.waitForFunction(()=>!IntegratedModes.busy,null,{timeout:120000});
      traverse=await page.evaluate(()=>{
        const result=IntegratedModes.traversal.result;if(!result)return {done:false,log:document.getElementById('tvProgress').textContent};
        const rs=TraverseExport.dealRounds(result.cards).filter(r=>r.hand),actual=TwoThirteenReversals.check(rs,null);
        const inventory={};for(const c of result.cards){const k=c.rank+c.suit+c.back_color;inventory[k]=(inventory[k]||0)+1;}
        return {done:document.getElementById('tvProgress').textContent.startsWith('完成'),actual,
          check:__oldTraverseCheck(result,{bankerSix:null,seven:null,rare:4,enforceSpacing:false}),
          checks:__traverseSpacingChecks,cards:result.cards.length,inventory};
      });
      if(traverse.done&&traverse.actual.spacingViolations.length)break;
    }
    assert(traverse.done,JSON.stringify(traverse));assert(traverse.check.ok);assert(traverse.checks.length&&traverse.checks.every(x=>x===false));
    assert(traverse.actual.count<=4);assert(traverse.actual.spacingViolations.length>0,'實際穿越A2須有間隔不足樣本');assert.equal(traverse.cards,416);
    assert.equal(Object.keys(traverse.inventory).length,104);assert(Object.values(traverse.inventory).every(n=>n===4));
    assert.deepEqual(errors,[]);console.log('PASS 穿越A2實際生成416張，間隔不足仍完成、次數≤4、完整紅藍牌庫保留');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
