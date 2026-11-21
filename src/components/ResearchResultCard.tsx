import { memo } from 'react';
import {
  ArrowUpRight,
  Bookmark,
  GitCompareArrows,
  ImageOff,
  RotateCcw,
  Star,
  X,
} from 'lucide-react';
import {
  DataStatus,
  Language,
  OpportunityEvaluation,
  ProductDecision,
  ProductDecisionSummary,
  ProductDecisionVerdict,
  ResearchProduct,
} from '../types/product';
import { formatThb } from '../utils/format';
import { evaluateProductOpportunity, normalizeDataStatus } from '../utils/scoring';
import { deriveProductDecisionSummary } from '../utils/productAnalytics';
import { TRANSLATIONS } from '../i18n/translations';
import { ProductImage } from './ProductImage';

interface ResearchResultCardProps {
  product: ResearchProduct;
  evaluation?: OpportunityEvaluation;
  decisionSummary?: ProductDecisionSummary;
  salesWeightPct?: number;
  peerProducts?: readonly ResearchProduct[];
  decision: ProductDecision;
  onSave: (id: string) => void;
  onReject: (id: string) => void;
  onOpenReport: (product: ResearchProduct) => void;
  isCompared?: boolean;
  onToggleCompare?: (product: ResearchProduct) => void;
  language: Language;
  hideRejectAction?: boolean;
}

function decisionColorClass(verdict: ProductDecisionVerdict): string {
  if (verdict === 'recommended') return 'text-emerald-700';
  if (verdict === 'worth-testing') return 'text-zinc-900';
  if (verdict === 'need-more-data') return 'text-amber-700';
  return 'text-red-700';
}

function dataStatusColorClass(status: DataStatus): string {
  if (status === 'verified') return 'text-emerald-700';
  if (status === 'estimated') return 'text-amber-700';
  return 'text-zinc-400';
}

export const ResearchResultCard = memo(function ResearchResultCard({
  product,
  evaluation: providedEvaluation,
  decisionSummary: providedDecisionSummary,
  salesWeightPct = 50,
  peerProducts,
  decision,
  onSave,
  onReject,
  onOpenReport,
  isCompared = false,
  onToggleCompare,
  language,
  hideRejectAction = false,
}: ResearchResultCardProps) {
  const t = TRANSLATIONS[language];
  const isMy = language === 'my';
  const evaluation =
    providedEvaluation ??
    evaluateProductOpportunity(product, {
      salesWeightPct,
      peerProducts,
    });
  const decisionSummary =
    providedDecisionSummary ?? deriveProductDecisionSummary(product, evaluation);

  const displayName = isMy ? product.nameMy : product.name;
  const subCategory = isMy ? product.subCategoryMy : product.subCategory;
  const categoryLabel =
    product.category === 'womens-fashion' ? t.categoryFashion : t.categoryBeauty;

  const isSaved = decision === 'saved';
  const isRejected = decision === 'rejected';

  const hasVerifiedImage = product.imageVerified && Boolean(product.imageUrl);
  const hasVerifiedCommission =
    product.commissionVerified && product.commissionRate !== null;

  const effectivePriceStatus: DataStatus = normalizeDataStatus(
    product.priceThb === null || product.priceThb <= 0
      ? 'unavailable'
      : (product.priceStatus ?? 'estimated')
  );

  const effectiveCommissionStatus: DataStatus = hasVerifiedCommission
    ? 'verified'
    : normalizeDataStatus(product.commissionStatus ?? 'unavailable');

  const earningPerOrderThb =
    product.estimatedCommissionPerSaleThb ??
    (hasVerifiedCommission &&
    product.commissionRate !== null &&
    product.priceThb !== null &&
    product.priceThb > 0
      ? Math.round((product.priceThb * product.commissionRate) / 100)
      : null);

  const hasRating = typeof product.customerRating === 'number' && product.customerRating > 0;
  const hasReviews = typeof product.reviewCount === 'number' && product.reviewCount > 0;
  const ratingStatus: DataStatus = normalizeDataStatus(
    hasRating
      ? (product.customerRatingStatus ?? 'estimated')
      : hasReviews
        ? (product.reviewCountStatus ?? 'estimated')
        : 'unavailable'
  );

  const confidenceColor =
    evaluation.confidenceLevel === 'High'
      ? 'text-emerald-700'
      : evaluation.confidenceLevel === 'Medium'
        ? 'text-amber-700'
        : 'text-zinc-500';

  const competitionFactor = evaluation.criteria.find((c) => c.key === 'competition');
  const competitionUnavailable =
    competitionFactor?.verification === 'unavailable' ||
    (product.kalodataMetrics !== undefined &&
      (product.kalodataMetrics.creatorNumber === null ||
        product.kalodataMetrics.creatorNumber === undefined));

  const competitionDisplay = competitionUnavailable
    ? t.dataStatusLabels.unavailable
    : t.competitionLabels[product.competitionLevel];

  const competitionColor = competitionUnavailable
    ? 'text-zinc-400'
    : product.competitionLevel === 'Low'
      ? 'text-emerald-700'
      : product.competitionLevel === 'Moderate'
        ? 'text-zinc-900'
        : 'text-amber-700';

  const aiFactor = evaluation.criteria.find((c) => c.key === 'aiContentSuitability');
  const aiDisplay =
    aiFactor && aiFactor.normalizedScore !== null
      ? aiFactor.normalizedScore >= 76
        ? t.aiVideoLabels.High
        : aiFactor.normalizedScore >= 58
          ? t.aiVideoLabels.Good
          : t.aiVideoLabels.Moderate
      : t.aiVideoLabels[product.aiVideoSuitability];

  return (
    <article
      className={`group bg-white border rounded-xl overflow-hidden flex flex-col transition-all duration-200 ${
        isRejected
          ? 'border-zinc-200 opacity-80'
          : 'border-zinc-200/90 hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-[0_10px_28px_-14px_rgba(9,9,11,0.12)]'
      }`}
    >
      {/* Product Image — Rendered ONLY when retrieved & verified from official brand/listing page */}
      <button
        type="button"
        onClick={() => onOpenReport(product)}
        aria-label={`${t.cardOpenReport}: ${displayName}`}
        className="block relative aspect-[4/3] w-full bg-zinc-100 overflow-hidden text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-900"
      >
        {hasVerifiedImage && product.imageUrl ? (
          <ProductImage
            src={product.imageUrl}
            alt={product.name}
            title={displayName}
            unavailableLabel={t.cardImageUnverified}
            className="transition-transform duration-300 ease-out group-hover:scale-[1.03]"
          />
        ) : (
          <div className="w-full h-full bg-zinc-100/90 flex flex-col items-center justify-center p-6 text-center">
            <ImageOff className="w-6 h-6 text-zinc-400 mb-2" aria-hidden="true" />
            <span className="text-xs font-medium text-zinc-500">
              {t.cardImageUnverified}
            </span>
          </div>
        )}
      </button>

      {/* Card Body */}
      <div className="p-5 flex-1 flex flex-col">
        {/* Category Metadata + Brand/Seller + Opportunity Score */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-zinc-500 truncate">
              {categoryLabel} · {subCategory}
            </div>
            <button
              type="button"
              onClick={() => onOpenReport(product)}
              className="mt-1.5 text-left cursor-pointer group/title focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 rounded-sm"
            >
              <h3 className="font-display text-base font-semibold text-zinc-950 leading-snug line-clamp-2 group-hover/title:text-zinc-700 transition-colors min-h-[2.75rem]">
                {displayName}
              </h3>
            </button>
            <div className="mt-1 text-[11px] text-zinc-500 truncate">
              {product.brand ? `${product.brand} · ` : ''}
              {product.shopName}
            </div>
          </div>

          {/* Phase 2 100-Point Product Score */}
          <div className="text-right shrink-0 pl-2.5 border-l border-zinc-100">
            <div className="text-[11px] text-zinc-500 whitespace-nowrap">
              {t.cardOpportunityScore}
            </div>
            <div className="font-mono text-xl font-semibold text-zinc-950 tabular-nums leading-tight mt-0.5">
              {evaluation.totalScore}
              <span className="text-xs font-normal text-zinc-400">/100</span>
            </div>
          </div>
        </div>

        {/* Product Decision Summary (Multi-Signal Verdict) + Evidence Coverage */}
        <div className="mt-2.5 flex items-center justify-between gap-2 text-xs">
          <span className={`font-semibold truncate ${decisionColorClass(decisionSummary.verdict)}`}>
            {t.decisionVerdictLabels[decisionSummary.verdict]}
          </span>
          <span className="font-mono text-[11px] text-zinc-500 tabular-nums shrink-0">
            {product.researchDepthTag === 'deep-audited' && (
              <span className="font-sans font-medium text-emerald-700 mr-1.5">
                {t.depthTagDeep} ·
              </span>
            )}
            {product.researchDepthTag === 'detail-enriched' && (
              <span className="font-sans font-medium text-zinc-700 mr-1.5">
                {t.depthTagDetail} ·
              </span>
            )}
            {evaluation.verifiedCount}/{evaluation.totalCriteria} {t.scoringVerifiedCountLabel}
          </span>
        </div>

        {/* Price (THB) & Verified-Only Commission Rate (with 4-state DataStatus) */}
        <div className="mt-3.5 pt-3.5 border-t border-zinc-100 grid grid-cols-2 gap-3">
          <div>
            <div className="flex items-baseline gap-1.5 text-[11px] text-zinc-500">
              <span>{t.cardPrice}</span>
            </div>
            {product.priceThb !== null && product.priceThb > 0 ? (
              <div className="mt-0.5 flex flex-wrap items-baseline gap-1.5">
                <span className="font-mono text-sm font-semibold text-zinc-950 tabular-nums">
                  {formatThb(product.priceThb)}
                </span>
                <span
                  className={`text-[11px] font-medium ${dataStatusColorClass(effectivePriceStatus)}`}
                >
                  {t.dataStatusLabels[effectivePriceStatus]}
                </span>
              </div>
            ) : (
              <div className="mt-0.5 text-xs font-medium text-zinc-400">
                {t.dataStatusLabels[effectivePriceStatus]}
              </div>
            )}
          </div>

          <div>
            <div className="text-[11px] text-zinc-500">{t.cardCommission}</div>
            {hasVerifiedCommission && product.commissionRate !== null ? (
              <div className="mt-0.5 flex items-baseline gap-1.5 flex-wrap">
                <span className="font-mono text-sm font-semibold text-emerald-700 tabular-nums">
                  {product.commissionRate}%
                </span>
                {earningPerOrderThb !== null ? (
                  <span className="font-mono text-[11px] text-zinc-500 tabular-nums">
                    ({formatThb(earningPerOrderThb)} {t.perOrder})
                  </span>
                ) : (
                  <span className="text-[11px] font-medium text-emerald-700">
                    {t.dataStatusLabels.verified}
                  </span>
                )}
              </div>
            ) : (
              <div className="mt-0.5 text-xs font-medium text-zinc-400">
                {t.dataStatusLabels[effectiveCommissionStatus]}
              </div>
            )}
          </div>
        </div>

        {/* Rating & Reviews Strip (Only when real figures found; otherwise explicit status) */}
        <div className="mt-3 pt-3 border-t border-zinc-100 flex items-center justify-between gap-2 text-xs">
          <span className="text-[11px] text-zinc-500">{t.cardRatingReviews}</span>
          {hasRating || hasReviews ? (
            <div className="flex items-center gap-1.5 font-mono tabular-nums text-zinc-900">
              {hasRating && (
                <span className="inline-flex items-center gap-0.5 font-semibold">
                  <Star className="w-3 h-3 text-amber-500 fill-amber-500" aria-hidden="true" />
                  {product.customerRating!.toFixed(1)}
                </span>
              )}
              {hasReviews && (
                <span className="text-zinc-500 text-[11px]">
                  ({product.reviewCount!.toLocaleString()} {t.cardReviewsUnit})
                </span>
              )}
              <span className={`font-sans text-[11px] font-medium ${dataStatusColorClass(ratingStatus)}`}>
                · {t.dataStatusLabels[ratingStatus]}
              </span>
            </div>
          ) : (
            <span className="text-[11px] font-medium text-zinc-400">
              {t.dataStatusLabels[ratingStatus]}
            </span>
          )}
        </div>

        {/* Structured Signals Grid: Sales, Competition, AI Video Fit, Data Confidence */}
        <dl className="mt-3 pt-3 border-t border-zinc-100 grid grid-cols-2 gap-x-3 gap-y-2.5 text-xs">
          <div>
            <dt className="text-[11px] text-zinc-500">
              {isMy ? 'ရောင်းအား (Sales)' : 'Sales Volume'}
            </dt>
            <dd className="mt-0.5 font-mono font-medium text-zinc-900 tabular-nums truncate">
              {typeof product.kalodataMetrics?.salesVolume === 'number' &&
              Number.isFinite(product.kalodataMetrics.salesVolume) ? (
                <>
                  {product.kalodataMetrics.salesVolume.toLocaleString('en-US')}{' '}
                  <span className="font-sans text-[11px] text-zinc-500">
                    {isMy ? 'ခု' : 'units'}
                  </span>
                </>
              ) : (
                <span className="font-sans text-zinc-400">
                  {t.dataStatusLabels.unavailable}
                </span>
              )}
            </dd>
          </div>

          <div>
            <dt className="text-[11px] text-zinc-500">{t.cardCompetition}</dt>
            <dd className={`mt-0.5 font-medium ${competitionColor}`}>
              {competitionDisplay}
            </dd>
          </div>

          <div>
            <dt className="text-[11px] text-zinc-500">{t.cardAiVideo}</dt>
            <dd className="mt-0.5 font-medium text-zinc-900">{aiDisplay}</dd>
          </div>

          <div>
            <dt className="text-[11px] text-zinc-500">{t.cardConfidence}</dt>
            <dd className={`mt-0.5 font-medium ${confidenceColor}`}>
              {t.confidenceLabels[evaluation.confidenceLevel]}{' '}
              <span className="font-mono text-[11px] tabular-nums opacity-80">
                ({evaluation.confidencePct}%)
              </span>
            </dd>
          </div>
        </dl>

        {/* Quiet Link to Full Research Report + Compare Toggle */}
        <div className="mt-auto pt-4">
          <div className="pt-3 border-t border-zinc-100 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => onOpenReport(product)}
              className="inline-flex items-center gap-1 text-xs font-medium text-zinc-700 hover:text-zinc-950 transition-colors cursor-pointer py-1 whitespace-nowrap"
            >
              <span>{t.cardOpenReport}</span>
              <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>

            {onToggleCompare ? (
              <button
                type="button"
                onClick={() => onToggleCompare(product)}
                aria-pressed={isCompared}
                className={`inline-flex items-center gap-1 text-xs font-medium py-1 transition-colors cursor-pointer whitespace-nowrap ${
                  isCompared
                    ? 'text-emerald-700'
                    : 'text-zinc-500 hover:text-zinc-950'
                }`}
              >
                <GitCompareArrows className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{isCompared ? t.compareSelectedBtn : t.compareSelectBtn}</span>
              </button>
            ) : evaluation.redistributedWeightPct > 0 ? (
              <span className="font-mono text-[10px] text-amber-700 tabular-nums">
                {evaluation.unavailableCount} {t.dataStatusLabels.unavailable.toLowerCase()}
              </span>
            ) : null}
          </div>

          {/* Save Product & Reject Product Action Row */}
          <div className={`mt-3 grid gap-2.5 ${hideRejectAction ? 'grid-cols-1' : 'grid-cols-2'}`}>
            <button
              type="button"
              onClick={() => onSave(product.id)}
              aria-pressed={isSaved}
              className={`inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                isSaved
                  ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                  : 'bg-zinc-950 text-white hover:bg-zinc-800'
              }`}
            >
              <Bookmark
                className={`w-3.5 h-3.5 shrink-0 ${isSaved ? 'fill-current' : ''}`}
                aria-hidden="true"
              />
              <span className="truncate">{isSaved ? t.btnSavedProduct : t.btnSaveProduct}</span>
            </button>

            {!hideRejectAction && (
              <button
                type="button"
                onClick={() => onReject(product.id)}
                aria-pressed={isRejected}
                className={`inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 py-2 text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
                  isRejected
                    ? 'bg-zinc-100 text-zinc-800 border-zinc-300 hover:bg-zinc-200'
                    : 'bg-white text-zinc-700 border-zinc-200 hover:border-red-300 hover:text-red-700 hover:bg-red-50/40'
                }`}
              >
                {isRejected ? (
                  <>
                    <RotateCcw className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">{t.btnRestoreProduct}</span>
                  </>
                ) : (
                  <>
                    <X className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">{t.btnRejectProduct}</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
});
