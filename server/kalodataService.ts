import type { CategoryFilter, ProductCategory } from '../src/types/product.ts';

const KALODATA_BALANCE_ENDPOINT = 'https://www.kalodata.com/openapi/v1/credit/balance';
const KALODATA_AUTH_HEADER = 'secret-key';

/**
 * Thailand (TH) TikTok Shop Level-1 Category IDs verified via live Kalodata Category Rank API.
 * - "601152" = Womenswear & Underwear (Rank #2 in TH)
 * - "601450" = Beauty & Personal Care (Rank #1 in TH)
 */
export const KALODATA_TH_CATEGORY_IDS: Record<ProductCategory, string> = {
  'womens-fashion': '601152',
  'cosmetics-beauty': '601450',
};

export function getKalodataCategoryIdsForFilter(category: CategoryFilter): string[] {
  if (category === 'womens-fashion') {
    return [KALODATA_TH_CATEGORY_IDS['womens-fashion']];
  }
  if (category === 'cosmetics-beauty') {
    return [KALODATA_TH_CATEGORY_IDS['cosmetics-beauty']];
  }
  return [
    KALODATA_TH_CATEGORY_IDS['womens-fashion'],
    KALODATA_TH_CATEGORY_IDS['cosmetics-beauty'],
  ];
}

export function getKalodataCategoryIdsForSelection(
  selectedCategories: ProductCategory[]
): string[] {
  const unique = Array.from(
    new Set(
      selectedCategories.filter(
        (c): c is ProductCategory => c === 'womens-fashion' || c === 'cosmetics-beauty'
      )
    )
  );
  return unique.map((c) => KALODATA_TH_CATEGORY_IDS[c]);
}

export function resolveProductCategoryFromKalodataId(
  priCategoryId: string | null | undefined
): ProductCategory | null {
  const normalized = (priCategoryId ?? '').trim();
  if (normalized === KALODATA_TH_CATEGORY_IDS['womens-fashion']) {
    return 'womens-fashion';
  }
  if (normalized === KALODATA_TH_CATEGORY_IDS['cosmetics-beauty']) {
    return 'cosmetics-beauty';
  }
  return null;
}

export interface KalodataBalanceEntry {
  key: string;
  value: string | number | boolean;
}

export interface KalodataBalanceResult {
  ok: boolean;
  configured: boolean;
  endpoint: string;
  authHeader: string;
  httpStatus: number | null;
  checkedAt: string;
  balance: number | null;
  unit: string | null;
  fields: KalodataBalanceEntry[];
  rawData: unknown;
  upstreamCode?: string;
  errorCategory?: string;
  error?: string;
  errorMy?: string;
}

function getKalodataApiKey(): string | null {
  const key = (
    process.env.KALODATA_API_KEY ??
    process.env.KALODATA_SECRET_KEY ??
    ''
  ).trim();
  if (!key || key === 'MY_KALODATA_API_KEY') {
    return null;
  }
  return key;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function extractBalanceSummary(data: unknown): {
  balance: number | null;
  unit: string | null;
  fields: KalodataBalanceEntry[];
} {
  const directNum = toFiniteNumber(data);
  if (directNum !== null) {
    return {
      balance: directNum,
      unit: 'credits',
      fields: [{ key: 'balance', value: directNum }],
    };
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { balance: null, unit: null, fields: [] };
  }

  const record = data as Record<string, unknown>;
  const fields: KalodataBalanceEntry[] = [];

  for (const [key, val] of Object.entries(record)) {
    if (typeof val === 'number' || typeof val === 'string' || typeof val === 'boolean') {
      fields.push({ key, value: val });
    }
  }

  const priorityKeys = [
    'balance',
    'remaining_credits',
    'remainingCredits',
    'creditBalance',
    'credit_balance',
    'availableCredits',
    'available_credits',
    'credits',
    'credit',
    'remaining',
  ];

  let balance: number | null = null;
  for (const key of priorityKeys) {
    if (key in record) {
      const num = toFiniteNumber(record[key]);
      if (num !== null) {
        balance = num;
        break;
      }
    }
  }

  if (balance === null) {
    for (const entry of fields) {
      const num = toFiniteNumber(entry.value);
      if (num !== null) {
        balance = num;
        break;
      }
    }
  }

  const currency = typeof record.currency === 'string' && record.currency.trim() ? record.currency.trim() : null;
  return {
    balance,
    unit: currency ?? (balance !== null ? 'credits' : null),
    fields,
  };
}

function buildBurmeseError(message: string, upstreamCode?: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('not allowed') || lower.includes('invalid') || lower.includes('unauthorized')) {
    return `Kalodata Secret Key မမှန်ကန်ပါ သို့မဟုတ် ခွင့်ပြုချက်မရှိပါ (${upstreamCode ? `Code ${upstreamCode}: ` : ''}${message})။ Settings > Secrets ရှိ KALODATA_API_KEY ကို ပြန်လည်စစ်ဆေးပါ။`;
  }
  if (lower.includes('not null or empty')) {
    return `Kalodata Secret Key Header (${KALODATA_AUTH_HEADER}) မပါဝင်ပါ (${message})။`;
  }
  if (lower.includes('rate') || lower.includes('limit') || lower.includes('429')) {
    return `Kalodata API Request ကန့်သတ်ချက် ပြည့်နေပါသည် (${message})။ ခေတ္တစောင့်ပြီး ထပ်မံစမ်းသပ်ပါ။`;
  }
  return `Kalodata Free Credit Balance API ခေါ်ဆိုမှု မအောင်မြင်ပါ (${upstreamCode ? `Code ${upstreamCode}: ` : ''}${message})။`;
}

const FREE_BALANCE_MAX_ATTEMPTS = 2;
const FREE_BALANCE_RETRY_DELAY_MS = 500;

function isTransientHttpStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

function isAbortTimeoutError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = 'name' in err ? String((err as { name?: unknown }).name ?? '') : '';
  const msg = 'message' in err ? String((err as { message?: unknown }).message ?? '') : '';
  return (
    name === 'TimeoutError' ||
    name === 'AbortError' ||
    msg.toLowerCase().includes('timeout') ||
    msg.toLowerCase().includes('aborted')
  );
}

/**
 * Calls Kalodata Open Center's Free Credit Balance endpoint strictly from the backend.
 * Official endpoint: GET https://www.kalodata.com/openapi/v1/credit/balance
 * Official header:   secret-key: <KALODATA_API_KEY>
 * Safe to retry ONCE on transient network/timeout/5xx errors because this endpoint costs 0 credits.
 */
export async function fetchKalodataCreditBalance(): Promise<KalodataBalanceResult> {
  const checkedAt = new Date().toISOString();
  const apiKey = getKalodataApiKey();

  if (!apiKey) {
    return {
      ok: false,
      configured: false,
      endpoint: KALODATA_BALANCE_ENDPOINT,
      authHeader: KALODATA_AUTH_HEADER,
      httpStatus: null,
      checkedAt,
      balance: null,
      unit: null,
      fields: [],
      rawData: null,
      upstreamCode: 'MISSING_API_KEY',
      error:
        'KALODATA_API_KEY is not configured in backend environment variables. Add it in Settings > Secrets and retry.',
      errorMy:
        'Backend Environment Variable ထဲတွင် KALODATA_API_KEY မထည့်သွင်းရသေးပါ။ Settings > Secrets တွင် KALODATA_API_KEY ကို ထည့်သွင်းပြီး ပြန်လည်စမ်းသပ်ပါ။',
    };
  }

  let lastResult: KalodataBalanceResult | null = null;

  for (let attempt = 1; attempt <= FREE_BALANCE_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(KALODATA_BALANCE_ENDPOINT, {
        method: 'GET',
        signal: AbortSignal.timeout(10_000),
        headers: {
          [KALODATA_AUTH_HEADER]: apiKey,
          Accept: 'application/json',
          'Content-Type': 'application/json;charset=utf-8',
        },
      });

      const rawText = await response.text();
      let parsed: Record<string, unknown> | null = null;
      try {
        const json = JSON.parse(rawText) as unknown;
        if (json && typeof json === 'object' && !Array.isArray(json)) {
          parsed = json as Record<string, unknown>;
        }
      } catch {
        parsed = null;
      }

      if (!parsed) {
        const snippet = rawText.trim().slice(0, 180) || `HTTP ${response.status}`;
        lastResult = {
          ok: false,
          configured: true,
          endpoint: KALODATA_BALANCE_ENDPOINT,
          authHeader: KALODATA_AUTH_HEADER,
          httpStatus: response.status,
          checkedAt,
          balance: null,
          unit: null,
          fields: [],
          rawData: null,
          upstreamCode: `HTTP_${response.status}`,
          error: `Unexpected non-JSON response from Kalodata (HTTP ${response.status}): ${snippet}`,
          errorMy: `Kalodata မှ JSON မဟုတ်သော တုံ့ပြန်မှု ရရှိပါသည် (HTTP ${response.status})။`,
        };
        if (attempt < FREE_BALANCE_MAX_ATTEMPTS && isTransientHttpStatus(response.status)) {
          await new Promise((resolve) => setTimeout(resolve, FREE_BALANCE_RETRY_DELAY_MS));
          continue;
        }
        return lastResult;
      }

      const upstreamCode =
        parsed.code !== undefined && parsed.code !== null ? String(parsed.code) : undefined;
      const errorCategory =
        typeof parsed.errorCategory === 'string' && parsed.errorCategory.trim()
          ? parsed.errorCategory.trim()
          : undefined;
      const upstreamMessage =
        typeof parsed.message === 'string' && parsed.message.trim()
          ? parsed.message.trim()
          : typeof parsed.msg === 'string' && parsed.msg.trim()
            ? parsed.msg.trim()
            : '';

      // Kalodata OpenAPI returns HTTP 200 even on business/auth errors with { success: false, code, message }
      const isExplicitFailure =
        !response.ok ||
        parsed.success === false ||
        (upstreamCode !== undefined &&
          upstreamCode !== '0' &&
          upstreamCode !== '200' &&
          parsed.success !== true);

      if (isExplicitFailure) {
        const errMsg = upstreamMessage || `Kalodata API returned HTTP ${response.status}`;
        lastResult = {
          ok: false,
          configured: true,
          endpoint: KALODATA_BALANCE_ENDPOINT,
          authHeader: KALODATA_AUTH_HEADER,
          httpStatus: response.status,
          checkedAt,
          balance: null,
          unit: null,
          fields: [],
          rawData: parsed.data ?? null,
          upstreamCode,
          errorCategory,
          error: errMsg,
          errorMy: buildBurmeseError(errMsg, upstreamCode),
        };
        if (attempt < FREE_BALANCE_MAX_ATTEMPTS && isTransientHttpStatus(response.status)) {
          await new Promise((resolve) => setTimeout(resolve, FREE_BALANCE_RETRY_DELAY_MS));
          continue;
        }
        return lastResult;
      }

      const dataPayload = 'data' in parsed ? parsed.data : parsed;
      const summary = extractBalanceSummary(dataPayload);

      return {
        ok: true,
        configured: true,
        endpoint: KALODATA_BALANCE_ENDPOINT,
        authHeader: KALODATA_AUTH_HEADER,
        httpStatus: response.status,
        checkedAt,
        balance: summary.balance,
        unit: summary.unit,
        fields: summary.fields,
        rawData: dataPayload,
        upstreamCode,
      };
    } catch (err) {
      const timedOut = isAbortTimeoutError(err);
      const message =
        err instanceof Error ? err.message : 'Network error connecting to Kalodata OpenAPI.';
      lastResult = {
        ok: false,
        configured: true,
        endpoint: KALODATA_BALANCE_ENDPOINT,
        authHeader: KALODATA_AUTH_HEADER,
        httpStatus: null,
        checkedAt,
        balance: null,
        unit: null,
        fields: [],
        rawData: null,
        upstreamCode: timedOut ? 'TIMEOUT' : 'NETWORK_ERROR',
        error: timedOut
          ? 'Kalodata Free Credit Balance request timed out after 10 seconds.'
          : `Failed to reach Kalodata OpenAPI: ${message}`,
        errorMy: timedOut
          ? 'Kalodata Credit Balance စစ်ဆေးမှု အချိန်ကျော်လွန်သွားပါသည် (10s Timeout)။ ခေတ္တစောင့်ပြီး ထပ်မံစမ်းသပ်ပါ။'
          : `Kalodata OpenAPI သို့ ချိတ်ဆက်၍ မရပါ (${message})။`,
      };
      if (attempt < FREE_BALANCE_MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, FREE_BALANCE_RETRY_DELAY_MS));
        continue;
      }
      return lastResult;
    }
  }

  return (
    lastResult ?? {
      ok: false,
      configured: true,
      endpoint: KALODATA_BALANCE_ENDPOINT,
      authHeader: KALODATA_AUTH_HEADER,
      httpStatus: null,
      checkedAt,
      balance: null,
      unit: null,
      fields: [],
      rawData: null,
      upstreamCode: 'NETWORK_ERROR',
      error: 'Unable to reach Kalodata OpenAPI.',
      errorMy: 'Kalodata OpenAPI သို့ ချိတ်ဆက်၍ မရပါ။',
    }
  );
}

const KALODATA_PRODUCT_RANK_ENDPOINT = 'https://www.kalodata.com/openapi/v1/tiktok/product/rank';

export interface KalodataProductRankRequest {
  region: string;
  language: string;
  currency: string;
  date_range: string;
  page_number?: number;
  page_size?: number;
  is_affiliate?: 0 | 1;
  sort_field: {
    field: string;
    type: 'ASC' | 'DESC';
  };
  category_ids?: string[];
  commission_rate?: string;
  unit_price_range?: string;
  keyword?: string;
  need_image?: 0 | 1 | 2;
  need_extra?: boolean;
}

export interface KalodataProductRankResult {
  ok: boolean;
  configured: boolean;
  endpoint: string;
  authHeader: string;
  httpStatus: number | null;
  checkedAt: string;
  requestParams: KalodataProductRankRequest;
  itemCount: number;
  items: Record<string, unknown>[];
  allFieldKeys: string[];
  cached: boolean | null;
  upstreamCode?: string;
  errorCategory?: string;
  message?: string;
  error?: string;
  errorMy?: string;
}

/**
 * Executes a single (non-retried) call to Kalodata Open Center's Product Rank API.
 * Official endpoint: POST https://www.kalodata.com/openapi/v1/tiktok/product/rank
 * Official header:   secret-key: <KALODATA_API_KEY>
 * Estimated cost:    0.1 Credit per call (for 1-100 returned rows).
 */
export async function fetchKalodataProductRank(
  params: KalodataProductRankRequest
): Promise<KalodataProductRankResult> {
  const checkedAt = new Date().toISOString();
  const apiKey = getKalodataApiKey();

  if (!apiKey) {
    return {
      ok: false,
      configured: false,
      endpoint: KALODATA_PRODUCT_RANK_ENDPOINT,
      authHeader: KALODATA_AUTH_HEADER,
      httpStatus: null,
      checkedAt,
      requestParams: params,
      itemCount: 0,
      items: [],
      allFieldKeys: [],
      cached: null,
      upstreamCode: 'MISSING_API_KEY',
      error:
        'KALODATA_API_KEY is not configured in backend environment variables. Add it in Settings > Secrets.',
      errorMy:
        'Backend Environment Variable ထဲတွင် KALODATA_API_KEY မထည့်သွင်းရသေးပါ။',
    };
  }

  try {
    const response = await fetch(KALODATA_PRODUCT_RANK_ENDPOINT, {
      method: 'POST',
      signal: AbortSignal.timeout(15_000),
      headers: {
        [KALODATA_AUTH_HEADER]: apiKey,
        Accept: 'application/json',
        'Content-Type': 'application/json;charset=UTF-8',
      },
      body: JSON.stringify(params),
    });

    const rawText = await response.text();
    let parsed: Record<string, unknown> | null = null;
    try {
      const json = JSON.parse(rawText) as unknown;
      if (json && typeof json === 'object' && !Array.isArray(json)) {
        parsed = json as Record<string, unknown>;
      }
    } catch {
      parsed = null;
    }

    if (!parsed) {
      const snippet = rawText.trim().slice(0, 240) || `HTTP ${response.status}`;
      return {
        ok: false,
        configured: true,
        endpoint: KALODATA_PRODUCT_RANK_ENDPOINT,
        authHeader: KALODATA_AUTH_HEADER,
        httpStatus: response.status,
        checkedAt,
        requestParams: params,
        itemCount: 0,
        items: [],
        allFieldKeys: [],
        cached: null,
        upstreamCode: `HTTP_${response.status}`,
        error: `Unexpected non-JSON response from Kalodata (HTTP ${response.status}): ${snippet}`,
        errorMy: `Kalodata မှ JSON မဟုတ်သော တုံ့ပြန်မှု ရရှိပါသည် (HTTP ${response.status})။`,
      };
    }

    const upstreamCode =
      parsed.code !== undefined && parsed.code !== null ? String(parsed.code) : undefined;
    const errorCategory =
      typeof parsed.errorCategory === 'string' && parsed.errorCategory.trim()
        ? parsed.errorCategory.trim()
        : undefined;
    const upstreamMessage =
      typeof parsed.message === 'string' && parsed.message.trim()
        ? parsed.message.trim()
        : typeof parsed.msg === 'string' && parsed.msg.trim()
          ? parsed.msg.trim()
          : '';
    const cached = typeof parsed.cached === 'boolean' ? parsed.cached : null;

    const isExplicitFailure =
      !response.ok ||
      parsed.success === false ||
      (upstreamCode !== undefined &&
        upstreamCode !== '0' &&
        upstreamCode !== '200' &&
        parsed.success !== true);

    if (isExplicitFailure) {
      const errMsg = upstreamMessage || `Kalodata API returned HTTP ${response.status}`;
      return {
        ok: false,
        configured: true,
        endpoint: KALODATA_PRODUCT_RANK_ENDPOINT,
        authHeader: KALODATA_AUTH_HEADER,
        httpStatus: response.status,
        checkedAt,
        requestParams: params,
        itemCount: 0,
        items: [],
        allFieldKeys: [],
        cached,
        upstreamCode,
        errorCategory,
        message: upstreamMessage || undefined,
        error: errMsg,
        errorMy: buildBurmeseError(errMsg, upstreamCode),
      };
    }

    const rawList = Array.isArray(parsed.data)
      ? parsed.data
      : parsed.data &&
          typeof parsed.data === 'object' &&
          Array.isArray((parsed.data as Record<string, unknown>).list)
        ? ((parsed.data as Record<string, unknown>).list as unknown[])
        : [];

    const items = rawList.filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === 'object' && !Array.isArray(item)
    );

    const keySet = new Set<string>();
    for (const item of items) {
      for (const key of Object.keys(item)) {
        keySet.add(key);
      }
    }

    return {
      ok: true,
      configured: true,
      endpoint: KALODATA_PRODUCT_RANK_ENDPOINT,
      authHeader: KALODATA_AUTH_HEADER,
      httpStatus: response.status,
      checkedAt,
      requestParams: params,
      itemCount: items.length,
      items,
      allFieldKeys: Array.from(keySet),
      cached,
      upstreamCode,
      message: upstreamMessage || undefined,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Network error connecting to Kalodata OpenAPI.';
    return {
      ok: false,
      configured: true,
      endpoint: KALODATA_PRODUCT_RANK_ENDPOINT,
      authHeader: KALODATA_AUTH_HEADER,
      httpStatus: null,
      checkedAt,
      requestParams: params,
      itemCount: 0,
      items: [],
      allFieldKeys: [],
      cached: null,
      upstreamCode: 'NETWORK_ERROR',
      error: `Failed to reach Kalodata OpenAPI: ${message}`,
      errorMy: `Kalodata OpenAPI သို့ ချိတ်ဆက်၍ မရပါ (${message})။`,
    };
  }
}

const KALODATA_CATEGORY_RANK_ENDPOINT = 'https://www.kalodata.com/openapi/v1/tiktok/category/rank';

export type KalodataCategoryRankDateRange =
  | 'last7Day'
  | 'last30Day'
  | 'last90Day'
  | 'last180Day'
  | 'last365Day';

export type KalodataCategoryRankSortField =
  | 'revenue'
  | 'revenue_growth_rate'
  | 'top3_shop_revenue_ratio'
  | 'average_revenue'
  | 'rank'
  | 'category_id'
  | 'category_name';

export interface KalodataCategoryRankRequest {
  region: string;
  language: string;
  currency: string;
  date_range: KalodataCategoryRankDateRange;
  category_level?: 1 | 2 | 3;
  page_number?: number;
  page_size?: number;
  sort_field: {
    field: KalodataCategoryRankSortField;
    type: 'ASC' | 'DESC';
  };
  category_ids?: string[];
  revenue_range?: string;
}

export interface KalodataCategoryRankItem {
  category_id: string;
  category_name: string;
  rank: number | null;
  revenue: number | null;
  sale: number | null;
  revenue_growth_rate: number | null;
  top3_shop_revenue_ratio: number | null;
  average_revenue: number | null;
}

export interface KalodataCategoryRankResult {
  ok: boolean;
  configured: boolean;
  endpoint: string;
  authHeader: string;
  httpStatus: number | null;
  checkedAt: string;
  requestParams: KalodataCategoryRankRequest;
  itemCount: number;
  items: KalodataCategoryRankItem[];
  rawItems: Record<string, unknown>[];
  allFieldKeys: string[];
  cached: boolean | null;
  upstreamCode?: string;
  errorCategory?: string;
  message?: string;
  error?: string;
  errorMy?: string;
}

function normalizeCategoryRankItem(item: Record<string, unknown>): KalodataCategoryRankItem {
  return {
    category_id:
      item.category_id !== undefined && item.category_id !== null ? String(item.category_id) : '',
    category_name: typeof item.category_name === 'string' ? item.category_name : '',
    rank: toFiniteNumber(item.rank),
    revenue: toFiniteNumber(item.revenue),
    sale: toFiniteNumber(item.sale),
    revenue_growth_rate: toFiniteNumber(item.revenue_growth_rate),
    top3_shop_revenue_ratio: toFiniteNumber(item.top3_shop_revenue_ratio),
    average_revenue: toFiniteNumber(item.average_revenue),
  };
}

/**
 * Executes a single (non-retried, non-paginated) call to Kalodata Open Center's Category Rank API.
 * Official endpoint: POST https://www.kalodata.com/openapi/v1/tiktok/category/rank
 * Official header:   secret-key: <process.env.KALODATA_API_KEY>
 * Official pricing:  0.1 × Ceiling(returned_rows / 100) Credits per call.
 */
export async function fetchKalodataCategoryRank(
  params: KalodataCategoryRankRequest
): Promise<KalodataCategoryRankResult> {
  const checkedAt = new Date().toISOString();
  const apiKey = getKalodataApiKey();

  if (!apiKey) {
    return {
      ok: false,
      configured: false,
      endpoint: KALODATA_CATEGORY_RANK_ENDPOINT,
      authHeader: KALODATA_AUTH_HEADER,
      httpStatus: null,
      checkedAt,
      requestParams: params,
      itemCount: 0,
      items: [],
      rawItems: [],
      allFieldKeys: [],
      cached: null,
      upstreamCode: 'MISSING_API_KEY',
      error:
        'KALODATA_API_KEY is not configured in backend environment variables. Add it in Settings > Secrets.',
      errorMy:
        'Backend Environment Variable (process.env.KALODATA_API_KEY) ထဲတွင် API Key မထည့်သွင်းရသေးပါ။',
    };
  }

  try {
    const response = await fetch(KALODATA_CATEGORY_RANK_ENDPOINT, {
      method: 'POST',
      signal: AbortSignal.timeout(15_000),
      headers: {
        [KALODATA_AUTH_HEADER]: apiKey,
        Accept: 'application/json',
        'Content-Type': 'application/json;charset=UTF-8',
      },
      body: JSON.stringify(params),
    });

    const rawText = await response.text();
    let parsed: Record<string, unknown> | null = null;
    try {
      const json = JSON.parse(rawText) as unknown;
      if (json && typeof json === 'object' && !Array.isArray(json)) {
        parsed = json as Record<string, unknown>;
      }
    } catch {
      parsed = null;
    }

    if (!parsed) {
      const snippet = rawText.trim().slice(0, 240) || `HTTP ${response.status}`;
      return {
        ok: false,
        configured: true,
        endpoint: KALODATA_CATEGORY_RANK_ENDPOINT,
        authHeader: KALODATA_AUTH_HEADER,
        httpStatus: response.status,
        checkedAt,
        requestParams: params,
        itemCount: 0,
        items: [],
        rawItems: [],
        allFieldKeys: [],
        cached: null,
        upstreamCode: `HTTP_${response.status}`,
        error: `Unexpected non-JSON response from Kalodata (HTTP ${response.status}): ${snippet}`,
        errorMy: `Kalodata မှ JSON မဟုတ်သော တုံ့ပြန်မှု ရရှိပါသည် (HTTP ${response.status})။`,
      };
    }

    const upstreamCode =
      parsed.code !== undefined && parsed.code !== null ? String(parsed.code) : undefined;
    const errorCategory =
      typeof parsed.errorCategory === 'string' && parsed.errorCategory.trim()
        ? parsed.errorCategory.trim()
        : undefined;
    const upstreamMessage =
      typeof parsed.message === 'string' && parsed.message.trim()
        ? parsed.message.trim()
        : typeof parsed.msg === 'string' && parsed.msg.trim()
          ? parsed.msg.trim()
          : '';
    const cached = typeof parsed.cached === 'boolean' ? parsed.cached : null;

    const isExplicitFailure =
      !response.ok ||
      parsed.success === false ||
      (upstreamCode !== undefined &&
        upstreamCode !== '0' &&
        upstreamCode !== '200' &&
        parsed.success !== true);

    if (isExplicitFailure) {
      const errMsg = upstreamMessage || `Kalodata API returned HTTP ${response.status}`;
      return {
        ok: false,
        configured: true,
        endpoint: KALODATA_CATEGORY_RANK_ENDPOINT,
        authHeader: KALODATA_AUTH_HEADER,
        httpStatus: response.status,
        checkedAt,
        requestParams: params,
        itemCount: 0,
        items: [],
        rawItems: [],
        allFieldKeys: [],
        cached,
        upstreamCode,
        errorCategory,
        message: upstreamMessage || undefined,
        error: errMsg,
        errorMy: buildBurmeseError(errMsg, upstreamCode),
      };
    }

    const rawList = Array.isArray(parsed.data)
      ? parsed.data
      : parsed.data &&
          typeof parsed.data === 'object' &&
          Array.isArray((parsed.data as Record<string, unknown>).list)
        ? ((parsed.data as Record<string, unknown>).list as unknown[])
        : [];

    const rawItems = rawList.filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === 'object' && !Array.isArray(item)
    );

    const keySet = new Set<string>();
    for (const item of rawItems) {
      for (const key of Object.keys(item)) {
        keySet.add(key);
      }
    }

    return {
      ok: true,
      configured: true,
      endpoint: KALODATA_CATEGORY_RANK_ENDPOINT,
      authHeader: KALODATA_AUTH_HEADER,
      httpStatus: response.status,
      checkedAt,
      requestParams: params,
      itemCount: rawItems.length,
      items: rawItems.map(normalizeCategoryRankItem),
      rawItems,
      allFieldKeys: Array.from(keySet),
      cached,
      upstreamCode,
      message: upstreamMessage || undefined,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Network error connecting to Kalodata OpenAPI.';
    return {
      ok: false,
      configured: true,
      endpoint: KALODATA_CATEGORY_RANK_ENDPOINT,
      authHeader: KALODATA_AUTH_HEADER,
      httpStatus: null,
      checkedAt,
      requestParams: params,
      itemCount: 0,
      items: [],
      rawItems: [],
      allFieldKeys: [],
      cached: null,
      upstreamCode: 'NETWORK_ERROR',
      error: `Failed to reach Kalodata OpenAPI: ${message}`,
      errorMy: `Kalodata OpenAPI သို့ ချိတ်ဆက်၍ မရပါ (${message})။`,
    };
  }
}

const KALODATA_PRODUCT_DETAIL_ENDPOINT =
  'https://www.kalodata.com/openapi/v1/tiktok/product/detail';
const KALODATA_SHOP_DETAIL_ENDPOINT =
  'https://www.kalodata.com/openapi/v1/tiktok/shop/detail';
const KALODATA_PRODUCT_COMMENT_INSIGHT_ENDPOINT =
  'https://www.kalodata.com/openapi/v1/tiktok/product/comment/insight';

export interface KalodataDetailApiResult<T = Record<string, unknown>> {
  ok: boolean;
  configured: boolean;
  endpoint: string;
  httpStatus: number | null;
  checkedAt: string;
  data: T | null;
  fieldKeys: string[];
  cached: boolean | null;
  upstreamCode?: string;
  error?: string;
  errorMy?: string;
}

async function callKalodataPostDetailEndpoint(
  endpoint: string,
  payload: Record<string, unknown>,
  timeoutMs = 15_000
): Promise<KalodataDetailApiResult<Record<string, unknown>>> {
  const checkedAt = new Date().toISOString();
  const apiKey = getKalodataApiKey();

  if (!apiKey) {
    return {
      ok: false,
      configured: false,
      endpoint,
      httpStatus: null,
      checkedAt,
      data: null,
      fieldKeys: [],
      cached: null,
      upstreamCode: 'MISSING_API_KEY',
      error: 'KALODATA_API_KEY is not configured in backend environment variables.',
      errorMy: 'Backend Environment Variable (process.env.KALODATA_API_KEY) မထည့်သွင်းရသေးပါ။',
    };
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        [KALODATA_AUTH_HEADER]: apiKey,
        Accept: 'application/json',
        'Content-Type': 'application/json;charset=UTF-8',
      },
      body: JSON.stringify(payload),
    });

    const rawText = await response.text();
    let parsed: Record<string, unknown> | null = null;
    try {
      const json = JSON.parse(rawText) as unknown;
      if (json && typeof json === 'object' && !Array.isArray(json)) {
        parsed = json as Record<string, unknown>;
      }
    } catch {
      parsed = null;
    }

    if (!parsed) {
      return {
        ok: false,
        configured: true,
        endpoint,
        httpStatus: response.status,
        checkedAt,
        data: null,
        fieldKeys: [],
        cached: null,
        upstreamCode: `HTTP_${response.status}`,
        error: `Unexpected non-JSON response from Kalodata (HTTP ${response.status}).`,
        errorMy: `Kalodata မှ JSON မဟုတ်သော တုံ့ပြန်မှု ရရှိပါသည် (HTTP ${response.status})။`,
      };
    }

    const upstreamCode =
      parsed.code !== undefined && parsed.code !== null ? String(parsed.code) : undefined;
    const upstreamMessage =
      typeof parsed.message === 'string' && parsed.message.trim()
        ? parsed.message.trim()
        : typeof parsed.msg === 'string' && parsed.msg.trim()
          ? parsed.msg.trim()
          : '';
    const cached = typeof parsed.cached === 'boolean' ? parsed.cached : null;

    const isExplicitFailure =
      !response.ok ||
      parsed.success === false ||
      (upstreamCode !== undefined &&
        upstreamCode !== '0' &&
        upstreamCode !== '200' &&
        parsed.success !== true);

    if (isExplicitFailure) {
      const errMsg = upstreamMessage || `Kalodata API returned HTTP ${response.status}`;
      return {
        ok: false,
        configured: true,
        endpoint,
        httpStatus: response.status,
        checkedAt,
        data: null,
        fieldKeys: [],
        cached,
        upstreamCode,
        error: errMsg,
        errorMy: buildBurmeseError(errMsg, upstreamCode),
      };
    }

    const dataObj =
      parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data)
        ? (parsed.data as Record<string, unknown>)
        : null;

    return {
      ok: true,
      configured: true,
      endpoint,
      httpStatus: response.status,
      checkedAt,
      data: dataObj,
      fieldKeys: dataObj ? Object.keys(dataObj) : [],
      cached,
      upstreamCode,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Network error connecting to Kalodata OpenAPI.';
    return {
      ok: false,
      configured: true,
      endpoint,
      httpStatus: null,
      checkedAt,
      data: null,
      fieldKeys: [],
      cached: null,
      upstreamCode: 'NETWORK_ERROR',
      error: `Failed to reach Kalodata OpenAPI: ${message}`,
      errorMy: `Kalodata OpenAPI သို့ ချိတ်ဆက်၍ မရပါ (${message})။`,
    };
  }
}

export interface KalodataProductDetailRequest {
  region: string;
  language: string;
  currency: string;
  date_range: string;
  product_id: string;
  need_extra?: boolean;
  need_image?: 0 | 1;
}

/**
 * Official endpoint: POST https://www.kalodata.com/openapi/v1/tiktok/product/detail
 * Official billing:  0.1 Credit per call (single, non-retried call).
 */
export async function fetchKalodataProductDetail(
  params: KalodataProductDetailRequest
): Promise<KalodataDetailApiResult<Record<string, unknown>>> {
  return callKalodataPostDetailEndpoint(
    KALODATA_PRODUCT_DETAIL_ENDPOINT,
    {
      region: params.region,
      language: params.language,
      currency: params.currency,
      date_range: params.date_range,
      product_id: params.product_id,
      need_extra: params.need_extra ?? true,
      ...(params.need_image !== undefined ? { need_image: params.need_image } : {}),
    },
    15_000
  );
}

export interface KalodataShopDetailRequest {
  region: string;
  language: string;
  currency: string;
  date_range: string;
  shop_id: string;
  need_extra?: boolean;
}

/**
 * Official endpoint: POST https://www.kalodata.com/openapi/v1/tiktok/shop/detail
 * Official billing:  0.1 Credit per call (single, non-retried call).
 */
export async function fetchKalodataShopDetail(
  params: KalodataShopDetailRequest
): Promise<KalodataDetailApiResult<Record<string, unknown>>> {
  return callKalodataPostDetailEndpoint(
    KALODATA_SHOP_DETAIL_ENDPOINT,
    {
      region: params.region,
      language: params.language,
      currency: params.currency,
      date_range: params.date_range,
      shop_id: params.shop_id,
      need_extra: params.need_extra ?? true,
    },
    15_000
  );
}

/**
 * Official endpoint: POST https://www.kalodata.com/openapi/v1/tiktok/product/comment/insight
 * Retrieves real buyer review summary, pain points, positive points, usage scenarios, and sample comments.
 */
export async function fetchKalodataProductCommentInsight(params: {
  product_id: string;
  country_code: string;
}): Promise<KalodataDetailApiResult<Record<string, unknown>>> {
  return callKalodataPostDetailEndpoint(
    KALODATA_PRODUCT_COMMENT_INSIGHT_ENDPOINT,
    {
      product_id: params.product_id,
      country_code: params.country_code.toLowerCase(),
    },
    30_000
  );
}



