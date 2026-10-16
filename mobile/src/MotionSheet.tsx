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

/** The existing bottom surface claims its final space. Closing still releases
 * focus/Back immediately; no animation owns application correctness. */
export default function MotionSheet({
  children,
  style,
  onSettled,
  presented = true,
}: {
  children: React.ReactNode;
  style: StyleProp<ViewStyle>;
  onSettled?: () => void;
  presented?: boolean;
}) {
  const { preferences, reduced } = useReading();
  const progress = useRef(new Animated.Value(0)).current;
  const [height, setHeight] = useState(0);
  const bounds = useRef<React.ElementRef<typeof View>>(null);
  const started = useRef(false),
    completed = useRef(false);
  const settled = useRef(onSettled);
  settled.current = onSettled;
  useEffect(() => {
    if (presented && !started.current)
      bounds.current?.measure((_x, _y, _width, measured) => {
        if (!started.current && measured > 0) setHeight(measured);
      });
  }, [presented]);
  useEffect(() => {
    if (!height || !presented || completed.current) return;
    started.current = true;
    progress.stopAnimation();
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: motionDuration('navigation', preferences.motion, reduced),
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
  }, [preferences.motion, reduced, progress, height, presented]);
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
