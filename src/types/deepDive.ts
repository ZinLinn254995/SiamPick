import type {
  AiRecommendationVerdict,
  DataStatus,
  ResearchMode,
  ResearchProduct,
} from './product';

/**
 * Phase 9.1 / 9.2: Independent Deep Dive analysis module identifiers.
 * Each option carries its own isolated identity so the execution engine can run,
 * re-run, and store results per module without mixing outputs.
 */
export type DeepDiveAnalysisId =
  | 'product-intelligence'
  | 'sales-market-intelligence'
  | 'affiliate-profit-analysis'
  | 'creator-competition-analysis'
  | 'video-intelligence'
  | 'customer-review-intelligence'
  | 'market-competitor-comparison'
  | 'ai-strategic-recommendation'
  | 'ad-video-creative-blueprint';

export type DeepDiveCostSensitivity = 'low' | 'moderate' | 'high';

export type DeepDiveExecutionStatus =
  | 'idle'
  | 'running'
  | 'completed'
  | 'error'
  | 'unavailable'
  | 'not-implemented'
  | 'queued';

export type DeepDiveOriginView = 'hunting' | 'saved' | 'history';

export interface DeepDiveAnalysisDefinition {
  id: DeepDiveAnalysisId;
  order: number;
  nameEn: string;
  nameMy: string;
  shortDescriptionEn: string;
  shortDescriptionMy: string;
  /** Progressive Disclosure Item 1: What this analysis does */
  whatItDoesEn: string;
  whatItDoesMy: string;
  /** Progressive Disclosure Item 2: Specific data points / signals checked */
  whatItChecksEn: readonly string[];
  whatItChecksMy: readonly string[];
  /** Progressive Disclosure Item 3: Expected practical outcome / result */
  expectedOutcomeEn: string;
  expectedOutcomeMy: string;
  /** Progressive Disclosure Item 4: Data sources / APIs that may be needed */
  requiredDataSourcesEn: string;
  requiredDataSourcesMy: string;
  /** Progressive Disclosure Item 5: Estimated cost & credit usage guidance */
  estimatedCostNoteEn: string;
  estimatedCostNoteMy: string;
  costSensitivity: DeepDiveCostSensitivity;
  /** Progressive Disclosure Item 6: Honest missing / unavailable data behavior */
  missingDataBehaviorEn: string;
  missingDataBehaviorMy: string;
}

export interface DeepDiveMetricRow {
  key: string;
  labelEn: string;
  labelMy: string;
  valueEn: string;
  valueMy: string;
  status: DataStatus;
  detailEn?: string;
  detailMy?: string;
}

export interface DeepDiveResultSection {
  id: string;
  titleEn: string;
  titleMy: string;
  status: DataStatus;
  bulletsEn: string[];
  bulletsMy: string[];
}

export interface DeepDiveCompetitorComparisonRow {
  canonicalProductId: string;
  name: string;
  nameMy: string;
  isTarget: boolean;
  priceThb: number | null;
  salesVolume: number | null;
  revenueThb: number | null;
  commissionRatePct: number | null;
  score: number;
  rankPosition: number;
}

export interface DeepDiveVideoItem {
  videoId: string;
  captionSnippet: string;
  creatorName: string | null;
  creatorHandle: string | null;
  videoUrl: string | null;
  revenueThb: number | null;
  salesVolume: number | null;
  views: number | null;
  publishDate: string | null;
  isMyanmarMatch: boolean;
  matchType?: string;
}

export interface DeepDiveModuleError {
  code: string;
  messageEn: string;
  messageMy: string;
}

export interface DeepDiveGeminiTokenUsage {
  promptTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  pricingStatus: 'unavailable';
  costNoteEn: string;
  costNoteMy: string;
}

export interface DeepDiveAiMeta {
  modelUsed: string | null;
  source: 'gemini';
  verdict: AiRecommendationVerdict;
  modulesSynthesized: DeepDiveAnalysisId[];
  tokenUsage?: DeepDiveGeminiTokenUsage | null;
}

export type DeepDiveVideoScriptLanguage = 'th-with-my' | 'my' | 'my-th-mix' | 'th-with-en';
export type DeepDiveVideoProductionStyle =
  | 'ugc-face'
  | 'faceless-hands'
  | 'ai-video'
  | 'unboxing-first-try'
  | 'voiceover-broll'
  | 'before-after-demo'
  | 'greenscreen-reaction';
export type DeepDiveVideoTargetDuration = '7-12s' | '15s' | '30s' | '45-60s' | '60-90s';
export type DeepDiveVideoTone =
  | 'friendly-bestie'
  | 'urgent-deal'
  | 'expert-honest'
  | 'funny-relatable'
  | 'luxury-aesthetic';
export type DeepDiveVideoFramework =
  | 'auto'
  | 'pas'
  | 'hook-demo-proof-cta'
  | 'storytelling'
  | 'objection-killer'
  | 'bundle-math';
export type DeepDiveVideoTargetAudience =
  | 'auto'
  | 'budget-hunters'
  | 'office-students'
  | 'moms-household'
  | 'beauty-selfcare'
  | 'myanmar-in-th';
export type DeepDiveVideoSellingFocus =
  | 'price-bundle'
  | 'reviews-proof'
  | 'fast-convenience'
  | 'quality-ingredients'
  | 'daily-gift';
export type DeepDiveVideoCtaStyle = 'soft-recommend' | 'urgent-basket' | 'comment-engagement';
export type DeepDiveAiVideoToolStyle =
  | 'general-9-16'
  | 'veo-kling-cinematic'
  | 'heygen-avatar'
  | 'image-to-video';

export interface DeepDiveVideoCreativeOptions {
  /** Default false (0 Kalodata cr). When true, fetches top-selling TH TikTok Shop videos via Kalodata video/rank (+0.1 cr, 24h cached). */
  includeCompetitorVideos: boolean;
  scriptLanguage: DeepDiveVideoScriptLanguage;
  videoStyle: DeepDiveVideoProductionStyle;
  duration: DeepDiveVideoTargetDuration;
  tone?: DeepDiveVideoTone;
  framework?: DeepDiveVideoFramework;
  targetAudience?: DeepDiveVideoTargetAudience;
  sellingFocuses?: DeepDiveVideoSellingFocus[];
  ctaStyle?: DeepDiveVideoCtaStyle;
  /** Only used when videoStyle === 'ai-video' to tailor English visual prompts for a specific AI video tool. */
  aiVideoTool?: DeepDiveAiVideoToolStyle;
  /** Optional free-text creative instructions written by the user in any language (up to 600 chars). */
  customSuggestion?: string;
  customKeyword?: string;
}

export interface DeepDiveCompetitorVideoSample {
  videoId: string;
  caption: string;
  hashtags: string[];
  creatorName: string | null;
  creatorHandle: string | null;
  videoUrl: string;
  revenueThb: number | null;
  salesVolume: number | null;
  views: number | null;
  durationSec: number | null;
  publishDate: string | null;
}

export interface DeepDiveVideoConcept {
  id: string;
  titleEn: string;
  titleMy: string;
  formatLabel: string;
  angleSummaryEn: string;
  angleSummaryMy: string;
  whyItConvertsEn: string;
  whyItConvertsMy: string;
}

export interface DeepDiveVideoHook {
  id: string;
  hookText: string;
  meaningMy: string;
  onScreenText?: string | null;
  visualActionEn: string;
  visualActionMy: string;
  hookType: string;
  aiVideoPromptEn?: string | null;
}

export interface DeepDiveScriptScene {
  sceneNumber: number;
  timeRange: string;
  phaseLabel: string;
  voiceover: string;
  voiceoverMy: string;
  onScreenText: string;
  shotDirectionEn: string;
  shotDirectionMy: string;
  aiVideoPromptEn?: string | null;
}

export interface DeepDiveVideoSeoTitle {
  style: 'search-seo' | 'curiosity-hook' | 'direct-sell';
  labelEn: string;
  labelMy: string;
  titleText: string;
  meaningMy: string;
}

export interface DeepDiveVideoSeoPack {
  titles: DeepDiveVideoSeoTitle[];
  searchKeywords: string[];
  hashtagsBroad: string[];
  hashtagsNiche: string[];
  hashtagsBuyerIntent: string[];
  captionTemplate: string;
}

export interface DeepDivePolicyGuardItem {
  riskyClaim: string;
  reasonEn: string;
  reasonMy: string;
  safeAlternative: string;
}

export interface DeepDiveVideoCreativeBlueprint {
  optionsUsed: DeepDiveVideoCreativeOptions;
  competitorScanStatus: 'scanned' | 'skipped-zero-credit' | 'no-videos-found';
  competitorKeywordUsed: string | null;
  competitorVideos: DeepDiveCompetitorVideoSample[];
  competitorTeardownSummaryEn: string;
  competitorTeardownSummaryMy: string;
  winningPatternsEn: string[];
  winningPatternsMy: string[];
  creativeGapEn: string;
  creativeGapMy: string;
  concepts: DeepDiveVideoConcept[];
  hooks: DeepDiveVideoHook[];
  scriptTitle: string;
  scriptScenes: DeepDiveScriptScene[];
  seoPack: DeepDiveVideoSeoPack;
  policyGuards: DeepDivePolicyGuardItem[];
  dataLimitationsEn: string[];
  dataLimitationsMy: string[];
  modelUsed: string;
  usedProductImage: boolean;
  modulesReferenced: DeepDiveAnalysisId[];
  generatedAt: string;
  tokenUsage?: DeepDiveGeminiTokenUsage | null;
}

/**
 * Isolated per-module structured output produced by Phase 9.2 Execution Engine.
 * Strictly separates verified market metrics from AI Strategic Interpretation & AI Creative Blueprints.
 */
export interface DeepDiveModuleResult {
  analysisId: DeepDiveAnalysisId;
  outcome: 'completed' | 'unavailable';
  dataStatus: DataStatus;
  /** Strictly true ONLY for AI interpretation/creative modules (#8 and #9); false for all market data modules (#1-#7) */
  isAiInterpretation: boolean;
  headlineEn: string;
  headlineMy: string;
  summaryEn: string;
  summaryMy: string;
  metrics: DeepDiveMetricRow[];
  sections: DeepDiveResultSection[];
  competitorRows?: DeepDiveCompetitorComparisonRow[];
  videoItems?: DeepDiveVideoItem[];
  videoCreative?: DeepDiveVideoCreativeBlueprint | null;
  unavailableNotesEn: string[];
  unavailableNotesMy: string[];
  dataSourcesEn: string[];
  dataSourcesMy: string[];
  apiCallsMade: number;
  aiApiCallsMade?: number;
  creditsUsed: number;
  reusedFromCache: boolean;
  completedAt: string;
  aiMeta?: DeepDiveAiMeta;
}

/**
 * Isolated per-analysis execution state slot.
 * Errors or results in one module never leak into or overwrite any other module.
 */
export interface DeepDiveAnalysisSlotState {
  analysisId: DeepDiveAnalysisId;
  status: DeepDiveExecutionStatus;
  updatedAt: string | null;
  result: DeepDiveModuleResult | null;
  error?: DeepDiveModuleError | null;
  statusNoteEn: string;
  statusNoteMy: string;
}

export interface DeepDiveRunCostSummary {
  runId: string;
  completedAt: string;
  analysisIds: DeepDiveAnalysisId[];
  estimatedKalodataCredits: number;
  actualKalodataCredits: number;
  estimatedKalodataUsd: number;
  actualKalodataUsd: number;
  plannedKalodataApiCalls: number;
  actualKalodataApiCalls: number;
  cacheOrLocalReuseCount: number;
  deduplicatedSharedCallsCount: number;
  plannedGeminiCalls: number;
  actualGeminiCalls: number;
  geminiBillingStatus: 'none' | 'estimated-unavailable';
  geminiTokenUsage: DeepDiveGeminiTokenUsage | null;
  spendingLimitCredits: number;
  sessionCreditsUsedAfterRun: number;
  remainingBudgetCredits: number;
  liveBalanceAfter: number | null;
}

export interface DeepDiveWorkspaceState {
  selectedIds: DeepDiveAnalysisId[];
  expandedIds: DeepDiveAnalysisId[];
  slots: Record<DeepDiveAnalysisId, DeepDiveAnalysisSlotState>;
  lastAttemptedRunIds: DeepDiveAnalysisId[];
  lastAttemptedRunAt: string | null;
  totalCreditsUsedInSession?: number;
  lastRunSummary?: DeepDiveRunCostSummary | null;
  videoCreativeOptions?: DeepDiveVideoCreativeOptions;
}

/**
 * Immutable context connecting a discovered Product into Deep Dive without mutating
 * the original Research Results list, 7-Factor Ranking, or archived Product record.
 */
export interface DeepDiveSourceContext {
  product: ResearchProduct;
  originalProductId: string;
  canonicalProductId: string;
  originResearchMode: ResearchMode;
  originView: DeepDiveOriginView;
  researchDate: string | null;
}

/**
 * Pre-call cost estimation hooks (Phase 9.2 / 9.3 Cost Management).
 * Accurately accounts for cache reuse, already-present fields, shared layer deduplication,
 * separate Gemini AI billing, and unverified/unavailable APIs.
 */
export type DeepDiveModuleCostKind =
  | 'zero-local'
  | 'cached-reuse'
  | 'verified-api'
  | 'ai-no-kalodata-credits'
  | 'unavailable-api';

export interface DeepDiveModuleCostEstimate {
  analysisId: DeepDiveAnalysisId;
  costKind: DeepDiveModuleCostKind;
  requiredApiLayer:
    | 'productDetail'
    | 'shopDetail'
    | 'reviewInsights'
    | 'videoRank'
    | 'gemini-ai'
    | 'none';
  apiLabelEn: string;
  apiLabelMy: string;
  dataUsedEn: string;
  dataUsedMy: string;
  plannedKalodataApiCalls: number;
  estimatedCredits: number;
  /** Estimated Kalodata USD only — excludes separate Google Gemini API billing when separateAiBilling is true */
  estimatedUsd: number;
  separateAiBilling?: boolean;
  reusesExistingOrCache: boolean;
  isSharedDeduplicated?: boolean;
  noteEn: string;
  noteMy: string;
}

export interface DeepDiveExecutionCostEstimate {
  canonicalProductId: string;
  analysisIds: DeepDiveAnalysisId[];
  deduplicatedLayers: ('productDetail' | 'shopDetail' | 'reviewInsights' | 'videoRank')[];
  plannedKalodataApiCalls: number;
  plannedGeminiCalls: number;
  hasSeparateAiBilling: boolean;
  geminiBillingStatus: 'none' | 'estimated-unavailable';
  estimatedCredits: number;
  /** Estimated Kalodata USD only — excludes separate Google Gemini API token billing */
  estimatedUsd: number;
  includesOptInReviewApi: boolean;
  hasHighCostReviewInsight: boolean;
  cachedOrLocalModuleCount: number;
  sharedDeduplicatedModuleCount: number;
  requiresExplicitConfirmation: boolean;
  modules: DeepDiveModuleCostEstimate[];
}

export interface DeepDiveBudgetGuardResult {
  spendingLimitCredits: number;
  sessionCreditsAlreadySpent: number;
  remainingBudgetBeforeRun: number;
  remainingBudgetAfterRun: number;
  exceedsSpendingLimit: boolean;
  exceedsLiveBalance: boolean;
  liveBalanceCredits: number | null;
  canProceedWithoutLimitChange: boolean;
  recommendedMinimumLimit: number;
  requiresExplicitConfirmation: boolean;
}

/**
 * Compact verified summary of a completed Deep Dive module passed as context
 * to Option #8 (AI Strategic Recommendation) so Gemini synthesizes real findings.
 */
export interface DeepDiveCompletedModuleDigest {
  analysisId: DeepDiveAnalysisId;
  outcome: 'completed' | 'unavailable';
  dataStatus: DataStatus;
  headlineEn: string;
  summaryEn: string;
  metrics: Array<{ label: string; value: string; status: DataStatus }>;
  unavailableNotes: string[];
}

/**
 * Phase 9.3.1: Authoritative server-side persistent budget ledger snapshot.
 * Computed strictly on the server from persisted reservations & settled charges
 * (never derived from untrusted client-supplied session spend).
 */
export interface DeepDiveServerBudgetSnapshot {
  scopeFingerprint: string;
  windowKey: string;
  backend: 'upstash-rest' | 'sqlite-wal';
  storageAvailable: boolean;
  spentCredits: number;
  uncertainCredits: number;
  activeReservedCredits: number;
  totalCommittedCredits: number;
  configuredLimitCredits: number | null;
  hardCapCredits: number;
  effectiveLimitCredits: number;
  remainingCredits: number;
  updatedAt: string;
}

/**
 * Phase 9.4: Per-product Deep Dive Analysis History persisted in browser localStorage.
 * Explicitly captures Data Sources, Analysis Date, Cost (Kalodata + Gemini AI separately),
 * Result Status, and isolated module snapshots so past runs can be inspected at 0 API cost.
 */
export type DeepDiveHistoryRunType = 'initial' | 'rerun' | 'refresh';

export type DeepDiveHistoryOverallStatus = 'completed' | 'partial' | 'unavailable' | 'error';

export interface DeepDiveHistoryModuleEntry {
  analysisId: DeepDiveAnalysisId;
  status: DeepDiveExecutionStatus;
  dataStatus: DataStatus | null;
  headlineEn: string;
  headlineMy: string;
  creditsUsed: number;
  apiCallsMade: number;
  aiApiCallsMade: number;
  reusedFromCache: boolean;
  dataSourcesEn: string[];
  dataSourcesMy: string[];
  completedAt: string | null;
  errorCode: string | null;
}

export interface DeepDiveHistoryRecord {
  id: string;
  schemaVersion: number;
  storageKind: 'browser-local-storage';
  canonicalProductId: string;
  productName: string;
  productNameMy: string;
  analyzedAt: string;
  analysisIds: DeepDiveAnalysisId[];
  runType: DeepDiveHistoryRunType;
  overallStatus: DeepDiveHistoryOverallStatus;
  kalodataCreditsUsed: number;
  kalodataUsdUsed: number;
  kalodataApiCalls: number;
  geminiApiCalls: number;
  geminiTokenUsage: DeepDiveGeminiTokenUsage | null;
  cacheReuseCount: number;
  dataSourcesEn: string[];
  dataSourcesMy: string[];
  moduleEntries: DeepDiveHistoryModuleEntry[];
  slotsSnapshot: Partial<Record<DeepDiveAnalysisId, DeepDiveAnalysisSlotState>>;
}

/**
 * Phase 9.4: Consolidated Final Deep Dive Report compiled strictly from real product
 * and completed Deep Dive module results (never fabricating unavailable/unrun analyses).
 */
export type DeepDiveFinalReportSectionId =
  | 'product-overview'
  | 'market-opportunity'
  | 'affiliate-profit'
  | 'competition'
  | 'video-insights'
  | 'customer-reviews'
  | 'risks'
  | 'ai-recommendations'
  | 'video-creative-blueprint';

export type DeepDiveReportSectionAvailability =
  | 'available'
  | 'partial'
  | 'unavailable'
  | 'not-run';

export interface DeepDiveFinalReportSection {
  id: DeepDiveFinalReportSectionId;
  titleEn: string;
  titleMy: string;
  sourceAnalysisIds: DeepDiveAnalysisId[];
  availability: DeepDiveReportSectionAvailability;
  dataStatus: DataStatus;
  isAiInterpretation: boolean;
  headlineEn: string;
  headlineMy: string;
  summaryEn: string;
  summaryMy: string;
  metrics: DeepDiveMetricRow[];
  highlightsEn: string[];
  highlightsMy: string[];
  unavailableNotesEn: string[];
  unavailableNotesMy: string[];
  dataSourcesEn: string[];
  dataSourcesMy: string[];
  lastUpdatedAt: string | null;
}

export interface DeepDiveFinalReport {
  reportVersion: number;
  generatedAt: string;
  canonicalProductId: string;
  originalProductId: string;
  productName: string;
  productNameMy: string;
  categoryLabelEn: string;
  categoryLabelMy: string;
  shopName: string;
  originResearchMode: ResearchMode;
  overallScore: number;
  confidenceLevel: 'High' | 'Medium' | 'Low';
  confidencePct: number;
  completedModulesCount: number;
  unavailableModulesCount: number;
  errorModulesCount: number;
  notRunModulesCount: number;
  totalModulesCount: number;
  aiVerdict: AiRecommendationVerdict | null;
  totalKalodataCreditsUsed: number;
  totalKalodataUsdUsed: number;
  totalKalodataApiCalls: number;
  totalGeminiApiCalls: number;
  lastUpdatedAt: string | null;
  allDataSourcesEn: string[];
  allDataSourcesMy: string[];
  sections: DeepDiveFinalReportSection[];
}


