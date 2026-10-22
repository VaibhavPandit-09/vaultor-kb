import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Action } from './BrowseScreen';
import { presentation } from './browse';
import { ResourceTouch } from './ResourceMotion';
import { useThemeStyles } from './ui';
import type { Note } from './bridge';
import type { QuickAccess, RootDestination } from './navigation';

type Props = {
  feed: ReturnType<QuickAccess['snapshot']>;
  select(destination: RootDestination, search?: boolean): void;
  open(id: string, collection?: string): void;
  retry(): void;
};
function Shortcut({
  item,
  pinned,
  open,
}: {
  item: any;
  pinned?: boolean;
  open: Props['open'];
}) {
  const s = useThemeStyles(sheet);
  const collection = item.kind === 'collection';
  const resource = pinned && !collection ? item.resource : item;
  const title = collection ? item.name : resource?.title;
  const info = collection
    ? { icon: '▦', label: 'Collection' }
    : presentation(resource ?? { type: '' });
  return (
    <ResourceTouch
      title={title || 'Resource'}
      resourceId={
        !collection && resource?.type === 'note' ? resource.id : undefined
      }
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${info.label}`}
      onPress={() =>
        open(collection ? item.id : resource.id, collection ? title : undefined)
      }
      style={({ pressed }) => [s.shortcut, pressed && s.pressed]}
    >
      {titleRef => (
        <>
          <Text importantForAccessibility="no" style={s.icon}>
            {info.icon}
          </Text>
          <View collapsable={false} style={s.grow}>
            <Text ref={titleRef} numberOfLines={2} style={s.itemTitle}>
              {title}
            </Text>
            <Text style={s.meta}>{info.label}</Text>
          </View>
        </>
      )}
    </ResourceTouch>
  );
}
export function HomeScreen(
  props: Props & {
    returnToNote?: () => void;
    resume?: Note;
    imports?: {count:number;open():void};
  },
) {
  const s = useThemeStyles(sheet);
  return (
    <ScrollView
      contentContainerStyle={s.home}
      keyboardShouldPersistTaps="handled"
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Search workspace"
        onPress={() => props.select('library', true)}
        style={s.search}
      >
        <Text style={s.secondary}>⌕ Search your workspace</Text>
      </Pressable>
      {props.returnToNote ? (
        <ResourceTouch
          title={props.resume?.title || 'Reader'}
          resourceId={props.resume?.id}
          accessibilityRole="button"
          accessibilityLabel={'Resume reading ' + props.resume?.title}
          onPress={props.returnToNote}
          style={s.resume}
        >
          {titleRef => (
            <>
              <Text style={s.meta}>Resume reading</Text>
              <Text ref={titleRef} numberOfLines={2} style={s.resumeTitle}>
                {props.resume?.title}
              </Text>
              <Text style={s.meta}>Saved reading position ›</Text>
            </>
          )}
        </ResourceTouch>
      ) : null}
      {props.feed.error ? (
        <View collapsable={false} accessibilityRole="alert">
          <Text style={s.error}>{props.feed.error}</Text>
          <Action label="Retry shortcuts" onPress={props.retry} />
        </View>
      ) : null}
      {(['recent', 'pinned'] as const).map(kind => (
        <View collapsable={false} key={kind}>
          <View collapsable={false} style={s.sectionHead}>
            <Text accessibilityRole="header" style={s.sectionTitle}>
              {kind === 'recent' ? 'Recently opened' : 'Pinned'}
            </Text>
            <Action
              label="View all"
              accessibilityLabel={`View all ${kind}`}
              onPress={() => props.select(kind)}
            />
          </View>
          {props.feed[kind].slice(0, 6).map(item => (
            <Shortcut
              key={item.id}
              item={item}
              pinned={kind === 'pinned'}
              open={props.open}
            />
          ))}
          {!props.feed[kind].length ? (
            <Text style={s.empty}>
              {props.feed.loading
                ? 'Loading…'
                : kind === 'recent'
                ? 'Notes and files you open will appear here.'
                : 'Resources pinned on your desktop will appear here.'}
            </Text>
          ) : null}
        </View>
      ))}
      <Action label="Browse Library" onPress={() => props.select('library')} />
      {props.imports?<Action label={props.imports.count?`Pending imports · ${props.imports.count}`:'Collect files & photos'} onPress={props.imports.open}/>:null}
    </ScrollView>
  );
}
const sheet = StyleSheet.create({
  grow: { flex: 1 },
  home: { padding: 16, paddingTop: 4, gap: 10 },
  resume: {
    paddingVertical: 12,
    gap: 6,
    minHeight: 72,
    borderBottomWidth: 1,
    borderColor: '#252525',
  },
  resumeTitle: { color: '#e8e8e8', fontSize: 20, fontWeight: '600' },
  hero: { color: '#e8e8e8', fontSize: 25, fontWeight: '600', marginTop: 4 },
  secondary: { color: '#b3b3b3', fontSize: 15 },
  meta: { color: '#858585', fontSize: 12 },
  search: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 16,
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginVertical: 4,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sectionTitle: { color: '#e8e8e8', fontSize: 17, fontWeight: '600' },
  itemTitle: { color: '#e8e8e8', fontSize: 15, fontWeight: '500' },
  shortcut: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  icon: { color: '#8db7ff', fontSize: 23, width: 28 },
  pressed: { backgroundColor: '#1e1e1e' },
  empty: { color: '#858585', fontSize: 14, paddingVertical: 16 },
  error: { color: '#ffb4b4', fontSize: 13 },
});
