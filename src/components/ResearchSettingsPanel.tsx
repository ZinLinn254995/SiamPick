import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Loader2,
  Lock,
  PauseCircle,
  PlayCircle,
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
} from '../types/product';
import {
  buildKalodataExecutionPlan,
  clampDeepDiveCount,
  DEEP_COMMENT_INSIGHT_CAP,
  formatCredits,
  formatUsd,
  MAX_DEEP_DIVE_COUNT,
  MAX_RESEARCH_QUANTITY,
  MAX_SPENDING_LIMIT_CREDITS,
  MIN_DEEP_DIVE_COUNT,
  MIN_RESEARCH_QUANTITY,
  MIN_SPENDING_LIMIT_CREDITS,
  VERIFIED_TH_CATEGORY_IDS,
} from '../utils/kalodataPricing';
import { computeStrategyWeights, SCORING_FACTOR_ORDER } from '../utils/scoring';
import { TRANSLATIONS } from '../i18n/translations';

interface ResearchSettingsPanelProps {
  selectedCategories: ProductCategory[];
  onToggleCategory: (category: ProductCategory) => void;
  onSelectBothCategories: () => void;
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

export function ResearchSettingsPanel({
  selectedCategories,
  onToggleCategory,
  onSelectBothCategories,
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
  lastCostSummary,
  isHunting,
  quotaStatus,
  onPauseResearch,
  onResumeResearch,
  onConfirmStartHunting,
  language,
}: ResearchSettingsPanelProps) {
  const t = TRANSLATIONS[language];
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [customQtyDraft, setCustomQtyDraft] = useState(String(quantity));
  const [limitDraft, setLimitDraft] = useState(formatCredits(spendingLimitCredits));

  useEffect(() => {
    setCustomQtyDraft(String(quantity));
  }, [quantity]);

  useEffect(() => {
    setLimitDraft(formatCredits(spendingLimitCredits));
  }, [spendingLimitCredits]);

  // Close confirmation whenever user modifies settings or hunting starts
  const selectionKey = `${selectedCategories.join(',')}|${bothCategoryMode}|${researchMode}|${deepDiveCount}|${includeReviewInsights}|${quantity}|${spendingLimitCredits}|${strategyPreset}|${salesWeightPct}`;
  useEffect(() => {
    setConfirmOpen(false);
  }, [selectionKey, isHunting]);

  const effectiveDeepDiveCap = clampDeepDiveCount(deepDiveCount, quantity);
  const maxAllowedDeepDive = Math.min(MAX_DEEP_DIVE_COUNT, quantity);

  const fastPlan = buildKalodataExecutionPlan(selectedCategories, quantity, bothCategoryMode, {
    researchMode: 'fast',
  });
  const balancedPlan = buildKalodataExecutionPlan(selectedCategories, quantity, bothCategoryMode, {
    researchMode: 'balanced',
  });
  const deepPlan = buildKalodataExecutionPlan(selectedCategories, quantity, bothCategoryMode, {
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

  const hasFashion = selectedCategories.includes('womens-fashion');
  const hasBeauty = selectedCategories.includes('cosmetics-beauty');
  const bothSelected = hasFashion && hasBeauty;
  const noCategorySelected = selectedCategories.length === 0;
  const exceedsLimit = !noCategorySelected && plan.estimatedCredits > spendingLimitCredits + 1e-6;
  const canRequestStart = !isHunting && !noCategorySelected && !exceedsLimit;

  const modeSummary =
    researchMode === 'deep'
      ? t.modeDeepTitle
      : researchMode === 'balanced'
        ? t.modeBalancedTitle
        : t.modeFastTitle;

  const categorySummary = bothSelected
    ? `${t.settingBothCategories} (${VERIFIED_TH_CATEGORY_IDS['womens-fashion']}, ${VERIFIED_TH_CATEGORY_IDS['cosmetics-beauty']})`
    : hasFashion
      ? `${t.categoryFashion} (${VERIFIED_TH_CATEGORY_IDS['womens-fashion']})`
      : hasBeauty
        ? `${t.categoryBeauty} (${VERIFIED_TH_CATEGORY_IDS['cosmetics-beauty']})`
        : '—';

  const strategySummary =
    strategyPreset === 'balanced'
      ? t.strategyBalanced
      : strategyPreset === 'sales-first'
        ? t.strategySales
        : t.strategyCommission;

  const callBreakdownParts: string[] = [
    `${t.breakdownRankLabel}: ${plan.rankApiCalls}`,
  ];
  if (plan.productDetailApiCalls > 0) {
    callBreakdownParts.push(`${t.breakdownDetailLabel}: ${plan.productDetailApiCalls}`);
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
      className="mt-8 bg-white border border-zinc-200/90 rounded-xl p-5 sm:p-6 space-y-6"
    >
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id="research-settings-heading"
          className="font-display text-sm font-semibold text-zinc-950"
        >
          {t.settingsHeading}
        </h2>

        <div className="flex items-center gap-4">
          {!isHunting &&
            (quotaStatus.paused ? (
              <button
                type="button"
                onClick={onResumeResearch}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-800 transition-colors cursor-pointer whitespace-nowrap"
              >
                <PlayCircle className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{t.btnResumeResearch}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onPauseResearch}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-900 transition-colors cursor-pointer whitespace-nowrap"
              >
                <PauseCircle className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{t.btnPauseResearch}</span>
              </button>
            ))}

          <button
            type="button"
            onClick={onToggleFineTune}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-950 transition-colors cursor-pointer whitespace-nowrap"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t.weightFineTune}</span>
          </button>
        </div>
      </div>

      {/* Fixed & Core Research Specifications (Clean 3-Column Unboxed Readout) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pb-5 border-b border-zinc-100">
        <div className="space-y-1">
          <div className="text-xs text-zinc-500">{t.settingMarketLabel}</div>
          <div className="flex items-center gap-1.5 text-sm font-medium text-zinc-950">
            <Lock className="w-3.5 h-3.5 text-zinc-400 shrink-0" aria-hidden="true" />
            <span>{t.settingMarketValue}</span>
          </div>
          <div className="text-xs text-zinc-400">{t.settingFixedNote}</div>
        </div>

        <div className="space-y-1">
          <div className="text-xs text-zinc-500">{t.settingPriceLabel}</div>
          <div className="text-sm font-medium text-zinc-950">{t.settingPriceValue}</div>
          <div className="text-xs text-zinc-400 font-mono tabular-nums">THB (฿)</div>
        </div>

        <div className="space-y-1">
          <div className="text-xs text-zinc-500">{t.strategyLabel}</div>
          <div className="text-sm font-medium text-zinc-950">
            {strategySummary}{' '}
            <span className="font-mono text-xs font-normal text-zinc-500 tabular-nums">
              ({salesWeightPct}/{100 - salesWeightPct})
            </span>
          </div>
          <div className="text-xs text-zinc-400">{t.settingStrategyValue}</div>
        </div>
      </div>

      {/* Working Strategy Slider & Live 7-Factor Weight Distribution (Always Totals 100) */}
      {showFineTune && (() => {
        const liveWeights = computeStrategyWeights(salesWeightPct);
        const totalWeight = SCORING_FACTOR_ORDER.reduce((sum, key) => sum + liveWeights[key], 0);
        return (
          <div className="pb-5 border-b border-zinc-100 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div
                className="flex flex-wrap items-center gap-2"
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
                    className={`min-h-[38px] px-3.5 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      strategyPreset === preset.id
                        ? 'bg-zinc-950 text-white border-zinc-950'
                        : 'bg-white text-zinc-700 border-zinc-200 hover:border-zinc-400 hover:text-zinc-950'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <div className="w-full lg:max-w-sm space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-600">
                    {t.commissionWeight}{' '}
                    <span className="font-mono font-medium tabular-nums text-emerald-700">
                      {100 - salesWeightPct}%
                    </span>
                  </span>
                  <span className="text-zinc-600">
                    {t.salesWeight}{' '}
                    <span className="font-mono font-medium tabular-nums text-zinc-950">
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
                  className="w-full h-1.5 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-zinc-950"
                />
              </div>
            </div>

            {/* Live 7-Factor Weight Breakdown (Always Sums to 100) */}
            <div className="pt-3 border-t border-zinc-100 space-y-2">
              <div className="flex items-center justify-between text-[11px] text-zinc-500">
                <span className="font-medium text-zinc-700">{t.scoringStrategyActiveLabel}</span>
                <span className="font-mono font-semibold text-zinc-950 tabular-nums">
                  {t.scoringTotalWeightLabel}: {totalWeight}/100
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                {SCORING_FACTOR_ORDER.map((key) => (
                  <div
                    key={key}
                    className="px-2.5 py-2 rounded-lg bg-zinc-50 border border-zinc-200/70"
                  >
                    <div className="text-[11px] text-zinc-500 truncate" title={t.factorLabels[key]}>
                      {t.factorLabels[key]}
                    </div>
                    <div className="mt-0.5 font-mono text-sm font-semibold text-zinc-950 tabular-nums">
                      {liveWeights[key]}
                      <span className="text-[11px] font-normal text-zinc-400"> pts</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Interactive Selections: 1. Multi-Select Product Category + 2. Research Quantity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* 1. Product Category (Multi-Select with Verified IDs) */}
        <div className="lg:col-span-6 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-zinc-700">{t.settingCategoryLabel}</span>
            {!bothSelected && (
              <button
                type="button"
                onClick={onSelectBothCategories}
                className="text-xs font-medium text-zinc-500 hover:text-zinc-950 transition-colors cursor-pointer"
              >
                {t.selectBothAction}
              </button>
            )}
          </div>

          <div
            className="grid grid-cols-1 sm:grid-cols-2 gap-2"
            role="group"
            aria-label={t.settingCategoryLabel}
          >
            {(
              [
                {
                  id: 'womens-fashion' as const,
                  label: t.categoryFashion,
                  catId: VERIFIED_TH_CATEGORY_IDS['womens-fashion'],
                  selected: hasFashion,
                },
                {
                  id: 'cosmetics-beauty' as const,
                  label: t.categoryBeauty,
                  catId: VERIFIED_TH_CATEGORY_IDS['cosmetics-beauty'],
                  selected: hasBeauty,
                },
              ]
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                role="checkbox"
                aria-checked={item.selected}
                onClick={() => onToggleCategory(item.id)}
                className={`min-h-[44px] px-3.5 py-2 rounded-lg border text-left flex items-center justify-between gap-2 transition-all cursor-pointer ${
                  item.selected
                    ? 'bg-zinc-950 text-white border-zinc-950'
                    : 'bg-white text-zinc-700 border-zinc-200 hover:border-zinc-400 hover:text-zinc-950'
                }`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-4 h-4 rounded-sm border flex items-center justify-center shrink-0 ${
                      item.selected
                        ? 'bg-white text-zinc-950 border-white'
                        : 'border-zinc-300 bg-white'
                    }`}
                    aria-hidden="true"
                  >
                    {item.selected && <Check className="w-3 h-3 stroke-[2.5]" />}
                  </span>
                  <span className="text-xs sm:text-sm font-medium truncate">{item.label}</span>
                </span>
                <span
                  className={`font-mono text-[11px] tabular-nums shrink-0 ${
                    item.selected ? 'text-zinc-300' : 'text-zinc-400'
                  }`}
                >
                  {item.catId}
                </span>
              </button>
            ))}
          </div>

          {noCategorySelected && (
            <p className="text-xs text-amber-700">{t.noCategorySelectedWarning}</p>
          )}

          {/* Combined vs Split Mode (Only shown when Both Categories are selected) */}
          {bothSelected && (
            <div className="pt-1 space-y-1.5">
              <div className="text-[11px] font-medium text-zinc-500">{t.bothModeLabel}</div>
              <div
                className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 p-1 bg-zinc-100 rounded-lg"
                role="radiogroup"
                aria-label={t.bothModeLabel}
              >
                {(
                  [
                    {
                      id: 'combined' as const,
                      label: t.bothModeCombined,
                      desc: t.bothModeCombinedDesc,
                    },
                    {
                      id: 'split' as const,
                      label: t.bothModeSplit,
                      desc: t.bothModeSplitDesc,
                    },
                  ]
                ).map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    role="radio"
                    aria-checked={bothCategoryMode === mode.id}
                    onClick={() => onBothCategoryModeChange(mode.id)}
                    className={`px-2.5 py-1.5 rounded-md text-left transition-all cursor-pointer ${
                      bothCategoryMode === mode.id
                        ? 'bg-white text-zinc-950 shadow-xs'
                        : 'text-zinc-600 hover:text-zinc-950'
                    }`}
                  >
                    <div className="text-xs font-medium">{mode.label}</div>
                    <div className="text-[11px] text-zinc-500 leading-snug mt-0.5">
                      {mode.desc}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 2. Research Quantity (Presets 10/20/30 + Custom Input) */}
        <div className="lg:col-span-6 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="custom-quantity-input" className="text-xs font-medium text-zinc-700">
              {t.settingQuantityLabel}
            </label>
            <span className="text-[11px] text-zinc-400">{t.customQuantityHint}</span>
          </div>

          <div className="flex flex-wrap sm:flex-nowrap items-stretch gap-2">
            <div
              className="grid grid-cols-3 gap-1.5 p-1 bg-zinc-100 rounded-lg flex-1 min-w-[200px]"
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
                      ? 'bg-white text-zinc-950 shadow-xs'
                      : 'text-zinc-600 hover:text-zinc-950'
                  }`}
                >
                  {qty}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-zinc-200 rounded-lg focus-within:border-zinc-900 min-h-[44px] w-full sm:w-40 shrink-0">
              <span className="text-[11px] text-zinc-500 whitespace-nowrap">
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
                className="w-full text-right font-mono text-sm font-medium text-zinc-950 tabular-nums bg-transparent focus:outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 3. Research Mode Selector (Fast / Balanced / Deep Research) */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-zinc-700">{t.researchModeLabel}</span>
          {plan.usesGeminiAnalysis && (
            <span className="text-[11px] text-emerald-700 font-medium">
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
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onResearchModeChange(item.id)}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                  active
                    ? 'bg-zinc-950 text-white border-zinc-950'
                    : 'bg-white text-zinc-800 border-zinc-200 hover:border-zinc-400'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs sm:text-sm font-semibold">{item.title}</span>
                    <span
                      className={`font-mono text-xs font-semibold tabular-nums ${
                        active
                          ? modeExceedsLimit
                            ? 'text-red-300'
                            : 'text-emerald-300'
                          : modeExceedsLimit
                            ? 'text-red-700'
                            : 'text-zinc-900'
                      }`}
                    >
                      {formatCredits(item.modePlan.estimatedCredits)} cr
                    </span>
                  </div>
                  <p
                    className={`text-[11px] leading-relaxed ${
                      active ? 'text-zinc-300' : 'text-zinc-500'
                    }`}
                  >
                    {item.desc}
                  </p>
                </div>

                <div
                  className={`font-mono text-[11px] tabular-nums pt-1 border-t ${
                    active
                      ? 'border-zinc-800 text-zinc-400'
                      : 'border-zinc-100 text-zinc-400'
                  }`}
                >
                  {item.modePlan.plannedApiCalls} {t.plannedCallsLabel} · ≈{' '}
                  {formatUsd(item.modePlan.estimatedUsd)}
                </div>
              </button>
            );
          })}
        </div>

        {/* Inline Deep Research Cost-Cap Controls (Only visible when Deep Research is selected) */}
        {researchMode === 'deep' && (
          <div className="p-3.5 bg-zinc-50/90 border border-zinc-200/80 rounded-xl flex flex-col lg:flex-row lg:items-center justify-between gap-3.5">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-zinc-800">
                  {t.deepDiveCountLabel}
                </span>
                <div className="inline-flex items-center gap-1 p-0.5 bg-zinc-200/70 rounded-lg">
                  {DEEP_DIVE_PRESETS.filter((preset) => preset <= maxAllowedDeepDive).map(
                    (preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => onDeepDiveCountChange(preset)}
                        className={`px-2.5 py-1 text-xs font-mono tabular-nums font-medium rounded-md transition-colors cursor-pointer ${
                          effectiveDeepDiveCap === preset
                            ? 'bg-white text-zinc-950 shadow-xs'
                            : 'text-zinc-600 hover:text-zinc-950'
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
                    className="w-12 px-1.5 py-1 text-right font-mono text-xs font-semibold text-zinc-950 bg-white border border-zinc-200 rounded-md tabular-nums focus:outline-none focus:border-zinc-900"
                  />
                </div>
              </div>
              <p className="text-[11px] text-zinc-500">{t.deepDiveCountHint}</p>
            </div>

            <label className="flex items-start gap-2.5 cursor-pointer select-none lg:border-l lg:border-zinc-200 lg:pl-4">
              <input
                type="checkbox"
                checked={includeReviewInsights}
                onChange={(e) => onIncludeReviewInsightsChange(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded-sm border-zinc-300 accent-zinc-950 cursor-pointer shrink-0"
              />
              <span className="space-y-0.5">
                <span className="block text-xs font-medium text-zinc-800">
                  {t.includeReviewInsightsLabel}{' '}
                  <span className="font-mono text-[11px] text-amber-700">
                    (+{formatCredits(Math.min(effectiveDeepDiveCap, DEEP_COMMENT_INSIGHT_CAP))} cr)
                  </span>
                </span>
                <span className="block text-[11px] text-zinc-500">
                  {t.includeReviewInsightsDesc}
                </span>
              </span>
            </label>
          </div>
        )}
      </div>

      {/* 4. Cost Preview & 5. Spending Limit Protection */}
      <div className="bg-zinc-50/80 border border-zinc-200/80 rounded-xl p-4 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Estimated Cost (Before Call) + Actual Cost (After Last Run — Clearly Separated) */}
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-900">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-700 shrink-0" aria-hidden="true" />
              <span>{t.costPreviewHeading}</span>
            </div>

            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs">
              <div>
                <span className="text-zinc-500 mr-1.5">{t.estimatedCostLabel}:</span>
                <span
                  className={`font-mono text-sm font-semibold tabular-nums ${
                    exceedsLimit ? 'text-red-700' : 'text-zinc-950'
                  }`}
                >
                  {formatCredits(plan.estimatedCredits)} {t.creditsUnit}
                </span>
                <span className="ml-1.5 font-mono text-zinc-500 tabular-nums">
                  (≈ {formatUsd(plan.estimatedUsd)} · {plan.plannedApiCalls} {t.plannedCallsLabel})
                </span>
              </div>

              {lastCostSummary && (
                <div className="pl-0 sm:pl-4 sm:border-l border-zinc-200">
                  <span className="text-zinc-500 mr-1.5">{t.actualCostLabel}:</span>
                  {lastCostSummary.actualCredits !== null ? (
                    <span className="font-mono text-xs font-semibold text-emerald-700 tabular-nums">
                      {formatCredits(lastCostSummary.actualCredits)} {t.creditsUnit}
                      {lastCostSummary.actualUsd !== null
                        ? ` (≈ ${formatUsd(lastCostSummary.actualUsd)} · ${lastCostSummary.actualApiCalls} ${t.actualCallsLabel})`
                        : ''}
                    </span>
                  ) : (
                    <span className="text-zinc-400">{t.actualCostUnavailable}</span>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] font-mono text-zinc-600 tabular-nums">
              <span>{modeSummary}</span>
              <span aria-hidden="true">·</span>
              <span>{callBreakdownText}</span>
            </div>

            <p className="text-[11px] text-zinc-500">{t.pricingFormulaNote}</p>
          </div>

          {/* User Spending Limit Control */}
          <div className="flex items-center justify-between md:justify-end gap-2.5 shrink-0">
            <label
              htmlFor="spending-limit-input"
              className="text-xs font-medium text-zinc-700 whitespace-nowrap"
            >
              {t.spendingLimitLabel}
            </label>
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 bg-white border rounded-lg w-32 ${
                exceedsLimit
                  ? 'border-red-400 focus-within:border-red-600'
                  : 'border-zinc-200 focus-within:border-zinc-900'
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
                className="w-full text-right font-mono text-sm font-semibold text-zinc-950 tabular-nums bg-transparent focus:outline-none"
              />
              <span className="text-[11px] text-zinc-400 font-mono">cr</span>
            </div>
          </div>
        </div>

        {/* Hard Spending Limit Block Notice */}
        {exceedsLimit && (
          <div
            role="alert"
            className="flex items-start gap-2.5 p-3 bg-red-50/80 border border-red-200 rounded-lg text-xs text-red-800"
          >
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <div className="font-semibold">{t.spendingLimitExceededTitle}</div>
              <p className="mt-0.5 text-red-700/90 leading-relaxed">
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
          className="p-4 bg-zinc-950 text-white rounded-xl space-y-3"
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
      <div className="pt-5 border-t border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <p className="text-xs text-zinc-500 leading-relaxed">
          {modeSummary} · {categorySummary} · {strategySummary} ·{' '}
          <span className="font-mono tabular-nums text-zinc-800">
            {quantity} {t.quantityProductsUnit}
          </span>
        </p>

        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={!canRequestStart}
          className="inline-flex items-center justify-center gap-2 min-h-[44px] px-6 py-2.5 text-sm font-medium text-white bg-zinc-950 rounded-lg hover:bg-zinc-800 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer whitespace-nowrap shrink-0 w-full sm:w-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2"
        >
          {isHunting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              <span>{t.huntingInProgress}</span>
            </>
          ) : (
            <>
              <span>{quotaStatus.paused ? t.resumeAndStartBtn : t.startHuntingBtn}</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </>
          )}
        </button>
      </div>
    </section>
  );
}
