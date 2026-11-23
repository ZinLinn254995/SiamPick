import {
  type MouseEvent as ReactMouseEvent,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Info, X } from 'lucide-react';
import type { DataStatus, Language } from '../../types/product';
import { TRANSLATIONS } from '../../i18n/translations';
import { StatusDot } from './StatusDot';

const POPOVER_OPEN_EVENT = 'siampick:info-popover-open';

const LEGEND_STATUSES: readonly DataStatus[] = [
  'verified',
  'estimated',
  'unverified',
  'unavailable',
];

export interface StatusLegendPopoverProps {
  language?: Language;
  className?: string;
}

interface PopoverCoords {
  top: number;
  left: number;
  arrowLeft: number;
  placement: 'top' | 'bottom';
  ready: boolean;
}

export function StatusLegendPopover({
  language = 'my',
  className = '',
}: StatusLegendPopoverProps) {
  const t = TRANSLATIONS[language];
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
  }, [open]);

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

  const descriptions: Record<DataStatus, string> = {
    verified: t.statusLegendDescVerified,
    estimated: t.statusLegendDescEstimated,
    unverified: t.statusLegendDescUnverified,
    unavailable: t.statusLegendDescUnavailable,
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        aria-label={t.statusLegendTrigger}
        aria-expanded={open}
        aria-controls={open ? `status-legend-${id}` : undefined}
        aria-haspopup="dialog"
        title={t.statusLegendTrigger}
        className={`relative inline-flex items-center justify-center w-8 h-8 rounded-full transition-all duration-150 hover:scale-105 active:scale-95 cursor-pointer shrink-0 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
          open
            ? 'bg-gradient-to-br from-emerald-600 to-teal-500 dark:from-emerald-400 dark:to-cyan-400 text-white dark:text-zinc-950 ring-2 ring-emerald-500/30 shadow-sm shadow-emerald-500/20'
            : 'text-zinc-500 dark:text-zinc-400 hover:text-emerald-700 dark:hover:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/50'
        } ${className}`}
      >
        <Info className="w-4 h-4 shrink-0" aria-hidden="true" />
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popoverRef}
            id={`status-legend-${id}`}
            role="dialog"
            aria-label={t.statusLegendTitle}
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
            className="z-[70] w-[min(340px,calc(100vw-24px))] rounded-2xl bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border border-zinc-200/90 dark:border-zinc-700/75 shadow-[0_20px_48px_-12px_rgba(9,9,11,0.22),0_0_0_1px_rgba(16,185,129,0.08)] dark:shadow-[0_24px_54px_-10px_rgba(0,0,0,0.8),0_0_0_1px_rgba(16,185,129,0.14)] text-left transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
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

            {/* Clipped Gradient Rim & Radial Glow */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-2xl overflow-hidden"
            >
              <div className="h-[2px] w-full bg-gradient-to-r from-emerald-500 via-cyan-500 to-indigo-500" />
              <div className="h-24 w-full bg-[radial-gradient(ellipse_at_top_left,rgba(16,185,129,0.09),transparent_62%)] dark:bg-[radial-gradient(ellipse_at_top_left,rgba(16,185,129,0.14),transparent_62%)]" />
            </div>

            <div className="relative max-h-[min(380px,65vh)] overflow-y-auto p-3.5 sm:p-4">
              <div className="flex items-start justify-between gap-2.5 mb-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-7 h-7 rounded-lg border bg-emerald-500/12 dark:bg-emerald-400/15 border-emerald-500/25 dark:border-emerald-400/30 text-emerald-700 dark:text-emerald-300 inline-flex items-center justify-center shrink-0">
                    <Info className="w-3.5 h-3.5" aria-hidden="true" />
                  </span>
                  <div className="font-display text-xs sm:text-[13px] font-bold text-zinc-950 dark:text-zinc-50 leading-snug">
                    {t.statusLegendTitle}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen(false);
                  }}
                  aria-label={t.reportClose}
                  className="relative w-7 h-7 -mt-0.5 -mr-0.5 rounded-lg before:content-[''] before:absolute before:-inset-1.5 inline-flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100/90 dark:hover:bg-zinc-800/90 active:scale-90 transition-all cursor-pointer shrink-0 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>

              <ul className="space-y-1.5">
                {LEGEND_STATUSES.map((st) => (
                  <li
                    key={st}
                    className="flex items-start gap-2.5 text-xs px-2.5 py-2 rounded-xl bg-zinc-50/85 dark:bg-zinc-800/45 border border-zinc-200/60 dark:border-zinc-700/45"
                  >
                    <StatusDot status={st} language={language} size="md" className="mt-0.5" />
                    <div className="min-w-0 flex-1 leading-snug">
                      <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                        {t.dataStatusLabels[st]}
                      </div>
                      <p className="text-zinc-500 dark:text-zinc-400 leading-relaxed mt-0.5">
                        {descriptions[st]}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
