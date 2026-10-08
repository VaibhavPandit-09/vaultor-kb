import { useState, useRef } from 'react';
import { resourceKind, resourceDescription } from '../lib/resourceKinds';
import { ExternalLink, PanelRight, ScanText, X } from 'lucide-react';
import ResourceCollections from './ResourceCollections';
import PinButton from './PinButton';
import ResourceActions from './ResourceActions';
import type { OrganizationItem } from '../lib/organization';
import FilePreview from './FilePreview';
import type { Resource } from '../types';
import { ESCAPE_PRIORITIES, useEscapeLayer } from '../lib/escape/escape';
import { useSettings } from '../lib/settings';
import { getGlassPanelStyle, getOverlayStyle } from '../lib/transparency';

interface PreviewLayerProps {
  resource: Resource;
  onCollection: (item:OrganizationItem)=>void;
  mode: 'side' | 'modal';
  animationMode: 'snappy' | 'smooth';
  overrideActive: boolean;
  open: boolean;
  onClose: () => void;
  onToggleMode: () => void;
  onOpenExternal: () => void | Promise<void>;
  onDownload: () => void | string | Promise<void | string>;
}

export default function PreviewLayer({
  resource,
  onCollection,
  mode,
  animationMode,
  overrideActive,
  open,
  onClose,
  onToggleMode,
  onOpenExternal,
  onDownload,
}: PreviewLayerProps) {
  void animationMode; // Shared motion reads the resolved device preference.
  const actionRunning = useRef(false);
  const [actionStatus, setActionStatus] = useState('');
  const [actionError, setActionError] = useState('');
  const [pending, setPending] = useState(false);
  async function perform(action: 'open' | 'download') {
    if (actionRunning.current) return;
    actionRunning.current = true; setPending(true); setActionError(''); setActionStatus('Preparing…');
    try { const outcome = await (action === 'open' ? onOpenExternal() : onDownload()); setActionStatus(action === 'open' ? 'Opened in your application' : outcome === 'saved' ? 'Saved' : outcome === 'cancelled' ? 'Save cancelled' : 'Download requested'); }
    catch (error) { setActionStatus(''); setActionError(error instanceof Error ? error.message : 'File action failed. Retry.'); }
    finally { actionRunning.current = false; setPending(false); }
  }
  const { settings } = useSettings();
  const transparency = settings.local.uiTransparency;

  useEscapeLayer({
    id: `preview-layer-${resource.id}`,
    active: open,
    priority: ESCAPE_PRIORITIES.preview,
    close: onClose,
    restoreFocusOnEscape: false, // Dashboard restores the owning pane.
  });

  const Icon = resourceKind(resource.type).icon;
  const chrome = (
    <>
      <div className="flex min-h-12 flex-wrap items-center justify-between gap-3 py-2 border-b border-white/5 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-background text-slate-500">
            <Icon size={13} />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-medium text-foreground">{resource.title}</h3>
            <div className="truncate text-[11px] text-slate-500">{resourceDescription(resource)}</div>
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center gap-1.5">
          <PinButton id={resource.id} name={resource.title} favorite={resource.favorite}/>
          <ResourceActions resource={resource}/>
          <button
            onClick={onToggleMode}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-white/5 bg-background px-2.5 text-[11px] font-medium text-slate-500 transition-colors hover:text-primary"
            title={mode === 'side' ? 'Switch to floating preview' : 'Switch to side preview'}
          >
            {mode === 'side' ? <ScanText size={13} /> : <PanelRight size={13} />}
            {mode === 'side' ? 'Floating' : 'Side'}
          </button>
          <button
            disabled={pending}
            onClick={() => void perform('open')}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-white/5 bg-background px-2.5 text-[11px] font-medium text-slate-500 transition-colors hover:text-primary"
          >
            <ExternalLink size={13} /> Open
          </button>
          <button
            disabled={pending}
            onClick={() => void perform('download')}
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

      <div className="px-3 border-b border-border"><ResourceCollections id={resource.id} onOpen={onCollection}/></div>
      {actionStatus && <p role="status" className="px-3 py-1 text-xs text-[var(--text-secondary)]">{actionStatus}</p>}
      {actionError && <p role="alert" className="px-3 py-1 text-xs text-red-400">{actionError} Use Open or Download to retry.</p>}
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
      <div
        className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/40 p-3 backdrop-blur-sm"
        style={getOverlayStyle(transparency, 0.28)}
        onClick={onClose}
      >
        <div
          data-preview-resource={resource.id}
          data-motion-surface="panel" data-motion-key="file-preview"
          className="flex h-[84vh] w-full max-w-6xl flex-col overflow-hidden rounded-[1.4rem] border border-white/5 bg-card shadow-xl"
          style={getGlassPanelStyle(transparency, 18)}
          onClick={(event) => event.stopPropagation()}
        >
          {chrome}
        </div>
      </div>
    );
  }

  return (
    <div data-preview-resource={resource.id} className="pointer-events-none fixed inset-y-0 right-0 z-[75] flex w-full justify-end">
      <div
        data-motion-surface="side" data-motion-key="file-preview"
        className="pointer-events-auto flex h-full w-full max-w-full md:max-w-[min(60%,44rem)] xl:max-w-[min(40%,44rem)] flex-col border-l border-white/5 bg-card shadow-lg"
        style={getGlassPanelStyle(transparency, 16)}
      >
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
      return <p role="alert">Preview is unsupported for this resource type.</p>;
  }
}
