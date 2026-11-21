export type ProductCategory = 'womens-fashion' | 'cosmetics-beauty';

export type CategoryFilter = 'all' | ProductCategory;

export type StrategyPreset = 'balanced' | 'sales-first' | 'commission-first';

export type ResearchQuantity = number;

export type BothCategoryMode = 'combined' | 'split';

export type ResearchMode = 'fast' | 'balanced' | 'deep';

export type ResearchDepthTag = 'rank-only' | 'detail-enriched' | 'deep-audited';

export type Language = 'en' | 'my';

export type DemandLevel = 'High' | 'Growing' | 'Steady' | 'Moderate';

export type CompetitionLevel = 'Low' | 'Moderate' | 'High';

export type AiVideoSuitability = 'High' | 'Good' | 'Moderate';

export type ConfidenceLevel = 'High' | 'Medium' | 'Low';

export type RiskSeverity = 'Low' | 'Watch' | 'High';

export type VerificationState = 'Verified' | 'Needs Check' | 'Caution';

/**
 * Unified 4-state data provenance classification.
 * Every research data field is explicitly labeled as Verified, Estimated, Unverified, or Unavailable.
 */
export type DataStatus = 'verified' | 'estimated' | 'unverified' | 'unavailable';

/**
 * Supports legacy 'partial' stored in browser localStorage while standardizing on DataStatus.
 */
export type CriterionVerification = DataStatus | 'partial';

/**
 * Legacy 7-criterion input keys preserved for backwards compatibility with stored products
 * and server-generated scoringInputs payloads.
 */
export type CriterionKey =
  | 'demandSales'
  | 'commissionEarning'
  | 'aiCreative'
  | 'reviewsQuality'
  | 'priceAppeal'
  | 'competitionOpportunity'
  | 'sellerReliability';

/**
 * Phase 2 Product Scoring Engine — 7 Factors totaling 100 Points:
 * - Sales Performance (20 base)
 * - Revenue Performance (20 base)
 * - Revenue Growth (15 base)
 * - Commission Potential (15 base)
 * - Competition (10 base)
 * - Market Demand (10 base)
 * - AI Content Suitability (10 base)
 */
export type ScoreFactorKey =
  | 'salesPerformance'
  | 'revenuePerformance'
  | 'revenueGrowth'
  | 'commissionPotential'
  | 'competition'
  | 'marketDemand'
  | 'aiContentSuitability';

export type StrategyWeightMap = Record<ScoreFactorKey, number>;

export type ScoreTier = 'priority-test' | 'investigate-further' | 'low-priority';

export type ProductDecision = 'pending' | 'saved' | 'rejected';

export type DecisionFilter = 'active' | 'saved' | 'rejected';

export type ResultSortKey =
  | 'score-desc'
  | 'score-asc'
  | 'confidence-desc'
  | 'price-asc'
  | 'price-desc';

export type ProductSortField =
  | 'overallScore'
  | 'salesPerformance'
  | 'revenuePerformance'
  | 'revenueGrowth'
  | 'commissionPotential'
  | 'competition'
  | 'aiContentSuitability'
  | 'dataConfidence';

export type SortDirection = 'desc' | 'asc';

export type ProductDecisionVerdict =
  | 'recommended'
  | 'worth-testing'
  | 'need-more-data'
  | 'not-recommended';

export interface ProductDecisionSummary {
  verdict: ProductDecisionVerdict;
  reasonEn: string;
  reasonMy: string;
  cautionsEn: string[];
  cautionsMy: string[];
  signalsUsed: {
    totalScore: number;
    confidenceLevel: ConfidenceLevel;
    confidencePct: number;
    salesScore: number | null;
    revenueScore: number | null;
    commissionScore: number | null;
    competitionScore: number | null;
    aiVerdict: AiRecommendationVerdict | null;
  };
}

export type BestSelectionCategory =
  | 'bestOverall'
  | 'bestSalesPotential'
  | 'bestCommissionPotential'
  | 'lowestCompetition'
  | 'bestAiContentPotential'
  | 'highestDataConfidence';

export interface BestProductSelectionItem {
  category: BestSelectionCategory;
  product: ResearchProduct | null;
  canonicalProductId: string | null;
  metricSummaryEn: string;
  metricSummaryMy: string;
  reasonEn: string;
  reasonMy: string;
  insufficientData: boolean;
  insufficientReasonEn?: string;
  insufficientReasonMy?: string;
}

export interface ProductResultsFilterState {
  scoreRange: 'all' | '80+' | '65-79' | 'under-65';
  recommendationTier: 'all' | ProductDecisionVerdict;
  confidenceLevel: 'all' | ConfidenceLevel;
  competitionLevel: 'all' | CompetitionLevel | 'unavailable';
  salesPerformance: 'all' | 'strong' | 'moderate' | 'low' | 'unavailable';
  commissionPotential: 'all' | 'high' | 'medium' | 'low' | 'unavailable';
  category: CategoryFilter;
  researchMode: 'all' | ResearchMode;
  aiContentSuitability: 'all' | AiVideoSuitability;
}

export interface ComparisonSelectionItem {
  selectionKey: string;
  canonicalProductId: string;
  product: ResearchProduct;
  source: 'results' | 'saved' | 'history';
  sourceLabelEn: string;
  sourceLabelMy: string;
  researchDate?: string | null;
}

export type AppView = 'hunting' | 'history' | 'saved';

export interface ResearchConfig {
  market: 'Thailand TikTok Shop';
  category: CategoryFilter;
  selectedCategories?: ProductCategory[];
  bothCategoryMode?: BothCategoryMode;
  researchMode?: ResearchMode;
  deepDiveCount?: number;
  includeReviewInsights?: boolean;
  spendingLimitCredits?: number;
  priceLimit: 'unrestricted';
  strategyPreset: StrategyPreset;
  salesWeightPct: number;
  quantity: ResearchQuantity;
}

export interface ResearchCostEstimate {
  selectedCategories: ProductCategory[];
  categoryIds: string[];
  quantity: number;
  bothCategoryMode: BothCategoryMode;
  researchMode: ResearchMode;
  dateRange: 'last7Day' | 'last30Day';
  deepDiveCount: number;
  includeReviewInsights: boolean;
  rankApiCalls: number;
  productDetailApiCalls: number;
  shopDetailApiCalls: number;
  commentInsightApiCalls: number;
  plannedApiCalls: number;
  estimatedCredits: number;
  estimatedUsd: number;
  usesPagination: boolean;
  usesGeminiAnalysis: boolean;
}

export interface ResearchCostSummary {
  researchMode: ResearchMode;
  estimatedCredits: number;
  estimatedUsd: number;
  plannedApiCalls: number;
  actualApiCalls: number;
  rankApiCalls: number;
  productDetailApiCalls: number;
  shopDetailApiCalls: number;
  commentInsightApiCalls: number;
  deepDiveCount: number;
  includeReviewInsights: boolean;
  geminiAnalysisApplied: boolean;
  actualCredits: number | null;
  actualUsd: number | null;
  balanceBefore: number | null;
  balanceAfter: number | null;
  spendingLimitCredits: number;
  bothCategoryMode: BothCategoryMode;
  categoryIds: string[];
}

export interface GroundingSourceLink {
  title: string;
  url: string;
  domain: string;
}

export interface ResearchQuotaStatus {
  paused: boolean;
  reason: 'manual' | null;
  pausedAt: string | null;
}

export interface ResearchSessionResponse {
  products: ResearchProduct[];
  requestedQuantity: ResearchQuantity;
  verifiedProductCount: number;
  filteredOutCount: number;
  researchedAt: string;
  searchQueries: string[];
  groundingSources: GroundingSourceLink[];
  researchSourceMode?: 'kalodata-openapi';
  costSummary?: ResearchCostSummary;
  config: ResearchConfig;
}

export interface SavedProductRecord {
  id: string;
  product: ResearchProduct;
  researchDate: string; // ISO string representing when the product was researched
  savedAt: string; // ISO string representing when the user saved the product
  savedFromPreview?: boolean;
  sources: ResearchSourceItem[];
}

export interface CriterionInput {
  rawStrength: number; // 0-100 qualitative/quantitative strength before verification weighting
  verification: CriterionVerification;
  evidenceEn: string;
  evidenceMy: string;
}

export type ScoringInputs = Record<CriterionKey, CriterionInput>;

export interface CriterionEvaluation {
  key: ScoreFactorKey;
  baseWeight: number; // Strategy-adjusted base weight (all 7 sum to 100)
  effectiveWeight: number; // After proportional redistribution of Unavailable weights (available sum to 100; 0 if unavailable)
  maxPoints: number; // Same as effectiveWeight (rounded) for display clarity
  normalizedScore: number | null; // 0-100 performance score, null when unavailable
  earnedPoints: number | null; // Earned points out of effectiveWeight, null when unavailable
  verification: DataStatus;
  wasRedistributed: boolean; // True when unavailable and weight redistributed to available factors
  evidenceEn: string;
  evidenceMy: string;
  metricDisplayEn: string;
  metricDisplayMy: string;
}

export interface OpportunityEvaluation {
  totalScore: number; // 0-100
  tier: ScoreTier;
  confidenceLevel: ConfidenceLevel;
  confidencePct: number; // 0-100 weighted reliability coverage across all 7 base weights
  salesWeightPct: number;
  strategyPreset: StrategyPreset;
  weights: StrategyWeightMap;
  verifiedCount: number;
  estimatedCount: number;
  unverifiedCount: number;
  unavailableCount: number;
  totalCriteria: number;
  redistributedWeightPct: number; // Sum of base weights redistributed from unavailable factors
  criteria: CriterionEvaluation[];
  strengthsEn: string[];
  strengthsMy: string[];
  weaknessesEn: string[];
  weaknessesMy: string[];
  risksEn: string[];
  risksMy: string[];
  confidenceExplanationEn: string;
  confidenceExplanationMy: string;
}

/**
 * Snapshot of a product's Phase 2 score stored inside a ResearchHistoryRecord.
 */
export interface ProductScoreSnapshot {
  productId: string;
  canonicalProductId: string;
  totalScore: number;
  tier: ScoreTier;
  confidenceLevel: ConfidenceLevel;
  confidencePct: number;
  verifiedCount: number;
  estimatedCount: number;
  unverifiedCount: number;
  unavailableCount: number;
  redistributedWeightPct: number;
  salesWeightPct: number;
  strategyPreset: StrategyPreset;
  criteria: CriterionEvaluation[];
  strengthsEn: string[];
  strengthsMy: string[];
  weaknessesEn: string[];
  weaknessesMy: string[];
  risksEn: string[];
  risksMy: string[];
}

/**
 * Immutable localStorage archive entry created automatically after every Product Hunting run.
 * Stored strictly separately from Saved Products.
 */
export interface ResearchHistoryRecord {
  id: string;
  schemaVersion: number;
  researchedAt: string; // ISO date & time
  researchMode: ResearchMode;
  selectedCategories: ProductCategory[];
  bothCategoryMode: BothCategoryMode;
  requestedQuantity: number;
  productCount: number;
  filteredOutCount: number;
  estimatedCredits: number | null;
  estimatedUsd: number | null;
  actualCredits: number | null;
  actualUsd: number | null;
  costSummary: ResearchCostSummary | null;
  researchSettings: ResearchConfig;
  researchSourceMode:
    | 'kalodata-openapi'
    | 'google-search-grounding'
    | 'live-official-storefronts';
  searchQueries: string[];
  groundingSources: GroundingSourceLink[];
  products: ResearchProduct[];
  scoreSnapshots: Record<string, ProductScoreSnapshot>;
}

export interface StorageWriteResult {
  ok: boolean;
  quotaExceeded: boolean;
  bytesUsed: number;
  errorEn?: string;
  errorMy?: string;
}

export interface LocalStorageUsageStats {
  historyBytes: number;
  savedBytes: number;
  otherSiamPickBytes: number;
  totalBytes: number;
  estimatedQuotaBytes: number;
  usagePct: number;
  historyCount: number;
  savedCount: number;
}

export interface ComparisonMetricDelta {
  oldValue: number | null;
  newValue: number | null;
  delta: number | null;
  deltaPct: number | null; // Percentage change when applicable
  available: boolean;
}

export interface ProductComparisonRow {
  canonicalProductId: string;
  name: string;
  nameMy: string;
  category: ProductCategory;
  shopName: string;
  olderProduct: ResearchProduct;
  newerProduct: ResearchProduct;
  sales: ComparisonMetricDelta;
  revenue: ComparisonMetricDelta;
  growth: ComparisonMetricDelta; // percentage-point change (pp)
  commission: ComparisonMetricDelta; // percentage-point change (pp)
  score: ComparisonMetricDelta;
  olderConfidence: ConfidenceLevel;
  newerConfidence: ConfidenceLevel;
}

export interface ResearchComparisonResult {
  olderRecord: ResearchHistoryRecord;
  newerRecord: ResearchHistoryRecord;
  matchedProducts: ProductComparisonRow[];
  onlyInOlderCount: number;
  onlyInNewerCount: number;
}

export interface RiskFactorDetail {
  level: RiskSeverity;
  noteEn: string;
  noteMy: string;
}

export interface FashionReturnRisk {
  sizing: RiskFactorDetail;
  fabric: RiskFactorDetail;
  colorAccuracy: RiskFactorDetail;
  fitDifference: RiskFactorDetail;
}

export interface ComplianceFactorDetail {
  status: VerificationState;
  noteEn: string;
  noteMy: string;
}

export interface CosmeticsComplianceRisk {
  brandAuthenticity: ComplianceFactorDetail;
  thaiFda: ComplianceFactorDetail;
  adClaimSafety: ComplianceFactorDetail;
}

export interface VideoContentIdea {
  titleEn: string;
  titleMy: string;
  formatEn: string;
  formatMy: string;
  outlineEn: string;
  outlineMy: string;
}

export interface ResearchSourceItem {
  labelEn: string;
  labelMy: string;
  sourceType: string;
  url: string | null;
  verified: boolean;
}

export interface KalodataCategoryRef {
  category_id: string;
  category_name: string;
}

export interface KalodataReviewPoint {
  point: string;
  mentions: number;
}

export interface KalodataReviewInsightData {
  productId: string;
  summary: string | null;
  positivePoints: KalodataReviewPoint[];
  painPoints: KalodataReviewPoint[];
  frequentComplaints: KalodataReviewPoint[];
  qualityCautions: KalodataReviewPoint[];
  buyerNeeds: KalodataReviewPoint[];
  usageScenarios: KalodataReviewPoint[];
  commentsAnalyzed: number;
  averageRating: number | null;
  ratedCommentCount: number;
  updatedAt: string;
}

export interface KalodataShopEnrichmentRecord {
  shopId: string;
  shopName: string | null;
  sellerType: string | null;
  revenueThb: number | null;
  affiliateRevenueThb: number | null;
  selfAccountRevenueThb: number | null;
  shoppingMallRevenueThb: number | null;
  salesVolume: number | null;
  unitPriceThb: number | null;
  creatorNumber: number | null;
  productNumber: number | null;
  videoNumber: number | null;
  liveNumber: number | null;
  dateRange: string;
  updatedAt: string;
}

export interface KalodataProductDetailEnrichmentRecord {
  productId: string;
  productShopId: string | null;
  minPriceThb: number | null;
  maxPriceThb: number | null;
  unitPriceThb: number | null;
  revenueThb: number | null;
  salesVolume: number | null;
  videoRevenueThb: number | null;
  liveRevenueThb: number | null;
  shoppingMallRevenueThb: number | null;
  commissionRatePct: number | null;
  creatorNumber: number | null;
  videoNumber: number | null;
  liveNumber: number | null;
  deliveryType: string | null;
  productReviewCount: number | null;
  launchDate: string | null;
  trendPointsCount: number;
  trendPeakThb: number | null;
  trendAvgThb: number | null;
  dateRange: string;
  updatedAt: string;
}

export type EnrichmentLayerKey = 'productDetail' | 'shopDetail' | 'reviewInsights';

export interface EnrichmentLayerPlanItem {
  layer: EnrichmentLayerKey;
  requested: boolean;
  action: 'fetch' | 'reuse-cache' | 'already-present' | 'skip-missing-id' | 'not-requested';
  estimatedCredits: number;
  estimatedUsd: number;
  apiCalls: number;
  reasonEn: string;
  reasonMy: string;
}

export interface ProductEnrichmentPlan {
  canonicalProductId: string;
  shopId: string | null;
  layers: Record<EnrichmentLayerKey, EnrichmentLayerPlanItem>;
  plannedApiCalls: number;
  estimatedCredits: number;
  estimatedUsd: number;
  reusedFromCacheCount: number;
  alreadyPresentCount: number;
  spendingLimitCredits: number;
  exceedsSpendingLimit: boolean;
  requiresConfirmation: boolean;
}

export type EnrichmentLayerResultStatus =
  | 'fetched'
  | 'reused-cache'
  | 'already-present'
  | 'skipped'
  | 'failed';

export interface ProductEnrichmentExecutionSummary {
  canonicalProductId: string;
  shopId: string | null;
  enrichedAt: string;
  plannedApiCalls: number;
  actualApiCalls: number;
  deduplicatedCallsSaved: number;
  estimatedCredits: number;
  estimatedUsd: number;
  actualCredits: number | null;
  actualUsd: number | null;
  balanceBefore: number | null;
  balanceAfter: number | null;
  layerResults: Record<EnrichmentLayerKey, EnrichmentLayerResultStatus>;
  layerErrors?: Partial<Record<EnrichmentLayerKey, { en: string; my: string }>>;
}

export interface KalodataProductMetrics {
  productId: string;
  dateRange: string;
  researchMode?: ResearchMode;
  detailEnriched?: boolean;
  shopEnriched?: boolean;
  reviewInsightEnriched?: boolean;
  lastEnrichedAt?: string | null;
  productDetailUpdatedAt?: string | null;
  shopDetailUpdatedAt?: string | null;
  reviewInsightUpdatedAt?: string | null;
  unitPriceThb: number | null;
  minPriceThb?: number | null;
  maxPriceThb?: number | null;
  salesVolume: number | null;
  revenueThb: number | null;
  revenueGrowthRate: number | null;
  commissionRatePct: number | null;
  liveRevenueThb: number | null;
  videoRevenueThb: number | null;
  showcaseRevenueThb: number | null;
  shoppingMallRevenueThb?: number | null;
  creatorNumber?: number | null;
  videoNumber?: number | null;
  liveNumber?: number | null;
  deliveryType?: string | null;
  productReviewCount?: number | null;
  trendPointsCount?: number | null;
  trendPeakThb?: number | null;
  trendAvgThb?: number | null;
  launchDate: string | null;
  sellerId: string | null;
  sellerName: string | null;
  skuCount: number | null;
  shopSellerType?: string | null;
  shopRevenueThb?: number | null;
  shopAffiliateRevenueThb?: number | null;
  shopSelfAccountRevenueThb?: number | null;
  shopShoppingMallRevenueThb?: number | null;
  shopSalesVolume?: number | null;
  shopUnitPriceThb?: number | null;
  shopCreatorNumber?: number | null;
  shopProductNumber?: number | null;
  shopVideoNumber?: number | null;
  shopLiveNumber?: number | null;
  reviewInsight?: KalodataReviewInsightData | null;
  priCategory: KalodataCategoryRef | null;
  secCategory: KalodataCategoryRef | null;
  terCategory: KalodataCategoryRef | null;
  categoryIdsRequested: string[];
}

export interface ResearchProduct {
  id: string;
  name: string;
  nameMy: string;
  brand?: string;
  category: ProductCategory;
  researchMode?: ResearchMode;
  researchDepthTag?: ResearchDepthTag;
  kalodataMetrics?: KalodataProductMetrics;
  subCategory: string;
  subCategoryMy: string;
  shopName: string;
  sellerStatus?: DataStatus;
  dispatchHub: string;
  researchedAt?: string;

  // Image is rendered ONLY when imageVerified is true and imageUrl passed live retrieval & verification
  imageUrl: string | null;
  imageOriginUrl?: string | null;
  imageVerified: boolean;
  imageSourceNoteEn: string;
  imageSourceNoteMy: string;

  // 1. Actual Product Price
  priceThb: number | null;
  priceStatus?: DataStatus;

  // 2. Commission Rate & Estimated Commission per Sale (Strictly never fabricated)
  commissionRate: number | null;
  commissionVerified: boolean;
  commissionStatus?: DataStatus;
  estimatedCommissionPerSaleThb?: number | null;
  commissionPerSaleStatus?: DataStatus;
  commissionNoteEn: string;
  commissionNoteMy: string;

  // 3. Reviews, Rating & Quality Evidence
  reviewCount?: number | null;
  reviewCountStatus?: DataStatus;
  customerRating?: number | null;
  customerRatingStatus?: DataStatus;
  feedbackStatus?: DataStatus;
  productQualityEvidenceEn?: string;
  productQualityEvidenceMy?: string;
  productQualityStatus?: DataStatus;

  // 4. Sales, Demand, Competition, Seller Reliability & AI Creative statuses
  salesEvidenceStatus?: DataStatus;
  demandLevel: DemandLevel;
  demandStatus?: DataStatus;
  competitionLevel: CompetitionLevel;
  competitionStatus?: DataStatus;
  aiVideoSuitability: AiVideoSuitability;
  aiVideoStatus?: DataStatus;
  sellerReliabilityLevel: 'Reliable' | 'Standard' | 'Needs Check';
  sellerReliabilityStatus?: DataStatus;

  opportunityScore: number; // Computed via Phase 2 7-Factor 100-pt Product Scoring Engine
  confidenceLevel: ConfidenceLevel;

  // Legacy 7-Factor Scoring Inputs (retained for backwards compatibility)
  scoringInputs: ScoringInputs;

  // 14-Section Detailed Research Report
  whyChooseEn: string;
  whyChooseMy: string;
  demandEvidenceEn: string[];
  demandEvidenceMy: string[];
  salesPotentialEn: string;
  salesPotentialMy: string;
  reviewStrengthsEn: string[];
  reviewStrengthsMy: string[];
  customerComplaintsEn: string[];
  customerComplaintsMy: string[];
  competitionDetailEn: string;
  competitionDetailMy: string;
  sellerReliabilityEn: string;
  sellerReliabilityMy: string;
  generalRisksEn: string[];
  generalRisksMy: string[];
  fashionReturnRisk?: FashionReturnRisk;
  cosmeticsComplianceRisk?: CosmeticsComplianceRisk;
  aiVideoDetailEn: string;
  aiVideoDetailMy: string;
  videoIdeas: [VideoContentIdea, VideoContentIdea, VideoContentIdea];
  sources: ResearchSourceItem[];
  confidenceDetailEn: string;
  confidenceDetailMy: string;
  missingDataEn: string[];
  missingDataMy: string[];

  // Phase 3: Optional attached Gemini AI / Kalodata Fallback Product Analysis
  aiAnalysis?: AiProductAnalysis;
}

export type AiAnalysisSource = 'gemini' | 'kalodata-fallback';

export type AiAnalysisErrorCode =
  | 'MISSING_API_KEY'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'AUTH_ERROR'
  | 'INVALID_RESPONSE'
  | 'UPSTREAM_ERROR'
  | 'NETWORK_ERROR';

export type AiRecommendationVerdict =
  | 'priority-test'
  | 'test-with-caution'
  | 'monitor'
  | 'skip';

export type AiAdCreativeFormat =
  | 'ai-virtual-female-model'
  | 'product-only-3d-commercial';

export interface AiAnalysisDataFact {
  key: string;
  labelEn: string;
  labelMy: string;
  valueEn: string;
  valueMy: string;
  status: DataStatus;
}

export interface AiContentSuitabilityEvaluation {
  adFormat: AiAdCreativeFormat;
  suitabilityRating: AiVideoSuitability;
  status: DataStatus;
  summaryEn: string;
  summaryMy: string;
  creativeAnglesEn: string[];
  creativeAnglesMy: string[];
  cautionsEn: string[];
  cautionsMy: string[];
}

export interface AiFinalRecommendation {
  verdict: AiRecommendationVerdict;
  headlineEn: string;
  headlineMy: string;
  actionPlanEn: string;
  actionPlanMy: string;
}

export interface AiProductAnalysis {
  schemaVersion: number;
  canonicalProductId: string;
  dataFingerprint: string;
  source: AiAnalysisSource;
  modelUsed: string | null;
  analyzedAt: string;
  geminiFailed: boolean;
  fallbackReasonCode?: AiAnalysisErrorCode;
  fallbackNoticeEn?: string;
  fallbackNoticeMy?: string;
  overallDataConfidence: ConfidenceLevel;
  confidenceNoteEn: string;
  confidenceNoteMy: string;
  dataBasis: AiAnalysisDataFact[];

  // 1. Product Strengths & Weaknesses
  strengthsEn: string[];
  strengthsMy: string[];
  weaknessesEn: string[];
  weaknessesMy: string[];

  // 2. Current Sales & Revenue Performance
  salesAndRevenueEn: string;
  salesAndRevenueMy: string;
  salesAndRevenueStatus: DataStatus;

  // 3. Sales / Revenue Growth Potential
  growthPotentialEn: string;
  growthPotentialMy: string;
  growthPotentialStatus: DataStatus;

  // 4. Affiliate Commission Potential
  commissionPotentialEn: string;
  commissionPotentialMy: string;
  commissionPotentialStatus: DataStatus;

  // 5. Competition Situation
  competitionAnalysisEn: string;
  competitionAnalysisMy: string;
  competitionStatus: DataStatus;

  // 6. Target Customer Profile (AI Market Inference unless backed by verified buyer scenarios)
  targetCustomerEn: string;
  targetCustomerMy: string;
  targetCustomerStatus: DataStatus;

  // 7. Why Choose This Product
  whyChooseEn: string;
  whyChooseMy: string;

  // 8. Potential Risks & Drawbacks
  risksAndDrawbacksEn: string[];
  risksAndDrawbacksMy: string[];

  // 9. AI Advertising Content Suitability (Fashion: Virtual Female Model | Beauty: Product-only 3D)
  aiContentSuitability: AiContentSuitabilityEvaluation;

  // 10. Final Recommendation
  finalRecommendation: AiFinalRecommendation;
}

export interface CachedAiAnalysisEntry {
  canonicalProductId: string;
  dataFingerprint: string;
  cachedAt: string;
  analysis: AiProductAnalysis;
  previousAnalyses?: AiProductAnalysis[];
}

