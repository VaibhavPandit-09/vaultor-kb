import { Editor, Node } from '@tiptap/core';
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
    ['div', {}, node.attrs.alt || 'Image placement — preview arrives in A4'],
    ['figcaption', {}, node.attrs.caption || ''],
  ],
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
window.vaultorReceive = raw => {
  try {
    if (typeof raw !== 'string' || raw.length > 1500000) return;
    const m = JSON.parse(raw);
    if (m.protocol !== 1) return;
    if (m.type === 'load') {
      loading = true;
      blocked = false;
      loadId = m.loadId;
      validate(m.content);
      editor.schema.nodeFromJSON(m.content).check();
      editor.commands.setContent(m.content, {
        emitUpdate: false,
        errorOnInvalidContent: true,
      });
      editor.setEditable(true, false);
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
    } else if (m.type === 'editable' && !blocked) {
      editor.setEditable(m.value === true, false);
    } else if (m.type === 'blur') {
      editor.commands.blur();
    } else if (m.type === 'command' && !blocked && editor.isEditable) {
      const commands = {
        bold: () => editor.chain().focus().toggleBold().run(),
        italic: () => editor.chain().focus().toggleItalic().run(),
        undo: () => editor.chain().focus().undo().run(),
        redo: () => editor.chain().focus().redo().run(),
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
