import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { EditorContent, ReactNodeViewRenderer, useEditor } from '@tiptap/react';
import type { JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { createLowlight, common } from 'lowlight';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Highlight from '@tiptap/extension-highlight';
import CodeBlockView from '../components/editor/CodeBlockView';
import { SymbolSystemExtension } from '../components/editor/SymbolSystemExtension';
import { SharedHistory, SharedNoteDocuments, isSharedTransaction } from '../lib/sharedNoteDocuments';
import { useEscapeLayer, ESCAPE_PRIORITIES } from '../lib/escape/escape';
import type { Note } from './client';
const lowlight = createLowlight(common);
export default function NextEditor({ note, documents, changed, locked, pane }: { note: Note; documents: SharedNoteDocuments; changed: (capture: () => JSONContent) => void; locked: boolean; pane: number }) {
  const callback = useRef(changed);
  useLayoutEffect(() => { callback.current = changed; }, [changed]);
  const invalid = useRef(false);
  const [contentError, setContentError] = useState(false);
  const [focused, setFocused] = useState(false);
  const editor = useEditor({
    enableContentCheck: true,
    onContentError: ({ editor }) => { invalid.current = true; setContentError(true); editor.setEditable(false, false); },
    onBeforeCreate: ({ editor }) => documents.prepare(editor),
    extensions: [StarterKit.configure({ codeBlock: false, undoRedo: false, heading: { levels: [1, 2, 3] }, link: { openOnClick: false } }),
      CodeBlockLowlight.extend({ addNodeView: () => ReactNodeViewRenderer(CodeBlockView) }).configure({ lowlight }),
      Placeholder.configure({ placeholder: 'Start writing… Markdown shortcuts work here.' }),
      Table.configure({ resizable: true }), TableRow, TableCell, TableHeader, TaskList, TaskItem.configure({ nested: true }), Highlight, SharedHistory, SymbolSystemExtension],
    content: note.content,
    editorProps: {
      attributes: { class: 'tiptap outline-none min-h-[50vh]', 'aria-label': `Note body ${pane + 1}` },
      handleDrop: (_view, event) => Boolean(event.dataTransfer?.files.length),
      handlePaste: (_view, event) => Boolean(event.clipboardData?.files.length),
    },
    onUpdate: ({ editor, transaction }) => { if (transaction.docChanged && !invalid.current && !isSharedTransaction(transaction)) callback.current(() => editor.getJSON()); },
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
  }, [note.id]);
  useEffect(() => { if (!editor) return; return documents.attach(note.id, editor); }, [editor, documents, note.id]);
  useEffect(() => { editor?.setEditable(!locked && !invalid.current, false); }, [editor, locked]);
  useEscapeLayer({ id: `next-editor-${pane}`, active: focused, priority: ESCAPE_PRIORITIES.editorFocus, restoreFocusOnEscape: false, close: () => editor?.commands.blur() });
  return <div className="editor-workspace">{contentError && <p role="alert">Unsupported note content. Editing is disabled; original JSON is retained.</p>}<EditorContent editor={editor} /></div>;
}
