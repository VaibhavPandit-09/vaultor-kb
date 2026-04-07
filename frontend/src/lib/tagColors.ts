type Rgb = { r: number; g: number; b: number };
type Hsl = { h: number; s: number; l: number };

export function generateTagColor(tagName: string) {
  const normalized = tagName.trim().toLowerCase();
  let hash = 0;

  for (let index = 0; index < normalized.length; index += 1) {
    hash = normalized.charCodeAt(index) + ((hash << 5) - hash);
  }

  const positiveHash = Math.abs(hash === Number.MIN_SAFE_INTEGER ? 0 : hash);
  const hue = positiveHash % 360;
  const saturation = clamp(55 + ((positiveHash >> 3) % 16), 55, 70);
  const lightness = clamp(45 + ((positiveHash >> 5) % 16), 45, 60);

  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

export function getTagPillStyle(color: string, theme: 'dark' | 'light') {
  const baseRgb = parseColorToRgb(color) ?? parseColorToRgb(generateTagColor(color)) ?? { r: 59, g: 130, b: 246 };
  const vividRgb = applyVibrance(baseRgb, theme === 'dark' ? 1.18 : 1.12);
  const vividHsl = rgbToHsl(vividRgb);
  const shiftedHue = (vividHsl.h + (theme === 'dark' ? 22 : 18)) % 360;
  const gradientStart = hslToRgb(
    vividHsl.h,
    clamp(Math.max(vividHsl.s, 0.7) * 1.02, 0.7, 0.8),
    clamp(vividHsl.l + (theme === 'dark' ? 0.14 : 0.04), 0, 1),
  );
  const gradientEnd = hslToRgb(
    shiftedHue,
    clamp(Math.max(vividHsl.s, 0.72), 0.72, 0.82),
    clamp(vividHsl.l - (theme === 'dark' ? 0.01 : 0.08), 0, 1),
  );
  const text = getReadableTextColor(theme === 'dark' ? gradientStart : gradientEnd);
  const borderAlpha = theme === 'dark' ? 0.26 : 0.18;
  const shadowAlpha = theme === 'dark' ? 0.12 : 0.08;

  return {
    backgroundImage: `linear-gradient(135deg, rgba(${gradientStart.r}, ${gradientStart.g}, ${gradientStart.b}, ${theme === 'dark' ? 0.34 : 0.28}) 0%, rgba(${gradientEnd.r}, ${gradientEnd.g}, ${gradientEnd.b}, ${theme === 'dark' ? 0.22 : 0.24}) 100%)`,
    backgroundColor: `rgba(${vividRgb.r}, ${vividRgb.g}, ${vividRgb.b}, ${theme === 'dark' ? 0.18 : 0.18})`,
    borderColor: `rgba(${vividRgb.r}, ${vividRgb.g}, ${vividRgb.b}, ${borderAlpha})`,
    color: `rgb(${text.r}, ${text.g}, ${text.b})`,
    boxShadow: `inset 0 1px 0 rgba(255,255,255,${theme === 'dark' ? 0.08 : 0.35}), 0 0 0 1px rgba(${vividRgb.r}, ${vividRgb.g}, ${vividRgb.b}, ${borderAlpha * 0.7}), 0 6px 14px rgba(15,23,42,${shadowAlpha})`,
  };
}

export function getTagColorInputValue(color: string) {
  return rgbToHex(parseColorToRgb(color) ?? { r: 59, g: 130, b: 246 });
}

function parseColorToRgb(color: string): Rgb | null {
  const normalized = color.trim();

  if (normalized.startsWith('#')) {
    return parseHexColor(normalized);
  }

  if (normalized.toLowerCase().startsWith('hsl(')) {
    return parseHslColor(normalized);
  }

  return null;
}

function parseHexColor(color: string): Rgb | null {
  if (color.length === 4) {
    const r = parseInt(color[1] + color[1], 16);
    const g = parseInt(color[2] + color[2], 16);
    const b = parseInt(color[3] + color[3], 16);
    return Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b) ? null : { r, g, b };
  }

  if (color.length === 7) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b) ? null : { r, g, b };
  }

  return null;
}

function parseHslColor(color: string): Rgb | null {
  const match = color.match(/hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*\)/i);
  if (!match) {
    return null;
  }

  const hue = Number(match[1]);
  const saturation = Number(match[2]) / 100;
  const lightness = Number(match[3]) / 100;

  if ([hue, saturation, lightness].some((value) => Number.isNaN(value))) {
    return null;
  }

  return hslToRgb(hue, saturation, lightness);
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const chroma = (1 - Math.abs((2 * l) - 1)) * s;
  const segment = h / 60;
  const second = chroma * (1 - Math.abs((segment % 2) - 1));
  const match = l - (chroma / 2);

  let r = 0;
  let g = 0;
  let b = 0;

  if (segment >= 0 && segment < 1) {
    r = chroma;
    g = second;
  } else if (segment < 2) {
    r = second;
    g = chroma;
  } else if (segment < 3) {
    g = chroma;
    b = second;
  } else if (segment < 4) {
    g = second;
    b = chroma;
  } else if (segment < 5) {
    r = second;
    b = chroma;
  } else {
    r = chroma;
    b = second;
  }

  return {
    r: Math.round((r + match) * 255),
    g: Math.round((g + match) * 255),
    b: Math.round((b + match) * 255),
  };
}

function rgbToHsl(rgb: Rgb): Hsl {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  const l = (max + min) / 2;

  if (delta !== 0) {
    if (max === r) {
      h = ((g - b) / delta) % 6;
    } else if (max === g) {
      h = ((b - r) / delta) + 2;
    } else {
      h = ((r - g) / delta) + 4;
    }
    h *= 60;
    if (h < 0) {
      h += 360;
    }
  }

  const s = delta === 0 ? 0 : delta / (1 - Math.abs((2 * l) - 1));
  return { h, s, l };
}

function applyVibrance(rgb: Rgb, amount: number) {
  const hsl = rgbToHsl(rgb);
  return hslToRgb(hsl.h, clamp(hsl.s * amount, 0, 1), hsl.l);
}

function getReadableTextColor(rgb: Rgb) {
  const luminance = getRelativeLuminance(rgb);
  return luminance > 0.53
    ? { r: 15, g: 23, b: 42 }
    : { r: 248, g: 250, b: 252 };
}

function getRelativeLuminance(rgb: Rgb) {
  const channels = [rgb.r, rgb.g, rgb.b].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
}

function rgbToHex(rgb: Rgb) {
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

function toHex(value: number) {
  return clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0');
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
