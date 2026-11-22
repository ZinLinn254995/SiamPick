import type {
  KalodataProductDetailEnrichmentRecord,
  KalodataReviewInsightData,
  KalodataShopEnrichmentRecord,
  ResearchProduct,
  StorageWriteResult,
} from '../types/product.ts';
import {
  getCanonicalShopId,
  mergeEnrichmentIntoProduct,
} from './enrichmentPlanner.ts';
import { getCanonicalProductId } from './scoring.ts';

export const ENRICHMENT_CACHE_STORAGE_KEY = 'siampick_enrichment_cache_v1';
export const ENRICHMENT_CACHE_SCHEMA_VERSION = 1;

export interface EnrichmentCacheEnvelopeV1 {
  schemaVersion: number;
  updatedAt: string;
  products: Record<string, KalodataProductDetailEnrichmentRecord>;
  shops: Record<string, KalodataShopEnrichmentRecord>;
  reviews: Record<string, KalodataReviewInsightData>;
}

function getStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
    if (
      typeof globalThis !== 'undefined' &&
      'localStorage' in globalThis &&
      globalThis.localStorage
    ) {
      return globalThis.localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

function isQuotaExceededError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; code?: number; message?: string };
  return (
    e.name === 'QuotaExceededError' ||
    e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    e.code === 22 ||
    e.code === 1014 ||
    (typeof e.message === 'string' && e.message.toLowerCase().includes('quota'))
  );
}

function emptyCache(): EnrichmentCacheEnvelopeV1 {
  return {
    schemaVersion: ENRICHMENT_CACHE_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    products: {},
    shops: {},
    reviews: {},
  };
}

function isValidProductDetailRecord(
  val: unknown
): val is KalodataProductDetailEnrichmentRecord {
  if (!val || typeof val !== 'object') return false;
  const r = val as Record<string, unknown>;
  return typeof r.productId === 'string' && r.productId.length > 0 && typeof r.updatedAt === 'string';
}

function isValidShopRecord(val: unknown): val is KalodataShopEnrichmentRecord {
  if (!val || typeof val !== 'object') return false;
  const r = val as Record<string, unknown>;
  return typeof r.shopId === 'string' && r.shopId.length > 0 && typeof r.updatedAt === 'string';
}

function isValidReviewRecord(val: unknown): val is KalodataReviewInsightData {
  if (!val || typeof val !== 'object') return false;
  const r = val as Record<string, unknown>;
  return (
    typeof r.productId === 'string' &&
    r.productId.length > 0 &&
    Array.isArray(r.positivePoints) &&
    Array.isArray(r.painPoints)
  );
}

export const MAX_ENRICHMENT_CACHE_ENTRIES_PER_BUCKET = 200;

let memoizedEnrichCacheRaw: string | null = null;
let memoizedEnrichCache: EnrichmentCacheEnvelopeV1 | null = null;

function pruneRecordMapByUpdatedAt<T extends { updatedAt?: string }>(
  map: Record<string, T>,
  maxEntries: number
): Record<string, T> {
  const entries = Object.entries(map);
  if (entries.length <= maxEntries) return map;
  entries.sort((a, b) => {
    const tA = Date.parse(a[1].updatedAt || '') || 0;
    const tB = Date.parse(b[1].updatedAt || '') || 0;
    return tB - tA;
  });
  const kept: Record<string, T> = {};
  for (const [k, v] of entries.slice(0, Math.max(1, maxEntries))) {
    kept[k] = v;
  }
  return kept;
}

/**
 * Loads the dedicated Phase 4 LocalStorage Enrichment Cache safely.
 * Keyed by canonical Product ID (for Product Detail & Review Insights) and Shop ID (for Shop Detail).
 * Corrupted JSON never crashes the app.
 */
export function loadEnrichmentCache(): EnrichmentCacheEnvelopeV1 {
  const storage = getStorage();
  if (!storage) return emptyCache();

  try {
    const raw = storage.getItem(ENRICHMENT_CACHE_STORAGE_KEY);
    if (!raw) {
      memoizedEnrichCacheRaw = null;
      memoizedEnrichCache = null;
      return emptyCache();
    }
    if (raw === memoizedEnrichCacheRaw && memoizedEnrichCache) {
      return {
        schemaVersion: memoizedEnrichCache.schemaVersion,
        updatedAt: memoizedEnrichCache.updatedAt,
        products: { ...memoizedEnrichCache.products },
        shops: { ...memoizedEnrichCache.shops },
        reviews: { ...memoizedEnrichCache.reviews },
      };
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return emptyCache();

    const env = parsed as Partial<EnrichmentCacheEnvelopeV1>;
    const products: Record<string, KalodataProductDetailEnrichmentRecord> = {};
    const shops: Record<string, KalodataShopEnrichmentRecord> = {};
    const reviews: Record<string, KalodataReviewInsightData> = {};

    if (env.products && typeof env.products === 'object') {
      for (const [k, v] of Object.entries(env.products)) {
        if (isValidProductDetailRecord(v)) products[k] = v;
      }
    }
    if (env.shops && typeof env.shops === 'object') {
      for (const [k, v] of Object.entries(env.shops)) {
        if (isValidShopRecord(v)) shops[k] = v;
      }
    }
    if (env.reviews && typeof env.reviews === 'object') {
      for (const [k, v] of Object.entries(env.reviews)) {
        if (isValidReviewRecord(v)) reviews[k] = v;
      }
    }

    const result: EnrichmentCacheEnvelopeV1 = {
      schemaVersion: ENRICHMENT_CACHE_SCHEMA_VERSION,
      updatedAt: typeof env.updatedAt === 'string' ? env.updatedAt : new Date().toISOString(),
      products,
      shops,
      reviews,
    };
    memoizedEnrichCacheRaw = raw;
    memoizedEnrichCache = result;
    return {
      schemaVersion: result.schemaVersion,
      updatedAt: result.updatedAt,
      products: { ...result.products },
      shops: { ...result.shops },
      reviews: { ...result.reviews },
    };
  } catch {
    memoizedEnrichCacheRaw = null;
    memoizedEnrichCache = null;
    return emptyCache();
  }
}

function persistEnrichmentCache(cache: EnrichmentCacheEnvelopeV1): StorageWriteResult {
  const storage = getStorage();
  if (!storage) {
    return {
      ok: false,
      quotaExceeded: false,
      bytesUsed: 0,
      errorEn: 'Browser localStorage is unavailable.',
      errorMy: 'Browser localStorage ကို အသုံးပြု၍ မရပါ။',
    };
  }

  const bounded: EnrichmentCacheEnvelopeV1 = {
    schemaVersion: ENRICHMENT_CACHE_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    products: pruneRecordMapByUpdatedAt(cache.products, MAX_ENRICHMENT_CACHE_ENTRIES_PER_BUCKET),
    shops: pruneRecordMapByUpdatedAt(cache.shops, MAX_ENRICHMENT_CACHE_ENTRIES_PER_BUCKET),
    reviews: pruneRecordMapByUpdatedAt(cache.reviews, MAX_ENRICHMENT_CACHE_ENTRIES_PER_BUCKET),
  };

  const tryWrite = (envelope: EnrichmentCacheEnvelopeV1): StorageWriteResult => {
    const serialized = JSON.stringify(envelope);
    storage.setItem(ENRICHMENT_CACHE_STORAGE_KEY, serialized);
    memoizedEnrichCacheRaw = serialized;
    memoizedEnrichCache = {
      schemaVersion: envelope.schemaVersion,
      updatedAt: envelope.updatedAt,
      products: { ...envelope.products },
      shops: { ...envelope.shops },
      reviews: { ...envelope.reviews },
    };
    return {
      ok: true,
      quotaExceeded: false,
      bytesUsed: serialized.length * 2,
    };
  };

  try {
    return tryWrite(bounded);
  } catch (err) {
    const quotaExceeded = isQuotaExceededError(err);
    // Prune oldest 50% of enrichment cache ONLY (never deleting Research History or Saved Products)
    if (quotaExceeded) {
      const totalEntries =
        Object.keys(bounded.products).length +
        Object.keys(bounded.shops).length +
        Object.keys(bounded.reviews).length;
      if (totalEntries > 2) {
        try {
          const reduced: EnrichmentCacheEnvelopeV1 = {
            schemaVersion: ENRICHMENT_CACHE_SCHEMA_VERSION,
            updatedAt: new Date().toISOString(),
            products: pruneRecordMapByUpdatedAt(
              bounded.products,
              Math.max(1, Math.floor(Object.keys(bounded.products).length / 2))
            ),
            shops: pruneRecordMapByUpdatedAt(
              bounded.shops,
              Math.max(1, Math.floor(Object.keys(bounded.shops).length / 2))
            ),
            reviews: pruneRecordMapByUpdatedAt(
              bounded.reviews,
              Math.max(1, Math.floor(Object.keys(bounded.reviews).length / 2))
            ),
          };
          return tryWrite(reduced);
        } catch {
          // Fall through to structured quota warning
        }
      }
    }
    return {
      ok: false,
      quotaExceeded,
      bytesUsed: 0,
      errorEn: quotaExceeded
        ? 'Browser localStorage quota is full — enriched Kalodata data could not be saved locally. Delete older Research History records to free space.'
        : 'Unable to save enriched Kalodata data to browser localStorage.',
      errorMy: quotaExceeded
        ? 'Browser localStorage နေရာပြည့်နေသဖြင့် ဖြည့်စွက်ထားသော Kalodata ဒေတာကို သိမ်းဆည်း၍ မရပါ။ ရှာဖွေမှု မှတ်တမ်း အဟောင်းအချို့ကို ဖျက်ပြီး နေရာလွတ်ဖန်တီးပါ။'
        : 'ဖြည့်စွက်ထားသော Kalodata ဒေတာကို Browser localStorage ထဲသို့ သိမ်းဆည်း၍ မရပါ။',
    };
  }
}

export function getCachedEnrichmentForProduct(product: ResearchProduct): {
  productDetail: KalodataProductDetailEnrichmentRecord | null;
  shopDetail: KalodataShopEnrichmentRecord | null;
  reviewInsight: KalodataReviewInsightData | null;
} {
  const cache = loadEnrichmentCache();
  const productId = getCanonicalProductId(product);
  const productDetail = cache.products[productId] ?? null;
  const shopId = getCanonicalShopId(product) ?? productDetail?.productShopId ?? null;
  const shopDetail = shopId ? (cache.shops[shopId] ?? null) : null;
  const reviewInsight = cache.reviews[productId] ?? null;
  return { productDetail, shopDetail, reviewInsight };
}

export function getCachedShopById(shopId: string): KalodataShopEnrichmentRecord | null {
  if (!shopId || !shopId.trim()) return null;
  const cache = loadEnrichmentCache();
  return cache.shops[shopId.trim()] ?? null;
}

export function saveEnrichmentToCache(params: {
  productDetail?: KalodataProductDetailEnrichmentRecord | null;
  shopDetail?: KalodataShopEnrichmentRecord | null;
  reviewInsight?: KalodataReviewInsightData | null;
}): StorageWriteResult {
  const cache = loadEnrichmentCache();
  let modified = false;

  const normalizeProductKey = (rawId: string): string =>
    rawId.trim().replace(/^(?:kalodata-th-|kd[_-])/i, '').trim() || rawId.trim();

  if (params.productDetail && params.productDetail.productId) {
    const key = normalizeProductKey(params.productDetail.productId);
    cache.products[key] = { ...params.productDetail, productId: key };
    modified = true;
  }
  if (params.shopDetail && params.shopDetail.shopId) {
    const shopKey = params.shopDetail.shopId.trim();
    cache.shops[shopKey] = { ...params.shopDetail, shopId: shopKey };
    modified = true;
  }
  if (params.reviewInsight && params.reviewInsight.productId) {
    const key = normalizeProductKey(params.reviewInsight.productId);
    cache.reviews[key] = { ...params.reviewInsight, productId: key };
    modified = true;
  }

  if (!modified) {
    return { ok: true, quotaExceeded: false, bytesUsed: 0 };
  }

  return persistEnrichmentCache(cache);
}

const FORBIDDEN_CACHE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function replaceOrMergeEnrichmentCache(
  incoming: Partial<EnrichmentCacheEnvelopeV1> | null | undefined,
  mode: 'merge' | 'replace'
): StorageWriteResult {
  const target: EnrichmentCacheEnvelopeV1 =
    mode === 'replace' ? emptyCache() : loadEnrichmentCache();

  if (incoming && typeof incoming === 'object') {
    if (incoming.products && typeof incoming.products === 'object') {
      for (const [k, v] of Object.entries(incoming.products)) {
        if (!k || FORBIDDEN_CACHE_KEYS.has(k) || !isValidProductDetailRecord(v)) continue;
        target.products[k] = { ...v };
      }
    }
    if (incoming.shops && typeof incoming.shops === 'object') {
      for (const [k, v] of Object.entries(incoming.shops)) {
        if (!k || FORBIDDEN_CACHE_KEYS.has(k) || !isValidShopRecord(v)) continue;
        target.shops[k] = { ...v };
      }
    }
    if (incoming.reviews && typeof incoming.reviews === 'object') {
      for (const [k, v] of Object.entries(incoming.reviews)) {
        if (!k || FORBIDDEN_CACHE_KEYS.has(k) || !isValidReviewRecord(v)) continue;
        target.reviews[k] = { ...v };
      }
    }
  }

  return persistEnrichmentCache(target);
}

/**
 * Extracts and caches any Product Detail, Shop Detail, or Review Insight already returned
 * during Balanced or Deep Product Hunting so future products or sessions reuse them at 0 credits.
 */
export function absorbProductsIntoEnrichmentCache(
  products: readonly ResearchProduct[]
): StorageWriteResult {
  if (products.length === 0) {
    return { ok: true, quotaExceeded: false, bytesUsed: 0 };
  }

  const cache = loadEnrichmentCache();
  let modified = false;

  for (const product of products) {
    const m = product.kalodataMetrics;
    if (!m) continue;
    const timestamp = m.lastEnrichedAt ?? product.researchedAt ?? new Date().toISOString();

    const canonicalProdKey = getCanonicalProductId(product);

    if (m.detailEnriched && (m.productId || canonicalProdKey)) {
      const key = canonicalProdKey || m.productId!.trim();
      cache.products[key] = {
        productId: key,
        productShopId: m.sellerId ?? null,
        ...(m.sellerName ? { sellerName: m.sellerName } : {}),
        ...(m.priCategory ? { priCategory: m.priCategory } : {}),
        ...(m.secCategory ? { secCategory: m.secCategory } : {}),
        ...(m.terCategory ? { terCategory: m.terCategory } : {}),
        ...(m.revenueGrowthRate !== null && m.revenueGrowthRate !== undefined
          ? { revenueGrowthRate: m.revenueGrowthRate }
          : {}),
        ...(m.showcaseRevenueThb !== null && m.showcaseRevenueThb !== undefined
          ? { showcaseRevenueThb: m.showcaseRevenueThb }
          : {}),
        ...(m.skuCount !== null && m.skuCount !== undefined ? { skuCount: m.skuCount } : {}),
        minPriceThb: m.minPriceThb ?? null,
        maxPriceThb: m.maxPriceThb ?? null,
        unitPriceThb: m.unitPriceThb ?? product.priceThb,
        revenueThb: m.revenueThb ?? null,
        salesVolume: m.salesVolume ?? null,
        videoRevenueThb: m.videoRevenueThb ?? null,
        liveRevenueThb: m.liveRevenueThb ?? null,
        shoppingMallRevenueThb: m.shoppingMallRevenueThb ?? null,
        commissionRatePct: m.commissionRatePct ?? product.commissionRate,
        creatorNumber: m.creatorNumber ?? null,
        videoNumber: m.videoNumber ?? null,
        liveNumber: m.liveNumber ?? null,
        deliveryType: m.deliveryType ?? null,
        productReviewCount: m.productReviewCount ?? product.reviewCount ?? null,
        ...(m.productDescription ? { productDescription: m.productDescription } : {}),
        launchDate: m.launchDate ?? null,
        trendPointsCount: m.trendPointsCount ?? 0,
        trendPeakThb: m.trendPeakThb ?? null,
        trendAvgThb: m.trendAvgThb ?? null,
        dateRange: m.dateRange,
        updatedAt: m.productDetailUpdatedAt ?? timestamp,
      };
      modified = true;
    }

    if (m.shopEnriched && m.sellerId) {
      const shopKey = m.sellerId.trim();
      cache.shops[shopKey] = {
        shopId: shopKey,
        shopName: m.sellerName ?? (product.shopName !== 'Unavailable' ? product.shopName : null),
        sellerType: m.shopSellerType ?? null,
        revenueThb: m.shopRevenueThb ?? null,
        affiliateRevenueThb: m.shopAffiliateRevenueThb ?? null,
        selfAccountRevenueThb: m.shopSelfAccountRevenueThb ?? null,
        shoppingMallRevenueThb: m.shopShoppingMallRevenueThb ?? null,
        salesVolume: m.shopSalesVolume ?? null,
        unitPriceThb: m.shopUnitPriceThb ?? null,
        creatorNumber: m.shopCreatorNumber ?? null,
        productNumber: m.shopProductNumber ?? null,
        videoNumber: m.shopVideoNumber ?? null,
        liveNumber: m.shopLiveNumber ?? null,
        dateRange: m.dateRange,
        updatedAt: m.shopDetailUpdatedAt ?? timestamp,
      };
      modified = true;
    }

    if (m.reviewInsightEnriched && m.reviewInsight && (m.productId || canonicalProdKey)) {
      const key = canonicalProdKey || m.productId!.trim();
      cache.reviews[key] = { ...m.reviewInsight, productId: key };
      modified = true;
    }
  }

  if (!modified) {
    return { ok: true, quotaExceeded: false, bytesUsed: 0 };
  }

  return persistEnrichmentCache(cache);
}

/**
 * Hydrates a product strictly from local enrichment cache (0 API calls) if any missing layer
 * (such as a shared Shop Detail from another product!) is already cached locally.
 */
export function hydrateProductFromEnrichmentCache(
  product: ResearchProduct,
  scoringOptions?: {
    salesWeightPct?: number;
    peerProducts?: readonly ResearchProduct[];
  }
): { product: ResearchProduct; hydrated: boolean } {
  const cached = getCachedEnrichmentForProduct(product);
  const m = product.kalodataMetrics;

  const missingProductDetail = !m?.detailEnriched && Boolean(cached.productDetail);
  const missingShopDetail = !m?.shopEnriched && Boolean(cached.shopDetail);
  const missingReview = !m?.reviewInsightEnriched && Boolean(cached.reviewInsight);

  if (!missingProductDetail && !missingShopDetail && !missingReview) {
    return { product, hydrated: false };
  }

  const merged = mergeEnrichmentIntoProduct(
    product,
    {
      productDetail: missingProductDetail ? cached.productDetail : null,
      shopDetail: missingShopDetail ? cached.shopDetail : null,
      reviewInsight: missingReview ? cached.reviewInsight : null,
    },
    scoringOptions
  );

  return { product: merged.product, hydrated: merged.changed };
}
