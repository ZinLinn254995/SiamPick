export interface TikTokProductLinkResolution {
  productId: string;
  canonicalUrl: string;
  fallbackUrl: string;
  slugResolved: boolean;
  appSchemeUrl: string;
  trillIntentUrl: string;
  musicallyIntentUrl: string;
  appLinkIntentUrl: string;
}

const TIKTOK_NUMERIC_ID_REGEX = /^\d{8,24}$/;
const CANONICAL_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const FALLBACK_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_CACHE_ENTRIES = 2000;

const DESKTOP_CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

interface CachedCanonicalEntry {
  url: string;
  slugResolved: boolean;
  expiresAt: number;
}

const canonicalUrlCache = new Map<string, CachedCanonicalEntry>();
const inFlightResolutions = new Map<string, Promise<TikTokProductLinkResolution>>();

export function extractNumericTikTokProductId(rawId: string | null | undefined): string | null {
  if (typeof rawId !== 'string') return null;
  const cleaned = rawId.trim().replace(/^(kalodata-th-|kd[_-])/i, '').trim();
  return TIKTOK_NUMERIC_ID_REGEX.test(cleaned) ? cleaned : null;
}

export function buildFallbackTikTokShopUrl(productId: string): string {
  const cleanId = extractNumericTikTokProductId(productId);
  if (!cleanId) {
    throw new Error(`Invalid TikTok Shop numeric product ID: ${productId}`);
  }
  return `https://shop.tiktok.com/th/pdp/product/${cleanId}`;
}

export function buildTikTokAppDeepLinks(productId: string, canonicalUrl: string): {
  appSchemeUrl: string;
  trillIntentUrl: string;
  musicallyIntentUrl: string;
  appLinkIntentUrl: string;
} {
  const cleanId = extractNumericTikTokProductId(productId);
  if (!cleanId) {
    throw new Error(`Invalid TikTok Shop numeric product ID: ${productId}`);
  }
  const encodedParams = encodeURIComponent(JSON.stringify({ product_id: [cleanId] }));
  const encodedFallback = encodeURIComponent(canonicalUrl);
  const canonicalWithoutScheme = canonicalUrl.replace(/^https?:\/\//i, '');

  return {
    appSchemeUrl: `snssdk1180://ec/pdp?biz_type=0&requestParams=${encodedParams}`,
    trillIntentUrl: `intent://ec/pdp?biz_type=0&requestParams=${encodedParams}#Intent;scheme=snssdk1180;package=com.ss.android.ugc.trill;S.browser_fallback_url=${encodedFallback};end`,
    musicallyIntentUrl: `intent://ec/pdp?biz_type=0&requestParams=${encodedParams}#Intent;scheme=snssdk1233;package=com.zhiliaoapp.musically;S.browser_fallback_url=${encodedFallback};end`,
    appLinkIntentUrl: `intent://${canonicalWithoutScheme}#Intent;scheme=https;package=com.ss.android.ugc.trill;S.browser_fallback_url=${encodedFallback};end`,
  };
}

export function parseSafeCanonicalTikTokPdpLocation(
  locationHeader: string | null | undefined,
  expectedProductId: string
): string | null {
  if (!locationHeader || typeof locationHeader !== 'string') return null;
  const cleanId = extractNumericTikTokProductId(expectedProductId);
  if (!cleanId) return null;

  try {
    const parsed = new URL(locationHeader.trim(), 'https://shop.tiktok.com');
    if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== 'shop.tiktok.com') {
      return null;
    }

    const match = parsed.pathname.match(/^\/th\/pdp\/([^/?#]+)\/(\d{8,24})(?:\/|$)/i);
    if (!match?.[1] || !match[2] || match[2] !== cleanId) {
      return null;
    }

    const rawSlug = match[1].trim();
    if (!rawSlug || /^\d+$/.test(rawSlug)) {
      return null;
    }

    // Re-encode safely per segment while preserving valid URL-safe slug characters
    const normalizedSlug = encodeURIComponent(decodeURIComponent(rawSlug));
    return `https://shop.tiktok.com/th/pdp/${normalizedSlug}/${cleanId}`;
  } catch {
    return null;
  }
}

function setCachedCanonicalEntry(productId: string, entry: CachedCanonicalEntry): void {
  if (canonicalUrlCache.size >= MAX_CACHE_ENTRIES && !canonicalUrlCache.has(productId)) {
    const oldestKey = canonicalUrlCache.keys().next().value;
    if (oldestKey) canonicalUrlCache.delete(oldestKey);
  }
  canonicalUrlCache.set(productId, entry);
}

export function clearTikTokLinkCache(): void {
  canonicalUrlCache.clear();
  inFlightResolutions.clear();
}

function buildResolutionResult(
  productId: string,
  canonicalUrl: string,
  slugResolved: boolean
): TikTokProductLinkResolution {
  const fallbackUrl = buildFallbackTikTokShopUrl(productId);
  return {
    productId,
    canonicalUrl,
    fallbackUrl,
    slugResolved,
    ...buildTikTokAppDeepLinks(productId, canonicalUrl),
  };
}

async function fetchCanonicalFromTikTok(
  cleanId: string,
  timeoutMs: number
): Promise<{ url: string; slugResolved: boolean }> {
  const probeUrl = `https://shop.tiktok.com/th/pdp/${cleanId}`;
  const fallbackUrl = buildFallbackTikTokShopUrl(cleanId);

  for (const method of ['HEAD', 'GET'] as const) {
    try {
      const response = await fetch(probeUrl, {
        method,
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          'User-Agent': DESKTOP_CHROME_UA,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7',
        },
      });

      const location = response.headers.get('location');
      // Drain/cancel body immediately when issuing GET with redirect: 'manual'
      if (response.body) {
        response.body.cancel().catch(() => {});
      }

      const canonical = parseSafeCanonicalTikTokPdpLocation(location, cleanId);
      if (canonical) {
        return { url: canonical, slugResolved: true };
      }

      // If HEAD succeeded with 3xx/200 without a slug Location, no need to retry with GET unless 405
      if (method === 'HEAD' && response.status !== 405 && response.status !== 403) {
        break;
      }
    } catch {
      // Upstream timeout or network error — fall through cleanly
      break;
    }
  }

  return { url: fallbackUrl, slugResolved: false };
}

export async function resolveCanonicalTikTokProductUrl(
  rawProductId: string,
  options?: { timeoutMs?: number; skipCache?: boolean }
): Promise<TikTokProductLinkResolution> {
  const cleanId = extractNumericTikTokProductId(rawProductId);
  if (!cleanId) {
    throw new Error('Valid numeric TikTok Shop product ID (8-24 digits) is required.');
  }

  const now = Date.now();
  if (!options?.skipCache) {
    const cached = canonicalUrlCache.get(cleanId);
    if (cached && cached.expiresAt > now) {
      return buildResolutionResult(cleanId, cached.url, cached.slugResolved);
    }
  }

  const existingPromise = inFlightResolutions.get(cleanId);
  if (existingPromise) {
    return existingPromise;
  }

  const timeoutMs = Math.max(500, Math.min(8000, options?.timeoutMs ?? 2800));
  const pending = (async () => {
    try {
      const resolved = await fetchCanonicalFromTikTok(cleanId, timeoutMs);
      setCachedCanonicalEntry(cleanId, {
        url: resolved.url,
        slugResolved: resolved.slugResolved,
        expiresAt:
          Date.now() + (resolved.slugResolved ? CANONICAL_CACHE_TTL_MS : FALLBACK_CACHE_TTL_MS),
      });
      return buildResolutionResult(cleanId, resolved.url, resolved.slugResolved);
    } finally {
      inFlightResolutions.delete(cleanId);
    }
  })();

  inFlightResolutions.set(cleanId, pending);
  return pending;
}

export async function resolveCanonicalTikTokProductUrlsBatch(
  rawProductIds: readonly string[],
  options?: { concurrency?: number; perItemTimeoutMs?: number; totalBudgetMs?: number }
): Promise<Map<string, string>> {
  const uniqueIds = Array.from(
    new Set(
      rawProductIds
        .map((id) => extractNumericTikTokProductId(id))
        .filter((id): id is string => Boolean(id))
    )
  );

  const results = new Map<string, string>();
  if (uniqueIds.length === 0) return results;

  const concurrency = Math.max(1, Math.min(10, options?.concurrency ?? 6));
  const perItemTimeoutMs = Math.max(500, Math.min(5000, options?.perItemTimeoutMs ?? 1800));
  const totalBudgetMs = Math.max(800, Math.min(8000, options?.totalBudgetMs ?? 2400));
  const deadline = Date.now() + totalBudgetMs;

  let cursor = 0;
  async function worker() {
    while (cursor < uniqueIds.length && Date.now() < deadline) {
      const id = uniqueIds[cursor++];
      const remaining = Math.max(400, deadline - Date.now());
      try {
        const res = await resolveCanonicalTikTokProductUrl(id, {
          timeoutMs: Math.min(perItemTimeoutMs, remaining),
        });
        results.set(id, res.canonicalUrl);
      } catch {
        results.set(id, buildFallbackTikTokShopUrl(id));
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, uniqueIds.length) }, () => worker()));

  for (const id of uniqueIds) {
    if (!results.has(id)) {
      const cached = canonicalUrlCache.get(id);
      results.set(id, cached?.url ?? buildFallbackTikTokShopUrl(id));
    }
  }

  return results;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderAndroidTikTokOpenPageHtml(
  resolution: TikTokProductLinkResolution
): string {
  const safeId = escapeHtml(resolution.productId);
  const safeTrillIntent = escapeHtml(resolution.trillIntentUrl);
  const safeAppLinkIntent = escapeHtml(resolution.appLinkIntentUrl);
  const safeMusicallyIntent = escapeHtml(resolution.musicallyIntentUrl);
  const safeCanonical = escapeHtml(resolution.canonicalUrl);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Open Product #${safeId} on TikTok Shop</title>
  <style>
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #fafafa;
      color: #09090b;
    }
    @media (prefers-color-scheme: dark) {
      body { background: #09090b; color: #fafafa; }
      .card { background: #18181b; border-color: #27272a; }
      .muted { color: #a1a1aa; }
      .btn-secondary { background: #27272a; color: #fafafa; border-color: #3f3f46; }
      .url-box { background: #09090b; border-color: #27272a; color: #a1a1aa; }
    }
    .card {
      width: 100%;
      max-width: 420px;
      background: #ffffff;
      border: 1px solid #e4e4e7;
      border-radius: 16px;
      padding: 24px;
      box-shadow: 0 12px 30px rgba(0,0,0,0.08);
    }
    h1 { margin: 0 0 8px; font-size: 18px; line-height: 1.35; }
    .muted { margin: 0 0 18px; font-size: 13px; line-height: 1.5; color: #52525b; }
    .actions { display: flex; flex-direction: column; gap: 10px; }
    a.btn {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 46px;
      padding: 12px 16px;
      border-radius: 10px;
      text-decoration: none;
      font-size: 14px;
      font-weight: 600;
      text-align: center;
    }
    .btn-primary {
      background: #09090b;
      color: #ffffff;
    }
    @media (prefers-color-scheme: dark) {
      .btn-primary { background: #fafafa; color: #09090b; }
    }
    .btn-secondary {
      background: #f4f4f5;
      color: #09090b;
      border: 1px solid #e4e4e7;
    }
    .url-box {
      margin-top: 16px;
      padding: 10px 12px;
      border-radius: 8px;
      background: #f4f4f5;
      border: 1px solid #e4e4e7;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 11px;
      word-break: break-all;
      color: #52525b;
    }
  </style>
</head>
<body>
  <main class="card">
    <h1>TikTok Shop Product #${safeId}</h1>
    <p class="muted">
      Tap below to jump straight to this product inside the TikTok App (Thailand / Asia).<br />
      TikTok App ထဲရှိ Product စာမျက်နှာသို့ တိုက်ရိုက်ဝင်ရန် အောက်ပါခလုတ်ကို နှိပ်ပါ။
    </p>
    <div class="actions">
      <a class="btn btn-primary" href="${safeTrillIntent}">
        Open Directly in TikTok App (TH / Asia)
      </a>
      <a class="btn btn-secondary" href="${safeAppLinkIntent}">
        Open Canonical Link in TikTok App
      </a>
      <a class="btn btn-secondary" href="${safeMusicallyIntent}">
        Open in TikTok (Global App)
      </a>
      <a class="btn btn-secondary" href="${safeCanonical}" rel="noopener noreferrer">
        Open in Mobile Browser
      </a>
    </div>
    <div class="url-box">${safeCanonical}</div>
  </main>
</body>
</html>`;
}
