import { useThemeStyles } from './ui';
import React, { useEffect, useState, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  Image,
  ScrollView,
  StyleSheet,
  NativeModules,
} from 'react-native';
import { Action } from './BrowseScreen';
import type { ResourceSummary } from './browse';
import type { MobileWorkspace } from './workspace';
const native = NativeModules.VaultorNative;
export default function ResourcePreview({
  model,
  onOrganize,
}: {
  model: MobileWorkspace;
  onOrganize: (resource: ResourceSummary) => void;
}) {
  const s = useThemeStyles(sheetStyles);
  const state = model.snapshot(),
    r = state.preview;
  const [data, setData] = useState<{
      uri?: string;
      text?: string;
      pages?: number;
      page?: number;
      width?: number;
      height?: number;
      external?: boolean;
      limited?: boolean;
      static?: boolean;
    }>({}),
    [error, setError] = useState(''),
    [page, setPage] = useState(0),
    [retry, setRetry] = useState(0),
    [zoom, setZoom] = useState(1),
    [busy, setBusy] = useState(false);
  const input = useMemo(
    () => ({
      ...state.host,
      scope: state.scope,
      resourceId: r?.id,
      title: r?.title,
      mime: r?.mimeType ?? 'application/octet-stream',
    }),
    [state.host, state.scope, r],
  );
  useEffect(() => {
    setPage(0);
    setZoom(1);
  }, [r?.id]);
  useEffect(() => {
    let active = true;
    setData({});
    setError('');
    setBusy(true);
    if (input.resourceId && input.hostId)
      void native
        .media('preview', JSON.stringify({ ...input, page }))
        .then((raw: string) => {
          if (active) setData(JSON.parse(raw));
        })
        .catch((e: Error) => {
          if (active) setError(e.message);
        })
        .finally(() => {
          if (active) setBusy(false);
        });
    return () => {
      active = false;
    };
  }, [input, page, retry]);
  const action = (name: string) => {
    setError('');
    setBusy(true);
    void native
      .media(name, JSON.stringify(input))
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false));
  };
  if (!r) return null;
  return (
    <Modal
      transparent
      animationType="fade"
      onRequestClose={() => model.dismissPreview()}
    >
      <View style={s.scrim}>
        <View style={s.panel}>
          <View style={s.actions}>
            <Text numberOfLines={2} style={s.title}>
              {r.title}
            </Text>
            <Action label="Resource actions" onPress={() => onOrganize(r)} />
            <Action
              label="Close preview"
              onPress={() => model.dismissPreview()}
            />
          </View>
          <Text style={s.muted}>
            {r.mimeType ?? 'File'} · Original file preserved
            {data.static ? ' · Static preview' : ''}
          </Text>
          {busy ? <Text style={s.muted}>Preparing…</Text> : null}
          {error ? (
            <View>
              <Text accessibilityLiveRegion="polite" style={s.error}>
                {error}
              </Text>
              <Action
                label="Retry preview"
                onPress={() => setRetry(v => v + 1)}
              />
            </View>
          ) : null}
          <ScrollView
            style={s.content}
            horizontal={zoom > 1}
            maximumZoomScale={4}
            minimumZoomScale={1}
          >
            <ScrollView>
              {data.uri ? (
                <Image
                  accessibilityLabel={r.title}
                  source={{ uri: data.uri }}
                  resizeMode="contain"
                  style={{
                    width: 300 * zoom,
                    height:
                      (data.width && data.height
                        ? Math.min(600, (300 * data.height) / data.width)
                        : 430) * zoom,
                  }}
                />
              ) : null}
              {data.text ? (
                <Text selectable style={s.text}>
                  {data.text}
                  {data.limited
                    ? '\nFirst 100 KB only. Save original for the complete file.'
                    : ''}
                </Text>
              ) : null}
              {data.external ? (
                <Text style={s.muted}>
                  Use Open with or Save original for this format.
                </Text>
              ) : null}
            </ScrollView>
          </ScrollView>
          {data.uri ? (
            <View style={s.actions}>
              <Action label="Fit" onPress={() => setZoom(1)} />
              <Action
                label="Zoom −"
                onPress={() => setZoom(v => Math.max(1, v - 0.5))}
              />
              <Action
                label="Zoom +"
                onPress={() => setZoom(v => Math.min(4, v + 0.5))}
              />
            </View>
          ) : null}
          {data.pages ? (
            <View style={s.actions}>
              <Action
                label="Previous page"
                disabled={page === 0}
                onPress={() => setPage(v => v - 1)}
              />
              <Text style={s.muted}>
                {page + 1} / {data.pages}
              </Text>
              <Action
                label="Next page"
                disabled={page + 1 >= data.pages}
                onPress={() => setPage(v => v + 1)}
              />
            </View>
          ) : null}
          <View style={s.actions}>
            {[
              'save',
              'share',
              'open',
              ...(r.mimeType?.startsWith('image/') ? ['copy'] : []),
            ].map(name => (
              <Action
                key={name}
                label={
                  {
                    save: 'Save original',
                    share: 'Share',
                    open: 'Open with',
                    copy: 'Copy image',
                  }[name]!
                }
                disabled={busy}
                onPress={() => action(name)}
              />
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}
const sheetStyles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: '#000b',
    justifyContent: 'center',
    padding: 12,
  },
  panel: {
    maxHeight: '95%',
    backgroundColor: '#0a0a0a',
    borderColor: '#444',
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 10,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  title: { fontSize: 19, color: '#e8e8e8', flex: 1 },
  muted: { color: '#b3b3b3' },
  error: { color: '#ff9191' },
  content: { flexShrink: 1 },
  text: { color: '#e8e8e8', fontSize: 16 },
});
