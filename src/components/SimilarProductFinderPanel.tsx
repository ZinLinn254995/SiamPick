import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Database,
  ExternalLink,
  Loader2,
  PlayCircle,
  Plus,
  Search,
  Sparkles,
} from 'lucide-react';
import type {
  DataStatus,
  Language,
  ProductCategory,
  ResearchProduct,
  ResearchQuotaStatus,
  SyncedKalodataCategoryCache,
} from '../types/product';
import type {
  SimilarBucketFilter,
  SimilarProductSearchCostPreview,
  SimilarProductSearchResponse,
  SimilarProductSearchSource,
} from '../types/importedPhase3';
import {
  buildClientSimilarCacheKey,
  collectLocalSimilarCandidates,
  evaluateSimilarFinderResults,
  filterSimilarFinderItems,
  loadClientSimilarSearchCache,
  persistClientSimilarSearchCache,
} from '../utils/importedPhase3';
import { buildResolvedCategoryIdMap } from '../utils/categoryRegistry';
import { absorbProductsIntoEnrichmentCache, loadEnrichmentCache } from '../utils/enrichmentCache';
import { formatThb, getTikTokShopProductUrl, resolveProductImageDisplayConfig } from '../utils/format';
import { formatCredits, formatUsd } from '../utils/kalodataPricing';
import { getCanonicalProductId } from '../utils/scoring';
import { TRANSLATIONS } from '../i18n/translations';
import { ProductImage } from './ProductImage';

interface SimilarProductFinderPanelProps {
  language: Language;
  referenceProduct: ResearchProduct;
  salesWeightPct: number;
  spendingLimitCredits: number;
  syncedCategoryCache: SyncedKalodataCategoryCache;
  serverBudgetRemainingCredits: number | null;
  liveBalanceCredits: number | null;
  budgetStorageAvailable: boolean;
  quotaStatus: ResearchQuotaStatus;
  importedProducts: readonly ResearchProduct[];
  liveResults: readonly ResearchProduct[];
  savedProducts: readonly ResearchProduct[];
  historyProducts: readonly ResearchProduct[];
  comparedProductIds: ReadonlySet<string>;
  onAddToComparison: (
    product: ResearchProduct,
    origin: 'kalodata-similar-search' | 'workspace-pool'
  ) => void;
  onOpenProductWorkspace: (product: ResearchProduct) => void;
  onSimilarApiExecuted: (result: SimilarProductSearchResponse) => void;
  onResumeResearch: () => Promise<void> | void;
}

function buildDefaultKeywordForDisplay(name: string): string {
  const cleaned = name
    .replace(/[\[\]()【】（）!！?？@#$%^&*_+=~`|\\/<>,"'“”‘’。、·•★☆✅🔥✨💥🎁]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const tokens = cleaned
    .split(' ')
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !/^\d+$/.test(t));
  return (tokens.slice(0, 3).join(' ') || cleaned).slice(0, 80);
}

function StatusTag({
  status,
  label,
}: {
  status: DataStatus;
  label: string;
}) {
  const color =
    status === 'verified'
      ? 'text-emerald-700 dark:text-emerald-400'
      : status === 'estimated'
        ? 'text-amber-700 dark:text-amber-400'
        : 'text-zinc-500 dark:text-zinc-400';
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${color}`}>
      {status === 'verified' ? (
        <CheckCircle2 className="w-3 h-3 shrink-0" aria-hidden="true" />
      ) : (
        <AlertCircle className="w-3 h-3 shrink-0" aria-hidden="true" />
      )}
      <span>{label}</span>
    </span>
  );
}

export function SimilarProductFinderPanel({
  language,
  referenceProduct,
  salesWeightPct,
  spendingLimitCredits,
  syncedCategoryCache,
  serverBudgetRemainingCredits,
  liveBalanceCredits,
  budgetStorageAvailable,
  quotaStatus,
  importedProducts,
  liveResults,
  savedProducts,
  historyProducts,
  comparedProductIds,
  onAddToComparison,
  onOpenProductWorkspace,
  onSimilarApiExecuted,
  onResumeResearch,
}: SimilarProductFinderPanelProps) {
  const t = TRANSLATIONS[language];
  const isMy = language === 'my';
  const refCanonicalId = getCanonicalProductId(referenceProduct);

  const [customKeyword, setCustomKeyword] = useState(() =>
    buildDefaultKeywordForDisplay(referenceProduct.name)
  );
  const [bucketFilter, setBucketFilter] = useState<SimilarBucketFilter>('all');
  const [apiCandidates, setApiCandidates] = useState<ResearchProduct[]>([]);
  const [apiSource, setApiSource] = useState<
    Exclude<SimilarProductSearchSource, 'workspace-pool'> | undefined
  >(undefined);
  const [preview, setPreview] = useState<SimilarProductSearchCostPreview | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [userConfirmedPaid, setUserConfirmedPaid] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const resolvedCategoryIdMap = useMemo<Partial<Record<ProductCategory, string>>>(
    () => buildResolvedCategoryIdMap(syncedCategoryCache),
    [syncedCategoryCache]
  );

  // Reset keyword & try hydrating client cache when reference product switches (0 cr)
  useEffect(() => {
    const nextKw = buildDefaultKeywordForDisplay(referenceProduct.name);
    setCustomKeyword(nextKw);
    setPreview(null);
    setSearchError(null);
    setUserConfirmedPaid(false);
    setBucketFilter('all');

    const priCatId = referenceProduct.kalodataMetrics?.priCategory?.category_id;
    const catIds = priCatId ? [priCatId] : [];
    const cacheKey = buildClientSimilarCacheKey(refCanonicalId, nextKw, catIds);
    const cached = loadClientSimilarSearchCache(cacheKey);
    if (cached && cached.candidates.length > 0) {
      setApiCandidates(cached.candidates);
      setApiSource('client-cache');
    } else {
      setApiCandidates([]);
      setApiSource(undefined);
    }
  }, [refCanonicalId, referenceProduct.name, referenceProduct.kalodataMetrics?.priCategory?.category_id]);

  const localCandidates = useMemo(
    () =>
      collectLocalSimilarCandidates(referenceProduct, {
        importedProducts,
        liveResults,
        savedProducts,
        historyProducts,
      }),
    [referenceProduct, importedProducts, liveResults, savedProducts, historyProducts]
  );

  const evaluation = useMemo(
    () =>
      evaluateSimilarFinderResults(referenceProduct, {
        apiCandidates,
        apiSource,
        localCandidates,
      }),
    [referenceProduct, apiCandidates, apiSource, localCandidates]
  );

  const visibleItems = useMemo(
    () => filterSimilarFinderItems(evaluation.items, bucketFilter),
    [evaluation.items, bucketFilter]
  );

  const handlePreviewSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setIsLoadingPreview(true);
    setSearchError(null);
    setUserConfirmedPaid(false);

    try {
      // Check browser cache first before even planning a paid API call (0 cr)
      const priCatId = referenceProduct.kalodataMetrics?.priCategory?.category_id;
      const fallbackCatId = resolvedCategoryIdMap[referenceProduct.category];
      const catIds = priCatId ? [priCatId] : fallbackCatId ? [fallbackCatId] : [];
      const clientCacheKey = buildClientSimilarCacheKey(refCanonicalId, customKeyword, catIds);
      const clientHit = loadClientSimilarSearchCache(clientCacheKey);
      if (clientHit && clientHit.candidates.length > 0) {
        setApiCandidates(clientHit.candidates);
        setApiSource('client-cache');
        setPreview(null);
        return;
      }

      const res = await fetch('/api/similar-products/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          referenceProduct,
          customKeyword,
          resolvedCategoryIdMap,
          spendingLimitCredits,
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; preview?: SimilarProductSearchCostPreview; error?: string }
        | null;
      if (!res.ok || !data?.preview) {
        setSearchError(data?.error ?? `Preview failed (HTTP ${res.status})`);
        return;
      }
      setPreview(data.preview);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Unable to preview similar search.');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleExecuteSearch = async (confirmed: boolean) => {
    if (isSearching) return;
    if (preview?.requiresPaidApiCall && !confirmed) return;

    setIsSearching(true);
    setSearchError(null);

    try {
      const cache = loadEnrichmentCache();
      const idempotencyKey = `similar-${refCanonicalId}-${Date.now()}`;
      const res = await fetch('/api/similar-products/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          referenceProduct,
          customKeyword,
          resolvedCategoryIdMap,
          clientCachedDetails: cache.products,
          spendingLimitCredits,
          salesWeightPct,
          userConfirmedPaidExecution: confirmed,
          idempotencyKey,
        }),
      });

      const data = (await res.json().catch(() => null)) as
        | SimilarProductSearchResponse
        | { ok?: false; error?: string; errorMy?: string; code?: string }
        | null;

      if (!res.ok || !data || !('candidates' in data)) {
        const errObj = data && 'error' in data ? data : null;
        setSearchError(
          (isMy && errObj?.errorMy ? errObj.errorMy : errObj?.error) ??
            `Similar search failed (HTTP ${res.status}).`
        );
        return;
      }

      absorbProductsIntoEnrichmentCache(data.candidates);
      const clientCacheKey = buildClientSimilarCacheKey(
        refCanonicalId,
        data.query.keyword,
        data.query.categoryIds
      );
      persistClientSimilarSearchCache({
        cacheKey: clientCacheKey,
        storedAtMs: Date.now(),
        searchedAt: data.searchedAt,
        keyword: data.query.keyword,
        categoryIds: data.query.categoryIds,
        candidates: data.candidates,
      });

      setApiCandidates(data.candidates);
      setApiSource(data.dataSource);
      setPreview(null);
      setUserConfirmedPaid(false);
      onSimilarApiExecuted(data);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Network error during similar search.');
    } finally {
      setIsSearching(false);
    }
  };

  const effectiveRemainingBudget =
    preview?.budgetSummary?.remainingLimitCredits ??
    serverBudgetRemainingCredits ??
    spendingLimitCredits;
  const effectiveStorageAvailable =
    preview?.budgetSummary?.storageAvailable ?? budgetStorageAvailable;
  const effectiveBalance =
    preview?.budgetSummary?.liveBalanceCredits ?? liveBalanceCredits;
  const effectivePaused = preview?.quotaPaused || quotaStatus.paused;

  const isLimitExceeded =
    Boolean(preview?.requiresPaidApiCall) &&
    effectiveRemainingBudget + 1e-6 < (preview?.estimatedCredits ?? 0);
  const isBalanceInsufficient =
    Boolean(preview?.requiresPaidApiCall) &&
    effectiveBalance !== null &&
    effectiveBalance + 1e-6 < (preview?.estimatedCredits ?? 0);

  const canConfirmPaid =
    Boolean(preview?.requiresPaidApiCall) &&
    userConfirmedPaid &&
    !effectivePaused &&
    effectiveStorageAvailable &&
    !isLimitExceeded &&
    !isBalanceInsufficient &&
    !isSearching;

  const referenceLimitations = isMy
    ? evaluation.referenceLimitationsMy
    : evaluation.referenceLimitationsEn;

  return (
    <div className="space-y-5">
      {/* Search Bar & 0-Credit Preview Trigger */}
      <form
        onSubmit={(e) => void handlePreviewSearch(e)}
        className="flex flex-col md:flex-row md:items-end gap-3"
      >
        <div className="flex-1 min-w-0 space-y-1">
          <label
            htmlFor="phase3-similar-keyword"
            className="block text-xs font-medium text-zinc-700 dark:text-zinc-300"
          >
            {t.phase3SimilarKeywordLabel}
          </label>
          <input
            id="phase3-similar-keyword"
            type="text"
            value={customKeyword}
            onChange={(e) => {
              setCustomKeyword(e.target.value);
              setPreview(null);
              setUserConfirmedPaid(false);
            }}
            placeholder={t.phase3SimilarKeywordPlaceholder}
            className="w-full min-h-[38px] px-3 py-1.5 text-xs sm:text-sm bg-zinc-50/70 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-950 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-950/15 dark:focus:ring-zinc-100/20"
          />
        </div>

        <button
          type="submit"
          disabled={isLoadingPreview || isSearching}
          className="inline-flex items-center justify-center gap-1.5 min-h-[38px] px-4 py-2 text-xs font-medium text-white dark:text-zinc-950 bg-zinc-950 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white rounded-xl transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
        >
          {isLoadingPreview ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              <span>{t.phase3SimilarLoadingPreview}</span>
            </>
          ) : (
            <>
              <Search className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t.phase3SimilarCheckPreviewBtn}</span>
            </>
          )}
        </button>
      </form>

      {/* Preview / Cache Hit / Confirmation Box */}
      {preview && (
        <div className="p-4 bg-zinc-50/80 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-3 text-xs">
          {preview.cachedInServer && !preview.requiresPaidApiCall ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
                <Database className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>
                  {isMy
                    ? 'Server Cache ထဲတွင် ဆင်တူ Product ရလဒ်များ အသင့်ရှိနေပါသည် (0 Credits)။'
                    : 'Server cache hit found for this keyword & category — load results with 0 Kalodata credits.'}
                </span>
              </div>
              <button
                type="button"
                disabled={isSearching}
                onClick={() => void handleExecuteSearch(false)}
                className="inline-flex items-center gap-1.5 min-h-[36px] px-3.5 py-1.5 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 rounded-lg cursor-pointer whitespace-nowrap shrink-0"
              >
                {isSearching ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                <span>{t.phase3SimilarUseCacheBtn}</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="font-semibold text-zinc-950 dark:text-zinc-50">
                    {t.phase3SimilarConfirmTitle}
                  </div>
                  <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    {t.phase3SimilarConfirmDesc}{' '}
                    <span className="font-mono text-zinc-800 dark:text-zinc-200">
                      ({formatCredits(preview.estimatedCredits)} {t.creditsUnit} ≈{' '}
                      {formatUsd(preview.estimatedUsd)})
                    </span>
                  </p>
                </div>
                <div className="font-mono text-[11px] text-zinc-700 dark:text-zinc-300 tabular-nums sm:text-right shrink-0">
                  <div>
                    {t.linkImportBudgetRemainingLabel}:{' '}
                    <strong>{formatCredits(effectiveRemainingBudget)} cr</strong>
                  </div>
                  {effectiveBalance !== null && (
                    <div>
                      {t.linkImportBalanceLabel}: <strong>{formatCredits(effectiveBalance)} cr</strong>
                    </div>
                  )}
                </div>
              </div>

              {effectivePaused && (
                <div className="p-2.5 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/70 rounded-lg flex flex-wrap items-center justify-between gap-2 text-amber-950 dark:text-amber-100">
                  <span>{t.linkImportPausedBannerTitle}</span>
                  <button
                    type="button"
                    onClick={() => void onResumeResearch()}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white dark:text-zinc-950 bg-zinc-950 dark:bg-zinc-100 rounded-md cursor-pointer"
                  >
                    <PlayCircle className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{t.btnResumeAndRetry}</span>
                  </button>
                </div>
              )}

              {!effectiveStorageAvailable && (
                <p className="text-red-700 dark:text-red-400">{t.linkImportStorageBlockedNote}</p>
              )}

              {isLimitExceeded && (
                <p className="text-red-700 dark:text-red-400">{t.linkImportLimitExceededNote}</p>
              )}

              {isBalanceInsufficient && (
                <p className="text-red-700 dark:text-red-400">
                  {isMy
                    ? `Kalodata လက်ကျန် Credit မလုံလောက်ပါ (${formatCredits(effectiveBalance ?? 0)} cr)။`
                    : `Insufficient Kalodata balance (${formatCredits(effectiveBalance ?? 0)} cr available).`}
                </p>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-zinc-200/80 dark:border-zinc-800">
                <label className="inline-flex items-center gap-2 text-zinc-800 dark:text-zinc-200 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={userConfirmedPaid}
                    onChange={(e) => setUserConfirmedPaid(e.target.checked)}
                    disabled={
                      effectivePaused ||
                      !effectiveStorageAvailable ||
                      isLimitExceeded ||
                      isBalanceInsufficient ||
                      isSearching
                    }
                    className="w-4 h-4 rounded border-zinc-300 dark:border-zinc-700 text-zinc-950 cursor-pointer"
                  />
                  <span>{t.phase3SimilarConfirmCheckbox}</span>
                </label>

                <button
                  type="button"
                  disabled={!canConfirmPaid}
                  onClick={() => void handleExecuteSearch(true)}
                  className="inline-flex items-center gap-1.5 min-h-[36px] px-4 py-1.5 text-xs font-medium text-white dark:text-zinc-950 bg-zinc-950 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white rounded-lg disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap shrink-0"
                >
                  {isSearching ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                      <span>{t.phase3SimilarSearchingLabel}</span>
                    </>
                  ) : (
                    <span>{t.phase3SimilarConfirmProceedBtn}</span>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {searchError && (
        <div
          role="alert"
          className="p-3 bg-red-50/70 dark:bg-red-950/30 border border-red-200 dark:border-red-800/70 rounded-xl text-xs text-red-900 dark:text-red-200 flex items-start gap-2"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400" aria-hidden="true" />
          <span>{searchError}</span>
        </div>
      )}

      {/* Classification Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            { id: 'all', label: t.phase3SimilarFilterAll, count: evaluation.counts.all },
            {
              id: 'cheaper-price',
              label: t.phase3SimilarFilterCheaper,
              count: evaluation.counts.cheaperPrice,
            },
            {
              id: 'better-commission',
              label: t.phase3SimilarFilterBetterComm,
              count: evaluation.counts.betterCommission,
            },
            {
              id: 'lower-competition',
              label: t.phase3SimilarFilterLowerComp,
              count: evaluation.counts.lowerCompetition,
            },
          ] as const
        ).map((tab) => {
          const active = bucketFilter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setBucketFilter(tab.id)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 min-h-[34px] px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
                active
                  ? 'bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950 border-zinc-950 dark:border-zinc-100'
                  : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600'
              }`}
            >
              <span>{tab.label}</span>
              <span className="font-mono text-[11px] opacity-80 tabular-nums">({tab.count})</span>
            </button>
          );
        })}
      </div>

      {/* Honest Reference Limitation Disclosure */}
      {referenceLimitations.length > 0 && (
        <div className="p-3 bg-zinc-50/70 dark:bg-zinc-950/40 border border-zinc-200/80 dark:border-zinc-800 rounded-xl text-xs text-zinc-600 dark:text-zinc-400 space-y-1">
          {referenceLimitations.map((note, idx) => (
            <div key={idx} className="flex items-start gap-2">
              <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{note}</span>
            </div>
          ))}
        </div>
      )}

      {/* Results List */}
      {evaluation.items.length === 0 ? (
        <div className="p-6 text-center bg-zinc-50/50 dark:bg-zinc-950/30 border border-zinc-200/80 dark:border-zinc-800 rounded-xl space-y-1.5">
          <Sparkles className="w-5 h-5 text-zinc-400 dark:text-zinc-500 mx-auto" aria-hidden="true" />
          <div className="text-xs font-semibold text-zinc-950 dark:text-zinc-50">
            {t.phase3SimilarEmptyTitle}
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-lg mx-auto leading-relaxed">
            {t.phase3SimilarEmptyDesc}
          </p>
        </div>
      ) : visibleItems.length === 0 ? (
        <div className="p-6 text-center bg-zinc-50/50 dark:bg-zinc-950/30 border border-zinc-200/80 dark:border-zinc-800 rounded-xl space-y-1.5">
          <div className="text-xs font-semibold text-zinc-950 dark:text-zinc-50">
            {t.phase3SimilarNoBucketMatchTitle}
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-lg mx-auto leading-relaxed">
            {t.phase3SimilarNoBucketMatchDesc}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800/80 border border-zinc-200/90 dark:border-zinc-800 rounded-xl overflow-hidden bg-white dark:bg-zinc-900">
          {visibleItems.map((item) => {
            const p = item.candidate;
            const imgCfg = resolveProductImageDisplayConfig(p);
            const displayName = isMy ? p.nameMy : p.name;
            const isCompared = comparedProductIds.has(item.canonicalProductId);
            const creatorNum = p.kalodataMetrics?.creatorNumber ?? null;
            const videoNum = p.kalodataMetrics?.videoNumber ?? null;
            const videoRev = p.kalodataMetrics?.videoRevenueThb ?? null;
            const sales = p.kalodataMetrics?.salesVolume ?? null;
            const gmv = p.kalodataMetrics?.revenueThb ?? null;
            const tiktokUrl = getTikTokShopProductUrl(p);

            const advantages: string[] = [];
            if (item.isCheaperPrice && item.priceDeltaThb !== null) {
              advantages.push(
                `${t.phase3SimilarCheaperTag} (-${formatThb(item.priceDeltaThb)}${item.priceSavingsPct !== null ? ` · -${item.priceSavingsPct}%` : ''})`
              );
            }
            if (item.isBetterCommission && item.commissionGainPts !== null) {
              advantages.push(`${t.phase3SimilarBetterCommTag} (+${item.commissionGainPts}%)`);
            }
            if (item.isLowerCompetition && item.creatorDelta !== null) {
              advantages.push(
                `${t.phase3SimilarLowerCompTag} (-${item.creatorDelta} creators)`
              );
            }

            return (
              <div
                key={item.canonicalProductId}
                className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="flex items-start gap-3.5 min-w-0 flex-1">
                  <div className="w-14 h-14 rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700 shrink-0">
                    {imgCfg.canRender && imgCfg.src ? (
                      <ProductImage
                        src={imgCfg.src}
                        fallbackSrc={imgCfg.fallbackSrc}
                        productId={item.canonicalProductId}
                        alt={p.name}
                        title={displayName}
                        unavailableLabel={t.cardImageUnverified}
                      />
                    ) : null}
                  </div>

                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                      <span className="font-mono tabular-nums">#{item.canonicalProductId}</span>
                      <span aria-hidden="true">·</span>
                      <span>{p.shopName || t.dataStatusLabels.unavailable}</span>
                      <span aria-hidden="true">·</span>
                      <StatusTag
                        status={item.source === 'workspace-pool' ? 'estimated' : 'verified'}
                        label={isMy ? item.sourceLabelMy : item.sourceLabelEn}
                      />
                      {tiktokUrl && (
                        <>
                          <span aria-hidden="true">·</span>
                          <a
                            href={tiktokUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 text-zinc-700 dark:text-zinc-300 hover:underline"
                          >
                            <span>TikTok</span>
                            <ExternalLink className="w-2.5 h-2.5" aria-hidden="true" />
                          </a>
                        </>
                      )}
                    </div>

                    <h4 className="text-xs sm:text-sm font-semibold text-zinc-950 dark:text-zinc-50 leading-snug line-clamp-2">
                      {displayName}
                    </h4>

                    {/* Key Verified / Unavailable Metrics Line */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono tabular-nums text-zinc-800 dark:text-zinc-200">
                      <span>
                        <span className="font-sans text-zinc-500 dark:text-zinc-400 mr-1">
                          {t.cardPrice}:
                        </span>
                        {typeof p.priceThb === 'number' && p.priceThb > 0
                          ? formatThb(p.priceThb)
                          : t.dataStatusLabels.unavailable}
                      </span>
                      <span
                        className={
                          p.commissionVerified && typeof p.commissionRate === 'number'
                            ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                            : 'text-zinc-400 dark:text-zinc-500'
                        }
                      >
                        <span className="font-sans text-zinc-500 dark:text-zinc-400 font-normal mr-1">
                          Comm:
                        </span>
                        {p.commissionVerified && typeof p.commissionRate === 'number'
                          ? `${p.commissionRate}%`
                          : t.dataStatusLabels.unavailable}
                      </span>
                      <span>
                        <span className="font-sans text-zinc-500 dark:text-zinc-400 mr-1">
                          Sales / GMV:
                        </span>
                        {sales !== null || gmv !== null
                          ? `${sales !== null ? sales.toLocaleString('en-US') : '—'} · ${gmv !== null ? formatThb(gmv) : '—'}`
                          : t.dataStatusLabels.unavailable}
                      </span>
                      <span>
                        <span className="font-sans text-zinc-500 dark:text-zinc-400 mr-1">
                          Creators:
                        </span>
                        {creatorNum !== null
                          ? `${creatorNum.toLocaleString('en-US')} (${p.competitionLevel})`
                          : t.dataStatusLabels.unavailable}
                      </span>
                      {(videoRev !== null || videoNum !== null) && (
                        <span>
                          <span className="font-sans text-zinc-500 dark:text-zinc-400 mr-1">
                            Video:
                          </span>
                          {videoRev !== null ? formatThb(videoRev) : '—'}
                          {videoNum !== null ? ` (${videoNum} vid)` : ''}
                        </span>
                      )}
                    </div>

                    {/* Verified Comparison Advantages (or Honest Detail Notice) */}
                    {advantages.length > 0 ? (
                      <div className="text-xs font-medium text-emerald-700 dark:text-emerald-400 font-mono tabular-nums">
                        {advantages.join(' · ')}
                      </div>
                    ) : creatorNum === null ? (
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        {t.phase3SimilarDetailNeededNote}
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* Actions: Add to Compare + Open Workspace */}
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      onAddToComparison(
                        p,
                        item.source === 'workspace-pool'
                          ? 'workspace-pool'
                          : 'kalodata-similar-search'
                      )
                    }
                    className={`inline-flex items-center gap-1.5 min-h-[34px] px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
                      isCompared
                        ? 'bg-emerald-700 dark:bg-emerald-600 text-white border-emerald-700 dark:border-emerald-600'
                        : 'bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950 border-zinc-950 dark:border-zinc-100 hover:bg-zinc-800 dark:hover:bg-white'
                    }`}
                  >
                    {isCompared ? (
                      <>
                        <Check className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{t.phase3SimilarInCompareBtn}</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{t.phase3SimilarAddToCompareBtn}</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenProductWorkspace(p)}
                    className="inline-flex items-center gap-1.5 min-h-[34px] px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <span>{t.phase3SimilarInspectBtn}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
