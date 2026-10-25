// Isolated browser tests. No existing browser profile or cloud endpoint is used.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=process.env.ATLL_ROOT||path.resolve(__dirname,'..'),base=process.env.ATLL_BASE_ROOT;
const cases=[{seed:5,triple:false}];
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true}),rows=[];
async function open(dir,c){const p=await browser.newPage();p.errors=[];p.on('pageerror',e=>p.errors.push(e.message));await p.route('https://script.google.com/**',r=>r.abort());await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:''}));const excel=path.join(process.env.CODEX_NODE_MODULES||'','exceljs/dist/exceljs.min.js');if(fs.existsSync(excel))await p.route('https://cdn.jsdelivr.net/npm/exceljs@*/dist/exceljs.min.js',r=>r.fulfill({path:excel,contentType:'text/javascript'}));await p.goto(pathToFileURL(path.join(dir,'integrated.html')).href);await p.click('#'+(c.mode||'modeRed0'));
await p.evaluate(c=>{const trav=c.mode==='modeTraverse';for(const id of ['avgRecoveryLimit','maxSideLimit','maxTieLimit','maxFourCardRate','max7PtReversal','maxBankerSixWin','maxTwoThirteenReversal','swapBanker6Target','st4Min','st4Max','st5Min','st5Max','st6Min','st6Max','tvLeft','tvSideLimit','tvTieMax','tvBankerSixMax','tvSevenReversalMax','tvRareReversalMax'])document.getElementById(id).value='';document.getElementById('avgRecoveryLimit').value=c.limit||'';document.getElementById(trav?'tvTriple':'tripleTieRule').checked=c.triple;document.getElementById(trav?'tvNine':'lastCardNine').checked=false;if(trav){document.getElementById('tvMin').value=4;document.getElementById('tvMax').value=4;}if(c.aggregate)for(const [id,v]of Object.entries({avgRecoveryLimit:4.5,maxSideLimit:4,maxTieLimit:4,maxFourCardRate:30,max7PtReversal:2,swapBanker6Target:9}))document.getElementById(id).value=v;
let s=c.seed;window.__rng=0;Math.random=()=>{__rng++;let t=s+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};window.__packs=0;window.__opts=0;window.__post=[];window.__display=null;const pack=pack_all_sensitive_and_segment,opt=optimizeRecoveryInRounds,display=updateRecoveryDisplay;window.pack_all_sensitive_and_segment=(...a)=>{if(__packs>=4){window.__stopGenerateRequested=true;throw Error('four candidate test cap');}__packs++;return pack(...a)};window.optimizeRecoveryInRounds=(...a)=>{__opts++;return opt(...a)};window.updateRecoveryDisplay=r=>{__display=r;return display(r)};
if(typeof finalizeRed0Recovery==='function'){const finalize=finalizeRed0Recovery;window.finalizeRed0Recovery=async(rounds,...a)=>{const original=JSON.stringify(rounds),r=await finalize(rounds,...a);if(JSON.stringify(rounds)!==original)throw Error('final search mutated fallback');__post.push({...r,rounds:undefined,recovery:undefined});return r;};}
},c);return p;}
async function run(dir,c,variant){const p=await open(dir,c),t=Date.now();if(c.mode==='modeTraverse'){await p.click('#chipGen');await p.waitForFunction(()=>!__isGeneratingShoe,null,{timeout:30000});}else await p.evaluate(()=>generateShoe());const ms=Date.now()-t;
const r=await p.evaluate(()=>({cards:currentRounds?.flatMap(r=>r.cards).length||0,packs:__packs,opts:__opts,post:__post,rng:__rng,signature:JSON.stringify(currentRounds),recovery:currentRounds?.length?analyzeShoeRecovery(currentRounds):null,display:__display,avgText:document.getElementById('recoveryAvg')?.textContent,validation:currentRounds?.length?validateStandardGeneratedShoe(currentRounds):null,color:currentRounds?.length?calculateCardColorViolations(currentRounds):null}));r.ms=ms;r.case=c;r.variant=variant;assert.deepEqual(p.errors,[]);if(r.cards&&c.mode!=='modeTraverse'){assert.equal(r.cards,416);assert(r.validation.ok,JSON.stringify(r.validation));assert.equal(r.color,0);assert.deepEqual(r.recovery,r.display);assert(r.avgText.includes(r.recovery.avgRounds));}if(variant==='new'&&(c.mode==='modeA2'||c.mode==='modeTraverse'))assert.equal(r.post.length,0);
rows.push(r);console.log(JSON.stringify({variant,...c,ms,cards:r.cards,packs:r.packs,opts:r.opts,post:r.post,avg:r.recovery?.avgRounds}));await p.close();return r;}
try{
for(const c of cases){let old;if(base)old=await run(base,c,'old');const r=await run(root,c,'new');if(old&&c.mode){assert.equal(r.signature,old.signature);assert.equal(r.rng,old.rng);assert.deepEqual(r.recovery,old.recovery);}if(!c.mode&&!c.aggregate&&c.limit!==3){assert.equal(r.cards,416);assert(r.post.length);assert(r.post.at(-1).after<=r.post.at(-1).before);}if(c.aggregate){assert(r.packs<=4);assert(r.opts<=r.packs);if(r.cards)assert(r.validation.ok);}}
const p=await open(root,{seed:5,triple:false});await p.evaluate(()=>generateShoe());
const proof=await p.evaluate(async()=>{
 const published=JSON.stringify(currentRounds),original=cloneRoundsDeep(currentRounds);
 const search=RecoverySearch.search;
 let pairCandidates=0;
 RecoverySearch.search=async(rounds,options)=>search(rounds,{...options,accept:async(candidate,stepBase=rounds,context)=>{
  const faces=r=>r.cards.map(c=>c.rank+':'+c.suit).sort().join('|');
  if(candidate.length!==rounds.length||candidate.some((r,i)=>faces(r)!==faces(rounds[i])))throw Error('cards moved between rounds');
  if(candidate.filter((r,i)=>r.cards.map(c=>c.point()).join(',')!==stepBase[i].cards.map(c=>c.point()).join(',')).length>2)throw Error('more than two rounds changed in one step');
  pairCandidates++;return options.accept(candidate,stepBase,context);
 }});
 const compare=rs=>{const fast=RecoverySearch.measure(rs,true),slow=analyzeShoeRecovery(rs);if(fast.sum!==slow.recoveryDetails.reduce((s,c)=>s+c.roundsUsed,0))throw Error('sum mismatch');for(let i=0;i<416;i++)if(fast.cuts[i].roundsUsed!==slow.recoveryDetails[i].roundsUsed)throw Error('cut mismatch');};
 compare(original);for(let i=0;i<12;i++){const r=cloneRoundsDeep(original),cards=r[i].cards;[cards[0],cards[2]]=[cards[2],cards[0]];compare(r);}
 document.getElementById('avgRecoveryLimit').value=2.5;
 const work={},first=await finalizeRed0Recovery(original,{work}),score=work.best?.score,visited=work.best?.visited.size;
 const worse=cloneRoundsDeep(original);const second=await finalizeRed0Recovery(worse,{work});
 if(!work.best||work.best.score>score||work.best.batches>2)throw Error('incumbent lost or repeated without bound');
 if(JSON.stringify(currentRounds)!==published||JSON.stringify(original)!==published)throw Error('unqualified working shoe published or source changed');
 if(!validateStandardGeneratedShoe(work.best.rounds,{deferRecovery:true}).ok||calculateCardColorViolations(work.best.rounds))throw Error('invalid incumbent');
 const recolored=cloneRoundsDeep(original),all=recolored.flatMap(r=>r.cards);let made=false;
 for(let i=0;i<all.length&&!made;i++)for(let j=i+1;j<all.length&&!made;j++){
  if(all[i].rank!==all[j].rank||all[i].suit!==all[j].suit||all[i].back_color===all[j].back_color)continue;
  [all[i].back_color,all[j].back_color]=[all[j].back_color,all[i].back_color];
  if(calculateCardColorViolations(recolored))made=true;else [all[i].back_color,all[j].back_color]=[all[j].back_color,all[i].back_color];
 }
 if(!made)throw Error('missing color repair fixture');const repairWork={},snapshot=JSON.stringify(recolored);
 await finalizeRed0Recovery(recolored,{work:repairWork});
 if(!repairWork.best||calculateCardColorViolations(repairWork.best.rounds)||JSON.stringify(recolored)!==snapshot)throw Error('repairable fallback discarded');
 let timerTicks=0;const tick=setInterval(()=>timerTicks++,1),signature=JSON.stringify(work.best.rounds);
 const cancelled=await RecoverySearch.search(work.best.rounds,{shouldStop:()=>true,orders:async()=>[],accept:async()=>null});clearInterval(tick);
 if(!cancelled.cancelled||JSON.stringify(work.best.rounds)!==signature)throw Error('cancel changed incumbent');
 return {firstOk:first.ok,secondOk:second.ok,best:work.best.score,score,visited,afterVisited:work.best.visited.size,secondChecks:second.jointChecks,pairCandidates};
});assert.equal(proof.secondChecks,0);assert(proof.best<=proof.score);console.log('PASS per-cut analyzer equality, private best retention, no repeated exhausted search, cancelled joint search '+JSON.stringify(proof));await p.close();
fs.mkdirSync(path.join(__dirname,'validation'),{recursive:true});fs.writeFileSync(path.join(__dirname,'validation/targeted-recovery-results.json'),JSON.stringify(rows,null,2));console.log('PASS targeted recovery: inventory, original rules, color, display, isolation, mode scope, stop/clear/restart');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
