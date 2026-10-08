import { MotionComparison, MotionIndicator, CategoryMotion } from '../MotionFeedback';
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { Check, Command, Layers3, MoreHorizontal, Palette, PanelsTopLeft, Search, X } from 'lucide-react';
import { SHORTCUT_ACTIONS, formatShortcutKeys, shortcutFromKeyboardEvent, type ShortcutAction } from '../../lib/shortcuts';
import { useSettings } from '../../lib/settings';
import { ESCAPE_PRIORITIES, useEscapeLayer } from '../../lib/escape/escape';
import { useRestoreFocusOnClose } from '../../lib/useRestoreFocusOnClose';
import { getGlassPanelStyle, getOverlayStyle } from '../../lib/transparency';

type Category = 'appearance' | 'workspace' | 'layout' | 'keyboard';
type Setting = { id: string; label: string; description: string; keywords: string; control: ReactNode };
type Reset = { label: string; description: string; run: () => void };
const categories = [
  { id: 'appearance' as const, label: 'Appearance', icon: Palette },
  { id: 'workspace' as const, label: 'Workspace', icon: Layers3 },
  { id: 'layout' as const, label: 'Layout & previews', icon: PanelsTopLeft },
  { id: 'keyboard' as const, label: 'Keyboard', icon: Command },
];
const accents = { blue: '#3b82f6', purple: '#8b5cf6', green: '#22c55e', orange: '#f97316', red: '#ef4444', teal: '#14b8a6', pink: '#ec4899', cyan: '#06b6d4' } as const;

export default function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return open ? <SettingsWindow onClose={onClose} /> : null;
}

function SettingsWindow({ onClose }: { onClose: () => void }) {
  const { settings, saveStatus, retrySave, resolvedShortcuts, shortcutPlatformLabel,
    updateWorkspaceSetting, updateLocalSetting, setCustomShortcut, resetShortcut,
    resetWorkspaceSettings, resetLocalSettings, resetAllSettings } = useSettings();
  const [category, setCategory] = useState<Category>('appearance');
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [reset, setReset] = useState<Reset | null>(null);
  const [recording, setRecording] = useState<ShortcutAction | null>(null);
  const [errors, setErrors] = useState<Partial<Record<ShortcutAction, string>>>({});
  const titleId = useId();
  const root = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const more = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const confirmation = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLElement>(null);
  const { captureFocus, restoreFocus } = useRestoreFocusOnClose();
  const captured = useRef(false);
  useLayoutEffect(() => { if (!captured.current) { captureFocus(); captured.current = true; } search.current?.focus(); const element = root.current; return () => { queueMicrotask(() => { if (!element?.isConnected) restoreFocus(); }); }; }, [captureFocus, restoreFocus]);
  useEscapeLayer({ active: true, priority: ESCAPE_PRIORITIES.modal, close: onClose, restoreFocusOnEscape: false });
  useEscapeLayer({ active: menuOpen, priority: ESCAPE_PRIORITIES.modal + 1, close: () => setMenuOpen(false), restoreFocus: () => more.current?.focus() });
  useEscapeLayer({ active: recording !== null, priority: ESCAPE_PRIORITIES.modal + 2, close: () => setRecording(null), restoreFocusOnEscape: false });
  useEscapeLayer({ active: reset !== null, priority: ESCAPE_PRIORITIES.modal + 3, close: () => setReset(null), restoreFocus: () => more.current?.focus() });
  const hadConfirmation = useRef(false);
  useLayoutEffect(() => {
    if (reset) cancel.current?.focus(); else if (hadConfirmation.current) more.current?.focus();
    hadConfirmation.current = Boolean(reset);
  }, [reset]);
  useEffect(() => { content.current?.scrollTo?.(0, 0); }, [category, query]);
  useEffect(() => {
    if (!menuOpen) return;
    menu.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !menu.current?.contains(event.target) && !more.current?.contains(event.target)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [menuOpen]);
  // Contain focus in the active settings surface, including the nested confirmation.
  useEffect(() => {
    const contain = (event: FocusEvent) => {
      const boundary = confirmation.current ?? root.current;
      if (boundary && event.target instanceof Node && !boundary.contains(event.target)) {
        (reset ? cancel.current : search.current)?.focus({ preventScroll: true });
      }
    };
    document.addEventListener('focusin', contain);
    return () => document.removeEventListener('focusin', contain);
  }, [reset]);

  const requestReset = (value: Reset) => { setMenuOpen(false); setRecording(null); setReset(value); };
  const resetKeyboard = () => { SHORTCUT_ACTIONS.forEach(item => resetShortcut(item.action)); setErrors({}); };
  const resets: Reset[] = [
    { label: 'Reset device preferences', description: 'Restore appearance, layout, sidebar preferences and previews on this device. Other devices and workspace settings stay unchanged.', run: resetLocalSettings },
    { label: 'Reset workspace behavior', description: 'Restore note capacity, opening behavior, autosave delay and focus mode for this workspace on every device.', run: resetWorkspaceSettings },
    { label: 'Reset keyboard shortcuts', description: `Restore ${shortcutPlatformLabel} shortcuts. Bindings for other platforms stay unchanged.`, run: resetKeyboard },
    { label: 'Reset all settings', description: 'Restore workspace behavior, this device’s preferences and shortcut bindings for all platforms. Other devices’ appearance preferences stay unchanged.', run: () => { resetAllSettings(); setErrors({}); } },
  ];
  const recordKeys = (action: ShortcutAction) => (event: KeyboardEvent<HTMLButtonElement>) => {
    if (recording !== action || event.nativeEvent.isComposing || event.key === 'Tab') return;
    event.preventDefault(); event.stopPropagation();
    const shortcut = shortcutFromKeyboardEvent(event);
    if (!shortcut) return;
    const error = setCustomShortcut(action, shortcut);
    setErrors(current => ({ ...current, [action]: error ?? '' }));
    if (!error) setRecording(null);
  };
  const groups: Array<{ id: Category; label: string; scope: string; settings: Setting[] }> = [
    { id: 'appearance', label: 'Appearance', scope: 'This device', settings: [
      { id: 'theme', label: 'Theme', description: 'OS follows your system appearance.', keywords: 'light dark oled black system', control: <Choices label="Theme" value={settings.local.theme} options={['os', 'light', 'dark', 'oled'].map(value => ({ value, label: value === 'os' ? 'OS' : value === 'oled' ? 'OLED' : capitalize(value) }))} onChange={value => updateLocalSetting('theme', value as typeof settings.local.theme)} /> },
      { id: 'accent', label: 'Accent color', description: 'Your highlight for actions, links and focus.', keywords: 'blue purple green orange red teal pink cyan color colour', control: <div role="radiogroup" aria-label="Accent color" className="settings-swatches" onKeyDown={event => {
        if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault(); const names = Object.keys(accents) as Array<keyof typeof accents>; const current = names.indexOf(settings.local.accentColor);
        const index = event.key === 'Home' ? 0 : event.key === 'End' ? names.length - 1 : (current + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1) + names.length) % names.length;
        updateLocalSetting('accentColor', names[index]); event.currentTarget.querySelectorAll<HTMLButtonElement>('button')[index]?.focus();
      }}>{Object.entries(accents).map(([name, color]) => <button type="button" key={name} role="radio" aria-checked={settings.local.accentColor === name} tabIndex={settings.local.accentColor === name ? 0 : -1} aria-label={capitalize(name)} title={capitalize(name)} style={{ '--swatch': color } as CSSProperties} onClick={() => updateLocalSetting('accentColor', name as keyof typeof accents)}>{settings.local.accentColor === name && <Check size={14} />}</button>)}</div> },
      { id: 'density', label: 'Density', description: 'Choose how closely controls sit together.', keywords: 'spacing compact comfortable size', control: <Choices label="Density" value={settings.local.density} options={[{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]} onChange={value => updateLocalSetting('density', value as typeof settings.local.density)} /> },
      { id: 'motion', label: 'Animation feel', description: 'Snappy responds quickly; Smooth adds continuity.', keywords: 'motion animation smooth snappy transitions', control: <div className="settings-motion-control"><Choices label="Animation feel" value={settings.local.animationMode} options={[{ value: 'snappy', label: 'Snappy' }, { value: 'smooth', label: 'Smooth' }]} onChange={value => updateLocalSetting('animationMode', value as typeof settings.local.animationMode)} /><MotionComparison /></div> },
      { id: 'transparency', label: 'UI transparency', description: settings.local.theme === 'oled' ? 'OLED stays opaque. This value is retained for other themes.' : 'Opacity of floating panels, menus and dialogs.', keywords: 'glass opacity blur transparent', control: <NumberRange label="UI transparency" value={Math.round(settings.local.uiTransparency * 100)} min={60} max={100} step={5} unit="%" onChange={value => updateLocalSetting('uiTransparency', value / 100)} /> },
    ] },
    { id: 'workspace', label: 'Workspace', scope: 'Workspace · all devices', settings: [
      { id: 'capacity', label: 'Max open notes', description: 'The number of note panes allowed at once.', keywords: 'panes capacity tabs one two three', control: <Choices label="Max open notes" value={String(settings.workspace.maxOpenNotes)} options={[1, 2, 3].map(value => ({ value: String(value), label: String(value) }))} onChange={value => updateWorkspaceSetting('maxOpenNotes', Number(value))} /> },
      { id: 'opening', label: 'Open behavior', description: 'Direct opens split the workspace or replace the focused note.', keywords: 'navigation split replace links', control: <Choices label="Open behavior" value={settings.workspace.openBehavior} options={[{ value: 'split', label: 'Split' }, { value: 'replace', label: 'Replace' }]} onChange={value => updateWorkspaceSetting('openBehavior', value as typeof settings.workspace.openBehavior)} /> },
      { id: 'autosave', label: 'Autosave delay', description: 'Use 0 for instant saves, or add a short typing delay.', keywords: 'saving debounce milliseconds instant', control: <NumberRange label="Autosave delay" value={settings.workspace.autosaveDelay} min={0} max={1000} step={100} unit="ms" onChange={value => updateWorkspaceSetting('autosaveDelay', value)} /> },
      { id: 'focus', label: 'Focus mode', description: 'Hide sidebar access and reduce workspace chrome.', keywords: 'distraction zen hide', control: <button className="settings-switch" type="button" role="switch" aria-label="Focus mode" aria-checked={settings.workspace.focusMode} onClick={() => updateWorkspaceSetting('focusMode', !settings.workspace.focusMode)}><span /></button> },
    ] },
    { id: 'layout', label: 'Layout & previews', scope: 'This device', settings: [
      { id: 'preview', label: 'Preview style', description: 'Open file previews beside notes or in a floating window.', keywords: 'files modal side panel pdf images', control: <Choices label="Preview style" value={settings.local.previewMode} options={[{ value: 'side', label: 'Side panel' }, { value: 'modal', label: 'Floating' }]} onChange={value => updateLocalSetting('previewMode', value as typeof settings.local.previewMode)} /> },
      { id: 'sidebar', label: 'Sidebar mode', description: 'Keep navigation in the layout or let it float.', keywords: 'fixed floating navigation', control: <Choices label="Sidebar mode" value={settings.local.sidebarMode} options={[{ value: 'fixed', label: 'Fixed' }, { value: 'floating', label: 'Floating' }]} onChange={value => updateLocalSetting('sidebarMode', value as typeof settings.local.sidebarMode)} /> },
    ] },
    { id: 'keyboard', label: 'Keyboard', scope: `${shortcutPlatformLabel} shortcuts`, settings: SHORTCUT_ACTIONS.map(item => ({
      id: item.action, label: item.description, description: errors[item.action] || (recording === item.action ? 'Press a shortcut. Escape cancels.' : ''), keywords: `${item.action} key binding shortcut ${formatShortcutKeys(resolvedShortcuts[item.action]).join(' ')}`, control: <div className="settings-binding"><button type="button" aria-label={`Change ${item.description} shortcut`} aria-pressed={recording === item.action} className="settings-key" onClick={() => { setRecording(item.action); setErrors(current => ({ ...current, [item.action]: '' })); }} onBlur={() => setRecording(current => current === item.action ? null : current)} onKeyDown={recordKeys(item.action)}>{recording === item.action ? 'Press keys…' : formatShortcutKeys(resolvedShortcuts[item.action]).join(' + ')}</button><button type="button" className="settings-text-action" aria-label={`Reset ${item.description} shortcut`} onClick={() => requestReset({ label: `Reset ${item.description} shortcut`, description: `Restore this binding for ${shortcutPlatformLabel}. Other bindings stay unchanged.`, run: () => { resetShortcut(item.action); setErrors(current => ({ ...current, [item.action]: '' })); } })}>Reset</button></div>,
    })) },
  ];
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = groups.filter(group => terms.length || group.id === category).map(group => ({ ...group, settings: group.settings.filter(setting => terms.every(term => `${group.label} ${setting.label} ${setting.description} ${setting.keywords}`.toLowerCase().includes(term))) })).filter(group => group.settings.length);

  return <div className="settings-overlay" style={getOverlayStyle(settings.local.uiTransparency, 0.38)} onClick={onClose}>
    <div data-motion-surface="panel" data-motion-key="settings" className="settings-window" ref={root} role="dialog" aria-modal="true" aria-labelledby={titleId} style={getGlassPanelStyle(settings.local.uiTransparency, 16, 'canvas')} onClick={event => event.stopPropagation()} onKeyDown={event => {
      if (event.key !== 'Tab') return;
      const boundary = confirmation.current ?? root.current;
      const items = focusable(boundary);
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && (document.activeElement === first || !boundary?.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
      <div className="settings-main" inert={Boolean(reset)}>
        <header className="settings-header">
          <div className="settings-title"><h2 id={titleId}>Settings</h2><span role="status" aria-live="polite" className={saveStatus === 'failed' ? 'settings-error' : 'settings-save-status'}>{saveStatus === 'saving' ? 'Saving…' : saveStatus === 'failed' ? <>Not saved <button type="button" onClick={retrySave}>Retry</button></> : 'Saved'}</span></div>
          <label className="settings-search"><Search size={17} /><input ref={search} aria-label="Search settings" placeholder="Search settings…" value={query} onChange={event => setQuery(event.target.value)} />{query && <button type="button" aria-label="Clear settings search" onClick={() => { setQuery(''); search.current?.focus(); }}><X size={15} /></button>}</label>
          <div className="settings-header-actions"><button type="button" ref={more} aria-label="Settings options" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)}><MoreHorizontal size={19} /></button><button type="button" aria-label="Close settings" onClick={onClose}><X size={19} /></button>
            {menuOpen && <div ref={menu} className="settings-options" role="menu" aria-label="Settings options" onKeyDown={event => {
              const items = [...(menu.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
              const index = items.indexOf(document.activeElement as HTMLButtonElement);
              if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus(); }
              if (event.key === 'Tab') { event.preventDefault(); setMenuOpen(false); more.current?.focus(); }
            }}>{resets.map(value => <button type="button" role="menuitem" key={value.label} onClick={() => requestReset(value)}>{value.label}</button>)}</div>}
          </div>
        </header>
        <div className="settings-body">
          <nav className="settings-rail" aria-label="Settings categories"><MotionIndicator value={category}/>{categories.map(item => <button type="button" key={item.id} aria-current={category === item.id ? 'page' : undefined} onClick={() => { setCategory(item.id); setQuery(''); setRecording(null); }}><item.icon size={17} /><span>{item.label}</span></button>)}</nav>
          <label className="settings-mobile-category">Category<select aria-label="Settings category" value={category} onChange={event => { setCategory(event.target.value as Category); setQuery(''); setRecording(null); }}>{categories.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          <section ref={content} className="settings-content" aria-label={terms.length ? 'Settings search results' : categories.find(item => item.id === category)?.label}>
            <CategoryMotion category={terms.length ? "search" : category}>{shown.map(group => <section key={group.id} className="settings-section" aria-labelledby={`${titleId}-${group.id}`}><div className="settings-section-heading"><h3 id={`${titleId}-${group.id}`}>{group.label}</h3><span>{group.scope}</span></div>{group.id === 'keyboard' && <p className="settings-section-note">Select a binding to record a new shortcut.</p>}{group.settings.map(setting => <div className="settings-row" key={setting.id}><div className="settings-row-copy"><h4>{setting.label}</h4>{setting.description && <p aria-live={errors[setting.id as ShortcutAction] ? 'polite' : undefined} className={errors[setting.id as ShortcutAction] ? 'settings-error' : undefined}>{setting.description}</p>}</div><div className="settings-control">{setting.control}</div></div>)}</section>)}
            {!shown.length && <div className="settings-empty"><h3>No settings match “{query}”</h3><p>Try theme, saving, sidebar or shortcut.</p><button type="button" className="settings-text-action" onClick={() => { setQuery(''); search.current?.focus(); }}>Clear search</button></div>}
          </CategoryMotion></section>
        </div>
      </div>
      {reset && <div className="settings-confirm-overlay"><div ref={confirmation} className="settings-confirm" role="alertdialog" aria-modal="true" aria-labelledby={`${titleId}-reset`} aria-describedby={`${titleId}-reset-description`}><h3 id={`${titleId}-reset`}>{reset.label}?</h3><p id={`${titleId}-reset-description`}>{reset.description}</p><div><button type="button" ref={cancel} onClick={() => { setReset(null); more.current?.focus(); }}>Cancel</button><button type="button" className="settings-confirm-action" onClick={() => { reset.run(); setReset(null); more.current?.focus(); }}>Reset</button></div></div></div>}
    </div>
  </div>;
}

function capitalize(value: string) { return value.charAt(0).toUpperCase() + value.slice(1); }
function focusable(root: HTMLElement | null) {
  return [...(root?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]') ?? [])].filter(item => {
    if (item.tabIndex < 0 || item.closest('[inert]')) return false;
    let node: HTMLElement | null = item;
    while (node) { const style = getComputedStyle(node); if (style.display === 'none' || style.visibility === 'hidden') return false; if (node === root) break; node = node.parentElement; }
    return true;
  });
}
function Choices({ label, value, options, onChange }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) {
  return <div role="radiogroup" aria-label={label} className="settings-choices" onKeyDown={event => {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); const current = options.findIndex(option => option.value === value);
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (current + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1) + options.length) % options.length;
    onChange(options[index].value); event.currentTarget.querySelectorAll<HTMLButtonElement>('button')[index]?.focus();
  }}><MotionIndicator axis="horizontal" value={value}/>{options.map(option => <button type="button" role="radio" aria-checked={value === option.value} tabIndex={value === option.value ? 0 : -1} key={option.value} onClick={() => onChange(option.value)}>{option.label}</button>)}</div>;
}
function NumberRange({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState('');
  const commit = () => {
    const number = Number(draft);
    if (draft === '' || !Number.isFinite(number) || number < min || number > max || Math.abs((number - min) / step - Math.round((number - min) / step)) > 0.001) { setError(`Use ${min}–${max} ${unit}, in steps of ${step}.`); return; }
    onChange(number); setDraft(null); setError('');
  };
  return <div className="settings-range"><div><input type="range" aria-label={label} value={value} min={min} max={max} step={step} onChange={event => { setDraft(null); setError(''); onChange(Number(event.target.value)); }} /><label><input type="number" aria-label={`${label} value`} aria-invalid={Boolean(error)} value={draft ?? String(value)} min={min} max={max} step={step} onChange={event => { setDraft(event.target.value); setError(''); }} onBlur={() => { if (draft !== null) commit(); }} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing && draft !== null) { event.preventDefault(); commit(); } }} /><span>{unit}</span></label></div>{error && <p role="alert" className="settings-error">{error}</p>}</div>;
}
