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

export interface DeepDiveAiMeta {
  modelUsed: string | null;
  source: 'gemini';
  verdict: AiRecommendationVerdict;
  modulesSynthesized: DeepDiveAnalysisId[];
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

export interface DeepDiveWorkspaceState {
  selectedIds: DeepDiveAnalysisId[];
  expandedIds: DeepDiveAnalysisId[];
  slots: Record<DeepDiveAnalysisId, DeepDiveAnalysisSlotState>;
  lastAttemptedRunIds: DeepDiveAnalysisId[];
  lastAttemptedRunAt: string | null;
  totalCreditsUsedInSession?: number;
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
 * Pre-call cost estimation hooks prepared for Phase 9.3 Cost Management integration.
 * Accurately accounts for cache reuse, already-present fields, shared layer deduplication,
 * and unverified/unavailable APIs.
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
  plannedKalodataApiCalls: number;
  estimatedCredits: number;
  /** Estimated Kalodata USD only — excludes separate Google Gemini API billing when separateAiBilling is true */
  estimatedUsd: number;
  separateAiBilling?: boolean;
  reusesExistingOrCache: boolean;
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
  estimatedCredits: number;
  /** Estimated Kalodata USD only — excludes separate Google Gemini API token billing */
  estimatedUsd: number;
  includesOptInReviewApi: boolean;
  modules: DeepDiveModuleCostEstimate[];
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
