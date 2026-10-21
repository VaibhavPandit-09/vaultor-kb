import React from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePalette } from './ui';

/** Context, not a destination. Only the currently visible owner attaches its ref. */
export default function SourceContext({
  workspace,
  availability,
  title,
  disabled,
  open,
  sourceRef,
  landing,
  switchable = true,
  titleMoving = false,
}: {
  workspace: string;
  availability: string;
  title?: string;
  disabled: boolean;
  open(): void;
  sourceRef?: React.RefObject<React.ElementRef<typeof View> | null>;
  landing: Animated.Value;
  switchable?: boolean;
  titleMoving?: boolean;
}) {
  const p = usePalette();
  const status =
    availability === 'Connected'
      ? ''
      : availability === 'Downloaded · offline'
      ? 'Offline · downloaded'
      : availability;
  return (
    <Animated.View
      style={[
        s.grow,
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
        accessibilityRole="button"
        disabled={disabled}
        accessibilityLabel={`${
          title ? title + '. ' : ''
        }${workspace}. ${availability}. Choose source`}
        accessibilityHint="Inspect or switch the reading source"
        onPress={open}
        style={({ pressed }) => [
          s.control,
          { backgroundColor: pressed ? p.pressed : 'transparent' },
        ]}
      >
        <View style={s.grow}>
          <Text
            numberOfLines={1}
            style={[
              title ? s.readerTitle : s.name,
              {
                color: title ? p.text : p.secondary,
                opacity: titleMoving && title ? 0 : 1,
              },
            ]}
          >
            {title || workspace}
          </Text>
          {title || status ? (
            <Text numberOfLines={1} style={[s.status, { color: p.muted }]}>
              {title ? `${status ? status + ' · ' : ''}${workspace}` : status}
            </Text>
          ) : null}
        </View>
        {!title && switchable && (
          <Text
            importantForAccessibility="no"
            style={[s.chevron, { color: p.muted }]}
          >
            ⌄
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
}
const s = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  control: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 5,
  },
  name: { fontSize: 13, fontWeight: '500' },
  readerTitle: { fontSize: 14, fontWeight: '600' },
  status: { fontSize: 11, marginTop: 1 },
  chevron: { fontSize: 16 },
});
