import test from 'node:test';
import assert from 'node:assert/strict';

import type {
  AiProductAnalysis,
  ResearchConfig,
  ResearchHistoryRecord,
  ResearchProduct,
  SavedProductRecord,
  ScoringInputs,
  VideoContentIdea,
} from '../src/types/product.ts';
import type { DeepDiveHistoryRecord } from '../src/types/deepDive.ts';
import {
  buildSiamPickBackupSnapshot,
  getLocalBackupInventoryCounts,
  MAX_BACKUP_FILE_BYTES,
  parseAndValidateSiamPickBackup,
  restoreSiamPickBackup,
  SIAMPICK_BACKUP_FORMAT,
} from '../src/utils/backupStorage.ts';
import {
  createSavedRecord,
  loadSavedProducts,
  persistSavedProductsWithStatus,
} from '../src/utils/savedProductsStorage.ts';
import { resolveProductImageDisplayConfig } from '../src/utils/format.ts';
import { extractTikTokPdpImageUrlFromHtml } from '../server/imageRetriever.ts';
import {
  createResearchHistoryRecord,
  loadLatestResearchSession,
  loadResearchHistory,
  persistLatestResearchSession,
  persistResearchHistory,
} from '../src/utils/researchHistoryStorage.ts';
import {
  appendDeepDiveHistoryRecord,
  loadAllDeepDiveHistoryByProduct,
} from '../src/utils/deepDiveHistoryStorage.ts';
import {
  loadEnrichmentCache,
  saveEnrichmentToCache,
} from '../src/utils/enrichmentCache.ts';
import {
  loadAiAnalysisCacheMap,
  saveCachedAiAnalysis,
} from '../src/utils/aiAnalysisCache.ts';

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  public failAllWritesWithQuota = false;

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
    if (this.failAllWritesWithQuota) {
      const err = new Error('QuotaExceededError');
      err.name = 'QuotaExceededError';
      throw err;
    }
    this.store.set(key, value);
  }
}

const DEFAULT_SCORING_INPUTS: ScoringInputs = {
  demandSales: { rawStrength: 80, verification: 'verified', evidenceEn: 'OK', evidenceMy: 'OK' },
  commissionEarning: { rawStrength: 80, verification: 'verified', evidenceEn: 'OK', evidenceMy: 'OK' },
  aiCreative: { rawStrength: 80, verification: 'estimated', evidenceEn: 'OK', evidenceMy: 'OK' },
  reviewsQuality: { rawStrength: 75, verification: 'verified', evidenceEn: 'OK', evidenceMy: 'OK' },
  priceAppeal: { rawStrength: 80, verification: 'verified', evidenceEn: 'OK', evidenceMy: 'OK' },
  competitionOpportunity: { rawStrength: 70, verification: 'verified', evidenceEn: 'OK', evidenceMy: 'OK' },
  sellerReliability: { rawStrength: 80, verification: 'verified', evidenceEn: 'OK', evidenceMy: 'OK' },
};

const DEFAULT_VIDEO_IDEAS: [VideoContentIdea, VideoContentIdea, VideoContentIdea] = [
  { titleEn: 'Hook 1', titleMy: 'Hook 1', formatEn: '3D', formatMy: '3D', outlineEn: 'Demo', outlineMy: 'Demo' },
  { titleEn: 'Hook 2', titleMy: 'Hook 2', formatEn: '3D', formatMy: '3D', outlineEn: 'Demo', outlineMy: 'Demo' },
  { titleEn: 'Hook 3', titleMy: 'Hook 3', formatEn: '3D', formatMy: '3D', outlineEn: 'Demo', outlineMy: 'Demo' },
];

function makeProduct(id: string, name: string): ResearchProduct {
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
    priceThb: 299,
    priceStatus: 'verified',
    commissionRate: 15,
    commissionVerified: true,
    commissionStatus: 'verified',
    estimatedCommissionPerSaleThb: 44.85,
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
        url: 'https://www.kalodata.com/product/detail?id=' + id,
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
    kalodataMetrics: {
      productId: id,
      sellerId: 'shop_001',
      sellerName: 'Glow Bangkok Official',
      unitPriceThb: 299,
      salesVolume: 1200,
      revenueThb: 358800,
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
      researchMode: 'balanced',
      dateRange: '30d',
      detailEnriched: true,
      shopEnriched: false,
      reviewInsightEnriched: false,
    },
  };
}

function makeConfig(): ResearchConfig {
  return {
    market: 'Thailand TikTok Shop',
    category: 'cosmetics-beauty',
    selectedCategories: ['cosmetics-beauty'],
    researchMode: 'balanced',
    spendingLimitCredits: 10,
    priceLimit: 'unrestricted',
    strategyPreset: 'balanced',
    salesWeightPct: 50,
    quantity: 10,
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

test('Backup export -> parse -> restore preserves Saved Products, History, Deep Dive, Session, and Caches cleanly', () => {
  const storage = setupStorage();

  const p1 = makeProduct('1729485736201948571', 'UV Serum Sunscreen');
  const p2 = makeProduct('1729485736201948572', 'Velvet Matte Lip Tint');

  const savedRec: SavedProductRecord = createSavedRecord(p1);
  persistSavedProductsWithStatus([savedRec]);

  const histRec: ResearchHistoryRecord = createResearchHistoryRecord(
    {
      products: [p1, p2],
      researchedAt: '2026-11-20T10:00:00.000Z',
      requestedQuantity: 10,
      verifiedProductCount: 2,
      filteredOutCount: 0,
      groundingSources: [
        {
          title: 'Kalodata TH',
          url: 'https://www.kalodata.com/',
          domain: 'kalodata.com',
        },
      ],
      searchQueries: ['sunscreen'],
      config: makeConfig(),
    },
    makeConfig()
  );
  persistResearchHistory([histRec]);

  persistLatestResearchSession({
    products: [p1, p2],
    sessionMeta: {
      requestedQuantity: 10,
      verifiedProductCount: 2,
      filteredOutCount: 0,
    },
    lastCostSummary: null,
    researchSourceMode: 'kalodata-openapi',
    researchedAt: '2026-11-20T10:00:00.000Z',
    groundingSources: [],
    searchQueries: ['sunscreen'],
    activeHuntConfig: makeConfig(),
    rejectedIds: [],
  });

  const deepDiveRec: DeepDiveHistoryRecord = {
    id: 'ddh_test_1',
    schemaVersion: 1,
    storageKind: 'browser-local-storage',
    canonicalProductId: '1729485736201948571',
    productName: 'UV Serum Sunscreen',
    productNameMy: 'UV Serum Sunscreen',
    analyzedAt: '2026-11-20T11:00:00.000Z',
    analysisIds: ['product-intelligence'],
    runType: 'initial',
    overallStatus: 'completed',
    kalodataCreditsUsed: 0.1,
    kalodataUsdUsed: 0.01,
    kalodataApiCalls: 1,
    geminiApiCalls: 0,
    geminiTokenUsage: null,
    cacheReuseCount: 0,
    dataSourcesEn: ['Kalodata Product Detail'],
    dataSourcesMy: ['Kalodata Product Detail'],
    moduleEntries: [],
    slotsSnapshot: {},
  };
  appendDeepDiveHistoryRecord(deepDiveRec);

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
      updatedAt: '2026-11-20T10:30:00.000Z',
    },
  });

  const aiAnalysis: AiProductAnalysis = {
    schemaVersion: 1,
    canonicalProductId: '1729485736201948571',
    dataFingerprint: 'fp_test_1',
    source: 'gemini',
    modelUsed: 'gemini-4-hydrogen',
    analyzedAt: '2026-11-20T10:45:00.000Z',
    geminiFailed: false,
    overallDataConfidence: 'High',
    confidenceNoteEn: 'High confidence',
    confidenceNoteMy: 'ယုံကြည်မှုမြင့်',
    dataBasis: [],
    strengthsEn: ['High repeat demand'],
    strengthsMy: ['ပြန်ဝယ်နှုန်းမြင့်'],
    weaknessesEn: ['Moderate competition'],
    weaknessesMy: ['ပြိုင်ဆိုင်မှုအသင့်အတင့်'],
    salesAndRevenueEn: 'Solid 30d revenue',
    salesAndRevenueMy: 'ရက် ၃၀ ဝင်ငွေကောင်း',
    salesAndRevenueStatus: 'verified',
    growthPotentialEn: 'Growing +24%',
    growthPotentialMy: '+24% တိုးတက်နေသည်',
    growthPotentialStatus: 'verified',
    commissionPotentialEn: '15% verified',
    commissionPotentialMy: '15% အတည်ပြုပြီး',
    commissionPotentialStatus: 'verified',
    competitionAnalysisEn: '12 creators',
    competitionAnalysisMy: 'Creator ၁၂ ဦး',
    competitionStatus: 'verified',
    targetCustomerEn: 'Daily UV care buyers',
    targetCustomerMy: 'နေ့စဉ် UV ကာကွယ်သူများ',
    targetCustomerStatus: 'estimated',
    whyChooseEn: 'Strong unit economics',
    whyChooseMy: 'အမြတ်အစွန်းကောင်းသည်',
    risksAndDrawbacksEn: [],
    risksAndDrawbacksMy: [],
    aiContentSuitability: {
      adFormat: 'product-only-3d-commercial',
      suitabilityRating: 'High',
      status: 'verified',
      summaryEn: 'Clean bottle silhouette',
      summaryMy: '3D ရိုက်ကူးရန်သင့်တော်',
      creativeAnglesEn: ['Sweatproof texture test'],
      creativeAnglesMy: ['ချွေးခံနိုင်စမ်းသပ်မှု'],
      cautionsEn: [],
      cautionsMy: [],
    },
    finalRecommendation: {
      verdict: 'priority-test',
      headlineEn: 'Priority test product',
      headlineMy: 'ဦးစားပေးစမ်းသပ်သင့်',
      actionPlanEn: 'Request sample',
      actionPlanMy: 'Sample မှာယူပါ',
    },
  };
  saveCachedAiAnalysis(aiAnalysis);

  const inventory = getLocalBackupInventoryCounts();
  assert.equal(inventory.savedProducts, 1);
  assert.equal(inventory.researchHistorySessions, 1);
  assert.equal(inventory.deepDiveRecords, 1);
  assert.equal(inventory.cachedAiAnalyses, 1);

  const exported = buildSiamPickBackupSnapshot();
  assert.equal(exported.backup.format, SIAMPICK_BACKUP_FORMAT);
  assert.match(exported.filename, /^siampick-backup-\d{4}-\d{2}-\d{2}\.json$/);

  // Wipe browser storage completely (simulating new browser or cleared cache)
  storage.clear();
  assert.equal(loadSavedProducts().length, 0);
  assert.equal(loadResearchHistory().length, 0);

  const parsed = parseAndValidateSiamPickBackup(exported.json);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  assert.equal(parsed.preview.counts.savedProducts, 1);
  assert.equal(parsed.preview.counts.researchHistorySessions, 1);
  assert.equal(parsed.preview.counts.deepDiveRecords, 1);
  assert.equal(parsed.preview.hasLatestSession, true);

  const restored = restoreSiamPickBackup(parsed.backup, { mode: 'replace' });
  assert.equal(restored.ok, true);
  assert.equal(restored.savedRecords.length, 1);
  assert.equal(restored.researchHistory.length, 1);
  assert.equal(restored.deepDiveHistoryByProduct['1729485736201948571']?.length, 1);
  assert.equal(restored.latestResearchSession?.products.length, 2);

  assert.equal(loadSavedProducts().length, 1);
  assert.equal(loadResearchHistory().length, 1);
  assert.equal(loadAllDeepDiveHistoryByProduct()['1729485736201948571']?.length, 1);
  assert.equal(loadLatestResearchSession()?.products.length, 2);
  assert.ok(loadEnrichmentCache().shops['shop_001']);
  assert.ok(loadAiAnalysisCacheMap()['1729485736201948571']);
});

test('Merge mode preserves existing records and deduplicates overlapping Saved & History records', () => {
  setupStorage();

  const existingSaved = createSavedRecord(makeProduct('1001', 'Existing Product'));
  persistSavedProductsWithStatus([existingSaved]);

  const existingHistory = createResearchHistoryRecord(
    {
      products: [makeProduct('1001', 'Existing Product')],
      researchedAt: '2026-11-19T08:00:00.000Z',
      requestedQuantity: 10,
      verifiedProductCount: 1,
      filteredOutCount: 0,
      groundingSources: [],
      searchQueries: [],
      config: makeConfig(),
    },
    makeConfig()
  );
  persistResearchHistory([existingHistory]);

  // Construct backup containing BOTH overlapping item 1001 and brand-new item 2002
  const incomingSaved1 = createSavedRecord(makeProduct('1001', 'Existing Product'));
  const incomingSaved2 = createSavedRecord(makeProduct('2002', 'New Backup Product'));
  const incomingHistory2 = createResearchHistoryRecord(
    {
      products: [makeProduct('2002', 'New Backup Product')],
      researchedAt: '2026-11-18T08:00:00.000Z',
      requestedQuantity: 10,
      verifiedProductCount: 1,
      filteredOutCount: 0,
      groundingSources: [],
      searchQueries: [],
      config: makeConfig(),
    },
    makeConfig()
  );

  const rawBackupJson = JSON.stringify({
    format: SIAMPICK_BACKUP_FORMAT,
    schemaVersion: 1,
    app: 'SiamPick',
    exportedAt: '2026-11-20T00:00:00.000Z',
    counts: {},
    data: {
      savedProducts: [incomingSaved1, incomingSaved2],
      researchHistory: [existingHistory, incomingHistory2],
      deepDiveHistoryByProduct: {},
      latestResearchSession: null,
    },
  });

  const parsed = parseAndValidateSiamPickBackup(rawBackupJson);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const restored = restoreSiamPickBackup(parsed.backup, { mode: 'merge' });
  assert.equal(restored.ok, true);
  assert.equal(restored.appliedCounts.savedProductsAdded, 1);
  assert.equal(restored.appliedCounts.savedProductsTotal, 2);
  assert.equal(restored.appliedCounts.historyAdded, 1);
  assert.equal(restored.appliedCounts.historyTotal, 2);
});

test('Parser blocks invalid JSON, oversized payloads, analytics export JSONs, prototype pollution, and unsafe URLs', () => {
  setupStorage();

  assert.equal(parseAndValidateSiamPickBackup('').ok, false);
  assert.equal(parseAndValidateSiamPickBackup('{broken json').ok, false);
  assert.equal(parseAndValidateSiamPickBackup('x'.repeat(MAX_BACKUP_FILE_BYTES + 10)).ok, false);

  const analyticsExportRes = parseAndValidateSiamPickBackup(
    JSON.stringify({ app: 'SiamPick', items: [] })
  );
  assert.equal(analyticsExportRes.ok, false);

  // Untrusted JSON with prototype pollution key & javascript: XSS URLs
  const maliciousRaw = `{
    "format": "siampick-backup",
    "schemaVersion": 1,
    "app": "SiamPick",
    "exportedAt": "2026-11-20T00:00:00.000Z",
    "data": {
      "savedProducts": [
        {
          "id": "999",
          "savedAt": "2026-11-20T00:00:00.000Z",
          "researchDate": "2026-11-20T00:00:00.000Z",
          "sources": [{ "labelEn": "Bad", "labelMy": "Bad", "sourceType": "web", "url": "javascript:alert(1)", "verified": true }],
          "product": {
            "id": "999",
            "name": "Malicious Test Product",
            "nameMy": "Malicious Test Product",
            "category": "womens-fashion",
            "imageUrl": "javascript:alert(1)",
            "imageVerified": true,
            "sources": [{ "labelEn": "Bad", "labelMy": "Bad", "sourceType": "web", "url": "data:text/html,xss", "verified": true }]
          }
        }
      ],
      "researchHistory": [],
      "deepDiveHistoryByProduct": {
        "__proto__": [{ "id": "evil", "canonicalProductId": "__proto__", "analyzedAt": "2026-11-20", "analysisIds": [] }],
        "constructor": []
      },
      "latestResearchSession": null
    }
  }`;

  const parsed = parseAndValidateSiamPickBackup(maliciousRaw);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  assert.equal(parsed.backup.data.savedProducts.length, 1);
  const prod = parsed.backup.data.savedProducts[0].product;
  assert.equal(prod.imageUrl, null);
  assert.equal(prod.imageVerified, false);
  assert.equal(prod.sources[0].url, null);
  assert.equal(prod.sources[0].verified, false);
  assert.equal(parsed.backup.data.savedProducts[0].sources[0].url, null);
  assert.equal(Object.keys(parsed.backup.data.deepDiveHistoryByProduct).length, 0);
});

test('QuotaExceededError during restore keeps pre-existing Saved Products & History intact', () => {
  const storage = setupStorage();
  const initialSaved = createSavedRecord(makeProduct('7001', 'Original Product'));
  persistSavedProductsWithStatus([initialSaved]);

  const incomingBackup = buildSiamPickBackupSnapshot();
  incomingBackup.backup.data.savedProducts = [
    createSavedRecord(makeProduct('7002', 'Incoming Product')),
  ];

  // Simulate full browser localStorage on restore write
  storage.failAllWritesWithQuota = true;

  const result = restoreSiamPickBackup(incomingBackup.backup, { mode: 'replace' });
  assert.equal(result.ok, false);
  assert.ok(result.writeErrors.length > 0);
  assert.equal(result.writeErrors[0].quotaExceeded, true);
  assert.equal(result.savedRecords.length, 1);
  assert.equal(result.savedRecords[0].product.id, '7001');

  // Verify underlying storage remained untouched
  storage.failAllWritesWithQuota = false;
  assert.equal(loadSavedProducts()[0].product.id, '7001');
});

test('Backup export and restore preserve /api/image-proxy imageUrl and recover missing imageUrl from imageOriginUrl', () => {
  const storage = setupStorage();

  const proxyUrl =
    '/api/image-proxy?url=' + encodeURIComponent('https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/sample.jpg');
  const originUrl = 'https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/sample.jpg';

  const proxiedProd = makeProduct('8001', 'Proxied Image Product');
  proxiedProd.imageUrl = proxyUrl;
  proxiedProd.imageOriginUrl = originUrl;
  proxiedProd.imageVerified = true;

  persistSavedProductsWithStatus([createSavedRecord(proxiedProd)]);
  const exported = buildSiamPickBackupSnapshot();
  assert.equal(exported.backup.data.savedProducts[0].product.imageUrl, proxyUrl);
  assert.equal(exported.backup.data.savedProducts[0].product.imageVerified, true);

  storage.clear();
  const parsed = parseAndValidateSiamPickBackup(exported.json);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const restored = restoreSiamPickBackup(parsed.backup, { mode: 'replace' });
  assert.equal(restored.savedRecords[0].product.imageUrl, proxyUrl);
  assert.equal(restored.savedRecords[0].product.imageOriginUrl, originUrl);
  assert.equal(restored.savedRecords[0].product.imageVerified, true);

  // Also test recovery when an older backup had imageUrl stripped to null but imageOriginUrl intact
  const olderBackupJson = JSON.stringify({
    format: SIAMPICK_BACKUP_FORMAT,
    schemaVersion: 1,
    app: 'SiamPick',
    exportedAt: '2026-11-21T00:00:00.000Z',
    data: {
      savedProducts: [
        {
          id: '8002',
          savedAt: '2026-11-21T00:00:00.000Z',
          researchDate: '2026-11-21T00:00:00.000Z',
          sources: [],
          product: {
            ...proxiedProd,
            id: '8002',
            imageUrl: null,
            imageOriginUrl: originUrl,
            imageVerified: false,
          },
        },
      ],
      researchHistory: [],
      deepDiveHistoryByProduct: {},
      latestResearchSession: null,
    },
  });

  const recoveredParsed = parseAndValidateSiamPickBackup(olderBackupJson);
  assert.equal(recoveredParsed.ok, true);
  if (!recoveredParsed.ok) return;
  assert.equal(recoveredParsed.backup.data.savedProducts[0].product.imageUrl, proxyUrl);
  assert.equal(recoveredParsed.backup.data.savedProducts[0].product.imageVerified, true);

  // Reject unsafe inner target inside /api/image-proxy?url=javascript:...
  const craftedProxyJson = JSON.stringify({
    format: SIAMPICK_BACKUP_FORMAT,
    schemaVersion: 1,
    app: 'SiamPick',
    exportedAt: '2026-11-21T00:00:00.000Z',
    data: {
      savedProducts: [
        {
          id: '8003',
          savedAt: '2026-11-21T00:00:00.000Z',
          researchDate: '2026-11-21T00:00:00.000Z',
          sources: [],
          product: {
            ...proxiedProd,
            id: '8003',
            imageUrl: '/api/image-proxy?url=javascript:alert(1)',
            imageOriginUrl: null,
            imageVerified: true,
          },
        },
      ],
      researchHistory: [],
      deepDiveHistoryByProduct: {},
      latestResearchSession: null,
    },
  });

  const craftedParsed = parseAndValidateSiamPickBackup(craftedProxyJson);
  assert.equal(craftedParsed.ok, true);
  if (!craftedParsed.ok) return;
  assert.equal(craftedParsed.backup.data.savedProducts[0].product.imageUrl, null);
  assert.equal(craftedParsed.backup.data.savedProducts[0].product.imageVerified, false);
});

test('Restored products self-heal broken localStorage images and fall back to /api/product-image/:id at 0 credits', () => {
  const storage = setupStorage();
  const originUrl = 'https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/sample.webp';

  // 1. Pre-existing localStorage saved record where imageUrl was previously wiped but imageOriginUrl exists
  const brokenSaved = createSavedRecord(makeProduct('1734487708082145250', 'Jeans Product'));
  brokenSaved.product.imageUrl = null;
  brokenSaved.product.imageOriginUrl = originUrl;
  brokenSaved.product.imageVerified = false;
  persistSavedProductsWithStatus([brokenSaved]);

  const loadedSaved = loadSavedProducts();
  assert.equal(
    loadedSaved[0].product.imageUrl,
    `/api/image-proxy?url=${encodeURIComponent(originUrl)}`
  );
  assert.equal(loadedSaved[0].product.imageVerified, true);

  // 2. Display config attaches productId to proxy URLs for transparent server recovery
  const cfgWithProxy = resolveProductImageDisplayConfig(loadedSaved[0].product);
  assert.equal(cfgWithProxy.canRender, true);
  assert.equal(
    cfgWithProxy.src,
    `/api/image-proxy?url=${encodeURIComponent(originUrl)}&productId=1734487708082145250`
  );
  assert.equal(cfgWithProxy.fallbackSrc, originUrl);
  assert.equal(cfgWithProxy.productId, '1734487708082145250');

  // 3. Even if BOTH imageUrl and imageOriginUrl are null in an old backup, valid TikTok IDs recover via /api/product-image/:id
  const completelyStripped = makeProduct('kalodata-th-1734487708082145250', 'Stripped Backup Product');
  completelyStripped.imageUrl = null;
  completelyStripped.imageOriginUrl = null;
  completelyStripped.imageVerified = false;
  const cfgStripped = resolveProductImageDisplayConfig(completelyStripped);
  assert.equal(cfgStripped.canRender, true);
  assert.equal(cfgStripped.src, '/api/product-image/1734487708082145250');

  // 4. Non-TikTok fake ID with no valid image still shows unavailable safely
  const noIdProduct = makeProduct('999', 'No Image Product');
  noIdProduct.imageUrl = 'javascript:alert(1)';
  noIdProduct.imageOriginUrl = null;
  noIdProduct.imageVerified = false;
  const cfgNone = resolveProductImageDisplayConfig(noIdProduct);
  assert.equal(cfgNone.canRender, false);
  assert.equal(cfgNone.src, null);

  // 5. HTML og:image entity decoding preserves signed TikTok CDN query parameters
  const html =
    '<meta property="og:image" content="https://p16-oec-sg.ibyteimg.com/img.webp?dr=15582&amp;t=555f072d&amp;from=3376456192" />';
  assert.equal(
    extractTikTokPdpImageUrlFromHtml(html),
    'https://p16-oec-sg.ibyteimg.com/img.webp?dr=15582&t=555f072d&from=3376456192'
  );
  void storage;
});

