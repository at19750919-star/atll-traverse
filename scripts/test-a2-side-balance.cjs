// 一般A2挑局時控制訊號局數：同一組種子下，挑局後（殘牌分配、訊號對調後）莊閒差距合格率須明顯高於不控制。
// Isolated headless browser; cloud endpoints are blocked.
const assert = require('node:assert/strict'), path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root = process.env.ATLL_ROOT || path.resolve(__dirname, '..');

async function open(browser, mode) {
    const p = await browser.newPage();
    p.errors = [];
    p.on('pageerror', e => p.errors.push(e.message));
    await p.route('https://script.google.com/**', r => r.abort());
    await p.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: '' }));
    await p.goto(pathToFileURL(path.join(root, 'integrated.html')).href);
    await p.click('#' + mode);
    return p;
}

// 重複挑局 runs 次，回傳差距合格數與庫存檢查；disable=true 時把控制器換成不作用的版本當對照組
function sample(p, runs, seed, disable) {
    return p.evaluate(([runs, seed, disable]) => {
        let s = seed;
        Math.random = () => { let t = s += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
        window.log = () => {};
        applySignalConfig();
        if (disable) {
            const real = createA2SideBalancer;
            window.createA2SideBalancer = deck => ({ ...real(deck), active: false, shouldSkip: () => false, pick: (c, v) => c.find(v) || null });
        }
        let active = null;
        const probe = createA2SideBalancer;
        window.createA2SideBalancer = deck => { const b = probe(deck); active = b.active; return b; };
        const side = getMaxSideLimitSetting(), diffs = [];
        let inventoryErrors = 0;
        for (let k = 0; k < runs; k++) {
            const deck = build_shuffled_deck();
            const res = pack_all_sensitive_and_segment(deck);
            let rounds = res.final_rounds;
            // 殘牌分配或訊號處理失敗時生成流程本來就會重新洗牌，這裡同樣記為不合格
            try {
                if (res.c_cards.length) rounds = recalculateRoundsAfterDistribution(distributeRemainingCards(rounds, res.c_cards));
                analyze_signal_cards(rounds, { mutate: true });
            } catch (e) { diffs.push(null); continue; }
            const cards = rounds.flatMap(r => r.cards);
            const kinds = new Map();
            cards.forEach(c => kinds.set(c.rank + c.suit, (kinds.get(c.rank + c.suit) || 0) + 1));
            if (cards.length !== 416 || kinds.size !== 52 || [...kinds.values()].some(v => v !== 8)) inventoryErrors++;
            const c = countBankerPlayerTie(rounds);
            diffs.push(c.banker - c.player - c.tie);
        }
        window.createA2SideBalancer = probe;
        return { side, active, inventoryErrors, pass: diffs.filter(d => d !== null && (side === null || Math.abs(d) <= side)).length, diffs };
    }, [runs, seed, disable]);
}

(async () => {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
        const RUNS = 80;
        for (const seed of [1, 7]) {
            const off = await sample(await open(browser, 'modeA2'), RUNS, seed, true);
            const p = await open(browser, 'modeA2');
            const on = await sample(p, RUNS, seed, false);
            assert.deepEqual(p.errors, []);
            assert.equal(on.side, 5, 'A2 預設莊閒差距應為 5');
            assert.equal(on.active, true);
            assert.equal(on.inventoryErrors, 0, '挑局控制不得改變牌庫');
            assert(on.pass >= RUNS * 0.9, `種子 ${seed} 控制後合格 ${on.pass}/${RUNS} 應達九成`);
            assert(on.pass > off.pass + RUNS * 0.15, `種子 ${seed} 控制後 ${on.pass} 應明顯高於不控制 ${off.pass}`);
            console.log(`PASS 種子 ${seed}：莊閒差距合格 不控制 ${off.pass}/${RUNS} → 控制 ${on.pass}/${RUNS}`);
        }
        // 莊閒差距留白時不控制
        const blank = await open(browser, 'modeA2');
        await blank.evaluate(() => { document.getElementById('maxSideLimit').value = ''; });
        assert.equal((await sample(blank, 3, 3, false)).active, false);
        // 紅0模式不套用（紅0另有訊號配置）
        assert.equal((await sample(await open(browser, 'modeRed0'), 3, 3, false)).active, false);
        console.log('PASS 莊閒差距留白與紅0模式不啟用控制');
    } finally {
        await browser.close();
    }
})().catch(e => { console.error(e); process.exitCode = 1; });
