import { memo, useRef, useState, useEffect, useCallback, useId } from 'react';
import { useEditor, EditorContent, ReactNodeViewRenderer, type Editor } from '@tiptap/react';
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
import SlashMenu, { getFilteredSlashItems } from './SlashMenu';
import ResourceLinkMenu from './ResourceLinkMenu';
import CodeBlockView from './CodeBlockView';
import { markdownToHtml } from './markdownUtils';
import { ESCAPE_PRIORITIES, registerFocusRestore, useEscapeLayer } from '../../lib/escape/escape';
import { SymbolSystemExtension } from './SymbolSystemExtension';
import { Plus, Trash2 } from 'lucide-react';

const lowlight = createLowlight(all);

interface BlockEditorProps {
  noteId: string;
  content: any;
  autosaveDelay: number;
  isActive: boolean;
  interactionLocked: boolean;
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

type TableOverlayState = {
  top: number;
  left: number;
  width: number;
  height: number;
  rowMarkerTop: number;
  columnMarkerLeft: number;
  rowCount: number;
  columnCount: number;
};

function BlockEditor({
  noteId,
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
  const [tableOverlay, setTableOverlay] = useState<TableOverlayState | null>(null);
  const [tableControlsVisible, setTableControlsVisible] = useState(false);
  const [editorFocused, setEditorFocused] = useState(false);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const updateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tableOverlayFrameRef = useRef<number | null>(null);

  const updateTableOverlay = useCallback((currentEditor: Editor | null | undefined) => {
    setTableOverlay(resolveTableOverlay(currentEditor, editorContainerRef.current));
  }, []);

  const queueTableOverlayRefresh = useCallback((currentEditor: Editor | null | undefined) => {
    if (tableOverlayFrameRef.current !== null) {
      window.cancelAnimationFrame(tableOverlayFrameRef.current);
    }

    tableOverlayFrameRef.current = window.requestAnimationFrame(() => {
      updateTableOverlay(currentEditor);
      tableOverlayFrameRef.current = null;
    });
  }, [updateTableOverlay]);

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
      Table.extend({
        addKeyboardShortcuts() {
          const parentShortcuts = this.parent?.() ?? {};

          return {
            ...parentShortcuts,
            Enter: () => {
              if (!isSelectionInLastTableRow(this.editor)) {
                return false;
              }

              return this.editor.chain().focus().addRowAfter().goToNextCell().run();
            },
          };
        },
      }).configure({ resizable: true }),
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
      if (ed.isActive('table')) {
        queueTableOverlayRefresh(ed);
      } else {
        setTableOverlay(null);
      }
    },
    onFocus: ({ editor: ed }) => {
      setEditorFocused(true);
      (window as typeof window & { __vaultor_editor?: Editor | null }).__vaultor_editor = ed;
      onActivate(noteId);
    },
    onBlur: ({ editor: ed }) => {
      setEditorFocused(false);
      setTableControlsVisible(false);
      onSelectionChange({
        from: ed.state.selection.from,
        to: ed.state.selection.to,
      });
    },
  });

  // Expose editor for parent to call insertContent
  useEffect(() => {
    if (editor) {
      const unregisterRestore = registerFocusRestore(editor.view.dom, () => {
        editor.commands.focus(undefined, { scrollIntoView: false });
      });

      return () => {
        unregisterRestore();
        const globalWindow = window as typeof window & { __vaultor_editor?: Editor | null };
        if (globalWindow.__vaultor_editor === editor) {
          globalWindow.__vaultor_editor = null;
        }
      };
    }

    return undefined;
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
      const filtered = getFilteredSlashItems(slashState.query, onRequestMdUpload, onRequestCsvUpload);
      const idx = selectedIndex >= filtered.length ? 0 : selectedIndex;
      const item = filtered[idx];
      if (item && slashState.range && editor) {
        item.action(editor, slashState.range);
        if (!item.keepOpen) {
          closeSlash();
        }
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
      if (tableOverlayFrameRef.current !== null) {
        window.cancelAnimationFrame(tableOverlayFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (slashState?.query !== undefined) {
      setSelectedIndex(0);
    }
  }, [slashState?.query]);

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

  useEffect(() => {
    if (!editor || !editorFocused || !isInTable) {
      if (!editorFocused || !isInTable) {
        setTableOverlay(null);
        setTableControlsVisible(false);
      }
      return;
    }

    queueTableOverlayRefresh(editor);

    const handleWindowChange = () => queueTableOverlayRefresh(editor);
    window.addEventListener('resize', handleWindowChange);
    window.addEventListener('scroll', handleWindowChange, true);

    return () => {
      window.removeEventListener('resize', handleWindowChange);
      window.removeEventListener('scroll', handleWindowChange, true);
    };
  }, [editor, editorFocused, isInTable, queueTableOverlayRefresh]);

  useEffect(() => {
    const container = editorContainerRef.current;
    if (!editor || !editorFocused || !isInTable || !container) {
      setTableControlsVisible(false);
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('[data-table-control]')) {
        setTableControlsVisible(true);
        return;
      }

      const cell = target?.closest('td, th');
      const table = target?.closest('table');

      if (!cell || !table || !container.contains(table)) {
        setTableControlsVisible(false);
        queueTableOverlayRefresh(editor);
        return;
      }

      setTableControlsVisible(true);
      setTableOverlay(resolveTableOverlayFromCell(cell, table, container));
    };

    const handleMouseLeave = () => {
      setTableControlsVisible(false);
      queueTableOverlayRefresh(editor);
    };

    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [editor, editorFocused, isInTable, queueTableOverlayRefresh]);



  if (!editor) return null;

  return (
    <div ref={editorContainerRef} className="relative w-full">
      <EditorContent editor={editor} />

      {tableOverlay && editorFocused && (
        <div
          className="pointer-events-none absolute z-30"
          style={{
            top: tableOverlay.top,
            left: tableOverlay.left,
            width: tableOverlay.width,
            height: tableOverlay.height,
          }}
        >
          <button
            type="button"
            data-table-control="add-column"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              editor.chain().focus().addColumnAfter().run();
              queueTableOverlayRefresh(editor);
            }}
            className={`pointer-events-auto absolute right-2 top-1/2 inline-flex h-7 -translate-y-1/2 items-center gap-1 rounded-full bg-card/92 px-3 text-[11px] font-medium text-slate-500 shadow-sm backdrop-blur-sm transition-[opacity,transform,color] duration-100 hover:text-primary ${
              tableControlsVisible ? 'translate-x-0 opacity-100' : 'translate-x-1 opacity-0'
            }`}
          >
            <Plus size={12} /> Add column
          </button>

          <button
            type="button"
            data-table-control="add-row"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              editor.chain().focus().addRowAfter().run();
              queueTableOverlayRefresh(editor);
            }}
            className={`pointer-events-auto absolute bottom-2 left-1/2 inline-flex h-7 -translate-x-1/2 items-center gap-1 rounded-full bg-card/92 px-3 text-[11px] font-medium text-slate-500 shadow-sm backdrop-blur-sm transition-[opacity,transform,color] duration-100 hover:text-primary ${
              tableControlsVisible ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'
            }`}
          >
            <Plus size={12} /> Add row
          </button>

          {tableOverlay.columnCount > 1 && (
            <button
              type="button"
              data-table-control="delete-column"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                editor.chain().focus().deleteColumn().run();
                queueTableOverlayRefresh(editor);
              }}
              className={`pointer-events-auto absolute top-2 inline-flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-lg bg-card/92 text-slate-400 shadow-sm backdrop-blur-sm transition-[opacity,color,background-color] duration-100 hover:bg-card hover:text-red-500 ${
                tableControlsVisible ? 'opacity-100' : 'opacity-0'
              }`}
              style={{ left: tableOverlay.columnMarkerLeft }}
              aria-label="Delete column"
              title="Delete column"
            >
              <Trash2 size={12} />
            </button>
          )}

          {tableOverlay.rowCount > 1 && (
            <button
              type="button"
              data-table-control="delete-row"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                editor.chain().focus().deleteRow().run();
                queueTableOverlayRefresh(editor);
              }}
              className={`pointer-events-auto absolute left-2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg bg-card/92 text-slate-400 shadow-sm backdrop-blur-sm transition-[opacity,color,background-color] duration-100 hover:bg-card hover:text-red-500 ${
                tableControlsVisible ? 'opacity-100' : 'opacity-0'
              }`}
              style={{ top: tableOverlay.rowMarkerTop }}
              aria-label="Delete row"
              title="Delete row"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      )}

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

function isSelectionInLastTableRow(editor: Editor) {
  const { $from } = editor.state.selection;

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name !== 'tableRow') {
      continue;
    }

    const tableDepth = depth - 1;
    if (tableDepth < 0) {
      return false;
    }

    const table = $from.node(tableDepth);
    if (table.type.name !== 'table') {
      return false;
    }

    return $from.index(tableDepth) === table.childCount - 1;
  }

  return false;
}

function resolveTableOverlay(editor: Editor | null | undefined, container: HTMLDivElement | null): TableOverlayState | null {
  if (!editor || !container) {
    return null;
  }

  const domAtPos = editor.view.domAtPos(editor.state.selection.from);
  const domNode = domAtPos.node instanceof Element ? domAtPos.node : domAtPos.node.parentElement;
  const cell = domNode?.closest('td, th');
  const table = domNode?.closest('table');
  const row = cell?.closest('tr');

  if (!cell || !table || !row) {
    return null;
  }

  const tableRect = table.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();
  const cellRect = cell.getBoundingClientRect();

  return {
    top: tableRect.top - containerRect.top,
    left: tableRect.left - containerRect.left,
    width: tableRect.width,
    height: tableRect.height,
    rowMarkerTop: rowRect.top - tableRect.top + (rowRect.height / 2),
    columnMarkerLeft: cellRect.left - tableRect.left + (cellRect.width / 2),
    rowCount: table.querySelectorAll('tr').length,
    columnCount: row.children.length,
  };
}

function resolveTableOverlayFromCell(cell: Element, table: Element, container: HTMLDivElement): TableOverlayState | null {
  const row = cell.closest('tr');
  if (!row) {
    return null;
  }

  const tableRect = table.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();
  const cellRect = cell.getBoundingClientRect();

  return {
    top: tableRect.top - containerRect.top,
    left: tableRect.left - containerRect.left,
    width: tableRect.width,
    height: tableRect.height,
    rowMarkerTop: rowRect.top - tableRect.top + (rowRect.height / 2),
    columnMarkerLeft: cellRect.left - tableRect.left + (cellRect.width / 2),
    rowCount: table.querySelectorAll('tr').length,
    columnCount: row.children.length,
  };
}

function looksLikeMarkdown(text: string): boolean {
  const mdPatterns = [
    /^#{1,6}\s/m, /^[-*]\s/m, /^\d+\.\s/m,
    /^>\s/m, /^```/m, /\*\*.+\*\*/, /\[.+\]\(.+\)/,
  ];
  return mdPatterns.some(p => p.test(text));
}
