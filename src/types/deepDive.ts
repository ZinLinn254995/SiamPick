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
  | 'ai-strategic-recommendation';

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

/**
 * Isolated per-module structured output produced by Phase 9.2 Execution Engine.
 * Strictly separates verified market metrics from AI Strategic Interpretation.
 */
export interface DeepDiveModuleResult {
  analysisId: DeepDiveAnalysisId;
  outcome: 'completed' | 'unavailable';
  dataStatus: DataStatus;
  /** Strictly true ONLY for ai-strategic-recommendation; false for all market data modules */
  isAiInterpretation: boolean;
  headlineEn: string;
  headlineMy: string;
  summaryEn: string;
  summaryMy: string;
  metrics: DeepDiveMetricRow[];
  sections: DeepDiveResultSection[];
  competitorRows?: DeepDiveCompetitorComparisonRow[];
  videoItems?: DeepDiveVideoItem[];
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
  requiredApiLayer: 'productDetail' | 'shopDetail' | 'reviewInsights' | 'gemini-ai' | 'none';
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
  deduplicatedLayers: ('productDetail' | 'shopDetail' | 'reviewInsights')[];
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

