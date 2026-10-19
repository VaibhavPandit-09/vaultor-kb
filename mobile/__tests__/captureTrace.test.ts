import { AppState, NativeModules } from 'react-native';
import {
  claimCaptureTrace,
  recordTrace,
  traceCommand,
} from '../src/captureTrace';
import { VaultorHaptics } from '../src/haptics';
jest.mock('react-native', () => ({
  AppState: { currentState: 'active' },
  NativeModules: {
    VaultorPresentation: {
      developmentDiagnostics: true,
      captureTrace: jest.fn(async () => JSON.stringify({ id: 'ephemeral' })),
      captureTraceRecord: jest.fn(async () => {}),
      feedbackTraced: jest.fn(async () => 'system'),
      feedback: jest.fn(async () => 'system'),
    },
  },
}));
const port = NativeModules.VaultorPresentation;
beforeEach(async () => {
  port.developmentDiagnostics = true;
  AppState.currentState = 'active';
  await traceCommand('clear');
  jest.clearAllMocks();
});
test('arm claims exactly one new flow; tracing and copying never invoke playback', async () => {
  await traceCommand('arm');
  const trace = claimCaptureTrace();
  expect(trace?.id).toBe('ephemeral');
  expect(claimCaptureTrace()).toBeUndefined();
  recordTrace(trace, 'durable_save', { keyboardVisible: true });
  await traceCommand('copy');
  expect(port.feedback).not.toHaveBeenCalled();
  expect(port.feedbackTraced).not.toHaveBeenCalled();
  expect(port.captureTraceRecord.mock.calls.map((c: any[]) => c[1])).toEqual([
    'capture_accepted',
    'durable_save',
  ]);
});
test('actual semantic path carries correlation without bypassing JS suppression', async () => {
  await traceCommand('arm');
  const trace = claimCaptureTrace();
  VaultorHaptics.playAuthoredPattern('REVIEW_CAPTURED', 12, false, trace);
  AppState.currentState = 'background';
  VaultorHaptics.playAuthoredPattern('REVIEW_CAPTURED', 12, true, trace);
  AppState.currentState = 'active';
  VaultorHaptics.playAuthoredPattern('REVIEW_CAPTURED', 0, true, trace);
  expect(port.feedbackTraced).not.toHaveBeenCalled();
  VaultorHaptics.playAuthoredPattern('REVIEW_CAPTURED', 12, true, trace);
  await Promise.resolve();
  expect(port.feedbackTraced).toHaveBeenCalledTimes(1);
  expect(port.feedbackTraced.mock.calls[0].slice(0, 3)).toEqual([
    'complete',
    'REVIEW_CAPTURED',
    12,
  ]);
  expect(port.feedbackTraced.mock.calls[0][4]).toBe('ephemeral');
  expect(
    port.captureTraceRecord.mock.calls.filter(
      (c: any[]) => c[1] === 'js_suppressed',
    ),
  ).toHaveLength(3);
});
test('ordinary builds cannot arm, claim, record or use traced playback', async () => {
  port.developmentDiagnostics = false;
  expect(await traceCommand('arm')).toBeUndefined();
  expect(claimCaptureTrace()).toBeUndefined();
  recordTrace({ id: 'ephemeral', started: 0 }, 'durable_save');
  VaultorHaptics.playAuthoredPattern('REVIEW_CAPTURED', 12, true);
  expect(port.captureTrace).not.toHaveBeenCalled();
  expect(port.captureTraceRecord).not.toHaveBeenCalled();
  expect(port.feedbackTraced).not.toHaveBeenCalled();
  expect(port.feedback).toHaveBeenCalledTimes(1);
});
