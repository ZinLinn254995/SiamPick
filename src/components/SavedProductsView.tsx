import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Bookmark,
  Calendar,
  Check,
  Copy,
  Download,
  ExternalLink,
  GitCompareArrows,
  HardDrive,
  ImageOff,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  CategoryFilter,
  DataStatus,
  Language,
  SavedProductRecord,
  ScoreTier,
} from '../types/product';
import {
  formatThb,
  getTikTokShopProductUrl,
  isLegacyOrSluglessTikTokUrl,
  isSafeHttpUrl,
  resolveProductImageDisplayConfig,
} from '../utils/format';
import { evaluateProductOpportunity, normalizeDataStatus } from '../utils/scoring';
import {
  buildProductsExportCsv,
  buildProductsExportJson,
  triggerFileDownload,
} from '../utils/exportReports';
import { formatResearchDate } from '../utils/savedProductsStorage';
import { getCategoryLabel, UNIVERSAL_CATEGORIES } from '../utils/categoryRegistry';
import { TRANSLATIONS } from '../i18n/translations';
import { ProductImage } from './ProductImage';
import { InfoPopover } from './InfoPopover';

interface SavedProductsViewProps {
  records: SavedProductRecord[];
  salesWeightPct: number;
  comparedKeys?: Set<string>;
  onToggleCompareRecord?: (record: SavedProductRecord) => void;
  onDelete: (id: string) => void;
  onOpenReport: (record: SavedProductRecord) => void;
  onOpenBackupRestore?: (tab: 'backup' | 'restore') => void;
  onBackToHunting: () => void;
  language: Language;
}

type SavedSortKey = 'newest' | 'score-desc' | 'price-asc' | 'price-desc';

function tierColorClass(tier: ScoreTier): string {
  if (tier === 'priority-test') return 'text-emerald-700 dark:text-emerald-400';
  if (tier === 'investigate-further') return 'text-amber-700 dark:text-amber-400';
  return 'text-zinc-500 dark:text-zinc-400';
}

function dataStatusColorClass(status: DataStatus): string {
  if (status === 'verified') return 'text-emerald-700 dark:text-emerald-400';
  if (status === 'estimated') return 'text-amber-700 dark:text-amber-400';
  return 'text-zinc-400 dark:text-zinc-500';
}

export function SavedProductsView({
  records,
  salesWeightPct,
  comparedKeys,
  onToggleCompareRecord,
  onDelete,
  onOpenReport,
  onOpenBackupRestore,
  onBackToHunting,
  language,
}: SavedProductsViewProps) {
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [sortKey, setSortKey] = useState<SavedSortKey>('newest');
  const [copied, setCopied] = useState(false);

  const t = TRANSLATIONS[language];
  const isMy = language === 'my';

  const presentCategories = useMemo(() => {
    const seen = new Set(records.map((r) => r.product.category));
    return UNIVERSAL_CATEGORIES.map((c) => c.id).filter((id) => seen.has(id));
  }, [records]);

  const evaluatedRecords = useMemo(() => {
    const filtered = records.filter((rec) => {
      if (categoryFilter !== 'all' && rec.product.category !== categoryFilter) {
        return false;
      }
      return true;
    });

    const allPeers = records.map((r) => r.product);
    const mapped = filtered.map((record) => ({
      record,
      evaluation: evaluateProductOpportunity(record.product, {
        salesWeightPct,
        peerProducts: allPeers,
      }),
    }));

    return mapped.sort((a, b) => {
      const priceA = a.record.product.priceThb ?? Number.POSITIVE_INFINITY;
      const priceB = b.record.product.priceThb ?? Number.POSITIVE_INFINITY;
      switch (sortKey) {
        case 'newest':
          return new Date(b.record.savedAt).getTime() - new Date(a.record.savedAt).getTime();
        case 'score-desc':
          return b.evaluation.totalScore - a.evaluation.totalScore;
        case 'price-asc':
          return priceA - priceB;
        case 'price-desc': {
          const descA = a.record.product.priceThb ?? -1;
          const descB = b.record.product.priceThb ?? -1;
          return descB - descA;
        }
        default:
          return 0;
      }
    });
  }, [records, categoryFilter, sortKey, salesWeightPct]);

  const avgScore =
    evaluatedRecords.length > 0
      ? Math.round(
          evaluatedRecords.reduce((sum, item) => sum + item.evaluation.totalScore, 0) /
            evaluatedRecords.length
        )
      : 0;

  const handleExportCsv = () => {
    const products = evaluatedRecords.map((item) => item.record.product);
    const evalMap = new Map(
      evaluatedRecords.map((item) => [item.record.product.id, item.evaluation])
    );
    const csv = buildProductsExportCsv(products, {
      salesWeightPct,
      evaluations: evalMap,
      exportTitle: 'SiamPick Saved Products Export',
      language,
    });
    triggerFileDownload(csv, 'siampick-saved-products.csv', 'text/csv;charset=utf-8;');
  };

  const handleExportJson = () => {
    const products = evaluatedRecords.map((item) => item.record.product);
    const evalMap = new Map(
      evaluatedRecords.map((item) => [item.record.product.id, item.evaluation])
    );
    const json = buildProductsExportJson(products, {
      salesWeightPct,
      evaluations: evalMap,
      exportTitle: 'SiamPick Saved Products Export',
      language,
    });
    triggerFileDownload(
      json,
      'siampick-saved-products.json',
      'application/json;charset=utf-8;'
    );
  };

  const handleCopySummary = async () => {
    const text = evaluatedRecords
      .map(({ record, evaluation }, i) => {
        const p = record.product;
        const pStatus: DataStatus = normalizeDataStatus(
          p.priceThb === null || p.priceThb <= 0 ? 'unavailable' : (p.priceStatus ?? 'estimated')
        );
        const priceStr =
          p.priceThb !== null && p.priceThb > 0
            ? `${formatThb(p.priceThb)} (${pStatus})`
            : pStatus;
        const comm =
          p.commissionVerified && p.commissionRate !== null
            ? `${p.commissionRate}%`
            : normalizeDataStatus(p.commissionStatus ?? 'unavailable');
        const dateStr = formatResearchDate(record.researchDate, language);
        const verifiedUrls = record.sources
          .filter((s) => s.verified && s.url)
          .map((s) => s.url)
          .join(', ');
        return `${i + 1}. ${p.name} — ${priceStr} | Comm: ${comm} | Score: ${evaluation.totalScore}/100 | Date: ${dateStr}${verifiedUrls ? ` | Source: ${verifiedUrls}` : ''}`;
      })
      .join('\n');

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  return (
    <section aria-labelledby="saved-products-heading" className="space-y-8">
      {/* Header & Back Navigation */}
      <div className="space-y-4">
        <button
          type="button"
          onClick={onBackToHunting}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50 transition-colors cursor-pointer py-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{t.savedViewBackBtn}</span>
        </button>

        <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4 pb-5 border-b border-zinc-200 dark:border-zinc-800">
          <div className="min-w-0 flex-1 max-w-2xl">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
              <h1
                id="saved-products-heading"
                className={`font-display text-2xl sm:text-3xl font-bold text-zinc-950 dark:text-zinc-50 ${
                  isMy ? 'tracking-normal leading-[1.3]' : 'tracking-tight leading-[1.2]'
                }`}
              >
                {t.savedViewTitle}
              </h1>
              <span className="font-mono text-sm text-zinc-500 dark:text-zinc-400 tabular-nums shrink-0">
                ({records.length})
              </span>
              <InfoPopover
                label={t.savedViewTitle}
                title={t.savedViewTitle}
                content={
                  <>
                    <p>{t.savedViewSubtitle}</p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 pt-1 border-t border-zinc-100 dark:border-zinc-800/70">
                      {t.savedStorageNote}
                    </p>
                  </>
                }
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 max-w-full">
            {onOpenBackupRestore && (
              <button
                type="button"
                onClick={() => onOpenBackupRestore(records.length > 0 ? 'backup' : 'restore')}
                className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 text-xs font-medium text-zinc-800 dark:text-zinc-200 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/80 transition-colors cursor-pointer whitespace-nowrap"
              >
                <HardDrive className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{isMy ? 'Backup / Restore' : 'Backup / Restore'}</span>
              </button>
            )}

            {records.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleCopySummary}
                  className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 text-xs font-medium text-zinc-800 dark:text-zinc-200 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/80 transition-colors cursor-pointer whitespace-nowrap"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                      <span>{t.reportCopied}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{t.shortlistCopySummary}</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 text-xs font-medium text-zinc-800 dark:text-zinc-200 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/80 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{t.exportCsvBtn}</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportJson}
                  className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 text-xs font-medium text-white dark:text-zinc-950 bg-zinc-950 dark:bg-zinc-100 rounded-lg hover:bg-zinc-800 dark:hover:bg-white transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{t.exportJsonBtn}</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Empty State */}
      {records.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-xl px-6 py-16 text-center">
          <div className="w-11 h-11 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 inline-flex items-center justify-center mb-4">
            <Bookmark className="w-5 h-5" aria-hidden="true" />
          </div>
          <h2 className="font-display text-base sm:text-lg font-semibold text-zinc-950 dark:text-zinc-50">
            {t.shortlistEmptyTitle}
          </h2>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400 max-w-md mx-auto leading-relaxed">
            {t.shortlistEmptyDesc}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={onBackToHunting}
              className="inline-flex items-center gap-2 min-h-[42px] px-5 py-2 text-sm font-medium text-white dark:text-zinc-950 bg-zinc-950 dark:bg-zinc-100 rounded-lg hover:bg-zinc-800 dark:hover:bg-white transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              <span>{t.savedViewBackBtn}</span>
            </button>
            {onOpenBackupRestore && (
              <button
                type="button"
                onClick={() => onOpenBackupRestore('restore')}
                className="inline-flex items-center gap-2 min-h-[42px] px-4 py-2 text-sm font-medium text-zinc-800 dark:text-zinc-200 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <Upload className="w-4 h-4" aria-hidden="true" />
                <span>{isMy ? 'Backup မှ ပြန်ယူမည်' : 'Restore from Backup'}</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Filter, Summary & Sort Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4">
              {presentCategories.length <= 4 ? (
                <div
                  className="inline-flex max-w-full items-center p-1 bg-zinc-200/70 dark:bg-zinc-700/70 rounded-lg overflow-x-auto"
                  role="group"
                  aria-label={t.settingCategoryLabel}
                >
                  <button
                    type="button"
                    onClick={() => setCategoryFilter('all')}
                    className={`min-h-[34px] px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      categoryFilter === 'all'
                        ? 'bg-white dark:bg-zinc-900 text-zinc-950 dark:text-zinc-50 shadow-xs'
                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50'
                    }`}
                  >
                    {t.categoryAll}
                  </button>
                  {presentCategories.map((catId) => (
                    <button
                      key={catId}
                      type="button"
                      onClick={() => setCategoryFilter(catId)}
                      className={`min-h-[34px] px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        categoryFilter === catId
                          ? 'bg-white dark:bg-zinc-900 text-zinc-950 dark:text-zinc-50 shadow-xs'
                          : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50'
                      }`}
                    >
                      {getCategoryLabel(catId, language, { short: true })}
                    </button>
                  ))}
                </div>
              ) : (
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value as CategoryFilter)}
                  aria-label={t.settingCategoryLabel}
                  className="min-h-[38px] px-3 py-1.5 text-xs sm:text-sm font-medium bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-300 cursor-pointer"
                >
                  <option value="all">{t.categoryAll}</option>
                  {presentCategories.map((catId) => (
                    <option key={catId} value={catId}>
                      {getCategoryLabel(catId, language)}
                    </option>
                  ))}
                </select>
              )}

              <span className="text-xs text-zinc-500 dark:text-zinc-400 font-mono tabular-nums">
                {t.shortlistAvgScore}: <strong className="text-zinc-950 dark:text-zinc-50">{avgScore}/100</strong>
              </span>
            </div>

            <div className="flex items-center gap-2.5 self-start sm:self-auto">
              <label htmlFor="saved-sort" className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                {t.sortLabel}
              </label>
              <select
                id="saved-sort"
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SavedSortKey)}
                className="min-h-[38px] px-3 py-1.5 text-xs sm:text-sm font-medium bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-300 cursor-pointer"
              >
                <option value="newest">{t.savedSortNewest}</option>
                <option value="score-desc">{t.sortScoreDesc}</option>
                <option value="price-asc">{t.sortPriceAsc}</option>
                <option value="price-desc">{t.sortPriceDesc}</option>
              </select>
            </div>
          </div>

          {/* Saved Product Cards */}
          {evaluatedRecords.length === 0 ? (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-xl px-6 py-12 text-center">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">{t.emptyFilteredTitle}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {evaluatedRecords.map(({ record, evaluation }) => {
                const product = record.product;
                const displayName = isMy ? product.nameMy : product.name;
                const subCategory = isMy ? product.subCategoryMy : product.subCategory;
                const categoryLabel = getCategoryLabel(product.category, language);
                const imageConfig = resolveProductImageDisplayConfig(product);
                const hasVerifiedComm =
                  product.commissionVerified && product.commissionRate !== null;
                const effectivePriceStatus: DataStatus = normalizeDataStatus(
                  product.priceThb === null || product.priceThb <= 0
                    ? 'unavailable'
                    : (product.priceStatus ?? 'estimated')
                );
                const effectiveCommissionStatus: DataStatus = hasVerifiedComm
                  ? 'verified'
                  : normalizeDataStatus(product.commissionStatus ?? 'unavailable');
                const formattedDate = formatResearchDate(record.researchDate, language);

                return (
                  <article
                    key={record.id}
                    className="bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-xl p-4 sm:p-5 transition-colors hover:border-zinc-300 dark:hover:border-zinc-700"
                  >
                    <div className="flex flex-col md:flex-row gap-5">
                      {/* Verified Thumbnail */}
                      <button
                        type="button"
                        onClick={() => onOpenReport(record)}
                        className="w-full md:w-48 aspect-[4/3] rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-800 shrink-0 cursor-pointer flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-200"
                      >
                        {imageConfig.canRender && imageConfig.src ? (
                          <ProductImage
                            src={imageConfig.src}
                            fallbackSrc={imageConfig.fallbackSrc}
                            productId={imageConfig.productId}
                            alt={product.name}
                            title={displayName}
                            unavailableLabel={t.cardImageUnverified}
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center p-4 text-center">
                            <ImageOff className="w-5 h-5 text-zinc-400 dark:text-zinc-500 mb-1.5" aria-hidden="true" />
                            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                              {t.cardImageUnverified}
                            </span>
                          </div>
                        )}
                      </button>

                      {/* Main Details */}
                      <div className="flex-1 min-w-0 flex flex-col justify-between space-y-4">
                        <div className="space-y-3">
                          {/* Top Metadata & Score */}
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                                <span>{categoryLabel}</span>
                                <span aria-hidden="true">·</span>
                                <span>{subCategory}</span>
                                <span aria-hidden="true">·</span>
                                <span className="inline-flex items-center gap-1 font-mono tabular-nums text-zinc-600 dark:text-zinc-400">
                                  <Calendar className="w-3 h-3 text-zinc-400 dark:text-zinc-500" aria-hidden="true" />
                                  {t.savedResearchDateLabel}: {formattedDate}
                                </span>
                              </div>

                              <button
                                type="button"
                                onClick={() => onOpenReport(record)}
                                className="mt-1.5 text-left cursor-pointer hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
                              >
                                <h3 className="font-display text-base sm:text-lg font-semibold text-zinc-950 dark:text-zinc-50 leading-snug">
                                  {displayName}
                                </h3>
                              </button>
                            </div>

                            <div className="text-left md:text-right shrink-0">
                              <div className="font-mono text-lg font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums">
                                {evaluation.totalScore}
                                <span className="text-xs font-normal text-zinc-400 dark:text-zinc-500">/100</span>
                              </div>
                              <div className={`text-xs font-medium ${tierColorClass(evaluation.tier)}`}>
                                {t.scoringTierLabels[evaluation.tier]}
                              </div>
                            </div>
                          </div>

                          {/* Key Metrics Strip */}
                          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 py-2.5 border-y border-zinc-100 dark:border-zinc-800/70 text-xs">
                            <div>
                              <span className="text-zinc-500 dark:text-zinc-400 mr-1.5">{t.cardPrice}:</span>
                              {product.priceThb !== null && product.priceThb > 0 ? (
                                <>
                                  <span className="font-mono font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums">
                                    {formatThb(product.priceThb)}
                                  </span>{' '}
                                  <span
                                    className={`text-[11px] font-medium ${dataStatusColorClass(effectivePriceStatus)}`}
                                  >
                                    ({t.dataStatusLabels[effectivePriceStatus]})
                                  </span>
                                </>
                              ) : (
                                <span className="text-zinc-400 dark:text-zinc-500 font-medium">
                                  {t.dataStatusLabels[effectivePriceStatus]}
                                </span>
                              )}
                            </div>

                            <div>
                              <span className="text-zinc-500 dark:text-zinc-400 mr-1.5">{t.cardCommission}:</span>
                              {hasVerifiedComm && product.commissionRate !== null ? (
                                <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                                  {product.commissionRate}%
                                </span>
                              ) : (
                                <span className="text-zinc-400 dark:text-zinc-500 font-medium">
                                  {t.dataStatusLabels[effectiveCommissionStatus]}
                                </span>
                              )}
                            </div>

                            <div>
                              <span className="text-zinc-500 dark:text-zinc-400 mr-1.5">{t.cardConfidence}:</span>
                              <span className="font-medium text-zinc-900 dark:text-zinc-100">
                                {t.confidenceLabels[evaluation.confidenceLevel]}{' '}
                                <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                                  ({evaluation.confidencePct}%)
                                </span>
                              </span>
                            </div>

                            <div className="font-mono text-zinc-500 dark:text-zinc-400 tabular-nums">
                              {evaluation.verifiedCount}/{evaluation.totalCriteria}{' '}
                              {t.scoringVerifiedCountLabel}
                            </div>
                          </div>

                          {/* Saved Research Sources */}
                          <div className="space-y-1">
                            <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                              {t.savedSourcesLabel}
                            </div>
                            {record.sources.length === 0 ? (
                              <p className="text-xs text-zinc-400 dark:text-zinc-500">{t.savedNoSources}</p>
                            ) : (
                              <ul className="space-y-1">
                                {record.sources.map((src, idx) => {
                                  const resolvedUrl =
                                    isLegacyOrSluglessTikTokUrl(src.url)
                                      ? (getTikTokShopProductUrl(record) ?? src.url)
                                      : src.url;
                                  return (
                                    <li
                                      key={`${idx}-${resolvedUrl ?? src.labelEn}`}
                                      className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-600 dark:text-zinc-400"
                                    >
                                      <span className="truncate max-w-xl">
                                        {isMy ? src.labelMy : src.labelEn}
                                      </span>
                                      {src.verified && isSafeHttpUrl(resolvedUrl) ? (
                                        <a
                                          href={resolvedUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1 font-medium text-zinc-900 dark:text-zinc-100 hover:underline whitespace-nowrap shrink-0"
                                        >
                                          <span>{t.sourceOpenLink}</span>
                                          <ExternalLink className="w-3 h-3" aria-hidden="true" />
                                        </a>
                                      ) : (
                                        <span className="text-[11px] text-zinc-400 dark:text-zinc-500 whitespace-nowrap shrink-0">
                                          {t.sourcePendingLink}
                                        </span>
                                      )}
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </div>
                        </div>

                        {/* Actions: Open Research Report + Compare + Delete Saved Product */}
                        <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => onOpenReport(record)}
                              className="inline-flex items-center gap-1.5 min-h-[40px] max-w-full px-4 py-2 text-xs sm:text-sm font-medium text-white dark:text-zinc-950 bg-zinc-950 dark:bg-zinc-100 rounded-lg hover:bg-zinc-800 dark:hover:bg-white transition-colors cursor-pointer whitespace-normal sm:whitespace-nowrap text-center leading-snug"
                            >
                              <span>{t.cardOpenReport}</span>
                              <ArrowUpRight className="w-4 h-4 shrink-0" aria-hidden="true" />
                            </button>

                            {onToggleCompareRecord && (
                              <button
                                type="button"
                                onClick={() => onToggleCompareRecord(record)}
                                aria-pressed={comparedKeys?.has(`saved:${record.id}`) ?? false}
                                className={`inline-flex items-center gap-1.5 min-h-[40px] max-w-full px-3.5 py-2 text-xs sm:text-sm font-medium rounded-lg border transition-colors cursor-pointer whitespace-normal sm:whitespace-nowrap text-center leading-snug ${
                                  comparedKeys?.has(`saved:${record.id}`)
                                    ? 'bg-emerald-700 dark:bg-emerald-600 text-white border-emerald-700 dark:border-emerald-500 hover:bg-emerald-800 dark:hover:bg-emerald-500'
                                    : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-zinc-950 dark:hover:text-zinc-50'
                                }`}
                              >
                                <GitCompareArrows className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                                <span>
                                  {comparedKeys?.has(`saved:${record.id}`)
                                    ? t.compareSelectedBtn
                                    : t.compareSelectBtn}
                                </span>
                              </button>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => onDelete(record.id)}
                            className="inline-flex items-center gap-1.5 min-h-[40px] max-w-full px-3.5 py-2 text-xs sm:text-sm font-medium text-zinc-600 dark:text-zinc-400 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg hover:border-red-300 dark:hover:border-red-700 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50/40 dark:hover:bg-red-950/40 transition-colors cursor-pointer whitespace-normal sm:whitespace-nowrap text-center leading-snug"
                          >
                            <Trash2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                            <span>{t.savedDeleteBtn}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}
