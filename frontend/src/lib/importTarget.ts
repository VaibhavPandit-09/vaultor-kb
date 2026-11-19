import type { Editor, JSONContent, Range } from '@tiptap/core';
import type { Transaction } from '@tiptap/pm/state';
import { closeHistory } from '@tiptap/pm/history';
import type { Node as ProseNode } from '@tiptap/pm/model';

/** A pending import owns its editor and maps its anchor through unrelated edits. */
export function captureImportTarget(editor: Editor, initial: Range) {
  let range = { from:initial.from,to:initial.to };
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
    if (!valid || editor.isDestroyed || !editor.isInitialized || !editor.isEditable) throw new Error('The original insertion location changed or its note was closed. Cancel and start the import again.');
  };
  return {
    editor, dispose, assertValid,
    replaceNode(expected: ProseNode, attrs: Record<string, unknown>) {
      assertValid();
      const {state} = editor;
      if (state.doc.nodeAt(range.from) !== expected) throw new Error('The selected placement changed. Select it again.');
      editor.view.dispatch(closeHistory(state.tr.setNodeMarkup(range.from, undefined, {...expected.attrs, ...attrs})));
      dispose();
      editor.view.dispatch(closeHistory(editor.state.tr));
    },
    insert(content: JSONContent[], maxDocumentBytes?: number) {
      assertValid();
      const chain = editor.chain().command(({tr})=>{closeHistory(tr);return true;});
      chain.insertContentAt(range, content, {errorOnInvalidContent:true});
      if (maxDocumentBytes !== undefined) chain.command(({tr})=>{
        if (new TextEncoder().encode(JSON.stringify(tr.doc.toJSON())).length > maxDocumentBytes) {
          throw new Error('The inserted content would exceed the note size limit.');
        }
        return true;
      });
      if (!chain.run()) throw new Error('This content cannot be inserted here.');
      dispose();
      editor.view.dispatch(closeHistory(editor.state.tr));
    },
  };
}
export type ImportTarget = ReturnType<typeof captureImportTarget>;
