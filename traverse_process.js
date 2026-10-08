(() => {
    'use strict';
    const $ = id => document.getElementById(id), P = TraverseProcess;
    let iterator, playing = false, timer, done = false, history = [], cursor = 0, sequence = 0, finalShoe = null;
    const labels = { initial: '原始牌', shuffle: '洗牌', inspect: '候選檢查', found: '找到合格段', pick: '移出牌堆', sweep: '一輪結束', phase: '轉換階段', compute: '敏感局組合', chainStart: '接段排序', chainSeed: '取出起始段', joinTest: '接縫檢查', join: '接合成功', chainDone: '長段完成', attemptDone: '接段回合完成', done: '完成' };
    function cardsMarkup(cards, selected = new Set(), seam = -1) {
        return cards.map((c, i) => `<span class="card ${['♥','♦'].includes(c.suit) ? 'red' : ''} ${c.point === 0 ? 'zero' : ''} ${selected.has(c.id) ? 'selected' : ''} ${i === seam ? 'seam' : ''}" title="第 ${c.deck} 副・${c.suit}${c.rank}・${c.point} 點・編號 ${c.id}">${c.suit}${c.rank}<b>#${c.id}</b></span>`).join('');
    }
    function inspect(cards, seam) {
        $('candidate').innerHTML = cardsMarkup(cards, new Set(), seam);
        const result = P.check(cards);
        $('candidateInfo').textContent = `${cards.length} 張 · ${result.reason}`;
        $('candidateInfo').className = result.ok ? 'badge' : 'bad';
        const rounds = TraverseBuilder.roundsFromStart(cards.map(c => c.point));
        $('verification').innerHTML = `<span>${result.reason}。豁免只適用於剩 1、2、3、7 張的起點。</span>` + (rounds ? '<div class="rounds">' + rounds.map((r, i) => {
            const p = cards.slice(r.start, r.start + r.size).map(c => c.point), sensitive = TraverseBuilder.handSensitive(p);
            [p[0], p[1]] = [p[1], p[0]];
            const after = TraverseBuilder.simulateHand(p, 0, p.length);
            return `<div class="round">第 ${i + 1} 局 · ${r.size} 張<br>${r.result} → ${after?.result || '不足'} <${sensitive ? 'strong' : 'span'}>${sensitive ? '敏感 ✓' : '不敏感'}</${sensitive ? 'strong' : 'span'}></div>`;
        }).join('') + '</div>' : '');
    }
    function segmentRow(cards, title, tail = false) {
        const row = document.createElement('div'); row.className = 'segment' + (tail ? ' tail' : '');
        const button = document.createElement('button'); button.textContent = `${title} · ${cards.length} 張`; button.onclick = () => { pause(); inspect(cards); $('message').textContent = `查看${title}；可用下一步繼續`; };
        const list = document.createElement('div'); list.className = 'cards'; list.innerHTML = cardsMarkup(cards); row.append(button, list); return row;
    }
    function render() {
        const e = history[cursor]; if (!e) return;
        $('eventLabel').textContent = `${labels[e.kind]} / 動作 ${e.number}`;
        $('message').textContent = e.message;
        $('totals').textContent = `剩餘 ${e.rest.length}　已撿 ${416 - e.rest.length}　總數 416`;
        document.querySelectorAll('#phases span').forEach((el, i) => el.classList.toggle('active', e.phase === i + 1));
        $('deckTitle').textContent = e.kind === 'done' ? '完整牌靴 · 依序由左至右' : '剩餘牌堆';
        $('deckInfo').textContent = `${e.kind === 'done' ? 416 : e.rest.length} 張 · 洗牌 ${e.shuffles} 次 · 計算 ${e.tries} 組`;
        $('deck').innerHTML = cardsMarkup(e.shoe || e.rest, new Set((e.candidate || []).map(c => c.id)), e.shoe ? 416 - e.rest.length : -1);
        if (e.candidate?.length) { inspect(e.candidate, e.seam); $('candidateInfo').textContent = `${e.candidate.length} 張 · ${e.verdict ? '本次檢查通過' : '本次未通過'}`; $('candidateInfo').className = e.verdict ? 'badge' : 'bad'; }
        else { $('candidate').innerHTML = '<span class="empty">' + (e.kind === 'shuffle' ? '洗牌後的實際順序顯示在下方牌堆' : e.message) + '</span>'; $('candidateInfo').textContent = ''; $('verification').textContent = ''; }
        $('segments').replaceChildren();
        $('segmentsTitle').textContent = e.phase >= 3 ? '長段與待接段' : '已撿出的合格段';
        if (e.phase >= 3) {
            e.chains.forEach((s, i) => $('segments').append(segmentRow(s, `長段 ${i + 1}`)));
            if (e.active.length) $('segments').append(segmentRow(e.active, '正在延長'));
            e.pool.forEach((s, i) => $('segments').append(segmentRow(s, `待接 ${i + 1}`)));
            if (e.kind === 'done' && e.rest.length) $('segments').append(segmentRow(e.rest, '尾牌・未保證合格', true));
        } else e.segments.forEach((s, i) => $('segments').append(segmentRow(s, `短段 ${i + 1}`)));
        if (!$('segments').children.length) $('segments').innerHTML = '<p class="empty">撿出的段會放在這裡。</p>';
        $('timeline').max = history.length - 1; $('timeline').value = cursor;
        $('historyLabel').textContent = `${e.number} / ${sequence}`;
        $('back').disabled = cursor === 0;
        $('step').disabled = done && cursor === history.length - 1;
        $('play').disabled = done && cursor === history.length - 1;
        $('play').textContent = playing ? '暫停' : sequence <= 1 ? '開始播放' : '繼續播放';
        const past = history.slice(0, cursor + 1);
        const emptyRounds = new Set(past.filter(e => e.kind === 'sweep' && e.idle > 0).map(e => e.shuffles));
        const visible = $('hideEmpty').checked
            ? past.filter(e => !(e.phase === 1 && emptyRounds.has(e.shuffles)))
            : past;
        $('log').replaceChildren(...visible.slice(-8).reverse().map(e => { const li = document.createElement('li'); li.value = e.number; li.textContent = e.message; return li; }));
    }
    function pause() { playing = false; clearTimeout(timer); $('play').textContent = '繼續播放'; }
    function advance() {
        if (cursor < history.length - 1) { cursor++; if (done && cursor === history.length - 1) pause(); render(); return; }
        if (done) return;
        try {
            const next = iterator.next();
            if (next.done) { done = true; pause(); render(); return; }
            const e = next.value; e.number = ++sequence; history.push(e); if (history.length > 500) history.shift(); cursor = history.length - 1;
            if (e.kind === 'done') { done = true; finalShoe = e.shoe; $('download').disabled = false; pause(); }
            render();
        } catch (error) { pause(); done = true; $('message').textContent = '停止：' + error.message; $('play').disabled = true; $('step').disabled = true; }
    }
    function pump() { if (!playing) return; advance(); if (playing) timer = setTimeout(pump, Number($('speed').value)); }
    function reset() {
        pause();
        const opts = {};
        for (const id of ['idleLimit','computeTries','chainAttempts','minLen','maxLen','seed']) {
            if (!$(id).checkValidity() || $(id).value === '') { $(id).reportValidity(); return; }
            opts[id] = Number($(id).value);
        }
        if (opts.maxLen < opts.minLen) { $('message').textContent = '最長段不得小於最短段'; return; }
        opts.inspect = () => $('inspect').checked;
        iterator = P.run(opts); history = []; cursor = 0; sequence = 0; done = false; finalShoe = null; $('download').disabled = true; advance();
    }
    $('play').onclick = () => { if (playing) { pause(); render(); } else { playing = true; pump(); } };
    $('step').onclick = () => { pause(); advance(); };
    $('reset').onclick = reset;
    $('back').onclick = () => { pause(); cursor = Math.max(0, cursor - 1); render(); };
    $('live').onclick = () => { pause(); cursor = history.length - 1; render(); };
    $('timeline').oninput = () => { pause(); cursor = Number($('timeline').value); render(); };
    $('hideEmpty').onchange = render;
    $('download').onclick = () => {
        if (!finalShoe) return;
        const last = history[history.length - 1], end = 416 - last.rest.length;
        const rows = ['位置,固定編號,副,花色,牌面,點數,區域', ...finalShoe.map((c, i) => `${i + 1},${c.id},${c.deck},${c.suit},${c.rank},${c.point},${i < end ? '合格長段' : '未排入尾牌'}`)];
        const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
        const a = document.createElement('a'); a.href = url; a.download = '穿越排牌過程-416張.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    reset();
})();
