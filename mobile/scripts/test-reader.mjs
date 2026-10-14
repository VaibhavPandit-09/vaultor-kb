import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
const require = createRequire(new URL('../package.json', import.meta.url));
const { JSDOM } = require('jsdom');
// Import source as ESM independently of the RN package's CJS setting.
const source = await readFile(
  new URL('../reader/render.js', import.meta.url),
  'utf8',
);
const { renderDocument } = await import(
  'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
);
const dom = new JSDOM('<main></main>'),
  root = dom.window.document.querySelector('main'),
  events = [],
  images = [];
const render = doc =>
  renderDocument(
    doc,
    root,
    m => events.push(m),
    (...args) => images.push(args),
  );
const id = '00000000-0000-4000-8000-000000000001';
const doc = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Reading' }],
    },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: '<script>evil()</script>',
          marks: [
            { type: 'bold' },
            { type: 'link', attrs: { href: 'javascript:evil()' } },
          ],
        },
        {
          type: 'resourceLink',
          attrs: { resourceId: id, label: 'Linked note' },
        },
      ],
    },
    {
      type: 'taskList',
      content: [
        {
          type: 'taskItem',
          attrs: { checked: true },
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Read only task' }],
            },
          ],
        },
      ],
    },
    {
      type: 'image',
      attrs: {
        resourceId: id,
        alt: 'Original pixels',
        caption: 'Caption',
        widthPercent: 60,
        alignment: 'center',
      },
    },
    {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            {
              type: 'tableCell',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Cell' }],
                },
              ],
            },
          ],
        },
      ],
    },
    { type: 'unknownFuture', attrs: { html: '<iframe src=https://evil/>' } },
  ],
};
const original = JSON.stringify(doc);
render(doc);
assert.equal(JSON.stringify(doc), original);
assert.equal(root.querySelector('script'), null);
assert.equal(root.querySelector('iframe'), null);
assert.equal(root.querySelector('[contenteditable]'), null);
assert.equal(root.querySelector('input'), null);
assert.equal(root.querySelector('a[href^=javascript]'), null);
assert.match(root.textContent, /Unsupported unknownFuture/);
root.querySelector('a.resource').click();
assert.equal(events[0].resourceId, id);
assert.equal(images[0][2], 'Original pixels');
assert.equal(root.querySelector('figure').style.width, '60%');
assert.equal(root.querySelector('figcaption').textContent, 'Caption');
assert.ok(root.querySelector('.overflow table'));
render({
  type: 'doc',
  content: [{ type: 'image', attrs: { src: 'https://evil/image.png' } }],
});
assert.equal(root.querySelector('img'), null);
assert.equal(images.length, 1);
console.log(
  'Reader: safe schema rendering, original JSON, links, image metadata, unknown fallback, no remote loads or editable controls passed',
);
// Runtime tests exercise the actual bundled reader without editable content.
const runtime = await readFile(
  new URL('../android/app/src/main/assets/reader.js', import.meta.url),
  'utf8',
);
const page = new JSDOM('<main id="document"></main>', {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  }),
  w = page.window,
  messages = [];
w.ReactNativeWebView = { postMessage: raw => messages.push(JSON.parse(raw)) };
w.IntersectionObserver = class {
  observe() {}
  disconnect() {}
};
w.scrollTo = (x, y) => {
  w.scrollY = typeof x === 'object' ? x.top : y;
};
w.Range.prototype.getBoundingClientRect = () => ({ top: 180, bottom: 200 });
w.CSS = { highlights: new Map() };
w.Highlight = class extends Set {
  constructor(...ranges) {
    super(ranges);
  }
};
w.eval(runtime);
const receive = m => w.vaultorReceive(JSON.stringify(m));
receive({
  type: 'load',
  loadId: 'fixture',
  revision: 'r1',
  theme: 'oled',
  content: {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Outline heading' }],
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'phrase across ' },
          { type: 'text', text: 'bold marks', marks: [{ type: 'bold' }] },
          { type: 'text', text: ' and literal [brackets].' },
        ],
      },
    ],
  },
});
await new Promise(r => setTimeout(r, 120));
assert.equal(
  messages.find(m => m.type === 'loaded').headings[0].title,
  'Outline heading',
);
receive({ type: 'find', loadId: 'fixture', query: 'across bold marks' });
assert.equal(messages.at(-1).count, 1);
receive({ type: 'find', loadId: 'fixture', query: '[brackets]' });
assert.equal(messages.at(-1).count, 1);
receive({ type: 'find', loadId: 'old', query: 'no matches' });
assert.equal(messages.at(-1).count, 1);
const element = w.document.querySelector('strong');
receive({
  type: 'preferences',
  theme: 'light',
  size: 24,
  spacing: 2,
  measure: 500,
});
assert.equal(w.document.querySelector('strong'), element);
assert.equal(w.document.documentElement.dataset.theme, 'light');
assert.equal(w.document.querySelector('[contenteditable]'), null);
console.log(
  'Reader runtime: outline, cross-mark/literal find, stale commands and non-replacing appearance passed',
);
page.window.close();

// Oversized media must never redefine its own fit viewport (Android 17 regression).
const media = new JSDOM(
  await readFile(new URL('../reader/media.html', import.meta.url), 'utf8'),
  { runScripts: 'outside-only', pretendToBeVisual: true },
);
const mw = media.window,
  viewport = mw.document.querySelector('#viewport'),
  picture = mw.document.querySelector('#image'),
  updates = [];
Object.defineProperties(viewport, {
  clientWidth: { value: 400 },
  clientHeight: { value: 700 },
});
Object.defineProperty(mw, 'innerWidth', { value: 1600 });
viewport.scrollTo = (x, y) => {
  viewport.scrollLeft = Math.max(0, x);
  viewport.scrollTop = Math.max(0, y);
};
mw.ReactNativeWebView = { postMessage: raw => updates.push(JSON.parse(raw)) };
mw.eval(await readFile(new URL('../reader/media.js', import.meta.url), 'utf8'));
mw.vaultorMediaReceive(
  JSON.stringify({
    type: 'load',
    ticket: 'media',
    width: 1600,
    height: 1000,
    uri: 'file:///data/local.png',
    zoom: 1,
  }),
);
picture.onload();
assert.equal(picture.style.width, '400px');
mw.vaultorMediaReceive(JSON.stringify({ type: 'zoom', zoom: 2 }));
assert.equal(picture.style.width, '800px');
assert.equal(viewport.clientWidth, 400);
mw.vaultorMediaReceive(JSON.stringify({ type: 'flush' }));
assert.equal(updates.at(-1).x, 200);
mw.vaultorMediaReceive(JSON.stringify({ type: 'zoom', zoom: 99 }));
assert.equal(picture.style.width, '1600px');
mw.vaultorMediaReceive(JSON.stringify({ type: 'zoom', zoom: 1 }));
picture.setPointerCapture = () => {};
function pointer(type, id, x, y) {
  const e = new mw.MouseEvent(type, { clientX: x, clientY: y });
  Object.defineProperty(e, 'pointerId', { value: id });
  picture.dispatchEvent(e);
}
pointer('pointerdown', 1, 100, 100);
pointer('pointerdown', 2, 200, 100);
pointer('pointermove', 2, 300, 100);
assert.equal(picture.style.width, '800px');
pointer('pointerup', 1, 100, 100);
pointer('pointerup', 2, 300, 100);
assert.equal(updates.at(-1).zoom, 2);
media.window.close();
console.log(
  'Media runtime: fixed viewport fit, bounded zoom, pan persistence and pinch passed',
);
