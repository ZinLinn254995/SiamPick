import { memo, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  ChevronDown,
  GitCompareArrows,
  ImageOff,
  Percent,
  ShieldCheck,
  TrendingUp,
  Trophy,
  Users,
  Video,
} from 'lucide-react';
import {
  BestProductSelectionItem,
  BestSelectionCategory,
  Language,
  OpportunityEvaluation,
  ResearchProduct,
} from '../types/product';
import { TRANSLATIONS } from '../i18n/translations';
import { formatThb, resolveProductImageDisplayConfig } from '../utils/format';
import { evaluateProductOpportunity } from '../utils/scoring';
import { InfoPopover } from './InfoPopover';
import { ProductImage } from './ProductImage';
import { AnimatedNumber, ScoreRing } from './visual';
import type { StatCardTone } from './visual';

interface BestProductsStripProps {
  selections: BestProductSelectionItem[];
  comparedIds: Set<string>;
  onOpenReport: (product: ResearchProduct) => void;
  onToggleCompare: (product: ResearchProduct) => void;
  products?: readonly ResearchProduct[];
  evaluations?: ReadonlyMap<string, OpportunityEvaluation>;
  language: Language;
}

interface AwardVisualMeta {
  textClass: string;
  iconClass: string;
  topRimClass: string;
  Icon: typeof Trophy;
}

const AWARD_META: Record<BestSelectionCategory, AwardVisualMeta> = {
  bestOverall: {
    textClass: 'text-amber-700 dark:text-amber-400',
    iconClass: 'text-amber-600 dark:text-amber-400',
    topRimClass: 'from-amber-400 via-emerald-500 to-cyan-500',
    Icon: Trophy,
  },
  bestSalesPotential: {
    textClass: 'text-cyan-700 dark:text-cyan-400',
    iconClass: 'text-cyan-600 dark:text-cyan-400',
    topRimClass: 'from-cyan-500 to-sky-400',
    Icon: TrendingUp,
  },
  bestCommissionPotential: {
    textClass: 'text-emerald-700 dark:text-emerald-400',
    iconClass: 'text-emerald-600 dark:text-emerald-400',
    topRimClass: 'from-emerald-500 to-teal-400',
    Icon: Percent,
  },
  lowestCompetition: {
    textClass: 'text-violet-700 dark:text-violet-400',
    iconClass: 'text-violet-600 dark:text-violet-400',
    topRimClass: 'from-violet-500 to-indigo-400',
    Icon: Users,
  },
  bestAiContentPotential: {
    textClass: 'text-teal-700 dark:text-teal-400',
    iconClass: 'text-teal-600 dark:text-teal-400',
    topRimClass: 'from-teal-500 to-emerald-400',
    Icon: Video,
  },
  highestDataConfidence: {
    textClass: 'text-indigo-700 dark:text-indigo-400',
    iconClass: 'text-indigo-600 dark:text-indigo-400',
    topRimClass: 'from-indigo-500 to-cyan-400',
    Icon: ShieldCheck,
  },
};

const TONE_VALUE_CLASSES: Record<StatCardTone, string> = {
  emerald: 'text-emerald-700 dark:text-emerald-400',
  amber: 'text-amber-700 dark:text-amber-400',
  red: 'text-red-700 dark:text-red-400',
  zinc: 'text-zinc-950 dark:text-zinc-50',
  sky: 'text-cyan-700 dark:text-cyan-400',
  violet: 'text-violet-700 dark:text-violet-400',
  teal: 'text-teal-700 dark:text-teal-400',
  slate: 'text-slate-800 dark:text-slate-200',
};

const TONE_ICON_CLASSES: Record<StatCardTone, string> = {
  emerald: 'text-emerald-600 dark:text-emerald-400',
  amber: 'text-amber-600 dark:text-amber-400',
  red: 'text-red-600 dark:text-red-400',
  zinc: 'text-zinc-500 dark:text-zinc-400',
  sky: 'text-cyan-600 dark:text-cyan-400',
  violet: 'text-violet-600 dark:text-violet-400',
  teal: 'text-teal-600 dark:text-teal-400',
  slate: 'text-slate-600 dark:text-slate-400',
};

const TONE_BAR_GRADIENT_CLASSES: Record<StatCardTone, string> = {
  emerald: 'from-emerald-500 to-cyan-400',
  amber: 'from-amber-500 to-orange-400',
  red: 'from-red-500 to-rose-400',
  zinc: 'from-zinc-700 to-zinc-500 dark:from-zinc-300 dark:to-zinc-500',
  sky: 'from-cyan-500 to-sky-400',
  violet: 'from-violet-500 to-indigo-400',
  teal: 'from-teal-500 to-emerald-400',
  slate: 'from-slate-500 to-slate-400',
};

interface GroupedWinner {
  productKey: string;
  product: ResearchProduct;
  awards: BestProductSelectionItem[];
  hasBestOverall: boolean;
}

function parseScoreFromSummary(summary: string): number | null {
  const match = summary.match(/^(\d{1,3})\s*\/\s*100/);
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : null;
}

function resolveCompetitionTone(
  level: ResearchProduct['competitionLevel'],
  hasCreators: boolean
): StatCardTone {
  if (!hasCreators && level === 'Moderate') return 'zinc';
  if (level === 'Low') return 'emerald';
  if (level === 'High') return 'red';
  return 'amber';
}

export const BestProductsStrip = memo(function BestProductsStrip({
  selections,
  comparedIds,
  onOpenReport,
  onToggleCompare,
  products,
  evaluations,
  language,
}: BestProductsStripProps) {
  const [expanded, setExpanded] = useState(true);
  const [barsReady, setBarsReady] = useState(false);
  const t = TRANSLATIONS[language];
  const isMy = language === 'my';

  useEffect(() => {
    if (!expanded) {
      setBarsReady(false);
      return;
    }
    const prefersReduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      setBarsReady(true);
      return;
    }
    const rafId = window.requestAnimationFrame(() => {
      setBarsReady(true);
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [expanded, selections]);

  const { largeWinners, compactWinners, insufficientItems } = useMemo(() => {
    const map = new Map<string, GroupedWinner>();
    const missing: BestProductSelectionItem[] = [];

    for (const item of selections) {
      if (!item.product) {
        missing.push(item);
        continue;
      }
      const key = item.canonicalProductId || item.product.id;
      const existing = map.get(key);
      if (existing) {
        existing.awards.push(item);
        if (item.category === 'bestOverall') {
          existing.hasBestOverall = true;
        }
      } else {
        map.set(key, {
          productKey: key,
          product: item.product,
          awards: [item],
          hasBestOverall: item.category === 'bestOverall',
        });
      }
    }

    const sorted = Array.from(map.values()).sort(
      (a, b) =>
        b.awards.length - a.awards.length ||
        Number(b.hasBestOverall) - Number(a.hasBestOverall) ||
        b.product.opportunityScore - a.product.opportunityScore
    );

    const multiAward = sorted.filter((g) => g.awards.length > 1);
    const singleAward = sorted.filter((g) => g.awards.length === 1);

    if (multiAward.length > 0) {
      return {
        largeWinners: multiAward,
        compactWinners: singleAward,
        insufficientItems: missing,
      };
    }

    return {
      largeWinners: sorted.slice(0, 1),
      compactWinners: sorted.slice(1),
      insufficientItems: missing,
    };
  }, [selections]);

  const { totalResultsCount, scoreRankByProductId, competitionRankByProductId } = useMemo(() => {
    const list = products && products.length > 0 ? products : [];
    const total = list.length;
    const scoreRanks = new Map<string, number>();
    const compRanks = new Map<string, number>();

    if (total > 0) {
      const scores = list.map((p) => ({
        id: p.id,
        score: evaluations?.get(p.id)?.totalScore ?? evaluateProductOpportunity(p).totalScore,
      }));
      for (const item of scores) {
        let higherCount = 0;
        for (const peer of scores) {
          if (peer.score > item.score) higherCount++;
        }
        scoreRanks.set(item.id, higherCount + 1);
      }

      const creators = list
        .filter(
          (p): p is ResearchProduct & { kalodataMetrics: { creatorNumber: number } } =>
            typeof p.kalodataMetrics?.creatorNumber === 'number' &&
            Number.isFinite(p.kalodataMetrics.creatorNumber)
        )
        .map((p) => ({ id: p.id, creatorNumber: p.kalodataMetrics.creatorNumber }));

      for (const item of creators) {
        let lowerCount = 0;
        for (const peer of creators) {
          if (peer.creatorNumber < item.creatorNumber) lowerCount++;
        }
        compRanks.set(item.id, lowerCount + 1);
      }
    }

    return {
      totalResultsCount: total,
      scoreRankByProductId: scoreRanks,
      competitionRankByProductId: compRanks,
    };
  }, [products, evaluations]);

  if (selections.length === 0) return null;

  const standoutCount = largeWinners.length + compactWinners.length;

  return (
    <section
      aria-label={t.bestSelectionHeading}
      className="mt-4 relative rounded-2xl overflow-hidden border border-zinc-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs sp-rise-in"
    >
      {/* Top Spotlight Gradient Accent Rim */}
      <div
        aria-hidden="true"
        className="h-[2px] w-full bg-gradient-to-r from-amber-400 via-emerald-500 to-cyan-500"
      />

      {/* Atmospheric Spotlight Glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-[radial-gradient(ellipse_at_top_right,rgba(245,158,11,0.08),transparent_55%),radial-gradient(ellipse_at_top_left,rgba(16,185,129,0.08),transparent_55%)] dark:bg-[radial-gradient(ellipse_at_top_right,rgba(245,158,11,0.14),transparent_55%),radial-gradient(ellipse_at_top_left,rgba(16,185,129,0.13),transparent_55%)]"
      />

      {/* Header Row */}
      <div className="relative px-4 sm:px-6 py-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            aria-expanded={expanded}
            className="text-left font-display text-[13px] sm:text-base font-bold text-zinc-950 dark:text-zinc-50 hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors cursor-pointer min-w-0 min-h-[40px] flex items-center gap-2 leading-snug"
          >
            <Trophy
              className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0"
              aria-hidden="true"
            />
            <span>{t.bestSelectionHeading}</span>
          </button>
          <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400 tabular-nums shrink-0">
            ({standoutCount})
          </span>
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
          aria-label={expanded ? t.bestSelectionHide : t.bestSelectionShow}
          title={expanded ? t.bestSelectionHide : t.bestSelectionShow}
          className="w-10 h-10 -mr-1.5 rounded-lg inline-flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-200"
        >
          <ChevronDown
            className={`w-4 h-4 shrink-0 transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
              expanded ? 'rotate-180' : 'rotate-0'
            }`}
            aria-hidden="true"
          />
        </button>
      </div>

      {!expanded && (largeWinners.length > 0 || compactWinners.length > 0) && (() => {
        const collapsedWinners = [...largeWinners, ...compactWinners].slice(0, 4);
        const gridColsClass =
          collapsedWinners.length >= 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1';
        const hasOddTail = collapsedWinners.length > 1 && collapsedWinners.length % 2 === 1;

        return (
          <div
            className={`relative border-t border-zinc-200/75 dark:border-zinc-800/80 bg-zinc-200/70 dark:bg-zinc-800 grid ${gridColsClass} gap-px sp-rise-in`}
          >
            {collapsedWinners.map((group, idx) => {
              const { product, awards } = group;
              const primaryAward = awards[0];
              const meta = AWARD_META[primaryAward.category];
              const Icon = meta.Icon;
              const shortLabel = t.bestAwardShortLabels[primaryAward.category];
              const evaluation =
                evaluations?.get(product.id) ?? evaluateProductOpportunity(product);
              const bestOverallAward = awards.find((a) => a.category === 'bestOverall');
              const overallScore =
                (bestOverallAward ? parseScoreFromSummary(bestOverallAward.metricSummaryEn) : null) ??
                evaluation.totalScore;
              const scoreRank = scoreRankByProductId.get(product.id) ?? null;
              const imageConfig = resolveProductImageDisplayConfig(product);
              const displayName = isMy ? product.nameMy : product.name;
              const salesVolume = product.kalodataMetrics?.salesVolume ?? null;
              const isLastOdd = hasOddTail && idx === collapsedWinners.length - 1;

              return (
                <div
                  key={`compact-${group.productKey}`}
                  className={`bg-white/95 dark:bg-zinc-900/95 px-3.5 sm:px-5 py-2.5 flex items-center justify-between gap-2.5 min-w-0 ${
                    isLastOdd ? 'md:col-span-2' : ''
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onOpenReport(product)}
                    className="flex items-center gap-2.5 min-w-0 flex-1 text-left group/row cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-lg"
                  >
                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700/80 shrink-0">
                      {imageConfig.canRender && imageConfig.src ? (
                        <ProductImage
                          src={imageConfig.src}
                          fallbackSrc={imageConfig.fallbackSrc}
                          productId={imageConfig.productId}
                          alt={product.name}
                          title={displayName}
                          unavailableLabel={t.cardImageUnverified}
                          compact
                          className="w-full h-full object-cover transition-transform duration-200 group-hover/row:scale-105"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageOff
                            className="w-4 h-4 text-zinc-400"
                            aria-hidden="true"
                          />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-0.5">
                      {/* Award Kicker + Rank + Title */}
                      <div className="flex items-center gap-1.5 min-w-0 text-xs">
                        <Icon
                          className={`w-3.5 h-3.5 shrink-0 ${meta.iconClass}`}
                          aria-hidden="true"
                        />
                        <span className={`font-semibold shrink-0 whitespace-nowrap ${meta.textClass}`}>
                          {shortLabel}
                        </span>
                        {awards.length > 1 && (
                          <span className="font-mono text-[11px] font-semibold text-amber-600 dark:text-amber-400 shrink-0 tabular-nums">
                            +{awards.length - 1}
                          </span>
                        )}
                        {scoreRank !== null && totalResultsCount > 0 && (
                          <>
                            <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-700 shrink-0">
                              ·
                            </span>
                            <span className="font-mono text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 shrink-0 tabular-nums">
                              #{scoreRank}/{totalResultsCount}
                            </span>
                          </>
                        )}
                      </div>

                      <div className="text-xs sm:text-[13px] font-semibold text-zinc-950 dark:text-zinc-50 truncate group-hover/row:text-emerald-700 dark:group-hover/row:text-emerald-400 transition-colors">
                        {displayName}
                      </div>

                      {/* Key Live Metrics (Price · Comm % · Sales · Confidence) */}
                      <div className="flex items-center gap-x-1.5 text-[11px] sm:text-xs font-mono tabular-nums text-zinc-600 dark:text-zinc-400 truncate">
                        {product.priceThb !== null && (
                          <span className="font-semibold text-zinc-900 dark:text-zinc-100 shrink-0">
                            {formatThb(product.priceThb)}
                          </span>
                        )}
                        {product.commissionRate !== null && (
                          <>
                            {product.priceThb !== null && (
                              <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-700">
                                ·
                              </span>
                            )}
                            <span className="font-semibold text-emerald-700 dark:text-emerald-400 shrink-0">
                              {product.commissionRate}%
                            </span>
                          </>
                        )}
                        {salesVolume !== null && (
                          <>
                            <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-700">
                              ·
                            </span>
                            <span className="text-cyan-700 dark:text-cyan-400 font-medium shrink-0">
                              {salesVolume.toLocaleString('en-US')}{' '}
                              <span className="font-sans">{t.bestSoldUnit}</span>
                            </span>
                          </>
                        )}
                        <span
                          aria-hidden="true"
                          className="hidden sm:inline text-zinc-300 dark:text-zinc-700"
                        >
                          ·
                        </span>
                        <span className="hidden sm:inline text-zinc-500 dark:text-zinc-400 shrink-0">
                          {evaluation.confidencePct}%
                        </span>
                      </div>
                    </div>
                  </button>

                  <div className="flex items-center gap-2 shrink-0">
                    <ScoreRing value={overallScore} max={100} size={38} />
                    <button
                      type="button"
                      onClick={() => onOpenReport(product)}
                      aria-label={`${t.cardOpenReport}: ${displayName}`}
                      className="inline-flex items-center justify-center gap-1 min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/45 text-emerald-800 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 active:scale-[0.98] transition-all cursor-pointer whitespace-nowrap"
                    >
                      <span className="hidden sm:inline">{isMy ? 'ကြည့်ရန်' : 'Report'}</span>
                      <ArrowUpRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {expanded && (
        <div className="relative border-t border-zinc-200/75 dark:border-zinc-800/80 sp-rise-in">
          {/* Featured / Multi-Award Winner(s) */}
          {largeWinners.length > 0 && (
            <div className="divide-y divide-zinc-200/75 dark:divide-zinc-800/80">
              {largeWinners.map((group) => {
                const { product, awards } = group;
                const evaluation =
                  evaluations?.get(product.id) ?? evaluateProductOpportunity(product);
                const bestOverallAward = awards.find((a) => a.category === 'bestOverall');
                const overallScore =
                  (bestOverallAward ? parseScoreFromSummary(bestOverallAward.metricSummaryEn) : null) ??
                  evaluation.totalScore;
                const scoreRank = scoreRankByProductId.get(product.id) ?? null;
                const compRank = competitionRankByProductId.get(product.id) ?? null;
                const wonLowestCompetition = awards.some(
                  (a) => a.category === 'lowestCompetition'
                );

                const imageConfig = resolveProductImageDisplayConfig(product);
                const displayName = isMy ? product.nameMy : product.name;
                const isSelectedForCompare = comparedIds.has(product.id);

                // Metric 1: Sales + Revenue
                const salesVolume = product.kalodataMetrics?.salesVolume ?? null;
                const revenueThb = product.kalodataMetrics?.revenueThb ?? null;
                const salesSub =
                  revenueThb !== null ? formatThb(revenueThb) : t.dataStatusLabels.unavailable;
                const salesTone: StatCardTone = salesVolume !== null ? 'sky' : 'zinc';

                // Metric 2: Competition
                const creatorNumber = product.kalodataMetrics?.creatorNumber ?? null;
                const competitionTone = resolveCompetitionTone(
                  product.competitionLevel,
                  creatorNumber !== null
                );
                const relativeCompLabel =
                  wonLowestCompetition && totalResultsCount > 0
                    ? t.bestLowestOfResults.replace('{n}', String(totalResultsCount))
                    : compRank !== null && totalResultsCount > 0
                      ? `#${compRank}/${totalResultsCount}`
                      : null;
                const competitionNote =
                  product.competitionLevel === 'High'
                    ? [relativeCompLabel, t.bestCompetitionStillHighNote].filter(Boolean).join(' · ')
                    : relativeCompLabel;

                // Metric 3: AI Content score
                const aiCriterion = evaluation.criteria.find(
                  (c) => c.key === 'aiContentSuitability'
                );
                const aiScore = aiCriterion?.normalizedScore ?? null;
                const aiValue = aiScore !== null ? Math.round(aiScore) : null;
                const aiTone: StatCardTone = aiScore !== null ? 'teal' : 'zinc';
                const aiScale =
                  barsReady && aiScore !== null ? Math.max(0, Math.min(1, aiScore / 100)) : 0;

                // Metric 4: Data Confidence
                const confidenceTone: StatCardTone =
                  evaluation.confidencePct >= 70
                    ? 'emerald'
                    : evaluation.confidencePct >= 40
                      ? 'amber'
                      : 'red';
                const confidenceScale = barsReady
                  ? Math.max(0, Math.min(1, evaluation.confidencePct / 100))
                  : 0;

                return (
                  <article key={group.productKey} className="p-3.5 sm:p-6 space-y-3.5 sm:space-y-4">
                    {/* 1. Unboxed Color-Coded Award Highlights */}
                    <div
                      className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs leading-relaxed"
                      aria-label={t.bestSelectionHeading}
                    >
                      {awards.map((award, idx) => {
                        const meta = AWARD_META[award.category];
                        const Icon = meta.Icon;
                        const shortLabel = t.bestAwardShortLabels[award.category];
                        return (
                          <span
                            key={award.category}
                            title={t.bestSelectionCategories[award.category]}
                            className="inline-flex items-center gap-1"
                          >
                            {idx > 0 && (
                              <span
                                aria-hidden="true"
                                className="text-zinc-300 dark:text-zinc-700 mr-1"
                              >
                                ·
                              </span>
                            )}
                            <Icon
                              className={`w-3.5 h-3.5 shrink-0 ${meta.iconClass}`}
                              aria-hidden="true"
                            />
                            <span className={`font-semibold whitespace-nowrap ${meta.textClass}`}>
                              {shortLabel}
                            </span>
                          </span>
                        );
                      })}
                    </div>

                    {/* 2. Featured Product Identity + Animated ScoreRing Spotlight */}
                    <div className="flex items-start sm:items-center justify-between gap-3 sm:gap-5">
                      <div className="flex items-start sm:items-center gap-3 sm:gap-4 min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => onOpenReport(product)}
                          aria-label={displayName}
                          className="group/thumb w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700/80 shrink-0 cursor-pointer shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                        >
                          {imageConfig.canRender && imageConfig.src ? (
                            <ProductImage
                              src={imageConfig.src}
                              fallbackSrc={imageConfig.fallbackSrc}
                              productId={imageConfig.productId}
                              alt={product.name}
                              title={displayName}
                              unavailableLabel={t.cardImageUnverified}
                              compact
                              className="w-full h-full object-cover transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/thumb:scale-105"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <ImageOff
                                className="w-5 h-5 text-zinc-500 dark:text-zinc-400"
                                aria-hidden="true"
                              />
                            </div>
                          )}
                        </button>

                        <div className="min-w-0 flex-1 space-y-1">
                          <button
                            type="button"
                            onClick={() => onOpenReport(product)}
                            className="text-left cursor-pointer group/winner focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-sm block w-full"
                          >
                            <h3 className="font-display text-sm sm:text-base font-bold text-zinc-950 dark:text-zinc-50 leading-snug line-clamp-2 group-hover/winner:text-emerald-700 dark:group-hover/winner:text-emerald-400 transition-colors">
                              {displayName}
                            </h3>
                          </button>

                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-600 dark:text-zinc-400 font-mono tabular-nums">
                            {product.priceThb !== null && (
                              <span className="font-bold text-zinc-950 dark:text-zinc-50">
                                {formatThb(product.priceThb)}
                              </span>
                            )}
                            {product.commissionRate !== null && (
                              <>
                                {product.priceThb !== null && (
                                  <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-700">
                                    ·
                                  </span>
                                )}
                                <span className="font-bold text-emerald-700 dark:text-emerald-400">
                                  {product.commissionRate}%
                                </span>
                              </>
                            )}
                            {product.shopName && (
                              <>
                                <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-700">
                                    ·
                                </span>
                                <span className="font-sans truncate max-w-[155px] sm:max-w-[260px]">
                                  {product.shopName}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="relative flex flex-col items-center gap-1 shrink-0">
                        <div
                          aria-hidden="true"
                          className="pointer-events-none absolute -inset-2 rounded-full bg-emerald-500/12 dark:bg-emerald-400/12 blur-md"
                        />
                        <div className="relative sm:hidden">
                          <ScoreRing value={overallScore} max={100} size={58} animate />
                        </div>
                        <div className="relative hidden sm:block">
                          <ScoreRing
                            value={overallScore}
                            max={100}
                            size={76}
                            label={t.bestStatOverallScore}
                            animate
                          />
                        </div>
                        {scoreRank !== null && totalResultsCount > 0 && (
                          <span className="relative font-mono text-xs font-bold tabular-nums text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                            #{scoreRank} / {totalResultsCount}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 3. Compact 2x2 (Mobile) / 4-Col (Desktop) Hairline Telemetry Grid */}
                    <div className="space-y-2">
                      <div className="rounded-xl overflow-hidden border border-zinc-200/80 dark:border-zinc-800 bg-zinc-200/70 dark:bg-zinc-800 grid grid-cols-2 lg:grid-cols-4 gap-px">
                        {/* Metric 1: Sales & Revenue */}
                        <div className="bg-zinc-50/90 dark:bg-zinc-900/80 p-3 sm:p-4 flex flex-col justify-between gap-1.5 min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <TrendingUp
                              className={`w-3.5 h-3.5 shrink-0 ${TONE_ICON_CLASSES[salesTone]}`}
                              aria-hidden="true"
                            />
                            <span className="text-[11px] sm:text-xs font-medium text-zinc-600 dark:text-zinc-400 truncate">
                              {t.bestStatSales}
                            </span>
                          </div>
                          <div className="space-y-0.5 min-w-0">
                            <div className="flex items-baseline gap-1 flex-wrap">
                              <span
                                className={`font-mono text-base sm:text-xl font-bold tabular-nums tracking-tight ${TONE_VALUE_CLASSES[salesTone]}`}
                              >
                                {salesVolume !== null ? <AnimatedNumber value={salesVolume} /> : '—'}
                              </span>
                              {salesVolume !== null && (
                                <span className="text-[11px] sm:text-xs font-medium text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                                  {t.bestSoldUnit}
                                </span>
                              )}
                            </div>
                            <div className="font-mono text-[11px] sm:text-xs text-zinc-600 dark:text-zinc-400 tabular-nums truncate">
                              {salesSub}
                            </div>
                          </div>
                        </div>

                        {/* Metric 2: Competition */}
                        <div className="bg-zinc-50/90 dark:bg-zinc-900/80 p-3 sm:p-4 flex flex-col justify-between gap-1.5 min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Users
                              className={`w-3.5 h-3.5 shrink-0 ${TONE_ICON_CLASSES[competitionTone]}`}
                              aria-hidden="true"
                            />
                            <span className="text-[11px] sm:text-xs font-medium text-zinc-600 dark:text-zinc-400 truncate">
                              {t.bestStatCompetition}
                            </span>
                          </div>
                          <div className="space-y-0.5 min-w-0">
                            <div className="flex items-baseline gap-1 flex-wrap">
                              <span
                                className={`font-mono text-base sm:text-xl font-bold tabular-nums tracking-tight ${TONE_VALUE_CLASSES[competitionTone]}`}
                              >
                                {creatorNumber !== null ? (
                                  <AnimatedNumber value={creatorNumber} />
                                ) : (
                                  t.competitionLabels[product.competitionLevel]
                                )}
                              </span>
                              {creatorNumber !== null && (
                                <span className="text-[11px] sm:text-xs font-medium text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                                  {t.bestCreatorsUnit}
                                </span>
                              )}
                            </div>
                            {creatorNumber !== null && (
                              <div className="text-[11px] sm:text-xs font-medium text-zinc-600 dark:text-zinc-400 truncate">
                                {t.competitionLabels[product.competitionLevel]}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Metric 3: AI Content */}
                        <div className="bg-zinc-50/90 dark:bg-zinc-900/80 p-3 sm:p-4 flex flex-col justify-between gap-1.5 min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Video
                              className={`w-3.5 h-3.5 shrink-0 ${TONE_ICON_CLASSES[aiTone]}`}
                              aria-hidden="true"
                            />
                            <span className="text-[11px] sm:text-xs font-medium text-zinc-600 dark:text-zinc-400 truncate">
                              {t.bestStatAiContent}
                            </span>
                          </div>
                          <div className="space-y-1.5 min-w-0">
                            <div className="flex items-baseline gap-1 flex-wrap">
                              <span
                                className={`font-mono text-base sm:text-xl font-bold tabular-nums tracking-tight ${TONE_VALUE_CLASSES[aiTone]}`}
                              >
                                {aiValue !== null ? <AnimatedNumber value={aiValue} /> : '—'}
                              </span>
                              {aiValue !== null && (
                                <span className="font-mono text-[11px] sm:text-xs text-zinc-400 dark:text-zinc-500 tabular-nums">
                                  /100
                                </span>
                              )}
                              <span className="text-[11px] sm:text-xs text-zinc-600 dark:text-zinc-400 truncate">
                                · {t.aiVideoLabels[product.aiVideoSuitability]}
                              </span>
                            </div>
                            {aiScore !== null && (
                              <div
                                role="progressbar"
                                aria-label={t.bestStatAiContent}
                                aria-valuenow={Math.round(aiScore)}
                                aria-valuemin={0}
                                aria-valuemax={100}
                                className="w-full h-1.5 rounded-full bg-zinc-200/80 dark:bg-zinc-800 overflow-hidden"
                              >
                                <div
                                  className={`h-full w-full rounded-full bg-gradient-to-r origin-left transition-transform duration-600 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${TONE_BAR_GRADIENT_CLASSES[aiTone]}`}
                                  style={{ transform: `scaleX(${aiScale})` }}
                                />
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Metric 4: Data Confidence */}
                        <div className="bg-zinc-50/90 dark:bg-zinc-900/80 p-3 sm:p-4 flex flex-col justify-between gap-1.5 min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <ShieldCheck
                              className={`w-3.5 h-3.5 shrink-0 ${TONE_ICON_CLASSES[confidenceTone]}`}
                              aria-hidden="true"
                            />
                            <span className="text-[11px] sm:text-xs font-medium text-zinc-600 dark:text-zinc-400 truncate">
                              {t.bestStatDataConfidence}
                            </span>
                          </div>
                          <div className="space-y-1.5 min-w-0">
                            <div className="flex items-baseline gap-1 flex-wrap">
                              <span
                                className={`font-mono text-base sm:text-xl font-bold tabular-nums tracking-tight ${TONE_VALUE_CLASSES[confidenceTone]}`}
                              >
                                <AnimatedNumber value={evaluation.confidencePct} suffix="%" />
                              </span>
                              <span className="text-[11px] sm:text-xs text-zinc-600 dark:text-zinc-400 whitespace-nowrap font-mono tabular-nums">
                                · {evaluation.verifiedCount}/{evaluation.totalCriteria}
                              </span>
                            </div>
                            <div
                              role="progressbar"
                              aria-label={t.bestStatDataConfidence}
                              aria-valuenow={Math.round(evaluation.confidencePct)}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              className="w-full h-1.5 rounded-full bg-zinc-200/80 dark:bg-zinc-800 overflow-hidden"
                            >
                              <div
                                className={`h-full w-full rounded-full bg-gradient-to-r origin-left transition-transform duration-600 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${TONE_BAR_GRADIENT_CLASSES[confidenceTone]}`}
                                style={{ transform: `scaleX(${confidenceScale})` }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      {competitionNote && (
                        <p
                          className={`text-xs leading-relaxed px-0.5 ${
                            product.competitionLevel === 'High'
                              ? 'text-red-700 dark:text-red-400'
                              : 'text-zinc-600 dark:text-zinc-400'
                          }`}
                        >
                          {competitionNote}
                        </p>
                      )}
                    </div>

                    {/* 4. Vibrant Color-Coded Action Row */}
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                      <button
                        type="button"
                        onClick={() => onOpenReport(product)}
                        className="group/report relative overflow-hidden sm:col-span-8 inline-flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-[42px] px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold text-white dark:text-zinc-950 bg-gradient-to-r from-emerald-600 to-teal-500 dark:from-emerald-400 dark:to-cyan-400 shadow-sm shadow-emerald-600/20 dark:shadow-emerald-500/15 hover:brightness-105 active:scale-[0.98] transition-all cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-950"
                      >
                        <span aria-hidden="true" className="sp-shimmer-sheen" />
                        <span className="relative z-10">{t.cardOpenReport}</span>
                        <ArrowUpRight
                          className="relative z-10 w-4 h-4 shrink-0 transition-transform duration-200 group-hover/report:translate-x-0.5 group-hover/report:-translate-y-0.5"
                          aria-hidden="true"
                        />
                      </button>

                      <button
                        type="button"
                        onClick={() => onToggleCompare(product)}
                        aria-pressed={isSelectedForCompare}
                        className={`sm:col-span-4 inline-flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-[42px] px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl border active:scale-[0.98] transition-all cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                          isSelectedForCompare
                            ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                            : 'bg-indigo-50/70 dark:bg-indigo-950/35 text-indigo-900 dark:text-indigo-200 border-indigo-200/90 dark:border-indigo-700/60 hover:bg-indigo-100/75 dark:hover:bg-indigo-900/50'
                        }`}
                      >
                        <GitCompareArrows className="w-4 h-4 shrink-0" aria-hidden="true" />
                        <span>
                          {isSelectedForCompare ? t.compareSelectedBtn : t.compareSelectBtn}
                        </span>
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {/* Category Standouts (Full Width if 1 / Horizontal Snap Carousel on Mobile & 2-Col Grid on Desktop if >1) */}
          {compactWinners.length > 0 && (() => {
            const isSingleCompact = compactWinners.length === 1;

            return (
              <div className="p-3.5 sm:p-6 border-t border-zinc-200/75 dark:border-zinc-800/80 space-y-2.5 bg-zinc-50/50 dark:bg-zinc-950/30">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                    {t.bestOtherCategoryWinners}
                  </span>
                  {!isSingleCompact && (
                    <span className="md:hidden font-mono text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                      {compactWinners.length} {isMy ? 'မျိုး' : 'picks'}
                    </span>
                  )}
                </div>

                <div
                  className={
                    isSingleCompact
                      ? 'grid grid-cols-1'
                      : 'flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory pb-0.5 md:grid md:grid-cols-2 md:overflow-visible md:pb-0'
                  }
                >
                  {compactWinners.map((group) => {
                    const { product, awards } = group;
                    const award = awards[0];
                    const meta = AWARD_META[award.category];
                    const Icon = meta.Icon;
                    const shortLabel = t.bestAwardShortLabels[award.category];
                    const imageConfig = resolveProductImageDisplayConfig(product);
                    const displayName = isMy ? product.nameMy : product.name;
                    const isSelectedForCompare = comparedIds.has(product.id);
                    const evaluation =
                      evaluations?.get(product.id) ?? evaluateProductOpportunity(product);
                    const scoreRank = scoreRankByProductId.get(product.id) ?? null;
                    const showHighCompNote =
                      award.category === 'lowestCompetition' && product.competitionLevel === 'High';

                    return (
                      <article
                        key={group.productKey}
                        className={`${
                          isSingleCompact
                            ? 'w-full'
                            : 'snap-start w-[86%] sm:w-[74%] md:w-auto shrink-0'
                        } rounded-xl overflow-hidden border border-zinc-200/85 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 flex flex-col justify-between transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] md:hover:-translate-y-0.5 md:hover:shadow-sm`}
                      >
                      <div
                        aria-hidden="true"
                        className={`h-[2px] w-full bg-gradient-to-r ${meta.topRimClass}`}
                      />

                      <div className="p-3.5 sm:p-4 flex-1 flex flex-col justify-between gap-3">
                        <div className="space-y-2.5">
                          {/* Unboxed Category Kicker + Highlight Metric */}
                          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                            <span
                              title={t.bestSelectionCategories[award.category]}
                              className="inline-flex items-center gap-1.5 text-xs font-semibold min-w-0"
                            >
                              <Icon
                                className={`w-3.5 h-3.5 shrink-0 ${meta.iconClass}`}
                                aria-hidden="true"
                              />
                              <span className={meta.textClass}>{shortLabel}</span>
                            </span>

                            <span className="font-mono text-xs font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
                              {isMy ? award.metricSummaryMy : award.metricSummaryEn}
                            </span>
                          </div>

                          {showHighCompNote && (
                            <p className="text-xs text-red-700 dark:text-red-400 leading-relaxed">
                              {t.bestCompetitionStillHighNote}
                            </p>
                          )}

                          {/* Product Identity + ScoreRing */}
                          <div className="flex items-center gap-3 min-w-0">
                            <button
                              type="button"
                              onClick={() => onOpenReport(product)}
                              aria-label={displayName}
                              className="w-13 h-13 sm:w-14 sm:h-14 rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700/80 shrink-0 cursor-pointer"
                            >
                              {imageConfig.canRender && imageConfig.src ? (
                                <ProductImage
                                  src={imageConfig.src}
                                  fallbackSrc={imageConfig.fallbackSrc}
                                  productId={imageConfig.productId}
                                  alt={product.name}
                                  title={displayName}
                                  unavailableLabel={t.cardImageUnverified}
                                  compact
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <ImageOff
                                    className="w-4 h-4 text-zinc-500 dark:text-zinc-400"
                                    aria-hidden="true"
                                  />
                                </div>
                              )}
                            </button>

                            <div className="min-w-0 flex-1 space-y-1">
                              <button
                                type="button"
                                onClick={() => onOpenReport(product)}
                                className="text-left cursor-pointer group/compact focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-sm block w-full"
                              >
                                <h3 className="text-xs sm:text-sm font-semibold text-zinc-950 dark:text-zinc-50 leading-snug line-clamp-2 group-hover/compact:underline">
                                  {displayName}
                                </h3>
                              </button>

                              {(product.priceThb !== null || product.shopName) && (
                                <div className="flex flex-wrap items-center gap-x-2 text-xs text-zinc-600 dark:text-zinc-400 font-mono tabular-nums">
                                  {product.priceThb !== null && (
                                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                                      {formatThb(product.priceThb)}
                                    </span>
                                  )}
                                  {product.shopName && (
                                    <span className="font-sans truncate max-w-[130px]">
                                      {product.priceThb !== null ? `· ${product.shopName}` : product.shopName}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>

                            <div className="flex flex-col items-center gap-0.5 shrink-0">
                              <ScoreRing value={evaluation.totalScore} max={100} size={50} animate />
                              {scoreRank !== null && totalResultsCount > 0 && (
                                <span className="font-mono text-[11px] font-semibold tabular-nums text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                                  #{scoreRank} / {totalResultsCount}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Clean Action Buttons */}
                        <div className="pt-2.5 border-t border-zinc-100 dark:border-zinc-800/80 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => onOpenReport(product)}
                            className="inline-flex items-center justify-center gap-1 min-h-[40px] px-2.5 py-1.5 text-xs font-semibold text-zinc-950 dark:text-zinc-50 bg-zinc-100/90 dark:bg-zinc-800 hover:bg-zinc-200/80 dark:hover:bg-zinc-700/80 active:scale-[0.98] rounded-lg transition-all cursor-pointer whitespace-nowrap"
                          >
                            <span>{isMy ? 'အစီရင်ခံစာ' : 'Report'}</span>
                            <ArrowUpRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          </button>

                          <button
                            type="button"
                            onClick={() => onToggleCompare(product)}
                            aria-pressed={isSelectedForCompare}
                            className={`inline-flex items-center justify-center gap-1 min-h-[40px] px-2.5 py-1.5 text-xs font-semibold rounded-lg border active:scale-[0.98] transition-all cursor-pointer whitespace-nowrap ${
                              isSelectedForCompare
                                ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                                : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500'
                            }`}
                          >
                            <GitCompareArrows className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                            <span>
                              {isSelectedForCompare ? t.compareSelectedBtn : t.compareSelectBtn}
                            </span>
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
                </div>
              </div>
            );
          })()}

          {/* Honest Insufficient-Data Categories */}
          {insufficientItems.length > 0 && (
            <div className="p-3.5 sm:p-6 pt-3 border-t border-zinc-200/75 dark:border-zinc-800/80 grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {insufficientItems.map((item) => {
                const meta = AWARD_META[item.category];
                const Icon = meta.Icon;
                return (
                  <div
                    key={item.category}
                    className="flex items-start gap-2.5 p-3 sp-surface-muted text-xs"
                  >
                    <AlertCircle
                      className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <div className="min-w-0 space-y-0.5">
                      <div className="inline-flex items-center gap-1.5 font-semibold text-zinc-800 dark:text-zinc-200">
                        <Icon className={`w-3.5 h-3.5 shrink-0 ${meta.iconClass}`} aria-hidden="true" />
                        <span>{t.bestAwardShortLabels[item.category]}</span>
                        <span className="font-normal text-amber-700 dark:text-amber-400">
                          · {t.bestInsufficientBadge}
                        </span>
                      </div>
                      <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                        {isMy
                          ? item.insufficientReasonMy ?? item.reasonMy
                          : item.insufficientReasonEn ?? item.reasonEn}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
});
