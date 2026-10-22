const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root = path.resolve(__dirname, '..');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  let passed = 0;
  try {
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('https://script.google.com/**', r => r.abort());
    await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: '' }));
    await page.goto(pathToFileURL(path.join(root, 'integrated.html')).href);
    const finished = () => page.waitForFunction(() => !window.__isGeneratingShoe, null, { timeout: 120000 });
    for (const mode of ['modeRed0', 'modeA2']) {
      await page.click('#' + mode);
      // Isolate retry handling from optional numeric targets and the separate
      // rare-reversal spacing policy. Production defaults are untouched.
      await page.evaluate(() => {
        for (const id of ['avgRecoveryLimit','maxSideLimit','maxTieLimit','maxFourCardRate','max7PtReversal','maxBankerSixWin','swapBanker6Target']) document.getElementById(id).value='';
        document.getElementById('maxTwoThirteenReversal').value='0';
      });
      let ready = false;
      for (let n = 0; n < 8 && !ready; n++) {
        await page.click('#chipGen'); await finished();
        ready = await page.evaluate(() => /生成完成!/.test(document.getElementById('logArea').textContent));
      }
      assert(ready, (await page.locator('#logArea').textContent()).slice(-1000));
      assert(await page.evaluate(() => validateStandardGeneratedShoe(currentRounds).ok));
      console.log('PASS ' + mode + '真實416張生成通過全部驗收'); passed++;
      await page.evaluate(() => {
        window.__retryOriginal = { pack:pack_all_sensitive_and_segment, repair:repairStandardRoundViolations,
          validate:validateStandardGeneratedShoe, rare:TwoThirteenReversals.check, spacing:repairRareReversalSpacing,
          plan:planBackColorsKeepFaces };
        window.__retryFixture = currentRounds.map(r => ({...r,cards:r.cards.map(c=>c.clone())}));
        window.__retryReset = () => {
          pack_all_sensitive_and_segment=__retryOriginal.pack;repairStandardRoundViolations=__retryOriginal.repair;
          validateStandardGeneratedShoe=__retryOriginal.validate;TwoThirteenReversals.check=__retryOriginal.rare;
          repairRareReversalSpacing=__retryOriginal.spacing;planBackColorsKeepFaces=__retryOriginal.plan;
          window.__retryPacks=0;window.__retryRepairs=0;window.__retryValidations=0;window.__retryDecks=[];
          window.__retryBad=false;window.__retryProtected=false;
        };
        window.__retryUseFixture = () => {
          __retryReset();
          pack_all_sensitive_and_segment = deck => {
            __retryPacks++;__retryDecks.push(deck.map(c=>c.rank+c.suit+c.back_color).join(','));
            const rounds=__retryFixture.map(r=>({...r,cards:r.cards.map(c=>c.clone())}));
            return {a_rounds:rounds,c_cards:[],final_rounds:rounds};
          };
        };
      });
      await page.evaluate(() => {
        __retryReset();
        pack_all_sensitive_and_segment = deck => {
          __retryPacks++;__retryDecks.push(deck.map(c=>c.rank+c.suit+c.back_color).join(','));
          return __retryOriginal.pack(deck);
        };
        repairStandardRoundViolations = rounds => {
          if (++__retryRepairs===1) {
            window.__retryRejectedAt=__retryDecks.length-1;
            return {ok:false,reason:'測試：訊號或敏感對調無安全修復'};
          }
          return __retryOriginal.repair(rounds);
        };
      });
      let out;
      for(let run=0;run<8;run++) {
        await page.evaluate(()=>{__retryPacks=0;__retryRepairs=0;__retryDecks=[];});
        await page.click('#chipGen'); await finished();
        out = await page.evaluate(() => ({packs:__retryPacks, repairs:__retryRepairs,
          fresh:__retryDecks.slice(__retryRejectedAt+1).some(deck=>deck!==__retryDecks[__retryRejectedAt]),
          done:/生成完成!/.test(document.getElementById('logArea').textContent),valid:validateStandardGeneratedShoe(currentRounds).ok,
          log:document.getElementById('logArea').textContent.slice(-700)}));
        assert(out.packs>=2&&out.repairs>=2&&out.fresh,JSON.stringify(out));
        if(out.done)break;
        // A later, unrelated final streak failure retains its existing policy;
        // do not broaden production retry rules to make this test pass.
        assert(out.log.includes('最終驗收失敗：連續四張局／莊閒超標'),JSON.stringify(out));
        console.log('  另次候選遇原連續局限制，仍安全拒絕；重新測試注入流程');
      }
      assert(out.done&&out.valid,JSON.stringify(out));
      console.log('PASS ' + mode + '局內修復無解會真正重新洗牌並走原生成器，合格才完成'); passed++;
      await page.evaluate(() => __retryReset());
      if (process.argv.includes('--repair-only')) continue;
      if (mode === 'modeRed0') continue;
      await page.evaluate(() => {
        __retryUseFixture();
        validateStandardGeneratedShoe = rounds => {
          __retryValidations++;
          if (__retryValidations===1) {
            // Exchange whole valid rounds: keep every card and swap feasibility,
            // but break their signal adjacency after the local repair stage.
            outer: for(let i=0;i<rounds.length-1;i++) for(let j=i+1;j<rounds.length-1;j++) {
              [rounds[i],rounds[j]]=[rounds[j],rounds[i]];
              if(calculateViolationStats(rounds).signalViolations>0) break outer;
              [rounds[i],rounds[j]]=[rounds[j],rounds[i]];
            }
            const check=__retryOriginal.validate(rounds);
            window.__retrySignalCheck={...check,noSwap:calculateCannotSwapViolations(rounds).count};
            window.__retryFacesDuring=[...document.querySelectorAll('#roundsBody [data-action="card"]')].map(e=>e.textContent);
            exportRoundsAsExcelWithDrive().then(v=>window.__retryExport=v);
            return check;
          }
          return __retryOriginal.validate(rounds);
        };
      });
      const faces=await page.locator('#roundsBody [data-action="card"]').allTextContents();
      await page.click('#chipGen');await finished();
      out=await page.evaluate(()=>({packs:__retryPacks,checks:__retryValidations,signal:__retrySignalCheck,
        during:__retryFacesDuring,exported:__retryExport,done:/生成完成!/.test(document.getElementById('logArea').textContent),
        valid:__retryOriginal.validate(currentRounds).ok}));
      assert.equal(out.signal.noSwap,0);assert.equal(out.signal.ok,false);assert.equal(out.signal.retryable,true);
      assert.equal(out.packs,2);assert.equal(out.checks,2);assert(out.done&&out.valid);assert.deepEqual(out.during,faces);assert.equal(out.exported,false);
      console.log('PASS 最後驗收才發現純訊號違規也會重排，候選不顯示／不導出');passed++;
      await page.evaluate(()=>{
        __retryUseFixture();
        repairStandardRoundViolations = rounds => {
          const target=rounds.find(r=>r.cards.length===5);
          for(const [i,rank] of ['8','2','3','2','2'].entries()) {
            const source=rounds.flatMap(r=>r.cards.map((c,j)=>({r,c,j}))).find(x=>x.c.rank===rank&&(x.r!==target||x.j>=i));
            [target.cards[i],source.r.cards[source.j]]=[source.c,target.cards[i]];
          }
          window.__retryBad=calculateCannotSwapViolations(rounds).count>0;
          const result=__retryOriginal.repair(rounds);
          if(result.ok)throw new Error('真實問題應無法局內修復');
          if(++__retryRepairs===2)setTimeout(()=>document.getElementById('chipStop').click(),0);
          return result;
        };
      });
      const signature=await page.evaluate(()=>JSON.stringify(currentRounds));
      await page.click('#chipGen');await finished();
      out=await page.evaluate(()=>({packs:__retryPacks,repairs:__retryRepairs,bad:__retryBad,
        done:/生成完成!/.test(document.getElementById('logArea').textContent),signature:JSON.stringify(currentRounds),pending:window.__pendingSizeShoe}));
      assert.equal(out.packs,2);assert.equal(out.repairs,2);assert(out.bad&&!out.done);assert.equal(out.signature,signature);assert.equal(out.pending,false);
      console.log('PASS 真實壞牌持續無解仍會重排，按停止保留原牌且解除鎖定');passed++;
      await page.evaluate(()=>__retryReset());
      await page.click('#modeRed0');
      await page.evaluate(()=>{
        for(const id of ['avgRecoveryLimit','maxSideLimit','maxTieLimit','maxFourCardRate','max7PtReversal','maxBankerSixWin','swapBanker6Target'])document.getElementById(id).value='';
      });
      await page.evaluate(()=>{
        __retryUseFixture();
        TwoThirteenReversals.check=()=>({ok:false,okCount:true,okSpacing:false,reason:'測試逆轉間隔無解'});
        repairRareReversalSpacing=async()=>({ok:false,reason:'測試沒有安全整局交換'});
      });
      await page.click('#chipGen');await finished();
      out=await page.evaluate(()=>({packs:__retryPacks,done:/生成完成!/.test(document.getElementById('logArea').textContent),log:document.getElementById('logArea').textContent.slice(-400)}));
      assert.equal(out.packs,1);assert(!out.done);assert(out.log.includes('不因間隔問題整副重跑'));
      console.log('PASS 紅0逆轉間隔無安全交換仍停止，不套用訊號重排政策');passed++;
      await page.evaluate(()=>__retryReset());
      await page.click('#modeA2');
      await page.evaluate(()=>{
        __retryUseFixture();
        document.getElementById('mixedCardColor').checked=true;persistCardColorMixedMode(true);
        planBackColorsKeepFaces=()=>({ok:false,changed:0});
      });
      await page.click('#chipGen');await finished();
      out=await page.evaluate(()=>({packs:__retryPacks,done:/生成完成!/.test(document.getElementById('logArea').textContent),
        colors:calculateCardColorViolations(currentRounds),signal:calculateViolationStats(currentRounds).signalViolations,swap:calculateCannotSwapViolations(currentRounds).count}));
      assert.equal(out.packs,1);assert(out.done&&out.colors>0);assert.equal(out.signal,0);assert.equal(out.swap,0);
      console.log('PASS 卡色配置失敗仍保留牌並顯示卡色違規，不因卡色整副重排');passed++;
      await page.evaluate(()=>{__retryReset();document.getElementById('mixedCardColor').checked=false;persistCardColorMixedMode(false);});
    }
    assert.deepEqual(errors,[]);console.log(JSON.stringify({passed,pageErrors:errors}));
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
