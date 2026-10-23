import { useState } from 'react';
import { MoreHorizontal, X } from 'lucide-react';
import type { Pane } from '../lib/paneNavigation';
import LibraryPopover from './LibraryPopover';

/** Shares the sidebar's scroll owner; inactive sessions never mount an editor. */
export default function OpenNotes({ sessions, panes, activeId, onOpen, onSplit, onClose, onCloseOthers, canSplit }: {
  sessions: Pane[]; panes: Pane[]; activeId: string | null; canSplit: boolean;
  onOpen: (id: string) => void; onSplit: (id: string) => void;
  onClose: (sessionId: string) => void; onCloseOthers: (keep?: string) => void;
}) {
  const [query, setQuery] = useState('');
  if (!sessions.length) return null;
  const filtered = sessions.filter(p => p.history[p.cursor].title.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <section aria-label="Open notes" className="px-3 pb-2">
    <div className="flex items-center justify-between text-xs text-slate-400"><span>Open notes · {sessions.length}</span>
      <LibraryPopover label="Manage open notes" trigger={<MoreHorizontal size={14}/>}>
        {close => <button className="library-button" onClick={() => { close(); onCloseOthers(); }}>Close all notes</button>}
      </LibraryPopover>
    </div>
    {(sessions.length > 5 || query) && <input aria-label="Find open note" placeholder="Find open note…" className="my-1 w-full rounded border border-border bg-background px-2 py-1 text-xs" value={query} onChange={e=>setQuery(e.target.value)}/>}
    {filtered.map(session => {
      const title = session.history[session.cursor].title, paneIndex = panes.findIndex(p => p.paneId === session.paneId);
      return <div key={session.paneId} data-open-session={session.id} className="flex items-center gap-1">
        <button className="sidebar-nav min-w-0 flex-1" aria-current={activeId === session.paneId ? 'page' : undefined} onClick={()=>onOpen(session.id)} title={title}>
          <span className="truncate">{title}</span>{paneIndex >= 0 && <span className="ml-auto shrink-0 text-[10px] opacity-60">Pane {paneIndex+1}</span>}
        </button>
        <LibraryPopover label={'Session actions for '+title} trigger={<MoreHorizontal size={13}/>}>
          {close => <>
            {paneIndex < 0 && <button className="library-button" disabled={!canSplit} onClick={()=>{close();onSplit(session.id);}}>Open in another pane</button>}
            <button className="library-button" onClick={()=>{close();onCloseOthers(session.paneId);}}>Close other notes</button>
          </>}
        </LibraryPopover>
        <button className="rounded p-1 text-slate-400 hover:text-foreground focus-visible:outline-primary" aria-label={'Close '+title} onClick={()=>onClose(session.paneId)}><X size={13}/></button>
      </div>;
    })}
    {!filtered.length && <p className="py-1 text-xs text-slate-400">No matching open notes</p>}
  </section>;
}
