import type {
  ConfidenceLevel,
  CriterionEvaluation,
  CriterionVerification,
  DataStatus,
  OpportunityEvaluation,
  ProductCategory,
  ProductScoreSnapshot,
  ResearchProduct,
  ScoreFactorKey,
  ScoreTier,
  StrategyPreset,
  StrategyWeightMap,
} from '../types/product.ts';
import { getCategoryDefinition } from './categoryRegistry.ts';

export interface ScoringCriterionSpec {
  key: ScoreFactorKey;
  maxPoints: number;
}

/**
 * Phase 2 Product Scoring Engine — 7 Factors totaling 100 Points (Balanced Baseline).
 * Independent Research Evaluation System (NOT an official TikTok / TikTok Shop score).
 */
export const SCORING_FACTOR_ORDER: readonly ScoreFactorKey[] = [
  'salesPerformance',
  'revenuePerformance',
  'revenueGrowth',
  'commissionPotential',
  'competition',
  'marketDemand',
  'aiContentSuitability',
] as const;

export const BALANCED_BASE_WEIGHTS: Readonly<StrategyWeightMap> = {
  salesPerformance: 20,
  revenuePerformance: 20,
  revenueGrowth: 15,
  commissionPotential: 15,
  competition: 10,
  marketDemand: 10,
  aiContentSuitability: 10,
};

const MAX_SALES_FOCUS_WEIGHTS: Readonly<StrategyWeightMap> = {
  salesPerformance: 30,
  revenuePerformance: 28,
  revenueGrowth: 14,
  commissionPotential: 6,
  competition: 6,
  marketDemand: 10,
  aiContentSuitability: 6,
};

const MAX_COMMISSION_FOCUS_WEIGHTS: Readonly<StrategyWeightMap> = {
  salesPerformance: 8,
  revenuePerformance: 10,
  revenueGrowth: 10,
  commissionPotential: 40,
  competition: 12,
  marketDemand: 10,
  aiContentSuitability: 10,
};

export const SCORING_RUBRIC: readonly ScoringCriterionSpec[] = SCORING_FACTOR_ORDER.map(
  (key) => ({
    key,
    maxPoints: BALANCED_BASE_WEIGHTS[key],
  })
);

const CONFIDENCE_WEIGHT_BY_STATUS: Record<DataStatus, number> = {
  verified: 1.0,
  estimated: 0.6,
  unverified: 0.25,
  unavailable: 0.0,
};

export interface ScoringOptions {
  salesWeightPct?: number;
  strategyPreset?: StrategyPreset;
  peerProducts?: readonly ResearchProduct[];
}

export function normalizeDataStatus(status: CriterionVerification | undefined): DataStatus {
  if (status === 'verified') return 'verified';
  if (status === 'estimated' || status === 'partial') return 'estimated';
  if (status === 'unavailable') return 'unavailable';
  return 'unverified';
}

export function deriveStrategyPresetFromWeight(salesWeightPct: number): StrategyPreset {
  if (salesWeightPct >= 62) return 'sales-first';
  if (salesWeightPct <= 38) return 'commission-first';
  return 'balanced';
}

/**
 * Computes exact integer weights for all 7 factors from the Strategy Slider (salesWeightPct: 10..90)
 * plus optional Phase 8 category-specific profile calibration.
 * Guaranteed invariant: sum of all 7 weights === 100 for EVERY category and EVERY slider value.
 * - Fashion & Cosmetics deltas are all 0 -> exact Phase 2–7 baseline [20, 20, 15, 15, 10, 10, 10] at 50%.
 * - Other categories (e.g. Electronics, Home, Food, Health) apply small zero-sum emphasis shifts
 *   (e.g. Electronics boosts sales/demand/competition & reduces aesthetic AI content weight) while
 *   strictly keeping every factor >= 2 pts and exact sum === 100 pts.
 */
export function computeStrategyWeights(
  salesWeightPct = 50,
  category?: ProductCategory
): StrategyWeightMap {
  const clamped = Number.isFinite(salesWeightPct)
    ? Math.max(10, Math.min(90, Math.round(salesWeightPct)))
    : 50;

  let weights: StrategyWeightMap;

  if (clamped === 50) {
    weights = { ...BALANCED_BASE_WEIGHTS };
  } else {
    const target = clamped > 50 ? MAX_SALES_FOCUS_WEIGHTS : MAX_COMMISSION_FOCUS_WEIGHTS;
    const ratio = Math.abs(clamped - 50) / 40; // 0..1

    const rawEntries = SCORING_FACTOR_ORDER.map((key) => {
      const exact = BALANCED_BASE_WEIGHTS[key] + (target[key] - BALANCED_BASE_WEIGHTS[key]) * ratio;
      const floored = Math.floor(exact);
      return {
        key,
        floored,
        remainder: exact - floored,
      };
    });

    let remainderPoints = 100 - rawEntries.reduce((sum, e) => sum + e.floored, 0);
    const byRemainder = [...rawEntries].sort((a, b) => b.remainder - a.remainder);

    weights = {} as StrategyWeightMap;
    for (const entry of rawEntries) {
      weights[entry.key] = entry.floored;
    }
    for (let i = 0; i < byRemainder.length && remainderPoints > 0; i += 1) {
      weights[byRemainder[i].key] += 1;
      remainderPoints -= 1;
    }
  }

  if (category) {
    const deltas = getCategoryDefinition(category).scoringProfile.weightDeltas;
    const adjusted = {} as StrategyWeightMap;
    let total = 0;
    for (const key of SCORING_FACTOR_ORDER) {
      const next = Math.max(2, weights[key] + (deltas[key] ?? 0));
      adjusted[key] = next;
      total += next;
    }
    // Re-normalize any floor clamping diff onto the largest weight so sum is ALWAYS strictly 100
    let diff = 100 - total;
    if (diff !== 0) {
      const ordered = [...SCORING_FACTOR_ORDER].sort((a, b) => adjusted[b] - adjusted[a]);
      for (let i = 0; diff !== 0 && i < ordered.length * 4; i += 1) {
        const k = ordered[i % ordered.length];
        if (diff > 0) {
          adjusted[k] += 1;
          diff -= 1;
        } else if (adjusted[k] > 2) {
          adjusted[k] -= 1;
          diff += 1;
        }
      }
    }
    return adjusted;
  }

  return weights;
}

export function getScoringRubricForStrategy(
  salesWeightPct = 50,
  category?: ProductCategory
): ScoringCriterionSpec[] {
  const weights = computeStrategyWeights(salesWeightPct, category);
  return SCORING_FACTOR_ORDER.map((key) => ({
    key,
    maxPoints: weights[key],
  }));
}

export function getScoreTier(score: number, confidenceLevel: ConfidenceLevel): ScoreTier {
  if (confidenceLevel === 'Low') {
    return 'low-priority';
  }
  if (score >= 80 && confidenceLevel === 'High') {
    return 'priority-test';
  }
  if (score >= 65) {
    return 'investigate-further';
  }
  return 'low-priority';
}

export function getCanonicalProductId(product: ResearchProduct): string {
  const kaloId = product.kalodataMetrics?.productId?.trim();
  if (kaloId) return kaloId.replace(/^(?:kalodata-th-|kd[_-])/i, '').trim() || kaloId;
  return product.id.replace(/^(?:kalodata-th-|kd[_-])/i, '').trim() || product.id;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function roundOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatThbShort(amount: number): string {
  return `฿${Math.round(amount).toLocaleString('en-US')}`;
}

function getMonthlyMultiplier(dateRange: string | undefined): number {
  if (!dateRange) return 1;
  if (dateRange.toLowerCase().includes('7day')) return 4.2;
  return 1;
}

/**
 * Computes a smooth, fair comparative peer score (15–98) across the current batch.
 * Uses percentile rank blended with relative spread while damping extremes on tiny batches
 * so two similarly strong products never suffer an artificial 0-vs-100 min-max cliff.
 */
function computePeerScore(
  value: number,
  peerValues: number[],
  options?: { useLog?: boolean }
): number | null {
  if (peerValues.length < 2) return null;
  const useLog = options?.useLog === true;
  const transform = (n: number) => (useLog ? Math.log10(Math.max(0, n) + 1) : n);

  const transformed = peerValues.map(transform).sort((a, b) => a - b);
  const v = transform(value);
  const minVal = transformed[0];
  const maxVal = transformed[transformed.length - 1];
  const spread = maxVal - minVal;

  if (spread < 1e-6) {
    return 65;
  }

  const belowOrEqual = transformed.filter((x) => x <= v).length;
  const rankPct = ((belowOrEqual - 0.5) / transformed.length) * 100;

  // Map min-max into a realistic [20, 96] band instead of a harsh [0, 100] cliff,
  // and soften contrast when the batch has very few items (e.g., 2–4 products).
  const minMaxScore = 20 + ((v - minVal) / spread) * 76;
  const rawPeer = minMaxScore * 0.55 + rankPct * 0.45;
  const batchStrength = Math.min(1, (peerValues.length - 1) / 5);
  return clampScore(62 + (rawPeer - 62) * batchStrength);
}

function blendAbsoluteAndPeer(
  absScore: number,
  peerScore: number | null,
  absWeight = 0.65
): number {
  if (peerScore === null) return clampScore(absScore);
  return clampScore(absScore * absWeight + peerScore * (1 - absWeight));
}

function piecewiseLinear(
  value: number,
  points: readonly (readonly [number, number])[]
): number {
  if (value <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i += 1) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    if (value <= x1) {
      const ratio = (value - x0) / (x1 - x0);
      return y0 + ratio * (y1 - y0);
    }
  }
  return points[points.length - 1][1];
}

// ---------- Factor 1: Sales Performance (Base: 20 pts) ----------
function evaluateSalesPerformance(
  product: ResearchProduct,
  peers: readonly ResearchProduct[]
): {
  status: DataStatus;
  normalizedScore: number | null;
  evidenceEn: string;
  evidenceMy: string;
  metricDisplayEn: string;
  metricDisplayMy: string;
} {
  const m = product.kalodataMetrics;
  const sales = m?.salesVolume;

  if (typeof sales !== 'number' || !Number.isFinite(sales) || sales < 0) {
    return {
      status: 'unavailable',
      normalizedScore: null,
      evidenceEn: 'Verified Kalodata sales volume is unavailable; weight redistributed proportionally.',
      evidenceMy: 'Kalodata ရောင်းအားအရေအတွက် မရရှိနိုင်သေးပါ — Weight ကို ရရှိထားသောအချက်များကြား အချိုးကျပြန်ခွဲဝေထားပါသည်။',
      metricDisplayEn: 'Unavailable',
      metricDisplayMy: 'Unavailable',
    };
  }

  const mult = getMonthlyMultiplier(m?.dateRange);
  const monthlySales = sales * mult;
  const absScore = piecewiseLinear(Math.log10(monthlySales + 1), [
    [0, 5],
    [1, 22], // ~10/mo
    [1.7, 38], // ~50/mo
    [2.4, 56], // ~250/mo
    [3.0, 72], // ~1,000/mo
    [3.7, 88], // ~5,000/mo
    [4.4, 98], // ~25,000/mo
    [5.0, 100],
  ]);

  const peerSales = peers
    .map((p) => {
      const s = p.kalodataMetrics?.salesVolume;
      if (typeof s !== 'number' || !Number.isFinite(s) || s < 0) return null;
      return s * getMonthlyMultiplier(p.kalodataMetrics?.dateRange);
    })
    .filter((v): v is number => v !== null);

  const peerScore = computePeerScore(monthlySales, peerSales, { useLog: true });
  const score = blendAbsoluteAndPeer(absScore, peerScore, 0.6);
  const rangeLabel = m?.dateRange ?? 'period';

  return {
    status: 'verified',
    normalizedScore: score,
    evidenceEn: `Kalodata verified ${sales.toLocaleString('en-US')} units sold (${rangeLabel})${peerSales.length >= 2 ? ` · compared against ${peerSales.length} batch peers` : ''}.`,
    evidenceMy: `Kalodata အတည်ပြု ရောင်းအား ${sales.toLocaleString('en-US')} ခု (${rangeLabel})${peerSales.length >= 2 ? ` · Batch အတွင်း Product ${peerSales.length} ခုနှင့် နှိုင်းယှဉ်တွက်ချက်ထားသည်` : ''}။`,
    metricDisplayEn: `${sales.toLocaleString('en-US')} units`,
    metricDisplayMy: `${sales.toLocaleString('en-US')} ခု`,
  };
}

// ---------- Factor 2: Revenue Performance (Base: 20 pts) ----------
function evaluateRevenuePerformance(
  product: ResearchProduct,
  peers: readonly ResearchProduct[]
): {
  status: DataStatus;
  normalizedScore: number | null;
  evidenceEn: string;
  evidenceMy: string;
  metricDisplayEn: string;
  metricDisplayMy: string;
} {
  const m = product.kalodataMetrics;
  const revenue = m?.revenueThb;

  if (typeof revenue !== 'number' || !Number.isFinite(revenue) || revenue < 0) {
    return {
      status: 'unavailable',
      normalizedScore: null,
      evidenceEn: 'Verified Kalodata THB revenue is unavailable; weight redistributed proportionally.',
      evidenceMy: 'Kalodata ရောင်းချဝင်ငွေ (THB) မရရှိနိုင်သေးပါ — Weight ကို အချိုးကျပြန်ခွဲဝေထားပါသည်။',
      metricDisplayEn: 'Unavailable',
      metricDisplayMy: 'Unavailable',
    };
  }

  const mult = getMonthlyMultiplier(m?.dateRange);
  const monthlyRev = revenue * mult;
  const absScore = piecewiseLinear(Math.log10(monthlyRev + 1), [
    [0, 5],
    [3.5, 22], // ~฿3,000/mo
    [4.0, 34], // ~฿10,000/mo
    [4.7, 50], // ~฿50,000/mo
    [5.3, 66], // ~฿200,000/mo
    [6.0, 82], // ~฿1,000,000/mo
    [6.7, 95], // ~฿5,000,000/mo
    [7.3, 100],
  ]);

  const peerRevs = peers
    .map((p) => {
      const r = p.kalodataMetrics?.revenueThb;
      if (typeof r !== 'number' || !Number.isFinite(r) || r < 0) return null;
      return r * getMonthlyMultiplier(p.kalodataMetrics?.dateRange);
    })
    .filter((v): v is number => v !== null);

  const peerScore = computePeerScore(monthlyRev, peerRevs, { useLog: true });
  const score = blendAbsoluteAndPeer(absScore, peerScore, 0.6);
  const rangeLabel = m?.dateRange ?? 'period';

  return {
    status: 'verified',
    normalizedScore: score,
    evidenceEn: `Kalodata verified ${formatThbShort(revenue)} GMV (${rangeLabel})${peerRevs.length >= 2 ? ` · peer-benchmarked across ${peerRevs.length} products` : ''}.`,
    evidenceMy: `Kalodata အတည်ပြု ရောင်းချဝင်ငွေ ${formatThbShort(revenue)} (${rangeLabel})${peerRevs.length >= 2 ? ` · Product ${peerRevs.length} ခုနှင့် နှိုင်းယှဉ်ထားသည်` : ''}။`,
    metricDisplayEn: formatThbShort(revenue),
    metricDisplayMy: formatThbShort(revenue),
  };
}

// ---------- Factor 3: Revenue Growth (Base: 15 pts) ----------
function evaluateRevenueGrowth(
  product: ResearchProduct,
  peers: readonly ResearchProduct[]
): {
  status: DataStatus;
  normalizedScore: number | null;
  evidenceEn: string;
  evidenceMy: string;
  metricDisplayEn: string;
  metricDisplayMy: string;
} {
  const growth = product.kalodataMetrics?.revenueGrowthRate;

  if (typeof growth !== 'number' || !Number.isFinite(growth)) {
    return {
      status: 'unavailable',
      normalizedScore: null,
      evidenceEn: 'Kalodata revenue growth rate is unavailable; weight redistributed proportionally.',
      evidenceMy: 'Kalodata ဝင်ငွေတိုးတက်နှုန်း မရရှိနိုင်သေးပါ — Weight ကို အချိုးကျပြန်ခွဲဝေထားပါသည်။',
      metricDisplayEn: 'Unavailable',
      metricDisplayMy: 'Unavailable',
    };
  }

  const absScore = piecewiseLinear(growth, [
    [-60, 8],
    [-30, 22],
    [-10, 36],
    [0, 48],
    [15, 64],
    [35, 78],
    [70, 90],
    [150, 98],
    [250, 100],
  ]);

  const peerGrowths = peers
    .map((p) => p.kalodataMetrics?.revenueGrowthRate)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

  const peerScore = computePeerScore(growth, peerGrowths, { useLog: false });
  const score = blendAbsoluteAndPeer(absScore, peerScore, 0.65);
  const formatted = `${growth >= 0 ? '+' : ''}${growth.toFixed(1)}%`;

  return {
    status: 'verified',
    normalizedScore: score,
    evidenceEn: `Kalodata verified revenue growth of ${formatted}${growth < 0 ? ' (contracting momentum)' : growth >= 25 ? ' (strong upward momentum)' : ' (steady momentum)'}.`,
    evidenceMy: `Kalodata အတည်ပြု ဝင်ငွေတိုးတက်နှုန်း ${formatted}${growth < 0 ? ' (ရောင်းအားကျဆင်းနေ)' : growth >= 25 ? ' (တိုးတက်မှုအားကောင်း)' : ' (တည်ငြိမ်သောတိုးတက်မှု)'}။`,
    metricDisplayEn: formatted,
    metricDisplayMy: formatted,
  };
}

// ---------- Factor 4: Commission Potential (Base: 15 pts) ----------
function evaluateCommissionPotential(
  product: ResearchProduct,
  peers: readonly ResearchProduct[]
): {
  status: DataStatus;
  normalizedScore: number | null;
  evidenceEn: string;
  evidenceMy: string;
  metricDisplayEn: string;
  metricDisplayMy: string;
} {
  const rate =
    product.commissionVerified && typeof product.commissionRate === 'number' && product.commissionRate > 0
      ? product.commissionRate
      : typeof product.kalodataMetrics?.commissionRatePct === 'number' &&
          product.kalodataMetrics.commissionRatePct > 0
        ? product.kalodataMetrics.commissionRatePct
        : null;

  if (rate === null) {
    return {
      status: 'unavailable',
      normalizedScore: null,
      evidenceEn: 'Verified affiliate commission rate is unavailable; weight redistributed proportionally.',
      evidenceMy: 'အတည်ပြုပြီး Affiliate Commission Rate မရရှိနိုင်သေးပါ — Weight ကို အချိုးကျပြန်ခွဲဝေထားပါသည်။',
      metricDisplayEn: 'Unavailable',
      metricDisplayMy: 'Unavailable',
    };
  }

  const price =
    typeof product.priceThb === 'number' && product.priceThb > 0
      ? product.priceThb
      : product.kalodataMetrics?.unitPriceThb ?? null;

  const earningThb =
    product.estimatedCommissionPerSaleThb ??
    (price !== null && price > 0 ? Math.round((price * rate) / 100) : null);

  const rateAbs = piecewiseLinear(rate, [
    [1, 10],
    [3, 22],
    [5, 34],
    [8, 52],
    [10, 65],
    [15, 84],
    [20, 94],
    [30, 100],
  ]);

  let absScore = rateAbs;
  if (earningThb !== null && earningThb > 0) {
    const earningAbs = piecewiseLinear(earningThb, [
      [5, 12],
      [15, 28],
      [30, 46],
      [60, 68],
      [100, 84],
      [160, 95],
      [250, 100],
    ]);
    absScore = rateAbs * 0.6 + earningAbs * 0.4;
  }

  const peerCommValues = peers
    .map((p) => {
      const r =
        p.commissionVerified && typeof p.commissionRate === 'number' && p.commissionRate > 0
          ? p.commissionRate
          : p.kalodataMetrics?.commissionRatePct ?? null;
      if (typeof r !== 'number' || r <= 0) return null;
      const pr = p.priceThb ?? p.kalodataMetrics?.unitPriceThb ?? 0;
      const earn = pr > 0 ? (pr * r) / 100 : r * 3;
      return r * 3 + Math.log10(earn + 1) * 15;
    })
    .filter((v): v is number => v !== null);

  const selfComposite =
    rate * 3 + Math.log10((earningThb ?? rate * 3) + 1) * 15;
  const peerScore = computePeerScore(selfComposite, peerCommValues, { useLog: false });
  const score = blendAbsoluteAndPeer(absScore, peerScore, 0.6);

  return {
    status: 'verified',
    normalizedScore: score,
    evidenceEn: `Kalodata verified ${rate}% affiliate commission${earningThb !== null ? ` (~${formatThbShort(earningThb)} earning per order)` : ''}.`,
    evidenceMy: `Kalodata အတည်ပြု Affiliate Commission ${rate}%${earningThb !== null ? ` (တစ်ခုရောင်းလျှင် ~${formatThbShort(earningThb)})` : ''}။`,
    metricDisplayEn:
      earningThb !== null ? `${rate}% (${formatThbShort(earningThb)})` : `${rate}%`,
    metricDisplayMy:
      earningThb !== null ? `${rate}% (${formatThbShort(earningThb)})` : `${rate}%`,
  };
}

// ---------- Factor 5: Competition (Base: 10 pts) ----------
// STRICT RULE: Must use Kalodata Creator Count combined with Sales & Revenue.
// If Creator Count is missing -> strictly Unavailable (NEVER fabricated or scored).
function evaluateCompetition(
  product: ResearchProduct,
  peers: readonly ResearchProduct[]
): {
  status: DataStatus;
  normalizedScore: number | null;
  evidenceEn: string;
  evidenceMy: string;
  metricDisplayEn: string;
  metricDisplayMy: string;
} {
  const m = product.kalodataMetrics;
  const creatorCount = m?.creatorNumber;

  if (typeof creatorCount !== 'number' || !Number.isFinite(creatorCount) || creatorCount < 0) {
    return {
      status: 'unavailable',
      normalizedScore: null,
      evidenceEn:
        'Unavailable — Kalodata Creator Count was not returned in this mode (requires Balanced/Deep Product Detail). Weight redistributed proportionally.',
      evidenceMy:
        'Unavailable — ဤ Mode တွင် Kalodata Creator Count မပါဝင်ပါ (Balanced/Deep Product Detail လိုအပ်သည်)။ Weight ကို အချိုးကျပြန်ခွဲဝေထားပါသည်။',
      metricDisplayEn: 'Unavailable',
      metricDisplayMy: 'Unavailable',
    };
  }

  const mult = getMonthlyMultiplier(m?.dateRange);
  const monthlyRev =
    typeof m?.revenueThb === 'number' && m.revenueThb >= 0 ? m.revenueThb * mult : null;
  const monthlySales =
    typeof m?.salesVolume === 'number' && m.salesVolume >= 0 ? m.salesVolume * mult : null;

  const effectiveCreators = Math.max(1, creatorCount);
  const revPerCreator = monthlyRev !== null ? monthlyRev / effectiveCreators : null;
  const salesPerCreator = monthlySales !== null ? monthlySales / effectiveCreators : null;

  // Crowding score: lower creator saturation = higher opportunity room
  const crowdingScore = piecewiseLinear(creatorCount, [
    [0, 92],
    [10, 88],
    [25, 82],
    [60, 72],
    [120, 58],
    [250, 42],
    [500, 26],
    [1000, 16],
  ]);

  // Demand-per-creator efficiency: strong revenue & sales per creator proves healthy room even with active creators
  const revYieldScore =
    revPerCreator !== null
      ? piecewiseLinear(Math.log10(revPerCreator + 1), [
          [2.0, 22], // ฿100/creator
          [3.0, 44], // ฿1,000/creator
          [3.5, 62], // ~฿3,160/creator
          [4.0, 78], // ฿10,000/creator
          [4.5, 90], // ~฿31,600/creator
          [5.0, 98], // ฿100,000/creator
        ])
      : null;

  const salesYieldScore =
    salesPerCreator !== null
      ? piecewiseLinear(Math.log10(salesPerCreator + 1), [
          [0, 20],
          [0.7, 42], // ~4 units/creator
          [1.2, 62], // ~15 units/creator
          [1.7, 78], // ~50 units/creator
          [2.2, 92], // ~160 units/creator
          [2.8, 98],
        ])
      : null;

  let combinedAbs = crowdingScore;
  if (revYieldScore !== null && salesYieldScore !== null) {
    combinedAbs = crowdingScore * 0.4 + revYieldScore * 0.35 + salesYieldScore * 0.25;
  } else if (revYieldScore !== null) {
    combinedAbs = crowdingScore * 0.5 + revYieldScore * 0.5;
  } else if (salesYieldScore !== null) {
    combinedAbs = crowdingScore * 0.5 + salesYieldScore * 0.5;
  }

  // Peer efficiency comparison among batch products that also have Creator Count
  const peerEfficiency = peers
    .map((p) => {
      const c = p.kalodataMetrics?.creatorNumber;
      if (typeof c !== 'number' || !Number.isFinite(c) || c < 0) return null;
      const pm = getMonthlyMultiplier(p.kalodataMetrics?.dateRange);
      const pr = p.kalodataMetrics?.revenueThb;
      if (typeof pr === 'number' && pr >= 0) {
        return Math.log10((pr * pm) / Math.max(1, c) + 1);
      }
      return -Math.log10(c + 1);
    })
    .filter((v): v is number => v !== null);

  const selfEfficiency =
    monthlyRev !== null
      ? Math.log10(monthlyRev / effectiveCreators + 1)
      : -Math.log10(creatorCount + 1);

  const peerScore = computePeerScore(selfEfficiency, peerEfficiency, { useLog: false });
  const score = blendAbsoluteAndPeer(combinedAbs, peerScore, 0.7);

  const yieldNoteEn =
    revPerCreator !== null && salesPerCreator !== null
      ? ` (~${formatThbShort(revPerCreator)} & ~${Math.round(salesPerCreator).toLocaleString('en-US')} units per creator)`
      : '';
  const yieldNoteMy =
    revPerCreator !== null && salesPerCreator !== null
      ? ` (Creator ၁ ဦးပျမ်းမျှ ~${formatThbShort(revPerCreator)} · ~${Math.round(salesPerCreator).toLocaleString('en-US')} ခု)`
      : '';

  return {
    status: 'verified',
    normalizedScore: score,
    evidenceEn: `Kalodata verified ${creatorCount.toLocaleString('en-US')} promoting creator(s)${yieldNoteEn}.`,
    evidenceMy: `Kalodata အတည်ပြု Creator ${creatorCount.toLocaleString('en-US')} ဦး${yieldNoteMy}။`,
    metricDisplayEn: `${creatorCount.toLocaleString('en-US')} creators`,
    metricDisplayMy: `${creatorCount.toLocaleString('en-US')} creators`,
  };
}

// ---------- Factor 6: Market Demand (Base: 10 pts) ----------
function evaluateMarketDemand(
  product: ResearchProduct,
  peers: readonly ResearchProduct[]
): {
  status: DataStatus;
  normalizedScore: number | null;
  evidenceEn: string;
  evidenceMy: string;
  metricDisplayEn: string;
  metricDisplayMy: string;
} {
  const m = product.kalodataMetrics;
  const rev = typeof m?.revenueThb === 'number' && m.revenueThb >= 0 ? m.revenueThb : null;
  const sales = typeof m?.salesVolume === 'number' && m.salesVolume >= 0 ? m.salesVolume : null;

  if (rev === null && sales === null) {
    // Legacy non-Kalodata fallback
    if (product.demandStatus === 'unavailable') {
      return {
        status: 'unavailable',
        normalizedScore: null,
        evidenceEn: 'Market demand evidence is unavailable; weight redistributed proportionally.',
        evidenceMy: 'Market Demand အထောက်အထား မရရှိနိုင်သေးပါ — Weight ကို အချိုးကျပြန်ခွဲဝေထားပါသည်။',
        metricDisplayEn: 'Unavailable',
        metricDisplayMy: 'Unavailable',
      };
    }
    const qualScore =
      product.demandLevel === 'High'
        ? 72
        : product.demandLevel === 'Growing'
          ? 62
          : product.demandLevel === 'Steady'
            ? 52
            : 42;
    return {
      status: 'estimated',
      normalizedScore: qualScore,
      evidenceEn: `Estimated from qualitative market signal (${product.demandLevel} demand).`,
      evidenceMy: `ဈေးကွက်အချက်အလက်အပေါ် ခန့်မှန်းထားသည် (${product.demandLevel})။`,
      metricDisplayEn: product.demandLevel,
      metricDisplayMy: product.demandLevel,
    };
  }

  const videoRev = typeof m?.videoRevenueThb === 'number' && m.videoRevenueThb > 0 ? m.videoRevenueThb : 0;
  const liveRev = typeof m?.liveRevenueThb === 'number' && m.liveRevenueThb > 0 ? m.liveRevenueThb : 0;
  const mallOrShowcaseRev = Math.max(
    typeof m?.shoppingMallRevenueThb === 'number' ? m.shoppingMallRevenueThb : 0,
    typeof m?.showcaseRevenueThb === 'number' ? m.showcaseRevenueThb : 0
  );

  const activeChannels =
    (videoRev > 0 ? 1 : 0) + (liveRev > 0 ? 1 : 0) + (mallOrShowcaseRev > 0 ? 1 : 0);

  const mult = getMonthlyMultiplier(m?.dateRange);
  const monthlySales = (sales ?? 0) * mult;
  const monthlyRev = (rev ?? 0) * mult;

  const velocityComponent = piecewiseLinear(
    Math.log10(monthlySales + 1) * 0.5 + Math.log10(monthlyRev / 100 + 1) * 0.5,
    [
      [0, 15],
      [1.5, 38],
      [2.5, 58],
      [3.3, 76],
      [4.0, 90],
      [4.7, 98],
    ]
  );

  // Multi-channel breadth bonus (products selling across Video + Live + Mall/Showcase have durable organic demand)
  const channelBonus = activeChannels >= 3 ? 10 : activeChannels === 2 ? 5 : 0;
  const reviewBonus =
    typeof product.reviewCount === 'number' && product.reviewCount >= 500
      ? 8
      : typeof product.reviewCount === 'number' && product.reviewCount >= 50
        ? 4
        : 0;

  const absScore = clampScore(velocityComponent * 0.85 + channelBonus + reviewBonus);

  const peerDemandComposite = peers
    .map((p) => {
      const pm = p.kalodataMetrics;
      if (!pm || (pm.revenueThb === null && pm.salesVolume === null)) return null;
      const pMult = getMonthlyMultiplier(pm.dateRange);
      return (
        Math.log10((pm.salesVolume ?? 0) * pMult + 1) * 0.5 +
        Math.log10(((pm.revenueThb ?? 0) * pMult) / 100 + 1) * 0.5
      );
    })
    .filter((v): v is number => v !== null);

  const selfComposite =
    Math.log10(monthlySales + 1) * 0.5 + Math.log10(monthlyRev / 100 + 1) * 0.5;
  const peerScore = computePeerScore(selfComposite, peerDemandComposite, { useLog: false });
  const score = blendAbsoluteAndPeer(absScore, peerScore, 0.65);

  return {
    status: 'verified',
    normalizedScore: score,
    evidenceEn: `Verified demand across ${activeChannels} active TikTok channel(s) (${product.demandLevel} traction${typeof product.reviewCount === 'number' && product.reviewCount > 0 ? ` · ${product.reviewCount.toLocaleString('en-US')} reviews` : ''}).`,
    evidenceMy: `TikTok ရောင်းချလမ်းကြောင်း ${activeChannels} ခုတွင် အတည်ပြုဝယ်လိုအားရှိ (${product.demandLevel}${typeof product.reviewCount === 'number' && product.reviewCount > 0 ? ` · Review ${product.reviewCount.toLocaleString('en-US')} ခု` : ''})။`,
    metricDisplayEn: `${product.demandLevel} (${activeChannels} ch)`,
    metricDisplayMy: `${product.demandLevel} (${activeChannels} ch)`,
  };
}

// ---------- Factor 7: AI Content Suitability (Base: 10 pts) ----------
// Uses Product Name, Category, Image, and available Kalodata video metrics.
// - Fashion: AI Virtual Female Model commercial suitability
// - Cosmetics & Beauty: Product-only 3D commercial suitability
// - Uncertain products NEVER receive a high score.
const FASHION_STRONG_MODEL_KEYWORDS = [
  'dress',
  'blouse',
  'shirt',
  'top',
  'tee',
  't-shirt',
  'blazer',
  'jacket',
  'cardigan',
  'skirt',
  'trouser',
  'pant',
  'jean',
  'denim',
  'co-ord',
  'coord',
  'knit',
  'linen',
  'sweater',
  'hoodie',
  'jumpsuit',
  'romper',
  'coat',
  'vest',
  'camisole',
  'polo',
  'short',
  'skort',
  'activewear',
  'legging',
  'sportswear',
  'bag',
  'tote',
  'handbag',
  'shoulder bag',
  'crossbody',
  'ชุด',
  'เสื้อ',
  'กางเกง',
  'กระโปรง',
  'เดรส',
  'กระเป๋า',
];

const FASHION_LOW_FIT_OR_SENSITIVE_KEYWORDS = [
  'underwear',
  'lingerie',
  'panty',
  'panties',
  'brief',
  'bra',
  'nipple',
  'pasties',
  'shapewear',
  'corset',
  'thong',
  'sock',
  'stocking',
  'hosiery',
  'tape',
  'insole',
  'hanger',
  'pin',
  'clip',
  'mystery',
  'random',
  'wholesale',
  'กางเกงใน',
  'ชุดชั้นใน',
  'บรา',
  'ถุงเท้า',
];

const BEAUTY_STRONG_3D_KEYWORDS = [
  'serum',
  'sunscreen',
  'sunblock',
  'uv',
  'cushion',
  'foundation',
  'lip',
  'tint',
  'gloss',
  'lipstick',
  'balm',
  'blush',
  'powder',
  'cream',
  'lotion',
  'gel',
  'essence',
  'toner',
  'cleanser',
  'cleansing',
  'oil',
  'perfume',
  'fragrance',
  'mist',
  'mask',
  'ampoule',
  'concealer',
  'mascara',
  'eyeliner',
  'palette',
  'eyeshadow',
  'moisturizer',
  'scrub',
  'shampoo',
  'conditioner',
  'hair',
  'compact',
  'เซรั่ม',
  'กันแดด',
  'คุชชั่น',
  'ลิป',
  'ครีม',
  'โลชั่น',
  'แป้ง',
  'บลัช',
  'คลีนซิ่ง',
  'น้ำหอม',
];

const BEAUTY_LOW_FIT_OR_UNCERTAIN_KEYWORDS = [
  'sachet',
  'refill',
  'pouch',
  'cotton pad',
  'cotton bud',
  'swab',
  'tissue',
  'wipe',
  'razor',
  'blade',
  'tweezer',
  'sponge',
  'puff',
  'voucher',
  'clinic',
  'mystery',
  'random',
  'sample',
  'ซอง',
  'รีฟิล',
  'สำลี',
  'ทิชชู่',
  'มีดโกน',
];

function evaluateAiContentSuitability(product: ResearchProduct): {
  status: DataStatus;
  normalizedScore: number | null;
  evidenceEn: string;
  evidenceMy: string;
  metricDisplayEn: string;
  metricDisplayMy: string;
} {
  const haystack = `${product.name} ${product.subCategory}`.toLowerCase().trim();
  if (!haystack || haystack.length < 3) {
    return {
      status: 'unavailable',
      normalizedScore: null,
      evidenceEn: 'Product identity is missing; AI content suitability unavailable.',
      evidenceMy: 'Product အမည်မပြည့်စုံသဖြင့် AI Content Suitability တွက်ချက်၍ မရပါ။',
      metricDisplayEn: 'Unavailable',
      metricDisplayMy: 'Unavailable',
    };
  }

  const hasVerifiedImage = Boolean(product.imageVerified && product.imageUrl);
  const m = product.kalodataMetrics;
  const rev = typeof m?.revenueThb === 'number' && m.revenueThb > 0 ? m.revenueThb : null;
  const videoRev =
    typeof m?.videoRevenueThb === 'number' && m.videoRevenueThb >= 0 ? m.videoRevenueThb : null;
  const videoSharePct =
    rev !== null && videoRev !== null ? Math.round((videoRev / rev) * 1000) / 10 : null;

  const categoryProfile = getCategoryDefinition(product.category).scoringProfile;
  const strongKeywords = categoryProfile.strongCreativeKeywords;
  const weakKeywords = categoryProfile.weakCreativeKeywords;

  const matchedStrong = strongKeywords.some((kw) => haystack.includes(kw));
  const matchedWeak = weakKeywords.some((kw) => haystack.includes(kw));
  const isUncertainType = !matchedStrong && !matchedWeak;

  let score = 46;

  if (matchedWeak) {
    score -= 18;
  } else if (matchedStrong) {
    score += 22;
  } else {
    // Uncertain product type: keep conservative
    score -= 4;
  }

  // Verified product photo is essential visual reference for AI / short-video commercial planning
  if (hasVerifiedImage) {
    score += 14;
  } else {
    score -= 14;
  }

  // Proven TikTok short-video revenue share confirms the product converts via visual video creative
  if (videoSharePct !== null) {
    if (videoSharePct >= 40) score += 14;
    else if (videoSharePct >= 20) score += 9;
    else if (videoSharePct >= 8) score += 4;
    else if (videoSharePct === 0) score -= 4;
  }

  // Strict anti-inflation guard: NEVER give a high score to uncertain or image-less products
  let status: DataStatus = 'estimated';
  if (!hasVerifiedImage || isUncertainType || matchedWeak) {
    if (!hasVerifiedImage || isUncertainType) {
      status = 'unverified';
      score = Math.min(score, 54);
    } else {
      // Matched sensitive/poor-fit keyword (e.g. underwear/refill sachet/spare part)
      status = 'estimated';
      score = Math.min(score, 48);
    }
  } else if (videoSharePct === null) {
    // Good keyword + image, but no Kalodata video share evidence yet
    status = 'estimated';
    score = Math.min(score, 76);
  }

  const finalScore = clampScore(Math.max(15, score));

  const formatLabelEn = categoryProfile.formatLabelEn;
  const formatLabelMy = categoryProfile.formatLabelMy;

  let fitTagEn = 'Moderate fit';
  let fitTagMy = 'အသင့်အတင့်';
  if (finalScore >= 78) {
    fitTagEn = 'High fit';
    fitTagMy = 'အလွန်သင့်တော်';
  } else if (finalScore >= 62) {
    fitTagEn = 'Good fit';
    fitTagMy = 'သင့်တော်';
  } else if (finalScore < 45) {
    fitTagEn = 'Low / Uncertain';
    fitTagMy = 'သတိပြု / မသေချာ';
  }

  const reasonPartsEn: string[] = [];
  const reasonPartsMy: string[] = [];

  if (matchedWeak) {
    reasonPartsEn.push(categoryProfile.weakFitReasonEn);
    reasonPartsMy.push(categoryProfile.weakFitReasonMy);
  } else if (matchedStrong) {
    reasonPartsEn.push(categoryProfile.strongFitReasonEn);
    reasonPartsMy.push(categoryProfile.strongFitReasonMy);
  } else {
    reasonPartsEn.push('uncertain SKU visual form from title alone — capped conservatively');
    reasonPartsMy.push('Product အမည်အရ ပုံစံမသေချာသဖြင့် အမှတ်အမြင့်မပေးဘဲ ကန့်သတ်ထားသည်');
  }

  reasonPartsEn.push(
    hasVerifiedImage ? 'verified product image available' : 'no verified reference image'
  );
  reasonPartsMy.push(
    hasVerifiedImage ? 'Product ဓာတ်ပုံအတည်ပြုပြီး' : 'Product ဓာတ်ပုံမရရှိသေးပါ'
  );

  if (videoSharePct !== null) {
    reasonPartsEn.push(`${videoSharePct}% Kalodata video revenue share`);
    reasonPartsMy.push(`Kalodata Video ဝင်ငွေအချိုး ${videoSharePct}%`);
  }

  return {
    status,
    normalizedScore: finalScore,
    evidenceEn: `${formatLabelEn}: ${reasonPartsEn.join(' · ')}.`,
    evidenceMy: `${formatLabelMy} — ${reasonPartsMy.join(' · ')}။`,
    metricDisplayEn: fitTagEn,
    metricDisplayMy: fitTagMy,
  };
}

/**
 * Evaluates a single product using the Phase 2/8 7-Factor 100-Point Product Scoring Engine.
 * - Uses Strategy Slider + category-specific profile weights (always summing to 100).
 * - Redistributes Unavailable factor weights proportionally across available factors (NEVER scores missing data as 0/weight).
 * - Calculates and surfaces Data Confidence separately so missing data never masks risk.
 * - Generates concrete Strengths, Weaknesses, Risks, and Data Confidence explanations in EN & MY.
 */
export function evaluateProductOpportunity(
  product: ResearchProduct,
  options?: ScoringOptions
): OpportunityEvaluation {
  const salesWeightPct =
    typeof options?.salesWeightPct === 'number' && Number.isFinite(options.salesWeightPct)
      ? Math.max(10, Math.min(90, Math.round(options.salesWeightPct)))
      : 50;
  const strategyPreset =
    options?.strategyPreset ?? deriveStrategyPresetFromWeight(salesWeightPct);
  const weights = computeStrategyWeights(salesWeightPct, product.category);
  const peers = options?.peerProducts ?? [];

  const rawByKey: Record<
    ScoreFactorKey,
    {
      status: DataStatus;
      normalizedScore: number | null;
      evidenceEn: string;
      evidenceMy: string;
      metricDisplayEn: string;
      metricDisplayMy: string;
    }
  > = {
    salesPerformance: evaluateSalesPerformance(product, peers),
    revenuePerformance: evaluateRevenuePerformance(product, peers),
    revenueGrowth: evaluateRevenueGrowth(product, peers),
    commissionPotential: evaluateCommissionPotential(product, peers),
    competition: evaluateCompetition(product, peers),
    marketDemand: evaluateMarketDemand(product, peers),
    aiContentSuitability: evaluateAiContentSuitability(product),
  };

  let verifiedCount = 0;
  let estimatedCount = 0;
  let unverifiedCount = 0;
  let unavailableCount = 0;
  let availableBaseWeightSum = 0;
  let redistributedWeightPct = 0;
  let weightedConfidenceSum = 0;

  for (const key of SCORING_FACTOR_ORDER) {
    const res = rawByKey[key];
    const baseW = weights[key];

    if (res.status === 'verified') verifiedCount += 1;
    else if (res.status === 'estimated') estimatedCount += 1;
    else if (res.status === 'unverified') unverifiedCount += 1;
    else unavailableCount += 1;

    weightedConfidenceSum += baseW * CONFIDENCE_WEIGHT_BY_STATUS[res.status];

    if (res.status !== 'unavailable' && res.normalizedScore !== null) {
      availableBaseWeightSum += baseW;
    } else {
      redistributedWeightPct += baseW;
    }
  }

  // Compute proportional effective weights across available factors so available weights sum to 100.0
  const criteria: CriterionEvaluation[] = [];
  let exactTotalScore = 0;

  const availableKeys = SCORING_FACTOR_ORDER.filter(
    (k) => rawByKey[k].status !== 'unavailable' && rawByKey[k].normalizedScore !== null
  );

  // Proportional redistribution with clean 1-decimal sum normalization to 100.0
  const effectiveWeightMap: Partial<Record<ScoreFactorKey, number>> = {};
  if (availableBaseWeightSum > 0 && availableKeys.length > 0) {
    let runningWeightTenths = 0;
    const rawTenths = availableKeys.map((k) => {
      const exactTenths = (weights[k] / availableBaseWeightSum) * 1000;
      const floored = Math.floor(exactTenths);
      runningWeightTenths += floored;
      return { key: k, floored, rem: exactTenths - floored };
    });
    let leftover = 1000 - runningWeightTenths;
    const sortedRem = [...rawTenths].sort((a, b) => b.rem - a.rem);
    for (const item of rawTenths) {
      effectiveWeightMap[item.key] = item.floored / 10;
    }
    for (let i = 0; i < sortedRem.length && leftover > 0; i += 1) {
      effectiveWeightMap[sortedRem[i].key] = roundOneDecimal(
        (effectiveWeightMap[sortedRem[i].key] ?? 0) + 0.1
      );
      leftover -= 1;
    }
  }

  for (const key of SCORING_FACTOR_ORDER) {
    const res = rawByKey[key];
    const baseWeight = weights[key];
    const isUnavailable = res.status === 'unavailable' || res.normalizedScore === null;

    if (isUnavailable) {
      criteria.push({
        key,
        baseWeight,
        effectiveWeight: 0,
        maxPoints: 0,
        normalizedScore: null,
        earnedPoints: null,
        verification: 'unavailable',
        wasRedistributed: true,
        evidenceEn: res.evidenceEn,
        evidenceMy: res.evidenceMy,
        metricDisplayEn: res.metricDisplayEn,
        metricDisplayMy: res.metricDisplayMy,
      });
    } else {
      const effectiveWeight = effectiveWeightMap[key] ?? baseWeight;
      const exactEarned = (res.normalizedScore! / 100) * effectiveWeight;
      exactTotalScore += exactEarned;
      criteria.push({
        key,
        baseWeight,
        effectiveWeight,
        maxPoints: effectiveWeight,
        normalizedScore: res.normalizedScore,
        earnedPoints: roundOneDecimal(exactEarned),
        verification: res.status,
        wasRedistributed: false,
        evidenceEn: res.evidenceEn,
        evidenceMy: res.evidenceMy,
        metricDisplayEn: res.metricDisplayEn,
        metricDisplayMy: res.metricDisplayMy,
      });
    }
  }

  const totalScore = availableBaseWeightSum > 0 ? clampScore(exactTotalScore) : 0;
  const confidencePct = clampScore(weightedConfidenceSum);

  let confidenceLevel: ConfidenceLevel = 'Low';
  if (verifiedCount >= 5 && unavailableCount === 0 && confidencePct >= 82) {
    confidenceLevel = 'High';
  } else if (verifiedCount >= 3 && confidencePct >= 55) {
    confidenceLevel = 'Medium';
  } else {
    confidenceLevel = 'Low';
  }

  const tier = getScoreTier(totalScore, confidenceLevel);

  // Build transparent Score Explanations: Strengths, Weaknesses, Risks, Confidence summary
  const strengthsEn: string[] = [];
  const strengthsMy: string[] = [];
  const weaknessesEn: string[] = [];
  const weaknessesMy: string[] = [];
  const risksEn: string[] = [];
  const risksMy: string[] = [];

  const sortedAvailable = criteria
    .filter((c) => c.normalizedScore !== null)
    .sort((a, b) => (b.normalizedScore ?? 0) - (a.normalizedScore ?? 0));

  for (const c of sortedAvailable) {
    if ((c.normalizedScore ?? 0) >= 70 && strengthsEn.length < 3) {
      strengthsEn.push(c.evidenceEn);
      strengthsMy.push(c.evidenceMy);
    }
  }
  if (strengthsEn.length === 0 && sortedAvailable[0]) {
    strengthsEn.push(sortedAvailable[0].evidenceEn);
    strengthsMy.push(sortedAvailable[0].evidenceMy);
  }

  for (const c of [...sortedAvailable].reverse()) {
    if ((c.normalizedScore ?? 100) <= 52 && weaknessesEn.length < 3) {
      weaknessesEn.push(c.evidenceEn);
      weaknessesMy.push(c.evidenceMy);
    }
  }
  if (unavailableCount > 0) {
    const missingNames = criteria
      .filter((c) => c.verification === 'unavailable')
      .map((c) => c.key)
      .join(', ');
    weaknessesEn.push(
      `${unavailableCount} scoring factor(s) unavailable (${missingNames}) — ${redistributedWeightPct}% base weight redistributed across available factors.`
    );
    weaknessesMy.push(
      `အချက် ${unavailableCount} ချက် (${missingNames}) ဒေတာမရရှိသေး၍ Base Weight ${redistributedWeightPct}% ကို ရရှိထားသောအချက်များကြား အချိုးကျပြန်ခွဲဝေထားပါသည်။`
    );
  }
  if (weaknessesEn.length === 0 && sortedAvailable.length > 0) {
    const lowest = sortedAvailable[sortedAvailable.length - 1];
    weaknessesEn.push(`Lowest relative factor: ${lowest.evidenceEn}`);
    weaknessesMy.push(`အနိမ့်ဆုံးအချက် — ${lowest.evidenceMy}`);
  }

  // Risks derived from real metrics & missing data
  if (redistributedWeightPct > 0) {
    risksEn.push(
      `Missing data caution: ${redistributedWeightPct}% of scoring weight was redistributed because data was unavailable. Review Confidence (${confidenceLevel}, ${confidencePct}%) before committing.`
    );
    risksMy.push(
      `ဒေတာမပြည့်စုံမှုသတိပြုချက် — မရရှိသေးသောအချက်များ၏ Weight ${redistributedWeightPct}% ကို ပြန်ခွဲဝေထားသဖြင့် Score တစ်ခုတည်းမကြည့်ဘဲ Confidence (${confidenceLevel} · ${confidencePct}%) နှင့် တွဲဖက်စစ်ဆေးပါ။`
    );
  }
  const growthVal = product.kalodataMetrics?.revenueGrowthRate;
  if (typeof growthVal === 'number' && growthVal < 0) {
    risksEn.push(
      `Negative revenue growth (${growthVal.toFixed(1)}%) signals cooling demand or seasonal slowdown.`
    );
    risksMy.push(
      `ဝင်ငွေတိုးတက်နှုန်း အနုတ် (${growthVal.toFixed(1)}%) ဖြစ်နေသဖြင့် ရောင်းအားကျဆင်းနိုင်ခြေကို သတိပြုပါ။`
    );
  }
  const creatorsVal = product.kalodataMetrics?.creatorNumber;
  if (typeof creatorsVal === 'number' && creatorsVal > 120) {
    risksEn.push(
      `High creator crowding (${creatorsVal.toLocaleString('en-US')} promoting creators) may require sharper creative differentiation.`
    );
    risksMy.push(
      `Creator ${creatorsVal.toLocaleString('en-US')} ဦးကျော် ကြော်ငြာနေ၍ ပြိုင်ဆိုင်မှုမြင့်မားနိုင်သည်။`
    );
  }
  if (product.kalodataMetrics?.deliveryType?.toLowerCase() === 'global') {
    risksEn.push('Cross-border Global shipping detected — longer Thailand delivery times can raise return/cancellation risk.');
    risksMy.push('Global / Cross-border ပို့ဆောင်မှုဖြစ်သဖြင့် ပို့ဆောင်ချိန်ကြာမြင့်နိုင်ပြီး Return Risk မြင့်နိုင်သည်။');
  }
  const aiFactor = criteria.find((c) => c.key === 'aiContentSuitability');
  if (aiFactor && (aiFactor.verification === 'unverified' || (aiFactor.normalizedScore ?? 0) < 55)) {
    risksEn.push('AI creative visual suitability is unverified or constrained — verify real product visual assets before scaling ads.');
    risksMy.push('AI ကြော်ငြာဖန်တီးရန် သင့်တော်မှု မသေချာသေးပါ — ကြော်ငြာမလုပ်မီ Product ပုံစံအစစ်ကို စစ်ဆေးပါ။');
  }
  if (risksEn.length === 0) {
    risksEn.push('Verify live TikTok Shop Thailand open-plan affiliate rate and stock availability before filming.');
    risksMy.push('ဗီဒီယိုမရိုက်မီ TikTok Shop Thailand Creator Center တွင် လက်ရှိ Commission Rate နှင့် Stock ကို ထပ်မံစစ်ဆေးပါ။');
  }

  const confidenceExplanationEn = `${confidenceLevel} Confidence (${confidencePct}% weighted reliability): ${verifiedCount} Verified, ${estimatedCount} Estimated, ${unverifiedCount} Unverified, ${unavailableCount} Unavailable out of 7 factors.${redistributedWeightPct > 0 ? ` ${redistributedWeightPct}% unavailable weight redistributed proportionally.` : ' All 7 scoring factors evaluated directly with zero missing-data redistribution.'}`;
  const confidenceExplanationMy = `${confidenceLevel} Confidence (ယုံကြည်စိတ်ချရမှု ${confidencePct}%) — အချက် ၇ ချက်အနက် Verified ${verifiedCount} ချက်၊ Estimated ${estimatedCount} ချက်၊ Unverified ${unverifiedCount} ချက်၊ Unavailable ${unavailableCount} ချက်။${redistributedWeightPct > 0 ? ` မရရှိသောအချက်၏ Weight ${redistributedWeightPct}% ကို အချိုးကျပြန်ခွဲဝေထားပါသည်။` : ' အချက် ၇ ချက်လုံး ဒေတာအပြည့်အစုံဖြင့် တွက်ချက်ထားပါသည်။'}`;

  return {
    totalScore,
    tier,
    confidenceLevel,
    confidencePct,
    salesWeightPct,
    strategyPreset,
    weights,
    verifiedCount,
    estimatedCount,
    unverifiedCount,
    unavailableCount,
    totalCriteria: SCORING_FACTOR_ORDER.length,
    redistributedWeightPct,
    criteria,
    strengthsEn,
    strengthsMy,
    weaknessesEn,
    weaknessesMy,
    risksEn,
    risksMy,
    confidenceExplanationEn,
    confidenceExplanationMy,
  };
}

/**
 * Evaluates a full batch of products together with peer-group comparison.
 */
export function evaluateProductBatch(
  products: readonly ResearchProduct[],
  options?: Omit<ScoringOptions, 'peerProducts'>
): Map<string, OpportunityEvaluation> {
  const map = new Map<string, OpportunityEvaluation>();
  for (const product of products) {
    map.set(
      product.id,
      evaluateProductOpportunity(product, {
        ...options,
        peerProducts: products,
      })
    );
  }
  return map;
}

export function buildProductScoreSnapshot(
  product: ResearchProduct,
  evaluation: OpportunityEvaluation
): ProductScoreSnapshot {
  return {
    productId: product.id,
    canonicalProductId: getCanonicalProductId(product),
    totalScore: evaluation.totalScore,
    tier: evaluation.tier,
    confidenceLevel: evaluation.confidenceLevel,
    confidencePct: evaluation.confidencePct,
    verifiedCount: evaluation.verifiedCount,
    estimatedCount: evaluation.estimatedCount,
    unverifiedCount: evaluation.unverifiedCount,
    unavailableCount: evaluation.unavailableCount,
    redistributedWeightPct: evaluation.redistributedWeightPct,
    salesWeightPct: evaluation.salesWeightPct,
    strategyPreset: evaluation.strategyPreset,
    criteria: evaluation.criteria.map((c) => ({ ...c })),
    strengthsEn: [...evaluation.strengthsEn],
    strengthsMy: [...evaluation.strengthsMy],
    weaknessesEn: [...evaluation.weaknessesEn],
    weaknessesMy: [...evaluation.weaknessesMy],
    risksEn: [...evaluation.risksEn],
    risksMy: [...evaluation.risksMy],
  };
}
