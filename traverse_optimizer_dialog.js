/* Non-modal comparison window: the main card table remains usable. */
(function () {
  const panel = document.getElementById('optimizerPanel');
  const handle = document.getElementById('optimizerHandle');
  const open = document.getElementById('btnOptOpen');
  const close = document.getElementById('btnOptClose');
  let positioned = false, drag = null, returnFocus = null;
  function move(x, y) {
    const rect = panel.getBoundingClientRect(), header = handle.getBoundingClientRect();
    // Allow the body off-screen while leaving a usable piece of the drag handle.
    const visibleWidth = Math.min(160, rect.width, window.innerWidth);
    const visibleHeight = Math.min(32, header.height, window.innerHeight);
    panel.style.left = `${Math.max(visibleWidth - rect.width, Math.min(x, window.innerWidth - visibleWidth))}px`;
    panel.style.top = `${Math.max(visibleHeight - header.height, Math.min(y, window.innerHeight - visibleHeight))}px`;
  }
  function endDrag() {
    if (drag && handle.hasPointerCapture(drag.id)) handle.releasePointerCapture(drag.id);
    drag = null;
    handle.classList.remove('dragging');
  }
  function hide() {
    endDrag();
    const focused = panel.contains(document.activeElement);
    panel.hidden = true;
    if (focused) {
      const target = returnFocus && !returnFocus.disabled && !panel.contains(returnFocus) ? returnFocus : open;
      if (!target.disabled) target.focus({ preventScroll:true });
    }
  }
  function show() {
    if (!panel.hidden) { handle.focus({ preventScroll:true }); return; }
    returnFocus = document.activeElement;
    panel.hidden = false;
    open.disabled = false;
    const rect = panel.getBoundingClientRect();
    move(positioned ? rect.left : (window.innerWidth - rect.width) / 2,
      positioned ? rect.top : Math.min(80, (window.innerHeight - rect.height) / 2));
    positioned = true;
    handle.focus({ preventScroll:true });
  }
  handle.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('button')) return;
    const rect = panel.getBoundingClientRect();
    drag = { id:e.pointerId, x:e.clientX - rect.left, y:e.clientY - rect.top };
    handle.setPointerCapture(e.pointerId);
    handle.classList.add('dragging');
    handle.focus({ preventScroll:true });
    e.preventDefault();
  });
  handle.addEventListener('pointermove', e => {
    if (drag && e.pointerId === drag.id) move(e.clientX - drag.x, e.clientY - drag.y);
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => handle.addEventListener(type, endDrag));
  handle.addEventListener('keydown', e => {
    if (e.target !== handle) return;
    const direction = { ArrowLeft:[-1,0], ArrowRight:[1,0], ArrowUp:[0,-1], ArrowDown:[0,1] }[e.key];
    if (!direction) return;
    e.preventDefault();
    const rect = panel.getBoundingClientRect(), step = e.shiftKey ? 40 : 10;
    move(rect.left + direction[0] * step, rect.top + direction[1] * step);
  });
  panel.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); hide(); } });
  window.addEventListener('resize', () => {
    if (!panel.hidden) { const rect = panel.getBoundingClientRect(); move(rect.left, rect.top); }
  });
  close.addEventListener('click', hide);
  open.addEventListener('click', show);
  window.OptimizerDialog = { show, reset() { hide(); open.disabled = true; } };
})();
