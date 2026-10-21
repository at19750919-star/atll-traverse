const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const ROOT = path.resolve(__dirname,'..');
function dependency(name) {
  for(const base of [process.env.CODEX_NODE_MODULES,path.join(process.env.USERPROFILE||'','.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'),path.resolve(ROOT,'../百家3.0/node_modules')].filter(Boolean)) {
    try{return require(path.join(base,name));}catch(_){}
  }
  return require(name);
}
const {chromium}=dependency('playwright');
const server=http.createServer((req,res)=>{
  const file=path.resolve(ROOT,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));
  if(!file.startsWith(ROOT+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}
  const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'};
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(fs.readFileSync(file));
});
const checks=[];
async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
async function setLimit(page,value){await page.locator('#maxBankerSixWin').fill(String(value));await page.locator('#maxBankerSixWin').dispatchEvent('change');}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const context=await browser.newContext({viewport:{width:1791,height:900}}),errors=[];
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
    await page.route('https://script.google.com/**',r=>r.abort());
    const dist=path.resolve(ROOT,'../百家3.0/node_modules/exceljs/dist/exceljs.min.js');
    if(fs.existsSync(dist))await page.route('https://cdn.jsdelivr.net/npm/exceljs@*/dist/exceljs.min.js',r=>r.fulfill({path:dist,contentType:'text/javascript'}));
    await page.goto(`http://127.0.0.1:${server.address().port}/integrated.html`);
    await page.waitForFunction(()=>!!window.IntegratedModes);
    await check('紅0／A2各自保存，0與留白有效，舊設定相容且穿越不顯示',async()=>{
      assert.equal(await page.locator('#maxBankerSixWin').inputValue(),'');
      await setLimit(page,0);await page.locator('#modeA2').click();
      assert.equal(await page.locator('#maxBankerSixWin').inputValue(),'');
      await setLimit(page,3);await page.locator('#modeRed0').click();
      assert.equal(await page.locator('#maxBankerSixWin').inputValue(),'0');
      await page.reload();await page.waitForFunction(()=>!!window.IntegratedModes);
      assert.equal(await page.locator('#maxBankerSixWin').inputValue(),'0');
      await setLimit(page,'');assert.equal(await page.evaluate(()=>readBankerSixWinLimit().limit),null);
      await page.locator('#modeA2').click();assert.equal(await page.locator('#maxBankerSixWin').inputValue(),'3');
      await page.locator('#modeTraverseA2').click();assert(await page.locator('#maxBankerSixWin').isHidden());
      await page.locator('#modeA2').click();
      await page.evaluate(()=>{const p=JSON.parse(localStorage.getItem('at-settings-a2'));delete p.maxBankerSixWin;localStorage.setItem('at-settings-a2',JSON.stringify(p));});
      await page.reload();await page.waitForFunction(()=>!!window.IntegratedModes);
      assert.equal(await page.locator('#maxBankerSixWin').inputValue(),'');
    });
    await check('非法值阻止生成，欄位在四種寬度保持可讀',async()=>{
      for(const value of [-1,1.5,105]) {
        await setLimit(page,value);await page.locator('#chipGen').click();
        assert.equal(await page.evaluate(()=>window.__isGeneratingShoe===true),false);
        assert(await page.locator('#maxBankerSixWin').evaluate(e=>!!e.validationMessage));
      }
      await setLimit(page,2);
      for(const width of [2560,1791,1024,390]) {
        await page.setViewportSize({width,height:900});
        assert(await page.locator('#maxBankerSixWin').isVisible());
        assert(await page.locator('#maxBankerSixWin').evaluate(e=>{const a=e.getBoundingClientRect(),b=e.closest('label').getBoundingClientRect();return a.width>=50&&a.right<=b.right+1;}));
      }
      await page.setViewportSize({width:1791,height:900});
      if(process.env.BANKER_SIX_SCREENSHOT)await page.locator('#standardControls').screenshot({path:process.env.BANKER_SIX_SCREENSHOT});
    });
    await check('判定實際5張／6張莊6贏，排除和／閒贏及只在對調後成立的牌局',async()=>{
      const actual=await page.evaluate(()=>{
        const make=values=>({cards:values.map((n,i)=>new Card(n===0?'K':n===1?'A':String(n),'♠',i)),result:'錯誤欄位'});
        const cases=[[0,0,0,6,0],[0,0,0,0,0,6],[0,0,0,6,6,0],[0,0,0,6,7,0],[0,0,0,0,0,5],[0,0,0,6,6,1]].map(make);
        let swapOnly=null;
        outer:for(let a=0;a<10;a++)for(let b=0;b<10;b++)for(let c=0;c<10;c++)for(let d=0;d<10;d++)for(let t=0;t<10;t++) {
          const r=make([a,b,c,d,t]),sw={cards:r.cards.slice()};[sw.cards[0],sw.cards[1]]=[sw.cards[1],sw.cards[0]];
          if(!isBankerSixWinRound(r)&&isBankerSixWinRound(sw)){swapOnly=r;break outer;}
        }
        const rounds=[...cases,swapOnly];
        return {flags:rounds.map(isBankerSixWinRound),at2:checkBankerSixWinLimit(rounds,2),at1:checkBankerSixWinLimit(rounds,1),blank:checkBankerSixWinLimit(rounds,null),empty:isBankerSixWinRound(null)};
      });
      assert.deepEqual(actual.flags,[true,true,false,false,false,false,false]);
      assert(!actual.at2.ok);assert(actual.at2.okCount);assert(!actual.at2.okDraws);assert(!actual.at1.okCount);
      assert.equal(actual.at2.count,2);assert(actual.blank.ok);assert.equal(actual.empty,false);
    });
    await check('填上限就排除原牌或對調後補第三張莊6，留白依原開關，五張莊6仍依上限',async()=>{
      const results=await page.evaluate(()=>{
        const make=values=>({cards:values.map((n,i)=>new Card(n===0?'K':String(n),'♠',i)),result:'莊'});
        const five=make([0,0,0,6,0]),six=make([0,0,0,0,0,6]),swapOnly=make([0,2,0,0,0,6]);
        const flags=[five,six,swapOnly].map(hasBankerSixDrawWin),out=[];
        for(const [value,checked] of [['',false],['',true],['2',false],['0',false]]){
          document.getElementById('maxBankerSixWin').value=value;document.getElementById('skipBanker6').checked=checked;
          out.push({value,checked,enabled:isBankerSixDrawExclusionEnabled(),skips:[five,six,swapOnly].map(shouldSkipSensitiveRound)});
        }
        document.getElementById('maxBankerSixWin').value='2';document.getElementById('skipBanker6').checked=false;
        return {flags,out,fiveOK:checkBankerSixWinLimit([five],2).ok,fiveAtZero:checkBankerSixWinLimit([five],0).ok,sixAt104:checkBankerSixWinLimit([six,swapOnly],104)};
      });
      assert.deepEqual(results.flags,[false,true,true]);assert(results.fiveOK);assert(!results.fiveAtZero);
      assert(!results.sixAt104.ok&&results.sixAt104.okCount);assert.deepEqual(results.sixAt104.forbiddenRounds,[1,2]);
      assert.deepEqual(results.out.map(r=>r.enabled),[false,true,true,true]);
      assert.deepEqual(results.out.map(r=>r.skips),[[false,false,false],[false,true,true],[false,true,true],[false,true,true]]);
    });
    await check('實際挑敏感局在0／1／2上限停止加入莊6贏',async()=>{
      const counts=await page.evaluate(()=>{
        document.getElementById('tripleTieRule').checked=false;document.getElementById('swapBanker6Target').value='';
        const out=[];
        for(const cap of [0,1,2]) {
          document.getElementById('maxBankerSixWin').value=String(cap);
          const rounds=pack_all_sensitive_and_segment(build_shuffled_deck()).a_rounds;
          out.push({cap,total:rounds.length,...checkBankerSixWinLimit(rounds,cap)});
        }
        return out;
      });
      for(const r of counts){assert(r.total>0);assert(r.count<=r.cap,JSON.stringify(r));assert.deepEqual(r.forbiddenRounds,[]);}
    });
    for(const [mode,cap] of [['modeRed0',0],['modeA2',2]])await check(mode+'完整生成符合上限，統計一致、生成鎖定與牌庫保留',async()=>{
      await page.locator('#'+mode).click();await setLimit(page,cap);
      await page.evaluate(()=>{
        for(const id of ['avgRecoveryLimit','maxTieLimit','maxSideLimit','maxFourCardRate','max7PtReversal','swapBanker6Target'])document.getElementById(id).value='';
        document.getElementById('maxTwoThirteenReversal').value='0';
        for(const id of ['skipBanker6','skipPlayer7Banker6','lastCardNine','tripleTieRule'])document.getElementById(id).checked=false;
        window.__sixLocked=false;
        new MutationObserver(()=>{if(window.__isGeneratingShoe&&document.getElementById('maxBankerSixWin').disabled)window.__sixLocked=true;})
          .observe(document.getElementById('maxBankerSixWin'),{attributes:true,attributeFilter:['disabled']});
      });
      // The old hidden swap target must not demand nine forbidden draw-B6 rounds.
      if(mode==='modeA2')await page.evaluate(()=>{document.getElementById('swapBanker6Target').value='9';});
      await page.locator('#chipGen').click();
      await page.waitForFunction(()=>!window.__isGeneratingShoe&&currentRounds?.length>0,{},{timeout:120000}).catch(async e=>{console.log(await page.locator('#logArea').textContent());throw e;});
      const out=await page.evaluate(()=>{
        const inventory={};for(const c of currentRounds.flatMap(r=>r.cards)){const k=c.rank+c.suit+c.back_color;inventory[k]=(inventory[k]||0)+1;}
        return {...checkBankerSixWinLimit(currentRounds,readBankerSixWinLimit().limit),stat:document.getElementById('recoveryBanker6Count').textContent,inventory,locked:window.__sixLocked};
      });
      assert(out.count<=cap,JSON.stringify(out));assert.equal(parseInt(out.stat),out.count);
      assert.deepEqual(out.forbiddenRounds,[]);assert(out.ok);
      assert.equal(Object.keys(out.inventory).length,104);assert(Object.values(out.inventory).every(n=>n===4));
      assert(out.locked);assert(await page.locator('#maxBankerSixWin').isEnabled());
      console.log('  莊6贏 '+out.count+'／上限 '+cap);
    });
    await check('最後調整改出禁用的補第三張莊6時，即使未超過104上限也拒絕輸出並保留舊牌',async()=>{
      const before=await page.evaluate(()=>JSON.stringify(currentRounds.map(r=>r.cards.map(c=>[c.rank,c.suit,c.back_color]))));
      const faces=await page.locator('#roundsBody [data-action="card"]').allTextContents();
      await setLimit(page,104);
      await page.evaluate(()=>{
        window.__sixOriginalColor=runAutoColorSwap_Signal;window.__sixOriginalCheck=checkBankerSixWinLimit;
        runAutoColorSwap_Signal=function(rounds){
          const out=window.__sixOriginalColor(rounds),target=out.find(r=>r.cards.length===6);
          if(!target)throw new Error('注入測試需要6張局');
          // Swap existing cards, preserving the complete inventory. The final
          // check must reject the candidate even after earlier checks passed.
          for(const [i,point] of [0,0,0,0,0,6].entries()) {
            const all=out.flatMap(r=>r.cards.map((c,j)=>({r,j,c})));
            const src=all.find(x=>x.c.point()===point&&(x.r!==target||x.j>=i));
            [target.cards[i],src.r.cards[src.j]]=[src.c,target.cards[i]];
          }
          window.__sixInjected=true;return out;
        };
        checkBankerSixWinLimit=function(rounds,limit){
          const result=window.__sixOriginalCheck(rounds,limit);
          if(window.__sixInjected&&!result.ok&&rounds===currentRounds){
            window.__sixRejected=true;
            window.__sixRejectedBelowCap=result.okCount;
            window.__sixFacesAtRejection=[...document.querySelectorAll('#roundsBody [data-action="card"]')].map(e=>e.textContent);
            exportRoundsAsExcelWithDrive().then(v=>{window.__sixPendingExport=v;});
            window.__stopGenerateRequested=true;
          }
          return result;
        };
      });
      await page.locator('#chipGen').click();
      await page.waitForFunction(()=>window.__sixRejected&&!window.__isGeneratingShoe,{},{timeout:120000});
      assert.equal(await page.evaluate(()=>JSON.stringify(currentRounds.map(r=>r.cards.map(c=>[c.rank,c.suit,c.back_color])))),before);
      assert.deepEqual(await page.evaluate(()=>window.__sixFacesAtRejection),faces);
      assert.deepEqual(await page.locator('#roundsBody [data-action="card"]').allTextContents(),faces);
      assert.equal(await page.evaluate(()=>window.__sixPendingExport),false);
      assert.equal(await page.evaluate(()=>window.__sixRejectedBelowCap),true);
      assert(await page.locator('#maxBankerSixWin').isEnabled());
    });
    assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:checks.length,pageErrors:errors}));
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
