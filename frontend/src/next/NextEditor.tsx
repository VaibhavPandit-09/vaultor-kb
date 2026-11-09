import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { EditorContent, ReactNodeViewRenderer, useEditor } from '@tiptap/react';
import {Extension,type JSONContent} from '@tiptap/core';
import {Plugin} from '@tiptap/pm/state';
import Link from '@tiptap/extension-link';
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
const SourceLink=Link.extend({addAttributes(){return {...this.parent?.(),title:{default:null}};}}).configure({openOnClick:false});
const readonlyGate=(locked:{current:boolean})=>Extension.create({name:'nextReadonlyGate',addProseMirrorPlugins(){return [new Plugin({filterTransaction:transaction=>!transaction.docChanged||!locked.current||isSharedTransaction(transaction)})];}});
const lowlight = createLowlight(common);
export default function NextEditor({ note, documents, changed, locked, pane, focusWhenReady, focusHandled, leaveFocus, followLink }: { note: Note; documents: SharedNoteDocuments; changed: (capture: () => JSONContent) => void; locked: boolean; pane: number; focusWhenReady?:boolean; focusHandled?:()=>void; leaveFocus?:()=>void; followLink?:(href:string)=>void }) {
  const lockedRef=useRef(locked);useLayoutEffect(()=>{lockedRef.current=locked;},[locked]);
  const callback = useRef(changed);
  useLayoutEffect(() => { callback.current = changed; }, [changed]);
  const invalid = useRef(false);
  const [contentError, setContentError] = useState(false);
  const [focused, setFocused] = useState(false);
  const editor = useEditor({
    enableContentCheck: true,
    onContentError: ({ editor }) => { invalid.current = true; setContentError(true); editor.setEditable(false, false); },
    onBeforeCreate: ({ editor }) => documents.prepare(editor),
    // eslint-disable-next-line react-hooks/refs -- the plugin reads this ref only in transaction dispatch, never during render.
    extensions: [readonlyGate(lockedRef),SourceLink,StarterKit.configure({ codeBlock: false, undoRedo: false, heading: { levels: [1, 2, 3, 4, 5, 6] }, link: false }),
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
  useEffect(()=>{if(editor&&!locked&&focusWhenReady){editor.commands.focus(undefined,{scrollIntoView:false});focusHandled?.();}},[editor,locked,focusWhenReady,focusHandled]);
  useEscapeLayer({ id: `next-editor-${pane}`, active: focused, priority: ESCAPE_PRIORITIES.editorFocus, restoreFocusOnEscape: false, close: () => {editor?.commands.blur();leaveFocus?.();} });
  const navigate=(href:string)=>{if(!href.startsWith('#')){followLink?.(href);return;}let anchor=href.slice(1);try{anchor=decodeURIComponent(anchor);}catch{/* Keep a malformed fragment literal. */}const slug=(value:string)=>value.toLowerCase().trim().replace(/[^\p{Letter}\p{Number}\s-]/gu,'').replace(/\s+/g,'-');const heading=[...(editor?.view.dom.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6')??[])].find(node=>node.id===anchor||slug(node.textContent??'')===anchor);heading?.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});};
  return <div className="editor-workspace" onClickCapture={event=>{const link=(event.target as Element).closest<HTMLAnchorElement>('a[href]');if(followLink&&link&&(event.ctrlKey||!editor?.isEditable)){event.preventDefault();event.stopPropagation();navigate(link.getAttribute('href')!);}}} onKeyDown={event=>{if(followLink&&event.ctrlKey&&event.key==='Enter'){const href=editor?.getAttributes('link').href;if(typeof href==='string'){event.preventDefault();navigate(href);}}}}>{contentError && <p role="alert">Unsupported note content. Editing is disabled; original JSON is retained.</p>}<EditorContent editor={editor} /></div>;
}
