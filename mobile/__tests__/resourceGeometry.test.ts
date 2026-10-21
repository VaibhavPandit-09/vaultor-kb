import { usableOrigin } from '../src/resourceGeometry';
const viewport = { x: 0, y: 30, width: 412, height: 800 };
test('only fully visible measured origins can claim reversible shared geometry', () => {
  expect(
    usableOrigin({ x: 16, y: 240, width: 380, height: 56 }, viewport),
  ).toBe(true);
  expect(usableOrigin({ x: 16, y: 12, width: 380, height: 56 }, viewport)).toBe(
    false,
  );
  expect(
    usableOrigin({ x: 16, y: 800, width: 380, height: 56 }, viewport),
  ).toBe(false);
  expect(usableOrigin({ x: 0, y: 100, width: 0, height: 56 }, viewport)).toBe(
    false,
  );
  expect(
    usableOrigin({ x: NaN, y: 100, width: 50, height: 56 }, viewport),
  ).toBe(false);
});
