// 背景執行緒排牌：主頁同時開幾個，每個各排一副全敏牌靴，排完回報分數讓主頁挑最好的
importScripts('standard/two_thirteen_reversals.js', 'traverse_quota.js?v=1', 'traverse_tail_fill.js?v=5', 'traverse_red0_balance.js?v=4', 'traverse_a2_tail.js?v=4', 'traverse_builder.js?v=61');
let cancelled = false;
self.onmessage = async e => {
  const msg = e.data;
  if (msg.type === 'cancel') { cancelled = true; return; }
  if (msg.type !== 'build') return;
  cancelled = false;
  const B = self.TraverseBuilder;
  let last = 0;
  try {
    const result = await B.build({ ...msg.opts, isCancelled: () => cancelled,
      onProgress: m => { const now = Date.now(); if (now - last > 300) { last = now; self.postMessage({ type: 'progress', id: msg.id, text: m }); } } });
    // 分數＝416 切點不敏感局總數＋30×訊號違規（與排段序的目標相同）；被拒絕的不比
    const score = result.rejected || result.cancelled || !result.cards ? Infinity
      : B.allCutsCost(result.cards.map(c => c.point)) + 30 * (result.signal?.conflicts || 0);
    self.postMessage({ type: 'done', id: msg.id, result, score });
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, message: err.message });
  }
};
