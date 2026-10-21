export type Rect = { x: number; y: number; width: number; height: number };
/** Recycled/offscreen/invalid origins must not imply a shared spatial relationship. */
export function usableOrigin(rect: Rect, viewport: Rect) {
  return (
    [...Object.values(rect), ...Object.values(viewport)].every(
      Number.isFinite,
    ) &&
    rect.width >= 24 &&
    rect.height >= 24 &&
    viewport.width > 0 &&
    viewport.height > 0 &&
    rect.x >= viewport.x - 1 &&
    rect.y >= viewport.y - 1 &&
    rect.x + rect.width <= viewport.x + viewport.width + 1 &&
    rect.y + rect.height <= viewport.y + viewport.height + 1
  );
}
