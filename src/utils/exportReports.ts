import type {
  AiProductAnalysis,
  Language,
  OpportunityEvaluation,
  ProductDecisionSummary,
  ResearchProduct,
} from '../types/product.ts';
import {
  evaluateProductOpportunity,
  getCanonicalProductId,
} from './scoring.ts';
import {
  deriveProductDecisionSummary,
  getEffectiveAiSuitabilityBand,
  isCompetitionUnavailable,
  resolveEffectiveAiAnalysis,
} from './productAnalytics.ts';
import { formatThb } from './format.ts';

const SECRET_KEY_PATTERN =
  /api[_-]?key|secret|token|authorization|cookie|password|credential|private[_-]?key/i;

/**
 * Defensive deep scrubber ensuring NO API keys, tokens, or secret-like keys
 * can ever leak into exported JSON/CSV artifacts.
 */
function stripSensitiveKeys<T>(input: T): T {
  if (input === null || input === undefined || typeof input !== 'object') {
    return input;
  }
  if (Array.isArray(input)) {
    return input.map((item) => stripSensitiveKeys(item)) as unknown as T;
  }
  const clean: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(input as Record<string, unknown>)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      continue;
    }
    clean[key] = stripSensitiveKeys(val);
  }
  return clean as T;
}

/**
 * Escapes CSV cell values safely and neutralizes spreadsheet formula injection
 * (=, +, @, or - followed by non-numeric formula text) while preserving numeric signs like -12.5%.
 */
export function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return 'Unavailable';
  }
  let text = String(value).replace(/\r?\n/g, ' ').trim();
  if (!text) return 'Unavailable';

  const startsDangerousFormula =
    /^[=+@\t\r]/.test(text) || (/^-/.test(text) && !/^-\d+(\.\d+)?%?$/.test(text));
  if (startsDangerousFormula) {
    text = `'${text}`;
  }

  if (/[",]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function unavailableOr<T>(value: T | null | undefined, formatter?: (v: T) => string): string {
  if (value === null || value === undefined) return 'Unavailable';
  if (typeof value === 'number' && !Number.isFinite(value)) return 'Unavailable';
  if (typeof value === 'string' && !value.trim()) return 'Unavailable';
  return formatter ? formatter(value) : String(value);
}

const DECISION_LABELS_EN = {
  recommended: 'Recommended',
  'worth-testing': 'Worth Testing',
  'need-more-data': 'Need More Data',
  'not-recommended': 'Not Recommended',
} as const;

const DECISION_LABELS_MY = {
  recommended: 'ရွေးချယ်သင့်သည် (Recommended)',
  'worth-testing': 'စမ်းသပ်သင့်သည် (Worth Testing)',
  'need-more-data': 'ဒေတာထပ်လိုသည် (Need More Data)',
  'not-recommended': 'မရွေးချယ်သင့်ပါ (Not Recommended)',
} as const;

export interface ExportContextOptions {
  salesWeightPct: number;
  exportTitle?: string;
  language?: Language;
  evaluations?: Map<string, OpportunityEvaluation>;
  researchDate?: string | null;
}

/**
 * Phase 5 Requirement #7 — Structured JSON export with explicit 'Unavailable' markers
 * and zero secrets/API keys. Includes Product Data, Score Breakdown, AI Analysis,
 * Enrichment Data, Data Confidence, and Source Information.
 */
export function buildProductsExportJson(
  products: readonly ResearchProduct[],
  options: ExportContextOptions
): string {
  const exportedAt = new Date().toISOString();
  const payload = {
    app: 'SiamPick',
    market: 'Thailand TikTok Shop',
    currency: 'THB',
    exportTitle: options.exportTitle ?? 'SiamPick Product Research Export',
    exportedAt,
    strategy: {
      salesWeightPct: options.salesWeightPct,
      commissionWeightPct: 100 - options.salesWeightPct,
    },
    productCount: products.length,
    items: products.map((product) => {
      const evaluation =
        options.evaluations?.get(product.id) ??
        evaluateProductOpportunity(product, {
          salesWeightPct: options.salesWeightPct,
          peerProducts: products,
        });
      const aiAnalysis = resolveEffectiveAiAnalysis(product);
      const decision = deriveProductDecisionSummary(product, evaluation, aiAnalysis);
      const m = product.kalodataMetrics;
      const compUnavail = isCompetitionUnavailable(product, evaluation);

      return {
        canonicalProductId: getCanonicalProductId(product),
        productData: {
          id: product.id,
          name: product.name,
          nameMy: product.nameMy,
          brand: product.brand ?? 'Unavailable',
          shopName: product.shopName || 'Unavailable',
          shopId: m?.sellerId ?? 'Unavailable',
          category: product.category,
          subCategory: product.subCategory || 'Unavailable',
          researchMode: product.researchMode ?? m?.researchMode ?? 'fast',
          dateRange: m?.dateRange ?? 'Unavailable',
          priceThb:
            typeof product.priceThb === 'number' && product.priceThb > 0
              ? product.priceThb
              : 'Unavailable',
          priceRangeThb:
            typeof m?.minPriceThb === 'number' && typeof m?.maxPriceThb === 'number'
              ? { min: m.minPriceThb, max: m.maxPriceThb }
              : 'Unavailable',
          salesVolume:
            typeof m?.salesVolume === 'number' && Number.isFinite(m.salesVolume)
              ? m.salesVolume
              : 'Unavailable',
          revenueThb:
            typeof m?.revenueThb === 'number' && Number.isFinite(m.revenueThb)
              ? m.revenueThb
              : 'Unavailable',
          revenueGrowthRatePct:
            typeof m?.revenueGrowthRate === 'number' && Number.isFinite(m.revenueGrowthRate)
              ? m.revenueGrowthRate
              : 'Unavailable',
          commissionRatePct:
            product.commissionVerified && typeof product.commissionRate === 'number'
              ? product.commissionRate
              : typeof m?.commissionRatePct === 'number' && m.commissionRatePct > 0
                ? m.commissionRatePct
                : 'Unavailable',
          estimatedCommissionPerSaleThb:
            typeof product.estimatedCommissionPerSaleThb === 'number'
              ? product.estimatedCommissionPerSaleThb
              : 'Unavailable',
          creatorCount:
            typeof m?.creatorNumber === 'number' && Number.isFinite(m.creatorNumber)
              ? m.creatorNumber
              : 'Unavailable',
          competitionLevel: compUnavail ? 'Unavailable' : product.competitionLevel,
          reviewCount:
            typeof product.reviewCount === 'number' && product.reviewCount > 0
              ? product.reviewCount
              : 'Unavailable',
          customerRating:
            typeof product.customerRating === 'number' && product.customerRating > 0
              ? product.customerRating
              : 'Unavailable',
          aiContentSuitability: getEffectiveAiSuitabilityBand(product, evaluation),
        },
        decisionSummary: {
          verdict: decision.verdict,
          labelEn: DECISION_LABELS_EN[decision.verdict],
          labelMy: DECISION_LABELS_MY[decision.verdict],
          reasonEn: decision.reasonEn,
          reasonMy: decision.reasonMy,
          cautionsEn: decision.cautionsEn,
          cautionsMy: decision.cautionsMy,
        },
        scoreBreakdown: {
          totalScore: evaluation.totalScore,
          tier: evaluation.tier,
          strategyPreset: evaluation.strategyPreset,
          salesWeightPct: evaluation.salesWeightPct,
          redistributedWeightPct: evaluation.redistributedWeightPct,
          criteria: evaluation.criteria.map((c) => ({
            key: c.key,
            baseWeight: c.baseWeight,
            effectiveWeight: c.effectiveWeight,
            normalizedScore: c.normalizedScore ?? 'Unavailable',
            earnedPoints: c.earnedPoints ?? 'Unavailable',
            verification: c.verification,
            wasRedistributed: c.wasRedistributed,
            metricDisplay: c.metricDisplayEn,
            evidenceEn: c.evidenceEn,
          })),
          strengthsEn: evaluation.strengthsEn,
          weaknessesEn: evaluation.weaknessesEn,
          risksEn: evaluation.risksEn,
        },
        enrichmentData: {
          detailEnriched: Boolean(m?.detailEnriched),
          shopEnriched: Boolean(m?.shopEnriched),
          reviewInsightEnriched: Boolean(m?.reviewInsightEnriched),
          lastEnrichedAt: m?.lastEnrichedAt ?? 'Unavailable',
          productDetail: {
            videoRevenueThb: m?.videoRevenueThb ?? 'Unavailable',
            liveRevenueThb: m?.liveRevenueThb ?? 'Unavailable',
            shoppingMallRevenueThb: m?.shoppingMallRevenueThb ?? 'Unavailable',
            videoNumber: m?.videoNumber ?? 'Unavailable',
            liveNumber: m?.liveNumber ?? 'Unavailable',
            deliveryType: m?.deliveryType ?? 'Unavailable',
            launchDate: m?.launchDate ?? 'Unavailable',
            skuCount: m?.skuCount ?? 'Unavailable',
          },
          shopDetail: {
            shopId: m?.sellerId ?? 'Unavailable',
            shopName: m?.sellerName ?? product.shopName ?? 'Unavailable',
            sellerType: m?.shopSellerType ?? 'Unavailable',
            shopRevenueThb: m?.shopRevenueThb ?? 'Unavailable',
            shopAffiliateRevenueThb: m?.shopAffiliateRevenueThb ?? 'Unavailable',
            shopSelfAccountRevenueThb: m?.shopSelfAccountRevenueThb ?? 'Unavailable',
            shopShoppingMallRevenueThb: m?.shopShoppingMallRevenueThb ?? 'Unavailable',
            shopCreatorNumber: m?.shopCreatorNumber ?? 'Unavailable',
            shopProductNumber: m?.shopProductNumber ?? 'Unavailable',
          },
          reviewInsights: m?.reviewInsight
            ? {
                commentsAnalyzed: m.reviewInsight.commentsAnalyzed,
                averageRating: m.reviewInsight.averageRating ?? 'Unavailable',
                customerLikes: m.reviewInsight.positivePoints,
                dislikesAndPainPoints: m.reviewInsight.painPoints,
                frequentComplaints: m.reviewInsight.frequentComplaints,
                qualityCautions: m.reviewInsight.qualityCautions,
                buyerNeeds: m.reviewInsight.buyerNeeds,
                usageScenarios: m.reviewInsight.usageScenarios,
                updatedAt: m.reviewInsight.updatedAt,
              }
            : 'Unavailable',
        },
        aiAnalysis: aiAnalysis
          ? {
              source: aiAnalysis.source,
              modelUsed: aiAnalysis.modelUsed ?? 'Unavailable',
              analyzedAt: aiAnalysis.analyzedAt,
              finalRecommendation: aiAnalysis.finalRecommendation,
              strengthsEn: aiAnalysis.strengthsEn,
              weaknessesEn: aiAnalysis.weaknessesEn,
              salesAndRevenueEn: aiAnalysis.salesAndRevenueEn,
              growthPotentialEn: aiAnalysis.growthPotentialEn,
              commissionPotentialEn: aiAnalysis.commissionPotentialEn,
              competitionAnalysisEn: aiAnalysis.competitionAnalysisEn,
              targetCustomerEn: aiAnalysis.targetCustomerEn,
              whyChooseEn: aiAnalysis.whyChooseEn,
              risksAndDrawbacksEn: aiAnalysis.risksAndDrawbacksEn,
              aiContentSuitability: aiAnalysis.aiContentSuitability,
            }
          : 'Unavailable',
        dataConfidence: {
          level: evaluation.confidenceLevel,
          percentage: evaluation.confidencePct,
          verifiedCriteria: evaluation.verifiedCount,
          estimatedCriteria: evaluation.estimatedCount,
          unverifiedCriteria: evaluation.unverifiedCount,
          unavailableCriteria: evaluation.unavailableCount,
          totalCriteria: evaluation.totalCriteria,
          explanationEn: evaluation.confidenceExplanationEn,
        },
        sourceInformation: {
          researchedAt: options.researchDate ?? product.researchedAt ?? 'Unavailable',
          lastEnrichedAt: m?.lastEnrichedAt ?? 'Unavailable',
          sources: product.sources.map((s) => ({
            label: s.labelEn,
            sourceType: s.sourceType,
            verified: s.verified,
            url: s.url ?? 'Unavailable',
          })),
          missingData: product.missingDataEn,
        },
      };
    }),
  };

  return JSON.stringify(stripSensitiveKeys(payload), null, 2);
}

/**
 * Phase 5 Requirement #7 — Comprehensive CSV export with UTF-8 BOM, 'Unavailable' for missing values,
 * and zero secrets/API keys.
 */
export function buildProductsExportCsv(
  products: readonly ResearchProduct[],
  options: ExportContextOptions
): string {
  const headers = [
    'Canonical Product ID',
    'Product Name',
    'Category',
    'Sub-Category',
    'Shop Name',
    'Shop ID',
    'Shop Type',
    'Research Mode',
    'Price (THB)',
    'Price Range (THB)',
    'Sales Volume',
    'Revenue (THB)',
    'Revenue Growth (%)',
    'Affiliate Commission (%)',
    'Est Commission Per Sale (THB)',
    'Creator Count',
    'Competition Level',
    'Shop GMV (THB)',
    'Shop Affiliate GMV (THB)',
    'Review Count',
    'Customer Rating',
    'Review Insights Summary',
    'Total Score (/100)',
    'Decision Summary',
    'Decision Reason',
    'Data Confidence',
    'Confidence (%)',
    'Verified Criteria',
    'Sales Factor Score',
    'Revenue Factor Score',
    'Growth Factor Score',
    'Commission Factor Score',
    'Competition Factor Score',
    'Demand Factor Score',
    'AI Content Suitability',
    'AI Analysis Source',
    'AI Analysis Verdict',
    'Main Strengths',
    'Main Weaknesses',
    'Key Risks',
    'Researched At',
    'Last Enriched At',
    'Sources',
  ];

  const rows = products.map((product) => {
    const evaluation =
      options.evaluations?.get(product.id) ??
      evaluateProductOpportunity(product, {
        salesWeightPct: options.salesWeightPct,
        peerProducts: products,
      });
    const aiAnalysis = resolveEffectiveAiAnalysis(product);
    const decision = deriveProductDecisionSummary(product, evaluation, aiAnalysis);
    const m = product.kalodataMetrics;
    const compUnavail = isCompetitionUnavailable(product, evaluation);

    const factorScore = (key: string) => {
      const c = evaluation.criteria.find((item) => item.key === key);
      if (!c || c.normalizedScore === null || c.verification === 'unavailable') {
        return 'Unavailable';
      }
      return `${c.normalizedScore}/100`;
    };

    const commRate =
      product.commissionVerified && typeof product.commissionRate === 'number'
        ? `${product.commissionRate}%`
        : typeof m?.commissionRatePct === 'number' && m.commissionRatePct > 0
          ? `${m.commissionRatePct}%`
          : 'Unavailable';

    const priceRange =
      typeof m?.minPriceThb === 'number' && typeof m?.maxPriceThb === 'number'
        ? `${Math.round(m.minPriceThb)}-${Math.round(m.maxPriceThb)}`
        : 'Unavailable';

    const reviewSummary = m?.reviewInsight
      ? [
          m.reviewInsight.positivePoints.length > 0
            ? `Likes: ${m.reviewInsight.positivePoints
                .slice(0, 2)
                .map((x) => x.point)
                .join('; ')}`
            : null,
          m.reviewInsight.painPoints.length > 0
            ? `Pain Points: ${m.reviewInsight.painPoints
                .slice(0, 2)
                .map((x) => x.point)
                .join('; ')}`
            : null,
        ]
          .filter(Boolean)
          .join(' | ') || 'Unavailable'
      : 'Unavailable';

    const sourcesArr = Array.isArray(product.sources) ? product.sources : [];
    const sourcesText =
      sourcesArr.length > 0
        ? sourcesArr
            .map((s) => (s.url ? `${s.labelEn} (${s.url})` : s.labelEn))
            .join(' | ')
        : 'Unavailable';

    const cells = [
      getCanonicalProductId(product),
      product.name,
      product.category === 'womens-fashion' ? "Women's Fashion" : 'Cosmetics & Beauty',
      unavailableOr(product.subCategory),
      unavailableOr(product.shopName),
      unavailableOr(m?.sellerId),
      unavailableOr(m?.shopSellerType),
      product.researchMode ?? m?.researchMode ?? 'fast',
      typeof product.priceThb === 'number' && product.priceThb > 0
        ? product.priceThb
        : 'Unavailable',
      priceRange,
      unavailableOr(m?.salesVolume),
      unavailableOr(m?.revenueThb),
      typeof m?.revenueGrowthRate === 'number' && Number.isFinite(m.revenueGrowthRate)
        ? `${m.revenueGrowthRate >= 0 ? '+' : ''}${m.revenueGrowthRate.toFixed(1)}%`
        : 'Unavailable',
      commRate,
      unavailableOr(product.estimatedCommissionPerSaleThb),
      unavailableOr(m?.creatorNumber),
      compUnavail ? 'Unavailable' : product.competitionLevel,
      unavailableOr(m?.shopRevenueThb),
      unavailableOr(m?.shopAffiliateRevenueThb),
      typeof product.reviewCount === 'number' && product.reviewCount > 0
        ? product.reviewCount
        : 'Unavailable',
      typeof product.customerRating === 'number' && product.customerRating > 0
        ? product.customerRating.toFixed(1)
        : 'Unavailable',
      reviewSummary,
      evaluation.totalScore,
      DECISION_LABELS_EN[decision.verdict],
      decision.reasonEn,
      evaluation.confidenceLevel,
      `${evaluation.confidencePct}%`,
      `${evaluation.verifiedCount}/${evaluation.totalCriteria}`,
      factorScore('salesPerformance'),
      factorScore('revenuePerformance'),
      factorScore('revenueGrowth'),
      factorScore('commissionPotential'),
      factorScore('competition'),
      factorScore('marketDemand'),
      `${getEffectiveAiSuitabilityBand(product, evaluation)} (${factorScore('aiContentSuitability')})`,
      aiAnalysis ? (aiAnalysis.source === 'gemini' ? 'Gemini AI' : 'Kalodata Fallback') : 'Unavailable',
      aiAnalysis ? aiAnalysis.finalRecommendation.verdict : 'Unavailable',
      (aiAnalysis?.strengthsEn ?? evaluation.strengthsEn).slice(0, 3).join(' | ') || 'Unavailable',
      (aiAnalysis?.weaknessesEn ?? evaluation.weaknessesEn).slice(0, 3).join(' | ') || 'Unavailable',
      (aiAnalysis?.risksAndDrawbacksEn ?? evaluation.risksEn).slice(0, 3).join(' | ') ||
        'Unavailable',
      unavailableOr(options.researchDate ?? product.researchedAt),
      unavailableOr(m?.lastEnrichedAt),
      sourcesText,
    ];

    return cells.map((c) => escapeCsvCell(c)).join(',');
  });

  // Include UTF-8 BOM so Myanmar Unicode displays cleanly in Excel
  return `\uFEFF${[headers.map(escapeCsvCell).join(','), ...rows].join('\n')}`;
}

/**
 * Phase 5 Requirement #5 — Complete 10-section Copy Report builder.
 * Clearly separates Verified Kalodata Market Data vs AI Assessment so no important
 * data, enrichment detail, review insight, scoring breakdown, or AI analysis is omitted.
 */
export function buildCompleteTextReport(params: {
  product: ResearchProduct;
  evaluation: OpportunityEvaluation;
  decision: ProductDecisionSummary;
  aiAnalysis: AiProductAnalysis | null;
  language: Language;
  researchDate?: string | null;
}): string {
  const { product, evaluation, decision, aiAnalysis, language, researchDate } = params;
  const isMy = language === 'my';
  const m = product.kalodataMetrics;
  const compUnavail = isCompetitionUnavailable(product, evaluation);

  const displayName = isMy ? product.nameMy : product.name;
  const categoryLabel =
    product.category === 'womens-fashion' ? "Women's Fashion" : 'Cosmetics & Beauty';
  const decisionLabel = isMy
    ? DECISION_LABELS_MY[decision.verdict]
    : DECISION_LABELS_EN[decision.verdict];

  const fmtThbOrUnavail = (n: number | null | undefined) =>
    typeof n === 'number' && Number.isFinite(n) && n >= 0 ? formatThb(n) : 'Unavailable';
  const fmtNumOrUnavail = (n: number | null | undefined) =>
    typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n.toLocaleString('en-US') : 'Unavailable';

  const commRate =
    product.commissionVerified && typeof product.commissionRate === 'number'
      ? `${product.commissionRate}%`
      : typeof m?.commissionRatePct === 'number' && m.commissionRatePct > 0
        ? `${m.commissionRatePct}%`
        : 'Unavailable';

  const lines: string[] = [
    `=== SIAMPICK PRODUCT RESEARCH REPORT ===`,
    ``,
    `1. ${isMy ? 'Product အကျဉ်းချုပ် (Product Overview)' : 'Product Overview'}`,
    `- Name: ${displayName}`,
    `- Canonical Product ID: ${getCanonicalProductId(product)}`,
    `- Category: ${categoryLabel} · ${isMy ? product.subCategoryMy : product.subCategory}`,
    `- Brand / Shop: ${product.brand ? `${product.brand} · ` : ''}${product.shopName} (${product.dispatchHub})`,
    `- Research Mode: ${product.researchMode ?? m?.researchMode ?? 'fast'}`,
    `- Price: ${typeof product.priceThb === 'number' && product.priceThb > 0 ? formatThb(product.priceThb) : 'Unavailable'}`,
    ``,
    `2. ${isMy ? 'နောက်ဆုံးဆုံးဖြတ်ချက် (Final Decision Summary)' : 'Final Decision Summary'}`,
    `- Verdict: ${decisionLabel}`,
    `- Overall Score: ${evaluation.totalScore}/100 | Strategy: ${evaluation.salesWeightPct}/${100 - evaluation.salesWeightPct} | Data Confidence: ${evaluation.confidenceLevel} (${evaluation.confidencePct}%)`,
    `- Reason: ${isMy ? decision.reasonMy : decision.reasonEn}`,
    ...(decision.cautionsEn.length > 0
      ? [
          `- Cautions: ${(isMy ? decision.cautionsMy : decision.cautionsEn).join(' / ')}`,
        ]
      : []),
    ``,
    `3. ${isMy ? 'Kalodata တကယ့်ဈေးကွက်ဒေတာ (Verified Kalodata Market Data)' : 'Verified Kalodata Market Data'}`,
    `- Date Range: ${m?.dateRange ?? 'Unavailable'}`,
    `- Sales Volume: ${fmtNumOrUnavail(m?.salesVolume)}`,
    `- Revenue (THB GMV): ${fmtThbOrUnavail(m?.revenueThb)}`,
    `- Revenue Growth: ${
      typeof m?.revenueGrowthRate === 'number' && Number.isFinite(m.revenueGrowthRate)
        ? `${m.revenueGrowthRate >= 0 ? '+' : ''}${m.revenueGrowthRate.toFixed(1)}%`
        : 'Unavailable'
    }`,
    `- Affiliate Commission: ${commRate}${
      typeof product.estimatedCommissionPerSaleThb === 'number'
        ? ` (~${formatThb(product.estimatedCommissionPerSaleThb)}/sale)`
        : ''
    }`,
    `- Creator Count: ${fmtNumOrUnavail(m?.creatorNumber)} | Competition: ${
      compUnavail ? 'Unavailable' : product.competitionLevel
    }`,
    `- Video Revenue: ${fmtThbOrUnavail(m?.videoRevenueThb)} | Live Revenue: ${fmtThbOrUnavail(m?.liveRevenueThb)}`,
    `- Price Range: ${
      typeof m?.minPriceThb === 'number' && typeof m?.maxPriceThb === 'number'
        ? `${formatThb(m.minPriceThb)} - ${formatThb(m.maxPriceThb)}`
        : 'Unavailable'
    }`,
    ``,
    `4. ${isMy ? '100-Point Scoring Breakdown' : 'Scoring Breakdown (100 Points)'}`,
    ...evaluation.criteria.map((c) => {
      const scoreText =
        c.wasRedistributed || c.earnedPoints === null
          ? `[Unavailable · Redistributed] (Base ${c.baseWeight} pts)`
          : `${c.earnedPoints.toFixed(1)}/${c.effectiveWeight.toFixed(1)} pts (Score ${c.normalizedScore}/100 · ${c.verification})`;
      return `- ${c.key}: ${scoreText} — ${isMy ? c.evidenceMy : c.evidenceEn}`;
    }),
    ``,
    `5. ${isMy ? 'Product & Shop Enrichment (Kalodata Verified)' : 'Product & Shop Enrichment (Kalodata Verified)'}`,
    `- Shop Name / ID: ${m?.sellerName ?? product.shopName} (${m?.sellerId ?? 'Unavailable'})`,
    `- Shop Type: ${m?.shopSellerType ?? 'Unavailable'}`,
    `- Shop GMV: ${fmtThbOrUnavail(m?.shopRevenueThb)} | Shop Affiliate GMV: ${fmtThbOrUnavail(m?.shopAffiliateRevenueThb)}`,
    `- Shop Creators: ${fmtNumOrUnavail(m?.shopCreatorNumber)} | Shop Products: ${fmtNumOrUnavail(m?.shopProductNumber)}`,
    `- Product Videos / Lives: ${fmtNumOrUnavail(m?.videoNumber)} / ${fmtNumOrUnavail(m?.liveNumber)} | Delivery: ${m?.deliveryType ?? 'Unavailable'}`,
    ``,
    `6. ${isMy ? 'ဝယ်သူ Review နှင့် လိုအပ်ချက်များ (Customer Review Insights)' : 'Customer Review Insights'}`,
    `- Rating / Review Count: ${
      typeof product.customerRating === 'number' && product.customerRating > 0
        ? `${product.customerRating.toFixed(1)}/5.0`
        : 'Unavailable'
    } · ${
      typeof product.reviewCount === 'number' && product.reviewCount > 0
        ? `${product.reviewCount.toLocaleString('en-US')} reviews`
        : 'Unavailable'
    }`,
    ...(m?.reviewInsight
      ? [
          `- Customer Likes: ${
            m.reviewInsight.positivePoints.map((x) => `${x.point} (${x.mentions})`).join(', ') ||
            'Unavailable'
          }`,
          `- Dislikes & Pain Points: ${
            m.reviewInsight.painPoints.map((x) => `${x.point} (${x.mentions})`).join(', ') ||
            'Unavailable'
          }`,
          `- Frequent Complaints: ${
            m.reviewInsight.frequentComplaints.map((x) => `${x.point} (${x.mentions})`).join(', ') ||
            'Unavailable'
          }`,
          `- Quality Cautions: ${
            m.reviewInsight.qualityCautions.map((x) => `${x.point} (${x.mentions})`).join(', ') ||
            'Unavailable'
          }`,
          `- Buyer Needs & Usage: ${
            [...m.reviewInsight.buyerNeeds, ...m.reviewInsight.usageScenarios]
              .map((x) => x.point)
              .join(', ') || 'Unavailable'
          }`,
        ]
      : [
          `- Review Themes: Unavailable (opt-in Kalodata Review Insights not fetched yet)`,
        ]),
    ``,
    `7. ${isMy ? 'AI Product Analysis (AI သုံးသပ်ချက် — Kalodata ဒေတာနှင့် သီးခြားခွဲပြထားသည်)' : 'AI Product Analysis (AI Assessment — Separate from Kalodata Market Data)'}`,
    ...(aiAnalysis
      ? [
          `- Source: ${aiAnalysis.source === 'gemini' ? `Gemini AI (${aiAnalysis.modelUsed ?? 'gemini'})` : 'Kalodata Fallback Analysis'} | Analyzed At: ${aiAnalysis.analyzedAt}`,
          `- AI Verdict: ${aiAnalysis.finalRecommendation.verdict} — ${isMy ? aiAnalysis.finalRecommendation.headlineMy : aiAnalysis.finalRecommendation.headlineEn}`,
          `- Action Plan: ${isMy ? aiAnalysis.finalRecommendation.actionPlanMy : aiAnalysis.finalRecommendation.actionPlanEn}`,
          `- Sales & Revenue View: ${isMy ? aiAnalysis.salesAndRevenueMy : aiAnalysis.salesAndRevenueEn}`,
          `- Growth Potential: ${isMy ? aiAnalysis.growthPotentialMy : aiAnalysis.growthPotentialEn}`,
          `- Commission Potential: ${isMy ? aiAnalysis.commissionPotentialMy : aiAnalysis.commissionPotentialEn}`,
          `- Competition View: ${isMy ? aiAnalysis.competitionAnalysisMy : aiAnalysis.competitionAnalysisEn}`,
          `- Target Customer: ${isMy ? aiAnalysis.targetCustomerMy : aiAnalysis.targetCustomerEn}`,
          `- Why Choose: ${isMy ? aiAnalysis.whyChooseMy : aiAnalysis.whyChooseEn}`,
          `- AI Ad Suitability: ${isMy ? aiAnalysis.aiContentSuitability.summaryMy : aiAnalysis.aiContentSuitability.summaryEn}`,
        ]
      : [
          `- Status: Not generated yet (open AI Product Analysis in the Report Drawer to run on demand).`,
        ]),
    ``,
    `8. ${isMy ? 'အားသာချက်နှင့် အားနည်းချက်များ (Strengths & Weaknesses)' : 'Strengths & Weaknesses'}`,
    `- Strengths: ${(isMy ? evaluation.strengthsMy : evaluation.strengthsEn)?.join(' / ') || 'Unavailable'}`,
    `- Weaknesses: ${(isMy ? evaluation.weaknessesMy : evaluation.weaknessesEn)?.join(' / ') || 'Unavailable'}`,
    ``,
    `9. ${isMy ? 'အန္တရာယ်များနှင့် ကြော်ငြာအခွင့်အလမ်းများ (Risks & Opportunities)' : 'Risks & Opportunities'}`,
    `- Key Risks: ${(isMy ? evaluation.risksMy : evaluation.risksEn)?.join(' / ') || 'Unavailable'}`,
    `- Product Risks: ${((isMy ? product.generalRisksMy : product.generalRisksEn) ?? []).join(' / ') || 'Unavailable'}`,
    `- AI Video Ideas:`,
    ...((product.videoIdeas ?? []).length > 0
      ? product.videoIdeas.map(
          (idea, idx) =>
            `  ${idx + 1}. ${isMy ? idea.titleMy : idea.titleEn} — ${isMy ? idea.outlineMy : idea.outlineEn}`
        )
      : [`  - Unavailable`]),
    ``,
    `10. ${isMy ? 'ဒေတာရင်းမြစ်နှင့် နောက်ဆုံးအပ်ဒိတ် (Data Sources & Last Updated)' : 'Data Sources & Last Updated'}`,
    `- Researched At: ${researchDate ?? product.researchedAt ?? 'Unavailable'}`,
    `- Last Enriched At: ${m?.lastEnrichedAt ?? 'Unavailable'}`,
    `- Confidence Explanation: ${isMy ? evaluation.confidenceExplanationMy : evaluation.confidenceExplanationEn}`,
    `- Missing Data: ${((isMy ? product.missingDataMy : product.missingDataEn) ?? []).join(' / ') || 'None'}`,
    `- Sources:`,
    ...((product.sources ?? []).length > 0
      ? product.sources.map(
          (src) => `  - ${isMy ? src.labelMy : src.labelEn}${src.url ? ` (${src.url})` : ''}`
        )
      : [`  - Unavailable`]),
  ];

  return lines.join('\n');
}

export function triggerFileDownload(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
