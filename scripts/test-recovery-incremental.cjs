// Fixtures: run test-targeted-recovery.cjs first. All browser work uses a fresh profile.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const api=require('../standard/recovery_search.js');
const raw=JSON.parse(fs.readFileSync(path.join(__dirname,'validation/targeted-recovery-results.json')))[0];
const rounds=JSON.parse(raw.signature);rounds.forEach(r=>r.cards.forEach(c=>c.point=()=>c.rank==='A'?1:Math.min(Number(c.rank)||10,10)%10));
let seed=139;const random=()=>{let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};
const candidates=[];for(let k=0;k<1200;k++){
 const indices=k<2?[0,rounds.length-1]:[Math.floor(random()*rounds.length),Math.floor(random()*rounds.length)];
 const r=rounds.slice();for(const i of indices){const cards=r[i].cards.slice();for(let j=cards.length-1;j>0;j--){const q=Math.floor(random()*(j+1));[cards[j],cards[q]]=[cards[q],cards[j]];}r[i]={...r[i],cards};}candidates.push({r,indices});
}
const evaluator=api.createEvaluator(rounds);let reused=0;
for(const {r,indices}of candidates){const full=api.measure(r,true),inc=evaluator.evaluate(r,indices);assert.equal(inc.sum,full.sum);assert.deepEqual(inc.cuts,full.cuts);reused+=inc.reusedCuts;}
const compare=(fast)=>{let sum=0;const t=performance.now();for(const {r,indices} of candidates)sum+=(fast?evaluator.evaluate(r,indices):api.measure(r)).sum;return {ms:performance.now()-t,sum};};
for(let k=0;k<3;k++){compare(false);compare(true);}const times={full:[],incremental:[]};
for(let k=0;k<7;k++)for(const fast of k%2?[true,false]:[false,true]){const r=compare(fast);times[fast?'incremental':'full'].push(r.ms);}
console.log(JSON.stringify({candidates:candidates.length,meanReused:reused/candidates.length,times}));
console.log('PASS all per-cut counts, failed flags, full routes, sum; first/last and random two-round permutations');
let changedRoutes=0,repairedFailures=0;
for(let k=0;k<1500;k++){
 const base=Array.from({length:3+k%9},()=>({cards:Array.from({length:4+Math.floor(random()*3)},()=>{const point=Math.floor(random()*10);return {point:()=>point};})}));
 const e=api.createEvaluator(base),r=base.slice(),indices=[0,base.length-1];
 for(const i of indices)r[i]={cards:base[i].cards.slice().reverse()};
 const result=e.evaluate(r,indices),full=api.measure(r,true);assert.equal(result.sum,full.sum);assert.deepEqual(result.cuts,full.cuts);
 for(let i=0;i<result.cuts.length;i++){if(e.base.cuts[i].route.join(',')!==result.cuts[i].route.join(','))changedRoutes++;if(e.base.cuts[i].failed&&!result.cuts[i].failed)repairedFailures++;}
}
assert(changedRoutes&&repairedFailures);console.log('PASS synthetic circular/overflow cases '+JSON.stringify({changedRoutes,repairedFailures}));
async function browserProof(){
 const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const p=await browser.newPage();await p.route('https://script.google.com/**',r=>r.abort());await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:''}));
  const excel=path.join(process.env.CODEX_NODE_MODULES||'','exceljs/dist/exceljs.min.js');if(fs.existsSync(excel))await p.route('https://cdn.jsdelivr.net/npm/exceljs@*/dist/exceljs.min.js',r=>r.fulfill({path:excel,contentType:'text/javascript'}));
  await p.goto(require('node:url').pathToFileURL(path.join(process.env.ATLL_ROOT||path.resolve(__dirname,'..'),'integrated.html')).href);
  const proof=await p.evaluate(({base})=>{
   const hydrate=rs=>rs.map(r=>({...r,cards:r.cards.map(c=>Object.assign(new Card(c.rank,c.suit,c.pos),{back_color:c.back_color}))}));
   const rounds=hydrate(base),e=RecoverySearch.createEvaluator(rounds);let count=0,seed=139;
   const random=()=>{let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};
   for(let k=0;k<1200;k++){
    const indices=k<2?[0,rounds.length-1]:[Math.floor(random()*rounds.length),Math.floor(random()*rounds.length)],cards=rounds.slice();
    for(const i of indices){const order=cards[i].cards.slice();for(let j=order.length-1;j>0;j--){const q=Math.floor(random()*(j+1));[order[j],order[q]]=[order[q],order[j]];}cards[i]={...cards[i],cards:order};}
    const inc=e.evaluate(cards,indices),original=analyzeShoeRecovery(cards);const sum=original.recoveryDetails.reduce((s,x)=>s+x.roundsUsed,0);
    if(inc.sum!==sum||inc.cuts.some((c,i)=>c.roundsUsed!==original.recoveryDetails[i].roundsUsed))throw Error('original analyzer mismatch');count++;
   }
   return {candidates:count,cuts:count*416};
  },{base:JSON.parse(raw.signature)});
  console.log('PASS independent original analyzer '+JSON.stringify(proof));
 }finally{await browser.close();}
}
browserProof().catch(e=>{console.error(e);process.exitCode=1;});
