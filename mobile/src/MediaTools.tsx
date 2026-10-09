import { useThemeStyles } from './ui';
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  Modal,
  NativeEventEmitter,
  NativeModules,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Alert,
  Keyboard,
} from 'react-native';
import { Action, ChoiceSheet } from './BrowseScreen';
import type { MobileWorkspace } from './workspace';
import type { bridgeMessage } from './bridge';
import {
  MediaQueue,
  normalizePlacement,
  hasPlacement,
  type MediaInput,
  type Placement,
} from './media';
const native = NativeModules.VaultorNative;
const call = async <T,>(action: string, value: object = {}) =>
  JSON.parse(await native.media(action, JSON.stringify(value))) as T;
export type MediaHandle = {
  receive(message: NonNullable<ReturnType<typeof bridgeMessage>>): void;
  pending(): number;
  open(): void;
};
export default forwardRef<
  MediaHandle,
  {
    model: MobileWorkspace;
    loadId: string;
    visible: boolean;
    send(value: object): void;
  }
>(function MediaTools({ model, loadId, visible, send }, ref) {
  const s = useThemeStyles(sheetStyles);
  const current = useRef({ model, loadId, send });
  current.current = { model, loadId, send };
  const [items, setItems] = useState<MediaInput[]>([]),
    [menu, setMenu] = useState(false),
    [inputs, setInputs] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<
      { anchor: string; attrs: Placement } | undefined
    >(),
    [existing, setExisting] = useState(false),
    [query, setQuery] = useState(''),
    [matches, setMatches] = useState<{ id: string; title: string }[]>([]),
    [page, setPage] = useState(0),
    [pages, setPages] = useState(0),
    [searchRetry, setSearchRetry] = useState(0);
  const [more, setMore] = useState(false);
  const pick = useRef<
      | { kind: string; replacement?: { anchor: string; attrs: Placement } }
      | undefined
    >(undefined),
    existingId = useRef('');
  const queue = useRef(
    new MediaQueue({
      call,
      current() {
        const c = current.current,
          s = c.model.snapshot();
        return {
          host: s.host,
          scope: s.scope,
          noteId: s.note?.id,
          loadId: c.loadId,
          editable:
            s.supported &&
            !s.conflict &&
            !s.unavailable &&
            s.connection !== 'revoked',
        };
      },
      send(value) {
        current.current.send({ ...value, loadId: current.current.loadId });
      },
      protect: () => current.current.model.protect(),
    }),
  ).current;
  const refresh = () =>
    void call<MediaInput[]>('list')
      .then(setItems)
      .catch((e: Error) => setError(e.message));
  useEffect(() => {
    refresh();
    const subscription = new NativeEventEmitter(native).addListener(
      'VaultorMediaInputs',
      (...args) => {
        const message = String(args[0]);
        if (message !== 'changed') setError(message);
        refresh();
        setInputs(true);
      },
    );
    return () => {
      subscription.remove();
      queue.cancel();
    };
  }, [queue]);
  useEffect(() => {
    queue.cancel();
    setSelected(undefined);
  }, [loadId, queue]);
  useEffect(() => {
    if (!existing) return;
    let active = true;
    const state = model.snapshot();
    const timer = setTimeout(() => {
      if (state.host)
        void native
          .browseApiFor(
            state.host.hostId,
            state.host.epoch,
            '/resources?page=' +
              page +
              '&size=100&type=file&category=image&sort=title&q=' +
              encodeURIComponent(query),
          )
          .then((raw: string) => {
            const response = JSON.parse(raw);
            if (response.status !== 200)
              throw Error('Image search failed. Retry.');
            const result = JSON.parse(response.body);
            if (active) {
              setMatches(result.items);
              setPages(result.totalPages);
            }
          })
          .catch((e: Error) => {
            if (active) setError(e.message);
          });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [existing, query, page, model, searchRetry]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Media failed. Retry.');
      if (!selected && !existing) setInputs(true);
    } finally {
      setBusy(false);
      refresh();
    }
  };
  const scope = () => {
    const state = model.snapshot();
    if (!state.host) throw Error('Connect to your host first.');
    return { ...state.host, scope: state.scope };
  };
  const insert = async (list: MediaInput[], anchor: string) => {
    await queue.insert(list, anchor);
  };
  const receivePick = async (
    kind: string,
    anchor: string,
    replacement?: { anchor: string; attrs: Placement },
  ) => {
    const state = model.snapshot(),
      sourceLoad = loadId;
    if (!state.note || !state.host) throw Error('Open a source note first.');
    const list = await call<MediaInput[]>(kind);
    for (const item of list)
      await call('bind', {
        id: item.id,
        binding: {
          hostId: state.host.hostId,
          scope: state.scope,
          noteId: state.note.id,
          anchor,
          loadId: sourceLoad,
        },
      });
    if (
      current.current.loadId !== sourceLoad ||
      model.snapshot().scope !== state.scope ||
      model.snapshot().host?.epoch !== state.host.epoch
    )
      throw Error(
        'Source changed while choosing files. Inputs retained for the original note.',
      );
    if (replacement) await replace(list, replacement);
    else await insert(list, anchor);
  };
  const choose = (
    kind: string,
    replacement?: { anchor: string; attrs: Placement },
  ) => {
    setMenu(false);
    if (kind === 'existing') {
      setExisting(true);
      return;
    }
    if (kind === 'pending') {
      setInputs(true);
      return;
    }
    const s = model.snapshot();
    if (!s.note || !s.supported || s.conflict || s.unavailable) {
      setError('Open an editable note before inserting.');
      setInputs(true);
      return;
    }
    pick.current = { kind, replacement };
    send({ type: 'mediaAnchor', loadId, anchor: 'a-' + Date.now() });
  };
  const replace = async (
    list: MediaInput[],
    target: { anchor: string; attrs: Placement },
  ) => {
    if (list.length !== 1 || !list[0].image)
      throw Error('Choose one supported image for replacement.');
    const item = list[0],
      state = model.snapshot();
    if (!state.note) throw Error('Source note closed.');
    const binding = {
      hostId: state.host!.hostId,
      scope: state.scope,
      noteId: state.note.id,
      anchor: target.anchor,
      loadId,
    };
    await call('bind', { id: item.id, binding });
    const uploaded = await call<MediaInput>('upload', {
      id: item.id,
      ...scope(),
    });
    if (current.current.loadId !== loadId)
      throw Error('Source changed. Original retained.');
    await queue.commit(item.id, {
      type: 'mediaEdit',
      loadId,
      anchor: target.anchor,
      attrs: { ...target.attrs, resourceId: uploaded.resourceId },
    });
    setSelected(undefined);
  };
  useImperativeHandle(ref, () => ({
    open() {
      if (visible) setMenu(true);
    },
    pending: () => items.length,
    receive(m) {
      if (m.type === 'mediaThumbnail' && m.resourceId && m.token) {
        const requestLoad = loadId;
        void call<{ data: string }>('thumbnail', {
          ...scope(),
          resourceId: m.resourceId,
        })
          .then(result => {
            if (current.current.loadId === requestLoad)
              send({
                type: 'mediaThumbnail',
                loadId: requestLoad,
                token: m.token,
                resourceId: m.resourceId,
                data: result.data,
              });
          })
          .catch(() => {
            if (current.current.loadId === requestLoad)
              send({
                type: 'mediaThumbnail',
                loadId: requestLoad,
                token: m.token,
                resourceId: m.resourceId,
              });
          });
      } else if (m.type === 'mediaSelect' && m.anchor && m.attrs) {
        setMore(false);
        send({ type: 'blur', loadId });
        Keyboard.dismiss();
        setSelected({ anchor: m.anchor, attrs: normalizePlacement(m.attrs) });
      } else if (m.type === 'mediaInserted' && m.inputId)
        void queue.inserted(m.inputId, m.valid === true);
      else if (m.type === 'mediaPick' && m.anchor) {
        void run(() =>
          receivePick(
            m.kind === 'clipboard' ? 'clipboard' : 'photos',
            m.anchor!,
          ),
        );
      } else if (m.type === 'mediaAnchored' && m.anchor) {
        const p = pick.current;
        pick.current = undefined;
        if (!p) return;
        void run(async () => {
          if (p.kind === 'existingInsert') {
            const id = JSON.parse(await native.uuid()).id;
            if (current.current.loadId !== loadId) return;
            send({
              type: 'mediaInsert',
              loadId,
              anchor: m.anchor,
              inputId: id,
              image: true,
              resourceId: existingId.current,
            });
            return;
          }
          if (p.kind === 'insert') {
            await insert(
              items.filter(i => i.id === pendingId.current),
              m.anchor!,
            );
            return;
          }
          await receivePick(p.kind, m.anchor!, p.replacement);
        });
      }
    },
  }));
  const pendingId = useRef('');
  const edit = () => {
    if (selected) {
      send({
        type: 'mediaEdit',
        loadId,
        anchor: selected.anchor,
        attrs: normalizePlacement(selected.attrs),
      });
      setSelected(undefined);
    }
  };
  const state = model.snapshot(),
    editable =
      state.supported &&
      !state.conflict &&
      !state.unavailable &&
      state.connection !== 'revoked';
  const original = (name: string) => {
    if (selected)
      void run(async () => {
        const h = model.snapshot().host!,
          result = JSON.parse(
            await native.apiFor(
              h.hostId,
              h.epoch,
              '/resources/' + selected.attrs.resourceId + '/summary',
              'GET',
              null,
              null,
            ),
          );
        if (result.status !== 200) throw Error('Original unavailable. Retry.');
        const value = JSON.parse(result.body);
        await call(name, {
          ...scope(),
          resourceId: selected.attrs.resourceId,
          title: value.title,
          mime: value.mimeType,
        });
      });
  };
  return (
    <>
      {items.length ? (
        <Action
          label={'Pending inputs ' + items.length}
          onPress={() => setInputs(true)}
        />
      ) : null}
      {error ? (
        <Text accessibilityLiveRegion="polite" style={s.error}>
          {error}
        </Text>
      ) : null}
      {busy ? (
        <Text style={s.muted}>
          Preparing / uploading… Text saves remain available.
        </Text>
      ) : null}
      {menu ? (
        <ChoiceSheet
          title="Add to this note"
          close={() => setMenu(false)}
          choices={[
            { value: 'photos', label: 'Photos' },
            { value: 'files', label: 'Files' },
            { value: 'camera', label: 'Take photo' },
            { value: 'clipboard', label: 'Paste clipboard image' },
            { value: 'existing', label: 'Existing image' },
            { value: 'pending', label: 'Pending/shared inputs' },
          ]}
          onChoose={choose}
        />
      ) : null}
      {inputs ? (
        <Modal
          transparent
          animationType="fade"
          onRequestClose={() => setInputs(false)}
        >
          <View style={s.scrim}>
            <View style={s.panel}>
              <Text style={s.title}>Pending / shared inputs</Text>
              <Text style={s.muted}>
                Choose a source note, then Insert here. Failed uploads retain
                their original bytes and identity.
              </Text>
              {error ? <Text style={s.error}>{error}</Text> : null}
              <ScrollView>
                {items.map(item => {
                  const state = model.snapshot(),
                    belongs =
                      !item.binding ||
                      (item.binding.scope === state.scope &&
                        item.binding.noteId === state.note?.id);
                  const already =
                    !!item.resourceId &&
                    hasPlacement(state.content, item.resourceId);
                  return (
                    <View key={item.id} style={s.row}>
                      <Text style={s.text}>
                        {item.title} ·{' '}
                        {item.bytes
                          ? Math.round(item.bytes / 1024) + ' KB'
                          : 'Text'}
                        {item.resourceId ? ' · Uploaded' : ''}
                        {already ? ' · Already in this note' : ''}
                      </Text>
                      {!belongs ? (
                        <Text style={s.muted}>
                          Reopen its original host/workspace/source note to
                          insert.
                        </Text>
                      ) : null}
                      <View style={s.actions}>
                        <Action
                          label={
                            item.resourceId
                              ? 'Insert here'
                              : 'Upload and insert'
                          }
                          disabled={
                            busy ||
                            !belongs ||
                            already ||
                            !state.note ||
                            !state.supported
                          }
                          onPress={() => {
                            pendingId.current = item.id;
                            choose('insert');
                          }}
                        />
                        <Action
                          label="Remove pending input"
                          disabled={busy}
                          onPress={() =>
                            void run(async () => {
                              await call('remove', { id: item.id });
                            })
                          }
                        />
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
              {!items.length ? (
                <Text style={s.muted}>No pending inputs.</Text>
              ) : null}
              <Action label="Close inputs" onPress={() => setInputs(false)} />
            </View>
          </View>
        </Modal>
      ) : null}
      {selected ? (
        <Modal
          transparent
          animationType="fade"
          onShow={() => Keyboard.dismiss()}
          onRequestClose={() => setSelected(undefined)}
        >
          <View style={s.scrim}>
            <ScrollView style={s.panel} keyboardShouldPersistTaps="handled">
              <Text style={s.title}>Image tools</Text>
              <Text style={s.muted}>
                Changes affect this placement. The original file remains.
              </Text>
              <Text style={s.text}>Width (20–100%)</Text>
              <TextInput
                accessibilityLabel="Image width percentage"
                keyboardType="number-pad"
                value={String(selected.attrs.width)}
                onChangeText={v =>
                  setSelected({
                    ...selected,
                    attrs: { ...selected.attrs, width: Number(v) },
                  })
                }
                style={s.input}
              />
              <View style={s.actions}>
                {(['left', 'center', 'right'] as const).map(alignment => (
                  <Action
                    key={alignment}
                    label={
                      alignment === selected.attrs.alignment
                        ? alignment + ' ✓'
                        : alignment
                    }
                    onPress={() =>
                      setSelected({
                        ...selected,
                        attrs: { ...selected.attrs, alignment },
                      })
                    }
                  />
                ))}
              </View>
              <TextInput
                accessibilityLabel="Image caption"
                placeholder="Caption"
                placeholderTextColor="#858585"
                value={selected.attrs.caption}
                onChangeText={caption =>
                  setSelected({
                    ...selected,
                    attrs: { ...selected.attrs, caption },
                  })
                }
                style={s.input}
              />
              {more ? (
                <TextInput
                  accessibilityLabel="Image alternative text"
                  placeholder="Alternative text"
                  placeholderTextColor="#858585"
                  value={selected.attrs.alt}
                  onChangeText={alt =>
                    setSelected({
                      ...selected,
                      attrs: { ...selected.attrs, alt },
                    })
                  }
                  style={s.input}
                />
              ) : null}
              <View style={s.actions}>
                <Action
                  label="Apply image changes"
                  onPress={edit}
                  disabled={!editable}
                />
                <Action
                  label={more ? 'Fewer image options' : 'More image options'}
                  onPress={() => setMore(!more)}
                />
                <Action
                  label="Close image tools"
                  onPress={() => setSelected(undefined)}
                />
              </View>
              {more ? (
                <View style={s.actions}>
                  <Action
                    label="Replace image"
                    disabled={!editable || busy}
                    onPress={() => {
                      const target = selected;
                      setSelected(undefined);
                      choose('files', target);
                    }}
                  />
                  <Action
                    label="Preview image"
                    onPress={() => {
                      const id = selected.attrs.resourceId;
                      setSelected(undefined);
                      void model.perform(() => model.routeResource(id, true));
                    }}
                  />
                  <Action
                    label="Retry image"
                    onPress={() => {
                      setSelected(undefined);
                      send({ type: 'mediaRetry', loadId });
                    }}
                  />
                  <Action label="Copy image" onPress={() => original('copy')} />
                  <Action
                    label="Save original"
                    onPress={() => original('save')}
                  />
                  <Action
                    label="Remove placement"
                    disabled={!editable || busy}
                    onPress={() =>
                      Alert.alert(
                        'Remove this placement?',
                        'The original resource and other placements remain.',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Remove',
                            onPress: () => {
                              send({
                                type: 'mediaEdit',
                                loadId,
                                anchor: selected.anchor,
                                remove: true,
                              });
                              setSelected(undefined);
                            },
                          },
                        ],
                      )
                    }
                  />
                </View>
              ) : null}
              {error ? <Text style={s.error}>{error}</Text> : null}
            </ScrollView>
          </View>
        </Modal>
      ) : null}
      {existing ? (
        <Modal
          transparent
          animationType="fade"
          onRequestClose={() => setExisting(false)}
        >
          <View style={s.scrim}>
            <View style={s.panel}>
              <Text style={s.title}>Existing images</Text>
              {error ? (
                <View>
                  <Text style={s.error}>{error}</Text>
                  <Action
                    label="Retry image search"
                    onPress={() => {
                      setError('');
                      setSearchRetry(v => v + 1);
                    }}
                  />
                </View>
              ) : null}
              <TextInput
                accessibilityLabel="Search existing image titles"
                value={query}
                onChangeText={v => {
                  setQuery(v);
                  setPage(0);
                }}
                placeholder="Search titles"
                placeholderTextColor="#858585"
                style={s.input}
              />
              <ScrollView>
                {matches.map(item => (
                  <Action
                    key={item.id}
                    label={item.title}
                    onPress={() =>
                      void run(async () => {
                        await call('preview', {
                          ...scope(),
                          resourceId: item.id,
                          mime: 'image/png',
                        });
                        pick.current = { kind: 'existingInsert' };
                        existingId.current = item.id;
                        send({
                          type: 'mediaAnchor',
                          loadId,
                          anchor: 'existing-' + Date.now(),
                        });
                        setExisting(false);
                      })
                    }
                  />
                ))}
              </ScrollView>
              <View style={s.actions}>
                <Action
                  label="Previous"
                  disabled={page === 0}
                  onPress={() => setPage(v => v - 1)}
                />
                <Action
                  label="Next"
                  disabled={page + 1 >= pages}
                  onPress={() => setPage(v => v + 1)}
                />
                <Action
                  label="Close image picker"
                  onPress={() => setExisting(false)}
                />
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </>
  );
});
const sheetStyles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: '#000b',
    justifyContent: 'center',
    padding: 12,
  },
  panel: {
    flexGrow: 0,
    maxHeight: '90%',
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: '#444',
    padding: 16,
    borderRadius: 16,
    gap: 10,
  },
  row: { paddingVertical: 10, borderBottomColor: '#333', borderBottomWidth: 1 },
  title: { fontSize: 20, color: '#e8e8e8' },
  text: { color: '#e8e8e8' },
  muted: { color: '#b3b3b3' },
  error: { color: '#ff9191' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  input: {
    color: '#e8e8e8',
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 8,
    padding: 10,
    minHeight: 44,
  },
});
