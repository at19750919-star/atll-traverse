// Browser integration checks. All cloud traffic is intercepted; nothing is uploaded.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const ROOT = path.resolve(__dirname,'..');
function dependency(name) {
  for(const base of [process.env.CODEX_NODE_MODULES, path.join(process.env.USERPROFILE||'', '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'), path.resolve(ROOT,'../百家3.0/node_modules')].filter(Boolean)) {
    try{return require(path.join(base,name));}catch(_){}
  }
  return require(name);
}
const { chromium } = dependency('playwright');
const ExcelJS = dependency('exceljs');
const checks=[];
async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'};
const server=http.createServer((req,res)=>{
  const target=path.resolve(ROOT,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));
  if(!target.startsWith(ROOT+path.sep)||!fs.existsSync(target)||fs.statSync(target).isDirectory()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream'});res.end(fs.readFileSync(target));
});
const signature=()=>JSON.stringify(currentRounds?.flatMap(r=>r.cards.map(c=>[c.rank,c.suit,c.back_color])));
async function inventory(page){
  const counts=await page.evaluate(()=>{const m={};for(const c of currentRounds.flatMap(r=>r.cards)){const key=c.rank+c.suit+c.back_color;m[key]=(m[key]||0)+1;}return m;});
  assert.equal(Object.keys(counts).length,104);assert(Object.values(counts).every(n=>n===4));
}
async function toolGroup(page,key){
  await page.locator('#dashboardToolsTab').click();
  const group=page.locator(`[data-group="${key}"]`);
  if(!await group.evaluate(el=>el.open))await group.locator('summary').click();
}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});
    const errors=[],missing=[],posts=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('response',r=>{if(r.url().startsWith('http://127.0.0.1')&&r.status()>=400)missing.push(r.url());});
    page.on('dialog',d=>d.accept());
    await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
    await page.route('https://script.google.com/**',route=>{
      const req=route.request();if(req.method()==='POST')posts.push(JSON.parse(req.postData()));
      const url=req.url();
      let files=[{name:'F635.xlsx'}];
      if(url.includes('1inVTulKpwiiggGp8TyIeWmFmpH6QG0gb')) files=[{name:'F635.xlsx'}];
      else if(url.includes('17RvOVNDc0a_JEem1SnRPsTEvm8otkJdx')) files=[{name:'TR007.xlsx'}];
      return route.fulfill({json:req.method()==='POST'?{success:true,fileName:posts.at(-1).filename}:{success:true,files}});
    });
    const dist=path.resolve(ROOT,'../百家3.0/node_modules/exceljs/dist/exceljs.min.js');
    if(fs.existsSync(dist))await page.route('https://cdn.jsdelivr.net/npm/exceljs@*/dist/exceljs.min.js',r=>r.fulfill({path:dist,contentType:'text/javascript'}));
    await page.addInitScript(()=>{window.showDirectoryPicker=undefined;});
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
    await page.waitForFunction(()=>!!window.IntegratedModes);
    assert.match(page.url(),/integrated\.html$/);assert.equal(await page.locator('iframe').count(),0);
    let standard, before, after;
    await check('百家3.0 使用原生成器產出完整416張牌庫',async()=>{
      await page.evaluate(()=>{document.getElementById('maxTieLimit').value='';document.getElementById('maxSideLimit').value='';document.getElementById('skipBanker6').checked=false;document.getElementById('lastCardNine').checked=false;});
      await page.locator('#chipGen').click();await page.waitForFunction(()=>!window.__isGeneratingShoe&&currentRounds?.length>0,{},{timeout:60000});
      await inventory(page);standard=await page.evaluate(signature);
      assert(await page.locator('#traverseControls').isHidden());
    });
    await check('百家3.0 導出改為F系列雲端資料夾並從F636開始',async()=>{
      const download=page.waitForEvent('download');await page.evaluate(()=>document.getElementById('btnExportCombined').click());
      const file=await download;assert.match(file.suggestedFilename(),/^F636\.xlsx$/);
      const wb=new ExcelJS.Workbook();await wb.xlsx.readFile(await file.path());assert(wb.getWorksheet('直立式牌靴'));
      await page.waitForFunction(()=>!IntegratedModes.busy);
      assert(posts.some(p=>p.filename==='F636.xlsx'&&p.folderId==='1inVTulKpwiiggGp8TyIeWmFmpH6QG0gb'));
    });
    await check('穿越示範共用同一牌表，預設訊號與94個安全點保持',async()=>{
      await page.locator('#modeTraverse').click();assert(await page.locator('#traverseControls').isVisible());
      assert(await page.locator('#traverseTools').isHidden());
      assert(await page.locator('#btnTraverseData').isVisible());
      await page.locator('#btnTraverseData').click();
      assert(await page.locator('#traverseTools').isVisible());
      await page.locator('#btnCloseTraverseData').click();
      await toolGroup(page,'demo');
      await page.locator('#tvDemo').click();await page.waitForFunction(()=>!IntegratedModes.busy&&!!IntegratedModes.traversal.result);
      await inventory(page);before=await page.evaluate(signature);
      assert.equal(await page.evaluate(()=>IntegratedModes.traversal.analysis.count),94);
      assert(await page.locator('#btnAutoReorder').isHidden());
      assert.equal(await page.locator('#roundsBody tr').count(),84);
    });
    await check('模式切換保留兩副不同牌靴，訊號使用同一份設定',async()=>{
      await page.locator('#modeRed0').click();assert.equal(await page.evaluate(signature),standard);
      assert(await page.locator('#btnTraverseData').isHidden());
      await page.locator('#modeTraverse').click();assert.equal(await page.evaluate(signature),before);
      assert(await page.locator('#btnTraverseData').isVisible());
      await page.locator('#dashboardSettingsTab').click();
      await page.locator('#sharedSignalSettings').click();assert(await page.locator('#pSet').isVisible());
      await page.locator('#sharedSignalSettings').click();
    });
    await check('局內優化、可拖曳比較與前後牌表切換',async()=>{
      await toolGroup(page,'edit');
      await page.locator('#tvOptimize').click();await page.waitForFunction(()=>!IntegratedModes.busy,{},{timeout:60000});
      assert(await page.locator('#optimizerPanel').isVisible());
      assert((await page.evaluate(()=>IntegratedModes.traversal.analysis.count))>94);
      after=await page.evaluate(signature);await page.locator('#btnOptBefore').click();assert.equal(await page.evaluate(signature),before);
      await page.locator('#btnOptAfter').click();assert.equal(await page.evaluate(signature),after);
      await page.locator('#btnOptClose').click();assert(await page.locator('#optimizerPanel').isHidden());
      await page.locator('#btnOptOpen').click();assert(await page.locator('#optimizerPanel').isVisible());await page.locator('#btnOptClose').click();
    });
    await check('切牌、卡色保留牌面與完整紅藍牌庫，所有416切點仍一致',async()=>{
      await page.evaluate(()=>IntegratedModes.cutTraverse(36));
      const faces=await page.evaluate(()=>currentRounds.flatMap(r=>r.cards.map(c=>c.rank+c.suit)));
      const safe=await page.evaluate(()=>IntegratedModes.traversal.analysis.safe);
      await page.evaluate(()=>IntegratedModes.recolor());await inventory(page);
      assert.deepEqual(await page.evaluate(()=>currentRounds.flatMap(r=>r.cards.map(c=>c.rank+c.suit))),faces);
      assert.deepEqual(await page.evaluate(()=>IntegratedModes.traversal.analysis.safe),safe);
      assert.equal(await page.evaluate(()=>calculateViolationStats(currentRounds).cardColorViolations),0);
    });
    await check('穿越導出依目前切牌序，TR編號與穿越牌資料夾獨立',async()=>{
      const faces=await page.evaluate(()=>currentRounds.flatMap(r=>r.cards.map(c=>(c.rank==='10'?'T':c.rank)+c.suit)));
      const download=page.waitForEvent('download');await page.evaluate(()=>document.getElementById('btnExportCombined').click());
      const file=await download;assert.equal(file.suggestedFilename(),'TR008.xlsx');
      const wb=new ExcelJS.Workbook();await wb.xlsx.readFile(await file.path());
      const sheet=wb.getWorksheet('直立式牌靴');assert(sheet);assert.equal(sheet.rowCount,416);
      for(let i=0;i<416;i++)assert.equal(sheet.getCell(i+1,2).value,faces[i]);
      await page.waitForFunction(()=>!IntegratedModes.busy);
      assert(posts.some(p=>p.filename==='TR008.xlsx'&&p.folderId==='17RvOVNDc0a_JEem1SnRPsTEvm8otkJdx'));
    });
    await check('手機與桌面模式選項可操作，無整頁水平溢出',async()=>{
      for(const width of [390,1440]){
        await page.setViewportSize({width,height:900});
        await page.locator('#dashboardSettingsTab').click();
        await page.evaluate(()=>window.scrollTo(0,0));
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${width}`);
        await page.locator('#sharedSignalSettings').click();assert(await page.locator('#pSet').isVisible());
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`signal overflow ${width}`);
        await page.locator('#sharedSignalSettings').click();
      }
    });
    await check('清空穿越牌不清掉百家3.0牌靴',async()=>{
      const unchanged=await page.evaluate(signature);
      await toolGroup(page,'edit');await page.locator('#btnSwap').click();
      await page.locator('[data-action="card"][data-r="0"][data-c="0"]').click();
      await page.locator('[data-action="card"][data-r="0"][data-c="1"]').click();
      await page.locator('#btnSwap').click();await inventory(page);
      assert.notEqual(await page.evaluate(signature),unchanged);
      assert(await page.locator('#btnOptOpen').isDisabled());
      await page.evaluate(()=>document.getElementById('clearBtn').click());assert.equal(await page.evaluate(()=>IntegratedModes.traversal.result),null);
      await page.locator('#modeRed0').click();assert.equal(await page.evaluate(signature),standard);await inventory(page);
    });
    await check('共用訊號選紅0，穿越實際生成依紅心方塊10/J/Q/K判定',async()=>{
      await page.locator('#modeTraverse').click();await page.locator('#dashboardSettingsTab').click();await page.locator('#sharedSignalSettings').click();
      await page.locator('[data-q="red0"]').click();await page.locator('#sharedSignalSettings').click();
      await page.evaluate(()=>{if(document.getElementById('traverseControls').classList.contains('collapsed'))document.getElementById('tvSettingsToggle').click();});await page.locator('#tvLeft').fill('');await page.locator('#tvSideLimit').fill('');await page.locator('#tvNine').uncheck();
      await page.locator('#chipGen').click();await page.waitForFunction(()=>!IntegratedModes.busy&&!!IntegratedModes.traversal.result);
      await inventory(page);
      assert.deepEqual(await page.evaluate(()=>IntegratedModes.traversal.result.signalConfig),{suits:['♥','♦'],ranks:['10','J','Q','K']});
      assert(await page.evaluate(()=>[...document.querySelectorAll('#roundsBody .s-signal-card')].every(c=>/^[TJQK][♥♦]$/.test(c.textContent))));
      await page.locator('#modeRed0').click();assert.equal(await page.evaluate(signature),standard);
      assert.deepEqual(await page.evaluate(()=>({suits:SIGNAL_CONFIG.suits,ranks:SIGNAL_CONFIG.ranks})),{suits:['♥','♦'],ranks:['10','J','Q','K']});
      await page.locator('#modeTraverse').click();
    });
    await check('穿越停止籌碼可中止重跑，進行中不允許切模式',async()=>{
      await page.evaluate(()=>{if(document.getElementById('traverseControls').classList.contains('collapsed'))document.getElementById('tvSettingsToggle').click();});await page.locator('#tvLeft').fill('0');await page.locator('#tvMin').fill('4');await page.locator('#tvMax').fill('4');
      await page.evaluate(()=>{document.getElementById('chipGen').click();IntegratedModes.switchMode('standard');document.getElementById('chipStop').click();});
      await page.waitForFunction(()=>!IntegratedModes.busy,{},{timeout:30000});
      assert.equal(await page.evaluate(()=>IntegratedModes.mode),'traverse');
      assert.match(await page.locator('#tvProgress').textContent(),/已停止/);await inventory(page);
    });
    assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
    console.log(JSON.stringify({passed:checks.length,pageErrors:errors,missingAssets:missing,cloudPostsIntercepted:posts.map(p=>({filename:p.filename,folderId:p.folderId||'原預設'}))}));
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
