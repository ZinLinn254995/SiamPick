import crypto from 'node:crypto';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type { AiAnalysisErrorCode, ResearchProduct } from '../src/types/product.ts';
import type {
  DeepDiveAnalysisId,
  DeepDiveCompetitorVideoSample,
  DeepDiveCompletedModuleDigest,
  DeepDiveGeminiTokenUsage,
  DeepDivePolicyGuardItem,
  DeepDiveScriptScene,
  DeepDiveVideoConcept,
  DeepDiveVideoCreativeBlueprint,
  DeepDiveVideoCreativeOptions,
  DeepDiveVideoHook,
  DeepDiveVideoSeoTitle,
} from '../src/types/deepDive.ts';
import {
  DEFAULT_SPENDING_LIMIT_CREDITS,
  KALODATA_CREDITS_PER_100_ROWS,
  MAX_SPENDING_LIMIT_CREDITS,
  MIN_SPENDING_LIMIT_CREDITS,
} from '../src/utils/kalodataPricing.ts';
import { getCategoryDefinition } from '../src/utils/categoryRegistry.ts';
import { normalizeDeepDiveVideoCreativeOptions } from '../src/utils/deepDiveRegistry.ts';
import { getCanonicalProductId } from '../src/utils/scoring.ts';
import { extractDeterministicSearchKeyword } from '../src/utils/sameProductMatcher.ts';
import { classifyGeminiError } from './aiProductAnalysis.ts';
import {
  fetchKalodataCreditBalance,
  fetchKalodataVideoRank,
  type KalodataVideoRankRequest,
} from './kalodataService.ts';
import { parseKalodataVideoRankItem } from './kalodataAnalysis.ts';
import { getResearchQuotaStatus } from './researchService.ts';
import {
  BudgetStorageUnavailableError,
  getDefaultBudgetLedger,
  PersistentBudgetLedger,
  resolveAuthoritativeBudgetScope,
  type BudgetScopeSnapshot,
} from './budgetLedgerService.ts';
import {
  fetchProxiedImageBuffer,
  isProxyableImageUrl,
  normalizeExternalImageUrl,
} from './imageRetriever.ts';

export const VIDEO_CREATIVE_COMPETITOR_SCAN_CREDITS = KALODATA_CREDITS_PER_100_ROWS; // 0.1 cr per video/rank call

const COMPETITOR_VIDEO_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const COMPETITOR_VIDEO_CACHE_MAX_ENTRIES = 200;
const MAX_COMPETITOR_VIDEOS = 8;
const MAX_VISION_IMAGE_BYTES = 2 * 1024 * 1024; // 2MB cap
const VIDEO_CREATIVE_PRIMARY_MODEL = 'gemini-4-hydrogen';
const VIDEO_CREATIVE_BACKUP_MODEL = 'gemini-3.1-flash-lite';
const VIDEO_CREATIVE_MODELS: readonly string[] = [
  VIDEO_CREATIVE_PRIMARY_MODEL,
  VIDEO_CREATIVE_BACKUP_MODEL,
];
const PRIMARY_TIMEOUT_MS = 45_000;
const BACKUP_TIMEOUT_MS = 30_000;

const GEMINI_SUPPORTED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

interface CachedCompetitorVideoEntry {
  keywordUsed: string;
  videos: DeepDiveCompetitorVideoSample[];
  storedAtMs: number;
}

const competitorVideoCache = new Map<string, CachedCompetitorVideoEntry>();

export function clearDeepDiveVideoCreativeCache(): void {
  competitorVideoCache.clear();
}

export class DeepDiveVideoCreativeApiError extends Error {
  status: number;
  code: string;
  errorMy: string;
  budgetSnapshot?: BudgetScopeSnapshot;

  constructor(
    status: number,
    code: string,
    message: string,
    errorMy: string,
    budgetSnapshot?: BudgetScopeSnapshot
  ) {
    super(message);
    this.name = 'DeepDiveVideoCreativeApiError';
    this.status = status;
    this.code = code;
    this.errorMy = errorMy;
    this.budgetSnapshot = budgetSnapshot;
  }
}

export interface DeepDiveVideoCreativeTestOverrides {
  fetchCreditBalance?: () => Promise<{ ok: boolean; balance: number | null }>;
  fetchVideoRank?: (params: KalodataVideoRankRequest) => Promise<{
    ok: boolean;
    httpStatus: number | null;
    items: Record<string, unknown>[];
    upstreamCode?: string;
    error?: string;
    errorMy?: string;
  }>;
  generateCreativeJson?: (params: {
    prompt: string;
    options: DeepDiveVideoCreativeOptions;
    competitorVideos: DeepDiveCompetitorVideoSample[];
    usedProductImage: boolean;
  }) => Promise<{
    rawText: string;
    modelUsed: string;
    tokenUsage?: DeepDiveGeminiTokenUsage | null;
  }>;
  budgetLedger?: PersistentBudgetLedger;
  budgetScopeKey?: string;
}

export interface GenerateDeepDiveVideoCreativeParams {
  product: ResearchProduct;
  options?: Partial<DeepDiveVideoCreativeOptions> | null;
  completedModules?: readonly DeepDiveCompletedModuleDigest[];
  spendingLimitCredits?: number;
  userConfirmedPaidExecution?: boolean;
  forceRefresh?: boolean;
  idempotencyKey?: string;
  testOverrides?: DeepDiveVideoCreativeTestOverrides;
}

export interface DeepDiveVideoCreativeServiceResult {
  ok: true;
  blueprint: DeepDiveVideoCreativeBlueprint;
  kalodataApiCallsMade: number;
  kalodataCreditsUsed: number;
  reusedCompetitorCache: boolean;
  aiApiCallsMade: number;
  liveBalanceAfter: number | null;
  budgetSnapshot?: BudgetScopeSnapshot | null;
}

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

function cleanStringArray(val: unknown, maxItems = 8): string[] {
  if (!Array.isArray(val)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of val) {
    if (typeof item !== 'string') continue;
    const t = item.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= maxItems) break;
  }
  return out;
}

function toFiniteNumber(val: unknown): number | null {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string' && val.trim() !== '') {
    const parsed = Number(val);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function isDeterministicNonBilledError(
  httpStatus: number | null,
  upstreamCode?: string
): boolean {
  if (httpStatus === 400 || httpStatus === 401 || httpStatus === 402 || httpStatus === 403 || httpStatus === 404) {
    return true;
  }
  const code = (upstreamCode ?? '').toUpperCase();
  return (
    code === 'MISSING_API_KEY' ||
    code === 'INVALID_API_KEY' ||
    code === 'INSUFFICIENT_CREDITS' ||
    code === 'BAD_REQUEST'
  );
}

export function normalizeVideoCreativeOptions(
  raw?: Partial<DeepDiveVideoCreativeOptions> | null
): DeepDiveVideoCreativeOptions {
  return normalizeDeepDiveVideoCreativeOptions(raw);
}

function extractHashtagsFromCaption(caption: string): string[] {
  const matches = caption.match(/#[\p{L}\p{N}\p{M}_]+/gu);
  if (!matches) return [];
  return Array.from(new Set(matches.map((m) => m.trim()))).slice(0, 12);
}

function normalizeHashtagList(raw: unknown, maxItems = 5): string[] {
  return cleanStringArray(raw, maxItems).map((tag) =>
    tag.startsWith('#') ? tag : `#${tag.replace(/^#+/, '')}`
  );
}

function parseCompetitorVideoSamples(
  items: readonly Record<string, unknown>[]
): DeepDiveCompetitorVideoSample[] {
  const results: DeepDiveCompetitorVideoSample[] = [];
  const seenIds = new Set<string>();

  for (const raw of items) {
    const parsed = parseKalodataVideoRankItem(raw, 1);
    if (!parsed || seenIds.has(parsed.videoId)) continue;
    seenIds.add(parsed.videoId);

    const caption = (parsed.caption ?? parsed.title ?? '').trim();
    const captionTags = caption ? extractHashtagsFromCaption(caption) : [];
    const combinedTags = Array.from(
      new Set([
        ...parsed.hashtags.map((t) => (t.startsWith('#') ? t : `#${t.replace(/^#+/, '')}`)),
        ...captionTags,
      ])
    ).slice(0, 10);

    const rawDuration = toFiniteNumber(
      raw.duration ?? raw.video_duration ?? raw.duration_sec ?? raw.video_time ?? raw.length
    );
    const durationSec =
      rawDuration !== null && rawDuration > 0
        ? rawDuration > 1000
          ? Math.round(rawDuration / 1000)
          : Math.round(rawDuration)
        : null;

    results.push({
      videoId: parsed.videoId,
      caption: caption.slice(0, 260) || '(No caption returned)',
      hashtags: combinedTags,
      creatorName: parsed.creatorName,
      creatorHandle: parsed.creatorHandle,
      videoUrl: parsed.videoUrl || `https://www.tiktok.com/video/${parsed.videoId}`,
      revenueThb: parsed.revenueThb,
      salesVolume: parsed.salesVolume,
      views: parsed.views,
      durationSec,
      publishDate: parsed.publishDate,
    });

    if (results.length >= MAX_COMPETITOR_VIDEOS) break;
  }

  return results;
}

const VIDEO_CREATIVE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    competitorTeardownSummaryEn: { type: Type.STRING },
    competitorTeardownSummaryMy: { type: Type.STRING },
    winningPatternsEn: { type: Type.ARRAY, items: { type: Type.STRING } },
    winningPatternsMy: { type: Type.ARRAY, items: { type: Type.STRING } },
    creativeGapEn: { type: Type.STRING },
    creativeGapMy: { type: Type.STRING },
    concepts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          titleEn: { type: Type.STRING },
          titleMy: { type: Type.STRING },
          formatLabel: { type: Type.STRING },
          angleSummaryEn: { type: Type.STRING },
          angleSummaryMy: { type: Type.STRING },
          whyItConvertsEn: { type: Type.STRING },
          whyItConvertsMy: { type: Type.STRING },
        },
        required: [
          'id',
          'titleEn',
          'titleMy',
          'formatLabel',
          'angleSummaryEn',
          'angleSummaryMy',
          'whyItConvertsEn',
          'whyItConvertsMy',
        ],
      },
    },
    hooks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          hookText: { type: Type.STRING },
          meaningMy: { type: Type.STRING },
          onScreenText: { type: Type.STRING },
          visualActionEn: { type: Type.STRING },
          visualActionMy: { type: Type.STRING },
          hookType: { type: Type.STRING },
          aiVideoPromptEn: { type: Type.STRING },
        },
        required: [
          'id',
          'hookText',
          'meaningMy',
          'onScreenText',
          'visualActionEn',
          'visualActionMy',
          'hookType',
        ],
      },
    },
    scriptTitle: { type: Type.STRING },
    scriptScenes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          sceneNumber: { type: Type.INTEGER },
          timeRange: { type: Type.STRING },
          phaseLabel: { type: Type.STRING },
          voiceover: { type: Type.STRING },
          voiceoverMy: { type: Type.STRING },
          onScreenText: { type: Type.STRING },
          shotDirectionEn: { type: Type.STRING },
          shotDirectionMy: { type: Type.STRING },
          aiVideoPromptEn: { type: Type.STRING },
        },
        required: [
          'sceneNumber',
          'timeRange',
          'phaseLabel',
          'voiceover',
          'voiceoverMy',
          'onScreenText',
          'shotDirectionEn',
          'shotDirectionMy',
        ],
      },
    },
    seoPack: {
      type: Type.OBJECT,
      properties: {
        titles: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              style: { type: Type.STRING },
              labelEn: { type: Type.STRING },
              labelMy: { type: Type.STRING },
              titleText: { type: Type.STRING },
              meaningMy: { type: Type.STRING },
            },
            required: ['style', 'labelEn', 'labelMy', 'titleText', 'meaningMy'],
          },
        },
        searchKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
        hashtagsBroad: { type: Type.ARRAY, items: { type: Type.STRING } },
        hashtagsNiche: { type: Type.ARRAY, items: { type: Type.STRING } },
        hashtagsBuyerIntent: { type: Type.ARRAY, items: { type: Type.STRING } },
        captionTemplate: { type: Type.STRING },
      },
      required: [
        'titles',
        'searchKeywords',
        'hashtagsBroad',
        'hashtagsNiche',
        'hashtagsBuyerIntent',
        'captionTemplate',
      ],
    },
    policyGuards: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          riskyClaim: { type: Type.STRING },
          reasonEn: { type: Type.STRING },
          reasonMy: { type: Type.STRING },
          safeAlternative: { type: Type.STRING },
        },
        required: ['riskyClaim', 'reasonEn', 'reasonMy', 'safeAlternative'],
      },
    },
    dataLimitationsEn: { type: Type.ARRAY, items: { type: Type.STRING } },
    dataLimitationsMy: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: [
    'competitorTeardownSummaryEn',
    'competitorTeardownSummaryMy',
    'winningPatternsEn',
    'winningPatternsMy',
    'creativeGapEn',
    'creativeGapMy',
    'concepts',
    'hooks',
    'scriptTitle',
    'scriptScenes',
    'seoPack',
    'policyGuards',
    'dataLimitationsEn',
    'dataLimitationsMy',
  ],
};

const SYSTEM_INSTRUCTION = `You are a senior Thailand TikTok Shop Performance Creative Director & TikTok SEO Specialist generating Module #09 (AI Ad Video Creative Studio) for SiamPick Deep Dive Analysis.

STRICT SCOPE BOUNDARY (AD VIDEO PRODUCTION & SEO ONLY):
- Assume the affiliate has ALREADY decided to create an ad video for this product.
- DO NOT repeat Module #08 business Go/No-Go verdicts, margin analysis, or general GMV recaps.
- Focus 100% on hands-on ad video creation: competitor video pattern teardown, distinct video concepts, scroll-stopping 3-second hooks, timed scene-by-scene shooting script, TikTok search SEO titles/keywords/hashtags, and TikTok Shop ad policy compliance guards.

ABSOLUTE INTEGRITY RULES:
1. NEVER FABRICATE COMPETITOR DATA: If competitorVideos is empty or competitorScanStatus is "skipped-zero-credit" or "no-videos-found", NEVER invent fake TikTok video links, creator handles, view counts, or video GMV. Explicitly state in competitorTeardownSummaryEn/My that live competitor videos were not scanned (or none returned), and base creative patterns on verified product attributes and category creative mechanics.
2. NEVER FABRICATE PRODUCT CLAIMS: Never invent Thai FDA numbers, clinical percentages, certifications, or ingredients not present in the provided product title/data/reviews.
3. NATURAL LOCALIZATION:
   - "th-with-my": Write spoken hooks, voiceover, on-screen text, titles, keywords, hashtags, and captionTemplate in natural, colloquial Thai TikTok Shop style (ภาษาพูด TikTok ไทยจริง ไม่แข็งทื่อ), AND provide accurate natural Burmese translation in meaningMy / voiceoverMy so a Myanmar affiliate creator understands every word clearly.
   - "my": Write spoken hooks, voiceover, on-screen text, titles, keywords, hashtags, and captionTemplate in natural Burmese for Myanmar buyers living in Thailand (mixing Thai product/search terms where buyers actually search them), and set meaningMy / voiceoverMy to concise delivery/tone notes in Burmese.
   - "my-th-mix": Write spoken hooks, voiceover, on-screen text, titles, and captionTemplate in natural conversational Burmese blended organically with high-converting Thai TikTok Shop market terms (such as 1แถม2, ตะกร้าเหลือง, ของแท้, ส่งไว, โปรโมชั่น, Thai brand/product keywords) the way Myanmar creators in Thailand actually speak on TikTok. Put delivery/pronunciation guidance in meaningMy / voiceoverMy.
   - "th-with-en": Write spoken hooks, voiceover, on-screen text, titles, keywords, hashtags, and captionTemplate in natural Thai TikTok Shop style, AND provide clear, natural English translation in meaningMy / voiceoverMy so international/English-speaking creators understand every line accurately.
4. PRODUCTION STYLE FIDELITY:
   - "ugc-face": Authentic creator talking-to-camera / reaction / demo shots.
   - "faceless-hands": Zero face required — crisp hands-only unboxing, texture close-up, comparison, POV, and bold on-screen text overlays.
   - "ai-video": Include detailed, copy-ready English visual prompts in aiVideoPromptEn for EVERY scene AND EVERY hook (tailored to the selected aiVideoTool: general-9-16 / veo-kling-cinematic / heygen-avatar / image-to-video), specifying subject, lighting, camera movement, vertical 9:16 framing, and product consistency.
   - "unboxing-first-try": Parcel arrival, crisp seal tear / packaging reveal, immediate first-impression texture/detail test, and authentic first-try reaction.
   - "voiceover-broll": Fast-cut product B-roll, macro shots, lifestyle inserts, and smooth narrator voiceover with bold kinetic captions.
   - "before-after-demo": Real-world usage comparison / practical live demonstration / texture or performance test — strictly TikTok Shop policy-safe (never fabricate unrealistic medical or instant miracle claims).
   - "greenscreen-reaction": Creator reacting in front of green-screen product page, real review screenshots, or price comparison overlay with engaging commentary.
5. MODULAR HOOK A/B ARCHITECTURE (CRITICAL):
   - Design ALL 5 hooks (h1..h5) as modular 0–3s opening variations that plug cleanly into Scene 1 right before Scene 2 of scriptScenes, so the affiliate creator films Scene 2–End ONCE and swaps only the first 3 seconds (Hook #1..#5) in CapCut to publish 5 A/B test ad videos.
   - Scene 1 of scriptScenes MUST match Hook #1 (h1), and Hooks #2..#5 (h2..h5) must each transition naturally into Scene 2 without awkward repetition.
6. CREATIVE CONTROLS & CUSTOM CREATOR BRIEF:
   - Strictly adapt voice, pacing, structure, and hooks to the requested tone, script framework, target buyer persona, selling focuses, CTA style, and AI video tool.
   - When customSuggestion (Creator's Custom Brief) is provided, treat it as the HIGHEST-PRIORITY creative direction across concepts, 3-second hooks, timed script scenes, shot directions, AI video prompts, and SEO pack — while STILL obeying all TikTok Shop policy safety rules and NEVER fabricating product facts or fake competitor stats.
7. TIKTOK SHOP COMPLIANCE: Flag realistic category-specific risky/banned claims (especially for supplements, health, beauty/skincare, electronics, or "before/after" exaggerations) and provide safe compliant wording.
8. Return valid JSON strictly matching the exact schema.`;

export function buildDeepDiveVideoCreativePrompt(params: {
  product: ResearchProduct;
  options: DeepDiveVideoCreativeOptions;
  completedModules: readonly DeepDiveCompletedModuleDigest[];
  competitorScanStatus: 'scanned' | 'skipped-zero-credit' | 'no-videos-found';
  competitorKeywordUsed: string | null;
  competitorVideos: readonly DeepDiveCompetitorVideoSample[];
  usedProductImage: boolean;
}): string {
  const { product, completedModules, competitorScanStatus, competitorKeywordUsed, competitorVideos } =
    params;
  const options = normalizeDeepDiveVideoCreativeOptions(params.options);
  const categoryDef = getCategoryDefinition(product.category);

  // Only pass buyer/product/review/video context — never business verdict noise from Module #08
  const relevantDigests = completedModules
    .filter(
      (m) =>
        m.analysisId !== 'ai-strategic-recommendation' &&
        m.analysisId !== 'ad-video-creative-blueprint'
    )
    .map((m) => ({
      analysisId: m.analysisId,
      headline: m.headlineEn,
      summary: m.summaryEn,
      metrics: m.metrics.slice(0, 6),
    }));

  const durationGuidance =
    options.duration === '7-12s'
      ? '3 ultra-punchy loopable scenes totaling 7-12 seconds (0-2.5s Visual/Price Hook, 2.5-7s Fast Demo/Proof, 7-10s Instant Yellow Basket CTA).'
      : options.duration === '15s'
        ? '4 punchy scenes totaling 15 seconds (e.g., 0-3s Hook, 3-7s Problem/Demo, 7-12s Proof/Benefit, 12-15s Yellow Basket CTA).'
        : options.duration === '45-60s'
          ? '5 detailed scenes totaling 45-60 seconds (e.g., 0-3s Hook, 3-12s Relatable Pain/Story, 12-30s Close-up Demo & Usage, 30-45s Objection Handling / Social Proof, 45-55s Value Offer & Yellow Basket CTA).'
          : options.duration === '60-90s'
            ? '6 thorough scenes totaling 60-90 seconds (e.g., 0-3s Hook, 3-15s Story/Context, 15-35s Unboxing & Detailed Demo, 35-55s Deep Value/Comparison Proof, 55-70s Objection Busting & Reviews, 70-85s Strong Yellow Basket CTA).'
            : '4-5 crisp scenes totaling ~30 seconds (e.g., 0-3s Hook, 3-10s Pain/Solution Demo, 10-22s Texture/Proof/Value, 22-30s Strong Yellow Basket CTA).';

  const inputBundle = {
    product: {
      canonicalProductId: getCanonicalProductId(product),
      name: product.name,
      category: categoryDef.labelEn,
      subCategory: product.subCategory,
      shopName: product.shopName,
      priceThb: product.priceThb,
      commissionRatePct: product.commissionVerified ? product.commissionRate : null,
      reviewCount: product.reviewCount ?? product.kalodataMetrics?.productReviewCount ?? null,
      reviewPositiveThemes:
        product.kalodataMetrics?.reviewInsight?.positivePoints
          ?.slice(0, 5)
          .map((p) => p.point) ?? [],
      reviewPainPoints:
        product.kalodataMetrics?.reviewInsight?.painPoints
          ?.slice(0, 5)
          .map((p) => p.point) ?? [],
      myanmarMatchedVideoCount: product.myanmarLanguage?.matchedVideoCount ?? 0,
      hasAttachedProductPhoto: params.usedProductImage,
    },
    creativeConfig: {
      scriptLanguage: options.scriptLanguage,
      videoStyle: options.videoStyle,
      targetDuration: options.duration,
      durationGuidance,
      tone: options.tone ?? 'friendly-bestie',
      scriptFramework: options.framework ?? 'auto',
      targetBuyerPersona: options.targetAudience ?? 'auto',
      keySellingFocuses: options.sellingFocuses ?? [],
      ctaStyle: options.ctaStyle ?? 'urgent-basket',
      aiVideoTool: options.videoStyle === 'ai-video' ? (options.aiVideoTool ?? 'general-9-16') : null,
      creatorCustomSuggestion: options.customSuggestion ?? null,
    },
    competitorScan: {
      status: competitorScanStatus,
      keywordUsed: competitorKeywordUsed,
      videos: competitorVideos.map((v) => ({
        caption: v.caption,
        hashtags: v.hashtags,
        creatorHandle: v.creatorHandle,
        revenueThb: v.revenueThb,
        salesVolume: v.salesVolume,
        views: v.views,
        durationSec: v.durationSec,
      })),
    },
    completedDeepDiveInsights: relevantDigests,
  };

  const customSuggestionBlock = options.customSuggestion
    ? `\nCREATOR'S CUSTOM SUGGESTION / BRIEF (HIGHEST CREATIVE PRIORITY — APPLY THROUGHOUT CONCEPTS, HOOKS, SCRIPT, SHOTS, AI PROMPTS & SEO WHILE STAYING POLICY-SAFE):\n"""\n${options.customSuggestion}\n"""\n`
    : '';

  const translationFieldNote =
    options.scriptLanguage === 'th-with-en'
      ? 'clear natural English translation'
      : options.scriptLanguage === 'my' || options.scriptLanguage === 'my-th-mix'
        ? 'concise Burmese delivery/tone notes'
        : 'accurate natural Burmese translation';

  return `Create a complete, high-converting Thailand TikTok Shop Ad Video Creative & SEO Blueprint strictly from the verified JSON below${params.usedProductImage ? ' and the attached product image' : ''}.
${customSuggestionBlock}
OUTPUT REQUIREMENTS:
- competitorTeardownSummaryEn / My: Summarize how top competitor videos sell this product (or honestly explain if competitor video scan was skipped/empty without inventing any videos).
- winningPatternsEn / My (3-4 bullet takeaways): Common winning hooks, visual proofs, hashtag/SEO patterns, or category-proven creative structures.
- creativeGapEn / My: Specific angle to stand out from lookalike affiliate clips.
- concepts: Exactly 3 distinct ad video concepts (id: "c1".."c3", distinct formatLabel matching the chosen style/tone/framework).
- hooks: Exactly 5 modular scroll-stopping 3-second hooks (id: "h1".."h5") that can EACH drop cleanly into Scene 1 (0–3s) right before Scene 2 of scriptScenes for A/B testing! Each hook must include hookText (in target scriptLanguage & tone), meaningMy (${translationFieldNote}), onScreenText (short punchy 0–3s TikTok text overlay), visualActionEn/My (exact camera action in first 3 seconds), hookType (e.g., "Curiosity", "Pain Callout", "Price Shock", "Visual Proof", "Myth Buster")${options.videoStyle === 'ai-video' ? `, and aiVideoPromptEn (detailed English 9:16 visual prompt tailored for ${options.aiVideoTool ?? 'general-9-16'})` : ''}.
- scriptTitle: Short name of the main recommended shooting script.
- scriptScenes: ${durationGuidance} Follow scriptFramework="${options.framework ?? 'auto'}", tone="${options.tone ?? 'friendly-bestie'}", targetBuyerPersona="${options.targetAudience ?? 'auto'}", ctaStyle="${options.ctaStyle ?? 'urgent-basket'}"${options.sellingFocuses && options.sellingFocuses.length > 0 ? `, emphasizing selling focuses: ${options.sellingFocuses.join(', ')}` : ''}. Scene 1 MUST correspond to Hook #1 (h1), and Scene 2..N MUST act as a clean reusable Body + CTA that works smoothly after ANY of the 5 hooks (h1..h5). Each scene has sceneNumber (1..N), timeRange, phaseLabel (Hook / Demo / Proof / CTA), voiceover (in target scriptLanguage), voiceoverMy (${translationFieldNote}), onScreenText (short bold TikTok text overlay), shotDirectionEn/My, and aiVideoPromptEn (${options.videoStyle === 'ai-video' ? `REQUIRED detailed English 9:16 vertical video generation prompt tailored for ${options.aiVideoTool ?? 'general-9-16'} for every scene` : 'optional short English visual prompt for AI B-roll'}).
- seoPack:
  - titles: Exactly 3 title/caption options with style "search-seo", "curiosity-hook", and "direct-sell".
  - searchKeywords: 6-10 real TikTok search phrases buyers actually type when looking for this product.
  - hashtagsBroad: 2 broad TikTok Shop TH tags (e.g. #รีวิวบิวตี้ / #ป้ายยาTikTok).
  - hashtagsNiche: 2-3 specific product/category tags.
  - hashtagsBuyerIntent: 2-3 buying/promo intent tags (e.g. #ของดีบอกต่อ / #พิกัดตะกร้าเหลือง).
  - captionTemplate: Complete ready-to-paste TikTok caption combining hook line + key benefit + CTA matching ctaStyle + clean hashtags (5-8 tags max, spam-safe).
- policyGuards: 3-4 concrete TikTok Shop ad compliance warnings for ${categoryDef.labelEn} (riskyClaim -> reasonEn/My -> safeAlternative in target scriptLanguage).
- dataLimitationsEn / My: 1-3 honest notes about any missing inputs (e.g. skipped competitor scan, no review insights yet, or no product photo).

Verified Input JSON:
${JSON.stringify(inputBundle)}`;
}

export function validateDeepDiveVideoCreativeJson(params: {
  rawText: string;
  modelUsed: string;
  optionsUsed: DeepDiveVideoCreativeOptions;
  competitorScanStatus: 'scanned' | 'skipped-zero-credit' | 'no-videos-found';
  competitorKeywordUsed: string | null;
  competitorVideos: DeepDiveCompetitorVideoSample[];
  usedProductImage: boolean;
  modulesReferenced: DeepDiveAnalysisId[];
}): DeepDiveVideoCreativeBlueprint | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonObject(params.rawText));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }
  const obj = parsed as Record<string, unknown>;

  const competitorTeardownSummaryEn = cleanString(obj.competitorTeardownSummaryEn);
  const competitorTeardownSummaryMy = cleanString(obj.competitorTeardownSummaryMy);
  const winningPatternsEn = cleanStringArray(obj.winningPatternsEn, 5);
  const winningPatternsMy = cleanStringArray(obj.winningPatternsMy, 5);
  const creativeGapEn = cleanString(obj.creativeGapEn);
  const creativeGapMy = cleanString(obj.creativeGapMy);
  const scriptTitle = cleanString(obj.scriptTitle);

  const rawConcepts = Array.isArray(obj.concepts) ? obj.concepts : [];
  const concepts: DeepDiveVideoConcept[] = rawConcepts
    .filter((c): c is Record<string, unknown> => Boolean(c) && typeof c === 'object')
    .slice(0, 4)
    .map((c, idx) => ({
      id: cleanString(c.id) ?? `c${idx + 1}`,
      titleEn: cleanString(c.titleEn) ?? '',
      titleMy: cleanString(c.titleMy) ?? '',
      formatLabel: cleanString(c.formatLabel) ?? 'Short Ad',
      angleSummaryEn: cleanString(c.angleSummaryEn) ?? '',
      angleSummaryMy: cleanString(c.angleSummaryMy) ?? '',
      whyItConvertsEn: cleanString(c.whyItConvertsEn) ?? '',
      whyItConvertsMy: cleanString(c.whyItConvertsMy) ?? '',
    }))
    .filter((c) => c.titleEn && c.titleMy && c.angleSummaryEn && c.angleSummaryMy);

  const rawHooks = Array.isArray(obj.hooks) ? obj.hooks : [];
  const hooks: DeepDiveVideoHook[] = rawHooks
    .filter((h): h is Record<string, unknown> => Boolean(h) && typeof h === 'object')
    .slice(0, 6)
    .map((h, idx) => ({
      id: cleanString(h.id) ?? `h${idx + 1}`,
      hookText: cleanString(h.hookText) ?? '',
      meaningMy: cleanString(h.meaningMy) ?? '',
      onScreenText: cleanString(h.onScreenText),
      visualActionEn: cleanString(h.visualActionEn) ?? '',
      visualActionMy: cleanString(h.visualActionMy) ?? '',
      hookType: cleanString(h.hookType) ?? 'Hook',
      aiVideoPromptEn: cleanString(h.aiVideoPromptEn),
    }))
    .filter((h) => h.hookText && h.meaningMy);

  const rawScenes = Array.isArray(obj.scriptScenes) ? obj.scriptScenes : [];
  const scriptScenes: DeepDiveScriptScene[] = rawScenes
    .filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === 'object')
    .slice(0, 7)
    .map((s, idx) => ({
      sceneNumber:
        typeof s.sceneNumber === 'number' && Number.isFinite(s.sceneNumber)
          ? Math.max(1, Math.round(s.sceneNumber))
          : idx + 1,
      timeRange: cleanString(s.timeRange) ?? `Scene ${idx + 1}`,
      phaseLabel: cleanString(s.phaseLabel) ?? `Part ${idx + 1}`,
      voiceover: cleanString(s.voiceover) ?? '',
      voiceoverMy: cleanString(s.voiceoverMy) ?? '',
      onScreenText: cleanString(s.onScreenText) ?? '',
      shotDirectionEn: cleanString(s.shotDirectionEn) ?? '',
      shotDirectionMy: cleanString(s.shotDirectionMy) ?? '',
      aiVideoPromptEn: cleanString(s.aiVideoPromptEn),
    }))
    .filter((s) => s.voiceover && s.shotDirectionEn);

  const rawSeo =
    obj.seoPack && typeof obj.seoPack === 'object' && !Array.isArray(obj.seoPack)
      ? (obj.seoPack as Record<string, unknown>)
      : null;

  const rawTitles = Array.isArray(rawSeo?.titles) ? rawSeo.titles : [];
  const titles: DeepDiveVideoSeoTitle[] = rawTitles
    .filter((t): t is Record<string, unknown> => Boolean(t) && typeof t === 'object')
    .slice(0, 4)
    .map((t, idx) => {
      const rawStyle = cleanString(t.style);
      const style: DeepDiveVideoSeoTitle['style'] =
        rawStyle === 'search-seo' || rawStyle === 'curiosity-hook' || rawStyle === 'direct-sell'
          ? rawStyle
          : idx === 0
            ? 'search-seo'
            : idx === 1
              ? 'curiosity-hook'
              : 'direct-sell';
      return {
        style,
        labelEn: cleanString(t.labelEn) ?? style,
        labelMy: cleanString(t.labelMy) ?? style,
        titleText: cleanString(t.titleText) ?? '',
        meaningMy: cleanString(t.meaningMy) ?? '',
      };
    })
    .filter((t) => t.titleText.length > 0);

  const searchKeywords = cleanStringArray(rawSeo?.searchKeywords, 12);
  const hashtagsBroad = normalizeHashtagList(rawSeo?.hashtagsBroad, 4);
  const hashtagsNiche = normalizeHashtagList(rawSeo?.hashtagsNiche, 4);
  const hashtagsBuyerIntent = normalizeHashtagList(rawSeo?.hashtagsBuyerIntent, 4);
  const captionTemplate = cleanString(rawSeo?.captionTemplate) ?? '';

  const rawGuards = Array.isArray(obj.policyGuards) ? obj.policyGuards : [];
  const policyGuards: DeepDivePolicyGuardItem[] = rawGuards
    .filter((g): g is Record<string, unknown> => Boolean(g) && typeof g === 'object')
    .slice(0, 6)
    .map((g) => ({
      riskyClaim: cleanString(g.riskyClaim) ?? '',
      reasonEn: cleanString(g.reasonEn) ?? '',
      reasonMy: cleanString(g.reasonMy) ?? '',
      safeAlternative: cleanString(g.safeAlternative) ?? '',
    }))
    .filter((g) => g.riskyClaim && g.safeAlternative);

  const dataLimitationsEn = cleanStringArray(obj.dataLimitationsEn, 5);
  const dataLimitationsMy = cleanStringArray(obj.dataLimitationsMy, 5);

  if (
    !competitorTeardownSummaryEn ||
    !competitorTeardownSummaryMy ||
    !creativeGapEn ||
    !creativeGapMy ||
    !scriptTitle ||
    concepts.length === 0 ||
    hooks.length === 0 ||
    scriptScenes.length === 0 ||
    titles.length === 0
  ) {
    return null;
  }

  return {
    optionsUsed: params.optionsUsed,
    competitorScanStatus: params.competitorScanStatus,
    competitorKeywordUsed: params.competitorKeywordUsed,
    competitorVideos: params.competitorVideos,
    competitorTeardownSummaryEn,
    competitorTeardownSummaryMy,
    winningPatternsEn,
    winningPatternsMy,
    creativeGapEn,
    creativeGapMy,
    concepts,
    hooks,
    scriptTitle,
    scriptScenes,
    seoPack: {
      titles,
      searchKeywords,
      hashtagsBroad,
      hashtagsNiche,
      hashtagsBuyerIntent,
      captionTemplate: captionTemplate || titles[0].titleText,
    },
    policyGuards,
    dataLimitationsEn,
    dataLimitationsMy,
    modelUsed: params.modelUsed,
    usedProductImage: params.usedProductImage,
    modulesReferenced: params.modulesReferenced,
    generatedAt: new Date().toISOString(),
  };
}

function buildBurmeseCreativeAiError(code: AiAnalysisErrorCode): {
  status: number;
  en: string;
  my: string;
} {
  switch (code) {
    case 'MISSING_API_KEY':
      return {
        status: 503,
        en: 'GEMINI_API_KEY is not configured on the server. AI Ad Video Creative Studio cannot run.',
        my: 'Server တွင် GEMINI_API_KEY မထည့်သွင်းရသေးသဖြင့် AI Ad Video Creative Studio ကို မလုပ်ဆောင်နိုင်ပါ။',
      };
    case 'TIMEOUT':
      return {
        status: 504,
        en: 'Gemini AI timed out while generating your video creative blueprint. Please retry.',
        my: 'Video Creative Blueprint ဖန်တီးစဉ် Gemini AI အချိန်ကျော်လွန်သွားပါသည်။ ပြန်လည်စမ်းသပ်ပါ။',
      };
    case 'RATE_LIMITED':
      return {
        status: 429,
        en: 'Gemini AI rate limit or quota reached. Wait briefly and retry.',
        my: 'Gemini AI အသုံးပြုမှု ကန့်သတ်ချက် ပြည့်နေပါသည်။ ခေတ္တစောင့်ပြီး ပြန်လည်စမ်းသပ်ပါ။',
      };
    case 'AUTH_ERROR':
      return {
        status: 502,
        en: 'Gemini API authentication failed. Verify GEMINI_API_KEY in server secrets.',
        my: 'Gemini API Key စစ်ဆေးမှု မအောင်မြင်ပါ။ Server Secrets ရှိ GEMINI_API_KEY ကို စစ်ဆေးပါ။',
      };
    case 'INVALID_RESPONSE':
      return {
        status: 502,
        en: 'Gemini AI returned an incomplete video blueprint. Re-run this module to try again.',
        my: 'Gemini AI မှ မပြည့်စုံသော Video Blueprint ရရှိပါသည်။ ထပ်မံ Run ကြည့်ပါ။',
      };
    default:
      return {
        status: 502,
        en: 'Gemini AI service is temporarily unavailable. Other Deep Dive modules are unaffected.',
        my: 'Gemini AI ဝန်ဆောင်မှု ယာယီမရရှိနိုင်ပါ။ အခြား Deep Dive Module များကို ထိခိုက်မှုမရှိပါ။',
      };
  }
}

async function tryFetchProductImageInlineData(
  product: ResearchProduct
): Promise<{ mimeType: string; data: string } | null> {
  const rawUrl = normalizeExternalImageUrl(product.imageOriginUrl ?? product.imageUrl ?? null);
  if (!rawUrl || !isProxyableImageUrl(rawUrl)) return null;
  try {
    const fetched = await withTimeout(fetchProxiedImageBuffer(rawUrl), 6_000);
    if (!fetched.ok) return null;
    const baseMime = fetched.mime.split(';')[0].trim().toLowerCase();
    if (!GEMINI_SUPPORTED_IMAGE_MIMES.has(baseMime)) return null;
    if (fetched.buffer.byteLength === 0 || fetched.buffer.byteLength > MAX_VISION_IMAGE_BYTES) {
      return null;
    }
    return {
      mimeType: baseMime,
      data: fetched.buffer.toString('base64'),
    };
  } catch {
    return null;
  }
}

/**
 * Generates Module #09 (AI Ad Video Creative Studio) blueprint strictly server-side.
 * - Default mode (includeCompetitorVideos: false): 0 Kalodata credits + 1 server-side Gemini AI call.
 * - Competitor Scan mode (includeCompetitorVideos: true): +0.1 Kalodata credit (24h cached -> 0 cr on hit),
 *   strictly guarded by PersistentBudgetLedger fail-closed atomic reservation + confirmation gate.
 */
export async function generateDeepDiveVideoCreativeBlueprint(
  params: GenerateDeepDiveVideoCreativeParams
): Promise<DeepDiveVideoCreativeServiceResult> {
  if (params.userConfirmedPaidExecution !== true) {
    throw new DeepDiveVideoCreativeApiError(
      400,
      'CONFIRMATION_REQUIRED',
      'Explicit user confirmation is required before running AI Ad Video Creative Studio. No API call was made.',
      'AI Ad Video Creative Studio မလုပ်ဆောင်မီ အသုံးပြုသူ၏ အတည်ပြုချက် လိုအပ်ပါသည်။ API မခေါ်ဆိုထားပါ။'
    );
  }

  const options = normalizeVideoCreativeOptions(params.options);
  const canonicalProductId = getCanonicalProductId(params.product);
  const completedModules = (params.completedModules ?? []).filter(
    (m) =>
      m.analysisId !== 'ai-strategic-recommendation' &&
      m.analysisId !== 'ad-video-creative-blueprint'
  );
  const modulesReferenced = completedModules.map((m) => m.analysisId);

  let competitorScanStatus: 'scanned' | 'skipped-zero-credit' | 'no-videos-found' =
    'skipped-zero-credit';
  let competitorKeywordUsed: string | null = null;
  let competitorVideos: DeepDiveCompetitorVideoSample[] = [];
  let kalodataApiCallsMade = 0;
  let kalodataCreditsUsed = 0;
  let reusedCompetitorCache = false;
  let liveBalanceAfter: number | null = null;
  let budgetSnapshot: BudgetScopeSnapshot | null = null;

  // Optional Step 1: Real Competitor Top-Selling Video Scan (+0.1 cr Kalodata video/rank, 24h cached)
  if (options.includeCompetitorVideos) {
    competitorKeywordUsed =
      options.customKeyword?.trim() ||
      extractDeterministicSearchKeyword({ name: params.product.name, brand: params.product.brand }) ||
      params.product.name.trim().slice(0, 48);

    const cacheKey = `${canonicalProductId}::${competitorKeywordUsed.toLowerCase()}`;
    const cachedEntry = !params.forceRefresh ? competitorVideoCache.get(cacheKey) : undefined;
    const isFresh =
      cachedEntry && Date.now() - cachedEntry.storedAtMs < COMPETITOR_VIDEO_CACHE_TTL_MS;

    if (isFresh && cachedEntry) {
      competitorVideos = cachedEntry.videos;
      competitorScanStatus = competitorVideos.length > 0 ? 'scanned' : 'no-videos-found';
      reusedCompetitorCache = true;
    } else {
      const quota = getResearchQuotaStatus();
      if (quota.paused) {
        throw new DeepDiveVideoCreativeApiError(
          423,
          'RESEARCH_PAUSED',
          quota.reason === 'manual'
            ? 'Paid Kalodata API calls are manually paused.'
            : 'Paid Kalodata API calls are currently paused.',
          quota.reason === 'manual'
            ? 'Kalodata Paid API ခေါ်ဆိုမှုကို ကိုယ်တိုင် ယာယီရပ်ဆိုင်းထားပါသည်။'
            : 'Kalodata Paid API ခေါ်ဆိုမှုကို ယာယီရပ်ဆိုင်းထားပါသည်။'
        );
      }

      const rawLimit =
        typeof params.spendingLimitCredits === 'number' &&
        Number.isFinite(params.spendingLimitCredits)
          ? params.spendingLimitCredits
          : DEFAULT_SPENDING_LIMIT_CREDITS;
      const spendingLimitCredits = Math.max(
        MIN_SPENDING_LIMIT_CREDITS,
        Math.min(MAX_SPENDING_LIMIT_CREDITS, rawLimit)
      );

      const ledger = params.testOverrides?.budgetLedger ?? getDefaultBudgetLedger();
      const scopeKey =
        params.testOverrides?.budgetScopeKey ?? resolveAuthoritativeBudgetScope().scopeKey;
      const idempotencyKey =
        params.idempotencyKey?.trim() ||
        `ddvc:${canonicalProductId}:${crypto
          .createHash('sha256')
          .update(`${competitorKeywordUsed}:${Date.now()}`)
          .digest('hex')
          .slice(0, 12)}`;

      const runLedgerStep = async <T>(
        fn: () => Promise<T>,
        fallbackEn: string,
        fallbackMy: string
      ): Promise<T> => {
        try {
          return await fn();
        } catch (err) {
          if (err instanceof BudgetStorageUnavailableError) {
            throw new DeepDiveVideoCreativeApiError(
              503,
              'BUDGET_STORAGE_UNAVAILABLE',
              fallbackEn,
              fallbackMy
            );
          }
          throw err;
        }
      };

      const reserveRes = await runLedgerStep(
        () =>
          ledger.atomicReserveBudget({
            scopeKey,
            idempotencyKey,
            operation: 'deep-dive-video-creative:rank',
            reserveCredits: VIDEO_CREATIVE_COMPETITOR_SCAN_CREDITS,
            requestedLimitCredits: spendingLimitCredits,
          }),
        'Persistent budget ledger is unavailable. Competitor video scan aborted fail-closed (0 credits spent).',
        'Persistent Budget Ledger ချိတ်ဆက်၍မရသဖြင့် ပြိုင်ဘက် Video စစ်ဆေးမှုကို Fail-Closed ရပ်တန့်ထားပါသည် (0 cr)။'
      );

      if (!reserveRes.ok) {
        if (reserveRes.reason === 'SPENDING_LIMIT_EXCEEDED') {
          throw new DeepDiveVideoCreativeApiError(
            402,
            'SPENDING_LIMIT_EXCEEDED',
            `Competitor video scan (${VIDEO_CREATIVE_COMPETITOR_SCAN_CREDITS} cr) exceeds remaining spending limit (${reserveRes.snapshot.remainingCredits} cr).`,
            `ပြိုင်ဘက် Video စစ်ဆေးမှု (${VIDEO_CREATIVE_COMPETITOR_SCAN_CREDITS} cr) သည် လက်ကျန် Budget ကန့်သတ်ချက် (${reserveRes.snapshot.remainingCredits} cr) ထက် ကျော်လွန်နေပါသည်။`,
            reserveRes.snapshot
          );
        }
        if (reserveRes.reason === 'IDEMPOTENCY_ALREADY_SETTLED') {
          throw new DeepDiveVideoCreativeApiError(
            409,
            'DUPLICATE_ALREADY_SETTLED',
            'This competitor video scan request was already completed. Retry without reusing the same idempotency key.',
            'တူညီသော ပြိုင်ဘက် Video စစ်ဆေးမှု Request ကို လုပ်ဆောင်ပြီးဖြစ်ပါသည်။ ထပ်မံစစ်ဆေးရန် ခလုတ်ကို ပြန်နှိပ်ပါ။',
            reserveRes.snapshot
          );
        }
        throw new DeepDiveVideoCreativeApiError(
          409,
          'DUPLICATE_IN_PROGRESS',
          'A duplicate competitor video scan is already in progress.',
          'တူညီသော ပြိုင်ဘက် Video စစ်ဆေးမှုတစ်ခု လုပ်ဆောင်နေဆဲ ဖြစ်ပါသည်။',
          reserveRes.snapshot
        );
      }

      const reservationId = reserveRes.reservationId;
      let reservationFinalized = false;
      let upstreamDispatched = false;

      try {
        const balanceCheck = params.testOverrides?.fetchCreditBalance
          ? await params.testOverrides.fetchCreditBalance()
          : await fetchKalodataCreditBalance();

        if (
          balanceCheck.ok &&
          typeof balanceCheck.balance === 'number' &&
          balanceCheck.balance < VIDEO_CREATIVE_COMPETITOR_SCAN_CREDITS
        ) {
          const released = await runLedgerStep(
            () =>
              ledger.releaseReservation({
                scopeKey,
                reservationId,
                requestedLimitCredits: spendingLimitCredits,
                reason: 'insufficient-kalodata-balance',
              }),
            'Persistent budget release failed after balance pre-check.',
            'Balance စစ်ဆေးပြီးနောက် Budget Reservation ပြန်ဖျက်ရာတွင် အမှားဖြစ်ပွားပါသည်။'
          );
          reservationFinalized = true;
          throw new DeepDiveVideoCreativeApiError(
            402,
            'INSUFFICIENT_CREDITS',
            `Kalodata account balance (${balanceCheck.balance} cr) is below the required ${VIDEO_CREATIVE_COMPETITOR_SCAN_CREDITS} cr.`,
            `Kalodata Account လက်ကျန် (${balanceCheck.balance} cr) သည် လိုအပ်သော ${VIDEO_CREATIVE_COMPETITOR_SCAN_CREDITS} cr ထက် နည်းနေပါသည်။`,
            released.snapshot
          );
        }

        const rankRequest: KalodataVideoRankRequest = {
          region: 'TH',
          language: 'th-TH',
          currency: 'THB',
          date_range: 'last30Day',
          page_number: 1,
          page_size: 20,
          has_product: 1,
          keyword: competitorKeywordUsed,
          need_extra: true,
          sort_field: {
            field: 'revenue',
            type: 'DESC',
          },
        };

        await runLedgerStep(
          () => ledger.markReservationDispatched(scopeKey, reservationId),
          'Persistent budget storage became unavailable before calling Kalodata Video Rank API. Call aborted fail-closed (0 credits spent).',
          'Kalodata Video Rank API မခေါ်ဆိုမီ Budget Storage ချိတ်ဆက်မှု ပြတ်တောက်သွားသဖြင့် Fail-Closed ရပ်တန့်ထားပါသည် (0 cr)။'
        );
        upstreamDispatched = true;

        const rankResult = params.testOverrides?.fetchVideoRank
          ? await params.testOverrides.fetchVideoRank(rankRequest)
          : await fetchKalodataVideoRank(rankRequest);

        if (!rankResult.ok) {
          try {
            if (isDeterministicNonBilledError(rankResult.httpStatus, rankResult.upstreamCode)) {
              const releaseOut = await ledger.releaseReservation({
                scopeKey,
                reservationId,
                verifiedZeroCharge: true,
                requestedLimitCredits: spendingLimitCredits,
                reason: 'deterministic-non-billed-error',
              });
              budgetSnapshot = releaseOut.snapshot;
            } else {
              budgetSnapshot = await ledger.markReservationUncertain({
                scopeKey,
                reservationId,
                requestedLimitCredits: spendingLimitCredits,
                reason: 'upstream-video-rank-uncertain',
              });
            }
            reservationFinalized = true;
          } catch {
            // Surface real upstream error cleanly
          }
          throw new DeepDiveVideoCreativeApiError(
            502,
            rankResult.upstreamCode ?? 'KALODATA_VIDEO_RANK_ERROR',
            rankResult.error ?? 'Failed to fetch top-selling competitor videos from Kalodata.',
            rankResult.errorMy ?? 'Kalodata မှ ရောင်းကောင်းပြိုင်ဘက် Video များ ဆွဲယူ၍ မရပါ။',
            budgetSnapshot ?? undefined
          );
        }

        kalodataApiCallsMade = 1;
        kalodataCreditsUsed = VIDEO_CREATIVE_COMPETITOR_SCAN_CREDITS;
        try {
          budgetSnapshot = await ledger.settleReservation({
            scopeKey,
            reservationId,
            actualCredits: kalodataCreditsUsed,
            requestedLimitCredits: spendingLimitCredits,
            note: 'deep-dive-video-creative-scan-ok',
          });
          reservationFinalized = true;
        } catch {
          reservationFinalized = true;
        }

        if (balanceCheck.ok && typeof balanceCheck.balance === 'number') {
          liveBalanceAfter = Math.max(
            0,
            Math.round((balanceCheck.balance - kalodataCreditsUsed) * 1000) / 1000
          );
        }

        competitorVideos = parseCompetitorVideoSamples(rankResult.items ?? []);
        competitorScanStatus = competitorVideos.length > 0 ? 'scanned' : 'no-videos-found';

        if (competitorVideoCache.size >= COMPETITOR_VIDEO_CACHE_MAX_ENTRIES) {
          const oldestKey = competitorVideoCache.keys().next().value;
          if (oldestKey) competitorVideoCache.delete(oldestKey);
        }
        competitorVideoCache.set(cacheKey, {
          keywordUsed: competitorKeywordUsed,
          videos: competitorVideos,
          storedAtMs: Date.now(),
        });
      } finally {
        if (!reservationFinalized) {
          try {
            if (upstreamDispatched) {
              await ledger.markReservationUncertain({
                scopeKey,
                reservationId,
                requestedLimitCredits: spendingLimitCredits,
                reason: 'unexpected-error-after-dispatch',
              });
            } else {
              await ledger.releaseReservation({
                scopeKey,
                reservationId,
                requestedLimitCredits: spendingLimitCredits,
                reason: 'aborted-before-dispatch',
              });
            }
          } catch {
            // Best-effort cleanup
          }
        }
      }
    }
  }

  // Optional Step 2: Fetch product thumbnail (0 cr) so Gemini sees real packaging/visuals
  const productImageInline = params.testOverrides?.generateCreativeJson
    ? null
    : await tryFetchProductImageInlineData(params.product);
  const usedProductImage = Boolean(productImageInline);

  const prompt = buildDeepDiveVideoCreativePrompt({
    product: params.product,
    options,
    completedModules,
    competitorScanStatus,
    competitorKeywordUsed,
    competitorVideos,
    usedProductImage,
  });

  // Step 3: Call Server-Side Gemini AI (with optional test override for deterministic tests)
  if (params.testOverrides?.generateCreativeJson) {
    const mockRes = await params.testOverrides.generateCreativeJson({
      prompt,
      options,
      competitorVideos,
      usedProductImage,
    });
    const validated = validateDeepDiveVideoCreativeJson({
      rawText: mockRes.rawText,
      modelUsed: mockRes.modelUsed,
      optionsUsed: options,
      competitorScanStatus,
      competitorKeywordUsed,
      competitorVideos,
      usedProductImage,
      modulesReferenced,
    });
    if (!validated) {
      const msg = buildBurmeseCreativeAiError('INVALID_RESPONSE');
      throw new DeepDiveVideoCreativeApiError(msg.status, 'INVALID_RESPONSE', msg.en, msg.my);
    }
    validated.tokenUsage = mockRes.tokenUsage ?? null;
    return {
      ok: true,
      blueprint: validated,
      kalodataApiCallsMade,
      kalodataCreditsUsed,
      reusedCompetitorCache,
      aiApiCallsMade: 1,
      liveBalanceAfter,
      budgetSnapshot,
    };
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    const msg = buildBurmeseCreativeAiError('MISSING_API_KEY');
    throw new DeepDiveVideoCreativeApiError(
      msg.status,
      'MISSING_API_KEY',
      msg.en,
      msg.my,
      budgetSnapshot ?? undefined
    );
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const contents = productImageInline
    ? [
        {
          role: 'user' as const,
          parts: [
            { inlineData: { mimeType: productImageInline.mimeType, data: productImageInline.data } },
            { text: prompt },
          ],
        },
      ]
    : prompt;

  let lastCode: AiAnalysisErrorCode = 'UPSTREAM_ERROR';

  for (let modelIdx = 0; modelIdx < VIDEO_CREATIVE_MODELS.length; modelIdx += 1) {
    const modelName = VIDEO_CREATIVE_MODELS[modelIdx];
    const maxAttempts = modelIdx === 0 ? 2 : 1;
    const timeoutMs = modelIdx === 0 ? PRIMARY_TIMEOUT_MS : BACKUP_TIMEOUT_MS;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const config =
          modelName === VIDEO_CREATIVE_PRIMARY_MODEL
            ? {
                systemInstruction: SYSTEM_INSTRUCTION,
                responseMimeType: 'application/json',
                responseSchema: VIDEO_CREATIVE_SCHEMA,
                thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              }
            : {
                systemInstruction: SYSTEM_INSTRUCTION,
                responseMimeType: 'application/json',
                responseSchema: VIDEO_CREATIVE_SCHEMA,
              };

        const response = await withTimeout(
          ai.models.generateContent({
            model: modelName,
            contents,
            config,
          }),
          timeoutMs
        );

        const rawText = (response.text ?? '').trim();
        if (!rawText) {
          lastCode = 'INVALID_RESPONSE';
          break;
        }

        const validated = validateDeepDiveVideoCreativeJson({
          rawText,
          modelUsed: modelName,
          optionsUsed: options,
          competitorScanStatus,
          competitorKeywordUsed,
          competitorVideos,
          usedProductImage,
          modulesReferenced,
        });

        if (validated) {
          const usage = response.usageMetadata as
            | {
                promptTokenCount?: number;
                candidatesTokenCount?: number;
                totalTokenCount?: number;
              }
            | undefined;
          const promptTokens =
            typeof usage?.promptTokenCount === 'number' && Number.isFinite(usage.promptTokenCount)
              ? usage.promptTokenCount
              : null;
          const outputTokens =
            typeof usage?.candidatesTokenCount === 'number' &&
            Number.isFinite(usage.candidatesTokenCount)
              ? usage.candidatesTokenCount
              : null;
          const totalTokens =
            typeof usage?.totalTokenCount === 'number' && Number.isFinite(usage.totalTokenCount)
              ? usage.totalTokenCount
              : promptTokens !== null && outputTokens !== null
                ? promptTokens + outputTokens
                : null;

          validated.tokenUsage = {
            promptTokens,
            outputTokens,
            totalTokens,
            pricingStatus: 'unavailable',
            costNoteEn:
              totalTokens !== null
                ? `Gemini API cost: Estimated / Unavailable (${totalTokens.toLocaleString('en-US')} tokens used; billed separately by Google Gemini API — NOT free).`
                : 'Gemini API cost: Estimated / Unavailable (billed separately by Google Gemini API — NOT free).',
            costNoteMy:
              totalTokens !== null
                ? `Gemini API ကုန်ကျစရိတ်: ခန့်မှန်း/မတွက်နိုင်သေး (Token ${totalTokens.toLocaleString('en-US')} သုံးစွဲထားသည် · Google Gemini API မှ သီးခြားကောက်ခံသည် — အခမဲ့ မဟုတ်ပါ)။`
                : 'Gemini API ကုန်ကျစရိတ်: ခန့်မှန်း/မတွက်နိုင်သေး (Google Gemini API မှ သီးခြားကောက်ခံသည် — အခမဲ့ မဟုတ်ပါ)။',
          };

          return {
            ok: true,
            blueprint: validated,
            kalodataApiCallsMade,
            kalodataCreditsUsed,
            reusedCompetitorCache,
            aiApiCallsMade: 1,
            liveBalanceAfter,
            budgetSnapshot,
          };
        }

        lastCode = 'INVALID_RESPONSE';
        break;
      } catch (err) {
        const classified = classifyGeminiError(err);
        lastCode = classified.code;

        if (classified.code === 'AUTH_ERROR' || classified.code === 'RATE_LIMITED') {
          const msg = buildBurmeseCreativeAiError(classified.code);
          throw new DeepDiveVideoCreativeApiError(
            msg.status,
            classified.code,
            msg.en,
            msg.my,
            budgetSnapshot ?? undefined
          );
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

  const msg = buildBurmeseCreativeAiError(lastCode);
  throw new DeepDiveVideoCreativeApiError(
    msg.status,
    lastCode,
    msg.en,
    msg.my,
    budgetSnapshot ?? undefined
  );
}
