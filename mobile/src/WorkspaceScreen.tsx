import ContextSheet from './ContextSheet';
import ReviewCapture from './ReviewCapture';
import { captureSeed, type CaptureSeed, type Evidence } from './reviews';
import { sourcePresentation, activatedSource } from './sourcePresentation';
import { VaultorHaptics } from './haptics';
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
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  AccessibilityInfo,
  findNodeHandle,
  useWindowDimensions,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { MobileWorkspace, HostError, type Host } from './workspace';
import { QuickAccess, type RootDestination } from './navigation';
import { HomeScreen } from './NavigationSurface';
import NavigationFolio from './NavigationFolio';
import SourceContext from './SourceContext';
import {
  ResourceMotionProvider,
  ReaderAperture,
  useResourceMotion,
} from './ResourceMotion';
import { sourceChoices } from './sourceChoices';
import ReviewDestination from './ReviewDestination';
import { useReviewSync } from './useReviewSync';
import { BrowseMemory, navigationLayout } from './navigationPresentation';
import BrowseScreen, { Action, ChoiceSheet } from './BrowseScreen';
import ResourcePreview from './ResourcePreview';
import ReaderView, { type ReaderPanel } from './ReaderView';
import ReadingControls from './ReadingControls';
import OfflineControls from './OfflineControls';
import { useReading, useThemeStyles } from './ui';
import { motionDuration, settleEasing } from './motion';
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
  const s = useThemeStyles(styles);
  const reviewSync = useReviewSync();
  const reconnectReviews = reviewSync.reconnect;
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
    initialId?: string;
    returnTag?: number;
  }>();
  const captureFocusTicket = useRef(0);
  const capture = (evidence?: Evidence, page?: number) => {
    try {
      captureFocusTicket.current++;
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
  const [reviewing, setReviewing] = useState(false),
    [reviewRevision, setReviewRevision] = useState(0),
    [utilities, setUtilities] = useState(false),
    [sourceClosing, setSourceClosing] = useState(false),
    [navigationDisclosed, setNavigationDisclosed] = useState(false),
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
  const sourceLanding = useRef(new Animated.Value(1)).current;
  const browseMemory = useRef(new BrowseMemory()).current;
  const sourceOrientation = useRef<React.ElementRef<typeof View>>(null);
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { rail } = navigationLayout(
    width - insets.left - insets.right,
    height - insets.top - insets.bottom,
    fontScale,
  );
  const reading = state.view === 'note' && !!state.note && !reviewing;
  useEffect(() => setNavigationDisclosed(false), [reading]);
  const resourceMotion = useResourceMotion(
    state.scope,
    reading,
    state.note?.id,
    state.busy,
    rail,
  );
  const source = sourcePresentation(state);
  const sourceRoot = useRef<React.ElementRef<typeof View>>(null),
    sourceToken = useRef(0);
  const sourceConfirmation = useRef<(() => void) | undefined>(undefined);
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
        const confirm = () =>
          requestAnimationFrame(() => {
            const tag = findNodeHandle(sourceOrientation.current);
            if (!tag) return;
            void NativeModules.VaultorPresentation.awaitWindow(tag)
              .then((focused: boolean) => {
                if (
                  !focused ||
                  token !== sourceToken.current ||
                  model.snapshot().scope !== next.scope
                )
                  return;
                sourceLanding.setValue(0);
                Animated.timing(sourceLanding, {
                  toValue: 1,
                  duration: motionDuration(
                    'utility',
                    preferences.motion,
                    reduced,
                  ),
                  easing: settleEasing,
                  useNativeDriver: true,
                }).start(({ finished }) => {
                  if (
                    finished &&
                    token === sourceToken.current &&
                    model.snapshot().scope === next.scope
                  ) {
                    AccessibilityInfo.setAccessibilityFocus(tag);
                    VaultorHaptics.selectionSnap(
                      tag,
                      preferences.haptics !== 'off',
                    );
                  }
                });
              })
              .catch(() => {});
          });
        if (hosts) {
          sourceConfirmation.current = confirm;
          setSourceClosing(true);
        } else confirm();
      } catch (e) {
        if (token !== sourceToken.current) return;
        setSourceError((e as Error).message);
        requestAnimationFrame(() => {
          if (token !== sourceToken.current) return;
          const tag = findNodeHandle(sourceRoot.current);
          if (tag) VaultorHaptics.reject(tag, preferences.haptics !== 'off');
        });
      }
    });
  };
  const closeSources = () => {
    sourceToken.current++;
    sourceConfirmation.current = undefined;
    setSourceClosing(true);
  };
  const run = (f: () => Promise<void>) => void model.perform(f);
  const closeUtilities = () => setUtilities(false);
  const openSources = () => {
    setNavigationDisclosed(false);
    if (!state.host) setReviewing(false);
    setSourceClosing(false);
    setManageConnections(false);
    setHosts(true);
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
    if (utilities) {
      closeUtilities();
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
    if (navigationDisclosed) {
      setNavigationDisclosed(false);
      return true;
    }
    return false;
  };
  const back = () => {
    if (resourceMotion.pending) {
      resourceMotion.reset();
      run(() =>
        state.view === 'home' ? model.showHome() : model.showBrowser(),
      );
      return;
    }
    if (closeTransient()) return;
    if (keyboard.current) {
      Keyboard.dismiss();
      return;
    }
    if (reviewing) {
      setReviewing(false);
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
      !reviewing &&
      state.view === 'home'
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
    reviewing,
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
      reviews: reviewSync.refresh,
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
    reviewSync.refresh,
  ]);
  useEffect(() => {
    if (initialized && state.connection === 'online') reconnectReviews();
  }, [
    initialized,
    state.connection,
    state.host?.hostId,
    state.host?.epoch,
    reconnectReviews,
  ]);
  const select = (destination: RootDestination, search = false) => {
    closeUtilities();
    if (destination === 'trash') return;
    setReviewing(false);
    if (destination === 'home') run(() => model.showHome());
    else {
      model.updateBrowse(
        browseMemory.select(state.scope, state.browse, destination),
      );
      if (search) setSearchRequest(v => v + 1);
      run(() => model.showBrowser());
    }
  };
  useEffect(() => {
    setReaderPanel(undefined);
  }, [state.loadId, state.scope]);
  const open = (id: string, collection?: string) => {
    closeUtilities();
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
    closeUtilities();
    setRecovery(true);
    setRecoveryError('');
    void parse(native.legacyRecovery('inventory'))
      .then(setInventory)
      .catch((e: Error) => setRecoveryError(e.message));
  };
  const hostView = !state.host && !recovery;
  const heading = reviewing
    ? 'Review'
    : hostView
    ? 'Sources'
    : state.view === 'home'
    ? 'Home'
    : state.browse.collection?.name ||
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
          <Text accessibilityRole="header" style={s.section}>
            Trust & removal
          </Text>
          <Text style={s.secondary}>
            Forget approval only when you intend to disconnect this host.
            Protected Reviews and legacy recovery are retained.
          </Text>
          {state.hosts.map(h => (
            <View key={h.hostId} style={s.row}>
              <Text style={s.secondary}>{h.address}</Text>
              <Action
                label="Forget approval"
                onPress={() =>
                  Alert.alert(
                    'Forget this host?',
                    'Protected Reviews and legacy recovery are retained. Revoke the device on the host separately.',
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
        onPress={() => {
          setHosts(false);
          setAppearance(true);
        }}
      />
      <Action
        label="Offline downloads"
        onPress={() => {
          setHosts(false);
          setDownloads(true);
        }}
      />
    </ScrollView>
  );
  const choices = sourceChoices(state, sourceJobs, source.workspace);
  const quickSources = (
    <ScrollView
      contentContainerStyle={s.page}
      keyboardShouldPersistTaps="handled"
    >
      <View ref={sourceRoot} collapsable={false}>
        {sourceError ? (
          <Text accessibilityRole="alert" style={s.error}>
            {sourceError}
          </Text>
        ) : null}
        {choices.map(choice => (
          <Action
            key={choice.key}
            label={`${choice.name}${choice.current ? ' · Current' : ''}\n${
              choice.status
            }`}
            accessibilityLabel={`${choice.name}. ${choice.status}${
              choice.current ? '. Current source' : '. Choose source'
            }`}
            active={choice.current}
            disabled={state.busy || choice.locked || choice.current}
            onPress={() =>
              activateSource(
                async () => {
                  if (choice.scope) await model.openCompanion(choice.scope);
                  else {
                    await permission();
                    if (choice.hostId !== state.host?.hostId)
                      await model.switchHost(choice.hostId, true);
                    else await model.switchWorkspace(choice.workspaceId!, true);
                  }
                },
                choice.scope
                  ? { scope: choice.scope }
                  : { hostId: choice.hostId, workspaceId: choice.workspaceId },
              )
            }
          />
        ))}
        {choices.length < 2 ? (
          <Text style={s.secondary}>
            Your reading source. Add or manage connections in Source management.
          </Text>
        ) : null}
      </View>
      <Action
        label="Source management"
        onPress={() => setManageConnections(true)}
      />
    </ScrollView>
  );
  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom', 'left', 'right']}>
      <View style={[s.shell, rail && s.wideShell]}>
        <ResourceMotionProvider value={resourceMotion.context}>
          <View
            ref={resourceMotion.viewportRef}
            collapsable={false}
            onLayout={resourceMotion.measureViewport}
            style={[s.content, { zIndex: 1 }]}
          >
            {
              <View
                style={[
                  s.screenHeading,
                  reading && !resourceMotion.moving && s.obscured,
                ]}
                collapsable={false}
                pointerEvents={
                  reading || resourceMotion.pending ? 'none' : 'auto'
                }
                importantForAccessibility={
                  reading || resourceMotion.pending
                    ? 'no-hide-descendants'
                    : 'auto'
                }
              >
                <Text
                  accessibilityRole="header"
                  numberOfLines={1}
                  style={[
                    s.screenTitle,
                    (reviewing || hostView) && s.headingGrow,
                  ]}
                >
                  {heading}
                </Text>
                {!reviewing && !hostView ? (
                  <SourceContext
                    workspace={source.workspace}
                    availability={source.availability}
                    disabled={!initialized || state.busy}
                    open={openSources}
                    switchable={choices.length > 1}
                    sourceRef={
                      !reading && !resourceMotion.pending
                        ? sourceOrientation
                        : undefined
                    }
                    landing={sourceLanding}
                  />
                ) : null}
                <Action
                  label="⚙"
                  accessibilityLabel="Settings"
                  onPress={() => setUtilities(true)}
                />
              </View>
            }
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
              <View style={[s.content, reviewing && s.hidden]}>
                {sourceContent}
              </View>
            ) : (
              <View
                key="workspace-body"
                pointerEvents={
                  reading || resourceMotion.pending ? 'none' : 'auto'
                }
                style={[
                  s.content,
                  reviewing && s.hidden,
                  reading && !resourceMotion.moving && s.obscured,
                ]}
                collapsable={false}
                importantForAccessibility={
                  reading ||
                  resourceMotion.pending ||
                  reviewing ||
                  more ||
                  utilities ||
                  trail ||
                  state.preview ||
                  hosts ||
                  recovery
                    ? 'no-hide-descendants'
                    : 'auto'
                }
              >
                {state.view === 'home' ||
                (state.view === 'note' && state.noteOrigin === 'home') ? (
                  <HomeScreen
                    resume={state.note}
                    feed={feed}
                    select={select}
                    open={open}
                    retry={() => void quick.refresh()}
                    returnToNote={
                      state.note
                        ? () => run(() => model.returnToNote())
                        : undefined
                    }
                  />
                ) : null}
                <BrowseScreen
                  model={model}
                  visible={state.view === 'browse'}
                  retained={
                    state.view === 'note' && state.noteOrigin === 'browse'
                  }
                  suspended={reviewing || utilities || hosts || recovery}
                  searchRequest={searchRequest}
                  onAction={run}
                />
              </View>
            )}
            {state.note || resourceMotion.pending ? (
              <View
                style={[
                  StyleSheet.absoluteFill,
                  (!resourceMotion.visible || reviewing || hostView) &&
                    s.hidden,
                ]}
                importantForAccessibility={
                  !reading ||
                  more ||
                  utilities ||
                  hosts ||
                  recovery ||
                  state.preview
                    ? 'no-hide-descendants'
                    : 'auto'
                }
                pointerEvents={reading ? 'box-none' : 'none'}
              >
                <ReaderAperture motion={resourceMotion} reading={reading}>
                  {state.note ? (
                    <View
                      collapsable={false}
                      style={[s.content, resourceMotion.pending && s.hidden]}
                      pointerEvents={state.view === 'note' ? 'auto' : 'none'}
                      importantForAccessibility={
                        state.view === 'note' ? 'auto' : 'no-hide-descendants'
                      }
                    >
                      <ReaderView
                        model={model}
                        settings={() => setUtilities(true)}
                        panel={readerPanel}
                        closePanel={() => setReaderPanel(undefined)}
                        reduced={reduced}
                        onScroll={() => {}}
                        capture={evidence => capture(evidence)}
                      />
                    </View>
                  ) : null}
                  {resourceMotion.pending ? (
                    <View style={s.page}>
                      <Text style={s.section}>
                        {resourceMotion.presentation?.origin.title}
                      </Text>
                      <Text style={s.secondary}>Opening resource…</Text>
                    </View>
                  ) : null}
                </ReaderAperture>
              </View>
            ) : null}
            {reviewing ? (
              <ReviewDestination
                revision={reviewRevision + reviewSync.revision}
                syncing={reviewSync.busy}
                syncError={reviewSync.error}
                sync={reviewSync.sync}
                open={(initialId, returnTag) => {
                  captureFocusTicket.current++;
                  setCaptureRequest({ initialId, returnTag });
                }}
              />
            ) : null}
          </View>
          <NavigationFolio
            reading={reading || resourceMotion.pending}
            current={
              reviewing ? 'review' : state.view === 'home' ? 'home' : 'library'
            }
            titleMoving={resourceMotion.titleMoving}
            appearance={() => setReaderPanel('appearance')}
            title={
              (resourceMotion.pending
                ? resourceMotion.presentation?.origin.title
                : state.note?.title) || 'Reader'
            }
            workspace={source.workspace}
            availability={source.availability}
            disabled={!initialized || state.busy}
            sourceRef={sourceOrientation}
            landing={sourceLanding}
            disclosed={navigationDisclosed}
            disclose={() => setNavigationDisclosed(v => !v)}
            select={destination => {
              if (destination === 'review') {
                Keyboard.dismiss();
                setReviewing(true);
              } else select(destination);
            }}
            sources={openSources}
            more={() => (reading ? setMore(true) : setUtilities(true))}
            back={back}
          />
        </ResourceMotionProvider>
      </View>
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
        <ContextSheet
          title={manageConnections ? 'Source management' : 'Sources'}
          close={closeSources}
          motion="navigation"
          dismissing={sourceClosing}
          onDismissed={() => {
            setHosts(false);
            setSourceClosing(false);
            const confirm = sourceConfirmation.current;
            sourceConfirmation.current = undefined;
            confirm?.();
            const tag = findNodeHandle(sourceOrientation.current);
            if (tag) AccessibilityInfo.setAccessibilityFocus(tag);
          }}
        >
          {manageConnections ? sourceContent : quickSources}
        </ContextSheet>
      ) : null}
      {utilities ? (
        <ContextSheet title="Settings & tools" close={closeUtilities}>
          <ScrollView contentContainerStyle={s.page}>
            {state.host ? (
              <>
                <Action
                  label="Search workspace"
                  onPress={() => select('library', true)}
                />
                <Action
                  label="Collections"
                  onPress={() => select('collections')}
                />
                <Action label="Recent" onPress={() => select('recent')} />
                <Action label="Pinned" onPress={() => select('pinned')} />
                <Action
                  label="All resources"
                  onPress={() => {
                    model.updateBrowse({
                      ...state.browse,
                      destination: 'library',
                      collection: undefined,
                      query: '',
                      page: 0,
                    });
                    select('library');
                  }}
                />
              </>
            ) : null}
            <Action
              label="Sources"
              onPress={() => {
                closeUtilities();
                openSources();
              }}
            />
            <Action
              label="Source management"
              onPress={() => {
                closeUtilities();
                openSources();
                setManageConnections(true);
              }}
            />
            <Action
              label="Appearance & reading"
              onPress={() => {
                closeUtilities();
                setAppearance(true);
              }}
            />
            <Action
              label="Offline downloads"
              onPress={() => {
                closeUtilities();
                setDownloadTarget(undefined);
                setDownloads(true);
              }}
            />
            <Action
              label="Captures on this phone"
              onPress={() => {
                closeUtilities();
                setReviewing(true);
              }}
            />
            <Action label="Legacy recovery" onPress={recoveryOpen} />
          </ScrollView>
        </ContextSheet>
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
              { value: 'utilities', label: 'Settings' },
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
              else if (v === 'utilities') setUtilities(true);
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
          initialId={captureRequest.initialId}
          close={() => {
            const ticket = ++captureFocusTicket.current;
            const tag =
              captureRequest.returnTag ||
              findNodeHandle(sourceOrientation.current);
            const scope = captureRequest.seed?.scope;
            setCaptureRequest(undefined);
            setReviewRevision(v => v + 1);
            if (tag)
              requestAnimationFrame(() => {
                void NativeModules.VaultorPresentation.awaitWindow(tag)
                  .then((focused: boolean) => {
                    if (
                      focused &&
                      ticket === captureFocusTicket.current &&
                      (!scope || model.snapshot().scope === scope)
                    )
                      AccessibilityInfo.setAccessibilityFocus(tag);
                  })
                  .catch(() => {});
              });
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  shell: { flex: 1, flexDirection: 'column' },
  wideShell: { flexDirection: 'row-reverse' },
  content: { flex: 1 },
  screenHeading: {
    minHeight: 56,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#e8e8e8',
    flexShrink: 1,
    maxWidth: '42%',
  },
  headingGrow: { flex: 1, maxWidth: '100%' },
  overlayHost: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  hidden: { display: 'none' },
  obscured: { opacity: 0 },
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
