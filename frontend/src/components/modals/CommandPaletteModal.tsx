import { useCallback, useEffect, useMemo, useState } from 'react';
import { Command, FileText, FolderOpen, Paperclip, Plus, Sidebar, Trash2, Upload } from 'lucide-react';
import AppModal from './AppModal';

export type CommandPaletteItemType = 'navigation' | 'create' | 'action';

export interface CommandPaletteItem {
  id: string;
  type: CommandPaletteItemType;
  label: string;
  subtitle?: string;
  keywords?: string[];
  icon?: 'note' | 'file' | 'create' | 'upload' | 'delete' | 'sidebar' | 'help' | 'open';
  action: () => void | Promise<void>;
}

interface CommandPaletteModalProps {
  open: boolean;
  onClose: () => void;
  commands: CommandPaletteItem[];
}

const sectionLabels: Record<CommandPaletteItemType, string> = {
  navigation: 'Navigation',
  create: 'Create',
  action: 'Actions',
};

export default function CommandPaletteModal({ open, onClose, commands }: CommandPaletteModalProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [runningId, setRunningId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setSelectedIndex(0);
      setRunningId(null);
      return;
    }
    setSelectedIndex(0);
  }, [open]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return commands;

    return commands.filter((command) => {
      const haystack = [command.label, command.subtitle || '', ...(command.keywords || [])].join(' ').toLowerCase();
      return haystack.includes(normalized);
    });
  }, [commands, query]);

  const grouped = useMemo(() => {
    return (['navigation', 'create', 'action'] as CommandPaletteItemType[])
      .map((type) => ({ type, items: filtered.filter((command) => command.type === type) }))
      .filter((group) => group.items.length > 0);
  }, [filtered]);

  const flatItems = useMemo(() => grouped.flatMap((group) => group.items), [grouped]);

  const runCommand = useCallback(async (command: CommandPaletteItem) => {
    setRunningId(command.id);
    try {
      await command.action();
      onClose();
    } finally {
      setRunningId(null);
    }
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedIndex((prev) => (flatItems.length === 0 ? 0 : (prev + 1) % flatItems.length));
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedIndex((prev) => (flatItems.length === 0 ? 0 : (prev - 1 + flatItems.length) % flatItems.length));
      }

      if (event.key === 'Enter' && flatItems[selectedIndex]) {
        event.preventDefault();
        void runCommand(flatItems[selectedIndex]);
      }

    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [flatItems, open, runCommand, selectedIndex]);

  let globalIndex = 0;

  return (
    <AppModal
      open={open}
      onClose={onClose}
      title="Command Palette"
      description="Jump, create, and act from one keyboard-first surface."
      widthClassName="max-w-3xl"
      escapeLayer="commandPalette"
    >
      <div className="space-y-4">
        <div className="relative">
          <Command className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search commands, notes, and files..."
            className="w-full rounded-xl border border-border bg-background py-3 pl-10 pr-4 text-sm outline-none transition-colors focus:border-primary"
          />
        </div>
        <div className="flex items-center justify-between text-xs font-medium text-slate-400">
          <span>{flatItems.length} result{flatItems.length === 1 ? '' : 's'}</span>
          <span>Use ↑ ↓ Enter Esc</span>
        </div>
        <div className="max-h-[28rem] space-y-3 overflow-y-auto">
          {grouped.map((group) => (
            <div key={group.type}>
              <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                {sectionLabels[group.type]}
              </div>
              <div className="space-y-1">
                {group.items.map((command) => {
                  const currentIndex = globalIndex++;
                  const selected = currentIndex === selectedIndex;
                  const running = runningId === command.id;

                  return (
                    <button
                      key={command.id}
                      onClick={() => void runCommand(command)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors ${
                        selected ? 'bg-primary/10 text-primary' : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                      } ${running ? 'opacity-70' : ''}`}
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background text-slate-500">
                        <CommandIcon icon={command.icon} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{command.label}</div>
                        {command.subtitle && <div className="truncate text-xs text-slate-400">{command.subtitle}</div>}
                      </div>
                      <span className="text-[10px] uppercase tracking-[0.18em] text-slate-400">{group.type}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {flatItems.length === 0 && (
            <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-slate-500">
              No commands matched your search.
            </div>
          )}
        </div>
      </div>
    </AppModal>
  );
}

function CommandIcon({ icon }: { icon?: CommandPaletteItem['icon'] }) {
  switch (icon) {
    case 'note':
      return <FileText size={16} />;
    case 'file':
      return <Paperclip size={16} />;
    case 'create':
      return <Plus size={16} />;
    case 'upload':
      return <Upload size={16} />;
    case 'delete':
      return <Trash2 size={16} />;
    case 'sidebar':
      return <Sidebar size={16} />;
    case 'help':
      return <Command size={16} />;
    case 'open':
      return <FolderOpen size={16} />;
    default:
      return <Command size={16} />;
  }
}
