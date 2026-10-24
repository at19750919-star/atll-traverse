// A2 residual-only search: finite sensitive partitions, then tail order/direction.
// No per-candidate deadline, attempt/node/scan cap, or tail rollback depth cap.
(function(root){
 'use strict';
 async function fill(pool,options={},ctx={}){
  const B=root.TraverseBuilder,start=performance.now(),initial=pool.slice(),counts=Array(10).fill(0);pool.forEach(p=>counts[p]++);
  const stats={initialCount:pool.length,permutations:0,sensitiveTypes:0,partitions:0,orderStates:0,backtracked:0,maxBatch:0,prefixPlans:0,prefixRejectedSpecial:0,prefixRejectedQuota:0,quotaPruned:0,completeQuotaRejected:0,bankerPruned:0,phase:'原段預檢'},triple=options.tripleTie!==false,signalOn=options.signalRule!==false;
  let cancelled=false,nextYield=performance.now()+8,prefixPlans=[],prefixImpossible=false,prefixReason='',prefixDetails=[];
  const stopped=()=>cancelled||(cancelled=ctx.cancelled?.()===true);
  async function cooperate(){if(performance.now()>=nextYield){ctx.progress?.(`A2敏感補排：${stats.phase}｜敏感型${stats.sensitiveTypes}／完整分局${stats.partitions}／方向排列${stats.orderStates}｜原段可用${prefixPlans.length}/${stats.prefixPlans}／配額不可補足剪枝${stats.quotaPruned}／莊數不可達剪枝${stats.bankerPruned}；可按停止`);await new Promise(r=>setTimeout(r,0));nextYield=performance.now()+8;}return !stopped();}
  const result=(status,reason='',extra={})=>({...stats,ok:status==='solved',status,reason,unprocessed:status==='solved'?0:pool.length,ms:performance.now()-start,...extra});
  if(stopped())return result('cancelled','使用者停止');
  if(!pool.length)return result('solved','',{rounds:[]});
  if(pool.length<4||pool.length===7)return result('infeasible','剩牌張數無法以4／5／6張完整局用完，且不可補入原穿越段');
  const signature=p=>{const c=Array(10).fill(0);p.forEach(x=>c[x]++);return c.join('/');};
  const wanted=(trip,sig)=>triple&&trip?'和':sig?'莊':'閒';
  const matches=(need,actual)=>need===actual||(!triple&&need==='閒'&&actual==='和');
  const specialKeys=['bankerSix','seven','rare'];
  function describe(points){const h=B.simulateHand(points,0,points.length);if(!h||h.size!==points.length||!B.handSensitive(points))return null;const sw=points.slice();[sw[0],sw[1]]=[sw[1],sw[0]];const sh=B.simulateHand(sw,0,sw.length);if(B.rules.skipPlayer7&&[h,sh].some(r=>r.player===7&&r.banker===6))return null;const pairs=[{points:points.slice(),result:h.result,special:B.specialRoundCounts(points)}];if(sh.result!==h.result)pairs.push({points:sw,result:sh.result,special:B.specialRoundCounts(sw)});if(B.rules.skipBanker6&&pairs[0].special.drawSix)return null;pairs.sort((a,b)=>a.result.localeCompare(b.result));const multiset=Array(10).fill(0);points.forEach(p=>multiset[p]++);return {size:points.length,counts:multiset,trip:triple&&B.isTriple(points),signal:B.isSignalHand(points,options.signalConfig),orientations:pairs};}
  // Equivalent states retain an actual validated arrangement for each direction.
  // Point multiset fixes A/2 membership and triples; outcome + special counters
  // are the other tail rules checked here. No fixed number of candidates is discarded.
  const types=[],typeIndex=new Map();
  function remember(points){const d=describe(points);if(!d)return;const key=[d.counts.join('/'),d.trip,d.signal,JSON.stringify(d.orientations.map(o=>[o.result,o.special]))].join('|');if(typeIndex.has(key))return;d.id=types.length;typeIndex.set(key,d.id);types.push(d);stats.sensitiveTypes=types.length;}
  const countRounds=hands=>{const c={4:0,5:0,6:0,tie:0};for(const h of hands){c[h.size]++;c.tie+=h.orientations[0].result==='和'?1:0;}return c;};
  function finalCountsOk(prefix,tail){const c={...prefix};for(const k of [4,5,6,'tie'])c[k]=(prefix[k]||0)+(tail[k]||0);return root.TraverseQuota.check(c,options.sizeLimits,options.tieMax).ok;}
  // These are necessary arithmetic bounds only, never equivalence merging of search paths.
  const tolerance=root.TraverseQuota.tolerance,bounds={};for(const n of [4,5,6]){const b=options.sizeLimits?.[n]||{};bounds[n]={low:b.min==null?0:Math.max(0,b.min-tolerance),high:b.max==null?Infinity:b.max===0?0:b.max+tolerance};}
  const tieHigh=options.tieMax==null?Infinity:options.tieMax===0?0:options.tieMax+tolerance;
  function quotaPossible(prefix,tail,left){if((prefix.tie||0)+(tail.tie||0)>tieHigh)return false;let need=0,capacity=0;for(const n of [4,5,6]){const count=(prefix[n]||0)+(tail[n]||0);if(count>bounds[n].high)return false;need+=Math.max(0,bounds[n].low-count)*n;capacity+=Math.max(0,bounds[n].high-count)*n;}return need<=left&&capacity>=left&&(left===0||left>=4&&left!==7);}
  const rawPlans=options.planPrefix();stats.prefixPlans=rawPlans.length;
  for(const plan of rawPlans){if(!await cooperate())return result('cancelled','使用者停止');const prefixCounts=B.roundSizeCounts(plan.points),baseSpecial=B.specialRoundCounts(plan.points),prefixRounds=B.roundsFromStart(plan.points)||[];const failures=specialKeys.filter(k=>options.specialLimits?.[k]!=null&&baseSpecial[k]>options.specialLimits[k]);if(failures.length){stats.prefixRejectedSpecial++;prefixDetails.push(failures.map(k=>`${k}實際${baseSpecial[k]}>上限${options.specialLimits[k]}`).join('、'));continue;}if(!quotaPossible(prefixCounts,{4:0,5:0,6:0,tie:0},pool.length)){stats.prefixRejectedQuota++;continue;}prefixPlans.push({...plan,prefixCounts,baseSpecial,prefixB:prefixRounds.filter(r=>r.result==='莊').length,prefixRoundCount:prefixRounds.length});}
  if(!prefixPlans.length){prefixImpossible=true;prefixReason=!rawPlans.length?'原穿越段無合法A2訊號方向／首尾邊界方案':`原段${rawPlans.length}種合法方向方案均不可補救：莊6／逆轉已超上限${stats.prefixRejectedSpecial}種，4／5／6／和局配額即使用完剩牌仍不可達${stats.prefixRejectedQuota}種（已含3局允差、上限0仍禁止）${prefixDetails.length?'；'+prefixDetails.join('；'):''}`;return result('infeasible',prefixReason);}
  stats.phase='枚舉敏感型';
  async function arrange(groups){stats.partitions++;const tailCounts=countRounds(groups);
   for(const plan of prefixPlans){if(!await cooperate())return null;const {prefixCounts,baseSpecial,prefixB}=plan;if(!finalCountsOk(prefixCounts,tailCounts)){stats.completeQuotaRejected++;continue;}const totalRounds=plan.prefixRoundCount+groups.length;
    // For a legal cyclic signal chain, each hand's outgoing B requirement occurs
    // exactly once. Replace the last tail->head contribution by prefix->tail.
    // This is a necessary invariant, not a merge of distinct card arrangements.
    const targetMin=options.sideLimit==null?0:Math.ceil((totalRounds-options.sideLimit)/2),targetMax=options.sideLimit==null?totalRounds:Math.floor((totalRounds+options.sideLimit)/2);
    const bankerReachable=(banker,prevTrip,prevSignal,firstResult,items)=>{
     if(signalOn&&firstResult!=null){const outgoing=items.reduce((n,item)=>n+item.left*(item.g.signal&&!item.g.trip?1:0),0),exact=banker+outgoing+(prevSignal&&!prevTrip?1:0)-(firstResult==='莊'?1:0);return exact>=targetMin&&exact<=targetMax;}
     let low=banker,high=banker;for(const item of items){const values=item.g.orientations.map(o=>o.result==='莊'?1:0);low+=item.left*Math.min(...values);high+=item.left*Math.max(...values);}return low<=targetMax&&high>=targetMin;
    };
    const bag=new Map();for(const g of groups){const t=bag.get(g.id);if(t)t.left++;else bag.set(g.id,{g,left:1});}const items=[...bag.values()],path=[],memo=new Set();
    async function order(prevTrip,prevSignal,banker,special,remaining,cycleFirst=null){if(!await cooperate())return null;if(remaining&&!bankerReachable(banker,prevTrip,prevSignal,plan.firstResult??cycleFirst,items)){stats.bankerPruned++;return null;}stats.orderStates++;if(!remaining){if(triple&&prevTrip!==((plan.firstResult??cycleFirst)==='和'))return null;if(signalOn&&!matches(wanted(prevTrip,prevSignal),plan.firstResult??cycleFirst))return null;if(options.sideLimit!=null&&Math.abs(2*banker-totalRounds)>options.sideLimit)return null;const hands=path.map(o=>o.points.slice());if(options.accept&&!options.accept(plan,hands))return null;return hands;}
     const key=[items.map(i=>i.left).join(','),prevTrip,prevSignal,cycleFirst,banker,...specialKeys.map(k=>special[k])].join('|');if(memo.has(key))return null;
     for(const item of items){if(!item.left)continue;const g=item.g;for(const o of g.orientations){if((plan.points.length||path.length)&&triple&&prevTrip!==(o.result==='和'))continue;if((plan.points.length||path.length)&&signalOn&&!matches(wanted(prevTrip,prevSignal),o.result))continue;const next={...special};let ok=true;for(const k of specialKeys){next[k]+=o.special[k];const max=options.specialLimits?.[k];if(max!=null&&next[k]>max)ok=false;}if(!ok)continue;item.left--;path.push(o);const found=await order(g.trip,g.signal,banker+(o.result==='莊'?1:0),next,remaining-1,cycleFirst??o.result);path.pop();item.left++;if(found)return found;if(stopped())return null;}}
     memo.add(key);return null;
    }
    stats.phase='尾局順序與訊號方向';const found=await order(plan.previousTrip,plan.previousSignal,prefixB,baseSpecial,groups.length);if(found)return {rounds:found,prefixChains:plan.chains,a2BoundaryFlips:plan.flips||0};
   }return null;
  }
  // Cheap first proposal, then exhaustive partitioning. This is not a retry cap:
  // failure here always proceeds to the complete finite residual search below.
  const shuffled=pool.slice(),rng=options.rng||Math.random;for(let j=shuffled.length-1;j>0;j--){const k=Math.floor(rng()*(j+1));[shuffled[j],shuffled[k]]=[shuffled[k],shuffled[j]];}
  const used=new Uint8Array(pool.length),quick=[];for(let i=0;i+3<shuffled.length;i++){if(!await cooperate())return result('cancelled','使用者停止');const h=B.simulateHand(shuffled,i,shuffled.length);if(!h||Array.from({length:h.size},(_,j)=>used[i+j]).some(Boolean))continue;const p=shuffled.slice(i,i+h.size),d=describe(p);if(!d)continue;remember(p);quick.push(types[typeIndex.get([d.counts.join('/'),d.trip,d.signal,JSON.stringify(d.orientations.map(o=>[o.result,o.special]))].join('|'))]);for(let j=i;j<i+h.size;j++)used[j]=1;}
  if(used.every(Boolean)){stats.maxBatch=quick.length;const found=await arrange(quick);if(found)return result('solved','',found);if(prefixImpossible)return result('infeasible','原穿越段無合法A2訊號方向／首尾邊界方案');}
  // Enumerate only point orders available in this pool. An actual complete hand
  // cannot be extended, so 4/5/6-card legality prunes only impossible deals.
  async function enumerate(prefix){if(!await cooperate())return;stats.permutations++;if(prefix.length>=4){const h=B.simulateHand(prefix,0,prefix.length);if(h&&h.size===prefix.length){remember(prefix);return;}if(prefix.length===6)return;}for(let p=0;p<10;p++)if(counts[p]){counts[p]--;prefix.push(p);await enumerate(prefix);prefix.pop();counts[p]++;if(stopped())return;}}
  stats.phase='枚舉敏感型';await enumerate([]);if(stopped())return result('cancelled','使用者停止');
  // Prefer the user's ORIGINAL quota targets, without an extra acceptance gate.
  const quota={sizeLimits:options.sizeLimits,sizeTally:options.baseCounts||{4:0,5:0,6:0},tieMax:options.tieMax??null,tieTally:options.baseCounts?.tie||0,sizeUsedCards:416-pool.length};types.sort((a,b)=>B.preferQuota(a.orientations[0].points,b.orientations[0].points,quota)?-1:B.preferQuota(b.orientations[0].points,a.orientations[0].points,quota)?1:a.id-b.id);
  const remaining=counts.slice(),chosen=[],tailCounts={4:0,5:0,6:0,tie:0};stats.phase='分局與配額可行性';
  async function partition(left,first){stats.phase='分局與配額可行性';if(!await cooperate())return null;if(!prefixPlans.some(plan=>quotaPossible(plan.prefixCounts,tailCounts,left))){stats.quotaPruned++;return null;}if(!left){stats.maxBatch=Math.max(stats.maxBatch,chosen.length);return arrange(chosen);}if(left<4||left===7)return null;
   for(let i=first;i<types.length;i++){if(!await cooperate())return null;const g=types[i];if(g.size>left||g.counts.some((n,p)=>n>remaining[p]))continue;g.counts.forEach((n,p)=>remaining[p]-=n);chosen.push(g);tailCounts[g.size]++;const tie=g.orientations[0].result==='和'?1:0;tailCounts.tie+=tie;const found=await partition(left-g.size,i);tailCounts.tie-=tie;tailCounts[g.size]--;chosen.pop();g.counts.forEach((n,p)=>remaining[p]+=n);if(found)return found;stats.backtracked++;if(stopped()||prefixImpossible)return null;}return null;
  }
  const solved=await partition(pool.length,0);if(solved){if(signature(solved.rounds.flat())!==signature(initial))throw Error('A2敏感補排點數不守恆');return result('solved','',solved);}
  return result(stopped()?'cancelled':'infeasible',stopped()?'使用者停止':prefixImpossible?'原穿越段無合法A2訊號方向／首尾邊界方案':`本剩牌的敏感分局／A2訊號／配額狀態已搜尋完：配額不可補足剪枝${stats.quotaPruned}，莊數不可達剪枝${stats.bankerPruned}，完整分局${stats.partitions}，方向狀態${stats.orderStates}；無可用尾局配置，須換新候選`);
 }
 root.TraverseA2Tail={fill};
})(typeof window!=='undefined'?window:globalThis);
