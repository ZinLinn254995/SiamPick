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
import type { DeepDiveAnalysisId } from '../types/deepDive';

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
    batchSpendingLimitLabel: string;
    batchSpendingLimitInfo: string;
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
    bestAwardShortLabels: Record<BestSelectionCategory, string>;
    bestStatOverallScore: string;
    bestStatSales: string;
    bestStatCompetition: string;
    bestStatAiContent: string;
    bestStatDataConfidence: string;
    bestSoldUnit: string;
    bestCreatorsUnit: string;
    bestVerifiedUnit: string;
    bestOtherCategoryWinners: string;
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
    drawerWhyScoreHeading: string;
    drawerDetailsAccordion: string;
    drawerShowLess: string;
    drawerMoreUnit: string;
    drawerNoData: string;
    drawerPerSaleUnit: string;
    drawerMoreActions: string;
    drawerOpenTikTokShop: string;
    drawerCopyTikTokLink: string;
    drawerCopiedLink: string;
    drawerTikTokLinkAria: string;
    cardSalesLabel: string;
    historyVerdictBarLabel: string;
    historyRecordIdLabel: string;
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
    statusLegendTitle: string;
    statusLegendTrigger: string;
    statusLegendDescVerified: string;
    statusLegendDescEstimated: string;
    statusLegendDescUnverified: string;
    statusLegendDescUnavailable: string;
    mobileNavLabel: string;
    creditsLoadingLabel: string;
    factorShortLabels: Record<ScoreFactorKey, string>;
    bestLowestOfResults: string;
    bestCompetitionStillHighNote: string;
    exportDropdownBtn: string;
    periodLast7Day: string;
    periodLast30Day: string;
    deepDiveChipShortNames: Record<DeepDiveAnalysisId, string>;
    deepDiveAriaRunning: string;
    deepDiveAriaFinished: string;
    deepDiveAriaFailed: string;
    compareBestInMetrics: string;
    compareBestBadge: string;
    compareRowOverallScore: string;
    compareRowVerdict: string;
    compareRowPrice: string;
    compareRowCommission: string;
    compareRowSales: string;
    compareRowRevenue: string;
    compareRowCompetition: string;
    compareRowAiContent: string;
    compareRowConfidence: string;
    compareClosePickMoreBtn: string;
    compareImprovedChip: string;
    compareDeclinedChip: string;
    compareUnchangedChip: string;
    comparePeriodApartLabel: string;
    compareBeforeLabel: string;
    compareAfterLabel: string;
    compareResetFilterBtn: string;
    compareSwapSessionsBtn: string;
    savedVerdictAll: string;
    savedResetFiltersBtn: string;
    deepDiveHeadlineNotRun: string;
    deepDiveHeadlineError: string;
    deepDiveHeadlineReadyScript: string;
    launcherTabBatch: string;
    launcherTabSingle: string;
    launcherEditSettingsBtn: string;
    launcherCollapseSettingsBtn: string;
    launcherCheckLinkBtn: string;
    headerBalancePopoverTitle: string;
    headerBalanceLiveLabel: string;
    headerBalanceRefreshBtn: string;
    scoringRubricDetailsBtn: string;
    singleRecentLabel: string;
    singleOpenRecentBtn: string;
    singleEmptyBarHint: string;
    singleCheckNewLinkBtn: string;
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
    qualityGateVerifiedLabel: 'verified products',
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
    batchSpendingLimitLabel: 'Per-Search Max Cost (Credits)',
    batchSpendingLimitInfo:
      'Caps a single Batch Discovery run. Separate from your Daily Credit Guardrail used in Product Details, Link Research, and Deep Dive.',
    spendingLimitExceededTitle: 'Estimated cost exceeds per-search limit',
    spendingLimitExceededDesc:
      'Switch to Fast Mode, lower quantity or Deep-Inspect count, or raise this Per-Search Max Cost before calling Kalodata API.',
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
    bestAwardShortLabels: {
      bestOverall: 'Overall',
      bestSalesPotential: 'Sales',
      bestCommissionPotential: 'Commission',
      lowestCompetition: 'Low Competition',
      bestAiContentPotential: 'AI Content',
      highestDataConfidence: 'Data Confidence',
    },
    bestStatOverallScore: 'Overall Score',
    bestStatSales: 'Sales & Revenue',
    bestStatCompetition: 'Competition',
    bestStatAiContent: 'AI Content',
    bestStatDataConfidence: 'Data Confidence',
    bestSoldUnit: 'sold',
    bestCreatorsUnit: 'creators',
    bestVerifiedUnit: 'verified',
    bestOtherCategoryWinners: 'Category Highlights',
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
    drawerWhyScoreHeading: 'Why this score',
    drawerDetailsAccordion: 'Details',
    drawerShowLess: 'Show less',
    drawerMoreUnit: 'more',
    drawerNoData: 'No data',
    drawerPerSaleUnit: '/ sale',
    drawerMoreActions: 'More actions',
    drawerOpenTikTokShop: 'Open on TikTok Shop',
    drawerCopyTikTokLink: 'Copy link',
    drawerCopiedLink: 'Copied',
    drawerTikTokLinkAria: 'Copy TikTok Shop link',
    cardSalesLabel: 'Sales',
    historyVerdictBarLabel: 'Verdict breakdown',
    historyRecordIdLabel: 'Record ID',
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
    statusLegendTitle: 'Data Status Legend',
    statusLegendTrigger: 'Data status legend',
    statusLegendDescVerified: 'Confirmed directly from live Kalodata data',
    statusLegendDescEstimated: 'Derived or calculated from available signals',
    statusLegendDescUnverified: 'Present but not independently confirmed',
    statusLegendDescUnavailable: 'Not returned by source; never fabricated',
    mobileNavLabel: 'Mobile navigation',
    creditsLoadingLabel: 'Loading credit balance',
    factorShortLabels: {
      salesPerformance: 'Sales',
      revenuePerformance: 'Revenue',
      revenueGrowth: 'Rev. Growth',
      commissionPotential: 'Commission',
      competition: 'Competition',
      marketDemand: 'Market Demand',
      aiContentSuitability: 'AI Content',
    },
    bestLowestOfResults: 'Lowest of {n} results',
    bestCompetitionStillHighNote: 'Competition is still high overall',
    exportDropdownBtn: 'Export',
    periodLast7Day: '7d',
    periodLast30Day: '30d',
    deepDiveChipShortNames: {
      'product-intelligence': 'Product',
      'sales-market-intelligence': 'Sales',
      'affiliate-profit-analysis': 'Profit',
      'creator-competition-analysis': 'Creators',
      'video-intelligence': 'Videos',
      'customer-review-intelligence': 'Reviews',
      'market-competitor-comparison': 'Compare',
      'ai-strategic-recommendation': 'AI Verdict',
      'ad-video-creative-blueprint': 'Ad Script',
    },
    deepDiveAriaRunning: 'Running Module {nums}...',
    deepDiveAriaFinished: 'Module {nums} finished {time}',
    deepDiveAriaFailed: 'Module {nums} failed {time}',
    compareBestInMetrics: 'Best in {n} of {total} metrics',
    compareBestBadge: 'Best',
    compareRowOverallScore: 'Overall Score',
    compareRowVerdict: 'Verdict',
    compareRowPrice: 'Price',
    compareRowCommission: 'Commission',
    compareRowSales: 'Sales',
    compareRowRevenue: 'Revenue',
    compareRowCompetition: 'Competition',
    compareRowAiContent: 'AI Content',
    compareRowConfidence: 'Data Confidence',
    compareClosePickMoreBtn: 'Select Products',
    compareImprovedChip: 'Improved',
    compareDeclinedChip: 'Declined',
    compareUnchangedChip: 'Unchanged',
    comparePeriodApartLabel: 'Period between runs',
    compareBeforeLabel: 'Before',
    compareAfterLabel: 'After',
    compareResetFilterBtn: 'Show all',
    compareSwapSessionsBtn: 'Use latest 2 runs',
    savedVerdictAll: 'All Verdicts',
    savedResetFiltersBtn: 'Clear Filters',
    deepDiveHeadlineNotRun: 'Not run yet',
    deepDiveHeadlineError: 'Failed',
    deepDiveHeadlineReadyScript: '{hooks} hooks · {scenes} scenes',
    launcherTabBatch: 'Batch Discovery',
    launcherTabSingle: 'Single Link Research',
    launcherEditSettingsBtn: 'Edit Settings',
    launcherCollapseSettingsBtn: 'Collapse Settings',
    launcherCheckLinkBtn: 'Check a Link',
    headerBalancePopoverTitle: 'Kalodata Balance & Daily Budget',
    headerBalanceLiveLabel: 'Live Account Balance',
    headerBalanceRefreshBtn: 'Refresh',
    scoringRubricDetailsBtn: '7-Factor Breakdown',
    singleRecentLabel: 'Recent',
    singleOpenRecentBtn: 'Open Recent',
    singleEmptyBarHint: 'Paste any Thailand TikTok Shop link or share text to inspect & score.',
    singleCheckNewLinkBtn: 'Check New Link',
  },
  my: {
    navDiscover: 'ရလဒ်များ',
    navFashion: 'အမျိုးသမီးဖက်ရှင်',
    navBeauty: 'အလှကုန်နှင့် အသားအရေ',
    navStrategy: 'သတ်မှတ်ချက်',
    navHistory: 'မှတ်တမ်း',
    shortlistBtn: 'သိမ်းထားသော',
    heroTitle: 'ထိုင်း TikTok Shop Product Hunting',
    heroSubtitle:
      'ထိုင်း TikTok Shop ရှိ Fashion, Cosmetics, Home & Living, Electronics, Kitchen, Health, Food, Baby, Sports, Auto, Pets, Toys, Books နှင့် Jewelry အမျိုးအစားများကို Kalodata တကယ့်ဒေတာ၊ 100 မှတ် အမှတ်ပေးစနစ်နှင့် စက်တွင်းမှတ်တမ်းတို့ဖြင့် တိကျစွာ ရှာဖွေပါ။',
    settingsHeading: 'ကုန်ပစ္စည်း ရှာဖွေမှု သတ်မှတ်ချက်များ',
    settingMarketLabel: 'ဈေးကွက်',
    settingMarketValue: 'ထိုင်း TikTok Shop',
    settingFixedNote: 'အမြဲတမ်းသတ်မှတ်ထားသည်',
    settingPriceLabel: 'ကုန်ပစ္စည်း ဈေးနှုန်း',
    settingPriceValue: 'ကန့်သတ်ချက်မရှိ',
    strategyLabel: 'ကော်မရှင် နည်းဗျူဟာ',
    strategyBalanced: 'မျှတ',
    strategySales: 'ရောင်းအား ဦးစားပေး',
    strategyCommission: 'ကော်မရှင် ဦးစားပေး',
    settingStrategyValue: 'အချက် 7 ချက် အလေးချိန် စုစုပေါင်း 100 မှတ်',
    weightFineTune: 'အလေးချိန် ချိန်ညှိရန်',
    salesWeight: 'ရောင်းအားနှင့် ဝင်ငွေ ဦးစားပေး',
    commissionWeight: 'ကော်မရှင် ဦးစားပေး',
    settingCategoryLabel: 'ကုန်ပစ္စည်း အမျိုးအစားများ',
    settingBothCategories: 'အမျိုးအစား များစွာ',
    categoryAll: 'အားလုံး',
    categoryFashion: 'အမျိုးသမီးဖက်ရှင်',
    categoryBeauty: 'အလှကုန်နှင့် အသားအရေ',
    settingQuantityLabel: 'ရှာဖွေမည့် အရေအတွက်',
    quantityProductsUnit: 'ခု',
    startHuntingBtn: 'Product Hunting စတင်မည်',
    resumeAndStartBtn: 'ပြန်ဖွင့်ပြီး ရှာဖွေမည်',
    huntingInProgress: 'တကယ်ရောင်းချနေသော ကုန်ပစ္စည်းများကို စစ်ဆေးရှာဖွေနေပါသည်...',
    huntingCancelBtn: 'ရပ်တန့်ရန်',
    huntingLoadingTitle: 'Kalodata ထိုင်း TikTok Shop ရှာဖွေမှု လုပ်ဆောင်နေပါသည်',
    huntingLoadingDesc:
      'Kalodata OpenAPI မှ ထိုင်း TikTok Shop Affiliate ကုန်ပစ္စည်းများကို ရယူခြင်း၊ ဓာတ်ပုံနှင့် ဒေတာအချက်အလက်များ စစ်ဆေးခြင်းနှင့် 100 မှတ် နှိုင်းယှဉ်တွက်ချက်ခြင်း ပြုလုပ်နေပါသည်။',
    huntingErrorTitle: 'တိုက်ရိုက်ရှာဖွေမှု လုပ်ဆောင်၍ မရနိုင်သေးပါ',
    huntingRetryBtn: 'ထပ်မံကြိုးစားရန်',
    kalodataSourceBarLabel: 'Kalodata OpenAPI · ထိုင်း TikTok Shop',
    kalodataSourceNote:
      'အတည်ပြုပြီး သို့မဟုတ် Sync ပြုလုပ်ထားသော TH Category ID များဖြင့် Kalodata Product Rank API မှ တိုက်ရိုက်ရယူထားသော Affiliate ကုန်ပစ္စည်းများ (commission_rate > 0) ဖြစ်ပါသည်။ API တွင် မပါဝင်သော Rating၊ Review နှင့် ပြိုင်ဆိုင်မှုဒေတာများကို မရရှိနိုင်ပါ/အတည်မပြုရသေး ဟု ရိုးသားစွာ ဖော်ပြထားပါသည်။',
    groundingSourcesCount: 'ခု အတည်ပြုပြီး Kalodata အရင်းအမြစ်',
    groundingToggleShow: 'အရင်းအမြစ်များ ကြည့်ရန်',
    groundingToggleHide: 'အရင်းအမြစ်များ ပိတ်ရန်',
    groundingQueriesLabel: 'အသုံးပြုခဲ့သော API ရှာဖွေမှုများ',
    manualPausedTitle: 'ရှာဖွေမှုကို ခေတ္တရပ်နားထားပါသည်',
    manualPausedDesc:
      'မတော်တဆ API ခေါ်ဆိုမှု မဖြစ်စေရန် ရှာဖွေမှုကို ခေတ္တရပ်နားထားပါသည်။ ဆက်လက်ရှာဖွေလိုပါက ပြန်လည်ဖွင့်ရန် ခလုတ်ကို နှိပ်ပါ။',
    btnPauseResearch: 'ခေတ္တရပ်နားရန်',
    btnResumeResearch: 'ပြန်လည်ဖွင့်ရန်',
    btnResumeAndRetry: 'ပြန်ဖွင့်ပြီး ထပ်စမ်းရန်',
    qualityGateVerifiedLabel: 'ခု အတည်ပြုပြီး',
    qualityGateRequestedLabel: 'ခု တောင်းဆိုမှုအနက်',
    qualityGateExcludedNote:
      'အရည်အသွေးဦးစားပေးစနစ် — အတည်မပြုနိုင်သော သို့မဟုတ် ထပ်နေသော ကုန်ပစ္စည်းများကို အရေအတွက်ပြည့်ရန် ထည့်သွင်းခြင်းမပြုဘဲ ဖယ်ရှားထားပါသည်။',
    resultsSectionHeading: 'ရှာဖွေမှု ရလဒ်များ',
    queueActive: 'လက်ရှိစာရင်း',
    queueSaved: 'သိမ်းထားသော',
    queueRejected: 'ပယ်ဖျက်ထားသော',
    sortLabel: 'စီစဉ်ရန်',
    sortScoreDesc: 'အလားအလာအမှတ်: အမြင့်မှအနိမ့်',
    sortScoreAsc: 'အလားအလာအမှတ်: အနိမ့်မှအမြင့်',
    sortConfidenceDesc: 'ဒေတာယုံကြည်မှု: အမြင့်မှအနိမ့်',
    sortPriceAsc: 'ဈေးနှုန်း: အနည်းမှအများ',
    sortPriceDesc: 'ဈေးနှုန်း: အများမှအနည်း',
    cardPrice: 'ဈေးနှုန်း (THB)',
    cardCommission: 'ကော်မရှင်နှုန်း',
    cardCommissionUnverified: 'အတည်မပြုရသေး',
    cardCommissionVerified: 'အတည်ပြုပြီး',
    cardRatingReviews: 'အဆင့်သတ်မှတ်ချက်နှင့် Review',
    cardReviewsUnit: 'ခု',
    cardDemand: 'ဝယ်လိုအား',
    cardCompetition: 'ပြိုင်ဆိုင်မှု',
    cardAiVideo: 'AI Content',
    cardOpportunityScore: 'အလားအလာအမှတ်',
    cardConfidence: 'ဒေတာယုံကြည်မှု',
    cardImageUnverified: 'အတည်ပြုပုံ မရရှိနိုင်ပါ',
    cardOpenReport: 'အစီရင်ခံစာ ကြည့်ရန်',
    dataStatusLabels: {
      verified: 'အတည်ပြုပြီး',
      estimated: 'ခန့်မှန်း',
      unverified: 'အတည်မပြုရသေး',
      unavailable: 'မရရှိနိုင်ပါ',
    },
    btnSaveProduct: 'သိမ်းမည်',
    btnSavedProduct: 'သိမ်းပြီး',
    btnRejectProduct: 'ပယ်ဖျက်မည်',
    btnRestoreProduct: 'ပြန်ယူရန်',
    perOrder: '/ ခု',
    emptyLiveTitle: 'ထိုင်း TikTok Shop ရှာဖွေမှု စတင်ရန် အဆင်သင့်ဖြစ်ပါပြီ',
    emptyLiveDesc:
      'အထက်ရှိ သတ်မှတ်ချက်များတွင် အတည်ပြုပြီး ထိုင်း အမျိုးအစားများကို ရွေးချယ်ပါ (သို့မဟုတ် Kalodata မှ ထပ်မံ Sync လုပ်ပါ)၊ အရေအတွက်ရွေးချယ်ပြီး Product Hunting စတင်မည် ကို နှိပ်ပါ။',
    emptyStartBtn: 'Product Hunting စတင်မည်',
    emptyFilteredTitle: 'ဤစာရင်းတွင် ကုန်ပစ္စည်း မရှိသေးပါ',
    emptyFilteredDesc:
      'အမျိုးအစား Tab များ သို့မဟုတ် သိမ်းထားသော/ပယ်ဖျက်ထားသော စာရင်းများကို ပြောင်းလဲကြည့်ရှုပါ။',
    resetViewBtn: 'အားလုံးပြန်ကြည့်ရန်',
    reportTitle: 'ရှာဖွေမှု အစီရင်ခံစာ အသေးစိတ်',
    reportClose: 'ပိတ်ရန်',
    reportJumpSummary: 'အနှစ်ချုပ်',
    reportJumpReviews: 'သုံးသပ်ချက်များ',
    reportJumpRisks: 'စိုးရိမ်ချက်နှင့် စစ်ဆေးချက်',
    reportJumpVideo: 'AI Content',
    reportJumpSources: 'အရင်းအမြစ်နှင့် မပြည့်စုံမှု',
    dataVerificationHeading: 'ဒေတာအတည်ပြုမှု အနှစ်ချုပ် (အချက် 14 ချက်)',
    dataVerificationSubtitle:
      'အများပြည်သူမြင်နိုင်သော အထောက်အထားများကိုသာ အခြေခံထားပြီး TikTok Shop Affiliate ကိုယ်ပိုင်ဒေတာများကို တီထွင်ဖော်ပြခြင်းမပြုပါ။',
    fieldPrice: 'တကယ့်ဈေးနှုန်း',
    fieldSeller: 'ရောင်းချသည့်ဆိုင်',
    fieldSalesEvidence: 'ရောင်းအားအထောက်အထား',
    fieldReviewCount: 'Review အရေအတွက်',
    fieldCustomerRating: 'ဝယ်သူအဆင့်သတ်မှတ်ချက်',
    fieldCustomerFeedback: 'ဝယ်သူတုံ့ပြန်ချက်',
    fieldMarketDemand: 'ဈေးကွက်ဝယ်လိုအား',
    fieldCompetition: 'ပြိုင်ဆိုင်မှု',
    fieldCommissionRate: 'ကော်မရှင်နှုန်း',
    fieldCommissionPerSale: 'တစ်ခုရောင်း ခန့်မှန်းကော်မရှင်',
    fieldSellerReliability: 'ဆိုင်ယုံကြည်စိတ်ချရမှု',
    fieldProductQuality: 'ကုန်ပစ္စည်းအရည်အသွေး',
    fieldAiVideoPotential: 'AI Content အလားအလာ',
    fieldSourceLinks: 'အရင်းအမြစ်လင့်ခ်များ',
    productQualityHeading: 'ကုန်ပစ္စည်း အရည်အသွေး အထောက်အထား',
    sec01WhyChoose: '01. ဤကုန်ပစ္စည်းကို ဘာကြောင့် ရွေးချယ်သင့်သလဲ',
    sec02MarketDemand: '02. လက်ရှိ ဈေးကွက်ဝယ်လိုအား အထောက်အထား',
    sec03SalesPotential: '03. ရောင်းအားအလားအလာ',
    sec04CommissionIncome: '04. ကော်မရှင်နှုန်းနှင့် တစ်ခုရောင်းရလျှင် ရနိုင်မည့်ဝင်ငွေ',
    sec05ReviewStrengths: '05. ဝယ်သူသုံးသပ်ချက်များထဲမှ အားသာချက်များ',
    sec06CustomerComplaints: '06. ဝယ်သူစောဒကနှင့် အားနည်းချက်များ',
    sec07CompetitorLandscape: '07. ပြိုင်ဘက်များ၏ အခြေအနေ',
    sec08SellerReliability: '08. ဆိုင်ယုံကြည်စိတ်ချရမှု',
    sec09ProductRisks: '09. ဖြစ်နိုင်ခြေရှိသော စိုးရိမ်ချက်များ',
    sec10AiVideoPotential: '10. AI Content ဖန်တီးရန် အလားအလာ',
    sec11VideoContentIdeas: '11. Video Content အကြံဉာဏ် 3 ခု',
    sec12ResearchSources: '12. ရှာဖွေမှု အရင်းအမြစ်နှင့် လင့်ခ်များ',
    sec13ConfidenceLevel: '13. ဒေတာယုံကြည်မှုအဆင့်',
    sec14MissingData: '14. မရရှိနိုင်သေးသော အချက်အလက်များ',
    fashionRiskHeading: 'ဖက်ရှင် ပြန်အပ်နိုင်ခြေ စိုးရိမ်ချက် စစ်ဆေးချက် (အရွယ်အစား · အထည်သား · အရောင် · ဝတ်ဆင်ပုံ)',
    fashionRiskSizing: 'အရွယ်အစား',
    fashionRiskFabric: 'အထည်သား',
    fashionRiskColor: 'အရောင်ကွာခြားမှု',
    fashionRiskFit: 'ဝတ်ဆင်ပုံကွာခြားမှု',
    cosmeticsCheckHeading: 'အလှကုန် ယုံကြည်စိတ်ချရမှု၊ ထိုင်း FDA နှင့် ဖော်ပြချက် သတိပြုရန်',
    cosmeticsAuthenticity: 'အမှတ်တံဆိပ် အစစ်အမှန်',
    cosmeticsThaiFda: 'ထိုင်း FDA (อย.) အထောက်အထား',
    cosmeticsAdClaims: 'ကျန်းမာရေး/အလှအပ ဖော်ပြချက် ဘေးကင်းမှု',
    estEarningPerSale: 'တစ်ခုရောင်းရလျှင် ခန့်မှန်းဝင်ငွေ',
    sourcePendingLink: 'တိုက်ရိုက်လင့်ခ် မရရှိသေးပါ',
    sourceOpenLink: 'လင့်ခ်ဖွင့်ရန်',
    reportCopy: 'အစီရင်ခံစာ ကူးယူရန်',
    reportCopied: 'ကူးယူပြီး',
    shortlistEmptyTitle: 'သိမ်းထားသော ကုန်ပစ္စည်း မရှိသေးပါ',
    shortlistEmptyDesc:
      'ကုန်ပစ္စည်းကတ်ပေါ်ရှိ သိမ်းမည် ခလုတ်ကိုနှိပ်၍ စိတ်ဝင်စားသော ကုန်ပစ္စည်းများကို ဤနေရာတွင် စုစည်းထားနိုင်ပါသည်။',
    shortlistExportCsv: 'CSV ထုတ်ယူရန်',
    shortlistCopySummary: 'စာရင်းကူးယူရန်',
    shortlistAvgScore: 'ပျမ်းမျှ အလားအလာအမှတ်',
    footerNote: 'SiamPick · ထိုင်း TikTok Shop Affiliate ရှာဖွေမှု',
    marketScope: 'ဈေးကွက်: ထိုင်း TikTok Shop (THB ฿) · ဈေးနှုန်းကန့်သတ်ချက်မရှိ',
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
      Low: 'စိုးရိမ်ချက်နည်း',
      Watch: 'သတိပြုရန်',
      High: 'စိုးရိမ်ချက်မြင့်',
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
    scoringToggleBtn: 'အမှတ်ပေးစနစ် (100 မှတ်)',
    scoringPanelTitle: 'အမှတ်ပေးစနစ် (အချက် 7 ချက် · စုစုပေါင်း 100 မှတ်)',
    scoringDisclaimer:
      'ဤအမှတ်သည် Kalodata တကယ့်ဒေတာအပေါ် အခြေခံတွက်ချက်သော ကိုယ်ပိုင်စနစ်ဖြစ်ပြီး TikTok Shop ၏ တရားဝင်အမှတ် မဟုတ်ပါ။',
    scoringVerificationRule:
      'ဒေတာမရှိသည့်အချက်ကို 0 မှတ်ဖြင့် မနှိမ်ဘဲ ရရှိထားသောအချက်များအကြား အလေးချိန်ကို မျှတစွာပြန်ခွဲဝေပေးပါသည်။ ဒေတာမပြည့်စုံမှုကြောင့် အမှတ်မြင့်သွားခြင်းကို မလှည့်စားစေရန် ဒေတာယုံကြည်မှုကို သီးခြားဖော်ပြပါသည်။',
    scoringPairReminder:
      'စုစုပေါင်းအမှတ် တစ်ခုတည်းကိုသာ အားမကိုးဘဲ ဒေတာယုံကြည်မှု၊ အားသာချက်/အားနည်းချက်နှင့် စိုးရိမ်ချက်များကို တွဲဖက်သုံးသပ်ပါ။',
    scoringBreakdownHeading: 'အချက် 7 ချက် အမှတ်အသေးစိတ် (100 မှတ်)',
    scoringJumpLabel: 'အမှတ်ခွဲခြမ်း',
    scoringVerifiedCountLabel: 'ချက် အတည်ပြုပြီး',
    scoringCappedNote: 'အလေးချိန် ပြန်ခွဲဝေထား',
    scoringTierRanges: {
      'priority-test': '80–100',
      'investigate-further': '65–79',
      'low-priority': '65 အောက်',
    },
    scoringTierLabels: {
      'priority-test': 'ဦးစားပေး စမ်းသပ်သင့်သော ကုန်ပစ္စည်း',
      'investigate-further': 'ထပ်မံစုံစမ်းသင့်သော ကုန်ပစ္စည်း',
      'low-priority': 'ဦးစားပေးမှု နည်းသော ကုန်ပစ္စည်း',
    },
    criterionLabels: {
      demandSales: 'ဝယ်လိုအားနှင့် ရောင်းအားအထောက်အထား',
      commissionEarning: 'ကော်မရှင်နှင့် ဝင်ငွေအလားအလာ',
      aiCreative: 'AI Content အလားအလာ',
      reviewsQuality: 'ဝယ်သူသုံးသပ်ချက်နှင့် အရည်အသွေး',
      priceAppeal: 'ဈေးနှုန်းဆွဲဆောင်မှု',
      competitionOpportunity: 'ပြိုင်ဆိုင်မှုအလားအလာ',
      sellerReliability: 'ဆိုင်ယုံကြည်စိတ်ချရမှု',
    },
    factorLabels: {
      salesPerformance: 'ရောင်းအားစွမ်းဆောင်ရည်',
      revenuePerformance: 'ဝင်ငွေစွမ်းဆောင်ရည်',
      revenueGrowth: 'ဝင်ငွေတိုးတက်နှုန်း',
      commissionPotential: 'ကော်မရှင်အလားအလာ',
      competition: 'ပြိုင်ဆိုင်မှု (Creator အရေအတွက်)',
      marketDemand: 'ဈေးကွက်ဝယ်လိုအား',
      aiContentSuitability: 'AI Content သင့်တော်မှု',
    },
    criterionVerificationLabels: {
      verified: 'အတည်ပြုပြီး',
      estimated: 'ခန့်မှန်း',
      unverified: 'အတည်မပြုရသေး',
      unavailable: 'မရရှိနိုင်ပါ',
    },
    scoringRedistributedLabel: 'မရရှိနိုင်ပါ · အလေးချိန် ပြန်ခွဲဝေပြီး',
    scoringRedistributedNotice:
      'မရရှိသေးသောအချက်၏ အလေးချိန်ကို ရရှိထားသောအချက်များကြား မျှတစွာပြန်ခွဲဝေထားပါသည်။ ဒေတာယုံကြည်မှုကို သီးခြားစစ်ဆေးပါ။',
    scoringBaseWeightLabel: 'မူလ အလေးချိန်',
    scoringEffectiveWeightLabel: 'လက်တွေ့ အလေးချိန်',
    scoringStrategyActiveLabel: 'လက်ရှိ နည်းဗျူဟာ အလေးချိန်များ',
    scoringStrengthsHeading: 'အားသာချက်များ',
    scoringWeaknessesHeading: 'အားနည်းချက်များ',
    scoringRisksHeading: 'သတိပြုရမည့် စိုးရိမ်ချက်များ',
    scoringConfidenceHeading: 'ဒေတာယုံကြည်မှု အခြေအနေ',
    scoringTotalWeightLabel: 'စုစုပေါင်း အလေးချိန်',
    savedViewTitle: 'သိမ်းထားသော ကုန်ပစ္စည်းများ',
    savedViewSubtitle:
      'သိမ်းထားသော ကုန်ပစ္စည်းများ၏ ရှာဖွေမှုရက်စွဲ၊ အရင်းအမြစ်နှင့် အသေးစိတ်အစီရင်ခံစာများကို စာမျက်နှာပြန်ဖွင့်ပြီးနောက်တွင်လည်း အချိန်မရွေး ပြန်ကြည့်နိုင်ပါသည်။',
    savedViewBackBtn: 'Product Hunting သို့ ပြန်သွားရန်',
    savedStorageNote: 'Browser ထဲတွင် သိမ်းဆည်းထားပြီး ပြန်ဖွင့်လျှင်လည်း မပျောက်ပါ',
    savedResearchDateLabel: 'ရှာဖွေမှု ရက်စွဲ',
    savedSourcesLabel: 'ရှာဖွေမှု အရင်းအမြစ်များ',
    savedDeleteBtn: 'ဖျက်ရန်',
    savedSortNewest: 'နောက်ဆုံးသိမ်းထားသော',
    savedNoSources: 'အတည်ပြုပြီး အရင်းအမြစ်လင့်ခ် မရှိသေးပါ',
    kalodataSectionLabel: 'Kalodata · လက်ကျန် Credit',
    kalodataChecking: 'Kalodata လက်ကျန် Credit ကို စစ်ဆေးနေပါသည်...',
    kalodataBalanceLabel: 'လက်ကျန် Credit',
    kalodataCheckBtn: 'လက်ကျန် စစ်ဆေးရန်',
    selectBothAction: 'နှစ်ခုလုံးရွေးမည်',
    noCategorySelectedWarning: 'Product Hunting စတင်ရန် အနည်းဆုံး အမျိုးအစား 1 ခု ရွေးချယ်ပါ။',
    bothModeLabel: 'ရှာဖွေမှုပုံစံ (အမျိုးအစား 2 ခုလုံး)',
    bothModeCombined: 'တစ်ကြိမ်တည်းပေါင်းရှာမည်',
    bothModeSplit: 'အမျိုးအစားတစ်ခုစီ ခွဲရှာမည်',
    bothModeCombinedDesc: '601152 နှင့် 601450 ကို ပေါင်း၍ရှာသည် — Credit သက်သာသည်',
    bothModeSplitDesc: '601152 နှင့် 601450 ကို ခွဲ၍ရှာသည် — 50/50 မျှတစွာရသည်',
    customQuantityLabel: 'ကိုယ်တိုင်ရိုက်ရန်',
    customQuantityHint: '1–500 (တစ်ကြိမ် 100 အလိုက် စာမျက်နှာခွဲ)',
    costPreviewHeading: 'ကုန်ကျစရိတ် ခန့်မှန်းချက်နှင့် သုံးစွဲမှုကန့်သတ်ချက်',
    estimatedCostLabel: 'ခန့်မှန်းကုန်ကျစရိတ်',
    actualCostLabel: 'တကယ်ကုန်ကျခဲ့သောစရိတ်',
    actualCostUnavailable: 'မရရှိနိုင်ပါ',
    plannedCallsLabel: 'API ခေါ်ဆိုမှု',
    actualCallsLabel: 'တကယ်ခေါ်ခဲ့သော အကြိမ်',
    creditsUnit: 'Credit',
    pricingFormulaNote:
      'Kalodata ဈေးနှုန်း: Rank 0.1 cr/100 ခု · Product Detail 0.1 cr · Shop Detail 0.1 cr · Review Insight 1.0 cr (1 cr ≈ $0.10)',
    spendingLimitLabel: 'သုံးစွဲမှုကန့်သတ်ချက် (Credit)',
    batchSpendingLimitLabel: 'တစ်ကြိမ်ရှာဖွေမှု Limit (Credit)',
    batchSpendingLimitInfo:
      'Batch Discovery တစ်ကြိမ်စာ ကုန်ကျစရိတ်ကိုသာ ကန့်သတ်ပါသည်။ Product Details၊ Link Research နှင့် Deep Dive တို့၏ တစ်နေ့တာ Credit ကန့်သတ်ချက်နှင့် သီးခြားစီ ခွဲထားပါသည်။',
    spendingLimitExceededTitle: 'ခန့်မှန်းကုန်ကျစရိတ်သည် တစ်ကြိမ်ရှာဖွေမှု Limit ထက် ကျော်လွန်နေပါသည်',
    spendingLimitExceededDesc:
      'API မခေါ်ဆိုမီ Fast Mode ပြောင်းပါ၊ အရေအတွက်/အသေးစိတ်စစ်ဆေးမှု လျှော့ပါ သို့မဟုတ် တစ်ကြိမ်ရှာဖွေမှု Limit ကို တိုးသတ်မှတ်ပါ။',
    confirmHeading: 'Kalodata API ခေါ်ဆိုမှုကို အတည်ပြုပါ',
    confirmNotice:
      'API မခေါ်ဆိုရသေးပါ။ အတည်ပြုပြီး Category ID များ၊ ရှာဖွေမှု Mode နှင့် ခန့်မှန်း Credit ကုန်ကျစရိတ်ကို စစ်ဆေးပြီးမှ အတည်ပြုပါ။',
    confirmStartBtn: 'အတည်ပြုပြီး စတင်ရှာဖွေမည်',
    confirmCancelBtn: 'မလုပ်တော့ပါ',
    researchModeLabel: 'ရှာဖွေမှု Mode ရွေးချယ်ရန်',
    modeFastTitle: 'Fast Mode',
    modeFastDesc: 'API ခေါ်ဆိုမှု အနည်းဆုံး · 7 ရက် ရောင်းအား/ဝင်ငွေ/ကော်မရှင် အမြန်စစ်',
    modeBalancedTitle: 'Balanced Mode',
    modeBalancedDesc: '30 ရက် ပိုစုံစစ်ထုတ်မှု + ထိပ်တန်း 3 ခု အသေးစိတ် + Gemini ခွဲခြမ်းမှု',
    modeDeepTitle: 'Deep Mode',
    modeDeepDesc: 'ကုန်ပစ္စည်းအသေးစိတ် + ဆိုင်အသေးစိတ် + စိုးရိမ်ချက် အသေးစိတ်စစ် (ကုန်ကျစရိတ်ကန့်သတ်)',
    deepDiveCountLabel: 'အသေးစိတ်စစ်မည့် ထိပ်တန်းကုန်ပစ္စည်း',
    deepDiveCountHint: 'ကုန်ကျစရိတ်မတက်စေရန် အများဆုံး 10 ခု ကန့်သတ်ထားသည်',
    includeReviewInsightsLabel: 'ဝယ်သူ Review သုံးသပ်ချက် ထပ်ထည့်ရန်',
    includeReviewInsightsDesc: 'ထိုင်းဝယ်သူ Review အားသာ/အားနည်းချက် · +1.0 cr/ခု (အများဆုံး 2 ခု)',
    breakdownRankLabel: 'Rank',
    breakdownVideoRankLabel: 'Video Rank',
    breakdownDetailLabel: 'Detail',
    breakdownShopLabel: 'Shop',
    breakdownReviewLabel: 'Reviews',
    geminiAnalysisActiveLabel: 'Gemini ခွဲခြမ်းမှု (Kalodata ဒေတာသာ)',
    depthTagDeep: 'Deep စစ်ဆေးပြီး',
    depthTagDetail: 'အသေးစိတ် အတည်ပြုပြီး',
    historyViewTitle: 'ရှာဖွေမှု မှတ်တမ်း',
    historyViewSubtitle:
      'Product Hunting လုပ်ပြီးတိုင်း ရရှိလာသော Kalodata ဒေတာ၊ AI ခွဲခြမ်းမှု၊ အမှတ်နှင့် ကုန်ကျစရိတ်များကို Browser ထဲတွင် အလိုအလျောက်သိမ်းဆည်းထားပြီး သိမ်းထားသောကုန်ပစ္စည်းများနှင့် သီးခြားစီစီမံပါသည်။',
    historyStorageNote: 'Browser ထဲတွင် သီးခြားသိမ်းဆည်းထားသည် · မှတ်တမ်းဖျက်သော်လည်း သိမ်းထားသောကုန်ပစ္စည်းများ မပျောက်ပါ',
    historyEmptyTitle: 'ရှာဖွေမှု မှတ်တမ်း မရှိသေးပါ',
    historyEmptyDesc:
      'Fast၊ Balanced သို့မဟုတ် Deep Mode ဖြင့် Product Hunting တစ်ခေါက်ပြုလုပ်ပြီးသည်နှင့် ရလဒ်အပြည့်အစုံကို ဤနေရာတွင် အလိုအလျောက်သိမ်းဆည်းပေးပါမည်။',
    historySearchPlaceholder: 'ကုန်ပစ္စည်းအမည်၊ ဆိုင်အမည်၊ မှတ်တမ်း ID သို့မဟုတ် အမျိုးအစားဖြင့် ရှာရန်...',
    historyFilterAllModes: 'Mode အားလုံး',
    historySortNewest: 'နောက်ဆုံးပြုလုပ်ခဲ့သော',
    historySortOldest: 'အဟောင်းဆုံးမှ',
    historySortMostProducts: 'ကုန်ပစ္စည်း အရေအတွက်အများဆုံး',
    historySortCostDesc: 'တကယ်ကုန်ကျစရိတ်: အများမှအနည်း',
    historySortCostAsc: 'တကယ်ကုန်ကျစရိတ်: အနည်းမှအများ',
    historyViewResultsBtn: 'မူရင်းရလဒ်ကြည့်ရန်',
    historyCompareBtn: 'နှိုင်းယှဉ်ရန်',
    historyDeleteBtn: 'ဖျက်ရန်',
    historyDeleteConfirmBtn: 'ဖျက်ရန်အတည်ပြု',
    historyDeleteSelectedBtn: 'ရွေးထားသည်များဖျက်ရန်',
    historySelectLabel: 'ရွေးရန်',
    historySelectedCount: 'ခု ရွေးထား',
    historyBackToListBtn: 'ရှာဖွေမှု မှတ်တမ်းသို့ ပြန်သွားရန်',
    historyArchiveBannerTitle: 'အရင်သိမ်းဆည်းထားသော မူရင်းရှာဖွေမှု ရလဒ်',
    historyArchiveBannerDesc:
      'ဤအချိန်က ရရှိခဲ့သော မူလဒေတာများကို ပြန်ကြည့်နေပါသည်။ လက်ရှိ Product Hunting ရလဒ်များနှင့် အစားမထိုးပါ။',
    historyScoreModeOriginal: 'မူရင်းအမှတ်များ',
    historyScoreModeLive: 'လက်ရှိ အလေးချိန်ဖြင့်',
    historyStorageUsageLabel: 'Browser သိုလှောင်မှု အသုံးပြုမှု',
    historyQuotaWarningTitle: 'Browser သိုလှောင်မှု နေရာပြည့်နေပါသည်',
    historyQuotaWarningDismiss: 'ပိတ်ရန်',
    historyTabRecords: 'အစုလိုက်မှတ်တမ်း',
    historyTabSingle: 'တစ်ခုချင်းမှတ်တမ်း',
    historyTabCompare: 'နှိုင်းယှဉ်ရန်',
    singleHistorySubtitle:
      'ကုန်ပစ္စည်းလင့်ခ်မှ တစ်ခုချင်း ရှာဖွေထားသော ထိုင်း TikTok Shop ကုန်ပစ္စည်းများ — အစုလိုက်မှတ်တမ်းနှင့် ပင်မရလဒ်များနှင့် သီးခြားစီ သိမ်းဆည်းထားသည် (အများဆုံး 100 ခု)။',
    singleHistoryEmptyTitle: 'တစ်ခုချင်းလင့်ခ် မှတ်တမ်း မရှိသေးပါ',
    singleHistoryEmptyDesc:
      'ပင်မစာမျက်နှာတွင် TikTok Shop ကုန်ပစ္စည်းလင့်ခ်တစ်ခု ထည့်ရှာလိုက်သည်နှင့် ရလဒ်ကို ဤတစ်ခုချင်းမှတ်တမ်းထဲ အလိုအလျောက် သိမ်းပေးပါမည် (အစုလိုက်ရလဒ်များကို မထိခိုက်ပါ)။',
    singleHistorySearchPlaceholder: 'ကုန်ပစ္စည်းအမည်၊ ဆိုင်၊ Product ID သို့မဟုတ် အမျိုးအစားဖြင့် ရှာရန်...',
    singleHistoryCapNote: 'အစုလိုက်ရှာဖွေမှုနှင့် သီးခြားစီ · အများဆုံး 100 ခု',
    singleHistoryOpenReportBtn: 'အစီရင်ခံစာ ဖွင့်မည်',
    singleHistoryDeepDiveBtn: 'Deep Dive',
    singleHistoryOpenLinkBtn: 'TikTok Shop',
    singleHistoryResearchedAtLabel: 'ရှာဖွေချိန်',
    singleHistorySourceLabel: 'ဒေတာအရင်းအမြစ်',
    singleHistoryCreditsLabel: 'ကုန်ကျစရိတ်',
    singleHistoryUnavailableNotesLabel: 'မရရှိနိုင်သောအချက်များ',
    compareHeading: 'ရှာဖွေမှု နှိုင်းယှဉ်ချက်',
    compareSubtitle:
      'မှတ်တမ်းထဲရှိ ရှာဖွေမှု အဟောင်းနှင့် အသစ်ကို နှိုင်းယှဉ်ပြီး ကုန်ပစ္စည်း စွမ်းဆောင်ရည် ပြောင်းလဲမှုများကို စစ်ဆေးပါ။',
    compareOlderLabel: 'ရှာဖွေမှု အဟောင်း',
    compareNewerLabel: 'ရှာဖွေမှု အသစ်',
    compareNeedTwoTitle: 'နှိုင်းယှဉ်ရန် မှတ်တမ်း အနည်းဆုံး 2 ခု လိုအပ်ပါသည်',
    compareNeedTwoDesc:
      'ရောင်းအား၊ ဝင်ငွေ၊ တိုးတက်နှုန်း၊ ကော်မရှင်နှင့် အမှတ်ပြောင်းလဲမှုများကို နှိုင်းယှဉ်ရန် Product Hunting 2 ကြိမ်နှင့်အထက် ပြုလုပ်ပါ။',
    compareExactIdRule:
      'Product ID တိကျစွာတိုက်ဆိုင်စစ်ဆေးမှု — Product ID တူညီသော ကုန်ပစ္စည်းများကိုသာ နှိုင်းယှဉ်ပြပါသည်။ ID မတူပါက တူညီသည်ဟု ခန့်မှန်းခြင်းမပြုဘဲ ဒေတာမရှိလျှင် မရရှိနိုင်ပါ ဟု ဖော်ပြပါသည်။',
    compareMatchedCount: 'ခု Product ID တူညီတွေ့ရှိ',
    compareOnlyOlder: 'အဟောင်းတွင်သာပါဝင်',
    compareOnlyNewer: 'အသစ်တွင်သာပါဝင်',
    compareNoMatchesTitle: 'ဤရှာဖွေမှု 2 ခုကြား Product ID တူညီမှု မရှိပါ',
    compareNoMatchesDesc:
      'ရွေးချယ်ထားသော ရှာဖွေမှု 2 ခုတွင် Product ID တူညီသော ကုန်ပစ္စည်း မတွေ့ရှိပါ။ Product ID မတူပါက အလိုအလျောက်မခန့်မှန်းပါ။',
    compareColProduct: 'ကုန်ပစ္စည်း (ID အတိအကျ)',
    compareColSales: 'ရောင်းအား ပြောင်းလဲမှု',
    compareColRevenue: 'ဝင်ငွေ ပြောင်းလဲမှု',
    compareColGrowth: 'တိုးတက်နှုန်း ပြောင်းလဲမှု',
    compareColCommission: 'ကော်မရှင် ပြောင်းလဲမှု',
    compareColScore: 'အမှတ် ပြောင်းလဲမှု',
    compareUnchanged: 'မပြောင်းလဲပါ',
    compareSelectDifferentHint: 'နှိုင်းယှဉ်ရန် မတူညီသော ရှာဖွေမှုမှတ်တမ်း 2 ခုကို ရွေးချယ်ပါ။',
    aiJumpLabel: 'AI သုံးသပ်ချက်',
    aiSectionHeading: 'AI ကုန်ပစ္စည်း ခွဲခြမ်းစိတ်ဖြာချက်',
    aiSectionSubtitle:
      'Kalodata မှ ရရှိထားသော ဒေတာအစစ်များကိုသာ အခြေခံ၍ Gemini ဖြင့် အချက် 10 ချက် အသေးစိတ်သုံးသပ်ချက် — မရှိသောဒေတာများကို မဖန်တီးပါ။',
    aiBadgeGeminiLive: 'Gemini သုံးသပ်ချက်',
    aiBadgeGeminiCached: 'Gemini · သိမ်းဆည်းပြီး',
    aiBadgeFallback: 'Kalodata အခြေခံ သုံးသပ်ချက်',
    aiBadgeReady: 'Kalodata 0 cr',
    aiDataSeparationNote:
      'အောက်တွင် တကယ့် Kalodata ဈေးကွက်ဒေတာ (အတည်ပြုပြီး / ခန့်မှန်း / အတည်မပြုရသေး / မရရှိနိုင်ပါ) နှင့် AI သုံးသပ်ချက်ကို ရှင်းရှင်းလင်းလင်း ခွဲပြထားပါသည်။',
    aiDataBasisHeading: 'Kalodata တကယ့်ဈေးကွက်ဒေတာ အခြေခံအချက်အလက်များ',
    aiInterpretationHeading: 'AI ဗျူဟာမြောက် သုံးသပ်ချက် (အထက်ပါ Kalodata ဒေတာအပေါ်သာ အခြေခံ)',
    aiInterpretationNote:
      'အောက်ပါ AI သုံးသပ်ချက်သည် အထက်ပါ Kalodata ဒေတာများကို အဓိပ္ပာယ်ဖွင့်ဆိုခြင်းသာဖြစ်ပြီး ဈေးကွက်ဒေတာအသစ် ဖန်တီးခြင်းမဟုတ်ပါ။',
    aiInferenceBadge: 'AI ဈေးကွက်သုံးသပ်ချက်',
    aiAssessmentBadge: 'AI Content သင့်တော်မှုသုံးသပ်ချက်',
    aiFallbackBannerTitle: 'Gemini ခွဲခြမ်းစိတ်ဖြာမှု မအောင်မြင်ပါ — Kalodata အခြေခံသုံးသပ်ချက်ကို ဖော်ပြထားပါသည်',
    aiStaleDataBannerTitle: 'ဤကုန်ပစ္စည်းအတွက် Kalodata ဒေတာအသစ် တွေ့ရှိပါသည်',
    aiStaleDataBannerDesc:
      'မလိုအပ်ဘဲ Gemini API ထပ်မခေါ်စေရန် အရင်သိမ်းထားပြီးသား AI သုံးသပ်ချက်ကို ပြပေးထားပါသည်။ ဒေတာအသစ်ဖြင့် ပြန်သုံးသပ်လိုမှသာ အောက်တွင် အတည်ပြုပါ။',
    aiEmptyTitle: 'ဤကုန်ပစ္စည်းအတွက် သိမ်းထားပြီးသား Gemini သုံးသပ်ချက် မရှိသေးပါ',
    aiEmptyDesc:
      'လက်ရှိရရှိပြီးသား Kalodata ဒေတာများကိုသာ အခြေခံ၍ Gemini ဖြင့် အချက် 10 ချက် (အားသာ/အားနည်းချက်၊ ရောင်းအား၊ တိုးတက်မှု၊ ကော်မရှင်၊ ပြိုင်ဆိုင်မှု၊ ပစ်မှတ်ဝယ်သူ၊ စိုးရိမ်ချက်၊ AI Content သင့်တော်မှုနှင့် နောက်ဆုံးအကြံပြုချက်) ကို သုံးသပ်နိုင်ပါသည်။ ရလဒ်ကို စက်ထဲတွင် သိမ်းထားပေးမည်ဖြစ်၍ ထပ်ခါထပ်ခါ API မခေါ်ပါ။',
    aiRunAnalysisBtn: 'Gemini ဖြင့် ခွဲခြမ်းစိတ်ဖြာမည်',
    aiReanalyzeBtn: 'ဒေတာအသစ်ဖြင့် ပြန်သုံးသပ်မည်',
    aiRetryGeminiBtn: 'Gemini ပြန်စမ်းကြည့်မည်',
    aiPreviewFallbackBtn: 'Kalodata အကျဉ်းချုပ်ကြည့်မည် (0 Call)',
    aiAnalyzingLabel: 'Kalodata ဒေတာများကို Gemini ဖြင့် ခွဲခြမ်းစိတ်ဖြာနေပါသည်...',
    aiConfirmTitle: 'Gemini API ခေါ်ဆိုမှုကို အတည်ပြုပါ',
    aiConfirmDesc:
      'API မခေါ်ဆိုရသေးပါ။ ဤကုန်ပစ္စည်းကို Gemini ဖြင့် ခွဲခြမ်းစိတ်ဖြာရန် အောက်ပါကုန်ကျစရိတ်အချက်အလက်ကို စစ်ဆေးပြီး အတည်ပြုပါ။',
    aiConfirmCallDetail: 'API ခေါ်ဆိုမှု: Server-side Gemini 1 ကြိမ် (gemini-4-hydrogen)',
    aiConfirmKalodataCost: 'Kalodata ကုန်ကျစရိတ်: 0 Credit ($0.00) — ရှိပြီးသားဒေတာကိုသာ သုံးမည်',
    aiConfirmTokenNote:
      'ခန့်မှန်း AI Token: ~1,800–2,800 tokens (Server GEMINI_API_KEY Quota ကိုသုံးမည် — ပုံမှန် <$0.001 သို့မဟုတ် Free Tier)',
    aiConfirmCacheNote:
      'ရလဒ်ကို Browser ထဲတွင် သိမ်းထားပေးမည်ဖြစ်၍ နောက်တစ်ကြိမ်ပြန်ဖွင့်လျှင် Gemini API ထပ်မခေါ်ပါ။',
    aiConfirmProceedBtn: 'အတည်ပြုပြီး Gemini စတင်မည်',
    aiConfirmCancelBtn: 'မလုပ်တော့ပါ',
    aiSecStrengths: '01. ကုန်ပစ္စည်း၏ အားသာချက်များ',
    aiSecWeaknesses: '01(ခ). ကုန်ပစ္စည်း၏ အားနည်းချက်များ',
    aiSecSalesRevenue: '02. လက်ရှိရောင်းအားနှင့် ဝင်ငွေအခြေအနေ',
    aiSecGrowthPotential: '03. ရောင်းအားတိုးတက်မှု အလားအလာ',
    aiSecCommissionPotential: '04. Affiliate ကော်မရှင် အလားအလာ',
    aiSecCompetition: '05. ပြိုင်ဆိုင်မှုအခြေအနေ',
    aiSecTargetCustomer: '06. ဘယ်လိုဝယ်သူမျိုးကို ရောင်းသင့်လဲ',
    aiSecWhyChoose: '07. ဘာကြောင့် ဤကုန်ပစ္စည်းကို ရွေးသင့်လဲ',
    aiSecRisksDrawbacks: '08. ဖြစ်နိုင်ခြေရှိသော စိုးရိမ်ချက်နှင့် အားနည်းချက်များ',
    aiSecAdSuitability: '09. AI Content ဖန်တီးရန် သင့်တော်မှု',
    aiAdFormatFashion: 'AI Virtual Female Model — AI Content သင့်တော်မှု',
    aiAdFormatBeauty: 'Product-Only 3D Commercial — AI Content သင့်တော်မှု',
    aiAdAnglesHeading: 'အကြံပြု Content အကြံဉာဏ်များ',
    aiAdCautionsHeading: 'သတိပြုရမည့် အချက်များ',
    aiSecFinalRecommendation: '10. နောက်ဆုံး အကြံပြုချက်',
    aiNextActionLabel: 'လုပ်ဆောင်သင့်သော နောက်တစ်ဆင့်',
    aiAnalyzedAtLabel: 'သုံးသပ်ချိန်',
    aiModelLabel: 'Model',
    aiCachedLocallyLabel: 'ပြန်သုံးရန် စက်ထဲတွင် သိမ်းထားပြီး',
    aiVerdictLabels: {
      'priority-test': 'ဦးစားပေး စမ်းသပ်သင့်သည်',
      'test-with-caution': 'သတိထား စမ်းသပ်သင့်သည်',
      monitor: 'စောင့်ကြည့်အဆင့်',
      skip: 'လောလောဆယ် ကျော်သွားသင့်သည်',
    },
    enrichJumpLabel: 'ဒေတာဖြည့်စွက်ရန်',
    enrichSectionHeading: 'Kalodata ဒေတာဖြည့်စွက်မှု',
    enrichSectionSubtitle:
      'ရှိပြီးသားဒေတာကို ထပ်မခေါ်ဘဲ မရှိသေးသော Product Detail၊ Shop Detail (Shop ID တူလျှင် 1 ကြိမ်သာခေါ်) နှင့် ဝယ်သူ Review သုံးသပ်ချက်များကိုသာ ရွေးချယ်ဖြည့်စွက်နိုင်ပါသည်။',
    enrichLastUpdatedLabel: 'နောက်ဆုံးအပ်ဒိတ်',
    enrichNotEnrichedYet: 'Rank ဒေတာသာ',
    enrichVerificationLabel: 'ဒေတာအတည်ပြုမှုအဆင့်',
    enrichMarketProductHeading: 'Kalodata ဈေးကွက်ဒေတာနှင့် ကုန်ပစ္စည်းအသေးစိတ်',
    enrichShopInfoHeading: 'ဆိုင်အချက်အလက်',
    enrichReviewInsightsHeading: 'ဝယ်သူ Review နှင့် လိုအပ်ချက် သုံးသပ်ချက်',
    enrichControlsHeading: 'မရှိသေးသော Kalodata ဒေတာများ ဖြည့်စွက်ရန်',
    enrichLayerProductDetail: 'Product Detail',
    enrichLayerShopDetail: 'Shop Detail',
    enrichLayerReviewInsights: 'Review Insights (ရွေးချယ်မှသာ)',
    enrichStatusPresent: 'ရှိပြီးသား',
    enrichStatusCached: 'Cache ရှိ · 0 cr',
    enrichStatusMissing: 'မရှိသေးပါ',
    enrichShopCacheSavedNote: 'Shop ID တူသော ကုန်ပစ္စည်းများအားလုံးအတွက် 1 ကြိမ်သာခေါ်ပြီး အလိုအလျောက် ပြန်သုံးပေးပါမည်။',
    enrichReviewOptInWarning: 'Review Insight API သည် ကုန်ပစ္စည်း 1 ခုလျှင် 1.0 cr ကုန်ကျသဖြင့် ကိုယ်တိုင်ရွေးချယ်အတည်ပြုမှသာ ခေါ်ဆိုပါမည်။',
    enrichApplyCacheBtn: 'သိမ်းထားပြီးသား Cache ဒေတာဖြည့်မည် (0 cr)',
    enrichStartBtn: 'ရွေးချယ်ထားသော ဒေတာဖြည့်မည်',
    enrichConfirmTitle: 'Kalodata ဒေတာဖြည့်စွက်မှုကို အတည်ပြုပါ',
    enrichConfirmDesc:
      'API မခေါ်ဆိုရသေးပါ။ Kalodata API မခေါ်မီ အောက်ပါ API အကြိမ်ရေနှင့် ခန့်မှန်း Credit ကုန်ကျစရိတ်ကို စစ်ဆေးအတည်ပြုပါ။',
    enrichConfirmProceedBtn: 'အတည်ပြုပြီး ဒေတာဖြည့်မည်',
    enrichConfirmCancelBtn: 'မလုပ်တော့ပါ',
    enrichRunningLabel: 'မရှိသေးသော Kalodata ဒေတာများကို ရယူနေပါသည်...',
    enrichSpendingLimitBlocked:
      'ခန့်မှန်းကုန်ကျစရိတ်သည် သုံးစွဲမှုကန့်သတ်ချက်ထက် ကျော်လွန်နေပါသည်။ ကုန်ကျစရိတ်မြင့်သောအပိုင်းကို ဖြုတ်ပါ သို့မဟုတ် သုံးစွဲမှုကန့်သတ်ချက် တိုးမြှင့်ပါ။',
    enrichAllDoneNotice:
      'ဤကုန်ပစ္စည်းအတွက် Kalodata ဒေတာအားလုံး (Product Detail၊ Shop Detail နှင့် Review Insights) ပြည့်စုံစွာ ရှိပြီးဖြစ်၍ API ထပ်ခေါ်ရန် မလိုပါ။',
    enrichNoKalodataIdNotice:
      'ဤကုန်ပစ္စည်းမှတ်တမ်းတွင် Kalodata Product ID မပါဝင်သဖြင့် Kalodata API ဖြင့် ဖြည့်စွက်၍ မရနိုင်ပါ။',
    enrichReviewLikes: 'ဝယ်သူများ နှစ်သက်သည့်အချက်များ',
    enrichReviewDislikes: 'မကြိုက်သည့်အချက်များ',
    enrichReviewComplaints: 'အဖြစ်များသော စောဒကများ',
    enrichReviewQualityCautions: 'ကုန်ပစ္စည်း အရည်အသွေး သတိပြုရန်အချက်များ',
    enrichReviewBuyerNeeds: 'ဝယ်သူလိုအပ်ချက်နှင့် အသုံးပြုပုံများ',
    enrichReviewUnavailableNote:
      'မရရှိနိုင်ပါ — ဝယ်သူ Review သုံးသပ်ချက် မရယူရသေးပါ။ တကယ့် Kalodata Review အချက်အလက်များ ကြည့်လိုပါက အထက်တွင် "Review Insights (1.0 cr)" ကို ရွေးချယ်အတည်ပြုပါ (မရှိသော Review ကို မဖန်တီးပါ)။',
    enrichShopUnavailableNote:
      'မရရှိနိုင်ပါ — ဆိုင် GMV၊ Brand/Retailer အမျိုးအစားနှင့် ဆိုင် Creator အရေအတွက် မရယူရသေးပါ။ Shop ID 1 ခုလျှင် 1 ကြိမ်သာခေါ်ရန် "Shop Detail (0.1 cr)" ကို ရွေးချယ်ပါ။',
    enrichDedupSavedLabel: 'ကြိမ် ထပ်မခေါ်ဘဲ Cache မှ သက်သာခဲ့သည်',
    // Phase 5: Product Results, Ranking, Filtering, Comparison, Decisions & Export
    sortFieldLabels: {
      overallScore: 'စုစုပေါင်းအမှတ်',
      salesPerformance: 'ရောင်းအား',
      revenuePerformance: 'ဝင်ငွေ',
      revenueGrowth: 'တိုးတက်နှုန်း',
      commissionPotential: 'ကော်မရှင်',
      competition: 'ပြိုင်ဆိုင်မှု',
      aiContentSuitability: 'AI Content',
      dataConfidence: 'ဒေတာယုံကြည်မှု',
    },
    sortDirHighest: 'အမြင့်ဆုံးမှ',
    sortDirLowest: 'အနိမ့်ဆုံးမှ',
    decisionVerdictLabels: {
      recommended: 'ရွေးချယ်သင့်',
      'worth-testing': 'စမ်းသပ်သင့်',
      'need-more-data': 'ဒေတာထပ်လို',
      'not-recommended': 'မရွေးသင့်',
    },
    decisionSummaryHeading: 'နောက်ဆုံးဆုံးဖြတ်ချက်',
    decisionCautionsLabel: 'သတိပြုရန်အချက်များ',
    bestSelectionHeading: 'အကောင်းဆုံး ကုန်ပစ္စည်း ရွေးချယ်မှု',
    bestSelectionSubtitle:
      'လက်ရှိရလဒ်များထဲမှ အတည်ပြုဒေတာများအပေါ် အခြေခံရွေးချယ်ထားသည်။ ဒေတာမလုံလောက်ပါက အကောင်းဆုံးဟု အတင်းမသတ်မှတ်ပါ။',
    bestSelectionShow: 'အကောင်းဆုံးရွေးချယ်မှု ပြရန်',
    bestSelectionHide: 'ဝှက်ထားရန်',
    bestSelectionCategories: {
      bestOverall: 'အကောင်းဆုံး',
      bestSalesPotential: 'ရောင်းအားအကောင်းဆုံး',
      bestCommissionPotential: 'ကော်မရှင်အကောင်းဆုံး',
      lowestCompetition: 'ပြိုင်ဆိုင်မှုအနည်းဆုံး',
      bestAiContentPotential: 'AI Content အကောင်းဆုံး',
      highestDataConfidence: 'ဒေတာအပြည့်စုံဆုံး',
    },
    bestAwardShortLabels: {
      bestOverall: 'အကောင်းဆုံး',
      bestSalesPotential: 'ရောင်းအား',
      bestCommissionPotential: 'ကော်မရှင်',
      lowestCompetition: 'ပြိုင်ဆိုင်မှုနည်း',
      bestAiContentPotential: 'AI Content',
      highestDataConfidence: 'ဒေတာယုံကြည်မှု',
    },
    bestStatOverallScore: 'စုစုပေါင်းအမှတ်',
    bestStatSales: 'ရောင်းအားနှင့် ဝင်ငွေ',
    bestStatCompetition: 'ပြိုင်ဆိုင်မှု',
    bestStatAiContent: 'AI Content အမှတ်',
    bestStatDataConfidence: 'ဒေတာယုံကြည်မှု',
    bestSoldUnit: 'ခုရောင်း',
    bestCreatorsUnit: 'ဦး',
    bestVerifiedUnit: 'ချက်အတည်ပြုပြီး',
    bestOtherCategoryWinners: 'အခြားကဏ္ဍအလိုက် ထူးချွန်ပစ္စည်းများ',
    bestInsufficientBadge: 'အချက်အလက် မပြည့်စုံပါ',
    filtersToggleBtn: 'စစ်ထုတ်ရန်',
    filtersClearAllBtn: 'စစ်ထုတ်မှု အားလုံးဖျက်မည်',
    filtersAllOption: 'အားလုံး',
    filterScoreRangeLabel: 'အမှတ်အပိုင်းအခြား',
    filterScore80Plus: '80+ (အမြင့်)',
    filterScore65To79: '65–79 (အလယ်အလတ်)',
    filterScoreUnder65: '65 အောက်',
    filterDecisionLabel: 'ဆုံးဖြတ်ချက် အဆင့်',
    filterConfidenceLabel: 'ဒေတာယုံကြည်မှု',
    filterCompetitionLabel: 'ပြိုင်ဆိုင်မှုအဆင့်',
    filterSalesLabel: 'ရောင်းအားအခြေအနေ',
    filterCommissionLabel: 'ကော်မရှင်အလားအလာ',
    filterCategoryLabel: 'ကုန်ပစ္စည်း အမျိုးအစား',
    filterModeLabel: 'ရှာဖွေမှု Mode',
    filterAiSuitabilityLabel: 'AI Content သင့်တော်မှု',
    filterPerfStrong: 'အားကောင်း (70+)',
    filterPerfModerate: 'အသင့်အတင့် (45–69)',
    filterPerfLow: 'အားနည်း (<45)',
    filterPerfUnavailable: 'မရရှိနိုင်ပါ',
    exportCsvBtn: 'CSV ထုတ်မည်',
    exportJsonBtn: 'JSON ထုတ်မည်',
    compareSelectBtn: 'နှိုင်းယှဉ်မည်',
    compareSelectedBtn: 'ရွေးထားပြီး',
    compareBarTitle: 'နှိုင်းယှဉ်ရန် ရွေးထားသော ကုန်ပစ္စည်းများ',
    compareOpenBtn: 'နှိုင်းယှဉ်ကြည့်မည်',
    compareClearBtn: 'ရှင်းလင်းမည်',
    compareModalTitle: 'ကုန်ပစ္စည်းများ နှိုင်းယှဉ်ချက်',
    compareModalSubtitle:
      'Kalodata တကယ့်ဒေတာများနှင့် သုံးသပ်ချက်များကို ယှဉ်ကြည့်နိုင်ပါသည်။ မရှိသောဒေတာကို 0 ဟု မပြဘဲ မရရှိနိုင်ပါ ဟုသာ ပြထားပါသည်။',
    compareDistinctIdsNote: 'Product ID မတူညီသော ပစ္စည်းများကို သီးခြားခွဲပြထားပြီး ကွဲပြားသောအချက်များကို အမှတ်အသားပြထားပါသည်။',
    compareDiffTag: 'ကွဲပြားသည်',
    compareAddSavedLabel: 'သိမ်းထားသော ကုန်ပစ္စည်း ထပ်ပေါင်းနှိုင်းယှဉ်ရန်',
    compareAddSavedPlaceholder: 'သိမ်းထားသော ကုန်ပစ္စည်း ရွေးပါ...',
    compareRemoveBtn: 'ဖယ်ရှားမည်',
    compareNeedTwoNote: 'နှိုင်းယှဉ်ကြည့်ရန် ရလဒ်များ၊ သိမ်းထားသောစာရင်း သို့မဟုတ် မှတ်တမ်းမှ ကုန်ပစ္စည်း အနည်းဆုံး 2 ခု ရွေးချယ်ပါ။',
    compareSourceResults: 'လက်ရှိရလဒ်',
    compareSourceSaved: 'သိမ်းထားသော',
    compareSourceHistory: 'မှတ်တမ်း',
    reportTabMarketData: 'Kalodata ဒေတာ',
    reportTabDecision: 'ဆုံးဖြတ်ချက်',
    reportTabStrengths: 'အားသာချက်/စိုးရိမ်ချက်',
    reportKalodataTag: 'Kalodata တကယ့်ဒေတာ',
    reportAiTag: 'AI သုံးသပ်ချက် (Kalodata ဒေတာနှင့် သီးခြားခွဲပြထားသည်)',
    reportLastUpdatedLabel: 'နောက်ဆုံးအပ်ဒိတ်',
    reportExportCsv: 'CSV',
    reportExportJson: 'JSON',
    drawerWhyScoreHeading: 'ဒီအမှတ်ရရခြင်း အကြောင်းရင်း',
    drawerDetailsAccordion: 'အသေးစိတ်ရှင်းလင်းချက်',
    drawerShowLess: 'လျှော့ပြမည်',
    drawerMoreUnit: 'ခုထပ်ကြည့်',
    drawerNoData: 'ဒေတာမရှိ',
    drawerPerSaleUnit: '/ 1 ခု',
    drawerMoreActions: 'အခြားလုပ်ဆောင်ချက်များ',
    drawerOpenTikTokShop: 'TikTok Shop တွင် တိုက်ရိုက်ကြည့်ရန်',
    drawerCopyTikTokLink: 'လင့်ခ်ကူး',
    drawerCopiedLink: 'ကူးပြီး',
    drawerTikTokLinkAria: 'TikTok Shop လင့်ခ်ကူးယူရန်',
    cardSalesLabel: 'ရောင်းအား',
    historyVerdictBarLabel: 'ဆုံးဖြတ်ချက်ခွဲခြမ်းစိတ်ဖြာမှု',
    historyRecordIdLabel: 'မှတ်တမ်း ID',
    // Phase 8: Universal Product Category Support & Subcategory Sync
    selectAllVerifiedAction: 'ပံ့ပိုးထားသမျှအားလုံးရွေးမည်',
    clearAllCategoriesAction: 'အားလုံးဖြုတ်မည်',
    showAllCategoriesToggle: 'မရနိုင်သေးသော အမျိုးအစားကြည့်ရန်',
    showUnsupportedCategoriesToggle: 'မပံ့ပိုးသော အမျိုးအစားကြည့်ရန်',
    showPendingSyncCategoriesToggle: 'Sync လိုသော အမျိုးအစားကြည့်ရန်',
    hideExtraCategoriesToggle: 'ပံ့ပိုးထားသမျှသာပြရန်',
    selectedCategoriesCountLabel: 'ခု ရွေးထား',
    multiCategoryModeLabel: 'အမျိုးအစားများစွာ ရှာဖွေမှုပုံစံ',
    multiCategoryCombinedDesc: 'ရွေးထားသော Category ID အားလုံးကို တစ်ခါတည်းပေါင်းရှာသည် — Credit အသက်သာဆုံး',
    multiCategorySplitDesc: 'အမျိုးအစားတစ်ခုချင်းစီကို ခွဲရှာပေးသည် — အမျိုးအစားအလိုက် မျှတစွာရရှိ',
    categoryStatusLabels: {
      verified: 'အတည်ပြုပြီး',
      'docs-verified': 'အတည်ပြုပြီး',
      synced: 'ချိတ်ဆက်ပြီး',
      'requires-sync': 'Sync လိုအပ်',
      unsupported: 'မပံ့ပိုးပါ',
    },
    syncCategoriesBtn: 'TH Categories Sync (0.1 cr)',
    syncCategoriesRunning: 'Kalodata TH Categories ကို Sync လုပ်နေပါသည်...',
    syncCategoriesConfirmTitle: 'Kalodata မှ တရားဝင် ထိုင်း Category ID များကို Sync လုပ်မလား?',
    syncCategoriesConfirmDesc:
      'Kalodata Category Rank API (L1, TH, 1 call = 0.1 cr) ကို ခေါ်ဆိုပြီး Electronics, Kitchen, Health, Food, Baby, Sports, Automotive, Pets, Toys, Books နှင့် Jewelry တို့၏ တရားဝင် ID များကို ချိတ်ဆက်ပေးပါမည်။ API တွင် မပါသော အမျိုးအစားများကို မခန့်မှန်းဘဲ မပံ့ပိုးပါ ဟု ရိုးသားစွာ ပြပါမည်။',
    syncCategoriesConfirmProceed: 'အတည်ပြုပြီး Sync လုပ်မည် (0.1 cr)',
    syncCategoriesSyncedNote: 'TH Categories Sync လုပ်ပြီး',
    syncCategoriesEmptyHint:
      'ကျန်အမျိုးအစားများကို အသုံးပြုရန် Kalodata TH Category Sync (0.1 cr) 1 ကြိမ် လုပ်ဆောင်ရန် လိုအပ်ပါသည် — မသေချာသော ID များကို ခန့်မှန်းမထည့်ပါ။',
    syncCategoriesEmptyResultError:
      'Kalodata မှ အမျိုးအစားစာရင်း 0 ခုသာ ပြန်ရသဖြင့် ယခင်အခြေအနေများကို မပြောင်းလဲဘဲ ထိန်းသိမ်းထားပါသည်။',
    subcategorySectionLabel: 'အမျိုးအစားခွဲများ (L2 စစ်ထုတ်မှု)',
    subcategoryLoadBtn: 'အမျိုးအစားခွဲ ဖတ်မည် (0.1 cr)',
    subcategoryLoadConfirmTitle: 'Kalodata မှ တရားဝင် L2 အမျိုးအစားခွဲများကို ဖတ်ယူမလား?',
    subcategoryLoadConfirmDesc:
      'ရွေးချယ်ထားသော အမျိုးအစားများအတွက် Kalodata Category Rank API (L2, TH, 1 call = 0.1 cr) ကို ခေါ်ဆိုပြီး ဤ Browser တွင် Cache သိမ်းထားပေးပါမည်။',
    subcategoryClearBtn: 'အမျိုးအစားခွဲ ဖြုတ်မည်',
    subcategorySelectedHint: 'ရွေးထားသော L2 Subcategory ID များဖြင့် Kalodata Product Rank ကို တိကျစွာ ရှာဖွေပေးပါမည်။',
    subcategoryEmptyHint:
      'ရွေးထားသော အမျိုးအစားများ၏ L2 အမျိုးအစားခွဲများကို ဖတ်ယူရန် (0.1 cr, Browser တွင် သိမ်းထားမည်) အပေါ်ခလုတ်ကို နှိပ်ပါ။',
    aiAdFormatLabels: {
      'ai-virtual-female-model': 'AI Virtual Female Model — AI Content သင့်တော်မှု',
      'product-only-3d-commercial': 'Product-Only 3D Commercial — AI Content သင့်တော်မှု',
      'tech-feature-demo': 'Tech Feature နှင့် Spec စမ်းသပ်ပြ Demo — AI Content သင့်တော်မှု',
      'home-problem-solution-demo': 'အိမ်သုံး/မီးဖိုချောင် ပြဿနာဖြေရှင်းပြ Demo — AI Content သင့်တော်မှု',
      'lifestyle-usage-demo': 'နေ့စဉ်လက်တွေ့အသုံးပြုပုံနှင့် Unboxing — AI Content သင့်တော်မှု',
      'consumable-trust-demo': 'စားသောက်/ကျန်းမာရေး ယုံကြည်စိတ်ချရမှု Demo — AI Content သင့်တော်မှု',
    },
    aiCategoryUnverifiedTitle: 'အမျိုးအစား ကိုက်ညီမှု အတည်မပြုနိုင်ပါ',
    aiAffiliateStrategyHeading: 'Affiliate နည်းဗျူဟာ',
    navCategories: 'အမျိုးအစားများ',
    // Phase 9: Myanmar Video-First Discovery (Thailand TikTok Shop Only)
    myanmarFilterLabel: 'မြန်မာ Video ပါ ကုန်ပစ္စည်း ရှာဖွေမှု',
    myanmarFilterSubLabel: 'TH TikTok Shop · Video-First (Video 100 လျှင် 0.1 cr)',
    myanmarFilterOff: 'OFF',
    myanmarFilterOn: 'ON',
    myanmarFilterPopoverTitle: 'မြန်မာ Video-First ရှာဖွေမှု (TH TikTok Shop)',
    myanmarFilterPopoverDesc:
      'Kalodata Video Rank API (Video 100 လျှင် 0.1 cr) ဖြင့် ထိုင်း TikTok Shop ဗီဒီယိုများကို Page အလိုက် ရှာဖွေပြီး မြန်မာစာ (Unicode / Zawgyi / ထိုင်း+မြန်မာ ရောနှော သို့မဟုတ် မြန်မာ Hashtag) ပါဝင်သော ဗီဒီယိုများနှင့် ချိတ်ဆက်ထားသည့် Affiliate ကုန်ပစ္စည်း (commission > 0) များကို သင်တောင်းဆိုသော အရေအတွက် (ဥပမာ 20 ခု) ပြည့်သည်အထိ စုဆောင်းပေးပါသည်။ ထို့နောက် Product Detail (0.1 cr · Cache = 0 cr) ဖြင့် ဒေတာအတည်ပြုပြီး SiamPick ၏ 7 ချက် 100 မှတ် စနစ်အတိုင်း (အမှတ်အပိုမပေါင်းဘဲ) Ranking ပြန်စီပေးပါသည်။ မရှိသော ကုန်ပစ္စည်းကို အတုအယောင် ဖြည့်မပြပါ။',
    myanmarFilterActiveBadge: 'မြန်မာ Video-First: ON (TH Shop)',
    myanmarReviewScanLimitLabel: 'Review စစ်ဆေးမည့် ကုန်ပစ္စည်း အရေအတွက်',
    myanmarReviewScanLimitHint:
      'Cache မရှိသေးသော ထိုင်း ကုန်ပစ္စည်းများအတွက် Buyer Review API ခေါ်ဆိုမည့် အများဆုံးအရေအတွက် (ကုန်ပစ္စည်း 1 ခုလျှင် 1.0 cr · Cache ရှိပြီးသား 0 cr)။ ဤကန့်သတ်ချက်ထက် ကျော်လွန်သော ကုန်ပစ္စည်းများကို မစစ်ဆေးကြောင်း ရိုးသားစွာ ဖော်ပြပါသည်။',
    myanmarVideoScanPagesLabel: 'Video ရှာဖွေမည့် Page အရေအတွက် (1 Page = Video 100)',
    myanmarVideoScanPagesHint:
      'သင်တောင်းဆိုသော ကုန်ပစ္စည်းအရေအတွက် (ဥပမာ 20 ခု) ပြည့်သည်အထိ Kalodata Video Rank မှ ရှာဖွေမည့် အများဆုံး Page အရေအတွက် (1 Page = Video 100 = 0.1 cr)။ အရေအတွက်ပြည့်သည်နှင့် ချက်ချင်းရပ်ပြီး Credit ချွေတာပေးပါသည်။',
    myanmarVideoDiscoveryBarTitle: 'မြန်မာ Video-First ရှာဖွေမှု အကျဉ်းချုပ် (ထိုင်း TikTok Shop)',
    myanmarVideoStatPagesScanned: 'စစ်ခဲ့သည့် Page',
    myanmarVideoStatVideosScanned: 'စစ်ခဲ့သည့် TH Video',
    myanmarVideoStatMatchedVideos: 'မြန်မာ Video တွေ့ရှိ',
    myanmarVideoStatCollectedProducts: 'Affiliate ကုန်ပစ္စည်း ရရှိ',
    myanmarVideoStatSkippedNonAff: 'ကျော်ခဲ့ (Non-Aff)',
    myanmarVideoStopReasonLabels: {
      'target-reached': 'အရေအတွက် ပြည့်မီပြီး',
      'max-pages-reached': 'သတ်မှတ် Page ပြည့်ပြီး',
      'source-exhausted': 'Kalodata Video ကုန်ပြီး',
      'budget-capped': 'သုံးစွဲမှုကန့်သတ်ချက် ပြည့်ပြီး',
    },
    myanmarVideoShortfallNotice:
      'သတ်မှတ်ထားသော Scan Page / Budget အတွင်း တကယ့် မြန်မာ Video ပါ Affiliate ကုန်ပစ္စည်းအရေအတွက်သည် တောင်းဆိုထားသည်ထက် နည်းနေသောကြောင့် အတည်ပြုပြီး ကုန်ပစ္စည်းအစစ်များကိုသာ အတုအယောင်မဖြည့်ဘဲ ရိုးသားစွာ ပြသထားပါသည်။ ထပ်ရှာလိုပါက Video Scan Depth (Page) ကို တိုးမြှင့်နိုင်ပါသည်။',
    myanmarVideoCardLabel: 'မြန်မာ Video ကိုက်ညီ',
    myanmarVideosMatchedLabel: 'မြန်မာ Video',
    myanmarVideoEvidenceHeading: 'အတည်ပြုထားသော မြန်မာ TikTok Video များ',
    myanmarVideoOpenLinkLabel: 'Video ကြည့်မည်',
    myanmarReviewStatusLabels: {
      matched: 'မြန်မာ Review တွေ့ရှိသည်',
      'checked-no-match': 'မြန်မာ Review မတွေ့',
      'review-unavailable': 'Review မရရှိနိုင်ပါ',
    },
    myanmarMixedThaiBurmeseTag: 'ထိုင်း+မြန်မာ ရောနှော',
    myanmarReviewsMatchedLabel: 'မြန်မာ Review',
    myanmarReviewsCheckedLabel: 'Review စစ်ဆေးပြီး',
    myanmarSkippedShortLabel: 'စာတိုလွန်း၍ ကျော်',
    myanmarDiscoveryBarTitle: 'မြန်မာ Review စစ်ဆေးမှု အကျဉ်းချုပ် (ထိုင်း TikTok Shop)',
    myanmarDiscoveryPartialNotice:
      'အကုန်လုံးမစစ်ဆေးရသေးပါ — သတ်မှတ်ထားသော Review စစ်ဆေးမှုကန့်သတ်ချက်ကြောင့် တွေ့ရှိသည့် ထိုင်းကုန်ပစ္စည်းအချို့ကိုသာ Review စစ်ဆေးထားပါသည်။',
    myanmarStatCandidatesFound: 'တွေ့ရှိ ထိုင်းကုန်ပစ္စည်း',
    myanmarStatCheckedReviews: 'Review စစ်ဆေးပြီး',
    myanmarStatReviewsAvailable: 'Review ရရှိ',
    myanmarStatReviewUnavailable: 'Review မရရှိနိုင်',
    myanmarStatNoMyanmarReview: 'မြန်မာ Review မပါ',
    myanmarStatMatchedProducts: 'ကိုက်ညီ (≥1 Review)',
    myanmarStatReviewsInspected: 'စစ်ဆေးခဲ့သည့် Review',
    myanmarSignalCardLabel: 'မြန်မာ Review ကိုက်ညီ',
    myanmarSignalSectionHeading: 'မြန်မာဘာသာ အထောက်အထားနှင့် အခြေအနေ',
    myanmarSignalSectionSubtitle:
      'Kalodata မှ ရရှိသော ထိုင်း TikTok Shop တကယ့် Video သို့မဟုတ် ဝယ်သူ Review များကိုသာ စစ်ဆေးထားပါသည်။ API မှ မရရှိသော အချက်အလက်များကို မရရှိနိုင်ပါ ဟု ရိုးသားစွာ ဖော်ပြထားပါသည်။',
    myanmarConfidenceLabels: {
      High: 'မြင့်',
      Medium: 'အလယ်',
      Low: 'နည်း',
      None: 'မရှိ',
    },
    myanmarSourceLabels: {
      title: 'ကုန်ပစ္စည်းခေါင်းစဉ်',
      description: 'ကုန်ပစ္စည်းအသေးစိတ်',
      reviews: 'ဝယ်သူ Review အနှစ်ချုပ်',
      comments: 'ဝယ်သူ Review မူရင်းများ',
      videoContent: 'TikTok Video / Creator စာသား',
    },
    myanmarAvailabilityLabels: {
      matched: 'တွေ့ရှိသည်',
      'checked-no-match': 'မတွေ့ရှိ',
      unavailable: 'မရရှိနိုင်ပါ',
    },
    myanmarMatchTypeLabels: {
      'myanmar-script': 'မြန်မာစာ (Unicode)',
      'zawgyi-script': 'မြန်မာစာ (Zawgyi)',
      'burmese-romanized-term': 'မြန်မာ Tag / အသုံးအနှုန်း',
    },
    myanmarEvidenceHeading: 'အတည်ပြုထားသော မြန်မာ Review များ',
    myanmarNoEvidenceNote:
      'ဤကုန်ပစ္စည်း၏ ရရှိနိုင်သော ဒေတာများတွင် အတည်ပြုနိုင်သည့် မြန်မာဘာသာစကား အထောက်အထား မတွေ့ရှိပါ။',
    myanmarSourcesHeading: 'ဒေတာအရင်းအမြစ် ရရှိနိုင်မှု',
    myanmarEmptyTitle: 'မြန်မာ Video ပါဝင်သော ထိုင်း Affiliate ကုန်ပစ္စည်း မတွေ့ရှိပါ',
    myanmarEmptyDesc:
      'ရွေးချယ်ထားသော ထိုင်း TikTok Shop အမျိုးအစားများအတွင်း စစ်ဆေးခဲ့သည့် ဗီဒီယိုများတွင် မြန်မာဘာသာစကား ပါဝင်ပြီး Affiliate ကော်မရှင် (> 0%) ရှိသော ကုန်ပစ္စည်း မတွေ့ရှိပါ။ အတုအယောင်ရလဒ်များ မဖန်တီးထားပါ။',
    myanmarEmptyScannedPrefix: 'စစ်ဆေးခဲ့သော ထိုင်း Video / ကုန်ပစ္စည်း:',
    myanmarTurnOffFilterBtn: 'မြန်မာစစ်ထုတ်မှု ပိတ်ပြီး ပြန်ချိန်ညှိမည်',
    filterMyanmarSignalLabel: 'မြန်မာ ကိုက်ညီမှု',
    filterMyanmarSignalOnlyOption: 'မြန်မာ Video / Review အတည်ပြုပြီး ကုန်ပစ္စည်းများသာ',
    linkImportHeading: 'TikTok Shop ကုန်ပစ္စည်းလင့်ခ် ထည့်သွင်း၍ စစ်ဆေးမည်',
    linkImportSubtitle:
      'ထိုင်း TikTok Shop ကုန်ပစ္စည်းလင့်ခ်၊ Short Link (vt.tiktok.com)၊ Redirect Link သို့မဟုတ် Share စာသားကို Paste လုပ်ပါ။ လင့်ခ်စစ်ဆေးခြင်းသည် Kalodata Credit (0 cr) မကုန်ကျပါ။ Cache မရှိသေးမှသာ အတည်ပြုပြီး ထည့်သွင်းနိုင်ပါမည်။',
    linkImportInputPlaceholder:
      'ကုန်ပစ္စည်းလင့်ခ် သို့မဟုတ် Share စာသားထည့်ပါ (ဥပမာ https://vt.tiktok.com/... သို့မဟုတ် https://shop.tiktok.com/th/pdp/...)',
    linkImportPasteBtn: 'ကူးထည့်',
    linkImportClearBtn: 'ရှင်းမည်',
    linkImportCheckBtn: 'လင့်ခ်စစ်ဆေးမည် (0 cr)',
    linkImportCheckingLabel: 'လင့်ခ်ကို စစ်ဆေးနေပါသည်...',
    linkImportImportingLabel: 'Kalodata မှ ကုန်ပစ္စည်းဒေတာ ရယူနေပါသည်...',
    linkImportSupportedFormatsNote:
      'TH PDP Link တိုက်ရိုက်၊ vt.tiktok.com / vm.tiktok.com / tiktok.com/t/ Short Link၊ Redirect Link နှင့် Mobile Share စာသားများကို ပံ့ပိုးပါသည်။',
    linkImportInvalidTitle: 'လင့်ခ်ပုံစံ မမှန်ကန်ပါ (သို့) ပိတ်ပင်ထားသည်',
    linkImportUnsupportedTitle: 'ပံ့ပိုးမထားသော လင့်ခ်',
    linkImportNotFoundTitle: 'ကုန်ပစ္စည်း ရှာမတွေ့ပါ',
    linkImportReadyTitle: 'ထိုင်း TikTok Shop ကုန်ပစ္စည်းကို ခွဲခြားတွေ့ရှိပါသည်',
    linkImportProductIdLabel: 'Product ID',
    linkImportResolvedUrlLabel: 'နောက်ဆုံးရရှိသော URL',
    linkImportCanonicalUrlLabel: 'တရားဝင် TH PDP လင့်ခ်',
    linkImportRedirectChainLabel: 'Redirect လမ်းကြောင်း',
    linkImportCostZeroLabel: '0 cr (Cache မှ)',
    linkImportCostPaidLabel: '0.1 cr (Product Detail)',
    linkImportCacheNotice: 'ဤကုန်ပစ္စည်းဒေတာသည် Cache ထဲတွင် အသင့်ရှိနေပြီး API ထပ်မခေါ်ဘဲ (0 cr) ထည့်သွင်းနိုင်ပါသည်။',
    linkImportDuplicateTitle: 'ရှိပြီးသား ကုန်ပစ္စည်း ဖြစ်ပါသည်',
    linkImportDuplicateDesc:
      'ဤ Product ID သည် လင့်ခ်မတူသော်လည်း သင့်စာရင်းထဲတွင် ရှိပြီးသားဖြစ်ပါသည်။ ထပ်မဖြစ်စေဘဲ Kalodata API ထပ်မခေါ်တော့ပါ။',
    linkImportDuplicateSourceResults: 'လက်ရှိရလဒ်များ',
    linkImportDuplicateSourceSaved: 'သိမ်းထားသောစာရင်း',
    linkImportDuplicateSourceHistory: 'ရှာဖွေမှုမှတ်တမ်း',
    linkImportViewExistingBtn: 'တစ်ခုချင်းရလဒ် ဖွင့်ကြည့်မည် (0 cr)',
    linkImportImportCachedBtn: 'Cache မှ ရှာဖွေမည် (0 cr)',
    linkImportConfirmPromptTitle: 'Kalodata Product Detail API ခေါ်ဆိုရန် အတည်ပြုပါ',
    linkImportConfirmPromptDesc:
      'ဤကုန်ပစ္စည်းသည် Cache ထဲတွင် မရှိသေးပါ။ ရှာဖွေပါက Kalodata Product Detail API 1 ကြိမ် (~0.1 cr) ခေါ်ဆိုမည်ဖြစ်ပြီး သုံးစွဲမှုကန့်သတ်ချက်နှင့် လက်ကျန် Credit ဖြင့် စစ်ဆေးပါမည်။',
    linkImportConfirmCheckboxLabel: 'ဤကုန်ပစ္စည်းကို ရှာဖွေရန် Kalodata Credit ~0.1 cr အသုံးပြုမည်ကို အတည်ပြုပါသည်။',
    linkImportConfirmExecuteBtn: 'အတည်ပြုပြီး ရှာဖွေမည် (0.1 cr)',
    linkImportRefreshCacheBtn: 'Kalodata မှ အသစ်ပြန်စစ်မည် (0.1 cr)',
    linkImportPausedBannerTitle: 'Kalodata API များ ယာယီရပ်နားထားသည်',
    linkImportBudgetRemainingLabel: 'ကျန်ရှိသော သုံးစွဲမှုကန့်သတ်ချက်',
    linkImportLimitExceededNote:
      'ဤ 0.1 cr ခေါ်ဆိုမှုအတွက် သုံးစွဲမှုကန့်သတ်ချက် မလုံလောက်ပါ။ အထက်ပါ ရှာဖွေမှုသတ်မှတ်ချက်များတွင် သုံးစွဲမှုကန့်သတ်ချက်ကို တိုးမြှင့်ပေးပါ။',
    linkImportBalanceLabel: 'လက်ကျန် Credit',
    linkImportStorageBlockedNote:
      'Persistent Budget Storage မရရှိနိုင်သေးသဖြင့် ကုန်ကျစရိတ်လုံခြုံရေးအတွက် Paid API ခေါ်ဆိုမှုကို ပိတ်ထားပါသည်။',
    linkImportSuccessTitle: 'တစ်ခုချင်းရှာဖွေပြီး တစ်ခုချင်းမှတ်တမ်းတွင် သိမ်းဆည်းပြီးပါပြီ',
    linkImportSuccessCachedDesc:
      'Cache မှ အောင်မြင်စွာ ရယူပြီးပါပြီ (0 cr)။ ပင်မစာမျက်နှာရှိ အစုလိုက်ရလဒ်များကို မပြောင်းလဲပါ။',
    linkImportSuccessPaidDesc:
      'Kalodata မှ တကယ့် ထိုင်း TikTok Shop ကုန်ပစ္စည်းဒေတာကို ရယူပြီး တစ်ခုချင်းမှတ်တမ်းထဲ သိမ်းဆည်းပြီးပါပြီ။ အစုလိုက်ရလဒ်များကို မထိခိုက်ပါ။',
    linkImportOpenReportBtn: 'အစီရင်ခံစာ ဖွင့်မည်',
    linkImportViewInSingleHistoryBtn: 'တစ်ခုချင်းမှတ်တမ်းတွင် ကြည့်မည်',
    linkImportClipboardUnavailableNote: 'Clipboard ဖတ်ခွင့် မရပါ — Box ထဲသို့ ကိုယ်တိုင် Paste လုပ်ပေးပါ။',
    linkImportDeepDiveBtn: 'Deep Dive ဝင်မည်',
    linkImportSaveBtn: 'သိမ်းမည်',
    linkImportSavedBtn: 'သိမ်းပြီး',
    linkImportSourceHeading: 'ဒေတာအရင်းအမြစ်နှင့် လင့်ခ်စစ်ဆေးမှု',
    linkImportVerificationHeading: 'အတည်ပြုမှု အခြေအနေ',
    linkImportUnavailableHeading: 'မရရှိနိုင်သော ဒေတာများ',
    linkImportNoUnavailableNote: 'အဓိက ဒေတာအားလုံးကို အတည်ပြုရရှိထားပါသည်။',
    linkImportOpenTikTokBtn: 'TikTok Shop တွင် ကြည့်မည်',
    linkImportShopLabel: 'ဆိုင်',
    linkImportPriceLabel: 'ဈေးနှုန်း',
    linkImportSalesLabel: 'ရောင်းအား',
    linkImportRevenueLabel: 'GMV',
    linkImportCommissionLabel: 'ကော်မရှင်',
    linkImportScoreLabel: 'အမှတ်',
    statusLegendTitle: 'ဒေတာအခြေအနေ သင်္ကေတများ',
    statusLegendTrigger: 'ဒေတာသင်္ကေတ ရှင်းလင်းချက်',
    statusLegendDescVerified: 'Kalodata တကယ့်ဒေတာမှ တိုက်ရိုက်အတည်ပြုပြီး',
    statusLegendDescEstimated: 'ရရှိထားသော အချက်အလက်များမှ ခန့်မှန်းတွက်ချက်ထားသည်',
    statusLegendDescUnverified: 'အချက်အလက်ရှိသော်လည်း တိုက်ရိုက်အတည်မပြုရသေး',
    statusLegendDescUnavailable: 'မူရင်းမှ မရရှိနိုင်သေးပါ — အတုအယောင်မဖြည့်ပါ',
    mobileNavLabel: 'မိုဘိုင်းလမ်းညွှန်',
    creditsLoadingLabel: 'လက်ကျန် Credit စစ်ဆေးနေသည်',
    factorShortLabels: {
      salesPerformance: 'ရောင်းအား',
      revenuePerformance: 'ဝင်ငွေ',
      revenueGrowth: 'ဝင်ငွေတိုးတက်မှု',
      commissionPotential: 'ကော်မရှင်',
      competition: 'ပြိုင်ဆိုင်မှု',
      marketDemand: 'ဈေးကွက်လိုအပ်ချက်',
      aiContentSuitability: 'AI Content',
    },
    bestLowestOfResults: 'ရလဒ် {n} ခုထဲ ပြိုင်ဆိုင်မှုအနည်းဆုံး',
    bestCompetitionStillHighNote: 'ခြုံငုံကြည့်လျှင် ပြိုင်ဆိုင်မှု မြင့်မားနေဆဲ',
    exportDropdownBtn: 'ထုတ်ယူရန်',
    periodLast7Day: '7 ရက်',
    periodLast30Day: '30 ရက်',
    deepDiveChipShortNames: {
      'product-intelligence': 'ထုတ်ကုန်',
      'sales-market-intelligence': 'ရောင်းအား',
      'affiliate-profit-analysis': 'အမြတ်',
      'creator-competition-analysis': 'ပြိုင်ဆိုင်မှု',
      'video-intelligence': 'ဗီဒီယို',
      'customer-review-intelligence': 'သုံးသပ်ချက်',
      'market-competitor-comparison': 'နှိုင်းယှဉ်',
      'ai-strategic-recommendation': 'AI ဗျူဟာ',
      'ad-video-creative-blueprint': 'AI Content',
    },
    deepDiveAriaRunning: 'အပိုင်း {nums} လုပ်ဆောင်နေသည်...',
    deepDiveAriaFinished: 'အပိုင်း {nums} ပြီးစီးပြီး {time}',
    deepDiveAriaFailed: 'အပိုင်း {nums} မအောင်မြင်ပါ {time}',
    compareBestInMetrics: 'အချက် {total} ခုအနက် {n} ခု အကောင်းဆုံး',
    compareBestBadge: 'အကောင်းဆုံး',
    compareRowOverallScore: 'စုစုပေါင်းအမှတ်',
    compareRowVerdict: 'ဆုံးဖြတ်ချက်',
    compareRowPrice: 'ဈေးနှုန်း',
    compareRowCommission: 'ကော်မရှင်',
    compareRowSales: 'ရောင်းအား',
    compareRowRevenue: 'ဝင်ငွေ',
    compareRowCompetition: 'ပြိုင်ဆိုင်မှု',
    compareRowAiContent: 'AI Content',
    compareRowConfidence: 'ဒေတာယုံကြည်စိတ်ချရမှု',
    compareClosePickMoreBtn: 'ကုန်ပစ္စည်း ရွေးချယ်မည်',
    compareImprovedChip: 'တိုးတက်',
    compareDeclinedChip: 'ကျဆင်း',
    compareUnchangedChip: 'မပြောင်းလဲ',
    comparePeriodApartLabel: 'ရှာဖွေမှု 2 ခုကြား ကွာဟချိန်',
    compareBeforeLabel: 'ယခင်',
    compareAfterLabel: 'ယခု',
    compareResetFilterBtn: 'အားလုံးပြမည်',
    compareSwapSessionsBtn: 'နောက်ဆုံး 2 ခု ရွေးမည်',
    savedVerdictAll: 'ဆုံးဖြတ်ချက်အားလုံး',
    savedResetFiltersBtn: 'စစ်ထုတ်မှု ရှင်းမည်',
    deepDiveHeadlineNotRun: 'မစစ်ဆေးရသေးပါ',
    deepDiveHeadlineError: 'မအောင်မြင်ပါ',
    deepDiveHeadlineReadyScript: 'Hook {hooks} ခု · Scene {scenes} ခု',
    launcherTabBatch: 'အစုလိုက် ရှာဖွေရန်',
    launcherTabSingle: 'Link တစ်ခုချင်း စစ်ရန်',
    launcherEditSettingsBtn: 'Settings ပြင်ရန်',
    launcherCollapseSettingsBtn: 'Settings ခေါက်သိမ်းရန်',
    launcherCheckLinkBtn: 'Link ဖြင့် စစ်ရန်',
    headerBalancePopoverTitle: 'Kalodata လက်ကျန်နှင့် တစ်နေ့တာ Limit',
    headerBalanceLiveLabel: 'Kalodata အကောင့် လက်ကျန်',
    headerBalanceRefreshBtn: 'ပြန်စစ်မည်',
    scoringRubricDetailsBtn: 'အချက် ၇ ချက် ကြည့်ရန်',
    singleRecentLabel: 'နောက်ဆုံးစစ်ထား',
    singleOpenRecentBtn: 'နောက်ဆုံးရလဒ် ကြည့်ရန်',
    singleEmptyBarHint: 'ထိုင်း TikTok Shop Link ထည့်ပြီး ကုန်ပစ္စည်းတစ်ခုချင်း စစ်ဆေးနိုင်ပါသည်။',
    singleCheckNewLinkBtn: 'Link အသစ်စစ်ရန်',
  },
};
