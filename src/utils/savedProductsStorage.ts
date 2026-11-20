import type {
  Language,
  ResearchProduct,
  SavedProductRecord,
  StorageWriteResult,
} from '../types/product.ts';

export const SAVED_PRODUCTS_LEGACY_KEY = 'siampick_saved_products_v1';
export const SAVED_PRODUCTS_STORAGE_KEY = 'siampick_saved_products_v2';
export const SAVED_PRODUCTS_SCHEMA_VERSION = 2;

interface SavedProductsEnvelopeV2 {
  schemaVersion: number;
  updatedAt: string;
  records: SavedProductRecord[];
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

function isValidSavedRecord(value: unknown): value is SavedProductRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== 'string' || !record.id) return false;
  if (typeof record.researchDate !== 'string') return false;
  if (typeof record.savedAt !== 'string') return false;
  if (!record.product || typeof record.product !== 'object') return false;

  const product = record.product as Record<string, unknown>;
  const validPrice = typeof product.priceThb === 'number' || product.priceThb === null;
  return (
    typeof product.id === 'string' &&
    typeof product.name === 'string' &&
    validPrice
  );
}

function normalizeSavedRecord(record: SavedProductRecord): SavedProductRecord {
  const safeSources = Array.isArray(record.sources)
    ? record.sources
    : Array.isArray(record.product.sources)
      ? record.product.sources
      : [];
  return {
    ...record,
    sources: safeSources.map((s) => ({ ...s })),
    product: {
      ...record.product,
      sources: Array.isArray(record.product.sources)
        ? record.product.sources.map((s) => ({ ...s }))
        : safeSources.map((s) => ({ ...s })),
      reviewStrengthsEn: Array.isArray(record.product.reviewStrengthsEn)
        ? record.product.reviewStrengthsEn
        : [],
      reviewStrengthsMy: Array.isArray(record.product.reviewStrengthsMy)
        ? record.product.reviewStrengthsMy
        : [],
      customerComplaintsEn: Array.isArray(record.product.customerComplaintsEn)
        ? record.product.customerComplaintsEn
        : [],
      customerComplaintsMy: Array.isArray(record.product.customerComplaintsMy)
        ? record.product.customerComplaintsMy
        : [],
      demandEvidenceEn: Array.isArray(record.product.demandEvidenceEn)
        ? record.product.demandEvidenceEn
        : [],
      demandEvidenceMy: Array.isArray(record.product.demandEvidenceMy)
        ? record.product.demandEvidenceMy
        : [],
      generalRisksEn: Array.isArray(record.product.generalRisksEn)
        ? record.product.generalRisksEn
        : [],
      generalRisksMy: Array.isArray(record.product.generalRisksMy)
        ? record.product.generalRisksMy
        : [],
      missingDataEn: Array.isArray(record.product.missingDataEn)
        ? record.product.missingDataEn
        : [],
      missingDataMy: Array.isArray(record.product.missingDataMy)
        ? record.product.missingDataMy
        : [],
    },
  };
}

function parseSavedArray(raw: string | null): SavedProductRecord[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(isValidSavedRecord).map(normalizeSavedRecord);
    }
    if (parsed && typeof parsed === 'object') {
      const env = parsed as Partial<SavedProductsEnvelopeV2>;
      if (Array.isArray(env.records)) {
        return env.records.filter(isValidSavedRecord).map(normalizeSavedRecord);
      }
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Loads Saved Products from versioned localStorage (v2).
 * Automatically migrates any existing v1 saved products without losing data
 * and never crashes on corrupted JSON.
 */
export function loadSavedProducts(): SavedProductRecord[] {
  const storage = getStorage();
  if (!storage) return [];

  try {
    const v2Raw = storage.getItem(SAVED_PRODUCTS_STORAGE_KEY);
    if (v2Raw !== null) {
      const v2Records = parseSavedArray(v2Raw);
      // Also check if legacy v1 still has any records not present in v2 (safe merge)
      const legacyRaw = storage.getItem(SAVED_PRODUCTS_LEGACY_KEY);
      if (legacyRaw) {
        const legacyRecords = parseSavedArray(legacyRaw);
        const existingIds = new Set(v2Records.map((r) => r.id));
        const missingFromV2 = legacyRecords.filter((r) => !existingIds.has(r.id));
        if (missingFromV2.length > 0) {
          const merged = [...v2Records, ...missingFromV2];
          persistSavedProductsWithStatus(merged);
          return merged;
        }
      }
      return v2Records;
    }

    // Migrate seamlessly from legacy v1 key
    const legacyRaw = storage.getItem(SAVED_PRODUCTS_LEGACY_KEY);
    if (legacyRaw !== null) {
      const migrated = parseSavedArray(legacyRaw);
      if (migrated.length > 0) {
        persistSavedProductsWithStatus(migrated);
      }
      return migrated;
    }

    return [];
  } catch {
    return [];
  }
}

export function persistSavedProductsWithStatus(records: SavedProductRecord[]): StorageWriteResult {
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

  const envelope: SavedProductsEnvelopeV2 = {
    schemaVersion: SAVED_PRODUCTS_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    records,
  };

  try {
    const serialized = JSON.stringify(envelope);
    storage.setItem(SAVED_PRODUCTS_STORAGE_KEY, serialized);
    // Once v2 is written successfully, remove the old v1 duplicate key so it does not consume extra quota
    if (storage.getItem(SAVED_PRODUCTS_LEGACY_KEY) !== null) {
      try {
        storage.removeItem(SAVED_PRODUCTS_LEGACY_KEY);
      } catch {
        // Non-critical cleanup
      }
    }
    return {
      ok: true,
      quotaExceeded: false,
      bytesUsed: serialized.length * 2,
    };
  } catch (err) {
    const quotaExceeded = isQuotaExceededError(err);
    return {
      ok: false,
      quotaExceeded,
      bytesUsed: 0,
      errorEn: quotaExceeded
        ? 'Browser storage quota is full. Delete older Research History records to free space without losing your Saved Products.'
        : 'Unable to save products to browser localStorage.',
      errorMy: quotaExceeded
        ? 'Browser Storage နေရာပြည့်နေပါသည်။ Saved Products မပျောက်စေဘဲ နေရာလွတ်ရရန် အဟောင်းဖြစ်သော Research History အချို့ကို ဖျက်ပေးပါ။'
        : 'Browser localStorage ထဲသို့ Saved Products သိမ်းဆည်း၍ မရပါ။',
    };
  }
}

export function persistSavedProducts(records: SavedProductRecord[]): boolean {
  return persistSavedProductsWithStatus(records).ok;
}

export function createSavedRecord(product: ResearchProduct): SavedProductRecord {
  const nowIso = new Date().toISOString();
  return {
    id: product.id,
    product: {
      ...product,
      sources: product.sources.map((s) => ({ ...s })),
    },
    researchDate: product.researchedAt ?? nowIso,
    savedAt: nowIso,
    savedFromPreview: false,
    sources: product.sources.map((s) => ({ ...s })),
  };
}

export function formatResearchDate(isoString: string, language: Language): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;

  try {
    return new Intl.DateTimeFormat(language === 'my' ? 'my-MM' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function formatResearchDateTime(isoString: string, language: Language): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;

  try {
    return new Intl.DateTimeFormat(language === 'my' ? 'my-MM' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 16).replace('T', ' ');
  }
}
