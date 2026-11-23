import type {
  OpportunityEvaluation,
  ResearchProduct,
} from '../types/product.ts';
import { getCanonicalProductId } from './scoring.ts';

export type PriceTier = 'low' | 'mid' | 'high';

export interface PriceTierThreshold {
  tier: PriceTier;
  revPerCreatorFloor: number;
  revPerCreatorCeil: number;
  strongRevPerVideo: number;
  labelEn: string;
  labelMy: string;
}

export const PRICE_TIER_THRESHOLDS: Readonly<Record<PriceTier, PriceTierThreshold>> = {
  low: {
    tier: 'low',
    revPerCreatorFloor: 400,
    revPerCreatorCeil: 10000,
    strongRevPerVideo: 600,
    labelEn: 'Low (<฿150)',
    labelMy: 'ဈေးနှုန်းနည်း (<฿150)',
  },
  mid: {
    tier: 'mid',
    revPerCreatorFloor: 1000,
    revPerCreatorCeil: 25000,
    strongRevPerVideo: 1500,
    labelEn: 'Mid (฿150–500)',
    labelMy: 'ဈေးနှုန်းလတ် (฿150–500)',
  },
  high: {
    tier: 'high',
    revPerCreatorFloor: 2500,
    revPerCreatorCeil: 60000,
    strongRevPerVideo: 3500,
    labelEn: 'High (>฿500)',
    labelMy: 'ဈေးနှုန်းမြင့် (>฿500)',
  },
};

export interface PriceTierResult {
  tier: PriceTier;
  priceTierFallback: boolean;
  thresholds: PriceTierThreshold;
}

export type AsiBand = 'early' | 'sweet-spot' | 'saturated' | 'unavailable';
export type AsiCompleteness = 'full' | 'partial' | 'unavailable';

export interface AsiFactorBreakdown {
  available: boolean;
  weight: number;
  score: number | null;
  rawValue: number | null;
}

export interface AffiliateSaturationResult {
  score: number | null;
  band: AsiBand;
  completeness: AsiCompleteness;
  availableFactorCount: number;
  totalFactorCount: 3;
  priceTier: PriceTier;
  priceTierFallback: boolean;
  factors: {
    creatorDensity: AsiFactorBreakdown;
    yieldDilution: AsiFactorBreakdown;
    trendMomentum: AsiFactorBreakdown;
  };
}

export type ChannelMixClassification =
  | 'video-led'
  | 'hybrid'
  | 'live-dominated'
  | 'unavailable';

export interface ChannelRevenueMixResult {
  available: boolean;
  videoRevenueThb: number | null;
  liveRevenueThb: number | null;
  trackedTotalThb: number | null;
  videoSharePct: number | null;
  liveSharePct: number | null;
  classification: ChannelMixClassification;
  shopAffiliateSharePct: number | null;
}

export type ConfluenceSignalId =
  | 'video-led'
  | 'saturation'
  | 'video-yield'
  | 'verified-margin'
  | 'momentum';

export type ConfluenceSignalState = 'pass' | 'fail' | 'unavailable';

export interface ConfluenceSignalItem {
  id: ConfluenceSignalId;
  state: ConfluenceSignalState;
  labelEn: string;
  labelMy: string;
  valueLabel: string;
  reasonEn: string;
  reasonMy: string;
}

export type ConfluenceVerdict =
  | 'strong-setup'
  | 'promising-setup'
  | 'mixed-signals'
  | 'weak-setup'
  | 'insufficient-data';

export interface ConfluenceSummary {
  signals: ConfluenceSignalItem[];
  passedCount: number;
  failedCount: number;
  evaluatedCount: number;
  unavailableCount: number;
  totalSignals: 5;
  verdict: ConfluenceVerdict;
}

export interface ProductTechnicalAnalysis {
  priceTier: PriceTier;
  priceTierFallback: boolean;
  tierThresholds: PriceTierThreshold;
  revPerCreator: number | null;
  revPerVideo: number | null;
  earningPerOrderThb: number | null;
  asi: AffiliateSaturationResult;
  channelMix: ChannelRevenueMixResult;
  confluence: ConfluenceSummary;
  dataWindowLabel: string | null;
}

export type MatrixYAxisMode = 'commissionPerOrder' | 'revenue' | 'score';

export type MatrixQuadrant =
  | 'golden-zone'
  | 'crowded-giants'
  | 'early-quiet'
  | 'red-ocean';

export interface MarketOpportunityMatrixPoint {
  product: ResearchProduct;
  canonicalProductId: string;
  evaluation: OpportunityEvaluation | null;
  analysis: ProductTechnicalAnalysis;
  creatorNumber: number;
  yValue: number;
  xNorm: number; // 0..1 (log10(1 + creatorNumber) normalized)
  yNorm: number; // 0..1 (linear normalized)
  radiusPx: number; // 6..20
  quadrant: MatrixQuadrant;
}

export interface UnplottedMatrixProduct {
  product: ResearchProduct;
  canonicalProductId: string;
  missingReasonEn: string;
  missingReasonMy: string;
}

export interface MarketOpportunityMatrixData {
  yAxisMode: MatrixYAxisMode;
  isReliable: boolean;
  minProductsRequired: number;
  points: MarketOpportunityMatrixPoint[];
  unplottedProducts: UnplottedMatrixProduct[];
  medianX: number | null;
  medianY: number | null;
  medianXNorm: number;
  medianYNorm: number;
  goldenZoneCount: number;
  totalInputCount: number;
}

function clamp(min: number, max: number, value: number): number {
  return Math.max(min, Math.min(max, value));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function formatThbInline(amount: number): string {
  return `฿${Math.round(amount).toLocaleString('en-US')}`;
}

function resolveEffectivePriceThb(product: ResearchProduct): number | null {
  if (isFiniteNumber(product.priceThb) && product.priceThb > 0) {
    return product.priceThb;
  }
  const unitPrice = product.kalodataMetrics?.unitPriceThb;
  if (isFiniteNumber(unitPrice) && unitPrice > 0) {
    return unitPrice;
  }
  return null;
}

export function getPriceTier(priceThb: number | null | undefined): PriceTierResult {
  if (!isFiniteNumber(priceThb) || priceThb <= 0) {
    return {
      tier: 'mid',
      priceTierFallback: true,
      thresholds: PRICE_TIER_THRESHOLDS.mid,
    };
  }

  if (priceThb < 150) {
    return {
      tier: 'low',
      priceTierFallback: false,
      thresholds: PRICE_TIER_THRESHOLDS.low,
    };
  }

  if (priceThb <= 500) {
    return {
      tier: 'mid',
      priceTierFallback: false,
      thresholds: PRICE_TIER_THRESHOLDS.mid,
    };
  }

  return {
    tier: 'high',
    priceTierFallback: false,
    thresholds: PRICE_TIER_THRESHOLDS.high,
  };
}

export function computeEfficiencyProxies(product: ResearchProduct): {
  revPerCreator: number | null;
  revPerVideo: number | null;
  earningPerOrderThb: number | null;
} {
  const m = product.kalodataMetrics;
  const revenueThb = m?.revenueThb;
  const creatorNumber = m?.creatorNumber;
  const videoRevenueThb = m?.videoRevenueThb;
  const videoNumber = m?.videoNumber;

  const revPerCreator =
    isFiniteNumber(revenueThb) &&
    revenueThb >= 0 &&
    isFiniteNumber(creatorNumber) &&
    creatorNumber > 0
      ? revenueThb / creatorNumber
      : null;

  const revPerVideo =
    isFiniteNumber(videoRevenueThb) &&
    videoRevenueThb >= 0 &&
    isFiniteNumber(videoNumber) &&
    videoNumber > 0
      ? videoRevenueThb / videoNumber
      : null;

  const effectivePrice = resolveEffectivePriceThb(product);
  let earningPerOrderThb: number | null = null;

  if (
    isFiniteNumber(product.estimatedCommissionPerSaleThb) &&
    product.estimatedCommissionPerSaleThb > 0
  ) {
    earningPerOrderThb = product.estimatedCommissionPerSaleThb;
  } else if (
    product.commissionVerified === true &&
    isFiniteNumber(product.commissionRate) &&
    product.commissionRate > 0 &&
    effectivePrice !== null &&
    effectivePrice > 0
  ) {
    earningPerOrderThb = (effectivePrice * product.commissionRate) / 100;
  }

  return {
    revPerCreator,
    revPerVideo,
    earningPerOrderThb,
  };
}

export function extractDataWindowLabel(product: ResearchProduct): string | null {
  const raw = product.kalodataMetrics?.dateRange?.trim();
  if (!raw) return null;
  const normalized = raw.toLowerCase();
  if (normalized === 'last7day' || normalized === 'last7days' || normalized === '7d') {
    return 'Last 7 Days';
  }
  if (normalized === 'last30day' || normalized === 'last30days' || normalized === '30d') {
    return 'Last 30 Days';
  }
  if (normalized === 'last14day' || normalized === 'last14days' || normalized === '14d') {
    return 'Last 14 Days';
  }
  return raw;
}

export function computeAffiliateSaturationIndex(
  product: ResearchProduct
): AffiliateSaturationResult {
  const m = product.kalodataMetrics;
  const effectivePrice = resolveEffectivePriceThb(product);
  const { tier, priceTierFallback, thresholds } = getPriceTier(effectivePrice);
  const { revPerCreator } = computeEfficiencyProxies(product);

  const creatorNumber = m?.creatorNumber;
  const creatorAvailable = isFiniteNumber(creatorNumber) && creatorNumber >= 0;
  const creatorDensityScore = creatorAvailable
    ? Math.min(100, (Math.log(1 + creatorNumber) / Math.log(1 + 500)) * 100)
    : null;

  const yieldAvailable = isFiniteNumber(revPerCreator) && revPerCreator >= 0;
  const yieldDilutionScore = yieldAvailable
    ? clamp(
        0,
        100,
        100 -
          ((Math.log(1 + revPerCreator) - Math.log(thresholds.revPerCreatorFloor)) /
            (Math.log(thresholds.revPerCreatorCeil) - Math.log(thresholds.revPerCreatorFloor))) *
            90
      )
    : null;

  const growthRate = m?.revenueGrowthRate;
  const momentumAvailable = isFiniteNumber(growthRate);
  const momentumScore = momentumAvailable
    ? clamp(0, 100, 50 - growthRate * 0.8)
    : null;

  const factors: AffiliateSaturationResult['factors'] = {
    creatorDensity: {
      available: creatorAvailable,
      weight: 0.45,
      score: creatorDensityScore !== null ? Math.round(creatorDensityScore * 10) / 10 : null,
      rawValue: creatorAvailable ? creatorNumber : null,
    },
    yieldDilution: {
      available: yieldAvailable,
      weight: 0.35,
      score: yieldDilutionScore !== null ? Math.round(yieldDilutionScore * 10) / 10 : null,
      rawValue: yieldAvailable ? revPerCreator : null,
    },
    trendMomentum: {
      available: momentumAvailable,
      weight: 0.2,
      score: momentumScore !== null ? Math.round(momentumScore * 10) / 10 : null,
      rawValue: momentumAvailable ? growthRate : null,
    },
  };

  const activeList = [
    factors.creatorDensity,
    factors.yieldDilution,
    factors.trendMomentum,
  ].filter((f) => f.available && f.score !== null);

  const availableFactorCount = activeList.length;

  if (!creatorAvailable || availableFactorCount < 2) {
    return {
      score: null,
      band: 'unavailable',
      completeness: 'unavailable',
      availableFactorCount,
      totalFactorCount: 3,
      priceTier: tier,
      priceTierFallback,
      factors,
    };
  }

  let weightedSum = 0;
  let weightSum = 0;
  for (const factor of activeList) {
    weightedSum += factor.weight * factor.score!;
    weightSum += factor.weight;
  }

  const score = clamp(0, 100, Math.round(weightedSum / weightSum));
  const band: AsiBand =
    score <= 35 ? 'early' : score <= 65 ? 'sweet-spot' : 'saturated';
  const completeness: AsiCompleteness =
    availableFactorCount === 3 ? 'full' : 'partial';

  return {
    score,
    band,
    completeness,
    availableFactorCount,
    totalFactorCount: 3,
    priceTier: tier,
    priceTierFallback,
    factors,
  };
}

export function computeChannelRevenueMix(
  product: ResearchProduct
): ChannelRevenueMixResult {
  const m = product.kalodataMetrics;
  const videoRev = m?.videoRevenueThb;
  const liveRev = m?.liveRevenueThb;

  const shopRev = m?.shopRevenueThb;
  const shopAffiliateRev = m?.shopAffiliateRevenueThb;
  const shopAffiliateSharePct =
    isFiniteNumber(shopRev) &&
    shopRev > 0 &&
    isFiniteNumber(shopAffiliateRev) &&
    shopAffiliateRev >= 0
      ? clamp(0, 100, Math.round((shopAffiliateRev / shopRev) * 1000) / 10)
      : null;

  if (
    !isFiniteNumber(videoRev) ||
    !isFiniteNumber(liveRev) ||
    videoRev < 0 ||
    liveRev < 0 ||
    videoRev + liveRev <= 0
  ) {
    return {
      available: false,
      videoRevenueThb: isFiniteNumber(videoRev) && videoRev >= 0 ? videoRev : null,
      liveRevenueThb: isFiniteNumber(liveRev) && liveRev >= 0 ? liveRev : null,
      trackedTotalThb: null,
      videoSharePct: null,
      liveSharePct: null,
      classification: 'unavailable',
      shopAffiliateSharePct,
    };
  }

  const trackedTotalThb = videoRev + liveRev;
  const videoSharePct = Math.round((videoRev / trackedTotalThb) * 1000) / 10;
  const liveSharePct = Math.round((100 - videoSharePct) * 10) / 10;

  const classification: ChannelMixClassification =
    videoSharePct >= 55
      ? 'video-led'
      : videoSharePct >= 30
        ? 'hybrid'
        : 'live-dominated';

  return {
    available: true,
    videoRevenueThb: videoRev,
    liveRevenueThb: liveRev,
    trackedTotalThb,
    videoSharePct,
    liveSharePct,
    classification,
    shopAffiliateSharePct,
  };
}

export function computeProductTechnicalAnalysis(
  product: ResearchProduct,
  _evaluation?: OpportunityEvaluation
): ProductTechnicalAnalysis {
  const effectivePrice = resolveEffectivePriceThb(product);
  const { tier, priceTierFallback, thresholds } = getPriceTier(effectivePrice);
  const { revPerCreator, revPerVideo, earningPerOrderThb } =
    computeEfficiencyProxies(product);
  const asi = computeAffiliateSaturationIndex(product);
  const channelMix = computeChannelRevenueMix(product);
  const dataWindowLabel = extractDataWindowLabel(product);

  // Signal 1: Video-Led Tracked Channel Mix (>= 50% Video share)
  const videoLedSignal: ConfluenceSignalItem =
    channelMix.videoSharePct === null
      ? {
          id: 'video-led',
          state: 'unavailable',
          labelEn: 'Video-Led Channel',
          labelMy: 'Video ဦးဆောင်ရောင်းအား',
          valueLabel: '—',
          reasonEn:
            'Video and Live channel revenue figures are unavailable for this product.',
          reasonMy:
            'ဤ Product အတွက် Video နှင့် Live ရောင်းချဝင်ငွေ အချက်အလက် မရရှိနိုင်သေးပါ။',
        }
      : channelMix.videoSharePct >= 50
        ? {
            id: 'video-led',
            state: 'pass',
            labelEn: 'Video-Led Channel',
            labelMy: 'Video ဦးဆောင်ရောင်းအား',
            valueLabel: `${Math.round(channelMix.videoSharePct)}% Video`,
            reasonEn: `Tracked Channel Revenue Mix is ${channelMix.videoSharePct.toFixed(1)}% Video (≥ 50% target for short-video affiliates).`,
            reasonMy: `Tracked Channel ဝင်ငွေအချိုးတွင် Video က ${channelMix.videoSharePct.toFixed(1)}% ရှိသဖြင့် Short-Video Affiliate အတွက် သင့်တော်ပါသည်။`,
          }
        : {
            id: 'video-led',
            state: 'fail',
            labelEn: 'Video-Led Channel',
            labelMy: 'Video ဦးဆောင်ရောင်းအား',
            valueLabel: `${Math.round(channelMix.videoSharePct)}% Video`,
            reasonEn: `Tracked Channel Revenue Mix is only ${channelMix.videoSharePct.toFixed(1)}% Video (< 50%); sales lean heavily on Live streams.`,
            reasonMy: `Tracked Channel ဝင်ငွေအချိုးတွင် Video က ${channelMix.videoSharePct.toFixed(1)}% သာရှိပြီး (< 50%) Live ဘက်သို့ ပိုအားသာနေပါသည်။`,
          };

  // Signal 2: Saturation Headroom (ASI <= 65)
  const saturationSignal: ConfluenceSignalItem =
    asi.score === null
      ? {
          id: 'saturation',
          state: 'unavailable',
          labelEn: 'Saturation Headroom',
          labelMy: 'ပြိုင်ဆိုင်မှု အခွင့်အလမ်း',
          valueLabel: 'ASI —',
          reasonEn:
            'Requires Kalodata creator count and at least 2 saturation factors to calculate ASI.',
          reasonMy:
            'ASI တွက်ချက်ရန် Kalodata Creator အရေအတွက်နှင့် အနည်းဆုံး အချက် ၂ ချက် လိုအပ်ပါသည်။',
        }
      : asi.score <= 65
        ? {
            id: 'saturation',
            state: 'pass',
            labelEn: 'Saturation Headroom',
            labelMy: 'ပြိုင်ဆိုင်မှု အခွင့်အလမ်း',
            valueLabel: `ASI ${asi.score}`,
            reasonEn: `ASI is ${asi.score}/100 (≤ 65 threshold on ${thresholds.labelEn} tier) — room remains for new affiliate videos.`,
            reasonMy: `ASI မှာ ${asi.score}/100 (≤ 65 သတ်မှတ်ချက်အတွင်း) ဖြစ်သဖြင့် Affiliate Video အသစ်များအတွက် အခွင့်အလမ်းရှိနေသေးသည်။`,
          }
        : {
            id: 'saturation',
            state: 'fail',
            labelEn: 'Saturation Headroom',
            labelMy: 'ပြိုင်ဆိုင်မှု အခွင့်အလမ်း',
            valueLabel: `ASI ${asi.score}`,
            reasonEn: `ASI is ${asi.score}/100 (> 65) — creator crowding and diluted Revenue per Creator indicate high saturation.`,
            reasonMy: `ASI မှာ ${asi.score}/100 (> 65) ဖြစ်သဖြင့် Creator များပြားပြီး ပြိုင်ဆိုင်မှုပြင်းထန်နေပါသည်။`,
          };

  // Signal 3: Video Yield Efficiency (revPerVideo >= price-tier strongRevPerVideo)
  const videoYieldSignal: ConfluenceSignalItem =
    revPerVideo === null
      ? {
          id: 'video-yield',
          state: 'unavailable',
          labelEn: 'Video Yield',
          labelMy: 'Video တစ်ပုဒ်ဝင်ငွေ',
          valueLabel: '—',
          reasonEn:
            'Requires both Kalodata video revenue and video count (> 0) to compute Revenue per Video.',
          reasonMy:
            'Video တစ်ပုဒ်ပျမ်းမျှဝင်ငွေ တွက်ချက်ရန် Video ဝင်ငွေနှင့် Video အရေအတွက် (> 0) လိုအပ်ပါသည်။',
        }
      : revPerVideo >= thresholds.strongRevPerVideo
        ? {
            id: 'video-yield',
            state: 'pass',
            labelEn: 'Video Yield',
            labelMy: 'Video တစ်ပုဒ်ဝင်ငွေ',
            valueLabel: `${formatThbInline(revPerVideo)}/vid`,
            reasonEn: `Revenue per Video is ${formatThbInline(revPerVideo)}, beating the ${formatThbInline(thresholds.strongRevPerVideo)} benchmark for ${thresholds.labelEn} products.`,
            reasonMy: `Video တစ်ပုဒ်ပျမ်းမျှဝင်ငွေ ${formatThbInline(revPerVideo)} ရှိပြီး ${thresholds.labelMy} အတွက် သတ်မှတ်ချက် ${formatThbInline(thresholds.strongRevPerVideo)} ထက် ကျော်လွန်ပါသည်။`,
          }
        : {
            id: 'video-yield',
            state: 'fail',
            labelEn: 'Video Yield',
            labelMy: 'Video တစ်ပုဒ်ဝင်ငွေ',
            valueLabel: `${formatThbInline(revPerVideo)}/vid`,
            reasonEn: `Revenue per Video is ${formatThbInline(revPerVideo)}, below the ${formatThbInline(thresholds.strongRevPerVideo)} target for ${thresholds.labelEn} products.`,
            reasonMy: `Video တစ်ပုဒ်ပျမ်းမျှဝင်ငွေ ${formatThbInline(revPerVideo)} သာရှိပြီး ${thresholds.labelMy} သတ်မှတ်ချက် ${formatThbInline(thresholds.strongRevPerVideo)} အောက် ရောက်နေပါသည်။`,
          };

  // Signal 4: Verified Margin (STRICT: commissionVerified === true required)
  const verifiedCommissionAvailable =
    product.commissionVerified === true && isFiniteNumber(product.commissionRate);
  const verifiedEarningThb =
    verifiedCommissionAvailable &&
    earningPerOrderThb !== null &&
    Number.isFinite(earningPerOrderThb)
      ? earningPerOrderThb
      : null;

  const verifiedMarginSignal: ConfluenceSignalItem = !verifiedCommissionAvailable
    ? {
        id: 'verified-margin',
        state: 'unavailable',
        labelEn: 'Verified Margin',
        labelMy: 'အတည်ပြု ကော်မရှင်',
        valueLabel: 'Unverified',
        reasonEn:
          'Verified commission rate is required; estimated or unverified rates are never counted as a pass.',
        reasonMy:
          'အတည်ပြုပြီး Commission Rate သာ လက်ခံပါသည် — ခန့်မှန်းနှုန်းထားများကို Pass အဖြစ် ထည့်မတွက်ပါ။',
      }
    : product.commissionRate! >= 10 ||
        (verifiedEarningThb !== null && verifiedEarningThb >= 20)
      ? {
          id: 'verified-margin',
          state: 'pass',
          labelEn: 'Verified Margin',
          labelMy: 'အတည်ပြု ကော်မရှင်',
          valueLabel:
            verifiedEarningThb !== null
              ? `${product.commissionRate}% (${formatThbInline(verifiedEarningThb)})`
              : `${product.commissionRate}%`,
          reasonEn: `Verified ${product.commissionRate}% commission${verifiedEarningThb !== null ? ` (~${formatThbInline(verifiedEarningThb)}/order)` : ''} meets the ≥ 10% or ≥ ฿20/order threshold.`,
          reasonMy: `အတည်ပြု Commission ${product.commissionRate}%${verifiedEarningThb !== null ? ` (~${formatThbInline(verifiedEarningThb)}/order)` : ''} သည် ≥ 10% သို့မဟုတ် ≥ ฿20/order သတ်မှတ်ချက်နှင့် ကိုက်ညီပါသည်။`,
        }
      : {
          id: 'verified-margin',
          state: 'fail',
          labelEn: 'Verified Margin',
          labelMy: 'အတည်ပြု ကော်မရှင်',
          valueLabel:
            verifiedEarningThb !== null
              ? `${product.commissionRate}% (${formatThbInline(verifiedEarningThb)})`
              : `${product.commissionRate}%`,
          reasonEn: `Verified ${product.commissionRate}% commission${verifiedEarningThb !== null ? ` (~${formatThbInline(verifiedEarningThb)}/order)` : ''} is below both 10% and ฿20/order.`,
          reasonMy: `အတည်ပြု Commission ${product.commissionRate}%${verifiedEarningThb !== null ? ` (~${formatThbInline(verifiedEarningThb)}/order)` : ''} သည် 10% နှင့် ฿20/order နှစ်ခုလုံးအောက် နည်းနေပါသည်။`,
        };

  // Signal 5: Trend Momentum (revenueGrowthRate > 0)
  const growthRate = product.kalodataMetrics?.revenueGrowthRate;
  const momentumSignal: ConfluenceSignalItem = !isFiniteNumber(growthRate)
    ? {
        id: 'momentum',
        state: 'unavailable',
        labelEn: 'Trend Momentum',
        labelMy: 'ရောင်းအားတိုးတက်မှု',
        valueLabel: '—',
        reasonEn: 'Revenue growth rate is unavailable for this product.',
        reasonMy: 'ဤ Product အတွက် ဝင်ငွေတိုးတက်နှုန်း မရရှိနိုင်သေးပါ။',
      }
    : growthRate > 0
      ? {
          id: 'momentum',
          state: 'pass',
          labelEn: 'Trend Momentum',
          labelMy: 'ရောင်းအားတိုးတက်မှု',
          valueLabel: `+${growthRate.toFixed(1)}%`,
          reasonEn: `Positive revenue growth (+${growthRate.toFixed(1)}%) — check for campaign or seasonal spikes.`,
          reasonMy: `ဝင်ငွေတိုးတက်နှုန်း အပေါင်း (+${growthRate.toFixed(1)}%) ရှိနေပါသည် — ရာသီအလိုက်/Campaign အတက်အကျကို စစ်ဆေးပါ။`,
        }
      : {
          id: 'momentum',
          state: 'fail',
          labelEn: 'Trend Momentum',
          labelMy: 'ရောင်းအားတိုးတက်မှု',
          valueLabel: `${growthRate.toFixed(1)}%`,
          reasonEn: `Flat or contracting revenue growth (${growthRate.toFixed(1)}%) in the tracked period.`,
          reasonMy: `လက်ရှိကာလအတွင်း ဝင်ငွေတိုးတက်နှုန်း (${growthRate.toFixed(1)}%) မတက်သေးဘဲ ကျဆင်း/တန့်နေပါသည်။`,
        };

  const signals: ConfluenceSignalItem[] = [
    videoLedSignal,
    saturationSignal,
    videoYieldSignal,
    verifiedMarginSignal,
    momentumSignal,
  ];

  const passedCount = signals.filter((s) => s.state === 'pass').length;
  const failedCount = signals.filter((s) => s.state === 'fail').length;
  const unavailableCount = signals.filter((s) => s.state === 'unavailable').length;
  const evaluatedCount = passedCount + failedCount;

  let verdict: ConfluenceVerdict;
  if (evaluatedCount < 3) {
    verdict = 'insufficient-data';
  } else if (passedCount === 5) {
    verdict = 'strong-setup';
  } else if (passedCount === 4) {
    verdict = 'promising-setup';
  } else if (passedCount === 3) {
    verdict = 'mixed-signals';
  } else {
    verdict = 'weak-setup';
  }

  return {
    priceTier: tier,
    priceTierFallback,
    tierThresholds: thresholds,
    revPerCreator,
    revPerVideo,
    earningPerOrderThb,
    asi,
    channelMix,
    confluence: {
      signals,
      passedCount,
      failedCount,
      evaluatedCount,
      unavailableCount,
      totalSignals: 5,
      verdict,
    },
    dataWindowLabel,
  };
}

function computeMedian(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid];
  }
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

export function buildMarketOpportunityMatrixData(
  products: readonly ResearchProduct[],
  evaluations: Map<string, OpportunityEvaluation>,
  yAxisMode: MatrixYAxisMode = 'commissionPerOrder'
): MarketOpportunityMatrixData {
  const minProductsRequired = 8;
  const unplottedProducts: UnplottedMatrixProduct[] = [];

  interface DraftPoint {
    product: ResearchProduct;
    canonicalProductId: string;
    evaluation: OpportunityEvaluation | null;
    analysis: ProductTechnicalAnalysis;
    creatorNumber: number;
    yValue: number;
    salesVolume: number | null;
  }

  const drafts: DraftPoint[] = [];

  for (const product of products) {
    const canonicalProductId = getCanonicalProductId(product);
    const evaluation =
      evaluations.get(product.id) ?? evaluations.get(canonicalProductId) ?? null;
    const analysis = computeProductTechnicalAnalysis(product, evaluation ?? undefined);

    const creatorNumber = product.kalodataMetrics?.creatorNumber;
    const hasCreator = isFiniteNumber(creatorNumber) && creatorNumber >= 0;

    let yValue: number | null = null;
    let missingYEn = '';
    let missingYMy = '';

    if (yAxisMode === 'commissionPerOrder') {
      if (isFiniteNumber(analysis.earningPerOrderThb) && analysis.earningPerOrderThb > 0) {
        yValue = analysis.earningPerOrderThb;
      } else {
        missingYEn = 'commission per order unavailable';
        missingYMy = 'တစ်ခုရောင်းကော်မရှင် မရရှိနိုင်သေးပါ';
      }
    } else if (yAxisMode === 'revenue') {
      const rev = product.kalodataMetrics?.revenueThb;
      if (isFiniteNumber(rev) && rev >= 0) {
        yValue = rev;
      } else {
        missingYEn = 'revenue unavailable';
        missingYMy = 'ရောင်းချဝင်ငွေ မရရှိနိုင်သေးပါ';
      }
    } else {
      const score = evaluation?.totalScore;
      if (isFiniteNumber(score) && score >= 0) {
        yValue = score;
      } else {
        missingYEn = 'opportunity score unavailable';
        missingYMy = 'Opportunity Score မရရှိနိုင်သေးပါ';
      }
    }

    if (!hasCreator || yValue === null) {
      const reasonsEn: string[] = [];
      const reasonsMy: string[] = [];
      if (!hasCreator) {
        reasonsEn.push('creator count unavailable');
        reasonsMy.push('Creator အရေအတွက် မရရှိနိုင်သေးပါ');
      }
      if (yValue === null) {
        reasonsEn.push(missingYEn);
        reasonsMy.push(missingYMy);
      }
      unplottedProducts.push({
        product,
        canonicalProductId,
        missingReasonEn: reasonsEn.join(' & '),
        missingReasonMy: reasonsMy.join(' နှင့် '),
      });
      continue;
    }

    const salesVolume = product.kalodataMetrics?.salesVolume;
    drafts.push({
      product,
      canonicalProductId,
      evaluation,
      analysis,
      creatorNumber: creatorNumber!,
      yValue,
      salesVolume: isFiniteNumber(salesVolume) && salesVolume >= 0 ? salesVolume : null,
    });
  }

  const isReliable = drafts.length >= minProductsRequired;

  if (drafts.length === 0) {
    return {
      yAxisMode,
      isReliable: false,
      minProductsRequired,
      points: [],
      unplottedProducts,
      medianX: null,
      medianY: null,
      medianXNorm: 0.5,
      medianYNorm: 0.5,
      goldenZoneCount: 0,
      totalInputCount: products.length,
    };
  }

  const xValues = drafts.map((d) => d.creatorNumber);
  const yValues = drafts.map((d) => d.yValue);
  const medianX = computeMedian(xValues)!;
  const medianY = computeMedian(yValues)!;

  const logXs = drafts.map((d) => Math.log10(1 + d.creatorNumber));
  const minLogX = Math.min(...logXs);
  const maxLogX = Math.max(...logXs);
  const logXSpan = maxLogX - minLogX;

  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  const ySpan = maxY - minY;

  const availableSqrts = drafts
    .map((d) => (d.salesVolume !== null ? Math.sqrt(d.salesVolume) : null))
    .filter((v): v is number => v !== null);
  const minSqrt = availableSqrts.length > 0 ? Math.min(...availableSqrts) : 0;
  const maxSqrt = availableSqrts.length > 0 ? Math.max(...availableSqrts) : 0;
  const sqrtSpan = maxSqrt - minSqrt;

  const medianLogX = Math.log10(1 + medianX);
  const medianXNorm =
    logXSpan < 1e-9 ? 0.5 : clamp(0, 1, (medianLogX - minLogX) / logXSpan);
  const medianYNorm =
    ySpan < 1e-9 ? 0.5 : clamp(0, 1, (medianY - minY) / ySpan);

  let goldenZoneCount = 0;

  const points: MarketOpportunityMatrixPoint[] = drafts.map((draft, idx) => {
    const xNorm =
      logXSpan < 1e-9 ? 0.5 : clamp(0, 1, (logXs[idx] - minLogX) / logXSpan);
    const yNorm =
      ySpan < 1e-9 ? 0.5 : clamp(0, 1, (draft.yValue - minY) / ySpan);

    let radiusPx = 7;
    if (draft.salesVolume !== null) {
      const s = Math.sqrt(draft.salesVolume);
      if (sqrtSpan < 1e-9) {
        radiusPx = 11;
      } else {
        radiusPx = Math.round((6 + ((s - minSqrt) / sqrtSpan) * 14) * 10) / 10;
      }
    }

    let quadrant: MatrixQuadrant;
    if (draft.creatorNumber <= medianX && draft.yValue >= medianY) {
      quadrant = 'golden-zone';
      goldenZoneCount += 1;
    } else if (draft.creatorNumber > medianX && draft.yValue >= medianY) {
      quadrant = 'crowded-giants';
    } else if (draft.creatorNumber <= medianX && draft.yValue < medianY) {
      quadrant = 'early-quiet';
    } else {
      quadrant = 'red-ocean';
    }

    return {
      product: draft.product,
      canonicalProductId: draft.canonicalProductId,
      evaluation: draft.evaluation,
      analysis: draft.analysis,
      creatorNumber: draft.creatorNumber,
      yValue: draft.yValue,
      xNorm,
      yNorm,
      radiusPx,
      quadrant,
    };
  });

  return {
    yAxisMode,
    isReliable,
    minProductsRequired,
    points,
    unplottedProducts,
    medianX,
    medianY,
    medianXNorm,
    medianYNorm,
    goldenZoneCount,
    totalInputCount: products.length,
  };
}
