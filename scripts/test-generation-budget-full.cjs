const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium } = require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root = path.resolve(__dirname,'..'), baseline = process.env.ATLL_BUDGET_BASELINE;
const server = http.createServer((req,res) => {
    const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1);
    const file = path.resolve(root,pathname);
    if (!file.startsWith(root+path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':'application/octet-stream');
    res.end(fs.readFileSync(file));
});
(async()=>{
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    const browser = await chromium.launch({channel:'chrome',headless:true});
    try {
        for (const old of baseline ? [true,false] : [false]) for (const mode of ['a2','red0']) for (const seed of [1,139]) {
            const page=await browser.newPage();
            await page.route('https://**/*',r=>r.abort());
            if(old) for(const f of ['integrated.html','standard/signals.js','standard/signals_ui.js']) await page.route('**/'+f+'*',r=>r.fulfill({path:path.join(baseline,f.replaceAll('/','__')),contentType:f.endsWith('.js')?'text/javascript':'text/html'}));
            await page.goto(`http://127.0.0.1:${server.address().port}/integrated.html`);
            await page.click(mode==='a2'?'#modeA2':'#modeRed0');
            await page.evaluate(seed=>{
                window.__testLogs=[];const originalLog=log;window.log=(m,...a)=>{__testLogs.push(m);return originalLog(m,...a);};
                for(const id of ['avgRecoveryLimit','range16Limit','maxTieLimit','maxFourCardRate','swapBanker6Target','st4Min','st5Min','st6Min','st6Max']){const input=document.getElementById(id);if(input)input.value='';}
                for(const [id,v]of Object.entries({maxSideLimit:4,maxBankerSixWin:2,max7PtReversal:2,maxTwoThirteenReversal:2,st4Max:30,st5Max:30}))document.getElementById(id).value=v;
                for(const id of ['tripleTieRule','lastCardNine','skipPlayer7Banker6'])document.getElementById(id).checked=false;
                let state=seed;Math.random=()=>{let t=state+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};
                window.__testPacks=0;const pack=pack_all_sensitive_and_segment;
                window.pack_all_sensitive_and_segment=(...a)=>{if(++__testPacks>150){window.__stopGenerateRequested=true;throw Error('test candidate cap');}return pack(...a);};
            },seed);
            const start=Date.now();
            await page.evaluate(()=>{window.__testFinished=false;(async()=>{for(let n=0;n<10;n++){await generateShoe();if(currentRounds?.length||__testPacks>150)break;}})().finally(()=>window.__testFinished=true);});
            await page.waitForFunction(()=>window.__testFinished,null,{timeout:120000});
            const result=await page.evaluate(()=>({packs:__testPacks,cards:currentRounds?.flatMap(r=>r.cards).length||0,
                validation:currentRounds?.length?validateStandardGeneratedShoe(currentRounds):null,
                reasons:__testLogs.filter(x=>/重新生成|自動重新排牌|重新挑局/.test(x)).reduce((s,m)=>{const k=/局數上下限/.test(m)?'sizes':/莊6點贏/.test(m)?'b6':/七點逆轉|逆轉（/.test(m)?'reversals':/莊閒差距超標/.test(m)?'side':/殘牌處理失敗/.test(m)?'tail':/訊號預算/.test(m)?'budget':'other';s[k]=(s[k]||0)+1;return s;},{}),
                last:__testLogs.slice(-2)}));
            console.log(JSON.stringify({variant:old?'before':'after',mode,seed,ms:Date.now()-start,...result}));
            if(!old){assert.equal(result.cards,416,JSON.stringify(result));assert(result.validation.ok,JSON.stringify(result));}
            await page.close();
        }
        console.log('PASS full generation: 416 cards and all original final rules');
    } finally { await browser.close(); server.close(); }
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
