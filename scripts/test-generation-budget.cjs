// Real intermediate generation stages in an isolated browser, with no recovery gate.
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
(async () => {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
        const page = await browser.newPage();
        await page.route('https://**/*', r => r.abort());
        await page.goto(pathToFileURL(path.resolve(__dirname, '../integrated.html')).href);
        await page.click('#modeA2');
        const rows = await page.evaluate(async () => {
            window.log = () => {};
            for (const id of ['avgRecoveryLimit', 'maxFourCardRate', 'swapBanker6Target', 'st4Min', 'st5Min', 'st6Min', 'st6Max']) document.getElementById(id).value = '';
            for (const [id, value] of Object.entries({ maxSideLimit: 4, maxBankerSixWin: 2, max7PtReversal: 2, maxTwoThirteenReversal: 2, st4Max: 30, st5Max: 30 })) document.getElementById(id).value = value;
            document.getElementById('lastCardNine').checked = false;
            const stats = rs => ({ sizes: RoundSizeLimits.count(rs), b6: rs.filter(isBankerSixWinRound).length, seven: count7PtReversals(rs).count, rare: rs.filter(r => TwoThirteenReversals.classify(r)).length });
            const results = [];
            let lastRounds;
            for (const [seed, triple] of [[1, true], [8, false], [139, false]]) {
                let state = seed;
                Math.random = () => { let t = state += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
                document.getElementById('tripleTieRule').checked = triple;
                const packed = pack_all_sensitive_and_segment(build_shuffled_deck());
                const picked = stats(packed.final_rounds.filter(r => r.segment !== 'C'));
                let rounds = packed.c_cards.length ? recalculateRoundsAfterDistribution(distributeRemainingCards(packed.final_rounds, packed.c_cards)) : packed.final_rounds;
                const tail = stats(rounds);
                if (typeof StandardGenerationBudget !== 'undefined') {
                    const planned = await StandardGenerationBudget.repairOrder(rounds);
                    if (!planned.ok) throw Error(planned.reason);
                    rounds = planned.rounds;
                }
                analyze_signal_cards(rounds, { mutate: true });
                lastRounds = rounds;
                const inventory = new Map();
                for (const c of rounds.flatMap(r => r.cards)) { const k = [c.rank,c.suit,c.back_color].join('/'); inventory.set(k,(inventory.get(k)||0)+1); }
                results.push({ seed, triple, picked, tail, actual: stats(rounds), cards: rounds.flatMap(r=>r.cards).length, inventory: [...inventory.values()], kinds: inventory.size });
            }
            const signature = JSON.stringify(lastRounds), cancelled = await StandardGenerationBudget.repairOrder(lastRounds,{shouldStop:()=>true});
            if (!cancelled.cancelled || signature !== JSON.stringify(lastRounds)) throw Error('Cancellation changed the input shoe');
            for (const id of ['maxBankerSixWin','max7PtReversal','maxTwoThirteenReversal']) document.getElementById(id).value='';
            const four=lastRounds.find(r=>r.cards.length===4),five=lastRounds.find(r=>r.cards.length===5),six=lastRounds.find(r=>r.cards.length===6);
            document.getElementById('st4Max').value='1';document.getElementById('st5Max').value='0';document.getElementById('st6Max').value='1';document.getElementById('st4Min').value='1';
            const list=[four], budget=StandardGenerationBudget.create(list);
            if(budget.canAdd(four)||budget.canReplace(0,five)||budget.canReplace(0,six)||!budget.canReplace(0,four))throw Error('Quota boundaries or lower bound failed');
            document.getElementById('st4Min').value='';
            if(!StandardGenerationBudget.create(list).canReplace(0,six))throw Error('Direct 4 -> 6 blocked by the five-card zero quota');
            list.pop();if(!budget.canAdd(four))throw Error('Removal did not release the quota');
            return results;
        });
        const failures = [];
        for (const r of rows) {
            for (const stage of ['picked', 'tail', 'actual']) for (const n of [4,5]) if (r[stage].sizes[n] > 30) failures.push(`seed ${r.seed} ${stage}: ${n}-card ${r[stage].sizes[n]} > 30`);
            for (const k of ['b6','seven','rare']) if (r.actual[k] > 2) failures.push(`seed ${r.seed} after signal: ${k} ${r.actual[k]} > 2`);
            assert.equal(r.cards,416); assert.equal(r.kinds,104); assert(r.inventory.every(n=>n===4));
        }
        console.log(JSON.stringify(rows.map(({inventory,...r})=>r)));
        assert.deepEqual(failures, []);
        console.log('PASS triple recycling / tail replacement / actual signal direction / 416-card inventory');
    } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
