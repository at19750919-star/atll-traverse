const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const names=require('../standard/export_filename.js');
assert.equal(names.normalize(' 測試牌靴 '),'測試牌靴.xlsx');assert.equal(names.normalize('測試.XLSX'),'測試.xlsx');assert.equal(names.normalize('  '),null);
for(const bad of ['../test','a/b','a\\b','a:b','a*','a?','a|','a<','a>','a"','CON','LPT1.txt','test.','.xlsx','a\x01','a'.repeat(151)])assert.throws(()=>names.normalize(bad),bad);
assert.equal(names.nextName('A2-009.xlsx'),'A2-010.xlsx');assert.equal(names.nextName('A2-999.xlsx'),'A2-1000.xlsx');
assert.equal(names.nextName('A2-99999999999999999999.xlsx'),'A2-100000000000000000000.xlsx');
const memory=new Map();global.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
assert.equal(names.localName('701','F636.xlsx'),'701.xlsx');names.advance('701.xlsx');assert.equal(names.localName('701','F636.xlsx'),'702.xlsx');
assert.equal(names.localName('900','F636.xlsx'),'900.xlsx');names.advance('固定.xlsx');assert.throws(()=>names.localName('固定','F636.xlsx'));
assert.equal(names.localName(null,'F636.xlsx','700'),'F701.xlsx');names.advance('F701.xlsx');assert.equal(names.localName(null,'F636.xlsx'),'F702.xlsx');
delete global.localStorage;
console.log('PASS 檔名與補零驗證、本機成功紀錄、重名接續、原本機F計數遷移，無須雲端');
const ROOT=path.resolve(__dirname,'..');
function dependency(name){for(const base of [process.env.CODEX_NODE_MODULES,path.join(process.env.USERPROFILE||'','.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'),path.resolve(ROOT,'../百家3.0/node_modules')].filter(Boolean)){try{return require(path.join(base,name));}catch{}}return require(name);}
const {chromium}=dependency('playwright'),ExcelJS=dependency('exceljs');
const server=http.createServer((req,res)=>{const p=path.resolve(ROOT,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));if(!p.startsWith(ROOT+path.sep)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[path.extname(p)]||'application/octet-stream');res.end(fs.readFileSync(p));});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1791,height:1000},acceptDownloads:true}),errors=[],cloud=[],downloads=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());page.on('download',d=>downloads.push(d));
  await page.addInitScript(()=>{window.showDirectoryPicker=undefined;});
  await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
  const dist=path.resolve(ROOT,'../百家3.0/node_modules/exceljs/dist/exceljs.min.js');if(fs.existsSync(dist))await page.route('https://cdn.jsdelivr.net/npm/exceljs@*/dist/exceljs.min.js',r=>r.fulfill({path:dist,contentType:'text/javascript'}));
  // 雲端完全不可用；任何GET或POST都是本次驗收失敗，不能以假清單掩蓋相依。
  await page.route('https://script.google.com/**',r=>{cloud.push(r.request().method());return r.abort();});
  await page.goto(`http://127.0.0.1:${server.address().port}/integrated.html`);await page.waitForFunction(()=>!!window.IntegratedModes);
  async function openFiles(){await page.locator('#dashboardToolsTab').click();const g=page.locator('[data-group="files"]');if(!await g.evaluate(e=>e.open))await g.locator('summary').click();}
  const input=page.locator('#exportFilename');await openFiles();
  const modes=[['modeRed0','701'],['modeA2','A2-001'],['modeTraverse','紅0-001'],['modeTraverseA2','穿越A2-001']];
  for(const [mode,value] of modes){await page.locator('#'+mode).click();await input.fill(value);}
  await page.reload();await page.waitForFunction(()=>!!window.IntegratedModes);await openFiles();
  for(const [mode,value] of modes){await page.locator('#'+mode).click();assert.equal(await input.inputValue(),value);}
  for(const width of [2560,1791,1024,390]){await page.setViewportSize({width,height:1000});assert(await input.isVisible());assert(await input.evaluate(e=>e.getBoundingClientRect().right<=e.parentElement.getBoundingClientRect().right+1));}
  await page.setViewportSize({width:1791,height:1000});
  await page.locator('#modeRed0').click();await page.evaluate(()=>{
   for(const id of ['avgRecoveryLimit','maxTieLimit','maxSideLimit','maxFourCardRate','max7PtReversal','swapBanker6Target'])document.getElementById(id).value='';
   document.getElementById('maxTwoThirteenReversal').value='0';for(const id of ['skipBanker6','skipPlayer7Banker6','lastCardNine'])document.getElementById(id).checked=false;
  });
  await page.locator('#chipGen').click();await page.waitForFunction(()=>!window.__isGeneratingShoe&&currentRounds?.length>0,{},{timeout:120000});
  await page.evaluate(()=>{window.__filenameShoe=cloneRoundsDeep(currentRounds);});
  async function exported(wanted){
   const event=page.waitForEvent('download',{timeout:10000});await page.evaluate(()=>document.getElementById('btnExportCombined').click());
   const file=await event;assert.equal(file.suggestedFilename(),wanted);await page.waitForFunction(()=>!IntegratedModes.busy,{},{timeout:2000});
   assert(await page.locator('#btnExportCombined').isEnabled());assert.equal(await page.locator('#btnExportCombined').textContent(),'導出');
   const book=new ExcelJS.Workbook();await book.xlsx.readFile(await file.path());assert(book.getWorksheet('直立式牌靴'));
  }
  for(const [mode,value] of modes){
   await page.locator('#'+mode).click();
   if(mode.startsWith('modeTraverse')){await page.evaluate(()=>document.getElementById('tvDemo').click());await page.waitForFunction(()=>!IntegratedModes.busy&&!!IntegratedModes.traversal.result);}
   else await page.evaluate(()=>{currentRounds=cloneRoundsDeep(window.__filenameShoe);refreshAnalysisAndRender({mutate:false,skipVerify:true});});
   let name=names.normalize(value);
   for(let i=0;i<3;i++){await exported(name);name=names.nextName(name);assert.equal(await input.inputValue(),name.slice(0,-5));}
  }
  assert.deepEqual(cloud,[]);console.log('PASS 雲端完全中斷時，四模式各連續3次實際導出；701→702→703；每次解除鎖定，Excel可讀且雲端GET／POST均0');
  await input.fill('固定檔名');await exported('固定檔名.xlsx');const count=downloads.length;
  await page.evaluate(()=>document.getElementById('btnExportCombined').click());await page.waitForFunction(()=>!IntegratedModes.busy&&document.getElementById('tvProgress').textContent.includes('同名'));
  assert.equal(downloads.length,count);await input.fill('../bad');await page.evaluate(()=>document.getElementById('btnExportCombined').click());assert.equal(downloads.length,count);
  await page.locator('#modeRed0').click();await input.fill('');await page.evaluate(()=>localStorage.setItem('at-export-counter','700'));await exported('F701.xlsx');await exported('F702.xlsx');
  await page.locator('#modeA2').click();await input.fill('');await exported('F703.xlsx');
  await page.locator('#modeTraverseA2').click();await input.fill('');await exported('TR001.xlsx');await exported('TR002.xlsx');
  await page.locator('#modeTraverse').click();await input.fill('');await exported('TR003.xlsx');
  console.log('PASS F／TR不讀雲端，接本機舊F計數／新成功紀錄；跨模式共享同前綴紀錄；留白保持自動編號');
  await input.fill('本機-001');await page.evaluate(()=>{
   window.__oldFilenameDbOpen=indexedDB.open;indexedDB.open=()=>{throw new Error('test no persistent handle');};window.__filenameWrites=0;
   window.showDirectoryPicker=async()=>({name:'測試資料夾',getFileHandle:async(name,options)=>{
    if(!options?.create){if(name==='本機-001.xlsx'||name==='本機-002.xlsx')return {};throw new DOMException('not found','NotFoundError');}
    window.__localExportName=name;return {createWritable:async()=>({write:async()=>{if(window.__failFilenameWrite)throw new Error('test write failure');window.__filenameWrites++;},close:async()=>{}})};
   }});
   document.getElementById('btnExportCombined').click();
  });
  await page.waitForFunction(()=>!IntegratedModes.busy&&document.getElementById('tvProgress').textContent.includes('已導出本機'));
  assert.equal(await page.evaluate(()=>window.__localExportName),'本機-003.xlsx');assert.equal(await input.inputValue(),'本機-004');
  await input.fill('失敗-001');await page.evaluate(()=>{window.__failFilenameWrite=true;document.getElementById('btnExportCombined').click();});
  await page.waitForFunction(()=>!IntegratedModes.busy&&document.getElementById('tvProgress').textContent.includes('test write failure'));assert.equal(await input.inputValue(),'失敗-001');assert(await page.locator('#btnExportCombined').isEnabled());
  await page.evaluate(()=>{window.__failFilenameWrite=false;document.getElementById('btnExportCombined').click();});
  await page.waitForFunction(()=>!IntegratedModes.busy&&document.getElementById('tvProgress').textContent.includes('已導出本機'));assert.equal(await input.inputValue(),'失敗-002');
  await page.evaluate(()=>{indexedDB.open=window.__oldFilenameDbOpen;window.showDirectoryPicker=undefined;});
  const saved={};for(const [mode] of modes){await page.locator('#'+mode).click();saved[mode]=await input.inputValue();}
  const ledger=await page.evaluate(()=>localStorage.getItem('at-export-local-history-v1'));
  await page.reload();await page.waitForFunction(()=>!!window.IntegratedModes);await openFiles();
  for(const [mode] of modes){await page.locator('#'+mode).click();assert.equal(await input.inputValue(),saved[mode]);}
  assert.equal(await page.evaluate(()=>localStorage.getItem('at-export-local-history-v1')),ledger);
  assert.equal(await page.evaluate(()=>ExportFilename.localName(null,'F636.xlsx')),'F704.xlsx');assert.equal(await page.evaluate(()=>ExportFilename.localName('701','F636.xlsx')),'704.xlsx');
  if(process.env.FILENAME_SCREENSHOT)await page.locator('[data-group="files"]').screenshot({path:process.env.FILENAME_SCREENSHOT});
  assert.deepEqual(errors,[]);assert.deepEqual(cloud,[]);console.log('PASS 指定目錄跳過舊檔／不覆蓋，寫入失敗不跳號且可再按導出；下一號與成功紀錄重載保留，無JS錯誤');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
