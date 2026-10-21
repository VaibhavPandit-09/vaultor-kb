import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AppState,
  NativeModules,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import { motionDuration, useReducedMotion } from './motion';
import { ThemeTransition } from './themeTransition';
import {
  defaultReading,
  normalizeReading,
  type ReadingPreferences,
} from './reading';

// Device-local reader appearance. Never stored in workspace exports.
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
const ReadingContext = createContext({
  preferences: defaultReading,
  update: (_: Partial<ReadingPreferences>) => {},
  error: '',
  retry: () => {},
  reduced: true,
  chooseTheme: (_: ReadingPreferences['theme'], _tag: number) =>
    Promise.resolve(),
});
export function ReadingProvider({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion();
  const transition = useRef(
    new ThemeTransition({
      prepareTheme: (tag, token) =>
        NativeModules.VaultorPresentation?.prepareTheme(tag, token) ??
        Promise.resolve(false),
      revealTheme: (token, duration) =>
        NativeModules.VaultorPresentation?.revealTheme(token, duration) ??
        Promise.resolve(),
      cancelTheme: () => NativeModules.VaultorPresentation?.cancelTheme(),
    }),
  ).current;
  const [preferences, setPreferences] = useState(defaultReading),
    [error, setError] = useState('');
  const current = useRef(preferences),
    edit = useRef(0);
  const persist = (value: ReadingPreferences) => {
    const ticket = ++edit.current;
    void NativeModules.VaultorNative.readerPreferences(
      'put',
      JSON.stringify(value),
    )
      .then(() => {
        if (edit.current === ticket) setError('');
      })
      .catch(() => {
        if (edit.current === ticket)
          setError('Reading preferences could not be saved. Retry.');
      });
  };
  useEffect(() => {
    const ticket = edit.current;
    void NativeModules.VaultorNative.readerPreferences('get', '{}')
      .then((raw: string) => {
        if (edit.current === ticket) {
          const value = normalizeReading(JSON.parse(raw));
          current.current = value;
          setPreferences(value);
        }
      })
      .catch(() => setError('Reading preferences unavailable. Retry saving.'));
  }, []);
  const apply = (patch: Partial<ReadingPreferences>) => {
    const value = normalizeReading({ ...current.current, ...patch });
    current.current = value;
    setPreferences(value);
    persist(value);
  };
  const update = (patch: Partial<ReadingPreferences>) => {
    transition.cancel();
    apply(patch);
  };
  const chooseTheme = (theme: ReadingPreferences['theme'], tag: number) => {
    if (theme === current.current.theme) {
      transition.cancel();
      return Promise.resolve();
    }
    return transition.change(
      tag,
      motionDuration('theme', current.current.motion, reduced),
      () => apply({ theme }),
    );
  };
  const os = useColorScheme();
  useEffect(() => {
    transition.cancel();
  }, [os, reduced, transition]);
  useEffect(() => {
    const event = AppState.addEventListener('change', value => {
      if (value !== 'active') transition.cancel();
    });
    return () => {
      event.remove();
      transition.cancel();
    };
  }, [transition]);
  return React.createElement(
    ReadingContext.Provider,
    {
      value: {
        preferences,
        update,
        error,
        retry: () => persist(current.current),
        reduced,
        chooseTheme,
      },
    },
    children,
  );
}
export const useReading = () => useContext(ReadingContext);
export function useAppearance() {
  const { preferences } = useReading(),
    os = useColorScheme();
  return preferences.theme === 'os'
    ? os === 'light'
      ? 'light'
      : 'dark'
    : preferences.theme;
}
export function usePalette() {
  const theme = useAppearance(),
    { preferences } = useReading(),
    light = theme === 'light';
  const accents = {
    blue: light ? '#245bb5' : '#8db7ff',
    violet: light ? '#7138bb' : '#c2a4ff',
    mint: light ? '#116951' : '#79dbba',
    amber: light ? '#875400' : '#efc47b',
  };
  const accent = accents[preferences.accent];
  return useMemo(
    () => ({
      ...colors[light ? 'light' : 'dark'],
      canvas:
        theme === 'dark'
          ? '#101114'
          : theme === 'oled'
          ? '#000'
          : colors[light ? 'light' : 'dark'].canvas,
      selected: theme === 'oled' ? '#141414' : light ? '#e8effb' : '#1a1b20',
      accent,
    }),
    [theme, light, accent],
  );
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
