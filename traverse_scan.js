(function (global) {
    'use strict';
    const B = global.TraverseBuilder, P = global.TraverseProcess;
    const OPTIONS = Object.freeze({ seed: 416, minLen: 8, maxLen: 12, idleLimit: 100, computeTries: 20000, chainAttempts: 3 });
    const pts = cards => cards.map(c => c.point);
    const zeros = cards => cards.filter(c => c.point === 0).length;
    const counts = e => ({ good: e.segments.length, rounds: e.shuffles, long: e.chains.length, remaining: e.rest.length });

    // Store every engine event. Inspection records share the last real snapshot;
    // their window is represented by position/length rather than 416 copied cards.
    function recorder(options) {
        const events = [];
        let phase = 0, source = -1;
        const iterator = P.run({ ...OPTIONS, ...options, inspect: () => phase === 1 });
        function step() {
            const next = iterator.next();
            if (next.done) return false;
            const e = next.value;
            phase = e.phase;
            if (e.kind === 'inspect') {
                const start = Number(e.message.match(/^檢查第 (\d+)/)[1]) - 1;
                events.push({ kind: 'inspect', source, start, length: e.candidate.length, verdict: e.verdict });
            } else { source = events.length; events.push(e); }
            return true;
        }
        return { events, step };
    }
    function eventAt(events, index) {
        const e = events[index];
        if (!e || e.kind !== 'inspect') return e;
        const base = events[e.source];
        return { ...base, kind: 'inspect', candidate: base.rest.slice(e.start, e.start + e.length),
            start: e.start, verdict: e.verdict,
            message: `第 ${e.start + 1} 張起，試 ${e.length} 張的視窗` };
    }
    function finishModel(events) {
        const final = events[events.length - 1];
        const selected = new Set(), marks = new Map(), seen = new Set();
        let attempt = 0, lastShuffle = -1, lastSweep = -1, lastInspect = -1, firstWindow = null;
        function key(i, name) { selected.add(i); marks.set(i, name); }
        function first(token, i, name) { if (!seen.has(token)) { seen.add(token); key(i, name); } }
        for (let i = 0; i < events.length; i++) {
            const e = events[i];
            if (e.kind === 'inspect') {
                const base = events[e.source], round = base.shuffles;
                if (!e.verdict) first('reject', i, '第一次不合格：哪裡發不完？');
                if (round === 1 && firstWindow === null) firstWindow = e.start;
                // Five lengths at the first position, then sample whole windows.
                if (round === 1 && e.start === firstWindow || round <= 3 && e.length === 12 && e.start % 30 === 0) selected.add(i);
                lastInspect = i;
                continue;
            }
            if (e.kind === 'initial') key(i, '從完整 416 張開始');
            if (e.kind === 'shuffle') {
                selected.add(i); lastShuffle = i;
                if (e.shuffles <= 3) key(i, e.shuffles === 1 ? '第 1 輪：洗亂後由左往右掃' : `第 ${e.shuffles} 輪：只重洗剩牌`);
            }
            if (e.kind === 'sweep') {
                lastSweep = i;
                if (lastInspect >= 0) selected.add(lastInspect);
                if (e.shuffles <= 3) selected.add(i);
                lastInspect = -1;
            }
            if (e.kind === 'found') { selected.add(i); first('found', i, '第一次合格：放大看每一局'); }
            if (e.kind === 'pick') {
                selected.add(i);
                first(e.phase === 1 ? 'pick' : 'computed', i, e.phase === 1 ? '整段拉出：同一位置繼續掃' : '補排找到新段：從庫存抽出這些牌');
            }
            if (e.kind === 'phase') {
                key(lastShuffle, `最後一輪洗牌：第 ${final.shuffles} 輪`);
                key(lastSweep, '洗牌撿段停止');
                key(i, '計算補排：改用點數組合');
            }
            if (e.kind === 'compute' && (e.verdict || e.tries % 2000 === 0)) selected.add(i);
            if (e.kind === 'chainStart') { attempt++; key(i, `第 ${attempt} 次拼接：打亂好段再試`); }
            if (e.kind === 'chainSeed' || e.kind === 'join' || e.kind === 'chainDone' || e.kind === 'attemptDone') selected.add(i);
            if (e.kind === 'joinTest') {
                if (e.verdict) { selected.add(i); first('join-ok', i, '這個接縫可接：整條重新通過'); }
                else first('join-no', i, '這個接縫不能接：換下一段');
            }
        }
        const frames = [...selected].sort((a, b) => a - b).map(eventIndex => ({ eventIndex, title: marks.get(eventIndex) || '', mode: 'event' }));
        frames.push({ eventIndex: events.length - 1, title: '剩牌處理：長段排好，剩牌放尾端', mode: 'tail' });
        frames.push({ eventIndex: events.length - 1, title: '完成：416 張完整牌靴', mode: 'done' });
        const keypoints = [];
        frames.forEach((f, frameIndex) => {
            if (f.title) { f.key = keypoints.length + 1; keypoints.push({ number: f.key, title: f.title, frameIndex, eventIndex: f.eventIndex }); }
        });
        const weight = f => {
            const e = events[f.eventIndex];
            if (e.kind === 'shuffle') return .45;
            if (e.kind === 'inspect') return .15;
            if (e.kind === 'pick' || e.kind === 'join') return 2.5;
            if (e.kind === 'found' || e.kind === 'joinTest') return 1.3;
            return .7;
        };
        const holds = keypoints.length * 6000;
        const normalWeight = frames.filter(f => !f.key).reduce((sum, f) => sum + weight(f), 0);
        const budget = Math.max(45000, 180000 - holds);
        frames.forEach(f => { f.duration = f.key ? 6000 : budget * weight(f) / normalWeight; });
        return { events, frames, keypoints, final, summary: counts(final),
            duration: frames.reduce((sum, f) => sum + f.duration, 0),
            eventAt: index => eventAt(events, index) };
    }
    function build(options = {}) {
        const r = recorder(options);
        while (r.step()) { /* deterministic engine only */ }
        return finishModel(r.events);
    }
    async function buildAsync(onProgress) {
        const r = recorder();
        let running = true;
        while (running) {
            const start = performance.now();
            do { running = r.step(); } while (running && performance.now() - start < 24);
            onProgress(r.events.length);
            if (running) await new Promise(resolve => setTimeout(resolve, 0));
        }
        return finishModel(r.events);
    }
    // Explanation only: use the shared simulator, never select/reorder cards here.
    function trace(points) {
        const routes = [];
        for (let start = 0; start < points.length; start++) {
            if ([1, 2, 3, 7].includes(points.length - start)) { routes.push({ start, exempt: true }); continue; }
            const sizes = []; let cursor = start;
            while (cursor < points.length) {
                const hand = B.simulateHand(points, cursor, points.length);
                if (!hand) { routes.push({ start, sizes, failure: cursor, remaining: points.length - cursor }); return routes; }
                sizes.push(hand.size); cursor += hand.size;
            }
            routes.push({ start, sizes });
        }
        return routes;
    }
    function diagnosis(cards) {
        const result = P.check(cards), p = pts(cards);
        if (result.ok) return '穿越、每局敏感、單局對調後仍穿越，三項全部通過。';
        const routes = trace(p), failure = routes.find(r => r.failure !== undefined);
        if (failure) return `從第 ${failure.start + 1} 張發，${failure.sizes.length ? `用掉 ${failure.sizes.join('＋')} 張後，` : ''}剩 ${failure.remaining} 張，湊不成下一局；沒有剛好發完。`;
        return result.reason + '，所以整段不能使用。';
    }
    function explain(e, f) {
        let title = f.title || e.message, text = '';
        if (e.kind === 'initial') text = '8 副牌合計 416 張。先洗亂，再從第 1 張試 12、11、10、9、8 張的視窗。';
        if (e.kind === 'shuffle') text = e.shuffles === 1 ? '掃描框每次圈出一個候選段。同位置的五種長度都試過，才決定要不要撿。' : `已撿的好段留在上方，只把剩下 ${e.rest.length} 張收攏、洗亂，再從第 1 張掃。`;
        if (e.kind === 'inspect') {
            title = f.title || (e.verdict ? '這個視窗合格，還要比較同位置其他長度' : '這個視窗不合格，繼續試');
            const check = P.check(e.candidate);
            text = !check.ok ? diagnosis(e.candidate) : !e.verdict ? `點數條件過了，但 0 點 ${zeros(e.candidate)}/${e.candidate.length} 低於剩牌 ${zeros(e.rest)}/${e.rest.length}，不能撿。` : '暫列候選；同位置取 0 點比例最高者，同率保留先試的較長段。';
        }
        if (e.kind === 'found') {
            title = f.title || `找到 ${e.candidate.length} 張好段`;
            text = `三項點數條件全過，0 點 ${zeros(e.candidate)}/${e.candidate.length} 不低於剩牌 ${zeros(e.rest)}/${e.rest.length}；這是同位置合格視窗中比例最高者。`;
        }
        if (e.kind === 'pick') text = e.phase === 1 ? '綠色整段拉到好段區。後面的牌補上空位，掃描起點不動；五種長度都沒通過才往右移一張。' : '依點數從剩牌庫存取出實際卡片，組成新好段；其餘牌留在下方。';
        if (e.kind === 'sweep') text = f.title ? (e.rest.length < 8 ? '剩不到 8 張，洗牌撿段停止，進入補排。' : `已連續 ${e.idle} 輪撿不到，達到 100 輪上限；不是總共只洗 100 輪。`) : e.message + '；接著把剩牌重洗。';
        if (e.kind === 'phase') text = '把剩牌按點數當成庫存，挑可組成的敏感局，湊成 8～12 張後再驗三項條件。這一步沒有洗牌，也沒有硬性 0 點比例門檻。';
        if (e.kind === 'compute') { title = e.verdict ? '點數組合通過了' : '正在用剩牌試組合'; text = e.message + '。候選局敏感，不代表拼成整段一定穿越。'; }
        if (e.kind === 'chainStart') text = '打亂的是「整個好段」，段內牌序不動。拿一段作起點，逐段試接；接成功就從待接區開頭再試。';
        if (e.kind === 'chainSeed') text = '先取一段放在下方，再從上方待接區逐段試接。';
        if (e.kind === 'joinTest') {
            title = f.title || (e.verdict ? '可以接上' : '這一段接不上');
            text = e.verdict ? '金線是這次接縫。接起來整條的穿越、每局敏感、每局單獨對調後穿越，重新檢查全部通過。' : '金線是這次接縫。' + diagnosis(e.candidate) + '保留原長段，換下一個好段試。';
        }
        if (e.kind === 'join') text = '整段移到長段尾端；接成功後再從待接區開頭試，能延長就繼續。';
        if (e.kind === 'chainDone') text = '剩下的段都接不上這條，先收好；再拿一個尚未使用的好段當新起點。';
        if (e.kind === 'attemptDone') text = '比較這次與之前的結果：先看最長段長度，再看長段數是否較少。三次用的是同一批好段。';
        if (f.mode === 'tail') text = `三次結果取最佳，長段由長到短排列。剩下 ${e.rest.length} 張放到最後；長段之間與剩牌接縫不保證穿越。`;
        if (f.mode === 'done') text = `${e.segments.length} 個好段拼成 ${e.chains.length} 條長段，加上尾端 ${e.rest.length} 張剩牌，仍是 416 張，每張原始牌都在。`;
        return { title, text };
    }
    const API = global.TraverseScan = { OPTIONS, build, eventAt, explain, diagnosis, trace, counts, ready: false };
    if (!global.document) return;
    const $ = id => document.getElementById(id);
    let model, frameIndex = 0, playing = false, elapsed = 0, lastTime = 0, speed = 1;
    let previous = null, currentFrame = null, shelfMarkup = '';
    const motion = !global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function cardHTML(c, extra = '') { return `<span class="card ${c.point === 0 ? 'zero ' : ''}${extra}" data-id="${c.id}" title="第 ${c.deck} 副 ${c.rank}${c.suit} · 編號 ${c.id}">${c.point}</span>`; }
    function cleanMotion() {
        document.getAnimations().forEach(a => a.cancel());
        document.querySelectorAll('.flying').forEach(n => n.remove());
        $('board-wrap').classList.remove('shuffling');
    }
    function animate(node, frames, duration, done) {
        if (!motion) { if (done) done(); return; }
        const a = node.animate(frames, { duration: Math.max(35, duration / speed), easing: 'ease-in-out', fill: 'both' });
        a.onfinish = () => { a.cancel(); if (done) done(); };
        if (!playing) a.pause();
    }
    function shelfHTML(e) {
        if (e.phase < 3) return e.segments.map((s, i) => segmentHTML(s, i + 1, e.kind === 'pick' && i === e.segments.length - 1)).join('');
        if (e.phase === 4) return e.chains.map((s, i) => segmentHTML(s, i + 1, false, true)).join('');
        return e.pool.map(s => segmentHTML(s, e.segments.indexOf(s) + 1)).join('');
    }
    function segmentHTML(s, number, fresh = false, long = false) {
        return `<div class="segment ${fresh ? 'new' : ''}" data-first="${s[0].id}"><b>${long ? '長' : '#'}${number} · ${s.length}張</b>${!long ? `<span class="strip">${s.map(c => `<i class="${c.point === 0 ? 'zero' : ''}">${c.point}</i>`).join('')}</span>` : ''}</div>`;
    }
    function drawScanner(ids, verdict) {
        const wrap = $('board-wrap').getBoundingClientRect(), rows = new Map();
        $('board').querySelectorAll('.card').forEach(n => {
            if (!ids.has(Number(n.dataset.id))) return;
            const r = n.getBoundingClientRect(), key = Math.round(r.top);
            const row = rows.get(key);
            if (row) row.right = Math.max(row.right, r.right);
            else rows.set(key, { left: r.left, top: r.top, right: r.right, bottom: r.bottom });
        });
        const container = $('scanner');
        while (container.children.length > rows.size) container.lastElementChild.remove();
        [...rows.values()].forEach((r, i) => {
            let n = container.children[i];
            if (!n) { n = document.createElement('div'); container.append(n); }
            n.className = 'scan-box ' + (verdict === true ? 'accept' : verdict === false ? 'reject' : '');
            Object.assign(n.style, { left: `${r.left - wrap.left - 4}px`, top: `${r.top - wrap.top - 4}px`, width: `${r.right - r.left + 6}px`, height: `${r.bottom - r.top + 6}px` });
        });
    }
    function details(e, f) {
        if (e.kind === 'found' && f.key) {
            const p = pts(e.candidate), rounds = B.roundsFromStart(p);
            const hands = rounds.map((r, i) => {
                const hand = p.slice(r.start, r.start + r.size), swapped = hand.slice();
                [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
                const after = B.simulateHand(swapped, 0, swapped.length);
                return `<div class="hand">第 ${i + 1} 局 <span class="mini-points">${hand.join(' ')}</span><span>${r.result} → ${after.result}，仍 ${r.size} 張 ✓</span></div>`;
            }).join('');
            const routes = trace(p).filter(r => !r.exempt).map(r => `起點${r.start + 1}：${r.sizes.join('+')}`).join('；');
            return `<div class="large-cards">${e.candidate.map(c => cardHTML(c, 'accept')).join('')}</div>${hands}<p class="pass">各局單獨對調後，整段仍穿越 ✓</p><p>${routes}，皆剛好到尾端。</p><p>到尾端剩 1、2、3、7 張的起點豁免。</p>`;
        }
        if (e.candidate?.length && ['inspect', 'found', 'compute', 'pick'].includes(e.kind)) return `<div class="large-cards">${e.candidate.map(c => cardHTML(c, e.verdict ? 'accept' : 'reject')).join('')}</div><p>${e.kind === 'inspect' ? `起點 ${e.start + 1} · 視窗 ${e.candidate.length} 張 · 同位置依序試 12 → 8` : e.message}</p>`;
        if (e.phase === 3) return `<p>已收好 ${e.chains.length} 條長段 · 待接 ${e.pool.length} 段</p><p class="${e.verdict === false ? 'fail' : 'pass'}">${e.kind === 'joinTest' ? (e.verdict ? '✓ 接後整條三項條件通過' : '× 接後整條未通過') : e.message}</p><p>接不上就換下一段；全部接不上才另起一條。</p>`;
        if (e.phase === 4) return `<p class="pass">${e.chains.map(c => c.length).join(' ＋ ')} 張</p><p>長段合計 ${416 - e.rest.length} 張 ＋ 剩牌 ${e.rest.length} 張 ＝ 416 張</p><p>金色直線：不同長段的邊界。灰色牌：未排入的剩牌。</p>`;
        if (e.kind === 'phase') return `<p>剩牌點數庫存</p><p>${Array.from({ length: 10 }, (_, p) => `${p}點 × ${e.rest.filter(c => c.point === p).length}`).join('　')}</p>`;
        return `<p>① 穿越（排除豁免起點）</p><p>② 從段頭發的每局皆敏感</p><p>③ 每局單獨對調後，整段仍穿越</p>`;
    }
    function render(transition = false) {
        const f = model.frames[frameIndex], e = model.eventAt(f.eventIndex);
        const oldRects = new Map();
        const joinFirst = e.kind === 'join' && previous?.kind === 'joinTest' ? e.active[previous.seam]?.id : null;
        const joinOrigin = joinFirst ? $('shelf').querySelector(`[data-first="${joinFirst}"]`)?.getBoundingClientRect() : null;
        if (transition && (e.kind === 'pick' || e.kind === 'shuffle' && e.shuffles <= 3)) {
            document.querySelectorAll('#board .card, #shelf .segment').forEach(n => oldRects.set(Number(n.dataset.id || n.dataset.first), n.getBoundingClientRect()));
        }
        cleanMotion(); currentFrame = f;
        const c = counts(e), info = explain(e, f);
        $('round').textContent = c.rounds; $('remaining').textContent = c.remaining;
        $('good').textContent = c.good; $('long').textContent = c.long;
        $('headline').textContent = info.title; $('explanation').textContent = info.text;
        $('key-label').textContent = f.key ? `關鍵點 ${f.key} / ${model.keypoints.length} · ${playing ? '停留解說' : '已暫停'}` : e.phase === 1 && e.shuffles > 3 ? '快轉中 · 重複相同掃描方式' : '實際牌序 · 依事件播放';
        document.querySelector('.narration').classList.toggle('bad', e.verdict === false);
        $('detail').innerHTML = details(e, f);
        document.querySelectorAll('.phases span').forEach((n, i) => n.classList.toggle('active', Math.max(1, e.phase) === i + 1));
        $('pace').textContent = e.phase === 1 ? `連續 ${e.idle} 輪未撿到 · ${e.shuffles > 3 ? '後續輪次快轉' : '先看懂前幾輪'}` : e.phase === 2 ? `計算已試 ${e.tries.toLocaleString()} 組` : e.phase === 3 ? '同一批好段 · 比較三次拼接結果' : '完整保存每張牌的身分與點數';
        $('shelf-title').textContent = e.phase < 3 ? '好段區' : e.phase === 3 ? '待接好段區' : '選出的長段';
        $('shelf-note').textContent = e.phase < 3 ? '撿出後留在這裡，不參與剩牌重洗' : e.phase === 3 ? '每次取整段，段內牌序不動' : '由長到短排列，再把剩牌放最後';
        const nextShelf = shelfHTML(e) || '<span class="empty">' + (e.phase === 3 ? '這次所有好段已用完。' : '還沒撿到，先看下方怎麼掃。') + '</span>';
        if (nextShelf !== shelfMarkup) { $('shelf').innerHTML = nextShelf; shelfMarkup = nextShelf; }
        let cards, boundaries = new Set(), tail = new Set();
        if (e.phase < 3) cards = e.rest;
        else if (e.phase === 3) cards = e.kind === 'joinTest' ? e.candidate : e.active.length ? e.active : e.chains.flat();
        else {
            cards = e.shoe; let offset = 0;
            e.chains.forEach(s => { if (offset) boundaries.add(offset); offset += s.length; });
            e.rest.forEach(c => tail.add(c.id));
        }
        let highlighted = e.phase < 3 && e.candidate ? e.candidate : [];
        let highlightVerdict = e.verdict;
        if (e.kind === 'pick' && e.phase === 1) {
            const next = model.eventAt(f.eventIndex + 1);
            highlighted = next?.kind === 'inspect' ? next.candidate : [];
            highlightVerdict = undefined;
        }
        const selection = new Set(highlighted.map(c => c.id));
        $('board').innerHTML = cards.map((card, i) => cardHTML(card,
            (selection.has(card.id) ? (highlightVerdict === true ? 'accept ' : highlightVerdict === false ? 'reject ' : 'selected ') : '') +
            (i === e.seam ? 'seam ' : '') + (boundaries.has(i) ? 'boundary ' : '') + (tail.has(card.id) ? 'tail ' : ''))).join('');
        $('board-title').textContent = e.phase < 3 ? `${e.phase === 2 ? '剩牌庫存' : '待掃的牌'} · ${cards.length} 張` : e.phase === 3 ? `${e.kind === 'joinTest' ? '正在試接' : e.active.length ? '正在延長' : '已接長段'} · ${cards.length} 張` : '完整牌靴 · 416 張';
        $('board-note').textContent = e.phase === 3 ? e.seam ? `第 ${e.seam} 與 ${e.seam + 1} 張之間是本次接縫` : '每次拼接都重驗整條' : '淺色＝1～9 點　金色＝0 點';
        $('seam-note').textContent = e.phase === 3 && e.kind === 'joinTest' ? (e.verdict ? '✓ 這個接縫通過，下一步把新段接上。' : '× 這個接縫不通過，下一步保留原段、換別段。') : e.phase === 4 ? '各長段分別合格；長段間與灰色剩牌處不保證穿越。' : e.kind === 'inspect' ? `↑ 起點第 ${e.start + 1} 張；視窗 ${e.candidate.length} 張。一般失敗嘗試已快轉。` : e.kind === 'pick' && e.phase === 1 ? '↑ 後牌補上空位；下一次仍從剛才的位置掃。' : '';
        drawScanner(selection, highlightVerdict);
        if (transition && motion) {
            const duration = Math.min(f.duration * .9, e.kind === 'shuffle' ? 1300 : 850);
            if (e.kind === 'shuffle') {
                $('board-wrap').classList.add('shuffling');
                if (e.shuffles <= 3 || f.key) {
                    const area = $('board').getBoundingClientRect();
                    const nodes = [...$('board').children];
                    // Read all rectangles before starting animations: avoid one
                    // layout pass per card during the 416-card shuffle.
                    const rects = nodes.map(n => n.getBoundingClientRect());
                    nodes.forEach((n, i) => {
                        const r = rects[i], old = oldRects.get(Number(n.dataset.id)) || r;
                        const x = area.left + area.width / 2 - r.left, y = area.top + area.height / 2 - r.top;
                        animate(n, [{ transform: `translate(${old.left - r.left}px,${old.top - r.top}px)` },
                            { transform: `translate(${x}px,${y}px) rotate(${i % 9 - 4}deg)`, offset: .35 },
                            { transform: `translate(${x + (i % 2 ? 26 : -26)}px,${y}px) rotate(${i % 13 - 6}deg)`, offset: .64 },
                            { transform: 'translate(0,0)' }], duration, i === 0 ? () => $('board-wrap').classList.remove('shuffling') : null);
                    });
                } else {
                    animate($('board'), [{ transform: 'scale(1)' },
                        { transform: 'scale(.07) rotate(-8deg)', offset: .35 },
                        { transform: 'scale(.07) rotate(8deg)', offset: .65 },
                        { transform: 'scale(1)' }], duration, () => $('board-wrap').classList.remove('shuffling'));
                }
            }
            if (e.kind === 'inspect' && !e.verdict) $('board').querySelectorAll('.reject').forEach(n =>
                animate(n, [{ opacity: 1 }, { opacity: .45 }, { opacity: 1 }], Math.min(duration, 400)));
            if (e.kind === 'pick') {
                const target = $('shelf').querySelector('.new')?.getBoundingClientRect();
                if (target) e.candidate.forEach((card, i) => fly(card, oldRects.get(card.id), { left: target.left + 5 + i * 7, top: target.top }, duration));
            }
            if (e.kind === 'join' && previous?.kind === 'joinTest') {
                const added = e.active.slice(previous.seam), source = joinOrigin;
                added.forEach(card => {
                    const target = $('board').querySelector(`[data-id="${card.id}"]`)?.getBoundingClientRect();
                    fly(card, source, target, duration);
                });
            }
            if (f.mode === 'tail') {
                let offset = 0;
                e.chains.forEach((chain, index) => {
                    for (let i = offset; i < offset + chain.length; i++) {
                        animate($('board').children[i], [{ opacity: 0, transform: 'translateY(-22px)' },
                            { opacity: 0, transform: 'translateY(-22px)', offset: index / (e.chains.length + 2) },
                            { opacity: 1, transform: 'translateY(0)' }], 1800);
                    }
                    offset += chain.length;
                });
                for (let i = offset; i < cards.length; i++) animate($('board').children[i],
                    [{ opacity: 0, transform: 'translateX(30px)' }, { opacity: 0, offset: .75 }, { opacity: 1, transform: 'translateX(0)' }], 2200);
            }
        }
        if (f.key) $('keys').value = f.key;
        $('next').disabled = !model.keypoints.some(k => k.frameIndex > frameIndex);
        previous = e;
        API.current = { frameIndex, eventIndex: f.eventIndex, key: f.key || null, counts: c, mode: f.mode };
        updateControls();
    }
    function fly(card, from, to, duration) {
        if (!from || !to) return;
        const n = document.createElement('span'); n.className = 'card accept flying'; n.textContent = card.point;
        Object.assign(n.style, { left: `${from.left}px`, top: `${from.top}px`, width: '23px', height: '28px' }); document.body.append(n);
        animate(n, [{ transform: 'translate(0,0)', opacity: 1 }, { transform: `translate(${to.left - from.left}px,${to.top - from.top}px) scale(.65)`, opacity: .4 }], duration, () => n.remove());
    }
    function updateControls() {
        $('play').textContent = playing ? '暫停' : frameIndex === model.frames.length - 1 ? '再看一次' : '播放';
        $('play-state').textContent = playing ? currentFrame?.key ? '重點停留中' : '播放中' : '已暫停';
        $('progress').value = frameIndex / (model.frames.length - 1);
        if (currentFrame?.key) $('key-label').textContent = `關鍵點 ${currentFrame.key} / ${model.keypoints.length} · ${playing ? '停留解說' : '已暫停'}`;
        API.playing = playing;
    }
    function pause() { playing = false; document.getAnimations().forEach(a => a.pause()); updateControls(); }
    function play() {
        if (frameIndex === model.frames.length - 1) seek(0, false);
        playing = true; lastTime = 0;
        document.getAnimations().forEach(a => a.play()); updateControls();
    }
    function seek(index, paused = true) {
        frameIndex = Math.max(0, Math.min(model.frames.length - 1, index));
        elapsed = 0; lastTime = 0; if (paused) playing = false;
        render(false);
    }
    function gotoKey(number) {
        const key = model.keypoints.find(k => k.number === Number(number));
        if (key) { seek(key.frameIndex); return true; }
        return false;
    }
    function tick(time) {
        if (playing && model) {
            if (lastTime) elapsed += Math.min(time - lastTime, 250) * speed;
            lastTime = time;
            if (elapsed >= model.frames[frameIndex].duration) {
                elapsed = 0;
                if (frameIndex < model.frames.length - 1) { frameIndex++; render(true); }
                else pause();
            }
        } else lastTime = 0;
        requestAnimationFrame(tick);
    }
    API.readyPromise = (async () => {
        try {
            model = await buildAsync(n => { $('pace').textContent = `已記錄 ${n.toLocaleString()} 個事件…`; });
            Object.assign(API, model, { ready: true, gotoKey, seek, play, pause });
            $('keys').innerHTML = model.keypoints.map(k => `<option value="${k.number}">${k.number}. ${k.title}</option>`).join('');
            ['play', 'next', 'restart', 'keys'].forEach(id => { $(id).disabled = false; });
            $('stage').setAttribute('aria-busy', 'false');
            $('play').onclick = () => playing ? pause() : play();
            $('next').onclick = () => { const k = model.keypoints.find(k => k.frameIndex > frameIndex); if (k) gotoKey(k.number); };
            $('restart').onclick = () => { playing = true; seek(0, false); };
            $('keys').onchange = () => gotoKey($('keys').value);
            $('speed').onchange = () => { const old = speed; speed = Number($('speed').value); document.getAnimations().forEach(a => a.updatePlaybackRate(a.playbackRate * speed / old)); };
            document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
            global.addEventListener('resize', () => { if (model) render(false); });
            const key = new URLSearchParams(global.location.search).get('key');
            if (key !== null && gotoKey(Number(key))) { /* stable screenshot state */ }
            else { playing = true; render(false); }
            requestAnimationFrame(tick);
            return model;
        } catch (error) {
            $('error').hidden = false; $('error').textContent = '無法完成離線計算：' + error.message;
            $('pace').textContent = '計算失敗'; API.error = error.message;
            return null;
        }
    })();
})(typeof window !== 'undefined' ? window : globalThis);
