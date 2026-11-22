import { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  GitCompareArrows,
  ImageOff,
  Percent,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Trophy,
  Users,
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
import { ScoreRing, StatCard } from './visual';
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
  badgeClass: string;
  iconClass: string;
  Icon: typeof Trophy;
}

const AWARD_BADGE_META: Record<BestSelectionCategory, AwardVisualMeta> = {
  bestOverall: {
    badgeClass:
      'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/80',
    iconClass: 'text-amber-600 dark:text-amber-400',
    Icon: Trophy,
  },
  bestSalesPotential: {
    badgeClass:
      'bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-800/80',
    iconClass: 'text-sky-600 dark:text-sky-400',
    Icon: TrendingUp,
  },
  bestCommissionPotential: {
    badgeClass:
      'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/80',
    iconClass: 'text-emerald-600 dark:text-emerald-400',
    Icon: Percent,
  },
  lowestCompetition: {
    badgeClass:
      'bg-violet-50 text-violet-800 border-violet-200 dark:bg-violet-950/50 dark:text-violet-300 dark:border-violet-800/80',
    iconClass: 'text-violet-600 dark:text-violet-400',
    Icon: Users,
  },
  bestAiContentPotential: {
    badgeClass:
      'bg-teal-50 text-teal-800 border-teal-200 dark:bg-teal-950/50 dark:text-teal-300 dark:border-teal-800/80',
    iconClass: 'text-teal-600 dark:text-teal-400',
    Icon: Sparkles,
  },
  highestDataConfidence: {
    badgeClass:
      'bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-800/70 dark:text-slate-200 dark:border-slate-700',
    iconClass: 'text-slate-600 dark:text-slate-400',
    Icon: ShieldCheck,
  },
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

function formatCompactCount(value: number): string {
  return value.toLocaleString('en-US');
}

function resolveCompetitionTone(level: ResearchProduct['competitionLevel'], hasCreators: boolean): StatCardTone {
  if (!hasCreators && level === 'Moderate') return 'zinc';
  if (level === 'Low') return 'emerald';
  if (level === 'High') return 'red';
  return 'amber';
}

export function BestProductsStrip({
  selections,
  comparedIds,
  onOpenReport,
  onToggleCompare,
  products,
  evaluations,
  language,
}: BestProductsStripProps) {
  const [expanded, setExpanded] = useState(true);
  const t = TRANSLATIONS[language];
  const isMy = language === 'my';

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

    // If every distinct product only won 1 award, promote the top winner to a large card
    return {
      largeWinners: sorted.slice(0, 1),
      compactWinners: sorted.slice(1),
      insufficientItems: missing,
    };
  }, [selections]);

  // Read-only rank maps derived from current results list (ties share a rank)
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

  const formatAwardLabel = (category: BestSelectionCategory): string => {
    if (category === 'lowestCompetition' && totalResultsCount > 0) {
      return t.bestLowestOfResults.replace('{n}', String(totalResultsCount));
    }
    return t.bestAwardShortLabels[category];
  };

  if (selections.length === 0) return null;

  return (
    <section
      aria-label={t.bestSelectionHeading}
      className="mt-4 bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-xl overflow-hidden"
    >
      {/* Header Row */}
      <div className="px-4 sm:px-5 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            aria-expanded={expanded}
            className="text-left font-display text-base sm:text-lg font-semibold text-zinc-950 dark:text-zinc-50 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors cursor-pointer truncate min-h-[40px] flex items-center"
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
          className="inline-flex items-center gap-1.5 min-h-[40px] px-2.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50 transition-colors cursor-pointer shrink-0 whitespace-nowrap rounded-lg"
        >
          <span>{expanded ? t.bestSelectionHide : t.bestSelectionShow}</span>
          {expanded ? (
            <ChevronUp className="w-4 h-4 shrink-0" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-4 h-4 shrink-0" aria-hidden="true" />
          )}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-zinc-100 dark:border-zinc-800/80 p-4 sm:p-5 space-y-4">
          {/* Large Winner Cards (One per distinct multi-award winner, sorted by most awards first) */}
          {largeWinners.length > 0 && (
            <div className="space-y-4">
              {largeWinners.map((group) => {
                const { product, awards } = group;
                const evaluation = evaluations?.get(product.id) ?? evaluateProductOpportunity(product);
                const bestOverallAward = awards.find((a) => a.category === 'bestOverall');
                const overallScore =
                  (bestOverallAward ? parseScoreFromSummary(bestOverallAward.metricSummaryEn) : null) ??
                  evaluation.totalScore;
                const scoreRank = scoreRankByProductId.get(product.id) ?? null;
                const compRank = competitionRankByProductId.get(product.id) ?? null;
                const wonLowestCompetition = awards.some((a) => a.category === 'lowestCompetition');

                const imageConfig = resolveProductImageDisplayConfig(product);
                const displayName = isMy ? product.nameMy : product.name;
                const isSelectedForCompare = comparedIds.has(product.id);

                // Stat 1: Sales + Revenue
                const salesVolume = product.kalodataMetrics?.salesVolume ?? null;
                const revenueThb = product.kalodataMetrics?.revenueThb ?? null;
                const salesValue = salesVolume !== null ? formatCompactCount(salesVolume) : '—';
                const salesSub =
                  revenueThb !== null
                    ? formatThb(revenueThb)
                    : t.dataStatusLabels.unavailable;

                // Stat 2: Competition (creator count + relative rank / high-overall note)
                const creatorNumber = product.kalodataMetrics?.creatorNumber ?? null;
                const competitionValue =
                  creatorNumber !== null
                    ? formatCompactCount(creatorNumber)
                    : t.competitionLabels[product.competitionLevel];
                const relativeCompLabel =
                  wonLowestCompetition && totalResultsCount > 0
                    ? t.bestLowestOfResults.replace('{n}', String(totalResultsCount))
                    : compRank !== null && totalResultsCount > 0
                      ? `#${compRank}/${totalResultsCount}`
                      : null;
                const competitionSub =
                  creatorNumber !== null
                    ? [
                        t.competitionLabels[product.competitionLevel],
                        relativeCompLabel,
                        product.competitionLevel === 'High'
                          ? t.bestCompetitionStillHighNote
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')
                    : product.competitionLevel === 'High'
                      ? t.bestCompetitionStillHighNote
                      : t.dataStatusLabels.unavailable;
                const competitionTone = resolveCompetitionTone(
                  product.competitionLevel,
                  creatorNumber !== null
                );

                // Stat 3: AI Content score (with progress bar)
                const aiCriterion = evaluation.criteria.find(
                  (c) => c.key === 'aiContentSuitability'
                );
                const aiScore = aiCriterion?.normalizedScore ?? null;
                const aiValue = aiScore !== null ? Math.round(aiScore) : '—';

                // Stat 4: Data Confidence % (with verified count like 6/7)
                const confidenceTone: StatCardTone =
                  evaluation.confidencePct >= 70
                    ? 'emerald'
                    : evaluation.confidencePct >= 40
                      ? 'amber'
                      : 'red';

                return (
                  <article
                    key={group.productKey}
                    className="bg-zinc-50/70 dark:bg-zinc-950/50 border border-zinc-200/90 dark:border-zinc-800 rounded-xl p-4 sm:p-5 space-y-4"
                  >
                    {/* Award Badges Row */}
                    <div
                      className="flex flex-wrap items-center gap-2"
                      aria-label={t.bestSelectionHeading}
                    >
                      {awards.map((award) => {
                        const meta = AWARD_BADGE_META[award.category];
                        const Icon = meta.Icon;
                        const shortLabel = formatAwardLabel(award.category);
                        return (
                          <span
                            key={award.category}
                            title={t.bestSelectionCategories[award.category]}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full border whitespace-nowrap ${meta.badgeClass}`}
                          >
                            <Icon className={`w-3.5 h-3.5 shrink-0 ${meta.iconClass}`} aria-hidden="true" />
                            <span>{shortLabel}</span>
                          </span>
                        );
                      })}
                    </div>

                    {/* Product Thumbnail + Name + Overall ScoreRing */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-start sm:items-center gap-3.5 min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => onOpenReport(product)}
                          aria-label={displayName}
                          className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700/80 shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-200"
                        >
                          {imageConfig.canRender && imageConfig.src ? (
                            <ProductImage
                              src={imageConfig.src}
                              fallbackSrc={imageConfig.fallbackSrc}
                              productId={imageConfig.productId}
                              alt={product.name}
                              title={displayName}
                              unavailableLabel={t.cardImageUnverified}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <ImageOff
                                className="w-5 h-5 text-zinc-400 dark:text-zinc-500"
                                aria-hidden="true"
                              />
                            </div>
                          )}
                        </button>

                        <div className="min-w-0 flex-1 space-y-1.5">
                          <button
                            type="button"
                            onClick={() => onOpenReport(product)}
                            className="text-left cursor-pointer group/winner focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-200 rounded-sm"
                          >
                            <h3 className="font-display text-base sm:text-lg font-semibold text-zinc-950 dark:text-zinc-50 leading-snug line-clamp-2 group-hover/winner:underline">
                              {displayName}
                            </h3>
                          </button>

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400 font-mono tabular-nums">
                            {product.priceThb !== null && (
                              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                                {formatThb(product.priceThb)}
                              </span>
                            )}
                            {product.commissionRate !== null && (
                              <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                                {product.commissionRate}%
                              </span>
                            )}
                            {product.shopName && (
                              <span className="font-sans truncate max-w-[200px]">
                                {product.shopName}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-center gap-1 self-start sm:self-center shrink-0">
                        <ScoreRing
                          value={overallScore}
                          max={100}
                          size={88}
                          label={t.bestStatOverallScore}
                        />
                        {scoreRank !== null && totalResultsCount > 0 && (
                          <span className="font-mono text-xs font-semibold tabular-nums text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                            #{scoreRank} / {totalResultsCount}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 4 Visual StatCards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <StatCard
                        label={t.bestStatSales}
                        value={salesValue}
                        unit={salesVolume !== null ? t.bestSoldUnit : undefined}
                        sub={salesSub}
                        tone={salesVolume !== null ? 'sky' : 'zinc'}
                        icon={<TrendingUp className="w-4 h-4" />}
                      />

                      <StatCard
                        label={t.bestStatCompetition}
                        value={competitionValue}
                        unit={creatorNumber !== null ? t.bestCreatorsUnit : undefined}
                        sub={competitionSub}
                        tone={competitionTone}
                        icon={<Users className="w-4 h-4" />}
                      />

                      <StatCard
                        label={t.bestStatAiContent}
                        value={aiValue}
                        unit={aiScore !== null ? '/100' : undefined}
                        sub={t.aiVideoLabels[product.aiVideoSuitability]}
                        progress={aiScore ?? undefined}
                        tone={aiScore !== null ? 'teal' : 'zinc'}
                        icon={<Sparkles className="w-4 h-4" />}
                      />

                      <StatCard
                        label={t.bestStatDataConfidence}
                        value={`${evaluation.confidencePct}%`}
                        sub={`${evaluation.verifiedCount}/${evaluation.totalCriteria} ${t.bestVerifiedUnit}`}
                        progress={evaluation.confidencePct}
                        tone={confidenceTone}
                        icon={<ShieldCheck className="w-4 h-4" />}
                      />
                    </div>

                    {/* Two 44px Action Buttons */}
                    <div className="pt-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => onOpenReport(product)}
                        className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 text-[13px] font-semibold text-white dark:text-zinc-950 bg-zinc-950 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white rounded-lg transition-colors cursor-pointer whitespace-nowrap sm:flex-1"
                      >
                        <span>{t.cardOpenReport}</span>
                        <ArrowUpRight className="w-4 h-4 shrink-0" aria-hidden="true" />
                      </button>

                      <button
                        type="button"
                        onClick={() => onToggleCompare(product)}
                        aria-pressed={isSelectedForCompare}
                        className={`inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 text-[13px] font-semibold rounded-lg border transition-colors cursor-pointer whitespace-nowrap sm:flex-1 ${
                          isSelectedForCompare
                            ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                            : 'bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500'
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

          {/* Compact Cards Below for Products Winning Only One Award */}
          {compactWinners.length > 0 && (
            <div className="space-y-2.5">
              <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                {t.bestOtherCategoryWinners}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {compactWinners.map((group) => {
                  const { product, awards } = group;
                  const award = awards[0];
                  const meta = AWARD_BADGE_META[award.category];
                  const Icon = meta.Icon;
                  const shortLabel = formatAwardLabel(award.category);
                  const imageConfig = resolveProductImageDisplayConfig(product);
                  const displayName = isMy ? product.nameMy : product.name;
                  const isSelectedForCompare = comparedIds.has(product.id);
                  const evaluation = evaluations?.get(product.id) ?? evaluateProductOpportunity(product);
                  const scoreRank = scoreRankByProductId.get(product.id) ?? null;
                  const showHighCompNote =
                    award.category === 'lowestCompetition' && product.competitionLevel === 'High';

                  return (
                    <article
                      key={group.productKey}
                      className="bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-xl p-4 flex flex-col justify-between gap-3"
                    >
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span
                            title={t.bestSelectionCategories[award.category]}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full border whitespace-nowrap ${meta.badgeClass}`}
                          >
                            <Icon
                              className={`w-3.5 h-3.5 shrink-0 ${meta.iconClass}`}
                              aria-hidden="true"
                            />
                            <span>{shortLabel}</span>
                          </span>

                          <span className="font-mono text-xs font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">
                            {isMy ? award.metricSummaryMy : award.metricSummaryEn}
                          </span>
                        </div>

                        {showHighCompNote && (
                          <p className="text-xs text-red-700 dark:text-red-400 leading-snug">
                            {t.bestCompetitionStillHighNote}
                          </p>
                        )}

                        <div className="flex items-center gap-3 min-w-0">
                          <button
                            type="button"
                            onClick={() => onOpenReport(product)}
                            aria-label={displayName}
                            className="w-14 h-14 rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700/80 shrink-0 cursor-pointer"
                          >
                            {imageConfig.canRender && imageConfig.src ? (
                              <ProductImage
                                src={imageConfig.src}
                                fallbackSrc={imageConfig.fallbackSrc}
                                productId={imageConfig.productId}
                                alt={product.name}
                                title={displayName}
                                unavailableLabel={t.cardImageUnverified}
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <ImageOff
                                  className="w-4 h-4 text-zinc-400 dark:text-zinc-500"
                                  aria-hidden="true"
                                />
                              </div>
                            )}
                          </button>

                          <div className="min-w-0 flex-1">
                            <button
                              type="button"
                              onClick={() => onOpenReport(product)}
                              className="text-left cursor-pointer group/compact focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-200 rounded-sm"
                            >
                              <h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50 leading-snug line-clamp-2 group-hover/compact:underline">
                                {displayName}
                              </h3>
                            </button>
                          </div>

                          <div className="flex flex-col items-center gap-0.5 shrink-0">
                            <ScoreRing value={evaluation.totalScore} max={100} size={52} />
                            {scoreRank !== null && totalResultsCount > 0 && (
                              <span className="font-mono text-xs font-semibold tabular-nums text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                                #{scoreRank} / {totalResultsCount}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onOpenReport(product)}
                          className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 py-2 text-xs font-semibold text-zinc-900 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap flex-1"
                        >
                          <span>{t.cardOpenReport}</span>
                          <ArrowUpRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        </button>

                        <button
                          type="button"
                          onClick={() => onToggleCompare(product)}
                          aria-pressed={isSelectedForCompare}
                          className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer whitespace-nowrap flex-1 ${
                            isSelectedForCompare
                              ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                              : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500'
                          }`}
                        >
                          <GitCompareArrows className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          <span>
                            {isSelectedForCompare ? t.compareSelectedBtn : t.compareSelectBtn}
                          </span>
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}

          {/* Honest Insufficient-Data Categories (Only shown when some categories had no eligible winner) */}
          {insufficientItems.length > 0 && (
            <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80 grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {insufficientItems.map((item) => {
                const meta = AWARD_BADGE_META[item.category];
                const Icon = meta.Icon;
                return (
                  <div
                    key={item.category}
                    className="flex items-start gap-2.5 p-3 rounded-lg bg-zinc-50/70 dark:bg-zinc-950/40 border border-zinc-200/70 dark:border-zinc-800/80 text-xs"
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
                      <p className="text-zinc-500 dark:text-zinc-400 leading-relaxed">
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
}

