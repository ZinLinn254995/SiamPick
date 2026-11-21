import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type {
  AiAnalysisErrorCode,
  AiRecommendationVerdict,
  OpportunityEvaluation,
  ResearchProduct,
} from '../src/types/product.ts';
import type {
  DeepDiveAnalysisId,
  DeepDiveCompletedModuleDigest,
} from '../src/types/deepDive.ts';
import { evaluateProductOpportunity, getCanonicalProductId } from '../src/utils/scoring.ts';
import { getCategoryDefinition } from '../src/utils/categoryRegistry.ts';
import { classifyGeminiError } from './aiProductAnalysis.ts';

const DEEP_DIVE_AI_PRIMARY_MODEL = 'gemini-3.1-flash-lite';
const DEEP_DIVE_AI_BACKUP_MODEL = 'gemini-4-hydrogen';
const DEEP_DIVE_AI_MODELS: readonly string[] = [
  DEEP_DIVE_AI_PRIMARY_MODEL,
  DEEP_DIVE_AI_BACKUP_MODEL,
];
const PRIMARY_TIMEOUT_MS = 22_000;
const BACKUP_TIMEOUT_MS = 38_000;

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

function cleanString(val: unknown): string | null {
  if (typeof val !== 'string') return null;
  const t = val.trim();
  return t.length > 0 ? t : null;
}

function cleanStringArray(val: unknown, maxItems = 5): string[] {
  if (!Array.isArray(val)) return [];
  return val
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim())
    .slice(0, maxItems);
}

const DEEP_DIVE_STRATEGY_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    verdict: { type: Type.STRING },
    headlineEn: { type: Type.STRING },
    headlineMy: { type: Type.STRING },
    summaryEn: { type: Type.STRING },
    summaryMy: { type: Type.STRING },
    strengthsEn: { type: Type.ARRAY, items: { type: Type.STRING } },
    strengthsMy: { type: Type.ARRAY, items: { type: Type.STRING } },
    weaknessesEn: { type: Type.ARRAY, items: { type: Type.STRING } },
    weaknessesMy: { type: Type.ARRAY, items: { type: Type.STRING } },
    risksEn: { type: Type.ARRAY, items: { type: Type.STRING } },
    risksMy: { type: Type.ARRAY, items: { type: Type.STRING } },
    targetAudienceEn: { type: Type.STRING },
    targetAudienceMy: { type: Type.STRING },
    videoIdeasEn: { type: Type.ARRAY, items: { type: Type.STRING } },
    videoIdeasMy: { type: Type.ARRAY, items: { type: Type.STRING } },
    affiliateStrategyEn: { type: Type.STRING },
    affiliateStrategyMy: { type: Type.STRING },
    goNoGoReasonEn: { type: Type.STRING },
    goNoGoReasonMy: { type: Type.STRING },
    dataLimitationsEn: { type: Type.ARRAY, items: { type: Type.STRING } },
    dataLimitationsMy: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: [
    'verdict',
    'headlineEn',
    'headlineMy',
    'summaryEn',
    'summaryMy',
    'strengthsEn',
    'strengthsMy',
    'weaknessesEn',
    'weaknessesMy',
    'risksEn',
    'risksMy',
    'targetAudienceEn',
    'targetAudienceMy',
    'videoIdeasEn',
    'videoIdeasMy',
    'affiliateStrategyEn',
    'affiliateStrategyMy',
    'goNoGoReasonEn',
    'goNoGoReasonMy',
    'dataLimitationsEn',
    'dataLimitationsMy',
  ],
};

const SYSTEM_INSTRUCTION = `You are a senior Thailand TikTok Shop Affiliate Strategist generating an AI Strategic Recommendation for SiamPick Deep Dive Analysis.

ABSOLUTE INTEGRITY RULES:
1. STRICT GROUNDING ONLY: Use ONLY the provided verified Product Data, 7-Factor Opportunity Evaluation, and completed Deep Dive module findings.
2. NEVER FABRICATE MISSING METRICS: NEVER invent sales numbers, daily trends, creator lists, video engagement rates, customer ratings, review counts, or Thai FDA numbers.
3. EXPLICIT DATA LIMITATIONS: If any data point (such as Daily/Weekly Trends, Top Creators, Linked Video Engagement, or Customer Reviews) is missing or marked Unavailable in the input, explicitly acknowledge that gap in dataLimitationsEn/My and calibrate your verdict conservatively.
4. AI INTERPRETATION CLARITY: Your output is strictly an AI strategic interpretation built on top of verified market data — state clear, practical next steps for a Thailand TikTok Shop affiliate.
5. CRISP BILINGUAL OUTPUT: Provide clear English (*En) and natural Burmese (*My) for every field. Return valid JSON matching the exact schema.`;

export interface DeepDiveAiStrategyPayload {
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
}

export type DeepDiveAiStrategyResponse =
  | {
      ok: true;
      strategy: DeepDiveAiStrategyPayload;
    }
  | {
      ok: false;
      code: AiAnalysisErrorCode;
      error: string;
      errorMy: string;
    };

export function buildDeepDiveAiPrompt(
  product: ResearchProduct,
  evaluation: OpportunityEvaluation,
  completedModules: readonly DeepDiveCompletedModuleDigest[]
): string {
  const m = product.kalodataMetrics;
  const categoryDef = getCategoryDefinition(product.category);

  const inputBundle = {
    canonicalProductId: getCanonicalProductId(product),
    productName: product.name,
    category: {
      slug: product.category,
      labelEn: categoryDef.labelEn,
      subCategory: product.subCategory,
    },
    shopName: product.shopName,
    dispatchHub: product.dispatchHub,
    researchMode: product.researchMode ?? m?.researchMode ?? 'fast',
    verifiedProductMetrics: {
      priceThb: product.priceThb,
      minPriceThb: m?.minPriceThb ?? null,
      maxPriceThb: m?.maxPriceThb ?? null,
      commissionRatePct: product.commissionVerified ? product.commissionRate : null,
      commissionPerSaleThb: product.estimatedCommissionPerSaleThb ?? null,
      salesVolume: m?.salesVolume ?? null,
      revenueThb: m?.revenueThb ?? null,
      revenueGrowthRatePct: m?.revenueGrowthRate ?? null,
      videoRevenueThb: m?.videoRevenueThb ?? null,
      liveRevenueThb: m?.liveRevenueThb ?? null,
      showcaseRevenueThb: m?.showcaseRevenueThb ?? null,
      creatorNumber: m?.creatorNumber ?? null,
      videoNumber: m?.videoNumber ?? null,
      liveNumber: m?.liveNumber ?? null,
      reviewCount: product.reviewCount ?? m?.productReviewCount ?? null,
      customerRating: product.customerRating ?? null,
      skuCount: m?.skuCount ?? null,
      deliveryType: m?.deliveryType ?? null,
      dateRange: m?.dateRange ?? null,
    },
    opportunityScoreContext: {
      totalScore: evaluation.totalScore,
      tier: evaluation.tier,
      confidenceLevel: evaluation.confidenceLevel,
      confidencePct: evaluation.confidencePct,
      verifiedCount: evaluation.verifiedCount,
      unavailableCount: evaluation.unavailableCount,
    },
    myanmarSignals: product.myanmarLanguage
      ? {
          matched: product.myanmarLanguage.matched,
          confidence: product.myanmarLanguage.confidence,
          matchedReviewCount: product.myanmarLanguage.matchedReviewCount,
          matchedVideoCount: product.myanmarLanguage.matchedVideoCount ?? 0,
        }
      : null,
    completedDeepDiveModules: completedModules.map((mod) => ({
      analysisId: mod.analysisId,
      outcome: mod.outcome,
      dataStatus: mod.dataStatus,
      headline: mod.headlineEn,
      summary: mod.summaryEn,
      metrics: mod.metrics.slice(0, 10),
      unavailableNotes: mod.unavailableNotes.slice(0, 4),
    })),
  };

  return `Synthesize an actionable Thailand TikTok Shop affiliate Deep Dive strategic recommendation strictly from the verified JSON below.

REQUIRED OUTPUT FIELDS (crisp English *En and natural Burmese *My):
- verdict: one of "priority-test" | "test-with-caution" | "monitor" | "skip"
- headlineEn / headlineMy: 1 crisp headline summarizing the go/no-go decision
- summaryEn / summaryMy: 2 concise sentences tying together verified metrics and completed Deep Dive modules
- strengthsEn / strengthsMy (2-4 concise items strictly supported by input)
- weaknessesEn / weaknessesMy (2-4 concise items strictly supported by input)
- risksEn / risksMy (2-4 concrete affiliate/product/compliance/saturation/missing-data risks)
- targetAudienceEn / targetAudienceMy: practical Thailand TikTok Shop buyer profile (explicitly framed as AI strategic inference)
- videoIdeasEn / videoIdeasMy (3 short, concrete TikTok video hooks/concepts suited to ${categoryDef.labelEn})
- affiliateStrategyEn / affiliateStrategyMy: concise go-to-market promotion strategy
- goNoGoReasonEn / goNoGoReasonMy: clear go / no-go rationale with concrete next step
- dataLimitationsEn / dataLimitationsMy (1-4 items explicitly listing every missing or unavailable data source from the input)

Verified Input JSON:
${JSON.stringify(inputBundle)}`;
}

export function validateDeepDiveStrategyJson(
  rawText: string,
  modelUsed: string,
  modulesSynthesized: DeepDiveAnalysisId[]
): DeepDiveAiStrategyPayload | null {
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

  const rawVerdict = cleanString(obj.verdict);
  const verdict: AiRecommendationVerdict =
    rawVerdict === 'priority-test' ||
    rawVerdict === 'test-with-caution' ||
    rawVerdict === 'monitor' ||
    rawVerdict === 'skip'
      ? rawVerdict
      : 'monitor';

  const headlineEn = cleanString(obj.headlineEn);
  const headlineMy = cleanString(obj.headlineMy);
  const summaryEn = cleanString(obj.summaryEn);
  const summaryMy = cleanString(obj.summaryMy);
  const strengthsEn = cleanStringArray(obj.strengthsEn, 4);
  const strengthsMy = cleanStringArray(obj.strengthsMy, 4);
  const weaknessesEn = cleanStringArray(obj.weaknessesEn, 4);
  const weaknessesMy = cleanStringArray(obj.weaknessesMy, 4);
  const risksEn = cleanStringArray(obj.risksEn, 4);
  const risksMy = cleanStringArray(obj.risksMy, 4);
  const targetAudienceEn = cleanString(obj.targetAudienceEn);
  const targetAudienceMy = cleanString(obj.targetAudienceMy);
  const videoIdeasEn = cleanStringArray(obj.videoIdeasEn, 4);
  const videoIdeasMy = cleanStringArray(obj.videoIdeasMy, 4);
  const affiliateStrategyEn = cleanString(obj.affiliateStrategyEn);
  const affiliateStrategyMy = cleanString(obj.affiliateStrategyMy);
  const goNoGoReasonEn = cleanString(obj.goNoGoReasonEn);
  const goNoGoReasonMy = cleanString(obj.goNoGoReasonMy);
  const dataLimitationsEn = cleanStringArray(obj.dataLimitationsEn, 5);
  const dataLimitationsMy = cleanStringArray(obj.dataLimitationsMy, 5);

  if (
    !headlineEn ||
    !headlineMy ||
    !summaryEn ||
    !summaryMy ||
    strengthsEn.length === 0 ||
    strengthsMy.length === 0 ||
    risksEn.length === 0 ||
    risksMy.length === 0 ||
    !targetAudienceEn ||
    !targetAudienceMy ||
    videoIdeasEn.length === 0 ||
    videoIdeasMy.length === 0 ||
    !affiliateStrategyEn ||
    !affiliateStrategyMy ||
    !goNoGoReasonEn ||
    !goNoGoReasonMy
  ) {
    return null;
  }

  return {
    verdict,
    headlineEn,
    headlineMy,
    summaryEn,
    summaryMy,
    strengthsEn,
    strengthsMy,
    weaknessesEn,
    weaknessesMy,
    risksEn,
    risksMy,
    targetAudienceEn,
    targetAudienceMy,
    videoIdeasEn,
    videoIdeasMy,
    affiliateStrategyEn,
    affiliateStrategyMy,
    goNoGoReasonEn,
    goNoGoReasonMy,
    dataLimitationsEn,
    dataLimitationsMy,
    modelUsed,
    modulesSynthesized,
    generatedAt: new Date().toISOString(),
  };
}

function buildBurmeseAiError(code: AiAnalysisErrorCode): { en: string; my: string } {
  switch (code) {
    case 'MISSING_API_KEY':
      return {
        en: 'GEMINI_API_KEY is not configured on the server. AI Strategic Recommendation cannot run.',
        my: 'Server တွင် GEMINI_API_KEY မထည့်သွင်းရသေးသဖြင့် AI Strategic Recommendation ကို မလုပ်ဆောင်နိုင်ပါ။',
      };
    case 'TIMEOUT':
      return {
        en: 'Gemini AI request timed out. Please retry this module.',
        my: 'Gemini AI တုံ့ပြန်မှု အချိန်ကျော်လွန်သွားပါသည်။ ဤ Analysis ကို ပြန်လည်စမ်းသပ်ပါ။',
      };
    case 'RATE_LIMITED':
      return {
        en: 'Gemini AI rate limit or quota reached. Wait a moment and re-run.',
        my: 'Gemini AI အသုံးပြုမှု ကန့်သတ်ချက် ပြည့်နေပါသည်။ ခေတ္တစောင့်ပြီး ထပ်မံ Run ပါ။',
      };
    case 'AUTH_ERROR':
      return {
        en: 'Gemini API authentication failed. Verify GEMINI_API_KEY in server secrets.',
        my: 'Gemini API Key စစ်ဆေးမှု မအောင်မြင်ပါ။ Server Secrets ရှိ GEMINI_API_KEY ကို စစ်ဆေးပါ။',
      };
    case 'INVALID_RESPONSE':
      return {
        en: 'Gemini AI returned an incomplete response. Re-run this module to try again.',
        my: 'Gemini AI မှ မပြည့်စုံသော တုံ့ပြန်မှု ရရှိပါသည်။ ထပ်မံ Run ကြည့်ပါ။',
      };
    default:
      return {
        en: 'Gemini AI service is temporarily unavailable. Other Deep Dive modules are unaffected.',
        my: 'Gemini AI ဝန်ဆောင်မှု ယာယီမရရှိနိုင်ပါ။ အခြား Deep Dive Analysis များကို ထိခိုက်မှုမရှိပါ။',
      };
  }
}

/**
 * Generates an on-demand Deep Dive AI Strategic Recommendation using Gemini strictly server-side.
 * - Uses 0 Kalodata credits.
 * - Synthesizes verified Product Data + completed Deep Dive module results.
 * - Never fabricates missing data; returns an explicit error on upstream/auth/key failure
 *   so the UI can display an honest error & Re-run action without affecting other modules.
 */
export async function generateDeepDiveAiStrategy(params: {
  product: ResearchProduct;
  evaluation?: OpportunityEvaluation | null;
  completedModules?: readonly DeepDiveCompletedModuleDigest[];
  salesWeightPct?: number;
}): Promise<DeepDiveAiStrategyResponse> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    const msg = buildBurmeseAiError('MISSING_API_KEY');
    return {
      ok: false,
      code: 'MISSING_API_KEY',
      error: msg.en,
      errorMy: msg.my,
    };
  }

  const evaluation =
    params.evaluation ??
    evaluateProductOpportunity(params.product, {
      salesWeightPct: params.salesWeightPct ?? 50,
    });
  const completedModules = (params.completedModules ?? []).filter(
    (m) => m.analysisId !== 'ai-strategic-recommendation'
  );
  const modulesSynthesized = completedModules.map((m) => m.analysisId);

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const prompt = buildDeepDiveAiPrompt(params.product, evaluation, completedModules);
  let lastCode: AiAnalysisErrorCode = 'UPSTREAM_ERROR';

  for (let modelIdx = 0; modelIdx < DEEP_DIVE_AI_MODELS.length; modelIdx += 1) {
    const modelName = DEEP_DIVE_AI_MODELS[modelIdx];
    const maxAttempts = modelIdx === 0 ? 2 : 1;
    const timeoutMs = modelIdx === 0 ? PRIMARY_TIMEOUT_MS : BACKUP_TIMEOUT_MS;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const config =
          modelName === DEEP_DIVE_AI_BACKUP_MODEL
            ? {
                systemInstruction: SYSTEM_INSTRUCTION,
                responseMimeType: 'application/json',
                responseSchema: DEEP_DIVE_STRATEGY_SCHEMA,
                thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              }
            : {
                systemInstruction: SYSTEM_INSTRUCTION,
                responseMimeType: 'application/json',
                responseSchema: DEEP_DIVE_STRATEGY_SCHEMA,
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
          lastCode = 'INVALID_RESPONSE';
          break;
        }

        const validated = validateDeepDiveStrategyJson(rawText, modelName, modulesSynthesized);
        if (validated) {
          return { ok: true, strategy: validated };
        }

        lastCode = 'INVALID_RESPONSE';
        break;
      } catch (err) {
        const classified = classifyGeminiError(err);
        lastCode = classified.code;

        if (classified.code === 'AUTH_ERROR' || classified.code === 'RATE_LIMITED') {
          const msg = buildBurmeseAiError(classified.code);
          return { ok: false, code: classified.code, error: msg.en, errorMy: msg.my };
        }
        if (classified.code === 'TIMEOUT' || !classified.retryable) {
          break;
        }
        if (attempt < maxAttempts) {
          await sleep(500 * attempt);
        }
      }
    }
  }

  const msg = buildBurmeseAiError(lastCode);
  return {
    ok: false,
    code: lastCode,
    error: msg.en,
    errorMy: msg.my,
  };
}
