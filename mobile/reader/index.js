import { renderDocument } from './render.js';
let loadId = '',
  sequence = 0,
  restoring = false,
  restoreVersion = 0,
  positionTimer,
  ranges = [],
  current = -1;
const observers = [],
  root = document.getElementById('document'),
  images = new Map();
const send = m => {
  if (m.type === 'open' || m.type === 'external') reportPosition();
  window.ReactNativeWebView?.postMessage(
    JSON.stringify({ protocol: 1, loadId, ...m }),
  );
};
function preferences(m) {
  const html = document.documentElement;
  html.dataset.theme = ['light', 'dark', 'oled'].includes(m.theme)
    ? m.theme
    : 'dark';
  html.style.setProperty(
    '--size',
    Math.max(14, Math.min(28, Number(m.size) || 18)) + 'px',
  );
  html.style.setProperty(
    '--spacing',
    Math.max(1.4, Math.min(2.2, Number(m.spacing) || 1.75)),
  );
  html.style.setProperty(
    '--measure',
    Math.max(320, Math.min(800, Number(m.measure) || 660)) + 'px',
  );
  if (/^#[a-f0-9]{6}$/i.test(m.accent || ''))
    html.style.setProperty('--accent', m.accent);
  html.dataset.motion =
    m.reduced || m.motion === 'snappy' ? 'snappy' : 'smooth';
}
function reportPosition() {
  const blocks = [
    ...root.querySelectorAll('p,h1,h2,h3,h4,h5,h6,figure,pre,table'),
  ].filter(n => n.dataset.path);
  const block =
    blocks.find(n => {
      const r = n.getBoundingClientRect();
      return r.top <= 32 && r.bottom > 32;
    }) || blocks.find(n => n.getBoundingClientRect().top >= 0);
  send({
    type: 'position',
    scroll: window.scrollY,
    path: block?.dataset.path,
    offset: block ? -block.getBoundingClientRect().top : 0,
    revision: root.dataset.revision,
  });
}
function goTo(top) {
  window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
  reportPosition();
}
function showMatch(index) {
  if (!ranges.length) {
    current = -1;
    send({ type: 'findResult', count: 0, current: 0 });
    return;
  }
  current = (index + ranges.length) % ranges.length;
  if (globalThis.CSS?.highlights && globalThis.Highlight) {
    CSS.highlights.set('matches', new Highlight(...ranges));
    CSS.highlights.set('current', new Highlight(ranges[current]));
  }
  const rect = ranges[current].getBoundingClientRect();
  goTo(window.scrollY + rect.top - 100);
  send({
    type: 'findResult',
    count: ranges.length,
    current: current + 1,
    limited: ranges.length === 500,
  });
}
function find(text) {
  const query = typeof text === 'string' ? text.slice(0, 200) : '';
  ranges = [];
  current = -1;
  if (globalThis.CSS?.highlights) {
    CSS.highlights.delete('matches');
    CSS.highlights.delete('current');
  }
  if (!query.trim()) {
    send({ type: 'findResult', count: 0, current: 0 });
    return;
  }
  for (const block of root.querySelectorAll(
    'p,h1,h2,h3,h4,h5,h6,pre,figcaption,aside',
  )) {
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT),
      nodes = [];
    let value = '',
      n;
    while ((n = walker.nextNode())) {
      nodes.push({ node: n, start: value.length });
      value += n.textContent;
    }
    const escaped = Array.from(query)
      .map(c => (/[a-z0-9 ]/i.test(c) ? c : '\\' + c))
      .join('');
    const re = new RegExp(escaped, 'gi');
    let match;
    while (ranges.length < 500 && (match = re.exec(value))) {
      const at = match.index,
        end = at + match[0].length,
        first = nodes.findLast(v => v.start <= at),
        last = nodes.findLast(v => v.start < end);
      if (first && last) {
        const r = document.createRange();
        r.setStart(first.node, at - first.start);
        r.setEnd(last.node, end - last.start);
        ranges.push(r);
      }
    }
    if (ranges.length >= 500) break;
  }
  showMatch(0);
}
window.vaultorReceive = raw => {
  let m;
  try {
    m = JSON.parse(raw);
  } catch {
    return;
  }
  if (m.type === 'load') {
    clearTimeout(positionTimer);
    observers.splice(0).forEach(o => o.disconnect());
    loadId = m.loadId;
    images.clear();
    preferences(m);
    restoring = true;
    const newVisit = root.dataset.noteId !== m.noteId;
    root.dataset.noteId = m.noteId || '';
    root.dataset.revision = m.revision || '';
    const meta = renderDocument(
      m.content,
      root,
      send,
      (resourceId, button, alt) => {
        const token = String(++sequence);
        images.set(token, { button, resourceId, alt });
        const observer = new IntersectionObserver(
          entries => {
            if (entries.some(e => e.isIntersecting)) {
              observer.disconnect();
              send({ type: 'thumbnail', token, resourceId });
            }
          },
          { rootMargin: '300px' },
        );
        observers.push(observer);
        observer.observe(button);
      },
    );
    if (newVisit && m.motion === 'smooth' && !m.reduced) {
      const article = root.firstElementChild;
      article?.classList.add('enter');
      setTimeout(() => article?.classList.remove('enter'), 220);
    }
    let attempts = 0;
    const ticket = loadId,
      restoreTicket = ++restoreVersion,
      desired = Math.max(0, Math.min(10000000, Number(m.scroll) || 0));
    const restore = () => {
      if (ticket !== loadId || restoreTicket !== restoreVersion) return;
      const anchor =
        m.position?.revision === m.revision
          ? [...root.querySelectorAll('[data-path]')].find(
              n => n.dataset.path === m.position.path,
            )
          : undefined;
      window.scrollTo(
        0,
        anchor
          ? window.scrollY +
              anchor.getBoundingClientRect().top +
              (Number(m.position.offset) || 0)
          : desired,
      );
      if (++attempts < 4) requestAnimationFrame(restore);
      else {
        restoring = false;
        send({ type: 'loaded', ...meta });
      }
    };
    requestAnimationFrame(restore);
    find('');
  } else if (m.type === 'preferences') {
    preferences(m);
  } else if (m.loadId === loadId) {
    if (m.type === 'restore') {
      restoring = true;
      const ticket = loadId,
        restoreTicket = ++restoreVersion;
      let attempts = 0;
      const restore = () => {
        if (ticket !== loadId || restoreTicket !== restoreVersion) return;
        const p = m.position,
          anchor =
            p?.revision === root.dataset.revision
              ? [...root.querySelectorAll('[data-path]')].find(
                  n => n.dataset.path === p.path,
                )
              : undefined;
        window.scrollTo(
          0,
          anchor
            ? window.scrollY +
                anchor.getBoundingClientRect().top +
                (Number(p.offset) || 0)
            : Math.max(0, Number(p?.scroll) || 0),
        );
        if (++attempts < 4) requestAnimationFrame(restore);
        else restoring = false;
      };
      requestAnimationFrame(restore);
    } else if (m.type === 'thumbnail') {
      const item = images.get(m.token);
      if (!item) return;
      images.delete(m.token);
      if (
        typeof m.data === 'string' &&
        m.data.startsWith('data:image/png;base64,')
      ) {
        const img = document.createElement('img');
        img.alt = item.alt;
        img.src = m.data;
        item.button.replaceChildren(img);
      } else
        item.button.textContent = 'Image unavailable · Tap to retry or open';
    } else if (m.type === 'heading') {
      const h = document.getElementById(m.id);
      if (h && /^heading-\d+$/.test(m.id)) {
        goTo(window.scrollY + h.getBoundingClientRect().top - 24);
        h.focus({ preventScroll: true });
      }
    } else if (m.type === 'find') find(m.query);
    else if (m.type === 'findStep') showMatch(current + (m.delta < 0 ? -1 : 1));
    else if (m.type === 'flush') reportPosition();
    else if (m.type === 'focus') {
      root.setAttribute('tabindex', '-1');
      root.focus({ preventScroll: true });
    } else if (
      m.type === 'occurrence' &&
      m.revision === root.dataset.revision &&
      /^\/\d+(?:\/\d+)*$/.test(m.path)
    ) {
      const node = [...root.querySelectorAll('[data-path]')].find(
        n => n.dataset.path === m.path,
      );
      if (node && node.dataset.resourceId === m.targetId)
        goTo(window.scrollY + node.getBoundingClientRect().top - 24);
    }
  }
};
window.addEventListener(
  'scroll',
  () => {
    if (restoring) return;
    clearTimeout(positionTimer);
    const ticket = loadId;
    positionTimer = setTimeout(() => {
      if (ticket === loadId) reportPosition();
    }, 100);
  },
  { passive: true },
);
document.addEventListener('visibilitychange', () => {
  if (document.hidden && !restoring) reportPosition();
});
for (const event of ['pointerdown', 'wheel', 'touchstart'])
  window.addEventListener(
    event,
    () => {
      restoreVersion++;
      restoring = false;
    },
    { passive: true },
  );
send({ type: 'ready' });
