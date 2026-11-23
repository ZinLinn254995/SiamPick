import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bookmark,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  ExternalLink,
  ImageOff,
  Layers,
  MoreHorizontal,
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
  ProductEnrichmentExecutionSummary,
  ResearchProduct,
  RiskSeverity,
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
import { SameProductHunterSection } from './SameProductHunterSection';
import { InfoPopover } from './InfoPopover';
import {
  ScoreRing,
  StatusDot,
  StatusLegendPopover,
  TrendDelta,
  VerdictBadge,
} from './visual';
import { getScrollBehavior, useDialogA11y } from '../hooks/useDialogA11y';

interface ResearchReportDrawerProps {
  product: ResearchProduct | null;
  evaluation?: OpportunityEvaluation | null;
  salesWeightPct?: number;
  peerProducts?: readonly ResearchProduct[];
  spendingLimitCredits?: number;
  serverBudgetCommittedCredits?: number | null;
  serverBudgetRemainingCredits?: number | null;
  budgetStorageAvailable?: boolean;
  onSpendingLimitChange?: (nextLimit: number) => void;
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
  savedProductIds?: ReadonlySet<string>;
  onSaveExternalProduct?: (candidateProduct: ResearchProduct) => void;
  onCreditsSpent?: () => void;
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

function dataStatusColorClass(status: DataStatus): string {
  if (status === 'verified') return 'text-emerald-700 dark:text-emerald-400';
  if (status === 'estimated') return 'text-amber-700 dark:text-amber-400';
  if (status === 'unverified') return 'text-zinc-600 dark:text-zinc-400';
  return 'text-zinc-500 dark:text-zinc-400';
}

export function ResearchReportDrawer({
  product,
  evaluation: providedEvaluation,
  salesWeightPct = 50,
  peerProducts,
  spendingLimitCredits = DEFAULT_SPENDING_LIMIT_CREDITS,
  serverBudgetCommittedCredits,
  serverBudgetRemainingCredits,
  budgetStorageAvailable = true,
  onSpendingLimitChange,
  researchDate,
  decision,
  onSave,
  onReject,
  onOpenDeepDive,
  onClose,
  onAiAnalysisSaved,
  onProductEnriched,
  savedProductIds,
  onSaveExternalProduct,
  onCreditsSpent,
  language,
}: ResearchReportDrawerProps) {
  const [copied, setCopied] = useState(false);
  const [copiedTikTokLink, setCopiedTikTokLink] = useState(false);
  const [activeAiAnalysis, setActiveAiAnalysis] = useState<AiProductAnalysis | null>(null);
  const [resolvedTikTokUrl, setResolvedTikTokUrl] = useState<string | null>(() =>
    getTikTokShopProductUrl(product)
  );
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [expandedChips, setExpandedChips] = useState<{
    strengths: boolean;
    weaknesses: boolean;
    risks: boolean;
  }>({ strengths: false, weaknesses: false, risks: false });
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);
  const [activeTabId, setActiveTabId] = useState<string>('rep-overview');
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const drawerPanelRef = useRef<HTMLDivElement | null>(null);

  useDialogA11y({
    isOpen: Boolean(product),
    containerRef: drawerPanelRef,
    onClose,
    closeOnEscape: false,
  });

  useEffect(() => {
    setCopied(false);
    setCopiedTikTokLink(false);
    setActiveAiAnalysis(null);
    setDetailsOpen(false);
    setExpandedChips({ strengths: false, weaknesses: false, risks: false });
    setActionsMenuOpen(false);
    setActiveTabId('rep-overview');
  }, [product?.id]);

  useEffect(() => {
    const activeButton = tabRefs.current[activeTabId];
    if (activeButton && typeof activeButton.scrollIntoView === 'function') {
      activeButton.scrollIntoView({
        behavior: getScrollBehavior(),
        inline: 'center',
        block: 'nearest',
      });
    }
  }, [activeTabId]);

  useEffect(() => {
    if (!actionsMenuOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(e.target as Node)) {
        setActionsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [actionsMenuOpen]);

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
      if (e.key === 'Escape') {
        if (actionsMenuOpen) {
          setActionsMenuOpen(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [product, onClose, actionsMenuOpen]);

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
          ? `${product.reviewCount.toLocaleString('en-US')} ${t.cardReviewsUnit}`
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
    setActiveTabId(sectionId);
    document
      .getElementById(sectionId)
      ?.scrollIntoView({ behavior: getScrollBehavior(), block: 'start' });
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
        ref={drawerPanelRef}
        tabIndex={-1}
        className="relative w-full max-w-3xl bg-white dark:bg-zinc-900 h-[100dvh] shadow-2xl flex flex-col focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky Top Header + Section Jump Navigation */}
        <div className="shrink-0 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
          <div className="px-4 sm:px-6 h-12 sm:h-13 flex items-center justify-between gap-2.5">
            <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 truncate">
              {t.reportTitle}
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {onOpenDeepDive && (
                <button
                  type="button"
                  onClick={() => onOpenDeepDive(product)}
                  className="sp-btn-secondary !min-h-[36px] !px-2.5 sm:!px-3 !py-1 text-xs whitespace-nowrap shrink-0"
                >
                  <Layers className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>Deep Dive</span>
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label={t.reportClose}
                className="w-9 h-9 rounded-lg inline-flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Quick-Jump Section Navigation with right-edge gradient fade, scroll-snap & active auto-scroll */}
          <div className="relative border-t border-zinc-100 dark:border-zinc-800/70">
            <nav
              aria-label="Report sections"
              className="no-scrollbar px-4 sm:px-6 pr-10 sm:pr-12 flex items-center gap-4 overflow-x-auto snap-x snap-mandatory scroll-pl-4 sm:scroll-pl-6 text-xs font-medium text-zinc-600 dark:text-zinc-400"
            >
              {(
                [
                  { id: 'rep-overview', label: t.reportJumpSummary },
                  { id: 'rep-decision', label: t.reportTabDecision },
                  { id: 'rep-market-data', label: t.reportTabMarketData },
                  { id: 'rep-enrichment', label: t.enrichJumpLabel },
                  { id: 'rep-same-product', label: isMy ? 'ဆိုင်တူ Link ရှာ' : 'Same Product' },
                  { id: 'rep-score', label: t.scoringJumpLabel },
                  { id: 'rep-ai-analysis', label: t.aiJumpLabel },
                  { id: 'rep-reviews', label: t.reportJumpReviews },
                  { id: 'rep-risks', label: t.reportJumpRisks },
                  { id: 'rep-video', label: t.reportJumpVideo },
                  { id: 'rep-sources', label: t.reportJumpSources },
                ] as const
              ).map((item) => {
                const isActive = activeTabId === item.id;
                return (
                  <button
                    key={item.id}
                    ref={(el) => {
                      tabRefs.current[item.id] = el;
                    }}
                    type="button"
                    onClick={() => jumpToSection(item.id)}
                    aria-current={isActive ? 'location' : undefined}
                    className={`snap-start inline-flex items-center min-h-[38px] py-1.5 border-b-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      isActive
                        ? 'text-zinc-950 dark:text-zinc-50 border-zinc-950 dark:border-zinc-100 font-semibold'
                        : 'border-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </nav>
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-white dark:from-zinc-900 to-transparent"
            />
          </div>
        </div>

        {/* Scrollable Dossier */}
        <div
          ref={scrollContainerRef}
          onScroll={() => {
            const container = scrollContainerRef.current;
            if (!container) return;
            const sectionIds = [
              'rep-overview',
              'rep-decision',
              'rep-market-data',
              'rep-enrichment',
              'rep-same-product',
              'rep-score',
              'rep-ai-analysis',
              'rep-reviews',
              'rep-risks',
              'rep-video',
              'rep-sources',
            ];
            const containerTop = container.getBoundingClientRect().top;
            let currentId = sectionIds[0];
            for (const secId of sectionIds) {
              const el = document.getElementById(secId);
              if (!el) continue;
              const offset = el.getBoundingClientRect().top - containerTop;
              if (offset <= 88) {
                currentId = secId;
              }
            }
            setActiveTabId((prev) => (prev === currentId ? prev : currentId));
          }}
          className="flex-1 overflow-y-auto px-4 sm:px-6 pt-4 sm:pt-6 pb-[calc(5.25rem+env(safe-area-inset-bottom))] space-y-6 sm:space-y-8"
        >
          {/* 1. Product Dossier Summary Header (3-second scan) */}
          {(() => {
            const hasRevenueGrowth =
              typeof km?.revenueGrowthRate === 'number' &&
              Number.isFinite(km.revenueGrowthRate);
            const rawDateRange = km?.dateRange?.trim() || null;
            const trendPeriodLabel =
              rawDateRange === 'last7Day'
                ? t.periodLast7Day
                : rawDateRange === 'last30Day'
                  ? t.periodLast30Day
                  : rawDateRange;

            const sortedCriteria = [...evaluation.criteria].sort((a, b) => {
              const weightDiff = b.effectiveWeight - a.effectiveWeight;
              if (weightDiff !== 0) return weightDiff;
              return b.baseWeight - a.baseWeight;
            });

            const strengthsList = isMy ? evaluation.strengthsMy : evaluation.strengthsEn;
            const weaknessesList = isMy ? evaluation.weaknessesMy : evaluation.weaknessesEn;
            const risksList = isMy ? evaluation.risksMy : evaluation.risksEn;
            const decisionCautions = isMy
              ? decisionSummary.cautionsMy
              : decisionSummary.cautionsEn;
            const decisionReason = isMy
              ? decisionSummary.reasonMy
              : decisionSummary.reasonEn;

            const confidenceToneClass =
              evaluation.confidencePct >= 75
                ? 'text-emerald-700 dark:text-emerald-400'
                : evaluation.confidencePct >= 50
                  ? 'text-amber-700 dark:text-amber-400'
                  : 'text-zinc-600 dark:text-zinc-400';

            const hasSalesVolume =
              typeof km?.salesVolume === 'number' && Number.isFinite(km.salesVolume);
            const hasRevenue =
              typeof km?.revenueThb === 'number' && Number.isFinite(km.revenueThb);
            const salesDisplay = hasSalesVolume
              ? `${km!.salesVolume!.toLocaleString('en-US')} ${t.bestSoldUnit}`
              : hasRevenue
                ? formatThb(km!.revenueThb!)
                : null;
            const salesSubDisplay =
              hasSalesVolume && hasRevenue ? formatThb(km!.revenueThb!) : null;
            const salesStatusForDot: DataStatus =
              hasSalesVolume || hasRevenue ? 'verified' : 'unavailable';

            const hasCreators =
              !competitionUnavailable &&
              typeof km?.creatorNumber === 'number' &&
              Number.isFinite(km.creatorNumber);
            const competitionStatusForDot: DataStatus = competitionUnavailable
              ? 'unavailable'
              : (competitionFactor?.verification ?? 'estimated');

            const noteGroups = [
              {
                key: 'strengths' as const,
                heading: t.scoringStrengthsHeading,
                items: strengthsList,
                headingClass: 'text-emerald-800 dark:text-emerald-300',
                markerClass: 'marker:text-emerald-600 dark:marker:text-emerald-400',
                btnClass: 'text-emerald-700 dark:text-emerald-400 hover:underline',
              },
              {
                key: 'weaknesses' as const,
                heading: t.scoringWeaknessesHeading,
                items: weaknessesList,
                headingClass: 'text-amber-800 dark:text-amber-300',
                markerClass: 'marker:text-amber-600 dark:marker:text-amber-400',
                btnClass: 'text-amber-700 dark:text-amber-400 hover:underline',
              },
              {
                key: 'risks' as const,
                heading: t.scoringRisksHeading,
                items: risksList,
                headingClass: 'text-red-800 dark:text-red-300',
                markerClass: 'marker:text-red-600 dark:marker:text-red-400',
                btnClass: 'text-red-700 dark:text-red-400 hover:underline',
              },
            ].filter((group) => group.items.length > 0);

            return (
              <div id="rep-overview" className="scroll-mt-4 space-y-4 sm:space-y-5">
                {/* A. Clean Hero Header (Unboxed ScoreRing + Spacious Title + Unboxed Verdict/Confidence Row) */}
                <div className="space-y-3">
                  <div className="flex items-start gap-3 sm:gap-4">
                    <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-800 shrink-0 border border-zinc-200/80 dark:border-zinc-800">
                      {imageConfig.canRender && imageConfig.src ? (
                        <>
                          <ProductImage
                            src={imageConfig.src}
                            fallbackSrc={imageConfig.fallbackSrc}
                            productId={imageConfig.productId}
                            alt={product.name}
                            title={displayName}
                            unavailableLabel={t.cardImageUnverified}
                            compact
                          />
                          {imageSourceNote && (
                            <div className="absolute bottom-1 right-1">
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
                        <div className="w-full h-full flex items-center justify-center p-1.5 text-center">
                          <ImageOff
                            className="w-5 h-5 text-zinc-400 dark:text-zinc-500"
                            aria-hidden="true"
                          />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                        {categoryLabel}
                        {subCategory ? ` · ${subCategory}` : ''}
                      </div>

                      <h2
                        id="research-report-title"
                        className="font-display text-sm sm:text-lg font-bold text-zinc-950 dark:text-zinc-50 leading-snug line-clamp-3 sm:line-clamp-2"
                      >
                        {displayName}
                      </h2>

                      {(product.shopName || formattedResearchDate) && (
                        <div className="flex flex-wrap items-center gap-x-2 text-xs text-zinc-500 dark:text-zinc-400">
                          {product.shopName && (
                            <span className="truncate max-w-[200px] sm:max-w-[280px]">
                              {product.shopName}
                            </span>
                          )}
                          {product.shopName && formattedResearchDate && (
                            <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-700">
                              ·
                            </span>
                          )}
                          {formattedResearchDate && (
                            <span className="font-mono tabular-nums">{formattedResearchDate}</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Clean Unboxed ScoreRing */}
                    <div className="shrink-0 flex flex-col items-center">
                      <div className="sm:hidden">
                        <ScoreRing value={evaluation.totalScore} size={52} />
                      </div>
                      <div className="hidden sm:block">
                        <ScoreRing
                          value={evaluation.totalScore}
                          size={72}
                          label={t.cardOpportunityScore}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Single Unboxed Verdict + Confidence + Status Legend Row */}
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                    <VerdictBadge
                      verdict={decisionSummary.verdict}
                      size="sm"
                      language={language}
                    />
                    <span className="inline-flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400">
                      <span>{t.cardConfidence}</span>
                      <strong className={`font-mono font-bold tabular-nums ${confidenceToneClass}`}>
                        {evaluation.confidencePct}%
                      </strong>
                      <span>· {t.confidenceLabels[evaluation.confidenceLevel]}</span>
                    </span>
                    <StatusLegendPopover language={language} className="-ml-1" />
                  </div>

                  {/* Subtle Secondary TikTok Shop Link + Copy Row (doesn't clash with sticky Save CTA) */}
                  {tiktokShopUrl && (
                    <div className="flex items-center gap-2">
                      <a
                        href={tiktokShopUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="sp-btn-secondary flex-1 sm:flex-initial !px-3.5 text-xs whitespace-nowrap"
                      >
                        <span className="truncate">{t.drawerOpenTikTokShop}</span>
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
                        title={t.drawerTikTokLinkAria}
                        aria-label={t.drawerTikTokLinkAria}
                        className="sp-btn-secondary !px-3 text-xs whitespace-nowrap shrink-0"
                      >
                        {copiedTikTokLink ? (
                          <Check
                            className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0"
                            aria-hidden="true"
                          />
                        ) : (
                          <Copy className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        )}
                        <span>
                          {copiedTikTokLink ? t.drawerCopiedLink : t.drawerCopyTikTokLink}
                        </span>
                      </button>
                    </div>
                  )}
                </div>

                {/* B. Clean Single-Elevation Hairline 4-KPI Block
                       Consistent top-label / bottom-value anatomy across mobile & desktop so long
                       Burmese labels and multi-part values + trend chips never collide or clip */}
                <div className="rounded-xl overflow-hidden border border-zinc-200/80 dark:border-zinc-800 bg-zinc-200/70 dark:bg-zinc-800 grid grid-cols-1 sm:grid-cols-2 gap-px">
                  {/* 1. Price */}
                  <div className="bg-zinc-50/90 dark:bg-zinc-900/75 px-3.5 py-2.5 sm:p-3.5 flex flex-col items-stretch gap-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                        {t.cardPrice}
                      </span>
                      <StatusDot
                        status={effectivePriceStatus}
                        language={language}
                        size="sm"
                      />
                    </div>
                    <div className="text-left min-w-0">
                      {product.priceThb !== null && product.priceThb > 0 ? (
                        <span className="font-mono text-base sm:text-lg font-bold tabular-nums text-zinc-950 dark:text-zinc-50">
                          {formatThb(product.priceThb)}
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                          {t.drawerNoData}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 2. Commission */}
                  <div className="bg-zinc-50/90 dark:bg-zinc-900/75 px-3.5 py-2.5 sm:p-3.5 flex flex-col items-stretch gap-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                        {t.cardCommission}
                      </span>
                      <StatusDot
                        status={effectiveCommissionStatus}
                        language={language}
                        size="sm"
                      />
                    </div>
                    <div className="flex items-baseline justify-start gap-x-2 gap-y-0.5 flex-wrap min-w-0">
                      {hasVerifiedCommission && product.commissionRate !== null ? (
                        <>
                          <span className="font-mono text-base sm:text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                            {product.commissionRate}%
                          </span>
                          {earningPerOrderThb !== null && (
                            <span className="font-mono text-xs text-zinc-600 dark:text-zinc-400 tabular-nums">
                              · {formatThb(earningPerOrderThb)} {t.drawerPerSaleUnit}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                          {t.drawerNoData}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 3. Sales & Revenue + Growth Trend */}
                  <div className="bg-zinc-50/90 dark:bg-zinc-900/75 px-3.5 py-2.5 sm:p-3.5 flex flex-col items-stretch gap-1.5 min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                          {t.bestStatSales}
                        </span>
                        <StatusDot
                          status={salesStatusForDot}
                          language={language}
                          size="sm"
                        />
                      </div>
                      {hasRevenueGrowth && (
                        <div className="max-w-full">
                          <TrendDelta
                            pct={km?.revenueGrowthRate}
                            period={trendPeriodLabel}
                          />
                        </div>
                      )}
                    </div>
                    <div className="flex items-baseline justify-start gap-x-2 gap-y-0.5 flex-wrap min-w-0">
                      {salesDisplay ? (
                        <>
                          <span className="font-mono text-base sm:text-lg font-bold tabular-nums text-zinc-950 dark:text-zinc-50">
                            {salesDisplay}
                          </span>
                          {salesSubDisplay && (
                            <span className="font-mono text-xs text-zinc-600 dark:text-zinc-400 tabular-nums">
                              · {salesSubDisplay}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                          {t.drawerNoData}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 4. Competition */}
                  <div className="bg-zinc-50/90 dark:bg-zinc-900/75 px-3.5 py-2.5 sm:p-3.5 flex flex-col items-stretch gap-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                        {t.bestStatCompetition}
                      </span>
                      <StatusDot
                        status={competitionStatusForDot}
                        language={language}
                        size="sm"
                      />
                    </div>
                    <div className="flex items-baseline justify-start gap-x-1.5 gap-y-0.5 flex-wrap min-w-0">
                      {competitionUnavailable ? (
                        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                          {t.drawerNoData}
                        </span>
                      ) : hasCreators ? (
                        <>
                          <span
                            className={`font-mono text-base sm:text-lg font-bold tabular-nums ${
                              product.competitionLevel === 'Low'
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : product.competitionLevel === 'High'
                                  ? 'text-red-700 dark:text-red-400'
                                  : 'text-amber-700 dark:text-amber-400'
                            }`}
                          >
                            {km!.creatorNumber!.toLocaleString('en-US')} {t.bestCreatorsUnit}
                          </span>
                          <span className="text-xs text-zinc-600 dark:text-zinc-400">
                            · {t.competitionLabels[product.competitionLevel]}
                          </span>
                        </>
                      ) : (
                        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                          {t.competitionLabels[product.competitionLevel]}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* C. Why this score (Clean 2-tier full-width bars so Burmese factor labels never squeeze) */}
                <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-800/35 p-3.5 sm:p-4 space-y-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                      {t.drawerWhyScoreHeading}
                    </h3>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {strategyFocusLabel}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2.5">
                    {sortedCriteria.map((item) => {
                      const scoreVal = item.wasRedistributed ? null : item.normalizedScore;
                      const isAvailable = typeof scoreVal === 'number' && Number.isFinite(scoreVal);
                      const clamped = isAvailable ? Math.max(0, Math.min(100, scoreVal!)) : 0;
                      const weightPct = Math.round(
                        item.wasRedistributed ? item.baseWeight : item.effectiveWeight
                      );
                      const barFillClass = !isAvailable
                        ? 'bg-zinc-400 dark:bg-zinc-500'
                        : clamped >= 70
                          ? 'bg-emerald-600 dark:bg-emerald-400'
                          : clamped >= 40
                            ? 'bg-amber-600 dark:bg-amber-400'
                            : 'bg-red-600 dark:bg-red-400';
                      const scoreTextClass = !isAvailable
                        ? 'text-zinc-500 dark:text-zinc-400'
                        : clamped >= 70
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : clamped >= 40
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-red-700 dark:text-red-400';

                      return (
                        <div key={item.key} className="space-y-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <StatusDot
                                status={item.verification}
                                language={language}
                                size="sm"
                              />
                              <span className="font-medium text-zinc-800 dark:text-zinc-200 truncate">
                                {t.factorShortLabels[item.key]}
                              </span>
                              <span className="font-mono text-zinc-500 dark:text-zinc-400 tabular-nums shrink-0">
                                {weightPct}%
                              </span>
                            </div>
                            <span
                              className={`font-mono font-semibold tabular-nums shrink-0 ${scoreTextClass}`}
                            >
                              {isAvailable ? Math.round(clamped) : '—'}
                            </span>
                          </div>
                          <div
                            role="progressbar"
                            aria-label={t.factorShortLabels[item.key]}
                            aria-valuenow={isAvailable ? Math.round(clamped) : 0}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            className="w-full h-1.5 rounded-full bg-zinc-200/80 dark:bg-zinc-800 overflow-hidden"
                          >
                            <div
                              className={`h-full rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none ${barFillClass}`}
                              style={{ width: `${clamped}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* D. Strengths / Weaknesses / Risks (Clean unboxed bullet points — zero chunky pill clutter) */}
                {noteGroups.length > 0 && (
                  <div className="divide-y divide-zinc-100 dark:divide-zinc-800/80 border-y border-zinc-200/70 dark:border-zinc-800">
                    {noteGroups.map((group) => {
                      const isExpanded = expandedChips[group.key];
                      const visibleItems = isExpanded
                        ? group.items
                        : group.items.slice(0, 3);
                      const hiddenCount = group.items.length - 3;

                      return (
                        <div key={group.key} className="py-3 space-y-1.5">
                          <div className="flex items-baseline justify-between gap-2">
                            <h4 className={`text-xs font-semibold ${group.headingClass}`}>
                              {group.heading}
                            </h4>
                            <span className="font-mono text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                              {group.items.length}
                            </span>
                          </div>

                          <ul
                            className={`space-y-1 text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed list-disc pl-4 ${group.markerClass}`}
                          >
                            {visibleItems.map((line, idx) => (
                              <li key={`${group.key}-${idx}-${line}`}>{line}</li>
                            ))}
                          </ul>

                          {hiddenCount > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedChips((prev) => ({
                                  ...prev,
                                  [group.key]: !prev[group.key],
                                }))
                              }
                              className={`inline-flex items-center min-h-[34px] text-xs font-semibold cursor-pointer ${group.btnClass}`}
                            >
                              {isExpanded
                                ? t.drawerShowLess
                                : `+${hiddenCount} ${t.drawerMoreUnit}`}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* E. Collapsed "Details" Accordion (AI decision reason & cautions, closed by default) */}
                <section
                  id="rep-decision"
                  className="scroll-mt-4 sp-surface-muted overflow-hidden"
                >
                  <button
                    type="button"
                    aria-expanded={detailsOpen}
                    aria-controls="rep-decision-details"
                    onClick={() => setDetailsOpen((prev) => !prev)}
                    className="w-full min-h-[44px] px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-zinc-100/80 dark:hover:bg-zinc-800/70 transition-colors cursor-pointer"
                  >
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 min-w-0">
                      <span className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                        {t.drawerDetailsAccordion}
                      </span>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {t.decisionSummaryHeading}
                      </span>
                    </div>
                    {detailsOpen ? (
                      <ChevronUp
                        className="w-4 h-4 text-zinc-500 dark:text-zinc-400 shrink-0"
                        aria-hidden="true"
                      />
                    ) : (
                      <ChevronDown
                        className="w-4 h-4 text-zinc-500 dark:text-zinc-400 shrink-0"
                        aria-hidden="true"
                      />
                    )}
                  </button>

                  {detailsOpen && (
                    <div
                      id="rep-decision-details"
                      className="px-4 pb-4 pt-3 border-t border-zinc-200/80 dark:border-zinc-800 space-y-3 text-[13px]"
                    >
                      <p className="text-zinc-800 dark:text-zinc-200 leading-relaxed font-medium">
                        {decisionReason}
                      </p>

                      {decisionCautions.length > 0 && (
                        <div className="pt-2.5 border-t border-zinc-200/70 dark:border-zinc-800/70 space-y-1.5">
                          <div className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                            {t.decisionCautionsLabel}
                          </div>
                          <ul className="space-y-1.5 text-zinc-600 dark:text-zinc-400 leading-relaxed list-disc pl-4 marker:text-amber-600">
                            {decisionCautions.map((caution, idx) => (
                              <li key={`${idx}-${caution}`}>{caution}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </section>
              </div>
            );
          })()}

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

                <div className="sp-surface-muted p-3.5 sm:p-4 space-y-3 text-xs">
                  {/* Confirmed Myanmar Promotional Videos (Video-First Discovery) */}
                  {isVideoBacked && (
                    <div className="space-y-1.5">
                      <div className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                        {t.myanmarVideoEvidenceHeading}
                      </div>
                      <ul className="space-y-2">
                        {matchedVideos.map((vid, idx) => (
                          <li
                            key={`my-video-${vid.videoId}-${idx}`}
                            className="p-2.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 space-y-1"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
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
                                  className="inline-flex items-center gap-1 text-xs font-medium text-zinc-900 dark:text-zinc-100 hover:underline"
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
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs text-zinc-700 dark:text-zinc-300 tabular-nums">
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
                      <div className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                        {t.myanmarEvidenceHeading}
                      </div>
                      <ul className="space-y-2">
                        {myanmarInfo.matchedReviews.map((rv, idx) => (
                          <li
                            key={`my-review-${idx}`}
                            className="p-2.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 space-y-1"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
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
                    <div className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
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
                              : 'text-zinc-500 dark:text-zinc-400';
                        return (
                          <div
                            key={srcKey}
                            className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800/70"
                          >
                            <span className="text-zinc-700 dark:text-zinc-300 truncate">
                              {t.myanmarSourceLabels[srcKey]}
                            </span>
                            <span className={`font-mono text-xs font-medium shrink-0 ${statusColor}`}>
                              {t.myanmarAvailabilityLabels[st.availability]}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Strict Thailand-Only Market Disclaimer */}
                  <p className="pt-2 border-t border-zinc-200/70 dark:border-zinc-800/70 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
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
              <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
                {km?.dateRange ?? t.dataStatusLabels.unavailable}
              </span>
            </div>

            <dl className="rounded-xl overflow-hidden border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-800/35 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 p-3.5 sm:p-4 text-xs">
              <div>
                <dt className="text-xs text-zinc-500 dark:text-zinc-400">{isMy ? 'ရောင်းအား' : 'Sales Volume'}</dt>
                <dd className="mt-0.5 tabular-nums">
                  {typeof km?.salesVolume === 'number' ? (
                    <span className="font-mono font-semibold text-zinc-950 dark:text-zinc-50">
                      {km.salesVolume.toLocaleString('en-US')}
                    </span>
                  ) : (
                    <span className="text-zinc-500 dark:text-zinc-400">{t.dataStatusLabels.unavailable}</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500 dark:text-zinc-400">
                  {isMy ? 'ဝင်ငွေ (GMV)' : 'Revenue (THB)'}
                </dt>
                <dd className="mt-0.5 tabular-nums">
                  {typeof km?.revenueThb === 'number' ? (
                    <span className="font-mono font-semibold text-zinc-950 dark:text-zinc-50">
                      {formatThb(km.revenueThb)}
                    </span>
                  ) : (
                    <span className="text-zinc-500 dark:text-zinc-400">{t.dataStatusLabels.unavailable}</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500 dark:text-zinc-400">
                  {isMy ? 'ဝင်ငွေတိုးတက်နှုန်း' : 'Revenue Growth'}
                </dt>
                <dd className="mt-0.5 tabular-nums">
                  {typeof km?.revenueGrowthRate === 'number' ? (
                    <span className="font-mono font-semibold text-zinc-950 dark:text-zinc-50">
                      {`${km.revenueGrowthRate >= 0 ? '+' : ''}${km.revenueGrowthRate.toFixed(1)}%`}
                    </span>
                  ) : (
                    <span className="text-zinc-500 dark:text-zinc-400">{t.dataStatusLabels.unavailable}</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500 dark:text-zinc-400">
                  {isMy ? 'Creator အရေအတွက်' : 'Creator Count'}
                </dt>
                <dd className="mt-0.5 tabular-nums">
                  {typeof km?.creatorNumber === 'number' ? (
                    <span className="font-mono font-semibold text-zinc-950 dark:text-zinc-50">
                      {km.creatorNumber.toLocaleString('en-US')}
                    </span>
                  ) : (
                    <span className="text-zinc-500 dark:text-zinc-400">{t.dataStatusLabels.unavailable}</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500 dark:text-zinc-400">{t.cardCommission}</dt>
                <dd className="mt-0.5 tabular-nums">
                  {hasVerifiedCommission && product.commissionRate !== null ? (
                    <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                      {`${product.commissionRate}%`}
                    </span>
                  ) : (
                    <span className="text-zinc-500 dark:text-zinc-400">{t.dataStatusLabels.unavailable}</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500 dark:text-zinc-400">
                  {isMy ? 'Video ဝင်ငွေ' : 'Video Revenue'}
                </dt>
                <dd className="mt-0.5 tabular-nums">
                  {typeof km?.videoRevenueThb === 'number' ? (
                    <span className="font-mono font-semibold text-zinc-950 dark:text-zinc-50">
                      {formatThb(km.videoRevenueThb)}
                    </span>
                  ) : (
                    <span className="text-zinc-500 dark:text-zinc-400">{t.dataStatusLabels.unavailable}</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500 dark:text-zinc-400">
                  {isMy ? 'Live ဝင်ငွေ' : 'Live Revenue'}
                </dt>
                <dd className="mt-0.5 tabular-nums">
                  {typeof km?.liveRevenueThb === 'number' ? (
                    <span className="font-mono font-semibold text-zinc-950 dark:text-zinc-50">
                      {formatThb(km.liveRevenueThb)}
                    </span>
                  ) : (
                    <span className="text-zinc-500 dark:text-zinc-400">{t.dataStatusLabels.unavailable}</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500 dark:text-zinc-400">{isMy ? 'ဆိုင် GMV' : 'Shop GMV'}</dt>
                <dd className="mt-0.5 tabular-nums">
                  {typeof km?.shopRevenueThb === 'number' ? (
                    <span className="font-mono font-semibold text-zinc-950 dark:text-zinc-50">
                      {formatThb(km.shopRevenueThb)}
                    </span>
                  ) : (
                    <span className="text-zinc-500 dark:text-zinc-400">{t.dataStatusLabels.unavailable}</span>
                  )}
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
            serverBudgetCommittedCredits={serverBudgetCommittedCredits}
            serverBudgetRemainingCredits={serverBudgetRemainingCredits}
            budgetStorageAvailable={budgetStorageAvailable}
            onSpendingLimitChange={onSpendingLimitChange}
            onBudgetRefresh={onCreditsSpent}
            language={language}
            onProductEnriched={onProductEnriched}
          />

          {/* 5b. Exact Same Product · Early-Mover Shop Links */}
          <SameProductHunterSection
            product={product}
            spendingLimitCredits={spendingLimitCredits}
            serverBudgetCommittedCredits={serverBudgetCommittedCredits}
            serverBudgetRemainingCredits={serverBudgetRemainingCredits}
            budgetStorageAvailable={budgetStorageAvailable}
            onSpendingLimitChange={onSpendingLimitChange}
            salesWeightPct={salesWeightPct}
            language={language}
            savedProductIds={savedProductIds}
            onSaveCandidate={onSaveExternalProduct}
            onOpenDeepDive={onOpenDeepDive}
            onCreditsSpent={onCreditsSpent}
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
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs">
                      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-medium text-zinc-900 dark:text-zinc-100 min-w-0">
                        <span className="font-mono text-zinc-500 dark:text-zinc-400 tabular-nums shrink-0">
                          0{idx + 1}.
                        </span>
                        <span>{t.factorLabels[item.key]}</span>
                        {metricDisplay && (
                          <span className="font-mono text-xs font-normal text-zinc-500 dark:text-zinc-400 tabular-nums">
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
                              <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
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
                          <span className="font-mono text-xs text-amber-700 dark:text-amber-400 tabular-nums">
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
              <div className="sp-surface-muted p-3.5 sm:p-4 space-y-2">
                <h4 className="font-display text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                  {t.scoringStrengthsHeading}
                </h4>
                <ul className="space-y-1.5 text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed list-disc pl-4 marker:text-emerald-600">
                  {(isMy ? evaluation.strengthsMy : evaluation.strengthsEn).map((line, i) => (
                    <li key={`${i}-${line}`}>{line}</li>
                  ))}
                </ul>
              </div>

              <div className="sp-surface-muted p-3.5 sm:p-4 space-y-2">
                <h4 className="font-display text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                  {t.scoringWeaknessesHeading}
                </h4>
                <ul className="space-y-1.5 text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed list-disc pl-4 marker:text-zinc-400">
                  {(isMy ? evaluation.weaknessesMy : evaluation.weaknessesEn).map((line, i) => (
                    <li key={`${i}-${line}`}>{line}</li>
                  ))}
                </ul>
              </div>

              <div className="sp-surface-muted p-3.5 sm:p-4 space-y-2">
                <h4 className="font-display text-xs font-semibold text-amber-800 dark:text-amber-300">
                  {t.scoringRisksHeading}
                </h4>
                <ul className="space-y-1.5 text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed list-disc pl-4 marker:text-amber-600">
                  {(isMy ? evaluation.risksMy : evaluation.risksEn).map((line, i) => (
                    <li key={`${i}-${line}`}>{line}</li>
                  ))}
                </ul>
              </div>

              <div className="sp-surface-muted p-3.5 sm:p-4 space-y-2">
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
            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{t.reportAiTag}</div>
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
            <div className="sp-surface-muted p-3.5 sm:p-4 flex flex-wrap items-baseline gap-6 sm:gap-8">
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
              <div className="sp-surface-muted p-3.5 space-y-2 text-xs">
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
                        ({product.reviewCount.toLocaleString('en-US')} {t.cardReviewsUnit})
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
              <div className="sp-surface-muted p-3.5 sm:p-4 space-y-3.5">
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
              <div className="sp-surface-muted p-3.5 sm:p-4 space-y-3.5">
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
                    <span className="font-mono text-xs font-medium text-zinc-500 dark:text-zinc-400 pt-0.5 tabular-nums shrink-0">
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
                        <span className="text-zinc-500 dark:text-zinc-400">
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
                        <span className="text-zinc-500 dark:text-zinc-400">· {src.sourceType}</span>
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
                        <span className="text-zinc-500 dark:text-zinc-400 whitespace-nowrap shrink-0">
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

        {/* F. Compact Single-Row Sticky Decision & Export Footer */}
        <div className="sticky bottom-0 shrink-0 z-10 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border-t border-zinc-200 dark:border-zinc-800 px-4 sm:px-6 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] flex items-center gap-2">
          {/* "..." Overflow menu for Copy / CSV / JSON */}
          <div ref={actionsMenuRef} className="relative shrink-0">
            <button
              type="button"
              aria-label={t.drawerMoreActions}
              aria-haspopup="menu"
              aria-expanded={actionsMenuOpen}
              onClick={() => setActionsMenuOpen((prev) => !prev)}
              className="w-10 h-10 sm:w-11 sm:h-11 inline-flex items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <MoreHorizontal className="w-5 h-5" aria-hidden="true" />
            </button>

            {actionsMenuOpen && (
              <div
                role="menu"
                aria-label={t.drawerMoreActions}
                className="absolute bottom-full mb-2 left-0 z-20 min-w-[196px] py-1.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 shadow-xl"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    handleCopyReport();
                    setActionsMenuOpen(false);
                  }}
                  className="w-full min-h-[40px] px-3.5 py-2 flex items-center gap-2.5 text-left text-xs font-medium text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check
                        className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0"
                        aria-hidden="true"
                      />
                      <span>{t.reportCopied}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-zinc-500 dark:text-zinc-400 shrink-0" aria-hidden="true" />
                      <span>{t.reportCopy}</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    handleExportSingleCsv();
                    setActionsMenuOpen(false);
                  }}
                  className="w-full min-h-[40px] px-3.5 py-2 flex items-center gap-2.5 text-left text-xs font-medium text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4 text-zinc-500 dark:text-zinc-400 shrink-0" aria-hidden="true" />
                  <span>{t.exportCsvBtn}</span>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    handleExportSingleJson();
                    setActionsMenuOpen(false);
                  }}
                  className="w-full min-h-[40px] px-3.5 py-2 flex items-center gap-2.5 text-left text-xs font-medium text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4 text-zinc-500 dark:text-zinc-400 shrink-0" aria-hidden="true" />
                  <span>{t.exportJsonBtn}</span>
                </button>
              </div>
            )}
          </div>

          {/* Reject = Compact Secondary */}
          <button
            type="button"
            onClick={() => onReject(product.id)}
            className={`inline-flex items-center justify-center gap-1.5 min-h-[40px] sm:min-h-[44px] px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              isRejected
                ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:border-red-300 dark:hover:border-red-700 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50/40 dark:hover:bg-red-950/40'
            }`}
          >
            {isRejected ? (
              <>
                <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" aria-hidden="true" />
                <span>{t.btnRestoreProduct}</span>
              </>
            ) : (
              <>
                <X className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" aria-hidden="true" />
                <span>{t.btnRejectProduct}</span>
              </>
            )}
          </button>

          {/* Save = Primary flex-1 */}
          <button
            type="button"
            onClick={() => onSave(product.id)}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 sm:gap-2 min-h-[40px] sm:min-h-[44px] px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
              isSaved
                ? 'bg-emerald-700 dark:bg-emerald-700 text-white hover:bg-emerald-800 dark:hover:bg-emerald-600'
                : 'bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-white'
            }`}
          >
            <Bookmark
              className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${isSaved ? 'fill-current' : ''}`}
              aria-hidden="true"
            />
            <span>{isSaved ? t.btnSavedProduct : t.btnSaveProduct}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
