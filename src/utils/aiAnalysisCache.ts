import type {
  AiProductAnalysis,
  CachedAiAnalysisEntry,
  ResearchProduct,
  StorageWriteResult,
} from '../types/product.ts';
import { getCanonicalProductId } from './scoring.ts';
import { computeProductDataFingerprint } from './aiAnalysisFallback.ts';

export const AI_ANALYSIS_CACHE_STORAGE_KEY = 'siampick_ai_analysis_cache_v1';
export const AI_ANALYSIS_CACHE_SCHEMA_VERSION = 1;

interface AiAnalysisCacheEnvelopeV1 {
  schemaVersion: number;
  updatedAt: string;
  entries: Record<string, CachedAiAnalysisEntry>;
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

function isValidAnalysis(value: unknown): value is AiProductAnalysis {
  if (!value || typeof value !== 'object') return false;
  const a = value as Record<string, unknown>;
  return (
    typeof a.canonicalProductId === 'string' &&
    a.canonicalProductId.length > 0 &&
    typeof a.dataFingerprint === 'string' &&
    (a.source === 'gemini' || a.source === 'kalodata-fallback') &&
    typeof a.analyzedAt === 'string' &&
    Array.isArray(a.strengthsEn) &&
    Array.isArray(a.weaknessesEn) &&
    typeof a.salesAndRevenueEn === 'string' &&
    typeof a.whyChooseEn === 'string' &&
    a.aiContentSuitability !== null &&
    typeof a.aiContentSuitability === 'object' &&
    a.finalRecommendation !== null &&
    typeof a.finalRecommendation === 'object'
  );
}

function isValidEntry(value: unknown): value is CachedAiAnalysisEntry {
  if (!value || typeof value !== 'object') return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.canonicalProductId === 'string' &&
    e.canonicalProductId.length > 0 &&
    typeof e.dataFingerprint === 'string' &&
    typeof e.cachedAt === 'string' &&
    isValidAnalysis(e.analysis)
  );
}

export const MAX_AI_ANALYSIS_CACHE_ENTRIES = 150;

let memoizedAiCacheRaw: string | null = null;
let memoizedAiCacheMap: Record<string, CachedAiAnalysisEntry> | null = null;

function pruneAiCacheEntries(
  entries: Record<string, CachedAiAnalysisEntry>,
  maxEntries: number
): Record<string, CachedAiAnalysisEntry> {
  const list = Object.entries(entries);
  if (list.length <= maxEntries) return entries;
  list.sort((a, b) => {
    const timeA = Date.parse(a[1].cachedAt || '') || 0;
    const timeB = Date.parse(b[1].cachedAt || '') || 0;
    return timeB - timeA;
  });
  const kept: Record<string, CachedAiAnalysisEntry> = {};
  for (const [k, v] of list.slice(0, Math.max(1, maxEntries))) {
    kept[k] = v;
  }
  return kept;
}

export function loadAiAnalysisCacheMap(): Record<string, CachedAiAnalysisEntry> {
  const storage = getStorage();
  if (!storage) return {};

  try {
    const raw = storage.getItem(AI_ANALYSIS_CACHE_STORAGE_KEY);
    if (!raw) {
      memoizedAiCacheRaw = null;
      memoizedAiCacheMap = null;
      return {};
    }
    if (raw === memoizedAiCacheRaw && memoizedAiCacheMap) {
      return { ...memoizedAiCacheMap };
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const env = parsed as Partial<AiAnalysisCacheEnvelopeV1>;
    if (!env.entries || typeof env.entries !== 'object') return {};

    const clean: Record<string, CachedAiAnalysisEntry> = {};
    for (const [key, entry] of Object.entries(env.entries)) {
      if (isValidEntry(entry)) {
        clean[key] = entry;
      }
    }
    memoizedAiCacheRaw = raw;
    memoizedAiCacheMap = clean;
    return { ...clean };
  } catch {
    memoizedAiCacheRaw = null;
    memoizedAiCacheMap = null;
    return {};
  }
}

function persistAiAnalysisCacheMap(
  entries: Record<string, CachedAiAnalysisEntry>
): StorageWriteResult {
  const storage = getStorage();
  if (!storage) {
    return {
      ok: false,
      quotaExceeded: false,
      bytesUsed: 0,
      errorEn: 'Browser localStorage is unavailable.',
      errorMy: 'Browser localStorage ကို အသုံးပြု၍ မရပါ။',
    };
  }

  const boundedEntries = pruneAiCacheEntries(entries, MAX_AI_ANALYSIS_CACHE_ENTRIES);

  const tryWrite = (targetEntries: Record<string, CachedAiAnalysisEntry>): StorageWriteResult => {
    const envelope: AiAnalysisCacheEnvelopeV1 = {
      schemaVersion: AI_ANALYSIS_CACHE_SCHEMA_VERSION,
      updatedAt: new Date().toISOString(),
      entries: targetEntries,
    };
    const serialized = JSON.stringify(envelope);
    storage.setItem(AI_ANALYSIS_CACHE_STORAGE_KEY, serialized);
    memoizedAiCacheRaw = serialized;
    memoizedAiCacheMap = { ...targetEntries };
    return {
      ok: true,
      quotaExceeded: false,
      bytesUsed: serialized.length * 2,
    };
  };

  try {
    return tryWrite(boundedEntries);
  } catch (err) {
    const quotaExceeded = isQuotaExceededError(err);
    // If quota is tight, safely prune oldest 50% of AI cache entries ONLY (never touching History or Saved Products)
    if (quotaExceeded && Object.keys(boundedEntries).length > 1) {
      try {
        const reduced = pruneAiCacheEntries(
          boundedEntries,
          Math.max(1, Math.floor(Object.keys(boundedEntries).length / 2))
        );
        return tryWrite(reduced);
      } catch {
        // Fall through to structured quota warning
      }
    }
    return {
      ok: false,
      quotaExceeded,
      bytesUsed: 0,
      errorEn: quotaExceeded
        ? 'Browser localStorage quota is full — AI analysis could not be cached locally. Delete older Research History records to free space.'
        : 'Unable to save AI analysis cache to browser localStorage.',
      errorMy: quotaExceeded
        ? 'Browser localStorage နေရာပြည့်နေသဖြင့် AI Analysis ကို သိမ်းဆည်း၍ မရပါ။ Research History အဟောင်းအချို့ကို ဖျက်ပြီး နေရာလွတ်ဖန်တီးပါ။'
        : 'AI Analysis ကို Browser localStorage ထဲသို့ သိမ်းဆည်း၍ မရပါ။',
    };
  }
}

/**
 * Looks up a cached AI analysis for a product by its exact canonical Product ID.
 * Returns both the cached entry and whether the current product's Kalodata metrics
 * have changed since the cached analysis was generated.
 */
export function getCachedAiAnalysisForProduct(product: ResearchProduct): {
  entry: CachedAiAnalysisEntry | null;
  hasNewerData: boolean;
  currentFingerprint: string;
} {
  const canonicalId = getCanonicalProductId(product);
  const currentFingerprint = computeProductDataFingerprint(product);
  const cacheMap = loadAiAnalysisCacheMap();
  const cached = cacheMap[canonicalId] ?? null;

  if (cached) {
    return {
      entry: cached,
      hasNewerData: cached.dataFingerprint !== currentFingerprint,
      currentFingerprint,
    };
  }

  // Fallback check: if the product object itself already carries an attached Gemini analysis
  if (product.aiAnalysis && product.aiAnalysis.source === 'gemini' && isValidAnalysis(product.aiAnalysis)) {
    const attachedEntry: CachedAiAnalysisEntry = {
      canonicalProductId: canonicalId,
      dataFingerprint: product.aiAnalysis.dataFingerprint,
      cachedAt: product.aiAnalysis.analyzedAt,
      analysis: product.aiAnalysis,
    };
    return {
      entry: attachedEntry,
      hasNewerData: attachedEntry.dataFingerprint !== currentFingerprint,
      currentFingerprint,
    };
  }

  return {
    entry: null,
    hasNewerData: false,
    currentFingerprint,
  };
}

/**
 * Persists a successful Gemini AI Product Analysis to localStorage cache.
 * Never overwrites an existing cached Gemini analysis with a failed fallback analysis.
 */
export function saveCachedAiAnalysis(analysis: AiProductAnalysis): StorageWriteResult {
  if (analysis.source !== 'gemini' || analysis.geminiFailed) {
    return {
      ok: true,
      quotaExceeded: false,
      bytesUsed: 0,
    };
  }

  const cacheMap = loadAiAnalysisCacheMap();
  const existing = cacheMap[analysis.canonicalProductId];
  let previousAnalyses: AiProductAnalysis[] | undefined = existing?.previousAnalyses;

  // Distinguish older vs newer AI analysis cleanly whenever data changed
  if (existing && existing.dataFingerprint !== analysis.dataFingerprint) {
    const historyPool = [
      existing.analysis,
      ...(Array.isArray(existing.previousAnalyses) ? existing.previousAnalyses : []),
    ];
    const seenFingerprints = new Set<string>([analysis.dataFingerprint]);
    const archived: AiProductAnalysis[] = [];
    for (const item of historyPool) {
      if (!isValidAnalysis(item)) continue;
      if (seenFingerprints.has(item.dataFingerprint)) continue;
      seenFingerprints.add(item.dataFingerprint);
      archived.push(item);
      if (archived.length >= 3) break;
    }
    previousAnalyses = archived.length > 0 ? archived : undefined;
  }

  cacheMap[analysis.canonicalProductId] = {
    canonicalProductId: analysis.canonicalProductId,
    dataFingerprint: analysis.dataFingerprint,
    cachedAt: analysis.analyzedAt,
    analysis,
    ...(previousAnalyses ? { previousAnalyses } : {}),
  };
  return persistAiAnalysisCacheMap(cacheMap);
}

export function deleteCachedAiAnalysis(canonicalProductId: string): StorageWriteResult {
  const cacheMap = loadAiAnalysisCacheMap();
  delete cacheMap[canonicalProductId];
  return persistAiAnalysisCacheMap(cacheMap);
}

const FORBIDDEN_AI_CACHE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function replaceOrMergeAiAnalysisCache(
  incomingEntries: Record<string, CachedAiAnalysisEntry> | null | undefined,
  mode: 'merge' | 'replace'
): StorageWriteResult {
  const target: Record<string, CachedAiAnalysisEntry> =
    mode === 'replace' ? {} : loadAiAnalysisCacheMap();

  if (incomingEntries && typeof incomingEntries === 'object') {
    for (const [key, entry] of Object.entries(incomingEntries)) {
      if (!key || FORBIDDEN_AI_CACHE_KEYS.has(key) || !isValidEntry(entry)) continue;
      if (mode === 'merge' && target[key]) {
        const existingTs = Date.parse(target[key].cachedAt || '') || 0;
        const incomingTs = Date.parse(entry.cachedAt || '') || 0;
        if (incomingTs > existingTs) {
          target[key] = { ...entry };
        }
      } else {
        target[key] = { ...entry };
      }
    }
  }

  return persistAiAnalysisCacheMap(target);
}
