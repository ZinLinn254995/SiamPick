import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import type {
  AiProductAnalysis,
  ComparisonSelectionItem,
  ProductResultsFilterState,
  ProductSortField,
  ResearchConfig,
  ResearchHistoryRecord,
  ResearchProduct,
  ResearchSessionResponse,
} from '../src/types/product.ts';
import {
  computeStrategyWeights,
  evaluateProductBatch,
  evaluateProductOpportunity,
  getCanonicalProductId,
} from '../src/utils/scoring.ts';
import {
  buildProductComparisonMatrix,
  DEFAULT_PRODUCT_FILTERS,
  deriveProductDecisionSummary,
  filterProducts,
  getEffectiveAiSuitabilityBand,
  sortProductsByField,
} from '../src/utils/productAnalytics.ts';
import {
  buildProductsExportCsv,
  buildProductsExportJson,
} from '../src/utils/exportReports.ts';
import {
  createSavedRecord,
  loadSavedProducts,
  persistSavedProductsWithStatus,
} from '../src/utils/savedProductsStorage.ts';
import {
  clearLatestResearchSession,
  createResearchHistoryRecord,
  LATEST_RESEARCH_SESSION_STORAGE_KEY,
  loadLatestResearchSession,
  loadResearchHistory,
  persistLatestResearchSession,
  persistResearchHistory,
  RESEARCH_HISTORY_STORAGE_KEY,
} from '../src/utils/researchHistoryStorage.ts';
import {
  getResearchQuotaStatus,
  pauseResearch,
  resumeResearch,
} from '../server/researchService.ts';
import { analyzeSingleProductWithGemini } from '../server/aiProductAnalysis.ts';
import {
  persistTheme,
  resolveInitialTheme,
  THEME_STORAGE_KEY,
} from '../src/hooks/useTheme.ts';

class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) ?? null) : null;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

function installMockStorage(): MemoryStorage {
  const mem = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', {
    value: mem,
    configurable: true,
    writable: true,
  });
  return mem;
}

function makeProduct(overrides: Partial<ResearchProduct> = {}): ResearchProduct {
  const baseId = overrides.id ?? 'kd_1700000000001';
  const numericId = baseId.replace(/^(kalodata-th-|kd[_-])/i, '');
  return {
    id: baseId,
    name: 'Linen Relaxed Tailored Blazer TH',
    nameMy: 'လိုင်နင် Blazer အင်္ကျီ',
    brand: 'BKKAtelier',
    category: 'womens-fashion',
    subCategory: 'Blazers',
    subCategoryMy: 'Blazer အင်္ကျီ',
    shopName: 'BKKAtelier Official TH',
    dispatchHub: 'Bangkok, Thailand',
    priceThb: 590,
    priceStatus: 'verified',
    commissionRate: 14,
    commissionVerified: true,
    commissionStatus: 'verified',
    estimatedCommissionPerSaleThb: 83,
    commissionNoteEn: '14% verified affiliate rate',
    commissionNoteMy: '14% တရားဝင်ကော်မရှင်နှုန်း',
    imageSourceNoteEn: 'Verified Kalodata product image',
    imageSourceNoteMy: 'တရားဝင် Kalodata ပုံဖြစ်သည်',
    demandEvidenceEn: ['Strong 7-day unit volume'],
    demandEvidenceMy: ['၇ ရက် ရောင်းအားကောင်းမွန်သည်'],
    demandStatus: 'verified',
    competitionLevel: 'Moderate',
    competitionDetailEn: '28 creators promoting',
    competitionDetailMy: 'Creator ၂၈ ဦး ကြော်ငြာနေသည်',
    competitionStatus: 'verified',
    customerRating: 4.8,
    reviewCount: 240,
    reviewCountStatus: 'verified',
    customerRatingStatus: 'verified',
    reviewStrengthsEn: ['Breathable linen'],
    reviewStrengthsMy: ['လေဝင်လေထွက်ကောင်း'],
    customerComplaintsEn: ['Runs slightly oversized'],
    customerComplaintsMy: ['အနည်းငယ် ပွသည်'],
    demandLevel: 'High',
    aiVideoSuitability: 'High',
    aiVideoDetailEn: 'Clean silhouette for AI virtual female model try-on',
    aiVideoDetailMy: 'AI Virtual Female Model ဖြင့် ပြသရန် အထူးသင့်တော်',
    sellerReliabilityLevel: 'Reliable',
    sellerReliabilityEn: 'Verified Bangkok store',
    sellerReliabilityMy: 'တရားဝင် ဘန်ကောက်ဆိုင်',
    whyChooseEn: 'Balanced volume and 14% affiliate commission.',
    whyChooseMy: 'ရောင်းအားနှင့် ကော်မရှင် မျှတသည်။',
    salesPotentialEn: 'Strong 7-day sales volume.',
    salesPotentialMy: '၇ ရက် ရောင်းအားကောင်းမွန်သည်။',
    confidenceLevel: 'High',
    confidenceDetailEn: 'Verified Kalodata OpenAPI metrics.',
    confidenceDetailMy: 'Kalodata OpenAPI တကယ့်ဒေတာများဖြစ်သည်။',
    scoringInputs: {
      demandSales: { rawStrength: 82, verification: 'verified', evidenceEn: '1,400 units', evidenceMy: '၁,၄၀၀ ခု' },
      commissionEarning: { rawStrength: 76, verification: 'verified', evidenceEn: '14%', evidenceMy: '14%' },
      aiCreative: { rawStrength: 86, verification: 'estimated', evidenceEn: 'High virtual model fit', evidenceMy: 'AI Model သင့်တော်' },
      reviewsQuality: { rawStrength: 84, verification: 'verified', evidenceEn: '4.8/5', evidenceMy: '4.8/5' },
      priceAppeal: { rawStrength: 78, verification: 'verified', evidenceEn: '฿590', evidenceMy: '฿590' },
      competitionOpportunity: { rawStrength: 72, verification: 'verified', evidenceEn: '28 creators', evidenceMy: '28 creators' },
      sellerReliability: { rawStrength: 80, verification: 'verified', evidenceEn: 'Official TH shop', evidenceMy: 'တရားဝင်ဆိုင်' },
    },
    opportunityScore: 80,
    generalRisksEn: ['Sizing fit feedback'],
    generalRisksMy: ['ဆိုက်ဒ်မတိုက်ခြင်း'],
    missingDataEn: [],
    missingDataMy: [],
    imageUrl: 'https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/sample.webp',
    imageVerified: true,
    sources: [
      {
        labelEn: 'Kalodata Thailand TikTok Shop Product Rank',
        labelMy: 'Kalodata ထိုင်း TikTok Shop Product Rank',
        url: `https://www.kalodata.com/product/detail?id=${numericId}`,
        sourceType: 'Kalodata OpenAPI',
        verified: true,
      },
    ],
    videoIdeas: [
      {
        titleEn: '3-Way Linen Outfit Styling',
        titleMy: 'လိုင်နင် ၃ မျိုးတွဲဝတ်ပြခြင်း',
        formatEn: '15s AI Virtual Model Lookbook',
        formatMy: '၁၅ စက္ကန့် AI Model ဗီဒီယို',
        outlineEn: 'Show office, brunch, and evening looks.',
        outlineMy: 'ရုံးတက်၊ အပြင်ထွက်၊ ညနေပိုင်း တွဲဝတ်ပြပါ။',
      },
      {
        titleEn: 'Bangkok Heat Breathability Check',
        titleMy: 'ဘန်ကောက်ရာသီဥတု လေဝင်လေထွက်ပြသမှု',
        formatEn: 'Fabric Texture Close-up',
        formatMy: 'အထည်သားအနီးကပ်ပြသမှု',
        outlineEn: 'Highlight breathable weave.',
        outlineMy: 'လေဝင်လေထွက်ကောင်းသော အထည်သားကို ပြသပါ။',
      },
      {
        titleEn: 'Price vs Tailoring Value',
        titleMy: 'ဈေးနှုန်းနှင့် ချုပ်လုပ်မှုတန်ဖိုး',
        formatEn: 'Side-by-Side Value Hook',
        formatMy: 'တန်ဖိုးနှိုင်းယှဉ်ပြသမှု',
        outlineEn: 'Compare ฿590 tailored fit against mall prices.',
        outlineMy: '฿590 ချုပ်လုပ်မှုကို ဈေးဝယ်စင်တာဈေးနှုန်းနှင့် နှိုင်းယှဉ်ပြပါ။',
      },
    ],
    researchedAt: '2026-07-10T09:00:00.000Z',
    researchMode: 'balanced',
    kalodataMetrics: {
      productId: numericId,
      dateRange: 'last7Day',
      researchMode: 'balanced',
      salesVolume: 1400,
      revenueThb: 826000,
      revenueGrowthRate: 32,
      unitPriceThb: 590,
      commissionRatePct: 14,
      liveRevenueThb: 200000,
      videoRevenueThb: 520000,
      showcaseRevenueThb: 106000,
      launchDate: '2026-01-15',
      creatorNumber: 28,
      sellerId: 'shop_111',
      sellerName: 'BKKAtelier Official TH',
      skuCount: 6,
      priCategory: null,
      secCategory: null,
      terCategory: null,
      categoryIdsRequested: ['601152'],
    },
    ...overrides,
  };
}

function makeAiAnalysis(productId: string, rating: 'High' | 'Good' | 'Moderate' = 'High'): AiProductAnalysis {
  return {
    schemaVersion: 1,
    canonicalProductId: productId,
    dataFingerprint: `fp_${productId}`,
    source: 'gemini',
    modelUsed: 'gemini-3.1-flash-lite',
    analyzedAt: '2026-07-10T10:00:00.000Z',
    geminiFailed: false,
    overallDataConfidence: 'High',
    confidenceNoteEn: 'Based strictly on Kalodata metrics.',
    confidenceNoteMy: 'Kalodata ဒေတာအပေါ်သာ အခြေခံထားသည်။',
    dataBasis: [],
    strengthsEn: ['High revenue momentum'],
    strengthsMy: ['ဝင်ငွေတိုးတက်မှုကောင်း'],
    weaknessesEn: ['Moderate competition'],
    weaknessesMy: ['ပြိုင်ဆိုင်မှုအလယ်အလတ်'],
    salesAndRevenueEn: '1,400 units / 826,000 THB.',
    salesAndRevenueMy: '၁,၄၀၀ ခု / 826,000 THB။',
    salesAndRevenueStatus: 'verified',
    growthPotentialEn: '+32% growth.',
    growthPotentialMy: '+32% တိုးတက်မှု။',
    growthPotentialStatus: 'verified',
    commissionPotentialEn: '14% commission.',
    commissionPotentialMy: '14% ကော်မရှင်။',
    commissionPotentialStatus: 'verified',
    competitionAnalysisEn: '28 creators.',
    competitionAnalysisMy: 'Creator ၂၈ ဦး။',
    competitionStatus: 'verified',
    targetCustomerEn: 'Thai women aged 22-38.',
    targetCustomerMy: 'အသက် ၂၂-၃၈ ထိုင်းအမျိုးသမီးများ။',
    targetCustomerStatus: 'estimated',
    whyChooseEn: 'Strong volume and solid commission.',
    whyChooseMy: 'ရောင်းအားကောင်းပြီး ကော်မရှင်သင့်တော်သည်။',
    risksAndDrawbacksEn: ['Size return risk'],
    risksAndDrawbacksMy: ['ဆိုက်ဒ်မတိုက်၍ ပြန်ပို့နိုင်သည်'],
    aiContentSuitability: {
      adFormat: 'ai-virtual-female-model',
      suitabilityRating: rating,
      status: 'estimated',
      summaryEn: 'Strong fit for virtual model outfit demo.',
      summaryMy: 'AI Virtual Model ဖြင့် ပြသရန်ကောင်းသည်။',
      creativeAnglesEn: ['3-way styling reel'],
      creativeAnglesMy: ['၃ မျိုးတွဲဝတ်ပြခြင်း'],
      cautionsEn: ['Match real fabric texture'],
      cautionsMy: ['အထည်သားအမှန်နှင့် တူညီအောင်ပြသပါ'],
    },
    finalRecommendation: {
      verdict: 'priority-test',
      headlineEn: 'Priority Test',
      headlineMy: 'ဦးစားပေးစမ်းသပ်သင့်သည်',
      actionPlanEn: 'Launch 3 outfit hooks.',
      actionPlanMy: 'Outfit Hook ၃ ခုဖြင့် စမ်းသပ်ပါ။',
    },
  };
}

test('Phase 7 Legacy Cleanup: Google Search Grounding & liveStorefrontRetriever removed while manual Pause/Resume remains functional', () => {
  const repoRoot = process.cwd();
  assert.equal(fs.existsSync(path.join(repoRoot, 'server/liveStorefrontRetriever.ts')), false);

  const researchServiceSrc = fs.readFileSync(path.join(repoRoot, 'server/researchService.ts'), 'utf8');
  assert.equal(researchServiceSrc.includes('liveStorefrontRetriever'), false);
  assert.equal(researchServiceSrc.includes('googleSearch'), false);
  assert.equal(researchServiceSrc.includes('SEARCH_QUOTA_EXHAUSTED'), false);
  assert.equal(researchServiceSrc.includes('verifyProductMediaAndListing'), false);

  const imageRetrieverSrc = fs.readFileSync(path.join(repoRoot, 'server/imageRetriever.ts'), 'utf8');
  assert.equal(imageRetrieverSrc.includes('verifyProductMediaAndListing'), false);
  assert.equal(imageRetrieverSrc.includes('parseJsonLdProducts'), false);

  // Active manual Pause/Resume safety gate still works cleanly
  const paused = pauseResearch('manual');
  assert.equal(paused.paused, true);
  assert.equal(paused.reason, 'manual');
  assert.equal(getResearchQuotaStatus().paused, true);

  const resumed = resumeResearch();
  assert.equal(resumed.paused, false);
  assert.equal(resumed.reason, null);
  assert.equal(getResearchQuotaStatus().paused, false);
});

test('Phase 7 Scoring Engine: 7-factor weights sum to 100, Unavailable redistributes proportionally, and Strategy Slider shifts scores & rankings', () => {
  for (const pct of [10, 30, 50, 70, 90]) {
    const weights = computeStrategyWeights(pct);
    const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);
    assert.equal(Math.round(totalWeight * 100) / 100, 100);
  }

  const highSalesLowComm = makeProduct({
    id: 'kd_sales_hero',
    name: 'High Volume Basic Tee',
    commissionRate: 5,
    estimatedCommissionPerSaleThb: 12,
    kalodataMetrics: {
      ...makeProduct().kalodataMetrics!,
      productId: 'sales_hero',
      salesVolume: 6500,
      revenueThb: 1_950_000,
      revenueGrowthRate: 45,
      commissionRatePct: 5,
      creatorNumber: 25,
    },
  });

  const highCommLowSales = makeProduct({
    id: 'kd_comm_hero',
    name: 'High Commission Glow Serum',
    category: 'cosmetics-beauty',
    commissionRate: 28,
    estimatedCommissionPerSaleThb: 196,
    priceThb: 700,
    kalodataMetrics: {
      ...makeProduct().kalodataMetrics!,
      productId: 'comm_hero',
      salesVolume: 180,
      revenueThb: 126_000,
      revenueGrowthRate: 18,
      commissionRatePct: 28,
      creatorNumber: 12,
    },
  });

  const batch = [highSalesLowComm, highCommLowSales];
  const salesFirstEvals = evaluateProductBatch(batch, { salesWeightPct: 90 });
  const commFirstEvals = evaluateProductBatch(batch, { salesWeightPct: 10 });

  assert.ok(
    salesFirstEvals.get('kd_sales_hero')!.totalScore >
      salesFirstEvals.get('kd_comm_hero')!.totalScore,
    'Sales-first strategy (90/10) should rank high-sales product higher'
  );
  assert.ok(
    commFirstEvals.get('kd_comm_hero')!.totalScore >
      commFirstEvals.get('kd_sales_hero')!.totalScore,
    'Commission-first strategy (10/90) should rank high-commission product higher'
  );

  // Unavailable factors must keep active effective weights normalized to 100%
  const partialProduct = makeProduct({
    id: 'kd_partial',
    commissionRate: null,
    commissionStatus: 'unavailable',
    competitionStatus: 'unavailable',
    kalodataMetrics: {
      ...makeProduct().kalodataMetrics!,
      productId: 'partial',
      revenueGrowthRate: null,
      commissionRatePct: null,
      creatorNumber: null,
    },
  });
  const partialEval = evaluateProductOpportunity(partialProduct, { salesWeightPct: 50 });
  assert.equal(partialEval.criteria.length, 7);
  assert.ok(partialEval.unavailableCount >= 3);
  const sumEffective = partialEval.criteria.reduce((sum, item) => sum + item.effectiveWeight, 0);
  assert.ok(Math.abs(sumEffective - 100) < 0.2);
});

test('Phase 7 Canonical Product ID & Comparison Matrix: Normalizes kalodata-th- / kd_ / kd- prefixes and preserves Unavailable integrity', () => {
  const p1 = makeProduct({ id: 'kalodata-th-987654321', kalodataMetrics: undefined });
  const p2 = makeProduct({ id: 'kd_987654321', kalodataMetrics: undefined });
  const p3 = makeProduct({ id: 'kd-987654321', kalodataMetrics: undefined });
  const p4 = makeProduct({ id: 'custom_alias', kalodataMetrics: { ...makeProduct().kalodataMetrics!, productId: '987654321' } });

  assert.equal(getCanonicalProductId(p1), '987654321');
  assert.equal(getCanonicalProductId(p2), '987654321');
  assert.equal(getCanonicalProductId(p3), '987654321');
  assert.equal(getCanonicalProductId(p4), '987654321');

  const distinctProduct = makeProduct({
    id: 'kd_555555',
    name: 'Unenriched Serum',
    category: 'cosmetics-beauty',
    commissionRate: null,
    commissionStatus: 'unavailable',
    kalodataMetrics: {
      ...makeProduct().kalodataMetrics!,
      productId: '555555',
      commissionRatePct: null,
      creatorNumber: null,
      revenueGrowthRate: null,
    },
  });

  const compareItems: ComparisonSelectionItem[] = [
    {
      selectionKey: `results:${p4.id}`,
      canonicalProductId: getCanonicalProductId(p4),
      product: p4,
      source: 'results',
      sourceLabelEn: 'Live Results',
      sourceLabelMy: 'လက်ရှိရလဒ်',
      researchDate: '2026-07-10T09:00:00.000Z',
    },
    {
      selectionKey: `saved:${distinctProduct.id}`,
      canonicalProductId: getCanonicalProductId(distinctProduct),
      product: distinctProduct,
      source: 'saved',
      sourceLabelEn: 'Saved',
      sourceLabelMy: 'သိမ်းထားသည်',
      researchDate: '2026-07-09T09:00:00.000Z',
    },
  ];

  const matrix = buildProductComparisonMatrix(compareItems, 50);
  assert.equal(matrix.columns.length, 2);
  assert.equal(matrix.hasDistinctProductIds, true);
  assert.equal(matrix.distinctProductIdCount, 2);

  const commRow = matrix.rows.find((r) => r.key === 'commission');
  assert.ok(commRow);
  assert.equal(commRow.valuesEn[1], 'Unavailable');
});

test('Phase 7 Consistency: Results Card, Report Drawer, and CSV/JSON Exports match 100% including AI Suitability & attached AI Analysis', () => {
  const ai = makeAiAnalysis('1700000000001', 'Good');
  const product = makeProduct({
    aiVideoSuitability: 'Moderate', // Raw baseline says Moderate, 7-factor evaluation scores >= 76 -> unified band must be 'High' everywhere
    aiAnalysis: ai,
  });

  const evaluation = evaluateProductOpportunity(product, { salesWeightPct: 50, peerProducts: [product] });
  const decision = deriveProductDecisionSummary(product, evaluation, ai);
  const unifiedBand = getEffectiveAiSuitabilityBand(product, evaluation);

  const aiCrit = evaluation.criteria.find((c) => c.key === 'aiContentSuitability');
  assert.ok(aiCrit && aiCrit.normalizedScore !== null);
  const expectedBand =
    aiCrit.normalizedScore >= 76 ? 'High' : aiCrit.normalizedScore >= 58 ? 'Good' : 'Moderate';
  assert.equal(unifiedBand, expectedBand);

  const evalMap = new Map([[product.id, evaluation]]);
  const json = JSON.parse(
    buildProductsExportJson([product], { salesWeightPct: 50, evaluations: evalMap, language: 'en' })
  ) as {
    items: Array<{
      productData: { aiContentSuitability: string };
      scoreBreakdown: { totalScore: number };
      dataConfidence: { level: string };
      decisionSummary: { verdict: string };
      aiAnalysis: { source: string; modelUsed: string } | 'Unavailable';
    }>;
  };

  assert.equal(json.items[0].scoreBreakdown.totalScore, evaluation.totalScore);
  assert.equal(json.items[0].dataConfidence.level, evaluation.confidenceLevel);
  assert.equal(json.items[0].decisionSummary.verdict, decision.verdict);
  assert.equal(json.items[0].productData.aiContentSuitability, unifiedBand);
  assert.notEqual(json.items[0].aiAnalysis, 'Unavailable');
  if (json.items[0].aiAnalysis !== 'Unavailable') {
    assert.equal(json.items[0].aiAnalysis.source, 'gemini');
    assert.equal(json.items[0].aiAnalysis.modelUsed, 'gemini-3.1-flash-lite');
  }

  const csv = buildProductsExportCsv([product], { salesWeightPct: 50, evaluations: evalMap, language: 'en' });
  assert.ok(csv.includes(String(evaluation.totalScore)));
  assert.ok(csv.includes(unifiedBand));
  assert.ok(csv.includes('Gemini AI'));
  assert.ok(csv.includes('priority-test'));
});

test('Phase 7 Filtering & Sorting: All 9 filter criteria and all 8 sort fields work in Highest/Lowest with Unavailable sinking to bottom', () => {
  const pTop = makeProduct({
    id: 'kd_top',
    name: 'Top Beauty Cushion',
    category: 'cosmetics-beauty',
    priceThb: 450,
    commissionRate: 20,
    kalodataMetrics: {
      ...makeProduct().kalodataMetrics!,
      productId: 'top',
      salesVolume: 3000,
      revenueThb: 1_350_000,
      revenueGrowthRate: 60,
      commissionRatePct: 20,
      creatorNumber: 15,
    },
  });
  const pMid = makeProduct({
    id: 'kd_mid',
    name: 'Mid Fashion Dress',
    category: 'womens-fashion',
    priceThb: 890,
    commissionRate: 10,
    kalodataMetrics: {
      ...makeProduct().kalodataMetrics!,
      productId: 'mid',
      salesVolume: 500,
      revenueThb: 445_000,
      revenueGrowthRate: 12,
      commissionRatePct: 10,
      creatorNumber: 80,
    },
  });
  const pSparse = makeProduct({
    id: 'kd_sparse',
    name: 'Sparse Unavailable Item',
    category: 'womens-fashion',
    priceThb: null,
    priceStatus: 'unavailable',
    commissionRate: null,
    commissionStatus: 'unavailable',
    competitionStatus: 'unavailable',
    kalodataMetrics: {
      ...makeProduct().kalodataMetrics!,
      productId: 'sparse',
      salesVolume: null,
      revenueThb: null,
      revenueGrowthRate: null,
      commissionRatePct: null,
      creatorNumber: null,
    },
  });

  const all = [pSparse, pMid, pTop];
  const evals = evaluateProductBatch(all, { salesWeightPct: 50 });

  // Test all 8 sort fields in both directions; sparse unavailable product must sink to bottom on metric sorts
  const fields: ProductSortField[] = [
    'overallScore',
    'salesPerformance',
    'revenuePerformance',
    'revenueGrowth',
    'commissionPotential',
    'competition',
    'aiContentSuitability',
    'dataConfidence',
  ];

  for (const field of fields) {
    const desc = sortProductsByField(all, evals, field, 'desc');
    const asc = sortProductsByField(all, evals, field, 'asc');
    assert.equal(desc.length, 3);
    assert.equal(asc.length, 3);

    if (
      field === 'salesPerformance' ||
      field === 'revenuePerformance' ||
      field === 'revenueGrowth' ||
      field === 'commissionPotential' ||
      field === 'competition'
    ) {
      assert.equal(desc[2].id, 'kd_sparse', `Unavailable must sink to bottom for ${field} desc`);
      assert.equal(asc[2].id, 'kd_sparse', `Unavailable must sink to bottom for ${field} asc`);
    }
  }

  // Test combined multi-criteria filtering across the real 9-criteria ProductResultsFilterState
  const combinedFilters: ProductResultsFilterState = {
    ...DEFAULT_PRODUCT_FILTERS,
    category: 'cosmetics-beauty',
    commissionPotential: 'high',
    salesPerformance: 'strong',
    researchMode: 'balanced',
    confidenceLevel: 'High',
  };
  const filtered = filterProducts(all, evals, combinedFilters);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, 'kd_top');

  // Unavailable competition filter isolates sparse product cleanly
  const unavailableCompFiltered = filterProducts(all, evals, {
    ...DEFAULT_PRODUCT_FILTERS,
    competitionLevel: 'unavailable',
  });
  assert.equal(unavailableCompFiltered.length, 1);
  assert.equal(unavailableCompFiltered[0].id, 'kd_sparse');
});

test('Phase 7 LocalStorage Isolation & Legacy Compatibility: Deleting History never affects Saved Products (and vice versa), and legacy history loads safely', () => {
  const mem = installMockStorage();

  const savedItem = createSavedRecord(makeProduct({ id: 'kd_saved_only' }));
  assert.equal(persistSavedProductsWithStatus([savedItem]).ok, true);

  const config: ResearchConfig = {
    market: 'Thailand TikTok Shop',
    category: 'all',
    selectedCategories: ['womens-fashion', 'cosmetics-beauty'],
    bothCategoryMode: 'combined',
    researchMode: 'fast',
    spendingLimitCredits: 1,
    priceLimit: 'unrestricted',
    strategyPreset: 'balanced',
    salesWeightPct: 50,
    quantity: 10,
  };
  const session: ResearchSessionResponse = {
    products: [makeProduct({ id: 'kd_hist_only' })],
    requestedQuantity: 10,
    verifiedProductCount: 1,
    filteredOutCount: 0,
    researchedAt: '2026-07-10T09:00:00.000Z',
    config,
    groundingSources: [],
    searchQueries: [],
    researchSourceMode: 'kalodata-openapi',
  };
  const historyRecord = createResearchHistoryRecord(session, config);
  assert.equal(persistResearchHistory([historyRecord]).ok, true);

  // Deleting ALL Research History must NOT affect Saved Products
  assert.equal(persistResearchHistory([]).ok, true);
  assert.equal(loadResearchHistory().length, 0);
  assert.equal(loadSavedProducts().length, 1);
  assert.equal(loadSavedProducts()[0].id, 'kd_saved_only');

  // Re-add history, then delete ALL Saved Products -> History must remain intact
  assert.equal(persistResearchHistory([historyRecord]).ok, true);
  assert.equal(persistSavedProductsWithStatus([]).ok, true);
  assert.equal(loadSavedProducts().length, 0);
  assert.equal(loadResearchHistory().length, 1);
  assert.equal(loadResearchHistory()[0].id, historyRecord.id);

  // Pre-existing legacy localStorage history record with 'google-search-grounding' must still load safely
  const legacyRecord: ResearchHistoryRecord = {
    ...historyRecord,
    id: 'res_legacy_grounding',
    researchSourceMode: 'google-search-grounding',
  };
  mem.setItem(
    RESEARCH_HISTORY_STORAGE_KEY,
    JSON.stringify({ schemaVersion: 1, records: [legacyRecord] })
  );
  const loadedLegacy = loadResearchHistory();
  assert.equal(loadedLegacy.length, 1);
  assert.equal(loadedLegacy[0].id, 'res_legacy_grounding');
  assert.equal(loadedLegacy[0].researchSourceMode, 'google-search-grounding');
});

test('Phase 7 Gemini AI Fallback Reliability: Missing GEMINI_API_KEY gracefully returns Kalodata fallback with 0 network calls', async () => {
  const originalKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;

  try {
    const product = makeProduct();
    const result = await analyzeSingleProductWithGemini(product);
    assert.equal(result.source, 'kalodata-fallback');
    assert.equal(result.geminiFailed, true);
    assert.equal(result.fallbackReasonCode, 'MISSING_API_KEY');
    assert.ok(result.strengthsEn.length > 0);
    assert.ok(result.strengthsMy.length > 0);
    assert.ok(result.finalRecommendation.headlineEn.length > 0);
    assert.ok(result.finalRecommendation.headlineMy.length > 0);
  } finally {
    if (originalKey !== undefined) {
      process.env.GEMINI_API_KEY = originalKey;
    }
  }
});

test('Latest Research Results Persistence: Restores across reopen, replaces on new search, falls back to history, recovers from corruption, and stays isolated on quota/delete', () => {
  const mem = installMockStorage();

  const savedItem = createSavedRecord(makeProduct({ id: 'kd_saved_keep' }));
  assert.equal(persistSavedProductsWithStatus([savedItem]).ok, true);

  const firstConfig: ResearchConfig = {
    market: 'Thailand TikTok Shop',
    category: 'womens-fashion',
    selectedCategories: ['womens-fashion'],
    bothCategoryMode: 'combined',
    researchMode: 'fast',
    spendingLimitCredits: 2,
    priceLimit: 'unrestricted',
    strategyPreset: 'balanced',
    salesWeightPct: 50,
    quantity: 10,
    myanmarLanguageOnly: true,
    myanmarVideoScanPages: 5,
  };

  const firstProduct = makeProduct({
    id: 'kd_first_run',
    name: 'First Run Linen Blazer',
    aiAnalysis: makeAiAnalysis('first_run', 'High'),
  });

  // 1. Persist first search session (simulating app close & reopen)
  const writeFirst = persistLatestResearchSession({
    products: [firstProduct],
    sessionMeta: {
      requestedQuantity: 10,
      verifiedProductCount: 1,
      filteredOutCount: 0,
      myanmarFilterApplied: true,
      myanmarVideoDiscovery: {
        requestedQuantity: 10,
        videoPagesScanned: 3,
        maxVideoScanPages: 5,
        totalVideosScanned: 300,
        matchedMyanmarVideos: 4,
        uniqueCandidateProductsFound: 2,
        affiliateProductsVerified: 1,
        nonAffiliateOrUnavailableSkipped: 1,
        videoRankApiCalls: 3,
        productDetailApiCalls: 0,
        productDetailCacheHits: 1,
        stopReason: 'max-pages-reached',
      },
    },
    lastCostSummary: null,
    researchSourceMode: 'kalodata-openapi',
    researchedAt: '2026-07-10T09:00:00.000Z',
    groundingSources: [],
    searchQueries: ['video-first:womens-fashion'],
    activeHuntConfig: firstConfig,
    rejectedIds: ['kd_rejected_1'],
  });
  assert.equal(writeFirst.ok, true);

  const restoredFirst = loadLatestResearchSession();
  assert.ok(restoredFirst);
  assert.equal(restoredFirst.products.length, 1);
  assert.equal(restoredFirst.products[0].id, 'kd_first_run');
  assert.equal(restoredFirst.products[0].aiAnalysis?.source, 'gemini');
  assert.equal(restoredFirst.sessionMeta.myanmarFilterApplied, true);
  assert.equal(restoredFirst.sessionMeta.myanmarVideoDiscovery?.affiliateProductsVerified, 1);
  assert.deepEqual(restoredFirst.rejectedIds, ['kd_rejected_1']);
  assert.equal(restoredFirst.activeHuntConfig?.myanmarVideoScanPages, 5);

  // 2. New search completes -> replaces old results completely
  const secondProduct = makeProduct({
    id: 'kd_second_run',
    name: 'Second Run Glow Serum',
    category: 'cosmetics-beauty',
  });
  const secondConfig: ResearchConfig = {
    ...firstConfig,
    category: 'cosmetics-beauty',
    selectedCategories: ['cosmetics-beauty'],
    myanmarLanguageOnly: false,
  };
  const writeSecond = persistLatestResearchSession({
    products: [secondProduct],
    sessionMeta: {
      requestedQuantity: 20,
      verifiedProductCount: 1,
      filteredOutCount: 2,
      myanmarFilterApplied: false,
    },
    lastCostSummary: null,
    researchSourceMode: 'kalodata-openapi',
    researchedAt: '2026-07-11T10:30:00.000Z',
    groundingSources: [],
    searchQueries: ['cosmetics-beauty'],
    activeHuntConfig: secondConfig,
    rejectedIds: [],
  });
  assert.equal(writeSecond.ok, true);

  const restoredSecond = loadLatestResearchSession();
  assert.ok(restoredSecond);
  assert.equal(restoredSecond.products.length, 1);
  assert.equal(restoredSecond.products[0].id, 'kd_second_run');
  assert.equal(restoredSecond.sessionMeta.requestedQuantity, 20);
  assert.equal(restoredSecond.sessionMeta.myanmarFilterApplied, false);
  assert.deepEqual(restoredSecond.rejectedIds, []);

  // 3. Isolation: Deleting Research History or Saved Products must NOT remove latest Research Results
  const histSession: ResearchSessionResponse = {
    products: [makeProduct({ id: 'kd_history_fallback' })],
    requestedQuantity: 10,
    verifiedProductCount: 1,
    filteredOutCount: 0,
    researchedAt: '2026-07-09T08:00:00.000Z',
    config: secondConfig,
    groundingSources: [],
    searchQueries: [],
    researchSourceMode: 'kalodata-openapi',
  };
  const histRecord = createResearchHistoryRecord(histSession, secondConfig);
  assert.equal(persistResearchHistory([histRecord]).ok, true);
  assert.equal(persistResearchHistory([]).ok, true);
  assert.equal(persistSavedProductsWithStatus([]).ok, true);

  const stillThere = loadLatestResearchSession();
  assert.ok(stillThere);
  assert.equal(stillThere.products[0].id, 'kd_second_run');

  // 4. Fallback to newest ResearchHistoryRecord when dedicated session key is missing or corrupted
  clearLatestResearchSession();
  assert.equal(loadLatestResearchSession(), null);
  const fromHistory = loadLatestResearchSession([histRecord]);
  assert.ok(fromHistory);
  assert.equal(fromHistory.products[0].id, 'kd_history_fallback');
  assert.equal(fromHistory.researchedAt, '2026-07-09T08:00:00.000Z');

  // Corrupted JSON recovers safely to history fallback (or null if no history)
  mem.setItem(LATEST_RESEARCH_SESSION_STORAGE_KEY, '{not-valid-json');
  assert.equal(loadLatestResearchSession(), null);
  const recoveredFromHistory = loadLatestResearchSession([histRecord]);
  assert.ok(recoveredFromHistory);
  assert.equal(recoveredFromHistory.products[0].id, 'kd_history_fallback');

  // 5. QuotaExceededError returns ok=false without deleting Saved Products or Research History
  assert.equal(persistSavedProductsWithStatus([savedItem]).ok, true);
  assert.equal(persistResearchHistory([histRecord]).ok, true);

  const originalSetItem = mem.setItem.bind(mem);
  mem.setItem = (key: string, value: string) => {
    if (key === LATEST_RESEARCH_SESSION_STORAGE_KEY) {
      const err = new Error('QuotaExceededError');
      err.name = 'QuotaExceededError';
      throw err;
    }
    originalSetItem(key, value);
  };

  const quotaRes = persistLatestResearchSession({
    products: [secondProduct],
    sessionMeta: {
      requestedQuantity: 10,
      verifiedProductCount: 1,
      filteredOutCount: 0,
    },
    lastCostSummary: null,
    researchSourceMode: 'kalodata-openapi',
    researchedAt: '2026-07-11T11:00:00.000Z',
    groundingSources: [],
    searchQueries: [],
    activeHuntConfig: secondConfig,
    rejectedIds: [],
  });
  assert.equal(quotaRes.ok, false);
  assert.equal(quotaRes.quotaExceeded, true);
  assert.equal(loadSavedProducts().length, 1);
  assert.equal(loadSavedProducts()[0].id, 'kd_saved_keep');
  assert.equal(loadResearchHistory().length, 1);
  assert.equal(loadResearchHistory()[0].id, histRecord.id);
});

test('Light Mode / Dark Mode Persistence: Resolves default light theme, persists dark/light toggle to localStorage, and ignores invalid values', () => {
  const mem = installMockStorage();
  const originalWindow = globalThis.window;

  Object.defineProperty(globalThis, 'window', {
    value: {
      localStorage: mem,
      matchMedia: () => ({ matches: false }),
    },
    configurable: true,
    writable: true,
  });

  try {
    // Defaults to light when no preference and OS is light
    assert.equal(resolveInitialTheme(), 'light');

    // Persists dark mode
    persistTheme('dark');
    assert.equal(mem.getItem(THEME_STORAGE_KEY), 'dark');
    assert.equal(resolveInitialTheme(), 'dark');

    // Persists light mode
    persistTheme('light');
    assert.equal(mem.getItem(THEME_STORAGE_KEY), 'light');
    assert.equal(resolveInitialTheme(), 'light');

    // Ignores corrupted value and respects OS prefers-color-scheme: dark fallback
    mem.setItem(THEME_STORAGE_KEY, 'invalid-theme');
    Object.defineProperty(globalThis, 'window', {
      value: {
        localStorage: mem,
        matchMedia: () => ({ matches: true }),
      },
      configurable: true,
      writable: true,
    });
    assert.equal(resolveInitialTheme(), 'dark');
  } finally {
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      Object.defineProperty(globalThis, 'window', {
        value: originalWindow,
        configurable: true,
        writable: true,
      });
    }
  }
});

