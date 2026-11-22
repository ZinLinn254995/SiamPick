import { AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';
import type { Language } from '../types/product';
import { TRANSLATIONS } from '../i18n/translations';
import type { KalodataBalanceState } from '../hooks/useKalodataBalance';

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
      className="mt-4 bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-xl px-4 sm:px-5 py-3.5 transition-colors"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          {loading ? (
            <span
              aria-hidden="true"
              className="w-4 h-4 rounded-full bg-zinc-200 dark:bg-zinc-800 animate-pulse shrink-0 mt-0.5"
            />
          ) : status?.ok ? (
            <CheckCircle2
              className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5"
              aria-hidden="true"
            />
          ) : (
            <AlertCircle
              className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5"
              aria-hidden="true"
            />
          )}

          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs">
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                {t.kalodataSectionLabel}
              </span>
              <span className="text-zinc-300 dark:text-zinc-700" aria-hidden="true">·</span>
              <span className="font-mono text-xs text-zinc-400 dark:text-zinc-500">
                GET /openapi/v1/credit/balance
              </span>
            </div>

            {loading ? (
              <div className="flex items-center gap-2 pt-0.5" role="status" aria-live="polite">
                <span
                  aria-hidden="true"
                  className="inline-block h-4 w-28 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse"
                />
                <span
                  aria-hidden="true"
                  className="inline-block h-3.5 w-20 rounded bg-zinc-200/80 dark:bg-zinc-800/80 animate-pulse"
                />
                <span className="sr-only">{t.kalodataChecking}</span>
              </div>
            ) : status?.ok ? (
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs">
                <span className="text-zinc-600 dark:text-zinc-400">
                  {t.kalodataBalanceLabel}:{' '}
                  <strong className="font-mono text-sm font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums">
                    {status.balance !== null
                      ? status.balance.toLocaleString()
                      : t.dataStatusLabels.unavailable}
                    {status.balance !== null && status.unit ? ` ${status.unit}` : ''}
                  </strong>
                </span>
                {status.fields.map((entry) => (
                  <span
                    key={entry.key}
                    className="font-mono text-xs text-zinc-500 dark:text-zinc-400 tabular-nums"
                  >
                    {formatFieldLabel(entry.key)}:{' '}
                    <span className="text-zinc-800 dark:text-zinc-200">{String(entry.value)}</span>
                  </span>
                ))}
              </div>
            ) : (
              <div className="space-y-0.5">
                <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
                  {errorMessage}
                </p>
                {(status?.upstreamCode || status?.errorCategory) && (
                  <p className="font-mono text-xs text-zinc-400 dark:text-zinc-500">
                    {[
                      status.httpStatus ? `HTTP ${status.httpStatus}` : null,
                      status.upstreamCode ? `Code: ${status.upstreamCode}` : null,
                      status.errorCategory ? `Category: ${status.errorCategory}` : null,
                      `Header: ${status.authHeader}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => void refreshBalance()}
          disabled={loading}
          className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:border-zinc-400 dark:hover:border-zinc-500 hover:text-zinc-950 dark:hover:text-zinc-50 disabled:opacity-60 transition-colors cursor-pointer whitespace-nowrap shrink-0 self-start sm:self-center"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          <span>{t.kalodataCheckBtn}</span>
        </button>
      </div>
    </section>
  );
}
