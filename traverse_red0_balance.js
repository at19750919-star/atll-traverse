// Target planning for traverse red-0 only. Never changes the ordinary-mode solver.
(function(root){
 'use strict';
 const enabled=config=>config?.suits?.length===2&&['♥','♦'].every(s=>config.suits.includes(s))&&config?.ranks?.length===4&&['10','J','Q','K'].every(r=>config.ranks.includes(r));
 async function plan(chains,leftover,physical,options={},context={}){
  const B=root.TraverseBuilder,seq=chains.flat().concat(leftover),n=seq.length,D=options.sideTarget===null&&options.strictTail?416:options.sideTarget;
  const start=performance.now(),deadline=start+(options.balanceBudgetMs??1500);
  const stats={kind:'traverse-red0-target',nodes:0,validations:0,truncated:false,ms:0,prefixRowsReused:0,prefixRowsBuilt:0,prefixChecksReused:0};
  const end=(status,reason,extra={})=>({...stats,ok:status==='solved',status,reason,ms:performance.now()-start,...extra});
  if(context.cancelled?.())return end('cancelled','使用者停止');
  if(!enabled(B.rules.signalConfig)||!Number.isInteger(D)||D<0)return end('disabled','未啟用穿越紅0差距目標');
  if(n!==416||physical.length!==n)return end('invalid','必須保留完整416張牌');
  const inventory=new Map();physical.forEach(c=>{const key=[c.rank,c.suit,c.back_color].join('/');inventory.set(key,(inventory.get(key)||0)+1);});
  if(inventory.size!==104||[...inventory.values()].some(count=>count!==4))return end('invalid','牌面、花色與紅藍背牌庫不是完整八副牌');
  const isSignal=c=>B.isSignalCard(c),zeros=physical.flatMap((c,i)=>c.point===0?[i]:[]),signals=zeros.filter(i=>isSignal(physical[i])).length;
  if(zeros.length!==128||signals!==64||physical.some((c,i)=>c.point!==seq[i]||isSignal(c)&&c.point!==0))return end('invalid','紅0／0點牌庫與點數骨架不符');
  const rounds=[];let used=0;
  while(used<n){const h=B.simulateHand(seq,used,n);if(!h)break;const points=seq.slice(used,used+h.size);rounds.push({start:used,size:h.size,result:h.result,trip:B.rules.tripleTie&&B.isTriple(points),cap:points.filter(p=>p===0).length});used+=h.size;}
  const N=rounds.length,minB=Math.max(0,Math.ceil((N-D)/2)),maxB=Math.min(N,Math.floor((N+D)/2));
  Object.assign(stats,{rounds:N,target:options.sideTarget,minB,maxB,signals});
  if(N<2||minB>maxB)return end('infeasible','完整局數與差距上限的奇偶條件無可行莊局數');
  // A single immutable-prefix cache per builder search. It stores no cards,
  // chosen plan, failure status, deadline or tail-specific first boundary row.
  const prefixPreparationStart=performance.now(),prefixCache=options.prefixPlanCache,prefixKey=JSON.stringify([chains.map(ch=>[Array.from(ch),ch.parts,ch.secondParts,ch.secondStart]),B.rules]);
  let prefixData=prefixCache?.owner===B&&prefixCache.key===prefixKey?prefixCache.value:null;
  if(prefixData)stats.prefixChecksReused=chains.length;
  const chainEnds=[];let off=0;
  for(const ch of chains){off+=ch.length;chainEnds.push(off);if(!prefixData&&!B.qualifiesFinal(ch))return end('invalid','原接段尚未通過穿越驗收，不修改生成器規則');}
  const traverseEnd=off;
  if(!prefixData){prefixData={rows:new Map()};if(prefixCache){prefixCache.owner=B;prefixCache.key=prefixKey;prefixCache.value=prefixData;}}
  const rows=rounds.map((r,i)=>{
   if(i>0&&r.start<traverseEnd&&prefixData.rows.has(i)){stats.prefixRowsReused++;return prefixData.rows.get(i);}
   const previous=rounds[(i+N-1)%N],points=seq.slice(r.start,r.start+r.size),choices=[];
   const ci=chainEnds.findIndex(to=>r.start<to);
   if(ci>=0&&r.start+r.size>chainEnds[ci])return [];
   const tail=r.start>=traverseEnd&&!options.strictTail,sw=points.slice();[sw[0],sw[1]]=[sw[1],sw[0]];
   const sh=B.simulateHand(sw,0,sw.length),canFlip=r.result!=='和'&&sh&&sh.size===r.size&&sh.result!==r.result&&sh.result!=='和';
   // Preserve the existing contract: leftover complete hands count in N/B/P/T,
   // but an unfixable leftover signal conflict has never invalidated a traverse chain.
   const free=previous.trip || tail&&(r.result==='和'||!canFlip);
   for(const flip of tail&&(previous.trip||r.result==='和'||!canFlip)?[0]:[0,1]){
    const ps=points.slice();if(flip)[ps[0],ps[1]]=[ps[1],ps[0]];
    const h=B.simulateHand(ps,0,ps.length);if(!h||h.size!==r.size||flip&&(h.result===r.result||h.result==='和'||!B.handSensitive(ps)))continue;
    if(!tail&&(previous.trip?h.result!=='和':B.rules.tripleTie&&h.result==='和'))continue;
    if(tail&&previous.trip&&flip)continue;
    if(!free&&h.result==='莊'&&!previous.cap)continue;
    const counts=B.specialRoundCounts(ps);
    if(B.rules.skipBanker6&&counts.drawSix||B.rules.skipPlayer7&&(h.player===7&&h.banker===6))continue;
    choices.push({i,flip,result:h.result,b:h.result==='莊'?1:0,signal:!free&&h.result==='莊'?1:0,free,cap:!free&&h.result==='莊'?previous.cap:0,counts,ci});
   }
   if(i>0&&r.start<traverseEnd){prefixData.rows.set(i,choices);stats.prefixRowsBuilt++;}return choices;
  });
  stats.prefixPreparationMs=performance.now()-prefixPreparationStart;
  if(rows.some(x=>!x.length))return end('infeasible','有完整局無法符合前局訊號／三條優先或合法敏感方向');
  const free=rows.reduce((s,row,i)=>s+(row[0].free?rounds[(i+N-1)%N].cap:0),0)+seq.slice(used).filter(p=>p===0).length,needed=Math.max(0,signals-free);
  const suffixCap=new Array(N+1).fill(0),suffixMin=new Array(N+1).fill(0),suffixMax=new Array(N+1).fill(0);
  for(let i=N-1;i>=0;i--){suffixCap[i]=suffixCap[i+1]+Math.max(...rows[i].map(x=>x.cap));suffixMin[i]=suffixMin[i+1]+Math.min(...rows[i].map(x=>x.b));suffixMax[i]=suffixMax[i+1]+Math.max(...rows[i].map(x=>x.b));}
  if(suffixCap[0]<needed||suffixMax[0]<minB||suffixMin[0]>maxB)return end('infeasible','合法方向的莊局數／紅0位置容量不足');
  const materialize=(s,from,to)=>{
   const ps=seq.slice(from,to);
   for(let t=s;t.choice;t=t.prev){const r=rounds[t.choice.i];if(r.start<from)break;if(r.start>=to)continue;if(t.choice.flip)[ps[r.start-from],ps[r.start-from+1]]=[ps[r.start-from+1],ps[r.start-from]];}
   return ps;
  };
  const limits=options.specialLimits||{},maxStates=options.balanceMaxStates??600,rng=options.rng||Math.random,visited=new Set();
  const pathsPerState=3,plansPerAttempt=8;
  const comparePrefix=(a,b)=>a.prefixMax-b.prefixMax||a.prefixSum-b.prefixSum||a.tie-b.tie;
  const compareFinal=(a,b)=>Math.abs(2*a.b-N)-Math.abs(2*b.b-N)||comparePrefix(a,b);
  let chosen=null,yieldAt=performance.now()+8;
  stats.pathsPerState=pathsPerState;
  context.progress?.(`穿越紅0目標規劃：${N}局・莊${minB}～${maxB}局・64張紅0；優先前後分布`);
  await new Promise(resolve=>setTimeout(resolve,0));
  // The existing qualified point skeleton is a feasible-search seed only, not
  // a low-flip preference. Every retained seed competes by the same distribution
  // objective. Only whole-chain legal, numerically qualified seeds can be adopted.
  const makePath=choices=>{
   const target=Math.max(minB,Math.min(maxB,Math.round(N/2)));let state={b:0,sig:0,cap:0,b6:0,seven:0,rare:0,last:-1000,prefixMax:0,prefixSum:0,tie:rng(),explore:rng(),flips:0};
   for(let i=0;i<N;i++){const x=choices[i],b=state.b+x.b,d=Math.abs(b*N-target*(i+1));state={b,sig:state.sig+x.signal,cap:Math.min(needed,state.cap+x.cap),b6:state.b6+x.counts.bankerSix,seven:state.seven+x.counts.seven,rare:state.rare+x.counts.rare,last:x.counts.rare?i:state.last,spacingBad:!!state.spacingBad||limits.rare!=null&&x.counts.rare&&i-state.last-1<=20,prefixMax:Math.max(state.prefixMax,d),prefixSum:state.prefixSum+d,tie:rng(),explore:rng(),flips:state.flips+x.flip,prev:state,choice:x};}return state;
  };
  const numericOk=t=>t.b>=minB&&t.b<=maxB&&t.sig<=signals&&t.cap>=needed&&t.b6<=(limits.bankerSix??Infinity)&&t.seven<=(limits.seven??Infinity)&&t.rare<=(limits.rare??Infinity)&&!t.spacingBad;
  const quality=t=>[Math.max(0,minB-t.b,t.b-maxB),Math.max(0,needed-t.cap),Math.max(0,t.sig-signals),Math.max(0,t.b6-(limits.bankerSix??Infinity))+Math.max(0,t.seven-(limits.seven??Infinity))+Math.max(0,t.rare-(limits.rare??Infinity))+(t.spacingBad?1:0),Math.abs(2*t.b-N),t.prefixMax,t.prefixSum];
  const betterQuality=(a,b)=>{const qa=quality(a),qb=quality(b);for(let i=0;i<qa.length;i++)if(qa[i]!==qb[i])return qa[i]<qb[i];return a.tie<b.tie;};
  const wholeFailures=t=>{const points=materialize(t,0,n);let at=0,bad=0;for(const ch of chains){const ps=points.slice(at,at+ch.length);ps.parts=ch.parts?.slice();ps.secondParts=ch.secondParts?.slice();at+=ch.length;stats.validations++;if(!B.qualifiesFinal(ps))bad++;}return bad;};
  let walk=rows.map((row,i)=>row.find(x=>x.result===rounds[i].result)||row[Math.floor(rng()*row.length)]),walkState=makePath(walk);
  stats.nodes+=N;
  let walkBad=wholeFailures(walkState);stats.seedInvalidChains=walkBad;
  const walkVisited=new Set([walk.map(x=>x.flip).join('')]);
  {
   if(!walkBad&&numericOk(walkState))chosen=walkState;
   for(let k=0;k<320;k++){
    if(context.cancelled?.())return end('cancelled','使用者停止');
    if(stats.nodes>=(options.balanceMaxNodes??1000000)||performance.now()>=deadline||stats.validations>=(options.balanceMaxValidations??4000))break;
    if(performance.now()>=yieldAt){await new Promise(r=>setTimeout(r,0));yieldAt=performance.now()+8;}
    const editable=rows.flatMap((row,i)=>row.length>1?[i]:[]);if(!editable.length)break;
    const directed=editable.filter(i=>walkState.b<minB?walk[i].b===0:walkState.b>maxB?walk[i].b===1:true),pool=k%3===0||!directed.length?editable:directed;
    const candidate=walk.slice(),i=pool[Math.floor(rng()*pool.length)],j=k%3===1?i:pool[Math.floor(rng()*pool.length)];
    candidate[i]=rows[i].find(x=>x!==walk[i]);if(j!==i)candidate[j]=rows[j].find(x=>x!==walk[j]);
    const signature=candidate.map(x=>x.flip).join('');if(walkVisited.has(signature))continue;walkVisited.add(signature);
    stats.nodes+=N;const state=makePath(candidate);if(!walkBad&&!betterQuality(state,walkState))continue;const bad=wholeFailures(state);if(bad>walkBad||bad===walkBad&&!betterQuality(state,walkState))continue;
    walk=candidate;walkState=state;walkBad=bad;if(!bad&&numericOk(state)&&(!chosen||compareFinal(state,chosen)<0))chosen=state;
   }
  }
  // Keep several paths per numeric state. Prefix deviations are exact integers
  // against the target B/N rate; no run-length cap or alternating-side rule.
  search: for(let attempt=0;attempt<(options.balanceAttempts??24);attempt++){
   if(chosen&&attempt>=3)break;
   stats.attempts=attempt+1;
   const targetB=Math.max(minB,Math.min(maxB,Math.floor(N/2)+(N%2&&rng()<0.5?1:0)));
   const ordered=rows.map(row=>row.map(x=>({x,tie:rng()})).sort((a,b)=>a.tie-b.tie).map(t=>t.x));
   let states=[{b:0,sig:0,cap:0,b6:0,seven:0,rare:0,last:-1000,prefixMax:0,prefixSum:0,tie:rng(),explore:rng(),flips:0}];
   for(let i=0;i<N;i++){
    const next=new Map();
    for(const state of states)for(const x of ordered[i]){
     if(context.cancelled?.())return end('cancelled','使用者停止');
     if(stats.nodes>=(options.balanceMaxNodes??1000000)||stats.validations>=(options.balanceMaxValidations??4000)||performance.now()>=deadline){stats.truncated=true;if(chosen)break search;return end('search-limit','穿越紅0規劃已達搜尋上限');}
     stats.nodes++;
     if(performance.now()>=yieldAt){context.progress?.(`穿越紅0分布規劃：第${attempt+1}組・${i+1}/${N}局`);await new Promise(r=>setTimeout(r,0));yieldAt=performance.now()+8;if(context.cancelled?.())return end('cancelled','使用者停止');}
     const b=state.b+x.b,sig=state.sig+x.signal,cap=Math.min(needed,state.cap+x.cap);
     if(b>maxB||sig>signals||b+suffixMax[i+1]<minB||b+suffixMin[i+1]>maxB||cap+suffixCap[i+1]<needed)continue;
     const b6=state.b6+x.counts.bankerSix,seven=state.seven+x.counts.seven,rare=state.rare+x.counts.rare;
     if(b6>(limits.bankerSix??Infinity)||seven>(limits.seven??Infinity)||rare>(limits.rare??Infinity))continue;
     if(limits.rare!=null&&x.counts.rare&&i-state.last-1<=20)continue;
     const deviation=Math.abs(b*N-targetB*(i+1));
     const last=x.counts.rare?i:state.last,t={b,sig,cap,b6,seven,rare,last,prefixMax:Math.max(state.prefixMax,deviation),prefixSum:state.prefixSum+deviation,tie:rng(),explore:rng(),flips:state.flips+x.flip,prev:state,choice:x};
     const key=[b,sig,cap,limits.bankerSix==null?0:b6,limits.seven==null?0:seven,limits.rare==null?0:rare,limits.rare==null?0:last].join('/');
     const bucket=next.get(key)||[];bucket.push(t);bucket.sort(comparePrefix);if(bucket.length>pathsPerState){const best=bucket.slice(0,pathsPerState-1),rest=bucket.slice(pathsPerState-1).sort((a,b)=>a.explore-b.explore);bucket.splice(0,bucket.length,...best,rest[0]);}next.set(key,bucket);
    }
    states=[...next.values()].flat();
    if(!states.length)break;
    if(states.length>maxStates){stats.truncated=true;states.sort(comparePrefix);const best=states.slice(0,Math.floor(maxStates*0.75)),rest=states.slice(best.length).sort((a,b)=>a.explore-b.explore);states=best.concat(rest.slice(0,maxStates-best.length));}
   }
   states=states.filter(t=>t.choice?.i===N-1&&t.b>=minB&&t.b<=maxB&&t.cap>=needed&&t.sig<=signals);
   states.sort(compareFinal);
   const preferred=states.slice(0,plansPerAttempt-3),exploration=states.slice(preferred.length).sort((a,b)=>a.explore-b.explore).slice(0,3);
   for(const candidate of preferred.concat(exploration)){
    if(context.cancelled?.())return end('cancelled','使用者停止');
    if(stats.validations>=(options.balanceMaxValidations??4000)||performance.now()>=deadline){stats.truncated=true;if(chosen)break search;return end('search-limit','穿越紅0規劃已達搜尋上限');}
    const points=materialize(candidate,0,n),key=points.join(',');if(visited.has(key))continue;visited.add(key);
    stats.numericPlans=(stats.numericPlans||0)+1;let cursor=0,valid=true;
    for(const ch of chains){
     if(context.cancelled?.())return end('cancelled','使用者停止');
     const ps=points.slice(cursor,cursor+ch.length);if(ch.parts)ps.parts=ch.parts.slice();if(ch.secondParts)ps.secondParts=ch.secondParts.slice();cursor+=ch.length;
     stats.validations++;if(!B.qualifiesFinal(ps)){valid=false;break;}
    }
    if(valid&&(!chosen||compareFinal(candidate,chosen)<0))chosen=candidate;
   }
  }
  if(!chosen)return end('search-limit','有界聯合配置未找到整條長段均合法的莊局目標；未宣稱整體無解');
  Object.assign(stats,{prefixMax:chosen.prefixMax/N,prefixSum:chosen.prefixSum/N});
  const states=[chosen];
  const best=states[0],points=materialize(best,0,n),cards=physical.slice(),choices=[];
  for(let t=best;t.choice;t=t.prev)choices.push(t.choice);choices.reverse();
  for(const x of choices)if(x.flip){const at=rounds[x.i].start;[cards[at],cards[at+1]]=[cards[at+1],cards[at]];}
  const mandatory=[],extra=[];
  let tailConflicts=0;
  for(let k=0;k<N;k++){
   const r=rounds[k],pos=Array.from({length:r.size},(_,j)=>r.start+j).filter(at=>points[at]===0);
   if(choices[(k+1)%N].free)extra.push(...pos);
   else if(choices[(k+1)%N].signal){mandatory.push(pos[0]);extra.push(...pos.slice(1));}
  }
  for(let at=used;at<n;at++)if(points[at]===0)extra.push(at);
  if(mandatory.some(x=>x===undefined)||mandatory.length>signals||mandatory.length+extra.length<signals)return end('invalid','實際紅0位置與規劃容量不一致');
  const shuffle=a=>{for(let j=a.length-1;j>0;j--){const k=Math.floor((options.rng||Math.random)()*(j+1));[a[j],a[k]]=[a[k],a[j]];}return a;};
  const selected=new Set(mandatory.concat(shuffle(extra).slice(0,signals-mandatory.length))),pool=zeros.map(i=>physical[i]),red=shuffle(pool.filter(isSignal)),black=shuffle(pool.filter(c=>!isSignal(c)));
  points.forEach((point,at)=>{if(point===0)cards[at]=selected.has(at)?red.pop():black.pop();});
  if(cards.some((c,i)=>c.point!==points[i])||new Set(cards).size!==n)return end('invalid','實體牌守恆驗收失敗');
  let cursor=0;
  for(const ch of chains){const ps=points.slice(cursor,cursor+ch.length);if(ch.parts)ps.parts=ch.parts.slice();if(ch.secondParts)ps.secondParts=ch.secondParts.slice();if(!B.qualifiesFinal(ps))return end('invalid','多局聯合調整後長段驗收失敗');cursor+=ch.length;}
  for(let k=0;k<N;k++){
   const r=rounds[k],prev=rounds[(k+N-1)%N],h=B.simulateHand(points,r.start,r.start+r.size),need=B.neededAfter(cards.slice(prev.start,prev.start+prev.size));
   if(!h||h.size!==r.size)return end('invalid','完整局張數驗收失敗');
   const matches=h.result===need||!B.rules.tripleTie&&h.result==='和'&&need==='閒';
   if(!matches){
    if(r.start<traverseEnd||options.strictTail)return end('invalid','穿越完整局含首尾訊號驗收失敗');
    tailConflicts++;
    const ps=points.slice(r.start,r.start+r.size);[ps[0],ps[1]]=[ps[1],ps[0]];const swapped=B.simulateHand(ps,0,ps.length);
    if(need!=='和'&&h.result!=='和'&&swapped?.size===r.size&&swapped.result===need)return end('invalid','剩牌完整局仍會被既有訊號程序改變方向');
   }
  }
  return end('solved','莊局目標、64張紅0容量、穿越區訊號與完整長段驗收通過',{points,cards,banker:best.b,diff:Math.abs(2*best.b-N),flips:best.flips,freeCapacity:free,tailConflicts});
 }
 root.TraverseRed0Balance={enabled,plan};if(typeof module!=='undefined')module.exports=root.TraverseRed0Balance;
})(typeof window!=='undefined'?window:globalThis);
