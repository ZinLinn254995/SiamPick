import type { ResearchProduct } from '../types/product';
import type {
  SameProductCandidate,
  SameProductEarlyMoverBadge,
  SameProductMatchTier,
} from '../types/sameProduct';
import { getCanonicalProductId } from './scoring';

const PROMO_NOISE_PATTERNS: RegExp[] = [
  /\[[^\]]{1,40}\]/g,
  /【[^】]{1,40}】/g,
  /\([^)]{1,30}\)/g,
  /ส่งฟรี|พร้อมส่ง|เก็บเงินปลายทาง|ของแท้\s*100%|ของแท้|แท้\s*100%|รับประกัน|ราคาพิเศษ|ลดราคา|โปรโมชั่น|ขายดี|มาใหม่|รุ่นใหม่|ด่วน|ถูกที่สุด|แฟลชเซลล์|flash\s*sale|free\s*shipping|ready\s*stock|cod|100%\s*authentic|authentic|original|best\s*seller|hot\s*sale|new\s*arrival|promo/gi,
  /[🔥✨💥⭐🌟💯🎁🎉❤️💖✅⚡👉👇📌🛒📦🇹🇭]/gu,
];

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'new',
  'hot',
  'sale',
  'free',
  'set',
  'pcs',
  'pack',
  'piece',
  'pieces',
  'original',
  'authentic',
  'official',
  'store',
  'shop',
  'thailand',
  'tiktok',
  'ใน',
  'และ',
  'สำหรับ',
  'พร้อม',
  'แบบ',
  'รุ่น',
  'ขนาด',
  'จำนวน',
  'ชิ้น',
  'เซ็ต',
  'ชุด',
  'ราคา',
  'ส่ง',
  'ฟรี',
]);

/**
 * Extracts a clean, concise core search keyword from a Thailand TikTok Shop product title
 * without calling any external API (0 credits). Preserves Thai/English product identity & model tokens.
 */
export function extractDeterministicSearchKeyword(product: Pick<ResearchProduct, 'name' | 'brand'>): string {
  const rawTitle = (product.name ?? '').trim();
  if (!rawTitle) return '';

  let cleaned = rawTitle;
  for (const pattern of PROMO_NOISE_PATTERNS) {
    cleaned = cleaned.replace(pattern, ' ');
  }

  // Normalize punctuation into spaces while preserving Thai, Latin, numbers, hyphens
  cleaned = cleaned
    .replace(/[|/\\•·—–_,;:!?'"~`@#$%^&*+=<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) {
    return rawTitle.slice(0, 40).trim();
  }

  const rawTokens = cleaned
    .split(' ')
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);

  const brandLower = (product.brand ?? '').trim().toLowerCase();
  const chosen: string[] = [];
  const seen = new Set<string>();

  if (brandLower && brandLower.length >= 2 && brandLower !== 'generic' && brandLower !== 'no brand') {
    chosen.push(product.brand!.trim());
    seen.add(brandLower);
  }

  for (const token of rawTokens) {
    const lower = token.toLowerCase();
    if (seen.has(lower)) continue;
    if (STOP_WORDS.has(lower)) continue;
    // Skip standalone pure quantity tokens like "100ml" only if we already have core tokens
    if (chosen.length >= 2 && /^\d+(ml|g|kg|cm|mm|pcs|ชิ้น|กล่อง|ซอง)$/i.test(token)) {
      continue;
    }
    chosen.push(token);
    seen.add(lower);
    const joinedLength = chosen.join(' ').length;
    if (chosen.length >= 4 || joinedLength >= 36) {
      break;
    }
  }

  const result = chosen.join(' ').trim();
  if (result.length >= 2) {
    return result.slice(0, 60).trim();
  }

  return cleaned.slice(0, 40).trim();
}

/**
 * Generates deterministic fallback keyword variations (0 credits) from the product title.
 */
export function buildDeterministicKeywordSuggestions(
  product: Pick<ResearchProduct, 'name' | 'brand'>
): { primaryKeyword: string; suggestions: string[] } {
  const primary = extractDeterministicSearchKeyword(product);
  const suggestions: string[] = [];
  const seen = new Set<string>();

  const pushUnique = (kw: string) => {
    const normalized = kw.replace(/\s+/g, ' ').trim();
    if (normalized.length < 2) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    suggestions.push(normalized.slice(0, 60));
  };

  pushUnique(primary);

  const tokens = primary.split(' ').filter((t) => t.length >= 2);
  if (tokens.length >= 3) {
    pushUnique(tokens.slice(0, 2).join(' '));
    pushUnique(tokens.slice(0, 3).join(' '));
  } else if (tokens.length === 2) {
    // Also offer a shorter single core token if it's descriptive (>= 5 chars, e.g. Thai compound word)
    if (tokens[0].length >= 5) pushUnique(tokens[0]);
    if (tokens[1].length >= 5) pushUnique(tokens[1]);
  }

  // Extract Thai-only segment or English/Model segment if mixed
  const thaiChunks = (product.name ?? '').match(/[\u0E00-\u0E7F]{3,}/g) ?? [];
  if (thaiChunks.length > 0) {
    const cleanedThai = thaiChunks
      .filter((c) => !STOP_WORDS.has(c))
      .slice(0, 2)
      .join(' ');
    if (cleanedThai.length >= 4) pushUnique(cleanedThai);
  }

  const latinModelChunks = (product.name ?? '').match(/[A-Za-z0-9][A-Za-z0-9-]{2,}/g) ?? [];
  const usefulLatin = latinModelChunks
    .filter((t) => !STOP_WORDS.has(t.toLowerCase()))
    .slice(0, 3)
    .join(' ');
  if (usefulLatin.length >= 3) pushUnique(usefulLatin);

  return {
    primaryKeyword: suggestions[0] ?? primary,
    suggestions: suggestions.slice(0, 4),
  };
}

function normalizeForSimilarity(text: string): string {
  let cleaned = text.toLowerCase();
  for (const pattern of PROMO_NOISE_PATTERNS) {
    cleaned = cleaned.replace(pattern, ' ');
  }
  return cleaned
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildCharTrigrams(compactText: string): Set<string> {
  const grams = new Set<string>();
  const s = compactText.replace(/\s+/g, '');
  if (s.length < 3) {
    if (s.length > 0) grams.add(s);
    return grams;
  }
  for (let i = 0; i <= s.length - 3; i += 1) {
    grams.add(s.slice(i, i + 3));
  }
  return grams;
}

/**
 * Computes a deterministic 0–100 title similarity score that works cleanly for BOTH
 * unspaced Thai product titles (via character 3-gram Dice/Jaccard) and English/Model tokens.
 */
export function computeTitleSimilarityPct(sourceTitle: string, candidateTitle: string): number {
  const a = normalizeForSimilarity(sourceTitle);
  const b = normalizeForSimilarity(candidateTitle);
  if (!a || !b) return 0;
  if (a === b) return 100;

  // 1. Character 3-gram Dice coefficient (great for Thai text without spaces)
  const gramsA = buildCharTrigrams(a);
  const gramsB = buildCharTrigrams(b);
  let gramOverlap = 0;
  for (const g of gramsA) {
    if (gramsB.has(g)) gramOverlap += 1;
  }
  const gramDice =
    gramsA.size + gramsB.size > 0 ? (2 * gramOverlap) / (gramsA.size + gramsB.size) : 0;

  // 2. Token overlap (great for English brand/model/spec numbers)
  const tokensA = new Set(a.split(' ').filter((t) => t.length >= 2 && !STOP_WORDS.has(t)));
  const tokensB = new Set(b.split(' ').filter((t) => t.length >= 2 && !STOP_WORDS.has(t)));
  let tokenOverlap = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) tokenOverlap += 1;
  }
  const tokenDice =
    tokensA.size + tokensB.size > 0 ? (2 * tokenOverlap) / (tokensA.size + tokensB.size) : gramDice;

  const blended = gramDice * 0.6 + tokenDice * 0.4;
  return Math.max(0, Math.min(100, Math.round(blended * 100)));
}

function parseLaunchDateMs(raw: string | null | undefined): number | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export interface EarlyMoverInput {
  source: {
    priceThb: number | null;
    commissionRate: number | null;
    salesVolume: number | null;
    revenueThb: number | null;
    videoRevenueThb: number | null;
    creatorNumber: number | null;
    launchDate: string | null;
  };
  candidate: {
    priceThb: number | null;
    commissionRate: number | null;
    salesVolume: number | null;
    revenueThb: number | null;
    videoRevenueThb: number | null;
    revenueGrowthRate: number | null;
    creatorNumber: number | null;
    launchDate: string | null;
  };
  nowMs?: number;
}

export interface EarlyMoverAssessment {
  priceDeltaThb: number | null;
  priceDeltaPct: number | null;
  commissionDeltaPct: number | null;
  videoGmvRatioVsOriginal: number | null;
  earlyMoverScore: number;
  earlyMoverBadge: SameProductEarlyMoverBadge;
  earlyMoverSignalsEn: string[];
  earlyMoverSignalsMy: string[];
}

/**
 * Evaluates how well a Same-Product listing from another shop gives an Early-Mover
 * advantage over other TikTok Shop affiliate creators (low creator saturation,
 * untapped video GMV gap, newer listing, competitive price parity, viable commission).
 */
export function computeEarlyMoverAssessment(input: EarlyMoverInput): EarlyMoverAssessment {
  const { source, candidate } = input;
  const nowMs = input.nowMs ?? Date.now();

  const priceDeltaThb =
    source.priceThb !== null &&
    source.priceThb > 0 &&
    candidate.priceThb !== null &&
    candidate.priceThb > 0
      ? Math.round((candidate.priceThb - source.priceThb) * 100) / 100
      : null;

  const priceDeltaPct =
    priceDeltaThb !== null && source.priceThb !== null && source.priceThb > 0
      ? Math.round((priceDeltaThb / source.priceThb) * 1000) / 10
      : null;

  const commissionDeltaPct =
    source.commissionRate !== null && candidate.commissionRate !== null
      ? Math.round((candidate.commissionRate - source.commissionRate) * 10) / 10
      : null;

  const videoGmvRatioVsOriginal =
    source.videoRevenueThb !== null &&
    source.videoRevenueThb > 0 &&
    candidate.videoRevenueThb !== null &&
    candidate.videoRevenueThb >= 0
      ? Math.round((candidate.videoRevenueThb / source.videoRevenueThb) * 1000) / 1000
      : null;

  let score = 50;
  const signalsEn: string[] = [];
  const signalsMy: string[] = [];

  let hasLowCreatorsVerified = false;
  let isSaturatedCreators = false;
  let hasStrongVideoGap = false;
  let isNewerListing = false;

  // 1. Verified Creator Saturation (Stage 2 or Cached Product Detail — strongest signal!)
  if (candidate.creatorNumber !== null && candidate.creatorNumber >= 0) {
    const srcCreators = source.creatorNumber;
    if (candidate.creatorNumber <= 15) {
      hasLowCreatorsVerified = true;
      score += 26;
      signalsEn.push(
        srcCreators !== null && srcCreators > candidate.creatorNumber
          ? `Only ${candidate.creatorNumber} creators promoting (vs ${srcCreators} on original)`
          : `Low creator saturation: only ${candidate.creatorNumber} creators`
      );
      signalsMy.push(
        srcCreators !== null && srcCreators > candidate.creatorNumber
          ? `Creator ${candidate.creatorNumber} ဦးသာ ရိုက်ထားသေး (မူလ Link တွင် ${srcCreators} ဦး)`
          : `Creator ပြိုင်ဆိုင်မှု နည်းသေး (${candidate.creatorNumber} ဦးသာ)`
      );
    } else if (
      srcCreators !== null &&
      srcCreators >= 20 &&
      candidate.creatorNumber <= Math.round(srcCreators * 0.4)
    ) {
      hasLowCreatorsVerified = true;
      score += 18;
      signalsEn.push(
        `${candidate.creatorNumber} creators vs ${srcCreators} on original link`
      );
      signalsMy.push(
        `Creator ${candidate.creatorNumber} ဦး (မူလ Link ${srcCreators} ဦးထက် များစွာနည်း)`
      );
    } else if (candidate.creatorNumber >= 80) {
      isSaturatedCreators = true;
      score -= 18;
      signalsEn.push(`Crowded listing: ${candidate.creatorNumber} creators already active`);
      signalsMy.push(`Creator ${candidate.creatorNumber} ဦး ပြိုင်နေပြီဖြစ်၍ ခြေလှမ်းဦးရန် ခက်နိုင်`);
    } else {
      signalsEn.push(`${candidate.creatorNumber} creators currently promoting`);
      signalsMy.push(`လက်ရှိ Creator ${candidate.creatorNumber} ဦး ကြော်ငြာနေ`);
    }
  }

  // 2. Video GMV Gap (Stage 1 immediate proxy for untapped creator videos)
  if (videoGmvRatioVsOriginal !== null) {
    if (videoGmvRatioVsOriginal <= 0.25) {
      hasStrongVideoGap = true;
      score += 16;
      const pctLower = Math.max(1, Math.round((1 - videoGmvRatioVsOriginal) * 100));
      signalsEn.push(`Video GMV ${pctLower}% lower than original (untapped creator angle)`);
      signalsMy.push(`Video GMV သည် မူလထက် ${pctLower}% နည်းနေသေး (Creator Video မဖောင်းပွသေး)`);
    } else if (videoGmvRatioVsOriginal <= 0.55) {
      score += 7;
      signalsEn.push('Moderate video competition gap vs original');
      signalsMy.push('Video ပြိုင်ဆိုင်မှု မူလ Link ထက် နည်းသေး');
    } else if (videoGmvRatioVsOriginal >= 1.2) {
      score -= 8;
    }
  } else if (
    candidate.videoRevenueThb !== null &&
    candidate.videoRevenueThb === 0 &&
    (candidate.salesVolume ?? 0) > 0
  ) {
    hasStrongVideoGap = true;
    score += 14;
    signalsEn.push('Active shop sales with ฿0 video GMV yet (wide-open for video creators)');
    signalsMy.push('ဆိုင်ရောင်းအား ရှိနေသော်လည်း Video GMV ฿0 သာ (Video Creator များ မဝင်ရသေး)');
  }

  // 3. Listing Freshness (Launch Date)
  const candLaunchMs = parseLaunchDateMs(candidate.launchDate);
  const srcLaunchMs = parseLaunchDateMs(source.launchDate);
  const daysSinceLaunch =
    candLaunchMs !== null ? Math.floor((nowMs - candLaunchMs) / (24 * 60 * 60 * 1000)) : null;

  if (srcLaunchMs !== null && candLaunchMs !== null && candLaunchMs > srcLaunchMs + 7 * 86400_000) {
    isNewerListing = true;
    score += 10;
    signalsEn.push(`Newer listing (${candidate.launchDate}) than original shop`);
    signalsMy.push(`မူလဆိုင်ထက် နောက်ကျမှတင်သော Listing အသစ် (${candidate.launchDate})`);
  } else if (daysSinceLaunch !== null && daysSinceLaunch >= 0 && daysSinceLaunch <= 60) {
    isNewerListing = true;
    score += 9;
    signalsEn.push(`Recent listing (${daysSinceLaunch}d old)`);
    signalsMy.push(`စတင်ရောင်းချသည်မှာ ${daysSinceLaunch} ရက်သာ ရှိသေး`);
  }

  // 4. Price Parity (must remain competitive so buyers don't bounce back to original shop)
  if (priceDeltaPct !== null) {
    if (priceDeltaPct <= -3) {
      score += 10;
      signalsEn.push(`Competitive price (${Math.abs(priceDeltaPct)}% cheaper than original)`);
      signalsMy.push(`မူလဈေးထက် ${Math.abs(priceDeltaPct)}% ပိုသက်သာ၍ ရောင်းထွက်လွယ်`);
    } else if (priceDeltaPct <= 5) {
      score += 6;
      signalsEn.push('Price matches original shop closely');
      signalsMy.push('ဈေးနှုန်းသည် မူလဆိုင်နှင့် ကိုက်ညီမှုရှိ');
    } else if (priceDeltaPct > 15) {
      score -= 12;
      signalsEn.push(`Priced ${priceDeltaPct}% higher than original (watch conversion)`);
      signalsMy.push(`မူလဈေးထက် ${priceDeltaPct}% ပိုမြင့်နေ၍ Conversion သတိထားရန်`);
    }
  }

  // 5. Affiliate Commission Viability
  if (commissionDeltaPct !== null) {
    if (commissionDeltaPct >= 1) {
      score += 8;
      signalsEn.push(`Higher commission (+${commissionDeltaPct}% vs original)`);
      signalsMy.push(`Commission မူလထက် +${commissionDeltaPct}% ပိုများ`);
    } else if (commissionDeltaPct >= -1.5) {
      score += 4;
    } else if (commissionDeltaPct < -4) {
      score -= 10;
      signalsEn.push(`Commission ${Math.abs(commissionDeltaPct)}% lower than original`);
      signalsMy.push(`Commission မူလထက် ${Math.abs(commissionDeltaPct)}% လျော့နည်း`);
    }
  }

  // 6. Active Demand / Momentum (alive shop vs dead listing)
  if (candidate.salesVolume !== null && candidate.salesVolume > 0) {
    score += 6;
    if (candidate.revenueGrowthRate !== null && candidate.revenueGrowthRate > 15) {
      score += 6;
      signalsEn.push(`Early sales momentum (+${Math.round(candidate.revenueGrowthRate)}% growth)`);
      signalsMy.push(`ရောင်းအား စတက်နေ (+${Math.round(candidate.revenueGrowthRate)}% တိုးတက်)`);
    }
  } else {
    score -= 4;
    signalsEn.push('Zero recorded 30d sales (brand-new / untested listing)');
    signalsMy.push('၃၀ ရက်အတွင်း ရောင်းအား 0 ဖြစ်နေသေး (Listing အသစ်စက်စက်)');
  }

  const clampedScore = Math.max(0, Math.min(100, Math.round(score)));

  let badge: SameProductEarlyMoverBadge = 'comparable';
  if (isSaturatedCreators) {
    badge = 'saturated';
  } else if (hasLowCreatorsVerified) {
    badge = 'early-mover';
  } else if (hasStrongVideoGap && isNewerListing) {
    badge = 'early-mover';
  } else if (hasStrongVideoGap) {
    badge = 'low-video-gap';
  }

  return {
    priceDeltaThb,
    priceDeltaPct,
    commissionDeltaPct,
    videoGmvRatioVsOriginal,
    earlyMoverScore: clampedScore,
    earlyMoverBadge: badge,
    earlyMoverSignalsEn: signalsEn.slice(0, 4),
    earlyMoverSignalsMy: signalsMy.slice(0, 4),
  };
}

const MATCH_TIER_PRIORITY: Record<SameProductMatchTier, number> = {
  'exact-same': 0,
  'close-variant': 1,
  'unverified-visual': 2,
  different: 3,
};

/**
 * Sorts matched Same-Product candidates so Exact Same Products ALWAYS appear first,
 * followed by Close Variants, ordered by Early-Mover priority within each tier.
 */
export function sortSameProductCandidates(
  candidates: readonly SameProductCandidate[]
): SameProductCandidate[] {
  return [...candidates].sort((a, b) => {
    const tierDiff = MATCH_TIER_PRIORITY[a.matchTier] - MATCH_TIER_PRIORITY[b.matchTier];
    if (tierDiff !== 0) return tierDiff;

    if (b.earlyMoverScore !== a.earlyMoverScore) {
      return b.earlyMoverScore - a.earlyMoverScore;
    }

    if (b.titleSimilarityPct !== a.titleSimilarityPct) {
      return b.titleSimilarityPct - a.titleSimilarityPct;
    }

    return (b.commissionRate ?? 0) - (a.commissionRate ?? 0);
  });
}

/**
 * Re-evaluates a single candidate after Stage 2 (product/detail + optional shop/detail)
 * enrichment returns real `creator_number` and `shopSellerType`.
 */
export function applyEnrichedProductToSameCandidate(
  sourceProduct: ResearchProduct,
  candidate: SameProductCandidate,
  enrichedProduct: ResearchProduct
): SameProductCandidate {
  const km = enrichedProduct.kalodataMetrics;
  const srcKm = sourceProduct.kalodataMetrics;

  const updatedCreatorNumber = km?.creatorNumber ?? candidate.creatorNumber;
  const updatedVideoNumber = km?.videoNumber ?? candidate.videoNumber;
  const updatedLaunchDate = km?.launchDate ?? candidate.launchDate;
  const updatedShopSellerType = km?.shopSellerType ?? candidate.shopSellerType;
  const updatedShopRevenueThb = km?.shopRevenueThb ?? candidate.shopRevenueThb;
  const updatedPrice = enrichedProduct.priceThb ?? candidate.priceThb;
  const updatedCommission = enrichedProduct.commissionRate ?? candidate.commissionRate;

  const assessment = computeEarlyMoverAssessment({
    source: {
      priceThb: sourceProduct.priceThb,
      commissionRate: sourceProduct.commissionRate,
      salesVolume: srcKm?.salesVolume ?? null,
      revenueThb: srcKm?.revenueThb ?? null,
      videoRevenueThb: srcKm?.videoRevenueThb ?? null,
      creatorNumber: srcKm?.creatorNumber ?? null,
      launchDate: srcKm?.launchDate ?? null,
    },
    candidate: {
      priceThb: updatedPrice,
      commissionRate: updatedCommission,
      salesVolume: km?.salesVolume ?? candidate.salesVolume,
      revenueThb: km?.revenueThb ?? candidate.revenueThb,
      videoRevenueThb: km?.videoRevenueThb ?? candidate.videoRevenueThb,
      revenueGrowthRate: km?.revenueGrowthRate ?? candidate.revenueGrowthRate,
      creatorNumber: updatedCreatorNumber,
      launchDate: updatedLaunchDate,
    },
  });

  return {
    ...candidate,
    priceThb: updatedPrice,
    commissionRate: updatedCommission,
    estimatedCommissionPerSaleThb:
      enrichedProduct.estimatedCommissionPerSaleThb ?? candidate.estimatedCommissionPerSaleThb,
    launchDate: updatedLaunchDate,
    creatorNumber: updatedCreatorNumber,
    videoNumber: updatedVideoNumber,
    shopSellerType: updatedShopSellerType,
    shopRevenueThb: updatedShopRevenueThb,
    stage2Verified: Boolean(km?.detailEnriched || updatedCreatorNumber !== null),
    shopTrustVerified: Boolean(km?.shopEnriched || updatedShopSellerType),
    ...assessment,
    researchProduct: enrichedProduct,
  };
}

export function buildSameProductCacheKey(
  product: ResearchProduct,
  keyword: string,
  options: {
    priceTolerancePct: number;
    useCategoryFilter: boolean;
    enableVisualVerification: boolean;
  }
): string {
  const canonicalId = getCanonicalProductId(product);
  const normalizedKw = keyword.trim().toLowerCase().replace(/\s+/g, ' ');
  return [
    'same-v2',
    canonicalId,
    normalizedKw,
    `tol:${Math.round(options.priceTolerancePct)}`,
    `cat:${options.useCategoryFilter ? product.category : 'any'}`,
    `vis:${options.enableVisualVerification ? '1' : '0'}`,
  ].join('|');
}
