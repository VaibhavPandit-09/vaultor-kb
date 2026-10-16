import ContextSheet from './ContextSheet';
import ReviewCapture from './ReviewCapture';
import { captureSeed, type CaptureSeed, type Evidence } from './reviews';
import { sourcePresentation, activatedSource } from './sourcePresentation';
import { haptic } from './haptics';
import { ReaderFeed } from './readerFeed';
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  Animated,
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
import ReaderView, { type ReaderPanel } from './ReaderView';
import ReadingControls from './ReadingControls';
import OfflineControls from './OfflineControls';
import { useReading, useThemeStyles } from './ui';
const native = NativeModules.VaultorNative;
const parse = async <T,>(p: Promise<string>): Promise<T> => JSON.parse(await p);
async function permission(interactive = true) {
  if (
    Number(Platform.Version) >= 37 &&
    !(interactive
      ? (await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_LOCAL_NETWORK,
        )) === 'granted'
      : await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.ACCESS_LOCAL_NETWORK,
        ))
  )
    throw Error('Allow local-network access, then retry.');
}
export default function WorkspaceScreen() {
  const { reduced, preferences } = useReading();
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
      cancelQuick: () => native.cancelQuick(),
      networkPermission: () => permission(false),
      companion: (action, value) =>
        parse(native.companion(action, JSON.stringify(value))),
      api: async (h, path, method = 'GET', body, revision, channel) => {
        const r = await parse<{ status: number; body: string }>(
          channel === 'quick'
            ? native.quickApiFor(h.hostId, h.epoch, path)
            : channel === 'browse'
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
        p => model.quickApi(p),
        () => model.cancelQuick(),
      ),
    ).current,
    feed = useSyncExternalStore(quick.subscribe, quick.snapshot);
  const previewBack = useRef<() => boolean>(() => false);
  const [captureRequest, setCaptureRequest] = useState<{
    seed?: CaptureSeed;
  }>();
  const capture = (evidence?: Evidence, page?: number) => {
    try {
      setCaptureRequest({
        seed: captureSeed(model.snapshot(), evidence, page),
      });
    } catch (e) {
      Alert.alert('Capture unavailable', (e as Error).message);
    }
  };
  const exportLock = useRef(false);
  const refreshDownloadAt = useRef(0);
  const refreshDownloads = useCallback(async () => {
    const st = model.snapshot();
    if (
      st.connection !== 'online' ||
      !st.host ||
      !st.scope ||
      Date.now() - refreshDownloadAt.current < 60000
    )
      return;
    refreshDownloadAt.current = Date.now();
    try {
      const policy = await parse<{ autoRefresh: boolean }>(
        native.companion('policy', '{}'),
      );
      if (!policy.autoRefresh) return;
      const jobs = await parse<any[]>(native.companion('list', '{}'));
      if (jobs.some(j => j.scope === st.scope && j.status !== 'ready')) return;
      const active = jobs.find(
        j =>
          j.scope === st.scope &&
          j.active === j.id &&
          j.status === 'ready' &&
          j.locked !== '1',
      );
      if (active && model.snapshot().scope === st.scope)
        await native.companion(
          'start',
          JSON.stringify({
            ...st.host,
            scope: st.scope,
            selection: JSON.parse(active.selection),
          }),
        );
    } catch (e) {
      model.report(e);
    }
  }, [model]);
  const [exporting, setExporting] = useState(false),
    [recoveryStatus, setRecoveryStatus] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [drawer, setDrawer] = useState(false),
    [appearance, setAppearance] = useState(false),
    [downloads, setDownloads] = useState(false),
    [downloadTarget, setDownloadTarget] = useState<{
      id: string;
      title: string;
      scope: string;
    }>(),
    [hosts, setHosts] = useState(false),
    [recovery, setRecovery] = useState(false),
    [more, setMore] = useState(false),
    [trail, setTrail] = useState(false),
    [readerPanel, setReaderPanel] = useState<ReaderPanel>(),
    [searchRequest, setSearchRequest] = useState(0),
    [address, setAddress] = useState('https://'),
    [code, setCode] = useState(''),
    [inventory, setInventory] = useState<any>(),
    [recoveryError, setRecoveryError] = useState('');
  const readerScroll = useRef(new Animated.Value(0)).current;
  const [captionHeight, setCaptionHeight] = useState(14);
  useEffect(() => {
    readerScroll.setValue(Math.max(0, model.snapshot().position?.scroll || 0));
  }, [model, readerScroll, state.loadId]);
  const reading = state.view === 'note' && !!state.note;
  const source = sourcePresentation(state);
  const sourceRoot = useRef<React.ElementRef<typeof View>>(null),
    sourceToken = useRef(0);
  const [sourceError, setSourceError] = useState('');
  const [manageConnections, setManageConnections] = useState(false);
  const [sourceJobs, setSourceJobs] = useState<any[]>([]);
  const downloadedName = sourceJobs.find(j => j.scope === state.scope)?.name;
  if (state.downloaded && downloadedName) source.workspace = downloadedName;
  useEffect(() => {
    let alive = true;
    if (hosts) setSourceError('');
    void parse<any[]>(native.companion('list', '{}'))
      .then(jobs => {
        if (alive)
          setSourceJobs(
            jobs.filter(j => j.active === j.id && j.status === 'ready'),
          );
      })
      .catch(() => {
        if (alive)
          setSourceError(
            'Downloads could not be read. Retry from Offline downloads.',
          );
      });
    return () => {
      alive = false;
    };
  }, [hosts, state.host?.hostId, state.scope]);
  useEffect(
    () => () => {
      sourceToken.current++;
    },
    [],
  );
  const activateSource = (
    action: () => Promise<void>,
    target: Parameters<typeof activatedSource>[1],
  ) => {
    if (model.snapshot().busy) return;
    const token = ++sourceToken.current;
    setSourceError('');
    void model.perform(async () => {
      try {
        await action();
        const next = model.snapshot();
        if (!activatedSource(next, target))
          throw Error(
            next.error ||
              'This source is not available yet. Retry or choose a downloaded source.',
          );
        if (token !== sourceToken.current) return;
        setHosts(false);
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            if (
              token !== sourceToken.current ||
              model.snapshot().scope !== next.scope
            )
              return;
            const tag = findNodeHandle(menu.current);
            if (tag) {
              AccessibilityInfo.setAccessibilityFocus(tag);
              haptic('selection', tag, preferences.haptics !== 'off');
            }
          }),
        );
      } catch (e) {
        if (token !== sourceToken.current) return;
        setSourceError((e as Error).message);
        requestAnimationFrame(() => {
          if (token !== sourceToken.current) return;
          const tag = findNodeHandle(sourceRoot.current);
          if (tag) haptic('reject', tag, preferences.haptics !== 'off');
        });
      }
    });
  };
  const closeSources = () => {
    sourceToken.current++;
    setHosts(false);
  };
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
    if (captureRequest) return true; // Native capture modal owns protected dismissal.
    if (downloads) {
      setDownloads(false);
      return true;
    }
    if (appearance) {
      setAppearance(false);
      return true;
    }
    if (state.preview) {
      if (previewBack.current()) return true;
      model.dismissPreview();
      return true;
    }
    if (readerPanel) {
      setReaderPanel(undefined);
      Keyboard.dismiss();
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
      closeSources();
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
    void model
      .initialize()
      .catch(e => model.report(e))
      .finally(() => setInitialized(true));
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
    if (
      initialized &&
      state.host &&
      state.scope &&
      !hosts &&
      !recovery &&
      (drawer || state.view === 'home')
    )
      void quick.refresh();
    else quick.suspend();
    return () => quick.suspend();
  }, [
    quick,
    initialized,
    state.scope,
    state.host,
    hosts,
    recovery,
    drawer,
    state.view,
    state.browseVersion,
  ]);
  useEffect(() => {
    const completed = new NativeEventEmitter(native).addListener(
      'VaultorCompanionReady',
      (...args) => {
        try {
          const raw = args[0];
          if (typeof raw !== 'string') return;
          const value = JSON.parse(raw);
          if (value.locked === true && typeof value.scope === 'string') {
            model.lockCompanion(value.scope);
            return;
          }
          if (typeof value.scope === 'string')
            void model
              .refreshDownloaded(value.scope)
              .catch(e => model.report(e));
        } catch {}
      },
    );
    return () => completed.remove();
  }, [model]);
  useEffect(() => {
    const h = state.host;
    if (!initialized || !h) return;
    if (state.localOnly) {
      const listener = AppState.addEventListener('change', value => {
        if (value !== 'active') void model.background();
      });
      return () => listener.remove();
    }
    const feed = new ReaderFeed({
      start: cursor => native.startChanges(h.hostId, h.epoch, cursor),
      stop: () => native.stopChanges(),
      reconnect: async () => {
        await model.connect(false);
        if (model.state.connection !== 'online')
          throw Error('Host unavailable. Reading copies and recovery remain.');
        await refreshDownloads();
      },
      reconcile: () => model.changedFeed(),
      error: e => {
        if (!model.snapshot().downloaded) model.report(e);
      },
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
    if (latest.current.connection === 'online') {
      feed.start();
      void refreshDownloads();
    } else feed.foreground(true);
    return () => {
      events.remove();
      app.remove();
      feed.dispose();
    };
  }, [
    model,
    quick,
    initialized,
    state.host,
    state.localOnly,
    refreshDownloads,
  ]);
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
  useEffect(() => {
    setReaderPanel(undefined);
  }, [state.loadId, state.scope]);
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
  const hostView = !state.host && !recovery;
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
  const sourceContent = (
    <ScrollView
      key="connections"
      contentContainerStyle={s.page}
      keyboardShouldPersistTaps="handled"
    >
      <View ref={sourceRoot} collapsable={false}>
        <Text style={s.section}>{source.workspace}</Text>
        <Text style={s.secondary}>{source.host}</Text>
        <Text style={s.secondary}>{source.availability}</Text>
        {sourceError || state.error ? (
          <Text accessibilityRole="alert" style={s.error}>
            {sourceError || state.error}
          </Text>
        ) : null}
      </View>
      {hostView ? (
        <Text style={s.secondary}>
          Connect to read your workspace. Approvals stay on this device.
        </Text>
      ) : (
        <Action
          label={
            state.connection === 'online' && !state.localOnly
              ? 'Refresh connection'
              : 'Reconnect to host'
          }
          disabled={state.busy}
          onPress={() =>
            activateSource(
              async () => {
                await permission();
                await model.connect(false);
              },
              {
                hostId: state.host!.hostId,
                workspaceId: state.host!.workspaceId,
              },
            )
          }
        />
      )}

      {state.multiWorkspace ? (
        <>
          <Text style={s.section}>On this server</Text>
          {state.workspaces?.map(w => (
            <Action
              disabled={state.busy}
              key={w.id}
              label={
                w.name + (w.id === state.host?.workspaceId ? ' · Current' : '')
              }
              onPress={() =>
                activateSource(
                  async () => {
                    if (w.id === state.host?.workspaceId) {
                      await permission();
                      await model.connect(false);
                    } else await model.switchWorkspace(w.id, true);
                  },
                  { hostId: state.host!.hostId, workspaceId: w.id },
                )
              }
            />
          ))}
        </>
      ) : null}
      <Text accessibilityRole="header" style={s.section}>
        Downloaded sources
      </Text>
      {!sourceJobs.length ? (
        <Text style={s.secondary}>
          No verified reading downloads on this device.
        </Text>
      ) : null}
      {sourceJobs.map(job => (
        <View key={job.id} style={s.row}>
          <Text style={s.section}>{job.name}</Text>
          <Text style={s.secondary}>
            {(() => {
              try {
                const id = JSON.parse(job.scope)[0];
                return (
                  state.hosts.find(h => h.hostId === id)?.address ||
                  'Retained host'
                );
              } catch {
                return 'Retained source';
              }
            })()}
          </Text>
          <Text style={s.secondary}>
            {job.locked === '1'
              ? 'Locked · approval required'
              : 'Verified download · ' +
                new Date(Number(job.at)).toLocaleDateString()}
          </Text>
          <Action
            label={'Read downloaded · ' + job.name}
            accessibilityLabel={
              'Read downloaded ' +
              job.name +
              ' from ' +
              (() => {
                try {
                  return (
                    state.hosts.find(h => h.hostId === JSON.parse(job.scope)[0])
                      ?.address || 'retained host'
                  );
                } catch {
                  return 'retained source';
                }
              })()
            }
            disabled={state.busy || job.locked === '1'}
            onPress={() =>
              activateSource(() => model.openCompanion(job.scope), {
                scope: job.scope,
              })
            }
          />
        </View>
      ))}
      <Action
        label={
          manageConnections || hostView ? 'Connections' : 'Manage connections'
        }
        onPress={() => setManageConnections(v => !v)}
      />
      {manageConnections || hostView ? (
        <>
          {state.hosts.map(h => (
            <View key={h.hostId} style={s.row}>
              <Text style={s.secondary}>{h.address}</Text>
              <Action
                disabled={state.busy}
                label={
                  h.hostId === state.host?.hostId ? 'Reconnect' : 'Connect'
                }
                onPress={() =>
                  activateSource(
                    async () => {
                      await permission();
                      if (h.hostId === state.host?.hostId)
                        await model.connect(false);
                      else await model.switchHost(h.hostId, true);
                    },
                    { hostId: h.hostId, workspaceId: h.workspaceId },
                  )
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
          <Text accessibilityRole="header" style={s.section}>
            Add a host
          </Text>
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
                    if (model.snapshot().connection === 'online')
                      closeSources();
                  })
                }
              />
            </>
          ) : null}
        </>
      ) : null}
      <Action
        label="Legacy recovery"
        onPress={() => {
          setHosts(false);
          recoveryOpen();
        }}
      />
      <Action
        label="Appearance & reading"
        onPress={() => setAppearance(true)}
      />
      <Action label="Offline downloads" onPress={() => setDownloads(true)} />
    </ScrollView>
  );
  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View
        style={[s.header, reading && s.readerHeader]}
        collapsable={false}
        importantForAccessibility={
          hosts ||
          drawer ||
          recovery ||
          more ||
          trail ||
          readerPanel === 'appearance' ||
          readerPanel === 'outline' ||
          state.preview
            ? 'no-hide-descendants'
            : 'auto'
        }
      >
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
        <Pressable
          style={s.orientation}
          disabled={state.busy || hostView || recovery}
          accessibilityRole="button"
          accessibilityLabel={`${title}. ${source.workspace}. ${source.availability}. Choose source`}
          onPress={() => setHosts(true)}
        >
          <Animated.Text
            numberOfLines={1}
            accessibilityRole="header"
            style={[
              s.title,
              reading &&
                state.connection === 'online' &&
                !reduced && {
                  transform: [
                    {
                      translateY: readerScroll.interpolate({
                        inputRange: [0, 80],
                        outputRange: [0, captionHeight / 2],
                        extrapolate: 'clamp',
                      }),
                    },
                  ],
                },
            ]}
          >
            {title}
          </Animated.Text>
          <Animated.Text
            onLayout={e => setCaptionHeight(e.nativeEvent.layout.height)}
            numberOfLines={1}
            style={[
              s.source,
              reading &&
                state.connection === 'online' &&
                !reduced && {
                  opacity: readerScroll.interpolate({
                    inputRange: [0, 80],
                    outputRange: [1, 0],
                    extrapolate: 'clamp',
                  }),
                },
            ]}
          >
            {source.availability} · {source.workspace} ⌄
          </Animated.Text>
        </Pressable>
        {!hostView && !recovery && state.view === 'note' ? (
          <Action
            label="•••"
            accessibilityLabel="Reading options"
            onPress={() => setMore(true)}
          />
        ) : null}
      </View>
      {state.offlineWarning ? (
        <Text accessibilityRole="alert" style={s.error}>
          {state.offlineWarning}
        </Text>
      ) : null}
      {state.error &&
      !hosts &&
      !hostView &&
      (state.connection === 'online' || state.navigationRetry) ? (
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
      {!initialized ? (
        <View key="starting" style={s.content}>
          <Text style={s.secondary}>Opening workspace…</Text>
        </View>
      ) : hostView ? (
        sourceContent
      ) : (
        <View
          key="workspace-body"
          style={s.content}
          collapsable={false}
          importantForAccessibility={
            more || trail || state.preview || hosts || drawer || recovery
              ? 'no-hide-descendants'
              : 'auto'
          }
        >
          {state.view === 'home' ? (
            <HomeScreen
              source={source}
              resume={state.note}
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
            suspended={drawer || hosts || recovery}
            searchRequest={searchRequest}
            onAction={run}
          />
          {state.note ? (
            <View
              collapsable={false}
              style={[s.content, state.view !== 'note' && s.hidden]}
              pointerEvents={state.view === 'note' ? 'auto' : 'none'}
              importantForAccessibility={
                state.view === 'note' ? 'auto' : 'no-hide-descendants'
              }
            >
              <ReaderView
                model={model}
                panel={readerPanel}
                closePanel={() => setReaderPanel(undefined)}
                reduced={reduced}
                onScroll={e =>
                  readerScroll.setValue(e.nativeEvent.contentOffset.y)
                }
                capture={evidence => capture(evidence)}
              />
            </View>
          ) : null}
        </View>
      )}
      {recovery ? (
        <ContextSheet title="Legacy recovery" close={() => setRecovery(false)}>
          <ScrollView key="recovery" contentContainerStyle={s.page}>
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
        </ContextSheet>
      ) : null}
      {hosts && !hostView && initialized && !recovery ? (
        <ContextSheet title="Sources" close={closeSources}>
          {sourceContent}
        </ContextSheet>
      ) : null}
      {initialized && state.host ? (
        <WorkspaceDrawer
          visible={drawer}
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
          appearance={() => {
            closeDrawer();
            setAppearance(true);
          }}
          downloads={() => {
            closeDrawer();
            setDownloadTarget(undefined);
            setDownloads(true);
          }}
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
          captures={() => {
            closeDrawer();
            setCaptureRequest({});
          }}
          reducedMotion={reduced}
        />
      ) : null}
      {appearance ? (
        <ReadingControls close={() => setAppearance(false)} />
      ) : null}
      {downloads ? (
        <OfflineControls
          model={model}
          reduced={reduced}
          resource={downloadTarget}
          close={() => setDownloads(false)}
          recovery={() => {
            setDownloads(false);
            recoveryOpen();
          }}
        />
      ) : null}
      <View
        collapsable={false}
        style={s.overlayHost}
        pointerEvents={more || trail || state.preview ? 'box-none' : 'none'}
      >
        {more ? (
          <ChoiceSheet
            title="Reading options"
            animation="none"
            close={() => setMore(false)}
            choices={[
              { value: 'outline', label: 'Note outline' },
              { value: 'capture', label: 'Add review item' },
              { value: 'find', label: 'Find within note' },
              { value: 'appearance', label: 'Reading appearance' },
              { value: 'downloads', label: 'Download for offline' },
              { value: 'journey', label: 'Reading journey' },
              { value: 'refresh', label: 'Refresh saved note' },
              { value: 'recovery', label: 'Legacy recovery' },
            ]}
            onChoose={v => {
              if (v === 'capture') {
                capture();
                return;
              }
              if (v === 'downloads') {
                setDownloadTarget(undefined);
                setDownloads(true);
                return;
              }
              if (v === 'outline' || v === 'find' || v === 'appearance')
                setReaderPanel(v);
              else if (v === 'journey') setTrail(true);
              else if (v === 'recovery') recoveryOpen();
              else run(() => model.reconcile());
            }}
          />
        ) : null}
        {trail ? (
          <ChoiceSheet
            title="Reading journey"
            animation="none"
            close={() => setTrail(false)}
            choices={state.journey.visits.map((v, i) => ({
              value: String(i),
              label:
                i +
                1 +
                '. ' +
                v.title +
                (i === state.journey.cursor ? ' · Current' : '') +
                (v.unavailable ? ' · Unavailable' : ''),
            }))}
            onChoose={v => run(() => model.history(Number(v)))}
          />
        ) : null}
        <ResourcePreview
          capture={page => capture(undefined, page)}
          model={model}
          download={() => {
            const r = model.snapshot().preview;
            if (r)
              setDownloadTarget({
                id: r.id,
                title: r.title,
                scope: model.snapshot().scope,
              });
            model.dismissPreview();
            setDownloads(true);
          }}
          registerBack={fn => {
            previewBack.current = fn;
          }}
        />
      </View>
      {captureRequest ? (
        <ReviewCapture
          seed={captureRequest.seed}
          close={() => setCaptureRequest(undefined)}
        />
      ) : null}
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  content: { flex: 1 },
  overlayHost: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  hidden: { display: 'none' },
  readerHeader: { minHeight: 48 },
  header: {
    zIndex: 1,
    backgroundColor: '#000',
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#252525',
  },
  orientation: { flex: 1, minHeight: 48, justifyContent: 'center' },
  source: { color: '#858585', fontSize: 12 },
  title: { fontSize: 19, fontWeight: '600', color: '#e8e8e8' },
  icon: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: { fontSize: 25, color: '#e8e8e8' },
  page: { padding: 12, gap: 8 },
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
