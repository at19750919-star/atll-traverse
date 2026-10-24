const assert=require('node:assert/strict');
const {solve}=require('../standard/red0_balance.js');
const choice=(result,cap=0,rare=0)=>({result,cap,rare,b6:0,seven:0,swap:0,flip:0});
(async()=>{
 const rows=Array.from({length:8},()=>[choice('莊',2),choice('閒')]);
 const config={signals:6,free:0,minB:4,maxB:4,b6Max:null,sevenMax:null,rareMax:null,swapMin:0,swapMax:null};
 const ok=await solve(rows,config);assert(ok.ok);assert.equal(ok.banker,4);assert(ok.choices.reduce((s,x)=>s+x.cap,0)>=6);
 assert(!(await solve(rows,{...config,signals:3})).ok);
 const capacity=await solve(rows,{...config,signals:20});assert(!capacity.ok&&capacity.reason.includes('容量'));
 const free=await solve(rows,{...config,signals:9,free:2});assert(free.ok);
 assert((await solve(rows,{...config,shouldStop:()=>true})).cancelled);
 const rare=Array.from({length:25},(_,i)=>[choice(i%2?'閒':'莊',i%2?0:1,i===0||i===21?1:0)]);
 const limits={...config,signals:13,minB:13,maxB:13,rareMax:2};assert(!(await solve(rare,limits)).ok);assert((await solve(rare,{...limits,rareMax:null})).ok);
 console.log('PASS signal count / zero capacity / free triple capacity / fixed B target / finite reversal spacing / unlimited / cancellation');
})().catch(e=>{console.error(e);process.exitCode=1});
