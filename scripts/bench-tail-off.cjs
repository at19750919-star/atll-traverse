// 敏感補排關閉時要重跑幾次才排出一副（剩牌全部排進穿越段），並量整副回復
// 用法：node scripts/bench-tail-off.cjs [範本庫資料夾] [副數] [每副最多嘗試]；BENCH_MODE=a2 改測穿越A2
const fs=require('fs'),path=require('path'),vm=require('vm'),{webcrypto}=require('crypto');
const ROOT=path.resolve(__dirname,'..'),DIR=process.argv[2]||'D:/穿越點數範本庫',DECKS=Number(process.argv[3]||5),MAX=Number(process.argv[4]||300),MODE=process.env.BENCH_MODE||'red0';
function directory(folder){return {name:'bank',queryPermission:async()=>'granted',requestPermission:async()=>'granted',entries:async function*(){for(const n of fs.readdirSync(folder))yield[n,{}];},
 getFileHandle:async name=>{const f=path.join(folder,name);if(!fs.existsSync(f))throw Object.assign(Error('missing'),{name:'NotFoundError'});return {getFile:async()=>{const st=fs.statSync(f);return {size:st.size,lastModified:st.mtimeMs,text:async()=>fs.readFileSync(f,'utf8')};},createWritable:async()=>{throw Error('唯讀比較，不寫入範本庫');}};}};}
const rng=seed=>()=>{let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};
(async()=>{
 const c=vm.createContext({console,setTimeout,clearTimeout,performance,TextEncoder,crypto:webcrypto,structuredClone,localStorage:{getItem:()=>null},navigator:{}});
 for(const f of ['standard/two_thirteen_reversals.js','card_color_rules.js','traverse_quota.js','traverse_builder.js','traverse_red0_balance.js','traverse_tail_fill.js','traverse_a2_tail.js','traverse_templates.js','traverse_template_banks.js'])vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'),c);
 c.TraverseTemplateFile={flush:async()=>({}),status:()=>({ready:true})};if(process.env.BENCH_TC!=='0'&&fs.existsSync(DIR)){c.TraverseTemplates.attachStore(await new c.TraverseTemplateBanks.BankStore(directory(DIR)).open());await c.TraverseTemplates.compositionIndex();}
 const B=c.TraverseBuilder;
 // 主頁預設規則（integrated.js TV_RULES）
 const base={idleLimit:1000,computeTries:20000,chainAttempts:20,minLen:8,maxLen:12,tripleTie:true,signalRule:true,skipPlayer7:MODE==='red0',fillSensitiveTail:true,sensitiveTail:false,templateCompute:process.env.BENCH_TC!=='0',sideControl:process.env.BENCH_SC!=='0',
  red0Balance:MODE==='red0',a2Tail:MODE==='a2',sideLimit:8,tieMax:MODE==='red0'?4:null,specialLimits:{bankerSix:null,seven:2,rare:null},
  signalConfig:MODE==='red0'?{suits:['♥','♦'],ranks:['10','J','Q','K']}:{suits:['♠','♥','♦','♣'],ranks:['A','2']}};
 if(process.env.BENCH_PROFILE)Object.assign(base,JSON.parse(process.env.BENCH_PROFILE));
 // 與主頁 sideDiff 相同：莊局數與（閒＋和）局數的差
 const gap=cards=>{const pts=cards.map(c=>c.point);let b=0,n=0;for(let a=0;a<pts.length;){const h=B.simulateHand(pts,a,pts.length);if(!h)break;n++;if(h.result==='莊')b++;a+=h.size;}return Math.abs(2*b-n);},gaps=[];
 const reasons={};let seed=70000;
 for(let d=1;d<=DECKS;d++){const t=performance.now();let tries=0,r=null;
  while(tries<MAX){tries++;r=await B.build({...base,rng:rng(++seed)});if(r.cards&&!r.rejected&&(!r.tailFill||r.tailFill.fullOk)){const g=gap(r.cards);gaps.push(g);if(base.sideLimit==null||g<=base.sideLimit)break;reasons['莊閒差距超過上限']=(reasons['莊閒差距超過上限']||0)+1;r=null;continue;}const why=(r.tailFill?.reason||'').replace(/\d+/g,'N')||'其他';reasons[why]=(reasons[why]||0)+1;r=null;}
  console.log(`第${d}副：${r?`嘗試 ${tries} 次排出，剩牌 ${r.leftoverCount}，範本接走 ${r.templateLibrary?.length||0} 張`:`${MAX} 次內排不出`}｜${((performance.now()-t)/1000).toFixed(1)} 秒`);}
 console.log('失敗原因次數：'+JSON.stringify(reasons));
 if(gaps.length)console.log(`完整排出的牌莊閒差距：平均 ${(gaps.reduce((a,b)=>a+b,0)/gaps.length).toFixed(1)}｜≤3 ${gaps.filter(g=>g<=3).length}/${gaps.length}`);
})().catch(e=>{console.error(e);process.exitCode=1;});
