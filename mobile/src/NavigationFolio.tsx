import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePalette, useReading } from './ui';
import { motionDuration, settleEasing } from './motion';
import { navigationLayout } from './navigationPresentation';
import SourceContext from './SourceContext';

export type PrimaryDestination = 'home' | 'library' | 'review';
const destinations = [
  { id: 'home', label: 'Home' },
  { id: 'library', label: 'Library' },
  { id: 'review', label: 'Review' },
] as const;

/** Same line weight and box, independent of the system's symbol font. */
function DestinationIcon({
  kind,
  color,
}: {
  kind: PrimaryDestination;
  color: string;
}) {
  const stroke = { borderColor: color };
  return (
    <View style={s.icon} importantForAccessibility="no-hide-descendants">
      {kind === 'home' ? (
        <>
          <View style={[s.house, stroke]} />
          <View style={[s.roofLeft, { backgroundColor: color }]} />
          <View style={[s.roofRight, { backgroundColor: color }]} />
        </>
      ) : kind === 'library' ? (
        <>
          <View style={[s.book, stroke]} />
          <View style={[s.spine, { backgroundColor: color }]} />
        </>
      ) : (
        <>
          <View style={[s.review, stroke]} />
          <View style={[s.line, { backgroundColor: color }]} />
          <View style={[s.line, s.shortLine, { backgroundColor: color }]} />
        </>
      )}
    </View>
  );
}

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
  appearance,
  titleMoving = false,
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
  appearance(): void;
  titleMoving?: boolean;
  back(): void;
  sourceRef: React.RefObject<React.ElementRef<typeof View> | null>;
  landing: Animated.Value;
  disclosed: boolean;
  disclose(): void;
}) {
  const p = usePalette(),
    { reduced, preferences } = useReading();
  const window = useWindowDimensions(),
    insets = useSafeAreaInsets();
  const width = window.width - insets.left - insets.right;
  const { rail } = navigationLayout(
    width,
    window.height - insets.top - insets.bottom,
    window.fontScale,
  );
  const focused = reading && !disclosed;
  const focus = useRef(new Animated.Value(reading ? 2 : 0)).current;
  const selected = useRef(
    new Animated.Value(destinations.findIndex(d => d.id === current)),
  ).current;
  useEffect(() => {
    const animation = Animated.timing(focus, {
      toValue: focused ? 2 : reading ? 1 : 0,
      duration: motionDuration('navigation', preferences.motion, reduced),
      easing: settleEasing,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [focus, focused, reading, preferences.motion, reduced]);
  useEffect(() => {
    const animation = Animated.timing(selected, {
      toValue: destinations.findIndex(d => d.id === current),
      duration: motionDuration('structure', preferences.motion, reduced),
      easing: settleEasing,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [selected, current, preferences.motion, reduced]);
  const blend = (a: number, b: number) =>
    focus.interpolate({ inputRange: [0, 1, 2], outputRange: [a, a, b] });
  const browsingHeight = Math.max(58, 30 + 18 * window.fontScale);
  const readingHeight = Math.max(52, 12 + 32 * window.fontScale);
  const stripWidth = focus.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [width, width - 48, width - 48],
  });
  const tabClip = focus.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [width, width - 48, 0],
  });
  const foldSpace = focus.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [0, 48, 0],
  });
  const markerLeft = Animated.subtract(
    Animated.multiply(
      Animated.divide(stripWidth, 3),
      Animated.add(selected, 0.5),
    ),
    14,
  );
  const railTabsHeight = browsingHeight * 3;
  return (
    <Animated.View
      testID="navigation-folio"
      style={[
        s.folio,
        { backgroundColor: p.surface, borderColor: p.divider },
        rail
          ? {
              width: blend(144, 128),
              borderRightWidth: StyleSheet.hairlineWidth,
            }
          : {
              height: blend(browsingHeight, readingHeight),
              flexDirection: 'row',
              borderTopWidth: StyleSheet.hairlineWidth,
            },
      ]}
    >
      <Animated.View
        pointerEvents={focused ? 'none' : 'auto'}
        importantForAccessibility={focused ? 'no-hide-descendants' : 'auto'}
        style={[
          s.clip,
          rail ? { height: blend(railTabsHeight, 0) } : { width: tabClip },
        ]}
      >
        <Animated.View
          style={[
            s.tabs,
            rail
              ? { height: railTabsHeight, flexDirection: 'column' }
              : { width: stripWidth, height: browsingHeight },
          ]}
        >
          {destinations.map(d => (
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
                { backgroundColor: pressed ? p.pressed : 'transparent' },
              ]}
            >
              <DestinationIcon
                kind={d.id}
                color={current === d.id ? p.accent : p.secondary}
              />
              <Text
                numberOfLines={1}
                style={[
                  s.label,
                  {
                    color: current === d.id ? p.text : p.secondary,
                    fontWeight: current === d.id ? '600' : '400',
                  },
                ]}
              >
                {d.label}
              </Text>
            </Pressable>
          ))}
          <Animated.View
            pointerEvents="none"
            style={[
              s.marker,
              { backgroundColor: p.accent },
              rail
                ? {
                    left: 0,
                    width: 2,
                    height: 24,
                    top: selected.interpolate({
                      inputRange: [0, 1, 2],
                      outputRange: [
                        browsingHeight / 2 - 12,
                        browsingHeight * 1.5 - 12,
                        browsingHeight * 2.5 - 12,
                      ],
                    }),
                  }
                : {
                    width: 28,
                    height: 2,
                    bottom: 3,
                    left: markerLeft,
                  },
            ]}
          />
        </Animated.View>
      </Animated.View>
      <Animated.View
        pointerEvents={focused ? 'auto' : 'none'}
        importantForAccessibility={focused ? 'auto' : 'no-hide-descendants'}
        style={[
          s.clip,
          rail
            ? { height: blend(0, readingHeight * 3 + 120) }
            : { width: blend(0, width) },
        ]}
      >
        <View
          style={[
            s.reader,
            rail
              ? {
                  width: 128,
                  height: readingHeight * 3 + 120,
                  alignItems: 'stretch',
                }
              : {
                  width,
                  height: readingHeight,
                  flexDirection: 'row',
                  alignItems: 'center',
                },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={back}
            style={s.button}
          >
            <Text style={[s.back, { color: p.text }]}>‹</Text>
          </Pressable>
          <SourceContext
            title={title}
            titleMoving={titleMoving}
            workspace={workspace}
            availability={availability}
            disabled={disabled}
            open={sources}
            sourceRef={reading ? sourceRef : undefined}
            landing={landing}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Browse navigation"
            accessibilityState={{ expanded: false }}
            onPress={disclose}
            style={s.button}
          >
            <Text style={[s.disclosure, { color: p.secondary }]}>⌃</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reading appearance"
            onPress={appearance}
            style={s.button}
          >
            <Text style={[s.more, { color: p.text }]}>Aa</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reading options"
            onPress={more}
            style={s.button}
          >
            <Text style={[s.more, { color: p.secondary }]}>•••</Text>
          </Pressable>
        </View>
      </Animated.View>
      {reading && (
        <Animated.View
          pointerEvents={focused ? 'none' : 'auto'}
          importantForAccessibility={focused ? 'no-hide-descendants' : 'auto'}
          style={[s.clip, rail ? { height: foldSpace } : { width: foldSpace }]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Focus reading"
            accessibilityState={{ expanded: true }}
            onPress={disclose}
            style={[s.button, { height: browsingHeight }]}
          >
            <Text
              style={[
                s.disclosure,
                { color: p.secondary, opacity: disclosed ? 1 : 0 },
              ]}
            >
              ⌄
            </Text>
          </Pressable>
        </Animated.View>
      )}
    </Animated.View>
  );
}
const s = StyleSheet.create({
  folio: { overflow: 'hidden' },
  clip: { overflow: 'hidden' },
  tabs: { flexDirection: 'row' },
  tab: {
    flex: 1,
    minHeight: 48,
    minWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 5,
  },
  label: { fontSize: 12 },
  marker: { position: 'absolute', borderRadius: 1 },
  reader: { minHeight: 52 },
  button: {
    width: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  back: { fontSize: 28 },
  disclosure: { fontSize: 21 },
  more: { fontSize: 18 },
  icon: { width: 22, height: 22 },
  house: {
    position: 'absolute',
    left: 5,
    top: 10,
    width: 12,
    height: 10,
    borderWidth: 1.7,
    borderTopWidth: 0,
    borderBottomLeftRadius: 1,
    borderBottomRightRadius: 1,
  },
  roofLeft: {
    position: 'absolute',
    left: 2,
    top: 7,
    width: 11,
    height: 1.7,
    transform: [{ rotate: '-42deg' }],
  },
  roofRight: {
    position: 'absolute',
    right: 2,
    top: 7,
    width: 11,
    height: 1.7,
    transform: [{ rotate: '42deg' }],
  },
  book: {
    position: 'absolute',
    left: 3,
    top: 3,
    width: 16,
    height: 17,
    borderWidth: 1.7,
    borderRadius: 2,
  },
  spine: { position: 'absolute', left: 7, top: 4, width: 1.7, height: 15 },
  review: {
    position: 'absolute',
    left: 3,
    top: 3,
    width: 16,
    height: 17,
    borderWidth: 1.7,
    borderRadius: 3,
  },
  line: { position: 'absolute', left: 7, top: 8, width: 8, height: 1.7 },
  shortLine: { top: 13, width: 5 },
});
