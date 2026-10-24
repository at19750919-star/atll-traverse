// Continuous dedicated collector. Private RNG and synchronous rule snapshots prevent
// sharing generator randomness or leaving mutable rules changed across a yield.
(function(root){
 'use strict';let active=false,stopRequested=false;
 async function run(options={}){if(active)throw Error('範本累積已在執行');active=true;stopRequested=false;const B=root.TraverseBuilder,L=root.TraverseTemplates,start=performance.now(),before=L.stats(),beforeFile=root.TraverseTemplateFile?.status().totals||{added:0,duplicates:0,full:0,keysAdded:0};
  const full=()=>Array.from({length:max-min+1},(_,i)=>min+i).every(n=>L.bankFull(n));
  const snapshot={...B.rules,...options.rules},min=Math.max(8,options.minLen??8),max=Math.min(12,options.maxLen??12);if(!Number.isInteger(min)||!Number.isInteger(max)||min>max){active=false;throw Error('目前段長範圍沒有8～12張可收集');}
  let seed=options.seed??(root.crypto?.getRandomValues(new Uint32Array(1))[0]??Date.now());const random=()=>{let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};
  const patterns=[[4,4],[4,5],[5,4],[4,6],[5,5],[6,4],[5,6],[6,5],[6,6],[4,4,4]].filter(parts=>{const n=parts.reduce((a,b)=>a+b,0);return n>=min&&n<=max;});
  const sources=Object.fromEntries(patterns.map(parts=>[parts.join('+'),{attempts:0,valid:0,queued:0}]));
  let attempts=0,added=0,valid=0,reason='時間上限';const deadline=start+(options.durationMs??Infinity),maxAttempts=options.maxAttempts??Infinity,maxNew=options.maxNew??Infinity,groups={4:[],5:[],6:[]};
  try{for(const h of B.allSensitiveHands())groups[h.length].push(h);while(performance.now()<deadline&&attempts<maxAttempts&&added<maxNew&&!full()){
   if(stopRequested||options.cancelled?.()){reason='已停止';break;}const saved={...B.rules},until=performance.now()+8;
   try{Object.assign(B.rules,snapshot);while(performance.now()<until&&performance.now()<deadline&&attempts<maxAttempts&&added<maxNew&&!full()){if(stopRequested||options.cancelled?.()){reason='已停止';break;}const parts=patterns[attempts%patterns.length],source=sources[parts.join('+')];attempts++;const n=parts.reduce((a,b)=>a+b,0);if(L.bankFull(n))continue;source.attempts++;const p=parts.flatMap(size=>groups[size][Math.floor(random()*groups[size].length)]);if(!B.qualifies(p,true))continue;valid++;source.valid++;const queued=L.collect([p]);added+=queued;source.queued+=queued;if(root.TraverseTemplateFile?.status().connected&&L.pendingCount()>=4000)break;}}
   finally{Object.assign(B.rules,saved);}if(root.TraverseTemplateFile?.status().connected&&L.pendingCount()>=4000){const f=await (root.TraverseTemplateFile?.flush()??Promise.resolve({}));if(f.fileError)throw Error(f.fileError);}{const c=L.stats().counters,f=root.TraverseTemplateFile?.status();options.progress?.({attempts,added:f?.connected?(f.totals.added-beforeFile.added):0,pending:L.pendingCount(),duplicates:c.duplicates-before.counters.duplicates+(f?.totals.duplicates||0)-beforeFile.duplicates,full:c.full-before.counters.full+(f?.totals.full||0)-beforeFile.full,keys:f?.connected?f.totals.keysAdded-beforeFile.keysAdded:0,ms:performance.now()-start});}await new Promise(r=>setTimeout(r,options.pauseMs??20));
  }
  if(full())reason='容量上限';else if(added>=maxNew)reason='本次新增上限';else if(attempts>=maxAttempts)reason='本次嘗試上限';if(stopRequested||options.cancelled?.())reason='已停止';const f=await (root.TraverseTemplateFile?.flush()??Promise.resolve({}));if(f.fileError)throw Error(f.fileError);const final=root.TraverseTemplateFile?.status(),c=L.stats().counters;added=final?.connected?final.totals.added-beforeFile.added:0;return {attempts,added,valid,sources,pending:L.pendingCount(),duplicates:c.duplicates-before.counters.duplicates+(final?.totals.duplicates||0)-beforeFile.duplicates,full:c.full-before.counters.full+(final?.totals.full||0)-beforeFile.full,keys:final?.connected?final.totals.keysAdded-beforeFile.keysAdded:0,ms:performance.now()-start,reason};
  }finally{active=false;}
 }
 root.TraverseTemplateCollector={run,stop:()=>{stopRequested=true;},get running(){return active;}};
})(typeof window!=='undefined'?window:globalThis);
