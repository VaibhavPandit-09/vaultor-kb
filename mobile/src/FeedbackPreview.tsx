import React, { useEffect, useRef, useState } from 'react';
import { Animated, AppState, findNodeHandle, Text, View } from 'react-native';
import { Action } from './BrowseScreen';
import { haptic, type RichHaptic } from './haptics';
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
  const preview = (rich: RichHaptic) => {
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
      duration: motionDuration('micro', preferences.motion, reduced),
      easing: settleEasing,
      useNativeDriver: true,
    }).start(({ finished }) => {
      const tag = findNodeHandle(root.current);
      if (finished && key === ticket.current && tag)
        haptic(
          rich === 'anchor' ? 'selection' : 'complete',
          tag,
          preferences.haptics !== 'off',
          rich,
        );
    });
  };
  return (
    <View ref={root} collapsable={false}>
      <Animated.View
        style={{
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [4, 0],
              }),
            },
          ],
        }}
      >
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: palette.secondary }}
        >
          {label}
        </Text>
      </Animated.View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        <Action label="Preview selection" onPress={() => preview('anchor')} />
        <Action label="Preview completion" onPress={() => preview('capture')} />
      </View>
    </View>
  );
}
