import { Editor, Node, Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { closeHistory } from '@tiptap/pm/history';
import StarterKit from '@tiptap/starter-kit';
import {
  Table,
  TableRow,
  TableCell,
  TableHeader,
} from '@tiptap/extension-table';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Highlight from '@tiptap/extension-highlight';
import CodeBlock from '@tiptap/extension-code-block-lowlight';
import { all, createLowlight } from 'lowlight';
const send = value =>
  window.ReactNativeWebView.postMessage(
    JSON.stringify({ protocol: 1, ...value }),
  );
const ResourceLink = Node.create({
  name: 'resourceLink',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes: () => ({
    resourceId: { default: null },
    label: { default: null },
    type: { default: 'note' },
  }),
  renderHTML: ({ node }) => [
    'span',
    {
      class: 'resource-link',
      'data-resource-id': node.attrs.resourceId,
      role: 'button',
      tabindex: '0',
      'aria-label': 'Open ' + (node.attrs.label || 'linked resource'),
      contenteditable: 'false',
    },
    node.attrs.label || 'Linked resource',
  ],
});
const anchors = new PluginKey('mediaAnchors');
const MediaAnchors = Extension.create({
  name: 'mediaAnchors',
  addProseMirrorPlugins: () => [
    new Plugin({
      key: anchors,
      state: {
        init: () => new Map(),
        apply(tr, previous) {
          const next = new Map();
          for (const [id, pos] of previous) {
            const mapped = tr.mapping.mapResult(pos, 1);
            if (!mapped.deleted) next.set(id, mapped.pos);
          }
          const add = tr.getMeta(anchors);
          if (add) next.set(add.id, add.pos);
          return next;
        },
      },
    }),
  ],
});
const views = new Map();
const inserted = new Set();
const Image = Node.create({
  name: 'image',
  group: 'block',
  atom: true,
  addAttributes: () => ({
    resourceId: { default: null },
    alt: { default: '' },
    caption: { default: '' },
    width: { default: 100 },
    alignment: { default: 'center' },
  }),
  renderHTML: ({ node }) => [
    'figure',
    { class: 'image-placement', contenteditable: 'false' },
    ['div', {}, node.attrs.alt || 'Image'],
    ['figcaption', {}, node.attrs.caption || ''],
  ],
  addNodeView:
    () =>
    ({ node, getPos, editor: e }) => {
      const dom = document.createElement('figure');
      dom.className = 'image-placement';
      dom.contentEditable = 'false';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'image-frame';
      button.setAttribute('aria-label', 'Image tools');
      const img = document.createElement('img');
      img.alt = node.attrs.alt || 'Image';
      const status = document.createElement('span');
      status.textContent = 'Loading image…';
      button.append(img, status);
      const caption = document.createElement('figcaption');
      dom.append(button, caption);
      const token = crypto.randomUUID?.() || String(Math.random()).slice(2);
      let current = node,
        observer;
      const apply = () => {
        dom.style.width = current.attrs.width + '%';
        dom.style.marginLeft =
          current.attrs.alignment === 'left' ? '0' : 'auto';
        dom.style.marginRight =
          current.attrs.alignment === 'right' ? '0' : 'auto';
        caption.textContent = current.attrs.caption;
        img.alt = current.attrs.alt || 'Image';
        button.setAttribute(
          'aria-label',
          'Image tools: ' +
            (current.attrs.alt || current.attrs.caption || 'image'),
        );
      };
      apply();
      const fetch = () => {
        if (!loading && !blocked)
          send({
            type: 'mediaThumbnail',
            loadId,
            resourceId: current.attrs.resourceId,
            token,
          });
      };
      button.onclick = () => {
        const pos = getPos();
        if (typeof pos !== 'number') return;
        const anchor = crypto.randomUUID?.() || String(Math.random()).slice(2);
        e.view.dispatch(
          e.state.tr
            .setMeta(anchors, { id: anchor, pos })
            .setMeta('addToHistory', false),
        );
        send({ type: 'mediaSelect', loadId, anchor, attrs: current.attrs });
      };
      img.onerror = () => {
        img.removeAttribute('src');
        status.textContent = 'Image unavailable · open tools to Retry/Replace';
        status.hidden = false;
      };
      views.set(token, {
        ready(data, resourceId) {
          if (resourceId !== current.attrs.resourceId) return;
          img.src = data;
          status.hidden = true;
        },
        fail(resourceId) {
          if (resourceId !== current.attrs.resourceId) return;
          status.textContent =
            'Image unavailable · open tools to Retry/Replace';
          status.hidden = false;
        },
        fetch,
      });
      if (typeof IntersectionObserver !== 'undefined') {
        observer = new IntersectionObserver(
          entries => {
            if (entries.some(v => v.isIntersecting)) {
              fetch();
              observer.disconnect();
            }
          },
          { rootMargin: '240px' },
        );
        observer.observe(dom);
      } else setTimeout(fetch, 0);
      return {
        dom,
        ignoreMutation: () => true,
        update(next) {
          if (next.type.name !== 'image') return false;
          const changed = next.attrs.resourceId !== current.attrs.resourceId;
          current = next;
          apply();
          if (changed) {
            img.removeAttribute('src');
            status.textContent = 'Loading image…';
            status.hidden = false;
            fetch();
          }
          return true;
        },
        destroy() {
          observer?.disconnect();
          views.delete(token);
        },
      };
    },
});
const WorkspaceTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...Object.fromEntries(
        [
          'tableId',
          'columnIds',
          'sourceResourceId',
          'sourceResourceTitle',
          'sourceResourceType',
        ].map(k => [k, { default: null }]),
      ),
    };
  },
});
let loadId = '',
  loading = true,
  blocked = false;
const editor = new Editor({
  element: document.querySelector('#editor'),
  extensions: [
    StarterKit.configure({ codeBlock: false, trailingNode: false }),
    CodeBlock.configure({ lowlight: createLowlight(all) }),
    WorkspaceTable,
    TableRow,
    TableCell,
    TableHeader,
    TaskList,
    TaskItem.configure({ nested: true }),
    Highlight.configure({ multicolor: true }),
    ResourceLink,
    Image,
    MediaAnchors,
  ],
  enableContentCheck: true,
  content: { type: 'doc', content: [{ type: 'paragraph' }] },
  onContentError: () => {
    blocked = true;
    send({ type: 'unsupported', loadId });
  },
  onUpdate: ({ editor: e }) => {
    if (!loading && !blocked)
      send({ type: 'changed', loadId, content: e.getJSON() });
  },
});
function openLink(event) {
  const link = event.target.closest?.('.resource-link');
  if (!link || loading || blocked) return;
  if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
  const resourceId = link.dataset.resourceId;
  if (!/^[a-f0-9-]{36}$/i.test(resourceId ?? '')) return;
  event.preventDefault();
  event.stopPropagation();
  send({ type: 'open', loadId, resourceId });
}
// Capture before ProseMirror's Enter handling: activating an atom is navigation,
// never a newline or document transaction.
document.querySelector('#editor').addEventListener('click', openLink, true);
document.querySelector('#editor').addEventListener('keydown', openLink, true);
let positionTimer;
function reading() {
  if (loading || blocked || positionTimer) return;
  positionTimer = setTimeout(() => {
    positionTimer = undefined;
    if (!loading && !blocked)
      send({
        type: 'position',
        loadId,
        position: {
          anchor: editor.state.selection.anchor,
          head: editor.state.selection.head,
          scroll: window.scrollY,
        },
      });
  }, 500);
}
editor.on('selectionUpdate', reading);
editor.view.dom.addEventListener(
  'paste',
  event => {
    const data = event.clipboardData;
    if (
      !loading &&
      !blocked &&
      editor.isEditable &&
      data &&
      [...data.items].some(v => v.type.startsWith('image/'))
    ) {
      event.preventDefault();
      const anchor = crypto.randomUUID();
      editor.view.dispatch(
        editor.state.tr
          .setMeta(anchors, { id: anchor, pos: editor.state.selection.from })
          .setMeta('addToHistory', false),
      );
      const text = data.getData('text/plain');
      if (text) editor.view.dispatch(editor.state.tr.insertText(text));
      send({ type: 'mediaPick', loadId, anchor, kind: 'clipboard' });
    }
  },
  true,
);
editor.view.dom.addEventListener(
  'keydown',
  event => {
    if (
      event.key === 'Enter' &&
      !event.isComposing &&
      editor.isEditable &&
      editor.state.selection.$from.parent.textContent === '/image'
    ) {
      event.preventDefault();
      event.stopPropagation();
      const from = editor.state.selection.$from.start();
      editor.view.dispatch(editor.state.tr.delete(from, from + 6));
      const anchor = crypto.randomUUID();
      editor.view.dispatch(
        editor.state.tr
          .setMeta(anchors, { id: anchor, pos: from })
          .setMeta('addToHistory', false),
      );
      send({ type: 'mediaPick', loadId, anchor, kind: 'photos' });
    }
  },
  true,
);
window.addEventListener('scroll', reading, { passive: true });
function validate(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 80)
    throw Error('Unsupported document');
  const type = editor.schema.nodes[node.type];
  if (!type) throw Error('Unknown node');
  for (const key of Object.keys(node.attrs || {}))
    if (!Object.hasOwn(type.spec.attrs || {}, key))
      throw Error('Unknown attribute');
  for (const mark of node.marks || []) {
    const mt = editor.schema.marks[mark.type];
    if (!mt) throw Error('Unknown mark');
    for (const key of Object.keys(mark.attrs || {}))
      if (!Object.hasOwn(mt.spec.attrs || {}, key))
        throw Error('Unknown mark attribute');
  }
  for (const child of node.content || []) validate(child, depth + 1);
}
function theme(value) {
  document.documentElement.dataset.theme = value === 'light' ? 'light' : 'dark';
}
window.vaultorReceive = raw => {
  try {
    if (typeof raw !== 'string' || raw.length > 1500000) return;
    const m = JSON.parse(raw);
    if (m.protocol !== 1) return;
    if (m.type === 'load') {
      loading = true;
      blocked = false;
      loadId = m.loadId;
      inserted.clear();
      validate(m.content);
      editor.schema.nodeFromJSON(m.content).check();
      editor.commands.setContent(m.content, {
        emitUpdate: false,
        errorOnInvalidContent: true,
      });
      theme(m.theme);
      editor.setEditable(m.editable !== false, false);
      if (m.position) {
        const max = editor.state.doc.content.size;
        editor.commands.setTextSelection({
          from: Math.max(0, Math.min(max, m.position.anchor || 0)),
          to: Math.max(0, Math.min(max, m.position.head || 0)),
        });
        requestAnimationFrame(() =>
          window.scrollTo(0, Math.max(0, m.position.scroll || 0)),
        );
      }
      loading = false;
      send({ type: 'loaded', loadId, content: editor.getJSON() });
    } else if (m.type === 'mediaThumbnail' && m.loadId === loadId) {
      const view = views.get(m.token);
      if (
        m.data &&
        /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(m.data) &&
        m.data.length < 530000
      )
        view?.ready(m.data, m.resourceId);
      else view?.fail(m.resourceId);
    } else if (m.type === 'mediaRetry' && m.loadId === loadId) {
      for (const view of views.values()) view.fetch();
    } else if (
      m.type === 'mediaAnchor' &&
      !blocked &&
      editor.isEditable &&
      m.loadId === loadId
    ) {
      editor.view.dispatch(
        editor.state.tr
          .setMeta(anchors, { id: m.anchor, pos: editor.state.selection.from })
          .setMeta('addToHistory', false),
      );
      send({ type: 'mediaAnchored', loadId, anchor: m.anchor });
    } else if (
      m.type === 'mediaInsert' &&
      !blocked &&
      editor.isEditable &&
      m.loadId === loadId
    ) {
      const pos = anchors.getState(editor.state).get(m.anchor);
      if (inserted.has(m.inputId)) {
        send({
          type: 'mediaInserted',
          loadId,
          inputId: m.inputId,
          valid: true,
        });
        return;
      }
      if (typeof pos !== 'number') {
        send({
          type: 'mediaInserted',
          loadId,
          inputId: m.inputId,
          valid: false,
        });
        return;
      }
      let node;
      if (typeof m.text === 'string') node = editor.schema.text(m.text);
      else if (/^[a-f0-9-]{36}$/i.test(m.resourceId || ''))
        node = m.image
          ? editor.schema.nodes.image.create({
              resourceId: m.resourceId,
              alt: '',
              caption: '',
              width: 100,
              alignment: 'center',
            })
          : editor.schema.nodes.resourceLink.create({
              resourceId: m.resourceId,
              label: m.title,
              type: 'file',
            });
      else return;
      const tr = closeHistory(editor.state.tr).replaceRangeWith(pos, pos, node);
      editor.view.dispatch(tr);
      inserted.add(m.inputId);
      send({ type: 'mediaInserted', loadId, inputId: m.inputId, valid: true });
    } else if (
      m.type === 'mediaEdit' &&
      !blocked &&
      editor.isEditable &&
      m.loadId === loadId
    ) {
      const pos = anchors.getState(editor.state).get(m.anchor),
        node = typeof pos === 'number' ? editor.state.doc.nodeAt(pos) : null;
      if (node?.type.name !== 'image') {
        if (m.inputId)
          send({
            type: 'mediaInserted',
            loadId,
            inputId: m.inputId,
            valid: false,
          });
        return;
      }
      if (m.remove)
        editor.view.dispatch(
          closeHistory(editor.state.tr).delete(pos, pos + node.nodeSize),
        );
      else {
        const a = m.attrs;
        if (
          !a ||
          !/^[a-f0-9-]{36}$/i.test(a.resourceId) ||
          !['left', 'center', 'right'].includes(a.alignment) ||
          !Number.isInteger(a.width) ||
          a.width < 20 ||
          a.width > 100 ||
          typeof a.alt !== 'string' ||
          typeof a.caption !== 'string'
        )
          return;
        editor.view.dispatch(
          closeHistory(editor.state.tr).setNodeMarkup(pos, undefined, {
            resourceId: a.resourceId,
            alt: a.alt.slice(0, 2000),
            caption: a.caption.slice(0, 4000),
            width: a.width,
            alignment: a.alignment,
          }),
        );
      }
      if (m.inputId)
        send({
          type: 'mediaInserted',
          loadId,
          inputId: m.inputId,
          valid: true,
        });
    } else if (m.type === 'theme') {
      theme(m.value);
    } else if (m.type === 'editable' && !blocked) {
      editor.setEditable(m.value === true, false);
      if (m.value === true && m.focus === true)
        editor.commands.focus(undefined, { scrollIntoView: false });
    } else if (m.type === 'blur') {
      editor.commands.blur();
    } else if (m.type === 'command' && !blocked && editor.isEditable) {
      const commands = {
        bold: () =>
          editor
            .chain()
            .focus(undefined, { scrollIntoView: false })
            .toggleBold()
            .run(),
        italic: () =>
          editor
            .chain()
            .focus(undefined, { scrollIntoView: false })
            .toggleItalic()
            .run(),
        heading: () =>
          editor
            .chain()
            .focus(undefined, { scrollIntoView: false })
            .toggleHeading({ level: 2 })
            .run(),
        bullet: () =>
          editor
            .chain()
            .focus(undefined, { scrollIntoView: false })
            .toggleBulletList()
            .run(),
        ordered: () =>
          editor
            .chain()
            .focus(undefined, { scrollIntoView: false })
            .toggleOrderedList()
            .run(),
        quote: () =>
          editor
            .chain()
            .focus(undefined, { scrollIntoView: false })
            .toggleBlockquote()
            .run(),
        code: () =>
          editor
            .chain()
            .focus(undefined, { scrollIntoView: false })
            .toggleCodeBlock()
            .run(),
        undo: () =>
          editor
            .chain()
            .focus(undefined, { scrollIntoView: false })
            .undo()
            .run(),
        redo: () =>
          editor
            .chain()
            .focus(undefined, { scrollIntoView: false })
            .redo()
            .run(),
      };
      commands[m.name]?.();
    }
  } catch {
    blocked = true;
    editor.setEditable(false, false);
    send({ type: 'unsupported', loadId });
  }
};
editor.setEditable(false, false);
send({ type: 'ready' });
