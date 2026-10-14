// Stored JSON is untrusted. Build DOM nodes only; never interpret stored HTML/CSS/URLs.
export function renderDocument(doc, root, send, image) {
  let budget = 20000;
  const headings = [];
  const safeUrl = v => {
    try {
      if (
        typeof v !== 'string' ||
        v.length > 2048 ||
        /[\s\u0000-\u001f]/.test(v)
      )
        return;
      const u = new URL(v);
      if (
        ['https:', 'http:'].includes(u.protocol) &&
        !u.username &&
        !u.password &&
        u.hostname
      )
        return u.href;
    } catch {}
  };
  const el = (tag, text) => {
    const n = root.ownerDocument.createElement(tag);
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const id = v => typeof v === 'string' && /^[a-f0-9-]{36}$/i.test(v);
  function render(n, depth = 0, path = '') {
    if (!n || typeof n !== 'object' || depth > 64 || --budget < 0)
      return el(
        'p',
        'Content too complex to display. Original document is retained.',
      );
    if (typeof n.type !== 'string')
      return el('aside', 'Unsupported block. Original content retained.');
    const a = n.attrs || {};
    if (n.type === 'text') {
      let t = root.ownerDocument.createTextNode(
        typeof n.text === 'string' ? n.text : '',
      );
      for (const m of Array.isArray(n.marks) ? n.marks.slice(0, 32) : []) {
        if (!m || typeof m !== 'object' || typeof m.type !== 'string') continue;
        const tags = {
          bold: 'strong',
          italic: 'em',
          strike: 's',
          code: 'code',
          underline: 'u',
          highlight: 'mark',
          superscript: 'sup',
          subscript: 'sub',
        };
        if (Object.hasOwn(tags, m.type)) {
          const w = el(tags[m.type]);
          w.append(t);
          t = w;
        } else if (m.type === 'link') {
          const url = safeUrl(m.attrs?.href),
            w = el(url ? 'a' : 'span');
          w.append(t);
          if (url) {
            w.href = url;
            w.onclick = e => {
              e.preventDefault();
              send({ type: 'external', url });
            };
            w.setAttribute('aria-label', w.textContent + ' · External link');
          }
          t = w;
        }
      }
      return t;
    }
    if (n.type === 'resourceLink') {
      const b = el('a', String(a.label || a.title || 'Linked resource'));
      b.dataset.path = path;
      b.className = 'resource';
      if (id(a.resourceId)) {
        b.href = '#resource';
        b.dataset.resourceId = a.resourceId;
        b.onclick = e => {
          e.preventDefault();
          send({ type: 'open', resourceId: a.resourceId });
        };
        b.setAttribute('aria-label', b.textContent + ' · Linked resource');
      } else {
        b.removeAttribute('href');
        b.setAttribute('aria-disabled', 'true');
      }
      return b;
    }
    if (n.type === 'image') {
      const figure = el('figure'),
        b = el('button', 'Load image'),
        caption = el('figcaption', String(a.caption || ''));
      figure.dataset.path = path;
      figure.style.width =
        Math.max(20, Math.min(100, Number(a.width ?? a.widthPercent) || 100)) +
        '%';
      figure.style.marginLeft =
        a.alignment === 'right'
          ? 'auto'
          : a.alignment === 'center'
          ? 'auto'
          : '0';
      figure.style.marginRight = a.alignment === 'center' ? 'auto' : '0';
      if (id(a.resourceId)) {
        b.dataset.resourceId = a.resourceId;
        b.setAttribute(
          'aria-label',
          'Preview ' + String(a.alt || a.caption || 'image'),
        );
        b.onclick = () => send({ type: 'open', resourceId: a.resourceId });
        image(a.resourceId, b, String(a.alt || 'Image'));
      } else b.disabled = true;
      figure.append(b, caption);
      return figure;
    }
    const tags = {
      doc: 'article',
      paragraph: 'p',
      heading: 'h' + Math.max(1, Math.min(6, Number(a.level) || 1)),
      bulletList: 'ul',
      orderedList: 'ol',
      listItem: 'li',
      taskList: 'ul',
      taskItem: 'li',
      blockquote: 'blockquote',
      codeBlock: 'pre',
      horizontalRule: 'hr',
      hardBreak: 'br',
      table: 'table',
      tableRow: 'tr',
      tableHeader: 'th',
      tableCell: 'td',
    };
    const tag = Object.hasOwn(tags, n.type) ? tags[n.type] : null;
    if (!tag)
      return el(
        'aside',
        'Unsupported ' +
          String(n.type || 'block') +
          '. Original content retained.',
      );
    const out = el(tag);
    if (path) out.dataset.path = path;
    if (n.type === 'taskList') out.className = 'tasks';
    if (n.type === 'taskItem') {
      out.className = 'task';
      const check = el('span', a.checked ? '✓' : '○');
      check.className = 'task-check';
      check.setAttribute('role', 'img');
      check.setAttribute(
        'aria-label',
        a.checked ? 'Completed task' : 'Unchecked task',
      );
      out.append(check);
    }
    if (n.type === 'orderedList' && Number.isInteger(a.start))
      out.start = a.start;
    if (
      n.type === 'paragraph' &&
      ['left', 'center', 'right', 'justify'].includes(a.textAlign)
    )
      out.style.textAlign = a.textAlign;
    let i = 0;
    for (const c of Array.isArray(n.content) ? n.content : []) {
      if (budget <= 0) {
        out.append(
          el('aside', 'Reading limit reached. Original document retained.'),
        );
        break;
      }
      out.append(render(c, depth + 1, path + '/' + i++));
    }
    if (n.type === 'heading' && headings.length < 256) {
      const key = 'heading-' + headings.length;
      out.id = key;
      out.tabIndex = -1;
      headings.push({
        id: key,
        title: out.textContent.slice(0, 160) || 'Untitled heading',
        level: Number(a.level) || 1,
      });
    }
    if (n.type === 'table' || n.type === 'codeBlock') {
      const wrap = el('div');
      wrap.className = 'overflow';
      wrap.append(out);
      return wrap;
    }
    return out;
  }
  root.replaceChildren(render(doc));
  return { headings };
}
