import ResourceLinkChip from '../components/editor/ResourceLinkChip';
import {resourceKind} from '../lib/resourceKinds';
import {openResourceLink,registerResourceLinkNavigation} from '../lib/resourceLinkNavigation';
import { useEffect, useLayoutEffect, useRef, useState, useMemo } from 'react';
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor,type NodeViewProps } from '@tiptap/react';
import {Extension,type Editor,type JSONContent} from '@tiptap/core';
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
import EditorControls from './EditorControls';
import {NextImage} from './MediaView';
import {native,insertImage,pasteLinks} from './media';
import {WorkspaceTable} from '../components/editor/WorkspaceTable';
import {TableWorkspace,handleTablePaste} from '../components/editor/TableWorkspace';
import {SlashCommandExtension} from '../components/editor/SlashCommandExtension';
import {ResourceLinkExtension} from '../components/editor/ResourceLinkDefinition';
import type { Note } from './client';
const SourceLink=Link.extend({addAttributes(){return {...this.parent?.(),title:{default:null}};}}).configure({openOnClick:false});
const readonlyGate=(locked:{current:boolean})=>Extension.create({name:'nextReadonlyGate',addProseMirrorPlugins(){return [new Plugin({filterTransaction:transaction=>!transaction.docChanged||!locked.current||isSharedTransaction(transaction)})];}});
function NextResourceLinkView({node,editor}:NodeViewProps){const kind=resourceKind(node.attrs.type??'note');return <NodeViewWrapper as="span" className="resource-link-node" contentEditable={false}><ResourceLinkChip label={node.attrs.label} description={kind.label} icon={kind.icon} action={kind.action+' · Ctrl/Cmd-click for another pane'} onOpen={beside=>openResourceLink(editor,node.attrs.resourceId,beside)}/></NodeViewWrapper>;}
const writeCodeClipboard=(text:string)=>native('clipboardWrite',null,text);
function NextCodeBlockView(props:NodeViewProps){return <CodeBlockView {...props} writeClipboard={writeCodeClipboard}/>;}
const lowlight = createLowlight(common);
export default function NextEditor({ note, documents, changed, locked, pane, focusWhenReady, focusHandled, leaveFocus, followLink, openResource, openWeb, saveStatus="saved", retrySave, initialSelection,positionChanged }: { initialSelection?:{from:number;to:number};positionChanged?:(selection:{from:number;to:number})=>void;note: Note; documents: SharedNoteDocuments; changed: (capture: () => JSONContent) => void; locked: boolean; pane: number; focusWhenReady?:boolean; focusHandled?:()=>void; leaveFocus?:()=>void; followLink?:(href:string)=>void; openResource?:(id:string,beside?:boolean)=>void; openWeb?:(href:string)=>void; retrySave?:()=>void;saveStatus?:'saved'|'saving'|'failed' }) {
  const container=useRef<HTMLDivElement>(null);
  const [operationError,setOperationError]=useState('');
  const managed=!followLink;
  const lockedRef=useRef(locked);useLayoutEffect(()=>{lockedRef.current=locked;},[locked]);
  const positionCallback=useRef(positionChanged);useLayoutEffect(()=>{positionCallback.current=positionChanged;},[positionChanged]);
  const callback = useRef(changed);
  useLayoutEffect(() => { callback.current = changed; }, [changed]);
  const invalid = useRef(false);
  const [contentError, setContentError] = useState(false);
  const [focused, setFocused] = useState(false);
  // Extensions belong to this view, not to toolbar or Save-status renders.
  const extensions=useMemo(()=>[readonlyGate(lockedRef),SourceLink,StarterKit.configure({ codeBlock: false, undoRedo: false, heading: { levels: [1, 2, 3, 4, 5, 6] }, link: false }),
      CodeBlockLowlight.extend({ addNodeView: () => ReactNodeViewRenderer(NextCodeBlockView) }).configure({ lowlight }),
      Placeholder.configure({ placeholder: 'Start writing… Markdown shortcuts work here.' }),
      ...(managed?[WorkspaceTable.configure({resizable:true}),TableWorkspace,SlashCommandExtension,NextImage,ResourceLinkExtension.extend({addNodeView(){return ReactNodeViewRenderer(NextResourceLinkView);}})]:[Table.configure({resizable:true})]), TableRow, TableCell, TableHeader, TaskList, TaskItem.configure({ nested: true }), Highlight, SharedHistory, SymbolSystemExtension],[managed]);
  const editor:Editor|null = useEditor({
    enableContentCheck: true,
    onContentError: ({ editor }) => { invalid.current = true; setContentError(true); editor.setEditable(false, false); },
    onBeforeCreate: ({ editor }) => documents.prepare(editor,managed?'next-managed':'next-linked'),
    extensions,
    shouldRerenderOnTransaction:false,
    content: note.content,
    editorProps: {
      attributes: { class: 'tiptap outline-none min-h-[50vh]', 'aria-label': `Note body ${pane + 1}` },
      handleDrop: (_view, event) => Boolean(event.dataTransfer?.files.length),
      handlePaste: (view,event) => {if(!managed)return Boolean(event.clipboardData?.files.length);const file=event.clipboardData?.files[0];if(file){event.preventDefault();if(file.type.startsWith('image/'))void insertImage(editor!,file).catch(e=>setOperationError(String(e)));else setOperationError('Use Import files for managed attachments');return true;}return pasteLinks(editor!,event)||handleTablePaste(view,event);},
    },
    onUpdate: ({ editor, transaction }) => { if (transaction.docChanged && !invalid.current && !isSharedTransaction(transaction)) callback.current(() => editor.getJSON()); },
    onSelectionUpdate:({editor})=>positionCallback.current?.({from:editor.state.selection.from,to:editor.state.selection.to}),
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
  }, [note.id]);
  useEffect(()=>{const handler=(event:Event)=>setOperationError(String((event as CustomEvent).detail));if(!editor)return;editor.view.dom.addEventListener('vaultor-next-editor-error',handler);return()=>editor.view.dom.removeEventListener('vaultor-next-editor-error',handler);},[editor]);
  useEffect(()=>{if(!editor||!managed)return;return registerResourceLinkNavigation(editor,(id,beside)=>openResource?.(id,beside));},[editor,managed,openResource]);
  useEffect(() => { if (!editor) return; return documents.attach(note.id, editor); }, [editor, documents, note.id]);
  useEffect(()=>{if(!editor||!initialSelection)return;const max=editor.state.doc.content.size;editor.commands.setTextSelection({from:Math.max(0,Math.min(max,initialSelection.from)),to:Math.max(0,Math.min(max,initialSelection.to))});
  // Restore once per mounted editor; later selection updates belong to the user.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[editor]);
  useEffect(() => { editor?.setEditable(!locked && !invalid.current, false); }, [editor, locked]);
  useEffect(()=>{if(editor&&!locked&&focusWhenReady){editor.commands.focus(undefined,{scrollIntoView:false});focusHandled?.();}},[editor,locked,focusWhenReady,focusHandled]);
  useEscapeLayer({ id: `next-editor-${pane}`, active: focused, priority: ESCAPE_PRIORITIES.editorFocus, restoreFocusOnEscape: false, close: () => {editor?.commands.blur();leaveFocus?.();} });
  const navigate=(href:string)=>{if(!href.startsWith('#')){if(followLink)followLink(href);else openWeb?.(href);return;}let anchor=href.slice(1);try{anchor=decodeURIComponent(anchor);}catch{/* Keep a malformed fragment literal. */}const slug=(value:string)=>value.toLowerCase().trim().replace(/[^\p{Letter}\p{Number}\s-]/gu,'').replace(/\s+/g,'-');const heading=[...(editor?.view.dom.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6')??[])].find(node=>node.id===anchor||slug(node.textContent??'')===anchor);heading?.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});};
  return <div ref={container} className="editor-workspace" onClickCapture={event=>{const resource=(event.target as Element).closest<HTMLElement>('[data-resource-id]');if(managed&&resource&&(event.ctrlKey||!editor?.isEditable)){event.preventDefault();openResource?.(resource.dataset.resourceId!,event.shiftKey);return;}const link=(event.target as Element).closest<HTMLAnchorElement>('a[href]');if(link&&(event.ctrlKey||!editor?.isEditable)){event.preventDefault();event.stopPropagation();navigate(link.getAttribute('href')!);}}} onKeyDown={event=>{const resource=(event.target as Element).closest<HTMLElement>('[data-resource-id]');if(managed&&resource&&event.key==='Enter'){event.preventDefault();openResource?.(resource.dataset.resourceId!,event.shiftKey);return;}if(event.ctrlKey&&event.key==='Enter'){const href=editor?.getAttributes('link').href;if(typeof href==='string'){event.preventDefault();navigate(href);}}}}>{contentError && <p role="alert">Unsupported note content. Editing is disabled; original JSON is retained.</p>}{editor&&<EditorControls managed={managed} retrySave={retrySave} saveStatus={saveStatus} editor={editor} container={container} noteId={note.id} openResource={openResource}/>} {operationError&&<p role="alert">{operationError}</p>}<EditorContent editor={editor} /></div>;
}
