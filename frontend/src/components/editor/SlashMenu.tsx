import { useCallback, useRef } from 'react';
import { Editor } from '@tiptap/react';
import type { Range } from '@tiptap/react';
import {
  Type, Heading1, Heading2, Heading3,
  List, ListOrdered, Code, Quote, FileUp,
  Minus, Table, FileSpreadsheet, CheckSquare,
  Highlighter, Link2
} from 'lucide-react';
import { activateResourceLinkSuggestion } from './ResourceLinkExtension';

interface SlashMenuItem {
  title: string;
  command: string;
  description: string;
  icon: React.ReactNode;
  category: string;
  action: (editor: Editor, range: Range) => void;
}

const getItems = (onUploadMd: () => void, onUploadCsv: () => void): SlashMenuItem[] => [
  // --- Text ---
  {
    title: 'Text',
    command: 'text',
    description: 'Plain text block',
    icon: <Type size={18} />,
    category: 'Basic',
    action: (editor, range) => {
      editor.chain().focus().deleteRange(range).setParagraph().run();
    },
  },
  // --- Headings ---
  {
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
    title: 'Heading 3',
    command: 'h3',
    description: 'Small section heading',
    icon: <Heading3 size={18} />,
    category: 'Basic',
    action: (editor, range) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run();
    },
  },
  // --- Lists ---
  {
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
    title: 'Task List',
    command: 'task todo checklist',
    description: 'Checklist with checkboxes',
    icon: <CheckSquare size={18} />,
    category: 'Lists',
    action: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleTaskList().run();
    },
  },
  // --- Rich blocks ---
  {
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
    title: 'Highlight',
    command: 'highlight mark',
    description: 'Highlight text',
    icon: <Highlighter size={18} />,
    category: 'Inline',
    action: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleHighlight().run();
    },
  },
  // --- Table ---
  {
    title: 'Table',
    command: 'table grid',
    description: 'Insert a 3×3 table',
    icon: <Table size={18} />,
    category: 'Advanced',
    action: (editor, range) => {
      editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    },
  },
  // --- Link ---
  {
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
  // --- Upload ---
  {
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

interface SlashMenuProps {
  editor: Editor;
  range: Range;
  query: string;
  selectedIndex: number;
  onClose: () => void;
  onUploadMd: () => void;
  onUploadCsv: () => void;
}

export default function SlashMenu({ editor, range, query, selectedIndex, onClose, onUploadMd, onUploadCsv }: SlashMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const items = getItems(onUploadMd, onUploadCsv);

  const filtered = items.filter(item =>
    item.title.toLowerCase().includes(query.toLowerCase()) ||
    item.command.toLowerCase().includes(query.toLowerCase())
  );

  const selectItem = useCallback((index: number) => {
    const item = filtered[index];
    if (item) {
      item.action(editor, range);
      onClose();
    }
  }, [filtered, editor, range, onClose]);

  // Scroll selected into view
  const selectedEl = menuRef.current?.querySelector('[data-selected="true"]');
  if (selectedEl) {
    selectedEl.scrollIntoView({ block: 'nearest' });
  }

  if (filtered.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-2xl p-3 text-sm text-slate-500">
        No results
      </div>
    );
  }

  // Group items by category
  const categories: Record<string, typeof filtered> = {};
  filtered.forEach(item => {
    if (!categories[item.category]) categories[item.category] = [];
    categories[item.category].push(item);
  });

  let globalIndex = 0;

  return (
    <div
      ref={menuRef}
      className="bg-card border border-border rounded-xl shadow-2xl overflow-hidden w-72 max-h-80 overflow-y-auto"
    >
      {Object.entries(categories).map(([category, catItems]) => (
        <div key={category}>
          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 bg-slate-50 dark:bg-slate-900/50 sticky top-0">
            {category}
          </div>
          <div className="p-1">
            {catItems.map((item) => {
              const idx = globalIndex++;
              return (
                <button
                  key={item.command}
                  data-selected={idx === selectedIndex}
                  onClick={() => selectItem(filtered.indexOf(item))}
                  className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-colors ${
                    idx === selectedIndex
                      ? 'bg-primary/10 text-primary'
                      : 'text-foreground hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <span className={`p-1.5 rounded-lg flex-shrink-0 ${idx === selectedIndex ? 'bg-primary/20' : 'bg-slate-100 dark:bg-slate-800'}`}>
                    {item.icon}
                  </span>
                  <div className="text-left min-w-0">
                    <div className="font-medium truncate">{item.title}</div>
                    <div className="text-[11px] text-slate-400 truncate">{item.description}</div>
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
