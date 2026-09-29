import type { Editor } from '@tiptap/core';
export type LinkedResourceIntent = { resourceId: string; sourcePaneId: string; destination: 'here' | 'new'; intent: 'link' };
const handlers = new WeakMap<Editor, (id: string, newPane: boolean) => void>();
export function registerResourceLinkNavigation(editor: Editor, handler: (id: string, newPane: boolean) => void) {
  handlers.set(editor, handler); return () => { handlers.delete(editor); };
}
export function openResourceLink(editor: Editor, id: string, newPane: boolean) { handlers.get(editor)?.(id, newPane); }

const navigators = new WeakMap<object, (direction: 'up' | 'down') => void>();
export function registerResourceLinkNavigator(view: object, handler: (direction: 'up' | 'down') => void) { navigators.set(view, handler); return () => { navigators.delete(view); }; }
export function navigateResourceLink(view: object, direction: 'up' | 'down') { navigators.get(view)?.(direction); }
