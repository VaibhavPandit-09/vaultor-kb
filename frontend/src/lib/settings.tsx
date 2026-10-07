import { normalizeSidebarSections, type SidebarSections } from './sidebarPreferences';
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
import { settingsDiff, combineSettingsPatches, type SettingsPatch } from './settingsPatch';
import {
  DEFAULT_KEYBINDINGS,
  getCurrentShortcutPlatform,
  getDefaultShortcut,
  getShortcutPlatformLabel,
  normalizeShortcut,
  migrateNoteShortcut,
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
  theme: 'os' | 'dark' | 'light';
  accentColor: 'blue' | 'purple' | 'green' | 'orange' | 'red' | 'teal' | 'pink' | 'cyan';
  density: 'comfortable' | 'compact';
  animationMode: 'snappy' | 'smooth';
  previewMode: 'side' | 'modal';
  sidebarMode: 'fixed' | 'floating';
  uiTransparency: number;
  sidebarCollapsed: boolean;
  sidebarSections: SidebarSections;
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
  resolvedTheme: 'dark' | 'light';
  settings: SettingsState;
  workspaceLoaded: boolean;
  saveStatus: 'saved' | 'saving' | 'failed';
  retrySave: () => void;
  flushSettings: () => Promise<void>;
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
  theme: 'os',
  accentColor: 'blue',
  density: 'comfortable',
  animationMode: 'snappy',
  previewMode: 'side',
  sidebarMode: 'fixed',
  uiTransparency: 0.85,
  sidebarCollapsed: false,
  sidebarSections: normalizeSidebarSections(undefined),
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
  const [osDark, setOsDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true);
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!media) return;
    const change = () => setOsDark(media.matches);
    change(); media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  const shortcutPlatform = getCurrentShortcutPlatform();
  const shortcutPlatformLabel = getShortcutPlatformLabel(shortcutPlatform);
  const [deviceId] = useState(() => getOrCreateDeviceId());
  const [settingsDocument, setSettingsDocument] = useState<SettingsDocument>(createDefaultSettingsDocument());
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'failed'>('saved');
  const requestVersionRef = useRef(0);
  const loadSequenceRef = useRef(0);
  const writeQueue = useRef<Promise<unknown>>(Promise.resolve());
  const documentRef = useRef(settingsDocument);
  const desiredRef = useRef(settingsDocument);
  const failedPatch = useRef<SettingsPatch>({});
  const pendingWrites = useRef(0);
  const deferredRefresh = useRef(false);

  const currentLocalSettings = useMemo(
    () => normalizeLocalSettings(settingsDocument.local[deviceId]),
    [deviceId, settingsDocument.local],
  );

  const resolvedShortcuts = useMemo(
    () => resolveShortcutBindings(settingsDocument.keybindings, shortcutPlatform),
    [settingsDocument.keybindings, shortcutPlatform],
  );
  const resolvedTheme = currentLocalSettings.theme === 'os' ? (osDark ? 'dark' : 'light') : currentLocalSettings.theme;

  useEffect(() => {
    documentRef.current = settingsDocument;
  }, [settingsDocument]);

  useEffect(() => {
    const root = window.document.documentElement;
    root.dataset.theme = resolvedTheme;
    root.style.colorScheme = resolvedTheme;
    root.dataset.density = currentLocalSettings.density;
    root.dataset.animation = currentLocalSettings.animationMode;
    root.classList.toggle('dark', resolvedTheme === 'dark');
    root.classList.toggle('light', resolvedTheme === 'light');
    root.style.setProperty('--accent', accentMap[currentLocalSettings.accentColor]);
    root.style.setProperty('--primary', accentMap[currentLocalSettings.accentColor]);
  }, [
    currentLocalSettings.accentColor,
    currentLocalSettings.animationMode,
    currentLocalSettings.density,
    resolvedTheme,
  ]);

  const persistSettingsDocument = useCallback(async (nextDocument: SettingsDocument) => {
    const patch = settingsDiff(desiredRef.current, nextDocument);
    desiredRef.current = nextDocument;
    const requestVersion = ++requestVersionRef.current;
    pendingWrites.current++;
    setSaveStatus('saving');

    try {
      const request = writeQueue.current.catch(() => {}).then(async () => {
        // Failed leaves remain pending; a later edit/retry sends them alongside new leaves.
        const outgoing = combineSettingsPatches(failedPatch.current, patch);
        try { const result = await api.patch('/settings', outgoing); failedPatch.current = {}; return result; }
        catch (error) { failedPatch.current = outgoing; throw error; }
      });
      writeQueue.current = request;
      const { data } = await request;
      if (requestVersion !== requestVersionRef.current) {
        return;
      }

      const normalized = normalizeSettingsDocument(data);
      documentRef.current = normalized;
      desiredRef.current = normalized;
      setSettingsDocument(normalized);
      setSaveStatus('saved');
    } catch (error) {
      console.error('Failed to persist settings', error);
      if (requestVersion !== requestVersionRef.current) {
        return;
      }

      setSaveStatus('failed');
    } finally {
      pendingWrites.current--;
      if(!pendingWrites.current && deferredRefresh.current && !Object.keys(failedPatch.current).length){deferredRefresh.current=false;window.dispatchEvent(new Event('vaultor:settings-refresh'));}
    }
  }, []);

  useEffect(() => {
    let active = true;

    const loadSettings = async () => {
      const sequence = ++loadSequenceRef.current;
      const loadVersion = requestVersionRef.current;
      try {
        const legacyLocalSettings = loadLegacyLocalSettings();
        const legacySidebarCollapsed = loadLegacySidebarCollapsed();
        const { data } = await api.get('/settings');

        if (!active || sequence !== loadSequenceRef.current) return;
        if (loadVersion !== requestVersionRef.current || pendingWrites.current) {
          deferredRefresh.current=true;
          if (!pendingWrites.current && !Object.keys(failedPatch.current).length) {
            deferredRefresh.current=false;
            window.dispatchEvent(new Event('vaultor:settings-refresh'));
          }
          return;
        }

        if (requestVersionRef.current && Object.keys(failedPatch.current).length) return;
        const remoteDocument = normalizeSettingsDocument(data);
        const migratedDocument = applyLegacySettingsMigration(remoteDocument, {
          deviceId,
          platform: shortcutPlatform,
          legacyLocalSettings,
          legacySidebarCollapsed,
        });

        documentRef.current = migratedDocument.document;
        desiredRef.current = remoteDocument;
        setSettingsDocument(migratedDocument.document);

        if (migratedDocument.changed) {
          void persistSettingsDocument(migratedDocument.document);
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
    window.addEventListener('vaultor:settings-refresh', loadSettings);

    return () => {
      active = false;
      window.removeEventListener('vaultor:settings-refresh', loadSettings);
    };
  }, [deviceId, persistSettingsDocument, shortcutPlatform]);

  const updateDocument = useCallback((updater: (current: SettingsDocument) => SettingsDocument) => {
    const previous = documentRef.current;
    const next = normalizeSettingsDocument(updater(previous));
    documentRef.current = next;
    setSettingsDocument(next);
    void persistSettingsDocument(next);
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
    updateLocalSetting('theme', currentLocalSettings.theme === 'os' ? 'light' : currentLocalSettings.theme === 'light' ? 'dark' : 'os');
  }, [currentLocalSettings.theme, updateLocalSetting]);

  const retrySave = useCallback(() => { void persistSettingsDocument(documentRef.current); }, [persistSettingsDocument]);
  const flushSettings = useCallback(async () => { await writeQueue.current.catch(() => {}); if(Object.keys(failedPatch.current).length) await persistSettingsDocument(documentRef.current); await writeQueue.current; }, [persistSettingsDocument]);
  const value = useMemo<SettingsContextValue>(() => ({
    resolvedTheme,
    settings: {
      workspace: settingsDocument.workspace,
      local: currentLocalSettings,
    },
    workspaceLoaded,
    saveStatus, retrySave, flushSettings,
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
    resolvedTheme,
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
    workspaceLoaded, saveStatus, retrySave, flushSettings,
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
// Native update/recovery dialogs can open before any workspace provider exists.
// eslint-disable-next-line react-refresh/only-export-components -- Companion context hook, like useSettings above.
export function useOptionalSettings() { return useContext(SettingsContext); }

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
    theme: input?.theme === 'light' || input?.theme === 'dark' ? input.theme : 'os',
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
    sidebarSections: normalizeSidebarSections(input?.sidebarSections),
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

    const mac = binding.mac ? migrateNoteShortcut(action, binding.mac) : '';
    const windows = binding.windows ? migrateNoteShortcut(action, binding.windows) : '';

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
