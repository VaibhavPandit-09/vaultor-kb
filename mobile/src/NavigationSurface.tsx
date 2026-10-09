import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Action } from './BrowseScreen';
import { presentation } from './browse';
import { useThemeStyles } from './ui';
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
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${info.label}`}
      onPress={() =>
        open(collection ? item.id : resource.id, collection ? title : undefined)
      }
      style={({ pressed }) => [s.shortcut, pressed && s.pressed]}
    >
      <Text importantForAccessibility="no" style={s.icon}>
        {info.icon}
      </Text>
      <View collapsable={false} style={s.grow}>
        <Text numberOfLines={2} style={s.itemTitle}>
          {title}
        </Text>
        <Text style={s.meta}>{info.label}</Text>
      </View>
    </Pressable>
  );
}
export function HomeScreen(props: Props & { returnToNote?: () => void }) {
  const s = useThemeStyles(sheet);
  return (
    <ScrollView
      contentContainerStyle={s.home}
      keyboardShouldPersistTaps="handled"
    >
      <Text accessibilityRole="header" style={s.hero}>
        Your space.
      </Text>
      <Text style={s.secondary}>Pick up where you left off.</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Search workspace"
        onPress={() => props.select('library', true)}
        style={s.search}
      >
        <Text style={s.secondary}>⌕ Search your workspace</Text>
      </Pressable>
      {props.returnToNote ? (
        <Action label="Return to note" onPress={props.returnToNote} />
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
                : 'Pin resources or collections to keep them close.'}
            </Text>
          ) : null}
        </View>
      ))}
      <Action label="Browse Library" onPress={() => props.select('library')} />
    </ScrollView>
  );
}
export function WorkspaceDrawer(
  props: Props & {
    close(): void;
    hosts(): void;
    recovery(): void;
    host?: string;
    recoveryCount: number;
    reducedMotion: boolean;
    current: string;
  },
) {
  const s = useThemeStyles(sheet),
    { width } = useWindowDimensions();
  const [collapsed, setCollapsed] = useState({ recent: false, pinned: false });
  const panel = (
    <View
      style={[s.drawer, { width: Math.min(320, width - 48) }]}
      accessibilityViewIsModal
    >
      <View collapsable={false} style={s.sectionHead}>
        <Text accessibilityRole="header" style={s.brand}>
          Vaultor
        </Text>
        <Action
          label="×"
          accessibilityLabel="Close navigation"
          onPress={props.close}
        />
      </View>
      <Pressable
        style={s.host}
        accessibilityRole="button"
        accessibilityLabel="Switch workspace or manage connections"
        onPress={props.hosts}
      >
        <Text style={s.itemTitle}>Workspace</Text>
        <Text numberOfLines={1} style={s.meta}>
          {props.host ?? 'Choose a host'} ›
        </Text>
      </Pressable>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.drawerContent}
      >
        {(
          [
            ['home', '⌂', 'Home'],
            ['library', '▤', 'Library'],
            ['collections', '▦', 'Collections'],
            ['trash', '♲', 'Trash'],
          ] as const
        ).map(([value, icon, label]) => (
          <Action
            key={value}
            label={`${icon}  ${label}`}
            accessibilityLabel={label}
            active={props.current === value}
            onPress={() => props.select(value)}
          />
        ))}
        <Action
          label="⌕  Search"
          accessibilityLabel="Search workspace"
          onPress={() => props.select('library', true)}
        />
        {(['pinned', 'recent'] as const).map(kind => (
          <View collapsable={false} key={kind} style={s.drawerSection}>
            <View collapsable={false} style={s.sectionHead}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: !collapsed[kind] }}
                accessibilityLabel={`${
                  collapsed[kind] ? 'Expand' : 'Collapse'
                } ${kind}`}
                style={s.disclosure}
                onPress={() => setCollapsed(c => ({ ...c, [kind]: !c[kind] }))}
              >
                <Text style={s.secondary}>
                  {collapsed[kind] ? '›' : '⌄'}{' '}
                  {kind === 'pinned' ? 'Pinned' : 'Recent'}
                </Text>
              </Pressable>
              <Action
                label="View all"
                accessibilityLabel={`View all ${kind}`}
                onPress={() => props.select(kind)}
              />
            </View>
            {!collapsed[kind]
              ? props.feed[kind]
                  .slice(0, 4)
                  .map(item => (
                    <Shortcut
                      key={item.id}
                      item={item}
                      pinned={kind === 'pinned'}
                      open={props.open}
                    />
                  ))
              : null}
          </View>
        ))}
        {props.feed.error ? (
          <View collapsable={false}>
            <Text style={s.error}>{props.feed.error}</Text>
            <Action label="Retry shortcuts" onPress={props.retry} />
          </View>
        ) : null}
      </ScrollView>
      <Action
        label={`Recovery${
          props.recoveryCount ? ' · ' + props.recoveryCount : ''
        }`}
        onPress={props.recovery}
      />
    </View>
  );
  // A wide split-screen/window can retain a sidebar without squeezing phone content.
  if (width >= 840) return panel;
  return (
    <Modal
      transparent
      animationType={props.reducedMotion ? 'none' : 'fade'}
      onRequestClose={props.close}
    >
      <View collapsable={false} style={s.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel="Dismiss navigation"
          onPress={props.close}
        />
        {panel}
      </View>
    </Modal>
  );
}
const sheet = StyleSheet.create({
  grow: { flex: 1 },
  home: { padding: 20, gap: 14 },
  hero: { color: '#e8e8e8', fontSize: 30, fontWeight: '600', marginTop: 12 },
  secondary: { color: '#b3b3b3', fontSize: 15 },
  meta: { color: '#858585', fontSize: 12 },
  search: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 16,
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginVertical: 10,
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
  overlay: { flex: 1, backgroundColor: '#0009', flexDirection: 'row' },
  drawer: {
    backgroundColor: '#0a0a0a',
    borderRightWidth: 1,
    borderColor: '#333',
    padding: 16,
    paddingTop: 36,
    flexShrink: 0,
  },
  brand: { fontSize: 23, color: '#e8e8e8', fontWeight: '600' },
  host: {
    padding: 14,
    backgroundColor: '#141414',
    borderRadius: 12,
    gap: 6,
    marginVertical: 16,
  },
  drawerContent: { gap: 4 },
  drawerSection: { marginTop: 16 },
  disclosure: { minHeight: 48, justifyContent: 'center', flex: 1 },
  footer: { color: '#858585', fontSize: 11, paddingVertical: 8 },
});
