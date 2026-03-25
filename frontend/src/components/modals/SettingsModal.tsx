import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Command, Laptop2, Layers3, RotateCcw } from 'lucide-react';
import AppModal from './AppModal';
import {
  SHORTCUT_ACTIONS,
  formatShortcutKeys,
  shortcutFromKeyboardEvent,
  type ShortcutAction,
} from '../../lib/shortcuts';
import { useSettings, type LocalSettings } from '../../lib/settings';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

type SettingsView = 'workspace' | 'local' | 'keyboard';

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
    description: 'Synced with the vault',
    icon: <Layers3 size={16} />,
  },
  {
    id: 'local',
    label: 'Local',
    description: 'Stored on this device',
    icon: <Laptop2 size={16} />,
  },
  {
    id: 'keyboard',
    label: 'Key bindings',
    description: 'Shortcut overrides',
    icon: <Command size={16} />,
  },
];

export default function SettingsModal({ open, onClose }: SettingsModalProps) {
  const {
    settings,
    resolvedShortcuts,
    updateWorkspaceSetting,
    updateLocalSetting,
    setCustomShortcut,
    resetShortcut,
    resetWorkspaceSettings,
    resetLocalSettings,
    resetAllSettings,
  } = useSettings();
  const [activeView, setActiveView] = useState<SettingsView>('workspace');
  const [shortcutErrors, setShortcutErrors] = useState<Partial<Record<ShortcutAction, string>>>({});

  const autosaveLabel = useMemo(() => {
    if (settings.workspace.autosaveDelay === 0) {
      return 'Instant';
    }

    return `${settings.workspace.autosaveDelay} ms`;
  }, [settings.workspace.autosaveDelay]);

  const activeViewMeta = views.find((view) => view.id === activeView) ?? views[0];

  const handleShortcutKeyDown = (action: ShortcutAction) => (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Tab' || event.key === 'Escape') {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const shortcut = shortcutFromKeyboardEvent(event);
    if (!shortcut) {
      return;
    }

    const error = setCustomShortcut(action, shortcut);
    setShortcutErrors((current) => ({
      ...current,
      [action]: error ?? '',
    }));
  };

  return (
    <AppModal
      open={open}
      onClose={onClose}
      title="Settings"
      description="Workspace rules stay with the vault. Appearance and key bindings stay with this device."
      widthClassName="max-w-5xl"
    >
      <div className="max-h-[76vh] overflow-y-auto pr-1">
        <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="space-y-1">
            {views.map((view) => {
              const selected = view.id === activeView;
              return (
                <button
                  key={view.id}
                  onClick={() => setActiveView(view.id)}
                  className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                    selected
                      ? 'bg-primary/10 text-primary'
                      : 'text-slate-500 hover:bg-background hover:text-foreground'
                  }`}
                >
                  <span className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl ${
                    selected ? 'bg-primary/10' : 'bg-background'
                  }`}>
                    {view.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{view.label}</span>
                    <span className="mt-1 block text-xs text-slate-400">{view.description}</span>
                  </span>
                </button>
              );
            })}
          </aside>

          <section className="min-w-0">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-background text-slate-500">
                {activeViewMeta.icon}
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-foreground">
                  {getViewTitle(activeView)}
                </h3>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  {getViewDescription(activeView)}
                </p>
              </div>
            </div>

            {activeView === 'workspace' && (
              <div className="mt-8">
                <SettingRow label="Max open notes" description="Choose how many notes the workspace can keep open at once.">
                  <SettingSelect
                    value={String(settings.workspace.maxOpenNotes)}
                    onChange={(value) => updateWorkspaceSetting('maxOpenNotes', Number(value))}
                    options={[
                      { label: '1 note', value: '1' },
                      { label: '2 notes', value: '2' },
                      { label: '3 notes', value: '3' },
                    ]}
                  />
                </SettingRow>

                <SettingRow label="Open behavior" description="Opening a note can replace the current workspace or split it.">
                  <SettingSelect
                    value={settings.workspace.openBehavior}
                    onChange={(value) => updateWorkspaceSetting('openBehavior', value as 'replace' | 'split')}
                    options={[
                      { label: 'Split workspace', value: 'split' },
                      { label: 'Replace current note', value: 'replace' },
                    ]}
                  />
                </SettingRow>

                <SettingRow label="Autosave delay" description="Keep saves instant, or add a small debounce while typing.">
                  <div className="w-full">
                    <input
                      type="range"
                      min={0}
                      max={1000}
                      step={100}
                      value={settings.workspace.autosaveDelay}
                      onChange={(event) => updateWorkspaceSetting('autosaveDelay', Number(event.target.value))}
                      className="w-full accent-[var(--accent)]"
                    />
                    <div className="mt-2 text-xs font-medium text-slate-500">{autosaveLabel}</div>
                  </div>
                </SettingRow>

                <SettingRow label="Focus mode" description="Hide the sidebar and reduce chrome around the editor.">
                  <SettingSelect
                    value={settings.workspace.focusMode ? 'enabled' : 'disabled'}
                    onChange={(value) => updateWorkspaceSetting('focusMode', value === 'enabled')}
                    options={[
                      { label: 'Disabled', value: 'disabled' },
                      { label: 'Enabled', value: 'enabled' },
                    ]}
                  />
                </SettingRow>

                <ResetStrip
                  label="Reset workspace settings"
                  description="Restore synced workspace behavior to the default Vaultor setup."
                  onReset={resetWorkspaceSettings}
                />
              </div>
            )}

            {activeView === 'local' && (
              <div className="mt-8">
                <SettingRow label="Theme" description="Choose the app theme for this device.">
                  <SettingSelect
                    value={settings.local.theme}
                    onChange={(value) => updateLocalSetting('theme', value as 'dark' | 'light')}
                    options={[
                      { label: 'Dark', value: 'dark' },
                      { label: 'Light', value: 'light' },
                    ]}
                  />
                </SettingRow>

                <SettingRow label="Accent color" description="Pick the main accent used across buttons, focus states, and highlights.">
                  <SettingSelect
                    value={settings.local.accentColor}
                    onChange={(value) => updateLocalSetting('accentColor', value as LocalSettings['accentColor'])}
                    options={accentOptions}
                  />
                </SettingRow>

                <SettingRow label="Density" description="Adjust spacing without changing the overall information layout.">
                  <SettingSelect
                    value={settings.local.density}
                    onChange={(value) => updateLocalSetting('density', value as 'comfortable' | 'compact')}
                    options={[
                      { label: 'Comfortable', value: 'comfortable' },
                      { label: 'Compact', value: 'compact' },
                    ]}
                  />
                </SettingRow>

                <SettingRow label="Preview style" description="Choose how previewable resources open on this device.">
                  <SettingSelect
                    value={settings.local.previewMode}
                    onChange={(value) => updateLocalSetting('previewMode', value as 'side' | 'modal')}
                    options={[
                      { label: 'Side panel', value: 'side' },
                      { label: 'Floating modal', value: 'modal' },
                    ]}
                  />
                </SettingRow>

                <ResetStrip
                  label="Reset local settings"
                  description="Clear this device’s appearance and local preference overrides."
                  onReset={resetLocalSettings}
                />
              </div>
            )}

            {activeView === 'keyboard' && (
              <div className="mt-8 space-y-4">
                {SHORTCUT_ACTIONS.map((shortcut) => (
                  <div
                    key={shortcut.action}
                    className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_auto] lg:items-start"
                  >
                    <div className="min-w-0">
                      <div className="text-base text-foreground">{shortcut.description}</div>
                      <div className="mt-1 text-sm opacity-60">Press a new combo with Cmd/Ctrl.</div>
                      {shortcutErrors[shortcut.action] && (
                        <div className="mt-2 text-xs text-red-500">{shortcutErrors[shortcut.action]}</div>
                      )}
                    </div>

                    <input
                      value={formatShortcutKeys(resolvedShortcuts[shortcut.action]).join(' + ')}
                      readOnly
                      onKeyDown={handleShortcutKeyDown(shortcut.action)}
                      className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground outline-none transition-colors focus:border-primary"
                    />

                    <button
                      onClick={() => {
                        resetShortcut(shortcut.action);
                        setShortcutErrors((current) => ({ ...current, [shortcut.action]: '' }));
                      }}
                      className="rounded-lg border border-border/70 px-3 py-2 text-xs font-medium text-slate-500 transition-colors hover:text-primary"
                    >
                      Reset
                    </button>
                  </div>
                ))}

                <ResetStrip
                  label="Reset all key bindings"
                  description="Return every local shortcut override to the built-in defaults."
                  onReset={() => {
                    SHORTCUT_ACTIONS.forEach((shortcut) => resetShortcut(shortcut.action));
                    setShortcutErrors({});
                  }}
                />
              </div>
            )}
          </section>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <RotateCcw size={15} className="text-slate-400" />
              Reset everything
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Restore workspace, local preferences, and key bindings to Vaultor’s defaults.
            </div>
          </div>

          <button
            onClick={resetAllSettings}
            className="rounded-lg border border-border/70 px-3 py-2 text-xs font-medium text-slate-500 transition-colors hover:text-primary"
          >
            Reset all settings
          </button>
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

function getViewDescription(view: SettingsView) {
  if (view === 'workspace') {
    return 'These settings are stored in the vault database and included in export and import.';
  }

  if (view === 'local') {
    return 'These preferences stay in local storage and only affect this device.';
  }

  return 'Shortcut overrides stay local, block browser conflicts, and update the help modal automatically.';
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
    <div className="mt-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
        <div className="min-w-0">
          <div className="text-base text-foreground">{label}</div>
          <div className="mt-1 text-sm leading-6 opacity-60">{description}</div>
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
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-xl border border-border/70 bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
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
    <div className="mt-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-base text-foreground">{label}</div>
          <div className="mt-1 text-sm opacity-60">{description}</div>
        </div>
        <button
          onClick={onReset}
          className="rounded-lg border border-border/70 px-3 py-2 text-xs font-medium text-slate-500 transition-colors hover:text-primary"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
