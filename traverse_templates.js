// Indexed point templates. Old v1 localStorage is read-only migration input.
(function(root){
 'use strict';
 const VERSION=1,RULES='traverse-points-2026-10-24-v1',KEY='atll-traverse-point-templates-v1',MAX=5000000,PER_KEY=null,MAX_BYTES=Infinity;
 const FLAGS=['tripleTie','signalRule','strong','secondStart','skipBanker6','skipPlayer7'];
 const lengthCounts={8:0,9:0,10:0,11:0,12:0};const entries=new Map(),index=new Map(),listeners=new Set();let store=null;const BUFFER=Infinity;const counters={accepted:0,duplicates:0,invalid:0,full:0};let loaded=false,storageError='',corrupt=false,revision=0;
 const key=points=>{if(!Array.isArray(points)||points.length<8||points.length>12||points.some(p=>!Number.isInteger(p)||p<0||p>9))throw Error('範本須為8～12張0～9整數點數');const c=Array(10).fill(0);points.forEach(p=>c[p]++);return points.length+':'+c.join(',');};
 const flags=()=>Object.fromEntries(FLAGS.map(k=>[k,!!root.TraverseBuilder.rules[k]]));
 function validate(e){
  if(!e||typeof e!=='object'||Array.isArray(e)||Object.keys(e).sort().join()!=='flags,key,points,rules'||e.rules!==RULES||e.key!==key(e.points))throw Error('範本格式／規則版本不符');
  if(!e.flags||Object.keys(e.flags).sort().join()!==FLAGS.slice().sort().join()||FLAGS.some(k=>typeof e.flags[k]!=='boolean'))throw Error('範本驗證標記不完整');
  const B=root.TraverseBuilder,saved={...B.rules};try{Object.assign(B.rules,e.flags);if(!B.qualifies(e.points,true))throw Error('範本穿越／敏感／三條重驗失敗');}finally{Object.assign(B.rules,saved);}
  return {key:e.key,points:e.points.slice(),rules:RULES,flags:{...e.flags}};
 }
 function envelope(text){if(typeof text!=='string')throw Error('範本JSON過大');const d=JSON.parse(text);if(!d||Object.keys(d).sort().join()!=='entries,rules,version'||d.version!==VERSION||d.rules!==RULES||!Array.isArray(d.entries)||d.entries.length>MAX)throw Error('範本JSON格式或版本不符');return d.entries;}
 const id=e=>e.points.join(',');
 function insert(e){const name=id(e);if(entries.has(name)){counters.duplicates++;return false;}if(!store&&lengthCounts[e.points.length]>=1000000){counters.full++;return false;}const group=index.get(e.key)||[];entries.set(name,e);lengthCounts[e.points.length]++;group.push(e);index.set(e.key,group);revision++;counters.accepted++;return true;}

 function emit(){for(const f of listeners)try{f();}catch(_){}}
 function load(){if(loaded)return;loaded=true;try{const raw=root.localStorage?.getItem(KEY);if(raw){const valid=envelope(raw).map(validate);valid.forEach(insert);}}catch(_){corrupt=true;storageError='舊瀏覽器範本無法讀取，原資料未刪除';}}
 function stats(){load();return {templates:entries.size,keys:index.size,capacity:MAX,counters:{...counters},revision,storageError,corrupt,pending:entries.size,banks:Object.fromEntries([8,9,10,11,12].map(n=>[n,{count:store?store.bankCount(n):lengthCounts[n],capacity:1000000}])),...store?.totals()};}
 function collect(segments){load();let added=0;for(const s of segments){if(s.length<8||s.length>12)continue;const f=flags();if(s.secondStart===false)f.secondStart=false;try{if(insert(validate({key:key(s),points:s.slice(),rules:RULES,flags:f})))added++;}catch(_){counters.invalid++;}}if(added)emit();return added;}
 function merge(valid){load();if(!store){const ids=new Set(entries.keys()),counts={...lengthCounts};for(const e of valid){const name=id(e);if(ids.has(name))continue;ids.add(name);if(++counts[e.points.length]>1000000)throw Error('合併後超過該張數一百萬容量，原資料未改');}}let added=0;valid.forEach(e=>{if(insert(e))added++;});if(added)emit();return stats();}

 function importJSON(text){const valid=envelope(text).map(validate);return merge(valid);}
 async function importJSONAsync(text,options={}){const raw=envelope(text),valid=[];let until=performance.now()+8;for(const e of raw){if(options.cancelled?.())throw Error('已取消匯入，未合併資料');valid.push(validate(e));if(performance.now()>=until){await new Promise(r=>setTimeout(r,0));until=performance.now()+8;}}if(options.cancelled?.())throw Error('已取消匯入，未合併資料');return merge(valid);}
 const lookup=points=>{load();return (index.get(key(points))||[]).map(e=>e.points.slice());};
 function mapPhysical(points,cards){if(cards.length!==points.length)return null;const buckets=Array.from({length:10},()=>[]),seen=new Set();for(const c of cards){const p=typeof c.point==='function'?c.point():c.point,n=c.rank==='A'?1:['10','J','Q','K'].includes(c.rank)?0:Number(c.rank);if(!['A','2','3','4','5','6','7','8','9','10','J','Q','K'].includes(c.rank)||!['♠','♥','♦','♣'].includes(c.suit)||p!==n||seen.has(c))return null;seen.add(c);buckets[p].push(c);}const out=[];for(const p of points){const c=buckets[p]?.pop();if(!c)return null;out.push(c);}return out;}
 // 依點數組成分組的全庫索引：磁碟庫每個資料夾只讀一次，之後只併入記憶體新收的排列。
 // 只回傳點數排列，使用前仍須依目前規則重驗。
 let comp=null;
 async function compositionIndex(options={}){load();
  if(!comp||comp.store!==store){comp={store,groups:new Map(),ids:new Set(),list:null};
   if(store?.allPoints)for(const n of [8,9,10,11,12])for await(const p of store.allPoints(n,options)){if(options.cancelled?.()){comp=null;return [];}addComp(p);}}
  for(const e of entries.values())addComp(e.points);
  if(!comp.list)comp.list=[...comp.groups.values()];return comp.list;}
 function addComp(points){const id=points.join('');if(comp.ids.has(id))return;comp.ids.add(id);const k=key(points);let g=comp.groups.get(k);if(!g){const counts=Array(10).fill(0);points.forEach(p=>counts[p]++);g={key:k,length:points.length,counts,zeros:counts[0],points:[]};comp.groups.set(k,g);comp.list=null;}g.points.push(points.slice());}
 root.TraverseTemplates={validate,flags,attachStore:s=>{store=s;emit();},pendingEntries:()=>[...entries.values()],pendingCount:()=>entries.size,acknowledge:batch=>{for(const e of batch){const name=id(e);if(entries.get(name)!==e)continue;entries.delete(name);lengthCounts[e.points.length]--;const group=index.get(e.key).filter(x=>x!==e);if(group.length)index.set(e.key,group);else index.delete(e.key);}if(batch.length)emit();},lookupAsync:async(points,options={})=>{load();const result=new Map(),group=index.get(key(points))||[];let until=performance.now()+8;for(const e of group){if(options.cancelled?.())return [];result.set(e.points.join(','),e.points.slice());if(performance.now()>=until){await new Promise(r=>setTimeout(r,0));until=performance.now()+8;}}const disk=store?await store.lookup(points,options):[];for(const p of disk){if(options.cancelled?.())return [];result.set(p.join(','),p);if(performance.now()>=until){await new Promise(r=>setTimeout(r,0));until=performance.now()+8;}}return [...result.values()];},bankFull:n=>store?store.bankCount(n)>=1000000:lengthCounts[n]>=1000000,key,stats,collect,collectAsync:async(segments,options={})=>{const added=collect(segments);if(store&&entries.size>=4000){const state=await root.TraverseTemplateFile.flush();if(state.fileError)throw Error(state.fileError);}return added;},lookup,compositionIndex,find:points=>lookup(points).filter(p=>root.TraverseBuilder.qualifies(p,true)),mapPhysical,importJSON,importJSONAsync,exportJSON:()=>{load();return JSON.stringify({version:VERSION,rules:RULES,entries:[...entries.values()]});},onChange:f=>{listeners.add(f);return ()=>listeners.delete(f);},constants:{VERSION,RULES,KEY,MAX,PER_KEY,MAX_BYTES}};
})(typeof window!=='undefined'?window:globalThis);
