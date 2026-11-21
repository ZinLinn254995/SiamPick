import type {
  KalodataReviewInsightData,
  MyanmarConfidenceLevel,
  MyanmarLanguageAnalysis,
  MyanmarLanguageEvidenceItem,
  MyanmarMatchType,
  MyanmarReviewEvidenceItem,
  MyanmarReviewStatus,
  MyanmarSignalSource,
  MyanmarSignalSourceStatus,
  MyanmarVideoEvidenceItem,
  ResearchProduct,
} from '../types/product.ts';

/**
 * Deterministic Myanmar Review & Language Signal Detector for Thailand TikTok Shop products.
 *
 * Strict integrity & safety rules:
 * 1. Real data only — NEVER invents, extrapolates, or uses LLMs to guess Myanmar reviews.
 * 2. Too-short guard — a review must contain at least MIN_MYANMAR_REVIEW_LETTERS (4) actual
 *    Myanmar alphabetic letters (excluding digits/punctuation/whitespace/emojis) to confirm Myanmar language.
 * 3. Honest status separation — products without retrievable reviews are strictly classified as
 *    'review-unavailable' (NEVER conflated with 'checked-no-match').
 * 4. Mixed Thai + Burmese support — detects Myanmar script cleanly inside mixed Thai/Burmese reviews
 *    without counting Thai characters as Myanmar characters.
 * 5. Thailand Market Scope — NEVER infers buyer nationality, ethnicity, or non-Thailand location.
 */

// Full Myanmar Unicode script blocks (letters, medials, vowels, digits, punctuation)
const MYANMAR_SCRIPT_CHAR_RE = /[\u1000-\u109F\uAA60-\uAA7F\uA9E0-\uA9FF]/g;
const MYANMAR_SCRIPT_SEGMENT_RE = /[\u1000-\u109F\uAA60-\uAA7F\uA9E0-\uA9FF]+/g;

// Myanmar alphabetic/combining letters ONLY (excludes Myanmar digits U+1040..U+1049 and punctuation U+104A..U+104F)
const MYANMAR_LETTER_CHAR_RE = /[\u1000-\u103F\u1050-\u109F\uAA60-\uAA7F\uA9E0-\uA9FF]/g;

// Thai Unicode block (for detecting mixed Thai + Burmese reviews)
const THAI_SCRIPT_RE = /[\u0E00-\u0E7F]/;

// Minimum Myanmar alphabetic characters required in a single review to confirm Myanmar language
// (rejects ambiguous 1–3 char fragments, isolated symbols, or Myanmar numerals alone)
export const MIN_MYANMAR_REVIEW_LETTERS = 4;

// Zawgyi-specific heuristics:
// - Codepoints U+1060..U+1097 used for Zawgyi medials/stacked forms (unused in standard Burmese Unicode)
// - Visual-order E-vowel U+1031 or medial Ra U+103C at word start immediately before a consonant
// - Zawgyi U+1033 followed by U+1031
const ZAWGYI_HEURISTIC_RE =
  /[\u1060-\u1097]|(?:^|[\s(["'“\-/])[\u1031\u103C][\u1000-\u1021]|\u1033\u1031/;

export const MARKET_SCOPE_NOTE_EN =
  'Detected from Myanmar-language text in Thailand TikTok Shop product reviews only. Does not infer buyer nationality, ethnicity, or non-Thailand location.';

export const MARKET_SCOPE_NOTE_MY =
  'Thailand TikTok Shop ရှိ Product Review စာသားများထဲမှ မြန်မာဘာသာစကား ပါဝင်မှုကိုသာ စစ်ဆေးအတည်ပြုထားပါသည်။ ဝယ်သူ၏ လူမျိုး၊ နိုင်ငံသား သို့မဟုတ် တည်နေရာကို မကောက်ချက်ချပါ။';

export const VIDEO_MARKET_SCOPE_NOTE_EN =
  'Detected from Myanmar-language text or explicit Myanmar hashtags/keywords in Thailand TikTok Shop promotional videos only. Does not infer buyer nationality, ethnicity, or non-Thailand location.';

export const VIDEO_MARKET_SCOPE_NOTE_MY =
  'Thailand TikTok Shop ရှိ ကြော်ငြာ TikTok Video Caption / Hashtag / Creator စာသားများထဲမှ မြန်မာဘာသာစကား ပါဝင်မှုကိုသာ စစ်ဆေးအတည်ပြုထားပါသည်။ ဝယ်သူ၏ လူမျိုး၊ နိုင်ငံသား သို့မဟုတ် တည်နေရာကို မကောက်ချက်ချပါ။';

// Explicit Myanmar-specific hashtags & unambiguous English/romanized Burmese terms for video captions/hashtags.
// Strictly avoids ambiguous 2-letter codes like "my" or "mm" (millimeter).
const MYANMAR_VIDEO_KEYWORD_RE =
  /(?:^|[\s#@.,!?:;(\["'“\-/|])((?:#)?(?:myanmar(?:inthailand|tiktok|shop|girl|boy|food|beauty|fashion|people|style|thailand)?|burmese(?:food|girl|in(?:thailand|bangkok)|style)?|bangkokmyanmar|thailandmyanmar|tiktokshopmyanmar|yangon|mandalay|thanakha|thanaka|longyi|htamein|mohinga|laphet|mingalaba|mingalarpar))(?=$|[\s.,!?:;)\]"'”\-/|#])/gi;

const SOURCE_UNAVAILABLE_NOTES: Record<MyanmarSignalSource, { en: string; my: string }> = {
  title: {
    en: 'Product title unavailable.',
    my: 'Product ခေါင်းစဉ် မရရှိပါ။',
  },
  description: {
    en: 'Product description is not returned by current Kalodata Rank/Detail payload.',
    my: 'လက်ရှိ Kalodata Rank/Detail Data တွင် Product Description စာသား မပါဝင်ပါ။',
  },
  reviews: {
    en: 'Buyer review insight unavailable for this product.',
    my: 'ဤ Product အတွက် Buyer Review Insight မရရှိပါ။',
  },
  comments: {
    en: 'Individual buyer reviews are unavailable from Kalodata for this product.',
    my: 'ဤ Product အတွက် Kalodata မှ ဝယ်သူ Review မူရင်းစာသားများ မရရှိနိုင်ပါ။',
  },
  videoContent: {
    en: 'TikTok video captions & creator text are unavailable from integrated Kalodata endpoints.',
    my: 'လက်ရှိ Kalodata API များတွင် TikTok Video Caption နှင့် Creator စာသား မပါဝင်ပါ။',
  },
};

export interface ReviewTextItem {
  text: string;
  rating?: number | null;
  pageNumber?: number;
}

export interface SingleReviewDetectionResult {
  matched: boolean;
  tooShort: boolean;
  myanmarLetterCount: number;
  matchType: 'myanmar-script' | 'zawgyi-script' | null;
  isMixedThaiBurmese: boolean;
  snippet: string;
}

export interface MyanmarReviewAnalysisResult {
  reviewStatus: MyanmarReviewStatus;
  matched: boolean;
  confidence: MyanmarConfidenceLevel;
  totalReviewsChecked: number;
  matchedReviewCount: number;
  skippedTooShortCount: number;
  matchedReviews: MyanmarReviewEvidenceItem[];
  totalMyanmarLetterCount: number;
  marketScopeNoteEn: string;
  marketScopeNoteMy: string;
}

export interface MyanmarSignalInput {
  title?: string | null;
  description?: string | null;
  reviews?: string[] | null;
  comments?: Array<string | ReviewTextItem> | null;
  videoContent?: string[] | null;
}

const MAX_CACHE_ENTRIES = 500;
const detectionCache = new Map<string, MyanmarLanguageAnalysis>();

export function clearMyanmarLanguageDetectionCache(): void {
  detectionCache.clear();
}

function extractContextSnippet(text: string, matchIndex: number, matchLength: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= 160) return clean;
  const start = Math.max(0, matchIndex - 45);
  const end = Math.min(clean.length, matchIndex + matchLength + 75);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < clean.length ? '…' : '';
  return `${prefix}${clean.slice(start, end).trim()}${suffix}`;
}

/**
 * Deterministic Myanmar language check for a SINGLE product review text.
 * - Detects Myanmar Unicode & Zawgyi script.
 * - Supports mixed Thai + Burmese reviews (counts ONLY Myanmar letters, never Thai chars).
 * - Rejects text that is too short (< MIN_MYANMAR_REVIEW_LETTERS Myanmar letters) so ambiguous
 *   short strings or isolated digits/symbols NEVER produce false positives.
 */
export function detectMyanmarInSingleReview(rawText: string): SingleReviewDetectionResult {
  const text = typeof rawText === 'string' ? rawText.replace(/\s+/g, ' ').trim() : '';
  if (!text) {
    return {
      matched: false,
      tooShort: false,
      myanmarLetterCount: 0,
      matchType: null,
      isMixedThaiBurmese: false,
      snippet: '',
    };
  }

  const letterMatches = text.match(MYANMAR_LETTER_CHAR_RE);
  const myanmarLetterCount = letterMatches ? letterMatches.length : 0;
  const hasThai = THAI_SCRIPT_RE.test(text);

  if (myanmarLetterCount === 0) {
    // Check if there were only Myanmar digits/punctuation (e.g. "၁၂") — treat as too short / unconfirmable
    const anyMyanmarCodepoint = MYANMAR_SCRIPT_CHAR_RE.test(text);
    MYANMAR_SCRIPT_CHAR_RE.lastIndex = 0;
    return {
      matched: false,
      tooShort: anyMyanmarCodepoint,
      myanmarLetterCount: 0,
      matchType: null,
      isMixedThaiBurmese: false,
      snippet: '',
    };
  }

  if (myanmarLetterCount < MIN_MYANMAR_REVIEW_LETTERS) {
    return {
      matched: false,
      tooShort: true,
      myanmarLetterCount,
      matchType: null,
      isMixedThaiBurmese: hasThai,
      snippet: '',
    };
  }

  const segments = text.match(MYANMAR_SCRIPT_SEGMENT_RE) ?? [];
  const firstSegIdx = text.search(MYANMAR_SCRIPT_SEGMENT_RE);
  const firstSegLen = segments[0]?.length ?? myanmarLetterCount;
  const isZawgyi = ZAWGYI_HEURISTIC_RE.test(text);

  return {
    matched: true,
    tooShort: false,
    myanmarLetterCount,
    matchType: isZawgyi ? 'zawgyi-script' : 'myanmar-script',
    isMixedThaiBurmese: hasThai,
    snippet: extractContextSnippet(text, Math.max(0, firstSegIdx), firstSegLen),
  };
}

function normalizeReviewItems(
  items: Array<string | ReviewTextItem> | null | undefined
): ReviewTextItem[] {
  if (!Array.isArray(items)) return [];
  const out: ReviewTextItem[] = [];
  for (const item of items) {
    if (typeof item === 'string') {
      const clean = item.trim();
      if (clean.length > 0) out.push({ text: clean });
    } else if (item && typeof item === 'object' && typeof item.text === 'string') {
      const clean = item.text.trim();
      if (clean.length > 0) {
        out.push({
          text: clean,
          rating: typeof item.rating === 'number' ? item.rating : null,
          pageNumber: typeof item.pageNumber === 'number' ? item.pageNumber : undefined,
        });
      }
    }
  }
  return out;
}

function computeReviewConfidence(
  matchedReviewCount: number,
  totalMyanmarLetterCount: number
): MyanmarConfidenceLevel {
  if (matchedReviewCount <= 0 || totalMyanmarLetterCount < MIN_MYANMAR_REVIEW_LETTERS) {
    return 'None';
  }
  // High: >= 2 confirmed Myanmar reviews OR a substantial review (>= 12 Myanmar letters)
  if (matchedReviewCount >= 2 || totalMyanmarLetterCount >= 12) {
    return 'High';
  }
  // Medium: 1 confirmed Myanmar review with 6..11 Myanmar letters
  if (totalMyanmarLetterCount >= 6) {
    return 'Medium';
  }
  // Low: 1 short confirmed Myanmar review (4..5 Myanmar letters)
  return 'Low';
}

/**
 * Analyzes ALL retrieved reviews for a single Thailand TikTok Shop product.
 * - Returns reviewStatus: 'review-unavailable' when no real reviews could be retrieved (NEVER 'checked-no-match').
 * - Matches the product if AT LEAST 1 review contains verifiable Myanmar language (>= 4 Myanmar letters).
 * - Preserves verifiable review snippet evidence (up to 5 matched snippets) + exact matched/checked counts.
 */
export function analyzeProductReviewsForMyanmar(
  rawReviews: Array<string | ReviewTextItem> | null | undefined
): MyanmarReviewAnalysisResult {
  const reviews = normalizeReviewItems(rawReviews);

  if (reviews.length === 0) {
    return {
      reviewStatus: 'review-unavailable',
      matched: false,
      confidence: 'None',
      totalReviewsChecked: 0,
      matchedReviewCount: 0,
      skippedTooShortCount: 0,
      matchedReviews: [],
      totalMyanmarLetterCount: 0,
      marketScopeNoteEn: MARKET_SCOPE_NOTE_EN,
      marketScopeNoteMy: MARKET_SCOPE_NOTE_MY,
    };
  }

  let matchedReviewCount = 0;
  let skippedTooShortCount = 0;
  let totalMyanmarLetterCount = 0;
  const matchedReviews: MyanmarReviewEvidenceItem[] = [];
  const seenSnippets = new Set<string>();

  for (let i = 0; i < reviews.length; i += 1) {
    const item = reviews[i];
    const check = detectMyanmarInSingleReview(item.text);

    if (!check.matched) {
      if (check.tooShort) {
        skippedTooShortCount += 1;
      }
      continue;
    }

    matchedReviewCount += 1;
    totalMyanmarLetterCount += check.myanmarLetterCount;

    const dedupeKey = check.snippet.toLowerCase();
    if (!seenSnippets.has(dedupeKey) && matchedReviews.length < 5) {
      seenSnippets.add(dedupeKey);
      matchedReviews.push({
        reviewIndex: i + 1,
        snippet: check.snippet,
        myanmarLetterCount: check.myanmarLetterCount,
        matchType: check.matchType!,
        isMixedThaiBurmese: check.isMixedThaiBurmese,
        ...(item.rating !== undefined && item.rating !== null ? { rating: item.rating } : {}),
        ...(item.pageNumber !== undefined ? { pageNumber: item.pageNumber } : {}),
      });
    }
  }

  const matched = matchedReviewCount >= 1 && matchedReviews.length > 0;
  const reviewStatus: MyanmarReviewStatus = matched ? 'matched' : 'checked-no-match';
  const confidence = computeReviewConfidence(matchedReviewCount, totalMyanmarLetterCount);

  return {
    reviewStatus,
    matched,
    confidence,
    totalReviewsChecked: reviews.length,
    matchedReviewCount,
    skippedTooShortCount,
    matchedReviews,
    totalMyanmarLetterCount,
    marketScopeNoteEn: MARKET_SCOPE_NOTE_EN,
    marketScopeNoteMy: MARKET_SCOPE_NOTE_MY,
  };
}

function normalizeStringList(items: string[] | null | undefined): string[] {
  if (!Array.isArray(items)) return [];
  const out: string[] = [];
  for (const raw of items) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (trimmed.length > 0) out.push(trimmed);
  }
  return out;
}

function buildCacheKey(input: MyanmarSignalInput): string {
  const t = typeof input.title === 'string' ? input.title.trim() : '';
  const d = typeof input.description === 'string' ? input.description.trim() : '';
  const r = normalizeStringList(input.reviews);
  const c = normalizeReviewItems(input.comments).map((item) => item.text);
  const v = normalizeStringList(input.videoContent);
  return JSON.stringify([t, d, r, c, v]);
}

function evaluateNonReviewSource(
  source: Exclude<MyanmarSignalSource, 'comments'>,
  texts: string[]
): {
  status: MyanmarSignalSourceStatus;
  evidences: MyanmarLanguageEvidenceItem[];
} {
  if (texts.length === 0) {
    return {
      status: {
        source,
        availability: 'unavailable',
        checkedItemCount: 0,
        noteEn: SOURCE_UNAVAILABLE_NOTES[source].en,
        noteMy: SOURCE_UNAVAILABLE_NOTES[source].my,
      },
      evidences: [],
    };
  }

  const evidences: MyanmarLanguageEvidenceItem[] = [];
  const seenSnippets = new Set<string>();

  for (const text of texts) {
    const check = detectMyanmarInSingleReview(text);
    if (!check.matched || !check.matchType) continue;
    const dedupeKey = `${check.matchType}:${check.snippet.toLowerCase()}`;
    if (seenSnippets.has(dedupeKey)) continue;
    seenSnippets.add(dedupeKey);

    const segments = text.match(MYANMAR_SCRIPT_SEGMENT_RE) ?? [];
    evidences.push({
      source,
      matchType: check.matchType,
      snippet: check.snippet,
      matchedTerms: Array.from(new Set(segments)).slice(0, 5),
      myanmarCharCount: check.myanmarLetterCount,
    });
    if (evidences.length >= 3) break;
  }

  return {
    status: {
      source,
      availability: evidences.length > 0 ? 'matched' : 'checked-no-match',
      checkedItemCount: texts.length,
    },
    evidences,
  };
}

/**
 * Full Myanmar language & review analysis for a Thailand TikTok Shop product.
 * Primary discovery signal is verified individual buyer reviews (`comments` -> `reviewStatus === 'matched'`).
 * Missing sources remain honestly labeled `'unavailable'` and reviews without data are `'review-unavailable'`.
 */
export function detectMyanmarLanguageSignals(
  input: MyanmarSignalInput,
  options?: { bypassCache?: boolean; reviewOnlyMatching?: boolean }
): MyanmarLanguageAnalysis {
  const reviewOnlyMatching = options?.reviewOnlyMatching !== false;
  const cacheKey = options?.bypassCache
    ? null
    : `${reviewOnlyMatching ? 'rev:' : 'all:'}${buildCacheKey(input)}`;

  if (cacheKey && detectionCache.has(cacheKey)) {
    const cached = detectionCache.get(cacheKey)!;
    detectionCache.delete(cacheKey);
    detectionCache.set(cacheKey, cached);
    return cached;
  }

  const titleTexts =
    typeof input.title === 'string' && input.title.trim().length > 0 ? [input.title.trim()] : [];
  const descTexts =
    typeof input.description === 'string' && input.description.trim().length > 0
      ? [input.description.trim()]
      : [];
  const reviewSummaryTexts = normalizeStringList(input.reviews);
  const commentItems = normalizeReviewItems(input.comments);
  const videoTexts = normalizeStringList(input.videoContent);

  const reviewAnalysis = analyzeProductReviewsForMyanmar(commentItems);

  const commentEvidences: MyanmarLanguageEvidenceItem[] = reviewAnalysis.matchedReviews.map(
    (ev) => ({
      source: 'comments',
      matchType: ev.matchType as MyanmarMatchType,
      snippet: ev.snippet,
      matchedTerms: Array.from(new Set(ev.snippet.match(MYANMAR_SCRIPT_SEGMENT_RE) ?? [])).slice(
        0,
        5
      ),
      myanmarCharCount: ev.myanmarLetterCount,
    })
  );

  const commentStatus: MyanmarSignalSourceStatus =
    reviewAnalysis.reviewStatus === 'review-unavailable'
      ? {
          source: 'comments',
          availability: 'unavailable',
          checkedItemCount: 0,
          noteEn: SOURCE_UNAVAILABLE_NOTES.comments.en,
          noteMy: SOURCE_UNAVAILABLE_NOTES.comments.my,
        }
      : {
          source: 'comments',
          availability: reviewAnalysis.reviewStatus === 'matched' ? 'matched' : 'checked-no-match',
          checkedItemCount: reviewAnalysis.totalReviewsChecked,
        };

  const titleRes = evaluateNonReviewSource('title', titleTexts);
  const descRes = evaluateNonReviewSource('description', descTexts);
  const reviewSummaryRes = evaluateNonReviewSource('reviews', reviewSummaryTexts);
  const videoRes = evaluateNonReviewSource('videoContent', videoTexts);

  const sourceStatuses: Record<MyanmarSignalSource, MyanmarSignalSourceStatus> = {
    title: titleRes.status,
    description: descRes.status,
    reviews: reviewSummaryRes.status,
    comments: commentStatus,
    videoContent: videoRes.status,
  };

  // In Myanmar Review Discovery mode (default), product match is strictly determined by >= 1 confirmed Myanmar review!
  const evidences: MyanmarLanguageEvidenceItem[] = reviewOnlyMatching
    ? [...commentEvidences]
    : [
        ...commentEvidences,
        ...reviewSummaryRes.evidences,
        ...titleRes.evidences,
        ...descRes.evidences,
        ...videoRes.evidences,
      ];

  const matchedSources: MyanmarSignalSource[] = reviewOnlyMatching
    ? reviewAnalysis.matched
      ? ['comments']
      : []
    : (['comments', 'reviews', 'title', 'description', 'videoContent'] as MyanmarSignalSource[]).filter(
        (src) => sourceStatuses[src].availability === 'matched'
      );

  const matched = reviewOnlyMatching
    ? reviewAnalysis.matched && reviewAnalysis.matchedReviewCount >= 1
    : evidences.length > 0 && matchedSources.length > 0;

  const totalMyanmarCharCount = reviewOnlyMatching
    ? reviewAnalysis.totalMyanmarLetterCount
    : evidences.reduce((sum, item) => sum + item.myanmarCharCount, 0);

  const confidence: MyanmarConfidenceLevel = reviewOnlyMatching
    ? reviewAnalysis.confidence
    : matched
      ? computeReviewConfidence(Math.max(1, evidences.length), totalMyanmarCharCount)
      : 'None';

  const result: MyanmarLanguageAnalysis = {
    matched,
    confidence,
    matchedSources,
    evidences,
    sourceStatuses,
    totalMyanmarCharCount,
    reviewStatus: reviewAnalysis.reviewStatus,
    totalReviewsChecked: reviewAnalysis.totalReviewsChecked,
    matchedReviewCount: reviewAnalysis.matchedReviewCount,
    skippedTooShortCount: reviewAnalysis.skippedTooShortCount,
    matchedReviews: reviewAnalysis.matchedReviews,
    marketScopeNoteEn: MARKET_SCOPE_NOTE_EN,
    marketScopeNoteMy: MARKET_SCOPE_NOTE_MY,
  };

  if (cacheKey) {
    if (detectionCache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = detectionCache.keys().next().value;
      if (oldestKey !== undefined) {
        detectionCache.delete(oldestKey);
      }
    }
    detectionCache.set(cacheKey, result);
  }

  return result;
}

function readOptionalString(
  record: Record<string, unknown> | null | undefined,
  keys: string[]
): string | null {
  if (!record || typeof record !== 'object') return null;
  for (const key of keys) {
    const val = record[key];
    if (typeof val === 'string' && val.trim().length > 0) {
      return val.trim();
    }
  }
  return null;
}

/**
 * Extracts ONLY real text fields present in raw Kalodata API payloads & parsed Comment Insight.
 * Never fabricates text for missing fields.
 */
export function extractRawMyanmarTextCandidates(params: {
  rawItem?: Record<string, unknown> | null;
  productDetail?: { productDescription?: string | null; rawPayload?: Record<string, unknown> | null } | null;
  commentInsight?: {
    summary?: string | null;
    positivePoints?: Array<{ point: string }>;
    painPoints?: Array<{ point: string }>;
    usageScenarios?: Array<{ point: string }>;
    rawComments?: string[];
    allRawComments?: ReviewTextItem[];
  } | null;
}): MyanmarSignalInput {
  const rawItem = params.rawItem ?? null;
  const rawDetail = params.productDetail?.rawPayload ?? null;

  const title =
    readOptionalString(rawItem, ['product_name', 'product_title', 'title', 'name']) ??
    readOptionalString(rawDetail, ['product_name', 'product_title', 'title']);

  const description =
    (typeof params.productDetail?.productDescription === 'string' &&
    params.productDetail.productDescription.trim().length > 0
      ? params.productDetail.productDescription.trim()
      : null) ??
    readOptionalString(rawItem, ['description', 'product_description', 'desc', 'product_desc']) ??
    readOptionalString(rawDetail, ['description', 'product_description', 'desc', 'product_desc']);

  const reviews: string[] = [];
  if (params.commentInsight) {
    if (
      typeof params.commentInsight.summary === 'string' &&
      params.commentInsight.summary.trim().length > 0
    ) {
      reviews.push(params.commentInsight.summary.trim());
    }
    for (const group of [
      params.commentInsight.positivePoints,
      params.commentInsight.painPoints,
      params.commentInsight.usageScenarios,
    ]) {
      if (!Array.isArray(group)) continue;
      for (const p of group) {
        if (typeof p?.point === 'string' && p.point.trim().length > 0) {
          reviews.push(p.point.trim());
        }
      }
    }
  }

  const comments: Array<string | ReviewTextItem> =
    Array.isArray(params.commentInsight?.allRawComments) &&
    params.commentInsight.allRawComments.length > 0
      ? params.commentInsight.allRawComments
      : Array.isArray(params.commentInsight?.rawComments)
        ? params.commentInsight.rawComments.filter(
            (c): c is string => typeof c === 'string' && c.trim().length > 0
          )
        : [];

  return {
    title,
    description,
    reviews: reviews.length > 0 ? reviews : null,
    comments: comments.length > 0 ? comments : null,
    videoContent: null,
  };
}

/**
 * Computes (or recomputes via cache) Myanmar review analysis from a ResearchProduct's real Kalodata data.
 * Only inspects real review/comment fields — never inspects SiamPick's own Burmese UI translations (nameMy).
 */
export function detectMyanmarLanguageForProduct(
  product: Pick<ResearchProduct, 'name' | 'kalodataMetrics'>,
  extra?: Partial<MyanmarSignalInput>
): MyanmarLanguageAnalysis {
  const reviewInsight: KalodataReviewInsightData | null | undefined =
    product.kalodataMetrics?.reviewInsight;

  const reviews: string[] = [];
  if (reviewInsight) {
    if (reviewInsight.summary) reviews.push(reviewInsight.summary);
    for (const p of reviewInsight.positivePoints ?? []) {
      if (p.point) reviews.push(p.point);
    }
    for (const p of reviewInsight.painPoints ?? []) {
      if (p.point) reviews.push(p.point);
    }
    for (const p of reviewInsight.usageScenarios ?? []) {
      if (p.point) reviews.push(p.point);
    }
  }
  if (extra?.reviews) {
    reviews.push(...extra.reviews);
  }

  const comments: Array<string | ReviewTextItem> = [
    ...(reviewInsight?.rawComments ?? []),
    ...(extra?.comments ?? []),
  ];

  const description =
    extra?.description ?? product.kalodataMetrics?.productDescription ?? null;

  return detectMyanmarLanguageSignals({
    title: extra?.title ?? product.name,
    description,
    reviews: reviews.length > 0 ? reviews : null,
    comments: comments.length > 0 ? comments : null,
    videoContent: extra?.videoContent ?? null,
  });
}

export interface VideoMyanmarCandidateInput {
  caption?: string | null;
  title?: string | null;
  hashtags?: string[] | null;
  creatorName?: string | null;
  creatorHandle?: string | null;
}

export interface VideoMyanmarDetectionResult {
  matched: boolean;
  tooShort: boolean;
  matchType: MyanmarMatchType | null;
  myanmarLetterCount: number;
  matchedTerms: string[];
  isMixedThaiBurmese: boolean;
  captionSnippet: string;
}

/**
 * Deterministic Myanmar-language detector for a Thailand TikTok Shop video record.
 * - Matches Myanmar Unicode / Zawgyi script (>= MIN_MYANMAR_REVIEW_LETTERS Myanmar alphabetic letters)
 *   in video caption, title, hashtags, or creator display name.
 * - Matches explicit unambiguous Myanmar hashtags/keywords (e.g. #myanmar, #burmese, #myanmarinthailand,
 *   #bangkokmyanmar, #yangon, #thanakha, etc.) while strictly ignoring ambiguous tokens like "mm" or "my".
 * - Detects mixed Thai + Burmese captions cleanly without counting Thai characters as Myanmar letters.
 */
export function detectMyanmarInVideoCandidate(
  video: VideoMyanmarCandidateInput
): VideoMyanmarDetectionResult {
  const parts: string[] = [];
  if (typeof video.caption === 'string' && video.caption.trim()) {
    parts.push(video.caption.trim());
  }
  if (
    typeof video.title === 'string' &&
    video.title.trim() &&
    video.title.trim() !== video.caption?.trim()
  ) {
    parts.push(video.title.trim());
  }
  if (Array.isArray(video.hashtags)) {
    const cleanTags = video.hashtags
      .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
      .map((t) => (t.trim().startsWith('#') ? t.trim() : `#${t.trim()}`));
    if (cleanTags.length > 0) {
      parts.push(cleanTags.join(' '));
    }
  }
  if (typeof video.creatorName === 'string' && video.creatorName.trim()) {
    parts.push(video.creatorName.trim());
  }
  if (typeof video.creatorHandle === 'string' && video.creatorHandle.trim()) {
    parts.push(video.creatorHandle.trim());
  }

  const combined = parts.join(' · ').replace(/\s+/g, ' ').trim();
  if (!combined) {
    return {
      matched: false,
      tooShort: false,
      matchType: null,
      myanmarLetterCount: 0,
      matchedTerms: [],
      isMixedThaiBurmese: false,
      captionSnippet: '',
    };
  }

  const primaryDisplay = (video.caption?.trim() || video.title?.trim() || combined).replace(
    /\s+/g,
    ' '
  );
  const scriptCheck = detectMyanmarInSingleReview(combined);
  if (scriptCheck.matched && scriptCheck.matchType) {
    const segments = combined.match(MYANMAR_SCRIPT_SEGMENT_RE) ?? [];
    const snippetSource = detectMyanmarInSingleReview(primaryDisplay).matched
      ? detectMyanmarInSingleReview(primaryDisplay).snippet
      : scriptCheck.snippet;
    return {
      matched: true,
      tooShort: false,
      matchType: scriptCheck.matchType,
      myanmarLetterCount: scriptCheck.myanmarLetterCount,
      matchedTerms: Array.from(new Set(segments)).slice(0, 5),
      isMixedThaiBurmese: scriptCheck.isMixedThaiBurmese,
      captionSnippet: snippetSource,
    };
  }

  // Secondary check: explicit Myanmar hashtags / unambiguous romanized Burmese terms in video caption/tags/handle
  const keywordMatches: string[] = [];
  let firstMatchIdx = -1;
  let firstMatchLen = 0;
  MYANMAR_VIDEO_KEYWORD_RE.lastIndex = 0;
  let match: RegExpExecArray | null = MYANMAR_VIDEO_KEYWORD_RE.exec(combined);
  while (match !== null) {
    const term = (match[1] ?? '').trim();
    if (term) {
      if (firstMatchIdx === -1) {
        firstMatchIdx = match.index;
        firstMatchLen = term.length;
      }
      if (!keywordMatches.some((existing) => existing.toLowerCase() === term.toLowerCase())) {
        keywordMatches.push(term);
      }
    }
    match = MYANMAR_VIDEO_KEYWORD_RE.exec(combined);
  }
  MYANMAR_VIDEO_KEYWORD_RE.lastIndex = 0;

  if (keywordMatches.length > 0) {
    const hasThai = THAI_SCRIPT_RE.test(combined);
    const snippet =
      primaryDisplay.length <= 160
        ? primaryDisplay
        : extractContextSnippet(combined, Math.max(0, firstMatchIdx), firstMatchLen);
    return {
      matched: true,
      tooShort: false,
      matchType: 'burmese-romanized-term',
      myanmarLetterCount: scriptCheck.myanmarLetterCount,
      matchedTerms: keywordMatches.slice(0, 5),
      isMixedThaiBurmese: hasThai,
      captionSnippet: snippet,
    };
  }

  return {
    matched: false,
    tooShort: scriptCheck.tooShort,
    matchType: null,
    myanmarLetterCount: scriptCheck.myanmarLetterCount,
    matchedTerms: [],
    isMixedThaiBurmese: scriptCheck.isMixedThaiBurmese,
    captionSnippet: '',
  };
}

/**
 * Builds a complete MyanmarLanguageAnalysis backed by verified Thailand TikTok Shop Myanmar videos,
 * while preserving honest status for title, description, reviews, and comments.
 */
export function buildMyanmarVideoLanguageAnalysis(
  matchedVideos: MyanmarVideoEvidenceItem[],
  extraInput?: Partial<MyanmarSignalInput>
): MyanmarLanguageAnalysis {
  const base = detectMyanmarLanguageSignals(
    {
      title: extraInput?.title ?? null,
      description: extraInput?.description ?? null,
      reviews: extraInput?.reviews ?? null,
      comments: extraInput?.comments ?? null,
      videoContent: null,
    },
    { reviewOnlyMatching: false }
  );

  const validVideos = matchedVideos.filter((v) => v && v.videoId && v.captionSnippet);
  if (validVideos.length === 0) {
    return base;
  }

  const videoEvidences: MyanmarLanguageEvidenceItem[] = validVideos.slice(0, 5).map((v) => ({
    source: 'videoContent',
    matchType: v.matchType,
    snippet: v.captionSnippet,
    matchedTerms: v.matchedTerms,
    myanmarCharCount: v.myanmarLetterCount,
  }));

  const totalVideoMyanmarChars = validVideos.reduce(
    (sum, v) => sum + Math.max(0, v.myanmarLetterCount),
    0
  );
  const hasScriptVideo = validVideos.some(
    (v) => v.matchType === 'myanmar-script' || v.matchType === 'zawgyi-script'
  );

  const confidence: MyanmarConfidenceLevel =
    validVideos.length >= 2 || totalVideoMyanmarChars >= 12
      ? 'High'
      : hasScriptVideo || validVideos.length >= 1
        ? hasScriptVideo
          ? 'Medium'
          : 'Medium'
        : 'Low';

  const sourceStatuses: Record<MyanmarSignalSource, MyanmarSignalSourceStatus> = {
    ...base.sourceStatuses,
    videoContent: {
      source: 'videoContent',
      availability: 'matched',
      checkedItemCount: validVideos.length,
    },
  };

  const matchedSources: MyanmarSignalSource[] = Array.from(
    new Set<MyanmarSignalSource>(['videoContent', ...base.matchedSources])
  );

  return {
    ...base,
    matched: true,
    confidence,
    matchedSources,
    evidences: [...videoEvidences, ...base.evidences].slice(0, 8),
    sourceStatuses,
    totalMyanmarCharCount: Math.max(base.totalMyanmarCharCount, totalVideoMyanmarChars),
    matchedVideoCount: validVideos.length,
    matchedVideos: validVideos.slice(0, 6),
    marketScopeNoteEn: VIDEO_MARKET_SCOPE_NOTE_EN,
    marketScopeNoteMy: VIDEO_MARKET_SCOPE_NOTE_MY,
  };
}
