import type {
  EnrichmentLayerKey,
  KalodataProductDetailEnrichmentRecord,
  KalodataReviewInsightData,
  KalodataShopEnrichmentRecord,
  OpportunityEvaluation,
  ProductEnrichmentExecutionSummary,
  ResearchProduct,
} from '../src/types/product.ts';
import {
  DEFAULT_SPENDING_LIMIT_CREDITS,
  formatCredits,
  KALODATA_USD_PER_CREDIT,
} from '../src/utils/kalodataPricing.ts';
import {
  buildStructuredReviewInsight,
  getCanonicalShopId,
  isValidKalodataId,
  mergeEnrichmentIntoProduct,
  planProductEnrichment,
  type EnrichmentSelection,
} from '../src/utils/enrichmentPlanner.ts';
import { evaluateProductOpportunity, getCanonicalProductId } from '../src/utils/scoring.ts';
import {
  fetchKalodataCreditBalance,
  fetchKalodataProductCommentInsight,
  fetchKalodataProductDetail,
  fetchKalodataShopDetail,
} from './kalodataService.ts';
import {
  parseKalodataCommentInsight,
  parseKalodataProductDetail,
  parseKalodataShopDetail,
  type ParsedCommentInsight,
  type ParsedProductDetail,
  type ParsedShopDetail,
} from './kalodataAnalysis.ts';

const SERVER_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const SERVER_CACHE_MAX_ENTRIES = 500;

interface CacheEntry<T> {
  value: T;
  storedAtMs: number;
}

const serverProductDetailCache = new Map<string, CacheEntry<KalodataProductDetailEnrichmentRecord>>();
const serverShopDetailCache = new Map<string, CacheEntry<KalodataShopEnrichmentRecord>>();
const serverReviewInsightCache = new Map<string, CacheEntry<KalodataReviewInsightData>>();
const serverVideoProductsCache = new Map<string, CacheEntry<Record<string, unknown>[]>>();

// Server-side in-flight deduplication prevents duplicate paid Kalodata API calls
// when two concurrent requests ask for the same productId/shopId before cache populates.
const inFlightProductDetail = new Map<
  string,
  Promise<{
    record: KalodataProductDetailEnrichmentRecord | null;
    error?: { en: string; my: string };
  }>
>();
const inFlightShopDetail = new Map<
  string,
  Promise<{
    record: KalodataShopEnrichmentRecord | null;
    error?: { en: string; my: string };
  }>
>();
const inFlightReviewInsight = new Map<
  string,
  Promise<{
    record: KalodataReviewInsightData | null;
    error?: { en: string; my: string };
  }>
>();

function getValidEntry<T>(map: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = map.get(key);
  if (!entry) return null;
  if (Date.now() - entry.storedAtMs > SERVER_CACHE_TTL_MS) {
    map.delete(key);
    return null;
  }
  return entry.value;
}

function setBoundedEntry<T>(map: Map<string, CacheEntry<T>>, key: string, value: T): void {
  if (!key) return;
  if (map.size >= SERVER_CACHE_MAX_ENTRIES && !map.has(key)) {
    const oldestKey = map.keys().next().value;
    if (oldestKey !== undefined) {
      map.delete(oldestKey);
    }
  }
  map.set(key, { value, storedAtMs: Date.now() });
}

export function getServerCachedProductDetail(
  productId: string
): KalodataProductDetailEnrichmentRecord | null {
  return getValidEntry(serverProductDetailCache, productId.trim());
}

export function setServerCachedProductDetail(
  record: KalodataProductDetailEnrichmentRecord
): void {
  if (!record.productId) return;
  setBoundedEntry(serverProductDetailCache, record.productId.trim(), record);
}

export function getServerCachedShopDetail(
  shopId: string
): KalodataShopEnrichmentRecord | null {
  return getValidEntry(serverShopDetailCache, shopId.trim());
}

export function setServerCachedShopDetail(record: KalodataShopEnrichmentRecord): void {
  if (!record.shopId) return;
  setBoundedEntry(serverShopDetailCache, record.shopId.trim(), record);
}

export function getServerCachedReviewInsight(
  productId: string
): KalodataReviewInsightData | null {
  return getValidEntry(serverReviewInsightCache, productId.trim());
}

export function setServerCachedReviewInsight(record: KalodataReviewInsightData): void {
  if (!record.productId) return;
  setBoundedEntry(serverReviewInsightCache, record.productId.trim(), record);
}

export function getServerCachedVideoProducts(
  cacheKey: string
): Record<string, unknown>[] | null {
  return getValidEntry(serverVideoProductsCache, cacheKey.trim());
}

export function setServerCachedVideoProducts(
  cacheKey: string,
  items: Record<string, unknown>[]
): void {
  if (!cacheKey.trim()) return;
  setBoundedEntry(serverVideoProductsCache, cacheKey.trim(), items);
}

export function clearServerEnrichmentCache(): void {
  serverProductDetailCache.clear();
  serverShopDetailCache.clear();
  serverReviewInsightCache.clear();
  serverVideoProductsCache.clear();
  inFlightProductDetail.clear();
  inFlightShopDetail.clear();
  inFlightReviewInsight.clear();
}

export function toProductDetailRecord(
  parsed: ParsedProductDetail,
  dateRange: string,
  updatedAt = new Date().toISOString()
): KalodataProductDetailEnrichmentRecord {
  return {
    productId: parsed.productId,
    productShopId: parsed.productShopId,
    ...(parsed.productName ? { productName: parsed.productName } : {}),
    ...(parsed.sellerName ? { sellerName: parsed.sellerName } : {}),
    ...(parsed.masterImageUrl ? { masterImageUrl: parsed.masterImageUrl } : {}),
    ...(parsed.priCategory ? { priCategory: parsed.priCategory } : {}),
    ...(parsed.secCategory ? { secCategory: parsed.secCategory } : {}),
    ...(parsed.terCategory ? { terCategory: parsed.terCategory } : {}),
    ...(parsed.revenueGrowthRate !== undefined && parsed.revenueGrowthRate !== null
      ? { revenueGrowthRate: parsed.revenueGrowthRate }
      : {}),
    ...(parsed.showcaseRevenueThb !== undefined && parsed.showcaseRevenueThb !== null
      ? { showcaseRevenueThb: parsed.showcaseRevenueThb }
      : {}),
    ...(parsed.skuCount !== undefined && parsed.skuCount !== null
      ? { skuCount: parsed.skuCount }
      : {}),
    minPriceThb: parsed.minPriceThb,
    maxPriceThb: parsed.maxPriceThb,
    unitPriceThb: parsed.unitPriceThb,
    revenueThb: parsed.revenueThb,
    salesVolume: parsed.salesVolume,
    videoRevenueThb: parsed.videoRevenueThb,
    liveRevenueThb: parsed.liveRevenueThb,
    shoppingMallRevenueThb: parsed.shoppingMallRevenueThb,
    commissionRatePct: parsed.commissionRatePct,
    creatorNumber: parsed.creatorNumber,
    videoNumber: parsed.videoNumber,
    liveNumber: parsed.liveNumber,
    deliveryType: parsed.deliveryType,
    productReviewCount: parsed.productReviewCount,
    ...(parsed.productDescription ? { productDescription: parsed.productDescription } : {}),
    launchDate: parsed.launchDate,
    trendPointsCount: parsed.trendPointsCount,
    trendPeakThb: parsed.trendPeakThb,
    trendAvgThb: parsed.trendAvgThb,
    dateRange,
    updatedAt,
  };
}

export function toShopEnrichmentRecord(
  parsed: ParsedShopDetail,
  dateRange: string,
  updatedAt = new Date().toISOString()
): KalodataShopEnrichmentRecord {
  return {
    shopId: parsed.shopId,
    shopName: parsed.shopName,
    sellerType: parsed.sellerType,
    revenueThb: parsed.revenueThb,
    affiliateRevenueThb: parsed.affiliateRevenueThb,
    selfAccountRevenueThb: parsed.selfAccountRevenueThb,
    shoppingMallRevenueThb: parsed.shoppingMallRevenueThb,
    salesVolume: parsed.salesVolume,
    unitPriceThb: parsed.unitPriceThb,
    creatorNumber: parsed.creatorNumber,
    productNumber: parsed.productNumber,
    videoNumber: parsed.videoNumber,
    liveNumber: parsed.liveNumber,
    dateRange,
    updatedAt,
  };
}

export function toReviewInsightRecord(
  parsed: ParsedCommentInsight,
  updatedAt = new Date().toISOString()
): KalodataReviewInsightData {
  return buildStructuredReviewInsight({
    productId: parsed.productId,
    summary: parsed.summary,
    positivePoints: parsed.positivePoints,
    painPoints: parsed.painPoints,
    usageScenarios: parsed.usageScenarios,
    commentsAnalyzed: parsed.commentsAnalyzed,
    averageRating: parsed.averageRating,
    ratedCommentCount: parsed.ratedCommentCount,
    ...(parsed.rawComments ? { rawComments: parsed.rawComments } : {}),
    ...(parsed.pagesFetched ? { pagesFetched: parsed.pagesFetched } : {}),
    updatedAt,
  });
}

export class EnrichmentApiError extends Error {
  status: number;
  code: string;
  errorMy?: string;

  constructor(status: number, code: string, message: string, errorMy?: string) {
    super(message);
    this.name = 'EnrichmentApiError';
    this.status = status;
    this.code = code;
    this.errorMy = errorMy;
  }
}

export interface EnrichProductParams {
  product: ResearchProduct;
  requestedLayers: EnrichmentSelection;
  spendingLimitCredits?: number;
  forceRefresh?: boolean;
  clientCachedProductDetail?: KalodataProductDetailEnrichmentRecord | null;
  clientCachedShopDetail?: KalodataShopEnrichmentRecord | null;
  clientCachedReviewInsight?: KalodataReviewInsightData | null;
  salesWeightPct?: number;
  peerProducts?: readonly ResearchProduct[];
}

export interface EnrichProductResult {
  ok: true;
  product: ResearchProduct;
  changed: boolean;
  evaluation: OpportunityEvaluation;
  productDetail: KalodataProductDetailEnrichmentRecord | null;
  shopDetail: KalodataShopEnrichmentRecord | null;
  reviewInsight: KalodataReviewInsightData | null;
  summary: ProductEnrichmentExecutionSummary;
}

/**
 * Phase 4 Selective Product / Shop / Review Data Enrichment Service.
 * - Strictly inspects existing product fields + client cache + server TTL cache BEFORE calling Kalodata API.
 * - Prevents duplicate API calls by Product ID & Shop ID across all products and sessions.
 * - Enforces Spending Limit & Free Credit Balance Check BEFORE any paid API call.
 * - Never fabricates missing data; preserves original score untouched if no new data arrives.
 */
export async function enrichSingleProduct(
  params: EnrichProductParams
): Promise<EnrichProductResult> {
  const {
    product,
    requestedLayers,
    forceRefresh = false,
    salesWeightPct = 50,
    peerProducts,
  } = params;

  const spendingLimitCredits =
    typeof params.spendingLimitCredits === 'number' &&
    Number.isFinite(params.spendingLimitCredits) &&
    params.spendingLimitCredits > 0
      ? Math.round(params.spendingLimitCredits * 1000) / 1000
      : DEFAULT_SPENDING_LIMIT_CREDITS;

  const canonicalProductId = getCanonicalProductId(product);
  const rawKalodataProductId = product.kalodataMetrics?.productId?.trim() ?? '';
  if (!isValidKalodataId(rawKalodataProductId)) {
    throw new EnrichmentApiError(
      400,
      'INVALID_KALODATA_PRODUCT_ID',
      'A valid numeric Kalodata Product ID is required for data enrichment. No API call was made.',
      'ဒေတာဖြည့်စွက်ရန် မှန်ကန်သော Kalodata Product ID လိုအပ်ပါသည်။ Kalodata API မခေါ်ဆိုပါ။'
    );
  }

  if (
    !requestedLayers.productDetail &&
    !requestedLayers.shopDetail &&
    !requestedLayers.reviewInsights
  ) {
    throw new EnrichmentApiError(
      400,
      'NO_LAYERS_SELECTED',
      'Select at least one enrichment layer (Product Detail, Shop Detail, or Review Insights).',
      'ဖြည့်စွက်ရန် အနည်းဆုံး ဒေတာအမျိုးအစား ၁ ခု (Product Detail / Shop Detail / Review Insights) ရွေးချယ်ပါ။'
    );
  }

  // Resolve combined caches (Server TTL cache takes precedence, then client-supplied cache)
  const initialShopId = getCanonicalShopId(product);
  const serverCachedPd = getServerCachedProductDetail(rawKalodataProductId);
  const effectiveCachedPd = serverCachedPd ?? params.clientCachedProductDetail ?? null;

  const candidateShopId =
    initialShopId ?? effectiveCachedPd?.productShopId ?? null;
  const serverCachedSd = candidateShopId ? getServerCachedShopDetail(candidateShopId) : null;
  const effectiveCachedSd = serverCachedSd ?? params.clientCachedShopDetail ?? null;

  const serverCachedRi = getServerCachedReviewInsight(rawKalodataProductId);
  const effectiveCachedRi = serverCachedRi ?? params.clientCachedReviewInsight ?? null;

  // Plan cost & deduplication BEFORE any external API call
  const plan = planProductEnrichment(product, requestedLayers, {
    spendingLimitCredits,
    forceRefresh,
    cachedProductDetail: effectiveCachedPd,
    cachedShopDetail: effectiveCachedSd,
    cachedReviewInsight: effectiveCachedRi,
  });

  // Hard Server-Side Spending Limit Gate (0 Kalodata calls if exceeded)
  if (plan.exceedsSpendingLimit) {
    throw new EnrichmentApiError(
      400,
      'SPENDING_LIMIT_EXCEEDED',
      `Estimated enrichment cost (${formatCredits(plan.estimatedCredits)} credits across ${plan.plannedApiCalls} call(s)) exceeds your Spending Limit (${formatCredits(spendingLimitCredits)} credits). No Kalodata API call was made.`,
      `ခန့်မှန်းဒေတာဖြည့်စွက်စရိတ် (${formatCredits(plan.estimatedCredits)} Credits · API ${plan.plannedApiCalls} ကြိမ်) သည် Spending Limit (${formatCredits(spendingLimitCredits)} Credits) ထက် ကျော်လွန်နေသဖြင့် Kalodata API မခေါ်ဆိုဘဲ ရပ်တန့်ထားပါသည်။`
    );
  }

  const layerResults: ProductEnrichmentExecutionSummary['layerResults'] = {
    productDetail: 'skipped',
    shopDetail: 'skipped',
    reviewInsights: 'skipped',
  };
  const layerErrors: Partial<Record<EnrichmentLayerKey, { en: string; my: string }>> = {};

  let balanceBefore: number | null = null;
  let balanceAfter: number | null = null;

  // Free Credit Balance check BEFORE any paid call (0 credits)
  if (plan.plannedApiCalls > 0) {
    const balanceBeforeRes = await fetchKalodataCreditBalance();
    balanceBefore =
      balanceBeforeRes.ok && balanceBeforeRes.balance !== null
        ? balanceBeforeRes.balance
        : null;

    if (balanceBefore !== null && balanceBefore + 1e-6 < plan.estimatedCredits) {
      throw new EnrichmentApiError(
        402,
        'INSUFFICIENT_CREDITS',
        `Insufficient Kalodata credit balance (${formatCredits(balanceBefore)} credits remaining, ${formatCredits(plan.estimatedCredits)} credits estimated). No paid API call was made.`,
        `Kalodata လက်ကျန် Balance (${formatCredits(balanceBefore)} Credits) သည် ခန့်မှန်းကုန်ကျစရိတ် (${formatCredits(plan.estimatedCredits)} Credits) ထက် နည်းနေသဖြင့် API မခေါ်ဆိုပါ။`
      );
    }
  }

  const enrichedAt = new Date().toISOString();
  const dateRange = 'last30Day';
  let actualApiCalls = 0;
  let deduplicatedCallsSaved = 0;

  let resolvedProductDetail: KalodataProductDetailEnrichmentRecord | null = null;
  let resolvedShopDetail: KalodataShopEnrichmentRecord | null = null;
  let resolvedReviewInsight: KalodataReviewInsightData | null = null;

  // 1. Product Detail Layer (0.1 credit)
  const pdAction = plan.layers.productDetail.action;
  if (pdAction === 'already-present') {
    layerResults.productDetail = 'already-present';
    deduplicatedCallsSaved += 1;
  } else if (pdAction === 'reuse-cache' && effectiveCachedPd) {
    resolvedProductDetail = effectiveCachedPd;
    layerResults.productDetail = 'reused-cache';
    deduplicatedCallsSaved += 1;
  } else if (pdAction === 'fetch') {
    const existingInFlight = !forceRefresh ? inFlightProductDetail.get(rawKalodataProductId) : null;
    if (existingInFlight) {
      const shared = await existingInFlight;
      if (shared.record) {
        resolvedProductDetail = shared.record;
        layerResults.productDetail = 'reused-cache';
        deduplicatedCallsSaved += 1;
      } else {
        layerResults.productDetail = 'failed';
        layerErrors.productDetail = shared.error ?? {
          en: 'Failed to fetch Kalodata Product Detail.',
          my: 'Kalodata Product Detail ရယူမှု မအောင်မြင်ပါ။',
        };
      }
    } else {
      actualApiCalls += 1;
      const fetchPromise = (async () => {
        const res = await fetchKalodataProductDetail({
          region: 'TH',
          language: 'en-US',
          currency: 'THB',
          date_range: dateRange,
          product_id: rawKalodataProductId,
          need_extra: true,
        });
        if (res.ok && res.data) {
          const parsed = parseKalodataProductDetail(rawKalodataProductId, res.data);
          if (parsed) {
            const record = toProductDetailRecord(parsed, dateRange, enrichedAt);
            setServerCachedProductDetail(record);
            return { record };
          }
          return {
            record: null,
            error: {
              en: 'Kalodata returned empty Product Detail payload.',
              my: 'Kalodata မှ Product Detail ဒေတာ မရရှိပါ။',
            },
          };
        }
        return {
          record: null,
          error: {
            en: res.error ?? 'Failed to fetch Kalodata Product Detail.',
            my: res.errorMy ?? 'Kalodata Product Detail ရယူမှု မအောင်မြင်ပါ။',
          },
        };
      })();

      inFlightProductDetail.set(rawKalodataProductId, fetchPromise);
      try {
        const outcome = await fetchPromise;
        if (outcome.record) {
          resolvedProductDetail = outcome.record;
          layerResults.productDetail = 'fetched';
        } else {
          layerResults.productDetail = 'failed';
          layerErrors.productDetail = outcome.error;
        }
      } finally {
        if (inFlightProductDetail.get(rawKalodataProductId) === fetchPromise) {
          inFlightProductDetail.delete(rawKalodataProductId);
        }
      }
    }
  }

  // 2. Shop Detail Layer (0.1 credit — strictly deduplicated by Shop ID!)
  const sdAction = plan.layers.shopDetail.action;
  const finalShopId =
    resolvedProductDetail?.productShopId ??
    candidateShopId ??
    null;

  if (sdAction === 'already-present') {
    layerResults.shopDetail = 'already-present';
    deduplicatedCallsSaved += 1;
  } else if (sdAction === 'reuse-cache' && effectiveCachedSd) {
    resolvedShopDetail = effectiveCachedSd;
    layerResults.shopDetail = 'reused-cache';
    deduplicatedCallsSaved += 1;
  } else if (sdAction === 'fetch') {
    if (!finalShopId || !isValidKalodataId(finalShopId)) {
      layerResults.shopDetail = 'skipped';
      layerErrors.shopDetail = {
        en: 'Shop ID was not returned by Kalodata — Shop Detail call skipped (0 credits spent for shop).',
        my: 'Kalodata မှ Shop ID မရရှိသဖြင့် Shop Detail API ကို ကျော်သွားပါသည် (0 credits)။',
      };
    } else {
      // Second deduplication check AFTER Product Detail may have revealed Shop ID
      const lateServerShop = !forceRefresh ? getServerCachedShopDetail(finalShopId) : null;
      const lateClientShop =
        !forceRefresh && params.clientCachedShopDetail?.shopId === finalShopId
          ? params.clientCachedShopDetail
          : null;
      const lateCachedShop = lateServerShop ?? lateClientShop;

      if (lateCachedShop) {
        resolvedShopDetail = lateCachedShop;
        layerResults.shopDetail = 'reused-cache';
        deduplicatedCallsSaved += 1;
      } else {
        const existingShopInFlight = !forceRefresh ? inFlightShopDetail.get(finalShopId) : null;
        if (existingShopInFlight) {
          const shared = await existingShopInFlight;
          if (shared.record) {
            resolvedShopDetail = shared.record;
            layerResults.shopDetail = 'reused-cache';
            deduplicatedCallsSaved += 1;
          } else {
            layerResults.shopDetail = 'failed';
            layerErrors.shopDetail = shared.error ?? {
              en: 'Failed to fetch Kalodata Shop Detail.',
              my: 'Kalodata Shop Detail ရယူမှု မအောင်မြင်ပါ။',
            };
          }
        } else {
          actualApiCalls += 1;
          const shopPromise = (async () => {
            const res = await fetchKalodataShopDetail({
              region: 'TH',
              language: 'en-US',
              currency: 'THB',
              date_range: dateRange,
              shop_id: finalShopId,
              need_extra: true,
            });
            if (res.ok && res.data) {
              const parsed = parseKalodataShopDetail(finalShopId, res.data);
              if (parsed) {
                const record = toShopEnrichmentRecord(parsed, dateRange, enrichedAt);
                setServerCachedShopDetail(record);
                return { record };
              }
              return {
                record: null,
                error: {
                  en: 'Kalodata returned empty Shop Detail payload.',
                  my: 'Kalodata မှ Shop Detail ဒေတာ မရရှိပါ။',
                },
              };
            }
            return {
              record: null,
              error: {
                en: res.error ?? 'Failed to fetch Kalodata Shop Detail.',
                my: res.errorMy ?? 'Kalodata Shop Detail ရယူမှု မအောင်မြင်ပါ။',
              },
            };
          })();

          inFlightShopDetail.set(finalShopId, shopPromise);
          try {
            const outcome = await shopPromise;
            if (outcome.record) {
              resolvedShopDetail = outcome.record;
              layerResults.shopDetail = 'fetched';
            } else {
              layerResults.shopDetail = 'failed';
              layerErrors.shopDetail = outcome.error;
            }
          } finally {
            if (inFlightShopDetail.get(finalShopId) === shopPromise) {
              inFlightShopDetail.delete(finalShopId);
            }
          }
        }
      }
    }
  }

  // 3. Review & Customer Insights Layer (1.0 credit — strictly opt-in)
  const riAction = plan.layers.reviewInsights.action;
  if (riAction === 'already-present') {
    layerResults.reviewInsights = 'already-present';
    deduplicatedCallsSaved += 1;
  } else if (riAction === 'reuse-cache' && effectiveCachedRi) {
    resolvedReviewInsight = effectiveCachedRi;
    layerResults.reviewInsights = 'reused-cache';
    deduplicatedCallsSaved += 1;
  } else if (riAction === 'fetch') {
    const existingRiInFlight = !forceRefresh ? inFlightReviewInsight.get(rawKalodataProductId) : null;
    if (existingRiInFlight) {
      const shared = await existingRiInFlight;
      if (shared.record) {
        resolvedReviewInsight = shared.record;
        layerResults.reviewInsights = 'reused-cache';
        deduplicatedCallsSaved += 1;
      } else {
        layerResults.reviewInsights = 'failed';
        layerErrors.reviewInsights = shared.error ?? {
          en: 'Failed to fetch Kalodata Review Insights.',
          my: 'Kalodata Review Insights ရယူမှု မအောင်မြင်ပါ။',
        };
      }
    } else {
      actualApiCalls += 1;
      const riPromise = (async () => {
        const res = await fetchKalodataProductCommentInsight({
          product_id: rawKalodataProductId,
          country_code: 'th',
        });
        if (res.ok && res.data) {
          const parsed = parseKalodataCommentInsight(rawKalodataProductId, res.data);
          if (parsed) {
            const record = toReviewInsightRecord(parsed, enrichedAt);
            setServerCachedReviewInsight(record);
            return { record };
          }
          return {
            record: null,
            error: {
              en: 'Kalodata returned empty Review Insight payload.',
              my: 'Kalodata မှ Review Insight ဒေတာ မရရှိပါ။',
            },
          };
        }
        return {
          record: null,
          error: {
            en: res.error ?? 'Failed to fetch Kalodata Review Insights.',
            my: res.errorMy ?? 'Kalodata Review Insights ရယူမှု မအောင်မြင်ပါ။',
          },
        };
      })();

      inFlightReviewInsight.set(rawKalodataProductId, riPromise);
      try {
        const outcome = await riPromise;
        if (outcome.record) {
          resolvedReviewInsight = outcome.record;
          layerResults.reviewInsights = 'fetched';
        } else {
          layerResults.reviewInsights = 'failed';
          layerErrors.reviewInsights = outcome.error;
        }
      } finally {
        if (inFlightReviewInsight.get(rawKalodataProductId) === riPromise) {
          inFlightReviewInsight.delete(rawKalodataProductId);
        }
      }
    }
  }

  // Free Credit Balance check AFTER paid calls (0 credits)
  if (actualApiCalls > 0) {
    const balanceAfterRes = await fetchKalodataCreditBalance();
    balanceAfter =
      balanceAfterRes.ok && balanceAfterRes.balance !== null
        ? balanceAfterRes.balance
        : null;
  }

  const actualCredits =
    actualApiCalls === 0
      ? 0
      : balanceBefore !== null && balanceAfter !== null
        ? Math.max(0, Math.round((balanceBefore - balanceAfter) * 10000) / 10000)
        : null;
  const actualUsd =
    actualCredits !== null
      ? Math.round(actualCredits * KALODATA_USD_PER_CREDIT * 10000) / 10000
      : null;

  // Non-destructive merge & Phase 2 score recalculation ONLY when real new data arrived
  const merged = mergeEnrichmentIntoProduct(
    product,
    {
      productDetail: resolvedProductDetail,
      shopDetail: resolvedShopDetail,
      reviewInsight: resolvedReviewInsight,
      enrichedAt,
    },
    {
      salesWeightPct,
      peerProducts,
    }
  );

  const evaluation = evaluateProductOpportunity(merged.product, {
    salesWeightPct,
    peerProducts,
  });

  const summary: ProductEnrichmentExecutionSummary = {
    canonicalProductId,
    shopId: finalShopId,
    enrichedAt,
    plannedApiCalls: plan.plannedApiCalls,
    actualApiCalls,
    deduplicatedCallsSaved,
    estimatedCredits: plan.estimatedCredits,
    estimatedUsd: plan.estimatedUsd,
    actualCredits,
    actualUsd,
    balanceBefore,
    balanceAfter,
    layerResults,
    layerErrors: Object.keys(layerErrors).length > 0 ? layerErrors : undefined,
  };

  return {
    ok: true,
    product: merged.product,
    changed: merged.changed,
    evaluation,
    productDetail: resolvedProductDetail,
    shopDetail: resolvedShopDetail,
    reviewInsight: resolvedReviewInsight,
    summary,
  };
}
