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
  arrowLeft: number;
  placement: 'top' | 'bottom';
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
  const [coords, setCoords] = useState<PopoverCoords>({
    top: 0,
    left: 0,
    arrowLeft: 24,
    placement: 'bottom',
    ready: false,
  });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close when another InfoPopover or StatusLegendPopover opens
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

  // Compute viewport-safe fixed position + directional arrow offset
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
      const gap = 10;

      const triggerCenterX = triggerRect.left + triggerRect.width / 2;

      let left = triggerCenterX - popRect.width / 2;
      if (left < margin) left = margin;
      if (left + popRect.width > vw - margin) {
        left = Math.max(margin, vw - margin - popRect.width);
      }

      const arrowLeft = Math.max(18, Math.min(popRect.width - 18, triggerCenterX - left));

      const spaceBelow = vh - triggerRect.bottom - margin;
      const spaceAbove = triggerRect.top - margin;
      let placement: 'top' | 'bottom' = 'bottom';
      let top = triggerRect.bottom + gap;

      if (popRect.height + gap > spaceBelow && spaceAbove > spaceBelow) {
        placement = 'top';
        top = Math.max(margin, triggerRect.top - popRect.height - gap);
      } else if (top + popRect.height > vh - margin) {
        top = Math.max(margin, vh - margin - popRect.height);
      }

      setCoords({ top, left, arrowLeft, placement, ready: true });
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

  const isHelp = variant === 'help';
  const Icon = isHelp ? HelpCircle : Info;

  const triggerToneClass =
    tone === 'dark'
      ? open
        ? isHelp
          ? 'bg-gradient-to-br from-cyan-400 to-indigo-400 text-zinc-950 ring-2 ring-cyan-400/35 shadow-sm shadow-cyan-500/25'
          : 'bg-gradient-to-br from-emerald-400 to-cyan-400 text-zinc-950 ring-2 ring-emerald-400/35 shadow-sm shadow-emerald-500/25'
        : 'text-zinc-400 hover:text-white hover:bg-zinc-800/90'
      : open
        ? isHelp
          ? 'bg-gradient-to-br from-cyan-600 to-indigo-600 dark:from-cyan-400 dark:to-indigo-400 text-white dark:text-zinc-950 ring-2 ring-cyan-500/30 shadow-sm shadow-cyan-500/20'
          : 'bg-gradient-to-br from-emerald-600 to-teal-500 dark:from-emerald-400 dark:to-cyan-400 text-white dark:text-zinc-950 ring-2 ring-emerald-500/30 shadow-sm shadow-emerald-500/20'
        : 'text-zinc-500 dark:text-zinc-400 hover:text-emerald-700 dark:hover:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/50';

  const rimGradientClass = isHelp
    ? 'from-cyan-500 via-indigo-500 to-violet-500'
    : 'from-emerald-500 via-cyan-500 to-indigo-500';

  const emblemClass = isHelp
    ? 'bg-cyan-500/12 dark:bg-cyan-400/15 border-cyan-500/25 dark:border-cyan-400/30 text-cyan-700 dark:text-cyan-300'
    : 'bg-emerald-500/12 dark:bg-emerald-400/15 border-emerald-500/25 dark:border-emerald-400/30 text-emerald-700 dark:text-emerald-300';

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
        className={`relative inline-flex items-center justify-center w-6 h-6 rounded-full before:content-[''] before:absolute before:-inset-2 transition-all duration-150 hover:scale-105 active:scale-95 cursor-pointer shrink-0 touch-manipulation align-middle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-zinc-950 ${triggerToneClass} ${className}`}
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
              transform: coords.ready
                ? 'scale(1) translate3d(0, 0, 0)'
                : `scale(0.93) translate3d(0, ${coords.placement === 'bottom' ? '-6px' : '6px'}, 0)`,
              transformOrigin: `${coords.arrowLeft}px ${coords.placement === 'bottom' ? '0px' : '100%'}`,
            }}
            className="z-[70] w-[min(336px,calc(100vw-24px))] rounded-2xl bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border border-zinc-200/90 dark:border-zinc-700/75 shadow-[0_20px_48px_-12px_rgba(9,9,11,0.22),0_0_0_1px_rgba(16,185,129,0.08)] dark:shadow-[0_24px_54px_-10px_rgba(0,0,0,0.8),0_0_0_1px_rgba(16,185,129,0.14)] text-left transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
          >
            {/* Directional Pointer Diamond */}
            <span
              aria-hidden="true"
              style={{ left: `${coords.arrowLeft - 5}px` }}
              className={`pointer-events-none absolute w-2.5 h-2.5 rotate-45 bg-white dark:bg-zinc-900 ${
                coords.placement === 'bottom'
                  ? '-top-[6px] border-t border-l border-emerald-400/60 dark:border-emerald-400/50'
                  : '-bottom-[6px] border-b border-r border-zinc-200/90 dark:border-zinc-700/75'
              }`}
            />

            {/* Clipped Gradient Rim & Radial Atmospheric Glow */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-2xl overflow-hidden"
            >
              <div className={`h-[2px] w-full bg-gradient-to-r ${rimGradientClass}`} />
              <div
                className={`h-24 w-full ${
                  isHelp
                    ? 'bg-[radial-gradient(ellipse_at_top_left,rgba(6,182,212,0.09),transparent_62%)] dark:bg-[radial-gradient(ellipse_at_top_left,rgba(6,182,212,0.14),transparent_62%)]'
                    : 'bg-[radial-gradient(ellipse_at_top_left,rgba(16,185,129,0.09),transparent_62%)] dark:bg-[radial-gradient(ellipse_at_top_left,rgba(16,185,129,0.14),transparent_62%)]'
                }`}
              />
            </div>

            <div className="relative max-h-[min(340px,62vh)] overflow-y-auto p-3.5 sm:p-4">
              <div className="flex items-start justify-between gap-2.5">
                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                  <span
                    className={`w-7 h-7 rounded-lg border inline-flex items-center justify-center shrink-0 mt-0.5 ${emblemClass}`}
                  >
                    <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                  </span>

                  <div className="min-w-0 flex-1 pt-0.5">
                    {title ? (
                      <div className="font-display text-xs sm:text-[13px] font-bold text-zinc-950 dark:text-zinc-50 leading-snug">
                        {title}
                      </div>
                    ) : (
                      <div className="font-display text-xs font-semibold text-zinc-700 dark:text-zinc-300 leading-snug">
                        {label}
                      </div>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen(false);
                  }}
                  aria-label="Close"
                  className="relative w-7 h-7 -mt-0.5 -mr-0.5 rounded-lg before:content-[''] before:absolute before:-inset-1.5 inline-flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50 hover:bg-zinc-100/90 dark:hover:bg-zinc-800/90 active:scale-90 transition-all cursor-pointer shrink-0 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>

              <div className="mt-2.5 pt-2.5 border-t border-zinc-200/70 dark:border-zinc-800/80 text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed space-y-1.5">
                {typeof content === 'string' ? <p>{content}</p> : content}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
