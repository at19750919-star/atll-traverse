const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const ROOT = path.resolve(__dirname, '..');
function dependency(name) {
  for (const base of [process.env.CODEX_NODE_MODULES, path.join(process.env.USERPROFILE || '', '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'), path.resolve(ROOT, '../百家3.0/node_modules')].filter(Boolean)) {
    try { return require(path.join(base, name)); } catch (_) {}
  }
  return require(name);
}
const { chromium } = dependency('playwright');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const target = path.resolve(ROOT, '.' + decodeURIComponent(new URL(req.url, 'http://local').pathname));
  if (!target.startsWith(ROOT + path.sep) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream' });
  res.end(fs.readFileSync(target));
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  try {
    await page.goto(`http://127.0.0.1:${port}/integrated.html`);
    await page.waitForLoadState('networkidle');

    // 1. 驗證初始為 all-clear 狀態且整格為理牌助手藍色樣式
    const card = page.locator('#statsVioCard');
    const isAllClear = await card.evaluate(el => el.classList.contains('all-clear'));
    assert.equal(isAllClear, true, '初始時 #statsVioCard 應有 all-clear class');

    const styles = await card.evaluate(el => {
      const cs = window.getComputedStyle(el);
      const emptyEl = el.querySelector('.vio-empty');
      const titleEl = el.querySelector('.frame-title');
      const emptyCs = window.getComputedStyle(emptyEl);
      const titleCs = window.getComputedStyle(titleEl);
      return {
        cardBg: cs.backgroundImage,
        cardBorderColor: cs.borderTopColor,
        cardBorderStyle: cs.borderTopStyle,
        cardBorderWidth: cs.borderTopWidth,
        emptyDisplay: emptyCs.display,
        emptyColor: emptyCs.color,
        emptyFontWeight: emptyCs.fontWeight,
        titleColor: titleCs.color,
        titleBg: titleCs.backgroundColor
      };
    });

    console.log('Styles under all-clear:', styles);

    // 檢查邊框為 #3d6f9e (rgb(61, 111, 158))
    assert.equal(styles.cardBorderColor, 'rgb(61, 111, 158)', '邊框應為理牌助手藍色 #3d6f9e');
    // 檢查背景包含漸層 rgb(39, 72, 112) (#274870) 與 rgb(18, 35, 61) (#12233d)
    assert.match(styles.cardBg, /rgb\(39,\s*72,\s*112\)/, '背景漸層應包含 #274870');
    assert.match(styles.cardBg, /rgb\(18,\s*35,\s*61\)/, '背景漸層應包含 #12233d');
    // 檢查目前無違規文字顯示且顏色為 #cfe3fb (rgb(207, 227, 251))
    assert.notEqual(styles.emptyDisplay, 'none', '目前無違規文字應顯示');
    assert.equal(styles.emptyColor, 'rgb(207, 227, 251)', '目前無違規文字顏色應為 #cfe3fb');
    // 檢查標題顏色為 #cfe3fb (rgb(207, 227, 251))
    assert.equal(styles.titleColor, 'rgb(207, 227, 251)', '標題文字顏色應為 #cfe3fb');

    // 2. 模擬出現違規時：應移除 all-clear，恢復為違規清單
    await page.evaluate(() => {
      window.updateViolationUI({
        signalViolations: 1,
        signalViolationRounds: [5]
      });
    });

    const hasViolations = await card.evaluate(el => !el.classList.contains('all-clear'));
    assert.equal(hasViolations, true, '有違規時應移除 all-clear class');

    const vioStyles = await card.evaluate(el => {
      const cs = window.getComputedStyle(el);
      const emptyCs = window.getComputedStyle(el.querySelector('.vio-empty'));
      const gridCs = window.getComputedStyle(el.querySelector('.vio-grid'));
      return {
        cardBorderColor: cs.borderTopColor,
        emptyDisplay: emptyCs.display,
        gridDisplay: gridCs.display
      };
    });

    assert.equal(vioStyles.emptyDisplay, 'none', '有違規時目前無違規應隱藏');
    assert.notEqual(vioStyles.gridDisplay, 'none', '有違規時違規清單應顯示');

    // 3. 模擬違規解除（全部正常）：應自動恢復 all-clear 與理牌助手藍色
    await page.evaluate(() => {
      window.updateViolationUI({
        signalViolations: 0,
        signalViolationRounds: [],
        fourCardViolations: 0,
        streakViolations: 0,
        cannotSwapViolations: 0
      });
    });

    const isCleared = await card.evaluate(el => el.classList.contains('all-clear'));
    assert.equal(isCleared, true, '違規清空後應自動重新帶有 all-clear class');

    const restoredColor = await card.evaluate(el => window.getComputedStyle(el).borderTopColor);
    assert.equal(restoredColor, 'rgb(61, 111, 158)', '恢復正常後邊框應重新為 #3d6f9e');

    console.log('PASS 目前無違規狀態整格理牌助手藍色樣式驗證成功');
  } finally {
    await browser.close();
    server.close();
  }
})();
