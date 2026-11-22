const MAX_ALLOWLIST_SIZE = 2000;
const verifiedImageAllowlist = new Map<string, { contentType: string; verifiedAt: number }>();

const REJECTED_IMAGE_PATH_PATTERNS = [
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
  /\/1x1\b/i,
  /pixel\./i,
  /\.svg$/i,
  /\.ico$/i,
];

/**
 * Trusted public CDN domains used by Kalodata and TikTok Shop (TH & SEA) for product photos.
 * Combined with strict SSRF checks (isSafeExternalUrl) and raster image magic-byte validation,
 * this allows saved/history /api/image-proxy URLs to keep working seamlessly across server restarts.
 */
const TRUSTED_PRODUCT_IMAGE_DOMAINS = [
  'kalodata.com',
  'kalodata.cn',
  'kalodata.net',
  'kalodata.io',
  'kalodata.co',
  'kalodata.org',
  'kalodata-static.com',
  'kalodata-cdn.com',
  'tiktokcdn.com',
  'tiktokcdn-us.com',
  'tiktokcdn-eu.com',
  'tiktokcdn-in.com',
  'tiktokcdn-sg.com',
  'tiktokcdn-maliva.com',
  'tiktokcdn-va.com',
  'tiktokcdn-id.com',
  'tiktokcdn-my.com',
  'tiktokcdn-th.com',
  'tiktokcdn-vn.com',
  'tiktokcdn-ph.com',
  'tiktokglobalshop.com',
  'tiktokshop.com',
  'tiktokv.com',
  'tiktok.com',
  'ttwstatic.com',
  'ibyteimg.com',
  'ibytedtos.com',
  'byteimg.com',
  'byteoversea.com',
  'bytecdn.cn',
  'bytedance.com',
  'bytegecko.com',
  'byteintl.com',
  'byteicdn.com',
  'bytefcdn.com',
  'pstatp.com',
  'toutiao.com',
  'toutiaocdn.com',
  'sgsnssdk.com',
  'snssdk.com',
  'muscdn.com',
  'akamaized.net',
  'edgesuite.net',
  'edgekey.net',
  'aliyuncs.com',
  'alicdn.com',
  'cloudfront.net',
  'amazonaws.com',
  'r2.dev',
  'myqcloud.com',
  'qcloud.com',
  'volces.com',
  'volccdn.com',
  'volctos.com',
  'oceanengine.com',
  'myhuaweicloud.com',
  'huaweicloud.com',
  'hwcdn.net',
  'ksyun.com',
  'fastly.net',
  'cloudflare.com',
  'googleusercontent.com',
  'ggpht.com',
  'fbcdn.net',
  'susercontent.com',
  'shopee.co.th',
  'lazcdn.com',
  'slatic.net',
];

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export function isSafeExternalUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    if (parsed.username || parsed.password) return false;
    const rawHost = parsed.hostname.toLowerCase().replace(/\.+$/, '');
    const host = rawHost.startsWith('[') && rawHost.endsWith(']') ? rawHost.slice(1, -1) : rawHost;
    if (!host) return false;
    if (
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host === '0.0.0.0' ||
      host === '::' ||
      host === '::1' ||
      host === '0:0:0:0:0:0:0:1' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
      /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host) ||
      /^0\./.test(host) ||
      /^fe[89ab][0-9a-f]:/i.test(host) ||
      /^f[cd][0-9a-f]{2}:/i.test(host) ||
      /^::ffff:/i.test(host) ||
      /^\d+$/.test(host) ||
      /^0x[0-9a-f]+$/i.test(host)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function normalizeExternalImageUrl(rawUrl: string | null | undefined): string | null {
  if (typeof rawUrl !== 'string') return null;
  let trimmed = rawUrl.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('//')) {
    trimmed = `https:${trimmed}`;
  }
  return isSafeExternalUrl(trimmed) ? trimmed : null;
}

export function isTrustedProductImageHost(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase().replace(/\.+$/, '');
    return TRUSTED_PRODUCT_IMAGE_DOMAINS.some(
      (domain) => host === domain || host.endsWith(`.${domain}`)
    );
  } catch {
    return false;
  }
}

export function isAllowlistedImageUrl(rawUrl: string): boolean {
  return verifiedImageAllowlist.has(rawUrl);
}

export function registerVerifiedImage(url: string, contentType: string): void {
  if (verifiedImageAllowlist.size >= MAX_ALLOWLIST_SIZE && !verifiedImageAllowlist.has(url)) {
    const firstKey = verifiedImageAllowlist.keys().next().value;
    if (firstKey) verifiedImageAllowlist.delete(firstKey);
  }
  verifiedImageAllowlist.set(url, { contentType, verifiedAt: Date.now() });
}

export function isPlausibleProductImageUrl(url: string): boolean {
  if (!isSafeExternalUrl(url)) return false;
  try {
    const parsed = new URL(url);
    return !REJECTED_IMAGE_PATH_PATTERNS.some((pattern) => pattern.test(parsed.pathname));
  } catch {
    return false;
  }
}

/**
 * Allows /api/image-proxy to serve either runtime-verified URLs OR trusted Kalodata/TikTok CDN
 * product image URLs (so saved products & research history images never 403 after server restarts).
 */
export function isProxyableImageUrl(rawUrl: string): boolean {
  if (!isSafeExternalUrl(rawUrl)) return false;
  if (isAllowlistedImageUrl(rawUrl)) return true;
  return isPlausibleProductImageUrl(rawUrl) && isTrustedProductImageHost(rawUrl);
}

/**
 * Sniffs raster image MIME type from magic bytes for CDNs that serve images as
 * application/octet-stream or without an explicit image/* Content-Type.
 */
export function detectImageMimeFromBytes(bytes: Uint8Array): string | null {
  if (bytes.byteLength < 12) return null;

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  // WebP: RIFF....WEBP
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  // GIF: GIF87a / GIF89a
  if (
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  ) {
    return 'image/gif';
  }
  // AVIF / HEIC / HEIF ISO BMFF container: ....ftyp
  if (
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]).toLowerCase();
    if (brand === 'avif' || brand === 'avis') return 'image/avif';
    if (brand === 'heic' || brand === 'heix' || brand === 'hevc' || brand === 'mif1') {
      return 'image/heic';
    }
  }
  // BMP: BM
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return 'image/bmp';
  }

  return null;
}

export function resolveValidImageMime(
  contentTypeHeader: string,
  sampleBytes: Uint8Array
): string | null {
  const normalized = contentTypeHeader.split(';')[0].trim().toLowerCase();

  // Never allow SVG through the raster image proxy (XSS defense)
  if (normalized.includes('svg')) return null;

  const sniffed = detectImageMimeFromBytes(sampleBytes);
  if (sniffed) {
    return sniffed;
  }

  if (
    /^image\/(jpeg|jpg|pjpeg|png|webp|x-webp|avif|gif|bmp|heic|heif)$/.test(normalized)
  ) {
    if (normalized === 'image/jpg' || normalized === 'image/pjpeg') return 'image/jpeg';
    if (normalized === 'image/x-webp') return 'image/webp';
    return normalized;
  }

  return null;
}

interface LiveImageCheckResult {
  ok: boolean;
  contentType: string;
  httpStatus: number | null;
  transientFailure: boolean;
}

async function fetchAndInspectImageOnce(rawUrl: string): Promise<LiveImageCheckResult> {
  try {
    const response = await fetch(rawUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
      headers: {
        'User-Agent': BROWSER_USER_AGENT,
        Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.9,*/*;q=0.8',
      },
    });

    if (!response.ok) {
      response.body?.cancel().catch(() => {});
      const transientFailure =
        response.status === 403 ||
        response.status === 429 ||
        response.status >= 500;
      return {
        ok: false,
        contentType: '',
        httpStatus: response.status,
        transientFailure,
      };
    }

    const contentTypeHeader = (response.headers.get('content-type') ?? '').toLowerCase();
    const contentLengthHeader = Number(response.headers.get('content-length') ?? '0');
    if (contentLengthHeader > 0 && contentLengthHeader < 256) {
      response.body?.cancel().catch(() => {});
      return { ok: false, contentType: '', httpStatus: response.status, transientFailure: false };
    }

    // Read small prefix to confirm non-empty valid raster image bytes, then abort stream
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let bytesRead = 0;
    if (reader) {
      while (bytesRead < 2048) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value && value.byteLength > 0) {
          chunks.push(value);
          bytesRead += value.byteLength;
        }
      }
      await reader.cancel().catch(() => {});
    }

    if (bytesRead < 256 && contentLengthHeader < 256) {
      return { ok: false, contentType: '', httpStatus: response.status, transientFailure: false };
    }

    const sample = new Uint8Array(Math.min(bytesRead, 64));
    let offset = 0;
    for (const chunk of chunks) {
      if (offset >= sample.byteLength) break;
      const slice = chunk.subarray(0, sample.byteLength - offset);
      sample.set(slice, offset);
      offset += slice.byteLength;
    }

    const resolvedMime = resolveValidImageMime(contentTypeHeader, sample);
    if (!resolvedMime) {
      return { ok: false, contentType: '', httpStatus: response.status, transientFailure: false };
    }

    const finalUrl = response.url || rawUrl;
    if (!isPlausibleProductImageUrl(finalUrl)) {
      return { ok: false, contentType: '', httpStatus: response.status, transientFailure: false };
    }

    registerVerifiedImage(rawUrl, resolvedMime);
    if (finalUrl !== rawUrl) {
      registerVerifiedImage(finalUrl, resolvedMime);
    }

    return {
      ok: true,
      contentType: resolvedMime,
      httpStatus: response.status,
      transientFailure: false,
    };
  } catch {
    return {
      ok: false,
      contentType: '',
      httpStatus: null,
      transientFailure: true,
    };
  }
}

async function verifyLiveImageUrl(rawUrl: string): Promise<LiveImageCheckResult> {
  if (!isPlausibleProductImageUrl(rawUrl)) {
    return { ok: false, contentType: '', httpStatus: null, transientFailure: false };
  }

  const first = await fetchAndInspectImageOnce(rawUrl);
  if (first.ok || !first.transientFailure) {
    return first;
  }

  // Single quick retry on transient network/timeout/5xx error
  return fetchAndInspectImageOnce(rawUrl);
}

/**
 * Verifies a Kalodata Product Rank `master_image_url` via live HTTP fetch,
 * confirms valid raster image/* content, registers it in the proxy allowlist, and returns
 * a safe /api/image-proxy URL (or direct trusted CDN URL if server IP is blocked by CDN).
 */
export async function verifyKalodataImageUrl(
  imgUrl: string | null | undefined
): Promise<{
  imageVerified: boolean;
  imageUrl: string | null;
  imageOriginUrl: string | null;
  imageSourceNoteEn: string;
  imageSourceNoteMy: string;
}> {
  const normalizedUrl = normalizeExternalImageUrl(imgUrl);
  if (!normalizedUrl || !isPlausibleProductImageUrl(normalizedUrl)) {
    return {
      imageVerified: false,
      imageUrl: null,
      imageOriginUrl: null,
      imageSourceNoteEn:
        'Verified image unavailable — Kalodata did not return a valid master_image_url for this product.',
      imageSourceNoteMy:
        'Verified image unavailable — ဤ Product အတွက် Kalodata မှ master_image_url မရရှိပါ။',
    };
  }

  const check = await verifyLiveImageUrl(normalizedUrl);
  if (check.ok) {
    return {
      imageVerified: true,
      imageUrl: `/api/image-proxy?url=${encodeURIComponent(normalizedUrl)}`,
      imageOriginUrl: normalizedUrl,
      imageSourceNoteEn:
        'Verified TikTok Shop product image retrieved from Kalodata Product Rank API.',
      imageSourceNoteMy:
        'Kalodata Product Rank API မှ တိုက်ရိုက်ရရှိပြီး စစ်ဆေးအတည်ပြုထားသော TikTok Shop Product ဓာတ်ပုံဖြစ်ပါသည်။',
    };
  }

  // If the image comes from a trusted Kalodata/TikTok CDN host and our server hit a
  // datacenter block/rate-limit/timeout (NOT 404/410), allow the browser to load the
  // official Kalodata image directly with referrerPolicy="no-referrer" (still guarded by onError).
  if (check.transientFailure && isTrustedProductImageHost(normalizedUrl)) {
    registerVerifiedImage(normalizedUrl, 'image/jpeg');
    return {
      imageVerified: true,
      imageUrl: normalizedUrl,
      imageOriginUrl: normalizedUrl,
      imageSourceNoteEn:
        'Official TikTok Shop product image URL returned by Kalodata Product Rank API.',
      imageSourceNoteMy:
        'Kalodata Product Rank API မှ တိုက်ရိုက်ပြန်ပေးသော TikTok Shop Product ဓာတ်ပုံ URL ဖြစ်ပါသည်။',
    };
  }

  return {
    imageVerified: false,
    imageUrl: null,
    imageOriginUrl: null,
    imageSourceNoteEn:
      'Verified image unavailable — Kalodata product image URL did not pass live HTTP image verification.',
    imageSourceNoteMy:
      'Verified image unavailable — Kalodata Product ပုံ URL ကို Live စစ်ဆေးအတည်ပြု၍ မရပါ။',
  };
}

const DEFAULT_MAX_PROXY_IMAGE_BYTES = 5 * 1024 * 1024;
const PDP_IMAGE_POSITIVE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const PDP_IMAGE_NEGATIVE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_PDP_IMAGE_CACHE = 2000;

const livePdpImageCache = new Map<string, { url: string | null; expiresAt: number }>();
const inFlightPdpImageLookups = new Map<string, Promise<string | null>>();

export function decodeHtmlUrlEntities(raw: string): string {
  return raw
    .replace(/&amp;/gi, '&')
    .replace(/&#38;/gi, '&')
    .replace(/&#x26;/gi, '&')
    .replace(/&#x2f;/gi, '/')
    .replace(/&#47;/gi, '/')
    .replace(/\\u0026/gi, '&')
    .replace(/\\u002f/gi, '/')
    .replace(/\\\//g, '/')
    .trim();
}

export function extractTikTokPdpImageUrlFromHtml(html: string): string | null {
  if (!html || typeof html !== 'string') return null;

  const metaMatches = [
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i),
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i),
    html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i),
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i),
  ];

  for (const match of metaMatches) {
    if (match?.[1]) {
      const candidate = normalizeExternalImageUrl(decodeHtmlUrlEntities(match[1]));
      if (candidate && isPlausibleProductImageUrl(candidate)) {
        return candidate;
      }
    }
  }

  const cdnRegex = /https:\/\/[^"'\s\\<>]+(?:ibyteimg\.com|tiktokcdn[^"'\s\\<>]*\.com)\/[^"'\s\\<>]+/gi;
  let cdnMatch: RegExpExecArray | null;
  while ((cdnMatch = cdnRegex.exec(html)) !== null) {
    const candidate = normalizeExternalImageUrl(decodeHtmlUrlEntities(cdnMatch[0]));
    if (
      candidate &&
      isPlausibleProductImageUrl(candidate) &&
      /\.(webp|jpe?g|png|avif)(?:$|\?)/i.test(candidate)
    ) {
      return candidate;
    }
  }

  return null;
}

/**
 * 0-credit live recovery of a product's official photo from its public TikTok Shop Thailand PDP.
 * Used transparently when backed-up/restored CDN URLs have expired or been stripped in older exports.
 */
export async function resolveLiveTikTokProductImageUrl(
  rawProductId: string | null | undefined
): Promise<string | null> {
  if (typeof rawProductId !== 'string') return null;
  const cleanId = rawProductId.trim().replace(/^(kalodata-th-|kd[_-])/i, '').trim();
  if (!/^\d{8,24}$/.test(cleanId)) return null;

  const now = Date.now();
  const cached = livePdpImageCache.get(cleanId);
  if (cached && cached.expiresAt > now) {
    return cached.url;
  }

  const existing = inFlightPdpImageLookups.get(cleanId);
  if (existing) return existing;

  const pending = (async (): Promise<string | null> => {
    try {
      const pdpUrl = `https://shop.tiktok.com/th/pdp/product/${cleanId}`;
      const res = await fetch(pdpUrl, {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(7000),
        headers: {
          'User-Agent': BROWSER_USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7',
        },
      });

      if (!res.ok) {
        res.body?.cancel().catch(() => {});
        return null;
      }

      const html = await res.text();
      const extracted = extractTikTokPdpImageUrlFromHtml(html);
      if (extracted) {
        registerVerifiedImage(extracted, 'image/webp');
      }

      if (livePdpImageCache.size >= MAX_PDP_IMAGE_CACHE && !livePdpImageCache.has(cleanId)) {
        const firstKey = livePdpImageCache.keys().next().value;
        if (firstKey) livePdpImageCache.delete(firstKey);
      }
      livePdpImageCache.set(cleanId, {
        url: extracted,
        expiresAt: Date.now() + (extracted ? PDP_IMAGE_POSITIVE_TTL_MS : PDP_IMAGE_NEGATIVE_TTL_MS),
      });
      return extracted;
    } catch {
      return null;
    } finally {
      inFlightPdpImageLookups.delete(cleanId);
    }
  })();

  inFlightPdpImageLookups.set(cleanId, pending);
  return pending;
}

export async function fetchProxiedImageBuffer(
  rawUrl: string,
  maxBytes: number = DEFAULT_MAX_PROXY_IMAGE_BYTES
): Promise<{ ok: true; buffer: Buffer; mime: string } | { ok: false; status: number }> {
  if (!isSafeExternalUrl(rawUrl)) {
    return { ok: false, status: 403 };
  }

  try {
    const upstream = await fetch(rawUrl, {
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
      headers: {
        'User-Agent': BROWSER_USER_AGENT,
        Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.9,*/*;q=0.8',
      },
    });

    if (upstream.url && !isSafeExternalUrl(upstream.url)) {
      upstream.body?.cancel().catch(() => {});
      return { ok: false, status: 403 };
    }

    if (!upstream.ok) {
      upstream.body?.cancel().catch(() => {});
      return { ok: false, status: upstream.status === 404 ? 404 : 502 };
    }

    const declaredLength = Number(upstream.headers.get('content-length') ?? '0');
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      upstream.body?.cancel().catch(() => {});
      return { ok: false, status: 413 };
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (buffer.byteLength < 256 || buffer.byteLength > maxBytes) {
      return { ok: false, status: buffer.byteLength > maxBytes ? 413 : 404 };
    }

    const contentType = (upstream.headers.get('content-type') ?? '').toLowerCase();
    const resolvedMime = resolveValidImageMime(contentType, buffer);
    if (!resolvedMime) {
      return { ok: false, status: 415 };
    }

    registerVerifiedImage(rawUrl, resolvedMime);
    return { ok: true, buffer, mime: resolvedMime };
  } catch {
    return { ok: false, status: 502 };
  }
}
