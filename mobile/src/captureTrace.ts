import { NativeModules } from 'react-native';

export type CaptureTrace = { id: string; started: number };
export type TraceStage =
  | 'capture_accepted'
  | 'draft_ready'
  | 'draft_failed'
  | 'sheet_settled'
  | 'anchor_started'
  | 'anchor_finished'
  | 'anchor_cancelled'
  | 'save_accepted'
  | 'durable_save'
  | 'save_failed'
  | 'receipt_started'
  | 'receipt_finished'
  | 'receipt_cancelled'
  | 'completion_check'
  | 'keyboard_hidden'
  | 'composer_closed'
  | 'js_emit'
  | 'js_suppressed'
  | 'js_bridge_result'
  | 'js_bridge_failed';
export type TraceFacts = {
  keyboardVisible?: boolean;
  geometryDone?: boolean;
  alive?: boolean;
  viewPresent?: boolean;
  finished?: boolean;
  reduced?: boolean;
  enabled?: boolean;
  active?: boolean;
  validTag?: boolean;
  event?: 'selection' | 'complete' | 'reject';
};
const native = () => NativeModules.VaultorPresentation;
const now = () =>
  (
    globalThis as unknown as { performance: { now(): number } }
  ).performance.now();
let armed: CaptureTrace | undefined;
export async function traceCommand(action: 'arm' | 'read' | 'copy' | 'clear') {
  if (native()?.developmentDiagnostics !== true) return undefined;
  const report = JSON.parse(await native().captureTrace(action));
  if (action === 'arm') armed = { id: report.id, started: now() };
  if (action === 'clear' || action === 'copy') armed = undefined;
  return report;
}
export function claimCaptureTrace() {
  if (native()?.developmentDiagnostics !== true) return undefined;
  const trace = armed;
  armed = undefined;
  recordTrace(trace, 'capture_accepted');
  return trace;
}
export function recordTrace(
  trace: CaptureTrace | undefined,
  stage: TraceStage,
  facts: TraceFacts = {},
) {
  if (!trace || native()?.developmentDiagnostics !== true) return;
  // Native repeats the allowlist. No content, source identity, view tag or error
  // text can enter the exported trace. Calls never gate product behavior.
  try {
    void native()
      .captureTraceRecord(
        trace.id,
        stage,
        JSON.stringify(facts),
        now() - trace.started,
      )
      .catch(() => {});
  } catch {
    // Diagnostic collection must never change the product callback's outcome.
  }
}
