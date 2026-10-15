import { useState, useRef } from 'react';
import { resourcePresentation } from '../lib/resourceKinds';
import { Download, ExternalLink, PanelRight, ScanText, X } from 'lucide-react';
import ResourceCollections from './ResourceCollections';
import PinButton from './PinButton';
import {ReviewButton} from './ReviewInbox';
import ResourceActions from './ResourceActions';
import type { OrganizationItem } from '../lib/organization';
import FilePreview from './FilePreview';
import type { Resource } from '../types';
import { ESCAPE_PRIORITIES, useEscapeLayer } from '../lib/escape/escape';
import { useSettings } from '../lib/settings';
import PreviewShell from './PreviewShell';

interface PreviewLayerProps {
  resource: Resource;
  onCollection: (item:OrganizationItem)=>void;
  onReview?:(resource:Resource)=>void;
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
  onReview,
  mode,
  animationMode,
  overrideActive,
  open,
  onClose,
  onToggleMode,
  onOpenExternal,
  onDownload,
}: PreviewLayerProps) {
  void overrideActive;
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

  const Icon = resourcePresentation(resource).icon;
  const chrome = (
    <>
      <div className="preview-heading">
        <div className="preview-identity">
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-background text-slate-500">
            <Icon size={13} />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-medium text-foreground">{resource.title}</h3>
          </div>
        </div>

        <div className="preview-actions">
          {onReview&&<ReviewButton resource={resource} onOpen={()=>onReview(resource)}/>}<PinButton id={resource.id} name={resource.title} favorite={resource.favorite}/>
          <ResourceActions resource={resource}/>
          <button
            onClick={onToggleMode}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-white/5 bg-background px-2.5 text-[11px] font-medium text-slate-500 transition-colors hover:text-primary"
            title={mode === 'side' ? 'Switch to floating preview' : 'Switch to side preview'} aria-label={mode === 'side' ? 'Switch to floating preview' : 'Switch to side preview'}
          >
            {mode === 'side' ? <ScanText size={13} /> : <PanelRight size={13} />}
            <span className="preview-action-label">{mode === 'side' ? 'Floating' : 'Side'}</span>
          </button>
          <button
            disabled={pending}
            onClick={() => void perform('open')} aria-label="Open file in external application" title="Open file in external application"
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-white/5 bg-background px-2.5 text-[11px] font-medium text-slate-500 transition-colors hover:text-primary"
          >
            <ExternalLink size={13} /><span className="preview-action-label">Open</span>
          </button>
          <button
            disabled={pending}
            onClick={() => void perform('download')} aria-label="Download file" title="Download file"
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-background px-2.5 text-[11px] font-medium text-slate-500 transition-colors hover:text-primary"
          >
            <Download size={13}/><span className="preview-action-label">Download</span>
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


      <div className="min-h-0 flex-1 overflow-hidden">
        <PreviewContent resource={resource} />
      </div>
    </>
  );

  return <PreviewShell mode={mode} transparency={transparency} label={'Preview: '+resource.title} resourceId={resource.id} onClose={onClose}>{chrome}</PreviewShell>;
}

function PreviewContent({ resource }: { resource: Resource }) {
  switch (resource.type) {
    case 'file':
      return <FilePreview resource={resource} />;
    default:
      return <p role="alert">Preview is unsupported for this resource type.</p>;
  }
}
