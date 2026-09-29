import type { Resource } from '../types';
import type { SessionSnapshot } from './sessionStore';
/** Only missing notes trigger fallback. Network failures leave the snapshot retryable. */
export async function restoreSession(snapshot: SessionSnapshot, maximum: number, load: (id: string) => Promise<Resource | null>) {
  const resources: Record<string, Resource> = {}, messages: string[] = [];
  const pending = new Map<string, Promise<Resource | null>>();
  const get = (id: string) => { if (!pending.has(id)) pending.set(id, load(id)); return pending.get(id)!; };
  const candidates = snapshot.panes.slice(0, maximum);
  await Promise.all(candidates.map(p => get(p.id)));
  const panes = [];
  for (const source of candidates) {
    const pane = structuredClone(source);
    if (!Array.isArray(pane.history) || !pane.history.length || !pane.history[pane.cursor]) continue;
    const indices = pane.history.map((_, i) => i).sort((a, b) => Math.abs(a - pane.cursor) - Math.abs(b - pane.cursor) || a - b);
    let found = false;
    for (const index of indices) {
      const entry = pane.history[index], resource = await get(entry.resourceId);
      if (!resource || resource.type !== 'note') { entry.unavailable = true; continue; }
      resources[resource.id] = resource; entry.title = resource.title; entry.unavailable = false;
      if (index !== pane.cursor) messages.push(`“${pane.history[pane.cursor].title}” is unavailable. Restored the nearest available journey step.`);
      pane.cursor = index; pane.id = resource.id; pane.selection = snapshot.positions[entry.visitId]?.selection; pane.transition = 'replace'; panes.push(pane); found = true; break;
    }
    if (!found) messages.push('A pane could not be restored because its notes are unavailable. Recovery drafts are retained.');
  }
  if (snapshot.panes.length > maximum) messages.push('Some panes exceed the current pane limit. Their recovery drafts are retained.');
  return { panes, resources, messages, activePaneId: panes.some(p => p.paneId === snapshot.activePaneId) ? snapshot.activePaneId : panes[0]?.paneId ?? null };
}
