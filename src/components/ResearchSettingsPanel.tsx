import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Layers,
  Loader2,
  Lock,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import {
  BothCategoryMode,
  Language,
  ProductCategory,
  ResearchCostSummary,
  ResearchMode,
  ResearchQuantity,
  ResearchQuotaStatus,
  StrategyPreset,
  SyncedKalodataCategoryCache,
} from '../types/product';
import {
  buildKalodataExecutionPlan,
  clampDeepDiveCount,
  clampMyanmarVideoScanPages,
  DEEP_COMMENT_INSIGHT_CAP,
  formatCredits,
  formatUsd,
  KALODATA_MAX_PAGE_SIZE,
  KALODATA_VIDEO_RANK_CREDIT_PER_100,
  MAX_DEEP_DIVE_COUNT,
  MAX_MYANMAR_VIDEO_SCAN_PAGES,
  MAX_RESEARCH_QUANTITY,
  MAX_SPENDING_LIMIT_CREDITS,
  MIN_DEEP_DIVE_COUNT,
  MIN_MYANMAR_VIDEO_SCAN_PAGES,
  MIN_RESEARCH_QUANTITY,
  MIN_SPENDING_LIMIT_CREDITS,
} from '../utils/kalodataPricing';
import {
  buildResolvedCategoryIdMap,
  formatCategoryCatalogCountSummary,
  getCategoryCatalogCounts,
  getCategoryLabel,
  getEffectiveCategoryCatalog,
  mergeSyncedL1Categories,
  mergeSyncedL2Subcategories,
  saveSyncedKalodataCategories,
} from '../utils/categoryRegistry';
import { computeStrategyWeights, SCORING_FACTOR_ORDER } from '../utils/scoring';
import { TRANSLATIONS } from '../i18n/translations';
import { InfoPopover } from './InfoPopover';

interface ResearchSettingsPanelProps {
  selectedCategories: ProductCategory[];
  onToggleCategory: (category: ProductCategory) => void;
  onSelectAllVerifiedCategories: () => void;
  onClearAllCategories: () => void;
  syncedCategoryCache: SyncedKalodataCategoryCache;
  onSyncedCategoryCacheChange: (next: SyncedKalodataCategoryCache) => void;
  selectedSubcategoryIds: string[];
  onToggleSubcategory: (subcategoryId: string) => void;
  onClearSubcategories: () => void;
  onBalanceRefresh?: () => void;
  bothCategoryMode: BothCategoryMode;
  onBothCategoryModeChange: (mode: BothCategoryMode) => void;
  researchMode: ResearchMode;
  onResearchModeChange: (mode: ResearchMode) => void;
  deepDiveCount: number;
  onDeepDiveCountChange: (count: number) => void;
  includeReviewInsights: boolean;
  onIncludeReviewInsightsChange: (enabled: boolean) => void;
  strategyPreset: StrategyPreset;
  salesWeightPct: number;
  onSelectStrategyPreset: (preset: StrategyPreset) => void;
  onCustomWeightChange: (weight: number) => void;
  showFineTune: boolean;
  onToggleFineTune: () => void;
  quantity: ResearchQuantity;
  onQuantityChange: (quantity: ResearchQuantity) => void;
  spendingLimitCredits: number;
  onSpendingLimitChange: (limit: number) => void;
  myanmarLanguageOnly: boolean;
  onMyanmarLanguageOnlyChange: (enabled: boolean) => void;
  myanmarVideoScanPages: number;
  onMyanmarVideoScanPagesChange: (pages: number) => void;
  lastCostSummary: ResearchCostSummary | null;
  isHunting: boolean;
  quotaStatus: ResearchQuotaStatus;
  onPauseResearch: () => void;
  onResumeResearch: () => void;
  onConfirmStartHunting: () => void;
  language: Language;
}

const PRESET_QUANTITIES = [10, 20, 30] as const;
const DEEP_DIVE_PRESETS = [2, 3, 5, 10] as const;
const MYANMAR_VIDEO_PAGE_PRESETS = [3, 5, 10, 15, 20] as const;

export function ResearchSettingsPanel({
  selectedCategories,
  onToggleCategory,
  onSelectAllVerifiedCategories,
  onClearAllCategories,
  syncedCategoryCache,
  onSyncedCategoryCacheChange,
  selectedSubcategoryIds,
  onToggleSubcategory,
  onClearSubcategories,
  onBalanceRefresh,
  bothCategoryMode,
  onBothCategoryModeChange,
  researchMode,
  onResearchModeChange,
  deepDiveCount,
  onDeepDiveCountChange,
  includeReviewInsights,
  onIncludeReviewInsightsChange,
  strategyPreset,
  salesWeightPct,
  onSelectStrategyPreset,
  onCustomWeightChange,
  showFineTune,
  onToggleFineTune,
  quantity,
  onQuantityChange,
  spendingLimitCredits,
  onSpendingLimitChange,
  myanmarLanguageOnly,
  onMyanmarLanguageOnlyChange,
  myanmarVideoScanPages,
  onMyanmarVideoScanPagesChange,
  lastCostSummary,
  isHunting,
  quotaStatus,
  onPauseResearch,
  onResumeResearch,
  onConfirmStartHunting,
  language,
}: ResearchSettingsPanelProps) {
  const t = TRANSLATIONS[language];
  const isMy = language === 'my';
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [customQtyDraft, setCustomQtyDraft] = useState(String(quantity));
  const [limitDraft, setLimitDraft] = useState(formatCredits(spendingLimitCredits));
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [syncConfirmMode, setSyncConfirmMode] = useState<'l1' | 'l2' | null>(null);
  const [isSyncingCategories, setIsSyncingCategories] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    setCustomQtyDraft(String(quantity));
  }, [quantity]);

  useEffect(() => {
    setLimitDraft(formatCredits(spendingLimitCredits));
  }, [spendingLimitCredits]);

  const effectiveCatalog = useMemo(
    () => getEffectiveCategoryCatalog(syncedCategoryCache),
    [syncedCategoryCache]
  );

  const catalogCounts = useMemo(
    () =>
      getCategoryCatalogCounts(syncedCategoryCache, {
        isSyncing: isSyncingCategories,
        hasError: Boolean(syncError),
      }),
    [syncedCategoryCache, isSyncingCategories, syncError]
  );

  const catalogCountSummary = useMemo(
    () => formatCategoryCatalogCountSummary(catalogCounts, language),
    [catalogCounts, language]
  );

  const resolvedCategoryIdMap = useMemo(
    () => buildResolvedCategoryIdMap(syncedCategoryCache),
    [syncedCategoryCache]
  );

  const selectableCatalogEntries = useMemo(
    () => effectiveCatalog.filter((entry) => entry.selectable),
    [effectiveCatalog]
  );

  const extraCatalogEntries = useMemo(
    () => effectiveCatalog.filter((entry) => !entry.selectable),
    [effectiveCatalog]
  );

  const visibleCatalogEntries = showAllCategories
    ? effectiveCatalog
    : selectableCatalogEntries;

  const extraCategoriesToggleLabel = (() => {
    if (showAllCategories) return t.hideExtraCategoriesToggle;
    if (catalogCounts.unsupported > 0 && catalogCounts.requiresSync === 0) {
      return `${t.showUnsupportedCategoriesToggle} (+${catalogCounts.unsupported})`;
    }
    if (catalogCounts.requiresSync > 0 && catalogCounts.unsupported === 0) {
      return `${t.showPendingSyncCategoriesToggle} (+${catalogCounts.requiresSync})`;
    }
    return `${t.showAllCategoriesToggle} (+${extraCatalogEntries.length})`;
  })();

  const selectedParentL1Ids = useMemo(() => {
    const ids: string[] = [];
    for (const cat of selectedCategories) {
      const id = resolvedCategoryIdMap[cat];
      if (id && !ids.includes(id)) {
        ids.push(id);
      }
    }
    return ids;
  }, [selectedCategories, resolvedCategoryIdMap]);

  const visibleSubcategories = useMemo(() => {
    if (selectedCategories.length === 0) return [];
    const selectedCatSet = new Set(selectedCategories);
    const selectedL1Set = new Set(selectedParentL1Ids);
    return syncedCategoryCache.subcategories.filter((sub) => {
      if (sub.parentCategory && selectedCatSet.has(sub.parentCategory)) return true;
      if (sub.parentCategoryId && selectedL1Set.has(sub.parentCategoryId)) return true;
      return !sub.parentCategory && !sub.parentCategoryId;
    });
  }, [syncedCategoryCache.subcategories, selectedCategories, selectedParentL1Ids]);

  const allReadySelected =
    selectableCatalogEntries.length > 0 &&
    selectableCatalogEntries.every((entry) => selectedCategories.includes(entry.id));

  // Close confirmation whenever user modifies settings or hunting starts
  const effectiveVideoScanPages = clampMyanmarVideoScanPages(myanmarVideoScanPages);
  const selectionKey = `${selectedCategories.join(',')}|${selectedSubcategoryIds.join(',')}|${bothCategoryMode}|${researchMode}|${deepDiveCount}|${includeReviewInsights}|${quantity}|${spendingLimitCredits}|${strategyPreset}|${salesWeightPct}|${myanmarLanguageOnly}|${effectiveVideoScanPages}`;
  useEffect(() => {
    setConfirmOpen(false);
  }, [selectionKey, isHunting]);

  const effectiveDeepDiveCap = clampDeepDiveCount(deepDiveCount, quantity);
  const maxAllowedDeepDive = Math.min(MAX_DEEP_DIVE_COUNT, quantity);

  const planCommonOptions = {
    selectedSubcategoryIds,
    resolvedCategoryIdMap,
    myanmarLanguageOnly,
    myanmarDiscoveryMode: 'video-first' as const,
    myanmarVideoScanPages: effectiveVideoScanPages,
  };

  const fastPlan = buildKalodataExecutionPlan(selectedCategories, quantity, bothCategoryMode, {
    ...planCommonOptions,
    researchMode: 'fast',
  });
  const balancedPlan = buildKalodataExecutionPlan(selectedCategories, quantity, bothCategoryMode, {
    ...planCommonOptions,
    researchMode: 'balanced',
  });
  const deepPlan = buildKalodataExecutionPlan(selectedCategories, quantity, bothCategoryMode, {
    ...planCommonOptions,
    researchMode: 'deep',
    deepDiveCount: effectiveDeepDiveCap,
    includeReviewInsights,
  });

  const plan =
    researchMode === 'deep'
      ? deepPlan
      : researchMode === 'balanced'
        ? balancedPlan
        : fastPlan;

  const noCategorySelected = selectedCategories.length === 0 || plan.streams.length === 0;
  const multipleSelected = selectedCategories.length >= 2 && selectedSubcategoryIds.length === 0;
  const exceedsLimit = !noCategorySelected && plan.estimatedCredits > spendingLimitCredits + 1e-6;
  const canRequestStart = !isHunting && !noCategorySelected && !exceedsLimit;

  const modeSummary =
    researchMode === 'deep'
      ? t.modeDeepTitle
      : researchMode === 'balanced'
        ? t.modeBalancedTitle
        : t.modeFastTitle;

  const categorySummary = (() => {
    if (selectedCategories.length === 0) return '—';
    const names = selectedCategories.map((cat) =>
      getCategoryLabel(cat, language, { short: selectedCategories.length > 1 })
    );
    const label =
      names.length <= 3
        ? names.join(', ')
        : `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
    if (selectedSubcategoryIds.length > 0) {
      return `${label} · ${selectedSubcategoryIds.length} L2`;
    }
    return label;
  })();

  const strategySummary =
    strategyPreset === 'balanced'
      ? t.strategyBalanced
      : strategyPreset === 'sales-first'
        ? t.strategySales
        : t.strategyCommission;

  const handleConfirmSyncCategories = async (level: 'l1' | 'l2') => {
    if (isSyncingCategories) return;
    setSyncConfirmMode(null);
    setSyncError(null);
    setIsSyncingCategories(true);

    try {
      const bodyPayload: Record<string, unknown> = {
        region: 'TH',
        language: 'en-US',
        currency: 'THB',
        date_range: 'last30Day',
        page_number: 1,
        page_size: 100,
        category_level: level === 'l1' ? 1 : 2,
        sort_field: { field: 'revenue', type: 'DESC' },
      };

      if (level === 'l2' && selectedParentL1Ids.length > 0) {
        bodyPayload.category_ids = selectedParentL1Ids;
      }

      const response = await fetch('/api/kalodata/category-rank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
      });

      const data = (await response.json().catch(() => null)) as {
        ok?: boolean;
        items?: Array<{
          category_id?: string | number;
          category_name?: string;
          rank?: number | null;
          revenue?: number | null;
          parent_category_id?: string | null;
        }>;
        error?: string;
        errorMy?: string;
      } | null;

      if (!response.ok || !data?.ok || !Array.isArray(data.items)) {
        const msg =
          isMy && data?.errorMy
            ? data.errorMy
            : data?.error ?? `Category sync failed (HTTP ${response.status})`;
        setSyncError(msg);
        return;
      }

      const normalizedItems = data.items
        .map((item) => ({
          category_id:
            item.category_id !== undefined && item.category_id !== null
              ? String(item.category_id).trim()
              : '',
          category_name: typeof item.category_name === 'string' ? item.category_name.trim() : '',
          rank: typeof item.rank === 'number' && Number.isFinite(item.rank) ? item.rank : null,
          revenue:
            typeof item.revenue === 'number' && Number.isFinite(item.revenue) ? item.revenue : null,
          parent_category_id:
            typeof item.parent_category_id === 'string' && item.parent_category_id.trim()
              ? item.parent_category_id.trim()
              : null,
        }))
        .filter((item) => item.category_id.length > 0 && item.category_name.length > 0);

      if (normalizedItems.length === 0) {
        setSyncError(t.syncCategoriesEmptyResultError);
        onBalanceRefresh?.();
        return;
      }

      const nowIso = new Date().toISOString();
      const nextCache =
        level === 'l1'
          ? mergeSyncedL1Categories(syncedCategoryCache, normalizedItems, nowIso)
          : mergeSyncedL2Subcategories(
              syncedCategoryCache,
              normalizedItems,
              {
                parentCategory: selectedCategories.length === 1 ? selectedCategories[0] : null,
                parentCategoryId: selectedParentL1Ids.length === 1 ? selectedParentL1Ids[0] : null,
              },
              nowIso
            );

      saveSyncedKalodataCategories(nextCache);
      onSyncedCategoryCacheChange(nextCache);
      onBalanceRefresh?.();
      if (level === 'l1') {
        setShowAllCategories(true);
      }
    } catch (err) {
      setSyncError(
        err instanceof Error ? err.message : 'Unable to sync categories from Kalodata.'
      );
    } finally {
      setIsSyncingCategories(false);
    }
  };

  const callBreakdownParts: string[] = [];
  if (plan.rankApiCalls > 0) {
    callBreakdownParts.push(`${t.breakdownRankLabel}: ${plan.rankApiCalls}`);
  }
  if ((plan.videoRankApiCalls ?? 0) > 0) {
    callBreakdownParts.push(`${t.breakdownVideoRankLabel}: ≤${plan.videoRankApiCalls}`);
  }
  if (plan.productDetailApiCalls > 0) {
    callBreakdownParts.push(
      `${t.breakdownDetailLabel}: ${myanmarLanguageOnly ? '≤' : ''}${plan.productDetailApiCalls}`
    );
  }
  if (plan.shopDetailApiCalls > 0) {
    callBreakdownParts.push(`${t.breakdownShopLabel}: ≤${plan.shopDetailApiCalls}`);
  }
  if (plan.commentInsightApiCalls > 0) {
    callBreakdownParts.push(`${t.breakdownReviewLabel}: ${plan.commentInsightApiCalls}`);
  }
  const callBreakdownText = callBreakdownParts.join(' · ');

  const handleCustomQtyChange = (raw: string) => {
    setCustomQtyDraft(raw);
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed >= MIN_RESEARCH_QUANTITY) {
      onQuantityChange(Math.min(MAX_RESEARCH_QUANTITY, parsed));
    }
  };

  const handleCustomQtyBlur = () => {
    const parsed = Number.parseInt(customQtyDraft, 10);
    if (!Number.isFinite(parsed) || parsed < MIN_RESEARCH_QUANTITY) {
      setCustomQtyDraft(String(quantity));
      return;
    }
    const clamped = Math.max(MIN_RESEARCH_QUANTITY, Math.min(MAX_RESEARCH_QUANTITY, parsed));
    onQuantityChange(clamped);
    setCustomQtyDraft(String(clamped));
  };

  const handleLimitChange = (raw: string) => {
    setLimitDraft(raw);
    const parsed = Number.parseFloat(raw);
    if (Number.isFinite(parsed) && parsed >= MIN_SPENDING_LIMIT_CREDITS) {
      const clamped =
        Math.round(Math.min(MAX_SPENDING_LIMIT_CREDITS, parsed) * 1000) / 1000;
      onSpendingLimitChange(clamped);
    }
  };

  const handleLimitBlur = () => {
    const parsed = Number.parseFloat(limitDraft);
    if (!Number.isFinite(parsed) || parsed < MIN_SPENDING_LIMIT_CREDITS) {
      setLimitDraft(formatCredits(spendingLimitCredits));
      return;
    }
    const clamped =
      Math.round(
        Math.max(MIN_SPENDING_LIMIT_CREDITS, Math.min(MAX_SPENDING_LIMIT_CREDITS, parsed)) * 1000
      ) / 1000;
    onSpendingLimitChange(clamped);
    setLimitDraft(formatCredits(clamped));
  };

  return (
    <section
      aria-labelledby="research-settings-heading"
      className="mt-8 bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-xl p-5 sm:p-6 space-y-6"
    >
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id="research-settings-heading"
          className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-50"
        >
          {t.settingsHeading}
        </h2>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {!isHunting &&
            (quotaStatus.paused ? (
              <button
                type="button"
                onClick={onResumeResearch}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 transition-colors cursor-pointer whitespace-nowrap"
              >
                <PlayCircle className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{t.btnResumeResearch}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onPauseResearch}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors cursor-pointer whitespace-nowrap"
              >
                <PauseCircle className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{t.btnPauseResearch}</span>
              </button>
            ))}

          <button
            type="button"
            onClick={onToggleFineTune}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50 transition-colors cursor-pointer whitespace-nowrap"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t.weightFineTune}</span>
          </button>
        </div>
      </div>

      {/* Fixed Specifications Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-5 border-b border-zinc-100 dark:border-zinc-800/70">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            <Lock className="w-3 h-3 text-zinc-400 dark:text-zinc-500 shrink-0" aria-hidden="true" />
            <span>{t.settingMarketLabel}</span>
            <InfoPopover
              variant="info"
              label={t.settingMarketLabel}
              title={t.settingMarketLabel}
              content={t.settingFixedNote}
            />
          </div>
          <div className="text-xs sm:text-sm font-semibold text-zinc-950 dark:text-zinc-50">
            {t.settingMarketValue}
          </div>
        </div>

        <div className="space-y-1">
          <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">{t.settingPriceLabel}</div>
          <div className="text-xs sm:text-sm font-semibold text-zinc-950 dark:text-zinc-50">
            {t.settingPriceValue}{' '}
            <span className="font-mono text-xs font-normal text-zinc-400 dark:text-zinc-500 tabular-nums">
              (THB ฿)
            </span>
          </div>
        </div>

        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            <span>{t.strategyLabel}</span>
            <InfoPopover
              variant="help"
              label={t.strategyLabel}
              title={t.strategyLabel}
              content={t.settingStrategyValue}
            />
          </div>
          <div className="text-xs sm:text-sm font-semibold text-zinc-950 dark:text-zinc-50">
            {strategySummary}{' '}
            <span className="font-mono text-xs font-normal text-zinc-500 dark:text-zinc-400 tabular-nums">
              ({salesWeightPct}/{100 - salesWeightPct})
            </span>
          </div>
        </div>
      </div>

      {/* Working Strategy Slider & Live 7-Factor Weight Distribution (Always Totals 100) */}
      {showFineTune && (() => {
        const previewCategory =
          selectedCategories.length === 1 ? selectedCategories[0] : undefined;
        const liveWeights = computeStrategyWeights(salesWeightPct, previewCategory);
        const totalWeight = SCORING_FACTOR_ORDER.reduce((sum, key) => sum + liveWeights[key], 0);
        return (
          <div className="pb-5 border-b border-zinc-100 dark:border-zinc-800/70 space-y-4">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
              <div
                className="flex flex-wrap items-center gap-2 min-w-0"
                role="group"
                aria-label={t.strategyLabel}
              >
                {(
                  [
                    { id: 'sales-first', label: t.strategySales },
                    { id: 'balanced', label: t.strategyBalanced },
                    { id: 'commission-first', label: t.strategyCommission },
                  ] as const
                ).map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => onSelectStrategyPreset(preset.id)}
                    className={`min-h-[38px] max-w-full px-3.5 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-normal sm:whitespace-nowrap text-left leading-snug ${
                      strategyPreset === preset.id
                        ? 'bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950 border-zinc-950 dark:border-zinc-100'
                        : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-zinc-950 dark:hover:text-zinc-50'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <div className="w-full xl:max-w-sm space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-600 dark:text-zinc-400">
                    {t.commissionWeight}{' '}
                    <span className="font-mono font-medium tabular-nums text-emerald-700 dark:text-emerald-400">
                      {100 - salesWeightPct}%
                    </span>
                  </span>
                  <span className="text-zinc-600 dark:text-zinc-400">
                    {t.salesWeight}{' '}
                    <span className="font-mono font-medium tabular-nums text-zinc-950 dark:text-zinc-50">
                      {salesWeightPct}%
                    </span>
                  </span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={90}
                  step={5}
                  value={salesWeightPct}
                  onChange={(e) => onCustomWeightChange(Number(e.target.value))}
                  aria-label={t.weightFineTune}
                  className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-zinc-950 dark:accent-zinc-100"
                />
              </div>
            </div>

            {/* Live 7-Factor Weight Breakdown (Always Sums to 100) */}
            <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/70 space-y-2">
              <div className="flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
                <span className="font-medium text-zinc-700 dark:text-zinc-300">{t.scoringStrategyActiveLabel}</span>
                <span className="font-mono font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums">
                  {t.scoringTotalWeightLabel}: {totalWeight}/100
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                {SCORING_FACTOR_ORDER.map((key) => (
                  <div
                    key={key}
                    className="px-2.5 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/70 dark:border-zinc-800/70"
                  >
                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate" title={t.factorLabels[key]}>
                      {t.factorLabels[key]}
                    </div>
                    <div className="mt-0.5 font-mono text-sm font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums">
                      {liveWeights[key]}
                      <span className="text-[11px] font-normal text-zinc-400 dark:text-zinc-500"> pts</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* 1. Universal Multi-Select Product Categories (Verified + Live Kalodata TH Sync + L2 Subcategories) */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{t.settingCategoryLabel}</span>
              <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                ({selectedCategories.length} {t.selectedCategoriesCountLabel})
              </span>
              <InfoPopover
                variant="help"
                label={t.settingCategoryLabel}
                title={t.settingCategoryLabel}
                content={t.syncCategoriesEmptyHint}
              />
            </div>
            <span
              className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums"
              data-testid="category-catalog-counts"
            >
              {catalogCountSummary}
              {isSyncingCategories ? ` · ${t.syncCategoriesRunning}` : ''}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {!allReadySelected && (
              <button
                type="button"
                onClick={onSelectAllVerifiedCategories}
                className="font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50 transition-colors cursor-pointer"
              >
                {t.selectAllVerifiedAction} ({catalogCounts.supported})
              </button>
            )}
            {selectedCategories.length > 0 && (
              <button
                type="button"
                onClick={onClearAllCategories}
                className="font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50 transition-colors cursor-pointer"
              >
                {t.clearAllCategoriesAction}
              </button>
            )}
            {extraCatalogEntries.length > 0 && (
              <button
                type="button"
                onClick={() => setShowAllCategories((prev) => !prev)}
                className="inline-flex items-center gap-1 font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-50 transition-colors cursor-pointer"
              >
                <span>{extraCategoriesToggleLabel}</span>
                {showAllCategories ? (
                  <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                )}
              </button>
            )}
            <button
              type="button"
              onClick={() => setSyncConfirmMode((prev) => (prev === 'l1' ? null : 'l1'))}
              disabled={isSyncingCategories}
              className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-emerald-300 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {isSyncingCategories ? (
                <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="w-3 h-3" aria-hidden="true" />
              )}
              <span>{t.syncCategoriesBtn}</span>
            </button>
          </div>
        </div>

        {/* Inline Explicit Confirmation for 0.1-Credit Kalodata Category Sync (L1 or L2) */}
        {syncConfirmMode && (
          <div className="p-3.5 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-300 dark:border-zinc-700 rounded-xl space-y-2.5 text-xs">
            <div className="font-semibold text-zinc-950 dark:text-zinc-50">
              {syncConfirmMode === 'l1'
                ? t.syncCategoriesConfirmTitle
                : t.subcategoryLoadConfirmTitle}
            </div>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              {syncConfirmMode === 'l1'
                ? t.syncCategoriesConfirmDesc
                : t.subcategoryLoadConfirmDesc}
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <button
                type="button"
                onClick={() => handleConfirmSyncCategories(syncConfirmMode)}
                className="min-h-[34px] px-3.5 py-1.5 text-xs font-medium text-white dark:text-zinc-950 bg-zinc-950 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white rounded-lg transition-colors cursor-pointer"
              >
                {t.syncCategoriesConfirmProceed}
              </button>
              <button
                type="button"
                onClick={() => setSyncConfirmMode(null)}
                className="min-h-[34px] px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 rounded-lg transition-colors cursor-pointer"
              >
                {t.confirmCancelBtn}
              </button>
            </div>
          </div>
        )}

        {syncError && (
          <div
            role="alert"
            className="p-3 rounded-lg bg-red-50/80 dark:bg-red-950/35 border border-red-200 dark:border-red-800/60 text-xs text-red-800 dark:text-red-300"
          >
            {syncError}
          </div>
        )}

        {/* Universal Category Grid (Ready Categories Always First; Unsynced/Unsupported Honestly Disabled) */}
        <div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2"
          role="group"
          aria-label={t.settingCategoryLabel}
        >
          {visibleCatalogEntries.map((entry) => {
            const catId = entry.id;
            const isSelected = selectedCategories.includes(catId);
            const label = getCategoryLabel(catId, language);
            const statusText = t.categoryStatusLabels[entry.apiSupportStatus];

            return (
              <button
                key={catId}
                type="button"
                role="checkbox"
                aria-checked={isSelected}
                disabled={!entry.selectable}
                onClick={() => {
                  if (entry.selectable) onToggleCategory(catId);
                }}
                className={`min-h-[42px] px-3 py-2 rounded-lg border text-left flex items-center justify-between gap-2 transition-all ${
                  !entry.selectable
                    ? 'bg-zinc-50/80 dark:bg-zinc-800/50 text-zinc-400 dark:text-zinc-500 border-zinc-200/70 dark:border-zinc-800/70 cursor-not-allowed'
                    : isSelected
                      ? 'bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950 border-zinc-950 dark:border-zinc-100 cursor-pointer'
                      : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-zinc-950 dark:hover:text-zinc-50 cursor-pointer'
                }`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-4 h-4 rounded-sm border flex items-center justify-center shrink-0 ${
                      !entry.selectable
                        ? 'border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-800'
                        : isSelected
                          ? 'bg-white dark:bg-zinc-900 text-zinc-950 dark:text-zinc-50 border-white dark:border-zinc-900'
                          : 'border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900'
                    }`}
                    aria-hidden="true"
                  >
                    {isSelected && <Check className="w-3 h-3 stroke-[2.5]" />}
                  </span>
                  <span className="text-xs font-medium truncate">{label}</span>
                </span>
                <span
                  className={`font-mono text-[10px] tabular-nums shrink-0 ${
                    !entry.selectable
                      ? entry.apiSupportStatus === 'unsupported'
                        ? 'text-red-400'
                        : 'text-amber-600/80 dark:text-amber-400/80'
                      : isSelected
                        ? 'text-zinc-300 dark:text-zinc-600'
                        : 'text-zinc-400 dark:text-zinc-500'
                  }`}
                >
                  {entry.kalodataId ? entry.kalodataId : statusText}
                </span>
              </button>
            );
          })}
        </div>

        {noCategorySelected && (
          <p className="text-xs text-amber-700 dark:text-amber-400">{t.noCategorySelectedWarning}</p>
        )}

        {/* Optional L2 Subcategory Selector (Always visible when parent L1 category is selected) */}
        {selectedParentL1Ids.length > 0 && (
          <div className="pt-2.5 border-t border-zinc-100 dark:border-zinc-800/70 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex items-center gap-1.5 text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                <Layers className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" aria-hidden="true" />
                <span>{t.subcategorySectionLabel}</span>
                {selectedSubcategoryIds.length > 0 && (
                  <span className="font-mono text-emerald-700 dark:text-emerald-400 tabular-nums">
                    ({selectedSubcategoryIds.length})
                  </span>
                )}
                <InfoPopover
                  variant="help"
                  label={t.subcategorySectionLabel}
                  title={t.subcategorySectionLabel}
                  content={
                    <div className="space-y-1.5">
                      {selectedSubcategoryIds.length > 0 && (
                        <p className="text-emerald-700 dark:text-emerald-400 font-medium">{t.subcategorySelectedHint}</p>
                      )}
                      <p>{t.subcategoryEmptyHint}</p>
                    </div>
                  }
                />
              </div>

              <div className="flex items-center gap-3 text-[11px]">
                {selectedSubcategoryIds.length > 0 && (
                  <button
                    type="button"
                    onClick={onClearSubcategories}
                    className="font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50 cursor-pointer"
                  >
                    {t.subcategoryClearBtn}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSyncConfirmMode((prev) => (prev === 'l2' ? null : 'l2'))}
                  disabled={isSyncingCategories}
                  className="font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-50 disabled:opacity-50 cursor-pointer"
                >
                  {t.subcategoryLoadBtn}
                </button>
              </div>
            </div>

            {visibleSubcategories.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {visibleSubcategories.slice(0, 24).map((sub) => {
                  const active = selectedSubcategoryIds.includes(sub.id);
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => onToggleSubcategory(sub.id)}
                      aria-pressed={active}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded-md border transition-colors cursor-pointer ${
                        active
                          ? 'bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950 border-zinc-950 dark:border-zinc-100'
                          : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600'
                      }`}
                    >
                      {sub.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. Research Quantity + Multi-Category Query Mode */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start pt-1 border-t border-zinc-100 dark:border-zinc-800/70">
        {/* Research Quantity (Presets 10/20/30 + Custom Input) */}
        <div className={multipleSelected ? 'lg:col-span-6 space-y-2.5' : 'lg:col-span-12 space-y-2.5'}>
          <div className="flex items-center gap-1.5">
            <label htmlFor="custom-quantity-input" className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              {t.settingQuantityLabel}
            </label>
            <InfoPopover
              variant="help"
              label={t.settingQuantityLabel}
              title={t.settingQuantityLabel}
              content={t.customQuantityHint}
            />
          </div>

          <div className="flex flex-wrap sm:flex-nowrap items-stretch gap-2">
            <div
              className="grid grid-cols-3 gap-1.5 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg flex-1 min-w-[200px]"
              role="group"
              aria-label={t.settingQuantityLabel}
            >
              {PRESET_QUANTITIES.map((qty) => (
                <button
                  key={qty}
                  type="button"
                  onClick={() => onQuantityChange(qty)}
                  className={`min-h-[38px] px-2.5 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all cursor-pointer whitespace-nowrap text-center font-mono tabular-nums ${
                    quantity === qty
                      ? 'bg-white dark:bg-zinc-900 text-zinc-950 dark:text-zinc-50 shadow-xs'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50'
                  }`}
                >
                  {qty}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg focus-within:border-zinc-900 min-h-[44px] w-full sm:w-40 shrink-0">
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                {t.customQuantityLabel}
              </span>
              <input
                id="custom-quantity-input"
                type="number"
                inputMode="numeric"
                min={MIN_RESEARCH_QUANTITY}
                max={MAX_RESEARCH_QUANTITY}
                value={customQtyDraft}
                onChange={(e) => handleCustomQtyChange(e.target.value)}
                onBlur={handleCustomQtyBlur}
                className="w-full text-right font-mono text-sm font-medium text-zinc-950 dark:text-zinc-50 tabular-nums bg-transparent focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Combined vs Split Mode (Shown whenever 2+ L1 Categories are selected without L2 override) */}
        {multipleSelected && (
          <div className="lg:col-span-6 space-y-2.5">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{t.multiCategoryModeLabel}</span>
              <InfoPopover
                variant="help"
                label={t.multiCategoryModeLabel}
                title={t.multiCategoryModeLabel}
                content={
                  <div className="space-y-2">
                    <div>
                      <div className="font-semibold text-zinc-900 dark:text-zinc-100">{t.bothModeCombined}</div>
                      <p className="text-zinc-600 dark:text-zinc-400">{t.multiCategoryCombinedDesc}</p>
                    </div>
                    <div>
                      <div className="font-semibold text-zinc-900 dark:text-zinc-100">{t.bothModeSplit}</div>
                      <p className="text-zinc-600 dark:text-zinc-400">{t.multiCategorySplitDesc}</p>
                    </div>
                  </div>
                }
              />
            </div>
            <div
              className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg"
              role="radiogroup"
              aria-label={t.multiCategoryModeLabel}
            >
              {(
                [
                  {
                    id: 'combined' as const,
                    label: t.bothModeCombined,
                  },
                  {
                    id: 'split' as const,
                    label: t.bothModeSplit,
                  },
                ]
              ).map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  role="radio"
                  aria-checked={bothCategoryMode === mode.id}
                  onClick={() => onBothCategoryModeChange(mode.id)}
                  className={`min-h-[38px] px-3 py-1.5 rounded-md text-center text-xs font-medium transition-all cursor-pointer ${
                    bothCategoryMode === mode.id
                      ? 'bg-white dark:bg-zinc-900 text-zinc-950 dark:text-zinc-50 shadow-xs'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 3. Research Mode Selector (Clean Cards + Individual Tap-to-Open Info Icons) */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{t.researchModeLabel}</span>
            <InfoPopover
              variant="help"
              label={t.researchModeLabel}
              title={t.researchModeLabel}
              content={
                <div className="space-y-2">
                  <div>
                    <div className="font-semibold text-zinc-900 dark:text-zinc-100">{t.modeFastTitle}</div>
                    <p>{t.modeFastDesc}</p>
                  </div>
                  <div>
                    <div className="font-semibold text-zinc-900 dark:text-zinc-100">{t.modeBalancedTitle}</div>
                    <p>{t.modeBalancedDesc}</p>
                  </div>
                  <div>
                    <div className="font-semibold text-zinc-900 dark:text-zinc-100">{t.modeDeepTitle}</div>
                    <p>{t.modeDeepDesc}</p>
                  </div>
                </div>
              }
            />
          </div>
          {plan.usesGeminiAnalysis && (
            <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
              {t.geminiAnalysisActiveLabel}
            </span>
          )}
        </div>

        <div
          className="grid grid-cols-1 md:grid-cols-3 gap-2.5"
          role="radiogroup"
          aria-label={t.researchModeLabel}
        >
          {(
            [
              {
                id: 'fast' as const,
                title: t.modeFastTitle,
                desc: t.modeFastDesc,
                modePlan: fastPlan,
              },
              {
                id: 'balanced' as const,
                title: t.modeBalancedTitle,
                desc: t.modeBalancedDesc,
                modePlan: balancedPlan,
              },
              {
                id: 'deep' as const,
                title: t.modeDeepTitle,
                desc: t.modeDeepDesc,
                modePlan: deepPlan,
              },
            ] as const
          ).map((item) => {
            const active = researchMode === item.id;
            const modeExceedsLimit =
              !noCategorySelected && item.modePlan.estimatedCredits > spendingLimitCredits + 1e-6;
            return (
              <div
                key={item.id}
                className={`p-3 rounded-xl border transition-all flex flex-col justify-between gap-2 ${
                  active
                    ? 'bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950 border-zinc-950 dark:border-zinc-100'
                    : 'bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1 min-w-0">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => onResearchModeChange(item.id)}
                      className="text-left text-xs sm:text-sm font-semibold truncate cursor-pointer focus-visible:outline-none focus-visible:underline"
                    >
                      {item.title}
                    </button>
                    <InfoPopover
                      variant="info"
                      tone={active ? 'dark' : 'light'}
                      label={item.title}
                      title={item.title}
                      content={item.desc}
                    />
                  </div>
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => onResearchModeChange(item.id)}
                    className={`font-mono text-xs font-semibold tabular-nums shrink-0 cursor-pointer ${
                      active
                        ? modeExceedsLimit
                          ? 'text-red-300'
                          : 'text-emerald-300'
                        : modeExceedsLimit
                          ? 'text-red-700 dark:text-red-400'
                          : 'text-zinc-900 dark:text-zinc-100'
                    }`}
                  >
                    {formatCredits(item.modePlan.estimatedCredits)} cr
                  </button>
                </div>

                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => onResearchModeChange(item.id)}
                  className="text-left font-mono text-[11px] tabular-nums text-zinc-400 dark:text-zinc-500 cursor-pointer"
                >
                  {item.modePlan.plannedApiCalls} {t.plannedCallsLabel} · ≈{' '}
                  {formatUsd(item.modePlan.estimatedUsd)}
                </button>
              </div>
            );
          })}
        </div>

        {/* Inline Deep Research Cost-Cap Controls (Only visible when Deep Research is selected) */}
        {researchMode === 'deep' && (
          <div className="p-3.5 bg-zinc-50/90 dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-800/80 rounded-xl flex flex-col lg:flex-row lg:items-center justify-between gap-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1">
                <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">{t.deepDiveCountLabel}</span>
                <InfoPopover
                  variant="help"
                  label={t.deepDiveCountLabel}
                  title={t.deepDiveCountLabel}
                  content={t.deepDiveCountHint}
                />
              </div>
              <div className="inline-flex items-center gap-1 p-0.5 bg-zinc-200/70 dark:bg-zinc-700/70 rounded-lg">
                {DEEP_DIVE_PRESETS.filter((preset) => preset <= maxAllowedDeepDive).map(
                  (preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => onDeepDiveCountChange(preset)}
                      className={`px-2.5 py-1 text-xs font-mono tabular-nums font-medium rounded-md transition-colors cursor-pointer ${
                        effectiveDeepDiveCap === preset
                          ? 'bg-white dark:bg-zinc-900 text-zinc-950 dark:text-zinc-50 shadow-xs'
                          : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50'
                      }`}
                    >
                      Top {preset}
                    </button>
                  )
                )}
                <input
                  type="number"
                  inputMode="numeric"
                  min={MIN_DEEP_DIVE_COUNT}
                  max={maxAllowedDeepDive}
                  value={effectiveDeepDiveCap}
                  onChange={(e) => {
                    const parsed = Number.parseInt(e.target.value, 10);
                    if (Number.isFinite(parsed)) {
                      onDeepDiveCountChange(clampDeepDiveCount(parsed, quantity));
                    }
                  }}
                  aria-label={t.deepDiveCountLabel}
                  className="w-12 px-1.5 py-1 text-right font-mono text-xs font-semibold text-zinc-950 dark:text-zinc-50 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md tabular-nums focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-300"
                />
              </div>
            </div>

            <div className="flex items-center gap-1.5 lg:border-l lg:border-zinc-200 dark:lg:border-zinc-800 lg:pl-4">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeReviewInsights}
                  onChange={(e) => onIncludeReviewInsightsChange(e.target.checked)}
                  className="w-4 h-4 rounded-sm border-zinc-300 dark:border-zinc-700 accent-zinc-950 dark:accent-zinc-100 cursor-pointer shrink-0"
                />
                <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                  {t.includeReviewInsightsLabel}{' '}
                  <span className="font-mono text-[11px] text-amber-700 dark:text-amber-400">
                    (+{formatCredits(Math.min(effectiveDeepDiveCap, DEEP_COMMENT_INSIGHT_CAP))} cr)
                  </span>
                </span>
              </label>
              <InfoPopover
                variant="info"
                label={t.includeReviewInsightsLabel}
                title={t.includeReviewInsightsLabel}
                content={t.includeReviewInsightsDesc}
              />
            </div>
          </div>
        )}
      </div>

      {/* 3b. Phase 9: Optional Myanmar Review Product Discovery (Thailand TikTok Shop Only · OFF by Default) */}
      <div className="px-4 py-3 bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-xl space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">{t.myanmarFilterLabel}</span>
            <InfoPopover
              variant="info"
              label={t.myanmarFilterPopoverTitle}
              title={t.myanmarFilterPopoverTitle}
              content={t.myanmarFilterPopoverDesc}
            />
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400 hidden sm:inline">
              · {t.myanmarFilterSubLabel}
            </span>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={myanmarLanguageOnly}
            aria-label={t.myanmarFilterLabel}
            onClick={() => onMyanmarLanguageOnlyChange(!myanmarLanguageOnly)}
            className="inline-flex items-center gap-2 shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-200 rounded-lg py-0.5"
          >
            <span
              className={`font-mono text-[11px] font-semibold tabular-nums ${
                myanmarLanguageOnly ? 'text-emerald-700 dark:text-emerald-400' : 'text-zinc-400 dark:text-zinc-500'
              }`}
            >
              {myanmarLanguageOnly ? t.myanmarFilterOn : t.myanmarFilterOff}
            </span>
            <span
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                myanmarLanguageOnly ? 'bg-zinc-950 dark:bg-emerald-500' : 'bg-zinc-200 dark:bg-zinc-700'
              }`}
              aria-hidden="true"
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-xs transition-transform ${
                  myanmarLanguageOnly ? 'translate-x-4.5' : 'translate-x-1'
                }`}
              />
            </span>
          </button>
        </div>

        {myanmarLanguageOnly && (
          <div className="pt-2.5 border-t border-zinc-100 dark:border-zinc-800/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                {t.myanmarVideoScanPagesLabel}
              </span>
              <InfoPopover
                variant="help"
                label={t.myanmarVideoScanPagesLabel}
                title={t.myanmarVideoScanPagesLabel}
                content={t.myanmarVideoScanPagesHint}
              />
              <span className="font-mono text-[11px] text-emerald-700 dark:text-emerald-400 tabular-nums">
                (≤{(effectiveVideoScanPages * KALODATA_MAX_PAGE_SIZE).toLocaleString('en-US')} videos · ≤
                {formatCredits(effectiveVideoScanPages * KALODATA_VIDEO_RANK_CREDIT_PER_100)} cr)
              </span>
            </div>

            <div className="inline-flex flex-wrap max-w-full items-center gap-1 p-0.5 bg-zinc-100 dark:bg-zinc-800 rounded-lg self-start sm:self-auto">
              {MYANMAR_VIDEO_PAGE_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => onMyanmarVideoScanPagesChange(preset)}
                  className={`px-2.5 py-1 text-xs font-mono tabular-nums font-medium rounded-md transition-colors cursor-pointer ${
                    effectiveVideoScanPages === preset
                      ? 'bg-white dark:bg-zinc-900 text-zinc-950 dark:text-zinc-50 shadow-xs'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50'
                  }`}
                >
                  {preset}p
                </button>
              ))}
              <input
                type="number"
                inputMode="numeric"
                min={MIN_MYANMAR_VIDEO_SCAN_PAGES}
                max={MAX_MYANMAR_VIDEO_SCAN_PAGES}
                value={effectiveVideoScanPages}
                onChange={(e) => {
                  const parsed = Number.parseInt(e.target.value, 10);
                  if (Number.isFinite(parsed)) {
                    onMyanmarVideoScanPagesChange(clampMyanmarVideoScanPages(parsed));
                  }
                }}
                aria-label={t.myanmarVideoScanPagesLabel}
                className="w-12 px-1.5 py-1 text-right font-mono text-xs font-semibold text-zinc-950 dark:text-zinc-50 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md tabular-nums focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-300"
              />
            </div>
          </div>
        )}
      </div>

      {/* 4. Cost Preview & 5. Spending Limit Protection */}
      <div className="bg-zinc-50/80 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-800/80 rounded-xl px-4 py-3.5 space-y-2.5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs min-w-0">
            <span className="inline-flex items-center gap-1.5 font-semibold text-zinc-900 dark:text-zinc-100">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 shrink-0" aria-hidden="true" />
              <span>{t.estimatedCostLabel}:</span>
            </span>
            <span
              className={`font-mono text-sm font-semibold tabular-nums ${
                exceedsLimit ? 'text-red-700 dark:text-red-400' : 'text-zinc-950 dark:text-zinc-50'
              }`}
            >
              {formatCredits(plan.estimatedCredits)} {t.creditsUnit}
            </span>
            <span className="font-mono text-zinc-500 dark:text-zinc-400 tabular-nums">
              (≈ {formatUsd(plan.estimatedUsd)} · {plan.plannedApiCalls} {t.plannedCallsLabel})
            </span>
            <InfoPopover
              variant="help"
              label={t.estimatedCostLabel}
              title={t.estimatedCostLabel}
              content={t.pricingFormulaNote}
            />
          </div>

          {/* User Spending Limit Control */}
          <div className="flex flex-wrap items-center justify-between md:justify-end gap-2.5 md:shrink-0">
            <label
              htmlFor="spending-limit-input"
              className="text-xs font-medium text-zinc-700 dark:text-zinc-300"
            >
              {t.spendingLimitLabel}
            </label>
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 bg-white dark:bg-zinc-900 border rounded-lg w-28 ${
                exceedsLimit
                  ? 'border-red-400 dark:border-red-700 focus-within:border-red-600'
                  : 'border-zinc-200 dark:border-zinc-800 focus-within:border-zinc-900'
              }`}
            >
              <input
                id="spending-limit-input"
                type="number"
                inputMode="decimal"
                min={MIN_SPENDING_LIMIT_CREDITS}
                max={MAX_SPENDING_LIMIT_CREDITS}
                step={0.1}
                value={limitDraft}
                onChange={(e) => handleLimitChange(e.target.value)}
                onBlur={handleLimitBlur}
                className="w-full text-right font-mono text-sm font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums bg-transparent focus:outline-none"
              />
              <span className="text-[11px] text-zinc-400 dark:text-zinc-500 font-mono">cr</span>
            </div>
          </div>
        </div>

        {/* Crisp 1-Line Call Breakdown & Last Actual Cost */}
        <div className="pt-2 border-t border-zinc-200/70 dark:border-zinc-800/70 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-zinc-600 dark:text-zinc-400 tabular-nums">
          <span className="font-sans font-medium text-zinc-800 dark:text-zinc-200">{modeSummary}</span>
          <span aria-hidden="true">·</span>
          <span>{callBreakdownText}</span>
          {lastCostSummary && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-sans text-zinc-500 dark:text-zinc-400">
                {t.actualCostLabel}:{' '}
                {lastCostSummary.actualCredits !== null ? (
                  <strong className="font-mono text-emerald-700 dark:text-emerald-400">
                    {formatCredits(lastCostSummary.actualCredits)} {t.creditsUnit}
                    {lastCostSummary.actualUsd !== null
                      ? ` (≈ ${formatUsd(lastCostSummary.actualUsd)} · ${lastCostSummary.actualApiCalls} ${t.actualCallsLabel})`
                      : ''}
                  </strong>
                ) : (
                  <span>{t.actualCostUnavailable}</span>
                )}
              </span>
            </>
          )}
        </div>

        {/* Hard Spending Limit Block Notice */}
        {exceedsLimit && (
          <div
            role="alert"
            className="flex items-start gap-2.5 p-3 bg-red-50/80 dark:bg-red-950/35 border border-red-200 dark:border-red-800/60 rounded-lg text-xs text-red-800 dark:text-red-300"
          >
            <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <div className="font-semibold">{t.spendingLimitExceededTitle}</div>
              <p className="mt-0.5 text-red-700/90 dark:text-red-400/90 leading-relaxed">
                {t.spendingLimitExceededDesc}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Explicit Pre-Call Confirmation Panel (Must confirm before calling Kalodata API) */}
      {confirmOpen && canRequestStart && (
        <div
          role="region"
          aria-label={t.confirmHeading}
          className="p-4 bg-zinc-950 dark:bg-zinc-900 dark:border dark:border-zinc-700 text-white rounded-xl space-y-3"
        >
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">{t.confirmHeading}</h3>
            <p className="text-xs text-zinc-300 leading-relaxed">{t.confirmNotice}</p>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-200 font-mono tabular-nums">
            <span className="text-white font-semibold">{modeSummary}</span>
            <span>·</span>
            <span>IDs: [{plan.categoryIds.join(', ')}]</span>
            <span>·</span>
            <span>
              {plan.quantity} {t.quantityProductsUnit}
            </span>
            <span>·</span>
            <span>{callBreakdownText}</span>
            <span>·</span>
            <span className="text-emerald-300 font-semibold">
              {t.estimatedCostLabel}: {formatCredits(plan.estimatedCredits)} {t.creditsUnit} (≈{' '}
              {formatUsd(plan.estimatedUsd)})
            </span>
            <span>·</span>
            <span>
              Limit: {formatCredits(spendingLimitCredits)} {t.creditsUnit}
            </span>
            {myanmarLanguageOnly && (
              <>
                <span>·</span>
                <span className="font-sans text-emerald-300 font-semibold">
                  {t.myanmarFilterActiveBadge} (≤{effectiveVideoScanPages}p /{' '}
                  {(effectiveVideoScanPages * KALODATA_MAX_PAGE_SIZE).toLocaleString('en-US')} videos)
                </span>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              className="min-h-[38px] px-4 py-1.5 text-xs font-medium text-zinc-200 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors cursor-pointer"
            >
              {t.confirmCancelBtn}
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmOpen(false);
                onConfirmStartHunting();
              }}
              className="inline-flex items-center gap-1.5 min-h-[38px] px-4 py-1.5 text-xs font-semibold text-zinc-950 bg-white hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer"
            >
              <span>{t.confirmStartBtn}</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* Primary Action Footer */}
      <div className="pt-5 border-t border-zinc-100 dark:border-zinc-800/70 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
          {modeSummary} · {categorySummary} · {strategySummary} ·{' '}
          <span className="font-mono tabular-nums text-zinc-800 dark:text-zinc-200">
            {quantity} {t.quantityProductsUnit}
          </span>
          {myanmarLanguageOnly && (
            <>
              {' '}
              · <span className="font-medium text-emerald-700 dark:text-emerald-400">{t.myanmarFilterActiveBadge}</span>
            </>
          )}
        </p>

        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={!canRequestStart}
          className="inline-flex items-center justify-center gap-2 min-h-[44px] max-w-full px-6 py-2.5 text-sm font-medium text-white dark:text-zinc-950 bg-zinc-950 dark:bg-zinc-100 rounded-lg hover:bg-zinc-800 dark:hover:bg-white active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer whitespace-normal text-center leading-snug sm:shrink-0 w-full sm:w-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 dark:focus-visible:ring-zinc-200 focus-visible:ring-offset-2"
        >
          {isHunting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />
              <span>{t.huntingInProgress}</span>
            </>
          ) : (
            <>
              <span>{quotaStatus.paused ? t.resumeAndStartBtn : t.startHuntingBtn}</span>
              <ArrowRight className="w-4 h-4 shrink-0" aria-hidden="true" />
            </>
          )}
        </button>
      </div>
    </section>
  );
}
