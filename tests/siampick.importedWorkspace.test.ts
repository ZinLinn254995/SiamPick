import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type {
  LinkImportExecuteResponse,
  LinkImportInspectResponse,
  ResearchProduct,
} from '../src/types/product.ts';
import {
  buildImportedWorkspaceContextFromExecute,
  buildImportedWorkspaceContextFromExisting,
  deriveImportedProductOverview,
  IMPORTED_WORKSPACE_STORAGE_KEY,
  loadImportedWorkspaceContext,
  persistImportedWorkspaceContext,
  syncImportedWorkspaceProduct,
} from '../src/utils/importedProductWorkspace.ts';
import { SAVED_PRODUCTS_STORAGE_KEY } from '../src/utils/savedProductsStorage.ts';
import {
  LATEST_RESEARCH_SESSION_STORAGE_KEY,
  RESEARCH_HISTORY_STORAGE_KEY,
} from '../src/utils/researchHistoryStorage.ts';
import { ENRICHMENT_CACHE_STORAGE_KEY } from '../src/utils/enrichmentCache.ts';
import { buildDeepDiveTargetContext } from '../src/utils/deepDiveRegistry.ts';
import {
  estimateDeepDiveExecutionCost,
  runDeepDiveModules,
} from '../src/utils/deepDiveEngine.ts';
import { TRANSLATIONS } from '../src/i18n/translations.ts';

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

function makeRichLinkImportedProduct(overrides: Partial<ResearchProduct> = {}): ResearchProduct {
  const defaultScoringInputs = {
    demandSales: { rawStrength: 88, verification: 'verified' as const, evidenceEn: '4,250 units', evidenceMy: '၄,၂၅၀ ခု' },
    commissionEarning: { rawStrength: 82, verification: 'verified' as const, evidenceEn: '14%', evidenceMy: '၁၄%' },
    aiCreative: { rawStrength: 80, verification: 'estimated' as const, evidenceEn: 'High visual demo potential', evidenceMy: 'ဗီဒီယိုပြသရန် သင့်တော်' },
    reviewsQuality: { rawStrength: 90, verification: 'verified' as const, evidenceEn: '4.8/5 (640)', evidenceMy: '၄.၈/၅ (၆၄၀)' },
    priceAppeal: { rawStrength: 84, verification: 'verified' as const, evidenceEn: '฿289', evidenceMy: '฿၂၈၉' },
    competitionOpportunity: { rawStrength: 76, verification: 'verified' as const, evidenceEn: '38 creators', evidenceMy: 'Creator ၃၈ ဦး' },
    sellerReliability: { rawStrength: 70, verification: 'unverified' as const, evidenceEn: 'Brand Store', evidenceMy: 'Brand Store' },
  };

  return {
    id: '1731661332013680750',
    name: 'Thai Glow Vitamin C Brightening Serum 30ml',
    nameMy: 'Thai Glow ဗီတာမင် C မျက်နှာကြည် Serum 30ml',
    category: 'cosmetics-beauty',
    subCategory: 'Skincare & Serum',
    subCategoryMy: 'အသားအရေထိန်း Serum',
    shopName: 'SiamGlow Official TH',
    sellerStatus: 'verified',
    dispatchHub: 'Bangkok',
    researchedAt: '2026-11-21T10:00:00.000Z',
    researchMode: 'fast',
    researchDepthTag: 'detail-enriched',
    imageUrl: 'https://cdn.kalodata.com/test/1731661332013680750.jpg',
    imageVerified: true,
    imageSourceNoteEn: 'Verified Kalodata product image',
    imageSourceNoteMy: 'Kalodata မှ အတည်ပြုထားသော ပုံ',
    priceThb: 289,
    priceStatus: 'verified',
    commissionRate: 14,
    commissionVerified: true,
    commissionStatus: 'verified',
    estimatedCommissionPerSaleThb: 40,
    commissionPerSaleStatus: 'verified',
    commissionNoteEn: 'Verified Kalodata affiliate commission rate.',
    commissionNoteMy: 'Kalodata မှ အတည်ပြုထားသော Affiliate ကော်မရှင်နှုန်းဖြစ်ပါသည်။',
    reviewCount: 640,
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
    opportunityScore: 84,
    confidenceLevel: 'High',
    scoringInputs: defaultScoringInputs,
    whyChooseEn: 'Verified strong sales and 14% affiliate commission.',
    whyChooseMy: 'ရောင်းအားကောင်းပြီး ၁၄% ကော်မရှင် ရရှိသည်။',
    demandEvidenceEn: ['4,250 monthly units sold'],
    demandEvidenceMy: ['တစ်လ ရောင်းအား ၄,၂၅၀ ခု'],
    salesPotentialEn: 'Strong short-video demand.',
    salesPotentialMy: 'Video မှတစ်ဆင့် ရောင်းအားကောင်းသည်။',
    reviewStrengthsEn: ['Brightening results'],
    reviewStrengthsMy: ['အသားအရေ ကြည်လင်စေသည်'],
    customerComplaintsEn: [],
    customerComplaintsMy: [],
    competitionDetailEn: '38 creators promoting.',
    competitionDetailMy: 'Creator ၃၈ ဦး ကြော်ငြာနေသည်။',
    sellerReliabilityEn: 'Verified seller ID.',
    sellerReliabilityMy: 'ဆိုင် ID အတည်ပြုပြီး။',
    generalRisksEn: [],
    generalRisksMy: [],
    aiVideoDetailEn: 'Ideal for 15s morning skincare routine video.',
    aiVideoDetailMy: '၁၅ စက္ကန့် Skincare Routine ဗီဒီယိုအတွက် သင့်တော်သည်။',
    videoIdeas: [
      {
        titleEn: 'Morning Vitamin C Test',
        titleMy: 'မနက်ခင်း Vitamin C စမ်းသပ်ချက်',
        formatEn: 'Product-in-hand Demo',
        formatMy: 'လက်တွေ့သရုပ်ပြ Video',
        outlineEn: '3-second before & after glow check, tap yellow basket.',
        outlineMy: '၃ စက္ကန့်အတွင်း အသားအရေ ကြည်လင်မှုပြသပြီး အဝါရောင်ခြင်းတောင်းကို နှိပ်ပါ။',
      },
      {
        titleEn: 'Texture & Absorption',
        titleMy: 'Serum အသားဝင်မြန်ပုံ',
        formatEn: 'Close-up Macro Shot',
        formatMy: 'အနီးကပ် Macro ရိုက်ချက်',
        outlineEn: 'Close-up serum texture drop, Thailand local dispatch.',
        outlineMy: 'အနီးကပ် Serum Texture ပြသပြီး ထိုင်း Stock မှာယူနိုင်ကြောင်း ပြောပါ။',
      },
      {
        titleEn: 'Daily Skincare Routine',
        titleMy: 'နေ့စဉ် Skincare Routine',
        formatEn: 'Routine Walkthrough',
        formatMy: 'နေ့စဉ်သုံးနည်းလမ်းညွှန်',
        outlineEn: 'Pair with sunscreen for morning routine and shop now.',
        outlineMy: 'နေရောင်ကာခရင်မ်နှင့် တွဲသုံးနည်းပြသပြီး ယခုဝယ်ယူရန် ဖိတ်ခေါ်ပါ။',
      },
    ],
    confidenceDetailEn: 'Verified directly from Kalodata Product Detail API.',
    confidenceDetailMy: 'Kalodata Product Detail API မှ တိုက်ရိုက်အတည်ပြုပြီး။',
    missingDataEn: [],
    missingDataMy: [],
    kalodataMetrics: {
      productId: '1731661332013680750',
      dateRange: 'Last 30 days',
      researchMode: 'fast',
      detailEnriched: true,
      shopEnriched: false,
      reviewInsightEnriched: false,
      unitPriceThb: 289,
      minPriceThb: 249,
      maxPriceThb: 399,
      salesVolume: 4250,
      revenueThb: 1228250,
      revenueGrowthRate: 0.32,
      commissionRatePct: 14,
      videoRevenueThb: 790000,
      liveRevenueThb: 210000,
      showcaseRevenueThb: 228250,
      shoppingMallRevenueThb: 0,
      creatorNumber: 38,
      videoNumber: 124,
      liveNumber: 9,
      deliveryType: 'Local TH Dispatch',
      productReviewCount: 640,
      launchDate: '2026-06-01',
      sellerId: '749102938475610',
      sellerName: 'SiamGlow Official TH',
      skuCount: 4,
      shopSellerType: 'Brand Store',
      priCategory: null,
      secCategory: null,
      terCategory: null,
      categoryIdsRequested: [],
    },
    sources: [
      {
        labelEn: 'TikTok Shop Thailand PDP',
        labelMy: 'TikTok Shop Thailand PDP',
        sourceType: 'tiktok-shop',
        url: 'https://shop.tiktok.com/th/pdp/thai-glow-serum/1731661332013680750',
        verified: true,
      },
      {
        labelEn: 'Kalodata Product Detail API',
        labelMy: 'Kalodata Product Detail API',
        sourceType: 'kalodata-api',
        url: 'https://www.kalodata.com/product/detail?id=1731661332013680750',
        verified: true,
      },
    ],
    ...overrides,
  };
}

function makeExecuteResponse(
  product: ResearchProduct,
  overrides: Partial<LinkImportExecuteResponse> = {}
): LinkImportExecuteResponse {
  return {
    ok: true,
    product,
    evaluation: {} as LinkImportExecuteResponse['evaluation'],
    productDetailRecord: null,
    shopDetailRecord: null,
    reviewInsightRecord: null,
    canonicalUrl: 'https://shop.tiktok.com/th/pdp/thai-glow-serum/1731661332013680750',
    slugResolved: true,
    resolvedUrl: 'https://shop.tiktok.com/th/pdp/thai-glow-serum/1731661332013680750',
    redirectHops: [
      'https://vt.tiktok.com/ZSYabc123/',
      'https://shop.tiktok.com/th/pdp/thai-glow-serum/1731661332013680750',
    ],
    dataSource: 'kalodata-api',
    apiCallsMade: 1,
    estimatedCreditsCharged: 0.1,
    creditsBalanceBefore: 10,
    creditsBalanceAfter: 9.9,
    alreadyExistedInWorkspace: false,
    costSummary: {
      researchMode: 'fast',
      estimatedCredits: 0.1,
      estimatedUsd: 0.002,
      plannedApiCalls: 1,
      actualApiCalls: 1,
      rankApiCalls: 0,
      videoRankApiCalls: 0,
      productDetailApiCalls: 1,
      shopDetailApiCalls: 0,
      commentInsightApiCalls: 0,
      deepDiveCount: 1,
      includeReviewInsights: false,
      geminiAnalysisApplied: false,
      actualCredits: 0.1,
      actualUsd: 0.002,
      balanceBefore: 10,
      balanceAfter: 9.9,
      spendingLimitCredits: 5,
      bothCategoryMode: 'combined',
      categoryIds: [],
    },
    ...overrides,
  };
}

test('Imported Product Overview consolidates image, name, price, shop, product ID, sales, commission, provenance, and verification status accurately', () => {
  const product = makeRichLinkImportedProduct();
  const executeResult = makeExecuteResponse(product);
  const context = buildImportedWorkspaceContextFromExecute(executeResult);

  assert.equal(context.canonicalProductId, '1731661332013680750');
  assert.equal(context.dataSource, 'kalodata-api');
  assert.equal(context.apiCallsMade, 1);
  assert.equal(context.estimatedCreditsCharged, 0.1);
  assert.equal(context.redirectHops.length, 2);

  const overview = deriveImportedProductOverview(context, { salesWeightPct: 50 });

  // Core Identity & Image
  assert.equal(overview.numericProductId, '1731661332013680750');
  assert.equal(overview.productName, product.name);
  assert.equal(overview.imageConfig.canRender, true);
  assert.equal(overview.imageStatus, 'verified');
  assert.equal(
    overview.tiktokShopUrl,
    'https://shop.tiktok.com/th/pdp/thai-glow-serum/1731661332013680750'
  );
  assert.equal(
    overview.kalodataUrl,
    'https://www.kalodata.com/product/detail?id=1731661332013680750'
  );

  // Price + SKU Range
  assert.equal(overview.priceThb, 289);
  assert.equal(overview.minPriceThb, 249);
  assert.equal(overview.maxPriceThb, 399);
  assert.equal(overview.skuCount, 4);
  assert.equal(overview.priceStatus, 'verified');

  // Shop & Dispatch
  assert.equal(overview.shopAvailable, true);
  assert.equal(overview.shopName, 'SiamGlow Official TH');
  assert.equal(overview.sellerId, '749102938475610');
  assert.equal(overview.shopSellerType, 'Brand Store');
  assert.equal(overview.deliveryType, 'Local TH Dispatch');

  // Sales & Commission
  assert.equal(overview.salesVolume, 4250);
  assert.equal(overview.revenueThb, 1228250);
  assert.equal(overview.revenueGrowthRate, 0.32);
  assert.equal(overview.videoRevenueThb, 790000);
  assert.equal(overview.liveRevenueThb, 210000);
  assert.equal(overview.showcaseRevenueThb, 228250);
  assert.equal(overview.commissionRate, 14);
  assert.equal(overview.commissionVerified, true);
  assert.equal(overview.estimatedCommissionPerSaleThb, 40);

  // Provenance & Verification (productDetail fields verified; shop GMV stays unverified until shopEnriched)
  assert.equal(overview.dataSource, 'kalodata-api');
  assert.equal(overview.verificationRows.length, 7);
  const richRowMap = new Map(overview.verificationRows.map((row) => [row.key, row.status]));
  assert.equal(richRowMap.get('price'), 'verified');
  assert.equal(richRowMap.get('commission'), 'verified');
  assert.equal(richRowMap.get('sales'), 'verified');
  assert.equal(richRowMap.get('shop'), 'unverified');
  assert.equal(richRowMap.get('competition'), 'verified');
  assert.equal(richRowMap.get('reviews'), 'verified');
  assert.equal(richRowMap.get('image'), 'verified');
  assert.equal(overview.unavailableItemsEn.length, 0);
  assert.equal(overview.unavailableItemsMy.length, 0);
});

test('Imported Product Overview keeps missing metrics strictly null and discloses unavailable fields honestly', () => {
  const base = makeRichLinkImportedProduct();
  const sparseProduct = makeRichLinkImportedProduct({
    commissionRate: null,
    commissionVerified: false,
    estimatedCommissionPerSaleThb: null,
    commissionStatus: 'unavailable',
    salesEvidenceStatus: 'unavailable',
    customerRating: null,
    reviewCount: null,
    reviewCountStatus: 'unavailable',
    customerRatingStatus: 'unavailable',
    feedbackStatus: 'unavailable',
    shopName: '',
    dispatchHub: '',
    sellerStatus: 'unavailable',
    imageUrl: null,
    imageVerified: false,
    kalodataMetrics: {
      ...base.kalodataMetrics!,
      salesVolume: null,
      revenueThb: null,
      revenueGrowthRate: null,
      videoRevenueThb: null,
      liveRevenueThb: null,
      showcaseRevenueThb: null,
      commissionRatePct: null,
      productReviewCount: null,
      sellerName: null,
      sellerId: null,
      shopSellerType: null,
      deliveryType: null,
    },
  });

  const executeResult = makeExecuteResponse(sparseProduct, {
    dataSource: 'server-cache',
    apiCallsMade: 0,
    estimatedCreditsCharged: 0,
  });
  const context = buildImportedWorkspaceContextFromExecute(executeResult);
  const overview = deriveImportedProductOverview(context, { salesWeightPct: 50 });

  assert.equal(overview.dataSource, 'server-cache');
  assert.equal(overview.salesVolume, null);
  assert.equal(overview.revenueThb, null);
  assert.equal(overview.commissionRate, null);
  assert.equal(overview.estimatedCommissionPerSaleThb, null);
  assert.equal(overview.customerRating, null);
  assert.equal(overview.reviewCount, null);
  assert.equal(overview.shopAvailable, false);
  assert.equal(overview.imageStatus, 'unavailable');

  const rowMap = new Map(overview.verificationRows.map((r) => [r.key, r.status]));
  assert.equal(rowMap.get('commission'), 'unavailable');
  assert.equal(rowMap.get('sales'), 'unavailable');
  assert.equal(rowMap.get('shop'), 'unavailable');
  assert.equal(rowMap.get('reviews'), 'unavailable');
  assert.equal(rowMap.get('image'), 'unavailable');
  assert.equal(rowMap.get('price'), 'verified');

  assert.ok(overview.unavailableItemsEn.length >= 4);
  assert.ok(overview.unavailableItemsMy.length >= 4);
});

test('Imported Workspace supports existing workspace duplicate context and isolates storage from Saved, History, Cache, and Latest Session', () => {
  const { store } = installMemoryStorage();

  // Pre-populate unrelated SiamPick localStorage keys to verify zero regression / zero mutation
  store.set(SAVED_PRODUCTS_STORAGE_KEY, JSON.stringify([{ id: 'saved-keep' }]));
  store.set(RESEARCH_HISTORY_STORAGE_KEY, JSON.stringify([{ id: 'history-keep' }]));
  store.set(ENRICHMENT_CACHE_STORAGE_KEY, JSON.stringify({ products: { '111': {} } }));
  store.set(LATEST_RESEARCH_SESSION_STORAGE_KEY, JSON.stringify({ products: [{ id: 'latest-keep' }] }));

  const savedSnapshotBefore = store.get(SAVED_PRODUCTS_STORAGE_KEY);
  const historySnapshotBefore = store.get(RESEARCH_HISTORY_STORAGE_KEY);
  const cacheSnapshotBefore = store.get(ENRICHMENT_CACHE_STORAGE_KEY);
  const sessionSnapshotBefore = store.get(LATEST_RESEARCH_SESSION_STORAGE_KEY);

  const existingProduct = makeRichLinkImportedProduct({
    name: 'Existing Cached Cleanser',
  });
  const inspectResult: LinkImportInspectResponse = {
    ok: true,
    classification: 'valid-product',
    productId: '1731661332013680750',
    canonicalProductId: '1731661332013680750',
    extractedInputUrl: 'https://vt.tiktok.com/ZSYabc123/',
    resolvedUrl: 'https://shop.tiktok.com/th/pdp/existing-cleanser/1731661332013680750',
    canonicalUrl: 'https://shop.tiktok.com/th/pdp/existing-cleanser/1731661332013680750',
    slugResolved: true,
    redirectHops: ['https://vt.tiktok.com/ZSYabc123/'],
    linkType: 'short-link',
    previewTitle: 'Existing Cached Cleanser',
    previewImageUrl: null,
    alreadyInWorkspace: true,
    alreadyInWorkspaceSources: ['saved', 'history'],
    cachedInServer: false,
    cachedInClient: false,
    requiresPaidApiCall: false,
    requiresConfirmation: false,
    estimatedCredits: 0,
    budgetSummary: null,
    quotaPaused: false,
    messageEn: 'Already in workspace.',
    messageMy: 'Workspace ထဲတွင် ရှိပြီးသားဖြစ်ပါသည်။',
  };

  const context = buildImportedWorkspaceContextFromExisting(existingProduct, { inspectResult });
  assert.equal(context.dataSource, 'existing-workspace');
  assert.equal(context.alreadyExistedInWorkspace, true);
  assert.deepEqual(context.existingSources, ['saved', 'history']);

  persistImportedWorkspaceContext(context);
  const reloaded = loadImportedWorkspaceContext();
  assert.ok(reloaded);
  assert.equal(reloaded.canonicalProductId, '1731661332013680750');
  assert.equal(reloaded.product.name, 'Existing Cached Cleanser');
  assert.equal(store.has(IMPORTED_WORKSPACE_STORAGE_KEY), true);

  // Sync updated enrichment cleanly without affecting other storage keys
  const enrichedCopy = makeRichLinkImportedProduct({
    name: 'Existing Cached Cleanser',
    kalodataMetrics: {
      ...existingProduct.kalodataMetrics!,
      reviewInsightEnriched: true,
    },
  });
  const synced = syncImportedWorkspaceProduct(reloaded, enrichedCopy);
  persistImportedWorkspaceContext(synced);
  const reloadedAfterSync = loadImportedWorkspaceContext();
  assert.equal(reloadedAfterSync?.product.kalodataMetrics?.reviewInsightEnriched, true);

  // Clear imported workspace -> other storage keys stay byte-for-byte identical
  persistImportedWorkspaceContext(null);
  assert.equal(loadImportedWorkspaceContext(), null);
  assert.equal(store.get(SAVED_PRODUCTS_STORAGE_KEY), savedSnapshotBefore);
  assert.equal(store.get(RESEARCH_HISTORY_STORAGE_KEY), historySnapshotBefore);
  assert.equal(store.get(ENRICHMENT_CACHE_STORAGE_KEY), cacheSnapshotBefore);
  assert.equal(store.get(LATEST_RESEARCH_SESSION_STORAGE_KEY), sessionSnapshotBefore);
});

test('Direct Deep Dive integration reuses link-imported detail at 0 cr, preserves 8-module cost & confirmation gates, and does not mutate workspace product', async () => {
  installMemoryStorage();

  const product = makeRichLinkImportedProduct();
  const context = buildImportedWorkspaceContextFromExecute(makeExecuteResponse(product));
  const targetContext = buildDeepDiveTargetContext(
    context.product,
    'hunting',
    'fast',
    context.importedAt
  );

  // Modules #1–#5 + #7 should reuse existing link-imported productDetail at 0 Kalodata credits
  const nonReviewEstimate = estimateDeepDiveExecutionCost(targetContext.product, [
    'product-intelligence',
    'sales-market-intelligence',
    'affiliate-profit-analysis',
    'creator-competition-analysis',
    'video-intelligence',
    'market-competitor-comparison',
  ]);
  assert.equal(nonReviewEstimate.estimatedCredits, 0);
  assert.equal(nonReviewEstimate.plannedKalodataApiCalls, 0);
  assert.equal(nonReviewEstimate.requiresExplicitConfirmation, false);

  // Adding Module #6 (Customer Review Intelligence) requires opt-in 1.0 cr + explicit confirmation
  const withReviewEstimate = estimateDeepDiveExecutionCost(targetContext.product, [
    'product-intelligence',
    'customer-review-intelligence',
  ]);
  assert.equal(withReviewEstimate.estimatedCredits, 1);
  assert.equal(withReviewEstimate.plannedKalodataApiCalls, 1);
  assert.equal(withReviewEstimate.requiresExplicitConfirmation, true);

  // Paid module blocked without explicit user confirmation
  const blockedOutcome = await runDeepDiveModules({
    product: targetContext.product,
    analysisIds: ['customer-review-intelligence'],
    spendingLimitCredits: 5,
    requireExplicitConfirmation: true,
    userConfirmedPaidExecution: false,
  });
  assert.equal(blockedOutcome.blockedReason, 'CONFIRMATION_REQUIRED');
  assert.equal(blockedOutcome.totalKalodataApiCalls, 0);

  // Local + cached modules execute cleanly at 0 credits without mutating context.product
  const beforeSerialized = JSON.stringify(context.product);
  const localOutcome = await runDeepDiveModules({
    product: targetContext.product,
    analysisIds: ['product-intelligence', 'affiliate-profit-analysis'],
    spendingLimitCredits: 5,
    requireExplicitConfirmation: true,
    userConfirmedPaidExecution: false,
  });
  assert.equal(localOutcome.blockedReason, null);
  assert.equal(localOutcome.totalCreditsUsed, 0);
  assert.equal(localOutcome.slots['product-intelligence']?.status, 'completed');
  assert.equal(localOutcome.slots['affiliate-profit-analysis']?.status, 'completed');
  assert.equal(JSON.stringify(context.product), beforeSerialized);
});

test('Phase 2 Imported Product Workspace exposes bilingual translations and excludes Product Comparison / Similar Product Finder', () => {
  assert.ok(TRANSLATIONS.en.importedWorkspaceHeading.length > 0);
  assert.ok(TRANSLATIONS.my.importedWorkspaceHeading.length > 0);
  assert.ok(TRANSLATIONS.en.importedWorkspaceDeepDiveCta.length > 0);
  assert.ok(TRANSLATIONS.my.importedWorkspaceDeepDiveCta.length > 0);
  assert.ok(TRANSLATIONS.en.importedWorkspaceBackFromDeepDiveLabel.length > 0);
  assert.ok(TRANSLATIONS.my.importedWorkspaceBackFromDeepDiveLabel.length > 0);

  const componentPath = path.resolve('src/components/ImportedProductWorkspace.tsx');
  const componentSource = fs.readFileSync(componentPath, 'utf8');

  // Verify core Phase 2 requirements are rendered
  assert.match(componentSource, /deriveImportedProductOverview/);
  assert.match(componentSource, /ProductImage/);
  assert.match(componentSource, /onOpenDeepDive/);
  assert.match(componentSource, /verificationRows/);
  assert.match(componentSource, /unavailableItems/);

  // Verify out-of-scope features from later phases are NOT included
  assert.doesNotMatch(componentSource, /ProductComparisonModal/i);
  assert.doesNotMatch(componentSource, /SimilarProduct/i);
  assert.doesNotMatch(componentSource, /findSimilar/i);
  assert.doesNotMatch(componentSource, /toggleCompare/i);
});
