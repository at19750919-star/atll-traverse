// Isolated File System Access API double backed by temporary OS files.
const fs=require('node:fs'),path=require('node:path');
function directory(folder,state={}){
 fs.mkdirSync(folder,{recursive:true});
 return {name:path.basename(folder),kind:'directory',queryPermission:async()=>state.permission||'granted',requestPermission:async()=>{state.requests=(state.requests||0)+1;return state.permission||'granted';},
 entries:async function*(){for(const n of fs.readdirSync(folder))yield[n,{}];},
 getFileHandle:async(name,opt={})=>{if(!/^(index|(?:8|9|10|11|12)-\d+-[ab])\.json$/.test(name))throw Error('Unexpected filename '+name);const file=path.join(folder,name);
 if(!fs.existsSync(file)&&!opt.create)throw Object.assign(Error('missing'),{name:'NotFoundError'});
 return {getFile:async()=>{const stat=fs.statSync(file);return {size:stat.size,lastModified:stat.mtimeMs,text:async()=>fs.readFileSync(file,'utf8')};},createWritable:async()=>{let text;return {write:async data=>{text=data;},close:async()=>{if(state.fail===true||state.fail===name)throw Error('injected close failure');fs.writeFileSync(file,text);state.writes=(state.writes||0)+1;},abort:async()=>{}};}};}};
}
module.exports={directory};
