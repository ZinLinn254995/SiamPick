import { memo, type RefObject, useCallback, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Globe,
  PauseCircle,
  PlayCircle,
  RotateCcw,
  SearchCheck,
} from 'lucide-react';
import type {
  DecisionFilter,
  GroundingSourceLink,
  Language,
  OpportunityEvaluation,
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
import { BestProductsStrip } from './BestProductsStrip';
import { ProductFilterBar } from './ProductFilterBar';
import { ResearchResultCard } from './ResearchResultCard';
import { ScoringRubricPanel } from './ScoringRubricPanel';
import {
  ResearchResultCardSkeleton,
  StateMessage,
  StatusLegendPopover,
} from './visual';

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
  const [rubricOpen, setRubricOpen] = useState(false);
  const [groundingOpen, setGroundingOpen] = useState(false);

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

  return (
    <section
      id="catalog-section"
      ref={sectionRef}
      aria-labelledby="results-section-heading"
      className="mt-10 sm:mt-12 scroll-mt-20"
    >
      {/* Section Title + Status Legend + Session Timestamp */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2
            id="results-section-heading"
            className={`font-display text-xl font-bold text-zinc-950 dark:text-zinc-50 ${
              language === 'my' ? 'tracking-normal leading-[1.3]' : 'tracking-tight'
            }`}
          >
            {t.resultsSectionHeading}
          </h2>
          <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
            ({visibleProducts.length})
          </span>
          <StatusLegendPopover language={language} />
        </div>

        {researchedAt && !isHunting && (
          <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
            {t.savedResearchDateLabel}: {formatResearchDate(researchedAt, language)}
          </span>
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

      {/* Unified Strategy Presets + Weight Slider + Collapsible 7-Factor Rubric Bar */}
      <ScoringRubricPanel
        isOpen={rubricOpen}
        onToggle={handleToggleRubric}
        salesWeightPct={salesWeightPct}
        strategyPreset={strategyPreset}
        onSelectStrategyPreset={onSelectStrategyPreset}
        onCustomWeightChange={onCustomWeightChange}
        showStrategyControls={!isHunting && liveResults.length > 0}
        language={language}
      />

      {/* Manual Research Paused Banner */}
      {!isHunting && quotaStatus.paused && (
        <div
          role="status"
          className="mt-4 p-5 bg-white dark:bg-zinc-900 border border-amber-300/90 dark:border-amber-700/70 rounded-xl flex flex-col sm:flex-row sm:items-start justify-between gap-4"
        >
          <div className="flex items-start gap-3">
            <PauseCircle
              className="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5"
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
              className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 py-2 text-xs sm:text-sm font-medium text-white dark:text-zinc-950 bg-zinc-950 dark:bg-zinc-100 rounded-lg hover:bg-zinc-800 dark:hover:bg-white transition-colors cursor-pointer whitespace-nowrap"
            >
              <PlayCircle className="w-4 h-4" aria-hidden="true" />
              <span>{t.btnResumeAndRetry}</span>
            </button>
          </div>
        </div>
      )}

      {/* Kalodata OpenAPI Verified Sources & Cost Accordion */}
      {!isHunting && liveResults.length > 0 && groundingSources.length > 0 && (
        <div className="mt-4 sp-card overflow-hidden">
          <button
            type="button"
            onClick={() => setGroundingOpen((prev) => !prev)}
            aria-expanded={groundingOpen}
            className="w-full min-h-[48px] px-4 sm:px-5 py-2.5 flex items-center justify-between gap-2.5 text-left hover:bg-zinc-50/80 dark:hover:bg-zinc-800/60 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-200"
          >
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <Globe
                className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="text-xs font-medium text-zinc-900 dark:text-zinc-100 leading-snug">
                  {t.kalodataSourceBarLabel}
                </div>
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-zinc-500 dark:text-zinc-400 leading-snug">
                  {sessionMeta ? (
                    <span className="font-mono tabular-nums">
                      {sessionMeta.verifiedProductCount}/{sessionMeta.requestedQuantity}{' '}
                      {t.qualityGateVerifiedLabel}
                    </span>
                  ) : (
                    <span>
                      {groundingSources.length} {t.groundingSourcesCount}
                    </span>
                  )}
                  {lastCostSummary && lastCostSummary.actualCredits !== null && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums text-emerald-700 dark:text-emerald-400 font-medium whitespace-nowrap">
                        {formatCredits(lastCostSummary.actualCredits)} {t.creditsUnit}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 shrink-0 whitespace-nowrap">
              <span className="hidden sm:inline">
                {groundingOpen ? t.groundingToggleHide : t.groundingToggleShow}
              </span>
              {groundingOpen ? (
                <ChevronUp className="w-4 h-4 shrink-0" aria-hidden="true" />
              ) : (
                <ChevronDown className="w-4 h-4 shrink-0" aria-hidden="true" />
              )}
            </span>
          </button>

          {groundingOpen && (
            <div className="border-t border-zinc-100 dark:border-zinc-800/70 px-4 sm:px-5 pb-4 pt-3 space-y-3">
              <div className="text-xs text-zinc-600 dark:text-zinc-400 space-y-1">
                <p>{t.kalodataSourceNote}</p>
                {sessionMeta &&
                  sessionMeta.verifiedProductCount < sessionMeta.requestedQuantity && (
                    <p className="text-zinc-500 dark:text-zinc-400">{t.qualityGateExcludedNote}</p>
                  )}
              </div>

              {(researchSourceMode === 'kalodata-openapi' || researchSourceMode === null) &&
                lastCostSummary && (
                  <div className="px-3.5 py-2.5 rounded-lg bg-zinc-50/90 dark:bg-zinc-800/45 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs tabular-nums text-zinc-700 dark:text-zinc-300">
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
                      <span className="font-sans text-emerald-700 dark:text-emerald-400 font-medium">
                        {t.geminiAnalysisActiveLabel}
                      </span>
                    )}
                    <span>
                      {t.estimatedCostLabel}: {formatCredits(lastCostSummary.estimatedCredits)}{' '}
                      {t.creditsUnit} (≈ {formatUsd(lastCostSummary.estimatedUsd)})
                    </span>
                    <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
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
                      className="flex items-center justify-between gap-2 py-1 border-b border-zinc-100 dark:border-zinc-800/70 text-xs"
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
          )}
        </div>
      )}

      {/* Phase 5: Best Product Selection Highlights (6 Categories with Sufficiency Guards) */}
      {!isHunting && bestSelections.length > 0 && (
        <BestProductsStrip
          selections={bestSelections}
          comparedIds={comparedLiveProductIds}
          onOpenReport={onOpenReport}
          onToggleCompare={onToggleCompare}
          products={liveResults}
          evaluations={liveEvaluations}
          language={language}
        />
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
        sessionMeta.myanmarVideoDiscovery && (() => {
          const vStats = sessionMeta.myanmarVideoDiscovery!;
          const hasShortfall =
            vStats.affiliateProductsVerified < vStats.requestedQuantity;
          return (
            <div className="mt-5 p-4 bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-xl space-y-2.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {t.myanmarVideoDiscoveryBarTitle}
                </span>
                <span
                  className={`font-mono text-xs font-semibold ${
                    vStats.stopReason === 'target-reached'
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-amber-700 dark:text-amber-400'
                  }`}
                >
                  {t.myanmarVideoStopReasonLabels[vStats.stopReason]}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 font-mono tabular-nums">
                <div className="px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                  <div className="font-sans text-xs text-zinc-600 dark:text-zinc-400 truncate">
                    {t.myanmarVideoStatPagesScanned}
                  </div>
                  <div className="mt-0.5 text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                    {vStats.videoPagesScanned}/{vStats.maxVideoScanPages}
                  </div>
                </div>
                <div className="px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                  <div className="font-sans text-xs text-zinc-600 dark:text-zinc-400 truncate">
                    {t.myanmarVideoStatVideosScanned}
                  </div>
                  <div className="mt-0.5 text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                    {vStats.totalVideosScanned.toLocaleString('en-US')}
                  </div>
                </div>
                <div className="px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                  <div className="font-sans text-xs text-zinc-600 dark:text-zinc-400 truncate">
                    {t.myanmarVideoStatMatchedVideos}
                  </div>
                  <div className="mt-0.5 text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                    {vStats.matchedMyanmarVideos}
                  </div>
                </div>
                <div className="px-3 py-2 rounded-lg bg-emerald-50/80 dark:bg-emerald-950/35">
                  <div className="font-sans text-xs text-emerald-800 dark:text-emerald-300 truncate">
                    {t.myanmarVideoStatCollectedProducts}
                  </div>
                  <div className="mt-0.5 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                    {vStats.affiliateProductsVerified}/{vStats.requestedQuantity}
                  </div>
                </div>
                <div className="px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
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

      {/* Phase 9 Legacy: Honest Myanmar Review Discovery Scope Strip (when review-first ran) */}
      {!isHunting && sessionMeta?.myanmarFilterApplied && sessionMeta.myanmarReviewDiscovery && (() => {
        const stats = sessionMeta.myanmarReviewDiscovery!;
        const isPartial = stats.candidatesCheckedForReviews < stats.totalCandidatesFound;
        return (
          <div className="mt-5 p-4 bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-xl space-y-2.5 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                {t.myanmarDiscoveryBarTitle}
              </span>
              <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
                {t.myanmarStatReviewsInspected}:{' '}
                <strong className="text-zinc-900 dark:text-zinc-100">{stats.totalReviewsInspected}</strong>
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 font-mono tabular-nums">
              <div className="px-2.5 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/70 dark:border-zinc-800/70">
                <div className="font-sans text-xs text-zinc-500 dark:text-zinc-400 truncate">
                  {t.myanmarStatCandidatesFound}
                </div>
                <div className="mt-0.5 text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                  {stats.totalCandidatesFound}
                </div>
              </div>
              <div className="px-2.5 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/70 dark:border-zinc-800/70">
                <div className="font-sans text-xs text-zinc-500 dark:text-zinc-400 truncate">
                  {t.myanmarStatCheckedReviews}
                </div>
                <div className="mt-0.5 text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                  {stats.candidatesCheckedForReviews}
                </div>
              </div>
              <div className="px-2.5 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/70 dark:border-zinc-800/70">
                <div className="font-sans text-xs text-zinc-500 dark:text-zinc-400 truncate">
                  {t.myanmarStatReviewsAvailable}
                </div>
                <div className="mt-0.5 text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                  {stats.productsWithReviewsAvailable}
                </div>
              </div>
              <div className="px-2.5 py-2 rounded-lg bg-amber-50/60 dark:bg-amber-950/25 border border-amber-200/70 dark:border-amber-800/50">
                <div className="font-sans text-xs text-amber-800 dark:text-amber-300 truncate">
                  {t.myanmarStatReviewUnavailable}
                </div>
                <div className="mt-0.5 text-sm font-semibold text-amber-900 dark:text-amber-200">
                  {stats.productsReviewUnavailable}
                </div>
              </div>
              <div className="px-2.5 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/70 dark:border-zinc-800/70">
                <div className="font-sans text-xs text-zinc-500 dark:text-zinc-400 truncate">
                  {t.myanmarStatNoMyanmarReview}
                </div>
                <div className="mt-0.5 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                  {stats.productsNoMyanmarReview}
                </div>
              </div>
              <div className="px-2.5 py-2 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/35 border border-emerald-200/80 dark:border-emerald-800/60">
                <div className="font-sans text-xs text-emerald-800 dark:text-emerald-300 truncate">
                  {t.myanmarStatMatchedProducts}
                </div>
                <div className="mt-0.5 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
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

      {/* Results Body: Loading vs Empty Ready State vs Filtered Empty vs Live Card Grid */}
      <div className="mt-6">
        {isHunting ? (
          <div className="space-y-5">
            <div
              role="status"
              aria-live="polite"
              className="bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-xl px-4 sm:px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
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
                className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:text-zinc-950 dark:hover:text-zinc-50 hover:border-zinc-400 dark:hover:border-zinc-500 transition-colors cursor-pointer whitespace-nowrap shrink-0 self-start sm:self-center"
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {visibleProducts.map((product) => (
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
                language={language}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
});
