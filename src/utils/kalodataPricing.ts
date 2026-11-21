import type {
  BothCategoryMode,
  MyanmarDiscoveryMode,
  ProductCategory,
  ResearchCostEstimate,
  ResearchMode,
} from '../types/product.ts';

/**
 * Official & live-verified Kalodata Open Center API pricing constants:
 * - POST /openapi/v1/tiktok/product/rank:            0.1 × Ceiling(returned_rows / 100) Credits per call (page_size <= 100)
 * - POST /openapi/v1/tiktok/product/detail:          0.1 Credit per call
 * - POST /openapi/v1/tiktok/shop/detail:             0.1 Credit per call
 * - POST /openapi/v1/tiktok/product/comment/insight: 1.0 Credit per call (opt-in only in Deep Research)
 * - Reference rate: 1 Credit ≈ $0.10 USD
 */
export const KALODATA_MAX_PAGE_SIZE = 100;
export const KALODATA_CREDITS_PER_100_ROWS = 0.1;
export const KALODATA_VIDEO_RANK_CREDIT_PER_100 = 0.1;
export const KALODATA_PRODUCT_DETAIL_CREDIT = 0.1;
export const KALODATA_SHOP_DETAIL_CREDIT = 0.1;
export const KALODATA_COMMENT_INSIGHT_CREDIT = 1.0;
export const KALODATA_USD_PER_CREDIT = 0.1;

export const MIN_RESEARCH_QUANTITY = 1;
export const MAX_RESEARCH_QUANTITY = 500;
export const DEFAULT_SPENDING_LIMIT_CREDITS = 0.5;
export const MIN_SPENDING_LIMIT_CREDITS = 0.1;
export const MAX_SPENDING_LIMIT_CREDITS = 100;

export const BALANCED_DETAIL_CAP = 3;
export const DEFAULT_DEEP_DIVE_COUNT = 5;
export const MIN_DEEP_DIVE_COUNT = 1;
export const MAX_DEEP_DIVE_COUNT = 10;
export const DEEP_COMMENT_INSIGHT_CAP = 2;

export const DEFAULT_MYANMAR_REVIEW_SCAN_LIMIT = 5;
export const MIN_MYANMAR_REVIEW_SCAN_LIMIT = 1;
export const MAX_MYANMAR_REVIEW_SCAN_LIMIT = 30;

export const DEFAULT_MYANMAR_VIDEO_SCAN_PAGES = 10;
export const MIN_MYANMAR_VIDEO_SCAN_PAGES = 1;
export const MAX_MYANMAR_VIDEO_SCAN_PAGES = 25;

import {
  CATEGORY_BY_ID,
  isValidProductCategory,
} from './categoryRegistry.ts';

/**
 * Static Thailand (TH) TikTok Shop Category IDs verified via live Kalodata Category Rank API
 * or official TikTok Shop Open API documentation.
 * Unverified categories are NEVER guessed here — they are supplied via user-synced resolvedCategoryIdMap.
 */
export const VERIFIED_TH_CATEGORY_IDS: Partial<Record<ProductCategory, string>> = {
  'womens-fashion': '601152',
  'cosmetics-beauty': '601450',
  'home-living': '600001',
};

export interface KalodataQueryStreamPlan {
  categories: ProductCategory[];
  categoryIds: string[];
  targetCount: number;
  pagesPlanned: number;
  pageSizes: number[];
}

export interface KalodataExecutionPlan extends ResearchCostEstimate {
  streams: KalodataQueryStreamPlan[];
}

export interface KalodataPlanOptions {
  researchMode?: ResearchMode;
  deepDiveCount?: number;
  includeReviewInsights?: boolean;
  selectedSubcategoryIds?: string[];
  resolvedCategoryIdMap?: Partial<Record<ProductCategory, string>>;
  myanmarLanguageOnly?: boolean;
  myanmarDiscoveryMode?: MyanmarDiscoveryMode;
  myanmarVideoScanPages?: number;
  myanmarReviewScanLimit?: number;
}

function isValidKalodataCategoryId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{3,64}$/.test(value.trim());
}

export function resolveKalodataIdForCategory(
  category: ProductCategory,
  resolvedCategoryIdMap?: Partial<Record<ProductCategory, string>>
): string | null {
  const dynamicId = resolvedCategoryIdMap?.[category];
  if (isValidKalodataCategoryId(dynamicId)) {
    return dynamicId.trim();
  }
  const staticId = CATEGORY_BY_ID[category]?.defaultKalodataId ?? VERIFIED_TH_CATEGORY_IDS[category];
  return isValidKalodataCategoryId(staticId) ? staticId.trim() : null;
}

function roundCredits(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function roundUsd(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/**
 * Computes exact page_size sequence for a single query stream without wasting API calls.
 * - Fast mode: tight buffer (+10 rows within the existing 100-row cap) for speed & minimal payload.
 * - Balanced & Deep modes: wider candidate pool (up to 2× target or +30 rows, strictly capped at 100/page)
 *   so we filter and compare stronger candidates within the exact same 0.1 Credit per 100-row rank bracket.
 */
function buildStreamPageSizes(
  targetCount: number,
  mode: ResearchMode,
  myanmarLanguageOnly = false
): number[] {
  if (targetCount <= 0) return [];
  const pages = Math.ceil(targetCount / KALODATA_MAX_PAGE_SIZE);
  const pageSizes: number[] = [];

  for (let p = 0; p < pages; p += 1) {
    const remaining = targetCount - p * KALODATA_MAX_PAGE_SIZE;
    // When Myanmar Language Filter is ON, scan up to the full 100-row bracket within the EXACT same 0.1 Credit call (0 extra API calls, 0 extra cost).
    // When OFF, keep original Fast/Balanced/Deep page sizing 100% unchanged.
    const buffered = myanmarLanguageOnly
      ? KALODATA_MAX_PAGE_SIZE
      : mode === 'fast'
        ? remaining + 10
        : Math.max(remaining * 2, remaining + 30);
    const desired = Math.min(KALODATA_MAX_PAGE_SIZE, buffered);
    pageSizes.push(Math.max(1, desired));
  }

  return pageSizes;
}

export function clampDeepDiveCount(raw: number | undefined, quantity: number): number {
  const safeQty = Math.max(MIN_RESEARCH_QUANTITY, Math.min(MAX_RESEARCH_QUANTITY, Math.floor(quantity || 10)));
  const requested =
    typeof raw === 'number' && Number.isFinite(raw) ? Math.floor(raw) : DEFAULT_DEEP_DIVE_COUNT;
  return Math.max(
    MIN_DEEP_DIVE_COUNT,
    Math.min(MAX_DEEP_DIVE_COUNT, safeQty, requested)
  );
}

export function clampMyanmarReviewScanLimit(raw: number | undefined): number {
  const requested =
    typeof raw === 'number' && Number.isFinite(raw)
      ? Math.floor(raw)
      : DEFAULT_MYANMAR_REVIEW_SCAN_LIMIT;
  return Math.max(
    MIN_MYANMAR_REVIEW_SCAN_LIMIT,
    Math.min(MAX_MYANMAR_REVIEW_SCAN_LIMIT, requested)
  );
}

export function clampMyanmarVideoScanPages(raw: number | undefined): number {
  const requested =
    typeof raw === 'number' && Number.isFinite(raw)
      ? Math.floor(raw)
      : DEFAULT_MYANMAR_VIDEO_SCAN_PAGES;
  return Math.max(
    MIN_MYANMAR_VIDEO_SCAN_PAGES,
    Math.min(MAX_MYANMAR_VIDEO_SCAN_PAGES, requested)
  );
}

/**
 * Shared client + server cost & execution planner using Kalodata's official & live-verified billing:
 * - Fast Mode:     Product Rank (last7Day) only. 0 Detail API calls. 0 Gemini calls.
 * - Balanced Mode: Product Rank (last30Day, wider pool filtering) + Product Detail on Top min(qty, 3) winners + Gemini analysis.
 * - Deep Research: Product Rank (last30Day, wider pool filtering) + Product Detail & Shop Detail on Top N finalists (1..10, default min(qty,5))
 *                  + optional Buyer Review Insight (comment/insight, 1.0 cr/item, capped at 2 items) + Deep Gemini audit.
 *
 * Phase 8 Universal Category Support:
 * - Supports any number of verified/synced ProductCategory selections plus optional L2 subcategory IDs.
 * - Never guesses unverified IDs — categories without a resolved verified/synced Kalodata ID are excluded.
 */
export function buildKalodataExecutionPlan(
  selectedCategories: ProductCategory[],
  quantity: number,
  bothCategoryMode: BothCategoryMode,
  options?: KalodataPlanOptions
): KalodataExecutionPlan {
  const researchMode: ResearchMode =
    options?.researchMode === 'balanced' || options?.researchMode === 'deep'
      ? options.researchMode
      : 'fast';
  const dateRange: 'last7Day' | 'last30Day' =
    researchMode === 'fast' ? 'last7Day' : 'last30Day';
  const includeReviewInsights =
    researchMode === 'deep' && options?.includeReviewInsights === true;

  const uniqueCategories = Array.from(
    new Set(selectedCategories.filter((c): c is ProductCategory => isValidProductCategory(c)))
  );

  // Filter strictly to categories that have a real verified or user-synced Kalodata TH ID
  const resolvedEntries = uniqueCategories
    .map((cat) => ({
      category: cat,
      kalodataId: resolveKalodataIdForCategory(cat, options?.resolvedCategoryIdMap),
    }))
    .filter((entry): entry is { category: ProductCategory; kalodataId: string } =>
      Boolean(entry.kalodataId)
    );

  const validSubcategoryIds = Array.from(
    new Set(
      (options?.selectedSubcategoryIds ?? [])
        .filter((id): id is string => isValidKalodataCategoryId(id))
        .map((id) => id.trim())
    )
  ).slice(0, 30);

  const safeQuantity = Number.isFinite(quantity)
    ? Math.max(MIN_RESEARCH_QUANTITY, Math.min(MAX_RESEARCH_QUANTITY, Math.floor(quantity)))
    : 10;

  const effectiveDeepDiveCount =
    researchMode === 'deep'
      ? clampDeepDiveCount(options?.deepDiveCount, safeQuantity)
      : researchMode === 'balanced'
        ? Math.min(safeQuantity, BALANCED_DETAIL_CAP)
        : 0;

  const myanmarLanguageOnly = options?.myanmarLanguageOnly === true;
  const myanmarDiscoveryMode: MyanmarDiscoveryMode | undefined = myanmarLanguageOnly
    ? options?.myanmarDiscoveryMode === 'review-first'
      ? 'review-first'
      : 'video-first'
    : undefined;
  const effectiveVideoScanPages =
    myanmarLanguageOnly && myanmarDiscoveryMode === 'video-first'
      ? clampMyanmarVideoScanPages(options?.myanmarVideoScanPages)
      : 0;
  const effectiveReviewScanLimit =
    myanmarLanguageOnly && myanmarDiscoveryMode === 'review-first'
      ? clampMyanmarReviewScanLimit(options?.myanmarReviewScanLimit)
      : 0;

  if (resolvedEntries.length === 0 && validSubcategoryIds.length === 0) {
    return {
      selectedCategories: [],
      selectedSubcategoryIds: [],
      categoryIds: [],
      quantity: safeQuantity,
      bothCategoryMode,
      researchMode,
      dateRange,
      deepDiveCount: effectiveDeepDiveCount,
      includeReviewInsights,
      rankApiCalls: 0,
      videoRankApiCalls: 0,
      productDetailApiCalls: 0,
      shopDetailApiCalls: 0,
      commentInsightApiCalls: 0,
      plannedApiCalls: 0,
      estimatedCredits: 0,
      estimatedUsd: 0,
      usesPagination: false,
      usesGeminiAnalysis: researchMode !== 'fast',
      myanmarLanguageOnly,
      ...(myanmarDiscoveryMode ? { myanmarDiscoveryMode } : {}),
      myanmarVideoScanPages: effectiveVideoScanPages,
      myanmarReviewScanLimit: effectiveReviewScanLimit,
      streams: [],
    };
  }

  const effectiveCategories = resolvedEntries.map((e) => e.category);
  const resolvedL1Ids = Array.from(new Set(resolvedEntries.map((e) => e.kalodataId)));

  // When user picks explicit L2 subcategories, pass those exact subcategory IDs to Kalodata;
  // otherwise pass the verified/synced L1 category IDs.
  const effectiveCategoryIds =
    validSubcategoryIds.length > 0 ? validSubcategoryIds : resolvedL1Ids;

  // Split mode runs separate streams per selected L1 category when >= 2 L1 categories are selected
  // and no narrow L2 subcategory override is forcing a single combined query.
  const effectiveMode: BothCategoryMode =
    resolvedEntries.length >= 2 && validSubcategoryIds.length === 0
      ? bothCategoryMode
      : 'combined';

  const streams: KalodataQueryStreamPlan[] = [];
  const isVideoFirst = myanmarLanguageOnly && myanmarDiscoveryMode === 'video-first';

  if (effectiveMode === 'split' && resolvedEntries.length >= 2) {
    const streamCount = resolvedEntries.length;
    const basePerStream = Math.floor(safeQuantity / streamCount);
    const remainder = safeQuantity % streamCount;

    resolvedEntries.forEach((entry, idx) => {
      const targetCount = basePerStream + (idx < remainder ? 1 : 0);
      if (targetCount <= 0) return;
      const pageSizes = isVideoFirst
        ? Array.from({ length: effectiveVideoScanPages }, () => KALODATA_MAX_PAGE_SIZE)
        : buildStreamPageSizes(targetCount, researchMode, myanmarLanguageOnly);
      streams.push({
        categories: [entry.category],
        categoryIds: [entry.kalodataId],
        targetCount,
        pagesPlanned: pageSizes.length,
        pageSizes,
      });
    });
  } else {
    const pageSizes = isVideoFirst
      ? Array.from({ length: effectiveVideoScanPages }, () => KALODATA_MAX_PAGE_SIZE)
      : buildStreamPageSizes(safeQuantity, researchMode, myanmarLanguageOnly);
    streams.push({
      categories: effectiveCategories,
      categoryIds: effectiveCategoryIds,
      targetCount: safeQuantity,
      pagesPlanned: pageSizes.length,
      pageSizes,
    });
  }

  let rankApiCalls = 0;
  let videoRankApiCalls = 0;
  let rankCredits = 0;
  let usesPagination = false;

  if (isVideoFirst) {
    // Video-First Myanmar Discovery (Method 1 — official Kalodata OpenAPI flow):
    // 1. POST /tiktok/video/rank @ 0.1 cr/100-video page (up to effectiveVideoScanPages per stream, early-stops at quantity)
    // 2. POST /tiktok/product/rank with video_id + is_affiliate=1 @ 0.1 cr per matched Myanmar video (returns full product rank metrics + image; cached = 0 cr)
    // 3. Balanced/Deep only: optional product/detail + shop/detail + opt-in comment/insight on top finalists.
    for (const stream of streams) {
      if (stream.pagesPlanned > 1) {
        usesPagination = true;
      }
      videoRankApiCalls += stream.pagesPlanned;
      rankCredits += stream.pagesPlanned * KALODATA_VIDEO_RANK_CREDIT_PER_100;
    }
    rankApiCalls = safeQuantity;
    rankCredits += rankApiCalls * KALODATA_CREDITS_PER_100_ROWS;
  } else {
    for (const stream of streams) {
      if (stream.pagesPlanned > 1) {
        usesPagination = true;
      }
      for (const pageSize of stream.pageSizes) {
        rankApiCalls += 1;
        rankCredits +=
          KALODATA_CREDITS_PER_100_ROWS * Math.ceil(pageSize / KALODATA_MAX_PAGE_SIZE);
      }
    }
  }

  const productDetailApiCalls =
    researchMode === 'fast' ? 0 : effectiveDeepDiveCount;
  // Upper-bound estimate for shop/detail (deduplicated at runtime when products share the same shop)
  const shopDetailApiCalls =
    researchMode === 'deep' ? effectiveDeepDiveCount : 0;
  const deepCommentInsightCalls =
    researchMode === 'deep' && includeReviewInsights
      ? Math.min(effectiveDeepDiveCount, DEEP_COMMENT_INSIGHT_CAP)
      : 0;
  // In Video-First mode, 0 review insight calls are required (unless user explicitly opted into Deep Review Insights).
  // In legacy Review-First mode, comment/insight runs up to myanmarReviewScanLimit.
  // When Filter OFF, commentInsightApiCalls is 100% unchanged!
  const commentInsightApiCalls =
    myanmarLanguageOnly && myanmarDiscoveryMode === 'review-first'
      ? Math.max(deepCommentInsightCalls, effectiveReviewScanLimit)
      : deepCommentInsightCalls;

  const detailCredits =
    productDetailApiCalls * KALODATA_PRODUCT_DETAIL_CREDIT +
    shopDetailApiCalls * KALODATA_SHOP_DETAIL_CREDIT +
    commentInsightApiCalls * KALODATA_COMMENT_INSIGHT_CREDIT;

  const plannedApiCalls =
    rankApiCalls +
    videoRankApiCalls +
    productDetailApiCalls +
    shopDetailApiCalls +
    commentInsightApiCalls;
  const estimatedCredits = roundCredits(rankCredits + detailCredits);
  const estimatedUsd = roundUsd(estimatedCredits * KALODATA_USD_PER_CREDIT);

  return {
    selectedCategories: effectiveCategories,
    selectedSubcategoryIds: validSubcategoryIds,
    categoryIds: effectiveCategoryIds,
    quantity: safeQuantity,
    bothCategoryMode: effectiveMode,
    researchMode,
    dateRange: isVideoFirst ? 'last30Day' : dateRange,
    deepDiveCount: effectiveDeepDiveCount,
    includeReviewInsights,
    rankApiCalls,
    videoRankApiCalls,
    productDetailApiCalls,
    shopDetailApiCalls,
    commentInsightApiCalls,
    plannedApiCalls,
    estimatedCredits,
    estimatedUsd,
    usesPagination,
    usesGeminiAnalysis: researchMode !== 'fast',
    myanmarLanguageOnly,
    ...(myanmarDiscoveryMode ? { myanmarDiscoveryMode } : {}),
    myanmarVideoScanPages: effectiveVideoScanPages,
    myanmarReviewScanLimit: effectiveReviewScanLimit,
    streams,
  };
}

export function formatCredits(credits: number): string {
  return Number(credits.toFixed(3)).toString();
}

export function formatUsd(usd: number): string {
  return `$${usd.toFixed(usd > 0 && usd < 0.01 ? 3 : 2)}`;
}
