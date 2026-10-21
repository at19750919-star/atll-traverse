// Real browser generation. Cloud requests are intercepted; no files are uploaded.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const ROOT = path.resolve(__dirname,'..');
const deps = process.env.CODEX_NODE_MODULES || path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
const { chromium } = require(path.join(deps,'playwright'));
const ids = [4,5,6].flatMap(n=>[`st${n}Min`,`st${n}Max`]);
const server = http.createServer((req,res)=>{
  const file=path.resolve(ROOT,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));
  if(!file.startsWith(ROOT+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png'})[path.extname(file)]||'application/octet-stream');
  res.end(fs.readFileSync(file));
});
const checks=[];
async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
async function values(page){return page.evaluate(ids=>Object.fromEntries(ids.map(id=>[id,document.getElementById(id).value])),ids);}
async function setValues(page,entries){for(const [id,value] of Object.entries(entries))await page.locator('#'+id).fill(String(value));}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1791,height:900}}),errors=[];
    let uploads=0,downloads=0;
    page.on('pageerror',e=>errors.push(e.message));
    page.on('download',()=>downloads++);
    await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
    await page.route('https://script.google.com/**',r=>{if(r.request().method()==='POST')uploads++;return r.fulfill({json:{success:true,files:[]}});});
    const dist=path.resolve(ROOT,'../百家3.0/node_modules/exceljs/dist/exceljs.min.js');
    if(fs.existsSync(dist))await page.route('https://cdn.jsdelivr.net/npm/exceljs@*/dist/exceljs.min.js',r=>r.fulfill({path:dist,contentType:'text/javascript'}));
    await page.goto(`http://127.0.0.1:${server.address().port}/integrated.html`);
    await page.waitForFunction(()=>!!window.IntegratedModes);
    await check('紅0與A2各有六個局數上下限，預設留白不限，且一般與穿越皆為4上4下、5上5下、6上6下排列',async()=>{
      for(const mode of ['modeRed0','modeA2']){
        await page.locator('#'+mode).click();
        assert.equal(await page.locator('#standardControls .size-limit-fields input').count(),6);
        assert.deepEqual(await page.locator('#standardControls .size-limit-fields input').evaluateAll(els=>els.map(e=>e.id)),['st4Max','st4Min','st5Max','st5Min','st6Max','st6Min']);
        const boxes=await page.locator('#standardControls .size-limit-fields label').evaluateAll(els=>els.map(e=>{const r=e.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y)};}));
        assert(boxes[0].y===boxes[1].y&&boxes[0].x<boxes[1].x);
        assert(boxes[2].y===boxes[3].y&&boxes[2].x<boxes[3].x&&boxes[2].y>boxes[0].y);
        assert(boxes[4].y===boxes[5].y&&boxes[4].x<boxes[5].x&&boxes[4].y>boxes[2].y);
        for(const id of ids){assert(await page.locator('#'+id).isVisible(),id);assert.equal(await page.locator('#'+id).inputValue(),'');}
      }
      await page.locator('#modeTraverse').click();
      assert.deepEqual(await page.locator('#traverseControls .size-limit-fields input').evaluateAll(els=>els.map(e=>e.id)),['tv4Max','tv4Min','tv5Max','tv5Min','tv6Max','tv6Min']);
      const tvBoxes=await page.locator('#traverseControls .size-limit-fields label').evaluateAll(els=>els.map(e=>{const r=e.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y)};}));
      assert(tvBoxes[0].y===tvBoxes[1].y&&tvBoxes[0].x<tvBoxes[1].x);
      assert(tvBoxes[2].y===tvBoxes[3].y&&tvBoxes[2].x<tvBoxes[3].x&&tvBoxes[2].y>tvBoxes[0].y);
      assert(tvBoxes[4].y===tvBoxes[5].y&&tvBoxes[4].x<tvBoxes[5].x&&tvBoxes[4].y>tvBoxes[2].y);
      await page.locator('#modeRed0').click();
      if(process.env.STANDARD_SIZE_SCREENSHOT)await page.locator('#standardControls .size-limit-fields').screenshot({path:process.env.STANDARD_SIZE_SCREENSHOT});
    });
    await check('兩個百家模式各自保存六欄，切穿越及重新載入也保留',async()=>{
      const red={st4Min:'12',st4Max:'34',st5Min:'20',st5Max:'',st6Min:'0',st6Max:'38'};
      const a2={st4Min:'1',st4Max:'30',st5Min:'0',st5Max:'45',st6Min:'8',st6Max:'39'};
      await page.locator('#modeRed0').click();await setValues(page,red);
      await page.locator('#modeA2').click();assert(Object.values(await values(page)).every(v=>v===''));await setValues(page,a2);
      await page.locator('#modeTraverse').click();await page.locator('#tv4Max').fill('22');
      await page.locator('#modeRed0').click();assert.deepEqual(await values(page),red);
      await page.locator('#modeA2').click();assert.deepEqual(await values(page),a2);
      await page.reload();await page.waitForFunction(()=>!!window.IntegratedModes);assert.deepEqual(await values(page),a2);
      await page.locator('#modeRed0').click();assert.deepEqual(await values(page),red);
      assert.equal(await page.locator('#maxFourCardRate').inputValue(),'30');
      await page.locator('#modeTraverse').click();assert.equal(await page.locator('#tv4Max').inputValue(),'22');
      await page.locator('#modeA2').click();
    });
    await check('六個邊界都檢查：留白不限、0有效、等於邊界可通過',async()=>{
      const result=await page.evaluate(()=>{
        const rounds=[4,5,5,6,6,6].map(n=>({cards:Array(n).fill({})}));
        const cases=[];
        for(const n of [4,5,6]){
          const count=n-3;
          cases.push(RoundSizeLimits.check(rounds,{[n]:{min:count,max:count}}).ok);
          cases.push(!RoundSizeLimits.check(rounds,{[n]:{min:count+1}}).ok);
          cases.push(!RoundSizeLimits.check(rounds,{[n]:{max:count-1}}).ok);
        }
        return {cases,empty:RoundSizeLimits.check(rounds,null).ok,zero:RoundSizeLimits.check(rounds,{4:{max:0}}).ok};
      });
      assert(result.cases.every(Boolean));assert.equal(result.empty,true);assert.equal(result.zero,false);
    });
    await check('無效上下限不啟動生成，錯誤欄位可修正',async()=>{
      await setValues(page,Object.fromEntries(ids.map(id=>[id,''])));
      for(const [input,value,upper] of [['st4Min','35','34'],['st5Min','-1',''],['st6Max','2.5',''],['st6Max','105','']]){
        await setValues(page,Object.fromEntries(ids.map(id=>[id,''])));
        if(upper)await page.locator('#st4Max').fill(upper);
        await page.locator('#'+input).fill(value);await page.locator('#chipGen').click();
        assert.equal(await page.evaluate(()=>!!window.__isGeneratingShoe),false);
        assert(await page.locator('#'+input).evaluate(e=>e.validationMessage.length>0));
        await page.locator('#'+input).fill('');
        assert(await page.locator('#'+input).evaluate(e=>e.validationMessage===''));
      }
    });
    await check('舊儲存設定缺少新欄位時，六欄仍為不限',async()=>{
      await page.evaluate(ids=>{const p=JSON.parse(localStorage.getItem('at-settings-a2'));ids.forEach(id=>delete p[id]);localStorage.setItem('at-settings-a2',JSON.stringify(p));},ids);
      await page.reload();await page.waitForFunction(()=>!!window.IntegratedModes);
      assert(Object.values(await values(page)).every(v=>v===''));
    });
    await check('實際挑局階段會遵守4／5／6張局的0上限',async()=>{
      const counts=await page.evaluate(()=>{
        const triple=document.getElementById('tripleTieRule'),saved=triple.checked,out=[];
        triple.checked=false;
        try{
          for(const n of [4,5,6]){
            for(const k of [4,5,6])for(const suffix of ['Min','Max'])document.getElementById(`st${k}${suffix}`).value='';
            document.getElementById(`st${n}Max`).value='0';
            const selected=pack_all_sensitive_and_segment(build_shuffled_deck()).a_rounds;
            out.push({n,counts:RoundSizeLimits.count(selected)});
          }
        }finally{triple.checked=saved;}
        return out;
      });
      for(const {n,counts:c} of counts){assert.equal(c[n],0);assert(Object.values(c).reduce((a,b)=>a+b,0)>0);}
    });
    for(const mode of ['modeRed0','modeA2'])await check(mode+' 實際生成416張牌，六個局數限制全部符合',async()=>{
      await page.locator('#'+mode).click();
      await setValues(page,{st4Min:15,st4Max:34,st5Min:20,st5Max:45,st6Min:15,st6Max:38});
      await page.evaluate(()=>{
        for(const id of ['avgRecoveryLimit','maxTieLimit','maxSideLimit','maxFourCardRate','max7PtReversal','swapBanker6Target'])document.getElementById(id).value='';
        // 隔離局數上下限測試；避免新間隔政策無安全交換時主動停止。
        document.getElementById('maxTwoThirteenReversal').value='0';
        for(const id of ['skipPlayer7Banker6','lastCardNine'])document.getElementById(id).checked=false;
      });
      if(mode==='modeA2')await page.evaluate(()=>{
        const original=runAutoColorSwap_Signal;
        window.__sizeColorCalls=0;
        runAutoColorSwap_Signal=function(rounds){
          const out=original(rounds);
          if(++window.__sizeColorCalls===1){
            const five=out.filter(r=>r.cards.length===5);
            for(let i=0;i+1<five.length;i+=2)five[i+1].cards.push(five[i].cards.pop());
          }
          return out;
        };
      });
      await page.evaluate(()=>{
        window.__sizeWasLocked=false;
        new MutationObserver(()=>{if(window.__isGeneratingShoe&&document.getElementById('st5Min').disabled)window.__sizeWasLocked=true;})
          .observe(document.documentElement,{subtree:true,attributes:true,attributeFilter:['disabled']});
      });
      await page.locator('#chipGen').click();
      await page.waitForFunction(()=>window.__isGeneratingShoe===true||currentRounds?.length>0,{},{timeout:5000}).catch(async error=>{
        console.log(await page.evaluate(()=>({settings:RoundSizeLimits.read(document),disabled:document.getElementById('generateBtn').disabled,recent:document.getElementById('logArea').textContent.slice(-1700)})));
        throw error;
      });
      await page.waitForFunction(()=>!window.__isGeneratingShoe&&currentRounds?.length>0,{},{timeout:120000}).catch(async error=>{
        console.log(await page.evaluate(()=>({attempt:document.getElementById('regenerateAttemptCount')?.textContent,recent:document.getElementById('logArea').textContent.slice(-1700)})));
        throw error;
      });
      const result=await page.evaluate(()=>{
        const counts={4:0,5:0,6:0},inventory={};
        currentRounds.forEach(r=>{if(counts[r.cards.length]!==undefined)counts[r.cards.length]++;r.cards.forEach(c=>{const key=c.rank+c.suit+c.back_color;inventory[key]=(inventory[key]||0)+1;});});
        return {counts,inventory,colorCalls:window.__sizeColorCalls||0,log:document.getElementById('logArea').textContent};
      });
      const c=result.counts;assert(c[4]>=15&&c[4]<=34&&c[5]>=20&&c[5]<=45&&c[6]>=15&&c[6]<=38,JSON.stringify(c));
      assert.equal(Object.keys(result.inventory).length,104);assert(Object.values(result.inventory).every(n=>n===4));
      if(mode==='modeA2')assert(result.colorCalls>=2,'最後調整改變張數分布後應重排，不可接受未達5張局下限的結果');
      assert.equal(await page.evaluate(()=>window.__sizeWasLocked),true);
      assert(await page.locator('#st5Min').isEnabled());
      console.log('  實際局數 '+JSON.stringify(c));
    });
    await check('最後調整不符限制後按停止，恢復上次已通過的牌靴且不外流到彈窗',async()=>{
      const before=await page.evaluate(()=>JSON.stringify(currentRounds.map(r=>r.cards.map(c=>[c.rank,c.suit,c.back_color]))));
      const beforeFaces=await page.locator('#roundsBody [data-action="card"]').allTextContents();
      const opened=page.waitForEvent('popup');await page.locator('#btnTableWindow').click();const popup=await opened;
      await popup.waitForSelector('#roundsBody tr');
      await popup.evaluate(faces=>{
        window.__pendingLeak=false;
        new MutationObserver(()=>{
          if(opener.__isGeneratingShoe&&JSON.stringify([...document.querySelectorAll('#roundsBody [data-action="card"]')].map(e=>e.textContent))!==JSON.stringify(faces))window.__pendingLeak=true;
        }).observe(document.querySelector('#roundsBody'),{subtree:true,childList:true});
      },beforeFaces);
      await page.evaluate(()=>{
        window.__sizeOriginalCheck=RoundSizeLimits.check;window.__sizeOriginalColor=runAutoColorSwap_Signal;
        window.__sizeRejected=false;window.__facesAtRejection=null;
        runAutoColorSwap_Signal=function(rounds){
          const out=window.__sizeOriginalColor(rounds),five=out.filter(r=>r.cards.length===5);
          for(let i=0;i+1<five.length;i+=2)five[i+1].cards.push(five[i].cards.pop());
          return out;
        };
        RoundSizeLimits.check=function(rounds,limits){
          const result=window.__sizeOriginalCheck(rounds,limits);
          if(!result.ok&&rounds===currentRounds&&!window.__sizeRejected){
            window.__sizeRejected=true;
            window.__facesAtRejection=[...document.querySelectorAll('#roundsBody [data-action="card"]')].map(e=>e.textContent);
            exportRoundsAsExcelWithDrive().then(value=>{window.__pendingExportResult=value;});
            document.getElementById('btnExportCombined').click();
            window.__pendingExportUiBusy=IntegratedModes.busy;
            setTimeout(()=>document.getElementById('chipStop').click(),0);
          }
          return result;
        };
      });
      await page.locator('#chipGen').click();
      await page.waitForFunction(()=>window.__sizeRejected&&!window.__isGeneratingShoe,{},{timeout:120000});
      assert(await page.evaluate(expected=>JSON.stringify(currentRounds.map(r=>r.cards.map(c=>[c.rank,c.suit,c.back_color])))===expected,before),'中止後應恢復上次完成的牌靴');
      assert(await page.evaluate(faces=>JSON.stringify(window.__facesAtRejection)===JSON.stringify(faces),beforeFaces),'未通過的候選牌靴不可先顯示');
      assert(JSON.stringify(await page.locator('#roundsBody [data-action="card"]').allTextContents())===JSON.stringify(beforeFaces),'主表應恢復上次完成的牌靴');
      assert.equal(await popup.evaluate(()=>window.__pendingLeak),false);
      assert.equal(await page.evaluate(()=>window.__pendingExportResult),false);
      assert.equal(await page.evaluate(()=>window.__pendingExportUiBusy),false);
      assert.equal(uploads,0);assert.equal(downloads,0);
      assert(await page.evaluate(()=>RoundSizeLimits.check(currentRounds,RoundSizeLimits.read(document).limits).ok));
      await page.evaluate(()=>{RoundSizeLimits.check=window.__sizeOriginalCheck;runAutoColorSwap_Signal=window.__sizeOriginalColor;});
      await popup.close();
    });
    await check('有局數限制時仍可停止重跑，原牌庫保留完整',async()=>{
      await setValues(page,{st4Min:0,st4Max:0,st5Min:0,st5Max:0,st6Min:0,st6Max:0});
      const colorCalls=await page.evaluate(()=>window.__sizeColorCalls);
      await page.locator('#chipGen').click();await page.waitForFunction(()=>!!window.__isGeneratingShoe);
      await page.locator('#chipStop').click();await page.waitForFunction(()=>!window.__isGeneratingShoe,{},{timeout:30000});
      assert.equal(await page.evaluate(()=>window.__sizeColorCalls),colorCalls);
      assert(await page.locator('#generateBtn').isEnabled());assert(await page.locator('#stopGenerateBtn').isDisabled());
      assert(await page.locator('#st5Min').isEnabled());
      assert.equal(await page.evaluate(()=>currentRounds.flatMap(r=>r.cards).length),416);
    });
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({passed:checks.length,pageErrors:errors}));
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
