// @vitest-environment jsdom
import { StrictMode, useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import SettingsModal from './SettingsModal';
import { SettingsProvider, type SettingsDocument } from '../../lib/settings';
import { EscapeManagerProvider } from '../../lib/escape/EscapeManagerProvider';
import { mergeSettingsPatch, type SettingsPatch } from '../../lib/settingsPatch';
import api from '../../lib/api';
vi.mock('../../lib/api', () => ({ default: { get: vi.fn(), patch: vi.fn() } }));
let doc: Partial<SettingsDocument>;
beforeEach(() => {
  localStorage.setItem('vaultor_device_id', 'test-device');
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0));
  doc = { workspace: { maxOpenNotes: 2, openBehavior: 'split', autosaveDelay: 0, focusMode: false }, local: { other: { theme: 'dark' } }, keybindings: { toggleSidebar: { mac: 'Mod+Alt+Z' } } };
  vi.mocked(api.get).mockImplementation(async () => ({ data: doc }));
  vi.mocked(api.patch).mockImplementation(async (_url, patch) => ({ data: doc = mergeSettingsPatch(doc as SettingsPatch, patch as SettingsPatch) as Partial<SettingsDocument> }));
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });
function Harness() {
  const [open, setOpen] = useState(false);
  return <EscapeManagerProvider><SettingsProvider><button onClick={() => setOpen(true)}>Open settings</button><SettingsModal open={open} onClose={() => setOpen(false)} /></SettingsProvider></EscapeManagerProvider>;
}
async function open() {
  render(<StrictMode><Harness /></StrictMode>); await waitFor(() => expect(api.get).toHaveBeenCalled());
  screen.getByText('Open settings').focus(); fireEvent.click(screen.getByText('Open settings'));
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Search settings' })));
}
function category(name: string) { fireEvent.click(within(screen.getByRole('navigation', { name: 'Settings categories' })).getByRole('button', { name })); }
async function saved() { await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Saved')); }
it('opens Appearance, searches every category by keywords and restores the selected category', async () => {
  await open(); expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeTruthy();
  category('Layout & previews');
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'debounce' } });
  expect(screen.getByRole('slider', { name: 'Autosave delay' })).toBeTruthy();
  expect(screen.queryByRole('radiogroup', { name: 'Preview style' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Clear settings search' }));
  expect(screen.getByRole('radiogroup', { name: 'Preview style' })).toBeTruthy();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'impossiblequery' } });
  expect(screen.getByText(/No settings match/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
  expect(screen.getByRole('radiogroup', { name: 'Sidebar mode' })).toBeTruthy();
});
it('preserves scoped writes for every appearance and layout control without touching another device', async () => {
  await open();
  for (const [group, option] of [['Theme', 'OLED'], ['Accent color', 'Purple'], ['Density', 'Compact'], ['Animation feel', 'Smooth']]) {
    fireEvent.click(within(screen.getByRole('radiogroup', { name: group })).getByRole('radio', { name: option })); await saved();
  }
  fireEvent.change(screen.getByRole('slider', { name: 'UI transparency' }), { target: { value: '70' } }); await saved();
  category('Layout & previews');
  for (const [group, option] of [['Preview style', 'Floating'], ['Sidebar mode', 'Floating']]) {
    fireEvent.click(within(screen.getByRole('radiogroup', { name: group })).getByRole('radio', { name: option })); await saved();
  }
  expect(doc.local?.['test-device']).toMatchObject({ theme: 'oled', accentColor: 'purple', density: 'compact', animationMode: 'smooth', uiTransparency: 0.7, previewMode: 'modal', sidebarMode: 'floating' });
  expect(doc.local?.other).toEqual({ theme: 'dark' });
  for (const [, patch] of vi.mocked(api.patch).mock.calls) { expect(Object.keys((patch as SettingsPatch).local ?? {})).toEqual(['test-device']); }
});
it('keeps numeric edits valid and changes workspace controls with workspace-only patches', async () => {
  await open(); category('Workspace');
  fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Max open notes' })).getByRole('radio', { name: '3' })); await saved();
  fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Open behavior' })).getByRole('radio', { name: 'Replace' })); await saved();
  fireEvent.click(screen.getByRole('switch', { name: 'Focus mode' })); await saved();
  const number = screen.getByRole('spinbutton', { name: 'Autosave delay value' });
  fireEvent.change(number, { target: { value: '1100' } }); fireEvent.keyDown(number, { key: 'Enter' });
  expect(screen.getByRole('alert').textContent).toContain('0–1000'); expect(doc.workspace?.autosaveDelay ?? 0).toBe(0);
  fireEvent.change(number, { target: { value: '500' } }); fireEvent.keyDown(number, { key: 'Enter', isComposing: true });
  expect(doc.workspace?.autosaveDelay ?? 0).toBe(0);
  fireEvent.keyDown(number, { key: 'Enter' }); await saved();
  expect(doc.workspace).toMatchObject({ maxOpenNotes: 3, openBehavior: 'replace', focusMode: true, autosaveDelay: 500 });
  for (const [, patch] of vi.mocked(api.patch).mock.calls) expect(Object.keys(patch as object)).toEqual(['workspace']);
});
it('retains a failed setting and retries the same scoped change', async () => {
  await open(); vi.mocked(api.patch).mockRejectedValueOnce(new Error('Offline'));
  fireEvent.click(screen.getByRole('radio', { name: 'OLED' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy());
  expect(screen.getByRole('radio', { name: 'OLED' }).getAttribute('aria-checked')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Retry' })); await saved();
  expect(doc.local?.['test-device']?.theme).toBe('oled');
});
it('confirms device reset, traps confirmation focus and leaves workspace and other devices intact', async () => {
  await open(); fireEvent.click(screen.getByRole('radio', { name: 'OLED' })); await saved();
  fireEvent.click(screen.getByRole('button', { name: 'Settings options' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Reset device preferences' }));
  expect(screen.getByRole('alertdialog').textContent).toContain('Other devices');
  const reset = within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Reset' });
  reset.focus(); fireEvent.keyDown(reset, { key: 'Tab' }); expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
  fireEvent.keyDown(window, { key: 'Escape' }); await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  expect(doc.local?.['test-device']?.theme).toBe('oled');
  fireEvent.click(screen.getByRole('button', { name: 'Settings options' })); fireEvent.click(screen.getByRole('menuitem', { name: 'Reset device preferences' }));
  fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Reset' })); await saved();
  expect(doc.local?.['test-device']?.theme).toBe('os'); expect(doc.local?.other).toEqual({ theme: 'dark' }); expect(doc.workspace?.maxOpenNotes).toBe(2);
});
it('records platform-only shortcuts, reports conflicts and Escape cancels recording before closing', async () => {
  await open(); category('Keyboard');
  const binding = screen.getByRole('button', { name: 'Change Toggle sidebar shortcut' });
  fireEvent.click(binding); fireEvent.keyDown(binding, { key: 'k', ctrlKey: true });
  expect(screen.getByText(/already uses that shortcut/i)).toBeTruthy();
  fireEvent.keyDown(window, { key: 'Escape' }); expect(screen.getByRole('dialog')).toBeTruthy(); expect(binding.getAttribute('aria-pressed')).toBe('false');
  fireEvent.click(binding); fireEvent.keyDown(binding, { key: 'y', ctrlKey: true, altKey: true }); await saved();
  expect(doc.keybindings?.toggleSidebar?.windows).toBe('Mod+Alt+Y');
  expect(doc.keybindings?.toggleSidebar?.mac).toBe('Mod+Alt+Z');
  fireEvent.keyDown(window, { key: 'Escape' }); await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await waitFor(() => expect(document.activeElement).toBe(screen.getByText('Open settings')));
});
it('uses radio arrow keys and wraps dialog Tab while restoring focus after click dismissal', async () => {
  await open(); const os = screen.getByRole('radio', { name: 'OS' }); os.focus(); fireEvent.keyDown(os, { key: 'ArrowRight' }); await saved();
  expect(screen.getByRole('radio', { name: 'Light' }).getAttribute('aria-checked')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Settings options' })); fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.queryByRole('menu')).toBeNull(); expect(screen.getByRole('dialog')).toBeTruthy();
  const last = screen.getByRole('spinbutton', { name: 'UI transparency value' }); last.focus(); fireEvent.keyDown(last, { key: 'Tab' });
  expect(document.activeElement).toBe(screen.getByRole('textbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Close settings' }));
  await waitFor(() => expect(document.activeElement).toBe(screen.getByText('Open settings')));
});

it.each(['Reset workspace behavior', 'Reset keyboard shortcuts', 'Reset all settings'])('confirms %s and preserves its advertised boundaries', async label => {
  doc.workspace = { maxOpenNotes: 3, openBehavior: 'replace', autosaveDelay: 0, focusMode: false };
  doc.local = { other: { theme: 'dark' }, 'test-device': { theme: 'oled' } };
  doc.keybindings = { toggleSidebar: { mac: 'Mod+Alt+Z', windows: 'Mod+Alt+Y' } };
  await open();
  fireEvent.click(screen.getByRole('button', { name: 'Settings options' }));
  fireEvent.click(screen.getByRole('menuitem', { name: label }));
  expect(vi.mocked(api.patch).mock.calls.length).toBe(0);
  fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Reset' })); await saved();
  expect(doc.local?.other).toEqual({ theme: 'dark' });
  if (label === 'Reset workspace behavior') {
    expect(doc.workspace?.maxOpenNotes).toBe(2); expect(doc.local?.['test-device']?.theme).toBe('oled'); expect(doc.keybindings?.toggleSidebar?.windows).toBe('Mod+Alt+Y');
  } else if (label === 'Reset keyboard shortcuts') {
    expect(doc.keybindings?.toggleSidebar?.windows).toBe('Mod+Alt+B'); expect(doc.keybindings?.toggleSidebar?.mac).toBe('Mod+Alt+Z'); expect(doc.workspace?.maxOpenNotes).toBe(3);
  } else {
    expect(doc.workspace?.maxOpenNotes).toBe(2); expect(doc.local?.['test-device']?.theme).toBe('os'); expect(doc.keybindings?.toggleSidebar?.mac).toBe('Mod+Alt+B'); expect(doc.keybindings?.toggleSidebar?.windows).toBe('Mod+Alt+B');
  }
});
it('confirms a single shortcut reset without resetting the rest of the keyboard', async () => {
  doc.keybindings = { toggleSidebar: { windows: 'Mod+Alt+Y', mac: 'Mod+Alt+Z' }, commandPalette: { windows: 'Mod+Alt+K' } };
  await open(); category('Keyboard');
  fireEvent.click(screen.getByRole('button', { name: 'Reset Toggle sidebar shortcut' }));
  fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Reset' })); await saved();
  expect(doc.keybindings?.toggleSidebar).toEqual({ windows: 'Mod+Alt+B', mac: 'Mod+Alt+Z' });
  expect(doc.keybindings?.commandPalette?.windows).toBe('Mod+Alt+K');
});
