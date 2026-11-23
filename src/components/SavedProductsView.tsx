import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
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
import {
  MOTION_TRANSITIONS,
  MOTION_VARIANTS,
  TACTILE_INTERACTIONS,
  shouldEnableGridLayoutReflow,
} from '../utils/motionPresets';
import { TRANSLATIONS } from '../i18n/translations';
import { ProductImage } from './ProductImage';
import { InfoPopover } from './InfoPopover';
import { TechnicalSignalStrip } from './TechnicalSignalStrip';
import {
  AnimatedNumber,
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

function verdictPillSurface(verdict: VerdictFilter): string {
  if (verdict === 'recommended') return 'bg-emerald-600 dark:bg-[#10F5A0] shadow-sm';
  if (verdict === 'worth-testing') return 'bg-amber-600 dark:bg-amber-400 shadow-sm';
  if (verdict === 'not-recommended') return 'bg-rose-600 dark:bg-[#FE2C55] shadow-sm';
  return 'bg-zinc-900 dark:bg-zinc-100 shadow-sm';
}

function verdictInactiveDot(verdict: ProductDecisionVerdict): string {
  if (verdict === 'recommended') return 'bg-emerald-500 dark:bg-[#10F5A0]';
  if (verdict === 'worth-testing') return 'bg-amber-500 dark:bg-amber-400';
  if (verdict === 'not-recommended') return 'bg-rose-500 dark:bg-[#FE2C55]';
  return 'bg-zinc-400 dark:bg-zinc-500';
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
  const [isDesktop, setIsDesktop] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(min-width: 1024px)').matches
      : true
  );
  const prefersReduced = useReducedMotion();

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = (event: MediaQueryListEvent) => setIsDesktop(event.matches);
    setIsDesktop(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

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

  const enableGridReflow =
    !prefersReduced && shouldEnableGridLayoutReflow(evaluatedRecords.length, isDesktop);

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
      {/* Header Summary Card & Back Navigation */}
      <div className="space-y-3">
        <button
          type="button"
          onClick={onBackToHunting}
          className="sp-btn-ghost -ml-2.5"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{t.savedViewBackBtn}</span>
        </button>

        <div className="rounded-2xl bg-[var(--sp-surface)] border border-[var(--sp-border)] p-4 sm:p-5 flex flex-col xl:flex-row xl:items-center justify-between gap-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:shadow-none dark:ring-1 dark:ring-inset dark:ring-white/[0.03]">
          <div className="min-w-0 flex-1 max-w-2xl">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 min-w-0">
              <h1
                id="saved-products-heading"
                className={`font-display text-xl sm:text-3xl font-bold text-zinc-950 dark:text-zinc-50 ${
                  isMy ? 'tracking-normal leading-[1.3]' : 'tracking-tight leading-[1.2]'
                }`}
              >
                {t.savedViewTitle}
              </h1>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg bg-emerald-500/10 dark:bg-[#10F5A0]/12 border border-emerald-500/25 dark:border-[#10F5A0]/25 font-mono text-sm font-bold text-emerald-600 dark:text-[#10F5A0] tabular-nums shrink-0">
                <AnimatedNumber value={records.length} />
              </span>
              <InfoPopover
                label={t.savedViewTitle}
                title={t.savedViewTitle}
                content={
                  <>
                    <p>{t.savedViewSubtitle}</p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 pt-1 border-t border-[var(--sp-border)]">
                      {t.savedStorageNote}
                    </p>
                  </>
                }
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 max-w-full">
            {onOpenBackupRestore && (
              <motion.button
                type="button"
                whileTap={prefersReduced ? undefined : TACTILE_INTERACTIONS.buttonTap}
                onClick={() => onOpenBackupRestore(records.length > 0 ? 'backup' : 'restore')}
                className="sp-btn-secondary"
              >
                <HardDrive className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Backup / Restore</span>
              </motion.button>
            )}

            {records.length > 0 && (
              <>
                <motion.button
                  type="button"
                  whileTap={prefersReduced ? undefined : TACTILE_INTERACTIONS.buttonTap}
                  onClick={handleCopySummary}
                  className="sp-btn-secondary"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-[#10F5A0]" aria-hidden="true" />
                      <span>{t.reportCopied}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{t.shortlistCopySummary}</span>
                    </>
                  )}
                </motion.button>

                <motion.button
                  type="button"
                  whileTap={prefersReduced ? undefined : TACTILE_INTERACTIONS.buttonTap}
                  onClick={handleExportCsv}
                  className="sp-btn-secondary"
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{t.exportCsvBtn}</span>
                </motion.button>

                <motion.button
                  type="button"
                  whileTap={prefersReduced ? undefined : TACTILE_INTERACTIONS.buttonTap}
                  onClick={handleExportJson}
                  className="sp-btn-volt text-xs"
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{t.exportJsonBtn}</span>
                </motion.button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Empty State (Single CTA) */}
      {records.length === 0 ? (
        <div className="rounded-2xl bg-[var(--sp-surface)] border border-[var(--sp-border)] p-4 sm:p-6">
          <StateMessage
            variant="empty"
            icon={<Bookmark className="w-5 h-5" aria-hidden="true" />}
            title={t.shortlistEmptyTitle}
            reason={t.shortlistEmptyDesc}
            actionLabel={t.savedViewBackBtn}
            actionIcon={<ArrowLeft className="w-4 h-4" aria-hidden="true" />}
            onAction={onBackToHunting}
          />
        </div>
      ) : (
        <>
          {/* Unified Filter & Sort Studio Bar */}
          <div className="rounded-2xl bg-[var(--sp-surface)] border border-[var(--sp-border)] p-3.5 sm:p-4 space-y-3.5">
            {/* Verdict Filter Pills with Gliding Active Indicator */}
            <div className="overflow-x-auto no-scrollbar pb-0.5 sm:overflow-visible">
              <div
                className="inline-flex items-center gap-1 p-1 rounded-xl bg-[var(--sp-surface-muted)] border border-[var(--sp-border)] sm:flex-wrap"
                role="group"
                aria-label={t.filterDecisionLabel}
              >
                <motion.button
                  type="button"
                  aria-pressed={verdictFilter === 'all'}
                  whileTap={prefersReduced ? undefined : TACTILE_INTERACTIONS.buttonTap}
                  onClick={() => setVerdictFilter('all')}
                  className={`relative inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-[#10F5A0] ${
                    verdictFilter === 'all'
                      ? 'text-white dark:text-[#06070A]'
                      : 'text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-50'
                  }`}
                >
                  {verdictFilter === 'all' && (
                    <motion.span
                      layoutId="saved-verdict-pill"
                      transition={prefersReduced ? { duration: 0 } : MOTION_TRANSITIONS.snappy}
                      aria-hidden="true"
                      className={`absolute inset-0 rounded-lg ${verdictPillSurface('all')}`}
                    />
                  )}
                  <span className="relative z-10">{t.savedVerdictAll}</span>
                  <span className="relative z-10 font-mono tabular-nums opacity-80">
                    {categoryScoped.length}
                  </span>
                </motion.button>

                {VERDICT_ORDER.map((verdict) => {
                  const count = verdictCounts[verdict];
                  const isActive = verdictFilter === verdict;
                  return (
                    <motion.button
                      key={verdict}
                      type="button"
                      aria-pressed={isActive}
                      whileTap={prefersReduced ? undefined : TACTILE_INTERACTIONS.buttonTap}
                      onClick={() => setVerdictFilter((prev) => (prev === verdict ? 'all' : verdict))}
                      className={`relative inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-[#10F5A0] ${
                        isActive
                          ? verdict === 'not-recommended'
                            ? 'text-white'
                            : 'text-white dark:text-[#06070A]'
                          : 'text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-50'
                      }`}
                    >
                      {isActive && (
                        <motion.span
                          layoutId="saved-verdict-pill"
                          transition={prefersReduced ? { duration: 0 } : MOTION_TRANSITIONS.snappy}
                          aria-hidden="true"
                          className={`absolute inset-0 rounded-lg ${verdictPillSurface(verdict)}`}
                        />
                      )}
                      {!isActive && (
                        <span
                          aria-hidden="true"
                          className={`relative z-10 w-1.5 h-1.5 rounded-full shrink-0 ${verdictInactiveDot(verdict)}`}
                        />
                      )}
                      <span className="relative z-10">{t.decisionVerdictLabels[verdict]}</span>
                      <span className="relative z-10 font-mono tabular-nums opacity-85">{count}</span>
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* Category Filter, Avg Score & Sort Bar */}
            <div className="pt-3 border-t border-[var(--sp-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
                            ? 'bg-[var(--sp-surface)] text-zinc-950 dark:text-zinc-50 shadow-xs'
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
                              ? 'bg-[var(--sp-surface)] text-zinc-950 dark:text-zinc-50 shadow-xs'
                              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50'
                          }`}
                        >
                          {getCategoryLabel(catId, language, { short: true })}
                        </button>
                      ))}
                    </div>
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-y-0 right-0 w-7 rounded-r-xl bg-gradient-to-l from-[var(--sp-surface-muted)] to-transparent sm:hidden"
                    />
                  </div>
                ) : (
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value as CategoryFilter)}
                    aria-label={t.settingCategoryLabel}
                    className="w-full sm:w-auto min-h-[40px] px-3 py-2 text-xs sm:text-sm font-medium bg-[var(--sp-surface-muted)] border border-[var(--sp-border)] rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-cyan-500 dark:focus:border-[#25F4EE] cursor-pointer"
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
                  <strong className="text-emerald-700 dark:text-[#10F5A0]">
                    <AnimatedNumber value={avgScore} suffix="/100" />
                  </strong>
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
                  className="flex-1 sm:flex-initial sm:w-auto min-h-[40px] px-3 py-2 text-xs sm:text-sm font-medium bg-[var(--sp-surface-muted)] border border-[var(--sp-border)] rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-cyan-500 dark:focus:border-[#25F4EE] cursor-pointer"
                >
                  <option value="newest">{t.savedSortNewest}</option>
                  <option value="score-desc">{t.sortScoreDesc}</option>
                  <option value="price-asc">{t.sortPriceAsc}</option>
                  <option value="price-desc">{t.sortPriceDesc}</option>
                </select>
              </div>
            </div>
          </div>

          {/* Saved Product Cards (Obsidian Hunter v2.0 Anatomy + Guarded Grid Reflow) */}
          {evaluatedRecords.length === 0 ? (
            <div className="rounded-2xl bg-[var(--sp-surface)] border border-[var(--sp-border)] p-4 sm:p-6">
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
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              <AnimatePresence mode={enableGridReflow ? 'popLayout' : 'sync'} initial={false}>
              {evaluatedRecords.map(({ record, evaluation, decision }, idx) => {
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
                  <motion.article
                    key={record.id}
                    layout={enableGridReflow ? 'position' : false}
                    variants={MOTION_VARIANTS.cardReveal}
                    custom={idx}
                    initial={prefersReduced ? false : 'initial'}
                    animate="animate"
                    exit={prefersReduced ? undefined : 'exit'}
                    whileHover={prefersReduced ? undefined : TACTILE_INTERACTIONS.cardHover}
                    className="group rounded-2xl bg-[var(--sp-surface)] border border-[var(--sp-border)] overflow-hidden flex flex-col transition-colors hover:border-zinc-300 dark:hover:border-white/20 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:shadow-none dark:ring-1 dark:ring-inset dark:ring-white/[0.03]"
                  >
                    {/* Row 1: Media Thumbnail */}
                    <button
                      type="button"
                      onClick={() => onOpenReport(record)}
                      aria-label={`${t.cardOpenReport}: ${displayName}`}
                      className="relative aspect-[16/10] sm:aspect-[4/3] w-full bg-[var(--sp-surface-muted)] overflow-hidden text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-900 dark:focus-visible:ring-[#25F4EE] flex items-center justify-center"
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

                      {/* Row 4: 2x2 Key Metrics (Obsidian Volt Money & Market Telemetry) */}
                      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 pt-3 border-t border-[var(--sp-border)]">
                        {/* Price */}
                        <div className="min-w-0">
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="text-xs text-zinc-600 dark:text-zinc-400 truncate">
                              {t.cardPrice}
                            </span>
                            <StatusDot status={effectivePriceStatus} language={language} size="sm" />
                          </div>
                          <div className="mt-0.5 font-mono text-[15px] font-bold text-zinc-950 dark:text-zinc-50 tabular-nums truncate">
                            {product.priceThb !== null && product.priceThb > 0 ? (
                              <AnimatedNumber
                                value={product.priceThb}
                                prefix="฿"
                                decimals={Number.isInteger(product.priceThb) ? 0 : 2}
                              />
                            ) : (
                              '—'
                            )}
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
                                  ? 'text-emerald-700 dark:text-[#10F5A0]'
                                  : 'text-zinc-500 dark:text-zinc-400'
                              }`}
                            >
                              {hasVerifiedComm && product.commissionRate !== null ? (
                                <AnimatedNumber
                                  value={product.commissionRate}
                                  suffix="%"
                                  decimals={Number.isInteger(product.commissionRate) ? 0 : 1}
                                  highlightSignal={
                                    product.commissionVerified === true &&
                                    product.commissionRate >= 10
                                      ? 'emerald-sheen'
                                      : 'none'
                                  }
                                />
                              ) : (
                                '—'
                              )}
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
                                ? 'text-cyan-700 dark:text-[#25F4EE]'
                                : 'text-zinc-500 dark:text-zinc-400'
                            }`}
                          >
                            {salesVolume !== null ? <AnimatedNumber value={salesVolume} /> : '—'}
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

                      {/* Compact Affiliate Technical Signal Strip */}
                      <TechnicalSignalStrip
                        product={product}
                        evaluation={evaluation}
                        language={language}
                        variant="compact"
                      />

                      {/* Row 5: Actions */}
                      <div className="mt-auto pt-3 border-t border-[var(--sp-border)] space-y-2">
                        <motion.button
                          type="button"
                          whileTap={prefersReduced ? undefined : TACTILE_INTERACTIONS.buttonTap}
                          onClick={() => onOpenReport(record)}
                          className="sp-btn-primary w-full text-xs font-semibold"
                        >
                          <span>{t.cardOpenReport}</span>
                          <ArrowUpRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        </motion.button>

                        <div className="grid grid-cols-2 gap-2">
                          {onToggleCompareRecord && (
                            <motion.button
                              type="button"
                              whileTap={prefersReduced ? undefined : TACTILE_INTERACTIONS.buttonTap}
                              onClick={() => onToggleCompareRecord(record)}
                              aria-pressed={isCompared}
                              className={`inline-flex items-center justify-center gap-1.5 min-h-[40px] px-2.5 py-2 text-xs font-medium rounded-xl border transition-colors cursor-pointer whitespace-nowrap min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 dark:focus-visible:ring-[#25F4EE] ${
                                isCompared
                                  ? 'bg-cyan-500/12 dark:bg-[#25F4EE]/12 text-cyan-800 dark:text-[#25F4EE] border-cyan-500/35 dark:border-[#25F4EE]/40'
                                  : 'bg-[var(--sp-surface)] text-zinc-700 dark:text-zinc-200 border-[var(--sp-border-strong)] hover:border-zinc-400 dark:hover:border-white/25 hover:text-zinc-950 dark:hover:text-zinc-50'
                              }`}
                            >
                              <GitCompareArrows className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                              <span className="truncate">
                                {isCompared ? t.compareSelectedBtn : t.compareSelectBtn}
                              </span>
                            </motion.button>
                          )}

                          <motion.button
                            type="button"
                            whileTap={prefersReduced ? undefined : TACTILE_INTERACTIONS.buttonTap}
                            onClick={() => onDelete(record.id)}
                            className={`inline-flex items-center justify-center gap-1.5 min-h-[40px] px-2.5 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-[var(--sp-surface)] border border-[var(--sp-border-strong)] rounded-xl hover:border-rose-400/60 dark:hover:border-[#FE2C55]/50 hover:text-rose-700 dark:hover:text-[#FE2C55] hover:bg-rose-500/[0.06] dark:hover:bg-[#FE2C55]/[0.08] transition-colors cursor-pointer whitespace-nowrap min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:focus-visible:ring-[#FE2C55] ${
                              onToggleCompareRecord ? '' : 'col-span-2'
                            }`}
                          >
                            <Trash2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                            <span className="truncate">{t.savedDeleteBtn}</span>
                          </motion.button>
                        </div>
                      </div>
                    </div>
                  </motion.article>
                );
              })}
              </AnimatePresence>
            </div>
          )}
        </>
      )}
    </section>
  );
}
