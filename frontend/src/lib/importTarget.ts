import type { Editor, JSONContent, Range } from '@tiptap/core';
import type { Transaction } from '@tiptap/pm/state';
import { closeHistory } from '@tiptap/pm/history';

/** A pending import owns its editor and maps its anchor through unrelated edits. */
export function captureImportTarget(editor: Editor, initial: Range) {
  let range = { ...initial };
  const expected = editor.state.doc.textBetween(range.from, range.to);
  let valid = true;
  const map = ({ transaction }: { transaction: Transaction }) => {
    if (!transaction.docChanged) return;
    const from = transaction.mapping.mapResult(range.from, 1);
    const to = transaction.mapping.mapResult(range.to, -1);
    range = { from: from.pos, to: to.pos };
    valid = valid && !from.deletedAcross && !to.deletedAcross && range.from <= range.to
      && transaction.doc.textBetween(range.from, range.to) === expected;
  };
  editor.on('transaction', map);
  const dispose = () => editor.off('transaction', map);
  const assertValid = () => {
    if (!valid || editor.isDestroyed || !editor.isInitialized) throw new Error('The original insertion location changed or its note was closed. Cancel and start the import again.');
  };
  return {
    editor, dispose, assertValid,
    insert(content: JSONContent[]) {
      assertValid();
      editor.view.dispatch(closeHistory(editor.state.tr));
      // Do not focus until after committing; focus transactions can change slash state.
      if (!editor.commands.insertContentAt(range, content, { errorOnInvalidContent: true })) throw new Error('This content cannot be inserted here.');
      dispose();
      editor.view.dispatch(closeHistory(editor.state.tr));
    },
  };
}
export type ImportTarget = ReturnType<typeof captureImportTarget>;
