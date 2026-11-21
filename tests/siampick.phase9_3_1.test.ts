import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ResearchProduct } from '../src/types/product.ts';
import {
  BudgetStorageUnavailableError,
  createBudgetLedger,
  DEFAULT_RESERVATION_LEASE_MS,
  PersistentBudgetLedger,
  resolveAuthoritativeBudgetScope,
} from '../server/budgetLedgerService.ts';
import {
  clearServerEnrichmentCache,
  EnrichmentApiError,
  enrichSingleProduct,
} from '../server/enrichmentService.ts';
import {
  estimateDeepDiveExecutionCost,
  evaluateDeepDiveBudgetGuard,
  runDeepDiveModules,
  type DeepDiveEnrichResponsePayload,
} from '../src/utils/deepDiveEngine.ts';

function makeTempSqlitePath(prefix: string): { dir: string; dbPath: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `siampick-budget-${prefix}-`));
  return { dir, dbPath: path.join(dir, 'budget.sqlite') };
}

function cleanupTempDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors on temp dirs
  }
}

function makeProduct(opts: {
  id: string;
  withProductDetail?: boolean;
  withReviewInsight?: boolean;
}): ResearchProduct {
  const numericId = opts.id.replace(/^(kalodata-th-|kd[_-])/i, '');
  return {
    id: opts.id,
    name: `Thai Collagen Serum ${numericId}`,
    nameMy: `ထိုင်း Collagen Serum ${numericId}`,
    brand: 'SiamBrand',
    category: 'cosmetics-beauty',
    subCategory: 'Skincare',
    subCategoryMy: 'အသားအရေထိန်းသိမ်းမှု',
    shopName: 'Bangkok Glow Official',
    dispatchHub: 'Bangkok, Thailand',
    priceThb: 299,
    priceStatus: 'verified',
    commissionRate: 14,
    commissionVerified: true,
    commissionStatus: 'verified',
    estimatedCommissionPerSaleThb: 42,
    commissionNoteEn: '14% verified',
    commissionNoteMy: '14% တရားဝင်',
    imageSourceNoteEn: 'Kalodata product image',
    imageSourceNoteMy: 'Kalodata ပုံ',
    demandEvidenceEn: ['1200 units'],
    demandEvidenceMy: ['1200 ခု'],
    demandStatus: 'verified',
    competitionLevel: 'Moderate',
    competitionDetailEn: '28 creators',
    competitionDetailMy: 'Creator 28 ဦး',
    competitionStatus: 'verified',
    customerRating: null,
    reviewCount: null,
    reviewCountStatus: 'unavailable',
    customerRatingStatus: 'unavailable',
    reviewStrengthsEn: [],
    reviewStrengthsMy: [],
    customerComplaintsEn: [],
    customerComplaintsMy: [],
    demandLevel: 'High',
    aiVideoSuitability: 'High',
    aiVideoDetailEn: 'Strong visual fit',
    aiVideoDetailMy: 'AI ဗီဒီယို သင့်တော်',
    sellerReliabilityLevel: 'Reliable',
    sellerReliabilityEn: 'Verified Thailand shop',
    sellerReliabilityMy: 'တရားဝင် ထိုင်းဆိုင်',
    whyChooseEn: 'Strong verified demand',
    whyChooseMy: 'ဝယ်လိုအား ကောင်းမွန်',
    salesPotentialEn: 'Consistent Thailand TikTok Shop sales.',
    salesPotentialMy: 'ထိုင်း TikTok Shop ရောင်းအားတည်ငြိမ်သည်။',
    confidenceLevel: 'High',
    confidenceDetailEn: 'Kalodata verified metrics',
    confidenceDetailMy: 'Kalodata တကယ့်ဒေတာ',
    scoringInputs: {
      demandSales: { rawStrength: 80, verification: 'verified', evidenceEn: '1200', evidenceMy: '၁၂၀၀' },
      commissionEarning: { rawStrength: 75, verification: 'verified', evidenceEn: '14%', evidenceMy: '14%' },
      aiCreative: { rawStrength: 82, verification: 'estimated', evidenceEn: 'Fit', evidenceMy: 'သင့်တော်' },
      reviewsQuality: { rawStrength: 50, verification: 'unavailable', evidenceEn: 'None', evidenceMy: 'မရှိ' },
      priceAppeal: { rawStrength: 78, verification: 'verified', evidenceEn: '฿299', evidenceMy: '฿299' },
      competitionOpportunity: {
        rawStrength: 70,
        verification: opts.withProductDetail === true ? 'verified' : 'unavailable',
        evidenceEn: 'Creators',
        evidenceMy: 'Creators',
      },
      sellerReliability: { rawStrength: 80, verification: 'verified', evidenceEn: 'TH shop', evidenceMy: 'TH ဆိုင်' },
    },
    opportunityScore: 82,
    generalRisksEn: ['Packaging variance'],
    generalRisksMy: ['ထုပ်ပိုးမှု ကွာနိုင်'],
    missingDataEn: [],
    missingDataMy: [],
    imageUrl: 'https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/sample.webp',
    imageVerified: true,
    sources: [],
    videoIdeas: [
      {
        titleEn: 'Texture demo',
        titleMy: 'အသုံးပြုပုံပြသခြင်း',
        formatEn: '15s Demo',
        formatMy: '၁၅ စက္ကန့်',
        outlineEn: 'Quick application demo.',
        outlineMy: 'အသုံးပြုပုံတိုတိုပြသခြင်း။',
      },
      {
        titleEn: 'Ingredient closeup',
        titleMy: 'ပါဝင်ပစ္စည်းပြသခြင်း',
        formatEn: '20s Detail',
        formatMy: '၂၀ စက္ကန့်',
        outlineEn: 'Highlight collagen texture.',
        outlineMy: 'Collagen အသားပြသခြင်း။',
      },
      {
        titleEn: 'Price value pitch',
        titleMy: 'တန်ဖိုးနှင့်ဈေးနှုန်း',
        formatEn: '15s Offer',
        formatMy: '၁၅ စက္ကန့်',
        outlineEn: 'Highlight daily routine value.',
        outlineMy: 'နေ့စဉ်သုံး တန်ဖိုးပြသခြင်း။',
      },
    ],
    researchMode: 'fast',
    kalodataMetrics: {
      productId: numericId,
      dateRange: 'last30Day',
      unitPriceThb: 299,
      salesVolume: 1200,
      revenueThb: 358800,
      revenueGrowthRate: 24,
      commissionRatePct: 14,
      creatorNumber: opts.withProductDetail === true ? 28 : null,
      videoNumber: opts.withProductDetail === true ? 42 : null,
      videoRevenueThb: opts.withProductDetail === true ? 210000 : null,
      liveRevenueThb: 90000,
      showcaseRevenueThb: 40000,
      shoppingMallRevenueThb: 18800,
      launchDate: null,
      sellerId: '749001234567890',
      sellerName: 'Bangkok Glow Official',
      skuCount: opts.withProductDetail === true ? 3 : null,
      priCategory: null,
      secCategory: null,
      terCategory: null,
      categoryIdsRequested: ['601450'],
      detailEnriched: opts.withProductDetail === true,
      shopEnriched: false,
      reviewInsightEnriched: opts.withReviewInsight === true,
    },
  };
}

function makeKalodataSuccessResponse(url: string, balanceRef: { value: number }): Response {
  if (url.includes('/account/balance') || url.includes('/credit/balance') || url.includes('/balance')) {
    return new Response(
      JSON.stringify({
        success: true,
        data: { balance: balanceRef.value },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
  if (url.includes('/tiktok/product/detail')) {
    balanceRef.value = Math.round((balanceRef.value - 0.1) * 1000) / 1000;
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          id: '1739300099001',
          product_title: 'Thai Collagen Serum 30ml',
          shop_id: '749001234567890',
          sku_count: 3,
          comment_count: 420,
          creator_num: 28,
          video_num: 42,
          video_revenue: 210000,
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
  if (url.includes('/tiktok/product/comment/insight')) {
    balanceRef.value = Math.round((balanceRef.value - 1.0) * 1000) / 1000;
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          summary: 'Fast absorbing serum with positive feedback.',
          positive_points: ['Absorbs quickly', 'Nice scent'],
          negative_points: ['Small bottle'],
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
  return new Response(JSON.stringify({ success: false, message: 'Not found' }), { status: 404 });
}

/**
 * In-process atomic mock of Upstash / Vercel KV REST API executing the exact
 * single-threaded Redis Lua script contract used by PersistentBudgetLedger.
 */
function createMockUpstashServer() {
  const scopes = new Map<
    string,
    {
      spent: number;
      uncertain: number;
      configuredLimit: number | null;
      updatedAt: number;
    }
  >();
  const activeSets = new Map<string, Set<string>>();
  const reservations = new Map<
    string,
    {
      id: string;
      scopeKey: string;
      idempotencyKey: string;
      runId: string;
      operation: string;
      reservedCredits: number;
      settledCredits: number;
      status: string;
      upstreamDispatched: boolean;
      createdAt: number;
      updatedAt: number;
      expiresAt: number;
      note: string;
    }
  >();
  const idemMap = new Map<string, string>();
  let failMode: 'none' | 'http500' | 'network' = 'none';

  const round3 = (n: number) => Math.round(n * 1000) / 1000;

  const reconcile = (scopeRedisKey: string, activeSetKey: string, resPrefix: string, nowMs: number) => {
    const scope = scopes.get(scopeRedisKey) ?? {
      spent: 0,
      uncertain: 0,
      configuredLimit: null,
      updatedAt: nowMs,
    };
    scopes.set(scopeRedisKey, scope);
    const active = activeSets.get(activeSetKey) ?? new Set<string>();
    activeSets.set(activeSetKey, active);

    let activeSum = 0;
    for (const rid of Array.from(active)) {
      const rec = reservations.get(`${resPrefix}${rid}`);
      if (!rec || rec.status !== 'reserved') {
        active.delete(rid);
        continue;
      }
      if (rec.expiresAt <= nowMs) {
        if (rec.upstreamDispatched) {
          rec.status = 'uncertain';
          rec.settledCredits = rec.reservedCredits;
          rec.updatedAt = nowMs;
          rec.note = 'lease-expired-after-dispatch';
          scope.uncertain = round3(scope.uncertain + rec.reservedCredits);
        } else {
          rec.status = 'expired_released';
          rec.settledCredits = 0;
          rec.updatedAt = nowMs;
          rec.note = 'lease-expired-before-dispatch';
        }
        active.delete(rid);
      } else {
        activeSum = round3(activeSum + rec.reservedCredits);
      }
    }
    return { scope, active, activeSum };
  };

  const fetchFn: typeof fetch = async (_input, init) => {
    if (failMode === 'network') {
      throw new TypeError('Simulated Upstash network outage');
    }
    if (failMode === 'http500') {
      return new Response(JSON.stringify({ error: 'Redis backend down' }), { status: 500 });
    }

    const command = JSON.parse(String(init?.body ?? '[]')) as (string | number)[];
    assert.equal(command[0], 'EVAL');
    const script = String(command[1]);
    const numKeys = Number(command[2]);
    const keys = command.slice(3, 3 + numKeys).map(String);
    const argv = command.slice(3 + numKeys).map(String);

    if (script.includes('IDEMPOTENCY_IN_PROGRESS')) {
      const [scopeRedisKey, activeSetKey, idemRedisKey] = keys;
      const [
        resPrefix,
        nowMsStr,
        reserveCreditsStr,
        requestedLimitStr,
        hardCapStr,
        defaultLimitStr,
        reservationId,
        runId,
        operation,
        expiresAtStr,
        _ttlStr,
        idempotencyKey,
      ] = argv;
      const nowMs = Number(nowMsStr);
      const reserveCredits = round3(Number(reserveCreditsStr));
      const requestedLimitRaw = round3(Number(requestedLimitStr));
      const hardCap = round3(Number(hardCapStr));
      const defaultLimit = round3(Number(defaultLimitStr));

      const { scope, active, activeSum } = reconcile(scopeRedisKey, activeSetKey, resPrefix, nowMs);
      const existingId = idemMap.get(idemRedisKey);
      if (existingId) {
        const ex = reservations.get(`${resPrefix}${existingId}`);
        if (ex) {
          if (ex.status === 'reserved') {
            return new Response(
              JSON.stringify({
                result: [
                  'IDEMPOTENCY_IN_PROGRESS',
                  ex.id,
                  String(scope.spent),
                  String(scope.uncertain),
                  String(activeSum),
                  scope.configuredLimit === null ? '' : String(scope.configuredLimit),
                  ex.status,
                  String(ex.reservedCredits),
                  String(ex.settledCredits),
                  ex.upstreamDispatched ? '1' : '0',
                ],
              }),
              { status: 200 }
            );
          }
          if (ex.status === 'settled' || ex.status === 'uncertain') {
            return new Response(
              JSON.stringify({
                result: [
                  'IDEMPOTENCY_ALREADY_SETTLED',
                  ex.id,
                  String(scope.spent),
                  String(scope.uncertain),
                  String(activeSum),
                  scope.configuredLimit === null ? '' : String(scope.configuredLimit),
                  ex.status,
                  String(ex.reservedCredits),
                  String(ex.settledCredits),
                  ex.upstreamDispatched ? '1' : '0',
                ],
              }),
              { status: 200 }
            );
          }
        }
      }

      const requestedLimit = requestedLimitRaw > 0 ? requestedLimitRaw : defaultLimit;
      const effectiveLimit =
        scope.configuredLimit !== null
          ? Math.min(scope.configuredLimit, hardCap, requestedLimit)
          : Math.min(requestedLimit, hardCap);
      const committed = round3(scope.spent + scope.uncertain + activeSum);
      if (committed + reserveCredits > effectiveLimit + 1e-6) {
        return new Response(
          JSON.stringify({
            result: [
              'SPENDING_LIMIT_EXCEEDED',
              '',
              String(scope.spent),
              String(scope.uncertain),
              String(activeSum),
              scope.configuredLimit === null ? '' : String(scope.configuredLimit),
            ],
          }),
          { status: 200 }
        );
      }

      reservations.set(`${resPrefix}${reservationId}`, {
        id: reservationId,
        scopeKey: scopeRedisKey,
        idempotencyKey,
        runId,
        operation,
        reservedCredits: reserveCredits,
        settledCredits: 0,
        status: 'reserved',
        upstreamDispatched: false,
        createdAt: nowMs,
        updatedAt: nowMs,
        expiresAt: Number(expiresAtStr),
        note: '',
      });
      active.add(reservationId);
      idemMap.set(idemRedisKey, reservationId);
      const nextActive = round3(activeSum + reserveCredits);
      return new Response(
        JSON.stringify({
          result: [
            'OK',
            reservationId,
            String(scope.spent),
            String(scope.uncertain),
            String(nextActive),
            scope.configuredLimit === null ? '' : String(scope.configuredLimit),
          ],
        }),
        { status: 200 }
      );
    }

    if (script.includes('configured_limit') && keys.length === 2 && argv.length === 4) {
      const [scopeRedisKey, activeSetKey] = keys;
      const [resPrefix, nowMsStr, limitStr] = argv;
      const nowMs = Number(nowMsStr);
      const { scope, activeSum } = reconcile(scopeRedisKey, activeSetKey, resPrefix, nowMs);
      scope.configuredLimit = round3(Number(limitStr));
      scope.updatedAt = nowMs;
      return new Response(
        JSON.stringify({
          result: [
            String(scope.spent),
            String(scope.uncertain),
            String(activeSum),
            String(scope.configuredLimit),
          ],
        }),
        { status: 200 }
      );
    }

    if (keys.length === 2 && argv.length === 2) {
      const [scopeRedisKey, activeSetKey] = keys;
      const [resPrefix, nowMsStr] = argv;
      const { scope, activeSum } = reconcile(scopeRedisKey, activeSetKey, resPrefix, Number(nowMsStr));
      return new Response(
        JSON.stringify({
          result: [
            String(scope.spent),
            String(scope.uncertain),
            String(activeSum),
            scope.configuredLimit === null ? '' : String(scope.configuredLimit),
          ],
        }),
        { status: 200 }
      );
    }

    if (script.includes('upstream_dispatched') && keys.length === 1) {
      const [resKey] = keys;
      const rec = reservations.get(resKey);
      if (rec && rec.status === 'reserved') {
        rec.upstreamDispatched = true;
        rec.updatedAt = Number(argv[0]);
      }
      return new Response(JSON.stringify({ result: 1 }), { status: 200 });
    }

    if (script.includes("status', 'settled'")) {
      const [scopeRedisKey, activeSetKey, resKey] = keys;
      const [resPrefix, resId, actualStr, nowMsStr, note] = argv;
      const nowMs = Number(nowMsStr);
      const rec = reservations.get(resKey);
      const scope = scopes.get(scopeRedisKey) ?? {
        spent: 0,
        uncertain: 0,
        configuredLimit: null,
        updatedAt: nowMs,
      };
      scopes.set(scopeRedisKey, scope);
      if (rec && rec.status === 'reserved') {
        const actual = round3(Number(actualStr));
        rec.status = 'settled';
        rec.settledCredits = actual;
        rec.updatedAt = nowMs;
        rec.note = note;
        activeSets.get(activeSetKey)?.delete(resId);
        scope.spent = round3(scope.spent + actual);
      }
      const { activeSum } = reconcile(scopeRedisKey, activeSetKey, resPrefix, nowMs);
      return new Response(
        JSON.stringify({
          result: [
            String(scope.spent),
            String(scope.uncertain),
            String(activeSum),
            scope.configuredLimit === null ? '' : String(scope.configuredLimit),
          ],
        }),
        { status: 200 }
      );
    }

    if (script.includes('HELD_UNCERTAIN')) {
      const [scopeRedisKey, activeSetKey, resKey] = keys;
      const [resPrefix, resId, verifiedZeroStr, nowMsStr, note] = argv;
      const nowMs = Number(nowMsStr);
      const rec = reservations.get(resKey);
      const scope = scopes.get(scopeRedisKey) ?? {
        spent: 0,
        uncertain: 0,
        configuredLimit: null,
        updatedAt: nowMs,
      };
      scopes.set(scopeRedisKey, scope);
      let outcome = 'NOOP';
      if (rec && rec.status === 'reserved') {
        if (rec.upstreamDispatched && verifiedZeroStr !== '1') {
          rec.status = 'uncertain';
          rec.settledCredits = rec.reservedCredits;
          rec.updatedAt = nowMs;
          rec.note = `refused-unverified-release:${note}`;
          scope.uncertain = round3(scope.uncertain + rec.reservedCredits);
          outcome = 'HELD_UNCERTAIN';
        } else {
          rec.status = 'released';
          rec.settledCredits = 0;
          rec.updatedAt = nowMs;
          rec.note = note;
          outcome = 'RELEASED';
        }
        activeSets.get(activeSetKey)?.delete(resId);
      }
      const { activeSum } = reconcile(scopeRedisKey, activeSetKey, resPrefix, nowMs);
      return new Response(
        JSON.stringify({
          result: [
            outcome,
            String(scope.spent),
            String(scope.uncertain),
            String(activeSum),
            scope.configuredLimit === null ? '' : String(scope.configuredLimit),
          ],
        }),
        { status: 200 }
      );
    }

    const [scopeRedisKey, activeSetKey, resKey] = keys;
    const [resPrefix, resId, nowMsStr, note] = argv;
    const nowMs = Number(nowMsStr);
    const rec = reservations.get(resKey);
    const scope = scopes.get(scopeRedisKey) ?? {
      spent: 0,
      uncertain: 0,
      configuredLimit: null,
      updatedAt: nowMs,
    };
    scopes.set(scopeRedisKey, scope);
    if (rec && rec.status === 'reserved') {
      rec.status = 'uncertain';
      rec.settledCredits = rec.reservedCredits;
      rec.updatedAt = nowMs;
      rec.note = note;
      scope.uncertain = round3(scope.uncertain + rec.reservedCredits);
      activeSets.get(activeSetKey)?.delete(resId);
    }
    const { activeSum } = reconcile(scopeRedisKey, activeSetKey, resPrefix, nowMs);
    return new Response(
      JSON.stringify({
        result: [
          String(scope.spent),
          String(scope.uncertain),
          String(activeSum),
          scope.configuredLimit === null ? '' : String(scope.configuredLimit),
        ],
      }),
      { status: 200 }
    );
  };

  return {
    fetchFn,
    setFailMode(mode: 'none' | 'http500' | 'network') {
      failMode = mode;
    },
  };
}

// ============================================================================
// TEST 1: Multi-Instance Concurrency (SQLite WAL ACID Transactions)
// ============================================================================
test('Phase 9.3.1.1: Multi-instance concurrent reservations on shared SQLite WAL NEVER exceed Spending Limit', async () => {
  const { dir, dbPath } = makeTempSqlitePath('multi-inst-sqlite');
  const instA = createBudgetLedger({ sqlitePath: dbPath });
  const instB = createBudgetLedger({ sqlitePath: dbPath });
  const scopeKey = 'acct:testscope0001:day-2026-11-21';

  try {
    await instA.setConfiguredSpendingLimit(scopeKey, 0.3);

    const attempts = await Promise.all([
      instA.atomicReserveBudget({
        scopeKey,
        idempotencyKey: 'race-1',
        operation: 'productDetail',
        reserveCredits: 0.1,
        requestedLimitCredits: 0.3,
      }),
      instB.atomicReserveBudget({
        scopeKey,
        idempotencyKey: 'race-2',
        operation: 'productDetail',
        reserveCredits: 0.1,
        requestedLimitCredits: 0.3,
      }),
      instA.atomicReserveBudget({
        scopeKey,
        idempotencyKey: 'race-3',
        operation: 'productDetail',
        reserveCredits: 0.1,
        requestedLimitCredits: 0.3,
      }),
      instB.atomicReserveBudget({
        scopeKey,
        idempotencyKey: 'race-4',
        operation: 'productDetail',
        reserveCredits: 0.1,
        requestedLimitCredits: 0.3,
      }),
      instA.atomicReserveBudget({
        scopeKey,
        idempotencyKey: 'race-5',
        operation: 'productDetail',
        reserveCredits: 0.1,
        requestedLimitCredits: 0.3,
      }),
      instB.atomicReserveBudget({
        scopeKey,
        idempotencyKey: 'race-6',
        operation: 'productDetail',
        reserveCredits: 0.1,
        requestedLimitCredits: 0.3,
      }),
    ]);

    const accepted = attempts.filter((r) => r.ok);
    const rejected = attempts.filter((r) => !r.ok);
    assert.equal(accepted.length, 3, 'Exactly 3 of 6 concurrent 0.1 cr reservations may succeed under 0.3 cr limit');
    assert.equal(rejected.length, 3, 'Exactly 3 reservations must be rejected');
    for (const rej of rejected) {
      assert.equal(rej.ok, false);
      if (!rej.ok) assert.equal(rej.reason, 'SPENDING_LIMIT_EXCEEDED');
    }

    const snapA = await instA.getScopeSnapshot(scopeKey);
    const snapB = await instB.getScopeSnapshot(scopeKey);
    assert.equal(snapA.totalCommittedCredits, 0.3);
    assert.equal(snapB.totalCommittedCredits, 0.3);
    assert.equal(snapB.remainingCredits, 0);
  } finally {
    instA.close();
    instB.close();
    cleanupTempDir(dir);
  }
});

// ============================================================================
// TEST 2: Multi-Instance Concurrency & Fail-Closed on Upstash / Vercel KV REST Lua
// ============================================================================
test('Phase 9.3.1.2: Upstash/Vercel KV REST Lua backend enforces cross-instance atomic limit and fails closed on outage', async () => {
  const mockUpstash = createMockUpstashServer();
  const instA = createBudgetLedger({
    upstashRestUrl: 'https://mock-upstash.example.test',
    upstashRestToken: 'mock-bearer-token',
    requireDistributedStore: true,
    fetchFn: mockUpstash.fetchFn,
  });
  const instB = createBudgetLedger({
    upstashRestUrl: 'https://mock-upstash.example.test',
    upstashRestToken: 'mock-bearer-token',
    requireDistributedStore: true,
    fetchFn: mockUpstash.fetchFn,
  });
  const scopeKey = 'acct:upstashscope1:day-2026-11-21';

  const initSnap = await instA.setConfiguredSpendingLimit(scopeKey, 0.2);
  assert.equal(initSnap.backend, 'upstash-rest');

  const results = await Promise.all([
    instA.atomicReserveBudget({
      scopeKey,
      idempotencyKey: 'kv-race-1',
      operation: 'productDetail',
      reserveCredits: 0.1,
      requestedLimitCredits: 0.2,
    }),
    instB.atomicReserveBudget({
      scopeKey,
      idempotencyKey: 'kv-race-2',
      operation: 'productDetail',
      reserveCredits: 0.1,
      requestedLimitCredits: 0.2,
    }),
    instA.atomicReserveBudget({
      scopeKey,
      idempotencyKey: 'kv-race-3',
      operation: 'productDetail',
      reserveCredits: 0.1,
      requestedLimitCredits: 0.2,
    }),
    instB.atomicReserveBudget({
      scopeKey,
      idempotencyKey: 'kv-race-4',
      operation: 'productDetail',
      reserveCredits: 0.1,
      requestedLimitCredits: 0.2,
    }),
  ]);

  assert.equal(results.filter((r) => r.ok).length, 2);
  assert.equal(results.filter((r) => !r.ok).length, 2);
  const snap = await instB.getScopeSnapshot(scopeKey);
  assert.equal(snap.totalCommittedCredits, 0.2);
  assert.equal(snap.remainingCredits, 0);

  // Simulate Upstash outage (HTTP 500 & network error) -> MUST fail closed (503) with zero in-memory fallback
  mockUpstash.setFailMode('http500');
  await assert.rejects(
    () =>
      instA.atomicReserveBudget({
        scopeKey,
        idempotencyKey: 'kv-outage-500',
        operation: 'productDetail',
        reserveCredits: 0.1,
        requestedLimitCredits: 5,
      }),
    (err: unknown) =>
      err instanceof BudgetStorageUnavailableError &&
      err.status === 503 &&
      err.code === 'BUDGET_STORAGE_UNAVAILABLE'
  );

  mockUpstash.setFailMode('network');
  await assert.rejects(
    () => instB.getScopeSnapshot(scopeKey),
    (err: unknown) =>
      err instanceof BudgetStorageUnavailableError &&
      err.status === 503 &&
      err.code === 'BUDGET_STORAGE_UNAVAILABLE'
  );
});

// ============================================================================
// TEST 3: Forged Client sessionCreditsAlreadySpent Is Strictly Ignored by Server
// ============================================================================
test('Phase 9.3.1.3: Server strictly ignores forged client sessionCreditsAlreadySpent and blocks over-limit calls', async () => {
  const { dir, dbPath } = makeTempSqlitePath('forged-client-spend');
  const ledger = createBudgetLedger({ sqlitePath: dbPath });
  const scopeKey = 'acct:forgedspend01:day-2026-11-21';
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.KALODATA_API_KEY;
  const balanceRef = { value: 100 };
  let upstreamPaidCalls = 0;

  try {
    process.env.KALODATA_API_KEY = 'test-key-phase931';
    clearServerEnrichmentCache();

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/product/detail') || url.includes('/comment/insight')) {
        upstreamPaidCalls += 1;
      }
      return makeKalodataSuccessResponse(url, balanceRef);
    }) as typeof fetch;

    await ledger.setConfiguredSpendingLimit(scopeKey, 0.5);
    const pre = await ledger.atomicReserveBudget({
      scopeKey,
      idempotencyKey: 'prior-legit-spend',
      operation: 'productDetail',
      reserveCredits: 0.4,
      requestedLimitCredits: 0.5,
    });
    assert.equal(pre.ok, true);
    if (pre.ok) {
      await ledger.markReservationDispatched(scopeKey, pre.reservationId);
      await ledger.settleReservation({
        scopeKey,
        reservationId: pre.reservationId,
        actualCredits: 0.4,
      });
    }

    for (const forgedSpend of [0, -99]) {
      await assert.rejects(
        () =>
          enrichSingleProduct({
            product: makeProduct({ id: `kalodata-th-17393000991${Math.abs(forgedSpend)}` }),
            requestedLayers: { productDetail: false, shopDetail: false, reviewInsights: true },
            spendingLimitCredits: 0.5,
            sessionCreditsAlreadySpent: forgedSpend,
            runId: `forged-run-${forgedSpend}`,
            requireExplicitConfirmation: true,
            userConfirmedPaidExecution: true,
            budgetLedger: ledger,
            budgetScopeKey: scopeKey,
          }),
        (err: unknown) =>
          err instanceof EnrichmentApiError &&
          err.status === 400 &&
          err.code === 'SPENDING_LIMIT_EXCEEDED'
      );
    }

    assert.equal(upstreamPaidCalls, 0, 'Forged client spend MUST NEVER trigger upstream Kalodata calls');

    const serverCode = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
    const enrichCode = fs.readFileSync(
      path.resolve(process.cwd(), 'server/enrichmentService.ts'),
      'utf8'
    );
    assert.equal(serverCode.includes('runBudgetLedger'), false, 'server.ts must not contain in-memory runBudgetLedger');
    assert.equal(enrichCode.includes('runBudgetLedger'), false, 'enrichmentService.ts must not contain in-memory runBudgetLedger');
    assert.equal(
      /sessionCreditsAlreadySpent\s*:\s*body\./.test(serverCode),
      false,
      'server.ts must NOT forward body.sessionCreditsAlreadySpent into enrichSingleProduct'
    );

    const viewCode = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/DeepDiveWorkspaceView.tsx'),
      'utf8'
    );
    assert.equal(viewCode.includes('fetch('), false, 'DeepDiveWorkspaceView must not call fetch()');
    assert.equal(viewCode.includes('/api/'), false, 'DeepDiveWorkspaceView must not contain /api/');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.KALODATA_API_KEY;
    else process.env.KALODATA_API_KEY = originalKey;
    ledger.close();
    cleanupTempDir(dir);
  }
});

// ============================================================================
// TEST 4: New runId Bypass & Forged Higher spendingLimitCredits Blocked
// ============================================================================
test('Phase 9.3.1.4: Attacker cannot bypass Spending Limit by generating a new runId or forging a higher spendingLimitCredits', async () => {
  const { dir, dbPath } = makeTempSqlitePath('runid-bypass');
  const ledger = createBudgetLedger({ sqlitePath: dbPath });
  const scopeKey = 'acct:runidbypass01:day-2026-11-21';
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.KALODATA_API_KEY;
  const balanceRef = { value: 50 };
  let upstreamPaidCalls = 0;

  try {
    process.env.KALODATA_API_KEY = 'test-key-runid';
    clearServerEnrichmentCache();

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/product/detail')) upstreamPaidCalls += 1;
      return makeKalodataSuccessResponse(url, balanceRef);
    }) as typeof fetch;

    await ledger.setConfiguredSpendingLimit(scopeKey, 0.3);

    for (let i = 1; i <= 3; i += 1) {
      const res = await enrichSingleProduct({
        product: makeProduct({
          id: `kalodata-th-173930008800${i}`,
          withProductDetail: false,
        }),
        requestedLayers: { productDetail: true, shopDetail: false, reviewInsights: false },
        spendingLimitCredits: 0.3,
        runId: `legit-run-${i}`,
        requireExplicitConfirmation: true,
        userConfirmedPaidExecution: true,
        budgetLedger: ledger,
        budgetScopeKey: scopeKey,
      });
      assert.equal(res.ok, true);
      assert.equal(res.budgetSnapshot?.spentCredits, Math.round(i * 0.1 * 1000) / 1000);
    }
    assert.equal(upstreamPaidCalls, 3);

    // Attempt 1: Brand-new runId attempting another 0.1 cr call -> BLOCKED
    await assert.rejects(
      () =>
        enrichSingleProduct({
          product: makeProduct({
            id: 'kalodata-th-1739300088004',
            withProductDetail: false,
          }),
          requestedLayers: { productDetail: true, shopDetail: false, reviewInsights: false },
          spendingLimitCredits: 0.3,
          runId: 'brand-new-bypass-run-999',
          requireExplicitConfirmation: true,
          userConfirmedPaidExecution: true,
          budgetLedger: ledger,
          budgetScopeKey: scopeKey,
        }),
      (err: unknown) => err instanceof EnrichmentApiError && err.code === 'SPENDING_LIMIT_EXCEEDED'
    );

    // Attempt 2: Attacker forges spendingLimitCredits: 50 in request body (server has 0.3 persisted!) -> BLOCKED
    await assert.rejects(
      () =>
        enrichSingleProduct({
          product: makeProduct({
            id: 'kalodata-th-1739300088005',
            withProductDetail: false,
          }),
          requestedLayers: { productDetail: true, shopDetail: false, reviewInsights: false },
          spendingLimitCredits: 50,
          runId: 'brand-new-forged-limit-run',
          requireExplicitConfirmation: true,
          userConfirmedPaidExecution: true,
          budgetLedger: ledger,
          budgetScopeKey: scopeKey,
        }),
      (err: unknown) => err instanceof EnrichmentApiError && err.code === 'SPENDING_LIMIT_EXCEEDED'
    );

    assert.equal(upstreamPaidCalls, 3, 'Neither new runId nor forged higher limit may trigger upstream calls');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.KALODATA_API_KEY;
    else process.env.KALODATA_API_KEY = originalKey;
    ledger.close();
    cleanupTempDir(dir);
  }
});

// ============================================================================
// TEST 5: Server Restart Recovery & Crash Lease Reconciliation
// ============================================================================
test('Phase 9.3.1.5: Restart recovers settled/active reservations; expired dispatched crash becomes uncertain (never released), un-dispatched releases cleanly', async () => {
  const { dir, dbPath } = makeTempSqlitePath('restart-recovery');
  const scopeDispatched = 'acct:restart01:day-2026-11-21';
  const scopeUndispatched = 'acct:restart02:day-2026-11-21';
  const t0 = 1_763_700_000_000;

  let inst1: PersistentBudgetLedger | null = null;
  let inst2: PersistentBudgetLedger | null = null;

  try {
    inst1 = createBudgetLedger({ sqlitePath: dbPath, nowMsFn: () => t0 });
    await inst1.setConfiguredSpendingLimit(scopeDispatched, 0.5);

    const settledRes = await inst1.atomicReserveBudget({
      scopeKey: scopeDispatched,
      idempotencyKey: 'restart-settled-1',
      operation: 'productDetail',
      reserveCredits: 0.3,
      requestedLimitCredits: 0.5,
      nowMs: t0,
    });
    assert.equal(settledRes.ok, true);
    if (settledRes.ok) {
      await inst1.markReservationDispatched(scopeDispatched, settledRes.reservationId, t0);
      await inst1.settleReservation({
        scopeKey: scopeDispatched,
        reservationId: settledRes.reservationId,
        actualCredits: 0.3,
        nowMs: t0 + 100,
      });
    }

    const crashedDispatched = await inst1.atomicReserveBudget({
      scopeKey: scopeDispatched,
      idempotencyKey: 'restart-crashed-dispatched',
      operation: 'productDetail',
      reserveCredits: 0.2,
      requestedLimitCredits: 0.5,
      leaseMs: 30_000,
      nowMs: t0 + 200,
    });
    assert.equal(crashedDispatched.ok, true);
    if (crashedDispatched.ok) {
      await inst1.markReservationDispatched(scopeDispatched, crashedDispatched.reservationId, t0 + 250);
    }

    const crashedPreDispatch = await inst1.atomicReserveBudget({
      scopeKey: scopeUndispatched,
      idempotencyKey: 'restart-crashed-predispatch',
      operation: 'productDetail',
      reserveCredits: 0.1,
      requestedLimitCredits: 0.5,
      leaseMs: 30_000,
      nowMs: t0 + 200,
    });
    assert.equal(crashedPreDispatch.ok, true);

    inst1.close();
    inst1 = null;

    let mockClock = t0 + 5_000;
    inst2 = createBudgetLedger({ sqlitePath: dbPath, nowMsFn: () => mockClock });

    const snapBeforeExpiry = await inst2.getScopeSnapshot(scopeDispatched);
    assert.equal(snapBeforeExpiry.spentCredits, 0.3);
    assert.equal(snapBeforeExpiry.activeReservedCredits, 0.2);
    assert.equal(snapBeforeExpiry.totalCommittedCredits, 0.5);
    assert.equal(snapBeforeExpiry.remainingCredits, 0);

    mockClock = t0 + 60_000;

    const snapAfterExpiry = await inst2.getScopeSnapshot(scopeDispatched);
    assert.equal(snapAfterExpiry.spentCredits, 0.3);
    assert.equal(snapAfterExpiry.activeReservedCredits, 0);
    assert.equal(snapAfterExpiry.uncertainCredits, 0.2, 'Dispatched crash reservation MUST be held as uncertain');
    assert.equal(snapAfterExpiry.totalCommittedCredits, 0.5);
    assert.equal(snapAfterExpiry.remainingCredits, 0);

    const blockedAfterRestart = await inst2.atomicReserveBudget({
      scopeKey: scopeDispatched,
      idempotencyKey: 'post-restart-new-req',
      operation: 'productDetail',
      reserveCredits: 0.1,
      requestedLimitCredits: 0.5,
    });
    assert.equal(blockedAfterRestart.ok, false);
    if (!blockedAfterRestart.ok) {
      assert.equal(blockedAfterRestart.reason, 'SPENDING_LIMIT_EXCEEDED');
    }

    const snapUndispatched = await inst2.getScopeSnapshot(scopeUndispatched);
    assert.equal(snapUndispatched.activeReservedCredits, 0);
    assert.equal(snapUndispatched.uncertainCredits, 0);
    assert.equal(snapUndispatched.totalCommittedCredits, 0);
  } finally {
    inst1?.close();
    inst2?.close();
    cleanupTempDir(dir);
  }
});

// ============================================================================
// TEST 6: Duplicate / Replay Requests (Cross-Instance Idempotency)
// ============================================================================
test('Phase 9.3.1.6: Duplicate in-flight and replayed idempotency keys are blocked across instances (HTTP 409, 0 extra calls)', async () => {
  const { dir, dbPath } = makeTempSqlitePath('idempotency-replay');
  const instA = createBudgetLedger({ sqlitePath: dbPath });
  const instB = createBudgetLedger({ sqlitePath: dbPath });
  const scopeKey = 'acct:idemscope01:day-2026-11-21';
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.KALODATA_API_KEY;
  const balanceRef = { value: 50 };
  let upstreamPaidCalls = 0;

  try {
    process.env.KALODATA_API_KEY = 'test-key-idem';
    clearServerEnrichmentCache();

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/product/detail')) upstreamPaidCalls += 1;
      return makeKalodataSuccessResponse(url, balanceRef);
    }) as typeof fetch;

    const first = await instA.atomicReserveBudget({
      scopeKey,
      idempotencyKey: 'idem-cross-flight',
      operation: 'productDetail',
      reserveCredits: 0.1,
      requestedLimitCredits: 5,
    });
    assert.equal(first.ok, true);

    await assert.rejects(
      () =>
        enrichSingleProduct({
          product: makeProduct({
            id: 'kalodata-th-1739300077001',
            withProductDetail: false,
          }),
          requestedLayers: { productDetail: true, shopDetail: false, reviewInsights: false },
          spendingLimitCredits: 5,
          idempotencyKey: 'idem-cross-flight',
          requireExplicitConfirmation: true,
          userConfirmedPaidExecution: true,
          budgetLedger: instB,
          budgetScopeKey: scopeKey,
        }),
      (err: unknown) =>
        err instanceof EnrichmentApiError &&
        err.status === 409 &&
        err.code === 'IDEMPOTENCY_IN_PROGRESS'
    );
    assert.equal(upstreamPaidCalls, 0);

    if (first.ok) {
      await instA.markReservationDispatched(scopeKey, first.reservationId);
      await instA.settleReservation({
        scopeKey,
        reservationId: first.reservationId,
        actualCredits: 0.1,
      });
    }

    await assert.rejects(
      () =>
        enrichSingleProduct({
          product: makeProduct({
            id: 'kalodata-th-1739300077001',
            withProductDetail: false,
          }),
          requestedLayers: { productDetail: true, shopDetail: false, reviewInsights: false },
          spendingLimitCredits: 5,
          idempotencyKey: 'idem-cross-flight',
          forceRefresh: true,
          requireExplicitConfirmation: true,
          userConfirmedPaidExecution: true,
          budgetLedger: instB,
          budgetScopeKey: scopeKey,
        }),
      (err: unknown) =>
        err instanceof EnrichmentApiError &&
        err.status === 409 &&
        err.code === 'IDEMPOTENCY_ALREADY_SETTLED'
    );
    assert.equal(upstreamPaidCalls, 0, 'Replayed idempotency key MUST NOT trigger upstream API');
    const snap = await instB.getScopeSnapshot(scopeKey);
    assert.equal(snap.spentCredits, 0.1);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.KALODATA_API_KEY;
    else process.env.KALODATA_API_KEY = originalKey;
    instA.close();
    instB.close();
    cleanupTempDir(dir);
  }
});

// ============================================================================
// TEST 7: Reservation Lifecycle (Pre-Call Release, Verified-Zero Release, Timeout/5xx Uncertain Hold)
// ============================================================================
test('Phase 9.3.1.7: Pre-call & verified-zero release cleanly; timeout/5xx & unverified release hold credits as uncertain', async () => {
  const { dir, dbPath } = makeTempSqlitePath('lifecycle');
  const ledger = createBudgetLedger({ sqlitePath: dbPath });
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.KALODATA_API_KEY;

  try {
    process.env.KALODATA_API_KEY = 'test-key-lifecycle';
    clearServerEnrichmentCache();

    // 7A: Pre-call INSUFFICIENT_CREDITS abort -> released cleanly (0 cr committed)
    const scopePreAbort = 'acct:life-preabort:day-2026-11-21';
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/account/balance') || url.includes('/credit/balance') || url.includes('/balance')) {
        return new Response(JSON.stringify({ success: true, data: { balance: 0.05 } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error('Upstream paid endpoint must NOT be called when balance is insufficient');
    }) as typeof fetch;

    await assert.rejects(
      () =>
        enrichSingleProduct({
          product: makeProduct({
            id: 'kalodata-th-1739300066001',
            withProductDetail: false,
          }),
          requestedLayers: { productDetail: true, shopDetail: false, reviewInsights: false },
          spendingLimitCredits: 5,
          requireExplicitConfirmation: true,
          userConfirmedPaidExecution: true,
          budgetLedger: ledger,
          budgetScopeKey: scopePreAbort,
        }),
      (err: unknown) => err instanceof EnrichmentApiError && err.code === 'INSUFFICIENT_CREDITS'
    );
    const snapPreAbort = await ledger.getScopeSnapshot(scopePreAbort);
    assert.equal(snapPreAbort.totalCommittedCredits, 0, 'Pre-call abort must release reservation cleanly');

    // 7B: Deterministic HTTP 401 with verified balanceBefore === balanceAfter -> safely released (0 cr)
    const scope401 = 'acct:life-401:day-2026-11-21';
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/account/balance') || url.includes('/credit/balance') || url.includes('/balance')) {
        return new Response(JSON.stringify({ success: true, data: { balance: 20 } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ success: false, message: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    const res401 = await enrichSingleProduct({
      product: makeProduct({
        id: 'kalodata-th-1739300066002',
        withProductDetail: false,
      }),
      requestedLayers: { productDetail: true, shopDetail: false, reviewInsights: false },
      spendingLimitCredits: 5,
      requireExplicitConfirmation: true,
      userConfirmedPaidExecution: true,
      budgetLedger: ledger,
      budgetScopeKey: scope401,
    });
    assert.equal(res401.summary.layerResults.productDetail, 'failed');
    const snap401 = await ledger.getScopeSnapshot(scope401);
    assert.equal(snap401.totalCommittedCredits, 0, 'Verified 0-charge HTTP 401 must release cleanly');

    // 7C: Upstream Timeout / Network error -> MUST hold as UNCERTAIN (NEVER release!)
    const scopeTimeout = 'acct:life-timeout:day-2026-11-21';
    await ledger.setConfiguredSpendingLimit(scopeTimeout, 1.0);
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/account/balance') || url.includes('/credit/balance') || url.includes('/balance')) {
        return new Response(JSON.stringify({ success: true, data: { balance: 20 } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new TypeError('Simulated upstream socket timeout');
    }) as typeof fetch;

    const resTimeout = await enrichSingleProduct({
      product: makeProduct({
        id: 'kalodata-th-1739300066003',
        withReviewInsight: false,
      }),
      requestedLayers: { productDetail: false, shopDetail: false, reviewInsights: true },
      spendingLimitCredits: 1.0,
      requireExplicitConfirmation: true,
      userConfirmedPaidExecution: true,
      budgetLedger: ledger,
      budgetScopeKey: scopeTimeout,
    });
    assert.equal(resTimeout.summary.layerResults.reviewInsights, 'failed');
    const snapTimeout = await ledger.getScopeSnapshot(scopeTimeout);
    assert.equal(snapTimeout.uncertainCredits, 1.0, 'Timeout failure MUST hold 1.0 cr as uncertain');
    assert.equal(snapTimeout.totalCommittedCredits, 1.0);
    assert.equal(snapTimeout.remainingCredits, 0);

    await assert.rejects(
      () =>
        enrichSingleProduct({
          product: makeProduct({
            id: 'kalodata-th-1739300066004',
            withProductDetail: false,
          }),
          requestedLayers: { productDetail: true, shopDetail: false, reviewInsights: false },
          spendingLimitCredits: 1.0,
          requireExplicitConfirmation: true,
          userConfirmedPaidExecution: true,
          budgetLedger: ledger,
          budgetScopeKey: scopeTimeout,
        }),
      (err: unknown) => err instanceof EnrichmentApiError && err.code === 'SPENDING_LIMIT_EXCEEDED'
    );

    // 7D: Upstream HTTP 502 -> MUST hold as UNCERTAIN (NEVER release!)
    const scope502 = 'acct:life-502:day-2026-11-21';
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/account/balance') || url.includes('/credit/balance') || url.includes('/balance')) {
        return new Response(JSON.stringify({ success: true, data: { balance: 20 } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('Bad Gateway', { status: 502 });
    }) as typeof fetch;

    await enrichSingleProduct({
      product: makeProduct({
        id: 'kalodata-th-1739300066005',
        withProductDetail: false,
      }),
      requestedLayers: { productDetail: true, shopDetail: false, reviewInsights: false },
      spendingLimitCredits: 5,
      requireExplicitConfirmation: true,
      userConfirmedPaidExecution: true,
      budgetLedger: ledger,
      budgetScopeKey: scope502,
    });
    const snap502 = await ledger.getScopeSnapshot(scope502);
    assert.equal(snap502.uncertainCredits, 0.1, 'HTTP 502 MUST hold 0.1 cr as uncertain');

    // 7E: Defense-in-depth: releaseReservation on dispatched record WITHOUT verifiedZeroCharge MUST refuse release
    const scopeGuard = 'acct:life-guard:day-2026-11-21';
    const r = await ledger.atomicReserveBudget({
      scopeKey: scopeGuard,
      idempotencyKey: 'guard-dispatched-1',
      operation: 'reviewInsights',
      reserveCredits: 1.0,
      requestedLimitCredits: 5,
      leaseMs: DEFAULT_RESERVATION_LEASE_MS,
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      await ledger.markReservationDispatched(scopeGuard, r.reservationId);
      const releaseRes = await ledger.releaseReservation({
        scopeKey: scopeGuard,
        reservationId: r.reservationId,
        verifiedZeroCharge: false,
        reason: 'attempted-unsafe-release',
      });
      assert.equal(releaseRes.outcome, 'HELD_UNCERTAIN');
      assert.equal(releaseRes.snapshot.uncertainCredits, 1.0);
      assert.equal(releaseRes.snapshot.totalCommittedCredits, 1.0);
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.KALODATA_API_KEY;
    else process.env.KALODATA_API_KEY = originalKey;
    ledger.close();
    cleanupTempDir(dir);
  }
});

// ============================================================================
// TEST 8: Fail-Closed When Persistent Budget Storage Is Unavailable (Zero In-Memory Fallback)
// ============================================================================
test('Phase 9.3.1.8: Fails closed (HTTP 503 BUDGET_STORAGE_UNAVAILABLE) on serverless without Redis/KV, disabled store, or unwritable DB — 0 upstream calls', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.KALODATA_API_KEY;
  const originalVercel = process.env.VERCEL;
  const originalDisabled = process.env.SIAMPICK_BUDGET_STORE_DISABLED;
  const originalUpstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const originalUpstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const originalKvUrl = process.env.KV_REST_API_URL;
  const originalKvToken = process.env.KV_REST_API_TOKEN;
  let upstreamPaidCalls = 0;

  try {
    process.env.KALODATA_API_KEY = 'test-key-failclosed';
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    clearServerEnrichmentCache();

    globalThis.fetch = (async () => {
      upstreamPaidCalls += 1;
      throw new Error('Upstream Kalodata API must NEVER be called when budget storage is unavailable');
    }) as typeof fetch;

    // 8A: Multi-instance serverless (VERCEL=1) without Upstash/Vercel KV -> MUST throw 503
    process.env.VERCEL = '1';
    delete process.env.SIAMPICK_BUDGET_STORE_DISABLED;

    assert.throws(
      () => createBudgetLedger(),
      (err: unknown) =>
        err instanceof BudgetStorageUnavailableError &&
        err.status === 503 &&
        err.code === 'BUDGET_STORAGE_UNAVAILABLE'
    );

    await assert.rejects(
      () =>
        enrichSingleProduct({
          product: makeProduct({
            id: 'kalodata-th-1739300055001',
            withProductDetail: false,
          }),
          requestedLayers: { productDetail: true, shopDetail: false, reviewInsights: false },
          spendingLimitCredits: 5,
          requireExplicitConfirmation: true,
          userConfirmedPaidExecution: true,
        }),
      (err: unknown) =>
        err instanceof EnrichmentApiError &&
        err.status === 503 &&
        err.code === 'BUDGET_STORAGE_UNAVAILABLE'
    );

    // 8B: Explicitly disabled persistent budget storage -> MUST throw 503
    delete process.env.VERCEL;
    process.env.SIAMPICK_BUDGET_STORE_DISABLED = 'true';

    await assert.rejects(
      () =>
        enrichSingleProduct({
          product: makeProduct({
            id: 'kalodata-th-1739300055002',
            withProductDetail: false,
          }),
          requestedLayers: { productDetail: true, shopDetail: false, reviewInsights: false },
          spendingLimitCredits: 5,
          requireExplicitConfirmation: true,
          userConfirmedPaidExecution: true,
        }),
      (err: unknown) =>
        err instanceof EnrichmentApiError &&
        err.status === 503 &&
        err.code === 'BUDGET_STORAGE_UNAVAILABLE'
    );

    // 8C: Unwritable / invalid SQLite path (directory instead of file) -> MUST throw 503
    delete process.env.SIAMPICK_BUDGET_STORE_DISABLED;
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'siampick-badpath-'));
    try {
      assert.throws(
        () => createBudgetLedger({ sqlitePath: tempDir }),
        (err: unknown) =>
          err instanceof BudgetStorageUnavailableError &&
          err.status === 503 &&
          err.code === 'BUDGET_STORAGE_UNAVAILABLE'
      );
    } finally {
      cleanupTempDir(tempDir);
    }

    // 8D: Zero-cost already-enriched request succeeds even when budget storage is disabled (0 paid calls)
    process.env.SIAMPICK_BUDGET_STORE_DISABLED = 'true';
    const zeroCostRes = await enrichSingleProduct({
      product: makeProduct({
        id: 'kalodata-th-1739300055003',
        withProductDetail: true,
      }),
      requestedLayers: { productDetail: true, shopDetail: false, reviewInsights: false },
      spendingLimitCredits: 5,
      requireExplicitConfirmation: true,
      userConfirmedPaidExecution: false,
    });
    assert.equal(zeroCostRes.ok, true);
    assert.equal(zeroCostRes.summary.actualApiCalls, 0);
    assert.equal(upstreamPaidCalls, 0, 'Fail-closed MUST guarantee 0 upstream Kalodata calls');

    // 8E: Authoritative scope derivation is deterministic and does not leak raw API key
    const scope = resolveAuthoritativeBudgetScope({ nowMs: Date.UTC(2026, 10, 21) });
    assert.equal(scope.scopeKey.includes('test-key-failclosed'), false);
    assert.equal(scope.windowKey, 'day-2026-11-21');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.KALODATA_API_KEY;
    else process.env.KALODATA_API_KEY = originalKey;
    if (originalVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = originalVercel;
    if (originalDisabled === undefined) delete process.env.SIAMPICK_BUDGET_STORE_DISABLED;
    else process.env.SIAMPICK_BUDGET_STORE_DISABLED = originalDisabled;
    if (originalUpstashUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = originalUpstashUrl;
    if (originalUpstashToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = originalUpstashToken;
    if (originalKvUrl === undefined) delete process.env.KV_REST_API_URL;
    else process.env.KV_REST_API_URL = originalKvUrl;
    if (originalKvToken === undefined) delete process.env.KV_REST_API_TOKEN;
    else process.env.KV_REST_API_TOKEN = originalKvToken;
    clearServerEnrichmentCache();
  }
});

// ============================================================================
// TEST 9: End-to-End UI-to-Server Budget Enforcement (0.5 cr Limit vs 1.0 cr Review Insight)
// ============================================================================
test('Phase 9.3.1.9: UI-to-Server flow blocks 1.0 cr Review Insight under 0.5 cr limit with SPENDING_LIMIT_EXCEEDED, 0 Kalodata/Gemini calls, and accurate UI Error & Cost Summary', async () => {
  const { dir, dbPath } = makeTempSqlitePath('ui-to-server-flow');
  const ledger = createBudgetLedger({ sqlitePath: dbPath });
  const scopeKey = 'acct:uitoserver01:day-2026-11-21';
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.KALODATA_API_KEY;
  let kalodataCalls = 0;
  let geminiCalls = 0;

  try {
    process.env.KALODATA_API_KEY = 'test-key-uitoserver';
    clearServerEnrichmentCache();

    globalThis.fetch = (async () => {
      kalodataCalls += 1;
      throw new Error('Paid Kalodata API must NEVER be called when over Spending Limit');
    }) as typeof fetch;

    // Step 1: Persist Spending Limit = 0.5 cr on server (same as Deep Dive UI -> POST /api/budget/limit)
    const limitSnap = await ledger.setConfiguredSpendingLimit(scopeKey, 0.5);
    assert.equal(limitSnap.configuredLimitCredits, 0.5);
    assert.equal(limitSnap.effectiveLimitCredits, 0.5);

    const product = makeProduct({
      id: 'kalodata-th-1739300099888',
      withProductDetail: true,
      withReviewInsight: false,
    });

    // Step 2: Select Review Insight (1.0 cr) — verify UI Pre-Run Cost Estimate & Budget Guard
    const estimate = estimateDeepDiveExecutionCost(product, ['customer-review-intelligence'], {
      cacheSnapshot: { productDetail: null, shopDetail: null, reviewInsight: null },
    });
    assert.equal(estimate.estimatedCredits, 1.0);
    assert.equal(estimate.plannedKalodataApiCalls, 1);
    assert.equal(estimate.plannedGeminiCalls, 0);
    assert.equal(estimate.hasHighCostReviewInsight, true);

    const guard = evaluateDeepDiveBudgetGuard(estimate, {
      spendingLimitCredits: 0.5,
      sessionCreditsAlreadySpent: 0,
    });
    assert.equal(guard.exceedsSpendingLimit, true);
    assert.equal(guard.canProceedWithoutLimitChange, false);
    assert.equal(guard.remainingBudgetBeforeRun, 0.5);
    assert.equal(guard.recommendedMinimumLimit, 1.0);

    // Step 3A: Normal client-side guard blocks immediately with 0 calls
    const clientBlocked = await runDeepDiveModules({
      product,
      analysisIds: ['customer-review-intelligence'],
      spendingLimitCredits: 0.5,
      sessionCreditsAlreadySpent: 0,
      requireExplicitConfirmation: true,
      userConfirmedPaidExecution: true,
      deps: {
        getCacheFn: () => ({ productDetail: null, shopDetail: null, reviewInsight: null }),
        saveCacheFn: () => undefined,
        runAiStrategyFn: async () => {
          geminiCalls += 1;
          throw new Error('Gemini API must NOT be called');
        },
      },
    });
    assert.equal(clientBlocked.blockedReason, 'SPENDING_LIMIT_EXCEEDED');
    assert.equal(clientBlocked.totalKalodataApiCalls, 0);
    assert.equal(clientBlocked.totalCreditsUsed, 0);

    // Step 3B: Simulate stale/tampered client thinking limit is 5.0 cr -> reaches server -> Server enforces 0.5 cr!
    const serverOutcome = await runDeepDiveModules({
      product,
      analysisIds: ['customer-review-intelligence'],
      spendingLimitCredits: 5.0, // tampered/stale client limit; server has 0.5 cr persisted!
      sessionCreditsAlreadySpent: 0,
      requireExplicitConfirmation: true,
      userConfirmedPaidExecution: true,
      deps: {
        getCacheFn: () => ({ productDetail: null, shopDetail: null, reviewInsight: null }),
        saveCacheFn: () => undefined,
        runAiStrategyFn: async () => {
          geminiCalls += 1;
          throw new Error('Gemini API must NOT be called');
        },
        enrichProductFn: async (payload): Promise<DeepDiveEnrichResponsePayload> => {
          try {
            const okRes = await enrichSingleProduct({
              product: payload.product,
              requestedLayers: payload.requestedLayers,
              spendingLimitCredits: payload.spendingLimitCredits,
              runId: payload.runId,
              idempotencyKey: payload.idempotencyKey,
              requireExplicitConfirmation: payload.requireExplicitConfirmation,
              userConfirmedPaidExecution: payload.userConfirmedPaidExecution,
              budgetLedger: ledger,
              budgetScopeKey: scopeKey,
            });
            return {
              ok: true,
              product: okRes.product,
              productDetail: okRes.productDetail,
              shopDetail: okRes.shopDetail,
              reviewInsight: okRes.reviewInsight,
              summary: okRes.summary,
              budgetSnapshot: okRes.budgetSnapshot ?? null,
            };
          } catch (err) {
            if (err instanceof EnrichmentApiError) {
              return {
                ok: false,
                code: err.code,
                error: err.message,
                errorMy: err.errorMy,
                budgetSnapshot: err.budgetSnapshot ?? null,
              };
            }
            throw err;
          }
        },
      },
    });

    // Step 4 & 5: Verify server rejected with SPENDING_LIMIT_EXCEEDED, 0 API calls, accurate UI slot error & Cost Summary
    const reviewSlot = serverOutcome.slots['customer-review-intelligence'];
    assert.ok(reviewSlot, 'Review Insight slot must be populated with error state');
    assert.equal(reviewSlot?.status, 'error');
    assert.equal(reviewSlot?.error?.code, 'SPENDING_LIMIT_EXCEEDED');
    assert.ok(reviewSlot?.error?.messageEn.includes('0.5'));
    assert.ok(reviewSlot?.error?.messageMy.includes('0.5'));

    assert.equal(serverOutcome.totalKalodataApiCalls, 0);
    assert.equal(serverOutcome.totalCreditsUsed, 0);
    assert.equal(kalodataCalls, 0, 'Zero Kalodata API calls');
    assert.equal(geminiCalls, 0, 'Zero Gemini API calls');

    assert.ok(serverOutcome.runSummary, 'Post-Run Cost Summary must reflect server-authoritative budget');
    assert.equal(serverOutcome.runSummary?.estimatedKalodataCredits, 1.0);
    assert.equal(serverOutcome.runSummary?.actualKalodataCredits, 0);
    assert.equal(serverOutcome.runSummary?.actualKalodataApiCalls, 0);
    assert.equal(serverOutcome.runSummary?.actualGeminiCalls, 0);
    assert.equal(serverOutcome.runSummary?.spendingLimitCredits, 0.5);
    assert.equal(serverOutcome.runSummary?.sessionCreditsUsedAfterRun, 0);
    assert.equal(serverOutcome.runSummary?.remainingBudgetCredits, 0.5);

    // Step 6: Verify persistent budget status has 0 credits deducted
    const afterSnap = await ledger.getScopeSnapshot(scopeKey);
    assert.equal(afterSnap.spentCredits, 0);
    assert.equal(afterSnap.uncertainCredits, 0);
    assert.equal(afterSnap.activeReservedCredits, 0);
    assert.equal(afterSnap.totalCommittedCredits, 0);
    assert.equal(afterSnap.remainingCredits, 0.5);

    // Step 7: Restore limit to 1.5 cr
    const restored = await ledger.setConfiguredSpendingLimit(scopeKey, 1.5);
    assert.equal(restored.configuredLimitCredits, 1.5);
    assert.equal(restored.remainingCredits, 1.5);

    // UI markers check: confirmation panel includes inline limit alert & still zero fetch/api in DeepDiveWorkspaceView
    const viewCode = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/DeepDiveWorkspaceView.tsx'),
      'utf8'
    );
    assert.ok(viewCode.includes('data-testid="deep-dive-confirm-limit-alert"'));
    assert.ok(viewCode.includes('data-testid="deep-dive-budget-storage-unavailable"'));
    assert.equal(viewCode.includes('fetch('), false);
    assert.equal(viewCode.includes('/api/'), false);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.KALODATA_API_KEY;
    else process.env.KALODATA_API_KEY = originalKey;
    ledger.close();
    cleanupTempDir(dir);
  }
});

