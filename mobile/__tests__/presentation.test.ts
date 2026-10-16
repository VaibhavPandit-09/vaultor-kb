import { ThemeTransition } from '../src/themeTransition';
import { motionDuration } from '../src/motion';
import { haptic } from '../src/haptics';
import { normalizeReading } from '../src/reading';
import { AppState, NativeModules } from 'react-native';

jest.mock('react-native', () => ({
  Easing: { bezier: jest.fn() },
  AppState: { currentState: 'active' },
  NativeModules: {
    VaultorPresentation: { feedback: jest.fn(async () => 'system') },
  },
}));
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  AppState.currentState = 'active';
});
afterEach(() => jest.useRealTimers());
function setup() {
  const port = {
    prepareTheme: jest.fn(async (_tag: number, _token: string) => true),
    revealTheme: jest.fn(async () => {}),
    cancelTheme: jest.fn(),
  };
  return { port, transition: new ThemeTransition(port) };
}
test('late capture cannot overwrite a newer theme intent or reveal its pixels', async () => {
  const { port, transition } = setup(),
    first = jest.fn(),
    second = jest.fn();
  let finish!: (value: boolean) => void;
  port.prepareTheme.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve;
      }),
  );
  const old = transition.change(10, 420, first);
  await transition.change(11, 200, second);
  finish(true);
  await old;
  await jest.runAllTimersAsync();
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledTimes(1);
  expect(port.revealTheme).toHaveBeenCalledTimes(1);
  expect(port.revealTheme).toHaveBeenCalledWith('2', 200);
});
test('capture failure/timeout cannot block a choice; reduced motion does not capture', async () => {
  const { port, transition } = setup(),
    commit = jest.fn();
  port.prepareTheme.mockImplementationOnce(() => new Promise(() => {}));
  const pending = transition.change(10, 420, commit);
  await jest.advanceTimersByTimeAsync(200);
  await pending;
  expect(commit).toHaveBeenCalledTimes(1);
  await transition.change(10, 0, commit);
  expect(port.prepareTheme).toHaveBeenCalledTimes(1);
  expect(port.revealTheme).not.toHaveBeenCalled();
  expect(commit).toHaveBeenCalledTimes(2);
});
test('closing a surface cancels a scheduled reveal without reverting the committed theme', async () => {
  const { port, transition } = setup(),
    commit = jest.fn();
  await transition.change(10, 420, commit);
  transition.cancel();
  await jest.runAllTimersAsync();
  expect(commit).toHaveBeenCalledTimes(1);
  expect(port.revealTheme).not.toHaveBeenCalled();
});
test('haptics off/background have no bridge side effects; explicit events carry semantic profiles and unique identities', () => {
  const send = NativeModules.VaultorPresentation.feedback;
  haptic('complete', 10, false, 'capture');
  AppState.currentState = 'background';
  haptic('complete', 10, true, 'capture');
  expect(send).not.toHaveBeenCalled();
  AppState.currentState = 'active';
  haptic('selection', 10, true, 'anchor');
  haptic('complete', 10, true, 'capture');
  expect(send.mock.calls.map((call: unknown[]) => call.slice(0, 3))).toEqual([
    ['selection', 'anchor', 10],
    ['complete', 'capture', 10],
  ]);
  expect(send.mock.calls[0][3]).not.toBe(send.mock.calls[1][3]);
});
test('motion and haptic preferences migrate conservatively without changing existing appearance', () => {
  expect(normalizeReading({ theme: 'oled', size: 24 })).toMatchObject({
    theme: 'oled',
    size: 24,
    haptics: 'system',
  });
  expect(normalizeReading({ haptics: 'off' }).haptics).toBe('off');
  expect(normalizeReading({ richHaptics: 'platform' }).richHaptics).toBe('platform');
  expect(normalizeReading({ richHaptics: 'invalid' }).richHaptics).toBe('clear');
  expect(motionDuration('structure', 'smooth', true)).toBe(0);
  expect(motionDuration('utility', 'snappy', false)).toBeLessThan(
    motionDuration('utility', 'smooth', false),
  );
});
