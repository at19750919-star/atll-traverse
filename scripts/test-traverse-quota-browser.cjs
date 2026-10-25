const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const ROOT=path.resolve(process.env.ATLL_ROOT||path.join(__dirname,'..'));
const row=JSON.parse(fs.readFileSync(path.join(ROOT,'scripts/validation/safe-cuts-research-2026-10-08.json'))).shoes.find(r=>r.seed===1139);
const fixture={cards:row.baselineCards,chains:row.baselineChains,leftoverCount:0,stats:{ms:0,shuffles:1,phase2Segments:0},signal:{ok:true,issues:[]},colorOk:true};
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.route('https://**',r=>r.fulfill({body:''}));await p.goto(require('node:url').pathToFileURL(path.join(ROOT,'integrated.html')).href);await p.waitForFunction(()=>!!window.IntegratedModes);await p.evaluate(()=>(IntegratedModes.switchMode('traverse-a2'),document.getElementById('tvTailFill').checked=true));
 async function run(max,min,tie){return p.evaluate(async({fixture,max,min,tie})=>{
  for(const id of ['tv4Min','tv4Max','tv5Min','tv5Max','tv6Min','tv6Max','tvSideLimit','tvTieMax','tvSevenReversalMax','tvRareReversalMax','tvBankerSixMax'])document.getElementById(id).value='';
  for(const id of ['tvNine','tvStrong','tvSecond','tvP7'])document.getElementById(id).checked=false;
  document.getElementById('tv4Max').value=max;document.getElementById('tv5Min').value=min;document.getElementById('tvTieMax').value=tie;
  const saved=TraverseBuilder.build;let calls=0;TraverseBuilder.build=async()=>{calls++;if(calls>1)throw new Error('synthetic-bounded-retry-end');return JSON.parse(JSON.stringify(fixture));};
  try{await IntegratedModes.generateTraverse();}finally{TraverseBuilder.build=saved;}
  return {calls,text:document.getElementById('tvProgress').textContent,busy:IntegratedModes.busy};
 },{fixture,max,min,tie});}
 const accepted=await run('33','19','');assert.equal(accepted.calls,1);assert.match(accepted.text,/實際36局.*原目標上限33.*允差/);assert.match(accepted.text,/實際16局.*原目標下限19.*允差/);assert.match(accepted.text,/完成/);console.log('PASS actual 36/16 with max33/min19 accepted and original targets displayed');
 const rejected=await run('32','19','');assert.equal(rejected.calls,2);assert.match(rejected.text,/synthetic-bounded-retry-end/);console.log('PASS four-count error4 causes retry (bounded fixture)');
 const zero=await run('','','0');assert.equal(zero.calls,2);console.log('PASS zero ties remains prohibited');
 assert.deepEqual(errors.filter(e=>!e.includes('synthetic-bounded-retry-end')),[]);
 console.log('PASS traverse quota UI, honest tolerance message, no unrelated errors');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
