import { useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Download,
  GitCompareArrows,
  ImageOff,
  Plus,
  Trash2,
  Trophy,
  X,
} from 'lucide-react';
import {
  ComparisonSelectionItem,
  DataStatus,
  Language,
  SavedProductRecord,
} from '../types/product';
import {
  buildProductComparisonMatrix,
  getEffectiveAiSuitabilityBand,
} from '../utils/productAnalytics';
import {
  buildProductsExportCsv,
  buildProductsExportJson,
  triggerFileDownload,
} from '../utils/exportReports';
import { formatThb, resolveProductImageDisplayConfig } from '../utils/format';
import { normalizeDataStatus } from '../utils/scoring';
import { TRANSLATIONS } from '../i18n/translations';
import { ProductImage } from './ProductImage';
import { InfoPopover } from './InfoPopover';
import {
  MiniBar,
  ScoreRing,
  StateMessage,
  StatusDot,
  VerdictBadge,
} from './visual';
import { useDialogA11y } from '../hooks/useDialogA11y';

interface ProductComparisonModalProps {
  isOpen: boolean;
  items: ComparisonSelectionItem[];
  savedRecords: SavedProductRecord[];
  salesWeightPct: number;
  onRemoveItem: (selectionKey: string) => void;
  onAddSavedRecord: (record: SavedProductRecord) => void;
  onClearAll: () => void;
  onOpenReport: (item: ComparisonSelectionItem) => void;
  onClose: () => void;
  language: Language;
}

type NumericMetricKey =
  | 'overallScore'
  | 'price'
  | 'commission'
  | 'sales'
  | 'revenue'
  | 'competition'
  | 'aiContent'
  | 'confidence';

const NUMERIC_METRIC_KEYS: NumericMetricKey[] = [
  'overallScore',
  'price',
  'commission',
  'sales',
  'revenue',
  'competition',
  'aiContent',
  'confidence',
];

function formatCompactThb(amount: number): string {
  if (!Number.isFinite(amount)) return '—';
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 1_000_000) {
    return `${sign}฿${(abs / 1_000_000).toFixed(1)}M`;
  }
  if (abs >= 10_000) {
    return `${sign}฿${(abs / 1_000).toFixed(1)}K`;
  }
  return `${sign}${formatThb(Math.round(abs))}`;
}

function getBestIndices(
  values: Array<number | null>,
  direction: 'higher' | 'lower',
  totalColumns: number
): Set<number> {
  if (totalColumns < 2) return new Set();
  const valid = values
    .map((val, idx) => ({ val, idx }))
    .filter((entry): entry is { val: number; idx: number } =>
      typeof entry.val === 'number' && Number.isFinite(entry.val)
    );
  if (valid.length === 0) return new Set();
  const minVal = Math.min(...valid.map((v) => v.val));
  const maxVal = Math.max(...valid.map((v) => v.val));
  const target = direction === 'higher' ? maxVal : minVal;
  return new Set(valid.filter((v) => v.val === target).map((v) => v.idx));
}

export function ProductComparisonModal({
  isOpen,
  items,
  savedRecords,
  salesWeightPct,
  onRemoveItem,
  onAddSavedRecord,
  onClearAll,
  onOpenReport,
  onClose,
  language,
}: ProductComparisonModalProps) {
  const [selectedSavedId, setSelectedSavedId] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);
  const t = TRANSLATIONS[language];
  const isMy = language === 'my';

  useDialogA11y({
    isOpen,
    containerRef: modalRef,
    onClose,
  });

  const matrix = useMemo(
    () => buildProductComparisonMatrix(items, salesWeightPct),
    [items, salesWeightPct]
  );

  const selectedKeySet = useMemo(
    () => new Set(items.map((item) => item.selectionKey)),
    [items]
  );

  const addableSavedRecords = useMemo(
    () =>
      savedRecords.filter(
        (rec) => !selectedKeySet.has(`saved:${rec.id}`)
      ),
    [savedRecords, selectedKeySet]
  );

  const metricExtract = useMemo(() => {
    const cols = matrix.columns;
    const extracted = cols.map((col) => {
      const p = col.item.product;
      const ev = col.evaluation;

      const priceVal =
        typeof p.priceThb === 'number' && Number.isFinite(p.priceThb) && p.priceThb > 0
          ? p.priceThb
          : null;
      const priceStatus: DataStatus = normalizeDataStatus(
        priceVal === null ? 'unavailable' : (p.priceStatus ?? 'estimated')
      );

      const hasVerifiedComm = p.commissionVerified && typeof p.commissionRate === 'number' && p.commissionRate > 0;
      const commRate = hasVerifiedComm
        ? p.commissionRate!
        : typeof p.kalodataMetrics?.commissionRatePct === 'number' &&
            p.kalodataMetrics.commissionRatePct > 0
          ? p.kalodataMetrics.commissionRatePct
          : null;
      const commStatus: DataStatus = hasVerifiedComm
        ? 'verified'
        : commRate !== null
          ? normalizeDataStatus(p.commissionStatus ?? 'estimated')
          : 'unavailable';
      const commBaht =
        commRate !== null
          ? (p.estimatedCommissionPerSaleThb ??
            (priceVal !== null ? Math.round((priceVal * commRate) / 100) : null))
          : null;

      const salesVal =
        typeof p.kalodataMetrics?.salesVolume === 'number' &&
        Number.isFinite(p.kalodataMetrics.salesVolume) &&
        p.kalodataMetrics.salesVolume >= 0
          ? p.kalodataMetrics.salesVolume
          : null;
      const salesCriterion = ev.criteria.find((c) => c.key === 'salesPerformance');
      const salesStatus: DataStatus = salesCriterion
        ? normalizeDataStatus(salesCriterion.verification)
        : salesVal !== null
          ? 'verified'
          : 'unavailable';

      const revenueVal =
        typeof p.kalodataMetrics?.revenueThb === 'number' &&
        Number.isFinite(p.kalodataMetrics.revenueThb) &&
        p.kalodataMetrics.revenueThb >= 0
          ? p.kalodataMetrics.revenueThb
          : null;
      const revenueCriterion = ev.criteria.find((c) => c.key === 'revenuePerformance');
      const revenueStatus: DataStatus = revenueCriterion
        ? normalizeDataStatus(revenueCriterion.verification)
        : revenueVal !== null
          ? 'verified'
          : 'unavailable';

      const creatorVal =
        typeof p.kalodataMetrics?.creatorNumber === 'number' &&
        Number.isFinite(p.kalodataMetrics.creatorNumber) &&
        p.kalodataMetrics.creatorNumber >= 0
          ? p.kalodataMetrics.creatorNumber
          : null;
      const compCriterion = ev.criteria.find((c) => c.key === 'competition');
      const compStatus: DataStatus = compCriterion
        ? normalizeDataStatus(compCriterion.verification)
        : creatorVal !== null
          ? 'verified'
          : 'unavailable';

      const aiCriterion = ev.criteria.find((c) => c.key === 'aiContentSuitability');
      const aiScore =
        aiCriterion && aiCriterion.verification !== 'unavailable'
          ? aiCriterion.normalizedScore
          : null;
      const aiBand = getEffectiveAiSuitabilityBand(p, ev);
      const aiStatus: DataStatus = aiCriterion
        ? normalizeDataStatus(aiCriterion.verification)
        : aiScore !== null
          ? 'estimated'
          : 'unavailable';

      return {
        overallScore: ev.totalScore,
        price: priceVal,
        priceStatus,
        commission: commRate,
        commBaht,
        commStatus,
        sales: salesVal,
        salesStatus,
        revenue: revenueVal,
        revenueStatus,
        competition: creatorVal,
        compLevel: p.competitionLevel,
        compStatus,
        aiContent: aiScore,
        aiBand,
        aiStatus,
        confidence: ev.confidencePct,
        verifiedCount: ev.verifiedCount,
        totalCriteria: ev.totalCriteria,
      };
    });

    const colCount = cols.length;
    const bestByMetric: Record<NumericMetricKey, Set<number>> = {
      overallScore: getBestIndices(extracted.map((e) => e.overallScore), 'higher', colCount),
      price: getBestIndices(extracted.map((e) => e.price), 'lower', colCount),
      commission: getBestIndices(extracted.map((e) => e.commission), 'higher', colCount),
      sales: getBestIndices(extracted.map((e) => e.sales), 'higher', colCount),
      revenue: getBestIndices(extracted.map((e) => e.revenue), 'higher', colCount),
      competition: getBestIndices(extracted.map((e) => e.competition), 'lower', colCount),
      aiContent: getBestIndices(extracted.map((e) => e.aiContent), 'higher', colCount),
      confidence: getBestIndices(extracted.map((e) => e.confidence), 'higher', colCount),
    };

    const maxByMetric: Record<NumericMetricKey, number> = {
      overallScore: 100,
      price: Math.max(...extracted.map((e) => e.price ?? 0), 1),
      commission: Math.max(...extracted.map((e) => e.commission ?? 0), 1),
      sales: Math.max(...extracted.map((e) => e.sales ?? 0), 1),
      revenue: Math.max(...extracted.map((e) => e.revenue ?? 0), 1),
      competition: Math.max(...extracted.map((e) => e.competition ?? 0), 1),
      aiContent: 100,
      confidence: 100,
    };

    const bestCounts = cols.map((_, idx) =>
      NUMERIC_METRIC_KEYS.reduce(
        (count, key) => count + (bestByMetric[key].has(idx) ? 1 : 0),
        0
      )
    );

    return { extracted, bestByMetric, maxByMetric, bestCounts };
  }, [matrix.columns]);

  if (!isOpen) return null;

  const handleAddSaved = () => {
    if (!selectedSavedId) return;
    const found = savedRecords.find((r) => r.id === selectedSavedId);
    if (found) {
      onAddSavedRecord(found);
      setSelectedSavedId('');
    }
  };

  const handleExportCsv = () => {
    const products = matrix.columns.map((c) => c.item.product);
    const evalMap = new Map(matrix.columns.map((c) => [c.item.product.id, c.evaluation]));
    const csv = buildProductsExportCsv(products, {
      salesWeightPct,
      evaluations: evalMap,
      exportTitle: 'SiamPick Product Comparison Export',
      language,
    });
    triggerFileDownload(csv, 'siampick-product-comparison.csv', 'text/csv;charset=utf-8;');
  };

  const handleExportJson = () => {
    const products = matrix.columns.map((c) => c.item.product);
    const evalMap = new Map(matrix.columns.map((c) => [c.item.product.id, c.evaluation]));
    const json = buildProductsExportJson(products, {
      salesWeightPct,
      evaluations: evalMap,
      exportTitle: 'SiamPick Product Comparison Export',
      language,
    });
    triggerFileDownload(
      json,
      'siampick-product-comparison.json',
      'application/json;charset=utf-8;'
    );
  };

  const renderBestBadge = () => (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 text-xs font-semibold shrink-0">
      <Trophy className="w-3 h-3 shrink-0" aria-hidden="true" />
      <span>{t.compareBestBadge}</span>
    </span>
  );

  const cellHighlightClass = (isBest: boolean) =>
    isBest
      ? 'bg-emerald-50/75 dark:bg-emerald-950/30'
      : 'bg-white dark:bg-zinc-900';

  const rowHeaderClass =
    'sticky left-0 z-10 bg-zinc-50 dark:bg-zinc-900 px-2.5 sm:px-5 py-3.5 w-[108px] min-w-[104px] max-w-[116px] sm:w-44 sm:min-w-[168px] sm:max-w-none text-xs font-semibold text-zinc-700 dark:text-zinc-300 align-middle border-r border-zinc-200/80 dark:border-zinc-800/80 shadow-[2px_0_6px_-4px_rgba(0,0,0,0.12)] break-words';

  return (
    <div
      className="fixed inset-0 z-50 bg-zinc-950/45 dark:bg-black/70 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-comparison-heading"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className="w-full max-w-[1220px] max-h-[92vh] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-t-2xl sm:rounded-xl shadow-2xl flex flex-col overflow-hidden pb-[env(safe-area-inset-bottom)] sm:pb-0 focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 px-4 sm:px-6 py-3.5 border-b border-zinc-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2
                id="product-comparison-heading"
                className="font-display text-base sm:text-xl font-bold text-zinc-950 dark:text-zinc-50"
              >
                {t.compareModalTitle}
              </h2>
              <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
                ({items.length})
              </span>
              <InfoPopover
                label={t.compareModalTitle}
                title={t.compareModalTitle}
                content={
                  <>
                    <p>{t.compareModalSubtitle}</p>
                    {matrix.hasDistinctProductIds && (
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 pt-1 border-t border-zinc-100 dark:border-zinc-800/70">
                        {t.compareDistinctIdsNote} ({matrix.distinctProductIdCount} Product IDs)
                      </p>
                    )}
                  </>
                }
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 max-w-full">
            {items.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 text-xs font-medium text-zinc-800 dark:text-zinc-200 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{t.exportCsvBtn}</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportJson}
                  className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 text-xs font-medium text-zinc-800 dark:text-zinc-200 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{t.exportJsonBtn}</span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label={t.reportClose}
              className="w-10 h-10 rounded-lg inline-flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Add Saved Product to Compare Toolbar */}
        {addableSavedRecords.length > 0 && (
          <div className="shrink-0 px-4 sm:px-6 py-2.5 bg-zinc-50/80 dark:bg-zinc-800/50 border-b border-zinc-200/80 dark:border-zinc-800/80 flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
              <label
                htmlFor="compare-add-saved"
                className="text-xs font-medium text-zinc-700 dark:text-zinc-300 whitespace-nowrap"
              >
                {t.compareAddSavedLabel}:
              </label>
              <select
                id="compare-add-saved"
                value={selectedSavedId}
                onChange={(e) => setSelectedSavedId(e.target.value)}
                className="min-h-[40px] max-w-sm flex-1 px-2.5 py-1.5 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-300 cursor-pointer"
              >
                <option value="">{t.compareAddSavedPlaceholder}</option>
                {addableSavedRecords.map((rec) => (
                  <option key={rec.id} value={rec.id}>
                    {(isMy ? rec.product.nameMy : rec.product.name).slice(0, 65)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!selectedSavedId}
                onClick={handleAddSaved}
                className="inline-flex items-center gap-1 min-h-[40px] px-3 py-1.5 text-xs font-medium text-white dark:text-zinc-950 bg-zinc-950 dark:bg-zinc-100 rounded-lg hover:bg-zinc-800 dark:hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{t.compareSelectBtn}</span>
              </button>
            </div>

            {items.length > 0 && (
              <button
                type="button"
                onClick={onClearAll}
                className="min-h-[40px] px-2 text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-red-700 dark:hover:text-red-400 transition-colors cursor-pointer whitespace-nowrap"
              >
                {t.compareClearBtn}
              </button>
            )}
          </div>
        )}

        {/* Comparison Visual Table Body */}
        <div className="flex-1 overflow-auto max-sm:snap-x max-sm:snap-mandatory scroll-smooth">
          {items.length === 0 ? (
            <div className="p-6 sm:p-10">
              <StateMessage
                variant="empty"
                icon={<GitCompareArrows className="w-5 h-5" aria-hidden="true" />}
                reason={`${t.compareNeedTwoNote} (0/2 ${t.quantityProductsUnit})`}
                actionLabel={t.compareClosePickMoreBtn}
                onAction={onClose}
              />
            </div>
          ) : (
            <>
              {items.length === 1 && (
                <div className="px-4 sm:px-6 py-2.5 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200/80 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                  <span>
                    {t.compareNeedTwoNote} (1/2 {t.quantityProductsUnit})
                  </span>
                  <button
                    type="button"
                    onClick={onClose}
                    className="min-h-[40px] px-3 py-1.5 font-medium text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {t.compareClosePickMoreBtn}
                  </button>
                </div>
              )}
              <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800">
                  <th
                    scope="col"
                    className="sticky left-0 top-0 z-30 bg-zinc-50 dark:bg-zinc-900 px-2.5 sm:px-5 py-3.5 w-[108px] min-w-[104px] max-w-[116px] sm:w-44 sm:min-w-[168px] sm:max-w-none text-xs font-semibold text-zinc-600 dark:text-zinc-400 align-bottom border-r border-zinc-200/80 dark:border-zinc-800/80 shadow-[2px_2px_6px_-4px_rgba(0,0,0,0.16)]"
                  >
                    {isMy ? 'နှိုင်းယှဉ်ချက်များ' : 'Metrics'}
                  </th>
                  {matrix.columns.map((col, idx) => {
                    const p = col.item.product;
                    const displayName = isMy ? p.nameMy : p.name;
                    const imageConfig = resolveProductImageDisplayConfig(p);
                    const bestCount = metricExtract.bestCounts[idx] ?? 0;
                    const bestSummaryLabel = t.compareBestInMetrics
                      .replace('{n}', String(bestCount))
                      .replace('{total}', String(NUMERIC_METRIC_KEYS.length));

                    return (
                      <th
                        key={col.item.selectionKey}
                        scope="col"
                        className="sticky top-0 z-20 bg-white dark:bg-zinc-900 max-sm:snap-start px-3 sm:px-4 py-3.5 min-w-[210px] sm:min-w-[248px] max-w-[300px] align-top border-r border-zinc-100 dark:border-zinc-800/70 last:border-r-0 shadow-[0_2px_6px_-4px_rgba(0,0,0,0.14)]"
                      >
                        <div className="space-y-2.5">
                          <div className="flex items-start gap-2.5">
                            <div className="w-12 h-12 rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/70 dark:border-zinc-700/70 shrink-0">
                              {imageConfig.canRender && imageConfig.src ? (
                                <ProductImage
                                  src={imageConfig.src}
                                  fallbackSrc={imageConfig.fallbackSrc}
                                  productId={imageConfig.productId}
                                  alt={p.name}
                                  title={displayName}
                                  unavailableLabel={t.cardImageUnverified}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <ImageOff className="w-4 h-4 text-zinc-500 dark:text-zinc-400" aria-hidden="true" />
                                </div>
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="font-display text-xs sm:text-sm font-semibold text-zinc-950 dark:text-zinc-50 line-clamp-2 leading-snug">
                                {displayName}
                              </div>
                              <div className="mt-0.5 text-xs font-normal text-zinc-500 dark:text-zinc-400 truncate">
                                {p.shopName}
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => onRemoveItem(col.item.selectionKey)}
                              aria-label={`${t.compareRemoveBtn}: ${displayName}`}
                              className="w-10 h-10 -mt-1.5 -mr-1.5 rounded-lg inline-flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50/70 dark:hover:bg-red-950/40 transition-colors cursor-pointer shrink-0"
                            >
                              <Trash2 className="w-4 h-4" aria-hidden="true" />
                            </button>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-2">
                            {matrix.columns.length >= 2 && (
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold tabular-nums border ${
                                  bestCount > 0
                                    ? 'bg-emerald-50 dark:bg-emerald-950/45 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/70'
                                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700'
                                }`}
                              >
                                <Trophy className="w-3 h-3 shrink-0" aria-hidden="true" />
                                <span>{bestSummaryLabel}</span>
                              </span>
                            )}

                            <button
                              type="button"
                              onClick={() => onOpenReport(col.item)}
                              className="inline-flex items-center gap-1 min-h-[40px] px-2.5 py-1.5 rounded-md text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-50 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                            >
                              <span>{t.singleHistoryOpenReportBtn}</span>
                              <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>

              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70 text-xs">
                {/* 1. Overall Score */}
                <tr>
                  <th scope="row" className={rowHeaderClass}>
                    {t.compareRowOverallScore}
                  </th>
                  {matrix.columns.map((col, idx) => {
                    const m = metricExtract.extracted[idx];
                    const isBest = metricExtract.bestByMetric.overallScore.has(idx);
                    return (
                      <td
                        key={`score-${col.item.selectionKey}`}
                        className={`max-sm:snap-start px-3 sm:px-4 py-3.5 align-middle border-r border-zinc-100 dark:border-zinc-800/70 last:border-r-0 ${cellHighlightClass(
                          isBest
                        )}`}
                      >
                        <div className="flex items-center gap-3">
                          <ScoreRing value={m.overallScore} max={100} size={48} />
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <div className="flex items-center justify-between gap-1.5">
                              <span className="font-mono text-sm font-bold text-zinc-950 dark:text-zinc-50 tabular-nums">
                                {m.overallScore}
                                <span className="text-xs font-normal text-zinc-600 dark:text-zinc-400">
                                  /100
                                </span>
                              </span>
                              {isBest && renderBestBadge()}
                            </div>
                            <MiniBar
                              value={m.overallScore}
                              max={metricExtract.maxByMetric.overallScore}
                              tone={isBest ? 'emerald' : 'zinc'}
                            />
                          </div>
                        </div>
                      </td>
                    );
                  })}
                </tr>

                {/* 2. Verdict */}
                <tr>
                  <th scope="row" className={rowHeaderClass}>
                    {t.compareRowVerdict}
                  </th>
                  {matrix.columns.map((col) => (
                    <td
                      key={`verdict-${col.item.selectionKey}`}
                      className="max-sm:snap-start px-3.5 sm:px-4 py-3.5 align-middle bg-white dark:bg-zinc-900 border-r border-zinc-100 dark:border-zinc-800/70 last:border-r-0"
                    >
                      <VerdictBadge
                        verdict={col.decision.verdict}
                        size="sm"
                        language={language}
                      />
                    </td>
                  ))}
                </tr>

                {/* 3. Price (lower = best) */}
                <tr>
                  <th scope="row" className={rowHeaderClass}>
                    {t.compareRowPrice}
                  </th>
                  {matrix.columns.map((col, idx) => {
                    const m = metricExtract.extracted[idx];
                    const isBest = metricExtract.bestByMetric.price.has(idx);
                    return (
                      <td
                        key={`price-${col.item.selectionKey}`}
                        className={`max-sm:snap-start px-3.5 sm:px-4 py-3.5 align-middle border-r border-zinc-100 dark:border-zinc-800/70 last:border-r-0 ${cellHighlightClass(
                          isBest
                        )}`}
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="inline-flex items-center gap-1.5 min-w-0">
                              <StatusDot status={m.priceStatus} language={language} size="sm" />
                              <span
                                aria-label={m.price === null ? t.dataStatusLabels.unavailable : undefined}
                                title={m.price === null ? t.drawerNoData : undefined}
                                className={`font-mono text-sm font-semibold tabular-nums ${
                                  m.price !== null
                                    ? 'text-zinc-950 dark:text-zinc-50'
                                    : 'text-zinc-600 dark:text-zinc-400 font-normal'
                                }`}
                              >
                                {m.price !== null ? formatThb(m.price) : '—'}
                              </span>
                            </div>
                            {isBest && renderBestBadge()}
                          </div>
                          {m.price !== null && (
                            <MiniBar
                              value={m.price}
                              max={metricExtract.maxByMetric.price}
                              tone={isBest ? 'emerald' : 'zinc'}
                            />
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>

                {/* 4. Commission % + baht */}
                <tr>
                  <th scope="row" className={rowHeaderClass}>
                    {t.compareRowCommission}
                  </th>
                  {matrix.columns.map((col, idx) => {
                    const m = metricExtract.extracted[idx];
                    const isBest = metricExtract.bestByMetric.commission.has(idx);
                    return (
                      <td
                        key={`comm-${col.item.selectionKey}`}
                        className={`max-sm:snap-start px-3.5 sm:px-4 py-3.5 align-middle border-r border-zinc-100 dark:border-zinc-800/70 last:border-r-0 ${cellHighlightClass(
                          isBest
                        )}`}
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="inline-flex items-baseline gap-1.5 flex-wrap min-w-0">
                              <StatusDot status={m.commStatus} language={language} size="sm" />
                              {m.commission !== null ? (
                                <>
                                  <span className="font-mono text-sm font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                                    {m.commission}%
                                  </span>
                                  {m.commBaht !== null && (
                                    <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
                                      (~{formatThb(m.commBaht)} {t.drawerPerSaleUnit})
                                    </span>
                                  )}
                                </>
                              ) : (
                                <span
                                  aria-label={t.dataStatusLabels.unavailable}
                                  title={t.drawerNoData}
                                  className="font-mono text-sm text-zinc-600 dark:text-zinc-400"
                                >
                                  —
                                </span>
                              )}
                            </div>
                            {isBest && renderBestBadge()}
                          </div>
                          {m.commission !== null && (
                            <MiniBar
                              value={m.commission}
                              max={metricExtract.maxByMetric.commission}
                              tone={isBest ? 'emerald' : 'zinc'}
                            />
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>

                {/* 5. Sales */}
                <tr>
                  <th scope="row" className={rowHeaderClass}>
                    {t.compareRowSales}
                  </th>
                  {matrix.columns.map((col, idx) => {
                    const m = metricExtract.extracted[idx];
                    const isBest = metricExtract.bestByMetric.sales.has(idx);
                    return (
                      <td
                        key={`sales-${col.item.selectionKey}`}
                        className={`max-sm:snap-start px-3.5 sm:px-4 py-3.5 align-middle border-r border-zinc-100 dark:border-zinc-800/70 last:border-r-0 ${cellHighlightClass(
                          isBest
                        )}`}
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="inline-flex items-center gap-1.5 min-w-0">
                              <StatusDot status={m.salesStatus} language={language} size="sm" />
                              <span
                                aria-label={m.sales === null ? t.dataStatusLabels.unavailable : undefined}
                                title={m.sales === null ? t.drawerNoData : undefined}
                                className={`font-mono text-sm font-semibold tabular-nums ${
                                  m.sales !== null
                                    ? 'text-zinc-950 dark:text-zinc-50'
                                    : 'text-zinc-600 dark:text-zinc-400 font-normal'
                                }`}
                              >
                                {m.sales !== null
                                  ? m.sales.toLocaleString('en-US')
                                  : '—'}
                              </span>
                            </div>
                            {isBest && renderBestBadge()}
                          </div>
                          {m.sales !== null && (
                            <MiniBar
                              value={m.sales}
                              max={metricExtract.maxByMetric.sales}
                              tone={isBest ? 'emerald' : 'zinc'}
                            />
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>

                {/* 6. Revenue */}
                <tr>
                  <th scope="row" className={rowHeaderClass}>
                    {t.compareRowRevenue}
                  </th>
                  {matrix.columns.map((col, idx) => {
                    const m = metricExtract.extracted[idx];
                    const isBest = metricExtract.bestByMetric.revenue.has(idx);
                    return (
                      <td
                        key={`revenue-${col.item.selectionKey}`}
                        className={`max-sm:snap-start px-3.5 sm:px-4 py-3.5 align-middle border-r border-zinc-100 dark:border-zinc-800/70 last:border-r-0 ${cellHighlightClass(
                          isBest
                        )}`}
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="inline-flex items-center gap-1.5 min-w-0">
                              <StatusDot status={m.revenueStatus} language={language} size="sm" />
                              <span
                                aria-label={m.revenue === null ? t.dataStatusLabels.unavailable : undefined}
                                title={m.revenue === null ? t.drawerNoData : undefined}
                                className={`font-mono text-sm font-semibold tabular-nums ${
                                  m.revenue !== null
                                    ? 'text-zinc-950 dark:text-zinc-50'
                                    : 'text-zinc-600 dark:text-zinc-400 font-normal'
                                }`}
                              >
                                {m.revenue !== null
                                  ? formatCompactThb(m.revenue)
                                  : '—'}
                              </span>
                            </div>
                            {isBest && renderBestBadge()}
                          </div>
                          {m.revenue !== null && (
                            <MiniBar
                              value={m.revenue}
                              max={metricExtract.maxByMetric.revenue}
                              tone={isBest ? 'emerald' : 'zinc'}
                            />
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>

                {/* 7. Competition (lower creator count = best) */}
                <tr>
                  <th scope="row" className={rowHeaderClass}>
                    {t.compareRowCompetition}
                  </th>
                  {matrix.columns.map((col, idx) => {
                    const m = metricExtract.extracted[idx];
                    const isBest = metricExtract.bestByMetric.competition.has(idx);
                    const compTone = isBest
                      ? 'emerald'
                      : m.compLevel === 'High'
                        ? 'red'
                        : m.compLevel === 'Moderate'
                          ? 'amber'
                          : 'zinc';
                    return (
                      <td
                        key={`comp-${col.item.selectionKey}`}
                        className={`max-sm:snap-start px-3.5 sm:px-4 py-3.5 align-middle border-r border-zinc-100 dark:border-zinc-800/70 last:border-r-0 ${cellHighlightClass(
                          isBest
                        )}`}
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="inline-flex items-baseline gap-1.5 flex-wrap min-w-0">
                              <StatusDot status={m.compStatus} language={language} size="sm" />
                              {m.competition !== null ? (
                                <>
                                  <span className="font-mono text-sm font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums">
                                    {m.competition.toLocaleString('en-US')}
                                  </span>
                                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                                    {t.bestCreatorsUnit} · {t.competitionLabels[m.compLevel]}
                                  </span>
                                </>
                              ) : (
                                <span
                                  aria-label={t.dataStatusLabels.unavailable}
                                  title={t.drawerNoData}
                                  className="font-mono text-sm text-zinc-600 dark:text-zinc-400"
                                >
                                  —
                                </span>
                              )}
                            </div>
                            {isBest && renderBestBadge()}
                          </div>
                          {m.competition !== null && (
                            <MiniBar
                              value={m.competition}
                              max={metricExtract.maxByMetric.competition}
                              tone={compTone}
                            />
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>

                {/* 8. AI Content */}
                <tr>
                  <th scope="row" className={rowHeaderClass}>
                    {t.compareRowAiContent}
                  </th>
                  {matrix.columns.map((col, idx) => {
                    const m = metricExtract.extracted[idx];
                    const isBest = metricExtract.bestByMetric.aiContent.has(idx);
                    return (
                      <td
                        key={`ai-${col.item.selectionKey}`}
                        className={`max-sm:snap-start px-3.5 sm:px-4 py-3.5 align-middle border-r border-zinc-100 dark:border-zinc-800/70 last:border-r-0 ${cellHighlightClass(
                          isBest
                        )}`}
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="inline-flex items-baseline gap-1.5 flex-wrap min-w-0">
                              <StatusDot status={m.aiStatus} language={language} size="sm" />
                              {m.aiContent !== null ? (
                                <>
                                  <span className="font-mono text-sm font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums">
                                    {m.aiContent}/100
                                  </span>
                                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                                    {t.aiVideoLabels[m.aiBand]}
                                  </span>
                                </>
                              ) : (
                                <span
                                  aria-label={t.dataStatusLabels.unavailable}
                                  title={t.drawerNoData}
                                  className="font-mono text-sm text-zinc-600 dark:text-zinc-400"
                                >
                                  —
                                </span>
                              )}
                            </div>
                            {isBest && renderBestBadge()}
                          </div>
                          {m.aiContent !== null && (
                            <MiniBar
                              value={m.aiContent}
                              max={metricExtract.maxByMetric.aiContent}
                              tone={isBest ? 'emerald' : 'zinc'}
                            />
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>

                {/* 9. Data Confidence */}
                <tr>
                  <th scope="row" className={rowHeaderClass}>
                    {t.compareRowConfidence}
                  </th>
                  {matrix.columns.map((col, idx) => {
                    const m = metricExtract.extracted[idx];
                    const isBest = metricExtract.bestByMetric.confidence.has(idx);
                    return (
                      <td
                        key={`conf-${col.item.selectionKey}`}
                        className={`max-sm:snap-start px-3.5 sm:px-4 py-3.5 align-middle border-r border-zinc-100 dark:border-zinc-800/70 last:border-r-0 ${cellHighlightClass(
                          isBest
                        )}`}
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="inline-flex items-baseline gap-1.5 flex-wrap min-w-0">
                              <span className="font-mono text-sm font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums">
                                {m.confidence}%
                              </span>
                              <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
                                ({m.verifiedCount}/{m.totalCriteria} {t.bestVerifiedUnit})
                              </span>
                            </div>
                            {isBest && renderBestBadge()}
                          </div>
                          <MiniBar
                            value={m.confidence}
                            max={metricExtract.maxByMetric.confidence}
                            tone={isBest ? 'emerald' : 'zinc'}
                          />
                        </div>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
