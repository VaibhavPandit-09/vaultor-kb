import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { motionDuration, settleEasing } from './motion';
import { useReading } from './ui';

/** The measured surface claims its final space. Sources may opt into a reversible
 * exit with bounded window cleanup; other callers retain immediate dismissal. */
export default function MotionSheet({
  children,
  style,
  onSettled,
  presented = true,
  kind = 'utility',
  dismissing = false,
  onDismissed,
}: {
  children: React.ReactNode;
  style: StyleProp<ViewStyle>;
  onSettled?: () => void;
  presented?: boolean;
  kind?: 'utility' | 'navigation';
  dismissing?: boolean;
  onDismissed?: () => void;
}) {
  const { preferences, reduced } = useReading();
  const progress = useRef(new Animated.Value(0)).current;
  const [height, setHeight] = useState(0);
  const bounds = useRef<React.ElementRef<typeof View>>(null);
  const started = useRef(false),
    completed = useRef(false);
  const settled = useRef(onSettled);
  settled.current = onSettled;
  const dismissed = useRef(onDismissed);
  dismissed.current = onDismissed;
  useEffect(() => {
    if (!dismissing) return;
    progress.stopAnimation();
    let active = true;
    const finish = () => {
      if (!active) return;
      active = false;
      dismissed.current?.();
    };
    const duration = motionDuration(kind, preferences.motion, reduced);
    const animation = Animated.timing(progress, {
      toValue: 0,
      duration,
      easing: settleEasing,
      useNativeDriver: true,
    });
    // Window cleanup cannot depend on an animation completion callback.
    const fallback = setTimeout(finish, duration + 80);
    animation.start(({ finished }) => {
      if (finished) finish();
    });
    return () => {
      active = false;
      clearTimeout(fallback);
      animation.stop();
    };
  }, [dismissing, kind, preferences.motion, reduced, progress]);
  useEffect(() => {
    if (presented && !started.current)
      bounds.current?.measure((_x, _y, _width, measured) => {
        if (!started.current && measured > 0) setHeight(measured);
      });
  }, [presented]);
  useEffect(() => {
    if (!height || !presented || completed.current || dismissing) return;
    started.current = true;
    progress.stopAnimation();
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: motionDuration(kind, preferences.motion, reduced),
      easing: settleEasing,
      useNativeDriver: true,
    });
    let active = true;
    animation.start(({ finished }) => {
      if (finished && active) {
        completed.current = true;
        settled.current?.();
      }
    });
    return () => {
      active = false;
      animation.stop();
    };
  }, [
    preferences.motion,
    reduced,
    progress,
    height,
    presented,
    kind,
    dismissing,
  ]);
  return (
    <View
      ref={bounds}
      collapsable={false}
      style={styles.bounds}
      onLayout={event => {
        if (presented && !started.current)
          setHeight(event.nativeEvent.layout.height);
      }}
    >
      <Animated.View
        style={[
          style,
          {
            transform: [
              {
                translateY: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [height, 0],
                }),
              },
            ],
            opacity: height ? 1 : 0,
          },
        ]}
      >
        {children}
      </Animated.View>
    </View>
  );
}
const styles = StyleSheet.create({
  bounds: { flexShrink: 1, maxHeight: '90%' },
});
