// Fixtures: run test-red0-recovery.cjs first. All browser work uses a fresh profile.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=process.env.ATLL_ROOT||path.resolve(__dirname,'..');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const p=await browser.newPage();await p.route('https://script.google.com/**',r=>r.abort());await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:''}));
 const excel=path.join(process.env.CODEX_NODE_MODULES||'','exceljs/dist/exceljs.min.js');if(fs.existsSync(excel))await p.route('https://cdn.jsdelivr.net/npm/exceljs@*/dist/exceljs.min.js',r=>r.fulfill({path:excel,contentType:'text/javascript'}));
 await p.goto(require('node:url').pathToFileURL(path.join(root,'integrated.html')).href);await p.click('#modeRed0');
 const fixtures=JSON.parse(fs.readFileSync(path.join(__dirname,'validation/red0-recovery-results.json'))).filter(x=>x.variant==='new'&&!x.case.mode&&x.signature&&JSON.parse(x.signature).length).slice(0,6);
 const result=await p.evaluate(async fixtures=>{
  const rows=[];let pairs=0,equalities=0,cancelTest=false;
  for(const fixture of fixtures){
   for(const id of ['avgRecoveryLimit','maxSideLimit','maxTieLimit','maxFourCardRate','max7PtReversal','maxBankerSixWin','maxTwoThirteenReversal','swapBanker6Target','st4Min','st4Max','st5Min','st5Max','st6Min','st6Max'])document.getElementById(id).value='';
   document.getElementById('avgRecoveryLimit').value=2.5;document.getElementById('lastCardNine').checked=false;document.getElementById('tripleTieRule').checked=fixture.case.triple;CARD_COLOR_MIXED_MODE=false;
   const rs=JSON.parse(fixture.signature).map(r=>({...r,cards:r.cards.map(c=>Object.assign(new Card(c.rank,c.suit,c.pos),{back_color:c.back_color}))}));
   const original=JSON.stringify(rs),search=RecoverySearch.search;let captured;
   RecoverySearch.search=async(rounds,o)=>{captured=o;return {rounds,checks:0,improvements:0,exhausted:true};};
   const work={};try{await finalizeRed0Recovery(rs,{work});}finally{RecoverySearch.search=search;}
   if(!captured||!work.best)continue;
   const base=work.best.rounds,before=RecoverySearch.measure(base).sum,baseSnapshot=JSON.stringify(base),cases=[];
   // Same frozen starting shoe; interleaved runs, with no random generation in between.
   for(let repeat=0;repeat<3;repeat++)for(const plateau of repeat%2?[true,false]:[false,true]){
    let working=base,state={},visited=new Set(),sum=before,checks=0,branches=0,branchChecks=0;const start=performance.now();
    for(let batch=0;batch<2;batch++){
     const r=await search(working,{...captured,budgetMs:90,maxChecks:128,plateau,state,visited,accept:async(candidate,stepBase,context)=>{
      const faces=r=>r.cards.map(c=>c.rank+':'+c.suit).sort().join('|');
      if(candidate.some((r,i)=>faces(r)!==faces(base[i])))throw Error('cross-round cards');
      if(candidate.filter((r,i)=>r.cards.map(c=>c.point()).join(',')!==stepBase[i].cards.map(c=>c.point()).join(',')).length>2)throw Error('more than pair in a step');pairs++;
      const value=RecoverySearch.measure(candidate).sum;if(context.equal&&value!==sum)throw Error('rounded or worse equality');
      const accepted=await captured.accept(candidate,stepBase,context);
      if(accepted&&(!validateStandardGeneratedShoe(accepted,{deferRecovery:true}).ok||calculateCardColorViolations(accepted)))throw Error('illegal branch');
      return accepted;
     }});
     checks+=r.checks;branches+=r.equalBranches;branchChecks+=r.branchChecks;
     const actual=analyzeShoeRecovery(r.rounds).recoveryDetails.reduce((s,x)=>s+x.roundsUsed,0);
     if(actual>sum)throw Error('worse best returned');if(actual<sum){working=r.rounds;sum=actual;state={};}
     if(r.exhausted)break;
    }
    if(state.branches?.length>2||state.equalChecks>8)throw Error('unbounded branches');equalities+=branches;
    cases.push({plateau,repeat,before:before/416,after:sum/416,ms:performance.now()-start,checks,branches,branchChecks});
   }
   // Cancel after an equal branch is validated: no speculative layout may escape.
   let stopped=false;const cancelState={};const cancelled=await search(base,{...captured,state:cancelState,visited:new Set(),budgetMs:100,maxChecks:128,shouldStop:()=>stopped,accept:async(...args)=>{const valid=await captured.accept(...args);if(valid&&args[2]?.equal)stopped=true;return valid;}});
   if(stopped){if(!cancelled.cancelled||JSON.stringify(cancelled.rounds)!==baseSnapshot)throw Error('cancelled branch escaped');cancelTest=true;}
   if(JSON.stringify(rs)!==original||JSON.stringify(base)!==baseSnapshot)throw Error('input mutated');
   rows.push({seed:fixture.case.seed,triple:fixture.case.triple,cases});
  }
  return {rows,pairs,equalities,cancelTest};
 },fixtures);
 assert(result.pairs>0&&result.equalities>0&&result.cancelTest);fs.writeFileSync(path.join(__dirname,'validation/recovery-plateau-results.json'),JSON.stringify(result,null,2));
 for(const r of result.rows)console.log(JSON.stringify(r));console.log('PASS exact equality, two-round ownership, original validation, repaired color, bounded branches, private best, cancellation '+JSON.stringify({pairs:result.pairs,equalities:result.equalities}));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
