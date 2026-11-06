const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const ROOT=path.resolve(__dirname,'..');
const roles={body:'body',title:'h1',subtitle:'h1 small',headerButton:'#btnImport',toolButton:'#btnSwap',filename:'#exportFilename',number:'#cutPos',panelTitle:'.frame-title',card:'.card-label',signalCard:'.card-label.s-signal-card',round:'#roundsBody tr td:first-child',tableHead:'#roundsHead th',violation:'.v-name',violationValue:'.v-val',violationClear:'#vioEmpty',log:'#logArea',filenameLabel:'#exportFilenameField',state:'.shoe-state',calcAction:'#floatingAssistant .widget-action',calcInput:'#floatingAssistant .card-input',calcValue:'#floatingAssistant .result-value',overviewTitle:'#shoeOverview h2'};
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const snapshots=[];
  for(const file of ['integrated.html','review.html']){
   const page=await browser.newPage({viewport:{width:1920,height:1080}});
   await page.goto(pathToFileURL(path.join(ROOT,file)).href,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>typeof Card==='function'&&typeof renderRoundsTable==='function');
   await page.addScriptTag({path:path.join(ROOT,'review-default-shoe.js')});
   await page.evaluate(()=>{currentRounds=REVIEW_DEFAULT_SHOE.rounds.map(r=>({...r,cards:r.cards.map(c=>Object.assign(new Card(c.rank,c.suit,c.pos),c))}));renderRoundsTable(currentRounds);});
   await page.evaluate(()=>document.fonts.ready);
   snapshots.push(await page.evaluate(roles=>{
    const style=el=>{if(!el)throw new Error('缺少字型比對元素');const s=getComputedStyle(el);return {family:s.fontFamily,weight:s.fontWeight};};
    return {roles:Object.fromEntries(Object.entries(roles).map(([name,selector])=>[name,style(document.querySelector(selector))])),cells:[...document.querySelectorAll('#roundsBody tr:first-child td')].map(style)};
   },roles));
   if(file==='review.html'){
    const layout=await page.evaluate(()=>{
     const brand=document.querySelector('.review-branding').getBoundingClientRect(),actions=document.querySelector('.review-header-actions').getBoundingClientRect();
     return {sameRow:Math.abs((brand.top+brand.bottom)/2-(actions.top+actions.bottom)/2)<2,sidebar:document.querySelector('.review-toolbar').getBoundingClientRect().width,overflow:document.body.scrollWidth>innerWidth};
    });
    assert.deepEqual(layout,{sameRow:true,sidebar:180,overflow:false},'字型變更不能破壞1920單行頁首與180px左欄');
   }
   await page.close();
  }
  for(const role of Object.keys(roles))assert.deepEqual(snapshots[1].roles[role],snapshots[0].roles[role],role+'字族及字重需與integrated.html相同');
  assert.deepEqual(snapshots[1].cells,snapshots[0].cells,'主表所有欄位字族及字重需相同');
  console.log(`PASS ${Object.keys(roles).length} font roles + ${snapshots[0].cells.length} table columns match integrated.html; 1920 header and 180px sidebar preserved`);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
