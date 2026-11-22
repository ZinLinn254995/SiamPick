export type MiniBarTone = 'emerald' | 'amber' | 'red' | 'zinc' | 'sky' | 'violet' | 'teal' | 'slate';

export interface MiniBarProps {
  value: number | null;
  max?: number;
  tone: MiniBarTone;
  label?: string;
  weightPct?: number;
  valueText?: string;
  className?: string;
}

const FILL_CLASSES: Record<MiniBarTone, string> = {
  emerald: 'bg-emerald-600 dark:bg-emerald-400',
  amber: 'bg-amber-500 dark:bg-amber-400',
  red: 'bg-red-600 dark:bg-red-400',
  zinc: 'bg-zinc-500 dark:bg-zinc-400',
  sky: 'bg-sky-600 dark:bg-sky-400',
  violet: 'bg-violet-600 dark:bg-violet-400',
  teal: 'bg-teal-600 dark:bg-teal-400',
  slate: 'bg-slate-600 dark:bg-slate-400',
};

const VALUE_CLASSES: Record<MiniBarTone, string> = {
  emerald: 'text-emerald-700 dark:text-emerald-400',
  amber: 'text-amber-700 dark:text-amber-400',
  red: 'text-red-700 dark:text-red-400',
  zinc: 'text-zinc-700 dark:text-zinc-300',
  sky: 'text-sky-700 dark:text-sky-400',
  violet: 'text-violet-700 dark:text-violet-400',
  teal: 'text-teal-700 dark:text-teal-400',
  slate: 'text-slate-700 dark:text-slate-300',
};

export function MiniBar({
  value,
  max = 100,
  tone,
  label,
  weightPct,
  valueText,
  className = '',
}: MiniBarProps) {
  const safeMax = max > 0 ? max : 100;
  const isAvailable = typeof value === 'number' && Number.isFinite(value);
  const clampedValue = isAvailable ? Math.max(0, Math.min(safeMax, value)) : 0;
  const pct = (clampedValue / safeMax) * 100;

  const formattedValue =
    valueText ??
    (isAvailable
      ? Number.isInteger(clampedValue)
        ? String(clampedValue)
        : clampedValue.toFixed(1)
      : '—');

  return (
    <div className={`flex items-center gap-2.5 sm:gap-3 min-w-0 ${className}`}>
      {(label || typeof weightPct === 'number') && (
        <div className="flex items-baseline justify-between gap-1.5 w-[144px] sm:w-[172px] shrink-0">
          {label && (
            <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 leading-snug">
              {label}
            </span>
          )}
          {typeof weightPct === 'number' && Number.isFinite(weightPct) && (
            <span className="text-xs font-mono tabular-nums text-zinc-400 dark:text-zinc-500 shrink-0">
              {Math.round(weightPct)}%
            </span>
          )}
        </div>
      )}

      <div
        role="progressbar"
        aria-label={label ?? 'Score bar'}
        aria-valuenow={isAvailable ? Math.round(clampedValue) : 0}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        className="flex-1 min-w-[48px] h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-300 ease-out ${FILL_CLASSES[tone]}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <span
        className={`w-9 text-right font-mono text-xs font-semibold tabular-nums shrink-0 ${
          isAvailable ? VALUE_CLASSES[tone] : 'text-zinc-400 dark:text-zinc-500'
        }`}
      >
        {formattedValue}
      </span>
    </div>
  );
}
