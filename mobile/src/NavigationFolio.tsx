import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { usePalette, useReading } from './ui';
import { motionDuration, settleEasing } from './motion';
import { navigationLayout } from './navigationPresentation';

export type PrimaryDestination = 'home' | 'library' | 'review';
const destinations = [
  { id: 'home', label: 'Home', icon: '⌂' },
  { id: 'library', label: 'Library', icon: '▤' },
  { id: 'review', label: 'Review', icon: '◈' },
] as const;

/** A single folio edge changes allocation as the reading object takes focus.
 * Bounded layout animation deliberately reclaims document space. No document
 * position, navigation commit or source activation depends on its completion. */
export default function NavigationFolio({
  reading,
  current,
  title,
  workspace,
  availability,
  disabled,
  select,
  sources,
  more,
  back,
  sourceRef,
  landing,
  disclosed,
  disclose,
}: {
  reading: boolean;
  current: PrimaryDestination;
  title: string;
  workspace: string;
  availability: string;
  disabled: boolean;
  select(d: PrimaryDestination): void;
  sources(): void;
  more(): void;
  back(): void;
  sourceRef: React.RefObject<React.ElementRef<typeof View> | null>;
  landing: Animated.Value;
  disclosed: boolean;
  disclose(): void;
}) {
  const palette = usePalette(),
    { reduced, preferences } = useReading();
  const { width, height, fontScale } = useWindowDimensions();
  const { rail, stacked } = navigationLayout(width, height, fontScale);
  const focused = reading && !disclosed;
  const focus = useRef(new Animated.Value(reading ? 1 : 0)).current;
  const selected = useRef(
    new Animated.Value(destinations.findIndex(d => d.id === current)),
  ).current;
  useEffect(() => {
    const animation = Animated.timing(focus, {
      toValue: focused ? 1 : 0,
      duration: motionDuration('navigation', preferences.motion, reduced),
      easing: settleEasing,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [focus, focused, preferences.motion, reduced]);
  useEffect(() => {
    const animation = Animated.timing(selected, {
      toValue: destinations.findIndex(d => d.id === current),
      duration: motionDuration('structure', preferences.motion, reduced),
      easing: settleEasing,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [current, selected, preferences.motion, reduced]);
  const blend = (a: number, b: number) =>
    focus.interpolate({ inputRange: [0, 1], outputRange: [a, b] });
  const rowHeight = Math.max(58, 38 * fontScale + 16);
  const tabsWidth = Math.min(width * 0.51, 228);
  const tabs = (
    <Animated.View
      pointerEvents={focused ? 'none' : 'auto'}
      importantForAccessibility={focused ? 'no-hide-descendants' : 'auto'}
      style={[
        s.tabs,
        rail
          ? {
              height: blend(190 * Math.max(1, fontScale), 0),
              flexDirection: 'column',
            }
          : stacked
          ? { height: blend(rowHeight, 0), width: '100%' }
          : { width: blend(tabsWidth, 0), height: rowHeight },
      ]}
    >
      <View
        style={[
          s.tabs,
          rail
            ? { height: 190 * Math.max(1, fontScale), flexDirection: 'column' }
            : { width: stacked ? '100%' : tabsWidth, height: rowHeight },
        ]}
      >
        {destinations.map(d => (
          <Animated.View
            key={d.id}
            style={
              rail
                ? { flex: 1 }
                : {
                    width: selected.interpolate({
                      inputRange: [0, 1, 2],
                      outputRange: destinations.map(v =>
                        v.id === d.id ? '46%' : '27%',
                      ),
                    }),
                  }
            }
          >
            <Pressable
              key={d.id}
              accessibilityRole="tab"
              accessibilityLabel={d.label}
              accessibilityState={{
                selected: current === d.id,
                disabled: disabled && d.id !== 'review',
              }}
              disabled={disabled && d.id !== 'review'}
              onPress={() => select(d.id)}
              style={({ pressed }) => [
                s.tab,
                { backgroundColor: pressed ? palette.pressed : 'transparent' },
              ]}
            >
              <Text
                importantForAccessibility="no"
                style={{
                  fontSize: 20,
                  color: current === d.id ? palette.accent : palette.secondary,
                }}
              >
                {d.icon}
              </Text>
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 12,
                  fontWeight: current === d.id ? '700' : '400',
                  color: current === d.id ? palette.text : palette.secondary,
                }}
              >
                {d.label}
              </Text>
              {rail
                ? current === d.id && (
                    <View
                      style={[s.railMark, { backgroundColor: palette.accent }]}
                    />
                  )
                : null}
            </Pressable>
          </Animated.View>
        ))}
        {!rail && (
          <Animated.View
            pointerEvents="none"
            style={[
              s.mark,
              {
                backgroundColor: palette.accent,
                left: selected.interpolate({
                  inputRange: [0, 1, 2],
                  outputRange: ['0%', '27%', '54%'],
                }),
              },
            ]}
          />
        )}
      </View>
    </Animated.View>
  );
  const controls = (
    <View
      style={[s.controls, rail && s.railControls, { minHeight: rowHeight }]}
    >
      <Animated.View
        style={{
          overflow: 'hidden',
          width: blend(0, 48),
          height: rail ? blend(0, rowHeight) : undefined,
        }}
        pointerEvents={focused ? 'auto' : 'none'}
        importantForAccessibility={focused ? 'auto' : 'no-hide-descendants'}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={back}
          style={[s.button, { minHeight: rowHeight }]}
        >
          <Text style={{ color: palette.text, fontSize: 28 }}>‹</Text>
        </Pressable>
      </Animated.View>
      <Animated.View
        style={[
          s.context,
          rail && { flex: 0, width: '100%' },
          {
            transform: [
              {
                translateX: landing.interpolate({
                  inputRange: [0, 1],
                  outputRange: [24, 0],
                }),
              },
            ],
          },
        ]}
      >
        <Pressable
          ref={sourceRef}
          collapsable={false}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={`${
            reading ? title + '. ' : ''
          }${workspace}. ${availability}. Choose source`}
          accessibilityHint="Opens Sources without changing the current workspace"
          onPress={sources}
          style={({ pressed }) => [
            s.source,
            {
              minHeight: rowHeight,
              backgroundColor: pressed ? palette.pressed : 'transparent',
            },
          ]}
        >
          <Text
            numberOfLines={1}
            style={{ fontSize: 13, fontWeight: '600', color: palette.text }}
          >
            {focused ? title : 'Sources ⌃'}
          </Text>
          <Text
            numberOfLines={1}
            style={{ fontSize: 11, color: palette.secondary }}
          >
            {workspace}
          </Text>
          <Text
            numberOfLines={1}
            style={{ fontSize: 10, color: palette.muted }}
          >
            {availability}
          </Text>
        </Pressable>
      </Animated.View>
      {reading && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={focused ? 'Browse navigation' : 'Focus reading'}
          accessibilityState={{ expanded: !focused }}
          onPress={disclose}
          style={[s.button, { minHeight: rowHeight }]}
        >
          <Text style={{ color: palette.accent, fontSize: 22 }}>
            {focused ? '⌃' : '⌄'}
          </Text>
        </Pressable>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={reading ? 'Reading options' : 'Vaultor options'}
        onPress={more}
        style={[s.button, { minHeight: rowHeight }]}
      >
        <Text style={{ color: palette.text, fontSize: 19 }}>•••</Text>
      </Pressable>
    </View>
  );
  return (
    <Animated.View
      testID="navigation-folio"
      style={[
        s.folio,
        { backgroundColor: palette.surface, borderColor: palette.divider },
        rail
          ? {
              width: blend(184, 144),
              borderRightWidth: StyleSheet.hairlineWidth,
              flexDirection: 'column',
            }
          : {
              height: blend(
                (stacked ? rowHeight * 2 : rowHeight) + 8,
                rowHeight,
              ),
              borderTopWidth: StyleSheet.hairlineWidth,
              flexDirection: stacked ? 'column' : 'row',
            },
      ]}
    >
      {tabs}
      {controls}
    </Animated.View>
  );
}
const s = StyleSheet.create({
  folio: { overflow: 'hidden', alignItems: 'stretch' },
  tabs: { overflow: 'hidden', flexDirection: 'row', position: 'relative' },
  tab: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  mark: { position: 'absolute', bottom: 0, width: '46%', height: 2 },
  railMark: { position: 'absolute', left: 0, top: 12, bottom: 12, width: 3 },
  controls: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  railControls: { flex: 0, flexDirection: 'column', alignItems: 'stretch' },
  context: { flex: 1, minWidth: 0 },
  source: { justifyContent: 'center', paddingHorizontal: 10, gap: 3 },
  button: { width: 48, alignItems: 'center', justifyContent: 'center' },
});
