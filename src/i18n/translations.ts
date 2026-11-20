import {
  AiVideoSuitability,
  CompetitionLevel,
  ConfidenceLevel,
  CriterionKey,
  DataStatus,
  DemandLevel,
  Language,
  RiskSeverity,
  ScoreTier,
  VerificationState,
} from '../types/product';

export const TRANSLATIONS: Record<
  Language,
  {
    navDiscover: string;
    navFashion: string;
    navBeauty: string;
    navStrategy: string;
    shortlistBtn: string;
    heroTitle: string;
    heroSubtitle: string;
    settingsHeading: string;
    settingMarketLabel: string;
    settingMarketValue: string;
    settingFixedNote: string;
    settingPriceLabel: string;
    settingPriceValue: string;
    strategyLabel: string;
    strategyBalanced: string;
    strategySales: string;
    strategyCommission: string;
    settingStrategyValue: string;
    weightFineTune: string;
    salesWeight: string;
    commissionWeight: string;
    settingCategoryLabel: string;
    settingBothCategories: string;
    categoryAll: string;
    categoryFashion: string;
    categoryBeauty: string;
    settingQuantityLabel: string;
    quantityProductsUnit: string;
    startHuntingBtn: string;
    resumeAndStartBtn: string;
    huntingInProgress: string;
    huntingCancelBtn: string;
    huntingLoadingTitle: string;
    huntingLoadingDesc: string;
    huntingErrorTitle: string;
    huntingRetryBtn: string;
    groundingBarLabel: string;
    kalodataSourceBarLabel: string;
    kalodataSourceNote: string;
    liveStorefrontBarLabel: string;
    liveStorefrontNote: string;
    groundingSourcesCount: string;
    groundingToggleShow: string;
    groundingToggleHide: string;
    groundingQueriesLabel: string;
    // Quota Pause & Resume
    quotaPausedTitle: string;
    quotaPausedDesc: string;
    quotaResetUnknownNote: string;
    manualPausedTitle: string;
    manualPausedDesc: string;
    btnPauseResearch: string;
    btnResumeResearch: string;
    btnResumeAndRetry: string;
    // Quality over Quantity
    qualityGateVerifiedLabel: string;
    qualityGateRequestedLabel: string;
    qualityGateExcludedNote: string;
    resultsSectionHeading: string;
    queueActive: string;
    queueSaved: string;
    queueRejected: string;
    sortLabel: string;
    sortScoreDesc: string;
    sortScoreAsc: string;
    sortConfidenceDesc: string;
    sortPriceAsc: string;
    sortPriceDesc: string;
    cardPrice: string;
    cardCommission: string;
    cardCommissionUnverified: string;
    cardCommissionVerified: string;
    cardRatingReviews: string;
    cardReviewsUnit: string;
    cardDemand: string;
    cardCompetition: string;
    cardAiVideo: string;
    cardOpportunityScore: string;
    cardConfidence: string;
    cardImageUnverified: string;
    cardOpenReport: string;
    dataStatusLabels: Record<DataStatus, string>;
    btnSaveProduct: string;
    btnSavedProduct: string;
    btnRejectProduct: string;
    btnRestoreProduct: string;
    perOrder: string;
    emptyLiveTitle: string;
    emptyLiveDesc: string;
    emptyStartBtn: string;
    emptyFilteredTitle: string;
    emptyFilteredDesc: string;
    resetViewBtn: string;
    // Detailed 14-Section Research Report + 14-Point Verification Matrix
    reportTitle: string;
    reportClose: string;
    reportJumpSummary: string;
    reportJumpReviews: string;
    reportJumpRisks: string;
    reportJumpVideo: string;
    reportJumpSources: string;
    dataVerificationHeading: string;
    dataVerificationSubtitle: string;
    fieldPrice: string;
    fieldSeller: string;
    fieldSalesEvidence: string;
    fieldReviewCount: string;
    fieldCustomerRating: string;
    fieldCustomerFeedback: string;
    fieldMarketDemand: string;
    fieldCompetition: string;
    fieldCommissionRate: string;
    fieldCommissionPerSale: string;
    fieldSellerReliability: string;
    fieldProductQuality: string;
    fieldAiVideoPotential: string;
    fieldSourceLinks: string;
    productQualityHeading: string;
    sec01WhyChoose: string;
    sec02MarketDemand: string;
    sec03SalesPotential: string;
    sec04CommissionIncome: string;
    sec05ReviewStrengths: string;
    sec06CustomerComplaints: string;
    sec07CompetitorLandscape: string;
    sec08SellerReliability: string;
    sec09ProductRisks: string;
    sec10AiVideoPotential: string;
    sec11VideoContentIdeas: string;
    sec12ResearchSources: string;
    sec13ConfidenceLevel: string;
    sec14MissingData: string;
    fashionRiskHeading: string;
    fashionRiskSizing: string;
    fashionRiskFabric: string;
    fashionRiskColor: string;
    fashionRiskFit: string;
    cosmeticsCheckHeading: string;
    cosmeticsAuthenticity: string;
    cosmeticsThaiFda: string;
    cosmeticsAdClaims: string;
    estEarningPerSale: string;
    sourcePendingLink: string;
    sourceOpenLink: string;
    reportCopy: string;
    reportCopied: string;
    shortlistEmptyTitle: string;
    shortlistEmptyDesc: string;
    shortlistExportCsv: string;
    shortlistCopySummary: string;
    shortlistAvgScore: string;
    footerNote: string;
    marketScope: string;
    demandLabels: Record<DemandLevel, string>;
    competitionLabels: Record<CompetitionLevel, string>;
    aiVideoLabels: Record<AiVideoSuitability, string>;
    confidenceLabels: Record<ConfidenceLevel, string>;
    riskSeverityLabels: Record<RiskSeverity, string>;
    verificationLabels: Record<VerificationState, string>;
    sellerReliabilityLabels: Record<'Reliable' | 'Standard' | 'Needs Check', string>;
    scoringToggleBtn: string;
    scoringPanelTitle: string;
    scoringDisclaimer: string;
    scoringVerificationRule: string;
    scoringPairReminder: string;
    scoringBreakdownHeading: string;
    scoringJumpLabel: string;
    scoringVerifiedCountLabel: string;
    scoringCappedNote: string;
    scoringTierRanges: Record<ScoreTier, string>;
    scoringTierLabels: Record<ScoreTier, string>;
    criterionLabels: Record<CriterionKey, string>;
    criterionVerificationLabels: Record<DataStatus, string>;
    savedViewTitle: string;
    savedViewSubtitle: string;
    savedViewBackBtn: string;
    savedStorageNote: string;
    savedResearchDateLabel: string;
    savedSourcesLabel: string;
    savedDeleteBtn: string;
    savedSortNewest: string;
    savedNoSources: string;
    kalodataSectionLabel: string;
    kalodataChecking: string;
    kalodataBalanceLabel: string;
    kalodataCheckBtn: string;
    // Upgraded Product Hunting Settings (Multi-select, Custom Quantity, Cost Preview, Spending Protection)
    selectBothAction: string;
    noCategorySelectedWarning: string;
    bothModeLabel: string;
    bothModeCombined: string;
    bothModeSplit: string;
    bothModeCombinedDesc: string;
    bothModeSplitDesc: string;
    customQuantityLabel: string;
    customQuantityHint: string;
    costPreviewHeading: string;
    estimatedCostLabel: string;
    actualCostLabel: string;
    actualCostUnavailable: string;
    plannedCallsLabel: string;
    actualCallsLabel: string;
    creditsUnit: string;
    pricingFormulaNote: string;
    spendingLimitLabel: string;
    spendingLimitExceededTitle: string;
    spendingLimitExceededDesc: string;
    confirmHeading: string;
    confirmNotice: string;
    confirmStartBtn: string;
    confirmCancelBtn: string;
    // Research Modes (Fast / Balanced / Deep Research)
    researchModeLabel: string;
    modeFastTitle: string;
    modeFastDesc: string;
    modeBalancedTitle: string;
    modeBalancedDesc: string;
    modeDeepTitle: string;
    modeDeepDesc: string;
    deepDiveCountLabel: string;
    deepDiveCountHint: string;
    includeReviewInsightsLabel: string;
    includeReviewInsightsDesc: string;
    breakdownRankLabel: string;
    breakdownDetailLabel: string;
    breakdownShopLabel: string;
    breakdownReviewLabel: string;
    geminiAnalysisActiveLabel: string;
    depthTagDeep: string;
    depthTagDetail: string;
  }
> = {
  en: {
    navDiscover: 'Results',
    navFashion: "Women's Fashion",
    navBeauty: 'Cosmetics & Beauty',
    navStrategy: 'Settings',
    shortlistBtn: 'Saved',
    heroTitle: 'Thailand TikTok Shop Product Hunting',
    heroSubtitle:
      "Research real, verifiable Women's Fashion and Cosmetics & Beauty products for Thailand TikTok Shop with live Google Search grounding, separate product image verification, and transparent 4-state data scoring.",
    settingsHeading: 'Product Research Settings',
    settingMarketLabel: 'Market',
    settingMarketValue: 'Thailand TikTok Shop',
    settingFixedNote: 'Fixed market',
    settingPriceLabel: 'Product Price',
    settingPriceValue: 'No price limit',
    strategyLabel: 'Commission Strategy',
    strategyBalanced: 'Balanced Fit',
    strategySales: 'Sales Momentum',
    strategyCommission: 'Margin Focus',
    settingStrategyValue: 'Balanced commission & sales potential',
    weightFineTune: 'Custom balance',
    salesWeight: 'Sales potential',
    commissionWeight: 'Commission value',
    settingCategoryLabel: 'Product Category',
    settingBothCategories: 'Both Categories',
    categoryAll: 'All Products',
    categoryFashion: "Women's Fashion",
    categoryBeauty: 'Cosmetics & Beauty',
    settingQuantityLabel: 'Research Quantity',
    quantityProductsUnit: 'Products',
    startHuntingBtn: 'Start Product Hunting',
    resumeAndStartBtn: 'Resume & Start Hunting',
    huntingInProgress: 'Verifying Thailand TikTok Shop products...',
    huntingCancelBtn: 'Cancel',
    huntingLoadingTitle: 'Running live grounded search & listing verification',
    huntingLoadingDesc:
      'Searching real Thailand TikTok Shop listings, deduplicating products, checking official pages for live product images and prices, and calculating proportional 100-point scores.',
    huntingErrorTitle: 'Live research could not be completed',
    huntingRetryBtn: 'Try Again',
    groundingBarLabel: 'Google Search Grounding',
    kalodataSourceBarLabel: 'Kalodata OpenAPI · Thailand TikTok Shop',
    kalodataSourceNote:
      'Live Thailand TikTok Shop affiliate products (commission_rate > 0) retrieved directly from Kalodata Product Rank API using verified TH Category IDs (601152 / 601450). Fields not included in Product Rank (ratings, reviews, competition, shop score) remain honestly marked Unavailable/Unverified.',
    liveStorefrontBarLabel: 'Live Official Thai Storefronts',
    liveStorefrontNote:
      'Google Search Grounding quota is currently limited, so products, THB prices, links, and photos were verified live from official Thai brand storefronts and analyzed by Gemini.',
    groundingSourcesCount: 'verified web sources',
    groundingToggleShow: 'View sources',
    groundingToggleHide: 'Hide sources',
    groundingQueriesLabel: 'Search queries used',
    quotaPausedTitle: 'Live Research Paused — Google Search Grounding Quota Exhausted',
    quotaPausedDesc:
      'Google Search Grounding has reached its current API quota limit, so live product research is paused. SiamPick does not generate unverified or fabricated products without live web evidence.',
    quotaResetUnknownNote:
      'Quota reset timing is not reported by the API. Wait until your quota replenishes or configure a billing-enabled Gemini API key in Settings > Secrets, then click Resume & Retry.',
    manualPausedTitle: 'Live Research Paused',
    manualPausedDesc:
      'Product research is currently paused. Click Resume Research when you are ready to run live Google Search grounding again.',
    btnPauseResearch: 'Pause Research',
    btnResumeResearch: 'Resume Research',
    btnResumeAndRetry: 'Resume & Retry Live Search',
    qualityGateVerifiedLabel: 'verified products returned',
    qualityGateRequestedLabel: 'requested',
    qualityGateExcludedNote:
      'Quality-first filter: unverified or duplicate candidates were excluded rather than padded.',
    resultsSectionHeading: 'Research Results',
    queueActive: 'Active',
    queueSaved: 'Saved',
    queueRejected: 'Rejected',
    sortLabel: 'Sort by',
    sortScoreDesc: 'Opportunity Score: High to Low',
    sortScoreAsc: 'Opportunity Score: Low to High',
    sortConfidenceDesc: 'Confidence Level: High to Low',
    sortPriceAsc: 'Price: Low to High',
    sortPriceDesc: 'Price: High to Low',
    cardPrice: 'Price (THB)',
    cardCommission: 'Commission Rate',
    cardCommissionUnverified: 'Unverified',
    cardCommissionVerified: 'Verified',
    cardRatingReviews: 'Rating & Reviews',
    cardReviewsUnit: 'reviews',
    cardDemand: 'Demand',
    cardCompetition: 'Competition',
    cardAiVideo: 'AI Video Fit',
    cardOpportunityScore: 'Opportunity Score',
    cardConfidence: 'Confidence',
    cardImageUnverified: 'Verified image unavailable',
    cardOpenReport: 'View Research Report',
    dataStatusLabels: {
      verified: 'Verified',
      estimated: 'Estimated',
      unverified: 'Unverified',
      unavailable: 'Unavailable',
    },
    btnSaveProduct: 'Save Product',
    btnSavedProduct: 'Saved',
    btnRejectProduct: 'Reject Product',
    btnRestoreProduct: 'Restore',
    perOrder: '/ order',
    emptyLiveTitle: 'Ready to research Thailand TikTok Shop',
    emptyLiveDesc:
      "Select Women's Fashion, Cosmetics & Beauty, or Both Categories above, choose 10, 20, or 30 products, and click Start Product Hunting to run live verified research.",
    emptyStartBtn: 'Start Product Hunting',
    emptyFilteredTitle: 'No products in this view',
    emptyFilteredDesc:
      'Switch category tabs or review your Saved and Rejected lists to see matching items.',
    resetViewBtn: 'Show All Active',
    reportTitle: 'Detailed Research Report',
    reportClose: 'Close',
    reportJumpSummary: 'Overview',
    reportJumpReviews: 'Reviews',
    reportJumpRisks: 'Risks & Compliance',
    reportJumpVideo: 'AI Video',
    reportJumpSources: 'Sources & Gaps',
    dataVerificationHeading: 'Data Provenance Summary (14 Data Points)',
    dataVerificationSubtitle:
      'Public web signals only — private TikTok Shop Affiliate backend data is never fabricated.',
    fieldPrice: 'Actual Product Price',
    fieldSeller: 'Actual Seller / Shop',
    fieldSalesEvidence: 'Sales Evidence',
    fieldReviewCount: 'Review Count',
    fieldCustomerRating: 'Customer Rating',
    fieldCustomerFeedback: 'Customer Feedback',
    fieldMarketDemand: 'Market Demand',
    fieldCompetition: 'Competition',
    fieldCommissionRate: 'Commission Rate',
    fieldCommissionPerSale: 'Est. Commission / Sale',
    fieldSellerReliability: 'Seller Reliability',
    fieldProductQuality: 'Product Quality Evidence',
    fieldAiVideoPotential: 'AI Video Potential',
    fieldSourceLinks: 'Source Links',
    productQualityHeading: 'Product Quality Evidence',
    sec01WhyChoose: '01. Why Choose This Product',
    sec02MarketDemand: '02. Current Market Demand Evidence',
    sec03SalesPotential: '03. Sales Potential',
    sec04CommissionIncome: '04. Commission Rate & Earning per Sale',
    sec05ReviewStrengths: '05. Customer Review Strengths',
    sec06CustomerComplaints: '06. Customer Complaints & Weaknesses',
    sec07CompetitorLandscape: '07. Competitor Landscape',
    sec08SellerReliability: '08. Seller Reliability',
    sec09ProductRisks: '09. Potential Product Risks',
    sec10AiVideoPotential: '10. AI Video Advertising Potential',
    sec11VideoContentIdeas: '11. 3 Video Content Ideas',
    sec12ResearchSources: '12. Research Sources & Links',
    sec13ConfidenceLevel: '13. Confidence Level',
    sec14MissingData: '14. Unavailable / Pending Data',
    fashionRiskHeading: 'Women’s Fashion Return Risk Assessment',
    fashionRiskSizing: 'Sizing & Measurements',
    fashionRiskFabric: 'Fabric Quality & Care',
    fashionRiskColor: 'Color Accuracy',
    fashionRiskFit: 'Wear & Silhouette Fit',
    cosmeticsCheckHeading: 'Cosmetics Authenticity, Thai FDA & Ad Claim Check',
    cosmeticsAuthenticity: 'Brand Authenticity',
    cosmeticsThaiFda: 'Thai FDA (อย.) Evidence',
    cosmeticsAdClaims: 'Health / Beauty Claim Safety',
    estEarningPerSale: 'Est. earning per sale',
    sourcePendingLink: 'No direct URL verified',
    sourceOpenLink: 'Open source',
    reportCopy: 'Copy report',
    reportCopied: 'Copied',
    shortlistEmptyTitle: 'No saved products yet',
    shortlistEmptyDesc:
      'Use the Save Product button on any research card to keep your selected opportunities here across page refreshes.',
    shortlistExportCsv: 'Export CSV',
    shortlistCopySummary: 'Copy summary',
    shortlistAvgScore: 'Avg. Opportunity Score',
    footerNote: 'SiamPick · Thailand TikTok Shop Affiliate Research',
    marketScope: 'Market: Thailand TikTok Shop (THB ฿) · Unrestricted Pricing',
    demandLabels: {
      High: 'High',
      Growing: 'Growing',
      Steady: 'Steady',
      Moderate: 'Moderate',
    },
    competitionLabels: {
      Low: 'Low',
      Moderate: 'Moderate',
      High: 'High',
    },
    aiVideoLabels: {
      High: 'High',
      Good: 'Good',
      Moderate: 'Moderate',
    },
    confidenceLabels: {
      High: 'High',
      Medium: 'Medium',
      Low: 'Low',
    },
    riskSeverityLabels: {
      Low: 'Low risk',
      Watch: 'Watch',
      High: 'High risk',
    },
    verificationLabels: {
      Verified: 'Verified',
      'Needs Check': 'Needs verification',
      Caution: 'Strict caution',
    },
    sellerReliabilityLabels: {
      Reliable: 'Reliable',
      Standard: 'Standard',
      'Needs Check': 'Needs check',
    },
    scoringToggleBtn: 'Scoring System (100 pts)',
    scoringPanelTitle: 'Opportunity Scoring System (100 Points)',
    scoringDisclaimer:
      'Independent Research Evaluation System — calculated internally and NOT an official TikTok or TikTok Shop score.',
    scoringVerificationRule:
      'Proportional verification weighting: Verified (up to 100%), Estimated (up to 62%), Unverified (up to 25%), Unavailable (0 pts). Low Confidence products cannot be recommended as Priority.',
    scoringPairReminder:
      'Always evaluate Opportunity Score together with Confidence Level and underlying Research Evidence.',
    scoringBreakdownHeading: 'Opportunity Score Breakdown (100 Points)',
    scoringJumpLabel: 'Score Breakdown',
    scoringVerifiedCountLabel: 'criteria verified',
    scoringCappedNote: 'Weighted by verification status',
    scoringTierRanges: {
      'priority-test': '80–100',
      'investigate-further': '65–79',
      'low-priority': 'Under 65',
    },
    scoringTierLabels: {
      'priority-test': 'Priority product to test',
      'investigate-further': 'Worth investigating further',
      'low-priority': 'Low priority product',
    },
    criterionLabels: {
      demandSales: 'Demand & Sales Evidence',
      commissionEarning: 'Commission & Earning Potential',
      aiCreative: 'AI Creative Potential',
      reviewsQuality: 'Customer Reviews & Quality',
      priceAppeal: 'Price & Buyer Appeal',
      competitionOpportunity: 'Competition Opportunity',
      sellerReliability: 'Seller Reliability',
    },
    criterionVerificationLabels: {
      verified: 'Verified',
      estimated: 'Estimated (max 62%)',
      unverified: 'Unverified (max 25%)',
      unavailable: 'Unavailable (0 pts)',
    },
    savedViewTitle: 'Saved Products',
    savedViewSubtitle:
      'Review saved products, research dates, sources, and full research reports anytime — stored reliably in your browser across page refreshes.',
    savedViewBackBtn: 'Back to Product Hunting',
    savedStorageNote: 'Stored locally in this browser · Kept after refresh',
    savedResearchDateLabel: 'Research Date',
    savedSourcesLabel: 'Research Sources',
    savedDeleteBtn: 'Delete',
    savedSortNewest: 'Recently Saved',
    savedNoSources: 'No verified source links recorded yet',
    kalodataSectionLabel: 'Kalodata Open Center · Credit Balance',
    kalodataChecking: 'Checking Kalodata free credit balance...',
    kalodataBalanceLabel: 'Credit Balance',
    kalodataCheckBtn: 'Check Balance',
    selectBothAction: 'Select Both',
    noCategorySelectedWarning: 'Select at least one category to start product hunting.',
    bothModeLabel: 'Query Mode (Both Categories)',
    bothModeCombined: 'Combined (1 query)',
    bothModeSplit: 'Split per category',
    bothModeCombinedDesc: 'Sends 601152 & 601450 together — lower credit cost',
    bothModeSplitDesc: 'Queries 601152 & 601450 separately — balanced 50/50 split',
    customQuantityLabel: 'Custom',
    customQuantityHint: '1–500 (auto-paginated at 100/call)',
    costPreviewHeading: 'Cost Preview & Spending Limit',
    estimatedCostLabel: 'Estimated Cost',
    actualCostLabel: 'Actual Cost (Last Run)',
    actualCostUnavailable: 'Unavailable',
    plannedCallsLabel: 'API calls',
    actualCallsLabel: 'actual calls',
    creditsUnit: 'credits',
    pricingFormulaNote:
      'Kalodata Pricing: Rank 0.1 cr/100 rows · Product Detail 0.1 cr · Shop Detail 0.1 cr · Review Insight 1.0 cr (1 cr ≈ $0.10)',
    spendingLimitLabel: 'Spending Limit (Credits)',
    spendingLimitExceededTitle: 'Estimated cost exceeds spending limit',
    spendingLimitExceededDesc:
      'Switch to Fast Mode, lower quantity or Deep-Inspect count, or raise your Spending Limit before calling Kalodata API.',
    confirmHeading: 'Confirm Kalodata API Research',
    confirmNotice:
      'No API call has been made yet. Review your verified category IDs, research mode, and estimated credit cost before confirming.',
    confirmStartBtn: 'Confirm & Start Hunting',
    confirmCancelBtn: 'Cancel',
    researchModeLabel: 'Research Mode',
    modeFastTitle: 'Fast Mode',
    modeFastDesc: 'Minimal calls · 7d Rank scan (sales, revenue, commission)',
    modeBalancedTitle: 'Balanced Mode',
    modeBalancedDesc: '30d wider pool filter + Top 3 Product Detail + Gemini analysis',
    modeDeepTitle: 'Deep Research',
    modeDeepDesc: 'Product Detail + Shop Detail + deep risk audit (cost-capped)',
    deepDiveCountLabel: 'Deep-inspect top products',
    deepDiveCountHint: 'Max 10 finalists to prevent runaway API spend',
    includeReviewInsightsLabel: 'Include Buyer Review Insights',
    includeReviewInsightsDesc: 'Real Thai buyer praise & complaints · +1.0 cr/item (max 2 items)',
    breakdownRankLabel: 'Rank',
    breakdownDetailLabel: 'Detail',
    breakdownShopLabel: 'Shop',
    breakdownReviewLabel: 'Reviews',
    geminiAnalysisActiveLabel: 'Gemini Analysis (Kalodata data only)',
    depthTagDeep: 'Deep Audited',
    depthTagDetail: 'Detail Verified',
  },
  my: {
    navDiscover: 'ရလဒ်များ',
    navFashion: "Women's Fashion",
    navBeauty: 'Cosmetics & Beauty',
    navStrategy: 'သတ်မှတ်ချက်',
    shortlistBtn: 'သိမ်းထားသော',
    heroTitle: 'ထိုင်း TikTok Shop Product Hunting',
    heroSubtitle:
      "Women's Fashion နှင့် Cosmetics & Beauty အတွက် Google Search Grounding၊ သီးခြား Product Image စစ်ဆေးမှုနှင့် Verified / Estimated / Unverified / Unavailable အဆင့်ခွဲခြားမှုဖြင့် တကယ်ရောင်းချနေသော Product များကိုသာ Research ပြုလုပ်ပါ။",
    settingsHeading: 'Product Research သတ်မှတ်ချက်များ',
    settingMarketLabel: 'ဈေးကွက် (Market)',
    settingMarketValue: 'Thailand TikTok Shop',
    settingFixedNote: 'အမြဲတမ်းသတ်မှတ်ထားသည်',
    settingPriceLabel: 'Product ဈေးနှုန်း',
    settingPriceValue: 'ကန့်သတ်ချက်မရှိ',
    strategyLabel: 'Commission Strategy',
    strategyBalanced: 'မျှတသောရွေးချယ်မှု',
    strategySales: 'ရောင်းအားဦးစားပေး',
    strategyCommission: 'Commission ဦးစားပေး',
    settingStrategyValue: 'Commission နှင့် ရောင်းအားအလားအလာ မျှတစွာရွေးချယ်မည်',
    weightFineTune: 'အချိုးအစား ချိန်ညှိရန်',
    salesWeight: 'ရောင်းအားအလားအလာ',
    commissionWeight: 'Commission တန်ဖိုး',
    settingCategoryLabel: 'Product Category',
    settingBothCategories: 'Both Categories',
    categoryAll: 'အားလုံး',
    categoryFashion: "Women's Fashion",
    categoryBeauty: 'Cosmetics & Beauty',
    settingQuantityLabel: 'ရှာဖွေမည့်အရေအတွက် (Research Quantity)',
    quantityProductsUnit: 'Products',
    startHuntingBtn: 'Start Product Hunting',
    resumeAndStartBtn: 'ပြန်လည်စတင်ရန် (Resume & Hunt)',
    huntingInProgress: 'တကယ်ရောင်းချနေသော Product များကို စစ်ဆေးရှာဖွေနေပါသည်...',
    huntingCancelBtn: 'ရပ်တန့်ရန်',
    huntingLoadingTitle: 'Live Google Search Grounding နှင့် Listing စစ်ဆေးမှု လုပ်ဆောင်နေပါသည်',
    huntingLoadingDesc:
      'ထိုင်း TikTok Shop Product များကို ရှာဖွေခြင်း၊ ထပ်နေသော Product များဖယ်ရှားခြင်း၊ တရားဝင်စာမျက်နှာမှ ဓာတ်ပုံနှင့်ဈေးနှုန်းစစ်ဆေးခြင်းနှင့် အမှတ်တွက်ချက်ခြင်း ပြုလုပ်နေပါသည်။',
    huntingErrorTitle: 'Live Research လုပ်ဆောင်၍ မရနိုင်သေးပါ',
    huntingRetryBtn: 'ထပ်မံကြိုးစားရန်',
    groundingBarLabel: 'Google Search Grounding',
    kalodataSourceBarLabel: 'Kalodata OpenAPI · ထိုင်း TikTok Shop',
    kalodataSourceNote:
      'အတည်ပြုပြီး TH Category IDs (601152 / 601450) ဖြင့် Kalodata Product Rank API မှ တိုက်ရိုက်ရယူထားသော Affiliate Product များ (commission_rate > 0) ဖြစ်ပါသည်။ API တွင် မပါဝင်သော Rating/Reviews/Competition တို့ကို Unavailable/Unverified အဖြစ် ရိုးသားစွာ ဖော်ပြထားပါသည်။',
    liveStorefrontBarLabel: 'တရားဝင် ထိုင်း Brand ဆိုင်များမှ Live စစ်ဆေးမှု',
    liveStorefrontNote:
      'လက်ရှိ Google Search Grounding Quota ကန့်သတ်ချက်ကြောင့် Product အမည်၊ THB ဈေးနှုန်း၊ တရားဝင် Link နှင့် ဓာတ်ပုံများကို ထိုင်း Brand ဆိုင်စစ်များမှ တိုက်ရိုက် Live စစ်ဆေးပြီး Gemini AI ဖြင့် ခွဲခြမ်းစိတ်ဖြာထားပါသည်။',
    groundingSourcesCount: 'ခု အတည်ပြုပြီး Web Sources',
    groundingToggleShow: 'Sources ကြည့်ရန်',
    groundingToggleHide: 'Sources ပိတ်ရန်',
    groundingQueriesLabel: 'အသုံးပြုခဲ့သော ရှာဖွေမှုများ',
    quotaPausedTitle: 'Live Research ခေတ္တရပ်နားထားသည် — Google Search Grounding Quota ပြည့်နေပါသည်',
    quotaPausedDesc:
      'လက်ရှိ API Key တွင် Google Search Grounding Quota ပြည့်နေသဖြင့် Live Research ကို ခေတ္တရပ်နားထားပါသည်။ Web အထောက်အထားမရှိဘဲ AI ဖြင့်ခန့်မှန်းထားသော Unverified Product များကို ဖန်တီးပြသမည်မဟုတ်ပါ။',
    quotaResetUnknownNote:
      'Quota ပြန်လည်ပြည့်မည့်အချိန်ကို API မှ အတိအကျမဖော်ပြပါ။ Quota ပြန်ရချိန် သို့မဟုတ် Settings > Secrets တွင် Billing ချိတ်ဆက်ထားသော API Key ထည့်သွင်းပြီးနောက် ပြန်လည်စတင်နိုင်ပါသည်။',
    manualPausedTitle: 'Live Research ကို ခေတ္တရပ်နားထားပါသည်',
    manualPausedDesc:
      'Product Research ကို ခေတ္တရပ်နားထားပါသည်။ Live Google Search Grounding ပြန်လည်အသုံးပြုလိုပါက Resume ခလုတ်ကို နှိပ်ပါ။',
    btnPauseResearch: 'ခေတ္တရပ်နားရန် (Pause)',
    btnResumeResearch: 'ပြန်လည်ဖွင့်ရန် (Resume)',
    btnResumeAndRetry: 'Resume လုပ်ပြီး ထပ်မံရှာဖွေရန်',
    qualityGateVerifiedLabel: 'ခု အတည်ပြုနိုင်သော Product ရရှိ',
    qualityGateRequestedLabel: 'ခု တောင်းဆိုမှုအနက်',
    qualityGateExcludedNote:
      'အရည်အသွေးဦးစားပေးစနစ် — အတည်မပြုနိုင်သော သို့မဟုတ် ထပ်နေသော Product များကို အရေအတွက်ပြည့်ရန် ထည့်သွင်းခြင်းမပြုဘဲ ဖယ်ရှားထားပါသည်။',
    resultsSectionHeading: 'Research ရလဒ်များ',
    queueActive: 'လက်ရှိစာရင်း',
    queueSaved: 'သိမ်းထားသော',
    queueRejected: 'ပယ်ဖျက်ထားသော',
    sortLabel: 'စီစဉ်ရန်',
    sortScoreDesc: 'Opportunity Score: အမြင့်မှအနိမ့်',
    sortScoreAsc: 'Opportunity Score: အနိမ့်မှအမြင့်',
    sortConfidenceDesc: 'Confidence Level: အမြင့်မှအနိမ့်',
    sortPriceAsc: 'ဈေးနှုန်း: အနည်းမှအများ',
    sortPriceDesc: 'ဈေးနှုန်း: အများမှအနည်း',
    cardPrice: 'ဈေးနှုန်း (THB)',
    cardCommission: 'Commission Rate',
    cardCommissionUnverified: 'Unverified',
    cardCommissionVerified: 'Verified',
    cardRatingReviews: 'Rating နှင့် Reviews',
    cardReviewsUnit: 'reviews',
    cardDemand: 'Demand အခြေအနေ',
    cardCompetition: 'Competition အခြေအနေ',
    cardAiVideo: 'AI Video သင့်တော်မှု',
    cardOpportunityScore: 'Opportunity Score',
    cardConfidence: 'Confidence Level',
    cardImageUnverified: 'Verified image unavailable',
    cardOpenReport: 'Research Report ကြည့်ရန်',
    dataStatusLabels: {
      verified: 'Verified',
      estimated: 'Estimated',
      unverified: 'Unverified',
      unavailable: 'Unavailable',
    },
    btnSaveProduct: 'Save Product',
    btnSavedProduct: 'သိမ်းပြီး',
    btnRejectProduct: 'Reject Product',
    btnRestoreProduct: 'ပြန်ယူရန်',
    perOrder: '/ ခု',
    emptyLiveTitle: 'ထိုင်း TikTok Shop Product Research စတင်ရန် အဆင်သင့်ဖြစ်ပါပြီ',
    emptyLiveDesc:
      "အထက်ရှိ Settings တွင် Women's Fashion၊ Cosmetics & Beauty သို့မဟုတ် Both Categories နှင့် အရေအတွက် (10 / 20 / 30) ကို ရွေးချယ်ပြီး Start Product Hunting ကို နှိပ်၍ Live Research စတင်ပါ။",
    emptyStartBtn: 'Start Product Hunting',
    emptyFilteredTitle: 'ဤစာရင်းတွင် Product မရှိသေးပါ',
    emptyFilteredDesc:
      'Category Tab များ သို့မဟုတ် သိမ်းထားသော/ပယ်ဖျက်ထားသော စာရင်းများကို ပြောင်းလဲကြည့်ရှုပါ။',
    resetViewBtn: 'အားလုံးပြန်ကြည့်ရန်',
    reportTitle: 'Product Research Report အသေးစိတ်',
    reportClose: 'ပိတ်ရန်',
    reportJumpSummary: 'အနှစ်ချုပ်',
    reportJumpReviews: 'Reviews',
    reportJumpRisks: 'Risk နှင့် စစ်ဆေးချက်',
    reportJumpVideo: 'AI ဗီဒီယို',
    reportJumpSources: 'Sources နှင့် မပြည့်စုံမှု',
    dataVerificationHeading: 'အချက်အလက်အတည်ပြုမှု အနှစ်ချုပ် (အချက် ၁၄ ချက်)',
    dataVerificationSubtitle:
      'အများပြည်သူမြင်နိုင်သော Web အထောက်အထားများကိုသာ အခြေခံထားပြီး Private TikTok Shop Affiliate ဒေတာများကို တီထွင်ဖော်ပြခြင်းမပြုပါ။',
    fieldPrice: 'Actual Product Price',
    fieldSeller: 'Actual Seller / Shop',
    fieldSalesEvidence: 'Sales Evidence',
    fieldReviewCount: 'Review Count',
    fieldCustomerRating: 'Customer Rating',
    fieldCustomerFeedback: 'Customer Feedback',
    fieldMarketDemand: 'Market Demand',
    fieldCompetition: 'Competition',
    fieldCommissionRate: 'Commission Rate',
    fieldCommissionPerSale: 'Est. Commission / Sale',
    fieldSellerReliability: 'Seller Reliability',
    fieldProductQuality: 'Product Quality Evidence',
    fieldAiVideoPotential: 'AI Video Potential',
    fieldSourceLinks: 'Source Links',
    productQualityHeading: 'Product အရည်အသွေး အထောက်အထား (Product Quality Evidence)',
    sec01WhyChoose: '၀၁. Product ကို ဘာကြောင့် ရွေးချယ်သင့်သလဲ',
    sec02MarketDemand: '၀၂. လက်ရှိ Market Demand အထောက်အထား',
    sec03SalesPotential: '၀၃. ရောင်းအားအလားအလာ',
    sec04CommissionIncome: '၀၄. Commission Rate နှင့် တစ်ခုရောင်းရင် ရနိုင်မည့်ဝင်ငွေ',
    sec05ReviewStrengths: '၀၅. Customer Reviews ထဲက အားသာချက်များ',
    sec06CustomerComplaints: '၀၆. Customer Complaints နှင့် အားနည်းချက်များ',
    sec07CompetitorLandscape: '၀၇. ပြိုင်ဘက်များ၏ အခြေအနေ',
    sec08SellerReliability: '၀၈. Seller Reliability',
    sec09ProductRisks: '၀၉. Product ၏ ဖြစ်နိုင်ခြေရှိသော Risk များ',
    sec10AiVideoPotential: '၁၀. AI Video ဖြင့် ကြော်ငြာဖန်တီးရန် အလားအလာ',
    sec11VideoContentIdeas: '၁၁. Video Content Idea ၃ ခု',
    sec12ResearchSources: '၁၂. Research Sources နှင့် Links',
    sec13ConfidenceLevel: '၁၃. Confidence Level',
    sec14MissingData: '၁၄. မရရှိနိုင်သေးသော အချက်အလက်များ',
    fashionRiskHeading: 'Fashion Return Risk စစ်ဆေးချက် (အရွယ်အစား · အထည်သား · အရောင် · ဝတ်ဆင်ပုံ)',
    fashionRiskSizing: 'အရွယ်အစား (Sizing)',
    fashionRiskFabric: 'အထည်သား (Fabric)',
    fashionRiskColor: 'အရောင်ကွာခြားမှု (Color)',
    fashionRiskFit: 'ဝတ်ဆင်ပုံကွာခြားမှု (Fit)',
    cosmeticsCheckHeading: 'Cosmetics ယုံကြည်စိတ်ချရမှု၊ ထိုင်း FDA နှင့် ကြော်ငြာသတိပြုချက်',
    cosmeticsAuthenticity: 'Brand Authenticity (အစစ်အမှန်)',
    cosmeticsThaiFda: 'ထိုင်း FDA (อย.) အထောက်အထား',
    cosmeticsAdClaims: 'ကျန်းမာရေး/အလှအပ ကြော်ငြာသတိပြုချက်',
    estEarningPerSale: 'တစ်ခုရောင်းရလျှင် ခန့်မှန်းဝင်ငွေ',
    sourcePendingLink: 'တိုက်ရိုက် URL မရရှိသေးပါ',
    sourceOpenLink: 'Link ဖွင့်ရန်',
    reportCopy: 'Report ကူးယူရန်',
    reportCopied: 'ကူးယူပြီး',
    shortlistEmptyTitle: 'သိမ်းထားသော Product မရှိသေးပါ',
    shortlistEmptyDesc:
      'Product Card ပေါ်ရှိ Save Product ခလုတ်ကိုနှိပ်၍ စိတ်ဝင်စားသော Product များကို ဤနေရာတွင် စုစည်းထားနိုင်ပါသည်။',
    shortlistExportCsv: 'CSV ထုတ်ယူရန်',
    shortlistCopySummary: 'စာရင်းကူးယူရန်',
    shortlistAvgScore: 'ပျမ်းမျှ Opportunity Score',
    footerNote: 'SiamPick · ထိုင်း TikTok Shop Affiliate Product Research',
    marketScope: 'ဈေးကွက်: Thailand TikTok Shop (THB ฿) · ဈေးနှုန်းကန့်သတ်ချက်မရှိ',
    demandLabels: {
      High: 'မြင့်မား',
      Growing: 'တိုးတက်နေ',
      Steady: 'တည်ငြိမ်',
      Moderate: 'အသင့်အတင့်',
    },
    competitionLabels: {
      Low: 'နည်းပါး',
      Moderate: 'အသင့်အတင့်',
      High: 'မြင့်မား',
    },
    aiVideoLabels: {
      High: 'အလွန်သင့်တော်',
      Good: 'ကောင်းမွန်',
      Moderate: 'အသင့်အတင့်',
    },
    confidenceLabels: {
      High: 'မြင့်မား',
      Medium: 'အလယ်အလတ်',
      Low: 'နိမ့်',
    },
    riskSeverityLabels: {
      Low: 'အန္တရာယ်နည်း',
      Watch: 'သတိပြုရန်',
      High: 'Return ဖြစ်နိုင်ခြေမြင့်',
    },
    verificationLabels: {
      Verified: 'အတည်ပြုပြီး',
      'Needs Check': 'ထပ်မံစစ်ဆေးရန်',
      Caution: 'အထူးသတိပြုရန်',
    },
    sellerReliabilityLabels: {
      Reliable: 'ယုံကြည်စိတ်ချရ',
      Standard: 'သာမန်',
      'Needs Check': 'စစ်ဆေးရန်လို',
    },
    scoringToggleBtn: 'အမှတ်ပေးစနစ် (100 pts)',
    scoringPanelTitle: 'Opportunity Scoring System (စုစုပေါင်း 100 Points)',
    scoringDisclaimer:
      'ဤ Score သည် ကိုယ်ပိုင် Research Evaluation System ဖြစ်ပြီး TikTok သို့မဟုတ် TikTok Shop ၏ Official Score မဟုတ်ပါ။',
    scoringVerificationRule:
      'အချိုးကျအတည်ပြုမှုအမှတ်ပေးစနစ် — Verified (100% အထိ)၊ Estimated (62% အထိ)၊ Unverified (25% အထိ)၊ Unavailable (0 မှတ်)။ Low Confidence Product များကို ဦးစားပေးအဆင့်အဖြစ် မသတ်မှတ်ပါ။',
    scoringPairReminder:
      'Score တစ်ခုတည်းကိုသာ အားမကိုးဘဲ Confidence Level နှင့် Research Evidence အထောက်အထားများကို တွဲဖက်စဉ်းစားပါ။',
    scoringBreakdownHeading: 'Opportunity Score အသေးစိတ်အမှတ်ပေးချက် (100 Points)',
    scoringJumpLabel: 'Score အမှတ်ခွဲခြမ်း',
    scoringVerifiedCountLabel: 'ချက် အတည်ပြုပြီး',
    scoringCappedNote: 'အတည်ပြုမှုအဆင့်အလိုက် အချိုးချတွက်ချက်ထား',
    scoringTierRanges: {
      'priority-test': '80–100',
      'investigate-further': '65–79',
      'low-priority': '65 အောက်',
    },
    scoringTierLabels: {
      'priority-test': 'ဦးစားပေး စမ်းသပ်သင့်သော Product',
      'investigate-further': 'ထပ်မံစုံစမ်းသင့်သော Product',
      'low-priority': 'ဦးစားပေးမှု နည်းသော Product',
    },
    criterionLabels: {
      demandSales: 'Demand & Sales Evidence',
      commissionEarning: 'Commission & Earning Potential',
      aiCreative: 'AI Creative Potential',
      reviewsQuality: 'Customer Reviews & Quality',
      priceAppeal: 'Price & Buyer Appeal',
      competitionOpportunity: 'Competition Opportunity',
      sellerReliability: 'Seller Reliability',
    },
    criterionVerificationLabels: {
      verified: 'Verified',
      estimated: 'Estimated (အများဆုံး 62%)',
      unverified: 'Unverified (အများဆုံး 25%)',
      unavailable: 'Unavailable (0 မှတ်)',
    },
    savedViewTitle: 'သိမ်းထားသော Product များ',
    savedViewSubtitle:
      'Save လုပ်ထားသော Product များ၏ Research Date၊ Sources နှင့် အသေးစိတ် Research Report များကို App Refresh လုပ်ပြီးနောက်တွင်လည်း အချိန်မရွေး ပြန်ကြည့်နိုင်ပါသည်။',
    savedViewBackBtn: 'Product Hunting သို့ ပြန်သွားရန်',
    savedStorageNote: 'Browser Storage တွင် သိမ်းဆည်းထားပြီး Refresh လုပ်လျှင်လည်း မပျောက်ပါ',
    savedResearchDateLabel: 'Research ရက်စွဲ',
    savedSourcesLabel: 'Research Sources',
    savedDeleteBtn: 'ဖျက်ရန်',
    savedSortNewest: 'နောက်ဆုံးသိမ်းထားသော',
    savedNoSources: 'အတည်ပြုပြီး Source Link မရှိသေးပါ',
    kalodataSectionLabel: 'Kalodata Open Center · Credit Balance',
    kalodataChecking: 'Kalodata Free Credit Balance ကို စစ်ဆေးနေပါသည်...',
    kalodataBalanceLabel: 'လက်ကျန် Credit Balance',
    kalodataCheckBtn: 'Balance စစ်ဆေးရန်',
    selectBothAction: 'နှစ်ခုလုံးရွေးမည်',
    noCategorySelectedWarning: 'Product Hunting စတင်ရန် အနည်းဆုံး Category ၁ ခု ရွေးချယ်ပါ။',
    bothModeLabel: 'ရှာဖွေမှုပုံစံ (Category ၂ ခုလုံး)',
    bothModeCombined: 'တစ်ကြိမ်တည်းပေါင်းရှာမည် (Combined)',
    bothModeSplit: 'Category တစ်ခုစီခွဲရှာမည် (Split)',
    bothModeCombinedDesc: '601152 နှင့် 601450 ကို ပေါင်း၍ရှာသည် — Credit သက်သာသည်',
    bothModeSplitDesc: '601152 နှင့် 601450 ကို ခွဲ၍ရှာသည် — ၅၀/၅၀ မျှတစွာရသည်',
    customQuantityLabel: 'ကိုယ်တိုင်ရိုက်ရန်',
    customQuantityHint: '၁–၅၀၀ (တစ်ကြိမ် ၁၀၀ အလိုက် Pagination)',
    costPreviewHeading: 'ကုန်ကျစရိတ် ခန့်မှန်းချက်နှင့် Spending Limit',
    estimatedCostLabel: 'ခန့်မှန်းကုန်ကျစရိတ် (Estimated)',
    actualCostLabel: 'တကယ်ကုန်ကျခဲ့သောစရိတ် (Actual)',
    actualCostUnavailable: 'မရရှိနိုင်ပါ',
    plannedCallsLabel: 'API Calls',
    actualCallsLabel: 'တကယ်ခေါ်ခဲ့သော Calls',
    creditsUnit: 'Credits',
    pricingFormulaNote:
      'Kalodata ဈေးနှုန်း: Rank 0.1 cr/100 ခု · Product Detail 0.1 cr · Shop Detail 0.1 cr · Review Insight 1.0 cr (1 cr ≈ $0.10)',
    spendingLimitLabel: 'Spending Limit (Credits)',
    spendingLimitExceededTitle: 'ခန့်မှန်းကုန်ကျစရိတ်သည် Spending Limit ထက် ကျော်လွန်နေပါသည်',
    spendingLimitExceededDesc:
      'API မခေါ်ဆိုမီ Fast Mode ပြောင်းပါ၊ အရေအတွက်/Deep-Inspect လျှော့ပါ သို့မဟုတ် Spending Limit ကို တိုးသတ်မှတ်ပါ။',
    confirmHeading: 'Kalodata API ခေါ်ဆိုမှုကို အတည်ပြုပါ',
    confirmNotice:
      'API မခေါ်ဆိုရသေးပါ။ အတည်ပြုပြီး Category IDs၊ Research Mode နှင့် ခန့်မှန်း Credit ကုန်ကျစရိတ်ကို စစ်ဆေးပြီးမှ အတည်ပြုပါ။',
    confirmStartBtn: 'အတည်ပြုပြီး စတင်ရှာဖွေမည်',
    confirmCancelBtn: 'မလုပ်တော့ပါ',
    researchModeLabel: 'Research Mode ရွေးချယ်ရန်',
    modeFastTitle: 'Fast Mode',
    modeFastDesc: 'API Call အနည်းဆုံး · ၇ ရက် ရောင်းအား/GMV/Commission အမြန်စစ်',
    modeBalancedTitle: 'Balanced Mode',
    modeBalancedDesc: '၃၀ ရက် ပိုစုံစစ်ထုတ်မှု + Top 3 Product Detail + Gemini ခွဲခြမ်းမှု',
    modeDeepTitle: 'Deep Research Mode',
    modeDeepDesc: 'Product Detail + Shop Detail + Risk အသေးစိတ်စစ် (ကုန်ကျစရိတ်ကန့်သတ်)',
    deepDiveCountLabel: 'အသေးစိတ်စစ်မည့် Top Products',
    deepDiveCountHint: 'ကုန်ကျစရိတ်မတက်စေရန် အများဆုံး ၁၀ ခု ကန့်သတ်ထားသည်',
    includeReviewInsightsLabel: 'Buyer Review Insights ထပ်ထည့်ရန်',
    includeReviewInsightsDesc: 'ထိုင်းဝယ်သူ Review အားသာ/အားနည်းချက် · +1.0 cr/ခု (အများဆုံး ၂ ခု)',
    breakdownRankLabel: 'Rank',
    breakdownDetailLabel: 'Detail',
    breakdownShopLabel: 'Shop',
    breakdownReviewLabel: 'Reviews',
    geminiAnalysisActiveLabel: 'Gemini ခွဲခြမ်းမှု (Kalodata ဒေတာသာ)',
    depthTagDeep: 'Deep စစ်ဆေးပြီး',
    depthTagDetail: 'Detail အတည်ပြုပြီး',
  },
};
