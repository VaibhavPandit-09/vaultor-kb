import { useEffect, useMemo, useState } from 'react';
import { FileText, Paperclip, Search } from 'lucide-react';
import api from '../../lib/api';
import type { Resource } from '../../types';
import AppModal from './AppModal';

interface GlobalSearchModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (resourceId: string) => void;
}

export default function GlobalSearchModal({ open, onClose, onSelect }: GlobalSearchModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Resource[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
      setLoading(false);
      return;
    }

    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await api.get(`/resources/search?q=${encodeURIComponent(query)}`);
        if (!active) return;
        setResults(data || []);
        setSelectedIndex(0);
      } catch (error) {
        console.error('Global search failed', error);
        if (active) setResults([]);
      } finally {
        if (active) setLoading(false);
      }
    }, 150);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [open, query]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedIndex((prev) => (results.length === 0 ? 0 : (prev + 1) % results.length));
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedIndex((prev) => (results.length === 0 ? 0 : (prev - 1 + results.length) % results.length));
      }
      if (event.key === 'Enter' && results[selectedIndex]) {
        event.preventDefault();
        onSelect(results[selectedIndex].id);
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, results, selectedIndex, onClose, onSelect]);

  const summary = useMemo(() => {
    if (loading) return 'Searching...';
    return `${results.length} result${results.length === 1 ? '' : 's'}`;
  }, [loading, results.length]);

  return (
    <AppModal open={open} onClose={onClose} title="Search Vaultor" description="Jump to any note or file with keyboard-first search." widthClassName="max-w-2xl">
      <div className="space-y-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search notes and files..."
            className="w-full rounded-xl border border-border bg-background py-3 pl-10 pr-4 text-sm outline-none transition-colors focus:border-primary"
          />
        </div>
        <div className="flex items-center justify-between text-xs font-medium text-slate-400">
          <span>{summary}</span>
          <span>Use ↑ ↓ Enter Esc</span>
        </div>
        <div className="max-h-[24rem] space-y-1 overflow-y-auto">
          {results.map((resource, index) => (
            <button
              key={resource.id}
              onClick={() => onSelect(resource.id)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors ${
                index === selectedIndex ? 'bg-primary/10 text-primary' : 'hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {resource.type === 'note' ? <FileText size={16} /> : <Paperclip size={16} />}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{resource.title}</div>
                <div className="text-xs uppercase tracking-wide text-slate-400">{resource.type}</div>
              </div>
            </button>
          ))}
          {!loading && results.length === 0 && (
            <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-slate-500">
              No resources matched your search.
            </div>
          )}
        </div>
      </div>
    </AppModal>
  );
}
