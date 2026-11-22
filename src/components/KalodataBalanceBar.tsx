import { RefreshCw } from 'lucide-react';
import type { Language } from '../types/product';
import { TRANSLATIONS } from '../i18n/translations';
import type { KalodataBalanceState } from '../hooks/useKalodataBalance';
import { StatusDot } from './visual';

interface KalodataBalanceBarProps {
  language: Language;
  balanceState: KalodataBalanceState;
}

function formatFieldLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function KalodataBalanceBar({ language, balanceState }: KalodataBalanceBarProps) {
  const t = TRANSLATIONS[language];
  const { status, loading, fetchError, refreshBalance } = balanceState;

  const errorMessage =
    fetchError ??
    (status && !status.ok
      ? language === 'my' && status.errorMy
        ? status.errorMy
        : status.error ?? 'Unknown error'
      : null);

  return (
    <section
      aria-label={t.kalodataSectionLabel}
      className="mt-4 sp-card px-4 sm:px-5 py-3.5"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          {loading ? (
            <span
              aria-hidden="true"
              className="w-3.5 h-3.5 rounded-full bg-zinc-200 dark:bg-zinc-800 animate-pulse motion-reduce:animate-none shrink-0 mt-1"
            />
          ) : (
            <span className="mt-0.5 shrink-0">
              <StatusDot
                status={status?.ok ? 'verified' : 'unavailable'}
                language={language}
              />
            </span>
          )}

          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                {t.kalodataSectionLabel}
              </span>
              {!loading && status?.ok && (
                <>
                  <span className="text-zinc-300 dark:text-zinc-700" aria-hidden="true">·</span>
                  <span className="font-mono text-sm font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums">
                    {status.balance !== null
                      ? status.balance.toLocaleString('en-US')
                      : t.dataStatusLabels.unavailable}
                    {status.balance !== null && status.unit ? ` ${status.unit}` : ''}
                  </span>
                </>
              )}
            </div>

            {loading ? (
              <div className="flex items-center gap-2 pt-0.5" role="status" aria-live="polite">
                <span
                  aria-hidden="true"
                  className="inline-block h-4 w-28 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse motion-reduce:animate-none"
                />
                <span
                  aria-hidden="true"
                  className="inline-block h-3.5 w-20 rounded bg-zinc-200/80 dark:bg-zinc-800/80 animate-pulse motion-reduce:animate-none"
                />
                <span className="sr-only">{t.kalodataChecking}</span>
              </div>
            ) : status?.ok ? (
              status.fields.length > 0 && (
                <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1 text-xs">
                  {status.fields.map((entry) => (
                    <span
                      key={entry.key}
                      className="font-mono text-xs text-zinc-600 dark:text-zinc-400 tabular-nums"
                    >
                      {formatFieldLabel(entry.key)}:{' '}
                      <span className="text-zinc-900 dark:text-zinc-100">{String(entry.value)}</span>
                    </span>
                  ))}
                </div>
              )
            ) : (
              <p className="text-xs text-red-700 dark:text-red-300 leading-relaxed">
                {errorMessage}
              </p>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => void refreshBalance()}
          disabled={loading}
          className="sp-btn-secondary w-full sm:w-auto shrink-0"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${loading ? 'animate-spin motion-reduce:animate-none' : ''}`}
            aria-hidden="true"
          />
          <span>{t.kalodataCheckBtn}</span>
        </button>
      </div>
    </section>
  );
}
