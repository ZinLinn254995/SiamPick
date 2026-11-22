import { memo } from 'react';
import {
  ArrowUpRight,
  Bookmark,
  ExternalLink,
  GitCompareArrows,
  ImageOff,
  Layers,
  RotateCcw,
  X,
} from 'lucide-react';
import {
  DataStatus,
  Language,
  OpportunityEvaluation,
  ProductDecision,
  ProductDecisionSummary,
  ResearchProduct,
} from '../types/product';
import {
  formatThb,
  isSafeHttpUrl,
  resolveProductImageDisplayConfig,
} from '../utils/format';
import { evaluateProductOpportunity, normalizeDataStatus } from '../utils/scoring';
import { deriveProductDecisionSummary } from '../utils/productAnalytics';
import { TRANSLATIONS } from '../i18n/translations';
import { getCategoryLabel } from '../utils/categoryRegistry';
import { ProductImage } from './ProductImage';
import { InfoPopover } from './InfoPopover';
import { ScoreRing, StatusDot, VerdictBadge } from './visual';

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
  rankInfo?: { rank: number; total: number };
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
  rankInfo,
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

  const competitionStatus: DataStatus = competitionUnavailable
    ? 'unavailable'
    : (competitionFactor?.verification ??
      normalizeDataStatus(product.competitionStatus ?? 'estimated'));

  const competitionDisplay = competitionUnavailable
    ? '—'
    : typeof product.kalodataMetrics?.creatorNumber === 'number'
      ? `${product.kalodataMetrics.creatorNumber.toLocaleString('en-US')} ${t.bestCreatorsUnit}`
      : t.competitionLabels[product.competitionLevel];

  const competitionColor = competitionUnavailable
    ? 'text-zinc-500 dark:text-zinc-400'
    : product.competitionLevel === 'Low'
      ? 'text-emerald-700 dark:text-emerald-400'
      : product.competitionLevel === 'Moderate'
        ? 'text-amber-700 dark:text-amber-400'
        : 'text-red-700 dark:text-red-400';

  const hasSalesVolume =
    typeof product.kalodataMetrics?.salesVolume === 'number' &&
    Number.isFinite(product.kalodataMetrics.salesVolume);

  const salesStatus: DataStatus = hasSalesVolume
    ? 'verified'
    : normalizeDataStatus(product.salesEvidenceStatus ?? 'unavailable');

  const hasMyanmarEvidence = Boolean(
    product.myanmarLanguage?.matched &&
      ((product.myanmarLanguage.matchedVideos?.length ?? 0) > 0 ||
        product.myanmarLanguage.matchedReviews?.length > 0 ||
        product.myanmarLanguage.evidences.length > 0)
  );

  return (
    <article
      className={`group sp-card overflow-hidden flex flex-col transition-all duration-200 ${
        isRejected
          ? 'opacity-80'
          : 'hover:-translate-y-0.5 motion-reduce:hover:translate-y-0 hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-[0_10px_28px_-14px_rgba(9,9,11,0.12)]'
      }`}
    >
      {/* Product Image */}
      <button
        type="button"
        onClick={() => onOpenReport(product)}
        aria-label={`${t.cardOpenReport}: ${displayName}`}
        className="block relative aspect-[16/10] sm:aspect-[4/3] w-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-200"
      >
        {imageConfig.canRender && imageConfig.src ? (
          <ProductImage
            src={imageConfig.src}
            fallbackSrc={imageConfig.fallbackSrc}
            productId={imageConfig.productId}
            alt={product.name}
            title={displayName}
            unavailableLabel={t.cardImageUnverified}
            className="transition-transform duration-300 ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        ) : (
          <div className="w-full h-full bg-zinc-100/90 dark:bg-zinc-800/90 flex flex-col items-center justify-center p-5 text-center">
            <ImageOff className="w-6 h-6 text-zinc-500 dark:text-zinc-400 mb-1.5" aria-hidden="true" />
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              {t.cardImageUnverified}
            </span>
          </div>
        )}
      </button>

      {/* Card Body (strictly 5 visual rows) */}
      <div className="p-3.5 sm:p-5 flex-1 flex flex-col gap-3">
        {/* Row 1: Category · Shop + Title + ScoreRing (size 56) */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-xs text-zinc-600 dark:text-zinc-400 truncate">
              {categoryLabel} · {subCategory} · {product.shopName}
            </div>
            <button
              type="button"
              onClick={() => onOpenReport(product)}
              className="mt-1 text-left cursor-pointer group/title focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-200 rounded-sm"
            >
              <h3 className="font-display text-sm sm:text-base font-semibold text-zinc-950 dark:text-zinc-50 leading-snug line-clamp-2 group-hover/title:text-zinc-700 dark:group-hover/title:text-zinc-300 transition-colors min-h-[2.4rem]">
                {displayName}
              </h3>
            </button>
          </div>

          <div className="flex flex-col items-center gap-0.5 shrink-0">
            <ScoreRing value={evaluation.totalScore} size={56} />
            {rankInfo && rankInfo.total > 0 && (
              <span className="font-mono text-xs font-semibold tabular-nums text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                #{rankInfo.rank} / {rankInfo.total}
              </span>
            )}
          </div>
        </div>

        {/* Row 2: VerdictBadge + Data Confidence % (+ optional compact Myanmar popover) */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <VerdictBadge
            verdict={decisionSummary.verdict}
            size="sm"
            language={language}
          />

          <div className="inline-flex items-center gap-1.5 shrink-0">
            <span className={`font-mono text-xs font-semibold tabular-nums ${confidenceColor}`}>
              {evaluation.confidencePct}%
            </span>

            {hasMyanmarEvidence && (() => {
              const ml = product.myanmarLanguage!;
              const matchedVideos = ml.matchedVideos ?? [];
              const matchedReviews = ml.matchedReviews ?? [];
              const isVideoBacked = matchedVideos.length > 0;
              return (
                <InfoPopover
                  variant="info"
                  label={isVideoBacked ? t.myanmarVideoCardLabel : t.myanmarSignalCardLabel}
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
                              className="text-xs leading-snug space-y-0.5"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                                  {vid.creatorHandle ||
                                    vid.creatorName ||
                                    t.myanmarMatchTypeLabels[vid.matchType]}
                                </span>
                                {typeof vid.videoRevenueThb === 'number' && (
                                  <span className="font-mono text-xs text-emerald-700 dark:text-emerald-400 tabular-nums shrink-0">
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
                                  className="inline-flex items-center gap-1 text-xs font-medium text-zinc-900 dark:text-zinc-100 hover:underline pt-0.5"
                                >
                                  <span>{t.myanmarVideoOpenLinkLabel}</span>
                                  <ExternalLink className="w-3 h-3" aria-hidden="true" />
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          <div className="text-xs text-zinc-600 dark:text-zinc-400 font-mono tabular-nums">
                            {ml.matchedReviewCount} {t.myanmarReviewsMatchedLabel} /{' '}
                            {ml.totalReviewsChecked} {t.myanmarReviewsCheckedLabel}
                          </div>
                          {(matchedReviews.length > 0 ? matchedReviews : ml.evidences)
                            .slice(0, 3)
                            .map((item, idx) => (
                              <div key={`my-ev-${idx}`} className="text-xs leading-snug">
                                <div className="text-zinc-700 dark:text-zinc-300 break-words">
                                  “{item.snippet}”
                                </div>
                              </div>
                            ))}
                        </div>
                      )}
                      <p className="pt-1.5 border-t border-zinc-100 dark:border-zinc-800/70 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                        {isMy ? ml.marketScopeNoteMy : ml.marketScopeNoteEn}
                      </p>
                    </div>
                  }
                />
              );
            })()}
          </div>
        </div>

        {/* Row 3: Key Metrics 2x2 Grid (Numbers first, StatusDot on label right) */}
        <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/70 grid grid-cols-2 gap-x-3 gap-y-2.5">
          {/* Price */}
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-1.5">
              <span className="text-xs text-zinc-600 dark:text-zinc-400 truncate">
                {t.cardPrice}
              </span>
              <StatusDot status={effectivePriceStatus} language={language} size="sm" />
            </div>
            <div className="mt-0.5 font-mono text-[15px] font-bold text-zinc-950 dark:text-zinc-50 tabular-nums truncate">
              {product.priceThb !== null && product.priceThb > 0
                ? formatThb(product.priceThb)
                : '—'}
            </div>
          </div>

          {/* Commission */}
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-1.5">
              <span className="text-xs text-zinc-600 dark:text-zinc-400 truncate">
                {t.cardCommission}
              </span>
              <StatusDot status={effectiveCommissionStatus} language={language} size="sm" />
            </div>
            <div className="mt-0.5 flex items-baseline gap-1.5 min-w-0">
              <span
                className={`font-mono text-[15px] font-bold tabular-nums shrink-0 ${
                  hasVerifiedCommission && product.commissionRate !== null
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-zinc-500 dark:text-zinc-400'
                }`}
              >
                {hasVerifiedCommission && product.commissionRate !== null
                  ? `${product.commissionRate}%`
                  : '—'}
              </span>
              {earningPerOrderThb !== null && (
                <span className="font-mono text-xs text-zinc-600 dark:text-zinc-400 tabular-nums truncate">
                  {formatThb(earningPerOrderThb)}
                </span>
              )}
            </div>
          </div>

          {/* Sales */}
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-1.5">
              <span className="text-xs text-zinc-600 dark:text-zinc-400 truncate">
                {t.cardSalesLabel}
              </span>
              <StatusDot status={salesStatus} language={language} size="sm" />
            </div>
            <div
              className={`mt-0.5 font-mono text-[15px] font-bold tabular-nums truncate ${
                hasSalesVolume
                  ? 'text-zinc-950 dark:text-zinc-50'
                  : 'text-zinc-500 dark:text-zinc-400'
              }`}
            >
              {hasSalesVolume
                ? product.kalodataMetrics!.salesVolume!.toLocaleString('en-US')
                : '—'}
            </div>
          </div>

          {/* Competition */}
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-1.5">
              <span className="text-xs text-zinc-600 dark:text-zinc-400 truncate">
                {t.cardCompetition}
              </span>
              <StatusDot status={competitionStatus} language={language} size="sm" />
            </div>
            <div
              className={`mt-0.5 font-mono text-sm font-bold tabular-nums truncate ${competitionColor}`}
            >
              {competitionDisplay}
            </div>
          </div>
        </div>

        {/* Row 4: Full-width Research Report button + Deep Dive & Compare equal-width row */}
        <div className="mt-auto pt-3 border-t border-zinc-100 dark:border-zinc-800/70 space-y-2">
          <button
            type="button"
            onClick={() => onOpenReport(product)}
            className="w-full inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 py-2 text-xs font-semibold text-zinc-900 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-200"
          >
            <span>{t.cardOpenReport}</span>
            <ArrowUpRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          </button>

          {(onOpenDeepDive || onToggleCompare) && (
            <div
              className={`grid gap-2 ${
                onOpenDeepDive && onToggleCompare ? 'grid-cols-2' : 'grid-cols-1'
              }`}
            >
              {onOpenDeepDive && (
                <button
                  type="button"
                  onClick={() => onOpenDeepDive(product)}
                  className="sp-btn-secondary px-2.5 min-w-0"
                >
                  <Layers className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">Deep Dive</span>
                </button>
              )}

              {onToggleCompare && (
                <button
                  type="button"
                  onClick={() => onToggleCompare(product)}
                  aria-pressed={isCompared}
                  className={`inline-flex items-center justify-center gap-1.5 min-h-[40px] px-2.5 py-2 text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-200 ${
                    isCompared
                      ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                      : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500 hover:text-zinc-950 dark:hover:text-zinc-50'
                  }`}
                >
                  <GitCompareArrows className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">
                    {isCompared ? t.compareSelectedBtn : t.compareSelectBtn}
                  </span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Row 5: Save / Reject Decision Buttons */}
        <div className={`grid gap-2 ${hideRejectAction ? 'grid-cols-1' : 'grid-cols-2'}`}>
          <button
            type="button"
            onClick={() => onSave(product.id)}
            aria-pressed={isSaved}
            className={`inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-200 ${
              isSaved
                ? 'bg-emerald-700 dark:bg-emerald-700 text-white hover:bg-emerald-800 dark:hover:bg-emerald-600'
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
              className={`inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 py-2 text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-200 ${
                isRejected
                  ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border-zinc-300 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                  : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700 hover:border-red-300 dark:hover:border-red-700 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50/40 dark:hover:bg-red-950/40'
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
    </article>
  );
});
