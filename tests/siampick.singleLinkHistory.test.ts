import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import type {
  LinkImportExecuteResponse,
  ResearchConfig,
  ResearchProduct,
  ResearchSessionResponse,
  ScoringInputs,
  VideoContentIdea,
} from '../src/types/product.ts';
import {
  createResearchHistoryRecord,
  LATEST_RESEARCH_SESSION_STORAGE_KEY,
  loadLatestResearchSession,
  loadResearchHistory,
  persistLatestResearchSession,
  persistResearchHistory,
  RESEARCH_HISTORY_STORAGE_KEY,
} from '../src/utils/researchHistoryStorage.ts';
import {
  createSingleProductHistoryRecord,
  deleteSingleProductHistoryRecords,
  LEGACY_IMPORTED_LIBRARY_STORAGE_KEY,
  LEGACY_IMPORTED_WORKSPACE_STORAGE_KEY,
  LEGACY_SIMILAR_CACHE_STORAGE_KEY,
  loadSingleProductHistory,
  migrateLegacyImportedDataToSingleHistory,
  persistSingleProductHistory,
  SINGLE_PRODUCT_HISTORY_MAX_RECORDS,
  SINGLE_PRODUCT_HISTORY_STORAGE_KEY,
  syncProductInSingleHistory,
  upsertSingleProductHistoryRecord,
} from '../src/utils/singleProductHistoryStorage.ts';
import {
  createSavedRecord,
  loadSavedProducts,
  persistSavedProductsWithStatus,
  SAVED_PRODUCTS_STORAGE_KEY,
} from '../src/utils/savedProductsStorage.ts';
import {
  ENRICHMENT_CACHE_STORAGE_KEY,
  loadEnrichmentCache,
  saveEnrichmentToCache,
} from '../src/utils/enrichmentCache.ts';
import {
  buildSiamPickBackupSnapshot,
  parseAndValidateSiamPickBackup,
  restoreSiamPickBackup,
} from '../src/utils/backupStorage.ts';
import { evaluateProductOpportunity } from '../src/utils/scoring.ts';

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  public failWriteKeys = new Set<string>();

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
    if (this.failWriteKeys.has(key)) {
      const err = new Error('QuotaExceededError');
      err.name = 'QuotaExceededError';
      throw err;
    }
    this.store.set(key, value);
  }
}

const DEFAULT_SCORING_INPUTS: ScoringInputs = {
  demandSales: { rawStrength: 82, verification: 'verified', evidenceEn: 'OK', evidenceMy: 'OK' },
  commissionEarning: { rawStrength: 78, verification: 'verified', evidenceEn: 'OK', evidenceMy: 'OK' },
  aiCreative: { rawStrength: 80, verification: 'estimated', evidenceEn: 'OK', evidenceMy: 'OK' },
  reviewsQuality: { rawStrength: 75, verification: 'verified', evidenceEn: 'OK', evidenceMy: 'OK' },
  priceAppeal: { rawStrength: 80, verification: 'verified', evidenceEn: 'OK', evidenceMy: 'OK' },
  competitionOpportunity: { rawStrength: 72, verification: 'verified', evidenceEn: 'OK', evidenceMy: 'OK' },
  sellerReliability: { rawStrength: 80, verification: 'verified', evidenceEn: 'OK', evidenceMy: 'OK' },
};

const DEFAULT_VIDEO_IDEAS: [VideoContentIdea, VideoContentIdea, VideoContentIdea] = [
  { titleEn: 'Hook 1', titleMy: 'Hook 1', formatEn: '3D', formatMy: '3D', outlineEn: 'Demo', outlineMy: 'Demo' },
  { titleEn: 'Hook 2', titleMy: 'Hook 2', formatEn: '3D', formatMy: '3D', outlineEn: 'Demo', outlineMy: 'Demo' },
  { titleEn: 'Hook 3', titleMy: 'Hook 3', formatEn: '3D', formatMy: '3D', outlineEn: 'Demo', outlineMy: 'Demo' },
];

function makeProduct(
  id: string,
  name: string,
  priceThb = 299,
  researchedAt = '2026-11-20T10:00:00.000Z'
): ResearchProduct {
  return {
    id,
    name,
    nameMy: name,
    category: 'cosmetics-beauty',
    subCategory: 'Skincare',
    subCategoryMy: 'အသားအရေထိန်းသိမ်း',
    shopName: 'Glow Bangkok Official',
    dispatchHub: 'Bangkok',
    imageUrl: 'https://cdn.example.com/product.jpg',
    imageVerified: true,
    imageSourceNoteEn: 'Kalodata image',
    imageSourceNoteMy: 'Kalodata ပုံ',
    priceThb,
    priceStatus: 'verified',
    commissionRate: 15,
    commissionVerified: true,
    commissionStatus: 'verified',
    estimatedCommissionPerSaleThb: Number((priceThb * 0.15).toFixed(2)),
    commissionNoteEn: '15% commission',
    commissionNoteMy: '15% ကော်မရှင်',
    demandLevel: 'High',
    competitionLevel: 'Moderate',
    opportunityScore: 82,
    confidenceLevel: 'High',
    aiVideoSuitability: 'High',
    sellerReliabilityLevel: 'Reliable',
    scoringInputs: DEFAULT_SCORING_INPUTS,
    whyChooseEn: 'Strong sales & commission',
    whyChooseMy: 'ရောင်းအားနှင့်ကော်မရှင်ကောင်း',
    salesPotentialEn: 'High repeat velocity',
    salesPotentialMy: 'ပြန်ဝယ်နှုန်းမြင့်',
    competitionDetailEn: 'Moderate creator count',
    competitionDetailMy: 'Creator အသင့်အတင့်',
    sellerReliabilityEn: 'Verified TH store',
    sellerReliabilityMy: 'TH ဆိုင်အစစ်',
    aiVideoDetailEn: 'Strong product demo',
    aiVideoDetailMy: '3D ကြော်ငြာသင့်တော်',
    confidenceDetailEn: 'Verified Kalodata metrics',
    confidenceDetailMy: 'Kalodata ဒေတာအတည်ပြုပြီး',
    sources: [
      {
        labelEn: 'Kalodata TH Product',
        labelMy: 'Kalodata TH',
        sourceType: 'kalodata',
        url: `https://shop.tiktok.com/view/product/${id}`,
        verified: true,
      },
    ],
    reviewStrengthsEn: ['Lightweight feel'],
    reviewStrengthsMy: ['ပေါ့ပါးသည်'],
    customerComplaintsEn: [],
    customerComplaintsMy: [],
    demandEvidenceEn: ['Strong repeat purchase rate'],
    demandEvidenceMy: ['ပြန်ဝယ်နှုန်းကောင်း'],
    generalRisksEn: [],
    generalRisksMy: [],
    missingDataEn: [],
    missingDataMy: [],
    videoIdeas: DEFAULT_VIDEO_IDEAS,
    researchedAt,
    kalodataMetrics: {
      productId: id,
      sellerId: 'shop_001',
      sellerName: 'Glow Bangkok Official',
      unitPriceThb: priceThb,
      salesVolume: 1200,
      revenueThb: priceThb * 1200,
      commissionRatePct: 15,
      revenueGrowthRate: 24,
      liveRevenueThb: 50000,
      videoRevenueThb: 280000,
      showcaseRevenueThb: 28800,
      launchDate: '2026-01-15',
      skuCount: 3,
      priCategory: null,
      secCategory: null,
      terCategory: null,
      categoryIdsRequested: ['601450'],
      creatorNumber: 12,
      researchMode: 'fast',
      dateRange: '30d',
      detailEnriched: true,
      shopEnriched: false,
      reviewInsightEnriched: false,
    },
  };
}

function makeBatchConfig(quantity = 30): ResearchConfig {
  return {
    market: 'Thailand TikTok Shop',
    category: 'cosmetics-beauty',
    selectedCategories: ['cosmetics-beauty'],
    researchMode: 'balanced',
    spendingLimitCredits: 10,
    priceLimit: 'unrestricted',
    strategyPreset: 'balanced',
    salesWeightPct: 50,
    quantity,
  };
}

function makeBatchSessionResponse(
  products: ResearchProduct[],
  config: ResearchConfig,
  researchedAt: string
): ResearchSessionResponse {
  return {
    products,
    researchedAt,
    requestedQuantity: config.quantity,
    verifiedProductCount: products.length,
    filteredOutCount: 0,
    searchQueries: ['skincare'],
    groundingSources: [],
    config,
  };
}

function persistBatchSessionHelper(
  products: ResearchProduct[],
  config: ResearchConfig,
  researchedAt: string
) {
  return persistLatestResearchSession({
    products,
    sessionMeta: {
      requestedQuantity: config.quantity,
      verifiedProductCount: products.length,
      filteredOutCount: 0,
    },
    lastCostSummary: null,
    researchSourceMode: 'kalodata-openapi',
    researchedAt,
    groundingSources: [],
    searchQueries: ['skincare'],
    activeHuntConfig: config,
    rejectedIds: [],
  });
}

function makeExecuteResult(
  product: ResearchProduct,
  dataSource: LinkImportExecuteResponse['dataSource'] = 'kalodata-api'
): LinkImportExecuteResponse {
  const canonicalUrl = `https://www.tiktok.com/shop/th/pdp/product/${product.id}`;
  return {
    ok: true,
    product,
    evaluation: evaluateProductOpportunity(product, { salesWeightPct: 50, strategyPreset: 'balanced' }),
    productDetailRecord: null,
    shopDetailRecord: null,
    reviewInsightRecord: null,
    canonicalUrl,
    slugResolved: true,
    resolvedUrl: canonicalUrl,
    redirectHops: [],
    alreadyExistedInWorkspace: false,
    dataSource,
    apiCallsMade: dataSource === 'kalodata-api' ? 1 : 0,
    estimatedCreditsCharged: dataSource === 'kalodata-api' ? 0.01 : 0,
    creditsBalanceBefore: null,
    creditsBalanceAfter: null,
    costSummary: {
      researchMode: 'fast',
      estimatedCredits: dataSource === 'kalodata-api' ? 0.01 : 0,
      estimatedUsd: dataSource === 'kalodata-api' ? 0.001 : 0,
      plannedApiCalls: dataSource === 'kalodata-api' ? 1 : 0,
      actualApiCalls: dataSource === 'kalodata-api' ? 1 : 0,
      rankApiCalls: 0,
      productDetailApiCalls: dataSource === 'kalodata-api' ? 1 : 0,
      shopDetailApiCalls: 0,
      commentInsightApiCalls: 0,
      deepDiveCount: 0,
      includeReviewInsights: false,
      geminiAnalysisApplied: false,
      actualCredits: dataSource === 'kalodata-api' ? 0.01 : 0,
      actualUsd: dataSource === 'kalodata-api' ? 0.001 : 0,
      balanceBefore: null,
      balanceAfter: null,
      spendingLimitCredits: 10,
      bothCategoryMode: 'combined',
      categoryIds: ['601450'],
    },
  };
}

function setupStorage(): MemoryStorage {
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
    writable: true,
  });
  return storage;
}

test('1. Batch Recent Results (30 items) & Batch History remain untouched after researching 5 single link products', () => {
  setupStorage();

  const batchProducts = Array.from({ length: 30 }, (_, idx) =>
    makeProduct(
      `1729000000000000${String(idx + 1).padStart(3, '0')}`,
      `Batch Product ${idx + 1}`,
      250 + idx
    )
  );
  const config = makeBatchConfig(30);
  const batchRecord = createResearchHistoryRecord(
    makeBatchSessionResponse(batchProducts, config, '2026-11-19T08:00:00.000Z'),
    config
  );

  assert.equal(persistResearchHistory([batchRecord]).ok, true);
  assert.equal(
    persistBatchSessionHelper(batchProducts, config, '2026-11-19T08:00:00.000Z').ok,
    true
  );

  // Now research 5 single products via Product Link
  let singleHistory = loadSingleProductHistory();
  for (let i = 1; i <= 5; i++) {
    const singleProd = makeProduct(
      `172999900000000000${i}`,
      `Single Link Product ${i}`,
      399 + i,
      `2026-11-21T0${i}:00:00.000Z`
    );
    const singleRec = createSingleProductHistoryRecord(
      makeExecuteResult(singleProd, 'kalodata-api')
    );
    singleHistory = upsertSingleProductHistoryRecord(singleHistory, singleRec);
    assert.equal(persistSingleProductHistory(singleHistory).ok, true);
  }

  // Verify strict separation: Batch Recent Results STILL exact 30 (never 31 or 35)
  const latestBatchSession = loadLatestResearchSession();
  assert.ok(latestBatchSession, 'Latest batch session should remain present');
  assert.equal(latestBatchSession.products.length, 30);
  assert.equal(latestBatchSession.products[0].id, '1729000000000000001');
  assert.equal(latestBatchSession.products[29].id, '1729000000000000030');

  const reloadedBatchHistory = loadResearchHistory();
  assert.equal(reloadedBatchHistory.length, 1);
  assert.equal(reloadedBatchHistory[0].products.length, 30);

  const reloadedSingleHistory = loadSingleProductHistory();
  assert.equal(reloadedSingleHistory.length, 5);
  assert.equal(reloadedSingleHistory[0].product.id, '1729999000000000005');
});

test('2. Saving a new Batch Research run never alters or deletes Single Product History', () => {
  setupStorage();

  const s1 = makeProduct('1729888000000000001', 'Single Serum', 320, '2026-11-20T09:00:00.000Z');
  const s2 = makeProduct('1729888000000000002', 'Single Lip Tint', 199, '2026-11-20T10:00:00.000Z');
  let singleHistory = upsertSingleProductHistoryRecord(
    [],
    createSingleProductHistoryRecord(makeExecuteResult(s1, 'kalodata-api'))
  );
  singleHistory = upsertSingleProductHistoryRecord(
    singleHistory,
    createSingleProductHistoryRecord(makeExecuteResult(s2, 'server-cache'))
  );
  assert.equal(persistSingleProductHistory(singleHistory).ok, true);

  // Execute a new Batch Research save & session update
  const newBatchProducts = Array.from({ length: 20 }, (_, idx) =>
    makeProduct(`17297770000000000${String(idx + 1).padStart(2, '0')}`, `New Batch ${idx + 1}`)
  );
  const newConfig = makeBatchConfig(20);
  const newBatchRec = createResearchHistoryRecord(
    makeBatchSessionResponse(newBatchProducts, newConfig, '2026-11-21T12:00:00.000Z'),
    newConfig
  );
  assert.equal(persistResearchHistory([newBatchRec]).ok, true);
  assert.equal(
    persistBatchSessionHelper(newBatchProducts, newConfig, '2026-11-21T12:00:00.000Z').ok,
    true
  );

  const afterSingle = loadSingleProductHistory();
  assert.equal(afterSingle.length, 2);
  assert.deepEqual(
    afterSingle.map((r) => r.canonicalProductId),
    ['1729888000000000002', '1729888000000000001']
  );
});

test('3. Adding or deleting in Single Product History never touches Batch History records', () => {
  setupStorage();

  const batchProducts = [makeProduct('1729111000000000001', 'Batch Alpha')];
  const cfg = makeBatchConfig(1);
  const batchRecord = createResearchHistoryRecord(
    makeBatchSessionResponse(batchProducts, cfg, '2026-11-18T10:00:00.000Z'),
    cfg
  );
  persistResearchHistory([batchRecord]);

  const singleProd = makeProduct('1729222000000000001', 'Single Beta');
  const singleRec = createSingleProductHistoryRecord(makeExecuteResult(singleProd));
  let singleList = upsertSingleProductHistoryRecord([], singleRec);
  persistSingleProductHistory(singleList);

  singleList = deleteSingleProductHistoryRecords(singleList, [singleRec.id]);
  persistSingleProductHistory(singleList);

  assert.equal(loadSingleProductHistory().length, 0);
  const batchAfter = loadResearchHistory();
  assert.equal(batchAfter.length, 1);
  assert.equal(batchAfter[0].id, batchRecord.id);
  assert.equal(batchAfter[0].products[0].id, '1729111000000000001');
});

test('4. Same canonicalProductId in both Batch History and Single Product History stays completely independent (never auto-merges)', () => {
  setupStorage();

  const sharedId = '1729555000000000999';
  const batchVersion = makeProduct(
    sharedId,
    'Serum — Batch Snapshot',
    250,
    '2026-11-18T08:00:00.000Z'
  );
  const cfg = makeBatchConfig(1);
  const batchRecord = createResearchHistoryRecord(
    makeBatchSessionResponse([batchVersion], cfg, '2026-11-18T08:00:00.000Z'),
    cfg
  );
  persistResearchHistory([batchRecord]);
  persistBatchSessionHelper([batchVersion], cfg, '2026-11-18T08:00:00.000Z');

  // Research same product ID via Single Link with updated price
  const linkVersion = makeProduct(
    sharedId,
    'Serum — Single Link Live',
    349,
    '2026-11-21T14:00:00.000Z'
  );
  const singleRec = createSingleProductHistoryRecord(
    makeExecuteResult(linkVersion, 'kalodata-api')
  );
  let singleHistory = upsertSingleProductHistoryRecord([], singleRec);
  singleHistory = syncProductInSingleHistory(
    singleHistory,
    { ...linkVersion, priceThb: 359 },
    50,
    'balanced'
  );
  persistSingleProductHistory(singleHistory);

  // Batch must preserve its exact snapshot (name & price 250)
  const batchLoaded = loadResearchHistory();
  const latestBatchLoaded = loadLatestResearchSession();
  assert.equal(batchLoaded[0].products[0].name, 'Serum — Batch Snapshot');
  assert.equal(batchLoaded[0].products[0].priceThb, 250);
  assert.equal(latestBatchLoaded?.products[0].priceThb, 250);

  // Single must keep its independent updated snapshot (price 359)
  const singleLoaded = loadSingleProductHistory();
  assert.equal(singleLoaded.length, 1);
  assert.equal(singleLoaded[0].canonicalProductId, sharedId);
  assert.equal(singleLoaded[0].product.priceThb, 359);

  // Deleting Single record must leave Batch untouched
  const afterDelete = deleteSingleProductHistoryRecords(singleLoaded, [singleLoaded[0].id]);
  persistSingleProductHistory(afterDelete);
  assert.equal(loadSingleProductHistory().length, 0);
  assert.equal(loadResearchHistory()[0].products[0].id, sharedId);
});

test('5. Legacy Phase 2/3 migration moves imported items once safely, removes obsolete keys, preserves Batch/Saved/Cache, and is quota-safe', () => {
  const storage = setupStorage();

  // Existing Batch, Saved, and Enrichment Cache must be preserved
  const batchProd = makeProduct('1729100000000000001', 'Existing Batch');
  const cfg = makeBatchConfig(1);
  persistResearchHistory([
    createResearchHistoryRecord(
      makeBatchSessionResponse([batchProd], cfg, '2026-11-15T10:00:00.000Z'),
      cfg
    ),
  ]);
  persistBatchSessionHelper([batchProd], cfg, '2026-11-15T10:00:00.000Z');
  const savedRec = createSavedRecord(batchProd);
  persistSavedProductsWithStatus([savedRec]);
  saveEnrichmentToCache({
    shopDetail: {
      shopId: 'shop_001',
      shopName: 'Glow Bangkok Official',
      sellerType: 'Retailer',
      revenueThb: 1200000,
      affiliateRevenueThb: 300000,
      selfAccountRevenueThb: 500000,
      shoppingMallRevenueThb: 400000,
      salesVolume: 5000,
      unitPriceThb: 299,
      creatorNumber: 35,
      productNumber: 18,
      videoNumber: 42,
      liveNumber: 5,
      dateRange: '30d',
      updatedAt: '2026-11-15T10:05:00.000Z',
    },
  });

  // Legacy Phase 2/3 keys
  const legacyLibProd = makeProduct(
    '1729333000000000001',
    'Legacy Library Product',
    289,
    '2026-11-16T09:00:00.000Z'
  );
  const legacyWsProd = makeProduct(
    '1729333000000000002',
    'Legacy Workspace Product',
    420,
    '2026-11-17T09:00:00.000Z'
  );
  storage.setItem(
    LEGACY_IMPORTED_LIBRARY_STORAGE_KEY,
    JSON.stringify({
      entries: [
        {
          canonicalProductId: legacyLibProd.id,
          importedAt: '2026-11-16T09:00:00.000Z',
          product: legacyLibProd,
          dataSource: 'kalodata-api',
          apiCallsMade: 1,
          estimatedCreditsCharged: 0.01,
        },
      ],
    })
  );
  storage.setItem(
    LEGACY_IMPORTED_WORKSPACE_STORAGE_KEY,
    JSON.stringify({
      canonicalProductId: legacyWsProd.id,
      importedAt: '2026-11-17T09:00:00.000Z',
      product: legacyWsProd,
      dataSource: 'existing-workspace',
      apiCallsMade: 0,
      estimatedCreditsCharged: 0,
    })
  );
  storage.setItem(LEGACY_SIMILAR_CACHE_STORAGE_KEY, JSON.stringify({ entries: {} }));

  // Quota safety check: if writing single history fails with QuotaExceededError, legacy keys MUST NOT be deleted
  storage.failWriteKeys.add(SINGLE_PRODUCT_HISTORY_STORAGE_KEY);
  const failedMigration = migrateLegacyImportedDataToSingleHistory();
  assert.equal(failedMigration.cleanedKeys.length, 0);
  assert.ok(storage.getItem(LEGACY_IMPORTED_LIBRARY_STORAGE_KEY) !== null);
  assert.ok(storage.getItem(LEGACY_IMPORTED_WORKSPACE_STORAGE_KEY) !== null);
  storage.failWriteKeys.delete(SINGLE_PRODUCT_HISTORY_STORAGE_KEY);

  // Normal migration run
  const migration = migrateLegacyImportedDataToSingleHistory();
  assert.equal(migration.migratedCount, 2);
  assert.equal(migration.cleanedKeys.length, 3);
  assert.equal(storage.getItem(LEGACY_IMPORTED_LIBRARY_STORAGE_KEY), null);
  assert.equal(storage.getItem(LEGACY_IMPORTED_WORKSPACE_STORAGE_KEY), null);
  assert.equal(storage.getItem(LEGACY_SIMILAR_CACHE_STORAGE_KEY), null);

  // Idempotent second run
  const secondRun = migrateLegacyImportedDataToSingleHistory();
  assert.equal(secondRun.migratedCount, 0);
  assert.equal(secondRun.cleanedKeys.length, 0);

  // Single history contains migrated items, normalized legacy source
  const singleLoaded = loadSingleProductHistory();
  assert.equal(singleLoaded.length, 2);
  assert.equal(singleLoaded[0].canonicalProductId, legacyWsProd.id);
  assert.equal(singleLoaded[0].dataSource, 'existing-local-record');
  assert.equal(singleLoaded[1].canonicalProductId, legacyLibProd.id);

  // Batch, Saved, Enrichment Cache completely untouched
  assert.ok(storage.getItem(RESEARCH_HISTORY_STORAGE_KEY) !== null);
  assert.ok(storage.getItem(LATEST_RESEARCH_SESSION_STORAGE_KEY) !== null);
  assert.ok(storage.getItem(SAVED_PRODUCTS_STORAGE_KEY) !== null);
  assert.ok(storage.getItem(ENRICHMENT_CACHE_STORAGE_KEY) !== null);
  assert.equal(loadResearchHistory().length, 1);
  assert.equal(loadSavedProducts().length, 1);
  assert.ok(loadEnrichmentCache().shops['shop_001']);
});

test('6. Single Product History enforces 100-item cap and survives Backup export -> validate -> restore', () => {
  setupStorage();

  let records = loadSingleProductHistory();
  for (let i = 1; i <= 108; i++) {
    const prod = makeProduct(
      `172966600000000${String(i).padStart(4, '0')}`,
      `Cap Item ${i}`,
      200 + i,
      new Date(Date.UTC(2026, 10, 1, 0, i)).toISOString()
    );
    records = upsertSingleProductHistoryRecord(
      records,
      createSingleProductHistoryRecord(makeExecuteResult(prod, 'kalodata-api'))
    );
  }
  assert.equal(records.length, SINGLE_PRODUCT_HISTORY_MAX_RECORDS);
  assert.equal(records[0].product.name, 'Cap Item 108');
  assert.equal(records[records.length - 1].product.name, 'Cap Item 9');
  assert.equal(persistSingleProductHistory(records).ok, true);

  // Backup export & restore verification
  const snapshot = buildSiamPickBackupSnapshot({
    includeSaved: true,
    includeHistory: true,
    includeDeepDive: true,
    includeLatestSession: true,
    includeCaches: true,
  });
  assert.equal(snapshot.backup.data.singleProductHistory?.length, 100);

  const parsed = parseAndValidateSiamPickBackup(snapshot.json);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  // Wipe and restore
  localStorage.clear();
  const restoreRes = restoreSiamPickBackup(parsed.backup, {
    mode: 'replace',
    scope: {
      includeSaved: true,
      includeHistory: true,
      includeDeepDive: true,
      includeLatestSession: true,
      includeCaches: true,
    },
  });
  assert.equal(restoreRes.ok, true);
  assert.equal((restoreRes.singleProductHistory ?? []).length, 100);
  assert.equal(loadSingleProductHistory().length, 100);
});

test('7. Structural check: redundant Phase 2/3 files & endpoints removed, Video Research & AI Strategy absent', () => {
  const root = process.cwd();
  const deletedFiles = [
    'src/components/ImportedProductWorkspace.tsx',
    'src/components/ImportedPhase3Workspace.tsx',
    'src/components/ImportedProductComparisonPanel.tsx',
    'src/components/SimilarProductFinderPanel.tsx',
    'src/utils/importedProductWorkspace.ts',
    'src/utils/importedPhase3.ts',
    'src/types/importedPhase3.ts',
    'server/similarProductService.ts',
    'tests/siampick.importedWorkspace.test.ts',
    'tests/siampick.phase3Workspace.test.ts',
  ];

  for (const rel of deletedFiles) {
    assert.equal(fs.existsSync(path.join(root, rel)), false, `${rel} must remain deleted`);
  }

  const serverSource = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
  assert.equal(serverSource.includes('/api/similar-products'), false);
  assert.equal(serverSource.includes('similarProductService'), false);
  assert.equal(serverSource.includes('/api/link-import/inspect'), true);
  assert.equal(serverSource.includes('/api/link-import/import'), true);
});
