const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
require('../standard/two_thirteen_reversals.js');require('../traverse_builder.js');require('../traverse_export.js');require('../traverse_limits.js');
const B=global.TraverseBuilder,L=global.TraverseLimits,R=global.TwoThirteenReversals,ROOT=path.resolve(__dirname,'..');
const card=(p,i)=>({rank:p===0?'K':p===1?'A':String(p),suit:'♠',point:p,back_color:i%2?'R':'B'});
const limits={bankerSix:null,seven:null,rare:null},policy={tripleTie:false,signalRule:false,signalConfig:{suits:[],ranks:[]},strong:false,secondStart:false,skipBanker6:false,skipPlayer7:false};
Object.assign(B.rules,policy);
function shoe(){const cards=Array.from({length:30},(_,i)=>i===0||i===5?[7,5,7,0,2]:[7,3,9,7,0]).flat().map(card);return {cards,chains:[{start:1,length:cards.length}]};}
function dependency(name){for(const base of [process.env.CODEX_NODE_MODULES,path.join(process.env.USERPROFILE||'','.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'),path.resolve(ROOT,'../百家3.0/node_modules')].filter(Boolean)){try{return require(path.join(base,name));}catch(_){}}return require(name);}
const {chromium}=require('playwright');
const server=http.createServer((req,res)=>{const p=path.resolve(ROOT,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));if(!p.startsWith(ROOT+path.sep)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[path.extname(p)]||'application/octet-stream');res.end(fs.readFileSync(p));});
(async()=>{
  const source=shoe(),refs=source.cards.slice();assert(L.chainsValid(source,policy));
  const repaired=await L.repairSpacing(source,{limits,policy,shouldStop:()=>false});
  assert(repaired.ok);assert(repaired.swaps.length);assert(L.check(repaired.result,limits).ok);assert(L.chainsValid(repaired.result,policy));
  assert(source.cards.every((c,i)=>c===refs[i]));assert(repaired.result.cards.every(c=>refs.includes(c)));
  const before=global.TraverseExport.dealRounds(source.cards),after=global.TraverseExport.dealRounds(repaired.result.cards);
  assert(after.every((r,i)=>r.result===before[i].result&&r.cards.length===before[i].cards.length));
  const wrapped={cards:source.cards.slice(50).concat(source.cards.slice(0,50)),chains:[{start:101,length:150}]};
  assert(L.chainsValid(wrapped,policy));
  const wrappedRepair=await L.repairSpacing(wrapped,{limits,policy});
  assert(wrappedRepair.ok);assert(L.chainsValid(wrappedRepair.result,policy));assert(L.check(wrappedRepair.result,limits).ok);
  const original=B.qualifiesFinal;B.qualifiesFinal=()=>false;
  try{assert(!(await L.repairSpacing(source,{limits,policy,maxValidations:2})).ok);}finally{B.qualifiesFinal=original;}
  assert(!(await L.repairSpacing(source,{limits,policy,shouldStop:()=>true})).ok);
  assert.deepEqual(L.check(source,{...limits,rare:0}).counts.rare,2);
  console.log('PASS 真實敏感穿越長段整局交換達成>20局、結果／牌庫保留；長段拒絕或停止時不修改原牌');
  const built=await B.build({tripleTie:false,signalRule:false,idleLimit:15,computeTries:250,chainAttempts:2,specialLimits:{bankerSix:0,seven:0,rare:0}});
  assert.equal(built.cards.length,416);assert.deepEqual(built.stats.specialPicked,{bankerSix:0,seven:0,rare:0});
  console.log('PASS 撿段與補排以三種0上限控制計數');
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const context=await browser.newContext({viewport:{width:1791,height:900}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));await page.route('https://script.google.com/**',r=>r.abort());
    const dist=path.resolve(ROOT,'../百家3.0/node_modules/exceljs/dist/exceljs.min.js');if(fs.existsSync(dist))await page.route('https://cdn.jsdelivr.net/npm/exceljs@*/dist/exceljs.min.js',r=>r.fulfill({path:dist,contentType:'text/javascript'}));
    await page.goto(`http://127.0.0.1:${server.address().port}/integrated.html`);await page.waitForFunction(()=>!!window.IntegratedModes);
    const ids=['tvBankerSixMax','tvSevenReversalMax','tvRareReversalMax'];
    async function fill(values){for(let i=0;i<ids.length;i++){await page.locator('#'+ids[i]).fill(values[i]);await page.locator('#'+ids[i]).dispatchEvent('change');}}
    await page.locator('#modeTraverse').click();assert.equal(await page.locator('#tvB6').count(),0);
    assert.deepEqual(await page.evaluate(a=>a.map(id=>document.getElementById(id).value),ids),['','2','']);
    await fill(['0','0','0']);await page.locator('#modeTraverseA2').click();
    assert.deepEqual(await page.evaluate(a=>a.map(id=>document.getElementById(id).value),ids),['','2','']);
    await fill(['3','4','2']);await page.locator('#modeTraverse').click();assert.deepEqual(await page.evaluate(a=>a.map(id=>document.getElementById(id).value),ids),['0','0','0']);
    await page.reload();await page.waitForFunction(()=>!!window.IntegratedModes);await page.locator('#modeTraverse').click();
    assert.deepEqual(await page.evaluate(a=>a.map(id=>document.getElementById(id).value),ids),['0','0','0']);
    await page.locator('#tvRareReversalMax').fill('1');await page.reload();await page.waitForFunction(()=>!!window.IntegratedModes);await page.locator('#modeTraverse').click();
    assert.equal(await page.locator('#tvRareReversalMax').inputValue(),'1','輸入未離開欄位也要立即保存');
    await fill(['0','0','0']);
    await page.locator('#modeRed0').click();assert.equal(await page.locator('#maxBankerSixWin').inputValue(),'');
    await page.locator('#modeTraverseA2').click();
    await page.evaluate(()=>{const p=JSON.parse(localStorage.getItem('integrated-traverse-a2'));delete p.tvBankerSixMax;delete p.tvSevenReversalMax;delete p.tvRareReversalMax;p.tvB6=true;localStorage.setItem('integrated-traverse-a2',JSON.stringify(p));});
    await page.reload();await page.waitForFunction(()=>!!window.IntegratedModes);await page.locator('#modeTraverseA2').click();
    assert.deepEqual(await page.evaluate(a=>a.map(id=>document.getElementById(id).value),ids),['','2','']);
    for(const [id,value] of [[ids[0],'-1'],[ids[1],'1.5'],[ids[2],'105']]){await fill(['','','']);await page.locator('#'+id).fill(value);await page.locator('#chipGen').click();assert.equal(await page.evaluate(()=>IntegratedModes.busy),false);assert.match(await page.locator('#tvProgress').textContent(),/整數/);}
    await fill(['2','2','1']);for(const width of [2560,1791,1024,390]){await page.setViewportSize({width,height:900});for(const id of ids){assert(await page.locator('#'+id).isVisible());assert(await page.locator('#'+id).evaluate(e=>e.getBoundingClientRect().right<=e.parentElement.getBoundingClientRect().right+1));}}
    await page.setViewportSize({width:1791,height:900});if(process.env.TRAVERSE_LIMITS_SCREENSHOT)await page.locator('#traverseControls').screenshot({path:process.env.TRAVERSE_LIMITS_SCREENSHOT});
    console.log('PASS 三欄兩模式各自保存／重載、0／留白、舊tvB6忽略、非法值與四種寬度');
    const mismatch=await page.evaluate(()=>{
      let seed=123,out=0;for(let n=0;n<1500;n++){
        const ps=Array.from({length:6},()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%10;});
        const h=TraverseBuilder.simulateHand(ps,0,6),used=ps.slice(0,h.size),cards=used.map((p,i)=>new Card(p===0?'K':p===1?'A':String(p),'♠',i));
        const c=TraverseBuilder.specialRoundCounts(used),round={cards,result:h.result};
        if(c.bankerSix!==Number(isBankerSixWinRound(round))||c.seven!==count7PtReversals([round]).count||c.rare!==TwoThirteenReversals.count([round])||c.drawSix!==Number(hasBankerSixDrawWin(round)))out++;
      }return out;
    });assert.equal(mismatch,0);console.log('PASS 1500種完整牌局與非穿越判定一致');
    for(const mode of ['modeTraverse','modeTraverseA2']){
      await page.locator('#'+mode).click();await fill(['2','2','1']);
      await page.evaluate(()=>{document.getElementById('tvTailFill').checked=true;for(const id of ['tvLeft','tvSideLimit','tvTieMax'])document.getElementById(id).value='';document.getElementById('tvNine').checked=false;window.__traverseLimitLocked=false;new MutationObserver(()=>{if(document.getElementById('tvBankerSixMax').disabled)window.__traverseLimitLocked=true;}).observe(document.getElementById('tvBankerSixMax'),{attributes:true,attributeFilter:['disabled']});});
      if(mode==='modeTraverseA2')await page.evaluate(()=>{document.getElementById('tvNine').checked=true;});
      await page.locator('#chipGen').click();await page.waitForFunction(()=>!IntegratedModes.busy&&!!IntegratedModes.traversal.result,{},{timeout:120000}).catch(async e=>{console.log(await page.locator('#tvProgress').textContent());throw e;});
      const actual=await page.evaluate(()=>{
        const result=IntegratedModes.traversal.result,inventory={};for(const c of result.cards){const k=c.rank+c.suit+c.back_color;inventory[k]=(inventory[k]||0)+1;}
        return {...TraverseLimits.check(result,{bankerSix:2,seven:2,rare:1,enforceSpacing:IntegratedModes.tsub!=='a2'}),cards:result.cards.length,inventory,locked:window.__traverseLimitLocked,lastRank:result.cards.at(-1).rank,status:document.getElementById('tvProgress').textContent};
      });assert(actual.ok,JSON.stringify(actual));assert.equal(actual.cards,416);assert.equal(Object.keys(actual.inventory).length,104);assert(Object.values(actual.inventory).every(n=>n===4));assert(actual.locked);
      if(actual.status.includes('末張 9 已套用'))assert.equal(actual.lastRank,'9');
      console.log('PASS '+mode+'實際生成416張，三種上限及該模式間隔政策符合、完整牌庫與鎖定保留');
    }
    await page.locator('#modeTraverse').click(); // 間隔無解停止政策僅驗穿越紅0。
    const before=await page.evaluate(()=>JSON.stringify(IntegratedModes.traversal.result));
    const faces=await page.locator('#roundsBody [data-action="card"]').allTextContents();
    await fill(['','','']);
    await page.evaluate(()=>{
      const originalBuild=TraverseBuilder.build,originalCheck=TraverseLimits.check;
      const fixture=JSON.parse(JSON.stringify(IntegratedModes.traversal.result));
      window.__limitBuilds=0;TraverseBuilder.build=async function(){window.__limitBuilds++;return JSON.parse(JSON.stringify(fixture));};
      TraverseLimits.check=function(result,limits){const out=originalCheck(result,limits);return {...out,ok:false,okCount:true,okSpacing:false,reason:'注入間隔不足'};};
      TraverseLimits.repairSpacing=async()=>({ok:false,reason:'注入穿越驗證拒絕'});
    });
    await page.locator('#chipGen').click();await page.waitForFunction(()=>!IntegratedModes.busy&&document.getElementById('tvProgress').textContent.includes('不整副重跑'),{},{timeout:120000});
    assert.equal(await page.evaluate(()=>window.__limitBuilds),1);assert.equal(await page.evaluate(()=>JSON.stringify(IntegratedModes.traversal.result)),before);assert.deepEqual(await page.locator('#roundsBody [data-action="card"]').allTextContents(),faces);
    assert.deepEqual(errors,[]);console.log('PASS 間隔交換無解不整副重跑，保留前次牌靴與主表，無JS錯誤');
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
