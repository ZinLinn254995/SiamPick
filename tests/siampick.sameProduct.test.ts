import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ResearchProduct } from '../src/types/product.ts';
import {
  applyEnrichedProductToSameCandidate,
  buildDeterministicKeywordSuggestions,
  computeEarlyMoverAssessment,
  computeTitleSimilarityPct,
  extractDeterministicSearchKeyword,
  sortSameProductCandidates,
} from '../src/utils/sameProductMatcher.ts';
import {
  clearSameProductSearchCache,
  SameProductApiError,
  searchSameProductEarlyMoverLinks,
  type VisualMatchVerdictItem,
} from '../server/sameProductService.ts';
import { PersistentBudgetLedger } from '../server/budgetLedgerService.ts';
import { isProxyableImageUrl } from '../server/imageRetriever.ts';

function makeSourceProduct(overrides?: Partial<ResearchProduct>): ResearchProduct {
  return {
    id: 'kalodata-th-1731661332013680750',
    name: '[ส่งฟรี] เซรั่มวิตามินซี Hya Glow 30ml ของแท้ 100% พร้อมส่ง 🔥',
    nameMy: '[ส่งฟรี] เซรั่มวิตามินซี Hya Glow 30ml ของแท้ 100%',
    category: 'cosmetics-beauty',
    subCategory: 'Skincare · Serum',
    subCategoryMy: 'Skincare · Serum',
    brand: 'HyaGlow',
    shopName: 'Original Official Shop TH',
    dispatchHub: 'Bangkok / TH',
    priceThb: 199,
    commissionRate: 12,
    commissionVerified: true,
    estimatedCommissionPerSaleThb: 24,
    opportunityScore: 84,
    demandLevel: 'High',
    competitionLevel: 'High',
    sellerReliabilityLevel: 'Reliable',
    aiVideoSuitability: 'High',
    confidenceLevel: 'High',
    scoringInputs: {
      demandSales: { rawStrength: 88, verification: 'verified', evidenceEn: 'High sales', evidenceMy: 'High sales' },
      commissionEarning: { rawStrength: 82, verification: 'verified', evidenceEn: '12%', evidenceMy: '12%' },
      aiCreative: { rawStrength: 80, verification: 'estimated', evidenceEn: 'Video driven', evidenceMy: 'Video driven' },
      reviewsQuality: { rawStrength: 85, verification: 'verified', evidenceEn: '4.8', evidenceMy: '4.8' },
      priceAppeal: { rawStrength: 86, verification: 'verified', evidenceEn: '199 THB', evidenceMy: '199 THB' },
      competitionOpportunity: { rawStrength: 45, verification: 'verified', evidenceEn: '140 creators', evidenceMy: '140 creators' },
      sellerReliability: { rawStrength: 90, verification: 'verified', evidenceEn: 'BRAND', evidenceMy: 'BRAND' },
    },
    imageUrl: 'https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/source-serum.jpeg',
    imageOriginUrl: 'https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/source-serum.jpeg',
    imageVerified: true,
    imageSourceNoteEn: 'Verified',
    imageSourceNoteMy: 'Verified',
    whyChooseEn: 'Winning serum',
    whyChooseMy: 'Winning serum',
    demandEvidenceEn: ['High sales'],
    demandEvidenceMy: ['High sales'],
    salesPotentialEn: 'Strong',
    salesPotentialMy: 'Strong',
    commissionNoteEn: '12%',
    commissionNoteMy: '12%',
    reviewCount: 420,
    customerRating: 4.8,
    reviewStrengthsEn: [],
    reviewStrengthsMy: [],
    customerComplaintsEn: [],
    customerComplaintsMy: [],
    productQualityEvidenceEn: 'Good',
    productQualityEvidenceMy: 'Good',
    competitionDetailEn: '140 creators',
    competitionDetailMy: '140 creators',
    sellerReliabilityEn: 'Verified',
    sellerReliabilityMy: 'Verified',
    generalRisksEn: [],
    generalRisksMy: [],
    aiVideoDetailEn: 'Strong video sales',
    aiVideoDetailMy: 'Strong video sales',
    videoIdeas: [
      { titleEn: 'Hook 1', titleMy: 'Hook 1', formatEn: 'Demo', formatMy: 'Demo', outlineEn: 'Show result', outlineMy: 'Show result' },
      { titleEn: 'Hook 2', titleMy: 'Hook 2', formatEn: 'Review', formatMy: 'Review', outlineEn: 'Before after', outlineMy: 'Before after' },
      { titleEn: 'Hook 3', titleMy: 'Hook 3', formatEn: 'POV', formatMy: 'POV', outlineEn: 'Daily routine', outlineMy: 'Daily routine' },
    ],
    confidenceDetailEn: 'High',
    confidenceDetailMy: 'High',
    missingDataEn: [],
    missingDataMy: [],
    sources: [],
    kalodataMetrics: {
      productId: '1731661332013680750',
      categoryIdsRequested: ['601450'],
      priCategory: { category_id: '601450', category_name: 'Beauty & Personal Care' },
      secCategory: null,
      terCategory: null,
      unitPriceThb: 199,
      commissionRatePct: 12,
      salesVolume: 3500,
      revenueThb: 696500,
      revenueGrowthRate: 45,
      videoRevenueThb: 500000,
      liveRevenueThb: 120000,
      showcaseRevenueThb: 76500,
      shoppingMallRevenueThb: null,
      creatorNumber: 140,
      videoNumber: 210,
      liveNumber: 12,
      sellerId: '749500001111',
      sellerName: 'Original Official Shop TH',
      shopSellerType: 'BRAND',
      shopRevenueThb: 2500000,
      shopSalesVolume: 12000,
      skuCount: 3,
      launchDate: '2025-09-01',
      deliveryType: 'TH',
      productReviewCount: 420,
      dateRange: 'last30Day',
      detailEnriched: true,
      shopEnriched: true,
      reviewInsightEnriched: false,
      lastEnrichedAt: '2026-11-20T00:00:00.000Z',
    },
    ...overrides,
  };
}

function makeTestLedger(): PersistentBudgetLedger {
  const uniqueFile = path.join(
    os.tmpdir(),
    `siampick-same-product-test-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`
  );
  return new PersistentBudgetLedger({ sqlitePath: uniqueFile, hardCapCredits: 10 });
}

test('extractDeterministicSearchKeyword strips Thai/English promo clutter and keeps core product terms', () => {
  const prod = makeSourceProduct();
  const kw = extractDeterministicSearchKeyword(prod);
  assert.ok(!kw.includes('ส่งฟรี'), 'should strip Thai free shipping promo');
  assert.ok(!kw.includes('พร้อมส่ง'), 'should strip ready stock promo');
  assert.ok(!kw.includes('🔥'), 'should strip emojis');
  assert.ok(kw.toLowerCase().includes('hyaglow') || kw.includes('เซรั่มวิตามินซี'));

  const bundle = buildDeterministicKeywordSuggestions(prod);
  assert.ok(bundle.suggestions.length >= 1);
  assert.equal(bundle.primaryKeyword, bundle.suggestions[0]);
});

test('computeTitleSimilarityPct scores Thai + English identical products high and unrelated items low', () => {
  const src = '[ส่งฟรี] เซรั่มวิตามินซี Hya Glow 30ml ของแท้';
  const same = 'เซรั่มวิตามินซี Hya Glow 30ml ขวดสีส้ม';
  const diff = 'กระเป๋าสะพายข้างผู้หญิง หนัง PU สีดำ';

  const sameScore = computeTitleSimilarityPct(src, same);
  const diffScore = computeTitleSimilarityPct(src, diff);

  assert.ok(sameScore >= 55, `Expected high Thai/English similarity, got ${sameScore}`);
  assert.ok(diffScore < 20, `Expected low similarity for unrelated item, got ${diffScore}`);
});

test('computeEarlyMoverAssessment rewards low creator count, video GMV gap, newer launch, and price parity', () => {
  const early = computeEarlyMoverAssessment({
    source: {
      priceThb: 199,
      commissionRate: 12,
      salesVolume: 3500,
      revenueThb: 696500,
      videoRevenueThb: 500000,
      creatorNumber: 140,
      launchDate: '2025-09-01',
    },
    candidate: {
      priceThb: 189,
      commissionRate: 14,
      salesVolume: 85,
      revenueThb: 16065,
      videoRevenueThb: 15000,
      revenueGrowthRate: 42,
      creatorNumber: 5,
      launchDate: '2026-10-25',
    },
    nowMs: Date.parse('2026-11-22T00:00:00.000Z'),
  });

  assert.equal(early.earlyMoverBadge, 'early-mover');
  assert.equal(early.priceDeltaThb, -10);
  assert.equal(early.commissionDeltaPct, 2);
  assert.ok(early.earlyMoverScore >= 80, `Expected high early-mover score, got ${early.earlyMoverScore}`);
  assert.ok(early.earlyMoverSignalsEn.some((s) => s.includes('5 creators')));

  const crowded = computeEarlyMoverAssessment({
    source: {
      priceThb: 199,
      commissionRate: 12,
      salesVolume: 3500,
      revenueThb: 696500,
      videoRevenueThb: 500000,
      creatorNumber: 140,
      launchDate: '2025-09-01',
    },
    candidate: {
      priceThb: 229,
      commissionRate: 8,
      salesVolume: 2000,
      revenueThb: 458000,
      videoRevenueThb: 450000,
      revenueGrowthRate: -5,
      creatorNumber: 185,
      launchDate: '2025-08-01',
    },
    nowMs: Date.parse('2026-11-22T00:00:00.000Z'),
  });

  assert.equal(crowded.earlyMoverBadge, 'saturated');
  assert.ok(crowded.earlyMoverScore < early.earlyMoverScore);
});

test('searchSameProductEarlyMoverLinks enforces confirmation, filters same shop & visually different items, resolves TH links, caches at 0 cr, and does not mutate source product', async () => {
  clearSameProductSearchCache();
  const ledger = makeTestLedger();
  const source = makeSourceProduct();
  const sourceSnapshot = JSON.stringify(source);

  // 1. Must block unconfirmed paid execution
  await assert.rejects(
    () =>
      searchSameProductEarlyMoverLinks({
        product: source,
        keyword: 'เซรั่มวิตามินซี Hya Glow',
        userConfirmedPaidExecution: false,
        testOverrides: { budgetLedger: ledger, budgetScopeKey: 'test-scope-1' },
      }),
    (err: unknown) => err instanceof SameProductApiError && err.code === 'CONFIRMATION_REQUIRED'
  );

  let rankCalls = 0;
  const mockRankItems: Record<string, unknown>[] = [
    // Excluded: exact same product ID
    {
      product_id: '1731661332013680750',
      seller_id: '749500001111',
      seller_name: 'Original Official Shop TH',
      product_name: 'เซรั่มวิตามินซี Hya Glow 30ml',
      unit_price: 199,
      commission_rate: 0.12,
      sales_volumn: 3500,
      revenue: 696500,
      video_revenue: 500000,
      product_image: 'https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/source-serum.jpeg',
    },
    // Excluded: different product ID but SAME original shop ID
    {
      product_id: '1731661332013680999',
      seller_id: '749500001111',
      seller_name: 'Original Official Shop TH',
      product_name: 'เซรั่มวิตามินซี Hya Glow 30ml Pack',
      unit_price: 199,
      commission_rate: 0.12,
      sales_volumn: 120,
      revenue: 23880,
      video_revenue: 1000,
      product_image: 'https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/same-shop.jpeg',
    },
    // Excluded: price far outside ±35% tolerance band
    {
      product_id: '1731661332013680888',
      seller_id: '749500002222',
      seller_name: 'Overpriced Reseller TH',
      product_name: 'เซรั่มวิตามินซี Hya Glow 30ml',
      unit_price: 450,
      commission_rate: 0.15,
      sales_volumn: 50,
      revenue: 22500,
      video_revenue: 1000,
      product_image: 'https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/overpriced.jpeg',
    },
    // Excluded by Gemini Vision: physically different item
    {
      product_id: '1731661332013680777',
      seller_id: '749500003333',
      seller_name: 'Other Beauty Shop TH',
      product_name: 'เซรั่มวิตามินซี Hya Glow โฟมล้างหน้า',
      unit_price: 185,
      commission_rate: 0.14,
      sales_volumn: 200,
      revenue: 37000,
      video_revenue: 5000,
      product_image: 'https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/different-item.jpeg',
    },
    // Surviving Close Variant (pack/color variant) — omits master_image_url to test live PDP recovery!
    {
      product_id: '1731661332013680666',
      seller_id: '749500004444',
      seller_name: 'Glow Depot BKK',
      product_name: 'เซรั่มวิตามินซี Hya Glow 30ml สูตรสีชมพู',
      unit_price: 195,
      commission_rate: 0.13,
      sales_volumn: 140,
      revenue: 27300,
      video_revenue: 4000,
      launch_date: '2026-10-15',
    },
    // Surviving EXACT SAME PRODUCT + Early-Mover signals! Uses Kalodata's real `master_image_url` field.
    {
      product_id: '1731661332013680555',
      seller_id: '749500005555',
      seller_name: 'Bangkok Skincare Direct',
      product_name: 'เซรั่มวิตามินซี Hya Glow 30ml ส่งไวจากไทย',
      unit_price: 189,
      commission_rate: 0.14,
      sales_volumn: 90,
      revenue: 17010,
      video_revenue: 3000,
      revenue_growth_rate: 65,
      launch_date: '2026-11-01',
      master_image_url: 'https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/exact-same.jpeg',
    },
  ];

  const mockVerdicts = new Map<string, VisualMatchVerdictItem>([
    [
      '1731661332013680777',
      {
        candidateId: '1731661332013680777',
        matchTier: 'different',
        confidence: 94,
        reasonEn: 'Cleansing foam tube instead of serum dropper bottle.',
        reasonMy: 'မျက်နှာသစ်ဆေးဘူးဖြစ်၍ မူလ Serum ပုလင်းနှင့် မတူပါ',
      },
    ],
    [
      '1731661332013680666',
      {
        candidateId: '1731661332013680666',
        matchTier: 'close-variant',
        confidence: 82,
        reasonEn: 'Same bottle shape in pink edition.',
        reasonMy: 'ပုလင်းပုံစံတူသော်လည်း ပန်းရောင်สูตรကွဲ',
      },
    ],
    [
      '1731661332013680555',
      {
        candidateId: '1731661332013680555',
        matchTier: 'exact-same',
        confidence: 97,
        reasonEn: 'Identical 30ml Hya Glow serum bottle and label.',
        reasonMy: 'မူလ Hya Glow 30ml ပုလင်းနှင့် ချွတ်စွပ်တူညီသည်',
      },
    ],
  ]);

  let capturedVisionCandidates: Array<{ candidateId: string; imageUrl: string | null }> = [];
  const res = await searchSameProductEarlyMoverLinks({
    product: source,
    keyword: 'เซรั่มวิตามินซี Hya Glow',
    priceTolerancePct: 35,
    includeCloseVariants: true,
    includeZeroSales: false,
    enableVisualVerification: true,
    spendingLimitCredits: 0.5,
    userConfirmedPaidExecution: true,
    testOverrides: {
      budgetLedger: ledger,
      budgetScopeKey: 'test-scope-1',
      fetchCreditBalance: async () => ({ ok: true, balance: 8 }),
      fetchProductRank: async () => {
        rankCalls += 1;
        return { ok: true, httpStatus: 200, items: mockRankItems };
      },
      resolveLiveProductImage: async (pid) =>
        pid === '1731661332013680666'
          ? 'https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/recovered-variant.jpeg'
          : null,
      verifyVisualMatches: async ({ candidates }) => {
        capturedVisionCandidates = candidates.map((c) => ({
          candidateId: c.candidateId,
          imageUrl: c.imageUrl,
        }));
        return {
          status: 'verified',
          noteEn: 'Verified 3 candidates',
          noteMy: 'Candidate 3 ခု စစ်ပြီး',
          verdicts: mockVerdicts,
        };
      },
      resolveTikTokUrlsBatch: async (ids) =>
        new Map(ids.map((id) => [id, `https://shop.tiktok.com/th/pdp/hya-glow-serum/${id}`])),
    },
  });

  assert.equal(rankCalls, 1, 'should execute exactly 1 product/rank call');
  assert.equal(res.creditsSpent, 0.1);
  assert.equal(res.fromCache, false);
  assert.equal(res.excludedSameProductOrShopCount, 2);
  assert.equal(res.excludedPriceOrSalesCount, 1);
  assert.equal(res.excludedDifferentProductCount, 1);
  assert.equal(res.candidates.length, 2);

  // Verify Kalodata master_image_url AND 0-credit live PDP fallback images were passed to Gemini Vision & returned
  const visionExact = capturedVisionCandidates.find((c) => c.candidateId === '1731661332013680555');
  const visionVariant = capturedVisionCandidates.find((c) => c.candidateId === '1731661332013680666');
  assert.equal(
    visionExact?.imageUrl,
    'https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/exact-same.jpeg',
    'master_image_url must be extracted and forwarded to Gemini Vision'
  );
  assert.equal(
    visionVariant?.imageUrl,
    'https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/recovered-variant.jpeg',
    'missing rank image must be recovered via live PDP lookup before Gemini Vision'
  );

  // Exact Same Product MUST be ranked #1 above Close Variant
  assert.equal(res.candidates[0].productId, '1731661332013680555');
  assert.equal(res.candidates[0].matchTier, 'exact-same');
  assert.equal(res.candidates[0].earlyMoverBadge, 'early-mover');
  assert.equal(
    res.candidates[0].imageOriginUrl,
    'https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/exact-same.jpeg'
  );
  assert.ok(
    res.candidates[0].imageUrl?.startsWith('/api/image-proxy?url=') &&
      res.candidates[0].imageUrl.includes('productId=1731661332013680555'),
    'Found shop candidate must receive proxied imageUrl with productId fallback param'
  );
  assert.equal(
    res.candidates[0].tiktokShopUrl,
    'https://shop.tiktok.com/th/pdp/hya-glow-serum/1731661332013680555'
  );
  assert.equal(res.candidates[1].productId, '1731661332013680666');
  assert.equal(res.candidates[1].matchTier, 'close-variant');
  assert.equal(
    res.candidates[1].imageOriginUrl,
    'https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/recovered-variant.jpeg'
  );

  // Repeat call must hit 24h cache at 0 credits without calling Kalodata again!
  const cachedRes = await searchSameProductEarlyMoverLinks({
    product: source,
    keyword: 'เซรั่มวิตามินซี Hya Glow',
    priceTolerancePct: 35,
    includeCloseVariants: false, // Even filtering close variants works at 0 cr!
    includeZeroSales: false,
    enableVisualVerification: true,
    userConfirmedPaidExecution: false, // Cached response needs 0 paid calls!
    testOverrides: {
      budgetLedger: ledger,
      budgetScopeKey: 'test-scope-1',
    },
  });

  assert.equal(rankCalls, 1, 'cache hit must not call Kalodata again');
  assert.equal(cachedRes.fromCache, true);
  assert.equal(cachedRes.creditsSpent, 0);
  assert.equal(cachedRes.candidates.length, 1);
  assert.equal(cachedRes.candidates[0].matchTier, 'exact-same');

  // Stage 2 enrichment update updates creatorNumber & re-sorts cleanly
  const enrichedCandidateProduct: ResearchProduct = {
    ...res.candidates[0].researchProduct,
    kalodataMetrics: {
      ...res.candidates[0].researchProduct.kalodataMetrics!,
      creatorNumber: 4,
      videoNumber: 6,
      detailEnriched: true,
    },
  };
  const updatedCand = applyEnrichedProductToSameCandidate(
    source,
    res.candidates[0],
    enrichedCandidateProduct
  );
  assert.equal(updatedCand.creatorNumber, 4);
  assert.equal(updatedCand.stage2Verified, true);
  assert.equal(updatedCand.earlyMoverBadge, 'early-mover');

  // Non-mutation guarantee: original source product must be 100% untouched
  assert.equal(JSON.stringify(source), sourceSnapshot);
});

test('SSRF protection rejects internal/metadata URLs for visual inspection', () => {
  assert.equal(isProxyableImageUrl('http://169.254.169.254/latest/meta-data/'), false);
  assert.equal(isProxyableImageUrl('http://127.0.0.1:3000/secret.png'), false);
  assert.equal(isProxyableImageUrl('http://localhost/image.jpg'), false);
  assert.equal(isProxyableImageUrl('https://evil.example.com/photo.jpg'), false);
  assert.equal(
    isProxyableImageUrl('https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/product.jpeg'),
    true
  );
});

test('sortSameProductCandidates always keeps exact-same above close-variant regardless of earlyMoverScore', () => {
  const baseCand = {
    shopId: '1',
    shopName: 'Shop',
    title: 'Item',
    imageUrl: null,
    imageOriginUrl: null,
    tiktokShopUrl: 'https://shop.tiktok.com/th/pdp/product/1731661332013680001',
    priceThb: 199,
    commissionRate: 12,
    estimatedCommissionPerSaleThb: 24,
    salesVolume: 50,
    revenueThb: 9950,
    videoRevenueThb: 500,
    liveRevenueThb: 0,
    revenueGrowthRate: 10,
    launchDate: null,
    creatorNumber: null,
    videoNumber: null,
    shopSellerType: null,
    shopRevenueThb: null,
    stage2Verified: false,
    shopTrustVerified: false,
    visualMatchConfidence: 90,
    visualMatchReasonEn: 'Match',
    visualMatchReasonMy: 'Match',
    titleSimilarityPct: 80,
    priceDeltaThb: 0,
    priceDeltaPct: 0,
    commissionDeltaPct: 0,
    videoGmvRatioVsOriginal: 0.1,
    earlyMoverSignalsEn: [],
    earlyMoverSignalsMy: [],
    researchProduct: makeSourceProduct(),
  };

  const sorted = sortSameProductCandidates([
    {
      ...baseCand,
      productId: 'variant-high',
      matchTier: 'close-variant',
      earlyMoverScore: 98,
      earlyMoverBadge: 'early-mover',
    },
    {
      ...baseCand,
      productId: 'exact-normal',
      matchTier: 'exact-same',
      earlyMoverScore: 65,
      earlyMoverBadge: 'low-video-gap',
    },
  ]);

  assert.equal(sorted[0].productId, 'exact-normal');
  assert.equal(sorted[1].productId, 'variant-high');
});

test('searchSameProductEarlyMoverLinks fails closed (503) on distributed Upstash HTTP 401 and switches to persistent SQLite WAL on single-instance hosts', async () => {
  clearSameProductSearchCache();
  let capturedAuthHeader = '';
  let rankCalls = 0;

  // 1. Distributed / multi-instance mode: MUST strictly fail-closed (503, 0 Kalodata calls)
  const distributedFailingLedger = new PersistentBudgetLedger({
    upstashRestUrl: '"https://mock-upstash.example.test/"',
    upstashRestToken: '"Bearer my-upstash-token-123"',
    requireDistributedStore: true,
    fetchFn: async (_input, init) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      capturedAuthHeader = headers.Authorization ?? headers.authorization ?? '';
      return new Response(JSON.stringify({ error: 'WRONGPASS unauthorized' }), { status: 401 });
    },
  });

  const source = makeSourceProduct();

  await assert.rejects(
    () =>
      searchSameProductEarlyMoverLinks({
        product: source,
        keyword: 'เซรั่มวิตามินซี',
        userConfirmedPaidExecution: true,
        testOverrides: {
          budgetLedger: distributedFailingLedger,
          budgetScopeKey: 'test-scope-401-dist',
          fetchProductRank: async () => {
            rankCalls += 1;
            return { ok: true, httpStatus: 200, items: [] };
          },
        },
      }),
    (err: unknown) =>
      err instanceof SameProductApiError &&
      err.status === 503 &&
      err.code === 'BUDGET_STORAGE_UNAVAILABLE' &&
      err.message.includes('HTTP 401')
  );

  assert.equal(capturedAuthHeader, 'Bearer my-upstash-token-123');
  assert.equal(rankCalls, 0, 'Must abort fail-closed with 0 Kalodata API calls in distributed mode');

  // 2. Single-instance mode: stale initial Upstash 401 switches atomically to persistent local SQLite WAL
  const tempSqlitePath = path.join(
    os.tmpdir(),
    `siampick-same-401-fallback-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`
  );
  const singleInstanceLedger = new PersistentBudgetLedger({
    upstashRestUrl: 'https://mock-upstash.example.test/',
    upstashRestToken: 'stale-revoked-token',
    requireDistributedStore: false,
    sqlitePath: tempSqlitePath,
    fetchFn: async () =>
      new Response(JSON.stringify({ error: 'WRONGPASS unauthorized' }), { status: 401 }),
  });

  try {
    const res = await searchSameProductEarlyMoverLinks({
      product: source,
      keyword: 'เซรั่มวิตามินซี fallback',
      userConfirmedPaidExecution: true,
      enableVisualVerification: false,
      testOverrides: {
        budgetLedger: singleInstanceLedger,
        budgetScopeKey: 'test-scope-401-single',
        fetchCreditBalance: async () => ({ ok: true, balance: 5 }),
        fetchProductRank: async () => {
          rankCalls += 1;
          return { ok: true, httpStatus: 200, items: [] };
        },
      },
    });
    assert.equal(res.ok, true);
    assert.equal(rankCalls, 1);
    assert.equal(singleInstanceLedger.getBackendType(), 'sqlite-wal');
    const snap = await singleInstanceLedger.getScopeSnapshot('test-scope-401-single');
    assert.equal(snap.backend, 'sqlite-wal');
    assert.equal(snap.spentCredits, 0.1);
  } finally {
    singleInstanceLedger.close();
    try {
      fs.rmSync(tempSqlitePath, { force: true });
      fs.rmSync(`${tempSqlitePath}-wal`, { force: true });
      fs.rmSync(`${tempSqlitePath}-shm`, { force: true });
    } catch {
      // ignore temp cleanup errors
    }
  }
});

