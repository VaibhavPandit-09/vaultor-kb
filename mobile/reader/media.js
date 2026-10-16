let ticket = '',
  zoom = 1,
  baseW = 0,
  baseH = 0,
  fit = 1,
  timer,
  swipe,
  drag,
  points = new Map(),
  pinch,
  motion,
  motionVersion = 0,
  viewportWidth = 0,
  viewportHeight = 0;
const img = document.getElementById('image'),
  canvas = document.getElementById('canvas'),
  viewport = document.getElementById('viewport');
const send = m =>
  window.ReactNativeWebView?.postMessage(JSON.stringify({ ticket, ...m }));
function size() {
  const w = baseW * fit * zoom,
    h = baseH * fit * zoom;
  img.style.width = w + 'px';
  img.style.height = h + 'px';
  canvas.style.width = Math.max(viewport.clientWidth, w) + 'px';
  canvas.style.height = Math.max(viewport.clientHeight, h) + 'px';
}
function cancelMotion() {
  motionVersion++;
  motion?.cancel();
  motion = undefined;
}
function position() {
  send({
    type: 'position',
    zoom,
    x: viewport.scrollLeft,
    y: viewport.scrollTop,
  });
}
window.vaultorMediaReceive = raw => {
  let m;
  try {
    m = JSON.parse(raw);
  } catch {
    return;
  }
  if (m.type === 'load') {
    cancelMotion();
    ticket = m.ticket;
    zoom = Math.max(1, Math.min(4, Number(m.zoom) || 1));
    baseW = m.width;
    baseH = m.height;
    fit = Math.min(
      viewport.clientWidth / baseW,
      viewport.clientHeight / baseH,
      1,
    );
    viewportWidth = viewport.clientWidth;
    viewportHeight = viewport.clientHeight;
    img.alt = m.title || 'Resource preview';
    img.tabIndex = 0;
    img.onload = () => {
      size();
      requestAnimationFrame(() => {
        viewport.scrollTo(m.x || 0, m.y || 0);
        send({ type: 'loaded' });
      });
    };
    img.onerror = () => send({ type: 'error' });
    if (typeof m.uri === 'string' && m.uri.startsWith('file:///data/'))
      img.src = m.uri;
  } else if (m.type === 'cancel') {
    cancelMotion();
  } else if (m.type === 'zoom') {
    const before = img.getBoundingClientRect();
    cancelMotion();
    const version = motionVersion,
      source = ticket;
    const old = zoom;
    zoom = m.actual
      ? Math.max(1, Math.min(4, 1 / fit))
      : Math.max(1, Math.min(4, m.zoom));
    size();
    viewport.scrollTo(
      ((viewport.scrollLeft + viewport.clientWidth / 2) * zoom) / old -
        viewport.clientWidth / 2,
      ((viewport.scrollTop + viewport.clientHeight / 2) * zoom) / old -
        viewport.clientHeight / 2,
    );
    const after = img.getBoundingClientRect();
    const duration = Math.max(0, Math.min(380, Number(m.duration) || 0));
    const settle = () =>
      requestAnimationFrame(() => {
        if (version !== motionVersion || source !== ticket) return;
        position();
        send({
          type: 'settled',
          command: m.command,
          feedback: m.feedback === true,
        });
      });
    if (
      duration &&
      typeof img.animate === 'function' &&
      before.width > 0 &&
      after.width > 0 &&
      after.height > 0
    ) {
      motion = img.animate(
        [
          {
            transform: `translate(${before.left - after.left}px,${
              before.top - after.top
            }px) scale(${before.width / after.width},${
              before.height / after.height
            })`,
            transformOrigin: 'top left',
          },
          { transform: 'none', transformOrigin: 'top left' },
        ],
        { duration, easing: 'cubic-bezier(.2,0,0,1)' },
      );
      motion.finished.then(settle).catch(() => {});
    } else settle();
    position();
  } else if (m.type === 'flush') position();
};
img.addEventListener('pointerdown', e => {
  cancelMotion();
  img.setPointerCapture(e.pointerId);
  points.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (points.size === 2) {
    const p = [...points.values()];
    pinch = { distance: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), zoom };
  } else {
    swipe = { x: e.clientX, y: e.clientY, at: Date.now() };
    drag = {
      x: e.clientX,
      y: e.clientY,
      sx: viewport.scrollLeft,
      sy: viewport.scrollTop,
    };
  }
});
img.addEventListener('pointermove', e => {
  if (!points.has(e.pointerId)) return;
  points.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (points.size === 2 && pinch) {
    const p = [...points.values()];
    zoom = Math.max(
      1,
      Math.min(
        4,
        (pinch.zoom * Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y)) /
          Math.max(1, pinch.distance),
      ),
    );
    size();
  } else if (drag && zoom > 1)
    viewport.scrollTo(
      drag.sx + drag.x - e.clientX,
      drag.sy + drag.y - e.clientY,
    );
});
function end(e) {
  points.delete(e.pointerId);
  if (
    swipe &&
    zoom === 1 &&
    !pinch &&
    Date.now() - swipe.at < 700 &&
    Math.abs(e.clientX - swipe.x) > 70 &&
    Math.abs(e.clientY - swipe.y) < 60
  )
    send({ type: 'swipe', delta: e.clientX < swipe.x ? 1 : -1 });
  if (!points.size) {
    pinch = null;
    drag = null;
    swipe = null;
    position();
  }
}
img.addEventListener('pointerup', end);
img.addEventListener('pointercancel', () => {
  points.clear();
  pinch = null;
  drag = null;
  swipe = null;
  position();
});
img.addEventListener('dblclick', () => {
  cancelMotion();
  zoom = zoom > 1 ? 1 : 2;
  size();
  position();
});
window.addEventListener('resize', () => {
  cancelMotion();
  if (!baseW || !baseH) return;
  const scale = fit * zoom;
  const cx =
    (viewport.scrollLeft +
      viewportWidth / 2 -
      Math.max(0, (viewportWidth - baseW * scale) / 2)) /
    scale;
  const cy =
    (viewport.scrollTop +
      viewportHeight / 2 -
      Math.max(0, (viewportHeight - baseH * scale) / 2)) /
    scale;
  viewportWidth = viewport.clientWidth;
  viewportHeight = viewport.clientHeight;
  fit = Math.min(
    viewport.clientWidth / baseW,
    viewport.clientHeight / baseH,
    1,
  );
  size();
  viewport.scrollTo(
    cx * fit * zoom +
      Math.max(0, (viewportWidth - baseW * fit * zoom) / 2) -
      viewportWidth / 2,
    cy * fit * zoom +
      Math.max(0, (viewportHeight - baseH * fit * zoom) / 2) -
      viewportHeight / 2,
  );
  position();
});
viewport.addEventListener(
  'scroll',
  () => {
    clearTimeout(timer);
    timer = setTimeout(position, 100);
  },
  { passive: true },
);
send({ type: 'ready' });
