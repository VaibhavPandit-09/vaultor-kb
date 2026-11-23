import {useCallback, useEffect, useMemo, useRef, useState, type FormEvent} from 'react';
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
import LibraryPopover from '../components/LibraryPopover';
import {CollectionEditor, TagsEditor, type Collection, type Tag, type BrowserOrganizationRequest} from './BrowserOrganization';
import {createPortal} from 'react-dom';
import {collectionPaths} from './collections';
import '../index.css';
import './next.css';
import './browser.css';

const base = '/api/next/browser/v1';
const uuid = /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
type Workspace = {id: string; name: string};
type Resource = {id: string; title: string; type: string; revision: string; favorite: boolean;
  collections: Group[]; tags?: Tag[]; mimeType?: string; originalName?: string};
type Note = Resource & {revision: string; content: JSONContent};
type Group = {id: string; name: string};
type Hit = Resource | {resource: Resource; snippet?: {text: string; highlights: {start: number; end: number}[]}};
type Page<T> = {items: T[]; totalPages: number; totalItems: number};
type Change =
  | {operation: 'pin' | 'trash'; value: boolean}
  | {operation: 'membership'; collection: string; value: boolean}
  | {operation: 'rename'; title: string}
  | {operation: 'move'; from: string; to: string};

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

function NewNote({collection, collectionName, create}: {
  collection: string;
  collectionName?: string;
  create: (id: string, title: string, collection: string) => Promise<void>;
}) {
  const [form, setForm] = useState<{id: string; title: string; collection: string; collectionName?: string}>();
  const [submitting, setSubmitting] = useState(false);
  const [problem, setProblem] = useState<{text: string; retry: boolean}>();
  const trigger = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (!form && restoreFocus.current) {
      restoreFocus.current = false;
      trigger.current?.focus();
    }
  }, [form]);
  const close = () => {
    restoreFocus.current = true;
    setForm(undefined);
    setProblem(undefined);
  };
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form || !form.title.trim() || submitting || problem?.retry === false) return;
    setSubmitting(true);
    setProblem(undefined);
    void create(form.id, form.title.trim(), form.collection).then(close).catch(error => {
      const retry = !(error instanceof Refusal && error.status === 409);
      setProblem({retry, text: retry
        ? 'The host did not confirm creation. Retry to recover the same request.'
        : 'The destination collection is unavailable or the request conflicts. Cancel and select the destination again.'});
    }).finally(() => setSubmitting(false));
  }
  return form ? <form className="browser-filters" onSubmit={submit}>
    <label>Note title <input name="title" autoFocus required maxLength={240} value={form.title} disabled={submitting || !!problem}
      onChange={event => setForm({...form, title: event.target.value})}/></label>
    {form.collectionName && <span>In {form.collectionName}</span>}
    <button className="library-button" disabled={submitting || !form.title.trim() || problem?.retry === false}>
      {submitting ? 'Creating…' : problem?.retry ? 'Retry creation' : 'Create note'}
    </button>
    <button className="library-button" type="button" onClick={close} disabled={submitting}>Cancel</button>
    {problem && <p role="alert">{problem.text}</p>}
  </form> : <button ref={trigger} className="library-button" onClick={() => {
    setForm({id: crypto.randomUUID(), title: 'Untitled Note', collection, collectionName});
  }}>New note</button>;
}

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

function ResourceActions({resource, collections, selected, trashed, change, tags}: {
  resource: Resource; collections: Group[]; selected: string; trashed: boolean;
  change: (resource: Resource, change: Change) => Promise<void>;
  tags: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [destination, setDestination] = useState('');
  const [title, setTitle] = useState<string>();
  const owned = new Set((resource.collections ?? []).map(group => group.id));
  async function submit(action: Change) {
    if (pending) return;
    setPending(true);
    try { await change(resource, action); }
    finally { setPending(false); }
  }
  return <LibraryPopover label={'Organize ' + resource.title} trigger="Organize">
    {close => {
      const run = (action: Change) => { close(); setTitle(undefined); void submit(action); };
      if (trashed) return <button type="button" disabled={pending}
        className="library-button" onClick={() => run({operation: 'trash', value: false})}>Restore from Trash</button>;
      return <div className="browser-organization">
        {title === undefined ? <button type="button" className="library-button" disabled={pending}
          onClick={() => setTitle(resource.title)}>Rename resource</button> :
          <form onSubmit={event => { event.preventDefault(); if (title.trim()) run({operation: 'rename', title}); }}>
            <label>Resource title <input autoFocus required maxLength={240} value={title}
              onChange={event => setTitle(event.target.value)}/></label>
            <button className="library-button" disabled={pending || !title.trim() || title.trim() === resource.title}>Save name</button>
            <button className="library-button" type="button" onClick={() => setTitle(undefined)}>Cancel rename</button>
          </form>}
        <button type="button" className="library-button" disabled={pending}
          onClick={() => run({operation: 'pin', value: !resource.favorite})}>
          {resource.favorite ? 'Unpin' : 'Pin'}
        </button>
        <button type="button" className="library-button" onClick={() => {close(); tags();}}>Assign tags…</button>
        {collections.length > 0 && <>
          <label>Destination collection <select value={destination} onChange={event => setDestination(event.target.value)}>
            <option value="">Choose collection</option>
            {collections.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select></label>
          <button type="button" className="library-button" disabled={pending || !destination}
            onClick={() => run({operation: 'membership', collection: destination, value: !owned.has(destination)})}>
            {owned.has(destination) ? 'Remove from collection' : 'Add to collection'}
          </button>
          {selected && owned.has(selected) && <button type="button" className="library-button" disabled={pending || !destination || destination === selected}
            onClick={() => run({operation: 'move', from: selected, to: destination})}>Move from current collection</button>}
        </>}
        <button type="button" className="library-button" disabled={pending} onClick={() => {
          if (confirm('Move this resource to Trash?')) run({operation: 'trash', value: true});
        }}>Move to Trash</button>
      </div>;
    }}
  </LibraryPopover>;
}

export default function BrowserWorkspace() {
  const [workspace, setWorkspace] = useState<Workspace>();
  const [access, setAccess] = useState('');
  const [problem, setProblem] = useState('');
  const [query, setQuery] = useState('');
  const [includeContent, setIncludeContent] = useState(false);
  const [view, setView] = useState<'library' | 'pinned' | 'trash'>('library');
  const [collection, setCollection] = useState('');
  const [collections, setCollections] = useState<Collection[]>([]);
  const [collectionEditor, setCollectionEditor] = useState<{target?: Collection}>();
  const [tagEditor, setTagEditor] = useState<{target?: Resource}>();
  const [filteredTag, setFilteredTag] = useState<Tag>();
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
      setCollectionEditor(undefined); setTagEditor(undefined); setFilteredTag(undefined);
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
  const organization = useCallback<BrowserOrganizationRequest>(async (path, input) => {
    try {
      return await request(base + path, input ? {
        method: 'PUT', headers: {...headers, 'X-Vaultor-CSRF': access, 'Content-Type': 'application/json'},
        body: JSON.stringify(input),
      } : {headers});
    } catch (error) {
      if (error instanceof Refusal && [401,403].includes(error.status)) showError(error);
      if (error instanceof Refusal && error.status === 409) {
        invalidate(value => value + 1);
        throw new Error('The workspace organization changed or a protected draft blocks the action. Review current information and try again.');
      }
      throw error;
    }
  }, [access, headers, showError]);
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
    void request<Page<Collection>>(base + '/collections?size=100', {headers, signal: control.signal})
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
      if (filteredTag) filters.set('tag', filteredTag.id);
      if (view === 'pinned') filters.set('favorites', 'true');
      const route = view === 'trash' ? '/trash' : includeContent && query.trim() ? '/query' : '';
      void request<Page<Hit>>(base + '/resources' + route + '?' + filters,
        {headers, signal: control.signal}).then(setListing).catch(error => {
        if (!control.signal.aborted) showError(error);
      }).finally(() => { if (!control.signal.aborted) setLoading(false); });
    }, 180);
    return () => {control.abort(); clearTimeout(timeout);};
  }, [workspaceId, headers, query, page, collection, version, includeContent, view, filteredTag, showError]);
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
  async function create(id: string, title: string, destination: string) {
    const previous = current.current;
    try {
      const receipt = await request<{id: string}>(base + '/note-creates/' + id, {
        method: 'PUT',
        headers: {...headers, 'X-Vaultor-CSRF': access, 'Content-Type': 'application/json'},
        body: JSON.stringify({title, collection: destination || null}),
      });
      if (!dirty.current && current.current === previous) open(receipt.id);
      else invalidate(value => value + 1);
    } catch (error) {
      if (error instanceof Refusal && [401,403].includes(error.status)) showError(error);
      throw error;
    }
  }
  async function organize(resource: Resource, change: Change) {
    if ((change.operation === 'rename' || (change.operation === 'trash' && change.value)) &&
        current.current === resource.id && dirty.current) {
      setProblem('Save or discard the browser edits before renaming or moving this resource to Trash.');
      return;
    }
    try {
      await request(base + '/resources/' + resource.id + '/organization', {
        method: 'PUT',
        headers: {...headers, 'X-Vaultor-CSRF': access, 'Content-Type': 'application/json'},
        body: JSON.stringify({...change, revision: Number(resource.revision)}),
      });
      if (change.operation === 'trash' && change.value && current.current === resource.id && !dirty.current) {
        current.current = '';
        setActive('');
        setResource(undefined);
      }
      setProblem('');
      invalidate(value => value + 1);
    } catch (error) {
      if (error instanceof Refusal && error.status === 409) {
        setProblem('The resource changed or has a protected draft. Review its current state and try again.');
        invalidate(value => value + 1);
      } else showError(error);
    }
  }
  const paths = collectionPaths(collections);
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
        {view !== 'trash' && <NewNote key={workspace.id} collection={collection} collectionName={collections.find(group => group.id === collection)?.name} create={create}/>}
        <div className="browser-filters">
          <select aria-label="Library view" value={view} onChange={event => {
            setListing(undefined); setPage(0); setCollection(''); setFilteredTag(undefined); setView(event.target.value as typeof view);
          }}>
            <option value="library">Library</option>
            <option value="pinned">Pinned</option>
            <option value="trash">Trash</option>
          </select>
          <input type="search" aria-label="Search library" placeholder="Search library" value={query} maxLength={256}
            onChange={event => {setPage(0); setQuery(event.target.value);}} />
          {view !== 'trash' && <label><input type="checkbox" checked={includeContent} onChange={event => {setPage(0); setIncludeContent(event.target.checked);}} /> Saved content</label>}
          {view !== 'trash' && <select aria-label="Collection" value={collection} onChange={event => {setPage(0); setCollection(event.target.value);}}>
            <option value="">All collections</option>
            {collections.map(group => <option key={group.id} value={group.id}>{paths.get(group.id)}</option>)}
          </select>}
          {view === 'library' && <>
            <button className="library-button" onClick={() => setCollectionEditor({})}>New collection</button>
            {collections.some(group => group.id === collection) && <button className="library-button"
              onClick={() => setCollectionEditor({target: collections.find(group => group.id === collection)})}>Manage collection</button>}
            <button className="library-button" onClick={() => setTagEditor({})}>Manage tags</button>
            {filteredTag && <button className="library-button" onClick={() => {setFilteredTag(undefined); setPage(0);}}>Clear tag {filteredTag.name}</button>}
          </>}
        </div>
        {listing?.items.map(hit => {
          const resource = 'resource' in hit ? hit.resource : hit;
          return <BrowseRowSurface key={resource.id} className="next-resource" data-open={active === resource.id}
            actions={<ResourceActions resource={resource} collections={collections} selected={collection} trashed={view === 'trash'} change={organize} tags={() => setTagEditor({target: resource})}/>}
            resource={view === 'trash' ? <span>{resource.title}</span> : <button className="next-resource-open" onClick={() => open(resource.id)}>
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
    {workspace && collectionEditor && createPortal(<CollectionEditor target={collectionEditor.target} parent={collection}
      groups={collections} send={organization} dirty={() => dirty.current} close={() => setCollectionEditor(undefined)}
      changed={id => {setCollectionEditor(undefined); setCollection(id); setPage(0); invalidate(value => value + 1);}}/>, document.body)}
    {workspace && tagEditor && createPortal(<TagsEditor send={organization} close={() => setTagEditor(undefined)}
      changed={() => invalidate(value => value + 1)}
      browse={tag => {setTagEditor(undefined); setFilteredTag(tag); setCollection(''); setView('library'); setPage(0);}}
      assigned={tagEditor.target?.tags?.map(tag => tag.id)}
      assign={tagEditor.target ? async (tag, value) => {
        const target = tagEditor.target!;
        const updated = await organization<Resource>('/resources/' + target.id + '/organization',
          {operation:'tag', tag:tag.id, value, revision:Number(target.revision)});
        setTagEditor({target: updated});
      } : undefined}/>, document.body)}
  </main>;
}
