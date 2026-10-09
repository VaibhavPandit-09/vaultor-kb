import { useMemo } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';

// Shared mobile surfaces. Explicit device preference controls arrive in A8;
// until then follow OS appearance, with true-black dark content canvases.
export const colors = {
  dark: {
    canvas: '#000',
    surface: '#0a0a0a',
    control: '#141414',
    pressed: '#1e1e1e',
    text: '#e8e8e8',
    secondary: '#b3b3b3',
    muted: '#858585',
    border: '#333',
    divider: '#252525',
    accent: '#8db7ff',
    selected: '#101824',
    error: '#ffb4b4',
  },
  light: {
    canvas: '#fafafa',
    surface: '#fff',
    control: '#f0f0f0',
    pressed: '#e5e5e5',
    text: '#202020',
    secondary: '#515151',
    muted: '#656565',
    border: '#ccc',
    divider: '#dedede',
    accent: '#245bb5',
    selected: '#e8effb',
    error: '#a52d2d',
  },
};
export function usePalette() {
  return colors[useColorScheme() === 'light' ? 'light' : 'dark'];
}
export function useThemeStyles<T extends Record<string, any>>(styles: T): T {
  const p = usePalette();
  return useMemo(() => {
    const aliases: Record<string, string> = {
      '#000': p.canvas,
      '#0a0a0a': p.surface,
      '#141414': p.control,
      '#1e1e1e': p.pressed,
      '#e8e8e8': p.text,
      '#b3b3b3': p.secondary,
      '#858585': p.muted,
      '#333': p.border,
      '#555': p.muted,
      '#252525': p.divider,
      '#202020': p.divider,
      '#8db7ff': p.accent,
      '#90b8ff': p.accent,
      '#141c2a': p.selected,
      '#101824': p.selected,
      '#ffb4b4': p.error,
      '#ff9090': p.error,
    };
    return Object.fromEntries(
      Object.entries(styles).map(([key, value]) => [
        key,
        Object.fromEntries(
          Object.entries(StyleSheet.flatten(value)).map(([k, v]) => [
            k,
            typeof v === 'string' ? aliases[v] ?? v : v,
          ]),
        ),
      ]),
    ) as T;
  }, [styles, p]);
}
