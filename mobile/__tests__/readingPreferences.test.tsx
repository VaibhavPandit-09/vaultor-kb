import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { NativeModules } from 'react-native';
import { ReadingProvider, useAppearance, useReading } from '../src/ui';
jest.mock('react-native', () => ({
  StyleSheet: { flatten: (v: any) => v },
  useColorScheme: () => 'light',
  NativeModules: { VaultorNative: { readerPreferences: jest.fn() } },
}));
let observed: ReturnType<typeof useReading>,
  theme: string,
  tree: ReactTestRenderer;
function Probe() {
  observed = useReading();
  theme = useAppearance();
  return null;
}
const native = NativeModules.VaultorNative.readerPreferences as jest.Mock;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  native.mockReset();
});
afterEach(async () => {
  await act(async () => tree?.unmount());
});
test('late preference load cannot overwrite an immediate choice; OS resolves without a host', async () => {
  let finish!: (raw: string) => void;
  native.mockImplementation((a: string) =>
    a === 'get'
      ? new Promise(r => {
          finish = r;
        })
      : Promise.resolve('{}'),
  );
  await act(async () => {
    tree = create(
      <ReadingProvider>
        <Probe />
      </ReadingProvider>,
    );
  });
  expect(theme).toBe('light');
  await act(async () => observed.update({ theme: 'oled' }));
  await act(async () => finish('{"theme":"light"}'));
  expect(observed.preferences.theme).toBe('oled');
  expect(theme).toBe('oled');
});
test('failed preference write retains immediate values and Retry writes those exact values', async () => {
  native.mockImplementation((a: string) =>
    a === 'get'
      ? Promise.resolve('{}')
      : Promise.reject(Error('Storage unavailable')),
  );
  await act(async () => {
    tree = create(
      <ReadingProvider>
        <Probe />
      </ReadingProvider>,
    );
  });
  await act(async () => observed.update({ size: 24, accent: 'mint' }));
  expect(observed.preferences.size).toBe(24);
  expect(observed.error).toMatch(/Retry/);
  native.mockResolvedValue('{}');
  await act(async () => observed.retry());
  expect(JSON.parse(native.mock.calls.at(-1)![1])).toMatchObject({
    size: 24,
    accent: 'mint',
  });
  expect(observed.error).toBe('');
});
