import { forwardRef, memo } from 'react';
import { motion, useReducedMotion } from 'motion/react';
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
import { MOTION_TRANSITIONS, MOTION_VARIANTS, TACTILE_INTERACTIONS } from '../utils/motionPresets';
import { ProductImage } from './ProductImage';
import { InfoPopover } from './InfoPopover';
import { TechnicalSignalStrip } from './TechnicalSignalStrip';
import { AnimatedNumber, ScoreRing, StatusDot, VerdictBadge } from './visual';

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
  entranceIndex?: number;
  enableLayoutReflow?: boolean;
}

export const ResearchResultCard = memo(
  forwardRef<HTMLElement, ResearchResultCardProps>(function ResearchResultCard(
    {
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
      entranceIndex,
      enableLayoutReflow = false,
    },
    ref
  ) {
    const t = TRANSLATIONS[language];
    const isMy = language === 'my';
    const prefersReduced = useReducedMotion();

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
      product.commissionVerified === true && product.commissionRate !== null;

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
        ? 'text-emerald-700 dark:text-[#10F5A0]'
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
        ? 'text-emerald-700 dark:text-[#10F5A0]'
        : product.competitionLevel === 'Moderate'
          ? 'text-amber-700 dark:text-amber-400'
          : 'text-rose-700 dark:text-[#FE2C55]';

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

    const topRimGradient = isRejected
      ? 'from-zinc-400 via-zinc-500 to-zinc-400 dark:from-zinc-700 dark:via-zinc-600 dark:to-zinc-700'
      : isSaved || decisionSummary.verdict === 'recommended'
        ? 'from-emerald-500 via-teal-400 to-cyan-500 dark:from-[#10F5A0] dark:via-[#25F4EE] dark:to-[#10F5A0]'
        : decisionSummary.verdict === 'worth-testing'
          ? 'from-cyan-500 via-sky-400 to-teal-400 dark:from-[#25F4EE] dark:to-sky-400'
          : decisionSummary.verdict === 'need-more-data'
            ? 'from-amber-400 via-orange-400 to-amber-500'
            : 'from-rose-500/75 via-zinc-500 to-rose-500/75 dark:from-[#FE2C55]/75 dark:to-zinc-600';

    const cardSurfaceClass = isRejected
      ? 'opacity-80 border-[var(--sp-border)]'
      : isSaved
        ? 'border-emerald-500/45 dark:border-[#10F5A0]/40 shadow-xs shadow-emerald-600/10 hover:shadow-[0_14px_34px_-16px_rgba(16,245,160,0.22)]'
        : 'border-[var(--sp-border)] hover:border-zinc-300 dark:hover:border-white/[0.16] hover:shadow-[0_14px_34px_-16px_rgba(9,9,11,0.14)] dark:hover:shadow-[0_18px_40px_-14px_rgba(0,0,0,0.75)]';

    const showScoreHalo = !isRejected && evaluation.totalScore >= 75;
    const isHighMarginVerifiedCommission =
      hasVerifiedCommission &&
      product.commissionRate !== null &&
      (product.commissionRate >= 10 || (earningPerOrderThb !== null && earningPerOrderThb >= 20));

    return (
      <motion.article
        ref={ref}
        layout={enableLayoutReflow && !prefersReduced ? 'position' : false}
        variants={MOTION_VARIANTS.cardReveal}
        custom={entranceIndex ?? 0}
        initial="initial"
        animate="animate"
        exit="exit"
        whileHover={!isRejected && !prefersReduced ? TACTILE_INTERACTIONS.cardHover : undefined}
        className={`group relative rounded-2xl overflow-hidden border bg-[var(--sp-surface)] dark:ring-1 dark:ring-inset dark:ring-white/[0.03] flex flex-col transition-[border-color,box-shadow,opacity] duration-200 ${cardSurfaceClass}`}
      >
        {/* Subtle Verdict-Reactive 2px Architectural Top Rim */}
        <div aria-hidden="true" className={`h-[2px] w-full bg-gradient-to-r ${topRimGradient}`} />

        {/* Full-Bleed Product Image Stage with Floating ScoreRing & Rank Overlay */}
        <button
          type="button"
          onClick={() => onOpenReport(product)}
          aria-label={`${t.cardOpenReport}: ${displayName}`}
          className="block relative aspect-[16/10] sm:aspect-[4/3] w-full bg-zinc-100 dark:bg-[#090C12] overflow-hidden text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 dark:focus-visible:ring-[#10F5A0]"
        >
          {imageConfig.canRender && imageConfig.src ? (
            <ProductImage
              src={imageConfig.src}
              fallbackSrc={imageConfig.fallbackSrc}
              productId={imageConfig.productId}
              alt={product.name}
              title={displayName}
              unavailableLabel={t.cardImageUnverified}
              className="transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
            />
          ) : (
            <div className="w-full h-full bg-zinc-100/90 dark:bg-[#111622] flex flex-col items-center justify-center p-5 text-center">
              <ImageOff className="w-6 h-6 text-zinc-500 dark:text-zinc-400 mb-1.5" aria-hidden="true" />
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                {t.cardImageUnverified}
              </span>
            </div>
          )}

          {/* Crisp Inner Rim + Bottom Scrim */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-black/5 dark:ring-white/[0.08]"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/55 via-black/15 to-transparent"
          />

          {/* Top-Left Floating Rank & Category Pill */}
          <div className="pointer-events-none absolute top-2.5 left-2.5 flex items-center gap-1.5 max-w-[66%]">
            {rankInfo && rankInfo.total > 0 && (
              <span className="font-mono text-[11px] font-bold tabular-nums px-2 py-0.5 rounded-lg bg-black/65 backdrop-blur-md text-white border border-white/15 shrink-0">
                #{rankInfo.rank}/{rankInfo.total}
              </span>
            )}
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-lg bg-black/55 backdrop-blur-md text-white/95 border border-white/15 truncate">
              {categoryLabel}
            </span>
          </div>

          {/* Top-Right Floating ScoreRing Glass Medallion */}
          <div className="pointer-events-none absolute top-2.5 right-2.5">
            {showScoreHalo && (
              <div
                aria-hidden="true"
                className="absolute -inset-1 rounded-full bg-emerald-500/20 dark:bg-[#10F5A0]/20 blur-md"
              />
            )}
            <div className="relative p-1 rounded-full bg-white/92 dark:bg-[#0B0E14]/88 backdrop-blur-md shadow-md border border-zinc-200/70 dark:border-white/[0.12]">
              <ScoreRing value={evaluation.totalScore} size={50} animate />
            </div>
          </div>
        </button>

        {/* Card Body */}
        <div className="p-3.5 sm:p-4 flex-1 flex flex-col gap-3">
          {/* Row 1: Subcategory · Shop + Title */}
          <div className="min-w-0">
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate leading-snug">
              {subCategory} · {product.shopName}
            </div>
            <button
              type="button"
              onClick={() => onOpenReport(product)}
              className="mt-1 text-left cursor-pointer group/title focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:focus-visible:ring-[#10F5A0] rounded-sm block w-full"
            >
              <h3 className="font-display text-sm sm:text-[15px] font-bold text-zinc-950 dark:text-zinc-50 leading-snug line-clamp-2 group-hover/title:text-emerald-700 dark:group-hover/title:text-[#10F5A0] transition-colors min-h-[2.4rem]">
                {displayName}
              </h3>
            </button>
          </div>

          {/* Row 2: VerdictBadge + Data Confidence + Myanmar Evidence Popover */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <VerdictBadge verdict={decisionSummary.verdict} size="sm" language={language} />

            <div className="inline-flex items-center gap-1.5 shrink-0">
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                {isMy ? 'ဒေတာ' : 'Confidence'}
              </span>
              <span className={`font-mono text-xs font-bold tabular-nums ${confidenceColor}`}>
                <AnimatedNumber value={evaluation.confidencePct} suffix="%" />
              </span>

              {hasMyanmarEvidence &&
                (() => {
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
                                      <span className="font-mono text-xs text-emerald-700 dark:text-[#10F5A0] tabular-nums shrink-0">
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
                          <p className="pt-1.5 border-t border-[var(--sp-border)] text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                            {isMy ? ml.marketScopeNoteMy : ml.marketScopeNoteEn}
                          </p>
                        </div>
                      }
                    />
                  );
                })()}
            </div>
          </div>

          {/* Row 3: Hero Money Strip (Price + Prominent Verified Affiliate Commission Payout) */}
          <div className="rounded-xl border border-[var(--sp-border)] bg-zinc-50/90 dark:bg-[#111622] overflow-hidden">
            <div className="grid grid-cols-2 divide-x divide-zinc-200/80 dark:divide-white/[0.07]">
              {/* Price */}
              <div className="px-3 py-2.5 min-w-0">
                <div className="flex items-center justify-between gap-1.5">
                  <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 truncate leading-snug">
                    {t.cardPrice}
                  </span>
                  <StatusDot status={effectivePriceStatus} language={language} size="sm" />
                </div>
                <div className="mt-0.5 font-mono text-base font-bold text-zinc-950 dark:text-zinc-50 tabular-nums truncate">
                  {product.priceThb !== null && product.priceThb > 0 ? (
                    <AnimatedNumber
                      value={product.priceThb}
                      prefix="฿"
                      decimals={Number.isInteger(product.priceThb) ? 0 : 2}
                    />
                  ) : (
                    '—'
                  )}
                </div>
              </div>

              {/* Commission Payout Hero Cell */}
              <div
                className={`px-3 py-2.5 min-w-0 ${
                  isHighMarginVerifiedCommission
                    ? 'bg-emerald-500/[0.07] dark:bg-[#10F5A0]/[0.08]'
                    : ''
                }`}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 truncate leading-snug">
                    {t.cardCommission}
                  </span>
                  <StatusDot status={effectiveCommissionStatus} language={language} size="sm" />
                </div>
                <div className="mt-0.5 flex items-baseline gap-1.5 min-w-0">
                  <span
                    className={`font-mono text-base font-bold tabular-nums shrink-0 ${
                      hasVerifiedCommission && product.commissionRate !== null
                        ? 'text-emerald-700 dark:text-[#10F5A0]'
                        : 'text-zinc-500 dark:text-zinc-400'
                    }`}
                  >
                    {product.commissionRate !== null ? (
                      <AnimatedNumber
                        value={product.commissionRate}
                        decimals={product.commissionRate % 1 !== 0 ? 1 : 0}
                        suffix="%"
                        highlightSignal={isHighMarginVerifiedCommission ? 'emerald-sheen' : 'none'}
                      />
                    ) : (
                      '—'
                    )}
                  </span>
                  {earningPerOrderThb !== null && earningPerOrderThb > 0 && (
                    <span
                      className={`font-mono text-xs tabular-nums truncate ${
                        hasVerifiedCommission
                          ? 'text-emerald-700/90 dark:text-[#10F5A0]/85 font-semibold'
                          : 'text-zinc-500 dark:text-zinc-400'
                      }`}
                    >
                      <AnimatedNumber
                        value={Math.round(earningPerOrderThb)}
                        prefix="~฿"
                        highlightSignal="none"
                      />
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Secondary Telemetry Row: Sales Volume & Creators */}
            <div className="grid grid-cols-2 divide-x divide-zinc-200/80 dark:divide-white/[0.07] border-t border-[var(--sp-border)] bg-white/70 dark:bg-[#0C1018]/75">
              <div className="px-3 py-2 min-w-0 flex items-center justify-between gap-1.5">
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                  {t.cardSalesLabel}
                </span>
                <span className="inline-flex items-center gap-1 min-w-0">
                  <span
                    className={`font-mono text-xs font-bold tabular-nums truncate ${
                      hasSalesVolume
                        ? 'text-cyan-700 dark:text-[#25F4EE]'
                        : 'text-zinc-500 dark:text-zinc-400'
                    }`}
                  >
                    {hasSalesVolume ? (
                      <AnimatedNumber
                        value={Math.round(product.kalodataMetrics!.salesVolume!)}
                        highlightSignal="none"
                      />
                    ) : (
                      '—'
                    )}
                  </span>
                  <StatusDot status={salesStatus} language={language} size="sm" />
                </span>
              </div>

              <div className="px-3 py-2 min-w-0 flex items-center justify-between gap-1.5">
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                  {t.cardCompetition}
                </span>
                <span className="inline-flex items-center gap-1 min-w-0">
                  <span
                    className={`font-mono text-xs font-bold tabular-nums truncate ${competitionColor}`}
                  >
                    {competitionDisplay}
                  </span>
                  <StatusDot status={competitionStatus} language={language} size="sm" />
                </span>
              </div>
            </div>
          </div>

          {/* Row 4: Phase B Compact Technical Signal Strip (Tracked Video/Live Mix + ASI Pill) */}
          <TechnicalSignalStrip
            product={product}
            evaluation={evaluation}
            language={language}
            variant="compact"
          />

          {/* Row 5: Sleek Action Hierarchy (Volt Report CTA + Compact Utility Grid) */}
          <div className="mt-auto pt-1 space-y-2">
            <motion.button
              type="button"
              onClick={() => onOpenReport(product)}
              whileTap={prefersReduced ? undefined : TACTILE_INTERACTIONS.buttonTap}
              transition={MOTION_TRANSITIONS.snappy}
              className="group/report sp-btn-volt relative overflow-hidden w-full min-h-[42px]"
            >
              <span aria-hidden="true" className="sp-shimmer-sheen" />
              <span className="relative z-10">{t.cardOpenReport}</span>
              <ArrowUpRight
                className="relative z-10 w-4 h-4 shrink-0 transition-transform duration-200 group-hover/report:translate-x-0.5 group-hover/report:-translate-y-0.5"
                aria-hidden="true"
              />
            </motion.button>

            <div className="grid grid-cols-2 gap-1.5">
              {onOpenDeepDive && (
                <button
                  type="button"
                  onClick={() => onOpenDeepDive(product)}
                  className="inline-flex items-center justify-center gap-1.5 min-h-[38px] px-2.5 py-1.5 text-xs font-semibold rounded-xl border bg-cyan-50/70 dark:bg-[#25F4EE]/[0.08] text-cyan-900 dark:text-[#25F4EE] border-cyan-500/25 dark:border-[#25F4EE]/25 hover:bg-cyan-100/70 dark:hover:bg-[#25F4EE]/14 transition-colors cursor-pointer whitespace-nowrap min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 dark:focus-visible:ring-[#25F4EE]"
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
                  className={`inline-flex items-center justify-center gap-1.5 min-h-[38px] px-2.5 py-1.5 text-xs font-semibold rounded-xl border transition-colors cursor-pointer whitespace-nowrap min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:focus-visible:ring-[#10F5A0] ${
                    isCompared
                      ? 'bg-emerald-500/12 dark:bg-[#10F5A0]/14 text-emerald-800 dark:text-[#10F5A0] border-emerald-500/35 dark:border-[#10F5A0]/35'
                      : 'bg-zinc-50/90 dark:bg-white/[0.04] text-zinc-700 dark:text-zinc-200 border-[var(--sp-border-strong)] hover:border-zinc-400 dark:hover:border-white/25 hover:text-zinc-950 dark:hover:text-zinc-50'
                  }`}
                >
                  <GitCompareArrows className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">
                    {isCompared ? t.compareSelectedBtn : t.compareSelectBtn}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={() => onSave(product.id)}
                aria-pressed={isSaved}
                className={`inline-flex items-center justify-center gap-1.5 min-h-[38px] px-2.5 py-1.5 text-xs font-semibold rounded-xl border transition-colors cursor-pointer whitespace-nowrap min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:focus-visible:ring-[#10F5A0] ${
                  hideRejectAction && !(onOpenDeepDive || onToggleCompare) ? 'col-span-2' : ''
                } ${
                  isSaved
                    ? 'bg-emerald-600/14 dark:bg-[#10F5A0]/16 text-emerald-800 dark:text-[#10F5A0] border-emerald-500/40 dark:border-[#10F5A0]/40 hover:bg-emerald-600/20'
                    : 'bg-zinc-950 dark:bg-zinc-100 text-white dark:text-[#06070A] border-transparent hover:bg-zinc-800 dark:hover:bg-white'
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
                  className={`inline-flex items-center justify-center gap-1.5 min-h-[38px] px-2.5 py-1.5 text-xs font-medium rounded-xl border transition-colors cursor-pointer whitespace-nowrap min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:focus-visible:ring-[#FE2C55] ${
                    isRejected
                      ? 'bg-zinc-100 dark:bg-white/[0.08] text-zinc-800 dark:text-zinc-200 border-[var(--sp-border-strong)] hover:bg-zinc-200 dark:hover:bg-white/[0.12]'
                      : 'bg-[var(--sp-surface)] text-zinc-600 dark:text-zinc-300 border-[var(--sp-border-strong)] hover:border-rose-400/70 dark:hover:border-[#FE2C55]/50 hover:text-rose-700 dark:hover:text-[#FE2C55] hover:bg-rose-500/[0.05] dark:hover:bg-[#FE2C55]/[0.07]'
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
      </motion.article>
    );
  })
);
