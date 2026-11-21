import type {
  DeepDiveAnalysisId,
  DeepDiveAnalysisSlotState,
  DeepDiveHistoryModuleEntry,
  DeepDiveHistoryOverallStatus,
  DeepDiveHistoryRecord,
  DeepDiveHistoryRunType,
  DeepDiveRunCostSummary,
  DeepDiveWorkspaceState,
} from '../types/deepDive.ts';
import type { StorageWriteResult } from '../types/product.ts';
import { KALODATA_USD_PER_CREDIT } from './kalodataPricing.ts';

export const DEEP_DIVE_HISTORY_STORAGE_KEY = 'siampick_deep_dive_history_v1';
export const DEEP_DIVE_HISTORY_SCHEMA_VERSION = 1;
export const MAX_DEEP_DIVE_HISTORY_PER_PRODUCT = 15;
export const MAX_DEEP_DIVE_HISTORY_PRODUCTS = 50;

interface DeepDiveHistoryEnvelopeV1 {
  schemaVersion: number;
  updatedAt: string;
  byProduct: Record<string, DeepDiveHistoryRecord[]>;
}

const VALID_ANALYSIS_IDS = new Set<DeepDiveAnalysisId>([
  'product-intelligence',
  'sales-market-intelligence',
  'affiliate-profit-analysis',
  'creator-competition-analysis',
  'video-intelligence',
  'customer-review-intelligence',
  'market-competitor-comparison',
  'ai-strategic-recommendation',
]);

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

function roundCredits(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function roundUsd(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function emptyEnvelope(): DeepDiveHistoryEnvelopeV1 {
  return {
    schemaVersion: DEEP_DIVE_HISTORY_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    byProduct: {},
  };
}

function isValidHistoryRecord(val: unknown): val is DeepDiveHistoryRecord {
  if (!val || typeof val !== 'object') return false;
  const r = val as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    r.id.length > 0 &&
    typeof r.canonicalProductId === 'string' &&
    r.canonicalProductId.length > 0 &&
    typeof r.analyzedAt === 'string' &&
    r.analyzedAt.length > 0 &&
    Array.isArray(r.analysisIds)
  );
}

function normalizeHistoryRecord(raw: DeepDiveHistoryRecord): DeepDiveHistoryRecord {
  const analysisIds = raw.analysisIds.filter((id): id is DeepDiveAnalysisId =>
    VALID_ANALYSIS_IDS.has(id)
  );
  const runType: DeepDiveHistoryRunType =
    raw.runType === 'rerun' || raw.runType === 'refresh' ? raw.runType : 'initial';
  const overallStatus: DeepDiveHistoryOverallStatus =
    raw.overallStatus === 'completed' ||
    raw.overallStatus === 'partial' ||
    raw.overallStatus === 'unavailable' ||
    raw.overallStatus === 'error'
      ? raw.overallStatus
      : 'completed';

  const slotsSnapshot: Partial<Record<DeepDiveAnalysisId, DeepDiveAnalysisSlotState>> = {};
  if (raw.slotsSnapshot && typeof raw.slotsSnapshot === 'object') {
    for (const [k, v] of Object.entries(raw.slotsSnapshot)) {
      if (VALID_ANALYSIS_IDS.has(k as DeepDiveAnalysisId) && v && typeof v === 'object') {
        slotsSnapshot[k as DeepDiveAnalysisId] = v as DeepDiveAnalysisSlotState;
      }
    }
  }

  return {
    id: raw.id,
    schemaVersion:
      typeof raw.schemaVersion === 'number'
        ? raw.schemaVersion
        : DEEP_DIVE_HISTORY_SCHEMA_VERSION,
    storageKind: 'browser-local-storage',
    canonicalProductId: raw.canonicalProductId,
    productName: typeof raw.productName === 'string' ? raw.productName : raw.canonicalProductId,
    productNameMy:
      typeof raw.productNameMy === 'string'
        ? raw.productNameMy
        : typeof raw.productName === 'string'
          ? raw.productName
          : raw.canonicalProductId,
    analyzedAt: raw.analyzedAt,
    analysisIds,
    runType,
    overallStatus,
    kalodataCreditsUsed:
      typeof raw.kalodataCreditsUsed === 'number' && Number.isFinite(raw.kalodataCreditsUsed)
        ? roundCredits(Math.max(0, raw.kalodataCreditsUsed))
        : 0,
    kalodataUsdUsed:
      typeof raw.kalodataUsdUsed === 'number' && Number.isFinite(raw.kalodataUsdUsed)
        ? roundUsd(Math.max(0, raw.kalodataUsdUsed))
        : 0,
    kalodataApiCalls:
      typeof raw.kalodataApiCalls === 'number' && Number.isFinite(raw.kalodataApiCalls)
        ? Math.max(0, Math.round(raw.kalodataApiCalls))
        : 0,
    geminiApiCalls:
      typeof raw.geminiApiCalls === 'number' && Number.isFinite(raw.geminiApiCalls)
        ? Math.max(0, Math.round(raw.geminiApiCalls))
        : 0,
    geminiTokenUsage: raw.geminiTokenUsage ?? null,
    cacheReuseCount:
      typeof raw.cacheReuseCount === 'number' && Number.isFinite(raw.cacheReuseCount)
        ? Math.max(0, Math.round(raw.cacheReuseCount))
        : 0,
    dataSourcesEn: Array.isArray(raw.dataSourcesEn)
      ? raw.dataSourcesEn.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
      : [],
    dataSourcesMy: Array.isArray(raw.dataSourcesMy)
      ? raw.dataSourcesMy.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
      : [],
    moduleEntries: Array.isArray(raw.moduleEntries) ? raw.moduleEntries : [],
    slotsSnapshot,
  };
}

function pruneEnvelope(
  envelope: DeepDiveHistoryEnvelopeV1,
  maxPerProduct = MAX_DEEP_DIVE_HISTORY_PER_PRODUCT,
  maxProducts = MAX_DEEP_DIVE_HISTORY_PRODUCTS
): DeepDiveHistoryEnvelopeV1 {
  const entries = Object.entries(envelope.byProduct)
    .map(([productId, list]) => {
      const sorted = [...list]
        .sort((a, b) => (Date.parse(b.analyzedAt) || 0) - (Date.parse(a.analyzedAt) || 0))
        .slice(0, Math.max(1, maxPerProduct));
      const newestTs = sorted[0] ? Date.parse(sorted[0].analyzedAt) || 0 : 0;
      return { productId, sorted, newestTs };
    })
    .filter((entry) => entry.sorted.length > 0)
    .sort((a, b) => b.newestTs - a.newestTs)
    .slice(0, Math.max(1, maxProducts));

  const byProduct: Record<string, DeepDiveHistoryRecord[]> = {};
  for (const entry of entries) {
    byProduct[entry.productId] = entry.sorted;
  }

  return {
    schemaVersion: DEEP_DIVE_HISTORY_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    byProduct,
  };
}

function loadEnvelope(): DeepDiveHistoryEnvelopeV1 {
  const storage = getStorage();
  if (!storage) return emptyEnvelope();

  try {
    const raw = storage.getItem(DEEP_DIVE_HISTORY_STORAGE_KEY);
    if (!raw) return emptyEnvelope();
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return emptyEnvelope();

    const env = parsed as Partial<DeepDiveHistoryEnvelopeV1>;
    const byProduct: Record<string, DeepDiveHistoryRecord[]> = {};

    if (env.byProduct && typeof env.byProduct === 'object') {
      for (const [productId, list] of Object.entries(env.byProduct)) {
        if (!Array.isArray(list)) continue;
        const normalized = list
          .filter(isValidHistoryRecord)
          .map(normalizeHistoryRecord)
          .sort((a, b) => (Date.parse(b.analyzedAt) || 0) - (Date.parse(a.analyzedAt) || 0));
        if (normalized.length > 0) {
          byProduct[productId] = normalized;
        }
      }
    }

    return {
      schemaVersion: DEEP_DIVE_HISTORY_SCHEMA_VERSION,
      updatedAt: typeof env.updatedAt === 'string' ? env.updatedAt : new Date().toISOString(),
      byProduct,
    };
  } catch {
    return emptyEnvelope();
  }
}

function persistEnvelope(envelope: DeepDiveHistoryEnvelopeV1): StorageWriteResult {
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

  const bounded = pruneEnvelope(envelope);

  const tryWrite = (target: DeepDiveHistoryEnvelopeV1): StorageWriteResult => {
    const serialized = JSON.stringify(target);
    storage.setItem(DEEP_DIVE_HISTORY_STORAGE_KEY, serialized);
    return {
      ok: true,
      quotaExceeded: false,
      bytesUsed: serialized.length * 2,
    };
  };

  try {
    return tryWrite(bounded);
  } catch (err) {
    const quotaExceeded = isQuotaExceededError(err);
    // Prune ONLY older Deep Dive history entries on quota error (never touch Research History or Saved Products)
    if (quotaExceeded) {
      const reduced = pruneEnvelope(bounded, 4, 15);
      try {
        return tryWrite(reduced);
      } catch {
        // Fall through to explicit quota error
      }
    }
    return {
      ok: false,
      quotaExceeded,
      bytesUsed: 0,
      errorEn: quotaExceeded
        ? 'Browser localStorage quota is full — Deep Dive History could not be saved. Delete older history records to free space.'
        : 'Unable to save Deep Dive History to browser localStorage.',
      errorMy: quotaExceeded
        ? 'Browser localStorage နေရာပြည့်နေသဖြင့် Deep Dive History ကို သိမ်းဆည်း၍ မရပါ။ နေရာလွတ်ရန် History အဟောင်းအချို့ကို ဖျက်ပေးပါ။'
        : 'Deep Dive History ကို Browser localStorage ထဲသို့ သိမ်းဆည်း၍ မရပါ။',
    };
  }
}

export function loadAllDeepDiveHistoryByProduct(): Record<string, DeepDiveHistoryRecord[]> {
  return loadEnvelope().byProduct;
}

export function loadDeepDiveHistoryForProduct(
  canonicalProductId: string
): DeepDiveHistoryRecord[] {
  if (!canonicalProductId || !canonicalProductId.trim()) return [];
  const env = loadEnvelope();
  return env.byProduct[canonicalProductId.trim()] ?? [];
}

function generateDeepDiveHistoryId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 7);
  return `ddh_${ts}_${rand}`;
}

export function createDeepDiveHistoryRecord(params: {
  canonicalProductId: string;
  productName: string;
  productNameMy: string;
  analysisIds: readonly DeepDiveAnalysisId[];
  slots: Partial<Record<DeepDiveAnalysisId, DeepDiveAnalysisSlotState>>;
  runSummary?: DeepDiveRunCostSummary | null;
  runType: DeepDiveHistoryRunType;
  analyzedAt?: string;
}): DeepDiveHistoryRecord {
  const analyzedAt = params.analyzedAt || params.runSummary?.completedAt || new Date().toISOString();
  const uniqueIds = Array.from(new Set(params.analysisIds)).filter((id) =>
    VALID_ANALYSIS_IDS.has(id)
  );

  const dataSourcesEnSet = new Set<string>();
  const dataSourcesMySet = new Set<string>();
  const moduleEntries: DeepDiveHistoryModuleEntry[] = [];
  const slotsSnapshot: Partial<Record<DeepDiveAnalysisId, DeepDiveAnalysisSlotState>> = {};

  let completedCount = 0;
  let unavailableCount = 0;
  let errorCount = 0;
  let totalCredits = 0;
  let totalKalodataCalls = 0;
  let totalGeminiCalls = 0;
  let totalCacheReuses = 0;

  for (const id of uniqueIds) {
    const slot = params.slots[id];
    if (!slot) continue;

    // Deep clone slot safely so later runs never mutate archived snapshots
    const clonedSlot: DeepDiveAnalysisSlotState = JSON.parse(JSON.stringify(slot));
    slotsSnapshot[id] = clonedSlot;

    if (slot.status === 'completed') completedCount += 1;
    else if (slot.status === 'unavailable') unavailableCount += 1;
    else if (slot.status === 'error') errorCount += 1;

    const res = slot.result;
    const creditsUsed = res?.creditsUsed ?? 0;
    const apiCallsMade = res?.apiCallsMade ?? 0;
    const aiApiCallsMade = res?.aiApiCallsMade ?? 0;
    const reusedFromCache = res?.reusedFromCache ?? false;
    const sourcesEn = res?.dataSourcesEn ?? [];
    const sourcesMy = res?.dataSourcesMy ?? [];

    totalCredits = roundCredits(totalCredits + creditsUsed);
    totalKalodataCalls += apiCallsMade;
    totalGeminiCalls += aiApiCallsMade;
    if (apiCallsMade === 0 && reusedFromCache) {
      totalCacheReuses += 1;
    }

    for (const s of sourcesEn) dataSourcesEnSet.add(s);
    for (const s of sourcesMy) dataSourcesMySet.add(s);

    moduleEntries.push({
      analysisId: id,
      status: slot.status,
      dataStatus: res?.dataStatus ?? null,
      headlineEn:
        slot.status === 'error' && slot.error
          ? slot.error.messageEn
          : (res?.headlineEn ?? slot.statusNoteEn),
      headlineMy:
        slot.status === 'error' && slot.error
          ? slot.error.messageMy
          : (res?.headlineMy ?? slot.statusNoteMy),
      creditsUsed: roundCredits(creditsUsed),
      apiCallsMade,
      aiApiCallsMade,
      reusedFromCache,
      dataSourcesEn: [...sourcesEn],
      dataSourcesMy: [...sourcesMy],
      completedAt: res?.completedAt ?? slot.updatedAt ?? analyzedAt,
      errorCode: slot.error?.code ?? null,
    });
  }

  let overallStatus: DeepDiveHistoryOverallStatus;
  if (completedCount > 0 && errorCount === 0 && unavailableCount === 0) {
    overallStatus = 'completed';
  } else if (completedCount > 0) {
    overallStatus = 'partial';
  } else if (errorCount > 0 && unavailableCount === 0) {
    overallStatus = 'error';
  } else if (unavailableCount > 0 && errorCount === 0) {
    overallStatus = 'unavailable';
  } else {
    overallStatus = 'partial';
  }

  const kalodataCreditsUsed =
    typeof params.runSummary?.actualKalodataCredits === 'number'
      ? roundCredits(params.runSummary.actualKalodataCredits)
      : totalCredits;
  const kalodataUsdUsed =
    typeof params.runSummary?.actualKalodataUsd === 'number'
      ? roundUsd(params.runSummary.actualKalodataUsd)
      : roundUsd(kalodataCreditsUsed * KALODATA_USD_PER_CREDIT);
  const kalodataApiCalls =
    typeof params.runSummary?.actualKalodataApiCalls === 'number'
      ? params.runSummary.actualKalodataApiCalls
      : totalKalodataCalls;
  const geminiApiCalls =
    typeof params.runSummary?.actualGeminiCalls === 'number'
      ? params.runSummary.actualGeminiCalls
      : totalGeminiCalls;
  const cacheReuseCount =
    typeof params.runSummary?.cacheOrLocalReuseCount === 'number'
      ? params.runSummary.cacheOrLocalReuseCount +
        (params.runSummary.deduplicatedSharedCallsCount ?? 0)
      : totalCacheReuses;

  return {
    id: generateDeepDiveHistoryId(),
    schemaVersion: DEEP_DIVE_HISTORY_SCHEMA_VERSION,
    storageKind: 'browser-local-storage',
    canonicalProductId: params.canonicalProductId,
    productName: params.productName,
    productNameMy: params.productNameMy,
    analyzedAt,
    analysisIds: uniqueIds,
    runType: params.runType,
    overallStatus,
    kalodataCreditsUsed,
    kalodataUsdUsed,
    kalodataApiCalls,
    geminiApiCalls,
    geminiTokenUsage: params.runSummary?.geminiTokenUsage ?? null,
    cacheReuseCount,
    dataSourcesEn: Array.from(dataSourcesEnSet),
    dataSourcesMy: Array.from(dataSourcesMySet),
    moduleEntries,
    slotsSnapshot,
  };
}

export function appendDeepDiveHistoryRecord(
  record: DeepDiveHistoryRecord
): { records: DeepDiveHistoryRecord[]; writeResult: StorageWriteResult } {
  const env = loadEnvelope();
  const key = record.canonicalProductId;
  const existing = env.byProduct[key] ?? [];
  const nextList = [record, ...existing.filter((item) => item.id !== record.id)].slice(
    0,
    MAX_DEEP_DIVE_HISTORY_PER_PRODUCT
  );
  env.byProduct[key] = nextList;
  const writeResult = persistEnvelope(env);
  return { records: nextList, writeResult };
}

export function deleteDeepDiveHistoryRecord(
  canonicalProductId: string,
  recordId: string
): { records: DeepDiveHistoryRecord[]; writeResult: StorageWriteResult } {
  const env = loadEnvelope();
  const existing = env.byProduct[canonicalProductId] ?? [];
  const nextList = existing.filter((item) => item.id !== recordId);
  if (nextList.length > 0) {
    env.byProduct[canonicalProductId] = nextList;
  } else {
    delete env.byProduct[canonicalProductId];
  }
  const writeResult = persistEnvelope(env);
  return { records: nextList, writeResult };
}

export function clearDeepDiveHistoryForProduct(
  canonicalProductId: string
): StorageWriteResult {
  const env = loadEnvelope();
  delete env.byProduct[canonicalProductId];
  return persistEnvelope(env);
}

/**
 * Hydrates idle Deep Dive slots from persisted per-product Browser Local Storage history
 * so reopening a product displays its latest verified module results at 0 API cost.
 * Never overwrites slots that already have results in memory, and never mutates input state.
 */
export function hydrateWorkspaceStateFromHistory(
  baseState: DeepDiveWorkspaceState,
  historyRecords: readonly DeepDiveHistoryRecord[]
): DeepDiveWorkspaceState {
  if (!historyRecords || historyRecords.length === 0) {
    return baseState;
  }

  const nextSlots: Record<DeepDiveAnalysisId, DeepDiveAnalysisSlotState> = {
    ...baseState.slots,
  };
  let hydratedAny = false;
  let newestTimestamp: string | null = baseState.lastAttemptedRunAt;

  // Iterate newest -> oldest so each idle slot gets its most recent completed/unavailable snapshot
  for (const record of historyRecords) {
    for (const [idKey, archivedSlot] of Object.entries(record.slotsSnapshot)) {
      const id = idKey as DeepDiveAnalysisId;
      if (!archivedSlot) continue;
      const currentSlot = nextSlots[id];
      if (!currentSlot || currentSlot.status !== 'idle' || currentSlot.result !== null) {
        continue;
      }
      if (
        (archivedSlot.status === 'completed' || archivedSlot.status === 'unavailable') &&
        archivedSlot.result
      ) {
        nextSlots[id] = JSON.parse(JSON.stringify(archivedSlot)) as DeepDiveAnalysisSlotState;
        hydratedAny = true;
        if (
          !newestTimestamp ||
          (Date.parse(record.analyzedAt) || 0) > (Date.parse(newestTimestamp) || 0)
        ) {
          newestTimestamp = record.analyzedAt;
        }
      }
    }
  }

  if (!hydratedAny) {
    return baseState;
  }

  return {
    ...baseState,
    slots: nextSlots,
    lastAttemptedRunAt: newestTimestamp,
  };
}
