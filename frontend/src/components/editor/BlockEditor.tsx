import { flushSync } from 'react-dom';
import type { JSONContent } from '@tiptap/core';
import { memo, useRef, useState, useEffect, useCallback, useId } from 'react';
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
  onRequestMdUpload: (editor: Editor, range: NoteSelection) => void;
  onRequestCsvUpload: (editor: Editor, range: NoteSelection) => void;
  onRequestLinkUpload: (editor: Editor, range: NoteSelection) => void;
}

export interface NoteSelection {
  from: number;
  to: number;
}

function BlockEditor({
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
  savedSelection,
  onRequestMdUpload,
  onRequestCsvUpload,
  onRequestLinkUpload,
}: BlockEditorProps) {
  const editorEscapeId = useId();
  const wasActiveRef = useRef(false);
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

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
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
      TableRow,
      TableCell,
      TableHeader,
      Highlight.configure({ multicolor: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Underline,
      SlashCommandExtension,
      ResourceLinkExtension,
      SymbolSystemExtension,
    ],
    content: parseInitialContent(content),
    editorProps: {
      attributes: {
        class: 'tiptap outline-none min-h-[50vh]',
      },
      handlePaste: (view, event) => {
        if (handleTablePaste(view, event)) return true;
        const text = event.clipboardData?.getData('text/plain');
        if (text && looksLikeMarkdown(text)) {
          event.preventDefault();
          const html = markdownToHtml(text);
          view.pasteHTML(html);
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      if (updateTimeoutRef.current) clearTimeout(updateTimeoutRef.current);
      if (autosaveDelayRef.current === 0) {
        onUpdateRef.current(ed.getJSON());
        return;
      }

      updateTimeoutRef.current = setTimeout(() => {
        onUpdateRef.current(ed.getJSON());
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
    window.__navigateResourceLink = (dir: 'up' | 'down') => {
      setResourceSelectedIndex(prev => {
        if (resourceFilteredCount === 0) return 0;
        if (dir === 'down') return (prev + 1) % resourceFilteredCount;
        return (prev - 1 + resourceFilteredCount) % resourceFilteredCount;
      });
    };
  }, [resourceFilteredCount]);


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
    savedSelectionRef.current = savedSelection;
  }, [savedSelection]);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

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

    editor.setEditable(!interactionLocked);
  }, [editor, interactionLocked]);

  useEffect(() => {
    if (!editor || !content || editor.isFocused) {
      return;
    }

    const parsed = parseInitialContent(content);
    const current = JSON.stringify(editor.getJSON());
    const incoming = JSON.stringify(parsed);
    if (current !== incoming) {
      editor.view.dispatch(editor.state.tr.setMeta(tableViewKey, { reset: true }));
      editor.commands.setContent(parsed);
    }
  }, [content, editor]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    if (isActive && !wasActiveRef.current && shouldRestoreFocus && !interactionLocked) {
      console.log('Restoring selection');
      if (savedSelectionRef.current) {
        editor.commands.setTextSelection(savedSelectionRef.current);
      }

      editor.commands.focus(undefined, { scrollIntoView: false });
      onFocusRestored(noteId);
    }

    wasActiveRef.current = isActive;
  }, [editor, interactionLocked, isActive, noteId, onFocusRestored, shouldRestoreFocus]);

  useEffect(() => {
    if (!editor || !isActive || !editorFocused) {
      return;
    }

    onSelectionChange({
      from: editor.state.selection.from,
      to: editor.state.selection.to,
    });
  }, [editor, editorFocused, isActive, onSelectionChange]);

  if (!editor) return null;

  return (
    <div ref={editorContainerRef} className="editor-workspace relative w-full">
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
  prev.noteId === next.noteId
  && prev.noteTitle === next.noteTitle
  && prev.saveStatus === next.saveStatus
  && prev.onRetrySave === next.onRetrySave
  && prev.autosaveDelay === next.autosaveDelay
  && prev.isActive === next.isActive
  && prev.interactionLocked === next.interactionLocked
  && prev.shouldRestoreFocus === next.shouldRestoreFocus
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
  if (typeof content === 'object' && content.type === 'doc') return content;
  if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content);
      if (parsed.type === 'doc') return parsed;
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
