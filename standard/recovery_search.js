// Point-only cut simulation for ranking candidates. Final acceptance uses the original analyzer.
(function(root){
 'use strict';
 function measure(rounds, trace=false){
  const points=[],starts=[],owner=[];
  rounds.forEach((r,i)=>{starts.push(points.length);r.cards.forEach(c=>{points.push(c.point());owner.push(i)});});
  const n=points.length,mask=new Uint8Array(n),sizes=new Uint8Array(n);starts.forEach(x=>mask[x]=1);
  if(!n)return {score:Infinity,sum:0,cuts:[],owner:[],totalCards:0};
  for(let i=0;i<n;i++){
   const p=(points[i]+points[(i+2)%n])%10,b=(points[(i+1)%n]+points[(i+3)%n])%10,t=points[(i+4)%n];
   sizes[i]=p>=8||b>=8?4:p<=5?(b<=2||b===3&&t!==8||b===4&&t>=2&&t<=7||b===5&&t>=4&&t<=7||b===6&&(t===6||t===7)?6:5):b<=5?5:4;
  }
  let sum=0;const cuts=[];
  for(let cut=0;cut<n;cut++){
   if(mask[cut]){if(trace)cuts.push({cutPoint:cut,roundsUsed:0,route:[]});continue;}
   let used=0,r=0,recovered=false;const route=trace?[]:null;
   while(used<n&&r<rounds.length*2){const at=(cut+used)%n,size=sizes[at];if(used+size>n)break;if(trace)route.push(at);used+=size;r++;if(mask[(cut+used)%n]){recovered=true;break;}}
   sum+=r;if(trace)cuts.push({cutPoint:cut,roundsUsed:r,failed:!recovered,route});
  }
  return {score:sum/n,sum,cuts,owner,totalCards:n};
 }
 function hotPairs(info){
  if(!info.owner.length)return {worst:[],pairs:[]};
  const hot=new Array(Math.max(...info.owner)+1).fill(0),worst=info.cuts.filter(x=>x.roundsUsed).sort((a,b)=>b.roundsUsed-a.roundsUsed).slice(0,8);
  for(const c of worst)for(const at of c.route)for(let k=0;k<6;k++)hot[info.owner[(at+k)%info.totalCards]]+=c.roundsUsed;
  const top=hot.map((v,i)=>({v,i})).sort((a,b)=>b.v-a.v).slice(0,6),pairs=new Map();
  for(const {i} of top)for(const j of [(i+1)%hot.length,(i+hot.length-1)%hot.length,...top.slice(0,3).map(x=>x.i)]){
   if(i===j)continue;const a=Math.min(i,j),b=Math.max(i,j);pairs.set(`${a}/${b}`,{a,b,weight:hot[a]+hot[b]});
  }
  return {worst:worst.map(c=>({cutPoint:c.cutPoint,roundsUsed:c.roundsUsed,failed:c.failed})),pairs:[...pairs.values()].sort((a,b)=>b.weight-a.weight).slice(0,12)};
 }
 // Each candidate is relative to this immutable base. The first changed transition
 // must occur on the old path; after that transition we simulate the entire new path.
 function createEvaluator(rounds){
  const points=[],starts=[],owner=[];
  rounds.forEach((r,i)=>{starts.push(points.length);r.cards.forEach(c=>{points.push(c.point());owner.push(i);});});
  const n=points.length,mask=new Uint8Array(n),sizes=new Uint8Array(n),reverse=Array.from({length:n},()=>[]);
  starts.forEach(at=>mask[at]=1);
  const sizeAt=(p,i)=>{const a=(p[i]+p[(i+2)%n])%10,b=(p[(i+1)%n]+p[(i+3)%n])%10,t=p[(i+4)%n];return a>=8||b>=8?4:a<=5?(b<=2||b===3&&t!==8||b===4&&t>=2&&t<=7||b===5&&t>=4&&t<=7||b===6&&(t===6||t===7)?6:5):b<=5?5:4;};
  for(let i=0;i<n;i++)sizes[i]=sizeAt(points,i);
  const walk=(cut,table,dependency)=>{
   if(mask[cut])return {cutPoint:cut,roundsUsed:0,route:[]};
   let used=0,r=0,recovered=false;const route=[];
   while(used<n&&r<rounds.length*2){
    const at=(cut+used)%n,size=table[at];
    // Include an attempted overflow transition: a shorter candidate may fit here.
    if(dependency)reverse[at].push(cut);
    if(used+size>n)break;
    route.push(at);used+=size;r++;
    if(mask[(cut+used)%n]){recovered=true;break;}
   }
   return {cutPoint:cut,roundsUsed:r,failed:!recovered,route};
  };
  const cuts=Array.from({length:n},(_,cut)=>walk(cut,sizes,true)),sum=cuts.reduce((s,c)=>s+c.roundsUsed,0);
  const base={sum,score:n?sum/n:Infinity,cuts,owner,totalCards:n};
  return {base,evaluate(candidate,changedRounds){
   if(candidate.length!==rounds.length||candidate.some((r,i)=>r.cards.length!==rounds[i].cards.length))return measure(candidate,true);
   const next=points.slice(),touched=new Set();
   for(const i of changedRounds||candidate.map((_,i)=>i))for(let k=0;k<candidate[i].cards.length;k++){
    const at=starts[i]+k,value=candidate[i].cards[k].point();
    if(value!==points[at]){next[at]=value;for(let offset=0;offset<5;offset++)touched.add((at-offset+n)%n);}
   }
   const table=sizes.slice(),affected=new Set();
   for(const at of touched){const value=sizeAt(next,at);if(value!==sizes[at]){table[at]=value;for(const cut of reverse[at])affected.add(cut);}}
   const result=cuts.slice();let total=sum;
   for(const cut of affected){result[cut]=walk(cut,table,false);total+=result[cut].roundsUsed-cuts[cut].roundsUsed;}
   return {sum:total,score:n?total/n:Infinity,cuts:result,owner,totalCards:n,recomputedCuts:affected.size,reusedCuts:n-affected.size};
  }};
 }
 async function search(rounds,o){
  const deadline=performance.now()+(o.budgetMs??100),visited=o.visited||new Set(),state=o.state||{};
  const fingerprint=rs=>rs.flatMap(r=>r.cards.map(c=>c.point())).join(',');
  const initial=createEvaluator(rounds),bestScore=initial.base.score,bestSum=initial.base.sum;
  state.branches??=[];state.layouts??=new Set([fingerprint(rounds)]);state.equalChecks??=0;state.orders??=new Map();
  let checks=0,improvements=0,rankingChecks=0,equalBranches=0,branchChecks=0,yieldAt=performance.now()+8,exhausted=true;
  let focus=hotPairs(initial.base);
  const stopped=()=>o.shouldStop?.()===true;
  const result=(extra={})=>({rounds,score:bestScore,checks,improvements,rankingChecks,equalBranches,branchChecks,focus,exhausted,...extra});
  const pause=async()=>{if(performance.now()>=yieldAt){await new Promise(r=>setTimeout(r,0));yieldAt=performance.now()+8;}};
  await new Promise(r=>setTimeout(r,0));
  // At most two equal-score layouts per incumbent, shared across its bounded batches.
  for(let branch=-1;branch<state.branches.length;branch++){
   const entry=branch<0?null:state.branches[branch];if(entry?.done)continue;
   const working=entry?entry.rounds:rounds,evaluator=entry?createEvaluator(working):initial;
   const branchFocus=hotPairs(evaluator.base),baseKey=fingerprint(working),startChecks=checks;
   const allowance=o.plateau===false?(o.maxChecks??128):branch<0?Math.ceil((o.maxChecks??128)/2):Math.floor((o.maxChecks??128)/4);
   let complete=true;
   const alternatives=async i=>{
   const cacheKey=baseKey+'|'+i;if(state.orders.has(cacheKey))return state.orders.get(cacheKey);
   const orders=await o.orders(working[i],i,deadline),ranked=[];
   for(const cards of orders){if(stopped()||performance.now()>=deadline)break;const t=working.slice();t[i]={...t[i],cards};ranked.push({cards,score:evaluator.evaluate(t,[i]).score});rankingChecks++;await pause();}
   ranked.sort((a,b)=>a.score-b.score);
   const selected=[working[i].cards,...ranked.slice(0,6).map(x=>x.cards),...ranked.slice(-1).map(x=>x.cards)];
   const seen=new Set(),out=selected.filter(cards=>{const k=cards.map(c=>c.point()).join(',');if(seen.has(k))return false;seen.add(k);return true;});if(!stopped()&&performance.now()<deadline)state.orders.set(cacheKey,out);return out;
   };
   pairs:for(const {a,b} of branchFocus.pairs){
   if(stopped())return result({cancelled:true});
   if(performance.now()>=deadline)return result({exhausted:false});
   const left=await alternatives(a),right=await alternatives(b);
   for(const ca of left){for(const cb of right){
    if(stopped())return result({cancelled:true});
    if(performance.now()>=deadline||checks>=(o.maxChecks??128))return result({exhausted:false});
    if(checks-startChecks>=allowance){complete=false;break pairs;}
    const key=[baseKey,a,b,ca.map(c=>c.point()).join(','),cb.map(c=>c.point()).join(',')].join('|');if(visited.has(key))continue;visited.add(key);
    const candidate=working.slice();candidate[a]={...working[a],cards:ca};candidate[b]={...working[b],cards:cb};checks++;if(entry)branchChecks++;
    const value=evaluator.evaluate(candidate,[a,b]);
    const equal=o.plateau!==false&&value.sum===bestSum&&state.branches.length<2&&state.equalChecks<8;
    const layout=equal?fingerprint(candidate):null;
    if(value.sum<bestSum||equal&&!state.layouts.has(layout)){
     if(equal)state.equalChecks++;
     const valid=await o.accept(candidate,working,{equal,branch:branch>=0});if(stopped())return result({cancelled:true});
     if(valid){
      // Repair may change cards; verify the exact sum again before improving or branching.
      const actual=measure(valid,true);
      if(actual.sum<bestSum){improvements++;focus=branchFocus;return result({rounds:valid,score:actual.score,exhausted:false});}
      if(equal&&actual.sum===bestSum){const repairedKey=fingerprint(valid);if(!state.layouts.has(repairedKey)){state.layouts.add(repairedKey);state.branches.push({rounds:valid,done:false});equalBranches++;}}
     }
    }
    await pause();
   }}
   }
   if(entry)entry.done=complete;
   if(!complete)exhausted=false;
  }
  return result();
 }
 root.RecoverySearch={measure,hotPairs,search,createEvaluator};if(typeof module!=='undefined')module.exports=root.RecoverySearch;
})(typeof window!=='undefined'?window:globalThis);
