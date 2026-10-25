// 對調莊6標記：依目前表格每列的實際牌面判斷（切牌、轉牌後也對得上），整行亮底且不改終欄字色
const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const ROOT=path.resolve(process.env.ATLL_ROOT||path.join(__dirname,'..'));
const check=async(p,label)=>{
 const r=await p.evaluate(()=>{const rows=[...document.querySelectorAll('#roundsBody tr[data-r]')];let marked=0,wrong=[],missed=[],colorChanged=[];
  for(const row of rows){const i=Number(row.dataset.r),round=lastRenderedRounds[i];const sw=round.cards.slice();[sw[0],sw[1]]=[sw[1],sw[0]];const h=computeRoundHands(sw);
   const want=h.bankerTotal===6&&h.playerTotal<=5,has=row.classList.contains('swap-banker-six-row');if(has)marked++;if(has&&!want)wrong.push(i+1);if(want&&!has)missed.push(i+1);
   const cell=row.querySelector('td.result-cell');if(cell&&cell.classList.contains('swap-banker-six-result'))colorChanged.push(i+1);
   if(has&&cell){const exp=cell.classList.contains('outcome-banker')?'rgb(255, 157, 143)':cell.classList.contains('outcome-player')?'rgb(124, 192, 234)':cell.classList.contains('outcome-tie')?'rgb(127, 216, 168)':null;const got=getComputedStyle(cell).color;if(exp&&got!==exp&&!row.classList.contains('two-thirteen-reversal')&&!cell.classList.contains('banker-six-point'))colorChanged.push(i+1);}}
  // 調欄依莊／閒／和上色；1／13、2／13 逆轉列不再加文字
  const colors={'outcome-banker':'rgb(255, 157, 143)','outcome-player':'rgb(124, 192, 234)','outcome-tie':'rgb(127, 216, 168)'},badCompare=[],oddsText=[];
  for(const row of rows){const c=row.querySelector('td.compare-cell'),k=c&&Object.keys(colors).find(x=>c.classList.contains(x));if(k&&getComputedStyle(c).color!==colors[k])badCompare.push(Number(row.dataset.r)+1);
   const rc=row.querySelector('td.result-cell');if(rc&&!['none','normal',''].includes(getComputedStyle(rc,'::after').content))oddsText.push(Number(row.dataset.r)+1);}
  const bg=rows.find(r=>r.classList.contains('swap-banker-six-row'));
  return {rows:rows.length,marked,wrong,missed,colorChanged,badCompare,oddsText,bg:bg?getComputedStyle(bg.querySelector('td')).backgroundColor:null};});
 assert(r.rows>50,label+' 表格未產生');assert.deepEqual(r.wrong,[],label+' 有標錯的局');assert.deepEqual(r.missed,[],label+' 有漏標的局');assert.deepEqual(r.colorChanged,[],label+' 終欄字色被改');assert.deepEqual(r.badCompare,[],label+' 調欄字色不符');assert.deepEqual(r.oddsText,[],label+' 逆轉列仍有文字');
 console.log(`PASS ${label}：${r.rows} 局、標記 ${r.marked} 局全部正確，整行底色 ${r.bg||'（本副無標記）'}，字色未改`);return r;};
(async()=>{const browser=await chromium.launch();try{const p=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('https://**',r=>r.request().url().includes('exceljs')?r.continue():r.fulfill({body:''}));
 await p.goto(pathToFileURL(path.join(ROOT,'integrated.html')).href);await p.waitForFunction(()=>!!window.IntegratedModes);
 // 一般紅0：實際生成，再切牌改變局序
 await p.evaluate(()=>document.getElementById('modeRed0').click());await p.evaluate(()=>document.getElementById('chipGen').click());
 await p.waitForFunction(()=>!window.__isGeneratingShoe&&document.querySelectorAll('#roundsBody tr[data-r]').length>50,null,{timeout:300000});await p.waitForTimeout(300);
 await check(p,'紅0生成後');
 if(process.env.SHOT){const row=await p.$('#roundsBody tr.swap-banker-six-row');if(row){await row.scrollIntoViewIfNeeded();const b=await row.boundingBox();await p.screenshot({path:process.env.SHOT,clip:{x:Math.max(0,b.x),y:Math.max(0,b.y-120),width:Math.min(1000,b.width),height:300}});}}
 // 穿越示範：生成後再切牌 37 張
 await p.evaluate(()=>document.getElementById('modeTraverse').click());await p.evaluate(()=>IntegratedModes.generateTraverse(true));
 await p.waitForFunction(()=>!IntegratedModes.busy&&document.querySelectorAll('#roundsBody tr[data-r]').length>50,null,{timeout:300000});await p.waitForTimeout(300);
 await check(p,'穿越示範');
 await p.evaluate(()=>IntegratedModes.cutTraverse?IntegratedModes.cutTraverse(37):(document.getElementById('cutPos').value='37',document.getElementById('cutPos').dispatchEvent(new Event('change'))));await p.waitForTimeout(400);
 await check(p,'穿越切牌37張後');
 assert.deepEqual(errors,[],'頁面錯誤');console.log('PASS 無頁面錯誤');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
