import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createBudgetLedger } from '../server/budgetLedgerService.ts';
import {
  clearServerEnrichmentCache,
  getServerCachedProductDetail,
} from '../server/enrichmentService.ts';
import {
  clearLinkImportCache,
  importTikTokProductFromLink,
  inspectTikTokProductLink,
  LinkImportApiError,
} from '../server/linkImportService.ts';
import { pauseResearch, resumeResearch } from '../server/researchService.ts';
import { getCanonicalProductId } from '../src/utils/scoring.ts';
import type { KalodataProductDetailEnrichmentRecord } from '../src/types/product.ts';

function makeTempLedger(prefix: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `siampick-link-${prefix}-`));
  const dbPath = path.join(dir, 'budget.sqlite');
  const ledger = createBudgetLedger({ sqlitePath: dbPath });
  return {
    ledger,
    cleanup: () => {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore cleanup error
      }
    },
  };
}

function makeMockCanonical(productId: string, slug = 'serum-test') {
  return async () => ({
    productId,
    canonicalUrl: `https://shop.tiktok.com/th/pdp/${slug}/${productId}`,
    fallbackUrl: `https://shop.tiktok.com/th/pdp/product/${productId}`,
    slugResolved: true,
    appSchemeUrl: `snssdk1180://ec/pdp?product_id=${productId}`,
    trillIntentUrl: '',
    musicallyIntentUrl: '',
    appLinkIntentUrl: '',
  });
}

test('inspectTikTokProductLink extracts TH Product ID from direct URLs, share text, deep links, and redirect query params at 0 credits', async () => {
  clearServerEnrichmentCache();
  clearLinkImportCache();

  const { ledger, cleanup } = makeTempLedger('direct');
  try {
    const pid = '1731661332013680750';
    let balanceCalls = 0;

    const directCases = [
      `https://shop.tiktok.com/th/pdp/thai-glow-serum/${pid}?source=copy_link`,
      `https://shop.tiktok.com/th/pdp/${pid}`,
      `https://shop.tiktok.com/view/product/${pid}?region=TH`,
      `https://shop.tiktok.com/shop/p/${pid}`,
      `ดูสินค้านี้สิ! https://shop.tiktok.com/th/pdp/product/${pid} #tiktokshop`,
      `https://l.tiktok.com/redirect?url=${encodeURIComponent(`https://shop.tiktok.com/th/pdp/serum/${pid}`)}`,
      `snssdk1180://ec/pdp?biz_type=0&requestParams=${encodeURIComponent(JSON.stringify({ product_id: [pid] }))}`,
    ];

    for (const rawInput of directCases) {
      const res = await inspectTikTokProductLink(
        {
          rawInput,
          spendingLimitCredits: 5,
        },
        {
          budgetLedger: ledger,
          budgetScopeKey: 'test-direct',
          resolveCanonicalUrl: makeMockCanonical(pid),
          fetchBalance: async () => {
            balanceCalls += 1;
            return {
              ok: true,
              configured: true,
              httpStatus: 200,
              balance: 12.5,
              unit: 'credit',
              fields: [],
              rawData: null,
              status: null,
              endpoint: 'test',
              authHeader: 'secret-key',
              checkedAt: new Date().toISOString(),
            };
          },
        }
      );

      assert.equal(res.ok, true, `Expected ok=true for ${rawInput}`);
      assert.equal(res.classification, 'valid-product');
      assert.equal(res.productId, pid);
      assert.equal(res.canonicalProductId, `kalodata-th-${pid}`);
      assert.equal(res.requiresPaidApiCall, true);
      assert.equal(res.estimatedCredits, 0.1);
      assert.equal(res.requiresConfirmation, true);
    }

    assert.equal(balanceCalls, directCases.length);
  } finally {
    cleanup();
  }
});

test('inspectTikTokProductLink resolves short links across HTTP redirects and HTML canonical tags while blocking SSRF hops', async () => {
  clearServerEnrichmentCache();
  clearLinkImportCache();

  const { ledger, cleanup } = makeTempLedger('short');
  try {
    const pid = '1729554433221100998';

    // Multi-hop 302 -> 200 HTML canonical
    const multiHop = await inspectTikTokProductLink(
      {
        rawInput: 'https://vt.tiktok.com/ZSrXYZ123/',
        spendingLimitCredits: 5,
      },
      {
        budgetLedger: ledger,
        budgetScopeKey: 'test-short',
        skipShortLinkCache: true,
        resolveCanonicalUrl: makeMockCanonical(pid, 'thai-lip-tint'),
        fetchBalance: async () => ({
          ok: true,
          configured: true,
          httpStatus: 200,
          balance: 8.0,
          unit: 'credit',
          fields: [],
          rawData: null,
          status: null,
          endpoint: 'test',
          authHeader: 'secret-key',
          checkedAt: new Date().toISOString(),
        }),
        fetchLink: async (url) => {
          if (url === 'https://vt.tiktok.com/ZSrXYZ123/') {
            return {
              status: 302,
              headers: new Headers({ location: 'https://www.tiktok.com/t/ZT2abc/' }),
            };
          }
          if (url === 'https://www.tiktok.com/t/ZT2abc/') {
            return {
              status: 200,
              headers: new Headers(),
              text: async () => `
                <html>
                  <head>
                    <meta property="og:title" content="Velvet Lip Tint Matte TH | TikTok Shop" />
                    <link rel="canonical" href="https://shop.tiktok.com/th/pdp/velvet-lip-tint/${pid}" />
                  </head>
                </html>
              `,
            };
          }
          throw new Error(`Unexpected fetch URL: ${url}`);
        },
      }
    );

    assert.equal(multiHop.ok, true);
    assert.equal(multiHop.classification, 'valid-product');
    assert.equal(multiHop.productId, pid);
    assert.equal(multiHop.previewTitle, 'Velvet Lip Tint Matte TH | TikTok Shop'.replace(/\s*\|\s*TikTok.*$/i, ''));
    assert.equal(multiHop.redirectHops.length, 3);

    // Redirect to SSRF target 127.0.0.1 is immediately blocked
    const ssrfHop = await inspectTikTokProductLink(
      { rawInput: 'https://vt.tiktok.com/ZSrEVIL/' },
      {
        budgetLedger: ledger,
        budgetScopeKey: 'test-short',
        skipShortLinkCache: true,
        fetchLink: async () => ({
          status: 302,
          headers: new Headers({ location: 'http://127.0.0.1:8080/admin' }),
        }),
      }
    );

    assert.equal(ssrfHop.ok, false);
    assert.equal(ssrfHop.classification, 'invalid-link');
    assert.equal(ssrfHop.errorCode, 'SSRF_BLOCKED');

    // Direct private/localhost URL rejected cleanly before any fetch
    let directSsrfFetched = false;
    const directSsrf = await inspectTikTokProductLink(
      { rawInput: 'http://169.254.169.254/latest/meta-data/' },
      {
        budgetLedger: ledger,
        budgetScopeKey: 'test-short',
        fetchLink: async () => {
          directSsrfFetched = true;
          throw new Error('Should not fetch SSRF URL');
        },
      }
    );
    assert.equal(directSsrfFetched, false);
    assert.equal(directSsrf.classification, 'invalid-link');
    assert.equal(directSsrf.errorCode, 'SSRF_BLOCKED');
  } finally {
    cleanup();
  }
});

test('inspectTikTokProductLink distinguishes Invalid, Unsupported (Shopee, Video, Non-TH), and Not Found links clearly', async () => {
  clearServerEnrichmentCache();
  clearLinkImportCache();
  const { ledger, cleanup } = makeTempLedger('errors');
  try {
    let externalFetchCalled = false;
    const noFetch = async () => {
      externalFetchCalled = true;
      throw new Error('Should not fetch unsupported platforms or video pages');
    };

    const empty = await inspectTikTokProductLink({ rawInput: '   ' }, { budgetLedger: ledger });
    assert.equal(empty.classification, 'invalid-link');
    assert.equal(empty.errorCode, 'EMPTY_INPUT');

    const shopee = await inspectTikTokProductLink(
      { rawInput: 'https://shopee.co.th/product/123456/7890123456' },
      { budgetLedger: ledger, fetchLink: noFetch }
    );
    assert.equal(shopee.classification, 'unsupported-link');
    assert.equal(shopee.errorCode, 'UNSUPPORTED_PLATFORM');

    // TikTok video ID has 19 digits — must NEVER be treated as a product ID
    const tiktokVideo = await inspectTikTokProductLink(
      { rawInput: 'https://www.tiktok.com/@bangkokcreator/video/7400123456789012345' },
      { budgetLedger: ledger, fetchLink: noFetch }
    );
    assert.equal(tiktokVideo.classification, 'unsupported-link');
    assert.equal(tiktokVideo.errorCode, 'UNSUPPORTED_TIKTOK_SURFACE');
    assert.equal(tiktokVideo.productId, null);

    // Non-TH TikTok Shop PDP link
    const usShop = await inspectTikTokProductLink(
      { rawInput: 'https://shop.tiktok.com/us/pdp/face-wash/1729000000111222333' },
      { budgetLedger: ledger, fetchLink: noFetch }
    );
    assert.equal(usShop.classification, 'unsupported-link');
    assert.equal(usShop.errorCode, 'NON_THAILAND_SHOP_LINK');
    assert.equal(externalFetchCalled, false);

    // Short link returning 404 -> product-not-found
    const notFound = await inspectTikTokProductLink(
      { rawInput: 'https://vt.tiktok.com/ZSrGONE404/' },
      {
        budgetLedger: ledger,
        skipShortLinkCache: true,
        fetchLink: async () => ({
          status: 404,
          headers: new Headers(),
        }),
      }
    );
    assert.equal(notFound.classification, 'product-not-found');
    assert.equal(notFound.errorCode, 'PRODUCT_NOT_FOUND');
  } finally {
    cleanup();
  }
});

test('importTikTokProductFromLink enforces explicit confirmation BEFORE calling Kalodata, persists budget, and uses 0 cr on cache/duplicate links', async () => {
  clearServerEnrichmentCache();
  clearLinkImportCache();
  resumeResearch();
  const { ledger, cleanup } = makeTempLedger('confirm');
  try {
    const pid = '1731661332013680888';
    let paidDetailCalls = 0;

    // 1. Unconfirmed call MUST fail BEFORE any Kalodata call or budget deduction
    await assert.rejects(
      () =>
        importTikTokProductFromLink(
          {
            rawInput: `https://shop.tiktok.com/th/pdp/collagen-serum/${pid}`,
            userConfirmedPaidExecution: false,
            spendingLimitCredits: 2,
          },
          {
            budgetLedger: ledger,
            budgetScopeKey: 'test-confirm',
            resolveCanonicalUrl: makeMockCanonical(pid, 'collagen-serum'),
            fetchProductDetail: async () => {
              paidDetailCalls += 1;
              throw new Error('Should not execute unconfirmed paid call');
            },
          }
        ),
      (err: unknown) => {
        assert.ok(err instanceof LinkImportApiError);
        assert.equal(err.code, 'CONFIRMATION_REQUIRED');
        assert.equal(err.status, 400);
        return true;
      }
    );
    assert.equal(paidDetailCalls, 0);

    // 2. Confirmed call -> executes once (0.1 cr), settles budget, populates server cache, preserves unverified/unavailable commission when omitted
    const imported = await importTikTokProductFromLink(
      {
        rawInput: `https://shop.tiktok.com/th/pdp/collagen-serum/${pid}`,
        userConfirmedPaidExecution: true,
        spendingLimitCredits: 2,
        salesWeightPct: 50,
      },
      {
        budgetLedger: ledger,
        budgetScopeKey: 'test-confirm',
        resolveCanonicalUrl: makeMockCanonical(pid, 'collagen-serum'),
        verifyImage: async () => ({
          imageVerified: false,
          imageUrl: null,
          imageOriginUrl: null,
          imageSourceNoteEn: 'No image',
          imageSourceNoteMy: 'ပုံမရှိ',
        }),
        resolveLiveImage: async () => null,
        fetchBalance: async () => ({
          ok: true,
          configured: true,
          httpStatus: 200,
          balance: 10.0,
          unit: 'credit',
          fields: [],
          rawData: null,
          status: null,
          endpoint: 'test',
          authHeader: 'secret-key',
          checkedAt: new Date().toISOString(),
        }),
        fetchProductDetail: async () => {
          paidDetailCalls += 1;
          return {
            ok: true,
            configured: true,
            endpoint: 'product/detail',
            httpStatus: 200,
            checkedAt: new Date().toISOString(),
            fieldKeys: ['id', 'product_title', 'unit_price', 'sale', 'revenue'],
            cached: false,
            data: {
              id: pid,
              product_title: 'Thai Collagen Glow Serum 30ml',
              unit_price: 259,
              sale: 1450,
              revenue: 375550,
              creator_num: 34,
              video_num: 48,
              pri_category: { category_id: '601450', category_name: 'Beauty & Personal Care' },
              // Deliberately omit commission_rate to assert NO fabrication!
            },
          };
        },
      }
    );

    assert.equal(paidDetailCalls, 1);
    assert.equal(imported.ok, true);
    assert.equal(imported.dataSource, 'kalodata-api');
    assert.equal(imported.apiCallsMade, 1);
    assert.equal(imported.estimatedCreditsCharged, 0.1);
    assert.equal(imported.product.id, `kalodata-th-${pid}`);
    assert.equal(imported.product.category, 'cosmetics-beauty');
    // Commission omitted by Kalodata MUST stay unavailable (null), never fabricated
    assert.equal(imported.product.commissionRate, null);
    assert.equal(imported.product.commissionStatus, 'unavailable');
    assert.ok(getServerCachedProductDetail(pid));

    // 3. Different link pointing to SAME product ID hits server cache -> 0 API calls, 0 credits, even WITHOUT confirmation
    const cachedImport = await importTikTokProductFromLink(
      {
        rawInput: `https://shop.tiktok.com/view/product/${pid}`,
        userConfirmedPaidExecution: false,
        spendingLimitCredits: 2,
        existingWorkspaceIds: { results: [imported.product.id] },
      },
      {
        budgetLedger: ledger,
        budgetScopeKey: 'test-confirm',
        resolveCanonicalUrl: makeMockCanonical(pid, 'collagen-serum'),
        verifyImage: async () => ({
          imageVerified: false,
          imageUrl: null,
          imageOriginUrl: null,
          imageSourceNoteEn: 'No image',
          imageSourceNoteMy: 'ပုံမရှိ',
        }),
        resolveLiveImage: async () => null,
        fetchProductDetail: async () => {
          paidDetailCalls += 1;
          throw new Error('Should not re-call Kalodata on cached/duplicate link');
        },
      }
    );

    assert.equal(paidDetailCalls, 1);
    assert.equal(cachedImport.dataSource, 'server-cache');
    assert.equal(cachedImport.apiCallsMade, 0);
    assert.equal(cachedImport.estimatedCreditsCharged, 0);
    assert.equal(cachedImport.alreadyExistedInWorkspace, true);
    assert.equal(getCanonicalProductId(cachedImport.product), getCanonicalProductId(imported.product));
  } finally {
    cleanup();
  }
});

test('importTikTokProductFromLink respects Spending Limit, Research Pause, empty Kalodata 404 (release budget), and client cache reuse', async () => {
  clearServerEnrichmentCache();
  clearLinkImportCache();
  resumeResearch();
  const { ledger, cleanup } = makeTempLedger('guards');
  try {
    const pidEmpty = '1731661332013680999';

    // Empty Kalodata payload -> honest 404 PRODUCT_NOT_FOUND (no fabricated card)
    await assert.rejects(
      () =>
        importTikTokProductFromLink(
          {
            rawInput: `https://shop.tiktok.com/th/pdp/${pidEmpty}`,
            userConfirmedPaidExecution: true,
            spendingLimitCredits: 0.2,
          },
          {
            budgetLedger: ledger,
            budgetScopeKey: 'test-guards',
            resolveCanonicalUrl: makeMockCanonical(pidEmpty),
            fetchBalance: async () => ({
              ok: true,
              configured: true,
              httpStatus: 200,
              balance: 5,
              unit: 'credit',
              fields: [],
              rawData: null,
              status: null,
              endpoint: 'test',
              authHeader: 'secret-key',
              checkedAt: new Date().toISOString(),
            }),
            fetchProductDetail: async () => ({
              ok: false,
              configured: true,
              endpoint: 'product/detail',
              httpStatus: 404,
              checkedAt: new Date().toISOString(),
              fieldKeys: [],
              cached: null,
              data: null,
              error: 'Product not found',
            }),
          }
        ),
      (err: unknown) => {
        assert.ok(err instanceof LinkImportApiError);
        assert.equal(err.code, 'PRODUCT_NOT_FOUND');
        assert.equal(err.classification, 'product-not-found');
        return true;
      }
    );

    // 404 deterministic zero-charge released reservation -> 0.2 cr remaining!
    const snapAfter404 = await ledger.getScopeSnapshot('test-guards', 0.2);
    assert.equal(snapAfter404.totalCommittedCredits, 0);

    // Pause blocks uncached call
    pauseResearch('manual');
    await assert.rejects(
      () =>
        importTikTokProductFromLink(
          {
            rawInput: `https://shop.tiktok.com/th/pdp/1731661332013680111`,
            userConfirmedPaidExecution: true,
            spendingLimitCredits: 0.2,
          },
          {
            budgetLedger: ledger,
            budgetScopeKey: 'test-guards',
            resolveCanonicalUrl: makeMockCanonical('1731661332013680111'),
          }
        ),
      (err: unknown) => {
        assert.ok(err instanceof LinkImportApiError);
        assert.equal(err.code, 'RESEARCH_PAUSED');
        return true;
      }
    );
    resumeResearch();

    // Pre-commit 0.1 cr on 'test-limit-exceeded', then confirm next 0.1 cr import blocks with SPENDING_LIMIT_EXCEEDED
    const preReserve = await ledger.atomicReserveBudget({
      scopeKey: 'test-limit-exceeded',
      idempotencyKey: 'pre-spend-1',
      runId: null,
      operation: 'pre-spend',
      reserveCredits: 0.1,
      requestedLimitCredits: 0.1,
    });
    assert.equal(preReserve.ok, true);
    if (preReserve.ok) {
      await ledger.markReservationDispatched('test-limit-exceeded', preReserve.reservationId);
      await ledger.settleReservation({
        scopeKey: 'test-limit-exceeded',
        reservationId: preReserve.reservationId,
        actualCredits: 0.1,
        requestedLimitCredits: 0.1,
      });
    }

    // Spending limit exceeded (0.1 committed + 0.1 needed > 0.1 limit) blocks before Kalodata call
    await assert.rejects(
      () =>
        importTikTokProductFromLink(
          {
            rawInput: `https://shop.tiktok.com/th/pdp/1731661332013680222`,
            userConfirmedPaidExecution: true,
            spendingLimitCredits: 0.1,
          },
          {
            budgetLedger: ledger,
            budgetScopeKey: 'test-limit-exceeded',
            resolveCanonicalUrl: makeMockCanonical('1731661332013680222'),
            fetchProductDetail: async () => {
              throw new Error('Should not execute over spending limit');
            },
          }
        ),
      (err: unknown) => {
        assert.ok(err instanceof LinkImportApiError);
        assert.equal(err.code, 'SPENDING_LIMIT_EXCEEDED');
        return true;
      }
    );

    // Client cache hit bypasses paid call cleanly (0 credits)
    const clientCachedRecord: KalodataProductDetailEnrichmentRecord = {
      productId: '1731661332013680333',
      productShopId: null,
      productName: 'Client Cached Linen Blouse',
      minPriceThb: 199,
      maxPriceThb: 199,
      unitPriceThb: 199,
      revenueThb: 85000,
      salesVolume: 427,
      videoRevenueThb: 30000,
      liveRevenueThb: 5000,
      shoppingMallRevenueThb: null,
      commissionRatePct: 12,
      creatorNumber: 12,
      videoNumber: 20,
      liveNumber: 3,
      deliveryType: 'LOCAL',
      productReviewCount: 88,
      launchDate: null,
      trendPointsCount: 30,
      trendPeakThb: 4000,
      trendAvgThb: 2800,
      dateRange: 'last30Day',
      updatedAt: new Date().toISOString(),
    };

    const clientCacheImport = await importTikTokProductFromLink(
      {
        rawInput: `https://shop.tiktok.com/th/pdp/linen-blouse/1731661332013680333`,
        clientCachedProductDetail: clientCachedRecord,
        userConfirmedPaidExecution: false,
      },
      {
        budgetLedger: ledger,
        budgetScopeKey: 'test-guards',
        resolveCanonicalUrl: makeMockCanonical('1731661332013680333', 'linen-blouse'),
        verifyImage: async () => ({
          imageVerified: false,
          imageUrl: null,
          imageOriginUrl: null,
          imageSourceNoteEn: 'No image',
          imageSourceNoteMy: 'ပုံမရှိ',
        }),
        resolveLiveImage: async () => null,
      }
    );

    assert.equal(clientCacheImport.dataSource, 'client-cache');
    assert.equal(clientCacheImport.apiCallsMade, 0);
    assert.equal(clientCacheImport.estimatedCreditsCharged, 0);
    assert.equal(clientCacheImport.product.name, 'Client Cached Linen Blouse');
  } finally {
    clearServerEnrichmentCache();
    clearLinkImportCache();
    cleanup();
  }
});
