import crypto from 'node:crypto';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type {
  ProductCategory,
  ResearchProduct,
} from '../src/types/product.ts';
import type {
  SameProductCandidate,
  SameProductKeywordSuggestionResponse,
  SameProductMatchTier,
  SameProductSearchResponse,
  SameProductVisualStatus,
} from '../src/types/sameProduct.ts';
import {
  DEFAULT_SPENDING_LIMIT_CREDITS,
  KALODATA_CREDITS_PER_100_ROWS,
  KALODATA_USD_PER_CREDIT,
  MAX_SPENDING_LIMIT_CREDITS,
  MIN_SPENDING_LIMIT_CREDITS,
} from '../src/utils/kalodataPricing.ts';
import { getCanonicalProductId } from '../src/utils/scoring.ts';
import {
  getCanonicalShopId,
  mergeEnrichmentIntoProduct,
} from '../src/utils/enrichmentPlanner.ts';
import {
  buildDeterministicKeywordSuggestions,
  buildSameProductCacheKey,
  computeEarlyMoverAssessment,
  computeTitleSimilarityPct,
  extractDeterministicSearchKeyword,
  sortSameProductCandidates,
} from '../src/utils/sameProductMatcher.ts';
import {
  fetchKalodataCreditBalance,
  fetchKalodataProductRank,
  getKalodataCategoryIdsForFilter,
  resolveProductCategoryFromKalodataId,
  type KalodataProductRankRequest,
} from './kalodataService.ts';
import {
  buildKalodataProductSummary,
  getResearchQuotaStatus,
} from './researchService.ts';
import {
  getServerCachedProductDetail,
  getServerCachedShopDetail,
} from './enrichmentService.ts';
import {
  BudgetStorageUnavailableError,
  getDefaultBudgetLedger,
  PersistentBudgetLedger,
  resolveAuthoritativeBudgetScope,
  type BudgetScopeSnapshot,
} from './budgetLedgerService.ts';
import {
  fetchProxiedImageBuffer,
  isPlausibleProductImageUrl,
  isProxyableImageUrl,
  normalizeExternalImageUrl,
  registerVerifiedImage,
  resolveLiveTikTokProductImageUrl,
  verifyKalodataImageUrl,
} from './imageRetriever.ts';
import {
  buildFallbackTikTokShopUrl,
  extractNumericTikTokProductId,
  resolveCanonicalTikTokProductUrlsBatch,
} from './tiktokLinkService.ts';

const SAME_PRODUCT_SEARCH_COST_CREDITS = KALODATA_CREDITS_PER_100_ROWS; // 0.1 cr per product/rank call
const SAME_PRODUCT_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const SAME_PRODUCT_CACHE_MAX_ENTRIES = 200;
const MAX_VISUAL_CANDIDATES = 12;
const MAX_RETURNED_CANDIDATES = 15;
const MAX_VISION_IMAGE_BYTES = 2 * 1024 * 1024; // 2MB cap per thumbnail for Gemini Vision
const GEMINI_VISION_TIMEOUT_MS = 28_000;
const GEMINI_KEYWORD_TIMEOUT_MS = 14_000;
const GEMINI_SAME_PRODUCT_MODEL = 'gemini-4-hydrogen';

const GEMINI_SUPPORTED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

interface CachedSameProductSearchEntry {
  response: SameProductSearchResponse;
  storedAtMs: number;
}

const sameProductSearchCache = new Map<string, CachedSameProductSearchEntry>();

export function clearSameProductSearchCache(): void {
  sameProductSearchCache.clear();
}

export class SameProductApiError extends Error {
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
    this.name = 'SameProductApiError';
    this.status = status;
    this.code = code;
    this.errorMy = errorMy;
    this.budgetSnapshot = budgetSnapshot;
  }
}

export interface VisualMatchVerdictItem {
  candidateId: string;
  matchTier: 'exact-same' | 'close-variant' | 'different';
  confidence: number;
  reasonEn: string;
  reasonMy: string;
}

export interface SameProductTestOverrides {
  fetchCreditBalance?: () => Promise<{ ok: boolean; balance: number | null }>;
  fetchProductRank?: (
    params: KalodataProductRankRequest
  ) => Promise<{
    ok: boolean;
    httpStatus: number | null;
    items: Record<string, unknown>[];
    upstreamCode?: string;
    error?: string;
    errorMy?: string;
  }>;
  verifyVisualMatches?: (params: {
    sourceProduct: ResearchProduct;
    sourceImageUrl: string | null;
    candidates: Array<{
      candidateId: string;
      title: string;
      priceThb: number | null;
      imageUrl: string | null;
    }>;
  }) => Promise<{
    status: SameProductVisualStatus;
    noteEn: string;
    noteMy: string;
    verdicts: Map<string, VisualMatchVerdictItem>;
  }>;
  resolveTikTokUrlsBatch?: (
    productIds: readonly string[]
  ) => Promise<Map<string, string>>;
  resolveLiveProductImage?: (productId: string) => Promise<string | null>;
  budgetLedger?: PersistentBudgetLedger;
  budgetScopeKey?: string;
}

export interface SearchSameProductParams {
  product: ResearchProduct;
  keyword?: string;
  priceTolerancePct?: number;
  includeCloseVariants?: boolean;
  includeZeroSales?: boolean;
  enableVisualVerification?: boolean;
  useCategoryFilter?: boolean;
  spendingLimitCredits?: number;
  userConfirmedPaidExecution?: boolean;
  forceRefresh?: boolean;
  idempotencyKey?: string;
  resolvedCategoryIdMap?: Partial<Record<ProductCategory, string>>;
  testOverrides?: SameProductTestOverrides;
}

function roundCredits3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function getGeminiApiKey(): string | null {
  const key = (process.env.GEMINI_API_KEY ?? '').trim();
  if (!key || key === 'MY_GEMINI_API_KEY') return null;
  return key;
}

function createGeminiClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`TIMEOUT_${timeoutMs}MS`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function toFiniteNumber(val: unknown): number | null {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string' && val.trim() !== '') {
    const parsed = Number(val);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeCommissionRatePct(raw: number | null): number | null {
  if (raw === null || !Number.isFinite(raw) || raw <= 0) return null;
  const pct = raw <= 1 ? raw * 100 : raw;
  return Math.round(pct * 10) / 10;
}

function extractCandidateImageStrings(item: Record<string, unknown>): string[] {
  const directCandidates = [
    item.master_image_url,
    item.image_url,
    item.product_image,
    item.product_image_url,
    item.cover_url,
    item.thumb_url,
    item.image,
    item.cover_image,
    item.pic_url,
    item.master_image,
    item.product_pic,
    item.thumb,
    item.thumbnail,
  ];
  const results: string[] = [];
  for (const cand of directCandidates) {
    if (typeof cand === 'string' && cand.trim() !== '') {
      results.push(cand.trim());
    }
  }
  if (Array.isArray(item.images)) {
    for (const img of item.images) {
      if (typeof img === 'string' && img.trim() !== '') {
        results.push(img.trim());
      }
    }
  }
  return results;
}

function extractRawKalodataImageUrl(item: Record<string, unknown>): string | null {
  for (const cand of extractCandidateImageStrings(item)) {
    const normalized = normalizeExternalImageUrl(cand);
    if (normalized && isProxyableImageUrl(normalized)) {
      return normalized;
    }
  }
  return null;
}

function extractPlausibleUnverifiedImageUrl(item: Record<string, unknown>): string | null {
  for (const cand of extractCandidateImageStrings(item)) {
    const normalized = normalizeExternalImageUrl(cand);
    if (normalized && isPlausibleProductImageUrl(normalized)) {
      return normalized;
    }
  }
  return null;
}

function extractSourceOriginalImageUrl(product: ResearchProduct): string | null {
  const rawCandidates = [
    product.imageOriginUrl,
    product.imageUrl,
  ];
  for (const raw of rawCandidates) {
    if (typeof raw !== 'string' || !raw.trim()) continue;
    // Unwrap our own /api/image-proxy?url=... if needed
    if (raw.startsWith('/api/image-proxy?')) {
      try {
        const parsed = new URL(raw, 'http://localhost');
        const inner = parsed.searchParams.get('url');
        const normalized = normalizeExternalImageUrl(inner);
        if (normalized && isProxyableImageUrl(normalized)) {
          return normalized;
        }
      } catch {
        continue;
      }
    } else {
      const normalized = normalizeExternalImageUrl(raw);
      if (normalized && isProxyableImageUrl(normalized)) {
        return normalized;
      }
    }
  }
  return null;
}

function buildProxiedImageUrl(originUrl: string | null, productId?: string | null): string | null {
  if (!originUrl) return null;
  const cleanId = productId ? extractNumericTikTokProductId(productId) : null;
  return `/api/image-proxy?url=${encodeURIComponent(originUrl)}${
    cleanId ? `&productId=${encodeURIComponent(cleanId)}` : ''
  }`;
}

function isDeterministicNonBilledError(
  httpStatus: number | null,
  upstreamCode?: string
): boolean {
  if (upstreamCode === 'MISSING_API_KEY') return true;
  if (httpStatus !== null && [400, 401, 403, 404, 422, 429].includes(httpStatus)) {
    return true;
  }
  return false;
}

/**
 * 0-Kalodata-Credit helper: extracts Thailand TikTok Shop search keywords to locate
 * the EXACT SAME physical product across other shops. Uses Gemini when available,
 * falling back seamlessly to deterministic extraction.
 */
export async function suggestSameProductKeywords(
  product: ResearchProduct,
  options?: { useGemini?: boolean }
): Promise<SameProductKeywordSuggestionResponse> {
  const deterministic = buildDeterministicKeywordSuggestions(product);
  const apiKey = getGeminiApiKey();

  if (options?.useGemini === false || !apiKey) {
    return {
      ok: true,
      primaryKeyword: deterministic.primaryKeyword,
      suggestions: deterministic.suggestions,
      source: 'deterministic',
    };
  }

  try {
    const ai = createGeminiClient(apiKey);
    const prompt = [
      'You are a Thailand TikTok Shop affiliate product matcher.',
      'Given a product title, brand, and category, output 4 concise search keywords that will find the EXACT SAME physical product sold by OTHER shops on Thailand TikTok Shop (Kalodata product search).',
      'Rules:',
      '- Strip shop promo noise (ส่งฟรี, พร้อมส่ง, ของแท้ 100%, Flash Sale, emojis, bundle spam).',
      '- Keep the exact product type + brand/model/distinctive design words in Thai and/or English as Thai sellers list it.',
      '- Order from most exact (2–4 core words) to slightly broader (1–3 core words).',
      '- Each keyword must be 2–55 characters.',
      '',
      `Product Title: ${product.name}`,
      product.brand ? `Brand: ${product.brand}` : '',
      `Category: ${product.category} (${product.subCategory})`,
      product.priceThb ? `Price: ${product.priceThb} THB` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const response = await withTimeout(
      ai.models.generateContent({
        model: GEMINI_SAME_PRODUCT_MODEL,
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              suggestions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: ['suggestions'],
          },
        },
      }),
      GEMINI_KEYWORD_TIMEOUT_MS
    );

    const rawText = (response.text ?? '').trim();
    const parsed = JSON.parse(rawText) as { suggestions?: unknown };
    const aiSuggestions = Array.isArray(parsed.suggestions)
      ? parsed.suggestions
          .filter((item): item is string => typeof item === 'string')
          .map((s) => s.replace(/\s+/g, ' ').trim().slice(0, 60))
          .filter((s) => s.length >= 2)
      : [];

    const merged: string[] = [];
    const seen = new Set<string>();
    for (const kw of [...aiSuggestions, ...deterministic.suggestions]) {
      const key = kw.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(kw);
      if (merged.length >= 4) break;
    }

    if (merged.length > 0) {
      return {
        ok: true,
        primaryKeyword: merged[0],
        suggestions: merged,
        source: aiSuggestions.length > 0 ? 'gemini' : 'deterministic',
      };
    }
  } catch {
    // Graceful deterministic fallback — never block the user from editing keywords
  }

  return {
    ok: true,
    primaryKeyword: deterministic.primaryKeyword,
    suggestions: deterministic.suggestions,
    source: 'deterministic',
  };
}

/**
 * Fetches a single product thumbnail safely via trusted-CDN allowlist + SSRF checks + magic bytes.
 */
async function fetchSafeVisionImagePart(
  rawUrl: string | null
): Promise<{ mimeType: string; data: string } | null> {
  if (!rawUrl || !isProxyableImageUrl(rawUrl)) {
    return null;
  }

  const fetched = await fetchProxiedImageBuffer(rawUrl, MAX_VISION_IMAGE_BYTES);
  if (!fetched.ok) return null;
  if (!GEMINI_SUPPORTED_IMAGE_MIMES.has(fetched.mime)) {
    return null;
  }

  return {
    mimeType: fetched.mime,
    data: fetched.buffer.toString('base64'),
  };
}

/**
 * Multimodal Gemini Vision exact-same-product verifier (0 Kalodata credits).
 * Compares the SOURCE product thumbnail against up to 12 candidate thumbnails
 * in a single batched multimodal call to distinguish:
 * - `exact-same`: Physically identical product / SKU / design (just a different shop link)
 * - `close-variant`: Same core product style but different color, bundle count, or slight variant
 * - `different`: Different physical product or accessory (automatically filtered out)
 */
async function runGeminiVisualSameProductCheck(params: {
  sourceProduct: ResearchProduct;
  sourceImageUrl: string | null;
  candidates: Array<{
    candidateId: string;
    title: string;
    priceThb: number | null;
    imageUrl: string | null;
  }>;
}): Promise<{
  status: SameProductVisualStatus;
  noteEn: string;
  noteMy: string;
  verdicts: Map<string, VisualMatchVerdictItem>;
}> {
  const verdicts = new Map<string, VisualMatchVerdictItem>();
  const apiKey = getGeminiApiKey();

  if (!apiKey) {
    return {
      status: 'unavailable-no-key',
      noteEn:
        'AI visual comparison was skipped because GEMINI_API_KEY is not configured. Please confirm identical products visually side-by-side.',
      noteMy:
        'GEMINI_API_KEY မထည့်သွင်းရသေးသဖြင့် AI ပုံတိုက်စစ်မှု ကျော်လိုက်ပါသည်။ ဘေးချင်းယှဉ်ပုံများကို မျက်မြင်စစ်ဆေးပါ။',
      verdicts,
    };
  }

  if (params.candidates.length === 0) {
    return {
      status: 'verified',
      noteEn: 'No candidates required visual comparison.',
      noteMy: 'ပုံတိုက်စစ်ရန် Candidate မရှိပါ။',
      verdicts,
    };
  }

  // Try to recover source product image if missing (0 credits via public TH PDP)
  let resolvedSourceImgUrl = params.sourceImageUrl;
  if (!resolvedSourceImgUrl) {
    const srcNumericId = extractNumericTikTokProductId(getCanonicalProductId(params.sourceProduct));
    if (srcNumericId) {
      resolvedSourceImgUrl = await resolveLiveTikTokProductImageUrl(srcNumericId);
    }
  }

  const sourceInline = await fetchSafeVisionImagePart(resolvedSourceImgUrl);
  if (!sourceInline) {
    return {
      status: 'unavailable-no-images',
      noteEn:
        'Original product image could not be fetched for AI visual matching. Candidates are ranked by title & price match — confirm visually side-by-side.',
      noteMy:
        'မူလ Product ပုံကို AI ပုံတိုက်စစ်ရန် ဆွဲယူ၍မရပါ။ နာမည်နှင့် ဈေးတူညီမှုဖြင့် စီထားပြီး ပုံများကို မျက်မြင်တိုက်စစ်နိုင်ပါသည်။',
      verdicts,
    };
  }

  // Fetch up to MAX_VISUAL_CANDIDATES thumbnails concurrently (concurrency 4)
  const limitedCandidates = params.candidates.slice(0, MAX_VISUAL_CANDIDATES);
  const fetchedImages = new Map<string, { mimeType: string; data: string }>();

  const queue = [...limitedCandidates];
  const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next?.imageUrl) continue;
      const inline = await fetchSafeVisionImagePart(next.imageUrl);
      if (inline) {
        fetchedImages.set(next.candidateId, inline);
      }
    }
  });
  await Promise.all(workers);

  const inspectable = limitedCandidates.filter((c) => fetchedImages.has(c.candidateId));
  if (inspectable.length === 0) {
    return {
      status: 'unavailable-no-images',
      noteEn:
        'Candidate thumbnails were not reachable for AI visual matching. Please verify identical items visually side-by-side.',
      noteMy:
        'Candidate ပုံများကို AI ပုံတိုက်စစ်ရန် ဖတ်ယူ၍မရပါ။ ဘေးချင်းယှဉ်ပုံများကို မျက်မြင်တိုက်စစ်ပါ။',
      verdicts,
    };
  }

  try {
    const ai = createGeminiClient(apiKey);
    const parts: Array<
      | { text: string }
      | { inlineData: { mimeType: string; data: string } }
    > = [
      {
        text: [
          'You are a strict e-commerce visual product identity inspector for Thailand TikTok Shop.',
          'Compare the SOURCE product image below against each numbered CANDIDATE product image + title + price.',
          'Your ONLY goal is to tell if a candidate is the EXACT SAME physical product sold by another shop.',
          '',
          'Classification definitions (BE STRICT):',
          '- "exact-same": Physically identical product — same shape, silhouette, packaging/bottle/garment design, and core identity (minor studio angle, Thai promo sticker overlay, or watermark differences are OK if the physical item is clearly the exact same product).',
          '- "close-variant": Clearly the same base product/model, EXCEPT different color, pack size / bundle quantity (e.g. 2-pack vs 1-pack), or small label variant.',
          '- "different": Different physical product, different design/cut/brand, accessory only, or unrelated item. Reject generously if unsure!',
          '',
          `SOURCE PRODUCT: Title="${params.sourceProduct.name}" | Price=${params.sourceProduct.priceThb ? `฿${params.sourceProduct.priceThb}` : 'N/A'}`,
        ].join('\n'),
      },
      { inlineData: sourceInline },
    ];

    for (const cand of inspectable) {
      const img = fetchedImages.get(cand.candidateId)!;
      parts.push({
        text: `CANDIDATE ID="${cand.candidateId}" | Title="${cand.title}" | Price=${cand.priceThb ? `฿${cand.priceThb}` : 'N/A'}`,
      });
      parts.push({ inlineData: img });
    }

    parts.push({
      text: 'Return JSON with an array `matches` containing one entry for every CANDIDATE ID provided above. Keep `reasonEn` and `reasonMy` concise (under 14 words each, natural Burmese for reasonMy).',
    });

    const response = await withTimeout(
      ai.models.generateContent({
        model: GEMINI_SAME_PRODUCT_MODEL,
        contents: { parts },
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              matches: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    candidateId: { type: Type.STRING },
                    matchTier: { type: Type.STRING },
                    confidence: { type: Type.NUMBER },
                    reasonEn: { type: Type.STRING },
                    reasonMy: { type: Type.STRING },
                  },
                  required: ['candidateId', 'matchTier', 'confidence', 'reasonEn', 'reasonMy'],
                },
              },
            },
            required: ['matches'],
          },
        },
      }),
      GEMINI_VISION_TIMEOUT_MS
    );

    const rawText = (response.text ?? '').trim();
    const parsed = JSON.parse(rawText) as { matches?: unknown };
    const list = Array.isArray(parsed.matches) ? parsed.matches : [];

    for (const entry of list) {
      if (!entry || typeof entry !== 'object') continue;
      const obj = entry as Record<string, unknown>;
      const cid = typeof obj.candidateId === 'string' ? obj.candidateId.trim() : '';
      if (!cid || !fetchedImages.has(cid)) continue;

      const rawTier = typeof obj.matchTier === 'string' ? obj.matchTier.trim().toLowerCase() : '';
      const matchTier: 'exact-same' | 'close-variant' | 'different' =
        rawTier === 'exact-same'
          ? 'exact-same'
          : rawTier === 'close-variant'
            ? 'close-variant'
            : 'different';

      const rawConf = typeof obj.confidence === 'number' && Number.isFinite(obj.confidence)
        ? obj.confidence
        : 70;
      const confidence = Math.max(0, Math.min(100, Math.round(rawConf <= 1 ? rawConf * 100 : rawConf)));

      verdicts.set(cid, {
        candidateId: cid,
        matchTier,
        confidence,
        reasonEn:
          typeof obj.reasonEn === 'string' && obj.reasonEn.trim()
            ? obj.reasonEn.trim().slice(0, 140)
            : matchTier === 'exact-same'
              ? 'Visually matches the exact same physical product.'
              : matchTier === 'close-variant'
                ? 'Same base item with a color/pack variation.'
                : 'Different physical product.',
        reasonMy:
          typeof obj.reasonMy === 'string' && obj.reasonMy.trim()
            ? obj.reasonMy.trim().slice(0, 160)
            : matchTier === 'exact-same'
              ? 'မူလ Product နှင့် ပုံသဏ္ဌာန်/ဒီဇိုင်း ချွတ်စွပ်တူညီသည်'
              : matchTier === 'close-variant'
                ? 'ပစ္စည်းတူသော်လည်း အရောင်/Set အနည်းငယ်ကွဲနိုင်သည်'
                : 'မူလ Product နှင့် မတူညီပါ',
      });
    }

    return {
      status: 'verified',
      noteEn: `AI visually inspected ${inspectable.length} candidate thumbnails against the original product (0 Kalodata credits).`,
      noteMy: `မူလ Product ပုံနှင့် Candidate ${inspectable.length} ခုကို AI ပုံတိုက်စစ်ပြီးပါပြီ (0 Kalodata cr)။`,
      verdicts,
    };
  } catch {
    return {
      status: 'partial-error',
      noteEn:
        'AI visual matching timed out or failed transiently. Results are shown with side-by-side thumbnails so you can verify exact matches visually.',
      noteMy:
        'AI ပုံတိုက်စစ်မှု ယာယီအဆင်မပြေပါ။ ဘေးချင်းယှဉ်ပုံများဖြင့် ချွတ်စွပ်တူ/မတူ မျက်မြင်စစ်ဆေးနိုင်ပါသည်။',
      verdicts,
    };
  }
}

function setBoundedSameProductCache(key: string, response: SameProductSearchResponse): void {
  if (sameProductSearchCache.size >= SAME_PRODUCT_CACHE_MAX_ENTRIES && !sameProductSearchCache.has(key)) {
    const oldestKey = sameProductSearchCache.keys().next().value;
    if (oldestKey) sameProductSearchCache.delete(oldestKey);
  }
  sameProductSearchCache.set(key, {
    response,
    storedAtMs: Date.now(),
  });
}

function getValidSameProductCache(key: string): SameProductSearchResponse | null {
  const entry = sameProductSearchCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.storedAtMs > SAME_PRODUCT_CACHE_TTL_MS) {
    sameProductSearchCache.delete(key);
    return null;
  }
  return entry.response;
}

/**
 * Main Engine: Searches Thailand TikTok Shop via Kalodata `product/rank` (1 call = 0.1 cr, 24h cached)
 * for the EXACT SAME physical product sold by OTHER shops, verifies visual identity with Gemini Vision
 * (0 Kalodata cr), resolves real TH TikTok Shop PDP links (0 cr), and ranks Early-Mover links first.
 */
export async function searchSameProductEarlyMoverLinks(
  params: SearchSameProductParams
): Promise<SameProductSearchResponse> {
  const { product, testOverrides } = params;
  const sourceProductId = getCanonicalProductId(product);
  const sourceNumericId = extractNumericTikTokProductId(sourceProductId) ?? sourceProductId;
  const sourceShopId = getCanonicalShopId(product);
  const sourceImageOrigin = extractSourceOriginalImageUrl(product);
  if (sourceImageOrigin) {
    registerVerifiedImage(sourceImageOrigin, 'image/jpeg');
  }

  const keywordUsed = (params.keyword ?? extractDeterministicSearchKeyword(product))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);

  if (keywordUsed.length < 2) {
    throw new SameProductApiError(
      400,
      'INVALID_KEYWORD',
      'Please enter at least 2 characters for the core product keyword.',
      'ရှာဖွေမည့် အဓိက Product Keyword ကို အနည်းဆုံး စာလုံး ၂ လုံး ထည့်သွင်းပါ။'
    );
  }

  const priceTolerancePct = Math.max(
    15,
    Math.min(80, Math.round(params.priceTolerancePct ?? 35))
  );
  const includeCloseVariants = params.includeCloseVariants !== false;
  const includeZeroSales = params.includeZeroSales === true;
  const enableVisualVerification = params.enableVisualVerification !== false;
  const useCategoryFilter = params.useCategoryFilter !== false;
  const spendingLimitCredits = roundCredits3(
    Math.max(
      MIN_SPENDING_LIMIT_CREDITS,
      Math.min(
        MAX_SPENDING_LIMIT_CREDITS,
        typeof params.spendingLimitCredits === 'number' && Number.isFinite(params.spendingLimitCredits)
          ? params.spendingLimitCredits
          : DEFAULT_SPENDING_LIMIT_CREDITS
      )
    )
  );

  // Cache lookup (0 credits on cache hit!)
  const cacheKey = buildSameProductCacheKey(product, keywordUsed, {
    priceTolerancePct,
    useCategoryFilter,
    enableVisualVerification,
  });

  if (!params.forceRefresh) {
    const cached = getValidSameProductCache(cacheKey);
    if (cached) {
      const filteredCached = cached.candidates.filter((c) => {
        if (!includeCloseVariants && c.matchTier === 'close-variant') return false;
        if (!includeZeroSales && (c.salesVolume === null || c.salesVolume <= 0)) return false;
        return true;
      });
      return {
        ...cached,
        fromCache: true,
        creditsSpent: 0,
        estimatedUsdCost: 0,
        candidates: sortSameProductCandidates(filteredCached),
      };
    }
  }

  // Manual Research Pause guard
  const quotaStatus = getResearchQuotaStatus();
  if (quotaStatus.paused) {
    throw new SameProductApiError(
      423,
      'RESEARCH_PAUSED',
      'Paid Kalodata research is currently paused. Resume research before running Same-Product search.',
      'Paid Kalodata ရှာဖွေမှုကို ခေတ္တရပ်နားထားပါသည်။ ပြန်လည်စတင်ပြီးမှ ရှာဖွေပါ။'
    );
  }

  // Server-enforced explicit user confirmation before any paid Kalodata API call
  if (params.userConfirmedPaidExecution !== true) {
    throw new SameProductApiError(
      400,
      'CONFIRMATION_REQUIRED',
      `Explicit user confirmation is required before spending ${SAME_PRODUCT_SEARCH_COST_CREDITS} Kalodata credit for Same-Product search.`,
      `Same-Product ရှာဖွေရန် Kalodata Credit ${SAME_PRODUCT_SEARCH_COST_CREDITS} cr မသုံးမီ အတည်ပြုချက် လိုအပ်ပါသည်။`
    );
  }

  // Persistent Budget Ledger atomic reservation (fail-closed)
  let ledger: PersistentBudgetLedger;
  try {
    ledger = testOverrides?.budgetLedger ?? getDefaultBudgetLedger();
  } catch (error) {
    if (error instanceof BudgetStorageUnavailableError) {
      throw new SameProductApiError(503, 'BUDGET_STORAGE_UNAVAILABLE', error.message, error.errorMy);
    }
    throw new SameProductApiError(
      503,
      'BUDGET_STORAGE_UNAVAILABLE',
      'Persistent budget storage is unavailable. Paid Kalodata call aborted fail-closed.',
      'Persistent Budget Storage မရရှိနိုင်သဖြင့် Paid Kalodata ခေါ်ဆိုမှုကို Fail-Closed ရပ်တန့်ထားပါသည်။'
    );
  }

  const scopeKey =
    testOverrides?.budgetScopeKey?.trim() ||
    resolveAuthoritativeBudgetScope().scopeKey;

  const resolvedIdempotencyKey =
    typeof params.idempotencyKey === 'string' && params.idempotencyKey.trim().length >= 4
      ? params.idempotencyKey.trim().slice(0, 140)
      : `same-product:${sourceNumericId}:${crypto.randomUUID()}`;

  const runLedgerStep = async <T>(
    op: () => Promise<T>,
    fallbackEn: string,
    fallbackMy: string
  ): Promise<T> => {
    try {
      return await op();
    } catch (error) {
      if (error instanceof BudgetStorageUnavailableError) {
        throw new SameProductApiError(503, 'BUDGET_STORAGE_UNAVAILABLE', error.message, error.errorMy);
      }
      throw new SameProductApiError(503, 'BUDGET_STORAGE_UNAVAILABLE', fallbackEn, fallbackMy);
    }
  };

  let reservationId: string | null = null;
  let reservationFinalized = false;
  let upstreamDispatched = false;
  let actualCreditsSpent = 0;

  try {
    const reserveRes = await runLedgerStep(
      () =>
        ledger.atomicReserveBudget({
          scopeKey,
          idempotencyKey: resolvedIdempotencyKey,
          operation: 'same-product:rank',
          reserveCredits: SAME_PRODUCT_SEARCH_COST_CREDITS,
          requestedLimitCredits: spendingLimitCredits,
        }),
      'Persistent budget reservation failed. Paid Kalodata call aborted fail-closed (0 credits spent).',
      'Persistent Budget ကြိုတင်ထိန်းသိမ်းမှု မအောင်မြင်သဖြင့် Paid Kalodata ခေါ်ဆိုမှုကို Fail-Closed ရပ်တန့်ထားပါသည် (0 cr)။'
    );

    if (!reserveRes.ok) {
      if (reserveRes.reason === 'SPENDING_LIMIT_EXCEEDED') {
        throw new SameProductApiError(
          429,
          'SPENDING_LIMIT_EXCEEDED',
          `Same-Product search (${SAME_PRODUCT_SEARCH_COST_CREDITS} cr) exceeds remaining daily spending limit (${reserveRes.snapshot.remainingCredits} cr left).`,
          `Same-Product ရှာဖွေမှု (${SAME_PRODUCT_SEARCH_COST_CREDITS} cr) သည် နေ့စဉ် Spending Limit လက်ကျန် (${reserveRes.snapshot.remainingCredits} cr) ထက် ကျော်လွန်နေပါသည်။`,
          reserveRes.snapshot
        );
      }
      if (reserveRes.reason === 'IDEMPOTENCY_ALREADY_SETTLED') {
        throw new SameProductApiError(
          409,
          'DUPLICATE_ALREADY_SETTLED',
          'This Same-Product search request was already completed. Retry without reusing the same idempotency key.',
          'တူညီသော Same-Product ရှာဖွေမှု Request ကို လုပ်ဆောင်ပြီးဖြစ်ပါသည်။ ထပ်မံရှာဖွေရန် ခလုတ်ကို ပြန်နှိပ်ပါ။',
          reserveRes.snapshot
        );
      }
      throw new SameProductApiError(
        409,
        'DUPLICATE_IN_PROGRESS',
        'A duplicate Same-Product search request is already in progress.',
        'တူညီသော Same-Product ရှာဖွေမှု Request တစ်ခု လုပ်ဆောင်နေဆဲ ဖြစ်ပါသည်။',
        reserveRes.snapshot
      );
    }

    reservationId = reserveRes.reservationId;

    // Free credit balance pre-check before paid call
    const balanceCheck = testOverrides?.fetchCreditBalance
      ? await testOverrides.fetchCreditBalance()
      : await fetchKalodataCreditBalance();

    if (
      balanceCheck.ok &&
      typeof balanceCheck.balance === 'number' &&
      balanceCheck.balance < SAME_PRODUCT_SEARCH_COST_CREDITS
    ) {
      await runLedgerStep(
        () =>
          ledger.releaseReservation({
            scopeKey,
            reservationId: reservationId!,
            requestedLimitCredits: spendingLimitCredits,
            reason: 'insufficient-kalodata-balance',
          }),
        'Persistent budget release failed after balance pre-check.',
        'Credit Balance စစ်ဆေးပြီးနောက် Budget Reservation ပြန်ဖျက်ရာတွင် အမှားဖြစ်ပွားပါသည်။'
      );
      reservationFinalized = true;
      throw new SameProductApiError(
        402,
        'INSUFFICIENT_CREDITS',
        `Kalodata account balance (${balanceCheck.balance} cr) is below the required ${SAME_PRODUCT_SEARCH_COST_CREDITS} cr.`,
        `Kalodata Account လက်ကျန် (${balanceCheck.balance} cr) သည် လိုအပ်သော ${SAME_PRODUCT_SEARCH_COST_CREDITS} cr ထက် နည်းနေပါသည်။`
      );
    }

    // Resolve category filter (optional)
    const categoryIdsUsed: string[] = [];
    if (useCategoryFilter) {
      const explicitPriCat = product.kalodataMetrics?.priCategory?.category_id?.trim();
      if (explicitPriCat && /^[A-Za-z0-9_-]{3,64}$/.test(explicitPriCat)) {
        categoryIdsUsed.push(explicitPriCat);
      } else {
        const mappedIds = getKalodataCategoryIdsForFilter(
          product.category,
          params.resolvedCategoryIdMap
        );
        if (mappedIds.length > 0) {
          categoryIdsUsed.push(mappedIds[0]);
        }
      }
    }

    const rankRequest: KalodataProductRankRequest = {
      region: 'TH',
      language: 'th-TH',
      currency: 'THB',
      date_range: 'last30Day',
      page_number: 1,
      page_size: 100,
      is_affiliate: 1,
      keyword: keywordUsed,
      ...(categoryIdsUsed.length > 0 ? { category_ids: categoryIdsUsed } : {}),
      need_image: 1,
      need_extra: true,
      sort_field: {
        field: 'revenue',
        type: 'DESC',
      },
    };

    await runLedgerStep(
      () => ledger.markReservationDispatched(scopeKey, reservationId!),
      'Persistent budget storage became unavailable before calling Kalodata API. Call aborted fail-closed (0 credits spent).',
      'Kalodata API မခေါ်ဆိုမီ Persistent Budget Storage ချိတ်ဆက်မှု ပြတ်တောက်သွားသဖြင့် Fail-Closed ရပ်တန့်ထားပါသည် (0 cr)။'
    );
    upstreamDispatched = true;

    const rankResult = testOverrides?.fetchProductRank
      ? await testOverrides.fetchProductRank(rankRequest)
      : await fetchKalodataProductRank(rankRequest);

    if (!rankResult.ok) {
      try {
        if (isDeterministicNonBilledError(rankResult.httpStatus, rankResult.upstreamCode)) {
          await ledger.releaseReservation({
            scopeKey,
            reservationId,
            verifiedZeroCharge: true,
            requestedLimitCredits: spendingLimitCredits,
            reason: 'deterministic-non-billed-error',
          });
        } else {
          await ledger.markReservationUncertain({
            scopeKey,
            reservationId,
            requestedLimitCredits: spendingLimitCredits,
            reason: 'upstream-rank-uncertain',
          });
        }
        reservationFinalized = true;
      } catch {
        // Best-effort ledger update; still surface the real Kalodata error cleanly
      }
      throw new SameProductApiError(
        rankResult.httpStatus === 401 || rankResult.httpStatus === 403 ? 502 : 502,
        rankResult.upstreamCode ?? 'KALODATA_RANK_ERROR',
        rankResult.error ?? 'Failed to fetch Thailand TikTok Shop candidates from Kalodata.',
        rankResult.errorMy ?? 'Kalodata မှ ထိုင်း TikTok Shop Product များ ဆွဲယူ၍ မရပါ။'
      );
    }

    actualCreditsSpent = SAME_PRODUCT_SEARCH_COST_CREDITS;
    try {
      await ledger.settleReservation({
        scopeKey,
        reservationId,
        actualCredits: actualCreditsSpent,
        requestedLimitCredits: spendingLimitCredits,
        note: 'same-product-rank-ok',
      });
      reservationFinalized = true;
    } catch {
      // Upstream already succeeded and charged; reservation lease will reconcile as uncertain rather than discarding paid data
      reservationFinalized = true;
    }

    // Step 1: Hard-gate filter (exclude original product/shop, enforce affiliate > 0%, price band)
    const rawItems = rankResult.items ?? [];
    const researchedAt = new Date().toISOString();
    const sourcePrice =
      typeof product.priceThb === 'number' && Number.isFinite(product.priceThb) && product.priceThb > 0
        ? product.priceThb
        : null;
    const minPrice = sourcePrice !== null ? sourcePrice * (1 - priceTolerancePct / 100) : null;
    const maxPrice = sourcePrice !== null ? sourcePrice * (1 + priceTolerancePct / 100) : null;

    let excludedSameProductOrShopCount = 0;
    let excludedPriceOrSalesCount = 0;

    interface PreCandidate {
      rawItem: Record<string, unknown>;
      productId: string;
      shopId: string | null;
      shopName: string;
      title: string;
      imageOriginUrl: string | null;
      priceThb: number | null;
      commissionRate: number;
      estimatedCommissionPerSaleThb: number | null;
      salesVolume: number | null;
      revenueThb: number | null;
      videoRevenueThb: number | null;
      liveRevenueThb: number | null;
      revenueGrowthRate: number | null;
      launchDate: string | null;
      titleSimilarityPct: number;
      priceProximityScore: number;
      cachedPd: ReturnType<typeof getServerCachedProductDetail>;
      cachedSd: ReturnType<typeof getServerCachedShopDetail>;
    }

    const preCandidates: PreCandidate[] = [];
    const seenProductIds = new Set<string>();

    for (const item of rawItems) {
      const rawPid =
        item.product_id !== undefined && item.product_id !== null
          ? String(item.product_id).trim()
          : '';
      if (!rawPid) continue;

      const cleanPid = extractNumericTikTokProductId(rawPid) ?? rawPid;
      if (seenProductIds.has(cleanPid)) continue;
      seenProductIds.add(cleanPid);

      const rawSid =
        item.seller_id !== undefined && item.seller_id !== null && String(item.seller_id).trim() !== ''
          ? String(item.seller_id).trim()
          : null;

      // Hard Gate 1: Exclude original product AND original shop (we want a DIFFERENT shop link!)
      if (cleanPid === sourceNumericId || rawPid === sourceProductId) {
        excludedSameProductOrShopCount += 1;
        continue;
      }
      if (sourceShopId && rawSid && rawSid === sourceShopId) {
        excludedSameProductOrShopCount += 1;
        continue;
      }

      // Hard Gate 2: Require verified affiliate commission > 0%
      const commissionRate = normalizeCommissionRatePct(toFiniteNumber(item.commission_rate));
      if (commissionRate === null || commissionRate <= 0) {
        excludedPriceOrSalesCount += 1;
        continue;
      }

      // Hard Gate 3: Price Sanity Band (identical product shouldn't be 3x cheaper/more expensive)
      const rawPrice = toFiniteNumber(item.unit_price);
      const priceThb = rawPrice !== null && rawPrice > 0 ? Math.round(rawPrice * 100) / 100 : null;
      if (sourcePrice !== null && priceThb !== null && minPrice !== null && maxPrice !== null) {
        if (priceThb < minPrice || priceThb > maxPrice) {
          excludedPriceOrSalesCount += 1;
          continue;
        }
      }

      const title =
        typeof item.product_name === 'string' && item.product_name.trim().length > 0
          ? item.product_name.trim()
          : `TikTok Shop Product ${cleanPid}`;

      const salesVolume = toFiniteNumber(item.sales_volumn);
      const revenueThb = toFiniteNumber(item.revenue);
      const videoRevenueThb = toFiniteNumber(item.video_revenue);
      const liveRevenueThb = toFiniteNumber(item.live_revenue);
      const revenueGrowthRate = toFiniteNumber(item.revenue_growth_rate);
      const launchDate =
        typeof item.launch_date === 'string' && item.launch_date.trim() !== ''
          ? item.launch_date.trim()
          : null;

      // Free 0-credit server cache check for already-enriched product/shop records!
      const cachedPd = getServerCachedProductDetail(cleanPid);
      const effectiveShopId = cachedPd?.productShopId ?? rawSid;
      const cachedSd = effectiveShopId ? getServerCachedShopDetail(effectiveShopId) : null;

      let imageOriginUrl = extractRawKalodataImageUrl(item);
      if (!imageOriginUrl && cachedPd?.masterImageUrl) {
        const normalizedCachedImg = normalizeExternalImageUrl(cachedPd.masterImageUrl);
        if (normalizedCachedImg && isProxyableImageUrl(normalizedCachedImg)) {
          imageOriginUrl = normalizedCachedImg;
        }
      }
      if (imageOriginUrl) {
        registerVerifiedImage(imageOriginUrl, 'image/jpeg');
      }

      const shopName =
        cachedSd?.shopName ??
        cachedPd?.sellerName ??
        (typeof item.seller_name === 'string' && item.seller_name.trim() !== ''
          ? item.seller_name.trim()
          : effectiveShopId
            ? `Seller #${effectiveShopId}`
            : 'TikTok Shop Seller');

      const titleSimilarityPct = computeTitleSimilarityPct(product.name, title);
      const priceProximityScore =
        sourcePrice !== null && priceThb !== null
          ? Math.max(0, 100 - Math.round((Math.abs(priceThb - sourcePrice) / sourcePrice) * 100))
          : 50;

      const estimatedCommissionPerSaleThb =
        priceThb !== null && priceThb > 0
          ? Math.round((priceThb * commissionRate) / 100)
          : null;

      preCandidates.push({
        rawItem: item,
        productId: cleanPid,
        shopId: effectiveShopId,
        shopName,
        title,
        imageOriginUrl,
        priceThb,
        commissionRate,
        estimatedCommissionPerSaleThb,
        salesVolume: cachedPd?.salesVolume ?? salesVolume,
        revenueThb: cachedPd?.revenueThb ?? revenueThb,
        videoRevenueThb: cachedPd?.videoRevenueThb ?? videoRevenueThb,
        liveRevenueThb: cachedPd?.liveRevenueThb ?? liveRevenueThb,
        revenueGrowthRate: revenueGrowthRate ?? cachedPd?.revenueGrowthRate ?? null,
        launchDate: cachedPd?.launchDate ?? launchDate,
        titleSimilarityPct,
        priceProximityScore,
        cachedPd,
        cachedSd,
      });
    }

    // Order pre-candidates by likelihood of being the EXACT SAME physical product before sending top 12 to Gemini Vision
    preCandidates.sort((a, b) => {
      const scoreA = a.titleSimilarityPct * 0.72 + a.priceProximityScore * 0.28;
      const scoreB = b.titleSimilarityPct * 0.72 + b.priceProximityScore * 0.28;
      return scoreB - scoreA;
    });

    const shortlist = preCandidates.slice(0, MAX_RETURNED_CANDIDATES);

    // Step 1.5: 0-credit image recovery for shortlisted candidates missing a trusted CDN thumbnail
    // (verifies non-allowlisted Kalodata master_image_url safely, or recovers from live TH TikTok PDP)
    const missingImageShortlist = shortlist.filter((c) => !c.imageOriginUrl);
    if (missingImageShortlist.length > 0) {
      const liveImageResolver =
        testOverrides?.resolveLiveProductImage ??
        (!testOverrides?.fetchProductRank ? resolveLiveTikTokProductImageUrl : null);

      const recoveryQueue = [...missingImageShortlist];
      const recoveryWorkers = Array.from(
        { length: Math.min(4, recoveryQueue.length) },
        async () => {
          while (recoveryQueue.length > 0) {
            const next = recoveryQueue.shift();
            if (!next) continue;

            // 1) If Kalodata returned a valid public HTTPS image on a CDN not yet in the static allowlist,
            // verify its raster magic bytes safely (SSRF-guarded) before allowlisting.
            if (!testOverrides?.fetchProductRank) {
              const plausibleRaw = extractPlausibleUnverifiedImageUrl(next.rawItem);
              if (plausibleRaw) {
                const verified = await verifyKalodataImageUrl(plausibleRaw);
                if (verified.imageVerified && verified.imageOriginUrl) {
                  next.imageOriginUrl = verified.imageOriginUrl;
                  continue;
                }
              }
            }

            // 2) Fallback: 0-credit public Thailand TikTok Shop PDP og:image recovery
            if (liveImageResolver) {
              const recovered = await liveImageResolver(next.productId);
              const normalizedRecovered = normalizeExternalImageUrl(recovered);
              if (normalizedRecovered && isPlausibleProductImageUrl(normalizedRecovered)) {
                registerVerifiedImage(normalizedRecovered, 'image/jpeg');
                next.imageOriginUrl = normalizedRecovered;
              }
            }
          }
        }
      );
      await Promise.all(recoveryWorkers);
    }

    // Step 2: Visual Exact-Same-Product Verification (Gemini Vision — 0 Kalodata credits)
    let visualStatus: SameProductVisualStatus = 'skipped-by-user';
    let visualNoteEn =
      'AI visual check was turned off. Confirm identical products using the side-by-side thumbnails below.';
    let visualNoteMy =
      'AI ပုံတိုက်စစ်မှုကို ပိတ်ထားပါသည်။ ဘေးချင်းယှဉ်ပုံများဖြင့် ချွတ်စွပ်တူ/မတူ မျက်မြင်စစ်ဆေးနိုင်ပါသည်။';
    let visualVerdicts = new Map<string, VisualMatchVerdictItem>();

    if (enableVisualVerification && shortlist.length > 0) {
      const visionResult = testOverrides?.verifyVisualMatches
        ? await testOverrides.verifyVisualMatches({
            sourceProduct: product,
            sourceImageUrl: sourceImageOrigin,
            candidates: shortlist.slice(0, MAX_VISUAL_CANDIDATES).map((c) => ({
              candidateId: c.productId,
              title: c.title,
              priceThb: c.priceThb,
              imageUrl: c.imageOriginUrl,
            })),
          })
        : await runGeminiVisualSameProductCheck({
            sourceProduct: product,
            sourceImageUrl: sourceImageOrigin,
            candidates: shortlist.slice(0, MAX_VISUAL_CANDIDATES).map((c) => ({
              candidateId: c.productId,
              title: c.title,
              priceThb: c.priceThb,
              imageUrl: c.imageOriginUrl,
            })),
          });

      visualStatus = visionResult.status;
      visualNoteEn = visionResult.noteEn;
      visualNoteMy = visionResult.noteMy;
      visualVerdicts = visionResult.verdicts;
    }

    // Filter out AI-confirmed `different` products automatically
    let excludedDifferentProductCount = 0;
    const survivingShortlist = shortlist.filter((c) => {
      const verdict = visualVerdicts.get(c.productId);
      if (verdict && verdict.matchTier === 'different') {
        excludedDifferentProductCount += 1;
        return false;
      }
      return true;
    });

    // Step 3: Resolve real canonical Thailand TikTok Shop PDP URLs (0 credits)
    const numericIdsForLinks = survivingShortlist
      .map((c) => extractNumericTikTokProductId(c.productId))
      .filter((id): id is string => Boolean(id));

    const resolvedUrlMap =
      numericIdsForLinks.length > 0
        ? testOverrides?.resolveTikTokUrlsBatch
          ? await testOverrides.resolveTikTokUrlsBatch(numericIdsForLinks)
          : await resolveCanonicalTikTokProductUrlsBatch(numericIdsForLinks, {
              concurrency: 6,
              perItemTimeoutMs: 1600,
              totalBudgetMs: 2400,
            })
        : new Map<string, string>();

    const srcKm = product.kalodataMetrics;

    // Step 4: Build complete SameProductCandidate + full valid ResearchProduct (for Save / Deep Dive)
    const allBuiltCandidates: SameProductCandidate[] = survivingShortlist.map((c) => {
      const numericPid = extractNumericTikTokProductId(c.productId);
      const tiktokShopUrl =
        (numericPid ? resolvedUrlMap.get(numericPid) : null) ??
        (numericPid
          ? buildFallbackTikTokShopUrl(numericPid)
          : `https://shop.tiktok.com/th/pdp/product/${encodeURIComponent(c.productId)}`);

      const priCatObj =
        c.rawItem.pri_category && typeof c.rawItem.pri_category === 'object'
          ? (c.rawItem.pri_category as Record<string, unknown>)
          : null;
      const mappedCategory =
        resolveProductCategoryFromKalodataId(
          priCatObj?.category_id !== undefined ? String(priCatObj.category_id) : null,
          typeof priCatObj?.category_name === 'string' ? priCatObj.category_name : null,
          params.resolvedCategoryIdMap
        ) ?? product.category;

      const proxiedImg = buildProxiedImageUrl(c.imageOriginUrl, c.productId);

      let researchProduct = buildKalodataProductSummary(
        c.rawItem,
        mappedCategory,
        categoryIdsUsed,
        'last30Day',
        researchedAt,
        {
          imageVerified: Boolean(c.imageOriginUrl),
          imageUrl: proxiedImg,
          imageOriginUrl: c.imageOriginUrl,
          imageSourceNoteEn: c.imageOriginUrl
            ? 'Verified Thailand TikTok Shop product image from Kalodata.'
            : 'Product image unavailable in Kalodata rank response.',
          imageSourceNoteMy: c.imageOriginUrl
            ? 'Kalodata မှ အတည်ပြုပြီး ထိုင်း TikTok Shop Product ပုံ။'
            : 'Kalodata Rank ဒေတာတွင် Product ပုံ မပါဝင်ပါ။',
        },
        {
          researchMode: 'fast',
          productDetail: null,
          shopDetail: null,
          commentInsight: null,
          sourceMode: 'product-rank',
          customTikTokShopUrl: tiktokShopUrl,
        }
      );

      // Merge any FREE already-cached Product Detail / Shop Detail
      if (c.cachedPd || c.cachedSd) {
        researchProduct = mergeEnrichmentIntoProduct(
          researchProduct,
          {
            productDetail: c.cachedPd ?? undefined,
            shopDetail: c.cachedSd ?? undefined,
          },
          { salesWeightPct: 50 }
        ).product;
      }

      const verdict = visualVerdicts.get(c.productId);
      const matchTier: SameProductMatchTier = verdict
        ? verdict.matchTier
        : 'unverified-visual';

      const creatorNumber = c.cachedPd?.creatorNumber ?? null;
      const videoNumber = c.cachedPd?.videoNumber ?? null;

      const assessment = computeEarlyMoverAssessment({
        source: {
          priceThb: product.priceThb,
          commissionRate: product.commissionRate,
          salesVolume: srcKm?.salesVolume ?? null,
          revenueThb: srcKm?.revenueThb ?? null,
          videoRevenueThb: srcKm?.videoRevenueThb ?? null,
          creatorNumber: srcKm?.creatorNumber ?? null,
          launchDate: srcKm?.launchDate ?? null,
        },
        candidate: {
          priceThb: c.priceThb,
          commissionRate: c.commissionRate,
          salesVolume: c.salesVolume,
          revenueThb: c.revenueThb,
          videoRevenueThb: c.videoRevenueThb,
          revenueGrowthRate: c.revenueGrowthRate,
          creatorNumber,
          launchDate: c.launchDate,
        },
      });

      return {
        productId: c.productId,
        shopId: c.shopId,
        shopName: c.shopName,
        title: c.title,
        imageUrl: proxiedImg,
        imageOriginUrl: c.imageOriginUrl,
        tiktokShopUrl,
        priceThb: c.priceThb,
        commissionRate: c.commissionRate,
        estimatedCommissionPerSaleThb: c.estimatedCommissionPerSaleThb,
        salesVolume: c.salesVolume,
        revenueThb: c.revenueThb,
        videoRevenueThb: c.videoRevenueThb,
        liveRevenueThb: c.liveRevenueThb,
        revenueGrowthRate: c.revenueGrowthRate,
        launchDate: c.launchDate,
        creatorNumber,
        videoNumber,
        shopSellerType: c.cachedSd?.sellerType ?? null,
        shopRevenueThb: c.cachedSd?.revenueThb ?? null,
        stage2Verified: Boolean(c.cachedPd),
        shopTrustVerified: Boolean(c.cachedSd),
        matchTier,
        visualMatchConfidence: verdict ? verdict.confidence : null,
        visualMatchReasonEn:
          verdict?.reasonEn ??
          `Title similarity ${c.titleSimilarityPct}% — verify identical product visually side-by-side.`,
        visualMatchReasonMy:
          verdict?.reasonMy ??
          `နာမည်တူညီမှု ${c.titleSimilarityPct}% — ဘေးချင်းယှဉ်ပုံဖြင့် ချွတ်စွပ်တူ/မတူ မျက်မြင်စစ်ဆေးပါ။`,
        titleSimilarityPct: c.titleSimilarityPct,
        ...assessment,
        researchProduct,
      };
    });

    const sortedAll = sortSameProductCandidates(allBuiltCandidates);

    const fullResponseForCache: SameProductSearchResponse = {
      ok: true,
      sourceProductId: sourceNumericId,
      sourceShopId,
      sourceImageUrl: buildProxiedImageUrl(sourceImageOrigin, sourceNumericId),
      keywordUsed,
      categoryIdsUsed,
      fromCache: false,
      visualVerificationStatus: visualStatus,
      visualVerificationNoteEn: visualNoteEn,
      visualVerificationNoteMy: visualNoteMy,
      totalRankCandidatesFetched: rawItems.length,
      excludedSameProductOrShopCount,
      excludedPriceOrSalesCount,
      excludedDifferentProductCount,
      visuallyCheckedCount: visualVerdicts.size,
      candidates: sortedAll,
      creditsSpent: actualCreditsSpent,
      estimatedUsdCost: roundCredits3(actualCreditsSpent * KALODATA_USD_PER_CREDIT),
      searchedAt: researchedAt,
    };

    // Store unfiltered surviving set in 24h server cache so toggling Close Variants / Zero Sales is 0 cr!
    setBoundedSameProductCache(cacheKey, fullResponseForCache);

    const visibleCandidates = sortedAll.filter((c) => {
      if (!includeCloseVariants && c.matchTier === 'close-variant') return false;
      if (!includeZeroSales && (c.salesVolume === null || c.salesVolume <= 0)) return false;
      return true;
    });

    return {
      ...fullResponseForCache,
      candidates: visibleCandidates,
    };
  } finally {
    if (reservationId && !reservationFinalized) {
      try {
        if (upstreamDispatched) {
          await ledger.markReservationUncertain({
            scopeKey,
            reservationId,
            requestedLimitCredits: spendingLimitCredits,
            reason: 'aborted-after-dispatch',
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
        // Best-effort lease cleanup; TTL expires automatically
      }
    }
  }
}
