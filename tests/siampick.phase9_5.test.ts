import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  EnrichmentLayerResultStatus,
  KalodataProductDetailEnrichmentRecord,
  KalodataReviewInsightData,
  ProductEnrichmentExecutionSummary,
  ResearchProduct,
} from '../src/types/product.ts';
import type { DeepDiveAnalysisId } from '../src/types/deepDive.ts';
import {
  ALL_DEEP_DIVE_ANALYSIS_IDS,
  buildDeepDiveTargetContext,
  createInitialDeepDiveWorkspaceState,
} from '../src/utils/deepDiveRegistry.ts';
import {
  estimateDeepDiveExecutionCost,
  runDeepDiveModules,
  type DeepDiveAiApiResponse,
  type DeepDiveEnrichRequestPayload,
  type DeepDiveEnrichResponsePayload,
} from '../src/utils/deepDiveEngine.ts';
import {
  absorbProductsIntoEnrichmentCache,
  ENRICHMENT_CACHE_STORAGE_KEY,
  getCachedEnrichmentForProduct,
  saveEnrichmentToCache,
} from '../src/utils/enrichmentCache.ts';
import {
  appendDeepDiveHistoryRecord,
  createDeepDiveHistoryRecord,
  hydrateWorkspaceStateFromHistory,
  loadAllDeepDiveHistoryByProduct,
  loadDeepDiveHistoryForProduct,
} from '../src/utils/deepDiveHistoryStorage.ts';
import {
  buildDeepDiveFinalReport,
  buildDeepDiveReportJson,
  buildDeepDiveReportMarkdown,
} from '../src/utils/deepDiveReportBuilder.ts';
import { evaluateProductBatch, getCanonicalProductId } from '../src/utils/scoring.ts';
import {
  clearServerEnrichmentCache,
  EnrichmentApiError,
  enrichSingleProduct,
} from '../server/enrichmentService.ts';
import { createBudgetLedger } from '../server/budgetLedgerService.ts';

function installMemoryStorage() {
  const store = new Map<string, string>();
  const mockStorage: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: mockStorage,
    configurable: true,
    writable: true,
  });
  return { store, mockStorage };
}

function makeEnrichSummary(opts: {
  productId: string;
  apiCalls: number;
  credits: number;
  layerResults: Record<'productDetail' | 'shopDetail' | 'reviewInsights', EnrichmentLayerResultStatus>;
  balanceBefore?: number | null;
  balanceAfter?: number | null;
}): ProductEnrichmentExecutionSummary {
  const usd = Math.round(opts.credits * 0.04 * 10000) / 10000;
  return {
    canonicalProductId: opts.productId,
    shopId: '749500112233',
    enrichedAt: '2026-11-21T11:05:00.000Z',
    plannedApiCalls: opts.apiCalls,
    actualApiCalls: opts.apiCalls,
    deduplicatedCallsSaved: 0,
    estimatedCredits: opts.credits,
    estimatedUsd: usd,
    actualCredits: opts.credits,
    actualUsd: usd,
    balanceBefore: opts.balanceBefore ?? null,
    balanceAfter: opts.balanceAfter ?? null,
    layerResults: opts.layerResults,
  };
}

function makeProductForMode(params: {
  mode: 'fast' | 'balanced' | 'deep';
  id: string;
  kalodataProductId: string;
  name?: string;
  priceThb?: number;
  commissionRate?: number;
  salesVolume?: number;
  revenueThb?: number;
}): ResearchProduct {
  const isBalancedOrDeep = params.mode === 'balanced' || params.mode === 'deep';
  const isDeep = params.mode === 'deep';
  const price = params.priceThb ?? 259;
  const comm = params.commissionRate ?? 15;
  const sales = params.salesVolume ?? 2400;
  const rev = params.revenueThb ?? 621600;
  const cleanId = params.kalodataProductId.replace(/^(kalodata-th-|kd[_-])/i, '');

  return {
    id: params.id,
    name: params.name ?? 'Hydrating Rice Toner 150ml',
    nameMy: params.name ?? 'ဆန်ရည် အစိုဓာတ်ထိန်း Toner 150ml',
    brand: 'SiamGlow',
    category: 'cosmetics-beauty',
    subCategory: 'Skincare',
    subCategoryMy: 'အသားအရေထိန်း',
    shopName: isBalancedOrDeep ? 'Siam Glow Official' : 'Unavailable',
    dispatchHub: 'Bangkok, Thailand',
    priceThb: price,
    priceStatus: 'verified',
    commissionRate: comm,
    commissionVerified: true,
    commissionStatus: 'verified',
    estimatedCommissionPerSaleThb: Math.round(((price * comm) / 100) * 100) / 100,
    commissionNoteEn: `${comm}% verified`,
    commissionNoteMy: `${comm}% တရားဝင်`,
    imageSourceNoteEn: 'Kalodata product image',
    imageSourceNoteMy: 'Kalodata ပုံ',
    demandEvidenceEn: [`${sales.toLocaleString('en-US')} units`],
    demandEvidenceMy: [`${sales.toLocaleString('en-US')} ခု`],
    demandStatus: 'verified',
    competitionLevel: isBalancedOrDeep ? 'Moderate' : 'Unknown',
    competitionDetailEn: isBalancedOrDeep ? '34 creators' : 'Unavailable',
    competitionDetailMy: isBalancedOrDeep ? 'Creator 34 ဦး' : 'မရရှိနိုင်ပါ',
    competitionStatus: isBalancedOrDeep ? 'verified' : 'unavailable',
    customerRating: null,
    reviewCount: isBalancedOrDeep ? 312 : null,
    reviewCountStatus: isBalancedOrDeep ? 'verified' : 'unavailable',
    customerRatingStatus: 'unavailable',
    reviewStrengthsEn: [],
    reviewStrengthsMy: [],
    customerComplaintsEn: [],
    customerComplaintsMy: [],
    demandLevel: 'High',
    aiVideoSuitability: 'High',
    aiVideoDetailEn: 'Clear visual demo angle',
    aiVideoDetailMy: 'လက်တွေ့သုံးပြနိုင်သော Product ဖြစ်သည်',
    sellerReliabilityLevel: isBalancedOrDeep ? 'Reliable' : 'Unknown',
    sellerReliabilityEn: isBalancedOrDeep ? 'Verified TH shop' : 'Unavailable',
    sellerReliabilityMy: isBalancedOrDeep ? 'တရားဝင် ထိုင်းဆိုင်' : 'မရရှိနိုင်ပါ',
    whyChooseEn: 'Strong 30-day Thailand demand',
    whyChooseMy: '၃၀ ရက်အတွင်း ဝယ်လိုအားကောင်းသည်',
    salesPotentialEn: 'Steady Thailand TikTok Shop velocity.',
    salesPotentialMy: 'ထိုင်း TikTok Shop တွင် ရောင်းအားတည်ငြိမ်သည်။',
    confidenceLevel: isBalancedOrDeep ? 'High' : 'Medium',
    confidenceDetailEn: 'Verified Kalodata TH OpenAPI',
    confidenceDetailMy: 'Kalodata TH OpenAPI မှ အတည်ပြုပြီး',
    scoringInputs: {
      demandSales: { rawStrength: 82, verification: 'verified', evidenceEn: `${sales}`, evidenceMy: `${sales}` },
      commissionEarning: { rawStrength: 80, verification: 'verified', evidenceEn: `${comm}%`, evidenceMy: `${comm}%` },
      aiCreative: { rawStrength: 78, verification: 'estimated', evidenceEn: 'Demo fit', evidenceMy: 'သင့်တော်' },
      reviewsQuality: { rawStrength: 50, verification: 'unavailable', evidenceEn: 'Unavailable', evidenceMy: 'မရရှိနိုင်ပါ' },
      priceAppeal: { rawStrength: 84, verification: 'verified', evidenceEn: `฿${price}`, evidenceMy: `฿${price}` },
      competitionOpportunity: {
        rawStrength: isBalancedOrDeep ? 74 : 50,
        verification: isBalancedOrDeep ? 'verified' : 'unavailable',
        evidenceEn: isBalancedOrDeep ? '34 creators' : 'Unavailable',
        evidenceMy: isBalancedOrDeep ? 'Creator 34 ဦး' : 'မရရှိနိုင်ပါ',
      },
      sellerReliability: {
        rawStrength: isBalancedOrDeep ? 78 : 50,
        verification: isBalancedOrDeep ? 'verified' : 'unavailable',
        evidenceEn: isBalancedOrDeep ? 'Siam Glow Official' : 'Unavailable',
        evidenceMy: isBalancedOrDeep ? 'Siam Glow Official' : 'မရရှိနိုင်ပါ',
      },
    },
    opportunityScore: 81,
    generalRisksEn: ['Moderate creator count'],
    generalRisksMy: ['Creator ပြိုင်ဆိုင်မှု အသင့်အတင့်ရှိသည်'],
    missingDataEn: ['Official 5-star rating unavailable'],
    missingDataMy: ['တရားဝင် 5-Star Rating မရရှိနိုင်ပါ'],
    imageUrl: '',
    imageVerified: false,
    sources: [],
    videoIdeas: [],
    researchMode: params.mode,
    researchedAt: '2026-11-21T10:00:00.000Z',
    kalodataMetrics: {
      productId: params.kalodataProductId,
      sellerId: isBalancedOrDeep ? '749500112233' : null,
      sellerName: isBalancedOrDeep ? 'Siam Glow Official' : null,
      dateRange: 'last30Day',
      researchMode: params.mode,
      salesVolume: sales,
      revenueThb: rev,
      revenueGrowthRate: 24.5,
      unitPriceThb: price,
      minPriceThb: isBalancedOrDeep ? 229 : null,
      maxPriceThb: isBalancedOrDeep ? 289 : null,
      commissionRatePct: comm,
      creatorNumber: isBalancedOrDeep ? 34 : null,
      videoNumber: isBalancedOrDeep ? 48 : null,
      liveNumber: isBalancedOrDeep ? 6 : null,
      videoRevenueThb: isBalancedOrDeep ? 420000 : null,
      liveRevenueThb: isBalancedOrDeep ? 110000 : null,
      showcaseRevenueThb: isBalancedOrDeep ? 91600 : null,
      shoppingMallRevenueThb: null,
      skuCount: isBalancedOrDeep ? 3 : null,
      deliveryType: isBalancedOrDeep ? 'LOCAL' : null,
      productReviewCount: isBalancedOrDeep ? 312 : null,
      launchDate: isBalancedOrDeep ? '2026-04-12' : null,
      detailEnriched: isBalancedOrDeep,
      shopEnriched: isDeep,
      reviewInsightEnriched: isDeep,
      reviewInsight: isDeep ? makeMockReviewInsight(cleanId) : null,
    },
  } as unknown as ResearchProduct;
}

function makeMockProductDetail(productId: string): KalodataProductDetailEnrichmentRecord {
  return {
    productId,
    productShopId: '749500112233',
    sellerName: 'Siam Glow Official',
    minPriceThb: 229,
    maxPriceThb: 289,
    unitPriceThb: 259,
    revenueThb: 621600,
    salesVolume: 2400,
    revenueGrowthRate: 24.5,
    videoRevenueThb: 420000,
    liveRevenueThb: 110000,
    shoppingMallRevenueThb: null,
    showcaseRevenueThb: 91600,
    commissionRatePct: 15,
    creatorNumber: 34,
    videoNumber: 48,
    liveNumber: 6,
    skuCount: 3,
    deliveryType: 'LOCAL',
    productReviewCount: 312,
    launchDate: '2026-04-12',
    trendPointsCount: 0,
    trendPeakThb: null,
    trendAvgThb: null,
    dateRange: 'last30Day',
    updatedAt: '2026-11-21T11:00:00.000Z',
  };
}

function makeMockReviewInsight(productId: string): KalodataReviewInsightData {
  return {
    productId,
    summary: 'Buyers praise lightweight absorption; minor transit pump cap complaints.',
    positivePoints: [{ point: 'Fast absorption', mentions: 14 }],
    painPoints: [{ point: 'Cap loosened during transit', mentions: 2 }],
    frequentComplaints: [{ point: 'Pump cap loose in transit', mentions: 2 }],
    qualityCautions: [{ point: 'Check bottle seal on delivery', mentions: 1 }],
    buyerNeeds: [{ point: 'Daily lightweight hydration', mentions: 11 }],
    usageScenarios: [{ point: 'Morning skincare', mentions: 9 }],
    commentsAnalyzed: 18,
    averageRating: null,
    ratedCommentCount: 0,
    updatedAt: '2026-11-21T11:05:00.000Z',
  };
}

function makeMockAiStrategyResponse(
  modulesSynthesized: DeepDiveAnalysisId[]
): DeepDiveAiApiResponse {
  return {
    ok: true,
    strategy: {
      verdict: 'priority-test',
      headlineEn: 'High-demand skincare product with verified 15% commission',
      headlineMy: 'ဝယ်လိုအားကောင်းပြီး 15% ကော်မရှင် အတည်ပြုပြီး Skincare Product',
      summaryEn:
        'Verified 2,400 monthly sales and 15% affiliate commission support short-video testing.',
      summaryMy:
        'တစ်လရောင်းအား 2,400 ခုနှင့် 15% ကော်မရှင်တို့ကြောင့် Video တိုများဖြင့် စမ်းသပ်သင့်သည်။',
      strengthsEn: ['Verified 15% commission (฿38.85/sale)', 'Video channel drives 67.6% of GMV'],
      strengthsMy: ['15% ကော်မရှင် (တစ်ခု ฿38.85)', 'Video Channel မှ GMV 67.6% ရရှိ'],
      weaknessesEn: ['Official 5-star customer rating unavailable'],
      weaknessesMy: ['တရားဝင် 5-Star Rating မရရှိနိုင်ပါ'],
      risksEn: ['Transit pump cap leakage mentioned in buyer complaints'],
      risksMy: ['ပို့ဆောင်စဉ် ပန့်အဖုံးလျော့နိုင်ကြောင်း Review ရှိသည်'],
      targetAudienceEn: 'Thailand skincare shoppers aged 20-35 seeking lightweight daily toners',
      targetAudienceMy: 'နေ့စဉ်သုံး ပေါ့ပါးသော Toner ရှာဖွေသည့် အသက် ၂၀-၃၅ ထိုင်းဝယ်သူများ',
      videoIdeasEn: ['3-second texture absorption test on hand'],
      videoIdeasMy: ['လက်ပေါ်တွင် ၃ စက္ကန့်အတွင်း စိမ့်ဝင်မှု စမ်းပြခြင်း'],
      affiliateStrategyEn: 'Publish 3 concise texture demos highlighting local Thailand shipping.',
      affiliateStrategyMy: 'ထိုင်းပြည်တွင်းပို့ဆောင်မှုနှင့် အသားစမ်းပြ ဗီဒီယို ၃ ပုဒ်ဖြင့် စတင်ပါ။',
      goNoGoReasonEn: 'Strong verified unit economics and clear video-driven demand.',
      goNoGoReasonMy: 'အမြတ်တွက်ချေကိုက်ပြီး Video မှ ရောင်းအားကောင်းသည်။',
      dataLimitationsEn: ['Daily/Weekly/Monthly trend series API is Unavailable / Not Verified'],
      dataLimitationsMy: ['Daily/Weekly/Monthly Trend API မရရှိနိုင်သေးပါ'],
      modelUsed: 'gemini-3.1-flash-lite',
      modulesSynthesized,
      generatedAt: '2026-11-21T11:10:00.000Z',
      tokenUsage: {
        promptTokens: 540,
        outputTokens: 280,
        totalTokens: 820,
        pricingStatus: 'unavailable',
        costNoteEn: 'Gemini API cost: Estimated / Unavailable (separate Google Gemini API billing).',
        costNoteMy: 'Gemini API ကုန်ကျစရိတ်: ခန့်မှန်း/မတွက်နိုင်သေး (သီးခြားကောက်ခံသည်)။',
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Phase 9.5.1: Fast / Balanced / Deep Research -> Deep Dive & Zero Duplication
// ---------------------------------------------------------------------------
test('Phase 9.5.1: Fast, Balanced, and Deep Research all connect to Deep Dive with zero product mutation and zero cross-mode duplicate data', async () => {
  installMemoryStorage();

  const fastProd = makeProductForMode({
    mode: 'fast',
    id: 'kd_1749500000011',
    kalodataProductId: 'kd_1749500000011',
  });
  const balancedProd = makeProductForMode({
    mode: 'balanced',
    id: 'kalodata-th-1749500000011',
    kalodataProductId: 'kalodata-th-1749500000011',
  });
  const deepProd = makeProductForMode({
    mode: 'deep',
    id: '1749500000011',
    kalodataProductId: '1749500000011',
  });
  const peerProd = makeProductForMode({
    mode: 'fast',
    id: 'kd_1749500000099',
    kalodataProductId: '1749500000099',
    name: 'Peer Vitamin C Serum',
    priceThb: 310,
    commissionRate: 12,
    salesVolume: 1100,
    revenueThb: 341000,
  });

  // Snapshot original product objects & 7-Factor rankings before Deep Dive
  const fastSnapshot = JSON.stringify(fastProd);
  const balancedSnapshot = JSON.stringify(balancedProd);
  const deepSnapshot = JSON.stringify(deepProd);
  const rankingsBefore = Array.from(evaluateProductBatch([fastProd, peerProd]).entries()).map(
    ([id, ev]) => [id, ev.totalScore]
  );

  // All 3 research modes resolve to ONE canonical product ID
  const fastCtx = buildDeepDiveTargetContext(fastProd, 'hunting', 'fast');
  const balancedCtx = buildDeepDiveTargetContext(balancedProd, 'hunting', 'balanced');
  const deepCtx = buildDeepDiveTargetContext(deepProd, 'history', 'deep');

  assert.equal(fastCtx.originResearchMode, 'fast');
  assert.equal(balancedCtx.originResearchMode, 'balanced');
  assert.equal(deepCtx.originResearchMode, 'deep');
  assert.equal(fastCtx.canonicalProductId, '1749500000011');
  assert.equal(balancedCtx.canonicalProductId, '1749500000011');
  assert.equal(deepCtx.canonicalProductId, '1749500000011');

  // Absorb Balanced & Deep products into enrichment cache -> must canonicalize to ONE key (no duplicates!)
  absorbProductsIntoEnrichmentCache([balancedProd, deepProd]);
  const rawCache = JSON.parse(globalThis.localStorage.getItem(ENRICHMENT_CACHE_STORAGE_KEY) || '{}');
  assert.deepEqual(Object.keys(rawCache.products), ['1749500000011']);
  assert.deepEqual(Object.keys(rawCache.reviews), ['1749500000011']);

  // Fast product immediately hits the canonical cache at 0 credits!
  const fastCached = getCachedEnrichmentForProduct(fastProd);
  assert.ok(fastCached.productDetail);
  assert.ok(fastCached.reviewInsight);
  const fastEstAfterDeep = estimateDeepDiveExecutionCost(
    fastProd,
    ['product-intelligence', 'customer-review-intelligence'],
    { cacheSnapshot: fastCached }
  );
  assert.equal(fastEstAfterDeep.estimatedCredits, 0);
  assert.equal(fastEstAfterDeep.plannedKalodataApiCalls, 0);

  // Running Deep Dive across all 3 contexts writes to ONE shared per-product History bucket (zero duplicates)
  for (const ctx of [fastCtx, balancedCtx, deepCtx]) {
    const out = await runDeepDiveModules({
      product: ctx.product,
      analysisIds: ['affiliate-profit-analysis', 'market-competitor-comparison'],
      peerProducts: [ctx.product, peerProd],
      requireExplicitConfirmation: true,
      deps: { nowIsoFn: () => `2026-11-21T12:00:00.000Z` },
    });
    assert.equal(out.completedIds.length, 2);
    assert.equal(out.totalKalodataApiCalls, 0);
    const rec = createDeepDiveHistoryRecord({
      canonicalProductId: ctx.canonicalProductId,
      productName: ctx.product.name,
      productNameMy: ctx.product.nameMy,
      analysisIds: ['affiliate-profit-analysis', 'market-competitor-comparison'],
      slots: out.slots,
      runSummary: out.runSummary,
      runType: 'initial',
    });
    appendDeepDiveHistoryRecord(rec);
  }

  const allHistoryMap = loadAllDeepDiveHistoryByProduct();
  assert.deepEqual(Object.keys(allHistoryMap), ['1749500000011']);
  assert.equal(loadDeepDiveHistoryForProduct('1749500000011').length, 3);

  // Original ResearchProduct objects and 7-Factor rankings remain 100% untouched
  assert.equal(JSON.stringify(fastProd), fastSnapshot);
  assert.equal(JSON.stringify(balancedProd), balancedSnapshot);
  assert.equal(JSON.stringify(deepProd), deepSnapshot);
  const rankingsAfter = Array.from(evaluateProductBatch([fastProd, peerProd]).entries()).map(
    ([id, ev]) => [id, ev.totalScore]
  );
  assert.deepEqual(rankingsAfter, rankingsBefore);
});

// ---------------------------------------------------------------------------
// Phase 9.5.2: All 8 Deep Dive Modules — Local vs External API vs AI & Honesty
// ---------------------------------------------------------------------------
test('Phase 9.5.2: All 8 Deep Dive modules execute end-to-end, separate Local vs External API vs AI, and honestly mark unavailable APIs', async () => {
  installMemoryStorage();
  const fastProd = makeProductForMode({
    mode: 'fast',
    id: 'kd_1749500000022',
    kalodataProductId: '1749500000022',
  });
  const peerProd = makeProductForMode({
    mode: 'fast',
    id: 'kd_1749500000088',
    kalodataProductId: '1749500000088',
    name: 'Competing Hydrating Essence',
    priceThb: 299,
    commissionRate: 10,
    salesVolume: 1200,
    revenueThb: 358800,
  });

  const enrichCalls: DeepDiveEnrichRequestPayload[] = [];
  let aiCalls = 0;

  const outcome = await runDeepDiveModules({
    product: fastProd,
    analysisIds: [...ALL_DEEP_DIVE_ANALYSIS_IDS],
    peerProducts: [fastProd, peerProd],
    spendingLimitCredits: 2.0,
    requireExplicitConfirmation: true,
    userConfirmedPaidExecution: true,
    deps: {
      enrichProductFn: async (payload): Promise<DeepDiveEnrichResponsePayload> => {
        enrichCalls.push(payload);
        if (payload.requestedLayers.productDetail) {
          const pd = makeMockProductDetail('1749500000022');
          return {
            ok: true,
            productDetail: pd,
            summary: makeEnrichSummary({
              productId: '1749500000022',
              apiCalls: 1,
              credits: 0.1,
              layerResults: { productDetail: 'fetched', shopDetail: 'skipped', reviewInsights: 'skipped' },
              balanceBefore: 50,
              balanceAfter: 49.9,
            }),
          };
        }
        if (payload.requestedLayers.reviewInsights) {
          const ri = makeMockReviewInsight('1749500000022');
          return {
            ok: true,
            reviewInsight: ri,
            summary: makeEnrichSummary({
              productId: '1749500000022',
              apiCalls: 1,
              credits: 1.0,
              layerResults: { productDetail: 'skipped', shopDetail: 'skipped', reviewInsights: 'fetched' },
              balanceBefore: 49.9,
              balanceAfter: 48.9,
            }),
          };
        }
        return { ok: false, code: 'UNEXPECTED', error: 'Unexpected layer request' };
      },
      runAiStrategyFn: async (payload) => {
        aiCalls += 1;
        return makeMockAiStrategyResponse(payload.completedModules.map((m) => m.analysisId));
      },
      nowIsoFn: () => '2026-11-21T11:15:00.000Z',
    },
  });

  // All 8 modules completed cleanly
  assert.equal(outcome.blockedReason, null);
  assert.equal(outcome.failedIds.length, 0);
  assert.equal(outcome.completedIds.length, 8);

  // Shared product/detail deduplication: #1, #2, #4, #5 shared ONE 0.1 cr call + #6 1.0 cr = 2 calls (1.1 cr total!)
  assert.equal(enrichCalls.length, 2);
  assert.equal(outcome.totalKalodataApiCalls, 2);
  assert.equal(outcome.totalCreditsUsed, 1.1);
  assert.equal(aiCalls, 1);

  // Local vs External vs AI separation
  assert.equal(outcome.slots['affiliate-profit-analysis']?.result?.apiCallsMade, 0);
  assert.equal(outcome.slots['market-competitor-comparison']?.result?.apiCallsMade, 0);
  assert.equal(outcome.slots['ai-strategic-recommendation']?.result?.isAiInterpretation, true);
  assert.equal(outcome.slots['ai-strategic-recommendation']?.result?.creditsUsed, 0);
  assert.equal(outcome.slots['ai-strategic-recommendation']?.result?.aiApiCallsMade, 1);

  for (const id of ALL_DEEP_DIVE_ANALYSIS_IDS) {
    if (id !== 'ai-strategic-recommendation') {
      assert.equal(
        outcome.slots[id]?.result?.isAiInterpretation,
        false,
        `${id} must NEVER be marked isAiInterpretation`
      );
    }
  }

  // Honest Unavailable disclosure for unverified APIs (never fabricated)
  assert.ok(
    outcome.slots['sales-market-intelligence']?.result?.unavailableNotesEn.some((n) =>
      n.includes('Unavailable')
    )
  );
  assert.ok(
    outcome.slots['creator-competition-analysis']?.result?.unavailableNotesEn.some((n) =>
      n.includes('Unavailable')
    )
  );
  assert.ok(
    outcome.slots['video-intelligence']?.result?.unavailableNotesEn.some((n) =>
      n.includes('Unavailable')
    )
  );
});

// ---------------------------------------------------------------------------
// Phase 9.5.3: Single-Module Rerun, Cache Reuse & Cost Estimation vs Actual
// ---------------------------------------------------------------------------
test('Phase 9.5.3: Pre-run cost estimate matches actual cost, cache rerun costs 0 cr, and Refresh Live requires confirmation', async () => {
  installMemoryStorage();
  const fastProd = makeProductForMode({
    mode: 'fast',
    id: 'kd_1749500000033',
    kalodataProductId: '1749500000033',
  });

  // 1. Pre-run estimate for 4 productDetail-backed modules shares 1 call = 0.1 cr
  const batchIds: DeepDiveAnalysisId[] = [
    'product-intelligence',
    'sales-market-intelligence',
    'creator-competition-analysis',
    'video-intelligence',
  ];
  const est = estimateDeepDiveExecutionCost(fastProd, batchIds);
  assert.equal(est.plannedKalodataApiCalls, 1);
  assert.equal(est.estimatedCredits, 0.1);
  assert.equal(est.requiresExplicitConfirmation, true);

  let apiCalls = 0;
  const run1 = await runDeepDiveModules({
    product: fastProd,
    analysisIds: batchIds,
    spendingLimitCredits: 1.5,
    requireExplicitConfirmation: true,
    userConfirmedPaidExecution: true,
    deps: {
      enrichProductFn: async () => {
        apiCalls += 1;
        return {
          ok: true,
          productDetail: makeMockProductDetail('1749500000033'),
          summary: makeEnrichSummary({
            productId: '1749500000033',
            apiCalls: 1,
            credits: 0.1,
            layerResults: { productDetail: 'fetched', shopDetail: 'skipped', reviewInsights: 'skipped' },
          }),
        };
      },
      nowIsoFn: () => '2026-11-21T11:20:00.000Z',
    },
  });

  assert.equal(apiCalls, 1);
  assert.equal(run1.runSummary?.estimatedKalodataCredits, 0.1);
  assert.equal(run1.runSummary?.actualKalodataCredits, 0.1);

  // 2. Single-module Cache Re-run on any of those modules uses cache (0 cr, 0 API calls, no confirmation needed)
  const rerunCache = await runDeepDiveModules({
    product: fastProd,
    analysisIds: ['creator-competition-analysis'],
    existingSlots: run1.slots,
    spendingLimitCredits: 1.5,
    requireExplicitConfirmation: true,
    userConfirmedPaidExecution: false,
    forceRefresh: false,
    deps: {
      enrichProductFn: async () => {
        apiCalls += 1;
        throw new Error('Should NOT call paid API when cached!');
      },
    },
  });
  assert.equal(rerunCache.blockedReason, null);
  assert.equal(rerunCache.totalKalodataApiCalls, 0);
  assert.equal(rerunCache.totalCreditsUsed, 0);
  assert.equal(apiCalls, 1);

  // 3. Refresh Live (forceRefresh: true) MUST require explicit confirmation (blocked without confirmation)
  const blockedRefresh = await runDeepDiveModules({
    product: fastProd,
    analysisIds: ['creator-competition-analysis'],
    existingSlots: run1.slots,
    spendingLimitCredits: 1.5,
    requireExplicitConfirmation: true,
    userConfirmedPaidExecution: false,
    forceRefresh: true,
    deps: {
      enrichProductFn: async () => {
        apiCalls += 1;
        throw new Error('Should NOT call paid API without confirmation!');
      },
    },
  });
  assert.equal(blockedRefresh.blockedReason, 'CONFIRMATION_REQUIRED');
  assert.equal(apiCalls, 1);
});

// ---------------------------------------------------------------------------
// Phase 9.5.4: Cost & Budget Security — Server Confirmation, Concurrency, Restart, Fail-Closed
// ---------------------------------------------------------------------------
test('Phase 9.5.4: Cost & Budget Security enforces persistent limits across instances/restarts, blocks unconfirmed & forged calls, and fails closed', async () => {
  clearServerEnrichmentCache();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'siampick-p95-sec-'));
  const dbPath = path.join(tmpDir, 'budget.sqlite');
  const scopeKey = 'acct:phase95-sec-test:day-2026-11-21';

  const originalFetch = globalThis.fetch;
  const originalKey = process.env.KALODATA_API_KEY;
  process.env.KALODATA_API_KEY = 'test-kalodata-secret-key';

  let upstreamPaidCalls = 0;
  let mockBalance = 100;

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes('credit') || url.includes('balance')) {
      return new Response(JSON.stringify({ success: true, data: { balance: mockBalance } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    upstreamPaidCalls += 1;
    mockBalance = Math.round((mockBalance - 0.1) * 1000) / 1000;
    await new Promise((r) => setTimeout(r, 20));
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          product_id: '1749500000044',
          product_name: 'Secured Test Product',
          unit_price: 250,
          revenue: 500000,
          sale: 2000,
          commission_rate: 15,
          creator_num: 20,
          video_num: 30,
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }) as typeof fetch;

  try {
    // 1. Server.ts hardening verification (unconditional confirmation & disabled direct paid proxies)
    const serverSrc = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
    assert.ok(serverSrc.includes("code: 'DIRECT_PAID_PROXY_DISABLED'"));
    assert.ok(serverSrc.includes('const requireExplicitConfirmation = true;'));
    assert.ok(serverSrc.includes("if (body?.userConfirmedPaidExecution !== true)"));

    // 2. Persistent SQLite WAL Ledger across two separate instances (simulating multi-instance + restart)
    const ledgerA = createBudgetLedger({
      sqlitePath: dbPath,
      upstashRestUrl: '',
      upstashRestToken: '',
      requireDistributedStore: false,
      hardCapCredits: 10,
    });
    const ledgerB = createBudgetLedger({
      sqlitePath: dbPath,
      upstashRestUrl: '',
      upstashRestToken: '',
      requireDistributedStore: false,
      hardCapCredits: 10,
    });

    await ledgerA.setConfiguredSpendingLimit(scopeKey, 0.1);

    const p1 = makeProductForMode({
      mode: 'fast',
      id: 'kd_1749500000041',
      kalodataProductId: '1749500000041',
    });
    const p2 = makeProductForMode({
      mode: 'fast',
      id: 'kd_1749500000042',
      kalodataProductId: '1749500000042',
    });

    // Unconfirmed call MUST fail with CONFIRMATION_REQUIRED & 0 upstream calls
    await assert.rejects(
      () =>
        enrichSingleProduct({
          product: p1,
          requestedLayers: { productDetail: true, shopDetail: false, reviewInsights: false },
          requireExplicitConfirmation: true,
          userConfirmedPaidExecution: false,
          budgetLedger: ledgerA,
          budgetScopeKey: scopeKey,
        }),
      (err: unknown) =>
        err instanceof EnrichmentApiError && err.code === 'CONFIRMATION_REQUIRED'
    );
    assert.equal(upstreamPaidCalls, 0);

    // Concurrent calls across Instance A & Instance B with 0.1 cr limit + forged client spendingLimitCredits: 9.9 & sessionCreditsAlreadySpent: 0
    const [resA, resB] = await Promise.allSettled([
      enrichSingleProduct({
        product: p1,
        requestedLayers: { productDetail: true, shopDetail: false, reviewInsights: false },
        spendingLimitCredits: 9.9, // Forged high limit — server ignores!
        sessionCreditsAlreadySpent: 0, // Forged 0 spend — server ignores!
        idempotencyKey: 'p95:concurrent:p1',
        requireExplicitConfirmation: true,
        userConfirmedPaidExecution: true,
        budgetLedger: ledgerA,
        budgetScopeKey: scopeKey,
      }),
      enrichSingleProduct({
        product: p2,
        requestedLayers: { productDetail: true, shopDetail: false, reviewInsights: false },
        spendingLimitCredits: 9.9, // Forged high limit — server ignores!
        sessionCreditsAlreadySpent: 0,
        idempotencyKey: 'p95:concurrent:p2',
        requireExplicitConfirmation: true,
        userConfirmedPaidExecution: true,
        budgetLedger: ledgerB,
        budgetScopeKey: scopeKey,
      }),
    ]);

    const fulfilled = [resA, resB].filter((r) => r.status === 'fulfilled');
    const rejected = [resA, resB].filter((r) => r.status === 'rejected');
    assert.equal(fulfilled.length, 1, 'Exactly 1 concurrent call allowed under 0.1 cr limit');
    assert.equal(rejected.length, 1, 'Second concurrent call MUST be blocked');
    assert.equal(upstreamPaidCalls, 1, 'Only 1 upstream Kalodata API call executed');

    // Server Restart Simulation: Brand new ledger instance reads persisted 0.1 cr spend from disk
    const ledgerAfterRestart = createBudgetLedger({
      sqlitePath: dbPath,
      upstashRestUrl: '',
      upstashRestToken: '',
      requireDistributedStore: false,
      hardCapCredits: 10,
    });
    const snapAfterRestart = await ledgerAfterRestart.getScopeSnapshot(scopeKey);
    assert.equal(snapAfterRestart.spentCredits, 0.1);
    assert.equal(snapAfterRestart.remainingCredits, 0);

    // Duplicate replay with same idempotencyKey blocked (HTTP 409)
    await assert.rejects(
      () =>
        enrichSingleProduct({
          product: p1,
          requestedLayers: { productDetail: true, shopDetail: false, reviewInsights: false },
          forceRefresh: true,
          idempotencyKey: 'p95:concurrent:p1',
          requireExplicitConfirmation: true,
          userConfirmedPaidExecution: true,
          budgetLedger: ledgerAfterRestart,
          budgetScopeKey: scopeKey,
        }),
      (err: unknown) =>
        err instanceof EnrichmentApiError &&
        (err.status === 409 || err.code === 'SPENDING_LIMIT_EXCEEDED')
    );
    assert.equal(upstreamPaidCalls, 1);

    // Fail-Closed when persistent storage is disabled or experiencing runtime outage -> HTTP 503 BUDGET_STORAGE_UNAVAILABLE & 0 calls
    assert.throws(
      () => createBudgetLedger({ forceDisabled: true, hardCapCredits: 10 }),
      (err: unknown) =>
        err instanceof Error &&
        (err as { status?: number; code?: string }).status === 503 &&
        (err as { code?: string }).code === 'BUDGET_STORAGE_UNAVAILABLE'
    );

    const outageLedger = createBudgetLedger({
      upstashRestUrl: 'https://outage-test.upstash.invalid',
      upstashRestToken: 'test-token',
      hardCapCredits: 10,
      fetchFn: (async () => {
        throw new Error('Simulated Upstash Redis network outage');
      }) as typeof fetch,
    });
    const p3 = makeProductForMode({
      mode: 'fast',
      id: 'kd_1749500000043',
      kalodataProductId: '1749500000043',
    });
    await assert.rejects(
      () =>
        enrichSingleProduct({
          product: p3,
          requestedLayers: { productDetail: true, shopDetail: false, reviewInsights: false },
          requireExplicitConfirmation: true,
          userConfirmedPaidExecution: true,
          budgetLedger: outageLedger,
          budgetScopeKey: scopeKey,
        }),
      (err: unknown) =>
        err instanceof EnrichmentApiError &&
        err.status === 503 &&
        err.code === 'BUDGET_STORAGE_UNAVAILABLE'
    );
    assert.equal(upstreamPaidCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.KALODATA_API_KEY;
    else process.env.KALODATA_API_KEY = originalKey;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Phase 9.5.5: Error & Recovery — Timeout, Rate Limit, Invalid Response, Network Failure, Retry
// ---------------------------------------------------------------------------
test('Phase 9.5.5: Handles API Timeout, Rate Limit, Invalid Response, Network Failure with isolated partial results and 0-extra-credit retry', async () => {
  installMemoryStorage();
  const fastProd = makeProductForMode({
    mode: 'fast',
    id: 'kd_1749500000055',
    kalodataProductId: '1749500000055',
  });
  const peerProd = makeProductForMode({
    mode: 'fast',
    id: 'kd_1749500000056',
    kalodataProductId: '1749500000056',
    name: 'Peer Product',
  });

  // Scenario A: Partial Failure — #1 succeeds (populates cache), #6 fails with TIMEOUT, #8 fails with RATE_LIMITED
  let pdFetchCount = 0;
  let reviewAttemptCount = 0;
  const partialRun = await runDeepDiveModules({
    product: fastProd,
    analysisIds: [
      'product-intelligence',
      'affiliate-profit-analysis',
      'customer-review-intelligence',
      'market-competitor-comparison',
      'ai-strategic-recommendation',
    ],
    peerProducts: [fastProd, peerProd],
    spendingLimitCredits: 2.0,
    requireExplicitConfirmation: true,
    userConfirmedPaidExecution: true,
    deps: {
      enrichProductFn: async (payload) => {
        if (payload.requestedLayers.productDetail) {
          pdFetchCount += 1;
          return {
            ok: true,
            productDetail: makeMockProductDetail('1749500000055'),
            summary: makeEnrichSummary({
              productId: '1749500000055',
              apiCalls: 1,
              credits: 0.1,
              layerResults: { productDetail: 'fetched', shopDetail: 'skipped', reviewInsights: 'skipped' },
            }),
          };
        }
        reviewAttemptCount += 1;
        const abortErr = new Error('Request timed out');
        abortErr.name = 'AbortError';
        throw abortErr;
      },
      runAiStrategyFn: async () => ({
        ok: false,
        code: 'RATE_LIMITED',
        error: 'Gemini AI rate limit reached (HTTP 429).',
        errorMy: 'Gemini AI အသုံးပြုမှု ကန့်သတ်ချက် ပြည့်နေပါသည် (HTTP 429)။',
      }),
      nowIsoFn: () => '2026-11-21T11:30:00.000Z',
    },
  });

  // Partial results preserved cleanly; isolated errors never break other modules
  assert.equal(partialRun.completedIds.includes('product-intelligence'), true);
  assert.equal(partialRun.completedIds.includes('affiliate-profit-analysis'), true);
  assert.equal(partialRun.completedIds.includes('market-competitor-comparison'), true);
  assert.equal(partialRun.slots['customer-review-intelligence']?.status, 'error');
  assert.equal(partialRun.slots['customer-review-intelligence']?.error?.code, 'TIMEOUT');
  assert.ok(partialRun.slots['customer-review-intelligence']?.error?.messageMy);
  assert.equal(partialRun.slots['ai-strategic-recommendation']?.status, 'error');
  assert.equal(partialRun.slots['ai-strategic-recommendation']?.error?.code, 'RATE_LIMITED');
  assert.equal(pdFetchCount, 1);
  assert.equal(reviewAttemptCount, 1);

  // Scenario B: Retry batch — #1 MUST reuse cache (0 extra paid calls!), while #6 succeeds on retry
  const retryRun = await runDeepDiveModules({
    product: fastProd,
    analysisIds: ['product-intelligence', 'customer-review-intelligence'],
    existingSlots: partialRun.slots,
    spendingLimitCredits: 2.0,
    requireExplicitConfirmation: true,
    userConfirmedPaidExecution: true,
    deps: {
      enrichProductFn: async (payload) => {
        if (payload.requestedLayers.productDetail) {
          pdFetchCount += 1;
          throw new Error('Product Detail MUST reuse cache on retry!');
        }
        reviewAttemptCount += 1;
        return {
          ok: true,
          reviewInsight: makeMockReviewInsight('1749500000055'),
          summary: makeEnrichSummary({
            productId: '1749500000055',
            apiCalls: 1,
            credits: 1.0,
            layerResults: { productDetail: 'skipped', shopDetail: 'skipped', reviewInsights: 'fetched' },
          }),
        };
      },
      nowIsoFn: () => '2026-11-21T11:32:00.000Z',
    },
  });

  assert.equal(pdFetchCount, 1, 'Product Detail was reused from cache on retry (0 extra calls)');
  assert.equal(reviewAttemptCount, 2);
  assert.equal(retryRun.slots['product-intelligence']?.result?.apiCallsMade, 0);
  assert.equal(retryRun.slots['customer-review-intelligence']?.status, 'completed');

  // Scenario C: Network Failure & Invalid/Non-JSON HTTP 502 via real default fetch wrappers
  const originalFetch = globalThis.fetch;
  try {
    // 1. Network failure on Refresh Live of #1 MUST preserve previous verified result!
    globalThis.fetch = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;

    const netFailRun = await runDeepDiveModules({
      product: fastProd,
      analysisIds: ['product-intelligence'],
      existingSlots: retryRun.slots,
      forceRefresh: true,
      spendingLimitCredits: 2.0,
      requireExplicitConfirmation: true,
      userConfirmedPaidExecution: true,
    });
    assert.equal(netFailRun.slots['product-intelligence']?.status, 'error');
    assert.equal(netFailRun.slots['product-intelligence']?.error?.code, 'NETWORK_ERROR');
    assert.ok(
      netFailRun.slots['product-intelligence']?.result !== null,
      'Previous verified result MUST be preserved when network fails on refresh'
    );

    // 2. Non-JSON HTTP 502 Bad Gateway on AI Strategy returns HTTP_502 with friendly bilingual invalid-response message
    globalThis.fetch = (async () => {
      return new Response('<html>502 Bad Gateway</html>', {
        status: 502,
        headers: { 'Content-Type': 'text/html' },
      });
    }) as typeof fetch;

    const badGwRun = await runDeepDiveModules({
      product: fastProd,
      analysisIds: ['ai-strategic-recommendation'],
      existingSlots: retryRun.slots,
      requireExplicitConfirmation: true,
      userConfirmedPaidExecution: true,
    });
    assert.equal(badGwRun.slots['ai-strategic-recommendation']?.status, 'error');
    assert.equal(badGwRun.slots['ai-strategic-recommendation']?.error?.code, 'HTTP_502');
    assert.ok(badGwRun.slots['ai-strategic-recommendation']?.error?.messageMy);

    // 3. Corrupted non-JSON HTTP 200 response returns INVALID_RESPONSE cleanly
    globalThis.fetch = (async () => {
      return new Response('NOT_VALID_JSON{{{', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    const corruptJsonRun = await runDeepDiveModules({
      product: fastProd,
      analysisIds: ['ai-strategic-recommendation'],
      existingSlots: retryRun.slots,
      requireExplicitConfirmation: true,
      userConfirmedPaidExecution: true,
    });
    assert.equal(corruptJsonRun.slots['ai-strategic-recommendation']?.status, 'error');
    assert.equal(corruptJsonRun.slots['ai-strategic-recommendation']?.error?.code, 'INVALID_RESPONSE');
    assert.ok(corruptJsonRun.slots['ai-strategic-recommendation']?.error?.messageMy);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ---------------------------------------------------------------------------
// Phase 9.5.6: Final Report, History Hydration & Production UI/UX Audit
// ---------------------------------------------------------------------------
test('Phase 9.5.6: History hydration, 8-section Final Report, exports, and Production UI/UX guardrails pass', async () => {
  installMemoryStorage();
  const prod = makeProductForMode({
    mode: 'balanced',
    id: 'kd_1749500000066',
    kalodataProductId: '1749500000066',
  });
  saveEnrichmentToCache({ reviewInsight: makeMockReviewInsight('1749500000066') });

  const ctx = buildDeepDiveTargetContext(prod, 'hunting', 'balanced');
  const outcome = await runDeepDiveModules({
    product: prod,
    analysisIds: ['product-intelligence', 'affiliate-profit-analysis', 'customer-review-intelligence'],
    requireExplicitConfirmation: true,
    userConfirmedPaidExecution: false, // 0 paid calls because balanced + cached review
    deps: { nowIsoFn: () => '2026-11-21T12:15:00.000Z' },
  });

  const histRec = createDeepDiveHistoryRecord({
    canonicalProductId: ctx.canonicalProductId,
    productName: prod.name,
    productNameMy: prod.nameMy,
    analysisIds: ['product-intelligence', 'affiliate-profit-analysis', 'customer-review-intelligence'],
    slots: outcome.slots,
    runSummary: outcome.runSummary,
    runType: 'initial',
  });
  appendDeepDiveHistoryRecord(histRec);

  const hydrated = hydrateWorkspaceStateFromHistory(
    createInitialDeepDiveWorkspaceState(),
    loadDeepDiveHistoryForProduct(ctx.canonicalProductId)
  );
  assert.equal(hydrated.slots['product-intelligence'].status, 'completed');
  assert.equal(hydrated.slots['customer-review-intelligence'].status, 'completed');
  assert.equal(hydrated.slots['ai-strategic-recommendation'].status, 'idle');

  const report = buildDeepDiveFinalReport({
    context: ctx,
    slots: hydrated.slots,
    salesWeightPct: 50,
    generatedAt: '2026-11-21T12:16:00.000Z',
  });
  assert.equal(report.sections.length, 8);
  assert.equal(report.aiVerdict, null);
  assert.ok(buildDeepDiveReportMarkdown(report, 'en').includes('Deep Dive Final Report'));
  assert.ok(buildDeepDiveReportMarkdown(report, 'my').includes('Deep Dive စုစည်းအစီရင်ခံစာ'));
  const jsonText = buildDeepDiveReportJson(report);
  assert.equal(JSON.parse(jsonText).canonicalProductId, '1749500000066');

  // Production UI/UX & Security Static Guardrail Audit
  const workspaceView = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/DeepDiveWorkspaceView.tsx'),
    'utf8'
  );
  const appSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf8');
  const enrichSectionSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/DataEnrichmentSection.tsx'),
    'utf8'
  );

  // Zero network calls inside presentation component
  assert.equal(workspaceView.includes('fetch('), false);
  assert.equal(workspaceView.includes('/api/'), false);

  // Responsive Tailwind classes present for Mobile & Desktop
  assert.ok(workspaceView.includes('sm:'));
  assert.ok(workspaceView.includes('md:'));

  // Key Phase 9.1–9.5 flows present in UI
  assert.ok(workspaceView.includes('data-testid="deep-dive-final-report"'));
  assert.ok(workspaceView.includes('data-testid="deep-dive-analysis-history"'));
  assert.ok(workspaceView.includes('data-testid="deep-dive-budget-storage-unavailable"'));
  assert.ok(workspaceView.includes('Re-run (Cache)'));
  assert.ok(workspaceView.includes('Refresh Live'));

  // No hardcoded mock/fake data strings in Deep Dive workspace
  assert.equal(/mockProduct|fakeMetrics|dummyData/i.test(workspaceView), false);

  // Client double-click lock & ResearchMode propagation wired in App.tsx
  assert.ok(appSrc.includes('deepDiveInFlightKeysRef'));
  assert.ok(appSrc.includes('historyResearchMode'));
  assert.ok(enrichSectionSrc.includes('userConfirmedPaidExecution: true'));
  assert.ok(getCanonicalProductId(prod) === '1749500000066');
});
