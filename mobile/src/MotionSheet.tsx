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
}: {
  children: React.ReactNode;
  style: StyleProp<ViewStyle>;
}) {
  const { preferences, reduced } = useReading();
  const progress = useRef(new Animated.Value(0)).current;
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (!height) return;
    progress.stopAnimation();
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: motionDuration('utility', preferences.motion, reduced),
      easing: settleEasing,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [preferences.motion, reduced, progress, height]);
  return (
    <View
      style={styles.bounds}
      onLayout={event => {
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
