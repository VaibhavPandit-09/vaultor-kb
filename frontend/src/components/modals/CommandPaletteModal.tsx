import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import {
  createRootStep,
  type CommandContext,
  type CommandItem,
  type CommandMemory,
  type CommandStep,
  type CommandUsage,
} from '../../lib/commandPalette';
import { ESCAPE_PRIORITIES, useEscapeLayer } from '../../lib/escape/escape';
import { useSettings } from '../../lib/settings';
import { isMac } from '../../lib/shortcuts';
import { getGlassPanelStyle, getOverlayStyle } from '../../lib/transparency';

type StepState = {
  step: CommandStep;
  query: string;
};

interface CommandPaletteModalProps {
  open: boolean;
  onClose: (options?: { restorePreview?: boolean; restoreFocus?: boolean }) => void;
  context: CommandContext;
  onHighlightPreviewResource: (resourceId: string | null) => void;
  previewVisible: boolean;
}

export default function CommandPaletteModal({
  open,
  onClose,
  context,
  onHighlightPreviewResource,
  previewVisible,
}: CommandPaletteModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const paletteRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(false);
  const [stepStack, setStepStack] = useState<StepState[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<CommandMemory | null>(null);
  const [usage, setUsage] = useState<CommandUsage>({});
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [animateIn, setAnimateIn] = useState(false);
  const { settings } = useSettings();
  const smoothAnimations = settings.local.animationMode === 'smooth';

  useEscapeLayer({
    id: 'vaultor-command-palette',
    active: open,
    priority: ESCAPE_PRIORITIES.commandPalette,
    restoreFocusOnEscape: false,
    close: () => {
      handleCloseRequest();
    },
  });

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      setAnimateIn(false);
      setStepStack([]);
      setSelectedIndex(0);
      setRunningId(null);
      setDebouncedQuery('');
      setPreviewId(null);
      onHighlightPreviewResource(null);
      return;
    }

    if (wasOpenRef.current) {
      return;
    }

    wasOpenRef.current = true;
    const rootStep = createRootStep(context, lastAction, usage);
    setStepStack([{ step: rootStep, query: '' }]);
    setSelectedIndex(0);
    setRunningId(null);
    setDebouncedQuery('');
    setPreviewId(null);
    setAnimateIn(false);
    onHighlightPreviewResource(null);
  }, [context, lastAction, onHighlightPreviewResource, open, usage]);

  useEffect(() => {
    if (!open || !smoothAnimations) {
      setAnimateIn(false);
      return;
    }

    const rafId = window.requestAnimationFrame(() => {
      setAnimateIn(true);
    });

    return () => window.cancelAnimationFrame(rafId);
  }, [open, smoothAnimations]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const focusInput = () => inputRef.current?.focus();
    const rafId = window.requestAnimationFrame(focusInput);
    return () => window.cancelAnimationFrame(rafId);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const placeholderTimer = window.setInterval(() => {
      setPlaceholderIndex((current) => (current + 1) % PLACEHOLDERS.length);
    }, 1800);

    return () => window.clearInterval(placeholderTimer);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const stopBackgroundShortcuts = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof Node && paletteRef.current?.contains(target)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener('keydown', stopBackgroundShortcuts, true);
    window.addEventListener('keypress', stopBackgroundShortcuts, true);
    window.addEventListener('keyup', stopBackgroundShortcuts, true);
    return () => {
      window.removeEventListener('keydown', stopBackgroundShortcuts, true);
      window.removeEventListener('keypress', stopBackgroundShortcuts, true);
      window.removeEventListener('keyup', stopBackgroundShortcuts, true);
    };
  }, [open]);

  const currentState = stepStack[stepStack.length - 1] ?? null;
  const currentQuery = currentState?.query ?? '';

  useEffect(() => {
    if (!open) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setDebouncedQuery(currentQuery);
    }, 70);

    return () => window.clearTimeout(timeoutId);
  }, [currentQuery, open]);

  const items = useMemo(() => {
    if (!currentState) {
      return [];
    }

    return currentState.step.getItems(debouncedQuery, context);
  }, [context, currentState, debouncedQuery]);

  useEffect(() => {
    setSelectedIndex((current) => {
      if (items.length === 0) {
        return 0;
      }

      return Math.min(current, items.length - 1);
    });
  }, [items.length]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const selectedItem = items[selectedIndex];
    const nextPreviewId = selectedItem?.preview?.type === 'file'
      ? selectedItem.preview.resource.id
      : null;

    if (nextPreviewId === previewId) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      onHighlightPreviewResource(nextPreviewId);
      setPreviewId(nextPreviewId);
    }, 80);

    return () => window.clearTimeout(timeoutId);
  }, [items, onHighlightPreviewResource, open, previewId, selectedIndex]);

  const updateCurrentQuery = useCallback((query: string) => {
    setStepStack((previous) => previous.map((entry, index) => (
      index === previous.length - 1 ? { ...entry, query } : entry
    )));
  }, []);

  const stepBack = useCallback(() => {
    setStepStack((previous) => (previous.length > 1 ? previous.slice(0, -1) : previous));
    setSelectedIndex(0);
  }, []);

  const handleCloseRequest = useCallback((options?: { restorePreview?: boolean; restoreFocus?: boolean }) => {
    if (stepStack.length > 1) {
      stepBack();
      return;
    }

    onClose(options);
  }, [onClose, stepBack, stepStack.length]);

  const executeItem = useCallback(async (item: CommandItem) => {
    const result = await item.onSelect();
    if (result.type === 'noop') {
      return;
    }

    if (result.type === 'push') {
      setStepStack((previous) => [
        ...previous,
        {
          step: result.step,
          query: result.query ?? result.step.initialQuery ?? '',
        },
      ]);
      setSelectedIndex(0);
      return;
    }

    setRunningId(item.id);
    try {
      await result.action();
      setUsage((previous) => ({
        ...previous,
        [item.id]: (previous[item.id] ?? 0) + 1,
      }));
      if (result.remember) {
        setLastAction(result.remember);
      }
      onHighlightPreviewResource(null);
      onClose({ restorePreview: false, restoreFocus: false });
    } finally {
      setRunningId(null);
    }
  }, [onClose, onHighlightPreviewResource]);

  const handleInputKeyDown = useCallback((event: ReactKeyboardEvent<HTMLInputElement>) => {
    const modKey = isMac ? event.metaKey : event.ctrlKey;
    event.stopPropagation();

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedIndex((current) => (
        items.length === 0 ? 0 : Math.min(current + 1, items.length - 1)
      ));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      handleCloseRequest();
      return;
    }

    if ((event.key === 'Enter' || (modKey && event.key === 'Enter')) && items[selectedIndex]) {
      event.preventDefault();
      void executeItem(items[selectedIndex]);
      return;
    }

    if (event.key === 'Tab' && items[selectedIndex]) {
      event.preventDefault();
      updateCurrentQuery(items[selectedIndex].title);
    }
  }, [executeItem, handleCloseRequest, items, selectedIndex, updateCurrentQuery]);

  if (!open) {
    return null;
  }

  const transparency = settings.local.uiTransparency;
  const previewPanelWidth = 'min(40vw, 44rem)';
  const palettePreviewInset = `calc(${previewPanelWidth} + 2rem)`;

  return createPortal(
    <div className="fixed inset-0 z-[80] pointer-events-none">
      <div
        className={`absolute inset-y-0 left-0 pointer-events-auto ${
          smoothAnimations
            ? `transition-opacity duration-[170ms] ease-out ${animateIn ? 'opacity-100' : 'opacity-0'}`
            : 'transition-none opacity-100'
        }`}
        style={{
          ...(previewVisible ? { right: previewPanelWidth } : { right: 0 }),
          ...getOverlayStyle(transparency, 0.18),
        }}
        onClick={() => handleCloseRequest()}
      />
      <div
        className={`absolute inset-y-0 left-0 pointer-events-none flex items-start justify-center px-4 pt-[18vh] ${
          smoothAnimations ? 'transition-[right] duration-[170ms] ease-out' : 'transition-none'
        }`}
        style={previewVisible ? { right: palettePreviewInset } : { right: 0 }}
      >
        <div
          ref={paletteRef}
          className={`command-palette pointer-events-auto w-full max-w-[40rem] ${
            smoothAnimations
              ? `transform-gpu transition-[transform,opacity] duration-[170ms] ease-out ${animateIn ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-2 scale-[0.98] opacity-0'}`
              : 'transition-none'
          }`}
          onClick={(event) => event.stopPropagation()}
        >
          <div
            className="rounded-[1.3rem] border border-white/8 shadow-xl"
            style={getGlassPanelStyle(transparency, 20)}
          >
            <div className="px-4 py-4">
              <input
                ref={inputRef}
                value={currentQuery}
                onChange={(event) => {
                  event.stopPropagation();
                  updateCurrentQuery(event.target.value);
                }}
                onKeyDown={handleInputKeyDown}
                placeholder={currentQuery ? currentState?.step.placeholder : PLACEHOLDERS[placeholderIndex]}
                className="w-full bg-transparent text-[15px] font-medium text-foreground outline-none placeholder:text-slate-400"
              />
            </div>

            {items.length > 0 && (
              <div className="max-h-[60vh] overflow-y-auto px-2 pb-2">
                {items.map((item, index) => {
                  const selected = index === selectedIndex;
                  const running = runningId === item.id;

                  return (
                    <button
                      key={item.id}
                      onClick={() => void executeItem(item)}
                      className={`flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                        selected ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-background/80'
                      } ${running ? 'opacity-70' : ''}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{item.title}</div>
                        {item.subtitle && (
                          <div className="truncate text-xs text-slate-400">{item.subtitle}</div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

const PLACEHOLDERS = [
  'Search or run a command…',
  'Open note…',
  'Delete…',
];
