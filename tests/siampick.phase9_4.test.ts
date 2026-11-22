import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { ResearchProduct } from '../src/types/product.ts';
import type {
  DeepDiveAnalysisId,
  DeepDiveAnalysisSlotState,
  DeepDiveSourceContext,
} from '../src/types/deepDive.ts';
import {
  buildDeepDiveTargetContext,
  createInitialDeepDiveWorkspaceState,
} from '../src/utils/deepDiveRegistry.ts';
import {
  estimateDeepDiveExecutionCost,
  runDeepDiveModules,
  type DeepDiveAiApiResponse,
  type DeepDiveEnrichResponsePayload,
} from '../src/utils/deepDiveEngine.ts';
import {
  appendDeepDiveHistoryRecord,
  clearDeepDiveHistoryForProduct,
  createDeepDiveHistoryRecord,
  DEEP_DIVE_HISTORY_STORAGE_KEY,
  deleteDeepDiveHistoryRecord,
  hydrateWorkspaceStateFromHistory,
  loadDeepDiveHistoryForProduct,
} from '../src/utils/deepDiveHistoryStorage.ts';
import {
  buildDeepDiveFinalReport,
  buildDeepDiveReportJson,
  buildDeepDiveReportMarkdown,
} from '../src/utils/deepDiveReportBuilder.ts';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  public throwQuotaOnKey: string | null = null;

  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    if (this.throwQuotaOnKey === key) {
      const err = new Error('QuotaExceededError') as Error & { name: string; code: number };
      err.name = 'QuotaExceededError';
      err.code = 22;
      throw err;
    }
    this.map.set(key, value);
  }
}

function makeProduct(opts: {
  id: string;
  withProductDetail?: boolean;
  withReviewInsight?: boolean;
  missingRating?: boolean;
}): ResearchProduct {
  const numericId = opts.id.replace(/^(kalodata-th-|kd[_-])/i, '');
  return {
    id: opts.id,
    name: `Thai Vitamin C Serum ${numericId}`,
    nameMy: `ထိုင်း Vitamin C Serum ${numericId}`,
    brand: 'SiamGlow',
    category: 'cosmetics-beauty',
    subCategory: 'Skincare',
    subCategoryMy: 'အသားအရေထိန်းသိမ်းမှု',
    shopName: 'SiamGlow Official TH',
    dispatchHub: 'Bangkok, Thailand',
    priceThb: 299,
    priceStatus: 'verified',
    commissionRate: 15,
    commissionVerified: true,
    commissionStatus: 'verified',
    estimatedCommissionPerSaleThb: 45,
    commissionNoteEn: '15% verified',
    commissionNoteMy: '15% တရားဝင်',
    imageSourceNoteEn: 'Kalodata product image',
    imageSourceNoteMy: 'Kalodata ပုံ',
    demandEvidenceEn: ['1500 units'],
    demandEvidenceMy: ['1500 ခု'],
    demandStatus: 'verified',
    competitionLevel: opts.withProductDetail ? 'Moderate' : 'Unknown',
    competitionDetailEn: opts.withProductDetail ? '24 creators' : 'Unavailable',
    competitionDetailMy: opts.withProductDetail ? 'Creator 24 ဦး' : 'မရရှိနိုင်ပါ',
    competitionStatus: opts.withProductDetail ? 'verified' : 'unavailable',
    customerRating: opts.missingRating ? null : 4.7,
    reviewCount: opts.withProductDetail ? 320 : null,
    reviewCountStatus: opts.withProductDetail ? 'verified' : 'unavailable',
    customerRatingStatus: opts.missingRating ? 'unavailable' : 'verified',
    reviewStrengthsEn: [],
    reviewStrengthsMy: [],
    customerComplaintsEn: [],
    customerComplaintsMy: [],
    demandLevel: 'High',
    aiVideoSuitability: 'High',
    aiVideoDetailEn: 'Strong demo fit',
    aiVideoDetailMy: 'AI ဗီဒီယို သင့်တော်',
    sellerReliabilityLevel: 'Reliable',
    sellerReliabilityEn: 'Verified TH shop',
    sellerReliabilityMy: 'တရားဝင် ထိုင်းဆိုင်',
    whyChooseEn: 'Verified steady demand',
    whyChooseMy: 'ဝယ်လိုအား ကောင်းမွန်',
    salesPotentialEn: 'Steady sales velocity.',
    salesPotentialMy: 'ရောင်းအားတည်ငြိမ်သည်။',
    confidenceLevel: 'High',
    confidenceDetailEn: 'Kalodata verified',
    confidenceDetailMy: 'Kalodata အတည်ပြုပြီး',
    scoringInputs: {
      demandSales: { rawStrength: 82, verification: 'verified', evidenceEn: '1500', evidenceMy: '၁၅၀၀' },
      commissionEarning: { rawStrength: 78, verification: 'verified', evidenceEn: '15%', evidenceMy: '15%' },
      aiCreative: { rawStrength: 80, verification: 'estimated', evidenceEn: 'Fit', evidenceMy: 'သင့်တော်' },
      reviewsQuality: {
        rawStrength: 50,
        verification: opts.missingRating ? 'unavailable' : 'verified',
        evidenceEn: opts.missingRating ? 'None' : '4.7/5',
        evidenceMy: opts.missingRating ? 'မရှိ' : '4.7/5',
      },
      priceAppeal: { rawStrength: 76, verification: 'verified', evidenceEn: '฿299', evidenceMy: '฿299' },
      competitionOpportunity: {
        rawStrength: 72,
        verification: opts.withProductDetail ? 'verified' : 'unavailable',
        evidenceEn: opts.withProductDetail ? '24 creators' : 'Unavailable',
        evidenceMy: opts.withProductDetail ? 'Creator 24 ဦး' : 'မရရှိနိုင်ပါ',
      },
      sellerReliability: { rawStrength: 80, verification: 'verified', evidenceEn: 'TH shop', evidenceMy: 'TH ဆိုင်' },
    },
    opportunityScore: 83,
    generalRisksEn: ['Seasonal skincare demand shifts'],
    generalRisksMy: ['ရာသီအလိုက် ဝယ်လိုအားပြောင်းနိုင်'],
    missingDataEn: [],
    missingDataMy: [],
    imageUrl: '',
    imageVerified: false,
    sources: [],
    videoIdeas: [],
    researchMode: 'fast',
    researchedAt: '2026-11-20T08:00:00.000Z',
    kalodataMetrics: {
      productId: numericId,
      dateRange: 'last30Day',
      unitPriceThb: 299,
      salesVolume: 1500,
      revenueThb: 448500,
      revenueGrowthRate: 18.5,
      commissionRatePct: 15,
      creatorNumber: opts.withProductDetail ? 24 : null,
      videoNumber: opts.withProductDetail ? 36 : null,
      videoRevenueThb: opts.withProductDetail ? 260000 : null,
      liveRevenueThb: 120000,
      showcaseRevenueThb: 68500,
      skuCount: opts.withProductDetail ? 3 : null,
      detailEnriched: opts.withProductDetail === true,
      reviewInsightEnriched: opts.withReviewInsight === true,
      reviewInsight: opts.withReviewInsight
        ? {
            productId: numericId,
            commentsAnalyzed: 120,
            averageRating: 4.7,
            positivePoints: [{ point: 'Fast absorption', mentions: 42 }],
            painPoints: [{ point: 'Small bottle size', mentions: 11 }],
            frequentComplaints: [{ point: 'Pump cap loose in transit', mentions: 6 }],
            qualityCautions: [{ point: 'Check expiration seal', mentions: 4 }],
            buyerNeeds: [{ point: 'Daily brightening routine', mentions: 28 }],
            usageScenarios: [{ point: 'Morning skincare', mentions: 19 }],
            updatedAt: '2026-11-21T09:00:00.000Z',
          }
        : undefined,
    },
  } as unknown as ResearchProduct;
}

test('Phase 9.4.1: Analysis Results display honest Data Status, Data Source, Last Updated and never fabricate missing fields', async () => {
  const product = makeProduct({
    id: 'kalodata-th-1749400000001',
    withProductDetail: true,
    missingRating: true,
  });

  const outcome = await runDeepDiveModules({
    product,
    analysisIds: ['product-intelligence', 'affiliate-profit-analysis'],
    spendingLimitCredits: 1.5,
    requireExplicitConfirmation: true,
    userConfirmedPaidExecution: false, // 0 paid API calls needed -> executes locally!
    deps: {
      getCacheFn: () => ({ productDetail: null, shopDetail: null, reviewInsight: null }),
      saveCacheFn: () => undefined,
      nowIsoFn: () => '2026-11-21T10:15:00.000Z',
    },
  });

  assert.equal(outcome.blockedReason, null);
  assert.equal(outcome.totalKalodataApiCalls, 0);
  assert.equal(outcome.totalCreditsUsed, 0);

  const piSlot = outcome.slots['product-intelligence'];
  assert.ok(piSlot?.result);
  assert.equal(piSlot.status, 'completed');
  assert.equal(piSlot.result.dataStatus, 'verified');
  assert.equal(piSlot.result.completedAt, '2026-11-21T10:15:00.000Z');
  assert.ok(piSlot.result.dataSourcesEn.length > 0);
  assert.ok(piSlot.result.dataSourcesMy.length > 0);

  // Missing customer rating MUST be explicitly Unavailable, never guessed
  const ratingMetric = piSlot.result.metrics.find((m) => m.key === 'customerRating');
  assert.ok(ratingMetric);
  assert.equal(ratingMetric.status, 'unavailable');
  assert.equal(ratingMetric.valueEn, 'Unavailable');
  assert.equal(ratingMetric.valueMy, 'မရရှိနိုင်ပါ');
});

test('Phase 9.4.2: Single-module Rerun uses cache (0 cr), Refresh Live enforces Confirmation & Spending Limit, and failed Rerun preserves previous result', async () => {
  const product = makeProduct({
    id: 'kalodata-th-1749400000002',
    withProductDetail: true,
    withReviewInsight: false,
  });

  let enrichCalls = 0;

  // Step 1: Initial run of Sales & Market Intelligence (0 cr — reuses verified product metrics)
  const initialOutcome = await runDeepDiveModules({
    product,
    analysisIds: ['sales-market-intelligence'],
    spendingLimitCredits: 1.5,
    requireExplicitConfirmation: true,
    userConfirmedPaidExecution: false,
    deps: {
      getCacheFn: () => ({ productDetail: null, shopDetail: null, reviewInsight: null }),
      saveCacheFn: () => undefined,
      enrichProductFn: async () => {
        enrichCalls += 1;
        throw new Error('Should not call paid API on cache-first run');
      },
      nowIsoFn: () => '2026-11-21T10:00:00.000Z',
    },
  });

  assert.equal(enrichCalls, 0);
  const initialSalesSlot = initialOutcome.slots['sales-market-intelligence'];
  assert.ok(initialSalesSlot?.result);
  assert.equal(initialSalesSlot.status, 'completed');
  const originalHeadline = initialSalesSlot.result.headlineEn;

  // Step 2: Single-module Re-run (forceRefresh: false) -> strictly 0 cr & 0 API calls
  const cacheRerun = await runDeepDiveModules({
    product,
    analysisIds: ['sales-market-intelligence'],
    existingSlots: initialOutcome.slots,
    forceRefresh: false,
    spendingLimitCredits: 1.5,
    requireExplicitConfirmation: true,
    userConfirmedPaidExecution: false,
    deps: {
      getCacheFn: () => ({ productDetail: null, shopDetail: null, reviewInsight: null }),
      saveCacheFn: () => undefined,
      enrichProductFn: async () => {
        enrichCalls += 1;
        throw new Error('Cache rerun must not call paid API');
      },
      nowIsoFn: () => '2026-11-21T10:05:00.000Z',
    },
  });
  assert.equal(enrichCalls, 0);
  assert.equal(cacheRerun.totalCreditsUsed, 0);
  assert.equal(cacheRerun.slots['sales-market-intelligence']?.status, 'completed');

  // Step 3: Explicit Refresh Live (forceRefresh: true) MUST quote 0.1 cr and require explicit confirmation!
  const refreshEstimate = estimateDeepDiveExecutionCost(product, ['sales-market-intelligence'], {
    forceRefresh: true,
    cacheSnapshot: { productDetail: null, shopDetail: null, reviewInsight: null },
  });
  assert.equal(refreshEstimate.estimatedCredits, 0.1);
  assert.equal(refreshEstimate.plannedKalodataApiCalls, 1);
  assert.equal(refreshEstimate.requiresExplicitConfirmation, true);

  const unconfirmedRefresh = await runDeepDiveModules({
    product,
    analysisIds: ['sales-market-intelligence'],
    existingSlots: initialOutcome.slots,
    forceRefresh: true,
    spendingLimitCredits: 1.5,
    requireExplicitConfirmation: true,
    userConfirmedPaidExecution: false,
    deps: {
      getCacheFn: () => ({ productDetail: null, shopDetail: null, reviewInsight: null }),
      saveCacheFn: () => undefined,
      enrichProductFn: async () => {
        enrichCalls += 1;
        throw new Error('Unconfirmed refresh must be blocked');
      },
    },
  });
  assert.equal(unconfirmedRefresh.blockedReason, 'CONFIRMATION_REQUIRED');
  assert.equal(enrichCalls, 0);

  // Step 4: Confirmed Refresh Live when server rejects with SPENDING_LIMIT_EXCEEDED -> MUST preserve previous result!
  const failedRefresh = await runDeepDiveModules({
    product,
    analysisIds: ['sales-market-intelligence'],
    existingSlots: initialOutcome.slots,
    forceRefresh: true,
    spendingLimitCredits: 1.5,
    requireExplicitConfirmation: true,
    userConfirmedPaidExecution: true,
    deps: {
      getCacheFn: () => ({ productDetail: null, shopDetail: null, reviewInsight: null }),
      saveCacheFn: () => undefined,
      enrichProductFn: async (): Promise<DeepDiveEnrichResponsePayload> => {
        enrichCalls += 1;
        return {
          ok: false,
          code: 'SPENDING_LIMIT_EXCEEDED',
          error: 'Server spending limit exceeded.',
          errorMy: 'Server Spending Limit ကျော်လွန်နေပါသည်။',
        };
      },
      nowIsoFn: () => '2026-11-21T10:10:00.000Z',
    },
  });

  assert.equal(enrichCalls, 1);
  const failedSlot = failedRefresh.slots['sales-market-intelligence'];
  assert.ok(failedSlot);
  assert.equal(failedSlot.status, 'error');
  assert.equal(failedSlot.error?.code, 'SPENDING_LIMIT_EXCEEDED');
  // CRITICAL Phase 9.4 guarantee: previous completed result is NEVER accidentally erased!
  assert.ok(failedSlot.result, 'Previous verified result must be preserved on failed rerun');
  assert.equal(failedSlot.result?.headlineEn, originalHeadline);
});

test('Phase 9.4.3: Per-product Deep Dive History persists to browser localStorage, handles corruption/quota safely, hydrates idle slots at 0 cr, and supports delete', async () => {
  const prevLocalStorage = (globalThis as unknown as { localStorage?: Storage }).localStorage;
  const mockStorage = new MemoryStorage();
  (globalThis as unknown as { localStorage: Storage }).localStorage = mockStorage;

  try {
    // Seed unrelated Research History key to verify it is NEVER touched on quota error
    mockStorage.setItem('siampick_research_history_v1', '{"records":["keep-me"]}');

    const productA = makeProduct({ id: 'kalodata-th-1749400000010', withProductDetail: true });
    const productB = makeProduct({ id: 'kalodata-th-1749400000020', withProductDetail: true });

    const runA = await runDeepDiveModules({
      product: productA,
      analysisIds: ['product-intelligence', 'affiliate-profit-analysis'],
      requireExplicitConfirmation: true,
      userConfirmedPaidExecution: false,
      deps: {
        getCacheFn: () => ({ productDetail: null, shopDetail: null, reviewInsight: null }),
        saveCacheFn: () => undefined,
        nowIsoFn: () => '2026-11-21T11:00:00.000Z',
      },
    });

    const recordA1 = createDeepDiveHistoryRecord({
      canonicalProductId: '1749400000010',
      productName: productA.name,
      productNameMy: productA.nameMy,
      analysisIds: ['product-intelligence', 'affiliate-profit-analysis'],
      slots: runA.slots,
      runSummary: runA.runSummary ?? null,
      runType: 'initial',
      analyzedAt: '2026-11-21T11:00:00.000Z',
    });

    assert.equal(recordA1.storageKind, 'browser-local-storage');
    assert.equal(recordA1.overallStatus, 'completed');
    assert.equal(recordA1.kalodataCreditsUsed, 0);
    assert.equal(recordA1.geminiApiCalls, 0);
    assert.ok(recordA1.dataSourcesEn.length > 0);
    assert.equal(recordA1.moduleEntries.length, 2);

    const saveRes1 = appendDeepDiveHistoryRecord(recordA1);
    assert.equal(saveRes1.writeResult.ok, true);
    assert.equal(saveRes1.records.length, 1);

    // Product B history stays strictly isolated from Product A
    const loadedB = loadDeepDiveHistoryForProduct('1749400000020');
    assert.equal(loadedB.length, 0);

    const loadedA = loadDeepDiveHistoryForProduct('1749400000010');
    assert.equal(loadedA.length, 1);
    assert.equal(loadedA[0].id, recordA1.id);

    // Reopening product hydrates idle slots from history at 0 API cost
    const freshWorkspace = createInitialDeepDiveWorkspaceState();
    assert.equal(freshWorkspace.slots['product-intelligence'].status, 'idle');
    const hydrated = hydrateWorkspaceStateFromHistory(freshWorkspace, loadedA);
    assert.equal(hydrated.slots['product-intelligence'].status, 'completed');
    assert.equal(hydrated.slots['affiliate-profit-analysis'].status, 'completed');
    assert.equal(hydrated.slots['customer-review-intelligence'].status, 'idle');

    // Delete single record cleanly
    const delRes = deleteDeepDiveHistoryRecord('1749400000010', recordA1.id);
    assert.equal(delRes.writeResult.ok, true);
    assert.equal(delRes.records.length, 0);
    assert.equal(loadDeepDiveHistoryForProduct('1749400000010').length, 0);

    // QuotaExceededError never deletes Research History
    mockStorage.throwQuotaOnKey = DEEP_DIVE_HISTORY_STORAGE_KEY;
    const quotaRes = appendDeepDiveHistoryRecord(recordA1);
    assert.equal(quotaRes.writeResult.ok, false);
    assert.equal(quotaRes.writeResult.quotaExceeded, true);
    assert.equal(
      mockStorage.getItem('siampick_research_history_v1'),
      '{"records":["keep-me"]}',
      'Research History must remain untouched on Deep Dive History quota failure'
    );

    // Corrupted JSON never crashes load
    mockStorage.throwQuotaOnKey = null;
    mockStorage.setItem(DEEP_DIVE_HISTORY_STORAGE_KEY, '{not-valid-json');
    assert.deepEqual(loadDeepDiveHistoryForProduct('1749400000010'), []);

    clearDeepDiveHistoryForProduct(productB.id);
  } finally {
    if (prevLocalStorage === undefined) {
      delete (globalThis as unknown as { localStorage?: Storage }).localStorage;
    } else {
      (globalThis as unknown as { localStorage: Storage }).localStorage = prevLocalStorage;
    }
  }
});

test('Phase 9.4.4: Final Report compiles all 8 sections honestly (never hiding/fabricating unrun modules) and exports clean Markdown & secret-scrubbed JSON', async () => {
  const product = makeProduct({
    id: 'kalodata-th-1749400000030',
    withProductDetail: true,
    withReviewInsight: true,
  });
  const context: DeepDiveSourceContext = buildDeepDiveTargetContext(
    product,
    'hunting',
    'balanced',
    '2026-11-21T08:00:00.000Z'
  );

  // Case A: Partial run (only #3 Affiliate Profit run; #6 Reviews & #8 AI NOT run)
  const partialOutcome = await runDeepDiveModules({
    product,
    analysisIds: ['affiliate-profit-analysis'],
    requireExplicitConfirmation: true,
    userConfirmedPaidExecution: false,
    deps: {
      getCacheFn: () => ({ productDetail: null, shopDetail: null, reviewInsight: null }),
      saveCacheFn: () => undefined,
      nowIsoFn: () => '2026-11-21T12:00:00.000Z',
    },
  });

  const partialReport = buildDeepDiveFinalReport({
    context,
    slots: partialOutcome.slots,
    salesWeightPct: 50,
    generatedAt: '2026-11-21T12:01:00.000Z',
  });

  // All 9 mandatory domains MUST always be present
  assert.equal(partialReport.sections.length, 9);
  assert.deepEqual(
    partialReport.sections.map((s) => s.id),
    [
      'product-overview',
      'market-opportunity',
      'affiliate-profit',
      'competition',
      'video-insights',
      'customer-reviews',
      'risks',
      'ai-recommendations',
      'video-creative-blueprint',
    ]
  );

  assert.equal(partialReport.completedModulesCount, 1);
  assert.equal(partialReport.notRunModulesCount, 8);
  assert.equal(partialReport.aiVerdict, null, 'Must never fabricate AI verdict when #8 not run');

  const unrunReviewSec = partialReport.sections.find((s) => s.id === 'customer-reviews');
  assert.equal(unrunReviewSec?.availability, 'not-run');
  assert.equal(unrunReviewSec?.dataStatus, 'unavailable');

  const unrunAiSec = partialReport.sections.find((s) => s.id === 'ai-recommendations');
  assert.equal(unrunAiSec?.availability, 'not-run');
  assert.equal(unrunAiSec?.isAiInterpretation, true);

  // Case B: Full run including cached #6 Review Insights and mocked #8 AI Strategic Recommendation
  const fullOutcome = await runDeepDiveModules({
    product,
    analysisIds: [
      'product-intelligence',
      'sales-market-intelligence',
      'affiliate-profit-analysis',
      'creator-competition-analysis',
      'video-intelligence',
      'customer-review-intelligence',
      'market-competitor-comparison',
      'ai-strategic-recommendation',
    ],
    peerProducts: [product],
    requireExplicitConfirmation: true,
    userConfirmedPaidExecution: true,
    deps: {
      getCacheFn: () => ({ productDetail: null, shopDetail: null, reviewInsight: null }),
      saveCacheFn: () => undefined,
      runAiStrategyFn: async (): Promise<DeepDiveAiApiResponse> => ({
        ok: true,
        strategy: {
          verdict: 'priority-test',
          headlineEn: 'Strong commission with manageable competition',
          headlineMy: 'ကော်မရှင်ကောင်းပြီး ပြိုင်ဆိုင်မှု ထိန်းနိုင်သည်',
          summaryEn: 'Verified 15% commission and steady 1,500 monthly unit velocity support test campaigns.',
          summaryMy: '15% ကော်မရှင်နှင့် တည်ငြိမ်သော ရောင်းအားကြောင့် စမ်းသပ်ကြော်ငြာသင့်သည်။',
          strengthsEn: ['Verified 15% commission rate'],
          strengthsMy: ['15% ကော်မရှင်နှုန်း အတည်ပြုပြီး'],
          weaknessesEn: ['Small bottle size mentioned by buyers'],
          weaknessesMy: ['ပုလင်းသေးကြောင်း မှတ်ချက်ရှိ'],
          risksEn: ['Transit pump cap leakage'],
          risksMy: ['ပို့ဆောင်စဉ် ပန့်အဖုံး လျော့နိုင်'],
          targetAudienceEn: 'Thai skincare shoppers aged 20-35',
          targetAudienceMy: 'အသက် ၂၀-၃၅ ထိုင်း Skincare ဝယ်သူများ',
          videoIdeasEn: ['Texture test on hand'],
          videoIdeasMy: ['လက်ပေါ်တွင် အသားစမ်းပြသခြင်း'],
          affiliateStrategyEn: 'Start with 3 short demo clips',
          affiliateStrategyMy: 'Demo ဗီဒီယိုတို ၃ ပုဒ်ဖြင့် စတင်ပါ',
          goNoGoReasonEn: 'Positive unit economics and clear review strengths.',
          goNoGoReasonMy: 'အမြတ်တွက်ချေကိုက်ပြီး Review အားသာချက်ရှိသည်။',
          dataLimitationsEn: ['Daily trend series unavailable'],
          dataLimitationsMy: ['နေ့စဉ် Trend Data မရရှိနိုင်ပါ'],
          modelUsed: 'gemini-2.5-flash',
          modulesSynthesized: ['product-intelligence', 'affiliate-profit-analysis'],
          generatedAt: '2026-11-21T12:05:00.000Z',
          tokenUsage: {
            promptTokens: 600,
            outputTokens: 300,
            totalTokens: 900,
            pricingStatus: 'unavailable',
            costNoteEn: 'Separate Google Gemini API billing',
            costNoteMy: 'Google Gemini API မှ သီးခြားကောက်ခံသည်',
          },
        },
      }),
      nowIsoFn: () => '2026-11-21T12:05:00.000Z',
    },
  });

  const fullReport = buildDeepDiveFinalReport({
    context,
    slots: fullOutcome.slots,
    salesWeightPct: 50,
    generatedAt: '2026-11-21T12:06:00.000Z',
  });

  assert.equal(fullReport.aiVerdict, 'priority-test');
  assert.equal(fullReport.totalGeminiApiCalls, 1);
  assert.equal(fullReport.totalKalodataApiCalls, 0);
  const aiSec = fullReport.sections.find((s) => s.id === 'ai-recommendations');
  assert.equal(aiSec?.isAiInterpretation, true);
  assert.equal(aiSec?.availability, 'partial'); // has dataLimitationsEn

  const reviewSec = fullReport.sections.find((s) => s.id === 'customer-reviews');
  assert.equal(reviewSec?.dataStatus, 'verified');

  // Markdown export (English & Burmese)
  const mdEn = buildDeepDiveReportMarkdown(fullReport, 'en');
  assert.ok(mdEn.includes('Deep Dive Final Report'));
  assert.ok(mdEn.includes('1. Product Overview'));
  assert.ok(mdEn.includes('6. Customer Reviews (Opt-in)'));
  assert.ok(mdEn.includes('8. AI Business Recommendation (Go / No-Go)'));
  assert.ok(mdEn.includes('9. Ad Video Creative & SEO Blueprint (AI Studio)'));
  assert.ok(mdEn.includes('priority-test'));

  const mdMy = buildDeepDiveReportMarkdown(fullReport, 'my');
  assert.ok(mdMy.includes('Deep Dive စုစည်းအစီရင်ခံစာ'));
  assert.ok(mdMy.includes('1. Product အကျဉ်းချုပ်'));
  assert.ok(mdMy.includes('8. AI စီးပွားရေးဆုံးဖြတ်ချက်'));

  // JSON export is valid & scrubs sensitive keys
  const jsonStr = buildDeepDiveReportJson(fullReport);
  const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
  assert.equal(parsed.reportType, 'deep-dive-final-report');
  assert.equal(parsed.canonicalProductId, '1749400000030');
  assert.equal(Array.isArray(parsed.sections), true);
  assert.equal((parsed.sections as unknown[]).length, 9);
  assert.equal(jsonStr.includes('KALODATA_API_KEY'), false);
  assert.equal(jsonStr.includes('UPSTASH_REDIS'), false);
});

test('Phase 9.4.5: DeepDiveWorkspaceView preserves Phase 9.1/9.3/9.3.1 guardrails and wires Phase 9.4 Report, History & Rerun UI', () => {
  const viewPath = path.resolve(process.cwd(), 'src/components/DeepDiveWorkspaceView.tsx');
  const viewSrc = fs.readFileSync(viewPath, 'utf8');
  const appPath = path.resolve(process.cwd(), 'src/App.tsx');
  const appSrc = fs.readFileSync(appPath, 'utf8');

  // Strict Phase 9.1 / 9.3 / 9.3.1 guardrail preserved
  assert.equal(viewSrc.includes('fetch('), false, 'DeepDiveWorkspaceView must never call fetch()');
  assert.equal(viewSrc.includes('/api/'), false, 'DeepDiveWorkspaceView must never contain /api/');

  // Phase 9.4 UI markers present inline (zero new modals/pages)
  assert.ok(viewSrc.includes('data-testid="deep-dive-final-report"'));
  assert.ok(viewSrc.includes('data-testid="deep-dive-analysis-history"'));
  assert.ok(viewSrc.includes('Re-run (Cache)'));
  assert.ok(viewSrc.includes('Refresh Live'));
  assert.ok(viewSrc.includes('buildDeepDiveFinalReport'));
  assert.ok(viewSrc.includes('buildDeepDiveReportMarkdown'));
  assert.ok(viewSrc.includes('buildDeepDiveReportJson'));
  assert.ok(viewSrc.includes('localStorage'));

  // App.tsx wires per-product Deep Dive History persistence & hydration cleanly
  assert.ok(appSrc.includes('deepDiveHistoryByProduct'));
  assert.ok(appSrc.includes('hydrateWorkspaceStateFromHistory'));
  assert.ok(appSrc.includes('appendDeepDiveHistoryRecord'));
  assert.ok(appSrc.includes('deleteDeepDiveHistoryRecord'));
});

// Verify type-level check that all 8 DeepDiveAnalysisId values remain exhaustive
test('Phase 9.4.6: Exhaustive check of all 8 Deep Dive module IDs in initial workspace state', () => {
  const ws = createInitialDeepDiveWorkspaceState();
  const expected: DeepDiveAnalysisId[] = [
    'product-intelligence',
    'sales-market-intelligence',
    'affiliate-profit-analysis',
    'creator-competition-analysis',
    'video-intelligence',
    'customer-review-intelligence',
    'market-competitor-comparison',
    'ai-strategic-recommendation',
  ];
  for (const id of expected) {
    const slot: DeepDiveAnalysisSlotState = ws.slots[id];
    assert.equal(slot.analysisId, id);
    assert.equal(slot.status, 'idle');
  }
});
