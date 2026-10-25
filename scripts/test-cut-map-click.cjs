// 安全切點圖：一般模式點格依目前牌表張號切牌（可連續累加），穿越模式在寬畫面內嵌於統計區、與一般模式同一排版
const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const ROOT=path.resolve(process.env.ATLL_ROOT||path.join(__dirname,'..')),SHOT=process.env.SHOT_DIR;
(async()=>{const browser=await chromium.launch();try{const p=await browser.newPage({viewport:{width:2560,height:1080}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('https://**',r=>r.request().url().includes('exceljs')?r.continue():r.fulfill({body:''}));
 await p.goto(pathToFileURL(path.join(ROOT,'integrated.html')).href);await p.waitForFunction(()=>!!window.IntegratedModes);
 await p.evaluate(()=>document.getElementById('modeRed0').click());await p.evaluate(()=>document.getElementById('chipGen').click());
 await p.waitForFunction(()=>!window.__isGeneratingShoe&&document.querySelectorAll('#roundsBody tr[data-r]').length>50,null,{timeout:300000});await p.waitForTimeout(500);
 const deck=()=>p.evaluate(()=>currentRounds.flatMap(r=>r.cards.map(c=>c.rank+c.suit+c.back_color)).join(' '));
 const start=await deck(),cards=start.split(' ');
 // 第一次點第 38 格：牌表應從原第 38 張開始
 const cell=async i=>{await p.locator(`#tvSafeCuts [data-std-cut="${i}"]`).click();await p.waitForTimeout(400);};
 assert.equal(await p.locator('#tvSafeCuts button[data-std-cut]').count(),416,'一般模式 416 格都可點');
 await cell(37);let now=(await deck()).split(' ');assert.deepEqual(now.slice(0,20),cards.slice(37,57),'第一次切牌位置不對');
 // 再點第 101 格（目前牌表張號）：應從原第 38+100 張開始
 await cell(100);now=(await deck()).split(' ');assert.deepEqual(now.slice(0,20),cards.slice(137,157),'連續切牌位置不對');
 assert.equal(await p.inputValue('#cutPos'),'137');
 console.log('PASS 一般模式點格切牌：依目前牌表張號、可連續累加，切牌欄同步為 137');
 if(SHOT)await p.screenshot({path:path.join(SHOT,'cut-standard.png'),clip:{x:0,y:60,width:2560,height:260}});
 // 穿越：寬畫面內嵌，摘要與長段驗證只在分析明細視窗
 await p.evaluate(()=>document.getElementById('modeTraverse').click());await p.evaluate(()=>IntegratedModes.generateTraverse(true));
 await p.waitForFunction(()=>!IntegratedModes.busy&&document.querySelectorAll('#roundsBody tr[data-r]').length>50,null,{timeout:300000});await p.waitForTimeout(500);
 const layout=await p.evaluate(()=>{const v=s=>{const e=document.querySelector(s);return !!e&&!!(e.offsetWidth||e.offsetHeight);};return {slot:v('.dashboard-traverse-slot'),map:v('#tvSafeCuts'),summary:v('#tvSummary'),diag:v('#tvDiagnostics'),dialog:!document.getElementById('traverseDataDialog').hidden};});
 assert.deepEqual(layout,{slot:true,map:true,summary:false,diag:false,dialog:false},'穿越內嵌排版不符');
 if(SHOT)await p.screenshot({path:path.join(SHOT,'cut-traverse.png'),clip:{x:0,y:60,width:2560,height:260}});
 await p.click('#btnTraverseData');await p.waitForTimeout(300);
 const open=await p.evaluate(()=>({dialog:!document.getElementById('traverseDataDialog').hidden,summary:!!document.querySelector('#traverseDataDialog #tvSummary:not([hidden])')}));
 assert.deepEqual(open,{dialog:true,summary:true},'分析明細視窗未顯示穿越摘要');
 await p.click('#btnCloseTraverseData');await p.waitForTimeout(300);
 assert.equal(await p.evaluate(()=>!!document.querySelector('.dashboard-traverse-slot #tvSafeCuts')),true,'關閉視窗後未回到內嵌');
 console.log('PASS 穿越模式寬畫面內嵌與一般模式同排版；分析明細另開視窗看摘要與長段驗證，關閉後回內嵌');
 assert.deepEqual(errors,[]);console.log('PASS 無頁面錯誤');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
