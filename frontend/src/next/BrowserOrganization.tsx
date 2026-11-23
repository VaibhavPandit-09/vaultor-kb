import {useEffect, useState, type FormEvent} from 'react';
import AppModal from '../components/modals/AppModal';
import {collectionPaths} from './collections';

export type Collection = {id: string; name: string; parentId?: string | null};
export type Tag = {id: string; name: string; color: string};
export type BrowserOrganizationRequest = <T>(path: string, input?: Record<string, unknown>) => Promise<T>;

type DeletionReview = {review: string; collections: number; exclusive: number};

export function CollectionEditor({target, parent, groups, send, close, changed, dirty}: {
  target?: Collection;
  parent: string;
  groups: Collection[];
  send: BrowserOrganizationRequest;
  close: () => void;
  changed: (id: string) => void;
  dirty: () => boolean;
}) {
  const [creation] = useState(() => crypto.randomUUID());
  const [name, setName] = useState(target?.name ?? '');
  const [parentId, setParent] = useState(target ? target.parentId ?? '' : parent);
  const [review, setReview] = useState<DeletionReview>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const route = '/organization/collections/' + (target?.id ?? creation);
  const paths = collectionPaths(groups);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try { await action(); }
    catch (error) {setError(String(error));}
    finally {setBusy(false);}
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || busy) return;
    await run(async () => {
      const result = await send<Collection>(route, {operation: target ? 'update' : 'create',
        name, parentId: parentId || null,
        ...(target && {expectedName: target.name, expectedParentId: target.parentId ?? null})});
      changed(result.id);
    });
  }
  async function remove(trash: boolean, token: string) {
    if (trash && dirty()) {setError('Save or discard the browser edits before moving resources to Trash.'); return;}
    await run(async () => {
      setReview(undefined);
      await send(route, {operation: 'delete', review: token, trash});
      changed('');
    });
  }
  return <AppModal open title={target ? 'Manage collection' : 'New collection'} onClose={close}>
    {review ? <>
      <p>Remove {review.collections} collection{review.collections === 1 ? '' : 's'} in this branch. Resources shared with other collections and external originals stay in place.</p>
      <div className="next-recovery-actions">
        <button disabled={busy} onClick={() => setReview(undefined)}>Back</button>
        <button disabled={busy} onClick={() => void remove(false, review.review)}>Remove collections, keep resources</button>
        {!!review.exclusive && <button disabled={busy} onClick={() => void remove(true, review.review)}>
          Remove and move {review.exclusive} exclusive resources to Trash
        </button>}
      </div>
    </> : <form onSubmit={event => void save(event)}>
      <div className="browser-filters">
        <label>Name <input autoFocus required maxLength={240} value={name} onChange={e => setName(e.target.value)}/></label>
        <label>Parent collection <select value={parentId} onChange={e => setParent(e.target.value)}>
          <option value="">Top level</option>
          {groups.filter(group => group.id !== target?.id).map(group =>
            <option key={group.id} value={group.id}>{paths.get(group.id)}</option>)}
        </select></label>
      </div>
      <div className="next-recovery-actions">
        {target && <button type="button" disabled={busy} onClick={() => void run(async () => {
          setReview(await send<DeletionReview>(route, {operation: 'reviewDeletion'}));
        })}>Review collection removal</button>}
        <button disabled={busy || !name.trim()}>{target ? 'Save collection' : 'Create collection'}</button>
      </div>
    </form>}
    {error && <p role="alert">{error}</p>}
  </AppModal>;
}

export function TagsEditor({send, close, changed, assign, assigned = [], browse}: {
  send: BrowserOrganizationRequest;
  close: () => void;
  changed: () => void;
  assign?: (tag: Tag, value: boolean) => Promise<void>;
  assigned?: string[];
  browse?: (tag: Tag) => void;
}) {
  const [query, setQuery] = useState('');
  const [after, setAfter] = useState<string>();
  const [page, setPage] = useState<{items: Tag[]; next: string | null; exact: boolean}>();
  const [editing, setEditing] = useState<Tag>();
  const [name, setName] = useState('');
  const [color, setColor] = useState('#5887ee');
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [version, reload] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    const filter = new URLSearchParams({q: query});
    if (after) filter.set('after', after);
    void send<{items: Tag[]; next: string | null; exact: boolean}>('/organization/tags?' + filter)
      .then(result => {if (live) setPage(result);})
      .catch(error => {if (live) setError(String(error));});
    return () => {live = false;};
  }, [send, query, after, version]);
  const keep = async (operation: () => Promise<void>) => {
    setPending(true); setError('');
    try {await operation(); reload(value => value + 1); changed();}
    catch (error) {setError(String(error));}
    finally {setPending(false);}
  };
  const update = (tag?: Tag) => {
    setEditing(tag); setName(tag?.name ?? ''); setColor(tag?.color ?? '#5887ee'); setConfirm(false);
  };
  const expected = editing && {id: editing.id, expectedName: editing.name, expectedColor: editing.color};
  return <AppModal open title={assign ? 'Assign tags' : 'Manage tags'} onClose={close}>
    <div className="browser-filters">
      <input type="search" autoFocus aria-label="Search tags" placeholder="Search tags" value={query} maxLength={100}
        onChange={event => {setQuery(event.target.value); setAfter(undefined);}}/>
    </div>
    <div className="next-tag-options">
      {page?.items.map(tag => {
        const marked = assigned.includes(tag.id);
        return <button key={tag.id} type="button" disabled={pending} aria-pressed={assign ? marked : editing?.id === tag.id}
          onClick={() => assign ? void keep(() => assign(tag, !marked)) : update(tag)}>
          <span className="next-tag-chip"><i style={{background:tag.color}}/>{tag.name}</span>
          {assign && <small>{marked ? 'Assigned' : 'Add'}</small>}
        </button>;
      })}
    </div>
    {page && !page.items.length && <p>No matching tags.</p>}
    {after && <button onClick={() => setAfter(undefined)}>First tags</button>}
    {page?.next && <button onClick={() => setAfter(page.next ?? undefined)}>Next tags</button>}
    {assign ? query.trim() && page?.exact === false && <button disabled={pending} onClick={() => void keep(async () => {
      const tag = await send<{id: string}>('/organization/tags', {operation:'create', name:query, color});
      await assign({...tag, name: query, color}, true);
    })}>Create and assign {query.trim()}</button> :
      <form onSubmit={event => {
        event.preventDefault();
        if (!name.trim() || pending) return;
        void keep(async () => {
          await send('/organization/tags', {operation: editing ? 'update' : 'create', name, color, ...expected});
          update();
        });
      }}>
        <div className="browser-filters">
          <label>Tag name <input required maxLength={240} value={name} onChange={e => setName(e.target.value)}/></label>
          <label>Color <input type="color" value={color} onChange={e => setColor(e.target.value)}/></label>
          <button disabled={pending || !name.trim()}>{editing ? 'Save tag' : 'Create tag'}</button>
        </div>
        {editing && !confirm && <>
          {browse && <button type="button" onClick={() => browse(editing)}>Browse tagged resources</button>}
          <button type="button" onClick={() => update()}>New tag</button>
          <button type="button" onClick={() => setConfirm(true)}>Review tag removal</button>
        </>}
        {confirm && <div>
          <p>Remove this tag and all its assignments? The resources stay in the workspace.</p>
          <button type="button" onClick={() => setConfirm(false)}>Back</button>
          <button type="button" disabled={pending} onClick={() => void keep(async () => {
            await send('/organization/tags', {operation:'delete', ...expected}); update();
          })}>Remove tag</button>
        </div>}
      </form>}
    {error && <p role="alert">{error}</p>}
  </AppModal>;
}
