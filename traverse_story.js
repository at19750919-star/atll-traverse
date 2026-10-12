(function (global) {
    'use strict';
    const B = global.TraverseBuilder, P = global.TraverseProcess;
    const phases = [
        { name: '原始 8 副牌', purpose: '準備 416 張牌，為每張牌保留固定編號，之後可以追蹤它被撿到哪一段。' },
        { name: '洗牌撿段', purpose: '把剩牌洗亂，逐位置試 8～12 張候選段。三項點數條件通過，且 0 點比例不低於剩牌堆，才撿出來。連續撿不到才換方法。' },
        { name: '計算補排', purpose: '用剩牌能組出的敏感局拼成候選段，再檢查完整段是否穿越、每局敏感及單局對調後仍穿越。找不到就繼續試，直到達上限或牌不足。' },
        { name: '接成長段', purpose: '把已撿短段換順序試接；每次都重驗整段，接縫合格才保留。共嘗試 3 次，優先保留最長一條較長、同長時條數較少的結果。' },
        { name: '完整牌靴', purpose: '保留最佳接段結果，把未排入牌放到尾端，核對總共 416 張且編號不重複，再驗證每條長段。' }
    ];
    const labels = { initial: '原始牌', shuffle: '洗亂剩牌', inspect: '檢查候選', found: '找到合格段', pick: '收下短段', sweep: '本輪結束', phase: '開始補排', compute: '組合敏感局', chainStart: '重新試接', chainSeed: '選長段起點', joinTest: '檢查接縫', join: '接上短段', chainDone: '收下長段', attemptDone: '比較接段結果', done: '完成' };

    // 只補充診斷；是否採用候選仍完全由原引擎決定。
    function failedStart(points) {
        for (let start = 0; start < points.length; start++) {
            if ([1, 2, 3, 7].includes(points.length - start)) continue;
            let at = start;
            while (at < points.length) {
                const hand = B.simulateHand(points, at, points.length);
                if (!hand) return `從第 ${start + 1} 張起發，到第 ${at + 1} 張時只剩 ${points.length - at} 張，無法完成下一局。`;
                at += hand.size;
            }
        }
        return '';
    }
    function diagnose(cards) {
        const checked = P.check(cards), points = cards.map(c => c.point);
        if (checked.ok) return `這 ${cards.length} 張的 ${checked.rounds.length} 局都敏感；需檢查的起點都能發完，任一局單獨對調後也仍穿越。`;
        if (!B.isTraverse(points)) return failedStart(points) || checked.reason;
        const rounds = B.roundsFromStart(points);
        if (!rounds) return checked.reason;
        for (let i = 0; i < rounds.length; i++) {
            const r = rounds[i], hand = points.slice(r.start, r.start + r.size);
            const swapped = hand.slice(); [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
            if (!B.handSensitive(hand)) {
                const after = B.simulateHand(swapped, 0, swapped.length);
                return `第 ${i + 1} 局（段內第 ${r.start + 1} 張起）不敏感：原本${r.result}、${r.size} 張；對調前兩張後${after ? `變成${after.result}、${after.size} 張，未符合敏感條件` : '這些牌無法完成一局'}。`;
            }
            const changed = points.slice(); [changed[r.start], changed[r.start + 1]] = [changed[r.start + 1], changed[r.start]];
            if (!B.isTraverse(changed)) return `第 ${i + 1} 局單獨對調後不穿越：${failedStart(changed)}`;
        }
        return checked.reason;
    }
    function totals(s) { return `剩牌 ${s.rest.length} 張，已排 ${s.segments.length} 段短段，已接 ${s.chains.length} 條長段`; }
    function explain(s) {
        let reason = '';
        const candidate = s.candidate || [];
        if (candidate.length && ['inspect', 'found', 'pick', 'compute', 'joinTest', 'join'].includes(s.kind)) {
            // 未達長度、庫存不足由 snapshot 訊息說明，不能誤稱短候選可撿。
            if (s.kind === 'compute' && !s.verdict && candidate.length < 8) reason = `目前只組出 ${candidate.length} 張，還不到最短 8 張，不能收下。`;
            else {
                reason = diagnose(candidate);
                if (s.phase === 1 && ['inspect', 'found'].includes(s.kind) && P.check(candidate).ok) {
                    const z = candidate.filter(c => c.point === 0).length, rz = s.rest.filter(c => c.point === 0).length;
                    reason += ` 0 點比例：候選 ${z}/${candidate.length}，剩牌堆 ${rz}/${s.rest.length}；${z * s.rest.length >= rz * candidate.length ? '比例通過' : '比例不足，這次不撿'}。`;
                }
            }
        }
        if (s.kind === 'chainSeed') reason = `先取 ${s.active.length} 張，接著從待接的 ${s.pool.length} 段中找能接上的段。`;
        if (s.kind === 'joinTest') reason = `接縫在第 ${s.seam}／${s.seam + 1} 張之間。${reason}`;
        if (s.kind === 'done') reason = `完整牌序 ${s.shoe.length} 張、${new Set(s.shoe.map(c => c.id)).size} 個不同編號。尾端 ${s.rest.length} 張未排入合格段；長段之間與尾牌不保證穿越。`;
        return { action: s.message, reason, counts: totals(s), text: `${s.message}。${reason} ${totals(s)}。` };
    }

    // 階段說明插在第一個新 phase 事件之前，不改動或重跑生成器。
    function createPlayer(generator) {
        let pending = null, current = null, phase = -1, ended = false, step = 0;
        return { next() {
            if (ended) return null;
            if (!pending) { const n = generator.next(); if (n.done) { ended = true; return null; } pending = n.value; }
            if (pending.phase !== phase) {
                phase = pending.phase;
                return { intro: true, phase, snapshot: current || pending, step };
            }
            current = pending; pending = null; step++;
            if (current.kind === 'done') ended = true;
            return { intro: false, phase, snapshot: current, step };
        } };
    }

    function mount(doc) {
        const $ = id => doc.getElementById(id);
        let player, frame, playing = false, timer = null, previousSegments = 0;
        const nav = phases.map((p, i) => { const el = doc.createElement('span'); el.textContent = `${i} · ${p.name}`; $('phases').append(el); return el; });
        function cardList(target, cards, selected = new Set(), seam = -1) {
            target.replaceChildren();
            cards.forEach((c, i) => {
                const el = doc.createElement('span'); el.className = 'card';
                if (['♥', '♦'].includes(c.suit)) el.classList.add('red');
                if (selected.has(c.id)) el.classList.add('selected');
                if (i === seam) el.classList.add('seam');
                el.style.setProperty('--i', Math.min(i, 18));
                el.append(`${c.rank}${c.suit}`); const id = doc.createElement('b'); id.textContent = `#${c.id}`; el.append(id);
                el.title = `第 ${c.deck} 副，固定編號 ${c.id}，${c.point} 點`; target.append(el);
            });
        }
        function render(f) {
            const s = f.snapshot, info = explain(s);
            $('intro').hidden = !f.intro;
            $('introLabel').textContent = `PHASE ${f.phase} / 階段開始前`;
            $('introTitle').textContent = phases[f.phase].name;
            $('introText').textContent = phases[f.phase].purpose;
            nav.forEach((el, i) => { el.classList.toggle('active', i === f.phase); if (i === f.phase) el.setAttribute('aria-current', 'step'); else el.removeAttribute('aria-current'); });
            $('event').textContent = f.intro ? `即將進入 phase ${f.phase}` : `第 ${f.step} 步 · ${labels[s.kind] || s.kind}`;
            $('totals').textContent = info.counts;
            $('explanation').textContent = f.intro ? '先讀上方的階段目的，再進入下一個動作。下方保留目前牌堆狀態。' : info.action;
            $('reason').textContent = f.intro ? '' : info.reason;
            $('reason').classList.toggle('bad', s.verdict === false);
            const focus = s.candidate || (s.active.length ? s.active : (s.shoe || s.rest).slice(0, 24));
            $('actionTitle').textContent = f.intro ? '目前牌堆狀態' : labels[s.kind];
            $('actionLabel').textContent = s.candidate ? `候選 ${focus.length} 張` : s.active.length ? `正在接的長段 ${focus.length} 張` : '牌堆前 24 張預覽';
            $('candidate').parentElement.dataset.kind = f.intro ? 'intro' : s.kind;
            cardList($('candidate'), focus, new Set(), s.seam);
            $('cardHint').textContent = s.seam ? `金色分界是接縫，第 ${s.seam + 1} 張是新接上的第一張。` : '每張牌下方的 # 編號固定不變，可對照剩牌與已排段。';
            const selected = new Set((s.candidate || []).map(c => c.id));
            cardList($('deck'), s.shoe || s.rest, selected);
            $('deckTitle').textContent = s.shoe ? `完整牌序 · ${s.shoe.length} 張（尾牌 ${s.rest.length} 張）` : `剩餘牌堆 · ${s.rest.length} 張`;
            const groups = s.phase >= 3 ? [...s.chains, ...(s.active.length ? [s.active] : []), ...s.pool] : s.segments;
            $('segmentsTitle').textContent = s.phase >= 3 ? `長段 ${s.chains.length} 條 · 正在接 ${s.active.length} 張 · 待接 ${s.pool.length} 段` : `已撿出的短段 · ${s.segments.length} 段`;
            $('segments').replaceChildren();
            groups.forEach((cards, i) => {
                const el = doc.createElement('button'); el.className = 'segment';
                const prefix = s.phase < 3 ? '短段' : i < s.chains.length ? '長段' : s.active.length && i === s.chains.length ? '正在接' : '待接段';
                el.textContent = `${prefix} ${i + 1} · ${cards.length} 張`;
                if (s.phase < 3 && i >= previousSegments) el.classList.add('enter');
                if (prefix === '正在接') el.classList.add('active');
                el.onclick = () => { pause(); $('intro').hidden = true; $('actionTitle').textContent = el.textContent; $('actionLabel').textContent = '已排段檢查'; cardList($('candidate'), cards); $('explanation').textContent = `查看${el.textContent}，播放位置保留。`; $('reason').textContent = diagnose(cards); $('reason').classList.remove('bad'); $('cardHint').textContent = '按下一步或繼續播放，回到生成流程。'; };
                $('segments').append(el);
            });
            if (!groups.length) $('segments').textContent = '還沒有收下合格段。';
            previousSegments = s.segments.length;
            $('step').disabled = !f.intro && s.kind === 'done'; $('play').disabled = $('step').disabled;
        }
        function pause() { playing = false; global.clearTimeout(timer); timer = null; $('play').textContent = frame?.step ? '繼續播放' : '開始播放'; $('playState').textContent = frame && !frame.intro && frame.snapshot.kind === 'done' ? '已完成' : '已暫停'; }
        function advance() {
            try {
                const next = player.next();
                if (!next) { pause(); return; }
                frame = next; render(frame);
                if (!frame.intro && frame.snapshot.kind === 'done') pause();
            } catch (e) { pause(); $('error').textContent = `排牌停止：${e.message}`; }
        }
        function schedule() {
            global.clearTimeout(timer);
            if (!playing) return;
            const delay = frame?.intro ? Math.max(4200, Number($('speed').value)) : Number($('speed').value);
            timer = global.setTimeout(() => { advance(); schedule(); }, delay);
        }
        function reset() {
            pause(); previousSegments = 0; $('error').textContent = '';
            player = createPlayer(P.run({ inspect: () => $('inspect').checked }));
            advance();
            pause();
        }
        $('play').onclick = () => { if (playing) pause(); else { playing = true; $('play').textContent = '暫停'; $('playState').textContent = '播放中'; schedule(); } };
        $('step').onclick = () => { pause(); advance(); };
        $('reset').onclick = reset; $('speed').onchange = schedule;
        doc.addEventListener('visibilitychange', () => { if (doc.hidden) pause(); });
        reset();
    }
    global.TraverseStory = { phases, explain, diagnose, failedStart, createPlayer, mount };
    if (global.document) mount(global.document);
})(typeof window !== 'undefined' ? window : globalThis);
