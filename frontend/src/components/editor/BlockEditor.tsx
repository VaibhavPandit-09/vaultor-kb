import { ManagedImage } from './ManagedImage';
import ImagePicker from './ImagePicker';
import { validateImageContent, attachImageUploads, clipboardImages, imageJobVersion, subscribeImageJobs, noteImageJobs, uploadNoteImages, retryImageJob, removeImageJob, insertImageJob } from '../../lib/noteImages';
import { TextSelection } from '@tiptap/pm/state';
import { SharedHistory, SharedNoteDocuments, isSharedTransaction, resetSharedHistory } from '../../lib/sharedNoteDocuments';
import { registerResourceLinkNavigation, registerResourceLinkNavigator, type LinkedResourceIntent } from '../../lib/resourceLinkNavigation';
import { flushSync } from 'react-dom';
import { createNodeFromContent, type JSONContent } from '@tiptap/core';
import { memo, useRef, useState, useEffect, useCallback, useId, useSyncExternalStore } from 'react';
import { useEditor, EditorContent, ReactNodeViewRenderer, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { WorkspaceTable } from './WorkspaceTable';
import TableControls from './TableControls';
import type { SaveStatus } from '../../lib/saveCoordinator';
import { TableWorkspace, handleTablePaste, tableViewKey, tableViewState } from './TableWorkspace';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Highlight from '@tiptap/extension-highlight';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Underline from '@tiptap/extension-underline';
import { all, createLowlight } from 'lowlight';
import { SlashCommandExtension, slashCommandPluginKey } from './SlashCommandExtension';
import type { SlashCommandState } from './SlashCommandExtension';
import { ResourceLinkExtension, resourceLinkPluginKey } from './ResourceLinkExtension';
import type { ResourceLinkState } from './ResourceLinkExtension';
import SlashMenu, { getFilteredSlashItems } from './SlashMenu';
import ResourceLinkMenu from './ResourceLinkMenu';
import CodeBlockView from './CodeBlockView';
import { markdownToHtml } from './markdownUtils';
import { ESCAPE_PRIORITIES, registerFocusRestore, useEscapeLayer } from '../../lib/escape/escape';
import { SymbolSystemExtension } from './SymbolSystemExtension';

const lowlight = createLowlight(all);

type SlashCommandRegistryWindow = typeof window & {
  __executeSlashCommand?: (view?: unknown) => void;
  __slashCommandExecutors?: Map<object, () => void>;
  __vaultor_editor?: Editor | null;
};

interface BlockEditorProps {
  paneId: string;
  sharedDocuments: SharedNoteDocuments;
  onOpenResource: (intent: LinkedResourceIntent) => void;
  noteId: string;
  noteTitle: string;
  saveStatus: SaveStatus;
  onRetrySave: () => void;
  content: JSONContent | string | null;
  autosaveDelay: number;
  isActive: boolean;
  interactionLocked: boolean;
  shouldRestoreFocus: boolean;
  onUpdate: (json: JSONContent) => void;
  onSelectionChange: (selection: NoteSelection) => void;
  onActivate: (noteId: string) => void;
  onFocusRestored: (noteId: string) => void;
  savedSelection?: NoteSelection | null;
  selectionRestoreKey?: string;
  onRequestMdUpload: (editor: Editor, range: NoteSelection) => void;
  onRequestCsvUpload: (editor: Editor, range: NoteSelection) => void;
  onRequestLinkUpload: (editor: Editor, range: NoteSelection) => void;
}

export interface NoteSelection {
  from: number;
  to: number;
}

function BlockEditor({
  paneId, sharedDocuments, onOpenResource,
  noteId,
  noteTitle,
  saveStatus,
  onRetrySave,
  content,
  autosaveDelay,
  isActive,
  interactionLocked,
  shouldRestoreFocus,
  onUpdate,
  onSelectionChange,
  onActivate,
  onFocusRestored,
  savedSelection, selectionRestoreKey,
  onRequestMdUpload,
  onRequestCsvUpload,
  onRequestLinkUpload,
}: BlockEditorProps) {
  const editorEscapeId = useId();
  const initialSelectionRestored = useRef(false);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const savedSelectionRef = useRef(savedSelection);
  const onUpdateRef = useRef(onUpdate);
  const autosaveDelayRef = useRef(autosaveDelay);
  const [slashState, setSlashState] = useState<SlashCommandState | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const [resourceState, setResourceState] = useState<ResourceLinkState | null>(null);
  const [resourceMenuPos, setResourceMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [resourceSelectedIndex, setResourceSelectedIndex] = useState(0);
  const [resourceFilteredCount, setResourceFilteredCount] = useState(0);

  const [editorFocused, setEditorFocused] = useState(false);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const updateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [imagePicker, setImagePicker] = useState<{ position: number; replaceId?: string }>();
  const invalidContent = useRef(false);
  const [contentError, setContentError] = useState(false);
  useSyncExternalStore(subscribeImageJobs, imageJobVersion);
  const imageJobs = noteImageJobs(noteId);
  const editor = useEditor({
    enableContentCheck: true,
    onContentError: () => { invalidContent.current = true; setContentError(true); },
    onBeforeCreate: ({ editor: creating }) => {
      sharedDocuments.prepare(creating);
      try { validateImageContent(creating.options.content); } catch { invalidContent.current = true; setContentError(true); creating.options.content = { type: 'doc', content: [{ type: 'paragraph' }] }; }
    },
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        undoRedo: false,
        underline: false,
        heading: { levels: [1, 2, 3] },
      }),
      CodeBlockLowlight.extend({
        addNodeView() {
          return ReactNodeViewRenderer(CodeBlockView);
        },
      }).configure({ lowlight }),
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name === 'heading') return `Heading ${node.attrs.level}`;
          return "Type '/' for commands...";
        },
      }),
      WorkspaceTable,
      TableWorkspace,
      SharedHistory,
      TableRow,
      TableCell,
      TableHeader,
      Highlight.configure({ multicolor: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Underline,
      SlashCommandExtension,
      ResourceLinkExtension,
      ManagedImage,
      SymbolSystemExtension,
    ],
    content: parseInitialContent(content),
    editorProps: {
      attributes: {
        class: 'tiptap outline-none min-h-[50vh]',
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved || !event.dataTransfer) return false;
        const files = clipboardImages(event.dataTransfer); if (!files.length) return false;
        event.preventDefault(); const position = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? view.state.selection.from;
        if (window.__vaultor_editor?.view === view) uploadNoteImages(noteId, window.__vaultor_editor, files, position);
        else view.dom.dispatchEvent(new CustomEvent('vaultor:image-files', { detail: { files, position } }));
        return true;
      },
      handlePaste: (view, event) => {
        if (event.clipboardData) {
          const files = clipboardImages(event.clipboardData);
          if (files.length) {
            event.preventDefault();
            const text = event.clipboardData.getData('text/plain');
            if (text) view.dispatch(view.state.tr.insertText(text));
            view.dom.dispatchEvent(new CustomEvent('vaultor:image-files', { detail: { files, position: view.state.selection.from } }));
            return true;
          }
          if (/<img\b/i.test(event.clipboardData.getData('text/html'))) {
            event.preventDefault(); const text = event.clipboardData.getData('text/plain');
            if (text) view.dispatch(view.state.tr.insertText(text));
            view.dom.dispatchEvent(new CustomEvent('vaultor:image-reference'));
            return true;
          }
        }
        if (handleTablePaste(view, event)) return true;
        const text = event.clipboardData?.getData('text/plain');
        if (text && looksLikeMarkdown(text)) {
          event.preventDefault();
          const template = document.createElement('template'); template.innerHTML = markdownToHtml(text);
          template.content.querySelectorAll('img').forEach(image => image.replaceWith(document.createTextNode(`[Image: ${image.getAttribute('alt') || 'image'}] (${image.getAttribute('src') || ''})`)));
          view.pasteHTML(template.innerHTML);
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: ed, transaction }) => {
      if (invalidContent.current || isSharedTransaction(transaction)) return;
      if (updateTimeoutRef.current) clearTimeout(updateTimeoutRef.current);
      if (autosaveDelayRef.current === 0) {
        onUpdateRef.current(ed.getJSON());
        return;
      }

      updateTimeoutRef.current = setTimeout(() => {
        if (!invalidContent.current) onUpdateRef.current(ed.getJSON());
      }, autosaveDelayRef.current);
    },
    onFocus: ({ editor: ed }) => {
      setEditorFocused(true);
      (window as typeof window & { __vaultor_editor?: Editor | null }).__vaultor_editor = ed;
      onActivate(noteId);
    },
    onBlur: ({ editor: ed }) => {
      setEditorFocused(false);
      onSelectionChange({
        from: ed.state.selection.from,
        to: ed.state.selection.to,
      });
    },
  });

  useEffect(() => {
    if (!editor) return;
    const syncExpandedView = () => {
      if (document.fullscreenElement === editorContainerRef.current && !tableViewState(editor.state).expanded) void document.exitFullscreen().catch(() => {});
    };
    editor.on('transaction', syncExpandedView);
    return () => { editor.off('transaction', syncExpandedView); };
  }, [editor]);

  // Expose editor for parent to call insertContent
  useEffect(() => {
    if (!editor) return;
    let unregister: (() => void) | undefined;
    const mounted = () => {
      unregister?.();
      unregister = registerFocusRestore(editor.view.dom, () => {
        if (!editor.isDestroyed && editor.isInitialized) editor.commands.focus(undefined, { scrollIntoView: false });
      });
    };
    const unmounted = () => { unregister?.(); unregister = undefined; };
    editor.on('mount', mounted);
    editor.on('create', mounted);
    editor.on('unmount', unmounted);
    if (editor.isInitialized) mounted();
    return () => {
      editor.off('mount', mounted); editor.off('create', mounted); editor.off('unmount', unmounted); unmounted();
      if (window.__vaultor_editor === editor) window.__vaultor_editor = null;
    };
  }, [editor]);

  // Handle explicit resource link navigation
  useEffect(() => {
    if (!editor) return;
    return registerResourceLinkNavigator(editor.view, (dir: 'up' | 'down') => {
      setResourceSelectedIndex(prev => {
        if (resourceFilteredCount === 0) return 0;
        if (dir === 'down') return (prev + 1) % resourceFilteredCount;
        return (prev - 1 + resourceFilteredCount) % resourceFilteredCount;
      });
    });
  }, [editor, resourceFilteredCount]);


  const closeResourceMenu = useCallback(() => {
    if (editor) {
      const tr = editor.state.tr;
      tr.setMeta(resourceLinkPluginKey, { active: false, query: '', range: null, selectedIndex: 0 });
      editor.view.dispatch(tr);
    }
    setResourceState(null);
    setResourceMenuPos(null);
    setResourceSelectedIndex(0);
  }, [editor]);

  const closeSlash = useCallback(() => {
    if (editor) {
      const tr = editor.state.tr;
      tr.setMeta(slashCommandPluginKey, {
        active: false, query: '', range: null,
        selectedIndex: 0, filteredCount: 0,
        executeSelection: false, navigateDirection: null,
      });
      editor.view.dispatch(tr);
    }
    setSlashState(null);
    setMenuPos(null);
    setSelectedIndex(0);
  }, [editor]);

  useEscapeLayer({
    id: `${editorEscapeId}-slash`,
    active: Boolean(slashState?.active),
    priority: ESCAPE_PRIORITIES.popover,
    close: closeSlash,
  });

  useEscapeLayer({
    id: `${editorEscapeId}-resource-link`,
    active: Boolean(resourceState?.active),
    priority: ESCAPE_PRIORITIES.popover,
    close: closeResourceMenu,
  });

  useEscapeLayer({
    id: `${editorEscapeId}-focus`,
    active: editorFocused,
    priority: ESCAPE_PRIORITIES.editorFocus,
    restoreFocusOnEscape: false,
    close: () => {
      editor?.commands.blur();
    },
  });

  // Handle Enter key synchronously to preserve the browser user gesture
  useEffect(() => {
    if (!editor) {
      return undefined;
    }

    const globalWindow = window as SlashCommandRegistryWindow;
    const executors = globalWindow.__slashCommandExecutors ?? new Map<object, () => void>();
    globalWindow.__slashCommandExecutors = executors;

    const executeSlashCommand = () => {
      const current = slashCommandPluginKey.getState(editor.state) as SlashCommandState | undefined;
      if (!current?.active) return;
      const filtered = getFilteredSlashItems(current.query, onRequestMdUpload, onRequestCsvUpload);
      const idx = selectedIndex >= filtered.length ? 0 : selectedIndex;
      const item = filtered[idx];
      if (item && current.range) {
        const range = { ...current.range };
        if (!item.keepOpen) flushSync(closeSlash);
        item.action(editor, range);
      }
    };

    executors.set(editor.view, executeSlashCommand);

    globalWindow.__executeSlashCommand = (view?: unknown) => {
      if (view && executors.has(view as object)) {
        executors.get(view as object)?.();
        return;
      }

      executeSlashCommand();
    };

    return () => {
      executors.delete(editor.view);
      if (executors.size === 0) {
        delete globalWindow.__executeSlashCommand;
        delete globalWindow.__slashCommandExecutors;
      }
    };
  }, [slashState, selectedIndex, editor, onRequestMdUpload, onRequestCsvUpload, closeSlash]);

  useEffect(() => {
    if (!editor) return;

    const handleTransaction = () => {
      const state = slashCommandPluginKey.getState(editor.state) as SlashCommandState | undefined;
      if (!state) return;

      if (state.active) {
        const filtered = getFilteredSlashItems(state.query, () => {}, () => {});

        if (state.navigateDirection === 'down') {
          setSelectedIndex(prev => (prev + 1) % Math.max(filtered.length, 1));
        } else if (state.navigateDirection === 'up') {
          setSelectedIndex(prev => (prev - 1 + filtered.length) % Math.max(filtered.length, 1));
        }



        if (state.query !== slashState?.query) setSelectedIndex(0);
        setSlashState(state);

        const { from } = editor.state.selection;
        const coords = editor.view.coordsAtPos(from);
        const containerRect = editorContainerRef.current?.getBoundingClientRect();
        if (containerRect) {
          setMenuPos({
            top: coords.bottom - containerRect.top + 8,
            left: Math.min(coords.left - containerRect.left, containerRect.width - 300),
          });
        }
      } else {
        if (slashState?.active) {
          setSlashState(null);
          setMenuPos(null);
          setSelectedIndex(0);
        }
      }

      // Handle Resource Link Plugin State Synchronously
      const rlState = resourceLinkPluginKey.getState(editor.state) as ResourceLinkState | undefined;
      if (rlState?.active) {
        if (rlState.query !== resourceState?.query) setResourceSelectedIndex(0);
        setResourceState(rlState);

        const { from } = editor.state.selection;
        const coords = editor.view.coordsAtPos(from);
        const containerRect = editorContainerRef.current?.getBoundingClientRect();
        if (containerRect) {
          setResourceMenuPos({
            top: coords.bottom - containerRect.top + 8,
            left: Math.min(coords.left - containerRect.left, containerRect.width - 300),
          });
        }
      } else if (resourceState?.active) {
        setResourceState(null);
        setResourceMenuPos(null);
        setResourceSelectedIndex(0);
      }
    };

    editor.on('transaction', handleTransaction);
    return () => { editor.off('transaction', handleTransaction); };
  }, [editor, slashState, selectedIndex, resourceState]);

  useEffect(() => {
    if (!editor || invalidContent.current) return;
    const detach = sharedDocuments.attach(noteId, editor);
    return detach;
  }, [editor, noteId, sharedDocuments]);
  useEffect(() => {
    if (!editor) return;
    return registerResourceLinkNavigation(editor, (resourceId, newPane) => onOpenResource({ resourceId, sourcePaneId: paneId, destination: newPane ? 'new' : 'here', intent: 'link' }));
  }, [editor, paneId, onOpenResource]);

  useEffect(() => {
    savedSelectionRef.current = savedSelection;
  }, [savedSelection]);

  useEffect(() => { onSelectionChangeRef.current = onSelectionChange; }, [onSelectionChange]);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    if (!editor) return;
    const saved = savedSelectionRef.current;
    if (saved) {
      const resolve = (pos: number) => editor.state.doc.resolve(Math.max(0, Math.min(editor.state.doc.content.size, pos)));
      editor.view.dispatch(editor.state.tr.setSelection(TextSelection.between(resolve(saved.from), resolve(saved.to))));
    }
    initialSelectionRestored.current = true;
  }, [editor, selectionRestoreKey]);

  useEffect(() => {
    autosaveDelayRef.current = autosaveDelay;
  }, [autosaveDelay]);

  useEffect(() => {
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, []);


  useEffect(() => {
    if (!editor) {
      return;
    }

    // Tiptap emits an update by default even though editability changes no content.
    editor.setEditable(!interactionLocked && !invalidContent.current, false);
  }, [editor, interactionLocked]);

  useEffect(() => {
    if (!editor || invalidContent.current || !content || editor.isFocused) {
      return;
    }

    const parsed = parseInitialContent(content);
    const current = JSON.stringify(editor.getJSON());
    const incoming = JSON.stringify(parsed);
    if (current !== incoming) {
      editor.view.dispatch(editor.state.tr.setMeta(tableViewKey, { reset: true }));
      let doc;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Unsupported incoming server content disables editing without saving a stripped document.
      try { validateImageContent(parsed); doc = createNodeFromContent(parsed, editor.schema, { errorOnInvalidContent: true }); } catch { invalidContent.current = true; editor.setEditable(false, false); setContentError(true); return; }
      editor.view.dispatch(resetSharedHistory(editor.state.tr.replaceWith(0, editor.state.doc.content.size, doc.content), editor.state));
    }
  }, [content, editor]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    if (isActive && shouldRestoreFocus && !interactionLocked) {
      if (!initialSelectionRestored.current && savedSelectionRef.current) {
        editor.commands.setTextSelection(savedSelectionRef.current);
      }

      initialSelectionRestored.current = true;
      editor.commands.focus(undefined, { scrollIntoView: false });
      onFocusRestored(noteId);
    }


  }, [editor, interactionLocked, isActive, noteId, onFocusRestored, shouldRestoreFocus]);

  useEffect(() => {
    if (!editor) return;
    const selected = () => {
      initialSelectionRestored.current = true;
      onSelectionChangeRef.current({ from: editor.state.selection.from, to: editor.state.selection.to });
    };
    editor.on('selectionUpdate', selected);
    return () => { editor.off('selectionUpdate', selected); };
  }, [editor]);

  useEffect(() => {
    if (!editor || invalidContent.current) return;
    const detach = attachImageUploads(noteId, editor);
    const files = (event: Event) => { const detail = (event as CustomEvent<{ files: File[]; position: number }>).detail; uploadNoteImages(noteId, editor, detail.files, detail.position); };
    const picker = (event: Event) => setImagePicker((event as CustomEvent).detail ?? { position: editor.state.selection.from });
    const reference = () => { setImagePicker({ position: editor.state.selection.from }); };
    editor.view.dom.addEventListener('vaultor:image-files', files); editor.view.dom.addEventListener('vaultor:image-picker', picker); editor.view.dom.addEventListener('vaultor:image-reference', reference);
    return () => { detach(); editor.view.dom.removeEventListener('vaultor:image-files', files); editor.view.dom.removeEventListener('vaultor:image-picker', picker); editor.view.dom.removeEventListener('vaultor:image-reference', reference); };
  }, [editor, noteId]);

  if (!editor) return null;

  if (contentError) return <div role="alert" className="image-error">This note contains unsupported document content. Its original JSON is retained and editing/saving is disabled. Update the app or open it with a compatible client.</div>;
  return (
    <div ref={editorContainerRef} className="editor-workspace relative w-full">
      {imagePicker && <ImagePicker editor={editor} noteId={noteId} {...imagePicker} close={() => setImagePicker(undefined)} />}
      {imageJobs.length > 0 && <div className="image-upload-jobs" aria-live="polite">{imageJobs.map(job => <div key={job.id}><span>{job.file?.name ?? 'Uploaded image'} · {job.status === 'pending' ? `Uploading… ${job.progress}%` : job.error ?? 'Ready to insert in this note'}</span>{job.status === 'failed' && <button onClick={() => void retryImageJob(job.id)}>Retry</button>}{job.status === 'ready' && job.resourceId && <button onClick={() => insertImageJob(job.id, editor)}>Insert here</button>}<button onClick={() => removeImageJob(job.id)}>Remove</button></div>)}</div>}
      <TableControls editor={editor} active={isActive && !interactionLocked} containerRef={editorContainerRef} noteTitle={noteTitle} saveStatus={saveStatus} onRetrySave={onRetrySave} />
      <EditorContent className="table-editor-canvas" editor={editor} />

      {slashState?.active && menuPos && slashState.range && (
        <div className="absolute z-50" style={{ top: menuPos.top, left: menuPos.left }}>
          <SlashMenu
            editor={editor}
            range={slashState.range}
            query={slashState.query}
            selectedIndex={selectedIndex}
            onClose={closeSlash}
            onUploadMd={onRequestMdUpload}
            onUploadCsv={onRequestCsvUpload}
          />
        </div>
      )}

      {resourceState?.active && resourceMenuPos && resourceState.range && (
        <div className="absolute z-50" style={{ top: resourceMenuPos.top, left: resourceMenuPos.left }}>
          <ResourceLinkMenu
            editor={editor}
            range={resourceState.range}
            query={resourceState.query}
            selectedIndex={resourceSelectedIndex}
            onClose={closeResourceMenu}
            onRequestFileUpload={onRequestLinkUpload}
            onUpdateFiltered={setResourceFilteredCount}
          />
        </div>
      )}
    </div>
  );
}

const MemoizedBlockEditor = memo(BlockEditor, (prev, next) => (
  prev.paneId === next.paneId
  && prev.sharedDocuments === next.sharedDocuments
  && prev.onOpenResource === next.onOpenResource
  && prev.noteId === next.noteId
  && prev.noteTitle === next.noteTitle
  && prev.saveStatus === next.saveStatus
  && prev.onRetrySave === next.onRetrySave
  && prev.autosaveDelay === next.autosaveDelay
  && prev.isActive === next.isActive
  && prev.interactionLocked === next.interactionLocked
  && prev.shouldRestoreFocus === next.shouldRestoreFocus
  && prev.selectionRestoreKey === next.selectionRestoreKey
  && prev.savedSelection?.from === next.savedSelection?.from
  && prev.savedSelection?.to === next.savedSelection?.to
  && prev.content === next.content
  && prev.onUpdate === next.onUpdate
  && prev.onSelectionChange === next.onSelectionChange
  && prev.onActivate === next.onActivate
  && prev.onFocusRestored === next.onFocusRestored
  && prev.onRequestMdUpload === next.onRequestMdUpload
  && prev.onRequestCsvUpload === next.onRequestCsvUpload
  && prev.onRequestLinkUpload === next.onRequestLinkUpload
));

export default MemoizedBlockEditor;

function parseInitialContent(content: JSONContent | string | null): JSONContent | string {
  if (!content) return { type: 'doc', content: [{ type: 'paragraph' }] };
  if (typeof content === 'object' && content.type === 'doc') return content.content?.length === 0 ? { ...content, content: [{ type: 'paragraph' }] } : content;
  if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content);
      if (parsed.type === 'doc') return parseInitialContent(parsed);
    } catch { /* treat as markdown */ }
    return markdownToHtml(content);
  }
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}

function looksLikeMarkdown(text: string): boolean {
  const mdPatterns = [
    /^#{1,6}\s/m, /^[-*]\s/m, /^\d+\.\s/m,
    /^>\s/m, /^```/m, /\*\*.+\*\*/, /\[.+\]\(.+\)/,
  ];
  return mdPatterns.some(p => p.test(text));
}
