// ═══════════════════════════════════════════════════════════════
// 百家4.0 · 牌靴審核檢視核心邏輯 (review.js)
// 完全參照《賭場綠金風格.md》與百家4.0主頁規格實現
// ═══════════════════════════════════════════════════════════════

(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  // 1. 強制鎖定為紅0模式與四梅花和局規則
  window.StandardProfiles = {
    current: 'red0',
    defaults: {
      red0: {
        signal: { suits: ['♥', '♦'], ranks: ['10', 'J', 'Q', 'K'] },
        tripleTieRule: false,
        mixedCardColor: true
      }
    }
  };

  function enforceRed0Signal() {
    if (typeof SIGNAL_CONFIG !== 'undefined') {
      SIGNAL_CONFIG.suits = ['♥', '♦'];
      SIGNAL_CONFIG.ranks = ['10', 'J', 'Q', 'K'];
    }
    window.SIGNAL_CONFIG = {
      suits: ['♥', '♦'],
      ranks: ['10', 'J', 'Q', 'K']
    };
    document.body.dataset.mode = 'standard';
    document.body.dataset.sub = 'red0';
  }

  enforceRed0Signal();

  // 2. 顯示密度控制 (normal / compact)
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

  // 3. 雙欄主表格排版邏輯 (layoutRoundTable)
  function layoutRoundTable() {
    const table = $('roundsTable'), head = $('roundsHead'), body = $('roundsBody');
    if (!table || !head || !body) return;
    if (!table.classList.contains('split-rounds')) table.classList.add('split-rounds');
    const rows = Array.from(body.children);
    if (rows.length && table.style.display !== 'none' && table.style.display !== 'grid') {
      table.style.display = 'grid';
    }
    if (head.firstElementChild && !head.querySelector('.split-right-head')) {
      const right = head.firstElementChild.cloneNode(true);
      right.classList.add('split-right-head');
      head.append(right);
    }
    rows.forEach((row, index) => {
      const side = String(index < 45 ? 1 : 2);
      const line = String(index < 45 ? index + 2 : index - 43);
      if (row.style.getPropertyValue('--round-side') !== side) row.style.setProperty('--round-side', side);
      if (row.style.getPropertyValue('--round-line') !== line) row.style.setProperty('--round-line', line);
    });

    // 確保主表格卡牌標記嚴格符合紅0（♥♦ 的 10, J, Q, K 為紅字，A, 2 絕不為紅字）
    table.querySelectorAll('.card-label').forEach(el => {
      const text = (el.textContent || '').trim();
      if (!text || text === '--') return;
      // 解析點數與花色，例如 "Q♥" 或 "10♦" 或 "T♦"
      const suit = text.slice(-1);
      const rank = text.slice(0, -1);
      const isRed0 = (suit === '♥' || suit === '♦') && ['10', 'J', 'Q', 'K', 'T'].includes(rank);
      if (isRed0) {
        if (!el.classList.contains('s-signal-card')) el.classList.add('s-signal-card');
        el.classList.remove('non-s-signal-card');
      } else {
        el.classList.remove('s-signal-card');
        if (!el.classList.contains('non-s-signal-card')) el.classList.add('non-s-signal-card');
      }
    });
  }

  // 4. 儀表板回復統計與指標更新
  function refreshReviewDashboard() {
    enforceRed0Signal();
    const all = getRounds();
    const rounds = all.filter(r => r && ['莊', '閒', '和'].includes(r.result));
    const total = rounds.length;

    const placeholder = $('reviewEmptyState');
    const table = $('roundsTable');
    const totalStatusEl = $('shoeRoundTotal');

    if (totalStatusEl) {
      totalStatusEl.textContent = `SHOE · ${total} 局`;
    }

    if (!total) {
      if (placeholder) placeholder.style.display = 'block';
      if (table) table.style.display = 'none';

      if ($('dashAvg')) $('dashAvg').textContent = '—';
      if ($('dashAvgCards')) $('dashAvgCards').textContent = '—';
      if ($('dashMax')) $('dashMax').textContent = '—';
      if ($('dashMaxCards')) $('dashMaxCards').textContent = '—';
      if ($('dashTotal')) $('dashTotal').textContent = '0';
      if ($('dashOutcomeLegend')) $('dashOutcomeLegend').innerHTML = '';
      if ($('dashOutcomeBar')) $('dashOutcomeBar').innerHTML = '';
      if ($('dashSizeLegend')) $('dashSizeLegend').innerHTML = '';
      if ($('dashSizeBar')) $('dashSizeBar').innerHTML = '';
      if ($('dashRecoveryBars')) $('dashRecoveryBars').innerHTML = '<div style="color:var(--txt-dim);font-size:12px;padding:8px 0;font-family:var(--serif);">尚無牌靴資料</div>';
      if ($('dashB6')) $('dashB6').textContent = '';

      const vioCard = $('statsVioCard');
      if (vioCard) {
        vioCard.classList.remove('all-clear');
      }
      return;
    }

    if (placeholder) placeholder.style.display = 'none';
    if (table) table.style.display = 'grid';

    document.body.dataset.mode = 'standard';
    document.body.dataset.sub = 'red0';
    document.body.classList.remove('running');

    const overviewBtn = $('btnShoeOverview');
    if (overviewBtn) {
      overviewBtn.disabled = false;
    }

    // (A) 莊閒和勝負分佈
    const outcomes = [
      { name: '莊', color: 'var(--banker, #e05c4f)', count: rounds.filter(r => r.result === '莊').length },
      { name: '閒', color: 'var(--player, #4fa3d8)', count: rounds.filter(r => r.result === '閒').length },
      { name: '和', color: 'var(--tie, #5cbf8a)', count: rounds.filter(r => r.result === '和').length }
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
                <div class="dash-range">
                  <span>${name}</span>
                  <div><i style="width:${pct}%"></i></div>
                  <b>${pct}%</b>
                </div>`;
            }).join('');
          }

          if (typeof updateRecoveryDisplay === 'function') {
            updateRecoveryDisplay(rec);
          }
        }
      }
    } catch (e) {
      console.warn('回復分析計算警告:', e);
    }

    // (D) 特殊指標：莊6贏、對調莊6
    try {
      const b6Count = rounds.filter((r) => typeof isBankerSixWinRound === 'function' && isBankerSixWinRound(r)).length;
      const swapB6Count = rounds.filter((r) => typeof isSwapBankerSixRound === 'function' && isSwapBankerSixRound(r)).length;
      if ($('dashB6')) {
        $('dashB6').innerHTML = `莊6贏: <strong style="color:var(--gold-1);font-family:var(--disp);">${b6Count}</strong> 局 ｜ 對調莊6: <strong style="color:var(--player);font-family:var(--disp);">${swapB6Count}</strong> 局`;
      }
    } catch (_) {}

    // (E) 違規檢查（以紅0規則判定）
    let totalViolations = 0;
    try {
      if (typeof calculateViolationStats === 'function' && typeof updateViolationUI === 'function') {
        const stats = calculateViolationStats(all);
        if (typeof calculateCannotSwapViolations === 'function') {
          const cannotSwap = calculateCannotSwapViolations(all);
          stats.cannotSwapViolations = cannotSwap.count;
          stats.cannotSwapRounds = cannotSwap.rounds;
        }
        updateViolationUI(stats);
        
        // 統計各項違規次數
        totalViolations = (stats.signalViolations || 0) +
          (stats.fourCardViolations || 0) +
          (stats.streakViolations || 0) +
          (stats.cannotSwapViolations || 0) +
          (stats.cardCountMismatchViolations || 0) +
          (stats.cardColorViolations || 0) +
          (stats.otherViolations || 0);
      }
    } catch (e) {
      console.warn('違規檢查警告:', e);
    }

    // 全無違規時呈現整格亮綠 (#statsVioCard.all-clear)
    const vioCard = $('statsVioCard');
    if (vioCard) {
      if (totalViolations === 0 && total > 0) {
        vioCard.classList.add('all-clear');
      } else {
        vioCard.classList.remove('all-clear');
      }
    }

    // 更新雙欄佈局
    layoutRoundTable();
  }

  // 5. 定義 window.DashboardUI（供 shoe-overview.js 讀取）
  window.DashboardUI = {
    refresh: refreshReviewDashboard,
    refreshNow: refreshReviewDashboard,
    get analysis() {
      const all = getRounds();
      const cards = all.flatMap(r => r.cards || []);
      return {
        recovery: typeof IntegratedAnalysis !== 'undefined' && all.length ? IntegratedAnalysis.recovery(all) : null,
        safe: typeof IntegratedAnalysis !== 'undefined' && cards.length ? IntegratedAnalysis.safe(cards, {
          tripleTie: false,
          signalRule: true,
          signalConfig: { suits: ['♥', '♦'], ranks: ['10', 'J', 'Q', 'K'] }
        }) : null
      };
    }
  };

  // 6. 初始化與事件監聽
  function initReview() {
    enforceRed0Signal();
    applyDensity(currentDensity);

    const sel = $('densityControl');
    if (sel) {
      sel.addEventListener('change', (e) => {
        applyDensity(e.target.value);
        layoutRoundTable();
      });
    }

    // 監聽主表格 DOM 變動，自動執行雙欄分列
    const roundsBody = $('roundsBody');
    if (roundsBody && window.MutationObserver) {
      const observer = new MutationObserver(() => {
        layoutRoundTable();
      });
      observer.observe(roundsBody, { childList: true, subtree: true });
    }

    // 計算工具按鈕
    const calcBtn = $('btnApplyTools');
    if (calcBtn && typeof showCalcTool === 'function') {
      calcBtn.addEventListener('click', showCalcTool);
    }

    // 匯入完成監聽（掛鉤 importFeedback.finish，確保精準同步紅0規則與儀表板）
    if (typeof importFeedback !== 'undefined' && importFeedback.finish) {
      const origFinish = importFeedback.finish;
      importFeedback.finish = function (state, title, detail) {
        origFinish.call(this, state, title, detail);
        if (state === 'success' || state === 'warning') {
          enforceRed0Signal();
          window.__importedShoeMode = false;
          if (typeof refreshAnalysisAndRender === 'function') {
            refreshAnalysisAndRender({ mutate: false });
          }
          refreshReviewDashboard();
          if (typeof setEditButtonsAvailability === 'function') {
            setEditButtonsAvailability(true);
          }
        }
      };
    }

    // 防止匯入選單跑出螢幕外
    const importBtn = $('btnImport');
    if (importBtn) {
      importBtn.addEventListener('click', () => {
        setTimeout(() => {
          const menu = $('importMenu');
          if (menu) {
            const rect = menu.getBoundingClientRect();
            if (rect.right > window.innerWidth - 8) {
              const overflow = rect.right - (window.innerWidth - 8);
              menu.style.left = Math.max(8, (parseFloat(menu.style.left) || 0) - overflow) + 'px';
            }
          }
        }, 10);
      });
    }

    // 換牌、換局、套用、切牌後同步刷新
    const watchButtons = ['btnSwap', 'btnRound', 'btnApplyChanges', 'btnCut', 'btnAutoReorder', 'btnAutoColor'];
    watchButtons.forEach(id => {
      const btn = $(id);
      if (btn) {
        btn.addEventListener('click', () => {
          setTimeout(() => {
            enforceRed0Signal();
            refreshReviewDashboard();
          }, 100);
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
