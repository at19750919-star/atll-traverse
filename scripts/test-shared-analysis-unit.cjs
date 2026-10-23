const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..');
require('../traverse_builder.js');require('../traverse_export.js');require('../traverse_optimizer.js');
const src=fs.readFileSync(path.join(root,'standard/signals.js'),'utf8');
const c=vm.createContext({console:{log(){},warn(){}},TraverseOptimizer,TraverseBuilder,TraverseExport});c.window=c;
vm.runInContext(src.slice(src.indexOf('class Card {'),src.indexOf('// 對陣列就地洗牌'))+src.slice(src.indexOf('function analyzeShoeRecovery(rounds)'),src.indexOf('function analyzeShoeRecovery(rounds)')+src.slice(src.indexOf('function analyzeShoeRecovery(rounds)')).indexOf('\n}')+2),c);
vm.runInContext(fs.readFileSync(path.join(root,'integrated-analysis.js'),'utf8'),c);
const fixture=JSON.parse(fs.readFileSync(path.join(root,'scripts/validation/safe-cuts-research-2026-10-08.json'))).shoes;
const plain=x=>JSON.parse(JSON.stringify(x));
let n=0;
for(const shoe of fixture.slice(0,3))for(const signalConfig of [{suits:['♥','♦'],ranks:['10','J','Q','K']},{suits:['♠','♥','♦','♣'],ranks:['A','2']}])for(const cut of [0,1,415]){
 const cards=TraverseExport.cutDeck(TraverseOptimizer.prepare({cards:shoe.baselineCards,chains:shoe.baselineChains}),cut),rounds=TraverseExport.dealRounds(cards),before=JSON.stringify(rounds);
 const options={tripleTie:true,signalRule:true,signalConfig};
 assert.deepEqual(plain(c.IntegratedAnalysis.safe(cards,options)),plain(TraverseOptimizer.analyze(cards.map(x=>({...x,traverse:true})),options)));
 assert.deepEqual(plain(c.IntegratedAnalysis.safe(cards,options,true)),plain(TraverseOptimizer.analyze(cards,options)));
 assert.deepEqual(plain(c.IntegratedAnalysis.safe(cards.map(x=>({...x,back_color:'X'})),options)),plain(c.IntegratedAnalysis.safe(cards,options)));
 if(rounds.at(-1).hand)assert.deepEqual(plain(c.IntegratedAnalysis.recovery(rounds)),plain(c.analyzeShoeRecovery(rounds)));
 const recovery=c.IntegratedAnalysis.recovery(rounds);assert.equal(recovery.totalCards,416);assert.equal(recovery.recoveryDetails.length,416);
 assert.equal(recovery.immediateRecovery,rounds.filter(r=>r.hand).length);
 assert.equal(JSON.stringify(rounds),before);n++;
}
const zero=()=>({rank:'K',suit:'♠',point:0});
const rounds=[{result:'和',cards:Array.from({length:6},zero)},{result:'和',cards:Array.from({length:6},zero)}];
const r=c.IntegratedAnalysis.recovery(rounds);assert.equal(r.avgRounds,'1.7');assert.equal(r.avgCards,'10.0');assert.equal(r.distribution.range16plus,10);assert.equal(r.maxCards,0);
const tail=[rounds[0],{result:'殘牌',cards:Array.from({length:4},zero)}];assert.equal(c.IntegratedAnalysis.recovery(tail).immediateRecovery,1);assert.equal(c.IntegratedAnalysis.recovery(tail).totalCards,10);assert.equal(c.analyzeShoeRecovery(tail).immediateRecovery,2);
assert.equal(c.IntegratedAnalysis.recovery([]),null);assert.equal(c.IntegratedAnalysis.safe([],{}),null);
const formula=fs.readFileSync(path.join(root,'traverse_builder.js'),'utf8');assert(formula.includes('Math.max(0, Math.round(R / 2) - forced)'));assert(!formula.includes('Math.round((R - ties) / 2)'));
console.log(`PASS ${n} fixture/config/cut parity cases; color independence; no mutation; tail boundaries; legacy failed-cut policy; empty and formula regressions`);
