import { resourceKind } from './resourceKinds';
import type { Resource } from '../types';
export type ReadingPosition = { scrollTop: number; scrollLeft: number; selection?: { from: number; to: number } };
export type Visit = { visitId: string; resourceId: string; title: string; unavailable?: boolean };
export class ResourceUnavailableError extends Error {}
const visit = (resource: Resource): Visit => ({ visitId: crypto.randomUUID(), resourceId: resource.id, title: resource.title });
// paneId remains the session ID for v1 compatibility; slotId belongs only to a visible assignment.
export type Pane = { paneId: string; slotId?: string; id: string; selection?: { from: number; to: number }; history: Visit[]; cursor: number; transition?: 'forward' | 'back' | 'replace' };
export type OpenIntent = { sourcePaneId?: string; destination?: 'here' | 'new'; intent?: 'direct' | 'link' | 'history'; historyIndex?: number; focus?: boolean; throwOnFailure?: boolean };
export type NavigationIssue = { message: string; id: string; options: OpenIntent; limit?: boolean; closePaneId?: string; closeSession?: boolean; unavailable?: boolean };
type State = { sessions: Pane[]; panes: Pane[]; activePaneId: string | null; issue: NavigationIssue | null; focusPaneId: string | null; motion: 'forward' | 'back' | 'replace' | 'switch' };
type Dependencies = { load: (id: string) => Promise<Resource | null>; save: (id: string) => Promise<void>; preview: (resource: Resource, sourcePaneId?: string) => void; committed: (id: string, focus: boolean) => void; max: number; behavior: 'split' | 'replace' };
/** Pane mutations commit only after loading and the source save barrier succeed. */
export class PaneNavigation {
  private state: State = { sessions: [], panes: [], activePaneId: null, issue: null, focusPaneId: null, motion: 'replace' };
  private positions = new Map<string, ReadingPosition>();
  private listeners = new Set<() => void>();
  private requests = new Map<string, number>();
  private dependencies: () => Dependencies;
  constructor(dependencies: () => Dependencies) { this.dependencies = dependencies; }
  snapshot = () => this.state;
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  private patch(patch: Partial<State>) { this.state = { ...this.state, ...patch }; const retained = new Set(this.state.sessions.flatMap(p => p.history.map(v => v.visitId))); for (const id of this.positions.keys()) if (!retained.has(id)) this.positions.delete(id); this.listeners.forEach(fn => fn()); }
  /** paneId is the stable session identity inherited from v1. Panes are visible assignments. */
  private commit(sessions: Pane[], visible: string[], active = this.state.activePaneId, extra: Partial<State> = {}, previous = this.state.panes) {
    const reserved = new Set(previous.filter(p => visible.includes(p.paneId)).map(p => p.slotId ?? p.paneId));
    const panes = visible.flatMap((id, index) => {
      const session = sessions.find(p => p.paneId === id); if (!session) return [];
      const existing = previous.find(p => p.paneId === id);
      const candidate = previous[index]?.slotId ?? previous[index]?.paneId;
      const slotId = existing ? existing.slotId ?? existing.paneId : candidate && !reserved.has(candidate) ? candidate : crypto.randomUUID();
      reserved.add(slotId);
      return [{ ...session, slotId }];
    });
    const activePaneId = panes.some(p => p.paneId === active) ? active : panes.at(-1)?.paneId ?? null;
    this.patch({ sessions, panes, activePaneId, ...extra });
  }
  update = (change: (sessions: Pane[]) => Pane[]) => {
    const sessions = change(this.state.sessions);
    for (const session of this.state.sessions) if (!sessions.some(p => p.paneId === session.paneId)) this.requests.delete(session.paneId);
    if (sessions !== this.state.sessions) this.commit(sessions, this.state.panes.map(p => p.paneId));
  };
  activate = (paneId: string, focus = false) => { this.focusSequence++; if (this.state.panes.some(p => p.paneId === paneId)) this.patch({ activePaneId: paneId, ...(paneId !== this.state.activePaneId ? { motion: 'switch' as const } : {}), ...(focus ? { focusPaneId: paneId } : {}) }); };
  focusHandled = (paneId: string) => { if (this.state.focusPaneId === paneId) this.patch({ focusPaneId: null }); };
  dismissIssue = () => this.patch({ issue: null });
  reset = () => { this.epoch++; this.requests.clear(); this.unavailable.clear(); this.patch({ sessions: [], panes: [], activePaneId: null, focusPaneId: null, issue: null }); };
  exportSession = () => ({ sessions: this.state.sessions, panes: this.state.panes, activePaneId: this.state.activePaneId, positions: Object.fromEntries(this.positions) });
  restore = (panes: Pane[], activePaneId: string | null, positions: Record<string, ReadingPosition>, sessions = panes) => {
    this.epoch++; this.unavailable.clear(); this.requests.clear(); this.positions = new Map(Object.entries(positions));
    this.commit(sessions, panes.map(p => p.paneId), activePaneId, { focusPaneId: null, issue: null, motion: 'replace' }, panes);
  };
  position = (visitId: string): ReadingPosition => this.positions.get(visitId) ?? { scrollTop: 0, scrollLeft: 0 };
  recordPosition = (paneId: string, visitId: string, position: Partial<ReadingPosition>) => {
    const pane = this.state.sessions.find(p => p.paneId === paneId);
    if (pane?.history[pane.cursor]?.visitId !== visitId) return;
    this.positions.set(visitId, { ...this.position(visitId), ...position });
  };
  rename = (resourceId: string, title: string) => {
    if (!this.state.sessions.some(p => p.history.some(v => v.resourceId === resourceId && v.title !== title))) return;
    this.update(panes => panes.map(p => ({ ...p, history: p.history.map(v => v.resourceId === resourceId ? { ...v, title } : v) })));
  };
  markUnavailable = (resourceId: string) => {
    const previouslyVisible = new Set(this.state.panes.map(p => p.paneId));
    this.unavailable.set(resourceId, (this.unavailable.get(resourceId) ?? 0) + 1);
    const removedActive = this.state.panes.some(p => p.id === resourceId && p.paneId === this.state.activePaneId);
    const sessions = this.state.sessions.filter(p => p.id !== resourceId).map(p => ({ ...p, history: p.history.map(v => v.resourceId === resourceId ? { ...v, unavailable: true } : v) }));
    const visible = this.state.panes.map(p => p.paneId);
    const hidden = sessions.filter(p => !visible.includes(p.paneId));
    let active = this.state.activePaneId;
    const next = visible.flatMap(id => {
      if (sessions.some(p => p.paneId === id)) return [id];
      const replacement = hidden.pop()?.paneId;
      if (id === active) active = replacement ?? null;
      return replacement ? [replacement] : [];
    });
    this.commit(sessions, next, active);
    this.loadAssignedSessions(previouslyVisible);
    if (removedActive && this.state.activePaneId) { this.activate(this.state.activePaneId, true); this.dependencies().committed(this.state.panes.find(p => p.paneId === this.state.activePaneId)!.id, true); }
  };
  private unavailable = new Map<string, number>();
  /** Fallback sessions can have only metadata after cache eviction or hydration. */
  private loadAssignedSessions(previous: Set<string>) {
    const epoch = this.epoch;
    for (const pane of this.state.panes) {
      if (previous.has(pane.paneId)) continue;
      void this.dependencies().load(pane.id).then(resource => {
        if (epoch !== this.epoch || !this.state.panes.some(p => p.paneId === pane.paneId && p.id === pane.id)) return;
        if (!resource || resource.trashedAt) this.markUnavailable(pane.id);
      }).catch(error => {
        if (epoch !== this.epoch || !this.state.panes.some(p => p.paneId === pane.paneId && p.id === pane.id)) return;
        if (error instanceof ResourceUnavailableError) this.markUnavailable(pane.id);
        else this.patch({ issue: { id: pane.id, options: {}, message: 'Could not load the surviving session. Retry when the host is available.' } });
      });
    }
  }
  markAvailable = (resourceId: string) => {

    this.update(panes=>panes.map(p=>({...p,history:p.history.map(v=>v.resourceId===resourceId?{...v,unavailable:false}:v)})));
  };
  jump = async (paneId: string, index: number) => {
    const pane = this.state.panes.find(p => p.paneId === paneId), target = pane?.history[index];
    if (!pane || !target || target.unavailable || index === pane.cursor) return;
    await this.open(target.resourceId, { sourcePaneId: paneId, destination: 'here', intent: 'history', historyIndex: index });
  };
  private epoch = 0;
  private sequence = 0;
  private focusSequence = 0;
  open = async (id: string, options: OpenIntent = {}) => {
    const dep = this.dependencies();
    const sourcePaneId = options.sourcePaneId ?? this.state.activePaneId ?? undefined;
    const source = this.state.panes.find(p => p.paneId === sourcePaneId);
    if (options.sourcePaneId && !source) return;
    const focusToken = ++this.focusSequence;
    const intent = options.intent ?? 'direct';
    if (intent === 'history' && (!source || options.historyIndex === source.cursor || source.history[options.historyIndex ?? -1]?.resourceId !== id || source.history[options.historyIndex ?? -1]?.unavailable)) return;
    const destination = options.destination ?? 'here';
    const epoch = this.epoch, resourceVersion = this.unavailable.get(id);
    const key = sourcePaneId ?? 'workspace', token = ++this.sequence;
    this.requests.set(key, token);
    const valid = () => this.epoch === epoch && this.unavailable.get(id) === resourceVersion && this.requests.get(key) === token && (!source || this.state.panes.some(p => p.paneId === source.paneId && p.id === source.id));
    this.patch({ issue: null });
    try {
      const resource = await dep.load(id);
      if (!valid()) return;
      if (resource?.trashedAt) throw new ResourceUnavailableError('This note is in Trash.');
      if (!resource) throw new Error('Resource could not be loaded.');
      if (resourceKind(resource.type).mode === 'unsupported') throw new Error('This resource type is not supported by this app: '+resource.type);
      if (resource.type !== 'note' && intent === 'history') throw new ResourceUnavailableError('This journey step is no longer a note.');
      if (resource.type !== 'note') { dep.preview(resource, sourcePaneId); return; }
      if (intent === 'link' && destination === 'here' && source?.id === id) return;
      // Reopening preserves the existing journey, selection and visit identity.
      const existing = intent !== 'history' ? this.state.sessions.find(p => p.id === id) : undefined;
      if (existing) {
        if (source && source.paneId !== existing.paneId && !this.state.panes.some(p => p.paneId === existing.paneId) && destination === 'here') await dep.save(source.id);
        if (!valid()) return;
        this.show(existing, sourcePaneId, destination, this.focusSequence === focusToken, options.focus !== false);
        return;
      }
      if ((!source || destination === 'new') && this.state.panes.length >= dep.max) {
        this.patch({ issue: { message: 'Pane limit reached', id, options: { ...options, sourcePaneId }, limit: true } }); return;
      }
      if (source && destination === 'here') await dep.save(source.id);
      if (!valid()) return;
      // Capacity may have changed while another pane was loading/saving.
      if ((!source || destination === 'new') && this.state.panes.length >= this.dependencies().max) {
        this.patch({ issue: { message: 'Pane limit reached', id, options: { ...options, sourcePaneId }, limit: true } }); return;
      }
      const raced = intent === 'direct' ? this.state.sessions.find(p => p.id === id) : undefined;
      if (raced) { this.show(raced, sourcePaneId, destination, this.focusSequence === focusToken, options.focus !== false); return; }
      const latestSource = this.state.panes.find(p => p.paneId === sourcePaneId);
      const history = intent === 'history' && latestSource ? latestSource.history.map(v => v.resourceId === id ? { ...v, title: resource.title } : v) : intent === 'link' && latestSource ? [...latestSource.history.slice(0, latestSource.cursor + 1).map(v => ({ ...v })), visit(resource)].slice(-200) : [visit(resource)];
      if (destination === 'new' && intent === 'link') {
        for (let i = 0; i < history.length - 1; i++) {
          const old = history[i]; const copy = { ...old, visitId: crypto.randomUUID() };
          this.positions.set(copy.visitId, { ...this.position(old.visitId) }); history[i] = copy;
        }
      }
      const cursor = intent === 'history' ? options.historyIndex! : history.length - 1;
      const transition = intent === 'history' && source && cursor < source.cursor ? 'back' : intent === 'direct' ? 'replace' : 'forward';
      const pane: Pane = { paneId: source && destination === 'here' ? source.paneId : crypto.randomUUID(), id, history, cursor, selection: this.position(history[cursor].visitId).selection, transition };
      const focus = this.focusSequence === focusToken;
      if (intent === 'direct') pane.paneId = crypto.randomUUID();
      const sessions = intent !== 'direct' && source && destination === 'here' ? this.state.sessions.map(p => p.paneId === source.paneId ? pane : p) : [...this.state.sessions, pane];
      const visible = source && destination === 'here' ? this.state.panes.map(p => p.paneId === source.paneId ? pane.paneId : p.paneId) : [...this.state.panes.map(p => p.paneId), pane.paneId];
      this.commit(sessions, visible, focus ? pane.paneId : this.state.activePaneId, focus ? { motion: transition, focusPaneId: options.focus === false ? null : pane.paneId } : {});
      dep.committed(id, focus);
    } catch (error) {
      if (!valid()) return;
      const unavailable = error instanceof ResourceUnavailableError;
      if (unavailable) this.markUnavailable(id);
      this.patch({ issue: { unavailable, message: error instanceof Error ? error.message : 'Navigation failed', id, options: { ...options, sourcePaneId } } });
      if (options.throwOnFailure) throw error;
    }
  };
  private show(session: Pane, sourceId: string | undefined, destination: 'here' | 'new', focus: boolean, restoreFocus: boolean) {
    let visible = this.state.panes.map(p => p.paneId);
    if (!visible.includes(session.paneId)) {
      if (destination === 'new' && visible.length >= this.dependencies().max) {
        this.patch({ issue: { message: 'All visible panes are in use. Select a note to open here.', id: session.id, options: { destination: 'here' } } }); return;
      }
      visible = destination === 'here' && visible.includes(sourceId ?? '') ? visible.map(id => id === sourceId ? session.paneId : id) : [...visible, session.paneId];
    }
    const sessions = this.state.sessions.map(p => p.paneId === session.paneId ? { ...p, selection: this.position(p.history[p.cursor].visitId).selection } : p);
    this.commit(sessions, visible, focus ? session.paneId : this.state.activePaneId, focus ? { motion: 'switch', focusPaneId: restoreFocus ? session.paneId : null } : {});
    if (focus) this.focusSequence++;
    this.dependencies().committed(session.id, focus);
  }
  /** Closing a pane retains its session; closing a session uses a hidden-session fallback. */
  close = (paneId: string) => this.closeTarget(paneId, false);
  closeSession = (sessionId: string) => this.closeTarget(sessionId, true);
  private closeTarget = async (sessionId: string, remove: boolean) => {
    const session = this.state.sessions.find(p => p.paneId === sessionId); if (!session) return;
    const token = ++this.sequence, epoch = this.epoch; this.requests.set(sessionId, token);
    this.patch({ issue: null });
    try {
      await this.dependencies().save(session.id);
      if (epoch !== this.epoch || this.requests.get(sessionId) !== token) return;
      const sessions = remove ? this.state.sessions.filter(p => p.paneId !== sessionId) : this.state.sessions;
      const visible = this.state.panes.map(p => p.paneId);
      const fallback = sessions.filter(p => !visible.includes(p.paneId)).at(-1);
      const next = remove && fallback ? visible.map(id => id === sessionId ? fallback.paneId : id) : visible.filter(id => id !== sessionId);
      this.commit(sessions, next, this.state.activePaneId === sessionId && remove && fallback ? fallback.paneId : this.state.activePaneId, { issue: null });
      this.loadAssignedSessions(new Set(visible));
      if (this.state.activePaneId) { this.activate(this.state.activePaneId, true); this.dependencies().committed(this.state.panes.find(p => p.paneId === this.state.activePaneId)!.id, true); }
    } catch (error) {
      if (epoch !== this.epoch || this.requests.get(sessionId) !== token) return;
      this.patch({ issue: { message: error instanceof Error ? error.message : 'Save failed. Retry before closing.', id: session.id, closePaneId: sessionId, closeSession: remove, options: {} } });
    }
  };
  closeOthers = async (keep?: string) => {
    for (const session of [...this.state.sessions]) {
      if (session.paneId === keep) continue;
      await this.closeSession(session.paneId);
      if (this.state.issue) break;
    }
  };
  history = async (direction: -1 | 1) => {
    const pane = this.state.panes.find(p => p.paneId === this.state.activePaneId); if (!pane) return;
    const index = pane.cursor + direction;
    if (index >= 0 && index < pane.history.length) await this.jump(pane.paneId, index);
  };
}
