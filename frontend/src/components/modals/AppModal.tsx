import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { ESCAPE_PRIORITIES, useEscapeLayer } from '../../lib/escape/escape';

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
}: AppModalProps) {
  const modalId = useId();
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEscapeLayer({
    id: `app-modal-${modalId}`,
    active: open,
    priority: escapeLayer === 'commandPalette' ? ESCAPE_PRIORITIES.commandPalette : ESCAPE_PRIORITIES.modal,
    close: onClose,
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    return () => {
      if (restoreFocusRef.current?.isConnected) {
        restoreFocusRef.current.focus();
      }
      restoreFocusRef.current = null;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className={`w-full ${widthClassName} rounded-2xl border border-border bg-card shadow-2xl`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">{title}</h3>
            {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-foreground dark:hover:bg-slate-800" aria-label="Close modal">
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}
