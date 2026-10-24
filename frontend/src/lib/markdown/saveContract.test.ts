import { expect, it } from 'vitest';
import { MarkdownEngine } from './engine';
import { prepareExplicitSave } from './saveContract';
import { MarkdownSession } from './session';
const source = 'First.\n\n<!-- protected -->\n\nTail.\n';
it('G2-A rejects reordered ordinal targets and requires single-use revision tokens', () => {
  const e = new MarkdownEngine(new TextEncoder().encode(source)), block = e.projection.blocks[1].node;
  expect(() => e.sourceRegion(0, block)).toThrow('MAPPING_AMBIGUOUS');
  const region = e.sourceRegion(1, block); e.editRegion(region.token, '<!-- reviewed -->');
  expect(e.source).toBe(source.replace('protected', 'reviewed')); expect(() => e.editRegion(region.token, '<!-- replay -->')).toThrow('TICKET_STALE');
});
it('G2-A an intervening accepted edit invalidates a region token', () => {
  const e = new MarkdownEngine(new TextEncoder().encode(source)), region = e.sourceRegion(1, e.projection.blocks[1].node), doc = structuredClone(e.projection.doc);
  doc.content![0].content![0].text = 'Edited.'; expect(e.apply(doc).accepted).toBe(true);
  expect(() => e.editRegion(region.token, '<!-- stale -->')).toThrow('TICKET_STALE'); expect(e.source).toContain('<!-- protected -->');
});
it('G2-A rejected structural drafts cannot request ordinal fallback or enter Save', async () => {
  const port = { onmessage: null, onerror: null, postMessage: () => {}, terminate: () => {} };
  const s = new MarkdownSession(port, new TextEncoder().encode(source));
  (port.onmessage as unknown as (e: unknown) => void)({ data: { type: 'ready', doc: new MarkdownEngine(new TextEncoder().encode(source)).projection.doc, source } }); await s.ready;
  s.status = { state: 'needs-source', version: 2, acceptedVersion: 1 };
  await expect(s.readRegion(0, { type: 'paragraph' })).rejects.toThrow('VALIDATED_DRAFT'); await expect(s.editSource(0, 'unreviewed')).rejects.toThrow('TICKET_REQUIRED');
  await expect(prepareExplicitSave(s, { workspace: 'w', root: 'r', document: 'd', epoch: 'e', baseRevision: 'b' })).rejects.toThrow('UNVALIDATED'); s.dispose();
});
async function readySession() {
  const port = { onmessage: null, onerror: null, postMessage: () => {}, terminate: () => {} }, s = new MarkdownSession(port, new TextEncoder().encode(source));
  (port.onmessage as unknown as (e: unknown) => void)({ data: { type: 'ready', doc: new MarkdownEngine(new TextEncoder().encode(source)).projection.doc, source } }); await s.ready; return s;
}
const binding = () => ({ workspace: 'w', root: 'r', document: 'd', epoch: 'e', baseRevision: 'b' });
it('G2-A explicit Save exports exact validated bytes and a cryptographic hash, not an authorization flag', async () => {
  const s = await readySession(), envelope = await prepareExplicitSave(s, binding());
  expect(envelope.source).toEqual(new TextEncoder().encode(source)); expect(envelope.sha256).toMatch(/^[a-f0-9]{64}$/); expect(envelope.editVersion).toBe(0); expect(envelope).not.toHaveProperty('validated'); s.dispose();
});
it('G2-A a newer visual edit supersedes a pending Save digest', async () => {
  const s = await readySession(), pending = prepareExplicitSave(s, binding()); s.submit({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'newer' }] }] });
  await expect(pending).rejects.toThrow('SAVE_SUPERSEDED'); s.dispose();
});
it('G2-A connection bindings cannot change while preparing a Save', async () => {
  const s = await readySession(), context = binding(), pending = prepareExplicitSave(s, context); context.document = 'other';
  await expect(pending).rejects.toThrow('BINDING_CHANGED'); s.dispose();
});
