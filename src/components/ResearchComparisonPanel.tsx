import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Clock,
  GitCompareArrows,
  Minus,
  RotateCcw,
} from 'lucide-react';
import {
  ComparisonMetricDelta,
  Language,
  ProductComparisonRow,
  ResearchHistoryRecord,
  ResearchMode,
  ResearchProduct,
} from '../types/product';
import { formatThb } from '../utils/format';
import { compareResearchSessions } from '../utils/researchHistoryStorage';
import { formatResearchDateTime } from '../utils/savedProductsStorage';
import { TRANSLATIONS } from '../i18n/translations';
import { StateMessage } from './visual';

interface ResearchComparisonPanelProps {
  historyRecords: ResearchHistoryRecord[];
  initialOlderId?: string | null;
  initialNewerId?: string | null;
  onOpenProductReport: (product: ResearchProduct, researchDate: string) => void;
  language: Language;
}

type TrendFilter = 'all' | 'improved' | 'declined' | 'unchanged';

function getModeLabel(mode: ResearchMode, language: Language): string {
  const t = TRANSLATIONS[language];
  if (mode === 'deep') return t.modeDeepTitle;
  if (mode === 'balanced') return t.modeBalancedTitle;
  return t.modeFastTitle;
}

function classifyMatchedTrend(
  row: ProductComparisonRow
): 'improved' | 'declined' | 'unchanged' {
  const primaryDelta =
    row.score.available && row.score.delta !== null
      ? row.score.delta
      : row.revenue.available && row.revenue.delta !== null
        ? row.revenue.delta
        : row.sales.available && row.sales.delta !== null
          ? row.sales.delta
          : 0;
  if (primaryDelta > 0) return 'improved';
  if (primaryDelta < 0) return 'declined';
  return 'unchanged';
}

function formatPeriodBetween(
  olderIso: string,
  newerIso: string,
  language: Language
): string {
  const olderMs = new Date(olderIso).getTime();
  const newerMs = new Date(newerIso).getTime();
  if (!Number.isFinite(olderMs) || !Number.isFinite(newerMs)) return '—';
  const diffMs = Math.abs(newerMs - olderMs);
  const totalMinutes = Math.round(diffMs / 60_000);
  const isMy = language === 'my';

  if (totalMinutes < 1) {
    return isMy ? '< 1 မိနစ်' : '< 1 min';
  }
  if (totalMinutes < 60) {
    return isMy ? `${totalMinutes} မိနစ်` : `${totalMinutes} min`;
  }
  const totalHours = Math.floor(totalMinutes / 60);
  const remMinutes = totalMinutes % 60;
  if (totalHours < 24) {
    if (remMinutes > 0) {
      return isMy
        ? `${totalHours} နာရီ ${remMinutes} မိနစ်`
        : `${totalHours}h ${remMinutes}m`;
    }
    return isMy ? `${totalHours} နာရီ` : `${totalHours} hr`;
  }
  const days = Math.floor(totalHours / 24);
  const remHours = totalHours % 24;
  if (days < 7 && remHours > 0) {
    return isMy ? `${days} ရက် ${remHours} နာရီ` : `${days}d ${remHours}h`;
  }
  return isMy ? `${days} ရက်` : `${days} ${days === 1 ? 'day' : 'days'}`;
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

function MetricDeltaCell({
  metric,
  kind,
  unavailableLabel,
  unchangedLabel,
  beforeLabel,
  afterLabel,
}: {
  metric: ComparisonMetricDelta;
  kind: 'sales' | 'revenue' | 'growth' | 'commission' | 'score';
  unavailableLabel: string;
  unchangedLabel: string;
  beforeLabel: string;
  afterLabel: string;
}) {
  if (
    !metric.available ||
    metric.oldValue === null ||
    metric.newValue === null ||
    metric.delta === null
  ) {
    return (
      <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
        {unavailableLabel}
      </span>
    );
  }

  const oldVal = metric.oldValue;
  const newVal = metric.newValue;
  const delta = metric.delta;
  const computedPct =
    metric.deltaPct !== null
      ? metric.deltaPct
      : oldVal !== 0
        ? ((newVal - oldVal) / Math.abs(oldVal)) * 100
        : null;

  const formatSingle = (v: number): string => {
    if (kind === 'sales') return Math.round(v).toLocaleString('en-US');
    if (kind === 'revenue') return formatThb(Math.round(v));
    if (kind === 'growth') return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
    if (kind === 'commission') return `${v.toFixed(1)}%`;
    return `${Math.round(v)}`;
  };

  const chipText = (() => {
    if (delta === 0) return `0% · ${unchangedLabel}`;
    if (computedPct !== null && Number.isFinite(computedPct)) {
      return `${formatSignedNumber(computedPct, 1)}%`;
    }
    if (kind === 'growth' || kind === 'commission') {
      return `${formatSignedNumber(delta, 1)} pp`;
    }
    if (kind === 'score') {
      return `${formatSignedNumber(Math.round(delta), 0)} pts`;
    }
    return formatSignedNumber(Math.round(delta), 0);
  })();

  const chipClasses =
    delta > 0
      ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/70'
      : delta < 0
        ? 'bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800/70'
        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700';

  const maxMagnitude = Math.max(Math.abs(oldVal), Math.abs(newVal), 1);
  const beforePct = Math.max(4, Math.min(100, Math.round((Math.abs(oldVal) / maxMagnitude) * 100)));
  const afterPct = Math.max(4, Math.min(100, Math.round((Math.abs(newVal) / maxMagnitude) * 100)));
  const afterBarClass =
    delta > 0
      ? 'bg-emerald-500 dark:bg-emerald-400'
      : delta < 0
        ? 'bg-red-500 dark:bg-red-400'
        : 'bg-zinc-400 dark:bg-zinc-500';

  return (
    <div className="space-y-1.5 min-w-0 lg:min-w-[132px]">
      <div className="flex items-center justify-between gap-2">
        <span
          className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md border font-mono text-xs font-semibold tabular-nums whitespace-nowrap ${chipClasses}`}
        >
          <DeltaIcon delta={delta} />
          <span>{chipText}</span>
        </span>
      </div>

      {/* Before -> After Mini Bar */}
      <div
        className="space-y-1"
        aria-label={`${beforeLabel}: ${formatSingle(oldVal)}, ${afterLabel}: ${formatSingle(newVal)}`}
      >
        <div className="h-1.5 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-zinc-300 dark:bg-zinc-600 transition-all duration-300 motion-reduce:transition-none"
            style={{ width: `${beforePct}%` }}
          />
        </div>
        <div className="h-1.5 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 motion-reduce:transition-none ${afterBarClass}`}
            style={{ width: `${afterPct}%` }}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1 font-mono text-xs text-zinc-600 dark:text-zinc-400 tabular-nums">
        <span>{formatSingle(oldVal)}</span>
        <ArrowRight className="w-2.5 h-2.5 text-zinc-500 dark:text-zinc-400 shrink-0" aria-hidden="true" />
        <span className="text-zinc-900 dark:text-zinc-100 font-medium">{formatSingle(newVal)}</span>
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

  const defaultNewer = initialNewerId ?? historyRecords[0]?.id ?? '';
  const defaultOlder =
    initialOlderId ??
    historyRecords.find((r) => r.id !== defaultNewer)?.id ??
    historyRecords[1]?.id ??
    '';

  const [olderId, setOlderId] = useState<string>(defaultOlder);
  const [newerId, setNewerId] = useState<string>(defaultNewer);
  const [trendFilter, setTrendFilter] = useState<TrendFilter>('all');

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

  const trendBuckets = useMemo(() => {
    if (!comparison) {
      return { improved: 0, declined: 0, unchanged: 0, tagged: [] as Array<{ row: ProductComparisonRow; trend: 'improved' | 'declined' | 'unchanged' }> };
    }
    let improved = 0;
    let declined = 0;
    let unchanged = 0;
    const tagged = comparison.matchedProducts.map((row) => {
      const trend = classifyMatchedTrend(row);
      if (trend === 'improved') improved += 1;
      else if (trend === 'declined') declined += 1;
      else unchanged += 1;
      return { row, trend };
    });
    return { improved, declined, unchanged, tagged };
  }, [comparison]);

  const visibleRows = useMemo(() => {
    if (trendFilter === 'all') return trendBuckets.tagged.map((x) => x.row);
    return trendBuckets.tagged
      .filter((x) => x.trend === trendFilter)
      .map((x) => x.row);
  }, [trendBuckets, trendFilter]);

  const periodLabel = useMemo(() => {
    if (!olderRecord || !newerRecord || olderRecord.id === newerRecord.id) return null;
    return formatPeriodBetween(olderRecord.researchedAt, newerRecord.researchedAt, language);
  }, [olderRecord, newerRecord, language]);

  const handleUseLatestTwo = () => {
    if (historyRecords.length >= 2) {
      setNewerId(historyRecords[0].id);
      setOlderId(historyRecords[1].id);
      setTrendFilter('all');
    }
  };

  if (historyRecords.length < 2) {
    return (
      <StateMessage
        variant="empty"
        icon={<GitCompareArrows className="w-5 h-5" aria-hidden="true" />}
        title={t.compareNeedTwoTitle}
        reason={t.compareNeedTwoDesc}
      />
    );
  }

  const formatOptionLabel = (rec: ResearchHistoryRecord): string => {
    const dt = formatResearchDateTime(rec.researchedAt, language);
    return `${dt} · ${getModeLabel(rec.researchMode, language)} (${rec.productCount} ${t.quantityProductsUnit})`;
  };

  const toggleTrendFilter = (next: 'improved' | 'declined' | 'unchanged') => {
    setTrendFilter((prev) => (prev === next ? 'all' : next));
  };

  return (
    <div className="space-y-5">
      {/* Selector Bar */}
      <div className="sp-card p-3.5 sm:p-5 space-y-3.5 sm:space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold text-zinc-950 dark:text-zinc-50">
              {t.compareHeading}
            </h2>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
              {t.compareSubtitle}
            </p>
          </div>

          {periodLabel && (
            <div className="sp-surface-muted inline-flex items-center gap-1.5 px-3 py-1.5 border border-zinc-200/70 dark:border-zinc-700/70 text-xs text-zinc-700 dark:text-zinc-200 shrink-0">
              <Clock className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400 shrink-0" aria-hidden="true" />
              <span className="text-zinc-500 dark:text-zinc-400">{t.comparePeriodApartLabel}:</span>
              <span className="font-mono font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums">
                {periodLabel}
              </span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4">
          <div className="space-y-1.5">
            <label
              htmlFor="compare-older-select"
              className="block text-xs font-medium text-zinc-700 dark:text-zinc-300"
            >
              {t.compareOlderLabel}
            </label>
            <select
              id="compare-older-select"
              value={olderId}
              onChange={(e) => {
                setOlderId(e.target.value);
                setTrendFilter('all');
              }}
              className="w-full min-h-[42px] px-3 py-2 text-xs sm:text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-300 focus-visible:ring-2 focus-visible:ring-zinc-900/20 dark:focus-visible:ring-zinc-200/20 cursor-pointer"
            >
              {historyRecords.map((rec) => (
                <option key={rec.id} value={rec.id}>
                  {formatOptionLabel(rec)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="compare-newer-select"
              className="block text-xs font-medium text-zinc-700 dark:text-zinc-300"
            >
              {t.compareNewerLabel}
            </label>
            <select
              id="compare-newer-select"
              value={newerId}
              onChange={(e) => {
                setNewerId(e.target.value);
                setTrendFilter('all');
              }}
              className="w-full min-h-[42px] px-3 py-2 text-xs sm:text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-300 focus-visible:ring-2 focus-visible:ring-zinc-900/20 dark:focus-visible:ring-zinc-200/20 cursor-pointer"
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
        <StateMessage
          variant="empty"
          compact
          icon={<GitCompareArrows className="w-4 h-4" aria-hidden="true" />}
          reason={t.compareSelectDifferentHint}
          actionLabel={t.compareSwapSessionsBtn}
          onAction={handleUseLatestTwo}
        />
      )}

      {/* Comparison Results */}
      {comparison && (
        <div className="space-y-4">
          {/* Top Summary: Tappable Improved / Declined / Unchanged Filter Chips + Counts */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div
              className="flex items-center gap-2 overflow-x-auto no-scrollbar max-w-full pb-0.5 sm:pb-0 sm:flex-wrap"
              role="group"
              aria-label={t.compareHeading}
            >
              <button
                type="button"
                aria-pressed={trendFilter === 'improved'}
                onClick={() => toggleTrendFilter('improved')}
                className={`inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer shrink-0 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-200 ${
                  trendFilter === 'improved'
                    ? 'bg-emerald-700 dark:bg-emerald-700 text-white border-emerald-700 dark:border-emerald-600'
                    : 'bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/70 hover:bg-emerald-100/80 dark:hover:bg-emerald-950/70'
                }`}
              >
                <ArrowUpRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{t.compareImprovedChip}</span>
                <span className="font-mono tabular-nums">{trendBuckets.improved}</span>
              </button>

              <button
                type="button"
                aria-pressed={trendFilter === 'declined'}
                onClick={() => toggleTrendFilter('declined')}
                className={`inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer shrink-0 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-200 ${
                  trendFilter === 'declined'
                    ? 'bg-red-700 dark:bg-red-700 text-white border-red-700 dark:border-red-600'
                    : 'bg-red-50/80 dark:bg-red-950/40 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800/70 hover:bg-red-100/80 dark:hover:bg-red-950/70'
                }`}
              >
                <ArrowDownRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{t.compareDeclinedChip}</span>
                <span className="font-mono tabular-nums">{trendBuckets.declined}</span>
              </button>

              <button
                type="button"
                aria-pressed={trendFilter === 'unchanged'}
                onClick={() => toggleTrendFilter('unchanged')}
                className={`inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer shrink-0 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-200 ${
                  trendFilter === 'unchanged'
                    ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950 border-zinc-900 dark:border-zinc-100'
                    : 'bg-zinc-100/90 dark:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200/80 dark:hover:bg-zinc-700/80'
                }`}
              >
                <Minus className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{t.compareUnchangedChip}</span>
                <span className="font-mono tabular-nums">{trendBuckets.unchanged}</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
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
          </div>

          {comparison.matchedProducts.length === 0 ? (
            <StateMessage
              variant="empty"
              icon={<GitCompareArrows className="w-5 h-5" aria-hidden="true" />}
              title={t.compareNoMatchesTitle}
              reason={t.compareNoMatchesDesc}
              actionLabel={
                historyRecords.length > 2 ? t.compareSwapSessionsBtn : undefined
              }
              onAction={historyRecords.length > 2 ? handleUseLatestTwo : undefined}
            />
          ) : visibleRows.length === 0 ? (
            <StateMessage
              variant="empty"
              icon={<GitCompareArrows className="w-5 h-5" aria-hidden="true" />}
              reason={t.emptyFilteredTitle}
              actionLabel={t.compareResetFilterBtn}
              actionIcon={<RotateCcw className="w-4 h-4" aria-hidden="true" />}
              onAction={() => setTrendFilter('all')}
            />
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden lg:block sp-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-800/40 text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                        <th className="py-3 px-4">{t.compareColProduct}</th>
                        <th className="py-3 px-4">{t.compareColSales}</th>
                        <th className="py-3 px-4">{t.compareColRevenue}</th>
                        <th className="py-3 px-4">{t.compareColGrowth}</th>
                        <th className="py-3 px-4">{t.compareColCommission}</th>
                        <th className="py-3 px-4">{t.compareColScore}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70 text-xs">
                      {visibleRows.map((row) => (
                        <tr
                          key={row.canonicalProductId}
                          className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/60 transition-colors"
                        >
                          <td className="py-3.5 px-4 max-w-[260px] align-top">
                            <button
                              type="button"
                              onClick={() =>
                                onOpenProductReport(
                                  row.newerProduct,
                                  comparison.newerRecord.researchedAt
                                )
                              }
                              className="text-left cursor-pointer group"
                            >
                              <div className="font-medium text-zinc-950 dark:text-zinc-50 group-hover:underline line-clamp-2">
                                {isMy ? row.nameMy : row.name}
                              </div>
                              <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400 truncate">
                                <span className="font-mono text-zinc-600 dark:text-zinc-400">
                                  ID: {row.canonicalProductId}
                                </span>
                                {' · '}
                                {row.shopName}
                              </div>
                            </button>
                          </td>
                          <td className="py-3.5 px-4 align-top">
                            <MetricDeltaCell
                              metric={row.sales}
                              kind="sales"
                              unavailableLabel={t.dataStatusLabels.unavailable}
                              unchangedLabel={t.compareUnchanged}
                              beforeLabel={t.compareBeforeLabel}
                              afterLabel={t.compareAfterLabel}
                            />
                          </td>
                          <td className="py-3.5 px-4 align-top">
                            <MetricDeltaCell
                              metric={row.revenue}
                              kind="revenue"
                              unavailableLabel={t.dataStatusLabels.unavailable}
                              unchangedLabel={t.compareUnchanged}
                              beforeLabel={t.compareBeforeLabel}
                              afterLabel={t.compareAfterLabel}
                            />
                          </td>
                          <td className="py-3.5 px-4 align-top">
                            <MetricDeltaCell
                              metric={row.growth}
                              kind="growth"
                              unavailableLabel={t.dataStatusLabels.unavailable}
                              unchangedLabel={t.compareUnchanged}
                              beforeLabel={t.compareBeforeLabel}
                              afterLabel={t.compareAfterLabel}
                            />
                          </td>
                          <td className="py-3.5 px-4 align-top">
                            <MetricDeltaCell
                              metric={row.commission}
                              kind="commission"
                              unavailableLabel={t.dataStatusLabels.unavailable}
                              unchangedLabel={t.compareUnchanged}
                              beforeLabel={t.compareBeforeLabel}
                              afterLabel={t.compareAfterLabel}
                            />
                          </td>
                          <td className="py-3.5 px-4 align-top">
                            <MetricDeltaCell
                              metric={row.score}
                              kind="score"
                              unavailableLabel={t.dataStatusLabels.unavailable}
                              unchangedLabel={t.compareUnchanged}
                              beforeLabel={t.compareBeforeLabel}
                              afterLabel={t.compareAfterLabel}
                            />
                            <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
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
                {visibleRows.map((row) => (
                  <article
                    key={row.canonicalProductId}
                    className="sp-card p-3.5 sm:p-4 space-y-3"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        onOpenProductReport(
                          row.newerProduct,
                          comparison.newerRecord.researchedAt
                        )
                      }
                      className="text-left w-full min-h-[40px] flex items-start justify-between gap-2 cursor-pointer group rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-200"
                    >
                      <div className="min-w-0 flex-1">
                        <h3 className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-50 leading-snug line-clamp-2 group-hover:underline">
                          {isMy ? row.nameMy : row.name}
                        </h3>
                        <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400 truncate">
                          <span className="font-mono text-zinc-600 dark:text-zinc-400">
                            ID: {row.canonicalProductId}
                          </span>
                          {' · '}
                          {row.shopName}
                        </div>
                      </div>
                      <ArrowUpRight
                        className="w-4 h-4 text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-950 dark:group-hover:text-zinc-50 shrink-0 mt-0.5 transition-colors"
                        aria-hidden="true"
                      />
                    </button>

                    <div className="grid grid-cols-2 gap-x-3 gap-y-3.5 pt-3 border-t border-zinc-100 dark:border-zinc-800/70">
                      <div className="min-w-0">
                        <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                          {t.compareColSales}
                        </div>
                        <MetricDeltaCell
                          metric={row.sales}
                          kind="sales"
                          unavailableLabel={t.dataStatusLabels.unavailable}
                          unchangedLabel={t.compareUnchanged}
                          beforeLabel={t.compareBeforeLabel}
                          afterLabel={t.compareAfterLabel}
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                          {t.compareColRevenue}
                        </div>
                        <MetricDeltaCell
                          metric={row.revenue}
                          kind="revenue"
                          unavailableLabel={t.dataStatusLabels.unavailable}
                          unchangedLabel={t.compareUnchanged}
                          beforeLabel={t.compareBeforeLabel}
                          afterLabel={t.compareAfterLabel}
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                          {t.compareColGrowth}
                        </div>
                        <MetricDeltaCell
                          metric={row.growth}
                          kind="growth"
                          unavailableLabel={t.dataStatusLabels.unavailable}
                          unchangedLabel={t.compareUnchanged}
                          beforeLabel={t.compareBeforeLabel}
                          afterLabel={t.compareAfterLabel}
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                          {t.compareColCommission}
                        </div>
                        <MetricDeltaCell
                          metric={row.commission}
                          kind="commission"
                          unavailableLabel={t.dataStatusLabels.unavailable}
                          unchangedLabel={t.compareUnchanged}
                          beforeLabel={t.compareBeforeLabel}
                          afterLabel={t.compareAfterLabel}
                        />
                      </div>
                      <div className="col-span-2 min-w-0 pt-2 border-t border-zinc-100 dark:border-zinc-800/60">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-xs text-zinc-500 dark:text-zinc-400">
                            {t.compareColScore}
                          </span>
                          <span className="text-xs text-zinc-600 dark:text-zinc-400">
                            {t.confidenceLabels[row.olderConfidence]} →{' '}
                            {t.confidenceLabels[row.newerConfidence]}
                          </span>
                        </div>
                        <MetricDeltaCell
                          metric={row.score}
                          kind="score"
                          unavailableLabel={t.dataStatusLabels.unavailable}
                          unchangedLabel={t.compareUnchanged}
                          beforeLabel={t.compareBeforeLabel}
                          afterLabel={t.compareAfterLabel}
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
