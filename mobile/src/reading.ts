export type ReadingPreferences = {
  theme: 'os' | 'light' | 'dark' | 'oled';
  accent: 'blue' | 'violet' | 'mint' | 'amber';
  size: number;
  spacing: number;
  measure: number;
  motion: 'snappy' | 'smooth';
  haptics: 'system' | 'off';
  richHaptics: 'clear' | 'platform' | 'expressive';
};
export const defaultReading: ReadingPreferences = {
  theme: 'os',
  accent: 'blue',
  size: 18,
  spacing: 1.75,
  measure: 660,
  motion: 'smooth',
  haptics: 'system',
  richHaptics: 'clear',
};
export function normalizeReading(value: unknown): ReadingPreferences {
  const v = value as Partial<ReadingPreferences> | undefined;
  const number = (n: unknown, min: number, max: number, fallback: number) =>
    typeof n === 'number' && Number.isFinite(n)
      ? Math.max(min, Math.min(max, n))
      : fallback;
  return {
    theme: ['os', 'light', 'dark', 'oled'].includes(v?.theme ?? '')
      ? v!.theme!
      : 'os',
    accent: ['blue', 'violet', 'mint', 'amber'].includes(v?.accent ?? '')
      ? v!.accent!
      : 'blue',
    size: number(v?.size, 14, 28, 18),
    spacing: number(v?.spacing, 1.4, 2.2, 1.75),
    measure: Math.round(number(v?.measure, 320, 800, 660)),
    motion: v?.motion === 'snappy' ? 'snappy' : 'smooth',
    haptics: v?.haptics === 'off' ? 'off' : 'system',
    richHaptics:
      v?.richHaptics === 'platform' || v?.richHaptics === 'expressive'
        ? v.richHaptics
        : 'clear',
  };
}
export function externalAddress(value: unknown): string | undefined {
  if (
    typeof value !== 'string' ||
    value.length > 2048 ||
    /[\s\u0000-\u001f]/.test(value)
  )
    return;
  try {
    const url = new URL(value);
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      !url.hostname ||
      url.username ||
      url.password
    )
      return;
    return url.href;
  } catch {
    return;
  }
}
// Media placements are not a new resource kind. Bound gallery work independently of document length.
export function noteImages(doc: any): string[] {
  const result: string[] = [],
    stack = [doc];
  let budget = 20000;
  while (stack.length && budget-- > 0 && result.length < 128) {
    const n = stack.pop();
    if (!n || typeof n !== 'object') continue;
    if (
      n.type === 'image' &&
      /^[a-f0-9-]{36}$/i.test(n.attrs?.resourceId ?? '') &&
      !result.includes(n.attrs.resourceId)
    )
      result.push(n.attrs.resourceId);
    if (Array.isArray(n.content))
      for (let i = n.content.length - 1; i >= 0; i--) stack.push(n.content[i]);
  }
  return result;
}
export type MediaPosition = {
  page: number;
  zoom: number;
  x: number;
  y: number;
};
export function mediaPosition(v: Partial<MediaPosition> = {}): MediaPosition {
  const bounded = (
    n: number | undefined,
    min: number,
    max: number,
    fallback = min,
  ) => (Number.isFinite(n) ? Math.max(min, Math.min(max, n!)) : fallback);
  return {
    page: Math.floor(bounded(v.page, 0, 100000)),
    zoom: bounded(v.zoom, 1, 4),
    x: bounded(v.x, 0, 10000000),
    y: bounded(v.y, 0, 10000000),
  };
}
