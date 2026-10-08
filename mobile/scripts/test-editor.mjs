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
