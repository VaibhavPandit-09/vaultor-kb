import { Extension, type Editor } from '@tiptap/core';
import { Plugin, type Transaction, type EditorState } from '@tiptap/pm/state';
import type { Schema } from '@tiptap/pm/model';
import { history, undo, redo } from '@tiptap/pm/history';

const mirror = 'vaultorSharedTransaction';
const historyState = 'vaultorSharedHistory';
const baseHistory = history();
export const SharedHistory = Extension.create({
  name: 'sharedHistory',
  addCommands() { return { undo: () => ({ state, dispatch }) => undo(state, dispatch), redo: () => ({ state, dispatch }) => redo(state, dispatch) }; },
  addKeyboardShortcuts() { return { 'Mod-z': () => this.editor.commands.undo(), 'Mod-Shift-z': () => this.editor.commands.redo(), 'Mod-y': () => this.editor.commands.redo() }; },
  addProseMirrorPlugins() {
    return [new Plugin({ ...baseHistory.spec, state: { ...baseHistory.spec.state!, apply(tr, value, old, next) {
      return tr.getMeta(historyState) ?? baseHistory.spec.state!.apply(tr, value, old, next);
    } } })];
  },
});

/** Broadcast steps synchronously; local selection/plugin state remain per view. */
export class SharedNoteDocuments {
  private schema?: Schema;
  // ProseMirror steps/history contain NodeType identities, so sibling editors must
  // use the same schema instance, selected before their initial state is created.
  prepare(editor: Editor) {
    if (!this.schema) this.schema = editor.schema;
    editor.schema = this.schema;
    editor.extensionManager.schema = this.schema;
  }
  private groups = new Map<string, Set<Editor>>();
  attach(noteId: string, editor: Editor) {
    const group = this.groups.get(noteId) ?? new Set<Editor>(); this.groups.set(noteId, group);
    const existing = group.values().next().value as Editor | undefined;
    // Normalize append-transaction plugins once before another view joins.
    if (!existing) editor.view.dispatch(editor.state.tr.setMeta('addToHistory', false));
    if (existing) {
      const tr = editor.state.tr.replaceWith(0, editor.state.doc.content.size, existing.state.doc.content).setMeta(mirror, true).setMeta(historyState, baseHistory.getState(existing.state));
      editor.view.dispatch(tr);
    }
    group.add(editor);
    const onTransaction = ({ transaction, appendedTransactions }: { transaction: Transaction; appendedTransactions?: Transaction[] }) => {
      if (transaction.getMeta(mirror)) return;
      const transactions = [transaction, ...(appendedTransactions ?? [])];
      const changed = transactions.some(tr => tr.docChanged);
      for (const sibling of group) {
        if (sibling === editor || sibling.isDestroyed) continue;
        if (!changed && baseHistory.getState(sibling.state) === baseHistory.getState(editor.state)) continue;
        const tr = sibling.state.tr;
        for (const source of transactions) for (const step of source.steps) tr.step(step);
        tr.setMeta(mirror, true).setMeta(historyState, baseHistory.getState(editor.state));
        sibling.view.dispatch(tr);
      }
    };
    editor.on('transaction', onTransaction);
    return () => { editor.off('transaction', onTransaction); group.delete(editor); if (!group.size) this.groups.delete(noteId); };
  }
}
export const isSharedTransaction = (tr: import('@tiptap/pm/state').Transaction) => Boolean(tr.getMeta(mirror));

/** Authoritative replacements (for example link rewrites) must not be undone into stale references. */
export function resetSharedHistory(tr: Transaction, state: EditorState) {
  return tr.setMeta(historyState, baseHistory.spec.state!.init({ schema: state.schema }, state)).setMeta('addToHistory', false);
}
