// Traverse-only final count tolerance. Picking still uses the unmodified targets.
(function(root){
 'use strict';
 const tolerance=3;
 function check(counts,limits,tieMax=null){
  const entries=[];
  for(const k of [4,5,6]){const bound=limits?.[k]||{};if(bound.min!=null||bound.max!=null)entries.push({key:k,name:`${k}張局`,min:bound.min??null,max:bound.max??null});}
  if(tieMax!=null)entries.push({key:'tie',name:'和局',min:null,max:tieMax});
  const items=entries.map(e=>{const actual=counts[e.key]??0,low=e.min==null?null:Math.max(0,e.min-tolerance),high=e.max==null?null:e.max===0?0:e.max+tolerance;
   const original=(e.min==null||actual>=e.min)&&(e.max==null||actual<=e.max),ok=(low==null||actual>=low)&&(high==null||actual<=high);
   const target=[e.min==null?'':`下限${e.min}`,e.max==null?'':`上限${e.max}`].filter(Boolean).join('、');
   return {...e,actual,low,high,original,ok,text:`${e.name}實際${actual}局／原目標${target}（${original?'原目標達成':ok?'在3局允差內通過':'超出允差'}）`};});
  return {ok:items.every(e=>e.ok),original:items.every(e=>e.original),items,
   reason:items.filter(e=>!e.ok).map(e=>e.text+(e.max===0?'；上限0仍禁止':'；允差最多3局')).join('；'),
   summary:items.length?'穿越局數允差最多3局（上限0仍禁止）｜'+items.map(e=>e.text).join('｜'):''};
 }
 root.TraverseQuota={check,tolerance};if(typeof module!=='undefined')module.exports=root.TraverseQuota;
})(typeof window!=='undefined'?window:globalThis);
