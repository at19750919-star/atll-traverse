// 全敏範本庫連結：記住 D:\穿越點數範本庫 資料夾（唯讀），找出「分段範本」與「和局放寬」兩個子資料夾。
// 目前只連結與列出檔案，不讀內容、不用於生成（使用者要求先接上、之後再讀）。
(function(root){
'use strict';
const SUBDIRS=[{key:'segments',name:'分段範本',label:'全敏分段範本'},{key:'looseTie',name:'和局放寬',label:'和局變莊閒單局'}];
let directory=null,needsPermission=false,files={segments:[],looseTie:[]},error='',listeners=new Set();
const notify=()=>listeners.forEach(fn=>{try{fn();}catch(_){}});
let dbp;function db(){return dbp||(dbp=new Promise(resolve=>{if(!root.indexedDB){resolve(null);return;}const q=root.indexedDB.open('atll-allsens-library-v1',1);q.onupgradeneeded=()=>q.result.createObjectStore('meta');q.onsuccess=()=>resolve(q.result);q.onerror=()=>resolve(null);}));}
async function saveHandle(dir){const d=await db();if(!d)return;await new Promise(r=>{const t=d.transaction('meta','readwrite');t.objectStore('meta').put(dir,'dir');t.oncomplete=t.onerror=()=>r();});}
async function loadHandle(){const d=await db();if(!d)return null;return new Promise(r=>{const q=d.transaction('meta').objectStore('meta').get('dir');q.onsuccess=()=>r(q.result||null);q.onerror=()=>r(null);});}
// 只看檔名與大小（getFile 不讀內容）
async function scan(){files={segments:[],looseTie:[]};error='';
  for(const s of SUBDIRS){let sub=null;
    if(directory.name===s.name)sub=directory;else{try{sub=await directory.getDirectoryHandle(s.name);}catch(_){continue;}}
    for await(const [name,h] of sub.entries()){if(h.kind!=='file'||!name.endsWith('.json'))continue;const f=await h.getFile();files[s.key].push({name,size:f.size});}
    files[s.key].sort((a,b)=>a.name.localeCompare(b.name));}
  if(!files.segments.length&&!files.looseTie.length)error='資料夾裡找不到「分段範本」或「和局放寬」子資料夾';}
async function use(dir){directory=dir;needsPermission=false;await saveHandle(dir);await scan();notify();}
const ready=(async()=>{try{const saved=await loadHandle();if(!saved)return;directory=saved;needsPermission=await saved.queryPermission({mode:'read'})!=='granted';if(!needsPermission)await scan();}catch(e){error=e.message;}finally{notify();}})();
async function connect(){await ready;if(!root.showDirectoryPicker)throw Error('這個瀏覽器不支援選擇資料夾');const dir=await root.showDirectoryPicker({id:'atll-allsens-library',mode:'read'});await use(dir);}
async function resume(){await ready;if(!directory)throw Error('請先選擇全敏範本資料夾');if(await directory.requestPermission({mode:'read'})!=='granted')throw Error('未取得讀取授權');await use(directory);}
function status(){return {connected:!!directory&&!needsPermission,needsPermission,folder:directory?.name||'',files:{segments:files.segments.slice(),looseTie:files.looseTie.slice()},error,used:false};}
function summary(){const s=status();if(!directory)return '尚未連結全敏範本資料夾（建議選 D:\\穿越點數範本庫）';if(s.needsPermission)return `已記住「${s.folder}」，待恢復讀取授權`;
  const mb=n=>(n/1048576).toFixed(1)+'MB',part=(label,list)=>list.length?`${label} ${list.length} 檔（${mb(list.reduce((n,f)=>n+f.size,0))}）`:`${label} 未找到`;
  return `已連結「${s.folder}」｜${SUBDIRS.map(x=>part(x.label,s.files[x.key])).join('｜')}｜目前不讀入、不用於生成${s.error?'｜'+s.error:''}`;}
root.AllSensLibrary={ready,connect,resume,status,summary,onChange:fn=>listeners.add(fn)};
})(typeof window!=='undefined'?window:globalThis);
