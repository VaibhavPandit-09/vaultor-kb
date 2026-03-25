import { Editor } from '@tiptap/react';
import {
  Plus, Trash2, ArrowDown, ArrowLeft, ArrowRight,
  Rows, Columns, Merge, Split, ToggleLeft
} from 'lucide-react';

interface TableToolbarProps {
  editor: Editor;
}

export default function TableToolbar({ editor }: TableToolbarProps) {
  return (
    <div className="inline-flex items-center gap-1 p-2 bg-card border border-border rounded-xl shadow-lg text-xs flex-wrap">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-2">Table</span>
      <Divider />
      
      <ToolBtn
        icon={<Plus size={14} />}
        label="Insert Row Above"
        onClick={() => editor.chain().focus().addRowBefore().run()}
      />
      <ToolBtn
        icon={<ArrowDown size={14} />}
        label="Insert Row Below"
        onClick={() => editor.chain().focus().addRowAfter().run()}
      />
      <ToolBtn
        icon={<ArrowLeft size={14} />}
        label="Insert Column Left"
        onClick={() => editor.chain().focus().addColumnBefore().run()}
      />
      <ToolBtn
        icon={<ArrowRight size={14} />}
        label="Insert Column Right"
        onClick={() => editor.chain().focus().addColumnAfter().run()}
      />

      <Divider />

      <ToolBtn
        icon={<Rows size={14} />}
        label="Delete Row"
        onClick={() => editor.chain().focus().deleteRow().run()}
        danger
      />
      <ToolBtn
        icon={<Columns size={14} />}
        label="Delete Column"
        onClick={() => editor.chain().focus().deleteColumn().run()}
        danger
      />

      <Divider />

      <ToolBtn
        icon={<Merge size={14} />}
        label="Merge Selected Cells"
        onClick={() => editor.chain().focus().mergeCells().run()}
      />
      <ToolBtn
        icon={<Split size={14} />}
        label="Split Merged Cell"
        onClick={() => editor.chain().focus().splitCell().run()}
      />
      <ToolBtn
        icon={<ToggleLeft size={14} />}
        label="Toggle Header Row"
        onClick={() => editor.chain().focus().toggleHeaderRow().run()}
      />

      <Divider />

      <ToolBtn
        icon={<Trash2 size={14} />}
        label="Delete Entire Table"
        onClick={() => editor.chain().focus().deleteTable().run()}
        danger
      />
    </div>
  );
}

function ToolBtn({ icon, label, onClick, danger }: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <div className="relative group/tip">
      <button
        onClick={onClick}
        className={`p-2 rounded-lg transition-colors ${
          danger
            ? 'text-red-500 hover:bg-red-500/10'
            : 'text-slate-500 hover:text-primary hover:bg-primary/10'
        }`}
      >
        {icon}
      </button>
      {/* Tooltip */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 bg-slate-900 dark:bg-slate-700 text-white text-[11px] font-medium rounded-lg whitespace-nowrap opacity-0 invisible group-hover/tip:opacity-100 group-hover/tip:visible transition-all pointer-events-none z-50 shadow-lg">
        {label}
        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
          <div className="w-2 h-2 bg-slate-900 dark:bg-slate-700 rotate-45" />
        </div>
      </div>
    </div>
  );
}

function Divider() {
  return <div className="w-px h-6 bg-border mx-0.5" />;
}
