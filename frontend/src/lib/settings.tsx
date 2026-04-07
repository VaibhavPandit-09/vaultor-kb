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
  DEFAULT_KEYBINDINGS,
  getCurrentShortcutPlatform,
  getDefaultShortcut,
  getShortcutPlatformLabel,
  normalizeShortcut,
  resolveShortcutBindings,
  type PlatformShortcutBindingMap,
  type ShortcutAction,
  type ShortcutBindingMap,
  type ShortcutPlatform,
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
  uiTransparency: number;
  sidebarCollapsed: boolean;
};

export type SettingsDocument = {
  workspace: WorkspaceSettings;
  local: Record<string, Partial<LocalSettings>>;
  keybindings: Partial<Record<ShortcutAction, Partial<Record<ShortcutPlatform, string>>>>;
};

type SettingsState = {
  workspace: WorkspaceSettings;
  local: LocalSettings;
};

type SettingsContextValue = {
  settings: SettingsState;
  workspaceLoaded: boolean;
  deviceId: string;
  shortcutPlatform: ShortcutPlatform;
  shortcutPlatformLabel: string;
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

const DEVICE_ID_STORAGE_KEY = 'vaultor_device_id';
const LEGACY_LOCAL_SETTINGS_STORAGE_KEY = 'vaultor_local_settings';
const LEGACY_SIDEBAR_STORAGE_KEY = 'vaultor_sidebar_collapsed';

const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = {
  maxOpenNotes: 2,
  openBehavior: 'split',
  autosaveDelay: 0,
  focusMode: false,
};

const DEFAULT_LOCAL_SETTINGS: LocalSettings = {
  theme: 'dark',
  accentColor: 'blue',
  density: 'comfortable',
  animationMode: 'snappy',
  previewMode: 'side',
  sidebarMode: 'fixed',
  uiTransparency: 0.85,
  sidebarCollapsed: false,
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
  const shortcutPlatform = getCurrentShortcutPlatform();
  const shortcutPlatformLabel = getShortcutPlatformLabel(shortcutPlatform);
  const [deviceId] = useState(() => getOrCreateDeviceId());
  const [settingsDocument, setSettingsDocument] = useState<SettingsDocument>(createDefaultSettingsDocument());
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);
  const requestVersionRef = useRef(0);
  const documentRef = useRef(settingsDocument);

  const currentLocalSettings = useMemo(
    () => normalizeLocalSettings(settingsDocument.local[deviceId]),
    [deviceId, settingsDocument.local],
  );

  const resolvedShortcuts = useMemo(
    () => resolveShortcutBindings(settingsDocument.keybindings, shortcutPlatform),
    [settingsDocument.keybindings, shortcutPlatform],
  );

  useEffect(() => {
    documentRef.current = settingsDocument;
  }, [settingsDocument]);

  useEffect(() => {
    const root = window.document.documentElement;
    root.dataset.theme = currentLocalSettings.theme;
    root.dataset.density = currentLocalSettings.density;
    root.dataset.animation = currentLocalSettings.animationMode;
    root.classList.toggle('dark', currentLocalSettings.theme === 'dark');
    root.classList.toggle('light', currentLocalSettings.theme === 'light');
    root.style.setProperty('--accent', accentMap[currentLocalSettings.accentColor]);
    root.style.setProperty('--primary', accentMap[currentLocalSettings.accentColor]);
  }, [
    currentLocalSettings.accentColor,
    currentLocalSettings.animationMode,
    currentLocalSettings.density,
    currentLocalSettings.theme,
  ]);

  const persistSettingsDocument = useCallback(async (nextDocument: SettingsDocument, fallbackDocument: SettingsDocument) => {
    const requestVersion = ++requestVersionRef.current;

    try {
      const { data } = await api.put('/settings', nextDocument);
      if (requestVersion !== requestVersionRef.current) {
        return;
      }

      const normalized = normalizeSettingsDocument(data);
      documentRef.current = normalized;
      setSettingsDocument(normalized);
    } catch (error) {
      console.error('Failed to persist settings', error);
      if (requestVersion !== requestVersionRef.current) {
        return;
      }

      documentRef.current = fallbackDocument;
      setSettingsDocument(fallbackDocument);
    }
  }, []);

  useEffect(() => {
    let active = true;

    const loadSettings = async () => {
      try {
        const legacyLocalSettings = loadLegacyLocalSettings();
        const legacySidebarCollapsed = loadLegacySidebarCollapsed();
        const { data } = await api.get('/settings');

        if (!active) {
          return;
        }

        const remoteDocument = normalizeSettingsDocument(data);
        const migratedDocument = applyLegacySettingsMigration(remoteDocument, {
          deviceId,
          platform: shortcutPlatform,
          legacyLocalSettings,
          legacySidebarCollapsed,
        });

        documentRef.current = migratedDocument.document;
        setSettingsDocument(migratedDocument.document);

        if (migratedDocument.changed) {
          void persistSettingsDocument(migratedDocument.document, remoteDocument);
          clearLegacySettingsStorage();
        }
      } catch (error) {
        console.error('Failed to load settings', error);
      } finally {
        if (active) {
          setWorkspaceLoaded(true);
        }
      }
    };

    void loadSettings();

    return () => {
      active = false;
    };
  }, [deviceId, persistSettingsDocument, shortcutPlatform]);

  const updateDocument = useCallback((updater: (current: SettingsDocument) => SettingsDocument) => {
    const previous = documentRef.current;
    const next = normalizeSettingsDocument(updater(previous));
    documentRef.current = next;
    setSettingsDocument(next);
    void persistSettingsDocument(next, previous);
  }, [persistSettingsDocument]);

  const updateWorkspaceSetting = useCallback(<K extends keyof WorkspaceSettings>(key: K, value: WorkspaceSettings[K]) => {
    updateDocument((current) => ({
      ...current,
      workspace: normalizeWorkspaceSettings({
        ...current.workspace,
        [key]: value,
      }),
    }));
  }, [updateDocument]);

  const updateLocalSetting = useCallback(<K extends keyof LocalSettings>(key: K, value: LocalSettings[K]) => {
    updateDocument((current) => ({
      ...current,
      local: {
        ...current.local,
        [deviceId]: normalizeLocalSettings({
          ...current.local[deviceId],
          [key]: value,
        }),
      },
    }));
  }, [deviceId, updateDocument]);

  const validateShortcut = useCallback((action: ShortcutAction, shortcut: string) => {
    const nextBindings = {
      ...resolvedShortcuts,
      [action]: normalizeShortcut(shortcut),
    };
    return validateShortcutBinding(action, shortcut, nextBindings);
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

    updateDocument((current) => ({
      ...current,
      keybindings: {
        ...current.keybindings,
        [action]: {
          ...DEFAULT_KEYBINDINGS[action],
          ...current.keybindings[action],
          [shortcutPlatform]: normalized,
        },
      },
    }));
    return null;
  }, [resolvedShortcuts, shortcutPlatform, updateDocument]);

  const resetShortcut = useCallback((action: ShortcutAction) => {
    updateDocument((current) => ({
      ...current,
      keybindings: {
        ...current.keybindings,
        [action]: {
          ...DEFAULT_KEYBINDINGS[action],
          ...current.keybindings[action],
          [shortcutPlatform]: getDefaultShortcut(action, shortcutPlatform),
        },
      },
    }));
  }, [shortcutPlatform, updateDocument]);

  const resetWorkspaceSettings = useCallback(() => {
    updateDocument((current) => ({
      ...current,
      workspace: DEFAULT_WORKSPACE_SETTINGS,
    }));
  }, [updateDocument]);

  const resetLocalSettings = useCallback(() => {
    updateDocument((current) => ({
      ...current,
      local: {
        ...current.local,
        [deviceId]: DEFAULT_LOCAL_SETTINGS,
      },
    }));
  }, [deviceId, updateDocument]);

  const resetAllSettings = useCallback(() => {
    updateDocument((current) => ({
      workspace: DEFAULT_WORKSPACE_SETTINGS,
      local: {
        ...current.local,
        [deviceId]: DEFAULT_LOCAL_SETTINGS,
      },
      keybindings: DEFAULT_KEYBINDINGS,
    }));
  }, [deviceId, updateDocument]);

  const toggleTheme = useCallback(() => {
    updateLocalSetting('theme', currentLocalSettings.theme === 'dark' ? 'light' : 'dark');
  }, [currentLocalSettings.theme, updateLocalSetting]);

  const value = useMemo<SettingsContextValue>(() => ({
    settings: {
      workspace: settingsDocument.workspace,
      local: currentLocalSettings,
    },
    workspaceLoaded,
    deviceId,
    shortcutPlatform,
    shortcutPlatformLabel,
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
    currentLocalSettings,
    deviceId,
    resetAllSettings,
    resetLocalSettings,
    resetShortcut,
    resetWorkspaceSettings,
    resolvedShortcuts,
    setCustomShortcut,
    settingsDocument.workspace,
    shortcutPlatform,
    shortcutPlatformLabel,
    toggleTheme,
    updateLocalSetting,
    updateWorkspaceSetting,
    validateShortcut,
    workspaceLoaded,
  ]);

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within SettingsProvider');
  }
  return context;
}

function createDefaultSettingsDocument(): SettingsDocument {
  return {
    workspace: DEFAULT_WORKSPACE_SETTINGS,
    local: {},
    keybindings: {},
  };
}

function normalizeSettingsDocument(input: Partial<SettingsDocument> | null | undefined): SettingsDocument {
  return {
    workspace: normalizeWorkspaceSettings(input?.workspace),
    local: Object.entries(input?.local ?? {}).reduce<Record<string, Partial<LocalSettings>>>((accumulator, [deviceId, settings]) => {
      if (deviceId.trim()) {
        accumulator[deviceId] = normalizeLocalSettings(settings);
      }
      return accumulator;
    }, {}),
    keybindings: normalizeKeybindings(input?.keybindings),
  };
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
    uiTransparency: normalizeTransparency(
      typeof input?.uiTransparency === 'number'
        ? input.uiTransparency
        : (input as { commandPaletteTransparency?: number } | null | undefined)?.commandPaletteTransparency,
    ),
    sidebarCollapsed: Boolean(input?.sidebarCollapsed),
  };
}

function normalizeKeybindings(
  input: Partial<Record<string, Partial<Record<ShortcutPlatform, string>>>> | null | undefined,
): SettingsDocument['keybindings'] {
  if (!input || typeof input !== 'object') {
    return {};
  }

  return Object.entries(input).reduce<SettingsDocument['keybindings']>((accumulator, [action, binding]) => {
    if (!isShortcutAction(action) || !binding || typeof binding !== 'object') {
      return accumulator;
    }

    const mac = binding.mac ? normalizeShortcut(binding.mac) : '';
    const windows = binding.windows ? normalizeShortcut(binding.windows) : '';

    accumulator[action] = {
      ...(mac ? { mac } : {}),
      ...(windows ? { windows } : {}),
    };
    return accumulator;
  }, {});
}

function normalizeTransparency(value: number | undefined) {
  const fallback = DEFAULT_LOCAL_SETTINGS.uiTransparency;
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }

  return Math.min(1, Math.max(0.6, value));
}

function loadLegacyLocalSettings(): (Partial<LocalSettings> & { customShortcuts?: Record<string, string>; commandPaletteTransparency?: number }) | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const rawSettings = window.localStorage.getItem(LEGACY_LOCAL_SETTINGS_STORAGE_KEY);
  if (!rawSettings) {
    return null;
  }

  try {
    return JSON.parse(rawSettings) as Partial<LocalSettings> & { customShortcuts?: Record<string, string>; commandPaletteTransparency?: number };
  } catch {
    return null;
  }
}

function loadLegacySidebarCollapsed() {
  if (typeof window === 'undefined') {
    return null;
  }

  const rawValue = window.localStorage.getItem(LEGACY_SIDEBAR_STORAGE_KEY);
  if (rawValue == null) {
    return null;
  }

  return rawValue === 'true';
}

function clearLegacySettingsStorage() {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(LEGACY_LOCAL_SETTINGS_STORAGE_KEY);
  window.localStorage.removeItem(LEGACY_SIDEBAR_STORAGE_KEY);
}

function getOrCreateDeviceId() {
  if (typeof window === 'undefined') {
    return 'server';
  }

  const existingId = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (existingId) {
    return existingId;
  }

  const nextId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `device-${Math.random().toString(36).slice(2, 10)}`;
  window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, nextId);
  return nextId;
}

function applyLegacySettingsMigration(
  document: SettingsDocument,
  options: {
    deviceId: string;
    platform: ShortcutPlatform;
    legacyLocalSettings: (Partial<LocalSettings> & { customShortcuts?: Record<string, string>; commandPaletteTransparency?: number }) | null;
    legacySidebarCollapsed: boolean | null;
  },
) {
  let changed = false;
  const nextDocument: SettingsDocument = {
    workspace: document.workspace,
    local: { ...document.local },
    keybindings: { ...document.keybindings },
  };

  if (!nextDocument.local[options.deviceId] && (options.legacyLocalSettings || options.legacySidebarCollapsed !== null)) {
    nextDocument.local[options.deviceId] = normalizeLocalSettings({
      ...options.legacyLocalSettings,
      ...(options.legacySidebarCollapsed !== null ? { sidebarCollapsed: options.legacySidebarCollapsed } : {}),
    });
    changed = true;
  }

  const legacyShortcuts = options.legacyLocalSettings?.customShortcuts;
  if (legacyShortcuts && typeof legacyShortcuts === 'object') {
    Object.entries(legacyShortcuts).forEach(([action, shortcut]) => {
      if (!isShortcutAction(action) || typeof shortcut !== 'string') {
        return;
      }

      const currentPlatformShortcut = nextDocument.keybindings[action]?.[options.platform];
      if (currentPlatformShortcut) {
        return;
      }

      const normalizedShortcut = normalizeShortcut(shortcut);
      if (!normalizedShortcut) {
        return;
      }

      nextDocument.keybindings[action] = {
        ...nextDocument.keybindings[action],
        [options.platform]: normalizedShortcut,
      };
      changed = true;
    });
  }

  return {
    changed,
    document: normalizeSettingsDocument(nextDocument),
  };
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

function isShortcutAction(value: string): value is ShortcutAction {
  return value === 'commandPalette'
    || value === 'switchNoteNext'
    || value === 'switchNotePrevious'
    || value === 'closeActiveNote'
    || value === 'toggleSidebar'
    || value === 'openShortcuts';
}

export type { PlatformShortcutBindingMap };
