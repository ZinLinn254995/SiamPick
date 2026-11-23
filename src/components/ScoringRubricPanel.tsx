import { memo } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Scale,
  SlidersHorizontal,
} from 'lucide-react';
import { Language, ScoreTier, StrategyPreset } from '../types/product';
import { deriveStrategyPresetFromWeight, getScoringRubricForStrategy } from '../utils/scoring';
import { TRANSLATIONS } from '../i18n/translations';
import { InfoPopover } from './InfoPopover';

interface ScoringRubricPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  salesWeightPct: number;
  strategyPreset?: StrategyPreset;
  onSelectStrategyPreset?: (preset: StrategyPreset) => void;
  onCustomWeightChange?: (weight: number) => void;
  showStrategyControls?: boolean;
  className?: string;
  language: Language;
}

const TIER_ORDER: ScoreTier[] = ['priority-test', 'investigate-further', 'low-priority'];

export const ScoringRubricPanel = memo(function ScoringRubricPanel({
  isOpen,
  onToggle,
  salesWeightPct,
  strategyPreset: providedPreset,
  onSelectStrategyPreset,
  onCustomWeightChange,
  showStrategyControls = false,
  className = 'mt-4',
  language,
}: ScoringRubricPanelProps) {
  const t = TRANSLATIONS[language];
  const isMy = language === 'my';
  const rubric = getScoringRubricForStrategy(salesWeightPct);
  const totalPoints = rubric.reduce((sum, item) => sum + item.maxPoints, 0);
  const maxFactorPoints = Math.max(1, ...rubric.map((item) => item.maxPoints));
  const activePreset = providedPreset ?? deriveStrategyPresetFromWeight(salesWeightPct);
  const commissionWeightPct = 100 - salesWeightPct;
  const strategyLabel =
    activePreset === 'sales-first'
      ? t.strategySales
      : activePreset === 'commission-first'
        ? t.strategyCommission
        : t.strategyBalanced;
  const pointsUnit = isMy ? 'မှတ်' : 'pts';
  const hasInteractiveStrategy =
    showStrategyControls &&
    Boolean(onSelectStrategyPreset) &&
    Boolean(onCustomWeightChange);

  const tierTextColor = (tier: ScoreTier) => {
    if (tier === 'priority-test') return 'text-emerald-700 dark:text-emerald-400';
    if (tier === 'investigate-further') return 'text-amber-700 dark:text-amber-400';
    return 'text-zinc-600 dark:text-zinc-400';
  };

  // Ordered left-to-right to match the slider track (left = Commission Focus, right = Sales Focus)
  const presetOptions = [
    { id: 'commission-first' as const, label: t.strategyCommission },
    { id: 'balanced' as const, label: t.strategyBalanced },
    { id: 'sales-first' as const, label: t.strategySales },
  ];

  const shortCommissionLabel = isMy ? 'ကော်မရှင်' : 'Commission';
  const shortSalesLabel = isMy ? 'ရောင်းအား' : 'Sales';

  return (
    <div className={`${className} sp-card overflow-hidden`}>
      {hasInteractiveStrategy && (
        <div className="px-4 sm:px-5 py-3.5 sm:py-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 lg:gap-6 lg:items-end">
            {/* Left: Clean 3-Option Segmented Strategy Selector */}
            <div className="lg:col-span-7 space-y-2 min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                <SlidersHorizontal
                  className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400 shrink-0"
                  aria-hidden="true"
                />
                <span>{t.strategyLabel}</span>
              </div>

              <div
                className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-zinc-100 dark:bg-zinc-800/90"
                role="group"
                aria-label={t.strategyLabel}
              >
                {presetOptions.map((preset) => {
                  const isActive = activePreset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => onSelectStrategyPreset?.(preset.id)}
                      className={`min-h-[44px] sm:min-h-[38px] px-2 py-1.5 text-[11px] sm:text-xs rounded-md flex items-center justify-center text-center leading-snug transition-colors cursor-pointer min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-200 ${
                        isActive
                          ? 'bg-white dark:bg-zinc-900 text-zinc-950 dark:text-zinc-50 font-semibold shadow-xs'
                          : 'text-zinc-600 dark:text-zinc-400 font-medium hover:text-zinc-950 dark:hover:text-zinc-100'
                      }`}
                    >
                      <span className="text-balance">{preset.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right: Single Clean Balance Slider */}
            <div className="lg:col-span-5 space-y-1 min-w-0">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span
                  className={`whitespace-nowrap ${
                    commissionWeightPct > salesWeightPct
                      ? 'font-semibold text-emerald-700 dark:text-emerald-400'
                      : 'text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  {shortCommissionLabel}{' '}
                  <span className="font-mono font-semibold tabular-nums">
                    {commissionWeightPct}%
                  </span>
                </span>
                <span
                  className={`whitespace-nowrap ${
                    salesWeightPct > commissionWeightPct
                      ? 'font-semibold text-zinc-950 dark:text-zinc-50'
                      : 'text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  {shortSalesLabel}{' '}
                  <span className="font-mono font-semibold tabular-nums">
                    {salesWeightPct}%
                  </span>
                </span>
              </div>

              <div className="relative flex items-center">
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-1/2 -translate-x-1/2 w-0.5 h-2.5 rounded-full bg-zinc-400/70 dark:bg-zinc-500/70"
                />
                <input
                  type="range"
                  min={10}
                  max={90}
                  step={5}
                  value={salesWeightPct}
                  onChange={(e) => onCustomWeightChange?.(Number(e.target.value))}
                  aria-label={t.strategyLabel}
                  aria-valuemin={10}
                  aria-valuemax={90}
                  aria-valuenow={salesWeightPct}
                  aria-valuetext={`${t.commissionWeight} ${commissionWeightPct}%, ${t.salesWeight} ${salesWeightPct}%`}
                  className="sp-strategy-slider relative z-10"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Scoring Engine Accordion Header */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-label={`${t.scoringPanelTitle} — ${t.scoringRubricDetailsBtn}`}
        className={`w-full min-h-[46px] px-4 sm:px-5 py-2.5 flex items-center justify-between gap-2.5 text-left hover:bg-zinc-50/80 dark:hover:bg-zinc-800/60 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-200 ${
          hasInteractiveStrategy ? 'border-t border-zinc-100 dark:border-zinc-800/80' : ''
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <Scale
            className="w-4 h-4 text-zinc-500 dark:text-zinc-400 shrink-0"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-zinc-800 dark:text-zinc-200 leading-snug">
              {t.scoringPanelTitle}
            </div>
            {!hasInteractiveStrategy && (
              <div className="text-xs text-zinc-500 dark:text-zinc-400 whitespace-nowrap truncate">
                {strategyLabel} ·{' '}
                <span className="font-mono tabular-nums">
                  {totalPoints} {pointsUnit}
                </span>
              </div>
            )}
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 shrink-0 whitespace-nowrap">
          <span className="hidden sm:inline">{t.scoringRubricDetailsBtn}</span>
          {isOpen ? (
            <ChevronUp className="w-4 h-4 shrink-0" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-4 h-4 shrink-0" aria-hidden="true" />
          )}
        </span>
      </button>

      {isOpen && (
        <div className="px-4 sm:px-5 pb-4 pt-3.5 border-t border-zinc-100 dark:border-zinc-800/80 grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* 7 Live Strategy-Weighted Factors (Always Totaling 100 Points) */}
          <div className="lg:col-span-7 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs pb-1">
              <div className="inline-flex items-center gap-1.5">
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {t.scoringStrategyActiveLabel}: {strategyLabel}
                </span>
                <InfoPopover
                  variant="help"
                  label={t.scoringPanelTitle}
                  title={t.scoringPanelTitle}
                  content={t.scoringVerificationRule}
                />
              </div>
              <span className="font-mono font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums">
                {t.scoringTotalWeightLabel}: {totalPoints}/100
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
              {rubric.map((spec, idx) => {
                const barWidthPct = Math.round((spec.maxPoints / maxFactorPoints) * 100);
                return (
                  <div
                    key={spec.key}
                    className="py-1.5 border-b border-zinc-100 dark:border-zinc-800/70 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-zinc-800 dark:text-zinc-200 truncate" title={t.factorLabels[spec.key]}>
                        <span className="font-mono text-zinc-500 dark:text-zinc-400 mr-1.5 tabular-nums">
                          0{idx + 1}.
                        </span>
                        {t.factorShortLabels[spec.key]}
                      </span>
                      <span className="font-mono font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums shrink-0">
                        {spec.maxPoints} {pointsUnit}
                      </span>
                    </div>
                    <div className="h-1 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden" aria-hidden="true">
                      <div
                        className="h-full rounded-full bg-zinc-900 dark:bg-zinc-200 transition-[width] duration-200 motion-reduce:transition-none"
                        style={{ width: `${barWidthPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3 Recommendation Tiers + Info Popover for Disclaimers */}
          <div className="lg:col-span-5 space-y-2.5 lg:border-l lg:border-zinc-100 dark:lg:border-zinc-800/80 lg:pl-6">
            <div className="flex items-center gap-1.5 text-xs pb-1">
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                {isMy ? 'အဆင့်သတ်မှတ်ချက်များ' : 'Score Tiers'}
              </span>
              <InfoPopover
                variant="info"
                label={t.scoringPanelTitle}
                title={t.scoringPanelTitle}
                content={
                  <div className="space-y-1.5">
                    <p>{t.scoringDisclaimer}</p>
                    <p className="text-zinc-500 dark:text-zinc-400">{t.scoringPairReminder}</p>
                  </div>
                }
              />
            </div>
            <div className="space-y-2">
              {TIER_ORDER.map((tier) => (
                <div
                  key={tier}
                  className="flex items-baseline justify-between gap-3 text-xs py-1.5 border-b border-zinc-100 dark:border-zinc-800/70 last:border-b-0"
                >
                  <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums shrink-0">
                    {t.scoringTierRanges[tier]}
                  </span>
                  <span className={`font-medium text-right ${tierTextColor(tier)}`}>
                    {t.scoringTierLabels[tier]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

