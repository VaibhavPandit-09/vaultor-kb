import React, {
  useEffect,
  useState,
  useRef,
  useCallback,
  useLayoutEffect,
} from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  NativeModules,
  AppState,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Action, ChoiceSheet } from './BrowseScreen';
import type { MobileWorkspace } from './workspace';
import { mediaPosition, type MediaPosition } from './reading';
import { useThemeStyles } from './ui';
const native = NativeModules.VaultorNative;
type PreviewData = {
  uri?: string;
  text?: string;
  pages?: number;
  page?: number;
  width?: number;
  height?: number;
  originalWidth?: number;
  originalHeight?: number;
  external?: boolean;
  limited?: boolean;
  static?: boolean;
};
export default function ResourcePreview({
  model,
  registerBack,
}: {
  model: MobileWorkspace;
  registerBack: (fn: () => boolean) => void;
}) {
  const state = model.snapshot(),
    r = state.preview;
  return r ? (
    <Preview
      key={state.host?.epoch + '\n' + state.scope + '\n' + r.id}
      model={model}
      registerBack={registerBack}
    />
  ) : null;
}
function Preview({
  model,
  registerBack,
}: {
  model: MobileWorkspace;
  registerBack: (fn: () => boolean) => void;
}) {
  const s = useThemeStyles(styles),
    state = model.snapshot(),
    r = state.preview!,
    web = useRef<WebView<{}>>(null),
    webReady = useRef(false),
    ticket = useRef(0),
    restored = useRef(false),
    saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [data, setData] = useState<PreviewData>({}),
    [error, setError] = useState(''),
    [status, setStatus] = useState(''),
    [busy, setBusy] = useState(true),
    [actions, setActions] = useState(false),
    [retry, setRetry] = useState(0),
    [position, setPosition] = useState<MediaPosition>(mediaPosition()),
    [initialized, setInitialized] = useState(false),
    [pageText, setPageText] = useState('1');
  const input = {
    ...state.host,
    scope: state.scope,
    resourceId: r.id,
    title: r.title,
    mime: r.mimeType ?? 'application/octet-stream',
  };
  const captured = useRef(input).current,
    current = useRef(position);
  current.current = position;
  const persist = useCallback(() => {
    if (!restored.current) return;
    clearTimeout(saveTimer.current);
    void native
      .readerMediaPosition(
        'put',
        JSON.stringify({ ...captured, ...current.current }),
      )
      .catch(() =>
        setError(
          'Viewing position could not be saved. The original is unchanged.',
        ),
      );
  }, [captured]);
  const send = useCallback(
    (m: object) =>
      web.current?.injectJavaScript(
        'window.vaultorMediaReceive(' +
          JSON.stringify(JSON.stringify(m)) +
          ');true;',
      ),
    [],
  );
  const load = useCallback(() => {
    if (data.uri && webReady.current)
      send({
        type: 'load',
        ...data,
        ...current.current,
        title: captured.title,
        ticket: String(ticket.current),
      });
  }, [data, captured, send]);
  useEffect(() => {
    let live = true;
    void native
      .readerMediaPosition('get', JSON.stringify(captured))
      .then((raw: string) => {
        if (live) {
          const p = mediaPosition(JSON.parse(raw));
          setPosition(p);
          current.current = p;
          setPageText(String(p.page + 1));
        }
      })
      .catch(() => {
        if (live)
          setError('Viewing position unavailable. Opening at the beginning.');
      })
      .finally(() => {
        if (live) {
          setInitialized(true);
          restored.current = true;
        }
      });
    return () => {
      live = false;
      persist();
    };
  }, [captured, persist]);
  useEffect(() => {
    if (!initialized) return;
    let active = true;
    const request = ++ticket.current;
    setBusy(true);
    setError('');
    void native
      .media(
        'preview',
        JSON.stringify({
          ...captured,
          page: position.page,
          renderScale: current.current.zoom > 1 ? 2 : 1,
        }),
      )
      .then((raw: string) => {
        if (active && request === ticket.current) {
          const next: PreviewData = JSON.parse(raw);
          setData(next);
          if (next.page !== undefined && next.page !== current.current.page) {
            const p = { ...current.current, page: next.page };
            current.current = p;
            setPosition(p);
          }
          setPageText(String((next.page ?? current.current.page) + 1));
        }
      })
      .catch((e: Error) => {
        if (active)
          setError(
            e.message +
              ' Retry when connected, or use Open with for a downloaded original.',
          );
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [initialized, position.page, retry, captured]);
  useEffect(load, [load]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', v => {
      if (v !== 'active') {
        send({ type: 'flush' });
        persist();
      }
    });
    return () => sub.remove();
  }, [persist, send]);
  useLayoutEffect(() => {
    registerBack(() => {
      if (actions) {
        setActions(false);
        return true;
      }
      return false;
    });
    return () => registerBack(() => false);
  }, [actions, registerBack]);
  const close = () => {
    persist();
    model.dismissPreview();
  };
  const zoom = (value: number, actual = false) => {
    send({ type: 'zoom', zoom: value, actual });
  };
  const page = (value: number) => {
    if (busy || !data.pages) return;
    Keyboard.dismiss();
    const p = {
      ...current.current,
      page: Math.max(0, Math.min(data.pages - 1, value)),
      x: 0,
      y: 0,
    };
    current.current = p;
    setPosition(p);
    persist();
  };
  const gallery = state.previewGallery ?? [],
    index = gallery.indexOf(r.id);
  const nextImage = (delta: number) => {
    if (
      busy ||
      index < 0 ||
      index + delta < 0 ||
      index + delta >= gallery.length
    )
      return;
    persist();
    setBusy(true);
    setError('');
    void model
      .previewGalleryItem(gallery[index + delta])
      .catch((e: Error) =>
        setError(
          'Image could not be opened. ' +
            e.message +
            ' Try Previous/Next again when connected.',
        ),
      )
      .finally(() => setBusy(false));
  };
  const action = (name: string) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setStatus('');
    void native
      .media(name, JSON.stringify(captured))
      .then((raw: string) => {
        const response = JSON.parse(raw);
        setStatus(
          response.requested
            ? name === 'save'
              ? 'Original saved.'
              : name === 'copy'
              ? 'Image copied.'
              : 'Opened system destination.'
            : 'Cancelled. Original unchanged.',
        );
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false));
  };
  return (
    <Modal
      animationType="none"
      hardwareAccelerated
      onRequestClose={() => (actions ? setActions(false) : close())}
    >
      <SafeAreaView style={s.root} edges={['top', 'bottom']}>
        <View style={s.header}>
          <Action
            label="‹"
            accessibilityLabel="Close preview"
            onPress={close}
          />
          <Text accessibilityRole="header" numberOfLines={1} style={s.title}>
            {r.title}
          </Text>
          <Action
            label="•••"
            accessibilityLabel="Preview options"
            onPress={() => setActions(true)}
          />
        </View>
        {busy ? (
          <Text accessibilityLiveRegion="polite" style={s.notice}>
            Preparing view…
          </Text>
        ) : null}
        {error ? (
          <View style={s.notice}>
            <Text accessibilityRole="alert" style={s.error}>
              {error}
            </Text>
            <Action
              label="Retry preview"
              disabled={busy}
              onPress={() => setRetry(v => v + 1)}
            />
            <Action
              label="Open with"
              disabled={busy}
              onPress={() => action('open')}
            />
          </View>
        ) : null}
        {status ? (
          <Text accessibilityLiveRegion="polite" style={s.notice}>
            {status}
          </Text>
        ) : null}
        <View style={s.canvas}>
          {data.uri ? (
            <WebView<{}>
              ref={web}
              source={{ uri: 'file:///android_asset/media.html' }}
              originWhitelist={['file://']}
              allowFileAccess
              javaScriptEnabled
              domStorageEnabled={false}
              allowFileAccessFromFileURLs={false}
              allowUniversalAccessFromFileURLs={false}
              mixedContentMode="never"
              setSupportMultipleWindows={false}
              setBuiltInZoomControls={false}
              onShouldStartLoadWithRequest={q =>
                q.url === 'file:///android_asset/media.html' ||
                q.url === 'about:blank'
              }
              style={s.canvas}
              onMessage={e => {
                const actual = model.snapshot();
                if (
                  actual.scope !== captured.scope ||
                  actual.host?.epoch !== captured.epoch ||
                  actual.preview?.id !== captured.resourceId
                )
                  return;
                let m;
                try {
                  if (e.nativeEvent.data.length > 1000) return;
                  m = JSON.parse(e.nativeEvent.data);
                } catch {
                  return;
                }
                if (m.type === 'ready') {
                  webReady.current = true;
                  load();
                  return;
                }
                if (m.ticket !== String(ticket.current)) return;
                if (m.type === 'position') {
                  const p = mediaPosition({ ...current.current, ...m });
                  current.current = p;
                  setPosition(p);
                  clearTimeout(saveTimer.current);
                  saveTimer.current = setTimeout(persist, 300);
                } else if (
                  m.type === 'swipe' &&
                  r.mimeType?.startsWith('image/')
                )
                  nextImage(m.delta < 0 ? -1 : 1);
                else if (m.type === 'error')
                  setError('Preview image could not be loaded. Retry preview.');
              }}
              onRenderProcessGone={() => {
                webReady.current = false;
                setError(
                  'Viewer stopped. Retry preview; the original is unchanged.',
                );
                web.current?.reload();
              }}
            />
          ) : data.text ? (
            <ScrollView contentContainerStyle={s.textBody}>
              <Text selectable style={s.text}>
                {data.text}
                {data.limited
                  ? '\nFirst 100 KB. Save original for the complete file.'
                  : ''}
              </Text>
            </ScrollView>
          ) : data.external ? (
            <View style={s.textBody}>
              <Text style={s.muted}>
                This format does not have an in-app reader. Open with another
                app or save the original.
              </Text>
              <Action
                label="Open with"
                disabled={busy}
                onPress={() => action('open')}
              />
            </View>
          ) : null}
        </View>
        {data.uri ? (
          <View style={s.tools}>
            <Action label="Fit" onPress={() => zoom(1)} />
            <Action label="Actual size" onPress={() => zoom(1, true)} />
            <Action
              label="−"
              accessibilityLabel="Zoom out"
              onPress={() => zoom(Math.max(1, position.zoom - 0.5))}
            />
            <Text style={s.muted}>{Math.round(position.zoom * 100)}%</Text>
            <Action
              label="+"
              accessibilityLabel="Zoom in"
              onPress={() => zoom(Math.min(4, position.zoom + 0.5))}
            />
          </View>
        ) : null}
        {data.pages ? (
          <View style={s.tools}>
            <Action
              label="‹"
              accessibilityLabel="Previous page"
              disabled={busy || position.page === 0}
              onPress={() => page(position.page - 1)}
            />
            <Text style={s.muted}>Page</Text>
            <TextInput
              key={pageText}
              accessibilityLabel="PDF page number"
              keyboardType="number-pad"
              selectTextOnFocus
              defaultValue={pageText}
              style={s.page}
              onSubmitEditing={e => {
                const n = Number(e.nativeEvent.text);
                if (Number.isInteger(n) && n >= 1 && n <= data.pages!)
                  page(n - 1);
              }}
            />
            <Text style={s.muted}>of {data.pages}</Text>
            <Action
              label="›"
              accessibilityLabel="Next page"
              disabled={busy || position.page + 1 >= data.pages}
              onPress={() => page(position.page + 1)}
            />
          </View>
        ) : gallery.length > 1 ? (
          <View style={s.tools}>
            <Action
              label="‹"
              accessibilityLabel="Previous image"
              disabled={busy || index <= 0}
              onPress={() => nextImage(-1)}
            />
            <Text style={s.muted}>
              {index + 1} / {gallery.length} images in note
            </Text>
            <Action
              label="›"
              accessibilityLabel="Next image"
              disabled={busy || index + 1 >= gallery.length}
              onPress={() => nextImage(1)}
            />
          </View>
        ) : null}
        {data.static ? (
          <Text style={s.caption}>
            Static preview · {data.width} × {data.height}
            {data.originalWidth !== data.width
              ? ' · reduced from ' +
                data.originalWidth +
                ' × ' +
                data.originalHeight
              : ''}
            . Original unchanged.
          </Text>
        ) : null}
        {actions ? (
          <ChoiceSheet
            animation="none"
            title="Original file"
            close={() => setActions(false)}
            choices={[
              { value: 'save', label: 'Save original' },
              { value: 'share', label: 'Share original' },
              { value: 'open', label: 'Open with' },
              ...(r.mimeType?.startsWith('image/')
                ? [{ value: 'copy', label: 'Copy image' }]
                : []),
            ]}
            onChoose={action}
          />
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  canvas: { flex: 1, backgroundColor: '#000' },
  header: {
    minHeight: 58,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#252525',
  },
  title: { flex: 1, fontSize: 18, fontWeight: '600', color: '#e8e8e8' },
  notice: { padding: 10, color: '#b3b3b3', backgroundColor: '#141414' },
  error: { color: '#ffb4b4' },
  tools: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  muted: { color: '#b3b3b3' },
  caption: { fontSize: 11, color: '#858585', padding: 6, textAlign: 'center' },
  page: {
    minWidth: 58,
    minHeight: 48,
    color: '#e8e8e8',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    textAlign: 'center',
  },
  textBody: { padding: 24 },
  text: { fontSize: 17, lineHeight: 29, color: '#e8e8e8' },
});
