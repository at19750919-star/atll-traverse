// 全敏模式同時排幾副：每個背景執行緒各排一副，全部排完挑分數最低（切點不敏感最少、訊號違規最少）的那副
(function (root) {
  'use strict';
  let workers = [], seq = 0, broken = false;
  const size = () => Math.max(1, Math.min(4, (root.navigator?.hardwareConcurrency || 2) - 1));
  // 直接開檔（file://）時瀏覽器不讓開背景執行緒，改回主頁自己排
  const available = () => !broken && typeof root.Worker === 'function' && root.location?.protocol !== 'file:';
  function ensure() {
    while (workers.length < size()) workers.push(new Worker('traverse_worker.js?v=1'));
    return workers;
  }
  const plain = o => JSON.parse(JSON.stringify(o, (k, v) => typeof v === 'function' ? undefined : v));
  // accept：主頁的驗收（莊閒差距、閒7間隔等），分數由低到高挑第一副通過的；都不過就給分數最低的讓主頁重跑
  function build(options, { accept } = {}) {
    const pool = ensure(), id = ++seq, opts = plain(options), n = pool.length;
    return new Promise((resolve, reject) => {
      const results = [];
      let done = 0, failed = null;
      const timer = setInterval(() => { if (options.isCancelled?.()) pool.forEach(w => w.postMessage({ type: 'cancel' })); }, 150);
      const finish = () => {
        clearInterval(timer);
        pool.forEach(w => { w.onmessage = null; w.onerror = null; });
        if (!results.length) { broken = true; reject(new Error(failed || '背景排牌失敗')); return; }
        results.sort((a, b) => a.score - b.score);
        const ok = r => { try { return !accept || accept(r.result); } catch (_) { return false; } };
        const pick = results.find(r => r.score < Infinity && ok(r)) || results[0], best = pick.result;
        best.parallel = { count: n, scores: results.map(r => r.score), passed: results.filter(ok).length };
        resolve(best);
      };
      pool.forEach((w, k) => {
        w.onmessage = e => {
          const m = e.data;
          if (m.id !== id) return;
          if (m.type === 'progress') { if (k === 0) options.onProgress?.(`同時排 ${n} 副（完成 ${done}）｜${m.text}`); return; }
          if (m.type === 'done') results.push({ result: m.result, score: m.score });
          else failed = m.message;
          if (++done === n) finish();
          else options.onProgress?.(`同時排 ${n} 副，已完成 ${done} 副…`);
        };
        w.onerror = e => { failed = e.message || '背景執行緒載入失敗'; if (++done === n) finish(); };
        w.postMessage({ type: 'build', id, opts });
      });
    });
  }
  root.TraversePool = { available, build, size };
})(typeof window !== 'undefined' ? window : globalThis);
