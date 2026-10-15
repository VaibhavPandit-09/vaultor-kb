import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  NativeModules,
  AccessibilityInfo,
  findNodeHandle,
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
import { useAppearance, useReading, useThemeStyles } from './ui';
import { SafeAreaView } from 'react-native-safe-area-context';
import { motionDuration, settleEasing } from './motion';
import type { Note } from './bridge';
import type { sourcePresentation } from './sourcePresentation';
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
export function HomeScreen(
  props: Props & {
    returnToNote?: () => void;
    resume?: Note;
    source: ReturnType<typeof sourcePresentation>;
  },
) {
  const s = useThemeStyles(sheet);
  return (
    <ScrollView
      contentContainerStyle={s.home}
      keyboardShouldPersistTaps="handled"
    >
      <Text accessibilityRole="header" style={s.hero}>
        Home
      </Text>
      <Text style={s.secondary}>
        {props.source.workspace} · {props.source.availability}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Search workspace"
        onPress={() => props.select('library', true)}
        style={s.search}
      >
        <Text style={s.secondary}>⌕ Search your workspace</Text>
      </Pressable>
      {props.returnToNote ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={'Resume reading ' + props.resume?.title}
          onPress={props.returnToNote}
          style={s.resume}
        >
          <Text style={s.meta}>Resume reading</Text>
          <Text numberOfLines={2} style={s.resumeTitle}>
            {props.resume?.title}
          </Text>
          <Text style={s.meta}>
            {props.source.workspace} · saved reading position ›
          </Text>
        </Pressable>
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
    </ScrollView>
  );
}
export function WorkspaceDrawer(
  props: Props & {
    visible: boolean;
    close(): void;
    hosts(): void;
    recovery(): void;
    appearance(): void;
    downloads(): void;
    host?: string;
    recoveryCount: number;
    reducedMotion: boolean;
    current: string;
  },
) {
  const s = useThemeStyles(sheet),
    { width } = useWindowDimensions();
  const { preferences } = useReading();
  const light = useAppearance() === 'light';
  const edge = useRef(new Animated.Value(0)).current;
  const root = useRef<React.ElementRef<typeof View>>(null),
    heading = useRef<React.ElementRef<typeof Text>>(null);
  useEffect(() => {
    if (!props.visible) {
      edge.setValue(0);
      return;
    }
    const animation = Animated.timing(edge, {
      toValue: 1,
      duration: motionDuration(
        'navigation',
        preferences.motion,
        props.reducedMotion,
      ),
      easing: settleEasing,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [edge, props.visible, props.reducedMotion, preferences.motion]);
  useEffect(() => {
    if (props.visible)
      NativeModules.VaultorPresentation?.systemBars(
        light,
        findNodeHandle(root.current) ?? 0,
      );
  }, [props.visible, light]);
  const [collapsed, setCollapsed] = useState({ recent: false, pinned: false });
  const panel = (
    <Animated.View
      ref={root}
      collapsable={false}
      style={[
        s.drawer,
        {
          width: Math.min(360, width - 48),
          transform: [
            {
              translateX: edge.interpolate({
                inputRange: [0, 1],
                outputRange: [-Math.min(360, width - 48), 0],
              }),
            },
          ],
        },
      ]}
      accessibilityViewIsModal
    >
      <View collapsable={false} style={s.sectionHead}>
        <Text
          accessibilityRole="header"
          ref={heading}
          accessible
          style={s.brand}
        >
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
        <Action label="Appearance & reading" onPress={props.appearance} />
        <Action label="Offline downloads" onPress={props.downloads} />
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
        label={`Legacy recovery${
          props.recoveryCount ? ' · ' + props.recoveryCount : ''
        }`}
        onPress={props.recovery}
      />
    </Animated.View>
  );
  return (
    <Modal
      visible={props.visible}
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="none"
      onShow={() => {
        NativeModules.VaultorPresentation?.systemBars(
          light,
          findNodeHandle(root.current) ?? 0,
        );
        const tag = findNodeHandle(heading.current);
        if (tag) AccessibilityInfo.setAccessibilityFocus(tag);
      }}
      onRequestClose={props.close}
    >
      <SafeAreaView
        edges={['top', 'bottom', 'left', 'right']}
        style={s.overlay}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel="Dismiss navigation"
          onPress={props.close}
        />
        {panel}
      </SafeAreaView>
    </Modal>
  );
}
const sheet = StyleSheet.create({
  grow: { flex: 1 },
  home: { padding: 16, gap: 10 },
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
  overlay: { flex: 1, backgroundColor: '#0009', flexDirection: 'row' },
  drawer: {
    backgroundColor: '#0a0a0a',
    borderRightWidth: 1,
    borderColor: '#333',
    padding: 16,
    paddingTop: 8,
    flexShrink: 0,
  },
  brand: { fontSize: 23, color: '#e8e8e8', fontWeight: '600' },
  host: {
    padding: 14,
    backgroundColor: '#141414',
    borderRadius: 12,
    gap: 6,
    marginVertical: 8,
  },
  drawerContent: { gap: 4 },
  drawerSection: { marginTop: 16 },
  disclosure: { minHeight: 48, justifyContent: 'center', flex: 1 },
  footer: { color: '#858585', fontSize: 11, paddingVertical: 8 },
});
