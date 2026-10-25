// 固定種子交錯比較：baseline 移除整局互換呼叫，extra 使用正式程式。
// NODE_PATH=... node scripts/bench-recovery-round-swaps.cjs [輸出 JSON 路徑]
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
function baseline(source){
 const start=source.indexOf("        if (['red0','a2'].includes(window.StandardProfiles?.current)) {");
 const end=source.indexOf('        if (requiresFinalValidation) {\n            let acceptedPos = 0;',start);
 assert(start>=0&&end>start);return source.slice(0,start)+source.slice(end);
}
function experimental(source){return source;}
module.exports={experimental};
if(require.main===module)(async()=>{
 const source=fs.readFileSync(path.join(root,'standard/signals.js'),'utf8'),changed=experimental(source),original=baseline(source),rows=[];
 const server=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://localhost'),parts=u.pathname.split('/'),variant=parts[1];
  const file=path.resolve(root,decodeURIComponent(parts.slice(2).join('/')));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[path.extname(file)]||'application/octet-stream');
  res.end(file===path.join(root,'standard/signals.js')?(variant==='extra'?changed:original):fs.readFileSync(file));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'chrome',headless:true});console.log('Browser ready');
 try{
 for(const mode of ['modeRed0','modeA2'])for(const seed of [5,139,332,17,29,41,53,67,79,97,101,113])for(const variant of seed%2?['baseline','extra']:['extra','baseline']){
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://**/*',r=>r.abort());
  console.log(`START ${mode} ${seed} ${variant}`);
  await page.goto(`http://127.0.0.1:${server.address().port}/${variant}/integrated.html`);
  await page.click('#'+mode);
  await page.evaluate(seed=>{
   for(const id of ['maxSideLimit','maxTieLimit','maxFourCardRate','max7PtReversal','maxBankerSixWin','maxTwoThirteenReversal','swapBanker6Target','st4Min','st4Max','st5Min','st5Max','st6Min','st6Max'])document.getElementById(id).value='';
   document.getElementById('avgRecoveryLimit').value='4.5';
   document.getElementById('tripleTieRule').checked=false;document.getElementById('lastCardNine').checked=false;
   let s=seed;Math.random=()=>{let t=s+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};
   window.__benchTimer=setTimeout(()=>{window.__stopGenerateRequested=true;},60000);
   window.__packs=0;const pack=pack_all_sensitive_and_segment;
   window.pack_all_sensitive_and_segment=(...args)=>{if(++window.__packs>100){window.__stopGenerateRequested=true;throw Error('benchmark 100 candidate cap');}return pack(...args);};
   window.__extraStats=[];const search=RecoverySearch.search;RecoverySearch.search=async(...args)=>{const r=await search(...args);__extraStats.push({checks:r.checks,improvements:r.improvements});return r;};
  },seed);
  const row=await page.evaluate(async()=>{const start=performance.now();await generateShoe();const ms=performance.now()-start;const r=analyzeShoeRecovery(currentRounds),rs=currentRounds||[];return {ms,packs:__packs,retries:Math.max(0,__packs-1),cards:rs.flatMap(r=>r.cards).length,avg:r?.recoveryDetails.reduce((s,c)=>s+c.roundsUsed,0)/r?.totalCards,validation:rs.length?validateStandardGeneratedShoe(rs):null,color:rs.length?calculateCardColorViolations(rs):null,search:__extraStats,swaps:window.__lastRecoveryRoundSwaps||null,reason:rs.length?'':document.getElementById('logArea').textContent.slice(-1000)};});
  await page.evaluate(()=>clearTimeout(__benchTimer));
  assert.deepEqual(errors,[]);if(row.cards){assert.equal(row.cards,416);assert(row.validation.ok,JSON.stringify(row.validation));assert.equal(row.color,0);}
  rows.push({mode,seed,variant,...row});if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify({rows},null,2));console.log(JSON.stringify({mode,seed,variant,cards:row.cards,avg:row.avg,ms:Math.round(row.ms),retries:row.retries}));await page.close();
 }
 const summary=[];for(const mode of ['modeRed0','modeA2'])for(const variant of ['baseline','extra']){const all=rows.filter(r=>r.mode===mode&&r.variant===variant),rs=all.filter(r=>r.cards===416&&rows.some(other=>other.mode===mode&&other.seed===r.seed&&other.variant!==variant&&other.cards===416));assert(rs.length>=10,'至少須有10副配對成功牌');summary.push({mode,variant,n:rs.length,failed:all.filter(r=>!r.cards).map(r=>r.seed),avg:rs.reduce((s,r)=>s+r.avg,0)/rs.length,ms:rs.reduce((s,r)=>s+r.ms,0)/rs.length,retries:rs.reduce((s,r)=>s+r.retries,0)});}
 console.log(JSON.stringify({summary},null,2));if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify({summary,rows},null,2));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
