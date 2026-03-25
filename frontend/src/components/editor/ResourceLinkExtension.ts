import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import ResourceLinkView from './ResourceLinkView';

export interface ResourceLinkState {
  active: boolean;
  query: string;
  range: { from: number; to: number } | null;
  selectedIndex: number;
}

const INITIAL_STATE: ResourceLinkState = {
  active: false,
  query: '',
  range: null,
  selectedIndex: 0,
};

export const resourceLinkPluginKey = new PluginKey('resourceLinkSuggest');

export function activateResourceLinkSuggestion(
  view: EditorView,
  range: { from: number; to: number },
  query = '',
) {
  const tr = view.state.tr;
  tr.setMeta(resourceLinkPluginKey, { active: true, query, range, selectedIndex: 0 });
  view.dispatch(tr);
}

export const ResourceLinkExtension = Node.create({
  name: 'resourceLink',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      resourceId: { default: null },
      label: { default: null },
      type: { default: 'note' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-resource-id]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-resource-id': HTMLAttributes.resourceId, class: 'resource-link' }), HTMLAttributes.label || 'Link'];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResourceLinkView);
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: resourceLinkPluginKey,
        state: {
          init(): ResourceLinkState {
            return { ...INITIAL_STATE };
          },
          apply(tr, prev, _oldState, newState): ResourceLinkState {
            const meta = tr.getMeta(resourceLinkPluginKey);
            if (meta) {
              return { ...prev, ...meta };
            }

            if (!prev.active) return prev;

            const { from } = newState.selection;
            const resolved = newState.doc.resolve(from);
            const textBefore = resolved.parent.textContent.slice(0, resolved.parentOffset);
            
            // Look for `[[` followed by text
            const match = /\[\[([^\]]*)$/.exec(textBefore);

            if (!match) {
              return { ...INITIAL_STATE };
            }

            const query = match[1];
            const absoluteFrom = resolved.start() + match.index;
            const absoluteTo = resolved.start() + resolved.parentOffset;

            return {
              ...prev,
              query,
              range: { from: absoluteFrom, to: absoluteTo },
            };
          },
        },
        props: {
          handleKeyDown(view, event) {
            const state = resourceLinkPluginKey.getState(view.state) as ResourceLinkState | undefined;

            if (event.key === '[' && !state?.active) {
              const { from } = view.state.selection;
              const resolved = view.state.doc.resolve(from);
              const textBefore = resolved.parent.textContent.slice(0, resolved.parentOffset);
              
              if (textBefore.endsWith('[')) {
                setTimeout(() => {
                  activateResourceLinkSuggestion(view, { from: from - 1, to: from + 1 });
                }, 0);
              }
              return false;
            }

            if (!state?.active) return false;

            if (event.key === 'ArrowDown') {
              event.preventDefault();
              if ((window as any).__navigateResourceLink) {
                (window as any).__navigateResourceLink('down');
              }
              return true;
            }

            if (event.key === 'ArrowUp') {
              event.preventDefault();
              if ((window as any).__navigateResourceLink) {
                (window as any).__navigateResourceLink('up');
              }
              return true;
            }

            if (event.key === 'Enter') {
              event.preventDefault();
              if ((window as any).__executeResourceLink) {
                (window as any).__executeResourceLink(view);
              }
              return true;
            }

            if (event.key === 'Escape') {
              event.preventDefault();
              const tr = view.state.tr;
              tr.setMeta(resourceLinkPluginKey, { ...INITIAL_STATE });
              view.dispatch(tr);
              return true;
            }

            return false;
          },
        },
      }),
    ];
  },
});
