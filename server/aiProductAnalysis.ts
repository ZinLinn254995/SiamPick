import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type {
  AiAdCreativeFormat,
  AiAnalysisErrorCode,
  AiProductAnalysis,
  AiRecommendationVerdict,
  AiVideoSuitability,
  OpportunityEvaluation,
  ResearchProduct,
} from '../src/types/product.ts';
import {
  AI_ANALYSIS_SCHEMA_VERSION,
  buildAiAnalysisDataBasis,
  buildKalodataFallbackAnalysis,
  computeProductDataFingerprint,
  deriveAuthoritativeStatuses,
} from '../src/utils/aiAnalysisFallback.ts';
import { evaluateProductOpportunity, getCanonicalProductId } from '../src/utils/scoring.ts';
import {
  getCategoryDefinition,
  verifyProductCategoryAlignment,
} from '../src/utils/categoryRegistry.ts';

export const GEMINI_PRIMARY_ANALYSIS_MODEL = 'gemini-3.1-flash-lite';
const GEMINI_BACKUP_ANALYSIS_MODEL = 'gemini-4-hydrogen';
const GEMINI_ANALYSIS_MODELS: readonly string[] = [
  GEMINI_PRIMARY_ANALYSIS_MODEL,
  GEMINI_BACKUP_ANALYSIS_MODEL,
];
const GEMINI_PRIMARY_TIMEOUT_MS = 22_000;
const GEMINI_BACKUP_TIMEOUT_MS = 38_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`GEMINI_TIMEOUT: exceeded ${timeoutMs}ms`)),
          timeoutMs
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function classifyGeminiError(err: unknown): {
  code: AiAnalysisErrorCode;
  detail: string;
  retryable: boolean;
} {
  const rawMessage = err instanceof Error ? err.message : String(err ?? 'Unknown error');
  const lower = rawMessage.toLowerCase();

  if (lower.includes('gemini_timeout') || lower.includes('timeout') || lower.includes('aborted')) {
    return { code: 'TIMEOUT', detail: 'Request timed out', retryable: false };
  }
  if (
    lower.includes('429') ||
    lower.includes('resource_exhausted') ||
    lower.includes('quota') ||
    lower.includes('rate limit')
  ) {
    return { code: 'RATE_LIMITED', detail: 'Quota or rate limit reached', retryable: false };
  }
  if (
    lower.includes('401') ||
    lower.includes('403') ||
    lower.includes('permission_denied') ||
    lower.includes('api_key_invalid') ||
    lower.includes('api key not valid')
  ) {
    return { code: 'AUTH_ERROR', detail: 'API key authentication failed', retryable: false };
  }
  if (
    lower.includes('500') ||
    lower.includes('502') ||
    lower.includes('503') ||
    lower.includes('504') ||
    lower.includes('unavailable') ||
    lower.includes('overloaded') ||
    lower.includes('fetch failed') ||
    lower.includes('econnreset')
  ) {
    return { code: 'UPSTREAM_ERROR', detail: rawMessage.slice(0, 140), retryable: true };
  }
  if (lower.includes('404') || lower.includes('not_found')) {
    return { code: 'UPSTREAM_ERROR', detail: 'Model unavailable', retryable: true };
  }
  return { code: 'UPSTREAM_ERROR', detail: rawMessage.slice(0, 140), retryable: false };
}

function extractJsonObject(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const first = candidate.indexOf('{');
  const last = candidate.lastIndexOf('}');
  if (first !== -1 && last > first) {
    return candidate.slice(first, last + 1);
  }
  return candidate;
}

function cleanNonEmptyString(val: unknown): string | null {
  if (typeof val !== 'string') return null;
  const trimmed = val.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function cleanStringArray(val: unknown, maxItems = 5): string[] {
  if (!Array.isArray(val)) return [];
  return val
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim())
    .slice(0, maxItems);
}

const PRODUCT_ANALYSIS_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    strengthsEn: { type: Type.ARRAY, items: { type: Type.STRING } },
    strengthsMy: { type: Type.ARRAY, items: { type: Type.STRING } },
    weaknessesEn: { type: Type.ARRAY, items: { type: Type.STRING } },
    weaknessesMy: { type: Type.ARRAY, items: { type: Type.STRING } },
    salesAndRevenueEn: { type: Type.STRING },
    salesAndRevenueMy: { type: Type.STRING },
    growthPotentialEn: { type: Type.STRING },
    growthPotentialMy: { type: Type.STRING },
    commissionPotentialEn: { type: Type.STRING },
    commissionPotentialMy: { type: Type.STRING },
    competitionAnalysisEn: { type: Type.STRING },
    competitionAnalysisMy: { type: Type.STRING },
    targetCustomerEn: { type: Type.STRING },
    targetCustomerMy: { type: Type.STRING },
    whyChooseEn: { type: Type.STRING },
    whyChooseMy: { type: Type.STRING },
    risksAndDrawbacksEn: { type: Type.ARRAY, items: { type: Type.STRING } },
    risksAndDrawbacksMy: { type: Type.ARRAY, items: { type: Type.STRING } },
    aiContentSuitability: {
      type: Type.OBJECT,
      properties: {
        suitabilityRating: { type: Type.STRING },
        summaryEn: { type: Type.STRING },
        summaryMy: { type: Type.STRING },
        creativeAnglesEn: { type: Type.ARRAY, items: { type: Type.STRING } },
        creativeAnglesMy: { type: Type.ARRAY, items: { type: Type.STRING } },
        cautionsEn: { type: Type.ARRAY, items: { type: Type.STRING } },
        cautionsMy: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: [
        'suitabilityRating',
        'summaryEn',
        'summaryMy',
        'creativeAnglesEn',
        'creativeAnglesMy',
        'cautionsEn',
        'cautionsMy',
      ],
    },
    finalRecommendation: {
      type: Type.OBJECT,
      properties: {
        verdict: { type: Type.STRING },
        headlineEn: { type: Type.STRING },
        headlineMy: { type: Type.STRING },
        actionPlanEn: { type: Type.STRING },
        actionPlanMy: { type: Type.STRING },
      },
      required: ['verdict', 'headlineEn', 'headlineMy', 'actionPlanEn', 'actionPlanMy'],
    },
    affiliateStrategyEn: { type: Type.STRING },
    affiliateStrategyMy: { type: Type.STRING },
    categoryVerification: {
      type: Type.OBJECT,
      properties: {
        status: { type: Type.STRING },
        noteEn: { type: Type.STRING },
        noteMy: { type: Type.STRING },
      },
      required: ['status', 'noteEn', 'noteMy'],
    },
  },
  required: [
    'strengthsEn',
    'strengthsMy',
    'weaknessesEn',
    'weaknessesMy',
    'salesAndRevenueEn',
    'salesAndRevenueMy',
    'growthPotentialEn',
    'growthPotentialMy',
    'commissionPotentialEn',
    'commissionPotentialMy',
    'competitionAnalysisEn',
    'competitionAnalysisMy',
    'targetCustomerEn',
    'targetCustomerMy',
    'whyChooseEn',
    'whyChooseMy',
    'risksAndDrawbacksEn',
    'risksAndDrawbacksMy',
    'aiContentSuitability',
    'finalRecommendation',
  ],
};

export function buildGeminiPromptPayload(
  product: ResearchProduct,
  evaluation: OpportunityEvaluation
): string {
  const m = product.kalodataMetrics;
  const statuses = deriveAuthoritativeStatuses(product, evaluation);
  const categoryDef = getCategoryDefinition(product.category);
  const categoryAlignment = verifyProductCategoryAlignment(product);

  const compactInput = {
    canonicalProductId: getCanonicalProductId(product),
    productName: product.name,
    category: product.category,
    subCategory: product.subCategory,
    shopName: product.shopName,
    brand: product.brand ?? null,
    dispatchHub: product.dispatchHub,
    researchMode: product.researchMode ?? m?.researchMode ?? 'fast',
    researchDepthTag: product.researchDepthTag ?? 'rank-only',
    imageVerified: product.imageVerified,
    kalodataMetrics: {
      dateRange: m?.dateRange ?? null,
      unitPriceThb: product.priceThb,
      minPriceThb: m?.minPriceThb ?? null,
      maxPriceThb: m?.maxPriceThb ?? null,
      salesVolume: m?.salesVolume ?? null,
      revenueThb: m?.revenueThb ?? null,
      revenueGrowthRatePct: m?.revenueGrowthRate ?? null,
      commissionRatePct:
        product.commissionVerified && product.commissionRate !== null
          ? product.commissionRate
          : m?.commissionRatePct ?? null,
      estimatedCommissionPerSaleThb: product.estimatedCommissionPerSaleThb ?? null,
      videoRevenueThb: m?.videoRevenueThb ?? null,
      liveRevenueThb: m?.liveRevenueThb ?? null,
      showcaseRevenueThb: m?.showcaseRevenueThb ?? null,
      shoppingMallRevenueThb: m?.shoppingMallRevenueThb ?? null,
      creatorNumber: m?.creatorNumber ?? null,
      videoNumber: m?.videoNumber ?? null,
      liveNumber: m?.liveNumber ?? null,
      deliveryType: m?.deliveryType ?? null,
      productReviewCount: product.reviewCount ?? m?.productReviewCount ?? null,
      customerRating: product.customerRating ?? null,
      shopSellerType: m?.shopSellerType ?? null,
      shopRevenueThb: m?.shopRevenueThb ?? null,
      shopAffiliateRevenueThb: m?.shopAffiliateRevenueThb ?? null,
      shopSelfAccountRevenueThb: m?.shopSelfAccountRevenueThb ?? null,
      shopShoppingMallRevenueThb: m?.shopShoppingMallRevenueThb ?? null,
      shopSalesVolume: m?.shopSalesVolume ?? null,
      shopCreatorNumber: m?.shopCreatorNumber ?? null,
      shopProductNumber: m?.shopProductNumber ?? null,
      shopVideoNumber: m?.shopVideoNumber ?? null,
      shopLiveNumber: m?.shopLiveNumber ?? null,
      trendPeakThb: m?.trendPeakThb ?? null,
      trendAvgThb: m?.trendAvgThb ?? null,
      launchDate: m?.launchDate ?? null,
      skuCount: m?.skuCount ?? null,
    },
    verifiedReviewInsights: m?.reviewInsight
      ? {
          commentsAnalyzed: m.reviewInsight.commentsAnalyzed,
          sampleAverageRating: m.reviewInsight.averageRating,
          summary: m.reviewInsight.summary,
          buyerLikes: m.reviewInsight.positivePoints.slice(0, 5),
          buyerDislikes: m.reviewInsight.painPoints.slice(0, 5),
          frequentComplaints: m.reviewInsight.frequentComplaints.slice(0, 4),
          qualityCautions: m.reviewInsight.qualityCautions.slice(0, 4),
          buyerNeedsAndScenarios: m.reviewInsight.buyerNeeds.slice(0, 4),
        }
      : null,
    verifiedBuyerReviewStrengths: Array.isArray(product.reviewStrengthsEn)
      ? product.reviewStrengthsEn.slice(0, 5)
      : [],
    verifiedBuyerComplaints: Array.isArray(product.customerComplaintsEn)
      ? product.customerComplaintsEn.slice(0, 5)
      : [],
    authoritativeDataStatuses: statuses,
    phase2ScoringSummary: {
      totalScore: evaluation.totalScore,
      tier: evaluation.tier,
      confidenceLevel: evaluation.confidenceLevel,
      confidencePct: evaluation.confidencePct,
      verifiedFactors: evaluation.verifiedCount,
      estimatedFactors: evaluation.estimatedCount,
      unverifiedFactors: evaluation.unverifiedCount,
      unavailableFactors: evaluation.unavailableCount,
      redistributedWeightPct: evaluation.redistributedWeightPct,
      criteriaBreakdown: evaluation.criteria.map((c) => ({
        factor: c.key,
        status: c.verification,
        baseWeight: c.baseWeight,
        effectiveWeight: c.effectiveWeight,
        earnedPoints: c.earnedPoints,
        metric: c.metricDisplayEn,
      })),
    },
  };

  const categoryCreativeDirective = `CATEGORY-SPECIFIC ANALYSIS STRATEGY (MANDATORY — ${categoryDef.labelEn} / ${product.category}):
- Content Potential (${categoryDef.scoringProfile.formatLabelEn}): ${categoryDef.aiProfile.contentPotentialDirectiveEn}
- Key Selling Points Focus: ${categoryDef.aiProfile.sellingPointsFocusEn}
- Category-Specific Risks to Check: ${categoryDef.aiProfile.riskChecklistEn.join(' | ')}
- Affiliate Strategy Focus: ${categoryDef.aiProfile.affiliateStrategyFocusEn}
- Image Verification Rule: If imageVerified is false, explicitly note that visual packaging/details cannot be confirmed yet.
- CATEGORY VERIFICATION GUARD: Check whether the productName, subCategory, and Kalodata priCategory genuinely belong to "${categoryDef.labelEn}". If the category appears mismatched, unclear, or contradicted by the title, set categoryVerification.status = "unverified" and explain why in noteEn/noteMy. Otherwise set "verified". (Deterministic pre-check: ${categoryAlignment.status} — ${categoryAlignment.noteEn})`;

  return `Analyze this Thailand TikTok Shop affiliate product strictly using ONLY the Kalodata JSON data below.

${categoryCreativeDirective}

REQUIRED ANALYSIS POINTS (both crisp English *En and natural Burmese *My):
1. strengthsEn/My (2-4 concise bullets) & weaknessesEn/My (2-4 concise bullets)
2. salesAndRevenueEn/My: Current sales volume, THB revenue, and video/live channel split if available. If null, explicitly state Unavailable.
3. growthPotentialEn/My: Analyze revenueGrowthRatePct if present; if null, explicitly state growth rate is Unavailable and do NOT invent a trend.
4. commissionPotentialEn/My: Analyze verified commissionRatePct and THB earning per sale; if unavailable, state Unavailable.
5. competitionAnalysisEn/My: Analyze creatorNumber alongside sales/revenue; if creatorNumber is null, explicitly state Creator Count is Unavailable and competition intensity cannot be verified.
6. targetCustomerEn/My: Practical Thailand TikTok Shop buyer persona tailored to ${categoryDef.labelEn}. Explicitly frame as strategic AI market inference when demographic/review data is not directly verified.
7. whyChooseEn/My: Clear bottom-line case for why an affiliate would (or would not) choose this product over alternatives.
8. risksAndDrawbacksEn/My (2-4 concrete bullets covering missing Kalodata fields, category-specific compliance/return/warranty risks, saturation or margin risk).
9. aiContentSuitability: suitabilityRating ("High" | "Good" | "Moderate"), summaryEn/My, creativeAnglesEn/My (2-3 category-tailored items), cautionsEn/My (2 items).
10. finalRecommendation: verdict ("priority-test" | "test-with-caution" | "monitor" | "skip"), headlineEn/My, actionPlanEn/My (concise concrete next step).
11. affiliateStrategyEn/My: Concrete Thailand TikTok Shop affiliate promotion & hook strategy tailored to ${categoryDef.labelEn}.
12. categoryVerification: { status: "verified" | "unverified", noteEn, noteMy } confirming whether the product genuinely matches "${categoryDef.labelEn}".

Product Kalodata JSON:
${JSON.stringify(compactInput)}`;
}

const SYSTEM_INSTRUCTION = `You are a senior Thailand TikTok Shop Affiliate Product Research Analyst for SiamPick.

ABSOLUTE INTEGRITY RULES:
1. KALODATA DATA ONLY: Base all numeric claims strictly on the provided Kalodata JSON. NEVER invent, estimate, or hallucinate sales counts, revenue THB, growth rates, commission rates, creator counts, star ratings, review counts, or Thai FDA numbers.
2. MISSING DATA HONESTY: Whenever any metric is null or marked "unavailable" in authoritativeDataStatuses, explicitly state that it is Unavailable in Kalodata and must be checked directly on TikTok Shop Thailand.
3. SEPARATE AI INTERPRETATION FROM MARKET DATA: Clearly distinguish factual Kalodata metrics from your AI strategic inferences (such as target customer profile or AI creative ad suitability).
4. FAST, CONCISE BILINGUAL OUTPUT: Keep every text field crisp (1-2 concise sentences max) and every bullet list concise (2-3 short items max) in both clear English (*En) and natural Burmese (*My).
5. STRICT JSON ONLY: Output valid JSON matching the exact schema.`;

/**
 * Validates & sanitizes the raw JSON object returned by Gemini.
 * Returns null if critical fields are missing/malformed so the caller cleanly
 * triggers the Kalodata Fallback Analysis with INVALID_RESPONSE.
 */
export function validateAndBuildGeminiAnalysis(
  rawText: string,
  product: ResearchProduct,
  evaluation: OpportunityEvaluation,
  modelUsed: string
): AiProductAnalysis | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonObject(rawText));
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }
  const obj = parsed as Record<string, unknown>;

  const strengthsEn = cleanStringArray(obj.strengthsEn, 5);
  const strengthsMy = cleanStringArray(obj.strengthsMy, 5);
  const weaknessesEn = cleanStringArray(obj.weaknessesEn, 5);
  const weaknessesMy = cleanStringArray(obj.weaknessesMy, 5);
  const salesAndRevenueEn = cleanNonEmptyString(obj.salesAndRevenueEn);
  const salesAndRevenueMy = cleanNonEmptyString(obj.salesAndRevenueMy);
  const growthPotentialEn = cleanNonEmptyString(obj.growthPotentialEn);
  const growthPotentialMy = cleanNonEmptyString(obj.growthPotentialMy);
  const commissionPotentialEn = cleanNonEmptyString(obj.commissionPotentialEn);
  const commissionPotentialMy = cleanNonEmptyString(obj.commissionPotentialMy);
  const competitionAnalysisEn = cleanNonEmptyString(obj.competitionAnalysisEn);
  const competitionAnalysisMy = cleanNonEmptyString(obj.competitionAnalysisMy);
  const targetCustomerEn = cleanNonEmptyString(obj.targetCustomerEn);
  const targetCustomerMy = cleanNonEmptyString(obj.targetCustomerMy);
  const whyChooseEn = cleanNonEmptyString(obj.whyChooseEn);
  const whyChooseMy = cleanNonEmptyString(obj.whyChooseMy);
  const risksAndDrawbacksEn = cleanStringArray(obj.risksAndDrawbacksEn, 5);
  const risksAndDrawbacksMy = cleanStringArray(obj.risksAndDrawbacksMy, 5);

  const rawAi =
    obj.aiContentSuitability && typeof obj.aiContentSuitability === 'object'
      ? (obj.aiContentSuitability as Record<string, unknown>)
      : null;
  const rawRec =
    obj.finalRecommendation && typeof obj.finalRecommendation === 'object'
      ? (obj.finalRecommendation as Record<string, unknown>)
      : null;

  const aiSummaryEn = cleanNonEmptyString(rawAi?.summaryEn);
  const aiSummaryMy = cleanNonEmptyString(rawAi?.summaryMy);
  const recHeadlineEn = cleanNonEmptyString(rawRec?.headlineEn);
  const recHeadlineMy = cleanNonEmptyString(rawRec?.headlineMy);
  const recActionEn = cleanNonEmptyString(rawRec?.actionPlanEn);
  const recActionMy = cleanNonEmptyString(rawRec?.actionPlanMy);

  // Strict completeness gate — reject partial/hallucinated empty shells
  if (
    strengthsEn.length === 0 ||
    strengthsMy.length === 0 ||
    weaknessesEn.length === 0 ||
    weaknessesMy.length === 0 ||
    !salesAndRevenueEn ||
    !salesAndRevenueMy ||
    !growthPotentialEn ||
    !growthPotentialMy ||
    !commissionPotentialEn ||
    !commissionPotentialMy ||
    !competitionAnalysisEn ||
    !competitionAnalysisMy ||
    !targetCustomerEn ||
    !targetCustomerMy ||
    !whyChooseEn ||
    !whyChooseMy ||
    risksAndDrawbacksEn.length === 0 ||
    risksAndDrawbacksMy.length === 0 ||
    !aiSummaryEn ||
    !aiSummaryMy ||
    !recHeadlineEn ||
    !recHeadlineMy ||
    !recActionEn ||
    !recActionMy
  ) {
    return null;
  }

  const statuses = deriveAuthoritativeStatuses(product, evaluation);
  const dataBasis = buildAiAnalysisDataBasis(product, evaluation);
  const categoryDef = getCategoryDefinition(product.category);
  const deterministicCheck = verifyProductCategoryAlignment(product);
  const adFormat: AiAdCreativeFormat = categoryDef.aiProfile.adFormat;

  const rawSuitability = cleanNonEmptyString(rawAi?.suitabilityRating);
  const suitabilityRating: AiVideoSuitability =
    rawSuitability === 'High' || rawSuitability === 'Good' || rawSuitability === 'Moderate'
      ? rawSuitability
      : product.aiVideoSuitability;

  const rawVerdict = cleanNonEmptyString(rawRec?.verdict);
  const verdict: AiRecommendationVerdict =
    rawVerdict === 'priority-test' ||
    rawVerdict === 'test-with-caution' ||
    rawVerdict === 'monitor' ||
    rawVerdict === 'skip'
      ? rawVerdict
      : evaluation.totalScore >= 80 && evaluation.confidenceLevel === 'High'
        ? 'priority-test'
        : evaluation.totalScore >= 65
          ? 'test-with-caution'
          : evaluation.totalScore >= 50
            ? 'monitor'
            : 'skip';

  const fallbackRef = buildKalodataFallbackAnalysis(product, evaluation, { isManualPreview: true });
  const creativeAnglesEn = cleanStringArray(rawAi?.creativeAnglesEn, 4);
  const creativeAnglesMy = cleanStringArray(rawAi?.creativeAnglesMy, 4);
  const cautionsEn = cleanStringArray(rawAi?.cautionsEn, 4);
  const cautionsMy = cleanStringArray(rawAi?.cautionsMy, 4);

  const rawCatVer =
    obj.categoryVerification && typeof obj.categoryVerification === 'object'
      ? (obj.categoryVerification as Record<string, unknown>)
      : null;
  const aiFlaggedUnverified =
    cleanNonEmptyString(rawCatVer?.status)?.toLowerCase() === 'unverified';
  const categoryVerificationStatus: 'verified' | 'unverified' =
    aiFlaggedUnverified || deterministicCheck.status === 'unverified'
      ? 'unverified'
      : 'verified';
  const categoryVerificationNoteEn =
    cleanNonEmptyString(rawCatVer?.noteEn) ?? deterministicCheck.noteEn;
  const categoryVerificationNoteMy =
    cleanNonEmptyString(rawCatVer?.noteMy) ?? deterministicCheck.noteMy;

  const affiliateStrategyEn =
    cleanNonEmptyString(obj.affiliateStrategyEn) ?? categoryDef.aiProfile.affiliateStrategyFocusEn;
  const affiliateStrategyMy =
    cleanNonEmptyString(obj.affiliateStrategyMy) ?? categoryDef.aiProfile.affiliateStrategyFocusMy;

  return {
    schemaVersion: AI_ANALYSIS_SCHEMA_VERSION,
    canonicalProductId: getCanonicalProductId(product),
    dataFingerprint: computeProductDataFingerprint(product),
    source: 'gemini',
    modelUsed,
    analyzedAt: new Date().toISOString(),
    geminiFailed: false,
    overallDataConfidence: evaluation.confidenceLevel,
    confidenceNoteEn: evaluation.confidenceExplanationEn,
    confidenceNoteMy: evaluation.confidenceExplanationMy,
    dataBasis,
    strengthsEn,
    strengthsMy,
    weaknessesEn,
    weaknessesMy,
    salesAndRevenueEn,
    salesAndRevenueMy,
    salesAndRevenueStatus: statuses.salesAndRevenueStatus,
    growthPotentialEn,
    growthPotentialMy,
    growthPotentialStatus: statuses.growthPotentialStatus,
    commissionPotentialEn,
    commissionPotentialMy,
    commissionPotentialStatus: statuses.commissionPotentialStatus,
    competitionAnalysisEn,
    competitionAnalysisMy,
    competitionStatus: statuses.competitionStatus,
    targetCustomerEn,
    targetCustomerMy,
    targetCustomerStatus: statuses.targetCustomerStatus,
    whyChooseEn,
    whyChooseMy,
    risksAndDrawbacksEn,
    risksAndDrawbacksMy,
    aiContentSuitability: {
      adFormat,
      suitabilityRating,
      status: statuses.aiContentStatus,
      summaryEn: aiSummaryEn,
      summaryMy: aiSummaryMy,
      creativeAnglesEn:
        creativeAnglesEn.length > 0 ? creativeAnglesEn : fallbackRef.aiContentSuitability.creativeAnglesEn,
      creativeAnglesMy:
        creativeAnglesMy.length > 0 ? creativeAnglesMy : fallbackRef.aiContentSuitability.creativeAnglesMy,
      cautionsEn: cautionsEn.length > 0 ? cautionsEn : fallbackRef.aiContentSuitability.cautionsEn,
      cautionsMy: cautionsMy.length > 0 ? cautionsMy : fallbackRef.aiContentSuitability.cautionsMy,
    },
    finalRecommendation: {
      verdict,
      headlineEn: recHeadlineEn,
      headlineMy: recHeadlineMy,
      actionPlanEn: recActionEn,
      actionPlanMy: recActionMy,
    },
    analyzedCategory: product.category,
    categoryVerificationStatus,
    categoryVerificationNoteEn,
    categoryVerificationNoteMy,
    affiliateStrategyEn,
    affiliateStrategyMy,
  };
}

/**
 * Analyzes a single Kalodata product with Gemini AI on the server.
 * - Strictly analyzes ONLY already-fetched Kalodata metrics (ZERO Google Search tools, ZERO Kalodata calls).
 * - Never exposes GEMINI_API_KEY to the frontend.
 * - Handles missing key, timeout, rate limit, auth error, network/5xx error, and invalid JSON cleanly.
 * - ALWAYS returns a valid AiProductAnalysis — falling back gracefully to Kalodata-based Fallback Analysis
 *   with `geminiFailed: true` and an explicit notice whenever Gemini fails.
 */
export async function analyzeSingleProductWithGemini(
  product: ResearchProduct,
  evaluationInput?: OpportunityEvaluation | null
): Promise<AiProductAnalysis> {
  const evaluation =
    evaluationInput ?? evaluateProductOpportunity(product, { salesWeightPct: 50 });

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return buildKalodataFallbackAnalysis(product, evaluation, {
      code: 'MISSING_API_KEY',
    });
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const prompt = buildGeminiPromptPayload(product, evaluation);
  let lastErrorCode: AiAnalysisErrorCode = 'UPSTREAM_ERROR';
  let lastErrorDetail = '';

  for (let modelIdx = 0; modelIdx < GEMINI_ANALYSIS_MODELS.length; modelIdx += 1) {
    const modelName = GEMINI_ANALYSIS_MODELS[modelIdx];
    const maxAttempts = modelIdx === 0 ? 2 : 1;
    const timeoutMs =
      modelIdx === 0 ? GEMINI_PRIMARY_TIMEOUT_MS : GEMINI_BACKUP_TIMEOUT_MS;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const config =
          modelName === GEMINI_BACKUP_ANALYSIS_MODEL
            ? {
                systemInstruction: SYSTEM_INSTRUCTION,
                responseMimeType: 'application/json',
                responseSchema: PRODUCT_ANALYSIS_RESPONSE_SCHEMA,
                thinkingConfig: {
                  thinkingLevel: ThinkingLevel.LOW,
                },
              }
            : {
                systemInstruction: SYSTEM_INSTRUCTION,
                responseMimeType: 'application/json',
                responseSchema: PRODUCT_ANALYSIS_RESPONSE_SCHEMA,
              };

        const response = await withTimeout(
          ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config,
          }),
          timeoutMs
        );

        const rawText = (response.text ?? '').trim();
        if (!rawText) {
          lastErrorCode = 'INVALID_RESPONSE';
          lastErrorDetail = 'Empty response text';
          break;
        }

        const validated = validateAndBuildGeminiAnalysis(rawText, product, evaluation, modelName);
        if (validated) {
          return validated;
        }

        lastErrorCode = 'INVALID_RESPONSE';
        lastErrorDetail = 'Incomplete or malformed JSON response';
        break;
      } catch (err) {
        const classified = classifyGeminiError(err);
        lastErrorCode = classified.code;
        lastErrorDetail = classified.detail;
        console.warn(
          `[SiamPick Phase 3 Gemini Analysis] ${modelName} attempt ${attempt} failed (${classified.code}): ${classified.detail}`
        );

        // Immediately stop on auth or rate limit errors (no point retrying another model)
        if (classified.code === 'AUTH_ERROR' || classified.code === 'RATE_LIMITED') {
          return buildKalodataFallbackAnalysis(product, evaluation, {
            code: lastErrorCode,
            detail: lastErrorDetail,
          });
        }

        // On TIMEOUT, move immediately to the faster backup model instead of retrying the same slow model
        if (classified.code === 'TIMEOUT') {
          break;
        }

        if (!classified.retryable) {
          break;
        }

        if (attempt < maxAttempts) {
          await sleep(600 * attempt);
        }
      }
    }
  }

  return buildKalodataFallbackAnalysis(product, evaluation, {
    code: lastErrorCode,
    detail: lastErrorDetail,
  });
}
