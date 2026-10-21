// Shared back-color policy. Pattern groups: 3+1 and 2+2; mixed mode
// permits at most three consecutive completed rounds from the same group.
(function(root){
  'use strict';
  const BASE=['BBBR','RRRB'], MIXED=BASE.concat(['BBRR','RRBB']);
  const patterns=mixed=>(mixed?MIXED:BASE).slice();
  const group=pattern=>BASE.includes(pattern)?0:['BBRR','RRBB'].includes(pattern)?1:null;
  function violations(colors,mixed){
    const allowed=new Set(patterns(mixed)),bad=[];let last=null,run=0;
    colors.forEach((color,i)=>{
      const g=group(color);
      if(!allowed.has(color)){bad.push(i+1);last=null;run=0;return;}
      run=g===last?run+1:1;last=g;
      if(mixed&&run>3)bad.push(i+1);
    });
    return bad;
  }
  function plan(starts,groups,limits,length,{mixed=false,rng=Math.random,attempts=50,steps=4000}={}){
    const pats=patterns(mixed),size=limits.R.length;
    const validChange=(pick,i,next)=>{
      if(!mixed)return true;
      const g=Math.floor(next/2);let run=1;
      for(let j=i-1;j>=0&&Math.floor(pick[j]/2)===g;j--)if(++run>3)return false;
      for(let j=i+1;j<pick.length&&Math.floor(pick[j]/2)===g;j++)if(++run>3)return false;
      return true;
    };
    for(let attempt=0;attempt<attempts;attempt++){
      const pick=[];let last=-1,run=0;
      for(let i=0;i<starts.length;i++){
        const g=mixed?(run===3?1-last:Math.floor(rng()*2)):0;
        pick.push(g*2+Math.floor(rng()*2));run=g===last?run+1:1;last=g;
      }
      const demand={R:new Array(size).fill(0),B:new Array(size).fill(0)};
      const apply=(i,sign)=>[...pats[pick[i]]].forEach((c,k)=>{demand[c][groups[starts[i]+k]]+=sign;});
      const over=(c,g)=>Math.max(0,demand[c][g]-limits[c][g]);
      starts.forEach((_,i)=>apply(i,1));
      let overflow=0;for(let g=0;g<size;g++)overflow+=over('R',g)+over('B',g);
      for(let step=0;step<steps&&overflow>0&&starts.length;step++){
        const i=Math.floor(rng()*starts.length),prev=pick[i];
        const next=(prev+1+Math.floor(rng()*(pats.length-1)))%pats.length;
        if(!validChange(pick,i,next))continue;
        const touched=[...new Set(groups.slice(starts[i],starts[i]+4))];
        const cost=()=>touched.reduce((sum,g)=>sum+over('R',g)+over('B',g),0);
        const before=cost();apply(i,-1);pick[i]=next;apply(i,1);const after=cost();
        if(after<=before)overflow+=after-before;
        else{apply(i,-1);pick[i]=prev;apply(i,1);}
      }
      if(overflow===0){
        const need=new Array(length).fill(null);
        starts.forEach((st,i)=>[...pats[pick[i]]].forEach((c,k)=>{need[st+k]=c;}));
        return need;
      }
    }
    return null;
  }
  root.CardColorRules={patterns,group,violations,plan};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.CardColorRules;
})(typeof window!=='undefined'?window:globalThis);
