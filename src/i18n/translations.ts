import {
  AiAdCreativeFormat,
  AiRecommendationVerdict,
  AiVideoSuitability,
  BestSelectionCategory,
  CategoryApiSupportStatus,
  CompetitionLevel,
  ConfidenceLevel,
  CriterionKey,
  DataStatus,
  DemandLevel,
  Language,
  MyanmarConfidenceLevel,
  MyanmarMatchType,
  MyanmarReviewStatus,
  MyanmarSignalAvailability,
  MyanmarSignalSource,
  MyanmarVideoDiscoveryStopReason,
  ProductDecisionVerdict,
  ProductSortField,
  RiskSeverity,
  ScoreFactorKey,
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
    navHistory: string;
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
    kalodataSourceBarLabel: string;
    kalodataSourceNote: string;
    groundingSourcesCount: string;
    groundingToggleShow: string;
    groundingToggleHide: string;
    groundingQueriesLabel: string;
    // Manual Research Pause & Resume
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
    factorLabels: Record<ScoreFactorKey, string>;
    criterionVerificationLabels: Record<DataStatus, string>;
    scoringRedistributedLabel: string;
    scoringRedistributedNotice: string;
    scoringBaseWeightLabel: string;
    scoringEffectiveWeightLabel: string;
    scoringStrategyActiveLabel: string;
    scoringStrengthsHeading: string;
    scoringWeaknessesHeading: string;
    scoringRisksHeading: string;
    scoringConfidenceHeading: string;
    scoringTotalWeightLabel: string;
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
    breakdownVideoRankLabel: string;
    breakdownDetailLabel: string;
    breakdownShopLabel: string;
    breakdownReviewLabel: string;
    geminiAnalysisActiveLabel: string;
    depthTagDeep: string;
    depthTagDetail: string;
    // Phase 2: Local Research History & Comparison
    historyViewTitle: string;
    historyViewSubtitle: string;
    historyStorageNote: string;
    historyEmptyTitle: string;
    historyEmptyDesc: string;
    historySearchPlaceholder: string;
    historyFilterAllModes: string;
    historySortNewest: string;
    historySortOldest: string;
    historySortMostProducts: string;
    historySortCostDesc: string;
    historySortCostAsc: string;
    historyViewResultsBtn: string;
    historyCompareBtn: string;
    historyDeleteBtn: string;
    historyDeleteConfirmBtn: string;
    historyDeleteSelectedBtn: string;
    historySelectLabel: string;
    historySelectedCount: string;
    historyBackToListBtn: string;
    historyArchiveBannerTitle: string;
    historyArchiveBannerDesc: string;
    historyScoreModeOriginal: string;
    historyScoreModeLive: string;
    historyStorageUsageLabel: string;
    historyQuotaWarningTitle: string;
    historyQuotaWarningDismiss: string;
    historyTabRecords: string;
    historyTabSingle: string;
    historyTabCompare: string;
    singleHistorySubtitle: string;
    singleHistoryEmptyTitle: string;
    singleHistoryEmptyDesc: string;
    singleHistorySearchPlaceholder: string;
    singleHistoryCapNote: string;
    singleHistoryOpenReportBtn: string;
    singleHistoryDeepDiveBtn: string;
    singleHistoryOpenLinkBtn: string;
    singleHistoryResearchedAtLabel: string;
    singleHistorySourceLabel: string;
    singleHistoryCreditsLabel: string;
    singleHistoryUnavailableNotesLabel: string;
    compareHeading: string;
    compareSubtitle: string;
    compareOlderLabel: string;
    compareNewerLabel: string;
    compareNeedTwoTitle: string;
    compareNeedTwoDesc: string;
    compareExactIdRule: string;
    compareMatchedCount: string;
    compareOnlyOlder: string;
    compareOnlyNewer: string;
    compareNoMatchesTitle: string;
    compareNoMatchesDesc: string;
    compareColProduct: string;
    compareColSales: string;
    compareColRevenue: string;
    compareColGrowth: string;
    compareColCommission: string;
    compareColScore: string;
    compareUnchanged: string;
    compareSelectDifferentHint: string;
    // Phase 3: AI Product Analysis
    aiJumpLabel: string;
    aiSectionHeading: string;
    aiSectionSubtitle: string;
    aiBadgeGeminiLive: string;
    aiBadgeGeminiCached: string;
    aiBadgeFallback: string;
    aiBadgeReady: string;
    aiDataSeparationNote: string;
    aiDataBasisHeading: string;
    aiInterpretationHeading: string;
    aiInterpretationNote: string;
    aiInferenceBadge: string;
    aiAssessmentBadge: string;
    aiFallbackBannerTitle: string;
    aiStaleDataBannerTitle: string;
    aiStaleDataBannerDesc: string;
    aiEmptyTitle: string;
    aiEmptyDesc: string;
    aiRunAnalysisBtn: string;
    aiReanalyzeBtn: string;
    aiRetryGeminiBtn: string;
    aiPreviewFallbackBtn: string;
    aiAnalyzingLabel: string;
    aiConfirmTitle: string;
    aiConfirmDesc: string;
    aiConfirmCallDetail: string;
    aiConfirmKalodataCost: string;
    aiConfirmTokenNote: string;
    aiConfirmCacheNote: string;
    aiConfirmProceedBtn: string;
    aiConfirmCancelBtn: string;
    aiSecStrengths: string;
    aiSecWeaknesses: string;
    aiSecSalesRevenue: string;
    aiSecGrowthPotential: string;
    aiSecCommissionPotential: string;
    aiSecCompetition: string;
    aiSecTargetCustomer: string;
    aiSecWhyChoose: string;
    aiSecRisksDrawbacks: string;
    aiSecAdSuitability: string;
    aiAdFormatFashion: string;
    aiAdFormatBeauty: string;
    aiAdAnglesHeading: string;
    aiAdCautionsHeading: string;
    aiSecFinalRecommendation: string;
    aiNextActionLabel: string;
    aiAnalyzedAtLabel: string;
    aiModelLabel: string;
    aiCachedLocallyLabel: string;
    aiVerdictLabels: Record<AiRecommendationVerdict, string>;
    // Phase 4: Data Enrichment (Product Detail, Shop Detail, Buyer Review Insights)
    enrichJumpLabel: string;
    enrichSectionHeading: string;
    enrichSectionSubtitle: string;
    enrichLastUpdatedLabel: string;
    enrichNotEnrichedYet: string;
    enrichVerificationLabel: string;
    enrichMarketProductHeading: string;
    enrichShopInfoHeading: string;
    enrichReviewInsightsHeading: string;
    enrichControlsHeading: string;
    enrichLayerProductDetail: string;
    enrichLayerShopDetail: string;
    enrichLayerReviewInsights: string;
    enrichStatusPresent: string;
    enrichStatusCached: string;
    enrichStatusMissing: string;
    enrichShopCacheSavedNote: string;
    enrichReviewOptInWarning: string;
    enrichApplyCacheBtn: string;
    enrichStartBtn: string;
    enrichConfirmTitle: string;
    enrichConfirmDesc: string;
    enrichConfirmProceedBtn: string;
    enrichConfirmCancelBtn: string;
    enrichRunningLabel: string;
    enrichSpendingLimitBlocked: string;
    enrichAllDoneNotice: string;
    enrichNoKalodataIdNotice: string;
    enrichReviewLikes: string;
    enrichReviewDislikes: string;
    enrichReviewComplaints: string;
    enrichReviewQualityCautions: string;
    enrichReviewBuyerNeeds: string;
    enrichReviewUnavailableNote: string;
    enrichShopUnavailableNote: string;
    enrichDedupSavedLabel: string;
    // Phase 5: Product Results, Ranking, Filtering, Comparison, Decisions & Export
    sortFieldLabels: Record<ProductSortField, string>;
    sortDirHighest: string;
    sortDirLowest: string;
    decisionVerdictLabels: Record<ProductDecisionVerdict, string>;
    decisionSummaryHeading: string;
    decisionCautionsLabel: string;
    bestSelectionHeading: string;
    bestSelectionSubtitle: string;
    bestSelectionShow: string;
    bestSelectionHide: string;
    bestSelectionCategories: Record<BestSelectionCategory, string>;
    bestInsufficientBadge: string;
    filtersToggleBtn: string;
    filtersClearAllBtn: string;
    filtersAllOption: string;
    filterScoreRangeLabel: string;
    filterScore80Plus: string;
    filterScore65To79: string;
    filterScoreUnder65: string;
    filterDecisionLabel: string;
    filterConfidenceLabel: string;
    filterCompetitionLabel: string;
    filterSalesLabel: string;
    filterCommissionLabel: string;
    filterCategoryLabel: string;
    filterModeLabel: string;
    filterAiSuitabilityLabel: string;
    filterPerfStrong: string;
    filterPerfModerate: string;
    filterPerfLow: string;
    filterPerfUnavailable: string;
    exportCsvBtn: string;
    exportJsonBtn: string;
    compareSelectBtn: string;
    compareSelectedBtn: string;
    compareBarTitle: string;
    compareOpenBtn: string;
    compareClearBtn: string;
    compareModalTitle: string;
    compareModalSubtitle: string;
    compareDistinctIdsNote: string;
    compareDiffTag: string;
    compareAddSavedLabel: string;
    compareAddSavedPlaceholder: string;
    compareRemoveBtn: string;
    compareNeedTwoNote: string;
    compareSourceResults: string;
    compareSourceSaved: string;
    compareSourceHistory: string;
    reportTabMarketData: string;
    reportTabDecision: string;
    reportTabStrengths: string;
    reportKalodataTag: string;
    reportAiTag: string;
    reportLastUpdatedLabel: string;
    reportExportCsv: string;
    reportExportJson: string;
    // Phase 8: Universal Product Category Support & Subcategory Sync
    selectAllVerifiedAction: string;
    clearAllCategoriesAction: string;
    showAllCategoriesToggle: string;
    showUnsupportedCategoriesToggle: string;
    showPendingSyncCategoriesToggle: string;
    hideExtraCategoriesToggle: string;
    selectedCategoriesCountLabel: string;
    multiCategoryModeLabel: string;
    multiCategoryCombinedDesc: string;
    multiCategorySplitDesc: string;
    categoryStatusLabels: Record<CategoryApiSupportStatus, string>;
    syncCategoriesBtn: string;
    syncCategoriesRunning: string;
    syncCategoriesConfirmTitle: string;
    syncCategoriesConfirmDesc: string;
    syncCategoriesConfirmProceed: string;
    syncCategoriesSyncedNote: string;
    syncCategoriesEmptyHint: string;
    syncCategoriesEmptyResultError: string;
    subcategorySectionLabel: string;
    subcategoryLoadBtn: string;
    subcategoryLoadConfirmTitle: string;
    subcategoryLoadConfirmDesc: string;
    subcategoryClearBtn: string;
    subcategorySelectedHint: string;
    subcategoryEmptyHint: string;
    aiAdFormatLabels: Record<AiAdCreativeFormat, string>;
    aiCategoryUnverifiedTitle: string;
    aiAffiliateStrategyHeading: string;
    navCategories: string;
    // Phase 9: Myanmar Review Product Discovery (Thailand TikTok Shop Only)
    myanmarFilterLabel: string;
    myanmarFilterSubLabel: string;
    myanmarFilterOff: string;
    myanmarFilterOn: string;
    myanmarFilterPopoverTitle: string;
    myanmarFilterPopoverDesc: string;
    myanmarFilterActiveBadge: string;
    myanmarReviewScanLimitLabel: string;
    myanmarReviewScanLimitHint: string;
    myanmarVideoScanPagesLabel: string;
    myanmarVideoScanPagesHint: string;
    myanmarVideoDiscoveryBarTitle: string;
    myanmarVideoStatPagesScanned: string;
    myanmarVideoStatVideosScanned: string;
    myanmarVideoStatMatchedVideos: string;
    myanmarVideoStatCollectedProducts: string;
    myanmarVideoStatSkippedNonAff: string;
    myanmarVideoStopReasonLabels: Record<MyanmarVideoDiscoveryStopReason, string>;
    myanmarVideoShortfallNotice: string;
    myanmarVideoCardLabel: string;
    myanmarVideosMatchedLabel: string;
    myanmarVideoEvidenceHeading: string;
    myanmarVideoOpenLinkLabel: string;
    myanmarReviewStatusLabels: Record<MyanmarReviewStatus, string>;
    myanmarMixedThaiBurmeseTag: string;
    myanmarReviewsMatchedLabel: string;
    myanmarReviewsCheckedLabel: string;
    myanmarSkippedShortLabel: string;
    myanmarDiscoveryBarTitle: string;
    myanmarDiscoveryPartialNotice: string;
    myanmarStatCandidatesFound: string;
    myanmarStatCheckedReviews: string;
    myanmarStatReviewsAvailable: string;
    myanmarStatReviewUnavailable: string;
    myanmarStatNoMyanmarReview: string;
    myanmarStatMatchedProducts: string;
    myanmarStatReviewsInspected: string;
    myanmarSignalCardLabel: string;
    myanmarSignalSectionHeading: string;
    myanmarSignalSectionSubtitle: string;
    myanmarConfidenceLabels: Record<MyanmarConfidenceLevel, string>;
    myanmarSourceLabels: Record<MyanmarSignalSource, string>;
    myanmarAvailabilityLabels: Record<MyanmarSignalAvailability, string>;
    myanmarMatchTypeLabels: Record<MyanmarMatchType, string>;
    myanmarEvidenceHeading: string;
    myanmarNoEvidenceNote: string;
    myanmarSourcesHeading: string;
    myanmarEmptyTitle: string;
    myanmarEmptyDesc: string;
    myanmarEmptyScannedPrefix: string;
    myanmarTurnOffFilterBtn: string;
    filterMyanmarSignalLabel: string;
    filterMyanmarSignalOnlyOption: string;
    linkImportHeading: string;
    linkImportSubtitle: string;
    linkImportInputPlaceholder: string;
    linkImportPasteBtn: string;
    linkImportClearBtn: string;
    linkImportCheckBtn: string;
    linkImportCheckingLabel: string;
    linkImportImportingLabel: string;
    linkImportSupportedFormatsNote: string;
    linkImportInvalidTitle: string;
    linkImportUnsupportedTitle: string;
    linkImportNotFoundTitle: string;
    linkImportReadyTitle: string;
    linkImportProductIdLabel: string;
    linkImportResolvedUrlLabel: string;
    linkImportCanonicalUrlLabel: string;
    linkImportRedirectChainLabel: string;
    linkImportCostZeroLabel: string;
    linkImportCostPaidLabel: string;
    linkImportCacheNotice: string;
    linkImportDuplicateTitle: string;
    linkImportDuplicateDesc: string;
    linkImportDuplicateSourceResults: string;
    linkImportDuplicateSourceSaved: string;
    linkImportDuplicateSourceHistory: string;
    linkImportViewExistingBtn: string;
    linkImportImportCachedBtn: string;
    linkImportConfirmPromptTitle: string;
    linkImportConfirmPromptDesc: string;
    linkImportConfirmCheckboxLabel: string;
    linkImportConfirmExecuteBtn: string;
    linkImportRefreshCacheBtn: string;
    linkImportPausedBannerTitle: string;
    linkImportBudgetRemainingLabel: string;
    linkImportLimitExceededNote: string;
    linkImportBalanceLabel: string;
    linkImportStorageBlockedNote: string;
    linkImportSuccessTitle: string;
    linkImportSuccessCachedDesc: string;
    linkImportSuccessPaidDesc: string;
    linkImportOpenReportBtn: string;
    linkImportViewInSingleHistoryBtn: string;
    linkImportClipboardUnavailableNote: string;
    linkImportDeepDiveBtn: string;
    linkImportSaveBtn: string;
    linkImportSavedBtn: string;
    linkImportSourceHeading: string;
    linkImportVerificationHeading: string;
    linkImportUnavailableHeading: string;
    linkImportNoUnavailableNote: string;
    linkImportOpenTikTokBtn: string;
    linkImportShopLabel: string;
    linkImportPriceLabel: string;
    linkImportSalesLabel: string;
    linkImportRevenueLabel: string;
    linkImportCommissionLabel: string;
    linkImportScoreLabel: string;
  }
> = {
  en: {
    navDiscover: 'Results',
    navFashion: "Women's Fashion",
    navBeauty: 'Cosmetics & Beauty',
    navStrategy: 'Settings',
    navHistory: 'History',
    shortlistBtn: 'Saved',
    heroTitle: 'Thailand TikTok Shop Product Hunting',
    heroSubtitle:
      'Research real, verifiable Thailand TikTok Shop products across Fashion, Cosmetics, Home & Living, Electronics, Kitchen, Health, Food, Baby, Sports, Auto, Pets, Toys, Books & Jewelry with Kalodata verified metrics, category-aware 100-point scoring, and automatic local research history.',
    settingsHeading: 'Product Research Settings',
    settingMarketLabel: 'Market',
    settingMarketValue: 'Thailand TikTok Shop',
    settingFixedNote: 'Fixed market',
    settingPriceLabel: 'Product Price',
    settingPriceValue: 'No price limit',
    strategyLabel: 'Commission Strategy',
    strategyBalanced: 'Balanced Focus',
    strategySales: 'Sales Focus',
    strategyCommission: 'Commission Focus',
    settingStrategyValue: 'Live 7-factor weights (Total 100 pts)',
    weightFineTune: 'Strategy slider',
    salesWeight: 'Sales & Revenue',
    commissionWeight: 'Commission Focus',
    settingCategoryLabel: 'Product Categories',
    settingBothCategories: 'Multiple Categories',
    categoryAll: 'All Products',
    categoryFashion: "Women's Fashion",
    categoryBeauty: 'Cosmetics & Beauty',
    settingQuantityLabel: 'Research Quantity',
    quantityProductsUnit: 'Products',
    startHuntingBtn: 'Start Product Hunting',
    resumeAndStartBtn: 'Resume & Start Hunting',
    huntingInProgress: 'Verifying Thailand TikTok Shop products...',
    huntingCancelBtn: 'Cancel',
    huntingLoadingTitle: 'Running Kalodata Thailand TikTok Shop product research',
    huntingLoadingDesc:
      'Fetching verified Thailand TikTok Shop affiliate products from Kalodata OpenAPI, validating product images and metrics, and calculating category-aware 100-point comparative scores.',
    huntingErrorTitle: 'Live research could not be completed',
    huntingRetryBtn: 'Try Again',
    kalodataSourceBarLabel: 'Kalodata OpenAPI · Thailand TikTok Shop',
    kalodataSourceNote:
      'Live Thailand TikTok Shop affiliate products (commission_rate > 0) retrieved directly from Kalodata Product Rank API using verified or synced TH Category/Subcategory IDs. Fields not included in Product Rank (ratings, reviews, competition, shop score) remain honestly marked Unavailable/Unverified.',
    groundingSourcesCount: 'verified Kalodata sources',
    groundingToggleShow: 'View sources',
    groundingToggleHide: 'Hide sources',
    groundingQueriesLabel: 'API queries executed',
    manualPausedTitle: 'Live Research Paused',
    manualPausedDesc:
      'Product research is currently paused to prevent accidental API runs. Click Resume Research when you are ready to hunt products again.',
    btnPauseResearch: 'Pause Research',
    btnResumeResearch: 'Resume Research',
    btnResumeAndRetry: 'Resume Research',
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
      'Select one or more verified Thailand TikTok Shop categories above (or sync additional TH categories from Kalodata), choose your quantity, and click Start Product Hunting.',
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
    scoringPanelTitle: 'Product Scoring Engine (7 Factors · 100 Points)',
    scoringDisclaimer:
      'Independent Research Evaluation System — calculated from real Kalodata metrics and NOT an official TikTok or TikTok Shop score.',
    scoringVerificationRule:
      'Missing-data fairness: Unavailable factors are NOT penalized with 0 points — their weight is redistributed proportionally across available factors, while Data Confidence is shown separately so missing data never masks risk.',
    scoringPairReminder:
      'Always evaluate Total Score together with Data Confidence, Strengths/Weaknesses, and underlying Kalodata metrics.',
    scoringBreakdownHeading: '7-Factor Product Score Breakdown (100 Points)',
    scoringJumpLabel: 'Score Breakdown',
    scoringVerifiedCountLabel: 'verified',
    scoringCappedNote: 'Weight redistributed proportionally',
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
    factorLabels: {
      salesPerformance: 'Sales Performance',
      revenuePerformance: 'Revenue Performance',
      revenueGrowth: 'Revenue Growth',
      commissionPotential: 'Commission Potential',
      competition: 'Competition (Creator Count)',
      marketDemand: 'Market Demand',
      aiContentSuitability: 'AI Content Suitability',
    },
    criterionVerificationLabels: {
      verified: 'Verified',
      estimated: 'Estimated',
      unverified: 'Unverified',
      unavailable: 'Unavailable',
    },
    scoringRedistributedLabel: 'Unavailable · Weight redistributed',
    scoringRedistributedNotice:
      'Missing-data weight redistribution active: unavailable factor weights were reallocated proportionally across available factors. Check Data Confidence separately.',
    scoringBaseWeightLabel: 'Base',
    scoringEffectiveWeightLabel: 'Effective',
    scoringStrategyActiveLabel: 'Active Strategy Weights',
    scoringStrengthsHeading: 'Strengths',
    scoringWeaknessesHeading: 'Weaknesses',
    scoringRisksHeading: 'Key Risks',
    scoringConfidenceHeading: 'Data Confidence',
    scoringTotalWeightLabel: 'Total Weight',
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
    breakdownVideoRankLabel: 'Video Rank',
    breakdownDetailLabel: 'Detail',
    breakdownShopLabel: 'Shop',
    breakdownReviewLabel: 'Reviews',
    geminiAnalysisActiveLabel: 'Gemini Analysis (Kalodata data only)',
    depthTagDeep: 'Deep Audited',
    depthTagDetail: 'Detail Verified',
    historyViewTitle: 'Research History',
    historyViewSubtitle:
      'Every product hunting run is archived automatically in this browser with its original Kalodata metrics, AI analysis, scores, and costs — strictly separate from Saved Products.',
    historyStorageNote: 'Stored locally in browser localStorage · Deleting History never removes Saved Products',
    historyEmptyTitle: 'No research history yet',
    historyEmptyDesc:
      'Run a Product Hunting session in Fast, Balanced, or Deep mode and the full results snapshot will be saved here automatically.',
    historySearchPlaceholder: 'Search by product name, shop, ID, or category...',
    historyFilterAllModes: 'All Modes',
    historySortNewest: 'Newest First',
    historySortOldest: 'Oldest First',
    historySortMostProducts: 'Most Products',
    historySortCostDesc: 'Actual Cost: High to Low',
    historySortCostAsc: 'Actual Cost: Low to High',
    historyViewResultsBtn: 'View Results',
    historyCompareBtn: 'Compare',
    historyDeleteBtn: 'Delete',
    historyDeleteConfirmBtn: 'Confirm Delete',
    historyDeleteSelectedBtn: 'Delete Selected',
    historySelectLabel: 'Select',
    historySelectedCount: 'selected',
    historyBackToListBtn: 'Back to Research History',
    historyArchiveBannerTitle: 'Archived Research Snapshot',
    historyArchiveBannerDesc:
      'Viewing original results from this session. Your current live Product Hunting results are untouched.',
    historyScoreModeOriginal: 'Original Session Scores',
    historyScoreModeLive: 'Current Strategy Slider',
    historyStorageUsageLabel: 'Browser Storage Usage',
    historyQuotaWarningTitle: 'Browser Local Storage Quota Full',
    historyQuotaWarningDismiss: 'Dismiss',
    historyTabRecords: 'Batch Research',
    historyTabSingle: 'Single Product History',
    historyTabCompare: 'Compare Sessions',
    singleHistorySubtitle:
      'Individual Thailand TikTok Shop products researched via Product Link — stored separately from Batch Research History and Batch Recent Results (max 100 items).',
    singleHistoryEmptyTitle: 'No single product link history yet',
    singleHistoryEmptyDesc:
      'Paste any Thailand TikTok Shop product link on the home screen to research a single product and automatically archive it here without modifying your Batch Recent Results.',
    singleHistorySearchPlaceholder: 'Search by product name, shop, Product ID, or category...',
    singleHistoryCapNote: 'Kept strictly separate from Batch Research · Max 100 items',
    singleHistoryOpenReportBtn: 'Open Report',
    singleHistoryDeepDiveBtn: 'Deep Dive',
    singleHistoryOpenLinkBtn: 'TikTok Shop',
    singleHistoryResearchedAtLabel: 'Researched',
    singleHistorySourceLabel: 'Source',
    singleHistoryCreditsLabel: 'Cost',
    singleHistoryUnavailableNotesLabel: 'Unavailable fields',
    compareHeading: 'Research Comparison',
    compareSubtitle:
      'Compare an older research run against a newer run to track product performance changes over time.',
    compareOlderLabel: 'Older Research (Baseline)',
    compareNewerLabel: 'Newer Research (Latest)',
    compareNeedTwoTitle: 'At least 2 history sessions required',
    compareNeedTwoDesc:
      'Run two or more Product Hunting sessions to compare Sales, Revenue, Growth, Commission, and Score changes over time.',
    compareExactIdRule:
      'Strict ID Matching: Products are compared ONLY when their exact Product ID matches. Non-matching IDs are never guessed as the same product, and missing metrics display as Unavailable.',
    compareMatchedCount: 'matched Product ID(s)',
    compareOnlyOlder: 'only in older run',
    compareOnlyNewer: 'only in newer run',
    compareNoMatchesTitle: 'No matching Product IDs between these two runs',
    compareNoMatchesDesc:
      'These two research sessions share zero identical Product IDs. SiamPick never guesses matches across different Product IDs.',
    compareColProduct: 'Product (Exact ID)',
    compareColSales: 'Sales Change',
    compareColRevenue: 'Revenue Change',
    compareColGrowth: 'Growth Change',
    compareColCommission: 'Commission Change',
    compareColScore: 'Score Change',
    compareUnchanged: 'No change',
    compareSelectDifferentHint: 'Select two different research sessions to compare.',
    aiJumpLabel: 'AI Analysis',
    aiSectionHeading: 'AI Product Analysis',
    aiSectionSubtitle:
      'Detailed 10-point Gemini AI product evaluation grounded strictly in fetched Kalodata metrics — zero fabricated data.',
    aiBadgeGeminiLive: 'Gemini AI Analysis',
    aiBadgeGeminiCached: 'Gemini AI · Saved Cache',
    aiBadgeFallback: 'Kalodata Fallback Analysis',
    aiBadgeReady: '0 Kalodata Credits',
    aiDataSeparationNote:
      'Real Kalodata market facts (Verified / Estimated / Unverified / Unavailable) are separated from AI strategic interpretation below.',
    aiDataBasisHeading: 'Kalodata Market Data Basis (Factual Metrics)',
    aiInterpretationHeading: 'AI Strategic Interpretation (Based Strictly on Kalodata Data Above)',
    aiInterpretationNote:
      'Commentary below interprets only the verified Kalodata metrics above and does not create new market data.',
    aiInferenceBadge: 'AI Market Inference',
    aiAssessmentBadge: 'AI Creative Assessment',
    aiFallbackBannerTitle: 'Gemini AI Analysis Failed — Showing Kalodata Fallback Analysis',
    aiStaleDataBannerTitle: 'Updated Kalodata data detected for this product',
    aiStaleDataBannerDesc:
      'Showing your saved Gemini AI analysis below to avoid unnecessary API calls. Confirm below only if you want to re-analyze using the newer Kalodata metrics.',
    aiEmptyTitle: 'No saved Gemini AI analysis for this product yet',
    aiEmptyDesc:
      'Run a 10-point Gemini AI analysis strictly over this product’s existing Kalodata metrics (strengths, weaknesses, sales, growth, commission, competition, target customer, risks, AI ad suitability, and final recommendation). Results are cached locally for reuse.',
    aiRunAnalysisBtn: 'Analyze with Gemini AI',
    aiReanalyzeBtn: 'Re-analyze with New Data',
    aiRetryGeminiBtn: 'Retry Gemini AI Analysis',
    aiPreviewFallbackBtn: 'Preview Kalodata Summary (0 AI Calls)',
    aiAnalyzingLabel: 'Analyzing Kalodata metrics with Gemini AI...',
    aiConfirmTitle: 'Confirm Gemini AI Analysis Call',
    aiConfirmDesc:
      'No API call has been made yet. Review the call scope below before running Gemini AI analysis on this product.',
    aiConfirmCallDetail: 'API Call: 1 server-side Gemini call (gemini-4-hydrogen)',
    aiConfirmKalodataCost: 'Kalodata Cost: 0 Credits ($0.00) — uses existing fetched data only',
    aiConfirmTokenNote:
      'Estimated AI usage: ~1,800–2,800 tokens (uses server GEMINI_API_KEY quota; typically <$0.001 or free tier)',
    aiConfirmCacheNote:
      'Cached automatically in browser localStorage so reopening this product requires 0 future Gemini calls.',
    aiConfirmProceedBtn: 'Confirm & Run Gemini AI',
    aiConfirmCancelBtn: 'Cancel',
    aiSecStrengths: '01. Product Strengths',
    aiSecWeaknesses: '01b. Product Weaknesses',
    aiSecSalesRevenue: '02. Current Sales & Revenue',
    aiSecGrowthPotential: '03. Sales & Revenue Growth Potential',
    aiSecCommissionPotential: '04. Affiliate Commission Potential',
    aiSecCompetition: '05. Competition Situation',
    aiSecTargetCustomer: '06. Target Customer Profile',
    aiSecWhyChoose: '07. Why Choose This Product',
    aiSecRisksDrawbacks: '08. Potential Risks & Drawbacks',
    aiSecAdSuitability: '09. AI Advertising Content Suitability',
    aiAdFormatFashion: 'AI Virtual Female Model Ad Suitability',
    aiAdFormatBeauty: 'Product-Only 3D Commercial Suitability',
    aiAdAnglesHeading: 'Recommended Creative Angles',
    aiAdCautionsHeading: 'Accuracy & Compliance Cautions',
    aiSecFinalRecommendation: '10. Final Recommendation',
    aiNextActionLabel: 'Suggested Next Step',
    aiAnalyzedAtLabel: 'Analyzed',
    aiModelLabel: 'Model',
    aiCachedLocallyLabel: 'Saved locally for reuse',
    aiVerdictLabels: {
      'priority-test': 'Priority Test',
      'test-with-caution': 'Test With Caution',
      monitor: 'Monitor First',
      skip: 'Skip / Low Priority',
    },
    enrichJumpLabel: 'Enriched Data',
    enrichSectionHeading: 'Kalodata Data Enrichment',
    enrichSectionSubtitle:
      'Fill missing Product Detail, Shop Detail (deduplicated by Shop ID), and opt-in Buyer Review Insights without re-fetching existing data.',
    enrichLastUpdatedLabel: 'Last Updated',
    enrichNotEnrichedYet: 'Rank scan only',
    enrichVerificationLabel: 'Data Verification',
    enrichMarketProductHeading: 'Kalodata Market Data & Product Detail',
    enrichShopInfoHeading: 'Shop Information',
    enrichReviewInsightsHeading: 'Customer & Review Insights',
    enrichControlsHeading: 'Enrich Missing Kalodata Data',
    enrichLayerProductDetail: 'Product Detail',
    enrichLayerShopDetail: 'Shop Detail',
    enrichLayerReviewInsights: 'Review Insights (Opt-in)',
    enrichStatusPresent: 'Loaded',
    enrichStatusCached: 'Cached · 0 cr',
    enrichStatusMissing: 'Missing',
    enrichShopCacheSavedNote: 'Shared by Shop ID — fetched once and reused across all products from this shop.',
    enrichReviewOptInWarning: 'Review Insight API costs 1.0 credit per product — requires explicit selection & confirmation.',
    enrichApplyCacheBtn: 'Apply Cached Data (0 Credits)',
    enrichStartBtn: 'Enrich Selected Data',
    enrichConfirmTitle: 'Confirm Kalodata Data Enrichment',
    enrichConfirmDesc:
      'No paid API call has been made yet. Confirm the exact missing layers and credit cost below before calling Kalodata.',
    enrichConfirmProceedBtn: 'Confirm & Enrich',
    enrichConfirmCancelBtn: 'Cancel',
    enrichRunningLabel: 'Fetching missing Kalodata fields...',
    enrichSpendingLimitBlocked:
      'Estimated enrichment cost exceeds your Spending Limit. Deselect higher-cost layers or raise your Spending Limit first.',
    enrichAllDoneNotice:
      'All Kalodata enrichment layers (Product Detail, Shop Detail, and Review Insights) are already loaded for this product — 0 further API calls needed.',
    enrichNoKalodataIdNotice:
      'This product record does not have a Kalodata Product ID, so Kalodata API enrichment is unavailable.',
    enrichReviewLikes: 'Customer Likes',
    enrichReviewDislikes: 'Dislikes & Pain Points',
    enrichReviewComplaints: 'Frequent Complaints',
    enrichReviewQualityCautions: 'Product Quality Cautions',
    enrichReviewBuyerNeeds: 'Buyer Needs & Usage Scenarios',
    enrichReviewUnavailableNote:
      'Unavailable — verified buyer review insights have not been fetched yet. Select "Review Insights (1.0 cr)" above and confirm if you want real Kalodata review themes (never fabricated).',
    enrichShopUnavailableNote:
      'Unavailable — Shop GMV, Brand/Retailer type, and Shop Creator Count have not been fetched yet. Select "Shop Detail (0.1 cr)" above to enrich once per Shop ID.',
    enrichDedupSavedLabel: 'duplicate call(s) saved via cache',
    // Phase 5: Product Results, Ranking, Filtering, Comparison, Decisions & Export
    sortFieldLabels: {
      overallScore: 'Overall Score',
      salesPerformance: 'Sales Performance',
      revenuePerformance: 'Revenue Performance',
      revenueGrowth: 'Revenue Growth',
      commissionPotential: 'Commission Potential',
      competition: 'Competition',
      aiContentSuitability: 'AI Content Suitability',
      dataConfidence: 'Data Confidence',
    },
    sortDirHighest: 'Highest',
    sortDirLowest: 'Lowest',
    decisionVerdictLabels: {
      recommended: 'Recommended',
      'worth-testing': 'Worth Testing',
      'need-more-data': 'Need More Data',
      'not-recommended': 'Not Recommended',
    },
    decisionSummaryHeading: 'Final Decision Summary',
    decisionCautionsLabel: 'Watchpoints',
    bestSelectionHeading: 'Best Product Selection',
    bestSelectionSubtitle:
      'Auto-selected from verified metrics in the current result list. Categories with insufficient verified data are never forced.',
    bestSelectionShow: 'Show highlights',
    bestSelectionHide: 'Hide highlights',
    bestSelectionCategories: {
      bestOverall: 'Best Overall',
      bestSalesPotential: 'Best Sales Potential',
      bestCommissionPotential: 'Best Commission Potential',
      lowestCompetition: 'Lowest Competition',
      bestAiContentPotential: 'Best AI Content Potential',
      highestDataConfidence: 'Highest Data Confidence',
    },
    bestInsufficientBadge: 'Insufficient data',
    filtersToggleBtn: 'Filters',
    filtersClearAllBtn: 'Clear filters',
    filtersAllOption: 'All',
    filterScoreRangeLabel: 'Score Range',
    filterScore80Plus: '80+ (High)',
    filterScore65To79: '65–79 (Mid)',
    filterScoreUnder65: 'Under 65',
    filterDecisionLabel: 'Recommendation Tier',
    filterConfidenceLabel: 'Data Confidence',
    filterCompetitionLabel: 'Competition Level',
    filterSalesLabel: 'Sales Performance',
    filterCommissionLabel: 'Commission Potential',
    filterCategoryLabel: 'Product Category',
    filterModeLabel: 'Research Mode',
    filterAiSuitabilityLabel: 'AI Content Suitability',
    filterPerfStrong: 'Strong (70+)',
    filterPerfModerate: 'Moderate (45–69)',
    filterPerfLow: 'Low (<45)',
    filterPerfUnavailable: 'Unavailable',
    exportCsvBtn: 'Export CSV',
    exportJsonBtn: 'Export JSON',
    compareSelectBtn: 'Compare',
    compareSelectedBtn: 'Comparing',
    compareBarTitle: 'Selected for comparison',
    compareOpenBtn: 'Compare Products',
    compareClearBtn: 'Clear',
    compareModalTitle: 'Product Comparison',
    compareModalSubtitle:
      'Side-by-side comparison using verified Kalodata metrics and Phase 2–4 analysis. Missing fields remain Unavailable (never 0).',
    compareDistinctIdsNote: 'Different Product IDs are kept strictly separate — differing rows are marked.',
    compareDiffTag: 'Differs',
    compareAddSavedLabel: 'Add Saved Product to Compare',
    compareAddSavedPlaceholder: 'Select a saved product...',
    compareRemoveBtn: 'Remove',
    compareNeedTwoNote: 'Select at least 2 products from Results, Saved Products, or History to compare side by side.',
    compareSourceResults: 'Current Results',
    compareSourceSaved: 'Saved Product',
    compareSourceHistory: 'History Archive',
    reportTabMarketData: 'Kalodata Market Data',
    reportTabDecision: 'Decision',
    reportTabStrengths: 'Strengths & Risks',
    reportKalodataTag: 'Verified Kalodata Data',
    reportAiTag: 'AI Assessment (Separate from Kalodata Data)',
    reportLastUpdatedLabel: 'Last Updated',
    reportExportCsv: 'CSV',
    reportExportJson: 'JSON',
    // Phase 8: Universal Product Category Support & Subcategory Sync
    selectAllVerifiedAction: 'Select All Supported',
    clearAllCategoriesAction: 'Clear All',
    showAllCategoriesToggle: 'Show unavailable',
    showUnsupportedCategoriesToggle: 'Show unsupported',
    showPendingSyncCategoriesToggle: 'Show pending sync',
    hideExtraCategoriesToggle: 'Show supported only',
    selectedCategoriesCountLabel: 'selected',
    multiCategoryModeLabel: 'Multi-Category Query Mode',
    multiCategoryCombinedDesc: 'Queries all selected category IDs together — lowest credit cost',
    multiCategorySplitDesc: 'Queries each selected category separately — balanced split per category',
    categoryStatusLabels: {
      verified: 'Verified',
      'docs-verified': 'Verified',
      synced: 'Synced',
      'requires-sync': 'Pending Sync',
      unsupported: 'Unsupported',
    },
    syncCategoriesBtn: 'Sync TH Categories (0.1 cr)',
    syncCategoriesRunning: 'Syncing Kalodata TH categories...',
    syncCategoriesConfirmTitle: 'Sync Official Thailand Categories from Kalodata?',
    syncCategoriesConfirmDesc:
      'Calls Kalodata Category Rank API (L1, TH, 1 call = 0.1 credits) to map official IDs for Electronics, Kitchen, Health, Food, Baby, Sports, Automotive, Pets, Toys, Books & Jewelry. Unmatched categories are marked Unsupported honestly and never guessed.',
    syncCategoriesConfirmProceed: 'Confirm & Sync (0.1 cr)',
    syncCategoriesSyncedNote: 'TH categories synced locally',
    syncCategoriesEmptyHint:
      'Additional categories require one-time Kalodata TH category sync (0.1 cr) — unverified IDs are never guessed.',
    syncCategoriesEmptyResultError:
      'Kalodata returned 0 categories for this query. Previous category statuses were kept unchanged.',
    subcategorySectionLabel: 'Subcategories (Optional L2 Filter)',
    subcategoryLoadBtn: 'Load Subcategories (0.1 cr)',
    subcategoryLoadConfirmTitle: 'Load Official L2 Subcategories from Kalodata?',
    subcategoryLoadConfirmDesc:
      'Calls Kalodata Category Rank API (L2, TH, 1 call = 0.1 credits) for your selected categories and caches subcategories in this browser.',
    subcategoryClearBtn: 'Clear subcategories',
    subcategorySelectedHint: 'Active L2 subcategory IDs will refine the Kalodata Product Rank query.',
    subcategoryEmptyHint:
      'Load official L2 subcategories for your selected categories (0.1 cr, cached locally) to narrow your hunt.',
    aiAdFormatLabels: {
      'ai-virtual-female-model': 'AI Virtual Female Model Ad Suitability',
      'product-only-3d-commercial': 'Product-Only 3D Commercial Suitability',
      'tech-feature-demo': 'Tech Feature & Spec Demo Suitability',
      'home-problem-solution-demo': 'Home & Kitchen Problem-Solution Demo',
      'lifestyle-usage-demo': 'Lifestyle Usage & Unboxing Demo',
      'consumable-trust-demo': 'Consumable Texture & Compliance-Safe Trust Demo',
    },
    aiCategoryUnverifiedTitle: 'Category Alignment Unverified',
    aiAffiliateStrategyHeading: 'Affiliate Strategy',
    navCategories: 'Categories',
    // Phase 9: Myanmar Video-First Discovery (Thailand TikTok Shop Only)
    myanmarFilterLabel: 'Myanmar Video Discovery',
    myanmarFilterSubLabel: 'TH TikTok Shop · Video-First (0.1 cr / 100 videos)',
    myanmarFilterOff: 'OFF',
    myanmarFilterOn: 'ON',
    myanmarFilterPopoverTitle: 'Myanmar Video-First Product Discovery (TH Shop)',
    myanmarFilterPopoverDesc:
      'Scans Thailand TikTok Shop promotional videos via Kalodata Video Rank (0.1 credit per 100 videos), filters Myanmar-language videos (Burmese Unicode, Zawgyi, mixed Thai+Burmese, or explicit Myanmar hashtags), extracts unique linked TH affiliate products (commission > 0) across multiple pages until your requested quantity (e.g. 20) is reached, hydrates each via Product Detail (0.1 cr; cached = 0 cr), and re-ranks all collected products using SiamPick’s existing 7-Factor 100-Point Scoring System without bonus points. Never fabricates or pads missing products.',
    myanmarFilterActiveBadge: 'Myanmar Video-First: ON (TH Shop)',
    myanmarReviewScanLimitLabel: 'Candidates to Check Reviews',
    myanmarReviewScanLimitHint:
      'Maximum uncached Thailand candidate products to fetch buyer reviews for (1.0 credit per uncached product; cached products reuse reviews at 0 credits). Products beyond this limit are not checked and are reported honestly.',
    myanmarVideoScanPagesLabel: 'Video Scan Depth (Pages × 100 Videos)',
    myanmarVideoScanPagesHint:
      'Maximum Kalodata Video Rank pages (100 TH videos per page = 0.1 cr/page) to paginate while collecting your full requested product quantity. Stops early the moment your full product count (e.g. 20) is verified.',
    myanmarVideoDiscoveryBarTitle: 'Myanmar Video-First Discovery Scope (Thailand TikTok Shop)',
    myanmarVideoStatPagesScanned: 'Pages Scanned',
    myanmarVideoStatVideosScanned: 'TH Videos Scanned',
    myanmarVideoStatMatchedVideos: 'Myanmar Videos',
    myanmarVideoStatCollectedProducts: 'Affiliate Products',
    myanmarVideoStatSkippedNonAff: 'Skipped (Non-Aff)',
    myanmarVideoStopReasonLabels: {
      'target-reached': 'Full Target Reached',
      'max-pages-reached': 'Max Scan Pages Reached',
      'source-exhausted': 'Kalodata Videos Exhausted',
      'budget-capped': 'Budget Ceiling Reached',
    },
    myanmarVideoShortfallNotice:
      'Fewer real Myanmar-video-backed affiliate products existed within this scan depth/budget — showing all verified matches honestly without padding or fabricating items. Increase Video Scan Depth pages to search deeper.',
    myanmarVideoCardLabel: 'Myanmar Video Match',
    myanmarVideosMatchedLabel: 'MY video(s)',
    myanmarVideoEvidenceHeading: 'Confirmed Myanmar Promotional Videos',
    myanmarVideoOpenLinkLabel: 'Open video',
    myanmarReviewStatusLabels: {
      matched: 'Myanmar Review Matched',
      'checked-no-match': 'No Myanmar Review',
      'review-unavailable': 'Review Unavailable',
    },
    myanmarMixedThaiBurmeseTag: 'Mixed TH+MY',
    myanmarReviewsMatchedLabel: 'matched',
    myanmarReviewsCheckedLabel: 'reviews checked',
    myanmarSkippedShortLabel: 'too-short skipped',
    myanmarDiscoveryBarTitle: 'Myanmar Review Discovery Scope (Thailand TikTok Shop)',
    myanmarDiscoveryPartialNotice:
      'Partial scan: not all Thailand candidates were checked for reviews due to the configured Review Check Limit.',
    myanmarStatCandidatesFound: 'TH Candidates Found',
    myanmarStatCheckedReviews: 'Checked for Reviews',
    myanmarStatReviewsAvailable: 'Reviews Available',
    myanmarStatReviewUnavailable: 'Review Unavailable',
    myanmarStatNoMyanmarReview: 'No Myanmar Review',
    myanmarStatMatchedProducts: 'Matched (≥1 MY Review)',
    myanmarStatReviewsInspected: 'Reviews Inspected',
    myanmarSignalCardLabel: 'Myanmar Review Match',
    myanmarSignalSectionHeading: 'Myanmar Signal Evidence & Status',
    myanmarSignalSectionSubtitle:
      'Verified strictly from real Thailand TikTok Shop videos or buyer reviews returned by Kalodata. Unreturned sources are labeled Unavailable — never fabricated.',
    myanmarConfidenceLabels: {
      High: 'High',
      Medium: 'Medium',
      Low: 'Low',
      None: 'None',
    },
    myanmarSourceLabels: {
      title: 'Product Title',
      description: 'Product Description',
      reviews: 'Buyer Review Summary',
      comments: 'Buyer Reviews (Original)',
      videoContent: 'TikTok Video / Creator Text',
    },
    myanmarAvailabilityLabels: {
      matched: 'Matched',
      'checked-no-match': 'No Match',
      unavailable: 'Unavailable',
    },
    myanmarMatchTypeLabels: {
      'myanmar-script': 'Myanmar Unicode',
      'zawgyi-script': 'Zawgyi Script',
      'burmese-romanized-term': 'Myanmar Tag / Term',
    },
    myanmarEvidenceHeading: 'Confirmed Myanmar-Language Reviews',
    myanmarNoEvidenceNote:
      'No confirmed Myanmar-language review or video signal was found among the retrievable data for this product.',
    myanmarSourcesHeading: 'Data Source Availability',
    myanmarEmptyTitle: 'No Myanmar-Matched TH Affiliate Products Found',
    myanmarEmptyDesc:
      'We scanned Thailand TikTok Shop videos across your selected categories, but no affiliate products (commission > 0) linked to confirmed Myanmar-language videos matched within the configured scan depth. No results were fabricated.',
    myanmarEmptyScannedPrefix: 'Thailand videos/candidates scanned:',
    myanmarTurnOffFilterBtn: 'Turn OFF Myanmar Filter & Edit Settings',
    filterMyanmarSignalLabel: 'Myanmar Match',
    filterMyanmarSignalOnlyOption: 'Confirmed Myanmar Video / Review Only',
    linkImportHeading: 'Import TikTok Shop Product by Link',
    linkImportSubtitle:
      'Paste any Thailand TikTok Shop product URL, short link (vt.tiktok.com), redirect link, or mobile share text. Link checking uses 0 Kalodata credits; uncached Kalodata imports require confirmation.',
    linkImportInputPlaceholder:
      'Paste link or mobile share text (e.g. https://vt.tiktok.com/... or https://shop.tiktok.com/th/pdp/...)',
    linkImportPasteBtn: 'Paste',
    linkImportClearBtn: 'Clear',
    linkImportCheckBtn: 'Inspect Link (0 cr)',
    linkImportCheckingLabel: 'Checking link...',
    linkImportImportingLabel: 'Importing from Kalodata...',
    linkImportSupportedFormatsNote:
      'Supports direct TH PDP URLs, vt.tiktok.com / vm.tiktok.com / tiktok.com/t/ short links, redirect links, and mobile share captions.',
    linkImportInvalidTitle: 'Invalid or Blocked Link',
    linkImportUnsupportedTitle: 'Unsupported Link',
    linkImportNotFoundTitle: 'Product Not Found',
    linkImportReadyTitle: 'Thailand TikTok Shop Product Identified',
    linkImportProductIdLabel: 'Product ID',
    linkImportResolvedUrlLabel: 'Resolved URL',
    linkImportCanonicalUrlLabel: 'Official TH PDP Link',
    linkImportRedirectChainLabel: 'Redirect Path',
    linkImportCostZeroLabel: '0 Kalodata credits (Cache hit)',
    linkImportCostPaidLabel: '0.1 Kalodata credits (Product Detail)',
    linkImportCacheNotice: 'Verified product data is already cached — ready to import with 0 API calls.',
    linkImportDuplicateTitle: 'Already in Your Workspace',
    linkImportDuplicateDesc:
      'This Product ID is already loaded in your workspace under another link or session. Zero extra Kalodata call needed.',
    linkImportDuplicateSourceResults: 'Active Results',
    linkImportDuplicateSourceSaved: 'Saved Products',
    linkImportDuplicateSourceHistory: 'Research History',
    linkImportViewExistingBtn: 'Open Single Result (0 cr)',
    linkImportImportCachedBtn: 'Research from Cache (0 cr)',
    linkImportConfirmPromptTitle: 'Confirm Paid Kalodata Product Detail Call',
    linkImportConfirmPromptDesc:
      'This product is not in cache yet. Researching this link will run 1 Kalodata Product Detail API call (~0.1 credits) using your active Spending Limit and Balance.',
    linkImportConfirmCheckboxLabel: 'I confirm spending ~0.1 Kalodata credits to research this product.',
    linkImportConfirmExecuteBtn: 'Confirm & Research Product (0.1 cr)',
    linkImportRefreshCacheBtn: 'Force Refresh via Kalodata (0.1 cr)',
    linkImportPausedBannerTitle: 'Paid Kalodata Calls Paused',
    linkImportBudgetRemainingLabel: 'Remaining Spending Limit',
    linkImportLimitExceededNote:
      'Insufficient remaining spending limit for this 0.1 credit call. Increase your Spending Limit in Research Settings above.',
    linkImportBalanceLabel: 'Live Balance',
    linkImportStorageBlockedNote:
      'Persistent budget ledger storage is unavailable, so paid calls are blocked for safety.',
    linkImportSuccessTitle: 'Single Product Researched & Saved to Single History',
    linkImportSuccessCachedDesc:
      'Loaded cleanly from cache (0 Kalodata credits used). Batch Recent Results remain untouched.',
    linkImportSuccessPaidDesc:
      'Researched verified Thailand TikTok Shop data from Kalodata and archived in Single Product History. Batch Recent Results remain untouched.',
    linkImportOpenReportBtn: 'Open Product Report',
    linkImportViewInSingleHistoryBtn: 'View Single History',
    linkImportClipboardUnavailableNote: 'Clipboard permission unavailable — please paste manually into the box.',
    linkImportDeepDiveBtn: 'Deep Dive Analysis',
    linkImportSaveBtn: 'Save Product',
    linkImportSavedBtn: 'Saved',
    linkImportSourceHeading: 'Data Source & Link Resolution',
    linkImportVerificationHeading: 'Verification Status',
    linkImportUnavailableHeading: 'Unavailable Data',
    linkImportNoUnavailableNote: 'All tracked overview metrics returned verified values.',
    linkImportOpenTikTokBtn: 'Open TikTok Shop',
    linkImportShopLabel: 'Shop',
    linkImportPriceLabel: 'Price',
    linkImportSalesLabel: 'Sales',
    linkImportRevenueLabel: 'GMV',
    linkImportCommissionLabel: 'Commission',
    linkImportScoreLabel: 'Score',
  },
  my: {
    navDiscover: 'ရလဒ်များ',
    navFashion: "Women's Fashion",
    navBeauty: 'Cosmetics & Beauty',
    navStrategy: 'သတ်မှတ်ချက်',
    navHistory: 'History',
    shortlistBtn: 'သိမ်းထားသော',
    heroTitle: 'ထိုင်း TikTok Shop Product Hunting',
    heroSubtitle:
      'ထိုင်း TikTok Shop ရှိ Fashion, Cosmetics, Home & Living, Electronics, Kitchen, Health, Food, Baby, Sports, Auto, Pets, Toys, Books နှင့် Jewelry စသည့် Product Categories များကို Kalodata တကယ့်ဒေတာ၊ Category-Aware 100-Point Scoring နှင့် Local History ဖြင့် တိကျစွာ ရှာဖွေသုတေသနပြုပါ။',
    settingsHeading: 'Product Research သတ်မှတ်ချက်များ',
    settingMarketLabel: 'ဈေးကွက် (Market)',
    settingMarketValue: 'Thailand TikTok Shop',
    settingFixedNote: 'အမြဲတမ်းသတ်မှတ်ထားသည်',
    settingPriceLabel: 'Product ဈေးနှုန်း',
    settingPriceValue: 'ကန့်သတ်ချက်မရှိ',
    strategyLabel: 'Commission Strategy',
    strategyBalanced: 'Balanced Focus (မျှတစွာ)',
    strategySales: 'Sales Focus (ရောင်းအားဦးစားပေး)',
    strategyCommission: 'Commission Focus (Commission ဦးစားပေး)',
    settingStrategyValue: 'အချက် ၇ ချက် Weight စုစုပေါင်း 100 မှတ်',
    weightFineTune: 'Strategy Slider ချိန်ညှိရန်',
    salesWeight: 'Sales & Revenue ဦးစားပေး',
    commissionWeight: 'Commission ဦးစားပေး',
    settingCategoryLabel: 'Product Categories',
    settingBothCategories: 'Category များစွာ',
    categoryAll: 'အားလုံး',
    categoryFashion: "Women's Fashion",
    categoryBeauty: 'Cosmetics & Beauty',
    settingQuantityLabel: 'ရှာဖွေမည့်အရေအတွက် (Research Quantity)',
    quantityProductsUnit: 'Products',
    startHuntingBtn: 'Start Product Hunting',
    resumeAndStartBtn: 'ပြန်လည်စတင်ရန် (Resume & Hunt)',
    huntingInProgress: 'တကယ်ရောင်းချနေသော Product များကို စစ်ဆေးရှာဖွေနေပါသည်...',
    huntingCancelBtn: 'ရပ်တန့်ရန်',
    huntingLoadingTitle: 'Kalodata ထိုင်း TikTok Shop Product ရှာဖွေမှု လုပ်ဆောင်နေပါသည်',
    huntingLoadingDesc:
      'Kalodata OpenAPI မှ ထိုင်း TikTok Shop Affiliate Product များကို ရယူခြင်း၊ ဓာတ်ပုံနှင့် ဒေတာအချက်အလက်များ စစ်ဆေးခြင်းနှင့် Category-Aware အမှတ် ၁၀၀ နှိုင်းယှဉ်တွက်ချက်ခြင်း ပြုလုပ်နေပါသည်။',
    huntingErrorTitle: 'Live Research လုပ်ဆောင်၍ မရနိုင်သေးပါ',
    huntingRetryBtn: 'ထပ်မံကြိုးစားရန်',
    kalodataSourceBarLabel: 'Kalodata OpenAPI · ထိုင်း TikTok Shop',
    kalodataSourceNote:
      'အတည်ပြုပြီး သို့မဟုတ် Sync ပြုလုပ်ထားသော TH Category/Subcategory IDs ဖြင့် Kalodata Product Rank API မှ တိုက်ရိုက်ရယူထားသော Affiliate Product များ (commission_rate > 0) ဖြစ်ပါသည်။ API တွင် မပါဝင်သော Rating/Reviews/Competition တို့ကို Unavailable/Unverified အဖြစ် ရိုးသားစွာ ဖော်ပြထားပါသည်။',
    groundingSourcesCount: 'ခု အတည်ပြုပြီး Kalodata Sources',
    groundingToggleShow: 'Sources ကြည့်ရန်',
    groundingToggleHide: 'Sources ပိတ်ရန်',
    groundingQueriesLabel: 'အသုံးပြုခဲ့သော API Query များ',
    manualPausedTitle: 'Live Research ကို ခေတ္တရပ်နားထားပါသည်',
    manualPausedDesc:
      'မတော်တဆ API ခေါ်ဆိုမှု မဖြစ်စေရန် Product Research ကို ခေတ္တရပ်နားထားပါသည်။ ဆက်လက်ရှာဖွေလိုပါက Resume ခလုတ်ကို နှိပ်ပါ။',
    btnPauseResearch: 'ခေတ္တရပ်နားရန် (Pause)',
    btnResumeResearch: 'ပြန်လည်ဖွင့်ရန် (Resume)',
    btnResumeAndRetry: 'Resume လုပ်ပြီး ပြန်ဖွင့်ရန်',
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
      'အထက်ရှိ Settings တွင် အတည်ပြုပြီး TH Product Categories များကို ရွေးချယ်ပါ (သို့မဟုတ် Kalodata မှ Category များ ထပ်မံ Sync လုပ်ပါ)၊ အရေအတွက်ရွေးချယ်ပြီး Start Product Hunting ကို နှိပ်၍ စတင်ပါ။',
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
    scoringPanelTitle: 'Product Scoring Engine (အချက် ၇ ချက် · စုစုပေါင်း 100 မှတ်)',
    scoringDisclaimer:
      'ဤ Score သည် Kalodata တကယ့်ဒေတာအပေါ် အခြေခံတွက်ချက်သော ကိုယ်ပိုင်စနစ်ဖြစ်ပြီး TikTok / TikTok Shop ၏ Official Score မဟုတ်ပါ။',
    scoringVerificationRule:
      'ဒေတာမရှိသည့်အချက်ကို 0 မှတ်ဖြင့် မနှိမ်ဘဲ ရရှိထားသောအချက်များအကြား Weight ကို အချိုးကျပြန်ခွဲဝေပေးပါသည်။ Missing Data ကြောင့် Score မြင့်သွားခြင်းကို မလှည့်စားစေရန် Data Confidence ကို သီးခြားဖော်ပြပါသည်။',
    scoringPairReminder:
      'Total Score တစ်ခုတည်းကိုသာ အားမကိုးဘဲ Data Confidence၊ အားသာချက်/အားနည်းချက် နှင့် Risk များကို တွဲဖက်သုံးသပ်ပါ။',
    scoringBreakdownHeading: 'အချက် ၇ ချက် Product Score အသေးစိတ် (100 Points)',
    scoringJumpLabel: 'Score အမှတ်ခွဲခြမ်း',
    scoringVerifiedCountLabel: 'ချက် အတည်ပြုပြီး',
    scoringCappedNote: 'Weight အချိုးကျပြန်ခွဲဝေထား',
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
    factorLabels: {
      salesPerformance: 'Sales Performance (ရောင်းအား)',
      revenuePerformance: 'Revenue Performance (ဝင်ငွေ)',
      revenueGrowth: 'Revenue Growth (တိုးတက်နှုန်း)',
      commissionPotential: 'Commission Potential (အမြတ်)',
      competition: 'Competition (Creator Count)',
      marketDemand: 'Market Demand (ဈေးကွက်ဝယ်လိုအား)',
      aiContentSuitability: 'AI Content Suitability (AI ကြော်ငြာသင့်တော်မှု)',
    },
    criterionVerificationLabels: {
      verified: 'Verified',
      estimated: 'Estimated',
      unverified: 'Unverified',
      unavailable: 'Unavailable',
    },
    scoringRedistributedLabel: 'Unavailable · Weight ပြန်ခွဲဝေပြီး',
    scoringRedistributedNotice:
      'မရရှိသေးသောအချက်၏ Weight ကို ရရှိထားသောအချက်များကြား အချိုးကျပြန်ခွဲဝေထားပါသည်။ Data Confidence ကို သီးခြားစစ်ဆေးပါ။',
    scoringBaseWeightLabel: 'မူလ Weight',
    scoringEffectiveWeightLabel: 'အကျိုးသက်ရောက် Weight',
    scoringStrategyActiveLabel: 'လက်ရှိ Strategy Weight များ',
    scoringStrengthsHeading: 'အားသာချက်များ',
    scoringWeaknessesHeading: 'အားနည်းချက်များ',
    scoringRisksHeading: 'သတိပြုရမည့် Risk များ',
    scoringConfidenceHeading: 'Data Confidence အခြေအနေ',
    scoringTotalWeightLabel: 'စုစုပေါင်း Weight',
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
    breakdownVideoRankLabel: 'Video Rank',
    breakdownDetailLabel: 'Detail',
    breakdownShopLabel: 'Shop',
    breakdownReviewLabel: 'Reviews',
    geminiAnalysisActiveLabel: 'Gemini ခွဲခြမ်းမှု (Kalodata ဒေတာသာ)',
    depthTagDeep: 'Deep စစ်ဆေးပြီး',
    depthTagDetail: 'Detail အတည်ပြုပြီး',
    historyViewTitle: 'Research History (သုတေသနမှတ်တမ်း)',
    historyViewSubtitle:
      'Product Hunting လုပ်ပြီးတိုင်း ရရှိလာသော Kalodata ဒေတာ၊ AI ခွဲခြမ်းမှု၊ Score နှင့် ကုန်ကျစရိတ်များကို Browser localStorage တွင် အလိုအလျောက်သိမ်းဆည်းထားပြီး Saved Products နှင့် သီးခြားစီစီမံပါသည်။',
    historyStorageNote: 'Browser localStorage တွင် သီးခြားသိမ်းဆည်းထားသည် · History ဖျက်သော်လည်း Saved Products မပျောက်ပါ',
    historyEmptyTitle: 'Research History မရှိသေးပါ',
    historyEmptyDesc:
      'Fast, Balanced သို့မဟုတ် Deep Mode ဖြင့် Product Hunting တစ်ခေါက်ပြုလုပ်ပြီးသည်နှင့် ရလဒ်အပြည့်အစုံကို ဤနေရာတွင် အလိုအလျောက်သိမ်းဆည်းပေးပါမည်။',
    historySearchPlaceholder: 'Product အမည်၊ ဆိုင်အမည်၊ Research ID သို့မဟုတ် Category ဖြင့် ရှာရန်...',
    historyFilterAllModes: 'Mode အားလုံး',
    historySortNewest: 'နောက်ဆုံးပြုလုပ်ခဲ့သော',
    historySortOldest: 'အဟောင်းဆုံးမှ',
    historySortMostProducts: 'Product အရေအတွက်အများဆုံး',
    historySortCostDesc: 'တကယ်ကုန်ကျစရိတ်: အများမှအနည်း',
    historySortCostAsc: 'တကယ်ကုန်ကျစရိတ်: အနည်းမှအများ',
    historyViewResultsBtn: 'မူရင်းရလဒ်ကြည့်ရန်',
    historyCompareBtn: 'နှိုင်းယှဉ်ရန်',
    historyDeleteBtn: 'ဖျက်ရန်',
    historyDeleteConfirmBtn: 'ဖျက်ရန်အတည်ပြု',
    historyDeleteSelectedBtn: 'ရွေးထားသည်များဖျက်ရန်',
    historySelectLabel: 'ရွေးရန်',
    historySelectedCount: 'ခု ရွေးထား',
    historyBackToListBtn: 'Research History စာရင်းသို့ ပြန်သွားရန်',
    historyArchiveBannerTitle: 'အရင်သိမ်းဆည်းထားသော မူရင်း Research ရလဒ်',
    historyArchiveBannerDesc:
      'ဤအချိန်က ရရှိခဲ့သော မူလဒေတာများကို ပြန်ကြည့်နေပါသည်။ လက်ရှိ Product Hunting ရလဒ်များနှင့် အစားမထိုးပါ။',
    historyScoreModeOriginal: 'မူရင်း Score များ',
    historyScoreModeLive: 'လက်ရှိ Strategy Slider ဖြင့်',
    historyStorageUsageLabel: 'Browser Storage အသုံးပြုမှု',
    historyQuotaWarningTitle: 'Browser Local Storage နေရာပြည့်နေပါသည်',
    historyQuotaWarningDismiss: 'ပိတ်ရန်',
    historyTabRecords: 'Batch Research မှတ်တမ်း',
    historyTabSingle: 'Single Product History',
    historyTabCompare: 'Research နှိုင်းယှဉ်ရန်',
    singleHistorySubtitle:
      'Product Link မှ တစ်ခုချင်း ရှာဖွေထားသော Thailand TikTok Shop Product များ — Batch Research History နှင့် Home Screen Recent Results တို့နှင့် သီးခြားစီ သိမ်းဆည်းထားသည် (အများဆုံး ၁၀၀ ခု)။',
    singleHistoryEmptyTitle: 'Single Product Link History မရှိသေးပါ',
    singleHistoryEmptyDesc:
      'ပင်မစာမျက်နှာတွင် TikTok Shop Product Link တစ်ခု ထည့်ရှာလိုက်သည်နှင့် ရလဒ်ကို ဤ Single Product History ထဲ အလိုအလျောက် သိမ်းပေးပါမည် (Batch Recent Results ကို မထိခိုက်ပါ)။',
    singleHistorySearchPlaceholder: 'Product အမည်၊ ဆိုင်၊ Product ID သို့မဟုတ် Category ဖြင့် ရှာရန်...',
    singleHistoryCapNote: 'Batch Research နှင့် သီးခြားစီ · အများဆုံး ၁၀၀ ခု',
    singleHistoryOpenReportBtn: 'Report ဖွင့်မည်',
    singleHistoryDeepDiveBtn: 'Deep Dive ဝင်မည်',
    singleHistoryOpenLinkBtn: 'TikTok Shop',
    singleHistoryResearchedAtLabel: 'ရှာဖွေချိန်',
    singleHistorySourceLabel: 'Data Source',
    singleHistoryCreditsLabel: 'ကုန်ကျစရိတ်',
    singleHistoryUnavailableNotesLabel: 'မရရှိနိုင်သောအချက်များ',
    compareHeading: 'Research နှိုင်းယှဉ်ချက် (Old vs New)',
    compareSubtitle:
      'History ထဲရှိ Research အဟောင်းနှင့် အသစ်ကို နှိုင်းယှဉ်ပြီး Product စွမ်းဆောင်ရည် ပြောင်းလဲမှုများကို စစ်ဆေးပါ။',
    compareOlderLabel: 'Research အဟောင်း (Baseline)',
    compareNewerLabel: 'Research အသစ် (Latest)',
    compareNeedTwoTitle: 'နှိုင်းယှဉ်ရန် History မှတ်တမ်း အနည်းဆုံး ၂ ခု လိုအပ်ပါသည်',
    compareNeedTwoDesc:
      'Sales၊ Revenue၊ Growth၊ Commission နှင့် Score ပြောင်းလဲမှုများကို နှိုင်းယှဉ်ရန် Product Hunting ၂ ကြိမ်နှင့်အထက် ပြုလုပ်ပါ။',
    compareExactIdRule:
      'Product ID တိကျစွာတိုက်ဆိုင်စစ်ဆေးမှု — Product ID တူညီသော Product များကိုသာ နှိုင်းယှဉ်ပြပါသည်။ ID မတူပါက တူညီသည်ဟု ခန့်မှန်းခြင်းမပြုဘဲ ဒေတာမရှိလျှင် Unavailable ဟု ဖော်ပြပါသည်။',
    compareMatchedCount: 'ခု Product ID တူညီတွေ့ရှိ',
    compareOnlyOlder: 'အဟောင်းတွင်သာပါဝင်',
    compareOnlyNewer: 'အသစ်တွင်သာပါဝင်',
    compareNoMatchesTitle: 'ဤ Research ၂ ခုကြား Product ID တူညီမှု မရှိပါ',
    compareNoMatchesDesc:
      'ရွေးချယ်ထားသော Research ၂ ခုတွင် Product ID တူညီသော Product မတွေ့ရှိပါ။ Product ID မတူပါက အလိုအလျောက်မခန့်မှန်းပါ။',
    compareColProduct: 'Product (ID အတိအကျ)',
    compareColSales: 'Sales ပြောင်းလဲမှု',
    compareColRevenue: 'Revenue ပြောင်းလဲမှု',
    compareColGrowth: 'Growth ပြောင်းလဲမှု',
    compareColCommission: 'Commission ပြောင်းလဲမှု',
    compareColScore: 'Score ပြောင်းလဲမှု',
    compareUnchanged: 'မပြောင်းလဲပါ',
    compareSelectDifferentHint: 'နှိုင်းယှဉ်ရန် မတူညီသော Research မှတ်တမ်း ၂ ခုကို ရွေးချယ်ပါ။',
    aiJumpLabel: 'AI သုံးသပ်ချက်',
    aiSectionHeading: 'AI ကုန်ပစ္စည်း ခွဲခြမ်းစိတ်ဖြာချက်',
    aiSectionSubtitle:
      'Kalodata မှ ရရှိထားသော ဒေတာအစစ်များကိုသာ အခြေခံ၍ Gemini AI ဖြင့် အချက် ၁၀ ချက် အသေးစိတ်သုံးသပ်ချက် — မရှိသောဒေတာများကို မဖန်တီးပါ။',
    aiBadgeGeminiLive: 'Gemini AI သုံးသပ်ချက်',
    aiBadgeGeminiCached: 'Gemini AI · သိမ်းဆည်းပြီး',
    aiBadgeFallback: 'Kalodata Fallback သုံးသပ်ချက်',
    aiBadgeReady: 'Kalodata 0 Credits',
    aiDataSeparationNote:
      'အောက်တွင် တကယ့် Kalodata ဈေးကွက်ဒေတာ (Verified / Estimated / Unverified / Unavailable) နှင့် AI သုံးသပ်ခန့်မှန်းချက်ကို ရှင်းရှင်းလင်းလင်း ခွဲပြထားပါသည်။',
    aiDataBasisHeading: 'Kalodata တကယ့်ဈေးကွက်ဒေတာ အခြေခံအချက်အလက်များ',
    aiInterpretationHeading: 'AI ဗျူဟာမြောက် သုံးသပ်ချက် (အထက်ပါ Kalodata ဒေတာအပေါ်သာ အခြေခံ)',
    aiInterpretationNote:
      'အောက်ပါ AI သုံးသပ်ချက်သည် အထက်ပါ Kalodata ဒေတာများကို အဓိပ္ပာယ်ဖွင့်ဆိုခြင်းသာဖြစ်ပြီး တကယ့် Market Data အသစ်ဖန်တီးခြင်းမဟုတ်ပါ။',
    aiInferenceBadge: 'AI ဈေးကွက်ခန့်မှန်းချက်',
    aiAssessmentBadge: 'AI ကြော်ငြာသင့်တော်မှုသုံးသပ်ချက်',
    aiFallbackBannerTitle: 'Gemini AI ခွဲခြမ်းစိတ်ဖြာမှု မအောင်မြင်ပါ — Kalodata Fallback Analysis ကို ဖော်ပြထားပါသည်',
    aiStaleDataBannerTitle: 'ဤ Product အတွက် Kalodata ဒေတာအသစ် တွေ့ရှိပါသည်',
    aiStaleDataBannerDesc:
      'မလိုအပ်ဘဲ Gemini API ထပ်မခေါ်စေရန် အရင်သိမ်းထားပြီးသား AI သုံးသပ်ချက်ကို ပြပေးထားပါသည်။ ဒေတာအသစ်ဖြင့် ပြန်သုံးသပ်လိုမှသာ အောက်တွင် အတည်ပြုပါ။',
    aiEmptyTitle: 'ဤ Product အတွက် သိမ်းထားပြီးသား Gemini AI သုံးသပ်ချက် မရှိသေးပါ',
    aiEmptyDesc:
      'လက်ရှိရရှိပြီးသား Kalodata ဒေတာများကိုသာ အခြေခံ၍ Gemini AI ဖြင့် အချက် ၁၀ ချက် (အားသာ/အားနည်းချက်၊ ရောင်းအား၊ တိုးတက်မှု၊ Commission၊ ပြိုင်ဆိုင်မှု၊ ပစ်မှတ်ဝယ်သူ၊ အန္တရာယ်၊ AI ကြော်ငြာသင့်တော်မှုနှင့် နောက်ဆုံးအကြံပြုချက်) ကို သုံးသပ်နိုင်ပါသည်။ ရလဒ်ကို Local တွင် သိမ်းထားပေးမည်ဖြစ်၍ ထပ်ခါထပ်ခါ API မခေါ်ပါ။',
    aiRunAnalysisBtn: 'Gemini AI ဖြင့် ခွဲခြမ်းစိတ်ဖြာမည်',
    aiReanalyzeBtn: 'ဒေတာအသစ်ဖြင့် ပြန်သုံးသပ်မည်',
    aiRetryGeminiBtn: 'Gemini AI ပြန်စမ်းကြည့်မည်',
    aiPreviewFallbackBtn: 'Kalodata အကျဉ်းချုပ်ကြည့်မည် (AI 0 Call)',
    aiAnalyzingLabel: 'Kalodata ဒေတာများကို Gemini AI ဖြင့် ခွဲခြမ်းစိတ်ဖြာနေပါသည်...',
    aiConfirmTitle: 'Gemini AI API ခေါ်ဆိုမှုကို အတည်ပြုပါ',
    aiConfirmDesc:
      'API မခေါ်ဆိုရသေးပါ။ ဤ Product ကို Gemini AI ဖြင့် ခွဲခြမ်းစိတ်ဖြာရန် အောက်ပါကုန်ကျစရိတ်အချက်အလက်ကို စစ်ဆေးပြီး အတည်ပြုပါ။',
    aiConfirmCallDetail: 'API ခေါ်ဆိုမှု: Server-side Gemini 1 ကြိမ် (gemini-4-hydrogen)',
    aiConfirmKalodataCost: 'Kalodata ကုန်ကျစရိတ်: 0 Credits ($0.00) — ရှိပြီးသားဒေတာကိုသာ သုံးမည်',
    aiConfirmTokenNote:
      'ခန့်မှန်း AI Token: ~1,800–2,800 tokens (Server GEMINI_API_KEY Quota ကိုသုံးမည် — ပုံမှန် <$0.001 သို့မဟုတ် Free Tier)',
    aiConfirmCacheNote:
      'ရလဒ်ကို Browser localStorage တွင် သိမ်းထားပေးမည်ဖြစ်၍ နောက်တစ်ကြိမ်ပြန်ဖွင့်လျှင် Gemini API ထပ်မခေါ်ပါ။',
    aiConfirmProceedBtn: 'အတည်ပြုပြီး Gemini AI စတင်မည်',
    aiConfirmCancelBtn: 'မလုပ်တော့ပါ',
    aiSecStrengths: '၀၁. Product ၏ အားသာချက်များ',
    aiSecWeaknesses: '၀၁(ခ). Product ၏ အားနည်းချက်များ',
    aiSecSalesRevenue: '၀၂. လက်ရှိရောင်းအားနှင့် ဝင်ငွေအခြေအနေ',
    aiSecGrowthPotential: '၀၃. ရောင်းအားတိုးတက်မှု အလားအလာ',
    aiSecCommissionPotential: '၀၄. Affiliate Commission အလားအလာ',
    aiSecCompetition: '၀၅. ပြိုင်ဆိုင်မှုအခြေအနေ',
    aiSecTargetCustomer: '၀၆. ဘယ်လို Customer မျိုးကို ရောင်းသင့်လဲ',
    aiSecWhyChoose: '၀၇. ဘာကြောင့် ဒီ Product ကို ရွေးသင့်လဲ',
    aiSecRisksDrawbacks: '၀၈. ဖြစ်နိုင်တဲ့ အန္တရာယ်နှင့် အားနည်းချက်များ',
    aiSecAdSuitability: '၀၉. AI ဖြင့် ကြော်ငြာ Content ဖန်တီးရန် သင့်တော်မှု',
    aiAdFormatFashion: 'AI Virtual Female Model ကြော်ငြာ သင့်တော်မှု',
    aiAdFormatBeauty: 'Product-Only 3D Commercial ကြော်ငြာ သင့်တော်မှု',
    aiAdAnglesHeading: 'အကြံပြု ကြော်ငြာ Idea များ',
    aiAdCautionsHeading: 'သတိပြုရမည့် အချက်များ',
    aiSecFinalRecommendation: '၁၀. နောက်ဆုံး Recommendation',
    aiNextActionLabel: 'လုပ်ဆောင်သင့်သော နောက်တစ်ဆင့်',
    aiAnalyzedAtLabel: 'သုံးသပ်ချိန်',
    aiModelLabel: 'Model',
    aiCachedLocallyLabel: 'ပြန်သုံးရန် Local တွင် သိမ်းထားပြီး',
    aiVerdictLabels: {
      'priority-test': 'ဦးစားပေး စမ်းသပ်သင့်သည်',
      'test-with-caution': 'သတိထား စမ်းသပ်သင့်သည်',
      monitor: 'စောင့်ကြည့်အဆင့်',
      skip: 'လောလောဆယ် ကျော်သွားသင့်သည်',
    },
    enrichJumpLabel: 'ဒေတာဖြည့်စွက်ရန်',
    enrichSectionHeading: 'Kalodata ဒေတာဖြည့်စွက်မှု (Data Enrichment)',
    enrichSectionSubtitle:
      'ရှိပြီးသားဒေတာကို ထပ်မခေါ်ဘဲ မရှိသေးသော Product Detail၊ Shop Detail (Shop ID တူလျှင် ၁ ကြိမ်သာခေါ်) နှင့် ဝယ်သူ Review Insights များကိုသာ ရွေးချယ်ဖြည့်စွက်နိုင်ပါသည်။',
    enrichLastUpdatedLabel: 'နောက်ဆုံးအပ်ဒိတ်',
    enrichNotEnrichedYet: 'Rank ဒေတာသာ',
    enrichVerificationLabel: 'ဒေတာအတည်ပြုမှုအဆင့်',
    enrichMarketProductHeading: 'Kalodata ဈေးကွက်ဒေတာနှင့် Product အသေးစိတ်',
    enrichShopInfoHeading: 'ဆိုင်အချက်အလက် (Shop Information)',
    enrichReviewInsightsHeading: 'ဝယ်သူ Review နှင့် လိုအပ်ချက် သုံးသပ်ချက်',
    enrichControlsHeading: 'မရှိသေးသော Kalodata ဒေတာများ ဖြည့်စွက်ရန်',
    enrichLayerProductDetail: 'Product Detail',
    enrichLayerShopDetail: 'Shop Detail',
    enrichLayerReviewInsights: 'Review Insights (ရွေးချယ်မှသာ)',
    enrichStatusPresent: 'ရှိပြီးသား',
    enrichStatusCached: 'Cache ရှိ · 0 cr',
    enrichStatusMissing: 'မရှိသေးပါ',
    enrichShopCacheSavedNote: 'Shop ID တူသော Product များအားလုံးအတွက် ၁ ကြိမ်သာခေါ်ပြီး အလိုအလျောက် ပြန်သုံးပေးပါမည်။',
    enrichReviewOptInWarning: 'Review Insight API သည် Product ၁ ခုလျှင် 1.0 credit ကုန်ကျသဖြင့် ကိုယ်တိုင်ရွေးချယ်အတည်ပြုမှသာ ခေါ်ဆိုပါမည်။',
    enrichApplyCacheBtn: 'သိမ်းထားပြီးသား Cache ဒေတာဖြည့်မည် (0 Credits)',
    enrichStartBtn: 'ရွေးချယ်ထားသော ဒေတာဖြည့်မည်',
    enrichConfirmTitle: 'Kalodata ဒေတာဖြည့်စွက်မှုကို အတည်ပြုပါ',
    enrichConfirmDesc:
      'API မခေါ်ဆိုရသေးပါ။ Kalodata API မခေါ်မီ အောက်ပါ API အကြိမ်ရေနှင့် ခန့်မှန်း Credit ကုန်ကျစရိတ်ကို စစ်ဆေးအတည်ပြုပါ။',
    enrichConfirmProceedBtn: 'အတည်ပြုပြီး ဒေတာဖြည့်မည်',
    enrichConfirmCancelBtn: 'မလုပ်တော့ပါ',
    enrichRunningLabel: 'မရှိသေးသော Kalodata ဒေတာများကို ရယူနေပါသည်...',
    enrichSpendingLimitBlocked:
      'ခန့်မှန်းကုန်ကျစရိတ်သည် Spending Limit ထက် ကျော်လွန်နေပါသည်။ ကုန်ကျစရိတ်မြင့်သောအပိုင်းကို ဖြုတ်ပါ သို့မဟုတ် Spending Limit တိုးမြှင့်ပါ။',
    enrichAllDoneNotice:
      'ဤ Product အတွက် Kalodata ဒေတာအားလုံး (Product Detail၊ Shop Detail နှင့် Review Insights) ပြည့်စုံစွာ ရှိပြီးဖြစ်၍ API ထပ်ခေါ်ရန် မလိုပါ။',
    enrichNoKalodataIdNotice:
      'ဤ Product မှတ်တမ်းတွင် Kalodata Product ID မပါဝင်သဖြင့် Kalodata API ဖြင့် ဖြည့်စွက်၍ မရနိုင်ပါ။',
    enrichReviewLikes: 'ဝယ်သူများ နှစ်သက်သည့်အချက်များ',
    enrichReviewDislikes: 'မကြိုက်သည့်အချက်များ',
    enrichReviewComplaints: 'အဖြစ်များသော စောဒကများ (Frequent Complaints)',
    enrichReviewQualityCautions: 'Product အရည်အသွေး သတိပြုရန်အချက်များ',
    enrichReviewBuyerNeeds: 'ဝယ်သူလိုအပ်ချက်နှင့် အသုံးပြုပုံများ',
    enrichReviewUnavailableNote:
      'Unavailable — ဝယ်သူ Review Insights မရယူရသေးပါ။ တကယ့် Kalodata Review အချက်အလက်များ ကြည့်လိုပါက အထက်တွင် "Review Insights (1.0 cr)" ကို ရွေးချယ်အတည်ပြုပါ (မရှိသော Review ကို မဖန်တီးပါ)။',
    enrichShopUnavailableNote:
      'Unavailable — ဆိုင် GMV၊ Brand/Retailer အမျိုးအစားနှင့် Shop Creator အရေအတွက် မရယူရသေးပါ။ Shop ID ၁ ခုလျှင် ၁ ကြိမ်သာခေါ်ရန် "Shop Detail (0.1 cr)" ကို ရွေးချယ်ပါ။',
    enrichDedupSavedLabel: 'ကြိမ် ထပ်မခေါ်ဘဲ Cache မှ သက်သာခဲ့သည်',
    // Phase 5: Product Results, Ranking, Filtering, Comparison, Decisions & Export
    sortFieldLabels: {
      overallScore: 'Overall Score (စုစုပေါင်းအမှတ်)',
      salesPerformance: 'Sales Performance (ရောင်းအား)',
      revenuePerformance: 'Revenue Performance (ဝင်ငွေ)',
      revenueGrowth: 'Revenue Growth (တိုးတက်နှုန်း)',
      commissionPotential: 'Commission Potential (ကော်မရှင်)',
      competition: 'Competition (ပြိုင်ဆိုင်မှု)',
      aiContentSuitability: 'AI Content Suitability',
      dataConfidence: 'Data Confidence (ဒေတာယုံကြည်မှု)',
    },
    sortDirHighest: 'အမြင့်ဆုံးမှ',
    sortDirLowest: 'အနိမ့်ဆုံးမှ',
    decisionVerdictLabels: {
      recommended: 'Recommended (ရွေးချယ်သင့်)',
      'worth-testing': 'Worth Testing (စမ်းသပ်သင့်)',
      'need-more-data': 'Need More Data (ဒေတာထပ်လို)',
      'not-recommended': 'Not Recommended (မရွေးသင့်)',
    },
    decisionSummaryHeading: 'နောက်ဆုံးဆုံးဖြတ်ချက် (Decision Summary)',
    decisionCautionsLabel: 'သတိပြုရန်အချက်များ',
    bestSelectionHeading: 'အကောင်းဆုံး Product ရွေးချယ်မှု (Best Product Selection)',
    bestSelectionSubtitle:
      'လက်ရှိရလဒ်များထဲမှ အတည်ပြုဒေတာများအပေါ် အခြေခံရွေးချယ်ထားသည်။ ဒေတာမလုံလောက်ပါက Best ဟု အတင်းမသတ်မှတ်ပါ။',
    bestSelectionShow: 'အကောင်းဆုံးရွေးချယ်မှု ပြရန်',
    bestSelectionHide: 'ဝှက်ထားရန်',
    bestSelectionCategories: {
      bestOverall: 'Best Overall (အကောင်းဆုံး)',
      bestSalesPotential: 'Best Sales Potential (ရောင်းအားအကောင်းဆုံး)',
      bestCommissionPotential: 'Best Commission Potential (ကော်မရှင်အကောင်းဆုံး)',
      lowestCompetition: 'Lowest Competition (ပြိုင်ဆိုင်မှုအနည်းဆုံး)',
      bestAiContentPotential: 'Best AI Content Potential',
      highestDataConfidence: 'Highest Data Confidence (ဒေတာအပြည့်စုံဆုံး)',
    },
    bestInsufficientBadge: 'အချက်အလက် မပြည့်စုံပါ',
    filtersToggleBtn: 'စစ်ထုတ်ရန် (Filters)',
    filtersClearAllBtn: 'Filter အားလုံးဖျက်မည်',
    filtersAllOption: 'အားလုံး',
    filterScoreRangeLabel: 'အမှတ်အပိုင်းအခြား (Score)',
    filterScore80Plus: '80+ (အမြင့်)',
    filterScore65To79: '65–79 (အလယ်အလတ်)',
    filterScoreUnder65: '65 အောက်',
    filterDecisionLabel: 'Recommendation အဆင့်',
    filterConfidenceLabel: 'Data Confidence',
    filterCompetitionLabel: 'ပြိုင်ဆိုင်မှုအဆင့်',
    filterSalesLabel: 'ရောင်းအားအခြေအနေ',
    filterCommissionLabel: 'Commission အလားအလာ',
    filterCategoryLabel: 'Product အမျိုးအစား',
    filterModeLabel: 'Research Mode',
    filterAiSuitabilityLabel: 'AI Content သင့်တော်မှု',
    filterPerfStrong: 'အားကောင်း (70+)',
    filterPerfModerate: 'အသင့်အတင့် (45–69)',
    filterPerfLow: 'အားနည်း (<45)',
    filterPerfUnavailable: 'Unavailable',
    exportCsvBtn: 'CSV ထုတ်မည်',
    exportJsonBtn: 'JSON ထုတ်မည်',
    compareSelectBtn: 'နှိုင်းယှဉ်မည်',
    compareSelectedBtn: 'ရွေးထားပြီး',
    compareBarTitle: 'နှိုင်းယှဉ်ရန် ရွေးထားသော Product များ',
    compareOpenBtn: 'နှိုင်းယှဉ်ကြည့်မည်',
    compareClearBtn: 'ရှင်းလင်းမည်',
    compareModalTitle: 'Product များ နှိုင်းယှဉ်ချက် (Product Comparison)',
    compareModalSubtitle:
      'Kalodata တကယ့်ဒေတာများနှင့် Phase 2–4 သုံးသပ်ချက်များကို ယှဉ်ကြည့်နိုင်ပါသည်။ မရှိသောဒေတာကို 0 ဟု မပြဘဲ Unavailable ဟုသာ ပြထားပါသည်။',
    compareDistinctIdsNote: 'Product ID မတူညီသော ပစ္စည်းများကို သီးခြားခွဲပြထားပြီး ကွဲပြားသောအချက်များကို အမှတ်အသားပြထားပါသည်။',
    compareDiffTag: 'ကွဲပြားသည်',
    compareAddSavedLabel: 'Saved Product ထပ်ပေါင်းနှိုင်းယှဉ်ရန်',
    compareAddSavedPlaceholder: 'သိမ်းထားသော Product ရွေးပါ...',
    compareRemoveBtn: 'ဖယ်ရှားမည်',
    compareNeedTwoNote: 'နှိုင်းယှဉ်ကြည့်ရန် Results၊ Saved Products သို့မဟုတ် History မှ Product အနည်းဆုံး ၂ ခု ရွေးချယ်ပါ။',
    compareSourceResults: 'လက်ရှိရလဒ်',
    compareSourceSaved: 'Saved Product',
    compareSourceHistory: 'History မှတ်တမ်း',
    reportTabMarketData: 'Kalodata ဒေတာ',
    reportTabDecision: 'ဆုံးဖြတ်ချက်',
    reportTabStrengths: 'အားသာချက်/အန္တရာယ်',
    reportKalodataTag: 'Kalodata တကယ့်ဒေတာ',
    reportAiTag: 'AI သုံးသပ်ချက် (Kalodata ဒေတာနှင့် သီးခြားခွဲပြထားသည်)',
    reportLastUpdatedLabel: 'နောက်ဆုံးအပ်ဒိတ်',
    reportExportCsv: 'CSV',
    reportExportJson: 'JSON',
    // Phase 8: Universal Product Category Support & Subcategory Sync
    selectAllVerifiedAction: 'ပံ့ပိုးထားသမျှအားလုံးရွေးမည်',
    clearAllCategoriesAction: 'အားလုံးဖြုတ်မည်',
    showAllCategoriesToggle: 'မရနိုင်သေးသော Category ကြည့်ရန်',
    showUnsupportedCategoriesToggle: 'မပံ့ပိုးသော Category ကြည့်ရန်',
    showPendingSyncCategoriesToggle: 'Sync လိုသော Category ကြည့်ရန်',
    hideExtraCategoriesToggle: 'ပံ့ပိုးထားသမျှသာပြရန်',
    selectedCategoriesCountLabel: 'ခု ရွေးထား',
    multiCategoryModeLabel: 'Category များစွာ ရှာဖွေမှုပုံစံ',
    multiCategoryCombinedDesc: 'ရွေးထားသော Category ID အားလုံးကို တစ်ခါတည်းပေါင်းရှာသည် — Credit အသက်သာဆုံး',
    multiCategorySplitDesc: 'Category တစ်ခုချင်းစီကို ခွဲရှာပေးသည် — Category အလိုက် မျှတစွာရရှိ',
    categoryStatusLabels: {
      verified: 'Verified',
      'docs-verified': 'Verified',
      synced: 'Synced',
      'requires-sync': 'Sync လိုအပ်',
      unsupported: 'မပံ့ပိုးပါ',
    },
    syncCategoriesBtn: 'TH Categories Sync (0.1 cr)',
    syncCategoriesRunning: 'Kalodata TH Categories ကို Sync လုပ်နေပါသည်...',
    syncCategoriesConfirmTitle: 'Kalodata မှ တရားဝင် ထိုင်း Category IDs များကို Sync လုပ်မလား?',
    syncCategoriesConfirmDesc:
      'Kalodata Category Rank API (L1, TH, 1 call = 0.1 credits) ကို ခေါ်ဆိုပြီး Electronics, Kitchen, Health, Food, Baby, Sports, Automotive, Pets, Toys, Books နှင့် Jewelry တို့၏ တရားဝင် ID များကို ချိတ်ဆက်ပေးပါမည်။ API တွင် မပါသော Category များကို မခန့်မှန်းဘဲ မပံ့ပိုးပါ (Unsupported) ဟု ရိုးသားစွာ ပြပါမည်။',
    syncCategoriesConfirmProceed: 'အတည်ပြုပြီး Sync လုပ်မည် (0.1 cr)',
    syncCategoriesSyncedNote: 'TH Categories Sync လုပ်ပြီး',
    syncCategoriesEmptyHint:
      'ကျန် Category များကို အသုံးပြုရန် Kalodata TH Category Sync (0.1 cr) ၁ ကြိမ် လုပ်ဆောင်ရန် လိုအပ်ပါသည် — မသေချာသော ID များကို ခန့်မှန်းမထည့်ပါ။',
    syncCategoriesEmptyResultError:
      'Kalodata မှ Category စာရင်း 0 ခုသာ ပြန်ရသဖြင့် ယခင် Category အခြေအနေများကို မပြောင်းလဲဘဲ ထိန်းသိမ်းထားပါသည်။',
    subcategorySectionLabel: 'Subcategories (ရွေးချယ်နိုင်သော L2 စစ်ထုတ်မှု)',
    subcategoryLoadBtn: 'Subcategories ဖတ်မည် (0.1 cr)',
    subcategoryLoadConfirmTitle: 'Kalodata မှ တရားဝင် L2 Subcategories များကို ဖတ်ယူမလား?',
    subcategoryLoadConfirmDesc:
      'ရွေးချယ်ထားသော Category များအတွက် Kalodata Category Rank API (L2, TH, 1 call = 0.1 credits) ကို ခေါ်ဆိုပြီး ဤ Browser တွင် Cache သိမ်းထားပေးပါမည်။',
    subcategoryClearBtn: 'Subcategories ဖြုတ်မည်',
    subcategorySelectedHint: 'ရွေးထားသော L2 Subcategory ID များဖြင့် Kalodata Product Rank ကို တိကျစွာ ရှာဖွေပေးပါမည်။',
    subcategoryEmptyHint:
      'ရွေးထားသော Category များ၏ L2 Subcategories များကို ဖတ်ယူရန် (0.1 cr, Browser တွင် သိမ်းထားမည်) အပေါ်ခလုတ်ကို နှိပ်ပါ။',
    aiAdFormatLabels: {
      'ai-virtual-female-model': 'AI Virtual Female Model ကြော်ငြာ သင့်တော်မှု',
      'product-only-3d-commercial': 'Product-Only 3D Commercial ကြော်ငြာ သင့်တော်မှု',
      'tech-feature-demo': 'Tech Feature နှင့် Spec စမ်းသပ်ပြ Demo ကြော်ငြာ သင့်တော်မှု',
      'home-problem-solution-demo': 'အိမ်သုံး/မီးဖိုချောင် ပြဿနာဖြေရှင်းပြ Demo ကြော်ငြာ သင့်တော်မှု',
      'lifestyle-usage-demo': 'နေ့စဉ်လက်တွေ့အသုံးပြုပုံနှင့် Unboxing ကြော်ငြာ သင့်တော်မှု',
      'consumable-trust-demo': 'စားသောက်/ကျန်းမာရေး ယုံကြည်စိတ်ချရမှု Demo ကြော်ငြာ သင့်တော်မှု',
    },
    aiCategoryUnverifiedTitle: 'Category ကိုက်ညီမှု အတည်မပြုနိုင်ပါ (Unverified)',
    aiAffiliateStrategyHeading: 'Affiliate ဗျူဟာ (Affiliate Strategy)',
    navCategories: 'Categories',
    // Phase 9: Myanmar Video-First Discovery (Thailand TikTok Shop Only)
    myanmarFilterLabel: 'မြန်မာ Video ပါ Product ရှာဖွေမှု',
    myanmarFilterSubLabel: 'TH TikTok Shop · Video-First (Video ၁၀၀ လျှင် 0.1 cr)',
    myanmarFilterOff: 'OFF',
    myanmarFilterOn: 'ON',
    myanmarFilterPopoverTitle: 'မြန်မာ Video-First Product Discovery (TH Shop)',
    myanmarFilterPopoverDesc:
      'Kalodata Video Rank API (Video ၁၀၀ လျှင် 0.1 Credit) ဖြင့် Thailand TikTok Shop ဗီဒီယိုများကို Page အလိုက် ရှာဖွေပြီး မြန်မာစာ (Unicode / Zawgyi / ထိုင်း+မြန်မာ ရောနှော သို့မဟုတ် မြန်မာ Hashtag) ပါဝင်သော ဗီဒီယိုများနှင့် ချိတ်ဆက်ထားသည့် Affiliate Product (commission > 0) များကို သင်တောင်းဆိုသော အရေအတွက် (ဥပမာ ၂၀ ခု) ပြည့်သည်အထိ စုဆောင်းပေးပါသည်။ ထို့နောက် Product Detail (0.1 cr · Cache = 0 cr) ဖြင့် ဒေတာအတည်ပြုပြီး SiamPick ၏ 7-Factor 100-Point Scoring စနစ်အတိုင်း (အမှတ်အပိုမပေါင်းဘဲ) Ranking ပြန်စီပေးပါသည်။ မရှိသော Product ကို အတုအယောင် ဖြည့်မပြပါ။',
    myanmarFilterActiveBadge: 'မြန်မာ Video-First: ON (TH Shop)',
    myanmarReviewScanLimitLabel: 'Review စစ်ဆေးမည့် Product အရေအတွက်',
    myanmarReviewScanLimitHint:
      'Cache မရှိသေးသော ထိုင်း Product များအတွက် Buyer Review API ခေါ်ဆိုမည့် အများဆုံးအရေအတွက် (Product ၁ ခုလျှင် 1.0 Credit · Cache ရှိပြီးသား 0 Credit)။ ဤကန့်သတ်ချက်ထက် ကျော်လွန်သော Product များကို မစစ်ဆေးကြောင်း ရိုးသားစွာ ဖော်ပြပါသည်။',
    myanmarVideoScanPagesLabel: 'Video ရှာဖွေမည့် Page အရေအတွက် (၁ Page = Video ၁၀၀)',
    myanmarVideoScanPagesHint:
      'သင်တောင်းဆိုသော Product အရေအတွက် (ဥပမာ ၂၀ ခု) ပြည့်သည်အထိ Kalodata Video Rank မှ ရှာဖွေမည့် အများဆုံး Page အရေအတွက် (၁ Page = Video ၁၀၀ = 0.1 Credit)။ Product အရေအတွက် ပြည့်တာနဲ့ ချက်ချင်းရပ်ပြီး Credit ချွေတာပေးပါသည်။',
    myanmarVideoDiscoveryBarTitle: 'မြန်မာ Video-First ရှာဖွေမှု အကျဉ်းချုပ် (Thailand TikTok Shop)',
    myanmarVideoStatPagesScanned: 'စစ်ခဲ့သည့် Page',
    myanmarVideoStatVideosScanned: 'စစ်ခဲ့သည့် TH Video',
    myanmarVideoStatMatchedVideos: 'မြန်မာ Video တွေ့ရှိ',
    myanmarVideoStatCollectedProducts: 'Affiliate Product ရရှိ',
    myanmarVideoStatSkippedNonAff: 'ကျော်ခဲ့ (Non-Aff)',
    myanmarVideoStopReasonLabels: {
      'target-reached': 'အရေအတွက် ပြည့်မီပြီး',
      'max-pages-reached': 'သတ်မှတ် Page ပြည့်ပြီး',
      'source-exhausted': 'Kalodata Video ကုန်ပြီး',
      'budget-capped': 'Budget ကန့်သတ်ချက် ပြည့်ပြီး',
    },
    myanmarVideoShortfallNotice:
      'သတ်မှတ်ထားသော Scan Page / Budget အတွင်း တကယ့် မြန်မာ Video ပါ Affiliate Product အရေအတွက်သည် တောင်းဆိုထားသည်ထက် နည်းနေသောကြောင့် အတည်ပြုပြီး Product အစစ်များကိုသာ အတုအယောင်မဖြည့်ဘဲ ရိုးသားစွာ ပြသထားပါသည်။ ထပ်ရှာလိုပါက Video Scan Depth (Page) ကို တိုးမြှင့်နိုင်ပါသည်။',
    myanmarVideoCardLabel: 'မြန်မာ Video Match',
    myanmarVideosMatchedLabel: 'မြန်မာ Video',
    myanmarVideoEvidenceHeading: 'အတည်ပြုထားသော မြန်မာ TikTok Video များ',
    myanmarVideoOpenLinkLabel: 'Video ကြည့်မည်',
    myanmarReviewStatusLabels: {
      matched: 'မြန်မာ Review တွေ့ရှိသည်',
      'checked-no-match': 'မြန်မာ Review မတွေ့',
      'review-unavailable': 'Review မရရှိနိုင်ပါ (Review Unavailable)',
    },
    myanmarMixedThaiBurmeseTag: 'ထိုင်း+မြန်မာ ရောနှော',
    myanmarReviewsMatchedLabel: 'မြန်မာ Review',
    myanmarReviewsCheckedLabel: 'Review စစ်ဆေးပြီး',
    myanmarSkippedShortLabel: 'စာတိုလွန်း၍ ကျော်',
    myanmarDiscoveryBarTitle: 'မြန်မာ Review စစ်ဆေးမှု အကျဉ်းချုပ် (Thailand TikTok Shop)',
    myanmarDiscoveryPartialNotice:
      'အကုန်လုံးမစစ်ဆေးရသေးပါ — သတ်မှတ်ထားသော Review စစ်ဆေးမှုကန့်သတ်ချက်ကြောင့် တွေ့ရှိသည့် ထိုင်း Product အချို့ကိုသာ Review စစ်ဆေးထားပါသည်။',
    myanmarStatCandidatesFound: 'တွေ့ရှိ ထိုင်း Product',
    myanmarStatCheckedReviews: 'Review စစ်ဆေးပြီး',
    myanmarStatReviewsAvailable: 'Review ရရှိ',
    myanmarStatReviewUnavailable: 'Review မရရှိနိုင်',
    myanmarStatNoMyanmarReview: 'မြန်မာ Review မပါ',
    myanmarStatMatchedProducts: 'Match (≥၁ Review)',
    myanmarStatReviewsInspected: 'စစ်ဆေးခဲ့သည့် Review',
    myanmarSignalCardLabel: 'မြန်မာ Review Match',
    myanmarSignalSectionHeading: 'မြန်မာဘာသာ အထောက်အထားနှင့် အခြေအနေ',
    myanmarSignalSectionSubtitle:
      'Kalodata မှ ရရှိသော Thailand TikTok Shop တကယ့် Video သို့မဟုတ် Buyer Review များကိုသာ စစ်ဆေးထားပါသည်။ API မှ မရရှိသော အချက်အလက်များကို Unavailable ဟု ရိုးသားစွာ ဖော်ပြထားပါသည်။',
    myanmarConfidenceLabels: {
      High: 'High (မြင့်)',
      Medium: 'Medium (အလယ်)',
      Low: 'Low (နည်း)',
      None: 'မရှိ',
    },
    myanmarSourceLabels: {
      title: 'Product ခေါင်းစဉ် (Title)',
      description: 'Product အသေးစိတ် (Description)',
      reviews: 'ဝယ်သူ Review အနှစ်ချုပ်',
      comments: 'ဝယ်သူ Review မူရင်းများ',
      videoContent: 'TikTok Video / Creator စာသား',
    },
    myanmarAvailabilityLabels: {
      matched: 'တွေ့ရှိသည်',
      'checked-no-match': 'မတွေ့ရှိ',
      unavailable: 'Unavailable',
    },
    myanmarMatchTypeLabels: {
      'myanmar-script': 'မြန်မာစာ (Unicode)',
      'zawgyi-script': 'မြန်မာစာ (Zawgyi)',
      'burmese-romanized-term': 'မြန်မာ Tag / အသုံးအနှုန်း',
    },
    myanmarEvidenceHeading: 'အတည်ပြုထားသော မြန်မာ Review များ',
    myanmarNoEvidenceNote:
      'ဤ Product ၏ ရရှိနိုင်သော ဒေတာများတွင် အတည်ပြုနိုင်သည့် မြန်မာဘာသာစကား အထောက်အထား မတွေ့ရှိပါ။',
    myanmarSourcesHeading: 'Data Source ရရှိနိုင်မှု',
    myanmarEmptyTitle: 'မြန်မာ Video ပါဝင်သော TH Affiliate Product မတွေ့ရှိပါ',
    myanmarEmptyDesc:
      'ရွေးချယ်ထားသော Thailand TikTok Shop Category များအတွင်း စစ်ဆေးခဲ့သည့် ဗီဒီယိုများတွင် မြန်မာဘာသာစကား ပါဝင်ပြီး Affiliate Commission (> 0%) ရှိသော Product မတွေ့ရှိပါ။ အတုအယောင်ရလဒ်များ မဖန်တီးထားပါ။',
    myanmarEmptyScannedPrefix: 'စစ်ဆေးခဲ့သော ထိုင်း Video / Candidate:',
    myanmarTurnOffFilterBtn: 'မြန်မာ Filter ပိတ်ပြီး ပြန်ချိန်ညှိမည်',
    filterMyanmarSignalLabel: 'မြန်မာ Match',
    filterMyanmarSignalOnlyOption: 'မြန်မာ Video / Review အတည်ပြုပြီး Product များသာ',
    linkImportHeading: 'TikTok Shop Product Link ထည့်သွင်း၍ စစ်ဆေးမည်',
    linkImportSubtitle:
      'Thailand TikTok Shop Product Link၊ Short Link (vt.tiktok.com)၊ Redirect Link သို့မဟုတ် Share Text ကို Paste လုပ်ပါ။ Link စစ်ဆေးခြင်းသည် Kalodata Credit (0 cr) မကုန်ကျပါ။ Cache မရှိသေးမှသာ အတည်ပြုပြီး Import လုပ်နိုင်ပါမည်။',
    linkImportInputPlaceholder:
      'Product Link သို့မဟုတ် Share Text ထည့်ပါ (ဥပမာ https://vt.tiktok.com/... သို့မဟုတ် https://shop.tiktok.com/th/pdp/...)',
    linkImportPasteBtn: 'Paste',
    linkImportClearBtn: 'ရှင်းမည်',
    linkImportCheckBtn: 'Link စစ်ဆေးမည် (0 cr)',
    linkImportCheckingLabel: 'Link ကို စစ်ဆေးနေပါသည်...',
    linkImportImportingLabel: 'Kalodata မှ Product ဒေတာ ရယူနေပါသည်...',
    linkImportSupportedFormatsNote:
      'TH PDP Link တိုက်ရိုက်၊ vt.tiktok.com / vm.tiktok.com / tiktok.com/t/ Short Link၊ Redirect Link နှင့် Mobile Share စာသားများကို ပံ့ပိုးပါသည်။',
    linkImportInvalidTitle: 'Link ပုံစံ မမှန်ကန်ပါ (သို့) ပိတ်ပင်ထားသည်',
    linkImportUnsupportedTitle: 'ပံ့ပိုးမထားသော Link',
    linkImportNotFoundTitle: 'Product ရှာမတွေ့ပါ',
    linkImportReadyTitle: 'Thailand TikTok Shop Product ကို ခွဲခြားတွေ့ရှိပါသည်',
    linkImportProductIdLabel: 'Product ID',
    linkImportResolvedUrlLabel: 'နောက်ဆုံးရရှိသော URL',
    linkImportCanonicalUrlLabel: 'တရားဝင် TH PDP Link',
    linkImportRedirectChainLabel: 'Redirect လမ်းကြောင်း',
    linkImportCostZeroLabel: '0 Kalodata Credits (Cache မှ)',
    linkImportCostPaidLabel: '0.1 Kalodata Credits (Product Detail)',
    linkImportCacheNotice: 'ဤ Product ဒေတာသည် Cache ထဲတွင် အသင့်ရှိနေပြီး API ထပ်မခေါ်ဘဲ (0 cr) ထည့်သွင်းနိုင်ပါသည်။',
    linkImportDuplicateTitle: 'Workspace ထဲတွင် ရှိပြီးသား Product ဖြစ်ပါသည်',
    linkImportDuplicateDesc:
      'ဤ Product ID သည် Link မတူသော်လည်း သင့် Workspace ထဲတွင် ရှိပြီးသားဖြစ်ပါသည်။ Duplicate ထပ်မဖြစ်စေဘဲ Kalodata API ထပ်မခေါ်တော့ပါ။',
    linkImportDuplicateSourceResults: 'လက်ရှိ Results',
    linkImportDuplicateSourceSaved: 'Saved Products',
    linkImportDuplicateSourceHistory: 'Research History',
    linkImportViewExistingBtn: 'Single Result ဖွင့်ကြည့်မည် (0 cr)',
    linkImportImportCachedBtn: 'Cache မှ ရှာဖွေမည် (0 cr)',
    linkImportConfirmPromptTitle: 'Paid Kalodata Product Detail API ခေါ်ဆိုရန် အတည်ပြုပါ',
    linkImportConfirmPromptDesc:
      'ဤ Product သည် Cache ထဲတွင် မရှိသေးပါ။ ရှာဖွေပါက Kalodata Product Detail API ၁ ကြိမ် (~0.1 Credits) ခေါ်ဆိုမည်ဖြစ်ပြီး Spending Limit နှင့် Balance ဖြင့် စစ်ဆေးပါမည်။',
    linkImportConfirmCheckboxLabel: 'ဤ Product ကို ရှာဖွေရန် Kalodata Credit ~0.1 cr အသုံးပြုမည်ကို အတည်ပြုပါသည်။',
    linkImportConfirmExecuteBtn: 'အတည်ပြုပြီး Product ရှာဖွေမည် (0.1 cr)',
    linkImportRefreshCacheBtn: 'Kalodata မှ အသစ်ပြန်စစ်မည် (0.1 cr)',
    linkImportPausedBannerTitle: 'Paid Kalodata API များ ယာယီရပ်နားထားသည်',
    linkImportBudgetRemainingLabel: 'ကျန်ရှိသော Spending Limit',
    linkImportLimitExceededNote:
      'ဤ 0.1 Credit Call အတွက် Spending Limit မလုံလောက်ပါ။ အထက်ပါ Research Settings တွင် Spending Limit ကို တိုးမြှင့်ပေးပါ။',
    linkImportBalanceLabel: 'လက်ရှိ Balance',
    linkImportStorageBlockedNote:
      'Persistent Budget Storage မရရှိနိုင်သေးသဖြင့် ကုန်ကျစရိတ်လုံခြုံရေးအတွက် Paid API ခေါ်ဆိုမှုကို ပိတ်ထားပါသည်။',
    linkImportSuccessTitle: 'Single Product ရှာဖွေပြီး Single History တွင် သိမ်းဆည်းပြီးပါပြီ',
    linkImportSuccessCachedDesc:
      'Cache မှ အောင်မြင်စွာ ရယူပြီးပါပြီ (0 Kalodata Credits)။ Home Screen ရှိ Batch Recent Results များကို မပြောင်းလဲပါ။',
    linkImportSuccessPaidDesc:
      'Kalodata မှ တကယ့် Thailand TikTok Shop Product ဒေတာကို ရယူပြီး Single Product History ထဲ သိမ်းဆည်းပြီးပါပြီ။ Batch Recent Results များကို မထိခိုက်ပါ။',
    linkImportOpenReportBtn: 'Product Report ဖွင့်မည်',
    linkImportViewInSingleHistoryBtn: 'Single History တွင် ကြည့်မည်',
    linkImportClipboardUnavailableNote: 'Clipboard ဖတ်ခွင့် မရပါ — Box ထဲသို့ ကိုယ်တိုင် Paste လုပ်ပေးပါ။',
    linkImportDeepDiveBtn: 'Deep Dive Analysis ဝင်မည်',
    linkImportSaveBtn: 'Product သိမ်းမည်',
    linkImportSavedBtn: 'သိမ်းပြီး',
    linkImportSourceHeading: 'Data Source နှင့် Link စစ်ဆေးမှု',
    linkImportVerificationHeading: 'Verification အခြေအနေ',
    linkImportUnavailableHeading: 'မရရှိနိုင်သော ဒေတာများ',
    linkImportNoUnavailableNote: 'အဓိက Metric ဒေတာအားလုံးကို အတည်ပြုရရှိထားပါသည်။',
    linkImportOpenTikTokBtn: 'TikTok Shop တွင် ကြည့်မည်',
    linkImportShopLabel: 'ဆိုင်',
    linkImportPriceLabel: 'ဈေးနှုန်း',
    linkImportSalesLabel: 'ရောင်းအား',
    linkImportRevenueLabel: 'GMV',
    linkImportCommissionLabel: 'Commission',
    linkImportScoreLabel: 'Score',
  },
};
