const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{performance}=require('node:perf_hooks');
const ROOT=path.resolve(__dirname,'..'),Q=require('../traverse_quota.js');
require('../traverse_builder.js');const B=global.TraverseBuilder;
const limits={4:{min:null,max:32},5:{min:20,max:null},6:{min:null,max:null}};
function counts(a,b,t=0){return {4:a,5:b,6:20,tie:t};}
assert(Q.check(counts(35,17,8),limits,5).ok);assert(!Q.check(counts(36,17,8),limits,5).ok);assert(!Q.check(counts(35,16,8),limits,5).ok);
assert(Q.check({tie:10},null,7).ok);assert(!Q.check({tie:11},null,7).ok);assert(!Q.check({tie:1},null,0).ok);assert(Q.check({tie:0},null,0).ok);
assert(!Q.check({4:1},{4:{max:0}}).ok);assert(Q.check({4:0},{4:{min:2}}).ok);assert(Q.check({4:100,tie:70},null,null).ok);
assert(!Q.check(counts(35,17,8),limits,5).original);assert.match(Q.check(counts(35,17,8),limits,5).summary,/實際35.*原目標.*上限32.*允差/);
console.log('PASS tolerance3 accepts/4 rejects, original targets retained, blank and strict zero');
const hands=B.allSensitiveHands(),four=hands.find(h=>h.length===4),five=hands.find(h=>h.length===5),tie=hands.find(h=>B.simulateHand(h,0,h.length).result==='和');
const opts={sizeLimits:B.normalizeSizeLimits(limits),sizeTally:{4:0,5:0,6:0},sizeUsedCards:0,tieMax:5,tieTally:0,specialLimits:null};
assert(B.preferQuota(five.concat(five),four.concat(four),opts));
assert(!B.sizeLimitOk(four,{...opts,sizeLimits:B.normalizeSizeLimits({4:{max:0}})}));assert(!B.sizeLimitOk(tie,{...opts,tieMax:0}));
const tight={...opts,sizeLimits:B.normalizeSizeLimits({4:{min:80},5:{min:19}})};const six=hands.find(h=>h.length===6);assert(!B.sizeLimitOk(six,tight));
console.log('PASS deficit ordering, hard upper limits and shared-card minimum feasibility');
function engine(old){const ctx=vm.createContext({console,setTimeout,performance});for(const n of ['standard/two_thirteen_reversals.js','card_color_rules.js','traverse_red0_balance.js'])vm.runInContext(fs.readFileSync(path.join(ROOT,n),'utf8'),ctx);const source=old&&process.env.ATLL_BASELINE?process.env.ATLL_BASELINE:path.join(ROOT,'traverse_builder.js');vm.runInContext(fs.readFileSync(source,'utf8'),ctx);return ctx.TraverseBuilder;}
const rng=seed=>()=>{let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};
function inventory(r){const c={};r.cards.forEach(x=>{const k=[x.rank,x.suit,x.back_color].join('/');c[k]=(c[k]||0)+1;});assert.equal(Object.keys(c).length,104);assert(Object.values(c).every(n=>n===4));}
(async()=>{
 const old=engine(true),next=engine(false),rows=[];
 const generate=(api,seed,o)=>api.build({rng:rng(seed),idleLimit:25,computeTries:150,chainAttempts:1,...o});
 for(const seed of [101,102]){const a=await generate(old,seed,{}),b=await generate(next,seed,{sizeLimits:{4:{},5:{},6:{}},tieMax:null});assert.deepEqual(JSON.parse(JSON.stringify(a.cards)),JSON.parse(JSON.stringify(b.cards)));}
 console.log('PASS all blank same physical cards/random path');
 for(const tripleTie of [false,true])for(const secondStart of [false,true])for(const tieMax of [5,7])for(const mode of ['a2','red0']){
  const seed=101,o={tripleTie,secondStart,tieMax,sizeLimits:limits,sideLimit:null,signalConfig:mode==='a2'?{suits:['♠','♥','♦','♣'],ranks:['A','2']}:{suits:['♥','♦'],ranks:['10','J','Q','K']},red0Balance:mode==='red0'};
  let a,b;if(tieMax===5){a=await generate(old,seed,o);b=await generate(next,seed,o);}else{b=await generate(next,seed,o);a=await generate(old,seed,o);}
  const inspect=(api,r)=>{if(r.rejected){assert(!r.cards);return {rejected:true,tolerance:false,left:r.leftoverCount,ms:r.stats.ms,picked:r.stats.sizeTally};}inventory(r);const c=api.roundSizeCounts(r.cards.map(x=>x.point)),q=Q.check(c,limits,tieMax);return {counts:c,original:q.original,tolerance:q.ok,onlyTolerance:q.ok&&!q.original,miss:q.reason,left:r.leftoverCount,ms:r.stats.ms,signal:r.signal?.ok,chains:r.chains.every(x=>x.qualified),picked:r.stats.sizeTally};};
  const before=inspect(old,a),after=inspect(next,b);assert(b.stats.sizeTally[4]<=32);assert(b.stats.tiePicked<=tieMax);assert(b.stats.specialPicked==null);rows.push({mode,seed,tripleTie,secondStart,tieMax,before,after});console.log(JSON.stringify(rows.at(-1)));
 }
 for(const tripleTie of [false,true]){const r=await generate(next,102,{tripleTie,tieMax:0});assert.equal(next.roundSizeCounts(r.cards.slice(0,416-r.leftoverCount).map(x=>x.point)).tie,0);inventory(r);}
 let stop=false;setTimeout(()=>stop=true,10);const cancelled=await next.build({rng:rng(101),sizeLimits:limits,tieMax:5,computeTries:20000,idleLimit:1000,isCancelled:()=>stop});assert(stop);assert(cancelled.cancelled || cancelled.rejected);assert(!cancelled.cards,'cancelled candidate must not publish a partial shoe');console.log('PASS zero-tie picking with triple on/off and live cancellation');
 const summarize=k=>({original:rows.filter(r=>r[k].original).length,onlyTolerance:rows.filter(r=>r[k].onlyTolerance).length,rejected:rows.filter(r=>!r[k].tolerance).length,ms:rows.map(r=>r[k].ms)}),report={method:(process.env.ATLL_BASELINE?'Snapshot baseline versus modified':'No baseline supplied: current version repeated, not a before/after benchmark')+'; 16 paired fixed candidates, seed101, idle25/compute150/chain1; alternating order. Not completed zero-leftover shoes.',before:summarize('before'),after:summarize('after'),rows};
 if(process.env.ATLL_REPORT)fs.writeFileSync(process.env.ATLL_REPORT,JSON.stringify(report,null,2));console.log('SUMMARY '+JSON.stringify({...report,rows:undefined}));
})().catch(e=>{console.error(e);process.exitCode=1});
