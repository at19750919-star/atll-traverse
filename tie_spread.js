// Assign each original tie to a section centre using direct whole-round swaps.
(function(root){
  'use strict';
  const tie=r=>r?.result==='和',player=r=>r?.result==='閒';
  function metrics(rounds){
    const positions=rounds.flatMap((r,i)=>tie(r)?[i+1]:[]),n=rounds.length,thirds=[0,0,0];
    positions.forEach(p=>thirds[Math.min(2,Math.floor((p-1)*3/n))]++);
    return {positions,thirds,first7:positions.filter(p=>p<=7).length};
  }
  async function disperse(rounds,options){
    const started=Date.now(),before=metrics(rounds),n=rounds.length;
    const originals=rounds.filter(tie),k=originals.length,working=rounds.slice(),reserved=new Set(),assignments=[];
    const hasSignal=options.hasSignal;
    if(typeof hasSignal!=='function')throw new Error('和局定位需要實際訊號牌判斷');
    let checks=0,visited=0,moves=0,cancelled=false;
    for(let i=0;i<k;i++){
      if(options.shouldStop?.()){cancelled=true;break;}
      const round=originals[i],from=working.indexOf(round),ideal=(i+.5)*n/k;
      const item={original:rounds.indexOf(round)+1,ideal,target:Math.max(1,Math.min(n,Math.round(ideal))),actual:from+1,status:'unchanged',reason:'',checks:0};
      assignments.push(item);
      // Standard generated ties satisfy these premises; traversal/imported data may not.
      const sourceReason=hasSignal(round)?'原和局含訊號牌，不符合交換前提'
        :hasSignal(working[(from+n-1)%n])?'原和局前局含訊號牌，不符合交換前提'
        :!player(working[(from+1)%n])?'原和局後局不是閒，不符合交換前提':'';
      if(sourceReason){item.reason=sourceReason;reserved.add(from);continue;}
      const locations=Array.from({length:n},(_,j)=>j).sort((a,b)=>Math.abs(a+1-ideal)-Math.abs(b+1-ideal)||a-b);
      const failures=new Set();let eligible=0;
      for(const to of locations){
        if(visited++%8===0)await new Promise(resolve=>setTimeout(resolve,0));
        if(options.shouldStop?.()){cancelled=true;break;}
        if(to===from){
          item.reason=eligible?'較近候選未通過原驗收：'+[...failures].join('、'):'原位已是最近可用位置；較近位置不符候選條件';
          break;
        }
        if(reserved.has(to)||!player(working[to])||hasSignal(working[(to+n-1)%n])||!player(working[(to+1)%n]))continue;
        eligible++;checks++;item.checks++;
        const candidate=working.slice();[candidate[from],candidate[to]]=[candidate[to],candidate[from]];
        const validation=await options.validate(candidate),ok=typeof validation==='boolean'?validation:validation?.ok;
        if(options.shouldStop?.()){cancelled=true;break;}
        if(!ok){failures.add(validation?.reason||'原驗收限制不符');continue;}
        [working[from],working[to]]=[working[to],working[from]];
        item.actual=to+1;item.status='swapped';item.reason='最近合法閒局，完整兩局互換';moves++;break;
      }
      if(cancelled)break;
      reserved.add(item.actual-1);
    }
    const output=cancelled?rounds.slice():working;
    if(cancelled){moves=0;assignments.forEach(item=>{item.actual=item.original;item.status='cancelled';item.reason='已取消，未採用交換';});}
    assignments.forEach(item=>item.error=Number((item.actual-item.ideal).toFixed(3)));
    return {rounds:output,before,after:metrics(output),targets:assignments,checks,moves,cancelled,ms:Date.now()-started,
      reason:cancelled?'已取消，保留原排列':!k?'沒有和局，保留原排列':`依理想位置完成${moves}局互換，${k-moves}局保留原位`};
  }
  function summary(report){
    const targets=report.targets||[],format=n=>Number(n.toFixed(2));
    const positions=targets.length?`；理想 ${targets.map(t=>format(t.ideal)).join('/')} → 實際 ${targets.map(t=>t.actual).join('/')}；誤差 ${targets.map(t=>t.error).join('/')}`:'';
    const notes=targets.filter(t=>t.status!=='swapped').map(t=>`原第${t.original}局：${t.reason}`);
    return `⚙️ 和局定位：${report.reason}${positions}${notes.length?'；'+notes.join('；'):''}（${report.ms}ms）`;
  }
  root.TieSpread={metrics,disperse,summary};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.TieSpread;
})(typeof window!=='undefined'?window:globalThis);
