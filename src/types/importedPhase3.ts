import type {
  KalodataProductDetailEnrichmentRecord,
  ProductCategory,
  ResearchProduct,
} from './product.ts';

export type SimilarProductSearchSource =
  | 'kalodata-similar-search'
  | 'server-cache'
  | 'client-cache'
  | 'workspace-pool';

export interface SimilarProductQueryInfo {
  referenceProductId: string;
  referenceProductName: string;
  keyword: string;
  categoryIds: string[];
  categorySlug: ProductCategory;
  dateRange: 'last30Day';
}

export interface SimilarProductSearchCostPreview {
  estimatedCredits: number;
  estimatedUsd: number;
  plannedApiCalls: number;
  cachedInServer: boolean;
  requiresPaidApiCall: boolean;
  requiresConfirmation: boolean;
  query: SimilarProductQueryInfo;
  quotaPaused: boolean;
  budgetSummary: {
    storageAvailable: boolean;
    configuredLimitCredits: number | null;
    totalCommittedCredits: number | null;
    remainingLimitCredits: number | null;
    liveBalanceCredits: number | null;
  } | null;
}

export interface SimilarProductSearchResponse {
  ok: true;
  query: SimilarProductQueryInfo;
  candidates: ResearchProduct[];
  dataSource: Exclude<SimilarProductSearchSource, 'workspace-pool'>;
  apiCallsMade: number;
  estimatedCreditsCharged: number;
  creditsBalanceBefore: number | null;
  creditsBalanceAfter: number | null;
  searchedAt: string;
  budgetSnapshot?: {
    scopeKey: string;
    configuredLimitCredits: number;
    totalCommittedCredits: number;
    remainingCredits: number;
  };
}

export interface SimilarProductSearchParams {
  referenceProduct: ResearchProduct;
  customKeyword?: string;
  resolvedCategoryIdMap?: Partial<Record<ProductCategory, string>>;
  clientCachedDetails?: Record<string, KalodataProductDetailEnrichmentRecord>;
  spendingLimitCredits?: number;
  salesWeightPct?: number;
  userConfirmedPaidExecution?: boolean;
  forceRefresh?: boolean;
  idempotencyKey?: string;
}

export type SimilarBucketFilter =
  | 'all'
  | 'cheaper-price'
  | 'better-commission'
  | 'lower-competition';
