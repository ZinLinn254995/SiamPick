import { memo, type RefObject, useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  AlertCircle,
  ArrowRight,
  Award,
  ChevronDown,
  ExternalLink,
  Globe,
  LayoutGrid,
  PauseCircle,
  PlayCircle,
  Radar,
  RotateCcw,
  SearchCheck,
  SlidersHorizontal,
} from 'lucide-react';
import type {
  DecisionFilter,
  GroundingSourceLink,
  Language,
  OpportunityEvaluation,
  ProductCategory,
  ProductDecision,
  ProductDecisionSummary,
  ProductResultsFilterState,
  ProductSortField,
  ResearchConfig,
  ResearchCostSummary,
  ResearchProduct,
  ResearchQuotaStatus,
  SortDirection,
  StrategyPreset,
} from '../types/product';
import { TRANSLATIONS } from '../i18n/translations';
import { getCategoryLabel, UNIVERSAL_CATEGORIES } from '../utils/categoryRegistry';
import { isSafeHttpUrl, normalizeTikTokSourceUrl } from '../utils/format';
import { formatCredits, formatUsd } from '../utils/kalodataPricing';
import {
  computeBestProductSelections,
  DEFAULT_PRODUCT_FILTERS,
  deriveProductDecisionSummary,
  filterProducts,
  sortProductsByField,
} from '../utils/productAnalytics';
import {
  buildProductsExportCsv,
  buildProductsExportJson,
  triggerFileDownload,
} from '../utils/exportReports';
import type { LatestResearchSessionMeta } from '../utils/researchHistoryStorage';
import { formatResearchDate } from '../utils/savedProductsStorage';
import {
  MOTION_TRANSITIONS,
  shouldEnableGridLayoutReflow,
} from '../utils/motionPresets';
import { buildMarketOpportunityMatrixData } from '../utils/technicalAnalysis';
import { BestProductsStrip } from './BestProductsStrip';
import { MarketOpportunityMatrix } from './MarketOpportunityMatrix';
import { ProductFilterBar } from './ProductFilterBar';
import { ResearchResultCard } from './ResearchResultCard';
import { ScoringRubricPanel } from './ScoringRubricPanel';
import {
  AnimatedNumber,
  ResearchResultCardSkeleton,
  StateMessage,
  StatusLegendPopover,
} from './visual';

const VIEW_MODE_STORAGE_KEY = 'siampick_results_view_mode';

function readInitialViewMode(): 'cards' | 'matrix' {
  if (typeof window === 'undefined') return 'cards';
  try {
    const raw = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    return raw === 'matrix' ? 'matrix' : 'cards';
  } catch {
    return 'cards';
  }
}

interface HuntingResultsSectionProps {
  sectionRef: RefObject<HTMLElement | null>;
  language: Language;
  liveResults: readonly ResearchProduct[];
  liveEvaluations: Map<string, OpportunityEvaluation>;
  isHunting: boolean;
  researchedAt: string | null;
  sessionMeta: LatestResearchSessionMeta | null;
  lastCostSummary: ResearchCostSummary | null;
  researchSourceMode: 'kalodata-openapi' | null;
  groundingSources: readonly GroundingSourceLink[];
  searchQueries: readonly string[];
  activeHuntConfig: ResearchConfig | null;
  quotaStatus: ResearchQuotaStatus;
  displayErrorText: string | null;
  salesWeightPct: number;
  deferredSalesWeightPct: number;
  strategyPreset: StrategyPreset;
  onSelectStrategyPreset: (preset: StrategyPreset) => void;
  onCustomWeightChange: (weight: number) => void;
  savedIdSet: ReadonlySet<string>;
  rejectedIdSet: ReadonlySet<string>;
  comparedLiveProductIds: Set<string>;
  filters: ProductResultsFilterState;
  onChangeFilters: (next: ProductResultsFilterState) => void;
  decisionFilter: DecisionFilter;
  onChangeDecisionFilter: (next: DecisionFilter) => void;
  sortField: ProductSortField;
  onChangeSortField: (next: ProductSortField) => void;
  sortDirection: SortDirection;
  onToggleSortDirection: () => void;
  onToggleSave: (id: string) => void;
  onToggleReject: (id: string) => void;
  onOpenReport: (product: ResearchProduct) => void;
  onOpenDeepDive: (product: ResearchProduct) => void;
  onToggleCompare: (product: ResearchProduct) => void;
  onCancelHunting: () => void;
  onResumeAndEditSettings: () => void;
  onRetryHunt: () => void;
  onTurnOffMyanmarAndEdit: () => void;
}

export const HuntingResultsSection = memo(function HuntingResultsSection({
  sectionRef,
  language,
  liveResults,
  liveEvaluations,
  isHunting,
  researchedAt,
  sessionMeta,
  lastCostSummary,
  researchSourceMode,
  groundingSources,
  searchQueries,
  activeHuntConfig,
  quotaStatus,
  displayErrorText,
  salesWeightPct,
  deferredSalesWeightPct,
  strategyPreset,
  onSelectStrategyPreset,
  onCustomWeightChange,
  savedIdSet,
  rejectedIdSet,
  comparedLiveProductIds,
  filters,
  onChangeFilters,
  decisionFilter,
  onChangeDecisionFilter,
  sortField,
  onChangeSortField,
  sortDirection,
  onToggleSortDirection,
  onToggleSave,
  onToggleReject,
  onOpenReport,
  onOpenDeepDive,
  onToggleCompare,
  onCancelHunting,
  onResumeAndEditSettings,
  onRetryHunt,
  onTurnOffMyanmarAndEdit,
}: HuntingResultsSectionProps) {
  const t = TRANSLATIONS[language];
  const isMy = language === 'my';
  const prefersReduced = useReducedMotion();

  const [isDesktop, setIsDesktop] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(min-width: 1024px)').matches
      : false
  );
  const [strategyDrawerOpen, setStrategyDrawerOpen] = useState(false);
  const [rubricOpen, setRubricOpen] = useState(false);
  const [groundingOpen, setGroundingOpen] = useState(false);
  const [bestPicksOpen, setBestPicksOpen] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(min-width: 1024px)').matches
      : false
  );
  const [viewMode, setViewMode] = useState<'cards' | 'matrix'>(readInitialViewMode);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(min-width: 1024px)');
    const handleChange = (event: MediaQueryListEvent) => setIsDesktop(event.matches);
    setIsDesktop(mq.matches);
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, []);

  const handleChangeViewMode = useCallback((next: 'cards' | 'matrix') => {
    setViewMode(next);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, next);
      } catch {
        // Ignore storage errors
      }
    }
  }, []);

  const handleToggleRubric = useCallback(() => {
    setRubricOpen((prev) => !prev);
  }, []);

  const handleResetFilters = useCallback(() => {
    onChangeFilters({ ...DEFAULT_PRODUCT_FILTERS });
    onChangeDecisionFilter('active');
  }, [onChangeFilters, onChangeDecisionFilter]);

  const queueCounts = useMemo(() => {
    let active = 0;
    let saved = 0;
    let rejected = 0;
    for (const p of liveResults) {
      if (rejectedIdSet.has(p.id)) {
        rejected += 1;
      } else {
        active += 1;
        if (savedIdSet.has(p.id)) saved += 1;
      }
    }
    return { active, saved, rejected };
  }, [liveResults, savedIdSet, rejectedIdSet]);

  const liveDecisions = useMemo(() => {
    const map = new Map<string, ProductDecisionSummary>();
    for (const product of liveResults) {
      const ev = liveEvaluations.get(product.id);
      if (ev) {
        map.set(product.id, deriveProductDecisionSummary(product, ev));
      }
    }
    return map;
  }, [liveResults, liveEvaluations]);

  const visibleProducts = useMemo<ResearchProduct[]>(() => {
    const queueFiltered = liveResults.filter((product) => {
      if (decisionFilter === 'active') return !rejectedIdSet.has(product.id);
      if (decisionFilter === 'saved') return savedIdSet.has(product.id);
      if (decisionFilter === 'rejected') return rejectedIdSet.has(product.id);
      return true;
    });

    const multiFiltered = filterProducts(
      queueFiltered,
      liveEvaluations,
      filters,
      liveDecisions
    );

    return sortProductsByField(
      multiFiltered,
      liveEvaluations,
      sortField,
      sortDirection
    );
  }, [
    liveResults,
    liveEvaluations,
    liveDecisions,
    decisionFilter,
    savedIdSet,
    rejectedIdSet,
    filters,
    sortField,
    sortDirection,
  ]);

  const matrixPreview = useMemo(
    () =>
      buildMarketOpportunityMatrixData(
        visibleProducts,
        liveEvaluations,
        'commissionPerOrder'
      ),
    [visibleProducts, liveEvaluations]
  );

  const effectiveViewMode: 'cards' | 'matrix' =
    viewMode === 'matrix' && matrixPreview.isReliable ? 'matrix' : 'cards';

  const enableGridReflow = shouldEnableGridLayoutReflow(visibleProducts.length, isDesktop);

  const bestSelections = useMemo(
    () =>
      visibleProducts.length > 0
        ? computeBestProductSelections(visibleProducts, liveEvaluations)
        : [],
    [visibleProducts, liveEvaluations]
  );

  const batchScoreRanks = useMemo(() => {
    const total = liveResults.length;
    const ranks = new Map<string, { rank: number; total: number }>();
    if (total === 0) return ranks;
    const entries = liveResults.map((product) => ({
      id: product.id,
      score: liveEvaluations.get(product.id)?.totalScore ?? null,
    }));
    for (const entry of entries) {
      if (entry.score === null) continue;
      let higherCount = 0;
      for (const peer of entries) {
        if (peer.score !== null && peer.score > entry.score) {
          higherCount += 1;
        }
      }
      ranks.set(entry.id, { rank: higherCount + 1, total });
    }
    return ranks;
  }, [liveResults, liveEvaluations]);

  const availableResultCategories = useMemo(() => {
    const seen = new Set(liveResults.map((p) => p.category));
    return UNIVERSAL_CATEGORIES.map((c) => c.id).filter((id) => seen.has(id));
  }, [liveResults]);

  const queueCategoryCounts = useMemo(() => {
    const counts: Partial<Record<ProductCategory, number>> = {};
    for (const product of liveResults) {
      if (decisionFilter === 'active' && rejectedIdSet.has(product.id)) continue;
      if (decisionFilter === 'saved' && !savedIdSet.has(product.id)) continue;
      if (decisionFilter === 'rejected' && !rejectedIdSet.has(product.id)) continue;
      counts[product.category] = (counts[product.category] ?? 0) + 1;
    }
    return counts;
  }, [liveResults, decisionFilter, savedIdSet, rejectedIdSet]);

  const activeCategoryLabel = useMemo(() => {
    if (!activeHuntConfig) return '';
    if (activeHuntConfig.selectedCategories && activeHuntConfig.selectedCategories.length > 0) {
      const names = activeHuntConfig.selectedCategories
        .map((cat) =>
          getCategoryLabel(cat, language, {
            short: (activeHuntConfig.selectedCategories?.length ?? 0) > 1,
          })
        )
        .slice(0, 3)
        .join(', ');
      return activeHuntConfig.selectedCategories.length > 3
        ? `${names} +${activeHuntConfig.selectedCategories.length - 3}`
        : names;
    }
    return activeHuntConfig.category === 'all'
      ? t.settingBothCategories
      : getCategoryLabel(activeHuntConfig.category, language);
  }, [activeHuntConfig, language, t.settingBothCategories]);

  const handleExportVisibleCsv = useCallback(() => {
    if (visibleProducts.length === 0) return;
    const csv = buildProductsExportCsv(visibleProducts, {
      salesWeightPct: deferredSalesWeightPct,
      evaluations: liveEvaluations,
      researchDate: researchedAt,
      exportTitle: 'SiamPick Product Research Results',
      language,
    });
    triggerFileDownload(csv, 'siampick-research-results.csv', 'text/csv;charset=utf-8;');
  }, [visibleProducts, deferredSalesWeightPct, liveEvaluations, researchedAt, language]);

  const handleExportVisibleJson = useCallback(() => {
    if (visibleProducts.length === 0) return;
    const json = buildProductsExportJson(visibleProducts, {
      salesWeightPct: deferredSalesWeightPct,
      evaluations: liveEvaluations,
      researchDate: researchedAt,
      exportTitle: 'SiamPick Product Research Results',
      language,
    });
    triggerFileDownload(
      json,
      'siampick-research-results.json',
      'application/json;charset=utf-8;'
    );
  }, [visibleProducts, deferredSalesWeightPct, liveEvaluations, researchedAt, language]);

  const getDecision = (id: string): ProductDecision => {
    if (savedIdSet.has(id)) return 'saved';
    if (rejectedIdSet.has(id)) return 'rejected';
    return 'pending';
  };

  const matrixUnavailableReason = isMy
    ? 'Median Split အတွက် Creator နှင့် Metric ဒေတာပြည့်စုံသော Product 8+ ခု လိုအပ်သည်'
    : '8+ products with creator & metric data required';

  return (
    <section
      id="catalog-section"
      ref={sectionRef}
      aria-labelledby="results-section-heading"
      className="mt-6 sm:mt-8 scroll-mt-20"
    >
      {/* Stage Header: Title + Animated Count + View Mode Switcher ([Cards] | [Radar Matrix]) */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2.5 pb-3 border-b border-[var(--sp-border)]">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <h2
            id="results-section-heading"
            className={`font-display text-lg sm:text-xl font-bold text-zinc-950 dark:text-zinc-50 ${
              isMy ? 'tracking-normal leading-[1.35]' : 'tracking-tight'
            }`}
          >
            {t.resultsSectionHeading}
          </h2>
          <span className="font-mono text-xs font-bold text-emerald-700 dark:text-[#10F5A0] tabular-nums">
            (<AnimatedNumber value={visibleProducts.length} />)
          </span>
          <StatusLegendPopover language={language} />
          {researchedAt && !isHunting && (
            <span className="hidden sm:inline font-mono text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
              · {formatResearchDate(researchedAt, language)}
            </span>
          )}
        </div>

        {/* Obsidian/Porcelain Stage View Switcher */}
        {!isHunting && visibleProducts.length > 0 && (
          <div
            role="tablist"
            aria-label={isMy ? 'ပြသမှုပုံစံ ရွေးချယ်ရန်' : 'Results view mode'}
            className="inline-flex items-center gap-1 p-1 rounded-xl bg-zinc-200/65 dark:bg-white/[0.05] border border-zinc-200/80 dark:border-white/[0.08] shrink-0"
          >
            <button
              type="button"
              role="tab"
              aria-selected={effectiveViewMode === 'cards'}
              onClick={() => handleChangeViewMode('cards')}
              className={`relative inline-flex items-center gap-1.5 min-h-[34px] px-3 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:focus-visible:ring-[#10F5A0] ${
                effectiveViewMode === 'cards'
                  ? 'text-zinc-950 dark:text-zinc-50 font-semibold'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-100'
              }`}
            >
              {effectiveViewMode === 'cards' && (
                <motion.span
                  layoutId="stage-view-mode-pill"
                  transition={MOTION_TRANSITIONS.snappy}
                  aria-hidden="true"
                  className="absolute inset-0 rounded-lg bg-white dark:bg-[#182030] shadow-xs border border-zinc-200/80 dark:border-white/[0.1]"
                />
              )}
              <LayoutGrid className="relative z-10 w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span className="relative z-10">{isMy ? 'Cards' : 'Cards'}</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={effectiveViewMode === 'matrix'}
              disabled={!matrixPreview.isReliable}
              title={!matrixPreview.isReliable ? matrixUnavailableReason : undefined}
              onClick={() => {
                if (matrixPreview.isReliable) {
                  handleChangeViewMode('matrix');
                }
              }}
              className={`relative inline-flex items-center gap-1.5 min-h-[34px] px-3 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:focus-visible:ring-[#10F5A0] ${
                !matrixPreview.isReliable
                  ? 'text-zinc-400 dark:text-zinc-500 cursor-not-allowed opacity-75'
                  : effectiveViewMode === 'matrix'
                    ? 'text-zinc-950 dark:text-zinc-50 font-semibold cursor-pointer'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-100 cursor-pointer'
              }`}
            >
              {effectiveViewMode === 'matrix' && (
                <motion.span
                  layoutId="stage-view-mode-pill"
                  transition={MOTION_TRANSITIONS.snappy}
                  aria-hidden="true"
                  className="absolute inset-0 rounded-lg bg-white dark:bg-[#182030] shadow-xs border border-zinc-200/80 dark:border-white/[0.1]"
                />
              )}
              <Radar
                className={`relative z-10 w-3.5 h-3.5 shrink-0 ${
                  matrixPreview.isReliable
                    ? 'text-emerald-600 dark:text-[#10F5A0]'
                    : 'text-zinc-400 dark:text-zinc-500'
                }`}
                aria-hidden="true"
              />
              <span className="relative z-10">{isMy ? 'Radar Matrix' : 'Radar Matrix'}</span>
              {matrixPreview.isReliable && matrixPreview.goldenZoneCount > 0 && (
                <span className="relative z-10 inline-flex items-center px-1.5 py-0.5 rounded-md font-mono text-[10px] font-bold tabular-nums bg-emerald-500/15 dark:bg-[#10F5A0]/18 text-emerald-700 dark:text-[#10F5A0]">
                  Golden: {matrixPreview.goldenZoneCount}
                </span>
              )}
              {!matrixPreview.isReliable && (
                <span className="relative z-10 font-mono text-[10px] px-1 py-0.5 rounded bg-zinc-200/80 dark:bg-white/[0.06] text-zinc-500 dark:text-zinc-400">
                  8+
                </span>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Screen-reader live region announcing research progress & completion */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {isHunting
          ? t.huntingLoadingTitle
          : liveResults.length > 0
            ? `${t.resultsSectionHeading}: ${visibleProducts.length}`
            : ''}
      </div>

      {/* De-Stacked Utility Pills Row (Strategy Weights · Verified Sources & Credits · Best Picks) */}
      {!isHunting && liveResults.length > 0 && (
        <div className="mt-3 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            {/* 1. Strategy & Score Weights Pill */}
            <button
              type="button"
              onClick={() => setStrategyDrawerOpen((prev) => !prev)}
              aria-expanded={strategyDrawerOpen}
              className={`inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:focus-visible:ring-[#10F5A0] ${
                strategyDrawerOpen
                  ? 'bg-emerald-500/10 dark:bg-[#10F5A0]/12 border-emerald-500/35 dark:border-[#10F5A0]/35 text-emerald-800 dark:text-[#10F5A0] font-semibold'
                  : 'bg-[var(--sp-surface)] border-[var(--sp-border)] text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-white/20'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{isMy ? 'Strategy & Weights' : 'Strategy & Weights'}</span>
              <span className="font-mono text-[11px] tabular-nums opacity-80">
                {salesWeightPct}/{100 - salesWeightPct}
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 shrink-0 transition-transform ${
                  strategyDrawerOpen ? 'rotate-180' : ''
                }`}
                aria-hidden="true"
              />
            </button>

            {/* 2. Verified Sources & Credits Pill */}
            {groundingSources.length > 0 && (
              <button
                type="button"
                onClick={() => setGroundingOpen((prev) => !prev)}
                aria-expanded={groundingOpen}
                className={`inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:focus-visible:ring-[#10F5A0] ${
                  groundingOpen
                    ? 'bg-cyan-500/10 dark:bg-[#25F4EE]/12 border-cyan-500/35 dark:border-[#25F4EE]/35 text-cyan-800 dark:text-[#25F4EE] font-semibold'
                    : 'bg-[var(--sp-surface)] border-[var(--sp-border)] text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-white/20'
                }`}
              >
                <Globe
                  className="w-3.5 h-3.5 text-emerald-600 dark:text-[#10F5A0] shrink-0"
                  aria-hidden="true"
                />
                <span>
                  {sessionMeta
                    ? `${sessionMeta.verifiedProductCount}/${sessionMeta.requestedQuantity} ${isMy ? 'Verified' : 'Verified'}`
                    : `${groundingSources.length} ${t.groundingSourcesCount}`}
                </span>
                {lastCostSummary && lastCostSummary.actualCredits !== null && (
                  <span className="font-mono text-[11px] font-semibold tabular-nums text-emerald-700 dark:text-[#10F5A0]">
                    · {formatCredits(lastCostSummary.actualCredits)} {t.creditsUnit}
                  </span>
                )}
                <ChevronDown
                  className={`w-3.5 h-3.5 shrink-0 transition-transform ${
                    groundingOpen ? 'rotate-180' : ''
                  }`}
                  aria-hidden="true"
                />
              </button>
            )}

            {/* 3. Best Picks Pill */}
            {bestSelections.length > 0 && (
              <button
                type="button"
                onClick={() => setBestPicksOpen((prev) => !prev)}
                aria-expanded={bestPicksOpen}
                className={`inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:focus-visible:ring-[#10F5A0] ${
                  bestPicksOpen
                    ? 'bg-emerald-500/10 dark:bg-[#10F5A0]/12 border-emerald-500/35 dark:border-[#10F5A0]/35 text-emerald-800 dark:text-[#10F5A0] font-semibold'
                    : 'bg-[var(--sp-surface)] border-[var(--sp-border)] text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-white/20'
                }`}
              >
                <Award className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{isMy ? 'ထိပ်တန်းရွေးချယ်မှု' : 'Best Picks'}</span>
                <span className="font-mono text-[11px] tabular-nums opacity-85">
                  ({bestSelections.length})
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 shrink-0 transition-transform ${
                    bestPicksOpen ? 'rotate-180' : ''
                  }`}
                  aria-hidden="true"
                />
              </button>
            )}
          </div>

          {/* Expandable Drawer 1: Strategy Presets + Weight Slider + 7-Factor Rubric */}
          <AnimatePresence initial={false}>
            {strategyDrawerOpen && (
              <motion.div
                key="utility-strategy-drawer"
                initial={prefersReduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
                animate={
                  prefersReduced
                    ? { opacity: 1 }
                    : { height: 'auto', opacity: 1, transitionEnd: { overflow: 'visible' } }
                }
                exit={
                  prefersReduced
                    ? { opacity: 0 }
                    : { height: 0, opacity: 0, overflow: 'hidden' }
                }
                transition={MOTION_TRANSITIONS.accordion}
                className="overflow-hidden"
              >
                <ScoringRubricPanel
                  isOpen={rubricOpen}
                  onToggle={handleToggleRubric}
                  salesWeightPct={salesWeightPct}
                  strategyPreset={strategyPreset}
                  onSelectStrategyPreset={onSelectStrategyPreset}
                  onCustomWeightChange={onCustomWeightChange}
                  showStrategyControls
                  language={language}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Expandable Drawer 2: Kalodata Verified Sources & Cost Provenance */}
          <AnimatePresence initial={false}>
            {groundingOpen && groundingSources.length > 0 && (
              <motion.div
                key="grounding-provenance-body"
                initial={prefersReduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
                animate={
                  prefersReduced
                    ? { opacity: 1 }
                    : { height: 'auto', opacity: 1, transitionEnd: { overflow: 'visible' } }
                }
                exit={
                  prefersReduced
                    ? { opacity: 0 }
                    : { height: 0, opacity: 0, overflow: 'hidden' }
                }
                transition={MOTION_TRANSITIONS.accordion}
                className="overflow-hidden rounded-2xl border border-[var(--sp-border)] bg-[var(--sp-surface)]"
              >
                <div className="px-4 sm:px-5 py-4 space-y-3">
                  <div className="text-xs text-zinc-600 dark:text-zinc-400 space-y-1">
                    <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                      {t.kalodataSourceBarLabel}
                    </div>
                    <p>{t.kalodataSourceNote}</p>
                    {sessionMeta &&
                      sessionMeta.verifiedProductCount < sessionMeta.requestedQuantity && (
                        <p className="text-zinc-500 dark:text-zinc-400">
                          {t.qualityGateExcludedNote}
                        </p>
                      )}
                  </div>

                  {(researchSourceMode === 'kalodata-openapi' || researchSourceMode === null) &&
                    lastCostSummary && (
                      <div className="px-3.5 py-2.5 rounded-xl sp-surface-muted flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs tabular-nums text-zinc-700 dark:text-zinc-300">
                        <span className="font-sans font-semibold text-zinc-900 dark:text-zinc-100">
                          {lastCostSummary.researchMode === 'deep'
                            ? t.modeDeepTitle
                            : lastCostSummary.researchMode === 'balanced'
                              ? t.modeBalancedTitle
                              : t.modeFastTitle}
                        </span>
                        <span>
                          {[
                            lastCostSummary.rankApiCalls > 0
                              ? `${t.breakdownRankLabel}: ${lastCostSummary.rankApiCalls}`
                              : null,
                            (lastCostSummary.videoRankApiCalls ?? 0) > 0
                              ? `${t.breakdownVideoRankLabel}: ${lastCostSummary.videoRankApiCalls}`
                              : null,
                            lastCostSummary.productDetailApiCalls > 0
                              ? `${t.breakdownDetailLabel}: ${lastCostSummary.productDetailApiCalls}`
                              : null,
                            lastCostSummary.shopDetailApiCalls > 0
                              ? `${t.breakdownShopLabel}: ${lastCostSummary.shopDetailApiCalls}`
                              : null,
                            lastCostSummary.commentInsightApiCalls > 0
                              ? `${t.breakdownReviewLabel}: ${lastCostSummary.commentInsightApiCalls}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                        {lastCostSummary.geminiAnalysisApplied && (
                          <span className="font-sans text-emerald-700 dark:text-[#10F5A0] font-medium">
                            {t.geminiAnalysisActiveLabel}
                          </span>
                        )}
                        <span>
                          {t.estimatedCostLabel}: {formatCredits(lastCostSummary.estimatedCredits)}{' '}
                          {t.creditsUnit} (≈ {formatUsd(lastCostSummary.estimatedUsd)})
                        </span>
                        <span className="text-emerald-700 dark:text-[#10F5A0] font-semibold">
                          {t.actualCostLabel}:{' '}
                          {lastCostSummary.actualCredits !== null
                            ? `${formatCredits(lastCostSummary.actualCredits)} ${t.creditsUnit} (≈ ${formatUsd(lastCostSummary.actualUsd ?? 0)} · ${lastCostSummary.actualApiCalls} ${t.actualCallsLabel})`
                            : t.actualCostUnavailable}
                        </span>
                      </div>
                    )}

                  {searchQueries.length > 0 && (
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                      <span className="font-medium text-zinc-700 dark:text-zinc-300 mr-1.5">
                        {t.groundingQueriesLabel}:
                      </span>
                      <span>{searchQueries.join(' · ')}</span>
                    </div>
                  )}

                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
                    {groundingSources.map((src, idx) => {
                      const resolvedHref = isSafeHttpUrl(src.url)
                        ? normalizeTikTokSourceUrl(src.url)
                        : null;
                      return (
                        <li
                          key={`${idx}-${src.url}`}
                          className="flex items-center justify-between gap-2 py-1 border-b border-[var(--sp-border)] text-xs"
                        >
                          <span className="text-zinc-700 dark:text-zinc-300 truncate">
                            {src.title}{' '}
                            <span className="text-zinc-500 dark:text-zinc-400">({src.domain})</span>
                          </span>
                          {resolvedHref ? (
                            <a
                              href={resolvedHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 font-medium text-zinc-900 dark:text-zinc-100 hover:underline whitespace-nowrap shrink-0"
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
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Expandable Drawer 3: Best Products Strip */}
          <AnimatePresence initial={false}>
            {bestPicksOpen && bestSelections.length > 0 && (
              <motion.div
                key="utility-best-picks-drawer"
                initial={prefersReduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
                animate={
                  prefersReduced
                    ? { opacity: 1 }
                    : { height: 'auto', opacity: 1, transitionEnd: { overflow: 'visible' } }
                }
                exit={
                  prefersReduced
                    ? { opacity: 0 }
                    : { height: 0, opacity: 0, overflow: 'hidden' }
                }
                transition={MOTION_TRANSITIONS.accordion}
                className="overflow-hidden"
              >
                <BestProductsStrip
                  selections={bestSelections}
                  comparedIds={comparedLiveProductIds}
                  onOpenReport={onOpenReport}
                  onToggleCompare={onToggleCompare}
                  products={liveResults}
                  evaluations={liveEvaluations}
                  language={language}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Manual Research Paused Banner */}
      {!isHunting && quotaStatus.paused && (
        <div
          role="status"
          className="mt-4 p-5 bg-[var(--sp-surface)] border border-amber-400/70 dark:border-amber-500/45 rounded-2xl flex flex-col sm:flex-row sm:items-start justify-between gap-4"
        >
          <div className="flex items-start gap-3">
            <PauseCircle
              className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <div className="space-y-1.5 text-xs sm:text-sm">
              <h3 className="font-semibold text-zinc-950 dark:text-zinc-50">
                {t.manualPausedTitle}
              </h3>
              <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                {t.manualPausedDesc}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0 self-start">
            <button
              type="button"
              onClick={onResumeAndEditSettings}
              className="sp-btn-primary"
            >
              <PlayCircle className="w-4 h-4" aria-hidden="true" />
              <span>{t.btnResumeAndRetry}</span>
            </button>
          </div>
        </div>
      )}

      {/* Phase 5: 8-Field Sort + Highest/Lowest + Multi-Filter + Export CSV/JSON */}
      <ProductFilterBar
        filters={filters}
        onChangeFilters={onChangeFilters}
        decisionFilter={decisionFilter}
        onChangeDecisionFilter={onChangeDecisionFilter}
        queueCounts={queueCounts}
        sortField={sortField}
        onChangeSortField={onChangeSortField}
        sortDirection={sortDirection}
        onToggleSortDirection={onToggleSortDirection}
        exportDisabled={isHunting || visibleProducts.length === 0}
        onExportCsv={handleExportVisibleCsv}
        onExportJson={handleExportVisibleJson}
        availableCategories={availableResultCategories}
        categoryCounts={queueCategoryCounts}
        language={language}
      />

      {/* Error State (Propagated honestly from server — never replaced with fake results) */}
      {displayErrorText && !isHunting && (
        <StateMessage
          variant="error"
          compact
          className="mt-6"
          icon={<AlertCircle className="w-4 h-4" aria-hidden="true" />}
          title={t.huntingErrorTitle}
          reason={displayErrorText}
          actionLabel={t.huntingRetryBtn}
          actionIcon={<RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />}
          onAction={onRetryHunt}
        />
      )}

      {/* Phase 9 Method 1: Honest Myanmar Video-First Discovery Scope Strip */}
      {!isHunting &&
        sessionMeta?.myanmarFilterApplied &&
        sessionMeta.myanmarVideoDiscovery &&
        (() => {
          const vStats = sessionMeta.myanmarVideoDiscovery!;
          const hasShortfall =
            vStats.affiliateProductsVerified < vStats.requestedQuantity;
          return (
            <div className="mt-5 p-4 sp-card space-y-2.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {t.myanmarVideoDiscoveryBarTitle}
                </span>
                <span
                  className={`font-mono text-xs font-semibold ${
                    vStats.stopReason === 'target-reached'
                      ? 'text-emerald-700 dark:text-[#10F5A0]'
                      : 'text-amber-700 dark:text-amber-400'
                  }`}
                >
                  {t.myanmarVideoStopReasonLabels[vStats.stopReason]}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 font-mono tabular-nums">
                <div className="px-3 py-2 rounded-xl sp-surface-muted">
                  <div className="font-sans text-xs text-zinc-600 dark:text-zinc-400 truncate">
                    {t.myanmarVideoStatPagesScanned}
                  </div>
                  <div className="mt-0.5 text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                    {vStats.videoPagesScanned}/{vStats.maxVideoScanPages}
                  </div>
                </div>
                <div className="px-3 py-2 rounded-xl sp-surface-muted">
                  <div className="font-sans text-xs text-zinc-600 dark:text-zinc-400 truncate">
                    {t.myanmarVideoStatVideosScanned}
                  </div>
                  <div className="mt-0.5 text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                    {vStats.totalVideosScanned.toLocaleString('en-US')}
                  </div>
                </div>
                <div className="px-3 py-2 rounded-xl sp-surface-muted">
                  <div className="font-sans text-xs text-zinc-600 dark:text-zinc-400 truncate">
                    {t.myanmarVideoStatMatchedVideos}
                  </div>
                  <div className="mt-0.5 text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                    {vStats.matchedMyanmarVideos}
                  </div>
                </div>
                <div className="px-3 py-2 rounded-xl bg-emerald-500/10 dark:bg-[#10F5A0]/10 border border-emerald-500/20 dark:border-[#10F5A0]/20">
                  <div className="font-sans text-xs text-emerald-800 dark:text-[#10F5A0] truncate">
                    {t.myanmarVideoStatCollectedProducts}
                  </div>
                  <div className="mt-0.5 text-sm font-semibold text-emerald-800 dark:text-[#10F5A0]">
                    {vStats.affiliateProductsVerified}/{vStats.requestedQuantity}
                  </div>
                </div>
                <div className="px-3 py-2 rounded-xl sp-surface-muted">
                  <div className="font-sans text-xs text-zinc-600 dark:text-zinc-400 truncate">
                    {t.myanmarVideoStatSkippedNonAff}
                  </div>
                  <div className="mt-0.5 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                    {vStats.nonAffiliateOrUnavailableSkipped}
                  </div>
                </div>
              </div>

              {hasShortfall && (
                <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                  {t.myanmarVideoShortfallNotice}
                </p>
              )}
            </div>
          );
        })()}

      {/* Phase 9 Legacy: Honest Myanmar Review Discovery Scope Strip */}
      {!isHunting &&
        sessionMeta?.myanmarFilterApplied &&
        sessionMeta.myanmarReviewDiscovery &&
        (() => {
          const stats = sessionMeta.myanmarReviewDiscovery!;
          const isPartial = stats.candidatesCheckedForReviews < stats.totalCandidatesFound;
          return (
            <div className="mt-5 p-4 sp-card space-y-2.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {t.myanmarDiscoveryBarTitle}
                </span>
                <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
                  {t.myanmarStatReviewsInspected}:{' '}
                  <strong className="text-zinc-900 dark:text-zinc-100">
                    {stats.totalReviewsInspected}
                  </strong>
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 font-mono tabular-nums">
                <div className="px-2.5 py-2 rounded-xl sp-surface-muted border border-[var(--sp-border)]">
                  <div className="font-sans text-xs text-zinc-500 dark:text-zinc-400 truncate">
                    {t.myanmarStatCandidatesFound}
                  </div>
                  <div className="mt-0.5 text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                    {stats.totalCandidatesFound}
                  </div>
                </div>
                <div className="px-2.5 py-2 rounded-xl sp-surface-muted border border-[var(--sp-border)]">
                  <div className="font-sans text-xs text-zinc-500 dark:text-zinc-400 truncate">
                    {t.myanmarStatCheckedReviews}
                  </div>
                  <div className="mt-0.5 text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                    {stats.candidatesCheckedForReviews}
                  </div>
                </div>
                <div className="px-2.5 py-2 rounded-xl sp-surface-muted border border-[var(--sp-border)]">
                  <div className="font-sans text-xs text-zinc-500 dark:text-zinc-400 truncate">
                    {t.myanmarStatReviewsAvailable}
                  </div>
                  <div className="mt-0.5 text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                    {stats.productsWithReviewsAvailable}
                  </div>
                </div>
                <div className="px-2.5 py-2 rounded-xl bg-amber-500/10 border border-amber-500/25">
                  <div className="font-sans text-xs text-amber-800 dark:text-amber-300 truncate">
                    {t.myanmarStatReviewUnavailable}
                  </div>
                  <div className="mt-0.5 text-sm font-semibold text-amber-900 dark:text-amber-200">
                    {stats.productsReviewUnavailable}
                  </div>
                </div>
                <div className="px-2.5 py-2 rounded-xl sp-surface-muted border border-[var(--sp-border)]">
                  <div className="font-sans text-xs text-zinc-500 dark:text-zinc-400 truncate">
                    {t.myanmarStatNoMyanmarReview}
                  </div>
                  <div className="mt-0.5 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                    {stats.productsNoMyanmarReview}
                  </div>
                </div>
                <div className="px-2.5 py-2 rounded-xl bg-emerald-500/10 dark:bg-[#10F5A0]/10 border border-emerald-500/25 dark:border-[#10F5A0]/25">
                  <div className="font-sans text-xs text-emerald-800 dark:text-[#10F5A0] truncate">
                    {t.myanmarStatMatchedProducts}
                  </div>
                  <div className="mt-0.5 text-sm font-semibold text-emerald-800 dark:text-[#10F5A0]">
                    {stats.matchedMyanmarReviewProducts}
                  </div>
                </div>
              </div>

              {isPartial && (
                <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                  {t.myanmarDiscoveryPartialNotice}
                </p>
              )}
            </div>
          );
        })()}

      {/* Stage Body: Loading vs Empty Ready State vs Filtered Empty vs Cards / Radar Matrix */}
      <div className="mt-5 sm:mt-6">
        {isHunting ? (
          <div className="space-y-5">
            <div
              role="status"
              aria-live="polite"
              className="sp-card px-4 sm:px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="min-w-0 space-y-1">
                <h3 className="font-display text-sm sm:text-base font-semibold text-zinc-950 dark:text-zinc-50">
                  {t.huntingLoadingTitle}
                </h3>
                <p className="text-xs sm:text-[13px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  {t.huntingLoadingDesc}
                </p>
                {activeHuntConfig && (
                  <div className="pt-1 inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-700 dark:text-zinc-300">
                    <span className="font-medium text-zinc-950 dark:text-zinc-50">
                      {activeHuntConfig.market}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{activeCategoryLabel}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums font-medium text-zinc-950 dark:text-zinc-50">
                      {activeHuntConfig.quantity} {t.quantityProductsUnit}
                    </span>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={onCancelHunting}
                className="sp-btn-secondary self-start sm:self-center shrink-0"
              >
                {t.huntingCancelBtn}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from(
                { length: Math.min(6, Math.max(3, activeHuntConfig?.quantity ?? 6)) },
                (_, idx) => (
                  <ResearchResultCardSkeleton key={`result-skeleton-${idx}`} />
                )
              )}
            </div>
          </div>
        ) : liveResults.length === 0 ? (
          <StateMessage
            variant="empty"
            icon={<SearchCheck className="w-5 h-5" aria-hidden="true" />}
            title={
              sessionMeta?.myanmarFilterApplied
                ? t.myanmarEmptyTitle
                : t.emptyLiveTitle
            }
            reason={
              sessionMeta?.myanmarFilterApplied
                ? t.myanmarEmptyDesc
                : t.emptyLiveDesc
            }
            actionLabel={
              sessionMeta?.myanmarFilterApplied
                ? t.myanmarTurnOffFilterBtn
                : quotaStatus.paused
                  ? t.btnResumeAndRetry
                  : t.emptyStartBtn
            }
            actionIcon={
              sessionMeta?.myanmarFilterApplied ? (
                <RotateCcw className="w-4 h-4" aria-hidden="true" />
              ) : (
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              )
            }
            onAction={onTurnOffMyanmarAndEdit}
          />
        ) : visibleProducts.length === 0 ? (
          <StateMessage
            variant="empty"
            icon={<SearchCheck className="w-5 h-5" aria-hidden="true" />}
            title={t.emptyFilteredTitle}
            reason={t.emptyFilteredDesc}
            actionLabel={t.resetViewBtn}
            actionIcon={<RotateCcw className="w-4 h-4" aria-hidden="true" />}
            onAction={handleResetFilters}
          />
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            {effectiveViewMode === 'matrix' ? (
              <motion.div
                key="stage-matrix"
                initial={prefersReduced ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={prefersReduced ? undefined : { opacity: 0, y: -4 }}
                transition={MOTION_TRANSITIONS.crossFade}
              >
                <MarketOpportunityMatrix
                  products={visibleProducts}
                  evaluations={liveEvaluations}
                  decisions={liveDecisions}
                  onOpenReport={onOpenReport}
                  language={language}
                />
              </motion.div>
            ) : (
              <motion.div
                key="stage-cards"
                initial={prefersReduced ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={prefersReduced ? undefined : { opacity: 0, y: -4 }}
                transition={MOTION_TRANSITIONS.crossFade}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
              >
                <AnimatePresence mode={enableGridReflow ? 'popLayout' : 'sync'} initial={false}>
                  {visibleProducts.map((product, idx) => (
                    <ResearchResultCard
                      key={product.id}
                      product={product}
                      evaluation={liveEvaluations.get(product.id)}
                      decisionSummary={liveDecisions.get(product.id)}
                      salesWeightPct={deferredSalesWeightPct}
                      peerProducts={liveResults}
                      decision={getDecision(product.id)}
                      onSave={onToggleSave}
                      onReject={onToggleReject}
                      onOpenReport={onOpenReport}
                      onOpenDeepDive={onOpenDeepDive}
                      isCompared={comparedLiveProductIds.has(product.id)}
                      onToggleCompare={onToggleCompare}
                      rankInfo={batchScoreRanks.get(product.id)}
                      entranceIndex={idx}
                      enableLayoutReflow={enableGridReflow}
                      language={language}
                    />
                  ))}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    </section>
  );
});
