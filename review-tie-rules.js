/* 審核頁專用：前四張全梅花為和局訊號，優先於紅0；不再採用三條。 */
(function () {
  'use strict';
  function hasFourClubs(roundOrCards) {
    const cards = Array.isArray(roundOrCards) ? roundOrCards : roundOrCards?.cards;
    return Array.isArray(cards) && cards.length >= 4 && cards.slice(0, 4).every(card => card?.suit === '♣');
  }
  function updateFlags(rounds) {
    if (Array.isArray(rounds)) rounds.forEach(round => { if (round) round.isT = hasFourClubs(round); });
  }
  // 舊的全域名稱仍供共用表格使用；實際判定限定審核頁的花色規則。
  hasFullHouse = hasFourClubs;
  hasFullHouseInRanks = () => false;
  const calculate = calculateViolationStats;
  calculateViolationStats = function (rounds) {
    updateFlags(rounds);
    return calculate.apply(this, arguments);
  };
  const render = renderRoundsTable;
  renderRoundsTable = function (rounds) {
    updateFlags(rounds);
    return render.apply(this, arguments);
  };
  window.ReviewTieRules = { has: hasFourClubs, updateFlags };
})();
