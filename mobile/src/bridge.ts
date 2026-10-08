export type Doc = { type: string; content?: Doc[]; [key: string]: unknown };
export type Note = {
  id: string;
  type: string;
  title: string;
  content: Doc | string;
  revision: string;
};
export function bridgeMessage(
  raw: string,
  loadId: string,
): { type: string; content?: Doc } | null {
  if (raw.length > 1500000) return null;
  try {
    const m = JSON.parse(raw);
    if (m.protocol !== 1 || typeof m.type !== 'string') return null;
    if (m.type === 'ready') return { type: 'ready' };
    if (m.loadId !== loadId) return null;
    if (m.type === 'changed' || m.type === 'loaded')
      return m.content?.type === 'doc'
        ? { type: m.type, content: m.content }
        : null;
    if (m.type === 'unsupported') return { type: m.type };
  } catch {}
  return null;
}
export const scopeFor = (host: string, workspace: string, generation: string) =>
  JSON.stringify([host, workspace, generation]);
