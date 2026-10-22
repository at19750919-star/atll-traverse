// Regression checks use an isolated browser; cloud requests are blocked.
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root = path.resolve(__dirname, '..');
const checks = [], failures = [];
async function check(name, fn) {
  try { await fn(); checks.push(name); console.log('PASS ' + name); }
  catch (e) { failures.push(name + ': ' + e.message); console.error('FAIL ' + name + ': ' + e.message); }
}
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => d.accept());
    await page.route('https://script.google.com/**', r => r.abort());
    await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: '' }));
    await page.goto(pathToFileURL(path.join(root, 'integrated.html')).href);
    await page.click('#modeA2');
    await check('真實問題尾牌不得以不可對調的原樣通過殘牌分配', async () => {
      const result = await page.evaluate(() => {
        const make = ranks => ({ cards: ranks.map((rank, i) => { const c = new Card(rank, '♠', i); c.back_color = i === 3 ? 'R' : 'B'; return c; }), segment: 'A', result: '莊' });
        const rounds = [make(['9','8','K','K']), { ...make(['8','2','3','2','2']), segment: 'C' }];
        try {
          const out = distributeRemainingCards(rounds, rounds[1].cards);
          return { rejected: false, bad: calculateCannotSwapViolations(out).count };
        } catch (e) { return { rejected: true, message: e.message }; }
      });
      assert(result.rejected || result.bad === 0, JSON.stringify(result));
    });
    await check('不可對調的下一局不可被硬寫成預期勝負', async () => {
      const out = await page.evaluate(() => {
        const make = ranks => ({ cards: ranks.map((rank, i) => new Card(rank, '♠', i)), segment: 'A', result: '閒' });
        const rounds = [make(['A','9','8','K']), make(['8','2','3','2','4'])];
        rounds.forEach(recomputeRoundOutcome);
        const before = JSON.stringify(rounds[1].cards.map(c => c.rank));
        analyze_signal_cards(rounds, { mutate: true });
        const hand = computeRoundHands(rounds[1].cards);
        const actual = hand.playerTotal === hand.bankerTotal ? '和' : hand.playerTotal > hand.bankerTotal ? '閒' : '莊';
        return { same: before === JSON.stringify(rounds[1].cards.map(c => c.rank)), result: rounds[1].result, actual };
      });
      assert(out.same, JSON.stringify(out)); assert.equal(out.result, out.actual);
    });
    await check('局內安全修復保留牌張；三條訊號無解時不動原牌；唯讀分析不移牌', async () => {
      const out = await page.evaluate(() => {
        const make = ranks => { const r = { cards: ranks.map((rank,i) => new Card(rank,'♠',i)), segment:'A' }; recomputeRoundOutcome(r); return r; };
        const lastNine = document.getElementById('lastCardNine').checked;
        document.getElementById('lastCardNine').checked=false;
        const simple = [make(['8','9','K','K'])], before = JSON.stringify(simple);
        const fixed = repairStandardRoundViolations(simple);
        const conflict = [make(['6','3','3','3']), make(['9','8','K','K'])];
        const original = JSON.stringify(conflict), failed = repairStandardRoundViolations(conflict);
        const imported = window.__importedShoeMode;
        window.__importedShoeMode=true;
        const final = validateStandardGeneratedShoe(conflict);
        const rejectsSignal = calculateCannotSwapViolations(conflict).count===0 && !final.ok && final.reason.includes('訊號／三條違規');
        window.__importedShoeMode=imported;
        analyze_signal_cards(conflict, { mutate:false });
        document.getElementById('lastCardNine').checked=lastNine;
        return { fixed:fixed.ok && fixed.repaired.length===1, result:fixed.rounds?.[0].result, sensitive:fixed.ok && standardRoundIsSensitive(fixed.rounds[0]),
          unchanged:before===JSON.stringify(simple), rejected:!failed.ok, rejectsSignal, conflictUnchanged:original===JSON.stringify(conflict) };
      });
      assert.deepEqual(out, {fixed:true,result:'閒',sensitive:true,unchanged:true,rejected:true,rejectsSignal:true,conflictUnchanged:true});
    });
    if (process.argv.includes('--unit')) {
      assert.deepEqual(failures, []); return;
    }
    // Real generation: retain all rule switches/defaults; only rare-reversal cap
    // is zero to isolate this test from the separate spacing-failure policy.
    await page.fill('#maxTwoThirteenReversal', '0');
    let good;
    await check('A2實際完整生成三副：訊號、對調、敏感性及所有原設定驗收通過', async () => {
      let accepted = 0;
      for (let attempt = 0; attempt < 12 && accepted < 3; attempt++) {
        await page.click('#chipGen');
        await page.waitForFunction(() => !window.__isGeneratingShoe, null, { timeout: 120000 });
        const out = await page.evaluate(() => {
          const done = /生成完成!/.test(document.getElementById('logArea').textContent);
          if (!done) return { done, log: document.getElementById('logArea').textContent.slice(-250) };
          const stats = calculateViolationStats(currentRounds);
          const inventory = {};
          currentRounds.flatMap(r => r.cards).forEach(c => { const k = c.rank + c.suit + c.back_color; inventory[k] = (inventory[k] || 0) + 1; });
          return { done, signal: stats.signalViolations, swap: calculateCannotSwapViolations(currentRounds).count,
            inventory, valid: typeof validateStandardGeneratedShoe === 'function' && validateStandardGeneratedShoe(currentRounds).ok };
        });
        if (!out.done) { console.log('  安全停止 ' + out.log); continue; }
        assert.equal(out.signal, 0); assert.equal(out.swap, 0); assert(out.valid, JSON.stringify(out));
        assert.equal(Object.keys(out.inventory).length, 104); assert(Object.values(out.inventory).every(n => n === 4));
        accepted++;
      }
      assert.equal(accepted, 3, '應至少實際完成三副合格A2牌');
      good = await page.evaluate(() => currentRounds.map(r => ({ ...r, cards: r.cards.map(c => ({ rank: c.rank, suit: c.suit, pos: c.pos, back_color: c.back_color })) })));
    });
    await check('最後卡色後注入不可修復的真實問題：不報完成、不發布、不導出、保留原牌', async () => {
      assert(good, '需要上一項的合格牌靴');
      const before = await page.evaluate(() => JSON.stringify(currentRounds.map(r => r.cards.map(c => [c.rank,c.suit,c.back_color]))));
      const faces = await page.locator('#roundsBody [data-action="card"]').allTextContents();
      await page.evaluate(() => {
        window.__finalOldColor = runAutoColorSwap_Signal;
        runAutoColorSwap_Signal = function(rounds) {
          const out = window.__finalOldColor(rounds), target = out.find(r => r.cards.length === 5);
          if (!target) throw new Error('測試需要五張局');
          // Move existing cards so the inventory stays complete.
          for (const [i, rank] of ['8','2','3','2','2'].entries()) {
            const source = out.flatMap(r => r.cards.map((c,j) => ({r,c,j}))).find(x => x.c.rank === rank && (x.r !== target || x.j >= i));
            [target.cards[i], source.r.cards[source.j]] = [source.c, target.cards[i]];
          }
          recomputeRoundOutcome(target);
          window.__finalInjected = true;
          window.__finalFacesDuring = [...document.querySelectorAll('#roundsBody [data-action="card"]')].map(e => e.textContent);
          exportRoundsAsExcelWithDrive().then(v => window.__finalExport = v);
          return out;
        };
      });
      await page.click('#chipGen');
      await page.waitForFunction(() => !window.__isGeneratingShoe, null, { timeout: 120000 });
      const result = await page.evaluate(() => ({ injected: window.__finalInjected,
        log: document.getElementById('logArea').textContent.slice(-800),
        completed: /生成完成!/.test(document.getElementById('logArea').textContent),
        signature: JSON.stringify(currentRounds.map(r => r.cards.map(c => [c.rank,c.suit,c.back_color]))),
        during: window.__finalFacesDuring, exported: window.__finalExport, pending: window.__pendingSizeShoe }));
      assert(result.injected, result.log); assert(!result.completed, result.log);
      assert.equal(result.signature, before); assert.deepEqual(result.during, faces);
      assert.deepEqual(await page.locator('#roundsBody [data-action="card"]').allTextContents(), faces);
      assert.equal(result.exported, false); assert.equal(result.pending, false);
      await page.evaluate(() => runAutoColorSwap_Signal = window.__finalOldColor);
    });
    await check('取消生成保留舊牌並解除鎖定；沒有舊牌時驗收失敗保持空白', async () => {
      assert(good);
      const before = await page.evaluate(() => JSON.stringify(currentRounds));
      await page.evaluate(() => { window.__testGeneratingPromise=generateShoe(); stopGenerateShoe(); });
      await page.waitForFunction(() => !window.__isGeneratingShoe);
      assert.equal(await page.evaluate(() => JSON.stringify(currentRounds)), before);
      await page.evaluate(() => {
        const fixture = currentRounds.map(r => ({...r,cards:r.cards.map(c=>c.clone())}));
        window.__oldEmptyPack=pack_all_sensitive_and_segment;
        pack_all_sensitive_and_segment=()=>({a_rounds:fixture,c_cards:[],final_rounds:fixture.map(r=>({...r,cards:r.cards.map(c=>c.clone())}))});
        currentRounds = null; currentAnalysis = null; renderRoundsTable(null,null);
        window.__oldFinalValidator = validateStandardGeneratedShoe;
        validateStandardGeneratedShoe = () => { window.__emptyGateReached=true;return {ok:false,reason:'測試：所有數字留白仍不可略過驗收'}; };
        for (const id of ['avgRecoveryLimit','maxSideLimit','maxTieLimit','maxFourCardRate','max7PtReversal','maxTwoThirteenReversal','maxBankerSixWin','swapBanker6Target', 'st4Min','st4Max','st5Min','st5Max','st6Min','st6Max']) document.getElementById(id).value='';
        document.getElementById('lastCardNine').checked=false;
      });
      await page.click('#chipGen');
      await page.waitForFunction(() => !window.__isGeneratingShoe, null, {timeout:120000});
      const result = await page.evaluate(() => ({empty:currentRounds===null, pending:window.__pendingSizeShoe,gate:window.__emptyGateReached,
        completed:/生成完成!/.test(document.getElementById('logArea').textContent)}));
      assert.deepEqual(result,{empty:true,pending:false,gate:true,completed:false});
      assert.equal(await page.locator('#roundsBody [data-action="card"]').count(),0);
      await page.evaluate(() => {validateStandardGeneratedShoe=window.__oldFinalValidator;pack_all_sensitive_and_segment=window.__oldEmptyPack;});
    });
    assert.deepEqual(errors, []);
    assert.deepEqual(failures, []);
    console.log(JSON.stringify({ passed: checks.length, pageErrors: errors }));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
