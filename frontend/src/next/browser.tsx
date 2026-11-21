import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, type JSONContent, type NodeViewProps} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {Table} from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Highlight from '@tiptap/extension-highlight';
import {BrowseHeading, BrowsePagination, BrowseRowSurface} from '../components/BrowsePresentation';
import SearchExcerpt from '../components/SearchExcerpt';
import {ManagedImage} from '../components/editor/ManagedImage';
import {ResourceLinkExtension} from '../components/editor/ResourceLinkDefinition';
import '../index.css';
import './next.css';
import './browser.css';

const base = '/api/next/browser/v1';
const uuid = /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
type Workspace = {id: string; name: string};
type Resource = {id: string; title: string; type: string; mimeType?: string; originalName?: string};
type Note = Resource & {revision: string; content: JSONContent};
type Group = {id: string; name: string};
type Hit = Resource | {resource: Resource; snippet?: {text: string; highlights: {start: number; end: number}[]}};
type Page<T> = {items: T[]; totalPages: number; totalItems: number};

class Refusal extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {...options, credentials: 'same-origin', redirect: 'error', cache: 'no-store'});
  if (!response.ok) {
    throw new Refusal(response.status, response.status === 401 ? 'Browser approval is required.' :
      response.status === 403 ? 'The host has withdrawn workspace access.' :
      response.status === 409 ? 'The saved revision changed or the desktop has a protected draft. Your edits are still here.' :
      response.status === 404 ? 'This resource is unavailable.' : 'The host could not complete the request.');
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

const original = (id: string, kind: 'raw' | 'preview') => base + '/resources/' + id + '/' + kind;

function BrowserImage({node}: NodeViewProps) {
  const id = String(node.attrs.resourceId ?? '');
  return <NodeViewWrapper>{uuid.test(id) ? <img src={original(id, 'preview')} loading="lazy"
    alt={String(node.attrs.alt ?? '')} /> : <span>Managed image unavailable</span>}</NodeViewWrapper>;
}

function BrowserLink({node, editor}: NodeViewProps) {
  const id = String(node.attrs.resourceId ?? '');
  return <NodeViewWrapper as="span" contentEditable={false}>
    {uuid.test(id) ? <button type="button" className="library-button" onClick={() => {
      editor.view.dom.dispatchEvent(new CustomEvent('browser-resource', {detail: id, bubbles: true}));
    }}>{node.attrs.label || 'Open resource'}</button> : <span>{node.attrs.label || 'Resource unavailable'}</span>}
  </NodeViewWrapper>;
}

/** Check that opening this schema keeps all original non-null content, including custom attributes. */
function retains(before: unknown, after: unknown): boolean {
  if (Array.isArray(before)) return Array.isArray(after) && before.length === after.length && before.every((v, i) => retains(v, after[i]));
  if (before && typeof before === 'object') {
    if (!after || typeof after !== 'object') return false;
    return Object.entries(before).every(([key, value]) =>
      value == null ? (after as Record<string, unknown>)[key] == null : retains(value, (after as Record<string, unknown>)[key]));
  }
  return before === after;
}

function BrowserNote({note, open, save, dirty}: {
  note: Note;
  open: (id: string) => void;
  save: (note: Note) => Promise<void>;
  dirty: (value: boolean) => void;
}) {
  const [title, setTitle] = useState(note.title);
  const [editable, setEditable] = useState(false);
  const [incompatible, setIncompatible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const root = useRef<HTMLElement>(null);
  const contentInvalid = useRef(false);
  const editor = useEditor({
    content: note.content,
    editable: false,
    enableContentCheck: true,
    extensions: [
      StarterKit.configure({link: {openOnClick: false, autolink: false}}),
      Table, TableRow, TableCell, TableHeader, TaskList, TaskItem.configure({nested: true}), Highlight,
      ManagedImage.extend({
        addNodeView() { return ReactNodeViewRenderer(BrowserImage); },
        addProseMirrorPlugins() { return []; },
      }),
      ResourceLinkExtension.extend({addNodeView() { return ReactNodeViewRenderer(BrowserLink); }}),
    ],
    onContentError() {
      contentInvalid.current = true;
      setIncompatible(true);
    },
    onUpdate() { dirty(true); },
  });
  useEffect(() => {
    const element = root.current;
    const handler = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      if (uuid.test(id)) open(id);
    };
    element?.addEventListener('browser-resource', handler);
    return () => element?.removeEventListener('browser-resource', handler);
  }, [open]);
  return <section ref={root} className="browser-reader">
    {editable ? <input aria-label="Note title" value={title} maxLength={240} onChange={event => {
      setTitle(event.target.value); dirty(true);
    }} /> : <h2>{note.title}</h2>}
    {incompatible && <p role="status">This note uses content that needs the desktop editor.</p>}
    <div className="browser-actions">
      {!editable ? <button className="library-button" disabled={!editor || incompatible} onClick={() => {
        if (!editor || contentInvalid.current || !retains(note.content, editor.getJSON())) {
          setIncompatible(true);
          return;
        }
        editor.setEditable(true);
        setEditable(true);
      }}>Edit note</button> : <button className="library-button" disabled={saving || !title.trim()} onClick={() => {
        if (!editor) return;
        setSaving(true);
        setError('');
        void save({...note, title, content: editor.getJSON()}).catch(e => setError(e.message)).finally(() => setSaving(false));
      }}>Save note</button>}
      {editable && <button className="library-button" disabled={saving} onClick={() => {
        editor?.commands.setContent(note.content, {emitUpdate: false});
        editor?.setEditable(false);
        setTitle(note.title); setEditable(false); setError(''); dirty(false);
      }}>Discard browser edits</button>}
    </div>
    {error && <p role="alert">{error}</p>}
    <EditorContent className="browser-document" editor={editor} />
  </section>;
}

function FilePreview({file}: {file: Resource}) {
  const mime = file.mimeType ?? '';
  const url = original(file.id, 'preview');
  return <section className="browser-reader">
    <h2>{file.title}</h2>
    <div className="browser-actions">
      <a className="library-button" href={original(file.id, 'raw')} download={file.originalName ?? file.title}>Download original</a>
      {mime === 'application/pdf' && <a className="library-button" href={url} target="_blank" rel="noopener noreferrer">Open PDF</a>}
    </div>
    {/^(image\/(png|jpeg|webp|gif))$/.test(mime) && <img src={url} alt={file.title} />}
    {/^(audio\/(mpeg|wav|ogg|mp4|flac))$/.test(mime) && <audio src={url} preload="metadata" controls />}
    {/^(video\/(webm|mp4))$/.test(mime) && <video src={url} preload="metadata" controls />}
  </section>;
}

export default function BrowserWorkspace() {
  const [workspace, setWorkspace] = useState<Workspace>();
  const [access, setAccess] = useState('');
  const [problem, setProblem] = useState('');
  const [query, setQuery] = useState('');
  const [includeContent, setIncludeContent] = useState(false);
  const [collection, setCollection] = useState('');
  const [collections, setCollections] = useState<Group[]>([]);
  const [page, setPage] = useState(0);
  const [version, invalidate] = useState(0);
  const [listing, setListing] = useState<Page<Hit>>();
  const [active, setActive] = useState('');
  const [resource, setResource] = useState<Resource | Note>();
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState('system');
  const dirty = useRef(false);
  const current = useRef('');
  const showError = useCallback((error: unknown) => {
    if (error instanceof Refusal && [401,403].includes(error.status)) {
      current.current = '';
      dirty.current = false;
      setListing(undefined); setCollections([]); setResource(undefined); setWorkspace(undefined); setActive('');
    }
    setProblem(error instanceof Error ? error.message : 'Connection unavailable.');
  }, []);
  const refresh = useCallback(async () => {
    const session = await request<{csrf: string}>('/api/access/session');
    const choices = await request<Workspace[]>(base + '/workspaces');
    setAccess(session.csrf);
    setWorkspace(choices[0]);
    setProblem(choices.length ? '' : 'Ask the host to grant this browser workspace access.');
  }, []);
  useEffect(() => { void Promise.resolve().then(refresh).catch(showError); }, [refresh, showError]);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => { document.documentElement.dataset.theme = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme; };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (dirty.current) event.preventDefault(); };
    addEventListener('beforeunload', guard);
    return () => removeEventListener('beforeunload', guard);
  }, []);
  const workspaceId = workspace?.id;
  const headers = useMemo(() => ({'X-Vaultor-Workspace': workspaceId ?? ''}), [workspaceId]);
  useEffect(() => {
    if (!workspaceId) return;
    const events = new EventSource(base + '/changes');
    events.addEventListener('reset', () => invalidate(value => value + 1));
    events.onerror = () => {
      void request(base + '/workspace/identity', {headers}).catch(error => {
        if (error instanceof Refusal && [401,403].includes(error.status)) events.close();
        showError(error);
      });
    };
    return () => events.close();
  }, [workspaceId, headers, showError]);
  useEffect(() => {
    if (!workspaceId) return;
    const control = new AbortController();
    void request<Page<Group>>(base + '/collections?size=100', {headers, signal: control.signal})
      .then(result => setCollections(result.items))
      .catch(error => { if (!control.signal.aborted) showError(error); });
    return () => control.abort();
  }, [workspaceId, headers, version, showError]);
  useEffect(() => {
    if (!workspaceId) return;
    const control = new AbortController();
    const timeout = setTimeout(() => {
      setLoading(true);
      const filters = new URLSearchParams({q: query.trim(), page: String(page), size: '30'});
      if (collection) filters.set('collection', collection);
      void request<Page<Hit>>(base + '/resources' + (includeContent && query.trim() ? '/query' : '') + '?' + filters,
        {headers, signal: control.signal}).then(setListing).catch(error => {
        if (!control.signal.aborted) showError(error);
      }).finally(() => { if (!control.signal.aborted) setLoading(false); });
    }, 180);
    return () => {control.abort(); clearTimeout(timeout);};
  }, [workspaceId, headers, query, page, collection, version, includeContent, showError]);
  useEffect(() => {
    if (!workspaceId || !active || dirty.current) return;
    const control = new AbortController();
    void request<Resource | Note>(base + '/resources/' + active, {headers, signal: control.signal})
      .then(result => {
        if (!dirty.current && current.current === result.id) setResource(result);
      }).catch(error => { if (!control.signal.aborted) { setResource(undefined); showError(error); } });
    return () => control.abort();
  }, [active, version, workspaceId, headers, showError]);
  const open = useCallback((id: string) => {
    if (dirty.current && !confirm('Discard the unsaved browser edits?')) return;
    dirty.current = false;
    current.current = id;
    setActive(id); setResource(undefined); setProblem('');
    invalidate(value => value + 1);
  }, []);
  async function save(note: Note) {
    try {
      const receipt = await request<{revision: number}>(base + '/notes/' + note.id, {
        method: 'PUT', headers: {...headers, 'X-Vaultor-CSRF': access, 'Content-Type': 'application/json'},
        body: JSON.stringify({title: note.title, content: note.content, revision: Number(note.revision)}),
      });
      if (current.current === note.id) {
        dirty.current = false;
        setResource({...note, revision: String(receipt.revision)});
      }
    } catch (error) {
      if (error instanceof Refusal && [401,403].includes(error.status)) showError(error);
      throw error;
    }
  }
  return <main className="vaultor-browser">
    <BrowseHeading title={workspace?.name ?? 'Vaultor Next'} kicker="Shared workspace"
      actions={<div className="browser-actions">
        <label>Appearance <select value={theme} onChange={event => setTheme(event.target.value)}>
          <option value="system">System</option><option value="light">Light</option>
          <option value="dark">Dark</option><option value="oled">OLED</option>
        </select></label>
        {access && <button className="library-button" onClick={() => {
          if (dirty.current && !confirm('Sign out and discard the unsaved browser edits?')) return;
          void request('/api/access/logout',{method:'POST',headers:{'X-Vaultor-CSRF':access}}).then(() => {
            dirty.current = false; location.replace('/access');
          }).catch(showError);
        }}>Sign out</button>}
      </div>} />
    {problem && <p role="alert">{problem} <button className="library-button" onClick={() => void refresh().catch(showError)}>Reconnect</button></p>}
    {!workspace && <a href="/access">Request browser approval</a>}
    {workspace && <div className="browser-columns">
      <section className="browser-library" aria-label="Library">
        <div className="browser-filters">
          <input type="search" aria-label="Search library" placeholder="Search library" value={query} maxLength={256}
            onChange={event => {setPage(0); setQuery(event.target.value);}} />
          <label><input type="checkbox" checked={includeContent} onChange={event => {setPage(0); setIncludeContent(event.target.checked);}} /> Saved content</label>
          <select aria-label="Collection" value={collection} onChange={event => {setPage(0); setCollection(event.target.value);}}>
            <option value="">All collections</option>
            {collections.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select>
        </div>
        {listing?.items.map(hit => {
          const resource = 'resource' in hit ? hit.resource : hit;
          return <BrowseRowSurface key={resource.id} className="next-resource" data-open={active === resource.id}
            resource={<button className="next-resource-open" onClick={() => open(resource.id)}>
              <span><strong>{resource.title}</strong>{'snippet' in hit && hit.snippet && <small><SearchExcerpt snippet={hit.snippet}/></small>}</span>
            </button>} />;
        })}
        {loading && <p role="status">Loading library…</p>}
        {!loading && listing && !listing.items.length && <p>No matching resources.</p>}
        {listing && <BrowsePagination page={page} totalPages={listing.totalPages} loading={loading} onPage={setPage} />}
      </section>
      {resource && ('content' in resource ?
        <BrowserNote key={resource.id + ':' + resource.revision} note={resource} open={open} save={save} dirty={value => { dirty.current = value; }} /> :
        <FilePreview file={resource} />)}
    </div>}
  </main>;
}
