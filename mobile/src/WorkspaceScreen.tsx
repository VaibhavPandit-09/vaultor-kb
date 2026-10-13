import { ReaderFeed } from './readerFeed';
import React, {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  Alert,
  AppState,
  BackHandler,
  Keyboard,
  NativeModules,
  NativeEventEmitter,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  AccessibilityInfo,
  findNodeHandle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MobileWorkspace, HostError, type Host } from './workspace';
import { QuickAccess, type RootDestination } from './navigation';
import { HomeScreen, WorkspaceDrawer } from './NavigationSurface';
import BrowseScreen, { Action, ChoiceSheet } from './BrowseScreen';
import ResourcePreview from './ResourcePreview';
import ReaderView from './ReaderView';
import { useThemeStyles } from './ui';
const native = NativeModules.VaultorNative;
const parse = async <T,>(p: Promise<string>): Promise<T> => JSON.parse(await p);
async function permission() {
  if (
    Number(Platform.Version) >= 37 &&
    (await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_LOCAL_NETWORK,
    )) !== 'granted'
  )
    throw Error('Allow local-network access, then retry.');
}
export default function WorkspaceScreen() {
  const s = useThemeStyles(styles),
    menu = useRef<React.ElementRef<typeof Pressable>>(null);
  const model = useRef(
    new MobileWorkspace({
      storage: (a, v = {}) => parse(native.storage(a, JSON.stringify(v))),
      activate: id => parse<Host>(native.activate(id)),
      selectWorkspace: (h, id, g) =>
        parse<Host>(native.selectWorkspace(h.hostId, h.epoch, id, g)),
      uuid: async () => (await parse<{ id: string }>(native.uuid())).id,
      cancelBrowse: () => native.cancelBrowse(),
      api: async (h, path, method = 'GET', body, revision, channel) => {
        const r = await parse<{ status: number; body: string }>(
          channel === 'browse'
            ? native.browseApiFor(h.hostId, h.epoch, path)
            : native.apiFor(
                h.hostId,
                h.epoch,
                path,
                method,
                body === undefined ? null : JSON.stringify(body),
                revision ?? null,
              ),
        );
        const value = r.body ? JSON.parse(r.body) : null;
        if (r.status < 200 || r.status >= 300)
          throw new HostError(
            r.status,
            value?.detail || 'Host unavailable. Retry when connected.',
            value?.code,
          );
        return value;
      },
    }),
  ).current;
  const state = useSyncExternalStore(model.subscribe, model.snapshot),
    latest = useRef(state);
  latest.current = state;
  const quick = useRef(
      new QuickAccess(
        p => model.browseApi(p),
        () => model.cancelBrowse(),
      ),
    ).current,
    feed = useSyncExternalStore(quick.subscribe, quick.snapshot);
  const exportLock = useRef(false);
  const [exporting, setExporting] = useState(false),
    [recoveryStatus, setRecoveryStatus] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [drawer, setDrawer] = useState(false),
    [hosts, setHosts] = useState(false),
    [recovery, setRecovery] = useState(false),
    [more, setMore] = useState(false),
    [trail, setTrail] = useState(false),
    [searchRequest, setSearchRequest] = useState(0),
    [address, setAddress] = useState('https://'),
    [code, setCode] = useState(''),
    [inventory, setInventory] = useState<any>(),
    [recoveryError, setRecoveryError] = useState(''),
    [reduced, setReduced] = useState(false);
  const run = (f: () => Promise<void>) => void model.perform(f);
  const closeDrawer = () => {
    setDrawer(false);
    const handle = findNodeHandle(menu.current);
    if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
  };
  const keyboard = useRef(false);
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', () => {
        keyboard.current = true;
      }),
      hidden = Keyboard.addListener('keyboardDidHide', () => {
        keyboard.current = false;
      });
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);
  const closeTransient = () => {
    if (state.preview) {
      model.dismissPreview();
      return true;
    }
    if (trail) {
      setTrail(false);
      return true;
    }
    if (more) {
      setMore(false);
      return true;
    }
    if (drawer) {
      closeDrawer();
      return true;
    }
    if (recovery) {
      setRecovery(false);
      return true;
    }
    if (hosts) {
      setHosts(false);
      return true;
    }
    return false;
  };
  const back = () => {
    if (closeTransient()) return;
    if (keyboard.current) {
      Keyboard.dismiss();
      return;
    }
    if (state.view === 'note') {
      run(() =>
        state.journey.cursor > 0
          ? model.history(state.journey.cursor - 1)
          : model.leaveNote(),
      );
    } else if (state.view === 'browse') {
      if (state.browse.collection)
        model.updateBrowse({ ...state.browse, collection: undefined, page: 0 });
      else run(() => model.showHome());
    } else BackHandler.exitApp();
  };
  useEffect(() => {
    void permission()
      .catch(e => model.report(e))
      .then(() => model.initialize())
      .catch(e => model.report(e))
      .finally(() => setInitialized(true));
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
  }, [model]);
  useEffect(() => {
    const event = BackHandler.addEventListener('hardwareBackPress', () => {
      back();
      return true;
    });
    return () => event.remove();
  });
  useLayoutEffect(() => {
    quick.bind(state.scope);
    if (state.host && !hosts && !recovery && (drawer || state.view === 'home'))
      void quick.refresh();
    else quick.suspend();
    return () => quick.suspend();
  }, [quick, state.scope, state.host, hosts, recovery, drawer, state.view]);
  useEffect(() => {
    const h = state.host;
    if (!initialized || !h) return;
    const feed = new ReaderFeed({
      start: cursor => native.startChanges(h.hostId, h.epoch, cursor),
      stop: () => native.stopChanges(),
      reconnect: async () => {
        await model.connect(false);
        if (model.state.connection !== 'online')
          throw Error('Host unavailable. Reading copies and recovery remain.');
      },
      reconcile: () => model.changedFeed(),
      error: e => model.report(e),
    });
    const events = new NativeEventEmitter(native).addListener(
      'VaultorChanges',
      (...args) => {
        try {
          if (typeof args[0] !== 'string') return;
          const e = JSON.parse(args[0]);
          if (e.epoch === h.epoch && e.hostId === h.hostId) feed.receive(e);
        } catch {}
      },
    );
    const app = AppState.addEventListener('change', value => {
      const active = value === 'active';
      feed.foreground(active);
      if (!active) {
        quick.suspend();
        void model.background();
      } else if (latest.current.view === 'home') void quick.refresh();
    });
    if (latest.current.connection === 'online') feed.start();
    else feed.foreground(true);
    return () => {
      events.remove();
      app.remove();
      feed.dispose();
    };
  }, [model, quick, initialized, state.host]);
  const select = (destination: RootDestination, search = false) => {
    closeDrawer();
    if (destination === 'trash') return;
    if (destination === 'home') run(() => model.showHome());
    else {
      model.updateBrowse({
        ...state.browse,
        destination,
        collection: undefined,
        page: 0,
      });
      if (search) setSearchRequest(v => v + 1);
      run(() => model.showBrowser());
    }
  };
  const open = (id: string, collection?: string) => {
    closeDrawer();
    if (collection) {
      model.updateBrowse({
        ...state.browse,
        destination: 'library',
        collection: { id, name: collection },
        page: 0,
      });
      run(() => model.showBrowser());
    } else run(() => model.routeResource(id));
  };
  const recoveryOpen = () => {
    closeDrawer();
    setRecovery(true);
    setRecoveryError('');
    void parse(native.legacyRecovery('inventory'))
      .then(setInventory)
      .catch((e: Error) => setRecoveryError(e.message));
  };
  const hostView = hosts || (!state.host && !recovery);
  const title = hostView
    ? 'Workspaces'
    : recovery
    ? 'Legacy recovery'
    : state.view === 'note'
    ? state.note?.title
    : state.view === 'home'
    ? 'Vaultor'
    : state.browse.collection?.name ??
      {
        library: 'Library',
        recent: 'Recent',
        pinned: 'Pinned',
        collections: 'Collections',
        trash: 'Library',
      }[state.browse.destination];
  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.header} collapsable={false}>
        <Pressable
          ref={menu}
          disabled={!initialized || state.busy}
          accessibilityState={{ disabled: !initialized || state.busy }}
          accessibilityRole="button"
          accessibilityLabel={hostView || recovery ? 'Back' : 'Open navigation'}
          style={s.icon}
          onPress={() => (hostView || recovery ? back() : setDrawer(true))}
        >
          <Text style={s.glyph}>{hostView || recovery ? '‹' : '☰'}</Text>
        </Pressable>
        {state.view === 'note' && !hostView && !recovery ? (
          <Action label="‹" accessibilityLabel="Back" onPress={back} />
        ) : null}
        <Text numberOfLines={1} accessibilityRole="header" style={s.title}>
          {title}
        </Text>
        {!hostView && !recovery && state.view === 'note' ? (
          <Action
            label="•••"
            accessibilityLabel="Reading options"
            onPress={() => setMore(true)}
          />
        ) : null}
      </View>
      {state.error ? (
        <View style={s.notice} accessibilityRole="alert">
          <Text style={s.error}>{state.error}</Text>
          <Action
            label="Retry connection"
            onPress={() =>
              run(async () => {
                await permission();
                await model.connect(false);
              })
            }
          />
          {state.navigationRetry ? (
            <Action
              label="Retry opening"
              onPress={() => run(() => model.retryNavigation())}
            />
          ) : null}
        </View>
      ) : null}
      {hostView ? (
        <ScrollView
          contentContainerStyle={s.page}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={s.secondary}>
            Connect to read your workspace. Approvals stay on this device.
          </Text>
          {state.multiWorkspace ? (
            <>
              <Text style={s.section}>On this server</Text>
              {state.workspaces?.map(w => (
                <Action
                  key={w.id}
                  label={
                    w.name +
                    (w.id === state.host?.workspaceId ? ' · Current' : '')
                  }
                  onPress={() =>
                    run(async () => {
                      await model.switchWorkspace(w.id, true);
                      setHosts(false);
                    })
                  }
                />
              ))}
            </>
          ) : null}
          {state.hosts.map(h => (
            <View key={h.hostId} style={s.row}>
              <Text style={s.secondary}>{h.address}</Text>
              <Action
                label={
                  h.hostId === state.host?.hostId ? 'Reconnect' : 'Connect'
                }
                onPress={() =>
                  run(async () => {
                    await permission();
                    await model.switchHost(h.hostId, true);
                    setHosts(false);
                  })
                }
              />
              <Action
                label="Forget approval"
                onPress={() =>
                  Alert.alert(
                    'Forget this host?',
                    'Legacy recovery is retained. Revoke the device on the host separately.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Forget',
                        onPress: () =>
                          run(async () => {
                            await native.signOut(h.hostId);
                            model.forgotten(h.hostId);
                            await model.refreshRecovery();
                          }),
                      },
                    ],
                  )
                }
              />
            </View>
          ))}
          <TextInput
            style={s.input}
            accessibilityLabel="Host HTTPS address"
            value={address}
            onChangeText={setAddress}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Action
            label="Pair with host"
            disabled={state.busy}
            onPress={() =>
              run(async () => {
                await permission();
                const r = await parse<{ code: string }>(
                  native.beginPairing(address),
                );
                setCode(r.code);
              })
            }
          />
          {code ? (
            <>
              <Text style={s.section}>Compare code: {code}</Text>
              <Text style={s.secondary}>
                Approve only the matching code on the host.
              </Text>
              <Action
                label="I approved the matching code"
                onPress={() =>
                  run(async () => {
                    const r = await parse<{ state: string }>(
                      native.completePairing(),
                    );
                    if (r.state !== 'APPROVED')
                      throw Error('Waiting for matching-code approval.');
                    await model.adopted();
                    setCode('');
                    setHosts(false);
                  })
                }
              />
            </>
          ) : null}
          <Action
            label="Legacy recovery"
            onPress={() => {
              setHosts(false);
              recoveryOpen();
            }}
          />
        </ScrollView>
      ) : recovery ? (
        <ScrollView contentContainerStyle={s.page}>
          <Text style={s.secondary}>
            Earlier Android edits and uploads are retained separately. Nothing
            here is automatically sent to a host.
          </Text>
          {recoveryError ? (
            <Text accessibilityRole="alert" style={s.error}>
              {recoveryError}
            </Text>
          ) : null}
          <Action
            label="Export legacy recovery"
            disabled={exporting}
            onPress={() => {
              if (exportLock.current) return;
              exportLock.current = true;
              setExporting(true);
              setRecoveryError('');
              setRecoveryStatus('Preparing recovery…');
              void parse<{ requested?: boolean }>(
                native.legacyRecovery('export'),
              )
                .then(r =>
                  setRecoveryStatus(
                    r.requested
                      ? 'Recovery ZIP saved.'
                      : 'Export cancelled. Retained records are unchanged.',
                  ),
                )
                .catch((e: Error) => {
                  setRecoveryStatus('');
                  setRecoveryError(e.message);
                })
                .finally(() => {
                  exportLock.current = false;
                  setExporting(false);
                });
            }}
          />
          {recoveryStatus ? (
            <Text accessibilityLiveRegion="polite" style={s.secondary}>
              {recoveryStatus}
            </Text>
          ) : null}
          {inventory ? (
            <>
              <Text style={s.section}>
                {inventory.drafts} drafts · {inventory.creations} creations ·{' '}
                {inventory.operations} operations · {inventory.inputs} upload
                inputs
              </Text>
              {inventory.items?.length > 50 ? (
                <Text style={s.secondary}>
                  Showing 50 retained items. Export includes every record.
                </Text>
              ) : null}
              {inventory.items?.slice(0, 50).map((item: any, i: number) => (
                <View key={i} style={s.row}>
                  <Text selectable style={s.section}>
                    {item.title}
                  </Text>
                  <Text selectable style={s.secondary}>
                    {item.kind} ·{' '}
                    {item.scope === state.scope
                      ? 'Current workspace'
                      : 'Retained source'}{' '}
                    · {item.status}
                  </Text>
                </View>
              ))}
            </>
          ) : (
            <Text style={s.secondary}>Reading recovery inventory…</Text>
          )}
          <Text style={s.secondary}>
            Exports a private ZIP with readable notes, original JSON, request
            identities and retained upload bytes. Save or share it for desktop
            review. Export does not delete records or overwrite originals.
          </Text>
        </ScrollView>
      ) : (
        <View style={s.content} collapsable={false}>
          {state.view === 'home' ? (
            <HomeScreen
              feed={feed}
              select={select}
              open={open}
              retry={() => void quick.refresh()}
              returnToNote={
                state.note ? () => run(() => model.returnToNote()) : undefined
              }
            />
          ) : null}
          <BrowseScreen
            model={model}
            visible={state.view === 'browse'}
            suspended={drawer}
            searchRequest={searchRequest}
            onAction={run}
          />
          {state.note ? (
            <View
              style={[s.content, state.view !== 'note' && s.hidden]}
              pointerEvents={state.view === 'note' ? 'auto' : 'none'}
              importantForAccessibility={
                state.view === 'note' ? 'auto' : 'no-hide-descendants'
              }
            >
              {state.connection !== 'online' ? (
                <Text style={s.offline}>Offline · last saved reading copy</Text>
              ) : null}
              <ReaderView model={model} />
            </View>
          ) : null}
        </View>
      )}
      {drawer ? (
        <WorkspaceDrawer
          feed={feed}
          select={select}
          open={open}
          retry={() => void quick.refresh()}
          close={closeDrawer}
          hosts={() => {
            closeDrawer();
            setHosts(true);
          }}
          recovery={recoveryOpen}
          host={
            state.workspaces?.find(w => w.id === state.host?.workspaceId)
              ?.name ?? state.host?.address
          }
          current={
            state.view === 'home'
              ? 'home'
              : state.view === 'browse'
              ? state.browse.destination
              : ''
          }
          recoveryCount={state.recovery.length}
          reducedMotion={reduced}
        />
      ) : null}
      {more ? (
        <ChoiceSheet
          title="Reading options"
          close={() => setMore(false)}
          choices={[
            { value: 'journey', label: 'Reading journey' },
            { value: 'refresh', label: 'Refresh saved note' },
            { value: 'recovery', label: 'Legacy recovery' },
          ]}
          onChoose={v => {
            if (v === 'journey') setTrail(true);
            else if (v === 'recovery') recoveryOpen();
            else run(() => model.reconcile());
          }}
        />
      ) : null}
      {trail ? (
        <ChoiceSheet
          title="Reading journey"
          close={() => setTrail(false)}
          choices={state.journey.visits.map((v, i) => ({
            value: String(i),
            label:
              i +
              1 +
              '. ' +
              v.title +
              (i === state.journey.cursor ? ' · Current' : ''),
          }))}
          onChoose={v => run(() => model.history(Number(v)))}
        />
      ) : null}
      <ResourcePreview model={model} />
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  content: { flex: 1 },
  hidden: { display: 'none' },
  header: {
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#252525',
  },
  title: { flex: 1, fontSize: 19, fontWeight: '600', color: '#e8e8e8' },
  icon: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: { fontSize: 25, color: '#e8e8e8' },
  page: { padding: 24, gap: 16 },
  secondary: { color: '#b3b3b3', fontSize: 15, lineHeight: 23 },
  section: { color: '#e8e8e8', fontSize: 16, fontWeight: '600' },
  row: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#252525',
    gap: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 12,
    color: '#e8e8e8',
    minHeight: 52,
    padding: 14,
  },
  notice: { padding: 12, backgroundColor: '#141414' },
  error: { color: '#ffb4b4' },
  offline: {
    paddingHorizontal: 24,
    paddingVertical: 6,
    color: '#b3b3b3',
    fontSize: 12,
  },
});
