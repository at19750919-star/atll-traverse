const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{performance}=require('node:perf_hooks');
const ROOT=path.resolve(__dirname,'..'),red0={suits:['♥','♦'],ranks:['10','J','Q','K']};
const rng=seed=>()=>{let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};
function engine(old=false){const ctx=vm.createContext({console,setTimeout,performance,Blob});for(const name of ['standard/two_thirteen_reversals.js','card_color_rules.js'])vm.runInContext(fs.readFileSync(path.join(ROOT,name),'utf8'),ctx);vm.runInContext(fs.readFileSync(old&&process.env.ATLL_BASELINE?process.env.ATLL_BASELINE:path.join(ROOT,'traverse_builder.js'),'utf8'),ctx);for(const name of ['traverse_red0_balance.js','traverse_tail_fill.js','traverse_export.js','standard/recovery_search.js','traverse_optimizer.js'])vm.runInContext(fs.readFileSync(path.join(ROOT,name),'utf8'),ctx);return ctx;}
const copy=x=>JSON.parse(JSON.stringify(x)),hist=cards=>cards.map(c=>c.point).sort((a,b)=>a-b).join(',');
function stock(cards){const faces={},backs={};for(const c of cards){const key=c.rank+c.suit;faces[key]=(faces[key]||0)+1;backs[key+c.back_color]=(backs[key+c.back_color]||0)+1;}assert.equal(Object.keys(faces).length,52);assert(Object.values(faces).every(n=>n===8));assert.equal(Object.keys(backs).length,104);assert(Object.values(backs).every(n=>n===4));}
async function main(){const old=engine(true),next=engine(),B=next.TraverseBuilder,T=next.TraverseTailFill;
 Object.assign(B.rules,{tripleTie:false,signalRule:true,signalConfig:red0,skipBanker6:false,skipPlayer7:false});
 const hands=B.allSensitiveHands(),safe=size=>hands.find(h=>h.length===size&&B.simulateHand(h,0,h.length).result!=='和'&&!B.isTriple(h));
 for(const n of [0,1,2,3,7]){const r=await T.fill(new Array(n).fill(0),{tripleTie:false,rng:rng(1)});assert.equal(r.ok,n===0);if(n)assert.equal(r.status,'infeasible');}
 for(const n of [4,5,6]){const input=Array.from(safe(n)),saved=input.slice(),out=await T.fill(input,{tripleTie:false,rng:rng(2)});assert(out.ok);assert.equal(out.rounds.flat().length,n);assert.deepEqual(input,saved);assert(out.rounds.every(h=>B.handSensitive(h)&&B.simulateHand(h,0,h.length).size===h.length));}
 const twentyFive=[...safe(4),...safe(5),...safe(5),...safe(5),...safe(6)];const filled=await T.fill(twentyFive,{tripleTie:false,rng:rng(3)});assert(filled.ok);assert.equal(filled.rounds.flat().length,25);assert(filled.maxBatch>1);
 const impossible=await T.fill(new Array(8).fill(0),{tripleTie:false,rng:rng(1),budgetMs:100});assert(!impossible.ok);assert.equal(impossible.unprocessed,8);
 const zeroQuota=await T.fill(Array.from(safe(4)),{tripleTie:false,sizeLimits:B.normalizeSizeLimits({4:{max:0}}),rng:rng(1),budgetMs:100});assert(!zeroQuota.ok);
 let stop=true;const stopped=await T.fill(new Array(25).fill(0),{tripleTie:false,rng:rng(1)},{cancelled:()=>stop});assert.equal(stopped.status,'cancelled');
 console.log('PASS 0/1-3/4-6/25, batch>1, no original-chain absorption, all-six cannot absorb, zero cap and cancellation');
 const build=(e,seed,opts,fill)=>e.TraverseBuilder.build({rng:rng(seed),signalConfig:red0,signalRule:true,red0Balance:true,fillSensitiveTail:fill,sideLimit:2,idleLimit:100,computeTries:1000,chainAttempts:2,rejectAbove:25,...opts});
 await build(old,106,{tripleTie:false},false);await build(next,106,{tripleTie:false},true);
 const rows=[],cases=[...[101,102,103,104,105,106].map(seed=>({seed,opts:{tripleTie:false,secondStart:false}})),{seed:104,opts:{tripleTie:true,secondStart:false}},{seed:104,opts:{tripleTie:false,secondStart:true}},{seed:104,opts:{tripleTie:true,secondStart:true}},{seed:103,opts:{tripleTie:false,rejectAbove:10}},{seed:1139,opts:{tripleTie:true,secondStart:false,idleLimit:1000,computeTries:20000,chainAttempts:20,rejectAbove:0}}];
 let exported=null;
 for(let i=0;i<cases.length;i++){
  const {seed,opts}=cases[i];let a,b;if(i%2){b=await build(next,seed,opts,true);a=await build(old,seed,opts,false);}else{a=await build(old,seed,opts,false);b=await build(next,seed,opts,true);}
  const inspect=(e,r)=>{if(!r.cards)return {rejected:true,left:r.leftoverCount,tail:r.tailFill,status:r.rejectionKind||'leftover-limit',ms:r.stats.ms};stock(r.cards);const full=e.TraverseTailFill.validate(r.cards,{...opts,signalRule:true,signalConfig:red0});return {left:r.leftoverCount,tail:r.tailFill,full,signal:r.signal?.ok,chains:r.chains.every(c=>c.qualified),ms:r.stats.ms,recovery:e.TraverseOptimizer.measureRecovery(e.TraverseOptimizer.prepare(r)).score,plan:r.signalBalance?.status};};
  const before=inspect(old,a),after=inspect(next,b);assert.equal(a.leftoverCount,b.leftoverCount,'original remaining-pool threshold/definition unchanged');
  if(b.cards){assert.deepEqual(copy(b.chains.map(c=>[c.start,c.length,c.parts,c.secondParts])),copy(a.chains.map(c=>[c.start,c.length,c.parts,c.secondParts])));for(const c of b.chains){assert.equal(hist(b.cards.slice(c.start-1,c.start-1+c.length)),hist(a.cards.slice(c.start-1,c.start-1+c.length)));}if(b.tailFill.fullOk){assert(after.full.ok&&after.signal&&after.chains);assert.equal(b.tailFill.unprocessed,0);assert.equal(b.cards.filter(c=>c.sensitiveFill).length,b.leftoverCount);const rs=next.TraverseExport.dealRounds(next.TraverseOptimizer.prepare(b));assert(rs.every(r=>r.hand));assert.equal(rs.filter(r=>r.segment==='敏感補排').length,b.tailFill.roundCount);exported??=b;}}
  if(seed===103&&opts.rejectAbove===10){assert.equal(b.tailFill,undefined);assert(b.rejected);}
  rows.push({seed,options:opts,before,after});console.log(JSON.stringify(rows.at(-1)));
 }
 assert(exported,'must demonstrate actual successful full 416-card shoe');
 const bounded=[];
 for(const [label,e,fill]of [['baseline',old,false],['new',next,true]]){const started=performance.now(),deadline=started+8000;let attempts=0,retries=0,success=false;const reasons=[];
  for(const seed of [101,102,103,104,105,106]){if(performance.now()>=deadline)break;attempts++;const r=await build(e,seed,{tripleTie:false,secondStart:false,isCancelled:()=>performance.now()>=deadline},fill);const valid=r.cards&&e.TraverseTailFill.validate(r.cards,{tripleTie:false,signalRule:true,signalConfig:red0});if(performance.now()<deadline&&valid?.ok&&r.chains.every(c=>c.qualified)){success=true;break;}retries++;reasons.push(r.tailFill?.reason||valid?.reason||'剩牌上限');}
  bounded.push({label,attempts,retries,success,ms:performance.now()-started,reasons});
 }
 console.log('BOUNDED '+JSON.stringify(bounded));
 const unlimited=await build(next,104,{tripleTie:false,sideLimit:null},true);assert(unlimited.tailFill.fullOk);assert.equal(unlimited.signalBalance.target,null);console.log('PASS blank side limit retains no side constraint with strict full-shoe signals');

 // Existing A2 behavior remains byte-identical when this feature is disabled.
 const a2={signalConfig:{suits:['♠','♥','♦','♣'],ranks:['A','2']},red0Balance:false,fillSensitiveTail:false,rejectAbove:null};const a=await build(old,101,a2,false),b=await build(next,101,a2,false);assert.deepEqual(copy(a.cards),copy(b.cards));
 const excelPath=path.join(process.env.USERPROFILE,'OneDrive','Desktop','專案-進行中','百家3.0','node_modules','exceljs');
 if(fs.existsSync(excelPath)){const ExcelJS=require(excelPath);global.ExcelJS=ExcelJS;require('../traverse_export.js');const nativeCards=copy(next.TraverseOptimizer.prepare(exported));const blob=await global.TraverseExport.buildWorkbook(global.TraverseExport.dealRounds(nativeCards),{signalConfig:red0});const wb=new ExcelJS.Workbook();await wb.xlsx.load(await blob.arrayBuffer());let marked=0;wb.worksheets[1].eachRow((r,i)=>{if(i>1&&r.getCell(2).value==='敏感補排')marked++;});assert.equal(marked,exported.tailFill.roundCount);console.log('PASS workbook sensitive-tail labels');}
 console.log('PASS original chain point sets/boundaries, 52 faces x8, full sensitivity/signal/circle, A2 unchanged');
 const report={bounded,method:'11 fixed candidates, alternating baseline/new; same bounds and seeds; no claim that arbitrary quotas always finish. Failed fill/full-validation remains failed. Recovery is measured after each actual arrangement.',rows};if(process.env.ATLL_REPORT)fs.writeFileSync(process.env.ATLL_REPORT,JSON.stringify(report,null,2));console.log('SUMMARY '+JSON.stringify({candidates:rows.length,filled:rows.filter(r=>r.after.tail?.ok).length,full:rows.filter(r=>r.after.tail?.fullOk).length,baselineFull:rows.filter(r=>r.before.full?.ok&&r.before.chains).length}));
}
main().catch(e=>{console.error(e);process.exitCode=1});
