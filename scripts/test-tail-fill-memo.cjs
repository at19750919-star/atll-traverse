// 敏感補排搜尋加速前後比對：同一剩牌、同一設定下，逐筆提出的分局順序與最終狀態要完全相同
// ATLL_TAIL_BASELINE 指向修改前的 traverse_tail_fill.js；未提供時只檢查新版能在時限內結束
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const ROOT=process.env.ATLL_ROOT||path.resolve(__dirname,'..'),BASE=process.env.ATLL_TAIL_BASELINE;
function engine(tailFile){const c=vm.createContext({console,setTimeout,clearTimeout,performance,localStorage:{getItem:()=>null}});
 for(const f of ['standard/two_thirteen_reversals.js','card_color_rules.js','traverse_builder.js'])vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'),c);
 vm.runInContext(fs.readFileSync(tailFile,'utf8'),c);return c;}
const rng=seed=>()=>{let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};
function pool(r,n){const deck=[];for(let p=1;p<=9;p++)for(let k=0;k<32;k++)deck.push(p);for(let k=0;k<128;k++)deck.push(0);for(let i=deck.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}return deck.slice(0,n);}
async function run(c,cards,options,limit=60,ms=Infinity){const end=performance.now()+ms,it=c.TraverseTailFill.search(cards,{...options,rng:rng(7)},{cancelled:()=>performance.now()>end});const out=[];let step;
 while(!(step=await it.next()).done){out.push(step.value.rounds.map(h=>h.join('')).join('|'));if(out.length>=limit){await it.return();return {out,status:'limit'};}}
 return {out,status:step.value.status,reason:step.value.reason,stats:step.value};}
(async()=>{
 const now=engine(path.join(ROOT,'traverse_tail_fill.js')),old=BASE?engine(BASE):null,r=rng(2026);
 const variants=[{tripleTie:true},{tripleTie:false},{tripleTie:true,previousTrip:true,firstTie:true},{tripleTie:false,a2Signal:true,signalConfig:{suits:['♠','♥','♦','♣'],ranks:['A','2']},firstResult:'閒'},
  {tripleTie:true,sizeLimits:{4:{min:null,max:20},5:{min:null,max:20},6:{min:null,max:20}},baseCounts:{4:18,5:19,6:17,tie:8},tieMax:9}];
 let cases=0,same=0,slow=0;
 for(let i=0;i<60;i++){const n=[8,9,10,11,12,13,14,16][i%8],cards=pool(r,n),o=variants[i%variants.length];
  const a=await run(now,cards,o,60,60000);cases++;assert.notEqual(a.status,'cancelled',`第${i}組新版60秒內未結束`);
  // 舊版在部分無解剩牌上跑不完，只比對舊版限時內結束的組；舊版提出過的分局，新版必須同順序提出
  if(old){const b=await run(old,cards,o,60,15000);if(b.status==='cancelled'){slow++;assert.deepEqual(a.out.slice(0,b.out.length),b.out,`第${i}組前段分局順序不同`);}else{assert.deepEqual(a.out,b.out,`第${i}組分局順序不同`);assert.equal(a.status,b.status,`第${i}組最終狀態不同`);same++;}}
 }
 console.log(`PASS ${cases} 組剩牌${old?`：${same} 組與修改前逐筆相同，${slow} 組舊版15秒跑不完、已提出部分相同`:'新版可結束'}`);
 // 範本測試的種子103會剩25張且無解：修改前90秒仍未結束，新版要能在時限內確定無解
 const c=vm.createContext({console,setTimeout,clearTimeout,performance,localStorage:{getItem:()=>null,setItem:()=>{}}});
 for(const f of ['standard/two_thirteen_reversals.js','card_color_rules.js','traverse_builder.js','traverse_red0_balance.js','traverse_tail_fill.js','traverse_templates.js'])vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'),c);
 const t=performance.now(),res=await Promise.race([c.TraverseBuilder.build({idleLimit:100,computeTries:1000,chainAttempts:2,minLen:8,maxLen:12,tripleTie:false,secondStart:false,signalRule:true,signalConfig:{suits:['♥','♦'],ranks:['10','J','Q','K']},sideLimit:2,rejectAbove:25,red0Balance:true,fillSensitiveTail:true,rng:rng(103)}),new Promise(r=>setTimeout(()=>r(null),60000))]);
 assert(res,'種子103在60秒內未結束');assert.equal(res.leftoverCount,25);assert.equal(res.tailFill.status,'infeasible');
 console.log(`PASS 種子103剩25張無解，在 ${((performance.now()-t)/1000).toFixed(1)} 秒內確定（記憶略過 ${res.tailFill.deadSkips} 次）`);process.exit(process.exitCode||0);
})().catch(e=>{console.error(e);process.exitCode=1;});
