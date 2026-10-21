import React, { useEffect, useState } from 'react';
import {
  NativeModules,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Action } from './Action';
import { useThemeStyles } from './ui';
import {
  deliveryLabel,
  deliveryExplanation,
  receiptContext,
} from './reviewDelivery';
import { reviewGroups } from './navigationPresentation';
import type { CaptureItem } from './reviews';

/** This journal is device-wide. Reading it never selects/activates a source. */
export default function ReviewDestination({
  open,
  revision,
  syncing,
  syncError,
  sync,
}: {
  open(id: string): void;
  revision: number;
  syncing: boolean;
  syncError: string;
  sync(): void;
}) {
  const s = useThemeStyles(styles);
  const [items, setItems] = useState<CaptureItem[]>([]),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    void NativeModules.VaultorNative.reviewCapture('list', '{}')
      .then((raw: string) => {
        if (alive) setItems(JSON.parse(raw));
      })
      .catch(() => {
        if (alive)
          setError('Protected local records could not be read. Retry.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [retry, revision]);
  return (
    <SectionList
      sections={reviewGroups(items)}
      keyExtractor={item => item.id}
      stickySectionHeadersEnabled={false}
      contentContainerStyle={s.page}
      ListHeaderComponent={
        <View style={s.intro}>
          <Text style={s.secondary}>Protected on this phone · all sources</Text>
          <Text style={s.secondary}>
            Drafts and queued captures stay here even when their source is
            unavailable. Delivery uses the approved original source; desktop
            triage stays read-only here.
          </Text>
          <View style={s.syncRow}>
            <Text style={s.meta}>
              {
                items.filter(
                  v => v.state === 'queued' && v.delivery?.state !== 'synced',
                ).length
              }{' '}
              pending ·{' '}
              {items.filter(v => v.delivery?.state === 'synced').length} synced
            </Text>
            <Action
              label={syncing ? 'Syncing…' : 'Sync now'}
              disabled={syncing}
              onPress={sync}
            />
          </View>
          {syncError ? (
            <Text accessibilityRole="alert" style={s.error}>
              {syncError}
            </Text>
          ) : null}
          {error ? (
            <View accessibilityRole="alert">
              <Text style={s.error}>{error}</Text>
              <Action
                label="Retry local records"
                onPress={() => setRetry(v => v + 1)}
              />
            </View>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        <Text style={s.secondary}>
          {loading
            ? 'Reading local records…'
            : error
            ? ''
            : 'No local captures yet. Begin a review from a resource or selected evidence.'}
        </Text>
      }
      renderSectionHeader={({ section }) => (
        <View style={s.group}>
          <Text accessibilityRole="header" style={s.name}>
            {section.source.workspaceName || 'Retained workspace'}
          </Text>
          {reviewGroups(items).filter(
            g => g.source.workspaceName === section.source.workspaceName,
          ).length > 1 ? (
            <Text style={s.meta}>{section.source.address}</Text>
          ) : null}
          <Text style={s.meta}>
            Original generation · {section.source.generation.slice(0, 8)}
          </Text>
        </View>
      )}
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${item.source.targetTitle}. ${deliveryLabel(
            item,
          )}`}
          onPress={() => open(item.id)}
          style={({ pressed }) => [s.row, pressed && s.pressed]}
        >
          <View style={s.grow}>
            <Text style={s.name}>
              {item.source.targetTitle || 'Retained resource'}
            </Text>
            <Text numberOfLines={2} style={s.secondary}>
              {item.body.comment ||
                item.body.quote ||
                'Resource context retained'}
            </Text>
            <Text accessibilityLiveRegion="polite" style={s.meta}>
              {deliveryLabel(item)} ·{' '}
              {new Date(item.createdAt).toLocaleDateString()}
            </Text>
            {receiptContext(item) ? (
              <Text style={s.meta}>{receiptContext(item)}</Text>
            ) : null}
            {item.delivery?.reason ? (
              <Text style={s.secondary}>{deliveryExplanation(item)}</Text>
            ) : null}
          </View>
          <Text style={s.secondary}>›</Text>
        </Pressable>
      )}
    />
  );
}
const styles = StyleSheet.create({
  page: { padding: 20, paddingTop: 4, paddingBottom: 28 },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  intro: { gap: 8, paddingBottom: 12 },
  title: { fontSize: 28, fontWeight: '600', color: '#e8e8e8' },
  name: { fontSize: 16, fontWeight: '600', color: '#e8e8e8' },
  secondary: { color: '#b3b3b3', fontSize: 14, lineHeight: 21 },
  meta: { color: '#858585', fontSize: 12 },
  error: { color: '#ffb4b4' },
  group: { paddingTop: 24, paddingBottom: 8, gap: 4 },
  row: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#252525',
  },
  grow: { flex: 1, gap: 6 },
  pressed: { backgroundColor: '#1e1e1e' },
});
