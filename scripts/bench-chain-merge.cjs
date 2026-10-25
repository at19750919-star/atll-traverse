// 長段合併前後比較：同一種子各排一次（關／開），量長段條數與整副平均、最大回復
// 用法：node scripts/bench-chain-merge.cjs [種子數]；BENCH_PROFILE 可覆寫排牌設定
const fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.resolve(__dirname,'..'),N=Number(process.argv[2]||20);
const c=vm.createContext({console,setTimeout,clearTimeout,performance,localStorage:{getItem:()=>null,setItem:()=>{}}});
for(const f of ['standard/two_thirteen_reversals.js','card_color_rules.js','traverse_quota.js','traverse_builder.js','traverse_red0_balance.js','traverse_tail_fill.js'])vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'),c);
const B=c.TraverseBuilder,rng=seed=>()=>{let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};
// 與主頁回復分析相同：從每個切點發牌，接回任一原局起點為止（不對調）
function recovery(pts){const n=pts.length,starts=new Set();for(let a=0;a<n;){starts.add(a);a+=B.simulateHand(pts,a,n).size;}
 let sum=0,maxCards=0,maxRounds=0,over5=0;
 for(let cut=0;cut<n;cut++){if(starts.has(cut))continue;const rot=pts.slice(cut).concat(pts.slice(0,cut));let at=0,r=0;
  while(at<n){const h=B.simulateHand(rot,at,n);if(!h)break;at+=h.size;r++;if(starts.has((cut+at)%n))break;}
  sum+=r;if(r>5)over5++;if(at>maxCards)maxCards=at;if(r>maxRounds)maxRounds=r;}
 return {avg:sum/n,maxCards,maxRounds,over5};}
const base={idleLimit:1000,computeTries:20000,chainAttempts:20,minLen:8,maxLen:12,tripleTie:false,signalRule:true,skipPlayer7:true,
 signalConfig:{suits:['♥','♦'],ranks:['10','J','Q','K']},sideLimit:8,red0Balance:true,fillSensitiveTail:true,templateLibrary:false,templateCompute:false};
if(process.env.BENCH_PROFILE)Object.assign(base,JSON.parse(process.env.BENCH_PROFILE));
(async()=>{const rows={off:[],on:[]};
 for(let s=1;s<=N;s++)for(const mode of ['off','on']){const t=performance.now(),r=await B.build({...base,chainMerge:mode==='on',rng:rng(9000+s)});if(!r.cards)continue;rows[mode].push({seed:s,chains:r.chains.length,ms:performance.now()-t,...recovery(r.cards.map(x=>x.point))});}
 const sum=list=>{const avg=k=>list.reduce((n,x)=>n+x[k],0)/list.length;return `完成 ${list.length} 副｜長段 ${avg('chains').toFixed(1)} 條｜平均回復 ${avg('avg').toFixed(2)} 局｜最大回復平均 ${avg('maxCards').toFixed(1)} 張／${avg('maxRounds').toFixed(1)} 局｜最差一副 ${Math.max(...list.map(x=>x.maxCards))} 張／${Math.max(...list.map(x=>x.maxRounds))} 局｜超過5局的切點 ${avg('over5').toFixed(1)} 個/副｜每副 ${(avg('ms')/1000).toFixed(1)} 秒`;};
 console.log('原本接段：'+sum(rows.off));console.log('合併長段：'+sum(rows.on));
 const both=rows.off.filter(x=>rows.on.some(y=>y.seed===x.seed));
 console.log('同種子（長段條數、平均回復、最大張數 關→開）：'+both.map(x=>{const y=rows.on.find(z=>z.seed===x.seed);return `${x.chains}→${y.chains}條 ${x.avg.toFixed(2)}→${y.avg.toFixed(2)} ${x.maxCards}→${y.maxCards}張`;}).join('｜'));
})().catch(e=>{console.error(e);process.exitCode=1;});
