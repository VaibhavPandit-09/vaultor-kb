import React, { useEffect, useRef, useState } from 'react';
import { Animated, AppState, findNodeHandle, Text, View } from 'react-native';
import { Action } from './BrowseScreen';
import { VaultorHaptics } from './haptics';
import { motionDuration, settleEasing } from './motion';
import { useReading, usePalette } from './ui';

/** Explicit settings preview, never a fake document save or background event. */
export default function FeedbackPreview() {
  const { preferences, reduced } = useReading(),
    palette = usePalette();
  const [label, setLabel] = useState('Preview touch feedback');
  const root = useRef<React.ElementRef<typeof View>>(null),
    progress = useRef(new Animated.Value(1)).current;
  const ticket = useRef(0);
  useEffect(() => {
    const activeTicket = ticket;
    activeTicket.current++;
    progress.stopAnimation();
    progress.setValue(1);
    const event = AppState.addEventListener('change', () => {
      activeTicket.current++;
      progress.stopAnimation();
      progress.setValue(1);
    });
    return () => {
      activeTicket.current++;
      progress.stopAnimation();
      event.remove();
    };
  }, [preferences.haptics, preferences.motion, reduced, progress]);
  const preview = (rich: 'anchor' | 'capture') => {
    const key = ++ticket.current;
    progress.stopAnimation();
    progress.setValue(0);
    setLabel(
      rich === 'anchor'
        ? 'Selection feedback preview'
        : 'Completion feedback preview',
    );
    Animated.timing(progress, {
      toValue: 1,
      duration: motionDuration('utility', preferences.motion, reduced),
      easing: settleEasing,
      useNativeDriver: true,
    }).start(({ finished }) => {
      const tag = findNodeHandle(root.current);
      if (finished && key === ticket.current && tag)
        rich === 'anchor'
          ? VaultorHaptics.selectionSnap(tag, preferences.haptics !== 'off')
          : VaultorHaptics.playAuthoredPattern(
              'REVIEW_CAPTURED',
              tag,
              preferences.haptics !== 'off',
            );
    });
  };
  return (
    <View ref={root} collapsable={false}>
      <View
        style={{
          width: 160,
          height: 32,
          borderBottomWidth: 1,
          borderColor: palette.border,
        }}
      >
        <Animated.View
          style={{
            width: 24,
            height: 24,
            borderRadius: 4,
            backgroundColor: palette.accent,
            transform: [
              {
                translateX: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 128],
                }),
              },
            ],
          }}
        />
      </View>
      <Text
        accessibilityLiveRegion="polite"
        style={{ color: palette.secondary }}
      >
        {label}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        <Action label="Preview selection" onPress={() => preview('anchor')} />
        <Action label="Preview completion" onPress={() => preview('capture')} />
      </View>
    </View>
  );
}
