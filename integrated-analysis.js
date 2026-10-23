// Read-only adapters: reuse the existing safe-cut and boundary-recovery engines.
(function (global) {
  'use strict';
  function recovery(rounds) {
    if (!rounds?.length) return null;
    const input = rounds.map(r => ({ cards: r.cards.slice() }));
    // dealRounds retains an incomplete final hand. Keep its cards in the ring,
    // but do not invent an original round start at that incomplete hand.
    const last = rounds[rounds.length - 1];
    if (!['莊','閒','和'].includes(last.result)) {
      if (input.length === 1) return null;
      input[input.length - 2].cards.push(...input.pop().cards);
    }
    return analyzeShoeRecovery(input);
  }
  function safe(cards, options, traverseOnly = false) {
    if (cards.length < 6) return null;
    return TraverseOptimizer.analyze(cards.map(c => ({
      rank:c.rank, suit:c.suit, point:typeof c.point === 'function' ? c.point() : c.point,
      back_color:c.back_color, traverse:traverseOnly ? !!c.traverse : true
    })), options);
  }
  global.IntegratedAnalysis = { recovery, safe };
})(window);
