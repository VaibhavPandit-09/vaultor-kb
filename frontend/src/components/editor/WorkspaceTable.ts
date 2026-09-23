import { Table } from '@tiptap/extension-table';
import { Plugin } from '@tiptap/pm/state';
import { TableMap } from '@tiptap/pm/tables';

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
          const duplicate = !node.attrs.tableId || seen.has(node.attrs.tableId);
          const tableId = duplicate ? crypto.randomUUID() : node.attrs.tableId;
          seen.add(tableId);
          const existing: string[] = duplicate ? [] : (Array.isArray(node.attrs.columnIds) ? node.attrs.columnIds : []);
          const used = new Set<string>();
          const columnIds = Array.from({ length: width }, (_, i) => {
            const id = typeof existing[i] === 'string' && !used.has(existing[i]) ? existing[i] : crypto.randomUUID();
            used.add(id); return id;
          });
          if (duplicate || JSON.stringify(columnIds) !== JSON.stringify(node.attrs.columnIds)) {
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, tableId, columnIds });
          }
        });
        return tr.docChanged ? tr : null;
      },
    })];
  },
}).configure({ resizable: true, cellMinWidth: 80 });
