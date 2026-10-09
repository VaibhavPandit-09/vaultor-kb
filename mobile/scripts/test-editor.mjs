import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const require = createRequire(new URL('../package.json', import.meta.url));
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="editor"></div>', {
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  url: 'https://app.local/',
});
const messages = [];
dom.window.ReactNativeWebView = {
  postMessage: r => messages.push(JSON.parse(r)),
};
dom.window.eval(
  await readFile(
    new URL('../android/app/src/main/assets/editor.js', import.meta.url),
    'utf8',
  ),
);
const text = (value, marks) => ({
  type: 'text',
  text: value,
  ...(marks ? { marks } : {}),
});
const p = (value = 'Paragraph') => ({
  type: 'paragraph',
  content: [text(value)],
});
const doc = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [text('Heading')] },
    {
      type: 'paragraph',
      content: [
        text('Marks', [
          { type: 'bold' },
          { type: 'italic' },
          { type: 'underline' },
          { type: 'strike' },
          { type: 'highlight', attrs: { color: '#ffff00' } },
        ]),
        { type: 'hardBreak' },
        text('code', [{ type: 'code' }]),
        {
          type: 'resourceLink',
          attrs: { resourceId: 'source', label: 'Linked note', type: 'note' },
        },
      ],
    },
    { type: 'bulletList', content: [{ type: 'listItem', content: [p()] }] },
    {
      type: 'orderedList',
      attrs: { start: 3 },
      content: [{ type: 'listItem', content: [p()] }],
    },
    {
      type: 'taskList',
      content: [{ type: 'taskItem', attrs: { checked: true }, content: [p()] }],
    },
    { type: 'blockquote', content: [p()] },
    { type: 'horizontalRule' },
    {
      type: 'codeBlock',
      attrs: { language: 'javascript' },
      content: [text('const x = 1;')],
    },
    {
      type: 'table',
      attrs: {
        tableId: 'table',
        columnIds: ['column'],
        sourceResourceId: 'csv',
        sourceResourceTitle: 'Imported',
        sourceResourceType: 'file',
      },
      content: [
        {
          type: 'tableRow',
          content: [
            {
              type: 'tableHeader',
              attrs: { colspan: 1, rowspan: 1, colwidth: [120] },
              content: [p('Header')],
            },
          ],
        },
        {
          type: 'tableRow',
          content: [
            {
              type: 'tableCell',
              attrs: { colspan: 1, rowspan: 1, colwidth: [120] },
              content: [p('Cell')],
            },
          ],
        },
      ],
    },
    {
      type: 'image',
      attrs: {
        resourceId: 'image',
        alt: 'Original',
        caption: 'Caption',
        width: 60,
        alignment: 'left',
      },
    },
  ],
};
const send = m =>
  dom.window.vaultorReceive(JSON.stringify({ protocol: 1, ...m }));
send({ type: 'load', loadId: 'roundtrip', content: doc });
const result = messages.findLast(m => m.type === 'loaded');
assert.ok(result, 'full schema loads');
const updatesBeforeLock = messages.filter(m => m.type === 'changed').length;
send({ type: 'editable', value: false });
send({ type: 'editable', value: true });
assert.equal(
  messages.filter(m => m.type === 'changed').length,
  updatesBeforeLock,
  'Saving locks must not create phantom edits',
);
// Every supplied attribute/content must survive; new default attributes are permitted.
function retained(original, actual) {
  for (const [key, value] of Object.entries(original)) {
    if (Array.isArray(value)) {
      assert.equal(actual[key].length, value.length);
      value.forEach((v, i) =>
        retained(
          v,
          key === 'marks'
            ? actual[key].find(m => m.type === v.type)
            : actual[key][i],
        ),
      );
    } else if (value && typeof value === 'object') {
      retained(value, actual[key]);
    } else assert.equal(actual[key], value, key);
  }
}
retained(doc, result.content);
const resourceId = '00000000-0000-4000-8000-000000000001';
send({
  type: 'load',
  loadId: 'links',
  content: {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'resourceLink',
            attrs: { resourceId, label: 'Linked note', type: 'note' },
          },
        ],
      },
    ],
  },
});
const link = dom.window.document.querySelector('.resource-link');
assert.equal(link.getAttribute('role'), 'button');
assert.equal(link.getAttribute('tabindex'), '0');
const beforeLink = messages.filter(m => m.type === 'changed').length;
link.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
assert.deepEqual(messages.at(-1), {
  protocol: 1,
  type: 'open',
  loadId: 'links',
  resourceId,
});
link.dispatchEvent(
  new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
);
assert.equal(messages.at(-1).type, 'open');
assert.equal(
  messages.filter(m => m.type === 'changed').length,
  beforeLink,
  'Link activation must not edit the document',
);
send({
  type: 'load',
  loadId: 'media',
  content: { type: 'doc', content: [p('Source text')] },
});
send({ type: 'mediaAnchor', loadId: 'media', anchor: 'ordered' });
send({
  type: 'mediaInsert',
  loadId: 'media',
  anchor: 'ordered',
  inputId: '00000000-0000-4000-8000-000000000008',
  text: 'Accompanying text ',
});
send({
  type: 'mediaInsert',
  loadId: 'media',
  anchor: 'ordered',
  inputId: '00000000-0000-4000-8000-000000000009',
  resourceId,
  image: true,
});
assert.equal(messages.at(-1).type, 'mediaInserted');
assert.equal(messages.at(-1).valid, true);
const insertedDoc = messages.findLast(m => m.type === 'changed').content;
assert.equal(
  insertedDoc.content.filter(n => n.type === 'image').length,
  1,
  'Image insertion fits the block schema',
);
const beforeRetry = messages.filter(m => m.type === 'changed').length;
send({
  type: 'mediaInsert',
  loadId: 'media',
  anchor: 'ordered',
  inputId: '00000000-0000-4000-8000-000000000009',
  resourceId,
  image: true,
});
assert.equal(
  messages.filter(m => m.type === 'changed').length,
  beforeRetry,
  'Acknowledgement retry cannot duplicate a placement',
);
dom.window.document.querySelector('.image-frame').click();
const selected = messages.at(-1);
assert.equal(selected.type, 'mediaSelect');
send({
  type: 'mediaEdit',
  loadId: 'media',
  anchor: selected.anchor,
  attrs: {
    ...selected.attrs,
    width: 40,
    caption: 'Caption',
    alt: 'Alternative',
    alignment: 'right',
  },
});
assert.equal(
  messages
    .findLast(m => m.type === 'changed')
    .content.content.find(n => n.type === 'image').attrs.width,
  40,
);
assert.equal(
  dom.window.document.querySelector('figcaption').textContent,
  'Caption',
);
send({ type: 'command', name: 'undo' });
assert.equal(
  messages
    .findLast(m => m.type === 'changed')
    .content.content.find(n => n.type === 'image').attrs.width,
  100,
  'Attribute update is one undoable transaction',
);
dom.window.document.querySelector('.image-frame').click();
const replacement = messages.at(-1);
const replacementId = '00000000-0000-4000-8000-000000000099';
send({
  type: 'mediaEdit',
  loadId: 'media',
  anchor: replacement.anchor,
  attrs: { ...replacement.attrs, resourceId: replacementId },
});
const thumbnail = messages.findLast(m => m.type === 'mediaThumbnail');
assert.equal(thumbnail.resourceId, replacementId);
send({
  type: 'mediaThumbnail',
  loadId: 'media',
  token: thumbnail.token,
  resourceId,
  data: 'data:image/png;base64,iVBORw0KGgo=',
});
assert.equal(
  dom.window.document.querySelector('.image-frame img').hasAttribute('src'),
  false,
  'A delayed thumbnail for the replaced resource cannot paint the new placement',
);
send({
  type: 'mediaThumbnail',
  loadId: 'media',
  token: thumbnail.token,
  resourceId: replacementId,
  data: 'data:image/png;base64,iVBORw0KGgo=',
});
assert.equal(
  dom.window.document.querySelector('.image-frame img').hasAttribute('src'),
  true,
);
send({ type: 'command', name: 'undo' });
send({ type: 'mediaAnchor', loadId: 'media', anchor: 'second-placement' });
send({
  type: 'mediaInsert',
  loadId: 'media',
  anchor: 'second-placement',
  inputId: '00000000-0000-4000-8000-000000000011',
  resourceId,
  image: true,
});
dom.window.document.querySelector('.image-frame').click();
const removed = messages.at(-1);
send({
  type: 'mediaEdit',
  loadId: 'media',
  anchor: removed.anchor,
  remove: true,
});
assert.equal(
  messages
    .findLast(m => m.type === 'changed')
    .content.content.filter(n => n.type === 'image').length,
  1,
  'Removing one placement retains the other placement of the same resource',
);
send({
  type: 'mediaInsert',
  loadId: 'media',
  anchor: removed.anchor,
  inputId: '00000000-0000-4000-8000-000000000010',
  resourceId,
  image: true,
});
assert.equal(
  messages.at(-1).valid,
  false,
  'A removed placement anchor cannot target another node',
);
// Reading/editing and theme changes must not reload the document or emit saves.
send({
  type: 'load',
  loadId: 'reading',
  content: doc,
  editable: false,
  theme: 'light',
});
const readMessages = messages.filter(m => m.type === 'changed').length;
assert.equal(
  dom.window.document.querySelector('.tiptap').getAttribute('contenteditable'),
  'false',
);
assert.equal(dom.window.document.documentElement.dataset.theme, 'light');
send({ type: 'command', name: 'bold' });
assert.equal(messages.filter(m => m.type === 'changed').length, readMessages);
send({ type: 'editable', value: true });
assert.equal(
  dom.window.document.querySelector('.tiptap').getAttribute('contenteditable'),
  'true',
);
send({ type: 'editable', value: false });
send({ type: 'theme', value: 'dark' });
assert.equal(dom.window.document.documentElement.dataset.theme, 'dark');
assert.equal(messages.filter(m => m.type === 'changed').length, readMessages);

// Native tooling blurs the keyboard, but formatting keeps the selected range and shared undo.
send({
  type: 'load',
  loadId: 'accessory',
  editable: true,
  content: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [text('A6 selected text')] }],
  },
  position: { anchor: 1, head: 3, scroll: 0 },
});
send({ type: 'blur' });
send({ type: 'command', name: 'italic' });
assert.equal(
  messages.filter(m => m.type === 'changed').at(-1).content.content[0]
    .content[0].text,
  'A6',
);
assert.equal(
  messages.filter(m => m.type === 'changed').at(-1).content.content[0]
    .content[0].marks[0].type,
  'italic',
);
send({ type: 'command', name: 'undo' });
assert.equal(
  messages.filter(m => m.type === 'changed').at(-1).content.content[0]
    .content[0].marks,
  undefined,
);
send({ type: 'command', name: 'redo' });
assert.equal(
  messages.filter(m => m.type === 'changed').at(-1).content.content[0]
    .content[0].marks[0].type,
  'italic',
);
send({
  type: 'load',
  loadId: 'unsupported',
  content: { type: 'doc', content: [{ type: 'unknown' }] },
});
assert.equal(messages.at(-1).type, 'unsupported');
send({
  type: 'load',
  loadId: 'unsupported-attribute',
  content: {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        attrs: { future: 'keep me' },
        content: [text('Original')],
      },
    ],
  },
});
assert.equal(messages.at(-1).type, 'unsupported');
assert.equal(
  dom.window.document.querySelector('.tiptap').getAttribute('contenteditable'),
  'false',
);
console.log(
  'Full structured-schema roundtrip and unsupported-content save lock passed',
);
dom.window.close();
