import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bookmark,
  Check,
  Copy,
  Download,
  ExternalLink,
  ImageOff,
  Layers,
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
  MyanmarSignalSource,
  OpportunityEvaluation,
  ProductDecision,
  ProductDecisionVerdict,
  ProductEnrichmentExecutionSummary,
  ResearchProduct,
  RiskSeverity,
  ScoreTier,
  VerificationState,
} from '../types/product';
import {
  extractCanonicalTikTokNumericId,
  fetchResolvedTikTokProductUrl,
  formatThb,
  getTikTokShopProductUrl,
  hasResolvedCanonicalTikTokSlug,
  isLegacyOrSluglessTikTokUrl,
  isSafeHttpUrl,
  resolveProductImageDisplayConfig,
} from '../utils/format';
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
import { getCategoryLabel } from '../utils/categoryRegistry';
import { detectMyanmarLanguageForProduct } from '../utils/myanmarLanguageDetector';
import { TRANSLATIONS } from '../i18n/translations';
import { ProductImage } from './ProductImage';
import { AiProductAnalysisSection } from './AiProductAnalysisSection';
import { DataEnrichmentSection } from './DataEnrichmentSection';
import { InfoPopover } from './InfoPopover';

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
  onOpenDeepDive?: (product: ResearchProduct) => void;
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
  if (level === 'Low') return 'text-emerald-700 dark:text-emerald-400';
  if (level === 'Watch') return 'text-amber-700 dark:text-amber-400';
  return 'text-red-700 dark:text-red-400';
}

function verificationColorClass(status: VerificationState): string {
  if (status === 'Verified') return 'text-emerald-700 dark:text-emerald-400';
  if (status === 'Needs Check') return 'text-amber-700 dark:text-amber-400';
  return 'text-red-700 dark:text-red-400';
}

function tierTextColor(tier: ScoreTier): string {
  if (tier === 'priority-test') return 'text-emerald-700 dark:text-emerald-400';
  if (tier === 'investigate-further') return 'text-amber-700 dark:text-amber-400';
  return 'text-zinc-600 dark:text-zinc-400';
}

function dataStatusColorClass(status: DataStatus): string {
  if (status === 'verified') return 'text-emerald-700 dark:text-emerald-400';
  if (status === 'estimated') return 'text-amber-700 dark:text-amber-400';
  if (status === 'unverified') return 'text-zinc-500 dark:text-zinc-400';
  return 'text-zinc-400 dark:text-zinc-500';
}

function decisionVerdictColor(verdict: ProductDecisionVerdict): string {
  if (verdict === 'recommended') return 'text-emerald-700 dark:text-emerald-400';
  if (verdict === 'worth-testing') return 'text-zinc-900 dark:text-zinc-100';
  if (verdict === 'need-more-data') return 'text-amber-700 dark:text-amber-400';
  return 'text-red-700 dark:text-red-400';
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
  onOpenDeepDive,
  onClose,
  onAiAnalysisSaved,
  onProductEnriched,
  language,
}: ResearchReportDrawerProps) {
  const [copied, setCopied] = useState(false);
  const [copiedTikTokLink, setCopiedTikTokLink] = useState(false);
  const [activeAiAnalysis, setActiveAiAnalysis] = useState<AiProductAnalysis | null>(null);
  const [resolvedTikTokUrl, setResolvedTikTokUrl] = useState<string | null>(() =>
    getTikTokShopProductUrl(product)
  );

  useEffect(() => {
    setCopied(false);
    setCopiedTikTokLink(false);
    setActiveAiAnalysis(null);
  }, [product?.id]);

  useEffect(() => {
    const syncUrl = getTikTokShopProductUrl(product);
    setResolvedTikTokUrl(syncUrl);

    if (!product) return;
    const numericId = extractCanonicalTikTokNumericId(product);
    if (!numericId || hasResolvedCanonicalTikTokSlug(product)) return;

    const controller = new AbortController();
    fetchResolvedTikTokProductUrl(numericId, controller.signal).then((canonicalUrl) => {
      if (canonicalUrl && !controller.signal.aborted) {
        setResolvedTikTokUrl(canonicalUrl);
      }
    });
    return () => controller.abort();
  }, [product?.id, product?.kalodataMetrics?.productId]);

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
  const categoryLabel = getCategoryLabel(product.category, language);

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

  const effectiveCommissionPerSaleStatus: DataStatus =
    earningPerOrderThb !== null
      ? normalizeDataStatus(
          product.commissionPerSaleStatus ??
            (effectivePriceStatus === 'verified' ? 'verified' : 'estimated')
        )
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
      status: normalizeDataStatus(
        product.sellerStatus ?? (hasVerifiedSource ? 'estimated' : 'unverified')
      ),
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
      value: competitionUnavailable ? '—' : t.competitionLabels[product.competitionLevel],
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
        product.productQualityStatus ??
          (product.productQualityEvidenceEn ? 'estimated' : 'unavailable')
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
  const tiktokShopUrl = resolvedTikTokUrl ?? getTikTokShopProductUrl(product);
  const myanmarInfo = product.myanmarLanguage ?? detectMyanmarLanguageForProduct(product);
  const lastUpdatedIso = km?.lastEnrichedAt ?? effectiveDateIso;
  const formattedLastUpdated = lastUpdatedIso
    ? formatResearchDateTime(lastUpdatedIso, language)
    : t.dataStatusLabels.unavailable;

  const jumpToSection = (sectionId: string) => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

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
      className="fixed inset-0 z-50 flex justify-end bg-zinc-950/40 dark:bg-black/65 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="research-report-title"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl bg-white dark:bg-zinc-900 h-full shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky Top Header + Section Jump Navigation */}
        <div className="shrink-0 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
          <div className="px-5 sm:px-7 h-14 flex items-center justify-between gap-4">
            <div className="text-xs font-medium text-zinc-600 dark:text-zinc-400 truncate">
              {t.reportTitle} · {categoryLabel}
              {formattedResearchDate ? (
                <span className="font-mono text-zinc-400 dark:text-zinc-500"> · {formattedResearchDate}</span>
              ) : null}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {onOpenDeepDive && (
                <button
                  type="button"
                  onClick={() => onOpenDeepDive(product)}
                  className="inline-flex items-center gap-1.5 min-h-[34px] px-3 py-1.5 text-xs font-medium text-zinc-800 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Layers className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>Deep Dive</span>
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label={t.reportClose}
                className="w-9 h-9 rounded-lg inline-flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* 10-Link Quick-Jump Section Navigation */}
          <nav
            aria-label="Report sections"
            className="px-5 sm:px-7 pb-2.5 flex items-center gap-4 overflow-x-auto text-xs font-medium text-zinc-500 dark:text-zinc-400"
          >
            {(
              [
                { id: 'rep-overview', label: t.reportJumpSummary },
                { id: 'rep-decision', label: t.reportTabDecision },
                { id: 'rep-market-data', label: t.reportTabMarketData },
                { id: 'rep-enrichment', label: t.enrichJumpLabel },
                { id: 'rep-score', label: t.scoringJumpLabel },
                { id: 'rep-ai-analysis', label: t.aiJumpLabel },
                { id: 'rep-reviews', label: t.reportJumpReviews },
                { id: 'rep-risks', label: t.reportJumpRisks },
                { id: 'rep-video', label: t.reportJumpVideo },
                { id: 'rep-sources', label: t.reportJumpSources },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => jumpToSection(item.id)}
                className="hover:text-zinc-950 dark:hover:text-zinc-50 transition-colors cursor-pointer whitespace-nowrap shrink-0 py-0.5"
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Scrollable Dossier */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-7 py-6 space-y-8">
          {/* 1. Product Dossier Hero Summary */}
          <div
            id="rep-overview"
            className="scroll-mt-4 grid grid-cols-1 md:grid-cols-12 gap-5 items-start"
          >
            <div className="md:col-span-5 space-y-2">
              <div className="relative aspect-[4/3] w-full rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-800">
                {imageConfig.canRender && imageConfig.src ? (
                  <>
                    <ProductImage
                      src={imageConfig.src}
                      fallbackSrc={imageConfig.fallbackSrc}
                      productId={imageConfig.productId}
                      alt={product.name}
                      title={displayName}
                      unavailableLabel={t.cardImageUnverified}
                    />
                    {imageSourceNote && (
                      <div className="absolute bottom-2 right-2">
                        <InfoPopover
                          variant="info"
                          label={isMy ? 'ပုံအရင်းအမြစ်' : 'Image source'}
                          title={isMy ? 'ပုံအရင်းအမြစ်' : 'Image source'}
                          content={imageSourceNote}
                          className="bg-white/90 dark:bg-zinc-900/90 text-zinc-700 dark:text-zinc-300 shadow-xs hover:bg-white dark:hover:bg-zinc-800"
                        />
                      </div>
                    )}
                  </>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-5 text-center">
                    <ImageOff className="w-6 h-6 text-zinc-400 dark:text-zinc-500 mb-2" aria-hidden="true" />
                    <div className="inline-flex items-center gap-1">
                      <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t.cardImageUnverified}</p>
                      {imageSourceNote && (
                        <InfoPopover
                          variant="info"
                          label={t.cardImageUnverified}
                          title={t.cardImageUnverified}
                          content={imageSourceNote}
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="md:col-span-7 flex flex-col justify-between space-y-4">
              <div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  {categoryLabel} · {subCategory} ·{' '}
                  {product.brand ? `${product.brand} · ` : ''}
                  {product.shopName} ({product.dispatchHub})
                </div>
                <h2
                  id="research-report-title"
                  className="mt-1.5 font-display text-xl sm:text-2xl font-bold text-zinc-950 dark:text-zinc-50 leading-snug text-balance"
                >
                  {displayName}
                </h2>
                <p className={`mt-1.5 text-xs font-medium ${tierTextColor(evaluation.tier)}`}>
                  {t.scoringTierRanges[evaluation.tier]} · {t.scoringTierLabels[evaluation.tier]}
                </p>
                {tiktokShopUrl && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <a
                      href={tiktokShopUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 min-h-[36px] px-3.5 py-1.5 text-xs font-semibold text-white dark:text-zinc-950 bg-zinc-950 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white rounded-lg transition-colors whitespace-nowrap"
                    >
                      <span>
                        {isMy
                          ? 'TikTok Shop တွင် တိုက်ရိုက်ကြည့်ရန်'
                          : 'Open on TikTok Shop'}
                      </span>
                      <ExternalLink className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    </a>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(tiktokShopUrl);
                          setCopiedTikTokLink(true);
                          setTimeout(() => setCopiedTikTokLink(false), 1600);
                        } catch {
                          // Ignore clipboard errors in restricted contexts
                        }
                      }}
                      title={isMy ? 'TikTok Shop လင့်ခ်ကူးယူရန်' : 'Copy TikTok Shop link'}
                      aria-label={isMy ? 'TikTok Shop လင့်ခ်ကူးယူရန်' : 'Copy TikTok Shop link'}
                      className="inline-flex items-center gap-1 min-h-[36px] px-2.5 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                    >
                      {copiedTikTokLink ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      )}
                      <span>{copiedTikTokLink ? (isMy ? 'ကူးပြီး' : 'Copied') : (isMy ? 'လင့်ခ်ကူး' : 'Copy')}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* At-a-Glance Decision Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                <div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">{t.cardPrice}</div>
                  {product.priceThb !== null && product.priceThb > 0 ? (
                    <div className="mt-0.5">
                      <div className="font-mono text-base font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums">
                        {formatThb(product.priceThb)}
                      </div>
                      <div
                        className={`text-[11px] font-medium ${dataStatusColorClass(effectivePriceStatus)}`}
                      >
                        {t.dataStatusLabels[effectivePriceStatus]}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-0.5 text-xs font-medium text-zinc-400 dark:text-zinc-500">
                      {t.dataStatusLabels[effectivePriceStatus]}
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">{t.cardCommission}</div>
                  <div className="mt-0.5 font-mono text-base font-semibold tabular-nums">
                    {hasVerifiedCommission && product.commissionRate !== null ? (
                      <span className="text-emerald-700 dark:text-emerald-400">{product.commissionRate}%</span>
                    ) : (
                      <span className="font-sans text-xs font-medium text-zinc-400 dark:text-zinc-500">
                        {t.dataStatusLabels[effectiveCommissionStatus]}
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">{t.cardOpportunityScore}</div>
                  <div className="mt-0.5 font-mono text-base font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums">
                    {evaluation.totalScore}
                    <span className="text-xs font-normal text-zinc-400 dark:text-zinc-500">/100</span>
                  </div>
                </div>

                <div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">{t.cardConfidence}</div>
                  <div className="mt-0.5 text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                    {t.confidenceLabels[evaluation.confidenceLevel]}{' '}
                    <span className="font-mono text-xs font-normal text-zinc-500 dark:text-zinc-400 tabular-nums">
                      ({evaluation.confidencePct}%)
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 2. Phase 5: Multi-Signal Final Decision Summary */}
          <section
            id="rep-decision"
            className="scroll-mt-4 pt-6 border-t border-zinc-200 dark:border-zinc-800 space-y-3"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                {t.decisionSummaryHeading}
              </h3>
              <span
                className={`text-xs font-semibold ${decisionVerdictColor(decisionSummary.verdict)}`}
              >
                {t.decisionVerdictLabels[decisionSummary.verdict]}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-800/80 space-y-3 text-xs">
              <p className="text-zinc-800 dark:text-zinc-200 leading-relaxed font-medium">
                {isMy ? decisionSummary.reasonMy : decisionSummary.reasonEn}
              </p>

              {(isMy ? decisionSummary.cautionsMy : decisionSummary.cautionsEn).length > 0 && (
                <div className="pt-2.5 border-t border-zinc-200/70 dark:border-zinc-800/70 space-y-1">
                  <div className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">
                    {t.decisionCautionsLabel}
                  </div>
                  <ul className="space-y-1 text-zinc-600 dark:text-zinc-400 leading-relaxed list-disc pl-4 marker:text-amber-600">
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

          {/* 2b. Phase 9: Myanmar Video / Review Evidence & Status (Thailand TikTok Shop Only) */}
          {(myanmarInfo.matched ||
            (myanmarInfo.matchedVideos?.length ?? 0) > 0 ||
            myanmarInfo.totalReviewsChecked > 0) && (() => {
            const matchedVideos = myanmarInfo.matchedVideos ?? [];
            const isVideoBacked = matchedVideos.length > 0;
            return (
              <section
                id="rep-myanmar-signals"
                className="scroll-mt-4 pt-6 border-t border-zinc-200 dark:border-zinc-800 space-y-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                      {t.myanmarSignalSectionHeading}
                    </h3>
                    <InfoPopover
                      variant="info"
                      label={t.myanmarSignalSectionHeading}
                      title={t.myanmarSignalSectionHeading}
                      content={t.myanmarSignalSectionSubtitle}
                    />
                  </div>
                  <span
                    className={`font-mono text-xs font-semibold ${
                      isVideoBacked || myanmarInfo.reviewStatus === 'matched'
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : myanmarInfo.reviewStatus === 'review-unavailable'
                          ? 'text-amber-700 dark:text-amber-400'
                          : 'text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    {isVideoBacked
                      ? `${myanmarInfo.matchedVideoCount ?? matchedVideos.length} ${t.myanmarVideosMatchedLabel}`
                      : t.myanmarReviewStatusLabels[myanmarInfo.reviewStatus]}
                    {myanmarInfo.matched &&
                      ` · ${t.myanmarConfidenceLabels[myanmarInfo.confidence]}`}
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-800/80 space-y-3 text-xs">
                  {/* Confirmed Myanmar Promotional Videos (Video-First Discovery) */}
                  {isVideoBacked && (
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">
                        {t.myanmarVideoEvidenceHeading}
                      </div>
                      <ul className="space-y-2">
                        {matchedVideos.map((vid, idx) => (
                          <li
                            key={`my-video-${vid.videoId}-${idx}`}
                            className="p-2.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 space-y-1"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                                  {vid.creatorHandle ||
                                    vid.creatorName ||
                                    t.myanmarMatchTypeLabels[vid.matchType]}
                                </span>
                                <span className="text-zinc-500 dark:text-zinc-400">
                                  ({t.myanmarMatchTypeLabels[vid.matchType]})
                                </span>
                                {vid.isMixedThaiBurmese && (
                                  <span className="font-medium text-amber-700 dark:text-amber-400">
                                    · {t.myanmarMixedThaiBurmeseTag}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 font-mono text-zinc-500 dark:text-zinc-400 tabular-nums">
                                {typeof vid.videoRevenueThb === 'number' && (
                                  <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                                    {formatThb(vid.videoRevenueThb)}
                                  </span>
                                )}
                                {typeof vid.videoViews === 'number' && (
                                  <span>{vid.videoViews.toLocaleString('en-US')} views</span>
                                )}
                                <span>P{vid.pageNumber}</span>
                              </div>
                            </div>
                            <p className="text-zinc-800 dark:text-zinc-200 leading-relaxed break-words">
                              “{vid.captionSnippet}”
                            </p>
                            {isSafeHttpUrl(vid.videoUrl) && (
                              <div className="pt-0.5">
                                <a
                                  href={vid.videoUrl!}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-900 dark:text-zinc-100 hover:underline"
                                >
                                  <span>{t.myanmarVideoOpenLinkLabel}</span>
                                  <ExternalLink className="w-3 h-3" aria-hidden="true" />
                                </a>
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Honest Review Check Counts (when reviews were checked) */}
                  {myanmarInfo.totalReviewsChecked > 0 && (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-zinc-700 dark:text-zinc-300 tabular-nums">
                      <span>
                        <strong className="text-zinc-950 dark:text-zinc-50">{myanmarInfo.matchedReviewCount}</strong>{' '}
                        {t.myanmarReviewsMatchedLabel}
                      </span>
                      <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-600">
                        ·
                      </span>
                      <span>
                        <strong className="text-zinc-950 dark:text-zinc-50">{myanmarInfo.totalReviewsChecked}</strong>{' '}
                        {t.myanmarReviewsCheckedLabel}
                      </span>
                      {myanmarInfo.skippedTooShortCount > 0 && (
                        <>
                          <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-600">
                            ·
                          </span>
                          <span className="text-zinc-500 dark:text-zinc-400">
                            {myanmarInfo.skippedTooShortCount} {t.myanmarSkippedShortLabel}
                          </span>
                        </>
                      )}
                    </div>
                  )}

                  {/* Confirmed Myanmar-Language Review Quotes */}
                  {myanmarInfo.matchedReviews && myanmarInfo.matchedReviews.length > 0 ? (
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">
                        {t.myanmarEvidenceHeading}
                      </div>
                      <ul className="space-y-2">
                        {myanmarInfo.matchedReviews.map((rv, idx) => (
                          <li
                            key={`my-review-${idx}`}
                            className="p-2.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 space-y-1"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                                  {t.myanmarMatchTypeLabels[rv.matchType]}
                                </span>
                                {rv.isMixedThaiBurmese && (
                                  <span className="font-medium text-amber-700 dark:text-amber-400">
                                    · {t.myanmarMixedThaiBurmeseTag}
                                  </span>
                                )}
                              </div>
                              <span className="font-mono text-zinc-500 dark:text-zinc-400 tabular-nums">
                                {typeof rv.rating === 'number' ? `★ ${rv.rating.toFixed(1)} · ` : ''}
                                {typeof rv.pageNumber === 'number' && rv.pageNumber > 1
                                  ? `P${rv.pageNumber} · `
                                  : ''}
                                {rv.myanmarLetterCount} chars
                              </span>
                            </div>
                            <p className="text-zinc-800 dark:text-zinc-200 leading-relaxed break-words">
                              “{rv.snippet}”
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : !isVideoBacked ? (
                    <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">{t.myanmarNoEvidenceNote}</p>
                  ) : null}

                  {/* Honest Per-Source Availability Matrix */}
                  <div className="pt-2.5 border-t border-zinc-200/70 dark:border-zinc-800/70 space-y-1.5">
                    <div className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">
                      {t.myanmarSourcesHeading}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {(
                        ['videoContent', 'comments', 'reviews', 'title', 'description'] as MyanmarSignalSource[]
                      ).map((srcKey) => {
                        const st = myanmarInfo.sourceStatuses[srcKey];
                        const statusColor =
                          st.availability === 'matched'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : st.availability === 'checked-no-match'
                              ? 'text-zinc-600 dark:text-zinc-400'
                              : 'text-zinc-400 dark:text-zinc-500';
                        return (
                          <div
                            key={srcKey}
                            className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800/70"
                          >
                            <span className="text-zinc-700 dark:text-zinc-300 truncate">
                              {t.myanmarSourceLabels[srcKey]}
                            </span>
                            <span className={`font-mono text-[11px] font-medium shrink-0 ${statusColor}`}>
                              {t.myanmarAvailabilityLabels[st.availability]}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Strict Thailand-Only Market Disclaimer */}
                  <p className="pt-2 border-t border-zinc-200/70 dark:border-zinc-800/70 text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    {isMy ? myanmarInfo.marketScopeNoteMy : myanmarInfo.marketScopeNoteEn}
                  </p>
                </div>
              </section>
            );
          })()}

          {/* 3. Dedicated Verified Kalodata Market Data Block (Clearly Separate from AI Assessment) */}
          <section
            id="rep-market-data"
            className="scroll-mt-4 pt-6 border-t border-zinc-200 dark:border-zinc-800 space-y-3"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h3 className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                  {t.reportTabMarketData}
                </h3>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  {t.reportKalodataTag} · Product ID:{' '}
                  <span className="font-mono tabular-nums text-zinc-700 dark:text-zinc-300">
                    {getCanonicalProductId(product)}
                  </span>
                </p>
              </div>
              <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                {km?.dateRange ?? t.dataStatusLabels.unavailable}
              </span>
            </div>

            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 text-xs">
              <div>
                <dt className="text-[11px] text-zinc-500 dark:text-zinc-400">{isMy ? 'ရောင်းအား' : 'Sales Volume'}</dt>
                <dd className="mt-0.5 font-mono font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums">
                  {typeof km?.salesVolume === 'number'
                    ? km.salesVolume.toLocaleString('en-US')
                    : t.dataStatusLabels.unavailable}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {isMy ? 'ဝင်ငွေ (GMV)' : 'Revenue (THB)'}
                </dt>
                <dd className="mt-0.5 font-mono font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums">
                  {typeof km?.revenueThb === 'number'
                    ? formatThb(km.revenueThb)
                    : t.dataStatusLabels.unavailable}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {isMy ? 'ဝင်ငွေတိုးတက်နှုန်း' : 'Revenue Growth'}
                </dt>
                <dd className="mt-0.5 font-mono font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums">
                  {typeof km?.revenueGrowthRate === 'number'
                    ? `${km.revenueGrowthRate >= 0 ? '+' : ''}${km.revenueGrowthRate.toFixed(1)}%`
                    : t.dataStatusLabels.unavailable}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {isMy ? 'Creator အရေအတွက်' : 'Creator Count'}
                </dt>
                <dd className="mt-0.5 font-mono font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums">
                  {typeof km?.creatorNumber === 'number'
                    ? km.creatorNumber.toLocaleString('en-US')
                    : t.dataStatusLabels.unavailable}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-zinc-500 dark:text-zinc-400">{t.cardCommission}</dt>
                <dd className="mt-0.5 font-mono font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                  {hasVerifiedCommission && product.commissionRate !== null
                    ? `${product.commissionRate}%`
                    : t.dataStatusLabels.unavailable}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {isMy ? 'Video ဝင်ငွေ' : 'Video Revenue'}
                </dt>
                <dd className="mt-0.5 font-mono font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums">
                  {typeof km?.videoRevenueThb === 'number'
                    ? formatThb(km.videoRevenueThb)
                    : t.dataStatusLabels.unavailable}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {isMy ? 'Live ဝင်ငွေ' : 'Live Revenue'}
                </dt>
                <dd className="mt-0.5 font-mono font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums">
                  {typeof km?.liveRevenueThb === 'number'
                    ? formatThb(km.liveRevenueThb)
                    : t.dataStatusLabels.unavailable}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-zinc-500 dark:text-zinc-400">{isMy ? 'ဆိုင် GMV' : 'Shop GMV'}</dt>
                <dd className="mt-0.5 font-mono font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums">
                  {typeof km?.shopRevenueThb === 'number'
                    ? formatThb(km.shopRevenueThb)
                    : t.dataStatusLabels.unavailable}
                </dd>
              </div>
            </dl>
          </section>

          {/* 4. 14-Field Data Provenance Matrix */}
          <section className="pt-6 border-t border-zinc-200 dark:border-zinc-800 space-y-3">
            <div className="flex items-center gap-1.5">
              <h3 className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                {t.dataVerificationHeading}
              </h3>
              <InfoPopover
                variant="info"
                label={t.dataVerificationHeading}
                title={t.dataVerificationHeading}
                content={t.dataVerificationSubtitle}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 divide-y divide-zinc-100 dark:divide-zinc-800/70 sm:divide-y-0">
              {provenanceItems.map((item) => (
                <div
                  key={item.label}
                  className="py-2 sm:border-b sm:border-zinc-100 dark:sm:border-zinc-800/70 flex items-baseline justify-between gap-3 text-xs"
                >
                  <span className="text-zinc-600 dark:text-zinc-400 truncate">{item.label}</span>
                  <div className="flex items-baseline gap-2 shrink-0 text-right">
                    <span className="font-mono text-zinc-900 dark:text-zinc-100 tabular-nums max-w-[140px] truncate">
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

          {/* 5. Phase 4: Kalodata Data Enrichment (Product Detail, Shop Info, Review Insights, Cost Control) */}
          <DataEnrichmentSection
            product={product}
            salesWeightPct={salesWeightPct}
            peerProducts={peerProducts}
            spendingLimitCredits={spendingLimitCredits}
            language={language}
            onProductEnriched={onProductEnriched}
          />

          {/* 6. Phase 2: 7-Factor 100-Point Product Scoring Engine Breakdown & Explanations */}
          <section
            id="rep-score"
            className="scroll-mt-4 pt-6 border-t border-zinc-200 dark:border-zinc-800 space-y-4"
          >
            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                    {t.scoringBreakdownHeading}
                  </h3>
                  <InfoPopover
                    variant="help"
                    label={t.scoringBreakdownHeading}
                    title={t.scoringBreakdownHeading}
                    content={
                      <div className="space-y-1.5">
                        <p className="font-medium text-zinc-800 dark:text-zinc-200">{t.scoringDisclaimer}</p>
                        <p>{t.scoringVerificationRule}</p>
                        {evaluation.redistributedWeightPct > 0 && (
                          <p className="text-amber-800 dark:text-amber-300 font-medium">
                            {t.scoringRedistributedNotice} ({evaluation.redistributedWeightPct} pts)
                          </p>
                        )}
                      </div>
                    }
                  />
                </div>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  {t.scoringStrategyActiveLabel}: {strategyFocusLabel} ({evaluation.salesWeightPct}/
                  {100 - evaluation.salesWeightPct})
                  {evaluation.redistributedWeightPct > 0 ? (
                    <span className="ml-2 text-amber-700 dark:text-amber-400 font-medium">
                      · {evaluation.redistributedWeightPct} pts redistributed
                    </span>
                  ) : null}
                </p>
              </div>
              <span className="font-mono text-xs text-zinc-600 dark:text-zinc-400 tabular-nums">
                {evaluation.totalScore}/100 · {t.cardConfidence}:{' '}
                <strong className="text-zinc-950 dark:text-zinc-50">
                  {t.confidenceLabels[evaluation.confidenceLevel]} ({evaluation.confidencePct}%)
                </strong>
              </span>
            </div>

            {/* 7-Factor Transparent Breakdown Table */}
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800/70 border-y border-zinc-200/80 dark:border-zinc-800/80">
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
                  <div key={item.key} className="py-2.5 space-y-1.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                      <div className="flex items-center gap-1 font-medium text-zinc-900 dark:text-zinc-100 min-w-0">
                        <span className="font-mono text-zinc-400 dark:text-zinc-500 mr-0.5 tabular-nums shrink-0">
                          0{idx + 1}.
                        </span>
                        <span className="truncate">{t.factorLabels[item.key]}</span>
                        {metricDisplay && (
                          <span className="ml-1 font-mono text-[11px] font-normal text-zinc-500 dark:text-zinc-400 tabular-nums truncate">
                            · {metricDisplay}
                          </span>
                        )}
                        <InfoPopover
                          variant="info"
                          label={t.factorLabels[item.key]}
                          title={t.factorLabels[item.key]}
                          content={
                            <div className="space-y-1.5">
                              <p>{evidence}</p>
                              <p className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                                {t.scoringBaseWeightLabel}: {item.baseWeight} pts
                                {weightAdjusted
                                  ? ` → ${t.scoringEffectiveWeightLabel}: ${item.effectiveWeight.toFixed(1)} pts`
                                  : ''}
                              </p>
                            </div>
                          }
                        />
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span className={`font-medium ${dataStatusColorClass(item.verification)}`}>
                          {t.criterionVerificationLabels[item.verification]}
                        </span>
                        {item.wasRedistributed || item.earnedPoints === null ? (
                          <span className="font-mono text-[11px] text-amber-700 dark:text-amber-400 tabular-nums">
                            {t.scoringRedistributedLabel}
                          </span>
                        ) : (
                          <span className="font-mono font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums min-w-[68px] text-right">
                            {item.earnedPoints.toFixed(1)}/{item.effectiveWeight.toFixed(1)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="h-1.5 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                      {item.wasRedistributed ? (
                        <div className="h-full w-full bg-zinc-200/70 dark:bg-zinc-700/70" />
                      ) : (
                        <div
                          className={`h-full rounded-full ${
                            item.verification === 'verified'
                              ? 'bg-zinc-900 dark:bg-zinc-200'
                              : item.verification === 'estimated'
                                ? 'bg-amber-500'
                                : 'bg-zinc-400'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 4-Box Score Explanation Grid: Strengths, Weaknesses, Risks, Data Confidence */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-800/80 space-y-2">
                <h4 className="font-display text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                  {t.scoringStrengthsHeading}
                </h4>
                <ul className="space-y-1.5 text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed list-disc pl-4 marker:text-emerald-600">
                  {(isMy ? evaluation.strengthsMy : evaluation.strengthsEn).map((line, i) => (
                    <li key={`${i}-${line}`}>{line}</li>
                  ))}
                </ul>
              </div>

              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-800/80 space-y-2">
                <h4 className="font-display text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                  {t.scoringWeaknessesHeading}
                </h4>
                <ul className="space-y-1.5 text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed list-disc pl-4 marker:text-zinc-400">
                  {(isMy ? evaluation.weaknessesMy : evaluation.weaknessesEn).map((line, i) => (
                    <li key={`${i}-${line}`}>{line}</li>
                  ))}
                </ul>
              </div>

              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-800/80 space-y-2">
                <h4 className="font-display text-xs font-semibold text-amber-800 dark:text-amber-300">
                  {t.scoringRisksHeading}
                </h4>
                <ul className="space-y-1.5 text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed list-disc pl-4 marker:text-amber-600">
                  {(isMy ? evaluation.risksMy : evaluation.risksEn).map((line, i) => (
                    <li key={`${i}-${line}`}>{line}</li>
                  ))}
                </ul>
              </div>

              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-800/80 space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <h4 className="font-display text-xs font-semibold text-zinc-950 dark:text-zinc-50">
                    {t.scoringConfidenceHeading}
                  </h4>
                  <span className="font-mono text-xs font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">
                    {t.confidenceLabels[evaluation.confidenceLevel]} · {evaluation.confidencePct}%
                  </span>
                </div>
                <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
                  {isMy ? evaluation.confidenceExplanationMy : evaluation.confidenceExplanationEn}
                </p>
              </div>
            </div>
          </section>

          {/* 7. Phase 3: Gemini AI Product Analysis (Explicitly Separated from Verified Kalodata Market Data) */}
          <div className="space-y-1">
            <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">{t.reportAiTag}</div>
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

          {/* 8. 01. Why Choose This Product */}
          <section className="pt-6 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
            <h3 className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-50">
              {t.sec01WhyChoose}
            </h3>
            <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">{whyChoose}</p>
          </section>

          {/* 9. 02. Market Demand & 03. Sales Potential */}
          <section className="pt-6 border-t border-zinc-200 dark:border-zinc-800 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                  {t.sec02MarketDemand}
                </h3>
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400 shrink-0">
                  {t.demandLabels[product.demandLevel]}
                </span>
              </div>
              <ul className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed list-disc pl-4 marker:text-zinc-400">
                {demandEvidence.map((item, idx) => (
                  <li key={`${idx}-${item}`}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="space-y-2">
              <h3 className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                {t.sec03SalesPotential}
              </h3>
              <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">{salesPotential}</p>
            </div>
          </section>

          {/* 10. 04. Commission Rate & Earning per Sale */}
          <section className="pt-6 border-t border-zinc-200 dark:border-zinc-800 space-y-3">
            <div className="flex items-center gap-1.5">
              <h3 className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                {t.sec04CommissionIncome}
              </h3>
              {commissionNote && (
                <InfoPopover
                  variant="info"
                  label={t.sec04CommissionIncome}
                  title={t.sec04CommissionIncome}
                  content={commissionNote}
                />
              )}
            </div>
            <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-800/80 flex items-baseline gap-8">
              <div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">{t.cardCommission}</div>
                <div className="mt-0.5 font-mono text-lg font-semibold tabular-nums">
                  {hasVerifiedCommission && product.commissionRate !== null ? (
                    <span className="text-emerald-700 dark:text-emerald-400">{product.commissionRate}%</span>
                  ) : (
                    <span className="font-sans text-sm font-medium text-amber-700 dark:text-amber-400">
                      {t.dataStatusLabels[effectiveCommissionStatus]}
                    </span>
                  )}
                </div>
              </div>

              <div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">{t.estEarningPerSale}</div>
                <div className="mt-0.5 font-mono text-lg font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums">
                  {earningPerOrderThb !== null ? formatThb(earningPerOrderThb) : '—'}
                </div>
              </div>
            </div>
          </section>

          {/* 11. 05. Customer Review Strengths & 06. Complaints */}
          <section
            id="rep-reviews"
            className="scroll-mt-4 pt-6 border-t border-zinc-200 dark:border-zinc-800 space-y-4"
          >
            {(typeof product.customerRating === 'number' ||
              typeof product.reviewCount === 'number' ||
              productQualityEvidence) && (
              <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-800/80 space-y-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">{t.productQualityHeading}</span>
                  <div className="flex items-center gap-2 font-mono tabular-nums text-zinc-700 dark:text-zinc-300">
                    {typeof product.customerRating === 'number' && product.customerRating > 0 && (
                      <span className="inline-flex items-center gap-1 font-semibold text-zinc-950 dark:text-zinc-50">
                        <Star
                          className="w-3.5 h-3.5 text-amber-500 fill-amber-500"
                          aria-hidden="true"
                        />
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
                  <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">{productQualityEvidence}</p>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <h3 className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                  {t.sec05ReviewStrengths}
                </h3>
                <ul className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed list-disc pl-4 marker:text-emerald-600">
                  {reviewStrengths.map((item, idx) => (
                    <li key={`${idx}-${item}`}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="space-y-2">
                <h3 className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                  {t.sec06CustomerComplaints}
                </h3>
                <ul className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed list-disc pl-4 marker:text-amber-600">
                  {customerComplaints.map((item, idx) => (
                    <li key={`${idx}-${item}`}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          {/* 12. 07. Competitor Landscape & 08. Seller Reliability */}
          <section className="pt-6 border-t border-zinc-200 dark:border-zinc-800 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                  {t.sec07CompetitorLandscape}
                </h3>
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400 shrink-0">
                  {competitionUnavailable
                    ? t.dataStatusLabels.unavailable
                    : t.competitionLabels[product.competitionLevel]}
                </span>
              </div>
              <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">{competitionDetail}</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                  {t.sec08SellerReliability}
                </h3>
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400 shrink-0">
                  {t.sellerReliabilityLabels[product.sellerReliabilityLevel]}
                </span>
              </div>
              <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">{sellerReliability}</p>
            </div>
          </section>

          {/* 13. 09. Product Risks + Category-Specific Audit */}
          <section
            id="rep-risks"
            className="scroll-mt-4 pt-6 border-t border-zinc-200 dark:border-zinc-800 space-y-4"
          >
            <h3 className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-50">
              {t.sec09ProductRisks}
            </h3>

            <ul className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed list-disc pl-4 marker:text-zinc-400">
              {generalRisks.map((risk, idx) => (
                <li key={`${idx}-${risk}`}>{risk}</li>
              ))}
            </ul>

            {product.category === 'womens-fashion' && product.fashionReturnRisk && (
              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-800/80 space-y-3.5">
                <div className="flex items-center gap-2">
                  <AlertTriangle
                    className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0"
                    aria-hidden="true"
                  />
                  <h4 className="font-display text-xs sm:text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                    {t.fashionRiskHeading}
                  </h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {(
                    [
                      {
                        key: 'sizing',
                        label: t.fashionRiskSizing,
                        data: product.fashionReturnRisk.sizing,
                      },
                      {
                        key: 'fabric',
                        label: t.fashionRiskFabric,
                        data: product.fashionReturnRisk.fabric,
                      },
                      {
                        key: 'color',
                        label: t.fashionRiskColor,
                        data: product.fashionReturnRisk.colorAccuracy,
                      },
                      {
                        key: 'fit',
                        label: t.fashionRiskFit,
                        data: product.fashionReturnRisk.fitDifference,
                      },
                    ] as const
                  ).map((item) => (
                    <div
                      key={item.key}
                      className="pt-3 border-t border-zinc-200/80 dark:border-zinc-800/80 first:border-t-0 sm:first:border-t sm:border-t space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-zinc-900 dark:text-zinc-100">{item.label}</span>
                        <span className={`font-medium ${riskColorClass(item.data.level)}`}>
                          {t.riskSeverityLabels[item.data.level]}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                        {isMy ? item.data.noteMy : item.data.noteEn}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {product.category === 'cosmetics-beauty' && product.cosmeticsComplianceRisk && (
              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-800/80 space-y-3.5">
                <div className="flex items-center gap-2">
                  <ShieldAlert
                    className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0"
                    aria-hidden="true"
                  />
                  <h4 className="font-display text-xs sm:text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                    {t.cosmeticsCheckHeading}
                  </h4>
                </div>

                <div className="space-y-3">
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
                      className="pt-3 border-t border-zinc-200/80 dark:border-zinc-800/80 first:pt-0 first:border-t-0 space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-zinc-900 dark:text-zinc-100">{item.label}</span>
                        <span
                          className={`inline-flex items-center gap-1 font-medium ${verificationColorClass(item.data.status)}`}
                        >
                          {item.data.status === 'Verified' && (
                            <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                          )}
                          <span>{t.verificationLabels[item.data.status]}</span>
                        </span>
                      </div>
                      <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                        {isMy ? item.data.noteMy : item.data.noteEn}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* 14. 10. AI Video Advertising Potential & 11. 3 Video Content Ideas */}
          <section
            id="rep-video"
            className="scroll-mt-4 pt-6 border-t border-zinc-200 dark:border-zinc-800 space-y-5"
          >
            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                  {t.sec10AiVideoPotential}
                </h3>
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400 shrink-0">
                  {t.aiVideoLabels[product.aiVideoSuitability]}
                </span>
              </div>
              <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">{aiVideoDetail}</p>
            </div>

            <div className="space-y-2.5">
              <h3 className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                {t.sec11VideoContentIdeas}
              </h3>
              <ol className="divide-y divide-zinc-200/80 dark:divide-zinc-800/80 border-y border-zinc-200/80 dark:border-zinc-800/80">
                {product.videoIdeas.map((idea, idx) => (
                  <li
                    key={`${idx}-${idea.titleEn}`}
                    className="py-3 flex items-start gap-3"
                  >
                    <span className="font-mono text-xs font-medium text-zinc-400 dark:text-zinc-500 pt-0.5 tabular-nums shrink-0">
                      0{idx + 1}.
                    </span>
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                          {isMy ? idea.titleMy : idea.titleEn}
                        </span>
                        <span className="text-xs text-zinc-400 dark:text-zinc-500" aria-hidden="true">
                          ·
                        </span>
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                          {isMy ? idea.formatMy : idea.formatEn}
                        </span>
                      </div>
                      <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                        {isMy ? idea.outlineMy : idea.outlineEn}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          {/* 15. 12. Research Sources, Last Updated, 13. Confidence, 14. Missing Data */}
          <section
            id="rep-sources"
            className="scroll-mt-4 pt-6 border-t border-zinc-200 dark:border-zinc-800 space-y-5"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2 pb-2 border-b border-zinc-100 dark:border-zinc-800/70 text-xs text-zinc-500 dark:text-zinc-400">
              <span>
                {t.reportLastUpdatedLabel}:{' '}
                <strong className="font-mono text-zinc-900 dark:text-zinc-100 tabular-nums">
                  {formattedLastUpdated}
                </strong>
              </span>
              {formattedResearchDate && (
                <span>
                  {t.savedResearchDateLabel}:{' '}
                  <strong className="font-mono text-zinc-700 dark:text-zinc-300 tabular-nums">
                    {formattedResearchDate}
                  </strong>
                </span>
              )}
            </div>

            <div className="space-y-2">
              <h3 className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                {t.sec12ResearchSources}
              </h3>
              <ul className="space-y-2">
                {tiktokShopUrl &&
                  !product.sources.some(
                    (s) =>
                      s.url === tiktokShopUrl ||
                      isLegacyOrSluglessTikTokUrl(s.url) ||
                      (typeof s.url === 'string' && s.url.includes('shop.tiktok.com/th/pdp/'))
                  ) && (
                    <li className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 py-2 border-b border-zinc-100 dark:border-zinc-800/70 text-xs">
                      <div className="text-zinc-700 dark:text-zinc-300 min-w-0">
                        <span className="font-medium text-zinc-900 dark:text-zinc-100">
                          {isMy
                            ? `TikTok Shop Thailand မူရင်း Product စာမျက်နှာ (#${getCanonicalProductId(product)})`
                            : `TikTok Shop Thailand Original Product Page (#${getCanonicalProductId(product)})`}
                        </span>{' '}
                        <span className="text-zinc-400 dark:text-zinc-500">
                          · TikTok Shop TH
                        </span>
                      </div>
                      <a
                        href={tiktokShopUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400 hover:underline whitespace-nowrap shrink-0"
                      >
                        <span>
                          {isMy ? 'TikTok Shop ဖွင့်ရန်' : 'Open TikTok Shop'}
                        </span>
                        <ExternalLink className="w-3 h-3" aria-hidden="true" />
                      </a>
                    </li>
                  )}
                {product.sources.map((src, idx) => {
                  const resolvedSourceUrl =
                    tiktokShopUrl &&
                    typeof src.url === 'string' &&
                    (isLegacyOrSluglessTikTokUrl(src.url) ||
                      src.sourceType === 'TikTok Shop TH' ||
                      src.url.includes('shop.tiktok.com/th/pdp/'))
                      ? tiktokShopUrl
                      : src.url;
                  return (
                    <li
                      key={`${idx}-${resolvedSourceUrl ?? src.labelEn}`}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 py-2 border-b border-zinc-100 dark:border-zinc-800/70 last:border-b-0 text-xs"
                    >
                      <div className="text-zinc-700 dark:text-zinc-300 min-w-0">
                        <span className="font-medium text-zinc-900 dark:text-zinc-100">
                          {isMy ? src.labelMy : src.labelEn}
                        </span>{' '}
                        <span className="text-zinc-400 dark:text-zinc-500">· {src.sourceType}</span>
                      </div>

                      {src.verified && isSafeHttpUrl(resolvedSourceUrl) ? (
                        <a
                          href={resolvedSourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-medium text-zinc-900 dark:text-zinc-100 hover:underline whitespace-nowrap shrink-0"
                        >
                          <span>{t.sourceOpenLink}</span>
                          <ExternalLink className="w-3 h-3" aria-hidden="true" />
                        </a>
                      ) : (
                        <span className="text-zinc-400 dark:text-zinc-500 whitespace-nowrap shrink-0">
                          {t.sourcePendingLink}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-zinc-100 dark:border-zinc-800/70">
              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                    {t.sec13ConfidenceLevel}
                  </h3>
                  <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                    {t.confidenceLabels[evaluation.confidenceLevel]}
                  </span>
                </div>
                <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">{confidenceDetail}</p>
              </div>

              <div className="space-y-1.5">
                <h3 className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                  {t.sec14MissingData}
                </h3>
                <ul className="space-y-1.5 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed list-disc pl-4 marker:text-zinc-400">
                  {missingData.map((item, idx) => (
                    <li key={`${idx}-${item}`}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        </div>

        {/* Sticky Decision & Export Footer */}
        <div className="shrink-0 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 px-4 sm:px-7 py-3 flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyReport}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 sm:px-3.5 py-2 text-xs font-medium text-zinc-800 dark:text-zinc-200 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/80 transition-colors cursor-pointer whitespace-nowrap"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" aria-hidden="true" />
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
              className="inline-flex items-center justify-center gap-1 min-h-[40px] px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/80 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t.reportExportCsv}</span>
            </button>

            <button
              type="button"
              onClick={handleExportSingleJson}
              aria-label={t.exportJsonBtn}
              className="inline-flex items-center justify-center gap-1 min-h-[40px] px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/80 transition-colors cursor-pointer whitespace-nowrap shrink-0"
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
                  ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                  : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:border-red-300 dark:hover:border-red-700 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50/40 dark:hover:bg-red-950/40'
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
              className={`flex-1 inline-flex items-center justify-center gap-1.5 min-h-[42px] px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                isSaved
                  ? 'bg-emerald-700 dark:bg-emerald-600 text-white hover:bg-emerald-800 dark:hover:bg-emerald-500'
                  : 'bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-white'
              }`}
            >
              <Bookmark
                className={`w-4 h-4 shrink-0 ${isSaved ? 'fill-current' : ''}`}
                aria-hidden="true"
              />
              <span>{isSaved ? t.btnSavedProduct : t.btnSaveProduct}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
