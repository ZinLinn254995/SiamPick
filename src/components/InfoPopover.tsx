import {
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle, Info, X } from 'lucide-react';

const POPOVER_OPEN_EVENT = 'siampick:info-popover-open';

interface InfoPopoverProps {
  content: ReactNode;
  title?: string;
  label: string;
  variant?: 'info' | 'help';
  tone?: 'light' | 'dark';
  className?: string;
}

interface PopoverCoords {
  top: number;
  left: number;
  ready: boolean;
}

export function InfoPopover({
  content,
  title,
  label,
  variant = 'info',
  tone = 'light',
  className = '',
}: InfoPopoverProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<PopoverCoords>({ top: 0, left: 0, ready: false });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close when another InfoPopover opens
  useEffect(() => {
    const handleOtherOpen = (event: Event) => {
      const custom = event as CustomEvent<string>;
      if (custom.detail !== id) {
        setOpen(false);
      }
    };
    window.addEventListener(POPOVER_OPEN_EVENT, handleOtherOpen);
    return () => window.removeEventListener(POPOVER_OPEN_EVENT, handleOtherOpen);
  }, [id]);

  // Outside tap/click, Escape key, and scroll dismissal
  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    const handleScroll = (event: Event) => {
      const target = event.target as Node | null;
      if (target && popoverRef.current?.contains(target)) return;
      setOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [open]);

  // Compute viewport-safe fixed position (mobile & desktop)
  useLayoutEffect(() => {
    if (!open) {
      setCoords((prev) => (prev.ready ? { ...prev, ready: false } : prev));
      return;
    }

    const updatePosition = () => {
      const trigger = triggerRef.current;
      const popover = popoverRef.current;
      if (!trigger || !popover) return;

      const triggerRect = trigger.getBoundingClientRect();
      const popRect = popover.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const margin = 12;
      const gap = 8;

      // Center horizontally on trigger, clamped strictly within viewport padding
      let left = triggerRect.left + triggerRect.width / 2 - popRect.width / 2;
      if (left < margin) left = margin;
      if (left + popRect.width > vw - margin) {
        left = Math.max(margin, vw - margin - popRect.width);
      }

      // Prefer opening below; flip above if bottom would overflow viewport
      const spaceBelow = vh - triggerRect.bottom - margin;
      const spaceAbove = triggerRect.top - margin;
      let top = triggerRect.bottom + gap;
      if (popRect.height + gap > spaceBelow && spaceAbove > spaceBelow) {
        top = Math.max(margin, triggerRect.top - popRect.height - gap);
      } else if (top + popRect.height > vh - margin) {
        top = Math.max(margin, vh - margin - popRect.height);
      }

      setCoords({ top, left, ready: true });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    return () => window.removeEventListener('resize', updatePosition);
  }, [open, content, title]);

  const handleToggle = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setOpen((prev) => {
      const next = !prev;
      if (next) {
        window.dispatchEvent(new CustomEvent<string>(POPOVER_OPEN_EVENT, { detail: id }));
      }
      return next;
    });
  };

  const Icon = variant === 'help' ? HelpCircle : Info;

  const triggerToneClass =
    tone === 'dark'
      ? open
        ? 'bg-white text-zinc-950'
        : 'text-zinc-400 hover:text-white hover:bg-zinc-800/90'
      : open
        ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950'
        : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800';

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? `info-popover-${id}` : undefined}
        aria-haspopup="dialog"
        className={`inline-flex items-center justify-center w-6 h-6 rounded-full transition-colors duration-150 cursor-pointer shrink-0 touch-manipulation align-middle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-200 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-zinc-950 ${triggerToneClass} ${className}`}
      >
        <Icon className="w-3.5 h-3.5" aria-hidden="true" />
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popoverRef}
            id={`info-popover-${id}`}
            role="dialog"
            aria-label={title ?? label}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              opacity: coords.ready ? 1 : 0,
              transform: coords.ready ? 'translateY(0)' : 'translateY(-3px)',
            }}
            className="z-[70] w-[min(320px,calc(100vw-24px))] max-h-[min(320px,60vh)] overflow-y-auto rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-700/90 shadow-[0_14px_34px_-12px_rgba(9,9,11,0.18)] dark:shadow-[0_16px_36px_-10px_rgba(0,0,0,0.65)] p-3.5 text-left transition-[opacity,transform] duration-150 ease-out"
          >
            <div className="flex items-start justify-between gap-2.5">
              <div className="min-w-0 flex-1 space-y-1.5">
                {title && (
                  <div className="font-display text-xs font-semibold text-zinc-950 dark:text-zinc-50 leading-snug">
                    {title}
                  </div>
                )}
                <div className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed space-y-1.5">
                  {typeof content === 'string' ? <p>{content}</p> : content}
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                }}
                aria-label="Close"
                className="w-6 h-6 -mt-0.5 -mr-0.5 rounded-full inline-flex items-center justify-center text-zinc-400 dark:text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer shrink-0 touch-manipulation"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
