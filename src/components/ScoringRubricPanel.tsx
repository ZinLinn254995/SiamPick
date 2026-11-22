import { memo } from 'react';
import { ChevronDown, ChevronUp, Scale, SlidersHorizontal } from 'lucide-react';
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
  language,
}: ScoringRubricPanelProps) {
  const t = TRANSLATIONS[language];
  const isMy = language === 'my';
  const rubric = getScoringRubricForStrategy(salesWeightPct);
  const totalPoints = rubric.reduce((sum, item) => sum + item.maxPoints, 0);
  const maxFactorPoints = Math.max(1, ...rubric.map((item) => item.maxPoints));
  const activePreset = providedPreset ?? deriveStrategyPresetFromWeight(salesWeightPct);
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

  return (
    <div className="mt-4 sp-card overflow-hidden">
      {hasInteractiveStrategy ? (
        <div className="px-4 sm:px-5 py-3 space-y-3">
          {/* Top Bar: Scoring Engine Title + 7-Factor Rubric Toggle */}
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-start sm:items-center gap-2.5 min-w-0">
              <Scale
                className="w-4 h-4 text-zinc-600 dark:text-zinc-400 shrink-0 mt-0.5 sm:mt-0"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                  {t.scoringPanelTitle}
                </span>
                <span
                  className="hidden sm:inline text-xs text-zinc-400 dark:text-zinc-500 mx-2"
                  aria-hidden="true"
                >
                  ·
                </span>
                <span className="block sm:inline text-xs text-zinc-600 dark:text-zinc-400">
                  {strategyLabel} ·{' '}
                  <span className="font-mono tabular-nums">
                    {totalPoints} {pointsUnit}
                  </span>
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onToggle}
              aria-expanded={isOpen}
              className="inline-flex items-center gap-1.5 min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-50 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <span>{t.scoringRubricDetailsBtn}</span>
              {isOpen ? (
                <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
              )}
            </button>
          </div>

          {/* Integrated Strategy Presets + Weight Slider (Single Unified Control Bar) */}
          <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/80 flex flex-col xl:flex-row xl:items-center justify-between gap-3.5">
            <div
              className="flex flex-wrap items-center gap-2 min-w-0"
              role="group"
              aria-label={t.strategyLabel}
            >
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-800 dark:text-zinc-200 mr-1">
                <SlidersHorizontal
                  className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400 shrink-0"
                  aria-hidden="true"
                />
                <span>{t.strategyLabel}</span>
              </span>
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
                  onClick={() => onSelectStrategyPreset?.(preset.id)}
                  className={`min-h-[40px] max-w-full px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-normal sm:whitespace-nowrap text-left leading-snug ${
                    activePreset === preset.id
                      ? 'bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950 border-zinc-950 dark:border-zinc-100'
                      : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-zinc-950 dark:hover:text-zinc-50'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="w-full xl:w-72 space-y-1 shrink-0">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-500 dark:text-zinc-400">
                  {t.commissionWeight}{' '}
                  <strong className="font-mono text-emerald-700 dark:text-emerald-400 tabular-nums">
                    {100 - salesWeightPct}%
                  </strong>
                </span>
                <span className="text-zinc-500 dark:text-zinc-400">
                  {t.salesWeight}{' '}
                  <strong className="font-mono text-zinc-950 dark:text-zinc-50 tabular-nums">
                    {salesWeightPct}%
                  </strong>
                </span>
              </div>
              <input
                type="range"
                min={10}
                max={90}
                step={5}
                value={salesWeightPct}
                onChange={(e) => onCustomWeightChange?.(Number(e.target.value))}
                aria-label={t.strategyLabel}
                className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-zinc-950 dark:accent-zinc-100"
              />
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          className="w-full min-h-[44px] px-4 sm:px-5 py-3 flex items-center justify-between gap-3 text-left hover:bg-zinc-50/80 dark:hover:bg-zinc-800/60 transition-colors cursor-pointer"
        >
          <div className="flex items-start sm:items-center gap-2.5 min-w-0">
            <Scale className="w-4 h-4 text-zinc-600 dark:text-zinc-400 shrink-0 mt-0.5 sm:mt-0" aria-hidden="true" />
            <div className="min-w-0">
              <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                {t.scoringPanelTitle}
              </span>
              <span className="hidden sm:inline text-xs text-zinc-400 dark:text-zinc-500 mx-2" aria-hidden="true">
                ·
              </span>
              <span className="block sm:inline text-xs text-zinc-600 dark:text-zinc-400">
                {strategyLabel} ·{' '}
                <span className="font-mono tabular-nums">
                  {totalPoints} {pointsUnit}
                </span>
              </span>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400 shrink-0 whitespace-nowrap">
            {isOpen ? (
              <ChevronUp className="w-4 h-4" aria-hidden="true" />
            ) : (
              <ChevronDown className="w-4 h-4" aria-hidden="true" />
            )}
          </span>
        </button>
      )}

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

