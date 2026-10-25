const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ROOT=path.resolve(__dirname,'..');
require('../standard/two_thirteen_reversals.js');require('../traverse_builder.js');require('../traverse_export.js');require('../traverse_optimizer.js');
const B=global.TraverseBuilder,E=global.TraverseExport,O=global.TraverseOptimizer;
const fixtures=require('./validation/safe-cuts-research-2026-10-08.json');
const copy=x=>JSON.parse(JSON.stringify(x));
const resultOf=seed=>{const f=fixtures.shoes.find(x=>x.seed===seed);return {cards:copy(f.baselineCards),chains:copy(f.baselineChains),leftoverCount:0};};
const source=fs.readFileSync(path.join(ROOT,'standard/signals.js'),'utf8');
const fn=source.indexOf('function analyzeShoeRecovery('),end=source.indexOf('\n}',fn)+2;
const ctx=vm.createContext({console:{log(){},warn(){}},SIGNAL_CONFIG:{suits:[],ranks:[]}});
vm.runInContext(source.slice(source.indexOf('class Card {'),source.indexOf('function build_shuffled_deck()'))+source.slice(fn,end)+';globalThis.reference=analyzeShoeRecovery;',ctx);
function compare(cards){const rs=E.dealRounds(cards).map(r=>({...r,cards:r.cards.slice()}));if(!rs.at(-1).hand&&rs.length>1)rs[rs.length-2].cards.push(...rs.pop().cards);const full=ctx.reference(rs),fast=O.measureRecovery(cards);assert.equal(fast.totalCards,416);assert.equal(fast.sum,full.recoveryDetails.reduce((s,c)=>s+c.roundsUsed,0));fast.cuts.forEach((c,i)=>{assert.equal(c.roundsUsed,full.recoveryDetails[i].roundsUsed);assert.equal(!!c.failed,!!full.recoveryDetails[i].failed);});return fast;}
const signature=cs=>cs.map(c=>`${c.rank}|${c.suit}|${c.back_color}`).sort();
function verify(out,input){assert.deepEqual(signature(out.after.cards),signature(input.cards));const before=E.dealRounds(O.prepare(input)),after=E.dealRounds(O.prepare(out.after));assert.equal(after.length,before.length);before.forEach((r,i)=>{assert.equal(after[i].result,r.result);assert.equal(after[i].cards.length,r.cards.length);assert.deepEqual(signature(after[i].cards),signature(r.cards));assert.equal(B.isSignalHand(after[i].cards,out.rules.signalConfig),B.isSignalHand(r.cards,out.rules.signalConfig));});assert(out.final.count>=out.initial.count);assert(out.finalRecovery.sum<=out.initialRecovery.sum);assert(out.finalRecovery.cuts.filter(x=>x.failed).length<=out.initialRecovery.cuts.filter(x=>x.failed).length);if(out.accepted)assert(O.accepts(out.objective,out.final,out.finalRecovery,out.initial,out.initialRecovery));compare(O.prepare(out.after));assert(out.after.chains.every(c=>c.qualified));}
(async()=>{
 const r=sum=>({sum,cuts:[{failed:false}]});
 assert.equal(O.accepts('safe',{count:101},r(745),{count:100},r(744)),false);
 assert.equal(O.accepts('safe',{count:101},r(744),{count:100},r(744)),true);
 assert.equal(O.accepts('recovery',{count:100},r(743),{count:100},r(744)),true);
 assert.equal(O.accepts('recovery',{count:99},r(743),{count:100},r(744)),false);
 assert.equal(O.accepts('recovery',{count:100},{sum:743,cuts:[{failed:true}]},{count:100},r(744)),false);
 console.log('PASS exact integer objective, no safe loss, no extra failed cuts');
 for(const seed of [1124,1139,1197,1220])for(const objective of ['safe','recovery']){
  const input=resultOf(seed),saved=copy(input),out=await O.optimize(input,{objective,maxPasses:2,budgetMs:5000});
  assert.deepEqual(input,saved);verify(out,input);console.log(JSON.stringify({seed,objective,safe:[out.initial.count,out.final.count],sum:[out.initialRecovery.sum,out.finalRecovery.sum],average:[out.initialRecovery.score,out.finalRecovery.score],accepted:out.accepted,evaluated:out.evaluated,ms:out.ms}));
 }
 for(const tripleTie of [false,true])for(const signalRule of [false,true]){const input=resultOf(1139);try{const out=await O.optimizeRecovery(input,{tripleTie,signalRule,maxPasses:1});verify(out,input);}catch(e){assert.equal(tripleTie,false);assert.equal(signalRule,true);assert.match(e.message,/訊號結果/);}}
 console.log('PASS triple/signal four combinations');
 const second=resultOf(1139);let enabled=0;
 for(const ch of second.chains){const ps=Array.from({length:ch.length},(_,j)=>second.cards[(ch.start-1+j)%416].point);let found=null;for(let off=0;off<ps.length&&!found;off++)for(let len=8;len<=12&&off+len<=ps.length;len++)if(B.secondStartOk(ps.slice(off,off+len))){found={off,len};break;}if(found){const {off,len}=found;ch.parts=[...(off?[off]:[]),len,...(off+len<ps.length?[ps.length-off-len]:[])];ch.secondParts=ch.parts.map((_,i)=>i===(off?1:0));enabled++;}else{ch.parts=[ch.length];ch.secondParts=[false];}}

 assert(enabled>0);const out=await O.optimizeRecovery(second,{secondStart:true,maxPasses:1});verify(out,second);console.log('PASS enabled second-start segments '+enabled);
 const input=resultOf(1139);let cancelled=false;setTimeout(()=>{cancelled=true;},15);const stopped=await O.optimizeRecovery(input,{isCancelled:()=>cancelled});assert(stopped.cancelled);assert.equal(stopped.accepted,0);assert.equal(stopped.changes.length,0);assert.deepEqual(signature(stopped.after.cards),signature(input.cards));
 console.log('PASS live timer cancellation retains original');
 const no=await O.optimizeRecovery(input,{maxPasses:0});assert.equal(no.accepted,0);verify(no,input);
 await assert.rejects(()=>O.optimizeRecovery(resultOf(1292)),/尚未通過|訊號/);
 const bad=resultOf(1139);bad.cards[0]={...bad.cards[1]};await assert.rejects(()=>O.optimizeRecovery(bad),/牌庫/);
 await assert.rejects(()=>O.optimizeRecovery(input,{validate:()=>({ok:false,reason:'測試上限'})}),/原牌驗收不合格/);
 console.log('PASS no improvement and invalid original rejection');
 const ending=resultOf(1139),cards=O.prepare(ending),round=E.dealRounds(cards).find(r=>r.hand&&r.cards.at(-1).rank==='9'&&O.analyze(cards).safe.includes((r.start+r.cards.length)%416));const at=(round.start+round.cards.length)%416;ending.cards=E.cutDeck(ending.cards,at);ending.chains.forEach(ch=>ch.start=(ch.start-1-at+416)%416+1);
 const nine=await O.optimizeRecovery(ending,{preserveLastNine:true,maxPasses:1});assert.equal(nine.after.cards.at(-1).rank,'9');verify(nine,ending);
 console.log('PASS circular chain and last-nine preservation');
 for(const tripleTie of [false,true]){
  let seed=101;const rng=()=>{let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};
  const options={tripleTie,signalRule:true,signalConfig:{suits:['♥','♦'],ranks:['10','J','Q','K']}};
  const input=await B.build({...options,rng,idleLimit:100,computeTries:1000,chainAttempts:2}),saved=copy(input);
  try{const out=await O.optimizeRecovery(input,{...options,maxPasses:1});verify(out,input);console.log('PASS real red0 '+JSON.stringify({tripleTie,leftover:input.leftoverCount,before:out.initialRecovery.score,after:out.finalRecovery.score,safe:[out.initial.count,out.final.count]}));}
  catch(e){assert(input.signal.ok===false||input.chains.some(ch=>!ch.qualified));assert.match(e.message,/尚未通過|訊號結果/);console.log('PASS invalid red0 generation rejected '+tripleTie);}
  assert.deepEqual(input,saved);
 }
 for(const name of ['integrated.html','traverse_builder.html']){const html=fs.readFileSync(path.join(ROOT,name),'utf8');for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);}
 console.log('PASS HTML inline script syntax');
})().catch(e=>{console.error(e);process.exitCode=1});
