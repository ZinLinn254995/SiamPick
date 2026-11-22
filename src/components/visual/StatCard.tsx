import type { ReactNode } from 'react';

export type StatCardTone =
  | 'emerald'
  | 'amber'
  | 'red'
  | 'zinc'
  | 'sky'
  | 'violet'
  | 'teal'
  | 'slate';

export interface StatCardProps {
  label: string;
  value: string | number;
  unit?: string;
  sub?: string;
  tone?: StatCardTone;
  icon?: ReactNode;
  progress?: number;
  className?: string;
}

const VALUE_TONE_CLASSES: Record<StatCardTone, string> = {
  emerald: 'text-emerald-700 dark:text-emerald-400',
  amber: 'text-amber-700 dark:text-amber-400',
  red: 'text-red-700 dark:text-red-400',
  zinc: 'text-zinc-950 dark:text-zinc-50',
  sky: 'text-sky-700 dark:text-sky-400',
  violet: 'text-violet-700 dark:text-violet-400',
  teal: 'text-teal-700 dark:text-teal-400',
  slate: 'text-slate-800 dark:text-slate-200',
};

const BAR_TONE_CLASSES: Record<StatCardTone, string> = {
  emerald: 'bg-emerald-600 dark:bg-emerald-400',
  amber: 'bg-amber-600 dark:bg-amber-400',
  red: 'bg-red-600 dark:bg-red-400',
  zinc: 'bg-zinc-900 dark:bg-zinc-200',
  sky: 'bg-sky-600 dark:bg-sky-400',
  violet: 'bg-violet-600 dark:bg-violet-400',
  teal: 'bg-teal-600 dark:bg-teal-400',
  slate: 'bg-slate-600 dark:bg-slate-400',
};

const ICON_TONE_CLASSES: Record<StatCardTone, string> = {
  emerald: 'text-emerald-600 dark:text-emerald-400',
  amber: 'text-amber-600 dark:text-amber-400',
  red: 'text-red-600 dark:text-red-400',
  zinc: 'text-zinc-500 dark:text-zinc-400',
  sky: 'text-sky-600 dark:text-sky-400',
  violet: 'text-violet-600 dark:text-violet-400',
  teal: 'text-teal-600 dark:text-teal-400',
  slate: 'text-slate-600 dark:text-slate-400',
};

export function StatCard({
  label,
  value,
  unit,
  sub,
  tone = 'zinc',
  icon,
  progress,
  className = '',
}: StatCardProps) {
  const hasProgress = typeof progress === 'number' && Number.isFinite(progress);
  const clampedProgress = hasProgress ? Math.max(0, Math.min(100, progress)) : 0;
  const valueStr = String(value);
  const valueSizeClass =
    valueStr.length >= 10
      ? 'text-base sm:text-xl'
      : valueStr.length >= 7
        ? 'text-lg sm:text-2xl'
        : 'text-xl sm:text-2xl';

  return (
    <div
      aria-label={`${label}: ${value}${unit ? ` ${unit}` : ''}`}
      className={`min-w-0 sp-card p-3 sm:p-4 flex flex-col justify-start gap-1.5 ${className}`}
    >
      <div className="flex items-center justify-between gap-1.5 min-w-0">
        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400 truncate">
          {label}
        </span>
        {icon && (
          <span className={`shrink-0 ${ICON_TONE_CLASSES[tone]}`} aria-hidden="true">
            {icon}
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-1 min-w-0 flex-wrap">
        <span
          className={`font-mono ${valueSizeClass} font-bold tabular-nums tracking-tight leading-tight break-words max-w-full ${VALUE_TONE_CLASSES[tone]}`}
        >
          {value}
        </span>
        {unit && (
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
            {unit}
          </span>
        )}
      </div>

      {hasProgress && (
        <div
          role="progressbar"
          aria-label={label}
          aria-valuenow={Math.round(clampedProgress)}
          aria-valuemin={0}
          aria-valuemax={100}
          className="mt-1 w-full h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden"
        >
          <div
            className={`h-full rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none ${BAR_TONE_CLASSES[tone]}`}
            style={{ width: `${clampedProgress}%` }}
          />
        </div>
      )}

      {sub && (
        <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-snug break-words">
          {sub}
        </p>
      )}
    </div>
  );
}
