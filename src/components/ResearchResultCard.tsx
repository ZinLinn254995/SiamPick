import { memo } from 'react';
import {
  ArrowUpRight,
  Bookmark,
  ExternalLink,
  GitCompareArrows,
  ImageOff,
  Layers,
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
import {
  formatThb,
  isSafeHttpUrl,
  resolveProductImageDisplayConfig,
} from '../utils/format';
import { evaluateProductOpportunity, normalizeDataStatus } from '../utils/scoring';
import {
  deriveProductDecisionSummary,
  getEffectiveAiSuitabilityBand,
} from '../utils/productAnalytics';
import { TRANSLATIONS } from '../i18n/translations';
import { getCategoryLabel } from '../utils/categoryRegistry';
import { ProductImage } from './ProductImage';
import { InfoPopover } from './InfoPopover';

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
  onOpenDeepDive?: (product: ResearchProduct) => void;
  isCompared?: boolean;
  onToggleCompare?: (product: ResearchProduct) => void;
  language: Language;
  hideRejectAction?: boolean;
}

function decisionColorClass(verdict: ProductDecisionVerdict): string {
  if (verdict === 'recommended') return 'text-emerald-700 dark:text-emerald-400';
  if (verdict === 'worth-testing') return 'text-zinc-900 dark:text-zinc-100';
  if (verdict === 'need-more-data') return 'text-amber-700 dark:text-amber-400';
  return 'text-red-700 dark:text-red-400';
}

function dataStatusColorClass(status: DataStatus): string {
  if (status === 'verified') return 'text-emerald-700 dark:text-emerald-400';
  if (status === 'estimated') return 'text-amber-700 dark:text-amber-400';
  return 'text-zinc-400 dark:text-zinc-500';
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
  onOpenDeepDive,
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
  const categoryLabel = getCategoryLabel(product.category, language, { short: true });

  const isSaved = decision === 'saved';
  const isRejected = decision === 'rejected';

  const imageConfig = resolveProductImageDisplayConfig(product);
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
      ? 'text-emerald-700 dark:text-emerald-400'
      : evaluation.confidenceLevel === 'Medium'
        ? 'text-amber-700 dark:text-amber-400'
        : 'text-zinc-500 dark:text-zinc-400';

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
    ? 'text-zinc-400 dark:text-zinc-500'
    : product.competitionLevel === 'Low'
      ? 'text-emerald-700 dark:text-emerald-400'
      : product.competitionLevel === 'Moderate'
        ? 'text-zinc-900 dark:text-zinc-100'
        : 'text-amber-700 dark:text-amber-400';

  const aiDisplay = t.aiVideoLabels[getEffectiveAiSuitabilityBand(product, evaluation)];
  const hasSalesVolume =
    typeof product.kalodataMetrics?.salesVolume === 'number' &&
    Number.isFinite(product.kalodataMetrics.salesVolume);

  return (
    <article
      className={`group bg-white dark:bg-zinc-900 border rounded-xl overflow-hidden flex flex-col transition-all duration-200 ${
        isRejected
          ? 'border-zinc-200 dark:border-zinc-800 opacity-80'
          : 'border-zinc-200/90 dark:border-zinc-800 hover:-translate-y-0.5 hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-[0_10px_28px_-14px_rgba(9,9,11,0.12)]'
      }`}
    >
      {/* Product Image */}
      <button
        type="button"
        onClick={() => onOpenReport(product)}
        aria-label={`${t.cardOpenReport}: ${displayName}`}
        className="block relative aspect-[4/3] w-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-200"
      >
        {imageConfig.canRender && imageConfig.src ? (
          <ProductImage
            src={imageConfig.src}
            fallbackSrc={imageConfig.fallbackSrc}
            productId={imageConfig.productId}
            alt={product.name}
            title={displayName}
            unavailableLabel={t.cardImageUnverified}
            className="transition-transform duration-300 ease-out group-hover:scale-[1.03]"
          />
        ) : (
          <div className="w-full h-full bg-zinc-100/90 dark:bg-zinc-800/90 flex flex-col items-center justify-center p-6 text-center">
            <ImageOff className="w-6 h-6 text-zinc-400 dark:text-zinc-500 mb-2" aria-hidden="true" />
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              {t.cardImageUnverified}
            </span>
          </div>
        )}
      </button>

      {/* Card Body */}
      <div className="p-4 sm:p-5 flex-1 flex flex-col">
        {/* Top Row: Category · Subcategory · Brand · Shop + Title + 100-Point Score */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
              {categoryLabel} · {subCategory} ·{' '}
              {product.brand ? `${product.brand} · ` : ''}
              {product.shopName}
            </div>
            <button
              type="button"
              onClick={() => onOpenReport(product)}
              className="mt-1 text-left cursor-pointer group/title focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-200 rounded-sm"
            >
              <h3 className="font-display text-sm sm:text-base font-semibold text-zinc-950 dark:text-zinc-50 leading-snug line-clamp-2 group-hover/title:text-zinc-700 transition-colors min-h-[2.5rem]">
                {displayName}
              </h3>
            </button>
          </div>

          <div className="text-right shrink-0 pl-2.5 border-l border-zinc-100 dark:border-zinc-800/70">
            <div className="font-mono text-xl font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums leading-none">
              {evaluation.totalScore}
            </div>
            <div className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500 mt-1">/100</div>
          </div>
        </div>

        {/* Verdict + Confidence */}
        <div className="mt-2 flex items-center justify-between gap-2 text-xs">
          <span className={`font-semibold truncate ${decisionColorClass(decisionSummary.verdict)}`}>
            {t.decisionVerdictLabels[decisionSummary.verdict]}
          </span>
          <span className={`text-[11px] font-medium shrink-0 ${confidenceColor}`}>
            {t.confidenceLabels[evaluation.confidenceLevel]}{' '}
            <span className="font-mono tabular-nums opacity-80">{evaluation.confidencePct}%</span>
          </span>
        </div>

        {/* Phase 9: Confirmed Myanmar Video or Review Evidence (Rendered ONLY when verifiable match exists) */}
        {product.myanmarLanguage?.matched &&
          ((product.myanmarLanguage.matchedVideos?.length ?? 0) > 0 ||
            product.myanmarLanguage.matchedReviews?.length > 0 ||
            product.myanmarLanguage.evidences.length > 0) && (() => {
            const ml = product.myanmarLanguage!;
            const matchedVideos = ml.matchedVideos ?? [];
            const matchedReviews = ml.matchedReviews ?? [];
            const isVideoBacked = matchedVideos.length > 0;
            const hasMixed = isVideoBacked
              ? matchedVideos.some((v) => v.isMixedThaiBurmese)
              : matchedReviews.some((r) => r.isMixedThaiBurmese);
            const firstQuote = isVideoBacked
              ? matchedVideos[0]?.captionSnippet ?? ''
              : matchedReviews[0]?.snippet ?? ml.evidences[0]?.snippet ?? '';
            const firstCreator = isVideoBacked
              ? matchedVideos[0]?.creatorHandle || matchedVideos[0]?.creatorName || null
              : null;
            return (
              <div className="mt-2.5 px-2.5 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-800/80 space-y-1 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                      {isVideoBacked ? t.myanmarVideoCardLabel : t.myanmarSignalCardLabel}
                    </span>
                    <span
                      className={`font-mono text-[11px] font-medium shrink-0 ${
                        ml.confidence === 'High'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : ml.confidence === 'Medium'
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-zinc-600 dark:text-zinc-400'
                      }`}
                    >
                      {t.myanmarConfidenceLabels[ml.confidence]}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isVideoBacked ? (
                      <span className="font-mono text-[10px] text-zinc-600 dark:text-zinc-400 tabular-nums">
                        {ml.matchedVideoCount ?? matchedVideos.length} {t.myanmarVideosMatchedLabel}
                      </span>
                    ) : ml.matchedReviewCount > 0 ? (
                      <span className="font-mono text-[10px] text-zinc-600 dark:text-zinc-400 tabular-nums">
                        {ml.matchedReviewCount}/{ml.totalReviewsChecked}{' '}
                        {t.myanmarReviewsMatchedLabel}
                      </span>
                    ) : null}
                    {hasMixed && (
                      <span className="text-[10px] font-medium text-amber-700 dark:text-amber-400">
                        · {t.myanmarMixedThaiBurmeseTag}
                      </span>
                    )}
                    <InfoPopover
                      variant="info"
                      label={t.myanmarSignalSectionHeading}
                      title={
                        isVideoBacked
                          ? t.myanmarVideoEvidenceHeading
                          : t.myanmarSignalSectionHeading
                      }
                      content={
                        <div className="space-y-2">
                          {isVideoBacked ? (
                            <div className="space-y-2">
                              {matchedVideos.slice(0, 3).map((vid, idx) => (
                                <div
                                  key={`vid-${vid.videoId}-${idx}`}
                                  className="text-[11px] leading-snug space-y-0.5"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                                      {vid.creatorHandle ||
                                        vid.creatorName ||
                                        t.myanmarMatchTypeLabels[vid.matchType]}
                                    </span>
                                    {typeof vid.videoRevenueThb === 'number' && (
                                      <span className="font-mono text-[10px] text-emerald-700 dark:text-emerald-400 tabular-nums shrink-0">
                                        {formatThb(vid.videoRevenueThb)}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-zinc-700 dark:text-zinc-300 break-words">
                                    “{vid.captionSnippet}”
                                  </div>
                                  {isSafeHttpUrl(vid.videoUrl) && (
                                    <a
                                      href={vid.videoUrl!}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-[10px] font-medium text-zinc-900 dark:text-zinc-100 hover:underline pt-0.5"
                                    >
                                      <span>{t.myanmarVideoOpenLinkLabel}</span>
                                      <ExternalLink className="w-2.5 h-2.5" aria-hidden="true" />
                                    </a>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <>
                              <div className="text-[11px] text-zinc-600 dark:text-zinc-400 font-mono tabular-nums">
                                {ml.matchedReviewCount} {t.myanmarReviewsMatchedLabel} /{' '}
                                {ml.totalReviewsChecked} {t.myanmarReviewsCheckedLabel}
                              </div>
                              <div className="space-y-1.5">
                                {matchedReviews.length > 0
                                  ? matchedReviews.slice(0, 3).map((rv, idx) => (
                                      <div
                                        key={`rv-${idx}`}
                                        className="text-[11px] leading-snug"
                                      >
                                        <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                                          {t.myanmarMatchTypeLabels[rv.matchType]}
                                        </span>
                                        {rv.isMixedThaiBurmese && (
                                          <span className="text-amber-700 dark:text-amber-400">
                                            {' '}
                                            · {t.myanmarMixedThaiBurmeseTag}
                                          </span>
                                        )}
                                        <div className="text-zinc-700 dark:text-zinc-300 mt-0.5 break-words">
                                          “{rv.snippet}”
                                        </div>
                                      </div>
                                    ))
                                  : ml.evidences.slice(0, 3).map((ev, idx) => (
                                      <div
                                        key={`${ev.source}-${idx}`}
                                        className="text-[11px] leading-snug"
                                      >
                                        <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                                          {t.myanmarSourceLabels[ev.source]}
                                        </span>{' '}
                                        <span className="text-zinc-400 dark:text-zinc-500">
                                          ({t.myanmarMatchTypeLabels[ev.matchType]})
                                        </span>
                                        <div className="text-zinc-700 dark:text-zinc-300 mt-0.5 break-words">
                                          “{ev.snippet}”
                                        </div>
                                      </div>
                                    ))}
                              </div>
                            </>
                          )}
                          <p className="pt-1.5 border-t border-zinc-100 dark:border-zinc-800/70 text-[10px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                            {isMy ? ml.marketScopeNoteMy : ml.marketScopeNoteEn}
                          </p>
                        </div>
                      }
                    />
                  </div>
                </div>
                {firstQuote && (
                  <p className="text-[11px] text-zinc-600 dark:text-zinc-400 line-clamp-1">
                    {firstCreator ? (
                      <span className="font-medium text-zinc-800 dark:text-zinc-200 mr-1">{firstCreator}:</span>
                    ) : null}
                    “{firstQuote}”
                  </p>
                )}
              </div>
            );
          })()}

        {/* Price · Commission · Sales Grid */}
        <div className="mt-3.5 pt-3 border-t border-zinc-100 dark:border-zinc-800/70 grid grid-cols-3 gap-2">
          <div className="min-w-0">
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{t.cardPrice}</div>
            {product.priceThb !== null && product.priceThb > 0 ? (
              <>
                <div className="mt-0.5 font-mono text-sm font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums truncate">
                  {formatThb(product.priceThb)}
                </div>
                <div
                  className={`text-[10px] font-medium truncate ${dataStatusColorClass(effectivePriceStatus)}`}
                >
                  {t.dataStatusLabels[effectivePriceStatus]}
                </div>
              </>
            ) : (
              <div className="mt-0.5 text-xs font-medium text-zinc-400 dark:text-zinc-500 truncate">
                {t.dataStatusLabels[effectivePriceStatus]}
              </div>
            )}
          </div>

          <div className="min-w-0">
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{t.cardCommission}</div>
            {hasVerifiedCommission && product.commissionRate !== null ? (
              <>
                <div className="mt-0.5 font-mono text-sm font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums truncate">
                  {product.commissionRate}%
                </div>
                {earningPerOrderThb !== null ? (
                  <div className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 tabular-nums truncate">
                    {formatThb(earningPerOrderThb)} {t.perOrder}
                  </div>
                ) : (
                  <div
                    className={`text-[10px] font-medium truncate ${dataStatusColorClass(effectiveCommissionStatus)}`}
                  >
                    {t.dataStatusLabels[effectiveCommissionStatus]}
                  </div>
                )}
              </>
            ) : (
              <div className="mt-0.5 text-xs font-medium text-zinc-400 dark:text-zinc-500 truncate">
                {t.dataStatusLabels[effectiveCommissionStatus]}
              </div>
            )}
          </div>

          <div className="min-w-0">
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
              {isMy ? 'ရောင်းအား' : 'Sales'}
            </div>
            <div className="mt-0.5 font-mono text-sm font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums truncate">
              {hasSalesVolume ? (
                product.kalodataMetrics!.salesVolume!.toLocaleString('en-US')
              ) : (
                <span className="font-sans text-xs font-medium text-zinc-400 dark:text-zinc-500">
                  {t.dataStatusLabels.unavailable}
                </span>
              )}
            </div>
            <div className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">
              {t.demandLabels[product.demandLevel]}
            </div>
          </div>
        </div>

        {/* Secondary Signals Always Visible */}
        <dl className="mt-3 pt-2.5 border-t border-zinc-100 dark:border-zinc-800/70 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
          <div>
            <dt className="text-[11px] text-zinc-500 dark:text-zinc-400">{t.cardRatingReviews}</dt>
            <dd className="mt-0.5 font-mono text-xs text-zinc-900 dark:text-zinc-100 tabular-nums">
              {hasRating || hasReviews ? (
                <span className="inline-flex items-center gap-1 flex-wrap">
                  {hasRating && (
                    <span className="inline-flex items-center gap-0.5 font-semibold">
                      <Star className="w-3 h-3 text-amber-500 fill-amber-500" aria-hidden="true" />
                      {product.customerRating!.toFixed(1)}
                    </span>
                  )}
                  {hasReviews && (
                    <span className="text-zinc-500 dark:text-zinc-400 text-[11px]">
                      ({product.reviewCount!.toLocaleString()})
                    </span>
                  )}
                </span>
              ) : (
                <span className="font-sans text-[11px] text-zinc-400 dark:text-zinc-500">
                  {t.dataStatusLabels[ratingStatus]}
                </span>
              )}
            </dd>
          </div>

          <div>
            <dt className="text-[11px] text-zinc-500 dark:text-zinc-400">{t.cardCompetition}</dt>
            <dd className={`mt-0.5 font-medium ${competitionColor}`}>
              {competitionDisplay}
            </dd>
          </div>

          <div>
            <dt className="text-[11px] text-zinc-500 dark:text-zinc-400">{t.cardAiVideo}</dt>
            <dd className="mt-0.5 font-medium text-zinc-900 dark:text-zinc-100">{aiDisplay}</dd>
          </div>

          <div>
            <dt className="text-[11px] text-zinc-500 dark:text-zinc-400">{t.scoringVerifiedCountLabel}</dt>
            <dd className="mt-0.5 font-mono text-xs text-zinc-700 dark:text-zinc-300 tabular-nums">
              {evaluation.verifiedCount}/{evaluation.totalCriteria}
              {product.researchDepthTag === 'deep-audited' && (
                <span className="font-sans text-[11px] text-emerald-700 dark:text-emerald-400 ml-1">
                  · {t.depthTagDeep}
                </span>
              )}
              {product.researchDepthTag === 'detail-enriched' && (
                <span className="font-sans text-[11px] text-zinc-600 dark:text-zinc-400 ml-1">
                  · {t.depthTagDetail}
                </span>
              )}
            </dd>
          </div>
        </dl>

        {/* Report + Compare + Save/Reject Actions */}
        <div className="mt-auto pt-3.5">
          <div className="pt-2.5 border-t border-zinc-100 dark:border-zinc-800/70 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => onOpenReport(product)}
                className="inline-flex items-center gap-1 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-50 transition-colors cursor-pointer py-1 whitespace-nowrap"
              >
                <span>{t.cardOpenReport}</span>
                <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>

              {onOpenDeepDive && (
                <button
                  type="button"
                  onClick={() => onOpenDeepDive(product)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-50 transition-colors cursor-pointer py-1 whitespace-nowrap"
                >
                  <Layers className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Deep Dive</span>
                </button>
              )}
            </div>

            {onToggleCompare ? (
              <button
                type="button"
                onClick={() => onToggleCompare(product)}
                aria-pressed={isCompared}
                className={`inline-flex items-center gap-1 text-xs font-medium py-1 transition-colors cursor-pointer whitespace-nowrap ${
                  isCompared
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50'
                }`}
              >
                <GitCompareArrows className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{isCompared ? t.compareSelectedBtn : t.compareSelectBtn}</span>
              </button>
            ) : evaluation.redistributedWeightPct > 0 ? (
              <span className="font-mono text-[10px] text-amber-700 dark:text-amber-400 tabular-nums">
                {evaluation.unavailableCount} {t.dataStatusLabels.unavailable.toLowerCase()}
              </span>
            ) : null}
          </div>

          <div className={`mt-2.5 grid gap-2 ${hideRejectAction ? 'grid-cols-1' : 'grid-cols-2'}`}>
            <button
              type="button"
              onClick={() => onSave(product.id)}
              aria-pressed={isSaved}
              className={`inline-flex items-center justify-center gap-1.5 min-h-[38px] px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                isSaved
                  ? 'bg-emerald-700 dark:bg-emerald-600 text-white hover:bg-emerald-800 dark:hover:bg-emerald-500'
                  : 'bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-white'
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
                className={`inline-flex items-center justify-center gap-1.5 min-h-[38px] px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
                  isRejected
                    ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border-zinc-300 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                    : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:border-red-300 dark:hover:border-red-700 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50/40 dark:hover:bg-red-950/40'
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
