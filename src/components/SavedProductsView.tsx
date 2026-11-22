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
  RotateCcw,
  Trash2,
} from 'lucide-react';
import {
  CategoryFilter,
  DataStatus,
  Language,
  ProductDecisionVerdict,
  SavedProductRecord,
} from '../types/product';
import {
  formatThb,
  getTikTokShopProductUrl,
  isLegacyOrSluglessTikTokUrl,
  isSafeHttpUrl,
  resolveProductImageDisplayConfig,
} from '../utils/format';
import { evaluateProductOpportunity, normalizeDataStatus } from '../utils/scoring';
import { deriveProductDecisionSummary } from '../utils/productAnalytics';
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
import {
  ScoreRing,
  StateMessage,
  StatusDot,
  VerdictBadge,
} from './visual';

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
type VerdictFilter = 'all' | ProductDecisionVerdict;

const VERDICT_ORDER: ProductDecisionVerdict[] = [
  'recommended',
  'worth-testing',
  'need-more-data',
  'not-recommended',
];

function verdictChipTone(verdict: ProductDecisionVerdict, active: boolean): string {
  if (verdict === 'recommended') {
    return active
      ? 'bg-emerald-700 dark:bg-emerald-700 text-white border-emerald-700 dark:border-emerald-600'
      : 'bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/70 hover:bg-emerald-100/80 dark:hover:bg-emerald-950/70';
  }
  if (verdict === 'worth-testing') {
    return active
      ? 'bg-amber-700 dark:bg-amber-700 text-white border-amber-700 dark:border-amber-600'
      : 'bg-amber-50/70 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/70 hover:bg-amber-100/80 dark:hover:bg-amber-950/70';
  }
  if (verdict === 'not-recommended') {
    return active
      ? 'bg-red-700 dark:bg-red-700 text-white border-red-700 dark:border-red-600'
      : 'bg-red-50/70 dark:bg-red-950/40 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800/70 hover:bg-red-100/80 dark:hover:bg-red-950/70';
  }
  return active
    ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950 border-zinc-900 dark:border-zinc-100'
    : 'bg-zinc-100/80 dark:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200/80 dark:hover:bg-zinc-700/80';
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
  const [verdictFilter, setVerdictFilter] = useState<VerdictFilter>('all');
  const [sortKey, setSortKey] = useState<SavedSortKey>('newest');
  const [copied, setCopied] = useState(false);

  const t = TRANSLATIONS[language];
  const isMy = language === 'my';

  const presentCategories = useMemo(() => {
    const seen = new Set(records.map((r) => r.product.category));
    return UNIVERSAL_CATEGORIES.map((c) => c.id).filter((id) => seen.has(id));
  }, [records]);

  const allEvaluated = useMemo(() => {
    const allPeers = records.map((r) => r.product);
    return records.map((record) => {
      const evaluation = evaluateProductOpportunity(record.product, {
        salesWeightPct,
        peerProducts: allPeers,
      });
      const decision = deriveProductDecisionSummary(record.product, evaluation);
      return { record, evaluation, decision };
    });
  }, [records, salesWeightPct]);

  const categoryScoped = useMemo(() => {
    if (categoryFilter === 'all') return allEvaluated;
    return allEvaluated.filter((item) => item.record.product.category === categoryFilter);
  }, [allEvaluated, categoryFilter]);

  const verdictCounts = useMemo(() => {
    const counts: Record<ProductDecisionVerdict, number> = {
      recommended: 0,
      'worth-testing': 0,
      'need-more-data': 0,
      'not-recommended': 0,
    };
    for (const item of categoryScoped) {
      counts[item.decision.verdict] += 1;
    }
    return counts;
  }, [categoryScoped]);

  const evaluatedRecords = useMemo(() => {
    const filtered =
      verdictFilter === 'all'
        ? categoryScoped
        : categoryScoped.filter((item) => item.decision.verdict === verdictFilter);

    return [...filtered].sort((a, b) => {
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
  }, [categoryScoped, verdictFilter, sortKey]);

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
    <section aria-labelledby="saved-products-heading" className="space-y-5">
      {/* Header & Back Navigation */}
      <div className="space-y-3">
        <button
          type="button"
          onClick={onBackToHunting}
          className="sp-btn-ghost -ml-2.5"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{t.savedViewBackBtn}</span>
        </button>

        <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-3.5 pb-4 sm:pb-5 border-b border-zinc-200 dark:border-zinc-800">
          <div className="min-w-0 flex-1 max-w-2xl">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
              <h1
                id="saved-products-heading"
                className={`font-display text-xl sm:text-3xl font-bold text-zinc-950 dark:text-zinc-50 ${
                  isMy ? 'tracking-normal leading-[1.3]' : 'tracking-tight leading-[1.2]'
                }`}
              >
                {t.savedViewTitle}
              </h1>
              <span className="font-mono text-sm text-zinc-600 dark:text-zinc-400 tabular-nums shrink-0">
                ({records.length})
              </span>
              <InfoPopover
                label={t.savedViewTitle}
                title={t.savedViewTitle}
                content={
                  <>
                    <p>{t.savedViewSubtitle}</p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 pt-1 border-t border-zinc-100 dark:border-zinc-800/70">
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
                className="sp-btn-secondary"
              >
                <HardDrive className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Backup / Restore</span>
              </button>
            )}

            {records.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleCopySummary}
                  className="sp-btn-secondary"
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
                  className="sp-btn-secondary"
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{t.exportCsvBtn}</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportJson}
                  className="sp-btn-primary text-xs"
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{t.exportJsonBtn}</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Empty State (Single CTA) */}
      {records.length === 0 ? (
        <StateMessage
          variant="empty"
          icon={<Bookmark className="w-5 h-5" aria-hidden="true" />}
          title={t.shortlistEmptyTitle}
          reason={t.shortlistEmptyDesc}
          actionLabel={t.savedViewBackBtn}
          actionIcon={<ArrowLeft className="w-4 h-4" aria-hidden="true" />}
          onAction={onBackToHunting}
        />
      ) : (
        <>
          {/* Verdict Filter Chips (single horizontal scroll strip on mobile, wraps on desktop) */}
          <div
            className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5 sm:flex-wrap sm:overflow-visible"
            role="group"
            aria-label={t.filterDecisionLabel}
          >
            <button
              type="button"
              aria-pressed={verdictFilter === 'all'}
              onClick={() => setVerdictFilter('all')}
              className={`inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                verdictFilter === 'all'
                  ? 'bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950 border-zinc-950 dark:border-zinc-100'
                  : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500'
              }`}
            >
              <span>{t.savedVerdictAll}</span>
              <span className="font-mono tabular-nums opacity-80">{categoryScoped.length}</span>
            </button>

            {VERDICT_ORDER.map((verdict) => {
              const count = verdictCounts[verdict];
              const isActive = verdictFilter === verdict;
              return (
                <button
                  key={verdict}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setVerdictFilter((prev) => (prev === verdict ? 'all' : verdict))}
                  className={`inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${verdictChipTone(
                    verdict,
                    isActive
                  )}`}
                >
                  <span>{t.decisionVerdictLabels[verdict]}</span>
                  <span className="font-mono tabular-nums opacity-85">{count}</span>
                </button>
              );
            })}
          </div>

          {/* Category Filter, Summary & Sort Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2.5 sm:gap-3 min-w-0">
              {presentCategories.length <= 4 ? (
                <div className="relative max-w-full min-w-0">
                  <div
                    className="sp-segmented flex max-w-full overflow-x-auto no-scrollbar pr-7 sm:pr-1"
                    role="group"
                    aria-label={t.settingCategoryLabel}
                  >
                    <button
                      type="button"
                      onClick={() => setCategoryFilter('all')}
                      className={`sp-segmented-item shrink-0 ${
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
                        className={`sp-segmented-item shrink-0 ${
                          categoryFilter === catId
                            ? 'bg-white dark:bg-zinc-900 text-zinc-950 dark:text-zinc-50 shadow-xs'
                            : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50'
                        }`}
                      >
                        {getCategoryLabel(catId, language, { short: true })}
                      </button>
                    ))}
                  </div>
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 right-0 w-7 rounded-r-lg bg-gradient-to-l from-zinc-100 dark:from-zinc-800 to-transparent sm:hidden"
                  />
                </div>
              ) : (
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value as CategoryFilter)}
                  aria-label={t.settingCategoryLabel}
                  className="w-full sm:w-auto min-h-[40px] px-3 py-2 text-xs sm:text-sm font-medium bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-300 cursor-pointer"
                >
                  <option value="all">{t.categoryAll}</option>
                  {presentCategories.map((catId) => (
                    <option key={catId} value={catId}>
                      {getCategoryLabel(catId, language)}
                    </option>
                  ))}
                </select>
              )}

              <span className="text-xs text-zinc-600 dark:text-zinc-400 font-mono tabular-nums">
                {t.shortlistAvgScore}:{' '}
                <strong className="text-zinc-950 dark:text-zinc-50">{avgScore}/100</strong>
              </span>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <label
                htmlFor="saved-sort"
                className="text-xs font-medium text-zinc-600 dark:text-zinc-400 whitespace-nowrap shrink-0"
              >
                {t.sortLabel}
              </label>
              <select
                id="saved-sort"
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SavedSortKey)}
                className="flex-1 sm:flex-initial sm:w-auto min-h-[40px] px-3 py-2 text-xs sm:text-sm font-medium bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-300 cursor-pointer"
              >
                <option value="newest">{t.savedSortNewest}</option>
                <option value="score-desc">{t.sortScoreDesc}</option>
                <option value="price-asc">{t.sortPriceAsc}</option>
                <option value="price-desc">{t.sortPriceDesc}</option>
              </select>
            </div>
          </div>

          {/* Saved Product Cards (Identical anatomy to ResearchResultCard) */}
          {evaluatedRecords.length === 0 ? (
            <StateMessage
              variant="empty"
              icon={<Bookmark className="w-5 h-5" aria-hidden="true" />}
              reason={t.emptyFilteredTitle}
              actionLabel={t.savedResetFiltersBtn}
              actionIcon={<RotateCcw className="w-4 h-4" aria-hidden="true" />}
              onAction={() => {
                setCategoryFilter('all');
                setVerdictFilter('all');
              }}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {evaluatedRecords.map(({ record, evaluation, decision }) => {
                const product = record.product;
                const displayName = isMy ? product.nameMy : product.name;
                const categoryLabel = getCategoryLabel(product.category, language, { short: true });
                const imageConfig = resolveProductImageDisplayConfig(product);
                const formattedDate = formatResearchDate(record.researchDate, language);

                const hasVerifiedComm =
                  product.commissionVerified &&
                  product.commissionRate !== null &&
                  product.commissionRate > 0;
                const effectivePriceStatus: DataStatus = normalizeDataStatus(
                  product.priceThb === null || product.priceThb <= 0
                    ? 'unavailable'
                    : (product.priceStatus ?? 'estimated')
                );
                const effectiveCommissionStatus: DataStatus = hasVerifiedComm
                  ? 'verified'
                  : normalizeDataStatus(product.commissionStatus ?? 'unavailable');

                const salesVolume =
                  typeof product.kalodataMetrics?.salesVolume === 'number' &&
                  Number.isFinite(product.kalodataMetrics.salesVolume)
                    ? product.kalodataMetrics.salesVolume
                    : null;
                const salesCriterion = evaluation.criteria.find(
                  (c) => c.key === 'salesPerformance'
                );
                const effectiveSalesStatus: DataStatus = salesCriterion
                  ? normalizeDataStatus(salesCriterion.verification)
                  : salesVolume !== null
                    ? 'verified'
                    : 'unavailable';

                const creatorNumber =
                  typeof product.kalodataMetrics?.creatorNumber === 'number' &&
                  Number.isFinite(product.kalodataMetrics.creatorNumber)
                    ? product.kalodataMetrics.creatorNumber
                    : null;
                const compCriterion = evaluation.criteria.find((c) => c.key === 'competition');
                const effectiveCompStatus: DataStatus = compCriterion
                  ? normalizeDataStatus(compCriterion.verification)
                  : creatorNumber !== null
                    ? 'verified'
                    : 'unavailable';

                const isCompared = comparedKeys?.has(`saved:${record.id}`) ?? false;

                return (
                  <article
                    key={record.id}
                    className="group sp-card overflow-hidden flex flex-col transition-all duration-200 hover:-translate-y-0.5 motion-reduce:hover:translate-y-0 hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-[0_10px_28px_-14px_rgba(9,9,11,0.12)]"
                  >
                    {/* Row 1: Media Thumbnail */}
                    <button
                      type="button"
                      onClick={() => onOpenReport(record)}
                      aria-label={`${t.cardOpenReport}: ${displayName}`}
                      className="relative aspect-[16/10] sm:aspect-[4/3] w-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-200 flex items-center justify-center"
                    >
                      {imageConfig.canRender && imageConfig.src ? (
                        <ProductImage
                          src={imageConfig.src}
                          fallbackSrc={imageConfig.fallbackSrc}
                          productId={imageConfig.productId}
                          alt={product.name}
                          title={displayName}
                          unavailableLabel={t.cardImageUnverified}
                          className="w-full h-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center p-5 text-center">
                          <ImageOff
                            className="w-6 h-6 text-zinc-500 dark:text-zinc-400 mb-1.5"
                            aria-hidden="true"
                          />
                          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                            {t.cardImageUnverified}
                          </span>
                        </div>
                      )}
                    </button>

                    <div className="p-3.5 sm:p-5 flex-1 flex flex-col gap-3">
                      {/* Row 2: Title + ScoreRing */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400 truncate">
                            <span className="truncate">{categoryLabel}</span>
                            <span aria-hidden="true">·</span>
                            <span className="truncate">{product.shopName}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => onOpenReport(record)}
                            className="mt-1 text-left w-full cursor-pointer group/title focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-200 rounded-sm"
                          >
                            <h3 className="font-display text-sm sm:text-base font-semibold text-zinc-950 dark:text-zinc-50 leading-snug line-clamp-2 group-hover/title:text-zinc-700 dark:group-hover/title:text-zinc-300 transition-colors min-h-[2.4rem]">
                              {displayName}
                            </h3>
                          </button>
                        </div>

                        <ScoreRing
                          value={evaluation.totalScore}
                          max={100}
                          size={56}
                          className="shrink-0"
                        />
                      </div>

                      {/* Row 3: VerdictBadge + Saved Date & Sources Popover */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <VerdictBadge verdict={decision.verdict} size="sm" language={language} />

                        <div className="inline-flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                          <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                            <Calendar className="w-3 h-3 shrink-0" aria-hidden="true" />
                            <span>{formattedDate}</span>
                          </span>
                          <InfoPopover
                            label={t.savedSourcesLabel}
                            title={t.savedSourcesLabel}
                            content={
                              record.sources.length === 0 ? (
                                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                                  {t.savedNoSources}
                                </p>
                              ) : (
                                <ul className="space-y-1.5">
                                  {record.sources.map((src, idx) => {
                                    const resolvedUrl = isLegacyOrSluglessTikTokUrl(src.url)
                                      ? (getTikTokShopProductUrl(record) ?? src.url)
                                      : src.url;
                                    return (
                                      <li
                                        key={`${idx}-${resolvedUrl ?? src.labelEn}`}
                                        className="flex items-center justify-between gap-2 text-xs"
                                      >
                                        <span className="truncate text-zinc-700 dark:text-zinc-300">
                                          {isMy ? src.labelMy : src.labelEn}
                                        </span>
                                        {src.verified && isSafeHttpUrl(resolvedUrl) ? (
                                          <a
                                            href={resolvedUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 font-medium text-zinc-950 dark:text-zinc-50 hover:underline whitespace-nowrap shrink-0"
                                          >
                                            <span>{t.sourceOpenLink}</span>
                                            <ExternalLink className="w-3 h-3" aria-hidden="true" />
                                          </a>
                                        ) : (
                                          <span className="text-zinc-500 dark:text-zinc-400 whitespace-nowrap shrink-0">
                                            {t.sourcePendingLink}
                                          </span>
                                        )}
                                      </li>
                                    );
                                  })}
                                </ul>
                              )
                            }
                          />
                        </div>
                      </div>

                      {/* Row 4: 2x2 Key Metrics (label left, StatusDot right — matches ResearchResultCard) */}
                      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 pt-3 border-t border-zinc-100 dark:border-zinc-800/70">
                        {/* Price */}
                        <div className="min-w-0">
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="text-xs text-zinc-600 dark:text-zinc-400 truncate">
                              {t.cardPrice}
                            </span>
                            <StatusDot status={effectivePriceStatus} language={language} size="sm" />
                          </div>
                          <div className="mt-0.5 font-mono text-[15px] font-bold text-zinc-950 dark:text-zinc-50 tabular-nums truncate">
                            {product.priceThb !== null && product.priceThb > 0
                              ? formatThb(product.priceThb)
                              : '—'}
                          </div>
                        </div>

                        {/* Commission */}
                        <div className="min-w-0">
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="text-xs text-zinc-600 dark:text-zinc-400 truncate">
                              {t.cardCommission}
                            </span>
                            <StatusDot
                              status={effectiveCommissionStatus}
                              language={language}
                              size="sm"
                            />
                          </div>
                          <div className="mt-0.5 flex items-baseline gap-1.5 min-w-0">
                            <span
                              className={`font-mono text-[15px] font-bold tabular-nums shrink-0 ${
                                hasVerifiedComm && product.commissionRate !== null
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : 'text-zinc-500 dark:text-zinc-400'
                              }`}
                            >
                              {hasVerifiedComm && product.commissionRate !== null
                                ? `${product.commissionRate}%`
                                : '—'}
                            </span>
                            {hasVerifiedComm && product.estimatedCommissionPerSaleThb !== null && (
                              <span className="font-mono text-xs text-zinc-600 dark:text-zinc-400 tabular-nums truncate">
                                {formatThb(product.estimatedCommissionPerSaleThb)}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Sales */}
                        <div className="min-w-0">
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="text-xs text-zinc-600 dark:text-zinc-400 truncate">
                              {t.cardSalesLabel}
                            </span>
                            <StatusDot status={effectiveSalesStatus} language={language} size="sm" />
                          </div>
                          <div
                            className={`mt-0.5 font-mono text-[15px] font-bold tabular-nums truncate ${
                              salesVolume !== null
                                ? 'text-zinc-950 dark:text-zinc-50'
                                : 'text-zinc-500 dark:text-zinc-400'
                            }`}
                          >
                            {salesVolume !== null ? salesVolume.toLocaleString('en-US') : '—'}
                          </div>
                        </div>

                        {/* Competition */}
                        <div className="min-w-0">
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="text-xs text-zinc-600 dark:text-zinc-400 truncate">
                              {t.cardCompetition}
                            </span>
                            <StatusDot status={effectiveCompStatus} language={language} size="sm" />
                          </div>
                          <div
                            className={`mt-0.5 font-mono text-sm font-bold tabular-nums truncate ${
                              creatorNumber !== null
                                ? 'text-zinc-950 dark:text-zinc-50'
                                : 'text-zinc-500 dark:text-zinc-400'
                            }`}
                          >
                            {creatorNumber !== null
                              ? `${creatorNumber.toLocaleString('en-US')} ${t.bestCreatorsUnit}`
                              : '—'}
                          </div>
                        </div>
                      </div>

                      {/* Row 5: Actions */}
                      <div className="mt-auto pt-3 border-t border-zinc-100 dark:border-zinc-800/70 space-y-2">
                        <button
                          type="button"
                          onClick={() => onOpenReport(record)}
                          className="sp-btn-primary w-full text-xs font-semibold"
                        >
                          <span>{t.cardOpenReport}</span>
                          <ArrowUpRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        </button>

                        <div className="grid grid-cols-2 gap-2">
                          {onToggleCompareRecord && (
                            <button
                              type="button"
                              onClick={() => onToggleCompareRecord(record)}
                              aria-pressed={isCompared}
                              className={`inline-flex items-center justify-center gap-1.5 min-h-[40px] px-2.5 py-2 text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-200 ${
                                isCompared
                                  ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                                  : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500 hover:text-zinc-950 dark:hover:text-zinc-50'
                              }`}
                            >
                              <GitCompareArrows className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                              <span className="truncate">
                                {isCompared ? t.compareSelectedBtn : t.compareSelectBtn}
                              </span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => onDelete(record.id)}
                            className={`inline-flex items-center justify-center gap-1.5 min-h-[40px] px-2.5 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:border-red-300 dark:hover:border-red-700 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50/40 dark:hover:bg-red-950/40 transition-colors cursor-pointer whitespace-nowrap min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-200 ${
                              onToggleCompareRecord ? '' : 'col-span-2'
                            }`}
                          >
                            <Trash2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                            <span className="truncate">{t.savedDeleteBtn}</span>
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
