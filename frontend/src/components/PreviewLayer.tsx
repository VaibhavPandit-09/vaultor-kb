import { ExternalLink, FileText, PanelRight, Paperclip, ScanText, X } from 'lucide-react';
import FilePreview from './FilePreview';
import type { Resource } from '../types';
import { ESCAPE_PRIORITIES, useEscapeLayer } from '../lib/escape/escape';

interface PreviewLayerProps {
  resource: Resource;
  mode: 'side' | 'modal';
  overrideActive: boolean;
  open: boolean;
  onClose: () => void;
  onToggleMode: () => void;
  onOpenExternal: () => void;
  onDownload: () => void;
}

export default function PreviewLayer({
  resource,
  mode,
  overrideActive,
  open,
  onClose,
  onToggleMode,
  onOpenExternal,
  onDownload,
}: PreviewLayerProps) {
  useEscapeLayer({
    id: `preview-layer-${resource.id}`,
    active: open,
    priority: ESCAPE_PRIORITIES.preview,
    close: onClose,
  });

  const chrome = (
    <>
      <div className="flex h-12 items-center justify-between gap-3 border-b border-white/5 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-background text-slate-500">
            {resource.type === 'note' ? <FileText size={13} /> : <Paperclip size={13} />}
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-medium text-foreground">{resource.title}</h3>
            <div className="truncate text-[11px] text-slate-500">{resource.mimeType || 'Previewable resource'}</div>
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center gap-1.5">
          <button
            onClick={onToggleMode}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-white/5 bg-background px-2.5 text-[11px] font-medium text-slate-500 transition-colors hover:text-primary"
            title={mode === 'side' ? 'Switch to floating preview' : 'Switch to side preview'}
          >
            {mode === 'side' ? <ScanText size={13} /> : <PanelRight size={13} />}
            {mode === 'side' ? 'Floating' : 'Side'}
          </button>
          <button
            onClick={onOpenExternal}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-white/5 bg-background px-2.5 text-[11px] font-medium text-slate-500 transition-colors hover:text-primary"
          >
            <ExternalLink size={13} /> Open
          </button>
          <button
            onClick={onDownload}
            className="h-8 rounded-lg border border-white/5 bg-background px-2.5 text-[11px] font-medium text-slate-500 transition-colors hover:text-primary"
          >
            Download
          </button>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-background hover:text-foreground"
            aria-label="Close preview"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {overrideActive && (
        <div className="px-3 py-1 text-[11px] text-slate-500">
          {mode === 'modal' ? 'Floating override' : 'Side override'}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden">
        <PreviewContent resource={resource} />
      </div>
    </>
  );

  if (mode === 'modal') {
    return (
      <div className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/40 p-3 backdrop-blur-sm" onClick={onClose}>
        <div
          className="flex h-[84vh] w-full max-w-6xl flex-col overflow-hidden rounded-[1.4rem] border border-white/5 bg-card shadow-xl"
          onClick={(event) => event.stopPropagation()}
        >
          {chrome}
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none fixed inset-y-0 right-0 z-[75] flex w-full justify-end">
      <div className="pointer-events-auto flex h-full w-full max-w-[min(40%,44rem)] flex-col border-l border-white/5 bg-card shadow-lg">
        {chrome}
      </div>
    </div>
  );
}

function PreviewContent({ resource }: { resource: Resource }) {
  switch (resource.type) {
    case 'file':
      return <FilePreview resource={resource} />;
    default:
      return <FilePreview resource={resource} />;
  }
}
