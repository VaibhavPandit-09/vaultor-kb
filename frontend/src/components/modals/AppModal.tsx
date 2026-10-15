import { useId, useRef, type ReactNode } from 'react';
import { DialogFocusContext, useDialogFocus } from '../../lib/dialogFocus';
import { X } from 'lucide-react';
import { ESCAPE_PRIORITIES, PopoverPriorityContext, useEscapeLayer } from '../../lib/escape/escape';
import { useOptionalSettings } from '../../lib/settings';
import { getGlassPanelStyle, getOverlayStyle } from '../../lib/transparency';

type EscapeLayerKind = 'modal' | 'commandPalette';

interface AppModalProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  widthClassName?: string;
  escapeLayer?: EscapeLayerKind;
  restoreFocusOnEscape?: boolean;
}

export default function AppModal(props:AppModalProps) { return props.open ? <ModalWindow {...props}/> : null; }

function ModalWindow({
  title,
  description,
  onClose,
  children,
  footer,
  widthClassName = 'max-w-md',
  escapeLayer = 'modal',
  restoreFocusOnEscape = true,
}: AppModalProps) {
  const modalId = useId(),root=useRef<HTMLDivElement>(null);
  const {scope,onKeyDown}=useDialogFocus(root,restoreFocusOnEscape);
  const priority=(escapeLayer==='commandPalette'?ESCAPE_PRIORITIES.commandPalette:ESCAPE_PRIORITIES.modal)+scope.depth*10;
  const context = useOptionalSettings();
  const transparency = context?.settings.local.uiTransparency ?? 1;

  useEscapeLayer({
    id: `app-modal-${modalId}`,
    active: true,
    priority,
    close: onClose,
    restoreFocusOnEscape:false,
  });

  return (
    <div className="app-modal-overlay" style={{...getOverlayStyle(transparency, 0.38),zIndex:90+scope.depth*10}} onClick={onClose}>
      <div
        ref={root} tabIndex={-1} onKeyDown={onKeyDown} data-motion-surface="command" data-motion-key={'dialog:'+title} role="dialog" aria-modal="true" aria-labelledby={modalId} aria-describedby={description?modalId+'-description':undefined}
        className={`app-modal-window w-full ${widthClassName}`}
        style={getGlassPanelStyle(transparency, 16)}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="app-modal-header">
          <div className="min-w-0">
            <h3 id={modalId} title={title} className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">{title}</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-1.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]" aria-label="Close modal">
            <X size={18} />
          </button>
        </header>
        <DialogFocusContext value={scope}><PopoverPriorityContext value={priority+1}>
        <div className="app-modal-body">{description&&<p id={modalId+'-description'} className="app-modal-description">{description}</p>}{children}</div>
        {footer && <footer className="app-modal-footer">{footer}</footer>}
        </PopoverPriorityContext></DialogFocusContext>
      </div>
    </div>
  );
}
