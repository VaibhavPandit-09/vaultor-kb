import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  Keyboard,
} from 'react-native';
import { Action } from './BrowseScreen';
import { presentation, type ResourceSummary } from './browse';
import {
  Organization,
  type Target,
  type ReferencePage,
  type LifecycleAction,
} from './organization';
import type { MobileWorkspace } from './workspace';
import { useThemeStyles } from './ui';
type Mode =
  | 'actions'
  | 'rename'
  | 'collections'
  | 'tags'
  | 'references'
  | 'add'
  | 'confirm'
  | 'delete-collection'
  | 'create-note';
export default function OrganizationSheet({
  model,
  target,
  close,
  completed,
}: {
  model: MobileWorkspace;
  target: Target;
  close(): void;
  completed?(ids: string[]): void;
}) {
  const s = useThemeStyles(styles),
    org = useRef(new Organization(model)).current;
  const [mode, setMode] = useState<Mode>(
    target.kind === 'new-collection' ? 'rename' : 'actions',
  );
  const [meta, setMeta] = useState<any>(),
    [name, setName] = useState(
      target.kind === 'new-collection' ? '' : target.title,
    ),
    [q, setQ] = useState(''),
    [page, setPage] = useState(0),
    [pages, setPages] = useState(0),
    [rows, setRows] = useState<any[]>([]),
    [refs, setRefs] = useState<ReferencePage>(),
    [direction, setDirection] = useState<'incoming' | 'outgoing'>('incoming'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [retry, setRetry] = useState(0),
    [messages, setMessages] = useState<Record<string, string>>({}),
    [review, setReview] = useState<
      { resource: ResourceSummary; sources: number }[]
    >([]),
    [action, setAction] = useState<LifecycleAction>('trash'),
    [keep, setKeep] = useState(false),
    [pendingName, setPendingName] = useState(false);
  const definitiveFailures = useRef(new Set<string>());
  const pending = useRef(false),
    mounted = useRef(true),
    counter = useRef(0);
  const resources =
    target.kind === 'bulk'
      ? target.resources ?? []
      : target.kind === 'resource'
      ? [
          meta ??
            target.resource ?? {
              id: target.id,
              title: target.title,
              type: 'unknown',
            },
        ]
      : [];
  useEffect(
    () => () => {
      mounted.current = false;
      counter.current++;
    },
    [],
  );
  const act = async (fn: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      if (mounted.current)
        setError(e instanceof Error ? e.message : 'Failed. Retry.');
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  useEffect(() => {
    let alive = true;
    if (target.kind === 'resource' || target.kind === 'collection') {
      void org
        .metadata(target)
        .then(r => {
          if (alive) setMeta(r);
        })
        .catch(e => {
          if (alive) setError(e.message);
        });
    }
    if (target.kind === 'new-collection') {
      void org
        .pending('collection:create')
        .then(p => {
          if (alive && p) {
            setName(p.body.name);
            setPendingName(true);
          }
        })
        .catch(e => {
          if (alive) setError(e.message);
        });
    }
    return () => {
      alive = false;
    };
  }, [org, target, retry]);
  useEffect(() => {
    const ticketRef = counter;
    const ticket = ++ticketRef.current;
    if (!['collections', 'tags', 'add', 'references'].includes(mode)) return;
    setLoading(true);
    setError('');
    const timer = setTimeout(() => {
      const request =
        mode === 'references'
          ? org.references(target.id, direction, page)
          : org.list(
              mode === 'collections'
                ? 'collections'
                : mode === 'tags'
                ? 'tags/browse'
                : 'resources',
              q,
              page,
            );
      void request
        .then(result => {
          if (counter.current !== ticket || !mounted.current) return;
          setRows(result.items);
          setPages(result.totalPages);
          if (mode === 'references') setRefs(result);
        })
        .catch(e => {
          if (counter.current === ticket && mounted.current)
            setError(e.message);
        })
        .finally(() => {
          if (counter.current === ticket && mounted.current) setLoading(false);
        });
    }, 180);
    return () => {
      clearTimeout(timer);
      ticketRef.current++;
    };
  }, [mode, q, page, direction, retry, org, target.id]);
  const go = (next: Mode) => {
    Keyboard.dismiss();
    counter.current++;
    setMode(next);
    setQ('');
    setPage(0);
    setRows([]);
    setError('');
    setMessages({});
  };
  const leave = () => {
    if (pending.current) return;
    Keyboard.dismiss();
    if (
      mode === 'confirm' &&
      review.length &&
      review.every(i => messages[i.resource.id] === 'Completed')
    )
      close();
    else if (mode !== 'actions' && target.kind !== 'new-collection')
      go('actions');
    else close();
  };
  const submitName = () =>
    void act(async () => {
      if (mode === 'create-note') {
        try {
          org.check();
          await model.createNote(name, target.id);
          close();
        } catch (e) {
          const p = await model.pendingCreation();
          if (p) {
            setName(p.title);
            setPendingName(true);
          }
          throw e;
        }
      } else if (target.kind === 'new-collection') {
        try {
          await org.createCollection(name);
          close();
        } catch (e) {
          const p = await org.pending('collection:create');
          if (p) {
            setName(p.body.name);
            setPendingName(true);
          }
          throw e;
        }
      } else {
        await org.rename(target, name, meta?.revision);
        close();
      }
    });
  const refreshMeta = async () => {
    if (target.kind === 'resource' || target.kind === 'collection')
      setMeta(await org.metadata(target));
  };
  const reviewAction = (which: LifecycleAction) => {
    setAction(which);
    setReview([]);
    go('confirm');
    void act(async () => {
      setReview(await org.review(resources, which));
    });
  };
  const member = (row: any, add: boolean, ids = resources.map(r => r.id)) =>
    void act(async () => {
      setMessages(m => ({ ...m, [row.id]: 'Pending…' }));
      try {
        await org.membership(ids, mode === 'add' ? target.id : row.id, add);
        setMessages(m => ({ ...m, [row.id]: add ? 'Added' : 'Removed' }));
        if (mode !== 'add') await refreshMeta();
      } catch (e) {
        setMessages(m => ({ ...m, [row.id]: 'Failed · tap to retry' }));
        throw e;
      }
    });
  const openRef = (row: any, occurrence?: any) =>
    void act(async () => {
      if (occurrence)
        await model.openOccurrence(
          direction === 'incoming' ? row.id : target.id,
          direction === 'incoming' ? row.revision : refs!.sourceRevision,
          occurrence.path,
          direction === 'incoming' ? target.id : row.id,
        );
      else await model.routeResource(row.id);
      close();
    });
  const execute = () =>
    void act(async () => {
      const succeeded: string[] = [];
      for (const item of review) {
        if (messages[item.resource.id] === 'Completed') continue;
        try {
          if (action === 'trash')
            await model.prepareResource(item.resource.id, keep);
          const result = await org.lifecycle(item.resource, action);
          const success = ['trashed', 'restored', 'purged'].includes(
            result.status,
          );
          setMessages(m => ({
            ...m,
            [item.resource.id]: success
              ? 'Completed'
              : result.status === 'cleanup-pending'
              ? 'Retry permanent deletion'
              : result.detail ?? 'Failed · retry',
          }));
          if (result.status === 'failed')
            definitiveFailures.current.add(item.resource.id);
          else definitiveFailures.current.delete(item.resource.id);
          if (success) succeeded.push(item.resource.id);
          if (result.warnings?.length) setError(result.warnings.join('\n'));
        } catch (e) {
          setMessages(m => ({
            ...m,
            [item.resource.id]:
              e instanceof Error ? e.message : 'Failed · retry',
          }));
        }
      }
      completed?.(succeeded);
    });
  const collection = target.kind === 'collection',
    trashed = Boolean(meta?.trashedAt),
    title =
      mode === 'actions'
        ? target.title
        : {
            rename:
              target.kind === 'new-collection' ? 'New collection' : 'Rename',
            collections: 'Collections',
            tags: 'Tags',
            references: 'References',
            add: 'Add resource',
            confirm:
              action === 'trash'
                ? 'Move originals to Trash'
                : action === 'restore'
                ? 'Restore originals'
                : 'Delete permanently',
            'delete-collection': 'Delete collection',
            'create-note': 'Create new note',
          }[mode];
  return (
    <Modal transparent animationType="none" onRequestClose={leave}>
      <View style={s.scrim}>
        <View style={s.panel} accessibilityViewIsModal>
          <View style={s.header}>
            {mode !== 'actions' && target.kind !== 'new-collection' ? (
              <Action
                label="‹"
                accessibilityLabel="Back to actions"
                disabled={busy}
                onPress={leave}
              />
            ) : null}
            <Text accessibilityRole="header" numberOfLines={2} style={s.title}>
              {title}
            </Text>
            <Action
              label="×"
              accessibilityLabel="Close actions"
              disabled={busy}
              onPress={close}
            />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={s.content}
          >
            {error ? (
              <View>
                <Text accessibilityRole="alert" style={s.error}>
                  {error}
                </Text>
                <Action
                  label="Retry loading"
                  disabled={busy}
                  onPress={() => setRetry(n => n + 1)}
                />
              </View>
            ) : null}
            {busy || loading ? (
              <Text accessibilityLiveRegion="polite" style={s.secondary}>
                {busy ? 'Working…' : 'Refreshing…'}
              </Text>
            ) : null}
            {mode === 'actions' ? (
              <View style={s.actions}>
                {target.kind === 'bulk' ? (
                  <Text style={s.secondary}>
                    {resources.length} selected resources
                  </Text>
                ) : (
                  <Text style={s.secondary}>
                    {collection
                      ? 'Collection'
                      : presentation(meta ?? { type: 'unknown' }).label}
                  </Text>
                )}
                {target.kind === 'resource' && meta && !trashed ? (
                  <Action
                    label={
                      presentation(meta).action === 'editor'
                        ? 'Open note'
                        : presentation(meta).action === 'preview'
                        ? 'Preview file'
                        : 'Check availability'
                    }
                    disabled={busy}
                    onPress={() =>
                      void act(async () => {
                        await model.routeResource(target.id);
                        close();
                      })
                    }
                  />
                ) : null}
                {collection ? (
                  <Action
                    label="Add resource"
                    disabled={busy || !meta}
                    onPress={() => go('add')}
                  />
                ) : null}
                {target.kind !== 'bulk' &&
                !trashed &&
                (collection || ['note', 'file'].includes(meta?.type)) ? (
                  <Action
                    label="Rename"
                    disabled={busy || !meta}
                    onPress={() => {
                      setName(collection ? meta.name : meta.title);
                      go('rename');
                    }}
                  />
                ) : null}
                {target.kind !== 'bulk' && !trashed ? (
                  <Action
                    label={meta?.favorite ? 'Unpin' : 'Pin'}
                    disabled={busy || !meta}
                    onPress={() =>
                      void act(async () => {
                        await org.pin(target, !meta.favorite);
                        await refreshMeta();
                      })
                    }
                  />
                ) : null}
                {!collection && !trashed ? (
                  <Action
                    label="Collections"
                    disabled={busy || !resources.length}
                    onPress={() => go('collections')}
                  />
                ) : null}
                {target.kind === 'resource' && !trashed ? (
                  <Action
                    label="Tags"
                    disabled={busy || !meta}
                    onPress={() => go('tags')}
                  />
                ) : null}
                {target.kind === 'resource' ? (
                  <Action
                    label="References"
                    disabled={busy || !meta}
                    onPress={() => go('references')}
                  />
                ) : null}
                {collection ? (
                  <Action
                    label="Delete collection…"
                    disabled={busy || !meta}
                    onPress={() => go('delete-collection')}
                  />
                ) : (
                  <>
                    {trashed || target.resources?.every(r => r.trashedAt) ? (
                      <>
                        <Action
                          label="Restore"
                          disabled={
                            busy || resources.some(r => r.cleanupPending)
                          }
                          onPress={() => reviewAction('restore')}
                        />
                        <Action
                          label={
                            meta?.cleanupPending
                              ? 'Retry permanent deletion…'
                              : 'Delete permanently…'
                          }
                          disabled={busy}
                          onPress={() => reviewAction('purge')}
                        />
                      </>
                    ) : (
                      <Action
                        label="Move to Trash…"
                        disabled={busy || !resources.length}
                        onPress={() => reviewAction('trash')}
                      />
                    )}
                  </>
                )}
              </View>
            ) : null}
            {mode === 'rename' || mode === 'create-note' ? (
              <>
                <Text style={s.secondary}>
                  {mode !== 'create-note' &&
                  (collection || target.kind === 'new-collection')
                    ? 'Collection name'
                    : 'Resource title'}
                </Text>
                <TextInput
                  accessibilityLabel="Name"
                  autoFocus
                  editable={!busy && !pendingName}
                  value={name}
                  onChangeText={setName}
                  maxLength={
                    mode !== 'create-note' &&
                    (collection || target.kind === 'new-collection')
                      ? 100
                      : 500
                  }
                  style={s.input}
                  returnKeyType="done"
                  onSubmitEditing={submitName}
                />
                {pendingName ? (
                  <Text style={s.secondary}>
                    Retry finishes the same pending creation.
                  </Text>
                ) : null}
                <Action
                  label={
                    mode === 'create-note'
                      ? 'Create note'
                      : target.kind === 'new-collection'
                      ? 'Create collection'
                      : 'Save name'
                  }
                  disabled={busy || !name.trim()}
                  onPress={submitName}
                />
              </>
            ) : null}
            {['collections', 'tags', 'add'].includes(mode) ? (
              <>
                <TextInput
                  accessibilityLabel="Find organization or resource"
                  placeholder="Search titles or names"
                  placeholderTextColor="#858585"
                  value={q}
                  onChangeText={v => {
                    setQ(v);
                    setPage(0);
                    setMessages({});
                  }}
                  style={s.input}
                  maxLength={100}
                />
                {mode === 'collections' &&
                target.kind === 'bulk' &&
                model.state.browse.collection ? (
                  <Action
                    label={
                      'Remove membership · ' +
                      model.state.browse.collection.name
                    }
                    disabled={busy}
                    onPress={() => {
                      const c = model.state.browse.collection!;
                      member(c, false);
                    }}
                  />
                ) : null}
                {mode === 'collections' && target.kind === 'resource'
                  ? (meta?.collections ?? []).map((c: any) => (
                      <View style={s.row} key={'member' + c.id}>
                        <Text style={s.rowTitle}>{c.name}</Text>
                        <Action
                          label="Remove membership"
                          disabled={busy}
                          onPress={() => member(c, false)}
                        />
                      </View>
                    ))
                  : null}
                {mode === 'tags' ? (
                  <>
                    <View style={s.actions}>
                      {(meta?.tags ?? []).map((tag: any) => (
                        <Action
                          key={tag.id}
                          label={tag.name + ' ×'}
                          accessibilityLabel={'Remove tag ' + tag.name}
                          disabled={busy}
                          onPress={() =>
                            void act(async () => {
                              await org.tag(target.id, tag.name, false, tag.id);
                              await refreshMeta();
                            })
                          }
                        />
                      ))}
                    </View>
                    {q.trim() ? (
                      <Action
                        label={'Add tag “' + q.trim() + '”'}
                        disabled={busy}
                        onPress={() =>
                          void act(async () => {
                            await org.tag(target.id, q, true);
                            await refreshMeta();
                          })
                        }
                      />
                    ) : null}
                  </>
                ) : null}
                {rows.map(row => {
                  const added =
                    mode === 'collections'
                      ? meta?.collections?.some((c: any) => c.id === row.id)
                      : mode === 'add'
                      ? row.collections?.some((c: any) => c.id === target.id)
                      : meta?.tags?.some((t: any) => t.id === row.id);
                  return (
                    <View key={row.id} style={s.row}>
                      <View style={s.rowText}>
                        <Text style={s.rowTitle}>
                          {mode === 'add'
                            ? presentation(row).icon + '  ' + row.title
                            : row.name}
                        </Text>
                        <Text style={s.secondary}>
                          {messages[row.id] ??
                            (added
                              ? 'Added'
                              : mode === 'add'
                              ? presentation(row).label
                              : '')}
                        </Text>
                      </View>
                      <Action
                        label={
                          added || messages[row.id] === 'Added'
                            ? 'Added'
                            : 'Add'
                        }
                        disabled={
                          busy ||
                          loading ||
                          added ||
                          messages[row.id] === 'Added'
                        }
                        onPress={() =>
                          mode === 'tags'
                            ? void act(async () => {
                                await org.tag(target.id, row.name, true);
                                await refreshMeta();
                              })
                            : member(
                                row,
                                true,
                                mode === 'add' ? [row.id] : undefined,
                              )
                        }
                      />
                    </View>
                  );
                })}
                {!rows.length && !loading ? (
                  <Text style={s.secondary}>No matches.</Text>
                ) : null}
                {mode === 'add' &&
                q.trim() &&
                !rows.some(
                  r =>
                    r.type === 'note' &&
                    r.title.toLowerCase() === q.trim().toLowerCase(),
                ) ? (
                  <Action
                    label={'Create note “' + q.trim() + '”'}
                    disabled={busy || loading}
                    onPress={() => {
                      setPendingName(false);
                      setName(q);
                      go('create-note');
                      void model.pendingCreation().then(p => {
                        if (p && mounted.current) {
                          setName(p.title);
                          setPendingName(true);
                        }
                      });
                    }}
                  />
                ) : null}
                {mode === 'add' ? (
                  <Action
                    label="Create new note…"
                    disabled={busy}
                    onPress={() => {
                      setPendingName(false);
                      setName(q);
                      go('create-note');
                      void model.pendingCreation().then(p => {
                        if (p && mounted.current) {
                          setName(p.title);
                          setPendingName(true);
                        }
                      });
                    }}
                  />
                ) : null}
              </>
            ) : null}
            {mode === 'references' ? (
              <>
                <View style={s.segment}>
                  <Action
                    label="Used in"
                    active={direction === 'incoming'}
                    disabled={busy}
                    onPress={() => {
                      if (direction === 'incoming') return;
                      setRows([]);
                      setRefs(undefined);
                      setLoading(true);
                      setDirection('incoming');
                      setPage(0);
                    }}
                  />
                  <Action
                    label="Links to"
                    active={direction === 'outgoing'}
                    disabled={busy}
                    onPress={() => {
                      if (direction === 'outgoing') return;
                      setRows([]);
                      setRefs(undefined);
                      setLoading(true);
                      setDirection('outgoing');
                      setPage(0);
                    }}
                  />
                </View>
                <Text style={s.secondary}>
                  Saved content · {refs?.totalItems ?? 0} resources ·{' '}
                  {refs?.totalOccurrences ?? 0} occurrences. Unsaved references
                  on other devices are not included.
                </Text>
                {rows.map(row => (
                  <View key={row.id} style={s.reference}>
                    <Action
                      label={
                        row.title + (row.available ? '' : ' · unavailable')
                      }
                      disabled={busy || loading || !row.available}
                      onPress={() => openRef(row)}
                    />
                    <Text style={s.secondary}>
                      {presentation(row).label} ·{' '}
                      {row.noteLinks +
                        row.fileLinks +
                        row.images +
                        row.otherLinks}{' '}
                      occurrences
                    </Text>
                    {row.occurrences?.map((o: any) => (
                      <Action
                        key={o.path}
                        label={
                          (o.kind === 'image' ? 'Image' : 'Link') +
                          ' · ' +
                          (o.label || 'Open occurrence')
                        }
                        disabled={
                          busy ||
                          loading ||
                          (direction === 'incoming' && !row.available)
                        }
                        onPress={() => openRef(row, o)}
                      />
                    ))}
                  </View>
                ))}
                {!rows.length && !loading ? (
                  <Text style={s.secondary}>No saved references.</Text>
                ) : null}
              </>
            ) : null}
            {['collections', 'tags', 'add', 'references'].includes(mode) &&
            pages > 1 ? (
              <View style={s.actions}>
                <Action
                  label="Previous"
                  disabled={busy || loading || page === 0}
                  onPress={() => setPage(p => p - 1)}
                />
                <Text style={s.secondary}>
                  {page + 1} / {pages}
                </Text>
                <Action
                  label="Next"
                  disabled={busy || loading || page + 1 >= pages}
                  onPress={() => setPage(p => p + 1)}
                />
              </View>
            ) : null}
            {mode === 'confirm' ? (
              <>
                <Text style={s.secondary}>
                  {action === 'purge'
                    ? 'Permanently deletes originals and their bytes. Referring notes keep broken links. This cannot be undone.'
                    : action === 'trash'
                    ? 'Trash affects the original everywhere. It does not remove a placement or only collection membership.'
                    : 'Restore keeps the original identity. Recovery drafts remain separate.'}{' '}
                  Saved usage excludes unsaved drafts.
                </Text>
                {review.map(item => (
                  <View key={item.resource.id} style={s.reference}>
                    <Text style={s.rowTitle}>{item.resource.title}</Text>
                    <Text style={s.secondary}>
                      {item.sources} active saved notes use this original
                    </Text>
                    <Text style={s.secondary}>
                      {messages[item.resource.id] ?? 'Ready'}
                    </Text>
                  </View>
                ))}
                {!review.length ? (
                  <>
                    <Action
                      label="Retry review"
                      disabled={busy}
                      onPress={() =>
                        void act(async () =>
                          setReview(await org.review(resources, action, keep)),
                        )
                      }
                    />
                    {action === 'trash' ? (
                      <Action
                        label="Keep protected drafts and review saved versions"
                        disabled={busy}
                        onPress={() =>
                          void act(async () => {
                            setKeep(true);
                            setReview(
                              await org.review(resources, action, true),
                            );
                          })
                        }
                      />
                    ) : null}
                  </>
                ) : (
                  <>
                    <Action
                      label={
                        action === 'purge'
                          ? 'Confirm permanent deletion / Retry'
                          : action === 'trash'
                          ? 'Confirm Trash / Retry'
                          : 'Confirm Restore / Retry'
                      }
                      disabled={
                        busy ||
                        review.every(
                          i => messages[i.resource.id] === 'Completed',
                        )
                      }
                      onPress={execute}
                    />
                    <Action
                      label={
                        action === 'trash'
                          ? 'Review latest revisions'
                          : 'Refresh Trash and review again'
                      }
                      disabled={
                        busy ||
                        review.every(
                          i => messages[i.resource.id] === 'Completed',
                        ) ||
                        review.some(
                          i =>
                            messages[i.resource.id] !== 'Completed' &&
                            (i.resource.cleanupPending ||
                              !definitiveFailures.current.has(i.resource.id)),
                        )
                      }
                      onPress={() =>
                        void act(async () => {
                          for (const i of review)
                            if (definitiveFailures.current.has(i.resource.id))
                              await org.reviewLatest(i.resource, action);
                          if (action !== 'trash') {
                            await model.organizationChanged();
                            close();
                            return;
                          }
                          const unfinished = review
                            .filter(
                              i => messages[i.resource.id] !== 'Completed',
                            )
                            .map(i => i.resource);
                          setMessages({});
                          definitiveFailures.current.clear();
                          setReview(await org.review(unfinished, action, keep));
                        })
                      }
                    />
                  </>
                )}
              </>
            ) : null}
            {mode === 'delete-collection' ? (
              <>
                <Text style={s.secondary}>
                  Deletes this collection and its memberships. Notes, files and
                  image originals survive.
                </Text>
                <Action
                  label="Delete collection"
                  disabled={busy}
                  onPress={() =>
                    void act(async () => {
                      await org.deleteCollection(target.id);
                      close();
                    })
                  }
                />
              </>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000099' },
  panel: {
    maxHeight: '90%',
    backgroundColor: '#0a0a0a',
    borderColor: '#333',
    borderWidth: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 8,
    borderBottomWidth: 1,
    borderColor: '#252525',
  },
  title: { flex: 1, fontSize: 21, fontWeight: '600', color: '#e8e8e8' },
  content: { padding: 18, paddingBottom: 32, gap: 12 },
  segment: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  actions: { gap: 8, alignItems: 'flex-start' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: '#252525',
  },
  rowText: { flex: 1 },
  rowTitle: { color: '#e8e8e8', fontSize: 16 },
  secondary: { color: '#b3b3b3', fontSize: 14 },
  input: {
    color: '#e8e8e8',
    minHeight: 52,
    borderBottomWidth: 1,
    borderColor: '#333',
  },
  error: { color: '#ffb4b4' },
  reference: {
    gap: 6,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: '#252525',
  },
});
