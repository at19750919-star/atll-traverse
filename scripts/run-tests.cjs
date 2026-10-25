// 逐一執行 scripts/test-*.cjs；NODE_PATH 由執行環境提供。
// node scripts/run-tests.cjs [test-name ...]
// 詳細輸出及 results.json 放系統暫存目錄，不提交測試產物。
const fs=require('fs'),path=require('path'),os=require('os'),{spawn,spawnSync}=require('child_process');
const all=fs.readdirSync(__dirname).filter(n=>/^test-.*\.cjs$/.test(n)).sort();
const selected=process.argv.slice(2);const names=selected.length?selected.map(n=>n.endsWith('.cjs')?n:n+'.cjs'):all;
if(names.includes('test-recovery-plateau.cjs')&&names.includes('test-red0-recovery.cjs')){names.splice(names.indexOf('test-red0-recovery.cjs'),1);names.splice(names.indexOf('test-recovery-plateau.cjs'),0,'test-red0-recovery.cjs');}
if(names.includes('test-recovery-incremental.cjs')&&names.includes('test-targeted-recovery.cjs')){names.splice(names.indexOf('test-targeted-recovery.cjs'),1);names.splice(names.indexOf('test-recovery-incremental.cjs'),0,'test-targeted-recovery.cjs');}
const area=fs.mkdtempSync(path.join(os.tmpdir(),'atll-suite-')),results=[];console.log('LOGS '+area);
(async()=>{for(const [i,name]of names.entries()){
 const file=path.join(area,name+'.log'),fd=fs.openSync(file,'w'),start=Date.now();console.log(`RUN ${i+1}/${names.length} ${name}`);
 const code=await new Promise(resolve=>{const c=spawn(process.execPath,[path.join(__dirname,name)],{stdio:['ignore',fd,fd],windowsHide:true});const timer=setTimeout(()=>{spawnSync('taskkill',['/pid',String(c.pid),'/T','/F'],{windowsHide:true});},360000);c.on('exit',code=>{clearTimeout(timer);resolve(code);});});fs.closeSync(fd);
 const row={name,code,ms:Date.now()-start,file};results.push(row);fs.writeFileSync(path.join(area,'results.json'),JSON.stringify(results,null,2));console.log(`${code===0?'PASS':'FAIL'} ${name} ${(row.ms/1000).toFixed(1)}s`);if(code!==0)console.log(fs.readFileSync(file,'utf8').split('\n').slice(-10).join('\n').slice(-1600));
 // 還原測試改寫的既有 validation 檔；git show 不需寫入 .git/index。新產物留給相依測試使用。
 const dirty=spawnSync('git',['diff','--name-only','--','scripts/validation/'],{windowsHide:true,encoding:'utf8'}).stdout.trim().split('\n').filter(Boolean);
 for(const f of dirty){const original=spawnSync('git',['show','HEAD:'+f],{windowsHide:true,maxBuffer:100*1024*1024});if(original.status!==0)throw Error(original.stderr.toString());fs.writeFileSync(f,original.stdout);}

}if(results.some(r=>r.code!==0))process.exitCode=1;console.log(JSON.stringify({pass:results.filter(r=>r.code===0).length,fail:results.filter(r=>r.code!==0).length,total:results.length,area}));})().catch(e=>{console.error(e);process.exitCode=1;});
