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
import { reviewGroups } from './navigationPresentation';
import type { CaptureItem } from './reviews';

/** This journal is device-wide. Reading it never selects/activates a source. */
export default function ReviewDestination({
  open,
  revision,
}: {
  open(id: string): void;
  revision: number;
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
          <Text accessibilityRole="header" style={s.title}>
            Review
          </Text>
          <Text style={s.secondary}>Protected on this phone · all sources</Text>
          <Text style={s.secondary}>
            Drafts and queued captures stay here even when their source is
            unavailable. Nothing is sent automatically.
          </Text>
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
          <Text style={s.secondary}>{section.source.address}</Text>
          <Text style={s.meta}>
            Source generation · {section.source.generation}
          </Text>
        </View>
      )}
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${item.source.targetTitle}. ${
            item.state === 'queued' ? 'Queued locally' : 'Protected draft'
          }`}
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
            <Text style={s.meta}>
              {item.state === 'queued' ? 'Queued locally' : 'Protected draft'} ·{' '}
              {new Date(item.createdAt).toLocaleDateString()}
            </Text>
          </View>
          <Text style={s.secondary}>›</Text>
        </Pressable>
      )}
    />
  );
}
const styles = StyleSheet.create({
  page: { padding: 20, paddingBottom: 28 },
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
