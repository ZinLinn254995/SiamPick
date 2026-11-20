import type {
  ConfidenceLevel,
  CriterionEvaluation,
  CriterionKey,
  CriterionVerification,
  DataStatus,
  OpportunityEvaluation,
  ResearchProduct,
  ScoreTier,
} from '../types/product.ts';

export interface ScoringCriterionSpec {
  key: CriterionKey;
  maxPoints: number;
}

/**
 * Internal Research Evaluation System — Total 100 Points.
 * Independent scoring model (NOT an official TikTok / TikTok Shop score).
 */
export const SCORING_RUBRIC: readonly ScoringCriterionSpec[] = [
  { key: 'demandSales', maxPoints: 25 },
  { key: 'commissionEarning', maxPoints: 20 },
  { key: 'aiCreative', maxPoints: 15 },
  { key: 'reviewsQuality', maxPoints: 15 },
  { key: 'priceAppeal', maxPoints: 10 },
  { key: 'competitionOpportunity', maxPoints: 10 },
  { key: 'sellerReliability', maxPoints: 5 },
] as const;

/**
 * Proportional verification multipliers ensure:
 * - Verified data can earn up to 100% proportionally to real product strength.
 * - Estimated data scales proportionally up to 62% (never flat-clamping all products to the same score).
 * - Unverified data scales proportionally up to 25% (never awarding high freebie points).
 * - Unavailable data strictly earns 0 points (no default score when data is missing).
 */
const VERIFICATION_MULTIPLIER: Record<DataStatus, number> = {
  verified: 1.0,
  estimated: 0.62,
  unverified: 0.25,
  unavailable: 0.0,
};

export function normalizeDataStatus(status: CriterionVerification | undefined): DataStatus {
  if (status === 'verified') return 'verified';
  if (status === 'estimated' || status === 'partial') return 'estimated';
  if (status === 'unavailable') return 'unavailable';
  return 'unverified';
}

export function getScoreTier(score: number, confidenceLevel: ConfidenceLevel): ScoreTier {
  // Never recommend an insufficiently verified (Low Confidence) product as high priority
  if (confidenceLevel === 'Low') {
    return 'low-priority';
  }
  if (score >= 80 && confidenceLevel === 'High') return 'priority-test';
  if (score >= 65) return 'investigate-further';
  return 'low-priority';
}

function computeDataDrivenStrength(
  key: CriterionKey,
  product: ResearchProduct,
  inputRawStrength: number
): number {
  const base = Math.max(0, Math.min(100, inputRawStrength));

  switch (key) {
    case 'commissionEarning': {
      if (product.commissionVerified && typeof product.commissionRate === 'number' && product.commissionRate > 0) {
        // Real commission rate (e.g., 4% -> ~48, 10% -> ~75, 15%+ -> ~92) plus per-order THB bonus
        const rateScore = Math.min(85, Math.round(28 + product.commissionRate * 4.5));
        const earningThb =
          typeof product.priceThb === 'number' && product.priceThb > 0
            ? (product.priceThb * product.commissionRate) / 100
            : 0;
        const earningBonus = earningThb >= 80 ? 15 : earningThb >= 40 ? 10 : earningThb >= 20 ? 5 : 0;
        return Math.min(100, rateScore + earningBonus);
      }
      // Without verified commission, keep strength bounded so unverified items vary honestly without inflation
      return Math.min(base, 50);
    }

    case 'reviewsQuality': {
      const hasRating =
        typeof product.customerRating === 'number' &&
        product.customerRating > 0 &&
        product.customerRating <= 5;
      const hasCount =
        typeof product.reviewCount === 'number' && product.reviewCount > 0;

      if (hasRating && hasCount) {
        const ratingComponent = Math.max(0, Math.min(65, ((product.customerRating! - 3.0) / 2.0) * 65));
        const volumeComponent =
          product.reviewCount! >= 2000
            ? 35
            : product.reviewCount! >= 500
              ? 28
              : product.reviewCount! >= 100
                ? 20
                : product.reviewCount! >= 20
                  ? 12
                  : 6;
        return Math.round(Math.max(10, Math.min(100, ratingComponent + volumeComponent)));
      }
      if (hasRating) {
        return Math.round(Math.max(15, Math.min(80, ((product.customerRating! - 3.0) / 2.0) * 80)));
      }
      return base;
    }

    case 'priceAppeal': {
      if (typeof product.priceThb !== 'number' || product.priceThb <= 0) {
        return 0;
      }
      // Blend qualitative appeal with Thailand TikTok Shop impulse/ticket realism (unrestricted pricing)
      const priceFactor =
        product.priceThb >= 120 && product.priceThb <= 690
          ? 85
          : product.priceThb > 690 && product.priceThb <= 1500
            ? 74
            : product.priceThb < 120
              ? 65
              : 62;
      return Math.round(base * 0.55 + priceFactor * 0.45);
    }

    case 'competitionOpportunity': {
      const compBase =
        product.competitionLevel === 'Low'
          ? 88
          : product.competitionLevel === 'Moderate'
            ? 64
            : 38;
      return Math.round(base * 0.5 + compBase * 0.5);
    }

    case 'demandSales': {
      const demandBase =
        product.demandLevel === 'High'
          ? 90
          : product.demandLevel === 'Growing'
            ? 78
            : product.demandLevel === 'Steady'
              ? 66
              : 50;
      return Math.round(base * 0.55 + demandBase * 0.45);
    }

    case 'aiCreative': {
      const fitBase =
        product.aiVideoSuitability === 'High'
          ? 88
          : product.aiVideoSuitability === 'Good'
            ? 70
            : 50;
      const imageBonus = product.imageVerified && product.imageUrl ? 6 : -6;
      return Math.max(10, Math.min(100, Math.round(base * 0.5 + fitBase * 0.5 + imageBonus)));
    }

    case 'sellerReliability': {
      const relBase =
        product.sellerReliabilityLevel === 'Reliable'
          ? 88
          : product.sellerReliabilityLevel === 'Standard'
            ? 64
            : 36;
      return Math.round(base * 0.5 + relBase * 0.5);
    }

    default:
      return base;
  }
}

export function evaluateProductOpportunity(product: ResearchProduct): OpportunityEvaluation {
  let verifiedCount = 0;
  let estimatedCount = 0;
  let unverifiedCount = 0;
  let unavailableCount = 0;

  const priceStatus = normalizeDataStatus(
    product.priceThb === null || product.priceThb <= 0
      ? 'unavailable'
      : (product.priceStatus ?? 'estimated')
  );

  const hasVerifiedSource = product.sources.some((s) => s.verified && Boolean(s.url));

  const criteria: CriterionEvaluation[] = SCORING_RUBRIC.map((spec) => {
    const input = product.scoringInputs[spec.key];
    let effectiveStatus: DataStatus = normalizeDataStatus(input?.verification);

    // Hard verification guards based on actual underlying product data
    if (!hasVerifiedSource && effectiveStatus === 'verified') {
      effectiveStatus = 'unverified';
    }

    if (spec.key === 'commissionEarning') {
      if (!product.commissionVerified || product.commissionRate === null) {
        effectiveStatus =
          product.commissionStatus === 'unavailable' ? 'unavailable' : 'unverified';
      } else {
        effectiveStatus = 'verified';
      }
    }

    if (spec.key === 'priceAppeal') {
      if (priceStatus === 'unavailable') {
        effectiveStatus = 'unavailable';
      } else if (priceStatus === 'unverified') {
        effectiveStatus = 'unverified';
      } else if (priceStatus === 'estimated' && effectiveStatus === 'verified') {
        effectiveStatus = 'estimated';
      }
    }

    if (spec.key === 'reviewsQuality') {
      const hasAnyReviewMetric =
        (typeof product.customerRating === 'number' && product.customerRating > 0) ||
        (typeof product.reviewCount === 'number' && product.reviewCount > 0);
      const hasFeedback =
        product.reviewStrengthsEn.length > 0 || product.customerComplaintsEn.length > 0;

      if (!hasAnyReviewMetric && !hasFeedback) {
        effectiveStatus = 'unavailable';
      } else if (
        product.customerRatingStatus === 'verified' ||
        product.reviewCountStatus === 'verified'
      ) {
        if (hasVerifiedSource) effectiveStatus = 'verified';
      } else if (!hasAnyReviewMetric && effectiveStatus === 'verified') {
        effectiveStatus = 'estimated';
      }
    }

    if (spec.key === 'aiCreative') {
      if ((!product.imageVerified || !product.imageUrl) && effectiveStatus === 'verified') {
        effectiveStatus = 'estimated';
      }
    }

    if (spec.key === 'sellerReliability') {
      if (product.sellerStatus === 'unavailable') {
        effectiveStatus = 'unavailable';
      } else if (product.sellerStatus === 'unverified' && effectiveStatus === 'verified') {
        effectiveStatus = 'unverified';
      }
    }

    if (effectiveStatus === 'verified') verifiedCount += 1;
    else if (effectiveStatus === 'estimated') estimatedCount += 1;
    else if (effectiveStatus === 'unverified') unverifiedCount += 1;
    else unavailableCount += 1;

    const effectiveStrength = computeDataDrivenStrength(
      spec.key,
      product,
      input?.rawStrength ?? 0
    );

    const multiplier = VERIFICATION_MULTIPLIER[effectiveStatus];
    const uncappedPoints = Math.round((effectiveStrength / 100) * spec.maxPoints);
    const capPoints = Math.floor(spec.maxPoints * multiplier);

    // Proportional score weighted by verification reliability (0 when unavailable)
    const weightedPoints =
      effectiveStatus === 'unavailable'
        ? 0
        : Math.round((effectiveStrength / 100) * spec.maxPoints * multiplier);

    const earnedPoints = Math.min(weightedPoints, capPoints);
    const wasCapped = effectiveStatus !== 'verified' && uncappedPoints > earnedPoints;

    return {
      key: spec.key,
      maxPoints: spec.maxPoints,
      earnedPoints,
      uncappedPoints,
      verification: effectiveStatus,
      wasCapped,
      capPoints,
      evidenceEn: input?.evidenceEn ?? 'No verified evidence recorded.',
      evidenceMy: input?.evidenceMy ?? 'အတည်ပြုနိုင်သော အထောက်အထား မရှိသေးပါ။',
    };
  });

  const totalScore = criteria.reduce((sum, item) => sum + item.earnedPoints, 0);

  // Strict Confidence Level reflecting genuine verified evidence coverage
  let confidenceLevel: ConfidenceLevel = 'Low';
  if (
    hasVerifiedSource &&
    verifiedCount >= 5 &&
    unavailableCount === 0 &&
    unverifiedCount <= 1
  ) {
    confidenceLevel = 'High';
  } else if (hasVerifiedSource && verifiedCount >= 3 && unavailableCount <= 1) {
    confidenceLevel = 'Medium';
  } else {
    confidenceLevel = 'Low';
  }

  const tier = getScoreTier(totalScore, confidenceLevel);

  return {
    totalScore,
    tier,
    confidenceLevel,
    verifiedCount,
    estimatedCount,
    unverifiedCount,
    unavailableCount,
    totalCriteria: SCORING_RUBRIC.length,
    criteria,
  };
}
