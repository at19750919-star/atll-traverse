// Browser integration with an isolated OS directory; native picker permissions are simulated.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {chromium}=require('playwright'),{directory}=require('./template-test-directory.cjs');
const ROOT=path.resolve(__dirname,'..'),area=fs.mkdtempSync(path.join(os.tmpdir(),'atll-template-browser-'));
const state={},dir=directory(area,state),real=JSON.parse(fs.readFileSync(path.join(__dirname,'template-real-over64.json'),'utf8'));
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const context=await browser.newContext(),p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('https://**',r=>r.fulfill({body:''}));
 await p.route('https://atll.test/**',r=>{const f=path.resolve(ROOT,'.'+new URL(r.request().url()).pathname);return r.fulfill({body:fs.readFileSync(f),contentType:f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':'text/html'});});
 await p.exposeFunction('diskRead',async name=>{try{const f=await(await dir.getFileHandle(name)).getFile();return {text:await f.text(),size:f.size,lastModified:f.lastModified};}catch(e){return {error:e.name};}});
 await p.exposeFunction('diskWrite',async(name,text)=>{const w=await(await dir.getFileHandle(name,{create:true})).createWritable();await w.write(text);await w.close();});
 await p.exposeFunction('diskNames',()=>fs.readdirSync(area));
 async function connect(){await p.evaluate(()=>{
  globalThis.permission='granted';globalThis.closeDelay=0;
  globalThis.makeDirectory=()=>({name:'test-banks',kind:'directory',queryPermission:async()=>permission,requestPermission:async()=>permission,
   entries:async function*(){for(const n of await diskNames())yield[n,{}];},
   getFileHandle:async(name,opt={})=>{const f=await diskRead(name);if(f.error&&!opt.create)throw new DOMException('missing','NotFoundError');return {getFile:async()=>{const v=await diskRead(name);if(v.error)throw Error(v.error);return {...v,text:async()=>v.text};},createWritable:async()=>{let text;return {write:async v=>{text=v;},close:async()=>{await new Promise(r=>setTimeout(r,closeDelay));await diskWrite(name,text);},abort:async()=>{}};}};}});
  showDirectoryPicker=async()=>makeDirectory();return TraverseTemplateFile.connect();
 });}
 await p.goto('https://atll.test/integrated.html');await p.waitForFunction(()=>!!window.IntegratedModes);await p.evaluate(()=>TraverseTemplateFile.ready);
 await p.evaluate(points=>TraverseTemplates.collect(points),real.slice(0,5));await connect();assert.equal(await p.evaluate(()=>TraverseTemplates.stats().templates),5);assert.equal(await p.evaluate(()=>TraverseTemplates.pendingCount()),0);
 const manifest=()=>fs.readFileSync(path.join(area,'index.json'),'utf8');const prior=manifest();
 await p.evaluate(points=>TraverseTemplates.collect(points),real.slice(5,9));state.fail='index.json';const failed=await p.evaluate(()=>TraverseTemplateFile.flush());assert(failed.dirty&&failed.fileError);assert.equal(manifest(),prior);state.fail=false;await p.evaluate(()=>TraverseTemplateFile.flush());assert.equal(await p.evaluate(()=>TraverseTemplates.stats().templates),9);assert.equal(await p.evaluate(()=>TraverseTemplates.pendingCount()),0);console.log('PASS actual partition/index writes; failed close retains pending and committed index; retry restores');
 await p.evaluate(points=>TraverseTemplates.collect(points),real.slice(9,10));await p.evaluate(()=>permission='denied');const denied=await p.evaluate(()=>TraverseTemplateFile.flush());assert(denied.needsPermission&&denied.dirty);await p.evaluate(()=>{permission='granted';return TraverseTemplateFile.resume();});assert.equal(await p.evaluate(()=>TraverseTemplates.stats().templates),10);console.log('PASS permission loss and explicit resume');
 await p.evaluate(async points=>{const other=await new TraverseTemplateBanks.BankStore(makeDirectory()).open();await other.merge(points.map(p=>TraverseTemplates.validate({points:p,key:TraverseTemplates.key(p),rules:TraverseTemplates.constants.RULES,flags:{tripleTie:false,signalRule:true,strong:false,secondStart:false,skipBanker6:false,skipPlayer7:false}})));},real.slice(10,11));
 await p.evaluate(points=>TraverseTemplates.collect(points),real.slice(11,12));await p.evaluate(()=>TraverseTemplateFile.flush());assert.equal(await p.evaluate(()=>TraverseTemplates.stats().templates),12);
 const stable=manifest();await assert.rejects(()=>p.evaluate(()=>TraverseTemplateFile.importJSON('{')));assert.equal(manifest(),stable);
 await p.evaluate(()=>{showDirectoryPicker=async()=>{throw new DOMException('cancel','AbortError');};return TraverseTemplateFile.connect();});assert.equal(manifest(),stable);console.log('PASS external writer merged, malformed import and picker cancellation preserve committed files');
 await connect();await p.evaluate(()=>{IntegratedModes.switchMode('traverse-red0');globalThis.shoeBefore=JSON.stringify(IntegratedModes.traversal.result);globalThis.rulesBefore=JSON.stringify(TraverseBuilder.rules);closeDelay=30;document.getElementById('tvTemplateStart').click();});
 await p.waitForFunction(()=>TraverseTemplates.pendingCount()>0);await p.evaluate(()=>document.getElementById('tvTemplateStop').click());await p.waitForFunction(()=>TraverseTemplateFile.status().saving);assert(await p.evaluate(()=>IntegratedModes.busy));await p.waitForFunction(()=>!IntegratedModes.busy);assert(await p.evaluate(()=>JSON.stringify(IntegratedModes.traversal.result)===shoeBefore&&JSON.stringify(TraverseBuilder.rules)===rulesBefore));assert.equal(await p.evaluate(()=>TraverseTemplates.pendingCount()),0);console.log('PASS collector stop waits for physical saves and preserves shoe/rules');
 const count=await p.evaluate(()=>TraverseTemplates.stats().templates);await p.evaluate(()=>TraverseTemplateFile.flush());await p.reload();await p.waitForFunction(()=>!!window.IntegratedModes);await p.evaluate(()=>TraverseTemplateFile.ready);await connect();assert.equal(await p.evaluate(()=>TraverseTemplates.stats().templates),count);console.log('PASS fresh page reconnect reads saved OS directory (mock picker, not native permission persistence)');
 await p.evaluate(()=>showDirectoryPicker=undefined);await assert.rejects(()=>p.evaluate(()=>TraverseTemplateFile.connect()));assert.deepEqual(errors,[]);console.log('PASS unsupported directory picker; no browser errors');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
