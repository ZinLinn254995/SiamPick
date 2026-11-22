export function formatThb(amount: number | null | undefined, fallback = '—'): string {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    return fallback;
  }
  return `฿${Math.round(amount).toLocaleString('en-US')}`;
}

export function isSafeHttpUrl(rawUrl: string | null | undefined): rawUrl is string {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return false;
  try {
    const parsed = new URL(rawUrl.trim());
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export interface TikTokProductLinkInput {
  id: string;
  sources?: ReadonlyArray<{ url?: string | null; verified?: boolean }>;
  kalodataMetrics?: { productId?: string | null } | null;
}

const TIKTOK_NUMERIC_ID_REGEX = /^\d{8,24}$/;
const CANONICAL_PDP_PATH_REGEX = /^\/th\/pdp\/([^/?#]+)\/(\d{8,24})(?:\/|$)/i;
const SLUGLESS_OR_LEGACY_PDP_REGEX =
  /^\/(?:th\/pdp\/(\d{8,24})|shop\/(?:th\/)?pdp(?:\/[^/?#]+)?\/(\d{8,24})|view\/product\/(\d{8,24}))(?:\/|$)/i;

const resolvedCanonicalUrlCache = new Map<string, string>();

export function extractCanonicalTikTokNumericId(
  product: TikTokProductLinkInput | null | undefined
): string | null {
  if (!product) return null;

  const rawId = (product.kalodataMetrics?.productId ?? product.id ?? '').trim();
  const cleanNumericId = rawId.replace(/^(kalodata-th-|kd[_-])/i, '').trim();
  if (TIKTOK_NUMERIC_ID_REGEX.test(cleanNumericId)) {
    return cleanNumericId;
  }

  if (Array.isArray(product.sources)) {
    for (const src of product.sources) {
      if (!isSafeHttpUrl(src.url)) continue;
      try {
        const parsed = new URL(src.url.trim());
        const host = parsed.hostname.toLowerCase();
        if (
          host === 'shop.tiktok.com' ||
          host === 'shop-th.tiktok.com' ||
          host === 'www.tiktok.com' ||
          host === 'tiktok.com'
        ) {
          const canonicalMatch = parsed.pathname.match(CANONICAL_PDP_PATH_REGEX);
          if (canonicalMatch?.[2]) return canonicalMatch[2];
          const legacyMatch = parsed.pathname.match(SLUGLESS_OR_LEGACY_PDP_REGEX);
          const foundId = legacyMatch?.[1] ?? legacyMatch?.[2] ?? legacyMatch?.[3];
          if (foundId && TIKTOK_NUMERIC_ID_REGEX.test(foundId)) {
            return foundId;
          }
        }
      } catch {
        // Ignore invalid source URL
      }
    }
  }

  return null;
}

export function isLegacyOrSluglessTikTokUrl(rawUrl: string | null | undefined): boolean {
  if (!isSafeHttpUrl(rawUrl)) return false;
  try {
    const parsed = new URL(rawUrl.trim());
    const host = parsed.hostname.toLowerCase();
    if (
      host !== 'shop.tiktok.com' &&
      host !== 'shop-th.tiktok.com' &&
      host !== 'www.tiktok.com' &&
      host !== 'tiktok.com'
    ) {
      return false;
    }
    return SLUGLESS_OR_LEGACY_PDP_REGEX.test(parsed.pathname);
  } catch {
    return false;
  }
}

export function hasResolvedCanonicalTikTokSlug(
  product: TikTokProductLinkInput | null | undefined
): boolean {
  const numericId = extractCanonicalTikTokNumericId(product);
  if (!numericId) return false;
  if (resolvedCanonicalUrlCache.has(numericId)) {
    const cached = resolvedCanonicalUrlCache.get(numericId)!;
    const match = cached.match(/\/th\/pdp\/([^/?#]+)\/(\d{8,24})/i);
    if (match?.[1] && match[1].toLowerCase() !== 'product') return true;
  }
  if (!Array.isArray(product?.sources)) return false;
  for (const src of product.sources) {
    if (!isSafeHttpUrl(src.url)) continue;
    try {
      const parsed = new URL(src.url.trim());
      if (parsed.hostname.toLowerCase() !== 'shop.tiktok.com') continue;
      const match = parsed.pathname.match(CANONICAL_PDP_PATH_REGEX);
      if (match?.[1] && match[2] === numericId && match[1].toLowerCase() !== 'product' && !/^\d+$/.test(match[1])) {
        return true;
      }
    } catch {
      // Ignore
    }
  }
  return false;
}

/**
 * Resolves the direct TikTok Shop Thailand Product Detail Page (PDP) URL.
 * Always emits the 2-segment `/th/pdp/{slug}/{numericId}` path (using the resolved
 * canonical slug when available, or `/th/pdp/product/{numericId}` as fallback) so
 * Android App Links and desktop browsers land directly on the PDP instead of hitting
 * slugless `/th/pdp/{id}` redirects or `/view/product/` Security Check pages.
 */
export function getTikTokShopProductUrl(
  product: TikTokProductLinkInput | null | undefined
): string | null {
  if (!product) return null;

  const numericId = extractCanonicalTikTokNumericId(product);

  if (numericId && resolvedCanonicalUrlCache.has(numericId)) {
    return resolvedCanonicalUrlCache.get(numericId)!;
  }

  // 1. Prefer an already-canonical slugged `/th/pdp/{slug}/{id}` URL from product.sources
  if (Array.isArray(product.sources)) {
    for (const src of product.sources) {
      if (!isSafeHttpUrl(src.url)) continue;
      try {
        const parsed = new URL(src.url.trim());
        const host = parsed.hostname.toLowerCase();
        if (host === 'shop.tiktok.com' || host === 'shop-th.tiktok.com') {
          const match = parsed.pathname.match(CANONICAL_PDP_PATH_REGEX);
          if (match?.[1] && match?.[2] && !/^\d+$/.test(match[1])) {
            const normalized = `https://shop.tiktok.com/th/pdp/${match[1]}/${match[2]}`;
            if (match[1].toLowerCase() !== 'product') {
              resolvedCanonicalUrlCache.set(match[2], normalized);
            }
            return normalized;
          }
        }
      } catch {
        // Skip invalid URL
      }
    }
  }

  // 2. Fallback to the direct 2-segment TH PDP URL (`/th/pdp/product/{numericId}`)
  if (numericId) {
    return `https://shop.tiktok.com/th/pdp/product/${numericId}`;
  }

  return null;
}

export async function fetchResolvedTikTokProductUrl(
  productId: string,
  signal?: AbortSignal
): Promise<string | null> {
  const cleanId = productId.trim().replace(/^(kalodata-th-|kd[_-])/i, '').trim();
  if (!TIKTOK_NUMERIC_ID_REGEX.test(cleanId)) return null;

  const cached = resolvedCanonicalUrlCache.get(cleanId);
  if (cached) {
    const match = cached.match(/\/th\/pdp\/([^/?#]+)\/(\d{8,24})/i);
    if (match?.[1] && match[1].toLowerCase() !== 'product') {
      return cached;
    }
  }

  try {
    const res = await fetch(`/api/tiktok-product/${encodeURIComponent(cleanId)}`, {
      method: 'GET',
      signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { ok?: boolean; canonicalUrl?: string };
    if (data?.ok && isSafeHttpUrl(data.canonicalUrl)) {
      resolvedCanonicalUrlCache.set(cleanId, data.canonicalUrl);
      return data.canonicalUrl;
    }
  } catch {
    // Ignore abort/network errors cleanly
  }
  return null;
}

export function normalizeTikTokSourceUrl(rawUrl: string): string {
  if (!isLegacyOrSluglessTikTokUrl(rawUrl)) return rawUrl;
  return getTikTokShopProductUrl({ id: '', sources: [{ url: rawUrl }] }) ?? rawUrl;
}

export function getTikTokOpenLauncherUrl(
  product: TikTokProductLinkInput | null | undefined
): string | null {
  const numericId = extractCanonicalTikTokNumericId(product);
  return numericId ? `/api/tiktok-open/${encodeURIComponent(numericId)}` : null;
}

export function isAndroidBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /android/i.test(navigator.userAgent ?? '');
}

export function isSafeProductImageSrc(rawUrl: string | null | undefined): rawUrl is string {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return false;
  const trimmed: string = rawUrl.trim();
  if (trimmed.startsWith('/api/image-proxy?')) {
    try {
      const params = new URLSearchParams(trimmed.slice('/api/image-proxy?'.length));
      const targetUrl = params.get('url');
      return Boolean(targetUrl && isSafeHttpUrl(targetUrl));
    } catch {
      return false;
    }
  }
  if (/^\/api\/product-image\/\d{8,24}$/.test(trimmed)) {
    return true;
  }
  if (trimmed.startsWith('/assets/') && !trimmed.includes('..') && !trimmed.includes('\\')) {
    return true;
  }
  return isSafeHttpUrl(trimmed);
}

export interface ResolvedProductImageConfig {
  src: string | null;
  fallbackSrc: string | null;
  productId: string | null;
  canRender: boolean;
}

export function resolveProductImageDisplayConfig(
  product:
    | (TikTokProductLinkInput & {
        imageUrl?: string | null;
        imageOriginUrl?: string | null;
        imageVerified?: boolean;
      })
    | null
    | undefined
): ResolvedProductImageConfig {
  if (!product) {
    return { src: null, fallbackSrc: null, productId: null, canRender: false };
  }

  const productId = extractCanonicalTikTokNumericId(product);
  const rawImage = isSafeProductImageSrc(product.imageUrl) ? product.imageUrl.trim() : null;
  const rawOrigin = isSafeHttpUrl(product.imageOriginUrl) ? product.imageOriginUrl.trim() : null;

  if (rawImage) {
    let resolvedSrc = rawImage;
    if (resolvedSrc.startsWith('/api/image-proxy?') && productId) {
      try {
        const params = new URLSearchParams(resolvedSrc.slice('/api/image-proxy?'.length));
        if (!params.get('productId')) {
          resolvedSrc = `${resolvedSrc}&productId=${encodeURIComponent(productId)}`;
        }
      } catch {
        // Keep original proxy URL
      }
    }
    return {
      src: resolvedSrc,
      fallbackSrc: rawOrigin,
      productId,
      canRender: product.imageVerified !== false || Boolean(rawOrigin || productId),
    };
  }

  if (rawOrigin) {
    const proxySrc = `/api/image-proxy?url=${encodeURIComponent(rawOrigin)}${
      productId ? `&productId=${encodeURIComponent(productId)}` : ''
    }`;
    return {
      src: proxySrc,
      fallbackSrc: rawOrigin,
      productId,
      canRender: true,
    };
  }

  if (productId) {
    return {
      src: `/api/product-image/${encodeURIComponent(productId)}`,
      fallbackSrc: null,
      productId,
      canRender: true,
    };
  }

  return { src: null, fallbackSrc: null, productId: null, canRender: false };
}
