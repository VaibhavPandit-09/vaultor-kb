import { NativeModules, AppState } from 'react-native';
import { recordTrace, type CaptureTrace } from './captureTrace';
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
function send(
  event: HapticEvent,
  tag: number,
  enabled: boolean,
  pattern = '',
  trace?: CaptureTrace,
) {
  const facts = {
    event: event as 'selection' | 'complete' | 'reject',
    enabled,
    active: AppState.currentState === 'active',
    validTag: Number.isSafeInteger(tag) && tag > 0,
  };
  if (
    !enabled ||
    AppState.currentState !== 'active' ||
    !Number.isSafeInteger(tag) ||
    tag < 1
  ) {
    recordTrace(trace, 'js_suppressed', facts);
    return;
  }
  recordTrace(trace, 'js_emit', facts);
  const token = session + ':' + ++sequence;
  const port = NativeModules.VaultorPresentation;
  const request =
    trace && port?.developmentDiagnostics === true
      ? port.feedbackTraced(event, pattern, tag, token, trace.id)
      : port?.feedback(event, pattern, tag, token);
  void request
    ?.then(() => recordTrace(trace, 'js_bridge_result', facts))
    .catch(() => recordTrace(trace, 'js_bridge_failed', facts));
}
export const VaultorHaptics = {
  microConfirm: (tag: number, enabled: boolean) => send('micro', tag, enabled),
  selectionSnap: (tag: number, enabled: boolean, trace?: CaptureTrace) =>
    send('selection', tag, enabled, '', trace),
  actionComplete: (tag: number, enabled: boolean) =>
    send('complete', tag, enabled),
  reject: (tag: number, enabled: boolean, trace?: CaptureTrace) =>
    send('reject', tag, enabled, '', trace),
  destructiveConfirm: (tag: number, enabled: boolean) =>
    send('destructive', tag, enabled),
  playAuthoredPattern: (
    pattern: AuthoredPattern,
    tag: number,
    enabled: boolean,
    trace?: CaptureTrace,
  ) => {
    if (pattern === 'REVIEW_CAPTURED')
      send('complete', tag, enabled, pattern, trace);
  },
};
