import React, {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  Alert,
  AppState,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  MobileBrowser,
  browsePath,
  filters,
  presentation,
  type BrowseRow,
  type Destination,
} from './browse';
import type { MobileWorkspace } from './workspace';
const destinations: { value: Destination; label: string }[] = [
  { value: 'library', label: 'Library' },
  { value: 'recent', label: 'Recent' },
  { value: 'pinned', label: 'Pinned' },
  { value: 'collections', label: 'Collections' },
];
export function Action({
  label,
  onPress,
  active = false,
  disabled = false,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: active, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        active && styles.active,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.actionText, active && styles.accent]}>{label}</Text>
    </Pressable>
  );
}
export function ChoiceSheet({
  title,
  choices,
  close,
  onChoose,
}: {
  title: string;
  choices: { value: string; label: string }[];
  close: () => void;
  onChoose: (value: string) => void;
}) {
  const [q, setQ] = useState('');
  return (
    <Modal transparent animationType="fade" onRequestClose={close}>
      <Pressable
        style={styles.scrim}
        onPress={close}
        accessibilityLabel="Dismiss picker"
      >
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.bar}>
            <Text accessibilityRole="header" style={styles.heading}>
              {title}
            </Text>
            <Action label="Done" onPress={close} />
          </View>
          <TextInput
            autoFocus
            accessibilityLabel={'Search ' + title}
            value={q}
            onChangeText={setQ}
            placeholder="Find an option"
            placeholderTextColor="#858585"
            style={styles.input}
          />
          <FlatList
            keyboardShouldPersistTaps="handled"
            data={choices.filter(c =>
              c.label.toLowerCase().includes(q.toLowerCase()),
            )}
            keyExtractor={c => c.value}
            renderItem={({ item }) => (
              <Action
                label={item.label}
                onPress={() => {
                  onChoose(item.value);
                  close();
                }}
              />
            )}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
export default function BrowseScreen({
  model,
  visible,
  onAction,
}: {
  model: MobileWorkspace;
  visible: boolean;
  onAction: (action: () => Promise<void>) => void;
}) {
  const state = useSyncExternalStore(model.subscribe, model.snapshot);
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', value =>
      setActive(value === 'active'),
    );
    return () => subscription.remove();
  }, []);
  const browser = useRef(
    new MobileBrowser(
      path => model.browseApi(path),
      () => model.cancelBrowse(),
      config => model.updateBrowse(config),
    ),
  ).current;
  const b = useSyncExternalStore(browser.subscribe, browser.snapshot),
    list = useRef<FlatList<BrowseRow>>(null);
  const [sheet, setSheet] = useState<'type' | 'sort' | 'scope' | undefined>(),
    [scopeQuery, setScopeQuery] = useState(''),
    [scopeChoices, setScopeChoices] = useState<
      { value: string; label: string }[]
    >([]),
    [scopePage, setScopePage] = useState(0),
    [scopeMore, setScopeMore] = useState(false),
    [scopeError, setScopeError] = useState('');
  const scopeTicket = useRef(0),
    restored = useRef('');
  const [scopeRetry, setScopeRetry] = useState(0);
  useEffect(() => {
    setSheet(undefined);
    setScopeChoices([]);
  }, [state.scope]);
  useEffect(() => {
    browser.bind(state.scope, state.browse);
  }, [state.scope, browser, state.browse]);
  const path = browsePath(b.config);
  useEffect(() => {
    if (!visible || !active || !state.scope || sheet === 'scope') {
      browser.suspend();
      return;
    }
    const timer = setTimeout(
      () => {
        void browser.refresh();
      },
      b.config.query ? 250 : 0,
    );
    return () => {
      clearTimeout(timer);
      browser.suspend();
    };
  }, [
    visible,
    active,
    state.scope,
    state.connection,
    state.browseVersion,
    path,
    browser,
    b.config.query,
    sheet,
  ]);
  useEffect(() => {
    if (!visible) {
      restored.current = '';
      return;
    }
    const key = state.scope + '|' + path;
    if (b.applied === path && restored.current !== key) {
      restored.current = key;
      list.current?.scrollToOffset({
        offset: b.config.scroll,
        animated: false,
      });
    }
  }, [visible, b.applied, path, b.config.scroll, state.scope]);
  useEffect(() => {
    if (sheet !== 'scope' || !visible || !active) return;
    const counter = scopeTicket,
      ticket = ++counter.current;
    setScopeError('');
    const timer = setTimeout(() => {
      void model
        .browseApi(
          '/collections?page=' +
            scopePage +
            '&size=100&q=' +
            encodeURIComponent(scopeQuery),
        )
        .then(page => {
          if (ticket !== scopeTicket.current) return;
          setScopeChoices(
            page.items.map((c: any) => ({ value: c.id, label: c.name })),
          );
          setScopeMore(page.totalPages > scopePage + 1);
        })
        .catch(e => {
          if (ticket === scopeTicket.current) setScopeError(e.message);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      counter.current++;
      model.cancelBrowse();
    };
  }, [
    sheet,
    scopeQuery,
    scopePage,
    scopeRetry,
    model,
    visible,
    active,
    state.scope,
  ]);
  if (!visible) return null;
  const choices = filters.concat(
    b.config.destination === 'pinned'
      ? [{ value: 'collection', label: 'Collections' }]
      : [],
  );
  const selectDestination = (destination: Destination) =>
    browser.configure({
      destination,
      collection: undefined,
      type: '',
      mode: 'title',
    });
  const activate = (row: BrowseRow) => {
    if (row.kind === 'collection')
      browser.configure({
        destination: 'library',
        collection: { id: row.id, name: row.title },
      });
    else onAction(() => model.routeResource(row.id));
  };
  return (
    <View style={styles.root}>
      <View style={styles.tabs}>
        {destinations.map(d => (
          <Action
            key={d.value}
            label={d.label}
            active={b.config.destination === d.value}
            onPress={() => selectDestination(d.value)}
          />
        ))}
      </View>
      <View style={styles.title}>
        <Text accessibilityRole="header" style={styles.heading}>
          {b.config.collection?.name ??
            destinations.find(d => d.value === b.config.destination)?.label}
        </Text>
        {state.note ? (
          <Action
            label="Return to note"
            onPress={() => onAction(() => model.returnToNote())}
          />
        ) : null}
      </View>
      {b.config.collection ? (
        <Action
          label="‹ Library"
          onPress={() => browser.configure({ collection: undefined })}
        />
      ) : null}
      <TextInput
        maxLength={500}
        accessibilityLabel="Search resources"
        placeholder={
          b.config.destination === 'collections'
            ? 'Find a collection'
            : b.config.mode === 'title'
            ? 'Search titles'
            : 'Search saved content'
        }
        placeholderTextColor="#858585"
        style={styles.input}
        value={b.config.query}
        onChangeText={query => browser.configure({ query })}
        returnKeyType="search"
      />
      <View style={styles.tabs}>
        {b.config.destination !== 'collections' ? (
          <>
            <Action
              label={
                choices.find(c => c.value === b.config.type)?.label ??
                'All types'
              }
              active={Boolean(b.config.type)}
              onPress={() => setSheet('type')}
            />
            <Action
              label={
                b.config.mode === 'title' ? 'Titles only' : 'Saved content'
              }
              active={b.config.mode === 'content'}
              onPress={() =>
                browser.configure({
                  mode: b.config.mode === 'title' ? 'content' : 'title',
                  type: b.config.type === 'collection' ? '' : b.config.type,
                })
              }
            />
            {b.config.destination === 'library' ? (
              <Action
                label="Scope"
                active={Boolean(b.config.collection)}
                onPress={() => {
                  setScopePage(0);
                  setScopeQuery('');
                  setSheet('scope');
                }}
              />
            ) : null}
          </>
        ) : null}
        {b.config.destination === 'library' ? (
          <Action label="Sort" onPress={() => setSheet('sort')} />
        ) : null}
      </View>
      {b.config.mode === 'content' ? (
        <Text style={styles.meta}>
          Saved content only · open drafts are excluded.{' '}
          {b.coverage
            ? `File coverage: ${b.coverage.indexed}/${b.coverage.files}${
                b.coverage.complete ? '' : ' · incomplete'
              }`
            : ''}
          {b.config.destination === 'pinned' ? ' · pinned resources' : ''}
          {b.config.destination === 'recent' ? ' · relevance order' : ''}
        </Text>
      ) : null}
      {b.error ? (
        <View style={styles.bar}>
          <Text style={styles.error}>
            {b.error}
            {b.rows.length ? ' · previous results retained' : ''}
          </Text>
          <Action
            label="Retry"
            onPress={() => {
              void browser.refresh();
            }}
          />
        </View>
      ) : null}
      <Text style={styles.meta}>
        {b.loading
          ? 'Refreshing…'
          : `${b.total} ${
              b.config.destination === 'collections'
                ? 'collections'
                : 'resources'
            }`}
      </Text>
      <FlatList
        ref={list}
        data={b.rows}
        keyExtractor={r => r.kind + ':' + r.id}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={5}
        onScroll={e => browser.scroll(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={500}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.meta}>
              {b.loading
                ? 'Loading…'
                : b.config.query
                ? 'No matches for this search.'
                : 'Nothing here yet.'}
            </Text>
            {b.config.type ? (
              <Action
                label="Clear type filter"
                onPress={() => browser.configure({ type: '' })}
              />
            ) : null}
          </View>
        }
        renderItem={({ item }) => {
          const p =
            item.kind === 'collection'
              ? { label: 'Collection', icon: '▦', action: 'collection' }
              : presentation(item.resource!);
          return (
            <View style={styles.row}>
              <Pressable
                style={styles.rowMain}
                accessibilityRole="button"
                accessibilityLabel={`${item.title}, ${p.label}`}
                disabled={b.loading && b.applied !== path}
                onPress={() => activate(item)}
              >
                <Text accessibilityElementsHidden style={styles.icon}>
                  {p.icon}
                </Text>
                <View style={styles.rowText}>
                  <Text numberOfLines={2} style={styles.resourceTitle}>
                    {item.title}
                  </Text>
                  <Text style={styles.meta}>
                    {p.label}
                    {item.kind === 'collection'
                      ? ` · ${item.count} resources`
                      : item.resource?.collections?.length
                      ? ` · ${item.resource.collections.length} collections`
                      : ''}
                  </Text>
                  {item.snippet ? (
                    <Text numberOfLines={3} style={styles.snippet}>
                      {item.snippet.text}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
              <Action
                label="•••"
                accessibilityLabel={'Actions for ' + item.title}
                onPress={() =>
                  Alert.alert(item.title, p.label, [
                    {
                      text:
                        item.kind === 'collection'
                          ? 'Open collection'
                          : p.action === 'editor'
                          ? 'Open note'
                          : p.action === 'preview'
                          ? 'View file information'
                          : 'Check availability',
                      onPress: () => activate(item),
                    },
                    { text: 'Close', style: 'cancel' },
                  ])
                }
              />
            </View>
          );
        }}
        ListFooterComponent={
          b.pages > 1 ? (
            <View style={styles.bar}>
              <Action
                label="Previous"
                disabled={b.config.page === 0 || b.loading}
                onPress={() => browser.configure({ page: b.config.page - 1 })}
              />
              <Text style={styles.meta}>
                {b.config.page + 1} / {b.pages}
              </Text>
              <Action
                label="Next"
                disabled={b.config.page + 1 >= b.pages || b.loading}
                onPress={() => browser.configure({ page: b.config.page + 1 })}
              />
            </View>
          ) : undefined
        }
      />
      {sheet === 'type' ? (
        <ChoiceSheet
          title="Type"
          choices={choices}
          close={() => setSheet(undefined)}
          onChoose={type => browser.configure({ type })}
        />
      ) : null}
      {sheet === 'sort' ? (
        <ChoiceSheet
          title="Sort"
          choices={[
            { value: 'updated', label: 'Recently updated' },
            { value: 'title', label: 'Title' },
            { value: 'recent', label: 'Recently opened' },
          ]}
          close={() => setSheet(undefined)}
          onChoose={sort =>
            browser.configure({ sort: sort as 'updated' | 'title' | 'recent' })
          }
        />
      ) : null}
      {sheet === 'scope' ? (
        <Modal
          transparent
          onRequestClose={() => setSheet(undefined)}
          animationType="fade"
        >
          <View style={styles.scrim}>
            <View style={styles.sheet}>
              <View style={styles.bar}>
                <Text style={styles.heading}>Search scope</Text>
                <Action label="Done" onPress={() => setSheet(undefined)} />
              </View>
              <Action
                label="Entire workspace"
                onPress={() => {
                  browser.configure({ collection: undefined });
                  setSheet(undefined);
                }}
              />
              <TextInput
                maxLength={500}
                autoFocus
                style={styles.input}
                placeholder="Find a collection"
                placeholderTextColor="#858585"
                accessibilityLabel="Find collection scope"
                value={scopeQuery}
                onChangeText={q => {
                  setScopeQuery(q);
                  setScopePage(0);
                }}
              />
              {scopeError ? (
                <View style={styles.bar}>
                  <Text style={styles.error}>{scopeError}</Text>
                  <Action
                    label="Retry scopes"
                    onPress={() => setScopeRetry(scopeRetry + 1)}
                  />
                </View>
              ) : null}
              <FlatList
                keyboardShouldPersistTaps="handled"
                data={scopeChoices}
                keyExtractor={c => c.value}
                renderItem={({ item }) => (
                  <Action
                    label={item.label}
                    onPress={() => {
                      browser.configure({
                        collection: { id: item.value, name: item.label },
                      });
                      setSheet(undefined);
                    }}
                  />
                )}
              />
              <View style={styles.bar}>
                <Action
                  label="Previous scope page"
                  disabled={!scopePage}
                  onPress={() => setScopePage(scopePage - 1)}
                />
                <Action
                  label="Next scope page"
                  disabled={!scopeMore}
                  onPress={() => setScopePage(scopePage + 1)}
                />
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 16, gap: 10 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  title: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  heading: { color: '#e8e8e8', fontSize: 22, fontWeight: '600', flexShrink: 1 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  action: {
    minHeight: 44,
    minWidth: 44,
    padding: 10,
    borderRadius: 10,
    justifyContent: 'center',
  },
  actionText: { color: '#b3b3b3', fontSize: 14 },
  accent: { color: '#8db7ff' },
  active: { backgroundColor: '#141c2a' },
  pressed: { backgroundColor: '#1e1e1e' },
  disabled: { opacity: 0.4 },
  input: {
    minHeight: 48,
    color: '#e8e8e8',
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  meta: { color: '#858585', fontSize: 12, lineHeight: 18 },
  error: { color: '#ff9090', flexShrink: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: '#202020',
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 16,
    gap: 14,
  },
  icon: { fontSize: 24, color: '#8db7ff', width: 28 },
  rowText: { flex: 1, gap: 4 },
  resourceTitle: { fontSize: 16, fontWeight: '500', color: '#e8e8e8' },
  snippet: { color: '#b3b3b3', fontSize: 13, lineHeight: 19 },
  empty: { paddingVertical: 28, gap: 12 },
  scrim: { flex: 1, backgroundColor: '#000a', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: '#333',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    gap: 12,
    maxHeight: '80%',
    minHeight: 300,
  },
});
