import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Command, Laptop2, Layers3, RotateCcw, Search, Sparkles } from 'lucide-react';
import AppModal from './AppModal';
import {
  SHORTCUT_ACTIONS,
  formatShortcutKeys,
  shortcutFromKeyboardEvent,
  type ShortcutAction,
} from '../../lib/shortcuts';
import { useSettings, type LocalSettings } from '../../lib/settings';
import { useAnchoredPortalPosition } from '../../lib/useAnchoredPortalPosition';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

type SettingsView = 'workspace' | 'local' | 'keyboard';

type SearchableSetting = {
  label: string;
  description: string;
  control: ReactNode;
};

const accentOptions: Array<{ label: string; value: LocalSettings['accentColor'] }> = [
  { label: 'Blue', value: 'blue' },
  { label: 'Purple', value: 'purple' },
  { label: 'Green', value: 'green' },
  { label: 'Orange', value: 'orange' },
  { label: 'Red', value: 'red' },
  { label: 'Teal', value: 'teal' },
  { label: 'Pink', value: 'pink' },
  { label: 'Cyan', value: 'cyan' },
];

const views: Array<{
  id: SettingsView;
  label: string;
  description: string;
  icon: ReactNode;
}> = [
  {
    id: 'workspace',
    label: 'Workspace',
    description: 'Applies to this vault',
    icon: <Layers3 size={16} />,
  },
  {
    id: 'local',
    label: 'Local',
    description: 'Applies to this device',
    icon: <Laptop2 size={16} />,
  },
  {
    id: 'keyboard',
    label: 'Key bindings',
    description: 'Platform-specific shortcuts',
    icon: <Command size={16} />,
  },
];

const shortcutGroups: Array<{ title: string; description: string; actions: ShortcutAction[] }> = [
  {
    title: 'Workspace',
    description: 'Move between notes and control the workspace without leaving the keyboard.',
    actions: ['switchNoteNext', 'switchNotePrevious', 'closeActiveNote'],
  },
  {
    title: 'Navigation',
    description: 'Control navigation chrome and keep the sidebar close at hand.',
    actions: ['toggleSidebar'],
  },
  {
    title: 'System',
    description: 'Open Vaultor’s global action surfaces and help overlays.',
    actions: ['commandPalette', 'openShortcuts'],
  },
];

export default function SettingsModal({ open, onClose }: SettingsModalProps) {
  const {
    settings,
    resolvedShortcuts,
    shortcutPlatformLabel,
    updateWorkspaceSetting,
    updateLocalSetting,
    setCustomShortcut,
    resetShortcut,
    resetWorkspaceSettings,
    resetLocalSettings,
    resetAllSettings,
  } = useSettings();
  const [activeView, setActiveView] = useState<SettingsView>('workspace');
  const [searchValue, setSearchValue] = useState('');
  const [recordingAction, setRecordingAction] = useState<ShortcutAction | null>(null);
  const [shortcutErrors, setShortcutErrors] = useState<Partial<Record<ShortcutAction, string>>>({});

  const autosaveLabel = useMemo(() => {
    if (settings.workspace.autosaveDelay === 0) {
      return 'Instant';
    }

    return `${settings.workspace.autosaveDelay} ms`;
  }, [settings.workspace.autosaveDelay]);

  const uiTransparencyLabel = useMemo(() => (
    `${Math.round(settings.local.uiTransparency * 100)}%`
  ), [settings.local.uiTransparency]);

  const normalizedSearch = useMemo(() => normalizeSearch(searchValue), [searchValue]);
  const activeViewMeta = views.find((view) => view.id === activeView) ?? views[0];

  const workspaceCards = [
    {
      title: 'Workspace Layout',
      description: 'Decide how many notes Vaultor can hold open and how new notes enter the workspace.',
      settings: [
        {
          label: 'Max open notes',
          description: 'Choose how many notes the workspace can keep open at once.',
          control: (
            <SettingSelect
              value={String(settings.workspace.maxOpenNotes)}
              onChange={(value) => updateWorkspaceSetting('maxOpenNotes', Number(value))}
              options={[
                { label: '1 note', value: '1' },
                { label: '2 notes', value: '2' },
                { label: '3 notes', value: '3' },
              ]}
            />
          ),
        },
        {
          label: 'Open behavior',
          description: 'Opening a note can replace the current workspace or split it.',
          control: (
            <SettingSelect
              value={settings.workspace.openBehavior}
              onChange={(value) => updateWorkspaceSetting('openBehavior', value as 'replace' | 'split')}
              options={[
                { label: 'Split workspace', value: 'split' },
                { label: 'Replace current note', value: 'replace' },
              ]}
            />
          ),
        },
      ] satisfies SearchableSetting[],
      scope: 'Applies to this vault',
    },
    {
      title: 'Saving Behavior',
      description: 'Keep saves instant or add just enough breathing room while you type.',
      settings: [
        {
          label: 'Autosave delay',
          description: 'Keep saves instant, or add a small debounce while typing.',
          control: (
            <RangeControl
              value={settings.workspace.autosaveDelay}
              min={0}
              max={1000}
              step={100}
              onChange={(value) => updateWorkspaceSetting('autosaveDelay', value)}
              valueLabel={autosaveLabel}
            />
          ),
        },
      ] satisfies SearchableSetting[],
      scope: 'Applies to this vault',
    },
    {
      title: 'Focus & Distraction',
      description: 'Trim away chrome when you want the editor to take over.',
      settings: [
        {
          label: 'Focus mode',
          description: 'Hide the sidebar and reduce chrome around the editor.',
          control: (
            <SettingSelect
              value={settings.workspace.focusMode ? 'enabled' : 'disabled'}
              onChange={(value) => updateWorkspaceSetting('focusMode', value === 'enabled')}
              options={[
                { label: 'Disabled', value: 'disabled' },
                { label: 'Enabled', value: 'enabled' },
              ]}
            />
          ),
        },
      ] satisfies SearchableSetting[],
      footer: (
        <ResetStrip
          label="Reset workspace settings"
          description="Restore synced workspace behavior to the default Vaultor setup."
          onReset={resetWorkspaceSettings}
        />
      ),
      scope: 'Applies to this vault',
    },
  ];

  const localCards = [
    {
      title: 'Appearance',
      description: 'Set the surface, accent, and density personality for this device.',
      settings: [
        {
          label: 'Theme',
          description: 'Choose the app theme for this device.',
          control: (
            <SettingSelect
              value={settings.local.theme}
              onChange={(value) => updateLocalSetting('theme', value as 'dark' | 'light')}
              options={[
                { label: 'Dark', value: 'dark' },
                { label: 'Light', value: 'light' },
              ]}
            />
          ),
        },
        {
          label: 'Accent color',
          description: 'Pick the main accent used across buttons, focus states, and highlights.',
          control: (
            <SettingSelect
              value={settings.local.accentColor}
              onChange={(value) => updateLocalSetting('accentColor', value as LocalSettings['accentColor'])}
              options={accentOptions}
            />
          ),
        },
        {
          label: 'Density',
          description: 'Adjust spacing without changing the overall information layout.',
          control: (
            <SettingSelect
              value={settings.local.density}
              onChange={(value) => updateLocalSetting('density', value as 'comfortable' | 'compact')}
              options={[
                { label: 'Comfortable', value: 'comfortable' },
                { label: 'Compact', value: 'compact' },
              ]}
            />
          ),
        },
      ] satisfies SearchableSetting[],
      scope: 'Applies to this device',
    },
    {
      title: 'Motion & Glass',
      description: 'Control how much continuity and transparency Vaultor carries through overlays.',
      settings: [
        {
          label: 'Animation feel',
          description: 'Choose whether Vaultor prioritizes instant transitions or a little more continuity.',
          control: (
            <SettingSelect
              value={settings.local.animationMode}
              onChange={(value) => updateLocalSetting('animationMode', value as 'snappy' | 'smooth')}
              options={[
                { label: 'Snappy', value: 'snappy' },
                { label: 'Smooth', value: 'smooth' },
              ]}
            />
          ),
        },
        {
          label: 'UI transparency',
          description: 'Control the transparency of glassy surfaces like the command palette, floating sidebar, previews, and popovers.',
          control: (
            <RangeControl
              value={settings.local.uiTransparency}
              min={0.6}
              max={1}
              step={0.05}
              onChange={(value) => updateLocalSetting('uiTransparency', value)}
              valueLabel={uiTransparencyLabel}
            />
          ),
        },
      ] satisfies SearchableSetting[],
      scope: 'Applies to this device',
    },
    {
      title: 'Layout & Preview',
      description: 'Tune how workspace chrome behaves on this machine.',
      settings: [
        {
          label: 'Preview style',
          description: 'Choose how previewable resources open on this device.',
          control: (
            <SettingSelect
              value={settings.local.previewMode}
              onChange={(value) => updateLocalSetting('previewMode', value as 'side' | 'modal')}
              options={[
                { label: 'Side panel', value: 'side' },
                { label: 'Floating modal', value: 'modal' },
              ]}
            />
          ),
        },
        {
          label: 'Sidebar mode',
          description: 'Choose whether the sidebar is part of the layout or a floating overlay.',
          control: (
            <SettingSelect
              value={settings.local.sidebarMode}
              onChange={(value) => updateLocalSetting('sidebarMode', value as 'fixed' | 'floating')}
              options={[
                { label: 'Fixed', value: 'fixed' },
                { label: 'Floating', value: 'floating' },
              ]}
            />
          ),
        },
      ] satisfies SearchableSetting[],
      footer: (
        <ResetStrip
          label="Reset local settings"
          description="Clear this device’s appearance and local preference overrides."
          onReset={resetLocalSettings}
        />
      ),
      scope: 'Applies to this device',
    },
  ];

  const visibleWorkspaceCards = workspaceCards.filter((card) => matchesSettingsCard(card, normalizedSearch));
  const visibleLocalCards = localCards.filter((card) => matchesSettingsCard(card, normalizedSearch));

  const visibleShortcutGroups = shortcutGroups
    .map((group) => ({
      ...group,
      actions: group.actions.filter((action) => {
        const meta = SHORTCUT_ACTIONS.find((item) => item.action === action);
        return Boolean(meta && matchesSearch(normalizedSearch, group.title, group.description, meta.description));
      }),
    }))
    .filter((group) => group.actions.length > 0 || matchesSearch(normalizedSearch, group.title, group.description));

  const handleShortcutKeyDown = (action: ShortcutAction) => (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!recordingAction || recordingAction !== action) {
      return;
    }

    if (event.key === 'Tab') {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (event.key === 'Escape') {
      setRecordingAction(null);
      setShortcutErrors((current) => ({ ...current, [action]: '' }));
      return;
    }

    const shortcut = shortcutFromKeyboardEvent(event);
    if (!shortcut) {
      return;
    }

    const error = setCustomShortcut(action, shortcut);
    setShortcutErrors((current) => ({
      ...current,
      [action]: error ?? '',
    }));

    if (!error) {
      setRecordingAction(null);
    }
  };

  return (
    <AppModal
      open={open}
      onClose={() => {
        setRecordingAction(null);
        onClose();
      }}
      title="Settings"
      description="Workspace behavior syncs across the vault. Local preferences stay scoped to this device, and key bindings update only for the current platform."
      widthClassName="max-w-6xl"
    >
      <div className="max-h-[78vh] overflow-y-auto pr-1">
        <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="space-y-1.5">
            {views.map((view) => {
              const selected = view.id === activeView;
              return (
                <button
                  key={view.id}
                  onClick={() => setActiveView(view.id)}
                  className={`flex w-full items-start gap-3 rounded-2xl px-3.5 py-3 text-left transition-all duration-150 ${
                    selected
                      ? 'bg-primary/10 text-primary shadow-[inset_0_0_0_1px_rgba(59,130,246,0.14)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <span className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl transition-colors ${
                    selected ? 'bg-primary/10 text-primary' : 'bg-[var(--surface-3)] text-[var(--text-tertiary)]'
                  }`}>
                    {view.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{view.label}</span>
                    <span className="mt-1 block text-xs leading-5 text-[var(--text-tertiary)]">{view.description}</span>
                  </span>
                </button>
              );
            })}
          </aside>

          <section className="min-w-0">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-3)] text-[var(--text-secondary)] shadow-[inset_0_0_0_1px_var(--border-subtle)]">
                {activeViewMeta.icon}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
                    {getViewTitle(activeView)}
                  </h3>
                  <ScopeBadge label={getViewScope(activeView, shortcutPlatformLabel)} />
                </div>
                <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
                  {getViewDescription(activeView, shortcutPlatformLabel)}
                </p>
              </div>
            </div>

            <div className="mt-6">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={15} />
                <input
                  value={searchValue}
                  onChange={(event) => setSearchValue(event.target.value)}
                  placeholder={`Search ${activeViewMeta.label.toLowerCase()} settings...`}
                  className="w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-2)] py-3 pl-10 pr-4 text-sm text-[var(--text-primary)] outline-none transition-all duration-150 placeholder:text-[var(--text-tertiary)] hover:border-[var(--border-strong)] focus:border-primary focus:shadow-[0_0_0_3px_rgba(59,130,246,0.12)]"
                />
              </div>
            </div>

            {activeView === 'workspace' && (
              <div className="mt-6 space-y-5">
                {visibleWorkspaceCards.length > 0 ? (
                  visibleWorkspaceCards.map((card) => (
                    <SettingsCard
                      key={card.title}
                      title={card.title}
                      description={card.description}
                      scope={card.scope}
                      footer={card.footer}
                    >
                      {card.settings.map((setting) => (
                        <SettingRow key={setting.label} label={setting.label} description={setting.description}>
                          {setting.control}
                        </SettingRow>
                      ))}
                    </SettingsCard>
                  ))
                ) : (
                  <EmptySearchState query={searchValue} />
                )}
              </div>
            )}

            {activeView === 'local' && (
              <div className="mt-6 space-y-5">
                {visibleLocalCards.length > 0 ? (
                  visibleLocalCards.map((card) => (
                    <SettingsCard
                      key={card.title}
                      title={card.title}
                      description={card.description}
                      scope={card.scope}
                      footer={card.footer}
                    >
                      {card.settings.map((setting) => (
                        <SettingRow key={setting.label} label={setting.label} description={setting.description}>
                          {setting.control}
                        </SettingRow>
                      ))}
                    </SettingsCard>
                  ))
                ) : (
                  <EmptySearchState query={searchValue} />
                )}
              </div>
            )}

            {activeView === 'keyboard' && (
              <div className="mt-6 space-y-5">
                {visibleShortcutGroups.length > 0 ? (
                  visibleShortcutGroups.map((group) => (
                    <SettingsCard
                      key={group.title}
                      title={group.title}
                      description={group.description}
                      scope={`${shortcutPlatformLabel}-specific shortcuts`}
                    >
                      <div className="space-y-4">
                        {group.actions.map((action) => {
                          const shortcut = SHORTCUT_ACTIONS.find((item) => item.action === action);
                          if (!shortcut) {
                            return null;
                          }

                          const isRecording = recordingAction === action;

                          return (
                            <div
                              key={action}
                              className="grid gap-3 rounded-2xl bg-[var(--surface-3)] px-4 py-3 shadow-[inset_0_0_0_1px_var(--border-subtle)] lg:grid-cols-[minmax(0,1fr)_240px_auto] lg:items-center"
                            >
                              <div className="min-w-0">
                                <div className="text-base font-medium text-foreground">{shortcut.description}</div>
                                <div className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                                  {isRecording ? `Press new shortcut for ${shortcutPlatformLabel}...` : `Currently mapped for ${shortcutPlatformLabel}.`}
                                </div>
                                {shortcutErrors[action] && (
                                  <div className="mt-2 text-xs font-medium text-red-500">{shortcutErrors[action]}</div>
                                )}
                              </div>

                              <button
                                type="button"
                                onClick={() => {
                                  setRecordingAction(action);
                                  setShortcutErrors((current) => ({ ...current, [action]: '' }));
                                }}
                                onBlur={() => {
                                  setRecordingAction((current) => (current === action ? null : current));
                                }}
                                onKeyDown={handleShortcutKeyDown(action)}
                              className={`w-full rounded-2xl border px-3 py-2.5 text-left text-sm font-medium outline-none transition-all duration-150 ${
                                  isRecording
                                    ? 'border-primary bg-primary/10 text-primary shadow-[0_0_0_3px_rgba(59,130,246,0.14)]'
                                    : 'border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--text-primary)] hover:border-primary/40 hover:bg-[var(--surface-3)]'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <span className="truncate">
                                    {isRecording ? 'Press new shortcut…' : formatShortcutKeys(resolvedShortcuts[action]).join(' + ')}
                                  </span>
                                  {isRecording && <Sparkles size={14} className="flex-shrink-0" />}
                                </div>
                              </button>

                              <button
                                onClick={() => {
                                  resetShortcut(action);
                                  setRecordingAction((current) => (current === action ? null : current));
                                  setShortcutErrors((current) => ({ ...current, [action]: '' }));
                                }}
                                className="rounded-xl border border-[var(--border-subtle)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-primary/30 hover:text-primary"
                              >
                                Reset
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </SettingsCard>
                  ))
                ) : (
                  <EmptySearchState query={searchValue} />
                )}

                <SettingsCard
                  title="Reset Key Bindings"
                  description="Return every shortcut override for this platform to Vaultor’s defaults."
                  scope={`${shortcutPlatformLabel}-specific shortcuts`}
                >
                  <ResetStrip
                    label="Reset all key bindings"
                    description={`Return every ${shortcutPlatformLabel} shortcut override to the built-in defaults.`}
                    onReset={() => {
                      SHORTCUT_ACTIONS.forEach((shortcut) => resetShortcut(shortcut.action));
                      setRecordingAction(null);
                      setShortcutErrors({});
                    }}
                  />
                </SettingsCard>
              </div>
            )}
          </section>
        </div>

        <div className="mt-8 rounded-2xl bg-[var(--surface-3)] px-4 py-4 shadow-[inset_0_0_0_1px_var(--border-subtle)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <RotateCcw size={15} className="text-[var(--text-tertiary)]" />
                Reset everything
              </div>
              <div className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                Restore workspace, local preferences, and key bindings to Vaultor’s defaults.
              </div>
            </div>

            <button
              onClick={() => {
                setRecordingAction(null);
                setShortcutErrors({});
                resetAllSettings();
              }}
              className="rounded-xl border border-[var(--border-subtle)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-primary/30 hover:text-primary"
            >
              Reset all settings
            </button>
          </div>
        </div>
      </div>
    </AppModal>
  );
}

function getViewTitle(view: SettingsView) {
  if (view === 'workspace') {
    return 'Workspace behavior';
  }

  if (view === 'local') {
    return 'Local appearance';
  }

  return 'Key bindings';
}

function getViewDescription(view: SettingsView, shortcutPlatformLabel: string) {
  if (view === 'workspace') {
    return 'These settings shape how the vault behaves everywhere you open it.';
  }

  if (view === 'local') {
    return 'These preferences shape the way Vaultor feels on this specific device.';
  }

  return `Shortcut overrides stay action-based, resolve per platform, and currently edit only the ${shortcutPlatformLabel} bindings.`;
}

function getViewScope(view: SettingsView, shortcutPlatformLabel: string) {
  if (view === 'workspace') {
    return 'Applies to this vault';
  }

  if (view === 'local') {
    return 'Applies to this device';
  }

  return `${shortcutPlatformLabel}-specific shortcuts`;
}

function matchesSettingsCard(
  card: { title: string; description: string; settings: SearchableSetting[] },
  query: string,
) {
  if (!query) {
    return true;
  }

  if (matchesSearch(query, card.title, card.description)) {
    return true;
  }

  return card.settings.some((setting) => matchesSearch(query, setting.label, setting.description));
}

function matchesSearch(query: string, ...values: Array<string | undefined>) {
  if (!query) {
    return true;
  }

  const haystack = values
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return haystack.includes(query);
}

function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

function ScopeBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--surface-3)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)] shadow-[inset_0_0_0_1px_rgba(148,163,184,0.06)]">
      {label}
    </span>
  );
}

function SettingsCard({
  title,
  description,
  scope,
  children,
  footer,
}: {
  title: string;
  description?: string;
  scope?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="rounded-[24px] bg-[var(--surface-2)] p-5 shadow-[inset_0_0_0_1px_var(--border-strong),0_18px_34px_rgba(15,23,42,0.1)] backdrop-blur-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">{title}</h4>
          {description && <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{description}</p>}
        </div>
        {scope && <ScopeBadge label={scope} />}
      </div>
      <div className="mt-5 space-y-4">
        {children}
      </div>
      {footer && <div className="mt-6">{footer}</div>}
    </section>
  );
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-[var(--surface-3)] px-4 py-3 shadow-[inset_0_0_0_1px_var(--border-subtle)] transition-colors duration-150 hover:bg-[var(--surface-4)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
        <div className="min-w-0">
          <div className="text-[15px] font-medium text-[var(--text-primary)]">{label}</div>
          <div className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{description}</div>
        </div>
        <div className="min-w-0 lg:w-64 lg:flex-shrink-0">{children}</div>
      </div>
    </div>
  );
}

function SettingSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find((option) => option.value === value) ?? options[0];
  const { position } = useAnchoredPortalPosition(open, containerRef, { width: 'anchor', offset: 8 });

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        (containerRef.current?.contains(target) || menuRef.current?.contains(target))
      ) {
        return;
      }
      setOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setOpen(false);
          }
        }}
        className={`flex w-full items-center justify-between rounded-2xl border px-3 py-2.5 text-left text-sm font-medium outline-none transition-all duration-150 ${
          open
            ? 'border-primary bg-[var(--surface-2)] text-[var(--text-primary)] shadow-[0_0_0_3px_rgba(59,130,246,0.12),0_10px_24px_rgba(15,23,42,0.08)]'
            : 'border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--text-primary)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-3)] hover:shadow-[0_8px_20px_rgba(15,23,42,0.06)]'
        }`}
      >
        <span className="truncate">{selectedOption?.label ?? value}</span>
        <ChevronDown size={15} className={`ml-3 flex-shrink-0 text-[var(--text-tertiary)] transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && position && createPortal(
        <div
          ref={menuRef}
          className="overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-2)] p-1.5 shadow-[0_22px_44px_rgba(15,23,42,0.14)]"
          style={{
            position: 'fixed',
            top: position.top,
            left: position.left,
            width: position.width,
            maxHeight: position.maxHeight,
            transform: position.placement === 'top' ? 'translateY(-100%)' : undefined,
            zIndex: 1100,
          }}
        >
          <div className="overflow-y-auto" style={{ maxHeight: position.maxHeight - 12 }}>
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                  selected
                    ? 'bg-primary/10 text-primary'
                    : 'text-[var(--text-primary)] hover:bg-[var(--surface-3)]'
                }`}
              >
                <span className="truncate">{option.label}</span>
                {selected && <Check size={14} className="ml-2 flex-shrink-0" />}
              </button>
            );
          })}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

function RangeControl({
  value,
  min,
  max,
  step,
  onChange,
  valueLabel,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  valueLabel: string;
}) {
  return (
    <div className="w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-3 transition-all duration-150 hover:border-[var(--border-strong)] focus-within:border-primary focus-within:shadow-[0_0_0_3px_rgba(59,130,246,0.12)]">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-[var(--accent)]"
      />
      <div className="mt-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">{valueLabel}</div>
    </div>
  );
}

function ResetStrip({
  label,
  description,
  onReset,
}: {
  label: string;
  description: string;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <div className="text-sm font-semibold text-[var(--text-primary)]">{label}</div>
        <div className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{description}</div>
      </div>
      <button
        onClick={onReset}
        className="rounded-xl border border-[var(--border-subtle)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-primary/30 hover:text-primary"
      >
        Reset
      </button>
    </div>
  );
}

function EmptySearchState({ query }: { query: string }) {
  return (
    <div className="rounded-[24px] bg-[var(--surface-2)] px-5 py-10 text-center shadow-[inset_0_0_0_1px_var(--border-subtle)]">
      <div className="text-sm font-medium text-[var(--text-primary)]">No settings match “{query}”.</div>
      <div className="mt-2 text-sm text-[var(--text-secondary)]">Try a broader term like theme, sidebar, preview, or shortcut.</div>
    </div>
  );
}
