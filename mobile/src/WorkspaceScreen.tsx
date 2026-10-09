import { HomeScreen, WorkspaceDrawer } from './NavigationSurface';
import { QuickAccess, backIntent, type RootDestination } from './navigation';
import { usePalette, useThemeStyles } from './ui';
import { normalizeBrowse } from './browse';
import BrowseScreen, { Action, ChoiceSheet } from './BrowseScreen';
import MediaTools, { type MediaHandle } from './MediaTools';
import ResourcePreview from './ResourcePreview';
import React, {
  useEffect,
  useCallback,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  ActivityIndicator,
  AccessibilityInfo,
  findNodeHandle,
  useColorScheme,
  useWindowDimensions,
  Alert,
  AppState,
  BackHandler,
  Keyboard,
  NativeEventEmitter,
  NativeModules,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { bridgeMessage } from './bridge';
import {
  HostError,
  MobileWorkspace,
  type Host,
  type Summary,
} from './workspace';
const native = NativeModules.VaultorNative;
const parse = async <T,>(value: Promise<string>): Promise<T> =>
  JSON.parse(await value);
async function permission() {
  if (Number(Platform.Version) < 37) return;
  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_LOCAL_NETWORK,
  );
  if (result !== 'granted')
    throw Error(
      'Allow local-network access to connect. You can retry this permission.',
    );
}
const Button = ({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) => {
  const s = useThemeStyles(sheet);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        pressed && s.pressed,
        disabled && s.disabled,
      ]}
    >
      <Text style={s.buttonText}>{label}</Text>
    </Pressable>
  );
};
export default function WorkspaceScreen() {
  const s = useThemeStyles(sheet),
    palette = usePalette(),
    scheme = useColorScheme(),
    { fontScale, width } = useWindowDimensions();
  const menuButton = useRef<React.ElementRef<typeof Pressable>>(null);
  const [drawer, setDrawer] = useState(false),
    [editing, setEditing] = useState(false),
    [reducedMotion, setReducedMotion] = useState(false),
    [searchRequest, setSearchRequest] = useState(0);
  const model = useRef(
    new MobileWorkspace({
      storage: (action, value = {}) =>
        parse(native.storage(action, JSON.stringify(value))),
      activate: id => parse<Host>(native.activate(id)),
      cancelBrowse: () => native.cancelBrowse(),
      uuid: async () => (await parse<{ id: string }>(native.uuid())).id,
      api: async (host, path, method = 'GET', body, revision, channel) => {
        const deadline = Date.now() + 30000;
        for (;;) {
          const r = await parse<{ status: number; body: string }>(
            channel === 'browse'
              ? native.browseApiFor(host.hostId, host.epoch, path)
              : native.apiFor(
                  host.hostId,
                  host.epoch,
                  path,
                  method,
                  body === undefined ? null : JSON.stringify(body),
                  revision ?? null,
                ),
          );
          let value;
          try {
            value = r.body ? JSON.parse(r.body) : null;
          } catch {
            throw Error('Invalid host response. Local drafts retained.');
          }
          if (
            method === 'GET' &&
            channel !== 'browse' &&
            r.status === 409 &&
            value?.code === 'WORKSPACE_BUSY' &&
            Date.now() < deadline
          ) {
            await new Promise<void>(resolve => setTimeout(resolve, 250));
            continue;
          }
          if (r.status < 200 || r.status >= 300)
            throw new HostError(
              r.status,
              r.status === 412
                ? 'Saved note changed on another device. Review recovery.'
                : r.status === 401 || r.status === 403
                ? 'Host approval revoked or denied. Pair again; drafts remain.'
                : `Host request failed (${r.status}). Protected drafts retained.`,
            );
          return value;
        }
      },
    }),
  ).current;
  const state = useSyncExternalStore(model.subscribe, model.snapshot);
  const shortcuts = useRef(
    new QuickAccess(
      path => model.browseApi(path),
      () => model.cancelBrowse(),
    ),
  ).current;
  const feed = useSyncExternalStore(shortcuts.subscribe, shortcuts.snapshot);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion);
    const event = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReducedMotion,
    );
    return () => event.remove();
  }, []);
  const web = useRef<WebView<{}>>(null),
    hostScroll = useRef<React.ElementRef<typeof ScrollView>>(null),
    media = useRef<MediaHandle>(null),
    ready = useRef(false),
    current = useRef(state),
    keyboard = useRef(false),
    wasEditing = useRef(false);
  current.current = state;
  const [address, setAddress] = useState('https://'),
    [code, setCode] = useState(''),
    [connections, setConnections] = useState(false),
    [recovery, setRecovery] = useState(false),
    [renderer, setRenderer] = useState(0),
    [trail, setTrail] = useState(false);
  const loadId = String(state.loadId) + ':' + renderer;
  const run = useCallback(
    (action: () => Promise<void>) => void model.perform(action),
    [model],
  );
  const inject = useCallback(
    (message: object) =>
      web.current?.injectJavaScript(
        `window.vaultorReceive(${JSON.stringify(
          JSON.stringify({ protocol: 1, loadId, ...message }),
        )});true;`,
      ),
    [loadId],
  );
  const load = () => {
    if (ready.current && state.content) {
      inject({
        type: 'load',
        loadId,
        content: state.content,
        position: state.position,
        editable: editing,
        theme: scheme === 'light' ? 'light' : 'dark',
      });
    }
  };
  useEffect(() => {
    void model.perform(async () => {
      const bootstrap = await model.refreshRecovery();
      if (bootstrap.selected) await permission();
      await model.initialize();
    });
  }, [model]);
  useEffect(() => {
    if (state.host) setAddress(state.host.address);
  }, [state.host]);
  useEffect(() => {
    if (code)
      requestAnimationFrame(() =>
        hostScroll.current?.scrollToEnd({ animated: true }),
      );
  }, [code]);
  useEffect(() => {
    ready.current = false;
  }, [loadId]);
  useEffect(() => {
    setEditing(false);
  }, [state.loadId]);
  useEffect(() => {
    const focus = editing && !wasEditing.current;
    wasEditing.current = editing;
    if (ready.current) {
      if (focus) web.current?.requestFocus();
      inject({ type: 'theme', value: scheme === 'light' ? 'light' : 'dark' });
      inject({
        type: 'editable',
        value:
          editing &&
          !drawer &&
          state.view === 'note' &&
          !connections &&
          !recovery &&
          state.supported &&
          !state.conflict &&
          !state.unavailable &&
          state.connection !== 'revoked',
        focus,
      });
      native.editorKeyboard(focus);
    }
  }, [
    editing,
    drawer,
    connections,
    recovery,
    state.view,
    scheme,
    state.supported,
    state.conflict,
    state.unavailable,
    state.connection,
    inject,
  ]);
  useEffect(() => {
    let active = AppState.currentState === 'active',
      timer: ReturnType<typeof setTimeout> | undefined,
      reconcile: ReturnType<typeof setTimeout> | undefined,
      cursor = '',
      retry = 1000;
    const start = () => {
      const h = current.current.host;
      if (!active || !h || current.current.connection !== 'online') return;
      void native
        .startChanges(h.hostId, h.epoch, cursor)
        .catch(() => schedule());
    };
    const schedule = () => {
      if (timer) clearTimeout(timer);
      if (active)
        timer = setTimeout(() => {
          void model.perform(async () => {
            await permission();
            await model.connect(false);
            start();
          });
        }, retry);
      retry = Math.min(retry * 2, 30000);
    };
    const subscription = new NativeEventEmitter(native).addListener(
      'VaultorChanges',
      (...args) => {
        try {
          if (typeof args[0] !== 'string') return;
          const m = JSON.parse(args[0]),
            h = current.current.host;
          if (!active || m.epoch !== h?.epoch || m.hostId !== h?.hostId) return;
          if (m.closed) {
            if (m.status === 401 || m.status === 403) {
              void model.perform(() => model.connect(false));
              return;
            }
            schedule();
            return;
          }
          const event = m.event;
          if (
            !event ||
            typeof event.cursor !== 'string' ||
            event.cursor.length > 128 ||
            ![
              'reset',
              'resources',
              'workspace',
              'host-restart',
              'operation',
              'organization',
              'settings',
              'tags',
            ].includes(event.kind)
          )
            return;
          cursor = event.cursor;
          retry = 1000;
          if (reconcile) clearTimeout(reconcile);
          reconcile = setTimeout(() => {
            if (active) void model.changedFeed().catch(e => model.report(e));
          }, 250);
        } catch {
          /* Malformed metadata is ignored, never document content. */
        }
      },
    );
    const app = AppState.addEventListener('change', value => {
      active = value === 'active';
      if (!active) {
        native.stopChanges();
        if (timer) clearTimeout(timer);
        if (reconcile) clearTimeout(reconcile);
        void model.protect().catch(e => model.report(e));
      } else {
        void model.perform(async () => {
          await permission();
          await model.connect(false);
          start();
        });
      }
    });
    start();
    return () => {
      active = false;
      subscription.remove();
      app.remove();
      if (timer) clearTimeout(timer);
      if (reconcile) clearTimeout(reconcile);
      native.stopChanges();
    };
  }, [model, state.host?.epoch]);
  useEffect(() => {
    if (state.connection === 'online' && state.host)
      void native
        .startChanges(state.host.hostId, state.host.epoch, '')
        .catch((e: unknown) => model.report(e));
  }, [state.connection, state.host, model]);
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
  useEffect(() => {
    shortcuts.bind(state.scope);
    if (
      !state.host ||
      connections ||
      recovery ||
      (!drawer && state.view !== 'home')
    ) {
      shortcuts.suspend();
      return;
    }
    let active = true;
    const refresh = () => {
      if (active && AppState.currentState === 'active')
        void shortcuts.refresh();
    };
    const timer = setTimeout(refresh, 20);
    const event = AppState.addEventListener('change', value => {
      if (value === 'active') refresh();
      else shortcuts.suspend();
    });
    return () => {
      active = false;
      clearTimeout(timer);
      event.remove();
      shortcuts.suspend();
    };
  }, [
    shortcuts,
    state.scope,
    state.host,
    state.view,
    state.browseVersion,
    state.connection,
    drawer,
    connections,
    recovery,
  ]);
  const closeDrawer = () => {
    setDrawer(false);
    requestAnimationFrame(() => {
      const tag = findNodeHandle(menuButton.current);
      if (tag) AccessibilityInfo.setAccessibilityFocus(tag);
    });
  };
  const selectDestination = (destination: RootDestination, search = false) => {
    closeDrawer();
    Keyboard.dismiss();
    inject({ type: 'blur' });
    run(async () => {
      if (destination === 'home') await model.showHome();
      else {
        if (state.browse.destination !== destination || search)
          model.updateBrowse(
            normalizeBrowse({
              ...state.browse,
              destination,
              collection: undefined,
              query: search ? '' : state.browse.query,
              type: '',
              mode: 'title',
              page: 0,
              scroll: 0,
            }),
          );
        await model.showBrowser();
        if (search) setSearchRequest(n => n + 1);
      }
    });
  };
  const shortcutOpen = (id: string, collection?: string) => {
    closeDrawer();
    run(async () => {
      if (collection !== undefined) {
        await model.protect();
        model.updateBrowse(
          normalizeBrowse({
            ...state.browse,
            destination: 'library',
            collection: { id, name: collection },
            query: '',
            type: '',
            mode: 'title',
            page: 0,
            scroll: 0,
          }),
        );
        await model.showBrowser();
      } else await model.routeResource(id);
    });
  };
  const leave = useCallback(
    () =>
      run(async () => {
        keyboard.current = false;
        Keyboard.dismiss();
        web.current?.injectJavaScript(
          'window.vaultorReceive(JSON.stringify({protocol:1,type:"blur"}));true;',
        );
        await model.leaveNote();
      }),
    [model, run],
  );
  useEffect(() => {
    const screenBack = () => {
      if (drawer) {
        closeDrawer();
        return true;
      }
      const intent = backIntent({
        transient: recovery || connections,
        keyboard: false,
        editing,
        view: current.current.view,
        cursor: current.current.journey.cursor,
        collection: Boolean(current.current.browse.collection),
      });
      if (intent === 'read') {
        setEditing(false);
        Keyboard.dismiss();
        inject({ type: 'blur' });
        return true;
      }
      if (intent === 'home') {
        run(() => model.showHome());
        return true;
      }
      if (recovery) {
        setRecovery(false);
        return true;
      }
      if (connections) {
        setConnections(false);
        return true;
      }
      if (current.current.view === 'note' && current.current.note) {
        if (current.current.journey.cursor > 0)
          run(() => model.history(current.current.journey.cursor - 1));
        else leave();
        return true;
      }
      if (
        current.current.view === 'browse' &&
        current.current.browse.collection
      ) {
        model.updateBrowse({
          ...current.current.browse,
          collection: undefined,
          page: 0,
          scroll: 0,
        });
        return true;
      }
      if (current.current.busy) return true;
      if (
        current.current.recovery.length ||
        (media.current?.pending() ?? 0) > 0
      ) {
        Alert.alert(
          'Protected drafts remain',
          'Pending edits and media inputs remain on this device. Exit Vaultor?',
          [
            { text: 'Stay', style: 'cancel' },
            {
              text: 'Exit',
              onPress: () =>
                run(async () => {
                  await model.protect();
                  BackHandler.exitApp();
                }),
            },
          ],
        );
        return true;
      }
      return false;
    };
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (current.current.preview) {
        model.dismissPreview();
        return true;
      }
      if (trail) {
        setTrail(false);
        return true;
      }
      if (keyboard.current) {
        keyboard.current = false;
        const source = current.current.loadId,
          host = current.current.host?.epoch;
        native
          .isKeyboardVisible()
          .then((visible: boolean) => {
            if (
              source !== current.current.loadId ||
              host !== current.current.host?.epoch
            )
              return;
            if (visible) {
              Keyboard.dismiss();
              inject({ type: 'blur' });
            } else if (!screenBack()) BackHandler.exitApp();
          })
          .catch((error: unknown) => model.report(error));
        return true;
      }
      return screenBack();
    });
    return () => back.remove();
  }, [
    connections,
    recovery,
    model,
    leave,
    run,
    trail,
    inject,
    editing,
    drawer,
  ]);
  const switchHost = (id: string) =>
    run(async () => {
      try {
        await model.switchHost(id);
        setConnections(false);
      } catch (e) {
        model.report(e);
        Alert.alert(
          'Save did not complete',
          'Keep the protected draft on this device and switch hosts?',
          [
            { text: 'Stay', style: 'cancel' },
            {
              text: 'Keep drafts and switch',
              onPress: () =>
                run(async () => {
                  await model.switchHost(id, true);
                  setConnections(false);
                }),
            },
          ],
        );
      }
    });
  const copy = (d: Summary) =>
    Alert.alert(
      'Open recovered copy',
      `Create a separate note on ${
        state.host?.address ?? 'the selected host'
      }? The saved original is retained.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Create copy',
          onPress: () =>
            run(async () => {
              await model.recoveredCopy(d);
              setRecovery(false);
            }),
        },
      ],
    );
  const finishPairing = (keep = false) =>
    run(async () => {
      if (!keep) {
        try {
          await model.save();
        } catch (e) {
          model.report(e);
          Alert.alert(
            'Save did not complete',
            'Keep protected drafts on this device and connect to the approved host?',
            [
              { text: 'Stay', style: 'cancel' },
              {
                text: 'Keep drafts and connect',
                onPress: () => finishPairing(true),
              },
            ],
          );
          return;
        }
      }
      await model.protect();
      const result = await parse<{ state: string }>(native.completePairing());
      if (result.state !== 'APPROVED')
        throw Error(
          'Waiting for host approval. Compare and approve the code there, then retry.',
        );
      await model.adopted();
      setCode('');
      setConnections(false);
    });
  const renderRecovery = (d: Summary) => (
    <View style={s.row} key={d.scope + d.noteId + d.version}>
      <Text style={s.heading}>{d.title}</Text>
      <Text style={s.muted}>
        {d.scope === state.scope
          ? 'Current workspace'
          : 'Separate retained workspace'}{' '}
        · {d.resolved ? 'Saved version chosen' : 'Pending draft'}
      </Text>
      <View style={s.actions}>
        <Button
          label="Open recovered copy"
          disabled={state.busy || state.connection !== 'online'}
          onPress={() => copy(d)}
        />
        <Button
          label="Discard recovery"
          disabled={state.busy || state.draft?.version === d.version}
          onPress={() =>
            Alert.alert(
              'Discard this recovery?',
              'Only this exact local edit version will be removed. Saved resources are unchanged.',
              [
                { text: 'Keep', style: 'cancel' },
                {
                  text: 'Discard',
                  style: 'destructive',
                  onPress: () => run(() => model.removeRecovery(d)),
                },
              ],
            )
          }
        />
      </View>
    </View>
  );
  const hostView = connections || !state.host;
  const hostsAction = () =>
    run(async () => {
      await model.protect();
      setConnections(!hostView);
      setCode('');
    });
  const recoveryAction = () =>
    run(async () => {
      await model.protect();
      await model.refreshRecovery();
      setRecovery(!recovery);
    });
  return (
    <SafeAreaView
      style={[s.root, drawer && width >= 840 && s.docked]}
      edges={['top', 'bottom']}
    >
      <View
        style={s.main}
        importantForAccessibility={
          drawer && width < 840 ? 'no-hide-descendants' : 'auto'
        }
      >
        <View style={s.header}>
          {!hostView && !recovery ? (
            <Pressable
              ref={menuButton}
              accessibilityRole="button"
              accessibilityLabel="Open navigation"
              onPress={() => {
                Keyboard.dismiss();
                inject({ type: 'blur' });
                setDrawer(true);
              }}
              style={s.navButton}
            >
              <Text style={[s.navGlyph, { color: palette.text }]}>☰</Text>
            </Pressable>
          ) : null}
          {state.view === 'note' && !hostView && !recovery ? (
            <Action
              label="‹"
              accessibilityLabel="Back"
              disabled={state.busy}
              onPress={() => {
                if (editing) {
                  setEditing(false);
                  Keyboard.dismiss();
                  inject({ type: 'blur' });
                } else if (state.journey.cursor > 0)
                  run(() => model.history(state.journey.cursor - 1));
                else leave();
              }}
            />
          ) : null}
          <Text accessibilityRole="header" numberOfLines={1} style={s.title}>
            {hostView
              ? 'Workspaces'
              : recovery
              ? 'Recovery'
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
                }[state.browse.destination]}
          </Text>
          <View style={s.headerActions}>
            {hostView ? (
              <Action
                label="Done"
                disabled={state.busy}
                onPress={hostsAction}
              />
            ) : recovery ? (
              <Action
                label="Close recovery"
                disabled={state.busy}
                onPress={recoveryAction}
              />
            ) : state.view === 'note' ? (
              <>
                <Action
                  label={editing ? 'Done' : 'Edit'}
                  disabled={
                    !state.supported ||
                    state.conflict ||
                    state.unavailable ||
                    state.connection === 'revoked'
                  }
                  onPress={() => {
                    setEditing(!editing);
                    if (editing) {
                      Keyboard.dismiss();
                      inject({ type: 'blur' });
                    }
                  }}
                />
                {editing ? (
                  <Action
                    label="Save"
                    disabled={
                      state.busy ||
                      !state.supported ||
                      state.conflict ||
                      state.unavailable ||
                      state.connection === 'revoked'
                    }
                    onPress={() => run(() => model.save())}
                  />
                ) : null}
                <Action
                  label="•••"
                  accessibilityLabel="Note actions"
                  onPress={() =>
                    Alert.alert(
                      'Note',
                      state.draft ? state.status : undefined,
                      [
                        {
                          text: 'Journey',
                          onPress: () => {
                            Keyboard.dismiss();
                            inject({ type: 'blur' });
                            setTrail(true);
                          },
                        },
                        {
                          text: 'Library',
                          onPress: () => selectDestination('library'),
                        },
                        { text: 'Close', style: 'cancel' },
                      ],
                    )
                  }
                />
              </>
            ) : null}
          </View>
        </View>
        {state.error ? (
          <View accessibilityRole="alert" style={s.error}>
            <Text style={s.errorText}>{state.error}</Text>
            <Button
              label={
                state.navigationRetry ? 'Retry navigation' : 'Retry connection'
              }
              disabled={state.busy}
              onPress={() =>
                run(async () => {
                  if (state.navigationRetry) {
                    await model.retryNavigation();
                    return;
                  }
                  await permission();
                  await model.connect(false);
                })
              }
            />
          </View>
        ) : null}
        {state.busy ? (
          <ActivityIndicator
            style={{ position: 'absolute', top: 8, right: 8 }}
            color="#70a5ff"
          />
        ) : null}
        {recovery ? (
          <ScrollView contentContainerStyle={s.content}>
            <Text style={s.heading}>Recovery</Text>
            <Text style={s.muted}>
              Drafts remain separate by host and workspace. Copies are created
              only on the explicitly selected destination.
            </Text>
            {state.recovery.length ? (
              state.recovery.map(renderRecovery)
            ) : (
              <Text style={s.muted}>No retained drafts.</Text>
            )}
          </ScrollView>
        ) : hostView ? (
          <ScrollView
            ref={hostScroll}
            contentContainerStyle={s.content}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => {
              if (code) hostScroll.current?.scrollToEnd({ animated: true });
            }}
          >
            <Text style={s.heading}>Connect to your workspace</Text>
            <Text style={s.muted}>
              Enable Sharing on your Windows or Mac host. Saved approvals are
              remembered.
            </Text>
            {state.hosts.map(h => (
              <View style={s.row} key={h.hostId}>
                <Text style={s.muted}>{h.address}</Text>
                <View style={s.actions}>
                  <Button
                    label={
                      h.hostId === state.host?.hostId ? 'Reconnect' : 'Connect'
                    }
                    disabled={state.busy}
                    onPress={() => switchHost(h.hostId)}
                  />
                  <Button
                    label="Remove host"
                    disabled={state.busy}
                    onPress={() =>
                      Alert.alert(
                        'Remove remembered approval?',
                        'Credentials and clean caches are removed on this device. Recovery drafts remain; revoke access on the host to invalidate the server approval.',
                        [
                          { text: 'Keep', style: 'cancel' },
                          {
                            text: 'Remove',
                            style: 'destructive',
                            onPress: () =>
                              run(async () => {
                                await model.protect();
                                await native.signOut(h.hostId);
                                model.forgotten(h.hostId);
                                await model.refreshRecovery();
                                setConnections(true);
                              }),
                          },
                        ],
                      )
                    }
                  />
                </View>
              </View>
            ))}
            <TextInput
              accessibilityLabel="Host HTTPS address"
              style={s.input}
              value={address}
              onChangeText={setAddress}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Button
              label="Pair with host"
              disabled={state.busy}
              onPress={() =>
                run(async () => {
                  await model.protect();
                  await permission();
                  const result = await parse<{ code: string }>(
                    native.beginPairing(address),
                  );
                  setCode(result.code);
                })
              }
            />
            {code ? (
              <>
                <Text style={s.heading}>Compare code: {code}</Text>
                <Text style={s.muted}>
                  Approve only the matching code on the host.
                </Text>
                <Action
                  label="I approved the matching code"
                  disabled={state.busy}
                  onPress={() => finishPairing()}
                />
              </>
            ) : null}
            {state.host ? (
              <Button
                label="Verify changed address"
                disabled={state.busy}
                onPress={() =>
                  run(async () => {
                    await model.protect();
                    await permission();
                    await native.changeAddress(state.host!.hostId, address);
                    await model.adopted();
                    setConnections(false);
                  })
                }
              />
            ) : null}
          </ScrollView>
        ) : null}
        <View style={s.actions}>
          <MediaTools
            ref={media}
            model={model}
            loadId={loadId}
            visible={
              editing &&
              state.view === 'note' &&
              !hostView &&
              !recovery &&
              !drawer
            }
            send={inject}
          />
        </View>
        {!hostView &&
        !recovery &&
        !(drawer && width < 840) &&
        state.view === 'home' ? (
          <HomeScreen
            feed={feed}
            select={selectDestination}
            open={shortcutOpen}
            retry={() => {
              void shortcuts.refresh();
            }}
            returnToNote={
              state.note ? () => run(() => model.returnToNote()) : undefined
            }
          />
        ) : null}
        <BrowseScreen
          model={model}
          visible={
            !hostView &&
            !recovery &&
            !(drawer && width < 840) &&
            state.view === 'browse'
          }
          suspended={drawer}
          searchRequest={searchRequest}
          onAction={run}
        />
        {state.note ? (
          <View
            style={[
              s.workspace,
              (hostView || recovery || state.view !== 'note') && s.hidden,
            ]}
            pointerEvents={
              hostView || recovery || state.view !== 'note' ? 'none' : 'auto'
            }
            importantForAccessibility={
              hostView || recovery || state.view !== 'note'
                ? 'no-hide-descendants'
                : 'yes'
            }
          >
            {editing ||
            state.draft ||
            state.unavailable ||
            state.connection !== 'online' ? (
              <Text accessibilityLiveRegion="polite" style={s.noteStatus}>
                {state.connection !== 'online' ? 'Host unavailable · ' : ''}
                {state.status}
              </Text>
            ) : null}
            {state.conflict ? (
              <View style={s.recovery}>
                <Text style={s.muted}>
                  Your local version is retained. The saved original will not be
                  overwritten.
                </Text>
                <View style={s.actions}>
                  <Button
                    label="Open recovered copy"
                    disabled={state.busy || state.connection !== 'online'}
                    onPress={() => {
                      if (state.draft) copy(state.draft);
                    }}
                  />
                  {!state.unavailable ? (
                    <Button
                      label="Use saved version"
                      disabled={state.busy}
                      onPress={() => run(() => model.useSaved())}
                    />
                  ) : null}
                </View>
              </View>
            ) : null}
            <WebView<{}>
              ref={web}
              key={loadId}
              source={{ uri: 'file:///android_asset/editor.html' }}
              originWhitelist={['file://']}
              textZoom={Math.round(fontScale * 100)}
              javaScriptEnabled
              domStorageEnabled={false}
              allowFileAccess
              allowFileAccessFromFileURLs={false}
              allowUniversalAccessFromFileURLs={false}
              mixedContentMode="never"
              setSupportMultipleWindows={false}
              onShouldStartLoadWithRequest={r =>
                r.url === 'file:///android_asset/editor.html' ||
                r.url === 'about:blank'
              }
              onMessage={e => {
                const m = bridgeMessage(e.nativeEvent.data, loadId);
                if (!m) return;
                if (
                  m.type === 'mediaSelect' &&
                  !editing &&
                  m.attrs?.resourceId
                ) {
                  run(() => model.routeResource(m.attrs!.resourceId));
                  return;
                }
                if (m.type.startsWith('media')) {
                  media.current?.receive(m);
                  return;
                }
                if (m.type === 'ready') {
                  ready.current = true;
                  load();
                } else if (m.type === 'loaded') model.loaded();
                else if (m.type === 'unsupported') model.unsupported();
                else if (m.type === 'changed' && m.content)
                  model.changed(m.content);
                else if (m.type === 'open' && m.resourceId) {
                  Keyboard.dismiss();
                  inject({ type: 'blur' });
                  run(() => model.routeResource(m.resourceId!, true));
                } else if (m.type === 'position' && m.position)
                  model.reading(m.position);
              }}
              onRenderProcessGone={() => {
                ready.current = false;
                model.unsupported();
                model.report(
                  Error(
                    'Editor stopped. Protected drafts remain. Reopen the editor.',
                  ),
                );
              }}
              style={s.web}
              containerStyle={s.web}
            />
            {editing ? (
              <View style={s.actions}>
                {['bold', 'italic', 'undo', 'redo'].map(name => (
                  <Action
                    key={name}
                    label={name}
                    disabled={
                      !state.supported ||
                      state.conflict ||
                      state.unavailable ||
                      state.connection === 'revoked'
                    }
                    onPress={() => inject({ type: 'command', name })}
                  />
                ))}
              </View>
            ) : null}
            {!state.supported ? (
              <Button
                label="Reopen editor"
                disabled={state.busy}
                onPress={() =>
                  run(async () => {
                    await model.protect();
                    setRenderer(v => v + 1);
                  })
                }
              />
            ) : null}
          </View>
        ) : null}
      </View>
      {drawer ? (
        <WorkspaceDrawer
          feed={feed}
          select={selectDestination}
          open={shortcutOpen}
          retry={() => {
            void shortcuts.refresh();
          }}
          close={closeDrawer}
          current={
            state.view === 'home'
              ? 'home'
              : state.view === 'browse'
              ? state.browse.destination
              : ''
          }
          host={state.host?.address}
          recoveryCount={state.recovery.length}
          reducedMotion={reducedMotion}
          hosts={() => {
            closeDrawer();
            hostsAction();
          }}
          recovery={() => {
            closeDrawer();
            recoveryAction();
          }}
        />
      ) : null}
      {trail ? (
        <ChoiceSheet
          title="Journey"
          choices={state.journey.visits.map((v, index) => ({
            value: String(index),
            label:
              (index === state.journey.cursor ? 'Current · ' : '') +
              v.title +
              (v.unavailable ? ' · unavailable' : ''),
          }))}
          close={() => setTrail(false)}
          onChoose={index => run(() => model.history(Number(index)))}
        />
      ) : null}
      {state.preview ? <ResourcePreview model={model} /> : null}
    </SafeAreaView>
  );
}
const sheet = StyleSheet.create({
  main: { flex: 1 },
  navButton: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  navGlyph: { fontSize: 22 },
  noteStatus: {
    color: '#b3b3b3',
    fontSize: 12,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  trailTitle: { flex: 1, color: '#b3b3b3', fontSize: 12 },
  previewScrim: {
    flex: 1,
    backgroundColor: '#000b',
    justifyContent: 'center',
    padding: 20,
  },
  previewPanel: {
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 16,
    padding: 20,
    gap: 14,
  },
  root: { flex: 1, backgroundColor: '#000', flexDirection: 'row' },
  docked: { flexDirection: 'row-reverse' },
  header: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderBottomWidth: 1,
    borderColor: '#252525',
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  title: { color: '#e8e8e8', fontSize: 18, fontWeight: '600', flex: 1 },
  content: { padding: 16, gap: 14 },
  heading: { color: '#e8e8e8', fontSize: 18, fontWeight: '600' },
  muted: { color: '#b3b3b3', fontSize: 13, lineHeight: 19 },
  input: {
    color: '#e8e8e8',
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#555',
    borderRadius: 8,
    padding: 12,
  },
  button: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#333',
  },
  buttonText: { color: '#90b8ff', fontSize: 14 },
  pressed: { backgroundColor: '#1e1e1e' },
  disabled: { opacity: 0.45 },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 6,
  },
  row: {
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: '#252525',
  },
  error: { padding: 10, borderBottomWidth: 1, borderColor: '#753f3f', gap: 8 },
  errorText: { color: '#ffb4b4', fontSize: 13 },
  workspace: { flex: 1 },
  hidden: { display: 'none' },
  status: {
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  recovery: { padding: 10, gap: 8 },
  web: { flex: 1, backgroundColor: '#000' },
});
