// 計算補排改比對範本庫的前後比較：同一種子各跑一次（關／開），只到算出剩牌為止
// 用法：node scripts/bench-template-compute.cjs [範本庫資料夾] [種子數]
const fs=require('fs'),path=require('path'),vm=require('vm'),{webcrypto}=require('crypto');
const ROOT=path.resolve(__dirname,'..'),DIR=process.argv[2]||'D:/穿越點數範本庫',N=Number(process.argv[3]||30);
function directory(folder){return {name:'bank',queryPermission:async()=>'granted',requestPermission:async()=>'granted',entries:async function*(){for(const n of fs.readdirSync(folder))yield[n,{}];},
 getFileHandle:async name=>{const f=path.join(folder,name);if(!fs.existsSync(f))throw Object.assign(Error('missing'),{name:'NotFoundError'});return {getFile:async()=>{const st=fs.statSync(f);return {size:st.size,lastModified:st.mtimeMs,text:async()=>fs.readFileSync(f,'utf8')};},createWritable:async()=>{throw Error('唯讀比較，不寫入範本庫');}};}};}
const rng=seed=>()=>{let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};
(async()=>{
 const c=vm.createContext({console,setTimeout,clearTimeout,performance,TextEncoder,crypto:webcrypto,structuredClone,localStorage:{getItem:()=>null},navigator:{}});
 for(const f of ['standard/two_thirteen_reversals.js','card_color_rules.js','traverse_builder.js','traverse_red0_balance.js','traverse_tail_fill.js','traverse_templates.js','traverse_template_banks.js'])vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'),c);
 const store=await new c.TraverseTemplateBanks.BankStore(directory(DIR)).open();c.TraverseTemplates.attachStore(store);
 let t=performance.now();const idx=await c.TraverseTemplates.compositionIndex();
 console.log(`範本索引：${idx.length} 種點數組成、${idx.reduce((n,g)=>n+g.points.length,0)} 個排列，載入 ${((performance.now()-t)/1000).toFixed(1)} 秒`);
 const base={idleLimit:1000,computeTries:20000,chainAttempts:20,minLen:8,maxLen:12,tripleTie:false,secondStart:false,strong:false,signalRule:true,skipBanker6:true,skipPlayer7:true,
  signalConfig:{suits:['♥','♦'],ranks:['10','J','Q','K']},rejectAbove:-1,fillSensitiveTail:false,templateLibrary:false};
 if(process.env.BENCH_PROFILE)Object.assign(base,JSON.parse(process.env.BENCH_PROFILE));console.log('設定：'+JSON.stringify(Object.fromEntries(Object.entries(base).filter(([k])=>!['signalConfig'].includes(k)))));
 const rows={off:[],on:[]};
 for(let s=1;s<=N;s++)for(const mode of ['off','on']){t=performance.now();const r=await c.TraverseBuilder.build({...base,templateCompute:mode==='on',rng:rng(5000+s)});rows[mode].push({left:r.leftoverCount,ms:performance.now()-t,hits:r.stats.templateComputeHits||0});}
 const sum=list=>{const left=list.map(x=>x.left).sort((a,b)=>a-b),avg=a=>a.reduce((n,x)=>n+x,0)/a.length;
  return `平均剩牌 ${avg(left).toFixed(1)}｜中位數 ${left[left.length>>1]}｜≤12張 ${left.filter(x=>x<=12).length}/${left.length}｜0張 ${left.filter(x=>x===0).length}｜平均 ${(avg(list.map(x=>x.ms))/1000).toFixed(1)} 秒｜範本補撿 ${avg(list.map(x=>x.hits)).toFixed(1)} 段/副`;};
 console.log('原本隨機湊段：'+sum(rows.off));console.log('先比對範本庫：'+sum(rows.on));
 console.log('逐副剩牌（關→開）：'+rows.off.map((x,i)=>`${x.left}→${rows.on[i].left}`).join(' '));
})().catch(e=>{console.error(e);process.exitCode=1;});
