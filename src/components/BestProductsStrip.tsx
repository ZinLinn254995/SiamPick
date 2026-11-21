import { useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  GitCompareArrows,
} from 'lucide-react';
import {
  BestProductSelectionItem,
  Language,
  ResearchProduct,
} from '../types/product';
import { TRANSLATIONS } from '../i18n/translations';
import { InfoPopover } from './InfoPopover';

interface BestProductsStripProps {
  selections: BestProductSelectionItem[];
  comparedIds: Set<string>;
  onOpenReport: (product: ResearchProduct) => void;
  onToggleCompare: (product: ResearchProduct) => void;
  language: Language;
}

export function BestProductsStrip({
  selections,
  comparedIds,
  onOpenReport,
  onToggleCompare,
  language,
}: BestProductsStripProps) {
  const [expanded, setExpanded] = useState(true);
  const t = TRANSLATIONS[language];
  const isMy = language === 'my';

  if (selections.length === 0) return null;

  return (
    <div className="mt-4 bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-xl overflow-hidden">
      <div className="px-4 sm:px-5 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            aria-expanded={expanded}
            className="text-left font-display text-xs sm:text-sm font-semibold text-zinc-950 dark:text-zinc-50 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors cursor-pointer truncate"
          >
            {t.bestSelectionHeading}
          </button>
          <InfoPopover
            variant="info"
            label={t.bestSelectionHeading}
            title={t.bestSelectionHeading}
            content={t.bestSelectionSubtitle}
          />
        </div>
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          className="inline-flex items-center gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50 transition-colors cursor-pointer shrink-0 whitespace-nowrap py-1"
        >
          <span>{expanded ? t.bestSelectionHide : t.bestSelectionShow}</span>
          {expanded ? (
            <ChevronUp className="w-4 h-4" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-4 h-4" aria-hidden="true" />
          )}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-zinc-100 dark:border-zinc-800/70 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 divide-y md:divide-y-0 md:gap-px md:bg-zinc-100 dark:md:bg-zinc-800">
          {selections.map((item) => {
            const categoryTitle = t.bestSelectionCategories[item.category];
            const product = item.product;
            const isSelectedForCompare = product ? comparedIds.has(product.id) : false;

            return (
              <div
                key={item.category}
                className="bg-white dark:bg-zinc-900 p-4 flex flex-col justify-between gap-3"
              >
                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">{categoryTitle}</span>
                    <span
                      className={`font-mono text-[11px] tabular-nums shrink-0 ${
                        item.insufficientData ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400 font-medium'
                      }`}
                    >
                      {isMy ? item.metricSummaryMy : item.metricSummaryEn}
                    </span>
                  </div>

                  {product ? (
                    <>
                      <button
                        type="button"
                        onClick={() => onOpenReport(product)}
                        className="text-left cursor-pointer group/best focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-200 rounded-sm"
                      >
                        <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-50 line-clamp-1 group-hover/best:underline">
                          {isMy ? product.nameMy : product.name}
                        </div>
                      </button>
                      <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                        {isMy ? item.reasonMy : item.reasonEn}
                      </p>
                    </>
                  ) : (
                    <div className="pt-0.5 flex items-start gap-2 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                      <AlertCircle
                        className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                      <span>
                        {isMy
                          ? item.insufficientReasonMy ?? item.reasonMy
                          : item.insufficientReasonEn ?? item.reasonEn}
                      </span>
                    </div>
                  )}
                </div>

                {product && (
                  <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/70 flex items-center justify-between gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => onOpenReport(product)}
                      className="inline-flex items-center gap-1 font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-50 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <span>{t.cardOpenReport}</span>
                      <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>

                    <button
                      type="button"
                      onClick={() => onToggleCompare(product)}
                      aria-pressed={isSelectedForCompare}
                      className={`inline-flex items-center gap-1 font-medium transition-colors cursor-pointer whitespace-nowrap ${
                        isSelectedForCompare
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50'
                      }`}
                    >
                      <GitCompareArrows className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>
                        {isSelectedForCompare ? t.compareSelectedBtn : t.compareSelectBtn}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
