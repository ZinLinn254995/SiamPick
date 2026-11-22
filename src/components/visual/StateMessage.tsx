import type { ReactNode } from 'react';
import { AlertCircle, Inbox } from 'lucide-react';

export interface StateMessageProps {
  variant: 'empty' | 'error';
  reason: string;
  title?: string;
  icon?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  actionIcon?: ReactNode;
  compact?: boolean;
  className?: string;
}

export function StateMessage({
  variant,
  reason,
  title,
  icon,
  actionLabel,
  onAction,
  actionIcon,
  compact = false,
  className = '',
}: StateMessageProps) {
  const isError = variant === 'error';

  const containerClasses = isError
    ? 'bg-red-50/80 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60 text-red-900 dark:text-red-100'
    : 'bg-zinc-50/70 dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200';

  const iconBoxClasses = isError
    ? 'bg-red-100 dark:bg-red-950/80 text-red-600 dark:text-red-400'
    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400';

  const reasonClasses = isError
    ? 'text-red-800 dark:text-red-300'
    : 'text-zinc-600 dark:text-zinc-400';

  const buttonClasses = isError
    ? 'bg-red-700 hover:bg-red-800 dark:bg-red-600 dark:hover:bg-red-500 text-white'
    : 'bg-zinc-950 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-950';

  const resolvedIcon =
    icon ??
    (isError ? (
      <AlertCircle className="w-5 h-5" aria-hidden="true" />
    ) : (
      <Inbox className="w-5 h-5" aria-hidden="true" />
    ));

  if (compact) {
    return (
      <div
        role={isError ? 'alert' : undefined}
        className={`rounded-xl px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${containerClasses} ${className}`}
      >
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <div
            className={`w-9 h-9 rounded-lg inline-flex items-center justify-center shrink-0 ${iconBoxClasses}`}
          >
            {resolvedIcon}
          </div>
          <div className="min-w-0">
            {title && (
              <div className="text-xs sm:text-sm font-semibold leading-snug">{title}</div>
            )}
            <p className={`text-xs sm:text-sm leading-snug ${title ? 'mt-0.5' : ''} ${reasonClasses}`}>
              {reason}
            </p>
          </div>
        </div>
        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            className={`inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 self-start sm:self-center ${buttonClasses}`}
          >
            {actionIcon}
            <span>{actionLabel}</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      role={isError ? 'alert' : undefined}
      className={`rounded-xl px-6 py-12 sm:py-14 text-center flex flex-col items-center justify-center ${containerClasses} ${className}`}
    >
      <div
        className={`w-11 h-11 rounded-xl inline-flex items-center justify-center mb-3.5 ${iconBoxClasses}`}
      >
        {resolvedIcon}
      </div>
      {title && (
        <h3 className="font-display text-base font-semibold leading-snug max-w-md">{title}</h3>
      )}
      <p
        className={`text-xs sm:text-sm max-w-md mx-auto leading-relaxed ${
          title ? 'mt-1.5' : ''
        } ${reasonClasses}`}
      >
        {reason}
      </p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className={`mt-5 inline-flex items-center justify-center gap-2 min-h-[40px] px-4 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${buttonClasses}`}
        >
          {actionIcon}
          <span>{actionLabel}</span>
        </button>
      )}
    </div>
  );
}
