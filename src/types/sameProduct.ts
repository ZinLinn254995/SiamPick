import type { ResearchProduct } from './product';

export type SameProductMatchTier =
  | 'exact-same'
  | 'close-variant'
  | 'different'
  | 'unverified-visual';

export type SameProductEarlyMoverBadge =
  | 'early-mover'
  | 'low-video-gap'
  | 'comparable'
  | 'saturated';

export type SameProductVisualStatus =
  | 'verified'
  | 'skipped-by-user'
  | 'unavailable-no-key'
  | 'unavailable-no-images'
  | 'partial-error';

export interface SameProductSearchOptions {
  keyword: string;
  priceTolerancePct: number;
  includeCloseVariants: boolean;
  includeZeroSales: boolean;
  enableVisualVerification: boolean;
  useCategoryFilter: boolean;
}

export interface SameProductCandidate {
  productId: string;
  shopId: string | null;
  shopName: string;
  title: string;
  imageUrl: string | null;
  imageOriginUrl: string | null;
  tiktokShopUrl: string;
  priceThb: number | null;
  commissionRate: number | null;
  estimatedCommissionPerSaleThb: number | null;
  salesVolume: number | null;
  revenueThb: number | null;
  videoRevenueThb: number | null;
  liveRevenueThb: number | null;
  revenueGrowthRate: number | null;
  launchDate: string | null;
  creatorNumber: number | null;
  videoNumber: number | null;
  shopSellerType: string | null;
  shopRevenueThb: number | null;
  stage2Verified: boolean;
  shopTrustVerified: boolean;
  matchTier: SameProductMatchTier;
  visualMatchConfidence: number | null;
  visualMatchReasonEn: string;
  visualMatchReasonMy: string;
  titleSimilarityPct: number;
  priceDeltaThb: number | null;
  priceDeltaPct: number | null;
  commissionDeltaPct: number | null;
  videoGmvRatioVsOriginal: number | null;
  earlyMoverScore: number;
  earlyMoverBadge: SameProductEarlyMoverBadge;
  earlyMoverSignalsEn: string[];
  earlyMoverSignalsMy: string[];
  researchProduct: ResearchProduct;
}

export interface SameProductSearchResponse {
  ok: true;
  sourceProductId: string;
  sourceShopId: string | null;
  sourceImageUrl: string | null;
  keywordUsed: string;
  categoryIdsUsed: string[];
  fromCache: boolean;
  visualVerificationStatus: SameProductVisualStatus;
  visualVerificationNoteEn: string;
  visualVerificationNoteMy: string;
  totalRankCandidatesFetched: number;
  excludedSameProductOrShopCount: number;
  excludedPriceOrSalesCount: number;
  excludedDifferentProductCount: number;
  visuallyCheckedCount: number;
  candidates: SameProductCandidate[];
  creditsSpent: number;
  estimatedUsdCost: number;
  searchedAt: string;
}

export interface SameProductKeywordSuggestionResponse {
  ok: true;
  primaryKeyword: string;
  suggestions: string[];
  source: 'gemini' | 'deterministic';
}
