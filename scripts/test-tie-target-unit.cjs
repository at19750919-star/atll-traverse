const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const T=require('../tie_spread.js');
const make=(n,ties)=>Array.from({length:n},(_,i)=>({id:i+1,result:ties.includes(i+1)?'和':'閒',signal:false,cards:Array.from({length:4+i%3},(_,j)=>({id:`${i+1}:${j}`}))}));
const hasSignal=r=>r.signal;
const valid=rs=>rs.every((r,i)=>{const prev=rs[(i+rs.length-1)%rs.length];return (r.result==='莊'?prev.signal:!prev.signal)&&!(r.result==='和'&&rs[(i+1)%rs.length].result==='和');});
const verify=(input,out)=>{assert.deepEqual(out.rounds.map(r=>r.id).sort((a,b)=>a-b),input.map(r=>r.id));assert.deepEqual(out.rounds.flatMap(r=>r.cards).map(c=>c.id).sort(),input.flatMap(r=>r.cards).map(c=>c.id).sort());for(const t of out.targets)assert.equal(out.rounds.findIndex(r=>r.id===t.original)+1,t.actual);};
(async()=>{
 let input=make(80,[1,3,5,7]),out=await T.disperse(input,{hasSignal,validate:valid});
 assert.deepEqual(out.after.positions,[10,30,50,70]);assert.deepEqual(out.targets.map(t=>t.ideal),[10,30,50,70]);verify(input,out);
 for(let i=0;i<80;i++)if(![0,2,4,6,9,29,49,69].includes(i))assert.equal(out.rounds[i],input[i],'中間局序必須不動');
 console.log('PASS 80局4和直接交換到10/30/50/70；未涉及的中間牌局完全不動、每局牌張與牌庫保留');
 for(const [n,positions] of [[10,[]],[10,[1]],[10,[4]],[10,[10]],[8,[3,5,7]],[3,[1]]]){
  input=make(n,positions);out=await T.disperse(input,{hasSignal,validate:valid});verify(input,out);assert.equal(out.after.positions.length,positions.length);assert(out.targets.every(t=>t.target>=1&&t.target<=n));assert.equal(new Set(out.targets.map(t=>t.actual)).size,out.targets.length);assert(valid(out.rounds));
 }
 out=await T.disperse(make(10,[1]),{hasSignal,validate:valid});assert.deepEqual(out.after.positions,[5]);
 out=await T.disperse(make(10,[4]),{hasSignal,validate:valid});assert.deepEqual(out.after.positions,[5]);
 out=await T.disperse(make(8,[3,5,7]),{hasSignal,validate:valid});assert.equal(out.targets[0].actual,1);
 console.log('PASS 0/1/多和局、單局四捨五入、相鄰直接交換、首尾候選及已分配位置不被覆蓋');
 input=make(20,[1,3]);out=await T.disperse(input,{hasSignal,validate:()=>({ok:false,reason:'測試：原限制不符'})});assert.deepEqual(out.rounds,input);assert(out.targets.every(t=>t.reason.includes('原限制不符')));assert(out.checks<=input.length*2);
 input=make(20,[1]);input[0].signal=true;out=await T.disperse(input,{hasSignal,validate:()=>{throw Error('不得交換含訊號和局');}});assert.equal(out.moves,0);assert(out.targets[0].reason.includes('交換前提'));
 let stopped=false;input=make(20,[1]);out=await T.disperse(input,{hasSignal,shouldStop:()=>stopped,validate:async()=>{stopped=true;return true;}});assert(out.cancelled);assert.deepEqual(out.rounds,input);assert.equal(out.moves,0);
 assert(!/score|cluster|maxChecks|maxMs|extraUnits|splice|pass\s*</.test(fs.readFileSync(path.join(__dirname,'..','tie_spread.js'),'utf8')));
 console.log('PASS 候選不足保留原位並列原因、穿越含訊號和局安全跳過、取消不採用候選；舊評分／插入／輪次時間預算已移除');
})().catch(e=>{console.error(e);process.exitCode=1;});
