import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bookmark,
  Check,
  ChevronDown,
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
import { AnimatePresence, motion } from 'motion/react';
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
import { getCachedAiAnalysisForProduct } from '../utils/aiAnalysisCache';
import { getCachedEnrichmentForProduct } from '../utils/enrichmentCache';
import { getProductEnrichmentCoverage } from '../utils/enrichmentPlanner';
import {
  buildCompleteTextReport,
  buildProductsExportCsv,
  buildProductsExportJson,
  triggerFileDownload,
} from '../utils/exportReports';
import { formatResearchDate, formatResearchDateTime } from '../utils/savedProductsStorage';
import { getCategoryLabel } from '../utils/categoryRegistry';
import { detectMyanmarLanguageForProduct } from '../utils/myanmarLanguageDetector';
import {
  MOTION_TRANSITIONS,
  MOTION_VARIANTS,
  TACTILE_INTERACTIONS,
} from '../utils/motionPresets';
import { TRANSLATIONS } from '../i18n/translations';
import { ProductImage } from './ProductImage';
import { AiProductAnalysisSection } from './AiProductAnalysisSection';
import { DataEnrichmentSection } from './DataEnrichmentSection';
import {
  getCachedSameProductSearchResult,
  SameProductHunterSection,
} from './SameProductHunterSection';
import { TechnicalSignalStrip } from './TechnicalSignalStrip';
import { InfoPopover } from './InfoPopover';
import {
  AnimatedNumber,
  ScoreRing,
  StatusDot,
  StatusLegendPopover,
  TrendDelta,
  VerdictBadge,
} from './visual';
import { getScrollBehavior, useDialogA11y } from '../hooks/useDialogA11y';

type DrawerTabId = 'overview' | 'same-product' | 'ai' | 'enrichment';

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
  if (level === 'Low') return 'text-emerald-700 dark:text-[#10F5A0]';
  if (level === 'Watch') return 'text-amber-700 dark:text-amber-300';
  return 'text-rose-700 dark:text-[#FE2C55]';
}

function verificationColorClass(status: VerificationState): string {
  if (status === 'Verified') return 'text-emerald-700 dark:text-[#10F5A0]';
  if (status === 'Needs Check') return 'text-amber-700 dark:text-amber-300';
  return 'text-rose-700 dark:text-[#FE2C55]';
}

function dataStatusColorClass(status: DataStatus): string {
  if (status === 'verified') return 'text-emerald-700 dark:text-[#10F5A0]';
  if (status === 'estimated') return 'text-amber-700 dark:text-amber-300';
  if (status === 'unverified') return 'text-zinc-600 dark:text-zinc-400';
  return 'text-zinc-500 dark:text-zinc-400';
}

function computeEnrichmentLayerCount(product: ResearchProduct): number {
  const coverage = getProductEnrichmentCoverage(product);
  const cached = getCachedEnrichmentForProduct(product);
  let count = 0;

  if (coverage.hasProductDetail || Boolean(cached.productDetail)) count += 1;
  if (coverage.hasShopDetail || Boolean(cached.shopDetail)) count += 1;
  if (coverage.hasReviewInsights || Boolean(cached.reviewInsight)) count += 1;

  return count;
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
  const [activeTab, setActiveTab] = useState<DrawerTabId>('overview');
  const [sameProductExactCount, setSameProductExactCount] = useState<number>(0);
  const [enrichmentRevision, setEnrichmentRevision] = useState<number>(0);
  const [isDesktopSm, setIsDesktopSm] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
    return window.matchMedia('(min-width: 640px)').matches;
  });

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
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(min-width: 640px)');
    const handleChange = (e: MediaQueryListEvent) => setIsDesktopSm(e.matches);
    setIsDesktopSm(mq.matches);
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', handleChange);
      return () => mq.removeEventListener('change', handleChange);
    }
    mq.addListener(handleChange);
    return () => mq.removeListener(handleChange);
  }, []);

  // Reset per-product state + hydrate read-only caches (ZERO API calls)
  useEffect(() => {
    setCopied(false);
    setCopiedTikTokLink(false);
    setDetailsOpen(false);
    setExpandedChips({ strengths: false, weaknesses: false, risks: false });
    setActionsMenuOpen(false);
    setActiveTab('overview');
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }

    if (product) {
      const cachedAi = getCachedAiAnalysisForProduct(product);
      setActiveAiAnalysis(cachedAi.entry?.analysis ?? null);

      const canonicalId = getCanonicalProductId(product);
      const cachedSame = getCachedSameProductSearchResult(canonicalId);
      setSameProductExactCount(
        cachedSame
          ? cachedSame.candidates.filter((c) => c.matchTier === 'exact-same').length
          : 0
      );
    } else {
      setActiveAiAnalysis(null);
      setSameProductExactCount(0);
    }
  }, [product?.id]);

  // Auto-center active tab in horizontal rail & scroll body to top on tab switch
  useEffect(() => {
    const activeButton = tabRefs.current[activeTab];
    if (activeButton && typeof activeButton.scrollIntoView === 'function') {
      activeButton.scrollIntoView({
        behavior: getScrollBehavior(),
        inline: 'center',
        block: 'nearest',
      });
    }
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [activeTab]);

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

  const enrichedLayerCount = useMemo(() => {
    if (!product) return 0;
    return computeEnrichmentLayerCount(product);
  }, [product, enrichmentRevision]);

  const t = TRANSLATIONS[language];
  const isMy = language === 'my';

  return (
    <AnimatePresence>
      {product &&
        (() => {
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

          const isHighMarginVerifiedCommission =
            hasVerifiedCommission &&
            product.commissionRate !== null &&
            (product.commissionRate >= 10 ||
              (earningPerOrderThb !== null && earningPerOrderThb >= 20));

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
              value:
                product.priceThb !== null && product.priceThb > 0
                  ? formatThb(product.priceThb)
                  : '—',
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
          const hasReadyGeminiAi = Boolean(
            effectiveAiAnalysis &&
              effectiveAiAnalysis.source === 'gemini' &&
              !effectiveAiAnalysis.geminiFailed
          );
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

          const drawerTabs: {
            id: DrawerTabId;
            label: string;
          }[] = [
            {
              id: 'overview',
              label: isMy ? 'အနှစ်ချုပ် & Signals' : 'Overview & Signals',
            },
            {
              id: 'same-product',
              label: isMy ? 'ဆိုင်တူ Link ရှာ' : 'Same Product',
            },
            {
              id: 'ai',
              label: isMy ? 'AI ခွဲခြမ်းစိတ်ဖြာချက်' : 'AI Analysis',
            },
            {
              id: 'enrichment',
              label: isMy ? 'ဒေတာဖြည့်စွက်' : 'Enrichment',
            },
          ];

          return (
            <motion.div
              key="research-report-drawer-backdrop"
              variants={MOTION_VARIANTS.backdrop}
              initial="initial"
              animate="animate"
              exit="exit"
              className="fixed inset-0 z-50 flex items-end sm:items-stretch sm:justify-end bg-zinc-950/55 dark:bg-black/75 backdrop-blur-[3px]"
              role="dialog"
              aria-modal="true"
              aria-labelledby="research-report-title"
              onClick={onClose}
            >
              <motion.div
                key="research-report-drawer-panel"
                ref={drawerPanelRef}
                tabIndex={-1}
                variants={isDesktopSm ? MOTION_VARIANTS.drawerRight : MOTION_VARIANTS.bottomSheet}
                initial="initial"
                animate="animate"
                exit="exit"
                className="relative w-full max-w-3xl bg-white dark:bg-[#0E1118] text-zinc-950 dark:text-zinc-50 border-t sm:border-t-0 sm:border-l border-zinc-200/80 dark:border-white/[0.08] rounded-t-2xl sm:rounded-none max-h-[94dvh] sm:max-h-none h-[94dvh] sm:h-[100dvh] shadow-2xl flex flex-col focus:outline-none overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Mobile Bottom Sheet Grab Handle */}
                <div className="sm:hidden shrink-0 pt-2 pb-0.5 flex justify-center bg-white dark:bg-[#0E1118]">
                  <span className="sp-sheet-handle" aria-hidden="true" />
                </div>

                {/* COMPACT STICKY PRODUCT HERO HEADER */}
                <div className="shrink-0 bg-white dark:bg-[#0E1118] border-b border-zinc-200/80 dark:border-white/[0.08]">
                  <div className="px-4 sm:px-6 pt-2.5 sm:pt-3.5 pb-2.5 space-y-2.5">
                    {/* Top Row: Thumbnail + Title/Meta + ScoreRing + VerdictBadge + Close */}
                    <div className="flex items-start gap-3">
                      <div className="relative w-13 h-13 sm:w-16 sm:h-16 rounded-xl overflow-hidden bg-zinc-100 dark:bg-[#131823] shrink-0 border border-zinc-200/80 dark:border-white/[0.08]">
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
                                  className="bg-white/90 dark:bg-[#0E1118]/90 text-zinc-700 dark:text-zinc-300 shadow-xs hover:bg-white dark:hover:bg-[#131823]"
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

                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug">
                          <span className="truncate max-w-[180px] sm:max-w-[240px]">
                            {categoryLabel}
                            {subCategory ? ` · ${subCategory}` : ''}
                          </span>
                          {product.shopName && (
                            <>
                              <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-700">
                                ·
                              </span>
                              <span className="truncate max-w-[140px] sm:max-w-[200px]">
                                {product.shopName}
                              </span>
                            </>
                          )}
                        </div>

                        {tiktokShopUrl ? (
                          <h2
                            id="research-report-title"
                            className="font-display text-sm sm:text-base font-bold text-zinc-950 dark:text-zinc-50 leading-snug line-clamp-2"
                          >
                            <a
                              href={tiktokShopUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:text-emerald-700 dark:hover:text-[#10F5A0] transition-colors"
                            >
                              {displayName}
                            </a>
                          </h2>
                        ) : (
                          <h2
                            id="research-report-title"
                            className="font-display text-sm sm:text-base font-bold text-zinc-950 dark:text-zinc-50 leading-snug line-clamp-2"
                          >
                            {displayName}
                          </h2>
                        )}

                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-0.5">
                          <VerdictBadge
                            verdict={decisionSummary.verdict}
                            animateStamp
                            size="sm"
                            language={language}
                          />
                          {formattedResearchDate && (
                            <span className="font-mono text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
                              {formattedResearchDate}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right Side: Animated ScoreRing + Close */}
                      <div className="flex items-start gap-2 shrink-0">
                        <ScoreRing value={evaluation.totalScore} size={50} animate />
                        <motion.button
                          type="button"
                          whileTap={TACTILE_INTERACTIONS.buttonTap}
                          onClick={onClose}
                          aria-label={t.reportClose}
                          className="min-w-[40px] min-h-[40px] rounded-xl inline-flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50 hover:bg-zinc-100 dark:hover:bg-white/[0.07] transition-colors cursor-pointer shrink-0"
                        >
                          <X className="w-4 h-4" aria-hidden="true" />
                        </motion.button>
                      </div>
                    </div>

                    {/* Inline Hero Money Strip + Quick Primary Actions */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-100 dark:border-white/[0.06]">
                      {/* Money Telemetry Strip */}
                      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 min-w-0">
                        {/* Price */}
                        <div className="inline-flex items-baseline gap-1.5">
                          <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                            {t.cardPrice}
                          </span>
                          {product.priceThb !== null && product.priceThb > 0 ? (
                            <AnimatedNumber
                              value={Math.round(product.priceThb)}
                              prefix="฿"
                              className="font-mono text-sm sm:text-base font-bold tabular-nums text-zinc-950 dark:text-zinc-50"
                            />
                          ) : (
                            <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                              —
                            </span>
                          )}
                          <StatusDot
                            status={effectivePriceStatus}
                            language={language}
                            size="sm"
                          />
                        </div>

                        <span
                          aria-hidden="true"
                          className="hidden xs:inline text-zinc-300 dark:text-white/15"
                        >
                          |
                        </span>

                        {/* Verified Commission */}
                        <div className="inline-flex items-baseline gap-1.5">
                          <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                            {t.cardCommission}
                          </span>
                          {hasVerifiedCommission && product.commissionRate !== null ? (
                            <>
                              <AnimatedNumber
                                value={product.commissionRate}
                                decimals={Number.isInteger(product.commissionRate) ? 0 : 1}
                                suffix="%"
                                highlightSignal={
                                  isHighMarginVerifiedCommission ? 'emerald-sheen' : 'none'
                                }
                                className="font-mono text-sm sm:text-base font-bold tabular-nums text-emerald-700 dark:text-[#10F5A0]"
                              />
                              {earningPerOrderThb !== null && (
                                <span className="font-mono text-xs tabular-nums text-zinc-600 dark:text-zinc-300">
                                  ({formatThb(earningPerOrderThb)})
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                              {t.drawerNoData}
                            </span>
                          )}
                          <StatusDot
                            status={effectiveCommissionStatus}
                            language={language}
                            size="sm"
                          />
                        </div>
                      </div>

                      {/* Quick Action Buttons (Deep Dive, Save, Export ...) */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {onOpenDeepDive && (
                          <motion.button
                            type="button"
                            whileTap={TACTILE_INTERACTIONS.buttonTap}
                            onClick={() => onOpenDeepDive(product)}
                            className="sp-btn-secondary !min-h-[36px] !px-2.5 sm:!px-3 !py-1 text-xs whitespace-nowrap shrink-0 transition-colors"
                          >
                            <Layers className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                            <span>Deep Dive</span>
                          </motion.button>
                        )}

                        <motion.button
                          type="button"
                          whileTap={TACTILE_INTERACTIONS.buttonTap}
                          onClick={() => onSave(product.id)}
                          className={`inline-flex items-center justify-center gap-1.5 min-h-[36px] px-2.5 sm:px-3 py-1 text-xs font-semibold rounded-lg border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                            isSaved
                              ? 'bg-emerald-600 dark:bg-[#10F5A0] text-white dark:text-[#06070A] border-emerald-600 dark:border-[#10F5A0] hover:bg-emerald-700 dark:hover:bg-[#34F7B0]'
                              : 'bg-white dark:bg-[#131823] text-zinc-800 dark:text-zinc-100 border-zinc-200 dark:border-white/[0.1] hover:bg-zinc-50 dark:hover:bg-white/[0.06]'
                          }`}
                        >
                          <Bookmark
                            className={`w-3.5 h-3.5 shrink-0 ${isSaved ? 'fill-current' : ''}`}
                            aria-hidden="true"
                          />
                          <span>{isSaved ? t.btnSavedProduct : t.btnSaveProduct}</span>
                        </motion.button>

                        {/* Export Overflow Menu (Copy / CSV / JSON) */}
                        <div ref={actionsMenuRef} className="relative shrink-0">
                          <motion.button
                            type="button"
                            whileTap={TACTILE_INTERACTIONS.buttonTap}
                            aria-label={t.drawerMoreActions}
                            aria-haspopup="menu"
                            aria-expanded={actionsMenuOpen}
                            onClick={() => setActionsMenuOpen((prev) => !prev)}
                            className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-lg border border-zinc-200 dark:border-white/[0.1] bg-white dark:bg-[#131823] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
                          >
                            <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
                          </motion.button>

                          <AnimatePresence>
                            {actionsMenuOpen && (
                              <motion.div
                                role="menu"
                                aria-label={t.drawerMoreActions}
                                variants={MOTION_VARIANTS.popover}
                                initial="initial"
                                animate="animate"
                                exit="exit"
                                className="sp-glass absolute top-full mt-1.5 right-0 z-30 min-w-[200px] py-1.5 rounded-xl border border-zinc-200/90 dark:border-white/[0.1] shadow-xl"
                              >
                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={() => {
                                    handleCopyReport();
                                    setActionsMenuOpen(false);
                                  }}
                                  className="w-full min-h-[40px] px-3.5 py-2 flex items-center gap-2.5 text-left text-xs font-medium text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100/80 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
                                >
                                  {copied ? (
                                    <>
                                      <Check
                                        className="w-4 h-4 text-emerald-600 dark:text-[#10F5A0] shrink-0"
                                        aria-hidden="true"
                                      />
                                      <span>{t.reportCopied}</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy
                                        className="w-4 h-4 text-zinc-500 dark:text-zinc-400 shrink-0"
                                        aria-hidden="true"
                                      />
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
                                  className="w-full min-h-[40px] px-3.5 py-2 flex items-center gap-2.5 text-left text-xs font-medium text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100/80 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
                                >
                                  <Download
                                    className="w-4 h-4 text-zinc-500 dark:text-zinc-400 shrink-0"
                                    aria-hidden="true"
                                  />
                                  <span>{t.exportCsvBtn}</span>
                                </button>

                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={() => {
                                    handleExportSingleJson();
                                    setActionsMenuOpen(false);
                                  }}
                                  className="w-full min-h-[40px] px-3.5 py-2 flex items-center gap-2.5 text-left text-xs font-medium text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100/80 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
                                >
                                  <Download
                                    className="w-4 h-4 text-zinc-500 dark:text-zinc-400 shrink-0"
                                    aria-hidden="true"
                                  />
                                  <span>{t.exportJsonBtn}</span>
                                </button>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 4-TAB GLIDING NAVIGATION RAIL */}
                  <div className="relative px-4 sm:px-6 py-2 bg-[#F5F6F8]/90 dark:bg-[#131823]/90 border-t border-zinc-200/75 dark:border-white/[0.07]">
                    <div
                      role="tablist"
                      aria-label={t.reportTitle}
                      className="no-scrollbar flex items-center gap-1 overflow-x-auto"
                    >
                      {drawerTabs.map((tab) => {
                        const isActive = activeTab === tab.id;
                        return (
                          <button
                            key={tab.id}
                            ref={(el) => {
                              tabRefs.current[tab.id] = el;
                            }}
                            type="button"
                            role="tab"
                            aria-selected={isActive}
                            aria-controls={`drawer-tabpanel-${tab.id}`}
                            id={`drawer-tab-${tab.id}`}
                            onClick={() => setActiveTab(tab.id)}
                            className={`relative inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold leading-snug whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                              isActive
                                ? 'text-zinc-950 dark:text-zinc-50'
                                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                            }`}
                          >
                            {isActive && (
                              <motion.span
                                layoutId="report-drawer-tab-pill"
                                transition={MOTION_TRANSITIONS.snappy}
                                className="absolute inset-0 rounded-lg bg-white dark:bg-[#0E1118] border border-zinc-200/90 dark:border-white/[0.12] shadow-xs"
                                aria-hidden="true"
                              />
                            )}
                            <span className="relative z-10 inline-flex items-center gap-1.5">
                              <span>{tab.label}</span>

                              {tab.id === 'same-product' && sameProductExactCount > 0 && (
                                <span className="font-mono text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded bg-emerald-500/15 dark:bg-[#10F5A0]/15 text-emerald-700 dark:text-[#10F5A0] leading-none">
                                  {sameProductExactCount}
                                </span>
                              )}

                              {tab.id === 'ai' && hasReadyGeminiAi && (
                                <span
                                  aria-label={isMy ? 'AI အသင့်ရှိပြီး' : 'AI analysis cached'}
                                  title={isMy ? 'AI အသင့်ရှိပြီး' : 'Gemini AI analysis ready'}
                                  className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-[#10F5A0] shrink-0"
                                />
                              )}

                              {tab.id === 'enrichment' && (
                                <span
                                  className={`font-mono text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded leading-none ${
                                    enrichedLayerCount === 3
                                      ? 'bg-emerald-500/15 dark:bg-[#10F5A0]/15 text-emerald-700 dark:text-[#10F5A0]'
                                      : 'bg-zinc-200/80 dark:bg-white/[0.08] text-zinc-600 dark:text-zinc-300'
                                  }`}
                                >
                                  {enrichedLayerCount}/3
                                </span>
                              )}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* SCROLLABLE TAB BODY (Only active tab mounts for 60fps Android Tablet scrolling) */}
                <div
                  ref={scrollContainerRef}
                  className="flex-1 overflow-y-auto px-4 sm:px-6 pt-4 sm:pt-5 pb-6"
                >
                  <AnimatePresence mode="wait">
                    {activeTab === 'overview' && (
                      <motion.div
                        key="tab-overview"
                        role="tabpanel"
                        id="drawer-tabpanel-overview"
                        aria-labelledby="drawer-tab-overview"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={MOTION_TRANSITIONS.crossFade}
                        className="space-y-6"
                      >
                        {/* 1. Phase B Detailed Technical Signal Strip (ASI Gauge, Channel Mix, 5-Point Confluence) */}
                        <TechnicalSignalStrip
                          product={product}
                          evaluation={evaluation}
                          language={language}
                          variant="detailed"
                        />

                        {/* 2. Confidence, Status Legend & Direct TikTok Shop Link Row */}
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

                          const strengthsList = isMy
                            ? evaluation.strengthsMy
                            : evaluation.strengthsEn;
                          const weaknessesList = isMy
                            ? evaluation.weaknessesMy
                            : evaluation.weaknessesEn;
                          const risksList = isMy ? evaluation.risksMy : evaluation.risksEn;
                          const decisionCautions = isMy
                            ? decisionSummary.cautionsMy
                            : decisionSummary.cautionsEn;
                          const decisionReason = isMy
                            ? decisionSummary.reasonMy
                            : decisionSummary.reasonEn;

                          const confidenceToneClass =
                            evaluation.confidencePct >= 75
                              ? 'text-emerald-700 dark:text-[#10F5A0]'
                              : evaluation.confidencePct >= 50
                                ? 'text-amber-700 dark:text-amber-300'
                                : 'text-zinc-600 dark:text-zinc-400';

                          const hasSalesVolume =
                            typeof km?.salesVolume === 'number' &&
                            Number.isFinite(km.salesVolume);
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
                              headingClass: 'text-emerald-800 dark:text-[#10F5A0]',
                              markerClass: 'marker:text-emerald-600 dark:marker:text-[#10F5A0]',
                              btnClass:
                                'text-emerald-700 dark:text-[#10F5A0] hover:underline',
                            },
                            {
                              key: 'weaknesses' as const,
                              heading: t.scoringWeaknessesHeading,
                              items: weaknessesList,
                              headingClass: 'text-amber-800 dark:text-amber-300',
                              markerClass: 'marker:text-amber-600 dark:marker:text-amber-400',
                              btnClass: 'text-amber-700 dark:text-amber-300 hover:underline',
                            },
                            {
                              key: 'risks' as const,
                              heading: t.scoringRisksHeading,
                              items: risksList,
                              headingClass: 'text-rose-800 dark:text-[#FE2C55]',
                              markerClass: 'marker:text-rose-600 dark:marker:text-[#FE2C55]',
                              btnClass: 'text-rose-700 dark:text-[#FE2C55] hover:underline',
                            },
                          ].filter((group) => group.items.length > 0);

                          return (
                            <div id="rep-overview" className="space-y-4 sm:space-y-5">
                              {/* Confidence + Status Legend + TikTok Link Row */}
                              <div className="flex flex-wrap items-center justify-between gap-2.5">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                                  <span>{t.cardConfidence}</span>
                                  <strong
                                    className={`font-mono font-bold tabular-nums ${confidenceToneClass}`}
                                  >
                                    {evaluation.confidencePct}%
                                  </strong>
                                  <span>· {t.confidenceLabels[evaluation.confidenceLevel]}</span>
                                  <StatusLegendPopover language={language} className="-ml-1" />
                                </div>

                                {tiktokShopUrl && (
                                  <div className="flex items-center gap-2">
                                    <a
                                      href={tiktokShopUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="sp-btn-secondary !min-h-[36px] !px-3 !py-1.5 text-xs whitespace-nowrap"
                                    >
                                      <span className="truncate">{t.drawerOpenTikTokShop}</span>
                                      <ExternalLink
                                        className="w-3.5 h-3.5 shrink-0"
                                        aria-hidden="true"
                                      />
                                    </a>
                                    <motion.button
                                      type="button"
                                      whileTap={TACTILE_INTERACTIONS.buttonTap}
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
                                      className="sp-btn-secondary !min-h-[36px] !px-2.5 !py-1.5 text-xs whitespace-nowrap shrink-0 transition-colors"
                                    >
                                      {copiedTikTokLink ? (
                                        <Check
                                          className="w-3.5 h-3.5 text-emerald-600 dark:text-[#10F5A0] shrink-0"
                                          aria-hidden="true"
                                        />
                                      ) : (
                                        <Copy className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                                      )}
                                      <span>
                                        {copiedTikTokLink
                                          ? t.drawerCopiedLink
                                          : t.drawerCopyTikTokLink}
                                      </span>
                                    </motion.button>
                                  </div>
                                )}
                              </div>

                              {/* Clean Single-Elevation Hairline 4-KPI Block */}
                              <div className="rounded-xl overflow-hidden border border-zinc-200/80 dark:border-white/[0.08] bg-zinc-200/70 dark:bg-white/[0.06] grid grid-cols-1 sm:grid-cols-2 gap-px">
                                {/* 1. Price */}
                                <div className="bg-[#F5F6F8] dark:bg-[#131823] px-3.5 py-2.5 sm:p-3.5 flex flex-col items-stretch gap-1 min-w-0">
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
                                <div className="bg-[#F5F6F8] dark:bg-[#131823] px-3.5 py-2.5 sm:p-3.5 flex flex-col items-stretch gap-1 min-w-0">
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
                                        <span className="font-mono text-base sm:text-lg font-bold tabular-nums text-emerald-700 dark:text-[#10F5A0]">
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
                                <div className="bg-[#F5F6F8] dark:bg-[#131823] px-3.5 py-2.5 sm:p-3.5 flex flex-col items-stretch gap-1.5 min-w-0">
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
                                <div className="bg-[#F5F6F8] dark:bg-[#131823] px-3.5 py-2.5 sm:p-3.5 flex flex-col items-stretch gap-1 min-w-0">
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
                                              ? 'text-emerald-700 dark:text-[#10F5A0]'
                                              : product.competitionLevel === 'High'
                                                ? 'text-rose-700 dark:text-[#FE2C55]'
                                                : 'text-amber-700 dark:text-amber-300'
                                          }`}
                                        >
                                          {km!.creatorNumber!.toLocaleString('en-US')}{' '}
                                          {t.bestCreatorsUnit}
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

                              {/* Why this score */}
                              <div className="rounded-xl border border-zinc-200/80 dark:border-white/[0.08] bg-[#F5F6F8] dark:bg-[#131823] p-3.5 sm:p-4 space-y-3">
                                <div className="flex flex-wrap items-baseline justify-between gap-2">
                                  <h3 className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-50 leading-snug">
                                    {t.drawerWhyScoreHeading}
                                  </h3>
                                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                                    {strategyFocusLabel}
                                  </span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2.5">
                                  {sortedCriteria.map((item) => {
                                    const scoreVal = item.wasRedistributed
                                      ? null
                                      : item.normalizedScore;
                                    const isAvailable =
                                      typeof scoreVal === 'number' && Number.isFinite(scoreVal);
                                    const clamped = isAvailable
                                      ? Math.max(0, Math.min(100, scoreVal!))
                                      : 0;
                                    const weightPct = Math.round(
                                      item.wasRedistributed
                                        ? item.baseWeight
                                        : item.effectiveWeight
                                    );
                                    const barFillClass = !isAvailable
                                      ? 'bg-zinc-400 dark:bg-zinc-600'
                                      : clamped >= 70
                                        ? 'bg-emerald-600 dark:bg-[#10F5A0]'
                                        : clamped >= 40
                                          ? 'bg-amber-500 dark:bg-amber-400'
                                          : 'bg-rose-600 dark:bg-[#FE2C55]';
                                    const scoreTextClass = !isAvailable
                                      ? 'text-zinc-500 dark:text-zinc-400'
                                      : clamped >= 70
                                        ? 'text-emerald-700 dark:text-[#10F5A0]'
                                        : clamped >= 40
                                          ? 'text-amber-700 dark:text-amber-300'
                                          : 'text-rose-700 dark:text-[#FE2C55]';

                                    return (
                                      <div key={item.key} className="space-y-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2 text-xs">
                                          <div className="flex items-center gap-1.5 min-w-0">
                                            <StatusDot
                                              status={item.verification}
                                              language={language}
                                              size="sm"
                                            />
                                            <span className="font-medium text-zinc-800 dark:text-zinc-200 truncate leading-snug">
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
                                          className="w-full h-1.5 rounded-full bg-zinc-200/80 dark:bg-white/[0.08] overflow-hidden"
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

                              {/* Strengths / Weaknesses / Risks */}
                              {noteGroups.length > 0 && (
                                <div className="divide-y divide-zinc-200/70 dark:divide-white/[0.07] border-y border-zinc-200/80 dark:border-white/[0.08]">
                                  {noteGroups.map((group) => {
                                    const isExpanded = expandedChips[group.key];
                                    const visibleItems = isExpanded
                                      ? group.items
                                      : group.items.slice(0, 3);
                                    const hiddenCount = group.items.length - 3;

                                    return (
                                      <div key={group.key} className="py-3 space-y-1.5">
                                        <div className="flex items-baseline justify-between gap-2">
                                          <h4
                                            className={`text-xs font-semibold leading-snug ${group.headingClass}`}
                                          >
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

                              {/* Collapsed "Details" Accordion (Myanmar-safe overflow) */}
                              <section
                                id="rep-decision"
                                className="rounded-xl bg-[#F5F6F8] dark:bg-[#131823] border border-zinc-200/80 dark:border-white/[0.08]"
                              >
                                <button
                                  type="button"
                                  aria-expanded={detailsOpen}
                                  aria-controls="rep-decision-details"
                                  onClick={() => setDetailsOpen((prev) => !prev)}
                                  className="w-full min-h-[44px] px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-zinc-100/80 dark:hover:bg-white/[0.04] rounded-xl transition-colors cursor-pointer"
                                >
                                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 min-w-0">
                                    <span className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-50 leading-snug">
                                      {t.drawerDetailsAccordion}
                                    </span>
                                    <span className="text-xs text-zinc-500 dark:text-zinc-400 leading-snug">
                                      {t.decisionSummaryHeading}
                                    </span>
                                  </div>
                                  <ChevronDown
                                    className={`w-4 h-4 text-zinc-500 dark:text-zinc-400 shrink-0 transition-transform ${
                                      detailsOpen ? 'rotate-180' : ''
                                    }`}
                                    aria-hidden="true"
                                  />
                                </button>

                                <AnimatePresence initial={false}>
                                  {detailsOpen && (
                                    <motion.div
                                      id="rep-decision-details"
                                      initial={{ opacity: 0, height: 0, overflow: 'hidden' }}
                                      animate={{
                                        opacity: 1,
                                        height: 'auto',
                                        transitionEnd: { overflow: 'visible' },
                                      }}
                                      exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
                                      transition={MOTION_TRANSITIONS.accordion}
                                    >
                                      <div className="px-4 pb-4 pt-3 border-t border-zinc-200/80 dark:border-white/[0.07] space-y-3 text-[13px]">
                                        <p className="text-zinc-800 dark:text-zinc-200 leading-relaxed font-medium">
                                          {decisionReason}
                                        </p>

                                        {decisionCautions.length > 0 && (
                                          <div className="pt-2.5 border-t border-zinc-200/70 dark:border-white/[0.06] space-y-1.5">
                                            <div className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                                              {t.decisionCautionsLabel}
                                            </div>
                                            <ul className="space-y-1.5 text-zinc-600 dark:text-zinc-400 leading-relaxed list-disc pl-4 marker:text-amber-500">
                                              {decisionCautions.map((caution, idx) => (
                                                <li key={`${idx}-${caution}`}>{caution}</li>
                                              ))}
                                            </ul>
                                          </div>
                                        )}
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </section>
                            </div>
                          );
                        })()}

                        {/* 3. Myanmar Video / Review Evidence & Status (Thailand TikTok Shop Only) */}
                        {(myanmarInfo.matched ||
                          (myanmarInfo.matchedVideos?.length ?? 0) > 0 ||
                          myanmarInfo.totalReviewsChecked > 0) &&
                          (() => {
                            const matchedVideos = myanmarInfo.matchedVideos ?? [];
                            const isVideoBacked = matchedVideos.length > 0;
                            return (
                              <section
                                id="rep-myanmar-signals"
                                className="pt-6 border-t border-zinc-200/80 dark:border-white/[0.08] space-y-3"
                              >
                                <div className="flex flex-wrap items-baseline justify-between gap-2">
                                  <div className="flex items-center gap-1.5">
                                    <h3 className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-50 leading-snug">
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
                                        ? 'text-emerald-700 dark:text-[#10F5A0]'
                                        : myanmarInfo.reviewStatus === 'review-unavailable'
                                          ? 'text-amber-700 dark:text-amber-300'
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

                                <div className="rounded-xl bg-[#F5F6F8] dark:bg-[#131823] border border-zinc-200/80 dark:border-white/[0.08] p-3.5 sm:p-4 space-y-3 text-xs">
                                  {isVideoBacked && (
                                    <div className="space-y-1.5">
                                      <div className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                                        {t.myanmarVideoEvidenceHeading}
                                      </div>
                                      <ul className="space-y-2">
                                        {matchedVideos.map((vid, idx) => (
                                          <li
                                            key={`my-video-${vid.videoId}-${idx}`}
                                            className="p-2.5 rounded-lg bg-white dark:bg-[#0E1118] border border-zinc-200/80 dark:border-white/[0.08] space-y-1"
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
                                                  <span className="font-medium text-amber-700 dark:text-amber-300">
                                                    · {t.myanmarMixedThaiBurmeseTag}
                                                  </span>
                                                )}
                                              </div>
                                              <div className="flex items-center gap-2 font-mono text-zinc-500 dark:text-zinc-400 tabular-nums">
                                                {typeof vid.videoRevenueThb === 'number' && (
                                                  <span className="text-emerald-700 dark:text-[#10F5A0] font-semibold">
                                                    {formatThb(vid.videoRevenueThb)}
                                                  </span>
                                                )}
                                                {typeof vid.videoViews === 'number' && (
                                                  <span>
                                                    {vid.videoViews.toLocaleString('en-US')} views
                                                  </span>
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
                                                  className="inline-flex items-center gap-1 text-xs font-medium text-cyan-700 dark:text-[#25F4EE] hover:underline"
                                                >
                                                  <span>{t.myanmarVideoOpenLinkLabel}</span>
                                                  <ExternalLink
                                                    className="w-3 h-3"
                                                    aria-hidden="true"
                                                  />
                                                </a>
                                              </div>
                                            )}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}

                                  {myanmarInfo.totalReviewsChecked > 0 && (
                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs text-zinc-700 dark:text-zinc-300 tabular-nums">
                                      <span>
                                        <strong className="text-zinc-950 dark:text-zinc-50">
                                          {myanmarInfo.matchedReviewCount}
                                        </strong>{' '}
                                        {t.myanmarReviewsMatchedLabel}
                                      </span>
                                      <span
                                        aria-hidden="true"
                                        className="text-zinc-300 dark:text-zinc-600"
                                      >
                                        ·
                                      </span>
                                      <span>
                                        <strong className="text-zinc-950 dark:text-zinc-50">
                                          {myanmarInfo.totalReviewsChecked}
                                        </strong>{' '}
                                        {t.myanmarReviewsCheckedLabel}
                                      </span>
                                      {myanmarInfo.skippedTooShortCount > 0 && (
                                        <>
                                          <span
                                            aria-hidden="true"
                                            className="text-zinc-300 dark:text-zinc-600"
                                          >
                                            ·
                                          </span>
                                          <span className="text-zinc-500 dark:text-zinc-400">
                                            {myanmarInfo.skippedTooShortCount}{' '}
                                            {t.myanmarSkippedShortLabel}
                                          </span>
                                        </>
                                      )}
                                    </div>
                                  )}

                                  {myanmarInfo.matchedReviews &&
                                  myanmarInfo.matchedReviews.length > 0 ? (
                                    <div className="space-y-1.5">
                                      <div className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                                        {t.myanmarEvidenceHeading}
                                      </div>
                                      <ul className="space-y-2">
                                        {myanmarInfo.matchedReviews.map((rv, idx) => (
                                          <li
                                            key={`my-review-${idx}`}
                                            className="p-2.5 rounded-lg bg-white dark:bg-[#0E1118] border border-zinc-200/80 dark:border-white/[0.08] space-y-1"
                                          >
                                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                              <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                                                  {t.myanmarMatchTypeLabels[rv.matchType]}
                                                </span>
                                                {rv.isMixedThaiBurmese && (
                                                  <span className="font-medium text-amber-700 dark:text-amber-300">
                                                    · {t.myanmarMixedThaiBurmeseTag}
                                                  </span>
                                                )}
                                              </div>
                                              <span className="font-mono text-zinc-500 dark:text-zinc-400 tabular-nums">
                                                {typeof rv.rating === 'number'
                                                  ? `★ ${rv.rating.toFixed(1)} · `
                                                  : ''}
                                                {typeof rv.pageNumber === 'number' &&
                                                rv.pageNumber > 1
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
                                    <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                                      {t.myanmarNoEvidenceNote}
                                    </p>
                                  ) : null}

                                  <div className="pt-2.5 border-t border-zinc-200/70 dark:border-white/[0.07] space-y-1.5">
                                    <div className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                                      {t.myanmarSourcesHeading}
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                      {(
                                        [
                                          'videoContent',
                                          'comments',
                                          'reviews',
                                          'title',
                                          'description',
                                        ] as MyanmarSignalSource[]
                                      ).map((srcKey) => {
                                        const st = myanmarInfo.sourceStatuses[srcKey];
                                        const statusColor =
                                          st.availability === 'matched'
                                            ? 'text-emerald-700 dark:text-[#10F5A0]'
                                            : st.availability === 'checked-no-match'
                                              ? 'text-zinc-600 dark:text-zinc-400'
                                              : 'text-zinc-500 dark:text-zinc-400';
                                        return (
                                          <div
                                            key={srcKey}
                                            className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#0E1118] border border-zinc-200/70 dark:border-white/[0.07]"
                                          >
                                            <span className="text-zinc-700 dark:text-zinc-300 truncate">
                                              {t.myanmarSourceLabels[srcKey]}
                                            </span>
                                            <span
                                              className={`font-mono text-xs font-medium shrink-0 ${statusColor}`}
                                            >
                                              {t.myanmarAvailabilityLabels[st.availability]}
                                            </span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>

                                  <p className="pt-2 border-t border-zinc-200/70 dark:border-white/[0.07] text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                                    {isMy
                                      ? myanmarInfo.marketScopeNoteMy
                                      : myanmarInfo.marketScopeNoteEn}
                                  </p>
                                </div>
                              </section>
                            );
                          })()}

                        {/* 4. Dedicated Verified Kalodata Market Data Block */}
                        <section
                          id="rep-market-data"
                          className="pt-6 border-t border-zinc-200/80 dark:border-white/[0.08] space-y-3"
                        >
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <div>
                              <h3 className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-50 leading-snug">
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

                          <dl className="rounded-xl overflow-hidden border border-zinc-200/80 dark:border-white/[0.08] bg-[#F5F6F8] dark:bg-[#131823] grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 p-3.5 sm:p-4 text-xs">
                            <div>
                              <dt className="text-xs text-zinc-500 dark:text-zinc-400">
                                {isMy ? 'ရောင်းအား' : 'Sales Volume'}
                              </dt>
                              <dd className="mt-0.5 tabular-nums">
                                {typeof km?.salesVolume === 'number' ? (
                                  <span className="font-mono font-semibold text-zinc-950 dark:text-zinc-50">
                                    {km.salesVolume.toLocaleString('en-US')}
                                  </span>
                                ) : (
                                  <span className="text-zinc-500 dark:text-zinc-400">
                                    {t.dataStatusLabels.unavailable}
                                  </span>
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
                                  <span className="text-zinc-500 dark:text-zinc-400">
                                    {t.dataStatusLabels.unavailable}
                                  </span>
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
                                  <span className="text-zinc-500 dark:text-zinc-400">
                                    {t.dataStatusLabels.unavailable}
                                  </span>
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
                                  <span className="text-zinc-500 dark:text-zinc-400">
                                    {t.dataStatusLabels.unavailable}
                                  </span>
                                )}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-xs text-zinc-500 dark:text-zinc-400">
                                {t.cardCommission}
                              </dt>
                              <dd className="mt-0.5 tabular-nums">
                                {hasVerifiedCommission && product.commissionRate !== null ? (
                                  <span className="font-mono font-semibold text-emerald-700 dark:text-[#10F5A0]">
                                    {`${product.commissionRate}%`}
                                  </span>
                                ) : (
                                  <span className="text-zinc-500 dark:text-zinc-400">
                                    {t.dataStatusLabels.unavailable}
                                  </span>
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
                                  <span className="text-zinc-500 dark:text-zinc-400">
                                    {t.dataStatusLabels.unavailable}
                                  </span>
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
                                  <span className="text-zinc-500 dark:text-zinc-400">
                                    {t.dataStatusLabels.unavailable}
                                  </span>
                                )}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-xs text-zinc-500 dark:text-zinc-400">
                                {isMy ? 'ဆိုင် GMV' : 'Shop GMV'}
                              </dt>
                              <dd className="mt-0.5 tabular-nums">
                                {typeof km?.shopRevenueThb === 'number' ? (
                                  <span className="font-mono font-semibold text-zinc-950 dark:text-zinc-50">
                                    {formatThb(km.shopRevenueThb)}
                                  </span>
                                ) : (
                                  <span className="text-zinc-500 dark:text-zinc-400">
                                    {t.dataStatusLabels.unavailable}
                                  </span>
                                )}
                              </dd>
                            </div>
                          </dl>
                        </section>

                        {/* 5. 14-Field Data Provenance Matrix */}
                        <section className="pt-6 border-t border-zinc-200/80 dark:border-white/[0.08] space-y-3">
                          <div className="flex items-center gap-1.5">
                            <h3 className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-50 leading-snug">
                              {t.dataVerificationHeading}
                            </h3>
                            <InfoPopover
                              variant="info"
                              label={t.dataVerificationHeading}
                              title={t.dataVerificationHeading}
                              content={t.dataVerificationSubtitle}
                            />
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 divide-y divide-zinc-100 dark:divide-white/[0.06] sm:divide-y-0">
                            {provenanceItems.map((item) => (
                              <div
                                key={item.label}
                                className="py-2 sm:border-b sm:border-zinc-100 dark:sm:border-white/[0.06] flex items-baseline justify-between gap-3 text-xs"
                              >
                                <span className="text-zinc-600 dark:text-zinc-400 truncate">
                                  {item.label}
                                </span>
                                <div className="flex items-baseline gap-2 shrink-0 text-right">
                                  <span className="font-mono text-zinc-900 dark:text-zinc-100 tabular-nums max-w-[140px] truncate">
                                    {item.value}
                                  </span>
                                  <span
                                    className={`font-medium ${dataStatusColorClass(item.status)}`}
                                  >
                                    {t.dataStatusLabels[item.status]}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </section>

                        {/* 6. 7-Factor 100-Point Scoring Breakdown */}
                        <section
                          id="rep-score"
                          className="pt-6 border-t border-zinc-200/80 dark:border-white/[0.08] space-y-4"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-1.5">
                                <h3 className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-50 leading-snug">
                                  {t.scoringBreakdownHeading}
                                </h3>
                                <InfoPopover
                                  variant="help"
                                  label={t.scoringBreakdownHeading}
                                  title={t.scoringBreakdownHeading}
                                  content={
                                    <div className="space-y-1.5">
                                      <p className="font-medium text-zinc-800 dark:text-zinc-200">
                                        {t.scoringDisclaimer}
                                      </p>
                                      <p>{t.scoringVerificationRule}</p>
                                      {evaluation.redistributedWeightPct > 0 && (
                                        <p className="text-amber-800 dark:text-amber-300 font-medium">
                                          {t.scoringRedistributedNotice} (
                                          {evaluation.redistributedWeightPct} pts)
                                        </p>
                                      )}
                                    </div>
                                  }
                                />
                              </div>
                              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                                {t.scoringStrategyActiveLabel}: {strategyFocusLabel} (
                                {evaluation.salesWeightPct}/{100 - evaluation.salesWeightPct})
                                {evaluation.redistributedWeightPct > 0 ? (
                                  <span className="ml-2 text-amber-700 dark:text-amber-300 font-medium">
                                    · {evaluation.redistributedWeightPct} pts redistributed
                                  </span>
                                ) : null}
                              </p>
                            </div>
                            <span className="font-mono text-xs text-zinc-600 dark:text-zinc-400 tabular-nums">
                              {evaluation.totalScore}/100 · {t.cardConfidence}:{' '}
                              <strong className="text-zinc-950 dark:text-zinc-50">
                                {t.confidenceLabels[evaluation.confidenceLevel]} (
                                {evaluation.confidencePct}%)
                              </strong>
                            </span>
                          </div>

                          <div className="divide-y divide-zinc-100 dark:divide-white/[0.06] border-y border-zinc-200/80 dark:border-white/[0.08]">
                            {evaluation.criteria.map((item, idx) => {
                              const pct =
                                item.wasRedistributed || item.normalizedScore === null
                                  ? 0
                                  : Math.max(0, Math.min(100, Math.round(item.normalizedScore)));
                              const evidence = isMy ? item.evidenceMy : item.evidenceEn;
                              const metricDisplay = isMy
                                ? item.metricDisplayMy
                                : item.metricDisplayEn;
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
                                      <span
                                        className={`font-medium ${dataStatusColorClass(item.verification)}`}
                                      >
                                        {t.criterionVerificationLabels[item.verification]}
                                      </span>
                                      {item.wasRedistributed || item.earnedPoints === null ? (
                                        <span className="font-mono text-xs text-amber-700 dark:text-amber-300 tabular-nums">
                                          {t.scoringRedistributedLabel}
                                        </span>
                                      ) : (
                                        <span className="font-mono font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums min-w-[68px] text-right">
                                          {item.earnedPoints.toFixed(1)}/
                                          {item.effectiveWeight.toFixed(1)}
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  <div className="h-1.5 w-full bg-zinc-100 dark:bg-white/[0.07] rounded-full overflow-hidden">
                                    {item.wasRedistributed ? (
                                      <div className="h-full w-full bg-zinc-200/70 dark:bg-white/[0.12]" />
                                    ) : (
                                      <div
                                        className={`h-full rounded-full ${
                                          item.verification === 'verified'
                                            ? 'bg-emerald-600 dark:bg-[#10F5A0]'
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

                          {/* 4-Box Score Explanation Grid */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                            <div className="rounded-xl bg-[#F5F6F8] dark:bg-[#131823] border border-zinc-200/75 dark:border-white/[0.07] p-3.5 sm:p-4 space-y-2">
                              <h4 className="font-display text-xs font-semibold text-emerald-800 dark:text-[#10F5A0]">
                                {t.scoringStrengthsHeading}
                              </h4>
                              <ul className="space-y-1.5 text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed list-disc pl-4 marker:text-emerald-600 dark:marker:text-[#10F5A0]">
                                {(isMy ? evaluation.strengthsMy : evaluation.strengthsEn).map(
                                  (line, i) => (
                                    <li key={`${i}-${line}`}>{line}</li>
                                  )
                                )}
                              </ul>
                            </div>

                            <div className="rounded-xl bg-[#F5F6F8] dark:bg-[#131823] border border-zinc-200/75 dark:border-white/[0.07] p-3.5 sm:p-4 space-y-2">
                              <h4 className="font-display text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                                {t.scoringWeaknessesHeading}
                              </h4>
                              <ul className="space-y-1.5 text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed list-disc pl-4 marker:text-zinc-400">
                                {(isMy ? evaluation.weaknessesMy : evaluation.weaknessesEn).map(
                                  (line, i) => (
                                    <li key={`${i}-${line}`}>{line}</li>
                                  )
                                )}
                              </ul>
                            </div>

                            <div className="rounded-xl bg-[#F5F6F8] dark:bg-[#131823] border border-zinc-200/75 dark:border-white/[0.07] p-3.5 sm:p-4 space-y-2">
                              <h4 className="font-display text-xs font-semibold text-amber-800 dark:text-amber-300">
                                {t.scoringRisksHeading}
                              </h4>
                              <ul className="space-y-1.5 text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed list-disc pl-4 marker:text-amber-500">
                                {(isMy ? evaluation.risksMy : evaluation.risksEn).map((line, i) => (
                                  <li key={`${i}-${line}`}>{line}</li>
                                ))}
                              </ul>
                            </div>

                            <div className="rounded-xl bg-[#F5F6F8] dark:bg-[#131823] border border-zinc-200/75 dark:border-white/[0.07] p-3.5 sm:p-4 space-y-2">
                              <div className="flex items-baseline justify-between gap-2">
                                <h4 className="font-display text-xs font-semibold text-zinc-950 dark:text-zinc-50">
                                  {t.scoringConfidenceHeading}
                                </h4>
                                <span className="font-mono text-xs font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">
                                  {t.confidenceLabels[evaluation.confidenceLevel]} ·{' '}
                                  {evaluation.confidencePct}%
                                </span>
                              </div>
                              <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
                                {isMy
                                  ? evaluation.confidenceExplanationMy
                                  : evaluation.confidenceExplanationEn}
                              </p>
                            </div>
                          </div>
                        </section>

                        {/* 7. 01. Why Choose This Product */}
                        <section className="pt-6 border-t border-zinc-200/80 dark:border-white/[0.08] space-y-2">
                          <h3 className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-50 leading-snug">
                            {t.sec01WhyChoose}
                          </h3>
                          <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                            {whyChoose}
                          </p>
                        </section>

                        {/* 8. 02. Market Demand & 03. Sales Potential */}
                        <section className="pt-6 border-t border-zinc-200/80 dark:border-white/[0.08] grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <div className="flex items-baseline justify-between gap-2">
                              <h3 className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-50 leading-snug">
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
                            <h3 className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-50 leading-snug">
                              {t.sec03SalesPotential}
                            </h3>
                            <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                              {salesPotential}
                            </p>
                          </div>
                        </section>

                        {/* 9. 04. Commission Rate & Earning per Sale */}
                        <section className="pt-6 border-t border-zinc-200/80 dark:border-white/[0.08] space-y-3">
                          <div className="flex items-center gap-1.5">
                            <h3 className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-50 leading-snug">
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
                          <div className="rounded-xl bg-[#F5F6F8] dark:bg-[#131823] border border-zinc-200/75 dark:border-white/[0.07] p-3.5 sm:p-4 flex flex-wrap items-baseline gap-6 sm:gap-8">
                            <div>
                              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                                {t.cardCommission}
                              </div>
                              <div className="mt-0.5 font-mono text-lg font-semibold tabular-nums">
                                {hasVerifiedCommission && product.commissionRate !== null ? (
                                  <span className="text-emerald-700 dark:text-[#10F5A0]">
                                    {product.commissionRate}%
                                  </span>
                                ) : (
                                  <span className="font-sans text-sm font-medium text-amber-700 dark:text-amber-300">
                                    {t.dataStatusLabels[effectiveCommissionStatus]}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div>
                              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                                {t.estEarningPerSale}
                              </div>
                              <div className="mt-0.5 font-mono text-lg font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums">
                                {earningPerOrderThb !== null ? formatThb(earningPerOrderThb) : '—'}
                              </div>
                            </div>
                          </div>
                        </section>

                        {/* 10. 05. Customer Review Strengths & 06. Complaints */}
                        <section
                          id="rep-reviews"
                          className="pt-6 border-t border-zinc-200/80 dark:border-white/[0.08] space-y-4"
                        >
                          {(typeof product.customerRating === 'number' ||
                            typeof product.reviewCount === 'number' ||
                            productQualityEvidence) && (
                            <div className="rounded-xl bg-[#F5F6F8] dark:bg-[#131823] border border-zinc-200/75 dark:border-white/[0.07] p-3.5 space-y-2 text-xs">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                                  {t.productQualityHeading}
                                </span>
                                <div className="flex items-center gap-2 font-mono tabular-nums text-zinc-700 dark:text-zinc-300">
                                  {typeof product.customerRating === 'number' &&
                                    product.customerRating > 0 && (
                                      <span className="inline-flex items-center gap-1 font-semibold text-zinc-950 dark:text-zinc-50">
                                        <Star
                                          className="w-3.5 h-3.5 text-amber-500 fill-amber-500"
                                          aria-hidden="true"
                                        />
                                        {product.customerRating.toFixed(1)}/5.0
                                      </span>
                                    )}
                                  {typeof product.reviewCount === 'number' &&
                                    product.reviewCount > 0 && (
                                      <span>
                                        ({product.reviewCount.toLocaleString('en-US')}{' '}
                                        {t.cardReviewsUnit})
                                      </span>
                                    )}
                                </div>
                              </div>
                              {productQualityEvidence && (
                                <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                                  {productQualityEvidence}
                                </p>
                              )}
                            </div>
                          )}

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                              <h3 className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-50 leading-snug">
                                {t.sec05ReviewStrengths}
                              </h3>
                              <ul className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed list-disc pl-4 marker:text-emerald-600 dark:marker:text-[#10F5A0]">
                                {reviewStrengths.map((item, idx) => (
                                  <li key={`${idx}-${item}`}>{item}</li>
                                ))}
                              </ul>
                            </div>

                            <div className="space-y-2">
                              <h3 className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-50 leading-snug">
                                {t.sec06CustomerComplaints}
                              </h3>
                              <ul className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed list-disc pl-4 marker:text-amber-500">
                                {customerComplaints.map((item, idx) => (
                                  <li key={`${idx}-${item}`}>{item}</li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </section>

                        {/* 11. 07. Competitor Landscape & 08. Seller Reliability */}
                        <section className="pt-6 border-t border-zinc-200/80 dark:border-white/[0.08] grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <div className="flex items-baseline justify-between gap-2">
                              <h3 className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-50 leading-snug">
                                {t.sec07CompetitorLandscape}
                              </h3>
                              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400 shrink-0">
                                {competitionUnavailable
                                  ? t.dataStatusLabels.unavailable
                                  : t.competitionLabels[product.competitionLevel]}
                              </span>
                            </div>
                            <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                              {competitionDetail}
                            </p>
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-baseline justify-between gap-2">
                              <h3 className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-50 leading-snug">
                                {t.sec08SellerReliability}
                              </h3>
                              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400 shrink-0">
                                {t.sellerReliabilityLabels[product.sellerReliabilityLevel]}
                              </span>
                            </div>
                            <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                              {sellerReliability}
                            </p>
                          </div>
                        </section>

                        {/* 12. 09. Product Risks + Category-Specific Audit */}
                        <section
                          id="rep-risks"
                          className="pt-6 border-t border-zinc-200/80 dark:border-white/[0.08] space-y-4"
                        >
                          <h3 className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-50 leading-snug">
                            {t.sec09ProductRisks}
                          </h3>

                          <ul className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed list-disc pl-4 marker:text-rose-500 dark:marker:text-[#FE2C55]">
                            {generalRisks.map((risk, idx) => (
                              <li key={`${idx}-${risk}`}>{risk}</li>
                            ))}
                          </ul>

                          {product.category === 'womens-fashion' && product.fashionReturnRisk && (
                            <div className="rounded-xl bg-[#F5F6F8] dark:bg-[#131823] border border-zinc-200/75 dark:border-white/[0.07] p-3.5 sm:p-4 space-y-3.5">
                              <div className="flex items-center gap-2">
                                <AlertTriangle
                                  className="w-4 h-4 text-amber-600 dark:text-amber-300 shrink-0"
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
                                    className="pt-3 border-t border-zinc-200/80 dark:border-white/[0.07] first:border-t-0 sm:first:border-t sm:border-t space-y-1"
                                  >
                                    <div className="flex items-center justify-between gap-2 text-xs">
                                      <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                                        {item.label}
                                      </span>
                                      <span
                                        className={`font-medium ${riskColorClass(item.data.level)}`}
                                      >
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

                          {product.category === 'cosmetics-beauty' &&
                            product.cosmeticsComplianceRisk && (
                              <div className="rounded-xl bg-[#F5F6F8] dark:bg-[#131823] border border-zinc-200/75 dark:border-white/[0.07] p-3.5 sm:p-4 space-y-3.5">
                                <div className="flex items-center gap-2">
                                  <ShieldAlert
                                    className="w-4 h-4 text-amber-600 dark:text-amber-300 shrink-0"
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
                                      className="pt-3 border-t border-zinc-200/80 dark:border-white/[0.07] first:pt-0 first:border-t-0 space-y-1"
                                    >
                                      <div className="flex items-center justify-between gap-2 text-xs">
                                        <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                                          {item.label}
                                        </span>
                                        <span
                                          className={`inline-flex items-center gap-1 font-medium ${verificationColorClass(
                                            item.data.status
                                          )}`}
                                        >
                                          {item.data.status === 'Verified' && (
                                            <ShieldCheck
                                              className="w-3.5 h-3.5"
                                              aria-hidden="true"
                                            />
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

                        {/* 13. 10. AI Video Advertising Potential & 11. 3 Video Content Ideas */}
                        <section
                          id="rep-video"
                          className="pt-6 border-t border-zinc-200/80 dark:border-white/[0.08] space-y-5"
                        >
                          <div className="space-y-2">
                            <div className="flex items-baseline justify-between gap-2">
                              <h3 className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-50 leading-snug">
                                {t.sec10AiVideoPotential}
                              </h3>
                              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400 shrink-0">
                                {t.aiVideoLabels[product.aiVideoSuitability]}
                              </span>
                            </div>
                            <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                              {aiVideoDetail}
                            </p>
                          </div>

                          <div className="space-y-2.5">
                            <h3 className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-50 leading-snug">
                              {t.sec11VideoContentIdeas}
                            </h3>
                            <ol className="divide-y divide-zinc-200/80 dark:divide-white/[0.07] border-y border-zinc-200/80 dark:border-white/[0.08]">
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
                                      <span
                                        className="text-xs text-zinc-400 dark:text-zinc-500"
                                        aria-hidden="true"
                                      >
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

                        {/* 14. 12. Research Sources, Last Updated, 13. Confidence, 14. Missing Data */}
                        <section
                          id="rep-sources"
                          className="pt-6 border-t border-zinc-200/80 dark:border-white/[0.08] space-y-5"
                        >
                          <div className="flex flex-wrap items-baseline justify-between gap-2 pb-2 border-b border-zinc-100 dark:border-white/[0.06] text-xs text-zinc-500 dark:text-zinc-400">
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
                            <h3 className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-50 leading-snug">
                              {t.sec12ResearchSources}
                            </h3>
                            <ul className="space-y-2">
                              {tiktokShopUrl &&
                                !product.sources.some(
                                  (s) =>
                                    s.url === tiktokShopUrl ||
                                    isLegacyOrSluglessTikTokUrl(s.url) ||
                                    (typeof s.url === 'string' &&
                                      s.url.includes('shop.tiktok.com/th/pdp/'))
                                ) && (
                                  <li className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 py-2 border-b border-zinc-100 dark:border-white/[0.06] text-xs">
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
                                      className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-[#10F5A0] hover:underline whitespace-nowrap shrink-0"
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
                                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 py-2 border-b border-zinc-100 dark:border-white/[0.06] last:border-b-0 text-xs"
                                  >
                                    <div className="text-zinc-700 dark:text-zinc-300 min-w-0">
                                      <span className="font-medium text-zinc-900 dark:text-zinc-100">
                                        {isMy ? src.labelMy : src.labelEn}
                                      </span>{' '}
                                      <span className="text-zinc-500 dark:text-zinc-400">
                                        · {src.sourceType}
                                      </span>
                                    </div>

                                    {src.verified && isSafeHttpUrl(resolvedSourceUrl) ? (
                                      <a
                                        href={resolvedSourceUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 font-medium text-cyan-700 dark:text-[#25F4EE] hover:underline whitespace-nowrap shrink-0"
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

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-zinc-100 dark:border-white/[0.06]">
                            <div className="space-y-1.5">
                              <div className="flex items-baseline justify-between gap-2">
                                <h3 className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-50 leading-snug">
                                  {t.sec13ConfidenceLevel}
                                </h3>
                                <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                                  {t.confidenceLabels[evaluation.confidenceLevel]}
                                </span>
                              </div>
                              <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                                {confidenceDetail}
                              </p>
                            </div>

                            <div className="space-y-1.5">
                              <h3 className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-50 leading-snug">
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
                      </motion.div>
                    )}

                    {activeTab === 'same-product' && (
                      <motion.div
                        key="tab-same-product"
                        role="tabpanel"
                        id="drawer-tabpanel-same-product"
                        aria-labelledby="drawer-tab-same-product"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={MOTION_TRANSITIONS.crossFade}
                      >
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
                          onSearchResultChange={(res) => {
                            setSameProductExactCount(
                              res
                                ? res.candidates.filter((c) => c.matchTier === 'exact-same').length
                                : 0
                            );
                          }}
                        />
                      </motion.div>
                    )}

                    {activeTab === 'ai' && (
                      <motion.div
                        key="tab-ai"
                        role="tabpanel"
                        id="drawer-tabpanel-ai"
                        aria-labelledby="drawer-tab-ai"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={MOTION_TRANSITIONS.crossFade}
                        className="space-y-2"
                      >
                        <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                          {t.reportAiTag}
                        </div>
                        <AiProductAnalysisSection
                          product={product}
                          evaluation={evaluation}
                          salesWeightPct={salesWeightPct}
                          peerProducts={peerProducts}
                          language={language}
                          onAnalysisReady={(nextAnalysis) => {
                            setActiveAiAnalysis(nextAnalysis);
                            if (
                              nextAnalysis &&
                              nextAnalysis.source === 'gemini' &&
                              !nextAnalysis.geminiFailed
                            ) {
                              onAiAnalysisSaved?.(product.id, nextAnalysis);
                            }
                          }}
                        />
                      </motion.div>
                    )}

                    {activeTab === 'enrichment' && (
                      <motion.div
                        key="tab-enrichment"
                        role="tabpanel"
                        id="drawer-tabpanel-enrichment"
                        aria-labelledby="drawer-tab-enrichment"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={MOTION_TRANSITIONS.crossFade}
                      >
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
                          onProductEnriched={(updatedProd, shopDetail, summary) => {
                            setEnrichmentRevision((r) => r + 1);
                            onProductEnriched?.(updatedProd, shopDetail, summary);
                          }}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* SLIM STICKY DECISION FOOTER */}
                <div className="shrink-0 z-10 bg-white/95 dark:bg-[#0E1118]/95 backdrop-blur-md border-t border-zinc-200/80 dark:border-white/[0.08] px-4 sm:px-6 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] flex items-center gap-2">
                  {/* Reject / Restore */}
                  <motion.button
                    type="button"
                    whileTap={TACTILE_INTERACTIONS.buttonTap}
                    onClick={() => onReject(product.id)}
                    className={`inline-flex items-center justify-center gap-1.5 min-h-[40px] sm:min-h-[42px] px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      isRejected
                        ? 'bg-zinc-100 dark:bg-[#131823] text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-white/[0.14] hover:bg-zinc-200 dark:hover:bg-white/[0.08]'
                        : 'bg-white dark:bg-[#131823] text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-white/[0.1] hover:border-rose-300 dark:hover:border-[#FE2C55]/50 hover:text-rose-700 dark:hover:text-[#FE2C55] hover:bg-rose-50/40 dark:hover:bg-[#FE2C55]/10'
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
                  </motion.button>

                  {/* Primary Save CTA */}
                  <motion.button
                    type="button"
                    whileTap={TACTILE_INTERACTIONS.buttonTap}
                    onClick={() => onSave(product.id)}
                    className={`flex-1 inline-flex items-center justify-center gap-1.5 sm:gap-2 min-h-[40px] sm:min-h-[42px] px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                      isSaved
                        ? 'bg-emerald-600 dark:bg-[#10F5A0] text-white dark:text-[#06070A] hover:bg-emerald-700 dark:hover:bg-[#34F7B0]'
                        : 'sp-btn-volt !w-auto'
                    }`}
                  >
                    <Bookmark
                      className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${isSaved ? 'fill-current' : ''}`}
                      aria-hidden="true"
                    />
                    <span>{isSaved ? t.btnSavedProduct : t.btnSaveProduct}</span>
                  </motion.button>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
    </AnimatePresence>
  );
}
