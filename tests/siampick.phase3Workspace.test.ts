import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  KalodataProductDetailEnrichmentRecord,
  ResearchProduct,
} from '../src/types/product.ts';
import {
  buildImportedComparisonMatrix,
  classifySimilarCandidate,
  collectLocalSimilarCandidates,
  contextToLibraryEntry,
  evaluateSimilarFinderResults,
  filterSimilarFinderItems,
  IMPORTED_LIBRARY_STORAGE_KEY,
  loadImportedLibrary,
  persistImportedLibrary,
  planComparisonDetailEnrichment,
  SIMILAR_PRODUCTS_CACHE_STORAGE_KEY,
  syncProductInImportedLibrary,
  upsertImportedLibraryEntry,
  type ComparisonCandidateItem,
} from '../src/utils/importedPhase3.ts';
import {
  buildImportedWorkspaceContextFromExisting,
  IMPORTED_WORKSPACE_STORAGE_KEY,
} from '../src/utils/importedProductWorkspace.ts';
import { ENRICHMENT_CACHE_STORAGE_KEY, saveEnrichmentToCache } from '../src/utils/enrichmentCache.ts';
import { SAVED_PRODUCTS_STORAGE_KEY } from '../src/utils/savedProductsStorage.ts';
import {
  LATEST_RESEARCH_SESSION_STORAGE_KEY,
  RESEARCH_HISTORY_STORAGE_KEY,
} from '../src/utils/researchHistoryStorage.ts';
import { createBudgetLedger } from '../server/budgetLedgerService.ts';
import { pauseResearch, resumeResearch } from '../server/researchService.ts';
import {
  buildCleanSimilarKeyword,
  clearServerSimilarProductsCache,
  previewSimilarProductsSearch,
  searchSimilarProducts,
  SimilarProductApiError,
} from '../server/similarProductService.ts';

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

function makeProduct(overrides: Partial<ResearchProduct> = {}): ResearchProduct {
  const base: ResearchProduct = {
    id: '1731661332013680750',
    name: 'Thai Glow Vitamin C Serum 30ml',
    nameMy: 'Thai Glow Vitamin C Serum 30ml',
    category: 'cosmetics-beauty',
    subCategory: 'Skincare & Serum',
    subCategoryMy: 'Skincare & Serum',
    shopName: 'SiamGlow Official TH',
    sellerStatus: 'verified',
    dispatchHub: 'Bangkok',
    researchedAt: '2026-11-21T10:00:00.000Z',
    researchMode: 'fast',
    researchDepthTag: 'detail-enriched',
    imageUrl: 'https://cdn.kalodata.com/test/1731661332013680750.jpg',
    imageVerified: true,
    imageSourceNoteEn: 'Verified Kalodata product image',
    imageSourceNoteMy: 'Kalodata image',
    priceThb: 299,
    priceStatus: 'verified',
    commissionRate: 12,
    commissionVerified: true,
    commissionStatus: 'verified',
    estimatedCommissionPerSaleThb: 36,
    commissionPerSaleStatus: 'verified',
    commissionNoteEn: 'Verified commission',
    commissionNoteMy: 'Verified commission',
    reviewCount: 420,
    reviewCountStatus: 'verified',
    customerRating: 4.8,
    customerRatingStatus: 'verified',
    feedbackStatus: 'verified',
    salesEvidenceStatus: 'verified',
    demandLevel: 'High',
    demandStatus: 'verified',
    competitionLevel: 'Moderate',
    competitionStatus: 'verified',
    aiVideoSuitability: 'High',
    aiVideoStatus: 'estimated',
    sellerReliabilityLevel: 'Reliable',
    sellerReliabilityStatus: 'verified',
    opportunityScore: 82,
    confidenceLevel: 'High',
    scoringInputs: {
      demandSales: { rawStrength: 85, verification: 'verified', evidenceEn: '3,200 units', evidenceMy: '3,200' },
      commissionEarning: { rawStrength: 78, verification: 'verified', evidenceEn: '12%', evidenceMy: '12%' },
      aiCreative: { rawStrength: 76, verification: 'estimated', evidenceEn: 'Good demo', evidenceMy: 'Good' },
      reviewsQuality: { rawStrength: 84, verification: 'verified', evidenceEn: '4.8/5', evidenceMy: '4.8' },
      priceAppeal: { rawStrength: 80, verification: 'verified', evidenceEn: '฿299', evidenceMy: '฿299' },
      competitionOpportunity: { rawStrength: 72, verification: 'verified', evidenceEn: '40 creators', evidenceMy: '40' },
      sellerReliability: { rawStrength: 75, verification: 'verified', evidenceEn: 'Official TH', evidenceMy: 'Official TH' },
    },
    whyChooseEn: 'Strong volume.',
    whyChooseMy: 'Strong volume.',
    demandEvidenceEn: [],
    demandEvidenceMy: [],
    salesPotentialEn: 'Strong.',
    salesPotentialMy: 'Strong.',
    reviewStrengthsEn: [],
    reviewStrengthsMy: [],
    customerComplaintsEn: [],
    customerComplaintsMy: [],
    competitionDetailEn: '40 creators.',
    competitionDetailMy: '40 creators.',
    sellerReliabilityEn: 'Verified shop.',
    sellerReliabilityMy: 'Verified shop.',
    generalRisksEn: [],
    generalRisksMy: [],
    aiVideoDetailEn: 'Demo ready.',
    aiVideoDetailMy: 'Demo ready.',
    videoIdeas: [
      {
        titleEn: 'Idea 1',
        titleMy: 'Idea 1',
        formatEn: 'Demo',
        formatMy: 'Demo',
        outlineEn: 'Hook',
        outlineMy: 'Hook',
      },
      {
        titleEn: 'Idea 2',
        titleMy: 'Idea 2',
        formatEn: 'Review',
        formatMy: 'Review',
        outlineEn: 'Show',
        outlineMy: 'Show',
      },
      {
        titleEn: 'Idea 3',
        titleMy: 'Idea 3',
        formatEn: 'Routine',
        formatMy: 'Routine',
        outlineEn: 'CTA',
        outlineMy: 'CTA',
      },
    ],
    confidenceDetailEn: 'Verified.',
    confidenceDetailMy: 'Verified.',
    missingDataEn: [],
    missingDataMy: [],
    kalodataMetrics: {
      productId: overrides.id ?? '1731661332013680750',
      dateRange: 'Last 30 days',
      researchMode: 'fast',
      detailEnriched: true,
      shopEnriched: false,
      reviewInsightEnriched: false,
      unitPriceThb: 299,
      minPriceThb: 259,
      maxPriceThb: 359,
      salesVolume: 3200,
      revenueThb: 956800,
      revenueGrowthRate: 0.25,
      commissionRatePct: 12,
      videoRevenueThb: 610000,
      liveRevenueThb: 190000,
      showcaseRevenueThb: 156800,
      shoppingMallRevenueThb: 0,
      creatorNumber: 40,
      videoNumber: 95,
      liveNumber: 12,
      deliveryType: 'Local TH',
      productReviewCount: 420,
      launchDate: '2026-06-01',
      sellerId: '749102938475610',
      sellerName: 'SiamGlow Official TH',
      skuCount: 3,
      shopSellerType: 'Brand Store',
      priCategory: { category_id: '601451', category_name: 'Beauty & Personal Care' },
      secCategory: { category_id: '800123', category_name: 'Skincare Serum' },
      terCategory: null,
      categoryIdsRequested: ['601451'],
    },
    sources: [
      {
        labelEn: 'Kalodata Product Detail',
        labelMy: 'Kalodata Product Detail',
        sourceType: 'kalodata-api',
        url: 'https://www.kalodata.com/product/detail?id=1731661332013680750',
        verified: true,
      },
    ],
  };

  return {
    ...base,
    ...overrides,
    kalodataMetrics:
      overrides.kalodataMetrics === undefined
        ? base.kalodataMetrics
        : overrides.kalodataMetrics,
  };
}

test('Phase 3 Imported Library persists in isolated key without touching existing stores', () => {
  const { store } = installMemoryStorage();
  const savedSentinel = JSON.stringify([{ id: 'saved-sentinel', note: 'keep-intact' }]);
  const historySentinel = JSON.stringify([{ id: 'history-sentinel' }]);
  const sessionSentinel = JSON.stringify({ products: [] });
  const workspaceSentinel = JSON.stringify({ canonicalProductId: '999' });

  store.set(SAVED_PRODUCTS_STORAGE_KEY, savedSentinel);
  store.set(RESEARCH_HISTORY_STORAGE_KEY, historySentinel);
  store.set(LATEST_RESEARCH_SESSION_STORAGE_KEY, sessionSentinel);
  store.set(IMPORTED_WORKSPACE_STORAGE_KEY, workspaceSentinel);

  const p1 = makeProduct({ id: '1110001110001110001', name: 'Serum Alpha' });
  const p2 = makeProduct({ id: '2220002220002220002', name: 'Serum Beta', priceThb: 199 });

  const ctx1 = buildImportedWorkspaceContextFromExisting(p1);
  const ctx2 = buildImportedWorkspaceContextFromExisting(p2);

  let lib = upsertImportedLibraryEntry([], ctx1);
  lib = upsertImportedLibraryEntry(lib, ctx2);
  lib = syncProductInImportedLibrary(lib, { ...p1, commissionRate: 18 });
  persistImportedLibrary(lib);

  const reloaded = loadImportedLibrary();
  assert.equal(reloaded.length, 2);
  assert.equal(reloaded.find((e) => e.canonicalProductId === '1110001110001110001')?.product.commissionRate, 18);
  assert.ok(store.has(IMPORTED_LIBRARY_STORAGE_KEY));

  // Existing Phase 1-2 storage keys remain byte-for-byte untouched
  assert.equal(store.get(SAVED_PRODUCTS_STORAGE_KEY), savedSentinel);
  assert.equal(store.get(RESEARCH_HISTORY_STORAGE_KEY), historySentinel);
  assert.equal(store.get(LATEST_RESEARCH_SESSION_STORAGE_KEY), sessionSentinel);
  assert.equal(store.get(IMPORTED_WORKSPACE_STORAGE_KEY), workspaceSentinel);
  assert.equal(contextToLibraryEntry(ctx1).canonicalProductId, '1110001110001110001');
});

test('Phase 3 Comparison Matrix requires >= 2 distinct products and never fabricates missing fields', () => {
  installMemoryStorage();

  const p1 = makeProduct({ id: '1001001001001001001', name: 'Vitamin C Serum A' });
  const duplicateP1: ComparisonCandidateItem = {
    canonicalProductId: '1001001001001001001',
    product: p1,
    origin: 'kalodata-api',
  };

  const singleMatrix = buildImportedComparisonMatrix([duplicateP1, duplicateP1]);
  assert.equal(singleMatrix.columns.length, 1);
  assert.equal(singleMatrix.canCompare, false);

  // Second product comes from Rank-only response: missing creatorNumber, videoNumber, commission
  const p2RankOnly = makeProduct({
    id: '2002002002002002002',
    name: 'Vitamin C Serum B (Rank Only)',
    priceThb: 219,
    commissionRate: 0,
    commissionVerified: false,
    commissionStatus: 'unavailable',
    estimatedCommissionPerSaleThb: null,
    competitionStatus: 'unavailable',
    kalodataMetrics: {
      productId: '2002002002002002002',
      dateRange: 'Last 30 days',
      researchMode: 'fast',
      detailEnriched: false,
      shopEnriched: false,
      reviewInsightEnriched: false,
      unitPriceThb: 219,
      minPriceThb: null,
      maxPriceThb: null,
      salesVolume: 5100,
      revenueThb: 1116900,
      revenueGrowthRate: 0.41,
      commissionRatePct: null,
      videoRevenueThb: null,
      liveRevenueThb: null,
      showcaseRevenueThb: null,
      shoppingMallRevenueThb: null,
      creatorNumber: null,
      videoNumber: null,
      liveNumber: null,
      deliveryType: null,
      productReviewCount: null,
      launchDate: null,
      sellerId: null,
      sellerName: null,
      skuCount: null,
      shopSellerType: null,
      priCategory: null,
      secCategory: null,
      terCategory: null,
      categoryIdsRequested: [],
    },
  });

  const matrix = buildImportedComparisonMatrix([
    duplicateP1,
    {
      canonicalProductId: '2002002002002002002',
      product: p2RankOnly,
      origin: 'kalodata-similar-search',
    },
  ]);

  assert.equal(matrix.canCompare, true);
  assert.equal(matrix.columns.length, 2);
  assert.deepEqual(
    matrix.rows.map((r) => r.key),
    [
      'price',
      'sales',
      'gmv',
      'commission',
      'creatorCompetition',
      'videoPerformance',
      'dataSource',
      'verificationStatus',
    ]
  );

  // Cheaper price winner = p2 (฿219 < ฿299), Highest sales = p2, Highest GMV = p2
  assert.equal(matrix.bestSummary.lowestPriceId, '2002002002002002002');
  assert.equal(matrix.bestSummary.highestSalesId, '2002002002002002002');
  assert.equal(matrix.bestSummary.highestGmvId, '2002002002002002002');
  // Commission/Creators/Video have only 1 valid value, so best is NEVER assigned falsely!
  assert.equal(matrix.bestSummary.highestCommissionId, null);
  assert.equal(matrix.bestSummary.lowestCompetitionId, null);
  assert.equal(matrix.bestSummary.highestVideoRevenueId, null);

  const commRow = matrix.rows.find((r) => r.key === 'commission')!;
  assert.equal(commRow.cells[1].valueEn, 'Unavailable');
  assert.equal(commRow.cells[1].status, 'unavailable');

  const compRow = matrix.rows.find((r) => r.key === 'creatorCompetition')!;
  assert.equal(compRow.cells[1].valueEn, 'Unavailable');
  assert.equal(compRow.cells[1].status, 'unavailable');

  const videoRow = matrix.rows.find((r) => r.key === 'videoPerformance')!;
  assert.equal(videoRow.cells[1].valueEn, 'Unavailable');
  assert.equal(videoRow.cells[1].status, 'unavailable');
});

test('Phase 3 planComparisonDetailEnrichment separates 0-cr cached products from 0.1-cr uncached products', () => {
  const { store } = installMemoryStorage();
  const cachedRecord: KalodataProductDetailEnrichmentRecord = {
    productId: '3003003003003003003',
    productShopId: '11223344',
    productName: 'Cached Serum',
    updatedAt: '2026-11-21T10:00:00.000Z',
    creatorNumber: 15,
    videoNumber: 40,
    liveNumber: 3,
    minPriceThb: 150,
    maxPriceThb: 199,
    unitPriceThb: 179,
    salesVolume: 900,
    revenueThb: 161100,
    revenueGrowthRate: 0.15,
    commissionRatePct: 16,
    videoRevenueThb: 90000,
    liveRevenueThb: 30000,
    showcaseRevenueThb: 41100,
    shoppingMallRevenueThb: 0,
    deliveryType: 'Local TH',
    productReviewCount: 110,
    launchDate: '2026-07-01',
    skuCount: 2,
    priCategory: null,
    secCategory: null,
    terCategory: null,
    masterImageUrl: null,
    trendPointsCount: 30,
    trendPeakThb: 8000,
    trendAvgThb: 5370,
    dateRange: 'Last 30 days',
  };

  saveEnrichmentToCache({
    productDetail: cachedRecord,
  });
  assert.ok(store.has(ENRICHMENT_CACHE_STORAGE_KEY));

  const detailed = makeProduct({ id: '1001001001001001001' });
  const missingCached = makeProduct({
    id: '3003003003003003003',
    kalodataMetrics: { ...makeProduct().kalodataMetrics!, productId: '3003003003003003003', detailEnriched: false, creatorNumber: null },
  });
  const missingUncached = makeProduct({
    id: '4004004004004004004',
    kalodataMetrics: { ...makeProduct().kalodataMetrics!, productId: '4004004004004004004', detailEnriched: false, creatorNumber: null },
  });

  const plan = planComparisonDetailEnrichment([
    { canonicalProductId: '1001001001001001001', product: detailed, origin: 'kalodata-api' },
    { canonicalProductId: '3003003003003003003', product: missingCached, origin: 'kalodata-similar-search' },
    { canonicalProductId: '4004004004004004004', product: missingUncached, origin: 'kalodata-similar-search' },
  ]);

  assert.deepEqual(plan.cachedDetailIds, ['3003003003003003003']);
  assert.deepEqual(plan.uncachedDetailIds, ['4004004004004004004']);
  assert.equal(plan.plannedApiCalls, 1);
  assert.equal(plan.estimatedCredits, 0.1);
  assert.equal(plan.requiresConfirmation, true);
});

test('Phase 3 Similar Product Finder strictly classifies Cheaper Price, Better Commission, and Lower Competition without fabricating Unavailable metrics', () => {
  installMemoryStorage();

  const reference = makeProduct({
    id: '1000000000000000001',
    name: 'Vitamin C Brightening Serum 30ml',
    priceThb: 299,
    commissionRate: 12,
    commissionVerified: true,
    kalodataMetrics: {
      ...makeProduct().kalodataMetrics!,
      productId: '1000000000000000001',
      unitPriceThb: 299,
      commissionRatePct: 12,
      creatorNumber: 40,
    },
  });

  // Candidate A: Cheaper (199 < 299) + Better Comm (18% > 12%) + missing creatorNumber => MUST NOT be Lower Competition!
  const candA = makeProduct({
    id: '1000000000000000002',
    name: 'Vitamin C Glow Drop Serum 30ml',
    priceThb: 199,
    commissionRate: 18,
    commissionVerified: true,
    competitionLevel: 'Low',
    competitionStatus: 'unavailable',
    kalodataMetrics: {
      ...makeProduct().kalodataMetrics!,
      productId: '1000000000000000002',
      unitPriceThb: 199,
      commissionRatePct: 18,
      detailEnriched: false,
      creatorNumber: null,
      videoNumber: null,
    },
  });

  // Candidate B: Higher price (350), lower commission (10%), verified fewer creators (12 < 40)
  const candB = makeProduct({
    id: '1000000000000000003',
    name: 'Premium Vitamin C Glass Skin Serum',
    priceThb: 350,
    commissionRate: 10,
    commissionVerified: true,
    competitionLevel: 'Low',
    competitionStatus: 'verified',
    kalodataMetrics: {
      ...makeProduct().kalodataMetrics!,
      productId: '1000000000000000003',
      unitPriceThb: 350,
      commissionRatePct: 10,
      detailEnriched: true,
      creatorNumber: 12,
    },
  });

  // Local workspace unrelated item should be excluded; matching item should be collected
  const unrelated = makeProduct({
    id: '9999999999999999999',
    name: 'Men Running Socks Pack',
    category: 'sports-outdoor',
    kalodataMetrics: {
      ...makeProduct().kalodataMetrics!,
      productId: '9999999999999999999',
      priCategory: { category_id: '700111', category_name: 'Sports' },
    },
  });

  const localMatches = collectLocalSimilarCandidates(reference, {
    liveResults: [reference, candB, unrelated],
  });
  assert.deepEqual(
    localMatches.map((p) => p.id),
    ['1000000000000000003']
  );

  const classA = classifySimilarCandidate(reference, candA, 'kalodata-similar-search');
  assert.equal(classA.isCheaperPrice, true);
  assert.equal(classA.priceDeltaThb, 100);
  assert.equal(classA.isBetterCommission, true);
  assert.equal(classA.commissionGainPts, 6);
  assert.equal(classA.isLowerCompetition, false); // Strict: creatorNumber is null!
  assert.equal(classA.creatorDelta, null);

  const evaluation = evaluateSimilarFinderResults(reference, {
    apiCandidates: [reference, candA],
    apiSource: 'kalodata-similar-search',
    localCandidates: localMatches,
  });

  // Reference excluded, candA & candB included
  assert.equal(evaluation.counts.all, 2);
  assert.equal(evaluation.counts.cheaperPrice, 1);
  assert.equal(evaluation.counts.betterCommission, 1);
  assert.equal(evaluation.counts.lowerCompetition, 1);

  assert.equal(filterSimilarFinderItems(evaluation.items, 'cheaper-price').length, 1);
  assert.equal(filterSimilarFinderItems(evaluation.items, 'better-commission').length, 1);
  assert.equal(filterSimilarFinderItems(evaluation.items, 'lower-competition').length, 1);
  assert.equal(
    filterSimilarFinderItems(evaluation.items, 'lower-competition')[0].canonicalProductId,
    '1000000000000000003'
  );
});

test('Phase 3 Server Similar Search enforces Confirmation, Pause, Budget Limit, Fail-Closed Storage, and 0-cr Cache Reuse', async () => {
  clearServerSimilarProductsCache();
  resumeResearch();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'siampick-phase3-ledger-'));
  const sqlitePath = path.join(tmpDir, 'budget.sqlite');
  const ledger = createBudgetLedger({ sqlitePath });

  try {
    const reference = makeProduct({
      id: '5005005005005005001',
      name: '[HOT SALE] Hyaluronic Hydrating Sunscreen SPF50 50ml',
    });

    assert.equal(
      buildCleanSimilarKeyword(reference.name),
      'Hyaluronic Hydrating Sunscreen'
    );

    let rankCalls = 0;
    const fakeRankFn = async () => {
      rankCalls += 1;
      return {
        ok: true,
        items: [
          // Reference itself should be filtered out automatically
          {
            product_id: '5005005005005005001',
            product_title: reference.name,
            price: 299,
            commission_rate: 12,
            sales: 1000,
            revenue: 299000,
          },
          {
            product_id: '5005005005005005002',
            product_title: 'Aqua Light UV Sunscreen SPF50 PA++++',
            price: 189,
            commission_rate: 15,
            sales: 2400,
            revenue: 453600,
            pri_category: { category_id: '601451', category_name: 'Beauty & Personal Care' },
          },
        ],
      };
    };

    const preview1 = await previewSimilarProductsSearch(
      {
        referenceProduct: reference,
        spendingLimitCredits: 1,
      },
      {
        budgetLedger: ledger,
        budgetScopeKey: 'test-scope',
        fetchCreditBalance: async () => ({ ok: true, balance: 10 }),
      }
    );
    assert.equal(preview1.cachedInServer, false);
    assert.equal(preview1.requiresPaidApiCall, true);
    assert.equal(preview1.estimatedCredits, 0.1);
    assert.equal(rankCalls, 0);

    // 1) Missing confirmation => blocked (400, 0 API calls)
    await assert.rejects(
      () =>
        searchSimilarProducts(
          {
            referenceProduct: reference,
            spendingLimitCredits: 1,
            userConfirmedPaidExecution: false,
            idempotencyKey: 'key-unconfirmed',
          },
          {
            budgetLedger: ledger,
            budgetScopeKey: 'test-scope',
            fetchProductRank: fakeRankFn,
            verifyImageUrl: async () => ({
              imageVerified: false,
              imageUrl: null,
              imageOriginUrl: null,
              imageSourceNoteEn: 'None',
              imageSourceNoteMy: 'None',
            }),
          }
        ),
      (err: unknown) => err instanceof SimilarProductApiError && err.code === 'CONFIRMATION_REQUIRED'
    );
    assert.equal(rankCalls, 0);

    // 2) Paused research => blocked (423, 0 API calls)
    pauseResearch('manual');
    await assert.rejects(
      () =>
        searchSimilarProducts(
          {
            referenceProduct: reference,
            spendingLimitCredits: 1,
            userConfirmedPaidExecution: true,
            idempotencyKey: 'key-paused',
          },
          {
            budgetLedger: ledger,
            budgetScopeKey: 'test-scope',
            fetchProductRank: fakeRankFn,
          }
        ),
      (err: unknown) => err instanceof SimilarProductApiError && err.code === 'RESEARCH_PAUSED'
    );
    assert.equal(rankCalls, 0);
    resumeResearch();

    // 3) Disabled storage => fail-closed (503, 0 API calls)
    const prevDisabled = process.env.SIAMPICK_BUDGET_STORE_DISABLED;
    process.env.SIAMPICK_BUDGET_STORE_DISABLED = 'true';
    try {
      await assert.rejects(
        () =>
          searchSimilarProducts(
            {
              referenceProduct: reference,
              spendingLimitCredits: 1,
              userConfirmedPaidExecution: true,
              idempotencyKey: 'key-disabled',
            },
            {
              budgetScopeKey: 'test-scope',
              fetchProductRank: fakeRankFn,
            }
          ),
        (err: unknown) => err instanceof SimilarProductApiError && err.code === 'BUDGET_STORAGE_UNAVAILABLE'
      );
    } finally {
      if (prevDisabled === undefined) {
        delete process.env.SIAMPICK_BUDGET_STORE_DISABLED;
      } else {
        process.env.SIAMPICK_BUDGET_STORE_DISABLED = prevDisabled;
      }
    }
    assert.equal(rankCalls, 0);

    // 4) Budget exceeded (0.1 cr already committed under 0.1 cr limit => remaining 0.0 < 0.1)
    const seedRes = await ledger.atomicReserveBudget({
      scopeKey: 'test-scope',
      idempotencyKey: 'seed-spent-0.1',
      runId: null,
      operation: 'research',
      reserveCredits: 0.1,
      requestedLimitCredits: 0.1,
    });
    assert.equal(seedRes.ok, true);
    if (seedRes.ok) {
      await ledger.settleReservation({
        scopeKey: 'test-scope',
        reservationId: seedRes.reservationId,
        actualCredits: 0.1,
        requestedLimitCredits: 0.1,
        note: 'seed-limit-test',
      });
    }

    await assert.rejects(
      () =>
        searchSimilarProducts(
          {
            referenceProduct: reference,
            spendingLimitCredits: 0.1,
            userConfirmedPaidExecution: true,
            idempotencyKey: 'key-limit',
          },
          {
            budgetLedger: ledger,
            budgetScopeKey: 'test-scope',
            fetchCreditBalance: async () => ({ ok: true, balance: 10 }),
            fetchProductRank: fakeRankFn,
          }
        ),
      (err: unknown) => err instanceof SimilarProductApiError && err.code === 'SPENDING_LIMIT_EXCEEDED'
    );
    assert.equal(rankCalls, 0);

    // 5) Confirmed execution succeeds under 1.0 cr limit, excludes reference product, does not fabricate creatorNumber, charges 0.1 cr
    const paidResult = await searchSimilarProducts(
      {
        referenceProduct: reference,
        spendingLimitCredits: 1,
        userConfirmedPaidExecution: true,
        idempotencyKey: 'key-paid-1',
      },
      {
        budgetLedger: ledger,
        budgetScopeKey: 'test-scope',
        fetchCreditBalance: async () => ({ ok: true, balance: 10 }),
        fetchProductRank: fakeRankFn,
        verifyImageUrl: async () => ({
          imageVerified: false,
          imageUrl: null,
          imageOriginUrl: null,
          imageSourceNoteEn: 'None',
          imageSourceNoteMy: 'None',
        }),
      }
    );

    assert.equal(rankCalls, 1);
    assert.equal(paidResult.dataSource, 'kalodata-similar-search');
    assert.equal(paidResult.apiCallsMade, 1);
    assert.equal(paidResult.estimatedCreditsCharged, 0.1);
    assert.equal(paidResult.candidates.length, 1);
    assert.equal(paidResult.candidates[0].kalodataMetrics?.productId, '5005005005005005002');
    assert.equal(paidResult.candidates[0].kalodataMetrics?.creatorNumber ?? null, null);
    assert.equal(paidResult.budgetSnapshot?.totalCommittedCredits, 0.2);

    // 6) Server Cache hit serves identical query at 0 cr without confirmation or API calls
    const cachedResult = await searchSimilarProducts(
      {
        referenceProduct: reference,
        spendingLimitCredits: 1,
        userConfirmedPaidExecution: false,
      },
      {
        budgetLedger: ledger,
        budgetScopeKey: 'test-scope',
        fetchProductRank: fakeRankFn,
      }
    );
    assert.equal(rankCalls, 1); // No extra API call!
    assert.equal(cachedResult.dataSource, 'server-cache');
    assert.equal(cachedResult.apiCallsMade, 0);
    assert.equal(cachedResult.estimatedCreditsCharged, 0);
    assert.equal(cachedResult.candidates.length, 1);
  } finally {
    ledger.close();
    clearServerSimilarProductsCache();
    resumeResearch();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Phase 3 scope guard: excludes Video Research and AI Strategy and preserves ImportedProductWorkspace cleanly', () => {
  const root = path.resolve(process.cwd());
  const phase3Files = [
    'src/components/ImportedPhase3Workspace.tsx',
    'src/components/ImportedProductComparisonPanel.tsx',
    'src/components/SimilarProductFinderPanel.tsx',
    'src/utils/importedPhase3.ts',
    'server/similarProductService.ts',
  ];

  for (const rel of phase3Files) {
    const content = fs.readFileSync(path.join(root, rel), 'utf8');
    assert.doesNotMatch(content, /fetchKalodataVideoRank|video\/rank/i, `${rel} must not invoke Video Research`);
    assert.doesNotMatch(
      content,
      /generateDeepDiveAiStrategy|analyzeSingleProductWithGemini|GoogleGenAI/i,
      `${rel} must not invoke AI Strategy`
    );
  }

  const phase2Workspace = fs.readFileSync(
    path.join(root, 'src/components/ImportedProductWorkspace.tsx'),
    'utf8'
  );
  assert.doesNotMatch(phase2Workspace, /ProductComparisonModal|SimilarProduct|findSimilar|toggleCompare/i);
  assert.ok(SIMILAR_PRODUCTS_CACHE_STORAGE_KEY.length > 0);
});
