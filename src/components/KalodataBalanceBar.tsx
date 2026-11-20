import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import type { Language } from '../types/product';
import { TRANSLATIONS } from '../i18n/translations';

interface KalodataBalanceEntry {
  key: string;
  value: string | number | boolean;
}

interface KalodataBalanceResponse {
  ok: boolean;
  configured: boolean;
  endpoint: string;
  authHeader: string;
  httpStatus: number | null;
  checkedAt: string;
  balance: number | null;
  unit: string | null;
  fields: KalodataBalanceEntry[];
  rawData: unknown;
  upstreamCode?: string;
  errorCategory?: string;
  error?: string;
  errorMy?: string;
}

interface KalodataBalanceBarProps {
  language: Language;
  refreshSignal?: number;
}

function formatFieldLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function KalodataBalanceBar({ language, refreshSignal = 0 }: KalodataBalanceBarProps) {
  const t = TRANSLATIONS[language];
  const [status, setStatus] = useState<KalodataBalanceResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const checkBalance = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch('/api/kalodata/balance', {
        method: 'GET',
        cache: 'no-store',
      });
      const data = (await res.json().catch(() => null)) as KalodataBalanceResponse | null;
      if (!data) {
        setStatus(null);
        setFetchError(`HTTP ${res.status}`);
        return;
      }
      setStatus(data);
    } catch (err) {
      setStatus(null);
      setFetchError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void checkBalance();
  }, [checkBalance, refreshSignal]);

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
      className="mt-4 bg-white border border-zinc-200/90 rounded-xl px-5 py-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          {loading ? (
            <Loader2
              className="w-4 h-4 text-zinc-500 animate-spin shrink-0 mt-0.5"
              aria-hidden="true"
            />
          ) : status?.ok ? (
            <CheckCircle2
              className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5"
              aria-hidden="true"
            />
          ) : (
            <AlertCircle
              className="w-4 h-4 text-amber-700 shrink-0 mt-0.5"
              aria-hidden="true"
            />
          )}

          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <span className="text-xs font-semibold text-zinc-950">
                {t.kalodataSectionLabel}
              </span>
              <span className="font-mono text-[11px] text-zinc-400">
                GET /openapi/v1/credit/balance
              </span>
            </div>

            {loading ? (
              <p className="text-xs text-zinc-500">{t.kalodataChecking}</p>
            ) : status?.ok ? (
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <p className="text-xs sm:text-sm text-zinc-800">
                  <span className="text-zinc-500 mr-1.5">{t.kalodataBalanceLabel}:</span>
                  <span className="font-mono font-semibold text-zinc-950 tabular-nums">
                    {status.balance !== null
                      ? status.balance.toLocaleString()
                      : JSON.stringify(status.rawData)}
                  </span>
                  {status.balance !== null && status.unit && (
                    <span className="ml-1 text-xs text-zinc-500 font-mono">{status.unit}</span>
                  )}
                </p>

                {status.fields.length > 1 && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-zinc-500">
                    {status.fields.map((entry) => (
                      <span key={entry.key} className="font-mono tabular-nums">
                        {formatFieldLabel(entry.key)}:{' '}
                        <span className="text-zinc-800">{String(entry.value)}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-xs text-zinc-700 leading-relaxed">{errorMessage}</p>
                {(status?.upstreamCode || status?.errorCategory) && (
                  <p className="font-mono text-[11px] text-zinc-400">
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
          onClick={() => void checkBalance()}
          disabled={loading}
          className="inline-flex items-center justify-center gap-1.5 min-h-[34px] px-3 py-1.5 text-xs font-medium text-zinc-700 bg-white border border-zinc-200 rounded-lg hover:border-zinc-400 hover:text-zinc-950 disabled:opacity-60 transition-colors cursor-pointer whitespace-nowrap shrink-0 self-start sm:self-center"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          <span>{t.kalodataCheckBtn}</span>
        </button>
      </div>
    </section>
  );
}
