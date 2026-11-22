import type {
  AiVideoSuitability,
  CompetitionLevel,
  CosmeticsComplianceRisk,
  DataStatus,
  DemandLevel,
  FashionReturnRisk,
  GroundingSourceLink,
  KalodataCategoryRef,
  KalodataProductDetailEnrichmentRecord,
  MyanmarDiscoveryMode,
  MyanmarReviewDiscoveryStats,
  MyanmarVideoDiscoveryStats,
  MyanmarVideoDiscoveryStopReason,
  MyanmarVideoEvidenceItem,
  ProductCategory,
  ResearchConfig,
  ResearchDepthTag,
  ResearchMode,
  ResearchProduct,
  ResearchQuotaStatus,
  ResearchSessionResponse,
  ResearchSourceItem,
  RiskSeverity,
  ScoringInputs,
  VerificationState,
  VideoContentIdea,
} from '../src/types/product.ts';
import {
  buildFallbackTikTokShopUrl,
  extractNumericTikTokProductId,
  resolveCanonicalTikTokProductUrlsBatch,
} from './tiktokLinkService.ts';
import {
  evaluateProductBatch,
  evaluateProductOpportunity,
} from '../src/utils/scoring.ts';
import {
  buildKalodataExecutionPlan,
  clampDeepDiveCount,
  clampMyanmarReviewScanLimit,
  clampMyanmarVideoScanPages,
  DEFAULT_SPENDING_LIMIT_CREDITS,
  formatCredits,
  KALODATA_COMMENT_INSIGHT_CREDIT,
  KALODATA_CREDITS_PER_100_ROWS,
  KALODATA_MAX_PAGE_SIZE,
  KALODATA_PRODUCT_DETAIL_CREDIT,
  KALODATA_USD_PER_CREDIT,
  KALODATA_VIDEO_RANK_CREDIT_PER_100,
} from '../src/utils/kalodataPricing.ts';
import { getCategoryDefinition } from '../src/utils/categoryRegistry.ts';
import { verifyKalodataImageUrl } from './imageRetriever.ts';
import {
  fetchKalodataCreditBalance,
  fetchKalodataProductCommentInsight,
  fetchKalodataProductDetail,
  fetchKalodataProductRank,
  fetchKalodataShopDetail,
  fetchKalodataVideoRank,
  resolveProductCategoryFromKalodataId,
} from './kalodataService.ts';
import {
  analyzeKalodataProductsWithGemini,
  deriveCompetitionFromCreatorNumber,
  deriveSellerReliabilityFromShop,
  parseKalodataCommentInsight,
  parseKalodataProductDetail,
  parseKalodataShopDetail,
  parseKalodataVideoRankItem,
  selectBestCandidatesForMode,
  type ParsedCommentInsight,
  type ParsedProductDetail,
  type ParsedShopDetail,
  type ParsedVideoLinkedProduct,
  type RankCandidateRow,
} from './kalodataAnalysis.ts';
import {
  getServerCachedProductDetail,
  getServerCachedReviewInsight,
  getServerCachedShopDetail,
  getServerCachedVideoProducts,
  setServerCachedProductDetail,
  setServerCachedReviewInsight,
  setServerCachedShopDetail,
  setServerCachedVideoProducts,
  toProductDetailRecord,
  toReviewInsightRecord,
  toShopEnrichmentRecord,
} from './enrichmentService.ts';
import { buildStructuredReviewInsight } from '../src/utils/enrichmentPlanner.ts';
import {
  analyzeProductReviewsForMyanmar,
  buildMyanmarVideoLanguageAnalysis,
  detectMyanmarInVideoCandidate,
  detectMyanmarLanguageSignals,
  extractRawMyanmarTextCandidates,
  type ReviewTextItem,
} from '../src/utils/myanmarLanguageDetector.ts';

export interface ResearchPipelineTestOverrides {
  fetchCreditBalance?: () => Promise<{ ok: boolean; balance: number | null }>;
  fetchProductRank?: (
    params: Parameters<typeof fetchKalodataProductRank>[0]
  ) => Promise<{
    ok: boolean;
    items: Record<string, unknown>[];
    total?: number | null;
    upstreamCode?: string;
    error?: string;
    errorMy?: string;
  }>;
  fetchVideoRank?: (
    params: Parameters<typeof fetchKalodataVideoRank>[0]
  ) => Promise<{
    ok: boolean;
    items: Record<string, unknown>[];
    total?: number | null;
    upstreamCode?: string;
    error?: string;
    errorMy?: string;
  }>;
  fetchProductDetail?: (
    params: Parameters<typeof fetchKalodataProductDetail>[0]
  ) => Promise<{ ok: boolean; data: Record<string, unknown> | null }>;
  fetchShopDetail?: (
    params: Parameters<typeof fetchKalodataShopDetail>[0]
  ) => Promise<{ ok: boolean; data: Record<string, unknown> | null }>;
  fetchCommentInsight?: (
    params: Parameters<typeof fetchKalodataProductCommentInsight>[0]
  ) => Promise<{ ok: boolean; data: Record<string, unknown> | null }>;
  verifyImageUrl?: typeof verifyKalodataImageUrl;
  maxReviewPages?: number;
}

export class ResearchApiError extends Error {
  status: number;
  code: string;
  quotaPaused: boolean;
  errorMy?: string;

  constructor(
    status: number,
    code: string,
    message: string,
    options?: { quotaPaused?: boolean; errorMy?: string }
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.quotaPaused = Boolean(options?.quotaPaused);
    this.errorMy = options?.errorMy;
  }
}

/**
 * In-memory Manual Research Pause State:
 * Allows the user to manually pause product hunting to prevent accidental paid API runs,
 * and resume cleanly when ready.
 */
let researchQuotaState: ResearchQuotaStatus = {
  paused: false,
  reason: null,
  pausedAt: null,
};

export function getResearchQuotaStatus(): ResearchQuotaStatus {
  return { ...researchQuotaState };
}

export function pauseResearch(reason: 'manual' = 'manual'): ResearchQuotaStatus {
  researchQuotaState = {
    paused: true,
    reason,
    pausedAt: new Date().toISOString(),
  };
  return getResearchQuotaStatus();
}

export function resumeResearch(): ResearchQuotaStatus {
  researchQuotaState = {
    paused: false,
    reason: null,
    pausedAt: null,
  };
  return getResearchQuotaStatus();
}

function asString(val: unknown, fallback: string): string {
  if (typeof val === 'string' && val.trim().length > 0) return val.trim();
  return fallback;
}

function asEnum<T extends string>(val: unknown, allowed: readonly T[], fallback: T): T {
  if (typeof val === 'string' && (allowed as readonly string[]).includes(val)) {
    return val as T;
  }
  return fallback;
}

function normalizeFashionRisk(raw: unknown): FashionReturnRisk {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const parseFactor = (field: unknown, fallbackEn: string, fallbackMy: string) => {
    const f = field && typeof field === 'object' ? (field as Record<string, unknown>) : {};
    return {
      level: asEnum<RiskSeverity>(f.level, ['Low', 'Watch', 'High'], 'Watch'),
      noteEn: asString(f.noteEn, fallbackEn),
      noteMy: asString(f.noteMy, fallbackMy),
    };
  };

  return {
    sizing: parseFactor(
      obj.sizing,
      'Verify Thai/Asian size chart measurements (cm) before promoting to avoid size returns.',
      'အရွယ်အစားမှားယွင်း Return မဖြစ်စေရန် Thai/Asian Size Chart (cm) ကို စစ်ဆေးပါ။'
    ),
    fabric: parseFactor(
      obj.fabric,
      'Check buyer reviews for fabric thickness, breathability, and opacity in Thai weather.',
      'ထိုင်းရာသီဥတုနှင့် သင့်တော်မှု၊ အထည်သားအထူအပါးကို Buyer Review များတွင် စစ်ဆေးပါ။'
    ),
    colorAccuracy: parseFactor(
      obj.colorAccuracy,
      'Studio lighting may alter shades slightly; check real buyer photos in TikTok Shop reviews.',
      'Studio မီးအလင်းကြောင့် အရောင်အနည်းငယ်ကွာနိုင်၍ Buyer Photo များကို စစ်ဆေးပါ။'
    ),
    fitDifference: parseFactor(
      obj.fitDifference,
      'Show real body-type fit notes (height/weight reference) in video captions to reduce fit returns.',
      'ဝတ်ဆင်ပုံကွာခြားမှု လျော့နည်းစေရန် အရပ်/ကိုယ်အလေးချိန် ညွှန်းဆိုချက် ထည့်ပြပါ။'
    ),
  };
}

function normalizeCosmeticsRisk(raw: unknown): CosmeticsComplianceRisk {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const parseCompliance = (field: unknown, fallbackEn: string, fallbackMy: string) => {
    const f = field && typeof field === 'object' ? (field as Record<string, unknown>) : {};
    return {
      status: asEnum<VerificationState>(
        f.status,
        ['Verified', 'Needs Check', 'Caution'],
        'Needs Check'
      ),
      noteEn: asString(f.noteEn, fallbackEn),
      noteMy: asString(f.noteMy, fallbackMy),
    };
  };

  return {
    brandAuthenticity: parseCompliance(
      obj.brandAuthenticity,
      'Promote only via TikTok Shop Mall / Official Brand Flagship or authorized Thai distributors.',
      'TikTok Shop Mall / Official Brand ဆိုင်စစ်မှသာ Affiliate Link ချိတ်ဆက်ရောင်းချပါ။'
    ),
    thaiFda: parseCompliance(
      obj.thaiFda,
      'Confirm the 10-to-13-digit Thai FDA (อย.) notification number on the seller listing before posting.',
      'ဗီဒီယိုမတင်မီ ဆိုင်စာမျက်နှာတွင် ထိုင်း FDA (อย.) မှတ်ပုံတင်နံပါတ် ပါဝင်မှုကို စစ်ဆေးပါ။'
    ),
    adClaimSafety: parseCompliance(
      obj.adClaimSafety,
      'Avoid exaggerated medical, instant-whitening, or guaranteed-cure claims prohibited by TikTok Shop Thailand.',
      'TikTok Shop Thailand စည်းကမ်းအရ ချက်ချင်းဖြူစေသည် သို့မဟုတ် ဆေးကုသနိုင်သည်ဟု အလွန်အကျွံ မကြော်ငြာရပါ။'
    ),
  };
}

function normalizeVideoIdeas(raw: unknown): [VideoContentIdea, VideoContentIdea, VideoContentIdea] {
  const defaults: [VideoContentIdea, VideoContentIdea, VideoContentIdea] = [
    {
      titleEn: 'Problem-to-Solution Daily Routine Hook',
      titleMy: 'နေ့စဉ်ပြဿနာဖြေရှင်းပြသည့် ဗီဒီယို',
      formatEn: '15–25s UGC / Voiceover Demo',
      formatMy: '၁၅–၂၅ စက္ကန့် UGC / Voiceover ပြသမှု',
      outlineEn:
        'Open with a relatable Thai daily-use pain point in the first 3 seconds, demonstrate texture/fit clearly, and close with a clear basket CTA.',
      outlineMy:
        'ပထမ ၃ စက္ကန့်တွင် ထိုင်းနေ့စဉ်အသုံးပြုသူများ ကြုံရသည့်အခက်အခဲဖြင့် စတင်ပြီး အသုံးပြုပုံကို ရှင်းလင်းစွာပြသပါ။',
    },
    {
      titleEn: 'Honest Review & Feature Breakdown',
      titleMy: 'အားသာချက်နှင့် သတိပြုစရာ အမှန်တကယ် Review',
      formatEn: '20–30s Talking Head / Split Screen',
      formatMy: '၂၀–၃၀ စက္ကန့် ရှင်းလင်းတင်ဆက်မှု',
      outlineEn:
        'Highlight 2 concrete strengths, mention 1 honest buyer consideration (size/skin type) to build trust, and highlight value.',
      outlineMy:
        'အဓိကအားသာချက် ၂ ချက်နှင့် ဝယ်သူသတိပြုသင့်သည့် ၁ ချက်ကို ပွင့်လင်းစွာပြောပြပြီး တန်ဖိုးသင့်တင့်မှုကို ဖော်ပြပါ။',
    },
    {
      titleEn: 'Natural Daylight Close-Up',
      titleMy: 'သဘာဝအလင်းဖြင့် အနီးကပ်ပြသမှု',
      formatEn: '15–20s Close-Up Visual Cut',
      formatMy: '၁၅–၂၀ စက္ကန့် အနီးကပ်ပြသမှု',
      outlineEn:
        'Use daylight close-up shots to showcase real shade/texture without heavy filters, answering common Thai buyer comment questions.',
      outlineMy:
        'Filter မသုံးဘဲ သဘာဝအလင်းဖြင့် အရောင်နှင့်အသားအရည်/အထည်သားအစစ်ကို အနီးကပ်ပြသ၍ ဝယ်သူမေးခွန်းများကို ဖြေကြားပါ။',
    },
  ];

  if (!Array.isArray(raw)) return defaults;

  const parsed: VideoContentIdea[] = raw.slice(0, 3).map((item, idx) => {
    const obj = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const fb = defaults[idx] ?? defaults[0];
    return {
      titleEn: asString(obj.titleEn, fb.titleEn),
      titleMy: asString(obj.titleMy, fb.titleMy),
      formatEn: asString(obj.formatEn, fb.formatEn),
      formatMy: asString(obj.formatMy, fb.formatMy),
      outlineEn: asString(obj.outlineEn, fb.outlineEn),
      outlineMy: asString(obj.outlineMy, fb.outlineMy),
    };
  });

  while (parsed.length < 3) {
    parsed.push(defaults[parsed.length]);
  }

  return [parsed[0], parsed[1], parsed[2]];
}


function toNullableFiniteNumber(val: unknown): number | null {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string' && val.trim() !== '') {
    const parsed = Number(val);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function parseKalodataCategoryRef(raw: unknown): KalodataCategoryRef | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const id =
    obj.category_id !== undefined && obj.category_id !== null ? String(obj.category_id).trim() : '';
  const name = typeof obj.category_name === 'string' ? obj.category_name.trim() : '';
  if (!id && !name) return null;
  return { category_id: id, category_name: name };
}

/**
 * Normalizes Kalodata commission_rate to a percentage (e.g., 10 for 10%).
 * Kalodata OpenAPI returns percentage values like 10 or 15 in ProductRankRes;
 * if a positive decimal ratio strictly between 0 and 1 is returned (e.g., 0.15), convert to 15%.
 */
function normalizeKalodataCommissionPct(raw: number): number {
  if (raw > 0 && raw < 1) {
    return Math.round(raw * 10000) / 100;
  }
  return Math.round(raw * 100) / 100;
}

function formatThbInline(amount: number | null): string {
  if (amount === null || !Number.isFinite(amount)) return '—';
  return `฿${Math.round(amount).toLocaleString('en-US')}`;
}

function computeKalodataDemandLevel(
  revenueThb: number | null,
  salesVolume: number | null,
  growthRate: number | null
): DemandLevel {
  if ((revenueThb !== null && revenueThb >= 500_000) || (salesVolume !== null && salesVolume >= 2000)) {
    return 'High';
  }
  if (
    (growthRate !== null && growthRate >= 15) ||
    (revenueThb !== null && revenueThb >= 150_000) ||
    (salesVolume !== null && salesVolume >= 500)
  ) {
    return 'Growing';
  }
  if ((revenueThb !== null && revenueThb >= 30_000) || (salesVolume !== null && salesVolume >= 100)) {
    return 'Steady';
  }
  return 'Moderate';
}

function computeKalodataDemandStrength(
  revenueThb: number | null,
  salesVolume: number | null,
  growthRate: number | null
): number {
  const rev = Math.max(0, revenueThb ?? 0);
  const sales = Math.max(0, salesVolume ?? 0);
  const revScore = rev > 0 ? Math.min(55, Math.round(Math.log10(rev + 10) * 9.2)) : 0;
  const salesScore = sales > 0 ? Math.min(35, Math.round(Math.log10(sales + 10) * 9.5)) : 0;
  const growthBonus =
    growthRate === null
      ? 0
      : growthRate >= 50
        ? 10
        : growthRate >= 20
          ? 7
          : growthRate >= 5
            ? 4
            : growthRate < -20
              ? -8
              : 0;
  return Math.max(20, Math.min(98, revScore + salesScore + growthBonus));
}

function computeKalodataPriceStrength(priceThb: number | null): number {
  if (priceThb === null || priceThb <= 0) return 0;
  if (priceThb >= 150 && priceThb <= 590) return 88;
  if (priceThb >= 90 && priceThb <= 990) return 78;
  if (priceThb > 990 && priceThb <= 1800) return 68;
  return 60;
}

interface KalodataProductEnrichment {
  researchMode: ResearchMode;
  productDetail: ParsedProductDetail | null;
  shopDetail: ParsedShopDetail | null;
  commentInsight: ParsedCommentInsight | null;
  matchedVideos?: MyanmarVideoEvidenceItem[];
  sourceMode?: 'product-rank' | 'video-rank';
}

function buildKalodataProductSummary(
  item: Record<string, unknown>,
  mappedCategory: ProductCategory,
  categoryIdsRequested: string[],
  dateRange: string,
  researchedAt: string,
  imageCheck: {
    imageVerified: boolean;
    imageUrl: string | null;
    imageOriginUrl: string | null;
    imageSourceNoteEn: string;
    imageSourceNoteMy: string;
  },
  enrichment: KalodataProductEnrichment
): ResearchProduct {
  const { researchMode, productDetail, shopDetail, commentInsight, matchedVideos, sourceMode } =
    enrichment;
  const productId =
    item.product_id !== undefined && item.product_id !== null
      ? String(item.product_id).trim()
      : `unknown-${Date.now()}`;
  const productName = asString(
    item.product_name ?? productDetail?.productName,
    `TikTok Shop Product ${productId}`
  );

  const priCategory = parseKalodataCategoryRef(item.pri_category) ?? productDetail?.priCategory ?? null;
  const secCategory = parseKalodataCategoryRef(item.sec_category) ?? productDetail?.secCategory ?? null;
  const terCategory = parseKalodataCategoryRef(item.ter_category) ?? productDetail?.terCategory ?? null;

  const unitPriceRaw = productDetail?.unitPriceThb ?? toNullableFiniteNumber(item.unit_price);
  const priceThb =
    unitPriceRaw !== null && unitPriceRaw > 0 ? Math.round(unitPriceRaw * 100) / 100 : null;
  const minPriceThb =
    productDetail?.minPriceThb !== null && productDetail?.minPriceThb !== undefined && productDetail.minPriceThb > 0
      ? Math.round(productDetail.minPriceThb * 100) / 100
      : null;
  const maxPriceThb =
    productDetail?.maxPriceThb !== null && productDetail?.maxPriceThb !== undefined && productDetail.maxPriceThb > 0
      ? Math.round(productDetail.maxPriceThb * 100) / 100
      : null;
  const priceStatus: DataStatus = priceThb !== null ? 'verified' : 'unavailable';

  const rawCommission = toNullableFiniteNumber(item.commission_rate);
  const commissionRate =
    productDetail?.commissionRatePct ??
    (rawCommission !== null && rawCommission > 0
      ? normalizeKalodataCommissionPct(rawCommission)
      : null);
  const commissionVerified = commissionRate !== null && commissionRate > 0;
  const commissionStatus: DataStatus = commissionVerified ? 'verified' : 'unavailable';

  const estimatedCommissionPerSaleThb =
    commissionVerified && commissionRate !== null && priceThb !== null && priceThb > 0
      ? Math.round((priceThb * commissionRate) / 100)
      : null;
  const commissionPerSaleStatus: DataStatus =
    estimatedCommissionPerSaleThb !== null ? 'verified' : 'unavailable';

  const revenueThb = productDetail?.revenueThb ?? toNullableFiniteNumber(item.revenue);
  const salesVolume = productDetail?.salesVolume ?? toNullableFiniteNumber(item.sales_volumn);
  const revenueGrowthRate =
    toNullableFiniteNumber(item.revenue_growth_rate) ?? productDetail?.revenueGrowthRate ?? null;
  const liveRevenueThb = productDetail?.liveRevenueThb ?? toNullableFiniteNumber(item.live_revenue);
  const videoRevenueThb = productDetail?.videoRevenueThb ?? toNullableFiniteNumber(item.video_revenue);
  const showcaseRevenueThb =
    toNullableFiniteNumber(item.showcase_revenue) ?? productDetail?.showcaseRevenueThb ?? null;
  const shoppingMallRevenueThb = productDetail?.shoppingMallRevenueThb ?? null;

  const creatorNumber = productDetail?.creatorNumber ?? null;
  const videoNumber = productDetail?.videoNumber ?? null;
  const liveNumber = productDetail?.liveNumber ?? null;
  const deliveryType = productDetail?.deliveryType ?? null;
  const productReviewCount =
    productDetail?.productReviewCount !== null &&
    productDetail?.productReviewCount !== undefined &&
    productDetail.productReviewCount > 0
      ? Math.round(productDetail.productReviewCount)
      : null;

  const sellerId =
    productDetail?.productShopId ??
    (item.seller_id !== undefined && item.seller_id !== null && String(item.seller_id).trim() !== ''
      ? String(item.seller_id).trim()
      : null);
  const sellerName =
    shopDetail?.shopName ??
    productDetail?.sellerName ??
    (typeof item.seller_name === 'string' && item.seller_name.trim() !== ''
      ? item.seller_name.trim()
      : null);
  const skuCount = toNullableFiniteNumber(item.sku_count) ?? productDetail?.skuCount ?? null;
  const launchDate =
    productDetail?.launchDate ??
    (typeof item.launch_date === 'string' && item.launch_date.trim() !== ''
      ? item.launch_date.trim()
      : null);

  const hasSellerIdentity = Boolean(sellerName || sellerId);
  const sellerStatus: DataStatus = hasSellerIdentity ? 'verified' : 'unavailable';
  const shopName = sellerName ?? (sellerId ? `Seller #${sellerId}` : 'Unavailable');

  const subCategoryParts = [secCategory?.category_name, terCategory?.category_name].filter(
    (part): part is string => Boolean(part && part.trim().length > 0)
  );
  const subCategory =
    subCategoryParts.length > 0
      ? subCategoryParts.join(' · ')
      : priCategory?.category_name || getCategoryDefinition(mappedCategory).labelEn;

  const hasSalesMetrics = revenueThb !== null || salesVolume !== null;
  const demandLevel = computeKalodataDemandLevel(revenueThb, salesVolume, revenueGrowthRate);
  const salesEvidenceStatus: DataStatus = hasSalesMetrics ? 'verified' : 'unavailable';
  const demandStatus: DataStatus = hasSalesMetrics ? 'verified' : 'unavailable';

  const videoSharePct =
    revenueThb !== null && revenueThb > 0 && videoRevenueThb !== null && videoRevenueThb >= 0
      ? Math.round((videoRevenueThb / revenueThb) * 1000) / 10
      : null;
  const liveSharePct =
    revenueThb !== null && revenueThb > 0 && liveRevenueThb !== null && liveRevenueThb >= 0
      ? Math.round((liveRevenueThb / revenueThb) * 1000) / 10
      : null;

  const aiVideoSuitability: AiVideoSuitability =
    videoSharePct !== null && videoSharePct >= 35
      ? 'High'
      : videoSharePct !== null && videoSharePct >= 15
        ? 'Good'
        : 'Moderate';
  const aiVideoStatus: DataStatus = videoRevenueThb !== null ? 'estimated' : 'unavailable';
  const aiCreativeRawStrength =
    videoSharePct !== null
      ? Math.max(40, Math.min(92, Math.round(45 + videoSharePct * 0.6)))
      : 45;

  // Competition — verified ONLY when Kalodata Product Detail returned creator_number
  const hasVerifiedCompetition = creatorNumber !== null && creatorNumber >= 0;
  const competitionDerived = hasVerifiedCompetition
    ? deriveCompetitionFromCreatorNumber(creatorNumber)
    : null;
  const competitionLevel: CompetitionLevel = competitionDerived?.level ?? 'Moderate';
  const competitionStatus: DataStatus = hasVerifiedCompetition ? 'verified' : 'unavailable';

  // Seller Reliability — verified ONLY when Kalodata Shop Detail returned real shop performance
  const hasVerifiedShop = Boolean(shopDetail && (shopDetail.revenueThb !== null || shopDetail.sellerType));
  const shopDerived = hasVerifiedShop && shopDetail ? deriveSellerReliabilityFromShop(shopDetail) : null;
  const sellerReliabilityLevel: 'Reliable' | 'Standard' | 'Needs Check' =
    shopDerived?.level ?? 'Standard';
  const sellerReliabilityStatus: DataStatus = hasVerifiedShop
    ? 'verified'
    : hasSellerIdentity
      ? 'unverified'
      : 'unavailable';

  // Reviews & Customer Feedback — strictly honest 4-state provenance
  const reviewCount = productReviewCount;
  const reviewCountStatus: DataStatus = reviewCount !== null ? 'verified' : 'unavailable';

  const customerRating = commentInsight?.averageRating ?? null;
  const customerRatingStatus: DataStatus = customerRating !== null ? 'verified' : 'unavailable';

  const reviewStrengthsEn = commentInsight
    ? commentInsight.positivePoints.slice(0, 5).map((p) => `${p.point} (${p.mentions} mentions)`)
    : [];
  const reviewStrengthsMy = commentInsight
    ? commentInsight.positivePoints.slice(0, 5).map((p) => `${p.point} (ဖော်ပြချက် ${p.mentions} ခု)`)
    : [];
  const customerComplaintsEn = commentInsight
    ? commentInsight.painPoints.slice(0, 5).map((p) => `${p.point} (${p.mentions} mentions)`)
    : [];
  const customerComplaintsMy = commentInsight
    ? commentInsight.painPoints.slice(0, 5).map((p) => `${p.point} (ဖော်ပြချက် ${p.mentions} ခု)`)
    : [];

  const hasVerifiedFeedback = Boolean(
    commentInsight &&
      (commentInsight.summary ||
        commentInsight.positivePoints.length > 0 ||
        commentInsight.painPoints.length > 0)
  );
  const feedbackStatus: DataStatus = hasVerifiedFeedback ? 'verified' : 'unavailable';
  const productQualityStatus: DataStatus = hasVerifiedFeedback
    ? 'verified'
    : reviewCount !== null
      ? 'estimated'
      : 'unavailable';

  const productQualityEvidenceEn = hasVerifiedFeedback
    ? `Kalodata Buyer Review Insight (${commentInsight!.commentsAnalyzed} comments analyzed): ${commentInsight!.summary ?? 'Buyer pros and pain points extracted directly from TikTok Shop TH reviews.'}`
    : undefined;
  const productQualityEvidenceMy = hasVerifiedFeedback
    ? `Kalodata Buyer Review Insight (မှတ်ချက် ${commentInsight!.commentsAnalyzed} ခု စစ်ဆေးပြီး) — ${commentInsight!.summary ?? 'TikTok Shop TH ဝယ်သူမှတ်ချက်များမှ အားသာချက်နှင့် အားနည်းချက်များကို တိုက်ရိုက်ရယူထားပါသည်။'}`
    : undefined;

  const reviewsRawStrength = hasVerifiedFeedback
    ? Math.min(92, Math.max(52, 62 + Math.min(20, (reviewCount ?? 0) / 20) + (commentInsight!.positivePoints.length >= commentInsight!.painPoints.length ? 8 : -8)))
    : reviewCount !== null
      ? Math.min(80, Math.max(45, Math.round(42 + Math.log10(reviewCount + 1) * 14)))
      : 0;
  const reviewsVerification: DataStatus = hasVerifiedFeedback
    ? 'verified'
    : reviewCount !== null
      ? 'verified'
      : 'unavailable';

  const growthTextEn =
    revenueGrowthRate !== null
      ? `${revenueGrowthRate >= 0 ? '+' : ''}${revenueGrowthRate.toFixed(2)}%`
      : 'Unavailable';

  const demandEvidenceEn: string[] = [
    `Kalodata TH (${dateRange}): ${salesVolume !== null ? salesVolume.toLocaleString('en-US') : '—'} units sold · Revenue ${formatThbInline(revenueThb)} · Growth ${growthTextEn}.`,
    `Channel split — Video: ${formatThbInline(videoRevenueThb)}${videoSharePct !== null ? ` (${videoSharePct}%)` : ''} · Live: ${formatThbInline(liveRevenueThb)}${liveSharePct !== null ? ` (${liveSharePct}%)` : ''} · ${shoppingMallRevenueThb !== null ? `Mall: ${formatThbInline(shoppingMallRevenueThb)}` : `Showcase: ${formatThbInline(showcaseRevenueThb)}`}.`,
  ];
  const demandEvidenceMy: string[] = [
    `Kalodata TH (${dateRange}) — ရောင်းအား ${salesVolume !== null ? salesVolume.toLocaleString('en-US') : '—'} ခု · ဝင်ငွေ ${formatThbInline(revenueThb)} · တိုးတက်နှုန်း ${growthTextEn}။`,
    `ရောင်းချမှုလမ်းကြောင်း — Video: ${formatThbInline(videoRevenueThb)}${videoSharePct !== null ? ` (${videoSharePct}%)` : ''} · Live: ${formatThbInline(liveRevenueThb)}${liveSharePct !== null ? ` (${liveSharePct}%)` : ''} · ${shoppingMallRevenueThb !== null ? `Mall: ${formatThbInline(shoppingMallRevenueThb)}` : `Showcase: ${formatThbInline(showcaseRevenueThb)}`}။`,
  ];

  if (productDetail) {
    const priceRangeText =
      minPriceThb !== null && maxPriceThb !== null
        ? `Price range ${formatThbInline(minPriceThb)}–${formatThbInline(maxPriceThb)}`
        : '';
    demandEvidenceEn.push(
      `Product Detail Verified: ${creatorNumber ?? '—'} promoting creators · ${videoNumber ?? '—'} videos · ${liveNumber ?? '—'} livestreams${reviewCount !== null ? ` · ${reviewCount.toLocaleString('en-US')} reviews` : ''}${deliveryType ? ` · Delivery: ${deliveryType}` : ''}${priceRangeText ? ` · ${priceRangeText}` : ''}.`
    );
    demandEvidenceMy.push(
      `Product Detail အတည်ပြုချက် — Creator ${creatorNumber ?? '—'} ဦး · Video ${videoNumber ?? '—'} ခု · Live ${liveNumber ?? '—'} ကြိမ်${reviewCount !== null ? ` · Review ${reviewCount.toLocaleString('en-US')} ခု` : ''}${deliveryType ? ` · ပို့ဆောင်မှု: ${deliveryType}` : ''}။`
    );
  }

  if (shopDetail) {
    const shopAffShare =
      shopDetail.revenueThb && shopDetail.revenueThb > 0 && shopDetail.affiliateRevenueThb !== null
        ? Math.round((shopDetail.affiliateRevenueThb / shopDetail.revenueThb) * 1000) / 10
        : null;
    demandEvidenceEn.push(
      `Shop Detail Verified (${shopDetail.shopName ?? shopName} · ${shopDetail.sellerType ?? 'Shop'}): 30d Shop GMV ${formatThbInline(shopDetail.revenueThb)}, Affiliate GMV ${formatThbInline(shopDetail.affiliateRevenueThb)}${shopAffShare !== null ? ` (${shopAffShare}%)` : ''}, ${shopDetail.productNumber ?? '—'} active products, ${shopDetail.creatorNumber !== null ? shopDetail.creatorNumber.toLocaleString('en-US') : '—'} shop creators.`
    );
    demandEvidenceMy.push(
      `Shop Detail အတည်ပြုချက် (${shopDetail.shopName ?? shopName} · ${shopDetail.sellerType ?? 'Shop'}) — ဆိုင် ၃၀ ရက် ဝင်ငွေ ${formatThbInline(shopDetail.revenueThb)}၊ Affiliate ဝင်ငွေ ${formatThbInline(shopDetail.affiliateRevenueThb)}${shopAffShare !== null ? ` (${shopAffShare}%)` : ''}၊ Product ${shopDetail.productNumber ?? '—'} မျိုး။`
    );
  }

  const categoryPathEn = [
    priCategory ? `${priCategory.category_name} (${priCategory.category_id})` : null,
    secCategory ? `${secCategory.category_name} (${secCategory.category_id})` : null,
    terCategory ? `${terCategory.category_name} (${terCategory.category_id})` : null,
  ]
    .filter(Boolean)
    .join(' > ');

  if (categoryPathEn) {
    demandEvidenceEn.push(`Verified Kalodata Category Hierarchy: ${categoryPathEn}.`);
    demandEvidenceMy.push(`Kalodata Category Hierarchy: ${categoryPathEn}။`);
  }

  const kalodataProductUrl = `https://www.kalodata.com/product/detail?id=${encodeURIComponent(productId)}&region=TH`;
  const cleanNumericProductId = extractNumericTikTokProductId(productId) ?? '';
  const tiktokShopProductUrl = cleanNumericProductId
    ? buildFallbackTikTokShopUrl(cleanNumericProductId)
    : null;
  const sourceEndpoints = [sourceMode === 'video-rank' ? 'TH Video Rank' : 'TH Product Rank'];
  if (productDetail) sourceEndpoints.push('Product Detail');
  if (shopDetail) sourceEndpoints.push('Shop Detail');
  if (commentInsight) sourceEndpoints.push('Comment Insight');

  const sources: ResearchSourceItem[] = [
    ...(tiktokShopProductUrl
      ? [
          {
            labelEn: `TikTok Shop Thailand Product #${cleanNumericProductId} (${shopName})`,
            labelMy: `TikTok Shop Thailand မူရင်း Product #${cleanNumericProductId} (${shopName})`,
            sourceType: 'TikTok Shop TH',
            url: tiktokShopProductUrl,
            verified: true,
          },
        ]
      : []),
    {
      labelEn: `Kalodata TH Product #${productId} (${shopName})`,
      labelMy: `Kalodata TH Product #${productId} (${shopName}) — ${sourceEndpoints.join(' + ')}`,
      sourceType: `Kalodata OpenAPI · ${sourceEndpoints.join(' + ')}`,
      url: kalodataProductUrl,
      verified: true,
    },
  ];

  const demandRawStrength = computeKalodataDemandStrength(revenueThb, salesVolume, revenueGrowthRate);
  const priceRawStrength = computeKalodataPriceStrength(priceThb);

  const scoringInputs: ScoringInputs = {
    demandSales: {
      rawStrength: demandRawStrength,
      verification: salesEvidenceStatus,
      evidenceEn: `Kalodata ${dateRange}: ${salesVolume !== null ? `${salesVolume.toLocaleString('en-US')} units` : 'sales unavailable'}, Revenue ${formatThbInline(revenueThb)}, Growth ${growthTextEn}.`,
      evidenceMy: `Kalodata ${dateRange} အတည်ပြုဒေတာ — ရောင်းအား ${salesVolume !== null ? `${salesVolume.toLocaleString('en-US')} ခု` : 'မရရှိ'}၊ ဝင်ငွေ ${formatThbInline(revenueThb)}၊ တိုးတက်နှုန်း ${growthTextEn}။`,
    },
    commissionEarning: {
      rawStrength: commissionVerified && commissionRate !== null ? Math.min(100, Math.round(28 + commissionRate * 4.5)) : 0,
      verification: commissionStatus,
      evidenceEn:
        commissionVerified && commissionRate !== null
          ? `Kalodata verified affiliate commission: ${commissionRate}%${estimatedCommissionPerSaleThb !== null ? ` (~${formatThbInline(estimatedCommissionPerSaleThb)}/order)` : ''}.`
          : 'Affiliate commission rate unavailable from Kalodata.',
      evidenceMy:
        commissionVerified && commissionRate !== null
          ? `Kalodata မှ အတည်ပြုထားသော Affiliate Commission: ${commissionRate}%${estimatedCommissionPerSaleThb !== null ? ` (~${formatThbInline(estimatedCommissionPerSaleThb)} / ခု)` : ''}။`
          : 'Kalodata မှ Commission Rate မရရှိပါ။',
    },
    aiCreative: {
      rawStrength: aiCreativeRawStrength,
      verification: aiVideoStatus,
      evidenceEn:
        videoRevenueThb !== null
          ? `Estimated from Kalodata video channel revenue (${formatThbInline(videoRevenueThb)}${videoSharePct !== null ? `, ${videoSharePct}% of total revenue` : ''})${videoNumber !== null ? ` across ${videoNumber} promoting video(s)` : ''}.`
          : 'Video channel revenue breakdown unavailable from Kalodata.',
      evidenceMy:
        videoRevenueThb !== null
          ? `Kalodata Video Revenue (${formatThbInline(videoRevenueThb)}${videoSharePct !== null ? ` · စုစုပေါင်း၏ ${videoSharePct}%` : ''})${videoNumber !== null ? ` နှင့် Video ${videoNumber} ခု` : ''} အပေါ် အခြေခံခန့်မှန်းထားသည်။`
          : 'Kalodata တွင် Video Revenue အချက်အလက် မပါဝင်ပါ။',
    },
    reviewsQuality: {
      rawStrength: reviewsRawStrength,
      verification: reviewsVerification,
      evidenceEn: hasVerifiedFeedback
        ? `Kalodata verified ${reviewCount !== null ? `${reviewCount.toLocaleString('en-US')} product reviews` : 'buyer reviews'} and analyzed ${commentInsight!.commentsAnalyzed} comments (${commentInsight!.positivePoints.length} positive themes, ${commentInsight!.painPoints.length} pain points).${customerRating !== null ? ` Sample avg rating: ${customerRating}/5.` : ' Overall star rating unavailable.'}`
        : reviewCount !== null
          ? `Kalodata Product Detail verified ${reviewCount.toLocaleString('en-US')} total reviews. Star rating and buyer comment text require direct TikTok Shop check or Review Insight.`
          : 'Unavailable — Kalodata Product Rank API does not include buyer star ratings or review counts. Check TikTok Shop directly.',
      evidenceMy: hasVerifiedFeedback
        ? `Kalodata မှ ${reviewCount !== null ? `Review ${reviewCount.toLocaleString('en-US')} ခု` : 'ဝယ်သူမှတ်ချက်များ'} နှင့် မှတ်ချက် ${commentInsight!.commentsAnalyzed} ခုကို ခွဲခြမ်းစိတ်ဖြာထားပါသည် (အားသာချက် ${commentInsight!.positivePoints.length} ချက်၊ အားနည်းချက် ${commentInsight!.painPoints.length} ချက်)။`
        : reviewCount !== null
          ? `Kalodata Product Detail မှ Review စုစုပေါင်း ${reviewCount.toLocaleString('en-US')} ခုကို အတည်ပြုရရှိထားပါသည်။ Star Rating ကို TikTok Shop တွင် တိုက်ရိုက်စစ်ဆေးပါ။`
          : 'Unavailable — Kalodata Product Rank API တွင် Customer Rating နှင့် Review အရေအတွက် မပါဝင်ပါ။ TikTok Shop တွင် တိုက်ရိုက်စစ်ဆေးပါ။',
    },
    priceAppeal: {
      rawStrength: priceRawStrength,
      verification: priceStatus,
      evidenceEn:
        priceThb !== null
          ? `Kalodata verified unit price: ${formatThbInline(priceThb)}${minPriceThb !== null && maxPriceThb !== null ? ` (range ${formatThbInline(minPriceThb)}–${formatThbInline(maxPriceThb)})` : ''}${skuCount !== null ? ` across ${skuCount} SKU(s)` : ''}.`
          : 'Unit price unavailable from Kalodata.',
      evidenceMy:
        priceThb !== null
          ? `Kalodata မှ အတည်ပြုထားသော ဈေးနှုန်း ${formatThbInline(priceThb)}${minPriceThb !== null && maxPriceThb !== null ? ` (${formatThbInline(minPriceThb)}–${formatThbInline(maxPriceThb)})` : ''}${skuCount !== null ? ` (SKU ${skuCount} မျိုး)` : ''}။`
          : 'Kalodata မှ ဈေးနှုန်း မရရှိပါ။',
    },
    competitionOpportunity: {
      rawStrength: competitionDerived?.rawStrength ?? 0,
      verification: competitionStatus,
      evidenceEn: hasVerifiedCompetition
        ? `Kalodata Product Detail verified ${creatorNumber!.toLocaleString('en-US')} active promoting creator(s), ${videoNumber ?? '—'} shoppable video(s), and ${liveNumber ?? '—'} livestream(s) in ${dateRange} (${competitionLevel} competition).`
        : 'Unavailable — Kalodata Product Rank API does not return active creator or competing shop counts for this SKU.',
      evidenceMy: hasVerifiedCompetition
        ? `Kalodata Product Detail မှ အတည်ပြုချက် — ${dateRange} အတွင်း ကြော်ငြာနေသော Creator ${creatorNumber!.toLocaleString('en-US')} ဦး၊ Video ${videoNumber ?? '—'} ခုနှင့် Live ${liveNumber ?? '—'} ကြိမ် ရှိပါသည် (ပြိုင်ဆိုင်မှု: ${competitionLevel})။`
        : 'Unavailable — Kalodata Product Rank API တွင် ပြိုင်ဘက်ဆိုင်နှင့် Creator အရေအတွက် မပါဝင်ပါ။',
    },
    sellerReliability: {
      rawStrength: shopDerived?.rawStrength ?? (hasSellerIdentity ? 60 : 0),
      verification: sellerReliabilityStatus,
      evidenceEn: hasVerifiedShop && shopDetail
        ? `Kalodata Shop Detail verified: ${shopDetail.shopName ?? shopName} (${shopDetail.sellerType ?? 'Seller'}) · 30d GMV ${formatThbInline(shopDetail.revenueThb)} · Affiliate GMV ${formatThbInline(shopDetail.affiliateRevenueThb)} · ${shopDetail.productNumber ?? '—'} active products · ${shopDetail.creatorNumber !== null ? shopDetail.creatorNumber.toLocaleString('en-US') : '—'} creators.${deliveryType ? ` Delivery: ${deliveryType}.` : ''}`
        : hasSellerIdentity
          ? `Seller identity from Kalodata: ${shopName}${sellerId ? ` (Seller ID: ${sellerId})` : ''}${skuCount !== null ? `, ${skuCount} SKU(s)` : ''}. Shop GMV, seller type, and return rate are unverified in this mode.`
          : 'Seller information unavailable from Kalodata.',
      evidenceMy: hasVerifiedShop && shopDetail
        ? `Kalodata Shop Detail အတည်ပြုချက် — ${shopDetail.shopName ?? shopName} (${shopDetail.sellerType ?? 'Seller'}) · ရက် ၃၀ ဆိုင်ဝင်ငွေ ${formatThbInline(shopDetail.revenueThb)} · Affiliate ဝင်ငွေ ${formatThbInline(shopDetail.affiliateRevenueThb)} · Product ${shopDetail.productNumber ?? '—'} မျိုး${deliveryType ? ` · ပို့ဆောင်မှု: ${deliveryType}` : ''}။`
        : hasSellerIdentity
          ? `Kalodata ဆိုင်အချက်အလက်: ${shopName}${sellerId ? ` (Seller ID: ${sellerId})` : ''}${skuCount !== null ? ` · SKU ${skuCount} မျိုး` : ''}။ ဆိုင် GMV နှင့် Return Rate ကို ဤ Mode တွင် မစစ်ဆေးရသေးသဖြင့် Unverified အဖြစ် ဖော်ပြထားပါသည်။`
          : 'Kalodata မှ Seller အချက်အလက် မရရှိပါ။',
    },
  };

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
    missingDataEn.push('Buyer review text themes / complaints (available via Deep Research Review Insights opt-in or direct TikTok Shop check).');
    missingDataMy.push('ဝယ်သူမှတ်ချက် အားသာချက်/အားနည်းချက်များ (Deep Research Review Insights ဖွင့်ထားချိန် သို့မဟုတ် TikTok Shop တွင် စစ်ဆေးရန်)။');
  }
  if (!hasVerifiedCompetition) {
    missingDataEn.push('Active affiliate creator count and competing video/live volume (unlocked in Balanced/Deep Detail enrichment).');
    missingDataMy.push('Creator အရေအတွက်နှင့် Video/Live ပြိုင်ဆိုင်မှုအခြေအနေ (Balanced/Deep Detail API တွင် ရရှိနိုင်သည်)။');
  }
  if (!hasVerifiedShop) {
    missingDataEn.push('Shop-level GMV, BRAND/RETAILER verification, and affiliate revenue ratio (unlocked in Deep Research Mode).');
    missingDataMy.push('ဆိုင်တစ်ခုလုံး၏ GMV၊ BRAND/RETAILER အမျိုးအစားနှင့် Affiliate ဝင်ငွေအချိုး (Deep Research Mode တွင် ရရှိနိုင်သည်)။');
  }
  missingDataEn.push('Exact SKU return/refund rate and live seller shipping SLA (must be checked directly on TikTok Shop Thailand).');
  missingDataMy.push('SKU Return/Refund Rate နှင့် ပို့ဆောင်မှုမြန်ဆန်နှုန်းအတိအကျ (TikTok Shop Thailand တွင် ကိုယ်တိုင်စစ်ဆေးရန်)။');

  if (mappedCategory === 'cosmetics-beauty') {
    missingDataEn.push('Thai FDA (อย.) notification number on the seller listing.');
    missingDataMy.push('ဆိုင်စာမျက်နှာရှိ ထိုင်း FDA (อย.) မှတ်ပုံတင်နံပါတ်။');
  } else if (mappedCategory === 'womens-fashion') {
    missingDataEn.push('Garment size chart measurements (cm) and real buyer fit/fabric photos.');
    missingDataMy.push('အဝတ်အထည် Size Chart (cm) နှင့် ဝယ်သူများ၏ အထည်သား/ဝတ်ဆင်ပုံ ဓာတ်ပုံများ။');
  } else {
    const catDef = getCategoryDefinition(mappedCategory);
    if (catDef.aiProfile.riskChecklistEn[0]) {
      missingDataEn.push(catDef.aiProfile.riskChecklistEn[0]);
    }
    if (catDef.aiProfile.riskChecklistMy[0]) {
      missingDataMy.push(catDef.aiProfile.riskChecklistMy[0]);
    }
  }

  if (!imageCheck.imageVerified) {
    missingDataEn.push('Verified live product photo from master_image_url.');
    missingDataMy.push('master_image_url မှ စစ်ဆေးအတည်ပြုနိုင်သော Product ဓာတ်ပုံ။');
  }

  const generalRisksEn: string[] = [];
  const generalRisksMy: string[] = [];

  if (deliveryType && deliveryType.toLowerCase() === 'global') {
    generalRisksEn.push('Cross-border / Global delivery detected in Kalodata Product Detail — longer shipping times in Thailand can increase cancellation or negative delivery reviews.');
    generalRisksMy.push('Kalodata Product Detail အရ Global / Cross-border ပို့ဆောင်မှုဖြစ်နေသဖြင့် ပို့ဆောင်ချိန်ကြာမြင့်နိုင်ပြီး Order ပယ်ဖျက်မှု သို့မဟုတ် Delivery Review ညံ့နိုင်ခြေကို သတိပြုပါ။');
  }
  if (creatorNumber !== null && creatorNumber > 120) {
    generalRisksEn.push(`High creator saturation (${creatorNumber.toLocaleString('en-US')} active creators) — differentiated hook and angle are required to convert.`);
    generalRisksMy.push(`ကြော်ငြာနေသော Creator ${creatorNumber.toLocaleString('en-US')} ဦး ရှိသဖြင့် ပြိုင်ဆိုင်မှုမြင့်မားပြီး ထူးခြားသော Video Hook ဖန်တီးရန် လိုအပ်ပါသည်။`);
  }
  if (customerRating === null) {
    generalRisksEn.push('Customer star rating is not exposed by Kalodata — inspect live TikTok Shop reviews before filming.');
    generalRisksMy.push('Kalodata တွင် Customer Star Rating မပါဝင်သဖြင့် ဗီဒီယိုမရိုက်မီ TikTok Shop တွင် ဝယ်သူမှတ်ချက်များကို စစ်ဆေးပါ။');
  }
  generalRisksEn.push('Affiliate commission rates on TikTok Shop can be changed by the seller at any time; verify active rate in Creator Center.');
  generalRisksMy.push('TikTok Shop Affiliate Commission Rate ကို ဆိုင်ရှင်မှ အချိန်မရွေး ပြောင်းလဲနိုင်သဖြင့် Creator Center တွင် ထပ်မံအတည်ပြုပါ။');

  const cosmeticsComplianceRisk =
    mappedCategory === 'cosmetics-beauty'
      ? normalizeCosmeticsRisk(
          shopDetail?.sellerType?.toUpperCase() === 'BRAND'
            ? {
                brandAuthenticity: {
                  status: 'Verified',
                  noteEn: `Kalodata Shop Detail confirms seller_type = BRAND (${shopDetail.shopName ?? shopName}). Still confirm official mall badge in TikTok Shop Creator Center.`,
                  noteMy: `Kalodata Shop Detail အရ seller_type = BRAND (${shopDetail.shopName ?? shopName}) ဖြစ်ကြောင်း အတည်ပြုထားပါသည်။ TikTok Shop Creator Center တွင် Mall တံဆိပ်ကို ထပ်မံစစ်ဆေးပါ။`,
                },
              }
            : {}
        )
      : undefined;

  const researchDepthTag: ResearchDepthTag =
    shopDetail || commentInsight
      ? 'deep-audited'
      : productDetail
        ? 'detail-enriched'
        : 'rank-only';

  const draftProduct: ResearchProduct = {
    id: `kalodata-th-${productId}`,
    name: productName,
    nameMy: productName,
    brand: shopDetail?.sellerType?.toUpperCase() === 'BRAND' ? shopDetail.shopName ?? undefined : undefined,
    category: mappedCategory,
    researchMode,
    researchDepthTag,
    kalodataMetrics: {
      productId,
      dateRange,
      researchMode,
      detailEnriched: Boolean(productDetail),
      shopEnriched: Boolean(shopDetail),
      reviewInsightEnriched: Boolean(commentInsight),
      lastEnrichedAt:
        productDetail || shopDetail || commentInsight ? researchedAt : null,
      productDetailUpdatedAt: productDetail ? researchedAt : null,
      shopDetailUpdatedAt: shopDetail ? researchedAt : null,
      reviewInsightUpdatedAt: commentInsight ? researchedAt : null,
      unitPriceThb: priceThb,
      minPriceThb,
      maxPriceThb,
      salesVolume,
      revenueThb,
      revenueGrowthRate,
      commissionRatePct: commissionRate,
      liveRevenueThb,
      videoRevenueThb,
      showcaseRevenueThb,
      shoppingMallRevenueThb,
      creatorNumber,
      videoNumber,
      liveNumber,
      deliveryType,
      productReviewCount: reviewCount,
      launchDate,
      trendPointsCount: productDetail?.trendPointsCount ?? null,
      trendPeakThb: productDetail?.trendPeakThb ?? null,
      trendAvgThb: productDetail?.trendAvgThb ?? null,
      sellerId,
      sellerName,
      skuCount,
      shopSellerType: shopDetail?.sellerType ?? null,
      shopRevenueThb: shopDetail?.revenueThb ?? null,
      shopAffiliateRevenueThb: shopDetail?.affiliateRevenueThb ?? null,
      shopSelfAccountRevenueThb: shopDetail?.selfAccountRevenueThb ?? null,
      shopShoppingMallRevenueThb: shopDetail?.shoppingMallRevenueThb ?? null,
      shopSalesVolume: shopDetail?.salesVolume ?? null,
      shopUnitPriceThb: shopDetail?.unitPriceThb ?? null,
      shopCreatorNumber: shopDetail?.creatorNumber ?? null,
      shopProductNumber: shopDetail?.productNumber ?? null,
      shopVideoNumber: shopDetail?.videoNumber ?? null,
      shopLiveNumber: shopDetail?.liveNumber ?? null,
      reviewInsight: commentInsight
        ? buildStructuredReviewInsight({
            productId,
            summary: commentInsight.summary,
            positivePoints: commentInsight.positivePoints,
            painPoints: commentInsight.painPoints,
            usageScenarios: commentInsight.usageScenarios,
            commentsAnalyzed: commentInsight.commentsAnalyzed,
            averageRating: commentInsight.averageRating,
            ratedCommentCount: commentInsight.ratedCommentCount,
            rawComments: commentInsight.rawComments,
            pagesFetched: commentInsight.pagesFetched,
            updatedAt: researchedAt,
          })
        : null,
      productDescription: productDetail?.productDescription ?? null,
      priCategory,
      secCategory,
      terCategory,
      categoryIdsRequested,
    },
    subCategory,
    subCategoryMy: subCategory,
    shopName,
    sellerStatus,
    dispatchHub:
      deliveryType && deliveryType.toLowerCase() === 'global'
        ? 'Cross-border (Global → TH)'
        : 'Thailand (TH)',
    researchedAt,
    imageUrl: imageCheck.imageUrl,
    imageOriginUrl: imageCheck.imageOriginUrl,
    imageVerified: imageCheck.imageVerified,
    imageSourceNoteEn: imageCheck.imageSourceNoteEn,
    imageSourceNoteMy: imageCheck.imageSourceNoteMy,
    priceThb,
    priceStatus,
    commissionRate,
    commissionVerified,
    commissionStatus,
    estimatedCommissionPerSaleThb,
    commissionPerSaleStatus,
    commissionNoteEn:
      commissionVerified && commissionRate !== null
        ? `Kalodata verified Thailand TikTok Shop affiliate commission rate: ${commissionRate}%${estimatedCommissionPerSaleThb !== null ? ` (~${formatThbInline(estimatedCommissionPerSaleThb)} per order at ${formatThbInline(priceThb)})` : ''}. Confirm active open-plan terms in TikTok Shop Creator Center.`
        : 'Commission rate unavailable from Kalodata API.',
    commissionNoteMy:
      commissionVerified && commissionRate !== null
        ? `Kalodata မှ အတည်ပြုထားသော ထိုင်း TikTok Shop Affiliate Commission Rate: ${commissionRate}%${estimatedCommissionPerSaleThb !== null ? ` (တစ်ခုရောင်းလျှင် ~${formatThbInline(estimatedCommissionPerSaleThb)})` : ''}။ TikTok Shop Creator Center တွင် လက်ရှိ Plan ကို ထပ်မံစစ်ဆေးပါ။`
        : 'Kalodata API မှ Commission Rate မရရှိပါ။',
    reviewCount,
    reviewCountStatus,
    customerRating,
    customerRatingStatus,
    feedbackStatus,
    productQualityEvidenceEn,
    productQualityEvidenceMy,
    productQualityStatus,
    salesEvidenceStatus,
    demandLevel,
    demandStatus,
    competitionLevel,
    competitionStatus,
    aiVideoSuitability,
    aiVideoStatus,
    sellerReliabilityLevel,
    sellerReliabilityStatus,
    opportunityScore: 0,
    confidenceLevel: 'Low',
    scoringInputs,
    whyChooseEn: `Kalodata TH (${dateRange}) verified affiliate product: ${formatThbInline(revenueThb)} revenue, ${salesVolume !== null ? salesVolume.toLocaleString('en-US') : '—'} units sold (${growthTextEn} growth), unit price ${formatThbInline(priceThb)}, and ${commissionRate !== null ? `${commissionRate}%` : '—'} affiliate commission from ${shopName}${creatorNumber !== null ? ` (${creatorNumber} active creators)` : ''}.`,
    whyChooseMy: `Kalodata TH (${dateRange}) အတည်ပြု Affiliate Product — ဝင်ငွေ ${formatThbInline(revenueThb)}၊ ရောင်းအား ${salesVolume !== null ? salesVolume.toLocaleString('en-US') : '—'} ခု (တိုးတက်နှုန်း ${growthTextEn})၊ ဈေးနှုန်း ${formatThbInline(priceThb)} နှင့် Commission ${commissionRate !== null ? `${commissionRate}%` : '—'} (${shopName})။`,
    demandEvidenceEn,
    demandEvidenceMy,
    salesPotentialEn: `Measured ${dateRange} revenue of ${formatThbInline(revenueThb)} across ${salesVolume !== null ? salesVolume.toLocaleString('en-US') : '—'} units (growth ${growthTextEn})${launchDate ? `; launch date: ${launchDate}` : ''}${productDetail?.trendAvgThb ? `; 30d daily avg ~${formatThbInline(productDetail.trendAvgThb)}` : ''}.`,
    salesPotentialMy: `${dateRange} အတွင်း တိုင်းတာရရှိသော ဝင်ငွေ ${formatThbInline(revenueThb)} နှင့် ရောင်းအား ${salesVolume !== null ? salesVolume.toLocaleString('en-US') : '—'} ခု (တိုးတက်နှုန်း ${growthTextEn})${launchDate ? ` · စတင်ရောင်းချရက်စွဲ ${launchDate}` : ''}။`,
    reviewStrengthsEn,
    reviewStrengthsMy,
    customerComplaintsEn,
    customerComplaintsMy,
    competitionDetailEn: hasVerifiedCompetition
      ? `Kalodata Product Detail verified ${creatorNumber!.toLocaleString('en-US')} active promoting creator(s), ${videoNumber ?? '—'} shoppable video(s), and ${liveNumber ?? '—'} livestream(s) in ${dateRange}. Competition level assessed as ${competitionLevel}.`
      : 'Unavailable from Kalodata Product Rank API — active creator count and competing shop count are not provided by this endpoint. Review live TikTok Shop Thailand search results directly.',
    competitionDetailMy: hasVerifiedCompetition
      ? `Kalodata Product Detail အတည်ပြုချက် — ${dateRange} အတွင်း ကြော်ငြာနေသော Creator ${creatorNumber!.toLocaleString('en-US')} ဦး၊ Video ${videoNumber ?? '—'} ခုနှင့် Live ${liveNumber ?? '—'} ကြိမ် ရှိပါသည် (ပြိုင်ဆိုင်မှုအဆင့်: ${competitionLevel})။`
      : 'Kalodata Product Rank API တွင် ပြိုင်ဘက်ဆိုင်နှင့် Creator အရေအတွက် မပါဝင်ပါ (Unavailable)။ TikTok Shop Thailand တွင် တိုက်ရိုက်စစ်ဆေးပါ။',
    sellerReliabilityEn: hasVerifiedShop && shopDetail
      ? `Kalodata Shop Detail verified: ${shopDetail.shopName ?? shopName} (${shopDetail.sellerType ?? 'Seller'}) generated ${formatThbInline(shopDetail.revenueThb)} in 30d GMV (${formatThbInline(shopDetail.affiliateRevenueThb)} via affiliates) across ${shopDetail.productNumber ?? '—'} active products and ${shopDetail.creatorNumber !== null ? shopDetail.creatorNumber.toLocaleString('en-US') : '—'} creators.${deliveryType ? ` Fulfillment: ${deliveryType}.` : ''}`
      : hasSellerIdentity
        ? `Kalodata seller record: ${shopName}${sellerId ? ` (Seller ID: ${sellerId})` : ''}${skuCount !== null ? ` · ${skuCount} SKU(s)` : ''}. Shop GMV, seller type, and return rate are unverified in this mode.`
        : 'Seller information unavailable from Kalodata API.',
    sellerReliabilityMy: hasVerifiedShop && shopDetail
      ? `Kalodata Shop Detail အတည်ပြုချက် — ${shopDetail.shopName ?? shopName} (${shopDetail.sellerType ?? 'Seller'}) သည် ရက် ၃၀ အတွင်း စုစုပေါင်းဝင်ငွေ ${formatThbInline(shopDetail.revenueThb)} (Affiliate ဝင်ငွေ ${formatThbInline(shopDetail.affiliateRevenueThb)}) ရှိပြီး Product ${shopDetail.productNumber ?? '—'} မျိုးနှင့် Creator ${shopDetail.creatorNumber !== null ? shopDetail.creatorNumber.toLocaleString('en-US') : '—'} ဦး ချိတ်ဆက်ထားပါသည်။`
      : hasSellerIdentity
        ? `Kalodata ဆိုင်မှတ်တမ်း: ${shopName}${sellerId ? ` (Seller ID: ${sellerId})` : ''}${skuCount !== null ? ` · SKU ${skuCount} မျိုး` : ''}။ ဆိုင် GMV နှင့် Return Rate ကို ဤ Mode တွင် မစစ်ဆေးရသေးပါ။`
        : 'Kalodata API မှ Seller အချက်အလက် မရရှိပါ။',
    generalRisksEn,
    generalRisksMy,
    fashionReturnRisk:
      mappedCategory === 'womens-fashion' ? normalizeFashionRisk({}) : undefined,
    cosmeticsComplianceRisk,
    aiVideoDetailEn:
      videoRevenueThb !== null
        ? `Kalodata ${dateRange} video channel revenue is ${formatThbInline(videoRevenueThb)}${videoSharePct !== null ? ` (${videoSharePct}% of total revenue)` : ''}${videoNumber !== null ? ` across ${videoNumber} video(s)` : ''}, compared to ${formatThbInline(liveRevenueThb)} via livestream.`
        : 'Video channel revenue data is unavailable from Kalodata.',
    aiVideoDetailMy:
      videoRevenueThb !== null
        ? `Kalodata ${dateRange} အတွင်း Video မှ ရောင်းအားဝင်ငွေ ${formatThbInline(videoRevenueThb)}${videoSharePct !== null ? ` (စုစုပေါင်း၏ ${videoSharePct}%)` : ''}${videoNumber !== null ? ` · Video ${videoNumber} ခု` : ''} နှင့် Live မှ ${formatThbInline(liveRevenueThb)} ဖြစ်ပါသည်။`
        : 'Kalodata တွင် Video Revenue အချက်အလက် မပါဝင်ပါ။',
    videoIdeas: normalizeVideoIdeas([]),
    sources,
    confidenceDetailEn: `Verified via Kalodata ${sourceEndpoints.join(' + ')}: price (${formatThbInline(priceThb)}), ${dateRange} sales/revenue, category (${priCategory?.category_id ?? '—'}), affiliate commission (${commissionRate !== null ? `${commissionRate}%` : '—'})${productDetail ? `, ${creatorNumber ?? '—'} creators, ${reviewCount ?? '—'} reviews` : ''}${shopDetail ? `, shop type (${shopDetail.sellerType ?? '—'}) & 30d shop GMV (${formatThbInline(shopDetail.revenueThb)})` : ''}. Unreturned fields remain honestly labeled unavailable/unverified.`,
    confidenceDetailMy: `Kalodata ${sourceEndpoints.join(' + ')} မှ တိုက်ရိုက်အတည်ပြုထားပါသည် — ဈေးနှုန်း (${formatThbInline(priceThb)})၊ ${dateRange} ရောင်းအား/ဝင်ငွေ၊ Category (${priCategory?.category_id ?? '—'})၊ Affiliate Commission (${commissionRate !== null ? `${commissionRate}%` : '—'})${productDetail ? `၊ Creator ${creatorNumber ?? '—'} ဦး၊ Review ${reviewCount ?? '—'} ခု` : ''}${shopDetail ? `၊ ဆိုင်အမျိုးအစား (${shopDetail.sellerType ?? '—'}) နှင့် ဆိုင်ဝင်ငွေ (${formatThbInline(shopDetail.revenueThb)})` : ''}။ API မှ မရရှိသောအချက်များကို Unavailable/Unverified အဖြစ် ရိုးသားစွာ ဖော်ပြထားပါသည်။`,
    missingDataEn,
    missingDataMy,
    myanmarLanguage: (() => {
      const rawTextCandidates = extractRawMyanmarTextCandidates({
        rawItem: item,
        productDetail: productDetail
          ? { productDescription: productDetail.productDescription ?? null }
          : null,
        commentInsight: commentInsight
          ? {
              summary: commentInsight.summary,
              positivePoints: commentInsight.positivePoints,
              painPoints: commentInsight.painPoints,
              usageScenarios: commentInsight.usageScenarios,
              rawComments: commentInsight.rawComments,
              allRawComments: commentInsight.allRawComments,
            }
          : null,
      });
      if (matchedVideos && matchedVideos.length > 0) {
        return buildMyanmarVideoLanguageAnalysis(matchedVideos, rawTextCandidates);
      }
      return detectMyanmarLanguageSignals(rawTextCandidates);
    })(),
  };

  const evaluation = evaluateProductOpportunity(draftProduct);
  return {
    ...draftProduct,
    opportunityScore: evaluation.totalScore,
    confidenceLevel: evaluation.confidenceLevel,
  };
}

function cachedProductDetailToParsed(
  cachedPd: KalodataProductDetailEnrichmentRecord
): ParsedProductDetail {
  return {
    productId: cachedPd.productId,
    productShopId: cachedPd.productShopId,
    ...(cachedPd.productName ? { productName: cachedPd.productName } : {}),
    ...(cachedPd.sellerName ? { sellerName: cachedPd.sellerName } : {}),
    ...(cachedPd.masterImageUrl ? { masterImageUrl: cachedPd.masterImageUrl } : {}),
    ...(cachedPd.priCategory ? { priCategory: cachedPd.priCategory } : {}),
    ...(cachedPd.secCategory ? { secCategory: cachedPd.secCategory } : {}),
    ...(cachedPd.terCategory ? { terCategory: cachedPd.terCategory } : {}),
    ...(cachedPd.revenueGrowthRate !== undefined ? { revenueGrowthRate: cachedPd.revenueGrowthRate } : {}),
    ...(cachedPd.showcaseRevenueThb !== undefined ? { showcaseRevenueThb: cachedPd.showcaseRevenueThb } : {}),
    ...(cachedPd.skuCount !== undefined ? { skuCount: cachedPd.skuCount } : {}),
    minPriceThb: cachedPd.minPriceThb,
    maxPriceThb: cachedPd.maxPriceThb,
    unitPriceThb: cachedPd.unitPriceThb,
    revenueThb: cachedPd.revenueThb,
    salesVolume: cachedPd.salesVolume,
    videoRevenueThb: cachedPd.videoRevenueThb,
    liveRevenueThb: cachedPd.liveRevenueThb,
    shoppingMallRevenueThb: cachedPd.shoppingMallRevenueThb,
    commissionRatePct: cachedPd.commissionRatePct,
    creatorNumber: cachedPd.creatorNumber,
    videoNumber: cachedPd.videoNumber,
    liveNumber: cachedPd.liveNumber,
    deliveryType: cachedPd.deliveryType,
    productReviewCount: cachedPd.productReviewCount,
    productDescription: cachedPd.productDescription ?? null,
    launchDate: cachedPd.launchDate,
    trendPointsCount: cachedPd.trendPointsCount,
    trendPeakThb: cachedPd.trendPeakThb,
    trendAvgThb: cachedPd.trendAvgThb,
  };
}

function synthesizeItemFromVideoAndDetail(
  productId: string,
  linked: ParsedVideoLinkedProduct | null,
  detail: ParsedProductDetail | null
): Record<string, unknown> {
  return {
    product_id: productId,
    product_name: detail?.productName ?? linked?.productName ?? null,
    unit_price: detail?.unitPriceThb ?? linked?.unitPriceThb ?? null,
    commission_rate: detail?.commissionRatePct ?? linked?.commissionRatePct ?? null,
    revenue: detail?.revenueThb ?? linked?.revenueThb ?? null,
    sales_volumn: detail?.salesVolume ?? linked?.salesVolume ?? null,
    revenue_growth_rate: detail?.revenueGrowthRate ?? null,
    video_revenue: detail?.videoRevenueThb ?? null,
    live_revenue: detail?.liveRevenueThb ?? null,
    showcase_revenue: detail?.showcaseRevenueThb ?? null,
    master_image_url: detail?.masterImageUrl ?? linked?.masterImageUrl ?? null,
    seller_id: detail?.productShopId ?? linked?.sellerId ?? null,
    seller_name: detail?.sellerName ?? linked?.sellerName ?? null,
    sku_count: detail?.skuCount ?? null,
    launch_date: detail?.launchDate ?? null,
    pri_category: detail?.priCategory ?? linked?.priCategory ?? null,
    sec_category: detail?.secCategory ?? linked?.secCategory ?? null,
    ter_category: detail?.terCategory ?? linked?.terCategory ?? null,
  };
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  workerFn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const idx = cursor;
      cursor += 1;
      results[idx] = await workerFn(items[idx], idx);
    }
  }

  const count = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: count }, () => worker()));
  return results;
}

/**
 * Retrieves available buyer reviews for a Thailand TikTok Shop product during Myanmar Review Discovery.
 * - Reuses server cache first (0 credits).
 * - Fetches Kalodata comment/insight (1.0 cr) when not cached.
 * - Supports multi-page review pagination when `hasMore` / `nextCursor` is returned by the review source
 *   up to `maxReviewPages` (defaults to 1 for Kalodata's single-snapshot endpoint).
 */
async function retrieveProductReviewsForDiscovery(
  productId: string,
  getCommentInsight: (
    params: Parameters<typeof fetchKalodataProductCommentInsight>[0]
  ) => Promise<{ ok: boolean; data: Record<string, unknown> | null }>,
  researchedAt: string,
  maxReviewPages: number
): Promise<{
  parsed: ParsedCommentInsight | null;
  reviews: ReviewTextItem[];
  apiCallsMade: number;
  fromCache: boolean;
}> {
  const cached = getServerCachedReviewInsight(productId);
  if (cached) {
    const cachedRaw = Array.isArray(cached.rawComments) ? cached.rawComments : [];
    const reviews: ReviewTextItem[] = cachedRaw
      .filter((t) => typeof t === 'string' && t.trim().length > 0)
      .map((text) => ({ text: text.trim(), rating: null, pageNumber: 1 }));
    const parsedFromCache: ParsedCommentInsight = {
      productId: cached.productId,
      summary: cached.summary,
      positivePoints: cached.positivePoints,
      painPoints: cached.painPoints,
      usageScenarios: cached.usageScenarios,
      commentsAnalyzed: cached.commentsAnalyzed,
      averageRating: cached.averageRating,
      ratedCommentCount: cached.ratedCommentCount,
      ...(cachedRaw.length > 0 ? { rawComments: cachedRaw } : {}),
      ...(reviews.length > 0 ? { allRawComments: reviews } : {}),
      pagesFetched: cached.pagesFetched ?? 1,
    };
    return { parsed: parsedFromCache, reviews, apiCallsMade: 0, fromCache: true };
  }

  let apiCallsMade = 0;
  let mergedParsed: ParsedCommentInsight | null = null;
  const mergedReviews: ReviewTextItem[] = [];
  const seenReviewKeys = new Set<string>();
  const safeMaxPages = Math.max(1, Math.min(5, Math.floor(maxReviewPages)));
  let cursor: string | undefined;

  for (let page = 1; page <= safeMaxPages; page += 1) {
    apiCallsMade += 1;
    const reqParams: Parameters<typeof fetchKalodataProductCommentInsight>[0] = {
      product_id: productId,
      country_code: 'th',
      ...(page > 1 ? { page_number: page } : {}),
      ...(cursor ? { cursor } : {}),
    };
    const res = await getCommentInsight(reqParams);
    if (!res.ok || !res.data) {
      break;
    }

    const pageParsed = parseKalodataCommentInsight(productId, res.data, page);
    if (!pageParsed) {
      break;
    }

    const pageReviews: ReviewTextItem[] =
      pageParsed.allRawComments ??
      (pageParsed.rawComments ?? []).map((text) => ({ text, rating: null, pageNumber: page }));

    for (const rv of pageReviews) {
      const key = rv.text.trim().toLowerCase();
      if (!key || seenReviewKeys.has(key)) continue;
      seenReviewKeys.add(key);
      mergedReviews.push({
        text: rv.text.trim(),
        rating: rv.rating ?? null,
        pageNumber: rv.pageNumber ?? page,
      });
    }

    if (mergedParsed === null) {
      mergedParsed = {
        ...pageParsed,
        allRawComments: mergedReviews,
        rawComments: mergedReviews.slice(0, 60).map((r) => r.text.slice(0, 300)),
        commentsAnalyzed: Math.max(pageParsed.commentsAnalyzed, mergedReviews.length),
        pagesFetched: page,
      };
    } else {
      const prev: ParsedCommentInsight = mergedParsed;
      mergedParsed = {
        ...prev,
        summary: prev.summary ?? pageParsed.summary,
        positivePoints:
          prev.positivePoints.length > 0 ? prev.positivePoints : pageParsed.positivePoints,
        painPoints: prev.painPoints.length > 0 ? prev.painPoints : pageParsed.painPoints,
        usageScenarios:
          prev.usageScenarios.length > 0 ? prev.usageScenarios : pageParsed.usageScenarios,
        commentsAnalyzed: Math.max(
          prev.commentsAnalyzed + pageParsed.commentsAnalyzed,
          mergedReviews.length
        ),
        allRawComments: mergedReviews,
        rawComments: mergedReviews.slice(0, 60).map((r) => r.text.slice(0, 300)),
        hasMore: pageParsed.hasMore,
        nextCursor: pageParsed.nextCursor,
        pagesFetched: page,
      };
    }

    if (!pageParsed.hasMore || page >= safeMaxPages) {
      break;
    }
    cursor = pageParsed.nextCursor ?? undefined;
  }

  if (mergedParsed) {
    setServerCachedReviewInsight(toReviewInsightRecord(mergedParsed, researchedAt));
  }

  return {
    parsed: mergedParsed,
    reviews: mergedReviews,
    apiCallsMade,
    fromCache: false,
  };
}

export async function runThailandProductResearch(
  config: ResearchConfig,
  options?: { forceResume?: boolean; testOverrides?: ResearchPipelineTestOverrides }
): Promise<ResearchSessionResponse> {
  const getCreditBalance = options?.testOverrides?.fetchCreditBalance ?? fetchKalodataCreditBalance;
  const getProductRank = options?.testOverrides?.fetchProductRank ?? fetchKalodataProductRank;
  const getVideoRank = options?.testOverrides?.fetchVideoRank ?? fetchKalodataVideoRank;
  const getProductDetail = options?.testOverrides?.fetchProductDetail ?? fetchKalodataProductDetail;
  const getShopDetail = options?.testOverrides?.fetchShopDetail ?? fetchKalodataShopDetail;
  const getCommentInsight =
    options?.testOverrides?.fetchCommentInsight ?? fetchKalodataProductCommentInsight;
  const checkImageUrl = options?.testOverrides?.verifyImageUrl ?? verifyKalodataImageUrl;

  if (options?.forceResume) {
    resumeResearch();
  }

  if (researchQuotaState.paused) {
    throw new ResearchApiError(
      429,
      'RESEARCH_PAUSED',
      'Product research is currently paused. Click Resume Research to continue.',
      {
        quotaPaused: true,
        errorMy:
          'Product Research ကို ခေတ္တရပ်ဆိုင်းထားပါသည်။ ဆက်လက်ရှာဖွေရန် Resume ကို နှိပ်ပါ။',
      }
    );
  }

  const selectedCategories: ProductCategory[] =
    Array.isArray(config.selectedCategories)
      ? config.selectedCategories
      : config.category === 'all'
        ? ['womens-fashion', 'cosmetics-beauty']
        : [config.category];

  if (selectedCategories.length === 0) {
    throw new ResearchApiError(
      400,
      'NO_CATEGORY_SELECTED',
      'Please select at least one Thailand TikTok Shop category before starting product hunting.',
      {
        errorMy: 'Product Hunting မစတင်မီ အနည်းဆုံး Category ၁ ခု ရွေးချယ်ပါ။',
      }
    );
  }

  const bothCategoryMode = config.bothCategoryMode === 'split' ? 'split' : 'combined';
  const researchMode: ResearchMode =
    config.researchMode === 'balanced' || config.researchMode === 'deep'
      ? config.researchMode
      : 'fast';
  const deepDiveCount = clampDeepDiveCount(config.deepDiveCount, config.quantity);
  const includeReviewInsights =
    researchMode === 'deep' && config.includeReviewInsights === true;
  const spendingLimitCredits =
    typeof config.spendingLimitCredits === 'number' && Number.isFinite(config.spendingLimitCredits)
      ? config.spendingLimitCredits
      : DEFAULT_SPENDING_LIMIT_CREDITS;

  const myanmarLanguageOnly = config.myanmarLanguageOnly === true;
  const myanmarDiscoveryMode: MyanmarDiscoveryMode | undefined = myanmarLanguageOnly
    ? config.myanmarDiscoveryMode === 'review-first'
      ? 'review-first'
      : 'video-first'
    : undefined;
  const isVideoFirstMyanmar = myanmarLanguageOnly && myanmarDiscoveryMode === 'video-first';
  const isReviewFirstMyanmar = myanmarLanguageOnly && myanmarDiscoveryMode === 'review-first';
  const myanmarVideoScanPages = isVideoFirstMyanmar
    ? clampMyanmarVideoScanPages(config.myanmarVideoScanPages)
    : undefined;
  const myanmarReviewScanLimit = isReviewFirstMyanmar
    ? clampMyanmarReviewScanLimit(config.myanmarReviewScanLimit)
    : undefined;

  const plan = buildKalodataExecutionPlan(selectedCategories, config.quantity, bothCategoryMode, {
    researchMode,
    deepDiveCount,
    includeReviewInsights,
    selectedSubcategoryIds: config.selectedSubcategoryIds,
    resolvedCategoryIdMap: config.resolvedCategoryIdMap,
    myanmarLanguageOnly,
    myanmarDiscoveryMode,
    myanmarVideoScanPages,
    myanmarReviewScanLimit,
  });

  if (plan.streams.length === 0 || plan.categoryIds.length === 0) {
    throw new ResearchApiError(
      400,
      'UNSUPPORTED_CATEGORY',
      'None of the selected categories have a verified or live-synced Kalodata Thailand Category ID yet. Please sync live Thailand categories (0.1 credits) or select a verified category.',
      {
        errorMy:
          'ရွေးချယ်ထားသော Category များအတွက် Kalodata Thailand Category ID မအတည်ပြုရသေးပါ။ Live TH Categories ကို Sync (0.1 cr) လုပ်ပါ သို့မဟုတ် အတည်ပြုပြီး Category ကို ရွေးချယ်ပါ။',
      }
    );
  }

  // Hard Server-Side Spending Protection Gate (applies to Fast, Balanced & Deep BEFORE any API call)
  if (plan.estimatedCredits > spendingLimitCredits + 1e-6) {
    throw new ResearchApiError(
      400,
      'SPENDING_LIMIT_EXCEEDED',
      `Estimated cost (${formatCredits(plan.estimatedCredits)} credits across ${plan.plannedApiCalls} call(s) in ${researchMode} mode) exceeds your spending limit (${formatCredits(spendingLimitCredits)} credits). No Kalodata API call was made.`,
      {
        errorMy: `${researchMode.toUpperCase()} Mode ၏ ခန့်မှန်းကုန်ကျစရိတ် (${formatCredits(plan.estimatedCredits)} Credits · API ${plan.plannedApiCalls} ကြိမ်) သည် သင်သတ်မှတ်ထားသော Spending Limit (${formatCredits(spendingLimitCredits)} Credits) ထက် ကျော်လွန်နေသဖြင့် Kalodata API မခေါ်ဆိုဘဲ ရပ်တန့်ထားပါသည်။`,
      }
    );
  }

  // Free Credit Balance check BEFORE calling any paid Kalodata endpoint (0 credits)
  const balanceBeforeRes = await getCreditBalance();
  const balanceBefore =
    balanceBeforeRes.ok && balanceBeforeRes.balance !== null ? balanceBeforeRes.balance : null;

  if (balanceBefore !== null && balanceBefore + 1e-6 < plan.estimatedCredits) {
    throw new ResearchApiError(
      402,
      'INSUFFICIENT_CREDITS',
      `Insufficient Kalodata credit balance (${formatCredits(balanceBefore)} credits remaining, ${formatCredits(plan.estimatedCredits)} credits estimated for ${researchMode} mode). No paid API call was made.`,
      {
        errorMy: `Kalodata လက်ကျန် Balance (${formatCredits(balanceBefore)} Credits) သည် ${researchMode.toUpperCase()} Mode ခန့်မှန်းကုန်ကျစရိတ် (${formatCredits(plan.estimatedCredits)} Credits) ထက် နည်းနေသဖြင့် API မခေါ်ဆိုပါ။`,
      }
    );
  }

  const researchedAt = new Date().toISOString();
  const dateRange = plan.dateRange;

  const sortField =
    config.strategyPreset === 'commission-first' || config.salesWeightPct <= 38
      ? 'commission_rate'
      : config.strategyPreset === 'sales-first' || config.salesWeightPct >= 62
        ? 'sales_volumn'
        : 'revenue';

  const executedQueries: string[] = [];
  let rankApiCalls = 0;
  let videoRankApiCalls = 0;
  let productDetailApiCalls = 0;
  let shopDetailApiCalls = 0;
  let commentInsightApiCalls = 0;
  let filteredOutCount = 0;
  let myanmarCandidatesScanned = 0;

  const productDetailMap = new Map<string, ParsedProductDetail>();
  const shopDetailMap = new Map<string, ParsedShopDetail>();
  const commentInsightMap = new Map<string, ParsedCommentInsight>();
  const matchedVideosByProductId = new Map<string, MyanmarVideoEvidenceItem[]>();
  let myanmarReviewDiscovery: MyanmarReviewDiscoveryStats | undefined;
  let myanmarVideoDiscovery: MyanmarVideoDiscoveryStats | undefined;

  let finalRows: RankCandidateRow[] = [];

  if (isVideoFirstMyanmar) {
    // Phase 9 Method 1: Video-First Myanmar Discovery (TH TikTok Shop)
    // Official Kalodata OpenAPI flow:
    // 1. POST /tiktok/video/rank (0.1 cr / 100-video page; valid sorts: 'revenue' | 'views')
    // 2. For every Myanmar-matched video, resolve linked affiliate products via:
    //    - Path A (Live Kalodata behavior): POST /tiktok/product/rank with video_id + is_affiliate=1 + need_image=1 (0.1 cr, 24h server-cached)
    //    - Path B (Embedded payload fallback): hydrate embedded linkedProducts via cache / product/detail (0.1 cr)
    // 3. Early-stops immediately when verifiedRows.length >= plan.quantity (e.g. 20), then re-ranks with SiamPick's untouched 7-Factor Scoring System.
    const maxPagesPerStream = clampMyanmarVideoScanPages(myanmarVideoScanPages);
    const primaryVideoSort: 'revenue' | 'views' =
      config.strategyPreset === 'sales-first' || config.salesWeightPct >= 62 ? 'views' : 'revenue';
    const secondaryVideoSort: 'revenue' | 'views' =
      primaryVideoSort === 'revenue' ? 'views' : 'revenue';

    const plannedCreditCeiling = Math.min(plan.estimatedCredits, spendingLimitCredits);
    const reservedPostDiscoveryCredits =
      (researchMode !== 'fast'
        ? plan.productDetailApiCalls * KALODATA_PRODUCT_DETAIL_CREDIT
        : 0) +
      (researchMode === 'deep'
        ? plan.shopDetailApiCalls * KALODATA_PRODUCT_DETAIL_CREDIT
        : 0) +
      (researchMode === 'deep' && plan.includeReviewInsights
        ? plan.commentInsightApiCalls * KALODATA_COMMENT_INSIGHT_CREDIT
        : 0);

    const canSpendDiscoveryCredits = (deltaCredits: number): boolean => {
      const usedCredits =
        videoRankApiCalls * KALODATA_VIDEO_RANK_CREDIT_PER_100 +
        rankApiCalls * KALODATA_CREDITS_PER_100_ROWS +
        productDetailApiCalls * KALODATA_PRODUCT_DETAIL_CREDIT +
        reservedPostDiscoveryCredits;
      return usedCredits + deltaCredits <= plannedCreditCeiling + 1e-6;
    };

    const streamStates = plan.streams.map((stream) => ({
      stream,
      nextPage: 1,
      pagesUsed: 0,
      sortField: primaryVideoSort as 'revenue' | 'views',
      pivotedSort: false,
      exhausted: false,
      verifiedCount: 0,
    }));

    const seenVideoIds = new Set<string>();
    const seenCandidateProductIds = new Set<string>();
    const verifiedProductIds = new Set<string>();
    const verifiedRows: RankCandidateRow[] = [];

    let videoPagesScanned = 0;
    let totalVideosScanned = 0;
    let matchedMyanmarVideos = 0;
    let productDetailCacheHits = 0;
    let nonAffiliateOrUnavailableSkipped = 0;
    let budgetCapped = false;

    const addVideoEvidenceForProduct = (
      productId: string,
      evidence: MyanmarVideoEvidenceItem
    ): void => {
      const existing = matchedVideosByProductId.get(productId);
      if (!existing) {
        matchedVideosByProductId.set(productId, [evidence]);
        return;
      }
      if (!existing.some((v) => v.videoId === evidence.videoId)) {
        existing.push(evidence);
      }
    };

    while (verifiedRows.length < plan.quantity && !budgetCapped) {
      const activeStreams = streamStates.filter(
        (st) => !st.exhausted && st.pagesUsed < maxPagesPerStream
      );
      if (activeStreams.length === 0) {
        break;
      }

      // In split mode, prioritize streams that haven't hit their targetCount yet.
      // Only let other active streams fill remaining slots if all under-target streams are exhausted.
      const underTargetStreams =
        streamStates.length > 1
          ? activeStreams.filter((st) => st.verifiedCount < st.stream.targetCount)
          : activeStreams;
      const roundStreams = underTargetStreams.length > 0 ? underTargetStreams : activeStreams;

      let madeProgressInRound = false;

      for (const st of roundStreams) {
        if (verifiedRows.length >= plan.quantity || budgetCapped) {
          break;
        }
        if (!canSpendDiscoveryCredits(KALODATA_VIDEO_RANK_CREDIT_PER_100)) {
          budgetCapped = true;
          break;
        }

        const pageNumber = st.nextPage;
        st.nextPage += 1;
        st.pagesUsed += 1;
        videoRankApiCalls += 1;
        videoPagesScanned += 1;
        madeProgressInRound = true;

        const kalodataRes = await getVideoRank({
          region: 'TH',
          language: 'en-US',
          currency: 'THB',
          date_range: dateRange,
          page_number: pageNumber,
          page_size: KALODATA_MAX_PAGE_SIZE,
          category_ids: st.stream.categoryIds,
          sort_field: {
            field: st.sortField,
            type: 'DESC',
          },
          need_extra: true,
        });

        executedQueries.push(
          `[MYANMAR VIDEO-FIRST · ${researchMode.toUpperCase()}] Kalodata TH Video Rank · category_ids=[${st.stream.categoryIds.join(',')}] · page=${pageNumber} (${st.pagesUsed}/${maxPagesPerStream}) · page_size=${KALODATA_MAX_PAGE_SIZE} · sort=${st.sortField} DESC · ${dateRange}`
        );

        if (!kalodataRes.ok) {
          if (verifiedRows.length > 0 || videoPagesScanned > 1) {
            st.exhausted = true;
            continue;
          }
          const status = kalodataRes.upstreamCode === 'MISSING_API_KEY' ? 500 : 502;
          throw new ResearchApiError(
            status,
            kalodataRes.upstreamCode ?? 'KALODATA_API_ERROR',
            kalodataRes.error ?? 'Failed to fetch Thailand TikTok Shop videos from Kalodata Video Rank API.',
            {
              errorMy:
                kalodataRes.errorMy ??
                'Kalodata Video Rank API မှ ထိုင်း TikTok Shop Video များ ရယူ၍ မရပါ။',
            }
          );
        }

        interface PageVideoLookupCandidate {
          videoId: string;
          videoEvidence: MyanmarVideoEvidenceItem;
        }
        interface PageProductCandidate {
          productId: string;
          linked: ParsedVideoLinkedProduct;
        }
        const pageVideosForProductRank: PageVideoLookupCandidate[] = [];
        const pageEmbeddedCandidates: PageProductCandidate[] = [];
        let newUnseenVideosInPage = 0;

        for (const rawVideo of kalodataRes.items) {
          const parsedVideo = parseKalodataVideoRankItem(rawVideo, pageNumber);
          if (!parsedVideo) continue;
          if (seenVideoIds.has(parsedVideo.videoId)) {
            continue;
          }
          seenVideoIds.add(parsedVideo.videoId);
          newUnseenVideosInPage += 1;
          totalVideosScanned += 1;
          myanmarCandidatesScanned += 1;

          const detection = detectMyanmarInVideoCandidate({
            caption: parsedVideo.caption,
            title: parsedVideo.title,
            hashtags: parsedVideo.hashtags,
            creatorName: parsedVideo.creatorName,
            creatorHandle: parsedVideo.creatorHandle,
          });
          if (!detection.matched || !detection.matchType) {
            continue;
          }

          matchedMyanmarVideos += 1;
          const videoEvidence: MyanmarVideoEvidenceItem = {
            videoId: parsedVideo.videoId,
            captionSnippet: detection.captionSnippet,
            creatorName: parsedVideo.creatorName,
            creatorHandle: parsedVideo.creatorHandle,
            videoUrl: parsedVideo.videoUrl,
            videoRevenueThb: parsedVideo.revenueThb,
            videoSalesVolume: parsedVideo.salesVolume,
            videoViews: parsedVideo.views,
            publishDate: parsedVideo.publishDate,
            matchType: detection.matchType,
            matchedTerms: detection.matchedTerms,
            myanmarLetterCount: detection.myanmarLetterCount,
            isMixedThaiBurmese: detection.isMixedThaiBurmese,
            pageNumber,
          };

          if (parsedVideo.linkedProducts.length === 0) {
            // Live Kalodata /tiktok/video/rank does not embed product_id; resolve via /tiktok/product/rank?video_id=...
            pageVideosForProductRank.push({
              videoId: parsedVideo.videoId,
              videoEvidence,
            });
          } else {
            for (const linked of parsedVideo.linkedProducts) {
              const pid = linked.productId.trim();
              if (!pid) continue;
              addVideoEvidenceForProduct(pid, videoEvidence);

              if (seenCandidateProductIds.has(pid)) {
                continue;
              }
              seenCandidateProductIds.add(pid);

              // Fast pre-filter: if the video payload explicitly reports commission_rate <= 0, skip at 0 credits!
              if (linked.rawCommissionRate !== null && linked.rawCommissionRate <= 0) {
                nonAffiliateOrUnavailableSkipped += 1;
                filteredOutCount += 1;
                continue;
              }

              pageEmbeddedCandidates.push({ productId: pid, linked });
            }
          }
        }

        // Path A (Primary Live Kalodata Flow): Resolve linked TH affiliate products via POST /tiktok/product/rank with video_id + is_affiliate=1
        let vidIdx = 0;
        while (vidIdx < pageVideosForProductRank.length && verifiedRows.length < plan.quantity && !budgetCapped) {
          const remainingSlots = plan.quantity - verifiedRows.length;
          const chunkSize = Math.min(4, remainingSlots, pageVideosForProductRank.length - vidIdx);
          const chunk = pageVideosForProductRank.slice(vidIdx, vidIdx + chunkSize);
          vidIdx += chunkSize;

          const runnableVideos: Array<{
            candidate: PageVideoLookupCandidate;
            cacheKey: string;
            cachedItems: Record<string, unknown>[] | null;
          }> = [];

          for (const candidate of chunk) {
            const cacheKey = `${candidate.videoId}|${dateRange}`;
            const cachedItems = getServerCachedVideoProducts(cacheKey);
            if (cachedItems) {
              runnableVideos.push({ candidate, cacheKey, cachedItems });
              continue;
            }
            const pendingUncached = runnableVideos.filter((r) => !r.cachedItems).length;
            if (!canSpendDiscoveryCredits((pendingUncached + 1) * KALODATA_CREDITS_PER_100_ROWS)) {
              budgetCapped = true;
              continue;
            }
            runnableVideos.push({ candidate, cacheKey, cachedItems: null });
          }

          if (runnableVideos.length === 0) {
            if (budgetCapped) break;
            continue;
          }

          const resolvedBatches = await runWithConcurrency(
            runnableVideos,
            3,
            async ({ candidate, cacheKey, cachedItems }) => {
              if (cachedItems) {
                productDetailCacheHits += 1;
                return { candidate, items: cachedItems, ok: true };
              }
              rankApiCalls += 1;
              const prodRes = await getProductRank({
                region: 'TH',
                language: 'en-US',
                currency: 'THB',
                date_range: dateRange,
                page_number: 1,
                page_size: 20,
                video_id: candidate.videoId,
                is_affiliate: 1,
                need_image: 1,
                need_extra: true,
                sort_field: {
                  field: 'revenue',
                  type: 'DESC',
                },
              });
              if (!prodRes.ok) {
                return { candidate, items: [] as Record<string, unknown>[], ok: false };
              }
              setServerCachedVideoProducts(cacheKey, prodRes.items);
              return { candidate, items: prodRes.items, ok: true };
            }
          );

          for (const { candidate, items } of resolvedBatches) {
            let validAffiliateCountForVideo = 0;

            for (const prodItem of items) {
              const pid = String(prodItem.product_id ?? '').trim();
              if (!pid) continue;

              const rawComm = toNullableFiniteNumber(prodItem.commission_rate);
              const commPct = rawComm !== null ? normalizeKalodataCommissionPct(rawComm) : null;
              if (commPct === null || commPct <= 0) {
                filteredOutCount += 1;
                continue;
              }

              validAffiliateCountForVideo += 1;
              addVideoEvidenceForProduct(pid, candidate.videoEvidence);
              seenCandidateProductIds.add(pid);

              if (verifiedProductIds.has(pid) || verifiedRows.length >= plan.quantity) {
                continue;
              }

              const priCat = parseKalodataCategoryRef(prodItem.pri_category);
              const secCat = parseKalodataCategoryRef(prodItem.sec_category);
              const mappedCategory =
                resolveProductCategoryFromKalodataId(
                  priCat?.category_id ?? '',
                  priCat?.category_name ?? null,
                  config.resolvedCategoryIdMap
                ) ??
                resolveProductCategoryFromKalodataId(
                  secCat?.category_id ?? '',
                  secCat?.category_name ?? null,
                  config.resolvedCategoryIdMap
                ) ??
                st.stream.categories[0];

              verifiedProductIds.add(pid);
              verifiedRows.push({
                item: prodItem,
                category: mappedCategory,
                categoryIds: st.stream.categoryIds,
              });
              st.verifiedCount += 1;
            }

            if (validAffiliateCountForVideo === 0) {
              nonAffiliateOrUnavailableSkipped += 1;
            }
          }
        }

        // Path B (Embedded Linked Products Fallback): Hydrate unique products when video/rank payload already includes product_ids
        let candIdx = 0;
        while (candIdx < pageEmbeddedCandidates.length && verifiedRows.length < plan.quantity && !budgetCapped) {
          const remainingSlots = plan.quantity - verifiedRows.length;
          const chunkSize = Math.min(4, remainingSlots, pageEmbeddedCandidates.length - candIdx);
          const chunk = pageEmbeddedCandidates.slice(candIdx, candIdx + chunkSize);
          candIdx += chunkSize;

          const runnable: Array<{
            candidate: PageProductCandidate;
            cached: KalodataProductDetailEnrichmentRecord | null;
          }> = [];

          for (const candidate of chunk) {
            const cachedPd = getServerCachedProductDetail(candidate.productId);
            if (cachedPd) {
              runnable.push({ candidate, cached: cachedPd });
              continue;
            }
            if (
              !canSpendDiscoveryCredits(
                (runnable.filter((r) => !r.cached).length + 1) * KALODATA_PRODUCT_DETAIL_CREDIT
              )
            ) {
              budgetCapped = true;
              continue;
            }
            runnable.push({ candidate, cached: null });
          }

          if (runnable.length === 0) {
            if (budgetCapped) break;
            continue;
          }

          const hydratedResults = await runWithConcurrency(runnable, 4, async ({ candidate, cached }) => {
            const pid = candidate.productId;
            if (cached) {
              productDetailCacheHits += 1;
              return { candidate, detail: cachedProductDetailToParsed(cached) };
            }
            productDetailApiCalls += 1;
            const res = await getProductDetail({
              region: 'TH',
              language: 'en-US',
              currency: 'THB',
              date_range: 'last30Day',
              product_id: pid,
              need_extra: true,
              need_image: 1,
            });
            if (!res.ok || !res.data) {
              return { candidate, detail: null as ParsedProductDetail | null };
            }
            const parsed = parseKalodataProductDetail(pid, res.data);
            if (parsed) {
              setServerCachedProductDetail(toProductDetailRecord(parsed, 'last30Day', researchedAt));
            }
            return { candidate, detail: parsed };
          });

          for (const { candidate, detail } of hydratedResults) {
            if (verifiedRows.length >= plan.quantity) {
              break;
            }
            const pid = candidate.productId;
            if (verifiedProductIds.has(pid)) {
              continue;
            }

            // Strict Affiliate Gate: ONLY commission_rate > 0
            const effectiveCommission =
              detail?.commissionRatePct ?? candidate.linked.commissionRatePct ?? null;
            if (effectiveCommission === null || effectiveCommission <= 0) {
              nonAffiliateOrUnavailableSkipped += 1;
              filteredOutCount += 1;
              continue;
            }

            if (detail) {
              productDetailMap.set(pid, detail);
            }

            const synthesizedItem = synthesizeItemFromVideoAndDetail(pid, candidate.linked, detail);
            const priCat = parseKalodataCategoryRef(synthesizedItem.pri_category);
            const secCat = parseKalodataCategoryRef(synthesizedItem.sec_category);
            const mappedCategory =
              resolveProductCategoryFromKalodataId(
                priCat?.category_id ?? '',
                priCat?.category_name ?? null,
                config.resolvedCategoryIdMap
              ) ??
              resolveProductCategoryFromKalodataId(
                secCat?.category_id ?? '',
                secCat?.category_name ?? null,
                config.resolvedCategoryIdMap
              ) ??
              st.stream.categories[0];

            verifiedProductIds.add(pid);
            verifiedRows.push({
              item: synthesizedItem,
              category: mappedCategory,
              categoryIds: st.stream.categoryIds,
            });
            st.verifiedCount += 1;
          }
        }

        const pageExhausted =
          kalodataRes.items.length < KALODATA_MAX_PAGE_SIZE || newUnseenVideosInPage === 0;
        if (pageExhausted) {
          if (
            !st.pivotedSort &&
            st.pagesUsed < maxPagesPerStream &&
            verifiedRows.length < plan.quantity &&
            newUnseenVideosInPage === 0
          ) {
            // Kalodata pagination capped/repeated on primary sort — pivot once to secondary official sort ('views' <-> 'revenue')!
            st.sortField = secondaryVideoSort;
            st.nextPage = 1;
            st.pivotedSort = true;
          } else {
            st.exhausted = true;
          }
        }
      }

      if (!madeProgressInRound) {
        break;
      }
    }

    // Sort each product's matched video evidence by revenue desc, then pageNumber asc
    for (const [, list] of matchedVideosByProductId) {
      list.sort((a, b) => {
        const revDiff = (b.videoRevenueThb ?? -1) - (a.videoRevenueThb ?? -1);
        if (revDiff !== 0) return revDiff;
        return a.pageNumber - b.pageNumber;
      });
    }

    const stopReason: MyanmarVideoDiscoveryStopReason =
      verifiedRows.length >= plan.quantity
        ? 'target-reached'
        : budgetCapped
          ? 'budget-capped'
          : streamStates.every((s) => s.exhausted)
            ? 'source-exhausted'
            : 'max-pages-reached';

    myanmarVideoDiscovery = {
      requestedQuantity: plan.quantity,
      videoPagesScanned,
      maxVideoScanPages: maxPagesPerStream * plan.streams.length,
      totalVideosScanned,
      matchedMyanmarVideos,
      uniqueCandidateProductsFound: seenCandidateProductIds.size,
      affiliateProductsVerified: verifiedRows.length,
      nonAffiliateOrUnavailableSkipped,
      videoRankApiCalls,
      productDetailApiCalls: rankApiCalls + productDetailApiCalls,
      productDetailCacheHits,
      stopReason,
    };

    executedQueries.push(
      `[MYANMAR VIDEO-FIRST SUMMARY] Scanned ${videoPagesScanned} page(s) (${totalVideosScanned} TH videos) · ${matchedMyanmarVideos} Myanmar video(s) matched · ${seenCandidateProductIds.size} unique product(s) · ${verifiedRows.length}/${plan.quantity} affiliate product(s) verified · ${nonAffiliateOrUnavailableSkipped} skipped · ${rankApiCalls} video->product lookup(s) + ${productDetailApiCalls} detail call(s) (${productDetailCacheHits} cached) · stop=${stopReason}`
    );

    finalRows = verifiedRows.slice(0, plan.quantity);
  } else {
    // Standard Thailand Product Hunting (Filter OFF) OR Legacy Review-First Myanmar Discovery
    const seenProductIds = new Set<string>();
    const streamBuckets: RankCandidateRow[][] = [];

    // Step 1: Kalodata Product Rank (Fast = last7Day tight; Balanced & Deep = last30Day wider candidate pool)
    for (const stream of plan.streams) {
      const streamIdSet = new Set(stream.categoryIds);
      const streamPool: RankCandidateRow[] = [];
      const poolTarget =
        researchMode === 'fast' && !isReviewFirstMyanmar
          ? stream.targetCount
          : Math.max(stream.targetCount, stream.pageSizes.reduce((acc, s) => acc + s, 0));

      for (let pageIdx = 0; pageIdx < stream.pageSizes.length; pageIdx += 1) {
        if (researchMode === 'fast' && !isReviewFirstMyanmar && streamPool.length >= stream.targetCount) {
          break;
        }

        const pageNumber = pageIdx + 1;
        const pageSize = stream.pageSizes[pageIdx];
        rankApiCalls += 1;

        const kalodataRes = await getProductRank({
          region: 'TH',
          language: 'en-US',
          currency: 'THB',
          date_range: dateRange,
          page_number: pageNumber,
          page_size: pageSize,
          is_affiliate: 1,
          category_ids: stream.categoryIds,
          sort_field: {
            field: sortField,
            type: 'DESC',
          },
          need_image: 1,
          need_extra: true,
        });

        executedQueries.push(
          `[${researchMode.toUpperCase()}] Kalodata TH Product Rank · category_ids=[${stream.categoryIds.join(',')}] · page=${pageNumber} · page_size=${pageSize} · sort=${sortField} DESC · ${dateRange}${isReviewFirstMyanmar ? ` · myanmarReviewDiscovery=ON (limit=${myanmarReviewScanLimit})` : ''}`
        );

        if (!kalodataRes.ok) {
          if (streamPool.length > 0 || streamBuckets.some((b) => b.length > 0)) {
            break;
          }
          const status = kalodataRes.upstreamCode === 'MISSING_API_KEY' ? 500 : 502;
          throw new ResearchApiError(
            status,
            kalodataRes.upstreamCode ?? 'KALODATA_API_ERROR',
            kalodataRes.error ?? 'Failed to fetch Thailand TikTok Shop products from Kalodata API.',
            {
              errorMy:
                kalodataRes.errorMy ??
                'Kalodata Product Rank API မှ ထိုင်း TikTok Shop Product များ ရယူ၍ မရပါ။',
            }
          );
        }

        for (const item of kalodataRes.items) {
          const productId =
            item.product_id !== undefined && item.product_id !== null
              ? String(item.product_id).trim()
              : '';
          if (!productId || seenProductIds.has(productId)) {
            filteredOutCount += 1;
            continue;
          }

          // Strict Affiliate Gate: ONLY commission_rate > 0
          const rawCommission = toNullableFiniteNumber(item.commission_rate);
          if (rawCommission === null || rawCommission <= 0) {
            filteredOutCount += 1;
            continue;
          }

          // Strict Category Gate: match returned pri/sec/ter category IDs against requested L1/L2 stream IDs
          const priCategory = parseKalodataCategoryRef(item.pri_category);
          const secCategory = parseKalodataCategoryRef(item.sec_category);
          const terCategory = parseKalodataCategoryRef(item.ter_category);
          const priId = priCategory?.category_id ?? '';
          const secId = secCategory?.category_id ?? '';
          const terId = terCategory?.category_id ?? '';

          const matchesRequestedId =
            (priId && streamIdSet.has(priId)) ||
            (secId && streamIdSet.has(secId)) ||
            (terId && streamIdSet.has(terId));

          const mappedCategory =
            resolveProductCategoryFromKalodataId(
              priId,
              priCategory?.category_name ?? null,
              config.resolvedCategoryIdMap
            ) ??
            resolveProductCategoryFromKalodataId(
              secId,
              secCategory?.category_name ?? null,
              config.resolvedCategoryIdMap
            ) ??
            (matchesRequestedId && stream.categories.length === 1 ? stream.categories[0] : null);

          if (!mappedCategory || !matchesRequestedId) {
            filteredOutCount += 1;
            continue;
          }

          seenProductIds.add(productId);
          streamPool.push({ item, category: mappedCategory, categoryIds: stream.categoryIds });
          if (streamPool.length >= poolTarget) {
            break;
          }
        }

        if (kalodataRes.items.length < pageSize) {
          break;
        }
      }

      if (isReviewFirstMyanmar) {
        streamBuckets.push(streamPool);
      } else {
        const chosenForStream =
          researchMode === 'fast'
            ? streamPool.slice(0, stream.targetCount)
            : selectBestCandidatesForMode(
                streamPool,
                stream.targetCount,
                config.salesWeightPct,
                config.strategyPreset
              );

        filteredOutCount += Math.max(0, streamPool.length - chosenForStream.length);
        streamBuckets.push(chosenForStream);
      }
    }

    // Combine streams cleanly (interleave evenly when split across multiple categories)
    const combinedCandidates: RankCandidateRow[] = [];
    const combineCap = isReviewFirstMyanmar ? Number.MAX_SAFE_INTEGER : plan.quantity;
    if (streamBuckets.length <= 1) {
      combinedCandidates.push(...(streamBuckets[0] ?? []).slice(0, combineCap));
    } else {
      const maxLen = Math.max(...streamBuckets.map((b) => b.length));
      for (let i = 0; i < maxLen && combinedCandidates.length < combineCap; i += 1) {
        for (const bucket of streamBuckets) {
          if (bucket[i] && combinedCandidates.length < combineCap) {
            combinedCandidates.push(bucket[i]);
          }
        }
      }
    }

    if (isReviewFirstMyanmar) {
      // Legacy Review-First Myanmar Discovery (preserved for explicit backward compatibility)
      const totalCandidatesFound = combinedCandidates.length;
      const effectiveScanLimit = clampMyanmarReviewScanLimit(myanmarReviewScanLimit);

      const candidatesToCheck: RankCandidateRow[] = [];
      let uncachedBudgetUsed = 0;
      for (const candidate of combinedCandidates) {
        const pid = String(candidate.item.product_id ?? '').trim();
        if (!pid) continue;
        const isCached = Boolean(getServerCachedReviewInsight(pid));
        if (isCached) {
          candidatesToCheck.push(candidate);
        } else if (uncachedBudgetUsed < effectiveScanLimit) {
          uncachedBudgetUsed += 1;
          candidatesToCheck.push(candidate);
        }
      }

      const maxReviewPages = options?.testOverrides?.maxReviewPages ?? 1;
      let candidatesCheckedForReviews = 0;
      let productsWithReviewsAvailable = 0;
      let productsReviewUnavailable = 0;
      let productsNoMyanmarReview = 0;
      let matchedMyanmarReviewProducts = 0;
      let totalReviewsInspected = 0;
      let reviewApiCallsMade = 0;
      let reviewCacheHits = 0;

      const inspectionResults = await runWithConcurrency(candidatesToCheck, 3, async (row) => {
        const pid = String(row.item.product_id ?? '').trim();
        const retrieved = await retrieveProductReviewsForDiscovery(
          pid,
          getCommentInsight,
          researchedAt,
          maxReviewPages
        );
        const analysis = analyzeProductReviewsForMyanmar(retrieved.reviews);
        return {
          row,
          pid,
          parsed: retrieved.parsed,
          apiCallsMade: retrieved.apiCallsMade,
          fromCache: retrieved.fromCache,
          analysis,
        };
      });

      const matchedRows: RankCandidateRow[] = [];
      for (const res of inspectionResults) {
        candidatesCheckedForReviews += 1;
        myanmarCandidatesScanned += 1;
        commentInsightApiCalls += res.apiCallsMade;
        reviewApiCallsMade += res.apiCallsMade;
        if (res.fromCache) {
          reviewCacheHits += 1;
        }
        totalReviewsInspected += res.analysis.totalReviewsChecked;

        if (res.parsed) {
          commentInsightMap.set(res.pid, res.parsed);
        }

        if (res.analysis.reviewStatus === 'review-unavailable') {
          productsReviewUnavailable += 1;
          filteredOutCount += 1;
        } else if (res.analysis.reviewStatus === 'checked-no-match') {
          productsWithReviewsAvailable += 1;
          productsNoMyanmarReview += 1;
          filteredOutCount += 1;
        } else {
          productsWithReviewsAvailable += 1;
          matchedMyanmarReviewProducts += 1;
          matchedRows.push(res.row);
        }
      }

      filteredOutCount += Math.max(0, totalCandidatesFound - candidatesCheckedForReviews);

      myanmarReviewDiscovery = {
        totalCandidatesFound,
        candidatesCheckedForReviews,
        productsWithReviewsAvailable,
        productsReviewUnavailable,
        productsNoMyanmarReview,
        matchedMyanmarReviewProducts,
        totalReviewsInspected,
        reviewScanLimit: effectiveScanLimit,
        reviewApiCallsMade,
        reviewCacheHits,
      };

      executedQueries.push(
        `[MYANMAR REVIEW DISCOVERY] Checked ${candidatesCheckedForReviews}/${totalCandidatesFound} TH candidate(s) · ${reviewApiCallsMade} Kalodata review call(s) · ${reviewCacheHits} cached · ${totalReviewsInspected} review(s) inspected · ${matchedMyanmarReviewProducts} matched · ${productsNoMyanmarReview} no-match · ${productsReviewUnavailable} review-unavailable`
      );

      finalRows = matchedRows.slice(0, plan.quantity);
    } else {
      finalRows = combinedCandidates.slice(0, plan.quantity);
    }
  }

  if (finalRows.length === 0) {
    if (myanmarLanguageOnly) {
      const balanceAfterRes = await getCreditBalance();
      const balanceAfter =
        balanceAfterRes.ok && balanceAfterRes.balance !== null ? balanceAfterRes.balance : null;
      const actualCredits =
        balanceBefore !== null && balanceAfter !== null
          ? Math.max(0, Math.round((balanceBefore - balanceAfter) * 10000) / 10000)
          : null;
      const actualUsd =
        actualCredits !== null
          ? Math.round(actualCredits * KALODATA_USD_PER_CREDIT * 10000) / 10000
          : null;
      return {
        products: [],
        requestedQuantity: plan.quantity,
        verifiedProductCount: 0,
        filteredOutCount,
        researchedAt,
        searchQueries: executedQueries,
        groundingSources: [],
        researchSourceMode: 'kalodata-openapi',
        myanmarFilterApplied: true,
        myanmarDiscoveryMode,
        myanmarCandidatesScanned,
        ...(myanmarReviewDiscovery ? { myanmarReviewDiscovery } : {}),
        ...(myanmarVideoDiscovery ? { myanmarVideoDiscovery } : {}),
        costSummary: {
          researchMode,
          estimatedCredits: plan.estimatedCredits,
          estimatedUsd: plan.estimatedUsd,
          plannedApiCalls: plan.plannedApiCalls,
          actualApiCalls:
            rankApiCalls + videoRankApiCalls + productDetailApiCalls + commentInsightApiCalls,
          rankApiCalls,
          ...(videoRankApiCalls > 0 ? { videoRankApiCalls } : {}),
          productDetailApiCalls,
          shopDetailApiCalls: 0,
          commentInsightApiCalls,
          deepDiveCount: plan.deepDiveCount,
          includeReviewInsights: plan.includeReviewInsights,
          geminiAnalysisApplied: false,
          actualCredits,
          actualUsd,
          balanceBefore,
          balanceAfter,
          spendingLimitCredits,
          bothCategoryMode: plan.bothCategoryMode,
          categoryIds: plan.categoryIds,
        },
        config: {
          ...config,
          selectedCategories: plan.selectedCategories,
          bothCategoryMode: plan.bothCategoryMode,
          researchMode,
          deepDiveCount: plan.deepDiveCount,
          includeReviewInsights: plan.includeReviewInsights,
          spendingLimitCredits,
          quantity: plan.quantity,
          myanmarLanguageOnly: true,
          myanmarDiscoveryMode,
          ...(myanmarVideoScanPages !== undefined ? { myanmarVideoScanPages } : {}),
          ...(myanmarReviewScanLimit !== undefined ? { myanmarReviewScanLimit } : {}),
        },
      };
    }

    throw new ResearchApiError(
      404,
      'NO_AFFILIATE_PRODUCTS',
      `No Thailand TikTok Shop affiliate products (commission_rate > 0) matched category_ids [${plan.categoryIds.join(', ')}] in Kalodata.`,
      {
        errorMy: `ရွေးချယ်ထားသော Category ID [${plan.categoryIds.join(', ')}] အတွက် commission_rate > 0 ဖြစ်သော Affiliate Product မတွေ့ရှိပါ။`,
      }
    );
  }

  // Step 2: Bounded Kalodata Detail API Enrichment (Balanced = Top <=3 Product Detail; Deep = Top N Product + deduplicated Shop Detail + optional <=2 Comment Insight)
  if (plan.productDetailApiCalls > 0) {
    const detailTargets = finalRows.slice(
      0,
      Math.min(finalRows.length, isVideoFirstMyanmar ? plan.deepDiveCount || finalRows.length : plan.productDetailApiCalls)
    );

    // In Video-First mode, productDetailMap is already populated during discovery — only fetch missing entries if any!
    const missingDetailTargets = detailTargets.filter((row) => {
      const pid = String(row.item.product_id ?? '').trim();
      return Boolean(pid) && !productDetailMap.has(pid);
    });

    if (missingDetailTargets.length > 0) {
      const detailResults = await runWithConcurrency(missingDetailTargets, 4, async (row) => {
        const pid = String(row.item.product_id ?? '').trim();
        if (!pid) return null;
        const cachedPd = getServerCachedProductDetail(pid);
        if (cachedPd) {
          return cachedProductDetailToParsed(cachedPd);
        }
        productDetailApiCalls += 1;
        const res = await getProductDetail({
          region: 'TH',
          language: 'en-US',
          currency: 'THB',
          date_range: 'last30Day',
          product_id: pid,
          need_extra: true,
        });
        if (!res.ok || !res.data) return null;
        const parsed = parseKalodataProductDetail(pid, res.data);
        if (parsed) {
          setServerCachedProductDetail(toProductDetailRecord(parsed, 'last30Day', researchedAt));
        }
        return parsed;
      });

      for (const parsed of detailResults) {
        if (parsed) productDetailMap.set(parsed.productId, parsed);
      }
      executedQueries.push(
        `[${researchMode.toUpperCase()}] Kalodata TH Product Detail · ${productDetailApiCalls} call(s) (last30Day, capped top ${detailTargets.length})`
      );
    }

    // Step 2b (Deep Research only): Deduplicated Shop Detail calls across unique shops of top finalists
    if (researchMode === 'deep' && plan.shopDetailApiCalls > 0) {
      const shopTargets = finalRows.slice(0, Math.min(finalRows.length, plan.deepDiveCount || finalRows.length));
      const uniqueShopIds = Array.from(
        new Set(
          shopTargets
            .map((row) => {
              const pid = String(row.item.product_id ?? '').trim();
              const detailShop = productDetailMap.get(pid)?.productShopId;
              const rankShop =
                row.item.seller_id !== undefined && row.item.seller_id !== null
                  ? String(row.item.seller_id).trim()
                  : '';
              return detailShop || rankShop || '';
            })
            .filter((id) => id.length > 0)
        )
      ).slice(0, plan.shopDetailApiCalls);

      const shopResults = await runWithConcurrency(uniqueShopIds, 4, async (shopId) => {
        const cachedShop = getServerCachedShopDetail(shopId);
        if (cachedShop) {
          return {
            shopId: cachedShop.shopId,
            shopName: cachedShop.shopName,
            sellerType: cachedShop.sellerType,
            revenueThb: cachedShop.revenueThb,
            affiliateRevenueThb: cachedShop.affiliateRevenueThb,
            selfAccountRevenueThb: cachedShop.selfAccountRevenueThb,
            shoppingMallRevenueThb: cachedShop.shoppingMallRevenueThb,
            salesVolume: cachedShop.salesVolume,
            unitPriceThb: cachedShop.unitPriceThb,
            creatorNumber: cachedShop.creatorNumber,
            productNumber: cachedShop.productNumber,
            videoNumber: cachedShop.videoNumber,
            liveNumber: cachedShop.liveNumber,
          } satisfies ParsedShopDetail;
        }
        shopDetailApiCalls += 1;
        const res = await getShopDetail({
          region: 'TH',
          language: 'en-US',
          currency: 'THB',
          date_range: 'last30Day',
          shop_id: shopId,
          need_extra: true,
        });
        if (!res.ok || !res.data) return null;
        const parsedShop = parseKalodataShopDetail(shopId, res.data);
        if (parsedShop) {
          setServerCachedShopDetail(toShopEnrichmentRecord(parsedShop, 'last30Day', researchedAt));
        }
        return parsedShop;
      });

      for (const parsedShop of shopResults) {
        if (parsedShop) shopDetailMap.set(parsedShop.shopId, parsedShop);
      }
      if (shopDetailApiCalls > 0) {
        executedQueries.push(
          `[DEEP] Kalodata TH Shop Detail · ${shopDetailApiCalls} deduplicated call(s) (last30Day)`
        );
      }
    }

    // Step 2c (Deep Research opt-in only): Buyer Review Insight (comment/insight, 1.0 cr/item, capped <=2)
    // Skips products whose review insights were already fetched during Review-First Myanmar Discovery!
    if (
      researchMode === 'deep' &&
      plan.includeReviewInsights &&
      !isReviewFirstMyanmar &&
      plan.commentInsightApiCalls > 0
    ) {
      const commentTargets = finalRows.slice(0, plan.commentInsightApiCalls);
      const commentResults = await runWithConcurrency(commentTargets, 2, async (row) => {
        const pid = String(row.item.product_id ?? '').trim();
        if (!pid) return null;
        if (commentInsightMap.has(pid)) {
          return commentInsightMap.get(pid) ?? null;
        }
        const cachedCmt = getServerCachedReviewInsight(pid);
        if (cachedCmt) {
          return {
            productId: cachedCmt.productId,
            summary: cachedCmt.summary,
            positivePoints: cachedCmt.positivePoints,
            painPoints: cachedCmt.painPoints,
            usageScenarios: cachedCmt.usageScenarios,
            commentsAnalyzed: cachedCmt.commentsAnalyzed,
            averageRating: cachedCmt.averageRating,
            ratedCommentCount: cachedCmt.ratedCommentCount,
            ...(cachedCmt.rawComments ? { rawComments: cachedCmt.rawComments } : {}),
            ...(cachedCmt.pagesFetched ? { pagesFetched: cachedCmt.pagesFetched } : {}),
          } satisfies ParsedCommentInsight;
        }
        commentInsightApiCalls += 1;
        const res = await getCommentInsight({
          product_id: pid,
          country_code: 'th',
        });
        if (!res.ok || !res.data) return null;
        const parsedCmt = parseKalodataCommentInsight(pid, res.data);
        if (parsedCmt) {
          setServerCachedReviewInsight(toReviewInsightRecord(parsedCmt, researchedAt));
        }
        return parsedCmt;
      });

      for (const parsedCmt of commentResults) {
        if (parsedCmt) commentInsightMap.set(parsedCmt.productId, parsedCmt);
      }
      if (commentInsightApiCalls > 0) {
        executedQueries.push(
          `[DEEP] Kalodata TH Product Comment Insight · ${commentInsightApiCalls} call(s)`
        );
      }
    }
  }

  // Step 3: Free Credit Balance check AFTER all paid Kalodata calls (0 credits) to measure true actual spend
  const balanceAfterRes = await getCreditBalance();
  const balanceAfter =
    balanceAfterRes.ok && balanceAfterRes.balance !== null ? balanceAfterRes.balance : null;
  const actualCredits =
    balanceBefore !== null && balanceAfter !== null
      ? Math.max(0, Math.round((balanceBefore - balanceAfter) * 10000) / 10000)
      : null;
  const actualUsd =
    actualCredits !== null
      ? Math.round(actualCredits * KALODATA_USD_PER_CREDIT * 10000) / 10000
      : null;
  const actualApiCalls =
    rankApiCalls +
    videoRankApiCalls +
    productDetailApiCalls +
    shopDetailApiCalls +
    commentInsightApiCalls;

  // Step 4: Verify product images concurrently and assemble honest 4-state ResearchProducts
  let builtProducts = await runWithConcurrency(finalRows, 15, async (entry) => {
    const pid = String(entry.item.product_id ?? '').trim();
    const productDetail = productDetailMap.get(pid) ?? null;
    const shopId =
      productDetail?.productShopId ??
      (entry.item.seller_id !== undefined && entry.item.seller_id !== null
        ? String(entry.item.seller_id).trim()
        : '');
    const shopDetail = shopId ? (shopDetailMap.get(shopId) ?? null) : null;
    const cachedCmtFallback =
      myanmarLanguageOnly && !commentInsightMap.has(pid)
        ? getServerCachedReviewInsight(pid)
        : null;
    const commentInsight: ParsedCommentInsight | null =
      commentInsightMap.get(pid) ??
      (cachedCmtFallback
        ? {
            productId: cachedCmtFallback.productId,
            summary: cachedCmtFallback.summary,
            positivePoints: cachedCmtFallback.positivePoints,
            painPoints: cachedCmtFallback.painPoints,
            usageScenarios: cachedCmtFallback.usageScenarios,
            commentsAnalyzed: cachedCmtFallback.commentsAnalyzed,
            averageRating: cachedCmtFallback.averageRating,
            ratedCommentCount: cachedCmtFallback.ratedCommentCount,
            ...(cachedCmtFallback.rawComments ? { rawComments: cachedCmtFallback.rawComments } : {}),
          }
        : null);

    const extractKalodataImageUrl = (item: Record<string, unknown>): string | null => {
      const candidateKeys = [
        'master_image_url',
        'image_url',
        'product_image',
        'product_image_url',
        'cover_url',
        'thumb_url',
      ];
      for (const key of candidateKeys) {
        const val = item[key];
        if (typeof val === 'string' && val.trim() !== '') {
          return val.trim();
        }
      }
      if (Array.isArray(item.images)) {
        const firstImg = item.images.find(
          (img): img is string => typeof img === 'string' && img.trim() !== ''
        );
        if (firstImg) return firstImg.trim();
      }
      return null;
    };

    const masterImageUrl =
      extractKalodataImageUrl(entry.item) ?? productDetail?.masterImageUrl ?? null;
    const imageCheck = await checkImageUrl(masterImageUrl);

    return buildKalodataProductSummary(
      entry.item,
      entry.category,
      entry.categoryIds,
      dateRange,
      researchedAt,
      imageCheck,
      {
        researchMode,
        productDetail,
        shopDetail,
        commentInsight,
        matchedVideos: isVideoFirstMyanmar ? matchedVideosByProductId.get(pid) : undefined,
        sourceMode: isVideoFirstMyanmar ? 'video-rank' : 'product-rank',
      }
    );
  });

  // Step 5: Gemini Structured Analysis (Balanced & Deep ONLY — strictly over Kalodata data, ZERO Google Search Grounding)
  let geminiAnalysisApplied = false;
  if (researchMode === 'balanced' || researchMode === 'deep') {
    const geminiResult = await analyzeKalodataProductsWithGemini(
      builtProducts,
      researchMode,
      config.strategyPreset,
      config.salesWeightPct
    );
    builtProducts = geminiResult.products;
    geminiAnalysisApplied = geminiResult.applied;
    if (geminiAnalysisApplied) {
      executedQueries.push(
        `[${researchMode.toUpperCase()}] Gemini Kalodata-Only Analysis (gemini-4-hydrogen · zero Google Search Grounding)`
      );
    }
  }

  // Step 6: Phase 2 7-Factor 100-Point Peer-Compared Product Scoring Engine (UNTOUCHED — 0 bonus points)
  const batchEvaluations = evaluateProductBatch(builtProducts, {
    salesWeightPct: config.salesWeightPct,
    strategyPreset: config.strategyPreset,
  });
  builtProducts = builtProducts
    .map((product) => {
      const ev = batchEvaluations.get(product.id);
      if (!ev) return product;
      return {
        ...product,
        opportunityScore: ev.totalScore,
        confidenceLevel: ev.confidenceLevel,
      };
    })
    .sort((a, b) => b.opportunityScore - a.opportunityScore);

  // Step 6.5: Resolve canonical slugged TikTok Shop Thailand PDP URLs (`https://shop.tiktok.com/th/pdp/{slug}/{id}`)
  // so Android App Links & desktop open the exact product detail page directly.
  const numericIdsToResolve = builtProducts
    .map((p) => extractNumericTikTokProductId(p.kalodataMetrics?.productId ?? p.id))
    .filter((id): id is string => Boolean(id));
  if (numericIdsToResolve.length > 0) {
    const resolvedUrlMap = await resolveCanonicalTikTokProductUrlsBatch(numericIdsToResolve, {
      concurrency: 6,
      perItemTimeoutMs: 1800,
      totalBudgetMs: 2400,
    });
    builtProducts = builtProducts.map((product) => {
      const pid = extractNumericTikTokProductId(product.kalodataMetrics?.productId ?? product.id);
      const canonicalUrl = pid ? resolvedUrlMap.get(pid) : undefined;
      if (!canonicalUrl) return product;
      return {
        ...product,
        sources: product.sources.map((src) =>
          src.sourceType === 'TikTok Shop TH' ||
          (typeof src.url === 'string' && src.url.includes('shop.tiktok.com/'))
            ? { ...src, url: canonicalUrl }
            : src
        ),
      };
    });
  }

  const groundingSources: GroundingSourceLink[] = builtProducts
    .map((product) => {
      const primarySource = product.sources[0];
      if (!primarySource?.url) return null;
      let domain = 'kalodata.com';
      try {
        domain = new URL(primarySource.url).hostname.replace(/^www\./, '');
      } catch {
        domain = 'kalodata.com';
      }
      return {
        title: `${product.name} (${product.shopName})`,
        url: primarySource.url,
        domain,
      };
    })
    .filter((entry): entry is GroundingSourceLink => entry !== null);

  if (researchQuotaState.paused) {
    resumeResearch();
  }

  return {
    products: builtProducts,
    requestedQuantity: plan.quantity,
    verifiedProductCount: builtProducts.length,
    filteredOutCount,
    researchedAt,
    searchQueries: executedQueries,
    groundingSources,
    researchSourceMode: 'kalodata-openapi',
    myanmarFilterApplied: myanmarLanguageOnly,
    ...(myanmarLanguageOnly
      ? {
          myanmarDiscoveryMode,
          myanmarCandidatesScanned,
          ...(myanmarReviewDiscovery ? { myanmarReviewDiscovery } : {}),
          ...(myanmarVideoDiscovery ? { myanmarVideoDiscovery } : {}),
        }
      : {}),
    costSummary: {
      researchMode,
      estimatedCredits: plan.estimatedCredits,
      estimatedUsd: plan.estimatedUsd,
      plannedApiCalls: plan.plannedApiCalls,
      actualApiCalls,
      rankApiCalls,
      ...(videoRankApiCalls > 0 ? { videoRankApiCalls } : {}),
      productDetailApiCalls,
      shopDetailApiCalls,
      commentInsightApiCalls,
      deepDiveCount: plan.deepDiveCount,
      includeReviewInsights: plan.includeReviewInsights,
      geminiAnalysisApplied,
      actualCredits,
      actualUsd,
      balanceBefore,
      balanceAfter,
      spendingLimitCredits,
      bothCategoryMode: plan.bothCategoryMode,
      categoryIds: plan.categoryIds,
    },
    config: {
      ...config,
      selectedCategories: plan.selectedCategories,
      bothCategoryMode: plan.bothCategoryMode,
      researchMode,
      deepDiveCount: plan.deepDiveCount,
      includeReviewInsights: plan.includeReviewInsights,
      spendingLimitCredits,
      quantity: plan.quantity,
      ...(myanmarLanguageOnly
        ? {
            myanmarLanguageOnly: true,
            myanmarDiscoveryMode,
            ...(myanmarVideoScanPages !== undefined ? { myanmarVideoScanPages } : {}),
            ...(myanmarReviewScanLimit !== undefined ? { myanmarReviewScanLimit } : {}),
          }
        : {}),
    },
  };
}



