import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  KalodataProductMetrics,
  OpportunityEvaluation,
  ResearchProduct,
} from '../src/types/product.ts';
import {
  buildMarketOpportunityMatrixData,
  computeAffiliateSaturationIndex,
  computeChannelRevenueMix,
  computeProductTechnicalAnalysis,
  getPriceTier,
} from '../src/utils/technicalAnalysis.ts';

function makeProduct(
  id: string,
  overrides?: Partial<ResearchProduct>,
  metricsOverrides?: Partial<KalodataProductMetrics>
): ResearchProduct {
  const defaultMetrics: KalodataProductMetrics = {
    productId: id,
    dateRange: 'last30Day',
    unitPriceThb: 299,
    salesVolume: 500,
    revenueThb: 149500,
    revenueGrowthRate: 28,
    commissionRatePct: 12,
    liveRevenueThb: 30000,
    videoRevenueThb: 110000,
    showcaseRevenueThb: 9500,
    creatorNumber: 25,
    videoNumber: 50,
    liveNumber: 5,
    launchDate: '2026-06-01',
    sellerId: 'shop-1',
    sellerName: 'Test Shop',
    skuCount: 3,
    priCategory: null,
    secCategory: null,
    terCategory: null,
    categoryIdsRequested: [],
    ...metricsOverrides,
  };

  return {
    id,
    name: `Test Product ${id}`,
    nameMy: `စမ်းသပ်ပစ္စည်း ${id}`,
    category: 'cosmetics-beauty',
    subCategory: 'Skincare',
    subCategoryMy: 'အသားအရေထိန်းသိမ်းမှု',
    shopName: 'Test Shop',
    dispatchHub: 'Bangkok',
    imageUrl: null,
    imageVerified: false,
    imageSourceNoteEn: '',
    imageSourceNoteMy: '',
    priceThb: 299,
    commissionRate: 12,
    commissionVerified: true,
    commissionNoteEn: '',
    commissionNoteMy: '',
    demandLevel: 'High',
    competitionLevel: 'Low',
    aiVideoSuitability: 'High',
    sellerReliabilityLevel: 'Reliable',
    opportunityScore: 82,
    confidenceLevel: 'High',
    scoringInputs: {} as ResearchProduct['scoringInputs'],
    whyChooseEn: '',
    whyChooseMy: '',
    demandEvidenceEn: [],
    demandEvidenceMy: [],
    salesPotentialEn: '',
    salesPotentialMy: '',
    reviewStrengthsEn: [],
    reviewStrengthsMy: [],
    customerComplaintsEn: [],
    customerComplaintsMy: [],
    competitionDetailEn: '',
    competitionDetailMy: '',
    sellerReliabilityEn: '',
    sellerReliabilityMy: '',
    generalRisksEn: [],
    generalRisksMy: [],
    aiVideoDetailEn: '',
    aiVideoDetailMy: '',
    videoIdeas: [
      { titleEn: '', titleMy: '', formatEn: '', formatMy: '', outlineEn: '', outlineMy: '' },
      { titleEn: '', titleMy: '', formatEn: '', formatMy: '', outlineEn: '', outlineMy: '' },
      { titleEn: '', titleMy: '', formatEn: '', formatMy: '', outlineEn: '', outlineMy: '' },
    ],
    sources: [],
    confidenceDetailEn: '',
    confidenceDetailMy: '',
    missingDataEn: [],
    missingDataMy: [],
    kalodataMetrics: defaultMetrics,
    ...overrides,
  };
}

function makeEval(totalScore: number): OpportunityEvaluation {
  return {
    totalScore,
    tier: totalScore >= 80 ? 'priority-test' : 'investigate-further',
    confidenceLevel: 'High',
    confidencePct: 90,
    salesWeightPct: 50,
    strategyPreset: 'balanced',
    weights: {
      salesPerformance: 20,
      revenuePerformance: 20,
      revenueGrowth: 15,
      commissionPotential: 15,
      competition: 10,
      marketDemand: 10,
      aiContentSuitability: 10,
    },
    verifiedCount: 6,
    estimatedCount: 1,
    unverifiedCount: 0,
    unavailableCount: 0,
    totalCriteria: 7,
    redistributedWeightPct: 0,
    criteria: [],
    strengthsEn: [],
    strengthsMy: [],
    weaknessesEn: [],
    weaknessesMy: [],
    risksEn: [],
    risksMy: [],
    confidenceExplanationEn: '',
    confidenceExplanationMy: '',
  };
}

test('1. Price-tier calibration differentiates low vs mid/high ASI saturation and video-yield thresholds', () => {
  assert.equal(getPriceTier(99).tier, 'low');
  assert.equal(getPriceTier(150).tier, 'mid');
  assert.equal(getPriceTier(500).tier, 'mid');
  assert.equal(getPriceTier(501).tier, 'high');
  assert.equal(getPriceTier(null).priceTierFallback, true);
  assert.equal(getPriceTier(null).tier, 'mid');

  // Same Rev/Creator (฿4,500 = 90,000 / 20) & Rev/Video (฿700 = 35,000 / 50)
  const lowTicket = makeProduct(
    'low-1',
    { priceThb: 99 },
    {
      unitPriceThb: 99,
      revenueThb: 90000,
      creatorNumber: 20,
      videoRevenueThb: 35000,
      videoNumber: 50,
      revenueGrowthRate: 15,
    }
  );
  const midTicket = makeProduct(
    'mid-1',
    { priceThb: 299 },
    {
      unitPriceThb: 299,
      revenueThb: 90000,
      creatorNumber: 20,
      videoRevenueThb: 35000,
      videoNumber: 50,
      revenueGrowthRate: 15,
    }
  );
  const highTicket = makeProduct(
    'high-1',
    { priceThb: 799 },
    {
      unitPriceThb: 799,
      revenueThb: 90000,
      creatorNumber: 20,
      videoRevenueThb: 35000,
      videoNumber: 50,
      revenueGrowthRate: 15,
    }
  );

  const lowAnalysis = computeProductTechnicalAnalysis(lowTicket);
  const midAnalysis = computeProductTechnicalAnalysis(midTicket);
  const highAnalysis = computeProductTechnicalAnalysis(highTicket);

  assert.ok(lowAnalysis.asi.score !== null && midAnalysis.asi.score !== null && highAnalysis.asi.score !== null);
  assert.ok(
    lowAnalysis.asi.score! < midAnalysis.asi.score!,
    `Expected low-ticket ASI (${lowAnalysis.asi.score}) < mid-ticket ASI (${midAnalysis.asi.score})`
  );
  assert.ok(
    midAnalysis.asi.score! < highAnalysis.asi.score!,
    `Expected mid-ticket ASI (${midAnalysis.asi.score}) < high-ticket ASI (${highAnalysis.asi.score})`
  );

  // Rev/Video = ฿700 passes low-ticket (>= ฿600) but fails mid-ticket (>= ฿1,500)
  const lowVideoYield = lowAnalysis.confluence.signals.find((s) => s.id === 'video-yield');
  const midVideoYield = midAnalysis.confluence.signals.find((s) => s.id === 'video-yield');
  assert.equal(lowVideoYield?.state, 'pass');
  assert.equal(midVideoYield?.state, 'fail');
});

test('2. Missing-data ASI guardrails enforce required creatorNumber and >= 2 factors', () => {
  // Missing creatorNumber -> unavailable
  const noCreators = makeProduct('no-cr', {}, { creatorNumber: null });
  const asiNoCreators = computeAffiliateSaturationIndex(noCreators);
  assert.equal(asiNoCreators.score, null);
  assert.equal(asiNoCreators.band, 'unavailable');
  assert.equal(asiNoCreators.completeness, 'unavailable');

  // Only creatorNumber present (1/3 factors) -> unavailable
  const onlyCreators = makeProduct(
    'only-cr',
    {},
    { creatorNumber: 30, revenueThb: null, revenueGrowthRate: null }
  );
  const asiOnlyCreators = computeAffiliateSaturationIndex(onlyCreators);
  assert.equal(asiOnlyCreators.score, null);
  assert.equal(asiOnlyCreators.band, 'unavailable');
  assert.equal(asiOnlyCreators.completeness, 'unavailable');

  // 2/3 factors (creatorNumber + revenueThb, missing growthRate) -> partial
  const twoFactors = makeProduct(
    'two-f',
    {},
    { creatorNumber: 30, revenueThb: 180000, revenueGrowthRate: null }
  );
  const asiTwo = computeAffiliateSaturationIndex(twoFactors);
  assert.ok(typeof asiTwo.score === 'number');
  assert.equal(asiTwo.completeness, 'partial');
  assert.equal(asiTwo.availableFactorCount, 2);

  // 3/3 factors -> full
  const threeFactors = makeProduct(
    'three-f',
    {},
    { creatorNumber: 30, revenueThb: 180000, revenueGrowthRate: 40 }
  );
  const asiThree = computeAffiliateSaturationIndex(threeFactors);
  assert.ok(typeof asiThree.score === 'number');
  assert.equal(asiThree.completeness, 'full');
  assert.equal(asiThree.availableFactorCount, 3);
});

test('3. Verified Margin strictly rejects estimated/unverified commission rates', () => {
  const unverifiedHigh = makeProduct('unver', {
    priceThb: 400,
    commissionRate: 25,
    commissionVerified: false,
    estimatedCommissionPerSaleThb: 100,
  });
  const unverifiedSignal = computeProductTechnicalAnalysis(unverifiedHigh).confluence.signals.find(
    (s) => s.id === 'verified-margin'
  );
  assert.equal(unverifiedSignal?.state, 'unavailable');

  const verifiedByRate = makeProduct('ver-rate', {
    priceThb: 100,
    commissionRate: 12,
    commissionVerified: true,
    estimatedCommissionPerSaleThb: null,
  });
  const rateSignal = computeProductTechnicalAnalysis(verifiedByRate).confluence.signals.find(
    (s) => s.id === 'verified-margin'
  );
  assert.equal(rateSignal?.state, 'pass');

  const verifiedByBaht = makeProduct('ver-baht', {
    priceThb: 500,
    commissionRate: 5, // < 10%, but 5% of ฿500 = ฿25/order >= ฿20
    commissionVerified: true,
    estimatedCommissionPerSaleThb: 25,
  });
  const bahtSignal = computeProductTechnicalAnalysis(verifiedByBaht).confluence.signals.find(
    (s) => s.id === 'verified-margin'
  );
  assert.equal(bahtSignal?.state, 'pass');

  const verifiedLow = makeProduct('ver-low', {
    priceThb: 150,
    commissionRate: 5, // ฿7.5/order < ฿20 and 5% < 10%
    commissionVerified: true,
    estimatedCommissionPerSaleThb: 7.5,
  });
  const lowSignal = computeProductTechnicalAnalysis(verifiedLow).confluence.signals.find(
    (s) => s.id === 'verified-margin'
  );
  assert.equal(lowSignal?.state, 'fail');
});

test('4. Tracked Channel Revenue Mix classifies video-led, hybrid, live-dominated, and unavailable', () => {
  const videoLed = computeChannelRevenueMix(
    makeProduct('ch-v', {}, { videoRevenueThb: 70000, liveRevenueThb: 30000 })
  );
  assert.equal(videoLed.available, true);
  assert.equal(videoLed.classification, 'video-led');
  assert.equal(videoLed.videoSharePct, 70);

  const hybrid = computeChannelRevenueMix(
    makeProduct('ch-h', {}, { videoRevenueThb: 40000, liveRevenueThb: 60000 })
  );
  assert.equal(hybrid.available, true);
  assert.equal(hybrid.classification, 'hybrid');
  assert.equal(hybrid.videoSharePct, 40);

  const liveDom = computeChannelRevenueMix(
    makeProduct('ch-l', {}, { videoRevenueThb: 20000, liveRevenueThb: 80000 })
  );
  assert.equal(liveDom.available, true);
  assert.equal(liveDom.classification, 'live-dominated');
  assert.equal(liveDom.videoSharePct, 20);

  const zeroDenom = computeChannelRevenueMix(
    makeProduct('ch-0', {}, { videoRevenueThb: 0, liveRevenueThb: 0 })
  );
  assert.equal(zeroDenom.available, false);
  assert.equal(zeroDenom.classification, 'unavailable');

  const nullMix = computeChannelRevenueMix(
    makeProduct('ch-n', {}, { videoRevenueThb: null, liveRevenueThb: 50000 })
  );
  assert.equal(nullMix.available, false);
  assert.equal(nullMix.classification, 'unavailable');
});

test('5. Confluence honest denominator enforces insufficient-data (<3) and exact verdict tiers', () => {
  // Only 2 evaluated signals (both pass: verified-margin + momentum), 3 unavailable -> insufficient-data
  const onlyTwo = makeProduct(
    'c-insuff',
    { priceThb: 300, commissionRate: 15, commissionVerified: true },
    {
      creatorNumber: null,
      videoRevenueThb: null,
      liveRevenueThb: null,
      videoNumber: null,
      revenueGrowthRate: 40,
    }
  );
  const insuffConf = computeProductTechnicalAnalysis(onlyTwo).confluence;
  assert.equal(insuffConf.passedCount, 2);
  assert.equal(insuffConf.evaluatedCount, 2);
  assert.equal(insuffConf.verdict, 'insufficient-data');

  // 5/5 -> strong-setup
  const strong = makeProduct(
    'c-5',
    { priceThb: 300, commissionRate: 15, commissionVerified: true },
    {
      creatorNumber: 20,
      revenueThb: 300000,
      videoRevenueThb: 240000,
      liveRevenueThb: 60000,
      videoNumber: 80, // ฿3,000/video >= ฿1,500
      revenueGrowthRate: 35,
    }
  );
  assert.equal(computeProductTechnicalAnalysis(strong).confluence.passedCount, 5);
  assert.equal(computeProductTechnicalAnalysis(strong).confluence.verdict, 'strong-setup');

  // 4/5 -> promising-setup (fail momentum)
  const promising = makeProduct(
    'c-4',
    { priceThb: 300, commissionRate: 15, commissionVerified: true },
    {
      creatorNumber: 20,
      revenueThb: 300000,
      videoRevenueThb: 240000,
      liveRevenueThb: 60000,
      videoNumber: 80,
      revenueGrowthRate: -5,
    }
  );
  assert.equal(computeProductTechnicalAnalysis(promising).confluence.passedCount, 4);
  assert.equal(computeProductTechnicalAnalysis(promising).confluence.verdict, 'promising-setup');

  // 3/5 -> mixed-signals (fail momentum & video-yield)
  const mixed = makeProduct(
    'c-3',
    { priceThb: 300, commissionRate: 15, commissionVerified: true },
    {
      creatorNumber: 20,
      revenueThb: 300000,
      videoRevenueThb: 240000,
      liveRevenueThb: 60000,
      videoNumber: 500, // ฿480/video < ฿1,500
      revenueGrowthRate: -5,
    }
  );
  assert.equal(computeProductTechnicalAnalysis(mixed).confluence.passedCount, 3);
  assert.equal(computeProductTechnicalAnalysis(mixed).confluence.verdict, 'mixed-signals');

  // 1/5 -> weak-setup
  const weak = makeProduct(
    'c-1',
    { priceThb: 300, commissionRate: 15, commissionVerified: true },
    {
      creatorNumber: 450,
      revenueThb: 200000, // Rev/Cr = ฿444 -> high ASI
      videoRevenueThb: 20000,
      liveRevenueThb: 180000, // 10% video
      videoNumber: 200, // ฿100/video
      revenueGrowthRate: -25,
    }
  );
  const weakConf = computeProductTechnicalAnalysis(weak).confluence;
  assert.equal(weakConf.passedCount, 1);
  assert.equal(weakConf.verdict, 'weak-setup');
});

test('6. Market Opportunity Matrix enforces 8+ gate, isolates unplotted products, and computes medians & Golden Zone', () => {
  const evalMap = new Map<string, OpportunityEvaluation>();

  // 5 plottable + 2 missing-metric products -> isReliable must be false, unplotted length = 2
  const smallBatch: ResearchProduct[] = [];
  for (let i = 1; i <= 5; i += 1) {
    const p = makeProduct(
      `s-${i}`,
      { priceThb: 300, commissionRate: 10 + i, commissionVerified: true, estimatedCommissionPerSaleThb: 30 + i * 5 },
      { creatorNumber: i * 10, revenueThb: i * 50000, salesVolume: i * 100 }
    );
    smallBatch.push(p);
    evalMap.set(p.id, makeEval(70 + i));
  }
  const missingCreator = makeProduct('m-cr', { estimatedCommissionPerSaleThb: 40 }, { creatorNumber: null });
  const missingComm = makeProduct(
    'm-cm',
    { commissionVerified: false, commissionRate: null, estimatedCommissionPerSaleThb: null },
    { creatorNumber: 15 }
  );
  smallBatch.push(missingCreator, missingComm);

  const smallMatrix = buildMarketOpportunityMatrixData(smallBatch, evalMap, 'commissionPerOrder');
  assert.equal(smallMatrix.isReliable, false);
  assert.equal(smallMatrix.points.length, 5);
  assert.equal(smallMatrix.unplottedProducts.length, 2);
  assert.ok(
    !smallMatrix.points.some((pt) => pt.product.id === 'm-cr' || pt.product.id === 'm-cm'),
    'Missing-metric products must never be plotted at 0'
  );

  // Full 8-product batch with clean deterministic medians:
  // Creators: [10, 20, 30, 40, 60, 80, 100, 120] -> medianX = (40 + 60) / 2 = 50
  // Comm/Order: [80, 70, 60, 20, 90, 85, 30, 10] -> sorted [10, 20, 30, 60, 70, 80, 85, 90] -> medianY = (60 + 70) / 2 = 65
  // Golden Zone (x <= 50 && y >= 65): (10, 80) and (20, 70) -> 2 products
  const specs: Array<[number, number]> = [
    [10, 80], // golden-zone
    [20, 70], // golden-zone
    [30, 60], // early-quiet
    [40, 20], // early-quiet
    [60, 90], // crowded-giants
    [80, 85], // crowded-giants
    [100, 30], // red-ocean
    [120, 10], // red-ocean
  ];
  const fullBatch: ResearchProduct[] = specs.map(([cr, comm], idx) => {
    const p = makeProduct(
      `f-${idx}`,
      { priceThb: 400, commissionRate: 15, commissionVerified: true, estimatedCommissionPerSaleThb: comm },
      { creatorNumber: cr, revenueThb: comm * 1000, salesVolume: (idx + 1) * 200 }
    );
    evalMap.set(p.id, makeEval(60 + idx * 4));
    return p;
  });

  const fullMatrix = buildMarketOpportunityMatrixData(fullBatch, evalMap, 'commissionPerOrder');
  assert.equal(fullMatrix.isReliable, true);
  assert.equal(fullMatrix.points.length, 8);
  assert.equal(fullMatrix.medianX, 50);
  assert.equal(fullMatrix.medianY, 65);
  assert.equal(fullMatrix.goldenZoneCount, 2);

  const goldenIds = fullMatrix.points
    .filter((pt) => pt.quadrant === 'golden-zone')
    .map((pt) => pt.product.id)
    .sort();
  assert.deepEqual(goldenIds, ['f-0', 'f-1']);
});
