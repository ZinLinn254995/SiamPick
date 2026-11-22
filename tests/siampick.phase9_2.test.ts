import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import type {
  KalodataProductDetailEnrichmentRecord,
  KalodataReviewInsightData,
  KalodataShopEnrichmentRecord,
  ProductEnrichmentExecutionSummary,
  ResearchMode,
  ResearchProduct,
} from '../src/types/product.ts';
import type {
  DeepDiveAnalysisId,
  DeepDiveCompletedModuleDigest,
} from '../src/types/deepDive.ts';
import {
  ALL_DEEP_DIVE_ANALYSIS_IDS,
  getDeepDiveOptionById,
} from '../src/utils/deepDiveRegistry.ts';
import {
  estimateDeepDiveExecutionCost,
  runDeepDiveModules,
  type DeepDiveAiApiResponse,
  type DeepDiveCacheSnapshot,
  type DeepDiveEnrichRequestPayload,
  type DeepDiveEnrichResponsePayload,
} from '../src/utils/deepDiveEngine.ts';
import { mergeEnrichmentIntoProduct } from '../src/utils/enrichmentPlanner.ts';
import { evaluateProductBatch, evaluateProductOpportunity } from '../src/utils/scoring.ts';
import {
  clearServerEnrichmentCache,
  enrichSingleProduct,
} from '../server/enrichmentService.ts';
import {
  buildDeepDiveAiPrompt,
  generateDeepDiveAiStrategy,
  validateDeepDiveStrategyJson,
} from '../server/deepDiveAiService.ts';

function makeProduct(opts: {
  id: string;
  mode?: ResearchMode;
  category?: 'womens-fashion' | 'cosmetics-beauty';
  priceThb?: number | null;
  commissionRate?: number | null;
  commissionVerified?: boolean;
  salesVolume?: number | null;
  revenueThb?: number | null;
  creatorNumber?: number | null;
  videoNumber?: number | null;
  videoRevenueThb?: number | null;
  customerRating?: number | null;
  reviewCount?: number | null;
  withProductDetail?: boolean;
  withReviewInsight?: boolean;
  withMyanmarVideos?: boolean;
}): ResearchProduct {
  const mode = opts.mode ?? 'fast';
  const category = opts.category ?? 'womens-fashion';
  const numericId = opts.id.replace(/^(kalodata-th-|kd[_-])/i, '');
  const priceThb = opts.priceThb === undefined ? 490 : opts.priceThb;
  const commissionRate = opts.commissionRate === undefined ? 15 : opts.commissionRate;
  const commissionVerified = opts.commissionVerified ?? (commissionRate !== null);
  const salesVolume = opts.salesVolume === undefined ? 1200 : opts.salesVolume;
  const revenueThb = opts.revenueThb === undefined ? 588000 : opts.revenueThb;

  const product: ResearchProduct = {
    id: opts.id,
    name: `SiamPick Test Product ${numericId}`,
    nameMy: `စမ်းသပ်ထုတ်ကုန် ${numericId}`,
    brand: 'SiamBrand',
    category,
    subCategory: category === 'womens-fashion' ? 'Dresses' : 'Serums',
    subCategoryMy: category === 'womens-fashion' ? 'ဂါဝန်' : 'ဆီရမ်',
    shopName: 'SiamShop Official',
    dispatchHub: 'Bangkok, Thailand',
    priceThb,
    priceStatus: priceThb !== null ? 'verified' : 'unavailable',
    commissionRate,
    commissionVerified,
    commissionStatus: commissionVerified && commissionRate !== null ? 'verified' : 'unavailable',
    estimatedCommissionPerSaleThb:
      priceThb !== null && commissionVerified && commissionRate !== null
        ? Math.round((priceThb * commissionRate) / 100)
        : null,
    commissionNoteEn: commissionVerified ? `${commissionRate}% verified` : 'Unavailable',
    commissionNoteMy: commissionVerified ? `${commissionRate}% တရားဝင်` : 'မရရှိနိုင်ပါ',
    imageSourceNoteEn: 'Kalodata product image',
    imageSourceNoteMy: 'Kalodata ပုံ',
    demandEvidenceEn: salesVolume !== null ? [`${salesVolume} units`] : [],
    demandEvidenceMy: salesVolume !== null ? [`${salesVolume} ခု`] : [],
    demandStatus: salesVolume !== null ? 'verified' : 'unavailable',
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
    customerRating: opts.customerRating === undefined ? null : opts.customerRating,
    reviewCount: opts.reviewCount === undefined ? null : opts.reviewCount,
    reviewCountStatus: opts.reviewCount ? 'verified' : 'unavailable',
    customerRatingStatus: opts.customerRating ? 'verified' : 'unavailable',
    reviewStrengthsEn: [],
    reviewStrengthsMy: [],
    customerComplaintsEn: [],
    customerComplaintsMy: [],
    demandLevel: 'High',
    aiVideoSuitability: 'High',
    aiVideoDetailEn: 'Strong visual demonstration fit',
    aiVideoDetailMy: 'AI ဗီဒီယို သင့်တော်',
    sellerReliabilityLevel: 'Reliable',
    sellerReliabilityEn: 'Verified Thailand shop',
    sellerReliabilityMy: 'တရားဝင် ထိုင်းဆိုင်',
    whyChooseEn: 'Strong demand and healthy commission.',
    whyChooseMy: 'ရောင်းအားကောင်းပြီး ကော်မရှင်သင့်တော်သည်။',
    salesPotentialEn: 'Consistent volume.',
    salesPotentialMy: 'ရောင်းအားတည်ငြိမ်သည်။',
    confidenceLevel: 'High',
    confidenceDetailEn: 'Kalodata verified metrics',
    confidenceDetailMy: 'Kalodata တကယ့်ဒေတာ',
    scoringInputs: {
      demandSales: { rawStrength: 80, verification: 'verified', evidenceEn: '1200', evidenceMy: '၁၂၀၀' },
      commissionEarning: {
        rawStrength: 75,
        verification: commissionVerified ? 'verified' : 'unavailable',
        evidenceEn: '15%',
        evidenceMy: '15%',
      },
      aiCreative: { rawStrength: 82, verification: 'estimated', evidenceEn: 'Fit', evidenceMy: 'သင့်တော်' },
      reviewsQuality: { rawStrength: 50, verification: 'unavailable', evidenceEn: 'None', evidenceMy: 'မရှိ' },
      priceAppeal: {
        rawStrength: 78,
        verification: priceThb !== null ? 'verified' : 'unavailable',
        evidenceEn: '฿490',
        evidenceMy: '฿490',
      },
      competitionOpportunity: {
        rawStrength: 70,
        verification:
          opts.creatorNumber !== undefined && opts.creatorNumber !== null ? 'verified' : 'unavailable',
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
        outlineMy: 'အထည်သားအသေးစိတ်ပြပါ။',
      },
      {
        titleEn: 'Size comparison',
        titleMy: 'ဆိုက်ဒ်နှိုင်းယှဉ်ပြ',
        formatEn: '25s Guide',
        formatMy: '၂၅ စက္ကန့်',
        outlineEn: 'Compare M and L fit.',
        outlineMy: 'M နှင့် L ဆိုက်ဒ်နှိုင်းယှဉ်ပြပါ။',
      },
    ],
    researchMode: mode,
    kalodataMetrics: {
      productId: numericId,
      salesVolume,
      revenueThb,
      revenueGrowthRate: 24.5,
      commissionRatePct: commissionVerified ? commissionRate : null,
      unitPriceThb: priceThb,
      minPriceThb: priceThb !== null ? Math.max(50, priceThb - 50) : null,
      maxPriceThb: priceThb !== null ? priceThb + 80 : null,
      videoRevenueThb: opts.videoRevenueThb === undefined ? null : opts.videoRevenueThb,
      liveRevenueThb: 120000,
      showcaseRevenueThb: null,
      shoppingMallRevenueThb: 68000,
      creatorNumber: opts.creatorNumber === undefined ? null : opts.creatorNumber,
      videoNumber: opts.videoNumber === undefined ? null : opts.videoNumber,
      liveNumber: 5,
      dateRange: 'last7Day',
      researchMode: mode,
      productReviewCount: opts.reviewCount === undefined ? null : opts.reviewCount,
      launchDate: null,
      sellerId: '7490011223344',
      sellerName: 'SiamShop Official',
      skuCount: null,
      deliveryType: 'Local TH',
      priCategory: null,
      secCategory: null,
      terCategory: null,
      categoryIdsRequested: [category === 'womens-fashion' ? '601152' : '601450'],
      detailEnriched: opts.withProductDetail === true,
      reviewInsightEnriched: opts.withReviewInsight === true,
      reviewInsight: opts.withReviewInsight ? makeReviewInsightRecord(numericId) : null,
    },
  };

  if (opts.withMyanmarVideos) {
    product.myanmarLanguage = {
      matched: true,
      confidence: 'High',
      matchedSources: ['videoContent'],
      evidences: [],
      sourceStatuses: {
        title: { source: 'title', availability: 'checked-no-match', checkedItemCount: 1 },
        description: { source: 'description', availability: 'unavailable', checkedItemCount: 0 },
        reviews: { source: 'reviews', availability: 'unavailable', checkedItemCount: 0 },
        comments: { source: 'comments', availability: 'unavailable', checkedItemCount: 0 },
        videoContent: { source: 'videoContent', availability: 'matched', checkedItemCount: 1 },
      },
      totalMyanmarCharCount: 28,
      reviewStatus: 'review-unavailable',
      totalReviewsChecked: 0,
      matchedReviewCount: 0,
      skippedTooShortCount: 0,
      matchedReviews: [],
      matchedVideoCount: 1,
      matchedVideos: [
        {
          videoId: '750011223344',
          captionSnippet: 'မြန်မာလို ရှင်းပြထားတဲ့ အထည်ကောင်းလေး',
          creatorHandle: '@mm_creator_th',
          creatorName: 'MM Creator TH',
          videoUrl: 'https://www.tiktok.com/@mm_creator_th/video/750011223344',
          videoRevenueThb: 32000,
          videoSalesVolume: 65,
          videoViews: 42000,
          publishDate: '2026-04-01',
          matchType: 'myanmar-script',
          matchedTerms: ['မြန်မာ'],
          myanmarLetterCount: 28,
          isMixedThaiBurmese: false,
          pageNumber: 1,
        },
      ],
      marketScopeNoteEn: 'Thailand TikTok Shop',
      marketScopeNoteMy: 'ထိုင်း TikTok Shop',
    };
  }

  return product;
}

function makeProductDetailRecord(productId: string): KalodataProductDetailEnrichmentRecord {
  return {
    productId,
    productShopId: '7490011223344',
    productName: `Enriched Product ${productId}`,
    sellerName: 'Bangkok Official Store',
    priCategory: { category_id: '601152', category_name: "Women's Fashion" },
    secCategory: { category_id: '601160', category_name: 'Dresses' },
    terCategory: { category_id: '601165', category_name: 'Casual Dresses' },
    revenueGrowthRate: 31.2,
    showcaseRevenueThb: 45000,
    skuCount: 6,
    minPriceThb: 440,
    maxPriceThb: 570,
    unitPriceThb: 490,
    revenueThb: 588000,
    salesVolume: 1200,
    videoRevenueThb: 390000,
    liveRevenueThb: 130000,
    shoppingMallRevenueThb: 68000,
    commissionRatePct: 15,
    creatorNumber: 28,
    videoNumber: 42,
    liveNumber: 9,
    deliveryType: 'Local TH',
    productReviewCount: 215,
    productDescription: 'Breathable cotton blend dress shipped from Bangkok.',
    launchDate: '2025-11-12',
    trendPointsCount: 30,
    trendPeakThb: 32000,
    trendAvgThb: 19600,
    dateRange: 'last30Day',
    updatedAt: '2026-04-10T00:00:00.000Z',
  };
}

function makeReviewInsightRecord(productId: string): KalodataReviewInsightData {
  return {
    productId,
    summary: 'Buyers praise soft breathable fabric and fast Bangkok delivery; some mention L size runs slightly snug.',
    positivePoints: [
      { point: 'Soft fabric and comfortable fit', mentions: 19 },
      { point: 'Fast delivery from Bangkok', mentions: 14 },
    ],
    painPoints: [{ point: 'Runs slightly small for L size', mentions: 6 }],
    frequentComplaints: [{ point: 'Size chart runs narrow at waist', mentions: 5 }],
    qualityCautions: [{ point: 'Check stitching on light pastel variants', mentions: 2 }],
    buyerNeeds: [{ point: 'Breathable everyday wear for Bangkok heat', mentions: 11 }],
    usageScenarios: [{ point: 'Office & casual weekend wear', mentions: 9 }],
    commentsAnalyzed: 45,
    averageRating: 4.7,
    ratedCommentCount: 38,
    rawComments: [
      'အထည်သားကောင်းတယ် ဝတ်လို့အရမ်းအဆင်ပြေတယ်',
      'Great quality fabric, fast delivery from Bangkok!',
    ],
    pagesFetched: 1,
    updatedAt: '2026-04-10T00:00:00.000Z',
  };
}

function makeEmptyReviewInsightRecord(productId: string): KalodataReviewInsightData {
  return {
    productId,
    summary: null,
    positivePoints: [],
    painPoints: [],
    frequentComplaints: [],
    qualityCautions: [],
    buyerNeeds: [],
    usageScenarios: [],
    commentsAnalyzed: 0,
    averageRating: null,
    ratedCommentCount: 0,
    rawComments: [],
    pagesFetched: 1,
    updatedAt: '2026-04-10T00:00:00.000Z',
  };
}

function makeSummary(opts: {
  canonicalProductId: string;
  pdFetched?: boolean;
  riFetched?: boolean;
}): ProductEnrichmentExecutionSummary {
  const actualApiCalls = (opts.pdFetched ? 1 : 0) + (opts.riFetched ? 1 : 0);
  const actualCredits =
    Math.round(((opts.pdFetched ? 0.1 : 0) + (opts.riFetched ? 1.0 : 0)) * 1000) / 1000;
  return {
    canonicalProductId: opts.canonicalProductId,
    shopId: '7490011223344',
    enrichedAt: '2026-04-10T00:00:00.000Z',
    plannedApiCalls: actualApiCalls,
    actualApiCalls,
    deduplicatedCallsSaved: 0,
    estimatedCredits: actualCredits,
    estimatedUsd: actualCredits * 0.01,
    actualCredits,
    actualUsd: actualCredits * 0.01,
    balanceBefore: 100,
    balanceAfter: 100 - actualCredits,
    layerResults: {
      productDetail: opts.pdFetched ? 'fetched' : 'skipped',
      shopDetail: 'skipped',
      reviewInsights: opts.riFetched ? 'fetched' : 'skipped',
    },
  };
}

function makeMockAiResponse(modulesSynthesized: DeepDiveAnalysisId[]): DeepDiveAiApiResponse {
  return {
    ok: true,
    strategy: {
      verdict: 'priority-test',
      headlineEn: 'Strong affiliate margin with active video demand — ready for pilot testing',
      headlineMy: 'ကော်မရှင်နှင့် ဗီဒီယိုရောင်းအား ကောင်းမွန်သဖြင့် စမ်းသပ်ရန် သင့်တော်သည်',
      summaryEn:
        'Verified Kalodata metrics show 1,200 units sold and ฿588,000 GMV with 15% affiliate commission. Daily trend history and top creator lists remain unavailable and should be monitored manually.',
      summaryMy:
        'Kalodata တကယ့်ဒေတာအရ အရေအတွက် ၁,၂၀၀ နှင့် GMV ฿588,000 ရှိပြီး ကော်မရှင် ၁၅% ရရှိသည်။ နေ့စဉ် Trend နှင့် Top Creator စာရင်း မရရှိသေးပါ။',
      strengthsEn: ['Verified 15% commission (~฿74/sale)', 'Strong video revenue share (฿390,000)'],
      strengthsMy: ['တရားဝင် ကော်မရှင် ၁၅% (~฿74/ခု)', 'ဗီဒီယိုရောင်းအား ဝေစုမြင့်သည် (฿390,000)'],
      weaknessesEn: ['5-star customer rating unavailable from Kalodata product/detail API'],
      weaknessesMy: ['Kalodata product/detail API မှ 5-star rating မရရှိနိုင်ပါ'],
      risksEn: ['Sizing complaints noted in customer reviews'],
      risksMy: ['Review တွင် ဆိုက်ဒ်ကျဉ်းကြောင်း မှတ်ချက်ရှိသည်'],
      targetAudienceEn:
        'Thai and Myanmar-speaking female shoppers aged 20-35 in Thailand looking for everyday dresses.',
      targetAudienceMy: 'ထိုင်းနိုင်ငံရှိ အသက် ၂၀-၃၅ နှစ်အတွင်း ထိုင်းနှင့် မြန်မာ အမျိုးသမီးဝယ်သူများ။',
      videoIdeasEn: ['3-second fit check with size comparison', 'Bangkok heat breathable fabric test'],
      videoIdeasMy: ['၃ စက္ကန့် ဆိုက်ဒ်နှိုင်းယှဉ် ဝတ်ပြဗီဒီယို', 'အထည်သားအေးမြမှု စမ်းသပ်ပြသခြင်း'],
      affiliateStrategyEn:
        'Publish 2 short try-on clips highlighting true-to-size chart and fast Bangkok shipping.',
      affiliateStrategyMy:
        'ဆိုက်ဒ်ဇယားနှင့် ဘန်ကောက်အမြန်ပို့ဆောင်မှုကို အသားပေးသည့် ဗီဒီယိုတို ၂ ပုဒ် တင်ပါ။',
      goNoGoReasonEn: 'GO — verified sales velocity and ฿74/order profit justify a 3-video test sprint.',
      goNoGoReasonMy: 'GO — ရောင်းအားနှင့် ၁ ခုလျှင် ฿74 အမြတ်ကြောင့် ဗီဒီယို ၃ ပုဒ်ဖြင့် စမ်းသပ်သင့်သည်။',
      dataLimitationsEn: [
        'Daily/Weekly historical trend series unavailable',
        'Top creator breakdown unavailable',
      ],
      dataLimitationsMy: ['နေ့စဉ်/အပတ်စဉ် Trend မရရှိနိုင်ပါ', 'Top Creator စာရင်း မရရှိနိုင်ပါ'],
      modelUsed: 'gemini-3.1-flash-lite',
      modulesSynthesized,
      generatedAt: '2026-04-10T00:05:00.000Z',
    },
  };
}

function createMemoryCacheStore() {
  const store: DeepDiveCacheSnapshot = {
    productDetail: null,
    shopDetail: null,
    reviewInsight: null,
  };
  return {
    store,
    getCacheFn: (): DeepDiveCacheSnapshot => ({
      productDetail: store.productDetail,
      shopDetail: store.shopDetail,
      reviewInsight: store.reviewInsight,
    }),
    saveCacheFn: (params: {
      productDetail?: KalodataProductDetailEnrichmentRecord | null;
      shopDetail?: KalodataShopEnrichmentRecord | null;
      reviewInsight?: KalodataReviewInsightData | null;
    }) => {
      if (params.productDetail) store.productDetail = params.productDetail;
      if (params.shopDetail) store.shopDetail = params.shopDetail;
      if (params.reviewInsight) store.reviewInsight = params.reviewInsight;
    },
  };
}

test('Phase 9.2 Audit #1: All 8 Deep Dive Analyses execute cleanly with accurate dataStatus, concurrent merge safety & merged product/detail fields', async () => {
  const product = makeProduct({
    id: 'kalodata-th-1729621000001',
    mode: 'fast',
    withMyanmarVideos: true,
  });
  const peer1 = makeProduct({
    id: 'kalodata-th-1729621000002',
    salesVolume: 900,
    revenueThb: 410000,
    priceThb: 450,
    commissionRate: 12,
  });
  const peer2 = makeProduct({
    id: 'kalodata-th-1729621000003',
    salesVolume: 1800,
    revenueThb: 920000,
    priceThb: 520,
    commissionRate: 18,
  });

  const memCache = createMemoryCacheStore();
  let capturedDigests: DeepDiveCompletedModuleDigest[] = [];
  let capturedAiProduct: ResearchProduct | null = null;
  const enrichCalls: DeepDiveEnrichRequestPayload[] = [];

  const phase92Ids = ALL_DEEP_DIVE_ANALYSIS_IDS.filter(
    (id) => id !== 'ad-video-creative-blueprint'
  );
  const outcome = await runDeepDiveModules({
    product,
    peerProducts: [product, peer1, peer2],
    analysisIds: phase92Ids,
    deps: {
      getCacheFn: memCache.getCacheFn,
      saveCacheFn: memCache.saveCacheFn,
      enrichProductFn: async (payload): Promise<DeepDiveEnrichResponsePayload> => {
        enrichCalls.push(payload);
        // Stagger delays so productDetail finishes before reviewInsights, testing concurrent merge safety
        await new Promise((r) => setTimeout(r, payload.requestedLayers.reviewInsights ? 25 : 10));
        const pd = payload.requestedLayers.productDetail
          ? makeProductDetailRecord('1729621000001')
          : null;
        const ri = payload.requestedLayers.reviewInsights
          ? makeReviewInsightRecord('1729621000001')
          : null;
        const merged = mergeEnrichmentIntoProduct(payload.product, {
          productDetail: pd,
          reviewInsight: ri,
          enrichedAt: '2026-04-10T00:00:00.000Z',
        });
        return {
          ok: true,
          product: merged.product,
          productDetail: pd,
          reviewInsight: ri,
          summary: makeSummary({
            canonicalProductId: '1729621000001',
            pdFetched: Boolean(pd),
            riFetched: Boolean(ri),
          }),
        };
      },
      runAiStrategyFn: async (payload) => {
        capturedDigests = payload.completedModules;
        capturedAiProduct = payload.product;
        return makeMockAiResponse(payload.completedModules.map((d) => d.analysisId));
      },
    },
  });

  // All 8 modules must succeed with 0 failures
  assert.equal(outcome.failedIds.length, 0);
  assert.equal(outcome.completedIds.length, 8);
  for (const id of phase92Ids) {
    assert.equal(outcome.slots[id]?.status, 'completed', `Module ${id} should complete`);
    assert.ok(outcome.slots[id]?.result, `Module ${id} should have structured result`);
  }

  // Verify concurrent merge safety: BOTH productDetail (skuCount=6) AND reviewInsight survive on workingProduct passed to AI #8
  const aiProductSnapshot = capturedAiProduct as ResearchProduct | null;
  assert.ok(aiProductSnapshot, 'AI strategy runner should receive workingProduct');
  assert.equal(aiProductSnapshot.kalodataMetrics?.skuCount, 6);
  assert.equal(aiProductSnapshot.kalodataMetrics?.reviewInsight?.commentsAnalyzed, 45);

  // Verify #1 Product Intelligence preserves newly merged skuCount & splits reviewCount vs customerRating cleanly
  const mod1 = outcome.slots['product-intelligence']!.result!;
  assert.equal(mod1.isAiInterpretation, false);
  const skuRow = mod1.metrics.find((m) => m.key === 'skuCount');
  assert.equal(skuRow?.status, 'verified');
  assert.equal(skuRow?.valueEn, '6 SKUs');

  const reviewCountRow = mod1.metrics.find((m) => m.key === 'reviewCount');
  assert.equal(reviewCountRow?.status, 'verified');
  assert.equal(reviewCountRow?.valueEn, '215 reviews');

  const ratingRow = mod1.metrics.find((m) => m.key === 'customerRating');
  assert.equal(
    ratingRow?.status,
    'unavailable',
    'Missing 5-star rating must be explicitly unavailable, not unverified'
  );

  // Verify #8 AI ran AFTER #1-#7 and synthesized all 7 data module digests
  assert.equal(capturedDigests.length, 7);
  const mod8 = outcome.slots['ai-strategic-recommendation']!.result!;
  assert.equal(mod8.isAiInterpretation, true);
  assert.equal(mod8.aiApiCallsMade, 1);
  assert.equal(mod8.creditsUsed, 0);
  assert.equal(mod8.apiCallsMade, 0);
  assert.ok(
    mod8.dataSourcesEn.some((s) => s.toLowerCase().includes('separate ai billing')),
    'Option #8 result dataSourcesEn must explicitly disclose separate Gemini AI billing'
  );

  // Exactly 2 Kalodata calls total: 1 shared productDetail (0.1 cr) + 1 opt-in reviewInsights (1.0 cr) = 1.1 cr
  assert.equal(outcome.totalKalodataApiCalls, 2);
  assert.equal(outcome.totalCreditsUsed, 1.1);
  assert.equal(enrichCalls.length, 2);
});

test('Phase 9.2 Audit #2 & #3: Concurrent batch deduplicates product/detail (1 call = 0.1 cr) & subsequent run reuses cache at 0 cr', async () => {
  const product = makeProduct({
    id: 'kalodata-th-1729622000001',
    mode: 'fast',
    salesVolume: null,
    revenueThb: null,
    creatorNumber: null,
    videoNumber: null,
    videoRevenueThb: null,
  });
  const memCache = createMemoryCacheStore();
  let productDetailFetchCount = 0;

  const sharedModules: DeepDiveAnalysisId[] = [
    'product-intelligence',
    'sales-market-intelligence',
    'creator-competition-analysis',
    'video-intelligence',
  ];

  // Pre-call cost estimate must predict exact 1 deduplicated call = 0.1 cr
  const preEstimate = estimateDeepDiveExecutionCost(product, sharedModules, {
    cacheSnapshot: memCache.getCacheFn(),
  });
  assert.equal(preEstimate.plannedKalodataApiCalls, 1);
  assert.equal(preEstimate.estimatedCredits, 0.1);
  assert.deepEqual(preEstimate.deduplicatedLayers, ['productDetail']);

  const enrichProductFn = async (
    payload: DeepDiveEnrichRequestPayload
  ): Promise<DeepDiveEnrichResponsePayload> => {
    await new Promise((r) => setTimeout(r, 20));
    productDetailFetchCount += 1;
    const pd = makeProductDetailRecord('1729622000001');
    const merged = mergeEnrichmentIntoProduct(payload.product, {
      productDetail: pd,
      enrichedAt: '2026-04-10T00:00:00.000Z',
    });
    return {
      ok: true,
      product: merged.product,
      productDetail: pd,
      summary: makeSummary({ canonicalProductId: '1729622000001', pdFetched: true }),
    };
  };

  // Run #1: all 4 modules run concurrently -> ONLY 1 product/detail call made
  const firstRun = await runDeepDiveModules({
    product,
    analysisIds: sharedModules,
    deps: {
      getCacheFn: memCache.getCacheFn,
      saveCacheFn: memCache.saveCacheFn,
      enrichProductFn,
    },
  });

  assert.equal(productDetailFetchCount, 1, 'In-flight deduplication must make only 1 product/detail call');
  assert.equal(firstRun.totalKalodataApiCalls, 1);
  assert.equal(firstRun.totalCreditsUsed, 0.1);
  assert.equal(firstRun.totalKalodataApiCalls, preEstimate.plannedKalodataApiCalls);
  assert.equal(firstRun.totalCreditsUsed, preEstimate.estimatedCredits);

  const results = sharedModules.map((id) => firstRun.slots[id]!.result!);
  const paidModules = results.filter((r) => r.apiCallsMade === 1);
  const sharedReusedModules = results.filter((r) => r.apiCallsMade === 0 && r.reusedFromCache);
  assert.equal(paidModules.length, 1);
  assert.equal(sharedReusedModules.length, 3);
  for (const mod of sharedReusedModules) {
    assert.equal(mod.creditsUsed, 0);
    assert.ok(
      mod.dataSourcesEn.some((s) =>
        s.includes('Shared Kalodata Product Detail (deduplicated · 0 extra cr)')
      ),
      `Shared caller ${mod.analysisId} must accurately attribute shared deduplicated source`
    );
  }

  // Run #2: cache is now warm -> pre-estimate and actual execution must BOTH be 0 API calls & 0 credits
  const warmEstimate = estimateDeepDiveExecutionCost(product, sharedModules, {
    cacheSnapshot: memCache.getCacheFn(),
  });
  assert.equal(warmEstimate.plannedKalodataApiCalls, 0);
  assert.equal(warmEstimate.estimatedCredits, 0);

  const secondRun = await runDeepDiveModules({
    product,
    analysisIds: sharedModules,
    deps: {
      getCacheFn: memCache.getCacheFn,
      saveCacheFn: memCache.saveCacheFn,
      enrichProductFn,
    },
  });
  assert.equal(productDetailFetchCount, 1, 'Second run must reuse client cache with 0 API calls');
  assert.equal(secondRun.totalKalodataApiCalls, 0);
  assert.equal(secondRun.totalCreditsUsed, 0);
});

test('Phase 9.2 Audit #2 & #3 (Server): enrichSingleProduct deduplicates concurrent requests & uses exact Kalodata endpoints + secret-key header', async () => {
  clearServerEnrichmentCache();
  const prevApiKey = process.env.KALODATA_API_KEY;
  process.env.KALODATA_API_KEY = 'test-secret-kalodata-key';

  const originalFetch = globalThis.fetch;
  const fetchCalls: Array<{ url: string; method: string; secretKey: string | null; body: unknown }> = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const headers = new Headers(init?.headers);
    const parsedBody = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    fetchCalls.push({
      url,
      method: init?.method ?? 'GET',
      secretKey: headers.get('secret-key'),
      body: parsedBody,
    });

    if (url.includes('/openapi/v1/user/balance')) {
      return new Response(
        JSON.stringify({ code: 0, success: true, data: { balance: 100 } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (url.includes('/openapi/v1/tiktok/product/detail')) {
      await new Promise((r) => setTimeout(r, 25));
      return new Response(
        JSON.stringify({
          code: 0,
          success: true,
          data: {
            product_id: '1729623000001',
            product_shop_id: '7490011223344',
            product_title: 'Server Verified Dress',
            seller_name: 'TH Official Shop',
            pri_category: { category_id: '601152', category_name: "Women's Fashion" },
            sec_category: { category_id: '601160', category_name: 'Dresses' },
            sku_count: 4,
            min_price: 420,
            max_price: 550,
            unit_price: 490,
            revenue: 600000,
            sale: 1220,
            commission_rate: 15,
            creator_num: 22,
            video_num: 35,
            product_review_count: 190,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  }) as typeof fetch;

  try {
    const product = makeProduct({
      id: 'kalodata-th-1729623000001',
      mode: 'fast',
    });

    // Fire 2 concurrent server enrichment requests for the exact same uncached productId
    const [resA, resB] = await Promise.all([
      enrichSingleProduct({
        product,
        requestedLayers: { productDetail: true, shopDetail: false, reviewInsights: false },
      }),
      enrichSingleProduct({
        product,
        requestedLayers: { productDetail: true, shopDetail: false, reviewInsights: false },
      }),
    ]);

    const detailCalls = fetchCalls.filter((c) => c.url.includes('/openapi/v1/tiktok/product/detail'));
    assert.equal(detailCalls.length, 1, 'Server in-flight dedup must invoke Kalodata product/detail ONLY ONCE');
    assert.equal(detailCalls[0].method, 'POST');
    assert.equal(detailCalls[0].secretKey, 'test-secret-kalodata-key');
    assert.deepEqual(detailCalls[0].body, {
      product_id: '1729623000001',
      region: 'TH',
      currency: 'THB',
      language: 'en-US',
      date_range: 'last30Day',
      need_extra: true,
    });

    const fetchedCount = [resA, resB].filter((r) => r.summary.layerResults.productDetail === 'fetched').length;
    const reusedCount = [resA, resB].filter((r) => r.summary.layerResults.productDetail === 'reused-cache').length;
    assert.equal(fetchedCount, 1);
    assert.equal(reusedCount, 1);
    assert.equal(resA.productDetail?.skuCount, 4);
    assert.equal(resB.productDetail?.skuCount, 4);
    assert.equal(resA.product.kalodataMetrics?.skuCount, 4, 'Merged product must retain skuCount');
  } finally {
    globalThis.fetch = originalFetch;
    if (prevApiKey === undefined) {
      delete process.env.KALODATA_API_KEY;
    } else {
      process.env.KALODATA_API_KEY = prevApiKey;
    }
    clearServerEnrichmentCache();
  }
});

test('Phase 9.2 Audit #4: Review Insight API is strictly opt-in — never auto-called unless #6 is explicitly selected', async () => {
  const product = makeProduct({
    id: 'kalodata-th-1729624000001',
    mode: 'fast',
  });
  const memCache = createMemoryCacheStore();
  let reviewApiCalls = 0;

  const nonReviewModules: DeepDiveAnalysisId[] = [
    'product-intelligence',
    'sales-market-intelligence',
    'affiliate-profit-analysis',
    'creator-competition-analysis',
    'video-intelligence',
    'market-competitor-comparison',
    'ai-strategic-recommendation',
  ];

  const nonReviewEstimate = estimateDeepDiveExecutionCost(product, nonReviewModules, {
    cacheSnapshot: memCache.getCacheFn(),
  });
  assert.equal(nonReviewEstimate.includesOptInReviewApi, false);

  await runDeepDiveModules({
    product,
    peerProducts: [product],
    analysisIds: nonReviewModules,
    deps: {
      getCacheFn: memCache.getCacheFn,
      saveCacheFn: memCache.saveCacheFn,
      enrichProductFn: async (payload) => {
        if (payload.requestedLayers.reviewInsights) {
          reviewApiCalls += 1;
        }
        const pd = makeProductDetailRecord('1729624000001');
        return {
          ok: true,
          product: mergeEnrichmentIntoProduct(payload.product, { productDetail: pd }).product,
          productDetail: pd,
          summary: makeSummary({ canonicalProductId: '1729624000001', pdFetched: true }),
        };
      },
      runAiStrategyFn: async (payload) =>
        makeMockAiResponse(payload.completedModules.map((d) => d.analysisId)),
    },
  });

  assert.equal(reviewApiCalls, 0, 'Review Insight API must NEVER be called when #6 is not selected');

  // Now explicitly run #6 -> must charge 1.0 cr once, detect Myanmar review, and cache
  const optInEstimate = estimateDeepDiveExecutionCost(product, ['customer-review-intelligence'], {
    cacheSnapshot: memCache.getCacheFn(),
  });
  assert.equal(optInEstimate.includesOptInReviewApi, true);
  assert.equal(optInEstimate.estimatedCredits, 1.0);

  const reviewRun1 = await runDeepDiveModules({
    product,
    analysisIds: ['customer-review-intelligence'],
    deps: {
      getCacheFn: memCache.getCacheFn,
      saveCacheFn: memCache.saveCacheFn,
      enrichProductFn: async (payload) => {
        assert.equal(payload.requestedLayers.reviewInsights, true);
        assert.equal(payload.requestedLayers.productDetail, false);
        reviewApiCalls += 1;
        const ri = makeReviewInsightRecord('1729624000001');
        return {
          ok: true,
          product: mergeEnrichmentIntoProduct(payload.product, { reviewInsight: ri }).product,
          reviewInsight: ri,
          summary: makeSummary({ canonicalProductId: '1729624000001', riFetched: true }),
        };
      },
    },
  });

  assert.equal(reviewApiCalls, 1);
  assert.equal(reviewRun1.totalCreditsUsed, 1.0);
  assert.equal(reviewRun1.slots['customer-review-intelligence']?.status, 'completed');

  // Re-running #6 must hit cache at 0 credits & 0 API calls
  const reviewRun2 = await runDeepDiveModules({
    product,
    analysisIds: ['customer-review-intelligence'],
    deps: {
      getCacheFn: memCache.getCacheFn,
      saveCacheFn: memCache.saveCacheFn,
      enrichProductFn: async () => {
        reviewApiCalls += 1;
        throw new Error('Should not call enrichProductFn when reviewInsight is cached');
      },
    },
  });
  assert.equal(reviewApiCalls, 1);
  assert.equal(reviewRun2.totalCreditsUsed, 0);
  assert.equal(reviewRun2.totalKalodataApiCalls, 0);
  assert.equal(reviewRun2.slots['customer-review-intelligence']?.result?.reusedFromCache, true);
});

test('Phase 9.2 Audit #5 & #6: Gemini AI Strategy is strictly server-side, handles missing key/errors cleanly, and explicitly discloses separate Gemini billing', async () => {
  // Verify NO client-side @google/genai import anywhere in src/
  const srcRoot = path.resolve(process.cwd(), 'src');
  const walkFiles = (dir: string): string[] => {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...walkFiles(full));
      else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
    }
    return out;
  };
  for (const file of walkFiles(srcRoot)) {
    const content = fs.readFileSync(file, 'utf8');
    assert.ok(
      !content.includes('@google/genai'),
      `Client file ${file} must NEVER import @google/genai`
    );
  }

  // Test generateDeepDiveAiStrategy cleanly reports MISSING_API_KEY when env var is unset
  const prevKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const product = makeProduct({ id: 'kalodata-th-1729625000001' });
    const res = await generateDeepDiveAiStrategy({ product, completedModules: [] });
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.code, 'MISSING_API_KEY');
      assert.ok(res.error.includes('GEMINI_API_KEY'));
      assert.ok(res.errorMy.includes('GEMINI_API_KEY'));
    }

    // Verify buildDeepDiveAiPrompt includes verified metrics & completed module digests
    const prompt = buildDeepDiveAiPrompt(
      product,
      evaluateProductOpportunity(product, { salesWeightPct: 50 }),
      [
        {
          analysisId: 'affiliate-profit-analysis',
          outcome: 'completed',
          dataStatus: 'verified',
          headlineEn: '฿74/sale',
          summaryEn: 'Verified 15% commission.',
          metrics: [{ label: 'Commission', value: '15%', status: 'verified' }],
          unavailableNotes: [],
        },
      ]
    );
    assert.ok(prompt.includes('affiliate-profit-analysis'));
    assert.ok(prompt.includes('Verified Input JSON'));

    // Verify validateDeepDiveStrategyJson rejects malformed JSON and accepts valid payload
    assert.equal(validateDeepDiveStrategyJson('not valid json', 'gemini-3.1-flash-lite', []), null);
    const mockValid = makeMockAiResponse(['affiliate-profit-analysis']).strategy!;
    const validated = validateDeepDiveStrategyJson(
      JSON.stringify(mockValid),
      'gemini-3.1-flash-lite',
      ['affiliate-profit-analysis']
    );
    assert.ok(validated);
    assert.equal(validated.verdict, 'priority-test');
    assert.equal(validated.modelUsed, 'gemini-3.1-flash-lite');
  } finally {
    if (prevKey !== undefined) process.env.GEMINI_API_KEY = prevKey;
  }

  // Verify Gemini separate billing is explicitly disclosed in registry, cost estimator, and UI
  const opt8 = getDeepDiveOptionById('ai-strategic-recommendation');
  assert.ok(opt8);
  assert.ok(opt8.estimatedCostNoteEn.toLowerCase().includes('billed separately by google gemini api'));
  assert.ok(opt8.estimatedCostNoteMy.includes('Gemini API'));

  const product = makeProduct({ id: 'kalodata-th-1729625000002' });
  const costEst = estimateDeepDiveExecutionCost(product, ['ai-strategic-recommendation'], {
    cacheSnapshot: createMemoryCacheStore().getCacheFn(),
  });
  assert.equal(costEst.estimatedCredits, 0);
  assert.equal(costEst.plannedGeminiCalls, 1);
  assert.equal(costEst.hasSeparateAiBilling, true);
  assert.equal(costEst.modules[0].separateAiBilling, true);
  assert.ok(costEst.modules[0].noteEn.toLowerCase().includes('separate'));

  const uiSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/DeepDiveWorkspaceView.tsx'),
    'utf8'
  );
  assert.ok(uiSrc.includes('separate AI billing') && uiSrc.includes('Gemini API စရိတ် သီးခြားရှိ'));
});

test('Phase 9.2 Audit #7: Unverified / Unavailable APIs and missing data are honestly marked Unavailable (never fabricated)', async () => {
  const sparseProduct = makeProduct({
    id: 'kalodata-th-1729626000001',
    mode: 'fast',
    category: 'cosmetics-beauty',
    priceThb: null,
    commissionRate: null,
    commissionVerified: false,
    creatorNumber: null,
    videoNumber: null,
    videoRevenueThb: null,
    reviewCount: null,
    customerRating: null,
  });
  const differentCategoryPeer = makeProduct({
    id: 'kalodata-th-1729626000099',
    category: 'womens-fashion',
  });
  const memCache = createMemoryCacheStore();

  const outcome = await runDeepDiveModules({
    product: sparseProduct,
    peerProducts: [sparseProduct, differentCategoryPeer],
    analysisIds: [
      'sales-market-intelligence',
      'affiliate-profit-analysis',
      'creator-competition-analysis',
      'video-intelligence',
      'customer-review-intelligence',
      'market-competitor-comparison',
    ],
    deps: {
      getCacheFn: memCache.getCacheFn,
      saveCacheFn: memCache.saveCacheFn,
      enrichProductFn: async (payload) => {
        if (payload.requestedLayers.reviewInsights) {
          const emptyRi = makeEmptyReviewInsightRecord('1729626000001');
          return {
            ok: true,
            product: payload.product,
            reviewInsight: emptyRi,
            summary: makeSummary({ canonicalProductId: '1729626000001', riFetched: true }),
          };
        }
        const minimalPd: KalodataProductDetailEnrichmentRecord = {
          productId: '1729626000001',
          productShopId: null,
          minPriceThb: null,
          maxPriceThb: null,
          unitPriceThb: null,
          revenueThb: 588000,
          salesVolume: 1200,
          videoRevenueThb: null,
          liveRevenueThb: null,
          shoppingMallRevenueThb: null,
          commissionRatePct: null,
          creatorNumber: null,
          videoNumber: null,
          liveNumber: null,
          deliveryType: null,
          productReviewCount: null,
          launchDate: null,
          trendPointsCount: 0,
          trendPeakThb: null,
          trendAvgThb: null,
          dateRange: 'last30Day',
          updatedAt: '2026-04-10T00:00:00.000Z',
        };
        return {
          ok: true,
          product: payload.product,
          productDetail: minimalPd,
          summary: makeSummary({ canonicalProductId: '1729626000001', pdFetched: true }),
        };
      },
    },
  });

  // #2 must explicitly disclose Historical Daily/Weekly/Monthly Trend is Unavailable
  const mod2 = outcome.slots['sales-market-intelligence']!.result!;
  assert.ok(
    mod2.unavailableNotesEn.some(
      (n) => n.toLowerCase().includes('historical') || n.toLowerCase().includes('trend')
    ),
    '#2 must disclose unavailable historical daily/weekly/monthly trend'
  );

  // #3 must be unavailable when price/commission missing
  assert.equal(outcome.slots['affiliate-profit-analysis']?.status, 'unavailable');

  // #4 must be unavailable when creator count missing AND disclose Top Creators API unavailable
  assert.equal(outcome.slots['creator-competition-analysis']?.status, 'unavailable');
  assert.ok(
    outcome.slots['creator-competition-analysis']!.result!.unavailableNotesEn.some((n) =>
      n.toLowerCase().includes('creator')
    )
  );

  // #5 must be unavailable when video metrics & Myanmar videos missing AND disclose linked video list unavailable
  assert.equal(outcome.slots['video-intelligence']?.status, 'unavailable');
  assert.ok(
    outcome.slots['video-intelligence']!.result!.unavailableNotesEn.some((n) =>
      n.toLowerCase().includes('video')
    )
  );

  // #6 Empty review response must return unavailable without inventing reviews
  assert.equal(outcome.slots['customer-review-intelligence']?.status, 'unavailable');

  // #7 Competitor comparison with 0 same-category peers must return unavailable honestly
  assert.equal(outcome.slots['market-competitor-comparison']?.status, 'unavailable');
});

test('Phase 9.2 Audit #8: Strict error isolation — failures in #6 or #8 never break other selected modules; non-JSON HTTP 502 is handled cleanly', async () => {
  const product = makeProduct({
    id: 'kalodata-th-1729627000001',
    mode: 'balanced',
    creatorNumber: 18,
    videoNumber: 22,
    videoRevenueThb: 250000,
    withProductDetail: true,
  });
  const peer = makeProduct({
    id: 'kalodata-th-1729627000002',
    salesVolume: 800,
    revenueThb: 380000,
  });

  const outcome = await runDeepDiveModules({
    product,
    peerProducts: [product, peer],
    analysisIds: ALL_DEEP_DIVE_ANALYSIS_IDS.filter((id) => id !== 'ad-video-creative-blueprint'),
    deps: {
      getCacheFn: createMemoryCacheStore().getCacheFn,
      saveCacheFn: () => {},
      enrichProductFn: async (payload) => {
        if (payload.requestedLayers.reviewInsights) {
          return {
            ok: false,
            code: 'SPENDING_LIMIT_EXCEEDED',
            error: 'Review Insight exceeds spending limit.',
            errorMy: 'Spending Limit ကျော်လွန်နေပါသည်။',
          };
        }
        return { ok: true, product: payload.product };
      },
      runAiStrategyFn: async () => ({
        ok: false,
        code: 'RATE_LIMITED',
        error: 'Gemini AI rate limit reached.',
        errorMy: 'Gemini AI ကန့်သတ်ချက် ပြည့်နေပါသည်။',
      }),
    },
  });

  assert.deepEqual(outcome.failedIds.slice().sort(), [
    'ai-strategic-recommendation',
    'customer-review-intelligence',
  ]);
  assert.equal(outcome.slots['customer-review-intelligence']?.status, 'error');
  assert.equal(outcome.slots['customer-review-intelligence']?.error?.code, 'SPENDING_LIMIT_EXCEEDED');
  assert.equal(outcome.slots['ai-strategic-recommendation']?.status, 'error');
  assert.equal(outcome.slots['ai-strategic-recommendation']?.error?.code, 'RATE_LIMITED');

  const healthyIds: DeepDiveAnalysisId[] = [
    'product-intelligence',
    'sales-market-intelligence',
    'affiliate-profit-analysis',
    'creator-competition-analysis',
    'video-intelligence',
    'market-competitor-comparison',
  ];
  for (const id of healthyIds) {
    assert.equal(outcome.slots[id]?.status, 'completed', `Healthy module ${id} must not be impacted`);
  }

  // Test non-JSON HTTP 502 HTML body safety via default fetch path
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response('<html><body>502 Bad Gateway</body></html>', {
      status: 502,
      headers: { 'Content-Type': 'text/html' },
    })) as typeof fetch;
  try {
    const htmlErrOutcome = await runDeepDiveModules({
      product,
      analysisIds: ['ai-strategic-recommendation', 'affiliate-profit-analysis'],
      deps: {
        getCacheFn: createMemoryCacheStore().getCacheFn,
        saveCacheFn: () => {},
      },
    });
    assert.equal(htmlErrOutcome.slots['affiliate-profit-analysis']?.status, 'completed');
    assert.equal(htmlErrOutcome.slots['ai-strategic-recommendation']?.status, 'error');
    assert.equal(htmlErrOutcome.slots['ai-strategic-recommendation']?.error?.code, 'HTTP_502');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Phase 9.2 Audit #9 & #10: Zero mutation of original ResearchProduct / peerProducts / 7-Factor rankings after running all 8 Deep Dive modules', async () => {
  const product = makeProduct({
    id: 'kalodata-th-1729628000001',
    mode: 'fast',
  });
  const peer1 = makeProduct({
    id: 'kalodata-th-1729628000002',
    salesVolume: 700,
    revenueThb: 343000,
  });
  const peer2 = makeProduct({
    id: 'kalodata-th-1729628000003',
    salesVolume: 2100,
    revenueThb: 1029000,
  });
  const originalPeers = [product, peer1, peer2];

  const snapshotProductBefore = JSON.stringify(product);
  const snapshotPeersBefore = JSON.stringify(originalPeers);
  const snapshotRankingBefore = JSON.stringify(evaluateProductBatch(originalPeers));

  const memCache = createMemoryCacheStore();
  await runDeepDiveModules({
    product,
    peerProducts: originalPeers,
    analysisIds: ALL_DEEP_DIVE_ANALYSIS_IDS,
    deps: {
      getCacheFn: memCache.getCacheFn,
      saveCacheFn: memCache.saveCacheFn,
      enrichProductFn: async (payload) => {
        const pd = payload.requestedLayers.productDetail
          ? makeProductDetailRecord('1729628000001')
          : null;
        const ri = payload.requestedLayers.reviewInsights
          ? makeReviewInsightRecord('1729628000001')
          : null;
        const merged = mergeEnrichmentIntoProduct(payload.product, {
          productDetail: pd,
          reviewInsight: ri,
          enrichedAt: '2026-04-10T00:00:00.000Z',
        });
        return {
          ok: true,
          product: merged.product,
          productDetail: pd,
          reviewInsight: ri,
          summary: makeSummary({
            canonicalProductId: '1729628000001',
            pdFetched: Boolean(pd),
            riFetched: Boolean(ri),
          }),
        };
      },
      runAiStrategyFn: async (payload) =>
        makeMockAiResponse(payload.completedModules.map((d) => d.analysisId)),
    },
  });

  assert.equal(JSON.stringify(product), snapshotProductBefore, 'Original ResearchProduct must remain 100% unmutated');
  assert.equal(JSON.stringify(originalPeers), snapshotPeersBefore, 'Peer product list must remain 100% unmutated');
  assert.equal(
    JSON.stringify(evaluateProductBatch(originalPeers)),
    snapshotRankingBefore,
    '7-Factor Opportunity Evaluation & ranking order must remain 100% identical'
  );
});
