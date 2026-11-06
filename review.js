// 百家4.0 · 牌靴審核檢視核心邏輯 (review.js)
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  // 1. 固定使用紅0模式規則判定
  window.SIGNAL_CONFIG = {
    suits: ['♥', '♦'],
    ranks: ['10', 'J', 'Q', 'K']
  };

  // 2. 密度控制與保存
  let currentDensity = 'normal';
  try {
    currentDensity = localStorage.getItem('integrated-table-density') === 'compact' ? 'compact' : 'normal';
  } catch (_) {}

  function applyDensity(val) {
    currentDensity = val === 'compact' ? 'compact' : 'normal';
    document.body.dataset.density = currentDensity;
    const sel = $('densityControl');
    if (sel) sel.value = currentDensity;
    try {
      localStorage.setItem('integrated-table-density', currentDensity);
    } catch (_) {}
  }

  const getRounds = () => typeof currentRounds !== 'undefined' && Array.isArray(currentRounds) ? currentRounds : (window.currentRounds || []);

  // 3. 儀表板回復統計與指標更新
  function refreshReviewDashboard() {
    const all = getRounds();
    const rounds = all.filter(r => r && ['莊', '閒', '和'].includes(r.result));
    const total = rounds.length;

    const placeholder = $('reviewEmptyState');
    const table = $('roundsTable');

    if (!total) {
      if (placeholder) placeholder.style.display = 'block';
      if (table) table.style.display = 'none';

      // 重置統計值
      if ($('dashAvg')) $('dashAvg').textContent = '—';
      if ($('dashAvgCards')) $('dashAvgCards').textContent = '—';
      if ($('dashMax')) $('dashMax').textContent = '—';
      if ($('dashMaxCards')) $('dashMaxCards').textContent = '—';
      if ($('dashTotal')) $('dashTotal').textContent = '0';
      if ($('dashOutcomeLegend')) $('dashOutcomeLegend').innerHTML = '';
      if ($('dashOutcomeBar')) $('dashOutcomeBar').innerHTML = '';
      if ($('dashSizeLegend')) $('dashSizeLegend').innerHTML = '';
      if ($('dashSizeBar')) $('dashSizeBar').innerHTML = '';
      if ($('dashRecoveryBars')) $('dashRecoveryBars').innerHTML = '<div style="color:#9a9584;font-size:12px;padding:8px 0;">尚無牌靴資料</div>';
      if ($('dashB6')) $('dashB6').textContent = '';

      if (typeof updateViolationUI === 'function') {
        updateViolationUI(null);
      }
      return;
    }

    if (placeholder) placeholder.style.display = 'none';
    if (table) table.style.display = '';

    // 觸發 shoe-overview 等監聽 body 屬性的元件同步狀態
    document.body.dataset.mode = 'standard';
    document.body.classList.remove('running');
    const overviewBtn = $('btnShoeOverview');
    if (overviewBtn && total > 0) {
      overviewBtn.disabled = false;
    }

    // (A) 莊閒和勝負分佈
    const outcomes = [
      { name: '莊', color: 'var(--banker, #d32f2f)', count: rounds.filter(r => r.result === '莊').length },
      { name: '閒', color: 'var(--player, #1976d2)', count: rounds.filter(r => r.result === '閒').length },
      { name: '和', color: 'var(--tie, #388e3c)', count: rounds.filter(r => r.result === '和').length }
    ];

    if ($('dashTotal')) $('dashTotal').textContent = total;

    if ($('dashOutcomeLegend')) {
      $('dashOutcomeLegend').innerHTML = outcomes.map(o => `
        <span class="dash-legend-item" style="--legend-color:${o.color}">
          <b>${o.name}</b> ${o.count} (${total ? ((o.count / total) * 100).toFixed(1) : 0}%)
        </span>
      `).join('');
    }

    if ($('dashOutcomeBar')) {
      $('dashOutcomeBar').innerHTML = outcomes.map(o => `
        <span style="flex:${o.count};background:${o.color}" title="${o.name}: ${o.count}"></span>
      `).join('');
    }

    // (B) 4 / 5 / 6 張局長度分佈
    const sizes = [
      { name: '4張', count: rounds.filter(r => (r.cards?.length || 0) === 4).length },
      { name: '5張', count: rounds.filter(r => (r.cards?.length || 0) === 5).length },
      { name: '6張', count: rounds.filter(r => (r.cards?.length || 0) >= 6).length }
    ];

    if ($('dashSizeLegend')) {
      $('dashSizeLegend').innerHTML = sizes.map(s => `
        <span class="dash-legend-item">
          <b>${s.name}</b> ${s.count} (${total ? ((s.count / total) * 100).toFixed(1) : 0}%)
        </span>
      `).join('');
    }

    if ($('dashSizeBar')) {
      $('dashSizeBar').innerHTML = sizes.map((s, idx) => {
        const colors = ['#8a6a2f', '#c9a050', '#f4dfa4'];
        return `<span style="flex:${s.count};background:${colors[idx]}" title="${s.name}: ${s.count}"></span>`;
      }).join('');
    }

    // (C) 回復分析計算
    try {
      if (typeof analyzeShoeRecovery === 'function') {
        const rec = analyzeShoeRecovery(all);
        if (rec) {
          if ($('dashAvg')) $('dashAvg').textContent = `${rec.avgRounds} 局`;
          if ($('dashAvgCards')) $('dashAvgCards').textContent = `${rec.avgCards} 張`;
          if ($('dashMax')) $('dashMax').textContent = `${rec.maxRounds} 局`;
          if ($('dashMaxCards')) $('dashMaxCards').textContent = `${rec.maxCards} 張`;

          // 回復間距分佈圖
          if ($('dashRecoveryBars') && rec.distribution) {
            const dist = rec.distribution;
            const distTotal = rec.totalCards || 1;
            const ranges = [
              ['立即', dist.immediate || 0],
              ['1–5局', dist.range1to5 || 0],
              ['6–10局', dist.range6to10 || 0],
              ['11–15局', dist.range11to15 || 0],
              ['16局+', dist.range16plus || 0]
            ];
            $('dashRecoveryBars').innerHTML = ranges.map(([name, count]) => {
              const pct = ((count / distTotal) * 100).toFixed(1);
              return `
                <div class="dash-range" style="display:flex;align-items:center;gap:8px;font-size:12px;margin:2px 0;">
                  <span style="width:50px;color:#9a9584;">${name}</span>
                  <div style="flex:1;height:8px;background:#1a2327;border-radius:4px;overflow:hidden;">
                    <div style="width:${pct}%;height:100%;background:linear-gradient(90deg, #6b4c1d, #d9b568);"></div>
                  </div>
                  <b style="width:42px;text-align:right;color:#f4dfa4;">${pct}%</b>
                </div>`;
            }).join('');
          }

          if (typeof updateRecoveryDisplay === 'function') {
            updateRecoveryDisplay(rec);
          }
        }
      }
    } catch (e) {
      console.warn('回復分析計算發生警告:', e);
    }

    // (D) 特殊指標：莊6贏、對調莊6
    try {
      const b6Count = rounds.filter((r, i) => typeof isBankerSixWinRound === 'function' && isBankerSixWinRound(r)).length;
      const swapB6Count = rounds.filter((r, i) => typeof isSwapBankerSixRound === 'function' && isSwapBankerSixRound(r)).length;
      if ($('dashB6')) {
        $('dashB6').innerHTML = `莊6贏: <strong style="color:#f4dfa4;">${b6Count}</strong> 局 ｜ 對調莊6: <strong style="color:#64b5f6;">${swapB6Count}</strong> 局`;
      }
    } catch (_) {}

    // (E) 違規檢查（以紅0規則判定）
    try {
      if (typeof calculateViolationStats === 'function' && typeof updateViolationUI === 'function') {
        const stats = calculateViolationStats(all);
        if (typeof calculateCannotSwapViolations === 'function') {
          const cannotSwap = calculateCannotSwapViolations(all);
          stats.cannotSwapViolations = cannotSwap.count;
          stats.cannotSwapRounds = cannotSwap.rounds;
        }
        updateViolationUI(stats);
      }
    } catch (e) {
      console.warn('違規檢查發生警告:', e);
    }
  }

  // 4. 定義 window.DashboardUI（供 shoe-overview.js 等元件讀取）
  window.DashboardUI = {
    refresh: refreshReviewDashboard,
    refreshNow: refreshReviewDashboard,
    get analysis() {
      const all = getRounds();
      const cards = all.flatMap(r => r.cards || []);
      return {
        recovery: typeof IntegratedAnalysis !== 'undefined' && all.length ? IntegratedAnalysis.recovery(all) : null,
        safe: typeof IntegratedAnalysis !== 'undefined' && cards.length ? IntegratedAnalysis.safe(cards, {
          tripleTie: $('tripleTieRule')?.checked ?? true,
          signalRule: true,
          signalConfig: { suits: window.SIGNAL_CONFIG.suits.slice(), ranks: window.SIGNAL_CONFIG.ranks.slice() }
        }) : null
      };
    }
  };

  // 5. 初始化與監聽
  function initReview() {
    applyDensity(currentDensity);
    const sel = $('densityControl');
    if (sel) {
      sel.addEventListener('change', (e) => applyDensity(e.target.value));
    }

    // 計算工具按鈕
    const calcBtn = $('btnApplyTools');
    if (calcBtn && typeof showCalcTool === 'function') {
      calcBtn.addEventListener('click', showCalcTool);
    }

    // 匯入檔案監聽（匯入完成後啟用紅0規則檢查並刷新）
    const fileInput = $('importFileInput');
    if (fileInput) {
      fileInput.addEventListener('change', () => {
        setTimeout(() => {
          window.__importedShoeMode = false; // 依使用者決定：固定使用紅0規則判定違規與訊號
          if (typeof refreshAnalysisAndRender === 'function') {
            refreshAnalysisAndRender({ mutate: false });
          }
          refreshReviewDashboard();
          if (typeof setEditButtonsAvailability === 'function') {
            setEditButtonsAvailability(true);
          }
        }, 500);
      });
    }

    // 換牌、換局、套用、切牌後同步刷新儀表板
    const watchButtons = ['btnSwap', 'btnRound', 'btnApplyChanges', 'btnCut', 'btnAutoReorder', 'btnAutoColor'];
    watchButtons.forEach(id => {
      const btn = $(id);
      if (btn) {
        btn.addEventListener('click', () => {
          setTimeout(refreshReviewDashboard, 100);
        });
      }
    });

    // 初始狀態刷新
    refreshReviewDashboard();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initReview);
  } else {
    initReview();
  }
})();
