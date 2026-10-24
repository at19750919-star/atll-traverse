// Exact finite point-layout search over only the residual pool. No artificial work budget.
(function(root){
 'use strict';
 let catalogOwner=null,catalog=null,groups=null;
 async function* search(pool,options={},context={}){
  const B=root.TraverseBuilder,start=performance.now(),stopped=()=>context.cancelled?.()===true;
  if(!Array.isArray(pool)||pool.some(p=>!Number.isInteger(p)||p<0||p>9))throw Error('剩牌須為0～9整數點數');
  const stats={attempts:1,nodes:0,scanned:0,backtracked:0,maxBatch:0,initialCount:pool.length,solutions:0,fastProposals:0,deadSkips:0,finiteTail:true};
  const result=(status,rounds=[],reason='')=>({...stats,ok:status==='solved',status,rounds:rounds.map(h=>h.slice()),unprocessed:status==='solved'?0:pool.length,reason,ms:performance.now()-start});
  let yieldAt=performance.now()+8;
  async function cooperate(){if(performance.now()>=yieldAt){context.progress?.(`敏感補排有限搜尋：剩牌${pool.length}張・節點${stats.nodes}・已找到${stats.solutions}種完整分局；可按停止`);await new Promise(r=>setTimeout(r,0));yieldAt=performance.now()+8;}return !stopped();}
  if(stopped())return result('cancelled',[],'使用者停止');
  if(pool.length===0){stats.solutions++;yield result('solved');return result('exhausted',[],'空剩牌已完成');}
  if(pool.length<4||pool.length===7)return result('infeasible',[],'剩牌張數無法以4／5／6張完整局用完，且不可補入原穿越段');

  const triple=options.tripleTie!==false,skipP7=!!B.rules.skipPlayer7,skipB6=!!B.rules.skipBanker6,a2=options.a2Signal===true;
  const base={4:0,5:0,6:0,tie:0,...options.baseCounts},counts=Array(10).fill(0);pool.forEach(p=>counts[p]++);
  const tolerance=root.TraverseQuota?.tolerance??3,bounds={};for(const n of [4,5,6]){const b=options.sizeLimits?.[n]||{};bounds[n]={low:b.min==null?0:Math.max(0,b.min-tolerance),high:b.max==null?Infinity:b.max===0?0:b.max+tolerance};}
  const maxTie=options.tieMax==null?Infinity:options.tieMax===0?0:options.tieMax+tolerance;
  const possible=(q,left)=>{if(q.tie>maxTie)return false;let needed=0,capacity=0;for(const n of [4,5,6]){if(q[n]>bounds[n].high)return false;needed+=Math.max(0,bounds[n].low-q[n])*n;capacity+=Math.max(0,bounds[n].high-q[n])*n;}return needed<=left&&capacity>=left&&(left===0||left>=4&&left!==7);};
  const endOk=(trip,sig)=>(!triple||trip===!!options.firstTie)&&(!a2||((triple&&trip?'和':sig?'莊':'閒')===options.firstResult||!triple&&!sig&&options.firstResult==='和'));
  const priority=(t,q)=>{let needed=0,over=0;for(const n of [4,5,6]){const b=options.sizeLimits?.[n];if(b?.min!=null)needed+=Math.max(0,b.min-q[n]-(t.size===n?1:0))*n;if(b?.max!=null)over+=Math.max(0,q[n]+(t.size===n?1:0)-b.max);}if(options.tieMax!=null)over+=Math.max(0,q.tie+(t.result==='和'?1:0)-options.tieMax);return [needed,over,-t.size];};
  // One cheap priority proposal, never a stopping budget. On rejection/resume,
  // enumerate the entire original finite search space. This exact point layout\n  // is already tried first, so its original position is skipped (no type merging).
  const shuffled=pool.slice(),rng=options.rng||Math.random;for(let j=shuffled.length-1;j>0;j--){const k=Math.floor(rng()*(j+1));[shuffled[j],shuffled[k]]=[shuffled[k],shuffled[j]];}
  let quickCode=null;const quick=[],taken=new Uint8Array(pool.length);let quickQuota={...base},quickTrip=!!options.previousTrip,quickSignal=!!options.previousSignal,quickUsed=0;
  if(possible(base,pool.length))for(let at=0;at+3<shuffled.length;at++){
   if(!await cooperate())return result('cancelled',[],'使用者停止');const h=B.simulateHand(shuffled,at,shuffled.length);if(!h||Array.from({length:h.size},(_,j)=>taken[at+j]).some(Boolean))continue;
   const hand=shuffled.slice(at,at+h.size);if(!B.handSensitive(hand)||triple&&quickTrip!==(h.result==='和'))continue;const sw=hand.slice();[sw[0],sw[1]]=[sw[1],sw[0]];const other=B.simulateHand(sw,0,sw.length);
   if(skipP7&&[h,other].some(r=>r.player===7&&r.banker===6)||skipB6&&[h,other].some(r=>r.size===6&&r.banker===6&&r.player<=5))continue;
   if(a2){const need=triple&&quickTrip?'和':quickSignal?'莊':'閒';if(h.result!==need&&!(!triple&&need==='閒'&&h.result==='和'))continue;}
   const next={...quickQuota,[h.size]:quickQuota[h.size]+1,tie:quickQuota.tie+(h.result==='和'?1:0)};if(!possible(next,pool.length-quickUsed-h.size))continue;
   quickQuota=next;quick.push(hand);quickUsed+=h.size;stats.nodes++;for(let j=0;j<h.size;j++)taken[at+j]=1;quickTrip=triple&&B.isTriple(hand);quickSignal=a2&&B.isSignalHand(hand,options.signalConfig);
  }
  if(quickUsed===pool.length&&possible(quickQuota,0)&&endOk(quickTrip,quickSignal)){quickCode=quick.flat().join(',');stats.solutions++;stats.fastProposals++;stats.maxBatch=Math.max(stats.maxBatch,quick.length);yield {...result('solved',quick),proposalKind:'quick-shuffle'};if(!await cooperate())return result('cancelled',[],'使用者停止');}
  if(catalogOwner!==B||!catalog){const rows=[],seen=new Set();for(const hand of B.allSensitiveHands()){if(!await cooperate())return result('cancelled',[],'使用者停止');const code=hand.join(',');if(seen.has(code))continue;seen.add(code);const points=hand.slice(),counts=Array(10).fill(0);points.forEach(p=>counts[p]++);const h=B.simulateHand(points,0,points.length),sw=points.slice();[sw[0],sw[1]]=[sw[1],sw[0]];const other=B.simulateHand(sw,0,sw.length);rows.push({index:rows.length,points,counts,size:points.length,result:h.result,trip:B.isTriple(points),forbiddenP7:[h,other].some(x=>x.player===7&&x.banker===6),forbiddenB6:[h,other].some(x=>x.size===6&&x.banker===6&&x.player<=5)});}catalogOwner=B;catalog=rows;const byCounts=new Map();for(const t of rows){const k=t.counts.join(',');if(!byCounts.has(k))byCounts.set(k,{counts:t.counts,size:t.size,rows:[]});byCounts.get(k).rows.push(t);}groups=[...byCounts.values()];}
  // 同一組剩牌點數、局數狀態與前局三條／訊號，已確定沒有任何完整分局（含已提出的快速解）就記成死路，不再重算
  const path=[],dead=new Set(),DEAD_MAX=2000000;let leaves=0;
  async function* visit(left,q,previousTrip,previousSignal){
   if(!await cooperate())return;
   if(!possible(q,left))return;
   if(!left){if(endOk(previousTrip,previousSignal)){leaves++;if(quickCode!==null&&path.flat().join(',')===quickCode)return;stats.solutions++;stats.maxBatch=Math.max(stats.maxBatch,path.length);yield result('solved',path);}return;}
   const key=counts.join(',')+'|'+q[4]+','+q[5]+','+q[6]+','+q.tie+'|'+(previousTrip?1:0)+(previousSignal?1:0);
   if(dead.has(key)){stats.deadSkips++;return;}
   const before=leaves,candidates=[];
   // 先用點數組成篩掉剩牌湊不出的整組敏感局，再逐局檢查；排序仍依原優先序與原清單順序
   for(const g of groups){if(g.size>left)continue;let fit=true;for(let k=0;k<10;k++)if(g.counts[k]>counts[k]){fit=false;break;}if(!fit)continue;if(!await cooperate())return;
    for(const t of g.rows){stats.scanned++;if(skipP7&&t.forbiddenP7||skipB6&&t.forbiddenB6)continue;if(triple&&previousTrip!==(t.result==='和'))continue;if(a2){const need=triple&&previousTrip?'和':previousSignal?'莊':'閒';if(t.result!==need&&!(!triple&&need==='閒'&&t.result==='和'))continue;}const next={...q,[t.size]:q[t.size]+1,tie:q.tie+(t.result==='和'?1:0)};if(!possible(next,left-t.size))continue;candidates.push({t,next,priority:priority(t,q)});}}
   candidates.sort((a,b)=>{for(let i=0;i<a.priority.length;i++)if(a.priority[i]!==b.priority[i])return a.priority[i]-b.priority[i];return a.t.index-b.t.index;});
   for(const {t,next}of candidates){if(!await cooperate())return;stats.nodes++;for(let k=0;k<10;k++)counts[k]-=t.counts[k];path.push(t.points);try{yield* visit(left-t.size,next,triple&&t.trip,a2&&B.isSignalHand(t.points,options.signalConfig));}finally{path.pop();for(let k=0;k<10;k++)counts[k]+=t.counts[k];}stats.backtracked++;}
   if(leaves===before&&!stopped()){if(dead.size>=DEAD_MAX)dead.clear();dead.add(key);}
  }
  if(!possible(base,pool.length))return result('infeasible',[],'剩牌無法補足穿越最終局數允差，或已違反上限0等不可恢復條件');
  yield* visit(pool.length,base,!!options.previousTrip,!!options.previousSignal);
  if(stopped())return result('cancelled',[],'使用者停止');
  return result(stats.solutions?'exhausted':'infeasible',[],stats.solutions?'本剩牌所有敏感點數分局已有限遍歷；不代表後續實體配置／有預算規劃已窮舉':'本剩牌的完整敏感點數分局已有限搜尋完，無符合局數與三條邊界的排法');
 }
 async function fill(pool,options={},context={}){const iterator=search(pool,options,context);try{for(;;){const step=await iterator.next();if(step.done)return step.value;if(!options.accept||await options.accept(step.value.rounds,step.value))return step.value;}}finally{await iterator.return();}}
 function validate(cards,options={}){
  const B=root.TraverseBuilder,points=cards.map(c=>typeof c==='number'?c:typeof c.point==='function'?c.point():c.point),rounds=[];let at=0;
  while(at<points.length){const h=B.simulateHand(points,at,points.length);if(!h)return {ok:false,reason:`尚有${points.length-at}張未成局`};const hand=points.slice(at,at+h.size);if(!B.handSensitive(hand))return {ok:false,reason:`第${rounds.length+1}局不是敏感局`};rounds.push({start:at,size:h.size,result:h.result,trip:options.tripleTie!==false&&B.isTriple(hand)});at+=h.size;}
  if(at!==416)return {ok:false,reason:'不是完整416張牌'};
  for(let i=0;i<rounds.length;i++){const p=rounds[(i+rounds.length-1)%rounds.length],r=rounds[i];if(options.tripleTie!==false&&p.trip!==(r.result==='和'))return {ok:false,reason:'全靴三條接和不符'};
   if(options.signalRule!==false&&!p.trip){const need=B.isSignalHand(cards.slice(p.start,p.start+p.size),options.signalConfig)?'莊':'閒';if(r.result!==need&&!(options.tripleTie===false&&r.result==='和'&&need==='閒'))return {ok:false,reason:`第${i+1}局訊號不符（含首尾循環）`};}}
  return {ok:true,rounds:rounds.length,unprocessed:0};
 }
 root.TraverseTailFill={fill,search,validate};if(typeof module!=='undefined')module.exports=root.TraverseTailFill;
})(typeof window!=='undefined'?window:globalThis);
