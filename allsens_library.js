// 全敏範本庫：記住 D:\穿越點數範本庫（讀寫），讀取／累積／保存「分段範本」兩個規則庫，並讀取「和局放寬」單局庫統計。
// 只做讀取與累積，不用於生成（使用者要求：讀跟累積不等於用在生成）。
(function(root){
'use strict';
const RULES={orig:{file:'分段範本_原規則.json',label:'原規則'},loose:{file:'分段範本_放寬和局.json',label:'放寬和局'}};
const SEG_DIR='分段範本',TIE_DIR='和局放寬',MIN_LEN=8,MAX_LEN=17,SAVE_MS=30000;
let directory=null,needsPermission=false,error='',saving=false,active=false,stopRequested=false;
const banks={orig:new Map(),loose:new Map()},dirty={orig:0,loose:0},added={orig:0,loose:0};
let tieInfo=null,loaded=false;const listeners=new Set();
const notify=()=>listeners.forEach(fn=>{try{fn();}catch(_){}});
let dbp;function db(){return dbp||(dbp=new Promise(resolve=>{if(!root.indexedDB){resolve(null);return;}const q=root.indexedDB.open('atll-allsens-library-v1',1);q.onupgradeneeded=()=>q.result.createObjectStore('meta');q.onsuccess=()=>resolve(q.result);q.onerror=()=>resolve(null);}));}
async function saveHandle(dir){const d=await db();if(!d)return;await new Promise(r=>{const t=d.transaction('meta','readwrite');t.objectStore('meta').put(dir,'dir');t.oncomplete=t.onerror=()=>r();});}
async function loadHandle(){const d=await db();if(!d)return null;return new Promise(r=>{const q=d.transaction('meta').objectStore('meta').get('dir');q.onsuccess=()=>r(q.result||null);q.onerror=()=>r(null);});}
// 選到的可能是根目錄（含子資料夾）或子資料夾本身
async function sub(name,create=false){if(directory.name===name)return directory;return directory.getDirectoryHandle(name,{create});}
async function readJSON(dirName,file){try{const h=await (await sub(dirName)).getFileHandle(file);return JSON.parse(await (await h.getFile()).text());}catch(e){if(e.name==='NotFoundError'||e.name==='TypeError')return null;throw e;}}
async function load(){error='';
  for(const rule of Object.keys(RULES)){banks[rule].clear();dirty[rule]=0;added[rule]=0;
    const list=await readJSON(SEG_DIR,RULES[rule].file)||[];for(const x of list)if(Array.isArray(x.seq))banks[rule].set(x.seq.join(''),{seq:x.seq,len:x.seq.length,hands:x.hands,ties:x.ties,rule});}
  tieInfo=await readJSON(TIE_DIR,'index.json');loaded=true;}
async function writeBank(rule){if(!dirty[rule])return;const dir=await sub(SEG_DIR,true),h=await dir.getFileHandle(RULES[rule].file,{create:true}),w=await h.createWritable();
  await w.write(JSON.stringify([...banks[rule].values()]));await w.close();dirty[rule]=0;}
async function save(){if(!directory||needsPermission)return;saving=true;notify();try{for(const rule of Object.keys(RULES))await writeBank(rule);}catch(e){error='保存失敗：'+e.message;}finally{saving=false;notify();}}
async function use(dir){directory=dir;needsPermission=false;await saveHandle(dir);await load();notify();}
const ready=(async()=>{try{const saved=await loadHandle();if(!saved)return;directory=saved;needsPermission=await saved.queryPermission({mode:'readwrite'})!=='granted';if(!needsPermission)await load();}catch(e){error=e.message;}finally{notify();}})();
async function connect(){await ready;if(active)throw Error('請先停止累積');if(!root.showDirectoryPicker)throw Error('這個瀏覽器不支援選擇資料夾');const dir=await root.showDirectoryPicker({id:'atll-allsens-library',mode:'readwrite'});await use(dir);}
async function resume(){await ready;if(active)throw Error('請先停止累積');if(!directory)throw Error('請先選擇全敏範本資料夾');if(await directory.requestPermission({mode:'readwrite'})!=='granted')throw Error('未取得讀寫授權');await use(directory);}

// ===== 累積：與 D 槽離線收集相同條件 =====
// 每個起點能在段內發完的局都敏感；0點25～38%、1～9各點≤floor(段長/13)+2、同點不連三、和局≤一成+1；段長8～17
function collector(rule){
  const B=root.TraverseBuilder,sim=B.simulateHand;
  const sens=h=>{const saved=B.rules.looseTie;B.rules.looseTie=rule==='loose';try{return B.handSensitive(h);}finally{B.rules.looseTie=saved;}};
  const step=arr=>{const n=arr.length;let h=0,t=0;for(let st=Math.max(0,n-6);st<=n-4;st++){const r=sim(arr,st,n);if(r&&r.size===n-st){if(!sens(arr.slice(st,n)))return null;h++;if(r.result==='和')t++;}}return {h,t};};
  const okComp=(cnt,n)=>{const z=cnt[0]/n;if(z<0.25||z>0.38)return false;for(let d=1;d<10;d++)if(cnt[d]>Math.floor(n/13)+2)return false;return true;};
  const order=()=>{const a=[0,0,0,0,1,2,3,4,5,6,7,8,9];for(let i=a.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[a[i],a[j]]=[a[j],a[i]];}return [...new Set(a)];};
  return function root1(budget){let nodes=0,got=0;const arr=[],cnt=Array(10).fill(0);
    (function dfs(H,T){if(++nodes>budget||arr.length>=MAX_LEN)return;
      for(const d of order()){const L=arr.length;if(L>=2&&arr[L-1]===d&&arr[L-2]===d)continue;if(d&&cnt[d]>=Math.floor(MAX_LEN/13)+2)continue;if(d===0&&cnt[0]>=Math.ceil(MAX_LEN*0.38))continue;
        arr.push(d);const s=step(arr);if(s&&T+s.t<=Math.floor((H+s.h)*0.1)+1){cnt[d]++;const n=arr.length;
          if(n>=MIN_LEN&&okComp(cnt,n)){const k=arr.join('');if(!banks[rule].has(k)){banks[rule].set(k,{seq:arr.slice(),len:n,hands:H+s.h,ties:T+s.t,rule});dirty[rule]++;added[rule]++;got++;}}
          dfs(H+s.h,T+s.t);cnt[d]--;}
        arr.pop();if(nodes>budget)return;}})(0,0);
    return got;};
}
async function run({rule,progress,cancelled}={}){await ready;if(!directory||needsPermission)throw Error('請先選擇或恢復全敏範本資料夾');if(active)return;
  rule=rule==='loose'?'loose':'orig';active=true;stopRequested=false;notify();const walk=collector(rule);let lastSave=Date.now(),roots=0;
  const halt=()=>stopRequested||!!cancelled?.();
  try{while(!halt()){const until=performance.now()+40;while(performance.now()<until&&!halt()){walk(3000);roots++;}
      progress?.(`全敏範本累積（${RULES[rule].label}）：已試 ${roots} 輪，本次新增 ${added[rule]} 段，庫內共 ${banks[rule].size} 段`);notify();
      if(Date.now()-lastSave>SAVE_MS){await save();lastSave=Date.now();}
      await new Promise(r=>setTimeout(r,0));}}
  finally{active=false;await save();notify();}}
function stop(){stopRequested=true;}
async function exportJSON(rule){return new Blob([JSON.stringify([...banks[rule==='loose'?'loose':'orig'].values()])],{type:'application/json'});}
function byLen(rule){const c={};for(const x of banks[rule].values())c[x.len]=(c[x.len]||0)+1;return c;}
function status(){return {connected:!!directory&&!needsPermission,needsPermission,folder:directory?.name||'',loaded,active,saving,error,
  banks:Object.fromEntries(Object.keys(RULES).map(r=>[r,{total:banks[r].size,byLen:byLen(r),pending:dirty[r],added:added[r]}])),tieInfo};}
function summary(){const s=status();if(!directory)return '尚未連結全敏範本資料夾（建議選 D:\\穿越點數範本庫）';if(s.needsPermission)return `已記住「${s.folder}」，待恢復讀寫授權`;
  const bank=r=>{const b=s.banks[r];return `${RULES[r].label} ${b.total} 段（${Object.entries(b.byLen).map(([l,n])=>l+'張'+n).join('／')||'空'}）${b.pending?`｜待存 ${b.pending}`:''}`;};
  const tie=s.tieInfo?.counts?`和局變莊閒單局 ${[4,5,6].reduce((n,k)=>n+(s.tieInfo.counts[k]?.total||0),0)} 種（已全部枚舉）`:'和局放寬單局庫未找到';
  return `已連結「${s.folder}」｜${bank('orig')}｜${bank('loose')}｜${tie}｜${s.saving?'正在寫入本機｜':''}只讀取與累積，不用於生成${s.error?'｜'+s.error:''}`;}
root.AllSensLibrary={ready,connect,resume,run,stop,save,exportJSON,status,summary,onChange:fn=>listeners.add(fn)};
})(typeof window!=='undefined'?window:globalThis);
