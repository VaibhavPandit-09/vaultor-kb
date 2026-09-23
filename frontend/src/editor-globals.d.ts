import type { Editor } from '@tiptap/react';
declare global {
  interface Window {
    __vaultor_editor?: Editor | null;
    __openResource?: (id: string, type?: string, label?: string) => void;
    __navigateResourceLink?: (direction: 'up' | 'down') => void;
    __resourceLinkExecutors?: Map<object, () => void>;
    __executeResourceLink?: (view?: unknown) => void;
    __executeSlashCommand?: (view?: unknown) => void;
    __slashCommandExecutors?: Map<object, () => void>;
  }
}
