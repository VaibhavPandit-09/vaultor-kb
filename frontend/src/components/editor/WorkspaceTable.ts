import { Table } from '@tiptap/extension-table';
import { Plugin } from '@tiptap/pm/state';
import { TableMap } from '@tiptap/pm/tables';
import type { JSONContent } from '@tiptap/core';
import type { Attrs, Schema } from '@tiptap/pm/model';

function tableIdentity(attrs: Attrs, width: number, seen: Set<string>) {
  const duplicate = !attrs.tableId || seen.has(attrs.tableId);
  const tableId = duplicate ? crypto.randomUUID() : attrs.tableId;
  seen.add(tableId);
  const existing: string[] = duplicate ? [] : (Array.isArray(attrs.columnIds) ? attrs.columnIds : []);
  const used = new Set<string>();
  const columnIds = Array.from({ length: width }, (_, i) => {
    const id = typeof existing[i] === 'string' && !used.has(existing[i]) ? existing[i] : crypto.randomUUID();
    used.add(id); return id;
  });
  return duplicate || JSON.stringify(columnIds) !== JSON.stringify(attrs.columnIds) ? { ...attrs, tableId, columnIds } : attrs;
}

/** Source-adapter projections have no persisted UI identities. Seed them before
 * creating editor state, rather than appending hundreds of attribute steps to
 * the first keystroke. Never mutate the worker's authoritative projection. */
export function initializeSourceTableIdentities(doc: JSONContent, schema: Schema): JSONContent {
  const seen = new Set<string>();
  const visit = (node: JSONContent): JSONContent => {
    const attrs = node.type === 'table' ? tableIdentity(node.attrs ?? {}, TableMap.get(schema.nodeFromJSON(node)).width, seen) : node.attrs;
    const children = node.content?.map(visit);
    const changed = attrs !== node.attrs || children?.some((child, i) => child !== node.content![i]);
    return changed ? { ...node, attrs, ...(children ? { content: children } : {}) } : node;
  };
  return visit(doc);
}

export const WorkspaceTable = Table.extend({
        addAttributes() {
          return {
            ...this.parent?.(),
            tableId: { default: null, rendered: false },
            columnIds: { default: null, rendered: false },
            sourceResourceId: {
              default: null,
              parseHTML: (element) => element.getAttribute('data-source-resource-id'),
              renderHTML: (attributes) => (
                attributes.sourceResourceId
                  ? { 'data-source-resource-id': attributes.sourceResourceId }
                  : {}
              ),
            },
            sourceResourceTitle: {
              default: null,
              parseHTML: (element) => element.getAttribute('data-source-resource-title'),
              renderHTML: (attributes) => (
                attributes.sourceResourceTitle
                  ? { 'data-source-resource-title': attributes.sourceResourceTitle }
                  : {}
              ),
            },
            sourceResourceType: {
              default: null,
              parseHTML: (element) => element.getAttribute('data-source-resource-type'),
              renderHTML: (attributes) => (
                attributes.sourceResourceType
                  ? { 'data-source-resource-type': attributes.sourceResourceType }
                  : {}
              ),
            },
          };
        },

  addProseMirrorPlugins() {
    return [...(this.parent?.() ?? []), new Plugin({
      appendTransaction(transactions, _old, state) {
        if (!transactions.some(tr => tr.docChanged)) return null;
        const tr = state.tr;
        const seen = new Set<string>();
        state.doc.descendants((node, pos) => {
          if (node.type.name !== 'table') return;
          const width = TableMap.get(node).width;
          const attrs = tableIdentity(node.attrs, width, seen);
          if (attrs !== node.attrs) tr.setNodeMarkup(pos, undefined, attrs);
        });
        return tr.docChanged ? tr : null;
      },
    })];
  },
}).configure({ resizable: true, cellMinWidth: 80 });
