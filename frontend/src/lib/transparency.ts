const MIN_TRANSPARENCY = 0.6;
const MAX_TRANSPARENCY = 1;

export function clampTransparency(value: number) {
  if (Number.isNaN(value)) {
    return MAX_TRANSPARENCY;
  }

  return Math.min(MAX_TRANSPARENCY, Math.max(MIN_TRANSPARENCY, value));
}

export function getGlassPanelStyle(value: number, blurMultiplier = 18) {
  const transparency = clampTransparency(value);
  const blur = Math.round(Math.max(8, transparency * blurMultiplier));

  return {
    background: `rgba(var(--card-rgb), ${transparency})`,
    backdropFilter: `blur(${blur}px)`,
    WebkitBackdropFilter: `blur(${blur}px)`,
  };
}

export function getOverlayStyle(value: number, baseAlpha = 0.42) {
  const transparency = clampTransparency(value);
  const overlayAlpha = Math.min(0.7, Math.max(0.22, baseAlpha + ((1 - transparency) * 0.28)));
  const blur = Math.round(4 + ((1 - transparency) * 10));

  return {
    background: `rgba(var(--overlay-rgb), ${overlayAlpha})`,
    backdropFilter: `blur(${blur}px)`,
    WebkitBackdropFilter: `blur(${blur}px)`,
  };
}
