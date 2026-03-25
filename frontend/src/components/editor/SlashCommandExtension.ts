import { Extension } from '@tiptap/react';
import { Plugin, PluginKey } from '@tiptap/pm/state';

export interface SlashCommandState {
  active: boolean;
  query: string;
  range: { from: number; to: number } | null;
  selectedIndex: number;
  filteredCount: number;
  executeSelection: boolean;
  navigateDirection: 'up' | 'down' | null;
}

const INITIAL_STATE: SlashCommandState = {
  active: false,
  query: '',
  range: null,
  selectedIndex: 0,
  filteredCount: 0,
  executeSelection: false,
  navigateDirection: null,
};

const slashCommandPluginKey = new PluginKey('slashCommand');

export const SlashCommandExtension = Extension.create({
  name: 'slashCommand',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: slashCommandPluginKey,

        state: {
          init(): SlashCommandState {
            return { ...INITIAL_STATE };
          },

          apply(tr, prev, _oldState, newState): SlashCommandState {
            const meta = tr.getMeta(slashCommandPluginKey);
            if (meta) {
              return { ...prev, ...meta, executeSelection: meta.executeSelection ?? false, navigateDirection: meta.navigateDirection ?? null };
            }

            if (!prev.active) return prev;

            // Track the query as user types after /
            const { from } = newState.selection;
            const resolved = newState.doc.resolve(from);
            const textBefore = resolved.parent.textContent.slice(0, resolved.parentOffset);
            const slashIndex = textBefore.lastIndexOf('/');

            if (slashIndex === -1) {
              return { ...INITIAL_STATE };
            }

            const query = textBefore.slice(slashIndex + 1);
            const absoluteFrom = resolved.start() + slashIndex;
            const absoluteTo = resolved.start() + resolved.parentOffset;

            return {
              ...prev,
              query,
              range: { from: absoluteFrom, to: absoluteTo },
              executeSelection: false,
              navigateDirection: null,
            };
          },
        },

        props: {
          handleKeyDown(view, event) {
            const state = slashCommandPluginKey.getState(view.state) as SlashCommandState | undefined;

            // Activate slash menu on /
            if (event.key === '/') {
              const { from } = view.state.selection;
              setTimeout(() => {
                const tr = view.state.tr;
                tr.setMeta(slashCommandPluginKey, {
                  active: true,
                  query: '',
                  range: { from, to: from + 1 },
                  selectedIndex: 0,
                  filteredCount: 0,
                });
                view.dispatch(tr);
              }, 0);
              return false; // Let the / character be typed
            }

            if (!state?.active) return false;

            // When slash menu is active, intercept navigation keys
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              const tr = view.state.tr;
              tr.setMeta(slashCommandPluginKey, {
                navigateDirection: 'down',
              });
              view.dispatch(tr);
              return true; // Consume the event
            }

            if (event.key === 'ArrowUp') {
              event.preventDefault();
              const tr = view.state.tr;
              tr.setMeta(slashCommandPluginKey, {
                navigateDirection: 'up',
              });
              view.dispatch(tr);
              return true;
            }

            if (event.key === 'Enter') {
              event.preventDefault();
              if ((window as any).__executeSlashCommand) {
                (window as any).__executeSlashCommand(view);
              }
              return true; // CRITICAL: Prevents ProseMirror from creating a new line
            }

            return false;
          },
        },
      }),
    ];
  },
});

export { slashCommandPluginKey };
