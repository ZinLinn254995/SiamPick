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
  ready: boolean;
}

export function StatusLegendPopover({
  language = 'my',
  className = '',
}: StatusLegendPopoverProps) {
  const t = TRANSLATIONS[language];
  const id = useId();
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<PopoverCoords>({ top: 0, left: 0, ready: false });
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
      const gap = 8;

      let left = triggerRect.left + triggerRect.width / 2 - popRect.width / 2;
      if (left < margin) left = margin;
      if (left + popRect.width > vw - margin) {
        left = Math.max(margin, vw - margin - popRect.width);
      }

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
        className={`inline-flex items-center gap-1.5 min-h-[40px] px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer shrink-0 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-200 ${
          open
            ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950 border-zinc-900 dark:border-zinc-100'
            : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 hover:text-zinc-950 dark:hover:text-zinc-50'
        } ${className}`}
      >
        <span className="inline-flex items-center gap-1" aria-hidden="true">
          {LEGEND_STATUSES.map((st) => (
            <StatusDot key={st} status={st} language={language} size="sm" />
          ))}
        </span>
        <Info className="w-3.5 h-3.5 opacity-75 shrink-0" aria-hidden="true" />
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
              transform: coords.ready ? 'translateY(0)' : 'translateY(-3px)',
            }}
            className="z-[70] w-[min(320px,calc(100vw-24px))] rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-700/90 shadow-[0_14px_34px_-12px_rgba(9,9,11,0.18)] dark:shadow-[0_16px_36px_-10px_rgba(0,0,0,0.65)] p-3.5 text-left transition-[opacity,transform] duration-150 ease-out"
          >
            <div className="flex items-start justify-between gap-2.5 mb-2.5">
              <div className="font-display text-xs font-semibold text-zinc-950 dark:text-zinc-50 leading-snug">
                {t.statusLegendTitle}
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                }}
                aria-label={t.reportClose}
                className="w-10 h-10 -mt-2 -mr-2 rounded-full inline-flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer shrink-0 touch-manipulation"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <ul className="space-y-2">
              {LEGEND_STATUSES.map((st) => (
                <li key={st} className="flex items-start gap-2.5 text-xs">
                  <StatusDot status={st} language={language} size="md" className="mt-0.5" />
                  <div className="min-w-0 flex-1 leading-snug">
                    <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                      {t.dataStatusLabels[st]}
                    </div>
                    <p className="text-zinc-500 dark:text-zinc-400 leading-relaxed">
                      {descriptions[st]}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>,
          document.body
        )}
    </>
  );
}
