// 範本命中即豁免候選檢查：配額或短段條件未過的候選仍要被暫採用，並在日誌記下原本未過的項目
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict'),{webcrypto}=require('crypto');
const ROOT=process.env.ATLL_ROOT||path.resolve(__dirname,'..'),fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'template-continuation-fixture.json'),'utf8')),config={suits:['♥','♦'],ranks:['10','J','Q','K']};
function context(candidates){
 const c=vm.createContext({console,setTimeout,clearTimeout,performance,TextEncoder,crypto:webcrypto,localStorage:{getItem:()=>null}});
 for(const f of ['standard/two_thirteen_reversals.js','card_color_rules.js','traverse_quota.js','traverse_red0_balance.js','traverse_tail_fill.js','traverse_builder.js','traverse_templates.js']){
  let s=fs.readFileSync(path.join(ROOT,f),'utf8');
  if(f==='traverse_builder.js')s=s.replace('        let chains = await phaseChain(segs, opts, ctx);',`        let chains = await phaseChain(segs, opts, ctx);if(global.__fixture){chains=global.__fixture.chains.map(c=>Object.assign(c.points.slice(),{parts:c.parts.slice(),secondParts:c.secondParts.slice()}));restCards=global.__fixture.pool.slice();const n=roundSizeCounts(chains.flat());opts.sizeTally={4:n[4],5:n[5],6:n[6]};opts.sizeUsedCards=416-restCards.length;opts.tieTally=n.tie;opts.specialTally=specialRoundCounts(chains.flat());}`);
  vm.runInContext(s,c);
 }
 c.__fixture=JSON.parse(JSON.stringify(fixture));c.TraverseTemplates.lookupAsync=async()=>candidates.map(p=>p.slice());return c;
}
function opts(extra={}){let seed=1139;return {idleLimit:1,computeTries:1,chainAttempts:1,minLen:8,maxLen:12,tripleTie:true,signalRule:true,signalConfig:config,sideLimit:2,red0Balance:true,fillSensitiveTail:true,
 rng:()=>{let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;},...extra};}
(async()=>{
 // 4／5／6張局上限全設0：舊版一定以「配額驗收未過」拒絕
 const logs=[],e=context([fixture.alternate]);
 const r=await e.TraverseBuilder.build(opts({sizeLimits:{4:{min:null,max:0},5:{min:null,max:0},6:{min:null,max:0}},onTemplateLog:m=>logs.push(m)}));
 assert(!logs.some(m=>m.includes('拒絕｜當前')),'不應再出現候選拒絕');
 assert(logs.some(m=>m.includes('候選 1 命中豁免｜原本未過：')&&m.includes('局數／和局／特殊局配額')),'應記下豁免的配額項目');
 assert(logs.some(m=>m.includes('候選 1/1 暫採用')),'候選應被暫採用');
 assert.equal(r.templateLibrary.selectedIndex,1);assert(r.templateLibrary.pointPassed>=1);
 console.log('PASS 配額未過的命中候選改為豁免並暫採用');
 // 剩牌原順序通常不是合格穿越段：舊版以短段條件拒絕，現在也要豁免
 const logs2=[],e2=context([fixture.pool]);const B2=e2.TraverseBuilder;
 const failsShort=!B2.qualifies(fixture.pool,true);
 await B2.build(opts({onTemplateLog:m=>logs2.push(m)}));
 assert(!logs2.some(m=>m.includes('拒絕｜當前')));
 assert(logs2.some(m=>m.includes('候選 1/1 暫採用')));
 if(failsShort)assert(logs2.some(m=>m.includes('命中豁免')&&m.includes('短段穿越')));
 console.log(`PASS 短段條件${failsShort?'未過':'已過'}的命中候選同樣暫採用`);
})().catch(err=>{console.error(err);process.exitCode=1;});
