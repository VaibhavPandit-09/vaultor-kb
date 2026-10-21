import { AccessibilityInfo, Easing } from 'react-native';
import { useEffect, useState } from 'react';

export type MotionKind =
  | 'micro'
  | 'anchor'
  | 'utility'
  | 'structure'
  | 'navigation'
  | 'theme';
const durations = {
  smooth: {
    micro: 120,
    anchor: 200,
    utility: 300,
    structure: 300,
    navigation: 360,
    theme: 420,
  },
  snappy: {
    micro: 80,
    anchor: 180,
    utility: 220,
    structure: 240,
    navigation: 280,
    theme: 320,
  },
};
export function motionDuration(
  kind: MotionKind,
  mode: 'smooth' | 'snappy',
  reduced: boolean,
) {
  return reduced ? 0 : durations[mode][kind];
}
// Preserve enough mid-travel contrast before the soft settle. No overshoot.
export const settleEasing = Easing.bezier(0.2, 0, 0.2, 1);

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
