import type { ResearchMode, ResearchProduct } from './product';

/**
 * Phase 9.1: Independent Deep Dive analysis module identifiers.
 * Each option carries its own isolated identity so Phase 9.2 can execute,
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
  | 'not-implemented'
  | 'idle'
  | 'queued'
  | 'running'
  | 'completed'
  | 'error';

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
  /** Progressive Disclosure Item 4: Data sources / APIs that may be needed in Phase 9.2 */
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

/**
 * Isolated per-analysis execution state slot (Phase 9.2-ready foundation).
 * In Phase 9.1, result is always null and status stays 'not-implemented' — zero fake results.
 */
export interface DeepDiveAnalysisSlotState {
  analysisId: DeepDiveAnalysisId;
  status: DeepDiveExecutionStatus;
  updatedAt: string | null;
  result: null;
  statusNoteEn: string;
  statusNoteMy: string;
}

export interface DeepDiveWorkspaceState {
  selectedIds: DeepDiveAnalysisId[];
  expandedIds: DeepDiveAnalysisId[];
  slots: Record<DeepDiveAnalysisId, DeepDiveAnalysisSlotState>;
  lastAttemptedRunIds: DeepDiveAnalysisId[];
  lastAttemptedRunAt: string | null;
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
