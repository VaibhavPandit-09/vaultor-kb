let ticket = '',
  zoom = 1,
  baseW = 0,
  baseH = 0,
  fit = 1,
  timer,
  swipe,
  drag,
  points = new Map(),
  pinch;
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
    ticket = m.ticket;
    zoom = Math.max(1, Math.min(4, Number(m.zoom) || 1));
    baseW = m.width;
    baseH = m.height;
    fit = Math.min(
      viewport.clientWidth / baseW,
      viewport.clientHeight / baseH,
      1,
    );
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
  } else if (m.type === 'zoom') {
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
    position();
  } else if (m.type === 'flush') position();
};
img.addEventListener('pointerdown', e => {
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
  zoom = zoom > 1 ? 1 : 2;
  size();
  position();
});
window.addEventListener('resize', () => {
  fit = Math.min(
    viewport.clientWidth / baseW,
    viewport.clientHeight / baseH,
    1,
  );
  size();
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
