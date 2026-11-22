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
  Users,
} from 'lucide-react';
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
import { ProductImage } from './ProductImage';
import { InfoPopover } from './InfoPopover';
import { StateMessage } from './visual';

interface SameProductHunterSectionProps {
  product: ResearchProduct;
  spendingLimitCredits: number;
  salesWeightPct: number;
  language: Language;
  savedProductIds?: ReadonlySet<string>;
  onSaveCandidate?: (candidateProduct: ResearchProduct) => void;
  onOpenDeepDive?: (candidateProduct: ResearchProduct) => void;
  onCreditsSpent?: () => void;
}

// Lightweight session memory cache so reopening the drawer for the same product restores results at 0 cr
const clientSameProductSessionCache = new Map<string, SameProductSearchResponse>();

const PRICE_TOLERANCE_OPTIONS = [25, 35, 50] as const;

function matchTierColor(tier: SameProductMatchTier): string {
  if (tier === 'exact-same') return 'text-emerald-700 dark:text-emerald-400';
  if (tier === 'close-variant') return 'text-amber-700 dark:text-amber-400';
  return 'text-zinc-500 dark:text-zinc-400';
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
  if (badge === 'early-mover') return 'text-emerald-700 dark:text-emerald-400';
  if (badge === 'low-video-gap') return 'text-sky-700 dark:text-sky-400';
  if (badge === 'saturated') return 'text-red-700 dark:text-red-400';
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

export function SameProductHunterSection({
  product,
  spendingLimitCredits,
  salesWeightPct,
  language,
  savedProductIds,
  onSaveCandidate,
  onOpenDeepDive,
  onCreditsSpent,
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
    setSearchResult(clientSameProductSessionCache.get(canonicalSourceId) ?? null);
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

  const stage1CostLabel = `${formatCredits(KALODATA_CREDITS_PER_100_ROWS)} cr (~${formatUsd(
    KALODATA_CREDITS_PER_100_ROWS * KALODATA_USD_PER_CREDIT
  )})`;

  return (
    <section
      id="rep-same-product"
      className="scroll-mt-4 pt-6 border-t border-zinc-200 dark:border-zinc-800 space-y-4"
    >
      {/* Section Heading */}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-50">
              {isMy
                ? 'ချွတ်စွပ်တူ Product · ခြေလှမ်းဦးနိုင်မည့် ဆိုင် Link ရှာရန်'
                : 'Same Product · Early-Mover Shop Links'}
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
                  ? 'မူလ Winning Product နှင့် ပစ္စည်းချွတ်စွပ်တူသော တခြားထိုင်း TikTok Shop ဆိုင် Link များကို Kalodata (0.1 cr) ဖြင့် ရှာဖွေပြီး Gemini AI ပုံတိုက်စစ်မှု (0 Kalodata cr) ဖြင့် မတူသောပစ္စည်းများကို ဖယ်ထုတ်ကာ Creator ပြိုင်ဆိုင်မှုနည်းသေးသော Link များကို ဦးစားပေးစီပြပေးပါသည်။'
                  : 'Searches Thailand TikTok Shop affiliate listings (0.1 cr, 24h cached) for the exact same physical product sold by different shops, uses Gemini Vision (0 Kalodata cr) to filter out non-matching items, and prioritizes listings with low creator video saturation.'
              }
            />
          </div>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            {isMy
              ? 'ပစ္စည်းချွတ်စွပ်တူ · ဆိုင် Link မတူ · အခြား Creator တွေထက် ခြေလှမ်းဦးနိုင်မည့် Link များ'
              : 'Exact same item · Different shop link · Lower creator saturation & direct TH TikTok Shop URLs'}
          </p>
        </div>

        <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400 tabular-nums shrink-0">
          {stage1CostLabel}
        </span>
      </div>

      {/* Controls Container (Flat single-elevation surface) */}
      <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-800 space-y-3.5">
        {/* Editable Core Keyword Input + AI Keyword Button */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label
              htmlFor={`same-product-kw-${canonicalSourceId}`}
              className="text-xs font-medium text-zinc-700 dark:text-zinc-300"
            >
              {isMy ? 'အဓိက Product Keyword (ပြင်ဆင်နိုင်သည်)' : 'Core Product Keyword (editable)'}
            </label>
            <button
              type="button"
              onClick={handleSuggestKeywords}
              disabled={loadingKeywords || isSearching}
              className="inline-flex items-center gap-1 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-50 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
            >
              {loadingKeywords ? (
                <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="w-3 h-3" aria-hidden="true" />
              )}
              <span>
                {isMy ? 'AI Keyword အကြံပြု (0 Kalodata cr)' : 'AI Suggest Keywords (0 Kalodata cr)'}
              </span>
            </button>
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
              className="flex-1 min-h-[38px] px-3 py-1.5 text-xs rounded-lg bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/15 dark:focus:ring-zinc-100/20"
            />
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={isSearching || keyword.trim().length < 2}
              className="inline-flex items-center justify-center gap-1.5 min-h-[38px] px-4 py-1.5 text-xs font-semibold rounded-lg bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-white disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              {isSearching ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" aria-hidden="true" />
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
            </button>
          </div>

          {/* Clickable Keyword Suggestions (functional filter buttons) */}
          {suggestedKeywords.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {isMy ? 'အကြံပြု:' : 'Try:'}
              </span>
              {suggestedKeywords.map((kw) => {
                const isSelected = keyword.trim().toLowerCase() === kw.toLowerCase();
                return (
                  <button
                    key={kw}
                    type="button"
                    onClick={() => setKeyword(kw)}
                    className={`px-2 py-0.5 text-xs rounded-md transition-colors cursor-pointer max-w-[200px] truncate ${
                      isSelected
                        ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950 font-medium'
                        : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 hover:text-zinc-950 dark:hover:text-zinc-50'
                    }`}
                  >
                    {kw}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Filter Controls Strip */}
        <div className="pt-3 border-t border-zinc-200/70 dark:border-zinc-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Price Band Segmented Control */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
              {isMy ? 'ဈေးကွာဟချက်:' : 'Price band:'}
            </span>
            <div className="inline-flex items-center p-0.5 rounded-lg bg-zinc-200/70 dark:bg-zinc-800">
              {PRICE_TOLERANCE_OPTIONS.map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => setPriceTolerancePct(pct)}
                  className={`px-2 py-1 text-xs font-mono tabular-nums rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    priceTolerancePct === pct
                      ? 'bg-white dark:bg-zinc-900 text-zinc-950 dark:text-zinc-50 font-semibold shadow-2xs'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                  }`}
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
                className="rounded border-zinc-300 dark:border-zinc-600 text-zinc-900 focus:ring-zinc-900"
              />
              <span>{isMy ? 'AI ပုံတိုက်စစ် (0 cr)' : 'AI Visual Match (0 cr)'}</span>
            </label>

            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={useCategoryFilter}
                onChange={(e) => setUseCategoryFilter(e.target.checked)}
                className="rounded border-zinc-300 dark:border-zinc-600 text-zinc-900 focus:ring-zinc-900"
              />
              <span>{isMy ? 'Category တူသာ' : 'Same Category'}</span>
            </label>

            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeCloseVariants}
                onChange={(e) => setIncludeCloseVariants(e.target.checked)}
                className="rounded border-zinc-300 dark:border-zinc-600 text-zinc-900 focus:ring-zinc-900"
              />
              <span>{isMy ? 'Set/အရောင်ကွဲ ပါပြမည်' : 'Include Close Variants'}</span>
            </label>

            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeZeroSales}
                onChange={(e) => setIncludeZeroSales(e.target.checked)}
                className="rounded border-zinc-300 dark:border-zinc-600 text-zinc-900 focus:ring-zinc-900"
              />
              <span>{isMy ? 'ရောင်းအား 0 Link အသစ်ပါပြမည်' : 'Include 0-Sale New Links'}</span>
            </label>
          </div>
        </div>

        {/* Explicit Credit Confirmation Bar (Before Paid Call) */}
        {confirmOpen && !isSearching && (
          <div className="p-3 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 space-y-2.5 text-xs">
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
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="min-h-[34px] px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-50 rounded-lg transition-colors cursor-pointer"
              >
                {isMy ? 'မလုပ်တော့ပါ' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => handleRunSearch(false)}
                className="inline-flex items-center gap-1.5 min-h-[34px] px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-white transition-colors cursor-pointer whitespace-nowrap"
              >
                <Check className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{isMy ? 'အတည်ပြုပြီး ရှာမည် (0.1 cr)' : 'Confirm & Search (0.1 cr)'}</span>
              </button>
            </div>
          </div>
        )}

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
        <div className="space-y-3 py-2">
          <div
            role="status"
            aria-live="polite"
            className="text-xs font-medium text-zinc-600 dark:text-zinc-400"
          >
            {isMy
              ? 'ထိုင်း TikTok Shop ဆိုင် Link များကို ရှာဖွေပြီး မူလပုံနှင့် ချွတ်စွပ်တူ/မတူ တိုက်စစ်နေပါသည်...'
              : 'Scanning Thailand TikTok Shop affiliate listings and comparing thumbnails for exact matches...'}
          </div>
          {[0, 1].map((idx) => (
            <div
              key={idx}
              aria-hidden="true"
              className="p-3.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 animate-pulse flex items-start gap-3"
            >
              <div className="w-16 h-16 rounded-lg bg-zinc-200 dark:bg-zinc-800 shrink-0" />
              <div className="flex-1 min-w-0 space-y-2">
                <div className="h-3.5 w-3/4 rounded bg-zinc-200 dark:bg-zinc-800" />
                <div className="h-3 w-1/2 rounded bg-zinc-200/80 dark:bg-zinc-800" />
                <div className="flex items-center gap-3 pt-1">
                  <div className="h-4 w-16 rounded bg-zinc-200 dark:bg-zinc-800" />
                  <div className="h-4 w-14 rounded bg-zinc-200 dark:bg-zinc-800" />
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
              <span className="text-zinc-800 dark:text-zinc-200 font-semibold">
                {visibleCandidates.length}{' '}
                {isMy ? 'Link တွေ့ရှိ' : visibleCandidates.length === 1 ? 'link found' : 'links found'}
              </span>
              {exactCount > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                    {exactCount} {isMy ? 'ချွတ်စွပ်တူ' : 'exact same'}
                  </span>
                </>
              )}
              {closeVariantCount > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-amber-700 dark:text-amber-400">
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

            <button
              type="button"
              onClick={() => handleRunSearch(true)}
              className="inline-flex items-center gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50 transition-colors cursor-pointer whitespace-nowrap"
              title={isMy ? 'အသစ်ပြန်ရှာမည် (0.1 cr)' : 'Refresh live search (0.1 cr)'}
            >
              <RefreshCw className="w-3 h-3" aria-hidden="true" />
              <span>{isMy ? 'ပြန်ရှာ (0.1 cr)' : 'Refresh (0.1 cr)'}</span>
            </button>
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
            <div className="divide-y divide-zinc-200/80 dark:divide-zinc-800 border border-zinc-200/80 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 overflow-hidden">
              {visibleCandidates.map((cand) => {
                const isSaved = savedProductIds?.has(cand.researchProduct.id) ?? false;
                const isStage2Open = activeStage2ConfirmId === cand.productId;
                const isStage2Loading = stage2LoadingId === cand.productId;
                const stage2Err = stage2Errors[cand.productId];
                const stage2Cost =
                  KALODATA_PRODUCT_DETAIL_CREDIT +
                  (stage2IncludeShop && cand.shopId ? KALODATA_SHOP_DETAIL_CREDIT : 0);

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
                    {/* Top Row: Side-by-Side Thumbnails + Identity & Status */}
                    <div className="flex flex-col sm:flex-row gap-3.5 items-start">
                      {/* Side-by-Side Thumbnail Comparison (Original vs Found Shop) */}
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="w-16 space-y-1">
                          <div className="w-16 h-16 rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700/80">
                            {sourceImageConfig.canRender && sourceImageConfig.src ? (
                              <ProductImage
                                src={sourceImageConfig.src}
                                fallbackSrc={sourceImageConfig.fallbackSrc}
                                productId={sourceImageConfig.productId}
                                alt={product.name}
                                title={product.name}
                                unavailableLabel="—"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-xs text-zinc-400">
                                —
                              </div>
                            )}
                          </div>
                          <div className="text-xs text-center text-zinc-400 dark:text-zinc-500">
                            {isMy ? 'မူလပုံ' : 'Original'}
                          </div>
                        </div>

                        <span className="text-xs font-mono text-zinc-400 dark:text-zinc-500 pb-4">
                          vs
                        </span>

                        <div className="w-16 space-y-1">
                          <div className="w-16 h-16 rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700">
                            {candImageConfig.canRender && candImageConfig.src ? (
                              <ProductImage
                                src={candImageConfig.src}
                                fallbackSrc={candImageConfig.fallbackSrc}
                                productId={candImageConfig.productId}
                                alt={cand.title}
                                title={cand.title}
                                unavailableLabel="—"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-xs text-zinc-400">
                                —
                              </div>
                            )}
                          </div>
                          <div className="text-xs text-center font-medium text-zinc-600 dark:text-zinc-300">
                            {isMy ? 'ဆိုင်အသစ်' : 'Found'}
                          </div>
                        </div>
                      </div>

                      {/* Main Metadata & Title */}
                      <div className="flex-1 min-w-0 space-y-1.5">
                        {/* Unboxed Typographic Kicker */}
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                          <span className={`font-semibold ${matchTierColor(cand.matchTier)}`}>
                            {matchTierLabel(cand.matchTier, isMy)}
                            {cand.visualMatchConfidence !== null
                              ? ` (${cand.visualMatchConfidence}%)`
                              : ''}
                          </span>
                          <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-600">
                            ·
                          </span>
                          <span className={`font-semibold ${earlyMoverColor(cand.earlyMoverBadge)}`}>
                            {earlyMoverLabel(cand.earlyMoverBadge, isMy)}
                          </span>
                          <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-600">
                            ·
                          </span>
                          <span className="text-zinc-500 dark:text-zinc-400 truncate max-w-[200px]">
                            {cand.shopName}
                            {cand.shopSellerType ? ` (${cand.shopSellerType})` : ''}
                          </span>
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
                    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 pt-2.5 border-t border-zinc-100 dark:border-zinc-800/80 text-xs">
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
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : (cand.priceDeltaPct ?? 0) > 15
                                    ? 'text-amber-700 dark:text-amber-400'
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
                        <dd className="mt-0.5 font-mono font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                          {cand.commissionRate !== null ? `${cand.commissionRate}%` : '—'}
                          {commDeltaText && (
                            <span className="ml-1 text-xs font-normal text-zinc-500 dark:text-zinc-400">
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
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : cand.creatorNumber >= 80
                                    ? 'text-red-700 dark:text-red-400'
                                    : 'text-zinc-900 dark:text-zinc-100'
                              }
                            >
                              {cand.creatorNumber.toLocaleString('en-US')}{' '}
                              {isMy ? 'ဦး' : 'creators'}
                            </span>
                          ) : (
                            <span className="font-sans text-xs font-normal text-zinc-400 dark:text-zinc-500">
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
                    {isStage2Open && (
                      <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 space-y-2 text-xs">
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
                                className="rounded border-zinc-300 dark:border-zinc-600"
                              />
                              <span>
                                {isMy ? 'ဆိုင်ယုံကြည်မှုပါ စစ် (+0.1 cr)' : '+ Shop Trust (0.1 cr)'}
                              </span>
                            </label>
                          )}
                        </div>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setActiveStage2ConfirmId(null)}
                            className="px-2.5 py-1 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50 cursor-pointer"
                          >
                            {isMy ? 'မလုပ်တော့ပါ' : 'Cancel'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleVerifyCandidateStage2(cand)}
                            disabled={isStage2Loading}
                            className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-md bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-white disabled:opacity-50 cursor-pointer whitespace-nowrap"
                          >
                            {isStage2Loading ? (
                              <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
                            ) : (
                              <Check className="w-3 h-3" aria-hidden="true" />
                            )}
                            <span>
                              {isMy
                                ? `အတည်ပြု (${formatCredits(stage2Cost)} cr)`
                                : `Confirm (${formatCredits(stage2Cost)} cr)`}
                            </span>
                          </button>
                        </div>
                      </div>
                    )}

                    {stage2Err && (
                      <p className="text-xs text-red-700 dark:text-red-400">{stage2Err}</p>
                    )}

                    {/* Action Row */}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {isSafeHttpUrl(cand.tiktokShopUrl) && (
                        <a
                          href={cand.tiktokShopUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 min-h-[34px] px-3 py-1.5 text-xs font-semibold rounded-lg bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-white transition-colors whitespace-nowrap"
                        >
                          <span>{isMy ? 'TikTok Shop ဖွင့်ရန်' : 'Open TikTok Link'}</span>
                          <ExternalLink className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        </a>
                      )}

                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(cand.tiktokShopUrl);
                            setCopiedCandidateId(cand.productId);
                            setTimeout(() => setCopiedCandidateId(null), 1600);
                          } catch {
                            // Ignore clipboard restriction
                          }
                        }}
                        className="inline-flex items-center gap-1 min-h-[34px] px-2.5 py-1.5 text-xs font-medium rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        {copiedCandidateId === cand.productId ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
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
                      </button>

                      {!cand.stage2Verified && (
                        <button
                          type="button"
                          onClick={() => {
                            setStage2IncludeShop(false);
                            setActiveStage2ConfirmId(isStage2Open ? null : cand.productId);
                          }}
                          disabled={Boolean(stage2LoadingId)}
                          className="inline-flex items-center gap-1 min-h-[34px] px-2.5 py-1.5 text-xs font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <Users className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          <span>
                            {isMy ? 'Creator စစ် (0.1 cr)' : 'Check Creators (0.1 cr)'}
                          </span>
                        </button>
                      )}

                      {onSaveCandidate && (
                        <button
                          type="button"
                          onClick={() => onSaveCandidate(cand.researchProduct)}
                          className={`inline-flex items-center gap-1 min-h-[34px] px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
                            isSaved
                              ? 'bg-emerald-700 dark:bg-emerald-600 text-white border-emerald-700 dark:border-emerald-600'
                              : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800'
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
                        </button>
                      )}

                      {onOpenDeepDive && (
                        <button
                          type="button"
                          onClick={() => onOpenDeepDive(cand.researchProduct)}
                          className="inline-flex items-center gap-1 min-h-[34px] px-2.5 py-1.5 text-xs font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <Layers className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          <span>Deep Dive</span>
                        </button>
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
