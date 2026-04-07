import { useId, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { ESCAPE_PRIORITIES, useEscapeLayer } from '../../lib/escape/escape';
import { useSettings } from '../../lib/settings';
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

export default function AppModal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  widthClassName = 'max-w-md',
  escapeLayer = 'modal',
  restoreFocusOnEscape = true,
}: AppModalProps) {
  const modalId = useId();
  const { settings } = useSettings();
  const transparency = settings.local.uiTransparency;

  useEscapeLayer({
    id: `app-modal-${modalId}`,
    active: open,
    priority: escapeLayer === 'commandPalette' ? ESCAPE_PRIORITIES.commandPalette : ESCAPE_PRIORITIES.modal,
    close: onClose,
    restoreFocusOnEscape,
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={getOverlayStyle(transparency, 0.38)} onClick={onClose}>
      <div
        className={`w-full ${widthClassName} rounded-[28px] border border-[color:var(--border-strong)] bg-[var(--surface-1)]/80 shadow-[0_24px_60px_rgba(15,23,42,0.18)]`}
        style={getGlassPanelStyle(transparency, 16)}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[color:var(--border-subtle)] px-6 py-5">
          <div>
            <h3 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">{title}</h3>
            {description && <p className="mt-1 text-sm text-[var(--text-secondary)]">{description}</p>}
          </div>
          <button onClick={onClose} className="rounded-xl p-1.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]" aria-label="Close modal">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-[color:var(--border-subtle)] px-6 py-5">{footer}</div>}
      </div>
    </div>
  );
}
