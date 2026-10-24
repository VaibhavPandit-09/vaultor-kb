import type { MarkdownSession } from './session';
/** Opaque host bindings only. This is not native authorization; a trusted
 * host-side validator must attest the result over the private bridge. */
export type NativeBinding = { workspace: string; root: string; document: string; epoch: string; baseRevision: string };
export async function prepareExplicitSave(session: MarkdownSession, binding: NativeBinding) {
  const captured = { ...binding }, context = JSON.stringify(captured);
  const version = session.status.version, bytes = session.bytes();
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  if (session.status.version !== version || session.status.state !== 'ready') throw new Error('SAVE_SUPERSEDED');
  if (JSON.stringify(binding) !== context) throw new Error('SAVE_BINDING_CHANGED');
  return { ...captured, operation: crypto.randomUUID(), editVersion: version, source: bytes, sha256: [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join(''), draft: session.checkpoint().draft };
}
