const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const policy=require('../card_color_rules.js'),ROOT=path.resolve(__dirname,'..');
const rngFor=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
assert.deepEqual(policy.patterns(false),['BBBR','RRRB']);
assert.deepEqual(policy.patterns(true),['BBBR','RRRB','BBRR','RRBB']);
assert.deepEqual(policy.violations(['BBBR','RRRB','BBBR','RRRB'],true),[4]);
assert.deepEqual(policy.violations(['BBRR','RRBB','BBRR','RRBB','BBRR'],true),[4,5]);
assert.deepEqual(policy.violations(['BBBR','RRRB','BBBR','RRBB','BBRR','RRBB','BBBR'],true),[]);
assert.deepEqual(policy.violations(Array(10).fill('BBBR'),false),[]);
assert.deepEqual(policy.violations(['BBRR','BRBR'],false),[1,2]);
for(let seed=1;seed<=100;seed++){
  const starts=Array.from({length:80},(_,i)=>i*4),groups=Array(320).fill(0),limits={R:[160],B:[160]};
  const need=policy.plan(starts,groups,limits,320,{mixed:true,rng:rngFor(seed)});
  assert(need);assert.equal(need.filter(c=>c==='R').length,160);
  assert.deepEqual(policy.violations(starts.map(st=>need.slice(st,st+4).join('')),true),[]);
}
const impossible={R:[0],B:[8]};
assert.equal(policy.plan([0,4],Array(8).fill(0),impossible,8,{mixed:true,attempts:2,steps:5,rng:rngFor(1)}),null);
assert.deepEqual(impossible,{R:[0],B:[8]});
console.log('PASS 兩組最多3局、交錯牌型仍合併計數、關閉相容、100種種子與無解保留輸入');
function dependency(name){for(const base of [process.env.CODEX_NODE_MODULES,path.join(process.env.USERPROFILE||'','.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'),path.resolve(ROOT,'../百家3.0/node_modules')].filter(Boolean)){try{return require(path.join(base,name));}catch(_){}}return require(name);}
const {chromium}=dependency('playwright');
const ExcelJS=dependency('exceljs');
const server=http.createServer((req,res)=>{
  const file=path.resolve(ROOT,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));
  if(!file.startsWith(ROOT+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}
  const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'};
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(fs.readFileSync(file));
});
async function toolGroup(page,name){await page.locator('#dashboardToolsTab').click();const g=page.locator(`[data-group="${name}"]`);if(!await g.evaluate(e=>e.open))await g.locator('summary').click();}
async function inspect(page){return page.evaluate(()=>{
  const inventory={};currentRounds.flatMap(r=>r.cards).forEach(c=>{const k=c.rank+c.suit+c.back_color;inventory[k]=(inventory[k]||0)+1;});
  const traverse=IntegratedModes.mode==='traverse';
  const full=traverse?TraverseExport.dealRounds(currentRounds.flatMap(r=>r.cards.map(c=>({rank:c.rank,suit:c.suit,point:c.point(),back_color:c.back_color})))).filter(r=>r.hand):currentRounds.filter(r=>r.cards.length>=4);
  const patterns=full.map(r=>r.cards.slice(0,4).map(c=>c.back_color).join(''));
  return {patterns,violations:traverse?calculateViolationStats(currentRounds).cardColorRounds:collectCardColorViolationRounds(currentRounds),faces:currentRounds.map(r=>r.cards.map(c=>c.rank+c.suit)),inventory};
});}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const context=await browser.newContext({viewport:{width:1791,height:900}}),page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('dialog',d=>d.accept());
    await page.addInitScript(()=>{window.showDirectoryPicker=undefined;});
    await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
    await page.route('https://script.google.com/**',r=>r.abort());
    const dist=path.resolve(ROOT,'../百家3.0/node_modules/exceljs/dist/exceljs.min.js');
    if(fs.existsSync(dist))await page.route('https://cdn.jsdelivr.net/npm/exceljs@*/dist/exceljs.min.js',r=>r.fulfill({path:dist,contentType:'text/javascript'}));
    await page.addInitScript(()=>localStorage.setItem('card_color_mixed_mode','1'));
    await page.goto(`http://127.0.0.1:${server.address().port}/integrated.html`);await page.waitForFunction(()=>!!window.IntegratedModes);
    for(const [mode,field] of [['modeRed0','mixedCardColor'],['modeA2','mixedCardColor'],['modeTraverse','tvMixedColor'],['modeTraverseA2','tvMixedColor']]){
      await page.locator('#'+mode).click();await page.locator('#dashboardSettingsTab').click();
      assert.equal(await page.locator('#'+field).isChecked(),false);
      await page.locator(`label:has(#${field})`).click();assert.equal(await page.evaluate(()=>CARD_COLOR_MIXED_MODE),true);
    }
    await page.reload();await page.waitForFunction(()=>!!window.IntegratedModes);
    for(const [mode,field] of [['modeRed0','mixedCardColor'],['modeA2','mixedCardColor'],['modeTraverse','tvMixedColor'],['modeTraverseA2','tvMixedColor']]){
      await page.locator('#'+mode).click();assert(await page.locator('#'+field).isChecked());
    }
    await page.locator('label:has(#tvMixedColor)').click();await page.locator('#modeTraverse').click();assert(await page.locator('#tvMixedColor').isChecked());
    await page.locator('#modeTraverseA2').click();assert.equal(await page.locator('#tvMixedColor').isChecked(),false);await page.locator('label:has(#tvMixedColor)').click();
    console.log('PASS 四模式預設關閉、開關獨立保存／重載、舊共用值不啟動混色');
    for(const [mode,field] of [['modeRed0','mixedCardColor'],['modeA2','mixedCardColor'],['modeTraverse','tvMixedColor'],['modeTraverseA2','tvMixedColor']]){
      await page.locator('#'+mode).click();await page.locator('#dashboardSettingsTab').click();
      await page.evaluate(id=>{
        window.__mixedWasLocked=false;
        new MutationObserver(()=>{if(document.getElementById(id).disabled)window.__mixedWasLocked=true;})
          .observe(document.getElementById(id),{attributes:true,attributeFilter:['disabled']});
      },field);
      if(mode==='modeRed0'||mode==='modeA2'){
        await page.evaluate(()=>{
          for(const id of ['avgRecoveryLimit','maxTieLimit','maxSideLimit','maxFourCardRate','max7PtReversal','swapBanker6Target','maxBankerSixWin'])document.getElementById(id).value='';
          document.getElementById('maxTwoThirteenReversal').value='0';
          for(const id of ['skipBanker6','skipPlayer7Banker6','lastCardNine','tripleTieRule'])document.getElementById(id).checked=false;
        });
        await page.locator('#chipGen').click();
      }else if(mode==='modeTraverse'){
        await page.locator('#tvLeft').fill('');await page.locator('#tvSideLimit').fill('');await page.locator('#tvTieMax').fill('');
        await page.locator('#chipGen').click();
      }else{await toolGroup(page,'demo');await page.locator('#tvDemo').click();}
      await page.waitForFunction(()=>!window.__isGeneratingShoe&&!IntegratedModes.busy&&currentRounds?.length>60,{},{timeout:120000});
      const before=await inspect(page);assert.deepEqual(before.violations,[],mode+' generated '+JSON.stringify(before.patterns));
      assert.equal(await page.evaluate(()=>window.__mixedWasLocked),true,'mixed toggle must be locked during generation');
      assert(before.patterns.some(p=>p==='BBRR'||p==='RRBB'));assert(before.patterns.some(p=>p==='BBBR'||p==='RRRB'));
      assert.equal(Object.keys(before.inventory).length,104);assert(Object.values(before.inventory).every(n=>n===4));
      await toolGroup(page,'edit');await page.locator('#btnAutoColor').click();
      const after=await inspect(page);assert.deepEqual(after.faces,before.faces);assert.deepEqual(after.inventory,before.inventory);assert.deepEqual(after.violations,[]);
      if(mode==='modeTraverseA2'){
        await page.locator('#dashboardSettingsTab').click();
        if(process.env.MIXED_COLOR_SCREENSHOT)await page.locator('#traverseControls').screenshot({path:process.env.MIXED_COLOR_SCREENSHOT});
        await toolGroup(page,'analysis');await page.locator('#tvOptimize').click();
        await page.waitForFunction(()=>!IntegratedModes.busy,{},{timeout:120000});
        assert.deepEqual((await inspect(page)).violations,[],'optimizer must preserve or restore mixed color runs');
      }
      const exportState=await page.evaluate(()=>({colors:currentRounds.flatMap(r=>r.cards.map(c=>c.back_color)),sizes:IntegratedModes.mode==='traverse'?TraverseExport.dealRounds(currentRounds.flatMap(r=>r.cards.map(c=>({point:c.point()})))).filter(r=>r.hand).map(r=>r.cards.length):currentRounds.map(r=>r.cards.length)}));
      const downloaded=page.waitForEvent('download');await toolGroup(page,'files');await page.locator('#btnExportCombined').click();
      const file=await downloaded,book=new ExcelJS.Workbook();await book.xlsx.readFile(await file.path());
      const sheet=book.getWorksheet('直立式牌靴');assert(sheet);assert.equal(sheet.rowCount,416);
      const excelColors=Array.from({length:416},(_,i)=>sheet.getCell(i+1,2).fill.fgColor.argb==='FFFFFF00'?'R':'B');
      assert.deepEqual(excelColors,exportState.colors);
      let offset=0;const exportedPatterns=exportState.sizes.filter(n=>n>=4).map(n=>{const p=excelColors.slice(offset,offset+4).join('');offset+=n;return p;});
      assert.deepEqual(policy.violations(exportedPatterns,true),[]);
      await page.waitForFunction(()=>!IntegratedModes.busy);
      console.log('PASS '+mode+'完整牌庫生成／末張9後混色有效，卡色保留牌面與104種牌庫');
      // Turning off only changes the rule; old mixed rows are now violations.
      await page.locator('#dashboardSettingsTab').click();await page.locator(`label:has(#${field})`).click();
      assert((await inspect(page)).violations.length>0);
      await toolGroup(page,'edit');await page.locator('#btnAutoColor').click();
      assert((await inspect(page)).patterns.every(p=>p==='BBBR'||p==='RRRB'));
      assert.deepEqual((await inspect(page)).violations,[]);
    }
    console.log('PASS 四模式關閉後只認BBBR／RRRB，手動重新卡色可恢復');
    // Cross-pattern alternation must not reset the group run counter.
    await page.locator('#modeA2').click();await page.locator('#dashboardSettingsTab').click();await page.locator('label:has(#mixedCardColor)').click();
    const result=await page.evaluate(()=>{
      const make=p=>({cards:[...p].map(back_color=>({back_color}))});
      return collectCardColorViolationRounds(['BBBR','RRRB','BBBR','RRRB','BBRR','RRBB','BBRR','RRBB'].map(make));
    });assert.deepEqual(result,[4,8]);
    await page.evaluate(()=>{
      const before=JSON.stringify(currentRounds),originalPlan=CardColorRules.plan,originalLegacy=runAutoColorSwap_Legacy;
      CardColorRules.plan=()=>null;runAutoColorSwap_Legacy=()=>{throw new Error('混色失敗不應改走可能破壞同組間隔的舊換牌');};
      try{runAutoColorSwap_Signal(currentRounds);assertUnchanged();}
      finally{CardColorRules.plan=originalPlan;runAutoColorSwap_Legacy=originalLegacy;}
      function assertUnchanged(){if(JSON.stringify(currentRounds)!==before)throw new Error('混色配置無解時改動了原牌');}
    });
    await page.locator('#modeTraverseA2').click();await page.locator('#dashboardSettingsTab').click();await page.locator('label:has(#tvMixedColor)').click();
    const traverseBad=await page.evaluate(()=>{
      const rounds=currentRounds.map(r=>({...r,cards:r.cards.map(c=>c.clone())}));
      ['BBBR','RRRB','BBBR','RRRB','BBRR','RRBB','BBRR','RRBB'].forEach((p,i)=>[...p].forEach((c,k)=>{rounds[i].cards[k].back_color=c;}));
      return calculateViolationStats(rounds).cardColorRounds;
    });assert(traverseBad.includes(4)&&traverseBad.includes(8));
    assert.deepEqual(errors,[]);console.log('PASS 實際違規檢查合併同組計數，無JS錯誤');
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
