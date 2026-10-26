// 閒7沿用原牌／前兩張對調後，閒7點贏莊6點的定義；每局只計一次。
(function(root){
  'use strict';
  const point=c=>typeof c==='number'?c:typeof c.point==='function'?c.point():Number.isFinite(c.point)?c.point:c.rank==='A'?1:['10','J','Q','K'].includes(c.rank)?0:Number(c.rank);
  function totals(cards){
    const a=cards.map(point);if(a.length<4)return null;
    let p=(a[0]+a[2])%10,b=(a[1]+a[3])%10,i=4;
    if(p<8&&b<8){
      let t=null;if(p<=5){if(i>=a.length)return null;t=a[i++];p=(p+t)%10;}
      const draw=t===null?b<=5:b<=2||(b===3&&t!==8)||(b===4&&t>=2&&t<=7)||(b===5&&t>=4&&t<=7)||(b===6&&t>=6&&t<=7);
      if(draw){if(i>=a.length)return null;b=(b+a[i++])%10;}
    }
    return i===a.length?{player:p,banker:b}:null;
  }
  function classify(round){
    const cards=Array.isArray(round)?round:round?.cards;if(!cards||cards.length<4)return false;
    const sw=cards.slice();[sw[0],sw[1]]=[sw[1],sw[0]];
    return [totals(cards),totals(sw)].some(h=>h&&h.player===7&&h.banker===6);
  }
  function read(doc,id='maxPlayerSeven'){
    const input=doc.getElementById(id),raw=input?.value.trim()??'';
    if(input?.validity?.badInput||raw!==''&&(!Number.isInteger(Number(raw))||Number(raw)<0||Number(raw)>104))return {error:'閒7上限請填0～104的整數，或留白不限。',focus:id};
    return {limit:raw===''?null:Number(raw)};
  }
  function check(rounds,limit){
    const roundNumbers=[];(rounds||[]).forEach((r,i)=>{if(classify(r))roundNumbers.push(i+1);});
    const spacingViolations=[];for(let i=1;i<roundNumbers.length;i++){
      const firstRound=roundNumbers[i-1],nextRound=roundNumbers[i],gap=nextRound-firstRound-1;
      if(gap<20)spacingViolations.push({firstRound,nextRound,gap});
    }
    const count=roundNumbers.length,okCount=limit==null||count<=limit,okSpacing=!spacingViolations.length,v=spacingViolations[0];
    return {ok:okCount&&okSpacing,okCount,okSpacing,count,roundNumbers,spacingViolations,
      reason:!okCount?`閒7 ${count} 局 > 上限 ${limit}`:!okSpacing?`第${v.firstRound}、${v.nextRound}局閒7之間只隔${v.gap}局，須至少20局`:''};
  }
  root.PlayerSevenLimits={totals,classify,read,check};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.PlayerSevenLimits;
})(typeof window!=='undefined'?window:globalThis);
