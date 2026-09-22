import { Check, CloudAlert, Loader2 } from 'lucide-react';
import type { SaveStatus } from '../lib/saveCoordinator';

export default function SaveIndicator({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  const label = status === 'saving' ? 'Saving…' : status === 'failed' ? 'Save failed — click to retry' : 'All changes saved';
  const Icon = status === 'saving' ? Loader2 : status === 'failed' ? CloudAlert : Check;
  return <div className="group relative shrink-0">
    <button type="button" aria-label={label} title={label} onClick={status === 'failed' ? onRetry : undefined}
      className={`flex h-8 w-8 items-center justify-center rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${status === 'failed' ? 'text-red-500 hover:bg-red-500/10' : 'text-[var(--text-tertiary)]'}`}>
      <Icon aria-hidden="true" size={16} className={status === 'saving' ? 'animate-spin motion-reduce:animate-none' : ''} />
    </button>
    <span role="tooltip" className="pointer-events-none absolute right-0 top-full z-10 mt-1 whitespace-nowrap rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground opacity-0 shadow-sm group-hover:opacity-100 group-focus-within:opacity-100">{label}</span>
    <span className="sr-only" role="status">{label}</span>
  </div>;
}
