import type { GroundingSourceLink } from '../src/types/product.ts';

export interface VerifiedListingEnrichment {
  imageVerified: boolean;
  imageUrl: string | null;
  imageOriginUrl: string | null;
  imageSourceNoteEn: string;
  imageSourceNoteMy: string;
  verifiedPriceThb: number | null;
  verifiedRating: number | null;
  verifiedReviewCount: number | null;
  verifiedPageUrl: string | null;
  verifiedPageTitle: string | null;
}

const MAX_ALLOWLIST_SIZE = 500;
const verifiedImageAllowlist = new Map<string, { contentType: string; verifiedAt: number }>();

const STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'this',
  'that',
  'thailand',
  'thai',
  'tiktok',
  'shop',
  'official',
  'store',
  'flagship',
  'mall',
  'online',
  'sale',
  'best',
  'top',
  'viral',
  'trending',
  'popular',
  'new',
  'women',
  'womens',
  'lady',
  'beauty',
  'cosmetics',
  'fashion',
  'product',
  'products',
  'review',
  'reviews',
  'price',
  'thb',
  'baht',
  'buy',
  'set',
  'pack',
]);

const REJECTED_IMAGE_PATTERNS = [
  /logo/i,
  /favicon/i,
  /sprite/i,
  /placeholder/i,
  /default[-_]?og/i,
  /og[-_]?default/i,
  /avatar/i,
  /icon[-_./]/i,
  /\/icons?\//i,
  /blank\./i,
  /1x1/i,
  /pixel\./i,
  /\.svg(\?|$)/i,
  /\.ico(\?|$)/i,
  /\.gif(\?|$)/i,
];

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export function isSafeExternalUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host === '[::1]' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function isAllowlistedImageUrl(rawUrl: string): boolean {
  return verifiedImageAllowlist.has(rawUrl);
}

function registerVerifiedImage(url: string, contentType: string): void {
  if (verifiedImageAllowlist.size >= MAX_ALLOWLIST_SIZE) {
    const firstKey = verifiedImageAllowlist.keys().next().value;
    if (firstKey) verifiedImageAllowlist.delete(firstKey);
  }
  verifiedImageAllowlist.set(url, { contentType, verifiedAt: Date.now() });
}

function tokenizeMeaningful(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .split(/\s+/)
        .filter((tok) => tok.length >= 3 && !STOPWORDS.has(tok))
    )
  );
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function extractMetaContent(html: string, attrName: 'property' | 'name', attrValue: string): string | null {
  const escaped = attrValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern1 = new RegExp(
    `<meta[^>]*${attrName}=["']${escaped}["'][^>]*content=["']([^"']+)["'][^>]*>`,
    'i'
  );
  const pattern2 = new RegExp(
    `<meta[^>]*content=["']([^"']+)["'][^>]*${attrName}=["']${escaped}["'][^>]*>`,
    'i'
  );
  const match = html.match(pattern1) ?? html.match(pattern2);
  return match?.[1] ? decodeHtmlEntities(match[1]) : null;
}

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1] ? decodeHtmlEntities(match[1].replace(/\s+/g, ' ')) : '';
}

interface JsonLdProductData {
  name: string | null;
  brand: string | null;
  images: string[];
  priceThb: number | null;
  rating: number | null;
  reviewCount: number | null;
}

function collectProductNodes(node: unknown, out: Record<string, unknown>[]): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) collectProductNodes(item, out);
    return;
  }
  const obj = node as Record<string, unknown>;
  const rawType = obj['@type'];
  const types = Array.isArray(rawType) ? rawType : typeof rawType === 'string' ? [rawType] : [];
  if (types.some((t) => typeof t === 'string' && t.toLowerCase().includes('product'))) {
    out.push(obj);
  }
  if (Array.isArray(obj['@graph'])) {
    collectProductNodes(obj['@graph'], out);
  }
}

function parseJsonLdProducts(html: string): JsonLdProductData[] {
  const results: JsonLdProductData[] = [];
  const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html)) !== null) {
    const rawJson = match[1]?.trim();
    if (!rawJson) continue;
    try {
      const parsed: unknown = JSON.parse(rawJson);
      const productNodes: Record<string, unknown>[] = [];
      collectProductNodes(parsed, productNodes);

      for (const p of productNodes) {
        const name = typeof p.name === 'string' ? p.name.trim() : null;
        let brand: string | null = null;
        if (typeof p.brand === 'string') {
          brand = p.brand.trim();
        } else if (p.brand && typeof p.brand === 'object' && typeof (p.brand as Record<string, unknown>).name === 'string') {
          brand = String((p.brand as Record<string, unknown>).name).trim();
        }

        const images: string[] = [];
        const rawImg = p.image;
        if (typeof rawImg === 'string') {
          images.push(rawImg);
        } else if (Array.isArray(rawImg)) {
          for (const entry of rawImg) {
            if (typeof entry === 'string') images.push(entry);
            else if (entry && typeof entry === 'object' && typeof (entry as Record<string, unknown>).url === 'string') {
              images.push(String((entry as Record<string, unknown>).url));
            }
          }
        } else if (rawImg && typeof rawImg === 'object' && typeof (rawImg as Record<string, unknown>).url === 'string') {
          images.push(String((rawImg as Record<string, unknown>).url));
        }

        let priceThb: number | null = null;
        const offers = Array.isArray(p.offers) ? p.offers[0] : p.offers;
        if (offers && typeof offers === 'object') {
          const offerObj = offers as Record<string, unknown>;
          const currency = typeof offerObj.priceCurrency === 'string' ? offerObj.priceCurrency.toUpperCase() : '';
          const rawPrice = Number(offerObj.price ?? offerObj.lowPrice);
          if (
            Number.isFinite(rawPrice) &&
            rawPrice >= 15 &&
            rawPrice <= 80000 &&
            (currency === 'THB' || currency === '')
          ) {
            priceThb = Math.round(rawPrice);
          }
        }

        let rating: number | null = null;
        let reviewCount: number | null = null;
        if (p.aggregateRating && typeof p.aggregateRating === 'object') {
          const agg = p.aggregateRating as Record<string, unknown>;
          const rVal = Number(agg.ratingValue);
          const rCnt = Number(agg.reviewCount ?? agg.ratingCount);
          if (Number.isFinite(rVal) && rVal >= 1 && rVal <= 5) {
            rating = Math.round(rVal * 10) / 10;
          }
          if (Number.isFinite(rCnt) && rCnt > 0) {
            reviewCount = Math.round(rCnt);
          }
        }

        results.push({ name, brand, images, priceThb, rating, reviewCount });
      }
    } catch {
      // Ignore malformed JSON-LD script blocks
    }
  }

  return results;
}

function matchesProductAndBrand(
  productName: string,
  brand: string,
  candidateTitle: string,
  candidateUrl: string
): boolean {
  const haystack = `${candidateTitle} ${candidateUrl}`.toLowerCase();
  const brandTokens = tokenizeMeaningful(brand);
  const nameTokens = tokenizeMeaningful(productName);

  const brandHits = brandTokens.filter((tok) => haystack.includes(tok)).length;
  const nameHits = nameTokens.filter((tok) => haystack.includes(tok)).length;

  // Strong match: Brand matches + at least 1 product name token matches
  if (brandTokens.length > 0 && brandHits > 0 && nameHits >= 1) {
    return true;
  }

  // Or at least 2 distinct meaningful product tokens match (and >= 40% coverage)
  if (nameTokens.length > 0 && nameHits >= 2 && nameHits / nameTokens.length >= 0.4) {
    return true;
  }

  return false;
}

function isPlausibleProductImageUrl(url: string): boolean {
  if (!isSafeExternalUrl(url)) return false;
  return !REJECTED_IMAGE_PATTERNS.some((pattern) => pattern.test(url));
}

async function verifyLiveImageUrl(rawUrl: string): Promise<{ ok: boolean; contentType: string }> {
  if (!isPlausibleProductImageUrl(rawUrl)) {
    return { ok: false, contentType: '' };
  }

  try {
    const response = await fetch(rawUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(4000),
      headers: {
        'User-Agent': BROWSER_USER_AGENT,
        Accept: 'image/avif,image/webp,image/png,image/jpeg,*/*;q=0.8',
      },
    });

    if (!response.ok) {
      response.body?.cancel().catch(() => {});
      return { ok: false, contentType: '' };
    }

    const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
    if (!/^image\/(jpeg|jpg|png|webp|avif)/.test(contentType)) {
      response.body?.cancel().catch(() => {});
      return { ok: false, contentType: '' };
    }

    const contentLengthHeader = Number(response.headers.get('content-length') ?? '0');
    if (contentLengthHeader > 0 && contentLengthHeader < 3500) {
      response.body?.cancel().catch(() => {});
      return { ok: false, contentType: '' };
    }

    // Read small prefix to confirm non-empty valid image bytes, then abort stream
    const reader = response.body?.getReader();
    let bytesRead = 0;
    if (reader) {
      while (bytesRead < 2048) {
        const { done, value } = await reader.read();
        if (done) break;
        bytesRead += value?.byteLength ?? 0;
      }
      await reader.cancel().catch(() => {});
    }

    if (bytesRead < 1024 && contentLengthHeader < 3500) {
      return { ok: false, contentType: '' };
    }

    const finalUrl = response.url || rawUrl;
    if (!isPlausibleProductImageUrl(finalUrl)) {
      return { ok: false, contentType: '' };
    }

    registerVerifiedImage(rawUrl, contentType);
    if (finalUrl !== rawUrl) {
      registerVerifiedImage(finalUrl, contentType);
    }

    return { ok: true, contentType };
  } catch {
    return { ok: false, contentType: '' };
  }
}

interface PageInspection {
  finalUrl: string;
  pageTitle: string;
  candidateImages: string[];
  matchedProductTitle: string | null;
  priceThb: number | null;
  rating: number | null;
  reviewCount: number | null;
  matched: boolean;
}

async function inspectListingPage(
  sourceUrl: string,
  productName: string,
  brand: string
): Promise<PageInspection | null> {
  if (!isSafeExternalUrl(sourceUrl)) return null;

  try {
    const response = await fetch(sourceUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(4500),
      headers: {
        'User-Agent': BROWSER_USER_AGENT,
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'th-TH,th;q=0.9,en;q=0.8',
      },
    });

    if (!response.ok) {
      response.body?.cancel().catch(() => {});
      return null;
    }

    const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      response.body?.cancel().catch(() => {});
      return null;
    }

    const finalUrl = response.url || sourceUrl;
    if (!isSafeExternalUrl(finalUrl)) {
      response.body?.cancel().catch(() => {});
      return null;
    }

    // Read up to 240KB of HTML to keep verification snappy
    const reader = response.body?.getReader();
    let html = '';
    if (reader) {
      const decoder = new TextDecoder('utf-8');
      let totalBytes = 0;
      while (totalBytes < 240_000) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        html += decoder.decode(value, { stream: true });
      }
      await reader.cancel().catch(() => {});
    }

    if (!html) return null;

    const title = extractTitle(html);
    const ogTitle = extractMetaContent(html, 'property', 'og:title') ?? '';
    const combinedTitle = `${ogTitle} ${title}`.trim();

    const jsonLdProducts = parseJsonLdProducts(html);
    const matchedJsonLd = jsonLdProducts.find((item) =>
      matchesProductAndBrand(productName, brand, `${item.brand ?? ''} ${item.name ?? ''}`, finalUrl)
    );

    const pageMatched =
      Boolean(matchedJsonLd) || matchesProductAndBrand(productName, brand, combinedTitle, finalUrl);

    if (!pageMatched) {
      return {
        finalUrl,
        pageTitle: combinedTitle,
        candidateImages: [],
        matchedProductTitle: null,
        priceThb: null,
        rating: null,
        reviewCount: null,
        matched: false,
      };
    }

    const rawImages: string[] = [];
    if (matchedJsonLd) {
      rawImages.push(...matchedJsonLd.images);
    }
    const ogImage =
      extractMetaContent(html, 'property', 'og:image:secure_url') ??
      extractMetaContent(html, 'property', 'og:image');
    const twitterImage = extractMetaContent(html, 'name', 'twitter:image');
    if (ogImage) rawImages.push(ogImage);
    if (twitterImage) rawImages.push(twitterImage);

    const resolvedImages: string[] = [];
    const seen = new Set<string>();
    for (const img of rawImages) {
      try {
        const abs = new URL(img, finalUrl).toString();
        if (!seen.has(abs) && isPlausibleProductImageUrl(abs)) {
          seen.add(abs);
          resolvedImages.push(abs);
        }
      } catch {
        // Skip invalid relative URL
      }
    }

    let priceThb = matchedJsonLd?.priceThb ?? null;
    if (priceThb === null) {
      const metaPrice = Number(extractMetaContent(html, 'property', 'product:price:amount'));
      const metaCurrency = (
        extractMetaContent(html, 'property', 'product:price:currency') ?? ''
      ).toUpperCase();
      if (
        Number.isFinite(metaPrice) &&
        metaPrice >= 15 &&
        metaPrice <= 80000 &&
        (metaCurrency === 'THB' || metaCurrency === '')
      ) {
        priceThb = Math.round(metaPrice);
      }
    }

    return {
      finalUrl,
      pageTitle: combinedTitle,
      candidateImages: resolvedImages.slice(0, 4),
      matchedProductTitle: matchedJsonLd?.name ?? (ogTitle || title || null),
      priceThb,
      rating: matchedJsonLd?.rating ?? null,
      reviewCount: matchedJsonLd?.reviewCount ?? null,
      matched: true,
    };
  } catch {
    return null;
  }
}

/**
 * Dedicated Product Image & Listing Page Verification Module (separate from Google Search Grounding).
 * Inspects real grounded listing/official brand pages, validates Brand + Product Name match,
 * verifies live image URL response & image/* content-type, and extracts verified structured metadata.
 */
export async function verifyProductMediaAndListing(
  productName: string,
  brand: string,
  candidateSourceUrls: GroundingSourceLink[]
): Promise<VerifiedListingEnrichment> {
  const unavailable: VerifiedListingEnrichment = {
    imageVerified: false,
    imageUrl: null,
    imageOriginUrl: null,
    imageSourceNoteEn:
      'Verified image unavailable — no live official brand or listing image matching this exact product name and brand could be verified.',
    imageSourceNoteMy:
      'Verified image unavailable — ဤ Product နှင့် Brand တိကျစွာကိုက်ညီပြီး အလုပ်လုပ်သော တကယ့်ပုံ Link မရရှိနိုင်သေးပါ။',
    verifiedPriceThb: null,
    verifiedRating: null,
    verifiedReviewCount: null,
    verifiedPageUrl: null,
    verifiedPageTitle: null,
  };

  if (candidateSourceUrls.length === 0) {
    return unavailable;
  }

  let verifiedPriceThb: number | null = null;
  let verifiedRating: number | null = null;
  let verifiedReviewCount: number | null = null;
  let verifiedPageUrl: string | null = null;
  let verifiedPageTitle: string | null = null;

  // Inspect up to 3 top-ranked grounded source pages for this product
  const urlsToCheck = candidateSourceUrls.slice(0, 3);

  for (const src of urlsToCheck) {
    const inspection = await inspectListingPage(src.url, productName, brand);
    if (!inspection || !inspection.matched) continue;

    if (!verifiedPageUrl) {
      verifiedPageUrl = inspection.finalUrl;
      verifiedPageTitle = inspection.matchedProductTitle || inspection.pageTitle;
    }
    if (verifiedPriceThb === null && inspection.priceThb !== null) {
      verifiedPriceThb = inspection.priceThb;
    }
    if (verifiedRating === null && inspection.rating !== null) {
      verifiedRating = inspection.rating;
    }
    if (verifiedReviewCount === null && inspection.reviewCount !== null) {
      verifiedReviewCount = inspection.reviewCount;
    }

    // Verify candidate image URLs from this matched official/listing page
    for (const imgUrl of inspection.candidateImages) {
      const check = await verifyLiveImageUrl(imgUrl);
      if (check.ok) {
        let host = 'verified listing';
        try {
          host = new URL(inspection.finalUrl).hostname.replace(/^www\./, '');
        } catch {
          host = 'verified listing';
        }
        return {
          imageVerified: true,
          imageUrl: `/api/image-proxy?url=${encodeURIComponent(imgUrl)}`,
          imageOriginUrl: imgUrl,
          imageSourceNoteEn: `Verified product image retrieved from matched listing (${host}).`,
          imageSourceNoteMy: `ကိုက်ညီသော Official / Seller Listing (${host}) မှ တကယ့်ပုံကို စစ်ဆေးအတည်ပြုထားပါသည်။`,
          verifiedPriceThb,
          verifiedRating,
          verifiedReviewCount,
          verifiedPageUrl,
          verifiedPageTitle,
        };
      }
    }
  }

  return {
    ...unavailable,
    verifiedPriceThb,
    verifiedRating,
    verifiedReviewCount,
    verifiedPageUrl,
    verifiedPageTitle,
  };
}

/**
 * Verifies a direct official brand storefront product image URL via live HTTP fetch,
 * confirms valid raster image/* response, registers it in the proxy allowlist, and returns
 * a safe /api/image-proxy URL (or verified=false if unreachable).
 */
export async function verifyOfficialStoreImageUrl(
  imgUrl: string | null | undefined,
  storeDomain: string
): Promise<{
  imageVerified: boolean;
  imageUrl: string | null;
  imageOriginUrl: string | null;
  imageSourceNoteEn: string;
  imageSourceNoteMy: string;
}> {
  if (!imgUrl || !isPlausibleProductImageUrl(imgUrl)) {
    return {
      imageVerified: false,
      imageUrl: null,
      imageOriginUrl: null,
      imageSourceNoteEn:
        'Verified image unavailable — no valid official product photo was returned by this listing.',
      imageSourceNoteMy:
        'Verified image unavailable — ဤ Product Listing မှ အတည်ပြုနိုင်သော ဓာတ်ပုံမရရှိနိုင်ပါ။',
    };
  }

  const check = await verifyLiveImageUrl(imgUrl);
  if (!check.ok) {
    return {
      imageVerified: false,
      imageUrl: null,
      imageOriginUrl: null,
      imageSourceNoteEn:
        'Verified image unavailable — product image URL did not pass live verification.',
      imageSourceNoteMy:
        'Verified image unavailable — Product ပုံ URL ကို Live စစ်ဆေးအတည်ပြု၍ မရပါ။',
    };
  }

  return {
    imageVerified: true,
    imageUrl: `/api/image-proxy?url=${encodeURIComponent(imgUrl)}`,
    imageOriginUrl: imgUrl,
    imageSourceNoteEn: `Verified official brand product photo retrieved live from ${storeDomain}.`,
    imageSourceNoteMy: `တရားဝင် Brand ဆိုင် (${storeDomain}) မှ တိုက်ရိုက်စစ်ဆေးအတည်ပြုထားသော Product ဓာတ်ပုံဖြစ်ပါသည်။`,
  };
}
