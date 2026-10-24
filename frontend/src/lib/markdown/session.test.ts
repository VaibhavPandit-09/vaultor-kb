import { expect, it, vi } from 'vitest';
import { MarkdownSession } from './session';
import { MarkdownEngine } from './engine';
import type { MarkdownPort, WorkerReply, WorkerRequest } from './protocol';
import type { JSONContent } from '@tiptap/core';
const doc = (s: string): JSONContent => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: s }] }] });
class ControlledPort implements MarkdownPort {
  onmessage: MarkdownPort['onmessage'] = null; onerror: MarkdownPort['onerror'] = null;
  pending: WorkerRequest[] = []; terminated = false; engine = new MarkdownEngine(new TextEncoder().encode('Initial\n'));
  postMessage = (r: WorkerRequest) => { this.pending.push(r); };
  terminate = () => { this.terminated = true; };
  emit(reply: WorkerReply) { this.onmessage?.({ data: reply }); }
  run() {
    const r = this.pending.shift()!;
    if (r.type === 'open') { try { this.engine = new MarkdownEngine(new TextEncoder().encode('Initial\n'), r.byteLimit); this.emit({ type: 'ready', source: this.engine.source, doc: this.engine.projection.doc }); } catch (e) { this.emit({ type: 'error', reason: String(e) }); } }
    else if (r.type === 'edit') this.emit({ type: 'result', version: r.version, result: this.engine.apply(r.doc), historyBytes: this.engine.historyBytes });
  }
}
it('coalesces pending edits, never acknowledges stale success and keeps latest draft', async () => {
  const p = new ControlledPort(), s = new MarkdownSession(p, new Uint8Array()); p.run(); await s.ready;
  s.submit(doc('First')); s.submit(doc('Second')); s.submit(doc('Latest'));
  expect(p.pending.length).toBe(1); p.run();
  expect(s.status.state).toBe('validating'); expect(s.status.acceptedVersion).toBe(1); expect(s.status.version).toBe(3);
  expect(() => s.bytes()).toThrow('UNVALIDATED'); expect(p.pending.length).toBe(1);
  p.run(); expect(s.source).toBe('Latest\n'); expect(s.status.acceptedVersion).toBe(3); expect(s.checkpoint().draft).toEqual(doc('Latest')); s.dispose();
});
it('failed visual transformation retains live draft and source; later Undo can recover', async () => {
  const p = new ControlledPort(), s = new MarkdownSession(p, new Uint8Array()); p.run(); await s.ready;
  const bad = doc('Retain me'); bad.content![0].content![0].marks = [{ type: 'underline' }];
  s.submit(bad); p.run(); expect(s.status.state).toBe('needs-source'); expect(s.source).toBe('Initial\n'); expect(s.checkpoint().draft).toEqual(bad);
  expect(() => s.bytes()).toThrow(); s.submit(doc('Initial')); p.run(); expect(s.status.state).toBe('ready'); s.dispose();
});
it('worker failures and timeout retain draft and terminate untrusted late results', async () => {
  vi.useFakeTimers();
  const p = new ControlledPort(), s = new MarkdownSession(p, new Uint8Array(), 50); p.run(); await s.ready;
  s.submit(doc('Unsaved')); vi.advanceTimersByTime(51); expect(s.status.reason).toBe('VALIDATION_TIMEOUT'); expect(p.terminated).toBe(true); expect(s.checkpoint().draft).toEqual(doc('Unsaved')); expect(() => s.submit(doc('Later'))).toThrow();
  s.dispose(); vi.useRealTimers();
});
it('dispose invalidates outstanding callbacks and clears queued work', async () => {
  const p = new ControlledPort(), s = new MarkdownSession(p, new Uint8Array()); p.run(); await s.ready; s.submit(doc('Late')); const cb = p.onmessage; s.dispose();
  cb?.({ data: { type: 'result', version: 1, result: { accepted: true, source: 'Wrong', patches: [], patchMs: 0, validationMs: 0 }, historyBytes: 0 } }); expect(s.source).toBe('Initial\n'); expect(s.status.state).toBe('closed');
});
it('ignores unsolicited out-of-order replies without releasing the real in-flight job', async () => {
  const p = new ControlledPort(), s = new MarkdownSession(p, new Uint8Array()); p.run(); await s.ready; s.submit(doc('Correct'));
  p.emit({ type: 'result', version: 99, result: { accepted: true, source: 'Wrong', patches: [], patchMs: 0, validationMs: 0 }, historyBytes: 0 });
  expect(s.source).toBe('Initial\n'); expect(s.status.state).toBe('validating'); p.run(); expect(s.source).toBe('Correct\n'); s.dispose();
});
it('opening request explicitly bounds ordinary interactive size while stress is opt-in', () => {
  const p = new ControlledPort(), s = new MarkdownSession(p, new Uint8Array()); expect(p.pending[0]).toMatchObject({ type: 'open', byteLimit: 262144 }); const done = s.ready.catch(() => {}); s.dispose(); void done;
});
