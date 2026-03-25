import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { shortcuts } from '../../lib/shortcuts';
import AppModal from './AppModal';

interface ShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

export default function ShortcutsModal({ open, onClose }: ShortcutsModalProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return shortcuts;
    return shortcuts
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => item.description.toLowerCase().includes(normalized)),
      }))
      .filter((group) => group.items.length > 0);
  }, [query]);

  return (
    <AppModal open={open} onClose={onClose} title="Keyboard Shortcuts" description="Vaultor stays fast when the common moves are always one key away." widthClassName="max-w-3xl">
      <div className="space-y-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter shortcuts..."
            className="w-full rounded-xl border border-border bg-background py-3 pl-10 pr-4 text-sm outline-none transition-colors focus:border-primary"
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((group) => (
            <div key={group.category} className="rounded-2xl border border-border bg-background/70 p-4">
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{group.category}</h4>
              <div className="space-y-3">
                {group.items.map((item) => (
                  <div key={`${group.category}-${item.description}`} className="flex items-center justify-between gap-4">
                    <span className="text-sm text-foreground">{item.description}</span>
                    <div className="flex flex-wrap justify-end gap-1">
                      {item.keys.map((keyPart, index) => (
                        <span key={`${item.description}-${keyPart}-${index}`} className="rounded-md border border-border bg-card px-2 py-1 text-xs font-semibold text-slate-500 shadow-sm">
                          {keyPart}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppModal>
  );
}
