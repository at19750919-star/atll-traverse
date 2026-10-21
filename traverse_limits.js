// Final actual-shoe acceptance and safe whole-round spacing exchanges.
(function(root){
  'use strict';
  const B=root.TraverseBuilder,E=root.TraverseExport,R=root.TwoThirteenReversals;
  const point=c=>typeof c.point==='function'?c.point():c.point;
  function check(result,limits){
    const counts=B.specialRoundCounts(result.cards.map(point));
    const rare=R.check(E.dealRounds(result.cards).filter(r=>r.hand),limits.rare);
    const reasons=[];
    for(const [key,name] of [['bankerSix','莊6點贏'],['seven','七點逆轉'],['rare','逆轉（1／13＋2／13）']]){
      if(limits[key]!==null&&counts[key]>limits[key])reasons.push(`${name} ${counts[key]} 局 > 上限 ${limits[key]}`);
    }
    if(limits.bankerSix!==null&&counts.drawSix)reasons.push(`原牌或對調後有 ${counts.drawSix} 局補第三張莊6贏，須排除`);
    return {ok:!reasons.length&&rare.okSpacing,okCount:!reasons.length,okSpacing:rare.okSpacing,counts,rare,reason:reasons.join('；')||rare.reason};
  }
  function chainsValid(result,policy){
    const saved={...B.rules};
    const keys=['tripleTie','signalRule','signalConfig','strong','secondStart','skipBanker6','skipPlayer7','mixedColor'];
    try{
      keys.forEach(k=>{if(policy[k]!==undefined)B.rules[k]=policy[k];});
      return result.chains.every(ch=>{
        const ps=Array.from({length:ch.length},(_,j)=>point(result.cards[(ch.start-1+j)%result.cards.length]));
        if(ch.parts)ps.parts=ch.parts.slice();
        if(ch.secondParts)ps.secondParts=ch.secondParts.slice();
        return B.qualifiesFinal(ps);
      });
    }finally{keys.forEach(k=>{if(!(k in saved))delete B.rules[k];});Object.assign(B.rules,saved);}
  }
  async function repairSpacing(result,options){
    const dealt=E.dealRounds(result.cards),rounds=dealt.filter(r=>r.hand),tail=dealt.filter(r=>!r.hand).flatMap(r=>r.cards);
    const owners=new Array(result.cards.length).fill(-1);
    result.chains.forEach((ch,i)=>{for(let j=0;j<ch.length;j++)owners[(ch.start-1+j)%owners.length]=i;});
    const owner=r=>r.cards.every((_,j)=>owners[r.start+j]===owners[r.start])?owners[r.start]:null;
    const repaired=await R.repairSpacing(rounds,{
      keyFor:r=>JSON.stringify([owner(r),r.cards.length,r.result,B.isSignalHand(r.cards,options.policy.signalConfig),B.isTriple(r.cards.map(point))]),
      canMove:i=>owner(rounds[i])!==null&&!(options.preserveLastNine&&i===rounds.length-1),
      shouldStop:options.shouldStop,
      maxNodes:options.maxNodes,maxValidations:options.maxValidations,
      validate:candidate=>{
        const next={...result,cards:candidate.flatMap(r=>r.cards).concat(tail)};
        return chainsValid(next,options.policy)&&check(next,options.limits).ok;
      }
    });
    if(!repaired.ok)return repaired;
    return {ok:true,swaps:repaired.swaps,result:{...result,cards:repaired.rounds.flatMap(r=>r.cards).concat(tail)}};
  }
  root.TraverseLimits={check,chainsValid,repairSpacing};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.TraverseLimits;
})(typeof window!=='undefined'?window:globalThis);
