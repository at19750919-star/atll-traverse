const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('../traverse_builder.js'); require('../traverse_export.js'); require('../traverse_optimizer.js');
const B = globalThis.TraverseBuilder, E = globalThis.TraverseExport, O = globalThis.TraverseOptimizer;
const demo = JSON.parse(fs.readFileSync(path.join(__dirname,'validation/optimizer-demo-2026-10-08.json'),'utf8'));
const identity = cards => cards.map(c => `${c.rank}|${c.suit}|${c.back_color}`).sort();
let seed = 42;
const rng = () => { seed = (Math.imul(seed,1664525)+1013904223) >>> 0; return seed / 4294967296; };
for (const cut of [0,1,5,36,113,207,350,415]) {
  const cards = E.cutDeck(O.prepare(demo.after),cut), saved = JSON.stringify(cards);
  const result = B.reassignColors(cards,rng);
  assert.equal(result.ok,true, `cut ${cut}`);
  assert.equal(JSON.stringify(cards),saved,'input unchanged');
  assert.deepEqual(identity(result.cards),identity(cards),'same full red/blue deck inventory');
  assert.deepEqual(result.cards.map(({back_color,...c})=>c), cards.map(({back_color,...c})=>c),'faces and metadata stay at the same positions');
  assert.ok(E.dealRounds(result.cards).filter(r=>r.hand).every(r=>['RRRB','BBBR'].includes(r.cards.slice(0,4).map(c=>c.back_color).join(''))));
  assert.deepEqual(O.analyze(result.cards),O.analyze(cards),'all 416 point-only cut results unchanged');
}
const impossible = Array.from({length:4},()=>({rank:'9',suit:'♠',point:9,back_color:'R'}));
const saved = JSON.stringify(impossible), failed = B.reassignColors(impossible,()=>0);
assert.equal(failed.ok,false); assert.equal(JSON.stringify(impossible),saved); assert.equal(failed.cards,impossible);
assert.throws(()=>B.reassignColors([{point:9}]),/資料不完整/);
console.log('PASS recolor: 8 cut positions, unchanged faces/points/metadata, full inventory, RRRB/BBBR, all cut scores, failure preserves input');
