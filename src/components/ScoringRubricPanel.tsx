import { memo } from 'react';
import {
  ChevronDown,
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
  className = 'mt-3 sm:mt-4',
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

  const topRimGradient =
    activePreset === 'commission-first'
      ? 'from-emerald-500 via-teal-400 to-cyan-500'
      : activePreset === 'sales-first'
        ? 'from-cyan-500 via-sky-400 to-indigo-500'
        : 'from-emerald-500 via-cyan-500 to-indigo-500';

  const thumbTrackSplitPct = Math.max(0, Math.min(100, ((salesWeightPct - 10) / 80) * 100));

  return (
    <div
      className={`${className} relative rounded-2xl overflow-hidden border border-zinc-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs`}
    >
      {/* Strategy-Reactive Top Gradient Rim + Subtle Glow */}
      <div
        aria-hidden="true"
        className={`h-[2px] w-full bg-gradient-to-r transition-all duration-300 ${topRimGradient}`}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(ellipse_at_top_left,rgba(16,185,129,0.06),transparent_55%),radial-gradient(ellipse_at_top_right,rgba(6,182,212,0.06),transparent_55%)] dark:bg-[radial-gradient(ellipse_at_top_left,rgba(16,185,129,0.11),transparent_55%),radial-gradient(ellipse_at_top_right,rgba(6,182,212,0.11),transparent_55%)]"
      />

      {hasInteractiveStrategy && (
        <div className="relative px-3.5 sm:px-5 py-3 sm:py-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-6 lg:items-end">
            {/* Left: Sliding Pill 3-Option Strategy Switcher */}
            <div className="lg:col-span-7 space-y-2 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                  <SlidersHorizontal
                    className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0"
                    aria-hidden="true"
                  />
                  <span>{t.strategyLabel}</span>
                </div>
                <span className="font-mono text-[11px] font-semibold tabular-nums text-zinc-500 dark:text-zinc-400 sm:hidden">
                  {commissionWeightPct}/{salesWeightPct}
                </span>
              </div>

              <div
                className="relative grid grid-cols-3 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-800/90 border border-zinc-200/70 dark:border-zinc-700/60"
                role="group"
                aria-label={t.strategyLabel}
              >
                {(() => {
                  const activeIndex = Math.max(
                    0,
                    presetOptions.findIndex((p) => p.id === activePreset)
                  );
                  const sliderColorClass =
                    activePreset === 'commission-first'
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-500 dark:from-emerald-400 dark:to-teal-400 shadow-sm shadow-emerald-600/20'
                      : activePreset === 'sales-first'
                        ? 'bg-gradient-to-r from-cyan-600 to-sky-500 dark:from-cyan-400 dark:to-sky-400 shadow-sm shadow-cyan-600/20'
                        : 'bg-white dark:bg-zinc-900 shadow-xs border border-zinc-200/80 dark:border-zinc-700/80';

                  return (
                    <div
                      aria-hidden="true"
                      className={`pointer-events-none absolute top-1 bottom-1 left-1 w-[calc((100%-8px)/3)] rounded-lg transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${sliderColorClass}`}
                      style={{ transform: `translateX(${activeIndex * 100}%)` }}
                    />
                  );
                })()}
                {presetOptions.map((preset) => {
                  const isActive = activePreset === preset.id;
                  const activeTextClass =
                    preset.id === 'balanced'
                      ? 'text-zinc-950 dark:text-zinc-50 font-semibold'
                      : 'text-white dark:text-zinc-950 font-semibold';
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => onSelectStrategyPreset?.(preset.id)}
                      className={`relative z-10 min-h-[42px] sm:min-h-[38px] px-1.5 sm:px-2 py-1.5 text-[11px] sm:text-xs rounded-lg flex items-center justify-center text-center leading-snug transition-colors duration-150 cursor-pointer min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-200 ${
                        isActive
                          ? activeTextClass
                          : 'text-zinc-600 dark:text-zinc-400 font-medium hover:text-zinc-950 dark:hover:text-zinc-100'
                      }`}
                    >
                      <span className="text-balance">{preset.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right: Live Dual-Tone Balance Slider */}
            <div className="lg:col-span-5 space-y-1 min-w-0">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span
                  className={`whitespace-nowrap transition-colors ${
                    commissionWeightPct > salesWeightPct
                      ? 'font-bold text-emerald-700 dark:text-emerald-400'
                      : 'font-medium text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  {shortCommissionLabel}{' '}
                  <span className="font-mono font-bold tabular-nums">
                    {commissionWeightPct}%
                  </span>
                </span>
                <span
                  className={`whitespace-nowrap transition-colors ${
                    salesWeightPct > commissionWeightPct
                      ? 'font-bold text-cyan-700 dark:text-cyan-400'
                      : 'font-medium text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  {shortSalesLabel}{' '}
                  <span className="font-mono font-bold tabular-nums">
                    {salesWeightPct}%
                  </span>
                </span>
              </div>

              <div className="relative flex items-center">
                {/* Dual-Color Underlying Track (Emerald Commission <-> Cyan Sales) */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden"
                >
                  <div
                    className="h-full w-full rounded-full"
                    style={{
                      background: `linear-gradient(90deg, rgba(16,185,129,0.88) 0%, rgba(20,184,166,0.75) ${Math.max(0, thumbTrackSplitPct - 8)}%, rgba(6,182,212,0.85) ${Math.min(100, thumbTrackSplitPct + 8)}%, rgba(14,165,233,0.92) 100%)`,
                    }}
                  />
                </div>
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-1/2 -translate-x-1/2 w-0.5 h-3 rounded-full bg-white/80 dark:bg-zinc-950/80 z-[5]"
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
        className={`relative w-full min-h-[44px] px-3.5 sm:px-5 py-2.5 flex items-center justify-between gap-2.5 text-left hover:bg-zinc-50/80 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500 ${
          hasInteractiveStrategy ? 'border-t border-zinc-200/70 dark:border-zinc-800/80' : ''
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <Scale
            className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0"
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
          <ChevronDown
            className={`w-4 h-4 shrink-0 transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
              isOpen ? 'rotate-180' : 'rotate-0'
            }`}
            aria-hidden="true"
          />
        </span>
      </button>

      {isOpen && (
        <div className="relative px-3.5 sm:px-5 pb-4 pt-3.5 border-t border-zinc-200/70 dark:border-zinc-800/80 grid grid-cols-1 lg:grid-cols-12 gap-5 sp-rise-in">
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
              <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                {t.scoringTotalWeightLabel}: {totalPoints}/100
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
              {rubric.map((spec, idx) => {
                const barScale = Math.max(0, Math.min(1, spec.maxPoints / maxFactorPoints));
                const isHighWeight = spec.maxPoints >= 20;
                return (
                  <div
                    key={spec.key}
                    className="py-1.5 border-b border-zinc-100 dark:border-zinc-800/70 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span
                        className="text-zinc-800 dark:text-zinc-200 truncate"
                        title={t.factorLabels[spec.key]}
                      >
                        <span className="font-mono text-zinc-400 dark:text-zinc-500 mr-1.5 tabular-nums">
                          0{idx + 1}.
                        </span>
                        {t.factorShortLabels[spec.key]}
                      </span>
                      <span
                        className={`font-mono font-bold tabular-nums shrink-0 ${
                          isHighWeight
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-zinc-900 dark:text-zinc-100'
                        }`}
                      >
                        {spec.maxPoints} {pointsUnit}
                      </span>
                    </div>
                    <div
                      className="h-1.5 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden"
                      aria-hidden="true"
                    >
                      <div
                        className={`h-full w-full rounded-full origin-left transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
                          isHighWeight
                            ? 'bg-gradient-to-r from-emerald-500 to-cyan-400'
                            : 'bg-gradient-to-r from-zinc-500 to-zinc-400 dark:from-zinc-400 dark:to-zinc-500'
                        }`}
                        style={{ transform: `scaleX(${barScale})` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3 Recommendation Tiers + Info Popover for Disclaimers */}
          <div className="lg:col-span-5 space-y-2.5 lg:border-l lg:border-zinc-200/70 dark:lg:border-zinc-800/80 lg:pl-6">
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
                  <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100 tabular-nums shrink-0">
                    {t.scoringTierRanges[tier]}
                  </span>
                  <span className={`font-semibold text-right ${tierTextColor(tier)}`}>
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
