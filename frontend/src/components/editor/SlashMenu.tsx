import { useCallback, useMemo, useRef } from 'react';
import { Editor } from '@tiptap/react';
import type { Range } from '@tiptap/react';
import {
  AtSign,
  CheckSquare,
  Code,
  FileSpreadsheet,
  FileUp,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Table,
  Type,
} from 'lucide-react';
import { activateResourceLinkSuggestion } from './ResourceLinkExtension';
import { extractSymbolSearchTerm, formatSymbolName, isSymbolSearchQuery, searchSymbols } from '../../lib/symbols';

interface SlashMenuItem {
  id: string;
  title: string;
  command: string;
  description: string;
  icon: React.ReactNode;
  category?: string;
  keepOpen?: boolean;
  action: (editor: Editor, range: Range) => void;
  flat?: boolean;
}

const getItems = (onUploadMd: () => void, onUploadCsv: () => void): SlashMenuItem[] => [
  {
    id: 'text',
    title: 'Text',
    command: 'text',
    description: 'Plain text block',
    icon: <Type size={18} />,
    category: 'Basic',
    action: (editor, range) => {
      editor.chain().focus().deleteRange(range).setParagraph().run();
    },
  },
  {
    id: 'heading-1',
    title: 'Heading 1',
    command: 'h1',
    description: 'Large section heading',
    icon: <Heading1 size={18} />,
    category: 'Basic',
    action: (editor, range) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run();
    },
  },
  {
    id: 'heading-2',
    title: 'Heading 2',
    command: 'h2',
    description: 'Medium section heading',
    icon: <Heading2 size={18} />,
    category: 'Basic',
    action: (editor, range) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run();
    },
  },
  {
    id: 'heading-3',
    title: 'Heading 3',
    command: 'h3',
    description: 'Small section heading',
    icon: <Heading3 size={18} />,
    category: 'Basic',
    action: (editor, range) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run();
    },
  },
  {
    id: 'bullet-list',
    title: 'Bullet List',
    command: 'bullet',
    description: 'Unordered list',
    icon: <List size={18} />,
    category: 'Lists',
    action: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run();
    },
  },
  {
    id: 'numbered-list',
    title: 'Numbered List',
    command: 'numbered',
    description: 'Ordered list',
    icon: <ListOrdered size={18} />,
    category: 'Lists',
    action: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run();
    },
  },
  {
    id: 'task-list',
    title: 'Task List',
    command: 'task todo checklist',
    description: 'Checklist with checkboxes',
    icon: <CheckSquare size={18} />,
    category: 'Lists',
    action: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleTaskList().run();
    },
  },
  {
    id: 'code-block',
    title: 'Code Block',
    command: 'code',
    description: 'Syntax-highlighted code',
    icon: <Code size={18} />,
    category: 'Rich Blocks',
    action: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
    },
  },
  {
    id: 'quote',
    title: 'Quote',
    command: 'quote blockquote',
    description: 'Blockquote / callout',
    icon: <Quote size={18} />,
    category: 'Rich Blocks',
    action: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run();
    },
  },
  {
    id: 'divider',
    title: 'Divider',
    command: 'divider hr line separator',
    description: 'Horizontal separator',
    icon: <Minus size={18} />,
    category: 'Rich Blocks',
    action: (editor, range) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run();
    },
  },
  {
    id: 'highlight',
    title: 'Highlight',
    command: 'highlight mark',
    description: 'Highlight text',
    icon: <Highlighter size={18} />,
    category: 'Inline',
    action: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleHighlight().run();
    },
  },
  {
    id: 'insert-symbol',
    title: 'Insert Symbol',
    command: 'symbol emoji icon',
    description: 'Type /symbol to search the symbol catalogue',
    icon: <AtSign size={18} />,
    category: 'Inline',
    keepOpen: true,
    action: (editor, range) => {
      editor.chain().focus().deleteRange(range).insertContent('/symbol ').run();
    },
  },
  {
    id: 'table',
    title: 'Table',
    command: 'table grid',
    description: 'Insert a 3x3 table',
    icon: <Table size={18} />,
    category: 'Advanced',
    action: (editor, range) => {
      editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    },
  },
  {
    id: 'link-resource',
    title: 'Link Resource',
    command: 'link resource file note',
    description: 'Insert an inline link',
    icon: <Link2 size={18} />,
    category: 'Insert',
    action: (editor, range) => {
      editor.chain().focus().deleteRange(range).insertContent('[[').run();
      const { from } = editor.state.selection;
      setTimeout(() => {
        activateResourceLinkSuggestion(editor.view, { from: from - 2, to: from });
      }, 0);
    },
  },
  {
    id: 'upload-markdown',
    title: 'Upload Markdown',
    command: 'upload md markdown',
    description: 'Import a .md file',
    icon: <FileUp size={18} />,
    category: 'Import',
    action: (editor, range) => {
      editor.chain().focus().deleteRange(range).run();
      onUploadMd();
    },
  },
  {
    id: 'upload-csv',
    title: 'Upload CSV as Table',
    command: 'csv spreadsheet excel',
    description: 'Import CSV as a table',
    icon: <FileSpreadsheet size={18} />,
    category: 'Import',
    action: (editor, range) => {
      editor.chain().focus().deleteRange(range).run();
      onUploadCsv();
    },
  },
];

export function getFilteredSlashItems(query: string, onUploadMd: () => void, onUploadCsv: () => void): SlashMenuItem[] {
  if (isSymbolSearchQuery(query)) {
    return searchSymbols(extractSymbolSearchTerm(query), 32).map((item) => ({
      id: `symbol-${item.name}`,
      title: formatSymbolName(item.name),
      command: item.name,
      description: `:${item.name}:`,
      icon: <span className="text-base leading-none">{item.symbol}</span>,
      flat: true,
      action: (editor, range) => {
        editor.chain().focus().deleteRange(range).insertContent(`${item.symbol} `).run();
      },
    }));
  }

  const items = getItems(onUploadMd, onUploadCsv);
  const normalizedQuery = query.toLowerCase();
  return items.filter((item) => (
    item.title.toLowerCase().includes(normalizedQuery)
    || item.command.toLowerCase().includes(normalizedQuery)
  ));
}

interface SlashMenuProps {
  editor: Editor;
  range: Range;
  query: string;
  selectedIndex: number;
  onClose: () => void;
  onUploadMd: () => void;
  onUploadCsv: () => void;
}

export default function SlashMenu({
  editor,
  range,
  query,
  selectedIndex,
  onClose,
  onUploadMd,
  onUploadCsv,
}: SlashMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const filtered = useMemo(
    () => getFilteredSlashItems(query, onUploadMd, onUploadCsv),
    [onUploadCsv, onUploadMd, query],
  );
  const symbolMode = isSymbolSearchQuery(query);

  const selectItem = useCallback((index: number) => {
    const item = filtered[index];
    if (item) {
      item.action(editor, range);
      if (!item.keepOpen) {
        onClose();
      }
    }
  }, [filtered, editor, range, onClose]);

  const selectedEl = menuRef.current?.querySelector('[data-selected="true"]');
  if (selectedEl) {
    selectedEl.scrollIntoView({ block: 'nearest' });
  }

  if (filtered.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-3 text-sm text-slate-500 shadow-2xl">
        No results
      </div>
    );
  }

  if (symbolMode) {
    return (
      <div ref={menuRef} className="max-h-80 w-72 overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-2xl">
        {filtered.map((item, index) => {
          const selected = index === selectedIndex;
          return (
            <button
              key={item.id}
              data-selected={selected}
              onClick={() => selectItem(index)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                selected ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${
                selected ? 'bg-primary/20' : 'bg-slate-100 dark:bg-slate-800'
              }`}>
                {item.icon}
              </span>
              <div className="min-w-0">
                <div className="truncate font-medium">{item.title}</div>
                <div className="truncate text-[11px] text-slate-400">{item.description}</div>
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  const categories: Record<string, SlashMenuItem[]> = {};
  filtered.forEach((item) => {
    const category = item.category ?? 'Commands';
    if (!categories[category]) {
      categories[category] = [];
    }
    categories[category].push(item);
  });

  let globalIndex = 0;

  return (
    <div ref={menuRef} className="max-h-80 w-72 overflow-y-auto rounded-xl border border-border bg-card shadow-2xl">
      {Object.entries(categories).map(([category, categoryItems]) => (
        <div key={category}>
          <div className="sticky top-0 bg-slate-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:bg-slate-900/50">
            {category}
          </div>
          <div className="p-1">
            {categoryItems.map((item) => {
              const itemIndex = globalIndex;
              globalIndex += 1;
              const selected = itemIndex === selectedIndex;

              return (
                <button
                  key={item.id}
                  data-selected={selected}
                  onClick={() => selectItem(itemIndex)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                    selected ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <span className={`flex flex-shrink-0 rounded-lg p-1.5 ${
                    selected ? 'bg-primary/20' : 'bg-slate-100 dark:bg-slate-800'
                  }`}>
                    {item.icon}
                  </span>
                  <div className="min-w-0 text-left">
                    <div className="truncate font-medium">{item.title}</div>
                    <div className="truncate text-[11px] text-slate-400">{item.description}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export { getItems };
export type { SlashMenuItem };
