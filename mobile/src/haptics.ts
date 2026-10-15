import { NativeModules, AppState } from 'react-native';
export type HapticEvent =
  | 'micro'
  | 'selection'
  | 'complete'
  | 'reject'
  | 'destructive';
export type RichHaptic = 'anchor' | 'capture';
let sequence = 0;
const session = String(Date.now());
// Call only at a committed interaction/keyframe, never on animation frames.
// Native repeats preference/visibility checks and owns device capabilities.
export function haptic(
  event: HapticEvent,
  tag: number,
  enabled: boolean,
  rich?: RichHaptic,
) {
  if (!enabled || AppState.currentState !== 'active' || !Number.isFinite(tag))
    return;
  void NativeModules.VaultorPresentation?.feedback(
    event,
    rich ?? '',
    tag,
    session + ':' + ++sequence,
  ).catch(() => {});
}
