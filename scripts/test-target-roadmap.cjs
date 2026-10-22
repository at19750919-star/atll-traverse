const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');
const ROOT = path.resolve(__dirname, '..');
function dependency(name) {
  for (const base of [
    process.env.CODEX_NODE_MODULES,
    path.join(process.env.USERPROFILE || '', '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'),
    path.resolve(ROOT, '../百家3.0/node_modules'),
  ].filter(Boolean)) {
    try { return require(path.join(base, name)); } catch (_) {}
  }
  return require(name);
}
const { chromium } = dependency('playwright');

const integratedUrl = pathToFileURL(path.resolve(__dirname, '..', 'integrated.html')).href;
const roadmapAppUrl = pathToFileURL('C:\\Users\\at197\\OneDrive\\Desktop\\專案-暫停\\百家樂路單\\index.html').href;

(async () => {
  const browser = await chromium.launch();
  try {
    // 1. 測試「百家樂路單」儲存功能
    {
      const page = await browser.newPage();
      await page.goto(roadmapAppUrl);
      await page.evaluate(() => localStorage.clear());
      await page.reload();

      // 點幾局莊閒和，再按「儲存路單」
      const seq = ['B', 'B', 'P', 'T', 'B', 'P', 'P', 'B'];
      for (const s of seq) {
        await page.click(`.action-btn[data-action="${s}"]:not([data-mod])`);
        await page.click('#confirmBtn');
      }
      page.once('dialog', d => d.accept('測試難打路A'));
      const downloadPromise = page.waitForEvent('download');
      await page.click('#saveBtn');
      const download = await downloadPromise;
      assert.strictEqual(download.suggestedFilename(), '測試難打路A.json');

      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('at_baccarat_saved_roads_v1') || '[]'));
      assert.strictEqual(saved.length, 1);
      assert.strictEqual(saved[0].name, '測試難打路A');
      assert.deepStrictEqual(saved[0].nonTieOutcomes, ['莊', '莊', '閒', '莊', '閒', '閒', '莊']);
      console.log('PASS 百家樂路單：儲存路單寫入共用 localStorage 並下載 .json 檔案');
      await page.close();
    }

    // 2. 測試整合頁（紅0模式／A2模式／穿越紅0／穿越A2）顯示與依目標路單排牌
    {
      const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
      await page.goto(integratedUrl);
      await page.evaluate(() => localStorage.clear());
      await page.reload();

      // 確認紅0模式與A2模式可見，穿越模式皆不顯示目標路單面板
      assert.strictEqual(await page.locator('#stTargetRoadPanel').isVisible(), true, '紅0模式應顯示目標路單面板');
      await page.click('#modeA2');
      assert.strictEqual(await page.locator('#stTargetRoadPanel').isVisible(), true, 'A2模式應顯示目標路單面板');
      await page.click('#modeTraverse');
      assert.strictEqual(await page.locator('#stTargetRoadPanel').isVisible(), false, '穿越紅0不顯示目標路單面板');
      await page.click('#modeTraverseA2');
      assert.strictEqual(await page.locator('#stTargetRoadPanel').isVisible(), false, '穿越A2不顯示目標路單面板');
      assert.strictEqual(await page.locator('#tvTargetRoadPanel').count(), 0, '穿越模式不設目標路單面板');
      console.log('PASS 整合頁：目標路單在紅0與A2模式顯示，穿越模式不顯示');

      // 切回紅0模式，匯入 JSON 路單並生成牌靴
      await page.click('#modeRed0');
      const customRoad = {
        name: '測試匯入難打路',
        nonTieOutcomes: Array.from({ length: 84 }, (_, i) => (i % 3 === 0 ? '莊' : i % 3 === 1 ? '閒' : i % 2 === 0 ? '莊' : '閒')),
      };
      await page.setInputFiles('#stTargetRoadFileInput', {
        name: '測試匯入難打路.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(customRoad), 'utf8'),
      });
      await page.waitForFunction(() => document.getElementById('stTargetRoadSummary').textContent.includes('測試匯入難打路'));

      // Road matching is independent of the protected spacing-stop policy;
      // prohibit rare reversals here, as in the integration/export tests.
      await page.fill('#maxTwoThirteenReversal', '0');
      await page.click('#chipGen');
      await page.waitForFunction(() => !window.__isGeneratingShoe, null, { timeout: 60000 });
      assert(await page.evaluate(() => currentRounds?.length > 0), (await page.locator('#logArea').textContent()).slice(-1800));
      assert(await page.evaluate(() => /生成完成!/.test(document.getElementById('logArea').textContent)), (await page.locator('#logArea').textContent()).slice(-1200));

      const stCheck = await page.evaluate(() => {
        const nonTie = currentRounds.map(r => r.result).filter(r => r === '莊' || r === '閒');
        const target = TargetRoadmap.getTargetOutcomes('standard');
        const compareLen = Math.min(nonTie.length, target.length);
        let matches = 0;
        for (let i = 0; i < compareLen; i++) {
          if (nonTie[i] === target[i]) matches++;
        }
        const vio = calculateViolationStats(currentRounds);
        const inventory = {};
        for (const c of currentRounds.flatMap(r => r.cards)) {
          const key = c.rank + c.suit + c.back_color;
          inventory[key] = (inventory[key] || 0) + 1;
        }
        return {
          compareLen,
          matches,
          signalViolations: vio.signalViolations,
          streakViolations: vio.streakViolations,
          fourCardViolations: vio.fourCardViolations,
          cannotSwap: calculateCannotSwapViolations(currentRounds).count,
          inventory,
        };
      });
      assert.strictEqual(stCheck.matches, stCheck.compareLen, `紅0模式大路應 100% 符合目標路單 (${stCheck.matches}/${stCheck.compareLen})`);
      assert.strictEqual(stCheck.signalViolations, 0, '紅0模式訊號違規應為 0');
      assert.strictEqual(stCheck.cannotSwap, 0);
      assert.strictEqual(Object.keys(stCheck.inventory).length, 104);
      assert(Object.values(stCheck.inventory).every(n => n === 4), '目標路單須保留完整紅藍牌庫');
      assert.strictEqual(stCheck.streakViolations, 0, '紅0模式目標路單不應誤判連續莊閒違規');
      console.log(`PASS 紅0模式：匯入路單排牌成功，${stCheck.matches}/${stCheck.compareLen} 局莊閒完全吻合且 0 訊號違規`);

      // 再測試選取內建「難打路1」生成牌靴
      await page.selectOption('#stTargetRoadSelect', 'preset-hard-1');
      await page.click('#chipGen');
      await page.waitForFunction(() => !window.__isGeneratingShoe && Array.isArray(currentRounds) && currentRounds.length > 0, null, { timeout: 60000 });
      assert(await page.evaluate(() => /生成完成!/.test(document.getElementById('logArea').textContent)), (await page.locator('#logArea').textContent()).slice(-1200));

      const presetCheck = await page.evaluate(() => {
        const nonTie = currentRounds.map(r => r.result).filter(r => r === '莊' || r === '閒');
        const target = TargetRoadmap.getTargetOutcomes('standard');
        const compareLen = Math.min(nonTie.length, target.length);
        let matches = 0;
        for (let i = 0; i < compareLen; i++) {
          if (nonTie[i] === target[i]) matches++;
        }
        const vio = calculateViolationStats(currentRounds);
        return {
          compareLen,
          matches,
          signalViolations: vio.signalViolations,
          streakViolations: vio.streakViolations,
        };
      });
      assert.strictEqual(presetCheck.matches, presetCheck.compareLen, `紅0模式套用內建難打路1應 100% 符合 (${presetCheck.matches}/${presetCheck.compareLen})`);
      assert.strictEqual(presetCheck.signalViolations, 0, '紅0模式內建難打路訊號違規應為 0');
      assert.strictEqual(presetCheck.streakViolations, 0, '紅0模式內建難打路連續莊閒違規應為 0');
      console.log(`PASS 紅0模式：套用內建難打路1排牌成功，${presetCheck.matches}/${presetCheck.compareLen} 局莊閒完全吻合且 0 違規`);

      // 3. 測試 A2 模式套用目標路單排牌
      await page.click('#modeA2');
      // A2 模式初始應為不指定
      assert.strictEqual(await page.locator('#stTargetRoadSelect').inputValue(), '');
      // 選取內建「難打路2」
      await page.selectOption('#stTargetRoadSelect', 'preset-hard-2');
      assert.strictEqual(await page.locator('#stTargetRoadSelect').inputValue(), 'preset-hard-2');

      // 切換回紅0，確認紅0維持選取 preset-hard-1
      await page.click('#modeRed0');
      assert.strictEqual(await page.locator('#stTargetRoadSelect').inputValue(), 'preset-hard-1');

      // 切回 A2，確認維持 preset-hard-2
      await page.click('#modeA2');
      assert.strictEqual(await page.locator('#stTargetRoadSelect').inputValue(), 'preset-hard-2');

      // A2 模式生成牌靴
      await page.fill('#maxTwoThirteenReversal', '0');
      await page.click('#chipGen');
      await page.waitForFunction(() => !window.__isGeneratingShoe && Array.isArray(currentRounds) && currentRounds.length > 0, null, { timeout: 60000 });
      assert(await page.evaluate(() => /生成完成!/.test(document.getElementById('logArea').textContent)), (await page.locator('#logArea').textContent()).slice(-1200));

      const a2Check = await page.evaluate(() => {
        const nonTie = currentRounds.map(r => r.result).filter(r => r === '莊' || r === '閒');
        const target = TargetRoadmap.getTargetOutcomes('standard');
        const compareLen = Math.min(nonTie.length, target.length);
        let matches = 0;
        for (let i = 0; i < compareLen; i++) {
          if (nonTie[i] === target[i]) matches++;
        }
        const vio = calculateViolationStats(currentRounds);
        const inventory = {};
        for (const c of currentRounds.flatMap(r => r.cards)) {
          const key = c.rank + c.suit + c.back_color;
          inventory[key] = (inventory[key] || 0) + 1;
        }
        return {
          compareLen,
          matches,
          mismatches: compareLen - matches,
          signalViolations: vio.signalViolations,
          streakViolations: vio.streakViolations,
          cannotSwap: calculateCannotSwapViolations(currentRounds).count,
          inventory,
        };
      });
      assert.strictEqual(a2Check.signalViolations, 0, 'A2模式訊號違規應為 0');
      assert.strictEqual(a2Check.cannotSwap, 0, 'A2模式不能對調違規應為 0');
      assert.strictEqual(Object.keys(a2Check.inventory).length, 104);
      assert(Object.values(a2Check.inventory).every(n => n === 4), 'A2模式須保留完整紅藍牌庫');
      assert(a2Check.mismatches <= 8, `A2模式目標路單誤差局數應在允許範圍內 (誤差 ${a2Check.mismatches} 局，上限 8 局)`);
      console.log(`PASS A2模式：套用內建難打路2排牌成功，${a2Check.matches}/${a2Check.compareLen} 局吻合 (誤差僅 ${a2Check.mismatches} 局)，0 訊號違規且牌庫完整`);

      await page.close();
    }
  } finally {
    await browser.close();
  }
})();
