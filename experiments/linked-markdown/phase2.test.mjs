import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { undo, redo, closeHistory } from '@tiptap/pm/history';
import { toMarkdown } from 'mdast-util-to-markdown';
import { parser as lezer } from '@lezer/markdown';
import { SourceSession, parse, project, decode, schema } from './source-editor.mjs';

const fixture = readFileSync(new URL('./fixtures/mixed.md', import.meta.url));
const docs = ['docs/CODEBASE.md', 'docs/workspace/SESSIONS.md', 'docs/workspace/NAVIGATION.md', 'docs/security/HOST-ACCESS.md', 'docs/design/UI_PHILOSOPHY.md'];
function assertEdit(session, oldText, newText) {
  const before = session.bytes, result = session.replace(oldText, newText);
  assert.equal(result.accepted, true, result.reason);
  assert.equal(result.patches.length, 1);
  const p = result.patches[0], inserted = Buffer.from(p.inserted);
  assert.deepEqual(session.bytes.subarray(0, p.start), before.subarray(0, p.start));
  assert.deepEqual(session.bytes.subarray(p.start + inserted.length), before.subarray(p.end));
  assert.equal(before.subarray(p.start, p.end).toString(), oldText);
  assert.equal(p.inserted, newText);
  return p;
}

for (const ending of ['LF', 'CRLF']) {
  const bytes = ending === 'LF' ? fixture : Buffer.from(fixture.toString().replaceAll('\r\n', '\n').replaceAll('\n', '\r\n'));
  test(`P2 ${ending}: open no-op preserves exact bytes including unsupported regions`, () => {
    const s = new SourceSession(bytes);
    assert.deepEqual(s.bytes, bytes);
    assert.equal(s.events.length, 0);
    assert.equal(s.projection.ast.children[0].type, 'yaml');
    const kinds = [];
    s.state.doc.descendants(n => { if (n.type.name.startsWith('source')) kinds.push(n.attrs.kind); });
    for (const kind of ['yaml', 'definition', 'html', 'containerDirective', 'linkReference']) assert(kinds.includes(kind), kind);
  });
  for (const oldText of ['Paragraph original', 'bold original', 'italic original', 'Heading original', 'Ordered original', 'Nested original', 'Deep original', 'Bullet original', 'Child original', 'Inline original', 'original', '😀 café é', 'Final original']) {
    test(`P2 ${ending}: literal edit ${oldText}`, () => assertEdit(new SourceSession(bytes), oldText, oldText.replace('original', 'edited') === oldText ? '😀 हिन्दी é' : oldText.replace('original', 'edited')));
  }
  test(`P2 ${ending}: GFM cell edit retains alignment and all padding`, () => {
    const s = new SourceSession(bytes);
    const span = s.projection.spans.find(x => x.node.text === 'original');
    const r = s.apply(s.state.tr.insertText('changed', span.from, span.to));
    assert(r.accepted, r.reason);
    assert.equal(s.bytes.toString(), bytes.toString().replace('| original | keep  |', '| changed | keep  |'));
  });
}

test('P2 fenced code body with tilde fence/meta retained', () => {
  const s = new SourceSession(fixture); assertEdit(s, 'const original', 'const changed');
  assert(s.bytes.includes(Buffer.from('~~~~js extra-meta')));
});
test('P2 backtick multiline code body edit and fence collision rejection', () => {
  const s = new SourceSession(Buffer.from('```js\nfirst\nsecond\n```\n\nTail.\n'));
  assertEdit(s, 'second', 'updated');
  const before = s.bytes; const r = s.replace('first', '```');
  assert.equal(r.accepted, false); assert.deepEqual(s.bytes, before); assert(r.draft);
});
test('P2 CRLF multiline code is protected, adjacent paragraph editable', () => {
  const s = new SourceSession(Buffer.from('```js\r\na\r\nb\r\n```\r\n\r\nTail.\r\n'));
  assert(s.state.doc.firstChild.type.name === 'sourceBlock'); assertEdit(s, 'Tail.', 'Tail edited.');
});
test('P2 multiple transactions and real PM Undo/Redo return exact original bytes', () => {
  const s = new SourceSession(fixture);
  assertEdit(s, 'Paragraph original', 'Paragraph first');
  const p = s.locate('bold original');
  assert(s.apply(closeHistory(s.state.tr).insertText('bold second', p, p + 'bold original'.length)).accepted);
  const changed = s.bytes;
  assert(undo(s.state, tr => assert(s.apply(tr).accepted)));
  assert(undo(s.state, tr => assert(s.apply(tr).accepted)));
  assert.deepEqual(s.bytes, fixture);
  assert(redo(s.state, tr => assert(s.apply(tr).accepted)));
  assert(redo(s.state, tr => assert(s.apply(tr).accepted)));
  assert.deepEqual(s.bytes, changed);
});
test('P2 multi-step transaction uses each intermediate document map', () => {
  const s = new SourceSession(Buffer.from('alpha beta\n'));
  const tr = s.state.tr.insertText('long ', 1).insertText('!', 16);
  const r = s.apply(tr); assert(r.accepted, r.reason); assert.equal(r.patches.length, 2);
});
for (const [name, change] of [
  ['new emphasis delimiter changes grammar', s => s.state.tr.insertText('*paired*', s.locate('Paragraph original'))],
  ['structural join across paragraph boundaries', s => s.state.tr.delete(1, s.state.doc.content.size - 1)],
  ['split paragraph', s => s.state.tr.split(s.locate('Paragraph original') + 5)],
  ['heading level mutation', s => s.state.tr.setNodeMarkup(1 + s.state.doc.firstChild.nodeSize, schema.nodes.heading, { level: 2 })],
  ['new bold mark', s => s.state.tr.addMark(s.locate('Paragraph original'), s.locate('Paragraph original') + 9, schema.marks.bold.create())],
  ['newline replacement', s => s.state.tr.insertText('\n', s.locate('Paragraph original'))],
]) test('P2 rejected with draft retained: ' + name, () => {
  const s = new SourceSession(fixture), r = s.apply(change(s));
  assert.equal(r.accepted, false); assert.deepEqual(s.bytes, fixture); assert(r.draft);
});
test('P2 entities/escapes, references and unknown blocks cannot be edited as literal spans', () => {
  const s = new SourceSession(fixture);
  for (const kind of ['linkReference', 'yaml', 'containerDirective', 'html']) {
    let pos; s.state.doc.descendants((n, p) => { if (n.attrs.kind === kind) pos = p; });
    const fresh = new SourceSession(fixture), r = fresh.apply(fresh.state.tr.delete(pos, pos + 1));
    assert.equal(r.accepted, false); assert(r.draft); assert.deepEqual(fresh.bytes, fixture);
  }
  assert(s.projection.spans.every(x => !x.node.text.includes('& entity')));
});
test('P2 source offsets are UTF-16, byte offsets differ, surrogate splits rejected', () => {
  const source = '😀 café é\n', bytes = Buffer.from(source), d = decode(bytes);
  assert.equal(parse(source).children[0].position.end.offset, source.length - 1);
  assert.equal(d.byteAt.get(2), 4); assert.equal(d.byteAt.get(1), undefined);
  const s = new SourceSession(bytes); const r = s.apply(s.state.tr.insertText('X', 2));
  assert.equal(r.accepted, false); assert.match(r.reason, /surrogate/); assert.deepEqual(s.bytes, bytes);
});
test('P2 BOM, no terminal newline and mixed endings preserve bytes', () => {
  const s = new SourceSession(Buffer.from('\ufeff# Header\r\n\r\nPlain original.\n\nLast.'));
  assertEdit(s, 'Plain original.', 'Plain updated.');
  assert.equal(s.bytes[0], 239); assert.equal(s.bytes.at(-1), 46);
});
test('P2 invalid UTF-8 fails closed without replacement characters', () => assert.throws(() => project(Buffer.from([0x66, 0x80, 0x6f]))));
test('P2 lazy list continuation with indentation is protected rather than guessed', () => {
  const s = new SourceSession(Buffer.from('7. Outer\n   - Nested\n     3. Continuation\n'));
  assert(s.projection.spans.every(x => !x.node.text.includes('Nested')));
  assertEdit(s, 'Outer', 'Outer edited');
});
test('P2 partial deletion, insertion and Undo retain exact bytes', () => {
  const original = Buffer.from('Ordinary paragraph.\n'), s = new SourceSession(original);
  assertEdit(s, 'paragraph', 'para');
  assert(undo(s.state, tr => assert(s.apply(tr).accepted)));
  assert.deepEqual(s.bytes, original);
});
test('P2 final literal deletion rejected to keep reverse source mapping', () => {
  const s = new SourceSession(Buffer.from('only\n')), r = s.replace('only', '');
  assert.equal(r.accepted, false); assert.match(r.reason, /reverse source mapping/); assert(r.draft);
});
test('P2 multi-step transaction failure commits no earlier patch', () => {
  const s = new SourceSession(Buffer.from('alpha beta\n')), before = s.bytes;
  const tr = s.state.tr.insertText('X', 1).split(5);
  const r = s.apply(tr); assert.equal(r.accepted, false); assert.deepEqual(s.bytes, before); assert(r.draft);
});
test('P2 unsafe GFM pipe, link terminator and block introducer cannot escape validation', () => {
  for (const [source, oldText, next] of [['| a | b |\n|---|---|\n| data | tail |\n', 'data', 'a | b'], ['[Label](../x.md)\n', 'Label', 'bad]('], ['Plain\n', 'Plain', '# Heading']]) {
    const s = new SourceSession(Buffer.from(source)), r = s.replace(oldText, next);
    assert.equal(r.accepted, false, source); assert.deepEqual(s.bytes, Buffer.from(source)); assert(r.draft);
  }
});
test('P2 text mutation trials: every accepted result reparses to the intended PM document', () => {
  const alphabet = ['a', '😀', '*x*', '[x](a)', '&amp;', '# h', '|', '\\*', '_', '`', '\n', '\u0000', 'é', '\ud800'];
  let accepted = 0, rejected = 0;
  for (const next of alphabet) for (const [source, oldText] of [['Plain alpha omega\n', 'alpha'], ['**alpha**\n', 'alpha'], ['| h | t |\n|---|---|\n| alpha | z |\n', 'alpha']]) {
    const bytes = Buffer.from(source), s = new SourceSession(bytes), from = s.locate(oldText);
    const tr = s.state.tr.insertText(next, from, from + oldText.length), r = s.apply(tr);
    if (r.accepted) { accepted++; assert(project(s.bytes).doc.eq(tr.doc)); }
    else { rejected++; assert.deepEqual(s.bytes, bytes); assert(r.draft); }
  }
  assert(accepted > 0 && rejected > 0);
});
test('P2 normal AST serializer is a demonstrated lossy negative control', () => {
  const source = '# Header ###\r\n\r\n7) first\r\n8) second\r\n\r\n**bold** and _italic_\r\n';
  const serialized = toMarkdown(parse(source)); assert.notEqual(serialized, source);
  assert(!serialized.includes('\r')); assert(!serialized.includes('7)'));
});
test('P2 Lezer comparison: unresolved reference accepted syntactically, mdast uses text', () => {
  const source = '[missing][undefined]\n';
  assert(lezer.parse(source).toString().includes('Link'));
  assert.equal(parse(source).children[0].children[0].type, 'text');
});
for (const path of docs) test('P2 repository sample exact no-op and one literal edit: ' + path, () => {
  const bytes = readFileSync(new URL('../../' + path, import.meta.url));
  const s = new SourceSession(bytes); assert.deepEqual(s.bytes, bytes);
  const span = s.projection.spans.find(x => x.kind === 'text' && x.node.text.length > 80 && /[A-Za-z]{8,}/.test(x.node.text));
  const match = /[A-Za-z]{8,}/.exec(span.node.text)[0];
  const from = span.from + span.node.text.indexOf(match), r = s.apply(s.state.tr.insertText('qualified', from, from + match.length));
  assert(r.accepted, r.reason);
  const patch = r.patches[0];
  assert.deepEqual(s.bytes.subarray(0, patch.start), bytes.subarray(0, patch.start));
  assert.deepEqual(s.bytes.subarray(patch.start + Buffer.byteLength(patch.inserted)), bytes.subarray(patch.end));
});
