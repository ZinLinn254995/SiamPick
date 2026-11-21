import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import type {
  KalodataProductDetailEnrichmentRecord,
  KalodataReviewInsightData,
  ResearchMode,
  ResearchProduct,
} from '../src/types/product.ts';
import type {
  DeepDiveAnalysisId,
  DeepDiveGeminiTokenUsage,
} from '../src/types/deepDive.ts';
import {
  estimateDeepDiveExecutionCost,
  evaluateDeepDiveBudgetGuard,
  runDeepDiveModules,
  type DeepDiveAiApiResponse,
  type DeepDiveCacheSnapshot,
  type DeepDiveEnrichRequestPayload,
  type DeepDiveEnrichResponsePayload,
} from '../src/utils/deepDiveEngine.ts';
import {
  DEFAULT_SPENDING_LIMIT_CREDITS,
  KALODATA_COMMENT_INSIGHT_CREDIT,
  KALODATA_PRODUCT_DETAIL_CREDIT,
  KALODATA_USD_PER_CREDIT,
} from '../src/utils/kalodataPricing.ts';
import {
  clearServerEnrichmentCache,
  EnrichmentApiError,
  enrichSingleProduct,
} from '../server/enrichmentService.ts';

function makeProduct(opts: {
  id: string;
  mode?: ResearchMode;
  withProductDetail?: boolean;
  withReviewInsight?: boolean;
  creatorNumber?: number | null;
  videoNumber?: number | null;
}): ResearchProduct {
  const numericId = opts.id.replace(/^(kalodata-th-|kd[_-])/i, '');
  const product: ResearchProduct = {
    id: opts.id,
    name: `SiamPick Phase 9.3 Product ${numericId}`,
    nameMy: `စမ်းသပ်ထုတ်ကုန် ${numericId}`,
    brand: 'SiamBrand',
    category: 'womens-fashion',
    subCategory: 'Dresses',
    subCategoryMy: 'ဂါဝန်',
    shopName: 'SiamShop Official',
    dispatchHub: 'Bangkok, Thailand',
    priceThb: 490,
    priceStatus: 'verified',
    commissionRate: 15,
    commissionVerified: true,
    commissionStatus: 'verified',
    estimatedCommissionPerSaleThb: 74,
    commissionNoteEn: '15% verified',
    commissionNoteMy: '15% တရားဝင်',
    imageSourceNoteEn: 'Kalodata product image',
    imageSourceNoteMy: 'Kalodata ပုံ',
    demandEvidenceEn: ['1200 units'],
    demandEvidenceMy: ['1200 ခု'],
    demandStatus: 'verified',
    competitionLevel: 'Moderate',
    competitionDetailEn:
      opts.creatorNumber !== null && opts.creatorNumber !== undefined
        ? `${opts.creatorNumber} creators`
        : 'Not verified',
    competitionDetailMy:
      opts.creatorNumber !== null && opts.creatorNumber !== undefined
        ? `Creator ${opts.creatorNumber} ဦး`
        : 'အတည်မပြုရသေး',
    competitionStatus:
      opts.creatorNumber !== null && opts.creatorNumber !== undefined ? 'verified' : 'unavailable',
    customerRating: null,
    reviewCount: null,
    reviewCountStatus: 'unavailable',
    customerRatingStatus: 'unavailable',
    reviewStrengthsEn: [],
    reviewStrengthsMy: [],
    customerComplaintsEn: [],
    customerComplaintsMy: [],
    demandLevel: 'High',
    aiVideoSuitability: 'High',
    aiVideoDetailEn: 'Strong visual fit',
    aiVideoDetailMy: 'AI ဗီဒီယို သင့်တော်',
    sellerReliabilityLevel: 'Reliable',
    sellerReliabilityEn: 'Verified Thailand shop',
    sellerReliabilityMy: 'တရားဝင် ထိုင်းဆိုင်',
    whyChooseEn: 'Strong verified demand',
    whyChooseMy: 'ဝယ်လိုအား ကောင်းမွန်',
    salesPotentialEn: 'Consistent Thailand TikTok Shop sales.',
    salesPotentialMy: 'ထိုင်း TikTok Shop ရောင်းအားတည်ငြိမ်သည်။',
    confidenceLevel: 'High',
    confidenceDetailEn: 'Kalodata verified metrics',
    confidenceDetailMy: 'Kalodata တကယ့်ဒေတာ',
    scoringInputs: {
      demandSales: { rawStrength: 80, verification: 'verified', evidenceEn: '1200', evidenceMy: '၁၂၀၀' },
      commissionEarning: { rawStrength: 75, verification: 'verified', evidenceEn: '15%', evidenceMy: '15%' },
      aiCreative: { rawStrength: 82, verification: 'estimated', evidenceEn: 'Fit', evidenceMy: 'သင့်တော်' },
      reviewsQuality: { rawStrength: 50, verification: 'unavailable', evidenceEn: 'None', evidenceMy: 'မရှိ' },
      priceAppeal: { rawStrength: 78, verification: 'verified', evidenceEn: '฿490', evidenceMy: '฿490' },
      competitionOpportunity: {
        rawStrength: 70,
        verification: opts.creatorNumber !== null && opts.creatorNumber !== undefined ? 'verified' : 'unavailable',
        evidenceEn: 'Creators',
        evidenceMy: 'Creators',
      },
      sellerReliability: { rawStrength: 80, verification: 'verified', evidenceEn: 'TH shop', evidenceMy: 'TH ဆိုင်' },
    },
    opportunityScore: 79,
    generalRisksEn: ['Sizing variance'],
    generalRisksMy: ['ဆိုက်ဒ်ကွာနိုင်'],
    missingDataEn: [],
    missingDataMy: [],
    imageUrl: 'https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/sample.webp',
    imageVerified: true,
    sources: [],
    videoIdeas: [
      {
        titleEn: 'Try-on hook',
        titleMy: 'ဝတ်ပြ Hook',
        formatEn: '15s Demo',
        formatMy: '၁၅ စက္ကန့်',
        outlineEn: 'Quick try-on reveal.',
        outlineMy: 'ဝတ်ပြသည့် ဗီဒီယို။',
      },
      {
        titleEn: 'Fabric closeup',
        titleMy: 'အထည်သား အနီးကပ်ပြ',
        formatEn: '20s Detail',
        formatMy: '၂၀ စက္ကန့်',
        outlineEn: 'Show breathable stitching.',
        outlineMy: 'ချုပ်ရိုးအသေးစိတ်ပြ။',
      },
      {
        titleEn: 'Price value pitch',
        titleMy: 'တန်ဖိုးနှင့်ဈေးနှုန်း',
        formatEn: '15s Offer',
        formatMy: '၁၅ စက္ကန့်',
        outlineEn: 'Highlight price and quality.',
        outlineMy: 'ဈေးနှုန်းနှင့် အရည်အသွေးပြ။',
      },
    ],
    researchMode: opts.mode ?? 'fast',
    kalodataMetrics: {
      productId: numericId,
      dateRange: 'last30Day',
      unitPriceThb: 490,
      salesVolume: 1200,
      revenueThb: 588000,
      revenueGrowthRate: 42,
      commissionRatePct: 15,
      creatorNumber: opts.creatorNumber === undefined ? null : opts.creatorNumber,
      videoNumber: opts.videoNumber === undefined ? null : opts.videoNumber,
      videoRevenueThb: opts.videoNumber ? 240000 : null,
      liveRevenueThb: 120000,
      showcaseRevenueThb: 60000,
      shoppingMallRevenueThb: 30000,
      launchDate: null,
      sellerId: '749001234567890',
      sellerName: 'SiamShop Official',
      skuCount: null,
      priCategory: null,
      secCategory: null,
      terCategory: null,
      categoryIdsRequested: ['601152'],
    },
  };

  if (opts.withProductDetail) {
    product.kalodataMetrics!.detailEnriched = true;
    product.kalodataMetrics!.skuCount = 5;
    product.reviewCount = 320;
    product.reviewCountStatus = 'verified';
  }

  if (opts.withReviewInsight) {
    product.kalodataMetrics!.reviewInsightEnriched = true;
    product.kalodataMetrics!.reviewInsight = makeCachedReviewInsight(numericId);
  }

  return product;
}

function emptyCache(): DeepDiveCacheSnapshot {
  return {
    productDetail: null,
    shopDetail: null,
    reviewInsight: null,
  };
}

function makeCachedProductDetail(productId: string): KalodataProductDetailEnrichmentRecord {
  return {
    productId,
    productShopId: '749001234567890',
    productName: `Cached Product ${productId}`,
    sellerName: 'SiamShop Official',
    skuCount: 4,
    minPriceThb: 450,
    maxPriceThb: 520,
    unitPriceThb: 490,
    revenueThb: 588000,
    salesVolume: 1200,
    videoRevenueThb: 210000,
    liveRevenueThb: 120000,
    shoppingMallRevenueThb: 30000,
    commissionRatePct: 15,
    creatorNumber: 35,
    videoNumber: 80,
    liveNumber: 12,
    deliveryType: 'Local Thailand',
    productReviewCount: 250,
    launchDate: '2026-01-15',
    trendPointsCount: 30,
    trendPeakThb: 35000,
    trendAvgThb: 19600,
    dateRange: 'last30Day',
    updatedAt: '2026-04-12T00:00:00.000Z',
  };
}

function makeCachedReviewInsight(productId: string): KalodataReviewInsightData {
  return {
    productId,
    summary: 'Cached customer review insight summary.',
    positivePoints: [{ point: 'Great fit and soft fabric', mentions: 42 }],
    painPoints: [{ point: 'Zipper feels stiff initially', mentions: 6 }],
    frequentComplaints: [{ point: 'Runs slightly small', mentions: 8 }],
    qualityCautions: [{ point: 'Check size chart before ordering', mentions: 5 }],
    buyerNeeds: [{ point: 'Lightweight breathable daily dress', mentions: 19 }],
    usageScenarios: [{ point: 'Office and weekend wear', mentions: 14 }],
    commentsAnalyzed: 120,
    averageRating: 4.8,
    ratedCommentCount: 110,
    updatedAt: '2026-04-12T00:00:00.000Z',
  };
}

// ============================================================================
// TEST 1: Pre-Run Cost Estimator — Separation, Per-Analysis Metadata, No Double-Counting
// ============================================================================
test('Phase 9.3.1: Pre-run estimator separates Kalodata vs Gemini, deduplicates shared API calls, and never double-counts cache', () => {
  const product = makeProduct({
    id: 'kalodata-th-1739300001001',
    creatorNumber: null,
    videoNumber: null,
  });

  // Select #1 (Product Detail), #4 (Creator Comp -> shares Product Detail),
  // #3 (Local 0 cr), #6 (Review Insight -> 1.0 cr), #8 (Gemini AI -> separate billing)
  const selected: DeepDiveAnalysisId[] = [
    'product-intelligence',
    'affiliate-profit-analysis',
    'creator-competition-analysis',
    'customer-review-intelligence',
    'ai-strategic-recommendation',
  ];

  const est = estimateDeepDiveExecutionCost(product, selected, {
    cacheSnapshot: emptyCache(),
  });

  // Shared product/detail (0.1) + Review Insight (1.0) = 1.1 cr (NOT 0.1 + 0.1 + 1.0 = 1.2!)
  const expectedCredits =
    Math.round((KALODATA_PRODUCT_DETAIL_CREDIT + KALODATA_COMMENT_INSIGHT_CREDIT) * 1000) / 1000;
  assert.equal(est.estimatedCredits, expectedCredits);
  assert.equal(
    est.estimatedUsd,
    Math.round(expectedCredits * KALODATA_USD_PER_CREDIT * 10000) / 10000
  );
  assert.equal(est.plannedKalodataApiCalls, 2);
  assert.equal(est.plannedGeminiCalls, 1);
  assert.equal(est.hasSeparateAiBilling, true);
  assert.equal(est.geminiBillingStatus, 'estimated-unavailable');
  assert.equal(est.hasHighCostReviewInsight, true);
  assert.equal(est.requiresExplicitConfirmation, true);
  assert.equal(est.sharedDeduplicatedModuleCount, 1);
  assert.equal(est.cachedOrLocalModuleCount, 1);

  const byId = new Map(est.modules.map((m) => [m.analysisId, m]));
  // #1 pays 0.1 cr
  assert.equal(byId.get('product-intelligence')?.estimatedCredits, KALODATA_PRODUCT_DETAIL_CREDIT);
  assert.equal(byId.get('product-intelligence')?.isSharedDeduplicated, false);
  assert.ok(byId.get('product-intelligence')?.apiLabelEn.includes('Product Detail'));
  assert.ok((byId.get('product-intelligence')?.dataUsedEn.length ?? 0) > 10);

  // #4 shares the exact same product/detail call at 0 extra cr
  assert.equal(byId.get('creator-competition-analysis')?.estimatedCredits, 0);
  assert.equal(byId.get('creator-competition-analysis')?.isSharedDeduplicated, true);
  assert.equal(byId.get('creator-competition-analysis')?.reusesExistingOrCache, true);

  // #6 costs 1.0 cr
  assert.equal(
    byId.get('customer-review-intelligence')?.estimatedCredits,
    KALODATA_COMMENT_INSIGHT_CREDIT
  );

  // #8 costs 0 Kalodata credits, uses separate Gemini billing
  assert.equal(byId.get('ai-strategic-recommendation')?.estimatedCredits, 0);
  assert.equal(byId.get('ai-strategic-recommendation')?.separateAiBilling, true);
  assert.ok(byId.get('ai-strategic-recommendation')?.apiLabelEn.includes('Gemini'));

  // Now check cached snapshot: BOTH Product Detail & Review Insight cached -> 0 Kalodata credits!
  const cachedEst = estimateDeepDiveExecutionCost(product, selected, {
    cacheSnapshot: {
      productDetail: makeCachedProductDetail('1739300001001'),
      shopDetail: null,
      reviewInsight: makeCachedReviewInsight('1739300001001'),
    },
  });
  assert.equal(cachedEst.estimatedCredits, 0);
  assert.equal(cachedEst.plannedKalodataApiCalls, 0);
  assert.equal(cachedEst.hasHighCostReviewInsight, false);
  // Still requires confirmation because Gemini AI (#8) is selected!
  assert.equal(cachedEst.requiresExplicitConfirmation, true);
  assert.equal(cachedEst.geminiBillingStatus, 'estimated-unavailable');
});

// ============================================================================
// TEST 2: Inline Removal Immediately Reduces Cost & Clears Review Insight Warning
// ============================================================================
test('Phase 9.3.2: Removing Review Insight drops estimated cost by 1.0 cr; pure local selection requires no paid confirmation', () => {
  const product = makeProduct({ id: 'kalodata-th-1739300001002' });

  const withReview = estimateDeepDiveExecutionCost(
    product,
    ['product-intelligence', 'customer-review-intelligence'],
    { cacheSnapshot: emptyCache() }
  );
  assert.equal(withReview.estimatedCredits, 1.1);
  assert.equal(withReview.hasHighCostReviewInsight, true);

  // User removes Review Insight inline
  const withoutReview = estimateDeepDiveExecutionCost(product, ['product-intelligence'], {
    cacheSnapshot: emptyCache(),
  });
  assert.equal(withoutReview.estimatedCredits, 0.1);
  assert.equal(withoutReview.hasHighCostReviewInsight, false);
  assert.equal(withoutReview.requiresExplicitConfirmation, true);

  // User selects only local 0-cost analyses (#3 + #7)
  const localOnly = estimateDeepDiveExecutionCost(
    product,
    ['affiliate-profit-analysis', 'market-competitor-comparison'],
    { cacheSnapshot: emptyCache() }
  );
  assert.equal(localOnly.estimatedCredits, 0);
  assert.equal(localOnly.plannedKalodataApiCalls, 0);
  assert.equal(localOnly.plannedGeminiCalls, 0);
  assert.equal(localOnly.geminiBillingStatus, 'none');
  assert.equal(localOnly.requiresExplicitConfirmation, false);
});

// ============================================================================
// TEST 3: Budget Guard — Spending Limit, Session Spend, Live Balance & Recommendations
// ============================================================================
test('Phase 9.3.3: Budget guard evaluates Spending Limit, cumulative session spend, and live Kalodata balance', () => {
  const product = makeProduct({ id: 'kalodata-th-1739300001003' });
  const estimate = estimateDeepDiveExecutionCost(
    product,
    ['product-intelligence', 'customer-review-intelligence'], // 1.1 cr
    { cacheSnapshot: emptyCache() }
  );

  // Limit 0.5 cr (default) < 1.1 cr -> blocked
  const blockedLimit = evaluateDeepDiveBudgetGuard(estimate, {
    spendingLimitCredits: DEFAULT_SPENDING_LIMIT_CREDITS,
    sessionCreditsAlreadySpent: 0,
    liveBalanceCredits: 25,
  });
  assert.equal(blockedLimit.exceedsSpendingLimit, true);
  assert.equal(blockedLimit.exceedsLiveBalance, false);
  assert.equal(blockedLimit.canProceedWithoutLimitChange, false);
  assert.equal(blockedLimit.remainingBudgetBeforeRun, 0.5);
  assert.equal(blockedLimit.remainingBudgetAfterRun, -0.6);
  assert.equal(blockedLimit.recommendedMinimumLimit, 1.1);

  // Cumulative session spend (0.6 already spent, limit 1.5, est 1.1 -> projected 1.7 > 1.5) -> blocked
  const blockedCumulative = evaluateDeepDiveBudgetGuard(estimate, {
    spendingLimitCredits: 1.5,
    sessionCreditsAlreadySpent: 0.6,
    liveBalanceCredits: 25,
  });
  assert.equal(blockedCumulative.exceedsSpendingLimit, true);
  assert.equal(blockedCumulative.remainingBudgetBeforeRun, 0.9);
  assert.equal(blockedCumulative.recommendedMinimumLimit, 1.7);

  // Limit 2.0 cr, session 0.5, est 1.1 -> projected 1.6 <= 2.0, BUT live balance is 0.8 < 1.1 -> blocked on balance
  const blockedBalance = evaluateDeepDiveBudgetGuard(estimate, {
    spendingLimitCredits: 2.0,
    sessionCreditsAlreadySpent: 0.5,
    liveBalanceCredits: 0.8,
  });
  assert.equal(blockedBalance.exceedsSpendingLimit, false);
  assert.equal(blockedBalance.exceedsLiveBalance, true);
  assert.equal(blockedBalance.canProceedWithoutLimitChange, false);

  // Limit 2.0 cr, session 0.5, live balance 10.0 -> allowed, remaining after = 0.4
  const allowed = evaluateDeepDiveBudgetGuard(estimate, {
    spendingLimitCredits: 2.0,
    sessionCreditsAlreadySpent: 0.5,
    liveBalanceCredits: 10.0,
  });
  assert.equal(allowed.exceedsSpendingLimit, false);
  assert.equal(allowed.exceedsLiveBalance, false);
  assert.equal(allowed.canProceedWithoutLimitChange, true);
  assert.equal(allowed.remainingBudgetBeforeRun, 1.5);
  assert.equal(allowed.remainingBudgetAfterRun, 0.4);
});

// ============================================================================
// TEST 4: Explicit Pre-Run Confirmation Gate + Post-Run Summary Accuracy
// ============================================================================
test('Phase 9.3.4: runDeepDiveModules enforces explicit confirmation, allows 0-cost local runs, and returns accurate Post-Run Summary', async () => {
  const product = makeProduct({ id: 'kalodata-th-1739300001004', creatorNumber: null });
  const peerProduct = makeProduct({ id: 'kalodata-th-1739300001099', creatorNumber: 20 });

  let enrichCalls = 0;
  let aiCalls = 0;

  const mockTokenUsage: DeepDiveGeminiTokenUsage = {
    promptTokens: 840,
    outputTokens: 310,
    totalTokens: 1150,
    pricingStatus: 'unavailable',
    costNoteEn: 'Separate Google Gemini API billing (NOT free). USD unavailable.',
    costNoteMy: 'Google Gemini API ဘေလ်သီးခြား (အခမဲ့ မဟုတ်ပါ)။ USD မရရှိနိုင်ပါ။',
  };

  const mockDeps = {
    getCacheFn: () => emptyCache(),
    saveCacheFn: () => {},
    nowIsoFn: () => '2026-04-12T12:00:00.000Z',
    enrichProductFn: async (
      payload: DeepDiveEnrichRequestPayload
    ): Promise<DeepDiveEnrichResponsePayload> => {
      enrichCalls += 1;
      assert.equal(payload.requireExplicitConfirmation, true);
      assert.equal(payload.userConfirmedPaidExecution, true);
      assert.ok(typeof payload.runId === 'string' && payload.runId.length > 0);
      assert.equal(payload.sessionCreditsAlreadySpent, 0.2);

      const pdRecord = makeCachedProductDetail('1739300001004');
      return {
        ok: true,
        product: {
          ...payload.product,
          kalodataMetrics: {
            ...payload.product.kalodataMetrics!,
            detailEnriched: true,
            creatorNumber: 35,
            skuCount: 4,
          },
          reviewCount: 250,
          reviewCountStatus: 'verified',
        },
        productDetail: pdRecord,
        summary: {
          canonicalProductId: 'kalodata-th-1739300001004',
          shopId: '749001234567890',
          enrichedAt: '2026-04-12T12:00:00.000Z',
          plannedApiCalls: 1,
          actualApiCalls: 1,
          deduplicatedCallsSaved: 0,
          estimatedCredits: KALODATA_PRODUCT_DETAIL_CREDIT,
          estimatedUsd: KALODATA_PRODUCT_DETAIL_CREDIT * KALODATA_USD_PER_CREDIT,
          actualCredits: KALODATA_PRODUCT_DETAIL_CREDIT,
          actualUsd: KALODATA_PRODUCT_DETAIL_CREDIT * KALODATA_USD_PER_CREDIT,
          balanceBefore: 15.0,
          balanceAfter: 14.9,
          layerResults: {
            productDetail: 'fetched',
            shopDetail: 'skipped',
            reviewInsights: 'skipped',
          },
        },
      };
    },
    runAiStrategyFn: async (payload: {
      requireExplicitConfirmation?: boolean;
      userConfirmedPaidExecution?: boolean;
    }): Promise<DeepDiveAiApiResponse> => {
      aiCalls += 1;
      assert.equal(payload.requireExplicitConfirmation, true);
      assert.equal(payload.userConfirmedPaidExecution, true);
      return {
        ok: true,
        strategy: {
          verdict: 'priority-test',
          headlineEn: 'Verified AI Recommendation',
          headlineMy: 'အတည်ပြုပြီး AI အကြံပြုချက်',
          summaryEn: 'Solid Thailand TikTok Shop affiliate opportunity.',
          summaryMy: 'ထိုင်း TikTok Shop Affiliate အခွင့်အလမ်း ကောင်းမွန်ပါသည်။',
          strengthsEn: ['Strong verified demand'],
          strengthsMy: ['ဝယ်လိုအား ကောင်းမွန်'],
          weaknessesEn: ['Moderate competition'],
          weaknessesMy: ['ပြိုင်ဆိုင်မှု အသင့်အတင့်'],
          risksEn: ['Margin sensitivity'],
          risksMy: ['အမြတ်အစွန်း သတိပြုရန်'],
          targetAudienceEn: 'Thai female shoppers 20–34',
          targetAudienceMy: 'အသက် ၂၀–၃၄ ထိုင်းအမျိုးသမီး ဝယ်သူများ',
          videoIdeasEn: ['3-second fit check hook'],
          videoIdeasMy: ['၃ စက္ကန့် Fit Check Hook'],
          affiliateStrategyEn: 'Publish 2 vertical try-on clips daily.',
          affiliateStrategyMy: 'နေ့စဉ် Try-on ဗီဒီယို ၂ ပုဒ် တင်ပါ။',
          goNoGoReasonEn: 'Verified 15% commission and strong sales velocity.',
          goNoGoReasonMy: 'အတည်ပြုပြီး 15% ကော်မရှင်နှင့် ရောင်းအားကောင်းမွန်ခြင်း။',
          dataLimitationsEn: ['Review Insight not run'],
          dataLimitationsMy: ['Review Insight မရွေးထားပါ'],
          modelUsed: 'gemini-2.5-flash',
          modulesSynthesized: ['product-intelligence', 'creator-competition-analysis'],
          generatedAt: '2026-04-12T12:00:00.000Z',
          tokenUsage: mockTokenUsage,
        },
      };
    },
  };

  // A. Unconfirmed paid run MUST be blocked with 0 API calls
  const unconfirmed = await runDeepDiveModules({
    product,
    analysisIds: ['product-intelligence', 'ai-strategic-recommendation'],
    spendingLimitCredits: 1.0,
    sessionCreditsAlreadySpent: 0.2,
    requireExplicitConfirmation: true,
    userConfirmedPaidExecution: false,
    deps: mockDeps,
  });
  assert.equal(unconfirmed.blockedReason, 'CONFIRMATION_REQUIRED');
  assert.equal(unconfirmed.totalKalodataApiCalls, 0);
  assert.equal(unconfirmed.totalCreditsUsed, 0);
  assert.equal(unconfirmed.runSummary, null);
  assert.equal(enrichCalls, 0);
  assert.equal(aiCalls, 0);

  // B. Unconfirmed Gemini-ONLY run MUST ALSO be blocked with 0 API calls
  const unconfirmedAiOnly = await runDeepDiveModules({
    product,
    analysisIds: ['ai-strategic-recommendation'],
    spendingLimitCredits: 1.0,
    requireExplicitConfirmation: true,
    userConfirmedPaidExecution: false,
    deps: mockDeps,
  });
  assert.equal(unconfirmedAiOnly.blockedReason, 'CONFIRMATION_REQUIRED');
  assert.equal(aiCalls, 0);

  // C. Pure 0-cost local run (#3 + #7) executes even when userConfirmedPaidExecution is false
  const localOutcome = await runDeepDiveModules({
    product,
    peerProducts: [product, peerProduct],
    analysisIds: ['affiliate-profit-analysis', 'market-competitor-comparison'],
    spendingLimitCredits: 0.5,
    requireExplicitConfirmation: true,
    userConfirmedPaidExecution: false,
    deps: mockDeps,
  });
  assert.equal(localOutcome.blockedReason, null);
  assert.equal(localOutcome.totalKalodataApiCalls, 0);
  assert.equal(localOutcome.totalCreditsUsed, 0);
  assert.equal(localOutcome.completedIds.length, 2);
  assert.equal(localOutcome.runSummary?.geminiBillingStatus, 'none');
  assert.equal(enrichCalls, 0);
  assert.equal(aiCalls, 0);

  // D. Exceeding Spending Limit blocks BEFORE any API call even if confirmed
  const overLimit = await runDeepDiveModules({
    product,
    analysisIds: ['product-intelligence', 'customer-review-intelligence'], // 1.1 cr
    spendingLimitCredits: 0.5,
    sessionCreditsAlreadySpent: 0.0,
    requireExplicitConfirmation: true,
    userConfirmedPaidExecution: true,
    deps: mockDeps,
  });
  assert.equal(overLimit.blockedReason, 'SPENDING_LIMIT_EXCEEDED');
  assert.equal(enrichCalls, 0);

  // E. Confirmed run within Spending Limit executes, deduplicates #1+#4, and produces full Post-Run Summary
  const confirmed = await runDeepDiveModules({
    product,
    analysisIds: [
      'product-intelligence',
      'creator-competition-analysis',
      'affiliate-profit-analysis',
      'ai-strategic-recommendation',
    ],
    spendingLimitCredits: 1.0,
    sessionCreditsAlreadySpent: 0.2,
    liveBalanceCredits: 15.0,
    requireExplicitConfirmation: true,
    userConfirmedPaidExecution: true,
    deps: mockDeps,
  });

  assert.equal(confirmed.blockedReason, null);
  assert.equal(enrichCalls, 1, 'Shared product/detail must only call backend once');
  assert.equal(aiCalls, 1);
  assert.equal(confirmed.totalKalodataApiCalls, 1);
  assert.equal(confirmed.totalCreditsUsed, KALODATA_PRODUCT_DETAIL_CREDIT);

  const summary = confirmed.runSummary!;
  assert.ok(summary);
  assert.equal(summary.estimatedKalodataCredits, 0.1);
  assert.equal(summary.actualKalodataCredits, 0.1);
  assert.equal(summary.plannedKalodataApiCalls, 1);
  assert.equal(summary.actualKalodataApiCalls, 1);
  assert.equal(summary.deduplicatedSharedCallsCount, 1);
  assert.equal(summary.cacheOrLocalReuseCount, 1);
  assert.equal(summary.plannedGeminiCalls, 1);
  assert.equal(summary.actualGeminiCalls, 1);
  assert.equal(summary.geminiBillingStatus, 'estimated-unavailable');
  assert.equal(summary.geminiTokenUsage?.totalTokens, 1150);
  assert.equal(summary.geminiTokenUsage?.pricingStatus, 'unavailable');
  assert.equal(summary.sessionCreditsUsedAfterRun, 0.3);
  assert.equal(summary.remainingBudgetCredits, 0.7);
  assert.equal(summary.liveBalanceAfter, 14.9);
});

// ============================================================================
// TEST 5: Server-Side Confirmation Gate, Spending Limit, & Concurrent Race Safety
// ============================================================================
test('Phase 9.3.5: Server enrichmentService blocks unconfirmed calls, enforces cumulative & concurrent Spending Limit, and deduplicates duplicate concurrent calls', async () => {
  clearServerEnrichmentCache();

  const originalFetch = globalThis.fetch;
  const originalKey = process.env.KALODATA_API_KEY;
  process.env.KALODATA_API_KEY = 'test-kalodata-secret-key';

  let upstreamProductDetailCalls = 0;
  let upstreamCommentInsightCalls = 0;
  let balanceCalls = 0;
  let mockBalance = 20.0;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();

    if (url.includes('/account/balance') || url.includes('/credit/balance') || url.includes('/balance')) {
      balanceCalls += 1;
      await new Promise((r) => setTimeout(r, 15));
      return new Response(
        JSON.stringify({
          success: true,
          data: { balance: mockBalance },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (url.includes('/tiktok/product/detail')) {
      upstreamProductDetailCalls += 1;
      await new Promise((r) => setTimeout(r, 25));
      mockBalance = Math.round((mockBalance - 0.1) * 1000) / 1000;
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            id: '1739300009001',
            product_title: 'Server Enriched Dress',
            shop_id: '749001234567890',
            sku_count: 6,
            comment_count: 410,
            creator_num: 28,
            video_num: 65,
            video_revenue: 320000,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (url.includes('/tiktok/product/comment/insight')) {
      upstreamCommentInsightCalls += 1;
      await new Promise((r) => setTimeout(r, 25));
      mockBalance = Math.round((mockBalance - 1.0) * 1000) / 1000;
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            summary: 'Customers praise fabric quality.',
            positive_points: ['Soft fabric'],
            negative_points: ['Slightly small'],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    throw new Error(`Unexpected upstream URL in Phase 9.3 test: ${url}`);
  }) as typeof fetch;

  try {
    const prodA = makeProduct({ id: 'kalodata-th-1739300009001' });

    // 5A. Server-side CONFIRMATION_REQUIRED gate (0 upstream calls!)
    await assert.rejects(
      () =>
        enrichSingleProduct({
          product: prodA,
          requestedLayers: { productDetail: true, shopDetail: false, reviewInsights: false },
          spendingLimitCredits: 1.0,
          requireExplicitConfirmation: true,
          userConfirmedPaidExecution: false,
        }),
      (err: unknown) =>
        err instanceof EnrichmentApiError &&
        err.status === 400 &&
        err.code === 'CONFIRMATION_REQUIRED'
    );
    assert.equal(upstreamProductDetailCalls, 0);
    assert.equal(balanceCalls, 0);

    // 5B. Server-side cumulative Spending Limit gate (0.4 already spent + 1.0 Review Insight > 0.5 limit)
    await assert.rejects(
      () =>
        enrichSingleProduct({
          product: prodA,
          requestedLayers: { productDetail: false, shopDetail: false, reviewInsights: true },
          spendingLimitCredits: 0.5,
          sessionCreditsAlreadySpent: 0.4,
          requireExplicitConfirmation: true,
          userConfirmedPaidExecution: true,
        }),
      (err: unknown) =>
        err instanceof EnrichmentApiError &&
        err.status === 400 &&
        err.code === 'SPENDING_LIMIT_EXCEEDED'
    );
    assert.equal(upstreamCommentInsightCalls, 0);
    assert.equal(balanceCalls, 0);

    // 5C. Concurrent DISTINCT paid calls sharing the same runId with spendingLimitCredits = 1.0:
    //     Call 1 asks for Product Detail (0.1 cr), Call 2 concurrently asks for Review Insight (1.0 cr).
    //     Total 1.1 cr > 1.0 cr -> Call 1 succeeds (0.1 cr), Call 2 MUST be synchronously rejected
    //     with SPENDING_LIMIT_EXCEEDED and 0 upstream comment/insight calls!
    const sharedRunId = 'run-concurrent-distinct-budget-test';
    const [res1, res2] = await Promise.allSettled([
      enrichSingleProduct({
        product: prodA,
        requestedLayers: { productDetail: true, shopDetail: false, reviewInsights: false },
        spendingLimitCredits: 1.0,
        sessionCreditsAlreadySpent: 0,
        runId: sharedRunId,
        requireExplicitConfirmation: true,
        userConfirmedPaidExecution: true,
      }),
      enrichSingleProduct({
        product: prodA,
        requestedLayers: { productDetail: false, shopDetail: false, reviewInsights: true },
        spendingLimitCredits: 1.0,
        sessionCreditsAlreadySpent: 0,
        runId: sharedRunId,
        requireExplicitConfirmation: true,
        userConfirmedPaidExecution: true,
      }),
    ]);

    assert.equal(res1.status, 'fulfilled');
    assert.equal(res2.status, 'rejected');
    if (res2.status === 'rejected') {
      assert.ok(res2.reason instanceof EnrichmentApiError);
      assert.equal(res2.reason.code, 'SPENDING_LIMIT_EXCEEDED');
    }
    assert.equal(upstreamProductDetailCalls, 1);
    assert.equal(upstreamCommentInsightCalls, 0, 'Over-limit concurrent Review Insight MUST NOT call upstream');

    // 5D. Concurrent DUPLICATE paid calls for the SAME productId with tight spendingLimitCredits = 0.1:
    //     Both MUST succeed because the second call deduplicates synchronously into the in-flight slot
    //     (0 extra credits, 1 total upstream call, NO false SPENDING_LIMIT_EXCEEDED!).
    clearServerEnrichmentCache();
    upstreamProductDetailCalls = 0;
    const prodB = makeProduct({ id: 'kalodata-th-1739300009002' });
    const dupRunId = 'run-concurrent-duplicate-dedupe-test';

    const [dup1, dup2] = await Promise.all([
      enrichSingleProduct({
        product: prodB,
        requestedLayers: { productDetail: true, shopDetail: false, reviewInsights: false },
        spendingLimitCredits: 0.1,
        sessionCreditsAlreadySpent: 0,
        runId: dupRunId,
        requireExplicitConfirmation: true,
        userConfirmedPaidExecution: true,
      }),
      enrichSingleProduct({
        product: prodB,
        requestedLayers: { productDetail: true, shopDetail: false, reviewInsights: false },
        spendingLimitCredits: 0.1,
        sessionCreditsAlreadySpent: 0,
        runId: dupRunId,
        requireExplicitConfirmation: true,
        userConfirmedPaidExecution: true,
      }),
    ]);

    assert.equal(dup1.ok, true);
    assert.equal(dup2.ok, true);
    assert.equal(upstreamProductDetailCalls, 1, 'Duplicate concurrent calls must execute only 1 upstream call');
    assert.equal(dup1.summary.actualApiCalls + dup2.summary.actualApiCalls, 1);
    assert.equal(dup2.summary.layerResults.productDetail, 'reused-cache');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) {
      delete process.env.KALODATA_API_KEY;
    } else {
      process.env.KALODATA_API_KEY = originalKey;
    }
    clearServerEnrichmentCache();
  }
});

// ============================================================================
// TEST 6: UI Architecture, Phase 9.1 Invariants, Honest Gemini Billing & Server Routes
// ============================================================================
test('Phase 9.3.6: DeepDiveWorkspaceView preserves Phase 9.1 guardrails, includes Phase 9.3 UX controls, and server.ts guards both paid endpoints', () => {
  const viewPath = path.resolve(process.cwd(), 'src/components/DeepDiveWorkspaceView.tsx');
  const viewCode = fs.readFileSync(viewPath, 'utf8');

  // Phase 9.1 strict invariant: UI component must NEVER call fetch() or hardcode /api/
  assert.equal(viewCode.includes('fetch('), false, 'DeepDiveWorkspaceView must not call fetch()');
  assert.equal(viewCode.includes('/api/'), false, 'DeepDiveWorkspaceView must not contain /api/');

  // Phase 9.3 inline UX markers (no modal dialogs!)
  assert.ok(viewCode.includes('data-testid="deep-dive-pre-run-confirmation"'));
  assert.ok(viewCode.includes('data-testid="deep-dive-post-run-summary"'));
  assert.ok(viewCode.includes('KALODATA_COMMENT_INSIGHT_CREDIT'));
  assert.ok(viewCode.includes('KALODATA_USD_PER_CREDIT'));
  assert.ok(viewCode.includes('evaluateDeepDiveBudgetGuard'));
  assert.ok(viewCode.includes('hasHighCostReviewInsight'));
  assert.ok(viewCode.includes('onSpendingLimitChange'));

  // Honest Gemini billing: explicitly communicates NOT free / Estimated-Unavailable
  assert.ok(viewCode.includes('NOT free'));
  assert.ok(viewCode.includes('Est. / Unavailable'));
  assert.equal(
    viewCode.includes('Free Gemini') || viewCode.includes('Gemini is free'),
    false,
    'UI must never claim Gemini AI is free'
  );

  // Server route confirmation gates for BOTH Kalodata enrichment & Gemini AI Strategy
  const serverPath = path.resolve(process.cwd(), 'server.ts');
  const serverCode = fs.readFileSync(serverPath, 'utf8');
  assert.ok(serverCode.includes('requireExplicitConfirmation'));
  assert.ok(serverCode.includes('userConfirmedPaidExecution'));
  assert.ok(serverCode.includes('sessionCreditsAlreadySpent'));
  assert.ok(serverCode.includes("code: 'CONFIRMATION_REQUIRED'"));
});
