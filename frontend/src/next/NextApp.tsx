import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { open } from '@tauri-apps/plugin-dialog';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { FolderOpen, Plus, Library, Moon, PanelRight, X, BookOpen } from 'lucide-react';
import { SaveCoordinator } from '../lib/saveCoordinator';
import { SharedNoteDocuments } from '../lib/sharedNoteDocuments';
import { createThemeTransitionController, themeOriginAt } from '../lib/themeTransition';
import { motionProfile } from '../lib/motion';
import { command, type Note, type Snapshot, type Summary } from './client';
import NextEditor from './NextEditor';
import helpText from '../../../docs/help/next-foundation.md?raw';

export default function NextApp() {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [items, setItems] = useState<Summary[]>([]);
  const [collection, setCollection] = useState<string | null>(null);
  const [panes, setPanes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [help, setHelp] = useState(false);
  const [collectionName, setCollectionName] = useState<string | null>(null);
  const [, render] = useState(0);
  const notes = useRef(new Map<string, Note>());
  const documents = useRef(new SharedNoteDocuments());
  const theme = useRef(createThemeTransitionController());
  const currentCollection = useRef(collection); currentCollection.current = collection;
  const saves = useRef<SaveCoordinator<Note> | null>(null);
  const operating = useRef(false);
  const previousPanes = useRef(new Map<Element, DOMRect>());
  useLayoutEffect(() => {
    const next = new Map<Element, DOMRect>(); const animations: Animation[] = [];
    for (const element of document.querySelectorAll<HTMLElement>('.next-pane')) {
      const before = previousPanes.current.get(element), after = element.getBoundingClientRect();
      next.set(element, after);
      if (before && after.width && motionProfile().panel && before.width !== after.width) {
        animations.push(element.animate([{ transform: `translateX(${before.x - after.x}px) scaleX(${before.width / after.width})` }, { transform: 'none' }], { duration: motionProfile().panel, easing: 'ease-out' }));
      }
    }
    previousPanes.current = next;
    return () => animations.forEach(animation => animation.cancel());
  }, [panes]);
  if (!saves.current) saves.current = new SaveCoordinator(async (id, value) => {
    const existing = notes.current.get(id)!;
    const receipt = await command<{ revision: number }>({ kind: 'save', id, title: value.title, content: value.content, revision: existing.revision });
    existing.revision = receipt.revision;
  }, () => render(value => value + 1));
  const refresh = useCallback(async () => {
    const [state, list] = await Promise.all([command<Snapshot>({ kind: 'snapshot' }), command<Summary[]>({ kind: 'list', collection: currentCollection.current })]);
    setSnapshot(state); setItems(list); theme.current.apply(state.settings.theme ?? 'light');
  }, []);
  const guard = useCallback(async (action: () => Promise<void>) => {
    if (operating.current) return;
    operating.current = true;
    setBusy(true); setError('');
    try { await saves.current!.flushAll(); await action(); }
    catch (e) { setError(String(e)); }
    finally { operating.current = false; setBusy(false); }
  }, []);
  useEffect(() => { const controller = theme.current; void refresh().catch(e => setError(String(e))); return () => controller.dispose(); }, [refresh]);
  useEffect(() => {
    for (const id of notes.current.keys()) if (!panes.includes(id) && !saves.current!.latest(id)) {
      notes.current.delete(id); saves.current!.forget(id);
    }
  }, [panes]);
  useEffect(() => {
    let disposed = false; let remove: (() => void) | undefined;
    void getCurrentWindow().onCloseRequested(event => {
      event.preventDefault();
      void guard(async () => { await getCurrentWindow().destroy(); });
    }).then(unlisten => { if (disposed) unlisten(); else remove = unlisten; });
    const keyboard = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void guard(refresh); }
      if (event.key === 'F1') { event.preventDefault(); setHelp(value => !value); }
    };
    window.addEventListener('keydown', keyboard);
    return () => { disposed = true; remove?.(); window.removeEventListener('keydown', keyboard); };
  }, [guard, refresh]);
  const selectCollection = (id: string | null) => void guard(async () => {
    const list = await command<Summary[]>({ kind: 'list', collection: id });
    currentCollection.current = id; setCollection(id); setItems(list);
  });
  const openNote = (id: string, secondary = false) => void guard(async () => {
    if (!notes.current.has(id)) notes.current.set(id, await command<Note>({ kind: 'read', id }));
    setPanes(existing => secondary && existing.length ? [existing[0], id] : [id]);
    // Bound retained documents to the visible panes; no global document cache.
    for (const key of notes.current.keys()) if (key !== id && !(secondary && key === panes[0])) { notes.current.delete(key); saves.current!.forget(key); }
  });
  const update = (id: string, patch: Partial<Note>) => {
    const note = notes.current.get(id)!; Object.assign(note, patch);
    saves.current!.enqueue(id, { ...note }, 180); render(value => value + 1);
    if (patch.title !== undefined) setItems(list => list.map(item => item.id === id ? { ...item, title: patch.title! } : item));
  };
  const activeCollection = snapshot?.collections.find(c => c.id === collection);
  return <div className="next-shell" data-ready={!!snapshot}>
    <aside className="next-sidebar">
      <div className="next-brand">Vaultor <span>Next · M1</span></div>
      <button onClick={() => selectCollection(null)} aria-current={collection === null ? 'page' : undefined}><Library size={17} />Library</button>
      <div className="next-section"><span>Collections</span><button title="New collection" aria-label="New collection" disabled={busy} onClick={() => setCollectionName('')}><Plus size={16} /></button></div>
      {snapshot?.collections.map(c => <button key={c.id} aria-current={collection === c.id ? 'page' : undefined} onClick={() => selectCollection(c.id)}><FolderOpen size={16} />{c.name}</button>)}
      {collectionName !== null && <form onSubmit={event => { event.preventDefault(); void guard(async () => {
        await command({ kind: 'createCollection', name: collectionName }); setCollectionName(null); await refresh();
      }); }}><input aria-label="Collection name" autoFocus value={collectionName} onChange={e => setCollectionName(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setCollectionName(null); } }} /><button disabled={busy}>Create</button><button type="button" onClick={() => setCollectionName(null)}>Cancel</button></form>}
      <div className="next-sidebar-bottom">
        <button disabled={busy} onClick={() => void guard(async () => {
          const path = await open({ directory: true, multiple: false, title: 'Choose an empty folder or Vaultor Next workspace' });
          if (!path) return;
          const next = await command<Snapshot>({ kind: 'open', path });
          notes.current.clear(); documents.current.clear(); saves.current!.clear(); setPanes([]);
          currentCollection.current = null; setCollection(null); setSnapshot(next); await refresh();
        })}><FolderOpen size={17} />Open workspace</button>
        <button onClick={event => { const origin = themeOriginAt(event.currentTarget); void guard(async () => {
          const nextTheme = snapshot?.settings.theme === 'dark' ? 'light' : 'dark';
          await command({ kind: 'setting', key: 'theme', value: nextTheme });
          theme.current.apply(nextTheme, origin);
          setSnapshot(state => state && { ...state, settings: { ...state.settings, theme: nextTheme } });
        }); }}><Moon size={17} />Appearance</button>
        <button onClick={() => setHelp(value => !value)}><BookOpen size={17} />Milestone Help</button>
        <small title={snapshot?.path}>{snapshot?.path ?? 'Workspace unavailable'}</small>
      </div>
    </aside>
    <main className="next-main">
      <header className="next-header"><div><h1>{activeCollection?.name ?? 'Library'}</h1><small>{items.length} notes · experimental local workspace</small></div><button disabled={busy || !snapshot} onClick={() => void guard(async () => {
        const note = await command<Note>({ kind: 'createNote', title: 'Untitled note', collection });
        notes.current.set(note.id, note); setPanes([note.id]); await refresh();
      })}><Plus size={17} />New note</button></header>
      {error && <div role="alert" className="next-error">{error}<button onClick={() => void guard(refresh)}>Retry saves</button></div>}
      {!error && saves.current.failed() && <div role="alert" className="next-error">A note could not be saved. Your editor is retained.<button onClick={() => void guard(refresh)}>Retry saves</button></div>}
      {help ? <section className="next-help"><button onClick={() => setHelp(false)}>Close Help</button><ReactMarkdown>{helpText}</ReactMarkdown></section> : <div className={`next-workspace ${panes.length ? 'has-editor' : ''}`}>
        <nav className="next-library" aria-label="Notes">{items.map(item => <div key={item.id} className="next-resource" data-selected={panes.includes(item.id)}><button onClick={() => openNote(item.id)}>{item.title}</button><button aria-label={`Open ${item.title} beside`} title="Open beside" onClick={() => openNote(item.id, true)}><PanelRight size={15} /></button></div>)}{!items.length && <p>Create a note to start writing.</p>}</nav>
        <div className="next-panes">{panes.map((id, index) => {
          const note = notes.current.get(id); if (!note) return null;
          return <section key={`${index}-${id}`} className="next-pane" aria-label={`Editor pane ${index + 1}`}>
            <div className="next-note-bar"><input aria-label={`Note title ${index + 1}`} value={note.title} disabled={busy} maxLength={240} onChange={e => update(id, { title: e.target.value })} /><span role="status">{saves.current!.status(id)}</span><button aria-label="Close note" onClick={() => void guard(async () => { setPanes(list => list.filter((_, i) => i !== index)); await refresh(); })}><X size={16} /></button></div>
            <div className="next-document"><NextEditor note={note} pane={index} documents={documents.current} locked={busy} changed={content => update(id, { content })} /></div>
          </section>;
        })}</div>
      </div>}
    </main>
  </div>;
}
