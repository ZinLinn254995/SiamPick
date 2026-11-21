import { ChevronDown, ChevronUp, Scale } from 'lucide-react';
import { Language, ScoreTier } from '../types/product';
import { deriveStrategyPresetFromWeight, getScoringRubricForStrategy } from '../utils/scoring';
import { TRANSLATIONS } from '../i18n/translations';
import { InfoPopover } from './InfoPopover';

interface ScoringRubricPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  salesWeightPct: number;
  language: Language;
}

const TIER_ORDER: ScoreTier[] = ['priority-test', 'investigate-further', 'low-priority'];

export function ScoringRubricPanel({
  isOpen,
  onToggle,
  salesWeightPct,
  language,
}: ScoringRubricPanelProps) {
  const t = TRANSLATIONS[language];
  const rubric = getScoringRubricForStrategy(salesWeightPct);
  const totalPoints = rubric.reduce((sum, item) => sum + item.maxPoints, 0);
  const activePreset = deriveStrategyPresetFromWeight(salesWeightPct);
  const strategyLabel =
    activePreset === 'sales-first'
      ? t.strategySales
      : activePreset === 'commission-first'
        ? t.strategyCommission
        : t.strategyBalanced;

  const tierTextColor = (tier: ScoreTier) => {
    if (tier === 'priority-test') return 'text-emerald-700 dark:text-emerald-400';
    if (tier === 'investigate-further') return 'text-amber-700 dark:text-amber-400';
    return 'text-zinc-600 dark:text-zinc-400';
  };

  return (
    <div className="mt-4 bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="w-full px-4 sm:px-5 py-3 flex items-center justify-between gap-4 text-left hover:bg-zinc-50/80 dark:hover:bg-zinc-800/70 transition-colors cursor-pointer"
      >
        <div className="flex items-start sm:items-center gap-2.5 min-w-0">
          <Scale className="w-4 h-4 text-zinc-500 dark:text-zinc-400 shrink-0 mt-0.5 sm:mt-0" aria-hidden="true" />
          <div className="min-w-0">
            <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
              {t.scoringPanelTitle}
            </span>
            <span className="hidden sm:inline text-xs text-zinc-400 dark:text-zinc-500 mx-2" aria-hidden="true">
              ·
            </span>
            <span className="block sm:inline text-xs text-zinc-500 dark:text-zinc-400">
              {strategyLabel} ({totalPoints} pts)
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

      {isOpen && (
        <div className="px-4 sm:px-5 pb-5 pt-4 border-t border-zinc-100 dark:border-zinc-800/70 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* 7 Live Strategy-Weighted Factors (Always Totaling 100 Points) */}
          <div className="lg:col-span-7 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs pb-1">
              <div className="inline-flex items-center gap-1.5">
                <span className="font-medium text-zinc-800 dark:text-zinc-200">
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
              {rubric.map((spec, idx) => (
                <div
                  key={spec.key}
                  className="flex items-center justify-between gap-3 py-1.5 border-b border-zinc-100 dark:border-zinc-800/70 text-xs"
                >
                  <span className="text-zinc-700 dark:text-zinc-300 truncate">
                    <span className="font-mono text-zinc-400 dark:text-zinc-500 mr-1.5 tabular-nums">
                      0{idx + 1}.
                    </span>
                    {t.factorLabels[spec.key]}
                  </span>
                  <span className="font-mono font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums shrink-0">
                    {spec.maxPoints} pts
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 3 Recommendation Tiers + Info Popover for Disclaimers */}
          <div className="lg:col-span-5 space-y-2.5 lg:border-l lg:border-zinc-100 dark:lg:border-zinc-800/70 lg:pl-6">
            <div className="flex items-center gap-1.5 text-xs pb-1">
              <span className="font-medium text-zinc-800 dark:text-zinc-200">
                {language === 'my' ? 'အဆင့်သတ်မှတ်ချက်များ' : 'Score Tiers'}
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
                  className="flex items-baseline justify-between gap-3 text-xs py-1 border-b border-zinc-100 dark:border-zinc-800/70 last:border-b-0"
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
}

