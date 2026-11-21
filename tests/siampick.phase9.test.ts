import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyzeProductReviewsForMyanmar,
  buildMyanmarVideoLanguageAnalysis,
  clearMyanmarLanguageDetectionCache,
  detectMyanmarInSingleReview,
  detectMyanmarInVideoCandidate,
  detectMyanmarLanguageForProduct,
  detectMyanmarLanguageSignals,
  extractRawMyanmarTextCandidates,
  MARKET_SCOPE_NOTE_EN,
  MARKET_SCOPE_NOTE_MY,
  MIN_MYANMAR_REVIEW_LETTERS,
  VIDEO_MARKET_SCOPE_NOTE_EN,
  VIDEO_MARKET_SCOPE_NOTE_MY,
} from '../src/utils/myanmarLanguageDetector.ts';
import {
  buildKalodataExecutionPlan,
  clampMyanmarReviewScanLimit,
  clampMyanmarVideoScanPages,
  DEFAULT_MYANMAR_REVIEW_SCAN_LIMIT,
  DEFAULT_MYANMAR_VIDEO_SCAN_PAGES,
} from '../src/utils/kalodataPricing.ts';
import {
  countActiveFilters,
  DEFAULT_PRODUCT_FILTERS,
  filterProducts,
} from '../src/utils/productAnalytics.ts';
import {
  buildStructuredReviewInsight,
  mergeEnrichmentIntoProduct,
} from '../src/utils/enrichmentPlanner.ts';
import { evaluateProductBatch, evaluateProductOpportunity } from '../src/utils/scoring.ts';
import {
  parseKalodataCommentInsight,
  parseKalodataVideoRankItem,
} from '../server/kalodataAnalysis.ts';
import { ResearchApiError, runThailandProductResearch } from '../server/researchService.ts';
import {
  clearServerEnrichmentCache,
  setServerCachedProductDetail,
  setServerCachedReviewInsight,
} from '../server/enrichmentService.ts';
import type { ResearchProduct } from '../src/types/product.ts';

function makeMockRankItem(overrides: Record<string, unknown>) {
  return {
    product_id: '1729400000001',
    product_name: 'ครีมกันแดด สูตรบางเบา SPF50+ PA++++ ส่งจากไทย',
    unit_price: 259,
    revenue: 185000,
    sales_volumn: 720,
    revenue_growth_rate: 18.4,
    commission_rate: 0.12,
    live_revenue: 45000,
    video_revenue: 110000,
    showcase_revenue: 30000,
    seller_id: '74910001',
    seller_name: 'Bangkok Glow Official TH',
    sku_count: 3,
    pri_category: { category_id: '601450', category_name: 'Beauty & Personal Care' },
    sec_category: { category_id: '601455', category_name: 'Skincare' },
    ter_category: null,
    ...overrides,
  };
}

function makeBaseProduct(id: string, name: string): ResearchProduct {
  return {
    id,
    name,
    nameMy: name,
    category: 'cosmetics-beauty',
    subCategory: 'Skincare',
    subCategoryMy: 'Skincare',
    shopName: 'Bangkok Glow TH',
    dispatchHub: 'Thailand (TH)',
    imageUrl: null,
    imageVerified: false,
    imageSourceNoteEn: 'Test fixture',
    imageSourceNoteMy: 'Test fixture',
    priceThb: 259,
    priceStatus: 'verified',
    commissionRate: 12,
    commissionVerified: true,
    commissionStatus: 'verified',
    estimatedCommissionPerSaleThb: 31,
    commissionPerSaleStatus: 'verified',
    commissionNoteEn: '12%',
    commissionNoteMy: '12%',
    demandLevel: 'High',
    competitionLevel: 'Moderate',
    aiVideoSuitability: 'High',
    sellerReliabilityLevel: 'Reliable',
    opportunityScore: 76,
    confidenceLevel: 'Medium',
    kalodataMetrics: {
      productId: id,
      dateRange: 'last7Day',
      unitPriceThb: 259,
      salesVolume: 720,
      revenueThb: 185000,
      revenueGrowthRate: 18.4,
      commissionRatePct: 12,
      liveRevenueThb: 45000,
      videoRevenueThb: 110000,
      showcaseRevenueThb: 30000,
      launchDate: null,
      sellerId: '74910001',
      sellerName: 'Bangkok Glow TH',
      skuCount: 3,
      priCategory: { category_id: '601450', category_name: 'Beauty & Personal Care' },
      secCategory: null,
      terCategory: null,
      categoryIdsRequested: ['601450'],
    },
    scoringInputs: {
      demandSales: { rawStrength: 80, verification: 'verified', evidenceEn: '', evidenceMy: '' },
      commissionEarning: { rawStrength: 82, verification: 'verified', evidenceEn: '', evidenceMy: '' },
      aiCreative: { rawStrength: 80, verification: 'verified', evidenceEn: '', evidenceMy: '' },
      reviewsQuality: { rawStrength: 0, verification: 'unavailable', evidenceEn: '', evidenceMy: '' },
      priceAppeal: { rawStrength: 70, verification: 'verified', evidenceEn: '', evidenceMy: '' },
      competitionOpportunity: { rawStrength: 0, verification: 'unavailable', evidenceEn: '', evidenceMy: '' },
      sellerReliability: { rawStrength: 70, verification: 'verified', evidenceEn: '', evidenceMy: '' },
    },
    whyChooseEn: 'Test',
    whyChooseMy: 'Test',
    demandEvidenceEn: [],
    demandEvidenceMy: [],
    salesPotentialEn: 'Test',
    salesPotentialMy: 'Test',
    reviewStrengthsEn: [],
    reviewStrengthsMy: [],
    customerComplaintsEn: [],
    customerComplaintsMy: [],
    competitionDetailEn: 'Unavailable',
    competitionDetailMy: 'Unavailable',
    sellerReliabilityEn: 'Test',
    sellerReliabilityMy: 'Test',
    generalRisksEn: [],
    generalRisksMy: [],
    aiVideoDetailEn: 'Test',
    aiVideoDetailMy: 'Test',
    videoIdeas: [
      { titleEn: 'a', titleMy: 'a', formatEn: 'a', formatMy: 'a', outlineEn: 'a', outlineMy: 'a' },
      { titleEn: 'b', titleMy: 'b', formatEn: 'b', formatMy: 'b', outlineEn: 'b', outlineMy: 'b' },
      { titleEn: 'c', titleMy: 'c', formatEn: 'c', formatMy: 'c', outlineEn: 'c', outlineMy: 'c' },
    ],
    sources: [],
    confidenceDetailEn: 'Test',
    confidenceDetailMy: 'Test',
    missingDataEn: [],
    missingDataMy: [],
  };
}

test('1. Single review detection: Myanmar Unicode & Zawgyi match cleanly; pure Thai/English rejected', () => {
  const unicodeRes = detectMyanmarInSingleReview('ပစ္စည်းအရမ်းကောင်းပါတယ် ပို့တာလည်းမြန်တယ်');
  assert.equal(unicodeRes.matched, true);
  assert.equal(unicodeRes.matchType, 'myanmar-script');
  assert.equal(unicodeRes.isMixedThaiBurmese, false);
  assert.equal(unicodeRes.tooShort, false);
  assert.ok(unicodeRes.myanmarLetterCount >= MIN_MYANMAR_REVIEW_LETTERS);

  const zawgyiRes = detectMyanmarInSingleReview('ေရႊျမန္မာ သနပ္ခါး အရမ္းေကာင္းတယ္');
  assert.equal(zawgyiRes.matched, true);
  assert.equal(zawgyiRes.matchType, 'zawgyi-script');
  assert.equal(zawgyiRes.tooShort, false);

  const thaiRes = detectMyanmarInSingleReview('ส่งไวมาก เนื้อครีมบางเบา ไม่เหนียวเหนอะหนะ ชอบมากครับ');
  assert.equal(thaiRes.matched, false);
  assert.equal(thaiRes.myanmarLetterCount, 0);

  const englishRes = detectMyanmarInSingleReview('Fast delivery in Bangkok, texture feels smooth.');
  assert.equal(englishRes.matched, false);
  assert.equal(englishRes.myanmarLetterCount, 0);
});

test('2. Too-short / ambiguous review text is strictly rejected (never falsely matches)', () => {
  const samples = ['က', 'ဟာ', '၁၂၃၄၅', '...', 'ok 1', '👍🔥', 'ဒီ'];
  for (const text of samples) {
    const res = detectMyanmarInSingleReview(text);
    assert.equal(res.matched, false, `Expected "${text}" not to match`);
  }

  // Review containing only 2 Myanmar letters ("ဟာ") is flagged tooShort
  const shortMyanmar = detectMyanmarInSingleReview('ဟာ');
  assert.equal(shortMyanmar.matched, false);
  assert.equal(shortMyanmar.tooShort, true);
  assert.ok(shortMyanmar.myanmarLetterCount < MIN_MYANMAR_REVIEW_LETTERS);

  // Product with only too-short/ambiguous + Thai reviews -> checked-no-match with skippedTooShortCount = 2 ('ဟာ' and digits-only '၁၂၃၄')
  const reviewAnalysis = analyzeProductReviewsForMyanmar([
    { text: 'ဟာ' },
    { text: 'ส่งไวมากครับ' },
    { text: '၁၂၃၄' },
  ]);
  assert.equal(reviewAnalysis.reviewStatus, 'checked-no-match');
  assert.equal(reviewAnalysis.matchedReviewCount, 0);
  assert.equal(reviewAnalysis.totalReviewsChecked, 3);
  assert.equal(reviewAnalysis.skippedTooShortCount, 2);
});

test('3. Mixed Thai + Burmese review matches cleanly without counting Thai characters', () => {
  const mixed = detectMyanmarInSingleReview('ส่งไวมากครับ ပစ္စည်းအရမ်းကောင်းတယ် ซื้อซ้ำแน่นอน');
  assert.equal(mixed.matched, true);
  assert.equal(mixed.isMixedThaiBurmese, true);
  assert.equal(mixed.matchType, 'myanmar-script');
  // Pure Burmese substring has ~20+ letters; ensure Thai letters are NOT added to the count
  const pureBurmeseOnly = detectMyanmarInSingleReview('ပစ္စည်းအရမ်းကောင်းတယ်');
  assert.equal(mixed.myanmarLetterCount, pureBurmeseOnly.myanmarLetterCount);

  // Mixed Thai + only 2 Myanmar letters -> still rejected because Burmese part is too short!
  const mixedTooShort = detectMyanmarInSingleReview('ส่งไวมาก ดีมากเลย ဟာ');
  assert.equal(mixedTooShort.matched, false);
  assert.equal(mixedTooShort.tooShort, true);
});

test('4. Product with unavailable/empty reviews is strictly classified as review-unavailable (NEVER checked-no-match)', () => {
  clearMyanmarLanguageDetectionCache();

  const unavailableReviews = analyzeProductReviewsForMyanmar([]);
  assert.equal(unavailableReviews.reviewStatus, 'review-unavailable');
  assert.equal(unavailableReviews.totalReviewsChecked, 0);
  assert.equal(unavailableReviews.matchedReviewCount, 0);

  // Even if Title has Burmese text, default reviewOnlyMatching=true requires >=1 Myanmar review!
  const titleOnlyWithoutReviews = detectMyanmarLanguageSignals({
    title: 'သနပ်ခါး မျက်နှာလိမ်းခရင်မ် 100g (Ready Stock TH)',
  });
  assert.equal(titleOnlyWithoutReviews.reviewStatus, 'review-unavailable');
  assert.equal(titleOnlyWithoutReviews.matched, false);
  assert.equal(titleOnlyWithoutReviews.matchedReviewCount, 0);
  assert.equal(titleOnlyWithoutReviews.sourceStatuses.comments.availability, 'unavailable');
  assert.equal(titleOnlyWithoutReviews.marketScopeNoteEn, MARKET_SCOPE_NOTE_EN);
  assert.equal(titleOnlyWithoutReviews.marketScopeNoteMy, MARKET_SCOPE_NOTE_MY);
});

test('5. Multiple reviews & Review Pagination: Myanmar review on page 2 is fetched, detected, and preserved with pageNumber=2', async () => {
  clearServerEnrichmentCache();
  clearMyanmarLanguageDetectionCache();

  const reviewCalls: Array<{ product_id: string; page_number?: number; cursor?: string }> = [];

  const res = await runThailandProductResearch(
    {
      market: 'Thailand TikTok Shop',
      category: 'cosmetics-beauty',
      selectedCategories: ['cosmetics-beauty'],
      bothCategoryMode: 'combined',
      researchMode: 'fast',
      spendingLimitCredits: 10,
      priceLimit: 'unrestricted',
      strategyPreset: 'balanced',
      salesWeightPct: 50,
      quantity: 5,
      myanmarLanguageOnly: true,
      myanmarDiscoveryMode: 'review-first',
      myanmarReviewScanLimit: 3,
    },
    {
      testOverrides: {
        maxReviewPages: 2,
        fetchCreditBalance: async () => ({ ok: true, balance: 50 }),
        fetchProductRank: async () => ({
          ok: true,
          items: [
            makeMockRankItem({
              product_id: '880001',
              product_name: 'เซรั่มบำรุงผิวหน้า สูตรอ่อนโยน',
              revenue: 240000,
              sales_volumn: 900,
            }),
          ],
          total: 1,
        }),
        fetchCommentInsight: async (params) => {
          reviewCalls.push({
            product_id: params.product_id,
            page_number: params.page_number,
            cursor: params.cursor,
          });
          if (!params.page_number || params.page_number === 1) {
            return {
              ok: true,
              data: {
                comment_summary: { summary: 'Fast delivery and hydrating.' },
                positive_points: [{ view_point: 'Hydrating', id_list: ['1', '2'] }],
                pain_points: [],
                usage_scenarios: [],
                original_comments: [
                  { rating: 5, review: { text: 'ส่งไวมาก แพ็คของดีมาก' } },
                  { rating: 4, review: { text: 'ใช้ดีค่ะ ผิวชุ่มชื้น' } },
                ],
                has_more: true,
                next_cursor: 'cursor-page-2',
              },
            };
          }
          return {
            ok: true,
            data: {
              original_comments: [
                { rating: 5, review: { text: 'အသားအရေစိုပြေပြီး အရမ်းကောင်းပါတယ် ထပ်ဝယ်ဦးမယ်' } },
                { rating: 5, review: { text: 'Very nice serum!' } },
              ],
              has_more: false,
            },
          };
        },
        verifyImageUrl: async () => ({
          imageUrl: null,
          imageOriginUrl: null,
          imageVerified: false,
          imageSourceNoteEn: 'Mock image skipped',
          imageSourceNoteMy: 'Mock image skipped',
        }),
      },
    }
  );

  assert.equal(reviewCalls.length, 2);
  assert.equal(reviewCalls[0].page_number, undefined);
  assert.equal(reviewCalls[1].page_number, 2);
  assert.equal(reviewCalls[1].cursor, 'cursor-page-2');

  assert.equal(res.products.length, 1);
  const matched = res.products[0];
  assert.equal(matched.myanmarLanguage?.reviewStatus, 'matched');
  assert.equal(matched.myanmarLanguage?.matched, true);
  assert.equal(matched.myanmarLanguage?.totalReviewsChecked, 4);
  assert.equal(matched.myanmarLanguage?.matchedReviewCount, 1);
  assert.equal(matched.myanmarLanguage?.matchedReviews[0].pageNumber, 2);
  assert.equal(matched.myanmarLanguage?.matchedReviews[0].rating, 5);
  assert.equal(matched.kalodataMetrics?.reviewInsight?.pagesFetched, 2);
  assert.equal(res.myanmarReviewDiscovery?.totalReviewsInspected, 4);
  assert.equal(res.myanmarReviewDiscovery?.matchedMyanmarReviewProducts, 1);
});

test('6. Cost planner & Spending Limit Gate disclose exact review scan cost upfront and block over-limit runs at 0 API calls', async () => {
  const planOff = buildKalodataExecutionPlan(['cosmetics-beauty'], 10, 'combined', {
    researchMode: 'fast',
    myanmarLanguageOnly: false,
  });
  assert.equal(planOff.rankApiCalls, 1);
  assert.equal(planOff.commentInsightApiCalls, 0);
  assert.equal(planOff.estimatedCredits, 0.1);
  assert.deepEqual(planOff.streams[0].pageSizes, [20]);

  const planOn = buildKalodataExecutionPlan(['cosmetics-beauty'], 10, 'combined', {
    researchMode: 'fast',
    myanmarLanguageOnly: true,
    myanmarDiscoveryMode: 'review-first',
    myanmarReviewScanLimit: 5,
  });
  assert.equal(planOn.rankApiCalls, 1);
  assert.equal(planOn.commentInsightApiCalls, 5);
  assert.equal(planOn.plannedApiCalls, 6);
  assert.equal(planOn.estimatedCredits, 5.1); // 0.1 rank + 5 * 1.0 review calls
  assert.equal(planOn.myanmarReviewScanLimit, 5);
  assert.deepEqual(planOn.streams[0].pageSizes, [100]);

  assert.equal(clampMyanmarReviewScanLimit(undefined), DEFAULT_MYANMAR_REVIEW_SCAN_LIMIT);
  assert.equal(clampMyanmarReviewScanLimit(0), 1);
  assert.equal(clampMyanmarReviewScanLimit(999), 30);

  // Verify Spending Limit Gate blocks BEFORE any paid API call when limit = 1.0 cr < 5.1 cr
  let rankCalls = 0;
  let reviewCalls = 0;
  await assert.rejects(
    async () => {
      await runThailandProductResearch(
        {
          market: 'Thailand TikTok Shop',
          category: 'cosmetics-beauty',
          selectedCategories: ['cosmetics-beauty'],
          bothCategoryMode: 'combined',
          researchMode: 'fast',
          spendingLimitCredits: 1.0,
          priceLimit: 'unrestricted',
          strategyPreset: 'balanced',
          salesWeightPct: 50,
          quantity: 10,
          myanmarLanguageOnly: true,
          myanmarDiscoveryMode: 'review-first',
          myanmarReviewScanLimit: 5,
        },
        {
          testOverrides: {
            fetchCreditBalance: async () => ({ ok: true, balance: 100 }),
            fetchProductRank: async () => {
              rankCalls += 1;
              return { ok: true, items: [] };
            },
            fetchCommentInsight: async () => {
              reviewCalls += 1;
              return { ok: true, data: null };
            },
          },
        }
      );
    },
    (err: unknown) => err instanceof ResearchApiError && err.code === 'SPENDING_LIMIT_EXCEEDED'
  );
  assert.equal(rankCalls, 0);
  assert.equal(reviewCalls, 0);
});

test('7. End-to-end mocked Myanmar Review Discovery (0 live API calls): Filter OFF unchanged, Filter ON separates unavailable/no-match/matched, scores ONLY matched with untouched 7-Factor scoring & ranks descending', async () => {
  clearServerEnrichmentCache();
  clearMyanmarLanguageDetectionCache();

  const rankRequests: Array<{ region?: string; category_ids?: string[] }> = [];
  const reviewRequests: string[] = [];

  // 5 Thailand candidates:
  // - 910001: High metrics, pure Thai reviews (checked-no-match -> EXCLUDED)
  // - 910002: Strong metrics, 1 mixed Thai+Burmese review (MATCHED -> should rank #1)
  // - 910003: Lower metrics, 2 Myanmar reviews from SERVER CACHE (MATCHED at 0 credits -> should rank #2, NO bonus points for having 2 reviews vs 1!)
  // - 910004: Reviews unavailable (API returns empty / null -> strictly classified as review-unavailable, NOT checked-no-match!)
  // - 910005: Beyond myanmarReviewScanLimit=3 uncached cap -> NOT checked (proves honest partial scan count!)
  const mockItems = [
    makeMockRankItem({
      product_id: '910001',
      product_name: 'ครีมกันแดด สูตรบางเบา SPF50+ ส่งจากไทย',
      revenue: 500000,
      sales_volumn: 1800,
      commission_rate: 0.15,
    }),
    makeMockRankItem({
      product_id: '910002',
      product_name: 'เซรั่มวิตามินซี ผิวใส 30ml',
      revenue: 420000,
      sales_volumn: 1500,
      commission_rate: 0.14,
      video_revenue: 280000,
    }),
    makeMockRankItem({
      product_id: '910003',
      product_name: 'ลิปทินท์ติดทนนาน สีสวยธรรมชาติ',
      revenue: 65000,
      sales_volumn: 180,
      commission_rate: 0.08,
      video_revenue: 10000,
    }),
    makeMockRankItem({
      product_id: '910004',
      product_name: 'คลีนซิ่งวอเตอร์ เช็ดเครื่องสำอาง',
      revenue: 180000,
      sales_volumn: 600,
      commission_rate: 0.1,
    }),
    makeMockRankItem({
      product_id: '910005',
      product_name: 'มาส์กหน้าคอลลาเจน 10 แผ่น',
      revenue: 120000,
      sales_volumn: 400,
      commission_rate: 0.1,
    }),
  ];

  // Pre-cache reviews for 910003 (reused at 0 credits)
  setServerCachedReviewInsight(
    buildStructuredReviewInsight({
      productId: '910003',
      summary: 'Nice tint',
      positivePoints: [{ point: 'Nice color', mentions: 2 }],
      painPoints: [],
      usageScenarios: [],
      commentsAnalyzed: 2,
      averageRating: 4.8,
      ratedCommentCount: 2,
      rawComments: [
        'အရောင်လေးအရမ်းလှတယ် နှုတ်ခမ်းမခြောက်ဘူး',
        'ပို့ဆောင်မှုမြန်ဆန်ပြီး ပစ္စည်းစစ်မှန်ပါတယ်',
      ],
    })
  );

  const mockDeps = {
    fetchCreditBalance: async () => ({ ok: true, balance: 100 }),
    fetchProductRank: async (req: { region?: string; category_ids?: string[] }) => {
      rankRequests.push({ region: req.region, category_ids: req.category_ids });
      return { ok: true, items: mockItems, total: mockItems.length };
    },
    fetchCommentInsight: async (params: { product_id: string }) => {
      reviewRequests.push(params.product_id);
      if (params.product_id === '910001') {
        return {
          ok: true,
          data: {
            original_comments: [
              { rating: 5, review: { text: 'ส่งไวมาก เนื้อดีไม่เหนียว' } },
              { rating: 5, review: { text: 'ใช้ดีมากครับ คุ้มราคา' } },
            ],
          },
        };
      }
      if (params.product_id === '910002') {
        return {
          ok: true,
          data: {
            comment_summary: { summary: 'Brightens skin quickly.' },
            positive_points: [{ view_point: 'Fast absorption', id_list: ['1', '2'] }],
            pain_points: [],
            usage_scenarios: [],
            original_comments: [
              { rating: 5, review: { text: 'ส่งไวมาก พัสดุเรียบร้อย ပစ္စည်းအရမ်းကောင်းတယ် မျက်နှာကြည်တယ်' } },
              { rating: 4, review: { text: 'ดีค่ะ' } },
            ],
          },
        };
      }
      if (params.product_id === '910004') {
        return { ok: true, data: { original_comments: [] } };
      }
      return { ok: false, data: null };
    },
    verifyImageUrl: async () => ({
      imageUrl: null,
      imageOriginUrl: null,
      imageVerified: false,
      imageSourceNoteEn: 'Mock image skipped',
      imageSourceNoteMy: 'Mock image skipped',
    }),
  };

  // Case A: Filter OFF -> 100% unchanged, 0 review API calls, returns all 5 TH products
  const resOff = await runThailandProductResearch(
    {
      market: 'Thailand TikTok Shop',
      category: 'cosmetics-beauty',
      selectedCategories: ['cosmetics-beauty'],
      bothCategoryMode: 'combined',
      researchMode: 'fast',
      spendingLimitCredits: 1,
      priceLimit: 'unrestricted',
      strategyPreset: 'balanced',
      salesWeightPct: 50,
      quantity: 10,
      myanmarLanguageOnly: false,
    },
    { testOverrides: mockDeps }
  );

  assert.equal(resOff.myanmarFilterApplied, false);
  assert.equal(resOff.products.length, 5);
  assert.equal(reviewRequests.length, 0);
  assert.equal(resOff.costSummary?.commentInsightApiCalls, 0);
  assert.equal(rankRequests[0].region, 'TH');

  // Case B: Filter ON with scan limit = 3 uncached candidates (910001, 910002, 910004) + 1 cached (910003) = 4 checked out of 5 found!
  const resOn = await runThailandProductResearch(
    {
      market: 'Thailand TikTok Shop',
      category: 'cosmetics-beauty',
      selectedCategories: ['cosmetics-beauty'],
      bothCategoryMode: 'combined',
      researchMode: 'fast',
      spendingLimitCredits: 10,
      priceLimit: 'unrestricted',
      strategyPreset: 'balanced',
      salesWeightPct: 50,
      quantity: 10,
      myanmarLanguageOnly: true,
      myanmarDiscoveryMode: 'review-first',
      myanmarReviewScanLimit: 3,
    },
    { testOverrides: mockDeps }
  );

  assert.equal(resOn.myanmarFilterApplied, true);
  assert.equal(rankRequests[1].region, 'TH');
  assert.deepEqual(reviewRequests.sort(), ['910001', '910002', '910004']); // 910003 reused cache, 910005 respected scan limit!

  const discovery = resOn.myanmarReviewDiscovery;
  assert.ok(discovery);
  assert.equal(discovery.totalCandidatesFound, 5);
  assert.equal(discovery.candidatesCheckedForReviews, 4); // 3 uncached + 1 cached (honestly < 5!)
  assert.equal(discovery.productsWithReviewsAvailable, 3); // 910001, 910002, 910003
  assert.equal(discovery.productsReviewUnavailable, 1); // 910004 strictly separated!
  assert.equal(discovery.productsNoMyanmarReview, 1); // 910001 strictly separated from unavailable!
  assert.equal(discovery.matchedMyanmarReviewProducts, 2); // 910002, 910003
  assert.equal(discovery.totalReviewsInspected, 6); // 2 + 2 + 2 + 0
  assert.equal(discovery.reviewApiCallsMade, 3);
  assert.equal(discovery.reviewCacheHits, 1);
  assert.equal(resOn.costSummary?.commentInsightApiCalls, 3);

  // Only matched products are returned & ranked descending by existing 7-Factor opportunityScore
  assert.equal(resOn.products.length, 2);
  assert.equal(resOn.products[0].kalodataMetrics?.productId, '910002');
  assert.equal(resOn.products[1].kalodataMetrics?.productId, '910003');
  assert.ok(resOn.products[0].opportunityScore >= resOn.products[1].opportunityScore);

  // Verify SiamPick 7-Factor 100-Point Scoring System is 100% untouched (0 extra points for Myanmar reviews!)
  const strippedProducts = resOn.products.map((p) => ({ ...p, myanmarLanguage: undefined }));
  const directBatchScores = evaluateProductBatch(strippedProducts, {
    salesWeightPct: 50,
    strategyPreset: 'balanced',
  });
  for (const p of resOn.products) {
    assert.equal(p.opportunityScore, directBatchScores.get(p.id)?.totalScore);
    assert.equal(p.dispatchHub, 'Thailand (TH)');
    assert.equal(p.myanmarLanguage?.reviewStatus, 'matched');
    assert.ok((p.myanmarLanguage?.matchedReviewCount ?? 0) >= 1);
    assert.equal(p.myanmarLanguage?.marketScopeNoteEn, MARKET_SCOPE_NOTE_EN);
  }
  assert.equal(resOn.products[0].myanmarLanguage?.matchedReviews[0].isMixedThaiBurmese, true);
});

test('8. Filter ON + Split Mode across 2 categories & 0-match empty state never fabricate results', async () => {
  clearServerEnrichmentCache();
  clearMyanmarLanguageDetectionCache();

  const splitCalls: string[][] = [];
  const resSplit = await runThailandProductResearch(
    {
      market: 'Thailand TikTok Shop',
      category: 'all',
      selectedCategories: ['womens-fashion', 'cosmetics-beauty'],
      bothCategoryMode: 'split',
      researchMode: 'fast',
      spendingLimitCredits: 10,
      priceLimit: 'unrestricted',
      strategyPreset: 'balanced',
      salesWeightPct: 50,
      quantity: 10,
      myanmarLanguageOnly: true,
      myanmarDiscoveryMode: 'review-first',
      myanmarReviewScanLimit: 4,
    },
    {
      testOverrides: {
        fetchCreditBalance: async () => ({ ok: true, balance: 100 }),
        fetchProductRank: async (req) => {
          splitCalls.push(req.category_ids ?? []);
          if (req.category_ids?.includes('601152')) {
            return {
              ok: true,
              items: [
                makeMockRankItem({
                  product_id: '770001',
                  product_name: 'เดรสแฟชั่นผู้หญิง ผ้าลินิน',
                  pri_category: { category_id: '601152', category_name: 'Womenswear & Underwear' },
                }),
              ],
            };
          }
          return {
            ok: true,
            items: [
              makeMockRankItem({
                product_id: '770002',
                product_name: 'กันแดดเนื้อเจล',
                pri_category: { category_id: '601450', category_name: 'Beauty & Personal Care' },
              }),
            ],
          };
        },
        fetchCommentInsight: async (params) => {
          if (params.product_id === '770001') {
            return {
              ok: true,
              data: {
                original_comments: [{ rating: 5, review: { text: 'အထည်သားအရမ်းကောင်းပြီး ဝတ်လို့အဆင်ပြေတယ်' } }],
              },
            };
          }
          return {
            ok: true,
            data: {
              original_comments: [{ rating: 5, review: { text: 'ส่งไวมากครับ' } }],
            },
          };
        },
        verifyImageUrl: async () => ({
          imageUrl: null,
          imageOriginUrl: null,
          imageVerified: false,
          imageSourceNoteEn: 'Mock',
          imageSourceNoteMy: 'Mock',
        }),
      },
    }
  );

  assert.equal(splitCalls.length, 2);
  assert.equal(resSplit.products.length, 1);
  assert.equal(resSplit.products[0].category, 'womens-fashion');
  assert.equal(resSplit.myanmarReviewDiscovery?.matchedMyanmarReviewProducts, 1);
  assert.equal(resSplit.myanmarReviewDiscovery?.productsNoMyanmarReview, 1);

  // 0-match case (1 checked-no-match, 1 review-unavailable -> 0 returned, never fabricated)
  clearServerEnrichmentCache();
  const resZero = await runThailandProductResearch(
    {
      market: 'Thailand TikTok Shop',
      category: 'cosmetics-beauty',
      selectedCategories: ['cosmetics-beauty'],
      bothCategoryMode: 'combined',
      researchMode: 'fast',
      spendingLimitCredits: 10,
      priceLimit: 'unrestricted',
      strategyPreset: 'balanced',
      salesWeightPct: 50,
      quantity: 10,
      myanmarLanguageOnly: true,
      myanmarDiscoveryMode: 'review-first',
      myanmarReviewScanLimit: 5,
    },
    {
      testOverrides: {
        fetchCreditBalance: async () => ({ ok: true, balance: 100 }),
        fetchProductRank: async () => ({
          ok: true,
          items: [
            makeMockRankItem({ product_id: '780001' }),
            makeMockRankItem({ product_id: '780002' }),
          ],
        }),
        fetchCommentInsight: async (params) => {
          if (params.product_id === '780001') {
            return {
              ok: true,
              data: { original_comments: [{ rating: 5, review: { text: 'ดีมากครับ' } }] },
            };
          }
          return { ok: false, data: null };
        },
      },
    }
  );

  assert.equal(resZero.products.length, 0);
  assert.equal(resZero.verifiedProductCount, 0);
  assert.equal(resZero.myanmarReviewDiscovery?.totalCandidatesFound, 2);
  assert.equal(resZero.myanmarReviewDiscovery?.candidatesCheckedForReviews, 2);
  assert.equal(resZero.myanmarReviewDiscovery?.productsWithReviewsAvailable, 1);
  assert.equal(resZero.myanmarReviewDiscovery?.productsReviewUnavailable, 1);
  assert.equal(resZero.myanmarReviewDiscovery?.productsNoMyanmarReview, 1);
  assert.equal(resZero.myanmarReviewDiscovery?.matchedMyanmarReviewProducts, 0);
});

test('9. Comment parser, enrichment merge, client-side filterProducts & LRU cache determinism', () => {
  clearMyanmarLanguageDetectionCache();

  const parsedComment = parseKalodataCommentInsight('1729400000999', {
    comment_summary: { summary: 'Buyers love the lightweight cooling texture.' },
    positive_points: [{ view_point: 'Cooling feel on skin', id_list: ['1', '2'] }],
    pain_points: [],
    usage_scenarios: [],
    original_comments: [
      { rating: 5, review: { text: 'ပစ္စည်းအရမ်းကောင်းပါတယ် ထိုင်းကနေ ၂ ရက်နဲ့ရောက်တယ်' } },
      { rating: 5, review: { text: 'ส่งไวมากครับ' } },
    ],
  });
  assert.ok(parsedComment);
  assert.equal(parsedComment.allRawComments?.length, 2);

  const product = makeBaseProduct('1729400000999', 'Cooling Herbal Face Serum 30ml');
  const before = detectMyanmarLanguageForProduct(product);
  assert.equal(before.matched, false);
  assert.equal(before.reviewStatus, 'review-unavailable');

  const structuredReview = buildStructuredReviewInsight({
    productId: parsedComment.productId,
    summary: parsedComment.summary,
    positivePoints: parsedComment.positivePoints,
    painPoints: parsedComment.painPoints,
    usageScenarios: parsedComment.usageScenarios,
    commentsAnalyzed: parsedComment.commentsAnalyzed,
    averageRating: parsedComment.averageRating,
    ratedCommentCount: parsedComment.ratedCommentCount,
    rawComments: parsedComment.rawComments,
  });

  const merged = mergeEnrichmentIntoProduct(product, { reviewInsight: structuredReview });
  assert.equal(merged.changed, true);
  assert.equal(merged.product.myanmarLanguage?.matched, true);
  assert.equal(merged.product.myanmarLanguage?.reviewStatus, 'matched');
  assert.equal(merged.product.myanmarLanguage?.matchedReviewCount, 1);
  assert.equal(merged.product.myanmarLanguage?.totalReviewsChecked, 2);

  const pThai = makeBaseProduct('p-thai', 'ลิปทินท์เนื้อฉ่ำ ติดทนนาน');
  const evals = new Map([
    [pThai.id, evaluateProductOpportunity(pThai)],
    [merged.product.id, evaluateProductOpportunity(merged.product)],
  ]);

  assert.equal(countActiveFilters(DEFAULT_PRODUCT_FILTERS), 0);
  assert.equal(filterProducts([pThai, merged.product], evals, DEFAULT_PRODUCT_FILTERS).length, 2);

  const activeFilters = { ...DEFAULT_PRODUCT_FILTERS, myanmarLanguageOnly: true };
  assert.equal(countActiveFilters(activeFilters), 1);
  const filtered = filterProducts([pThai, merged.product], evals, activeFilters);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, merged.product.id);

  // Verify LRU cache hit returns identical reference
  const r1 = detectMyanmarLanguageSignals({ comments: ['ပစ္စည်းအရမ်းကောင်းပါတယ်'] });
  const r2 = detectMyanmarLanguageSignals({ comments: ['ပစ္စည်းအရမ်းကောင်းပါတယ်'] });
  assert.strictEqual(r1, r2);

  // Verify extractRawMyanmarTextCandidates never fabricates unavailable sources
  const raw = extractRawMyanmarTextCandidates({
    rawItem: { product_name: 'Plain Thai Item' },
  });
  assert.equal(raw.title, 'Plain Thai Item');
  assert.equal(raw.description, null);
  assert.equal(raw.reviews, null);
  assert.equal(raw.comments, null);
  assert.equal(raw.videoContent, null);
});

test('10. Video-First detection: Myanmar Unicode, Zawgyi, mixed TH+MY, hashtags & creator match cleanly; pure Thai/English/ambiguous rejected', () => {
  const unicodeVid = detectMyanmarInVideoCandidate({
    caption: 'ဒီနေ့သုံးပြမယ့် SPF50 နေရောင်ကာခရင်မ် အရမ်းကောင်းတယ်',
    creatorHandle: 'may_bkk',
  });
  assert.equal(unicodeVid.matched, true);
  assert.equal(unicodeVid.matchType, 'myanmar-script');
  assert.ok(unicodeVid.myanmarLetterCount >= MIN_MYANMAR_REVIEW_LETTERS);
  assert.equal(unicodeVid.isMixedThaiBurmese, false);

  const zawgyiVid = detectMyanmarInVideoCandidate({
    caption: 'ေရႊျမန္မာ အသားအေရထိန္းသိမ္းေရး ေဆးရည္',
  });
  assert.equal(zawgyiVid.matched, true);
  assert.equal(zawgyiVid.matchType, 'zawgyi-script');

  const mixedVid = detectMyanmarInVideoCandidate({
    caption: 'ส่งไวมากจากกรุงเทพ ပစ္စည်းအရမ်းကောင်းတယ် #รีวิวบิวตี้',
  });
  assert.equal(mixedVid.matched, true);
  assert.equal(mixedVid.isMixedThaiBurmese, true);

  const hashtagVid = detectMyanmarInVideoCandidate({
    caption: 'Best Bangkok skincare haul #myanmarinthailand #bangkok',
    creatorHandle: 'thai_shop_99',
  });
  assert.equal(hashtagVid.matched, true);
  assert.equal(hashtagVid.matchType, 'burmese-romanized-term');
  assert.ok(hashtagVid.matchedTerms.length >= 1);

  const creatorVid = detectMyanmarInVideoCandidate({
    caption: 'New arrival ready stock in TH',
    creatorName: 'မမြတ် ဘန်ကောက်စတိုး',
  });
  assert.equal(creatorVid.matched, true);
  assert.equal(creatorVid.matchType, 'myanmar-script');

  // Strict rejections: pure Thai, pure English, ambiguous "10mm" / "my", too-short Myanmar
  const rejections = [
    { caption: 'ส่งไวมาก เนื้อครีมบางเบา ไม่เหนียวเหนอะหนะ #รีวิวบิวตี้', creatorHandle: 'bkk_beauty' },
    { caption: 'My favorite 10mm eyeliner brush in Bangkok', creatorHandle: 'my_shop_th' },
    { caption: 'ဟာ', creatorHandle: 'short_test' },
  ];
  for (const input of rejections) {
    const res = detectMyanmarInVideoCandidate(input);
    assert.equal(res.matched, false, `Expected "${input.caption}" not to match`);
  }

  const analysis = buildMyanmarVideoLanguageAnalysis([
    {
      videoId: 'vid-01',
      videoUrl: 'https://www.tiktok.com/@may_bkk/video/vid-01',
      creatorHandle: 'may_bkk',
      creatorName: 'May BKK',
      captionSnippet: 'ဒီနေ့သုံးပြမယ့် SPF50 နေရောင်ကာခရင်မ်',
      matchType: 'myanmar-script',
      matchedTerms: ['နေရောင်ကာခရင်မ်'],
      myanmarLetterCount: 22,
      isMixedThaiBurmese: false,
      videoViews: 42000,
      videoRevenueThb: 28500,
      pageNumber: 1,
    },
  ]);
  assert.equal(analysis.matched, true);
  assert.equal(analysis.matchedVideoCount, 1);
  assert.equal(analysis.sourceStatuses.videoContent.availability, 'matched');
  assert.equal(analysis.marketScopeNoteEn, VIDEO_MARKET_SCOPE_NOTE_EN);
  assert.equal(analysis.marketScopeNoteMy, VIDEO_MARKET_SCOPE_NOTE_MY);
});

test('11. parseKalodataVideoRankItem handles nested products[], product_list[], product_ids[], flat product_id, and video URL fallback', () => {
  const fromArray = parseKalodataVideoRankItem({
    video_id: '74100001',
    description: 'နေရောင်ကာခရင်မ် အရမ်းကောင်း #myanmar',
    creator_handle: '@su_bangkok',
    creator_name: 'Su Bangkok',
    views: 55000,
    revenue: 42000,
    products: [
      {
        product_id: '1729500001',
        product_name: 'Sunscreen SPF50',
        unit_price: 259,
        commission_rate: 0.12,
        image: 'https://cdn.example.com/p1.jpg',
      },
    ],
  });
  assert.ok(fromArray);
  assert.equal(fromArray.videoId, '74100001');
  assert.equal(fromArray.creatorHandle, '@su_bangkok');
  assert.equal(fromArray.videoUrl, 'https://www.tiktok.com/@su_bangkok/video/74100001');
  assert.equal(fromArray.linkedProducts.length, 1);
  assert.equal(fromArray.linkedProducts[0].productId, '1729500001');
  assert.equal(fromArray.linkedProducts[0].commissionRatePct, 12);

  // Official Kalodata /tiktok/video/rank fields: belonged_creator_handle, belonged_creator_id, video_title (no embedded products)
  const officialLiveRow = parseKalodataVideoRankItem({
    video_id: '759888111',
    video_title: 'မြန်မာလူမျိုးတွေကြိုက်တဲ့ နေရောင်ကာခရင်မ်',
    belonged_creator_id: '68291029384',
    belonged_creator_handle: 'may_bkk_shop',
    revenue: 34500,
    views: 92000,
  });
  assert.ok(officialLiveRow);
  assert.equal(officialLiveRow.creatorHandle, 'may_bkk_shop');
  assert.equal(officialLiveRow.creatorId, '68291029384');
  assert.equal(officialLiveRow.videoUrl, 'https://www.tiktok.com/@may_bkk_shop/video/759888111');
  assert.equal(officialLiveRow.linkedProducts.length, 0);

  const fromFlat = parseKalodataVideoRankItem({
    id: '74100002',
    title: 'မြန်မာအတွက် အထူးလျှော့ဈေး',
    product_id: '1729500002',
    product_ids: ['1729500002', '1729500003'],
    play_count: 12000,
    gmv: 9500,
  });
  assert.ok(fromFlat);
  assert.equal(fromFlat.videoUrl, 'https://www.kalodata.com/video/detail?id=74100002&region=TH');
  assert.equal(fromFlat.linkedProducts.length, 2);
  assert.deepEqual(
    fromFlat.linkedProducts.map((p) => p.productId),
    ['1729500002', '1729500003']
  );

  assert.equal(parseKalodataVideoRankItem({ description: 'Missing ID' }), null);
});

test('12. Method 1 Video-First (DEFAULT): multi-page pagination collects exact 20 unique TH affiliate products, early-stops before page 4, skips non-affiliate, and re-ranks with untouched 7-Factor scoring', async () => {
  clearServerEnrichmentCache();
  clearMyanmarLanguageDetectionCache();

  const videoPageCalls: Array<{ page_number: number; region?: string; category_ids?: string[] }> = [];
  const detailCalls: string[] = [];

  // Build 4 pages of 100 videos each:
  // Page 1: 8 Myanmar affiliate products (P101..P108) + 1 duplicate (P101) + 1 video-level non-affiliate (P901, commission_rate=0) + 90 Thai videos
  // Page 2: 7 Myanmar affiliate products (P201..P207) + 1 product missing commission on video whose product/detail reveals commission_rate=0 (P902) + 92 Thai videos
  // Page 3: 8 Myanmar affiliate products (P301..P308) — we only need 5 more to hit 20 (8 + 7 + 5 = 20)!
  // Page 4: Should NEVER be called due to early-stop!
  const buildVideoPage = (pageNum: number) => {
    const items: Record<string, unknown>[] = [];
    const addMyanmarVideo = (
      vidSuffix: string,
      productId: string,
      caption: string,
      commissionRate?: number
    ) => {
      items.push({
        video_id: `750${pageNum}${vidSuffix}`,
        description: caption,
        creator_handle: `mm_creator_${pageNum}_${vidSuffix}`,
        creator_name: `Creator ${pageNum}-${vidSuffix}`,
        views: 25000 + Number(vidSuffix) * 1000,
        revenue: 15000 + Number(vidSuffix) * 2000,
        products: [
          {
            product_id: productId,
            product_name: `TH Product ${productId}`,
            unit_price: 220 + (Number(vidSuffix) % 5) * 30,
            ...(commissionRate !== undefined ? { commission_rate: commissionRate } : {}),
          },
        ],
      });
    };

    if (pageNum === 1) {
      for (let i = 1; i <= 8; i += 1) {
        addMyanmarVideo(`0${i}`, `P10${i}`, `အသားအရေလှစေတဲ့ ပစ္စည်းအမှတ် ${i} ဘန်ကောက်ပို့`, 0.12);
      }
      // Duplicate of P101 (should attach second video evidence, NOT create duplicate product or extra detail call)
      addMyanmarVideo('09', 'P101', 'ထပ်သုံးပြတဲ့ နေရောင်ကာခရင်မ် အရမ်းကောင်းတယ်', 0.12);
      // Explicit non-affiliate on video payload -> skipped at 0 credits!
      addMyanmarVideo('10', 'P901', 'မြန်မာလူမျိုးတွေကြိုက်တဲ့ ပစ္စည်း (No Affiliate)', 0);
    } else if (pageNum === 2) {
      for (let i = 1; i <= 7; i += 1) {
        addMyanmarVideo(`0${i}`, `P20${i}`, `ส่งไวมาก ပစ္စည်းအရမ်းကောင်းတယ် အမှတ် ${i}`, 0.14);
      }
      // Omitted commission_rate on video payload; product/detail will return 0 -> skipped post-detail
      addMyanmarVideo('08', 'P902', 'မြန်မာအတွက် အထူးပစ္စည်း (Commission 0 in detail)', undefined);
    } else if (pageNum === 3) {
      for (let i = 1; i <= 8; i += 1) {
        addMyanmarVideo(`0${i}`, `P30${i}`, `မြန်မာဝယ်သူတွေအတွက် အရမ်းတန်တယ် #myanmarinthailand ${i}`, 0.11);
      }
    } else {
      addMyanmarVideo('01', 'P401', 'Page 4 should never be fetched', 0.15);
    }

    // Pad remaining slots to 100 with pure Thai videos
    while (items.length < 100) {
      const idx = items.length + 1;
      items.push({
        video_id: `759${pageNum}${String(idx).padStart(3, '0')}`,
        description: `รีวิวสินค้าขายดีในไทย ส่งไวมาก #ของดีบอกต่อ ${idx}`,
        creator_handle: `thai_creator_${idx}`,
        views: 10000,
        revenue: 8000,
        products: [{ product_id: `TH_${pageNum}_${idx}`, commission_rate: 0.1 }],
      });
    }
    return items;
  };

  // Vary revenue/sales/commission across P101..P308 so 7-Factor scoring produces distinct rankings
  const detailMetrics = (productId: string) => {
    if (productId === 'P902') {
      return {
        product_id: productId,
        product_name: 'Non-Affiliate Detail Item',
        unit_price: 250,
        revenue: 100000,
        sales_volumn: 400,
        commission_rate: 0,
        seller_id: '749999',
        seller_name: 'Non-Aff Shop TH',
      };
    }
    const seed = Number(productId.replace(/\D/g, '')) % 100;
    const isTopWinner = productId === 'P303';
    return {
      product_id: productId,
      product_name: `TH Beauty Item ${productId}`,
      unit_price: isTopWinner ? 299 : 199 + (seed % 4) * 50,
      revenue: isTopWinner ? 950000 : 80000 + seed * 4000,
      sales_volumn: isTopWinner ? 3200 : 250 + seed * 15,
      revenue_growth_rate: isTopWinner ? 45 : 10 + (seed % 20),
      commission_rate: isTopWinner ? 0.18 : 0.08 + (seed % 8) * 0.01,
      live_revenue: isTopWinner ? 150000 : 10000,
      video_revenue: isTopWinner ? 750000 : 50000 + seed * 2000,
      showcase_revenue: 15000,
      seller_id: `749${seed}`,
      seller_name: `Bangkok Official ${productId}`,
      creator_num: isTopWinner ? 18 : 40 + seed,
      sku_count: 3,
      pri_category: { category_id: '601450', category_name: 'Beauty & Personal Care' },
      sec_category: { category_id: '601455', category_name: 'Skincare' },
    };
  };

  let mockBalance12 = 100;
  const res = await runThailandProductResearch(
    {
      market: 'Thailand TikTok Shop',
      category: 'cosmetics-beauty',
      selectedCategories: ['cosmetics-beauty'],
      bothCategoryMode: 'combined',
      researchMode: 'fast',
      spendingLimitCredits: 5,
      priceLimit: 'unrestricted',
      strategyPreset: 'balanced',
      salesWeightPct: 50,
      quantity: 20,
      myanmarLanguageOnly: true,
      myanmarVideoScanPages: 10,
    },
    {
      testOverrides: {
        fetchCreditBalance: async () => ({
          ok: true,
          balance: Math.round(mockBalance12 * 10000) / 10000,
        }),
        fetchVideoRank: async (req) => {
          mockBalance12 -= 0.1;
          videoPageCalls.push({
            page_number: req.page_number ?? 1,
            region: req.region,
            category_ids: req.category_ids,
          });
          return { ok: true, items: buildVideoPage(req.page_number ?? 1), total: 400 };
        },
        fetchProductDetail: async (params) => {
          mockBalance12 -= 0.1;
          detailCalls.push(params.product_id);
          return { ok: true, data: detailMetrics(params.product_id) };
        },
        verifyImageUrl: async () => ({
          imageUrl: null,
          imageOriginUrl: null,
          imageVerified: false,
          imageSourceNoteEn: 'Mock skipped',
          imageSourceNoteMy: 'Mock skipped',
        }),
      },
    }
  );

  // Must default to video-first
  assert.equal(res.myanmarDiscoveryMode, 'video-first');
  assert.equal(res.myanmarFilterApplied, true);

  // Must reach EXACT 20 unique verified affiliate products & early-stop on page 3 (never calling page 4!)
  assert.equal(res.products.length, 20);
  assert.equal(res.verifiedProductCount, 20);
  assert.equal(videoPageCalls.length, 3);
  assert.deepEqual(
    videoPageCalls.map((c) => c.page_number),
    [1, 2, 3]
  );
  assert.ok(videoPageCalls.every((c) => c.region === 'TH'));

  // P901 skipped BEFORE product/detail (0 cr); P902 skipped AFTER product/detail; P101 hydrated only ONCE
  assert.equal(detailCalls.includes('P901'), false);
  assert.equal(detailCalls.includes('P902'), true);
  assert.equal(detailCalls.filter((id) => id === 'P101').length, 1);
  assert.equal(detailCalls.length, 21); // 20 verified affiliate + 1 P902 whose detail revealed commission=0

  // Verify discovery telemetry & costs
  const vd = res.myanmarVideoDiscovery;
  assert.ok(vd);
  assert.equal(vd.requestedQuantity, 20);
  assert.equal(vd.affiliateProductsVerified, 20);
  assert.equal(vd.videoPagesScanned, 3);
  assert.equal(vd.maxVideoScanPages, 10);
  assert.equal(vd.stopReason, 'target-reached');
  assert.equal(vd.nonAffiliateOrUnavailableSkipped, 2);
  assert.equal(vd.videoRankApiCalls, 3);
  assert.equal(vd.productDetailApiCalls, 21);
  assert.equal(vd.productDetailCacheHits, 0);

  assert.equal(res.costSummary?.rankApiCalls, 0);
  assert.equal(res.costSummary?.videoRankApiCalls, 3);
  assert.equal(res.costSummary?.productDetailApiCalls, 21);
  assert.equal(res.costSummary?.commentInsightApiCalls, 0);
  assert.equal(res.costSummary?.actualCredits, 2.4); // 3 * 0.1 + 21 * 0.1 = 2.4 cr <= 3.0 cr estimated!
  assert.ok((res.costSummary?.actualCredits ?? 99) <= (res.costSummary?.estimatedCredits ?? 0));

  // Verify duplicate video attached cleanly to P101 (2 matched videos!)
  const p101 = res.products.find((p) => p.kalodataMetrics?.productId === 'P101');
  assert.ok(p101);
  assert.equal(p101.myanmarLanguage?.matchedVideoCount, 2);
  assert.equal(p101.myanmarLanguage?.matchedVideos?.length, 2);

  // Verify P303 (strongest metrics, found on page 3!) ranked #1 after full 7-Factor re-ranking
  assert.equal(res.products[0].kalodataMetrics?.productId, 'P303');

  // Verify strictly descending score order + 100% untouched 7-Factor 100-Point Scoring (0 bonus points!)
  const stripped = res.products.map((p) => ({ ...p, myanmarLanguage: undefined }));
  const directBatchScores = evaluateProductBatch(stripped, {
    salesWeightPct: 50,
    strategyPreset: 'balanced',
  });
  for (let i = 0; i < res.products.length; i += 1) {
    const p = res.products[i];
    assert.equal(p.dispatchHub, 'Thailand (TH)');
    assert.ok((p.commissionRate ?? 0) > 0);
    assert.equal(p.myanmarLanguage?.matched, true);
    assert.ok((p.myanmarLanguage?.matchedVideoCount ?? 0) >= 1);
    assert.equal(p.myanmarLanguage?.sourceStatuses.videoContent.availability, 'matched');
    assert.equal(p.opportunityScore, directBatchScores.get(p.id)?.totalScore);
    if (i > 0) {
      assert.ok(res.products[i - 1].opportunityScore >= p.opportunityScore);
    }
  }
});

test('13. Method 1 Video-First Honest Shortfall (Zero Fabrication): returns exact real verified subset when < 20 exist', async () => {
  clearServerEnrichmentCache();
  clearMyanmarLanguageDetectionCache();

  // Case A: Only 6 real Myanmar-matched affiliate products across maxVideoScanPages = 3
  const resMaxPages = await runThailandProductResearch(
    {
      market: 'Thailand TikTok Shop',
      category: 'cosmetics-beauty',
      selectedCategories: ['cosmetics-beauty'],
      bothCategoryMode: 'combined',
      researchMode: 'fast',
      spendingLimitCredits: 5,
      priceLimit: 'unrestricted',
      strategyPreset: 'balanced',
      salesWeightPct: 50,
      quantity: 20,
      myanmarLanguageOnly: true,
      myanmarVideoScanPages: 3,
    },
    {
      testOverrides: {
        fetchCreditBalance: async () => ({ ok: true, balance: 100 }),
        fetchVideoRank: async (req) => {
          const p = req.page_number ?? 1;
          const items: Record<string, unknown>[] = [
            {
              video_id: `short-${p}-1`,
              description: `မြန်မာလိုရှင်းပြထားတဲ့ ပစ္စည်း ${p}-1`,
              creator_handle: `mm_short_${p}_1`,
              products: [{ product_id: `SHORT_${p}_1`, commission_rate: 0.12 }],
            },
            {
              video_id: `short-${p}-2`,
              description: `မြန်မာလိုရှင်းပြထားတဲ့ ပစ္စည်း ${p}-2`,
              creator_handle: `mm_short_${p}_2`,
              products: [{ product_id: `SHORT_${p}_2`, commission_rate: 0.1 }],
            },
          ];
          while (items.length < 100) {
            const idx = items.length + 1;
            items.push({
              video_id: `short-th-${p}-${idx}`,
              description: `รีวิวสินค้าไทย ${idx}`,
              products: [{ product_id: `TH_SHORT_${p}_${idx}`, commission_rate: 0.1 }],
            });
          }
          return {
            ok: true,
            items,
          };
        },
        fetchProductDetail: async (params) => ({
          ok: true,
          data: {
            product_id: params.product_id,
            product_name: `Shortfall Product ${params.product_id}`,
            unit_price: 250,
            revenue: 90000,
            sales_volumn: 360,
            commission_rate: 0.12,
            seller_id: '749001',
            seller_name: 'TH Shop',
          },
        }),
        verifyImageUrl: async () => ({
          imageUrl: null,
          imageOriginUrl: null,
          imageVerified: false,
          imageSourceNoteEn: 'Mock',
          imageSourceNoteMy: 'Mock',
        }),
      },
    }
  );

  assert.equal(resMaxPages.products.length, 6);
  assert.equal(resMaxPages.verifiedProductCount, 6);
  assert.equal(resMaxPages.myanmarVideoDiscovery?.requestedQuantity, 20);
  assert.equal(resMaxPages.myanmarVideoDiscovery?.affiliateProductsVerified, 6);
  assert.equal(resMaxPages.myanmarVideoDiscovery?.videoPagesScanned, 3);
  assert.equal(resMaxPages.myanmarVideoDiscovery?.stopReason, 'max-pages-reached');

  // Case B: Source exhausted on page 2 (0 items returned) -> honest 0-padded shortfall with stopReason = 'source-exhausted'
  clearServerEnrichmentCache();
  const resExhausted = await runThailandProductResearch(
    {
      market: 'Thailand TikTok Shop',
      category: 'cosmetics-beauty',
      selectedCategories: ['cosmetics-beauty'],
      bothCategoryMode: 'combined',
      researchMode: 'fast',
      spendingLimitCredits: 5,
      priceLimit: 'unrestricted',
      strategyPreset: 'balanced',
      salesWeightPct: 50,
      quantity: 20,
      myanmarLanguageOnly: true,
      myanmarVideoScanPages: 5,
    },
    {
      testOverrides: {
        fetchCreditBalance: async () => ({ ok: true, balance: 100 }),
        fetchVideoRank: async (req) => {
          if ((req.page_number ?? 1) === 1) {
            return {
              ok: true,
              items: [
                {
                  video_id: 'ex-1',
                  description: 'မြန်မာလိုသုံးပြတဲ့ ဗီဒီယို',
                  products: [{ product_id: 'EX_1', commission_rate: 0.15 }],
                },
              ],
            };
          }
          return { ok: true, items: [] };
        },
        fetchProductDetail: async (params) => ({
          ok: true,
          data: {
            product_id: params.product_id,
            product_name: 'Single Real Item',
            unit_price: 299,
            revenue: 120000,
            sales_volumn: 400,
            commission_rate: 0.15,
            seller_id: '749001',
            seller_name: 'TH Shop',
          },
        }),
        verifyImageUrl: async () => ({
          imageUrl: null,
          imageOriginUrl: null,
          imageVerified: false,
          imageSourceNoteEn: 'Mock',
          imageSourceNoteMy: 'Mock',
        }),
      },
    }
  );

  assert.equal(resExhausted.products.length, 1);
  assert.equal(resExhausted.myanmarVideoDiscovery?.stopReason, 'source-exhausted');
});

test('14. Video-First Cost Planner, Spending Limit Gate & Server Product-Detail Cache Reuse (0 cr)', async () => {
  clearServerEnrichmentCache();
  clearMyanmarLanguageDetectionCache();

  const planVideoFirst = buildKalodataExecutionPlan(['cosmetics-beauty'], 20, 'combined', {
    researchMode: 'fast',
    myanmarLanguageOnly: true,
    myanmarVideoScanPages: 10,
  });
  assert.equal(planVideoFirst.myanmarDiscoveryMode, 'video-first');
  assert.equal(planVideoFirst.videoRankApiCalls, 10);
  assert.equal(planVideoFirst.rankApiCalls, 20); // Up to 20 product/rank(video_id) lookups
  assert.equal(planVideoFirst.productDetailApiCalls, 0); // Fast mode needs 0 product/detail calls
  assert.equal(planVideoFirst.commentInsightApiCalls, 0);
  assert.equal(planVideoFirst.estimatedCredits, 3.0); // 10 * 0.1 + 20 * 0.1
  assert.equal(planVideoFirst.dateRange, 'last30Day');

  assert.equal(clampMyanmarVideoScanPages(undefined), DEFAULT_MYANMAR_VIDEO_SCAN_PAGES);
  assert.equal(clampMyanmarVideoScanPages(0), 1);
  assert.equal(clampMyanmarVideoScanPages(999), 25);

  // Spending Limit Gate must block before ANY video/rank or product/detail call!
  let videoRankCalls = 0;
  let detailCalls = 0;
  await assert.rejects(
    async () => {
      await runThailandProductResearch(
        {
          market: 'Thailand TikTok Shop',
          category: 'cosmetics-beauty',
          selectedCategories: ['cosmetics-beauty'],
          bothCategoryMode: 'combined',
          researchMode: 'fast',
          spendingLimitCredits: 1.0, // < 3.0 cr planned
          priceLimit: 'unrestricted',
          strategyPreset: 'balanced',
          salesWeightPct: 50,
          quantity: 20,
          myanmarLanguageOnly: true,
          myanmarVideoScanPages: 10,
        },
        {
          testOverrides: {
            fetchCreditBalance: async () => ({ ok: true, balance: 100 }),
            fetchVideoRank: async () => {
              videoRankCalls += 1;
              return { ok: true, items: [] };
            },
            fetchProductDetail: async () => {
              detailCalls += 1;
              return { ok: true, data: null };
            },
          },
        }
      );
    },
    (err: unknown) => err instanceof ResearchApiError && err.code === 'SPENDING_LIMIT_EXCEEDED'
  );
  assert.equal(videoRankCalls, 0);
  assert.equal(detailCalls, 0);

  // Pre-cache 2 product details on server -> Video-First must reuse them at 0 product/detail credits!
  setServerCachedProductDetail({
    productId: 'CACHED_01',
    productName: 'Cached Bangkok Sunscreen SPF50',
    sellerName: 'Cached Glow Official TH',
    productShopId: '749801',
    minPriceThb: 279,
    maxPriceThb: 279,
    unitPriceThb: 279,
    salesVolume: 850,
    revenueThb: 237000,
    commissionRatePct: 14,
    liveRevenueThb: 30000,
    videoRevenueThb: 190000,
    shoppingMallRevenueThb: 17000,
    showcaseRevenueThb: 17000,
    revenueGrowthRate: 22,
    creatorNumber: 24,
    videoNumber: 40,
    liveNumber: 5,
    deliveryType: 'TH',
    productReviewCount: 120,
    launchDate: '2025-01-10',
    trendPointsCount: 7,
    trendPeakThb: 45000,
    trendAvgThb: 33000,
    skuCount: 2,
    priCategory: { category_id: '601450', category_name: 'Beauty & Personal Care' },
    updatedAt: new Date().toISOString(),
    dateRange: 'last30Day',
  });
  setServerCachedProductDetail({
    productId: 'CACHED_02',
    productName: 'Cached Bangkok Vitamin C Serum',
    sellerName: 'Cached Serum TH',
    productShopId: '749802',
    minPriceThb: 320,
    maxPriceThb: 320,
    unitPriceThb: 320,
    salesVolume: 640,
    revenueThb: 204800,
    commissionRatePct: 12,
    liveRevenueThb: 20000,
    videoRevenueThb: 170000,
    shoppingMallRevenueThb: 14800,
    showcaseRevenueThb: 14800,
    revenueGrowthRate: 18,
    creatorNumber: 15,
    videoNumber: 22,
    liveNumber: 3,
    deliveryType: 'TH',
    productReviewCount: 85,
    launchDate: '2025-02-01',
    trendPointsCount: 7,
    trendPeakThb: 39000,
    trendAvgThb: 29000,
    skuCount: 1,
    priCategory: { category_id: '601450', category_name: 'Beauty & Personal Care' },
    updatedAt: new Date().toISOString(),
    dateRange: 'last30Day',
  });

  let cacheRunDetailCalls = 0;
  let mockBalance14 = 100;
  const resCached = await runThailandProductResearch(
    {
      market: 'Thailand TikTok Shop',
      category: 'cosmetics-beauty',
      selectedCategories: ['cosmetics-beauty'],
      bothCategoryMode: 'combined',
      researchMode: 'fast',
      spendingLimitCredits: 5,
      priceLimit: 'unrestricted',
      strategyPreset: 'balanced',
      salesWeightPct: 50,
      quantity: 2,
      myanmarLanguageOnly: true,
      myanmarVideoScanPages: 3,
    },
    {
      testOverrides: {
        fetchCreditBalance: async () => ({
          ok: true,
          balance: Math.round(mockBalance14 * 10000) / 10000,
        }),
        fetchVideoRank: async () => {
          mockBalance14 -= 0.1;
          return {
            ok: true,
            items: [
              {
                video_id: 'cv-1',
                description: 'နေရောင်ကာခရင်မ် အရမ်းကောင်းတယ်',
                products: [{ product_id: 'CACHED_01', commission_rate: 0.14 }],
              },
              {
                video_id: 'cv-2',
                description: 'ဗီတာမင်စီ ဆီရမ် မျက်နှာကြည်စေတယ်',
                products: [{ product_id: 'CACHED_02', commission_rate: 0.12 }],
              },
            ],
          };
        },
        fetchProductDetail: async () => {
          mockBalance14 -= 0.1;
          cacheRunDetailCalls += 1;
          return { ok: false, data: null };
        },
        verifyImageUrl: async () => ({
          imageUrl: null,
          imageOriginUrl: null,
          imageVerified: false,
          imageSourceNoteEn: 'Mock',
          imageSourceNoteMy: 'Mock',
        }),
      },
    }
  );

  assert.equal(cacheRunDetailCalls, 0);
  assert.equal(resCached.products.length, 2);
  assert.equal(resCached.myanmarVideoDiscovery?.productDetailCacheHits, 2);
  assert.equal(resCached.myanmarVideoDiscovery?.productDetailApiCalls, 0);
  assert.equal(resCached.costSummary?.productDetailApiCalls, 0);
  assert.equal(resCached.costSummary?.actualCredits, 0.1); // Only 1 video/rank call!
  assert.ok(resCached.products.some((p) => p.name === 'Cached Bangkok Sunscreen SPF50'));
});

test('15. Video-First Split Mode across 2 categories & client-side filterProducts matches video-matched products', async () => {
  clearServerEnrichmentCache();
  clearMyanmarLanguageDetectionCache();

  const streamCategoryCalls: string[][] = [];

  const resSplit = await runThailandProductResearch(
    {
      market: 'Thailand TikTok Shop',
      category: 'all',
      selectedCategories: ['womens-fashion', 'cosmetics-beauty'],
      bothCategoryMode: 'split',
      researchMode: 'fast',
      spendingLimitCredits: 5,
      priceLimit: 'unrestricted',
      strategyPreset: 'balanced',
      salesWeightPct: 50,
      quantity: 4,
      myanmarLanguageOnly: true,
      myanmarVideoScanPages: 2,
    },
    {
      testOverrides: {
        fetchCreditBalance: async () => ({ ok: true, balance: 100 }),
        fetchVideoRank: async (req) => {
          streamCategoryCalls.push(req.category_ids ?? []);
          if (req.category_ids?.includes('601152')) {
            return {
              ok: true,
              items: [
                {
                  video_id: 'sp-f-1',
                  description: 'ဖက်ရှင်ဝတ်စုံ အထည်သားအရမ်းကောင်းတယ် 1',
                  products: [{ product_id: 'SP_F_1', commission_rate: 0.12 }],
                },
                {
                  video_id: 'sp-f-2',
                  description: 'ဖက်ရှင်ဝတ်စုံ အထည်သားအရမ်းကောင်းတယ် 2',
                  products: [{ product_id: 'SP_F_2', commission_rate: 0.11 }],
                },
              ],
            };
          }
          return {
            ok: true,
            items: [
              {
                video_id: 'sp-b-1',
                description: 'အလှကုန်ပစ္စည်း ဘန်ကောက်ပို့ အရမ်းကောင်းတယ် 1',
                products: [{ product_id: 'SP_B_1', commission_rate: 0.14 }],
              },
              {
                video_id: 'sp-b-2',
                description: 'အလှကုန်ပစ္စည်း ဘန်ကောက်ပို့ အရမ်းကောင်းတယ် 2',
                products: [{ product_id: 'SP_B_2', commission_rate: 0.13 }],
              },
            ],
          };
        },
        fetchProductDetail: async (params) => {
          const isFashion = params.product_id.startsWith('SP_F_');
          return {
            ok: true,
            data: {
              product_id: params.product_id,
              product_name: isFashion ? `TH Dress ${params.product_id}` : `TH Serum ${params.product_id}`,
              unit_price: 280,
              revenue: 150000,
              sales_volumn: 500,
              commission_rate: 0.12,
              seller_id: '749010',
              seller_name: 'Bangkok Official',
              pri_category: isFashion
                ? { category_id: '601152', category_name: 'Womenswear & Underwear' }
                : { category_id: '601450', category_name: 'Beauty & Personal Care' },
            },
          };
        },
        verifyImageUrl: async () => ({
          imageUrl: null,
          imageOriginUrl: null,
          imageVerified: false,
          imageSourceNoteEn: 'Mock',
          imageSourceNoteMy: 'Mock',
        }),
      },
    }
  );

  assert.equal(streamCategoryCalls.length, 2);
  assert.equal(resSplit.products.length, 4);
  assert.equal(resSplit.costSummary?.rankApiCalls, 0);
  assert.equal(resSplit.costSummary?.commentInsightApiCalls, 0);
  assert.equal(resSplit.myanmarVideoDiscovery?.stopReason, 'target-reached');

  // Verify client-side filterProducts matches video-backed products even when reviewStatus is review-unavailable
  const plainThai = makeBaseProduct('plain-th-1', 'ลิปทินท์ธรรมดา');
  const videoBacked = resSplit.products[0];
  assert.equal(videoBacked.myanmarLanguage?.reviewStatus, 'review-unavailable');
  assert.ok((videoBacked.myanmarLanguage?.matchedVideos?.length ?? 0) >= 1);

  const evals = new Map([
    [plainThai.id, evaluateProductOpportunity(plainThai)],
    [videoBacked.id, evaluateProductOpportunity(videoBacked)],
  ]);
  const filtered = filterProducts([plainThai, videoBacked], evals, {
    ...DEFAULT_PRODUCT_FILTERS,
    myanmarLanguageOnly: true,
  });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, videoBacked.id);
});

test('16. REAL Kalodata Live Video-First Schema (NO embedded products[] in video/rank): resolves linked TH affiliate products via POST /tiktok/product/rank(video_id), handles belonged_creator_handle, sort pivot, 24h cache & full 20-product 7-Factor re-ranking', async () => {
  clearServerEnrichmentCache();
  clearMyanmarLanguageDetectionCache();

  const videoRankRequests: Array<{ page_number?: number; sort?: string }> = [];
  const productRankVideoIds: string[] = [];
  let detailCalls = 0;
  let mockBalance = 100;

  // Simulate Kalodata's ACTUAL live /tiktok/video/rank response (16 fields, NO products[] / product_id):
  // - Sort='revenue' page 1: 100 videos (10 Myanmar videos: V1..V10)
  // - Sort='revenue' page 2: repeats page 1 video_ids (simulating upstream pagination cap) -> MUST pivot to sort='views' page 1!
  // - Sort='views' page 1: 100 fresh videos (6 Myanmar videos: V11..V16, including creator handle match '@myanmar_bkk_beauty')
  const makeLiveVideoPage = (sort: string, page: number) => {
    const rows: Record<string, unknown>[] = [];
    if (sort === 'revenue') {
      // Page 2 intentionally repeats page 1 IDs to verify duplicate-page detection & automatic sort pivot
      for (let i = 1; i <= 10; i += 1) {
        rows.push({
          video_id: `76001${String(i).padStart(2, '0')}`,
          video_title: `မြန်မာလူမျိုးတွေကြိုက်တဲ့ နေရောင်ကာခရင်မ် #${i}`,
          belonged_creator_id: `6800${i}`,
          belonged_creator_handle: `mm_th_creator_${i}`,
          revenue: 45000 + i * 2000,
          views: 80000 + i * 5000,
          digg_count: 1500,
          share_count: 120,
          comment_count: 80,
        });
      }
      while (rows.length < 100) {
        const idx = rows.length + 1;
        rows.push({
          video_id: `76099${String(idx).padStart(3, '0')}`,
          video_title: `รีวิวครีมกันแดดขายดีในไทย #${idx}`,
          belonged_creator_id: `6900${idx}`,
          belonged_creator_handle: `thai_creator_${idx}`,
          revenue: 25000,
          views: 40000,
        });
      }
      return rows;
    }

    // Secondary sort ('views') page 1 returns fresh viral videos (including handle-only Myanmar match!)
    for (let i = 11; i <= 16; i += 1) {
      rows.push({
        video_id: `76002${String(i).padStart(2, '0')}`,
        video_title:
          i === 16
            ? 'Best skincare routine in Bangkok' // Matched via belonged_creator_handle!
            : `ဘန်ကောက်ကနေ ဝယ်လို့ရတဲ့ အလှကုန် #${i}`,
        belonged_creator_id: `6800${i}`,
        belonged_creator_handle: i === 16 ? 'myanmar_bkk_beauty' : `mm_viral_${i}`,
        revenue: 30000 + i * 1500,
        views: 150000 + i * 10000,
      });
    }
    while (rows.length < 100) {
      const idx = rows.length + 1;
      rows.push({
        video_id: `76199${page}${String(idx).padStart(3, '0')}`,
        video_title: `รีวิวบิวตี้ไทย #${idx}`,
        belonged_creator_id: `6910${idx}`,
        belonged_creator_handle: `thai_viral_${idx}`,
        revenue: 15000,
        views: 90000,
      });
    }
    return rows;
  };

  // product/rank(video_id) mapping:
  // - V1..V9 each return 2 unique TH affiliate products (18 total), EXCEPT V10 returns 0 affiliate products (skipped!)
  // - V11..V16 each return 1 unique TH affiliate product -> V11 & V12 complete 20/20 and early-stop!
  const mockOverrides = {
    fetchCreditBalance: async () => ({
      ok: true,
      balance: Math.round(mockBalance * 10000) / 10000,
    }),
    fetchVideoRank: async (req: { page_number?: number; sort_field: { field: string } }) => {
      mockBalance -= 0.1;
      videoRankRequests.push({ page_number: req.page_number, sort: req.sort_field.field });
      return {
        ok: true,
        items: makeLiveVideoPage(req.sort_field.field, req.page_number ?? 1),
      };
    },
    fetchProductRank: async (req: { video_id?: string; is_affiliate?: 0 | 1; region?: string }) => {
      assert.equal(req.region, 'TH');
      assert.equal(req.is_affiliate, 1);
      assert.ok(req.video_id);
      mockBalance -= 0.1;
      productRankVideoIds.push(req.video_id);

      // V10 has no active affiliate product
      if (req.video_id === '7600110') {
        return { ok: true, items: [] };
      }

      const num = Number(req.video_id.slice(-2));
      if (num <= 9) {
        return {
          ok: true,
          items: [
            makeMockRankItem({
              product_id: `LIVE_P_${num}_A`,
              product_name: `TH Live Product ${num}A`,
              revenue: num === 5 ? 920000 : 110000 + num * 12000,
              sales_volumn: num === 5 ? 3100 : 400 + num * 40,
              commission_rate: num === 5 ? 0.18 : 0.12,
              video_revenue: num === 5 ? 740000 : 75000,
            }),
            makeMockRankItem({
              product_id: `LIVE_P_${num}_B`,
              product_name: `TH Live Product ${num}B`,
              revenue: 85000 + num * 9000,
              sales_volumn: 300 + num * 30,
              commission_rate: 0.11,
              video_revenue: 60000,
            }),
          ],
        };
      }
      return {
        ok: true,
        items: [
          makeMockRankItem({
            product_id: `LIVE_P_${num}_V`,
            product_name: `TH Viral Product ${num}`,
            revenue: 220000 + num * 8000,
            sales_volumn: 750 + num * 25,
            commission_rate: 0.14,
            video_revenue: 170000,
          }),
        ],
      };
    },
    fetchProductDetail: async () => {
      detailCalls += 1;
      return { ok: false, data: null };
    },
    verifyImageUrl: async () => ({
      imageUrl: null,
      imageOriginUrl: null,
      imageVerified: false,
      imageSourceNoteEn: 'Mock',
      imageSourceNoteMy: 'Mock',
    }),
  };

  const res = await runThailandProductResearch(
    {
      market: 'Thailand TikTok Shop',
      category: 'cosmetics-beauty',
      selectedCategories: ['cosmetics-beauty'],
      bothCategoryMode: 'combined',
      researchMode: 'fast',
      spendingLimitCredits: 5,
      priceLimit: 'unrestricted',
      strategyPreset: 'balanced',
      salesWeightPct: 50,
      quantity: 20,
      myanmarLanguageOnly: true,
      myanmarVideoScanPages: 10,
    },
    { testOverrides: mockOverrides }
  );

  // Must reach exact 20 TH affiliate products with 0 product/detail calls in Fast Mode!
  assert.equal(res.products.length, 20);
  assert.equal(res.verifiedProductCount, 20);
  assert.equal(detailCalls, 0);
  assert.equal(res.costSummary?.productDetailApiCalls, 0);
  assert.equal(res.myanmarVideoDiscovery?.stopReason, 'target-reached');
  assert.equal(res.myanmarVideoDiscovery?.nonAffiliateOrUnavailableSkipped, 1); // V10 had 0 affiliate products

  // Verify automatic sort pivot after duplicate page 2 ('revenue' p1 -> 'revenue' p2 dup -> 'views' p1)
  assert.deepEqual(videoRankRequests, [
    { page_number: 1, sort: 'revenue' },
    { page_number: 2, sort: 'revenue' },
    { page_number: 1, sort: 'views' },
  ]);

  // Verify V5's top winner (LIVE_P_5_A) ranked #1 via untouched 7-Factor scoring + real creator handle & TikTok URL preserved!
  assert.equal(res.products[0].kalodataMetrics?.productId, 'LIVE_P_5_A');
  assert.equal(res.products[0].myanmarLanguage?.matchedVideos?.[0].creatorHandle, 'mm_th_creator_5');
  assert.equal(
    res.products[0].myanmarLanguage?.matchedVideos?.[0].videoUrl,
    'https://www.tiktok.com/@mm_th_creator_5/video/7600105'
  );

  // Verify 24h server video->product cache reuse on repeat run (0 product/rank calls!)
  const priorProductRankCount = productRankVideoIds.length;
  const resRepeat = await runThailandProductResearch(
    {
      market: 'Thailand TikTok Shop',
      category: 'cosmetics-beauty',
      selectedCategories: ['cosmetics-beauty'],
      bothCategoryMode: 'combined',
      researchMode: 'fast',
      spendingLimitCredits: 5,
      priceLimit: 'unrestricted',
      strategyPreset: 'balanced',
      salesWeightPct: 50,
      quantity: 20,
      myanmarLanguageOnly: true,
      myanmarVideoScanPages: 10,
    },
    { testOverrides: mockOverrides }
  );
  assert.equal(resRepeat.products.length, 20);
  assert.equal(productRankVideoIds.length, priorProductRankCount); // 0 new product/rank calls — 100% cache hit!
  assert.ok((resRepeat.myanmarVideoDiscovery?.productDetailCacheHits ?? 0) >= 10);
});
