const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const rules = require('../standard/two_thirteen_reversals.js');
const ROOT = path.resolve(__dirname, '..');
const rank = n => n === 0 ? 'K' : n === 1 ? 'A' : String(n);
const round = (p,b,t) => ({cards:[0,0,p,b,t].map(n=>({rank:rank(n)}))});
const expected = new Map([
    ['0,3',[8]], ['1,3',[8]], ['1,4',[8]], ['1,5',[8]], ['3,5',[3]], ['1,6',[8]], ['2,6',[5]],
    ['0,4',[8,9]], ['0,5',[8,9]], ['4,5',[2,3]], ['0,6',[8,9]], ['3,6',[4,5]],
    ...Array.from({length:6},(_,p)=>[`${p},7`,[8-p,9-p]]),
    ...Array.from({length:6},(_,b)=>[`7,${b}`,[8-b,9-b]])
]);
let hits = 0;
for(let p=0;p<=9;p++)for(let b=0;b<=9;b++)for(let t=0;t<=9;t++){
    const actual = Boolean(rules.classify(round(p,b,t)));
    const wanted = expected.get(`${p},${b}`)?.includes(t) || false;
    assert.equal(actual,wanted,`p=${p} b=${b} t=${t}`);
    if(actual)hits++;
}
assert.equal(hits,41); // 24種起始點數：7種1/13、17種2/13。
const win=round(3,6,5), lose=round(3,6,3), six=round(3,6,6);
six.cards.push({rank:'K'});
assert.equal(rules.classify(six),null);
assert.equal(rules.classify({...win,cards:win.cards.slice(0,4)}),null);
assert.equal(rules.classify(round(0,3,8)).numerator,1); // 1/13也納入
assert.equal(rules.classify(win).numerator,2);
assert.equal(rules.classify(round(4,6,3)),null); // 3/13
assert.equal(rules.count([win,lose,six]),1);
assert.equal(rules.check([win],0).ok,false);
assert.equal(rules.check([win],1).ok,true);
assert.equal(rules.check([win],null).ok,true);
for(const value of ['-1','1.5','abc'])assert(rules.read({getElementById:()=>({value})}).error);
const spaced=(next)=>{const rounds=Array.from({length:next},()=>({cards:[]}));rounds[0]=win;rounds[next-1]=round(1,6,8);return rounds;};
for(const next of [2,21,22])assert.equal(rules.check(spaced(next),null).ok,false,'第1與'+next+'局不可通過');
for(const next of [23,24])assert.equal(rules.check(spaced(next),null).ok,true,'第1與'+next+'局應通過');
assert.equal(rules.check(spaced(23),1).okCount,false);
assert.equal(rules.check(spaced(23),2).ok,true);
assert.equal(rules.check(spaced(22),2).okSpacing,false);
assert.equal(rules.check(spaced(22),null).spacingViolations[0].gap,20);
const triple=spaced(46);triple[22]=round(1,6,8);assert.equal(rules.check(triple,null).ok,true);
triple[43]=win;assert.equal(rules.check(triple,null).okSpacing,false);
console.log('PASS 1000種點數組合、納入1/13與2/13、排除3/13、上限及第22/23局間隔邊界');
let chromium;
for(const base of [process.env.CODEX_NODE_MODULES,path.join(process.env.USERPROFILE||'','.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'),path.resolve(ROOT,'../百家3.0/node_modules')].filter(Boolean)){
    try{({chromium}=require(path.join(base,'playwright')));break;}catch{}
}
const server=http.createServer((req,res)=>{
    const file=path.resolve(ROOT,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));
    if(!file.startsWith(ROOT+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[path.extname(file)]||'application/octet-stream');
    res.end(fs.readFileSync(file));
});
(async()=>{
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    const browser=await chromium.launch({channel:'chrome',headless:true});
    try{
        const context=await browser.newContext({viewport:{width:2560,height:1080}}),errors=[];
        context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
        await context.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/plain'}));
        const page=await context.newPage();
        await page.goto(`http://127.0.0.1:${server.address().port}/integrated.html`);
        await page.waitForFunction(()=>!!window.IntegratedModes);
        const input=page.locator('#maxTwoThirteenReversal');
        for(const mode of ['modeRed0','modeA2']){
            await page.locator('#'+mode).click();assert(await input.isVisible());assert.equal(await input.inputValue(),'');
        }
        await page.locator('#modeRed0').click();await input.fill('0');
        await page.locator('#modeA2').click();await input.fill('3');
        await page.locator('#modeRed0').click();assert.equal(await input.inputValue(),'0');
        await page.reload();await page.waitForFunction(()=>!!window.IntegratedModes);assert.equal(await input.inputValue(),'0');
        await page.locator('#modeA2').click();assert.equal(await input.inputValue(),'3');
        await input.fill('');await page.reload();await page.waitForFunction(()=>!!window.IntegratedModes);assert.equal(await input.inputValue(),'');
        await page.locator('#modeTraverse').click();assert.equal(await input.isVisible(),false);
        await page.locator('#modeRed0').click();
        for(const width of [2560,1791,1024,390]){
            await page.setViewportSize({width,height:1080});
            assert(await input.isVisible());
            assert(await input.evaluate(e=>e.parentElement.scrollWidth<=e.parentElement.clientWidth+1),'label fits '+width);
        }
        await page.setViewportSize({width:2560,height:1080});
        await input.fill('-1');await page.locator('#chipGen').click();assert.equal(await page.evaluate(()=>!!window.__isGeneratingShoe),false);
        await input.fill('0');
        await page.evaluate(()=>{
            const card=(n,i)=>new Card(n===0?'K':n===1?'A':String(n),'♠',i);
            currentRounds=[[0,0,3,6,5],[0,0,0,3,8],[0,0,4,6,3]].map((a,i)=>makeRoundInfo(i*5,a.map((n,j)=>card(n,i*5+j)), '閒',true));
            currentAnalysis=null;renderRoundsTable(currentRounds,null);
        });
        assert.equal(await page.locator('#roundsBody .two-thirteen-reversal').count(),2);
        assert.equal(await page.locator('#roundsBody tr:first-child td.result-cell').evaluate(e=>getComputedStyle(e,'::after').content),'none'); // 逆轉只亮整行底色，不再顯示機率文字
        assert.equal(await page.locator('#roundsBody tr:nth-child(2) td.result-cell').evaluate(e=>getComputedStyle(e,'::after').content),'none'); // 逆轉只亮整行底色，不再顯示機率文字
        if(process.env.REVERSAL_TABLE_SCREENSHOT)await page.locator('#roundsTable').screenshot({path:process.env.REVERSAL_TABLE_SCREENSHOT});
        const popupEvent=page.waitForEvent('popup');await page.locator('#btnTableWindow').click();const popup=await popupEvent;
        await popup.waitForSelector('.two-thirteen-reversal');
        assert.equal(await popup.locator('.two-thirteen-reversal').count(),2);
        assert.equal(await popup.locator('.two-thirteen-reversal td.result-cell').first().evaluate(e=>getComputedStyle(e,'::after').content),'none'); // 逆轉只亮整行底色，不再顯示機率文字
        await popup.close();
        if(process.env.REVERSAL_SCREENSHOT)await page.locator('#standardControls').screenshot({path:process.env.REVERSAL_SCREENSHOT});
        console.log('PASS 欄位、兩模式保存、0/留白重載、四種寬度、無效輸入、主表與獨立視窗高亮');
        await page.evaluate(()=>{
            document.getElementById('maxTwoThirteenReversal').value='0';
            const saved=document.getElementById('tripleTieRule').checked;document.getElementById('tripleTieRule').checked=false;
            try{const out=pack_all_sensitive_and_segment(build_shuffled_deck());if(TwoThirteenReversals.count(out.a_rounds)!==0)throw new Error('挑局未遵守0上限');}
            finally{document.getElementById('tripleTieRule').checked=saved;}
        });
        console.log('PASS 實際挑局遵守0上限');
        await page.evaluate(async()=>{
            document.getElementById('avgRecoveryLimit').value='';
            if(document.getElementById('range16Limit'))document.getElementById('range16Limit').value='';
            document.getElementById('lastCardNine').checked=false;
            const make=(rare,i)=>{
                const pts=rare?[0,0,3,6,5]:[0,0,4,6,3];
                const r=makeRoundInfo(i*5,pts.map((n,j)=>new Card(n===0?'K':String(n),'♦',i*5+j)),'閒',true);
                r.segment='A';return r;
            };
            const shoe=Array.from({length:30},(_,i)=>make(i===0||i===5,i));
            const before=shoe.slice(),cardRefs=shoe.flatMap(r=>r.cards);
            const result=await repairRareReversalSpacing(shoe);
            if(!result.ok||!TwoThirteenReversals.check(result.rounds,null).okSpacing)throw new Error('整局交換未達成間隔');
            if(result.rounds.some((r,i)=>r.result!==shoe[i].result||r.cards.some(isSignalCardByConfig)!==shoe[i].cards.some(isSignalCardByConfig)))throw new Error('結果或訊號狀態改變');
            if(shoe.some((r,i)=>r!==before[i])||cardRefs.some(c=>!result.rounds.some(r=>r.cards.includes(c))))throw new Error('原牌／牌庫遺失');
            const flat=result.rounds.flatMap(r=>r.cards);
            if(flat.some((c,i)=>c.pos!==i))throw new Error('位置索引未更新');

            const sixShoe=Array.from({length:30},(_,i)=>{
                if(i===0||i===5)return make(true,i);
                const pts=[0,0,5,0,3,1];
                const r=makeRoundInfo(i*6,pts.map((n,j)=>new Card(n===0?'K':n===1?'A':String(n),'♦',i*6+j)),'閒',true);
                r.segment='A';return r;
            });
            const sixResult=await repairRareReversalSpacing(sixShoe);
            if(!sixResult.ok||sixResult.swaps.length!==1||!TwoThirteenReversals.check(sixResult.rounds,null).okSpacing)throw new Error('五張逆轉局不能與六張同結果同訊號局交換');
            const oldRecovery=analyzeShoeRecovery;
            const avg=document.getElementById('avgRecoveryLimit');
            let calls=0;
            avg.value='1';
            try{
                analyzeShoeRecovery=()=>({avgRounds:++calls===1?'2.0':'1.0',distribution:{range16plus:0}});
                const next=await repairRareReversalSpacing(shoe);
                if(!next.ok||calls<2)throw new Error('未跳過回復超標的交換方案');
            }finally{analyzeShoeRecovery=oldRecovery;avg.value='';}

        });
        console.log('PASS 實際整局交換函式保留結果／訊號、牌庫與局內牌序、更新索引；回復超標時找其他交換');

        for(const [mode,limit] of [['modeRed0',0],['modeA2',2],['modeA2','']]){
            await page.locator('#'+mode).click();await input.fill(String(limit));
            await page.evaluate(()=>{
                for(const id of ['avgRecoveryLimit','maxTieLimit','maxSideLimit','maxFourCardRate','max7PtReversal','swapBanker6Target'])document.getElementById(id).value='';
                for(const id of ['skipPlayer7Banker6','lastCardNine'])document.getElementById(id).checked=false;
                window.__reversalLocked=false;
                new MutationObserver(()=>{if(window.__isGeneratingShoe&&document.getElementById('maxTwoThirteenReversal').disabled)window.__reversalLocked=true;}).observe(document.getElementById('maxTwoThirteenReversal'),{attributes:true});
            });
            await page.locator('#chipGen').click();
            await page.waitForFunction(()=>!window.__isGeneratingShoe&&currentRounds?.flatMap(r=>r.cards).length===416,{},{timeout:120000});
            const actual=await page.evaluate(()=>({count:TwoThirteenReversals.count(currentRounds),cards:currentRounds.flatMap(r=>r.cards).length,locked:window.__reversalLocked,highlight:document.querySelectorAll('#roundsBody .two-thirteen-reversal').length,spacing:checkStandardRareReversals(currentRounds,null).okSpacing}));
            assert(limit===''||actual.count<=limit,JSON.stringify(actual));assert(actual.spacing,JSON.stringify(actual));assert.equal(actual.cards,416);assert(actual.locked);assert.equal(actual.highlight,actual.count);
            console.log(`PASS ${mode}實際生成416張：1/13＋2/13逆轉${actual.count}局，上限${limit===''?'不限':limit}；${mode==='modeA2'?'不限間隔':'間隔>20局'}、生成時欄位鎖定`);
        }
        await page.locator('#modeRed0').click();await input.fill('');
        const before=await page.evaluate(()=>JSON.stringify(currentRounds.map(r=>r.cards.map(c=>[c.rank,c.suit,c.back_color]))));
        const faces=await page.locator('#roundsBody [data-action="card"]').allTextContents();
        await page.evaluate(()=>{
            window.__originalReversalCheck=TwoThirteenReversals.check;
            window.__originalReversalColor=runAutoColorSwap_Signal;
            window.__reversalRejected=false;
            window.__originalSpacingRepair=TwoThirteenReversals.repairSpacing;
            window.__originalReversalBuild=build_shuffled_deck;
            window.__reversalBuilds=0;
            build_shuffled_deck=function(){window.__reversalBuilds++;return window.__originalReversalBuild();};
            TwoThirteenReversals.repairSpacing=async function(rounds,options){
                if(window.__reversalRejected)return {ok:false,reason:'測試：沒有安全交換候選'};
                return window.__originalSpacingRepair(rounds,options);
            };
            runAutoColorSwap_Signal=function(rounds){
                const out=window.__originalReversalColor(rounds);
                const cards=[0,0,3,6,5].map((n,i)=>new Card(n===0?'K':String(n),'♠',500+i));
                return [makeRoundInfo(500,cards,'閒',true),makeRoundInfo(505,cards.map(c=>c.clone()),'閒',true),...out];
            };
            TwoThirteenReversals.check=function(rounds,limit){
                const result=window.__originalReversalCheck(rounds,limit);
                if(!result.ok&&rounds===currentRounds&&!window.__reversalRejected){
                    window.__reversalRejected=true;
                    window.__spacingRejected=result.okCount&&!result.okSpacing;
                    window.__rejectedFaces=[...document.querySelectorAll('#roundsBody [data-action="card"]')].map(e=>e.textContent);
                    exportRoundsAsExcelWithDrive().then(v=>{window.__reversalExportResult=v;});
                    window.__buildsAtRejection=window.__reversalBuilds;
                }
                // 此案例只注入最終調整故障，預檢間隔暫放行以隔離最後驗收路徑。
                if(rounds!==currentRounds)return {...result,ok:result.okCount,okSpacing:true};
                return result;
            };
        });
        await page.locator('#chipGen').click();
        await page.waitForFunction(()=>window.__reversalRejected&&!window.__isGeneratingShoe,{},{timeout:120000});
        assert.equal(await page.evaluate(()=>JSON.stringify(currentRounds.map(r=>r.cards.map(c=>[c.rank,c.suit,c.back_color])))),before);
        assert.deepEqual(await page.evaluate(()=>window.__rejectedFaces),faces);
        assert.deepEqual(await page.locator('#roundsBody [data-action="card"]').allTextContents(),faces);
        assert.equal(await page.evaluate(()=>window.__reversalExportResult),false);
        assert.equal(await page.evaluate(()=>window.__spacingRejected),true);
        assert(await page.evaluate(()=>window.__reversalBuilds===window.__buildsAtRejection),'間隔交換失敗不得整副重跑');
        await page.evaluate(()=>{TwoThirteenReversals.check=window.__originalReversalCheck;runAutoColorSwap_Signal=window.__originalReversalColor;TwoThirteenReversals.repairSpacing=window.__originalSpacingRepair;build_shuffled_deck=window.__originalReversalBuild;});
        console.log('PASS 上限留白也檢查最終間隔；交換無解不整副重跑、恢復舊牌、不顯示／不導出未通過結果');
        assert.deepEqual(errors,[]);
    }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
