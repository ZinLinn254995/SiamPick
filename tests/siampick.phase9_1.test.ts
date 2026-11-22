import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import type { ResearchMode, ResearchProduct } from '../src/types/product.ts';
import type { DeepDiveAnalysisId } from '../src/types/deepDive.ts';
import {
  ALL_DEEP_DIVE_ANALYSIS_IDS,
  buildDeepDiveTargetContext,
  canRunDeepDiveSelection,
  clearAllDeepDiveOptions,
  createInitialDeepDiveWorkspaceState,
  DEEP_DIVE_ANALYSIS_OPTIONS,
  getDeepDiveOptionById,
  recordNotImplementedRunAttempt,
  selectAllDeepDiveOptions,
  toggleDeepDiveExpansion,
  toggleDeepDiveSelection,
} from '../src/utils/deepDiveRegistry.ts';
import { evaluateProductBatch } from '../src/utils/scoring.ts';

function makeProductForMode(mode: ResearchMode, id: string): ResearchProduct {
  const numericId = id.replace(/^(kalodata-th-|kd[_-])/i, '');
  return {
    id,
    name: `Sample ${mode.toUpperCase()} Product`,
    nameMy: `${mode} နမူနာ Product`,
    brand: 'SiamBrand',
    category: 'womens-fashion',
    subCategory: 'Dresses',
    subCategoryMy: 'ဂါဝန်',
    shopName: 'SiamShop Official',
    dispatchHub: 'Bangkok, Thailand',
    priceThb: 490,
    priceStatus: 'verified',
    commissionRate: 15,
    commissionVerified: true,
    commissionStatus: 'verified',
    estimatedCommissionPerSaleThb: 74,
    commissionNoteEn: '15% verified affiliate commission',
    commissionNoteMy: '15% တရားဝင်ကော်မရှင်',
    imageSourceNoteEn: 'Verified Kalodata product image',
    imageSourceNoteMy: 'တရားဝင် Kalodata ပုံ',
    demandEvidenceEn: ['Strong 7-day sales'],
    demandEvidenceMy: ['၇ ရက် ရောင်းအားကောင်း'],
    demandStatus: 'verified',
    competitionLevel: 'Moderate',
    competitionDetailEn: '24 creators',
    competitionDetailMy: 'Creator ၂၄ ဦး',
    competitionStatus: 'verified',
    customerRating: 4.8,
    reviewCount: 180,
    reviewCountStatus: 'verified',
    customerRatingStatus: 'verified',
    reviewStrengthsEn: ['Good fabric'],
    reviewStrengthsMy: ['အထည်သားကောင်း'],
    customerComplaintsEn: ['Slight color variation'],
    customerComplaintsMy: ['အရောင်အနည်းငယ်ကွာနိုင်'],
    demandLevel: 'High',
    aiVideoSuitability: 'High',
    aiVideoDetailEn: 'Strong visual fit',
    aiVideoDetailMy: 'AI Video သင့်တော်',
    sellerReliabilityLevel: 'Reliable',
    sellerReliabilityEn: 'Verified TH shop',
    sellerReliabilityMy: 'တရားဝင် ထိုင်းဆိုင်',
    whyChooseEn: 'Balanced demand & commission.',
    whyChooseMy: 'ရောင်းအားနှင့် ကော်မရှင် မျှတသည်။',
    salesPotentialEn: 'Strong volume.',
    salesPotentialMy: 'ရောင်းအားကောင်းသည်။',
    confidenceLevel: 'High',
    confidenceDetailEn: 'Verified Kalodata OpenAPI metrics.',
    confidenceDetailMy: 'Kalodata OpenAPI တကယ့်ဒေတာများ။',
    scoringInputs: {
      demandSales: { rawStrength: 80, verification: 'verified', evidenceEn: '1200 units', evidenceMy: '၁၂၀၀ ခု' },
      commissionEarning: { rawStrength: 75, verification: 'verified', evidenceEn: '15%', evidenceMy: '15%' },
      aiCreative: { rawStrength: 82, verification: 'estimated', evidenceEn: 'Good fit', evidenceMy: 'သင့်တော်' },
      reviewsQuality: { rawStrength: 84, verification: 'verified', evidenceEn: '4.8/5', evidenceMy: '4.8/5' },
      priceAppeal: { rawStrength: 78, verification: 'verified', evidenceEn: '฿490', evidenceMy: '฿490' },
      competitionOpportunity: { rawStrength: 70, verification: 'verified', evidenceEn: '24 creators', evidenceMy: '24 creators' },
      sellerReliability: { rawStrength: 80, verification: 'verified', evidenceEn: 'Verified shop', evidenceMy: 'တရားဝင်ဆိုင်' },
    },
    opportunityScore: 79,
    generalRisksEn: ['Sizing variance'],
    generalRisksMy: ['ဆိုက်ဒ်ကွာနိုင်'],
    missingDataEn: [],
    missingDataMy: [],
    imageUrl: 'https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/sample.webp',
    imageVerified: true,
    sources: [],
    videoIdeas: [
      {
        titleEn: 'Hook 1',
        titleMy: 'အကြံဉာဏ် ၁',
        formatEn: '15s Demo',
        formatMy: '၁၅ စက္ကန့်',
        outlineEn: 'Show product fit.',
        outlineMy: 'ထုတ်ကုန်ကို ပြသပါ။',
      },
      {
        titleEn: 'Hook 2',
        titleMy: 'အကြံဉာဏ် ၂',
        formatEn: 'Close-up',
        formatMy: 'အနီးကပ်',
        outlineEn: 'Highlight texture.',
        outlineMy: 'အသားကို ပြသပါ။',
      },
      {
        titleEn: 'Hook 3',
        titleMy: 'အကြံဉာဏ် ၃',
        formatEn: 'Value Comparison',
        formatMy: 'တန်ဖိုးနှိုင်းယှဉ်',
        outlineEn: 'Compare price value.',
        outlineMy: 'ဈေးနှုန်းတန်ဖိုးကို ပြသပါ။',
      },
    ],
    researchedAt: '2026-07-12T08:00:00.000Z',
    researchMode: mode,
    kalodataMetrics: {
      productId: numericId,
      dateRange: 'last7Day',
      researchMode: mode,
      salesVolume: 1200,
      revenueThb: 588000,
      revenueGrowthRate: 25,
      unitPriceThb: 490,
      commissionRatePct: 15,
      liveRevenueThb: 120000,
      videoRevenueThb: 390000,
      showcaseRevenueThb: 78000,
      launchDate: '2026-02-01',
      creatorNumber: 24,
      sellerId: 'shop_99',
      sellerName: 'SiamShop Official',
      skuCount: 5,
      priCategory: null,
      secCategory: null,
      terCategory: null,
      categoryIdsRequested: ['601152'],
    },
  };
}

test('Phase 9.1 Registry: Defines all 9 independent Deep Dive options with unique IDs and all 6 bilingual Progressive Disclosure fields', () => {
  assert.equal(DEEP_DIVE_ANALYSIS_OPTIONS.length, 9);
  const expectedIds: DeepDiveAnalysisId[] = [
    'product-intelligence',
    'sales-market-intelligence',
    'affiliate-profit-analysis',
    'creator-competition-analysis',
    'video-intelligence',
    'customer-review-intelligence',
    'market-competitor-comparison',
    'ai-strategic-recommendation',
    'ad-video-creative-blueprint',
  ];
  assert.deepEqual(ALL_DEEP_DIVE_ANALYSIS_IDS, expectedIds);

  const uniqueIds = new Set(DEEP_DIVE_ANALYSIS_OPTIONS.map((o) => o.id));
  assert.equal(uniqueIds.size, 9);

  for (const option of DEEP_DIVE_ANALYSIS_OPTIONS) {
    assert.ok(option.nameEn.trim().length > 0);
    assert.ok(option.nameMy.trim().length > 0);
    assert.ok(option.shortDescriptionEn.trim().length > 0);
    assert.ok(option.shortDescriptionMy.trim().length > 0);
    assert.ok(option.whatItDoesEn.trim().length > 0);
    assert.ok(option.whatItDoesMy.trim().length > 0);
    assert.ok(option.whatItChecksEn.length >= 5);
    assert.ok(option.whatItChecksMy.length >= 5);
    assert.ok(option.expectedOutcomeEn.trim().length > 0);
    assert.ok(option.expectedOutcomeMy.trim().length > 0);
    assert.ok(option.requiredDataSourcesEn.trim().length > 0);
    assert.ok(option.requiredDataSourcesMy.trim().length > 0);
    assert.ok(option.estimatedCostNoteEn.trim().length > 0);
    assert.ok(option.estimatedCostNoteMy.trim().length > 0);
    assert.ok(option.missingDataBehaviorEn.trim().length > 0);
    assert.ok(option.missingDataBehaviorMy.trim().length > 0);
  }

  // Review Intelligence must explicitly flag high cost / opt-in API behavior
  const reviewOpt = getDeepDiveOptionById('customer-review-intelligence');
  assert.ok(reviewOpt);
  assert.equal(reviewOpt.costSensitivity, 'high');
  assert.match(reviewOpt.estimatedCostNoteEn, /opt-in/i);
  assert.match(reviewOpt.estimatedCostNoteMy, /ရွေးချယ်မှသာ/);

  // AI Strategic Recommendation must explicitly forbid fabricating missing data
  const aiOpt = getDeepDiveOptionById('ai-strategic-recommendation');
  assert.ok(aiOpt);
  assert.match(aiOpt.missingDataBehaviorEn, /never fabricates/i);
  assert.match(aiOpt.missingDataBehaviorMy, /ဖန်တီးမပြ/);
});

test('Phase 9.1 Product Integration: Works across Fast / Balanced / Deep Research products without mutating original results or rankings', () => {
  const fastProduct = makeProductForMode('fast', 'kd_100001');
  const balancedProduct = makeProductForMode('balanced', 'kd_100002');
  const deepProduct = makeProductForMode('deep', 'kd_100003');

  const results = [fastProduct, balancedProduct, deepProduct];
  const beforeSnapshot = JSON.stringify(results);
  const beforeScores = evaluateProductBatch(results, { salesWeightPct: 50 });

  const fastCtx = buildDeepDiveTargetContext(fastProduct, 'hunting', 'fast');
  const balancedCtx = buildDeepDiveTargetContext(balancedProduct, 'hunting', 'fast');
  const deepCtx = buildDeepDiveTargetContext(deepProduct, 'saved', 'fast');

  assert.equal(fastCtx.originalProductId, 'kd_100001');
  assert.equal(fastCtx.canonicalProductId, '100001');
  assert.equal(fastCtx.originResearchMode, 'fast');
  assert.equal(fastCtx.originView, 'hunting');

  assert.equal(balancedCtx.originalProductId, 'kd_100002');
  assert.equal(balancedCtx.canonicalProductId, '100002');
  assert.equal(balancedCtx.originResearchMode, 'balanced');

  assert.equal(deepCtx.originalProductId, 'kd_100003');
  assert.equal(deepCtx.canonicalProductId, '100003');
  assert.equal(deepCtx.originResearchMode, 'deep');
  assert.equal(deepCtx.originView, 'saved');

  // Original Research Results, Product Data, and 7-Factor Rankings remain 100% untouched
  assert.equal(JSON.stringify(results), beforeSnapshot);
  const afterScores = evaluateProductBatch(results, { salesWeightPct: 50 });
  for (const product of results) {
    assert.equal(
      afterScores.get(product.id)?.totalScore,
      beforeScores.get(product.id)?.totalScore
    );
  }
});

test('Phase 9.1 Manual Selection & Progressive Disclosure: Select/Clear All, independent Expand/Collapse never loses selection, and Run requires >= 1 selection', () => {
  let state = createInitialDeepDiveWorkspaceState();

  // Initially nothing selected & all 8 options collapsed (never all expanded at once)
  assert.equal(state.selectedIds.length, 0);
  assert.equal(state.expandedIds.length, 0);
  assert.equal(canRunDeepDiveSelection(state), false);

  // Select 2 specific options
  state = toggleDeepDiveSelection(state, 'product-intelligence');
  state = toggleDeepDiveSelection(state, 'video-intelligence');
  assert.deepEqual(state.selectedIds, ['product-intelligence', 'video-intelligence']);
  assert.equal(canRunDeepDiveSelection(state), true);

  // Expand 2 options independently -> selection MUST NOT change or be lost
  state = toggleDeepDiveExpansion(state, 'product-intelligence');
  state = toggleDeepDiveExpansion(state, 'customer-review-intelligence');
  assert.deepEqual(state.expandedIds, ['product-intelligence', 'customer-review-intelligence']);
  assert.deepEqual(state.selectedIds, ['product-intelligence', 'video-intelligence']);

  // Collapse one option -> selection MUST remain intact
  state = toggleDeepDiveExpansion(state, 'product-intelligence');
  assert.deepEqual(state.expandedIds, ['customer-review-intelligence']);
  assert.deepEqual(state.selectedIds, ['product-intelligence', 'video-intelligence']);

  // Select All -> all 9 selected, expansion state preserved
  state = selectAllDeepDiveOptions(state);
  assert.equal(state.selectedIds.length, 9);
  assert.deepEqual(state.selectedIds, [...ALL_DEEP_DIVE_ANALYSIS_IDS]);
  assert.deepEqual(state.expandedIds, ['customer-review-intelligence']);
  assert.equal(canRunDeepDiveSelection(state), true);

  // Clear All -> 0 selected, Run disabled again, expansion state preserved
  state = clearAllDeepDiveOptions(state);
  assert.equal(state.selectedIds.length, 0);
  assert.equal(canRunDeepDiveSelection(state), false);
  assert.deepEqual(state.expandedIds, ['customer-review-intelligence']);
});

test('Phase 9.1 Execution Foundation: Isolated per-module slots, honest Not Implemented Yet status, zero fake results, and strictly ZERO API calls', () => {
  const originalFetch = globalThis.fetch;
  let fetchCallCount = 0;

  globalThis.fetch = (async () => {
    fetchCallCount += 1;
    throw new Error('Phase 9.1 must NEVER invoke fetch or external APIs');
  }) as typeof fetch;

  try {
    let state = createInitialDeepDiveWorkspaceState();

    // Attempting to run with 0 selections is a no-op
    const emptyAttempt = recordNotImplementedRunAttempt(state, '2026-07-12T10:00:00.000Z');
    assert.equal(emptyAttempt.lastAttemptedRunIds.length, 0);
    assert.equal(emptyAttempt.lastAttemptedRunAt, null);

    // Select 2 modules and run -> isolated slots updated to 'not-implemented', result stays null, unselected untouched
    state = toggleDeepDiveSelection(state, 'affiliate-profit-analysis');
    state = toggleDeepDiveSelection(state, 'ai-strategic-recommendation');
    state = recordNotImplementedRunAttempt(state, '2026-07-12T10:05:00.000Z');

    assert.deepEqual(state.lastAttemptedRunIds, [
      'affiliate-profit-analysis',
      'ai-strategic-recommendation',
    ]);
    assert.equal(state.lastAttemptedRunAt, '2026-07-12T10:05:00.000Z');

    assert.equal(state.slots['affiliate-profit-analysis'].status, 'not-implemented');
    assert.equal(state.slots['affiliate-profit-analysis'].result, null);
    assert.equal(state.slots['affiliate-profit-analysis'].updatedAt, '2026-07-12T10:05:00.000Z');

    assert.equal(state.slots['ai-strategic-recommendation'].status, 'not-implemented');
    assert.equal(state.slots['ai-strategic-recommendation'].result, null);
    assert.equal(state.slots['ai-strategic-recommendation'].updatedAt, '2026-07-12T10:05:00.000Z');

    // Unselected module slot remains untouched (no cross-module mixing)
    assert.equal(state.slots['customer-review-intelligence'].updatedAt, null);
    assert.equal(state.slots['customer-review-intelligence'].result, null);

    // Strictly ZERO network/API calls
    assert.equal(fetchCallCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Phase 9.1 UI Wiring & Zero-API Verification: Deep Dive entry points exist in ResearchResultCard & ResearchReportDrawer, and DeepDiveWorkspaceView contains zero fetch calls', () => {
  const repoRoot = process.cwd();
  const cardSrc = fs.readFileSync(path.join(repoRoot, 'src/components/ResearchResultCard.tsx'), 'utf8');
  const drawerSrc = fs.readFileSync(path.join(repoRoot, 'src/components/ResearchReportDrawer.tsx'), 'utf8');
  const workspaceSrc = fs.readFileSync(
    path.join(repoRoot, 'src/components/DeepDiveWorkspaceView.tsx'),
    'utf8'
  );
  const registrySrc = fs.readFileSync(path.join(repoRoot, 'src/utils/deepDiveRegistry.ts'), 'utf8');
  const appSrc = fs.readFileSync(path.join(repoRoot, 'src/App.tsx'), 'utf8');

  // Entry points exist in Research Results card & Product Detail drawer
  assert.ok(cardSrc.includes('onOpenDeepDive'));
  assert.ok(cardSrc.includes('Deep Dive'));
  assert.ok(drawerSrc.includes('onOpenDeepDive'));
  assert.ok(drawerSrc.includes('Deep Dive'));

  // App integrates DeepDiveWorkspaceView cleanly as a view
  assert.ok(appSrc.includes('DeepDiveWorkspaceView'));
  assert.ok(appSrc.includes("activeView === 'deep-dive'"));

  // Progressive Disclosure reuses SiamPick's InfoPopover & ChevronDown/ChevronUp patterns,
  // and Phase 9.2 isolated execution slots render inside DeepDiveWorkspaceView without direct fetch calls
  assert.ok(workspaceSrc.includes('InfoPopover'));
  assert.ok(workspaceSrc.includes('aria-expanded={isExpanded}'));
  assert.ok(workspaceSrc.includes('data-execution-status={slot.status}'));
  assert.ok(workspaceSrc.includes('ModuleResultPanel'));

  // Zero fetch / API calls inside Phase 9.1 Deep Dive files
  assert.equal(/\bfetch\s*\(/.test(workspaceSrc), false);
  assert.equal(/\bfetch\s*\(/.test(registrySrc), false);
  assert.equal(workspaceSrc.includes('/api/'), false);
  assert.equal(registrySrc.includes('/api/'), false);
});
