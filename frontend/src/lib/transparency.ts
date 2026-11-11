const MIN_TRANSPARENCY = 0.6;
const MAX_TRANSPARENCY = 1;

export function clampTransparency(value: number) {
  if (Number.isNaN(value)) {
    return MAX_TRANSPARENCY;
  }

  return Math.min(MAX_TRANSPARENCY, Math.max(MIN_TRANSPARENCY, value));
}

export function getGlassPanelStyle(value: number, blurMultiplier = 18, surface: 'panel' | 'canvas' = 'panel') {
  const transparency = clampTransparency(value);
  const blur = `max(8px, calc(var(--ui-opacity, ${transparency}) * ${blurMultiplier}px))`;

  return {
    background: `rgba(var(${surface === 'canvas' ? '--card-rgb' : '--panel-rgb, var(--card-rgb)'}), var(--glass-opacity, var(--ui-opacity, ${transparency})))`,
    backdropFilter: `blur(var(--glass-blur, ${blur}))`,
    WebkitBackdropFilter: `blur(var(--glass-blur, ${blur}))`,
  };
}

export function getOverlayStyle(value: number, baseAlpha = 0.42) {
  const transparency = clampTransparency(value);
  const blur = `calc(4px + (1 - var(--ui-opacity, ${transparency})) * 10px)`;

  return {
    background: `rgba(var(--overlay-rgb), clamp(.22, calc(${baseAlpha} + (1 - var(--ui-opacity, ${transparency})) * .28), .7))`,
    backdropFilter: `blur(var(--glass-blur, ${blur}))`,
    WebkitBackdropFilter: `blur(var(--glass-blur, ${blur}))`,
  };
}
