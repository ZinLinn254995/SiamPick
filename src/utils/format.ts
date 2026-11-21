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

/**
 * Resolves the direct TikTok Shop Thailand Product Detail Page (PDP) URL.
 * Uses `https://shop.tiktok.com/th/pdp/{numericId}` which resolves directly
 * to the product page on both Mobile & Desktop (unlike `/view/product/` which
 * redirects to the TikTok home feed or security check).
 * Returns null if no valid numeric TikTok Shop product ID exists.
 */
export function getTikTokShopProductUrl(
  product: TikTokProductLinkInput | null | undefined
): string | null {
  if (!product) return null;

  // 1. Prefer canonical numeric TikTok Shop product ID -> direct TH PDP URL
  const rawId = (product.kalodataMetrics?.productId ?? product.id ?? '').trim();
  const cleanNumericId = rawId.replace(/^(kalodata-th-|kd[_-])/i, '').trim();
  if (TIKTOK_NUMERIC_ID_REGEX.test(cleanNumericId)) {
    return `https://shop.tiktok.com/th/pdp/${cleanNumericId}`;
  }

  // 2. Fallback: extract numeric ID or direct /pdp/ URL from product.sources
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
          const idMatch = parsed.pathname.match(/\/(?:th\/pdp(?:\/[^/]+)?|shop\/(?:th\/)?pdp(?:\/[^/]+)?|view\/product)\/(\d{8,24})(?:\/|$)/i);
          if (idMatch?.[1]) {
            return `https://shop.tiktok.com/th/pdp/${idMatch[1]}`;
          }
          if (parsed.pathname.includes('/pdp/')) {
            return parsed.toString();
          }
        }
      } catch {
        // Skip invalid URL
      }
    }
  }

  return null;
}
