import crypto from 'node:crypto';
import type {
  KalodataProductDetailEnrichmentRecord,
  KalodataReviewInsightData,
  KalodataShopEnrichmentRecord,
  LinkImportBudgetSummary,
  LinkImportClassification,
  LinkImportErrorCode,
  LinkImportExecuteResponse,
  LinkImportInspectResponse,
  LinkImportLinkType,
  ProductCategory,
  ResearchCostSummary,
  ResearchProduct,
} from '../src/types/product.ts';
import {
  CATEGORY_BY_ID,
  matchKalodataCategoryNameToSlug,
} from '../src/utils/categoryRegistry.ts';
import {
  DEFAULT_SPENDING_LIMIT_CREDITS,
  formatCredits,
  KALODATA_PRODUCT_DETAIL_CREDIT,
  KALODATA_USD_PER_CREDIT,
} from '../src/utils/kalodataPricing.ts';
import { evaluateProductOpportunity, getCanonicalProductId } from '../src/utils/scoring.ts';
import {
  BudgetStorageUnavailableError,
  getDefaultBudgetLedger,
  PersistentBudgetLedger,
  resolveAuthoritativeBudgetScope,
} from './budgetLedgerService.ts';
import {
  deleteInFlightProductDetailPromise,
  getInFlightProductDetailPromise,
  getServerCachedProductDetail,
  getServerCachedReviewInsight,
  getServerCachedShopDetail,
  setInFlightProductDetailPromise,
  setServerCachedProductDetail,
  toProductDetailRecord,
} from './enrichmentService.ts';
import {
  decodeHtmlUrlEntities,
  isSafeExternalUrl,
  normalizeExternalImageUrl,
  resolveLiveTikTokProductImageUrl,
  verifyKalodataImageUrl,
} from './imageRetriever.ts';
import { parseKalodataProductDetail, type ParsedCommentInsight, type ParsedProductDetail, type ParsedShopDetail } from './kalodataAnalysis.ts';
import {
  fetchKalodataCreditBalance,
  fetchKalodataProductDetail,
  resolveProductCategoryFromKalodataId,
  type KalodataBalanceResult,
  type KalodataDetailApiResult,
} from './kalodataService.ts';
import {
  buildKalodataProductSummary,
  cachedProductDetailToParsed,
  getResearchQuotaStatus,
} from './researchService.ts';
import {
  buildFallbackTikTokShopUrl,
  extractNumericTikTokProductId,
  resolveCanonicalTikTokProductUrl,
  type TikTokProductLinkResolution,
} from './tiktokLinkService.ts';

const MAX_REDIRECT_HOPS = 8;
const LINK_FETCH_TIMEOUT_MS = 6000;
const LINK_CACHE_TTL_MS = 10 * 60 * 1000;
const LINK_CACHE_MAX = 300;
const TIKTOK_NUMERIC_ID_REGEX = /^\d{8,24}$/;

const DESKTOP_CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const TIKTOK_SHORTENER_HOSTS = new Set([
  'vt.tiktok.com',
  'vm.tiktok.com',
  's.tiktok.com',
  'l.tiktok.com',
  't.tiktok.com',
  'tiktok.onelink.me',
]);

const GENERIC_ALLOWED_SHORTENER_HOSTS = new Set([
  'bit.ly',
  'tinyurl.com',
  't.co',
  'cutt.ly',
  'rb.gy',
  'is.gd',
  'rebrand.ly',
  'tiny.cc',
  'ow.ly',
  'goo.gl',
  'shorturl.at',
]);

const UNSUPPORTED_ECOMMERCE_HOSTS = [
  'shopee.co.th',
  'shopee.com',
  'shope.ee',
  'shp.ee',
  's.shopee.co.th',
  'lazada.co.th',
  'lazada.com',
  's.lazada.co.th',
  'amazon.com',
  'amazon.co.uk',
  'amzn.to',
  'aliexpress.com',
  'alibaba.com',
  'temu.com',
  'shein.com',
  'facebook.com',
  'fb.com',
  'instagram.com',
  'youtube.com',
  'youtu.be',
  'line.me',
  'lin.ee',
  'kalodata.com',
];

const NON_THAILAND_REGION_CODES = new Set([
  'us',
  'uk',
  'gb',
  'id',
  'my',
  'vn',
  'ph',
  'sg',
  'jp',
  'br',
  'mx',
  'es',
  'de',
  'fr',
  'it',
  'pl',
  'nl',
  'ie',
]);

const REDIRECT_QUERY_KEYS = [
  'url',
  'target',
  'redirect_url',
  'redirect',
  'u',
  'fallback',
  'browser_fallback_url',
  's.browser_fallback_url',
  'next',
  'dest',
  'destination',
];

interface ResolvedShortLinkEntry {
  finalUrl: string;
  hops: string[];
  productId: string | null;
  previewTitle: string | null;
  previewImageUrl: string | null;
  classification: LinkImportClassification;
  errorCode?: LinkImportErrorCode;
  messageEn?: string;
  messageMy?: string;
  expiresAt: number;
}

const resolvedLinkChainCache = new Map<string, ResolvedShortLinkEntry>();

export function clearLinkImportCache(): void {
  resolvedLinkChainCache.clear();
}

export class LinkImportApiError extends Error {
  status: number;
  code: LinkImportErrorCode;
  classification: LinkImportClassification;
  errorMy?: string;
  budgetSnapshot?: {
    scopeKey: string;
    configuredLimitCredits: number;
    totalCommittedCredits: number;
    remainingCredits: number;
  };

  constructor(
    status: number,
    code: LinkImportErrorCode,
    classification: LinkImportClassification,
    message: string,
    errorMy?: string,
    budgetSnapshot?: {
      scopeKey: string;
      configuredLimitCredits: number;
      totalCommittedCredits: number;
      remainingCredits: number;
    }
  ) {
    super(message);
    this.name = 'LinkImportApiError';
    this.status = status;
    this.code = code;
    this.classification = classification;
    this.errorMy = errorMy;
    this.budgetSnapshot = budgetSnapshot;
  }
}

export interface LinkImportWorkspaceIds {
  results?: readonly string[];
  saved?: readonly string[];
  history?: readonly string[];
}

export interface LinkImportTestOverrides {
  fetchLink?: (
    url: string,
    init?: RequestInit
  ) => Promise<{
    status: number;
    headers: { get: (name: string) => string | null };
    text?: () => Promise<string>;
    body?: { cancel?: () => Promise<void> } | null;
  }>;
  resolveCanonicalUrl?: (productId: string) => Promise<TikTokProductLinkResolution>;
  fetchBalance?: () => Promise<KalodataBalanceResult>;
  fetchProductDetail?: (params: {
    region: string;
    language: string;
    currency: string;
    date_range: string;
    product_id: string;
    need_extra?: boolean;
  }) => Promise<KalodataDetailApiResult<Record<string, unknown>>>;
  verifyImage?: (imgUrl: string | null | undefined) => Promise<{
    imageVerified: boolean;
    imageUrl: string | null;
    imageOriginUrl: string | null;
    imageSourceNoteEn: string;
    imageSourceNoteMy: string;
  }>;
  resolveLiveImage?: (productId: string) => Promise<string | null>;
  budgetLedger?: PersistentBudgetLedger;
  budgetScopeKey?: string;
  skipShortLinkCache?: boolean;
}

function roundCredits3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function isDeterministicNonBilledHttpError(
  httpStatus: number | null,
  upstreamCode?: string
): boolean {
  if (upstreamCode === 'MISSING_API_KEY') return true;
  if (httpStatus !== null && [400, 401, 403, 404, 422, 429].includes(httpStatus)) {
    return true;
  }
  return false;
}

function matchesHostDomain(host: string, domain: string): boolean {
  const cleanHost = host.toLowerCase().replace(/\.+$/, '');
  const cleanDomain = domain.toLowerCase().replace(/\.+$/, '');
  return cleanHost === cleanDomain || cleanHost.endsWith(`.${cleanDomain}`);
}

function isTikTokDomain(host: string): boolean {
  return (
    matchesHostDomain(host, 'tiktok.com') ||
    matchesHostDomain(host, 'tiktokglobalshop.com') ||
    matchesHostDomain(host, 'tiktokshop.com') ||
    matchesHostDomain(host, 'tiktokv.com') ||
    matchesHostDomain(host, 'tiktok.onelink.me')
  );
}

function isAllowedShortenerHost(host: string): boolean {
  const clean = host.toLowerCase().replace(/\.+$/, '');
  return (
    TIKTOK_SHORTENER_HOSTS.has(clean) ||
    GENERIC_ALLOWED_SHORTENER_HOSTS.has(clean)
  );
}

function isUnsupportedEcommerceHost(host: string): boolean {
  return UNSUPPORTED_ECOMMERCE_HOSTS.some((domain) => matchesHostDomain(host, domain));
}

function normalizePastedUrlCandidate(rawInput: string): {
  extractedInputUrl: string | null;
  linkTypeHint: LinkImportLinkType | null;
  isLikelyUnsafeAddress: boolean;
} {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { extractedInputUrl: null, linkTypeHint: null, isLikelyUnsafeAddress: false };
  }

  // Deep link schemes (snssdk1180://, snssdk1233://, tiktok://, intent://)
  const deepLinkMatch = trimmed.match(
    /(?:snssdk1180|snssdk1233|tiktok|intent):\/\/[^\s<>"'`]+/i
  );
  if (deepLinkMatch?.[0]) {
    return {
      extractedInputUrl: deepLinkMatch[0].replace(/[),.;]+$/, ''),
      linkTypeHint: 'deep-link',
      isLikelyUnsafeAddress: false,
    };
  }

  // Standard http(s) URL inside share caption or raw paste
  const httpMatch = trimmed.match(/https?:\/\/[^\s<>"'`]+/i);
  if (httpMatch?.[0]) {
    const cleaned = httpMatch[0].replace(/[),.;!?]+$/, '');
    const hadSurroundingCaption = cleaned.length < trimmed.length - 4;
    return {
      extractedInputUrl: cleaned,
      linkTypeHint: hadSurroundingCaption ? 'share-text' : null,
      isLikelyUnsafeAddress: false,
    };
  }

  // Reject explicit non-http dangerous schemes like javascript:, data:, file:, ftp:
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return {
      extractedInputUrl: trimmed.split(/\s+/)[0] ?? trimmed,
      linkTypeHint: null,
      isLikelyUnsafeAddress: true,
    };
  }

  // Bare host without scheme (e.g. vt.tiktok.com/ZSr..., shop.tiktok.com/th/pdp/...)
  const bareMatch = trimmed.match(
    /\b((?:vt|vm|s|l|t|www|m|shop)\.tiktok\.com|tiktok\.com|localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|\[::1\])(?:[:/][^\s<>"'`]*)?/i
  );
  if (bareMatch?.[0]) {
    const candidate = `https://${bareMatch[0].replace(/[),.;!?]+$/, '')}`;
    return {
      extractedInputUrl: candidate,
      linkTypeHint: trimmed.length > bareMatch[0].length + 4 ? 'share-text' : null,
      isLikelyUnsafeAddress: false,
    };
  }

  // Check if plain numeric ID was pasted (e.g. "172940000111222333") -> invalid link format, not a URL
  return {
    extractedInputUrl: null,
    linkTypeHint: null,
    isLikelyUnsafeAddress: false,
  };
}

interface ParsedUrlInspection {
  classification: LinkImportClassification;
  errorCode?: LinkImportErrorCode;
  messageEn: string;
  messageMy: string;
  productId: string | null;
  needsNetworkResolve: boolean;
  unwrappedUrl: string | null;
  linkType: LinkImportLinkType | null;
}

function extractProductIdFromDeepLink(rawDeepLink: string): {
  productId: string | null;
  fallbackHttpUrl: string | null;
  nonThailand: boolean;
} {
  let fallbackHttpUrl: string | null = null;
  let productId: string | null = null;
  let nonThailand = false;

  const fallbackParam = rawDeepLink.match(/S\.browser_fallback_url=([^;#]+)/i);
  if (fallbackParam?.[1]) {
    try {
      fallbackHttpUrl = decodeURIComponent(fallbackParam[1]);
    } catch {
      fallbackHttpUrl = fallbackParam[1];
    }
  }

  if (rawDeepLink.toLowerCase().startsWith('intent://')) {
    const body = rawDeepLink.replace(/^intent:\/\//i, '').split('#Intent')[0] ?? '';
    const hostPathHttp = body.startsWith('shop.tiktok.com') || body.startsWith('www.tiktok.com')
      ? `https://${body}`
      : null;
    if (hostPathHttp && !fallbackHttpUrl) {
      fallbackHttpUrl = hostPathHttp;
    }
  }

  // requestParams={"product_id":["1729..."]} or product_id=1729...
  const decodedAll = (() => {
    try {
      return decodeURIComponent(rawDeepLink);
    } catch {
      return rawDeepLink;
    }
  })();

  const jsonMatch = decodedAll.match(/"product_id"\s*:\s*\[\s*"?(\d{8,24})"?/i) ??
    decodedAll.match(/"product_id"\s*:\s*"?(\d{8,24})"?/i);
  if (jsonMatch?.[1] && TIKTOK_NUMERIC_ID_REGEX.test(jsonMatch[1])) {
    productId = jsonMatch[1];
  }

  if (!productId) {
    const queryMatch = decodedAll.match(/[?&](?:product_id|productId)=(\d{8,24})\b/i);
    if (queryMatch?.[1] && TIKTOK_NUMERIC_ID_REGEX.test(queryMatch[1])) {
      productId = queryMatch[1];
    }
  }

  const regionMatch = decodedAll.match(/[?&]region=([a-z]{2})\b/i);
  if (regionMatch?.[1] && NON_THAILAND_REGION_CODES.has(regionMatch[1].toLowerCase())) {
    nonThailand = true;
  }

  return { productId, fallbackHttpUrl, nonThailand };
}

function inspectSingleParsedUrl(
  rawUrl: string,
  depth = 0
): ParsedUrlInspection {
  if (/^(?:snssdk1180|snssdk1233|tiktok|intent):\/\//i.test(rawUrl)) {
    const deep = extractProductIdFromDeepLink(rawUrl);
    if (deep.nonThailand) {
      return {
        classification: 'unsupported-link',
        errorCode: 'NON_THAILAND_SHOP_LINK',
        messageEn: 'This deep link belongs to a non-Thailand TikTok Shop region. SiamPick supports Thailand TikTok Shop products only.',
        messageMy: 'ဤ Deep Link သည် ထိုင်းနိုင်ငံ (TH) TikTok Shop မဟုတ်ပါ။ SiamPick သည် Thailand TikTok Shop Product များကိုသာ Support လုပ်ပါသည်။',
        productId: null,
        needsNetworkResolve: false,
        unwrappedUrl: null,
        linkType: 'deep-link',
      };
    }
    if (deep.productId) {
      return {
        classification: 'valid-product',
        messageEn: `TikTok Shop Thailand Product ID #${deep.productId} identified from app link.`,
        messageMy: `App Link မှ Thailand TikTok Shop Product ID #${deep.productId} ကို စစ်ဆေးတွေ့ရှိပါသည်။`,
        productId: deep.productId,
        needsNetworkResolve: false,
        unwrappedUrl: deep.fallbackHttpUrl,
        linkType: 'deep-link',
      };
    }
    if (deep.fallbackHttpUrl && depth < 4) {
      return inspectSingleParsedUrl(deep.fallbackHttpUrl, depth + 1);
    }
    return {
      classification: 'unsupported-link',
      errorCode: 'UNSUPPORTED_TIKTOK_SURFACE',
      messageEn: 'This TikTok app deep link does not point to a TikTok Shop product.',
      messageMy: 'ဤ TikTok App Link တွင် TikTok Shop Product ID မပါဝင်ပါ။',
      productId: null,
      needsNetworkResolve: false,
      unwrappedUrl: null,
      linkType: 'deep-link',
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return {
      classification: 'invalid-link',
      errorCode: 'INVALID_URL',
      messageEn: 'The link format is invalid. Please paste a full TikTok Shop product URL or short link.',
      messageMy: 'Link ပုံစံ မမှန်ကန်ပါ။ မှန်ကန်သော TikTok Shop Product Link သို့မဟုတ် Short Link ကို ထည့်သွင်းပါ။',
      productId: null,
      needsNetworkResolve: false,
      unwrappedUrl: null,
      linkType: null,
    };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return {
      classification: 'invalid-link',
      errorCode: 'INVALID_URL',
      messageEn: 'Only http:// and https:// links are supported.',
      messageMy: 'http:// သို့မဟုတ် https:// Link များကိုသာ လက်ခံပါသည်။',
      productId: null,
      needsNetworkResolve: false,
      unwrappedUrl: null,
      linkType: null,
    };
  }

  // SSRF Guard BEFORE inspecting params or doing any network call
  if (!isSafeExternalUrl(rawUrl)) {
    return {
      classification: 'invalid-link',
      errorCode: 'SSRF_BLOCKED',
      messageEn: 'Private, local, or unsafe network addresses are blocked for security.',
      messageMy: 'လုံခြုံရေးအရ Local/Private Network Link များကို ပိတ်ပင်ထားပါသည်။',
      productId: null,
      needsNetworkResolve: false,
      unwrappedUrl: null,
      linkType: null,
    };
  }

  const host = parsed.hostname.toLowerCase().replace(/\.+$/, '');
  const pathname = parsed.pathname;

  // Unwrap redirect query parameters when depth allows
  if (depth < 5) {
    for (const key of REDIRECT_QUERY_KEYS) {
      const candidate = parsed.searchParams.get(key);
      if (candidate && candidate.trim().length > 0) {
        const inner = candidate.trim();
        if (
          /^https?:\/\//i.test(inner) ||
          /^(?:snssdk1180|snssdk1233|tiktok|intent):\/\//i.test(inner)
        ) {
          const innerInspection = inspectSingleParsedUrl(inner, depth + 1);
          if (
            innerInspection.classification === 'valid-product' ||
            innerInspection.needsNetworkResolve ||
            innerInspection.errorCode === 'SSRF_BLOCKED' ||
            innerInspection.errorCode === 'NON_THAILAND_SHOP_LINK' ||
            innerInspection.errorCode === 'UNSUPPORTED_PLATFORM' ||
            innerInspection.errorCode === 'UNSUPPORTED_TIKTOK_SURFACE'
          ) {
            return {
              ...innerInspection,
              linkType:
                innerInspection.linkType === 'deep-link'
                  ? 'deep-link'
                  : 'redirect-link',
            };
          }
        }
      }
    }
  }

  // Explicitly block unsupported shopping/social platforms without making outbound fetches
  if (isUnsupportedEcommerceHost(host)) {
    return {
      classification: 'unsupported-link',
      errorCode: 'UNSUPPORTED_PLATFORM',
      messageEn: `Links from ${host} are not supported. Please paste a Thailand TikTok Shop product link.`,
      messageMy: `${host} Link များကို မပံ့ပိုးပါ။ Thailand TikTok Shop Product Link ကိုသာ ထည့်သွင်းပါ။`,
      productId: null,
      needsNetworkResolve: false,
      unwrappedUrl: null,
      linkType: null,
    };
  }

  const tikTokHost = isTikTokDomain(host);
  const allowedShortener = isAllowedShortenerHost(host);

  if (!tikTokHost && !allowedShortener) {
    return {
      classification: 'unsupported-link',
      errorCode: 'UNSUPPORTED_PLATFORM',
      messageEn: `Unsupported domain (${host}). Please paste a Thailand TikTok Shop link (shop.tiktok.com, vt.tiktok.com, or tiktok.com/t/...).`,
      messageMy: `ပံ့ပိုးမထားသော Website (${host}) ဖြစ်ပါသည်။ Thailand TikTok Shop Link (shop.tiktok.com, vt.tiktok.com, tiktok.com/t/...) ကိုသာ ထည့်သွင်းပါ။`,
      productId: null,
      needsNetworkResolve: false,
      unwrappedUrl: null,
      linkType: null,
    };
  }

  // Non-TikTok generic shorteners (bit.ly, tinyurl.com, t.co, etc.) MUST resolve first
  if (!tikTokHost && allowedShortener) {
    return {
      classification: 'invalid-link',
      messageEn: 'Resolving short link...',
      messageMy: 'Short Link ကို စစ်ဆေးနေပါသည်...',
      productId: null,
      needsNetworkResolve: true,
      unwrappedUrl: null,
      linkType: 'short-link',
    };
  }

  // Check explicit TikTok short links & /t/ redirect paths
  if (
    TIKTOK_SHORTENER_HOSTS.has(host) ||
    /^\/t\/[A-Za-z0-9_-]{4,}/i.test(pathname) ||
    /^\/share\/[^/]+/i.test(pathname)
  ) {
    return {
      classification: 'invalid-link',
      messageEn: 'Resolving TikTok short link...',
      messageMy: 'TikTok Short Link ကို စစ်ဆေးနေပါသည်...',
      productId: null,
      needsNetworkResolve: true,
      unwrappedUrl: null,
      linkType: 'short-link',
    };
  }

  // Check non-Thailand PDP region prefix or region query param BEFORE accepting product ID
  const regionPathMatch = pathname.match(
    /^\/([a-z]{2})\/(?:pdp|view\/product|product)\b/i
  );
  if (regionPathMatch?.[1]) {
    const regionCode = regionPathMatch[1].toLowerCase();
    if (NON_THAILAND_REGION_CODES.has(regionCode) && regionCode !== 'th') {
      return {
        classification: 'unsupported-link',
        errorCode: 'NON_THAILAND_SHOP_LINK',
        messageEn: `This is a "${regionCode.toUpperCase()}" TikTok Shop link. SiamPick currently supports Thailand (TH) TikTok Shop products only.`,
        messageMy: `ဤ Link သည် "${regionCode.toUpperCase()}" TikTok Shop Link ဖြစ်ပါသည်။ SiamPick သည် လက်ရှိတွင် ထိုင်းနိုင်ငံ (TH) TikTok Shop Product များကိုသာ Support လုပ်ပါသည်။`,
        productId: null,
        needsNetworkResolve: false,
        unwrappedUrl: null,
        linkType: 'direct-pdp',
      };
    }
  }

  const queryRegion = (
    parsed.searchParams.get('region') ??
    parsed.searchParams.get('shop_region') ??
    parsed.searchParams.get('country')
  )
    ?.trim()
    .toLowerCase();
  if (queryRegion && NON_THAILAND_REGION_CODES.has(queryRegion) && queryRegion !== 'th') {
    return {
      classification: 'unsupported-link',
      errorCode: 'NON_THAILAND_SHOP_LINK',
      messageEn: `This TikTok Shop link targets region "${queryRegion.toUpperCase()}". Only Thailand (TH) TikTok Shop products are supported.`,
      messageMy: `ဤ Link သည် "${queryRegion.toUpperCase()}" ဈေးကွက်အတွက် ဖြစ်နေပါသည်။ ထိုင်း (TH) TikTok Shop Product များကိုသာ Support လုပ်ပါသည်။`,
      productId: null,
      needsNetworkResolve: false,
      unwrappedUrl: null,
      linkType: 'direct-pdp',
    };
  }

  // Reject TikTok Video / User Profile / Live / Tag / Music / Storefront URLs explicitly
  // (Crucial: NEVER misinterpret a video ID like /@user/video/7400... as a product ID!)
  if (
    /^\/@[^/]+\/video\/\d+/i.test(pathname) ||
    /^\/video\/\d+/i.test(pathname) ||
    /^\/v\/\d+/i.test(pathname) ||
    /^\/@[^/]+\/?$/i.test(pathname) ||
    /^\/live(?:\/|$)/i.test(pathname) ||
    /^\/tag(?:\/|$)/i.test(pathname) ||
    /^\/music(?:\/|$)/i.test(pathname) ||
    /^\/discover(?:\/|$)/i.test(pathname) ||
    /^\/explore(?:\/|$)/i.test(pathname)
  ) {
    return {
      classification: 'unsupported-link',
      errorCode: 'UNSUPPORTED_TIKTOK_SURFACE',
      messageEn:
        'This is a TikTok video, profile, or livestream link rather than a TikTok Shop product link. Please copy the product link from the TikTok Shop product page.',
      messageMy:
        'ဤ Link သည် Product Link မဟုတ်ဘဲ TikTok Video၊ Profile သို့မဟုတ် Live Link ဖြစ်နေပါသည်။ TikTok Shop Product စာမျက်နှာမှ Share Link ကို Copy ယူပေးပါ။',
      productId: null,
      needsNetworkResolve: false,
      unwrappedUrl: null,
      linkType: null,
    };
  }

  // Extract numeric Product ID from supported TikTok Shop PDP paths
  const pdpPatterns = [
    /^\/th\/pdp\/[^/]+\/(\d{8,24})(?:\/|$)/i,
    /^\/th\/pdp\/(\d{8,24})(?:\/|$)/i,
    /^\/pdp\/[^/]+\/(\d{8,24})(?:\/|$)/i,
    /^\/pdp\/(\d{8,24})(?:\/|$)/i,
    /^\/shop\/pdp\/[^/]+\/(\d{8,24})(?:\/|$)/i,
    /^\/shop\/pdp\/(\d{8,24})(?:\/|$)/i,
    /^\/shop\/p\/(\d{8,24})(?:\/|$)/i,
    /^\/view\/product\/(\d{8,24})(?:\/|$)/i,
    /^\/product\/(\d{8,24})(?:\/|$)/i,
  ];

  for (const regex of pdpPatterns) {
    const match = pathname.match(regex);
    if (match?.[1] && TIKTOK_NUMERIC_ID_REGEX.test(match[1])) {
      return {
        classification: 'valid-product',
        messageEn: `TikTok Shop Thailand Product ID #${match[1]} identified.`,
        messageMy: `Thailand TikTok Shop Product ID #${match[1]} ကို အောင်မြင်စွာ ရှာဖွေတွေ့ရှိပါသည်။`,
        productId: match[1],
        needsNetworkResolve: false,
        unwrappedUrl: rawUrl,
        linkType: depth > 0 ? 'redirect-link' : 'direct-pdp',
      };
    }
  }

  // Extract from query params on shop/ec PDP endpoints
  if (
    /^\/(?:ec\/pdp|th\/pdp|pdp|shop\/pdp|view\/product|shop)\/?$/i.test(pathname) ||
    host === 'shop.tiktok.com'
  ) {
    const queryId =
      parsed.searchParams.get('product_id') ??
      parsed.searchParams.get('productId') ??
      parsed.searchParams.get('item_id');
    if (queryId && TIKTOK_NUMERIC_ID_REGEX.test(queryId.trim())) {
      const cleanId = queryId.trim();
      return {
        classification: 'valid-product',
        messageEn: `TikTok Shop Thailand Product ID #${cleanId} identified.`,
        messageMy: `Thailand TikTok Shop Product ID #${cleanId} ကို အောင်မြင်စွာ ရှာဖွေတွေ့ရှိပါသည်။`,
        productId: cleanId,
        needsNetworkResolve: false,
        unwrappedUrl: rawUrl,
        linkType: depth > 0 ? 'redirect-link' : 'direct-pdp',
      };
    }

    const requestParamsRaw = parsed.searchParams.get('requestParams');
    if (requestParamsRaw) {
      const idMatch =
        requestParamsRaw.match(/"product_id"\s*:\s*\[\s*"?(\d{8,24})"?/i) ??
        requestParamsRaw.match(/"product_id"\s*:\s*"?(\d{8,24})"?/i);
      if (idMatch?.[1] && TIKTOK_NUMERIC_ID_REGEX.test(idMatch[1])) {
        return {
          classification: 'valid-product',
          messageEn: `TikTok Shop Thailand Product ID #${idMatch[1]} identified.`,
          messageMy: `Thailand TikTok Shop Product ID #${idMatch[1]} ကို အောင်မြင်စွာ ရှာဖွေတွေ့ရှိပါသည်။`,
          productId: idMatch[1],
          needsNetworkResolve: false,
          unwrappedUrl: rawUrl,
          linkType: 'redirect-link',
        };
      }
    }
  }

  // If it's a TikTok storefront/shop/redirect endpoint without an explicit product ID yet, classify as unsupported
  if (/^\/(?:shop\/store|store)\//i.test(pathname) || pathname === '/' || pathname === '/shop') {
    return {
      classification: 'unsupported-link',
      errorCode: 'UNSUPPORTED_TIKTOK_SURFACE',
      messageEn:
        'This looks like a TikTok Shop homepage or store link without a specific product ID. Please open a specific product and copy its link.',
      messageMy:
        'ဤ Link သည် ဆိုင်စာမျက်နှာ သို့မဟုတ် Shop Homepage Link ဖြစ်ပြီး Product ID မပါဝင်ပါ။ Product တစ်ခုချင်းစီ၏ Link ကို Copy ယူပါ။',
      productId: null,
      needsNetworkResolve: false,
      unwrappedUrl: null,
      linkType: null,
    };
  }

  // Other unknown TikTok link with an opaque query/path redirect token -> probe once if safe
  if (parsed.searchParams.has('r') || parsed.searchParams.has('share_url') || /redirect/i.test(pathname)) {
    return {
      classification: 'invalid-link',
      messageEn: 'Resolving TikTok redirect link...',
      messageMy: 'TikTok Redirect Link ကို စစ်ဆေးနေပါသည်...',
      productId: null,
      needsNetworkResolve: true,
      unwrappedUrl: null,
      linkType: 'redirect-link',
    };
  }

  return {
    classification: 'unsupported-link',
    errorCode: 'UNSUPPORTED_TIKTOK_SURFACE',
    messageEn:
      'Could not find a TikTok Shop product ID in this link. Please paste a direct product link (/th/pdp/...) or TikTok Shop short link (vt.tiktok.com/...).',
    messageMy:
      'ဤ Link ထဲတွင် TikTok Shop Product ID ကို ရှာမတွေ့ပါ။ Product Link (/th/pdp/...) သို့မဟုတ် Short Link (vt.tiktok.com/...) ကို ထည့်သွင်းပါ။',
    productId: null,
    needsNetworkResolve: false,
    unwrappedUrl: null,
    linkType: null,
  };
}

function extractHtmlRedirectAndMeta(html: string, baseUrl: string): {
  nextUrls: string[];
  deepLinks: string[];
  previewTitle: string | null;
  previewImageUrl: string | null;
  explicitNotFound: boolean;
} {
  const nextUrls: string[] = [];
  const deepLinks: string[] = [];

  const pushNext = (raw: string | undefined) => {
    if (!raw) return;
    const decoded = decodeHtmlUrlEntities(raw);
    if (!decoded) return;
    if (/^(?:snssdk1180|snssdk1233|tiktok|intent):\/\//i.test(decoded)) {
      deepLinks.push(decoded);
      return;
    }
    try {
      const abs = new URL(decoded, baseUrl).toString();
      if (!nextUrls.includes(abs)) nextUrls.push(abs);
    } catch {
      // Ignore malformed candidate
    }
  };

  // Meta refresh
  const metaRefresh =
    html.match(/<meta[^>]+http-equiv=["']refresh["'][^>]+content=["'][^"']*url=([^"';\s>]+)["']/i) ??
    html.match(/<meta[^>]+content=["'][^"']*url=([^"';\s>]+)["'][^>]+http-equiv=["']refresh["']/i);
  if (metaRefresh?.[1]) pushNext(metaRefresh[1]);

  // Canonical & og:url
  const canonical =
    html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i) ??
    html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
  if (canonical?.[1]) pushNext(canonical[1]);

  const ogUrl =
    html.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:url["']/i);
  if (ogUrl?.[1]) pushNext(ogUrl[1]);

  // Embedded TikTok Shop PDP URLs in JS state/hydration JSON
  const embeddedPdpRegex =
    /https?:\\?\/\\?\/(?:shop|www|m)\.tiktok\.com\\?\/(?:th\\?\/)?(?:pdp|view\\?\/product|shop\\?\/pdp)\\?\/[^"'\s<>\\]+/gi;
  let embeddedMatch: RegExpExecArray | null;
  while ((embeddedMatch = embeddedPdpRegex.exec(html)) !== null) {
    pushNext(embeddedMatch[0]);
    if (nextUrls.length >= 6) break;
  }

  // Embedded deep links in HTML/JS
  const deepLinkMatch = html.match(/(?:snssdk1180|snssdk1233|intent):\/\/ec\/pdp[^"'\s<>\\]+/i);
  if (deepLinkMatch?.[0]) pushNext(deepLinkMatch[0]);

  // Embedded explicit JSON product_id inside shop hydration state
  const jsonProductId = html.match(/"product_id"\s*:\s*"(\d{8,24})"/i);
  if (jsonProductId?.[1] && /shop\.tiktok\.com|ec\/pdp|tiktokshop/i.test(html)) {
    pushNext(`https://shop.tiktok.com/th/pdp/product/${jsonProductId[1]}`);
  }

  // Preview title / image (zero fabrication — only from actual HTML tags)
  const ogTitle =
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
  const previewTitle = ogTitle?.[1]
    ? decodeHtmlUrlEntities(ogTitle[1]).replace(/\s*\|\s*TikTok.*$/i, '').trim() || null
    : null;

  let previewImageUrl: string | null = null;
  const ogImage =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (ogImage?.[1]) {
    previewImageUrl = normalizeExternalImageUrl(decodeHtmlUrlEntities(ogImage[1]));
  }

  const lower = html.toLowerCase();
  const explicitNotFound =
    !previewTitle &&
    nextUrls.length === 0 &&
    deepLinks.length === 0 &&
    (lower.includes('product not found') ||
      lower.includes('page not found') ||
      lower.includes('product does not exist') ||
      lower.includes('no longer available'));

  return { nextUrls, deepLinks, previewTitle, previewImageUrl, explicitNotFound };
}

function setBoundedLinkCache(key: string, entry: ResolvedShortLinkEntry): void {
  if (resolvedLinkChainCache.size >= LINK_CACHE_MAX && !resolvedLinkChainCache.has(key)) {
    const oldest = resolvedLinkChainCache.keys().next().value;
    if (oldest) resolvedLinkChainCache.delete(oldest);
  }
  resolvedLinkChainCache.set(key, entry);
}

async function resolveShortOrRedirectLink(
  startUrl: string,
  overrides?: LinkImportTestOverrides
): Promise<ResolvedShortLinkEntry> {
  if (!overrides?.skipShortLinkCache) {
    const cached = resolvedLinkChainCache.get(startUrl);
    if (cached && cached.expiresAt > Date.now()) {
      return cached;
    }
  }

  const hops: string[] = [startUrl];
  const visited = new Set<string>();
  let currentUrl = startUrl;
  let previewTitle: string | null = null;
  let previewImageUrl: string | null = null;
  const fetcher = overrides?.fetchLink ?? ((url: string, init?: RequestInit) => fetch(url, init));

  for (let hop = 0; hop < MAX_REDIRECT_HOPS; hop++) {
    if (visited.has(currentUrl)) {
      break;
    }
    visited.add(currentUrl);

    if (!isSafeExternalUrl(currentUrl)) {
      const entry: ResolvedShortLinkEntry = {
        finalUrl: currentUrl,
        hops,
        productId: null,
        previewTitle,
        previewImageUrl,
        classification: 'invalid-link',
        errorCode: 'SSRF_BLOCKED',
        messageEn: 'Redirect target pointed to a blocked private or unsafe network address.',
        messageMy: 'Redirect Link သည် လုံခြုံရေးအရ ပိတ်ပင်ထားသော Network လိပ်စာသို့ ညွှန်ပြနေပါသည်။',
        expiresAt: Date.now() + 60_000,
      };
      return entry;
    }

    let response;
    try {
      response = await fetcher(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(LINK_FETCH_TIMEOUT_MS),
        headers: {
          'User-Agent': DESKTOP_CHROME_UA,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7',
        },
      });
    } catch {
      const entry: ResolvedShortLinkEntry = {
        finalUrl: currentUrl,
        hops,
        productId: null,
        previewTitle,
        previewImageUrl,
        classification: 'invalid-link',
        errorCode: 'SHORT_LINK_RESOLUTION_FAILED',
        messageEn:
          'Unable to resolve the short or redirect link (network timeout or blocked upstream). Please paste the full TikTok Shop product URL directly.',
        messageMy:
          'Short Link / Redirect Link ကို ဖွင့်၍ စစ်ဆေးမရပါ (Timeout သို့မဟုတ် ချိတ်ဆက်မှုမအောင်မြင်ပါ)။ TikTok Shop Product Link အပြည့်အစုံကို တိုက်ရိုက်ထည့်သွင်းစမ်းသပ်ပါ။',
        expiresAt: Date.now() + 60_000,
      };
      return entry;
    }

    if (response.status === 404 || response.status === 410) {
      await response.body?.cancel?.().catch(() => {});
      const entry: ResolvedShortLinkEntry = {
        finalUrl: currentUrl,
        hops,
        productId: null,
        previewTitle,
        previewImageUrl,
        classification: 'product-not-found',
        errorCode: 'PRODUCT_NOT_FOUND',
        messageEn: `Short link returned HTTP ${response.status} — product page no longer exists or expired.`,
        messageMy: `Short Link သည် HTTP ${response.status} ပြန်ပေးပါသည် — Product စာမျက်နှာ မရှိတော့ပါ သို့မဟုတ် သက်တမ်းကုန်ဆုံးသွားပါပြီ။`,
        expiresAt: Date.now() + 120_000,
      };
      setBoundedLinkCache(startUrl, entry);
      return entry;
    }

    const locationHeader = response.headers.get('location');
    if (
      response.status >= 300 &&
      response.status < 400 &&
      locationHeader &&
      locationHeader.trim().length > 0
    ) {
      await response.body?.cancel?.().catch(() => {});
      let nextAbsUrl: string;
      try {
        nextAbsUrl = new URL(locationHeader.trim(), currentUrl).toString();
      } catch {
        return {
          finalUrl: currentUrl,
          hops,
          productId: null,
          previewTitle,
          previewImageUrl,
          classification: 'invalid-link',
          errorCode: 'INVALID_URL',
          messageEn: 'Short link redirected to a malformed URL.',
          messageMy: 'Short Link မှ ပြန်ညွှန်းသော URL ပုံစံ မမှန်ကန်ပါ။',
          expiresAt: Date.now() + 60_000,
        };
      }

      if (!hops.includes(nextAbsUrl)) {
        hops.push(nextAbsUrl);
      }

      if (!isSafeExternalUrl(nextAbsUrl)) {
        return {
          finalUrl: nextAbsUrl,
          hops,
          productId: null,
          previewTitle,
          previewImageUrl,
          classification: 'invalid-link',
          errorCode: 'SSRF_BLOCKED',
          messageEn: 'Redirect target pointed to a blocked private or unsafe network address.',
          messageMy: 'Redirect Link သည် လုံခြုံရေးအရ ပိတ်ပင်ထားသော Network လိပ်စာသို့ ညွှန်ပြနေပါသည်။',
          expiresAt: Date.now() + 60_000,
        };
      }

      const inspected = inspectSingleParsedUrl(nextAbsUrl, 1);
      if (inspected.classification === 'valid-product' && inspected.productId) {
        const entry: ResolvedShortLinkEntry = {
          finalUrl: nextAbsUrl,
          hops,
          productId: inspected.productId,
          previewTitle,
          previewImageUrl,
          classification: 'valid-product',
          messageEn: inspected.messageEn,
          messageMy: inspected.messageMy,
          expiresAt: Date.now() + LINK_CACHE_TTL_MS,
        };
        setBoundedLinkCache(startUrl, entry);
        return entry;
      }

      if (!inspected.needsNetworkResolve) {
        const entry: ResolvedShortLinkEntry = {
          finalUrl: nextAbsUrl,
          hops,
          productId: null,
          previewTitle,
          previewImageUrl,
          classification: inspected.classification,
          errorCode: inspected.errorCode,
          messageEn: inspected.messageEn,
          messageMy: inspected.messageMy,
          expiresAt: Date.now() + LINK_CACHE_TTL_MS,
        };
        setBoundedLinkCache(startUrl, entry);
        return entry;
      }

      currentUrl = nextAbsUrl;
      continue;
    }

    // Read HTTP 2xx HTML body once to look for canonical, meta refresh, og:url, or embedded PDP URL
    let html = '';
    try {
      html = response.text ? await response.text() : '';
    } catch {
      html = '';
    }

    const meta = extractHtmlRedirectAndMeta(html, currentUrl);
    if (meta.previewTitle) previewTitle = meta.previewTitle;
    if (meta.previewImageUrl) previewImageUrl = meta.previewImageUrl;

    for (const deep of meta.deepLinks) {
      const deepInspected = inspectSingleParsedUrl(deep, 1);
      if (deepInspected.classification === 'valid-product' && deepInspected.productId) {
        const canonicalTarget = buildFallbackTikTokShopUrl(deepInspected.productId);
        if (!hops.includes(canonicalTarget)) hops.push(canonicalTarget);
        const entry: ResolvedShortLinkEntry = {
          finalUrl: canonicalTarget,
          hops,
          productId: deepInspected.productId,
          previewTitle,
          previewImageUrl,
          classification: 'valid-product',
          messageEn: deepInspected.messageEn,
          messageMy: deepInspected.messageMy,
          expiresAt: Date.now() + LINK_CACHE_TTL_MS,
        };
        setBoundedLinkCache(startUrl, entry);
        return entry;
      }
    }

    let nextHopCandidate: string | null = null;
    for (const candidate of meta.nextUrls) {
      if (candidate === currentUrl) continue;
      const inspected = inspectSingleParsedUrl(candidate, 1);
      if (inspected.classification === 'valid-product' && inspected.productId) {
        if (!hops.includes(candidate)) hops.push(candidate);
        const entry: ResolvedShortLinkEntry = {
          finalUrl: candidate,
          hops,
          productId: inspected.productId,
          previewTitle,
          previewImageUrl,
          classification: 'valid-product',
          messageEn: inspected.messageEn,
          messageMy: inspected.messageMy,
          expiresAt: Date.now() + LINK_CACHE_TTL_MS,
        };
        setBoundedLinkCache(startUrl, entry);
        return entry;
      }
      if (inspected.errorCode === 'NON_THAILAND_SHOP_LINK' || inspected.errorCode === 'UNSUPPORTED_TIKTOK_SURFACE') {
        if (!hops.includes(candidate)) hops.push(candidate);
        const entry: ResolvedShortLinkEntry = {
          finalUrl: candidate,
          hops,
          productId: null,
          previewTitle,
          previewImageUrl,
          classification: inspected.classification,
          errorCode: inspected.errorCode,
          messageEn: inspected.messageEn,
          messageMy: inspected.messageMy,
          expiresAt: Date.now() + LINK_CACHE_TTL_MS,
        };
        setBoundedLinkCache(startUrl, entry);
        return entry;
      }
      if (inspected.needsNetworkResolve && !visited.has(candidate)) {
        nextHopCandidate = candidate;
      }
    }

    if (nextHopCandidate) {
      if (!hops.includes(nextHopCandidate)) hops.push(nextHopCandidate);
      currentUrl = nextHopCandidate;
      continue;
    }

    if (meta.explicitNotFound) {
      const entry: ResolvedShortLinkEntry = {
        finalUrl: currentUrl,
        hops,
        productId: null,
        previewTitle,
        previewImageUrl,
        classification: 'product-not-found',
        errorCode: 'PRODUCT_NOT_FOUND',
        messageEn: 'This TikTok Shop product page appears unavailable or removed.',
        messageMy: 'ဤ TikTok Shop Product စာမျက်နှာကို ရှာမတွေ့ပါ သို့မဟုတ် ဖယ်ရှားခံထားရနိုင်ပါသည်။',
        expiresAt: Date.now() + 120_000,
      };
      setBoundedLinkCache(startUrl, entry);
      return entry;
    }

    break;
  }

  return {
    finalUrl: currentUrl,
    hops,
    productId: null,
    previewTitle,
    previewImageUrl,
    classification: 'unsupported-link',
    errorCode: 'SHORT_LINK_RESOLUTION_FAILED',
    messageEn:
      'Unable to identify a Thailand TikTok Shop product ID from this short/redirect link. It may point to a video, homepage, or require an in-app browser redirect. Please copy the full product page link.',
    messageMy:
      'ဤ Short/Redirect Link မှ Thailand TikTok Shop Product ID ကို မတွေ့ရှိပါ (Video/Homepage ဖြစ်နေနိုင်သည် သို့မဟုတ် App မှ တိုက်ရိုက်ပြန်ဖွင့်ရန် လိုအပ်နိုင်ပါသည်)။ Product စာမျက်နှာ၏ Link အပြည့်အစုံကို Copy ယူပေးပါ။',
    expiresAt: Date.now() + 60_000,
  };
}

function collectWorkspaceMatches(
  canonicalProductId: string | null,
  workspaceIds?: LinkImportWorkspaceIds
): Array<'results' | 'saved' | 'history'> {
  if (!canonicalProductId || !workspaceIds) return [];
  const matches: Array<'results' | 'saved' | 'history'> = [];
  const normalizeId = (raw: string): string => {
    const clean = raw.trim();
    const numeric = extractNumericTikTokProductId(clean);
    return numeric ? `kalodata-th-${numeric}` : clean;
  };

  if (workspaceIds.results?.some((id) => normalizeId(id) === canonicalProductId)) {
    matches.push('results');
  }
  if (workspaceIds.saved?.some((id) => normalizeId(id) === canonicalProductId)) {
    matches.push('saved');
  }
  if (workspaceIds.history?.some((id) => normalizeId(id) === canonicalProductId)) {
    matches.push('history');
  }
  return matches;
}

async function computeBudgetSummary(params: {
  spendingLimitCredits: number;
  authenticatedUserId?: string | null;
  includeLiveBalance?: boolean;
  overrides?: LinkImportTestOverrides;
}): Promise<LinkImportBudgetSummary | null> {
  const ledger = params.overrides?.budgetLedger ?? getDefaultBudgetLedger();
  const scopeKey =
    params.overrides?.budgetScopeKey && params.overrides.budgetScopeKey.trim().length > 0
      ? params.overrides.budgetScopeKey.trim()
      : resolveAuthoritativeBudgetScope({
          authenticatedUserId: params.authenticatedUserId,
        }).scopeKey;

  let configuredLimitCredits = params.spendingLimitCredits;
  let totalCommittedCredits = 0;
  let remainingLimitCredits = params.spendingLimitCredits;
  let storageAvailable = true;

  try {
    const snap = await ledger.getScopeSnapshot(scopeKey, params.spendingLimitCredits);
    configuredLimitCredits = snap.effectiveLimitCredits;
    totalCommittedCredits = snap.totalCommittedCredits;
    remainingLimitCredits = snap.remainingCredits;
  } catch (err) {
    if (err instanceof BudgetStorageUnavailableError) {
      storageAvailable = false;
      remainingLimitCredits = 0;
    } else {
      throw err;
    }
  }

  let liveBalanceCredits: number | null = null;
  if (params.includeLiveBalance) {
    try {
      const bal = params.overrides?.fetchBalance
        ? await params.overrides.fetchBalance()
        : await fetchKalodataCreditBalance();
      if (bal.ok && bal.balance !== null) {
        liveBalanceCredits = bal.balance;
      }
    } catch {
      liveBalanceCredits = null;
    }
  }

  return {
    configuredLimitCredits,
    totalCommittedCredits,
    remainingLimitCredits,
    storageAvailable,
    liveBalanceCredits,
  };
}

export interface InspectLinkParams {
  rawInput: string;
  existingWorkspaceIds?: LinkImportWorkspaceIds;
  clientCachedProductDetail?: KalodataProductDetailEnrichmentRecord | null;
  spendingLimitCredits?: number;
  authenticatedUserId?: string | null;
}

/**
 * Zero-Kalodata-Credit URL inspection, redirect resolution, classification,
 * cache hit detection, and workspace duplicate check.
 */
export async function inspectTikTokProductLink(
  params: InspectLinkParams,
  overrides?: LinkImportTestOverrides
): Promise<LinkImportInspectResponse> {
  const rawInput = typeof params.rawInput === 'string' ? params.rawInput.trim() : '';
  const quotaStatus = getResearchQuotaStatus();
  const spendingLimitCredits =
    typeof params.spendingLimitCredits === 'number' &&
    Number.isFinite(params.spendingLimitCredits) &&
    params.spendingLimitCredits > 0
      ? Math.round(params.spendingLimitCredits * 1000) / 1000
      : DEFAULT_SPENDING_LIMIT_CREDITS;

  if (!rawInput) {
    return {
      ok: false,
      classification: 'invalid-link',
      errorCode: 'EMPTY_INPUT',
      messageEn: 'Please paste a TikTok Shop product link or short link.',
      messageMy: 'TikTok Shop Product Link သို့မဟုတ် Short Link ကို ထည့်သွင်းပေးပါ။',
      extractedInputUrl: null,
      resolvedUrl: null,
      redirectHops: [],
      linkType: null,
      productId: null,
      canonicalProductId: null,
      canonicalUrl: null,
      slugResolved: false,
      previewTitle: null,
      previewImageUrl: null,
      alreadyInWorkspace: false,
      alreadyInWorkspaceSources: [],
      cachedInServer: false,
      cachedInClient: false,
      requiresPaidApiCall: false,
      estimatedCredits: 0,
      requiresConfirmation: false,
      budgetSummary: null,
      quotaPaused: quotaStatus.paused,
    };
  }

  const normalized = normalizePastedUrlCandidate(rawInput);
  if (normalized.isLikelyUnsafeAddress) {
    return {
      ok: false,
      classification: 'invalid-link',
      errorCode: 'SSRF_BLOCKED',
      messageEn: 'Unsupported or unsafe URL scheme blocked.',
      messageMy: 'လုံခြုံရေးအရ ခွင့်မပြုသော URL ပုံစံဖြစ်နေပါသည်။',
      extractedInputUrl: normalized.extractedInputUrl,
      resolvedUrl: null,
      redirectHops: [],
      linkType: normalized.linkTypeHint,
      productId: null,
      canonicalProductId: null,
      canonicalUrl: null,
      slugResolved: false,
      previewTitle: null,
      previewImageUrl: null,
      alreadyInWorkspace: false,
      alreadyInWorkspaceSources: [],
      cachedInServer: false,
      cachedInClient: false,
      requiresPaidApiCall: false,
      estimatedCredits: 0,
      requiresConfirmation: false,
      budgetSummary: null,
      quotaPaused: quotaStatus.paused,
    };
  }

  if (!normalized.extractedInputUrl) {
    return {
      ok: false,
      classification: 'invalid-link',
      errorCode: 'INVALID_URL',
      messageEn:
        'No valid URL found in your input. Please paste a full link (e.g. https://shop.tiktok.com/th/pdp/... or https://vt.tiktok.com/...).',
      messageMy:
        'ထည့်သွင်းထားသော စာသားထဲတွင် မှန်ကန်သော Link မတွေ့ပါ (ဥပမာ https://shop.tiktok.com/th/pdp/... သို့မဟုတ် https://vt.tiktok.com/...)။',
      extractedInputUrl: null,
      resolvedUrl: null,
      redirectHops: [],
      linkType: null,
      productId: null,
      canonicalProductId: null,
      canonicalUrl: null,
      slugResolved: false,
      previewTitle: null,
      previewImageUrl: null,
      alreadyInWorkspace: false,
      alreadyInWorkspaceSources: [],
      cachedInServer: false,
      cachedInClient: false,
      requiresPaidApiCall: false,
      estimatedCredits: 0,
      requiresConfirmation: false,
      budgetSummary: null,
      quotaPaused: quotaStatus.paused,
    };
  }

  const initialInspection = inspectSingleParsedUrl(normalized.extractedInputUrl, 0);
  let linkType: LinkImportLinkType | null =
    normalized.linkTypeHint ?? initialInspection.linkType;
  let productId: string | null = initialInspection.productId;
  let resolvedUrl: string | null = initialInspection.unwrappedUrl ?? normalized.extractedInputUrl;
  let redirectHops: string[] = [normalized.extractedInputUrl];
  let previewTitle: string | null = null;
  let previewImageUrl: string | null = null;
  let finalClassification = initialInspection.classification;
  let finalErrorCode = initialInspection.errorCode;
  let messageEn = initialInspection.messageEn;
  let messageMy = initialInspection.messageMy;

  if (initialInspection.needsNetworkResolve) {
    const resolvedChain = await resolveShortOrRedirectLink(
      normalized.extractedInputUrl,
      overrides
    );
    resolvedUrl = resolvedChain.finalUrl;
    redirectHops = resolvedChain.hops;
    productId = resolvedChain.productId;
    previewTitle = resolvedChain.previewTitle;
    previewImageUrl = resolvedChain.previewImageUrl;
    finalClassification = resolvedChain.classification;
    finalErrorCode = resolvedChain.errorCode;
    if (resolvedChain.messageEn) messageEn = resolvedChain.messageEn;
    if (resolvedChain.messageMy) messageMy = resolvedChain.messageMy;
  }

  if (finalClassification !== 'valid-product' || !productId) {
    return {
      ok: false,
      classification: finalClassification,
      errorCode: finalErrorCode ?? 'INVALID_URL',
      messageEn,
      messageMy,
      extractedInputUrl: normalized.extractedInputUrl,
      resolvedUrl,
      redirectHops,
      linkType,
      productId: null,
      canonicalProductId: null,
      canonicalUrl: null,
      slugResolved: false,
      previewTitle,
      previewImageUrl,
      alreadyInWorkspace: false,
      alreadyInWorkspaceSources: [],
      cachedInServer: false,
      cachedInClient: false,
      requiresPaidApiCall: false,
      estimatedCredits: 0,
      requiresConfirmation: false,
      budgetSummary: null,
      quotaPaused: quotaStatus.paused,
    };
  }

  // Identified valid TH Product ID — resolve canonical TH PDP URL (0 Kalodata credits)
  const canonicalRes = overrides?.resolveCanonicalUrl
    ? await overrides.resolveCanonicalUrl(productId)
    : await resolveCanonicalTikTokProductUrl(productId).catch(() => ({
        productId,
        canonicalUrl: buildFallbackTikTokShopUrl(productId),
        fallbackUrl: buildFallbackTikTokShopUrl(productId),
        slugResolved: false,
        appSchemeUrl: '',
        trillIntentUrl: '',
        musicallyIntentUrl: '',
        appLinkIntentUrl: '',
      }));

  const canonicalProductId = `kalodata-th-${productId}`;
  const workspaceMatches = collectWorkspaceMatches(
    canonicalProductId,
    params.existingWorkspaceIds
  );
  const alreadyInWorkspace = workspaceMatches.length > 0;

  const serverCachedPd = getServerCachedProductDetail(productId);
  const clientCachedPd =
    params.clientCachedProductDetail &&
    params.clientCachedProductDetail.productId.trim() === productId
      ? params.clientCachedProductDetail
      : null;

  const cachedInServer = Boolean(serverCachedPd);
  const cachedInClient = Boolean(clientCachedPd);
  const effectiveCachedPd = serverCachedPd ?? clientCachedPd;
  const inFlight = Boolean(getInFlightProductDetailPromise(productId));

  const requiresPaidApiCall = !effectiveCachedPd && !inFlight;
  const estimatedCredits = requiresPaidApiCall ? KALODATA_PRODUCT_DETAIL_CREDIT : 0;

  const budgetSummary = await computeBudgetSummary({
    spendingLimitCredits,
    authenticatedUserId: params.authenticatedUserId,
    includeLiveBalance: requiresPaidApiCall,
    overrides,
  });

  if (effectiveCachedPd?.productName && !previewTitle) {
    previewTitle = effectiveCachedPd.productName;
  }

  return {
    ok: true,
    classification: 'valid-product',
    messageEn: effectiveCachedPd
      ? `TikTok Shop Thailand Product #${productId} identified — cached data ready (0 credits).`
      : `TikTok Shop Thailand Product #${productId} identified — ready to import via Kalodata Product Detail (${formatCredits(KALODATA_PRODUCT_DETAIL_CREDIT)} credits).`,
    messageMy: effectiveCachedPd
      ? `Thailand TikTok Shop Product #${productId} ကို တွေ့ရှိပြီး Cache ထဲတွင် ဒေတာအသင့်ရှိနေပါသည် (0 Credits)။`
      : `Thailand TikTok Shop Product #${productId} ကို တွေ့ရှိပါသည် — Kalodata Product Detail ဖြင့် ထည့်သွင်းရန် အသင့်ဖြစ်ပါပြီ (${formatCredits(KALODATA_PRODUCT_DETAIL_CREDIT)} Credits)။`,
    extractedInputUrl: normalized.extractedInputUrl,
    resolvedUrl,
    redirectHops,
    linkType,
    productId,
    canonicalProductId,
    canonicalUrl: canonicalRes.canonicalUrl,
    slugResolved: canonicalRes.slugResolved,
    previewTitle,
    previewImageUrl,
    alreadyInWorkspace,
    alreadyInWorkspaceSources: workspaceMatches,
    cachedInServer,
    cachedInClient,
    requiresPaidApiCall,
    estimatedCredits,
    requiresConfirmation: requiresPaidApiCall,
    budgetSummary,
    quotaPaused: quotaStatus.paused,
  };
}

export interface ImportLinkParams {
  rawInput: string;
  existingWorkspaceIds?: LinkImportWorkspaceIds;
  clientCachedProductDetail?: KalodataProductDetailEnrichmentRecord | null;
  clientCachedShopDetail?: KalodataShopEnrichmentRecord | null;
  clientCachedReviewInsight?: KalodataReviewInsightData | null;
  resolvedCategoryIdMap?: Partial<Record<ProductCategory, string>>;
  spendingLimitCredits?: number;
  salesWeightPct?: number;
  userConfirmedPaidExecution?: boolean;
  forceRefresh?: boolean;
  idempotencyKey?: string;
  authenticatedUserId?: string | null;
}

function resolveCategoryForImportedProduct(
  parsed: ParsedProductDetail,
  resolvedCategoryIdMap?: Partial<Record<ProductCategory, string>>
): {
  category: ProductCategory;
  unmappedCategoryNote: { en: string; my: string } | null;
} {
  const priId = parsed.priCategory?.category_id;
  const priName = parsed.priCategory?.category_name ?? '';
  const secName = parsed.secCategory?.category_name ?? '';
  const terName = parsed.terCategory?.category_name ?? '';

  if (priId || priName) {
    const resolved = resolveProductCategoryFromKalodataId(
      priId ?? undefined,
      priName || undefined,
      resolvedCategoryIdMap
    );
    // Notice resolveProductCategoryFromKalodataId falls back to 'womens-fashion' when unknown,
    // so verify whether it actually matched!
    const directSlugMatch = matchKalodataCategoryNameToSlug(priName);
    const idMatched =
      Boolean(priId) &&
      Object.values(CATEGORY_BY_ID).some(
        (def) =>
          def.defaultKalodataId === priId ||
          resolvedCategoryIdMap?.[def.id] === priId
      );
    if (resolved && (directSlugMatch || idMatched)) {
      return { category: resolved, unmappedCategoryNote: null };
    }
  }

  for (const fallbackName of [secName, terName]) {
    const slug = matchKalodataCategoryNameToSlug(fallbackName);
    if (slug) {
      return { category: slug, unmappedCategoryNote: null };
    }
  }

  const label = priName || secName || 'Unmapped Kalodata category';
  return {
    // Structural neutral weight profile (weightDeltas all 0 = [20,20,15,15,10,10,10])
    category: 'womens-fashion',
    unmappedCategoryNote: {
      en: `Kalodata category "${label}" is outside SiamPick's preset category map; scored using neutral baseline weights without inventing category data.`,
      my: `Kalodata Category "${label}" သည် SiamPick ၏ သတ်မှတ် Category စာရင်းပြင်ပဖြစ်သဖြင့် ကြားနေ (Neutral) Scoring Weights ဖြင့် တွက်ချက်ထားပြီး Category ဒေတာ အတုအယောင် မထည့်ထားပါ။`,
    },
  };
}

function isKalodataProductDetailEmpty(parsed: ParsedProductDetail): boolean {
  const hasName = Boolean(parsed.productName && parsed.productName.trim().length > 0);
  const hasPrice =
    parsed.unitPriceThb !== null ||
    parsed.minPriceThb !== null ||
    parsed.maxPriceThb !== null;
  const hasSalesOrRev = parsed.revenueThb !== null || parsed.salesVolume !== null;
  const hasCommission = parsed.commissionRatePct !== null;
  const hasShop = Boolean(parsed.productShopId || parsed.sellerName);
  return !hasName && !hasPrice && !hasSalesOrRev && !hasCommission && !hasShop;
}

function buildImportCostSummary(params: {
  totalEstimatedCredits: number;
  apiCallsCount: number;
  creditBalanceBefore: number | null;
  creditBalanceAfter: number | null;
  spendingLimitCredits: number;
  categoryIds: string[];
}): ResearchCostSummary {
  const creditsUsed = roundCredits3(params.totalEstimatedCredits);
  const estimatedUsd = Math.round(creditsUsed * KALODATA_USD_PER_CREDIT * 10000) / 10000;
  const actualCredits =
    params.creditBalanceBefore !== null && params.creditBalanceAfter !== null
      ? Math.max(0, roundCredits3(params.creditBalanceBefore - params.creditBalanceAfter))
      : creditsUsed;
  const actualUsd = Math.round(actualCredits * KALODATA_USD_PER_CREDIT * 10000) / 10000;
  return {
    researchMode: 'fast',
    estimatedCredits: creditsUsed,
    estimatedUsd,
    plannedApiCalls: params.apiCallsCount,
    actualApiCalls: params.apiCallsCount,
    rankApiCalls: 0,
    productDetailApiCalls: params.apiCallsCount,
    shopDetailApiCalls: 0,
    commentInsightApiCalls: 0,
    deepDiveCount: 0,
    includeReviewInsights: false,
    geminiAnalysisApplied: false,
    actualCredits,
    actualUsd,
    balanceBefore: params.creditBalanceBefore,
    balanceAfter: params.creditBalanceAfter,
    spendingLimitCredits: params.spendingLimitCredits,
    bothCategoryMode: 'combined',
    categoryIds: params.categoryIds,
  };
}

async function finalizeImportedProduct(params: {
  productId: string;
  parsedDetail: ParsedProductDetail;
  productDetailRecord: KalodataProductDetailEnrichmentRecord;
  cachedShopDetail: KalodataShopEnrichmentRecord | null;
  cachedReviewInsight: KalodataReviewInsightData | null;
  canonicalUrl: string;
  slugResolved: boolean;
  resolvedUrl: string;
  redirectHops: string[];
  alreadyExistedInWorkspace: boolean;
  previewImageUrl: string | null;
  resolvedCategoryIdMap?: Partial<Record<ProductCategory, string>>;
  salesWeightPct: number;
  spendingLimitCredits: number;
  dataSource: 'server-cache' | 'client-cache' | 'kalodata-api' | 'in-flight-shared';
  apiCallsMade: number;
  estimatedCreditsCharged: number;
  creditsBalanceBefore: number | null;
  creditsBalanceAfter: number | null;
  budgetSnapshot?: {
    scopeKey: string;
    configuredLimitCredits: number;
    totalCommittedCredits: number;
    remainingCredits: number;
  };
  overrides?: LinkImportTestOverrides;
}): Promise<LinkImportExecuteResponse> {
  const { parsedDetail, productId } = params;
  const categoryRes = resolveCategoryForImportedProduct(
    parsedDetail,
    params.resolvedCategoryIdMap
  );

  // Image verification: try Kalodata master_image_url -> previewImageUrl -> live PDP image recovery (0 cr)
  let imageCheck = params.overrides?.verifyImage
    ? await params.overrides.verifyImage(parsedDetail.masterImageUrl)
    : await verifyKalodataImageUrl(parsedDetail.masterImageUrl);

  if (!imageCheck.imageVerified && params.previewImageUrl) {
    const previewCheck = params.overrides?.verifyImage
      ? await params.overrides.verifyImage(params.previewImageUrl)
      : await verifyKalodataImageUrl(params.previewImageUrl);
    if (previewCheck.imageVerified) {
      imageCheck = previewCheck;
    }
  }

  if (!imageCheck.imageVerified) {
    const recoveredUrl = params.overrides?.resolveLiveImage
      ? await params.overrides.resolveLiveImage(productId)
      : await resolveLiveTikTokProductImageUrl(productId);
    if (recoveredUrl) {
      imageCheck = {
        imageVerified: true,
        imageUrl: `/api/image-proxy?url=${encodeURIComponent(recoveredUrl)}`,
        imageOriginUrl: recoveredUrl,
        imageSourceNoteEn: 'Live product photo verified from official Thailand TikTok Shop page.',
        imageSourceNoteMy: 'တရားဝင် Thailand TikTok Shop စာမျက်နှာမှ Product ဓာတ်ပုံကို အတည်ပြုရယူထားပါသည်။',
      };
    }
  }

  const shopDetailParsed: ParsedShopDetail | null = params.cachedShopDetail
    ? {
        shopId: params.cachedShopDetail.shopId,
        shopName: params.cachedShopDetail.shopName,
        sellerType: params.cachedShopDetail.sellerType,
        revenueThb: params.cachedShopDetail.revenueThb,
        affiliateRevenueThb: params.cachedShopDetail.affiliateRevenueThb,
        selfAccountRevenueThb: params.cachedShopDetail.selfAccountRevenueThb,
        shoppingMallRevenueThb: params.cachedShopDetail.shoppingMallRevenueThb,
        salesVolume: params.cachedShopDetail.salesVolume,
        unitPriceThb: params.cachedShopDetail.unitPriceThb,
        creatorNumber: params.cachedShopDetail.creatorNumber,
        productNumber: params.cachedShopDetail.productNumber,
        videoNumber: params.cachedShopDetail.videoNumber,
        liveNumber: params.cachedShopDetail.liveNumber,
      }
    : null;

  const commentInsightParsed: ParsedCommentInsight | null = params.cachedReviewInsight
    ? {
        productId,
        summary: params.cachedReviewInsight.summary,
        positivePoints: params.cachedReviewInsight.positivePoints,
        painPoints: params.cachedReviewInsight.painPoints,
        usageScenarios: params.cachedReviewInsight.usageScenarios,
        commentsAnalyzed: params.cachedReviewInsight.commentsAnalyzed,
        averageRating: params.cachedReviewInsight.averageRating,
        ratedCommentCount: params.cachedReviewInsight.ratedCommentCount,
        rawComments: params.cachedReviewInsight.rawComments,
        pagesFetched: params.cachedReviewInsight.pagesFetched,
      }
    : null;

  const researchedAt = new Date().toISOString();
  const itemStub: Record<string, unknown> = {
    product_id: productId,
    product_name: parsedDetail.productName ?? null,
    unit_price: parsedDetail.unitPriceThb,
    commission_rate: parsedDetail.commissionRatePct,
    revenue: parsedDetail.revenueThb,
    sales_volumn: parsedDetail.salesVolume,
    revenue_growth_rate: parsedDetail.revenueGrowthRate ?? null,
    live_revenue: parsedDetail.liveRevenueThb,
    video_revenue: parsedDetail.videoRevenueThb,
    showcase_revenue: parsedDetail.showcaseRevenueThb ?? null,
    seller_id: parsedDetail.productShopId,
    seller_name: parsedDetail.sellerName ?? shopDetailParsed?.shopName ?? null,
    sku_count: parsedDetail.skuCount ?? null,
    launch_date: parsedDetail.launchDate,
    pri_category: parsedDetail.priCategory ?? null,
    sec_category: parsedDetail.secCategory ?? null,
    ter_category: parsedDetail.terCategory ?? null,
  };

  const product = buildKalodataProductSummary(
    itemStub,
    categoryRes.category,
    parsedDetail.priCategory?.category_id ? [parsedDetail.priCategory.category_id] : [],
    'last30Day',
    researchedAt,
    imageCheck,
    {
      researchMode: 'fast',
      productDetail: parsedDetail,
      shopDetail: shopDetailParsed,
      commentInsight: commentInsightParsed,
      sourceMode: 'link-import',
      customTikTokShopUrl: params.canonicalUrl,
      unmappedCategoryNote: categoryRes.unmappedCategoryNote,
    }
  );

  const evaluation = evaluateProductOpportunity(product, {
    salesWeightPct: params.salesWeightPct,
  });
  const rescoredProduct: ResearchProduct = {
    ...product,
    opportunityScore: evaluation.totalScore,
    confidenceLevel: evaluation.confidenceLevel,
  };

  return {
    ok: true,
    product: rescoredProduct,
    evaluation,
    productDetailRecord: params.productDetailRecord,
    shopDetailRecord: params.cachedShopDetail,
    reviewInsightRecord: params.cachedReviewInsight,
    canonicalUrl: params.canonicalUrl,
    slugResolved: params.slugResolved,
    resolvedUrl: params.resolvedUrl,
    redirectHops: params.redirectHops,
    alreadyExistedInWorkspace: params.alreadyExistedInWorkspace,
    dataSource: params.dataSource,
    apiCallsMade: params.apiCallsMade,
    estimatedCreditsCharged: params.estimatedCreditsCharged,
    creditsBalanceBefore: params.creditsBalanceBefore,
    creditsBalanceAfter: params.creditsBalanceAfter,
    ...(categoryRes.unmappedCategoryNote
      ? {
          unmappedCategoryNoteEn: categoryRes.unmappedCategoryNote.en,
          unmappedCategoryNoteMy: categoryRes.unmappedCategoryNote.my,
        }
      : {}),
    ...(params.budgetSnapshot ? { budgetSnapshot: params.budgetSnapshot } : {}),
    costSummary: buildImportCostSummary({
      totalEstimatedCredits: params.estimatedCreditsCharged,
      apiCallsCount: params.apiCallsMade,
      creditBalanceBefore: params.creditsBalanceBefore,
      creditBalanceAfter: params.creditsBalanceAfter,
      spendingLimitCredits: params.spendingLimitCredits,
      categoryIds: parsedDetail.priCategory?.category_id ? [parsedDetail.priCategory.category_id] : [],
    }),
  };
}

/**
 * Validates TikTok Shop URL server-side, checks server/client caches BEFORE any paid call,
 * enforces Pause, Confirmation, Persistent Budget Ledger, and Live Balance guards,
 * calls Kalodata Product Detail (0.1 cr) once if uncached, and builds a verified ResearchProduct.
 */
export async function importTikTokProductFromLink(
  params: ImportLinkParams,
  overrides?: LinkImportTestOverrides
): Promise<LinkImportExecuteResponse> {
  const salesWeightPct =
    typeof params.salesWeightPct === 'number' && Number.isFinite(params.salesWeightPct)
      ? Math.max(10, Math.min(90, Math.round(params.salesWeightPct)))
      : 50;
  const spendingLimitCredits =
    typeof params.spendingLimitCredits === 'number' &&
    Number.isFinite(params.spendingLimitCredits) &&
    params.spendingLimitCredits > 0
      ? Math.round(params.spendingLimitCredits * 1000) / 1000
      : DEFAULT_SPENDING_LIMIT_CREDITS;
  const forceRefresh = params.forceRefresh === true;

  // Step 1: Always inspect & SSRF-validate link server-side (0 Kalodata credits)
  const inspection = await inspectTikTokProductLink(
    {
      rawInput: params.rawInput,
      existingWorkspaceIds: params.existingWorkspaceIds,
      clientCachedProductDetail: params.clientCachedProductDetail,
      spendingLimitCredits,
      authenticatedUserId: params.authenticatedUserId,
    },
    overrides
  );

  if (inspection.classification !== 'valid-product' || !inspection.productId || !inspection.canonicalUrl) {
    const status =
      inspection.classification === 'product-not-found'
        ? 404
        : inspection.classification === 'unsupported-link'
          ? 422
          : 400;
    throw new LinkImportApiError(
      status,
      inspection.errorCode ?? 'INVALID_URL',
      inspection.classification,
      inspection.messageEn,
      inspection.messageMy
    );
  }

  const productId = inspection.productId;
  const resolvedUrl = inspection.resolvedUrl ?? inspection.canonicalUrl;

  // Step 2: Check server cache & client cache BEFORE any pause/confirmation/budget gate
  const serverCachedPd = !forceRefresh ? getServerCachedProductDetail(productId) : null;
  const clientCachedPd =
    !forceRefresh &&
    params.clientCachedProductDetail &&
    params.clientCachedProductDetail.productId.trim() === productId
      ? params.clientCachedProductDetail
      : null;
  const cachedPd = serverCachedPd ?? clientCachedPd;

  if (cachedPd) {
    if (!serverCachedPd) {
      setServerCachedProductDetail(cachedPd);
    }
    const candidateShopId = cachedPd.productShopId?.trim() ?? null;
    const cachedShop = candidateShopId
      ? getServerCachedShopDetail(candidateShopId) ??
        (params.clientCachedShopDetail?.shopId.trim() === candidateShopId
          ? params.clientCachedShopDetail
          : null)
      : null;
    const cachedReview =
      getServerCachedReviewInsight(productId) ??
      (params.clientCachedReviewInsight?.productId.trim() === productId
        ? params.clientCachedReviewInsight
        : null);

    return finalizeImportedProduct({
      productId,
      parsedDetail: cachedProductDetailToParsed(cachedPd),
      productDetailRecord: cachedPd,
      cachedShopDetail: cachedShop,
      cachedReviewInsight: cachedReview,
      canonicalUrl: inspection.canonicalUrl,
      slugResolved: inspection.slugResolved,
      resolvedUrl,
      redirectHops: inspection.redirectHops,
      alreadyExistedInWorkspace: inspection.alreadyInWorkspace,
      previewImageUrl: inspection.previewImageUrl,
      resolvedCategoryIdMap: params.resolvedCategoryIdMap,
      salesWeightPct,
      spendingLimitCredits,
      dataSource: serverCachedPd ? 'server-cache' : 'client-cache',
      apiCallsMade: 0,
      estimatedCreditsCharged: 0,
      creditsBalanceBefore: inspection.budgetSummary?.liveBalanceCredits ?? null,
      creditsBalanceAfter: inspection.budgetSummary?.liveBalanceCredits ?? null,
      overrides,
    });
  }

  // Step 3: Check in-flight deduplication before calling Kalodata again
  const existingInFlight = !forceRefresh ? getInFlightProductDetailPromise(productId) : null;
  if (existingInFlight) {
    const shared = await existingInFlight;
    if (!shared.record) {
      throw new LinkImportApiError(
        404,
        'PRODUCT_NOT_FOUND',
        'product-not-found',
        shared.error?.en ?? `Product #${productId} was not found on Thailand TikTok Shop.`,
        shared.error?.my ?? `Thailand TikTok Shop တွင် Product #${productId} ကို ရှာမတွေ့ပါ။`
      );
    }
    const candidateShopId = shared.record.productShopId?.trim() ?? null;
    const cachedShop = candidateShopId
      ? getServerCachedShopDetail(candidateShopId) ??
        (params.clientCachedShopDetail?.shopId.trim() === candidateShopId
          ? params.clientCachedShopDetail
          : null)
      : null;
    const cachedReview =
      getServerCachedReviewInsight(productId) ??
      (params.clientCachedReviewInsight?.productId.trim() === productId
        ? params.clientCachedReviewInsight
        : null);

    return finalizeImportedProduct({
      productId,
      parsedDetail: cachedProductDetailToParsed(shared.record),
      productDetailRecord: shared.record,
      cachedShopDetail: cachedShop,
      cachedReviewInsight: cachedReview,
      canonicalUrl: inspection.canonicalUrl,
      slugResolved: inspection.slugResolved,
      resolvedUrl,
      redirectHops: inspection.redirectHops,
      alreadyExistedInWorkspace: inspection.alreadyInWorkspace,
      previewImageUrl: inspection.previewImageUrl,
      resolvedCategoryIdMap: params.resolvedCategoryIdMap,
      salesWeightPct,
      spendingLimitCredits,
      dataSource: 'in-flight-shared',
      apiCallsMade: 0,
      estimatedCreditsCharged: 0,
      creditsBalanceBefore: inspection.budgetSummary?.liveBalanceCredits ?? null,
      creditsBalanceAfter: inspection.budgetSummary?.liveBalanceCredits ?? null,
      overrides,
    });
  }

  // Step 4: Enforce Research Pause Guard
  if (getResearchQuotaStatus().paused) {
    throw new LinkImportApiError(
      429,
      'RESEARCH_PAUSED',
      'valid-product',
      'Paid Kalodata API calls are currently paused. Resume research before importing uncached product links.',
      'Paid Kalodata API ခေါ်ဆိုမှုများကို ယာယီရပ်နားထားပါသည်။ Cache မရှိသေးသော Product Link ထည့်သွင်းရန် Research ကို Resume ပြန်လုပ်ပါ။'
    );
  }

  // Step 5: Hard Server-Side Confirmation Gate (ZERO paid API calls without confirmation!)
  if (params.userConfirmedPaidExecution !== true) {
    throw new LinkImportApiError(
      400,
      'CONFIRMATION_REQUIRED',
      'valid-product',
      `Explicit user confirmation is required before calling the paid Kalodata Product Detail API (${formatCredits(KALODATA_PRODUCT_DETAIL_CREDIT)} credits). No API call was made.`,
      `ကုန်ကျစရိတ်ရှိသော Kalodata Product Detail API (${formatCredits(KALODATA_PRODUCT_DETAIL_CREDIT)} Credits) မခေါ်ဆိုမီ အသုံးပြုသူ၏ အတည်ပြုချက် လိုအပ်ပါသည်။ API မခေါ်ဆိုထားပါ။`
    );
  }

  // Step 6: Atomic Persistent Budget Ledger Reservation BEFORE any paid Kalodata call
  const ledger = overrides?.budgetLedger ?? getDefaultBudgetLedger();
  const scopeKey =
    overrides?.budgetScopeKey && overrides.budgetScopeKey.trim().length > 0
      ? overrides.budgetScopeKey.trim()
      : resolveAuthoritativeBudgetScope({
          authenticatedUserId: params.authenticatedUserId,
        }).scopeKey;

  const idempotencyKey =
    typeof params.idempotencyKey === 'string' && params.idempotencyKey.trim().length > 0
      ? params.idempotencyKey.trim().slice(0, 128)
      : `link-import-${productId}-${crypto.randomUUID()}`;

  type DeferredSlot = {
    promise: Promise<{
      record: KalodataProductDetailEnrichmentRecord | null;
      error?: { en: string; my: string };
    }>;
    resolve: (val: {
      record: KalodataProductDetailEnrichmentRecord | null;
      error?: { en: string; my: string };
    }) => void;
    settled: boolean;
  };
  let ownedSlot: DeferredSlot | null = null;
  if (!forceRefresh) {
    let resolveFn!: DeferredSlot['resolve'];
    const promise = new Promise<{
      record: KalodataProductDetailEnrichmentRecord | null;
      error?: { en: string; my: string };
    }>((resolve) => {
      resolveFn = resolve;
    });
    ownedSlot = { promise, resolve: resolveFn, settled: false };
    setInFlightProductDetailPromise(productId, promise);
  }

  const settleOwnedSlot = (val: {
    record: KalodataProductDetailEnrichmentRecord | null;
    error?: { en: string; my: string };
  }) => {
    if (ownedSlot && !ownedSlot.settled) {
      ownedSlot.settled = true;
      deleteInFlightProductDetailPromise(productId);
      ownedSlot.resolve(val);
    }
  };

  let reservationId: string | null = null;
  let reservationFinalized = false;

  try {
    let reserveOutcome;
    try {
      reserveOutcome = await ledger.atomicReserveBudget({
        scopeKey,
        idempotencyKey,
        runId: null,
        operation: 'link-import',
        reserveCredits: KALODATA_PRODUCT_DETAIL_CREDIT,
        requestedLimitCredits: spendingLimitCredits,
      });
    } catch (err) {
      if (err instanceof BudgetStorageUnavailableError) {
        throw new LinkImportApiError(
          503,
          'BUDGET_STORAGE_UNAVAILABLE',
          'valid-product',
          err.message,
          'Persistent Budget Ledger ချိတ်ဆက်၍ မရသောကြောင့် Paid API ခေါ်ဆိုမှုကို ဘေးကင်းစေရန် ပိတ်ထားပါသည်။'
        );
      }
      throw err;
    }

    if (!reserveOutcome.ok) {
      const snapSummary = {
        scopeKey: reserveOutcome.snapshot.scopeKey,
        configuredLimitCredits: reserveOutcome.snapshot.effectiveLimitCredits,
        totalCommittedCredits: reserveOutcome.snapshot.totalCommittedCredits,
        remainingCredits: reserveOutcome.snapshot.remainingCredits,
      };
      if (reserveOutcome.reason === 'IDEMPOTENCY_IN_PROGRESS') {
        throw new LinkImportApiError(
          409,
          'IDEMPOTENCY_IN_PROGRESS',
          'valid-product',
          'An identical link import request is already in progress.',
          'တူညီသော Link Import Request တစ်ခု လက်ရှိလုပ်ဆောင်နေပါသည်။',
          snapSummary
        );
      }
      if (reserveOutcome.reason === 'IDEMPOTENCY_ALREADY_SETTLED') {
        throw new LinkImportApiError(
          409,
          'IDEMPOTENCY_CONFLICT',
          'valid-product',
          'This exact link import request was already executed and settled. Duplicate charge prevented.',
          'ဤ Link Import Request ကို လုပ်ဆောင်ပြီးစီးထားပြီးဖြစ်သဖြင့် Credit နှစ်ခါမကုန်စေရန် တားဆီးထားပါသည်။',
          snapSummary
        );
      }
      throw new LinkImportApiError(
        400,
        'SPENDING_LIMIT_EXCEEDED',
        'valid-product',
        `Importing Product #${productId} (${formatCredits(KALODATA_PRODUCT_DETAIL_CREDIT)} cr) would exceed your persisted spending limit (${formatCredits(reserveOutcome.snapshot.effectiveLimitCredits)} cr; ${formatCredits(reserveOutcome.snapshot.totalCommittedCredits)} cr already committed). Raise your spending limit to proceed.`,
        `Product #${productId} ထည့်သွင်းခြင်း (${formatCredits(KALODATA_PRODUCT_DETAIL_CREDIT)} cr) သည် သတ်မှတ်ထားသော Spending Limit (${formatCredits(reserveOutcome.snapshot.effectiveLimitCredits)} cr) ကို ကျော်လွန်နေပါသည် (${formatCredits(reserveOutcome.snapshot.totalCommittedCredits)} cr သုံးစွဲထားပြီး)။`,
        snapSummary
      );
    }

    reservationId = reserveOutcome.reservationId;

    // Step 7: Free Balance Check (0 credits) BEFORE paid call
    let balanceBefore: number | null = null;
    try {
      const bal = overrides?.fetchBalance
        ? await overrides.fetchBalance()
        : await fetchKalodataCreditBalance();
      if (bal.ok && bal.balance !== null) {
        balanceBefore = bal.balance;
        if (bal.balance < KALODATA_PRODUCT_DETAIL_CREDIT) {
          await ledger.releaseReservation({
            scopeKey,
            reservationId,
            verifiedZeroCharge: true,
            requestedLimitCredits: spendingLimitCredits,
            reason: 'INSUFFICIENT_CREDITS',
          });
          reservationFinalized = true;
          throw new LinkImportApiError(
            402,
            'INSUFFICIENT_CREDITS',
            'valid-product',
            `Insufficient Kalodata balance (${formatCredits(bal.balance)} cr available; ${formatCredits(KALODATA_PRODUCT_DETAIL_CREDIT)} cr required).`,
            `Kalodata လက်ကျန် Credit မလုံလောက်ပါ (${formatCredits(bal.balance)} cr သာကျန်ရှိပြီး ${formatCredits(KALODATA_PRODUCT_DETAIL_CREDIT)} cr လိုအပ်ပါသည်)။`
          );
        }
      }
    } catch (err) {
      if (err instanceof LinkImportApiError) throw err;
      balanceBefore = null;
    }

    // Step 8: Mark dispatched & make single paid Kalodata Product Detail call (0.1 cr)
    await ledger.markReservationDispatched(scopeKey, reservationId);
    const pdResult = overrides?.fetchProductDetail
      ? await overrides.fetchProductDetail({
          region: 'TH',
          language: 'en-US',
          currency: 'THB',
          date_range: 'last30Day',
          product_id: productId,
          need_extra: true,
        })
      : await fetchKalodataProductDetail({
          region: 'TH',
          language: 'en-US',
          currency: 'THB',
          date_range: 'last30Day',
          product_id: productId,
          need_extra: true,
        });

    let balanceAfter: number | null = null;
    try {
      const balAfterRes = overrides?.fetchBalance
        ? await overrides.fetchBalance()
        : await fetchKalodataCreditBalance();
      if (balAfterRes.ok && balAfterRes.balance !== null) {
        balanceAfter = balAfterRes.balance;
      }
    } catch {
      balanceAfter = null;
    }

    if (!pdResult.ok || !pdResult.data) {
      const errMsg = pdResult.error ?? 'Kalodata Product Detail API error';
      const errMsgMy = pdResult.errorMy ?? 'Kalodata Product Detail API မှ ဒေတာမရရှိပါ။';
      const looksNotFound =
        pdResult.httpStatus === 404 ||
        /not found|not exist|no data|invalid product/i.test(errMsg);

      const confirmedZeroCharge =
        isDeterministicNonBilledHttpError(pdResult.httpStatus, pdResult.upstreamCode) ||
        (balanceBefore !== null && balanceAfter !== null && balanceAfter >= balanceBefore);

      if (confirmedZeroCharge) {
        await ledger.releaseReservation({
          scopeKey,
          reservationId,
          verifiedZeroCharge: true,
          requestedLimitCredits: spendingLimitCredits,
          reason: looksNotFound
            ? 'PRODUCT_NOT_FOUND'
            : pdResult.upstreamCode ?? 'ZERO_CHARGE_ERROR',
        });
      } else {
        await ledger.markReservationUncertain({
          scopeKey,
          reservationId,
          requestedLimitCredits: spendingLimitCredits,
          reason: pdResult.upstreamCode ?? 'UPSTREAM_AMBIGUOUS',
        });
      }
      reservationFinalized = true;

      if (pdResult.upstreamCode === 'MISSING_API_KEY') {
        throw new LinkImportApiError(
          400,
          'MISSING_API_KEY',
          'valid-product',
          errMsg,
          errMsgMy
        );
      }

      if (looksNotFound) {
        throw new LinkImportApiError(
          404,
          'PRODUCT_NOT_FOUND',
          'product-not-found',
          `Product #${productId} was not found in Thailand TikTok Shop / Kalodata records.`,
          `Thailand TikTok Shop / Kalodata တွင် Product #${productId} ကို ရှာမတွေ့ပါ (သို့မဟုတ် ဒေတာမရှိသေးပါ)။`
        );
      }

      throw new LinkImportApiError(
        pdResult.httpStatus && pdResult.httpStatus >= 400 ? pdResult.httpStatus : 502,
        'KALODATA_API_ERROR',
        'valid-product',
        errMsg,
        errMsgMy
      );
    }

    const parsed = parseKalodataProductDetail(productId, pdResult.data);
    const actualSettledCredits =
      balanceBefore !== null && balanceAfter !== null && balanceBefore >= balanceAfter
        ? Math.max(
            KALODATA_PRODUCT_DETAIL_CREDIT,
            roundCredits3(balanceBefore - balanceAfter)
          )
        : KALODATA_PRODUCT_DETAIL_CREDIT;

    if (!parsed || isKalodataProductDetailEmpty(parsed)) {
      await ledger.settleReservation({
        scopeKey,
        reservationId,
        actualCredits: actualSettledCredits,
        requestedLimitCredits: spendingLimitCredits,
        note: `link-import-empty:${productId}`,
      });
      reservationFinalized = true;
      throw new LinkImportApiError(
        404,
        'PRODUCT_NOT_FOUND',
        'product-not-found',
        `Product #${productId} returned no verifiable Thailand TikTok Shop data from Kalodata. No data was fabricated.`,
        `Kalodata မှ Product #${productId} အတွက် အတည်ပြုနိုင်သော Thailand TikTok Shop ဒေတာ မရရှိပါ။ အတုအယောင်ဒေတာ မဖန်တီးထားပါ။`
      );
    }

    const detailRecord = toProductDetailRecord(parsed, 'last30Day');
    setServerCachedProductDetail(detailRecord);

    const candidateShopId = detailRecord.productShopId?.trim() ?? null;
    const cachedShop = candidateShopId
      ? getServerCachedShopDetail(candidateShopId) ??
        (params.clientCachedShopDetail?.shopId.trim() === candidateShopId
          ? params.clientCachedShopDetail
          : null)
      : null;
    const cachedReview =
      getServerCachedReviewInsight(productId) ??
      (params.clientCachedReviewInsight?.productId.trim() === productId
        ? params.clientCachedReviewInsight
        : null);

    const settledSnap = await ledger.settleReservation({
      scopeKey,
      reservationId,
      actualCredits: actualSettledCredits,
      requestedLimitCredits: spendingLimitCredits,
      note: `link-import:${productId}`,
    });
    reservationFinalized = true;

    const result = await finalizeImportedProduct({
      productId,
      parsedDetail: parsed,
      productDetailRecord: detailRecord,
      cachedShopDetail: cachedShop,
      cachedReviewInsight: cachedReview,
      canonicalUrl: inspection.canonicalUrl,
      slugResolved: inspection.slugResolved,
      resolvedUrl,
      redirectHops: inspection.redirectHops,
      alreadyExistedInWorkspace: inspection.alreadyInWorkspace,
      previewImageUrl: inspection.previewImageUrl,
      resolvedCategoryIdMap: params.resolvedCategoryIdMap,
      salesWeightPct,
      spendingLimitCredits,
      dataSource: 'kalodata-api',
      apiCallsMade: 1,
      estimatedCreditsCharged: actualSettledCredits,
      creditsBalanceBefore: balanceBefore,
      creditsBalanceAfter: balanceAfter,
      budgetSnapshot: {
        scopeKey: settledSnap.scopeKey,
        configuredLimitCredits: settledSnap.effectiveLimitCredits,
        totalCommittedCredits: settledSnap.totalCommittedCredits,
        remainingCredits: settledSnap.remainingCredits,
      },
      overrides,
    });

    settleOwnedSlot({ record: detailRecord });
    return result;
  } catch (err) {
    if (reservationId && !reservationFinalized) {
      await ledger
        .markReservationUncertain({
          scopeKey,
          reservationId,
          requestedLimitCredits: spendingLimitCredits,
          reason: 'INTERRUPTED_ERROR',
        })
        .catch(() => {});
    }
    const errMsgEn = err instanceof Error ? err.message : 'Link import failed';
    const errMsgMy =
      err instanceof LinkImportApiError && err.errorMy ? err.errorMy : errMsgEn;
    settleOwnedSlot({
      record: null,
      error: { en: errMsgEn, my: errMsgMy },
    });
    throw err;
  } finally {
    deleteInFlightProductDetailPromise(productId);
  }
}
