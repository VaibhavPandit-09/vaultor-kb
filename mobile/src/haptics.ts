import { NativeModules, AppState } from 'react-native';
type HapticEvent =
  | 'micro'
  | 'selection'
  | 'complete'
  | 'reject'
  | 'destructive';
export type AuthoredPattern = 'REVIEW_CAPTURED';
let sequence = 0;
const session = String(Date.now());
// Product code requests meaning only. Kotlin owns every device/effect decision.
function send(event: HapticEvent, tag: number, enabled: boolean, pattern = '') {
  if (
    !enabled ||
    AppState.currentState !== 'active' ||
    !Number.isSafeInteger(tag) ||
    tag < 1
  )
    return;
  void NativeModules.VaultorPresentation?.feedback(
    event,
    pattern,
    tag,
    session + ':' + ++sequence,
  ).catch(() => {});
}
export const VaultorHaptics = {
  microConfirm: (tag: number, enabled: boolean) => send('micro', tag, enabled),
  selectionSnap: (tag: number, enabled: boolean) =>
    send('selection', tag, enabled),
  actionComplete: (tag: number, enabled: boolean) =>
    send('complete', tag, enabled),
  reject: (tag: number, enabled: boolean) => send('reject', tag, enabled),
  destructiveConfirm: (tag: number, enabled: boolean) =>
    send('destructive', tag, enabled),
  playAuthoredPattern: (
    pattern: AuthoredPattern,
    tag: number,
    enabled: boolean,
  ) => {
    if (pattern === 'REVIEW_CAPTURED') send('complete', tag, enabled, pattern);
  },
};
