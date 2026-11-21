import type {
  AiProductAnalysis,
  AiVideoSuitability,
  BestProductSelectionItem,
  BestSelectionCategory,
  ComparisonSelectionItem,
  ConfidenceLevel,
  OpportunityEvaluation,
  ProductDecisionSummary,
  ProductDecisionVerdict,
  ProductResultsFilterState,
  ProductSortField,
  ResearchProduct,
  ScoreFactorKey,
  SortDirection,
} from '../types/product.ts';
import {
  evaluateProductOpportunity,
  getCanonicalProductId,
} from './scoring.ts';
import { getCachedAiAnalysisForProduct } from './aiAnalysisCache.ts';
import { getCategoryDefinition } from './categoryRegistry.ts';

const CONFIDENCE_RANK: Record<ConfidenceLevel, number> = {
  High: 3,
  Medium: 2,
  Low: 1,
};

export const DEFAULT_PRODUCT_FILTERS: Readonly<ProductResultsFilterState> = {
  scoreRange: 'all',
  recommendationTier: 'all',
  confidenceLevel: 'all',
  competitionLevel: 'all',
  salesPerformance: 'all',
  commissionPotential: 'all',
  category: 'all',
  researchMode: 'all',
  aiContentSuitability: 'all',
};

export function countActiveFilters(filters: ProductResultsFilterState): number {
  let count = 0;
  if (filters.scoreRange !== 'all') count += 1;
  if (filters.recommendationTier !== 'all') count += 1;
  if (filters.confidenceLevel !== 'all') count += 1;
  if (filters.competitionLevel !== 'all') count += 1;
  if (filters.salesPerformance !== 'all') count += 1;
  if (filters.commissionPotential !== 'all') count += 1;
  if (filters.category !== 'all') count += 1;
  if (filters.researchMode !== 'all') count += 1;
  if (filters.aiContentSuitability !== 'all') count += 1;
  return count;
}

function getCriterion(evaluation: OpportunityEvaluation, key: ScoreFactorKey) {
  return evaluation.criteria.find((c) => c.key === key) ?? null;
}

function getAvailableCriterionScore(
  evaluation: OpportunityEvaluation,
  key: ScoreFactorKey
): number | null {
  const c = getCriterion(evaluation, key);
  if (!c || c.verification === 'unavailable' || c.normalizedScore === null) {
    return null;
  }
  return c.normalizedScore;
}

function formatThbCompact(val: number): string {
  return `฿${Math.round(val).toLocaleString('en-US')}`;
}

export function resolveEffectiveAiAnalysis(
  product: ResearchProduct,
  explicitAnalysis?: AiProductAnalysis | null
): AiProductAnalysis | null {
  if (explicitAnalysis) return explicitAnalysis;
  if (product.aiAnalysis) return product.aiAnalysis;
  const cached = getCachedAiAnalysisForProduct(product);
  if (cached.entry?.analysis) return cached.entry.analysis;
  return null;
}

export function getEffectiveAiSuitabilityBand(
  product: ResearchProduct,
  evaluation: OpportunityEvaluation
): AiVideoSuitability {
  const aiCrit = getCriterion(evaluation, 'aiContentSuitability');
  if (aiCrit && aiCrit.normalizedScore !== null) {
    if (aiCrit.normalizedScore >= 76) return 'High';
    if (aiCrit.normalizedScore >= 58) return 'Good';
    return 'Moderate';
  }
  return product.aiVideoSuitability;
}

export function isCompetitionUnavailable(
  product: ResearchProduct,
  evaluation: OpportunityEvaluation
): boolean {
  const compCrit = getCriterion(evaluation, 'competition');
  if (compCrit?.verification === 'unavailable' || compCrit?.normalizedScore === null) {
    return true;
  }
  if (
    product.kalodataMetrics !== undefined &&
    (product.kalodataMetrics.creatorNumber === null ||
      product.kalodataMetrics.creatorNumber === undefined)
  ) {
    return true;
  }
  return false;
}

/**
 * Phase 5 Requirement #4 — Multi-Signal Product Decision Summary.
 * Evaluates Score + Sales + Commission + Competition + Data Confidence + AI Analysis
 * together (NEVER bases recommendation on Score alone).
 */
export function deriveProductDecisionSummary(
  product: ResearchProduct,
  evaluation: OpportunityEvaluation,
  explicitAiAnalysis?: AiProductAnalysis | null
): ProductDecisionSummary {
  const aiAnalysis = resolveEffectiveAiAnalysis(product, explicitAiAnalysis);
  const m = product.kalodataMetrics;

  const salesScore = getAvailableCriterionScore(evaluation, 'salesPerformance');
  const revenueScore = getAvailableCriterionScore(evaluation, 'revenuePerformance');
  const growthScore = getAvailableCriterionScore(evaluation, 'revenueGrowth');
  const commissionScore = getAvailableCriterionScore(evaluation, 'commissionPotential');
  const competitionScore = getAvailableCriterionScore(evaluation, 'competition');
  const aiVerdict = aiAnalysis?.finalRecommendation.verdict ?? null;

  const hasVerifiedSales =
    typeof m?.salesVolume === 'number' && Number.isFinite(m.salesVolume) && m.salesVolume >= 0;
  const hasVerifiedRevenue =
    typeof m?.revenueThb === 'number' && Number.isFinite(m.revenueThb) && m.revenueThb >= 0;
  const hasVerifiedCommission =
    (product.commissionVerified &&
      typeof product.commissionRate === 'number' &&
      product.commissionRate > 0) ||
    (typeof m?.commissionRatePct === 'number' && m.commissionRatePct > 0);
  const creatorCount =
    typeof m?.creatorNumber === 'number' && Number.isFinite(m.creatorNumber)
      ? m.creatorNumber
      : null;
  const growthRate =
    typeof m?.revenueGrowthRate === 'number' && Number.isFinite(m.revenueGrowthRate)
      ? m.revenueGrowthRate
      : null;

  const cautionsEn: string[] = [];
  const cautionsMy: string[] = [];

  if (evaluation.unavailableCount > 0) {
    cautionsEn.push(
      `${evaluation.unavailableCount} scoring factor(s) are currently unavailable (${evaluation.redistributedWeightPct} pts redistributed). Enrich missing data before scaling.`
    );
    cautionsMy.push(
      `အချက်အလက် ${evaluation.unavailableCount} ခု မရရှိသေးပါ (Weight ${evaluation.redistributedWeightPct} မှတ် ပြန်ခွဲဝေထားသည်) — ကြော်ငြာငွေမသုံးမီ ဒေတာဖြည့်စွက်စစ်ဆေးပါ။`
    );
  }
  if (creatorCount === null) {
    cautionsEn.push(
      'Creator Count is unavailable — true affiliate crowding cannot be confirmed yet.'
    );
    cautionsMy.push(
      'Creator အရေအတွက် မရရှိသေးသဖြင့် ပြိုင်ဆိုင်မှုအစစ်အမှန်ကို အတည်မပြုနိုင်သေးပါ။'
    );
  } else if (creatorCount >= 400) {
    cautionsEn.push(
      `High creator crowding (${creatorCount.toLocaleString('en-US')} active creators) requires a distinct creative hook.`
    );
    cautionsMy.push(
      `Creator ${creatorCount.toLocaleString('en-US')} ဦးအထိ များပြားသဖြင့် ကွဲပြားသော ကြော်ငြာ Angle လိုအပ်ပါမည်။`
    );
  }
  if (!hasVerifiedCommission) {
    cautionsEn.push('Verified affiliate commission rate is unavailable — check TikTok Shop Affiliate center directly.');
    cautionsMy.push('အတည်ပြုပြီး Affiliate Commission Rate မပါဝင်သေးပါ — TikTok Shop Affiliate တွင် တိုက်ရိုက်စစ်ဆေးပါ။');
  }
  if (growthRate !== null && growthRate < -15) {
    cautionsEn.push(`Recent revenue growth is contracting (${growthRate.toFixed(1)}%).`);
    cautionsMy.push(`လက်ရှိ ဝင်ငွေတိုးတက်နှုန်း ကျဆင်းနေပါသည် (${growthRate.toFixed(1)}%)။`);
  }
  if (aiVerdict === 'skip' || aiVerdict === 'monitor') {
    cautionsEn.push(
      `AI Product Analysis advised "${aiVerdict === 'skip' ? 'Skip / Low Priority' : 'Monitor First'}".`
    );
    cautionsMy.push(
      `AI သုံးသပ်ချက်တွင် "${aiVerdict === 'skip' ? 'ကျော်သွားသင့်သည်' : 'စောင့်ကြည့်အဆင့်'}" ဟု အကြံပြုထားပါသည်။`
    );
  }
  const categoryDef = getCategoryDefinition(product.category);
  if (categoryDef.aiProfile.riskChecklistEn[0]) {
    cautionsEn.push(categoryDef.aiProfile.riskChecklistEn[0]);
  }
  if (categoryDef.aiProfile.riskChecklistMy[0]) {
    cautionsMy.push(categoryDef.aiProfile.riskChecklistMy[0]);
  }

  let verdict: ProductDecisionVerdict;
  let reasonEn: string;
  let reasonMy: string;

  // 1. Need More Data — low confidence or critical core metrics missing
  const coreTractionMissing = !hasVerifiedSales && !hasVerifiedRevenue;
  if (
    evaluation.confidenceLevel === 'Low' ||
    evaluation.confidencePct < 55 ||
    evaluation.unavailableCount >= 3 ||
    coreTractionMissing
  ) {
    verdict = 'need-more-data';
    reasonEn = `Data confidence is ${evaluation.confidenceLevel} (${evaluation.confidencePct}%) with ${evaluation.unavailableCount} missing factor(s). Run Data Enrichment (Product/Shop Detail) before making a final launch call.`;
    reasonMy = `ဒေတာယုံကြည်စိတ်ချရမှု ${evaluation.confidenceLevel} (${evaluation.confidencePct}%) သာရှိပြီး မပြည့်စုံသောအချက် ${evaluation.unavailableCount} ခုရှိနေသဖြင့် အပြီးသတ်မဆုံးဖြတ်မီ Data Enrichment ဖြင့် ဒေတာထပ်ဖြည့်သင့်ပါသည်။`;
  }
  // 2. Not Recommended — weak multi-signal fundamentals or severe negative momentum / AI skip
  else if (
    evaluation.totalScore < 55 ||
    (aiVerdict === 'skip' && evaluation.totalScore < 72) ||
    (growthRate !== null &&
      growthRate <= -35 &&
      (salesScore ?? 50) < 60 &&
      (commissionScore ?? 50) < 60) ||
    (creatorCount !== null &&
      creatorCount >= 800 &&
      (competitionScore ?? 50) < 35 &&
      (commissionScore ?? 50) < 45)
  ) {
    verdict = 'not-recommended';
    reasonEn =
      aiVerdict === 'skip'
        ? `Combined signals (Score ${evaluation.totalScore}/100, AI verdict: Skip) indicate unfavorable risk-to-reward relative to stronger alternatives.`
        : `Combined Sales, Commission, Growth, and Competition fundamentals are weak (${evaluation.totalScore}/100) — better affiliate candidates are likely available.`;
    reasonMy =
      aiVerdict === 'skip'
        ? `Score (${evaluation.totalScore}/100) နှင့် AI သုံးသပ်ချက် (Skip) တို့အရ အခြား Product များနှင့်ယှဉ်လျှင် အကျိုးအမြတ်နှင့် အန္တရာယ်အချိုး မသင့်တော်ပါ။`
        : `ရောင်းအား၊ Commission၊ တိုးတက်နှုန်းနှင့် ပြိုင်ဆိုင်မှု စုပေါင်းအခြေအနေ အားနည်းနေသဖြင့် (${evaluation.totalScore}/100) လောလောဆယ် မရွေးချယ်သင့်ပါ။`;
  }
  // 3. Recommended — strong score + high/solid confidence + verified sales/revenue + acceptable commission & competition + non-negative AI
  else if (
    evaluation.totalScore >= 76 &&
    (evaluation.confidenceLevel === 'High' ||
      (evaluation.verifiedCount >= 5 && evaluation.confidencePct >= 75)) &&
    ((salesScore ?? 0) >= 60 || (revenueScore ?? 0) >= 60) &&
    (hasVerifiedCommission && (commissionScore ?? 0) >= 48) &&
    (competitionScore === null || competitionScore >= 38) &&
    aiVerdict !== 'skip' &&
    aiVerdict !== 'monitor' &&
    (growthScore === null || growthScore >= 30)
  ) {
    verdict = 'recommended';
    reasonEn = `Strong multi-signal alignment: ${evaluation.totalScore}/100 score, ${evaluation.confidenceLevel} confidence (${evaluation.confidencePct}%), verified sales/revenue traction, and ${product.commissionRate ?? m?.commissionRatePct}% verified commission${aiVerdict === 'priority-test' ? ' — confirmed by AI Analysis' : ''}.`;
    reasonMy = `အချက်အလက်အားလုံး ဟန်ချက်ညီအားကောင်းသည် — Score ${evaluation.totalScore}/100၊ ယုံကြည်စိတ်ချရမှု ${evaluation.confidenceLevel} (${evaluation.confidencePct}%)၊ အတည်ပြုရောင်းအား/ဝင်ငွေနှင့် Commission ${product.commissionRate ?? m?.commissionRatePct}% ရှိပါသည်${aiVerdict === 'priority-test' ? ' (AI သုံးသပ်ချက်ကလည်း ထောက်ခံထားသည်)' : ''}။`;
  }
  // 4. Worth Testing — solid upside with one or more watchpoints (e.g., Medium confidence, missing Creator Count, or moderate commission/competition)
  else {
    verdict = 'worth-testing';
    const watchNotesEn: string[] = [];
    const watchNotesMy: string[] = [];
    if (evaluation.confidenceLevel !== 'High') {
      watchNotesEn.push(`${evaluation.confidenceLevel} data confidence`);
      watchNotesMy.push(`ဒေတာယုံကြည်မှု ${evaluation.confidenceLevel} အဆင့်`);
    }
    if (!hasVerifiedCommission) {
      watchNotesEn.push('unverified commission');
      watchNotesMy.push('Commission အတည်မပြုရသေး');
    }
    if (creatorCount === null) {
      watchNotesEn.push('Creator Count missing');
      watchNotesMy.push('Creator Count မပါဝင်သေး');
    }
    if (competitionScore !== null && competitionScore < 45) {
      watchNotesEn.push('elevated competition');
      watchNotesMy.push('ပြိုင်ဆိုင်မှုမြင့်မား');
    }

    reasonEn = `Promising opportunity (${evaluation.totalScore}/100) suitable for a small creative test${watchNotesEn.length > 0 ? `, while monitoring ${watchNotesEn.join(' and ')}` : ''}.`;
    reasonMy = `အလားအလာကောင်းသော Product (${evaluation.totalScore}/100) ဖြစ်၍ စမ်းသပ်ကြော်ငြာရန် သင့်တော်ပါသည်${watchNotesMy.length > 0 ? ` (${watchNotesMy.join('၊ ')} ကို စောင့်ကြည့်ပါ)` : ''}။`;
  }

  return {
    verdict,
    reasonEn,
    reasonMy,
    cautionsEn: cautionsEn.slice(0, 3),
    cautionsMy: cautionsMy.slice(0, 3),
    signalsUsed: {
      totalScore: evaluation.totalScore,
      confidenceLevel: evaluation.confidenceLevel,
      confidencePct: evaluation.confidencePct,
      salesScore,
      revenueScore,
      commissionScore,
      competitionScore,
      aiVerdict,
    },
  };
}

/**
 * Extracts numeric sort value for a product across all 8 Phase 5 sort fields.
 * Returns null strictly when underlying data is Unavailable (so missing values sort to bottom, never as 0).
 */
export function getProductSortValue(
  product: ResearchProduct,
  evaluation: OpportunityEvaluation,
  field: ProductSortField
): number | null {
  const m = product.kalodataMetrics;

  switch (field) {
    case 'overallScore':
      return evaluation.totalScore;
    case 'salesPerformance': {
      if (typeof m?.salesVolume === 'number' && Number.isFinite(m.salesVolume) && m.salesVolume >= 0) {
        return m.salesVolume;
      }
      return getAvailableCriterionScore(evaluation, 'salesPerformance');
    }
    case 'revenuePerformance': {
      if (typeof m?.revenueThb === 'number' && Number.isFinite(m.revenueThb) && m.revenueThb >= 0) {
        return m.revenueThb;
      }
      return getAvailableCriterionScore(evaluation, 'revenuePerformance');
    }
    case 'revenueGrowth': {
      if (typeof m?.revenueGrowthRate === 'number' && Number.isFinite(m.revenueGrowthRate)) {
        return m.revenueGrowthRate;
      }
      return getAvailableCriterionScore(evaluation, 'revenueGrowth');
    }
    case 'commissionPotential': {
      const commScore = getAvailableCriterionScore(evaluation, 'commissionPotential');
      if (commScore !== null) return commScore;
      if (
        product.commissionVerified &&
        typeof product.commissionRate === 'number' &&
        product.commissionRate > 0
      ) {
        return product.commissionRate;
      }
      return null;
    }
    case 'competition': {
      // Strictly null when Creator Count / Competition factor is unavailable
      if (isCompetitionUnavailable(product, evaluation)) return null;
      return getAvailableCriterionScore(evaluation, 'competition');
    }
    case 'aiContentSuitability': {
      return getAvailableCriterionScore(evaluation, 'aiContentSuitability');
    }
    case 'dataConfidence': {
      return CONFIDENCE_RANK[evaluation.confidenceLevel] * 1000 + evaluation.confidencePct;
    }
    default:
      return evaluation.totalScore;
  }
}

/**
 * Phase 5 Requirement #1 — Product Ranking & Sorting across all 8 criteria (Highest & Lowest).
 * Missing/Unavailable values always sink to the bottom so Unavailable is never ranked as "Lowest".
 */
export function sortProductsByField(
  products: readonly ResearchProduct[],
  evaluations: Map<string, OpportunityEvaluation>,
  field: ProductSortField,
  direction: SortDirection
): ResearchProduct[] {
  return [...products].sort((a, b) => {
    const evalA = evaluations.get(a.id) ?? evaluateProductOpportunity(a);
    const evalB = evaluations.get(b.id) ?? evaluateProductOpportunity(b);

    const valA = getProductSortValue(a, evalA, field);
    const valB = getProductSortValue(b, evalB, field);

    // Unavailable always sinks to the bottom regardless of asc/desc
    if (valA === null && valB === null) {
      return evalB.totalScore - evalA.totalScore || evalB.confidencePct - evalA.confidencePct;
    }
    if (valA === null) return 1;
    if (valB === null) return -1;

    if (valA !== valB) {
      return direction === 'desc' ? valB - valA : valA - valB;
    }

    // Deterministic tie-breakers
    return (
      evalB.totalScore - evalA.totalScore ||
      evalB.confidencePct - evalA.confidencePct ||
      a.name.localeCompare(b.name)
    );
  });
}

/**
 * Phase 5 Requirement #6 — Multi-Criteria Product Filtering (all 9 filters combinable simultaneously).
 */
export function filterProducts(
  products: readonly ResearchProduct[],
  evaluations: Map<string, OpportunityEvaluation>,
  filters: ProductResultsFilterState,
  decisions?: Map<string, ProductDecisionSummary>
): ResearchProduct[] {
  return products.filter((product) => {
    const evaluation = evaluations.get(product.id) ?? evaluateProductOpportunity(product);
    const decision =
      decisions?.get(product.id) ?? deriveProductDecisionSummary(product, evaluation);

    // 1. Product Category
    if (filters.category !== 'all' && product.category !== filters.category) {
      return false;
    }

    // 2. Score Range
    if (filters.scoreRange === '80+' && evaluation.totalScore < 80) return false;
    if (
      filters.scoreRange === '65-79' &&
      (evaluation.totalScore < 65 || evaluation.totalScore >= 80)
    ) {
      return false;
    }
    if (filters.scoreRange === 'under-65' && evaluation.totalScore >= 65) return false;

    // 3. Recommendation Tier (Decision Verdict)
    if (
      filters.recommendationTier !== 'all' &&
      decision.verdict !== filters.recommendationTier
    ) {
      return false;
    }

    // 4. Data Confidence
    if (
      filters.confidenceLevel !== 'all' &&
      evaluation.confidenceLevel !== filters.confidenceLevel
    ) {
      return false;
    }

    // 5. Competition Level (strictly separates Unavailable from Low/Moderate/High)
    if (filters.competitionLevel !== 'all') {
      const compUnavail = isCompetitionUnavailable(product, evaluation);
      if (filters.competitionLevel === 'unavailable') {
        if (!compUnavail) return false;
      } else {
        if (compUnavail) return false;
        if (product.competitionLevel !== filters.competitionLevel) return false;
      }
    }

    // 6. Sales Performance
    if (filters.salesPerformance !== 'all') {
      const salesScore = getAvailableCriterionScore(evaluation, 'salesPerformance');
      if (filters.salesPerformance === 'unavailable') {
        if (salesScore !== null) return false;
      } else if (salesScore === null) {
        return false;
      } else if (filters.salesPerformance === 'strong' && salesScore < 70) {
        return false;
      } else if (
        filters.salesPerformance === 'moderate' &&
        (salesScore < 45 || salesScore >= 70)
      ) {
        return false;
      } else if (filters.salesPerformance === 'low' && salesScore >= 45) {
        return false;
      }
    }

    // 7. Commission Potential
    if (filters.commissionPotential !== 'all') {
      const commScore = getAvailableCriterionScore(evaluation, 'commissionPotential');
      if (filters.commissionPotential === 'unavailable') {
        if (commScore !== null) return false;
      } else if (commScore === null) {
        return false;
      } else if (filters.commissionPotential === 'high' && commScore < 70) {
        return false;
      } else if (
        filters.commissionPotential === 'medium' &&
        (commScore < 45 || commScore >= 70)
      ) {
        return false;
      } else if (filters.commissionPotential === 'low' && commScore >= 45) {
        return false;
      }
    }

    // 8. Research Mode
    if (filters.researchMode !== 'all') {
      const mode = product.researchMode ?? product.kalodataMetrics?.researchMode ?? 'fast';
      if (mode !== filters.researchMode) return false;
    }

    // 9. AI Content Suitability
    if (filters.aiContentSuitability !== 'all') {
      const band = getEffectiveAiSuitabilityBand(product, evaluation);
      if (band !== filters.aiContentSuitability) return false;
    }

    return true;
  });
}

/**
 * Phase 5 Requirement #3 — Best Product Selection across 6 categories.
 * Strictly guards against marking a product as "Best" when required data is missing or insufficient.
 */
export function computeBestProductSelections(
  products: readonly ResearchProduct[],
  evaluations: Map<string, OpportunityEvaluation>
): BestProductSelectionItem[] {
  const entries = products.map((product) => {
    const evaluation = evaluations.get(product.id) ?? evaluateProductOpportunity(product);
    const decision = deriveProductDecisionSummary(product, evaluation);
    return { product, evaluation, decision };
  });

  const makeInsufficient = (
    category: BestSelectionCategory,
    reasonEn: string,
    reasonMy: string
  ): BestProductSelectionItem => ({
    category,
    product: null,
    canonicalProductId: null,
    metricSummaryEn: 'Insufficient data',
    metricSummaryMy: 'အချက်အလက် မပြည့်စုံပါ',
    reasonEn,
    reasonMy,
    insufficientData: true,
    insufficientReasonEn: reasonEn,
    insufficientReasonMy: reasonMy,
  });

  // 1. Best Overall (requires Medium/High confidence, >=4 verified criteria, score >= 65)
  const overallEligible = entries
    .filter(
      (e) =>
        e.evaluation.confidenceLevel !== 'Low' &&
        e.evaluation.verifiedCount >= 4 &&
        e.evaluation.totalScore >= 65 &&
        e.decision.verdict !== 'not-recommended'
    )
    .sort(
      (a, b) =>
        b.evaluation.totalScore - a.evaluation.totalScore ||
        b.evaluation.confidencePct - a.evaluation.confidencePct
    );

  const bestOverall: BestProductSelectionItem =
    overallEligible.length > 0
      ? (() => {
          const top = overallEligible[0];
          return {
            category: 'bestOverall',
            product: top.product,
            canonicalProductId: getCanonicalProductId(top.product),
            metricSummaryEn: `${top.evaluation.totalScore}/100 · ${top.evaluation.confidenceLevel} (${top.evaluation.confidencePct}%)`,
            metricSummaryMy: `${top.evaluation.totalScore}/100 · ${top.evaluation.confidenceLevel} (${top.evaluation.confidencePct}%)`,
            reasonEn: `Highest overall score (${top.evaluation.totalScore}/100) backed by ${top.evaluation.verifiedCount}/${top.evaluation.totalCriteria} verified factors under the current Strategy Slider.`,
            reasonMy: `လက်ရှိ Strategy Slider အရ အမှတ်အမြင့်ဆုံး (${top.evaluation.totalScore}/100) ဖြစ်ပြီး အတည်ပြုပြီးအချက် ${top.evaluation.verifiedCount}/${top.evaluation.totalCriteria} ခုဖြင့် ထောက်ခံထားသည်။`,
            insufficientData: false,
          };
        })()
      : makeInsufficient(
          'bestOverall',
          'No product currently has enough verified data (≥4 verified factors and Medium/High confidence) to safely declare Best Overall.',
          'လက်ရှိရလဒ်များတွင် အတည်ပြုဒေတာ (အနည်းဆုံး ၄ ချက်နှင့် Medium/High Confidence) လုံလောက်သည့် Product မရှိသေးသဖြင့် Best Overall မသတ်မှတ်ပါ။'
        );

  // 2. Best Sales Potential (requires verified Kalodata sales or revenue)
  const salesEligible = entries
    .filter((e) => {
      const s = getCriterion(e.evaluation, 'salesPerformance');
      const r = getCriterion(e.evaluation, 'revenuePerformance');
      return (
        (s?.verification === 'verified' && (s.normalizedScore ?? 0) >= 50) ||
        (r?.verification === 'verified' && (r.normalizedScore ?? 0) >= 50)
      );
    })
    .sort((a, b) => {
      const sa =
        (getAvailableCriterionScore(a.evaluation, 'salesPerformance') ?? 0) * 0.55 +
        (getAvailableCriterionScore(a.evaluation, 'revenuePerformance') ?? 0) * 0.45;
      const sb =
        (getAvailableCriterionScore(b.evaluation, 'salesPerformance') ?? 0) * 0.55 +
        (getAvailableCriterionScore(b.evaluation, 'revenuePerformance') ?? 0) * 0.45;
      return sb - sa || (b.product.kalodataMetrics?.salesVolume ?? 0) - (a.product.kalodataMetrics?.salesVolume ?? 0);
    });

  const bestSalesPotential: BestProductSelectionItem =
    salesEligible.length > 0
      ? (() => {
          const top = salesEligible[0];
          const sales = top.product.kalodataMetrics?.salesVolume;
          const rev = top.product.kalodataMetrics?.revenueThb;
          const partsEn: string[] = [];
          const partsMy: string[] = [];
          if (typeof sales === 'number') {
            partsEn.push(`${sales.toLocaleString('en-US')} units`);
            partsMy.push(`${sales.toLocaleString('en-US')} ခု`);
          }
          if (typeof rev === 'number') {
            partsEn.push(formatThbCompact(rev));
            partsMy.push(formatThbCompact(rev));
          }
          return {
            category: 'bestSalesPotential',
            product: top.product,
            canonicalProductId: getCanonicalProductId(top.product),
            metricSummaryEn: partsEn.join(' · ') || 'Verified sales leader',
            metricSummaryMy: partsMy.join(' · ') || 'ရောင်းအားအကောင်းဆုံး',
            reasonEn: `Leads the batch in verified Kalodata sales & THB GMV momentum (${partsEn.join(', ')}).`,
            reasonMy: `Kalodata အတည်ပြု ရောင်းအားနှင့် ဝင်ငွေအမြင့်ဆုံးဖြစ်သည် (${partsMy.join(' · ')})။`,
            insufficientData: false,
          };
        })()
      : makeInsufficient(
          'bestSalesPotential',
          'Verified Kalodata sales and revenue metrics are insufficient across the current list.',
          'လက်ရှိစာရင်းတွင် အတည်ပြုပြီး Kalodata ရောင်းအားနှင့် ဝင်ငွေဒေတာ မလုံလောက်သေးပါ။'
        );

  // 3. Best Commission Potential (requires verified commission rate > 0)
  const commEligible = entries
    .filter((e) => {
      const c = getCriterion(e.evaluation, 'commissionPotential');
      return c?.verification === 'verified' && (c.normalizedScore ?? 0) >= 45;
    })
    .sort((a, b) => {
      const ca = getAvailableCriterionScore(a.evaluation, 'commissionPotential') ?? 0;
      const cb = getAvailableCriterionScore(b.evaluation, 'commissionPotential') ?? 0;
      return (
        cb - ca ||
        (b.product.commissionRate ?? 0) - (a.product.commissionRate ?? 0)
      );
    });

  const bestCommissionPotential: BestProductSelectionItem =
    commEligible.length > 0
      ? (() => {
          const top = commEligible[0];
          const rate =
            top.product.commissionRate ?? top.product.kalodataMetrics?.commissionRatePct ?? null;
          const price = top.product.priceThb ?? top.product.kalodataMetrics?.unitPriceThb ?? null;
          const earning =
            top.product.estimatedCommissionPerSaleThb ??
            (rate !== null && price !== null && price > 0
              ? Math.round((price * rate) / 100)
              : null);
          const metric =
            rate !== null
              ? `${rate}%${earning !== null ? ` (~${formatThbCompact(earning)}/sale)` : ''}`
              : 'Verified';
          return {
            category: 'bestCommissionPotential',
            product: top.product,
            canonicalProductId: getCanonicalProductId(top.product),
            metricSummaryEn: metric,
            metricSummaryMy:
              rate !== null
                ? `${rate}%${earning !== null ? ` (~${formatThbCompact(earning)}/ခု)` : ''}`
                : 'အတည်ပြုပြီး',
            reasonEn: `Offers the strongest verified affiliate commission return (${metric}) in the current set.`,
            reasonMy: `လက်ရှိရလဒ်များထဲတွင် အတည်ပြု Affiliate Commission အကျိုးအမြတ် အမြင့်ဆုံးဖြစ်သည် (${metric})။`,
            insufficientData: false,
          };
        })()
      : makeInsufficient(
          'bestCommissionPotential',
          'No product in this list has a verified affiliate commission rate strong enough to select Best Commission.',
          'လက်ရှိစာရင်းတွင် အတည်ပြုပြီး Affiliate Commission ဒေတာ လုံလောက်သည့် Product မရှိသေးပါ။'
        );

  // 4. Lowest Competition (STRICT: requires verified Kalodata Creator Count & viable demand — NEVER selects Unavailable!)
  const compEligible = entries
    .filter((e) => {
      const c = getCriterion(e.evaluation, 'competition');
      const creators = e.product.kalodataMetrics?.creatorNumber;
      const sales = e.product.kalodataMetrics?.salesVolume ?? 0;
      const rev = e.product.kalodataMetrics?.revenueThb ?? 0;
      return (
        c?.verification === 'verified' &&
        c.normalizedScore !== null &&
        c.normalizedScore >= 50 &&
        typeof creators === 'number' &&
        Number.isFinite(creators) &&
        creators >= 0 &&
        (sales > 0 || rev > 0)
      );
    })
    .sort((a, b) => {
      const creatorsA = a.product.kalodataMetrics?.creatorNumber ?? Number.POSITIVE_INFINITY;
      const creatorsB = b.product.kalodataMetrics?.creatorNumber ?? Number.POSITIVE_INFINITY;
      const scoreA = getAvailableCriterionScore(a.evaluation, 'competition') ?? 0;
      const scoreB = getAvailableCriterionScore(b.evaluation, 'competition') ?? 0;
      return creatorsA - creatorsB || scoreB - scoreA || b.evaluation.totalScore - a.evaluation.totalScore;
    });

  const lowestCompetition: BestProductSelectionItem =
    compEligible.length > 0
      ? (() => {
          const top = compEligible[0];
          const creators = top.product.kalodataMetrics!.creatorNumber!;
          return {
            category: 'lowestCompetition',
            product: top.product,
            canonicalProductId: getCanonicalProductId(top.product),
            metricSummaryEn: `${creators.toLocaleString('en-US')} creators · ${top.product.competitionLevel}`,
            metricSummaryMy: `Creator ${creators.toLocaleString('en-US')} ဦး · ${top.product.competitionLevel}`,
            reasonEn: `Best creator-to-demand balance with verified Kalodata Creator Count (${creators.toLocaleString('en-US')} active creators).`,
            reasonMy: `Kalodata အတည်ပြု Creator ${creators.toLocaleString('en-US')} ဦးဖြင့် ပြိုင်ဆိုင်မှုအသက်သာဆုံးနှင့် ဝယ်လိုအားအချိုး အကောင်းဆုံးဖြစ်သည်။`,
            insufficientData: false,
          };
        })()
      : makeInsufficient(
          'lowestCompetition',
          'Creator Count is unavailable for all visible products (Fast Mode omits Product Detail). Enrich Product Detail to evaluate real competition.',
          'လက်ရှိ Product များတွင် Creator Count မပါဝင်သေးပါ (Fast Mode တွင် Product Detail မပါပါ) — ပြိုင်ဆိုင်မှုစစ်ရန် Product Detail ဖြည့်စွက်ပါ။'
        );

  // 5. Best AI Content Potential (requires verified image + solid AI suitability score >= 62)
  const aiEligible = entries
    .filter((e) => {
      const c = getCriterion(e.evaluation, 'aiContentSuitability');
      return (
        e.product.imageVerified &&
        Boolean(e.product.imageUrl) &&
        c !== null &&
        c.verification !== 'unavailable' &&
        (c.normalizedScore ?? 0) >= 62
      );
    })
    .sort((a, b) => {
      const sa = getAvailableCriterionScore(a.evaluation, 'aiContentSuitability') ?? 0;
      const sb = getAvailableCriterionScore(b.evaluation, 'aiContentSuitability') ?? 0;
      const vidA = a.product.kalodataMetrics?.videoRevenueThb ?? 0;
      const vidB = b.product.kalodataMetrics?.videoRevenueThb ?? 0;
      return sb - sa || vidB - vidA;
    });

  const bestAiContentPotential: BestProductSelectionItem =
    aiEligible.length > 0
      ? (() => {
          const top = aiEligible[0];
          const aiScore = getAvailableCriterionScore(top.evaluation, 'aiContentSuitability') ?? 0;
          const topCatDef = getCategoryDefinition(top.product.category);
          const formatEn = topCatDef.scoringProfile.formatLabelEn;
          const formatMy = topCatDef.scoringProfile.formatLabelMy;
          return {
            category: 'bestAiContentPotential',
            product: top.product,
            canonicalProductId: getCanonicalProductId(top.product),
            metricSummaryEn: `${aiScore}/100 · ${formatEn}`,
            metricSummaryMy: `${aiScore}/100 · ${formatMy}`,
            reasonEn: `Strongest visual fit for ${formatEn} with verified reference photography and clear video conversion signals.`,
            reasonMy: `အတည်ပြုဓာတ်ပုံနှင့် Video ရောင်းအားအချက်အလက်များအရ ${formatMy} ဖန်တီးရန် အသင့်တော်ဆုံးဖြစ်သည်။`,
            insufficientData: false,
          };
        })()
      : makeInsufficient(
          'bestAiContentPotential',
          'No product currently has a verified product photo and clear visual profile sufficient to declare Best AI Content Potential.',
          'အတည်ပြုဓာတ်ပုံနှင့် AI ကြော်ငြာသင့်တော်မှု အထောက်အထား လုံလောက်သော Product မရှိသေးပါ။'
        );

  // 6. Highest Data Confidence (requires >= 60% confidence and >= 3 verified criteria)
  const confEligible = entries
    .filter((e) => e.evaluation.confidencePct >= 60 && e.evaluation.verifiedCount >= 3)
    .sort(
      (a, b) =>
        b.evaluation.confidencePct - a.evaluation.confidencePct ||
        b.evaluation.verifiedCount - a.evaluation.verifiedCount ||
        b.evaluation.totalScore - a.evaluation.totalScore
    );

  const highestDataConfidence: BestProductSelectionItem =
    confEligible.length > 0
      ? (() => {
          const top = confEligible[0];
          return {
            category: 'highestDataConfidence',
            product: top.product,
            canonicalProductId: getCanonicalProductId(top.product),
            metricSummaryEn: `${top.evaluation.confidenceLevel} (${top.evaluation.confidencePct}%) · ${top.evaluation.verifiedCount}/${top.evaluation.totalCriteria}`,
            metricSummaryMy: `${top.evaluation.confidenceLevel} (${top.evaluation.confidencePct}%) · ${top.evaluation.verifiedCount}/${top.evaluation.totalCriteria}`,
            reasonEn: `Most complete verified Kalodata dataset (${top.evaluation.verifiedCount}/${top.evaluation.totalCriteria} verified factors, ${top.evaluation.unavailableCount} missing).`,
            reasonMy: `Kalodata အတည်ပြုဒေတာ အပြည့်စုံဆုံးဖြစ်သည် (အတည်ပြုပြီး ${top.evaluation.verifiedCount}/${top.evaluation.totalCriteria} ချက်၊ မပြည့်စုံ ${top.evaluation.unavailableCount} ချက်)။`,
            insufficientData: false,
          };
        })()
      : makeInsufficient(
          'highestDataConfidence',
          'All visible products currently have low data coverage (<60% confidence). Enrich Product & Shop Detail to raise confidence.',
          'လက်ရှိ Product များအားလုံး ဒေတာပြည့်စုံမှု ၆၀% အောက်ဖြစ်နေသဖြင့် Product & Shop Detail ထပ်ဖြည့်ရန် လိုအပ်ပါသည်။'
        );

  return [
    bestOverall,
    bestSalesPotential,
    bestCommissionPotential,
    lowestCompetition,
    bestAiContentPotential,
    highestDataConfidence,
  ];
}

export interface ProductComparisonColumn {
  item: ComparisonSelectionItem;
  evaluation: OpportunityEvaluation;
  decision: ProductDecisionSummary;
  aiAnalysis: AiProductAnalysis | null;
}

export interface ProductComparisonMatrixRow {
  key: string;
  labelEn: string;
  labelMy: string;
  valuesEn: string[];
  valuesMy: string[];
  isDifferent: boolean;
  isNumeric?: boolean;
}

export interface ProductComparisonMatrix {
  columns: ProductComparisonColumn[];
  hasDistinctProductIds: boolean;
  distinctProductIdCount: number;
  rows: ProductComparisonMatrixRow[];
}

/**
 * Phase 5 Requirement #2 — Multi-Product Side-by-Side Comparison Matrix.
 * - Never turns missing data into 0 (strictly 'Unavailable').
 * - Never merges or treats different Product IDs as the same product.
 * - Explicitly flags rows where values differ across selected products.
 */
export function buildProductComparisonMatrix(
  items: readonly ComparisonSelectionItem[],
  salesWeightPct = 50
): ProductComparisonMatrix {
  const peerProducts = items.map((i) => i.product);
  const columns: ProductComparisonColumn[] = items.map((item) => {
    const evaluation = evaluateProductOpportunity(item.product, {
      salesWeightPct,
      peerProducts,
    });
    const aiAnalysis = resolveEffectiveAiAnalysis(item.product);
    const decision = deriveProductDecisionSummary(item.product, evaluation, aiAnalysis);
    return { item, evaluation, decision, aiAnalysis };
  });

  const uniqueIds = new Set(columns.map((c) => c.item.canonicalProductId));
  const distinctProductIdCount = uniqueIds.size;
  const hasDistinctProductIds = distinctProductIdCount > 1;

  const makeRow = (
    key: string,
    labelEn: string,
    labelMy: string,
    extractor: (col: ProductComparisonColumn) => { en: string; my: string },
    isNumeric = false
  ): ProductComparisonMatrixRow => {
    const pairs = columns.map(extractor);
    const valuesEn = pairs.map((p) => p.en);
    const valuesMy = pairs.map((p) => p.my);
    const normalizedSet = new Set(valuesEn.map((v) => v.trim().toLowerCase()));
    return {
      key,
      labelEn,
      labelMy,
      valuesEn,
      valuesMy,
      isDifferent: columns.length > 1 && normalizedSet.size > 1,
      isNumeric,
    };
  };

  const DECISION_EN: Record<ProductDecisionVerdict, string> = {
    recommended: 'Recommended',
    'worth-testing': 'Worth Testing',
    'need-more-data': 'Need More Data',
    'not-recommended': 'Not Recommended',
  };
  const DECISION_MY: Record<ProductDecisionVerdict, string> = {
    recommended: 'ရွေးချယ်သင့်သည် (Recommended)',
    'worth-testing': 'စမ်းသပ်သင့်သည် (Worth Testing)',
    'need-more-data': 'ဒေတာထပ်လိုသည် (Need More Data)',
    'not-recommended': 'မရွေးချယ်သင့်ပါ (Not Recommended)',
  };

  const rows: ProductComparisonMatrixRow[] = [
    makeRow('productId', 'Product ID', 'Product ID', (c) => ({
      en: c.item.canonicalProductId,
      my: c.item.canonicalProductId,
    })),
    makeRow(
      'price',
      'Price (THB)',
      'ဈေးနှုန်း (THB)',
      (c) => {
        const p = c.item.product.priceThb;
        const minP = c.item.product.kalodataMetrics?.minPriceThb;
        const maxP = c.item.product.kalodataMetrics?.maxPriceThb;
        if (typeof p === 'number' && p > 0) {
          const range =
            typeof minP === 'number' && typeof maxP === 'number' && maxP > minP
              ? ` (${formatThbCompact(minP)}–${formatThbCompact(maxP)})`
              : '';
          return { en: `${formatThbCompact(p)}${range}`, my: `${formatThbCompact(p)}${range}` };
        }
        return { en: 'Unavailable', my: 'Unavailable' };
      },
      true
    ),
    makeRow(
      'totalScore',
      'Total Score & Decision',
      'စုစုပေါင်းအမှတ်နှင့် ဆုံးဖြတ်ချက်',
      (c) => ({
        en: `${c.evaluation.totalScore}/100 · ${DECISION_EN[c.decision.verdict]}`,
        my: `${c.evaluation.totalScore}/100 · ${DECISION_MY[c.decision.verdict]}`,
      }),
      true
    ),
    makeRow(
      'sales',
      'Sales Volume',
      'ရောင်းအား (Units)',
      (c) => {
        const s = c.item.product.kalodataMetrics?.salesVolume;
        if (typeof s === 'number' && Number.isFinite(s) && s >= 0) {
          const range = c.item.product.kalodataMetrics?.dateRange ?? '';
          return {
            en: `${s.toLocaleString('en-US')} units${range ? ` (${range})` : ''}`,
            my: `${s.toLocaleString('en-US')} ခု${range ? ` (${range})` : ''}`,
          };
        }
        return { en: 'Unavailable', my: 'Unavailable' };
      },
      true
    ),
    makeRow(
      'revenue',
      'Revenue (THB GMV)',
      'ရောင်းချဝင်ငွေ (THB)',
      (c) => {
        const r = c.item.product.kalodataMetrics?.revenueThb;
        if (typeof r === 'number' && Number.isFinite(r) && r >= 0) {
          return { en: formatThbCompact(r), my: formatThbCompact(r) };
        }
        return { en: 'Unavailable', my: 'Unavailable' };
      },
      true
    ),
    makeRow(
      'revenueGrowth',
      'Revenue Growth',
      'ဝင်ငွေတိုးတက်နှုန်း',
      (c) => {
        const g = c.item.product.kalodataMetrics?.revenueGrowthRate;
        if (typeof g === 'number' && Number.isFinite(g)) {
          const s = `${g >= 0 ? '+' : ''}${g.toFixed(1)}%`;
          return { en: s, my: s };
        }
        return { en: 'Unavailable', my: 'Unavailable' };
      },
      true
    ),
    makeRow(
      'commission',
      'Affiliate Commission',
      'Affiliate Commission',
      (c) => {
        const p = c.item.product;
        const rate =
          p.commissionVerified && typeof p.commissionRate === 'number' && p.commissionRate > 0
            ? p.commissionRate
            : typeof p.kalodataMetrics?.commissionRatePct === 'number' &&
                p.kalodataMetrics.commissionRatePct > 0
              ? p.kalodataMetrics.commissionRatePct
              : null;
        if (rate === null) return { en: 'Unavailable', my: 'Unavailable' };
        const earn =
          p.estimatedCommissionPerSaleThb ??
          (typeof p.priceThb === 'number' && p.priceThb > 0
            ? Math.round((p.priceThb * rate) / 100)
            : null);
        return {
          en: `${rate}%${earn !== null ? ` (~${formatThbCompact(earn)}/sale)` : ''}`,
          my: `${rate}%${earn !== null ? ` (~${formatThbCompact(earn)}/ခု)` : ''}`,
        };
      },
      true
    ),
    makeRow(
      'competition',
      'Creator Count & Competition',
      'Creator အရေအတွက်နှင့် ပြိုင်ဆိုင်မှု',
      (c) => {
        const creators = c.item.product.kalodataMetrics?.creatorNumber;
        if (typeof creators !== 'number' || !Number.isFinite(creators) || creators < 0) {
          return { en: 'Unavailable', my: 'Unavailable' };
        }
        return {
          en: `${creators.toLocaleString('en-US')} creators · ${c.item.product.competitionLevel}`,
          my: `Creator ${creators.toLocaleString('en-US')} ဦး · ${c.item.product.competitionLevel}`,
        };
      },
      true
    ),
    makeRow(
      'shopGmv',
      'Shop GMV & Type',
      'ဆိုင် GMV နှင့် အမျိုးအစား',
      (c) => {
        const m = c.item.product.kalodataMetrics;
        const gmv = m?.shopRevenueThb;
        const type = m?.shopSellerType;
        if (typeof gmv !== 'number' || !Number.isFinite(gmv) || gmv < 0) {
          return {
            en: type ? `${type} · GMV Unavailable` : 'Unavailable',
            my: type ? `${type} · GMV Unavailable` : 'Unavailable',
          };
        }
        return {
          en: `${formatThbCompact(gmv)}${type ? ` (${type})` : ''}`,
          my: `${formatThbCompact(gmv)}${type ? ` (${type})` : ''}`,
        };
      },
      true
    ),
    makeRow(
      'shopAffiliateGmv',
      'Shop Affiliate GMV',
      'ဆိုင် Affiliate GMV',
      (c) => {
        const affGmv = c.item.product.kalodataMetrics?.shopAffiliateRevenueThb;
        if (typeof affGmv !== 'number' || !Number.isFinite(affGmv) || affGmv < 0) {
          return { en: 'Unavailable', my: 'Unavailable' };
        }
        return { en: formatThbCompact(affGmv), my: formatThbCompact(affGmv) };
      },
      true
    ),
    makeRow('reviewInsights', 'Review Insights & Rating', 'Review Insights နှင့် Rating', (c) => {
      const p = c.item.product;
      const ri = p.kalodataMetrics?.reviewInsight;
      const partsEn: string[] = [];
      const partsMy: string[] = [];
      if (typeof p.customerRating === 'number' && p.customerRating > 0) {
        partsEn.push(`${p.customerRating.toFixed(1)}/5.0`);
        partsMy.push(`${p.customerRating.toFixed(1)}/5.0`);
      }
      if (typeof p.reviewCount === 'number' && p.reviewCount > 0) {
        partsEn.push(`${p.reviewCount.toLocaleString('en-US')} reviews`);
        partsMy.push(`Review ${p.reviewCount.toLocaleString('en-US')} ခု`);
      }
      if (ri && (ri.positivePoints.length > 0 || ri.painPoints.length > 0)) {
        const likes = ri.positivePoints
          .slice(0, 2)
          .map((x) => x.point)
          .join(', ');
        const pains = ri.painPoints
          .slice(0, 1)
          .map((x) => x.point)
          .join(', ');
        if (likes) {
          partsEn.push(`Likes: ${likes}`);
          partsMy.push(`နှစ်သက်: ${likes}`);
        }
        if (pains) {
          partsEn.push(`Watch: ${pains}`);
          partsMy.push(`သတိပြု: ${pains}`);
        }
      }
      if (partsEn.length === 0) return { en: 'Unavailable', my: 'Unavailable' };
      return { en: partsEn.join(' · '), my: partsMy.join(' · ') };
    }),
    makeRow('aiSuitability', 'AI Content Suitability', 'AI ကြော်ငြာ သင့်တော်မှု', (c) => {
      const band = getEffectiveAiSuitabilityBand(c.item.product, c.evaluation);
      const aiScore = getAvailableCriterionScore(c.evaluation, 'aiContentSuitability');
      const formatEn =
        c.item.product.category === 'womens-fashion'
          ? 'Virtual Female Model'
          : 'Product-Only 3D';
      const formatMy =
        c.item.product.category === 'womens-fashion'
          ? 'AI Virtual Female Model'
          : 'Product-Only 3D';
      if (aiScore === null) return { en: 'Unavailable', my: 'Unavailable' };
      return {
        en: `${band} (${aiScore}/100) · ${formatEn}`,
        my: `${band} (${aiScore}/100) · ${formatMy}`,
      };
    }),
    makeRow(
      'dataConfidence',
      'Data Confidence',
      'ဒေတာယုံကြည်စိတ်ချရမှု',
      (c) => ({
        en: `${c.evaluation.confidenceLevel} (${c.evaluation.confidencePct}%) · ${c.evaluation.verifiedCount}/${c.evaluation.totalCriteria} verified`,
        my: `${c.evaluation.confidenceLevel} (${c.evaluation.confidencePct}%) · အတည်ပြု ${c.evaluation.verifiedCount}/${c.evaluation.totalCriteria}`,
      }),
      true
    ),
    makeRow('strengths', 'Main Strengths', 'အဓိက အားသာချက်များ', (c) => {
      const en =
        c.aiAnalysis?.strengthsEn.slice(0, 2) ??
        c.evaluation.strengthsEn.slice(0, 2);
      const my =
        c.aiAnalysis?.strengthsMy.slice(0, 2) ??
        c.evaluation.strengthsMy.slice(0, 2);
      if (en.length === 0) return { en: 'Unavailable', my: 'Unavailable' };
      return { en: en.join(' · '), my: my.join(' · ') };
    }),
    makeRow('weaknesses', 'Main Weaknesses', 'အဓိက အားနည်းချက်များ', (c) => {
      const en =
        c.aiAnalysis?.weaknessesEn.slice(0, 2) ??
        c.evaluation.weaknessesEn.slice(0, 2);
      const my =
        c.aiAnalysis?.weaknessesMy.slice(0, 2) ??
        c.evaluation.weaknessesMy.slice(0, 2);
      if (en.length === 0) return { en: 'Unavailable', my: 'Unavailable' };
      return { en: en.join(' · '), my: my.join(' · ') };
    }),
    makeRow('risks', 'Key Risks', 'အဓိက အန္တရာယ်များ', (c) => {
      const en =
        c.aiAnalysis?.risksAndDrawbacksEn.slice(0, 2) ??
        c.evaluation.risksEn.slice(0, 2);
      const my =
        c.aiAnalysis?.risksAndDrawbacksMy.slice(0, 2) ??
        c.evaluation.risksMy.slice(0, 2);
      if (en.length === 0) return { en: 'Unavailable', my: 'Unavailable' };
      return { en: en.join(' · '), my: my.join(' · ') };
    }),
  ];

  return {
    columns,
    hasDistinctProductIds,
    distinctProductIdCount,
    rows,
  };
}
