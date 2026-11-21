import type {
  CompetitionLevel,
  DataStatus,
  EnrichmentLayerKey,
  EnrichmentLayerPlanItem,
  KalodataProductDetailEnrichmentRecord,
  KalodataProductMetrics,
  KalodataReviewInsightData,
  KalodataReviewPoint,
  KalodataShopEnrichmentRecord,
  ProductEnrichmentPlan,
  ResearchDepthTag,
  ResearchProduct,
} from '../types/product.ts';
import {
  DEFAULT_SPENDING_LIMIT_CREDITS,
  KALODATA_COMMENT_INSIGHT_CREDIT,
  KALODATA_PRODUCT_DETAIL_CREDIT,
  KALODATA_SHOP_DETAIL_CREDIT,
  KALODATA_USD_PER_CREDIT,
} from './kalodataPricing.ts';
import { evaluateProductOpportunity, getCanonicalProductId } from './scoring.ts';
import { detectMyanmarLanguageForProduct } from './myanmarLanguageDetector.ts';

function roundCredits(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function roundUsd(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function formatThbInline(val: number | null | undefined): string {
  if (typeof val !== 'number' || !Number.isFinite(val)) return '—';
  return `฿${Math.round(val).toLocaleString('en-US')}`;
}

export function getCanonicalShopId(product: ResearchProduct): string | null {
  const id = product.kalodataMetrics?.sellerId?.trim();
  return id && id.length > 0 ? id : null;
}

const QUALITY_CAUTION_KEYWORDS = [
  'quality',
  'broken',
  'damage',
  'damaged',
  'leak',
  'leaking',
  'thin',
  'cheap',
  'smell',
  'odor',
  'scent',
  'size',
  'sizing',
  'small',
  'tight',
  'loose',
  'fit',
  'fabric',
  'material',
  'color',
  'colour',
  'shade',
  'fake',
  'authentic',
  'allergy',
  'irritat',
  'dry',
  'sticky',
  'oily',
  'texture',
  'packaging',
  'crack',
  'tear',
  'stitch',
  'seam',
  'shrink',
  'fade',
  'expire',
  'defect',
  'poor',
  'flimsy',
  'not durable',
  'คุณภาพ',
  'ขาด',
  'พัง',
  'รั่ว',
  'บาง',
  'ไซส์',
  'สี',
  'กลิ่น',
  'แพ้',
  'ปลอม',
  'เนื้อผ้า',
  'บรรจุภัณฑ์',
];

function dedupeReviewPoints(points: KalodataReviewPoint[]): KalodataReviewPoint[] {
  const seen = new Set<string>();
  const out: KalodataReviewPoint[] = [];
  for (const item of points) {
    const clean = item.point.trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      point: clean,
      mentions: Math.max(1, Math.round(item.mentions || 1)),
    });
  }
  out.sort((a, b) => b.mentions - a.mentions);
  return out;
}

/**
 * Structures raw Kalodata comment/insight points into the 5 buyer insight dimensions
 * strictly from verified Kalodata review points — NEVER invents opinions when empty.
 */
export function buildStructuredReviewInsight(params: {
  productId: string;
  summary: string | null;
  positivePoints: KalodataReviewPoint[];
  painPoints: KalodataReviewPoint[];
  usageScenarios: KalodataReviewPoint[];
  commentsAnalyzed: number;
  averageRating: number | null;
  ratedCommentCount: number;
  rawComments?: string[];
  pagesFetched?: number;
  updatedAt?: string;
}): KalodataReviewInsightData {
  const positivePoints = dedupeReviewPoints(params.positivePoints);
  const painPoints = dedupeReviewPoints(params.painPoints);
  const usageScenarios = dedupeReviewPoints(params.usageScenarios);

  // Frequent complaints: repeated complaints (mentions >= 2) or top ranked pain points
  const repeatedComplaints = painPoints.filter((p) => p.mentions >= 2);
  const frequentComplaints = (repeatedComplaints.length > 0 ? repeatedComplaints : painPoints).slice(
    0,
    5
  );

  // Quality cautions: strictly filtered from real pain points related to material, fit, packaging, quality, safety
  const qualityMatched = painPoints.filter((p) => {
    const lower = p.point.toLowerCase();
    return QUALITY_CAUTION_KEYWORDS.some((kw) => lower.includes(kw));
  });
  const qualityCautions = qualityMatched.slice(0, 5);

  // Buyer needs: strictly derived from verified usage_scenarios (or high-mention buyer praise drivers when scenarios empty)
  const buyerNeeds =
    usageScenarios.length > 0
      ? usageScenarios.slice(0, 5)
      : positivePoints.slice(0, 3);

  return {
    productId: params.productId,
    summary: params.summary && params.summary.trim().length > 0 ? params.summary.trim() : null,
    positivePoints: positivePoints.slice(0, 6),
    painPoints: painPoints.slice(0, 6),
    frequentComplaints,
    qualityCautions,
    buyerNeeds,
    usageScenarios: usageScenarios.slice(0, 6),
    commentsAnalyzed: Math.max(0, Math.round(params.commentsAnalyzed || 0)),
    averageRating:
      typeof params.averageRating === 'number' &&
      Number.isFinite(params.averageRating) &&
      params.averageRating >= 1 &&
      params.averageRating <= 5
        ? Math.round(params.averageRating * 10) / 10
        : null,
    ratedCommentCount: Math.max(0, Math.round(params.ratedCommentCount || 0)),
    ...(Array.isArray(params.rawComments) && params.rawComments.length > 0
      ? {
          rawComments: params.rawComments
            .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
            .map((c) => c.trim().slice(0, 300))
            .slice(0, 60),
        }
      : {}),
    ...(typeof params.pagesFetched === 'number' && params.pagesFetched >= 1
      ? { pagesFetched: Math.floor(params.pagesFetched) }
      : {}),
    updatedAt: params.updatedAt ?? new Date().toISOString(),
  };
}

export interface ProductEnrichmentCoverage {
  hasKalodataId: boolean;
  canonicalProductId: string;
  shopId: string | null;
  hasProductDetail: boolean;
  hasShopDetail: boolean;
  hasReviewInsights: boolean;
  missingCoreDetailFields: string[];
  missingShopFields: string[];
}

export function isValidKalodataId(id: string | null | undefined): boolean {
  if (!id) return false;
  const trimmed = id.trim();
  // Kalodata product/shop IDs are numeric strings (typically 10-22 digits)
  return /^\d{5,30}$/.test(trimmed);
}

/**
 * Inspects what Kalodata data is already present on a product so we NEVER re-fetch existing data.
 */
export function getProductEnrichmentCoverage(product: ResearchProduct): ProductEnrichmentCoverage {
  const m = product.kalodataMetrics;
  const canonicalProductId = getCanonicalProductId(product);
  const shopId = getCanonicalShopId(product);
  const hasKalodataId = Boolean(m?.productId && isValidKalodataId(m.productId));

  const hasProductDetail = Boolean(
    m?.detailEnriched === true ||
      (typeof m?.creatorNumber === 'number' &&
        (typeof m?.videoNumber === 'number' || typeof m?.minPriceThb === 'number'))
  );

  const hasShopDetail = Boolean(
    m?.shopEnriched === true ||
      (typeof m?.shopRevenueThb === 'number' && Boolean(m?.shopSellerType))
  );

  const hasReviewInsights = Boolean(
    m?.reviewInsightEnriched === true ||
      (m?.reviewInsight &&
        (m.reviewInsight.summary ||
          m.reviewInsight.positivePoints.length > 0 ||
          m.reviewInsight.painPoints.length > 0 ||
          m.reviewInsight.commentsAnalyzed > 0))
  );

  const missingCoreDetailFields: string[] = [];
  if (m?.creatorNumber === null || m?.creatorNumber === undefined) missingCoreDetailFields.push('creatorNumber');
  if (m?.minPriceThb === null || m?.minPriceThb === undefined) missingCoreDetailFields.push('priceRange');
  if (m?.productReviewCount === null || m?.productReviewCount === undefined) {
    missingCoreDetailFields.push('reviewCount');
  }
  if (m?.videoNumber === null || m?.videoNumber === undefined) missingCoreDetailFields.push('videoNumber');
  if (!m?.deliveryType) missingCoreDetailFields.push('deliveryType');

  const missingShopFields: string[] = [];
  if (!m?.shopSellerType) missingShopFields.push('shopSellerType');
  if (m?.shopRevenueThb === null || m?.shopRevenueThb === undefined) missingShopFields.push('shopRevenueThb');
  if (m?.shopAffiliateRevenueThb === null || m?.shopAffiliateRevenueThb === undefined) {
    missingShopFields.push('shopAffiliateRevenueThb');
  }
  if (m?.shopCreatorNumber === null || m?.shopCreatorNumber === undefined) {
    missingShopFields.push('shopCreatorNumber');
  }

  return {
    hasKalodataId,
    canonicalProductId,
    shopId,
    hasProductDetail,
    hasShopDetail,
    hasReviewInsights,
    missingCoreDetailFields,
    missingShopFields,
  };
}

export interface EnrichmentSelection {
  productDetail: boolean;
  shopDetail: boolean;
  reviewInsights: boolean;
}

export interface EnrichmentPlanOptions {
  spendingLimitCredits?: number;
  forceRefresh?: boolean;
  cachedProductDetail?: KalodataProductDetailEnrichmentRecord | null;
  cachedShopDetail?: KalodataShopEnrichmentRecord | null;
  cachedReviewInsight?: KalodataReviewInsightData | null;
}

/**
 * Shared client + server Enrichment Cost & Deduplication Planner.
 * - Inspects existing product fields + cached product/shop/review records BEFORE any API call.
 * - Guarantees 0 duplicate API calls when data already exists or is cached by Product ID / Shop ID.
 * - Computes exact API call count, credits, USD, and Spending Limit enforcement.
 */
export function planProductEnrichment(
  product: ResearchProduct,
  selection: EnrichmentSelection,
  options?: EnrichmentPlanOptions
): ProductEnrichmentPlan {
  const coverage = getProductEnrichmentCoverage(product);
  const spendingLimitCredits =
    typeof options?.spendingLimitCredits === 'number' &&
    Number.isFinite(options.spendingLimitCredits) &&
    options.spendingLimitCredits > 0
      ? options.spendingLimitCredits
      : DEFAULT_SPENDING_LIMIT_CREDITS;
  const forceRefresh = options?.forceRefresh === true;

  const layers = {} as Record<EnrichmentLayerKey, EnrichmentLayerPlanItem>;

  // 1. Product Detail (0.1 Credit)
  if (!selection.productDetail) {
    layers.productDetail = {
      layer: 'productDetail',
      requested: false,
      action: 'not-requested',
      estimatedCredits: 0,
      estimatedUsd: 0,
      apiCalls: 0,
      reasonEn: 'Not selected for enrichment.',
      reasonMy: 'ဖြည့်စွက်ရန် မရွေးချယ်ထားပါ။',
    };
  } else if (!coverage.hasKalodataId) {
    layers.productDetail = {
      layer: 'productDetail',
      requested: true,
      action: 'skip-missing-id',
      estimatedCredits: 0,
      estimatedUsd: 0,
      apiCalls: 0,
      reasonEn: 'Kalodata Product ID is unavailable for this record.',
      reasonMy: 'ဤ Product အတွက် Kalodata Product ID မရှိပါ။',
    };
  } else if (!forceRefresh && coverage.hasProductDetail) {
    layers.productDetail = {
      layer: 'productDetail',
      requested: true,
      action: 'already-present',
      estimatedCredits: 0,
      estimatedUsd: 0,
      apiCalls: 0,
      reasonEn: 'Product Detail is already enriched on this product (0 credits).',
      reasonMy: 'Product Detail ဒေတာရှိပြီးသားဖြစ်၍ ထပ်မခေါ်ပါ (0 credits)။',
    };
  } else if (!forceRefresh && options?.cachedProductDetail) {
    layers.productDetail = {
      layer: 'productDetail',
      requested: true,
      action: 'reuse-cache',
      estimatedCredits: 0,
      estimatedUsd: 0,
      apiCalls: 0,
      reasonEn: 'Reusing cached Kalodata Product Detail for this Product ID (0 credits).',
      reasonMy: 'ဤ Product ID အတွက် သိမ်းထားပြီးသား Product Detail ကို ပြန်အသုံးပြုပါမည် (0 credits)။',
    };
  } else {
    layers.productDetail = {
      layer: 'productDetail',
      requested: true,
      action: 'fetch',
      estimatedCredits: KALODATA_PRODUCT_DETAIL_CREDIT,
      estimatedUsd: roundUsd(KALODATA_PRODUCT_DETAIL_CREDIT * KALODATA_USD_PER_CREDIT),
      apiCalls: 1,
      reasonEn: '1 Kalodata Product Detail API call (0.1 credit) — adds Creator Count, Price Range, Review Count, Videos & Delivery.',
      reasonMy: 'Kalodata Product Detail API ၁ ကြိမ် (0.1 credit) — Creator Count၊ ဈေးနှုန်းအပိုင်းအခြား၊ Review အရေအတွက်နှင့် Video ဒေတာများ ဖြည့်ပေးပါမည်။',
    };
  }

  // 2. Shop Detail (0.1 Credit, deduplicated by Shop ID)
  const effectiveShopId =
    coverage.shopId ?? options?.cachedProductDetail?.productShopId ?? null;
  const canResolveShopFromDetail =
    !effectiveShopId &&
    (layers.productDetail.action === 'fetch' || layers.productDetail.action === 'reuse-cache');

  if (!selection.shopDetail) {
    layers.shopDetail = {
      layer: 'shopDetail',
      requested: false,
      action: 'not-requested',
      estimatedCredits: 0,
      estimatedUsd: 0,
      apiCalls: 0,
      reasonEn: 'Not selected for enrichment.',
      reasonMy: 'ဖြည့်စွက်ရန် မရွေးချယ်ထားပါ။',
    };
  } else if (!forceRefresh && coverage.hasShopDetail) {
    layers.shopDetail = {
      layer: 'shopDetail',
      requested: true,
      action: 'already-present',
      estimatedCredits: 0,
      estimatedUsd: 0,
      apiCalls: 0,
      reasonEn: 'Shop Detail is already enriched on this product (0 credits).',
      reasonMy: 'Shop Detail ဒေတာရှိပြီးသားဖြစ်၍ ထပ်မခေါ်ပါ (0 credits)။',
    };
  } else if (!forceRefresh && options?.cachedShopDetail) {
    layers.shopDetail = {
      layer: 'shopDetail',
      requested: true,
      action: 'reuse-cache',
      estimatedCredits: 0,
      estimatedUsd: 0,
      apiCalls: 0,
      reasonEn: `Reusing cached Shop Detail for Shop #${options.cachedShopDetail.shopId} (0 credits · duplicate call prevented).`,
      reasonMy: `Shop #${options.cachedShopDetail.shopId} အတွက် သိမ်းထားပြီးသား Shop Detail ကို ပြန်သုံးပါမည် (0 credits · ထပ်ခါထပ်ခါခေါ်မှု ကာကွယ်ပြီး)။`,
    };
  } else if (!effectiveShopId && !canResolveShopFromDetail) {
    layers.shopDetail = {
      layer: 'shopDetail',
      requested: true,
      action: 'skip-missing-id',
      estimatedCredits: 0,
      estimatedUsd: 0,
      apiCalls: 0,
      reasonEn: 'Shop ID is unavailable — enable Product Detail first to resolve Seller/Shop ID.',
      reasonMy: 'Shop ID မရှိသေးပါ — Seller/Shop ID ရယူရန် Product Detail ကို အရင်ရွေးချယ်ပါ။',
    };
  } else {
    layers.shopDetail = {
      layer: 'shopDetail',
      requested: true,
      action: 'fetch',
      estimatedCredits: KALODATA_SHOP_DETAIL_CREDIT,
      estimatedUsd: roundUsd(KALODATA_SHOP_DETAIL_CREDIT * KALODATA_USD_PER_CREDIT),
      apiCalls: 1,
      reasonEn: effectiveShopId
        ? `1 Kalodata Shop Detail API call for Shop #${effectiveShopId} (0.1 credit) — shared automatically with all products from this shop.`
        : 'Up to 1 Kalodata Shop Detail API call (0.1 credit) after Product Detail resolves Shop ID (reused free if already cached).',
      reasonMy: effectiveShopId
        ? `Shop #${effectiveShopId} အတွက် Shop Detail API ၁ ကြိမ် (0.1 credit) — ဤဆိုင်၏ အခြား Product များတွင်လည်း အလိုအလျောက် ပြန်အသုံးပြုပေးပါမည်။`
        : 'Product Detail မှ Shop ID ရရှိပြီးနောက် Shop Detail API ၁ ကြိမ် (0.1 credit) ခေါ်ပါမည် (Cache ရှိပြီးသားဆို 0 credits)။',
    };
  }

  // 3. Review & Customer Insights (1.0 Credit — explicitly opt-in)
  if (!selection.reviewInsights) {
    layers.reviewInsights = {
      layer: 'reviewInsights',
      requested: false,
      action: 'not-requested',
      estimatedCredits: 0,
      estimatedUsd: 0,
      apiCalls: 0,
      reasonEn: 'Not selected (Review Insight API costs 1.0 credit per product).',
      reasonMy: 'မရွေးချယ်ထားပါ (Review Insight API သည် Product ၁ ခုလျှင် 1.0 credit ကုန်ကျသည်)။',
    };
  } else if (!coverage.hasKalodataId) {
    layers.reviewInsights = {
      layer: 'reviewInsights',
      requested: true,
      action: 'skip-missing-id',
      estimatedCredits: 0,
      estimatedUsd: 0,
      apiCalls: 0,
      reasonEn: 'Kalodata Product ID is unavailable for this record.',
      reasonMy: 'ဤ Product အတွက် Kalodata Product ID မရှိပါ။',
    };
  } else if (!forceRefresh && coverage.hasReviewInsights) {
    layers.reviewInsights = {
      layer: 'reviewInsights',
      requested: true,
      action: 'already-present',
      estimatedCredits: 0,
      estimatedUsd: 0,
      apiCalls: 0,
      reasonEn: 'Buyer Review Insights are already loaded on this product (0 credits).',
      reasonMy: 'Buyer Review Insights ဒေတာရှိပြီးသားဖြစ်၍ ထပ်မခေါ်ပါ (0 credits)။',
    };
  } else if (!forceRefresh && options?.cachedReviewInsight) {
    layers.reviewInsights = {
      layer: 'reviewInsights',
      requested: true,
      action: 'reuse-cache',
      estimatedCredits: 0,
      estimatedUsd: 0,
      apiCalls: 0,
      reasonEn: 'Reusing cached Kalodata Review Insights for this Product ID (0 credits).',
      reasonMy: 'ဤ Product ID အတွက် သိမ်းထားပြီးသား Review Insights ကို ပြန်သုံးပါမည် (0 credits)။',
    };
  } else {
    layers.reviewInsights = {
      layer: 'reviewInsights',
      requested: true,
      action: 'fetch',
      estimatedCredits: KALODATA_COMMENT_INSIGHT_CREDIT,
      estimatedUsd: roundUsd(KALODATA_COMMENT_INSIGHT_CREDIT * KALODATA_USD_PER_CREDIT),
      apiCalls: 1,
      reasonEn: '1 Kalodata Comment Insight API call (1.0 credit) — extracts real buyer likes, dislikes, complaints, quality cautions & buyer needs.',
      reasonMy: 'Kalodata Comment Insight API ၁ ကြိမ် (1.0 credit) — ဝယ်သူများ၏ တကယ့် Review အားသာချက်၊ Complaint နှင့် လိုအပ်ချက်များကို ရယူပါမည်။',
    };
  }

  const allItems = [layers.productDetail, layers.shopDetail, layers.reviewInsights];
  const plannedApiCalls = allItems.reduce((sum, item) => sum + item.apiCalls, 0);
  const estimatedCredits = roundCredits(
    allItems.reduce((sum, item) => sum + item.estimatedCredits, 0)
  );
  const estimatedUsd = roundUsd(estimatedCredits * KALODATA_USD_PER_CREDIT);
  const reusedFromCacheCount = allItems.filter((item) => item.action === 'reuse-cache').length;
  const alreadyPresentCount = allItems.filter((item) => item.action === 'already-present').length;
  const exceedsSpendingLimit =
    estimatedCredits > 0 && estimatedCredits > spendingLimitCredits + 1e-6;

  return {
    canonicalProductId: coverage.canonicalProductId,
    shopId: effectiveShopId,
    layers,
    plannedApiCalls,
    estimatedCredits,
    estimatedUsd,
    reusedFromCacheCount,
    alreadyPresentCount,
    spendingLimitCredits,
    exceedsSpendingLimit,
    requiresConfirmation: plannedApiCalls > 0,
  };
}

function deriveCompetition(creatorNumber: number): {
  level: CompetitionLevel;
  rawStrength: number;
} {
  if (creatorNumber <= 25) return { level: 'Low', rawStrength: 86 };
  if (creatorNumber <= 120) return { level: 'Moderate', rawStrength: 68 };
  return { level: 'High', rawStrength: 44 };
}

function deriveSellerReliability(shop: KalodataShopEnrichmentRecord): {
  level: 'Reliable' | 'Standard' | 'Needs Check';
  rawStrength: number;
} {
  const isBrand = (shop.sellerType ?? '').toUpperCase() === 'BRAND';
  const rev = shop.revenueThb ?? 0;
  const affRev = shop.affiliateRevenueThb ?? 0;
  const affShare = rev > 0 ? affRev / rev : 0;

  let score = 58;
  if (isBrand) score += 20;
  if (rev >= 10_000_000) score += 14;
  else if (rev >= 1_000_000) score += 9;
  else if (rev >= 200_000) score += 4;
  if (affShare >= 0.15) score += 6;

  const clamped = Math.max(40, Math.min(96, score));
  const level = clamped >= 78 ? 'Reliable' : clamped >= 58 ? 'Standard' : 'Needs Check';
  return { level, rawStrength: clamped };
}

export interface EnrichmentBundle {
  productDetail?: KalodataProductDetailEnrichmentRecord | null;
  shopDetail?: KalodataShopEnrichmentRecord | null;
  reviewInsight?: KalodataReviewInsightData | null;
  enrichedAt?: string;
}

/**
 * Non-destructively merges verified Kalodata Product Detail, Shop Detail, and Review Insights
 * into an existing ResearchProduct and recalculates Phase 2 scores ONLY when real new data arrived.
 * - If no new data is supplied, returns the exact original product unchanged (never alters score improperly).
 */
export function mergeEnrichmentIntoProduct(
  product: ResearchProduct,
  bundle: EnrichmentBundle,
  scoringOptions?: {
    salesWeightPct?: number;
    peerProducts?: readonly ResearchProduct[];
  }
): { product: ResearchProduct; changed: boolean } {
  const pd = bundle.productDetail ?? null;
  const sd = bundle.shopDetail ?? null;
  const ri = bundle.reviewInsight ?? null;

  if (!pd && !sd && !ri) {
    return { product, changed: false };
  }

  const nowIso = bundle.enrichedAt ?? new Date().toISOString();
  const prevMetrics: KalodataProductMetrics = product.kalodataMetrics ?? {
    productId: getCanonicalProductId(product),
    dateRange: 'last30Day',
    unitPriceThb: product.priceThb,
    salesVolume: null,
    revenueThb: null,
    revenueGrowthRate: null,
    commissionRatePct: product.commissionRate,
    liveRevenueThb: null,
    videoRevenueThb: null,
    showcaseRevenueThb: null,
    launchDate: null,
    sellerId: null,
    sellerName: product.shopName !== 'Unavailable' ? product.shopName : null,
    skuCount: null,
    priCategory: null,
    secCategory: null,
    terCategory: null,
    categoryIdsRequested: [],
  };

  const nextMetrics: KalodataProductMetrics = {
    ...prevMetrics,
    lastEnrichedAt: nowIso,
  };

  let changed = false;

  // 1. Merge Product Detail (non-destructive: only apply non-null verified fields)
  if (pd) {
    changed = true;
    nextMetrics.detailEnriched = true;
    nextMetrics.productDetailUpdatedAt = pd.updatedAt ?? nowIso;
    if (pd.productShopId) nextMetrics.sellerId = pd.productShopId;
    if (pd.sellerName) nextMetrics.sellerName = pd.sellerName;
    if (pd.priCategory) nextMetrics.priCategory = pd.priCategory;
    if (pd.secCategory) nextMetrics.secCategory = pd.secCategory;
    if (pd.terCategory) nextMetrics.terCategory = pd.terCategory;
    if (pd.unitPriceThb !== null && pd.unitPriceThb > 0) nextMetrics.unitPriceThb = pd.unitPriceThb;
    if (pd.minPriceThb !== null && pd.minPriceThb > 0) nextMetrics.minPriceThb = pd.minPriceThb;
    if (pd.maxPriceThb !== null && pd.maxPriceThb > 0) nextMetrics.maxPriceThb = pd.maxPriceThb;
    if (pd.revenueThb !== null) nextMetrics.revenueThb = pd.revenueThb;
    if (pd.revenueGrowthRate !== undefined && pd.revenueGrowthRate !== null) {
      nextMetrics.revenueGrowthRate = pd.revenueGrowthRate;
    }
    if (pd.salesVolume !== null) nextMetrics.salesVolume = pd.salesVolume;
    if (pd.videoRevenueThb !== null) nextMetrics.videoRevenueThb = pd.videoRevenueThb;
    if (pd.liveRevenueThb !== null) nextMetrics.liveRevenueThb = pd.liveRevenueThb;
    if (pd.showcaseRevenueThb !== undefined && pd.showcaseRevenueThb !== null) {
      nextMetrics.showcaseRevenueThb = pd.showcaseRevenueThb;
    }
    if (pd.shoppingMallRevenueThb !== null) {
      nextMetrics.shoppingMallRevenueThb = pd.shoppingMallRevenueThb;
    }
    if (pd.commissionRatePct !== null && pd.commissionRatePct > 0) {
      nextMetrics.commissionRatePct = pd.commissionRatePct;
    }
    if (pd.creatorNumber !== null) nextMetrics.creatorNumber = pd.creatorNumber;
    if (pd.videoNumber !== null) nextMetrics.videoNumber = pd.videoNumber;
    if (pd.liveNumber !== null) nextMetrics.liveNumber = pd.liveNumber;
    if (pd.skuCount !== undefined && pd.skuCount !== null && pd.skuCount > 0) {
      nextMetrics.skuCount = Math.round(pd.skuCount);
    }
    if (pd.deliveryType) nextMetrics.deliveryType = pd.deliveryType;
    if (pd.productReviewCount !== null && pd.productReviewCount > 0) {
      nextMetrics.productReviewCount = Math.round(pd.productReviewCount);
    }
    if (typeof pd.productDescription === 'string' && pd.productDescription.trim().length > 0) {
      nextMetrics.productDescription = pd.productDescription.trim();
    }
    if (pd.launchDate) nextMetrics.launchDate = pd.launchDate;
    if (pd.trendPointsCount > 0) {
      nextMetrics.trendPointsCount = pd.trendPointsCount;
      nextMetrics.trendPeakThb = pd.trendPeakThb;
      nextMetrics.trendAvgThb = pd.trendAvgThb;
    }
  }

  // 2. Merge Shop Detail (non-destructive)
  if (sd) {
    changed = true;
    nextMetrics.shopEnriched = true;
    nextMetrics.shopDetailUpdatedAt = sd.updatedAt ?? nowIso;
    if (sd.shopId) nextMetrics.sellerId = sd.shopId;
    if (sd.shopName) nextMetrics.sellerName = sd.shopName;
    if (sd.sellerType) nextMetrics.shopSellerType = sd.sellerType;
    if (sd.revenueThb !== null) nextMetrics.shopRevenueThb = sd.revenueThb;
    if (sd.affiliateRevenueThb !== null) {
      nextMetrics.shopAffiliateRevenueThb = sd.affiliateRevenueThb;
    }
    if (sd.selfAccountRevenueThb !== null) {
      nextMetrics.shopSelfAccountRevenueThb = sd.selfAccountRevenueThb;
    }
    if (sd.shoppingMallRevenueThb !== null) {
      nextMetrics.shopShoppingMallRevenueThb = sd.shoppingMallRevenueThb;
    }
    if (sd.salesVolume !== null) nextMetrics.shopSalesVolume = sd.salesVolume;
    if (sd.unitPriceThb !== null) nextMetrics.shopUnitPriceThb = sd.unitPriceThb;
    if (sd.creatorNumber !== null) nextMetrics.shopCreatorNumber = sd.creatorNumber;
    if (sd.productNumber !== null) nextMetrics.shopProductNumber = sd.productNumber;
    if (sd.videoNumber !== null) nextMetrics.shopVideoNumber = sd.videoNumber;
    if (sd.liveNumber !== null) nextMetrics.shopLiveNumber = sd.liveNumber;
  }

  // 3. Merge Review & Customer Insights (non-destructive)
  if (ri) {
    changed = true;
    nextMetrics.reviewInsightEnriched = true;
    nextMetrics.reviewInsightUpdatedAt = ri.updatedAt ?? nowIso;
    nextMetrics.reviewInsight = ri;
  }

  if (!changed) {
    return { product, changed: false };
  }

  // Derive upgraded top-level product fields from merged Kalodata metrics
  const priceThb =
    nextMetrics.unitPriceThb !== null && nextMetrics.unitPriceThb > 0
      ? Math.round(nextMetrics.unitPriceThb * 100) / 100
      : product.priceThb;
  const priceStatus: DataStatus =
    priceThb !== null && priceThb > 0 ? 'verified' : product.priceStatus ?? 'unavailable';

  const commissionRate =
    nextMetrics.commissionRatePct !== null && nextMetrics.commissionRatePct > 0
      ? nextMetrics.commissionRatePct
      : product.commissionRate;
  const commissionVerified = commissionRate !== null && commissionRate > 0;
  const commissionStatus: DataStatus = commissionVerified
    ? 'verified'
    : product.commissionStatus ?? 'unavailable';
  const estimatedCommissionPerSaleThb =
    commissionVerified && commissionRate !== null && priceThb !== null && priceThb > 0
      ? Math.round((priceThb * commissionRate) / 100)
      : product.estimatedCommissionPerSaleThb ?? null;
  const commissionPerSaleStatus: DataStatus =
    estimatedCommissionPerSaleThb !== null ? 'verified' : 'unavailable';

  const shopName = nextMetrics.sellerName ?? product.shopName;
  const brand =
    nextMetrics.shopSellerType?.toUpperCase() === 'BRAND' && nextMetrics.sellerName
      ? nextMetrics.sellerName
      : product.brand;
  const sellerStatus: DataStatus =
    nextMetrics.sellerName || nextMetrics.sellerId
      ? 'verified'
      : product.sellerStatus ?? 'unavailable';

  const creatorNumber = nextMetrics.creatorNumber ?? null;
  const hasVerifiedComp = typeof creatorNumber === 'number' && creatorNumber >= 0;
  const compDerived = hasVerifiedComp ? deriveCompetition(creatorNumber) : null;
  const competitionLevel = compDerived?.level ?? product.competitionLevel;
  const competitionStatus: DataStatus = hasVerifiedComp
    ? 'verified'
    : product.competitionStatus ?? 'unavailable';

  const hasVerifiedShop = Boolean(
    nextMetrics.shopEnriched &&
      (nextMetrics.shopRevenueThb !== null || nextMetrics.shopSellerType)
  );
  const shopDerived =
    hasVerifiedShop && sd
      ? deriveSellerReliability(sd)
      : hasVerifiedShop
        ? deriveSellerReliability({
            shopId: nextMetrics.sellerId ?? '',
            shopName: nextMetrics.sellerName,
            sellerType: nextMetrics.shopSellerType ?? null,
            revenueThb: nextMetrics.shopRevenueThb ?? null,
            affiliateRevenueThb: nextMetrics.shopAffiliateRevenueThb ?? null,
            selfAccountRevenueThb: nextMetrics.shopSelfAccountRevenueThb ?? null,
            shoppingMallRevenueThb: nextMetrics.shopShoppingMallRevenueThb ?? null,
            salesVolume: nextMetrics.shopSalesVolume ?? null,
            unitPriceThb: nextMetrics.shopUnitPriceThb ?? null,
            creatorNumber: nextMetrics.shopCreatorNumber ?? null,
            productNumber: nextMetrics.shopProductNumber ?? null,
            videoNumber: nextMetrics.shopVideoNumber ?? null,
            liveNumber: nextMetrics.shopLiveNumber ?? null,
            dateRange: nextMetrics.dateRange,
            updatedAt: nowIso,
          })
        : null;

  const sellerReliabilityLevel = shopDerived?.level ?? product.sellerReliabilityLevel;
  const sellerReliabilityStatus: DataStatus = hasVerifiedShop
    ? 'verified'
    : product.sellerReliabilityStatus ?? (sellerStatus === 'verified' ? 'unverified' : 'unavailable');

  const reviewCount =
    typeof nextMetrics.productReviewCount === 'number' && nextMetrics.productReviewCount > 0
      ? nextMetrics.productReviewCount
      : product.reviewCount ?? null;
  const reviewCountStatus: DataStatus =
    reviewCount !== null ? 'verified' : product.reviewCountStatus ?? 'unavailable';

  const activeReviewInsight = nextMetrics.reviewInsight ?? null;
  const customerRating = activeReviewInsight?.averageRating ?? product.customerRating ?? null;
  const customerRatingStatus: DataStatus =
    customerRating !== null ? 'verified' : product.customerRatingStatus ?? 'unavailable';

  const hasVerifiedFeedback = Boolean(
    activeReviewInsight &&
      (activeReviewInsight.summary ||
        activeReviewInsight.positivePoints.length > 0 ||
        activeReviewInsight.painPoints.length > 0)
  );
  const feedbackStatus: DataStatus = hasVerifiedFeedback
    ? 'verified'
    : product.feedbackStatus ?? 'unavailable';
  const productQualityStatus: DataStatus = hasVerifiedFeedback
    ? 'verified'
    : reviewCount !== null
      ? 'estimated'
      : product.productQualityStatus ?? 'unavailable';

  const reviewStrengthsEn =
    activeReviewInsight && activeReviewInsight.positivePoints.length > 0
      ? activeReviewInsight.positivePoints.map((p) => `${p.point} (${p.mentions} mentions)`)
      : product.reviewStrengthsEn;
  const reviewStrengthsMy =
    activeReviewInsight && activeReviewInsight.positivePoints.length > 0
      ? activeReviewInsight.positivePoints.map((p) => `${p.point} (ဖော်ပြချက် ${p.mentions} ခု)`)
      : product.reviewStrengthsMy;
  const customerComplaintsEn =
    activeReviewInsight && activeReviewInsight.painPoints.length > 0
      ? activeReviewInsight.painPoints.map((p) => `${p.point} (${p.mentions} mentions)`)
      : product.customerComplaintsEn;
  const customerComplaintsMy =
    activeReviewInsight && activeReviewInsight.painPoints.length > 0
      ? activeReviewInsight.painPoints.map((p) => `${p.point} (ဖော်ပြချက် ${p.mentions} ခု)`)
      : product.customerComplaintsMy;

  const productQualityEvidenceEn = hasVerifiedFeedback
    ? `Kalodata Buyer Review Insight (${activeReviewInsight!.commentsAnalyzed} comments analyzed): ${activeReviewInsight!.summary ?? 'Verified buyer likes and pain points extracted directly from TikTok Shop TH reviews.'}`
    : product.productQualityEvidenceEn;
  const productQualityEvidenceMy = hasVerifiedFeedback
    ? `Kalodata Buyer Review Insight (မှတ်ချက် ${activeReviewInsight!.commentsAnalyzed} ခု စစ်ဆေးပြီး) — ${activeReviewInsight!.summary ?? 'TikTok Shop TH ဝယ်သူမှတ်ချက်များမှ အားသာချက်နှင့် အားနည်းချက်များကို တိုက်ရိုက်ရယူထားပါသည်။'}`
    : product.productQualityEvidenceMy;

  const competitionDetailEn = hasVerifiedComp
    ? `Kalodata Product Detail verified ${creatorNumber!.toLocaleString('en-US')} active promoting creator(s), ${nextMetrics.videoNumber ?? '—'} shoppable video(s), and ${nextMetrics.liveNumber ?? '—'} livestream(s). Competition level assessed as ${competitionLevel}.`
    : product.competitionDetailEn;
  const competitionDetailMy = hasVerifiedComp
    ? `Kalodata Product Detail အတည်ပြုချက် — ကြော်ငြာနေသော Creator ${creatorNumber!.toLocaleString('en-US')} ဦး၊ Video ${nextMetrics.videoNumber ?? '—'} ခုနှင့် Live ${nextMetrics.liveNumber ?? '—'} ကြိမ် ရှိပါသည် (ပြိုင်ဆိုင်မှုအဆင့်: ${competitionLevel})။`
    : product.competitionDetailMy;

  const shopAffShare =
    nextMetrics.shopRevenueThb &&
    nextMetrics.shopRevenueThb > 0 &&
    typeof nextMetrics.shopAffiliateRevenueThb === 'number'
      ? Math.round((nextMetrics.shopAffiliateRevenueThb / nextMetrics.shopRevenueThb) * 1000) / 10
      : null;

  const sellerReliabilityEn = hasVerifiedShop
    ? `Kalodata Shop Detail verified: ${shopName} (${nextMetrics.shopSellerType ?? 'Seller'}) generated ${formatThbInline(nextMetrics.shopRevenueThb)} Shop GMV (${formatThbInline(nextMetrics.shopAffiliateRevenueThb)} Affiliate GMV${shopAffShare !== null ? `, ${shopAffShare}%` : ''}) across ${nextMetrics.shopProductNumber ?? '—'} active products and ${nextMetrics.shopCreatorNumber !== null && nextMetrics.shopCreatorNumber !== undefined ? nextMetrics.shopCreatorNumber.toLocaleString('en-US') : '—'} shop creators.${nextMetrics.deliveryType ? ` Delivery: ${nextMetrics.deliveryType}.` : ''}`
    : product.sellerReliabilityEn;
  const sellerReliabilityMy = hasVerifiedShop
    ? `Kalodata Shop Detail အတည်ပြုချက် — ${shopName} (${nextMetrics.shopSellerType ?? 'Seller'}) သည် ဆိုင်စုစုပေါင်း GMV ${formatThbInline(nextMetrics.shopRevenueThb)} (Affiliate GMV ${formatThbInline(nextMetrics.shopAffiliateRevenueThb)}${shopAffShare !== null ? ` · ${shopAffShare}%` : ''}) ရှိပြီး Product ${nextMetrics.shopProductNumber ?? '—'} မျိုးနှင့် Creator ${nextMetrics.shopCreatorNumber !== null && nextMetrics.shopCreatorNumber !== undefined ? nextMetrics.shopCreatorNumber.toLocaleString('en-US') : '—'} ဦး ချိတ်ဆက်ထားပါသည်။`
    : product.sellerReliabilityMy;

  const researchDepthTag: ResearchDepthTag =
    nextMetrics.shopEnriched || nextMetrics.reviewInsightEnriched
      ? 'deep-audited'
      : nextMetrics.detailEnriched
        ? 'detail-enriched'
        : product.researchDepthTag ?? 'rank-only';

  const dispatchHub =
    nextMetrics.deliveryType && nextMetrics.deliveryType.toLowerCase() === 'global'
      ? 'Cross-border (Global → TH)'
      : product.dispatchHub;

  // Rebuild missing data list cleanly so enriched items are no longer falsely listed as missing
  const missingDataEn: string[] = [];
  const missingDataMy: string[] = [];
  if (customerRating === null) {
    missingDataEn.push('Official TikTok Shop 5-star customer rating score (not exposed by Kalodata Rank/Detail APIs).');
    missingDataMy.push('TikTok Shop တရားဝင် 5-Star Customer Rating အတိအကျ (Kalodata Rank/Detail API တွင် မပါဝင်ပါ)။');
  }
  if (reviewCount === null) {
    missingDataEn.push('Total product review count (requires Kalodata Product Detail enrichment or direct TikTok Shop check).');
    missingDataMy.push('Product Review စုစုပေါင်းအရေအတွက် (Product Detail API သို့မဟုတ် TikTok Shop တွင် စစ်ဆေးရန်)။');
  }
  if (!hasVerifiedFeedback) {
    missingDataEn.push('Buyer review text themes / complaints (available via Review Insights enrichment or direct TikTok Shop check).');
    missingDataMy.push('ဝယ်သူမှတ်ချက် အားသာချက်/အားနည်းချက်များ (Review Insights ဖြည့်စွက်ခြင်း သို့မဟုတ် TikTok Shop တွင် စစ်ဆေးရန်)။');
  }
  if (!hasVerifiedComp) {
    missingDataEn.push('Active affiliate creator count and competing video/live volume (unlocked via Product Detail enrichment).');
    missingDataMy.push('Creator အရေအတွက်နှင့် Video/Live ပြိုင်ဆိုင်မှုအခြေအနေ (Product Detail ဖြည့်စွက်မှုတွင် ရရှိနိုင်သည်)။');
  }
  if (!hasVerifiedShop) {
    missingDataEn.push('Shop-level GMV, BRAND/RETAILER verification, and affiliate revenue ratio (unlocked via Shop Detail enrichment).');
    missingDataMy.push('ဆိုင်တစ်ခုလုံး၏ GMV၊ BRAND/RETAILER အမျိုးအစားနှင့် Affiliate ဝင်ငွေအချိုး (Shop Detail ဖြည့်စွက်မှုတွင် ရရှိနိုင်သည်)။');
  }
  missingDataEn.push('Exact SKU return/refund rate and live seller shipping SLA (must be checked directly on TikTok Shop Thailand).');
  missingDataMy.push('SKU Return/Refund Rate နှင့် ပို့ဆောင်မှုမြန်ဆန်နှုန်းအတိအကျ (TikTok Shop Thailand တွင် ကိုယ်တိုင်စစ်ဆေးရန်)။');

  const sourceEndpoints = ['TH Product Rank'];
  if (nextMetrics.detailEnriched) sourceEndpoints.push('Product Detail');
  if (nextMetrics.shopEnriched) sourceEndpoints.push('Shop Detail');
  if (nextMetrics.reviewInsightEnriched) sourceEndpoints.push('Comment Insight');

  const updatedSources = product.sources.map((src, idx) =>
    idx === 0 && src.sourceType.startsWith('Kalodata')
      ? {
          ...src,
          labelMy: `Kalodata TH Product #${nextMetrics.productId} (${shopName}) — ${sourceEndpoints.join(' + ')}`,
          sourceType: `Kalodata OpenAPI · ${sourceEndpoints.join(' + ')}`,
        }
      : src
  );

  const mergedProduct: ResearchProduct = {
    ...product,
    brand,
    shopName,
    sellerStatus,
    dispatchHub,
    researchDepthTag,
    kalodataMetrics: nextMetrics,
    priceThb,
    priceStatus,
    commissionRate,
    commissionVerified,
    commissionStatus,
    estimatedCommissionPerSaleThb,
    commissionPerSaleStatus,
    reviewCount,
    reviewCountStatus,
    customerRating,
    customerRatingStatus,
    feedbackStatus,
    productQualityEvidenceEn,
    productQualityEvidenceMy,
    productQualityStatus,
    competitionLevel,
    competitionStatus,
    competitionDetailEn,
    competitionDetailMy,
    sellerReliabilityLevel,
    sellerReliabilityStatus,
    sellerReliabilityEn,
    sellerReliabilityMy,
    reviewStrengthsEn,
    reviewStrengthsMy,
    customerComplaintsEn,
    customerComplaintsMy,
    missingDataEn,
    missingDataMy,
    sources: updatedSources,
  };

  const myanmarLanguage = detectMyanmarLanguageForProduct(mergedProduct);

  // Phase 2 Scoring Engine connection: recalculate immediately using real Kalodata data
  const evaluation = evaluateProductOpportunity(mergedProduct, {
    salesWeightPct: scoringOptions?.salesWeightPct ?? 50,
    peerProducts: scoringOptions?.peerProducts,
  });

  return {
    product: {
      ...mergedProduct,
      myanmarLanguage,
      opportunityScore: evaluation.totalScore,
      confidenceLevel: evaluation.confidenceLevel,
    },
    changed: true,
  };
}
