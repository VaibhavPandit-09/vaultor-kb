import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import api from './api';
import {
  DEFAULT_SHORTCUTS,
  type ShortcutAction,
  type ShortcutBindingMap,
  normalizeShortcut,
  resolveShortcutBindings,
  validateShortcutBinding,
} from './shortcuts';

export type WorkspaceSettings = {
  maxOpenNotes: number;
  openBehavior: 'replace' | 'split';
  autosaveDelay: number;
  focusMode: boolean;
};

export type LocalSettings = {
  theme: 'dark' | 'light';
  accentColor: 'blue' | 'purple' | 'green' | 'orange' | 'red' | 'teal' | 'pink' | 'cyan';
  density: 'comfortable' | 'compact';
  animationMode: 'snappy' | 'smooth';
  previewMode: 'side' | 'modal';
  sidebarMode: 'fixed' | 'floating';
  commandPaletteTransparency: number;
  customShortcuts: Record<string, string>;
};

type SettingsState = {
  workspace: WorkspaceSettings;
  local: LocalSettings;
};

type SettingsContextValue = {
  settings: SettingsState;
  workspaceLoaded: boolean;
  resolvedShortcuts: ShortcutBindingMap;
  updateWorkspaceSetting: <K extends keyof WorkspaceSettings>(key: K, value: WorkspaceSettings[K]) => void;
  updateLocalSetting: <K extends keyof LocalSettings>(key: K, value: LocalSettings[K]) => void;
  setCustomShortcut: (action: ShortcutAction, shortcut: string) => string | null;
  resetShortcut: (action: ShortcutAction) => void;
  validateShortcut: (action: ShortcutAction, shortcut: string) => string | null;
  resetWorkspaceSettings: () => void;
  resetLocalSettings: () => void;
  resetAllSettings: () => void;
  toggleTheme: () => void;
};

const LOCAL_SETTINGS_STORAGE_KEY = 'vaultor_local_settings';

export const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = {
  maxOpenNotes: 2,
  openBehavior: 'split',
  autosaveDelay: 0,
  focusMode: false,
};

export const DEFAULT_LOCAL_SETTINGS: LocalSettings = {
  theme: 'dark',
  accentColor: 'blue',
  density: 'comfortable',
  animationMode: 'snappy',
  previewMode: 'side',
  sidebarMode: 'fixed',
  commandPaletteTransparency: 0.85,
  customShortcuts: {},
};

const accentMap: Record<LocalSettings['accentColor'], string> = {
  blue: '#3b82f6',
  purple: '#8b5cf6',
  green: '#22c55e',
  orange: '#f97316',
  red: '#ef4444',
  teal: '#14b8a6',
  pink: '#ec4899',
  cyan: '#06b6d4',
};

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [workspace, setWorkspace] = useState<WorkspaceSettings>(DEFAULT_WORKSPACE_SETTINGS);
  const [local, setLocal] = useState<LocalSettings>(() => loadLocalSettings());
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);
  const workspaceRef = useRef(workspace);
  const requestVersionRef = useRef(0);

  const resolvedShortcuts = useMemo(
    () => resolveShortcutBindings(local.customShortcuts),
    [local.customShortcuts],
  );

  useEffect(() => {
    workspaceRef.current = workspace;
  }, [workspace]);

  useEffect(() => {
    const root = window.document.documentElement;
    root.dataset.theme = local.theme;
    root.dataset.density = local.density;
    root.dataset.animation = local.animationMode;
    root.classList.toggle('dark', local.theme === 'dark');
    root.classList.toggle('light', local.theme === 'light');
    root.style.setProperty('--accent', accentMap[local.accentColor]);
    root.style.setProperty('--primary', accentMap[local.accentColor]);
  }, [local.accentColor, local.animationMode, local.density, local.theme]);

  useEffect(() => {
    window.localStorage.setItem(LOCAL_SETTINGS_STORAGE_KEY, JSON.stringify(local));
  }, [local]);

  useEffect(() => {
    let active = true;

    const loadWorkspaceSettings = async () => {
      try {
        const { data } = await api.get('/settings/workspace');
        if (!active) {
          return;
        }
        const normalized = normalizeWorkspaceSettings(data);
        workspaceRef.current = normalized;
        setWorkspace(normalized);
      } catch (error) {
        console.error('Failed to load workspace settings', error);
      } finally {
        if (active) {
          setWorkspaceLoaded(true);
        }
      }
    };

    void loadWorkspaceSettings();

    return () => {
      active = false;
    };
  }, []);

  const persistWorkspaceSettings = useCallback(async (nextSettings: WorkspaceSettings, fallbackSettings: WorkspaceSettings) => {
    const requestVersion = ++requestVersionRef.current;
    try {
      const { data } = await api.put('/settings/workspace', nextSettings);
      if (requestVersion !== requestVersionRef.current) {
        return;
      }
      const normalized = normalizeWorkspaceSettings(data);
      workspaceRef.current = normalized;
      setWorkspace(normalized);
    } catch (error) {
      console.error('Failed to persist workspace settings', error);
      if (requestVersion !== requestVersionRef.current) {
        return;
      }
      workspaceRef.current = fallbackSettings;
      setWorkspace(fallbackSettings);
    }
  }, []);

  const updateWorkspaceSetting = useCallback(<K extends keyof WorkspaceSettings>(key: K, value: WorkspaceSettings[K]) => {
    const previous = workspaceRef.current;
    const next = normalizeWorkspaceSettings({ ...previous, [key]: value });
    workspaceRef.current = next;
    setWorkspace(next);
    void persistWorkspaceSettings(next, previous);
  }, [persistWorkspaceSettings]);

  const updateLocalSetting = useCallback(<K extends keyof LocalSettings>(key: K, value: LocalSettings[K]) => {
    setLocal((current) => normalizeLocalSettings({ ...current, [key]: value }));
  }, []);

  const validateShortcut = useCallback((action: ShortcutAction, shortcut: string) => {
    return validateShortcutBinding(action, shortcut, resolvedShortcuts);
  }, [resolvedShortcuts]);

  const setCustomShortcut = useCallback((action: ShortcutAction, shortcut: string) => {
    const normalized = normalizeShortcut(shortcut);
    const nextBindings = {
      ...resolvedShortcuts,
      [action]: normalized,
    };
    const validationError = validateShortcutBinding(action, normalized, nextBindings);
    if (validationError) {
      return validationError;
    }

    setLocal((current) => normalizeLocalSettings({
      ...current,
      customShortcuts: {
        ...current.customShortcuts,
        [action]: normalized,
      },
    }));
    return null;
  }, [resolvedShortcuts]);

  const resetShortcut = useCallback((action: ShortcutAction) => {
    setLocal((current) => {
      const nextShortcuts = { ...current.customShortcuts };
      delete nextShortcuts[action];
      return normalizeLocalSettings({
        ...current,
        customShortcuts: nextShortcuts,
      });
    });
  }, []);

  const resetWorkspaceSettings = useCallback(() => {
    const previous = workspaceRef.current;
    workspaceRef.current = DEFAULT_WORKSPACE_SETTINGS;
    setWorkspace(DEFAULT_WORKSPACE_SETTINGS);
    const requestVersion = ++requestVersionRef.current;
    void api.delete('/settings/workspace')
      .then(({ data }) => {
        if (requestVersion !== requestVersionRef.current) {
          return;
        }
        const normalized = normalizeWorkspaceSettings(data);
        workspaceRef.current = normalized;
        setWorkspace(normalized);
      })
      .catch((error) => {
        console.error('Failed to reset workspace settings', error);
        if (requestVersion !== requestVersionRef.current) {
          return;
        }
        workspaceRef.current = previous;
        setWorkspace(previous);
      });
  }, []);

  const resetLocalSettings = useCallback(() => {
    setLocal(DEFAULT_LOCAL_SETTINGS);
  }, []);

  const resetAllSettings = useCallback(() => {
    resetLocalSettings();
    resetWorkspaceSettings();
  }, [resetLocalSettings, resetWorkspaceSettings]);

  const toggleTheme = useCallback(() => {
    setLocal((current) => normalizeLocalSettings({
      ...current,
      theme: current.theme === 'dark' ? 'light' : 'dark',
    }));
  }, []);

  const value = useMemo<SettingsContextValue>(() => ({
    settings: {
      workspace,
      local,
    },
    workspaceLoaded,
    resolvedShortcuts,
    updateWorkspaceSetting,
    updateLocalSetting,
    setCustomShortcut,
    resetShortcut,
    validateShortcut,
    resetWorkspaceSettings,
    resetLocalSettings,
    resetAllSettings,
    toggleTheme,
  }), [
    local,
    resolvedShortcuts,
    resetAllSettings,
    resetLocalSettings,
    resetShortcut,
    resetWorkspaceSettings,
    setCustomShortcut,
    toggleTheme,
    updateLocalSetting,
    updateWorkspaceSetting,
    validateShortcut,
    workspace,
    workspaceLoaded,
  ]);

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within SettingsProvider');
  }
  return context;
}

function normalizeWorkspaceSettings(input: Partial<WorkspaceSettings> | null | undefined): WorkspaceSettings {
  return {
    maxOpenNotes: Math.max(1, Math.min(3, Number(input?.maxOpenNotes ?? DEFAULT_WORKSPACE_SETTINGS.maxOpenNotes))),
    openBehavior: input?.openBehavior === 'replace' ? 'replace' : 'split',
    autosaveDelay: Math.max(0, Number(input?.autosaveDelay ?? DEFAULT_WORKSPACE_SETTINGS.autosaveDelay)),
    focusMode: Boolean(input?.focusMode),
  };
}

function normalizeLocalSettings(input: Partial<LocalSettings> | null | undefined): LocalSettings {
  return {
    theme: input?.theme === 'light' ? 'light' : 'dark',
    accentColor: isAccentColor(input?.accentColor) ? input.accentColor : DEFAULT_LOCAL_SETTINGS.accentColor,
    density: input?.density === 'compact' ? 'compact' : 'comfortable',
    animationMode: input?.animationMode === 'smooth' ? 'smooth' : 'snappy',
    previewMode: input?.previewMode === 'modal' ? 'modal' : 'side',
    sidebarMode: input?.sidebarMode === 'floating' ? 'floating' : 'fixed',
    commandPaletteTransparency: normalizeTransparency(input?.commandPaletteTransparency),
    customShortcuts: normalizeCustomShortcuts(input?.customShortcuts),
  };
}

function normalizeTransparency(value: number | undefined) {
  const fallback = DEFAULT_LOCAL_SETTINGS.commandPaletteTransparency;
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }

  return Math.min(1, Math.max(0.6, value));
}

function normalizeCustomShortcuts(input: Record<string, string> | null | undefined) {
  if (!input || typeof input !== 'object') {
    return {};
  }

  return Object.entries(input).reduce<Record<string, string>>((accumulator, [key, value]) => {
    const normalized = normalizeShortcut(value);
    if (normalized) {
      accumulator[key] = normalized;
    }
    return accumulator;
  }, {});
}

function loadLocalSettings(): LocalSettings {
  if (typeof window === 'undefined') {
    return DEFAULT_LOCAL_SETTINGS;
  }

  const rawSettings = window.localStorage.getItem(LOCAL_SETTINGS_STORAGE_KEY);
  if (!rawSettings) {
    return DEFAULT_LOCAL_SETTINGS;
  }

  try {
    return normalizeLocalSettings(JSON.parse(rawSettings));
  } catch {
    return DEFAULT_LOCAL_SETTINGS;
  }
}

function isAccentColor(value: string | undefined): value is LocalSettings['accentColor'] {
  return value === 'blue'
    || value === 'purple'
    || value === 'green'
    || value === 'orange'
    || value === 'red'
    || value === 'teal'
    || value === 'pink'
    || value === 'cyan';
}

export { accentMap };
export { DEFAULT_SHORTCUTS };
