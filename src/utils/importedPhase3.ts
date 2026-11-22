import type {
  DataStatus,
  KalodataProductDetailEnrichmentRecord,
  ResearchProduct,
} from '../types/product.ts';
import type {
  SimilarBucketFilter,
  SimilarProductSearchSource,
} from '../types/importedPhase3.ts';
import { getCategoryLabel } from './categoryRegistry.ts';
import { loadEnrichmentCache } from './enrichmentCache.ts';
import { mergeEnrichmentIntoProduct } from './enrichmentPlanner.ts';
import { formatThb } from './format.ts';
import { KALODATA_PRODUCT_DETAIL_CREDIT, KALODATA_USD_PER_CREDIT } from './kalodataPricing.ts';
import { getCanonicalProductId, normalizeDataStatus } from './scoring.ts';
import type {
  ImportedWorkspaceContext,
  ImportedWorkspaceDataSource,
} from './importedProductWorkspace.ts';

export const IMPORTED_LIBRARY_STORAGE_KEY = 'siampick_imported_products_library_v1';
export const SIMILAR_PRODUCTS_CACHE_STORAGE_KEY = 'siampick_similar_products_cache_v1';
export const IMPORTED_LIBRARY_MAX_ENTRIES = 50;
const SIMILAR_CLIENT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const SIMILAR_CLIENT_CACHE_MAX_ENTRIES = 25;

export type ComparisonCandidateOrigin =
  | ImportedWorkspaceDataSource
  | 'kalodata-similar-search'
  | 'workspace-pool';

export interface ImportedLibraryEntry {
  schemaVersion: 1;
  canonicalProductId: string;
  product: ResearchProduct;
  importedAt: string;
  dataSource: ImportedWorkspaceDataSource;
  apiCallsMade: number;
  estimatedCreditsCharged: number;
  canonicalUrl: string | null;
  resolvedUrl: string | null;
}

export interface ComparisonCandidateItem {
  canonicalProductId: string;
  product: ResearchProduct;
  origin: ComparisonCandidateOrigin;
  originDetailEn?: string;
  originDetailMy?: string;
  importedAt?: string;
}

export interface ImportedComparisonCell {
  canonicalProductId: string;
  valueEn: string;
  valueMy: string;
  subValueEn?: string;
  subValueMy?: string;
  status: DataStatus;
  numericValue: number | null;
  isBest: boolean;
}

export type ImportedComparisonRowKey =
  | 'price'
  | 'sales'
  | 'gmv'
  | 'commission'
  | 'creatorCompetition'
  | 'videoPerformance'
  | 'dataSource'
  | 'verificationStatus';

export interface ImportedComparisonRow {
  key: ImportedComparisonRowKey;
  labelEn: string;
  labelMy: string;
  cells: ImportedComparisonCell[];
  hasDifference: boolean;
  missingNoteEn?: string;
  missingNoteMy?: string;
}

export interface ImportedComparisonMatrix {
  columns: ComparisonCandidateItem[];
  canCompare: boolean;
  distinctCount: number;
  rows: ImportedComparisonRow[];
  bestSummary: {
    lowestPriceId: string | null;
    highestSalesId: string | null;
    highestGmvId: string | null;
    highestCommissionId: string | null;
    lowestCompetitionId: string | null;
    highestVideoRevenueId: string | null;
  };
}

export interface ComparisonEnrichmentPlan {
  missingDetailIds: string[];
  cachedDetailIds: string[];
  uncachedDetailIds: string[];
  estimatedCredits: number;
  estimatedUsd: number;
  plannedApiCalls: number;
  requiresConfirmation: boolean;
}

export interface SimilarProductClassification {
  candidate: ResearchProduct;
  canonicalProductId: string;
  source: SimilarProductSearchSource;
  sourceLabelEn: string;
  sourceLabelMy: string;
  sharedCategory: boolean;
  keywordMatchScore: number;
  isCheaperPrice: boolean;
  priceDeltaThb: number | null;
  priceSavingsPct: number | null;
  isBetterCommission: boolean;
  commissionGainPts: number | null;
  isLowerCompetition: boolean;
  creatorDelta: number | null;
  competitionRankDelta: number | null;
  missingReasonsEn: string[];
  missingReasonsMy: string[];
}

export interface SimilarFinderEvaluation {
  referenceCanonicalId: string;
  referencePriceThb: number | null;
  referenceCommissionRate: number | null;
  referenceCreatorNumber: number | null;
  items: SimilarProductClassification[];
  counts: {
    all: number;
    cheaperPrice: number;
    betterCommission: number;
    lowerCompetition: number;
  };
  referenceLimitationsEn: string[];
  referenceLimitationsMy: string[];
}

function getStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
    if (
      typeof globalThis !== 'undefined' &&
      'localStorage' in globalThis &&
      globalThis.localStorage
    ) {
      return globalThis.localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

// ---------- Imported Products Library Persistence ----------

export function contextToLibraryEntry(ctx: ImportedWorkspaceContext): ImportedLibraryEntry {
  return {
    schemaVersion: 1,
    canonicalProductId: ctx.canonicalProductId || getCanonicalProductId(ctx.product),
    product: ctx.product,
    importedAt: ctx.importedAt,
    dataSource: ctx.dataSource,
    apiCallsMade: ctx.apiCallsMade,
    estimatedCreditsCharged: ctx.estimatedCreditsCharged,
    canonicalUrl: ctx.canonicalUrl ?? null,
    resolvedUrl: ctx.resolvedUrl ?? null,
  };
}

export function loadImportedLibrary(): ImportedLibraryEntry[] {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(IMPORTED_LIBRARY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: ImportedLibraryEntry[] = [];
    const seen = new Set<string>();
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const entry = item as Partial<ImportedLibraryEntry>;
      if (
        !entry.product ||
        typeof entry.product !== 'object' ||
        typeof entry.product.id !== 'string' ||
        typeof entry.product.name !== 'string'
      ) {
        continue;
      }
      const cid =
        typeof entry.canonicalProductId === 'string' && entry.canonicalProductId.trim()
          ? entry.canonicalProductId.trim()
          : getCanonicalProductId(entry.product);
      if (!cid || seen.has(cid)) continue;
      seen.add(cid);
      out.push({
        schemaVersion: 1,
        canonicalProductId: cid,
        product: entry.product,
        importedAt:
          typeof entry.importedAt === 'string' && entry.importedAt
            ? entry.importedAt
            : entry.product.researchedAt ?? new Date().toISOString(),
        dataSource:
          entry.dataSource === 'kalodata-api' ||
          entry.dataSource === 'server-cache' ||
          entry.dataSource === 'client-cache' ||
          entry.dataSource === 'in-flight-shared' ||
          entry.dataSource === 'existing-workspace'
            ? entry.dataSource
            : 'existing-workspace',
        apiCallsMade: typeof entry.apiCallsMade === 'number' ? entry.apiCallsMade : 0,
        estimatedCreditsCharged:
          typeof entry.estimatedCreditsCharged === 'number' ? entry.estimatedCreditsCharged : 0,
        canonicalUrl: typeof entry.canonicalUrl === 'string' ? entry.canonicalUrl : null,
        resolvedUrl: typeof entry.resolvedUrl === 'string' ? entry.resolvedUrl : null,
      });
    }
    return out;
  } catch {
    return [];
  }
}

export function persistImportedLibrary(entries: ImportedLibraryEntry[]): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(
      IMPORTED_LIBRARY_STORAGE_KEY,
      JSON.stringify(entries.slice(0, IMPORTED_LIBRARY_MAX_ENTRIES))
    );
  } catch {
    // Never disrupt primary storage keys if localStorage is full
  }
}

export function upsertImportedLibraryEntry(
  entries: readonly ImportedLibraryEntry[],
  context: ImportedWorkspaceContext
): ImportedLibraryEntry[] {
  const incoming = contextToLibraryEntry(context);
  const existing = entries.find((e) => e.canonicalProductId === incoming.canonicalProductId);
  const merged: ImportedLibraryEntry = existing
    ? {
        ...incoming,
        // Keep highest provenance if re-opened from existing-workspace after an earlier API import
        dataSource:
          incoming.dataSource === 'existing-workspace' && existing.dataSource !== 'existing-workspace'
            ? existing.dataSource
            : incoming.dataSource,
        apiCallsMade: Math.max(existing.apiCallsMade, incoming.apiCallsMade),
        estimatedCreditsCharged: Math.max(
          existing.estimatedCreditsCharged,
          incoming.estimatedCreditsCharged
        ),
        canonicalUrl: incoming.canonicalUrl ?? existing.canonicalUrl,
        resolvedUrl: incoming.resolvedUrl ?? existing.resolvedUrl,
      }
    : incoming;

  return [merged, ...entries.filter((e) => e.canonicalProductId !== incoming.canonicalProductId)].slice(
    0,
    IMPORTED_LIBRARY_MAX_ENTRIES
  );
}

export function syncProductInImportedLibrary(
  entries: readonly ImportedLibraryEntry[],
  updatedProduct: ResearchProduct
): ImportedLibraryEntry[] {
  const cid = getCanonicalProductId(updatedProduct);
  return entries.map((entry) =>
    entry.canonicalProductId === cid ? { ...entry, product: updatedProduct } : entry
  );
}

// ---------- Similar Product Finder Client Cache ----------

interface CachedSimilarSearchRecord {
  cacheKey: string;
  storedAtMs: number;
  searchedAt: string;
  keyword: string;
  categoryIds: string[];
  candidates: ResearchProduct[];
}

export function buildClientSimilarCacheKey(
  referenceCanonicalId: string,
  keyword: string,
  categoryIds: readonly string[]
): string {
  const cats = [...categoryIds].sort().join(',');
  return `${referenceCanonicalId.trim()}|${cats}|${keyword.trim().toLowerCase()}`;
}

export function loadClientSimilarSearchCache(
  cacheKey: string
): CachedSimilarSearchRecord | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(SIMILAR_PRODUCTS_CACHE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, CachedSimilarSearchRecord> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    const entry = parsed[cacheKey];
    if (!entry || !Array.isArray(entry.candidates)) return null;
    if (Date.now() - entry.storedAtMs > SIMILAR_CLIENT_CACHE_TTL_MS) return null;
    return entry;
  } catch {
    return null;
  }
}

export function persistClientSimilarSearchCache(record: CachedSimilarSearchRecord): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    const raw = storage.getItem(SIMILAR_PRODUCTS_CACHE_STORAGE_KEY);
    const parsed =
      raw && typeof raw === 'string'
        ? (JSON.parse(raw) as Record<string, CachedSimilarSearchRecord> | null) ?? {}
        : {};
    const entries = Object.values(parsed)
      .filter(
        (e) =>
          e &&
          typeof e.cacheKey === 'string' &&
          Date.now() - e.storedAtMs <= SIMILAR_CLIENT_CACHE_TTL_MS &&
          e.cacheKey !== record.cacheKey
      )
      .sort((a, b) => b.storedAtMs - a.storedAtMs)
      .slice(0, SIMILAR_CLIENT_CACHE_MAX_ENTRIES - 1);

    const nextMap: Record<string, CachedSimilarSearchRecord> = {
      [record.cacheKey]: record,
    };
    for (const item of entries) {
      nextMap[item.cacheKey] = item;
    }
    storage.setItem(SIMILAR_PRODUCTS_CACHE_STORAGE_KEY, JSON.stringify(nextMap));
  } catch {
    // Ignore storage quota errors
  }
}

// ---------- Comparison Helpers ----------

function getVerifiedUnitPrice(p: ResearchProduct): { value: number | null; status: DataStatus } {
  const price =
    typeof p.priceThb === 'number' && Number.isFinite(p.priceThb) && p.priceThb > 0
      ? p.priceThb
      : typeof p.kalodataMetrics?.unitPriceThb === 'number' &&
          Number.isFinite(p.kalodataMetrics.unitPriceThb) &&
          p.kalodataMetrics.unitPriceThb > 0
        ? p.kalodataMetrics.unitPriceThb
        : null;
  if (price === null) return { value: null, status: 'unavailable' };
  return { value: price, status: normalizeDataStatus(p.priceStatus ?? 'verified') };
}

function getSalesVolume(p: ResearchProduct): { value: number | null; status: DataStatus } {
  const sales = p.kalodataMetrics?.salesVolume;
  if (typeof sales === 'number' && Number.isFinite(sales) && sales >= 0) {
    return { value: sales, status: normalizeDataStatus(p.salesEvidenceStatus ?? 'verified') };
  }
  return { value: null, status: 'unavailable' };
}

function getGmvRevenue(p: ResearchProduct): { value: number | null; status: DataStatus } {
  const rev = p.kalodataMetrics?.revenueThb;
  if (typeof rev === 'number' && Number.isFinite(rev) && rev >= 0) {
    return { value: rev, status: normalizeDataStatus(p.salesEvidenceStatus ?? 'verified') };
  }
  return { value: null, status: 'unavailable' };
}

function getCommissionInfo(p: ResearchProduct): {
  rate: number | null;
  perSale: number | null;
  status: DataStatus;
} {
  const rate =
    p.commissionVerified &&
    typeof p.commissionRate === 'number' &&
    Number.isFinite(p.commissionRate) &&
    p.commissionRate > 0
      ? p.commissionRate
      : typeof p.kalodataMetrics?.commissionRatePct === 'number' &&
          Number.isFinite(p.kalodataMetrics.commissionRatePct) &&
          p.kalodataMetrics.commissionRatePct > 0
        ? p.kalodataMetrics.commissionRatePct
        : null;

  if (rate === null) {
    return { rate: null, perSale: null, status: 'unavailable' };
  }
  const price = getVerifiedUnitPrice(p).value;
  const perSale =
    p.estimatedCommissionPerSaleThb ??
    (price !== null && price > 0 ? Math.round((price * rate) / 100) : null);
  const status = normalizeDataStatus(
    p.commissionStatus ?? (p.commissionVerified ? 'verified' : 'unverified')
  );
  return { rate, perSale, status };
}

function getCreatorCount(p: ResearchProduct): { value: number | null; status: DataStatus } {
  const c = p.kalodataMetrics?.creatorNumber;
  if (typeof c === 'number' && Number.isFinite(c) && c >= 0) {
    return { value: c, status: normalizeDataStatus(p.competitionStatus ?? 'verified') };
  }
  return { value: null, status: 'unavailable' };
}

function getVideoMetrics(p: ResearchProduct): {
  videoNumber: number | null;
  videoRevenueThb: number | null;
  videoSharePct: number | null;
  avgRevPerVideo: number | null;
  status: DataStatus;
} {
  const m = p.kalodataMetrics;
  const videoNumber =
    typeof m?.videoNumber === 'number' && Number.isFinite(m.videoNumber) && m.videoNumber >= 0
      ? m.videoNumber
      : null;
  const videoRevenueThb =
    typeof m?.videoRevenueThb === 'number' &&
    Number.isFinite(m.videoRevenueThb) &&
    m.videoRevenueThb >= 0
      ? m.videoRevenueThb
      : null;
  const gmv =
    typeof m?.revenueThb === 'number' && Number.isFinite(m.revenueThb) && m.revenueThb > 0
      ? m.revenueThb
      : null;
  const videoSharePct =
    videoRevenueThb !== null && gmv !== null
      ? Math.round((videoRevenueThb / gmv) * 1000) / 10
      : null;
  const avgRevPerVideo =
    videoRevenueThb !== null && videoNumber !== null && videoNumber > 0
      ? Math.round(videoRevenueThb / videoNumber)
      : null;

  const status: DataStatus =
    videoNumber !== null && videoRevenueThb !== null
      ? 'verified'
      : videoNumber !== null || videoRevenueThb !== null
        ? 'estimated'
        : 'unavailable';

  return { videoNumber, videoRevenueThb, videoSharePct, avgRevPerVideo, status };
}

export function describeCandidateOrigin(
  origin: ComparisonCandidateOrigin
): { en: string; my: string } {
  switch (origin) {
    case 'kalodata-api':
      return { en: 'Imported (Kalodata API)', my: 'Import (Kalodata API)' };
    case 'server-cache':
      return { en: 'Imported (Server Cache)', my: 'Import (Server Cache)' };
    case 'client-cache':
      return { en: 'Imported (Browser Cache)', my: 'Import (Browser Cache)' };
    case 'in-flight-shared':
      return { en: 'Imported (Shared Request)', my: 'Import (Shared Request)' };
    case 'existing-workspace':
      return { en: 'Imported (Workspace)', my: 'Import (Workspace)' };
    case 'kalodata-similar-search':
      return { en: 'Similar Search (Kalodata)', my: 'ဆင်တူရှာဖွေမှု (Kalodata)' };
    case 'workspace-pool':
      return { en: 'Workspace Pool (0 cr)', my: 'Workspace စာရင်း (0 cr)' };
  }
}

function findExtremumId(
  entries: { id: string; val: number | null; status: DataStatus }[],
  mode: 'min' | 'max'
): string | null {
  const valid = entries.filter(
    (e): e is { id: string; val: number; status: DataStatus } =>
      e.val !== null && Number.isFinite(e.val) && e.status !== 'unavailable'
  );
  if (valid.length < 2) return null;
  const values = valid.map((v) => v.val);
  const target = mode === 'min' ? Math.min(...values) : Math.max(...values);
  const allEqual = values.every((v) => v === target);
  if (allEqual) return null;
  return valid.find((v) => v.val === target)?.id ?? null;
}

/**
 * Side-by-side Comparison Matrix specifically structured for Imported Products (>= 2):
 * Covers Price, Sales, GMV, Commission, Creator Competition, Video Performance,
 * Data Source provenance, and Verification Status without ever fabricating missing metrics.
 */
export function buildImportedComparisonMatrix(
  items: readonly ComparisonCandidateItem[]
): ImportedComparisonMatrix {
  // Strictly deduplicate by canonicalProductId preserving order
  const deduped: ComparisonCandidateItem[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const cid = item.canonicalProductId || getCanonicalProductId(item.product);
    if (!cid || seen.has(cid)) continue;
    seen.add(cid);
    deduped.push({ ...item, canonicalProductId: cid });
  }

  const canCompare = deduped.length >= 2;

  const prices = deduped.map((c) => {
    const info = getVerifiedUnitPrice(c.product);
    return { id: c.canonicalProductId, val: info.value, status: info.status };
  });
  const salesList = deduped.map((c) => {
    const info = getSalesVolume(c.product);
    return { id: c.canonicalProductId, val: info.value, status: info.status };
  });
  const gmvList = deduped.map((c) => {
    const info = getGmvRevenue(c.product);
    return { id: c.canonicalProductId, val: info.value, status: info.status };
  });
  const commList = deduped.map((c) => {
    const info = getCommissionInfo(c.product);
    return { id: c.canonicalProductId, val: info.rate, status: info.status };
  });
  const creatorList = deduped.map((c) => {
    const info = getCreatorCount(c.product);
    return { id: c.canonicalProductId, val: info.value, status: info.status };
  });
  const videoRevList = deduped.map((c) => {
    const info = getVideoMetrics(c.product);
    return {
      id: c.canonicalProductId,
      val: info.videoRevenueThb,
      status: info.videoRevenueThb !== null ? info.status : ('unavailable' as DataStatus),
    };
  });

  const lowestPriceId = findExtremumId(prices, 'min');
  const highestSalesId = findExtremumId(salesList, 'max');
  const highestGmvId = findExtremumId(gmvList, 'max');
  const highestCommissionId = findExtremumId(commList, 'max');
  const lowestCompetitionId = findExtremumId(creatorList, 'min');
  const highestVideoRevenueId = findExtremumId(videoRevList, 'max');

  const checkDiff = (cells: ImportedComparisonCell[]) => {
    if (cells.length < 2) return false;
    return new Set(cells.map((c) => c.valueEn.trim().toLowerCase())).size > 1;
  };

  // 1. Price row
  const priceCells: ImportedComparisonCell[] = deduped.map((item) => {
    const info = getVerifiedUnitPrice(item.product);
    const minP = item.product.kalodataMetrics?.minPriceThb ?? null;
    const maxP = item.product.kalodataMetrics?.maxPriceThb ?? null;
    const skus = item.product.kalodataMetrics?.skuCount ?? null;
    if (info.value === null) {
      return {
        canonicalProductId: item.canonicalProductId,
        valueEn: 'Unavailable',
        valueMy: 'Unavailable',
        status: 'unavailable',
        numericValue: null,
        isBest: false,
      };
    }
    const subParts: string[] = [];
    if (minP !== null && maxP !== null && minP > 0 && maxP > minP) {
      subParts.push(`${formatThb(minP)}–${formatThb(maxP)}`);
    }
    if (skus !== null && skus > 0) {
      subParts.push(`${skus} SKU${skus > 1 ? 's' : ''}`);
    }
    const sub = subParts.join(' · ') || undefined;
    return {
      canonicalProductId: item.canonicalProductId,
      valueEn: formatThb(info.value),
      valueMy: formatThb(info.value),
      subValueEn: sub,
      subValueMy: sub,
      status: info.status,
      numericValue: info.value,
      isBest: lowestPriceId === item.canonicalProductId,
    };
  });

  // 2. Sales row
  const salesCells: ImportedComparisonCell[] = deduped.map((item) => {
    const info = getSalesVolume(item.product);
    const range = item.product.kalodataMetrics?.dateRange ?? null;
    if (info.value === null) {
      return {
        canonicalProductId: item.canonicalProductId,
        valueEn: 'Unavailable',
        valueMy: 'Unavailable',
        status: 'unavailable',
        numericValue: null,
        isBest: false,
      };
    }
    return {
      canonicalProductId: item.canonicalProductId,
      valueEn: `${info.value.toLocaleString('en-US')} units`,
      valueMy: `${info.value.toLocaleString('en-US')} ခု`,
      subValueEn: range ?? undefined,
      subValueMy: range ?? undefined,
      status: info.status,
      numericValue: info.value,
      isBest: highestSalesId === item.canonicalProductId,
    };
  });

  // 3. GMV row
  const gmvCells: ImportedComparisonCell[] = deduped.map((item) => {
    const info = getGmvRevenue(item.product);
    const growth = item.product.kalodataMetrics?.revenueGrowthRate ?? null;
    if (info.value === null) {
      return {
        canonicalProductId: item.canonicalProductId,
        valueEn: 'Unavailable',
        valueMy: 'Unavailable',
        status: 'unavailable',
        numericValue: null,
        isBest: false,
      };
    }
    const growthText =
      typeof growth === 'number' && Number.isFinite(growth)
        ? `${growth >= 0 ? '+' : ''}${growth.toFixed(1)}% growth`
        : undefined;
    const growthTextMy =
      typeof growth === 'number' && Number.isFinite(growth)
        ? `တိုးတက်နှုန်း ${growth >= 0 ? '+' : ''}${growth.toFixed(1)}%`
        : undefined;
    return {
      canonicalProductId: item.canonicalProductId,
      valueEn: formatThb(info.value),
      valueMy: formatThb(info.value),
      subValueEn: growthText,
      subValueMy: growthTextMy,
      status: info.status,
      numericValue: info.value,
      isBest: highestGmvId === item.canonicalProductId,
    };
  });

  // 4. Commission row
  const commissionCells: ImportedComparisonCell[] = deduped.map((item) => {
    const info = getCommissionInfo(item.product);
    if (info.rate === null) {
      return {
        canonicalProductId: item.canonicalProductId,
        valueEn: 'Unavailable',
        valueMy: 'Unavailable',
        status: 'unavailable',
        numericValue: null,
        isBest: false,
      };
    }
    return {
      canonicalProductId: item.canonicalProductId,
      valueEn: `${info.rate}%`,
      valueMy: `${info.rate}%`,
      subValueEn: info.perSale !== null ? `~${formatThb(info.perSale)} / sale` : undefined,
      subValueMy: info.perSale !== null ? `~${formatThb(info.perSale)} / ခု` : undefined,
      status: info.status,
      numericValue: info.rate,
      isBest: highestCommissionId === item.canonicalProductId,
    };
  });

  // 5. Creator Competition row
  const competitionCells: ImportedComparisonCell[] = deduped.map((item) => {
    const info = getCreatorCount(item.product);
    const liveNum = item.product.kalodataMetrics?.liveNumber ?? null;
    if (info.value === null) {
      return {
        canonicalProductId: item.canonicalProductId,
        valueEn: 'Unavailable',
        valueMy: 'Unavailable',
        subValueEn: 'Requires Product Detail',
        subValueMy: 'Product Detail လိုအပ်',
        status: 'unavailable',
        numericValue: null,
        isBest: false,
      };
    }
    const level = item.product.competitionLevel;
    return {
      canonicalProductId: item.canonicalProductId,
      valueEn: `${info.value.toLocaleString('en-US')} creators (${level})`,
      valueMy: `Creator ${info.value.toLocaleString('en-US')} ဦး (${level})`,
      subValueEn: liveNum !== null ? `${liveNum.toLocaleString('en-US')} lives` : undefined,
      subValueMy: liveNum !== null ? `Live ${liveNum.toLocaleString('en-US')} ကြိမ်` : undefined,
      status: info.status,
      numericValue: info.value,
      isBest: lowestCompetitionId === item.canonicalProductId,
    };
  });

  // 6. Video Performance row
  const videoCells: ImportedComparisonCell[] = deduped.map((item) => {
    const info = getVideoMetrics(item.product);
    if (info.status === 'unavailable') {
      return {
        canonicalProductId: item.canonicalProductId,
        valueEn: 'Unavailable',
        valueMy: 'Unavailable',
        status: 'unavailable',
        numericValue: null,
        isBest: false,
      };
    }
    const revStr =
      info.videoRevenueThb !== null ? formatThb(info.videoRevenueThb) : 'Video GMV Unavailable';
    const revStrMy =
      info.videoRevenueThb !== null ? formatThb(info.videoRevenueThb) : 'Video GMV မရရှိ';
    const subPartsEn: string[] = [];
    const subPartsMy: string[] = [];
    if (info.videoNumber !== null) {
      subPartsEn.push(`${info.videoNumber.toLocaleString('en-US')} videos`);
      subPartsMy.push(`Video ${info.videoNumber.toLocaleString('en-US')} ခု`);
    } else {
      subPartsEn.push('Video count N/A');
      subPartsMy.push('Video အရေအတွက် N/A');
    }
    if (info.videoSharePct !== null) {
      subPartsEn.push(`${info.videoSharePct}% of GMV`);
      subPartsMy.push(`GMV ၏ ${info.videoSharePct}%`);
    }
    if (info.avgRevPerVideo !== null) {
      subPartsEn.push(`~${formatThb(info.avgRevPerVideo)}/vid`);
      subPartsMy.push(`~${formatThb(info.avgRevPerVideo)}/vid`);
    }
    return {
      canonicalProductId: item.canonicalProductId,
      valueEn: revStr,
      valueMy: revStrMy,
      subValueEn: subPartsEn.join(' · '),
      subValueMy: subPartsMy.join(' · '),
      status: info.status,
      numericValue: info.videoRevenueThb ?? info.videoNumber,
      isBest: highestVideoRevenueId === item.canonicalProductId,
    };
  });

  // 7. Data Source row
  const sourceCells: ImportedComparisonCell[] = deduped.map((item) => {
    const desc = describeCandidateOrigin(item.origin);
    const hasKalodata = item.origin !== 'workspace-pool' || Boolean(item.product.kalodataMetrics);
    return {
      canonicalProductId: item.canonicalProductId,
      valueEn: desc.en,
      valueMy: desc.my,
      subValueEn: item.originDetailEn ?? `ID ${item.canonicalProductId}`,
      subValueMy: item.originDetailMy ?? `ID ${item.canonicalProductId}`,
      status: hasKalodata ? 'verified' : 'unverified',
      numericValue: null,
      isBest: false,
    };
  });

  // 8. Verification Status summary row
  const trackedMetricCells = [
    priceCells,
    salesCells,
    gmvCells,
    commissionCells,
    competitionCells,
    videoCells,
  ];

  const verificationCells: ImportedComparisonCell[] = deduped.map((item, idx) => {
    let verifiedCount = 0;
    let partialCount = 0;
    let unavailableCount = 0;
    for (const metricRow of trackedMetricCells) {
      const cell = metricRow[idx];
      if (!cell) continue;
      if (cell.status === 'verified') verifiedCount += 1;
      else if (cell.status === 'estimated' || cell.status === 'unverified') partialCount += 1;
      else unavailableCount += 1;
    }
    const overallStatus: DataStatus =
      verifiedCount === trackedMetricCells.length
        ? 'verified'
        : verifiedCount > 0 || partialCount > 0
          ? 'estimated'
          : 'unavailable';
    return {
      canonicalProductId: item.canonicalProductId,
      valueEn: `${verifiedCount}/${trackedMetricCells.length} Verified`,
      valueMy: `အတည်ပြုပြီး ${verifiedCount}/${trackedMetricCells.length}`,
      subValueEn:
        unavailableCount > 0
          ? `${unavailableCount} unavailable${partialCount > 0 ? ` · ${partialCount} partial` : ''}`
          : partialCount > 0
            ? `${partialCount} partial`
            : 'All 6 comparison areas verified',
      subValueMy:
        unavailableCount > 0
          ? `မရရှိ ${unavailableCount} ခု${partialCount > 0 ? ` · တစ်စိတ်တစ်ပိုင်း ${partialCount} ခု` : ''}`
          : partialCount > 0
            ? `တစ်စိတ်တစ်ပိုင်း ${partialCount} ခု`
            : 'အချက် ၆ ချက်လုံး အတည်ပြုပြီး',
      status: overallStatus,
      numericValue: verifiedCount,
      isBest: false,
    };
  });

  const rows: ImportedComparisonRow[] = [
    {
      key: 'price',
      labelEn: 'Price (THB)',
      labelMy: 'ဈေးနှုန်း (THB)',
      cells: priceCells,
      hasDifference: checkDiff(priceCells),
    },
    {
      key: 'sales',
      labelEn: 'Sales Volume',
      labelMy: 'ရောင်းအား (Sales)',
      cells: salesCells,
      hasDifference: checkDiff(salesCells),
    },
    {
      key: 'gmv',
      labelEn: 'GMV (Revenue)',
      labelMy: 'GMV (စုစုပေါင်းဝင်ငွေ)',
      cells: gmvCells,
      hasDifference: checkDiff(gmvCells),
    },
    {
      key: 'commission',
      labelEn: 'Commission Rate',
      labelMy: 'ကော်မရှင် (Commission)',
      cells: commissionCells,
      hasDifference: checkDiff(commissionCells),
    },
    {
      key: 'creatorCompetition',
      labelEn: 'Creator Competition',
      labelMy: 'Creator ပြိုင်ဆိုင်မှု',
      cells: competitionCells,
      hasDifference: checkDiff(competitionCells),
    },
    {
      key: 'videoPerformance',
      labelEn: 'Video Performance',
      labelMy: 'Video စွမ်းဆောင်ရည်',
      cells: videoCells,
      hasDifference: checkDiff(videoCells),
    },
    {
      key: 'dataSource',
      labelEn: 'Data Source',
      labelMy: 'Data Source (အရင်းအမြစ်)',
      cells: sourceCells,
      hasDifference: checkDiff(sourceCells),
    },
    {
      key: 'verificationStatus',
      labelEn: 'Verification Status',
      labelMy: 'Verification Status (အတည်ပြုမှု)',
      cells: verificationCells,
      hasDifference: checkDiff(verificationCells),
    },
  ];

  return {
    columns: deduped,
    canCompare,
    distinctCount: deduped.length,
    rows,
    bestSummary: {
      lowestPriceId,
      highestSalesId,
      highestGmvId,
      highestCommissionId,
      lowestCompetitionId,
      highestVideoRevenueId,
    },
  };
}

/**
 * Computes exact cost preview if any product selected for comparison lacks Product Detail metrics
 * (such as creatorNumber or videoNumber from Rank-only items). Checks local Enrichment Cache first (0 cr).
 */
export function planComparisonDetailEnrichment(
  items: readonly ComparisonCandidateItem[]
): ComparisonEnrichmentPlan {
  const cache = loadEnrichmentCache();
  const missingDetailIds: string[] = [];
  const cachedDetailIds: string[] = [];
  const uncachedDetailIds: string[] = [];

  for (const item of items) {
    const cid = item.canonicalProductId || getCanonicalProductId(item.product);
    if (!cid || missingDetailIds.includes(cid)) continue;
    const hasDetail =
      Boolean(item.product.kalodataMetrics?.detailEnriched) &&
      typeof item.product.kalodataMetrics?.creatorNumber === 'number';
    if (hasDetail) continue;

    missingDetailIds.push(cid);
    if (cache.products[cid]) {
      cachedDetailIds.push(cid);
    } else {
      uncachedDetailIds.push(cid);
    }
  }

  const plannedApiCalls = uncachedDetailIds.length;
  const estimatedCredits =
    Math.round(plannedApiCalls * KALODATA_PRODUCT_DETAIL_CREDIT * 1000) / 1000;
  const estimatedUsd =
    Math.round(estimatedCredits * KALODATA_USD_PER_CREDIT * 10000) / 10000;

  return {
    missingDetailIds,
    cachedDetailIds,
    uncachedDetailIds,
    estimatedCredits,
    estimatedUsd,
    plannedApiCalls,
    requiresConfirmation: plannedApiCalls > 0,
  };
}

// ---------- Similar Product Finder & Honest Classification ----------

const COMPETITION_RANK: Record<string, number> = {
  Low: 1,
  Moderate: 2,
  High: 3,
};

function tokenizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[\[\]()【】（）!！?？@#$%^&*_+=~`|\\/<>,"'“”‘’。、·•★☆]/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2 && !/^\d+$/.test(w));
}

function hydrateWithLocalDetailCache(
  product: ResearchProduct,
  cachedPd: KalodataProductDetailEnrichmentRecord | undefined
): ResearchProduct {
  if (!cachedPd || product.kalodataMetrics?.detailEnriched) return product;
  return mergeEnrichmentIntoProduct(product, {
    productDetail: cachedPd,
  }).product;
}

export function classifySimilarCandidate(
  reference: ResearchProduct,
  candidateRaw: ResearchProduct,
  source: SimilarProductSearchSource
): SimilarProductClassification {
  const cache = loadEnrichmentCache();
  const candCid = getCanonicalProductId(candidateRaw);
  const candidate = hydrateWithLocalDetailCache(candidateRaw, cache.products[candCid]);

  const refPrice = getVerifiedUnitPrice(reference).value;
  const candPriceInfo = getVerifiedUnitPrice(candidate);
  const candPrice = candPriceInfo.status !== 'unavailable' ? candPriceInfo.value : null;

  const refCommInfo = getCommissionInfo(reference);
  const refComm = refCommInfo.status !== 'unavailable' ? refCommInfo.rate : null;
  const candCommInfo = getCommissionInfo(candidate);
  const candComm = candCommInfo.status !== 'unavailable' ? candCommInfo.rate : null;

  const refCreator = getCreatorCount(reference).value;
  const candCreator = getCreatorCount(candidate).value;

  const isCheaperPrice =
    refPrice !== null &&
    refPrice > 0 &&
    candPrice !== null &&
    candPrice > 0 &&
    candPrice < refPrice;
  const priceDeltaThb =
    refPrice !== null && candPrice !== null ? Math.round((refPrice - candPrice) * 100) / 100 : null;
  const priceSavingsPct =
    refPrice !== null && refPrice > 0 && candPrice !== null && isCheaperPrice
      ? Math.round(((refPrice - candPrice) / refPrice) * 1000) / 10
      : null;

  const isBetterCommission =
    refComm !== null &&
    refComm > 0 &&
    candComm !== null &&
    candComm > 0 &&
    candComm > refComm;
  const commissionGainPts =
    refComm !== null && candComm !== null ? Math.round((candComm - refComm) * 100) / 100 : null;

  // Competition rule: STRICT — requires verified Creator Count on BOTH reference & candidate.
  // Never classifies Unavailable competition data as "Lower Competition".
  const isLowerCompetition =
    refCreator !== null &&
    candCreator !== null &&
    candCreator < refCreator;
  const creatorDelta =
    refCreator !== null && candCreator !== null ? refCreator - candCreator : null;
  const competitionRankDelta =
    refCreator !== null && candCreator !== null
      ? (COMPETITION_RANK[reference.competitionLevel] ?? 2) -
        (COMPETITION_RANK[candidate.competitionLevel] ?? 2)
      : null;

  const missingReasonsEn: string[] = [];
  const missingReasonsMy: string[] = [];
  if (candPrice === null || refPrice === null) {
    missingReasonsEn.push('Price unavailable on one or both products');
    missingReasonsMy.push('Product တစ်ခုခုတွင် ဈေးနှုန်းမရရှိနိုင်ပါ');
  }
  if (candComm === null || refComm === null) {
    missingReasonsEn.push('Commission unavailable on one or both products');
    missingReasonsMy.push('Product တစ်ခုခုတွင် Commission မရရှိနိုင်ပါ');
  }
  if (candCreator === null || refCreator === null) {
    missingReasonsEn.push('Creator count unavailable (requires Product Detail)');
    missingReasonsMy.push('Creator အရေအတွက် မရရှိသေးပါ (Product Detail လိုအပ်)');
  }

  const refWords = new Set(tokenizeWords(reference.name));
  const candWords = tokenizeWords(candidate.name);
  let keywordMatchScore = 0;
  for (const w of candWords) {
    if (refWords.has(w)) keywordMatchScore += 1;
  }

  const refPriId = reference.kalodataMetrics?.priCategory?.category_id;
  const candPriId = candidate.kalodataMetrics?.priCategory?.category_id;
  const sharedCategory =
    Boolean(refPriId && candPriId && refPriId === candPriId) ||
    reference.category === candidate.category;

  const sourceLabels: Record<SimilarProductSearchSource, { en: string; my: string }> = {
    'kalodata-similar-search': { en: 'Kalodata Search', my: 'Kalodata ရှာဖွေမှု' },
    'server-cache': { en: 'Server Cache (0 cr)', my: 'Server Cache (0 cr)' },
    'client-cache': { en: 'Browser Cache (0 cr)', my: 'Browser Cache (0 cr)' },
    'workspace-pool': { en: 'Workspace Pool (0 cr)', my: 'Workspace စာရင်း (0 cr)' },
  };

  return {
    candidate,
    canonicalProductId: candCid,
    source,
    sourceLabelEn: sourceLabels[source].en,
    sourceLabelMy: sourceLabels[source].my,
    sharedCategory,
    keywordMatchScore,
    isCheaperPrice,
    priceDeltaThb,
    priceSavingsPct,
    isBetterCommission,
    commissionGainPts,
    isLowerCompetition,
    creatorDelta,
    competitionRankDelta,
    missingReasonsEn,
    missingReasonsMy,
  };
}

/**
 * Collects zero-credit similar candidates from already-fetched workspace pools
 * (Imported Library, Current Results, Saved Products, Research History) sharing category or keywords.
 */
export function collectLocalSimilarCandidates(
  reference: ResearchProduct,
  workspacePools: {
    importedProducts?: readonly ResearchProduct[];
    liveResults?: readonly ResearchProduct[];
    savedProducts?: readonly ResearchProduct[];
    historyProducts?: readonly ResearchProduct[];
  }
): ResearchProduct[] {
  const refCid = getCanonicalProductId(reference);
  const refWords = new Set(tokenizeWords(reference.name));
  const refCat = reference.category;
  const refPriId = reference.kalodataMetrics?.priCategory?.category_id;

  const seen = new Set<string>([refCid]);
  const pool: { product: ResearchProduct; score: number }[] = [];

  const allSources = [
    ...(workspacePools.importedProducts ?? []),
    ...(workspacePools.liveResults ?? []),
    ...(workspacePools.savedProducts ?? []),
    ...(workspacePools.historyProducts ?? []),
  ];

  for (const cand of allSources) {
    const cid = getCanonicalProductId(cand);
    if (!cid || seen.has(cid)) continue;
    seen.add(cid);

    const candWords = tokenizeWords(cand.name);
    let overlap = 0;
    for (const w of candWords) {
      if (refWords.has(w)) overlap += 1;
    }
    const candPriId = cand.kalodataMetrics?.priCategory?.category_id;
    const sameCategory =
      (refPriId && candPriId && refPriId === candPriId) || cand.category === refCat;

    if (!sameCategory && overlap === 0) continue;

    const matchScore = (sameCategory ? 3 : 0) + overlap * 2;
    pool.push({ product: cand, score: matchScore });
  }

  pool.sort(
    (a, b) =>
      b.score - a.score ||
      (b.product.kalodataMetrics?.revenueThb ?? 0) - (a.product.kalodataMetrics?.revenueThb ?? 0)
  );
  return pool.map((p) => p.product);
}

/**
 * Evaluates & classifies all available similar candidates (Server/Cache + Local Workspace Pool),
 * deduplicating by canonicalProductId and returning bucket counts & honest reference limitations.
 */
export function evaluateSimilarFinderResults(
  reference: ResearchProduct,
  inputs: {
    apiCandidates?: readonly ResearchProduct[];
    apiSource?: Exclude<SimilarProductSearchSource, 'workspace-pool'>;
    localCandidates?: readonly ResearchProduct[];
  }
): SimilarFinderEvaluation {
  const refCid = getCanonicalProductId(reference);
  const refPrice = getVerifiedUnitPrice(reference).value;
  const refCommInfo = getCommissionInfo(reference);
  const refComm = refCommInfo.status !== 'unavailable' ? refCommInfo.rate : null;
  const refCreators = getCreatorCount(reference).value;

  const merged: { product: ResearchProduct; source: SimilarProductSearchSource }[] = [];
  const seen = new Set<string>([refCid]);

  for (const p of inputs.apiCandidates ?? []) {
    const cid = getCanonicalProductId(p);
    if (!cid || seen.has(cid)) continue;
    seen.add(cid);
    merged.push({
      product: p,
      source: inputs.apiSource ?? 'kalodata-similar-search',
    });
  }

  for (const p of inputs.localCandidates ?? []) {
    const cid = getCanonicalProductId(p);
    if (!cid || seen.has(cid)) continue;
    seen.add(cid);
    merged.push({
      product: p,
      source: 'workspace-pool',
    });
  }

  const items = merged.map((entry) =>
    classifySimilarCandidate(reference, entry.product, entry.source)
  );

  // Sort by relevance: category + keyword match + number of beneficial buckets + revenue
  items.sort((a, b) => {
    const aWins =
      (a.isCheaperPrice ? 1 : 0) +
      (a.isBetterCommission ? 1 : 0) +
      (a.isLowerCompetition ? 1 : 0);
    const bWins =
      (b.isCheaperPrice ? 1 : 0) +
      (b.isBetterCommission ? 1 : 0) +
      (b.isLowerCompetition ? 1 : 0);
    return (
      b.keywordMatchScore - a.keywordMatchScore ||
      bWins - aWins ||
      (b.candidate.kalodataMetrics?.revenueThb ?? 0) -
        (a.candidate.kalodataMetrics?.revenueThb ?? 0)
    );
  });

  const referenceLimitationsEn: string[] = [];
  const referenceLimitationsMy: string[] = [];
  if (refPrice === null) {
    referenceLimitationsEn.push(
      `Reference product price is unavailable, so "Cheaper Price" cannot be verified.`
    );
    referenceLimitationsMy.push(
      `မူရင်း Product တွင် ဈေးနှုန်းမပါရှိသဖြင့် "ပိုသက်သာတဲ့ဈေး" ကို နှိုင်းယှဉ်၍ မရနိုင်ပါ။`
    );
  }
  if (refComm === null) {
    referenceLimitationsEn.push(
      `Reference product commission rate is unavailable, so "Better Commission" cannot be verified.`
    );
    referenceLimitationsMy.push(
      `မူရင်း Product တွင် Commission Rate မပါရှိသဖြင့် "Commission ပိုကောင်း" ကို နှိုင်းယှဉ်၍ မရနိုင်ပါ။`
    );
  }
  if (refCreators === null) {
    referenceLimitationsEn.push(
      `Reference product Creator Count is unavailable (needs Product Detail), so "Lower Competition" cannot be verified.`
    );
    referenceLimitationsMy.push(
      `မူရင်း Product တွင် Creator အရေအတွက် (Product Detail) မပါရှိသေးသဖြင့် "Competition နည်း" ကို နှိုင်းယှဉ်၍ မရနိုင်ပါ။`
    );
  }

  return {
    referenceCanonicalId: refCid,
    referencePriceThb: refPrice,
    referenceCommissionRate: refComm,
    referenceCreatorNumber: refCreators,
    items,
    counts: {
      all: items.length,
      cheaperPrice: items.filter((i) => i.isCheaperPrice).length,
      betterCommission: items.filter((i) => i.isBetterCommission).length,
      lowerCompetition: items.filter((i) => i.isLowerCompetition).length,
    },
    referenceLimitationsEn,
    referenceLimitationsMy,
  };
}

export function filterSimilarFinderItems(
  items: readonly SimilarProductClassification[],
  filter: SimilarBucketFilter
): SimilarProductClassification[] {
  switch (filter) {
    case 'cheaper-price':
      return items
        .filter((i) => i.isCheaperPrice)
        .sort((a, b) => (b.priceDeltaThb ?? 0) - (a.priceDeltaThb ?? 0));
    case 'better-commission':
      return items
        .filter((i) => i.isBetterCommission)
        .sort((a, b) => (b.commissionGainPts ?? 0) - (a.commissionGainPts ?? 0));
    case 'lower-competition':
      return items
        .filter((i) => i.isLowerCompetition)
        .sort((a, b) => (b.creatorDelta ?? 0) - (a.creatorDelta ?? 0));
    case 'all':
    default:
      return [...items];
  }
}

export function getCategoryShortLabelForProduct(
  product: ResearchProduct,
  lang: 'en' | 'my'
): string {
  return getCategoryLabel(product.category, lang, { short: true });
}
