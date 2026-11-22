import type {
  CachedAiAnalysisEntry,
  GroundingSourceLink,
  ResearchHistoryRecord,
  ResearchProduct,
  SavedProductRecord,
  StorageWriteResult,
  SyncedKalodataCategoryCache,
} from '../types/product.ts';
import type { DeepDiveHistoryRecord } from '../types/deepDive.ts';
import {
  clearLatestResearchSession,
  loadLatestResearchSession,
  loadResearchHistory,
  persistLatestResearchSession,
  persistResearchHistory,
  type LatestResearchSessionSnapshot,
} from './researchHistoryStorage.ts';
import {
  loadSavedProducts,
  persistSavedProductsWithStatus,
} from './savedProductsStorage.ts';
import {
  loadAllDeepDiveHistoryByProduct,
  MAX_DEEP_DIVE_HISTORY_PER_PRODUCT,
  persistAllDeepDiveHistoryByProduct,
} from './deepDiveHistoryStorage.ts';
import {
  absorbProductsIntoEnrichmentCache,
  loadEnrichmentCache,
  replaceOrMergeEnrichmentCache,
  type EnrichmentCacheEnvelopeV1,
} from './enrichmentCache.ts';
import {
  loadAiAnalysisCacheMap,
  replaceOrMergeAiAnalysisCache,
} from './aiAnalysisCache.ts';
import {
  CATEGORY_BY_ID,
  isValidProductCategory,
  loadSyncedKalodataCategories,
  saveSyncedKalodataCategories,
  SYNCED_CATEGORIES_SCHEMA_VERSION,
} from './categoryRegistry.ts';
import { getCanonicalProductId } from './scoring.ts';
import { isSafeHttpUrl } from './format.ts';

export const SIAMPICK_BACKUP_FORMAT = 'siampick-backup' as const;
export const SIAMPICK_BACKUP_SCHEMA_VERSION = 1;
export const MAX_BACKUP_FILE_BYTES = 15 * 1024 * 1024; // 15 MB safety limit

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const SECRET_KEY_PATTERN =
  /api[_-]?key|secret|token|authorization|cookie|password|credential|private[_-]?key/i;

export type BackupRestoreMode = 'merge' | 'replace';

export interface BackupScopeSelection {
  includeSaved: boolean;
  includeHistory: boolean;
  includeDeepDive: boolean;
  includeLatestSession: boolean;
  includeCaches: boolean;
}

export const DEFAULT_BACKUP_SCOPE: BackupScopeSelection = {
  includeSaved: true,
  includeHistory: true,
  includeDeepDive: true,
  includeLatestSession: true,
  includeCaches: true,
};

export interface BackupCountsSummary {
  savedProducts: number;
  researchHistorySessions: number;
  researchHistoryProducts: number;
  deepDiveProducts: number;
  deepDiveRecords: number;
  latestSessionProducts: number;
  cachedEnrichments: number;
  cachedAiAnalyses: number;
  syncedSubcategories: number;
}

export interface SiamPickBackupDataPayload {
  savedProducts: SavedProductRecord[];
  researchHistory: ResearchHistoryRecord[];
  deepDiveHistoryByProduct: Record<string, DeepDiveHistoryRecord[]>;
  latestResearchSession: LatestResearchSessionSnapshot | null;
  enrichmentCache?: EnrichmentCacheEnvelopeV1;
  aiAnalysisCache?: Record<string, CachedAiAnalysisEntry>;
  syncedCategories?: SyncedKalodataCategoryCache;
}

export interface SiamPickBackupFileV1 {
  format: typeof SIAMPICK_BACKUP_FORMAT;
  schemaVersion: number;
  app: 'SiamPick';
  exportedAt: string;
  counts: BackupCountsSummary;
  data: SiamPickBackupDataPayload;
}

export interface BackupPreviewSummary {
  exportedAt: string;
  schemaVersion: number;
  counts: BackupCountsSummary;
  hasLatestSession: boolean;
  hasCaches: boolean;
  skippedInvalidCount: number;
  estimatedBytes: number;
}

export type BackupParseResult =
  | {
      ok: true;
      backup: SiamPickBackupFileV1;
      preview: BackupPreviewSummary;
    }
  | {
      ok: false;
      errorEn: string;
      errorMy: string;
    };

export interface BackupRestoreResult {
  ok: boolean;
  mode: BackupRestoreMode;
  appliedCounts: {
    savedProductsAdded: number;
    savedProductsTotal: number;
    historyAdded: number;
    historyTotal: number;
    deepDiveRecordsTotal: number;
    latestSessionApplied: boolean;
    cachesApplied: boolean;
  };
  savedRecords: SavedProductRecord[];
  researchHistory: ResearchHistoryRecord[];
  deepDiveHistoryByProduct: Record<string, DeepDiveHistoryRecord[]>;
  latestResearchSession: LatestResearchSessionSnapshot | null;
  syncedCategories: SyncedKalodataCategoryCache | null;
  writeErrors: StorageWriteResult[];
}

function scrubUntrustedObject<T>(input: T): T {
  if (input === null || input === undefined || typeof input !== 'object') {
    return input;
  }
  if (Array.isArray(input)) {
    return input.map((item) => scrubUntrustedObject(item)) as unknown as T;
  }
  const clean: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(input as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.has(key) || SECRET_KEY_PATTERN.test(key)) {
      continue;
    }
    clean[key] = scrubUntrustedObject(val);
  }
  return clean as T;
}

function sanitizeOptionalUrl(url: string | null | undefined): string | null {
  if (typeof url !== 'string' || !url.trim()) return null;
  const trimmed = url.trim();
  return isSafeHttpUrl(trimmed) ? trimmed : null;
}

function sanitizeImageUrl(url: string | null | undefined): string | null {
  if (typeof url !== 'string' || !url.trim()) return null;
  const trimmed: string = url.trim();
  if (trimmed.startsWith('/api/image-proxy?')) {
    try {
      const params = new URLSearchParams(trimmed.slice('/api/image-proxy?'.length));
      const targetUrl = params.get('url');
      if (targetUrl && isSafeHttpUrl(targetUrl)) {
        return trimmed;
      }
    } catch {
      return null;
    }
    return null;
  }
  if (/^\/api\/product-image\/\d{8,24}$/.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.startsWith('/assets/') && !trimmed.includes('..') && !trimmed.includes('\\')) {
    return trimmed;
  }
  if (isSafeHttpUrl(trimmed)) {
    return trimmed;
  }
  return null;
}

function extractOriginFromProxyUrl(proxyUrl: string | null): string | null {
  if (!proxyUrl || !proxyUrl.startsWith('/api/image-proxy?')) return null;
  try {
    const params = new URLSearchParams(proxyUrl.slice('/api/image-proxy?'.length));
    const targetUrl = params.get('url');
    return targetUrl && isSafeHttpUrl(targetUrl) ? targetUrl : null;
  } catch {
    return null;
  }
}

function sanitizeGroundingSources(sources: unknown): GroundingSourceLink[] {
  if (!Array.isArray(sources)) return [];
  const valid: GroundingSourceLink[] = [];
  for (const item of sources) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Partial<GroundingSourceLink>;
    const safeUrl = sanitizeOptionalUrl(raw.url) ?? '';
    valid.push({
      title: typeof raw.title === 'string' ? raw.title : 'Kalodata',
      url: safeUrl,
      domain: typeof raw.domain === 'string' ? raw.domain : 'kalodata.com',
    });
  }
  return valid;
}

function sanitizeProduct(product: ResearchProduct): ResearchProduct {
  let safeImage = sanitizeImageUrl(product.imageUrl);
  const safeOriginImage =
    sanitizeImageUrl(product.imageOriginUrl) ?? extractOriginFromProxyUrl(safeImage);
  let imageVerified = product.imageVerified === true;

  // Recover imageUrl seamlessly from imageOriginUrl if an earlier backup stripped /api/image-proxy
  if (!safeImage && safeOriginImage) {
    safeImage =
      safeOriginImage.startsWith('http://') || safeOriginImage.startsWith('https://')
        ? `/api/image-proxy?url=${encodeURIComponent(safeOriginImage)}`
        : safeOriginImage;
    imageVerified = true;
  }

  const safeSources = Array.isArray(product.sources)
    ? product.sources.map((src) => {
        const cleanUrl = sanitizeOptionalUrl(src.url);
        return {
          ...src,
          url: cleanUrl,
          verified: src.verified === true && Boolean(cleanUrl),
        };
      })
    : [];

  const safeMyanmarLanguage = product.myanmarLanguage
    ? {
        ...product.myanmarLanguage,
        ...(Array.isArray(product.myanmarLanguage.matchedVideos)
          ? {
              matchedVideos: product.myanmarLanguage.matchedVideos.map((vid) => ({
                ...vid,
                videoUrl: sanitizeOptionalUrl(vid.videoUrl),
              })),
            }
          : {}),
      }
    : undefined;

  return {
    ...product,
    priceThb:
      typeof product.priceThb === 'number' && Number.isFinite(product.priceThb)
        ? product.priceThb
        : null,
    imageUrl: safeImage,
    imageOriginUrl: safeOriginImage,
    imageVerified: imageVerified && Boolean(safeImage || safeOriginImage),
    sources: safeSources,
    ...(safeMyanmarLanguage ? { myanmarLanguage: safeMyanmarLanguage } : {}),
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

function isValidProductShape(val: unknown): val is ResearchProduct {
  if (!val || typeof val !== 'object') return false;
  const p = val as Record<string, unknown>;
  return typeof p.id === 'string' && p.id.trim().length > 0 && typeof p.name === 'string';
}

function isValidSavedProductShape(val: unknown): val is SavedProductRecord {
  if (!val || typeof val !== 'object') return false;
  const r = val as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    r.id.trim().length > 0 &&
    typeof r.savedAt === 'string' &&
    typeof r.researchDate === 'string' &&
    isValidProductShape(r.product)
  );
}

function isValidHistoryRecordShape(val: unknown): val is ResearchHistoryRecord {
  if (!val || typeof val !== 'object') return false;
  const rec = val as Record<string, unknown>;
  return (
    typeof rec.id === 'string' &&
    rec.id.trim().length > 0 &&
    typeof rec.researchedAt === 'string' &&
    rec.researchedAt.trim().length > 0 &&
    Array.isArray(rec.products) &&
    rec.researchSettings !== null &&
    typeof rec.researchSettings === 'object'
  );
}

function isValidDeepDiveRecordShape(val: unknown): val is DeepDiveHistoryRecord {
  if (!val || typeof val !== 'object') return false;
  const r = val as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    r.id.trim().length > 0 &&
    typeof r.canonicalProductId === 'string' &&
    r.canonicalProductId.trim().length > 0 &&
    typeof r.analyzedAt === 'string' &&
    r.analyzedAt.trim().length > 0 &&
    Array.isArray(r.analysisIds)
  );
}

function sanitizeSavedRecord(rec: SavedProductRecord): SavedProductRecord {
  const cleanProduct = sanitizeProduct(rec.product);
  const cleanSources = Array.isArray(rec.sources)
    ? rec.sources.map((src) => ({
        ...src,
        url: sanitizeOptionalUrl(src.url),
        verified: src.verified === true && Boolean(sanitizeOptionalUrl(src.url)),
      }))
    : cleanProduct.sources;

  return {
    ...rec,
    product: cleanProduct,
    sources: cleanSources,
  };
}

function sanitizeHistoryRecord(rec: ResearchHistoryRecord): ResearchHistoryRecord {
  const validProducts = rec.products.filter(isValidProductShape).map(sanitizeProduct);
  const cleanSnapshots: ResearchHistoryRecord['scoreSnapshots'] = {};
  if (rec.scoreSnapshots && typeof rec.scoreSnapshots === 'object') {
    for (const [k, snap] of Object.entries(rec.scoreSnapshots)) {
      if (!FORBIDDEN_KEYS.has(k) && snap && typeof snap === 'object') {
        cleanSnapshots[k] = snap;
      }
    }
  }
  return {
    ...rec,
    products: validProducts,
    productCount: validProducts.length,
    groundingSources: sanitizeGroundingSources(rec.groundingSources),
    scoreSnapshots: cleanSnapshots,
  };
}

function sanitizeSyncedCategories(raw: unknown): SyncedKalodataCategoryCache | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const parsed = raw as Partial<SyncedKalodataCategoryCache>;
  const l1IdBySlug: SyncedKalodataCategoryCache['l1IdBySlug'] = {};
  const l1NameBySlug: SyncedKalodataCategoryCache['l1NameBySlug'] = {};

  if (parsed.l1IdBySlug && typeof parsed.l1IdBySlug === 'object') {
    for (const [k, v] of Object.entries(parsed.l1IdBySlug)) {
      if (isValidProductCategory(k) && typeof v === 'string' && /^[A-Za-z0-9_-]{3,64}$/.test(v.trim())) {
        l1IdBySlug[k] = v.trim();
      }
    }
  }
  if (parsed.l1NameBySlug && typeof parsed.l1NameBySlug === 'object') {
    for (const [k, v] of Object.entries(parsed.l1NameBySlug)) {
      if (isValidProductCategory(k) && typeof v === 'string' && v.trim()) {
        l1NameBySlug[k] = v.trim();
      }
    }
  }
  const unsupportedSlugs = Array.from(
    new Set(
      Array.isArray(parsed.unsupportedSlugs)
        ? parsed.unsupportedSlugs.filter(
            (slug) => isValidProductCategory(slug) && !CATEGORY_BY_ID[slug]?.defaultKalodataId
          )
        : []
    )
  );
  for (const slug of unsupportedSlugs) {
    delete l1IdBySlug[slug];
    delete l1NameBySlug[slug];
  }

  return {
    schemaVersion: SYNCED_CATEGORIES_SCHEMA_VERSION,
    syncedAt: typeof parsed.syncedAt === 'string' ? parsed.syncedAt : null,
    subcategoriesSyncedAt:
      typeof parsed.subcategoriesSyncedAt === 'string' ? parsed.subcategoriesSyncedAt : null,
    l1IdBySlug,
    l1NameBySlug,
    unsupportedSlugs,
    subcategories: Array.isArray(parsed.subcategories)
      ? parsed.subcategories.filter(
          (item) =>
            Boolean(item) &&
            typeof item === 'object' &&
            typeof item.id === 'string' &&
            item.id.trim().length >= 3 &&
            typeof item.name === 'string' &&
            item.name.trim().length > 0
        )
      : [],
  };
}

function computeBackupCounts(data: SiamPickBackupDataPayload): BackupCountsSummary {
  const deepDiveProducts = Object.keys(data.deepDiveHistoryByProduct).length;
  const deepDiveRecords = Object.values(data.deepDiveHistoryByProduct).reduce(
    (sum, list) => sum + list.length,
    0
  );
  const researchHistoryProducts = data.researchHistory.reduce(
    (sum, rec) => sum + rec.products.length,
    0
  );
  const enrichmentCount = data.enrichmentCache
    ? Object.keys(data.enrichmentCache.products).length +
      Object.keys(data.enrichmentCache.shops).length +
      Object.keys(data.enrichmentCache.reviews).length
    : 0;
  const aiCount = data.aiAnalysisCache ? Object.keys(data.aiAnalysisCache).length : 0;

  return {
    savedProducts: data.savedProducts.length,
    researchHistorySessions: data.researchHistory.length,
    researchHistoryProducts,
    deepDiveProducts,
    deepDiveRecords,
    latestSessionProducts: data.latestResearchSession?.products.length ?? 0,
    cachedEnrichments: enrichmentCount,
    cachedAiAnalyses: aiCount,
    syncedSubcategories: data.syncedCategories?.subcategories.length ?? 0,
  };
}

/**
 * Returns live local counts for the Backup UI before exporting.
 */
export function getLocalBackupInventoryCounts(): BackupCountsSummary {
  const savedProducts = loadSavedProducts();
  const researchHistory = loadResearchHistory();
  const deepDiveHistoryByProduct = loadAllDeepDiveHistoryByProduct();
  const latestResearchSession = loadLatestResearchSession();
  const enrichmentCache = loadEnrichmentCache();
  const aiAnalysisCache = loadAiAnalysisCacheMap();
  const syncedCategories = loadSyncedKalodataCategories();

  return computeBackupCounts({
    savedProducts,
    researchHistory,
    deepDiveHistoryByProduct,
    latestResearchSession,
    enrichmentCache,
    aiAnalysisCache,
    syncedCategories,
  });
}

/**
 * Builds a complete, schema-versioned, secret-free Backup JSON payload ready for file download.
 */
export function buildSiamPickBackupSnapshot(
  scopeInput?: Partial<BackupScopeSelection>
): {
  backup: SiamPickBackupFileV1;
  json: string;
  filename: string;
  bytesUsed: number;
} {
  const scope: BackupScopeSelection = { ...DEFAULT_BACKUP_SCOPE, ...scopeInput };

  const savedProducts = scope.includeSaved ? loadSavedProducts().map(sanitizeSavedRecord) : [];
  const researchHistory = scope.includeHistory
    ? loadResearchHistory().map(sanitizeHistoryRecord)
    : [];
  const deepDiveHistoryByProduct = scope.includeDeepDive
    ? loadAllDeepDiveHistoryByProduct()
    : {};
  const latestResearchSession = scope.includeLatestSession
    ? loadLatestResearchSession()
    : null;
  const enrichmentCache = scope.includeCaches ? loadEnrichmentCache() : undefined;
  const aiAnalysisCache = scope.includeCaches ? loadAiAnalysisCacheMap() : undefined;
  const syncedCategories = scope.includeCaches ? loadSyncedKalodataCategories() : undefined;

  const data: SiamPickBackupDataPayload = scrubUntrustedObject({
    savedProducts,
    researchHistory,
    deepDiveHistoryByProduct,
    latestResearchSession: latestResearchSession
      ? {
          ...latestResearchSession,
          products: latestResearchSession.products.map(sanitizeProduct),
          groundingSources: sanitizeGroundingSources(latestResearchSession.groundingSources),
        }
      : null,
    ...(enrichmentCache ? { enrichmentCache } : {}),
    ...(aiAnalysisCache ? { aiAnalysisCache } : {}),
    ...(syncedCategories ? { syncedCategories } : {}),
  });

  const exportedAt = new Date().toISOString();
  const backup: SiamPickBackupFileV1 = {
    format: SIAMPICK_BACKUP_FORMAT,
    schemaVersion: SIAMPICK_BACKUP_SCHEMA_VERSION,
    app: 'SiamPick',
    exportedAt,
    counts: computeBackupCounts(data),
    data,
  };

  const json = JSON.stringify(backup, null, 2);
  const datePart = exportedAt.slice(0, 10);
  return {
    backup,
    json,
    filename: `siampick-backup-${datePart}.json`,
    bytesUsed: json.length * 2,
  };
}

/**
 * Validates and sanitizes an uploaded or pasted Backup JSON string before touching localStorage.
 */
export function parseAndValidateSiamPickBackup(rawJson: string): BackupParseResult {
  if (typeof rawJson !== 'string' || !rawJson.trim()) {
    return {
      ok: false,
      errorEn: 'The selected backup file is empty.',
      errorMy: 'ရွေးချယ်ထားသော Backup ဖိုင်သည် ဗလာဖြစ်နေပါသည်။',
    };
  }

  if (rawJson.length * 2 > MAX_BACKUP_FILE_BYTES) {
    return {
      ok: false,
      errorEn: 'Backup file exceeds the 15 MB safety limit.',
      errorMy: 'Backup ဖိုင်အရွယ်အစားသည် 15 MB ကန့်သတ်ချက်ထက် ကျော်လွန်နေပါသည်။',
    };
  }

  let parsedRaw: unknown;
  try {
    parsedRaw = JSON.parse(rawJson);
  } catch {
    return {
      ok: false,
      errorEn: 'Invalid JSON syntax. Please choose a valid SiamPick backup (.json) file.',
      errorMy: 'JSON ဖိုင်ပုံစံ မှားယွင်းနေပါသည်။ မှန်ကန်သော SiamPick Backup (.json) ဖိုင်ကို ရွေးချယ်ပါ။',
    };
  }

  if (!parsedRaw || typeof parsedRaw !== 'object' || Array.isArray(parsedRaw)) {
    return {
      ok: false,
      errorEn: 'Backup file must contain a SiamPick backup JSON object.',
      errorMy: 'Backup ဖိုင်သည် SiamPick Backup JSON ပုံစံဖြစ်ရပါမည်။',
    };
  }

  const scrubbed = scrubUntrustedObject(parsedRaw) as Record<string, unknown>;

  // Helpful distinction if the user accidentally picked an Export JSON analytics summary
  if (scrubbed.format !== SIAMPICK_BACKUP_FORMAT) {
    if (scrubbed.app === 'SiamPick' && Array.isArray(scrubbed.items)) {
      return {
        ok: false,
        errorEn:
          'This looks like a SiamPick Export JSON report (analytics summary), not a SiamPick Backup file. Please use a file created with "Download Backup".',
        errorMy:
          'ဤဖိုင်သည် Product Report Export JSON ဖိုင်ဖြစ်ပြီး Backup ဖိုင်မဟုတ်ပါ။ "Backup ဖိုင်သိမ်းမည်" ဖြင့် ထုတ်ထားသော Backup (.json) ဖိုင်ကို ရွေးချယ်ပါ။',
      };
    }
    return {
      ok: false,
      errorEn: 'Unrecognized file format. Expected a SiamPick Backup JSON file.',
      errorMy: 'SiamPick Backup ဖိုင်ပုံစံ မဟုတ်ပါ။ မှန်ကန်သော Backup ဖိုင်ကို စစ်ဆေးပါ။',
    };
  }

  if (!scrubbed.data || typeof scrubbed.data !== 'object' || Array.isArray(scrubbed.data)) {
    return {
      ok: false,
      errorEn: 'Backup file is missing its "data" payload.',
      errorMy: 'Backup ဖိုင်ထဲတွင် ဒေတာအချက်အလက် ("data") ပျောက်ဆုံးနေပါသည်။',
    };
  }

  const rawData = scrubbed.data as Record<string, unknown>;
  let skippedInvalidCount = 0;

  // Validate Saved Products
  const savedProducts: SavedProductRecord[] = [];
  if (Array.isArray(rawData.savedProducts)) {
    for (const item of rawData.savedProducts) {
      if (isValidSavedProductShape(item)) {
        savedProducts.push(sanitizeSavedRecord(item));
      } else {
        skippedInvalidCount += 1;
      }
    }
  }

  // Validate Research History
  const researchHistory: ResearchHistoryRecord[] = [];
  if (Array.isArray(rawData.researchHistory)) {
    for (const item of rawData.researchHistory) {
      if (isValidHistoryRecordShape(item)) {
        researchHistory.push(sanitizeHistoryRecord(item));
      } else {
        skippedInvalidCount += 1;
      }
    }
  }
  researchHistory.sort(
    (a, b) => (Date.parse(b.researchedAt) || 0) - (Date.parse(a.researchedAt) || 0)
  );

  // Validate Deep Dive History Map
  const deepDiveHistoryByProduct: Record<string, DeepDiveHistoryRecord[]> = {};
  if (
    rawData.deepDiveHistoryByProduct &&
    typeof rawData.deepDiveHistoryByProduct === 'object' &&
    !Array.isArray(rawData.deepDiveHistoryByProduct)
  ) {
    for (const [productId, list] of Object.entries(
      rawData.deepDiveHistoryByProduct as Record<string, unknown>
    )) {
      if (!productId || FORBIDDEN_KEYS.has(productId) || !Array.isArray(list)) {
        continue;
      }
      const validList: DeepDiveHistoryRecord[] = [];
      for (const rec of list) {
        if (isValidDeepDiveRecordShape(rec)) {
          validList.push(rec);
        } else {
          skippedInvalidCount += 1;
        }
      }
      if (validList.length > 0) {
        validList.sort((a, b) => (Date.parse(b.analyzedAt) || 0) - (Date.parse(a.analyzedAt) || 0));
        deepDiveHistoryByProduct[productId] = validList;
      }
    }
  }

  // Validate Latest Research Session
  let latestResearchSession: LatestResearchSessionSnapshot | null = null;
  if (
    rawData.latestResearchSession &&
    typeof rawData.latestResearchSession === 'object' &&
    !Array.isArray(rawData.latestResearchSession)
  ) {
    const sess = rawData.latestResearchSession as Partial<LatestResearchSessionSnapshot>;
    if (Array.isArray(sess.products) && sess.sessionMeta && typeof sess.sessionMeta === 'object') {
      const validProducts = sess.products.filter(isValidProductShape).map(sanitizeProduct);
      latestResearchSession = {
        schemaVersion: typeof sess.schemaVersion === 'number' ? sess.schemaVersion : 1,
        updatedAt:
          typeof sess.updatedAt === 'string' && sess.updatedAt
            ? sess.updatedAt
            : typeof sess.researchedAt === 'string' && sess.researchedAt
              ? sess.researchedAt
              : new Date().toISOString(),
        products: validProducts,
        sessionMeta: {
          requestedQuantity:
            typeof sess.sessionMeta.requestedQuantity === 'number' &&
            Number.isFinite(sess.sessionMeta.requestedQuantity)
              ? sess.sessionMeta.requestedQuantity
              : validProducts.length,
          verifiedProductCount:
            typeof sess.sessionMeta.verifiedProductCount === 'number' &&
            Number.isFinite(sess.sessionMeta.verifiedProductCount)
              ? sess.sessionMeta.verifiedProductCount
              : validProducts.length,
          filteredOutCount:
            typeof sess.sessionMeta.filteredOutCount === 'number' &&
            Number.isFinite(sess.sessionMeta.filteredOutCount)
              ? sess.sessionMeta.filteredOutCount
              : 0,
          myanmarFilterApplied: sess.sessionMeta.myanmarFilterApplied === true,
          myanmarCandidatesScanned:
            typeof sess.sessionMeta.myanmarCandidatesScanned === 'number'
              ? sess.sessionMeta.myanmarCandidatesScanned
              : undefined,
          myanmarReviewDiscovery: sess.sessionMeta.myanmarReviewDiscovery,
          myanmarVideoDiscovery: sess.sessionMeta.myanmarVideoDiscovery,
        },
        lastCostSummary: sess.lastCostSummary ?? null,
        researchSourceMode:
          sess.researchSourceMode === 'kalodata-openapi' ? 'kalodata-openapi' : null,
        researchedAt: typeof sess.researchedAt === 'string' ? sess.researchedAt : null,
        groundingSources: sanitizeGroundingSources(sess.groundingSources),
        searchQueries: Array.isArray(sess.searchQueries)
          ? sess.searchQueries.filter((q): q is string => typeof q === 'string')
          : [],
        activeHuntConfig:
          sess.activeHuntConfig && typeof sess.activeHuntConfig === 'object'
            ? sess.activeHuntConfig
            : null,
        rejectedIds: Array.isArray(sess.rejectedIds)
          ? sess.rejectedIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
          : [],
      };
    }
  }

  // Optional caches
  const enrichmentCache =
    rawData.enrichmentCache && typeof rawData.enrichmentCache === 'object'
      ? (rawData.enrichmentCache as EnrichmentCacheEnvelopeV1)
      : undefined;
  const aiAnalysisCache =
    rawData.aiAnalysisCache && typeof rawData.aiAnalysisCache === 'object'
      ? (rawData.aiAnalysisCache as Record<string, CachedAiAnalysisEntry>)
      : undefined;
  const syncedCategories = sanitizeSyncedCategories(rawData.syncedCategories);

  const normalizedData: SiamPickBackupDataPayload = {
    savedProducts,
    researchHistory,
    deepDiveHistoryByProduct,
    latestResearchSession,
    ...(enrichmentCache ? { enrichmentCache } : {}),
    ...(aiAnalysisCache ? { aiAnalysisCache } : {}),
    ...(syncedCategories ? { syncedCategories } : {}),
  };

  const counts = computeBackupCounts(normalizedData);
  const exportedAt =
    typeof scrubbed.exportedAt === 'string' && scrubbed.exportedAt
      ? scrubbed.exportedAt
      : new Date().toISOString();
  const schemaVersion =
    typeof scrubbed.schemaVersion === 'number'
      ? scrubbed.schemaVersion
      : SIAMPICK_BACKUP_SCHEMA_VERSION;

  const normalizedBackup: SiamPickBackupFileV1 = {
    format: SIAMPICK_BACKUP_FORMAT,
    schemaVersion,
    app: 'SiamPick',
    exportedAt,
    counts,
    data: normalizedData,
  };

  const hasCaches =
    counts.cachedEnrichments > 0 ||
    counts.cachedAiAnalyses > 0 ||
    counts.syncedSubcategories > 0;

  return {
    ok: true,
    backup: normalizedBackup,
    preview: {
      exportedAt,
      schemaVersion,
      counts,
      hasLatestSession: Boolean(latestResearchSession && latestResearchSession.products.length > 0),
      hasCaches,
      skippedInvalidCount,
      estimatedBytes: rawJson.length * 2,
    },
  };
}

function mergeSavedProductLists(
  existing: readonly SavedProductRecord[],
  incoming: readonly SavedProductRecord[]
): { merged: SavedProductRecord[]; addedCount: number } {
  const byKey = new Map<string, SavedProductRecord>();
  const keyFor = (rec: SavedProductRecord): string => {
    const cid = getCanonicalProductId(rec.product);
    return cid || rec.id;
  };

  for (const item of existing) {
    byKey.set(keyFor(item), item);
  }

  let addedCount = 0;
  for (const inc of incoming) {
    const key = keyFor(inc);
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, inc);
      addedCount += 1;
    } else {
      const prevTs = Date.parse(prev.savedAt || '') || 0;
      const incTs = Date.parse(inc.savedAt || '') || 0;
      // Preserve enriched/AI data if either copy has it
      const mergedProduct: ResearchProduct = {
        ...(incTs > prevTs ? inc.product : prev.product),
        aiAnalysis:
          inc.product.aiAnalysis?.source === 'gemini'
            ? inc.product.aiAnalysis
            : prev.product.aiAnalysis ?? inc.product.aiAnalysis,
      };
      byKey.set(key, {
        ...(incTs > prevTs ? inc : prev),
        product: mergedProduct,
      });
    }
  }

  const merged = Array.from(byKey.values()).sort(
    (a, b) => (Date.parse(b.savedAt || '') || 0) - (Date.parse(a.savedAt || '') || 0)
  );
  return { merged, addedCount };
}

function historyRunSignature(rec: ResearchHistoryRecord): string {
  return `${rec.researchedAt}|${rec.researchMode}|${rec.products.length}`;
}

function mergeResearchHistoryLists(
  existing: readonly ResearchHistoryRecord[],
  incoming: readonly ResearchHistoryRecord[]
): { merged: ResearchHistoryRecord[]; addedCount: number } {
  const byId = new Map<string, ResearchHistoryRecord>();
  const seenSignatures = new Set<string>();

  for (const rec of existing) {
    byId.set(rec.id, rec);
    seenSignatures.add(historyRunSignature(rec));
  }

  let addedCount = 0;
  for (const rec of incoming) {
    const sig = historyRunSignature(rec);
    if (byId.has(rec.id) || seenSignatures.has(sig)) {
      continue;
    }
    byId.set(rec.id, rec);
    seenSignatures.add(sig);
    addedCount += 1;
  }

  const merged = Array.from(byId.values()).sort(
    (a, b) => (Date.parse(b.researchedAt) || 0) - (Date.parse(a.researchedAt) || 0)
  );
  return { merged, addedCount };
}

function mergeDeepDiveMaps(
  existing: Record<string, DeepDiveHistoryRecord[]>,
  incoming: Record<string, DeepDiveHistoryRecord[]>
): Record<string, DeepDiveHistoryRecord[]> {
  const merged: Record<string, DeepDiveHistoryRecord[]> = {};
  const allKeys = new Set([...Object.keys(existing), ...Object.keys(incoming)]);

  for (const key of allKeys) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    const prevList = existing[key] ?? [];
    const incList = incoming[key] ?? [];
    const byId = new Map<string, DeepDiveHistoryRecord>();
    for (const r of prevList) byId.set(r.id, r);
    for (const r of incList) {
      if (!byId.has(r.id)) {
        byId.set(r.id, r);
      }
    }
    const sorted = Array.from(byId.values())
      .sort((a, b) => (Date.parse(b.analyzedAt) || 0) - (Date.parse(a.analyzedAt) || 0))
      .slice(0, MAX_DEEP_DIVE_HISTORY_PER_PRODUCT);
    if (sorted.length > 0) {
      merged[key] = sorted;
    }
  }
  return merged;
}

/**
 * Restores a validated SiamPickBackupFileV1 into browser localStorage using Merge or Replace mode.
 * Never wipes existing records if localStorage quota throws an error.
 */
export function restoreSiamPickBackup(
  backup: SiamPickBackupFileV1,
  options: {
    mode: BackupRestoreMode;
    scope?: Partial<BackupScopeSelection>;
  }
): BackupRestoreResult {
  const mode = options.mode;
  const scope: BackupScopeSelection = { ...DEFAULT_BACKUP_SCOPE, ...options.scope };
  const writeErrors: StorageWriteResult[] = [];

  // Current snapshots before restore
  const currentSaved = loadSavedProducts();
  const currentHistory = loadResearchHistory();
  const currentDeepDive = loadAllDeepDiveHistoryByProduct();
  const currentLatest = loadLatestResearchSession();

  let nextSaved = currentSaved;
  let savedProductsAdded = 0;

  if (scope.includeSaved) {
    if (mode === 'replace') {
      nextSaved = backup.data.savedProducts;
      savedProductsAdded = nextSaved.length;
    } else {
      const res = mergeSavedProductLists(currentSaved, backup.data.savedProducts);
      nextSaved = res.merged;
      savedProductsAdded = res.addedCount;
    }
    const writeRes = persistSavedProductsWithStatus(nextSaved);
    if (!writeRes.ok) {
      writeErrors.push(writeRes);
      nextSaved = currentSaved;
      savedProductsAdded = 0;
    }
  }

  let nextHistory = currentHistory;
  let historyAdded = 0;

  if (scope.includeHistory) {
    if (mode === 'replace') {
      nextHistory = backup.data.researchHistory;
      historyAdded = nextHistory.length;
    } else {
      const res = mergeResearchHistoryLists(currentHistory, backup.data.researchHistory);
      nextHistory = res.merged;
      historyAdded = res.addedCount;
    }
    const writeRes = persistResearchHistory(nextHistory);
    if (!writeRes.ok) {
      writeErrors.push(writeRes);
      nextHistory = currentHistory;
      historyAdded = 0;
    }
  }

  let nextDeepDive = currentDeepDive;
  if (scope.includeDeepDive) {
    nextDeepDive =
      mode === 'replace'
        ? backup.data.deepDiveHistoryByProduct
        : mergeDeepDiveMaps(currentDeepDive, backup.data.deepDiveHistoryByProduct);

    const writeRes = persistAllDeepDiveHistoryByProduct(nextDeepDive);
    if (!writeRes.ok) {
      writeErrors.push(writeRes);
      nextDeepDive = currentDeepDive;
    }
  }

  let nextLatest: LatestResearchSessionSnapshot | null = currentLatest;
  let latestSessionApplied = false;

  if (scope.includeLatestSession) {
    const incomingSession = backup.data.latestResearchSession;
    if (mode === 'replace') {
      if (incomingSession) {
        const writeRes = persistLatestResearchSession({
          products: incomingSession.products,
          sessionMeta: incomingSession.sessionMeta,
          lastCostSummary: incomingSession.lastCostSummary,
          researchSourceMode: incomingSession.researchSourceMode,
          researchedAt: incomingSession.researchedAt,
          groundingSources: incomingSession.groundingSources,
          searchQueries: incomingSession.searchQueries,
          activeHuntConfig: incomingSession.activeHuntConfig,
          rejectedIds: incomingSession.rejectedIds,
        });
        if (writeRes.ok) {
          nextLatest = incomingSession;
          latestSessionApplied = true;
        } else {
          writeErrors.push(writeRes);
        }
      } else {
        clearLatestResearchSession();
        nextLatest = null;
        latestSessionApplied = true;
      }
    } else if (incomingSession && incomingSession.products.length > 0) {
      const currentTs = Date.parse(currentLatest?.researchedAt || currentLatest?.updatedAt || '') || 0;
      const incomingTs = Date.parse(incomingSession.researchedAt || incomingSession.updatedAt || '') || 0;
      const shouldApplyInMerge = !currentLatest || currentLatest.products.length === 0 || incomingTs > currentTs;
      if (shouldApplyInMerge) {
        const writeRes = persistLatestResearchSession({
          products: incomingSession.products,
          sessionMeta: incomingSession.sessionMeta,
          lastCostSummary: incomingSession.lastCostSummary,
          researchSourceMode: incomingSession.researchSourceMode,
          researchedAt: incomingSession.researchedAt,
          groundingSources: incomingSession.groundingSources,
          searchQueries: incomingSession.searchQueries,
          activeHuntConfig: incomingSession.activeHuntConfig,
          rejectedIds: incomingSession.rejectedIds,
        });
        if (writeRes.ok) {
          nextLatest = incomingSession;
          latestSessionApplied = true;
        } else {
          writeErrors.push(writeRes);
        }
      }
    }
  }

  let syncedCategories: SyncedKalodataCategoryCache | null = null;
  let cachesApplied = false;

  if (scope.includeCaches) {
    if (backup.data.enrichmentCache || mode === 'replace') {
      const enrichRes = replaceOrMergeEnrichmentCache(backup.data.enrichmentCache, mode);
      if (!enrichRes.ok) {
        writeErrors.push(enrichRes);
      } else {
        cachesApplied = true;
      }
    }

    if (backup.data.aiAnalysisCache || mode === 'replace') {
      const aiRes = replaceOrMergeAiAnalysisCache(backup.data.aiAnalysisCache, mode);
      if (!aiRes.ok) {
        writeErrors.push(aiRes);
      } else {
        cachesApplied = true;
      }
    }

    // Also absorb enrichment from restored products so reuse remains instant at 0 credits
    const allRestoredProducts = [
      ...nextSaved.map((r) => r.product),
      ...nextHistory.flatMap((h) => h.products),
    ];
    if (allRestoredProducts.length > 0) {
      absorbProductsIntoEnrichmentCache(allRestoredProducts);
    }

    if (backup.data.syncedCategories) {
      if (mode === 'replace') {
        saveSyncedKalodataCategories(backup.data.syncedCategories);
        syncedCategories = backup.data.syncedCategories;
      } else {
        const currentCat = loadSyncedKalodataCategories();
        const incCat = backup.data.syncedCategories;
        const subMap = new Map(currentCat.subcategories.map((s) => [s.id, s]));
        for (const s of incCat.subcategories) {
          if (!subMap.has(s.id)) subMap.set(s.id, s);
        }
        const mergedCat: SyncedKalodataCategoryCache = {
          schemaVersion: SYNCED_CATEGORIES_SCHEMA_VERSION,
          syncedAt: incCat.syncedAt ?? currentCat.syncedAt,
          subcategoriesSyncedAt: incCat.subcategoriesSyncedAt ?? currentCat.subcategoriesSyncedAt,
          l1IdBySlug: { ...incCat.l1IdBySlug, ...currentCat.l1IdBySlug },
          l1NameBySlug: { ...incCat.l1NameBySlug, ...currentCat.l1NameBySlug },
          unsupportedSlugs: Array.from(
            new Set([...currentCat.unsupportedSlugs, ...incCat.unsupportedSlugs])
          ),
          subcategories: Array.from(subMap.values()),
        };
        saveSyncedKalodataCategories(mergedCat);
        syncedCategories = mergedCat;
      }
      cachesApplied = true;
    }
  }

  const deepDiveRecordsTotal = Object.values(nextDeepDive).reduce(
    (sum, list) => sum + list.length,
    0
  );

  return {
    ok: writeErrors.length === 0,
    mode,
    appliedCounts: {
      savedProductsAdded,
      savedProductsTotal: nextSaved.length,
      historyAdded,
      historyTotal: nextHistory.length,
      deepDiveRecordsTotal,
      latestSessionApplied,
      cachesApplied,
    },
    savedRecords: nextSaved,
    researchHistory: nextHistory,
    deepDiveHistoryByProduct: nextDeepDive,
    latestResearchSession: nextLatest,
    syncedCategories,
    writeErrors,
  };
}
