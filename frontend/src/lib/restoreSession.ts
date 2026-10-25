import type { Pane } from './paneNavigation';
import type { Resource } from '../types';
import type { SessionSnapshot } from './sessionStore';
import {resourceKind} from './resourceKinds';
/** Only missing notes trigger fallback. Network failures leave the snapshot retryable. */
export async function restoreSession(snapshot: SessionSnapshot, maximum: number, load: (id: string) => Promise<Resource | null>, loadSummary = load) {
  const resources: Record<string, Resource> = {}, messages: string[] = [];
  const pending = new Map<string, Promise<Resource | null>>();
  const visibleResources = new Set(snapshot.panes.slice(0, maximum).map(p => p.id));
  const get = (id: string) => { if (!pending.has(id)) pending.set(id, (visibleResources.has(id) ? load : loadSummary)(id)); return pending.get(id)!; };
  const candidates = snapshot.sessions ?? snapshot.panes;
  for (let start = 0; start < candidates.length; start += 8) await Promise.all(candidates.slice(start, start + 8).map(p => get(p.id)));
  const sessions: Pane[] = [];
  for (const source of candidates) {
    const pane = structuredClone(source);
    if (!Array.isArray(pane.history) || !pane.history.length || !pane.history[pane.cursor]) continue;
    const indices = pane.history.map((_, i) => i).sort((a, b) => Math.abs(a - pane.cursor) - Math.abs(b - pane.cursor) || a - b);
    let found = false;
    for (const index of indices) {
      const entry = pane.history[index], resource = await get(entry.resourceId);
      if (!resource || resourceKind(resource.type).mode !== 'editor' || resource.trashedAt) { entry.unavailable = true; continue; }
      resources[resource.id] = resource; entry.title = resource.title; entry.unavailable = false;
      if (index !== pane.cursor) messages.push(`“${pane.history[pane.cursor].title}” is unavailable. Restored the nearest available journey step.`);
      pane.cursor = index; pane.id = resource.id; pane.selection = snapshot.positions[entry.visitId]?.selection; pane.transition = 'replace'; if (snapshot.version === 2 || !sessions.some(p => p.id === pane.id)) sessions.push(pane); found = true; break;
    }
    if (!found) messages.push('A pane could not be restored because its notes are unavailable. Recovery drafts are retained.');
  }
  const panes: Pane[] = snapshot.panes.slice(0, maximum).flatMap(saved => { const session = sessions.find(p => p.paneId === saved.paneId); return session ? [{...session, slotId:saved.slotId}] : []; });
  if (snapshot.panes.length && !panes.length && sessions.length) panes.push(sessions.at(-1)!);
  // A missing visible current note can fall back to a visit validated only as metadata.
  // Complete its body before mounting; transport failure leaves the original snapshot retryable.
  for (const pane of panes) if (resources[pane.id]?.content == null) {
    const resource = await load(pane.id);
    if (!resource || resourceKind(resource.type).mode !== 'editor' || resource.trashedAt) throw new Error('A restored note changed while loading. Retry restoration.');
    resources[pane.id] = resource;
  }
  if (snapshot.panes.length > maximum) messages.push('Extra panes remain in Open Notes beyond the visible pane limit.');
  return { sessions, panes, resources, messages, activePaneId: panes.some(p => p.paneId === snapshot.activePaneId) ? snapshot.activePaneId : panes[0]?.paneId ?? null };
}
