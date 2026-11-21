const MAX_ALLOWLIST_SIZE = 500;
const verifiedImageAllowlist = new Map<string, { contentType: string; verifiedAt: number }>();

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


/**
 * Verifies a Kalodata Product Rank `master_image_url` via live HTTP fetch,
 * confirms valid raster image/* content, registers it in the proxy allowlist, and returns
 * a safe /api/image-proxy URL (or imageVerified=false if unavailable).
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
  if (!imgUrl || !isPlausibleProductImageUrl(imgUrl)) {
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

  const check = await verifyLiveImageUrl(imgUrl);
  if (!check.ok) {
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

  return {
    imageVerified: true,
    imageUrl: `/api/image-proxy?url=${encodeURIComponent(imgUrl)}`,
    imageOriginUrl: imgUrl,
    imageSourceNoteEn: 'Verified TikTok Shop product image retrieved from Kalodata Product Rank API.',
    imageSourceNoteMy: 'Kalodata Product Rank API မှ တိုက်ရိုက်ရရှိပြီး စစ်ဆေးအတည်ပြုထားသော TikTok Shop Product ဓာတ်ပုံဖြစ်ပါသည်။',
  };
}

