export const isMac = navigator.platform.toUpperCase().includes('MAC');

export interface ShortcutItem {
  description: string;
  keys: string[];
}

export interface ShortcutCategory {
  category: string;
  items: ShortcutItem[];
}

const modKey = isMac ? 'Cmd' : 'Ctrl';

export const shortcuts: ShortcutCategory[] = [
  {
    category: 'Navigation',
    items: [
      { description: 'Search resources', keys: [modKey, 'K'] },
      { description: 'Switch note (next)', keys: [modKey, 'Right'] },
      { description: 'Switch note (previous)', keys: [modKey, 'Left'] },
      { description: 'Close active note', keys: [modKey, 'Backspace'] },
      { description: 'Go back', keys: isMac ? ['Cmd', '['] : ['Alt', 'Left'] },
      { description: 'Go forward', keys: isMac ? ['Cmd', ']'] : ['Alt', 'Right'] },
      { description: 'Toggle sidebar', keys: [modKey, 'B'] },
      { description: 'Open shortcuts', keys: [modKey, '/'] },
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
