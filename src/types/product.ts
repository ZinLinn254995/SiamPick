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

export type CriterionKey =
  | 'demandSales'
  | 'commissionEarning'
  | 'aiCreative'
  | 'reviewsQuality'
  | 'priceAppeal'
  | 'competitionOpportunity'
  | 'sellerReliability';

export type ScoreTier = 'priority-test' | 'investigate-further' | 'low-priority';

export type ProductDecision = 'pending' | 'saved' | 'rejected';

export type DecisionFilter = 'active' | 'saved' | 'rejected';

export type ResultSortKey =
  | 'score-desc'
  | 'score-asc'
  | 'confidence-desc'
  | 'price-asc'
  | 'price-desc';

export type AppView = 'hunting' | 'saved';

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
  reason: 'search-quota-exhausted' | 'manual' | null;
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
  researchSourceMode?:
    | 'kalodata-openapi'
    | 'google-search-grounding'
    | 'live-official-storefronts';
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
  key: CriterionKey;
  maxPoints: number;
  earnedPoints: number;
  uncappedPoints: number;
  verification: DataStatus;
  wasCapped: boolean;
  capPoints: number;
  evidenceEn: string;
  evidenceMy: string;
}

export interface OpportunityEvaluation {
  totalScore: number; // 0-100
  tier: ScoreTier;
  confidenceLevel: ConfidenceLevel;
  verifiedCount: number;
  estimatedCount: number;
  unverifiedCount: number;
  unavailableCount: number;
  totalCriteria: number;
  criteria: CriterionEvaluation[];
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

export interface KalodataProductMetrics {
  productId: string;
  dateRange: string;
  researchMode?: ResearchMode;
  detailEnriched?: boolean;
  shopEnriched?: boolean;
  reviewInsightEnriched?: boolean;
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
  launchDate: string | null;
  sellerId: string | null;
  sellerName: string | null;
  skuCount: number | null;
  shopSellerType?: string | null;
  shopRevenueThb?: number | null;
  shopAffiliateRevenueThb?: number | null;
  shopCreatorNumber?: number | null;
  shopProductNumber?: number | null;
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

  opportunityScore: number; // Computed via proportional 100-pt Opportunity Scoring System
  confidenceLevel: ConfidenceLevel;

  // 7-Factor Transparent Scoring Inputs (Total = 100 Points)
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
}
