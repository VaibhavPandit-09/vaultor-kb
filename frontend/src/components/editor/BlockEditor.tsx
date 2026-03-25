import { memo, useRef, useState, useEffect, useCallback, useId } from 'react';
import { useEditor, EditorContent, ReactNodeViewRenderer } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { Table } from '@tiptap/extension-table';
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
import SlashMenu, { getItems } from './SlashMenu';
import ResourceLinkMenu from './ResourceLinkMenu';
import CodeBlockView from './CodeBlockView';
import TableToolbar from './TableToolbar';
import { markdownToHtml } from './markdownUtils';
import { ESCAPE_PRIORITIES, registerFocusRestore, useEscapeLayer } from '../../lib/escape/escape';

const lowlight = createLowlight(all);

interface BlockEditorProps {
  noteId: string;
  content: any;
  autosaveDelay: number;
  isActive: boolean;
  shouldRestoreFocus: boolean;
  onUpdate: (json: any) => void;
  onSelectionChange: (selection: NoteSelection) => void;
  onActivate: (noteId: string) => void;
  onFocusRestored: (noteId: string) => void;
  savedSelection?: NoteSelection | null;
  onRequestMdUpload: () => void;
  onRequestCsvUpload: () => void;
}

export interface NoteSelection {
  from: number;
  to: number;
}

function BlockEditor({
  noteId,
  content,
  autosaveDelay,
  isActive,
  shouldRestoreFocus,
  onUpdate,
  onSelectionChange,
  onActivate,
  onFocusRestored,
  savedSelection,
  onRequestMdUpload,
  onRequestCsvUpload,
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

  const [isInTable, setIsInTable] = useState(false);
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
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      Highlight.configure({ multicolor: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Underline,
      SlashCommandExtension,
      ResourceLinkExtension,
    ],
    content: parseInitialContent(content),
    editorProps: {
      attributes: {
        class: 'tiptap outline-none min-h-[50vh]',
      },
      handlePaste: (view, event) => {
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
    onSelectionUpdate: ({ editor: ed }) => {
      setIsInTable(ed.isActive('table'));
    },
    onFocus: () => {
      setEditorFocused(true);
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

  // Expose editor for parent to call insertContent
  useEffect(() => {
    if (editor) {
      (window as any).__vaultor_editor = editor;
      const unregisterRestore = registerFocusRestore(editor.view.dom, () => {
        editor.commands.focus(undefined, { scrollIntoView: false });
      });

      return () => {
        unregisterRestore();
        (window as any).__vaultor_editor = null;
      };
    }

    return () => {
      (window as any).__vaultor_editor = null;
    };
  }, [editor]);

  // Handle explicit resource link navigation
  useEffect(() => {
    (window as any).__navigateResourceLink = (dir: 'up' | 'down') => {
      setResourceSelectedIndex(prev => {
        if (resourceFilteredCount === 0) return 0;
        if (dir === 'down') return (prev + 1) % resourceFilteredCount;
        return (prev - 1 + resourceFilteredCount) % resourceFilteredCount;
      });
    };
  }, [resourceFilteredCount]);

  useEffect(() => {
    if (resourceState?.query !== undefined) {
      setResourceSelectedIndex(0);
    }
  }, [resourceState?.query]);

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
    (window as any).__executeSlashCommand = () => {
      if (!slashState?.active) return;
      const items = getItems(onRequestMdUpload, onRequestCsvUpload);
      const filtered = items.filter(item =>
        item.title.toLowerCase().includes(slashState.query.toLowerCase()) ||
        item.command.toLowerCase().includes(slashState.query.toLowerCase())
      );
      const idx = selectedIndex >= filtered.length ? 0 : selectedIndex;
      const item = filtered[idx];
      if (item && slashState.range && editor) {
        item.action(editor, slashState.range);
        closeSlash();
      }
    };
  }, [slashState, selectedIndex, editor, onRequestMdUpload, onRequestCsvUpload, closeSlash]);

  useEffect(() => {
    if (!editor) return;

    const handleTransaction = () => {
      const state = slashCommandPluginKey.getState(editor.state) as SlashCommandState | undefined;
      if (!state) return;

      if (state.active) {
        const items = getItems(() => {}, () => {});
        const filtered = items.filter(item =>
          item.title.toLowerCase().includes(state.query.toLowerCase()) ||
          item.command.toLowerCase().includes(state.query.toLowerCase())
        );

        if (state.navigateDirection === 'down') {
          setSelectedIndex(prev => (prev + 1) % Math.max(filtered.length, 1));
        } else if (state.navigateDirection === 'up') {
          setSelectedIndex(prev => (prev - 1 + filtered.length) % Math.max(filtered.length, 1));
        }



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
    if (slashState?.query !== undefined) {
      setSelectedIndex(0);
    }
  }, [slashState?.query]);

  useEffect(() => {
    if (!editor || !content || editor.isFocused) {
      return;
    }

    const parsed = parseInitialContent(content);
    const current = JSON.stringify(editor.getJSON());
    const incoming = JSON.stringify(parsed);
    if (current !== incoming) {
      editor.commands.setContent(parsed);
    }
  }, [content, editor]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    if (isActive && !wasActiveRef.current && shouldRestoreFocus) {
      console.log('Restoring selection');
      if (savedSelectionRef.current) {
        editor.commands.setTextSelection(savedSelectionRef.current);
      }

      editor.commands.focus(undefined, { scrollIntoView: false });
      onFocusRestored(noteId);
    }

    wasActiveRef.current = isActive;
  }, [editor, isActive, noteId, onFocusRestored, shouldRestoreFocus]);

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
    <div ref={editorContainerRef} className="relative w-full">
      {isInTable && (
        <div className="mb-3 sticky top-0 z-40">
          <TableToolbar editor={editor} />
        </div>
      )}

      <EditorContent editor={editor} />

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
            onUpdateFiltered={setResourceFilteredCount}
          />
        </div>
      )}
    </div>
  );
}

const MemoizedBlockEditor = memo(BlockEditor, (prev, next) => (
  prev.noteId === next.noteId
  && prev.autosaveDelay === next.autosaveDelay
  && prev.isActive === next.isActive
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
));

export default MemoizedBlockEditor;

function parseInitialContent(content: any): any {
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
