import { Language, ResearchProduct, SavedProductRecord } from '../types/product';

const STORAGE_KEY = 'siampick_saved_products_v1';

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
    validPrice &&
    typeof product.scoringInputs === 'object' &&
    product.scoringInputs !== null
  );
}

export function loadSavedProducts(): SavedProductRecord[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidSavedRecord);
  } catch {
    return [];
  }
}

export function persistSavedProducts(records: SavedProductRecord[]): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    return true;
  } catch {
    return false;
  }
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
