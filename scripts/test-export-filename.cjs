const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const names=require('../standard/export_filename.js');
assert.equal(names.normalize(' 測試牌靴 '),'測試牌靴.xlsx');
assert.equal(names.normalize('測試.XLSX'),'測試.xlsx');
assert.equal(names.normalize('  '),null);
for(const bad of ['../test','a/b','a\\b','a:b','a*','a?','a|','a<','a>','a"','CON','LPT1.txt','test.','.xlsx','a\x01','a'.repeat(151)])assert.throws(()=>names.normalize(bad),bad);
assert.throws(()=>names.resolve([{name:'test.xlsx'}],'TEST'));
assert.equal(names.resolve([],'test'),'test.xlsx');
assert.equal(names.resolve([{name:'A2-001.xlsx'},{name:'A2-020.xlsx'},{name:'A2-009.xlsx'}],'A2-001'),'A2-021.xlsx');
assert.equal(names.resolve([{name:'A2-010.xlsx'},{name:'B2-999.xlsx'}],'A2-100'),'A2-100.xlsx');
assert.equal(names.resolve([{name:'a2-002.XLSX'}],'A2-001'),'A2-003.xlsx');
assert.equal(names.nextName('A2-009.xlsx'),'A2-010.xlsx');
assert.equal(names.nextName('A2-999.xlsx'),'A2-1000.xlsx');
assert.equal(names.nextName('牌靴.xlsx'),null);
assert.equal(names.nextName('A2-99999999999999999999.xlsx'),'A2-100000000000000000000.xlsx');
const longInput={value:'9'.repeat(150),setCustomValidity(message){this.error=message;}};
global.document={getElementById:()=>longInput};assert.doesNotThrow(()=>names.advance(longInput.value+'.xlsx'));assert(longInput.error);delete global.document;

console.log('PASS 檔名正規化、中文、副檔名、空白、無效字元與同名檢查');
const ROOT=path.resolve(__dirname,'..');
function dependency(name){for(const base of [process.env.CODEX_NODE_MODULES,path.join(process.env.USERPROFILE||'','.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'),path.resolve(ROOT,'../百家3.0/node_modules')].filter(Boolean)){try{return require(path.join(base,name));}catch{}}return require(name);}
const {chromium}=dependency('playwright'),ExcelJS=dependency('exceljs');
const server=http.createServer((req,res)=>{const p=path.resolve(ROOT,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));if(!p.startsWith(ROOT+path.sep)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[path.extname(p)]||'application/octet-stream');res.end(fs.readFileSync(p));});
(async()=>{
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    const browser=await chromium.launch({channel:'chrome',headless:true});
    try{
        const page=await browser.newPage({viewport:{width:1791,height:1000},acceptDownloads:true});
        const errors=[],posts=[],stored=[],downloads=[];let failListing=false,failUpload=false;
        page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());page.on('download',d=>downloads.push(d));
        await page.addInitScript(()=>{window.showDirectoryPicker=undefined;});
        await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
        const dist=path.resolve(ROOT,'../百家3.0/node_modules/exceljs/dist/exceljs.min.js');
        if(fs.existsSync(dist))await page.route('https://cdn.jsdelivr.net/npm/exceljs@*/dist/exceljs.min.js',r=>r.fulfill({path:dist,contentType:'text/javascript'}));
        await page.route('https://script.google.com/**',route=>{
            const req=route.request(),tr=req.url().includes('17RvOVNDc0a_JEem1SnRPsTEvm8otkJdx');
            if(failListing&&req.method()!=='POST')return route.fulfill({status:503,json:{success:false,message:'test listing failure'}});
            if(req.method()==='POST'){const data=JSON.parse(req.postData());posts.push(data);if(failUpload)return route.fulfill({json:{success:false,message:'test upload failure'}});stored.push(data);}
            const files=[{name:tr?'TR007.xlsx':'F635.xlsx'},...stored.filter(p=>p.folderId===(tr?'17RvOVNDc0a_JEem1SnRPsTEvm8otkJdx':'1inVTulKpwiiggGp8TyIeWmFmpH6QG0gb')).map(p=>({name:p.filename}))];
            return route.fulfill({json:req.method()==='POST'?{success:true,fileName:posts.at(-1).filename}:{success:true,files}});
        });
        await page.goto(`http://127.0.0.1:${server.address().port}/integrated.html`);await page.waitForFunction(()=>!!window.IntegratedModes);
        async function openFiles(){await page.locator('#dashboardToolsTab').click();const group=page.locator('[data-group="files"]');if(!await group.evaluate(e=>e.open))await group.locator('summary').click();}
        const input=page.locator('#exportFilename');await openFiles();
        assert(await input.isVisible());assert.equal(await input.inputValue(),'');
        const modes=[['modeRed0','紅0牌靴'],['modeA2','A2牌靴.xlsx'],['modeTraverse','穿越紅0牌靴'],['modeTraverseA2','穿越A2牌靴']];
        for(const [mode,value] of modes){await page.locator('#'+mode).click();await input.fill(value);}
        await page.reload();await page.waitForFunction(()=>!!window.IntegratedModes);await openFiles();
        for(const [mode,value] of modes){await page.locator('#'+mode).click();assert.equal(await input.inputValue(),value);}
        for(const width of [2560,1791,1024,390]){await page.setViewportSize({width,height:1000});assert(await input.isVisible());assert(await input.evaluate(e=>e.getBoundingClientRect().right<=e.parentElement.getBoundingClientRect().right+1));}
        await page.setViewportSize({width:1791,height:1000});
        if(process.env.FILENAME_SCREENSHOT)await page.locator('[data-group="files"]').screenshot({path:process.env.FILENAME_SCREENSHOT});
        console.log('PASS 四模式各自保存與重載、欄位可見、四種寬度');
        await page.locator('#modeRed0').click();
        await page.evaluate(()=>{
            for(const id of ['avgRecoveryLimit','maxTieLimit','maxSideLimit','maxFourCardRate','max7PtReversal','swapBanker6Target'])document.getElementById(id).value='';
            document.getElementById('maxTwoThirteenReversal').value='0';
            for(const id of ['skipBanker6','skipPlayer7Banker6','lastCardNine'])document.getElementById(id).checked=false;
        });
        await page.locator('#chipGen').click();await page.waitForFunction(()=>!window.__isGeneratingShoe&&currentRounds?.length>0,{},{timeout:120000});
        await page.evaluate(()=>{window.__filenameShoe=cloneRoundsDeep(currentRounds);});
        async function exported(wanted,folder){
            const event=page.waitForEvent('download');await page.evaluate(()=>document.getElementById('btnExportCombined').click());
            const file=await event;assert.equal(file.suggestedFilename(),wanted);
            await page.waitForFunction(()=>!IntegratedModes.busy);
            assert(posts.some(p=>p.filename===wanted&&p.folderId===folder));
            const book=new ExcelJS.Workbook();await book.xlsx.readFile(await file.path());assert(book.getWorksheet('直立式牌靴'));
        }
        for(const [mode,value] of modes){
            await page.locator('#'+mode).click();
            const tr=mode.startsWith('modeTraverse');
            if(tr){await page.evaluate(()=>document.getElementById('tvDemo').click());await page.waitForFunction(()=>!IntegratedModes.busy&&!!IntegratedModes.traversal.result);}
            else await page.evaluate(()=>{currentRounds=cloneRoundsDeep(window.__filenameShoe);refreshAnalysisAndRender({mutate:false,skipVerify:true});});
            await exported(names.normalize(value),tr?'17RvOVNDc0a_JEem1SnRPsTEvm8otkJdx':'1inVTulKpwiiggGp8TyIeWmFmpH6QG0gb');
        }
        console.log('PASS 四模式實際Excel下載與雲端同名、目的資料夾不變、工作表可讀（上傳攔截）');
        const postCount=posts.length,downloadCount=downloads.length;
        await page.evaluate(()=>document.getElementById('btnExportCombined').click());
        await page.waitForFunction(()=>!IntegratedModes.busy&&document.getElementById('tvProgress').textContent.includes('同名檔案'));
        assert.equal(posts.length,postCount);assert.equal(downloads.length,downloadCount);
        await input.fill('../bad');await page.evaluate(()=>document.getElementById('btnExportCombined').click());
        assert.equal(posts.length,postCount);assert.equal(downloads.length,downloadCount);
        await input.fill('');await exported('TR008.xlsx','17RvOVNDc0a_JEem1SnRPsTEvm8otkJdx');
        await page.locator('#modeRed0').click();await input.fill('');await exported('F636.xlsx','1inVTulKpwiiggGp8TyIeWmFmpH6QG0gb');
        const beforeDuplicate={posts:posts.length,downloads:downloads.length};
        await input.fill('紅0牌靴');await page.evaluate(()=>document.getElementById('btnExportCombined').click());
        await page.waitForFunction(()=>!IntegratedModes.busy&&document.getElementById('logArea').textContent.includes('同名檔案'));
        assert.equal(posts.length,beforeDuplicate.posts);assert.equal(downloads.length,beforeDuplicate.downloads);
        await page.locator('#modeTraverseA2').click();await input.fill('本機重名');
        await page.evaluate(()=>{
            window.__oldFilenameDbOpen=indexedDB.open;
            // 目錄控制完全使用記憶體物件，測試不開選擇視窗、不寫真實檔案或IndexedDB。
            indexedDB.open=()=>{throw new Error('test: no persistent handle');};
            window.__filenameWrites=0;
            window.showDirectoryPicker=async()=>({name:'測試資料夾',getFileHandle:async()=>({createWritable:async()=>{window.__filenameWrites++;return {write:async()=>{},close:async()=>{}};}})});
        });
        const beforeLocal={posts:posts.length,downloads:downloads.length};
        await page.evaluate(()=>document.getElementById('btnExportCombined').click());
        await page.waitForFunction(()=>!IntegratedModes.busy&&document.getElementById('tvProgress').textContent.includes('資料夾已有同名'));
        assert.equal(await page.evaluate(()=>window.__filenameWrites),0);assert.equal(posts.length,beforeLocal.posts);assert.equal(downloads.length,beforeLocal.downloads);
        await input.fill('本機新檔');
        await page.evaluate(()=>{
            window.showDirectoryPicker=async()=>({name:'測試資料夾',getFileHandle:async(name,options)=>{
                if(!options?.create)throw new DOMException('not found','NotFoundError');
                window.__localExportName=name;
                return {createWritable:async()=>{window.__filenameWrites++;return {write:async blob=>{if(window.__failFilenameWrite)throw new Error('test write failure');window.__localExportSize=blob.size;},close:async()=>{}};}};
            }});
            document.getElementById('btnExportCombined').click();
        });
        await page.waitForFunction(()=>!IntegratedModes.busy&&document.getElementById('tvProgress').textContent.includes('皆已存好'));
        assert.equal(await page.evaluate(()=>window.__localExportName),'本機新檔.xlsx');
        assert.equal(await page.evaluate(()=>window.__filenameWrites),1);assert((await page.evaluate(()=>window.__localExportSize))>0);
        assert(posts.some(p=>p.filename==='本機新檔.xlsx'));

        await input.fill('本機-001');
        await page.evaluate(()=>{window.__failFilenameWrite=true;document.getElementById('btnExportCombined').click();});
        await page.waitForFunction(()=>!IntegratedModes.busy&&document.getElementById('tvProgress').textContent.includes('test write failure'));
        assert.equal(await input.inputValue(),'本機-001');
        await page.evaluate(()=>{window.__failFilenameWrite=false;});
        await input.fill('本機-001');
        await page.evaluate(()=>{
            window.showDirectoryPicker=async()=>({name:'測試資料夾',getFileHandle:async(name,options)=>{
                if(!options?.create){if(name==='本機-001.xlsx'||name==='本機-002.xlsx')return {};throw new DOMException('not found','NotFoundError');}
                window.__localExportName=name;
                return {createWritable:async()=>({write:async()=>{},close:async()=>{}})};
            }});
            document.getElementById('btnExportCombined').click();
        });
        await page.waitForFunction(()=>!IntegratedModes.busy&&document.getElementById('tvProgress').textContent.includes('皆已存好'));
        assert.equal(await page.evaluate(()=>window.__localExportName),'本機-003.xlsx');
        assert.equal(await input.inputValue(),'本機-004');
        assert(posts.some(p=>p.filename==='本機-003.xlsx'));
        await page.evaluate(()=>{indexedDB.open=window.__oldFilenameDbOpen;window.showDirectoryPicker=undefined;});
        for(const [index,[mode]] of modes.entries()){
            await page.locator('#'+mode).click();await input.fill('A2-001');
            const start=index%2===0?1:3;
            const folder=index<2?'1inVTulKpwiiggGp8TyIeWmFmpH6QG0gb':'17RvOVNDc0a_JEem1SnRPsTEvm8otkJdx';
            for(let n=start;n<start+2;n++){
                await exported(`A2-${String(n).padStart(3,'0')}.xlsx`,folder);
                assert.equal(await input.inputValue(),`A2-${String(n+1).padStart(3,'0')}`);
            }
        }
        await page.locator('#modeRed0').click();
        const failedCounts={posts:posts.length,downloads:downloads.length};
        failListing=true;
        await page.evaluate(()=>document.getElementById('btnExportCombined').click());
        await page.waitForFunction(()=>!IntegratedModes.busy);
        assert.equal(await input.inputValue(),'A2-003');assert.equal(posts.length,failedCounts.posts);assert.equal(downloads.length,failedCounts.downloads);
        failListing=false;
        failUpload=true;await input.fill('上傳失敗-001');
        await exported('上傳失敗-001.xlsx','1inVTulKpwiiggGp8TyIeWmFmpH6QG0gb');
        assert.equal(await input.inputValue(),'上傳失敗-002');
        failUpload=false;await input.fill('A2-003');
        await page.reload();await page.waitForFunction(()=>!!window.IntegratedModes);await openFiles();
        for(const [index,[mode]] of modes.entries()){
            await page.locator('#'+mode).click();
            assert.equal(await input.inputValue(),index%2===0?'A2-003':'A2-005');
        }
        if(process.env.FILENAME_SCREENSHOT)await page.locator('[data-group="files"]').screenshot({path:process.env.FILENAME_SCREENSHOT});
        console.log('PASS 四模式連續兩次導出自動001→002；雲端同前綴接續、補零、重載保存；本機重名跳號／寫入失敗不跳號；雲端清單失敗不跳號；本機已存好時雲端上傳失敗仍接續');

        assert.deepEqual(errors,[]);
        console.log('PASS 同名／無效檔名不下載或上傳，清空恢復F／TR自動編號，本機目錄同名不覆蓋（記憶體模擬），無JS錯誤');
    }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
