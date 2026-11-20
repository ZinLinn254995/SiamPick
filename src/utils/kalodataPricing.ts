import type {
  BothCategoryMode,
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

export const VERIFIED_TH_CATEGORY_IDS: Record<ProductCategory, string> = {
  'womens-fashion': '601152',
  'cosmetics-beauty': '601450',
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
function buildStreamPageSizes(targetCount: number, mode: ResearchMode): number[] {
  if (targetCount <= 0) return [];
  const pages = Math.ceil(targetCount / KALODATA_MAX_PAGE_SIZE);
  const pageSizes: number[] = [];

  for (let p = 0; p < pages; p += 1) {
    const remaining = targetCount - p * KALODATA_MAX_PAGE_SIZE;
    const buffered =
      mode === 'fast'
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

/**
 * Shared client + server cost & execution planner using Kalodata's official & live-verified billing:
 * - Fast Mode:     Product Rank (last7Day) only. 0 Detail API calls. 0 Gemini calls.
 * - Balanced Mode: Product Rank (last30Day, wider pool filtering) + Product Detail on Top min(qty, 3) winners + Gemini analysis.
 * - Deep Research: Product Rank (last30Day, wider pool filtering) + Product Detail & Shop Detail on Top N finalists (1..10, default min(qty,5))
 *                  + optional Buyer Review Insight (comment/insight, 1.0 cr/item, capped at 2 items) + Deep Gemini audit.
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
    new Set(
      selectedCategories.filter(
        (c): c is ProductCategory => c === 'womens-fashion' || c === 'cosmetics-beauty'
      )
    )
  );

  const safeQuantity = Number.isFinite(quantity)
    ? Math.max(MIN_RESEARCH_QUANTITY, Math.min(MAX_RESEARCH_QUANTITY, Math.floor(quantity)))
    : 10;

  const effectiveDeepDiveCount =
    researchMode === 'deep'
      ? clampDeepDiveCount(options?.deepDiveCount, safeQuantity)
      : researchMode === 'balanced'
        ? Math.min(safeQuantity, BALANCED_DETAIL_CAP)
        : 0;

  if (uniqueCategories.length === 0) {
    return {
      selectedCategories: [],
      categoryIds: [],
      quantity: safeQuantity,
      bothCategoryMode,
      researchMode,
      dateRange,
      deepDiveCount: effectiveDeepDiveCount,
      includeReviewInsights,
      rankApiCalls: 0,
      productDetailApiCalls: 0,
      shopDetailApiCalls: 0,
      commentInsightApiCalls: 0,
      plannedApiCalls: 0,
      estimatedCredits: 0,
      estimatedUsd: 0,
      usesPagination: false,
      usesGeminiAnalysis: researchMode !== 'fast',
      streams: [],
    };
  }

  const effectiveMode: BothCategoryMode =
    uniqueCategories.length === 2 ? bothCategoryMode : 'combined';

  const streams: KalodataQueryStreamPlan[] = [];

  if (effectiveMode === 'split' && uniqueCategories.length === 2) {
    const firstTarget = Math.ceil(safeQuantity / 2);
    const secondTarget = safeQuantity - firstTarget;
    const targets = [firstTarget, secondTarget];

    uniqueCategories.forEach((cat, idx) => {
      const targetCount = targets[idx] ?? 0;
      if (targetCount <= 0) return;
      const pageSizes = buildStreamPageSizes(targetCount, researchMode);
      streams.push({
        categories: [cat],
        categoryIds: [VERIFIED_TH_CATEGORY_IDS[cat]],
        targetCount,
        pagesPlanned: pageSizes.length,
        pageSizes,
      });
    });
  } else {
    const pageSizes = buildStreamPageSizes(safeQuantity, researchMode);
    streams.push({
      categories: uniqueCategories,
      categoryIds: uniqueCategories.map((c) => VERIFIED_TH_CATEGORY_IDS[c]),
      targetCount: safeQuantity,
      pagesPlanned: pageSizes.length,
      pageSizes,
    });
  }

  let rankApiCalls = 0;
  let rankCredits = 0;
  let usesPagination = false;

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

  const productDetailApiCalls =
    researchMode === 'fast' ? 0 : effectiveDeepDiveCount;
  // Upper-bound estimate for shop/detail (deduplicated at runtime when products share the same shop)
  const shopDetailApiCalls =
    researchMode === 'deep' ? effectiveDeepDiveCount : 0;
  const commentInsightApiCalls =
    researchMode === 'deep' && includeReviewInsights
      ? Math.min(effectiveDeepDiveCount, DEEP_COMMENT_INSIGHT_CAP)
      : 0;

  const detailCredits =
    productDetailApiCalls * KALODATA_PRODUCT_DETAIL_CREDIT +
    shopDetailApiCalls * KALODATA_SHOP_DETAIL_CREDIT +
    commentInsightApiCalls * KALODATA_COMMENT_INSIGHT_CREDIT;

  const plannedApiCalls =
    rankApiCalls + productDetailApiCalls + shopDetailApiCalls + commentInsightApiCalls;
  const estimatedCredits = roundCredits(rankCredits + detailCredits);
  const estimatedUsd = roundUsd(estimatedCredits * KALODATA_USD_PER_CREDIT);

  return {
    selectedCategories: uniqueCategories,
    categoryIds: uniqueCategories.map((c) => VERIFIED_TH_CATEGORY_IDS[c]),
    quantity: safeQuantity,
    bothCategoryMode: effectiveMode,
    researchMode,
    dateRange,
    deepDiveCount: effectiveDeepDiveCount,
    includeReviewInsights,
    rankApiCalls,
    productDetailApiCalls,
    shopDetailApiCalls,
    commentInsightApiCalls,
    plannedApiCalls,
    estimatedCredits,
    estimatedUsd,
    usesPagination,
    usesGeminiAnalysis: researchMode !== 'fast',
    streams,
  };
}

export function formatCredits(credits: number): string {
  return Number(credits.toFixed(3)).toString();
}

export function formatUsd(usd: number): string {
  return `$${usd.toFixed(usd > 0 && usd < 0.01 ? 3 : 2)}`;
}
