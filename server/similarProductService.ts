import crypto from 'node:crypto';
import type {
  KalodataProductDetailEnrichmentRecord,
  ProductCategory,
  ResearchProduct,
} from '../src/types/product.ts';
import type {
  SimilarProductQueryInfo,
  SimilarProductSearchCostPreview,
  SimilarProductSearchResponse,
} from '../src/types/importedPhase3.ts';
import {
  DEFAULT_SPENDING_LIMIT_CREDITS,
  formatCredits,
  KALODATA_CREDITS_PER_100_ROWS,
  KALODATA_USD_PER_CREDIT,
  MAX_SPENDING_LIMIT_CREDITS,
  MIN_SPENDING_LIMIT_CREDITS,
  resolveKalodataIdForCategory,
} from '../src/utils/kalodataPricing.ts';
import { evaluateProductOpportunity, getCanonicalProductId } from '../src/utils/scoring.ts';
import { verifyKalodataImageUrl } from './imageRetriever.ts';
import {
  fetchKalodataCreditBalance,
  fetchKalodataProductRank,
  resolveProductCategoryFromKalodataId,
  type KalodataProductRankRequest,
} from './kalodataService.ts';
import { parseKalodataProductDetail } from './kalodataAnalysis.ts';
import {
  buildKalodataProductSummary,
  cachedProductDetailToParsed,
  getResearchQuotaStatus,
} from './researchService.ts';
import { getServerCachedProductDetail } from './enrichmentService.ts';
import {
  BudgetStorageUnavailableError,
  getDefaultBudgetLedger,
  resolveAuthoritativeBudgetScope,
  type BudgetScopeSnapshot,
  type PersistentBudgetLedger,
} from './budgetLedgerService.ts';

const SIMILAR_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const SIMILAR_CACHE_MAX_ENTRIES = 120;
const SIMILAR_SEARCH_PAGE_SIZE = 30;
const SIMILAR_SEARCH_CREDIT_COST = KALODATA_CREDITS_PER_100_ROWS; // 0.1 cr per <=100 row rank call

interface SimilarCacheEntry {
  storedAtMs: number;
  query: SimilarProductQueryInfo;
  candidates: ResearchProduct[];
  searchedAt: string;
}

const serverSimilarProductsCache = new Map<string, SimilarCacheEntry>();

export class SimilarProductApiError extends Error {
  status: number;
  code: string;
  errorMy?: string;
  budgetSnapshot?: {
    scopeKey: string;
    configuredLimitCredits: number;
    totalCommittedCredits: number;
    remainingCredits: number;
  };

  constructor(
    status: number,
    code: string,
    message: string,
    errorMy?: string,
    budgetSnapshot?: SimilarProductApiError['budgetSnapshot']
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.errorMy = errorMy;
    this.budgetSnapshot = budgetSnapshot;
  }
}

export interface SimilarProductTestOverrides {
  fetchCreditBalance?: () => Promise<{ ok: boolean; balance: number | null }>;
  fetchProductRank?: (params: KalodataProductRankRequest) => Promise<{
    ok: boolean;
    items: Record<string, unknown>[];
    httpStatus?: number | null;
    upstreamCode?: string;
    error?: string;
    errorMy?: string;
  }>;
  verifyImageUrl?: typeof verifyKalodataImageUrl;
  budgetLedger?: PersistentBudgetLedger;
  budgetScopeKey?: string;
}

export function clearServerSimilarProductsCache(): void {
  serverSimilarProductsCache.clear();
}

function roundCredits3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clampSpendingLimit(raw: number | undefined): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return DEFAULT_SPENDING_LIMIT_CREDITS;
  }
  return (
    Math.round(
      Math.max(MIN_SPENDING_LIMIT_CREDITS, Math.min(MAX_SPENDING_LIMIT_CREDITS, raw)) * 1000
    ) / 1000
  );
}

function isValidCategoryId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{3,64}$/.test(value.trim());
}

function isDeterministicNonBilledHttpError(
  httpStatus: number | null | undefined,
  upstreamCode?: string
): boolean {
  if (upstreamCode === 'MISSING_API_KEY') return true;
  if (httpStatus !== undefined && httpStatus !== null && [400, 401, 403, 404, 422, 429].includes(httpStatus)) {
    return true;
  }
  return false;
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'new', 'hot', 'sale', 'best', 'top',
  'official', 'authentic', 'original', 'thailand', 'thai', 'shop', 'tiktok',
  'ml', 'g', 'kg', 'cm', 'mm', 'pcs', 'pc', 'set', 'pack', 'free', 'shipping',
  'ready', 'stock', 'promotion', 'promo', 'cod',
]);

/**
 * Extracts a concise, clean search keyword string from a TikTok Shop product title
 * without inventing unrelated keywords.
 */
export function buildCleanSimilarKeyword(productName: string, customKeyword?: string): string {
  const manual = typeof customKeyword === 'string' ? customKeyword.trim() : '';
  const source = manual || productName || '';
  const cleaned = source
    .replace(/[\[\]()【】（）!！?？@#$%^&*_+=~`|\\/<>,"'“”‘’。、·•★☆✅🔥✨💥🎁]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (manual) {
    return cleaned.slice(0, 80);
  }

  const tokens = cleaned
    .split(' ')
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !/^\d+$/.test(t) && !STOP_WORDS.has(t.toLowerCase()));

  if (tokens.length === 0) {
    return cleaned.slice(0, 60);
  }
  return tokens.slice(0, 3).join(' ').slice(0, 80);
}

export function resolveSimilarSearchQuery(
  referenceProduct: ResearchProduct,
  options?: {
    customKeyword?: string;
    resolvedCategoryIdMap?: Partial<Record<ProductCategory, string>>;
  }
): SimilarProductQueryInfo {
  const referenceProductId = getCanonicalProductId(referenceProduct);
  const metrics = referenceProduct.kalodataMetrics;

  const candidateIds: string[] = [];
  if (metrics?.terCategory?.category_id && isValidCategoryId(metrics.terCategory.category_id)) {
    candidateIds.push(metrics.terCategory.category_id.trim());
  } else if (metrics?.secCategory?.category_id && isValidCategoryId(metrics.secCategory.category_id)) {
    candidateIds.push(metrics.secCategory.category_id.trim());
  } else if (metrics?.priCategory?.category_id && isValidCategoryId(metrics.priCategory.category_id)) {
    candidateIds.push(metrics.priCategory.category_id.trim());
  } else {
    const mapped = resolveKalodataIdForCategory(
      referenceProduct.category,
      options?.resolvedCategoryIdMap
    );
    if (mapped && isValidCategoryId(mapped)) {
      candidateIds.push(mapped.trim());
    }
  }

  const keyword = buildCleanSimilarKeyword(referenceProduct.name, options?.customKeyword);

  return {
    referenceProductId,
    referenceProductName: referenceProduct.name,
    keyword,
    categoryIds: Array.from(new Set(candidateIds)),
    categorySlug: referenceProduct.category,
    dateRange: 'last30Day',
  };
}

function buildSimilarCacheKey(query: SimilarProductQueryInfo): string {
  const catPart = [...query.categoryIds].sort().join(',');
  const kwPart = query.keyword.trim().toLowerCase();
  return `${query.referenceProductId}|${query.categorySlug}|${catPart}|${kwPart}`;
}

function getCachedSimilarEntry(cacheKey: string): SimilarCacheEntry | null {
  const entry = serverSimilarProductsCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() - entry.storedAtMs > SIMILAR_CACHE_TTL_MS) {
    serverSimilarProductsCache.delete(cacheKey);
    return null;
  }
  return entry;
}

function setCachedSimilarEntry(cacheKey: string, entry: SimilarCacheEntry): void {
  if (serverSimilarProductsCache.size >= SIMILAR_CACHE_MAX_ENTRIES && !serverSimilarProductsCache.has(cacheKey)) {
    const oldest = serverSimilarProductsCache.keys().next().value;
    if (oldest !== undefined) {
      serverSimilarProductsCache.delete(oldest);
    }
  }
  serverSimilarProductsCache.set(cacheKey, entry);
}

/**
 * 0-Credit Cost Preview & Budget Inspection for Similar Product Search.
 */
export async function previewSimilarProductsSearch(
  params: {
    referenceProduct: ResearchProduct;
    customKeyword?: string;
    resolvedCategoryIdMap?: Partial<Record<ProductCategory, string>>;
    spendingLimitCredits?: number;
    forceRefresh?: boolean;
  },
  overrides?: SimilarProductTestOverrides
): Promise<SimilarProductSearchCostPreview> {
  const query = resolveSimilarSearchQuery(params.referenceProduct, {
    customKeyword: params.customKeyword,
    resolvedCategoryIdMap: params.resolvedCategoryIdMap,
  });
  const cacheKey = buildSimilarCacheKey(query);
  const cachedInServer = params.forceRefresh !== true && Boolean(getCachedSimilarEntry(cacheKey));
  const spendingLimitCredits = clampSpendingLimit(params.spendingLimitCredits);

  let budgetSummary: SimilarProductSearchCostPreview['budgetSummary'] = null;
  try {
    const ledger = overrides?.budgetLedger ?? getDefaultBudgetLedger();
    const scopeKey =
      overrides?.budgetScopeKey && overrides.budgetScopeKey.trim().length > 0
        ? overrides.budgetScopeKey.trim()
        : resolveAuthoritativeBudgetScope().scopeKey;
    const snap = await ledger.getScopeSnapshot(scopeKey, spendingLimitCredits);
    let liveBalance: number | null = null;
    try {
      const bal = overrides?.fetchCreditBalance
        ? await overrides.fetchCreditBalance()
        : await fetchKalodataCreditBalance();
      if (bal.ok && bal.balance !== null) {
        liveBalance = bal.balance;
      }
    } catch {
      liveBalance = null;
    }
    budgetSummary = {
      storageAvailable: true,
      configuredLimitCredits: snap.effectiveLimitCredits,
      totalCommittedCredits: snap.totalCommittedCredits,
      remainingLimitCredits: snap.remainingCredits,
      liveBalanceCredits: liveBalance,
    };
  } catch {
    budgetSummary = {
      storageAvailable: false,
      configuredLimitCredits: null,
      totalCommittedCredits: null,
      remainingLimitCredits: null,
      liveBalanceCredits: null,
    };
  }

  const requiresPaidApiCall = !cachedInServer;
  const estimatedCredits = requiresPaidApiCall ? SIMILAR_SEARCH_CREDIT_COST : 0;

  return {
    estimatedCredits,
    estimatedUsd: Math.round(estimatedCredits * KALODATA_USD_PER_CREDIT * 10000) / 10000,
    plannedApiCalls: requiresPaidApiCall ? 1 : 0,
    cachedInServer,
    requiresPaidApiCall,
    requiresConfirmation: requiresPaidApiCall,
    query,
    quotaPaused: getResearchQuotaStatus().paused,
    budgetSummary,
  };
}

/**
 * Executes a Similar Product Search via Server Cache (0 cr) or confirmation-gated
 * Kalodata Product Rank API (0.1 cr) with persistent Budget Ledger atomic reservation.
 * Never fabricates missing metrics (e.g. creatorNumber remains unavailable unless cached in detail).
 */
export async function searchSimilarProducts(
  params: {
    referenceProduct: ResearchProduct;
    customKeyword?: string;
    resolvedCategoryIdMap?: Partial<Record<ProductCategory, string>>;
    clientCachedDetails?: Record<string, KalodataProductDetailEnrichmentRecord>;
    spendingLimitCredits?: number;
    salesWeightPct?: number;
    userConfirmedPaidExecution?: boolean;
    forceRefresh?: boolean;
    idempotencyKey?: string;
  },
  overrides?: SimilarProductTestOverrides
): Promise<SimilarProductSearchResponse> {
  const salesWeightPct =
    typeof params.salesWeightPct === 'number' && Number.isFinite(params.salesWeightPct)
      ? Math.max(10, Math.min(90, Math.round(params.salesWeightPct)))
      : 50;
  const spendingLimitCredits = clampSpendingLimit(params.spendingLimitCredits);
  const forceRefresh = params.forceRefresh === true;

  const query = resolveSimilarSearchQuery(params.referenceProduct, {
    customKeyword: params.customKeyword,
    resolvedCategoryIdMap: params.resolvedCategoryIdMap,
  });

  if (query.categoryIds.length === 0 && !query.keyword) {
    throw new SimilarProductApiError(
      400,
      'NO_SEARCH_CRITERIA',
      'A keyword or verified Kalodata Thailand category ID is required to search similar products.',
      'ဆင်တူ Product ရှာဖွေရန် Keyword သို့မဟုတ် အတည်ပြုပြီး Kalodata Category ID လိုအပ်ပါသည်။'
    );
  }

  // Step 1: Check 24h server cache BEFORE pause / confirmation / budget gates
  const cacheKey = buildSimilarCacheKey(query);
  if (!forceRefresh) {
    const cached = getCachedSimilarEntry(cacheKey);
    if (cached) {
      return {
        ok: true,
        query: cached.query,
        candidates: cached.candidates,
        dataSource: 'server-cache',
        apiCallsMade: 0,
        estimatedCreditsCharged: 0,
        creditsBalanceBefore: null,
        creditsBalanceAfter: null,
        searchedAt: cached.searchedAt,
      };
    }
  }

  // Step 2: Check manual research pause
  if (getResearchQuotaStatus().paused) {
    throw new SimilarProductApiError(
      429,
      'RESEARCH_PAUSED',
      'Paid Kalodata API calls are currently paused. Resume research before running a live similar product search.',
      'Paid Kalodata API ခေါ်ဆိုမှုများကို ယာယီရပ်နားထားပါသည်။ ဆက်လက်ရှာဖွေရန် Research ကို Resume ပြန်လုပ်ပါ။'
    );
  }

  // Step 3: Enforce explicit user confirmation BEFORE any paid Kalodata API call
  if (params.userConfirmedPaidExecution !== true) {
    throw new SimilarProductApiError(
      400,
      'CONFIRMATION_REQUIRED',
      `Explicit user confirmation is required before calling Kalodata Product Rank API for Similar Products (${formatCredits(SIMILAR_SEARCH_CREDIT_COST)} credits). No API call was made.`,
      `ဆင်တူ Product ရှာဖွေရန် Paid Kalodata API (${formatCredits(SIMILAR_SEARCH_CREDIT_COST)} Credits) မခေါ်ဆိုမီ အသုံးပြုသူ၏ အတည်ပြုချက် လိုအပ်ပါသည်။ API မခေါ်ဆိုထားပါ။`
    );
  }

  // Step 4: Persistent Budget Ledger Atomic Reservation (fail-closed if storage unavailable)
  const idempotencyKey =
    typeof params.idempotencyKey === 'string' && params.idempotencyKey.trim().length >= 4
      ? params.idempotencyKey.trim().slice(0, 128)
      : `similar-${query.referenceProductId}-${crypto.randomUUID()}`;

  let ledger: PersistentBudgetLedger;
  let scopeKey: string;
  let reserveOutcome;
  try {
    ledger = overrides?.budgetLedger ?? getDefaultBudgetLedger();
    scopeKey =
      overrides?.budgetScopeKey && overrides.budgetScopeKey.trim().length > 0
        ? overrides.budgetScopeKey.trim()
        : resolveAuthoritativeBudgetScope().scopeKey;
    reserveOutcome = await ledger.atomicReserveBudget({
      scopeKey,
      idempotencyKey,
      runId: null,
      operation: 'research',
      reserveCredits: SIMILAR_SEARCH_CREDIT_COST,
      requestedLimitCredits: spendingLimitCredits,
    });
  } catch (err) {
    if (err instanceof BudgetStorageUnavailableError) {
      throw new SimilarProductApiError(
        503,
        'BUDGET_STORAGE_UNAVAILABLE',
        err.message,
        err.errorMy
      );
    }
    throw err;
  }

  const formatBudgetSnap = (snap: BudgetScopeSnapshot) => ({
    scopeKey: snap.scopeKey,
    configuredLimitCredits: snap.effectiveLimitCredits,
    totalCommittedCredits: snap.totalCommittedCredits,
    remainingCredits: snap.remainingCredits,
  });

  if (!reserveOutcome.ok) {
    const snapSummary = formatBudgetSnap(reserveOutcome.snapshot);
    if (reserveOutcome.reason === 'IDEMPOTENCY_IN_PROGRESS') {
      throw new SimilarProductApiError(
        409,
        'IDEMPOTENCY_IN_PROGRESS',
        'An identical similar product search is already in progress.',
        'တူညီသော ဆင်တူ Product ရှာဖွေမှု Request တစ်ခု လုပ်ဆောင်နေဆဲဖြစ်ပါသည်။',
        snapSummary
      );
    }
    if (reserveOutcome.reason === 'IDEMPOTENCY_ALREADY_SETTLED') {
      throw new SimilarProductApiError(
        409,
        'IDEMPOTENCY_CONFLICT',
        'This similar product search request was already executed. Duplicate charge prevented.',
        'ဤရှာဖွေမှု Request ကို လုပ်ဆောင်ပြီးသားဖြစ်၍ Credit နှစ်ခါမကုန်စေရန် ကာကွယ်ထားပါသည်။',
        snapSummary
      );
    }
    throw new SimilarProductApiError(
      400,
      'SPENDING_LIMIT_EXCEEDED',
      `Similar product search (${formatCredits(SIMILAR_SEARCH_CREDIT_COST)} cr) exceeds your Spending Limit (${formatCredits(reserveOutcome.snapshot.effectiveLimitCredits)} cr limit; ${formatCredits(reserveOutcome.snapshot.totalCommittedCredits)} cr committed). Raise your limit to proceed.`,
      `ဆင်တူ Product ရှာဖွေမှု (${formatCredits(SIMILAR_SEARCH_CREDIT_COST)} cr) သည် Spending Limit (${formatCredits(reserveOutcome.snapshot.effectiveLimitCredits)} cr) ကို ကျော်လွန်နေပါသည် (${formatCredits(reserveOutcome.snapshot.totalCommittedCredits)} cr သုံးစွဲပြီး)။`,
      snapSummary
    );
  }

  const reservationId = reserveOutcome.reservationId;
  let reservationFinalized = false;

  try {
    // Step 5: Free balance check before dispatching paid API call
    let balanceBefore: number | null = null;
    try {
      const bal = overrides?.fetchCreditBalance
        ? await overrides.fetchCreditBalance()
        : await fetchKalodataCreditBalance();
      if (bal.ok && bal.balance !== null) {
        balanceBefore = bal.balance;
        if (bal.balance < SIMILAR_SEARCH_CREDIT_COST) {
          await ledger.releaseReservation({
            scopeKey,
            reservationId,
            verifiedZeroCharge: true,
            requestedLimitCredits: spendingLimitCredits,
            reason: 'INSUFFICIENT_CREDITS',
          });
          reservationFinalized = true;
          throw new SimilarProductApiError(
            402,
            'INSUFFICIENT_CREDITS',
            `Insufficient Kalodata credit balance (${formatCredits(bal.balance)} cr available; ${formatCredits(SIMILAR_SEARCH_CREDIT_COST)} cr required).`,
            `Kalodata Credit လက်ကျန် မလုံလောက်ပါ (${formatCredits(bal.balance)} cr သာကျန်ရှိပြီး ${formatCredits(SIMILAR_SEARCH_CREDIT_COST)} cr လိုအပ်ပါသည်)။`
          );
        }
      }
    } catch (err) {
      if (err instanceof SimilarProductApiError) throw err;
      balanceBefore = null;
    }

    // Step 6: Execute single Kalodata Product Rank call (0.1 cr)
    await ledger.markReservationDispatched(scopeKey, reservationId);

    const rankRequest: KalodataProductRankRequest = {
      region: 'TH',
      language: 'en-US',
      currency: 'THB',
      date_range: 'last30Day',
      page_number: 1,
      page_size: SIMILAR_SEARCH_PAGE_SIZE,
      is_affiliate: 1,
      sort_field: {
        field: 'revenue',
        type: 'DESC',
      },
      ...(query.categoryIds.length > 0 ? { category_ids: query.categoryIds } : {}),
      ...(query.keyword ? { keyword: query.keyword } : {}),
      need_image: 1,
      need_extra: true,
    };

    const rankRes = overrides?.fetchProductRank
      ? await overrides.fetchProductRank(rankRequest)
      : await fetchKalodataProductRank(rankRequest);

    let balanceAfter: number | null = null;
    try {
      const balAfterRes = overrides?.fetchCreditBalance
        ? await overrides.fetchCreditBalance()
        : await fetchKalodataCreditBalance();
      if (balAfterRes.ok && balAfterRes.balance !== null) {
        balanceAfter = balAfterRes.balance;
      }
    } catch {
      balanceAfter = null;
    }

    if (!rankRes.ok) {
      const errMsg = rankRes.error ?? 'Kalodata Product Rank API error during similar product search.';
      const errMsgMy =
        rankRes.errorMy ?? 'Kalodata မှ ဆင်တူ Product များ ရှာဖွေရာတွင် API အမှား ဖြစ်ပွားခဲ့ပါသည်။';
      const confirmedZeroCharge =
        isDeterministicNonBilledHttpError(rankRes.httpStatus, rankRes.upstreamCode) ||
        (balanceBefore !== null && balanceAfter !== null && balanceAfter >= balanceBefore);

      if (confirmedZeroCharge) {
        await ledger.releaseReservation({
          scopeKey,
          reservationId,
          verifiedZeroCharge: true,
          requestedLimitCredits: spendingLimitCredits,
          reason: rankRes.upstreamCode ?? 'ZERO_CHARGE_ERROR',
        });
      } else {
        await ledger.markReservationUncertain({
          scopeKey,
          reservationId,
          requestedLimitCredits: spendingLimitCredits,
          reason: rankRes.upstreamCode ?? 'UPSTREAM_AMBIGUOUS',
        });
      }
      reservationFinalized = true;

      if (rankRes.upstreamCode === 'MISSING_API_KEY') {
        throw new SimilarProductApiError(400, 'MISSING_API_KEY', errMsg, errMsgMy);
      }

      throw new SimilarProductApiError(
        rankRes.httpStatus && rankRes.httpStatus >= 400 ? rankRes.httpStatus : 502,
        'KALODATA_API_ERROR',
        errMsg,
        errMsgMy
      );
    }

    const actualCredits =
      balanceBefore !== null && balanceAfter !== null && balanceBefore >= balanceAfter
        ? Math.max(SIMILAR_SEARCH_CREDIT_COST, roundCredits3(balanceBefore - balanceAfter))
        : SIMILAR_SEARCH_CREDIT_COST;

    const settledSnap = await ledger.settleReservation({
      scopeKey,
      reservationId,
      actualCredits,
      requestedLimitCredits: spendingLimitCredits,
      note: `similar-search:${query.referenceProductId}`,
    });
    reservationFinalized = true;

    const searchedAt = new Date().toISOString();
    const verifyImg = overrides?.verifyImageUrl ?? verifyKalodataImageUrl;
    const rawItems = rankRes.items ?? [];

    const candidates: ResearchProduct[] = [];
    const seenIds = new Set<string>([query.referenceProductId]);

    for (const item of rawItems) {
      const pid =
        item.product_id !== undefined && item.product_id !== null
          ? String(item.product_id).trim()
          : '';
      if (!pid || seenIds.has(pid)) continue;
      seenIds.add(pid);

      // Hydrate from server or client cache if available at 0 extra credits
      const cachedDetailRecord =
        getServerCachedProductDetail(pid) ?? params.clientCachedDetails?.[pid] ?? null;
      const parsedDetail = cachedDetailRecord
        ? cachedProductDetailToParsed(cachedDetailRecord)
        : parseKalodataProductDetail(pid, null);

      const priCatId =
        item.pri_category && typeof item.pri_category === 'object'
          ? String((item.pri_category as Record<string, unknown>).category_id ?? '').trim()
          : '';
      const priCatName =
        item.pri_category && typeof item.pri_category === 'object'
          ? String((item.pri_category as Record<string, unknown>).category_name ?? '').trim()
          : '';
      const resolvedCat =
        resolveProductCategoryFromKalodataId(
          priCatId || null,
          priCatName || null,
          params.resolvedCategoryIdMap
        ) ?? query.categorySlug;

      const rawImg =
        typeof item.master_image_url === 'string' && item.master_image_url.trim()
          ? item.master_image_url.trim()
          : typeof item.image_url === 'string' && item.image_url.trim()
            ? item.image_url.trim()
            : cachedDetailRecord?.masterImageUrl ?? null;

      const imageCheck = await verifyImg(rawImg);

      const productSummary = buildKalodataProductSummary(
        item,
        resolvedCat,
        query.categoryIds,
        'last30Day',
        searchedAt,
        imageCheck,
        {
          researchMode: 'fast',
          productDetail: cachedDetailRecord ? parsedDetail : null,
          shopDetail: null,
          commentInsight: null,
          sourceMode: 'product-rank',
        }
      );

      const evaluation = evaluateProductOpportunity(productSummary, { salesWeightPct });
      candidates.push({
        ...productSummary,
        opportunityScore: evaluation.totalScore,
        confidenceLevel: evaluation.confidenceLevel,
      });

      if (candidates.length >= 24) break;
    }

    setCachedSimilarEntry(cacheKey, {
      storedAtMs: Date.now(),
      query,
      candidates,
      searchedAt,
    });

    return {
      ok: true,
      query,
      candidates,
      dataSource: 'kalodata-similar-search',
      apiCallsMade: 1,
      estimatedCreditsCharged: actualCredits,
      creditsBalanceBefore: balanceBefore,
      creditsBalanceAfter: balanceAfter,
      searchedAt,
      budgetSnapshot: formatBudgetSnap(settledSnap),
    };
  } catch (err) {
    if (!reservationFinalized) {
      await ledger
        .markReservationUncertain({
          scopeKey,
          reservationId,
          requestedLimitCredits: spendingLimitCredits,
          reason: 'SIMILAR_SEARCH_INTERRUPTED',
        })
        .catch(() => {});
    }
    throw err;
  }
}
