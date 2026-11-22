import type { DataStatus, Language } from '../../types/product';
import { TRANSLATIONS } from '../../i18n/translations';

export interface StatusDotProps {
  status: DataStatus;
  language?: Language;
  size?: 'sm' | 'md';
  className?: string;
}

const SIZE_CLASSES: Record<'sm' | 'md', string> = {
  sm: 'w-3.5 h-3.5',
  md: 'w-4 h-4',
};

export function StatusDot({
  status,
  language = 'my',
  size = 'sm',
  className = '',
}: StatusDotProps) {
  const label = TRANSLATIONS[language].dataStatusLabels[status];
  const svgSize = SIZE_CLASSES[size];

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`inline-flex items-center justify-center shrink-0 ${className}`}
    >
      {status === 'verified' ? (
        <svg
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          className={`${svgSize} text-emerald-600 dark:text-emerald-500`}
        >
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path
            d="M5 8.2L7.1 10.3L11.2 6"
            stroke="#ffffff"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : status === 'estimated' ? (
        <svg
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          className={`${svgSize} text-amber-600 dark:text-amber-400`}
        >
          <circle
            cx="8"
            cy="8"
            r="6.25"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M8 1.75A6.25 6.25 0 0 0 8 14.25Z"
            fill="currentColor"
          />
        </svg>
      ) : status === 'unverified' ? (
        <svg
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          className={`${svgSize} text-zinc-500 dark:text-zinc-400`}
        >
          <circle
            cx="8"
            cy="8"
            r="6.25"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M6.4 6.2a1.7 1.7 0 0 1 3.2.7c0 1.1-1.6 1.3-1.6 2.3"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="8" cy="11.6" r="0.85" fill="currentColor" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          className={`${svgSize} text-zinc-500 dark:text-zinc-400`}
        >
          <circle
            cx="8"
            cy="8"
            r="6.25"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="2.6 2.2"
          />
        </svg>
      )}
      <span className="sr-only">{label}</span>
    </span>
  );
}

