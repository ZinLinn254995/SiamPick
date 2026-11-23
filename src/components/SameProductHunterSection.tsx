import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bookmark,
  Check,
  Copy,
  ExternalLink,
  Eye,
  Layers,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  Store,
  TrendingUp,
  Users,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type {
  Language,
  ProductEnrichmentExecutionSummary,
  ResearchProduct,
} from '../types/product';
import type {
  SameProductCandidate,
  SameProductEarlyMoverBadge,
  SameProductKeywordSuggestionResponse,
  SameProductMatchTier,
  SameProductSearchResponse,
} from '../types/sameProduct';
import {
  formatThb,
  isSafeHttpUrl,
  resolveProductImageDisplayConfig,
} from '../utils/format';
import {
  formatCredits,
  formatUsd,
  KALODATA_CREDITS_PER_100_ROWS,
  KALODATA_PRODUCT_DETAIL_CREDIT,
  KALODATA_SHOP_DETAIL_CREDIT,
  KALODATA_USD_PER_CREDIT,
} from '../utils/kalodataPricing';
import { getCanonicalProductId } from '../utils/scoring';
import {
  getCachedEnrichmentForProduct,
  saveEnrichmentToCache,
} from '../utils/enrichmentCache';
import {
  applyEnrichedProductToSameCandidate,
  buildDeterministicKeywordSuggestions,
  sortSameProductCandidates,
} from '../utils/sameProductMatcher';
import {
  MOTION_TRANSITIONS,
  MOTION_VARIANTS,
  TACTILE_INTERACTIONS,
} from '../utils/motionPresets';
import { ProductImage } from './ProductImage';
import { InfoPopover } from './InfoPopover';
import { InlineDailyBudgetGuard } from './InlineDailyBudgetGuard';
import { StateMessage } from './visual';

export interface SameProductHunterSectionProps {
  product: ResearchProduct;
  spendingLimitCredits: number;
  serverBudgetCommittedCredits?: number | null;
  serverBudgetRemainingCredits?: number | null;
  budgetStorageAvailable?: boolean;
  onSpendingLimitChange?: (nextLimit: number) => void;
  salesWeightPct: number;
  language: Language;
  savedProductIds?: ReadonlySet<string>;
  onSaveCandidate?: (candidateProduct: ResearchProduct) => void;
  onOpenDeepDive?: (candidateProduct: ResearchProduct) => void;
  onCreditsSpent?: () => void;
  onSearchResultChange?: (result: SameProductSearchResponse | null) => void;
}

// Lightweight session memory cache so reopening the drawer for the same product restores results at 0 cr
const clientSameProductSessionCache = new Map<string, SameProductSearchResponse>();

export function getCachedSameProductSearchResult(
  canonicalProductId: string
): SameProductSearchResponse | null {
  return clientSameProductSessionCache.get(canonicalProductId) ?? null;
}

const PRICE_TOLERANCE_OPTIONS = [25, 35, 50] as const;

function matchTierBadgeClasses(tier: SameProductMatchTier): string {
  if (tier === 'exact-same') {
    return 'bg-emerald-500/12 dark:bg-[#10F5A0]/12 border-emerald-500/30 dark:border-[#10F5A0]/30 text-emerald-700 dark:text-[#10F5A0]';
  }
  if (tier === 'close-variant') {
    return 'bg-amber-500/10 dark:bg-amber-400/10 border-amber-500/25 dark:border-amber-400/25 text-amber-700 dark:text-amber-300';
  }
  return 'bg-zinc-100 dark:bg-white/[0.05] border-zinc-200/80 dark:border-white/[0.1] text-zinc-600 dark:text-zinc-300';
}

function matchTierLabel(tier: SameProductMatchTier, isMy: boolean): string {
  if (tier === 'exact-same') {
    return isMy ? 'ချွတ်စွပ်တူ (Exact Same)' : 'Exact Same Product';
  }
  if (tier === 'close-variant') {
    return isMy ? 'ပုံစံတူ · Set/အရောင်ကွဲ' : 'Close Variant';
  }
  return isMy ? 'ပုံမျက်မြင်စစ်ဆေးရန်' : 'Verify Visually';
}

function earlyMoverColor(badge: SameProductEarlyMoverBadge): string {
  if (badge === 'early-mover') return 'text-emerald-700 dark:text-[#10F5A0]';
  if (badge === 'low-video-gap') return 'text-cyan-700 dark:text-[#25F4EE]';
  if (badge === 'saturated') return 'text-rose-700 dark:text-[#FE2C55]';
  return 'text-zinc-600 dark:text-zinc-400';
}

function earlyMoverLabel(badge: SameProductEarlyMoverBadge, isMy: boolean): string {
  if (badge === 'early-mover') {
    return isMy ? 'ခြေလှမ်းဦးနိုင် (Early-Mover)' : 'Early-Mover Advantage';
  }
  if (badge === 'low-video-gap') {
    return isMy ? 'Video ပြိုင်ဆိုင်မှုနည်းသေး' : 'Low Video Competition';
  }
  if (badge === 'saturated') {
    return isMy ? 'Creator ပြိုင်ဆိုင်မှုများနေပြီ' : 'High Creator Competition';
  }
  return isMy ? 'နှိုင်းယှဉ်စဉ်းစားနိုင်' : 'Comparable Listing';
}

/**
 * Computes verified-only Commission Arbitrage Gain for an exact same-product match.
 * Strictly returns `null` if either the source product OR the candidate lacks
 * verified commission data, or if the candidate does not offer a higher commission rate.
 */
function computeVerifiedCommissionArbitrage(
  sourceProduct: ResearchProduct,
  candidate: SameProductCandidate
): {
  commGainPct: number;
  thbGainPerOrder: number | null;
} | null {
  if (candidate.matchTier !== 'exact-same') return null;

  const sourceVerified =
    Boolean(sourceProduct.commissionVerified) &&
    typeof sourceProduct.commissionRate === 'number' &&
    Number.isFinite(sourceProduct.commissionRate) &&
    sourceProduct.commissionRate > 0;

  const candProduct = candidate.researchProduct;
  const candidateRate =
    typeof candidate.commissionRate === 'number' && Number.isFinite(candidate.commissionRate)
      ? candidate.commissionRate
      : candProduct?.commissionRate ?? null;

  const candidateVerified =
    Boolean(candProduct?.commissionVerified) &&
    typeof candidateRate === 'number' &&
    Number.isFinite(candidateRate) &&
    candidateRate > 0;

  if (!sourceVerified || !candidateVerified || sourceProduct.commissionRate === null || candidateRate === null) {
    return null;
  }

  const commGainPct = Math.round((candidateRate - sourceProduct.commissionRate) * 10) / 10;
  if (commGainPct <= 0) return null;

  const resolveVerifiedPerOrderThb = (
    p: ResearchProduct,
    explicitPerSale: number | null,
    rate: number,
    price: number | null
  ): number | null => {
    const status = p.commissionPerSaleStatus;
    const explicitOk =
      typeof explicitPerSale === 'number' &&
      Number.isFinite(explicitPerSale) &&
      explicitPerSale > 0 &&
      status !== 'estimated' &&
      status !== 'unverified' &&
      status !== 'unavailable';
    if (explicitOk) return explicitPerSale;

    if (
      p.priceStatus === 'verified' &&
      typeof price === 'number' &&
      Number.isFinite(price) &&
      price > 0
    ) {
      return Math.round((price * rate) / 100);
    }
    return null;
  };

  const sourcePerOrder = resolveVerifiedPerOrderThb(
    sourceProduct,
    sourceProduct.estimatedCommissionPerSaleThb ?? null,
    sourceProduct.commissionRate,
    sourceProduct.priceThb
  );
  const candPerOrder = resolveVerifiedPerOrderThb(
    candProduct,
    candidate.estimatedCommissionPerSaleThb ?? candProduct.estimatedCommissionPerSaleThb ?? null,
    candidateRate,
    candidate.priceThb ?? candProduct.priceThb
  );

  const thbDelta =
    sourcePerOrder !== null && candPerOrder !== null && candPerOrder > sourcePerOrder
      ? Math.round(candPerOrder - sourcePerOrder)
      : null;

  return {
    commGainPct,
    thbGainPerOrder: thbDelta,
  };
}

export function SameProductHunterSection({
  product,
  spendingLimitCredits,
  serverBudgetCommittedCredits,
  serverBudgetRemainingCredits,
  budgetStorageAvailable = true,
  onSpendingLimitChange,
  salesWeightPct,
  language,
  savedProductIds,
  onSaveCandidate,
  onOpenDeepDive,
  onCreditsSpent,
  onSearchResultChange,
}: SameProductHunterSectionProps) {
  const isMy = language === 'my';
  const canonicalSourceId = getCanonicalProductId(product);
  const deterministic = useMemo(
    () => buildDeterministicKeywordSuggestions(product),
    [product.id, product.name, product.brand]
  );

  const [keyword, setKeyword] = useState<string>(deterministic.primaryKeyword);
  const [suggestedKeywords, setSuggestedKeywords] = useState<string[]>(deterministic.suggestions);
  const [loadingKeywords, setLoadingKeywords] = useState(false);

  const [priceTolerancePct, setPriceTolerancePct] = useState<number>(35);
  const [enableVisualVerification, setEnableVisualVerification] = useState<boolean>(true);
  const [includeCloseVariants, setIncludeCloseVariants] = useState<boolean>(true);
  const [includeZeroSales, setIncludeZeroSales] = useState<boolean>(false);
  const [useCategoryFilter, setUseCategoryFilter] = useState<boolean>(true);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchResult, setSearchResult] = useState<SameProductSearchResponse | null>(
    () => clientSameProductSessionCache.get(canonicalSourceId) ?? null
  );

  // Per-candidate Stage 2 Creator & Shop Trust verification state
  const [activeStage2ConfirmId, setActiveStage2ConfirmId] = useState<string | null>(null);
  const [stage2IncludeShop, setStage2IncludeShop] = useState<boolean>(false);
  const [stage2LoadingId, setStage2LoadingId] = useState<string | null>(null);
  const [stage2Errors, setStage2Errors] = useState<Record<string, string>>({});
  const [copiedCandidateId, setCopiedCandidateId] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setKeyword(deterministic.primaryKeyword);
    setSuggestedKeywords(deterministic.suggestions);
    setConfirmOpen(false);
    setErrorMsg(null);
    setActiveStage2ConfirmId(null);
    setStage2Errors({});
    const cached = clientSameProductSessionCache.get(canonicalSourceId) ?? null;
    setSearchResult(cached);
    onSearchResultChange?.(cached);
  }, [canonicalSourceId, deterministic]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const sourceImageConfig = useMemo(() => resolveProductImageDisplayConfig(product), [product]);

  const handleSuggestKeywords = async () => {
    if (loadingKeywords) return;
    setLoadingKeywords(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/same-product/keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product, useGemini: true }),
      });
      const data = (await res.json()) as Partial<SameProductKeywordSuggestionResponse> & {
        error?: string;
        errorMy?: string;
      };
      if (res.ok && data.ok && Array.isArray(data.suggestions) && data.suggestions.length > 0) {
        setSuggestedKeywords(data.suggestions);
        if (data.primaryKeyword) {
          setKeyword(data.primaryKeyword);
        }
      }
    } catch {
      // Deterministic suggestions already present — stay silent & usable
    } finally {
      setLoadingKeywords(false);
    }
  };

  const handleRunSearch = async (forceRefresh = false) => {
    const trimmed = keyword.trim();
    if (trimmed.length < 2) {
      setErrorMsg(
        isMy
          ? 'ရှာဖွေမည့် Keyword ကို အနည်းဆုံး စာလုံး 2 လုံး ထည့်သွင်းပါ။'
          : 'Please enter at least 2 characters for the search keyword.'
      );
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsSearching(true);
    setConfirmOpen(false);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/same-product/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          product,
          keyword: trimmed,
          priceTolerancePct,
          includeCloseVariants: true, // Fetch both so user can toggle instantly client-side at 0 cr
          includeZeroSales: true, // Same: filter zero-sales instantly client-side at 0 cr
          enableVisualVerification,
          useCategoryFilter,
          spendingLimitCredits,
          userConfirmedPaidExecution: true,
          forceRefresh,
        }),
      });

      const contentType = res.headers.get('content-type') ?? '';
      const data = contentType.includes('application/json')
        ? ((await res.json().catch(() => null)) as
            | SameProductSearchResponse
            | { ok: false; error?: string; errorMy?: string; code?: string }
            | null)
        : null;

      if (!res.ok || !data || !data.ok) {
        if (res.status === 400 || res.status === 503) {
          onCreditsSpent?.();
        }
        const errPayload = data as { error?: string; errorMy?: string } | null;
        if (!data) {
          setErrorMsg(
            isMy
              ? 'Server တုံ့ပြန်မှု ယာယီပြတ်တောက်နေပါသည်။ စာမျက်နှာကို Refresh လုပ်ပြီး ထပ်မံစမ်းသပ်ပါ။'
              : 'Server returned an unexpected non-JSON response. Please refresh the page and try again.'
          );
          return;
        }
        setErrorMsg(
          isMy
            ? (errPayload?.errorMy ?? errPayload?.error ?? `Same-Product ရှာဖွေမှု မအောင်မြင်ပါ (HTTP ${res.status})။`)
            : (errPayload?.error ?? `Same-Product search failed (HTTP ${res.status}).`)
        );
        return;
      }

      clientSameProductSessionCache.set(canonicalSourceId, data);
      setSearchResult(data);
      onSearchResultChange?.(data);
      if (data.creditsSpent > 0) {
        onCreditsSpent?.();
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return;
      setErrorMsg(
        isMy
          ? 'Server နှင့် ချိတ်ဆက်၍ မရပါ။ ထပ်မံစမ်းသပ်ပါ။'
          : 'Unable to reach server for Same-Product search. Please try again.'
      );
    } finally {
      setIsSearching(false);
    }
  };

  const handleVerifyCandidateStage2 = async (candidate: SameProductCandidate) => {
    if (stage2LoadingId) return;
    setStage2LoadingId(candidate.productId);
    setStage2Errors((prev) => {
      const next = { ...prev };
      delete next[candidate.productId];
      return next;
    });

    try {
      const cached = getCachedEnrichmentForProduct(candidate.researchProduct);
      const res = await fetch('/api/enrich-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product: candidate.researchProduct,
          requestedLayers: {
            productDetail: true,
            shopDetail: stage2IncludeShop && Boolean(candidate.shopId),
            reviewInsights: false,
          },
          spendingLimitCredits,
          salesWeightPct,
          requireExplicitConfirmation: true,
          userConfirmedPaidExecution: true,
          clientCachedProductDetail: cached.productDetail,
          clientCachedShopDetail: cached.shopDetail,
          clientCachedReviewInsight: cached.reviewInsight,
        }),
      });

      const payload = (await res.json().catch(() => null)) as {
        ok?: boolean;
        product?: ResearchProduct;
        productDetail?: Parameters<typeof saveEnrichmentToCache>[0]['productDetail'];
        shopDetail?: Parameters<typeof saveEnrichmentToCache>[0]['shopDetail'];
        summary?: ProductEnrichmentExecutionSummary;
        error?: string;
        errorMy?: string;
      } | null;

      if (!res.ok || !payload?.ok || !payload.product) {
        if (res.status === 400 || res.status === 503) {
          onCreditsSpent?.();
        }
        setStage2Errors((prev) => ({
          ...prev,
          [candidate.productId]: isMy
            ? (payload?.errorMy ?? payload?.error ?? `Creator အရေအတွက် စစ်ဆေးမှု မအောင်မြင်ပါ (HTTP ${res.status})။`)
            : (payload?.error ?? `Failed to verify creator count (HTTP ${res.status}).`),
        }));
        return;
      }

      saveEnrichmentToCache({
        productDetail: payload.productDetail ?? null,
        shopDetail: payload.shopDetail ?? null,
      });

      const updatedCandidate = applyEnrichedProductToSameCandidate(
        product,
        candidate,
        payload.product
      );

      setSearchResult((prev) => {
        if (!prev) return prev;
        const nextCandidates = sortSameProductCandidates(
          prev.candidates.map((c) =>
            c.productId === candidate.productId ? updatedCandidate : c
          )
        );
        const updatedResult: SameProductSearchResponse = {
          ...prev,
          candidates: nextCandidates,
        };
        clientSameProductSessionCache.set(canonicalSourceId, updatedResult);
        onSearchResultChange?.(updatedResult);
        return updatedResult;
      });

      setActiveStage2ConfirmId(null);
      if (payload.summary && payload.summary.actualApiCalls > 0) {
        onCreditsSpent?.();
      }
    } catch {
      setStage2Errors((prev) => ({
        ...prev,
        [candidate.productId]: isMy
          ? 'Creator စစ်ဆေးစဉ် Network အမှားဖြစ်ပွားပါသည်။'
          : 'Network error while verifying creator count.',
      }));
    } finally {
      setStage2LoadingId(null);
    }
  };

  // Client-side instant toggles (0 credits) over returned candidates
  const visibleCandidates = useMemo(() => {
    if (!searchResult) return [];
    return searchResult.candidates.filter((c) => {
      if (!includeCloseVariants && c.matchTier === 'close-variant') return false;
      if (!includeZeroSales && (c.salesVolume === null || c.salesVolume <= 0)) return false;
      return true;
    });
  }, [searchResult, includeCloseVariants, includeZeroSales]);

  const exactCount = useMemo(
    () => visibleCandidates.filter((c) => c.matchTier === 'exact-same').length,
    [visibleCandidates]
  );
  const closeVariantCount = useMemo(
    () => visibleCandidates.filter((c) => c.matchTier === 'close-variant').length,
    [visibleCandidates]
  );

  const stage1CostCredits = KALODATA_CREDITS_PER_100_ROWS;
  const stage1CostLabel = `${formatCredits(stage1CostCredits)} cr (~${formatUsd(
    stage1CostCredits * KALODATA_USD_PER_CREDIT
  )})`;

  const safeUsedToday =
    typeof serverBudgetCommittedCredits === 'number' && Number.isFinite(serverBudgetCommittedCredits)
      ? Math.max(0, serverBudgetCommittedCredits)
      : 0;
  const effectiveRemainingBudget =
    typeof serverBudgetRemainingCredits === 'number' && Number.isFinite(serverBudgetRemainingCredits)
      ? Math.max(0, serverBudgetRemainingCredits)
      : Math.max(0, Math.round((spendingLimitCredits - safeUsedToday) * 1000) / 1000);
  const stage1BlockedByBudget =
    !budgetStorageAvailable || stage1CostCredits > effectiveRemainingBudget + 1e-6;

  return (
    <section
      id="rep-same-product"
      className="scroll-mt-4 space-y-4"
    >
      {/* Section Heading */}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="font-display text-sm sm:text-base font-bold text-zinc-950 dark:text-zinc-50 leading-snug">
              {isMy
                ? 'ချွတ်စွပ်တူ Product · ဆိုင်ကွဲ Affiliate Arbitrage ရှာရန်'
                : 'Same Product · Different Shop Arbitrage'}
            </h3>
            <InfoPopover
              variant="help"
              label={isMy ? 'Same-Product ရှာဖွေပုံ' : 'How Same-Product hunting works'}
              title={
                isMy
                  ? 'Same-Product Early-Mover Link ရှာဖွေမှု'
                  : 'Exact Same Product · Early-Mover Link Hunter'
              }
              content={
                isMy
                  ? 'မူလ Winning Product နှင့် ပစ္စည်းချွတ်စွပ်တူသော တခြားထိုင်း TikTok Shop ဆိုင် Link များကို Kalodata (0.1 cr) ဖြင့် ရှာဖွေပြီး Gemini AI ပုံတိုက်စစ်မှု (0 Kalodata cr) ဖြင့် မတူသောပစ္စည်းများကို ဖယ်ထုတ်ကာ Creator ပြိုင်ဆိုင်မှုနည်းသေးသော / ကော်မရှင်ပိုများသော Link များကို ဦးစားပေးစီပြပေးပါသည်။'
                  : 'Searches Thailand TikTok Shop affiliate listings (0.1 cr, 24h cached) for the exact same physical product sold by different shops, uses Gemini Vision (0 Kalodata cr) to filter out unrelated items, and highlights verified commission arbitrage and lower creator saturation.'
              }
            />
          </div>
          <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
            {isMy
              ? 'တူညီသောပစ္စည်းတစ်မျိုးတည်းကို ရောင်းချသည့် တခြားဆိုင် Link များ (မဆိုင်သောအစားထိုးပစ္စည်း မဟုတ်)'
              : 'Hunts the exact same physical product across different TikTok Shop stores — never unrelated alternatives.'}
          </p>
        </div>

        <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400 tabular-nums shrink-0">
          {stage1CostLabel}
        </span>
      </div>

      {/* Clear Identity Distinction Banner (Exact Same vs Close Variant / Unverified) */}
      <div className="rounded-xl bg-[#F5F6F8] dark:bg-[#131823] border border-zinc-200/80 dark:border-white/[0.08] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <Store className="w-3.5 h-3.5 text-emerald-600 dark:text-[#10F5A0] shrink-0" aria-hidden="true" />
          <span className="font-medium text-zinc-800 dark:text-zinc-200 leading-snug">
            {isMy
              ? 'ပစ္စည်းချွတ်စွပ်တူ · ဆိုင်မတူ Affiliate Link နှိုင်းယှဉ်စနစ်'
              : 'Exact Same SKU · Cross-Shop Commission & Creator Comparison'}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <span className="inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-semibold leading-snug bg-emerald-500/12 dark:bg-[#10F5A0]/12 border-emerald-500/30 dark:border-[#10F5A0]/30 text-emerald-700 dark:text-[#10F5A0]">
            {isMy ? 'Exact Same = ပစ္စည်းတူ' : 'Exact Same Match'}
          </span>
          <span className="inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-medium leading-snug bg-amber-500/10 dark:bg-amber-400/10 border-amber-500/25 dark:border-amber-400/25 text-amber-700 dark:text-amber-300">
            {isMy ? 'Variant / စစ်ဆေးရန်' : 'Variant / Unverified'}
          </span>
        </div>
      </div>

      {/* Controls Container (Obsidian Volt / Porcelain Pro single-elevation surface) */}
      <div className="relative rounded-xl bg-[#F5F6F8] dark:bg-[#131823] border border-zinc-200/80 dark:border-white/[0.08] p-3.5 sm:p-4 space-y-3.5 overflow-hidden">
        {/* Active Scan Beam Rail */}
        {isSearching && (
          <div
            aria-hidden="true"
            className="absolute top-0 inset-x-0 h-[2px] overflow-hidden bg-cyan-500/15 dark:bg-[#25F4EE]/15"
          >
            <div className="sp-scan-beam h-full w-1/2 bg-gradient-to-r from-transparent via-[#25F4EE] to-[#10F5A0]" />
          </div>
        )}

        {/* Editable Core Keyword Input + AI Keyword Button */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label
              htmlFor={`same-product-kw-${canonicalSourceId}`}
              className="text-xs font-medium text-zinc-700 dark:text-zinc-300 leading-snug"
            >
              {isMy ? 'အဓိက Product Keyword (ပြင်ဆင်နိုင်သည်)' : 'Core Product Keyword (editable)'}
            </label>
            <motion.button
              type="button"
              whileTap={TACTILE_INTERACTIONS.buttonTap}
              onClick={handleSuggestKeywords}
              disabled={loadingKeywords || isSearching}
              className="inline-flex items-center gap-1 min-h-[32px] py-1 text-xs font-medium text-cyan-700 dark:text-[#25F4EE] hover:text-cyan-900 dark:hover:text-[#7CF9F5] disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
            >
              {loadingKeywords ? (
                <Loader2 className="w-3 h-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              ) : (
                <Sparkles className="w-3 h-3" aria-hidden="true" />
              )}
              <span>
                {isMy ? 'AI Keyword အကြံပြု (0 Kalodata cr)' : 'AI Suggest Keywords (0 Kalodata cr)'}
              </span>
            </motion.button>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <input
              id={`same-product-kw-${canonicalSourceId}`}
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              maxLength={80}
              placeholder={
                isMy
                  ? 'ဥပမာ — ထိုင်း/အင်္ဂလိပ် ပစ္စည်းအမည် အဓိကစကားလုံး'
                  : 'Enter core Thai or English product keyword'
              }
              className="flex-1 min-h-[40px] px-3 py-2 text-xs rounded-lg bg-white dark:bg-[#0E1118] border border-zinc-300 dark:border-white/[0.12] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-600/25 dark:focus:ring-[#10F5A0]/30"
            />
            <motion.button
              type="button"
              whileTap={TACTILE_INTERACTIONS.buttonTap}
              onClick={() => setConfirmOpen(true)}
              disabled={isSearching || keyword.trim().length < 2}
              className="sp-btn-volt !px-4 text-xs disabled:opacity-50 whitespace-nowrap shrink-0 transition-colors"
            >
              {isSearching ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none shrink-0" aria-hidden="true" />
              ) : (
                <Search className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              )}
              <span>
                {isSearching
                  ? isMy
                    ? 'ရှာဖွေ + ပုံတိုက်စစ်နေသည်...'
                    : 'Searching & Matching...'
                  : isMy
                    ? 'Same Product Link ရှာမည် (0.1 cr)'
                    : 'Find Same-Product Links (0.1 cr)'}
              </span>
            </motion.button>
          </div>

          {/* Clickable Keyword Suggestions */}
          {suggestedKeywords.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <span className="text-xs text-zinc-600 dark:text-zinc-400">
                {isMy ? 'အကြံပြု:' : 'Try:'}
              </span>
              {suggestedKeywords.map((kw) => {
                const isSelected = keyword.trim().toLowerCase() === kw.toLowerCase();
                return (
                  <motion.button
                    key={kw}
                    type="button"
                    whileTap={TACTILE_INTERACTIONS.buttonTap}
                    onClick={() => setKeyword(kw)}
                    className={`inline-flex items-center min-h-[32px] px-2.5 py-1 text-xs rounded-lg transition-colors cursor-pointer max-w-[200px] truncate leading-snug ${
                      isSelected
                        ? 'bg-emerald-600 dark:bg-[#10F5A0] text-white dark:text-[#06070A] font-semibold'
                        : 'bg-white dark:bg-[#0E1118] text-zinc-700 dark:text-zinc-300 border border-zinc-200/90 dark:border-white/[0.1] hover:text-zinc-950 dark:hover:text-zinc-50'
                    }`}
                  >
                    {kw}
                  </motion.button>
                );
              })}
            </div>
          )}
        </div>

        {/* Filter Controls Strip */}
        <div className="pt-3 border-t border-zinc-200/75 dark:border-white/[0.08] flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Price Band Segmented Control */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
              {isMy ? 'ဈေးကွာဟချက်:' : 'Price band:'}
            </span>
            <div className="sp-segmented">
              {PRICE_TOLERANCE_OPTIONS.map((pct) => (
                <button
                  key={pct}
                  type="button"
                  data-active={priceTolerancePct === pct ? 'true' : 'false'}
                  onClick={() => setPriceTolerancePct(pct)}
                  className="sp-segmented-item !min-h-[32px] !py-1 !px-2.5 font-mono tabular-nums whitespace-nowrap"
                >
                  ±{pct}%
                </button>
              ))}
            </div>
          </div>

          {/* Toggles */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-zinc-700 dark:text-zinc-300">
            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={enableVisualVerification}
                onChange={(e) => setEnableVisualVerification(e.target.checked)}
                className="rounded border-zinc-300 dark:border-zinc-600 accent-emerald-600 dark:accent-[#10F5A0]"
              />
              <span>{isMy ? 'AI ပုံတိုက်စစ် (0 cr)' : 'AI Visual Match (0 cr)'}</span>
            </label>

            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={useCategoryFilter}
                onChange={(e) => setUseCategoryFilter(e.target.checked)}
                className="rounded border-zinc-300 dark:border-zinc-600 accent-emerald-600 dark:accent-[#10F5A0]"
              />
              <span>{isMy ? 'Category တူသာ' : 'Same Category'}</span>
            </label>

            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeCloseVariants}
                onChange={(e) => setIncludeCloseVariants(e.target.checked)}
                className="rounded border-zinc-300 dark:border-zinc-600 accent-emerald-600 dark:accent-[#10F5A0]"
              />
              <span>{isMy ? 'Set/အရောင်ကွဲ ပါပြမည်' : 'Include Close Variants'}</span>
            </label>

            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeZeroSales}
                onChange={(e) => setIncludeZeroSales(e.target.checked)}
                className="rounded border-zinc-300 dark:border-zinc-600 accent-emerald-600 dark:accent-[#10F5A0]"
              />
              <span>{isMy ? 'ရောင်းအား 0 Link အသစ်ပါပြမည်' : 'Include 0-Sale New Links'}</span>
            </label>
          </div>
        </div>

        {/* Explicit Credit Confirmation Bar (Before Paid Call) */}
        <AnimatePresence initial={false}>
          {confirmOpen && !isSearching && (
            <motion.div
              initial={{ opacity: 0, height: 0, overflow: 'hidden' }}
              animate={{
                opacity: 1,
                height: 'auto',
                transitionEnd: { overflow: 'visible' },
              }}
              exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
              transition={MOTION_TRANSITIONS.accordion}
            >
              <div className="p-3 rounded-lg bg-white dark:bg-[#0E1118] border border-zinc-300 dark:border-white/[0.12] space-y-2.5 text-xs">
                <div className="text-zinc-800 dark:text-zinc-200 leading-relaxed">
                  {isMy ? (
                    <>
                      Kalodata Product Rank 1 ကြိမ် (<strong className="font-mono">0.1 cr</strong>) ဖြင့်{' '}
                      <strong className="text-zinc-950 dark:text-zinc-50">“{keyword.trim()}”</strong> ကို ရှာဖွေပြီး
                      မူလဆိုင်မဟုတ်သော Affiliate Link များကို{' '}
                      {enableVisualVerification
                        ? 'Gemini AI ပုံတိုက်စစ်မှု (0 Kalodata cr)'
                        : 'နာမည်နှင့် ဈေးတူညီမှု'}{' '}
                      ဖြင့် စစ်ထုတ်ပေးပါမည်။ 24 နာရီအတွင်း Cache ရှိပြီးသားဆို <strong>0 cr</strong> သာ ကုန်ကျပါမည်။
                    </>
                  ) : (
                    <>
                      Run 1 Kalodata Product Rank call (<strong className="font-mono">0.1 cr</strong>) for{' '}
                      <strong className="text-zinc-950 dark:text-zinc-50">“{keyword.trim()}”</strong>, filter to
                      different affiliate shops,{' '}
                      {enableVisualVerification
                        ? 'verify identical items via Gemini Vision (0 Kalodata cr),'
                        : 'rank by title & price match,'}{' '}
                      and resolve direct TH TikTok Shop links (0 cr). Repeat queries within 24h reuse server cache at{' '}
                      <strong>0 cr</strong>.
                    </>
                  )}
                </div>
                <InlineDailyBudgetGuard
                  language={language}
                  dailyLimitCredits={spendingLimitCredits}
                  usedCreditsToday={serverBudgetCommittedCredits}
                  remainingCreditsToday={serverBudgetRemainingCredits}
                  requiredCredits={stage1CostCredits}
                  budgetStorageAvailable={budgetStorageAvailable}
                  onUpdateDailyLimit={onSpendingLimitChange}
                />
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <motion.button
                    type="button"
                    whileTap={TACTILE_INTERACTIONS.buttonTap}
                    onClick={() => setConfirmOpen(false)}
                    className="sp-btn-secondary !px-3.5 text-xs transition-colors"
                  >
                    {isMy ? 'မလုပ်တော့ပါ' : 'Cancel'}
                  </motion.button>
                  <motion.button
                    type="button"
                    whileTap={TACTILE_INTERACTIONS.buttonTap}
                    disabled={stage1BlockedByBudget}
                    onClick={() => handleRunSearch(false)}
                    className="sp-btn-volt !px-3.5 text-xs whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Check className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{isMy ? 'အတည်ပြုပြီး ရှာမည် (0.1 cr)' : 'Confirm & Search (0.1 cr)'}</span>
                  </motion.button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error Display */}
        {errorMsg && (
          <StateMessage
            variant="error"
            compact
            icon={<AlertTriangle className="w-4 h-4" aria-hidden="true" />}
            reason={errorMsg}
            actionLabel={isMy ? 'ထပ်စမ်းမည်' : 'Retry'}
            actionIcon={<RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />}
            onAction={() => handleRunSearch(false)}
          />
        )}
      </div>

      {/* Loading Skeleton */}
      {isSearching && (
        <div className="space-y-3 py-1">
          <div
            role="status"
            aria-live="polite"
            className="text-xs font-medium text-cyan-700 dark:text-[#25F4EE] flex items-center gap-2"
          >
            <Loader2 className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none shrink-0" aria-hidden="true" />
            <span>
              {isMy
                ? 'ထိုင်း TikTok Shop ဆိုင် Link များကို ရှာဖွေပြီး မူလပုံနှင့် ချွတ်စွပ်တူ/မတူ တိုက်စစ်နေပါသည်...'
                : 'Scanning Thailand TikTok Shop affiliate listings and comparing thumbnails for exact matches...'}
            </span>
          </div>
          {[0, 1].map((idx) => (
            <div
              key={idx}
              aria-hidden="true"
              className="rounded-xl bg-white dark:bg-[#131823] border border-zinc-200/80 dark:border-white/[0.08] p-3.5 animate-pulse motion-reduce:animate-none flex items-start gap-3"
            >
              <div className="w-16 h-16 rounded-lg bg-zinc-200 dark:bg-white/[0.07] shrink-0" />
              <div className="flex-1 min-w-0 space-y-2">
                <div className="h-3.5 w-3/4 rounded bg-zinc-200 dark:bg-white/[0.07]" />
                <div className="h-3 w-1/2 rounded bg-zinc-200/80 dark:bg-white/[0.05]" />
                <div className="flex items-center gap-3 pt-1">
                  <div className="h-4 w-16 rounded bg-zinc-200 dark:bg-white/[0.07]" />
                  <div className="h-4 w-14 rounded bg-zinc-200 dark:bg-white/[0.07]" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Results Area */}
      {!isSearching && searchResult && (
        <div className="space-y-3">
          {/* Honest Run Summary Bar (Unboxed Inline Metadata) */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono tabular-nums">
              <span className="text-zinc-900 dark:text-zinc-100 font-semibold">
                {visibleCandidates.length}{' '}
                {isMy ? 'Link တွေ့ရှိ' : visibleCandidates.length === 1 ? 'link found' : 'links found'}
              </span>
              {exactCount > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-emerald-700 dark:text-[#10F5A0] font-semibold">
                    {exactCount} {isMy ? 'ချွတ်စွပ်တူ' : 'exact same'}
                  </span>
                </>
              )}
              {closeVariantCount > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-amber-700 dark:text-amber-300">
                    {closeVariantCount} {isMy ? 'ပုံစံတူ/Set ကွဲ' : 'close variant'}
                  </span>
                </>
              )}
              {searchResult.excludedDifferentProductCount > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>
                    {searchResult.excludedDifferentProductCount}{' '}
                    {isMy ? 'မတူ၍ ဖယ်ထုတ်ပြီး' : 'non-matching filtered out'}
                  </span>
                </>
              )}
              <span aria-hidden="true">·</span>
              <span>
                {searchResult.fromCache
                  ? isMy
                    ? 'Cache (0 cr)'
                    : 'Cached (0 cr)'
                  : `${formatCredits(searchResult.creditsSpent)} cr`}
              </span>
            </div>

            <motion.button
              type="button"
              whileTap={TACTILE_INTERACTIONS.buttonTap}
              onClick={() => handleRunSearch(true)}
              className="inline-flex items-center gap-1 min-h-[32px] py-1 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50 transition-colors cursor-pointer whitespace-nowrap"
              title={isMy ? 'အသစ်ပြန်ရှာမည် (0.1 cr)' : 'Refresh live search (0.1 cr)'}
            >
              <RefreshCw className="w-3 h-3" aria-hidden="true" />
              <span>{isMy ? 'ပြန်ရှာ (0.1 cr)' : 'Refresh (0.1 cr)'}</span>
            </motion.button>
          </div>

          {/* Honest Visual Verification Note */}
          <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed flex items-start gap-1.5">
            <Eye className="w-3.5 h-3.5 shrink-0 mt-0.5 text-zinc-400" aria-hidden="true" />
            <span>{isMy ? searchResult.visualVerificationNoteMy : searchResult.visualVerificationNoteEn}</span>
          </p>

          {/* Empty State */}
          {visibleCandidates.length === 0 ? (
            <StateMessage
              variant="empty"
              compact
              icon={<Search className="w-4 h-4" aria-hidden="true" />}
              reason={
                isMy
                  ? `Kalodata မှ ${searchResult.totalRankCandidatesFetched} ခု စစ်ဆေးသော်လည်း ကိုက်ညီသော တခြားဆိုင် Link မတွေ့ရှိပါ။`
                  : `Scanned ${searchResult.totalRankCandidatesFetched} listings — no matching same-product affiliate links under current filters.`
              }
              actionLabel={isMy ? 'ပြန်ရှာမည် (0.1 cr)' : 'Refresh Search'}
              actionIcon={<RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />}
              onAction={() => handleRunSearch(true)}
            />
          ) : (
            /* Matched Same-Product Candidate List */
            <div className="rounded-xl bg-white dark:bg-[#131823] border border-zinc-200/80 dark:border-white/[0.08] divide-y divide-zinc-200/80 dark:divide-white/[0.07] overflow-hidden">
              {visibleCandidates.map((cand) => {
                const isSaved = savedProductIds?.has(cand.researchProduct.id) ?? false;
                const isStage2Open = activeStage2ConfirmId === cand.productId;
                const isStage2Loading = stage2LoadingId === cand.productId;
                const stage2Err = stage2Errors[cand.productId];
                const stage2Cost =
                  KALODATA_PRODUCT_DETAIL_CREDIT +
                  (stage2IncludeShop && cand.shopId ? KALODATA_SHOP_DETAIL_CREDIT : 0);

                const arbitrage = computeVerifiedCommissionArbitrage(product, cand);

                const signals = isMy ? cand.earlyMoverSignalsMy : cand.earlyMoverSignalsEn;
                const priceDeltaText =
                  cand.priceDeltaThb !== null
                    ? cand.priceDeltaThb === 0
                      ? '±฿0'
                      : `${cand.priceDeltaThb > 0 ? '+' : '-'}${formatThb(Math.abs(cand.priceDeltaThb))}`
                    : null;
                const commDeltaText =
                  cand.commissionDeltaPct !== null
                    ? `${cand.commissionDeltaPct > 0 ? '+' : ''}${cand.commissionDeltaPct}%`
                    : null;
                const candImageConfig = resolveProductImageDisplayConfig({
                  id: cand.productId,
                  imageUrl: cand.imageUrl,
                  imageOriginUrl: cand.imageOriginUrl,
                  imageVerified: Boolean(cand.imageUrl || cand.imageOriginUrl),
                  kalodataMetrics: { productId: cand.productId },
                  sources: [{ url: cand.tiktokShopUrl, verified: true }],
                });

                return (
                  <article key={cand.productId} className="p-4 space-y-3">
                    {/* Top Row: Side-by-Side Thumbnails + Identity, Match Badge & Verified Arbitrage Pop */}
                    <div className="flex flex-col sm:flex-row gap-3.5 items-start">
                      {/* Side-by-Side Thumbnail Comparison (Original vs Found Shop) */}
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="w-16 space-y-1">
                          <div className="w-16 h-16 rounded-lg overflow-hidden bg-zinc-100 dark:bg-[#0E1118] border border-zinc-200/80 dark:border-white/[0.08]">
                            {sourceImageConfig.canRender && sourceImageConfig.src ? (
                              <ProductImage
                                src={sourceImageConfig.src}
                                fallbackSrc={sourceImageConfig.fallbackSrc}
                                productId={sourceImageConfig.productId}
                                alt={product.name}
                                title={product.name}
                                unavailableLabel="—"
                                compact
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-xs text-zinc-500 dark:text-zinc-400">
                                —
                              </div>
                            )}
                          </div>
                          <div className="text-[11px] text-center text-zinc-500 dark:text-zinc-400 leading-snug">
                            {isMy ? 'မူလပုံ' : 'Original'}
                          </div>
                        </div>

                        <span className="text-xs font-mono text-zinc-400 dark:text-zinc-500 pb-4">
                          vs
                        </span>

                        <div className="w-16 space-y-1">
                          <div
                            className={`w-16 h-16 rounded-lg overflow-hidden bg-zinc-100 dark:bg-[#0E1118] border ${
                              cand.matchTier === 'exact-same'
                                ? 'border-emerald-500/40 dark:border-[#10F5A0]/40'
                                : 'border-zinc-300 dark:border-white/[0.12]'
                            }`}
                          >
                            {candImageConfig.canRender && candImageConfig.src ? (
                              <ProductImage
                                src={candImageConfig.src}
                                fallbackSrc={candImageConfig.fallbackSrc}
                                productId={candImageConfig.productId}
                                alt={cand.title}
                                title={cand.title}
                                unavailableLabel="—"
                                compact
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-xs text-zinc-500 dark:text-zinc-400">
                                —
                              </div>
                            )}
                          </div>
                          <div className="text-[11px] text-center font-medium text-zinc-700 dark:text-zinc-300 leading-snug">
                            {isMy ? 'ဆိုင်အသစ်' : 'Found'}
                          </div>
                        </div>
                      </div>

                      {/* Main Metadata, Identity Badges & Commission Arbitrage Gain Pop */}
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-semibold leading-snug ${matchTierBadgeClasses(
                              cand.matchTier
                            )}`}
                          >
                            {matchTierLabel(cand.matchTier, isMy)}
                            {cand.visualMatchConfidence !== null
                              ? ` (${cand.visualMatchConfidence}%)`
                              : ''}
                          </span>

                          {/* Verified-Only Commission Arbitrage Gain Pop-In */}
                          {arbitrage && (
                            <motion.span
                              variants={MOTION_VARIANTS.chipPop}
                              initial="initial"
                              animate="animate"
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border font-mono text-[11px] font-bold tabular-nums leading-snug bg-emerald-500/15 dark:bg-[#10F5A0]/16 border-emerald-500/35 dark:border-[#10F5A0]/35 text-emerald-700 dark:text-[#10F5A0]"
                              title={
                                isMy
                                  ? 'အတည်ပြုပြီး Commission နှုန်းထား ပိုမိုရရှိနိုင်မှု'
                                  : 'Verified commission arbitrage gain vs original shop'
                              }
                            >
                              <TrendingUp className="w-3 h-3 shrink-0" aria-hidden="true" />
                              <span>+{arbitrage.commGainPct.toFixed(1)}% Comm</span>
                              {arbitrage.thbGainPerOrder !== null && (
                                <span>
                                  · +฿{arbitrage.thbGainPerOrder.toLocaleString('en-US')}/order
                                </span>
                              )}
                            </motion.span>
                          )}

                          <span className={`font-semibold text-xs ${earlyMoverColor(cand.earlyMoverBadge)}`}>
                            {earlyMoverLabel(cand.earlyMoverBadge, isMy)}
                          </span>
                        </div>

                        <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                          {cand.shopName}
                          {cand.shopSellerType ? ` (${cand.shopSellerType})` : ''}
                        </div>

                        <h4 className="text-xs sm:text-sm font-semibold text-zinc-950 dark:text-zinc-50 leading-snug line-clamp-2">
                          {cand.title}
                        </h4>

                        <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                          {isMy ? cand.visualMatchReasonMy : cand.visualMatchReasonEn}
                        </p>
                      </div>
                    </div>

                    {/* Tabular Comparison Metrics */}
                    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 pt-2.5 border-t border-zinc-100 dark:border-white/[0.06] text-xs">
                      <div>
                        <dt className="text-xs text-zinc-500 dark:text-zinc-400">
                          {isMy ? 'ဈေးနှုန်း (မူလနှင့်ယှဉ်)' : 'Price vs Original'}
                        </dt>
                        <dd className="mt-0.5 font-mono font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums">
                          {cand.priceThb !== null ? formatThb(cand.priceThb) : '—'}
                          {priceDeltaText && (
                            <span
                              className={`ml-1 text-xs font-normal ${
                                (cand.priceDeltaThb ?? 0) <= 0
                                  ? 'text-emerald-700 dark:text-[#10F5A0]'
                                  : (cand.priceDeltaPct ?? 0) > 15
                                    ? 'text-amber-700 dark:text-amber-300'
                                    : 'text-zinc-500 dark:text-zinc-400'
                              }`}
                            >
                              ({priceDeltaText})
                            </span>
                          )}
                        </dd>
                      </div>

                      <div>
                        <dt className="text-xs text-zinc-500 dark:text-zinc-400">
                          {isMy ? 'ကော်မရှင် · 1 ခုရငွေ' : 'Commission · Per Sale'}
                        </dt>
                        <dd className="mt-0.5 font-mono font-semibold text-emerald-700 dark:text-[#10F5A0] tabular-nums">
                          {cand.commissionRate !== null ? `${cand.commissionRate}%` : '—'}
                          {commDeltaText && (
                            <span
                              className={`ml-1 text-xs font-normal ${
                                (cand.commissionDeltaPct ?? 0) > 0
                                  ? 'text-emerald-700 dark:text-[#10F5A0]'
                                  : 'text-zinc-500 dark:text-zinc-400'
                              }`}
                            >
                              ({commDeltaText})
                            </span>
                          )}
                          {cand.estimatedCommissionPerSaleThb !== null && (
                            <span className="ml-1 text-xs font-normal text-zinc-600 dark:text-zinc-300">
                              · {formatThb(cand.estimatedCommissionPerSaleThb)}
                            </span>
                          )}
                        </dd>
                      </div>

                      <div>
                        <dt className="text-xs text-zinc-500 dark:text-zinc-400">
                          {isMy ? '30d ရောင်းအား · Video GMV' : '30d Sales · Video GMV'}
                        </dt>
                        <dd className="mt-0.5 font-mono font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">
                          {cand.salesVolume !== null ? cand.salesVolume.toLocaleString('en-US') : '—'}
                          <span className="mx-1 text-zinc-400 font-normal">·</span>
                          <span className="text-xs font-normal text-zinc-600 dark:text-zinc-300">
                            {cand.videoRevenueThb !== null ? formatThb(cand.videoRevenueThb) : '—'}
                          </span>
                        </dd>
                      </div>

                      <div>
                        <dt className="text-xs text-zinc-500 dark:text-zinc-400">
                          {isMy ? 'Creator ပြိုင်ဆိုင်မှု · တင်ရက်' : 'Creators · Launched'}
                        </dt>
                        <dd className="mt-0.5 font-mono text-xs font-semibold tabular-nums">
                          {cand.creatorNumber !== null ? (
                            <span
                              className={
                                cand.creatorNumber <= 15
                                  ? 'text-emerald-700 dark:text-[#10F5A0]'
                                  : cand.creatorNumber >= 80
                                    ? 'text-rose-700 dark:text-[#FE2C55]'
                                    : 'text-zinc-900 dark:text-zinc-100'
                              }
                            >
                              {cand.creatorNumber.toLocaleString('en-US')}{' '}
                              {isMy ? 'ဦး' : 'creators'}
                            </span>
                          ) : (
                            <span className="font-sans text-xs font-normal text-zinc-500 dark:text-zinc-400">
                              {isMy ? 'မစစ်ရသေး' : 'Unchecked'}
                            </span>
                          )}
                          {cand.launchDate && (
                            <span className="ml-1.5 text-xs font-normal text-zinc-500 dark:text-zinc-400">
                              · {cand.launchDate}
                            </span>
                          )}
                        </dd>
                      </div>
                    </dl>

                    {/* Early-Mover Signal Summary */}
                    {signals.length > 0 && (
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                        {signals.map((sig, idx) => (
                          <span key={`${cand.productId}-sig-${idx}`} className="inline-flex items-center gap-2">
                            {idx > 0 && (
                              <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-600">
                                ·
                              </span>
                            )}
                            <span>{sig}</span>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Inline Stage 2 Confirmation Bar (Opt-in Creator Count & Shop Trust) */}
                    <AnimatePresence initial={false}>
                      {isStage2Open && (
                        <motion.div
                          initial={{ opacity: 0, height: 0, overflow: 'hidden' }}
                          animate={{
                            opacity: 1,
                            height: 'auto',
                            transitionEnd: { overflow: 'visible' },
                          }}
                          exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
                          transition={MOTION_TRANSITIONS.accordion}
                        >
                          <div className="p-3 rounded-lg bg-[#F5F6F8] dark:bg-[#0E1118] border border-zinc-200 dark:border-white/[0.1] space-y-2 text-xs">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-medium text-zinc-900 dark:text-zinc-100">
                                {isMy
                                  ? `Creator အရေအတွက် စစ်ဆေးမည် (${formatCredits(stage2Cost)} cr)`
                                  : `Verify Exact Creator Count (${formatCredits(stage2Cost)} cr)`}
                              </span>
                              {cand.shopId && !cand.shopTrustVerified && (
                                <label className="inline-flex items-center gap-1.5 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={stage2IncludeShop}
                                    onChange={(e) => setStage2IncludeShop(e.target.checked)}
                                    className="rounded border-zinc-300 dark:border-zinc-600 accent-emerald-600 dark:accent-[#10F5A0]"
                                  />
                                  <span>
                                    {isMy ? 'ဆိုင်ယုံကြည်မှုပါ စစ် (+0.1 cr)' : '+ Shop Trust (0.1 cr)'}
                                  </span>
                                </label>
                              )}
                            </div>
                            <InlineDailyBudgetGuard
                              language={language}
                              dailyLimitCredits={spendingLimitCredits}
                              usedCreditsToday={serverBudgetCommittedCredits}
                              remainingCreditsToday={serverBudgetRemainingCredits}
                              requiredCredits={stage2Cost}
                              budgetStorageAvailable={budgetStorageAvailable}
                              onUpdateDailyLimit={onSpendingLimitChange}
                            />
                            <div className="flex items-center justify-end gap-2 pt-1">
                              <motion.button
                                type="button"
                                whileTap={TACTILE_INTERACTIONS.buttonTap}
                                onClick={() => setActiveStage2ConfirmId(null)}
                                className="sp-btn-secondary !px-3 text-xs transition-colors"
                              >
                                {isMy ? 'မလုပ်တော့ပါ' : 'Cancel'}
                              </motion.button>
                              <motion.button
                                type="button"
                                whileTap={TACTILE_INTERACTIONS.buttonTap}
                                onClick={() => handleVerifyCandidateStage2(cand)}
                                disabled={
                                  isStage2Loading ||
                                  !budgetStorageAvailable ||
                                  stage2Cost > effectiveRemainingBudget + 1e-6
                                }
                                className="sp-btn-volt !px-3.5 text-xs disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap transition-colors"
                              >
                                {isStage2Loading ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                                ) : (
                                  <Check className="w-3.5 h-3.5" aria-hidden="true" />
                                )}
                                <span>
                                  {isMy
                                    ? `အတည်ပြု (${formatCredits(stage2Cost)} cr)`
                                    : `Confirm (${formatCredits(stage2Cost)} cr)`}
                                </span>
                              </motion.button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {stage2Err && (
                      <p className="text-xs text-rose-700 dark:text-[#FE2C55]">{stage2Err}</p>
                    )}

                    {/* Action Row (Tactile motion buttons) */}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {isSafeHttpUrl(cand.tiktokShopUrl) && (
                        <a
                          href={cand.tiktokShopUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="sp-btn-volt !px-3 text-xs whitespace-nowrap transition-colors"
                        >
                          <span>{isMy ? 'TikTok Shop ဖွင့်ရန်' : 'Open TikTok Link'}</span>
                          <ExternalLink className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        </a>
                      )}

                      <motion.button
                        type="button"
                        whileTap={TACTILE_INTERACTIONS.buttonTap}
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(cand.tiktokShopUrl);
                            setCopiedCandidateId(cand.productId);
                            setTimeout(() => setCopiedCandidateId(null), 1600);
                          } catch {
                            // Ignore clipboard restriction
                          }
                        }}
                        className="sp-btn-secondary !px-3 text-xs whitespace-nowrap transition-colors"
                      >
                        {copiedCandidateId === cand.productId ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-[#10F5A0]" aria-hidden="true" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                        )}
                        <span>
                          {copiedCandidateId === cand.productId
                            ? isMy
                              ? 'ကူးပြီး'
                              : 'Copied'
                            : isMy
                              ? 'Link ကူး'
                              : 'Copy'}
                        </span>
                      </motion.button>

                      {!cand.stage2Verified && (
                        <motion.button
                          type="button"
                          whileTap={TACTILE_INTERACTIONS.buttonTap}
                          onClick={() => {
                            setStage2IncludeShop(false);
                            setActiveStage2ConfirmId(isStage2Open ? null : cand.productId);
                          }}
                          disabled={Boolean(stage2LoadingId)}
                          className="sp-btn-secondary !px-3 text-xs disabled:opacity-50 whitespace-nowrap transition-colors"
                        >
                          <Users className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          <span>
                            {isMy ? 'Creator စစ် (0.1 cr)' : 'Check Creators (0.1 cr)'}
                          </span>
                        </motion.button>
                      )}

                      {onSaveCandidate && (
                        <motion.button
                          type="button"
                          whileTap={TACTILE_INTERACTIONS.buttonTap}
                          onClick={() => onSaveCandidate(cand.researchProduct)}
                          className={`inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
                            isSaved
                              ? 'bg-emerald-600 dark:bg-[#10F5A0] text-white dark:text-[#06070A] border-emerald-600 dark:border-[#10F5A0] hover:bg-emerald-700 dark:hover:bg-[#34F7B0]'
                              : 'bg-white dark:bg-[#0E1118] text-zinc-700 dark:text-zinc-200 border-zinc-200 dark:border-white/[0.1] hover:bg-zinc-50 dark:hover:bg-white/[0.06]'
                          }`}
                        >
                          <Bookmark
                            className={`w-3.5 h-3.5 shrink-0 ${isSaved ? 'fill-current' : ''}`}
                            aria-hidden="true"
                          />
                          <span>
                            {isSaved
                              ? isMy
                                ? 'သိမ်းပြီး'
                                : 'Saved'
                              : isMy
                                ? 'သိမ်းမည်'
                                : 'Save'}
                          </span>
                        </motion.button>
                      )}

                      {onOpenDeepDive && (
                        <motion.button
                          type="button"
                          whileTap={TACTILE_INTERACTIONS.buttonTap}
                          onClick={() => onOpenDeepDive(cand.researchProduct)}
                          className="sp-btn-secondary !px-3 text-xs whitespace-nowrap transition-colors"
                        >
                          <Layers className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          <span>Deep Dive</span>
                        </motion.button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
