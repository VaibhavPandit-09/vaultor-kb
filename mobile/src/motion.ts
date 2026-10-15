import { AccessibilityInfo, Easing } from 'react-native';
import { useEffect, useState } from 'react';

export type MotionKind =
  | 'micro'
  | 'utility'
  | 'structure'
  | 'navigation'
  | 'theme';
const durations = {
  smooth: {
    micro: 120,
    utility: 220,
    structure: 300,
    navigation: 360,
    theme: 420,
  },
  snappy: {
    micro: 80,
    utility: 120,
    structure: 160,
    navigation: 180,
    theme: 200,
  },
};
export function motionDuration(
  kind: MotionKind,
  mode: 'smooth' | 'snappy',
  reduced: boolean,
) {
  return reduced ? 0 : durations[mode][kind];
}
export const settleEasing = Easing.bezier(0.2, 0, 0, 1);

// Start conservatively until Android's preference is known. One source for RN
// presentation and the restricted reader; a failed query keeps motion reduced.
export function useReducedMotion() {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let alive = true,
      changed = false;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then(value => {
        if (alive && !changed) setReduced(value);
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      value => {
        changed = true;
        setReduced(value);
      },
    );
    return () => {
      alive = false;
      subscription.remove();
    };
  }, []);
  return reduced;
}
