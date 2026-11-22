import type {
  ComparisonMetricDelta,
  GroundingSourceLink,
  LocalStorageUsageStats,
  MyanmarReviewDiscoveryStats,
  MyanmarVideoDiscoveryStats,
  ProductCategory,
  ProductComparisonRow,
  ProductScoreSnapshot,
  ResearchComparisonResult,
  ResearchConfig,
  ResearchCostSummary,
  ResearchHistoryRecord,
  ResearchMode,
  ResearchProduct,
  ResearchQuantity,
  ResearchSessionResponse,
  StorageWriteResult,
} from '../types/product.ts';
import {
  buildProductScoreSnapshot,
  evaluateProductBatch,
  evaluateProductOpportunity,
  getCanonicalProductId,
} from './scoring.ts';
import {
  SAVED_PRODUCTS_LEGACY_KEY,
  SAVED_PRODUCTS_STORAGE_KEY,
} from './savedProductsStorage.ts';
import { isValidProductCategory } from './categoryRegistry.ts';
import { isSafeHttpUrl } from './format.ts';

export const RESEARCH_HISTORY_STORAGE_KEY = 'siampick_research_history_v1';
export const RESEARCH_HISTORY_SCHEMA_VERSION = 1;
export const LATEST_RESEARCH_SESSION_STORAGE_KEY = 'siampick_latest_research_session_v1';
export const LATEST_RESEARCH_SESSION_SCHEMA_VERSION = 1;
export const ESTIMATED_LOCAL_STORAGE_QUOTA_BYTES = 5 * 1024 * 1024; // ~5 MB standard browser localStorage budget

export interface LatestResearchSessionMeta {
  requestedQuantity: ResearchQuantity;
  verifiedProductCount: number;
  filteredOutCount: number;
  myanmarFilterApplied?: boolean;
  myanmarCandidatesScanned?: number;
  myanmarReviewDiscovery?: MyanmarReviewDiscoveryStats;
  myanmarVideoDiscovery?: MyanmarVideoDiscoveryStats;
}

export interface LatestResearchSessionSnapshot {
  schemaVersion: number;
  updatedAt: string;
  products: ResearchProduct[];
  sessionMeta: LatestResearchSessionMeta;
  lastCostSummary: ResearchCostSummary | null;
  researchSourceMode: 'kalodata-openapi' | null;
  researchedAt: string | null;
  groundingSources: GroundingSourceLink[];
  searchQueries: string[];
  activeHuntConfig: ResearchConfig | null;
  rejectedIds: string[];
}

interface ResearchHistoryEnvelopeV1 {
  schemaVersion: number;
  updatedAt: string;
  records: ResearchHistoryRecord[];
}

function getStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) {
      return globalThis.localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

function isQuotaExceededError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; code?: number; message?: string };
  return (
    e.name === 'QuotaExceededError' ||
    e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    e.code === 22 ||
    e.code === 1014 ||
    (typeof e.message === 'string' && e.message.toLowerCase().includes('quota'))
  );
}

function byteSizeOfString(str: string | null): number {
  if (!str) return 0;
  // UTF-16 code units in Web Storage consume ~2 bytes per character
  return str.length * 2;
}

function isValidProduct(value: unknown): value is ResearchProduct {
  if (!value || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  return typeof p.id === 'string' && p.id.length > 0 && typeof p.name === 'string';
}

function isValidHistoryRecord(value: unknown): value is ResearchHistoryRecord {
  if (!value || typeof value !== 'object') return false;
  const rec = value as Record<string, unknown>;
  if (typeof rec.id !== 'string' || !rec.id) return false;
  if (typeof rec.researchedAt !== 'string' || !rec.researchedAt) return false;
  if (!Array.isArray(rec.products)) return false;
  if (!rec.researchSettings || typeof rec.researchSettings !== 'object') return false;
  return true;
}

function normalizeArchivedProduct(product: ResearchProduct): ResearchProduct {
  const validOriginUrl = isSafeHttpUrl(product.imageOriginUrl)
    ? product.imageOriginUrl.trim()
    : null;
  const recoveredImageUrl =
    product.imageUrl ||
    (validOriginUrl ? `/api/image-proxy?url=${encodeURIComponent(validOriginUrl)}` : null);

  return {
    ...product,
    imageUrl: recoveredImageUrl,
    imageVerified: Boolean(product.imageVerified || recoveredImageUrl),
    priceThb:
      typeof product.priceThb === 'number' && Number.isFinite(product.priceThb)
        ? product.priceThb
        : null,
    sources: Array.isArray(product.sources) ? product.sources : [],
    reviewStrengthsEn: Array.isArray(product.reviewStrengthsEn) ? product.reviewStrengthsEn : [],
    reviewStrengthsMy: Array.isArray(product.reviewStrengthsMy) ? product.reviewStrengthsMy : [],
    customerComplaintsEn: Array.isArray(product.customerComplaintsEn)
      ? product.customerComplaintsEn
      : [],
    customerComplaintsMy: Array.isArray(product.customerComplaintsMy)
      ? product.customerComplaintsMy
      : [],
    demandEvidenceEn: Array.isArray(product.demandEvidenceEn) ? product.demandEvidenceEn : [],
    demandEvidenceMy: Array.isArray(product.demandEvidenceMy) ? product.demandEvidenceMy : [],
    generalRisksEn: Array.isArray(product.generalRisksEn) ? product.generalRisksEn : [],
    generalRisksMy: Array.isArray(product.generalRisksMy) ? product.generalRisksMy : [],
    missingDataEn: Array.isArray(product.missingDataEn) ? product.missingDataEn : [],
    missingDataMy: Array.isArray(product.missingDataMy) ? product.missingDataMy : [],
    videoIdeas: Array.isArray(product.videoIdeas)
      ? product.videoIdeas
      : ([] as unknown as ResearchProduct['videoIdeas']),
  };
}

function normalizeHistoryRecord(raw: ResearchHistoryRecord): ResearchHistoryRecord {
  const validProducts = raw.products.filter(isValidProduct).map(normalizeArchivedProduct);
  const mode: ResearchMode =
    raw.researchMode === 'balanced' || raw.researchMode === 'deep' ? raw.researchMode : 'fast';
  const categories: ProductCategory[] = Array.isArray(raw.selectedCategories)
    ? raw.selectedCategories.filter((c): c is ProductCategory => isValidProductCategory(c))
    : isValidProductCategory(raw.researchSettings.category)
      ? [raw.researchSettings.category]
      : ['womens-fashion', 'cosmetics-beauty'];

  const selectedSubcategoryIds = Array.isArray(raw.selectedSubcategoryIds)
    ? raw.selectedSubcategoryIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    : Array.isArray(raw.researchSettings.selectedSubcategoryIds)
      ? raw.researchSettings.selectedSubcategoryIds.filter(
          (id): id is string => typeof id === 'string' && id.trim().length > 0
        )
      : undefined;

  const selectedSubcategoryNames = Array.isArray(raw.selectedSubcategoryNames)
    ? raw.selectedSubcategoryNames.filter(
        (name): name is string => typeof name === 'string' && name.trim().length > 0
      )
    : Array.isArray(raw.researchSettings.selectedSubcategoryNames)
      ? raw.researchSettings.selectedSubcategoryNames.filter(
          (name): name is string => typeof name === 'string' && name.trim().length > 0
        )
      : undefined;

  const salesWeightPct =
    typeof raw.researchSettings.salesWeightPct === 'number' &&
    Number.isFinite(raw.researchSettings.salesWeightPct)
      ? raw.researchSettings.salesWeightPct
      : 50;

  let scoreSnapshots: Record<string, ProductScoreSnapshot> =
    raw.scoreSnapshots && typeof raw.scoreSnapshots === 'object' ? { ...raw.scoreSnapshots } : {};

  // Ensure every product has a valid score snapshot (useful for future schema upgrades)
  const needsBackfill = validProducts.some((p) => !scoreSnapshots[p.id]);
  if (needsBackfill && validProducts.length > 0) {
    const evalMap = evaluateProductBatch(validProducts, {
      salesWeightPct,
      strategyPreset: raw.researchSettings.strategyPreset,
    });
    for (const p of validProducts) {
      if (!scoreSnapshots[p.id]) {
        const ev = evalMap.get(p.id);
        if (ev) {
          scoreSnapshots[p.id] = buildProductScoreSnapshot(p, ev);
        }
      }
    }
  }

  return {
    ...raw,
    schemaVersion:
      typeof raw.schemaVersion === 'number'
        ? raw.schemaVersion
        : RESEARCH_HISTORY_SCHEMA_VERSION,
    researchMode: mode,
    selectedCategories:
      categories.length > 0 ? categories : ['womens-fashion', 'cosmetics-beauty'],
    ...(selectedSubcategoryIds && selectedSubcategoryIds.length > 0
      ? { selectedSubcategoryIds }
      : {}),
    ...(selectedSubcategoryNames && selectedSubcategoryNames.length > 0
      ? { selectedSubcategoryNames }
      : {}),
    bothCategoryMode: raw.bothCategoryMode === 'split' ? 'split' : 'combined',
    requestedQuantity:
      typeof raw.requestedQuantity === 'number' && Number.isFinite(raw.requestedQuantity)
        ? raw.requestedQuantity
        : validProducts.length,
    productCount: validProducts.length,
    filteredOutCount:
      typeof raw.filteredOutCount === 'number' && Number.isFinite(raw.filteredOutCount)
        ? raw.filteredOutCount
        : 0,
    estimatedCredits:
      typeof raw.estimatedCredits === 'number' && Number.isFinite(raw.estimatedCredits)
        ? raw.estimatedCredits
        : raw.costSummary?.estimatedCredits ?? null,
    estimatedUsd:
      typeof raw.estimatedUsd === 'number' && Number.isFinite(raw.estimatedUsd)
        ? raw.estimatedUsd
        : raw.costSummary?.estimatedUsd ?? null,
    actualCredits:
      typeof raw.actualCredits === 'number' && Number.isFinite(raw.actualCredits)
        ? raw.actualCredits
        : raw.costSummary?.actualCredits ?? null,
    actualUsd:
      typeof raw.actualUsd === 'number' && Number.isFinite(raw.actualUsd)
        ? raw.actualUsd
        : raw.costSummary?.actualUsd ?? null,
    costSummary: raw.costSummary ?? null,
    researchSourceMode: raw.researchSourceMode ?? 'kalodata-openapi',
    searchQueries: Array.isArray(raw.searchQueries) ? raw.searchQueries : [],
    groundingSources: Array.isArray(raw.groundingSources) ? raw.groundingSources : [],
    products: validProducts,
    scoreSnapshots,
  };
}

/**
 * Loads all archived Research History records from localStorage safely.
 * Corrupted JSON or invalid entries never crash the application.
 */
export function loadResearchHistory(): ResearchHistoryRecord[] {
  const storage = getStorage();
  if (!storage) return [];

  try {
    const raw = storage.getItem(RESEARCH_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);

    let list: unknown[] = [];
    if (Array.isArray(parsed)) {
      list = parsed;
    } else if (parsed && typeof parsed === 'object') {
      const env = parsed as Partial<ResearchHistoryEnvelopeV1>;
      if (Array.isArray(env.records)) {
        list = env.records;
      }
    }

    return list
      .filter(isValidHistoryRecord)
      .map(normalizeHistoryRecord)
      .sort(
        (a, b) => new Date(b.researchedAt).getTime() - new Date(a.researchedAt).getTime()
      );
  } catch {
    return [];
  }
}

/**
 * Persists the complete Research History list to browser localStorage.
 * NEVER auto-deletes existing records if storage quota is full — instead returns
 * a clear QuotaExceeded error so the user can choose which records to delete.
 */
export function persistResearchHistory(records: ResearchHistoryRecord[]): StorageWriteResult {
  const storage = getStorage();
  if (!storage) {
    return {
      ok: false,
      quotaExceeded: false,
      bytesUsed: 0,
      errorEn: 'Browser localStorage is unavailable in this environment.',
      errorMy: 'ဤ Browser တွင် localStorage အသုံးပြု၍ မရပါ။',
    };
  }

  const envelope: ResearchHistoryEnvelopeV1 = {
    schemaVersion: RESEARCH_HISTORY_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    records,
  };

  try {
    const serialized = JSON.stringify(envelope);
    storage.setItem(RESEARCH_HISTORY_STORAGE_KEY, serialized);
    return {
      ok: true,
      quotaExceeded: false,
      bytesUsed: byteSizeOfString(serialized),
    };
  } catch (err) {
    const quotaExceeded = isQuotaExceededError(err);
    return {
      ok: false,
      quotaExceeded,
      bytesUsed: 0,
      errorEn: quotaExceeded
        ? 'Browser localStorage quota is full. Previous Research History was kept intact — please delete older History records to save new runs.'
        : 'Unable to persist Research History to browser localStorage.',
      errorMy: quotaExceeded
        ? 'Browser localStorage နေရာပြည့်နေပါသည်။ အရင် History များကို အလိုအလျောက်မဖျက်ထားပါ — Research အသစ်သိမ်းရန် အဟောင်းဖြစ်သော History အချို့ကို ရွေးချယ်ဖျက်ပေးပါ။'
        : 'Research History ကို Browser localStorage ထဲသို့ သိမ်းဆည်း၍ မရပါ။',
    };
  }
}

function buildSnapshotFromHistoryRecord(
  record: ResearchHistoryRecord
): LatestResearchSessionSnapshot {
  const validProducts = record.products.filter(isValidProduct).map(normalizeArchivedProduct);
  return {
    schemaVersion: LATEST_RESEARCH_SESSION_SCHEMA_VERSION,
    updatedAt: record.researchedAt,
    products: validProducts,
    sessionMeta: {
      requestedQuantity: record.requestedQuantity,
      verifiedProductCount: validProducts.length,
      filteredOutCount: record.filteredOutCount,
      myanmarFilterApplied: record.researchSettings.myanmarLanguageOnly === true,
    },
    lastCostSummary: record.costSummary ?? null,
    researchSourceMode:
      record.researchSourceMode === 'kalodata-openapi' ? 'kalodata-openapi' : null,
    researchedAt: record.researchedAt,
    groundingSources: Array.isArray(record.groundingSources) ? record.groundingSources : [],
    searchQueries: Array.isArray(record.searchQueries) ? record.searchQueries : [],
    activeHuntConfig: record.researchSettings ?? null,
    rejectedIds: [],
  };
}

/**
 * Loads the latest Research Results session from localStorage so closing and reopening
 * the app always preserves the most recent search results.
 * Falls back to the newest Research History record if no dedicated session snapshot exists yet.
 */
export function loadLatestResearchSession(
  fallbackHistory?: readonly ResearchHistoryRecord[]
): LatestResearchSessionSnapshot | null {
  const storage = getStorage();
  if (storage) {
    try {
      const raw = storage.getItem(LATEST_RESEARCH_SESSION_STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const obj = parsed as Partial<LatestResearchSessionSnapshot>;
          if (Array.isArray(obj.products) && obj.sessionMeta && typeof obj.sessionMeta === 'object') {
            const validProducts = obj.products.filter(isValidProduct).map(normalizeArchivedProduct);
            const meta = obj.sessionMeta;
            const requestedQuantity =
              typeof meta.requestedQuantity === 'number' && Number.isFinite(meta.requestedQuantity)
                ? meta.requestedQuantity
                : validProducts.length;
            const verifiedProductCount =
              typeof meta.verifiedProductCount === 'number' &&
              Number.isFinite(meta.verifiedProductCount)
                ? meta.verifiedProductCount
                : validProducts.length;
            const filteredOutCount =
              typeof meta.filteredOutCount === 'number' && Number.isFinite(meta.filteredOutCount)
                ? meta.filteredOutCount
                : 0;

            return {
              schemaVersion:
                typeof obj.schemaVersion === 'number'
                  ? obj.schemaVersion
                  : LATEST_RESEARCH_SESSION_SCHEMA_VERSION,
              updatedAt:
                typeof obj.updatedAt === 'string' && obj.updatedAt
                  ? obj.updatedAt
                  : typeof obj.researchedAt === 'string' && obj.researchedAt
                    ? obj.researchedAt
                    : new Date().toISOString(),
              products: validProducts,
              sessionMeta: {
                requestedQuantity,
                verifiedProductCount,
                filteredOutCount,
                myanmarFilterApplied: meta.myanmarFilterApplied === true,
                myanmarCandidatesScanned:
                  typeof meta.myanmarCandidatesScanned === 'number'
                    ? meta.myanmarCandidatesScanned
                    : undefined,
                myanmarReviewDiscovery: meta.myanmarReviewDiscovery,
                myanmarVideoDiscovery: meta.myanmarVideoDiscovery,
              },
              lastCostSummary: obj.lastCostSummary ?? null,
              researchSourceMode:
                obj.researchSourceMode === 'kalodata-openapi' ? 'kalodata-openapi' : null,
              researchedAt: typeof obj.researchedAt === 'string' ? obj.researchedAt : null,
              groundingSources: Array.isArray(obj.groundingSources) ? obj.groundingSources : [],
              searchQueries: Array.isArray(obj.searchQueries) ? obj.searchQueries : [],
              activeHuntConfig:
                obj.activeHuntConfig && typeof obj.activeHuntConfig === 'object'
                  ? obj.activeHuntConfig
                  : null,
              rejectedIds: Array.isArray(obj.rejectedIds)
                ? obj.rejectedIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
                : [],
            };
          }
        }
      }
    } catch {
      // Corrupted JSON falls through safely to history fallback or null
    }
  }

  if (Array.isArray(fallbackHistory) && fallbackHistory.length > 0 && fallbackHistory[0]) {
    return buildSnapshotFromHistoryRecord(fallbackHistory[0]);
  }
  return null;
}

/**
 * Persists (replaces) the latest Research Results snapshot in localStorage.
 * Strictly isolated from Saved Products and Research History; never deletes them on quota errors.
 */
export function persistLatestResearchSession(
  snapshot: Omit<LatestResearchSessionSnapshot, 'schemaVersion' | 'updatedAt'>
): StorageWriteResult {
  const storage = getStorage();
  if (!storage) {
    return {
      ok: false,
      quotaExceeded: false,
      bytesUsed: 0,
      errorEn: 'Browser localStorage is unavailable in this environment.',
      errorMy: 'ဤ Browser တွင် localStorage အသုံးပြု၍ မရပါ။',
    };
  }

  const payload: LatestResearchSessionSnapshot = {
    schemaVersion: LATEST_RESEARCH_SESSION_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    ...snapshot,
  };

  try {
    const serialized = JSON.stringify(payload);
    storage.setItem(LATEST_RESEARCH_SESSION_STORAGE_KEY, serialized);
    return {
      ok: true,
      quotaExceeded: false,
      bytesUsed: byteSizeOfString(serialized),
    };
  } catch (err) {
    const quotaExceeded = isQuotaExceededError(err);
    return {
      ok: false,
      quotaExceeded,
      bytesUsed: 0,
      errorEn: quotaExceeded
        ? 'Browser localStorage quota is full — latest Research Results could not be cached.'
        : 'Unable to persist latest Research Results to browser localStorage.',
      errorMy: quotaExceeded
        ? 'Browser localStorage နေရာပြည့်နေသောကြောင့် နောက်ဆုံး Research Result ကို သိမ်းဆည်း၍ မရပါ။'
        : 'နောက်ဆုံး Research Result ကို Browser localStorage ထဲသို့ သိမ်းဆည်း၍ မရပါ။',
    };
  }
}

export function clearLatestResearchSession(): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(LATEST_RESEARCH_SESSION_STORAGE_KEY);
  } catch {
    // Ignore storage removal errors
  }
}

function generateResearchId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 7);
  return `res_${ts}_${rand}`;
}

/**
 * Builds an immutable ResearchHistoryRecord from a completed live research response.
 * Captures every Kalodata metric, AI analysis, Phase 2 7-Factor Score & Breakdown, Data Confidence,
 * Cost Summary (Estimated & Actual), and Research Settings.
 */
export function createResearchHistoryRecord(
  response: ResearchSessionResponse,
  fallbackConfig: ResearchConfig
): ResearchHistoryRecord {
  const config: ResearchConfig = response.config ?? fallbackConfig;
  const researchedAt = response.researchedAt || new Date().toISOString();
  const researchMode: ResearchMode =
    response.costSummary?.researchMode ?? config.researchMode ?? 'fast';

  const selectedCategories: ProductCategory[] =
    Array.isArray(config.selectedCategories) && config.selectedCategories.length > 0
      ? config.selectedCategories.filter((c): c is ProductCategory => isValidProductCategory(c))
      : isValidProductCategory(config.category)
        ? [config.category]
        : ['womens-fashion', 'cosmetics-beauty'];

  const selectedSubcategoryIds = Array.isArray(config.selectedSubcategoryIds)
    ? config.selectedSubcategoryIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    : undefined;
  const selectedSubcategoryNames = Array.isArray(config.selectedSubcategoryNames)
    ? config.selectedSubcategoryNames.filter(
        (name): name is string => typeof name === 'string' && name.trim().length > 0
      )
    : undefined;

  const clonedProducts: ResearchProduct[] = response.products.map((p) => ({
    ...p,
    kalodataMetrics: p.kalodataMetrics ? { ...p.kalodataMetrics } : undefined,
    sources: Array.isArray(p.sources) ? p.sources.map((s) => ({ ...s })) : [],
  }));

  const evalMap = evaluateProductBatch(clonedProducts, {
    salesWeightPct: config.salesWeightPct,
    strategyPreset: config.strategyPreset,
  });

  const scoreSnapshots: Record<string, ProductScoreSnapshot> = {};
  for (const p of clonedProducts) {
    const ev = evalMap.get(p.id);
    if (ev) {
      p.opportunityScore = ev.totalScore;
      p.confidenceLevel = ev.confidenceLevel;
      scoreSnapshots[p.id] = buildProductScoreSnapshot(p, ev);
    }
  }

  return {
    id: generateResearchId(),
    schemaVersion: RESEARCH_HISTORY_SCHEMA_VERSION,
    researchedAt,
    researchMode,
    selectedCategories:
      selectedCategories.length > 0 ? selectedCategories : ['womens-fashion', 'cosmetics-beauty'],
    ...(selectedSubcategoryIds && selectedSubcategoryIds.length > 0
      ? { selectedSubcategoryIds }
      : {}),
    ...(selectedSubcategoryNames && selectedSubcategoryNames.length > 0
      ? { selectedSubcategoryNames }
      : {}),
    bothCategoryMode: config.bothCategoryMode === 'split' ? 'split' : 'combined',
    requestedQuantity: response.requestedQuantity ?? config.quantity,
    productCount: clonedProducts.length,
    filteredOutCount: response.filteredOutCount ?? 0,
    estimatedCredits: response.costSummary?.estimatedCredits ?? null,
    estimatedUsd: response.costSummary?.estimatedUsd ?? null,
    actualCredits: response.costSummary?.actualCredits ?? null,
    actualUsd: response.costSummary?.actualUsd ?? null,
    costSummary: response.costSummary ? { ...response.costSummary } : null,
    researchSettings: {
      ...config,
      selectedCategories:
        selectedCategories.length > 0 ? selectedCategories : ['womens-fashion', 'cosmetics-beauty'],
    },
    researchSourceMode: response.researchSourceMode ?? 'kalodata-openapi',
    searchQueries: Array.isArray(response.searchQueries) ? [...response.searchQueries] : [],
    groundingSources: Array.isArray(response.groundingSources)
      ? response.groundingSources.map((g) => ({ ...g }))
      : [],
    products: clonedProducts,
    scoreSnapshots,
  };
}

/**
 * Computes real byte sizes of SiamPick's localStorage keys so users can monitor storage usage.
 */
export function getLocalStorageUsageStats(
  historyCountOverride?: number,
  savedCountOverride?: number
): LocalStorageUsageStats {
  const storage = getStorage();
  if (!storage) {
    return {
      historyBytes: 0,
      savedBytes: 0,
      otherSiamPickBytes: 0,
      totalBytes: 0,
      estimatedQuotaBytes: ESTIMATED_LOCAL_STORAGE_QUOTA_BYTES,
      usagePct: 0,
      historyCount: historyCountOverride ?? 0,
      savedCount: savedCountOverride ?? 0,
    };
  }

  let historyBytes = 0;
  let savedBytes = 0;
  let otherSiamPickBytes = 0;

  try {
    historyBytes = byteSizeOfString(storage.getItem(RESEARCH_HISTORY_STORAGE_KEY));
    savedBytes =
      byteSizeOfString(storage.getItem(SAVED_PRODUCTS_STORAGE_KEY)) +
      byteSizeOfString(storage.getItem(SAVED_PRODUCTS_LEGACY_KEY));

    for (let i = 0; i < storage.length; i += 1) {
      const k = storage.key(i);
      if (!k) continue;
      if (
        k === RESEARCH_HISTORY_STORAGE_KEY ||
        k === SAVED_PRODUCTS_STORAGE_KEY ||
        k === SAVED_PRODUCTS_LEGACY_KEY
      ) {
        continue;
      }
      if (k.startsWith('siampick_')) {
        otherSiamPickBytes += byteSizeOfString(storage.getItem(k));
      }
    }
  } catch {
    // Ignore storage inspection error
  }

  const totalBytes = historyBytes + savedBytes + otherSiamPickBytes;
  const usagePct = Math.min(
    100,
    Math.round((totalBytes / ESTIMATED_LOCAL_STORAGE_QUOTA_BYTES) * 1000) / 10
  );

  return {
    historyBytes,
    savedBytes,
    otherSiamPickBytes,
    totalBytes,
    estimatedQuotaBytes: ESTIMATED_LOCAL_STORAGE_QUOTA_BYTES,
    usagePct,
    historyCount: historyCountOverride ?? 0,
    savedCount: savedCountOverride ?? 0,
  };
}

export function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

function computeDelta(
  oldValue: number | null | undefined,
  newValue: number | null | undefined,
  options?: { computePercentChange?: boolean }
): ComparisonMetricDelta {
  const validOld = typeof oldValue === 'number' && Number.isFinite(oldValue) ? oldValue : null;
  const validNew = typeof newValue === 'number' && Number.isFinite(newValue) ? newValue : null;

  if (validOld === null || validNew === null) {
    return {
      oldValue: validOld,
      newValue: validNew,
      delta: null,
      deltaPct: null,
      available: false,
    };
  }

  const delta = Math.round((validNew - validOld) * 100) / 100;
  let deltaPct: number | null = null;
  if (options?.computePercentChange && validOld !== 0) {
    deltaPct = Math.round(((validNew - validOld) / Math.abs(validOld)) * 1000) / 10;
  }

  return {
    oldValue: validOld,
    newValue: validNew,
    delta,
    deltaPct,
    available: true,
  };
}

/**
 * Compares an Older Research History record with a Newer Research History record.
 * STRICT RULE: Matches products ONLY by exact canonical Product ID.
 * Never guesses or fuzzy-matches products with different IDs.
 * Missing numeric fields are explicitly returned as available: false (displayed as Unavailable).
 */
export function compareResearchSessions(
  olderRecord: ResearchHistoryRecord,
  newerRecord: ResearchHistoryRecord
): ResearchComparisonResult {
  const olderById = new Map<string, ResearchProduct>();
  for (const product of olderRecord.products) {
    const cid = getCanonicalProductId(product);
    if (cid && !olderById.has(cid)) {
      olderById.set(cid, product);
    }
  }

  const matchedProducts: ProductComparisonRow[] = [];
  const matchedIds = new Set<string>();

  for (const newerProduct of newerRecord.products) {
    const cid = getCanonicalProductId(newerProduct);
    if (!cid || matchedIds.has(cid)) continue;

    const olderProduct = olderById.get(cid);
    if (!olderProduct) continue;

    matchedIds.add(cid);

    const oldSnapshot = olderRecord.scoreSnapshots[olderProduct.id];
    const newSnapshot = newerRecord.scoreSnapshots[newerProduct.id];

    const oldEval = oldSnapshot
      ? { totalScore: oldSnapshot.totalScore, confidenceLevel: oldSnapshot.confidenceLevel }
      : evaluateProductOpportunity(olderProduct, {
          salesWeightPct: olderRecord.researchSettings.salesWeightPct,
          peerProducts: olderRecord.products,
        });

    const newEval = newSnapshot
      ? { totalScore: newSnapshot.totalScore, confidenceLevel: newSnapshot.confidenceLevel }
      : evaluateProductOpportunity(newerProduct, {
          salesWeightPct: newerRecord.researchSettings.salesWeightPct,
          peerProducts: newerRecord.products,
        });

    const oldComm =
      olderProduct.commissionVerified && typeof olderProduct.commissionRate === 'number'
        ? olderProduct.commissionRate
        : olderProduct.kalodataMetrics?.commissionRatePct ?? null;
    const newComm =
      newerProduct.commissionVerified && typeof newerProduct.commissionRate === 'number'
        ? newerProduct.commissionRate
        : newerProduct.kalodataMetrics?.commissionRatePct ?? null;

    matchedProducts.push({
      canonicalProductId: cid,
      name: newerProduct.name || olderProduct.name,
      nameMy: newerProduct.nameMy || olderProduct.nameMy,
      category: newerProduct.category,
      shopName: newerProduct.shopName || olderProduct.shopName,
      olderProduct,
      newerProduct,
      sales: computeDelta(
        olderProduct.kalodataMetrics?.salesVolume,
        newerProduct.kalodataMetrics?.salesVolume,
        { computePercentChange: true }
      ),
      revenue: computeDelta(
        olderProduct.kalodataMetrics?.revenueThb,
        newerProduct.kalodataMetrics?.revenueThb,
        { computePercentChange: true }
      ),
      growth: computeDelta(
        olderProduct.kalodataMetrics?.revenueGrowthRate,
        newerProduct.kalodataMetrics?.revenueGrowthRate,
        { computePercentChange: false }
      ),
      commission: computeDelta(oldComm, newComm, { computePercentChange: false }),
      score: computeDelta(oldEval.totalScore, newEval.totalScore, {
        computePercentChange: false,
      }),
      olderConfidence: oldEval.confidenceLevel,
      newerConfidence: newEval.confidenceLevel,
    });
  }

  matchedProducts.sort((a, b) => {
    const sA = a.score.delta ?? Number.NEGATIVE_INFINITY;
    const sB = b.score.delta ?? Number.NEGATIVE_INFINITY;
    return sB - sA;
  });

  const onlyInOlderCount = olderRecord.products.filter(
    (p) => !matchedIds.has(getCanonicalProductId(p))
  ).length;
  const onlyInNewerCount = newerRecord.products.filter(
    (p) => !matchedIds.has(getCanonicalProductId(p))
  ).length;

  return {
    olderRecord,
    newerRecord,
    matchedProducts,
    onlyInOlderCount,
    onlyInNewerCount,
  };
}
