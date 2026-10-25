const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{performance}=require('node:perf_hooks');
const ROOT=path.resolve(__dirname,'..');
const clone=x=>JSON.parse(JSON.stringify(x));
function engine(old=false){const ctx=vm.createContext({console,setTimeout,performance});for(const name of ['standard/two_thirteen_reversals.js','card_color_rules.js'])vm.runInContext(fs.readFileSync(path.join(ROOT,name),'utf8'),ctx);vm.runInContext(fs.readFileSync(old&&process.env.ATLL_BASELINE?process.env.ATLL_BASELINE:path.join(ROOT,'traverse_builder.js'),'utf8'),ctx);vm.runInContext(fs.readFileSync(path.join(ROOT,'traverse_export.js'),'utf8'),ctx);if(!old)vm.runInContext(fs.readFileSync(path.join(ROOT,'traverse_red0_balance.js'),'utf8'),ctx);return ctx;}
function rng(seed){return()=>{let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}
const red0={suits:['♥','♦'],ranks:['10','J','Q','K']};
function inventory(cards){const count={};for(const c of cards){const k=[c.rank,c.suit,c.back_color].join('/');count[k]=(count[k]||0)+1;}assert.equal(Object.keys(count).length,104);assert(Object.values(count).every(n=>n===4));}
function inspect(e,r,o){inventory(r.cards);const B=e.TraverseBuilder,E=e.TraverseExport,rs=E.dealRounds(r.cards).filter(r=>r.hand);let Bn=0,P=0,T=0;const errors=[];rs.forEach((r,i)=>{if(r.result==='莊')Bn++;else if(r.result==='閒')P++;else T++;const prev=rs[(i+rs.length-1)%rs.length],need=B.neededAfter(prev.cards);if(r.result!==need&&!(!o.tripleTie&&r.result==='和'&&need==='閒'))errors.push(i+1);});const allChains=r.chains.every(x=>x.qualified);return {N:rs.length,B:Bn,P,T,diff:Math.abs(Bn-P-T),numeric:o.sideLimit==null||Math.abs(Bn-P-T)<=o.sideLimit,signal:!!r.signal?.ok,allSignal:!errors.length,allChains,leftover:r.leftoverCount,ms:r.stats.ms,planner:r.signalBalance?.status||'legacy',nodes:r.signalBalance?.nodes,validations:r.signalBalance?.validations,planningMs:r.signalBalance?.ms,tailConflicts:r.signalBalance?.tailConflicts};}
async function generate(e,seed,o,newPlan){return e.TraverseBuilder.build({idleLimit:100,computeTries:1000,chainAttempts:2,...o,rng:rng(seed),red0Balance:newPlan,signalRule:true,signalConfig:red0});}
(async()=>{
 const old=engine(true),next=engine(),rows=[];
 // Warm both engines. These are fixed candidate workloads, not completed zero-leftover shoes.
 await generate(old,101,{tripleTie:false,secondStart:false,sideLimit:2},false);await generate(next,101,{tripleTie:false,secondStart:false,sideLimit:2},true);
 for(const tripleTie of [false,true])for(const secondStart of [false,true])for(const seed of [101,102,103]){
  const o={tripleTie,secondStart,sideLimit:2};let a,b;
  if(seed%2){b=await generate(next,seed,o,true);a=await generate(old,seed,o,false);}else{a=await generate(old,seed,o,false);b=await generate(next,seed,o,true);}
  const prior=inspect(old,a,o),after=inspect(next,b,o);
  assert.deepEqual(clone(a.chains.map(c=>[c.start,c.length,c.parts,c.secondParts])),clone(b.chains.map(c=>[c.start,c.length,c.parts,c.secondParts])),'same initial segment structure');
  if(b.signalBalance?.ok){assert(after.numeric&&after.signal&&after.allChains);assert.equal(after.diff,b.signalBalance.diff);assert.equal(after.B,b.signalBalance.banker);}
  rows.push({seed,tripleTie,secondStart,D:2,prior,after});console.log(JSON.stringify(rows.at(-1)));
 }
 for(const tripleTie of [false,true])for(const secondStart of [false,true]){
  const o={tripleTie,secondStart,sideLimit:2,idleLimit:1000,computeTries:20000,chainAttempts:20},seed=1139;
  const a=await generate(old,seed,o,false),b=await generate(next,seed,o,true),prior=inspect(old,a,o),after=inspect(next,b,o);
  if(b.signalBalance?.ok)assert(after.numeric&&after.signal&&after.allChains);
  const row={seed,tripleTie,secondStart,D:2,budgets:'1000/20000/20',prior,after};rows.push(row);console.log('DEFAULT '+JSON.stringify(row));
 }
 for(const D of [0,1,8,null]){
  const o={tripleTie:false,secondStart:false,sideLimit:D},a=await generate(old,101,o,false),b=await generate(next,101,o,true),after=inspect(next,b,o);
  if(D===null)assert.deepEqual(clone(b.cards),clone(a.cards),'blank preserves the old path/random sequence');
  if(b.signalBalance?.ok)assert(after.numeric&&after.signal&&after.allChains);
  console.log('BOUNDARY '+JSON.stringify({D,after}));
 }
 // Exact odd-N / D=0 impossibility and bounded/cancellable calls use a real saved skeleton.
 const odd=rows.find(x=>x.after.N%2);assert(odd);const impossible=await generate(next,odd.seed,{tripleTie:odd.tripleTie,secondStart:odd.secondStart,sideLimit:0},true);assert.equal(impossible.signalBalance.status,'infeasible');assert.match(impossible.signalBalance.reason,/奇偶/);console.log('PASS odd complete-round count D0 impossible without retries');
 const base=await generate(next,101,{tripleTie:false,secondStart:false,sideLimit:8},true);
 const B=next.TraverseBuilder;Object.assign(B.rules,{tripleTie:false,signalRule:true,signalConfig:red0,strong:false,secondStart:false,skipBanker6:false,skipPlayer7:false});
 function pieces(r){const chains=r.chains.map(c=>{const a=r.cards.slice(c.start-1,c.start-1+c.length).map(x=>x.point);a.parts=c.parts;a.secondParts=c.secondParts;return a;});return {chains,left:r.cards.slice(416-r.leftoverCount).map(x=>x.point)};}
 const p=pieces(base),saved=JSON.stringify([p,base.cards]);
 const stopped=await next.TraverseRed0Balance.plan(p.chains,p.left,base.cards,{sideTarget:2,rng:rng(1)},{cancelled:()=>true});assert.equal(stopped.status,'cancelled');
 const limited=await next.TraverseRed0Balance.plan(p.chains,p.left,base.cards,{sideTarget:2,rng:rng(1),balanceMaxNodes:0,balanceMaxValidations:0});assert(['solved','search-limit'].includes(limited.status));if(limited.ok){assert(limited.diff<=2);assert(limited.points.length===416);inventory(limited.cards);}assert.equal(JSON.stringify([p,base.cards]),saved);
 for(const limits of [{bankerSix:null,seven:0,rare:null},{bankerSix:null,seven:null,rare:0}]){
  const checked=await next.TraverseRed0Balance.plan(p.chains,p.left,base.cards,{sideTarget:2,rng:rng(7),specialLimits:limits,balanceBudgetMs:300});
  if(checked.ok){const count=B.specialRoundCounts(checked.points);if(limits.seven===0)assert.equal(count.seven,0);if(limits.rare===0)assert.equal(count.rare,0);}else assert(['search-limit','infeasible'].includes(checked.status));
 }
 console.log('PASS finite reversal limits retained');
 assert.equal(next.TraverseBuilder.SIGNAL_RETRY_ENABLED,false);
 for(const signalConfig of [{suits:['♠','♥','♦','♣'],ranks:['A','2']},{suits:['♥'],ranks:['K']}]){
  const o={signalConfig,rng:rng(101),red0Balance:true,idleLimit:30,computeTries:200,chainAttempts:1,tripleTie:true,sideLimit:8};
  const a=await old.TraverseBuilder.build({...o,rng:rng(101)}),b=await next.TraverseBuilder.build({...o,rng:rng(101)});assert.deepEqual(clone(a.cards),clone(b.cards));assert.notEqual(b.signalBalance?.kind,'traverse-red0-target');
 }
 console.log('PASS legacy A2/custom signal/blank unchanged; stop/limit retain input; no signal retry enabled');
 const summarize=key=>({candidates:rows.length,sideRetry:rows.filter(x=>!x[key].numeric).length,numeric:rows.filter(x=>x[key].numeric).length,fullSignalAndChain:rows.filter(x=>x[key].numeric&&x[key].signal&&x[key].allChains).length,allCompleteSignalsAndChains:rows.filter(x=>x[key].numeric&&x[key].signal&&x[key].allSignal&&x[key].allChains).length,solvedPlans:rows.filter(x=>x[key].planner==='solved').length,ms:rows.map(x=>x[key].ms)});
 const report={workload:'16 paired fixed candidates: 12 with idle100/compute1000/chain2, four seed1139 with default1000/20000/20; D2. Residual cards retained and reported. No claim about completed zero-leftover generation rate.',prior:summarize('prior'),after:summarize('after'),rows};
 if(process.env.ATLL_REPORT)fs.writeFileSync(process.env.ATLL_REPORT,JSON.stringify(report,null,2));console.log('SUMMARY '+JSON.stringify({...report,rows:undefined}));
})().catch(e=>{console.error(e);process.exitCode=1});
