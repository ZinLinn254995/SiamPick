const KALODATA_BALANCE_ENDPOINT = 'https://www.kalodata.com/openapi/v1/credit/balance';
const KALODATA_AUTH_HEADER = 'secret-key';

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

/**
 * Calls Kalodata Open Center's Free Credit Balance endpoint strictly from the backend.
 * Official endpoint: GET https://www.kalodata.com/openapi/v1/credit/balance
 * Official header:   secret-key: <KALODATA_API_KEY>
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
      return {
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
      return {
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
    const message =
      err instanceof Error ? err.message : 'Network error connecting to Kalodata OpenAPI.';
    return {
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
      error: `Failed to reach Kalodata OpenAPI: ${message}`,
      errorMy: `Kalodata OpenAPI သို့ ချိတ်ဆက်၍ မရပါ (${message})။`,
    };
  }
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

