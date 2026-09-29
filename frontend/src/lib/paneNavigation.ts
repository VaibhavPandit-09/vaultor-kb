import type { Resource } from '../types';
export type ReadingPosition = { scrollTop: number; scrollLeft: number; selection?: { from: number; to: number } };
export type Visit = { visitId: string; resourceId: string; title: string; unavailable?: boolean };
export class ResourceUnavailableError extends Error {}
const visit = (resource: Resource): Visit => ({ visitId: crypto.randomUUID(), resourceId: resource.id, title: resource.title });
export type Pane = { paneId: string; id: string; selection?: { from: number; to: number }; history: Visit[]; cursor: number; transition?: 'forward' | 'back' | 'replace' };
export type OpenIntent = { sourcePaneId?: string; destination?: 'here' | 'new'; intent?: 'direct' | 'link' | 'history'; historyIndex?: number; focus?: boolean; throwOnFailure?: boolean };
export type NavigationIssue = { message: string; id: string; options: OpenIntent; limit?: boolean; closePaneId?: string; unavailable?: boolean };
type State = { panes: Pane[]; activePaneId: string | null; issue: NavigationIssue | null; focusPaneId: string | null; motion: 'forward' | 'back' | 'replace' | 'switch' };
type Dependencies = { load: (id: string) => Promise<Resource | null>; save: (id: string) => Promise<void>; preview: (resource: Resource, sourcePaneId?: string) => void; committed: (id: string, focus: boolean) => void; max: number; behavior: 'split' | 'replace' };
/** Pane mutations commit only after loading and the source save barrier succeed. */
export class PaneNavigation {
  private state: State = { panes: [], activePaneId: null, issue: null, focusPaneId: null, motion: 'replace' };
  private positions = new Map<string, ReadingPosition>();
  private listeners = new Set<() => void>();
  private requests = new Map<string, number>();
  private dependencies: () => Dependencies;
  constructor(dependencies: () => Dependencies) { this.dependencies = dependencies; }
  snapshot = () => this.state;
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  private patch(patch: Partial<State>) { this.state = { ...this.state, ...patch }; const retained = new Set(this.state.panes.flatMap(p => p.history.map(v => v.visitId))); for (const id of this.positions.keys()) if (!retained.has(id)) this.positions.delete(id); this.listeners.forEach(fn => fn()); }
  update = (change: (panes: Pane[]) => Pane[]) => {
    const panes = change(this.state.panes);
    for (const pane of this.state.panes) if (!panes.some(p => p.paneId === pane.paneId)) this.requests.delete(pane.paneId);
    const activePaneId = panes.some(p => p.paneId === this.state.activePaneId) ? this.state.activePaneId : panes.at(-1)?.paneId ?? null;
    if (panes !== this.state.panes || activePaneId !== this.state.activePaneId) this.patch({ panes, activePaneId });
  };
  activate = (paneId: string, focus = false) => { this.focusSequence++; if (this.state.panes.some(p => p.paneId === paneId)) this.patch({ activePaneId: paneId, ...(paneId !== this.state.activePaneId ? { motion: 'switch' as const } : {}), ...(focus ? { focusPaneId: paneId } : {}) }); };
  focusHandled = (paneId: string) => { if (this.state.focusPaneId === paneId) this.patch({ focusPaneId: null }); };
  dismissIssue = () => this.patch({ issue: null });
  reset = () => { this.requests.clear(); this.patch({ panes: [], activePaneId: null, focusPaneId: null, issue: null }); };
  position = (visitId: string): ReadingPosition => this.positions.get(visitId) ?? { scrollTop: 0, scrollLeft: 0 };
  recordPosition = (paneId: string, visitId: string, position: Partial<ReadingPosition>) => {
    const pane = this.state.panes.find(p => p.paneId === paneId);
    if (pane?.history[pane.cursor]?.visitId !== visitId) return;
    this.positions.set(visitId, { ...this.position(visitId), ...position });
  };
  rename = (resourceId: string, title: string) => {
    if (!this.state.panes.some(p => p.history.some(v => v.resourceId === resourceId && v.title !== title))) return;
    this.update(panes => panes.map(p => ({ ...p, history: p.history.map(v => v.resourceId === resourceId ? { ...v, title } : v) })));
  };
  markUnavailable = (resourceId: string) => {
    this.update(panes => panes.map(p => ({ ...p, history: p.history.map(v => v.resourceId === resourceId ? { ...v, unavailable: true } : v) })));
  };
  jump = async (paneId: string, index: number) => {
    const pane = this.state.panes.find(p => p.paneId === paneId), target = pane?.history[index];
    if (!pane || !target || target.unavailable || index === pane.cursor) return;
    await this.open(target.resourceId, { sourcePaneId: paneId, destination: 'here', intent: 'history', historyIndex: index });
  };
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
    const destination = options.destination ?? (intent === 'direct' && dep.behavior === 'split' ? 'new' : 'here');
    const key = sourcePaneId ?? 'workspace', token = ++this.sequence;
    this.requests.set(key, token);
    const valid = () => this.requests.get(key) === token && (!source || this.state.panes.some(p => p.paneId === source.paneId && p.id === source.id));
    this.patch({ issue: null });
    try {
      const resource = await dep.load(id);
      if (!valid()) return;
      if (!resource) throw new Error('Resource could not be loaded.');
      if (resource.type !== 'note' && intent === 'history') throw new ResourceUnavailableError('This journey step is no longer a note.');
      if (resource.type !== 'note') { dep.preview(resource, sourcePaneId); return; }
      if (intent === 'link' && destination === 'here' && source?.id === id) return;
      // Direct reopening focuses an existing view, while linked navigation stays at its source.
      const existing = intent === 'direct' ? this.state.panes.find(p => p.id === id) : undefined;
      if (existing) { this.update(panes => panes.map(p => p.paneId === existing.paneId ? { ...p, history: [visit(resource)], cursor: 0, transition: 'replace' as const } : p)); const focus = this.focusSequence === focusToken; if (focus) this.activate(existing.paneId, options.focus !== false); dep.committed(id, focus); return; }
      if ((!source || destination === 'new') && this.state.panes.length >= dep.max) {
        this.patch({ issue: { message: 'Pane limit reached', id, options: { ...options, sourcePaneId }, limit: true } }); return;
      }
      if (source && destination === 'here') await dep.save(source.id);
      if (!valid()) return;
      // Capacity may have changed while another pane was loading/saving.
      if ((!source || destination === 'new') && this.state.panes.length >= this.dependencies().max) {
        this.patch({ issue: { message: 'Pane limit reached', id, options: { ...options, sourcePaneId }, limit: true } }); return;
      }
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
      this.patch({ panes: source && destination === 'here' ? this.state.panes.map(p => p.paneId === source.paneId ? pane : p) : [...this.state.panes, pane], ...(focus ? { motion: transition, activePaneId: pane.paneId, focusPaneId: options.focus === false ? null : pane.paneId } : {}) });
      dep.committed(id, focus);
    } catch (error) {
      if (!valid()) return;
      const unavailable = error instanceof ResourceUnavailableError;
      if (unavailable) this.markUnavailable(id);
      this.patch({ issue: { unavailable, message: error instanceof Error ? error.message : 'Navigation failed', id, options: { ...options, sourcePaneId } } });
      if (options.throwOnFailure) throw error;
    }
  };
  close = async (paneId: string) => {
    const pane = this.state.panes.find(p => p.paneId === paneId); if (!pane) return;
    const token = ++this.sequence; this.requests.set(paneId, token);
    this.patch({ issue: null });
    try {
      await this.dependencies().save(pane.id);
      if (this.requests.get(paneId) !== token) return;
      this.update(panes => panes.filter(p => p.paneId !== paneId));
      if (this.state.activePaneId) this.activate(this.state.activePaneId, true);
    } catch (error) {
      if (this.requests.get(paneId) !== token || !this.state.panes.some(p => p.paneId === paneId)) return;
      this.patch({ issue: { message: error instanceof Error ? error.message : 'Save failed. Retry before closing.', id: pane.id, closePaneId: paneId, options: { sourcePaneId: paneId, intent: 'link' } } });
    }
  };
  history = async (direction: -1 | 1) => {
    const pane = this.state.panes.find(p => p.paneId === this.state.activePaneId); if (!pane) return;
    const index = pane.cursor + direction;
    if (index >= 0 && index < pane.history.length) await this.jump(pane.paneId, index);
  };
}
