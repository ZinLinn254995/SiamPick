import type {
  AiAdCreativeFormat,
  AiAnalysisDataFact,
  AiAnalysisErrorCode,
  AiProductAnalysis,
  AiRecommendationVerdict,
  AiVideoSuitability,
  DataStatus,
  OpportunityEvaluation,
  ResearchProduct,
} from '../types/product.ts';
import {
  evaluateProductOpportunity,
  getCanonicalProductId,
  normalizeDataStatus,
} from './scoring.ts';
import {
  getCategoryDefinition,
  verifyProductCategoryAlignment,
} from './categoryRegistry.ts';

export const AI_ANALYSIS_SCHEMA_VERSION = 1;

function formatThbAmount(value: number): string {
  return `฿${Math.round(value).toLocaleString('en-US')}`;
}

function formatNumber(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

function isFinitePositive(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val) && val > 0;
}

function isFiniteNumber(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val);
}

/**
 * Computes a deterministic fingerprint over the product's real Kalodata metrics.
 * Used to detect when newer Kalodata data has been fetched for an already-analyzed product
 * so the UI can ask the user for confirmation before re-running Gemini.
 */
export function computeProductDataFingerprint(product: ResearchProduct): string {
  const m = product.kalodataMetrics;
  const ri = m?.reviewInsight;
  const parts = [
    getCanonicalProductId(product),
    product.category,
    m?.dateRange ?? 'none',
    product.researchDepthTag ?? 'rank-only',
    m?.detailEnriched ? 'pd1' : 'pd0',
    m?.shopEnriched ? 'sd1' : 'sd0',
    m?.reviewInsightEnriched ? 'ri1' : 'ri0',
    isFiniteNumber(product.priceThb) ? String(Math.round(product.priceThb * 100)) : 'null',
    isFiniteNumber(m?.minPriceThb) ? String(Math.round(m.minPriceThb * 100)) : 'null',
    isFiniteNumber(m?.maxPriceThb) ? String(Math.round(m.maxPriceThb * 100)) : 'null',
    isFiniteNumber(product.commissionRate) ? String(Math.round(product.commissionRate * 100)) : 'null',
    product.commissionVerified ? '1' : '0',
    isFiniteNumber(m?.salesVolume) ? String(Math.round(m.salesVolume)) : 'null',
    isFiniteNumber(m?.revenueThb) ? String(Math.round(m.revenueThb)) : 'null',
    isFiniteNumber(m?.revenueGrowthRate) ? String(Math.round(m.revenueGrowthRate * 10)) : 'null',
    isFiniteNumber(m?.creatorNumber) ? String(Math.round(m.creatorNumber)) : 'null',
    isFiniteNumber(m?.videoNumber) ? String(Math.round(m.videoNumber)) : 'null',
    isFiniteNumber(m?.liveNumber) ? String(Math.round(m.liveNumber)) : 'null',
    isFiniteNumber(m?.videoRevenueThb) ? String(Math.round(m.videoRevenueThb)) : 'null',
    isFiniteNumber(m?.liveRevenueThb) ? String(Math.round(m.liveRevenueThb)) : 'null',
    isFiniteNumber(product.reviewCount) ? String(Math.round(product.reviewCount)) : 'null',
    isFiniteNumber(product.customerRating) ? String(Math.round(product.customerRating * 10)) : 'null',
    m?.shopSellerType ?? 'null',
    isFiniteNumber(m?.shopRevenueThb) ? String(Math.round(m.shopRevenueThb)) : 'null',
    isFiniteNumber(m?.shopAffiliateRevenueThb) ? String(Math.round(m.shopAffiliateRevenueThb)) : 'null',
    isFiniteNumber(m?.shopCreatorNumber) ? String(Math.round(m.shopCreatorNumber)) : 'null',
    m?.deliveryType ?? 'null',
    String(ri?.commentsAnalyzed ?? 0),
    String(ri?.positivePoints?.length ?? (Array.isArray(product.reviewStrengthsEn) ? product.reviewStrengthsEn.length : 0)),
    String(ri?.painPoints?.length ?? (Array.isArray(product.customerComplaintsEn) ? product.customerComplaintsEn.length : 0)),
    String(ri?.usageScenarios?.length ?? 0),
    product.imageVerified ? 'img1' : 'img0',
  ];

  // Lightweight deterministic FNV-1a 32-bit hash for compact storage & exact comparison
  const raw = parts.join('|');
  let hash = 0x811c9dc5;
  for (let i = 0; i < raw.length; i += 1) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fp_${(hash >>> 0).toString(36)}_${parts.length}`;
}

export interface AuthoritativeAnalysisStatuses {
  salesAndRevenueStatus: DataStatus;
  growthPotentialStatus: DataStatus;
  commissionPotentialStatus: DataStatus;
  competitionStatus: DataStatus;
  targetCustomerStatus: DataStatus;
  aiContentStatus: DataStatus;
}

/**
 * Derives authoritative 4-state provenance statuses directly from real Kalodata fields
 * and the Phase 2 scoring evaluation. Gemini output is NEVER allowed to upgrade an
 * Unavailable or Unverified metric to Verified.
 */
export function deriveAuthoritativeStatuses(
  product: ResearchProduct,
  evaluation: OpportunityEvaluation
): AuthoritativeAnalysisStatuses {
  const m = product.kalodataMetrics;
  const salesFactor = evaluation.criteria.find((c) => c.key === 'salesPerformance');
  const revFactor = evaluation.criteria.find((c) => c.key === 'revenuePerformance');
  const growthFactor = evaluation.criteria.find((c) => c.key === 'revenueGrowth');
  const commFactor = evaluation.criteria.find((c) => c.key === 'commissionPotential');
  const compFactor = evaluation.criteria.find((c) => c.key === 'competition');

  const hasSales = isFiniteNumber(m?.salesVolume);
  const hasRevenue = isFiniteNumber(m?.revenueThb);
  let salesAndRevenueStatus: DataStatus = 'unavailable';
  if (hasSales && hasRevenue) {
    salesAndRevenueStatus = 'verified';
  } else if (hasSales || hasRevenue) {
    salesAndRevenueStatus = 'estimated';
  } else {
    salesAndRevenueStatus = normalizeDataStatus(
      salesFactor?.verification ?? revFactor?.verification ?? product.salesEvidenceStatus ?? 'unavailable'
    );
  }

  const growthPotentialStatus: DataStatus = isFiniteNumber(m?.revenueGrowthRate)
    ? 'verified'
    : normalizeDataStatus(growthFactor?.verification ?? 'unavailable');

  const hasVerifiedCommission =
    (product.commissionVerified && isFinitePositive(product.commissionRate)) ||
    isFinitePositive(m?.commissionRatePct);
  const commissionPotentialStatus: DataStatus = hasVerifiedCommission
    ? 'verified'
    : normalizeDataStatus(commFactor?.verification ?? product.commissionStatus ?? 'unavailable');

  const hasCreatorCount = isFiniteNumber(m?.creatorNumber);
  const competitionStatus: DataStatus = hasCreatorCount
    ? 'verified'
    : m !== undefined
      ? 'unavailable'
      : normalizeDataStatus(compFactor?.verification ?? product.competitionStatus ?? 'unavailable');

  // Target customer profile is an AI market inference unless backed by Kalodata review insights
  const reviewStrengthsCount = Array.isArray(product.reviewStrengthsEn)
    ? product.reviewStrengthsEn.length
    : 0;
  const complaintsCount = Array.isArray(product.customerComplaintsEn)
    ? product.customerComplaintsEn.length
    : 0;
  const targetCustomerStatus: DataStatus =
    m?.reviewInsightEnriched === true && (reviewStrengthsCount > 0 || complaintsCount > 0)
      ? 'estimated'
      : 'estimated';

  // AI advertising suitability is always an AI/creative assessment (never raw verified market fact)
  const aiContentStatus: DataStatus = product.imageVerified ? 'estimated' : 'unverified';

  return {
    salesAndRevenueStatus,
    growthPotentialStatus,
    commissionPotentialStatus,
    competitionStatus,
    targetCustomerStatus,
    aiContentStatus,
  };
}

/**
 * Builds the strictly factual Kalodata Data Basis ledger shown separately from AI interpretation.
 */
export function buildAiAnalysisDataBasis(
  product: ResearchProduct,
  evaluation: OpportunityEvaluation
): AiAnalysisDataFact[] {
  const m = product.kalodataMetrics;
  const statuses = deriveAuthoritativeStatuses(product, evaluation);
  const windowEn = m?.dateRange === 'last7Day' ? '7d' : m?.dateRange === 'last30Day' ? '30d' : '';
  const windowMy = m?.dateRange === 'last7Day' ? '7 ရက်' : m?.dateRange === 'last30Day' ? '30 ရက်' : '';

  const priceStatus: DataStatus = isFinitePositive(product.priceThb)
    ? normalizeDataStatus(product.priceStatus ?? (m ? 'verified' : 'estimated'))
    : 'unavailable';

  const commRate =
    product.commissionVerified && isFinitePositive(product.commissionRate)
      ? product.commissionRate
      : isFinitePositive(m?.commissionRatePct)
        ? m.commissionRatePct
        : null;

  const commPerSale =
    isFinitePositive(product.estimatedCommissionPerSaleThb)
      ? product.estimatedCommissionPerSaleThb
      : commRate !== null && isFinitePositive(product.priceThb)
        ? Math.round((product.priceThb * commRate) / 100)
        : null;

  const reviewCount = isFinitePositive(product.reviewCount)
    ? product.reviewCount
    : isFinitePositive(m?.productReviewCount)
      ? m.productReviewCount
      : null;

  const reviewStatus: DataStatus =
    reviewCount !== null
      ? normalizeDataStatus(
          product.reviewCountStatus ?? (isFinitePositive(m?.productReviewCount) ? 'verified' : 'estimated')
        )
      : 'unavailable';

  const ratingStatus: DataStatus = isFinitePositive(product.customerRating)
    ? normalizeDataStatus(product.customerRatingStatus ?? 'estimated')
    : 'unavailable';

  const facts: AiAnalysisDataFact[] = [
    {
      key: 'price',
      labelEn: 'Unit Price',
      labelMy: 'ဈေးနှုန်း',
      valueEn: isFinitePositive(product.priceThb) ? formatThbAmount(product.priceThb) : 'Unavailable',
      valueMy: isFinitePositive(product.priceThb) ? formatThbAmount(product.priceThb) : 'မရရှိနိုင်ပါ',
      status: priceStatus,
    },
    {
      key: 'sales',
      labelEn: windowEn ? `Sales Volume (${windowEn})` : 'Sales Volume',
      labelMy: windowMy ? `ရောင်းအား (${windowMy})` : 'ရောင်းအား',
      valueEn: isFiniteNumber(m?.salesVolume) ? `${formatNumber(m.salesVolume)} units` : 'Unavailable',
      valueMy: isFiniteNumber(m?.salesVolume) ? `${formatNumber(m.salesVolume)} ခု` : 'မရရှိနိုင်ပါ',
      status: isFiniteNumber(m?.salesVolume) ? 'verified' : 'unavailable',
    },
    {
      key: 'revenue',
      labelEn: windowEn ? `Revenue (${windowEn})` : 'Revenue',
      labelMy: windowMy ? `ဝင်ငွေ (${windowMy})` : 'ဝင်ငွေ',
      valueEn: isFiniteNumber(m?.revenueThb) ? formatThbAmount(m.revenueThb) : 'Unavailable',
      valueMy: isFiniteNumber(m?.revenueThb) ? formatThbAmount(m.revenueThb) : 'မရရှိနိုင်ပါ',
      status: isFiniteNumber(m?.revenueThb) ? 'verified' : 'unavailable',
    },
    {
      key: 'growth',
      labelEn: 'Revenue Growth',
      labelMy: 'ဝင်ငွေတိုးနှုန်း',
      valueEn: isFiniteNumber(m?.revenueGrowthRate)
        ? `${m.revenueGrowthRate >= 0 ? '+' : ''}${m.revenueGrowthRate.toFixed(1)}%`
        : 'Unavailable',
      valueMy: isFiniteNumber(m?.revenueGrowthRate)
        ? `${m.revenueGrowthRate >= 0 ? '+' : ''}${m.revenueGrowthRate.toFixed(1)}%`
        : 'မရရှိနိုင်ပါ',
      status: statuses.growthPotentialStatus,
    },
    {
      key: 'commission',
      labelEn: 'Affiliate Commission',
      labelMy: 'Affiliate Commission',
      valueEn:
        commRate !== null
          ? `${commRate}%${commPerSale !== null ? ` (~${formatThbAmount(commPerSale)}/sale)` : ''}`
          : 'Unavailable',
      valueMy:
        commRate !== null
          ? `${commRate}%${commPerSale !== null ? ` (~${formatThbAmount(commPerSale)}/ခု)` : ''}`
          : 'မရရှိနိုင်ပါ',
      status: statuses.commissionPotentialStatus,
    },
    {
      key: 'creators',
      labelEn: 'Active Creators',
      labelMy: 'Creator အရေအတွက်',
      valueEn: isFiniteNumber(m?.creatorNumber)
        ? `${formatNumber(m.creatorNumber)} creators`
        : 'Unavailable',
      valueMy: isFiniteNumber(m?.creatorNumber)
        ? `${formatNumber(m.creatorNumber)} ဦး`
        : 'မရရှိနိုင်ပါ',
      status: statuses.competitionStatus,
    },
    {
      key: 'reviews',
      labelEn: 'Reviews & Rating',
      labelMy: 'Review နှင့် Rating',
      valueEn:
        reviewCount !== null || isFinitePositive(product.customerRating)
          ? [
              isFinitePositive(product.customerRating) ? `${product.customerRating.toFixed(1)}/5` : null,
              reviewCount !== null ? `${formatNumber(reviewCount)} reviews` : null,
            ]
              .filter(Boolean)
              .join(' · ')
          : 'Unavailable',
      valueMy:
        reviewCount !== null || isFinitePositive(product.customerRating)
          ? [
              isFinitePositive(product.customerRating) ? `${product.customerRating.toFixed(1)}/5` : null,
              reviewCount !== null ? `Review ${formatNumber(reviewCount)} ခု` : null,
            ]
              .filter(Boolean)
              .join(' · ')
          : 'မရရှိနိုင်ပါ',
      status:
        reviewStatus === 'verified' || ratingStatus === 'verified'
          ? 'verified'
          : reviewStatus === 'estimated' || ratingStatus === 'estimated'
            ? 'estimated'
            : 'unavailable',
    },
    {
      key: 'image',
      labelEn: 'Verified Product Image',
      labelMy: 'အတည်ပြုပြီး Product ပုံ',
      valueEn: product.imageVerified ? 'Verified' : 'Unavailable',
      valueMy: product.imageVerified ? 'အတည်ပြုပြီး' : 'မရရှိနိုင်ပါ',
      status: product.imageVerified ? 'verified' : 'unavailable',
    },
  ];

  if (m?.shopEnriched || m?.shopRevenueThb !== undefined || m?.shopSellerType) {
    const hasShopData = isFiniteNumber(m?.shopRevenueThb) || Boolean(m?.shopSellerType);
    facts.push({
      key: 'shopPerformance',
      labelEn: 'Shop Type & GMV',
      labelMy: 'ဆိုင်အမျိုးအစားနှင့် GMV',
      valueEn: hasShopData
        ? [
            m?.shopSellerType ?? null,
            isFiniteNumber(m?.shopRevenueThb) ? formatThbAmount(m.shopRevenueThb) : null,
          ]
            .filter(Boolean)
            .join(' · ')
        : 'Unavailable',
      valueMy: hasShopData
        ? [
            m?.shopSellerType ?? null,
            isFiniteNumber(m?.shopRevenueThb) ? formatThbAmount(m.shopRevenueThb) : null,
          ]
            .filter(Boolean)
            .join(' · ')
        : 'မရရှိနိုင်ပါ',
      status: hasShopData ? 'verified' : 'unavailable',
    });
  }

  if (m?.reviewInsightEnriched && m.reviewInsight) {
    const ri = m.reviewInsight;
    const hasThemes = ri.positivePoints.length > 0 || ri.painPoints.length > 0 || ri.commentsAnalyzed > 0;
    facts.push({
      key: 'reviewInsights',
      labelEn: 'Buyer Review Insights',
      labelMy: 'ဝယ်သူ Review သုံးသပ်ချက်',
      valueEn: hasThemes
        ? `${ri.commentsAnalyzed} comments · ${ri.positivePoints.length} likes / ${ri.painPoints.length} issues`
        : 'Unavailable',
      valueMy: hasThemes
        ? `မှတ်ချက် ${ri.commentsAnalyzed} ခု · နှစ်သက် ${ri.positivePoints.length} / စောဒက ${ri.painPoints.length}`
        : 'မရရှိနိုင်ပါ',
      status: hasThemes ? 'verified' : 'unavailable',
    });
  }

  return facts;
}

export function buildFallbackNotice(
  code: AiAnalysisErrorCode,
  detail?: string
): { en: string; my: string } {
  switch (code) {
    case 'MISSING_API_KEY':
      return {
        en: 'Gemini AI analysis is unavailable because GEMINI_API_KEY is not configured on the server (check Settings > Secrets). Showing Kalodata-based Fallback Analysis below.',
        my: 'Server တွင် GEMINI_API_KEY မသတ်မှတ်ရသေးသဖြင့် Gemini AI ခွဲခြမ်းစိတ်ဖြာမှု မအောင်မြင်ပါ (Settings > Secrets တွင် စစ်ဆေးပါ)။ Kalodata ဒေတာအခြေခံ Fallback Analysis ကို အောက်တွင် ဖော်ပြထားပါသည်။',
      };
    case 'TIMEOUT':
      return {
        en: 'Gemini AI analysis timed out before returning a complete response. Showing Kalodata-based Fallback Analysis below so your research continues uninterrupted.',
        my: 'Gemini AI ခွဲခြမ်းစိတ်ဖြာမှု အချိန်ကျော်လွန် (Timeout) ဖြစ်သွားပါသည်။ ရှာဖွေမှုမရပ်တန့်စေရန် Kalodata ဒေတာအခြေခံ Fallback Analysis ကို အောက်တွင် ဖော်ပြထားပါသည်။',
      };
    case 'RATE_LIMITED':
      return {
        en: 'Gemini AI request was rate-limited or quota-exhausted (HTTP 429). Showing Kalodata-based Fallback Analysis below — you can retry later or check your API key quota in Settings > Secrets.',
        my: 'Gemini AI Quota ပြည့်နေခြင်း သို့မဟုတ် Rate Limit (429) ကြောင့် AI ခွဲခြမ်းမှု မအောင်မြင်ပါ။ Kalodata ဒေတာအခြေခံ Fallback Analysis ကို ဖော်ပြထားပြီး နောက်မှ ပြန်စမ်းနိုင်ပါသည်။',
      };
    case 'AUTH_ERROR':
      return {
        en: 'Gemini AI rejected the server API key (401/403). Please verify GEMINI_API_KEY in Settings > Secrets. Showing Kalodata-based Fallback Analysis below.',
        my: 'Server ရှိ Gemini API Key အတည်ပြုမှု မအောင်မြင်ပါ (401/403)။ Settings > Secrets တွင် GEMINI_API_KEY ကို စစ်ဆေးပါ။ Kalodata ဒေတာအခြေခံ Fallback Analysis ကို ဖော်ပြထားပါသည်။',
      };
    case 'INVALID_RESPONSE':
      return {
        en: 'Gemini AI returned an incomplete or invalid structured response. Showing verified Kalodata-based Fallback Analysis below instead of guessing.',
        my: 'Gemini AI မှ ပြန်ပို့သော ရလဒ်ဖွဲ့စည်းပုံ မပြည့်စုံ/မမှန်ကန်သဖြင့် မခန့်မှန်းဘဲ Kalodata ဒေတာအခြေခံ Fallback Analysis ကို ဖော်ပြထားပါသည်။',
      };
    case 'NETWORK_ERROR':
      return {
        en: 'Could not reach the analysis server due to a network error. Showing local Kalodata-based Fallback Analysis below.',
        my: 'Network ချိတ်ဆက်မှုအခက်အခဲကြောင့် Gemini AI Server သို့ မဆက်သွယ်နိုင်ပါ။ Kalodata ဒေတာအခြေခံ Fallback Analysis ကို အောက်တွင် ဖော်ပြထားပါသည်။',
      };
    default:
      return {
        en: `Gemini AI analysis failed${detail ? ` (${detail.slice(0, 120)})` : ''}. Showing Kalodata-based Fallback Analysis below so your workflow continues cleanly.`,
        my: `Gemini AI ခွဲခြမ်းစိတ်ဖြာမှု မအောင်မြင်ပါ${detail ? ` (${detail.slice(0, 120)})` : ''}။ လုပ်ငန်းမရပ်တန့်စေရန် Kalodata ဒေတာအခြေခံ Fallback Analysis ကို ဖော်ပြထားပါသည်။`,
      };
  }
}

function deriveFallbackVerdict(evaluation: OpportunityEvaluation): AiRecommendationVerdict {
  if (evaluation.confidenceLevel === 'Low' && evaluation.totalScore < 65) return 'skip';
  if (evaluation.totalScore >= 80 && evaluation.confidenceLevel === 'High') return 'priority-test';
  if (evaluation.totalScore >= 65) return 'test-with-caution';
  if (evaluation.totalScore >= 50) return 'monitor';
  return 'skip';
}

/**
 * Builds a complete, honest 10-point Kalodata-only Fallback Analysis whenever Gemini is
 * unavailable, times out, errors, or returns an invalid payload.
 * STRICTLY uses only real Kalodata metrics & Phase 2 evaluation — ZERO fabricated numbers.
 */
export function buildKalodataFallbackAnalysis(
  product: ResearchProduct,
  evaluationInput?: OpportunityEvaluation | null,
  failure?: { code?: AiAnalysisErrorCode; detail?: string; isManualPreview?: boolean }
): AiProductAnalysis {
  const evaluation =
    evaluationInput ?? evaluateProductOpportunity(product, { salesWeightPct: 50 });
  const m = product.kalodataMetrics;
  const statuses = deriveAuthoritativeStatuses(product, evaluation);
  const dataBasis = buildAiAnalysisDataBasis(product, evaluation);
  const fingerprint = computeProductDataFingerprint(product);
  const canonicalProductId = getCanonicalProductId(product);
  const categoryDef = getCategoryDefinition(product.category);
  const categoryCheck = verifyProductCategoryAlignment(product);
  const adFormat: AiAdCreativeFormat = categoryDef.aiProfile.adFormat;

  const windowEn = m?.dateRange === 'last7Day' ? '7-day' : '30-day';
  const windowMy = m?.dateRange === 'last7Day' ? '7 ရက်' : '30 ရက်';

  const sales = isFiniteNumber(m?.salesVolume) ? m.salesVolume : null;
  const revenue = isFiniteNumber(m?.revenueThb) ? m.revenueThb : null;
  const growth = isFiniteNumber(m?.revenueGrowthRate) ? m.revenueGrowthRate : null;
  const commRate =
    product.commissionVerified && isFinitePositive(product.commissionRate)
      ? product.commissionRate
      : isFinitePositive(m?.commissionRatePct)
        ? m.commissionRatePct
        : null;
  const commPerSale =
    isFinitePositive(product.estimatedCommissionPerSaleThb)
      ? product.estimatedCommissionPerSaleThb
      : commRate !== null && isFinitePositive(product.priceThb)
        ? Math.round((product.priceThb * commRate) / 100)
        : null;
  const creators = isFiniteNumber(m?.creatorNumber) ? m.creatorNumber : null;
  const videoRev = isFiniteNumber(m?.videoRevenueThb) ? m.videoRevenueThb : null;
  const liveRev = isFiniteNumber(m?.liveRevenueThb) ? m.liveRevenueThb : null;

  // 2. Sales & Revenue Performance
  let salesAndRevenueEn: string;
  let salesAndRevenueMy: string;
  if (sales !== null && revenue !== null) {
    const channelNotesEn: string[] = [];
    const channelNotesMy: string[] = [];
    if (videoRev !== null && revenue > 0) {
      const share = Math.round((videoRev / revenue) * 100);
      channelNotesEn.push(`Video revenue accounts for ~${share}% (${formatThbAmount(videoRev)})`);
      channelNotesMy.push(`Video မှ ဝင်ငွေ ~${share}% (${formatThbAmount(videoRev)}) ပါဝင်သည်`);
    }
    if (liveRev !== null && revenue > 0) {
      const share = Math.round((liveRev / revenue) * 100);
      channelNotesEn.push(`Live revenue accounts for ~${share}% (${formatThbAmount(liveRev)})`);
      channelNotesMy.push(`Live မှ ဝင်ငွေ ~${share}% (${formatThbAmount(liveRev)}) ပါဝင်သည်`);
    }
    salesAndRevenueEn = `Verified Kalodata ${windowEn} data shows ${formatNumber(sales)} units sold generating ${formatThbAmount(revenue)} in GMV.${channelNotesEn.length > 0 ? ` ${channelNotesEn.join('; ')}.` : ''}`;
    salesAndRevenueMy = `Kalodata မှ အတည်ပြုထားသော ${windowMy} ဒေတာအရ ရောင်းအား ${formatNumber(sales)} ခုနှင့် ဝင်ငွေ ${formatThbAmount(revenue)} ရရှိထားပါသည်။${channelNotesMy.length > 0 ? ` ${channelNotesMy.join('၊ ')}။` : ''}`;
  } else if (sales !== null || revenue !== null) {
    salesAndRevenueEn = `Partial Kalodata ${windowEn} record: ${sales !== null ? `${formatNumber(sales)} units sold` : 'sales volume unavailable'}; ${revenue !== null ? `${formatThbAmount(revenue)} revenue` : 'revenue unavailable'}.`;
    salesAndRevenueMy = `Kalodata ${windowMy} ဒေတာတစ်စိတ်တစ်ပိုင်းသာ ရရှိသည် — ${sales !== null ? `ရောင်းအား ${formatNumber(sales)} ခု` : 'ရောင်းအား မရရှိနိုင်ပါ'}၊ ${revenue !== null ? `ဝင်ငွေ ${formatThbAmount(revenue)}` : 'ဝင်ငွေ မရရှိနိုင်ပါ'}။`;
  } else {
    salesAndRevenueEn =
      'Verified Kalodata sales volume and revenue figures are unavailable for this product record. Confirm live demand before committing ad budget.';
    salesAndRevenueMy =
      'ဤ Product အတွက် Kalodata ရောင်းအားနှင့် ဝင်ငွေအတိအကျ မရရှိနိုင်သေးပါ။ Content မစတင်မီ လက်ရှိရောင်းအားကို တိုက်ရိုက်စစ်ဆေးပါ။';
  }

  // 3. Growth Potential
  let growthPotentialEn: string;
  let growthPotentialMy: string;
  if (growth !== null) {
    const sign = growth >= 0 ? '+' : '';
    const directionEn =
      growth >= 30
        ? 'strong upward momentum'
        : growth >= 5
          ? 'positive growth trajectory'
          : growth >= -10
            ? 'flat / stabilizing trend'
            : 'declining revenue momentum';
    const directionMy =
      growth >= 30
        ? 'တိုးတက်မှုအရှိန်အားကောင်းနေသည်'
        : growth >= 5
          ? 'အပေါင်းလက္ခဏာဖြင့် တိုးတက်နေသည်'
          : growth >= -10
            ? 'တည်ငြိမ်နေသည့် အနေအထားဖြစ်သည်'
            : 'ဝင်ငွေကျဆင်းနေသည့် လက္ခဏာတွေ့ရသည်';
    growthPotentialEn = `Verified Kalodata revenue growth is ${sign}${growth.toFixed(1)}% (${directionEn}). ${growth < 0 ? 'Treat scale-up cautiously until demand stabilizes.' : 'Monitor weekly velocity to confirm sustained buyer interest.'}`;
    growthPotentialMy = `Kalodata မှ အတည်ပြုထားသော ဝင်ငွေတိုးနှုန်းမှာ ${sign}${growth.toFixed(1)}% ဖြစ်ပြီး ${directionMy}။ ${growth < 0 ? 'ဝယ်လိုအား ပြန်တည်ငြိမ်မှုရှိမရှိ သတိထားစောင့်ကြည့်ပါ။' : 'အပတ်စဉ် ရောင်းအားဆက်လက်တည်မြဲမှုရှိမရှိ စောင့်ကြည့်သင့်ပါသည်။'}`;
  } else {
    growthPotentialEn =
      'Revenue growth rate is Unavailable in the fetched Kalodata payload (no growth rate fabricated). Run a follow-up snapshot and compare in Research History to measure real trajectory.';
    growthPotentialMy =
      'Kalodata ဒေတာတွင် ဝင်ငွေတိုးနှုန်း မပါဝင်သဖြင့် Unavailable ဖြစ်ပါသည်။ တိုးတက်မှုလမ်းကြောင်းသိရန် နောက်ထပ် ရှာဖွေမှု လုပ်ပြီး မှတ်တမ်းတွင် နှိုင်းယှဉ်စစ်ဆေးပါ။';
  }

  // 4. Affiliate Commission Potential
  let commissionPotentialEn: string;
  let commissionPotentialMy: string;
  if (commRate !== null) {
    commissionPotentialEn = `Verified Kalodata affiliate commission rate is ${commRate}%${commPerSale !== null ? ` (~${formatThbAmount(commPerSale)} per order at ${formatThbAmount(product.priceThb ?? 0)})` : ''}. ${commRate >= 12 ? 'Strong affiliate margin per conversion.' : commRate >= 7 ? 'Moderate affiliate margin — relies on steady video conversion volume.' : 'Lower percentage margin — requires high sales velocity or bundle basket value.'}`;
    commissionPotentialMy = `Kalodata မှ အတည်ပြုထားသော Affiliate Commission Rate မှာ ${commRate}%${commPerSale !== null ? ` (တစ်ခုရောင်းရလျှင် ~${formatThbAmount(commPerSale)})` : ''} ဖြစ်ပါသည်။ ${commRate >= 12 ? 'Affiliate အမြတ်အလားအလာ ကောင်းမွန်ပါသည်။' : commRate >= 7 ? 'အလယ်အလတ် Commission ဖြစ်၍ ဗီဒီယိုရောင်းအားပမာဏအပေါ် မူတည်ပါမည်။' : 'Commission ရာခိုင်နှုန်း နည်းသဖြင့် ရောင်းအားအရေအတွက် များမှ အကျိုးအမြတ်ကောင်းနိုင်ပါမည်။'}`;
  } else {
    commissionPotentialEn =
      'Verified affiliate commission rate is Unavailable in this record. Confirm the active open-plan commission inside TikTok Shop Affiliate Creator Center before producing content.';
    commissionPotentialMy =
      'ဤမှတ်တမ်းတွင် အတည်ပြုပြီး Commission Rate မရရှိနိုင်ပါ။ Content မဖန်တီးမီ TikTok Shop Affiliate Creator Center တွင် လက်ရှိ Commission ကို ကိုယ်တိုင်စစ်ဆေးပါ။';
  }

  // 5. Competition Situation
  let competitionAnalysisEn: string;
  let competitionAnalysisMy: string;
  if (creators !== null) {
    const revPerCreator = revenue !== null && creators > 0 ? revenue / creators : null;
    const compTierEn =
      creators <= 25
        ? 'low creator crowding'
        : creators <= 120
          ? 'moderate active creator competition'
          : 'high creator saturation';
    const compTierMy =
      creators <= 25
        ? 'Creator ပြိုင်ဆိုင်မှု နည်းပါးသည်'
        : creators <= 120
          ? 'Creator ပြိုင်ဆိုင်မှု အလယ်အလတ်ရှိသည်'
          : 'Creator များပြား၍ ပြိုင်ဆိုင်မှု ပြင်းထန်သည်';
    competitionAnalysisEn = `Verified Kalodata creator count is ${formatNumber(creators)} active creators (${compTierEn})${revPerCreator !== null ? `, averaging ~${formatThbAmount(revPerCreator)} revenue per creator` : ''}.`;
    competitionAnalysisMy = `Kalodata မှ အတည်ပြုထားသော Creator အရေအတွက်မှာ ${formatNumber(creators)} ဦးဖြစ်ပြီး ${compTierMy}${revPerCreator !== null ? ` (Creator တစ်ဦးလျှင် ပျမ်းမျှ ဝင်ငွေ ~${formatThbAmount(revPerCreator)})` : ''}။`;
  } else {
    competitionAnalysisEn =
      'Creator count is Unavailable in this Kalodata payload (Fast mode rank-only records do not include creator_number). Competition intensity cannot be verified without Product Detail data.';
    competitionAnalysisMy =
      'ဤ Kalodata ဒေတာတွင် Creator အရေအတွက် မပါဝင်သဖြင့် Competition သည် Unavailable ဖြစ်ပါသည်။ ပြိုင်ဆိုင်မှုအတိအကျသိရန် Balanced သို့မဟုတ် Deep Mode ဖြင့် Product Detail စစ်ဆေးရန် လိုအပ်ပါသည်။';
  }

  // 6. Target Customer Profile (Grounded in verified Kalodata buyer needs when enriched, otherwise explicit AI/Market Inference)
  const verifiedBuyerNeeds = m?.reviewInsight?.buyerNeeds ?? [];
  const verifiedLikes = m?.reviewInsight?.positivePoints ?? [];
  const verifiedComplaints = m?.reviewInsight?.frequentComplaints ?? [];
  const needsExcerpt =
    verifiedBuyerNeeds.length > 0
      ? verifiedBuyerNeeds.slice(0, 3).map((item) => item.point).join('; ')
      : '';

  const targetCustomerEn =
    needsExcerpt.length > 0
      ? `Informed by Kalodata Review Insights (${m?.reviewInsight?.commentsAnalyzed ?? 0} comments): Thai TikTok Shop shoppers in "${product.subCategory}"${isFinitePositive(product.priceThb) ? ` (${formatThbAmount(product.priceThb)})` : ''} looking for ${needsExcerpt}. Demographic details remain an estimate.`
      : `Market Inference (Estimated, not verified buyer demographics): ${categoryDef.aiProfile.targetAudienceDefaultEn} Subcategory focus: "${product.subCategory}"${isFinitePositive(product.priceThb) ? ` around ${formatThbAmount(product.priceThb)}` : ''}.`;

  const targetCustomerMy =
    needsExcerpt.length > 0
      ? `Kalodata ဝယ်သူ Review အချက်အလက် (မှတ်ချက် ${m?.reviewInsight?.commentsAnalyzed ?? 0} ခု) အခြေခံ — "${product.subCategoryMy}"${isFinitePositive(product.priceThb) ? ` (${formatThbAmount(product.priceThb)})` : ''} ကို ရှာဖွေပြီး (${needsExcerpt}) အတွက် အသုံးပြုလိုသော ထိုင်း TikTok Shop ဝယ်သူများနှင့် ကိုက်ညီပါသည်။`
      : `ဈေးကွက်ခန့်မှန်းချက် (Estimated — ဝယ်သူအချက်အလက်အတိအကျမဟုတ်ပါ): ${categoryDef.aiProfile.targetAudienceDefaultMy} (${product.subCategoryMy}${isFinitePositive(product.priceThb) ? ` · ${formatThbAmount(product.priceThb)} ဝန်းကျင်` : ''})။`;

  // 7. Why Choose This Product (incorporates verified shop strength & buyer likes when enriched)
  const shopContextEn =
    m?.shopEnriched && (m.shopSellerType || isFiniteNumber(m.shopRevenueThb))
      ? ` Verified shop context: ${m.shopSellerType ?? 'Seller'} shop with ${isFiniteNumber(m.shopRevenueThb) ? formatThbAmount(m.shopRevenueThb) : 'Unavailable'} Shop GMV.`
      : '';
  const shopContextMy =
    m?.shopEnriched && (m.shopSellerType || isFiniteNumber(m.shopRevenueThb))
      ? ` ဆိုင်အတည်ပြုချက် — ${m.shopSellerType ?? 'Seller'} ဆိုင်ဖြစ်ပြီး ဆိုင် GMV ${isFiniteNumber(m.shopRevenueThb) ? formatThbAmount(m.shopRevenueThb) : 'Unavailable'} ရှိသည်။`
      : '';
  const likesContextEn =
    verifiedLikes.length > 0
      ? ` Verified buyers praise: ${verifiedLikes.slice(0, 2).map((l) => l.point).join(', ')}.`
      : '';
  const likesContextMy =
    verifiedLikes.length > 0
      ? ` ဝယ်သူအများစု နှစ်သက်ချက် — ${verifiedLikes.slice(0, 2).map((l) => l.point).join('၊ ')}။`
      : '';

  const whyChooseEn =
    evaluation.strengthsEn.length > 0
      ? `Phase 2 score is ${evaluation.totalScore}/100 (Confidence: ${evaluation.confidenceLevel}, ${evaluation.confidencePct}%). Primary Kalodata-backed reasons: ${evaluation.strengthsEn.slice(0, 2).join(' ')}${shopContextEn}${likesContextEn}`
      : `${product.whyChooseEn}${shopContextEn}${likesContextEn}`;
  const whyChooseMy =
    evaluation.strengthsMy.length > 0
      ? `Phase 2 ရမှတ် ${evaluation.totalScore}/100 (ဒေတာယုံကြည်စိတ်ချရမှု: ${evaluation.confidenceLevel}, ${evaluation.confidencePct}%) ရရှိထားပါသည်။ Kalodata အချက်အလက်အရ အဓိကရွေးချယ်သင့်သည့်အကြောင်းရင်း — ${evaluation.strengthsMy.slice(0, 2).join(' ')}${shopContextMy}${likesContextMy}`
      : `${product.whyChooseMy}${shopContextMy}${likesContextMy}`;

  // 8. Risks & Drawbacks
  const verifiedComplaintRiskEn =
    verifiedComplaints.length > 0
      ? [`Verified buyer complaints from Kalodata reviews: ${verifiedComplaints.slice(0, 2).map((c) => c.point).join('; ')}.`]
      : [];
  const verifiedComplaintRiskMy =
    verifiedComplaints.length > 0
      ? [`Kalodata ဝယ်သူ Review မှ အဖြစ်များသော စောဒကများ — ${verifiedComplaints.slice(0, 2).map((c) => c.point).join('၊ ')}။`]
      : [];
  const risksEn = Array.from(
    new Set([
      ...(categoryCheck.status === 'unverified' ? [categoryCheck.noteEn] : []),
      ...verifiedComplaintRiskEn,
      ...evaluation.risksEn,
      ...(evaluation.unavailableCount > 0
        ? [
            `${evaluation.unavailableCount} scoring factor(s) are Unavailable in Kalodata (${evaluation.redistributedWeightPct} base pts redistributed) — verify missing metrics before scaling.`,
          ]
        : []),
      ...categoryDef.aiProfile.riskChecklistEn,
    ])
  ).slice(0, 5);

  const risksMy = Array.from(
    new Set([
      ...(categoryCheck.status === 'unverified' ? [categoryCheck.noteMy] : []),
      ...verifiedComplaintRiskMy,
      ...evaluation.risksMy,
      ...(evaluation.unavailableCount > 0
        ? [
            `Kalodata တွင် အချက် ${evaluation.unavailableCount} ချက် Unavailable ဖြစ်နေသဖြင့် (မူလ ${evaluation.redistributedWeightPct} မှတ် ပြန်ခွဲဝေထား) ဘတ်ဂျက်မတိုးမီ လိုအပ်သောဒေတာများကို စစ်ဆေးပါ။`,
          ]
        : []),
      ...categoryDef.aiProfile.riskChecklistMy,
    ])
  ).slice(0, 5);

  // 9. AI Advertising Content Suitability (Universal Category-Specific Strategy)
  const suitabilityRating: AiVideoSuitability = product.aiVideoSuitability;
  const formatEn = categoryDef.scoringProfile.formatLabelEn;
  const formatMy = categoryDef.scoringProfile.formatLabelMy;

  const aiContentSuitability = {
    adFormat,
    suitabilityRating,
    status: statuses.aiContentStatus,
    summaryEn: product.imageVerified
      ? `${formatEn} Assessment (Estimated · ${categoryDef.labelEn}): "${product.name}" has a verified product photo suitable for ${formatEn.toLowerCase()} execution focusing on ${categoryDef.aiProfile.sellingPointsFocusEn}.`
      : `${formatEn} Assessment (Unverified · ${categoryDef.labelEn}): Verified product photo is currently unavailable, so visual presentation and SKU details cannot be confirmed for ${formatEn.toLowerCase()} yet. Inspect live TikTok Shop buyer photos first.`,
    summaryMy: product.imageVerified
      ? `${formatMy} သင့်တော်မှု သုံးသပ်ချက် (Estimated · ${categoryDef.labelMy}): "${product.nameMy}" တွင် အတည်ပြုပြီး Product ပုံပါရှိသဖြင့် ${formatMy} ပုံစံဖြင့် ဖန်တီးတင်ဆက်ရန် သင့်တော်မှုရှိပါသည်။`
      : `${formatMy} သင့်တော်မှု သုံးသပ်ချက် (Unverified · ${categoryDef.labelMy}): အတည်ပြုပြီး Product ပုံ မရရှိသေးသဖြင့် ${formatMy} အတွက် Product ပုံစံအတိအကျကို မအတည်ပြုနိုင်သေးပါ။ TikTok Shop ရှိ တကယ့်ပုံများကို အရင်စစ်ဆေးပါ။`,
    creativeAnglesEn: [...categoryDef.aiProfile.creativeAnglesEn],
    creativeAnglesMy: [...categoryDef.aiProfile.creativeAnglesMy],
    cautionsEn: [...categoryDef.aiProfile.cautionsEn],
    cautionsMy: [...categoryDef.aiProfile.cautionsMy],
  };

  // 10. Final Recommendation
  const verdict = deriveFallbackVerdict(evaluation);
  const verdictCopy: Record<
    AiRecommendationVerdict,
    { headlineEn: string; headlineMy: string; actionEn: string; actionMy: string }
  > = {
    'priority-test': {
      headlineEn: 'Priority Test Candidate — Strong Kalodata metrics with high data confidence',
      headlineMy: 'ဦးစားပေး စမ်းသပ်သင့်သည် — Kalodata ဒေတာခိုင်မာပြီး ယုံကြည်စိတ်ချရမှု မြင့်မားသည်',
      actionEn: `Confirm stock and active affiliate plan in TikTok Shop Thailand, then launch 2–3 focused ${formatEn} test videos.`,
      actionMy: `TikTok Shop Thailand တွင် Stock နှင့် Affiliate Plan ကို စစ်ဆေးပြီး ${formatMy} စမ်းသပ်ဗီဒီယို 2–3 ခု စတင်တင်သင့်ပါသည်။`,
    },
    'test-with-caution': {
      headlineEn: 'Test With Caution — Promising signals, verify remaining data gaps first',
      headlineMy: 'သတိထားစမ်းသပ်သင့်သည် — အလားအလာရှိသော်လည်း လိုအပ်သည့်ဒေတာများကို အရင်စစ်ဆေးပါ',
      actionEn:
        'Verify missing Kalodata fields (creator saturation, live reviews, and seller rating) directly on TikTok Shop Thailand before allocating larger ad spend.',
      actionMy:
        'ဘတ်ဂျက်မတိုးမီ TikTok Shop Thailand တွင် မပြည့်စုံသေးသောအချက်များ (Creator ပြိုင်ဆိုင်မှု၊ Review နှင့် ဆိုင်အဆင့်သတ်မှတ်ချက်) ကို တိုက်ရိုက်စစ်ဆေးပါ။',
    },
    monitor: {
      headlineEn: 'Monitor Only — Keep on watch list and track another research snapshot',
      headlineMy: 'စောင့်ကြည့်အဆင့်သာ — နောက်တစ်ကြိမ် ရှာဖွေမှု လုပ်ပြီး တိုးတက်မှုရှိမရှိ ပြန်စစ်ပါ',
      actionEn:
        'Save or track in Research History and re-compare in 7 days to see whether sales velocity, growth, or commission improves.',
      actionMy:
        'ရှာဖွေမှု မှတ်တမ်းတွင် သိမ်းထားပြီး 7 ရက်အကြာတွင် ရောင်းအား၊ တိုးနှုန်း သို့မဟုတ် ကော်မရှင် တိုးတက်လာခြင်းရှိမရှိ ပြန်နှိုင်းယှဉ်ပါ။',
    },
    skip: {
      headlineEn: 'Low Priority / Skip for Now — Weak score or insufficient verified evidence',
      headlineMy: 'လောလောဆယ် ကျော်သွားသင့်သည် — ရမှတ်နည်းနေခြင်း သို့မဟုတ် အတည်ပြုဒေတာ မလုံလောက်ပါ',
      actionEn:
        'Prioritize higher-scoring candidates with verified sales, growth, and affiliate commission before spending creative effort here.',
      actionMy:
        'ရောင်းအား၊ တိုးနှုန်းနှင့် Commission အတည်ပြုထားနိုင်သော ရမှတ်ပိုမြင့်သည့် Product များကို ဦးစားပေးရွေးချယ်ပါ။',
    },
  };

  const rec = verdictCopy[verdict];
  const geminiFailed = failure?.isManualPreview !== true && Boolean(failure?.code);
  const notice = failure?.code ? buildFallbackNotice(failure.code, failure.detail) : undefined;

  return {
    schemaVersion: AI_ANALYSIS_SCHEMA_VERSION,
    canonicalProductId,
    dataFingerprint: fingerprint,
    source: 'kalodata-fallback',
    modelUsed: null,
    analyzedAt: new Date().toISOString(),
    geminiFailed,
    fallbackReasonCode: geminiFailed ? failure?.code : undefined,
    fallbackNoticeEn: geminiFailed ? notice?.en : undefined,
    fallbackNoticeMy: geminiFailed ? notice?.my : undefined,
    overallDataConfidence: evaluation.confidenceLevel,
    confidenceNoteEn: evaluation.confidenceExplanationEn,
    confidenceNoteMy: evaluation.confidenceExplanationMy,
    dataBasis,
    strengthsEn:
      evaluation.strengthsEn.length > 0
        ? evaluation.strengthsEn
        : ['Listed as an active Thailand TikTok Shop affiliate item in Kalodata.'],
    strengthsMy:
      evaluation.strengthsMy.length > 0
        ? evaluation.strengthsMy
        : ['Kalodata တွင် ထိုင်း TikTok Shop Affiliate Product အဖြစ် ပါဝင်နေသည်။'],
    weaknessesEn:
      evaluation.weaknessesEn.length > 0
        ? evaluation.weaknessesEn
        : ['Some Kalodata performance fields are unavailable and require direct TikTok Shop verification.'],
    weaknessesMy:
      evaluation.weaknessesMy.length > 0
        ? evaluation.weaknessesMy
        : ['Kalodata စွမ်းဆောင်ရည်ဒေတာအချို့ မရရှိသေးသဖြင့် TikTok Shop တွင် တိုက်ရိုက်စစ်ဆေးရန်လိုအပ်သည်။'],
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
    risksAndDrawbacksEn: risksEn,
    risksAndDrawbacksMy: risksMy,
    aiContentSuitability,
    finalRecommendation: {
      verdict,
      headlineEn: rec.headlineEn,
      headlineMy: rec.headlineMy,
      actionPlanEn: rec.actionEn,
      actionPlanMy: rec.actionMy,
    },
    analyzedCategory: product.category,
    categoryVerificationStatus: categoryCheck.status,
    categoryVerificationNoteEn: categoryCheck.noteEn,
    categoryVerificationNoteMy: categoryCheck.noteMy,
    affiliateStrategyEn: categoryDef.aiProfile.affiliateStrategyFocusEn,
    affiliateStrategyMy: categoryDef.aiProfile.affiliateStrategyFocusMy,
  };
}
