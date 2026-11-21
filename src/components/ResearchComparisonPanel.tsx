import { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, GitCompareArrows, Minus } from 'lucide-react';
import {
  ComparisonMetricDelta,
  Language,
  ResearchHistoryRecord,
  ResearchMode,
  ResearchProduct,
} from '../types/product';
import { formatThb } from '../utils/format';
import { compareResearchSessions } from '../utils/researchHistoryStorage';
import { formatResearchDateTime } from '../utils/savedProductsStorage';
import { TRANSLATIONS } from '../i18n/translations';

interface ResearchComparisonPanelProps {
  historyRecords: ResearchHistoryRecord[];
  initialOlderId?: string | null;
  initialNewerId?: string | null;
  onOpenProductReport: (product: ResearchProduct, researchDate: string) => void;
  language: Language;
}

function getModeLabel(mode: ResearchMode, language: Language): string {
  const t = TRANSLATIONS[language];
  if (mode === 'deep') return t.modeDeepTitle;
  if (mode === 'balanced') return t.modeBalancedTitle;
  return t.modeFastTitle;
}

function deltaToneClass(delta: number | null): string {
  if (delta === null || delta === 0) return 'text-zinc-500 dark:text-zinc-400';
  return delta > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400';
}

function DeltaIcon({ delta }: { delta: number | null }) {
  if (delta === null || delta === 0) {
    return <Minus className="w-3 h-3 shrink-0" aria-hidden="true" />;
  }
  return delta > 0 ? (
    <ArrowUpRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
  ) : (
    <ArrowDownRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
  );
}

function formatSignedNumber(val: number, decimals = 0): string {
  const absFormatted = Math.abs(val).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  if (val > 0) return `+${absFormatted}`;
  if (val < 0) return `-${absFormatted}`;
  return absFormatted;
}

function MetricDeltaCell({
  metric,
  kind,
  unavailableLabel,
  unchangedLabel,
}: {
  metric: ComparisonMetricDelta;
  kind: 'sales' | 'revenue' | 'growth' | 'commission' | 'score';
  unavailableLabel: string;
  unchangedLabel: string;
}) {
  if (!metric.available || metric.oldValue === null || metric.newValue === null || metric.delta === null) {
    return <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500">{unavailableLabel}</span>;
  }

  const delta = metric.delta;
  const deltaPct = metric.deltaPct;

  const formatSingle = (v: number): string => {
    if (kind === 'sales') return Math.round(v).toLocaleString('en-US');
    if (kind === 'revenue') return formatThb(Math.round(v));
    if (kind === 'growth') return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
    if (kind === 'commission') return `${v.toFixed(1)}%`;
    return `${Math.round(v)}`;
  };

  const formatDelta = (): string => {
    if (delta === 0) return unchangedLabel;
    if (kind === 'sales') {
      const base = formatSignedNumber(Math.round(delta), 0);
      return deltaPct !== null
        ? `${base} (${formatSignedNumber(deltaPct, 1)}%)`
        : base;
    }
    if (kind === 'revenue') {
      const sign = delta > 0 ? '+' : '-';
      const base = `${sign}${formatThb(Math.round(Math.abs(delta)))}`;
      return deltaPct !== null
        ? `${base} (${formatSignedNumber(deltaPct, 1)}%)`
        : base;
    }
    if (kind === 'growth' || kind === 'commission') {
      return `${formatSignedNumber(delta, 1)} pp`;
    }
    return `${formatSignedNumber(Math.round(delta), 0)} pts`;
  };

  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1 font-mono text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums whitespace-nowrap">
        <span>{formatSingle(metric.oldValue)}</span>
        <ArrowRight className="w-2.5 h-2.5 text-zinc-400 dark:text-zinc-500 shrink-0" aria-hidden="true" />
        <span className="text-zinc-900 dark:text-zinc-100 font-medium">{formatSingle(metric.newValue)}</span>
      </div>
      <div
        className={`inline-flex items-center gap-0.5 font-mono text-xs font-semibold tabular-nums whitespace-nowrap ${deltaToneClass(
          metric.delta
        )}`}
      >
        <DeltaIcon delta={metric.delta} />
        <span>{formatDelta()}</span>
      </div>
    </div>
  );
}

export function ResearchComparisonPanel({
  historyRecords,
  initialOlderId,
  initialNewerId,
  onOpenProductReport,
  language,
}: ResearchComparisonPanelProps) {
  const t = TRANSLATIONS[language];
  const isMy = language === 'my';

  // Records are sorted newest-first in storage
  const defaultNewer = initialNewerId ?? historyRecords[0]?.id ?? '';
  const defaultOlder =
    initialOlderId ??
    historyRecords.find((r) => r.id !== defaultNewer)?.id ??
    historyRecords[1]?.id ??
    '';

  const [olderId, setOlderId] = useState<string>(defaultOlder);
  const [newerId, setNewerId] = useState<string>(defaultNewer);

  useEffect(() => {
    if (initialOlderId && historyRecords.some((r) => r.id === initialOlderId)) {
      setOlderId(initialOlderId);
    }
  }, [initialOlderId, historyRecords]);

  useEffect(() => {
    if (initialNewerId && historyRecords.some((r) => r.id === initialNewerId)) {
      setNewerId(initialNewerId);
    }
  }, [initialNewerId, historyRecords]);

  useEffect(() => {
    if (historyRecords.length < 2) return;
    if (!historyRecords.some((r) => r.id === newerId)) {
      setNewerId(historyRecords[0].id);
    }
    if (!historyRecords.some((r) => r.id === olderId)) {
      const fallback = historyRecords.find((r) => r.id !== newerId) ?? historyRecords[1];
      setOlderId(fallback.id);
    }
  }, [historyRecords, olderId, newerId]);

  const olderRecord = useMemo(
    () => historyRecords.find((r) => r.id === olderId) ?? null,
    [historyRecords, olderId]
  );
  const newerRecord = useMemo(
    () => historyRecords.find((r) => r.id === newerId) ?? null,
    [historyRecords, newerId]
  );

  const comparison = useMemo(() => {
    if (!olderRecord || !newerRecord || olderRecord.id === newerRecord.id) {
      return null;
    }
    return compareResearchSessions(olderRecord, newerRecord);
  }, [olderRecord, newerRecord]);

  if (historyRecords.length < 2) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-xl px-6 py-14 text-center">
        <div className="w-11 h-11 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 inline-flex items-center justify-center mb-4">
          <GitCompareArrows className="w-5 h-5" aria-hidden="true" />
        </div>
        <h2 className="font-display text-base sm:text-lg font-semibold text-zinc-950 dark:text-zinc-50">
          {t.compareNeedTwoTitle}
        </h2>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400 max-w-md mx-auto leading-relaxed">
          {t.compareNeedTwoDesc}
        </p>
      </div>
    );
  }

  const formatOptionLabel = (rec: ResearchHistoryRecord): string => {
    const dt = formatResearchDateTime(rec.researchedAt, language);
    return `${dt} · ${getModeLabel(rec.researchMode, language)} (${rec.productCount} ${t.quantityProductsUnit})`;
  };

  return (
    <div className="space-y-5">
      {/* Selector Bar */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-xl p-5 space-y-4">
        <div>
          <h2 className="font-display text-base font-semibold text-zinc-950 dark:text-zinc-50">
            {t.compareHeading}
          </h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">{t.compareSubtitle}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="compare-older-select" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              {t.compareOlderLabel}
            </label>
            <select
              id="compare-older-select"
              value={olderId}
              onChange={(e) => setOlderId(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 text-xs sm:text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-300 cursor-pointer"
            >
              {historyRecords.map((rec) => (
                <option key={rec.id} value={rec.id}>
                  {formatOptionLabel(rec)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="compare-newer-select" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              {t.compareNewerLabel}
            </label>
            <select
              id="compare-newer-select"
              value={newerId}
              onChange={(e) => setNewerId(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 text-xs sm:text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-300 cursor-pointer"
            >
              {historyRecords.map((rec) => (
                <option key={rec.id} value={rec.id}>
                  {formatOptionLabel(rec)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <p className="text-xs text-zinc-500 dark:text-zinc-400 pt-2 border-t border-zinc-100 dark:border-zinc-800/70 leading-relaxed">
          {t.compareExactIdRule}
        </p>
      </div>

      {/* Same Session Warning */}
      {olderRecord && newerRecord && olderRecord.id === newerRecord.id && (
        <div className="bg-white dark:bg-zinc-900 border border-amber-200 dark:border-amber-800/60 rounded-xl p-5 text-xs text-amber-800 dark:text-amber-300">
          {t.compareSelectDifferentHint}
        </div>
      )}

      {/* Comparison Results */}
      {comparison && (
        <div className="space-y-4">
          {/* Summary Strip */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-zinc-600 dark:text-zinc-400 px-1">
            <span>
              <strong className="font-mono text-zinc-950 dark:text-zinc-50 tabular-nums">
                {comparison.matchedProducts.length}
              </strong>{' '}
              {t.compareMatchedCount}
            </span>
            <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-600">
              ·
            </span>
            <span>
              <strong className="font-mono text-zinc-900 dark:text-zinc-100 tabular-nums">
                {comparison.onlyInOlderCount}
              </strong>{' '}
              {t.compareOnlyOlder}
            </span>
            <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-600">
              ·
            </span>
            <span>
              <strong className="font-mono text-zinc-900 dark:text-zinc-100 tabular-nums">
                {comparison.onlyInNewerCount}
              </strong>{' '}
              {t.compareOnlyNewer}
            </span>
          </div>

          {comparison.matchedProducts.length === 0 ? (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-xl px-6 py-12 text-center">
              <h3 className="font-display text-sm sm:text-base font-semibold text-zinc-950 dark:text-zinc-50">
                {t.compareNoMatchesTitle}
              </h3>
              <p className="mt-1.5 text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 max-w-lg mx-auto leading-relaxed">
                {t.compareNoMatchesDesc}
              </p>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden lg:block bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-800/40 text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">
                        <th className="py-3 px-4">{t.compareColProduct}</th>
                        <th className="py-3 px-4">{t.compareColSales}</th>
                        <th className="py-3 px-4">{t.compareColRevenue}</th>
                        <th className="py-3 px-4">{t.compareColGrowth}</th>
                        <th className="py-3 px-4">{t.compareColCommission}</th>
                        <th className="py-3 px-4">{t.compareColScore}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70 text-xs">
                      {comparison.matchedProducts.map((row) => (
                        <tr key={row.canonicalProductId} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/60 transition-colors">
                          <td className="py-3.5 px-4 max-w-[280px]">
                            <button
                              type="button"
                              onClick={() =>
                                onOpenProductReport(row.newerProduct, comparison.newerRecord.researchedAt)
                              }
                              className="text-left cursor-pointer group"
                            >
                              <div className="font-medium text-zinc-950 dark:text-zinc-50 group-hover:underline line-clamp-2">
                                {isMy ? row.nameMy : row.name}
                              </div>
                              <div className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                                <span className="font-mono text-zinc-400 dark:text-zinc-500">ID: {row.canonicalProductId}</span>
                                {' · '}
                                {row.shopName}
                              </div>
                            </button>
                          </td>
                          <td className="py-3.5 px-4">
                            <MetricDeltaCell
                              metric={row.sales}
                              kind="sales"
                              unavailableLabel={t.dataStatusLabels.unavailable}
                              unchangedLabel={t.compareUnchanged}
                            />
                          </td>
                          <td className="py-3.5 px-4">
                            <MetricDeltaCell
                              metric={row.revenue}
                              kind="revenue"
                              unavailableLabel={t.dataStatusLabels.unavailable}
                              unchangedLabel={t.compareUnchanged}
                            />
                          </td>
                          <td className="py-3.5 px-4">
                            <MetricDeltaCell
                              metric={row.growth}
                              kind="growth"
                              unavailableLabel={t.dataStatusLabels.unavailable}
                              unchangedLabel={t.compareUnchanged}
                            />
                          </td>
                          <td className="py-3.5 px-4">
                            <MetricDeltaCell
                              metric={row.commission}
                              kind="commission"
                              unavailableLabel={t.dataStatusLabels.unavailable}
                              unchangedLabel={t.compareUnchanged}
                            />
                          </td>
                          <td className="py-3.5 px-4">
                            <MetricDeltaCell
                              metric={row.score}
                              kind="score"
                              unavailableLabel={t.dataStatusLabels.unavailable}
                              unchangedLabel={t.compareUnchanged}
                            />
                            <div className="mt-0.5 text-[10px] text-zinc-400 dark:text-zinc-500">
                              {t.confidenceLabels[row.olderConfidence]} →{' '}
                              {t.confidenceLabels[row.newerConfidence]}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile / Tablet Cards */}
              <div className="lg:hidden space-y-3">
                {comparison.matchedProducts.map((row) => (
                  <article
                    key={row.canonicalProductId}
                    className="bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-xl p-4 space-y-3"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        onOpenProductReport(row.newerProduct, comparison.newerRecord.researchedAt)
                      }
                      className="text-left w-full cursor-pointer"
                    >
                      <h3 className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-50 leading-snug">
                        {isMy ? row.nameMy : row.name}
                      </h3>
                      <div className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                        <span className="font-mono text-zinc-400 dark:text-zinc-500">ID: {row.canonicalProductId}</span>
                        {' · '}
                        {row.shopName}
                      </div>
                    </button>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800/70">
                      <div>
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mb-0.5">{t.compareColSales}</div>
                        <MetricDeltaCell
                          metric={row.sales}
                          kind="sales"
                          unavailableLabel={t.dataStatusLabels.unavailable}
                          unchangedLabel={t.compareUnchanged}
                        />
                      </div>
                      <div>
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mb-0.5">{t.compareColRevenue}</div>
                        <MetricDeltaCell
                          metric={row.revenue}
                          kind="revenue"
                          unavailableLabel={t.dataStatusLabels.unavailable}
                          unchangedLabel={t.compareUnchanged}
                        />
                      </div>
                      <div>
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mb-0.5">{t.compareColGrowth}</div>
                        <MetricDeltaCell
                          metric={row.growth}
                          kind="growth"
                          unavailableLabel={t.dataStatusLabels.unavailable}
                          unchangedLabel={t.compareUnchanged}
                        />
                      </div>
                      <div>
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mb-0.5">{t.compareColCommission}</div>
                        <MetricDeltaCell
                          metric={row.commission}
                          kind="commission"
                          unavailableLabel={t.dataStatusLabels.unavailable}
                          unchangedLabel={t.compareUnchanged}
                        />
                      </div>
                      <div>
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mb-0.5">{t.compareColScore}</div>
                        <MetricDeltaCell
                          metric={row.score}
                          kind="score"
                          unavailableLabel={t.dataStatusLabels.unavailable}
                          unchangedLabel={t.compareUnchanged}
                        />
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
