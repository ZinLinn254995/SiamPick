import type {
  AiRecommendationVerdict,
  DataStatus,
  KalodataProductDetailEnrichmentRecord,
  KalodataReviewInsightData,
  KalodataShopEnrichmentRecord,
  OpportunityEvaluation,
  ProductEnrichmentExecutionSummary,
  ResearchProduct,
} from '../types/product.ts';
import type {
  DeepDiveAnalysisId,
  DeepDiveAnalysisSlotState,
  DeepDiveBudgetGuardResult,
  DeepDiveCompetitorComparisonRow,
  DeepDiveCompletedModuleDigest,
  DeepDiveExecutionCostEstimate,
  DeepDiveGeminiTokenUsage,
  DeepDiveMetricRow,
  DeepDiveModuleCostEstimate,
  DeepDiveModuleError,
  DeepDiveModuleResult,
  DeepDiveResultSection,
  DeepDiveRunCostSummary,
  DeepDiveServerBudgetSnapshot,
  DeepDiveVideoItem,
} from '../types/deepDive.ts';
import {
  DEFAULT_SPENDING_LIMIT_CREDITS,
  KALODATA_COMMENT_INSIGHT_CREDIT,
  KALODATA_PRODUCT_DETAIL_CREDIT,
  KALODATA_USD_PER_CREDIT,
  MAX_SPENDING_LIMIT_CREDITS,
  MIN_SPENDING_LIMIT_CREDITS,
} from './kalodataPricing.ts';
import {
  getProductEnrichmentCoverage,
  isValidKalodataId,
  mergeEnrichmentIntoProduct,
  type EnrichmentSelection,
} from './enrichmentPlanner.ts';
import {
  getCachedEnrichmentForProduct,
  saveEnrichmentToCache,
} from './enrichmentCache.ts';
import { getCategoryLabel } from './categoryRegistry.ts';
import { evaluateProductBatch, evaluateProductOpportunity, getCanonicalProductId } from './scoring.ts';
import { detectMyanmarLanguageForProduct } from './myanmarLanguageDetector.ts';

function roundCredits(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function roundUsd(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function fmtThb(val: number | null | undefined): string {
  if (typeof val !== 'number' || !Number.isFinite(val)) return 'Unavailable';
  return `฿${Math.round(val).toLocaleString('en-US')}`;
}

function fmtThbDecimal(val: number | null | undefined): string {
  if (typeof val !== 'number' || !Number.isFinite(val)) return 'Unavailable';
  const rounded = Math.round(val * 100) / 100;
  return `฿${rounded.toLocaleString('en-US', {
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtNum(val: number | null | undefined): string {
  if (typeof val !== 'number' || !Number.isFinite(val)) return 'Unavailable';
  return Math.round(val).toLocaleString('en-US');
}

function fmtPct(val: number | null | undefined): string {
  if (typeof val !== 'number' || !Number.isFinite(val)) return 'Unavailable';
  const rounded = Math.round(val * 10) / 10;
  return `${rounded}%`;
}

export interface DeepDiveEnrichRequestPayload {
  product: ResearchProduct;
  requestedLayers: EnrichmentSelection;
  spendingLimitCredits?: number;
  sessionCreditsAlreadySpent?: number;
  runId?: string;
  idempotencyKey?: string;
  requireExplicitConfirmation?: boolean;
  userConfirmedPaidExecution?: boolean;
  forceRefresh?: boolean;
  clientCachedProductDetail?: KalodataProductDetailEnrichmentRecord | null;
  clientCachedShopDetail?: KalodataShopEnrichmentRecord | null;
  clientCachedReviewInsight?: KalodataReviewInsightData | null;
  salesWeightPct?: number;
}

export interface DeepDiveEnrichResponsePayload {
  ok: boolean;
  product?: ResearchProduct;
  productDetail?: KalodataProductDetailEnrichmentRecord | null;
  shopDetail?: KalodataShopEnrichmentRecord | null;
  reviewInsight?: KalodataReviewInsightData | null;
  summary?: ProductEnrichmentExecutionSummary;
  budgetSnapshot?: DeepDiveServerBudgetSnapshot | null;
  error?: string;
  errorMy?: string;
  code?: string;
}

export interface DeepDiveAiApiStrategyData {
  verdict: AiRecommendationVerdict;
  headlineEn: string;
  headlineMy: string;
  summaryEn: string;
  summaryMy: string;
  strengthsEn: string[];
  strengthsMy: string[];
  weaknessesEn: string[];
  weaknessesMy: string[];
  risksEn: string[];
  risksMy: string[];
  targetAudienceEn: string;
  targetAudienceMy: string;
  videoIdeasEn: string[];
  videoIdeasMy: string[];
  affiliateStrategyEn: string;
  affiliateStrategyMy: string;
  goNoGoReasonEn: string;
  goNoGoReasonMy: string;
  dataLimitationsEn: string[];
  dataLimitationsMy: string[];
  modelUsed: string;
  modulesSynthesized: DeepDiveAnalysisId[];
  generatedAt: string;
  tokenUsage?: DeepDiveGeminiTokenUsage | null;
}

export interface DeepDiveAiApiResponse {
  ok: boolean;
  strategy?: DeepDiveAiApiStrategyData;
  code?: string;
  error?: string;
  errorMy?: string;
}

export interface DeepDiveCacheSnapshot {
  productDetail: KalodataProductDetailEnrichmentRecord | null;
  shopDetail: KalodataShopEnrichmentRecord | null;
  reviewInsight: KalodataReviewInsightData | null;
}

export interface DeepDiveExecutionDependencies {
  enrichProductFn?: (
    payload: DeepDiveEnrichRequestPayload
  ) => Promise<DeepDiveEnrichResponsePayload>;
  runAiStrategyFn?: (payload: {
    product: ResearchProduct;
    completedModules: DeepDiveCompletedModuleDigest[];
    salesWeightPct: number;
    requireExplicitConfirmation?: boolean;
    userConfirmedPaidExecution?: boolean;
  }) => Promise<DeepDiveAiApiResponse>;
  getCacheFn?: (product: ResearchProduct) => DeepDiveCacheSnapshot;
  saveCacheFn?: (params: {
    productDetail?: KalodataProductDetailEnrichmentRecord | null;
    shopDetail?: KalodataShopEnrichmentRecord | null;
    reviewInsight?: KalodataReviewInsightData | null;
  }) => void;
  nowIsoFn?: () => string;
}

async function defaultEnrichProductFn(
  payload: DeepDiveEnrichRequestPayload
): Promise<DeepDiveEnrichResponsePayload> {
  const response = await fetch('/api/enrich-product', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = (await response.json().catch(() => null)) as DeepDiveEnrichResponsePayload | null;
  if (!response.ok || !json || !json.ok) {
    return {
      ok: false,
      code: json?.code ?? `HTTP_${response.status}`,
      error: json?.error ?? `Enrichment request failed (HTTP ${response.status}).`,
      errorMy:
        json?.errorMy ??
        `Kalodata ဒေတာရယူမှု မအောင်မြင်ပါ (HTTP ${response.status})။`,
      budgetSnapshot: json?.budgetSnapshot ?? null,
    };
  }
  return json;
}

async function defaultRunAiStrategyFn(payload: {
  product: ResearchProduct;
  completedModules: DeepDiveCompletedModuleDigest[];
  salesWeightPct: number;
  requireExplicitConfirmation?: boolean;
  userConfirmedPaidExecution?: boolean;
}): Promise<DeepDiveAiApiResponse> {
  const response = await fetch('/api/deep-dive/ai-strategy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = (await response.json().catch(() => null)) as DeepDiveAiApiResponse | null;
  if (!response.ok || !json || !json.ok) {
    return {
      ok: false,
      code: json?.code ?? `HTTP_${response.status}`,
      error: json?.error ?? `AI Strategic Recommendation failed (HTTP ${response.status}).`,
      errorMy:
        json?.errorMy ??
        `AI Strategic Recommendation ခေါ်ဆိုမှု မအောင်မြင်ပါ (HTTP ${response.status})။`,
    };
  }
  return json;
}

/**
 * Checks whether a given Deep Dive module requires `product/detail` (0.1 cr)
 * if the needed fields are missing on the current product.
 */
function moduleNeedsProductDetail(
  analysisId: DeepDiveAnalysisId,
  product: ResearchProduct
): boolean {
  const m = product.kalodataMetrics;
  const coverage = getProductEnrichmentCoverage(product);
  if (!coverage.hasKalodataId) return false;
  if (coverage.hasProductDetail) return false;

  switch (analysisId) {
    case 'product-intelligence':
      return true;
    case 'sales-market-intelligence':
      return (m?.salesVolume ?? null) === null && (m?.revenueThb ?? null) === null;
    case 'creator-competition-analysis':
      return m?.creatorNumber === null || m?.creatorNumber === undefined;
    case 'video-intelligence': {
      const hasMatchedVideos = (product.myanmarLanguage?.matchedVideos?.length ?? 0) > 0;
      const hasVideoMetrics =
        (typeof m?.videoNumber === 'number' && m.videoNumber >= 0) ||
        (typeof m?.videoRevenueThb === 'number' && m.videoRevenueThb >= 0);
      return !hasMatchedVideos && !hasVideoMetrics;
    }
    default:
      return false;
  }
}

function getModuleDataUsageLabels(
  id: DeepDiveAnalysisId
): { en: string; my: string } {
  switch (id) {
    case 'product-intelligence':
      return {
        en: 'Product title, category, price range, SKU count, review count',
        my: 'Product အမည်၊ Category၊ ဈေးနှုန်းအပိုင်းအခြား၊ SKU နှင့် Review အရေအတွက်',
      };
    case 'sales-market-intelligence':
      return {
        en: 'Sales volume, GMV, growth rate, Video/Live/Mall channel split',
        my: 'ရောင်းအား၊ GMV၊ တိုးတက်မှုနှုန်းနှင့် Video/Live/Mall ခွဲခြမ်းစိတ်ဖြာမှု',
      };
    case 'affiliate-profit-analysis':
      return {
        en: 'Verified price & commission rate (local profit projections)',
        my: 'အတည်ပြုပြီး ဈေးနှုန်းနှင့် ကော်မရှင်နှုန်း (Local အမြတ်တွက်ချက်မှု)',
      };
    case 'creator-competition-analysis':
      return {
        en: 'Active affiliate creator count & competition saturation',
        my: 'လက်ရှိ Affiliate Creator အရေအတွက်နှင့် ပြိုင်ဆိုင်မှုအခြေအနေ',
      };
    case 'video-intelligence':
      return {
        en: 'Product video count, Video GMV & matched Myanmar videos',
        my: 'Product Video အရေအတွက်၊ Video GMV နှင့် ချိတ်ဆက် မြန်မာ Video များ',
      };
    case 'customer-review-intelligence':
      return {
        en: 'Customer reviews, likes/dislikes, complaints & Myanmar comments',
        my: 'ဝယ်သူ Review များ၊ အကောင်း/အဆိုး မှတ်ချက်နှင့် မြန်မာ Review စစ်ဆေးမှု',
      };
    case 'market-competitor-comparison':
      return {
        en: 'Same-category peer products in current session',
        my: 'လက်ရှိ Session ထဲရှိ Category တူ Product များနှင့် နှိုင်းယှဉ်ချက်',
      };
    case 'ai-strategic-recommendation':
      return {
        en: 'Verified product data + completed Deep Dive module results',
        my: 'အတည်ပြုပြီး Product Data + ပြီးစီးထားသော Deep Dive ရလဒ်များ',
      };
  }
}

/**
 * Pre-call Cost Estimator (Phase 9.2 / 9.3 Cost Management).
 * - Reuses `src/utils/kalodataPricing.ts` constants strictly.
 * - Accounts for existing product fields + client enrichment cache (0 cr).
 * - Deduplicates shared `product/detail` calls across multiple selected modules (0 extra cr).
 * - Marks Review Insight strictly opt-in (`1.0 cr` ONLY when selected and uncached).
 * - Strictly separates Kalodata Credits from separate Google Gemini AI API billing (NEVER free).
 */
export function estimateDeepDiveExecutionCost(
  product: ResearchProduct,
  analysisIds: readonly DeepDiveAnalysisId[],
  options?: {
    cacheSnapshot?: DeepDiveCacheSnapshot | null;
    forceRefresh?: boolean;
  }
): DeepDiveExecutionCostEstimate {
  const canonicalProductId = getCanonicalProductId(product);
  const coverage = getProductEnrichmentCoverage(product);
  const cached = options?.cacheSnapshot ?? getCachedEnrichmentForProduct(product);
  const forceRefresh = options?.forceRefresh === true;

  const uniqueIds = Array.from(new Set(analysisIds));
  const plannedLayers = new Set<'productDetail' | 'shopDetail' | 'reviewInsights'>();
  const modules: DeepDiveModuleCostEstimate[] = [];
  let plannedGeminiCalls = 0;

  for (const id of uniqueIds) {
    const dataUsed = getModuleDataUsageLabels(id);

    if (id === 'affiliate-profit-analysis' || id === 'market-competitor-comparison') {
      modules.push({
        analysisId: id,
        costKind: 'zero-local',
        requiredApiLayer: 'none',
        apiLabelEn: 'Local Calculation (No API)',
        apiLabelMy: 'Local တွက်ချက်မှု (API မခေါ်ပါ)',
        dataUsedEn: dataUsed.en,
        dataUsedMy: dataUsed.my,
        plannedKalodataApiCalls: 0,
        estimatedCredits: 0,
        estimatedUsd: 0,
        reusesExistingOrCache: true,
        noteEn: 'Runs locally from existing verified data (0 Kalodata credits).',
        noteMy: 'ရှိပြီးသား အတည်ပြုပြီး Data ဖြင့် Local တွင် တွက်ချက်မည် (0 credits)။',
      });
      continue;
    }

    if (id === 'ai-strategic-recommendation') {
      plannedGeminiCalls += 1;
      modules.push({
        analysisId: id,
        costKind: 'ai-no-kalodata-credits',
        requiredApiLayer: 'gemini-ai',
        apiLabelEn: 'Server-Side Gemini AI API (Separate Billing)',
        apiLabelMy: 'Server-Side Gemini AI API (AI စရိတ် သီးခြားရှိ)',
        dataUsedEn: dataUsed.en,
        dataUsedMy: dataUsed.my,
        plannedKalodataApiCalls: 0,
        estimatedCredits: 0,
        estimatedUsd: 0,
        separateAiBilling: true,
        reusesExistingOrCache: true,
        noteEn:
          '0 Kalodata credits — uses 1 server-side Gemini AI API call (Cost: Estimated / Unavailable; billed separately by Google Gemini API — NOT free).',
        noteMy:
          'Kalodata Credit 0 cr — Server-side Gemini AI API Call ၁ ကြိမ် (ကုန်ကျစရိတ်: ခန့်မှန်း/မတွက်နိုင်သေး · Google Gemini API မှ သီးခြားကောက်ခံသည် — အခမဲ့ မဟုတ်ပါ)။',
      });
      continue;
    }

    if (id === 'customer-review-intelligence') {
      if (!coverage.hasKalodataId) {
        modules.push({
          analysisId: id,
          costKind: 'unavailable-api',
          requiredApiLayer: 'none',
          apiLabelEn: 'Unavailable (No Kalodata Product ID)',
          apiLabelMy: 'မရရှိနိုင်ပါ (Kalodata Product ID မရှိ)',
          dataUsedEn: dataUsed.en,
          dataUsedMy: dataUsed.my,
          plannedKalodataApiCalls: 0,
          estimatedCredits: 0,
          estimatedUsd: 0,
          reusesExistingOrCache: false,
          noteEn: 'Kalodata Product ID unavailable — cannot query Comment Insight API (0 cr).',
          noteMy: 'Kalodata Product ID မရှိသဖြင့် Comment Insight API မခေါ်နိုင်ပါ (0 cr)။',
        });
      } else if (!forceRefresh && (coverage.hasReviewInsights || Boolean(cached.reviewInsight))) {
        modules.push({
          analysisId: id,
          costKind: 'cached-reuse',
          requiredApiLayer: 'reviewInsights',
          apiLabelEn: 'Cached Review Insights (0 cr · No API)',
          apiLabelMy: 'Cache ရှိပြီးသား Review Insights (0 cr · API မခေါ်)',
          dataUsedEn: dataUsed.en,
          dataUsedMy: dataUsed.my,
          plannedKalodataApiCalls: 0,
          estimatedCredits: 0,
          estimatedUsd: 0,
          reusesExistingOrCache: true,
          noteEn: 'Reuses already-fetched or cached Review Insights (0 credits).',
          noteMy: 'ရှိပြီးသား သို့မဟုတ် Cache ထဲရှိ Review Insights ကို ပြန်သုံးမည် (0 credits)။',
        });
      } else {
        const alreadyCounted = plannedLayers.has('reviewInsights');
        plannedLayers.add('reviewInsights');
        const credits = alreadyCounted ? 0 : KALODATA_COMMENT_INSIGHT_CREDIT;
        modules.push({
          analysisId: id,
          costKind: 'verified-api',
          requiredApiLayer: 'reviewInsights',
          apiLabelEn: 'Kalodata Comment Insight API (Opt-in · 1.0 cr)',
          apiLabelMy: 'Kalodata Comment Insight API (Opt-in · 1.0 cr)',
          dataUsedEn: dataUsed.en,
          dataUsedMy: dataUsed.my,
          plannedKalodataApiCalls: alreadyCounted ? 0 : 1,
          estimatedCredits: credits,
          estimatedUsd: roundUsd(credits * KALODATA_USD_PER_CREDIT),
          reusesExistingOrCache: false,
          noteEn: `Opt-in Comment Insight API (${KALODATA_COMMENT_INSIGHT_CREDIT} cr).`,
          noteMy: `ရွေးချယ်မှသာခေါ်မည့် Comment Insight API (${KALODATA_COMMENT_INSIGHT_CREDIT} cr)။`,
        });
      }
      continue;
    }

    // Product / Sales / Creator / Video modules
    const needsDetail =
      forceRefresh && id === 'product-intelligence'
        ? coverage.hasKalodataId
        : moduleNeedsProductDetail(id, product);

    if (!needsDetail) {
      modules.push({
        analysisId: id,
        costKind: 'zero-local',
        requiredApiLayer: 'none',
        apiLabelEn: 'Existing Product Data (0 cr · No API)',
        apiLabelMy: 'ရှိပြီးသား Product Data (0 cr · API မခေါ်)',
        dataUsedEn: dataUsed.en,
        dataUsedMy: dataUsed.my,
        plannedKalodataApiCalls: 0,
        estimatedCredits: 0,
        estimatedUsd: 0,
        reusesExistingOrCache: true,
        noteEn: 'Reuses verified metrics already present on this product (0 credits).',
        noteMy: 'Product ထဲတွင် ရှိပြီးသား အတည်ပြုပြီး Data ကို ပြန်သုံးမည် (0 credits)။',
      });
    } else if (!forceRefresh && cached.productDetail) {
      modules.push({
        analysisId: id,
        costKind: 'cached-reuse',
        requiredApiLayer: 'productDetail',
        apiLabelEn: 'Cached Product Detail (0 cr · No API)',
        apiLabelMy: 'Cache ရှိပြီးသား Product Detail (0 cr · API မခေါ်)',
        dataUsedEn: dataUsed.en,
        dataUsedMy: dataUsed.my,
        plannedKalodataApiCalls: 0,
        estimatedCredits: 0,
        estimatedUsd: 0,
        reusesExistingOrCache: true,
        noteEn: 'Reuses cached Kalodata Product Detail (0 credits).',
        noteMy: 'Cache ထဲရှိ Kalodata Product Detail ကို ပြန်သုံးမည် (0 credits)။',
      });
    } else {
      const alreadyCounted = plannedLayers.has('productDetail');
      plannedLayers.add('productDetail');
      const credits = alreadyCounted ? 0 : KALODATA_PRODUCT_DETAIL_CREDIT;
      modules.push({
        analysisId: id,
        costKind: 'verified-api',
        requiredApiLayer: 'productDetail',
        apiLabelEn: alreadyCounted
          ? 'Shared Kalodata Product Detail (0 extra cr)'
          : `Kalodata Product Detail API (${KALODATA_PRODUCT_DETAIL_CREDIT} cr)`,
        apiLabelMy: alreadyCounted
          ? 'မျှဝေသုံးမည့် Product Detail API (0 extra cr)'
          : `Kalodata Product Detail API (${KALODATA_PRODUCT_DETAIL_CREDIT} cr)`,
        dataUsedEn: dataUsed.en,
        dataUsedMy: dataUsed.my,
        plannedKalodataApiCalls: alreadyCounted ? 0 : 1,
        estimatedCredits: credits,
        estimatedUsd: roundUsd(credits * KALODATA_USD_PER_CREDIT),
        reusesExistingOrCache: alreadyCounted,
        isSharedDeduplicated: alreadyCounted,
        noteEn: alreadyCounted
          ? 'Shares deduplicated Product Detail call with another selected module (0 extra cr).'
          : `Uses 1 verified Product Detail API call (${KALODATA_PRODUCT_DETAIL_CREDIT} cr, shared across modules).`,
        noteMy: alreadyCounted
          ? 'အခြား Module နှင့် Product Detail API ၁ ကြိမ်တည်း မျှဝေသုံးမည် (0 extra cr)။'
          : `Product Detail API ၁ ကြိမ် (${KALODATA_PRODUCT_DETAIL_CREDIT} cr) ခေါ်ပြီး Module များအကြား မျှဝေသုံးမည်။`,
      });
    }
  }

  const plannedKalodataApiCalls = modules.reduce(
    (sum, item) => sum + item.plannedKalodataApiCalls,
    0
  );
  const estimatedCredits = roundCredits(
    modules.reduce((sum, item) => sum + item.estimatedCredits, 0)
  );
  const cachedOrLocalModuleCount = modules.filter(
    (m) =>
      (m.costKind === 'zero-local' || m.costKind === 'cached-reuse') &&
      m.plannedKalodataApiCalls === 0
  ).length;
  const sharedDeduplicatedModuleCount = modules.filter(
    (m) => m.isSharedDeduplicated === true
  ).length;
  const hasHighCostReviewInsight = modules.some(
    (m) =>
      m.analysisId === 'customer-review-intelligence' &&
      m.plannedKalodataApiCalls > 0 &&
      m.estimatedCredits >= KALODATA_COMMENT_INSIGHT_CREDIT
  );

  return {
    canonicalProductId,
    analysisIds: uniqueIds,
    deduplicatedLayers: Array.from(plannedLayers),
    plannedKalodataApiCalls,
    plannedGeminiCalls,
    hasSeparateAiBilling: plannedGeminiCalls > 0,
    geminiBillingStatus: plannedGeminiCalls > 0 ? 'estimated-unavailable' : 'none',
    estimatedCredits,
    estimatedUsd: roundUsd(estimatedCredits * KALODATA_USD_PER_CREDIT),
    includesOptInReviewApi: uniqueIds.includes('customer-review-intelligence'),
    hasHighCostReviewInsight,
    cachedOrLocalModuleCount,
    sharedDeduplicatedModuleCount,
    requiresExplicitConfirmation: plannedKalodataApiCalls > 0 || plannedGeminiCalls > 0,
    modules,
  };
}

/**
 * Pure Spending Limit & Live Balance Guard for Phase 9.3.
 * Shared across UI preview, pre-run confirmation, and engine pre-flight gate.
 */
export function evaluateDeepDiveBudgetGuard(
  estimate: DeepDiveExecutionCostEstimate,
  options?: {
    spendingLimitCredits?: number;
    sessionCreditsAlreadySpent?: number;
    liveBalanceCredits?: number | null;
  }
): DeepDiveBudgetGuardResult {
  const rawLimit =
    typeof options?.spendingLimitCredits === 'number' &&
    Number.isFinite(options.spendingLimitCredits)
      ? options.spendingLimitCredits
      : DEFAULT_SPENDING_LIMIT_CREDITS;
  const spendingLimitCredits = roundCredits(
    Math.max(MIN_SPENDING_LIMIT_CREDITS, Math.min(MAX_SPENDING_LIMIT_CREDITS, rawLimit))
  );
  const sessionCreditsAlreadySpent =
    typeof options?.sessionCreditsAlreadySpent === 'number' &&
    Number.isFinite(options.sessionCreditsAlreadySpent) &&
    options.sessionCreditsAlreadySpent > 0
      ? roundCredits(options.sessionCreditsAlreadySpent)
      : 0;
  const liveBalanceCredits =
    typeof options?.liveBalanceCredits === 'number' &&
    Number.isFinite(options.liveBalanceCredits)
      ? roundCredits(options.liveBalanceCredits)
      : null;

  const remainingBudgetBeforeRun = Math.max(
    0,
    roundCredits(spendingLimitCredits - sessionCreditsAlreadySpent)
  );
  const remainingBudgetAfterRun = roundCredits(
    remainingBudgetBeforeRun - estimate.estimatedCredits
  );
  const exceedsSpendingLimit =
    estimate.plannedKalodataApiCalls > 0 &&
    estimate.estimatedCredits > remainingBudgetBeforeRun + 1e-6;
  const exceedsLiveBalance =
    estimate.plannedKalodataApiCalls > 0 &&
    liveBalanceCredits !== null &&
    estimate.estimatedCredits > liveBalanceCredits + 1e-6;
  const recommendedMinimumLimit = roundCredits(
    Math.min(
      MAX_SPENDING_LIMIT_CREDITS,
      Math.max(
        MIN_SPENDING_LIMIT_CREDITS,
        sessionCreditsAlreadySpent + estimate.estimatedCredits
      )
    )
  );

  return {
    spendingLimitCredits,
    sessionCreditsAlreadySpent,
    remainingBudgetBeforeRun,
    remainingBudgetAfterRun,
    exceedsSpendingLimit,
    exceedsLiveBalance,
    liveBalanceCredits,
    canProceedWithoutLimitChange: !exceedsSpendingLimit && !exceedsLiveBalance,
    recommendedMinimumLimit,
    requiresExplicitConfirmation: estimate.requiresExplicitConfirmation,
  };
}

/**
 * Compact verified summary of a completed module for Gemini synthesis (Option #8).
 */
export function buildCompletedModuleDigest(
  result: DeepDiveModuleResult
): DeepDiveCompletedModuleDigest {
  return {
    analysisId: result.analysisId,
    outcome: result.outcome,
    dataStatus: result.dataStatus,
    headlineEn: result.headlineEn,
    summaryEn: result.summaryEn,
    metrics: result.metrics.slice(0, 10).map((m) => ({
      label: m.labelEn,
      value: m.valueEn,
      status: m.status,
    })),
    unavailableNotes: result.unavailableNotesEn.slice(0, 4),
  };
}

interface LayerFetchOutcome {
  product: ResearchProduct;
  apiCallsMade: number;
  creditsUsed: number;
  reusedFromCache: boolean;
  sourceLabelEn: string;
  sourceLabelMy: string;
}

class ModuleExecutionError extends Error {
  code: string;
  messageMy: string;

  constructor(code: string, messageEn: string, messageMy: string) {
    super(messageEn);
    this.name = 'ModuleExecutionError';
    this.code = code;
    this.messageMy = messageMy;
  }
}

/**
 * Shared per-batch deduplication session.
 * Prevents duplicate API calls when multiple selected modules need `productDetail`,
 * while strictly keeping the caller's original `ResearchProduct` unmutated.
 */
interface DeepDiveBatchSession {
  runId: string;
  canonicalProductId: string;
  workingProduct: ResearchProduct;
  inFlightLayers: Map<string, Promise<LayerFetchOutcome>>;
  spendingLimitCredits: number;
  sessionCreditsAlreadySpent: number;
  requireExplicitConfirmation: boolean;
  userConfirmedPaidExecution: boolean;
  salesWeightPct: number;
  latestBalanceAfter: number | null;
  latestBudgetSnapshot: DeepDiveServerBudgetSnapshot | null;
  deps: Required<DeepDiveExecutionDependencies>;
}

function createBatchSession(
  originalProduct: ResearchProduct,
  options: {
    runId: string;
    spendingLimitCredits?: number;
    sessionCreditsAlreadySpent?: number;
    requireExplicitConfirmation?: boolean;
    userConfirmedPaidExecution?: boolean;
    salesWeightPct?: number;
    deps?: DeepDiveExecutionDependencies;
  }
): DeepDiveBatchSession {
  const deps: Required<DeepDiveExecutionDependencies> = {
    enrichProductFn: options.deps?.enrichProductFn ?? defaultEnrichProductFn,
    runAiStrategyFn: options.deps?.runAiStrategyFn ?? defaultRunAiStrategyFn,
    getCacheFn: options.deps?.getCacheFn ?? getCachedEnrichmentForProduct,
    saveCacheFn: options.deps?.saveCacheFn ?? saveEnrichmentToCache,
    nowIsoFn: options.deps?.nowIsoFn ?? (() => new Date().toISOString()),
  };

  // Start from a shallow non-mutating copy of the product (never mutate original!)
  const workingProduct: ResearchProduct = {
    ...originalProduct,
    kalodataMetrics: originalProduct.kalodataMetrics
      ? { ...originalProduct.kalodataMetrics }
      : undefined,
  };

  return {
    runId: options.runId,
    canonicalProductId: getCanonicalProductId(originalProduct),
    workingProduct,
    inFlightLayers: new Map(),
    spendingLimitCredits: options.spendingLimitCredits ?? DEFAULT_SPENDING_LIMIT_CREDITS,
    sessionCreditsAlreadySpent: Math.max(0, options.sessionCreditsAlreadySpent ?? 0),
    requireExplicitConfirmation: options.requireExplicitConfirmation === true,
    userConfirmedPaidExecution: options.userConfirmedPaidExecution === true,
    salesWeightPct: options.salesWeightPct ?? 50,
    latestBalanceAfter: null,
    latestBudgetSnapshot: null,
    deps,
  };
}

async function ensureLayerOnSession(
  session: DeepDiveBatchSession,
  layer: 'productDetail' | 'reviewInsights',
  forceRefresh = false
): Promise<LayerFetchOutcome> {
  const dedupeKey = `${session.canonicalProductId}:${layer}:${forceRefresh ? 'refresh' : 'cached'}`;
  const existingPromise = session.inFlightLayers.get(dedupeKey);
  if (existingPromise) {
    const shared = await existingPromise;
    // Duplicate call prevented — caller shares the resolved data at 0 additional calls/credits
    return {
      ...shared,
      apiCallsMade: 0,
      creditsUsed: 0,
      reusedFromCache: true,
      sourceLabelEn:
        layer === 'productDetail'
          ? 'Shared Kalodata Product Detail (deduplicated · 0 extra cr)'
          : 'Shared Kalodata Comment Insight (deduplicated · 0 extra cr)',
      sourceLabelMy:
        layer === 'productDetail'
          ? 'မျှဝေသုံးစွဲထားသော Kalodata Product Detail (ထပ်မခေါ်ပါ · 0 extra cr)'
          : 'မျှဝေသုံးစွဲထားသော Kalodata Comment Insight (ထပ်မခေါ်ပါ · 0 extra cr)',
    };
  }

  const runPromise = (async (): Promise<LayerFetchOutcome> => {
    const current = session.workingProduct;
    const coverage = getProductEnrichmentCoverage(current);
    const cached = session.deps.getCacheFn(current);

    if (layer === 'productDetail') {
      if (!forceRefresh && coverage.hasProductDetail) {
        return {
          product: current,
          apiCallsMade: 0,
          creditsUsed: 0,
          reusedFromCache: true,
          sourceLabelEn: 'Existing Research Product Data',
          sourceLabelMy: 'ရှိပြီးသား Research Product Data',
        };
      }
      if (!forceRefresh && cached.productDetail) {
        const merged = mergeEnrichmentIntoProduct(
          current,
          { productDetail: cached.productDetail },
          { salesWeightPct: session.salesWeightPct }
        );
        session.workingProduct = merged.product;
        return {
          product: merged.product,
          apiCallsMade: 0,
          creditsUsed: 0,
          reusedFromCache: true,
          sourceLabelEn: 'Cached Kalodata Product Detail (0 cr)',
          sourceLabelMy: 'Cache ထဲရှိ Kalodata Product Detail (0 cr)',
        };
      }
      if (!coverage.hasKalodataId) {
        return {
          product: current,
          apiCallsMade: 0,
          creditsUsed: 0,
          reusedFromCache: false,
          sourceLabelEn: 'Existing Product Data (Kalodata ID unavailable)',
          sourceLabelMy: 'ရှိပြီးသား Product Data (Kalodata ID မရှိပါ)',
        };
      }

      const res = await session.deps.enrichProductFn({
        product: current,
        requestedLayers: {
          productDetail: true,
          shopDetail: false,
          reviewInsights: false,
        },
        spendingLimitCredits: session.spendingLimitCredits,
        sessionCreditsAlreadySpent: session.sessionCreditsAlreadySpent,
        runId: session.runId,
        idempotencyKey: `dd:${session.runId}:${session.canonicalProductId}:productDetail${forceRefresh ? ':refresh' : ''}`,
        requireExplicitConfirmation: session.requireExplicitConfirmation,
        userConfirmedPaidExecution: session.userConfirmedPaidExecution,
        forceRefresh,
        clientCachedProductDetail: forceRefresh ? null : cached.productDetail,
        salesWeightPct: session.salesWeightPct,
      });

      if (!res.ok) {
        if (res.budgetSnapshot) {
          session.latestBudgetSnapshot = res.budgetSnapshot;
        }
        throw new ModuleExecutionError(
          res.code ?? 'PRODUCT_DETAIL_FAILED',
          res.error ?? 'Failed to fetch Kalodata Product Detail.',
          res.errorMy ?? 'Kalodata Product Detail ရယူမှု မအောင်မြင်ပါ။'
        );
      }

      if (res.budgetSnapshot) {
        session.latestBudgetSnapshot = res.budgetSnapshot;
      }

      if (res.productDetail) {
        session.deps.saveCacheFn({ productDetail: res.productDetail });
        const merged = mergeEnrichmentIntoProduct(
          session.workingProduct,
          { productDetail: res.productDetail },
          { salesWeightPct: session.salesWeightPct }
        );
        session.workingProduct = merged.product;
      } else if (res.product) {
        session.workingProduct = res.product;
      }

      const layerStatus = res.summary?.layerResults.productDetail;
      if (layerStatus === 'failed') {
        const err = res.summary?.layerErrors?.productDetail;
        throw new ModuleExecutionError(
          'PRODUCT_DETAIL_FAILED',
          err?.en ?? 'Kalodata Product Detail API returned an error.',
          err?.my ?? 'Kalodata Product Detail API ခေါ်ဆိုမှု မအောင်မြင်ပါ။'
        );
      }

      if (
        typeof res.summary?.balanceAfter === 'number' &&
        Number.isFinite(res.summary.balanceAfter)
      ) {
        session.latestBalanceAfter = res.summary.balanceAfter;
      }

      const apiCalls = res.summary?.actualApiCalls ?? (layerStatus === 'fetched' ? 1 : 0);
      const credits =
        res.summary?.actualCredits ??
        (apiCalls > 0 ? roundCredits(apiCalls * KALODATA_PRODUCT_DETAIL_CREDIT) : 0);
      const reused = apiCalls === 0;

      return {
        product: session.workingProduct,
        apiCallsMade: apiCalls,
        creditsUsed: credits,
        reusedFromCache: reused,
        sourceLabelEn: reused
          ? 'Kalodata Product Detail Cache (0 cr)'
          : 'Kalodata Product Detail API',
        sourceLabelMy: reused
          ? 'Kalodata Product Detail Cache (0 cr)'
          : 'Kalodata Product Detail API',
      };
    }

    // layer === 'reviewInsights' (STRICTLY OPT-IN ONLY)
    if (!forceRefresh && coverage.hasReviewInsights) {
      return {
        product: current,
        apiCallsMade: 0,
        creditsUsed: 0,
        reusedFromCache: true,
        sourceLabelEn: 'Existing Verified Review Insights (0 cr)',
        sourceLabelMy: 'ရှိပြီးသား အတည်ပြုပြီး Review Insights (0 cr)',
      };
    }
    if (!forceRefresh && cached.reviewInsight) {
      const merged = mergeEnrichmentIntoProduct(
        current,
        { reviewInsight: cached.reviewInsight },
        { salesWeightPct: session.salesWeightPct }
      );
      session.workingProduct = merged.product;
      return {
        product: merged.product,
        apiCallsMade: 0,
        creditsUsed: 0,
        reusedFromCache: true,
        sourceLabelEn: 'Cached Kalodata Comment Insight (0 cr)',
        sourceLabelMy: 'Cache ထဲရှိ Kalodata Comment Insight (0 cr)',
      };
    }
    if (!coverage.hasKalodataId) {
      return {
        product: current,
        apiCallsMade: 0,
        creditsUsed: 0,
        reusedFromCache: false,
        sourceLabelEn: 'Kalodata Product ID unavailable',
        sourceLabelMy: 'Kalodata Product ID မရှိပါ',
      };
    }

    const res = await session.deps.enrichProductFn({
      product: current,
      requestedLayers: {
        productDetail: false,
        shopDetail: false,
        reviewInsights: true,
      },
      spendingLimitCredits: session.spendingLimitCredits,
      sessionCreditsAlreadySpent: session.sessionCreditsAlreadySpent,
      runId: session.runId,
      idempotencyKey: `dd:${session.runId}:${session.canonicalProductId}:reviewInsights${forceRefresh ? ':refresh' : ''}`,
      requireExplicitConfirmation: session.requireExplicitConfirmation,
      userConfirmedPaidExecution: session.userConfirmedPaidExecution,
      forceRefresh,
      clientCachedReviewInsight: forceRefresh ? null : cached.reviewInsight,
      salesWeightPct: session.salesWeightPct,
    });

    if (!res.ok) {
      if (res.budgetSnapshot) {
        session.latestBudgetSnapshot = res.budgetSnapshot;
      }
      throw new ModuleExecutionError(
        res.code ?? 'REVIEW_INSIGHT_FAILED',
        res.error ?? 'Failed to fetch Kalodata Comment Insight.',
        res.errorMy ?? 'Kalodata Review / Comment Insight ရယူမှု မအောင်မြင်ပါ။'
      );
    }

    if (res.budgetSnapshot) {
      session.latestBudgetSnapshot = res.budgetSnapshot;
    }

    if (res.reviewInsight) {
      session.deps.saveCacheFn({ reviewInsight: res.reviewInsight });
      const merged = mergeEnrichmentIntoProduct(
        session.workingProduct,
        { reviewInsight: res.reviewInsight },
        { salesWeightPct: session.salesWeightPct }
      );
      session.workingProduct = merged.product;
    } else if (res.product) {
      session.workingProduct = res.product;
    }

    const layerStatus = res.summary?.layerResults.reviewInsights;
    if (layerStatus === 'failed') {
      const err = res.summary?.layerErrors?.reviewInsights;
      throw new ModuleExecutionError(
        'REVIEW_INSIGHT_FAILED',
        err?.en ?? 'Kalodata Comment Insight API returned an error.',
        err?.my ?? 'Kalodata Comment Insight API ခေါ်ဆိုမှု မအောင်မြင်ပါ။'
      );
    }

    if (
      typeof res.summary?.balanceAfter === 'number' &&
      Number.isFinite(res.summary.balanceAfter)
    ) {
      session.latestBalanceAfter = res.summary.balanceAfter;
    }

    const apiCalls = res.summary?.actualApiCalls ?? (layerStatus === 'fetched' ? 1 : 0);
    const credits =
      res.summary?.actualCredits ??
      (apiCalls > 0 ? roundCredits(apiCalls * KALODATA_COMMENT_INSIGHT_CREDIT) : 0);
    const reused = apiCalls === 0;

    return {
      product: session.workingProduct,
      apiCallsMade: apiCalls,
      creditsUsed: credits,
      reusedFromCache: reused,
      sourceLabelEn: reused
        ? 'Kalodata Comment Insight Cache (0 cr)'
        : 'Kalodata Comment Insight API (Opt-in)',
      sourceLabelMy: reused
        ? 'Kalodata Comment Insight Cache (0 cr)'
        : 'Kalodata Comment Insight API (ရွေးချယ်ခေါ်ယူပြီး)',
    };
  })();

  session.inFlightLayers.set(dedupeKey, runPromise);
  try {
    return await runPromise;
  } catch (err) {
    session.inFlightLayers.delete(dedupeKey);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// 1. Product Intelligence
// ---------------------------------------------------------------------------
async function executeProductIntelligence(
  session: DeepDiveBatchSession,
  forceRefresh: boolean
): Promise<DeepDiveModuleResult> {
  const completedAt = session.deps.nowIsoFn();
  const needsDetail =
    forceRefresh || moduleNeedsProductDetail('product-intelligence', session.workingProduct);

  let apiCallsMade = 0;
  let creditsUsed = 0;
  let reusedFromCache = true;
  const dataSourcesEn = ['Existing Research Product Data'];
  const dataSourcesMy = ['ရှိပြီးသား Research Product Data'];

  if (needsDetail && isValidKalodataId(session.workingProduct.kalodataMetrics?.productId)) {
    const fetched = await ensureLayerOnSession(session, 'productDetail', forceRefresh);
    apiCallsMade = fetched.apiCallsMade;
    creditsUsed = fetched.creditsUsed;
    reusedFromCache = fetched.reusedFromCache;
    if (!dataSourcesEn.includes(fetched.sourceLabelEn)) {
      dataSourcesEn.push(fetched.sourceLabelEn);
      dataSourcesMy.push(fetched.sourceLabelMy);
    }
  }

  const p = session.workingProduct;
  const m = p.kalodataMetrics;
  const categoryPathEn = [
    m?.priCategory?.category_name ?? getCategoryLabel(p.category, 'en'),
    m?.secCategory?.category_name ?? (p.subCategory !== 'Unavailable' ? p.subCategory : null),
    m?.terCategory?.category_name ?? null,
  ]
    .filter(Boolean)
    .join(' > ');
  const categoryPathMy = [
    m?.priCategory?.category_name ?? getCategoryLabel(p.category, 'my'),
    m?.secCategory?.category_name ?? (p.subCategoryMy !== 'Unavailable' ? p.subCategoryMy : null),
    m?.terCategory?.category_name ?? null,
  ]
    .filter(Boolean)
    .join(' > ');

  const hasPriceRange =
    typeof m?.minPriceThb === 'number' &&
    typeof m?.maxPriceThb === 'number' &&
    m.minPriceThb > 0 &&
    m.maxPriceThb > 0;
  const priceRangeDisplay = hasPriceRange
    ? m!.minPriceThb === m!.maxPriceThb
      ? fmtThb(m!.minPriceThb)
      : `${fmtThb(m!.minPriceThb)} – ${fmtThb(m!.maxPriceThb)}`
    : p.priceThb !== null
      ? fmtThb(p.priceThb)
      : 'Unavailable';

  const skuCount = typeof m?.skuCount === 'number' && m.skuCount > 0 ? m.skuCount : null;
  const reviewCount = p.reviewCount ?? m?.productReviewCount ?? null;
  const rating = p.customerRating ?? null;

  const metrics: DeepDiveMetricRow[] = [
    {
      key: 'category',
      labelEn: 'Category Path',
      labelMy: 'Product Category',
      valueEn: categoryPathEn || 'Unavailable',
      valueMy: categoryPathMy || 'မရရှိနိုင်ပါ',
      status: categoryPathEn ? 'verified' : 'unavailable',
    },
    {
      key: 'price',
      labelEn: 'Unit Price / Range',
      labelMy: 'ဈေးနှုန်း / အပိုင်းအခြား',
      valueEn:
        p.priceThb !== null
          ? hasPriceRange && m!.minPriceThb !== m!.maxPriceThb
            ? `${fmtThb(p.priceThb)} (${priceRangeDisplay})`
            : fmtThb(p.priceThb)
          : 'Unavailable',
      valueMy:
        p.priceThb !== null
          ? hasPriceRange && m!.minPriceThb !== m!.maxPriceThb
            ? `${fmtThb(p.priceThb)} (${priceRangeDisplay})`
            : fmtThb(p.priceThb)
          : 'မရရှိနိုင်ပါ',
      status: p.priceThb !== null ? 'verified' : 'unavailable',
    },
    {
      key: 'skuCount',
      labelEn: 'SKU Variants',
      labelMy: 'SKU အရေအတွက်',
      valueEn: skuCount !== null ? `${skuCount} SKUs` : 'Unavailable',
      valueMy: skuCount !== null ? `SKU ${skuCount} မျိုး` : 'မရရှိနိုင်ပါ',
      status: skuCount !== null ? 'verified' : 'unavailable',
    },
    {
      key: 'reviewCount',
      labelEn: 'Review Count',
      labelMy: 'Review အရေအတွက်',
      valueEn: reviewCount !== null ? `${fmtNum(reviewCount)} reviews` : 'Unavailable',
      valueMy: reviewCount !== null ? `Review ${fmtNum(reviewCount)} ခု` : 'မရရှိနိုင်ပါ',
      status: reviewCount !== null ? 'verified' : 'unavailable',
    },
    {
      key: 'customerRating',
      labelEn: 'Customer Rating (5-Star)',
      labelMy: '5-Star Customer Rating',
      valueEn: rating !== null ? `${rating}/5` : 'Unavailable',
      valueMy: rating !== null ? `${rating}/5` : 'မရရှိနိုင်ပါ',
      status: rating !== null ? 'verified' : 'unavailable',
    },
    {
      key: 'shopDelivery',
      labelEn: 'Shop & Fulfillment',
      labelMy: 'ဆိုင်နှင့် ပို့ဆောင်မှု',
      valueEn: `${p.shopName} · ${m?.deliveryType ?? p.dispatchHub}`,
      valueMy: `${p.shopName} · ${m?.deliveryType ?? p.dispatchHub}`,
      status: p.shopName && p.shopName !== 'Unavailable' ? 'verified' : 'unverified',
    },
    {
      key: 'launchDate',
      labelEn: 'Launch Date',
      labelMy: 'စတင်ရောင်းချသည့်နေ့',
      valueEn: m?.launchDate ?? 'Unavailable',
      valueMy: m?.launchDate ?? 'မရရှိနိုင်ပါ',
      status: m?.launchDate ? 'verified' : 'unavailable',
    },
  ];

  const evalSummary = evaluateProductOpportunity(p, { salesWeightPct: session.salesWeightPct });
  const sections: DeepDiveResultSection[] = [];
  if (evalSummary.strengthsEn.length > 0) {
    sections.push({
      id: 'strengths',
      titleEn: 'Verified Product Strengths',
      titleMy: 'အတည်ပြုပြီး Product အားသာချက်များ',
      status: 'verified',
      bulletsEn: evalSummary.strengthsEn.slice(0, 4),
      bulletsMy: evalSummary.strengthsMy.slice(0, 4),
    });
  }
  if (evalSummary.weaknessesEn.length > 0 || evalSummary.risksEn.length > 0) {
    sections.push({
      id: 'weaknesses',
      titleEn: 'Observed Weaknesses & Watchpoints',
      titleMy: 'သတိပြုရမည့် အားနည်းချက်များ',
      status: 'verified',
      bulletsEn: [...evalSummary.weaknessesEn, ...evalSummary.risksEn].slice(0, 4),
      bulletsMy: [...evalSummary.weaknessesMy, ...evalSummary.risksMy].slice(0, 4),
    });
  }

  const unavailableNotesEn: string[] = [];
  const unavailableNotesMy: string[] = [];
  if (rating === null) {
    unavailableNotesEn.push('Official TikTok Shop 5-star customer rating is Unavailable in Kalodata Rank/Detail APIs.');
    unavailableNotesMy.push('TikTok Shop တရားဝင် 5-Star Customer Rating သည် Kalodata Rank/Detail API တွင် မပါဝင်ပါ (Unavailable)။');
  }
  if (skuCount === null) {
    unavailableNotesEn.push('Detailed per-SKU variant breakdown is Unavailable for this listing.');
    unavailableNotesMy.push('SKU Variant တစ်ခုချင်းစီ အသေးစိတ်အချက်အလက် မရရှိနိုင်ပါ (Unavailable)။');
  }

  return {
    analysisId: 'product-intelligence',
    outcome: 'completed',
    dataStatus: p.priceThb !== null ? 'verified' : 'unverified',
    isAiInterpretation: false,
    headlineEn: `${p.name} — Verified Product Snapshot`,
    headlineMy: `${p.nameMy} — အတည်ပြုပြီး ထုတ်ကုန်အသေးစိတ်`,
    summaryEn: `Category: ${categoryPathEn}. Priced at ${priceRangeDisplay} via ${p.shopName} (${m?.deliveryType ?? p.dispatchHub}).`,
    summaryMy: `အမျိုးအစား: ${categoryPathMy}။ ဈေးနှုန်း ${priceRangeDisplay} ဖြစ်ပြီး ${p.shopName} (${m?.deliveryType ?? p.dispatchHub}) မှ ရောင်းချပါသည်။`,
    metrics,
    sections,
    unavailableNotesEn,
    unavailableNotesMy,
    dataSourcesEn,
    dataSourcesMy,
    apiCallsMade,
    creditsUsed,
    reusedFromCache,
    completedAt,
  };
}

// ---------------------------------------------------------------------------
// 2. Sales & Market Intelligence
// ---------------------------------------------------------------------------
async function executeSalesMarketIntelligence(
  session: DeepDiveBatchSession,
  forceRefresh: boolean
): Promise<DeepDiveModuleResult> {
  const completedAt = session.deps.nowIsoFn();
  let apiCallsMade = 0;
  let creditsUsed = 0;
  let reusedFromCache = true;
  const dataSourcesEn = ['Existing Kalodata Sales & Revenue Data'];
  const dataSourcesMy = ['ရှိပြီးသား Kalodata ရောင်းအားနှင့် ဝင်ငွေ Data'];

  if (
    moduleNeedsProductDetail('sales-market-intelligence', session.workingProduct) &&
    isValidKalodataId(session.workingProduct.kalodataMetrics?.productId)
  ) {
    const fetched = await ensureLayerOnSession(session, 'productDetail', forceRefresh);
    apiCallsMade = fetched.apiCallsMade;
    creditsUsed = fetched.creditsUsed;
    reusedFromCache = fetched.reusedFromCache;
    dataSourcesEn.push(fetched.sourceLabelEn);
    dataSourcesMy.push(fetched.sourceLabelMy);
  }

  const p = session.workingProduct;
  const m = p.kalodataMetrics;
  const sales = m?.salesVolume ?? null;
  const revenue = m?.revenueThb ?? null;
  const growth = m?.revenueGrowthRate ?? null;
  const videoRev = m?.videoRevenueThb ?? null;
  const liveRev = m?.liveRevenueThb ?? null;
  const showcaseRev = m?.showcaseRevenueThb ?? null;
  const mallRev = m?.shoppingMallRevenueThb ?? null;
  const dateRange = m?.dateRange ?? 'Unavailable';

  const unavailableNotesEn = [
    'Daily / Weekly / Monthly dated historical trend series API is Unavailable / Not Verified — no trend chart or period-by-period series was fabricated.',
  ];
  const unavailableNotesMy = [
    'Daily / Weekly / Monthly အချိန်အလိုက် Historical Trend API သည် မရရှိနိုင်သေးပါ (Unavailable / Not Verified) — အတုအယောင် Trend ဂရပ်များ မဖန်တီးထားပါ။',
  ];

  if (sales === null && revenue === null) {
    return {
      analysisId: 'sales-market-intelligence',
      outcome: 'unavailable',
      dataStatus: 'unavailable',
      isAiInterpretation: false,
      headlineEn: 'Sales & Revenue Metrics Unavailable',
      headlineMy: 'ရောင်းအားနှင့် ဝင်ငွေ Data မရရှိနိုင်ပါ',
      summaryEn: 'Neither sales volume nor GMV revenue was returned by verified Kalodata sources for this product.',
      summaryMy: 'ဤ Product အတွက် Kalodata မှ အတည်ပြုပြီး ရောင်းအားနှင့် ဝင်ငွေ Data မရရှိနိုင်ပါ။',
      metrics: [],
      sections: [],
      unavailableNotesEn,
      unavailableNotesMy,
      dataSourcesEn,
      dataSourcesMy,
      apiCallsMade,
      creditsUsed,
      reusedFromCache,
      completedAt,
    };
  }

  if (growth === null) {
    unavailableNotesEn.push('Period-over-period Revenue Growth Rate is Unavailable in the current Kalodata payload.');
    unavailableNotesMy.push('ရောင်းအားတိုးတက်နှုန်း (Revenue Growth Rate) သည် လက်ရှိ Kalodata Data တွင် မပါဝင်ပါ (Unavailable)။');
  }

  const videoSharePct =
    revenue && revenue > 0 && videoRev !== null ? Math.round((videoRev / revenue) * 1000) / 10 : null;
  const liveSharePct =
    revenue && revenue > 0 && liveRev !== null ? Math.round((liveRev / revenue) * 1000) / 10 : null;

  const metrics: DeepDiveMetricRow[] = [
    {
      key: 'salesVolume',
      labelEn: `Sales Volume (${dateRange})`,
      labelMy: `ရောင်းအားပမာဏ (${dateRange})`,
      valueEn: sales !== null ? `${fmtNum(sales)} units` : 'Unavailable',
      valueMy: sales !== null ? `${fmtNum(sales)} ခု` : 'မရရှိနိုင်ပါ',
      status: sales !== null ? 'verified' : 'unavailable',
    },
    {
      key: 'revenueThb',
      labelEn: `GMV / Revenue (${dateRange})`,
      labelMy: `စုစုပေါင်းရောင်းရငွေ (${dateRange})`,
      valueEn: fmtThb(revenue),
      valueMy: revenue !== null ? fmtThb(revenue) : 'မရရှိနိုင်ပါ',
      status: revenue !== null ? 'verified' : 'unavailable',
    },
    {
      key: 'growthRate',
      labelEn: 'Revenue Growth Rate',
      labelMy: 'ရောင်းအားတိုးတက်နှုန်း',
      valueEn: growth !== null ? `${growth > 0 ? '+' : ''}${fmtPct(growth)}` : 'Unavailable',
      valueMy: growth !== null ? `${growth > 0 ? '+' : ''}${fmtPct(growth)}` : 'မရရှိနိုင်ပါ',
      status: growth !== null ? 'verified' : 'unavailable',
    },
    {
      key: 'videoRevenue',
      labelEn: 'Video Channel GMV',
      labelMy: 'Video မှ ရောင်းရငွေ',
      valueEn:
        videoRev !== null
          ? `${fmtThb(videoRev)}${videoSharePct !== null ? ` (${videoSharePct}%)` : ''}`
          : 'Unavailable',
      valueMy:
        videoRev !== null
          ? `${fmtThb(videoRev)}${videoSharePct !== null ? ` (${videoSharePct}%)` : ''}`
          : 'မရရှိနိုင်ပါ',
      status: videoRev !== null ? 'verified' : 'unavailable',
    },
    {
      key: 'liveRevenue',
      labelEn: 'Live Channel GMV',
      labelMy: 'Live မှ ရောင်းရငွေ',
      valueEn:
        liveRev !== null
          ? `${fmtThb(liveRev)}${liveSharePct !== null ? ` (${liveSharePct}%)` : ''}`
          : 'Unavailable',
      valueMy:
        liveRev !== null
          ? `${fmtThb(liveRev)}${liveSharePct !== null ? ` (${liveSharePct}%)` : ''}`
          : 'မရရှိနိုင်ပါ',
      status: liveRev !== null ? 'verified' : 'unavailable',
    },
    {
      key: 'otherChannels',
      labelEn: 'Showcase / Mall GMV',
      labelMy: 'Showcase / Mall ဝင်ငွေ',
      valueEn:
        showcaseRev !== null || mallRev !== null
          ? `Showcase ${showcaseRev !== null ? fmtThb(showcaseRev) : '—'} · Mall ${mallRev !== null ? fmtThb(mallRev) : '—'}`
          : 'Unavailable',
      valueMy:
        showcaseRev !== null || mallRev !== null
          ? `Showcase ${showcaseRev !== null ? fmtThb(showcaseRev) : '—'} · Mall ${mallRev !== null ? fmtThb(mallRev) : '—'}`
          : 'မရရှိနိုင်ပါ',
      status: showcaseRev !== null || mallRev !== null ? 'verified' : 'unavailable',
    },
  ];

  if (m?.trendPointsCount && m.trendPointsCount > 0 && (m.trendPeakThb !== null || m.trendAvgThb !== null)) {
    metrics.push({
      key: 'detailTrendSummary',
      labelEn: `Detail Revenue Summary (${m.trendPointsCount} pts)`,
      labelMy: `Detail ဝင်ငွေအကျဉ်းချုပ် (${m.trendPointsCount} မှတ်)`,
      valueEn: `Peak ${fmtThb(m.trendPeakThb)} · Avg ${fmtThb(m.trendAvgThb)}`,
      valueMy: `အမြင့်ဆုံး ${fmtThb(m.trendPeakThb)} · ပျမ်းမျှ ${fmtThb(m.trendAvgThb)}`,
      status: 'verified',
    });
  }

  return {
    analysisId: 'sales-market-intelligence',
    outcome: 'completed',
    dataStatus: 'verified',
    isAiInterpretation: false,
    headlineEn: `${sales !== null ? `${fmtNum(sales)} units` : 'Verified GMV'} · ${fmtThb(revenue)} (${dateRange})`,
    headlineMy: `${sales !== null ? `${fmtNum(sales)} ခု` : 'အတည်ပြုပြီး GMV'} · ${fmtThb(revenue)} (${dateRange})`,
    summaryEn: `Verified ${dateRange} demand stands at ${sales !== null ? `${fmtNum(sales)} units` : 'N/A'} and ${fmtThb(revenue)} GMV${growth !== null ? ` (${growth >= 0 ? '+' : ''}${growth}% growth)` : ''}.${videoSharePct !== null ? ` Short-video channel drives ${videoSharePct}% of GMV.` : ''}`,
    summaryMy: `${dateRange} အတွင်း အတည်ပြုပြီး ရောင်းအား ${sales !== null ? `${fmtNum(sales)} ခု` : 'N/A'} နှင့် GMV ${fmtThb(revenue)}${growth !== null ? ` (တိုးတက်နှုန်း ${growth >= 0 ? '+' : ''}${growth}%)` : ''} ရှိပါသည်။${videoSharePct !== null ? ` Video Channel မှ GMV ၏ ${videoSharePct}% ရရှိပါသည်။` : ''}`,
    metrics,
    sections: [],
    unavailableNotesEn,
    unavailableNotesMy,
    dataSourcesEn,
    dataSourcesMy,
    apiCallsMade,
    creditsUsed,
    reusedFromCache,
    completedAt,
  };
}

// ---------------------------------------------------------------------------
// 3. Affiliate Profit Analysis (Strictly Local — 0 Credits, 0 API Calls)
// ---------------------------------------------------------------------------
function executeAffiliateProfitAnalysis(session: DeepDiveBatchSession): DeepDiveModuleResult {
  const completedAt = session.deps.nowIsoFn();
  const p = session.workingProduct;
  const m = p.kalodataMetrics;
  const price = typeof p.priceThb === 'number' && Number.isFinite(p.priceThb) && p.priceThb > 0 ? p.priceThb : null;
  const commissionPct =
    p.commissionVerified &&
    typeof p.commissionRate === 'number' &&
    Number.isFinite(p.commissionRate) &&
    p.commissionRate > 0
      ? p.commissionRate
      : typeof m?.commissionRatePct === 'number' &&
          Number.isFinite(m.commissionRatePct) &&
          m.commissionRatePct > 0
        ? m.commissionRatePct
        : null;

  const dataSourcesEn = ['Local Profit Calculator (Verified Product Price & Commission)'];
  const dataSourcesMy = ['Local အမြတ်တွက်ချက်မှု (အတည်ပြုပြီး ဈေးနှုန်းနှင့် ကော်မရှင်)'];

  if (price === null || commissionPct === null) {
    const missingEn = [
      price === null ? 'Unit price (THB)' : null,
      commissionPct === null ? 'Verified affiliate commission rate (%)' : null,
    ].filter(Boolean);

    return {
      analysisId: 'affiliate-profit-analysis',
      outcome: 'unavailable',
      dataStatus: 'unavailable',
      isAiInterpretation: false,
      headlineEn: 'Profit Scenarios Unavailable — Missing Verified Price or Commission',
      headlineMy: 'အမြတ်တွက်ချက်၍ မရပါ — ဈေးနှုန်း သို့မဟုတ် ကော်မရှင် မရရှိပါ',
      summaryEn: `Missing required verified input(s): ${missingEn.join(', ')}. SiamPick never assumes a default commission rate or price.`,
      summaryMy: `တွက်ချက်ရန် လိုအပ်သော Data မရရှိပါ (${missingEn.join(', ')})။ SiamPick သည် ခန့်မှန်းကော်မရှင်နှုန်း အတုဖြင့် မတွက်ချက်ပါ။`,
      metrics: [],
      sections: [],
      unavailableNotesEn: [
        `Cannot calculate commission scenarios without verified ${missingEn.join(' and ')}.`,
      ],
      unavailableNotesMy: [
        `အတည်ပြုပြီး ${missingEn.join(' နှင့် ')} မရှိဘဲ ခန့်မှန်းဝင်ငွေ မတွက်ချက်ပါ။`,
      ],
      dataSourcesEn,
      dataSourcesMy,
      apiCallsMade: 0,
      creditsUsed: 0,
      reusedFromCache: true,
      completedAt,
    };
  }

  const perSaleThb = Math.round(((price * commissionPct) / 100) * 100) / 100;
  const earn10 = perSaleThb * 10;
  const earn50 = perSaleThb * 50;
  const earn100 = perSaleThb * 100;
  const earn500 = perSaleThb * 500;

  const hasMinMax =
    typeof m?.minPriceThb === 'number' &&
    typeof m?.maxPriceThb === 'number' &&
    m.minPriceThb > 0 &&
    m.maxPriceThb > 0 &&
    m.minPriceThb !== m.maxPriceThb;

  const minPerSale = hasMinMax ? (m!.minPriceThb! * commissionPct) / 100 : null;
  const maxPerSale = hasMinMax ? (m!.maxPriceThb! * commissionPct) / 100 : null;

  const metrics: DeepDiveMetricRow[] = [
    {
      key: 'unitPrice',
      labelEn: 'Verified Unit Price',
      labelMy: 'အတည်ပြုပြီး ဈေးနှုန်း',
      valueEn: fmtThbDecimal(price),
      valueMy: fmtThbDecimal(price),
      status: 'verified',
    },
    {
      key: 'commissionRate',
      labelEn: 'Affiliate Commission Rate',
      labelMy: 'Affiliate ကော်မရှင်နှုန်း',
      valueEn: fmtPct(commissionPct),
      valueMy: fmtPct(commissionPct),
      status: 'verified',
    },
    {
      key: 'commissionPerSale',
      labelEn: 'Commission per Sale',
      labelMy: 'တစ်ခုရောင်းရလျှင် ရမည့်ဝင်ငွေ',
      valueEn: fmtThbDecimal(perSaleThb),
      valueMy: fmtThbDecimal(perSaleThb),
      status: 'verified',
    },
    {
      key: 'earn10',
      labelEn: '10 Sales Scenario',
      labelMy: '၁၀ ခု ရောင်းရလျှင်',
      valueEn: fmtThbDecimal(earn10),
      valueMy: fmtThbDecimal(earn10),
      status: 'estimated',
    },
    {
      key: 'earn50',
      labelEn: '50 Sales Scenario',
      labelMy: '၅၀ ခု ရောင်းရလျှင်',
      valueEn: fmtThbDecimal(earn50),
      valueMy: fmtThbDecimal(earn50),
      status: 'estimated',
    },
    {
      key: 'earn100',
      labelEn: '100 Sales Scenario',
      labelMy: '၁၀၀ ခု ရောင်းရလျှင်',
      valueEn: fmtThbDecimal(earn100),
      valueMy: fmtThbDecimal(earn100),
      status: 'estimated',
    },
  ];

  const sections: DeepDiveResultSection[] = [
    {
      id: 'earning-scenarios',
      titleEn: 'Volume Earning Projections (Formula: Price × Commission% × Units)',
      titleMy: 'ရောင်းအားအလိုက် ခန့်မှန်းဝင်ငွေ (တွက်ချက်မှု: ဈေးနှုန်း × ကော်မရှင်% × အရေအတွက်)',
      status: 'estimated',
      bulletsEn: [
        `10 units → ${fmtThbDecimal(earn10)} · 50 units → ${fmtThbDecimal(earn50)} · 100 units → ${fmtThbDecimal(earn100)} · 500 units → ${fmtThbDecimal(earn500)}`,
        ...(hasMinMax && minPerSale !== null && maxPerSale !== null
          ? [
              `SKU Price Range (${fmtThb(m!.minPriceThb)}–${fmtThb(m!.maxPriceThb)}) yields ${fmtThbDecimal(minPerSale)} to ${fmtThbDecimal(maxPerSale)} commission per unit.`,
            ]
          : []),
      ],
      bulletsMy: [
        `၁၀ ခု → ${fmtThbDecimal(earn10)} · ၅၀ ခု → ${fmtThbDecimal(earn50)} · ၁၀၀ ခု → ${fmtThbDecimal(earn100)} · ၅၀၀ ခု → ${fmtThbDecimal(earn500)}`,
        ...(hasMinMax && minPerSale !== null && maxPerSale !== null
          ? [
              `SKU ဈေးနှုန်းအပိုင်းအခြား (${fmtThb(m!.minPriceThb)}–${fmtThb(m!.maxPriceThb)}) အရ တစ်ခုလျှင် ${fmtThbDecimal(minPerSale)} မှ ${fmtThbDecimal(maxPerSale)} အထိ ရနိုင်သည်။`,
            ]
          : []),
      ],
    },
  ];

  return {
    analysisId: 'affiliate-profit-analysis',
    outcome: 'completed',
    dataStatus: 'verified',
    isAiInterpretation: false,
    headlineEn: `${fmtThbDecimal(perSaleThb)} / sale (${fmtPct(commissionPct)} on ${fmtThbDecimal(price)})`,
    headlineMy: `တစ်ခုလျှင် ${fmtThbDecimal(perSaleThb)} (${fmtThbDecimal(price)} ၏ ${fmtPct(commissionPct)})`,
    summaryEn: `At ${fmtThbDecimal(price)} and ${fmtPct(commissionPct)} commission, each verified sale earns ${fmtThbDecimal(perSaleThb)} (${fmtThbDecimal(earn100)} per 100 sales before platform vouchers/returns).`,
    summaryMy: `ဈေးနှုန်း ${fmtThbDecimal(price)} နှင့် ကော်မရှင် ${fmtPct(commissionPct)} အရ တစ်ခုရောင်းရလျှင် ${fmtThbDecimal(perSaleThb)} ရရှိမည် (၁၀၀ ခုရောင်းရလျှင် ${fmtThbDecimal(earn100)})။`,
    metrics,
    sections,
    unavailableNotesEn: [
      'Real-time TikTok Shop Flash Sale / Seller Voucher discount adjustments and return deductions are Unavailable in Kalodata API — verify live checkout price before promoting.',
    ],
    unavailableNotesMy: [
      'TikTok Shop Flash Sale / Voucher လျှော့ဈေးနှင့် Return နှုတ်ဖြတ်မှုများသည် Kalodata API တွင် မပါဝင်ပါ (Unavailable) — မကြော်ငြာမီ TikTok Shop တွင် တိုက်ရိုက်စစ်ဆေးပါ။',
    ],
    dataSourcesEn,
    dataSourcesMy,
    apiCallsMade: 0,
    creditsUsed: 0,
    reusedFromCache: true,
    completedAt,
  };
}

// ---------------------------------------------------------------------------
// 4. Creator Competition Analysis
// ---------------------------------------------------------------------------
async function executeCreatorCompetitionAnalysis(
  session: DeepDiveBatchSession,
  forceRefresh: boolean
): Promise<DeepDiveModuleResult> {
  const completedAt = session.deps.nowIsoFn();
  let apiCallsMade = 0;
  let creditsUsed = 0;
  let reusedFromCache = true;
  const dataSourcesEn = ['Existing Product Creator Metrics'];
  const dataSourcesMy = ['ရှိပြီးသား Product Creator Data'];

  if (
    moduleNeedsProductDetail('creator-competition-analysis', session.workingProduct) &&
    isValidKalodataId(session.workingProduct.kalodataMetrics?.productId)
  ) {
    const fetched = await ensureLayerOnSession(session, 'productDetail', forceRefresh);
    apiCallsMade = fetched.apiCallsMade;
    creditsUsed = fetched.creditsUsed;
    reusedFromCache = fetched.reusedFromCache;
    dataSourcesEn.push(fetched.sourceLabelEn);
    dataSourcesMy.push(fetched.sourceLabelMy);
  }

  const p = session.workingProduct;
  const m = p.kalodataMetrics;
  const creatorCount =
    typeof m?.creatorNumber === 'number' && Number.isFinite(m.creatorNumber) && m.creatorNumber >= 0
      ? m.creatorNumber
      : null;

  const unavailableNotesEn = [
    'Top Performing Creators list and individual Creator Sales Contribution share require a Creator Rank / Product Creators API, which is Unavailable / Not Verified in the current Kalodata integration.',
  ];
  const unavailableNotesMy = [
    'ထိပ်တန်း Creator စာရင်း (Top Performing Creators) နှင့် Creator တစ်ဦးချင်းစီ၏ ရောင်းအားဝေစုအတွက် Creator Rank / Product Creators API သည် လက်ရှိစနစ်တွင် မရရှိနိုင်သေးပါ (Unavailable / Not Verified)။',
  ];

  if (creatorCount === null) {
    return {
      analysisId: 'creator-competition-analysis',
      outcome: 'unavailable',
      dataStatus: 'unavailable',
      isAiInterpretation: false,
      headlineEn: 'Creator Competition Data Unavailable',
      headlineMy: 'Creator ပြိုင်ဆိုင်မှု Data မရရှိနိုင်ပါ',
      summaryEn: 'Active promoting creator count was not returned by Kalodata for this product, and Creator Rank API is Unavailable / Not Verified.',
      summaryMy: 'ဤ Product အတွက် Promote လုပ်နေသော Creator အရေအတွက် မရရှိနိုင်သေးသည့်အပြင် Creator Rank API လည်း မရရှိနိုင်သေးပါ (Unavailable)။',
      metrics: [],
      sections: [],
      unavailableNotesEn,
      unavailableNotesMy,
      dataSourcesEn,
      dataSourcesMy,
      apiCallsMade,
      creditsUsed,
      reusedFromCache,
      completedAt,
    };
  }

  const level = creatorCount <= 25 ? 'Low' : creatorCount <= 120 ? 'Moderate' : 'High';
  const entryEn =
    level === 'Low'
      ? 'Open entry window — relatively few affiliates are promoting this item.'
      : level === 'Moderate'
        ? 'Balanced competition — active affiliate interest with room for strong hooks.'
        : 'Crowded affiliate field — differentiation via strong creative hooks is required.';
  const entryMy =
    level === 'Low'
      ? 'ဝင်ရောက်ယှဉ်ပြိုင်ရန် အခွင့်အလမ်းကောင်း — Promote လုပ်နေသော Creator အရေအတွက် နည်းပါးသေးသည်။'
      : level === 'Moderate'
        ? 'ပြိုင်ဆိုင်မှု အသင့်အတင့် — Video Hook ကောင်းကောင်းဖြင့် ယှဉ်ပြိုင်နိုင်သည်။'
        : 'ပြိုင်ဆိုင်မှု ပြင်းထန် — ထူးခြားသော Video ပုံစံဖြင့်သာ ခွဲထွက်နိုင်မည်။';

  const metrics: DeepDiveMetricRow[] = [
    {
      key: 'creatorCount',
      labelEn: 'Promoting Creators',
      labelMy: 'Promote လုပ်နေသော Creator ဦးရေ',
      valueEn: `${fmtNum(creatorCount)} creators`,
      valueMy: `Creator ${fmtNum(creatorCount)} ဦး`,
      status: 'verified',
    },
    {
      key: 'competitionLevel',
      labelEn: 'Competition Level',
      labelMy: 'ပြိုင်ဆိုင်မှုအဆင့်',
      valueEn: level,
      valueMy: level === 'Low' ? 'နည်း (Low)' : level === 'Moderate' ? 'အသင့်အတင့် (Moderate)' : 'မြင့် (High)',
      status: 'verified',
    },
    {
      key: 'videoLiveActivity',
      labelEn: 'Competing Videos / Lives',
      labelMy: 'ပြိုင်ဘက် Video / Live အရေအတွက်',
      valueEn:
        m?.videoNumber !== null && m?.videoNumber !== undefined
          ? `${fmtNum(m.videoNumber)} videos · ${m.liveNumber !== null && m.liveNumber !== undefined ? `${fmtNum(m.liveNumber)} lives` : 'Live N/A'}`
          : 'Unavailable',
      valueMy:
        m?.videoNumber !== null && m?.videoNumber !== undefined
          ? `Video ${fmtNum(m.videoNumber)} ခု · ${m.liveNumber !== null && m.liveNumber !== undefined ? `Live ${fmtNum(m.liveNumber)} ကြိမ်` : 'Live N/A'}`
          : 'မရရှိနိုင်ပါ',
      status: m?.videoNumber !== null && m?.videoNumber !== undefined ? 'verified' : 'unavailable',
    },
    {
      key: 'topCreators',
      labelEn: 'Top Creators & Sales Share',
      labelMy: 'ထိပ်တန်း Creator များနှင့် ရောင်းအားဝေစု',
      valueEn: 'Unavailable / Not Verified',
      valueMy: 'မရရှိနိုင်ပါ (API Not Verified)',
      status: 'unavailable',
    },
  ];

  return {
    analysisId: 'creator-competition-analysis',
    outcome: 'completed',
    dataStatus: 'verified',
    isAiInterpretation: false,
    headlineEn: `${fmtNum(creatorCount)} Active Creators · ${level} Competition`,
    headlineMy: `Creator ${fmtNum(creatorCount)} ဦး · ပြိုင်ဆိုင်မှု (${level})`,
    summaryEn: entryEn,
    summaryMy: entryMy,
    metrics,
    sections: [],
    unavailableNotesEn,
    unavailableNotesMy,
    dataSourcesEn,
    dataSourcesMy,
    apiCallsMade,
    creditsUsed,
    reusedFromCache,
    completedAt,
  };
}

// ---------------------------------------------------------------------------
// 5. Video Intelligence
// ---------------------------------------------------------------------------
async function executeVideoIntelligence(
  session: DeepDiveBatchSession,
  forceRefresh: boolean
): Promise<DeepDiveModuleResult> {
  const completedAt = session.deps.nowIsoFn();
  let apiCallsMade = 0;
  let creditsUsed = 0;
  let reusedFromCache = true;
  const dataSourcesEn: string[] = [];
  const dataSourcesMy: string[] = [];

  if (
    moduleNeedsProductDetail('video-intelligence', session.workingProduct) &&
    isValidKalodataId(session.workingProduct.kalodataMetrics?.productId)
  ) {
    const fetched = await ensureLayerOnSession(session, 'productDetail', forceRefresh);
    apiCallsMade = fetched.apiCallsMade;
    creditsUsed = fetched.creditsUsed;
    reusedFromCache = fetched.reusedFromCache;
    dataSourcesEn.push(fetched.sourceLabelEn);
    dataSourcesMy.push(fetched.sourceLabelMy);
  }

  const p = session.workingProduct;
  const m = p.kalodataMetrics;
  const matchedVideos = p.myanmarLanguage?.matchedVideos ?? [];
  const videoCount = typeof m?.videoNumber === 'number' ? m.videoNumber : null;
  const videoRev = typeof m?.videoRevenueThb === 'number' ? m.videoRevenueThb : null;
  const liveCount = typeof m?.liveNumber === 'number' ? m.liveNumber : null;
  const liveRev = typeof m?.liveRevenueThb === 'number' ? m.liveRevenueThb : null;
  const totalRev = typeof m?.revenueThb === 'number' && m.revenueThb > 0 ? m.revenueThb : null;
  const videoSharePct =
    totalRev && videoRev !== null ? Math.round((videoRev / totalRev) * 1000) / 10 : null;

  if (matchedVideos.length > 0) {
    dataSourcesEn.push('Verified Matched Myanmar Video Discovery Signals');
    dataSourcesMy.push('အတည်ပြုပြီး မြန်မာ Video Discovery Data');
  }
  if (videoCount !== null || videoRev !== null) {
    dataSourcesEn.push('Kalodata Product Video Channel Metrics');
    dataSourcesMy.push('Kalodata Product Video Channel Data');
  }
  if (dataSourcesEn.length === 0) {
    dataSourcesEn.push('Existing Product Record');
    dataSourcesMy.push('ရှိပြီးသား Product Record');
  }

  const unavailableNotesEn = [
    'Product-scoped Linked Affiliate Video List, Top Performing Videos ranking, and full Engagement Rate (Likes/Comments/Shares) API is Unavailable / Not Verified — Kalodata video/rank does not expose a verified product_id filter, so no broad category video scan was wasted.',
  ];
  const unavailableNotesMy = [
    'Product တစ်ခုချင်းစီနှင့် ချိတ်ဆက်ထားသော Affiliate Video စာရင်းအပြည့်အစုံနှင့် Engagement Rate (Likes/Comments/Shares) API သည် မရရှိနိုင်သေးပါ (Unavailable / Not Verified) — Credit မလိုအပ်ဘဲ မကုန်စေရန် broad video/rank ကို မခေါ်ထားပါ။',
  ];

  const hasAnyVideoData =
    matchedVideos.length > 0 || videoCount !== null || videoRev !== null;

  if (!hasAnyVideoData) {
    return {
      analysisId: 'video-intelligence',
      outcome: 'unavailable',
      dataStatus: 'unavailable',
      isAiInterpretation: false,
      headlineEn: 'Video Intelligence Data Unavailable',
      headlineMy: 'Affiliate Video Data မရရှိနိုင်ပါ',
      summaryEn: 'No verified video count, video GMV, or matched affiliate videos exist on this product, and a product-scoped Video List API is Unavailable / Not Verified.',
      summaryMy: 'ဤ Product တွင် အတည်ပြုပြီး Video အရေအတွက်၊ Video GMV သို့မဟုတ် ချိတ်ဆက် Video မတွေ့ရှိရဘဲ Product-specific Video List API လည်း မရရှိနိုင်သေးပါ။',
      metrics: [],
      sections: [],
      unavailableNotesEn,
      unavailableNotesMy,
      dataSourcesEn,
      dataSourcesMy,
      apiCallsMade,
      creditsUsed,
      reusedFromCache,
      completedAt,
    };
  }

  const videoItems: DeepDiveVideoItem[] = matchedVideos.slice(0, 8).map((v) => ({
    videoId: v.videoId,
    captionSnippet: v.captionSnippet,
    creatorName: v.creatorName ?? null,
    creatorHandle: v.creatorHandle ?? null,
    videoUrl: v.videoUrl ?? null,
    revenueThb: v.videoRevenueThb ?? null,
    salesVolume: v.videoSalesVolume ?? null,
    views: v.videoViews ?? null,
    publishDate: v.publishDate ?? null,
    isMyanmarMatch: true,
    matchType: v.matchType,
  }));

  const metrics: DeepDiveMetricRow[] = [
    {
      key: 'videoCount',
      labelEn: 'Shoppable Videos (Product)',
      labelMy: 'Product ချိတ်ဆက် Video အရေအတွက်',
      valueEn: videoCount !== null ? `${fmtNum(videoCount)} videos` : 'Unavailable',
      valueMy: videoCount !== null ? `Video ${fmtNum(videoCount)} ခု` : 'မရရှိနိုင်ပါ',
      status: videoCount !== null ? 'verified' : 'unavailable',
    },
    {
      key: 'videoRevenue',
      labelEn: 'Video Channel GMV',
      labelMy: 'Video မှ ရောင်းရငွေ',
      valueEn:
        videoRev !== null
          ? `${fmtThb(videoRev)}${videoSharePct !== null ? ` (${videoSharePct}% share)` : ''}`
          : 'Unavailable',
      valueMy:
        videoRev !== null
          ? `${fmtThb(videoRev)}${videoSharePct !== null ? ` (${videoSharePct}%)` : ''}`
          : 'မရရှိနိုင်ပါ',
      status: videoRev !== null ? 'verified' : 'unavailable',
    },
    {
      key: 'liveActivity',
      labelEn: 'Livestream Count / GMV',
      labelMy: 'Live အရေအတွက် / ဝင်ငွေ',
      valueEn:
        liveCount !== null || liveRev !== null
          ? `${liveCount !== null ? `${fmtNum(liveCount)} lives` : 'Count N/A'} · ${liveRev !== null ? fmtThb(liveRev) : 'GMV N/A'}`
          : 'Unavailable',
      valueMy:
        liveCount !== null || liveRev !== null
          ? `${liveCount !== null ? `Live ${fmtNum(liveCount)} ကြိမ်` : 'အရေအတွက် N/A'} · ${liveRev !== null ? fmtThb(liveRev) : 'GMV N/A'}`
          : 'မရရှိနိုင်ပါ',
      status: liveCount !== null || liveRev !== null ? 'verified' : 'unavailable',
    },
    {
      key: 'myanmarVideos',
      labelEn: 'Verified Myanmar-Language Videos',
      labelMy: 'အတည်ပြုပြီး မြန်မာ Video များ',
      valueEn:
        videoItems.length > 0
          ? `${videoItems.length} matched video(s)`
          : 'None captured in current record',
      valueMy:
        videoItems.length > 0
          ? `မြန်မာ Video ${videoItems.length} ခု တွေ့ရှိ`
          : 'လက်ရှိ Record တွင် မတွေ့ရှိပါ',
      status: videoItems.length > 0 ? 'verified' : 'unverified',
    },
  ];

  return {
    analysisId: 'video-intelligence',
    outcome: 'completed',
    dataStatus: 'verified',
    isAiInterpretation: false,
    headlineEn:
      videoItems.length > 0
        ? `${videoItems.length} Matched Myanmar Video(s) · Video GMV ${fmtThb(videoRev)}`
        : `Video Channel GMV ${fmtThb(videoRev)}${videoCount !== null ? ` across ${fmtNum(videoCount)} videos` : ''}`,
    headlineMy:
      videoItems.length > 0
        ? `မြန်မာ Video ${videoItems.length} ခု တွေ့ရှိ · Video GMV ${fmtThb(videoRev)}`
        : `Video မှ ရောင်းရငွေ ${fmtThb(videoRev)}${videoCount !== null ? ` (Video ${fmtNum(videoCount)} ခု)` : ''}`,
    summaryEn: `${videoSharePct !== null ? `Short videos contribute ${videoSharePct}% of verified GMV. ` : ''}${videoItems.length > 0 ? `${videoItems.length} verified Myanmar-language affiliate video(s) are linked to this product.` : 'No Myanmar-language video evidence was captured in this product record.'}`,
    summaryMy: `${videoSharePct !== null ? `Short Video များမှ စုစုပေါင်း GMV ၏ ${videoSharePct}% ရရှိပါသည်။ ` : ''}${videoItems.length > 0 ? `ဤ Product နှင့် ချိတ်ဆက်ထားသော မြန်မာ Video ${videoItems.length} ခု အတည်ပြုတွေ့ရှိထားပါသည်။` : 'လက်ရှိ Record တွင် မြန်မာ Video အထောက်အထား မပါဝင်ပါ။'}`,
    metrics,
    sections: [],
    videoItems: videoItems.length > 0 ? videoItems : undefined,
    unavailableNotesEn,
    unavailableNotesMy,
    dataSourcesEn,
    dataSourcesMy,
    apiCallsMade,
    creditsUsed,
    reusedFromCache,
    completedAt,
  };
}

// ---------------------------------------------------------------------------
// 6. Customer Review Intelligence (STRICTLY OPT-IN — 1.0 cr only if uncached)
// ---------------------------------------------------------------------------
async function executeCustomerReviewIntelligence(
  session: DeepDiveBatchSession,
  forceRefresh: boolean
): Promise<DeepDiveModuleResult> {
  const completedAt = session.deps.nowIsoFn();

  const fetched = await ensureLayerOnSession(session, 'reviewInsights', forceRefresh);
  const p = session.workingProduct;
  const ri = p.kalodataMetrics?.reviewInsight ?? null;

  const dataSourcesEn = [fetched.sourceLabelEn];
  const dataSourcesMy = [fetched.sourceLabelMy];

  const hasContent = Boolean(
    ri &&
      (ri.summary ||
        ri.positivePoints.length > 0 ||
        ri.painPoints.length > 0 ||
        ri.commentsAnalyzed > 0 ||
        (ri.rawComments && ri.rawComments.length > 0))
  );

  if (!ri || !hasContent) {
    return {
      analysisId: 'customer-review-intelligence',
      outcome: 'unavailable',
      dataStatus: 'unavailable',
      isAiInterpretation: false,
      headlineEn: 'Customer Reviews Unavailable',
      headlineMy: 'ဝယ်သူ Review Data မရရှိနိုင်ပါ (Unavailable)',
      summaryEn:
        'Kalodata Comment Insight returned no verifiable customer review comments for this product. No reviews were invented.',
      summaryMy:
        'ဤ Product အတွက် Kalodata Comment Insight မှ ဝယ်သူ Review မှတ်ချက်များ မရရှိနိုင်ပါ။ Review အတုအယောင်များ မဖန်တီးထားပါ။',
      metrics: [],
      sections: [],
      unavailableNotesEn: [
        'Customer review insights are Unavailable for this listing — inspect live buyer reviews directly on TikTok Shop Thailand.',
      ],
      unavailableNotesMy: [
        'ဤ Product အတွက် Customer Review Insights မရရှိနိုင်ပါ — TikTok Shop Thailand တွင် တိုက်ရိုက်စစ်ဆေးပါ။',
      ],
      dataSourcesEn,
      dataSourcesMy,
      apiCallsMade: fetched.apiCallsMade,
      creditsUsed: fetched.creditsUsed,
      reusedFromCache: fetched.reusedFromCache,
      completedAt,
    };
  }

  // Deterministic Myanmar-language check on the working copy's real comments
  const myanmarReview = detectMyanmarLanguageForProduct(p);

  const metrics: DeepDiveMetricRow[] = [
    {
      key: 'commentsAnalyzed',
      labelEn: 'Reviews Analyzed',
      labelMy: 'စစ်ဆေးပြီး Review အရေအတွက်',
      valueEn: `${fmtNum(ri.commentsAnalyzed)} comments`,
      valueMy: `မှတ်ချက် ${fmtNum(ri.commentsAnalyzed)} ခု`,
      status: 'verified',
    },
    {
      key: 'sampleRating',
      labelEn: 'Sample Average Rating',
      labelMy: 'နမူနာပျမ်းမျှ Rating',
      valueEn:
        ri.averageRating !== null
          ? `${ri.averageRating}/5 (${fmtNum(ri.ratedCommentCount)} rated)`
          : 'Unavailable',
      valueMy:
        ri.averageRating !== null
          ? `${ri.averageRating}/5 (Rating ပါ ${fmtNum(ri.ratedCommentCount)} ခု)`
          : 'မရရှိနိုင်ပါ',
      status: ri.averageRating !== null ? 'verified' : 'unavailable',
    },
    {
      key: 'myanmarReviews',
      labelEn: 'Myanmar-Language Reviews',
      labelMy: 'မြန်မာဘာသာ Review ပါဝင်မှု',
      valueEn:
        myanmarReview.matchedReviewCount > 0
          ? `${myanmarReview.matchedReviewCount} matched (of ${myanmarReview.totalReviewsChecked} checked)`
          : myanmarReview.totalReviewsChecked > 0
            ? `0 matched (of ${myanmarReview.totalReviewsChecked} checked)`
            : 'Raw comment text unavailable',
      valueMy:
        myanmarReview.matchedReviewCount > 0
          ? `မြန်မာ Review ${myanmarReview.matchedReviewCount} ခု တွေ့ရှိ (စစ်ခဲ့သည့် ${myanmarReview.totalReviewsChecked} ခုထဲမှ)`
          : myanmarReview.totalReviewsChecked > 0
            ? `မြန်မာ Review 0 ခု (စစ်ခဲ့သည့် ${myanmarReview.totalReviewsChecked} ခုထဲမှ)`
            : 'Raw Review စာသား မရရှိနိုင်ပါ',
      status: myanmarReview.totalReviewsChecked > 0 ? 'verified' : 'unavailable',
    },
  ];

  const sections: DeepDiveResultSection[] = [];
  if (ri.positivePoints.length > 0) {
    sections.push({
      id: 'buyer-likes',
      titleEn: 'What Customers Like (Verified)',
      titleMy: 'ဝယ်သူများ ကြိုက်နှစ်သက်သည့်အချက်များ',
      status: 'verified',
      bulletsEn: ri.positivePoints.slice(0, 5).map((pt) => `${pt.point} (${pt.mentions} mentions)`),
      bulletsMy: ri.positivePoints.slice(0, 5).map((pt) => `${pt.point} (ဖော်ပြချက် ${pt.mentions} ခု)`),
    });
  }
  if (ri.painPoints.length > 0) {
    sections.push({
      id: 'buyer-dislikes',
      titleEn: 'Customer Dislikes & Complaints (Verified)',
      titleMy: 'ဝယ်သူများ မကြိုက်သည့်အချက် / Complaint များ',
      status: 'verified',
      bulletsEn: ri.painPoints.slice(0, 5).map((pt) => `${pt.point} (${pt.mentions} mentions)`),
      bulletsMy: ri.painPoints.slice(0, 5).map((pt) => `${pt.point} (ဖော်ပြချက် ${pt.mentions} ခု)`),
    });
  }
  if (myanmarReview.matchedReviews.length > 0) {
    sections.push({
      id: 'myanmar-review-samples',
      titleEn: 'Verified Myanmar-Language Review Snippets',
      titleMy: 'အတည်ပြုပြီး မြန်မာဘာသာ Review နမူနာများ',
      status: 'verified',
      bulletsEn: myanmarReview.matchedReviews.slice(0, 4).map((r) => `“${r.snippet}”`),
      bulletsMy: myanmarReview.matchedReviews.slice(0, 4).map((r) => `“${r.snippet}”`),
    });
  }

  return {
    analysisId: 'customer-review-intelligence',
    outcome: 'completed',
    dataStatus: 'verified',
    isAiInterpretation: false,
    headlineEn: `${fmtNum(ri.commentsAnalyzed)} Reviews Analyzed · ${ri.positivePoints.length} Positive / ${ri.painPoints.length} Complaint Themes`,
    headlineMy: `Review ${fmtNum(ri.commentsAnalyzed)} ခု စစ်ဆေးပြီး · အားသာချက် ${ri.positivePoints.length} ခု / Complaint ${ri.painPoints.length} ခု`,
    summaryEn:
      ri.summary ??
      `Extracted ${ri.positivePoints.length} buyer praise theme(s) and ${ri.painPoints.length} complaint theme(s) directly from Kalodata TH reviews.`,
    summaryMy:
      ri.summary ??
      `Kalodata TH ဝယ်သူ Review များမှ အားသာချက် ${ri.positivePoints.length} ခုနှင့် Complaint ${ri.painPoints.length} ခုကို တိုက်ရိုက်ထုတ်ယူထားပါသည်။`,
    metrics,
    sections,
    unavailableNotesEn:
      ri.averageRating === null
        ? ['Star ratings were not included on sampled review items.']
        : [],
    unavailableNotesMy:
      ri.averageRating === null
        ? ['နမူနာ Review များတွင် Star Rating အချက်အလက် မပါဝင်ပါ။']
        : [],
    dataSourcesEn,
    dataSourcesMy,
    apiCallsMade: fetched.apiCallsMade,
    creditsUsed: fetched.creditsUsed,
    reusedFromCache: fetched.reusedFromCache,
    completedAt,
  };
}

// ---------------------------------------------------------------------------
// 7. Market & Competitor Comparison (Strictly Local — 0 Credits, 0 API Calls)
// ---------------------------------------------------------------------------
function executeMarketCompetitorComparison(
  session: DeepDiveBatchSession,
  peerProducts: readonly ResearchProduct[]
): DeepDiveModuleResult {
  const completedAt = session.deps.nowIsoFn();
  const target = session.workingProduct;
  const targetCanonicalId = getCanonicalProductId(target);
  const dataSourcesEn = ['Current Research Results Session Peers (0 cr)'];
  const dataSourcesMy = ['လက်ရှိ Research Results ရှိ Category တူ Product များ (0 cr)'];

  // Deduplicate same-category peers strictly excluding target itself
  const seen = new Set<string>([targetCanonicalId]);
  const sameCategoryPeers: ResearchProduct[] = [];
  for (const candidate of peerProducts) {
    if (!candidate || candidate.category !== target.category) continue;
    const cid = getCanonicalProductId(candidate);
    if (seen.has(cid)) continue;
    seen.add(cid);
    sameCategoryPeers.push(candidate);
  }

  if (sameCategoryPeers.length === 0) {
    return {
      analysisId: 'market-competitor-comparison',
      outcome: 'unavailable',
      dataStatus: 'unavailable',
      isAiInterpretation: false,
      headlineEn: 'No Comparable Same-Category Peers in Current Session',
      headlineMy: 'နှိုင်းယှဉ်ရန် Category တူ Product မရှိပါ',
      summaryEn:
        'No other products from the same category are available in the current Research Results session. No extra Kalodata API calls were made.',
      summaryMy:
        'လက်ရှိ Research Results ထဲတွင် Category တူ အခြား Product မရှိသေးပါ။ ထပ်မံ API မခေါ်ထားပါ (0 cr)။',
      metrics: [],
      sections: [],
      unavailableNotesEn: [
        'Run a multi-product search in the same category to benchmark this listing against session peers at 0 extra credits.',
      ],
      unavailableNotesMy: [
        'Category တူ Product အများအပြား ရှာဖွေထားပါက Credit ထပ်မကုန်ဘဲ နှိုင်းယှဉ်စစ်ဆေးနိုင်ပါသည်။',
      ],
      dataSourcesEn,
      dataSourcesMy,
      apiCallsMade: 0,
      creditsUsed: 0,
      reusedFromCache: true,
      completedAt,
    };
  }

  const cohort = [target, ...sameCategoryPeers];
  const evaluations = evaluateProductBatch(cohort, {
    salesWeightPct: session.salesWeightPct,
  });

  const avg = (nums: number[]): number | null =>
    nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : null;

  const peerPrices = sameCategoryPeers
    .map((p) => p.priceThb)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
  const peerSales = sameCategoryPeers
    .map((p) => p.kalodataMetrics?.salesVolume ?? null)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const peerRevs = sameCategoryPeers
    .map((p) => p.kalodataMetrics?.revenueThb ?? null)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const peerComms = sameCategoryPeers
    .map((p) => (p.commissionVerified ? p.commissionRate : null))
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);

  const avgPeerPrice = avg(peerPrices);
  const avgPeerSales = avg(peerSales);
  const avgPeerRev = avg(peerRevs);
  const avgPeerComm = avg(peerComms);

  const rankedCohort = cohort
    .map((p) => ({
      product: p,
      canonicalProductId: getCanonicalProductId(p),
      score: evaluations.get(p.id)?.totalScore ?? p.opportunityScore,
    }))
    .sort((a, b) => b.score - a.score);

  const targetRankIndex = rankedCohort.findIndex(
    (entry) => entry.canonicalProductId === targetCanonicalId
  );
  const targetRank = targetRankIndex >= 0 ? targetRankIndex + 1 : rankedCohort.length;
  const targetScore = rankedCohort[targetRankIndex]?.score ?? target.opportunityScore;

  // Build top 5 rows (always ensuring target product is included)
  const topEntries = rankedCohort.slice(0, 5);
  if (!topEntries.some((e) => e.canonicalProductId === targetCanonicalId) && targetRankIndex >= 0) {
    topEntries[topEntries.length - 1] = rankedCohort[targetRankIndex];
  }

  const competitorRows: DeepDiveCompetitorComparisonRow[] = topEntries.map((entry) => {
    const rankPos =
      rankedCohort.findIndex((r) => r.canonicalProductId === entry.canonicalProductId) + 1;
    return {
      canonicalProductId: entry.canonicalProductId,
      name: entry.product.name,
      nameMy: entry.product.nameMy,
      isTarget: entry.canonicalProductId === targetCanonicalId,
      priceThb: entry.product.priceThb,
      salesVolume: entry.product.kalodataMetrics?.salesVolume ?? null,
      revenueThb: entry.product.kalodataMetrics?.revenueThb ?? null,
      commissionRatePct: entry.product.commissionVerified
        ? entry.product.commissionRate
        : null,
      score: entry.score,
      rankPosition: rankPos,
    };
  });

  const metrics: DeepDiveMetricRow[] = [
    {
      key: 'peerRank',
      labelEn: 'Session Category Rank',
      labelMy: 'Category တူ အဆင့်',
      valueEn: `#${targetRank} of ${rankedCohort.length} (${targetScore}/100)`,
      valueMy: `${rankedCohort.length} ခုထဲမှ အဆင့် #${targetRank} (${targetScore}/100)`,
      status: 'verified',
    },
    {
      key: 'priceVsPeers',
      labelEn: 'Price vs Peer Avg',
      labelMy: 'ဈေးနှုန်း (ပြိုင်ဘက်ပျမ်းမျှနှင့်)',
      valueEn:
        target.priceThb !== null && avgPeerPrice !== null
          ? `${fmtThb(target.priceThb)} vs ${fmtThb(avgPeerPrice)}`
          : 'Unavailable',
      valueMy:
        target.priceThb !== null && avgPeerPrice !== null
          ? `${fmtThb(target.priceThb)} နှင့် ပျမ်းမျှ ${fmtThb(avgPeerPrice)}`
          : 'မရရှိနိုင်ပါ',
      status: target.priceThb !== null && avgPeerPrice !== null ? 'verified' : 'unavailable',
    },
    {
      key: 'salesVsPeers',
      labelEn: 'Sales vs Peer Avg',
      labelMy: 'ရောင်းအား (ပြိုင်ဘက်ပျမ်းမျှနှင့်)',
      valueEn:
        target.kalodataMetrics?.salesVolume !== null &&
        target.kalodataMetrics?.salesVolume !== undefined &&
        avgPeerSales !== null
          ? `${fmtNum(target.kalodataMetrics.salesVolume)} vs ${fmtNum(avgPeerSales)}`
          : 'Unavailable',
      valueMy:
        target.kalodataMetrics?.salesVolume !== null &&
        target.kalodataMetrics?.salesVolume !== undefined &&
        avgPeerSales !== null
          ? `${fmtNum(target.kalodataMetrics.salesVolume)} နှင့် ပျမ်းမျှ ${fmtNum(avgPeerSales)}`
          : 'မရရှိနိုင်ပါ',
      status:
        target.kalodataMetrics?.salesVolume !== null &&
        target.kalodataMetrics?.salesVolume !== undefined &&
        avgPeerSales !== null
          ? 'verified'
          : 'unavailable',
    },
    {
      key: 'commVsPeers',
      labelEn: 'Commission vs Peer Avg',
      labelMy: 'ကော်မရှင် (ပြိုင်ဘက်ပျမ်းမျှနှင့်)',
      valueEn:
        target.commissionVerified && target.commissionRate !== null && avgPeerComm !== null
          ? `${fmtPct(target.commissionRate)} vs ${fmtPct(avgPeerComm)}`
          : 'Unavailable',
      valueMy:
        target.commissionVerified && target.commissionRate !== null && avgPeerComm !== null
          ? `${fmtPct(target.commissionRate)} နှင့် ပျမ်းမျှ ${fmtPct(avgPeerComm)}`
          : 'မရရှိနိုင်ပါ',
      status:
        target.commissionVerified && target.commissionRate !== null && avgPeerComm !== null
          ? 'verified'
          : 'unavailable',
    },
  ];

  const topPeer = rankedCohort[0];
  const isLeader = topPeer?.canonicalProductId === targetCanonicalId;

  return {
    analysisId: 'market-competitor-comparison',
    outcome: 'completed',
    dataStatus: 'verified',
    isAiInterpretation: false,
    headlineEn: `Ranked #${targetRank} of ${rankedCohort.length} Same-Category Products`,
    headlineMy: `Category တူ ${rankedCohort.length} ခုထဲမှ အဆင့် #${targetRank}`,
    summaryEn: isLeader
      ? `This product leads ${sameCategoryPeers.length} same-category peer(s) in your current Research Results (${targetScore}/100).${avgPeerRev !== null ? ` Peer average GMV is ${fmtThb(avgPeerRev)}.` : ''}`
      : `Compared against ${sameCategoryPeers.length} same-category peer(s). Top-ranked peer is "${topPeer.product.name}" (${topPeer.score}/100 vs your ${targetScore}/100).`,
    summaryMy: isLeader
      ? `လက်ရှိ Research Results ရှိ Category တူ ပြိုင်ဘက် ${sameCategoryPeers.length} ခုထဲတွင် အမှတ်အမြင့်ဆုံး (${targetScore}/100) ဖြစ်ပါသည်။`
      : `Category တူ ပြိုင်ဘက် ${sameCategoryPeers.length} ခုနှင့် နှိုင်းယှဉ်ထားပါသည်။ ထိပ်ဆုံးပြိုင်ဘက်မှာ “${topPeer.product.nameMy}” (${topPeer.score}/100) ဖြစ်ပြီး ဤ Product မှာ ${targetScore}/100 ရရှိထားပါသည်။`,
    metrics,
    sections: [],
    competitorRows,
    unavailableNotesEn: [
      'Comparison is scoped strictly to already-fetched same-category products in your current session (0 extra Kalodata credits).',
    ],
    unavailableNotesMy: [
      'လက်ရှိ Session ထဲရှိ ရှာဖွေပြီးသား Category တူ Product များဖြင့်သာ နှိုင်းယှဉ်ထားပါသည် (Credit ထပ်မကုန်ပါ)။',
    ],
    dataSourcesEn,
    dataSourcesMy,
    apiCallsMade: 0,
    creditsUsed: 0,
    reusedFromCache: true,
    completedAt,
  };
}

// ---------------------------------------------------------------------------
// 8. AI Strategic Recommendation (0 Kalodata Credits · Server-side Gemini AI)
// ---------------------------------------------------------------------------
async function executeAiStrategicRecommendation(
  session: DeepDiveBatchSession,
  completedModules: DeepDiveCompletedModuleDigest[]
): Promise<DeepDiveModuleResult> {
  const completedAt = session.deps.nowIsoFn();
  const res = await session.deps.runAiStrategyFn({
    product: session.workingProduct,
    completedModules,
    salesWeightPct: session.salesWeightPct,
    requireExplicitConfirmation: session.requireExplicitConfirmation,
    userConfirmedPaidExecution: session.userConfirmedPaidExecution,
  });

  if (!res.ok || !res.strategy) {
    throw new ModuleExecutionError(
      res.code ?? 'AI_STRATEGY_FAILED',
      res.error ?? 'Gemini AI Strategic Recommendation failed.',
      res.errorMy ?? 'Gemini AI ဗျူဟာအကြံပြုချက် ခေါ်ဆိုမှု မအောင်မြင်ပါ။'
    );
  }

  const s = res.strategy;
  const verdictLabels: Record<AiRecommendationVerdict, { en: string; my: string }> = {
    'priority-test': { en: 'Go — Priority Test', my: 'လုပ်သင့်သည် (Priority Test)' },
    'test-with-caution': { en: 'Test with Caution', my: 'သတိထားစမ်းသပ်သင့်သည်' },
    monitor: { en: 'Monitor First', my: 'စောင့်ကြည့်သင့်သည် (Monitor)' },
    skip: { en: 'No-Go — Skip', my: 'မလုပ်သင့်ပါ (Skip)' },
  };
  const vLabel = verdictLabels[s.verdict] ?? verdictLabels.monitor;

  const metrics: DeepDiveMetricRow[] = [
    {
      key: 'verdict',
      labelEn: 'AI Go / No-Go Verdict',
      labelMy: 'AI ဆုံးဖြတ်ချက်အကြံပြုချက်',
      valueEn: vLabel.en,
      valueMy: vLabel.my,
      status: 'estimated',
    },
    {
      key: 'targetAudience',
      labelEn: 'Target Audience (AI Inference)',
      labelMy: 'ပစ်မှတ်ဝယ်သူအုပ်စု (AI ခန့်မှန်းချက်)',
      valueEn: s.targetAudienceEn,
      valueMy: s.targetAudienceMy,
      status: 'estimated',
    },
    {
      key: 'modulesSynthesized',
      labelEn: 'Deep Dive Modules Synthesized',
      labelMy: 'ပေါင်းစပ်စစ်ဆေးခဲ့သည့် Module များ',
      valueEn:
        s.modulesSynthesized.length > 0
          ? `${s.modulesSynthesized.length} module(s)`
          : 'Base Product Data only',
      valueMy:
        s.modulesSynthesized.length > 0
          ? `Module ${s.modulesSynthesized.length} ခု + Product Data`
          : 'Product Data အခြေခံသာ',
      status: 'verified',
    },
  ];

  const sections: DeepDiveResultSection[] = [
    {
      id: 'ai-strengths-weaknesses',
      titleEn: 'Strengths & Weaknesses (AI Synthesis)',
      titleMy: 'အားသာချက်နှင့် အားနည်းချက်များ (AI ပေါင်းစပ်ချက်)',
      status: 'estimated',
      bulletsEn: [
        ...s.strengthsEn.map((x) => `Strength: ${x}`),
        ...s.weaknessesEn.map((x) => `Weakness: ${x}`),
      ],
      bulletsMy: [
        ...s.strengthsMy.map((x) => `အားသာချက်: ${x}`),
        ...s.weaknessesMy.map((x) => `အားနည်းချက်: ${x}`),
      ],
    },
    {
      id: 'ai-strategy-gonogo',
      titleEn: 'Affiliate Strategy & Go / No-Go Rationale',
      titleMy: 'Affiliate ဗျူဟာနှင့် လုပ်သင့်/မလုပ်သင့် အကြောင်းပြချက်',
      status: 'estimated',
      bulletsEn: [s.affiliateStrategyEn, s.goNoGoReasonEn],
      bulletsMy: [s.affiliateStrategyMy, s.goNoGoReasonMy],
    },
    {
      id: 'ai-video-ideas',
      titleEn: 'Video Content Ideas (AI Creative)',
      titleMy: 'Video ဖန်တီးရန် အကြံဉာဏ်များ',
      status: 'estimated',
      bulletsEn: s.videoIdeasEn,
      bulletsMy: s.videoIdeasMy,
    },
    {
      id: 'ai-risks',
      titleEn: 'Potential Risks to Watch',
      titleMy: 'သတိပြုရမည့် အန္တရာယ်များ',
      status: 'estimated',
      bulletsEn: s.risksEn,
      bulletsMy: s.risksMy,
    },
  ];

  return {
    analysisId: 'ai-strategic-recommendation',
    outcome: 'completed',
    dataStatus: 'estimated',
    isAiInterpretation: true,
    headlineEn: s.headlineEn,
    headlineMy: s.headlineMy,
    summaryEn: s.summaryEn,
    summaryMy: s.summaryMy,
    metrics,
    sections,
    unavailableNotesEn: s.dataLimitationsEn,
    unavailableNotesMy: s.dataLimitationsMy,
    dataSourcesEn: [
      `Gemini AI Interpretation (${s.modelUsed} · 1 Gemini API call · separate AI billing)`,
      'Verified Product Data + Completed Deep Dive Modules (0 Kalodata cr)',
    ],
    dataSourcesMy: [
      `Gemini AI Interpretation (${s.modelUsed} · Gemini API ၁ ကြိမ် · AI API စရိတ် သီးခြားရှိသည်)`,
      'အတည်ပြုပြီး Product Data + Deep Dive ရလဒ်များ (0 Kalodata cr)',
    ],
    apiCallsMade: 0,
    aiApiCallsMade: 1,
    creditsUsed: 0,
    reusedFromCache: false,
    completedAt: s.generatedAt || completedAt,
    aiMeta: {
      modelUsed: s.modelUsed,
      source: 'gemini',
      verdict: s.verdict,
      modulesSynthesized: s.modulesSynthesized,
      tokenUsage: s.tokenUsage ?? null,
    },
  };
}

export interface RunDeepDiveModulesParams {
  product: ResearchProduct;
  analysisIds: readonly DeepDiveAnalysisId[];
  peerProducts?: readonly ResearchProduct[];
  existingSlots?: Partial<Record<DeepDiveAnalysisId, DeepDiveAnalysisSlotState>>;
  runId?: string;
  spendingLimitCredits?: number;
  sessionCreditsAlreadySpent?: number;
  liveBalanceCredits?: number | null;
  requireExplicitConfirmation?: boolean;
  userConfirmedPaidExecution?: boolean;
  salesWeightPct?: number;
  forceRefresh?: boolean;
  onSlotUpdate?: (analysisId: DeepDiveAnalysisId, nextSlot: DeepDiveAnalysisSlotState) => void;
  deps?: DeepDiveExecutionDependencies;
}

export interface RunDeepDiveModulesOutcome {
  slots: Partial<Record<DeepDiveAnalysisId, DeepDiveAnalysisSlotState>>;
  totalKalodataApiCalls: number;
  totalCreditsUsed: number;
  completedIds: DeepDiveAnalysisId[];
  unavailableIds: DeepDiveAnalysisId[];
  failedIds: DeepDiveAnalysisId[];
  blockedReason?: 'CONFIRMATION_REQUIRED' | 'SPENDING_LIMIT_EXCEEDED' | null;
  runSummary?: DeepDiveRunCostSummary | null;
  budgetSnapshot?: DeepDiveServerBudgetSnapshot | null;
}

function toSlotStateFromResult(result: DeepDiveModuleResult): DeepDiveAnalysisSlotState {
  if (result.outcome === 'unavailable') {
    return {
      analysisId: result.analysisId,
      status: 'unavailable',
      updatedAt: result.completedAt,
      result,
      error: null,
      statusNoteEn: result.headlineEn,
      statusNoteMy: result.headlineMy,
    };
  }
  return {
    analysisId: result.analysisId,
    status: 'completed',
    updatedAt: result.completedAt,
    result,
    error: null,
    statusNoteEn: result.headlineEn,
    statusNoteMy: result.headlineMy,
  };
}

function toSlotStateFromError(
  analysisId: DeepDiveAnalysisId,
  err: unknown,
  timestampIso: string
): DeepDiveAnalysisSlotState {
  const errorObj: DeepDiveModuleError =
    err instanceof ModuleExecutionError
      ? {
          code: err.code,
          messageEn: err.message,
          messageMy: err.messageMy,
        }
      : {
          code: 'EXECUTION_ERROR',
          messageEn:
            err instanceof Error
              ? err.message
              : 'Unexpected error while running this analysis module.',
          messageMy:
            'ဤ Analysis Module ကို လုပ်ဆောင်ရာတွင် မမျှော်လင့်သော အမှား ဖြစ်ပွားခဲ့ပါသည်။',
        };

  return {
    analysisId,
    status: 'error',
    updatedAt: timestampIso,
    result: null,
    error: errorObj,
    statusNoteEn: errorObj.messageEn,
    statusNoteMy: errorObj.messageMy,
  };
}

/**
 * Phase 9.2 Core Deep Dive Execution Engine.
 * - Executes 1 module or any subset of the 8 selected modules.
 * - Isolates errors strictly per module (1 module failure NEVER blocks other selected modules).
 * - Deduplicates shared `product/detail` calls within a run (0 duplicate calls).
 * - Never triggers Review Insight API unless `'customer-review-intelligence'` is explicitly selected.
 * - Executes Option #8 (`ai-strategic-recommendation`) AFTER selected data modules #1–#7 so Gemini
 *   receives all freshly completed verified findings.
 * - NEVER mutates the original `ResearchProduct`, `peerProducts`, or 7-Factor Rankings.
 */
export async function runDeepDiveModules(
  params: RunDeepDiveModulesParams
): Promise<RunDeepDiveModulesOutcome> {
  const uniqueIds = Array.from(new Set(params.analysisIds));
  if (uniqueIds.length === 0) {
    return {
      slots: {},
      totalKalodataApiCalls: 0,
      totalCreditsUsed: 0,
      completedIds: [],
      unavailableIds: [],
      failedIds: [],
      blockedReason: null,
      runSummary: null,
    };
  }

  const runId =
    params.runId?.trim() ||
    `dd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

  const session = createBatchSession(params.product, {
    runId,
    spendingLimitCredits: params.spendingLimitCredits,
    sessionCreditsAlreadySpent: params.sessionCreditsAlreadySpent,
    requireExplicitConfirmation: params.requireExplicitConfirmation,
    userConfirmedPaidExecution: params.userConfirmedPaidExecution,
    salesWeightPct: params.salesWeightPct,
    deps: params.deps,
  });

  const peerProducts = params.peerProducts ?? [];
  const forceRefresh = params.forceRefresh === true;

  // Phase 9.3: Compute pre-run estimate using the exact cache snapshot & deduplication rules
  const preEstimate = estimateDeepDiveExecutionCost(params.product, uniqueIds, {
    cacheSnapshot: session.deps.getCacheFn(params.product),
    forceRefresh,
  });
  const budgetGuard = evaluateDeepDiveBudgetGuard(preEstimate, {
    spendingLimitCredits: session.spendingLimitCredits,
    sessionCreditsAlreadySpent: session.sessionCreditsAlreadySpent,
    liveBalanceCredits: params.liveBalanceCredits ?? null,
  });

  // Hard Pre-Run Explicit Confirmation Gate (0 API calls without user confirmation when required)
  if (
    session.requireExplicitConfirmation &&
    preEstimate.requiresExplicitConfirmation &&
    !session.userConfirmedPaidExecution
  ) {
    return {
      slots: {},
      totalKalodataApiCalls: 0,
      totalCreditsUsed: 0,
      completedIds: [],
      unavailableIds: [],
      failedIds: [],
      blockedReason: 'CONFIRMATION_REQUIRED',
      runSummary: null,
    };
  }

  // Hard Pre-Run Spending Limit Gate when caller explicitly supplies a limit or confirmation flow
  const enforceClientLimit =
    params.spendingLimitCredits !== undefined || params.requireExplicitConfirmation === true;
  if (enforceClientLimit && budgetGuard.exceedsSpendingLimit) {
    return {
      slots: {},
      totalKalodataApiCalls: 0,
      totalCreditsUsed: 0,
      completedIds: [],
      unavailableIds: [],
      failedIds: [],
      blockedReason: 'SPENDING_LIMIT_EXCEEDED',
      runSummary: null,
    };
  }

  const outputSlots: Partial<Record<DeepDiveAnalysisId, DeepDiveAnalysisSlotState>> = {};
  const completedIds: DeepDiveAnalysisId[] = [];
  const unavailableIds: DeepDiveAnalysisId[] = [];
  const failedIds: DeepDiveAnalysisId[] = [];
  let totalKalodataApiCalls = 0;
  let totalCreditsUsed = 0;
  let actualGeminiCalls = 0;
  let geminiTokenUsage: DeepDiveGeminiTokenUsage | null = null;
  let cacheOrLocalReuseCount = 0;
  let deduplicatedSharedCallsCount = 0;

  // Emit 'running' state for all targeted modules immediately
  for (const id of uniqueIds) {
    const runningSlot: DeepDiveAnalysisSlotState = {
      analysisId: id,
      status: 'running',
      updatedAt: session.deps.nowIsoFn(),
      result: params.existingSlots?.[id]?.result ?? null,
      error: null,
      statusNoteEn: 'Running analysis...',
      statusNoteMy: 'ခွဲခြမ်းစိတ်ဖြာနေပါသည်...',
    };
    outputSlots[id] = runningSlot;
    params.onSlotUpdate?.(id, runningSlot);
  }

  // Split: run data modules (#1–#7) first, then AI Strategic Recommendation (#8) last
  const dataModuleIds = uniqueIds.filter((id) => id !== 'ai-strategic-recommendation');
  const includesAi = uniqueIds.includes('ai-strategic-recommendation');

  const runDataModule = async (id: DeepDiveAnalysisId): Promise<void> => {
    try {
      let result: DeepDiveModuleResult;
      switch (id) {
        case 'product-intelligence':
          result = await executeProductIntelligence(session, forceRefresh);
          break;
        case 'sales-market-intelligence':
          result = await executeSalesMarketIntelligence(session, forceRefresh);
          break;
        case 'affiliate-profit-analysis':
          result = executeAffiliateProfitAnalysis(session);
          break;
        case 'creator-competition-analysis':
          result = await executeCreatorCompetitionAnalysis(session, forceRefresh);
          break;
        case 'video-intelligence':
          result = await executeVideoIntelligence(session, forceRefresh);
          break;
        case 'customer-review-intelligence':
          result = await executeCustomerReviewIntelligence(session, forceRefresh);
          break;
        case 'market-competitor-comparison':
          result = executeMarketCompetitorComparison(session, peerProducts);
          break;
        default:
          return;
      }

      totalKalodataApiCalls += result.apiCallsMade;
      totalCreditsUsed = roundCredits(totalCreditsUsed + result.creditsUsed);
      if (result.apiCallsMade === 0 && result.reusedFromCache) {
        const isSharedDedupe = result.dataSourcesEn.some((s) =>
          s.toLowerCase().includes('deduplicated')
        );
        if (isSharedDedupe) {
          deduplicatedSharedCallsCount += 1;
        } else {
          cacheOrLocalReuseCount += 1;
        }
      }
      const slot = toSlotStateFromResult(result);
      outputSlots[id] = slot;
      if (slot.status === 'unavailable') {
        unavailableIds.push(id);
      } else {
        completedIds.push(id);
      }
      params.onSlotUpdate?.(id, slot);
    } catch (err) {
      const slot = toSlotStateFromError(id, err, session.deps.nowIsoFn());
      outputSlots[id] = slot;
      failedIds.push(id);
      params.onSlotUpdate?.(id, slot);
    }
  };

  // Run data modules concurrently with shared in-flight layer deduplication + isolated error handling
  await Promise.all(dataModuleIds.map((id) => runDataModule(id)));

  // Now run AI Strategic Recommendation (#8) with all verified completed module digests
  if (includesAi) {
    const mergedResultsMap = new Map<DeepDiveAnalysisId, DeepDiveModuleResult>();
    if (params.existingSlots) {
      for (const [key, slot] of Object.entries(params.existingSlots)) {
        const modId = key as DeepDiveAnalysisId;
        if (modId !== 'ai-strategic-recommendation' && slot?.result) {
          mergedResultsMap.set(modId, slot.result);
        }
      }
    }
    for (const [key, slot] of Object.entries(outputSlots)) {
      const modId = key as DeepDiveAnalysisId;
      if (modId !== 'ai-strategic-recommendation' && slot?.result) {
        mergedResultsMap.set(modId, slot.result);
      }
    }

    const completedDigests = Array.from(mergedResultsMap.values()).map(
      buildCompletedModuleDigest
    );

    try {
      const aiResult = await executeAiStrategicRecommendation(session, completedDigests);
      actualGeminiCalls += aiResult.aiApiCallsMade ?? 1;
      geminiTokenUsage = aiResult.aiMeta?.tokenUsage ?? null;
      const slot = toSlotStateFromResult(aiResult);
      outputSlots['ai-strategic-recommendation'] = slot;
      completedIds.push('ai-strategic-recommendation');
      params.onSlotUpdate?.('ai-strategic-recommendation', slot);
    } catch (err) {
      const slot = toSlotStateFromError(
        'ai-strategic-recommendation',
        err,
        session.deps.nowIsoFn()
      );
      outputSlots['ai-strategic-recommendation'] = slot;
      failedIds.push('ai-strategic-recommendation');
      params.onSlotUpdate?.('ai-strategic-recommendation', slot);
    }
  }

  const authoritativeSnapshot = session.latestBudgetSnapshot;
  const sessionCreditsUsedAfterRun = authoritativeSnapshot
    ? authoritativeSnapshot.totalCommittedCredits
    : roundCredits(session.sessionCreditsAlreadySpent + totalCreditsUsed);
  const effectiveSpendingLimitAfterRun = authoritativeSnapshot
    ? authoritativeSnapshot.effectiveLimitCredits
    : budgetGuard.spendingLimitCredits;
  const remainingBudgetCredits = authoritativeSnapshot
    ? authoritativeSnapshot.remainingCredits
    : Math.max(0, roundCredits(effectiveSpendingLimitAfterRun - sessionCreditsUsedAfterRun));

  const runSummary: DeepDiveRunCostSummary = {
    runId,
    completedAt: session.deps.nowIsoFn(),
    analysisIds: uniqueIds,
    estimatedKalodataCredits: preEstimate.estimatedCredits,
    actualKalodataCredits: totalCreditsUsed,
    estimatedKalodataUsd: preEstimate.estimatedUsd,
    actualKalodataUsd: roundUsd(totalCreditsUsed * KALODATA_USD_PER_CREDIT),
    plannedKalodataApiCalls: preEstimate.plannedKalodataApiCalls,
    actualKalodataApiCalls: totalKalodataApiCalls,
    cacheOrLocalReuseCount,
    deduplicatedSharedCallsCount,
    plannedGeminiCalls: preEstimate.plannedGeminiCalls,
    actualGeminiCalls,
    geminiBillingStatus:
      actualGeminiCalls > 0 || preEstimate.plannedGeminiCalls > 0
        ? 'estimated-unavailable'
        : 'none',
    geminiTokenUsage,
    spendingLimitCredits: effectiveSpendingLimitAfterRun,
    sessionCreditsUsedAfterRun,
    remainingBudgetCredits,
    liveBalanceAfter: session.latestBalanceAfter,
  };

  return {
    slots: outputSlots,
    totalKalodataApiCalls,
    totalCreditsUsed,
    completedIds,
    unavailableIds,
    failedIds,
    blockedReason: null,
    runSummary,
    budgetSnapshot: authoritativeSnapshot,
  };
}
