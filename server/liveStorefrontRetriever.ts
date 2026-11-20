import type { CategoryFilter, GroundingSourceLink, ProductCategory } from '../src/types/product.ts';
import { verifyOfficialStoreImageUrl } from './imageRetriever.ts';

export interface LiveStorefrontProduct {
  name: string;
  brand: string;
  shopName: string;
  category: ProductCategory;
  subCategoryHint: string;
  priceThb: number;
  productUrl: string;
  storeDomain: string;
  descriptionSnippet: string;
  reviewCount: number | null;
  customerRating: number | null;
  imageVerified: boolean;
  imageUrl: string | null;
  imageOriginUrl: string | null;
  imageSourceNoteEn: string;
  imageSourceNoteMy: string;
}

interface StorefrontFeed {
  brand: string;
  shopName: string;
  domain: string;
  category: ProductCategory;
  type: 'shopify' | 'woocommerce';
  endpointUrl: string;
  productUrlPrefix?: string;
}

/**
 * Verified Live Official Thai Brand Storefronts (all verified to return live THB prices,
 * real clickable product pages, and real official CDN product photos).
 */
const THAI_OFFICIAL_STOREFRONTS: readonly StorefrontFeed[] = [
  // Cosmetics & Beauty (Official Thai Brands)
  {
    brand: 'Plantnery',
    shopName: 'Plantnery Official Thailand',
    domain: 'plantnery.com',
    category: 'cosmetics-beauty',
    type: 'woocommerce',
    endpointUrl: 'https://plantnery.com/wp-json/wc/store/v1/products?per_page=15',
  },
  {
    brand: 'Rojukiss',
    shopName: 'Rojukiss Official Thailand',
    domain: 'rojukiss.com',
    category: 'cosmetics-beauty',
    type: 'woocommerce',
    endpointUrl: 'https://rojukiss.com/wp-json/wc/store/v1/products?per_page=15',
  },
  {
    brand: 'INGU',
    shopName: 'INGU Skin Official Thailand',
    domain: 'inguskin.com',
    category: 'cosmetics-beauty',
    type: 'shopify',
    endpointUrl: 'https://inguskin.com/products.json?limit=15',
    productUrlPrefix: 'https://inguskin.com/products/',
  },
  {
    brand: 'Her Hyness',
    shopName: 'Her Hyness Official Thailand',
    domain: 'herhynessbeauty.com',
    category: 'cosmetics-beauty',
    type: 'shopify',
    endpointUrl: 'https://herhynessbeauty.com/products.json?limit=15',
    productUrlPrefix: 'https://herhynessbeauty.com/products/',
  },
  // Women's Fashion (Official Thai Brands)
  {
    brand: 'lookbooklookbook',
    shopName: 'LookbookLookbook Official Thailand',
    domain: 'lookbooklookbook.com',
    category: 'womens-fashion',
    type: 'shopify',
    endpointUrl: 'https://lookbooklookbook.com/products.json?limit=15',
    productUrlPrefix: 'https://lookbooklookbook.com/products/',
  },
  {
    brand: 'SALISA',
    shopName: 'SALISA Official Thailand',
    domain: 'salisaofficial.com',
    category: 'womens-fashion',
    type: 'shopify',
    endpointUrl: 'https://salisaofficial.com/products.json?limit=15',
    productUrlPrefix: 'https://salisaofficial.com/products/',
  },
  {
    brand: 'Fabrique',
    shopName: 'Fabrique Official Thailand',
    domain: 'fabrique.co',
    category: 'womens-fashion',
    type: 'shopify',
    endpointUrl: 'https://fabrique.co/products.json?limit=15',
    productUrlPrefix: 'https://fabrique.co/products/',
  },
  {
    brand: 'O&B',
    shopName: 'O&B Official Thailand',
    domain: 'oandb.store',
    category: 'womens-fashion',
    type: 'shopify',
    endpointUrl: 'https://oandb.store/products.json?limit=15',
    productUrlPrefix: 'https://oandb.store/products/',
  },
];

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const EXCLUDED_TITLE_PATTERN =
  /\b(gift\s*card|e-?voucher|shopping\s*bag|paper\s*bag|test\s*product|free\s*gift|shipping\s*fee|box\s*only)\b/i;

function stripHtml(html: unknown): string {
  if (typeof html !== 'string') return '';
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanProductTitle(raw: string, brand: string): string {
  const trimmed = raw.replace(/\s+/g, ' ').trim();
  if (!trimmed) return '';
  // Prepend brand cleanly if not already present so every listing is clearly brand-identifiable
  const lower = trimmed.toLowerCase();
  const brandLower = brand.toLowerCase();
  if (lower.includes(brandLower)) return trimmed;
  return `${brand} ${trimmed}`;
}

interface RawFetchedCandidate {
  name: string;
  brand: string;
  shopName: string;
  category: ProductCategory;
  subCategoryHint: string;
  priceThb: number;
  productUrl: string;
  storeDomain: string;
  descriptionSnippet: string;
  reviewCount: number | null;
  customerRating: number | null;
  rawImageUrl: string | null;
}

async function fetchSingleStorefront(feed: StorefrontFeed): Promise<RawFetchedCandidate[]> {
  try {
    const res = await fetch(feed.endpointUrl, {
      signal: AbortSignal.timeout(5500),
      headers: {
        'User-Agent': BROWSER_USER_AGENT,
        Accept: 'application/json',
      },
    });
    if (!res.ok) return [];
    const ct = (res.headers.get('content-type') ?? '').toLowerCase();
    if (!ct.includes('json')) return [];

    const data: unknown = await res.json();
    const out: RawFetchedCandidate[] = [];

    if (feed.type === 'shopify') {
      const products =
        data && typeof data === 'object' && Array.isArray((data as { products?: unknown[] }).products)
          ? (data as { products: Record<string, unknown>[] }).products
          : [];

      for (const p of products) {
        const rawTitle = typeof p.title === 'string' ? p.title.trim() : '';
        const handle = typeof p.handle === 'string' ? p.handle.trim() : '';
        if (!rawTitle || !handle || EXCLUDED_TITLE_PATTERN.test(rawTitle)) continue;

        const variants = Array.isArray(p.variants) ? (p.variants as Record<string, unknown>[]) : [];
        const availableVariant =
          variants.find((v) => v.available !== false && Number(v.price) > 0) ??
          variants.find((v) => Number(v.price) > 0);
        if (!availableVariant) continue;

        const priceNum = Math.round(Number(availableVariant.price));
        if (!Number.isFinite(priceNum) || priceNum < 39 || priceNum > 30000) continue;

        const images = Array.isArray(p.images) ? (p.images as Record<string, unknown>[]) : [];
        const rawImageUrl =
          typeof images[0]?.src === 'string' && images[0].src.startsWith('http')
            ? images[0].src
            : null;

        const productType =
          typeof p.product_type === 'string' && p.product_type.trim().length > 0
            ? p.product_type.trim()
            : feed.category === 'womens-fashion'
              ? "Women's Apparel"
              : 'Skincare & Beauty';

        const desc = stripHtml(p.body_html).slice(0, 320);
        const productUrl = `${feed.productUrlPrefix ?? `https://${feed.domain}/products/`}${handle}`;

        out.push({
          name: cleanProductTitle(rawTitle, feed.brand),
          brand: feed.brand,
          shopName: feed.shopName,
          category: feed.category,
          subCategoryHint: productType,
          priceThb: priceNum,
          productUrl,
          storeDomain: feed.domain,
          descriptionSnippet: desc || `${rawTitle} sold directly via ${feed.shopName} (${feed.domain}).`,
          reviewCount: null,
          customerRating: null,
          rawImageUrl,
        });
      }
    } else if (feed.type === 'woocommerce' && Array.isArray(data)) {
      for (const item of data as Record<string, unknown>[]) {
        const rawTitle = typeof item.name === 'string' ? stripHtml(item.name) : '';
        const permalink = typeof item.permalink === 'string' ? item.permalink.trim() : '';
        if (!rawTitle || !permalink.startsWith('http') || EXCLUDED_TITLE_PATTERN.test(rawTitle)) {
          continue;
        }

        const prices =
          item.prices && typeof item.prices === 'object'
            ? (item.prices as Record<string, unknown>)
            : null;
        if (!prices) continue;

        const curr = typeof prices.currency_code === 'string' ? prices.currency_code.toUpperCase() : '';
        if (curr && curr !== 'THB') continue;

        const minorUnit =
          typeof prices.currency_minor_unit === 'number' && Number.isFinite(prices.currency_minor_unit)
            ? prices.currency_minor_unit
            : 0;
        const rawPriceVal = Number(prices.price);
        if (!Number.isFinite(rawPriceVal) || rawPriceVal <= 0) continue;

        const priceNum = Math.round(rawPriceVal / Math.pow(10, minorUnit));
        if (!Number.isFinite(priceNum) || priceNum < 39 || priceNum > 30000) continue;

        const images = Array.isArray(item.images) ? (item.images as Record<string, unknown>[]) : [];
        const rawImageUrl =
          typeof images[0]?.src === 'string' && images[0].src.startsWith('http')
            ? images[0].src
            : null;

        const categories = Array.isArray(item.categories)
          ? (item.categories as Record<string, unknown>[])
          : [];
        const subCategoryHint =
          typeof categories[0]?.name === 'string' && categories[0].name.trim()
            ? stripHtml(categories[0].name)
            : feed.category === 'womens-fashion'
              ? "Women's Apparel"
              : 'Skincare & Beauty';

        const avgRating = Number(item.average_rating);
        const revCount = Number(item.review_count);
        const customerRating =
          Number.isFinite(avgRating) && avgRating >= 1 && avgRating <= 5
            ? Math.round(avgRating * 10) / 10
            : null;
        const reviewCount =
          Number.isFinite(revCount) && revCount > 0 ? Math.round(revCount) : null;

        const desc = stripHtml(item.short_description || item.description).slice(0, 320);

        out.push({
          name: cleanProductTitle(rawTitle, feed.brand),
          brand: feed.brand,
          shopName: feed.shopName,
          category: feed.category,
          subCategoryHint,
          priceThb: priceNum,
          productUrl: permalink,
          storeDomain: feed.domain,
          descriptionSnippet: desc || `${rawTitle} sold directly via ${feed.shopName} (${feed.domain}).`,
          reviewCount,
          customerRating,
          rawImageUrl,
        });
      }
    }

    return out;
  } catch {
    return [];
  }
}

function roundRobinSelect<T>(buckets: T[][], limit: number): T[] {
  const selected: T[] = [];
  const indices = buckets.map(() => 0);
  let madeProgress = true;

  while (selected.length < limit && madeProgress) {
    madeProgress = false;
    for (let b = 0; b < buckets.length && selected.length < limit; b += 1) {
      const idx = indices[b];
      if (idx < buckets[b].length) {
        selected.push(buckets[b][idx]);
        indices[b] = idx + 1;
        madeProgress = true;
      }
    }
  }
  return selected;
}

function dedupeRawCandidates(items: RawFetchedCandidate[]): RawFetchedCandidate[] {
  const seen = new Set<string>();
  const unique: RawFetchedCandidate[] = [];
  for (const item of items) {
    const key = item.name
      .toLowerCase()
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/\b\d+\s*(ml|g|mg|pcs|sheets?)\b/g, ' ')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique;
}

/**
 * Fetches REAL live products from official Thailand Women's Fashion & Cosmetics brand storefronts,
 * deduplicates across brands, and verifies each product's live image URL before returning.
 */
export async function fetchLiveThaiStorefrontProducts(
  category: CategoryFilter,
  quantity: number
): Promise<{
  products: LiveStorefrontProduct[];
  sources: GroundingSourceLink[];
  queries: string[];
}> {
  const targetFeeds = THAI_OFFICIAL_STOREFRONTS.filter(
    (feed) => category === 'all' || feed.category === category
  );

  const feedResults = await Promise.all(targetFeeds.map((feed) => fetchSingleStorefront(feed)));

  let selectedRaw: RawFetchedCandidate[] = [];

  if (category === 'all') {
    const fashionBuckets = targetFeeds
      .map((feed, i) => (feed.category === 'womens-fashion' ? dedupeRawCandidates(feedResults[i]) : []))
      .filter((arr) => arr.length > 0);
    const beautyBuckets = targetFeeds
      .map((feed, i) => (feed.category === 'cosmetics-beauty' ? dedupeRawCandidates(feedResults[i]) : []))
      .filter((arr) => arr.length > 0);

    const fashionTarget = Math.ceil(quantity / 2);
    const beautyTarget = quantity - fashionTarget;

    const fashionPicks = roundRobinSelect(fashionBuckets, fashionTarget);
    const beautyPicks = roundRobinSelect(beautyBuckets, beautyTarget);
    selectedRaw = roundRobinSelect([beautyPicks, fashionPicks], quantity);
  } else {
    const buckets = feedResults.map((list) => dedupeRawCandidates(list)).filter((arr) => arr.length > 0);
    selectedRaw = roundRobinSelect(buckets, quantity);
  }

  // Verify live product images in parallel (capped concurrency batches of 6 for speed & stability)
  const verifiedProducts: LiveStorefrontProduct[] = [];
  for (let i = 0; i < selectedRaw.length; i += 6) {
    const slice = selectedRaw.slice(i, i + 6);
    const verifiedSlice = await Promise.all(
      slice.map(async (item): Promise<LiveStorefrontProduct> => {
        const imgCheck = await verifyOfficialStoreImageUrl(item.rawImageUrl, item.storeDomain);
        return {
          name: item.name,
          brand: item.brand,
          shopName: item.shopName,
          category: item.category,
          subCategoryHint: item.subCategoryHint,
          priceThb: item.priceThb,
          productUrl: item.productUrl,
          storeDomain: item.storeDomain,
          descriptionSnippet: item.descriptionSnippet,
          reviewCount: item.reviewCount,
          customerRating: item.customerRating,
          imageVerified: imgCheck.imageVerified,
          imageUrl: imgCheck.imageUrl,
          imageOriginUrl: imgCheck.imageOriginUrl,
          imageSourceNoteEn: imgCheck.imageSourceNoteEn,
          imageSourceNoteMy: imgCheck.imageSourceNoteMy,
        };
      })
    );
    verifiedProducts.push(...verifiedSlice);
  }

  const sources: GroundingSourceLink[] = verifiedProducts.map((p) => ({
    title: `${p.name} — ${p.shopName}`,
    url: p.productUrl,
    domain: p.storeDomain,
  }));

  const queries = Array.from(new Set(verifiedProducts.map((p) => `Live official store: ${p.storeDomain}`)));

  return {
    products: verifiedProducts,
    sources,
    queries,
  };
}
