import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bookmark,
  Check,
  Copy,
  Download,
  ExternalLink,
  ImageOff,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Star,
  X,
} from 'lucide-react';
import {
  AiProductAnalysis,
  DataStatus,
  KalodataShopEnrichmentRecord,
  Language,
  OpportunityEvaluation,
  ProductDecision,
  ProductDecisionVerdict,
  ProductEnrichmentExecutionSummary,
  ResearchProduct,
  RiskSeverity,
  ScoreTier,
  VerificationState,
} from '../types/product';
import { formatThb, isSafeHttpUrl } from '../utils/format';
import { DEFAULT_SPENDING_LIMIT_CREDITS } from '../utils/kalodataPricing';
import {
  evaluateProductOpportunity,
  getCanonicalProductId,
  normalizeDataStatus,
} from '../utils/scoring';
import {
  deriveProductDecisionSummary,
  getEffectiveAiSuitabilityBand,
  resolveEffectiveAiAnalysis,
} from '../utils/productAnalytics';
import {
  buildCompleteTextReport,
  buildProductsExportCsv,
  buildProductsExportJson,
  triggerFileDownload,
} from '../utils/exportReports';
import { formatResearchDate, formatResearchDateTime } from '../utils/savedProductsStorage';
import { TRANSLATIONS } from '../i18n/translations';
import { ProductImage } from './ProductImage';
import { AiProductAnalysisSection } from './AiProductAnalysisSection';
import { DataEnrichmentSection } from './DataEnrichmentSection';

interface ResearchReportDrawerProps {
  product: ResearchProduct | null;
  evaluation?: OpportunityEvaluation | null;
  salesWeightPct?: number;
  peerProducts?: readonly ResearchProduct[];
  spendingLimitCredits?: number;
  researchDate?: string | null;
  decision: ProductDecision;
  onSave: (id: string) => void;
  onReject: (id: string) => void;
  onClose: () => void;
  onAiAnalysisSaved?: (productId: string, analysis: AiProductAnalysis) => void;
  onProductEnriched?: (
    updatedProduct: ResearchProduct,
    shopDetail: KalodataShopEnrichmentRecord | null,
    summary: ProductEnrichmentExecutionSummary | null
  ) => void;
  language: Language;
}

function riskColorClass(level: RiskSeverity): string {
  if (level === 'Low') return 'text-emerald-700';
  if (level === 'Watch') return 'text-amber-700';
  return 'text-red-700';
}

function verificationColorClass(status: VerificationState): string {
  if (status === 'Verified') return 'text-emerald-700';
  if (status === 'Needs Check') return 'text-amber-700';
  return 'text-red-700';
}

function tierTextColor(tier: ScoreTier): string {
  if (tier === 'priority-test') return 'text-emerald-700';
  if (tier === 'investigate-further') return 'text-amber-700';
  return 'text-zinc-600';
}

function dataStatusColorClass(status: DataStatus): string {
  if (status === 'verified') return 'text-emerald-700';
  if (status === 'estimated') return 'text-amber-700';
  if (status === 'unverified') return 'text-zinc-500';
  return 'text-zinc-400';
}

function decisionVerdictColor(verdict: ProductDecisionVerdict): string {
  if (verdict === 'recommended') return 'text-emerald-700';
  if (verdict === 'worth-testing') return 'text-zinc-900';
  if (verdict === 'need-more-data') return 'text-amber-700';
  return 'text-red-700';
}

export function ResearchReportDrawer({
  product,
  evaluation: providedEvaluation,
  salesWeightPct = 50,
  peerProducts,
  spendingLimitCredits = DEFAULT_SPENDING_LIMIT_CREDITS,
  researchDate,
  decision,
  onSave,
  onReject,
  onClose,
  onAiAnalysisSaved,
  onProductEnriched,
  language,
}: ResearchReportDrawerProps) {
  const [copied, setCopied] = useState(false);
  const [activeAiAnalysis, setActiveAiAnalysis] = useState<AiProductAnalysis | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCopied(false);
    setActiveAiAnalysis(null);
    scrollContainerRef.current?.scrollTo({ top: 0 });
  }, [product?.id]);

  useEffect(() => {
    if (!product) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [product, onClose]);

  if (!product) return null;

  const t = TRANSLATIONS[language];
  const isMy = language === 'my';
  const evaluation =
    providedEvaluation ??
    evaluateProductOpportunity(product, {
      salesWeightPct,
      peerProducts,
    });

  const competitionFactor = evaluation.criteria.find((c) => c.key === 'competition');
  const competitionUnavailable =
    competitionFactor?.verification === 'unavailable' ||
    (product.kalodataMetrics !== undefined &&
      (product.kalodataMetrics.creatorNumber === null ||
        product.kalodataMetrics.creatorNumber === undefined));

  const strategyFocusLabel =
    evaluation.strategyPreset === 'sales-first'
      ? t.strategySales
      : evaluation.strategyPreset === 'commission-first'
        ? t.strategyCommission
        : t.strategyBalanced;

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

  const effectiveCommissionPerSaleStatus: DataStatus =
    earningPerOrderThb !== null
      ? normalizeDataStatus(product.commissionPerSaleStatus ?? (effectivePriceStatus === 'verified' ? 'verified' : 'estimated'))
      : 'unavailable';

  const hasVerifiedSource = product.sources.some((s) => s.verified && Boolean(s.url));

  // Explicit 4-state provenance status for all 14 user-requested data fields
  const provenanceItems: { label: string; value: string; status: DataStatus }[] = [
    {
      label: t.fieldPrice,
      value: product.priceThb !== null && product.priceThb > 0 ? formatThb(product.priceThb) : '—',
      status: effectivePriceStatus,
    },
    {
      label: t.fieldSeller,
      value: product.brand ? `${product.brand} · ${product.shopName}` : product.shopName,
      status: normalizeDataStatus(product.sellerStatus ?? (hasVerifiedSource ? 'estimated' : 'unverified')),
    },
    {
      label: t.fieldSalesEvidence,
      value: t.demandLabels[product.demandLevel],
      status: normalizeDataStatus(product.salesEvidenceStatus ?? 'estimated'),
    },
    {
      label: t.fieldReviewCount,
      value:
        typeof product.reviewCount === 'number' && product.reviewCount > 0
          ? `${product.reviewCount.toLocaleString()} ${t.cardReviewsUnit}`
          : '—',
      status: normalizeDataStatus(
        typeof product.reviewCount === 'number' && product.reviewCount > 0
          ? (product.reviewCountStatus ?? 'estimated')
          : 'unavailable'
      ),
    },
    {
      label: t.fieldCustomerRating,
      value:
        typeof product.customerRating === 'number' && product.customerRating > 0
          ? `${product.customerRating.toFixed(1)} / 5.0`
          : '—',
      status: normalizeDataStatus(
        typeof product.customerRating === 'number' && product.customerRating > 0
          ? (product.customerRatingStatus ?? 'estimated')
          : 'unavailable'
      ),
    },
    {
      label: t.fieldCustomerFeedback,
      value:
        product.reviewStrengthsEn.length + product.customerComplaintsEn.length > 0
          ? `${product.reviewStrengthsEn.length + product.customerComplaintsEn.length} notes`
          : '—',
      status: normalizeDataStatus(
        product.feedbackStatus ??
          (product.reviewStrengthsEn.length + product.customerComplaintsEn.length > 0
            ? 'estimated'
            : 'unavailable')
      ),
    },
    {
      label: t.fieldMarketDemand,
      value: t.demandLabels[product.demandLevel],
      status: normalizeDataStatus(product.demandStatus ?? 'estimated'),
    },
    {
      label: t.fieldCompetition,
      value: competitionUnavailable
        ? '—'
        : t.competitionLabels[product.competitionLevel],
      status: competitionUnavailable
        ? 'unavailable'
        : normalizeDataStatus(product.competitionStatus ?? 'estimated'),
    },
    {
      label: t.fieldCommissionRate,
      value:
        hasVerifiedCommission && product.commissionRate !== null
          ? `${product.commissionRate}%`
          : '—',
      status: effectiveCommissionStatus,
    },
    {
      label: t.fieldCommissionPerSale,
      value: earningPerOrderThb !== null ? formatThb(earningPerOrderThb) : '—',
      status: effectiveCommissionPerSaleStatus,
    },
    {
      label: t.fieldSellerReliability,
      value: t.sellerReliabilityLabels[product.sellerReliabilityLevel],
      status: normalizeDataStatus(product.sellerReliabilityStatus ?? 'estimated'),
    },
    {
      label: t.fieldProductQuality,
      value: product.productQualityEvidenceEn ? 'Recorded' : '—',
      status: normalizeDataStatus(
        product.productQualityStatus ?? (product.productQualityEvidenceEn ? 'estimated' : 'unavailable')
      ),
    },
    {
      label: t.fieldAiVideoPotential,
      value: t.aiVideoLabels[getEffectiveAiSuitabilityBand(product, evaluation)],
      status: normalizeDataStatus(product.aiVideoStatus ?? 'estimated'),
    },
    {
      label: t.fieldSourceLinks,
      value: `${product.sources.filter((s) => s.verified && s.url).length} URLs`,
      status: hasVerifiedSource ? 'verified' : 'unavailable',
    },
  ];

  const whyChoose = isMy ? product.whyChooseMy : product.whyChooseEn;
  const demandEvidence = isMy ? product.demandEvidenceMy : product.demandEvidenceEn;
  const salesPotential = isMy ? product.salesPotentialMy : product.salesPotentialEn;
  const commissionNote = isMy ? product.commissionNoteMy : product.commissionNoteEn;
  const reviewStrengths = isMy ? product.reviewStrengthsMy : product.reviewStrengthsEn;
  const customerComplaints = isMy
    ? product.customerComplaintsMy
    : product.customerComplaintsEn;
  const productQualityEvidence = isMy
    ? product.productQualityEvidenceMy
    : product.productQualityEvidenceEn;
  const competitionDetail = isMy
    ? product.competitionDetailMy
    : product.competitionDetailEn;
  const sellerReliability = isMy
    ? product.sellerReliabilityMy
    : product.sellerReliabilityEn;
  const generalRisks = isMy ? product.generalRisksMy : product.generalRisksEn;
  const aiVideoDetail = isMy ? product.aiVideoDetailMy : product.aiVideoDetailEn;
  const confidenceDetail = isMy ? product.confidenceDetailMy : product.confidenceDetailEn;
  const missingData = isMy ? product.missingDataMy : product.missingDataEn;
  const imageSourceNote = isMy ? product.imageSourceNoteMy : product.imageSourceNoteEn;

  const jumpToSection = (sectionId: string) => {
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const effectiveDateIso = researchDate ?? product.researchedAt ?? null;
  const formattedResearchDate = effectiveDateIso
    ? formatResearchDate(effectiveDateIso, language)
    : null;
  const effectiveAiAnalysis = resolveEffectiveAiAnalysis(product, activeAiAnalysis);
  const decisionSummary = deriveProductDecisionSummary(
    product,
    evaluation,
    effectiveAiAnalysis
  );
  const km = product.kalodataMetrics;
  const lastUpdatedIso = km?.lastEnrichedAt ?? effectiveDateIso;
  const formattedLastUpdated = lastUpdatedIso
    ? formatResearchDateTime(lastUpdatedIso, language)
    : t.dataStatusLabels.unavailable;

  const handleCopyReport = async () => {
    const fullText = buildCompleteTextReport({
      product,
      evaluation,
      decision: decisionSummary,
      aiAnalysis: effectiveAiAnalysis,
      language,
      researchDate: effectiveDateIso,
    });

    try {
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  const handleExportSingleCsv = () => {
    const exportProduct = effectiveAiAnalysis
      ? { ...product, aiAnalysis: effectiveAiAnalysis }
      : product;
    const evalMap = new Map([[exportProduct.id, evaluation]]);
    const csv = buildProductsExportCsv([exportProduct], {
      salesWeightPct,
      evaluations: evalMap,
      researchDate: effectiveDateIso,
      exportTitle: `SiamPick Report - ${exportProduct.name}`,
      language,
    });
    const safeId = getCanonicalProductId(exportProduct).replace(/[^a-zA-Z0-9_-]/g, '');
    triggerFileDownload(
      csv,
      `siampick-report-${safeId || 'product'}.csv`,
      'text/csv;charset=utf-8;'
    );
  };

  const handleExportSingleJson = () => {
    const exportProduct = effectiveAiAnalysis
      ? { ...product, aiAnalysis: effectiveAiAnalysis }
      : product;
    const evalMap = new Map([[exportProduct.id, evaluation]]);
    const json = buildProductsExportJson([exportProduct], {
      salesWeightPct,
      evaluations: evalMap,
      researchDate: effectiveDateIso,
      exportTitle: `SiamPick Report - ${exportProduct.name}`,
      language,
    });
    const safeId = getCanonicalProductId(exportProduct).replace(/[^a-zA-Z0-9_-]/g, '');
    triggerFileDownload(
      json,
      `siampick-report-${safeId || 'product'}.json`,
      'application/json;charset=utf-8;'
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-zinc-950/40 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="research-report-title"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl bg-white h-full shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky Top Header + Section Jump Navigation */}
        <div className="shrink-0 bg-white border-b border-zinc-200">
          <div className="px-5 sm:px-7 h-14 flex items-center justify-between gap-4">
            <div className="text-xs font-medium text-zinc-600 truncate">
              {t.reportTitle} · {categoryLabel}
              {formattedResearchDate ? (
                <span className="font-mono text-zinc-400"> · {formattedResearchDate}</span>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t.reportClose}
              className="w-9 h-9 rounded-lg inline-flex items-center justify-center text-zinc-500 hover:text-zinc-950 hover:bg-zinc-100 transition-colors cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          {/* Quick Jump Bar — All 10 Structured Report Sections */}
          <nav
            aria-label="Report sections"
            className="px-5 sm:px-7 pb-2.5 flex items-center gap-4 overflow-x-auto text-xs font-medium text-zinc-500"
          >
            {[
              { id: 'rep-overview', label: t.reportJumpSummary },
              { id: 'rep-decision', label: t.reportTabDecision },
              { id: 'rep-market-data', label: t.reportTabMarketData },
              { id: 'rep-enrichment', label: t.enrichJumpLabel },
              { id: 'rep-score', label: t.scoringJumpLabel },
              { id: 'rep-ai-analysis', label: t.aiJumpLabel },
              { id: 'rep-reviews', label: t.reportJumpReviews },
              { id: 'rep-risks', label: t.reportTabStrengths },
              { id: 'rep-video', label: t.reportJumpVideo },
              { id: 'rep-sources', label: t.reportJumpSources },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => jumpToSection(item.id)}
                className="py-1 hover:text-zinc-950 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Scrollable Dossier */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto px-5 sm:px-7 py-6 space-y-8"
        >
          {/* Product Dossier Hero Summary */}
          <div
            id="rep-overview"
            className="scroll-mt-4 grid grid-cols-1 md:grid-cols-12 gap-5 items-start"
          >
            <div className="md:col-span-5 space-y-2">
              <div className="aspect-[4/3] w-full rounded-xl overflow-hidden bg-zinc-100">
                {hasVerifiedImage && product.imageUrl ? (
                  <ProductImage
                    src={product.imageUrl}
                    alt={product.name}
                    title={displayName}
                    unavailableLabel={t.cardImageUnverified}
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-5 text-center">
                    <ImageOff className="w-6 h-6 text-zinc-400 mb-2" aria-hidden="true" />
                    <p className="text-xs font-medium text-zinc-600">{t.cardImageUnverified}</p>
                    <p className="mt-1 text-[11px] text-zinc-500 leading-relaxed">
                      {imageSourceNote}
                    </p>
                  </div>
                )}
              </div>
              {hasVerifiedImage && imageSourceNote && (
                <p className="text-[11px] text-zinc-500 leading-relaxed">{imageSourceNote}</p>
              )}
            </div>

            <div className="md:col-span-7 flex flex-col justify-between space-y-4">
              <div>
                <div className="text-xs text-zinc-500">
                  {categoryLabel} · {subCategory} ·{' '}
                  {product.brand ? `${product.brand} · ` : ''}
                  {product.shopName} ({product.dispatchHub})
                </div>
                <h2
                  id="research-report-title"
                  className="mt-1.5 font-display text-xl sm:text-2xl font-bold text-zinc-950 leading-snug text-balance"
                >
                  {displayName}
                </h2>
                <p className={`mt-1.5 text-xs font-medium ${tierTextColor(evaluation.tier)}`}>
                  {t.scoringTierRanges[evaluation.tier]} · {t.scoringTierLabels[evaluation.tier]}
                </p>
              </div>

              {/* At-a-Glance Decision Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-zinc-200">
                <div>
                  <div className="text-[11px] text-zinc-500">{t.cardPrice}</div>
                  {product.priceThb !== null && product.priceThb > 0 ? (
                    <div className="mt-0.5">
                      <div className="font-mono text-base font-semibold text-zinc-950 tabular-nums">
                        {formatThb(product.priceThb)}
                      </div>
                      <div
                        className={`text-[11px] font-medium ${dataStatusColorClass(effectivePriceStatus)}`}
                      >
                        {t.dataStatusLabels[effectivePriceStatus]}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-0.5 text-xs font-medium text-zinc-400">
                      {t.dataStatusLabels[effectivePriceStatus]}
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-[11px] text-zinc-500">{t.cardCommission}</div>
                  <div className="mt-0.5 font-mono text-base font-semibold tabular-nums">
                    {hasVerifiedCommission && product.commissionRate !== null ? (
                      <span className="text-emerald-700">{product.commissionRate}%</span>
                    ) : (
                      <span className="font-sans text-xs font-medium text-zinc-400">
                        {t.dataStatusLabels[effectiveCommissionStatus]}
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] text-zinc-500">{t.cardOpportunityScore}</div>
                  <div className="mt-0.5 font-mono text-base font-semibold text-zinc-950 tabular-nums">
                    {evaluation.totalScore}
                    <span className="text-xs font-normal text-zinc-400">/100</span>
                  </div>
                </div>

                <div>
                  <div className="text-[11px] text-zinc-500">{t.cardConfidence}</div>
                  <div className="mt-0.5 text-sm font-semibold text-zinc-950">
                    {t.confidenceLabels[evaluation.confidenceLevel]}{' '}
                    <span className="font-mono text-xs font-normal text-zinc-500 tabular-nums">
                      ({evaluation.confidencePct}%)
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Phase 5: Multi-Signal Final Decision Summary */}
          <section
            id="rep-decision"
            className="scroll-mt-4 pt-6 border-t border-zinc-200 space-y-3"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-display text-sm font-semibold text-zinc-950">
                {t.decisionSummaryHeading}
              </h3>
              <span
                className={`text-xs font-semibold ${decisionVerdictColor(decisionSummary.verdict)}`}
              >
                {t.decisionVerdictLabels[decisionSummary.verdict]}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200/80 space-y-3 text-xs">
              <p className="text-zinc-800 leading-relaxed font-medium">
                {isMy ? decisionSummary.reasonMy : decisionSummary.reasonEn}
              </p>

              {(isMy ? decisionSummary.cautionsMy : decisionSummary.cautionsEn).length > 0 && (
                <div className="pt-2.5 border-t border-zinc-200/70 space-y-1">
                  <div className="text-[11px] font-semibold text-zinc-600">
                    {t.decisionCautionsLabel}
                  </div>
                  <ul className="space-y-1 text-zinc-600 leading-relaxed list-disc pl-4 marker:text-amber-600">
                    {(isMy ? decisionSummary.cautionsMy : decisionSummary.cautionsEn).map(
                      (caution, idx) => (
                        <li key={`${idx}-${caution}`}>{caution}</li>
                      )
                    )}
                  </ul>
                </div>
              )}
            </div>
          </section>

          {/* Dedicated Verified Kalodata Market Data Block (Clearly Separate from AI Assessment) */}
          <section
            id="rep-market-data"
            className="scroll-mt-4 pt-6 border-t border-zinc-200 space-y-3"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h3 className="font-display text-sm font-semibold text-zinc-950">
                  {t.reportTabMarketData}
                </h3>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {t.reportKalodataTag} · Product ID:{' '}
                  <span className="font-mono tabular-nums text-zinc-700">
                    {getCanonicalProductId(product)}
                  </span>
                </p>
              </div>
              <span className="font-mono text-[11px] text-zinc-500 tabular-nums">
                {km?.dateRange ?? t.dataStatusLabels.unavailable}
              </span>
            </div>

            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 p-4 rounded-xl bg-white border border-zinc-200/80 text-xs">
              <div>
                <dt className="text-[11px] text-zinc-500">{isMy ? 'ရောင်းအား' : 'Sales Volume'}</dt>
                <dd className="mt-0.5 font-mono font-semibold text-zinc-950 tabular-nums">
                  {typeof km?.salesVolume === 'number'
                    ? km.salesVolume.toLocaleString('en-US')
                    : t.dataStatusLabels.unavailable}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-zinc-500">{isMy ? 'ဝင်ငွေ (GMV)' : 'Revenue (THB)'}</dt>
                <dd className="mt-0.5 font-mono font-semibold text-zinc-950 tabular-nums">
                  {typeof km?.revenueThb === 'number'
                    ? formatThb(km.revenueThb)
                    : t.dataStatusLabels.unavailable}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-zinc-500">{isMy ? 'ဝင်ငွေတိုးတက်နှုန်း' : 'Revenue Growth'}</dt>
                <dd className="mt-0.5 font-mono font-semibold text-zinc-950 tabular-nums">
                  {typeof km?.revenueGrowthRate === 'number'
                    ? `${km.revenueGrowthRate >= 0 ? '+' : ''}${km.revenueGrowthRate.toFixed(1)}%`
                    : t.dataStatusLabels.unavailable}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-zinc-500">{isMy ? 'Creator အရေအတွက်' : 'Creator Count'}</dt>
                <dd className="mt-0.5 font-mono font-semibold text-zinc-950 tabular-nums">
                  {typeof km?.creatorNumber === 'number'
                    ? km.creatorNumber.toLocaleString('en-US')
                    : t.dataStatusLabels.unavailable}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-zinc-500">{t.cardCommission}</dt>
                <dd className="mt-0.5 font-mono font-semibold text-emerald-700 tabular-nums">
                  {hasVerifiedCommission && product.commissionRate !== null
                    ? `${product.commissionRate}%`
                    : t.dataStatusLabels.unavailable}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-zinc-500">{isMy ? 'Video ဝင်ငွေ' : 'Video Revenue'}</dt>
                <dd className="mt-0.5 font-mono font-semibold text-zinc-950 tabular-nums">
                  {typeof km?.videoRevenueThb === 'number'
                    ? formatThb(km.videoRevenueThb)
                    : t.dataStatusLabels.unavailable}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-zinc-500">{isMy ? 'Live ဝင်ငွေ' : 'Live Revenue'}</dt>
                <dd className="mt-0.5 font-mono font-semibold text-zinc-950 tabular-nums">
                  {typeof km?.liveRevenueThb === 'number'
                    ? formatThb(km.liveRevenueThb)
                    : t.dataStatusLabels.unavailable}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-zinc-500">{isMy ? 'ဆိုင် GMV' : 'Shop GMV'}</dt>
                <dd className="mt-0.5 font-mono font-semibold text-zinc-950 tabular-nums">
                  {typeof km?.shopRevenueThb === 'number'
                    ? formatThb(km.shopRevenueThb)
                    : t.dataStatusLabels.unavailable}
                </dd>
              </div>
            </dl>
          </section>

          {/* 14-Field Data Provenance Matrix (Verified / Estimated / Unverified / Unavailable) */}
          <section className="pt-6 border-t border-zinc-200 space-y-3">
            <div>
              <h3 className="font-display text-sm font-semibold text-zinc-950">
                {t.dataVerificationHeading}
              </h3>
              <p className="mt-0.5 text-xs text-zinc-500">{t.dataVerificationSubtitle}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 border-y border-zinc-200/80 divide-y divide-zinc-100 sm:divide-y-0">
              {provenanceItems.map((item) => (
                <div
                  key={item.label}
                  className="py-2 sm:border-b sm:border-zinc-100 flex items-baseline justify-between gap-3 text-xs"
                >
                  <span className="text-zinc-600 truncate">{item.label}</span>
                  <div className="flex items-baseline gap-2 shrink-0 text-right">
                    <span className="font-mono text-zinc-900 tabular-nums max-w-[140px] truncate">
                      {item.value}
                    </span>
                    <span className={`font-medium ${dataStatusColorClass(item.status)}`}>
                      {t.dataStatusLabels[item.status]}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Phase 4: Kalodata Data Enrichment (Product Detail, Shop Info, Review Insights, Cost Control) */}
          <DataEnrichmentSection
            product={product}
            salesWeightPct={salesWeightPct}
            peerProducts={peerProducts}
            spendingLimitCredits={spendingLimitCredits}
            language={language}
            onProductEnriched={onProductEnriched}
          />

          {/* Phase 2: 7-Factor 100-Point Product Scoring Engine Breakdown & Explanations */}
          <section id="rep-score" className="scroll-mt-4 pt-6 border-t border-zinc-200 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
              <div>
                <h3 className="font-display text-sm font-semibold text-zinc-950">
                  {t.scoringBreakdownHeading}
                </h3>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {t.scoringStrategyActiveLabel}: {strategyFocusLabel} ({evaluation.salesWeightPct}/
                  {100 - evaluation.salesWeightPct})
                </p>
              </div>
              <span className="font-mono text-xs text-zinc-600 tabular-nums">
                {evaluation.totalScore}/100 · {t.cardConfidence}:{' '}
                <strong className="text-zinc-950">
                  {t.confidenceLabels[evaluation.confidenceLevel]} ({evaluation.confidencePct}%)
                </strong>
              </span>
            </div>

            {/* Independence & Redistribution Fairness Notice */}
            <div className="p-3.5 rounded-lg bg-zinc-50 border border-zinc-200/80 text-xs text-zinc-600 space-y-1">
              <p className="font-medium text-zinc-800">{t.scoringDisclaimer}</p>
              <p>{t.scoringVerificationRule}</p>
              {evaluation.redistributedWeightPct > 0 && (
                <p className="text-amber-800 font-medium pt-0.5">
                  {t.scoringRedistributedNotice} ({evaluation.redistributedWeightPct} pts)
                </p>
              )}
            </div>

            {/* 7-Factor Transparent Breakdown Table */}
            <div className="divide-y divide-zinc-100 border-y border-zinc-200/80">
              {evaluation.criteria.map((item, idx) => {
                const pct =
                  item.wasRedistributed || item.normalizedScore === null
                    ? 0
                    : Math.max(0, Math.min(100, Math.round(item.normalizedScore)));
                const evidence = isMy ? item.evidenceMy : item.evidenceEn;
                const metricDisplay = isMy ? item.metricDisplayMy : item.metricDisplayEn;
                const weightAdjusted =
                  !item.wasRedistributed &&
                  Math.abs(item.effectiveWeight - item.baseWeight) >= 0.1;

                return (
                  <div key={item.key} className="py-3 space-y-1.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                      <div className="font-medium text-zinc-900">
                        <span className="font-mono text-zinc-400 mr-1.5 tabular-nums">
                          0{idx + 1}.
                        </span>
                        {t.factorLabels[item.key]}
                        {metricDisplay && (
                          <span className="ml-2 font-mono text-[11px] font-normal text-zinc-500 tabular-nums">
                            · {metricDisplay}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span className={`font-medium ${dataStatusColorClass(item.verification)}`}>
                          {t.criterionVerificationLabels[item.verification]}
                        </span>
                        {item.wasRedistributed || item.earnedPoints === null ? (
                          <span className="font-mono text-[11px] text-amber-700 tabular-nums">
                            {t.scoringRedistributedLabel}
                          </span>
                        ) : (
                          <span className="font-mono font-semibold text-zinc-950 tabular-nums min-w-[68px] text-right">
                            {item.earnedPoints.toFixed(1)}/{item.effectiveWeight.toFixed(1)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden">
                      {item.wasRedistributed ? (
                        <div className="h-full w-full bg-zinc-200/70" />
                      ) : (
                        <div
                          className={`h-full rounded-full ${
                            item.verification === 'verified'
                              ? 'bg-zinc-900'
                              : item.verification === 'estimated'
                                ? 'bg-amber-500'
                                : 'bg-zinc-400'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      )}
                    </div>

                    <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-zinc-500">
                      <span className="leading-relaxed">{evidence}</span>
                      <span className="font-mono text-[11px] text-zinc-400 tabular-nums shrink-0">
                        {t.scoringBaseWeightLabel}: {item.baseWeight} pts
                        {weightAdjusted
                          ? ` → ${t.scoringEffectiveWeightLabel}: ${item.effectiveWeight.toFixed(1)} pts`
                          : ''}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Score Explanation Grid: Strengths, Weaknesses, Risks, Data Confidence */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              <div className="p-4 rounded-xl bg-zinc-50/80 border border-zinc-200/80 space-y-2">
                <h4 className="font-display text-xs font-semibold text-emerald-800">
                  {t.scoringStrengthsHeading}
                </h4>
                <ul className="space-y-1.5 text-xs text-zinc-700 leading-relaxed list-disc pl-4 marker:text-emerald-600">
                  {(isMy ? evaluation.strengthsMy : evaluation.strengthsEn).map((line, i) => (
                    <li key={`${i}-${line}`}>{line}</li>
                  ))}
                </ul>
              </div>

              <div className="p-4 rounded-xl bg-zinc-50/80 border border-zinc-200/80 space-y-2">
                <h4 className="font-display text-xs font-semibold text-zinc-900">
                  {t.scoringWeaknessesHeading}
                </h4>
                <ul className="space-y-1.5 text-xs text-zinc-700 leading-relaxed list-disc pl-4 marker:text-zinc-400">
                  {(isMy ? evaluation.weaknessesMy : evaluation.weaknessesEn).map((line, i) => (
                    <li key={`${i}-${line}`}>{line}</li>
                  ))}
                </ul>
              </div>

              <div className="p-4 rounded-xl bg-zinc-50/80 border border-zinc-200/80 space-y-2">
                <h4 className="font-display text-xs font-semibold text-amber-800">
                  {t.scoringRisksHeading}
                </h4>
                <ul className="space-y-1.5 text-xs text-zinc-700 leading-relaxed list-disc pl-4 marker:text-amber-600">
                  {(isMy ? evaluation.risksMy : evaluation.risksEn).map((line, i) => (
                    <li key={`${i}-${line}`}>{line}</li>
                  ))}
                </ul>
              </div>

              <div className="p-4 rounded-xl bg-zinc-50/80 border border-zinc-200/80 space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <h4 className="font-display text-xs font-semibold text-zinc-950">
                    {t.scoringConfidenceHeading}
                  </h4>
                  <span className="font-mono text-xs font-semibold text-zinc-800 tabular-nums">
                    {t.confidenceLabels[evaluation.confidenceLevel]} · {evaluation.confidencePct}%
                  </span>
                </div>
                <p className="text-xs text-zinc-700 leading-relaxed">
                  {isMy ? evaluation.confidenceExplanationMy : evaluation.confidenceExplanationEn}
                </p>
              </div>
            </div>
          </section>

          {/* Phase 3: Gemini AI Product Analysis (Explicitly Separated from Verified Kalodata Market Data) */}
          <div className="space-y-1">
            <div className="text-[11px] font-medium text-zinc-500">{t.reportAiTag}</div>
            <AiProductAnalysisSection
              product={product}
              evaluation={evaluation}
              salesWeightPct={salesWeightPct}
              peerProducts={peerProducts}
              language={language}
              onAnalysisReady={(nextAnalysis) => {
                setActiveAiAnalysis(nextAnalysis);
                if (nextAnalysis && nextAnalysis.source === 'gemini' && !nextAnalysis.geminiFailed) {
                  onAiAnalysisSaved?.(product.id, nextAnalysis);
                }
              }}
            />
          </div>

          {/* 01. Why Choose This Product */}
          <section className="pt-6 border-t border-zinc-200 space-y-2.5">
            <h3 className="font-display text-sm font-semibold text-zinc-950">
              {t.sec01WhyChoose}
            </h3>
            <p className="text-sm text-zinc-700 leading-relaxed">{whyChoose}</p>
          </section>

          {/* 02. Market Demand Evidence & 03. Sales Potential */}
          <section className="pt-6 border-t border-zinc-200 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-display text-sm font-semibold text-zinc-950">
                  {t.sec02MarketDemand}
                </h3>
                <span className="text-xs font-medium text-zinc-600 shrink-0">
                  {t.demandLabels[product.demandLevel]}
                </span>
              </div>
              <ul className="space-y-2 text-sm text-zinc-700 leading-relaxed list-disc pl-4 marker:text-zinc-400">
                {demandEvidence.map((item, idx) => (
                  <li key={`${idx}-${item}`}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="space-y-2.5">
              <h3 className="font-display text-sm font-semibold text-zinc-950">
                {t.sec03SalesPotential}
              </h3>
              <p className="text-sm text-zinc-700 leading-relaxed">{salesPotential}</p>
            </div>
          </section>

          {/* 04. Commission Rate & Earning per Sale */}
          <section className="pt-6 border-t border-zinc-200 space-y-3">
            <h3 className="font-display text-sm font-semibold text-zinc-950">
              {t.sec04CommissionIncome}
            </h3>
            <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-baseline gap-6">
                <div>
                  <div className="text-xs text-zinc-500">{t.cardCommission}</div>
                  <div className="mt-0.5 font-mono text-lg font-semibold tabular-nums">
                    {hasVerifiedCommission && product.commissionRate !== null ? (
                      <span className="text-emerald-700">{product.commissionRate}%</span>
                    ) : (
                      <span className="font-sans text-sm font-medium text-amber-700">
                        {t.dataStatusLabels[effectiveCommissionStatus]}
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-zinc-500">{t.estEarningPerSale}</div>
                  <div className="mt-0.5 font-mono text-lg font-semibold text-zinc-950 tabular-nums">
                    {earningPerOrderThb !== null ? formatThb(earningPerOrderThb) : '—'}
                  </div>
                </div>
              </div>

              <p className="text-xs text-zinc-600 leading-relaxed sm:max-w-sm">
                {commissionNote}
              </p>
            </div>
          </section>

          {/* 05. Customer Review Strengths, Rating/Count, Quality Evidence & 06. Complaints */}
          <section
            id="rep-reviews"
            className="scroll-mt-4 pt-6 border-t border-zinc-200 space-y-5"
          >
            {(typeof product.customerRating === 'number' ||
              typeof product.reviewCount === 'number' ||
              productQualityEvidence) && (
              <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200/80 space-y-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-zinc-900">{t.productQualityHeading}</span>
                  <div className="flex items-center gap-2 font-mono tabular-nums text-zinc-700">
                    {typeof product.customerRating === 'number' && product.customerRating > 0 && (
                      <span className="inline-flex items-center gap-1 font-semibold text-zinc-950">
                        <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" aria-hidden="true" />
                        {product.customerRating.toFixed(1)}/5.0
                      </span>
                    )}
                    {typeof product.reviewCount === 'number' && product.reviewCount > 0 && (
                      <span>
                        ({product.reviewCount.toLocaleString()} {t.cardReviewsUnit})
                      </span>
                    )}
                  </div>
                </div>
                {productQualityEvidence && (
                  <p className="text-zinc-600 leading-relaxed">{productQualityEvidence}</p>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2.5">
                <h3 className="font-display text-sm font-semibold text-zinc-950">
                  {t.sec05ReviewStrengths}
                </h3>
                <ul className="space-y-2 text-sm text-zinc-700 leading-relaxed list-disc pl-4 marker:text-emerald-600">
                  {reviewStrengths.map((item, idx) => (
                    <li key={`${idx}-${item}`}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="space-y-2.5">
                <h3 className="font-display text-sm font-semibold text-zinc-950">
                  {t.sec06CustomerComplaints}
                </h3>
                <ul className="space-y-2 text-sm text-zinc-700 leading-relaxed list-disc pl-4 marker:text-amber-600">
                  {customerComplaints.map((item, idx) => (
                    <li key={`${idx}-${item}`}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          {/* 07. Competitor Landscape & 08. Seller Reliability */}
          <section className="pt-6 border-t border-zinc-200 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-display text-sm font-semibold text-zinc-950">
                  {t.sec07CompetitorLandscape}
                </h3>
                <span className="text-xs font-medium text-zinc-600 shrink-0">
                  {competitionUnavailable
                    ? t.dataStatusLabels.unavailable
                    : t.competitionLabels[product.competitionLevel]}
                </span>
              </div>
              <p className="text-sm text-zinc-700 leading-relaxed">{competitionDetail}</p>
            </div>

            <div className="space-y-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-display text-sm font-semibold text-zinc-950">
                  {t.sec08SellerReliability}
                </h3>
                <span className="text-xs font-medium text-zinc-600 shrink-0">
                  {t.sellerReliabilityLabels[product.sellerReliabilityLevel]}
                </span>
              </div>
              <p className="text-sm text-zinc-700 leading-relaxed">{sellerReliability}</p>
            </div>
          </section>

          {/* 09. Product Risks + Category-Specific Audit */}
          <section id="rep-risks" className="scroll-mt-4 pt-6 border-t border-zinc-200 space-y-5">
            <div className="space-y-2.5">
              <h3 className="font-display text-sm font-semibold text-zinc-950">
                {t.sec09ProductRisks}
              </h3>
              <ul className="space-y-2 text-sm text-zinc-700 leading-relaxed list-disc pl-4 marker:text-zinc-400">
                {generalRisks.map((risk, idx) => (
                  <li key={`${idx}-${risk}`}>{risk}</li>
                ))}
              </ul>
            </div>

            {product.category === 'womens-fashion' && product.fashionReturnRisk && (
              <div className="p-5 rounded-xl bg-zinc-50 border border-zinc-200/80 space-y-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" aria-hidden="true" />
                  <h4 className="font-display text-xs sm:text-sm font-semibold text-zinc-950">
                    {t.fashionRiskHeading}
                  </h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {(
                    [
                      { key: 'sizing', label: t.fashionRiskSizing, data: product.fashionReturnRisk.sizing },
                      { key: 'fabric', label: t.fashionRiskFabric, data: product.fashionReturnRisk.fabric },
                      { key: 'color', label: t.fashionRiskColor, data: product.fashionReturnRisk.colorAccuracy },
                      { key: 'fit', label: t.fashionRiskFit, data: product.fashionReturnRisk.fitDifference },
                    ] as const
                  ).map((item) => (
                    <div
                      key={item.key}
                      className="pt-3 border-t border-zinc-200/80 first:border-t-0 sm:first:border-t sm:border-t space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-zinc-900">{item.label}</span>
                        <span className={`font-medium ${riskColorClass(item.data.level)}`}>
                          {t.riskSeverityLabels[item.data.level]}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-600 leading-relaxed">
                        {isMy ? item.data.noteMy : item.data.noteEn}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {product.category === 'cosmetics-beauty' && product.cosmeticsComplianceRisk && (
              <div className="p-5 rounded-xl bg-zinc-50 border border-zinc-200/80 space-y-4">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0" aria-hidden="true" />
                  <h4 className="font-display text-xs sm:text-sm font-semibold text-zinc-950">
                    {t.cosmeticsCheckHeading}
                  </h4>
                </div>

                <div className="space-y-3.5">
                  {(
                    [
                      {
                        key: 'auth',
                        label: t.cosmeticsAuthenticity,
                        data: product.cosmeticsComplianceRisk.brandAuthenticity,
                      },
                      {
                        key: 'fda',
                        label: t.cosmeticsThaiFda,
                        data: product.cosmeticsComplianceRisk.thaiFda,
                      },
                      {
                        key: 'claims',
                        label: t.cosmeticsAdClaims,
                        data: product.cosmeticsComplianceRisk.adClaimSafety,
                      },
                    ] as const
                  ).map((item) => (
                    <div
                      key={item.key}
                      className="pt-3 border-t border-zinc-200/80 first:pt-0 first:border-t-0 space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-zinc-900">{item.label}</span>
                        <span
                          className={`inline-flex items-center gap-1 font-medium ${verificationColorClass(item.data.status)}`}
                        >
                          {item.data.status === 'Verified' && (
                            <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                          )}
                          <span>{t.verificationLabels[item.data.status]}</span>
                        </span>
                      </div>
                      <p className="text-xs text-zinc-600 leading-relaxed">
                        {isMy ? item.data.noteMy : item.data.noteEn}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* 10. AI Video Advertising Potential & 11. 3 Video Content Ideas */}
          <section id="rep-video" className="scroll-mt-4 pt-6 border-t border-zinc-200 space-y-6">
            <div className="space-y-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-display text-sm font-semibold text-zinc-950">
                  {t.sec10AiVideoPotential}
                </h3>
                <span className="text-xs font-medium text-zinc-600 shrink-0">
                  {t.aiVideoLabels[product.aiVideoSuitability]}
                </span>
              </div>
              <p className="text-sm text-zinc-700 leading-relaxed">{aiVideoDetail}</p>
            </div>

            <div className="space-y-3">
              <h3 className="font-display text-sm font-semibold text-zinc-950">
                {t.sec11VideoContentIdeas}
              </h3>
              <ol className="divide-y divide-zinc-200/80 border-y border-zinc-200/80">
                {product.videoIdeas.map((idea, idx) => (
                  <li key={`${idx}-${idea.titleEn}`} className="py-3.5 flex items-start gap-3.5">
                    <span className="font-mono text-xs font-medium text-zinc-400 pt-0.5 tabular-nums shrink-0">
                      0{idx + 1}.
                    </span>
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="text-sm font-semibold text-zinc-950">
                          {isMy ? idea.titleMy : idea.titleEn}
                        </span>
                        <span className="text-xs text-zinc-400" aria-hidden="true">
                          ·
                        </span>
                        <span className="text-xs text-zinc-500">
                          {isMy ? idea.formatMy : idea.formatEn}
                        </span>
                      </div>
                      <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed">
                        {isMy ? idea.outlineMy : idea.outlineEn}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          {/* 12. Research Sources & Links, Last Updated, 13. Confidence Level, 14. Unavailable Data */}
          <section id="rep-sources" className="scroll-mt-4 pt-6 border-t border-zinc-200 space-y-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2 pb-2 border-b border-zinc-100 text-xs text-zinc-500">
              <span>
                {t.reportLastUpdatedLabel}:{' '}
                <strong className="font-mono text-zinc-900 tabular-nums">
                  {formattedLastUpdated}
                </strong>
              </span>
              {formattedResearchDate && (
                <span>
                  {t.savedResearchDateLabel}:{' '}
                  <strong className="font-mono text-zinc-700 tabular-nums">
                    {formattedResearchDate}
                  </strong>
                </span>
              )}
            </div>

            <div className="space-y-2.5">
              <h3 className="font-display text-sm font-semibold text-zinc-950">
                {t.sec12ResearchSources}
              </h3>
              <ul className="space-y-2">
                {product.sources.map((src, idx) => (
                  <li
                    key={`${idx}-${src.url ?? src.labelEn}`}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 py-2 border-b border-zinc-100 last:border-b-0 text-xs"
                  >
                    <div className="text-zinc-700 min-w-0">
                      <span className="font-medium text-zinc-900">
                        {isMy ? src.labelMy : src.labelEn}
                      </span>{' '}
                      <span className="text-zinc-400">· {src.sourceType}</span>
                    </div>

                    {src.verified && isSafeHttpUrl(src.url) ? (
                      <a
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-medium text-zinc-900 hover:underline whitespace-nowrap shrink-0"
                      >
                        <span>{t.sourceOpenLink}</span>
                        <ExternalLink className="w-3 h-3" aria-hidden="true" />
                      </a>
                    ) : (
                      <span className="text-zinc-400 whitespace-nowrap shrink-0">
                        {t.sourcePendingLink}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-display text-sm font-semibold text-zinc-950">
                    {t.sec13ConfidenceLevel}
                  </h3>
                  <span className="text-xs font-semibold text-zinc-900">
                    {t.confidenceLabels[evaluation.confidenceLevel]}
                  </span>
                </div>
                <p className="text-sm text-zinc-700 leading-relaxed">{confidenceDetail}</p>
              </div>

              <div className="space-y-2">
                <h3 className="font-display text-sm font-semibold text-zinc-950">
                  {t.sec14MissingData}
                </h3>
                <ul className="space-y-1.5 text-sm text-zinc-600 leading-relaxed list-disc pl-4 marker:text-zinc-400">
                  {missingData.map((item, idx) => (
                    <li key={`${idx}-${item}`}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        </div>

        {/* Sticky Decision & Export Footer */}
        <div className="shrink-0 bg-white border-t border-zinc-200 px-4 sm:px-7 py-3 flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyReport}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 sm:px-3.5 py-2 text-xs font-medium text-zinc-800 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors cursor-pointer whitespace-nowrap"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
                  <span>{t.reportCopied}</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{t.reportCopy}</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleExportSingleCsv}
              aria-label={t.exportCsvBtn}
              className="inline-flex items-center justify-center gap-1 min-h-[40px] px-3 py-2 text-xs font-medium text-zinc-700 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t.reportExportCsv}</span>
            </button>

            <button
              type="button"
              onClick={handleExportSingleJson}
              aria-label={t.exportJsonBtn}
              className="inline-flex items-center justify-center gap-1 min-h-[40px] px-3 py-2 text-xs font-medium text-zinc-700 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t.reportExportJson}</span>
            </button>
          </div>

          <div className="flex items-center gap-2 sm:flex-1">
            <button
              type="button"
              onClick={() => onReject(product.id)}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 min-h-[42px] px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
                isRejected
                  ? 'bg-zinc-100 text-zinc-900 border-zinc-300 hover:bg-zinc-200'
                  : 'bg-white text-zinc-700 border-zinc-200 hover:border-red-300 hover:text-red-700 hover:bg-red-50/40'
              }`}
            >
              {isRejected ? (
                <>
                  <RotateCcw className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{t.btnRestoreProduct}</span>
                </>
              ) : (
                <>
                  <X className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{t.btnRejectProduct}</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => onSave(product.id)}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 min-h-[42px] px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-medium text-white rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                isSaved
                  ? 'bg-emerald-700 hover:bg-emerald-800'
                  : 'bg-zinc-950 hover:bg-zinc-800'
              }`}
            >
              <Bookmark className={`w-4 h-4 shrink-0 ${isSaved ? 'fill-current' : ''}`} aria-hidden="true" />
              <span>{isSaved ? t.btnSavedProduct : t.btnSaveProduct}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
