import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from 'react';
import {
  NativeModules,
  useWindowDimensions,
  View,
  Text,
  TextInput,
  Alert,
  Animated,
  AppState,
  StyleSheet,
  Keyboard,
  findNodeHandle,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { WebView } from 'react-native-webview';
import type { MobileWorkspace } from './workspace';
import { Action, ChoiceSheet } from './BrowseScreen';
import ReadingControls from './ReadingControls';
import { useAppearance, useReading, usePalette, useThemeStyles } from './ui';
import { motionDuration, settleEasing } from './motion';
import { externalAddress } from './reading';
import type { Evidence } from './reviews';
export type ReaderPanel = 'outline' | 'find' | 'appearance' | undefined;
export default function ReaderView({
  model,
  panel,
  closePanel,
  reduced,
  onScroll,
  capture,
}: {
  model: MobileWorkspace;
  panel: ReaderPanel;
  closePanel: () => void;
  reduced: boolean;
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  capture: (evidence: Evidence) => void;
}) {
  const state = model.snapshot(),
    web = useRef<WebView<{}>>(null),
    ready = useRef(false),
    alive = useRef(true),
    theme = useAppearance(),
    { preferences } = useReading(),
    palette = usePalette(),
    s = useThemeStyles(styles),
    { fontScale } = useWindowDimensions();
  const [headings, setHeadings] = useState<
      { id: string; title: string; level: number }[]
    >([]),
    [query, setQuery] = useState(''),
    [matches, setMatches] = useState({ count: 0, current: 0, limited: false });
  const findInput = useRef<React.ElementRef<typeof TextInput>>(null);
  const findProgress = useRef(new Animated.Value(0)).current;
  const [controlsBottom, setControlsBottom] = useState(0);
  useEffect(() => {
    if (panel !== 'find') {
      findProgress.setValue(0);
      return;
    }
    if (!controlsBottom) return;
    const animation = Animated.timing(findProgress, {
      toValue: 1,
      duration: motionDuration('utility', preferences.motion, reduced),
      easing: settleEasing,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [panel, controlsBottom, preferences.motion, reduced, findProgress]);
  const [selection, setSelection] = useState<Evidence>();
  const wasVisible = useRef(false);
  const visible = state.view === 'note' && !state.preview;
  const current = useRef(state);
  current.current = state;
  const send = useCallback(
    (m: object) =>
      web.current?.injectJavaScript(
        'window.vaultorReceive(' +
          JSON.stringify(JSON.stringify(m)) +
          ');true;',
      ),
    [],
  );
  useEffect(() => {
    if (!ready.current) return;
    send({
      type: 'context',
      loadId: String(current.current.loadId),
      bottom: panel === 'find' ? controlsBottom : 0,
    });
  }, [panel, controlsBottom, send]);
  const focusSequence = useRef(0);
  useEffect(() => {
    if (panel !== 'find') return;
    const token =
      String(current.current.loadId) + ':' + ++focusSequence.current;
    const frame = requestAnimationFrame(() => {
      const tag = findNodeHandle(findInput.current);
      if (!tag) return;
      const focus = NativeModules.VaultorPresentation?.focusInput?.(tag, token);
      if (!focus) {
        findInput.current?.focus();
        return;
      }
      void focus.catch(() => {});
    });
    return () => {
      cancelAnimationFrame(frame);
      NativeModules.VaultorPresentation?.cancelInputFocus?.(token);
    };
  }, [panel]);
  const options = useMemo(
    () => ({ ...preferences, theme, accent: palette.accent, reduced }),
    [preferences, theme, palette.accent, reduced],
  );
  const latestOptions = useRef(options);
  latestOptions.current = options;
  const load = useCallback(
    () =>
      send({
        type: 'load',
        loadId: String(current.current.loadId),
        content: current.current.content,
        noteId: current.current.note?.id,
        revision: current.current.note?.revision,
        scroll: current.current.position?.scroll,
        position: current.current.position,
        ...latestOptions.current,
      }),
    [send],
  );
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      ready.current = false;
    };
  }, []);
  useEffect(() => {
    setSelection(undefined);
    setHeadings([]);
    setQuery('');
    setMatches({ count: 0, current: 0, limited: false });
    if (ready.current) load();
  }, [state.loadId, load]);
  useEffect(() => {
    if (ready.current) send({ type: 'preferences', ...options });
  }, [options, send]);
  useEffect(() => {
    const event = AppState.addEventListener('change', v => {
      if (v !== 'active')
        send({ type: 'flush', loadId: String(current.current.loadId) });
    });
    return () => event.remove();
  }, [send]);
  useEffect(() => {
    if (!ready.current) return;
    const timer = setTimeout(
      () =>
        send({
          type: 'find',
          loadId: String(current.current.loadId),
          query: panel === 'find' ? query : '',
        }),
      120,
    );
    return () => clearTimeout(timer);
  }, [query, panel, state.loadId, send]);
  useEffect(() => {
    const ref = state.referenceSelection;
    if (ref && ref.revision === state.note?.revision && ready.current) {
      send({ type: 'occurrence', loadId: String(state.loadId), ...ref });
      model.consumeReference();
    }
  }, [
    state.referenceSelection,
    state.loadId,
    state.note?.revision,
    model,
    send,
  ]);
  useEffect(() => {
    if (visible && !wasVisible.current && ready.current)
      send({
        type: 'restore',
        loadId: String(current.current.loadId),
        position: current.current.position,
        revision: current.current.note?.revision,
      });
    wasVisible.current = visible;
  }, [visible, send]);
  const close = () => {
    Keyboard.dismiss();
    closePanel();
  };
  return (
    <View style={s.root} collapsable={false}>
      <Animated.View
        collapsable={false}
        style={
          panel === 'find'
            ? [
                s.find,
                {
                  transform: [
                    {
                      translateY: findProgress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [controlsBottom || 64, 0],
                      }),
                    },
                  ],
                },
              ]
            : s.hidden
        }
        onLayout={e => setControlsBottom(e.nativeEvent.layout.height)}
      >
        {panel === 'find' ? (
          <>
            <TextInput
              ref={findInput}
              style={s.input}
              accessibilityLabel="Find within note"
              placeholder="Find in note"
              placeholderTextColor={palette.muted}
              value={query}
              maxLength={200}
              onChangeText={setQuery}
              onSubmitEditing={() => {
                Keyboard.dismiss();
                send({
                  type: 'findStep',
                  loadId: String(state.loadId),
                  delta: 1,
                });
              }}
            />
            <Text accessibilityLiveRegion="polite" style={s.muted}>
              {matches.count
                ? matches.current +
                  '/' +
                  matches.count +
                  (matches.limited ? '+' : '')
                : '0'}
            </Text>
            <Action
              label="↑"
              accessibilityLabel="Previous match"
              disabled={!matches.count}
              onPress={() =>
                send({
                  type: 'findStep',
                  loadId: String(state.loadId),
                  delta: -1,
                })
              }
            />
            <Action
              label="↓"
              accessibilityLabel="Next match"
              disabled={!matches.count}
              onPress={() =>
                send({
                  type: 'findStep',
                  loadId: String(state.loadId),
                  delta: 1,
                })
              }
            />
            <Action label="×" accessibilityLabel="Close find" onPress={close} />
          </>
        ) : null}
      </Animated.View>
      <View collapsable={false} style={s.webSlot}>
        <WebView<{}>
          importantForAccessibility={
            panel === 'outline' || panel === 'appearance'
              ? 'no-hide-descendants'
              : 'auto'
          }
          ref={web}
          onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
            if (visible) onScroll(e);
          }}
          source={{ uri: 'file:///android_asset/reader.html' }}
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
            r.url === 'file:///android_asset/reader.html' ||
            r.url === 'about:blank'
          }
          style={{ flex: 1, backgroundColor: palette.canvas }}
          onMessage={e => {
            const actual = model.snapshot();
            if (
              !alive.current ||
              actual.scope !== current.current.scope ||
              !actual.note
            )
              return;
            current.current = actual;
            let m;
            try {
              if (e.nativeEvent.data.length > 65536) return;
              m = JSON.parse(e.nativeEvent.data);
            } catch {
              return;
            }
            if (m.protocol !== 1) return;
            if (m.type === 'ready') {
              ready.current = true;
              load();
              return;
            }
            const st = current.current;
            if (m.loadId !== String(st.loadId)) return;
            if (m.type === 'loaded') {
              if (Array.isArray(m.headings))
                setHeadings(
                  m.headings
                    .slice(0, 256)
                    .filter(
                      (h: any) =>
                        /^heading-\d+$/.test(h.id) &&
                        typeof h.title === 'string',
                    ),
                );
              model.loaded();
            } else if (m.type === 'selection' && visible) {
              const evidence = m.evidence;
              if (!evidence) setSelection(undefined);
              else if (
                typeof evidence.quote === 'string' &&
                typeof evidence.context === 'string' &&
                evidence.quote.length <= 4000 &&
                evidence.context.length <= 4000 &&
                evidence.revision === st.note?.revision
              )
                setSelection({
                  ...evidence,
                  resourceId: st.note?.id,
                  scope: st.scope,
                  loadId: st.loadId,
                });
            } else if (m.type === 'findResult')
              setMatches({
                count: Math.max(0, Math.min(500, Number(m.count) || 0)),
                current: Number(m.current) || 0,
                limited: !!m.limited,
              });
            else if (
              m.type === 'open' &&
              st.view === 'note' &&
              !st.preview &&
              /^[a-f0-9-]{36}$/i.test(m.resourceId || '')
            ) {
              send({ type: 'flush', loadId: String(st.loadId) });
              const open = () =>
                void model.perform(() =>
                  model.routeResource(m.resourceId, true),
                );
              if (st.connection === 'online' || st.downloaded) open();
              else
                Alert.alert(
                  'Linked content is not downloaded',
                  'Connect to its source server to open it. Your current reading position is retained.',
                  [
                    { text: 'Keep reading', style: 'cancel' },
                    {
                      text: 'Connect and open',
                      onPress: () =>
                        void model.perform(async () => {
                          await model.connect(false);
                          if (model.state.connection !== 'online')
                            throw Error(
                              'Server unavailable. Keep reading and retry when connected.',
                            );
                          await model.routeResource(m.resourceId, true);
                        }),
                    },
                  ],
                );
            } else if (
              m.type === 'external' &&
              st.view === 'note' &&
              !st.preview
            ) {
              const url = externalAddress(m.url);
              if (url)
                Alert.alert('Open external link?', url, [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Open browser',
                    onPress: () =>
                      void NativeModules.VaultorNative.openExternal(url).catch(
                        (err: Error) => model.report(err),
                      ),
                  },
                ]);
            } else if (
              m.type === 'position' &&
              st.view === 'note' &&
              !st.preview &&
              m.revision === st.note?.revision &&
              Number.isFinite(m.scroll) &&
              m.scroll >= 0
            )
              model.reading({
                anchor: 0,
                head: 0,
                scroll: Math.min(m.scroll, 10000000),
                path:
                  typeof m.path === 'string' && /^\/\d+(?:\/\d+)*$/.test(m.path)
                    ? m.path
                    : undefined,
                offset: Number.isFinite(m.offset)
                  ? Math.max(-100000, Math.min(100000, m.offset))
                  : undefined,
                revision: m.revision,
              });
            else if (
              m.type === 'thumbnail' &&
              /^[a-f0-9-]{36}$/i.test(m.resourceId || '') &&
              typeof m.token === 'string' &&
              m.token.length < 100 &&
              st.host
            ) {
              const key = st.loadId,
                host = st.host;
              void NativeModules.VaultorNative.media(
                'thumbnail',
                JSON.stringify({
                  ...host,
                  scope: st.scope,
                  offline: !!st.downloaded,
                  resourceId: m.resourceId,
                }),
              )
                .then((raw: string) => {
                  if (
                    current.current.loadId === key &&
                    current.current.host === host
                  )
                    send({
                      type: 'thumbnail',
                      loadId: String(key),
                      token: m.token,
                      data: JSON.parse(raw).data,
                    });
                })
                .catch(() => {
                  if (current.current.loadId === key)
                    send({
                      type: 'thumbnail',
                      loadId: String(key),
                      token: m.token,
                    });
                });
            }
          }}
          onRenderProcessGone={() => {
            ready.current = false;
            model.report(
              Error(
                'Reader stopped. Refresh the saved note; recovery is unchanged.',
              ),
            );
            web.current?.reload();
          }}
        />
      </View>
      {selection && visible && !panel ? (
        <View style={s.capture}>
          <Action label="Flag for review" onPress={() => capture(selection)} />
        </View>
      ) : null}
      <View
        collapsable={false}
        style={s.overlayHost}
        pointerEvents={
          panel === 'outline' || panel === 'appearance' ? 'box-none' : 'none'
        }
      >
        {panel === 'outline' ? (
          <ChoiceSheet
            animation="none"
            title="Note outline"
            close={close}
            choices={
              headings.length
                ? headings.map(h => ({
                    value: h.id,
                    label:
                      '  '.repeat(Math.max(0, Math.min(5, h.level - 1))) +
                      h.title,
                  }))
                : [{ value: '', label: 'No headings in this note' }]
            }
            onChoose={id => {
              if (id)
                send({ type: 'heading', loadId: String(state.loadId), id });
              close();
            }}
          />
        ) : null}
        {panel === 'appearance' ? <ReadingControls close={close} /> : null}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  capture: {
    position: 'absolute',
    bottom: 0,
    right: 8,
    zIndex: 3,
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 10,
  },
  root: { flex: 1 },
  overlayHost: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  hidden: { display: 'none' },
  webSlot: { flex: 1 },
  find: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 2,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: '#333',
    backgroundColor: '#000',
    flexWrap: 'wrap',
  },
  input: {
    flex: 1,
    minWidth: 100,
    minHeight: 48,
    color: '#e8e8e8',
    fontSize: 16,
  },
  muted: { color: '#b3b3b3' },
});
