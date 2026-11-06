const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
(async () => {
  const browser = await chromium.launch({ channel:'chrome', headless:true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(pathToFileURL(path.resolve(__dirname, '../review.html')).href, {waitUntil:'domcontentloaded'});
    await page.waitForFunction(() => window.ReviewStorage && window.ReviewTieRules);
    const result = await page.evaluate(() => {
      function round(labels, isT = false) {
        const cards = labels.map(([rank,suit], pos) => Object.assign(new Card(rank,suit,pos), {back_color:pos===3?'B':'R'}));
        return {cards, result:computeRoundResult(cards).result, sensitive:true, segment:'A', start_index:0, isT};
      }
      const clubs = round([['4','♣'],['2','♣'],['4','♣'],['5','♣']]);
      const tie = round([['4','♥'],['3','♠'],['4','♦'],['5','♥']]);
      const triple = round([['2','♥'],['2','♠'],['6','♦'],['2','♣']], true);
      const mixed = round([['4','♥'],['2','♠'],['4','♦'],['5','♥']]);
      const noTie = round([['4','♥'],['2','♠'],['4','♦'],['5','♥']]);
      const redTail = round([['2','♣'],['A','♣'],['3','♣'],['3','♣'],['Q','♥']]);
      const sig = rounds => calculateViolationStats(rounds).signalViolationRounds;
      const tripleViolations = sig([triple,tie]);
      const physical = rs => rs.flatMap(r=>r.cards).map(card=>({...card,point:card.point(),traverse:true}));
      const options = {tripleTie:true,signalRule:false,signalConfig:{suits:['♥','♦'],ranks:['10','J','Q','K']},tieSignal:ReviewTieRules.has};
      return {
        enabled:document.querySelector('#tripleTieRule').checked,
        fourClubs:hasFullHouse(clubs), threeNotSignal:!hasFullHouse(triple), staleFlagCleared:triple.isT===false,
        extraClubNotEnough:!ReviewTieRules.has(round([['2','♣'],['A','♣'],['3','♣'],['3','♥'],['Q','♣']])),
        clubsToTie:sig([clubs,tie]), cyclicTie:sig([tie,clubs]), tripleViolations,
        clubsNeedTie:sig([clubs,noTie]), redTailPriority:sig([redTail,tie]),
        pointTriplesIgnored:!hasFullHouseInRanks(['2','2','2','6']),
        safeUsesClubs:!TraverseOptimizer.analyze(physical([clubs,noTie]),options).safe.includes(0),
        safeNonClubs:TraverseOptimizer.analyze(physical([mixed,noTie]),options).safe.includes(0),
        noCallbackDefault:TraverseOptimizer.analyze(physical([clubs,noTie]),{tripleTie:true,signalRule:false,signalConfig:{suits:['♠','♥','♣','♦'],ranks:['A','2']}}).safe.includes(0)
      };
    });
    assert.deepEqual(result, {enabled:true,fourClubs:true,threeNotSignal:true,staleFlagCleared:true,extraClubNotEnough:true,clubsToTie:[],cyclicTie:[],tripleViolations:[1],clubsNeedTie:[1],redTailPriority:[],pointTriplesIgnored:true,safeUsesClubs:true,safeNonClubs:true,noCallbackDefault:true});
    assert.deepEqual(errors, []);
    console.log('PASS four-club / no triple / first four only / red0 priority / cyclic tie / stale flags / safe-cut callback / default compatibility');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
