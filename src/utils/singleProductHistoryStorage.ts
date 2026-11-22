import type {
  LinkImportExecuteResponse,
  LinkImportInspectResponse,
  ResearchProduct,
  SingleLinkResearchSource,
  SingleProductHistoryRecord,
  StorageWriteResult,
  StrategyPreset,
} from '../types/product.ts';
import {
  buildProductScoreSnapshot,
  evaluateProductOpportunity,
  getCanonicalProductId,
} from './scoring.ts';
import { getTikTokShopProductUrl, isSafeHttpUrl } from './format.ts';

export const SINGLE_PRODUCT_HISTORY_STORAGE_KEY = 'siampick_single_product_history_v1';
export const SINGLE_PRODUCT_HISTORY_SCHEMA_VERSION = 1;
export const SINGLE_PRODUCT_HISTORY_MAX_RECORDS = 100;

export const LEGACY_IMPORTED_LIBRARY_STORAGE_KEY = 'siampick_imported_products_library_v1';
export const LEGACY_IMPORTED_WORKSPACE_STORAGE_KEY = 'siampick_imported_workspace_v1';
export const LEGACY_SIMILAR_CACHE_STORAGE_KEY = 'siampick_similar_products_cache_v1';

interface SingleProductHistoryEnvelopeV1 {
  schemaVersion: number;
  updatedAt: string;
  records: SingleProductHistoryRecord[];
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
  return str.length * 2;
}

function isValidProductShape(value: unknown): value is ResearchProduct {
  if (!value || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  return typeof p.id === 'string' && p.id.length > 0 && typeof p.name === 'string';
}

function normalizeProduct(product: ResearchProduct): ResearchProduct {
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

function normalizeDataSource(raw: unknown): SingleLinkResearchSource {
  if (
    raw === 'kalodata-api' ||
    raw === 'server-cache' ||
    raw === 'client-cache' ||
    raw === 'in-flight-shared' ||
    raw === 'existing-local-record' ||
    raw === 'migrated-legacy'
  ) {
    return raw;
  }
  if (raw === 'existing-workspace') {
    return 'existing-local-record';
  }
  return 'migrated-legacy';
}

function normalizeSingleRecord(
  raw: Partial<SingleProductHistoryRecord>,
  salesWeightPct = 50,
  strategyPreset: StrategyPreset = 'balanced'
): SingleProductHistoryRecord | null {
  if (!raw || !isValidProductShape(raw.product)) return null;
  const cleanProduct = normalizeProduct(raw.product);
  const canonicalProductId =
    typeof raw.canonicalProductId === 'string' && raw.canonicalProductId.trim()
      ? raw.canonicalProductId.trim()
      : getCanonicalProductId(cleanProduct);
  const researchedAt =
    typeof raw.researchedAt === 'string' && raw.researchedAt.trim()
      ? raw.researchedAt
      : cleanProduct.researchedAt ?? new Date().toISOString();

  const scoreSnapshot =
    raw.scoreSnapshot &&
    typeof raw.scoreSnapshot === 'object' &&
    Array.isArray(raw.scoreSnapshot.criteria) &&
    raw.scoreSnapshot.criteria.length === 7
      ? raw.scoreSnapshot
      : buildProductScoreSnapshot(
          cleanProduct,
          evaluateProductOpportunity(cleanProduct, {
            salesWeightPct,
            strategyPreset,
          })
        );

  return {
    id:
      typeof raw.id === 'string' && raw.id.trim()
        ? raw.id.trim()
        : `single-${canonicalProductId}`,
    schemaVersion:
      typeof raw.schemaVersion === 'number'
        ? raw.schemaVersion
        : SINGLE_PRODUCT_HISTORY_SCHEMA_VERSION,
    canonicalProductId,
    researchedAt,
    product: cleanProduct,
    scoreSnapshot,
    dataSource: normalizeDataSource(raw.dataSource),
    apiCallsMade:
      typeof raw.apiCallsMade === 'number' && Number.isFinite(raw.apiCallsMade)
        ? Math.max(0, raw.apiCallsMade)
        : 0,
    estimatedCreditsCharged:
      typeof raw.estimatedCreditsCharged === 'number' &&
      Number.isFinite(raw.estimatedCreditsCharged)
        ? Math.max(0, raw.estimatedCreditsCharged)
        : 0,
    canonicalUrl: isSafeHttpUrl(raw.canonicalUrl) ? raw.canonicalUrl : null,
    resolvedUrl: isSafeHttpUrl(raw.resolvedUrl) ? raw.resolvedUrl : null,
  };
}

function sortAndTrimSingleRecords(
  records: readonly SingleProductHistoryRecord[]
): SingleProductHistoryRecord[] {
  const byCanonical = new Map<string, SingleProductHistoryRecord>();

  for (const rec of records) {
    const existing = byCanonical.get(rec.canonicalProductId);
    if (!existing) {
      byCanonical.set(rec.canonicalProductId, rec);
      continue;
    }
    const prevTs = Date.parse(existing.researchedAt) || 0;
    const nextTs = Date.parse(rec.researchedAt) || 0;
    if (nextTs >= prevTs) {
      byCanonical.set(rec.canonicalProductId, rec);
    }
  }

  return Array.from(byCanonical.values())
    .sort((a, b) => (Date.parse(b.researchedAt) || 0) - (Date.parse(a.researchedAt) || 0))
    .slice(0, SINGLE_PRODUCT_HISTORY_MAX_RECORDS);
}

function readRawSingleProductHistory(storage: Storage): SingleProductHistoryRecord[] {
  const raw = storage.getItem(SINGLE_PRODUCT_HISTORY_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as
      | Partial<SingleProductHistoryEnvelopeV1>
      | SingleProductHistoryRecord[];
    const list = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.records)
        ? parsed.records
        : [];
    const normalized: SingleProductHistoryRecord[] = [];
    for (const item of list) {
      const rec = normalizeSingleRecord(item);
      if (rec) normalized.push(rec);
    }
    return sortAndTrimSingleRecords(normalized);
  } catch {
    return [];
  }
}

function extractLegacySingleRecords(storage: Storage): {
  legacyRecords: SingleProductHistoryRecord[];
  hasAnyObsoleteKey: boolean;
} {
  const rawLibrary = storage.getItem(LEGACY_IMPORTED_LIBRARY_STORAGE_KEY);
  const rawWorkspace = storage.getItem(LEGACY_IMPORTED_WORKSPACE_STORAGE_KEY);
  const rawSimilar = storage.getItem(LEGACY_SIMILAR_CACHE_STORAGE_KEY);
  const hasAnyObsoleteKey =
    rawLibrary !== null || rawWorkspace !== null || rawSimilar !== null;

  const legacyRecords: SingleProductHistoryRecord[] = [];

  if (rawLibrary) {
    try {
      const parsed = JSON.parse(rawLibrary) as { entries?: unknown[] } | unknown[];
      const entries = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.entries)
          ? parsed.entries
          : [];
      for (const item of entries) {
        if (!item || typeof item !== 'object') continue;
        const entry = item as Record<string, unknown>;
        const converted = normalizeSingleRecord({
          canonicalProductId:
            typeof entry.canonicalProductId === 'string' ? entry.canonicalProductId : undefined,
          researchedAt:
            typeof entry.importedAt === 'string' ? entry.importedAt : undefined,
          product: entry.product as ResearchProduct,
          dataSource: normalizeDataSource(entry.dataSource),
          apiCallsMade:
            typeof entry.apiCallsMade === 'number' ? entry.apiCallsMade : 0,
          estimatedCreditsCharged:
            typeof entry.estimatedCreditsCharged === 'number'
              ? entry.estimatedCreditsCharged
              : 0,
          canonicalUrl:
            typeof entry.canonicalUrl === 'string' ? entry.canonicalUrl : null,
          resolvedUrl:
            typeof entry.resolvedUrl === 'string' ? entry.resolvedUrl : null,
        });
        if (converted) legacyRecords.push(converted);
      }
    } catch {
      // Ignore corrupt legacy library
    }
  }

  if (rawWorkspace) {
    try {
      const ws = JSON.parse(rawWorkspace) as Record<string, unknown> | null;
      if (ws && typeof ws === 'object' && ws.product) {
        const converted = normalizeSingleRecord({
          canonicalProductId:
            typeof ws.canonicalProductId === 'string' ? ws.canonicalProductId : undefined,
          researchedAt: typeof ws.importedAt === 'string' ? ws.importedAt : undefined,
          product: ws.product as ResearchProduct,
          dataSource: normalizeDataSource(ws.dataSource),
          apiCallsMade: typeof ws.apiCallsMade === 'number' ? ws.apiCallsMade : 0,
          estimatedCreditsCharged:
            typeof ws.estimatedCreditsCharged === 'number'
              ? ws.estimatedCreditsCharged
              : 0,
          canonicalUrl: typeof ws.canonicalUrl === 'string' ? ws.canonicalUrl : null,
          resolvedUrl: typeof ws.resolvedUrl === 'string' ? ws.resolvedUrl : null,
        });
        if (converted) legacyRecords.push(converted);
      }
    } catch {
      // Ignore corrupt legacy workspace
    }
  }

  return { legacyRecords, hasAnyObsoleteKey };
}

/**
 * Safely migrates legacy Phase 2 / Phase 3 imported workspace & library items into
 * Single Product Research History (`siampick_single_product_history_v1`) once, without
 * touching Batch History, Batch Recent Results, Saved Products, or Enrichment Cache.
 * Removes obsolete Phase 2/3 keys (`siampick_imported_*` and `siampick_similar_products_cache_v1`).
 */
export function migrateLegacyImportedDataToSingleHistory(): {
  migratedCount: number;
  cleanedKeys: string[];
  records: SingleProductHistoryRecord[];
} {
  const storage = getStorage();
  if (!storage) {
    return { migratedCount: 0, cleanedKeys: [], records: [] };
  }

  const current = readRawSingleProductHistory(storage);
  const { legacyRecords, hasAnyObsoleteKey } = extractLegacySingleRecords(storage);

  if (!hasAnyObsoleteKey) {
    return { migratedCount: 0, cleanedKeys: [], records: current };
  }

  const existingIds = new Set(current.map((r) => r.canonicalProductId));
  const newlyMigratedCount = legacyRecords.filter(
    (r) => !existingIds.has(r.canonicalProductId)
  ).length;

  const merged = sortAndTrimSingleRecords([...current, ...legacyRecords]);

  if (legacyRecords.length > 0) {
    const writeRes = persistSingleProductHistory(merged);
    if (!writeRes.ok) {
      // Fail safe: preserve legacy keys intact if quota prevents writing
      return { migratedCount: 0, cleanedKeys: [], records: merged };
    }
  }

  const cleanedKeys: string[] = [];
  for (const key of [
    LEGACY_IMPORTED_LIBRARY_STORAGE_KEY,
    LEGACY_IMPORTED_WORKSPACE_STORAGE_KEY,
    LEGACY_SIMILAR_CACHE_STORAGE_KEY,
  ]) {
    try {
      if (storage.getItem(key) !== null) {
        storage.removeItem(key);
        cleanedKeys.push(key);
      }
    } catch {
      // Ignore cleanup failure
    }
  }

  return {
    migratedCount: newlyMigratedCount,
    cleanedKeys,
    records: merged,
  };
}

/**
 * Loads Single Product Research History safely from `siampick_single_product_history_v1`.
 * Runs idempotent legacy Phase 2/3 cleanup/migration automatically on first load.
 */
export function loadSingleProductHistory(): SingleProductHistoryRecord[] {
  const storage = getStorage();
  if (!storage) return [];

  const migrated = migrateLegacyImportedDataToSingleHistory();
  if (migrated.cleanedKeys.length > 0 || migrated.records.length > 0) {
    return migrated.records;
  }
  return readRawSingleProductHistory(storage);
}

/**
 * Persists Single Product Research History strictly under `siampick_single_product_history_v1`.
 * Never touches Batch History (`siampick_research_history_v1`), Batch Recent Results, or Saved Products.
 */
export function persistSingleProductHistory(
  records: readonly SingleProductHistoryRecord[]
): StorageWriteResult {
  const storage = getStorage();
  if (!storage) {
    return {
      ok: false,
      quotaExceeded: false,
      bytesUsed: 0,
      errorEn: 'Browser localStorage is unavailable.',
      errorMy: 'Browser localStorage ကို အသုံးပြု၍ မရနိုင်ပါ။',
    };
  }

  const trimmed = sortAndTrimSingleRecords(records);
  const envelope: SingleProductHistoryEnvelopeV1 = {
    schemaVersion: SINGLE_PRODUCT_HISTORY_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    records: trimmed,
  };

  let serialized = '';
  try {
    serialized = JSON.stringify(envelope);
    storage.setItem(SINGLE_PRODUCT_HISTORY_STORAGE_KEY, serialized);
    return {
      ok: true,
      quotaExceeded: false,
      bytesUsed: byteSizeOfString(serialized),
    };
  } catch (err) {
    const quota = isQuotaExceededError(err);
    return {
      ok: false,
      quotaExceeded: quota,
      bytesUsed: byteSizeOfString(serialized),
      errorEn: quota
        ? 'Browser storage quota is full. Delete older history records or create a Backup before cleaning space.'
        : 'Unable to save Single Product Research History to browser localStorage.',
      errorMy: quota
        ? 'Browser localStorage နေရာပြည့်နေပါသည်။ မှတ်တမ်းအဟောင်းအချို့ကို ဖျက်ပါ သို့မဟုတ် Backup ဖိုင်ထုတ်သိမ်းပြီးမှ ရှင်းလင်းပါ။'
        : 'Single Product Research History ကို Browser localStorage ထဲသို့ သိမ်းဆည်း၍ မရပါ။',
    };
  }
}

export function createSingleProductHistoryRecord(
  executeResult: LinkImportExecuteResponse,
  salesWeightPct = 50,
  strategyPreset: StrategyPreset = 'balanced'
): SingleProductHistoryRecord {
  const product = normalizeProduct(executeResult.product);
  const canonicalProductId = getCanonicalProductId(product);
  const evaluation =
    executeResult.evaluation ??
    evaluateProductOpportunity(product, {
      salesWeightPct,
      strategyPreset,
    });
  const scoreSnapshot = buildProductScoreSnapshot(product, evaluation);

  return {
    id: `single-${canonicalProductId}`,
    schemaVersion: SINGLE_PRODUCT_HISTORY_SCHEMA_VERSION,
    canonicalProductId,
    researchedAt: product.researchedAt ?? new Date().toISOString(),
    product,
    scoreSnapshot,
    dataSource: executeResult.dataSource,
    apiCallsMade: executeResult.apiCallsMade,
    estimatedCreditsCharged: executeResult.estimatedCreditsCharged,
    canonicalUrl: isSafeHttpUrl(executeResult.canonicalUrl) ? executeResult.canonicalUrl : null,
    resolvedUrl: isSafeHttpUrl(executeResult.resolvedUrl) ? executeResult.resolvedUrl : null,
  };
}

export function createSingleProductHistoryRecordFromExisting(
  product: ResearchProduct,
  inspectResult: LinkImportInspectResponse | null,
  salesWeightPct = 50,
  strategyPreset: StrategyPreset = 'balanced'
): SingleProductHistoryRecord {
  const normalized = normalizeProduct(product);
  const canonicalProductId =
    inspectResult?.canonicalProductId?.trim() || getCanonicalProductId(normalized);
  const evaluation = evaluateProductOpportunity(normalized, {
    salesWeightPct,
    strategyPreset,
  });
  const derivedUrl = getTikTokShopProductUrl(normalized);
  return {
    id: `single-${canonicalProductId}`,
    schemaVersion: SINGLE_PRODUCT_HISTORY_SCHEMA_VERSION,
    canonicalProductId,
    researchedAt: new Date().toISOString(),
    product: normalized,
    scoreSnapshot: buildProductScoreSnapshot(normalized, evaluation),
    dataSource: 'existing-local-record',
    apiCallsMade: 0,
    estimatedCreditsCharged: 0,
    canonicalUrl: isSafeHttpUrl(inspectResult?.canonicalUrl)
      ? inspectResult?.canonicalUrl ?? null
      : isSafeHttpUrl(derivedUrl)
        ? derivedUrl
        : null,
    resolvedUrl: isSafeHttpUrl(inspectResult?.resolvedUrl)
      ? inspectResult?.resolvedUrl ?? null
      : null,
  };
}

/**
 * Inserts or updates a Single Product History record ONLY inside Single Product History.
 * Enforces `SINGLE_PRODUCT_HISTORY_MAX_RECORDS` (100) cleanly.
 * Matching `canonicalProductId` inside Batch History or Batch Recent Results is NEVER modified.
 */
export function upsertSingleProductHistoryRecord(
  current: readonly SingleProductHistoryRecord[],
  incoming: SingleProductHistoryRecord
): SingleProductHistoryRecord[] {
  const filtered = current.filter(
    (rec) => rec.canonicalProductId !== incoming.canonicalProductId
  );
  return sortAndTrimSingleRecords([incoming, ...filtered]);
}

export function deleteSingleProductHistoryRecords(
  current: readonly SingleProductHistoryRecord[],
  idsToDelete: readonly string[]
): SingleProductHistoryRecord[] {
  if (idsToDelete.length === 0) return [...current];
  const deleteSet = new Set(idsToDelete);
  return current.filter((rec) => !deleteSet.has(rec.id) && !deleteSet.has(rec.canonicalProductId));
}

export function syncProductInSingleHistory(
  current: readonly SingleProductHistoryRecord[],
  updatedProduct: ResearchProduct,
  salesWeightPct = 50,
  strategyPreset: StrategyPreset = 'balanced'
): SingleProductHistoryRecord[] {
  const cid = getCanonicalProductId(updatedProduct);
  if (!cid) return [...current];
  const normalized = normalizeProduct(updatedProduct);
  let changed = false;

  const next = current.map((rec) => {
    if (rec.canonicalProductId !== cid && rec.product.id !== updatedProduct.id) {
      return rec;
    }
    changed = true;
    const evaluation = evaluateProductOpportunity(normalized, {
      salesWeightPct,
      strategyPreset,
    });
    return {
      ...rec,
      product: normalized,
      scoreSnapshot: buildProductScoreSnapshot(normalized, evaluation),
    };
  });

  return changed ? next : [...current];
}

/**
 * Pure helper for Backup/Restore normalization & validation.
 */
export function sanitizeSingleProductHistoryRecord(
  raw: unknown
): SingleProductHistoryRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  return normalizeSingleRecord(raw as Partial<SingleProductHistoryRecord>);
}
