export type Doc = { type: string; content?: Doc[]; [key: string]: unknown };
export type Note = {
  id: string;
  type: string;
  title: string;
  content: Doc | string;
  revision: string;
  trashedAt?: string | null;
};
export function bridgeMessage(
  raw: string,
  loadId: string,
): {
  type: string;
  content?: Doc;
  resourceId?: string;
  position?: { anchor: number; head: number; scroll: number };
  token?: string;
  anchor?: string;
  inputId?: string;
  valid?: boolean;
  kind?: string;
  attrs?: import('./media').Placement;
} | null {
  if (raw.length > 1500000) return null;
  try {
    const m = JSON.parse(raw);
    if (m.protocol !== 1 || typeof m.type !== 'string') return null;
    if (m.type === 'ready') return { type: 'ready' };
    if (m.loadId !== loadId) return null;
    if (
      m.type === 'mediaThumbnail' &&
      typeof m.token === 'string' &&
      m.token.length <= 100 &&
      /^[a-f0-9-]{36}$/i.test(m.resourceId ?? '')
    )
      return { type: m.type, resourceId: m.resourceId, token: m.token };
    if (
      ['mediaAnchored', 'mediaPick', 'mediaSelect'].includes(m.type) &&
      typeof m.anchor === 'string' &&
      m.anchor.length <= 100
    ) {
      if (
        m.type === 'mediaSelect' &&
        !/^[a-f0-9-]{36}$/i.test(m.attrs?.resourceId ?? '')
      )
        return null;
      return { type: m.type, anchor: m.anchor, kind: m.kind, attrs: m.attrs };
    }
    if (
      m.type === 'mediaInserted' &&
      /^[a-f0-9-]{36}$/i.test(m.inputId ?? '') &&
      typeof m.valid === 'boolean'
    )
      return { type: m.type, inputId: m.inputId, valid: m.valid };
    if (
      m.type === 'open' &&
      typeof m.resourceId === 'string' &&
      /^[a-f0-9-]{36}$/i.test(m.resourceId)
    )
      return { type: 'open', resourceId: m.resourceId };
    if (m.type === 'changed' || m.type === 'loaded')
      return m.content?.type === 'doc'
        ? { type: m.type, content: m.content }
        : null;
    if (m.type === 'unsupported') return { type: m.type };
    if (
      m.type === 'position' &&
      m.position &&
      ['anchor', 'head', 'scroll'].every(
        k =>
          Number.isFinite(m.position[k]) &&
          m.position[k] >= 0 &&
          m.position[k] <= 10000000,
      )
    )
      return { type: m.type, position: m.position };
  } catch {}
  return null;
}
export const scopeFor = (host: string, workspace: string, generation: string) =>
  JSON.stringify([host, workspace, generation]);
