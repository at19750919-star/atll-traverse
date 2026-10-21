const assert = require('node:assert/strict');
const rules = require('../standard/two_thirteen_reversals.js');
const rank = n => n === 0 ? 'K' : n === 1 ? 'A' : String(n);
const make = (p,b,t,kind='閒+有訊號') => ({kind,cards:[0,0,p,b,t].map(n=>({rank:rank(n)}))});
const rare = () => make(3,6,5);
const normal = () => make(4,6,3); // 3/13，屬一般局，結果亦為閒。
const keyFor = r => r.kind;
const fixture = n => Array.from({length:n},()=>make(4,6,3,'其他類型'));
(async()=>{
    const rounds=fixture(50);rounds[0]=rare();rounds[5]=rare();rounds[27]=normal();
    const before=rounds.slice(),bag=rounds.flatMap(r=>r.cards);
    const repaired=await rules.repairSpacing(rounds,{keyFor});
    assert(repaired.ok);assert.deepEqual(rules.check(repaired.rounds,null).roundNumbers,[1,28]);
    assert.deepEqual(rounds,before,'搜尋不可改原陣列');
    assert.equal(repaired.swaps.length,1);
    repaired.rounds.forEach((r,i)=>assert.equal(r.kind,rounds[i].kind,'每個位置的類型不變'));
    assert.equal(new Set(repaired.rounds).size,rounds.length);
    assert(bag.every(c=>repaired.rounds.some(r=>r.cards.includes(c))));
    assert(repaired.rounds.every(r=>rounds.includes(r)),'整局引用及局內牌序均保留');
    console.log('PASS 同結果同訊號整局交換；牌局、局內牌序、完整牌庫保留，原輸入不變');

    const mixed=fixture(48);mixed[0]=rare();mixed[5]=make(1,6,8);mixed[22]=normal();
    const mixedResult=await rules.repairSpacing(mixed,{keyFor});
    assert(mixedResult.ok);assert.deepEqual(rules.check(mixedResult.rounds,null).roundNumbers,[1,23]);
    mixed[22]=make(4,6,3,'閒+無訊號');
    const noDonor=await rules.repairSpacing(mixed,{keyFor});
    assert.equal(noDonor.ok,false);assert.equal(mixed[5].cards[2].rank,'A');
    console.log('PASS 1/13與2/13混合間隔、最早第23局、不同訊號候選不可交換、無解不改牌');

    const global=fixture(70);for(const i of [0,5,10])global[i]=rare();
    for(const i of [22,44,66])global[i]=normal();
    const globalResult=await rules.repairSpacing(global,{keyFor});
    assert(globalResult.ok);assert(rules.check(globalResult.rounds,null).okSpacing);
    assert.equal(rules.count(globalResult.rounds),3);
    let rejected=0;
    const alternate=await rules.repairSpacing(global,{keyFor,validate:r=>{rejected++;return rules.check(r,null).roundNumbers.includes(67);}});
    assert(alternate.ok);assert(rejected>1,'必須回溯，不只接受第一種交換');
    console.log('PASS 多次逆轉的全局位置搜尋；其他規則拒絕第一方案後能繼續尋找');

    const locked=fixture(28);locked[6]=rare();locked[27]=rare();locked[0]=normal();
    const lockedResult=await rules.repairSpacing(locked,{keyFor,canMove:i=>i!==27});
    assert(lockedResult.ok);assert.equal(lockedResult.rounds[27],locked[27]);
    assert.deepEqual(rules.check(lockedResult.rounds,null).roundNumbers,[1,28]);
    const stopped=await rules.repairSpacing(global,{keyFor,shouldStop:()=>true});
    assert.equal(stopped.stopped,true);assert.equal(stopped.ok,false);
    const budget=await rules.repairSpacing(global,{keyFor,maxNodes:0});
    assert.equal(budget.exhausted,true);assert.equal(budget.ok,false);
    const recoveryReject=await rules.repairSpacing(rounds,{keyFor,validate:()=>false});
    assert.equal(recoveryReject.ok,false);assert.deepEqual(rounds,before);
    console.log('PASS 末局鎖定、停止、搜尋上限、其他規則拒絕時原牌保留');
})().catch(e=>{console.error(e);process.exitCode=1;});
