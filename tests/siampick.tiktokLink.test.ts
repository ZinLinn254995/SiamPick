import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFallbackTikTokShopUrl,
  buildTikTokAppDeepLinks,
  extractNumericTikTokProductId,
  parseSafeCanonicalTikTokPdpLocation,
  renderAndroidTikTokOpenPageHtml,
} from '../server/tiktokLinkService.ts';
import {
  extractCanonicalTikTokNumericId,
  getTikTokShopProductUrl,
  hasResolvedCanonicalTikTokSlug,
  isLegacyOrSluglessTikTokUrl,
  normalizeTikTokSourceUrl,
} from '../src/utils/format.ts';

test('extractNumericTikTokProductId handles raw IDs, prefixed IDs, and rejects unsafe inputs', () => {
  assert.equal(extractNumericTikTokProductId('1731661332013680750'), '1731661332013680750');
  assert.equal(extractNumericTikTokProductId('kalodata-th-1731661332013680750'), '1731661332013680750');
  assert.equal(extractNumericTikTokProductId('kd_1731661332013680750'), '1731661332013680750');
  assert.equal(extractNumericTikTokProductId('1731661332013680750?evil=1'), null);
  assert.equal(extractNumericTikTokProductId('../etc/passwd'), null);
  assert.equal(extractNumericTikTokProductId('12345'), null);
});

test('parseSafeCanonicalTikTokPdpLocation strictly allows canonical shop.tiktok.com TH PDP URLs', () => {
  const validLocation =
    'https://shop.tiktok.com/th/pdp/vitamin-c-chak-aeo-es-orl-a-echorri-1000-mk/1731661332013680750?source=product_detail&enter_method=url_semantic_301';
  assert.equal(
    parseSafeCanonicalTikTokPdpLocation(validLocation, '1731661332013680750'),
    'https://shop.tiktok.com/th/pdp/vitamin-c-chak-aeo-es-orl-a-echorri-1000-mk/1731661332013680750'
  );

  // Rejects external host (SSRF / open redirect guard)
  assert.equal(
    parseSafeCanonicalTikTokPdpLocation(
      'https://evil.example/th/pdp/foo/1731661332013680750',
      '1731661332013680750'
    ),
    null
  );
  // Rejects mismatched product ID
  assert.equal(
    parseSafeCanonicalTikTokPdpLocation(
      'https://shop.tiktok.com/th/pdp/foo/999999999999999999',
      '1731661332013680750'
    ),
    null
  );
  // Rejects slugless /th/pdp/{id}
  assert.equal(
    parseSafeCanonicalTikTokPdpLocation(
      'https://shop.tiktok.com/th/pdp/1731661332013680750',
      '1731661332013680750'
    ),
    null
  );
});

test('buildTikTokAppDeepLinks emits valid trill & musically Android intents with canonical fallback', () => {
  const canonical =
    'https://shop.tiktok.com/th/pdp/vitamin-c-acerola/1731661332013680750';
  const links = buildTikTokAppDeepLinks('1731661332013680750', canonical);

  assert.ok(links.appSchemeUrl.startsWith('snssdk1180://ec/pdp?'));
  assert.ok(links.trillIntentUrl.includes('package=com.ss.android.ugc.trill'));
  assert.ok(links.musicallyIntentUrl.includes('package=com.zhiliaoapp.musically'));
  assert.ok(links.trillIntentUrl.includes(`S.browser_fallback_url=${encodeURIComponent(canonical)}`));

  const html = renderAndroidTikTokOpenPageHtml({
    productId: '1731661332013680750',
    canonicalUrl: canonical,
    fallbackUrl: buildFallbackTikTokShopUrl('1731661332013680750'),
    slugResolved: true,
    ...links,
  });
  assert.ok(html.includes('TikTok Shop Product #1731661332013680750'));
  assert.ok(html.includes('com.ss.android.ugc.trill'));
  assert.ok(html.includes(canonical));
});

test('client format helpers always upgrade slugless/legacy URLs to 2-segment /th/pdp/{slug}/{id}', () => {
  const legacyProduct = {
    id: 'kalodata-th-1731661332013680750',
    sources: [
      { url: 'https://shop.tiktok.com/th/pdp/1731661332013680750', verified: true },
    ],
  };

  assert.equal(extractCanonicalTikTokNumericId(legacyProduct), '1731661332013680750');
  assert.equal(hasResolvedCanonicalTikTokSlug(legacyProduct), false);
  assert.equal(
    getTikTokShopProductUrl(legacyProduct),
    'https://shop.tiktok.com/th/pdp/product/1731661332013680750'
  );
  assert.equal(isLegacyOrSluglessTikTokUrl('https://shop.tiktok.com/th/pdp/1731661332013680750'), true);
  assert.equal(isLegacyOrSluglessTikTokUrl('https://shop.tiktok.com/view/product/1731661332013680750'), true);
  assert.equal(
    isLegacyOrSluglessTikTokUrl('https://shop.tiktok.com/th/pdp/vitamin-c-acerola/1731661332013680750'),
    false
  );
  assert.equal(
    normalizeTikTokSourceUrl('https://shop.tiktok.com/th/pdp/1731661332013680750'),
    'https://shop.tiktok.com/th/pdp/product/1731661332013680750'
  );

  const canonicalProduct = {
    id: '1731661332013680751',
    sources: [
      {
        url: 'https://shop.tiktok.com/th/pdp/serum-sample-slug/1731661332013680751',
        verified: true,
      },
    ],
  };
  assert.equal(hasResolvedCanonicalTikTokSlug(canonicalProduct), true);
  assert.equal(
    getTikTokShopProductUrl(canonicalProduct),
    'https://shop.tiktok.com/th/pdp/serum-sample-slug/1731661332013680751'
  );
});
