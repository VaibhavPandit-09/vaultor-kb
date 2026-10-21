import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useResourceMotion } from '../src/ResourceMotion';
jest.mock('react-native', () => ({
  Animated: {
    Value: class {
      setValue() {}
      stopAnimation() {}
    },
    timing: () => ({ start() {}, stop() {} }),
  },
  AppState: { addEventListener: () => ({ remove() {} }) },
}));
jest.mock('../src/ui', () => ({
  useReading: () => ({ reduced: false, preferences: { motion: 'smooth' } }),
}));
jest.mock('../src/motion', () => ({
  motionDuration: () => 300,
  settleEasing: undefined,
}));
let motion: ReturnType<typeof useResourceMotion>;
function Probe({ reading }: { reading: boolean }) {
  motion = useResourceMotion('source', reading, 'resource', false, false);
  return null;
}
let tree: ReactTestRenderer;
beforeEach(() => jest.useFakeTimers());
afterEach(async () => {
  await act(async () => tree.unmount());
  jest.useRealTimers();
});
async function opened() {
  await act(async () => {
    tree = create(<Probe reading={false} />);
  });
  motion.viewportRef.current = {
    measureInWindow: (cb: Function) => cb(0, 0, 400, 800),
  } as any;
  motion.measureViewport();
  await act(async () => {
    motion.context.begin({
      id: 'resource',
      scope: 'source',
      title: 'Note',
      measure: async () => ({
        rect: { x: 0, y: 200, width: 400, height: 60 },
        text: { x: 10, y: 205, width: 300, height: 24 },
      }),
      focus() {},
    });
  });
  await act(async () => tree.update(<Probe reading />));
}
test('committed browsing clears retained pixels even if animation callbacks never arrive', async () => {
  await opened();
  await act(async () => tree.update(<Probe reading={false} />));
  expect(motion.visible).toBe(true);
  await act(async () => {
    jest.advanceTimersByTime(600);
  });
  expect(motion.visible).toBe(false);
  expect(motion.presentation).toBeUndefined();
});
test('returning to reading cancels stale browsing cleanup without losing reader identity', async () => {
  await opened();
  await act(async () => tree.update(<Probe reading={false} />));
  await act(async () => tree.update(<Probe reading />));
  await act(async () => {
    jest.advanceTimersByTime(600);
  });
  expect(motion.visible).toBe(true);
  expect(motion.presentation?.origin.id).toBe('resource');
});
