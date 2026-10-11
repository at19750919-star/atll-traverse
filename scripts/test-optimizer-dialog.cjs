const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const listeners = {}, nodes = {};
const document = { activeElement:null, getElementById: id => nodes[id] };
const window = { innerWidth:1400, innerHeight:900, addEventListener:(type, fn) => { listeners[type] = fn; } };
for (const id of ['optimizerPanel','optimizerHandle','btnOptOpen','btnOptClose']) {
  nodes[id] = { id, hidden:false, disabled:false, style:{}, events:{}, classList:{ add() {}, remove() {} },
    addEventListener(type, fn) { this.events[type] = fn; },
    focus() { document.activeElement = this; },
    getBoundingClientRect() { return { left:parseFloat(this.style.left ?? '16'), top:parseFloat(this.style.top ?? '16'),
      width:Math.min(1060,window.innerWidth-32), height:this.id === 'optimizerHandle' ? 80 : Math.min(700,window.innerHeight-32) }; },
    contains(n) { return n === nodes.optimizerHandle || n === nodes.btnOptClose; },
    setPointerCapture(id) { this.capture = id; }, hasPointerCapture(id) { return this.capture === id; },
    releasePointerCapture() { this.capture = null; },
  };
}
const {optimizerPanel:panel,optimizerHandle:handle,btnOptOpen:open,btnOptClose:close} = nodes;
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../traverse_optimizer_dialog.js'),'utf8'), {window,document});
const dialog = window.OptimizerDialog;
dialog.reset(); assert.ok(panel.hidden && open.disabled);
dialog.show(); assert.equal(panel.hidden,false); assert.equal(open.disabled,false); assert.equal(document.activeElement,handle);
const before = panel.getBoundingClientRect();
handle.events.pointerdown({button:0,pointerId:1,clientX:before.left+20,clientY:before.top+20,target:{closest:()=>null},preventDefault(){}});
handle.events.pointermove({pointerId:1,clientX:before.left+100,clientY:before.top+70});
assert.equal(panel.getBoundingClientRect().left,before.left+80);
assert.equal(panel.getBoundingClientRect().top,before.top+50);
handle.events.pointermove({pointerId:1,clientX:9999,clientY:9999});
assert.equal(panel.getBoundingClientRect().left,1240); assert.equal(panel.getBoundingClientRect().top,868);
handle.events.pointermove({pointerId:1,clientX:-9999,clientY:-9999});
assert.equal(panel.getBoundingClientRect().left,-900); assert.equal(panel.getBoundingClientRect().top,-48);
handle.events.pointermove({pointerId:1,clientX:before.left+100,clientY:before.top+70});
assert.equal(panel.getBoundingClientRect().left,before.left+80, 'can drag back from off-screen');
handle.events.pointermove({pointerId:1,clientX:9999,clientY:9999});
handle.events.pointercancel();
handle.events.pointermove({pointerId:1,clientX:0,clientY:0}); assert.equal(panel.getBoundingClientRect().left,1240);
handle.events.keydown({target:handle,key:'ArrowLeft',preventDefault(){}}); assert.equal(panel.getBoundingClientRect().left,1230);
panel.events.keydown({key:'Escape',preventDefault(){}}); assert.ok(panel.hidden); assert.equal(document.activeElement,open);
open.events.click(); assert.equal(panel.hidden,false); assert.equal(panel.getBoundingClientRect().left,1230);
window.innerWidth=390; window.innerHeight=700; listeners.resize();
assert.equal(panel.getBoundingClientRect().left,230); assert.equal(panel.getBoundingClientRect().top,668);
handle.events.pointerdown({button:0,target:{closest:()=>close}}); assert.equal(handle.capture,null);
close.events.click(); assert.ok(panel.hidden); assert.equal(open.disabled,false);
open.events.click(); dialog.reset(); assert.ok(panel.hidden && open.disabled);
console.log('PASS dialog: drag, boundaries, cancellation, keyboard, Escape, focus return, reopen, resize, close, reset');
