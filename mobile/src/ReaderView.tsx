import React, { useRef, useEffect } from 'react';
import {
  NativeModules,
  useColorScheme,
  useWindowDimensions,
} from 'react-native';
import { WebView } from 'react-native-webview';
import type { MobileWorkspace } from './workspace';
export default function ReaderView({ model }: { model: MobileWorkspace }) {
  const state = model.snapshot(),
    web = useRef<WebView<{}>>(null),
    ready = useRef(false),
    scheme = useColorScheme(),
    { fontScale } = useWindowDimensions();
  const current = useRef(state);
  current.current = state;
  const send = (m: object) =>
    web.current?.injectJavaScript(
      'window.vaultorReceive(' + JSON.stringify(JSON.stringify(m)) + ');true;',
    );
  const load = () =>
    send({
      type: 'load',
      loadId: String(state.loadId),
      content: state.content,
      scroll: state.position?.scroll,
      theme: scheme,
    });
  useEffect(() => {
    if (ready.current)
      send({
        type: 'load',
        loadId: String(current.current.loadId),
        content: current.current.content,
        scroll: current.current.position?.scroll,
        theme: scheme,
      });
  }, [state.loadId, scheme]);
  return (
    <WebView<{}>
      ref={web}
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
        r.url === 'file:///android_asset/reader.html' || r.url === 'about:blank'
      }
      style={{
        flex: 1,
        backgroundColor: scheme === 'light' ? '#fafafa' : '#000',
      }}
      onMessage={e => {
        let m;
        try {
          if (e.nativeEvent.data.length > 1500) return;
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
        const s = current.current;
        if (m.loadId !== String(s.loadId)) return;
        if (m.type === 'open' && /^[a-f0-9-]{36}$/i.test(m.resourceId || ''))
          void model.perform(() => model.routeResource(m.resourceId, true));
        else if (
          m.type === 'position' &&
          Number.isFinite(m.scroll) &&
          m.scroll >= 0
        )
          model.reading({
            anchor: 0,
            head: 0,
            scroll: Math.min(m.scroll, 10000000),
          });
        else if (
          m.type === 'thumbnail' &&
          /^[a-f0-9-]{36}$/i.test(m.resourceId || '') &&
          typeof m.token === 'string' &&
          m.token.length < 100 &&
          s.host
        ) {
          const key = s.loadId,
            host = s.host;
          void NativeModules.VaultorNative.media(
            'thumbnail',
            JSON.stringify({
              ...host,
              scope: s.scope,
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
          Error('Reader stopped. Reopen the note; recovery is unchanged.'),
        );
      }}
    />
  );
}
