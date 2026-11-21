import test from 'node:test';
import assert from 'node:assert/strict';

import type {
  AiProductAnalysis,
  KalodataProductDetailEnrichmentRecord,
  ResearchConfig,
  ResearchProduct,
  ResearchSessionResponse,
  SavedProductRecord,
} from '../src/types/product.ts';
import { formatThb, isSafeHttpUrl } from '../src/utils/format.ts';
import { evaluateProductOpportunity } from '../src/utils/scoring.ts';
import { deriveProductDecisionSummary } from '../src/utils/productAnalytics.ts';
import {
  buildCompleteTextReport,
  buildProductsExportCsv,
  buildProductsExportJson,
  escapeCsvCell,
  sanitizeDownloadFilename,
} from '../src/utils/exportReports.ts';
import {
  createSavedRecord,
  loadSavedProducts,
  persistSavedProductsWithStatus,
  SAVED_PRODUCTS_LEGACY_KEY,
  SAVED_PRODUCTS_STORAGE_KEY,
} from '../src/utils/savedProductsStorage.ts';
import {
  createResearchHistoryRecord,
  loadResearchHistory,
  persistResearchHistory,
  RESEARCH_HISTORY_STORAGE_KEY,
} from '../src/utils/researchHistoryStorage.ts';
import {
  AI_ANALYSIS_CACHE_STORAGE_KEY,
  getCachedAiAnalysisForProduct,
  loadAiAnalysisCacheMap,
  MAX_AI_ANALYSIS_CACHE_ENTRIES,
  saveCachedAiAnalysis,
} from '../src/utils/aiAnalysisCache.ts';
import {
  ENRICHMENT_CACHE_STORAGE_KEY,
  loadEnrichmentCache,
  saveEnrichmentToCache,
} from '../src/utils/enrichmentCache.ts';
import { isSafeExternalUrl } from '../server/imageRetriever.ts';
import {
  fetchKalodataCreditBalance,
  fetchKalodataProductDetail,
} from '../server/kalodataService.ts';

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  public quotaLimitBytes: number | null = null;
  public failNextSetItemWithQuota = false;

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
    if (this.failNextSetItemWithQuota) {
      this.failNextSetItemWithQuota = false;
      const err = new Error('QuotaExceededError');
      err.name = 'QuotaExceededError';
      throw err;
    }
    if (this.quotaLimitBytes !== null) {
      let total = value.length * 2;
      for (const [k, v] of this.store.entries()) {
        if (k !== key) total += v.length * 2;
      }
      if (total > this.quotaLimitBytes) {
        const err = new Error('QuotaExceededError');
        err.name = 'QuotaExceededError';
        throw err;
      }
    }
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
  return {
    id: 'kd_1729384756123',
    name: 'Thai Silk UV Cushion Compact SPF50+',
    nameMy: 'ထိုင်း UV Cushion Compact SPF50+',
    brand: 'SiamGlow',
    category: 'cosmetics-beauty',
    subCategory: 'Cushion Foundation',
    subCategoryMy: 'Cushion ဖောင်ဒေးရှင်း',
    shopName: 'SiamGlow Official TH',
    dispatchHub: 'Bangkok, Thailand',
    priceThb: 399,
    priceStatus: 'verified',
    commissionRate: 15,
    commissionVerified: true,
    commissionStatus: 'verified',
    estimatedCommissionPerSaleThb: 60,
    commissionNoteEn: '15% verified affiliate rate',
    commissionNoteMy: '15% တရားဝင်ကော်မရှင်နှုန်း',
    imageSourceNoteEn: 'Verified official listing image',
    imageSourceNoteMy: 'တရားဝင်ပုံဖြစ်သည်',
    demandEvidenceEn: ['Strong repeat buyer interest'],
    demandEvidenceMy: ['ဝယ်ယူသူ ပြန်လည်ဝယ်ယူမှုမြင့်မား'],
    demandStatus: 'verified',
    competitionLevel: 'Moderate',
    competitionDetailEn: '42 active creators promoting',
    competitionDetailMy: 'Creator ၄၂ ဦး ကြော်ငြာနေသည်',
    competitionStatus: 'verified',
    customerRating: 4.8,
    reviewCount: 412,
    reviewCountStatus: 'verified',
    customerRatingStatus: 'verified',
    reviewStrengthsEn: ['Lightweight finish'],
    reviewStrengthsMy: ['ပေါ့ပါးစွာလိမ်းနိုင်သည်'],
    customerComplaintsEn: ['Limited shade range'],
    customerComplaintsMy: ['အရောင်ရွေးချယ်စရာနည်းသည်'],
    demandLevel: 'High',
    aiVideoSuitability: 'High',
    aiVideoDetailEn: 'Strong before/after texture visual proof',
    aiVideoDetailMy: 'Before/After ပြသရန် အလွန်သင့်တော်',
    sellerReliabilityLevel: 'Reliable',
    sellerReliabilityEn: 'Verified official Thailand store',
    sellerReliabilityMy: 'တရားဝင် ထိုင်းဆိုင်ဖြစ်သည်',
    whyChooseEn: 'Strong volume and 15% affiliate commission.',
    whyChooseMy: 'ရောင်းအားကောင်းပြီး ကော်မရှင် 15% ရသည်။',
    salesPotentialEn: 'Strong 7-day sales volume.',
    salesPotentialMy: '၇ ရက်အတွင်း ရောင်းအားကောင်းမွန်သည်။',
    confidenceLevel: 'High',
    confidenceDetailEn: 'Verified Kalodata OpenAPI metrics.',
    confidenceDetailMy: 'Kalodata OpenAPI တကယ့်ဒေတာများဖြစ်သည်။',
    scoringInputs: {
      demandSales: { rawStrength: 80, verification: 'verified', evidenceEn: '1,240 units', evidenceMy: '၁,၂၄၀ ခု' },
      commissionEarning: { rawStrength: 78, verification: 'verified', evidenceEn: '15%', evidenceMy: '15%' },
      aiCreative: { rawStrength: 85, verification: 'estimated', evidenceEn: 'High visual demo', evidenceMy: 'ဗီဒီယိုပြသရန်ကောင်း' },
      reviewsQuality: { rawStrength: 82, verification: 'verified', evidenceEn: '4.8/5', evidenceMy: '4.8/5' },
      priceAppeal: { rawStrength: 80, verification: 'verified', evidenceEn: '฿399', evidenceMy: '฿399' },
      competitionOpportunity: { rawStrength: 70, verification: 'verified', evidenceEn: '42 creators', evidenceMy: '42 creators' },
      sellerReliability: { rawStrength: 80, verification: 'verified', evidenceEn: 'Official TH shop', evidenceMy: 'တရားဝင်ဆိုင်' },
    },
    opportunityScore: 82,
    generalRisksEn: ['Shade matching returns'],
    generalRisksMy: ['အရောင်မတိုက်ခြင်းကြောင့် ပြန်ပို့နိုင်သည်'],
    missingDataEn: [],
    missingDataMy: [],
    imageUrl: 'https://cdn.example.com/cushion.jpg',
    imageVerified: true,
    sources: [
      {
        labelEn: 'Kalodata Thailand TikTok Shop Product Rank',
        labelMy: 'Kalodata ထိုင်း TikTok Shop Product Rank',
        url: 'https://www.kalodata.com/product/detail?id=1729384756123',
        sourceType: 'Kalodata OpenAPI',
        verified: true,
      },
    ],
    videoIdeas: [
      {
        titleEn: 'Bangkok Heat Wear Test',
        titleMy: 'ဘန်ကောက်ရာသီဥတု ခံနိုင်ရည်စမ်းသပ်မှု',
        formatEn: '15s Split-Screen Wear Test',
        formatMy: '၁၅ စက္ကန့် Split-Screen စမ်းသပ်မှု',
        outlineEn: 'Show 8-hour oil control test.',
        outlineMy: '၈ နာရီကြာ အဆီထိန်းနိုင်မှုကို ပြသပါ။',
      },
      {
        titleEn: 'One-Tap Coverage Macro',
        titleMy: 'တစ်ချက်တည်း ဖုံးအုပ်နိုင်မှု Macro',
        formatEn: 'Product-Only Macro Demo',
        formatMy: 'Product-Only Macro ဗီဒီယို',
        outlineEn: 'Close-up sponge press and finish.',
        outlineMy: 'အနီးကပ် အသားအရေတင်ပြမှု။',
      },
      {
        titleEn: 'Price vs Quality Breakdown',
        titleMy: 'ဈေးနှုန်းနှင့် အရည်အသွေးနှိုင်းယှဉ်ချက်',
        formatEn: 'AI Virtual Model Review',
        formatMy: 'AI Model သုံးသပ်ချက်',
        outlineEn: 'Compare ฿399 cushion against high-end alternatives.',
        outlineMy: '฿399 Cushion ကို အခြားတံဆိပ်များနှင့် နှိုင်းယှဉ်ပြပါ။',
      },
    ],
    researchedAt: '2026-06-01T08:00:00.000Z',
    researchMode: 'balanced',
    kalodataMetrics: {
      productId: '1729384756123',
      dateRange: 'last7Day',
      researchMode: 'balanced',
      salesVolume: 1240,
      revenueThb: 494760,
      revenueGrowthRate: 24.5,
      unitPriceThb: 399,
      commissionRatePct: 15,
      liveRevenueThb: 120000,
      videoRevenueThb: 310000,
      showcaseRevenueThb: 64760,
      launchDate: '2025-11-01',
      creatorNumber: 42,
      sellerId: 'shop_998877',
      sellerName: 'SiamGlow Official TH',
      skuCount: 4,
      priCategory: null,
      secCategory: null,
      terCategory: null,
      categoryIdsRequested: ['601450'],
    },
    ...overrides,
  };
}

function makeAiAnalysis(productId: string, analyzedAt: string): AiProductAnalysis {
  return {
    schemaVersion: 1,
    canonicalProductId: productId,
    dataFingerprint: `fp_${productId}`,
    source: 'gemini',
    modelUsed: 'gemini-2.5-flash',
    analyzedAt,
    geminiFailed: false,
    overallDataConfidence: 'High',
    confidenceNoteEn: 'Based strictly on Kalodata metrics.',
    confidenceNoteMy: 'Kalodata ဒေတာအပေါ်သာ အခြေခံထားသည်။',
    dataBasis: [],
    strengthsEn: ['Strong revenue momentum'],
    strengthsMy: ['ဝင်ငွေတိုးတက်မှုကောင်း'],
    weaknessesEn: ['Moderate creator competition'],
    weaknessesMy: ['ပြိုင်ဆိုင်မှုအလယ်အလတ်'],
    salesAndRevenueEn: '1,240 units and 494,760 THB revenue.',
    salesAndRevenueMy: 'ရောင်းအား ၁,၂၄၀ ခုနှင့် ဝင်ငွေ 494,760 THB။',
    salesAndRevenueStatus: 'verified',
    growthPotentialEn: '+24.5% growth rate.',
    growthPotentialMy: '+24.5% တိုးတက်မှုရှိသည်။',
    growthPotentialStatus: 'verified',
    commissionPotentialEn: '15% commission yields ~60 THB per sale.',
    commissionPotentialMy: 'ကော်မရှင် 15% ဖြင့် တစ်ခုလျှင် ~60 THB ရရှိနိုင်သည်။',
    commissionPotentialStatus: 'verified',
    competitionAnalysisEn: '42 active creators.',
    competitionAnalysisMy: 'Creator ၄၂ ဦး ရှိသည်။',
    competitionStatus: 'verified',
    targetCustomerEn: 'Thai urban women aged 20-35.',
    targetCustomerMy: 'အသက် ၂၀-၃၅ ထိုင်းမြို့ပြအမျိုးသမီးများ။',
    targetCustomerStatus: 'estimated',
    whyChooseEn: 'Balanced volume and 15% commission.',
    whyChooseMy: 'ရောင်းအားနှင့် ကော်မရှင် မျှတသည်။',
    risksAndDrawbacksEn: ['Shade mismatch'],
    risksAndDrawbacksMy: ['အရောင်မတိုက်ခြင်း'],
    aiContentSuitability: {
      adFormat: 'product-only-3d-commercial',
      suitabilityRating: 'High',
      status: 'estimated',
      summaryEn: 'Great for short-form AI visual demo.',
      summaryMy: 'AI ဗီဒီယိုတိုအတွက် အထူးသင့်တော်သည်။',
      creativeAnglesEn: ['8-hour wear test'],
      creativeAnglesMy: ['၈ နာရီခံနိုင်ရည်စမ်းသပ်မှု'],
      cautionsEn: ['Avoid exaggerated skin claims'],
      cautionsMy: ['အလွန်အကျွံကြော်ငြာစကားရှောင်ပါ'],
    },
    finalRecommendation: {
      verdict: 'priority-test',
      headlineEn: 'Priority Test Candidate',
      headlineMy: 'ဦးစားပေး စမ်းသပ်သင့်သည်',
      actionPlanEn: 'Test 3 hook variations.',
      actionPlanMy: 'Hook ၃ မျိုးဖြင့် စမ်းသပ်ပါ။',
    },
  };
}

test('Security: isSafeExternalUrl blocks internal/loopback/IPv6-private/credential URLs and allows public HTTPS', () => {
  assert.equal(isSafeExternalUrl('https://p16-oec-va.ibyteimg.com/image.webp'), true);
  assert.equal(isSafeExternalUrl('https://cdn.example.com/product.jpg'), true);

  assert.equal(isSafeExternalUrl('http://127.0.0.1:3000/api/health'), false);
  assert.equal(isSafeExternalUrl('http://localhost/admin'), false);
  assert.equal(isSafeExternalUrl('http://sub.localhost/test'), false);
  assert.equal(isSafeExternalUrl('http://0.0.0.0:3000'), false);
  assert.equal(isSafeExternalUrl('http://[::1]:3000/'), false);
  assert.equal(isSafeExternalUrl('http://[::ffff:127.0.0.1]/'), false);
  assert.equal(isSafeExternalUrl('http://[fe80::1]/'), false);
  assert.equal(isSafeExternalUrl('http://[fc00::1]/'), false);
  assert.equal(isSafeExternalUrl('http://169.254.169.254/latest/meta-data/'), false);
  assert.equal(isSafeExternalUrl('http://10.0.0.5/internal'), false);
  assert.equal(isSafeExternalUrl('http://192.168.1.1/router'), false);
  assert.equal(isSafeExternalUrl('http://172.16.0.2/service'), false);
  assert.equal(isSafeExternalUrl('http://2130706433/'), false);
  assert.equal(isSafeExternalUrl('https://user:pass@example.com/img.png'), false);
  assert.equal(isSafeExternalUrl('javascript:alert(1)'), false);
  assert.equal(isSafeExternalUrl('file:///etc/passwd'), false);
});

test('Security: isSafeHttpUrl strictly allows http/https and blocks script/data protocols', () => {
  assert.equal(isSafeHttpUrl('https://www.kalodata.com/product/detail?id=123'), true);
  assert.equal(isSafeHttpUrl('http://example.com'), true);
  assert.equal(isSafeHttpUrl('javascript:alert(1)'), false);
  assert.equal(isSafeHttpUrl('data:text/html,<script>alert(1)</script>'), false);
  assert.equal(isSafeHttpUrl('vbscript:msgbox(1)'), false);
  assert.equal(isSafeHttpUrl(''), false);
  assert.equal(isSafeHttpUrl(null), false);
});

test('Security: CSV formula neutralization, JSON secret stripping, and filename sanitization', () => {
  assert.equal(escapeCsvCell('=CMD("calc")'), `"'=CMD(""calc"")"`);
  assert.equal(escapeCsvCell('+1+1'), "'+1+1");
  assert.equal(escapeCsvCell('@SUM(A1:A2)'), "'@SUM(A1:A2)");
  assert.equal(escapeCsvCell('-cmd'), "'-cmd");
  assert.equal(escapeCsvCell('-12.5%'), '-12.5%');
  assert.equal(escapeCsvCell(null), 'Unavailable');

  assert.equal(sanitizeDownloadFilename('../../etc/passwd?a=1'), 'etc-passwd-a=1');
  assert.equal(sanitizeDownloadFilename('siampick report 2026.csv'), 'siampick-report-2026.csv');

  const productWithFakeSecret = makeProduct() as ResearchProduct & Record<string, unknown>;
  productWithFakeSecret.apiKey = 'SHOULD_NEVER_EXPORT';
  const json = buildProductsExportJson([productWithFakeSecret], { salesWeightPct: 50 });
  assert.equal(json.includes('SHOULD_NEVER_EXPORT'), false);
  assert.equal(json.includes('"apiKey"'), false);
});

test('Data Accuracy: Missing Kalodata fields stay strictly Unavailable and never fabricated as 0', () => {
  assert.equal(formatThb(null, 'Unavailable'), 'Unavailable');
  assert.equal(formatThb(0, 'Unavailable'), 'Unavailable');
  assert.equal(formatThb(Number.NaN, 'Unavailable'), 'Unavailable');
  assert.equal(formatThb(499), '฿499');

  const sparseProduct = makeProduct({
    id: 'kd_900001',
    priceThb: null,
    priceStatus: 'unavailable',
    commissionRate: null,
    commissionVerified: false,
    commissionStatus: 'unavailable',
    estimatedCommissionPerSaleThb: null,
    salesEvidenceStatus: 'unavailable',
    competitionStatus: 'unavailable',
    reviewCount: null,
    customerRating: null,
    reviewCountStatus: 'unavailable',
    customerRatingStatus: 'unavailable',
    kalodataMetrics: {
      productId: '900001',
      dateRange: 'last7Day',
      researchMode: 'fast',
      salesVolume: null,
      revenueThb: null,
      revenueGrowthRate: null,
      unitPriceThb: null,
      commissionRatePct: null,
      liveRevenueThb: null,
      videoRevenueThb: null,
      showcaseRevenueThb: null,
      launchDate: null,
      creatorNumber: null,
      sellerId: null,
      sellerName: null,
      skuCount: null,
      priCategory: null,
      secCategory: null,
      terCategory: null,
      categoryIdsRequested: [],
    },
  });

  const evaluation = evaluateProductOpportunity(sparseProduct, { salesWeightPct: 50 });
  assert.ok(evaluation.unavailableCount >= 4);

  const decision = deriveProductDecisionSummary(sparseProduct, evaluation, null);
  assert.equal(decision.verdict, 'need-more-data');

  const csv = buildProductsExportCsv([sparseProduct], { salesWeightPct: 50 });
  assert.ok(csv.includes('Unavailable'));

  const jsonParsed = JSON.parse(
    buildProductsExportJson([sparseProduct], { salesWeightPct: 50 })
  ) as { items: Array<{ productData: Record<string, unknown> }> };
  assert.equal(jsonParsed.items[0].productData.priceThb, 'Unavailable');
  assert.equal(jsonParsed.items[0].productData.salesVolume, 'Unavailable');
  assert.equal(jsonParsed.items[0].productData.revenueThb, 'Unavailable');
  assert.equal(jsonParsed.items[0].productData.commissionRatePct, 'Unavailable');
  assert.equal(jsonParsed.items[0].productData.creatorCount, 'Unavailable');

  const reportText = buildCompleteTextReport({
    product: sparseProduct,
    evaluation,
    decision,
    aiAnalysis: null,
    language: 'en',
  });
  assert.ok(reportText.includes('1. Product Overview'));
  assert.ok(reportText.includes('10. Data Sources & Last Updated'));
  assert.ok(reportText.includes('Sales Volume: Unavailable'));
});

test('LocalStorage Reliability: Refresh persistence, v1->v2 migration, corrupted JSON recovery, and QuotaExceeded safety', () => {
  const mem = installMockStorage();

  // 1. Corrupted JSON never crashes loaders
  mem.setItem(SAVED_PRODUCTS_STORAGE_KEY, '{corrupted_json!!!');
  mem.setItem(RESEARCH_HISTORY_STORAGE_KEY, '{broken_history');
  mem.setItem(AI_ANALYSIS_CACHE_STORAGE_KEY, 'not-json');
  mem.setItem(ENRICHMENT_CACHE_STORAGE_KEY, '[[[bad');

  assert.deepEqual(loadSavedProducts(), []);
  assert.deepEqual(loadResearchHistory(), []);
  assert.deepEqual(loadAiAnalysisCacheMap(), {});
  assert.deepEqual(loadEnrichmentCache().products, {});

  // 2. Legacy v1 -> v2 migration rescues records even if v2 was corrupted and priceThb was omitted
  const legacyProduct = makeProduct({ id: 'legacy_p1' });
  const legacyRecord: SavedProductRecord = createSavedRecord(legacyProduct);
  delete (legacyRecord.product as unknown as Record<string, unknown>).priceThb;
  mem.setItem(SAVED_PRODUCTS_LEGACY_KEY, JSON.stringify([legacyRecord]));

  const migrated = loadSavedProducts();
  assert.equal(migrated.length, 1);
  assert.equal(migrated[0].id, 'legacy_p1');
  assert.equal(migrated[0].product.priceThb, null);
  // After successful v2 persistence, legacy key is cleaned up to save quota
  assert.equal(mem.getItem(SAVED_PRODUCTS_LEGACY_KEY), null);
  assert.notEqual(mem.getItem(SAVED_PRODUCTS_STORAGE_KEY), null);

  // 3. Research History survives refresh & normalizes missing product arrays safely
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
    products: [makeProduct()],
    requestedQuantity: 10,
    verifiedProductCount: 1,
    filteredOutCount: 0,
    researchedAt: '2026-06-01T08:00:00.000Z',
    config,
    groundingSources: [],
    searchQueries: [],
    researchSourceMode: 'kalodata-openapi',
    costSummary: {
      researchMode: 'fast',
      estimatedCredits: 0.1,
      estimatedUsd: 0.015,
      plannedApiCalls: 1,
      actualApiCalls: 1,
      rankApiCalls: 1,
      productDetailApiCalls: 0,
      shopDetailApiCalls: 0,
      commentInsightApiCalls: 0,
      deepDiveCount: 0,
      includeReviewInsights: false,
      geminiAnalysisApplied: false,
      actualCredits: 0.1,
      actualUsd: 0.015,
      balanceBefore: 10,
      balanceAfter: 9.9,
      spendingLimitCredits: 1,
      bothCategoryMode: 'combined',
      categoryIds: ['601450', '601152'],
    },
  };
  const historyRec = createResearchHistoryRecord(session, config);
  const histWrite = persistResearchHistory([historyRec]);
  assert.equal(histWrite.ok, true);

  const reloadedHistory = loadResearchHistory();
  assert.equal(reloadedHistory.length, 1);
  assert.equal(reloadedHistory[0].id, historyRec.id);
  assert.equal(reloadedHistory[0].products[0].id, 'kd_1729384756123');

  // 4. QuotaExceededError NEVER deletes existing Research History or Saved Products
  mem.failNextSetItemWithQuota = true;
  const failedHistWrite = persistResearchHistory([historyRec, { ...historyRec, id: 'res_extra' }]);
  assert.equal(failedHistWrite.ok, false);
  assert.equal(failedHistWrite.quotaExceeded, true);
  assert.equal(loadResearchHistory().length, 1);

  mem.failNextSetItemWithQuota = true;
  const failedSavedWrite = persistSavedProductsWithStatus([
    ...migrated,
    createSavedRecord(makeProduct({ id: 'extra_2' })),
  ]);
  assert.equal(failedSavedWrite.ok, false);
  assert.equal(failedSavedWrite.quotaExceeded, true);
  assert.equal(loadSavedProducts().length, 1);
});

test('Performance & Storage Bounds: AI/Enrichment caches cap size, prune safely on quota, and memoize cleanly', () => {
  const mem = installMockStorage();

  // Populate AI analysis cache past MAX_AI_ANALYSIS_CACHE_ENTRIES and verify oldest are evicted
  for (let i = 0; i < MAX_AI_ANALYSIS_CACHE_ENTRIES + 8; i += 1) {
    const ts = new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString();
    const res = saveCachedAiAnalysis(makeAiAnalysis(`prod_${i}`, ts));
    assert.equal(res.ok, true);
  }
  const cacheMap = loadAiAnalysisCacheMap();
  assert.equal(Object.keys(cacheMap).length, MAX_AI_ANALYSIS_CACHE_ENTRIES);
  assert.equal('prod_0' in cacheMap, false);
  assert.equal(`prod_${MAX_AI_ANALYSIS_CACHE_ENTRIES + 7}` in cacheMap, true);

  // Memoized read returns accurate data and isolates caller mutation
  const read1 = loadAiAnalysisCacheMap();
  delete read1[`prod_${MAX_AI_ANALYSIS_CACHE_ENTRIES + 7}`];
  const read2 = loadAiAnalysisCacheMap();
  assert.equal(`prod_${MAX_AI_ANALYSIS_CACHE_ENTRIES + 7}` in read2, true);

  // Lookup via product works cleanly
  const lookup = getCachedAiAnalysisForProduct(
    makeProduct({ id: `prod_${MAX_AI_ANALYSIS_CACHE_ENTRIES + 7}`, kalodataMetrics: undefined })
  );
  assert.ok(lookup.entry !== null);

  // Quota-triggered automatic cache pruning succeeds on retry without touching History/Saved
  mem.failNextSetItemWithQuota = true;
  const prunedWrite = saveCachedAiAnalysis(
    makeAiAnalysis('prod_newest_after_quota', '2026-12-31T23:59:59.000Z')
  );
  assert.equal(prunedWrite.ok, true);
  assert.ok(Object.keys(loadAiAnalysisCacheMap()).length <= Math.ceil(MAX_AI_ANALYSIS_CACHE_ENTRIES / 2));

  // Enrichment cache stores & retrieves reliably
  const detailRec: KalodataProductDetailEnrichmentRecord = {
    productId: '1729384756123',
    productShopId: 'shop_998877',
    minPriceThb: 389,
    maxPriceThb: 429,
    unitPriceThb: 399,
    revenueThb: 500000,
    salesVolume: 1300,
    videoRevenueThb: 320000,
    liveRevenueThb: 120000,
    shoppingMallRevenueThb: 60000,
    commissionRatePct: 15,
    creatorNumber: 42,
    videoNumber: 55,
    liveNumber: 12,
    deliveryType: 'Local TH',
    productReviewCount: 412,
    launchDate: '2025-11-01',
    trendPointsCount: 7,
    trendPeakThb: 92000,
    trendAvgThb: 71428,
    dateRange: 'last30Day',
    updatedAt: '2026-06-01T09:00:00.000Z',
  };
  const enrichWrite = saveEnrichmentToCache({ productDetail: detailRec });
  assert.equal(enrichWrite.ok, true);
  assert.equal(loadEnrichmentCache().products['1729384756123']?.revenueThb, 500000);
});

test('API Reliability: Free balance endpoint retries once on 503, never retries auth failure; Paid detail endpoint strictly 1 attempt (0 live API calls)', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.KALODATA_API_KEY;
  process.env.KALODATA_API_KEY = 'test-mock-key-only';

  try {
    // 1. Free credit balance retries once after transient 503 and succeeds
    let balanceAttempts = 0;
    globalThis.fetch = (async () => {
      balanceAttempts += 1;
      if (balanceAttempts === 1) {
        return new Response('Service Unavailable', { status: 503 });
      }
      return new Response(JSON.stringify({ success: true, code: '0', data: { balance: 42.5 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    const okBalance = await fetchKalodataCreditBalance();
    assert.equal(balanceAttempts, 2);
    assert.equal(okBalance.ok, true);
    assert.equal(okBalance.balance, 42.5);

    // 2. Free credit balance does NOT retry explicit auth error
    let authAttempts = 0;
    globalThis.fetch = (async () => {
      authAttempts += 1;
      return new Response(
        JSON.stringify({ success: false, code: '401', message: 'Unauthorized key' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }) as typeof fetch;

    const failedAuth = await fetchKalodataCreditBalance();
    assert.equal(authAttempts, 1);
    assert.equal(failedAuth.ok, false);

    // 3. Paid Product Detail endpoint MUST remain strictly single-attempt (never double-charge)
    let paidAttempts = 0;
    globalThis.fetch = (async () => {
      paidAttempts += 1;
      return new Response('Upstream 503', { status: 503 });
    }) as typeof fetch;

    const paidResult = await fetchKalodataProductDetail({
      region: 'TH',
      language: 'en-US',
      currency: 'THB',
      date_range: 'last30Day',
      product_id: '1729384756123',
    });
    assert.equal(paidAttempts, 1);
    assert.equal(paidResult.ok, false);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) {
      delete process.env.KALODATA_API_KEY;
    } else {
      process.env.KALODATA_API_KEY = originalKey;
    }
  }
});
