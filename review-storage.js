/* 審核頁本機牌靴保存；不與主頁的模式設定共用儲存。 */
(function () {
  'use strict';
  const KEY = 'review-last-shoe-v1';
  const $ = id => document.getElementById(id);
  const ranks = new Set(['A','2','3','4','5','6','7','8','9','10','J','Q','K']);
  const suits = new Set(['♠','♥','♣','♦']);
  let name = '', timer = null, restoring = false, importing = false, lastContent = '', appliedCutPos = 0, invalidShoe = false;

  function status(text, error = false) {
    const el = $('reviewSaveStatus');
    if (el) { el.textContent = text; el.dataset.state = error ? 'error' : 'saved'; }
  }
  function cardData(card) {
    if (!card || !ranks.has(card.rank) || !suits.has(card.suit) || !Number.isInteger(card.pos) || card.pos < 0) {
      throw new Error('牌面資料不完整');
    }
    const data = { rank: card.rank, suit: card.suit, pos: card.pos };
    if (card.back_color === 'R' || card.back_color === 'B') data.back_color = card.back_color;
    return data;
  }
  function roundsData(rounds) {
    if (!Array.isArray(rounds) || !rounds.length || rounds.length > 500) throw new Error('牌局資料無效');
    let count = 0;
    return rounds.map(round => {
      if (!round || !Array.isArray(round.cards) || round.cards.length < 1 || round.cards.length > 6 ||
          !['莊','閒','和','殘牌'].includes(round.result)) throw new Error('牌局格式無效');
      count += round.cards.length;
      if (count > 2000) throw new Error('牌張數超出保存範圍');
      const data = { cards: round.cards.map(cardData), result: round.result };
      for (const key of ['start_index','sensitive','segment','isS','isT']) {
        if (['string','number','boolean'].includes(typeof round[key])) data[key] = round[key];
      }
      return data;
    });
  }
  function rebuildCard(data) { return Object.assign(new Card(data.rank, data.suit, data.pos), data); }
  function rebuildRounds(data) { return roundsData(data).map(round => ({ ...round, cards: round.cards.map(rebuildCard) })); }
  // Imported/restored shoes are immediately cuttable; recording is only needed to choose a new baseline.
  function establishCutBaseline(rounds) {
    const source = roundsData(rounds);
    originalRounds = rebuildRounds(source);
    originalDeckOrder = source.flatMap(round => round.cards).map((card, pos) => rebuildCard({ ...card, pos }));
    frozenGridHTML = null;
    if ($('frozenGridContainer')) $('frozenGridContainer').style.display = 'none';
    appliedCutPos = 0;
    if ($('cutPos')) $('cutPos').value = '';
  }
  function normalize(snapshot) {
    if (!snapshot || snapshot.version !== 1) throw new Error('保存版本不支援');
    return {
      version: 1, name: typeof snapshot.name === 'string' ? snapshot.name.slice(0, 200) : '',
      rounds: roundsData(snapshot.rounds),
      originalRounds: snapshot.originalRounds ? roundsData(snapshot.originalRounds) : null,
      originalDeckOrder: Array.isArray(snapshot.originalDeckOrder) && snapshot.originalDeckOrder.length
        ? snapshot.originalDeckOrder.map(cardData) : null,
      cutPos: Number.isInteger(snapshot.cutPos) && snapshot.cutPos >= 0 ? snapshot.cutPos : 0,
      exportFilename: typeof snapshot.exportFilename === 'string' ? snapshot.exportFilename.slice(0,155) : ''
    };
  }
  function snapshot() {
    const rounds = typeof currentRounds !== 'undefined' ? currentRounds : null;
    if (!Array.isArray(rounds) || !rounds.length) return null;
    return normalize({ version: 1, name, rounds,
      originalRounds: typeof originalRounds !== 'undefined' ? originalRounds : null,
      originalDeckOrder: typeof originalDeckOrder !== 'undefined' ? originalDeckOrder : null,
      cutPos: appliedCutPos,
      exportFilename: $('exportFilename')?.value || '' });
  }
  function save(manual = false) {
    clearTimeout(timer);
    if (restoring || importing) return false;
    if (invalidShoe) { status('牌局含無效牌面，無法保存或切牌', true); return false; }
    try {
      const data = snapshot();
      if (!data) { if (manual) status('尚無牌局可保存', true); return false; }
      const content = JSON.stringify(data);
      if (!manual && content === lastContent) return true;
      data.savedAt = new Date().toISOString();
      localStorage.setItem(KEY, JSON.stringify(data));
      lastContent = content;
      status(`${name || '目前牌局'} · 已保存於本機`);
      return true;
    } catch (error) {
      status('保存失敗：瀏覽器儲存空間不足或無法使用', true);
      return false;
    }
  }
  function schedule() {
    if (restoring || importing || invalidShoe) return;
    clearTimeout(timer);
    timer = setTimeout(() => save(), 150);
  }
  function restore(raw) {
    const data = normalize(raw);
    restoring = true;
    try {
      currentRounds = rebuildRounds(data.rounds);
      invalidShoe = false;
      originalRounds = data.originalRounds ? rebuildRounds(data.originalRounds) : null;
      originalDeckOrder = data.originalDeckOrder ? data.originalDeckOrder.map(rebuildCard) : null;
      frozenGridHTML = null;
      name = data.name;
      appliedCutPos = data.cutPos;
      if (!originalRounds || !originalDeckOrder) establishCutBaseline(currentRounds);
      if ($('cutPos')) $('cutPos').value = appliedCutPos ? String(appliedCutPos) : '';
      if ($('exportFilename')) $('exportFilename').value = data.exportFilename;
      window.__importedShoeMode = false;
      setEditButtonsAvailability(true);
      resetEditState();
      refreshAnalysisAndRender({ mutate: false });
      window.DashboardUI?.refreshNow?.();
      lastContent = JSON.stringify(snapshot());
      status(`${name || '上次牌局'} · 已載入`);
    } finally { restoring = false; }
  }
  function init() {
    $('btnSaveReview')?.addEventListener('click', () => save(true));
    // Capture only cuts that actually succeeded; a number typed without pressing 執行 is a draft.
    const cut = performCut;
    performCut = function (position) {
      const ok = cut.apply(this, arguments);
      if (ok) {
        appliedCutPos = parseInt(position, 10) || 0;
        // The shared clone helper omits card backs. Restore the saved baseline's backs on cut zero.
        if (appliedCutPos === 0 && Array.isArray(originalRounds)) {
          currentRounds.forEach((round, r) => round.cards.forEach((card, c) => {
            const back = originalRounds[r]?.cards[c]?.back_color;
            if (back) card.back_color = back;
          }));
          refreshAnalysisAndRender({ mutate: false });
          window.DashboardUI?.refreshNow?.();
        }
        schedule();
      }
      return ok;
    };
    const record = saveOriginalDeckOrder;
    saveOriginalDeckOrder = function () {
      if (invalidShoe) { status('牌局含無效牌面，無法保存或切牌', true); return false; }
      const source = roundsData(currentRounds);
      const ok = record.apply(this, arguments);
      if (ok) {
        // Preserve rank, suit and back together; the shared Card.clone() only copies the first two.
        originalRounds = rebuildRounds(source);
        originalDeckOrder = source.flatMap(round => round.cards).map((card, pos) => rebuildCard({ ...card, pos }));
        appliedCutPos = 0;
        if ($('cutPos')) $('cutPos').value = '';
        schedule();
      }
      return ok;
    };
    // 重置：回到保存的原始牌序（載入、匯入或記錄牌序時的基準），沿用切牌 0 的還原流程。按兩次確認。
    const resetBtn = $('btnResetOrder');
    if (resetBtn) {
      let armTimer = null;
      const disarm = () => { clearTimeout(armTimer); resetBtn.classList.remove('armed'); resetBtn.textContent = '重置'; };
      resetBtn.addEventListener('click', () => {
        if (!Array.isArray(originalRounds) || !originalRounds.length || !Array.isArray(currentRounds) || !currentRounds.length) {
          status('尚無牌靴可重置', true); return;
        }
        if (!resetBtn.classList.contains('armed')) {
          resetBtn.classList.add('armed'); resetBtn.textContent = '確定重置？';
          clearTimeout(armTimer); armTimer = setTimeout(disarm, 3000); return;
        }
        disarm();
        if (performCut(0)) {
          if ($('cutPos')) $('cutPos').value = '';
          if (typeof log === 'function') log('已重置牌序（還原為原始順序）', 'success');
          status(`${name || '目前牌局'} · 已重置牌序`);
        }
      });
    }
    const body = $('roundsBody');
    if (body) new MutationObserver(schedule).observe(body, { childList: true, subtree: true });
    for (const id of ['btnRecordDeckOrder','btnApplyChanges','btnCut','btnAutoColor','btnAutoReorder']) {
      $(id)?.addEventListener('click', schedule);
    }
    $('exportFilename')?.addEventListener('change', schedule);
    // Only a completed import replaces the name and cut baseline. Failed imports retain the previous saved shoe.
    if (typeof importFeedback !== 'undefined') {
      const begin = importFeedback.begin, finish = importFeedback.finish;
      let pendingName = '';
      importFeedback.begin = function (filename) {
        const accepted = begin.apply(this, arguments);
        if (accepted !== false) { importing = true; pendingName = String(filename || '匯入牌局'); }
        return accepted;
      };
      importFeedback.finish = function (state) {
        let result;
        try {
          result = finish.apply(this, arguments);
          if (state === 'success' || state === 'warning') {
            name = pendingName;
            try {
              establishCutBaseline(currentRounds);
              invalidShoe = false;
            } catch (_) {
              // A valid workbook can still contain invalid card labels. Keep the prior good save.
              originalRounds = null; originalDeckOrder = null; frozenGridHTML = null;
              appliedCutPos = 0; invalidShoe = true;
              if ($('cutPos')) $('cutPos').value = '';
              status('牌局含無效牌面，無法保存或切牌', true);
            }
          }
        } finally { importing = false; }
        if ((state === 'success' || state === 'warning') && !invalidShoe) save();
        return result;
      };
    }
    window.addEventListener('pagehide', () => save());
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });
    let saved = null, failed = false;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) saved = normalize(JSON.parse(raw));
    } catch (_) { failed = true; }
    try {
      if (saved) restore(saved);
      else if (window.REVIEW_DEFAULT_SHOE) {
        restore(window.REVIEW_DEFAULT_SHOE);
        lastContent = '';
        save();
      }
      if (failed) status('上次保存無法讀取，已載入預設牌局', true);
    } catch (_) {
      if (saved && window.REVIEW_DEFAULT_SHOE) {
        try { restore(window.REVIEW_DEFAULT_SHOE); status('上次保存無法讀取，已載入預設牌局', true); }
        catch (_) { status('牌局載入失敗，請重新匯入 Excel', true); }
      } else status('牌局載入失敗，請重新匯入 Excel', true);
    }
    window.ReviewStorage = { key: KEY, save, restore };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
