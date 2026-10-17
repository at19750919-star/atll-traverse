const assert = require('node:assert/strict');
require('../traverse_builder.js'); require('../traverse_export.js'); require('../traverse_optimizer.js');
const B=globalThis.TraverseBuilder,E=globalThis.TraverseExport,O=globalThis.TraverseOptimizer;
const config={suits:['♥'],ranks:['10','J','Q','K']};
const rng=seed=>()=>{let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296};
(async()=>{
assert(B.isSignalCard({rank:'J',suit:'♥'},config));
assert(!B.isSignalCard({rank:'J',suit:'♠'},config));
assert(!B.isSignalCard({rank:'A',suit:'♥'},config));
assert(!B.isSignalCard({rank:'10',suit:'♥'},{suits:['♥'],ranks:['J']}));
for(const c of [config,{suits:['♠'],ranks:['A','7']},{suits:[],ranks:[]}]){
const r=await B.build({signalConfig:c,rng:rng(1139),chainAttempts:2});
assert.deepEqual(r.signalConfig,B.normalizeSignal(c));
assert.equal(r.cards.length,416);
for(const suit of ['♠','♥','♦','♣'])for(const rank of ['A','2','3','4','5','6','7','8','9','10','J','Q','K'])for(const back of ['R','B'])assert.equal(r.cards.filter(x=>x.suit===suit&&x.rank===rank&&x.back_color===back).length,4);
const rounds=E.dealRounds(r.cards).filter(x=>x.hand);const end=r.chains.reduce((n,ch)=>n+ch.length,0);
let bad=0;rounds.forEach((h,i)=>{if(h.start>=end||rounds.length<2)return;const prev=rounds[(i+rounds.length-1)%rounds.length];const need=B.isTriple(prev.cards.map(x=>x.point))?'和':B.isSignalHand(prev.cards,c)?'莊':'閒';if(h.result!==need)bad++});
assert.equal(r.signal.conflicts,bad,'診斷必須與實際花色牌面一致');
const prepared=O.prepare(r),analysis=O.analyze(prepared,{signalConfig:c});
assert.equal(analysis.depths.length,416);
assert.equal(analysis.count,analysis.depths.filter(x=>x===0).length);
console.log('PASS 自訂 '+JSON.stringify(c)+'：完整牌庫、實際訊號診斷、416 切點');
}
const d=await B.build({idleLimit:1,computeTries:1,chainAttempts:1,rng:rng(1)});
assert.deepEqual(d.signalConfig,{suits:['♠','♥','♦','♣'],ranks:['A','2']});
console.log('PASS 未指定設定時恢復預設 A、2');
})().catch(e=>{console.error(e);process.exitCode=1});
