import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

export const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC');

export type ShortcutAction =
  | 'commandPalette'
  | 'switchNoteNext'
  | 'switchNotePrevious'
  | 'closeActiveNote'
  | 'toggleSidebar'
  | 'openShortcuts';

export type ShortcutBindingMap = Record<ShortcutAction, string>;

export interface ShortcutItem {
  description: string;
  keys: string[];
}

export interface ShortcutCategory {
  category: string;
  items: ShortcutItem[];
}

interface ShortcutActionMeta {
  action: ShortcutAction;
  category: string;
  description: string;
  defaultShortcut: string;
}

const SHORTCUT_ORDER = ['Mod', 'Alt', 'Shift'] as const;
const modKey = isMac ? 'Cmd' : 'Ctrl';

const shortcutActionMeta: ShortcutActionMeta[] = [
  {
    action: 'commandPalette',
    category: 'Navigation',
    description: 'Search resources',
    defaultShortcut: 'Mod+K',
  },
  {
    action: 'switchNoteNext',
    category: 'Navigation',
    description: 'Switch note (next)',
    defaultShortcut: 'Mod+ArrowRight',
  },
  {
    action: 'switchNotePrevious',
    category: 'Navigation',
    description: 'Switch note (previous)',
    defaultShortcut: 'Mod+ArrowLeft',
  },
  {
    action: 'closeActiveNote',
    category: 'Navigation',
    description: 'Close active note',
    defaultShortcut: 'Mod+Backspace',
  },
  {
    action: 'toggleSidebar',
    category: 'Navigation',
    description: 'Toggle sidebar',
    defaultShortcut: 'Mod+B',
  },
  {
    action: 'openShortcuts',
    category: 'Navigation',
    description: 'Open shortcuts',
    defaultShortcut: 'Mod+Slash',
  },
];

const staticShortcutCategories: ShortcutCategory[] = [
  {
    category: 'Navigation',
    items: [
      { description: 'Go back', keys: isMac ? ['Cmd', '['] : ['Alt', 'Left'] },
      { description: 'Go forward', keys: isMac ? ['Cmd', ']'] : ['Alt', 'Right'] },
    ],
  },
  {
    category: 'Editor',
    items: [
      { description: 'Open slash menu', keys: ['/'] },
      { description: 'Open link picker', keys: ['[', '['] },
      { description: 'Navigate menus', keys: ['Up', 'Down'] },
      { description: 'Confirm selection', keys: ['Enter'] },
      { description: 'Close active modal/menu', keys: ['Esc'] },
    ],
  },
];

export const DEFAULT_SHORTCUTS: ShortcutBindingMap = shortcutActionMeta.reduce((bindings, item) => {
  bindings[item.action] = item.defaultShortcut;
  return bindings;
}, {} as ShortcutBindingMap);

export const RESERVED_SHORTCUTS = ['Mod+W', 'Mod+Shift+W', 'Mod+T'];

export const SHORTCUT_ACTIONS = shortcutActionMeta;

export function resolveShortcutBindings(customShortcuts: Record<string, string>): ShortcutBindingMap {
  return shortcutActionMeta.reduce((bindings, item) => {
    bindings[item.action] = normalizeShortcut(customShortcuts[item.action] || item.defaultShortcut);
    return bindings;
  }, {} as ShortcutBindingMap);
}

export function normalizeShortcut(shortcut: string): string {
  const rawParts = shortcut.split('+').map((part) => part.trim()).filter(Boolean);
  const modifierSet = new Set<string>();
  let keyPart: string | null = null;

  rawParts.forEach((part) => {
    const normalizedModifier = normalizeModifierToken(part);
    if (normalizedModifier) {
      modifierSet.add(normalizedModifier);
      return;
    }

    const normalizedKey = normalizeKeyToken(part);
    if (normalizedKey) {
      keyPart = normalizedKey;
    }
  });

  if (!keyPart) {
    return '';
  }

  const orderedModifiers = SHORTCUT_ORDER.filter((modifier) => modifierSet.has(modifier));
  return [...orderedModifiers, keyPart].join('+');
}

export function shortcutFromKeyboardEvent(event: KeyboardEvent | ReactKeyboardEvent<HTMLElement>): string | null {
  const keyPart = normalizeKeyToken(event.key);
  if (!keyPart || ['Meta', 'Control', 'Shift', 'Alt'].includes(keyPart)) {
    return null;
  }

  const parts: string[] = [];
  if (isMac ? event.metaKey : event.ctrlKey) {
    parts.push('Mod');
  }
  if (event.altKey) {
    parts.push('Alt');
  }
  if (event.shiftKey) {
    parts.push('Shift');
  }
  parts.push(keyPart);

  return normalizeShortcut(parts.join('+'));
}

export function shortcutMatchesEvent(
  shortcut: string,
  event: KeyboardEvent | ReactKeyboardEvent<HTMLElement>,
): boolean {
  const normalized = normalizeShortcut(shortcut);
  if (!normalized) {
    return false;
  }

  const parts = normalized.split('+');
  const keyPart = parts[parts.length - 1];
  const requiresMod = parts.includes('Mod');
  const requiresAlt = parts.includes('Alt');
  const requiresShift = parts.includes('Shift');

  if (requiresMod !== (isMac ? event.metaKey : event.ctrlKey)) {
    return false;
  }

  if (requiresAlt !== event.altKey) {
    return false;
  }

  if (requiresShift !== event.shiftKey) {
    return false;
  }

  if (isMac && event.ctrlKey) {
    return false;
  }

  if (!isMac && event.metaKey) {
    return false;
  }

  return normalizeKeyToken(event.key) === keyPart;
}

export function formatShortcutKeys(shortcut: string): string[] {
  return normalizeShortcut(shortcut)
    .split('+')
    .filter(Boolean)
    .map((part) => {
      if (part === 'Mod') {
        return modKey;
      }

      if (part === 'ArrowRight') {
        return 'Right';
      }

      if (part === 'ArrowLeft') {
        return 'Left';
      }

      if (part === 'BracketLeft') {
        return '[';
      }

      if (part === 'BracketRight') {
        return ']';
      }

      if (part === 'Slash') {
        return '/';
      }

      return part;
    });
}

export function getShortcutCategories(bindings: ShortcutBindingMap): ShortcutCategory[] {
  const grouped = shortcutActionMeta.reduce<Record<string, ShortcutItem[]>>((accumulator, item) => {
    const bucket = accumulator[item.category] ?? [];
    bucket.push({
      description: item.description,
      keys: formatShortcutKeys(bindings[item.action]),
    });
    accumulator[item.category] = bucket;
    return accumulator;
  }, {});

  const dynamicCategories = Object.entries(grouped).map(([category, items]) => ({ category, items }));
  return [...dynamicCategories, ...staticShortcutCategories];
}

export function validateShortcutBinding(
  action: ShortcutAction,
  shortcut: string,
  bindings: ShortcutBindingMap,
): string | null {
  const normalized = normalizeShortcut(shortcut);
  if (!normalized) {
    return 'Press a complete shortcut.';
  }

  if (!normalized.includes('Mod')) {
    return 'Use Cmd/Ctrl with each app shortcut.';
  }

  if (RESERVED_SHORTCUTS.includes(normalized)) {
    return 'That shortcut is reserved by the browser.';
  }

  const duplicateAction = (Object.entries(bindings) as [ShortcutAction, string][])
    .find(([candidateAction, candidateShortcut]) => (
      candidateAction !== action && normalizeShortcut(candidateShortcut) === normalized
    ));

  if (duplicateAction) {
    const actionMeta = shortcutActionMeta.find((item) => item.action === duplicateAction[0]);
    return `${actionMeta?.description || 'Another action'} already uses that shortcut.`;
  }

  return null;
}

function normalizeModifierToken(token: string): 'Mod' | 'Alt' | 'Shift' | null {
  const normalized = token.trim().toLowerCase();
  if (normalized === 'mod' || normalized === 'cmd' || normalized === 'ctrl' || normalized === 'control' || normalized === 'meta') {
    return 'Mod';
  }
  if (normalized === 'alt' || normalized === 'option') {
    return 'Alt';
  }
  if (normalized === 'shift') {
    return 'Shift';
  }
  return null;
}

function normalizeKeyToken(token: string): string | null {
  const normalized = token.trim();
  const lowered = normalized.toLowerCase();

  if (!normalized) {
    return null;
  }

  if (lowered === 'backspace') {
    return 'Backspace';
  }
  if (lowered === 'arrowright' || lowered === 'right') {
    return 'ArrowRight';
  }
  if (lowered === 'arrowleft' || lowered === 'left') {
    return 'ArrowLeft';
  }
  if (lowered === 'arrowup' || lowered === 'up') {
    return 'ArrowUp';
  }
  if (lowered === 'arrowdown' || lowered === 'down') {
    return 'ArrowDown';
  }
  if (lowered === 'enter' || lowered === 'return') {
    return 'Enter';
  }
  if (lowered === 'escape' || lowered === 'esc') {
    return 'Escape';
  }
  if (lowered === '/' || lowered === '?' || lowered === 'slash') {
    return 'Slash';
  }
  if (lowered === '[' || lowered === 'bracketleft') {
    return 'BracketLeft';
  }
  if (lowered === ']' || lowered === 'bracketright') {
    return 'BracketRight';
  }
  if (lowered === 'meta') {
    return 'Meta';
  }
  if (lowered === 'control' || lowered === 'ctrl') {
    return 'Control';
  }
  if (lowered === 'shift') {
    return 'Shift';
  }
  if (lowered === 'alt' || lowered === 'option') {
    return 'Alt';
  }

  if (normalized.length === 1) {
    return normalized.toUpperCase();
  }

  return normalized;
}
