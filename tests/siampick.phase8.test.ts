import test from 'node:test';
import assert from 'node:assert/strict';

import type {
  KalodataProductMetrics,
  ProductCategory,
  ResearchConfig,
  ResearchProduct,
  ResearchSessionResponse,
  ScoringInputs,
} from '../src/types/product.ts';
import {
  ALL_PRODUCT_CATEGORIES,
  buildResolvedCategoryIdMap,
  CATEGORY_BY_ID,
  createEmptySyncedCategoryCache,
  formatCategoryCatalogCountSummary,
  getCategoryCatalogCounts,
  getCategoryDefinition,
  getEffectiveCategoryCatalog,
  getSelectableCategories,
  loadSyncedKalodataCategories,
  matchKalodataCategoryNameToSlug,
  mergeSyncedL1Categories,
  mergeSyncedL2Subcategories,
  saveSyncedKalodataCategories,
  UNIVERSAL_CATEGORIES,
  verifyProductCategoryAlignment,
} from '../src/utils/categoryRegistry.ts';
import {
  fetchKalodataCategoryRank,
  getKalodataCategoryIdsForFilter,
  getKalodataCategoryIdsForSelection,
} from '../server/kalodataService.ts';
import { buildKalodataExecutionPlan } from '../src/utils/kalodataPricing.ts';
import {
  computeStrategyWeights,
  evaluateProductOpportunity,
  SCORING_FACTOR_ORDER,
} from '../src/utils/scoring.ts';
import { buildKalodataFallbackAnalysis } from '../src/utils/aiAnalysisFallback.ts';
import { buildGeminiPromptPayload } from '../server/aiProductAnalysis.ts';
import {
  createResearchHistoryRecord,
  loadResearchHistory,
  persistResearchHistory,
  RESEARCH_HISTORY_STORAGE_KEY,
} from '../src/utils/researchHistoryStorage.ts';
import {
  loadSavedProducts,
  SAVED_PRODUCTS_STORAGE_KEY,
} from '../src/utils/savedProductsStorage.ts';

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
    this.store.set(key, String(value));
  }
}

function installMockLocalStorage(): MemoryStorage {
  const storage = new MemoryStorage();
  const win = { localStorage: storage };
  Object.defineProperty(globalThis, 'window', {
    value: win,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
    writable: true,
  });
  return storage;
}

function makeKalodataMetrics(
  overrides: Partial<KalodataProductMetrics> = {}
): KalodataProductMetrics {
  return {
    productId: overrides.productId ?? '172940000001',
    dateRange: overrides.dateRange ?? 'last30Day',
    researchMode: overrides.researchMode ?? 'balanced',
    detailEnriched: overrides.detailEnriched ?? true,
    shopEnriched: overrides.shopEnriched ?? false,
    reviewInsightEnriched: overrides.reviewInsightEnriched ?? false,
    unitPriceThb: overrides.unitPriceThb !== undefined ? overrides.unitPriceThb : 590,
    salesVolume: overrides.salesVolume !== undefined ? overrides.salesVolume : 1800,
    revenueThb: overrides.revenueThb !== undefined ? overrides.revenueThb : 1_062_000,
    revenueGrowthRate:
      overrides.revenueGrowthRate !== undefined ? overrides.revenueGrowthRate : 42.5,
    commissionRatePct:
      overrides.commissionRatePct !== undefined ? overrides.commissionRatePct : 12,
    liveRevenueThb: overrides.liveRevenueThb !== undefined ? overrides.liveRevenueThb : 220_000,
    videoRevenueThb: overrides.videoRevenueThb !== undefined ? overrides.videoRevenueThb : 720_000,
    showcaseRevenueThb:
      overrides.showcaseRevenueThb !== undefined ? overrides.showcaseRevenueThb : 122_000,
    shoppingMallRevenueThb:
      overrides.shoppingMallRevenueThb !== undefined ? overrides.shoppingMallRevenueThb : 122_000,
    creatorNumber: overrides.creatorNumber !== undefined ? overrides.creatorNumber : 38,
    launchDate: overrides.launchDate !== undefined ? overrides.launchDate : null,
    sellerId: overrides.sellerId !== undefined ? overrides.sellerId : 'shop-001',
    sellerName: overrides.sellerName !== undefined ? overrides.sellerName : 'SoundTH Official',
    skuCount: overrides.skuCount !== undefined ? overrides.skuCount : 4,
    priCategory:
      overrides.priCategory !== undefined
        ? overrides.priCategory
        : { category_id: '601739', category_name: 'Phones & Electronics' },
    secCategory:
      overrides.secCategory !== undefined
        ? overrides.secCategory
        : { category_id: '800101', category_name: 'Audio & Video' },
    terCategory: overrides.terCategory !== undefined ? overrides.terCategory : null,
    categoryIdsRequested: overrides.categoryIdsRequested ?? ['601739'],
  };
}

function makeScoringInputs(): ScoringInputs {
  const item = {
    rawStrength: 75,
    verification: 'verified' as const,
    evidenceEn: 'Verified Kalodata signal.',
    evidenceMy: 'အတည်ပြုပြီး Kalodata ဒေတာ။',
  };
  return {
    demandSales: item,
    commissionEarning: item,
    aiCreative: item,
    reviewsQuality: item,
    priceAppeal: item,
    competitionOpportunity: item,
    sellerReliability: item,
  };
}

function makeSampleProduct(overrides: Partial<ResearchProduct> = {}): ResearchProduct {
  return {
    id: overrides.id ?? 'kd-test-001',
    name: overrides.name ?? 'Wireless Noise Cancelling Bluetooth Earbuds ANC USB-C',
    nameMy: overrides.nameMy ?? 'Wireless Noise Cancelling Bluetooth Earbuds ANC USB-C',
    category: overrides.category ?? 'electronics',
    subCategory: overrides.subCategory ?? 'Audio & Earbuds',
    subCategoryMy: overrides.subCategoryMy ?? 'Audio & Earbuds',
    brand: overrides.brand ?? 'SoundTH',
    shopName: overrides.shopName ?? 'SoundTH Official',
    dispatchHub: overrides.dispatchHub ?? 'Thailand',
    priceThb: overrides.priceThb !== undefined ? overrides.priceThb : 590,
    priceStatus: overrides.priceStatus ?? 'verified',
    commissionRate: overrides.commissionRate !== undefined ? overrides.commissionRate : 12,
    commissionVerified: overrides.commissionVerified ?? true,
    commissionStatus: overrides.commissionStatus ?? 'verified',
    estimatedCommissionPerSaleThb:
      overrides.estimatedCommissionPerSaleThb !== undefined
        ? overrides.estimatedCommissionPerSaleThb
        : 71,
    commissionPerSaleStatus: overrides.commissionPerSaleStatus ?? 'verified',
    commissionNoteEn: overrides.commissionNoteEn ?? 'Verified 12% affiliate commission.',
    commissionNoteMy: overrides.commissionNoteMy ?? 'အတည်ပြုပြီး 12% ကော်မရှင်။',
    customerRating: overrides.customerRating !== undefined ? overrides.customerRating : 4.8,
    customerRatingStatus: overrides.customerRatingStatus ?? 'verified',
    reviewCount: overrides.reviewCount !== undefined ? overrides.reviewCount : 420,
    reviewCountStatus: overrides.reviewCountStatus ?? 'verified',
    sellerStatus: overrides.sellerStatus ?? 'verified',
    salesEvidenceStatus: overrides.salesEvidenceStatus ?? 'verified',
    feedbackStatus: overrides.feedbackStatus ?? 'unavailable',
    demandStatus: overrides.demandStatus ?? 'verified',
    competitionStatus: overrides.competitionStatus ?? 'verified',
    sellerReliabilityStatus: overrides.sellerReliabilityStatus ?? 'verified',
    productQualityStatus: overrides.productQualityStatus ?? 'verified',
    aiVideoStatus: overrides.aiVideoStatus ?? 'estimated',
    imageUrl: overrides.imageUrl ?? null,
    imageVerified: overrides.imageVerified ?? false,
    imageSourceNoteEn: overrides.imageSourceNoteEn ?? 'Test product',
    imageSourceNoteMy: overrides.imageSourceNoteMy ?? 'Test product',
    demandLevel: overrides.demandLevel ?? 'High',
    competitionLevel: overrides.competitionLevel ?? 'Moderate',
    aiVideoSuitability: overrides.aiVideoSuitability ?? 'High',
    confidenceLevel: overrides.confidenceLevel ?? 'High',
    opportunityScore: overrides.opportunityScore ?? 78,
    sellerReliabilityLevel: overrides.sellerReliabilityLevel ?? 'Reliable',
    scoringInputs: overrides.scoringInputs ?? makeScoringInputs(),
    whyChooseEn: overrides.whyChooseEn ?? 'Strong verified sales and margin.',
    whyChooseMy: overrides.whyChooseMy ?? 'ရောင်းအားကောင်းသည်။',
    demandEvidenceEn: overrides.demandEvidenceEn ?? ['1,800 verified units sold in 30d.'],
    demandEvidenceMy: overrides.demandEvidenceMy ?? ['၃၀ ရက်အတွင်း ၁,၈၀၀ ခု ရောင်းရသည်။'],
    salesPotentialEn: overrides.salesPotentialEn ?? 'High repeat market demand.',
    salesPotentialMy: overrides.salesPotentialMy ?? 'ဈေးကွက်ဝယ်လိုအားမြင့်သည်။',
    reviewStrengthsEn: overrides.reviewStrengthsEn ?? [],
    reviewStrengthsMy: overrides.reviewStrengthsMy ?? [],
    customerComplaintsEn: overrides.customerComplaintsEn ?? [],
    customerComplaintsMy: overrides.customerComplaintsMy ?? [],
    productQualityEvidenceEn: overrides.productQualityEvidenceEn ?? '4.8 rating verified.',
    productQualityEvidenceMy: overrides.productQualityEvidenceMy ?? '4.8 rating ရှိသည်။',
    competitionDetailEn: overrides.competitionDetailEn ?? '38 active creators.',
    competitionDetailMy: overrides.competitionDetailMy ?? 'Creator ၃၈ ဦး။',
    sellerReliabilityEn: overrides.sellerReliabilityEn ?? 'Established official shop.',
    sellerReliabilityMy: overrides.sellerReliabilityMy ?? 'တရားဝင်ဆိုင်ဖြစ်သည်။',
    generalRisksEn: overrides.generalRisksEn ?? ['Check warranty and Thai plug compatibility.'],
    generalRisksMy: overrides.generalRisksMy ?? ['Warranty နှင့် မီးပလပ်ကို စစ်ပါ။'],
    aiVideoDetailEn: overrides.aiVideoDetailEn ?? 'Clear audio feature demo.',
    aiVideoDetailMy: overrides.aiVideoDetailMy ?? 'အသံစမ်းသပ်ပြသရန် သင့်တော်သည်။',
    videoIdeas: overrides.videoIdeas ?? [
      {
        titleEn: 'Hook Demo 1',
        titleMy: 'Demo 1',
        formatEn: 'Feature Test',
        formatMy: 'Feature Test',
        outlineEn: 'Quick hands-on ANC sound test.',
        outlineMy: 'ANC အသံစမ်းသပ်ပြသခြင်း။',
      },
      {
        titleEn: 'Hook Demo 2',
        titleMy: 'Demo 2',
        formatEn: 'Comparison',
        formatMy: 'နှိုင်းယှဉ်ပြသခြင်း',
        outlineEn: 'Compare battery life and mic clarity.',
        outlineMy: 'ဘက်ထရီနှင့် မိုက်အသံကို နှိုင်းယှဉ်ပြသခြင်း။',
      },
      {
        titleEn: 'Hook Demo 3',
        titleMy: 'Demo 3',
        formatEn: 'Daily Use',
        formatMy: 'နေ့စဉ်အသုံးပြုမှု',
        outlineEn: 'Commute usage scenario in Bangkok.',
        outlineMy: 'နေ့စဉ်သွားလာရာတွင် အသုံးပြုပြသခြင်း။',
      },
    ],
    sources: overrides.sources ?? [
      {
        labelEn: 'Kalodata Product Page',
        labelMy: 'Kalodata စာမျက်နှာ',
        url: 'https://www.kalodata.com/product/detail?id=172940000001',
        sourceType: 'Marketplace',
        verified: true,
      },
    ],
    confidenceDetailEn: overrides.confidenceDetailEn ?? 'High Kalodata coverage.',
    confidenceDetailMy: overrides.confidenceDetailMy ?? 'Kalodata ဒေတာစုံလင်သည်။',
    missingDataEn: overrides.missingDataEn ?? [],
    missingDataMy: overrides.missingDataMy ?? [],
    kalodataMetrics: overrides.kalodataMetrics ?? makeKalodataMetrics(),
    researchedAt: overrides.researchedAt ?? '2026-11-20T10:00:00.000Z',
  };
}

// ============================================================================
// 1. Universal 14-Category Registry & Zero-Guessed-ID Honesty Tests
// ============================================================================
test('Phase 8 Registry: defines all 14 universal categories with zero guessed IDs and zero-sum scoring deltas', () => {
  assert.equal(UNIVERSAL_CATEGORIES.length, 14);
  assert.equal(ALL_PRODUCT_CATEGORIES.length, 14);

  const expectedSlugs: ProductCategory[] = [
    'womens-fashion',
    'cosmetics-beauty',
    'electronics',
    'home-living',
    'kitchen',
    'health-personal-care',
    'food-beverages',
    'baby-kids',
    'sports-outdoor',
    'automotive',
    'pet-supplies',
    'toys-hobbies',
    'books-stationery',
    'jewelry-accessories',
  ];

  for (const slug of expectedSlugs) {
    const def = CATEGORY_BY_ID[slug];
    assert.ok(def, `Missing category definition for ${slug}`);
    assert.ok(def.labelEn.length > 0);
    assert.ok(def.labelMy.length > 0);
    assert.ok(def.shortLabelEn.length > 0);
    assert.ok(def.shortLabelMy.length > 0);

    // Every category's weightDeltas MUST sum strictly to 0 so total score remains 100
    const deltaSum = SCORING_FACTOR_ORDER.reduce(
      (sum, key) => sum + def.scoringProfile.weightDeltas[key],
      0
    );
    assert.equal(deltaSum, 0, `weightDeltas for ${slug} must sum to 0, got ${deltaSum}`);
  }

  // Strictly verified static IDs ONLY — all other 11 MUST have null defaultKalodataId
  assert.equal(CATEGORY_BY_ID['womens-fashion'].defaultKalodataId, '601152');
  assert.equal(CATEGORY_BY_ID['cosmetics-beauty'].defaultKalodataId, '601450');
  assert.equal(CATEGORY_BY_ID['home-living'].defaultKalodataId, '600001');

  const unsyncedByDefault = UNIVERSAL_CATEGORIES.filter(
    (c) =>
      c.id !== 'womens-fashion' &&
      c.id !== 'cosmetics-beauty' &&
      c.id !== 'home-living'
  );
  assert.equal(unsyncedByDefault.length, 11);
  for (const cat of unsyncedByDefault) {
    assert.equal(cat.defaultKalodataId, null, `${cat.id} must NOT have a guessed static ID`);
    assert.equal(cat.defaultSupportStatus, 'requires-sync');
  }
});

// ============================================================================
// 2. Honest Live Kalodata Category & Subcategory Sync (0 Paid API Calls)
// ============================================================================
test('Phase 8 Category Sync: unlocks matched L1 categories, marks unmatched honestly as unsupported, and caches L2 subcategories', () => {
  installMockLocalStorage();

  const initialCache = createEmptySyncedCategoryCache();
  const initialSelectable = getSelectableCategories(initialCache);
  assert.deepEqual(initialSelectable, ['womens-fashion', 'cosmetics-beauty', 'home-living']);

  // Simulate official Kalodata TH L1 category-rank response (partial match)
  const afterL1 = mergeSyncedL1Categories(
    initialCache,
    [
      { category_id: '601152', category_name: 'Womenswear & Underwear' },
      { category_id: '601450', category_name: 'Beauty & Personal Care' },
      { category_id: '600001', category_name: 'Home Supplies' },
      { category_id: '601739', category_name: 'Phones & Electronics' },
      { category_id: '600024', category_name: 'Kitchenware' },
      { category_id: '602118', category_name: 'Pet Supplies' },
    ],
    '2026-11-20T12:00:00.000Z'
  );

  const catalog = getEffectiveCategoryCatalog(afterL1);
  const electronicsEntry = catalog.find((e) => e.id === 'electronics');
  const kitchenEntry = catalog.find((e) => e.id === 'kitchen');
  const petEntry = catalog.find((e) => e.id === 'pet-supplies');
  const booksEntry = catalog.find((e) => e.id === 'books-stationery');

  assert.equal(electronicsEntry?.selectable, true);
  assert.equal(electronicsEntry?.kalodataId, '601739');
  assert.equal(electronicsEntry?.apiSupportStatus, 'synced');

  assert.equal(kitchenEntry?.selectable, true);
  assert.equal(kitchenEntry?.kalodataId, '600024');

  assert.equal(petEntry?.selectable, true);
  assert.equal(petEntry?.kalodataId, '602118');

  // Books was NOT returned by live L1 sync -> MUST be honestly marked 'unsupported' and disabled
  assert.equal(booksEntry?.selectable, false);
  assert.equal(booksEntry?.kalodataId, null);
  assert.equal(booksEntry?.apiSupportStatus, 'unsupported');

  // Attach L2 subcategories for Electronics and persist/reload from localStorage
  const afterL2 = mergeSyncedL2Subcategories(
    afterL1,
    [
      { category_id: '800101', category_name: 'Headphones & Earphones' },
      { category_id: '800102', category_name: 'Power Banks & Chargers' },
    ],
    { parentCategory: 'electronics', parentCategoryId: '601739' },
    '2026-11-20T12:05:00.000Z'
  );

  saveSyncedKalodataCategories(afterL2);
  const reloaded = loadSyncedKalodataCategories();
  assert.equal(reloaded.l1IdBySlug.electronics, '601739');
  assert.equal(reloaded.subcategories.length, 2);
  assert.equal(reloaded.subcategories[0].parentCategory, 'electronics');
  assert.equal(buildResolvedCategoryIdMap(reloaded).electronics, '601739');
});

// ============================================================================
// 3. Kalodata Execution Planner — Multi-Category, Subcategory & Unsupported Guard
// ============================================================================
test('Phase 8 Planner: handles multi-category Combined/Split, L2 subcategories, and blocks unsynced categories cleanly', () => {
  // Unsynced category without resolvedCategoryIdMap -> 0 streams (never guesses IDs)
  const blockedPlan = buildKalodataExecutionPlan(['electronics'], 10, 'combined', {
    researchMode: 'fast',
  });
  assert.equal(blockedPlan.streams.length, 0);
  assert.equal(blockedPlan.categoryIds.length, 0);
  assert.equal(blockedPlan.estimatedCredits, 0);

  // Synced Electronics + verified Home & Living + Fashion in Combined mode
  const resolvedMap: Partial<Record<ProductCategory, string>> = {
    'womens-fashion': '601152',
    'home-living': '600001',
    electronics: '601739',
  };

  const combinedPlan = buildKalodataExecutionPlan(
    ['womens-fashion', 'home-living', 'electronics'],
    30,
    'combined',
    { researchMode: 'fast', resolvedCategoryIdMap: resolvedMap }
  );
  assert.equal(combinedPlan.streams.length, 1);
  assert.deepEqual(combinedPlan.categoryIds, ['601152', '600001', '601739']);
  assert.equal(combinedPlan.rankApiCalls, 1);
  assert.equal(combinedPlan.estimatedCredits, 0.1);

  // Multi-category Split mode across 3 categories (quantity 30 -> 10 + 10 + 10)
  const splitPlan = buildKalodataExecutionPlan(
    ['womens-fashion', 'home-living', 'electronics'],
    30,
    'split',
    { researchMode: 'fast', resolvedCategoryIdMap: resolvedMap }
  );
  assert.equal(splitPlan.streams.length, 3);
  assert.equal(
    splitPlan.streams.reduce((sum, s) => sum + s.targetCount, 0),
    30
  );
  assert.equal(splitPlan.rankApiCalls, 3);

  // L2 Subcategory override replaces L1 category_ids cleanly
  const subPlan = buildKalodataExecutionPlan(['electronics'], 10, 'combined', {
    researchMode: 'fast',
    resolvedCategoryIdMap: resolvedMap,
    selectedSubcategoryIds: ['800101', '800102'],
  });
  assert.equal(subPlan.streams.length, 1);
  assert.deepEqual(subPlan.categoryIds, ['800101', '800102']);
});

// ============================================================================
// 4. Category-Aware 7-Factor 100-Point Scoring Engine
// ============================================================================
test('Phase 8 Scoring: all 14 categories sum strictly to 100 across slider values, preserving Fashion/Cosmetics baseline and applying Electronics rules', () => {
  const sliderValues = [10, 30, 50, 70, 90];

  for (const cat of ALL_PRODUCT_CATEGORIES) {
    for (const pct of sliderValues) {
      const weights = computeStrategyWeights(pct, cat);
      const sum = SCORING_FACTOR_ORDER.reduce((acc, k) => acc + weights[k], 0);
      assert.equal(
        sum,
        100,
        `Weights for category=${cat} slider=${pct} must total 100, got ${sum}`
      );
      for (const k of SCORING_FACTOR_ORDER) {
        assert.ok(weights[k] > 0, `Weight for ${cat}.${k} at ${pct}% must be positive`);
      }
    }
  }

  // Exact Phase 2–7 baseline preserved for Fashion & Cosmetics at 50%
  const fashionWeights = computeStrategyWeights(50, 'womens-fashion');
  const beautyWeights = computeStrategyWeights(50, 'cosmetics-beauty');
  assert.deepEqual(fashionWeights, {
    salesPerformance: 20,
    revenuePerformance: 20,
    revenueGrowth: 15,
    commissionPotential: 15,
    competition: 10,
    marketDemand: 10,
    aiContentSuitability: 10,
  });
  assert.deepEqual(beautyWeights, fashionWeights);

  // Electronics applies distinct category profile (higher sales/demand/competition, lower AI aesthetic weight)
  const electronicsWeights = computeStrategyWeights(50, 'electronics');
  assert.notDeepEqual(electronicsWeights, fashionWeights);
  assert.ok(electronicsWeights.salesPerformance > fashionWeights.salesPerformance);
  assert.ok(electronicsWeights.aiContentSuitability < fashionWeights.aiContentSuitability);

  // Missing-data fairness (Unavailable metrics stay unavailable & redistribute proportionally without fabrication)
  const missingDataElectronics = makeSampleProduct({
    category: 'electronics',
    kalodataMetrics: makeKalodataMetrics({
      productId: '172940000002',
      salesVolume: 1200,
      revenueThb: 708_000,
      revenueGrowthRate: null, // unavailable
      creatorNumber: null, // unavailable
      unitPriceThb: 590,
      commissionRatePct: 12,
      priCategory: { category_id: '601739', category_name: 'Phones & Electronics' },
      dateRange: 'last7Day',
      researchMode: 'fast',
    }),
  });

  const evalRes = evaluateProductOpportunity(missingDataElectronics, { salesWeightPct: 50 });
  assert.ok(evalRes.totalScore >= 0 && evalRes.totalScore <= 100);
  const compFactor = evalRes.criteria.find((c) => c.key === 'competition');
  const growthFactor = evalRes.criteria.find((c) => c.key === 'revenueGrowth');
  assert.equal(compFactor?.verification, 'unavailable');
  assert.equal(compFactor?.wasRedistributed, true);
  assert.equal(growthFactor?.verification, 'unavailable');
  assert.equal(growthFactor?.wasRedistributed, true);
  assert.ok(evalRes.redistributedWeightPct > 0);
});

// ============================================================================
// 5. Universal Gemini Prompt Routing & Category Mismatch Verification Guard
// ============================================================================
test('Phase 8 AI Analysis: routes category-specific prompts across all 14 categories and flags category mismatches as Unverified', () => {
  // Verify distinct category directives & affiliate strategies across categories
  const electronicsProd = makeSampleProduct({
    category: 'electronics',
    name: 'ANC Wireless Bluetooth Earbuds 40h Battery',
  });
  const electronicsEval = evaluateProductOpportunity(electronicsProd, { salesWeightPct: 50 });
  const electronicsPrompt = buildGeminiPromptPayload(electronicsProd, electronicsEval);
  assert.match(electronicsPrompt, /Electronics & Gadgets/i);
  assert.match(electronicsPrompt, /Tech Feature/i);
  assert.match(electronicsPrompt, /CATEGORY VERIFICATION GUARD/i);
  assert.match(electronicsPrompt, /Affiliate Strategy/i);

  const kitchenProd = makeSampleProduct({
    category: 'kitchen',
    name: 'Non-Stick Stainless Steel Air Fryer Liner Set',
    kalodataMetrics: makeKalodataMetrics({
      productId: '172940000003',
      salesVolume: 950,
      revenueThb: 380_000,
      revenueGrowthRate: 28,
      creatorNumber: 22,
      unitPriceThb: 400,
      commissionRatePct: 15,
      priCategory: { category_id: '600024', category_name: 'Kitchenware' },
      dateRange: 'last30Day',
      researchMode: 'balanced',
    }),
  });
  const kitchenEval = evaluateProductOpportunity(kitchenProd, { salesWeightPct: 50 });
  const kitchenPrompt = buildGeminiPromptPayload(kitchenProd, kitchenEval);
  assert.match(kitchenPrompt, /Kitchen & Appliances/i);
  assert.match(kitchenPrompt, /Problem-Solution/i);

  // Aligned product -> verified
  const alignedFallback = buildKalodataFallbackAnalysis(electronicsProd, electronicsEval, {
    isManualPreview: true,
  });
  assert.equal(alignedFallback.categoryVerificationStatus, 'verified');
  assert.equal(alignedFallback.aiContentSuitability.adFormat, 'tech-feature-demo');
  assert.ok((alignedFallback.affiliateStrategyEn ?? '').length > 10);
  assert.ok((alignedFallback.affiliateStrategyMy ?? '').length > 10);

  // Mismatched product (Bluetooth Earbuds placed under Women's Fashion + priCategory Phones & Electronics) -> Unverified!
  const mismatchedProd = makeSampleProduct({
    category: 'womens-fashion',
    name: 'Wireless Bluetooth Earbuds ANC Charger Cable',
    kalodataMetrics: makeKalodataMetrics({
      productId: '172940000004',
      salesVolume: 600,
      revenueThb: 350_000,
      revenueGrowthRate: 15,
      creatorNumber: 18,
      unitPriceThb: 590,
      commissionRatePct: 10,
      priCategory: { category_id: '601739', category_name: 'Phones & Electronics' },
      dateRange: 'last7Day',
      researchMode: 'fast',
    }),
  });

  const verification = verifyProductCategoryAlignment(mismatchedProd);
  assert.equal(verification.status, 'unverified');
  assert.equal(verification.suspectedCategory, 'electronics');

  const mismatchedEval = evaluateProductOpportunity(mismatchedProd, { salesWeightPct: 50 });
  const mismatchedFallback = buildKalodataFallbackAnalysis(mismatchedProd, mismatchedEval, {
    isManualPreview: true,
  });
  assert.equal(mismatchedFallback.categoryVerificationStatus, 'unverified');
  assert.ok((mismatchedFallback.categoryVerificationNoteEn ?? '').includes('Unverified'));
  assert.ok((mismatchedFallback.categoryVerificationNoteMy ?? '').includes('Unverified'));

  // All 14 categories produce valid fallback analysis with matching adFormat
  for (const cat of ALL_PRODUCT_CATEGORIES) {
    const def = getCategoryDefinition(cat);
    const sample = makeSampleProduct({
      id: `kd-cat-${cat}`,
      category: cat,
      name: `${def.labelEn} Flagship Item`,
      kalodataMetrics: makeKalodataMetrics({
        productId: `999000${ALL_PRODUCT_CATEGORIES.indexOf(cat)}`,
        salesVolume: 500,
        revenueThb: 250_000,
        revenueGrowthRate: 20,
        creatorNumber: 15,
        unitPriceThb: 500,
        commissionRatePct: 12,
        priCategory: { category_id: '999', category_name: def.labelEn },
        dateRange: 'last30Day',
        researchMode: 'balanced',
      }),
    });
    const ev = evaluateProductOpportunity(sample, { salesWeightPct: 50 });
    const fb = buildKalodataFallbackAnalysis(sample, ev, { isManualPreview: true });
    assert.equal(fb.analyzedCategory, cat);
    assert.equal(fb.aiContentSuitability.adFormat, def.aiProfile.adFormat);
  }
});

// ============================================================================
// 6. Backward Compatibility — Legacy Fashion & Cosmetics LocalStorage Data
// ============================================================================
test('Phase 8 Storage Backward Compatibility: loads legacy Fashion & Cosmetics History and Saved Products + persists new multi-category L2 records', () => {
  const storage = installMockLocalStorage();

  // Seed legacy Phase 2–7 Fashion & Cosmetics Research History record (no selectedSubcategoryIds field)
  const legacyFashionProduct = makeSampleProduct({
    id: 'kd-legacy-fashion-1',
    name: 'Linen Midi Dress Thailand',
    nameMy: 'Linen Midi Dress Thailand',
    category: 'womens-fashion',
    kalodataMetrics: makeKalodataMetrics({
      productId: '172900000100',
      salesVolume: 900,
      revenueThb: 450_000,
      revenueGrowthRate: 18,
      creatorNumber: 25,
      unitPriceThb: 500,
      commissionRatePct: 14,
      priCategory: { category_id: '601152', category_name: 'Womenswear & Underwear' },
      dateRange: 'last7Day',
      researchMode: 'fast',
    }),
  });

  const legacyHistoryPayload = [
    {
      id: 'res-legacy-001',
      researchedAt: '2026-10-01T08:00:00.000Z',
      researchMode: 'fast',
      selectedCategories: ['womens-fashion', 'cosmetics-beauty'],
      requestedQuantity: 10,
      productCount: 1,
      estimatedCredits: 0.1,
      estimatedUsd: 0.01,
      actualCredits: 0.1,
      actualUsd: 0.01,
      actualApiCalls: 1,
      researchSettings: {
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
      },
      products: [legacyFashionProduct],
      scoreSnapshots: {},
    },
  ];
  storage.setItem(RESEARCH_HISTORY_STORAGE_KEY, JSON.stringify(legacyHistoryPayload));

  // Seed legacy Saved Product record
  const legacySavedPayload = [
    {
      id: legacyFashionProduct.id,
      savedAt: '2026-10-01T08:15:00.000Z',
      researchDate: '2026-10-01T08:00:00.000Z',
      product: legacyFashionProduct,
      sources: legacyFashionProduct.sources,
    },
  ];
  storage.setItem(SAVED_PRODUCTS_STORAGE_KEY, JSON.stringify(legacySavedPayload));

  // Verify legacy records load cleanly without loss
  const loadedHistory = loadResearchHistory();
  assert.equal(loadedHistory.length, 1);
  assert.equal(loadedHistory[0].id, 'res-legacy-001');
  assert.deepEqual(loadedHistory[0].selectedCategories, ['womens-fashion', 'cosmetics-beauty']);
  assert.equal(loadedHistory[0].products[0].category, 'womens-fashion');

  const loadedSaved = loadSavedProducts();
  assert.equal(loadedSaved.length, 1);
  assert.equal(loadedSaved[0].product.category, 'womens-fashion');

  // Now create & persist a new Phase 8 multi-category + L2 subcategory history record
  const electronicsProd = makeSampleProduct({ id: 'kd-p8-elec-1', category: 'electronics' });
  const phase8Config: ResearchConfig = {
    market: 'Thailand TikTok Shop',
    category: 'all',
    selectedCategories: ['electronics', 'home-living'],
    selectedSubcategoryIds: ['800101'],
    selectedSubcategoryNames: ['Headphones & Earphones'],
    bothCategoryMode: 'combined',
    researchMode: 'balanced',
    spendingLimitCredits: 2,
    priceLimit: 'unrestricted',
    strategyPreset: 'balanced',
    salesWeightPct: 50,
    quantity: 10,
  };
  const phase8Session: ResearchSessionResponse = {
    products: [electronicsProd],
    researchedAt: '2026-11-20T14:00:00.000Z',
    requestedQuantity: 10,
    verifiedProductCount: 1,
    filteredOutCount: 0,
    groundingSources: [],
    searchQueries: [],
    researchSourceMode: 'kalodata-openapi',
    config: phase8Config,
  };

  const newRecord = createResearchHistoryRecord(phase8Session, phase8Config);
  const persistRes = persistResearchHistory([newRecord, ...loadedHistory]);
  assert.equal(persistRes.ok, true);

  const reloadedHistory = loadResearchHistory();
  assert.equal(reloadedHistory.length, 2);
  assert.deepEqual(reloadedHistory[0].selectedCategories, ['electronics', 'home-living']);
  assert.deepEqual(reloadedHistory[0].selectedSubcategoryIds, ['800101']);
  assert.deepEqual(reloadedHistory[0].selectedSubcategoryNames, ['Headphones & Earphones']);
  assert.equal(reloadedHistory[1].id, 'res-legacy-001');
});

// ============================================================================
// 7. Phase 8.1 — Category Count Accuracy (Unsynced, Syncing, 14/13/1, Error, Re-Sync)
// ============================================================================
test('Phase 8.1 Category Counts: accurately reports Total / Supported / Pending / Unsupported across unsynced, syncing, 14-13-1 synced, error, and re-sync states', () => {
  installMockLocalStorage();

  // 1) Unsynced state (before first live sync): 14 Total, 3 Supported, 11 Pending Sync, 0 Unsupported
  const unsyncedCache = createEmptySyncedCategoryCache();
  const unsyncedCounts = getCategoryCatalogCounts(unsyncedCache);
  assert.equal(unsyncedCounts.total, 14);
  assert.equal(unsyncedCounts.supported, 3);
  assert.equal(unsyncedCounts.verified, 3);
  assert.equal(unsyncedCounts.synced, 0);
  assert.equal(unsyncedCounts.requiresSync, 11);
  assert.equal(unsyncedCounts.unsupported, 0);
  assert.equal(unsyncedCounts.syncState, 'unsynced');
  assert.equal(
    formatCategoryCatalogCountSummary(unsyncedCounts, 'en'),
    '14 Total · 3 Supported · 11 Pending Sync · 0 Unsupported'
  );
  assert.equal(
    formatCategoryCatalogCountSummary(unsyncedCounts, 'my'),
    'စုစုပေါင်း 14 · ပံ့ပိုး 3 · Sync လို 11 · မပံ့ပိုး 0'
  );

  // 2) Syncing state: preserves accurate live counts without inflating supported
  const syncingCounts = getCategoryCatalogCounts(unsyncedCache, { isSyncing: true });
  assert.equal(syncingCounts.syncState, 'syncing');
  assert.equal(syncingCounts.total, 14);
  assert.equal(syncingCounts.supported, 3);

  // 3) Synced state with exact 14 Total · 13 Supported · 1 Unsupported (books-stationery missing)
  const thirteenCategoriesLive = [
    { category_id: '601152', category_name: 'Womenswear & Underwear' },
    { category_id: '601450', category_name: 'Beauty & Personal Care' },
    { category_id: '601739', category_name: 'Phones & Electronics' },
    { category_id: '600001', category_name: 'Home Supplies' },
    { category_id: '600024', category_name: 'Kitchenware' },
    { category_id: '601303', category_name: 'Health' },
    { category_id: '601226', category_name: 'Food & Beverages' },
    { category_id: '601352', category_name: 'Baby & Maternity' },
    { category_id: '603014', category_name: 'Sports & Outdoor' },
    { category_id: '605248', category_name: 'Automotive & Motorcycle' },
    { category_id: '602118', category_name: 'Pet Supplies' },
    { category_id: '604206', category_name: 'Toys & Hobbies' },
    { category_id: '604968', category_name: 'Fashion Accessories' },
  ];

  const synced13 = mergeSyncedL1Categories(
    unsyncedCache,
    thirteenCategoriesLive,
    '2026-11-21T04:00:00.000Z'
  );
  const counts13 = getCategoryCatalogCounts(synced13);
  assert.equal(counts13.total, 14);
  assert.equal(counts13.supported, 13);
  assert.equal(counts13.unsupported, 1);
  assert.equal(counts13.requiresSync, 0);
  assert.equal(counts13.syncState, 'synced');
  assert.equal(
    formatCategoryCatalogCountSummary(counts13, 'en'),
    '14 Total · 13 Supported · 1 Unsupported'
  );
  assert.equal(
    formatCategoryCatalogCountSummary(counts13, 'my'),
    'စုစုပေါင်း 14 · ပံ့ပိုး 13 · မပံ့ပိုး 1'
  );

  // Verify unsupported category is strictly disabled and excluded from selectable & resolved IDs
  const catalog13 = getEffectiveCategoryCatalog(synced13);
  const booksEntry = catalog13.find((e) => e.id === 'books-stationery');
  assert.equal(booksEntry?.apiSupportStatus, 'unsupported');
  assert.equal(booksEntry?.selectable, false);
  assert.equal(booksEntry?.kalodataId, null);
  assert.equal(getSelectableCategories(synced13).length, 13);
  assert.equal(getSelectableCategories(synced13).includes('books-stationery'), false);
  assert.equal(buildResolvedCategoryIdMap(synced13)['books-stationery'], undefined);

  // 4) Sync failure / empty response: error state reported without corrupting previous synced counts
  const afterEmptyFailure = mergeSyncedL1Categories(synced13, [], '2026-11-21T04:05:00.000Z');
  assert.deepEqual(afterEmptyFailure, synced13);
  const errorCounts = getCategoryCatalogCounts(afterEmptyFailure, { hasError: true });
  assert.equal(errorCounts.syncState, 'error');
  assert.equal(errorCounts.supported, 13);
  assert.equal(errorCounts.unsupported, 1);

  // 5) Re-sync where a previously supported category disappears -> automatically becomes unsupported (12 / 2)
  const twelveCategoriesLive = thirteenCategoriesLive.filter((c) => c.category_id !== '602118');
  const resynced12 = mergeSyncedL1Categories(
    synced13,
    twelveCategoriesLive,
    '2026-11-21T04:10:00.000Z'
  );
  const counts12 = getCategoryCatalogCounts(resynced12);
  assert.equal(counts12.total, 14);
  assert.equal(counts12.supported, 12);
  assert.equal(counts12.unsupported, 2);
  assert.equal(
    getEffectiveCategoryCatalog(resynced12).find((e) => e.id === 'pet-supplies')?.apiSupportStatus,
    'unsupported'
  );
  assert.equal(buildResolvedCategoryIdMap(resynced12)['pet-supplies'], undefined);

  // 6) Re-sync where all 14 categories are returned -> automatically updates to 14 Supported / 0 Unsupported
  const allFourteenLive = [
    ...thirteenCategoriesLive,
    { category_id: '605500', category_name: 'Books, Magazines & Audio' },
  ];
  const resynced14 = mergeSyncedL1Categories(
    resynced12,
    allFourteenLive,
    '2026-11-21T04:15:00.000Z'
  );
  const counts14 = getCategoryCatalogCounts(resynced14);
  assert.equal(counts14.total, 14);
  assert.equal(counts14.supported, 14);
  assert.equal(counts14.unsupported, 0);
  assert.equal(
    formatCategoryCatalogCountSummary(counts14, 'en'),
    '14 Total · 14 Supported · 0 Unsupported'
  );
  assert.equal(buildResolvedCategoryIdMap(resynced14)['books-stationery'], '605500');
});

// ============================================================================
// 8. Phase 8.1 — All Categories Filter (getKalodataCategoryIdsForFilter('all'))
// ============================================================================
test('Phase 8.1 All Categories Filter: includes all verified static + synced IDs (including Home & Living) and excludes unsupported IDs', () => {
  // Before sync: MUST include ALL 3 verified static IDs (Fashion, Cosmetics, AND Home & Living)
  const staticAllIds = getKalodataCategoryIdsForFilter('all');
  assert.deepEqual(staticAllIds, ['601152', '601450', '600001']);

  // After 13-supported / 1-unsupported sync: MUST include all 13 IDs and strictly exclude unsupported
  const synced13Cache = mergeSyncedL1Categories(
    createEmptySyncedCategoryCache(),
    [
      { category_id: '601152', category_name: 'Womenswear & Underwear' },
      { category_id: '601450', category_name: 'Beauty & Personal Care' },
      { category_id: '601739', category_name: 'Phones & Electronics' },
      { category_id: '600001', category_name: 'Home Supplies' },
      { category_id: '600024', category_name: 'Kitchenware' },
      { category_id: '601303', category_name: 'Health' },
      { category_id: '601226', category_name: 'Food & Beverages' },
      { category_id: '601352', category_name: 'Baby & Maternity' },
      { category_id: '603014', category_name: 'Sports & Outdoor' },
      { category_id: '605248', category_name: 'Automotive & Motorcycle' },
      { category_id: '602118', category_name: 'Pet Supplies' },
      { category_id: '604206', category_name: 'Toys & Hobbies' },
      { category_id: '604968', category_name: 'Fashion Accessories' },
    ],
    '2026-11-21T04:00:00.000Z'
  );

  const resolvedMap = buildResolvedCategoryIdMap(synced13Cache);
  const allIdsWithMap = getKalodataCategoryIdsForFilter('all', resolvedMap, {
    syncedCache: synced13Cache,
  });
  assert.equal(allIdsWithMap.length, 13);
  assert.ok(allIdsWithMap.includes('601152')); // womens-fashion
  assert.ok(allIdsWithMap.includes('601450')); // cosmetics-beauty
  assert.ok(allIdsWithMap.includes('600001')); // home-living
  assert.ok(allIdsWithMap.includes('601739')); // electronics
  assert.ok(allIdsWithMap.includes('600024')); // kitchen
  assert.ok(allIdsWithMap.includes('604968')); // jewelry-accessories

  // Even if someone passes a bogus ID for an explicitly unsupported slug, unsupportedSet MUST exclude it
  const guardedAllIds = getKalodataCategoryIdsForFilter(
    'all',
    { ...resolvedMap, 'books-stationery': '999999' },
    { unsupportedSlugs: ['books-stationery'] }
  );
  assert.equal(guardedAllIds.includes('999999'), false);
  assert.equal(guardedAllIds.length, 13);

  // Filtering directly on an unsupported category returns []
  assert.deepEqual(
    getKalodataCategoryIdsForFilter('books-stationery', resolvedMap, {
      syncedCache: synced13Cache,
    }),
    []
  );

  // Selection helper also excludes unsupported categories cleanly
  const selectedIds = getKalodataCategoryIdsForSelection(
    ['womens-fashion', 'home-living', 'electronics', 'books-stationery'],
    resolvedMap,
    { syncedCache: synced13Cache }
  );
  assert.deepEqual(selectedIds, ['601152', '600001', '601739']);
});

// ============================================================================
// 9. Phase 8.1 — Category Name Collision Fixes & Mocked L1/L2 Kalodata API Sync (0 Paid Calls)
// ============================================================================
test('Phase 8.1 Category Sync (Mocked API): fixes L1 name collisions, validates L1/L2 request payloads, and handles API failure cleanly without live calls', async () => {
  // Verify fixed name-matching collisions (no longer hijacked by broad /fashion/i or /audio/i)
  assert.equal(matchKalodataCategoryNameToSlug('Books, Magazines & Audio'), 'books-stationery');
  assert.equal(matchKalodataCategoryNameToSlug('Fashion Accessories'), 'jewelry-accessories');
  assert.equal(matchKalodataCategoryNameToSlug("Kids' Fashion"), 'baby-kids');
  assert.equal(matchKalodataCategoryNameToSlug('Womenswear & Underwear'), 'womens-fashion');
  assert.equal(matchKalodataCategoryNameToSlug('Phones & Electronics'), 'electronics');
  assert.equal(matchKalodataCategoryNameToSlug('Beauty & Personal Care'), 'cosmetics-beauty');
  assert.equal(matchKalodataCategoryNameToSlug('Kitchenware'), 'kitchen');

  const originalFetch = globalThis.fetch;
  const originalKey = process.env.KALODATA_API_KEY;
  process.env.KALODATA_API_KEY = 'mock-kalodata-test-key-never-sent-to-client';

  const capturedBodies: Array<Record<string, unknown>> = [];

  try {
    // Mock 1: Successful L1 TH sync returning 13 categories (books omitted -> 1 unsupported)
    globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
      const parsedBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      capturedBodies.push(parsedBody);

      if (parsedBody.category_level === 1) {
        return new Response(
          JSON.stringify({
            success: true,
            code: '0',
            data: [
              { category_id: '601152', category_name: 'Womenswear & Underwear', rank: 2, revenue: 9000000 },
              { category_id: '601450', category_name: 'Beauty & Personal Care', rank: 1, revenue: 12000000 },
              { category_id: '601739', category_name: 'Phones & Electronics', rank: 3, revenue: 8000000 },
              { category_id: '600001', category_name: 'Home Supplies', rank: 4, revenue: 7000000 },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (parsedBody.category_level === 2) {
        return new Response(
          JSON.stringify({
            success: true,
            code: '0',
            data: [
              {
                category_id: '800101',
                category_name: 'Headphones & Earphones',
                parent_category_id: '601739',
                rank: 1,
                revenue: 1500000,
              },
              {
                category_id: '800102',
                category_name: 'Power Banks & Chargers',
                parent_category_id: '601739',
                rank: 2,
                revenue: 950000,
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: false, code: '500', message: 'Upstream temporarily unavailable' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }) as typeof fetch;

    const l1Res = await fetchKalodataCategoryRank({
      region: 'TH',
      language: 'en-US',
      currency: 'THB',
      date_range: 'last30Day',
      page_number: 1,
      page_size: 100,
      category_level: 1,
      sort_field: { field: 'revenue', type: 'DESC' },
    });

    assert.equal(l1Res.ok, true);
    assert.equal(l1Res.items.length, 4);
    assert.equal(capturedBodies[0].region, 'TH');
    assert.equal(capturedBodies[0].category_level, 1);

    const cacheAfterL1 = mergeSyncedL1Categories(createEmptySyncedCategoryCache(), l1Res.items);
    assert.equal(getCategoryCatalogCounts(cacheAfterL1).supported, 4);
    assert.equal(getCategoryCatalogCounts(cacheAfterL1).unsupported, 10);

    // Mock 2: L2 subcategory sync with parent category_ids=['601739']
    const l2Res = await fetchKalodataCategoryRank({
      region: 'TH',
      language: 'en-US',
      currency: 'THB',
      date_range: 'last30Day',
      page_number: 1,
      page_size: 100,
      category_level: 2,
      category_ids: ['601739'],
      sort_field: { field: 'revenue', type: 'DESC' },
    });

    assert.equal(l2Res.ok, true);
    assert.deepEqual(capturedBodies[1].category_ids, ['601739']);
    assert.equal(l2Res.items[0].parent_category_id, '601739');

    const cacheAfterL2 = mergeSyncedL2Subcategories(cacheAfterL1, l2Res.items);
    assert.equal(cacheAfterL2.subcategories.length, 2);
    assert.equal(cacheAfterL2.subcategories[0].parentCategory, 'electronics');
    assert.equal(cacheAfterL2.subcategories[0].rank, 1);
    assert.equal(cacheAfterL2.subcategories[0].revenueThb, 1500000);

    // Verify L2 subcategory IDs flow cleanly into execution plan's API category_ids
    const l2Plan = buildKalodataExecutionPlan(['electronics'], 10, 'combined', {
      researchMode: 'fast',
      resolvedCategoryIdMap: buildResolvedCategoryIdMap(cacheAfterL2),
      selectedSubcategoryIds: ['800101'],
    });
    assert.deepEqual(l2Plan.categoryIds, ['800101']);
    assert.deepEqual(l2Plan.streams[0].categoryIds, ['800101']);

    // Mock 3: Upstream failure returns ok: false gracefully
    const failRes = await fetchKalodataCategoryRank({
      region: 'TH',
      language: 'en-US',
      currency: 'THB',
      date_range: 'last30Day',
      page_number: 1,
      page_size: 100,
      category_level: 3,
      sort_field: { field: 'revenue', type: 'DESC' },
    });
    assert.equal(failRes.ok, false);
    assert.equal(failRes.httpStatus, 503);
    assert.equal(failRes.items.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) {
      delete process.env.KALODATA_API_KEY;
    } else {
      process.env.KALODATA_API_KEY = originalKey;
    }
  }
});

