import { ChevronDown, ChevronUp, Scale } from 'lucide-react';
import { Language, ScoreTier } from '../types/product';
import { SCORING_RUBRIC } from '../utils/scoring';
import { TRANSLATIONS } from '../i18n/translations';

interface ScoringRubricPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  language: Language;
}

const TIER_ORDER: ScoreTier[] = ['priority-test', 'investigate-further', 'low-priority'];

export function ScoringRubricPanel({
  isOpen,
  onToggle,
  language,
}: ScoringRubricPanelProps) {
  const t = TRANSLATIONS[language];

  const tierTextColor = (tier: ScoreTier) => {
    if (tier === 'priority-test') return 'text-emerald-700';
    if (tier === 'investigate-further') return 'text-amber-700';
    return 'text-zinc-600';
  };

  return (
    <div className="mt-4 bg-white border border-zinc-200/90 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="w-full px-4 sm:px-5 py-3 flex items-center justify-between gap-4 text-left hover:bg-zinc-50/80 transition-colors cursor-pointer"
      >
        <div className="flex items-start sm:items-center gap-2.5 min-w-0">
          <Scale className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5 sm:mt-0" aria-hidden="true" />
          <div className="min-w-0">
            <span className="text-xs font-semibold text-zinc-900">
              {t.scoringPanelTitle}
            </span>
            <span className="hidden sm:inline text-xs text-zinc-400 mx-2" aria-hidden="true">
              ·
            </span>
            <span className="block sm:inline text-xs text-zinc-500">
              {t.scoringDisclaimer}
            </span>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-zinc-600 shrink-0 whitespace-nowrap">
          {isOpen ? (
            <ChevronUp className="w-4 h-4" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-4 h-4" aria-hidden="true" />
          )}
        </span>
      </button>

      {isOpen && (
        <div className="px-4 sm:px-5 pb-5 pt-4 border-t border-zinc-100 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* 7 Criteria Breakdown (100 Points Total) */}
          <div className="lg:col-span-7 space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
              {SCORING_RUBRIC.map((spec, idx) => (
                <div
                  key={spec.key}
                  className="flex items-center justify-between gap-3 py-1.5 border-b border-zinc-100 text-xs"
                >
                  <span className="text-zinc-700 truncate">
                    <span className="font-mono text-zinc-400 mr-1.5 tabular-nums">
                      0{idx + 1}.
                    </span>
                    {t.criterionLabels[spec.key]}
                  </span>
                  <span className="font-mono font-semibold text-zinc-950 tabular-nums shrink-0">
                    {spec.maxPoints} pts
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-zinc-500 leading-relaxed pt-1">
              {t.scoringVerificationRule}
            </p>
          </div>

          {/* 3 Recommendation Tiers + Evaluation Reminder */}
          <div className="lg:col-span-5 space-y-3 lg:border-l lg:border-zinc-100 lg:pl-6">
            <div className="space-y-2">
              {TIER_ORDER.map((tier) => (
                <div
                  key={tier}
                  className="flex items-baseline justify-between gap-3 text-xs py-1 border-b border-zinc-100 last:border-b-0"
                >
                  <span className="font-mono font-semibold text-zinc-900 tabular-nums shrink-0">
                    {t.scoringTierRanges[tier]}
                  </span>
                  <span className={`font-medium text-right ${tierTextColor(tier)}`}>
                    {t.scoringTierLabels[tier]}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-zinc-500 leading-relaxed">
              {t.scoringPairReminder}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
