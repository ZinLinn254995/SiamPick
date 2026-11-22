import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type {
  BothCategoryMode,
  CategoryFilter,
  KalodataProductDetailEnrichmentRecord,
  KalodataReviewInsightData,
  KalodataShopEnrichmentRecord,
  MyanmarDiscoveryMode,
  ProductCategory,
  ResearchConfig,
  ResearchMode,
  ResearchProduct,
  ResearchQuantity,
  StrategyPreset,
} from './src/types/product.ts';
import { evaluateProductOpportunity } from './src/utils/scoring.ts';
import { isValidProductCategory, UNIVERSAL_CATEGORIES } from './src/utils/categoryRegistry.ts';
import { analyzeSingleProductWithGemini } from './server/aiProductAnalysis.ts';
import { generateDeepDiveAiStrategy } from './server/deepDiveAiService.ts';
import { EnrichmentApiError, enrichSingleProduct } from './server/enrichmentService.ts';
import {
  importTikTokProductFromLink,
  inspectTikTokProductLink,
  LinkImportApiError,
  type LinkImportWorkspaceIds,
} from './server/linkImportService.ts';
import {
  previewSimilarProductsSearch,
  searchSimilarProducts,
  SimilarProductApiError,
} from './server/similarProductService.ts';
import {
  BudgetStorageUnavailableError,
  getDefaultBudgetLedger,
  resolveAuthoritativeBudgetScope,
} from './server/budgetLedgerService.ts';
import type { DeepDiveAnalysisId, DeepDiveCompletedModuleDigest } from './src/types/deepDive.ts';
import {
  clampDeepDiveCount,
  clampMyanmarReviewScanLimit,
  clampMyanmarVideoScanPages,
  DEFAULT_SPENDING_LIMIT_CREDITS,
  MAX_RESEARCH_QUANTITY,
  MAX_SPENDING_LIMIT_CREDITS,
  MIN_RESEARCH_QUANTITY,
  MIN_SPENDING_LIMIT_CREDITS,
} from './src/utils/kalodataPricing.ts';
import {
  getResearchQuotaStatus,
  pauseResearch,
  ResearchApiError,
  resumeResearch,
  runThailandProductResearch,
} from './server/researchService.ts';
import {
  fetchProxiedImageBuffer,
  isProxyableImageUrl,
  resolveLiveTikTokProductImageUrl,
} from './server/imageRetriever.ts';
import {
  extractNumericTikTokProductId,
  renderAndroidTikTokOpenPageHtml,
  resolveCanonicalTikTokProductUrl,
} from './server/tiktokLinkService.ts';
import {
  fetchKalodataCategoryRank,
  fetchKalodataCreditBalance,
  fetchKalodataProductCommentInsight,
  fetchKalodataProductDetail,
  fetchKalodataProductRank,
  fetchKalodataShopDetail,
  type KalodataCategoryRankDateRange,
  type KalodataCategoryRankRequest,
  type KalodataCategoryRankSortField,
  type KalodataProductRankRequest,
} from './server/kalodataService.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

function validateConfig(body: unknown): { config: ResearchConfig; forceResume: boolean } {
  const input = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};

  let resolvedCategoryIdMap: Partial<Record<ProductCategory, string>> | undefined;
  if (
    input.resolvedCategoryIdMap &&
    typeof input.resolvedCategoryIdMap === 'object' &&
    !Array.isArray(input.resolvedCategoryIdMap)
  ) {
    const sanitizedMap: Partial<Record<ProductCategory, string>> = {};
    for (const [slug, id] of Object.entries(
      input.resolvedCategoryIdMap as Record<string, unknown>
    )) {
      if (
        isValidProductCategory(slug) &&
        typeof id === 'string' &&
        /^[A-Za-z0-9_-]{3,64}$/.test(id.trim())
      ) {
        sanitizedMap[slug] = id.trim();
      }
    }
    if (Object.keys(sanitizedMap).length > 0) {
      resolvedCategoryIdMap = sanitizedMap;
    }
  }

  let selectedCategories: ProductCategory[];
  if (Array.isArray(input.selectedCategories)) {
    selectedCategories = Array.from(
      new Set(
        input.selectedCategories.filter((item): item is ProductCategory =>
          isValidProductCategory(item)
        )
      )
    );
  } else {
    const legacyCategory: CategoryFilter =
      input.category === 'all' || isValidProductCategory(input.category)
        ? (input.category as CategoryFilter)
        : 'all';
    selectedCategories =
      legacyCategory === 'all'
        ? UNIVERSAL_CATEGORIES.filter(
            (def) => Boolean(def.defaultKalodataId) || Boolean(resolvedCategoryIdMap?.[def.id])
          ).map((def) => def.id)
        : [legacyCategory];
  }

  const category: CategoryFilter =
    selectedCategories.length === 1 ? selectedCategories[0] : 'all';

  const selectedSubcategoryIds = Array.isArray(input.selectedSubcategoryIds)
    ? Array.from(
        new Set(
          input.selectedSubcategoryIds
            .filter(
              (id): id is string =>
                typeof id === 'string' && /^[A-Za-z0-9_-]{3,64}$/.test(id.trim())
            )
            .map((id) => id.trim())
        )
      ).slice(0, 30)
    : undefined;

  const selectedSubcategoryNames = Array.isArray(input.selectedSubcategoryNames)
    ? input.selectedSubcategoryNames
        .filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
        .map((name) => name.trim().slice(0, 120))
        .slice(0, 30)
    : undefined;

  const bothCategoryMode: BothCategoryMode =
    input.bothCategoryMode === 'split' ? 'split' : 'combined';

  const rawQty =
    typeof input.quantity === 'number' && Number.isFinite(input.quantity)
      ? Math.floor(input.quantity)
      : typeof input.quantity === 'string' && input.quantity.trim() !== ''
        ? Math.floor(Number(input.quantity))
        : 10;
  const quantity: ResearchQuantity = Number.isFinite(rawQty)
    ? Math.max(MIN_RESEARCH_QUANTITY, Math.min(MAX_RESEARCH_QUANTITY, rawQty))
    : 10;

  const rawLimit =
    typeof input.spendingLimitCredits === 'number' && Number.isFinite(input.spendingLimitCredits)
      ? input.spendingLimitCredits
      : typeof input.spendingLimitCredits === 'string' && input.spendingLimitCredits.trim() !== ''
        ? Number(input.spendingLimitCredits)
        : DEFAULT_SPENDING_LIMIT_CREDITS;
  const spendingLimitCredits = Number.isFinite(rawLimit)
    ? Math.round(
        Math.max(MIN_SPENDING_LIMIT_CREDITS, Math.min(MAX_SPENDING_LIMIT_CREDITS, rawLimit)) * 1000
      ) / 1000
    : DEFAULT_SPENDING_LIMIT_CREDITS;

  const researchMode: ResearchMode =
    input.researchMode === 'balanced' || input.researchMode === 'deep'
      ? input.researchMode
      : 'fast';

  const rawDeepDive =
    typeof input.deepDiveCount === 'number' && Number.isFinite(input.deepDiveCount)
      ? Math.floor(input.deepDiveCount)
      : typeof input.deepDiveCount === 'string' && input.deepDiveCount.trim() !== ''
        ? Math.floor(Number(input.deepDiveCount))
        : undefined;
  const deepDiveCount = clampDeepDiveCount(rawDeepDive, quantity);
  const includeReviewInsights =
    researchMode === 'deep' && input.includeReviewInsights === true;

  const strategyPreset: StrategyPreset =
    input.strategyPreset === 'balanced' ||
    input.strategyPreset === 'sales-first' ||
    input.strategyPreset === 'commission-first'
      ? input.strategyPreset
      : 'balanced';

  const rawWeight =
    typeof input.salesWeightPct === 'number' && Number.isFinite(input.salesWeightPct)
      ? Math.round(input.salesWeightPct)
      : 50;
  const salesWeightPct = Math.max(10, Math.min(90, rawWeight));

  const myanmarDiscoveryMode: MyanmarDiscoveryMode | undefined =
    input.myanmarLanguageOnly === true
      ? input.myanmarDiscoveryMode === 'review-first'
        ? 'review-first'
        : 'video-first'
      : undefined;

  const rawVideoScanPages =
    typeof input.myanmarVideoScanPages === 'number' && Number.isFinite(input.myanmarVideoScanPages)
      ? Math.floor(input.myanmarVideoScanPages)
      : typeof input.myanmarVideoScanPages === 'string' &&
          input.myanmarVideoScanPages.trim() !== ''
        ? Math.floor(Number(input.myanmarVideoScanPages))
        : undefined;
  const myanmarVideoScanPages =
    input.myanmarLanguageOnly === true && myanmarDiscoveryMode === 'video-first'
      ? clampMyanmarVideoScanPages(rawVideoScanPages)
      : undefined;

  const rawReviewScanLimit =
    typeof input.myanmarReviewScanLimit === 'number' && Number.isFinite(input.myanmarReviewScanLimit)
      ? Math.floor(input.myanmarReviewScanLimit)
      : typeof input.myanmarReviewScanLimit === 'string' &&
          input.myanmarReviewScanLimit.trim() !== ''
        ? Math.floor(Number(input.myanmarReviewScanLimit))
        : undefined;
  const myanmarReviewScanLimit =
    input.myanmarLanguageOnly === true && myanmarDiscoveryMode === 'review-first'
      ? clampMyanmarReviewScanLimit(rawReviewScanLimit)
      : undefined;

  return {
    config: {
      market: 'Thailand TikTok Shop',
      category,
      selectedCategories,
      ...(selectedSubcategoryIds && selectedSubcategoryIds.length > 0
        ? { selectedSubcategoryIds }
        : {}),
      ...(selectedSubcategoryNames && selectedSubcategoryNames.length > 0
        ? { selectedSubcategoryNames }
        : {}),
      ...(resolvedCategoryIdMap ? { resolvedCategoryIdMap } : {}),
      bothCategoryMode,
      researchMode,
      deepDiveCount,
      includeReviewInsights,
      spendingLimitCredits,
      priceLimit: 'unrestricted',
      strategyPreset,
      salesWeightPct,
      quantity,
      ...(input.myanmarLanguageOnly === true
        ? {
            myanmarLanguageOnly: true,
            myanmarDiscoveryMode,
            ...(myanmarVideoScanPages !== undefined ? { myanmarVideoScanPages } : {}),
            ...(myanmarReviewScanLimit !== undefined ? { myanmarReviewScanLimit } : {}),
          }
        : {}),
    },
    forceResume: input.forceResume === true,
  };
}

const ALLOWED_KALODATA_REGIONS = new Set([
  'US', 'BR', 'MX', 'ID', 'JP', 'MY', 'PH', 'SG', 'TH', 'VN',
  'GB', 'ES', 'DE', 'FR', 'IT', 'PL', 'NL', 'BE', 'CZ', 'AT', 'GR', 'PT', 'HU', 'IE',
]);
const ALLOWED_KALODATA_LANGUAGES = new Set([
  'zh-CN', 'en-US', 'id-ID', 'th-TH', 'vi-VN', 'es-ES', 'ja-JP', 'pt-BR',
  'ko-KR', 'fr-FR', 'de-DE', 'pl-PL', 'nl-NL', 'cs-CZ', 'el-GR', 'hu-HU', 'pt-PT', 'it-IT',
]);
const ALLOWED_KALODATA_CURRENCIES = new Set([
  'CNY', 'USD', 'IDR', 'VND', 'THB', 'MYR', 'JPY', 'PHP', 'GBP', 'SGD',
  'MXN', 'EUR', 'BRL', 'PLN', 'CZK', 'HUF',
]);
const ALLOWED_KALODATA_DATE_RANGES = new Set<KalodataCategoryRankDateRange>([
  'last7Day',
  'last30Day',
  'last90Day',
  'last180Day',
  'last365Day',
]);
const ALLOWED_PRODUCT_RANK_SORT_FIELDS = new Set([
  'revenue',
  'sale',
  'revenue_growth_rate',
  'commission_rate',
  'creator_num',
  'unit_price',
  'rank',
]);
const MAX_PROXY_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB safety cap

function isValidKalodataId(value: string): boolean {
  return /^[A-Za-z0-9_-]{3,64}$/.test(value);
}

function sanitizeServerError(error: unknown, fallbackMessage: string): string {
  if (!(error instanceof Error) || !error.message) {
    return fallbackMessage;
  }
  const msg = error.message
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[REDACTED]')
    .replace(/(secret[-_]?key|api[-_]?key|authorization|bearer)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .trim();
  if (!msg || msg.length > 260 || /\/app\/|node_modules|at\s+\S+\s+\(/.test(msg)) {
    return fallbackMessage;
  }
  return msg;
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, market: 'Thailand TikTok Shop' });
  });

  app.get('/api/research/status', (_req, res) => {
    res.json(getResearchQuotaStatus());
  });

  app.post('/api/research/pause', (_req, res) => {
    res.json(pauseResearch('manual'));
  });

  app.post('/api/research/resume', (_req, res) => {
    res.json(resumeResearch());
  });

  app.get('/api/kalodata/balance', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const result = await fetchKalodataCreditBalance();
      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({
        ok: false,
        configured: false,
        error: sanitizeServerError(error, 'Unexpected server error while checking Kalodata balance.'),
        code: 'BALANCE_INTERNAL_ERROR',
      });
    }
  });

  // Phase 9.3.1: Authoritative Persistent Budget Status & Spending Limit Configuration
  app.get('/api/budget/status', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const requestedRaw =
        typeof req.query.spendingLimitCredits === 'string'
          ? Number(req.query.spendingLimitCredits)
          : undefined;
      const requestedLimit =
        typeof requestedRaw === 'number' && Number.isFinite(requestedRaw)
          ? Math.round(
              Math.max(MIN_SPENDING_LIMIT_CREDITS, Math.min(MAX_SPENDING_LIMIT_CREDITS, requestedRaw)) *
                1000
            ) / 1000
          : undefined;

      const ledger = getDefaultBudgetLedger();
      const { scopeKey } = resolveAuthoritativeBudgetScope();
      const snapshot = await ledger.getScopeSnapshot(scopeKey, requestedLimit);
      res.status(200).json({ ok: true, budget: snapshot });
    } catch (error) {
      if (error instanceof BudgetStorageUnavailableError) {
        res.status(503).json({
          ok: false,
          storageAvailable: false,
          code: error.code,
          error: error.message,
          errorMy: error.errorMy,
        });
        return;
      }
      res.status(503).json({
        ok: false,
        storageAvailable: false,
        code: 'BUDGET_STORAGE_UNAVAILABLE',
        error: sanitizeServerError(error, 'Persistent budget storage is unavailable. Paid APIs are blocked fail-closed.'),
        errorMy: 'Persistent Budget Storage မရရှိနိုင်သဖြင့် Paid API များကို Fail-Closed ပိတ်ထားပါသည်။',
      });
    }
  });

  app.post('/api/budget/limit', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const body =
        req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : null;
      const rawLimit =
        typeof body?.spendingLimitCredits === 'number' && Number.isFinite(body.spendingLimitCredits)
          ? body.spendingLimitCredits
          : typeof body?.spendingLimitCredits === 'string' && body.spendingLimitCredits.trim() !== ''
            ? Number(body.spendingLimitCredits)
            : NaN;

      if (!Number.isFinite(rawLimit)) {
        res.status(400).json({
          ok: false,
          code: 'INVALID_SPENDING_LIMIT',
          error: 'A valid numeric spendingLimitCredits value is required.',
          errorMy: 'မှန်ကန်သော Spending Limit ကိန်းဂဏန်း လိုအပ်ပါသည်။',
        });
        return;
      }

      const ledger = getDefaultBudgetLedger();
      const { scopeKey } = resolveAuthoritativeBudgetScope();
      const snapshot = await ledger.setConfiguredSpendingLimit(scopeKey, rawLimit);
      res.status(200).json({ ok: true, budget: snapshot });
    } catch (error) {
      if (error instanceof BudgetStorageUnavailableError) {
        res.status(503).json({
          ok: false,
          storageAvailable: false,
          code: error.code,
          error: error.message,
          errorMy: error.errorMy,
        });
        return;
      }
      res.status(503).json({
        ok: false,
        storageAvailable: false,
        code: 'BUDGET_STORAGE_UNAVAILABLE',
        error: sanitizeServerError(error, 'Persistent budget storage is unavailable.'),
        errorMy: 'Persistent Budget Storage မရရှိနိုင်ပါ။',
      });
    }
  });

  // Phase 9.5 Budget Security: Disable unguarded direct paid Kalodata product-rank proxy so callers
  // cannot bypass Spending Limit, Confirmation, and Persistent Budget Ledger via raw proxy endpoints.
  app.post('/api/kalodata/product-rank', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.status(403).json({
      ok: false,
      code: 'DIRECT_PAID_PROXY_DISABLED',
      error:
        'Direct paid Kalodata proxy access is disabled for budget security. Use /api/research with spending limit protection.',
      errorMy:
        'Budget လုံခြုံရေးအတွက် တိုက်ရိုက် Paid Kalodata Proxy ကို ပိတ်ထားပါသည်။ Spending Limit ကာကွယ်မှုပါဝင်သော /api/research ကိုသာ အသုံးပြုပါ။',
    });
  });

  app.post('/api/kalodata/category-rank', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const body =
        req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
      const sortInput =
        body.sort_field && typeof body.sort_field === 'object'
          ? (body.sort_field as Record<string, unknown>)
          : {};

      const allowedSortFields = new Set<KalodataCategoryRankSortField>([
        'revenue',
        'revenue_growth_rate',
        'top3_shop_revenue_ratio',
        'average_revenue',
        'rank',
        'category_id',
        'category_name',
      ]);

      const rawRegion = typeof body.region === 'string' ? body.region.trim() : '';
      const rawLanguage = typeof body.language === 'string' ? body.language.trim() : '';
      const rawCurrency = typeof body.currency === 'string' ? body.currency.trim() : '';
      const rawDateRange = typeof body.date_range === 'string' ? body.date_range.trim() : '';
      const rawSortField = typeof sortInput.field === 'string' ? sortInput.field.trim() : '';

      const params: KalodataCategoryRankRequest = {
        region: ALLOWED_KALODATA_REGIONS.has(rawRegion) ? rawRegion : 'TH',
        language: ALLOWED_KALODATA_LANGUAGES.has(rawLanguage) ? rawLanguage : 'en-US',
        currency: ALLOWED_KALODATA_CURRENCIES.has(rawCurrency) ? rawCurrency : 'THB',
        date_range: ALLOWED_KALODATA_DATE_RANGES.has(rawDateRange as KalodataCategoryRankDateRange)
          ? (rawDateRange as KalodataCategoryRankDateRange)
          : 'last30Day',
        page_number:
          typeof body.page_number === 'number' &&
          Number.isInteger(body.page_number) &&
          body.page_number >= 1 &&
          body.page_number <= 50
            ? body.page_number
            : 1,
        page_size:
          typeof body.page_size === 'number' &&
          Number.isInteger(body.page_size) &&
          body.page_size >= 1 &&
          body.page_size <= 100
            ? body.page_size
            : 100,
        sort_field: {
          field: allowedSortFields.has(rawSortField as KalodataCategoryRankSortField)
            ? (rawSortField as KalodataCategoryRankSortField)
            : 'revenue',
          type: sortInput.type === 'ASC' ? 'ASC' : 'DESC',
        },
      };

      if (body.category_level === 1 || body.category_level === 2 || body.category_level === 3) {
        params.category_level = body.category_level;
      }

      if (Array.isArray(body.category_ids)) {
        const ids = body.category_ids
          .filter(
            (id): id is string =>
              typeof id === 'string' && isValidKalodataId(id.trim())
          )
          .map((id) => id.trim())
          .slice(0, 50);
        if (ids.length > 0) {
          params.category_ids = ids;
        }
      }

      if (typeof body.revenue_range === 'string') {
        const trimmedRange = body.revenue_range.trim();
        if (trimmedRange.length > 0 && trimmedRange.length <= 64) {
          params.revenue_range = trimmedRange;
        }
      }

      const result = await fetchKalodataCategoryRank(params);
      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: sanitizeServerError(error, 'Unexpected server error during category rank query.'),
        code: 'CATEGORY_RANK_INTERNAL_ERROR',
      });
    }
  });

  // Phase 9.5 Budget Security: Disable unguarded direct paid Kalodata detail/comments proxy so
  // callers cannot bypass Confirmation & Persistent Budget Ledger via raw proxy endpoints.
  app.post('/api/kalodata/product-detail', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.status(403).json({
      ok: false,
      code: 'DIRECT_PAID_PROXY_DISABLED',
      error:
        'Direct paid Kalodata detail proxy is disabled for budget security. Use /api/enrich-product with confirmation and persistent budget enforcement.',
      errorMy:
        'Budget လုံခြုံရေးအတွက် တိုက်ရိုက် Paid Kalodata Detail Proxy ကို ပိတ်ထားပါသည်။ Confirmation နှင့် Persistent Budget ကာကွယ်မှုပါဝင်သော /api/enrich-product ကိုသာ အသုံးပြုပါ။',
    });
  });

  /**
   * Verified Product Image Proxy:
   * Streams server-verified or trusted Kalodata/TikTok CDN https:// raster image URLs,
   * and transparently recovers expired/missing URLs via 0-credit TikTok Shop PDP lookup when productId is provided.
   */
  app.get('/api/image-proxy', async (req, res) => {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url : '';
    const cleanProductId = extractNumericTikTokProductId(
      typeof req.query.productId === 'string' ? req.query.productId : null
    );

    if (rawUrl && isProxyableImageUrl(rawUrl)) {
      const directResult = await fetchProxiedImageBuffer(rawUrl, MAX_PROXY_IMAGE_BYTES);
      if (directResult.ok) {
        res.setHeader('Content-Type', directResult.mime);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.send(directResult.buffer);
        return;
      }

      if (!cleanProductId) {
        res.status(directResult.status).end();
        return;
      }
    }

    if (cleanProductId) {
      const recoveredUrl = await resolveLiveTikTokProductImageUrl(cleanProductId);
      if (recoveredUrl) {
        const recoveredResult = await fetchProxiedImageBuffer(
          recoveredUrl,
          MAX_PROXY_IMAGE_BYTES
        );
        if (recoveredResult.ok) {
          res.setHeader('Content-Type', recoveredResult.mime);
          res.setHeader('X-Content-Type-Options', 'nosniff');
          res.setHeader('Cache-Control', 'public, max-age=3600');
          res.send(recoveredResult.buffer);
          return;
        }
      }
    }

    res.status(rawUrl ? 403 : 400).end();
  });

  /**
   * 0-Credit Live TikTok Shop Product Image Recovery Endpoint:
   * Fetches and streams verified raster product images from public TikTok Shop PDP metadata
   * when restored/archived backups lack imageOriginUrl or carry expired CDN signatures.
   */
  app.get('/api/product-image/:productId', async (req, res) => {
    const cleanId = extractNumericTikTokProductId(req.params.productId);
    if (!cleanId) {
      res.status(400).end();
      return;
    }

    const recoveredUrl = await resolveLiveTikTokProductImageUrl(cleanId);
    if (!recoveredUrl) {
      res.status(404).end();
      return;
    }

    const imgResult = await fetchProxiedImageBuffer(recoveredUrl, MAX_PROXY_IMAGE_BYTES);
    if (!imgResult.ok) {
      res.status(imgResult.status).end();
      return;
    }

    res.setHeader('Content-Type', imgResult.mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(imgResult.buffer);
  });

  app.get('/api/tiktok-product/:productId', async (req, res) => {
    const cleanId = extractNumericTikTokProductId(req.params.productId);
    if (!cleanId) {
      res.status(400).json({
        ok: false,
        code: 'INVALID_PRODUCT_ID',
        error: 'Valid numeric TikTok Shop product ID (8-24 digits) is required.',
      });
      return;
    }

    try {
      const resolved = await resolveCanonicalTikTokProductUrl(cleanId);
      res.setHeader(
        'Cache-Control',
        resolved.slugResolved ? 'public, max-age=3600' : 'no-store'
      );
      res.status(200).json({ ok: true, ...resolved });
    } catch (error) {
      res.status(500).json({
        ok: false,
        code: 'TIKTOK_LINK_RESOLVE_ERROR',
        error: sanitizeServerError(error, 'Could not resolve TikTok Shop product link.'),
      });
    }
  });

  app.get('/api/tiktok-open/:productId', async (req, res) => {
    const cleanId = extractNumericTikTokProductId(req.params.productId);
    if (!cleanId) {
      res.status(400).type('text/plain').send('Invalid TikTok Shop product ID.');
      return;
    }

    try {
      const resolved = await resolveCanonicalTikTokProductUrl(cleanId);
      const userAgent = req.get('user-agent') ?? '';
      if (!/android/i.test(userAgent)) {
        res.redirect(302, resolved.canonicalUrl);
        return;
      }

      res.setHeader('Cache-Control', 'no-store');
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"
      );
      res.status(200).type('html').send(renderAndroidTikTokOpenPageHtml(resolved));
    } catch {
      res.redirect(302, `https://shop.tiktok.com/th/pdp/product/${cleanId}`);
    }
  });

  app.post('/api/research', async (req, res) => {
    try {
      const { config, forceResume } = validateConfig(req.body);
      const result = await runThailandProductResearch(config, { forceResume });
      res.json(result);
    } catch (error) {
      if (error instanceof ResearchApiError) {
        res.status(error.status).json({
          error: error.message,
          errorMy: error.errorMy,
          code: error.code,
          quotaPaused: error.quotaPaused,
          quotaStatus: getResearchQuotaStatus(),
        });
        return;
      }
      res.status(500).json({
        error: sanitizeServerError(error, 'Unexpected server error during research.'),
        code: 'INTERNAL_ERROR',
      });
    }
  });

  /**
   * Phase 3: Single-Product Gemini AI Analysis Endpoint
   * - Strictly analyzes already-fetched Kalodata data (0 Kalodata API credits).
   * - API key stays strictly server-side in process.env.GEMINI_API_KEY.
   * - Always returns a structured AiProductAnalysis (falls back cleanly to Kalodata-based
   *   Fallback Analysis with geminiFailed: true if Gemini errors/times out).
   */
  app.post('/api/analyze-product', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const body =
        req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : null;
      const rawProduct =
        body?.product && typeof body.product === 'object'
          ? (body.product as Record<string, unknown>)
          : null;

      if (
        !rawProduct ||
        typeof rawProduct.id !== 'string' ||
        rawProduct.id.trim().length === 0 ||
        typeof rawProduct.name !== 'string' ||
        rawProduct.name.trim().length === 0 ||
        !isValidProductCategory(rawProduct.category)
      ) {
        res.status(400).json({
          ok: false,
          error: 'Valid product object (id, name, category) is required for AI analysis.',
          errorMy: 'AI ခွဲခြမ်းစိတ်ဖြာရန် မှန်ကန်သော Product အချက်အလက် (id, name, category) လိုအပ်ပါသည်။',
          code: 'INVALID_PAYLOAD',
        });
        return;
      }

      const product = rawProduct as unknown as ResearchProduct;
      const rawWeight =
        typeof body?.salesWeightPct === 'number' && Number.isFinite(body.salesWeightPct)
          ? Math.max(10, Math.min(90, Math.round(body.salesWeightPct)))
          : 50;

      const peerProducts = Array.isArray(body?.peerProducts)
        ? (body.peerProducts
            .filter(
              (item): item is ResearchProduct =>
                Boolean(item) &&
                typeof item === 'object' &&
                typeof (item as Record<string, unknown>).id === 'string' &&
                typeof (item as Record<string, unknown>).name === 'string'
            )
            .slice(0, 50))
        : undefined;

      const evaluation = evaluateProductOpportunity(product, {
        salesWeightPct: rawWeight,
        peerProducts,
      });

      const analysis = await analyzeSingleProductWithGemini(product, evaluation);
      res.status(200).json({ ok: true, analysis });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: sanitizeServerError(error, 'Unexpected error during product analysis.'),
        code: 'ANALYSIS_INTERNAL_ERROR',
      });
    }
  });

  /**
   * Phase 4: Selective Single-Product / Shop / Review Data Enrichment Endpoint
   * - Inspects already-present fields + client/server caches BEFORE calling Kalodata API.
   * - Deduplicates strictly by Product ID & Shop ID (0 duplicate calls).
   * - Enforces server-side Spending Limit & Free Credit Balance Check before paid calls.
   */
  app.post('/api/enrich-product', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const body =
        req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : null;
      const rawProduct =
        body?.product && typeof body.product === 'object'
          ? (body.product as Record<string, unknown>)
          : null;

      if (
        !rawProduct ||
        typeof rawProduct.id !== 'string' ||
        rawProduct.id.trim().length === 0 ||
        typeof rawProduct.name !== 'string' ||
        rawProduct.name.trim().length === 0 ||
        !isValidProductCategory(rawProduct.category)
      ) {
        res.status(400).json({
          ok: false,
          error: 'Valid product object (id, name, category) is required for data enrichment.',
          errorMy: 'ဒေတာဖြည့်စွက်ရန် မှန်ကန်သော Product အချက်အလက် (id, name, category) လိုအပ်ပါသည်။',
          code: 'INVALID_PAYLOAD',
        });
        return;
      }

      const rawLayers =
        body?.requestedLayers && typeof body.requestedLayers === 'object'
          ? (body.requestedLayers as Record<string, unknown>)
          : {};

      const requestedLayers = {
        productDetail: rawLayers.productDetail === true,
        shopDetail: rawLayers.shopDetail === true,
        reviewInsights: rawLayers.reviewInsights === true,
      };

      const rawLimit =
        typeof body?.spendingLimitCredits === 'number' &&
        Number.isFinite(body.spendingLimitCredits)
          ? body.spendingLimitCredits
          : DEFAULT_SPENDING_LIMIT_CREDITS;
      const spendingLimitCredits = Math.round(
        Math.max(MIN_SPENDING_LIMIT_CREDITS, Math.min(MAX_SPENDING_LIMIT_CREDITS, rawLimit)) * 1000
      ) / 1000;

      const rawWeight =
        typeof body?.salesWeightPct === 'number' && Number.isFinite(body.salesWeightPct)
          ? Math.max(10, Math.min(90, Math.round(body.salesWeightPct)))
          : 50;

      const peerProducts = Array.isArray(body?.peerProducts)
        ? body.peerProducts
            .filter(
              (item): item is ResearchProduct =>
                Boolean(item) &&
                typeof item === 'object' &&
                typeof (item as Record<string, unknown>).id === 'string' &&
                typeof (item as Record<string, unknown>).name === 'string'
            )
            .slice(0, 50)
        : undefined;

      const clientCachedProductDetail =
        body?.clientCachedProductDetail &&
        typeof body.clientCachedProductDetail === 'object' &&
        typeof (body.clientCachedProductDetail as Record<string, unknown>).productId === 'string'
          ? (body.clientCachedProductDetail as KalodataProductDetailEnrichmentRecord)
          : null;

      const clientCachedShopDetail =
        body?.clientCachedShopDetail &&
        typeof body.clientCachedShopDetail === 'object' &&
        typeof (body.clientCachedShopDetail as Record<string, unknown>).shopId === 'string'
          ? (body.clientCachedShopDetail as KalodataShopEnrichmentRecord)
          : null;

      const clientCachedReviewInsight =
        body?.clientCachedReviewInsight &&
        typeof body.clientCachedReviewInsight === 'object' &&
        typeof (body.clientCachedReviewInsight as Record<string, unknown>).productId === 'string'
          ? (body.clientCachedReviewInsight as KalodataReviewInsightData)
          : null;

      // Phase 9.3.1 Security Fix: NEVER trust client-supplied `sessionCreditsAlreadySpent`!
      // Authoritative spend & active reservations are enforced strictly from the persistent server ledger.
      const runId =
        typeof body?.runId === 'string' && /^[A-Za-z0-9:_-]{2,80}$/.test(body.runId.trim())
          ? body.runId.trim()
          : undefined;
      const idempotencyKey =
        typeof body?.idempotencyKey === 'string' &&
        /^[A-Za-z0-9:_-]{4,140}$/.test(body.idempotencyKey.trim())
          ? body.idempotencyKey.trim()
          : undefined;
      // Phase 9.5 Security Hardening: Server unconditionally enforces explicit confirmation
      // before any paid Kalodata API call (clients cannot disable requireExplicitConfirmation).
      const requireExplicitConfirmation = true;
      const userConfirmedPaidExecution = body?.userConfirmedPaidExecution === true;

      const result = await enrichSingleProduct({
        product: rawProduct as unknown as ResearchProduct,
        requestedLayers,
        spendingLimitCredits,
        runId,
        idempotencyKey,
        requireExplicitConfirmation,
        userConfirmedPaidExecution,
        forceRefresh: body?.forceRefresh === true,
        clientCachedProductDetail,
        clientCachedShopDetail,
        clientCachedReviewInsight,
        salesWeightPct: rawWeight,
        peerProducts,
      });

      res.status(200).json(result);
    } catch (error) {
      if (error instanceof EnrichmentApiError) {
        res.status(error.status).json({
          ok: false,
          error: error.message,
          errorMy: error.errorMy,
          code: error.code,
          ...(error.budgetSnapshot ? { budgetSnapshot: error.budgetSnapshot } : {}),
        });
        return;
      }
      res.status(500).json({
        ok: false,
        error: sanitizeServerError(error, 'Unexpected server error during data enrichment.'),
        code: 'ENRICHMENT_INTERNAL_ERROR',
      });
    }
  });

  // Phase 9.2: Deep Dive AI Strategic Recommendation (Option #8 — 0 Kalodata credits, separate Gemini API billing, server-side only)
  app.post('/api/deep-dive/ai-strategy', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const body = req.body as Record<string, unknown> | undefined;
      const rawProduct =
        body?.product && typeof body.product === 'object'
          ? (body.product as Record<string, unknown>)
          : null;

      if (
        !rawProduct ||
        typeof rawProduct.id !== 'string' ||
        rawProduct.id.trim().length === 0 ||
        typeof rawProduct.name !== 'string' ||
        rawProduct.name.trim().length === 0 ||
        !isValidProductCategory(rawProduct.category)
      ) {
        res.status(400).json({
          ok: false,
          code: 'INVALID_PAYLOAD',
          error: 'Valid product object (id, name, category) is required for AI Strategic Recommendation.',
          errorMy: 'AI Strategic Recommendation အတွက် မှန်ကန်သော Product အချက်အလက် လိုအပ်ပါသည်။',
        });
        return;
      }

      // Phase 9.5 Security Hardening: Server unconditionally enforces explicit confirmation
      // before invoking Gemini AI API (clients cannot bypass by omitting requireExplicitConfirmation).
      if (body?.userConfirmedPaidExecution !== true) {
        res.status(400).json({
          ok: false,
          code: 'CONFIRMATION_REQUIRED',
          error:
            'Explicit user confirmation is required before calling the Gemini AI API (separate Google Gemini API billing applies). No AI API call was made.',
          errorMy:
            'Gemini AI API မခေါ်ဆိုမီ အသုံးပြုသူ၏ အတည်ပြုချက် လိုအပ်ပါသည် (Google Gemini API ကုန်ကျစရိတ် သီးခြားရှိပါသည်)။ AI API မခေါ်ဆိုထားပါ။',
        });
        return;
      }

      const rawWeight =
        typeof body?.salesWeightPct === 'number' && Number.isFinite(body.salesWeightPct)
          ? Math.max(10, Math.min(90, Math.round(body.salesWeightPct)))
          : 50;

      const validIds = new Set<DeepDiveAnalysisId>([
        'product-intelligence',
        'sales-market-intelligence',
        'affiliate-profit-analysis',
        'creator-competition-analysis',
        'video-intelligence',
        'customer-review-intelligence',
        'market-competitor-comparison',
      ]);

      const completedModules: DeepDiveCompletedModuleDigest[] = Array.isArray(body?.completedModules)
        ? body.completedModules
            .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
            .filter(
              (item) =>
                typeof item.analysisId === 'string' &&
                validIds.has(item.analysisId as DeepDiveAnalysisId)
            )
            .slice(0, 7)
            .map((item) => ({
              analysisId: item.analysisId as DeepDiveAnalysisId,
              outcome: item.outcome === 'unavailable' ? 'unavailable' : 'completed',
              dataStatus:
                item.dataStatus === 'verified' ||
                item.dataStatus === 'estimated' ||
                item.dataStatus === 'unverified' ||
                item.dataStatus === 'unavailable'
                  ? item.dataStatus
                  : 'unverified',
              headlineEn: typeof item.headlineEn === 'string' ? item.headlineEn.slice(0, 240) : '',
              summaryEn: typeof item.summaryEn === 'string' ? item.summaryEn.slice(0, 500) : '',
              metrics: Array.isArray(item.metrics)
                ? item.metrics
                    .filter((m): m is Record<string, unknown> => Boolean(m) && typeof m === 'object')
                    .slice(0, 12)
                    .map((m) => ({
                      label: typeof m.label === 'string' ? m.label.slice(0, 80) : '',
                      value: typeof m.value === 'string' ? m.value.slice(0, 120) : '',
                      status:
                        m.status === 'verified' ||
                        m.status === 'estimated' ||
                        m.status === 'unverified' ||
                        m.status === 'unavailable'
                          ? m.status
                          : 'unverified',
                    }))
                : [],
              unavailableNotes: Array.isArray(item.unavailableNotes)
                ? item.unavailableNotes
                    .filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
                    .map((n) => n.trim().slice(0, 220))
                    .slice(0, 5)
                : [],
            }))
        : [];

      const product = rawProduct as unknown as ResearchProduct;
      const evaluation = evaluateProductOpportunity(product, {
        salesWeightPct: rawWeight,
      });

      const response = await generateDeepDiveAiStrategy({
        product,
        evaluation,
        completedModules,
        salesWeightPct: rawWeight,
      });

      if (!response.ok) {
        const statusCode =
          response.code === 'RATE_LIMITED'
            ? 429
            : response.code === 'TIMEOUT'
              ? 504
              : response.code === 'AUTH_ERROR' || response.code === 'INVALID_RESPONSE'
                ? 502
                : 503;
        res.status(statusCode).json(response);
        return;
      }

      res.status(200).json(response);
    } catch (error) {
      res.status(500).json({
        ok: false,
        code: 'UPSTREAM_ERROR',
        error: sanitizeServerError(error, 'Unexpected server error during Deep Dive AI analysis.'),
        errorMy: 'Deep Dive AI ခွဲခြမ်းစိတ်ဖြာမှုတွင် မမျှော်လင့်သော Server အမှား ဖြစ်ပွားခဲ့ပါသည်။',
      });
    }
  });

  const sanitizeWorkspaceIds = (raw: unknown): LinkImportWorkspaceIds | undefined => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const obj = raw as Record<string, unknown>;
    const cleanList = (arr: unknown): string[] | undefined =>
      Array.isArray(arr)
        ? arr
            .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
            .map((v) => v.trim().slice(0, 80))
            .slice(0, 500)
        : undefined;
    return {
      results: cleanList(obj.results),
      saved: cleanList(obj.saved),
      history: cleanList(obj.history),
    };
  };

  const clampLinkSpendingLimit = (raw: unknown): number => {
    const num =
      typeof raw === 'number' && Number.isFinite(raw)
        ? raw
        : typeof raw === 'string' && raw.trim() !== ''
          ? Number(raw)
          : DEFAULT_SPENDING_LIMIT_CREDITS;
    if (!Number.isFinite(num)) return DEFAULT_SPENDING_LIMIT_CREDITS;
    return (
      Math.round(
        Math.max(MIN_SPENDING_LIMIT_CREDITS, Math.min(MAX_SPENDING_LIMIT_CREDITS, num)) * 1000
      ) / 1000
    );
  };

  // Phase 10A: Zero-Credit TikTok Shop Product Link Inspection & Identification
  app.post('/api/link-import/inspect', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const body =
        req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
      const rawInput =
        typeof body.rawInput === 'string'
          ? body.rawInput.slice(0, 2000)
          : typeof body.url === 'string'
            ? body.url.slice(0, 2000)
            : '';

      const clientCachedProductDetail =
        body.clientCachedProductDetail &&
        typeof body.clientCachedProductDetail === 'object' &&
        !Array.isArray(body.clientCachedProductDetail) &&
        typeof (body.clientCachedProductDetail as Record<string, unknown>).productId === 'string'
          ? (body.clientCachedProductDetail as KalodataProductDetailEnrichmentRecord)
          : null;

      const result = await inspectTikTokProductLink({
        rawInput,
        existingWorkspaceIds: sanitizeWorkspaceIds(body.existingWorkspaceIds),
        clientCachedProductDetail,
        spendingLimitCredits: clampLinkSpendingLimit(body.spendingLimitCredits),
      });

      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({
        ok: false,
        classification: 'invalid-link',
        errorCode: 'INVALID_URL',
        messageEn: sanitizeServerError(error, 'Unexpected error while inspecting TikTok Shop link.'),
        messageMy: 'TikTok Shop Link ကို စစ်ဆေးစဉ် မမျှော်လင့်သော Server အမှား ဖြစ်ပွားခဲ့ပါသည်။',
      });
    }
  });

  // Phase 10A: Confirmation-Gated TikTok Shop Product Link Import (reuses Kalodata, Cache, Budget Ledger)
  app.post('/api/link-import/import', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const body =
        req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
      const rawInput =
        typeof body.rawInput === 'string'
          ? body.rawInput.slice(0, 2000)
          : typeof body.url === 'string'
            ? body.url.slice(0, 2000)
            : '';

      let resolvedCategoryIdMap: Partial<Record<ProductCategory, string>> | undefined;
      if (
        body.resolvedCategoryIdMap &&
        typeof body.resolvedCategoryIdMap === 'object' &&
        !Array.isArray(body.resolvedCategoryIdMap)
      ) {
        const sanitizedMap: Partial<Record<ProductCategory, string>> = {};
        for (const [slug, id] of Object.entries(
          body.resolvedCategoryIdMap as Record<string, unknown>
        )) {
          if (
            isValidProductCategory(slug) &&
            typeof id === 'string' &&
            isValidKalodataId(id.trim())
          ) {
            sanitizedMap[slug] = id.trim();
          }
        }
        if (Object.keys(sanitizedMap).length > 0) {
          resolvedCategoryIdMap = sanitizedMap;
        }
      }

      const clientCachedProductDetail =
        body.clientCachedProductDetail &&
        typeof body.clientCachedProductDetail === 'object' &&
        !Array.isArray(body.clientCachedProductDetail) &&
        typeof (body.clientCachedProductDetail as Record<string, unknown>).productId === 'string'
          ? (body.clientCachedProductDetail as KalodataProductDetailEnrichmentRecord)
          : null;

      const clientCachedShopDetail =
        body.clientCachedShopDetail &&
        typeof body.clientCachedShopDetail === 'object' &&
        !Array.isArray(body.clientCachedShopDetail) &&
        typeof (body.clientCachedShopDetail as Record<string, unknown>).shopId === 'string'
          ? (body.clientCachedShopDetail as KalodataShopEnrichmentRecord)
          : null;

      const clientCachedReviewInsight =
        body.clientCachedReviewInsight &&
        typeof body.clientCachedReviewInsight === 'object' &&
        !Array.isArray(body.clientCachedReviewInsight) &&
        typeof (body.clientCachedReviewInsight as Record<string, unknown>).productId === 'string'
          ? (body.clientCachedReviewInsight as KalodataReviewInsightData)
          : null;

      const rawWeight =
        typeof body.salesWeightPct === 'number' && Number.isFinite(body.salesWeightPct)
          ? Math.max(10, Math.min(90, Math.round(body.salesWeightPct)))
          : 50;

      const result = await importTikTokProductFromLink({
        rawInput,
        existingWorkspaceIds: sanitizeWorkspaceIds(body.existingWorkspaceIds),
        clientCachedProductDetail,
        clientCachedShopDetail,
        clientCachedReviewInsight,
        resolvedCategoryIdMap,
        spendingLimitCredits: clampLinkSpendingLimit(body.spendingLimitCredits),
        salesWeightPct: rawWeight,
        userConfirmedPaidExecution: body.userConfirmedPaidExecution === true,
        forceRefresh: body.forceRefresh === true,
        idempotencyKey:
          typeof body.idempotencyKey === 'string' ? body.idempotencyKey.slice(0, 128) : undefined,
      });

      res.status(200).json(result);
    } catch (error) {
      if (error instanceof LinkImportApiError) {
        res.status(error.status).json({
          ok: false,
          classification: error.classification,
          code: error.code,
          error: error.message,
          errorMy: error.errorMy,
          quotaPaused: error.code === 'RESEARCH_PAUSED',
          quotaStatus: error.code === 'RESEARCH_PAUSED' ? getResearchQuotaStatus() : undefined,
          budgetSnapshot: error.budgetSnapshot,
        });
        return;
      }

      res.status(500).json({
        ok: false,
        classification: 'invalid-link',
        code: 'KALODATA_API_ERROR',
        error: sanitizeServerError(error, 'Unexpected server error while importing TikTok Shop product link.'),
        errorMy: 'TikTok Shop Product Link ထည့်သွင်းစဉ် မမျှော်လင့်သော Server အမှား ဖြစ်ပွားခဲ့ပါသည်။',
      });
    }
  });

  // Phase 3: Similar Product Finder — 0-Credit Cost Preview & Budget Inspection
  app.post('/api/similar-products/preview', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const body =
        req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
      const rawProduct =
        body.referenceProduct && typeof body.referenceProduct === 'object'
          ? (body.referenceProduct as Record<string, unknown>)
          : null;

      if (
        !rawProduct ||
        typeof rawProduct.id !== 'string' ||
        rawProduct.id.trim().length === 0 ||
        typeof rawProduct.name !== 'string' ||
        rawProduct.name.trim().length === 0 ||
        !isValidProductCategory(rawProduct.category)
      ) {
        res.status(400).json({
          ok: false,
          code: 'INVALID_PAYLOAD',
          error: 'Valid referenceProduct (id, name, category) is required to preview similar product search.',
          errorMy: 'ဆင်တူ Product ရှာဖွေမှု ခန့်မှန်းရန် မှန်ကန်သော referenceProduct (id, name, category) လိုအပ်ပါသည်။',
        });
        return;
      }

      let resolvedCategoryIdMap: Partial<Record<ProductCategory, string>> | undefined;
      if (
        body.resolvedCategoryIdMap &&
        typeof body.resolvedCategoryIdMap === 'object' &&
        !Array.isArray(body.resolvedCategoryIdMap)
      ) {
        const sanitized: Partial<Record<ProductCategory, string>> = {};
        for (const [slug, id] of Object.entries(
          body.resolvedCategoryIdMap as Record<string, unknown>
        )) {
          if (isValidProductCategory(slug) && typeof id === 'string' && isValidKalodataId(id.trim())) {
            sanitized[slug] = id.trim();
          }
        }
        if (Object.keys(sanitized).length > 0) resolvedCategoryIdMap = sanitized;
      }

      const preview = await previewSimilarProductsSearch({
        referenceProduct: rawProduct as unknown as ResearchProduct,
        customKeyword: typeof body.customKeyword === 'string' ? body.customKeyword.slice(0, 100) : undefined,
        resolvedCategoryIdMap,
        spendingLimitCredits: clampLinkSpendingLimit(body.spendingLimitCredits),
        forceRefresh: body.forceRefresh === true,
      });

      res.status(200).json({ ok: true, preview });
    } catch (error) {
      res.status(500).json({
        ok: false,
        code: 'SIMILAR_PREVIEW_ERROR',
        error: sanitizeServerError(error, 'Unable to preview similar product search.'),
      });
    }
  });

  // Phase 3: Similar Product Finder — Server-Cache-First / Confirmation-Gated Search
  app.post('/api/similar-products/search', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const body =
        req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
      const rawProduct =
        body.referenceProduct && typeof body.referenceProduct === 'object'
          ? (body.referenceProduct as Record<string, unknown>)
          : null;

      if (
        !rawProduct ||
        typeof rawProduct.id !== 'string' ||
        rawProduct.id.trim().length === 0 ||
        typeof rawProduct.name !== 'string' ||
        rawProduct.name.trim().length === 0 ||
        !isValidProductCategory(rawProduct.category)
      ) {
        res.status(400).json({
          ok: false,
          code: 'INVALID_PAYLOAD',
          error: 'Valid referenceProduct (id, name, category) is required to search similar products.',
          errorMy: 'ဆင်တူ Product ရှာဖွေရန် မှန်ကန်သော referenceProduct (id, name, category) လိုအပ်ပါသည်။',
        });
        return;
      }

      let resolvedCategoryIdMap: Partial<Record<ProductCategory, string>> | undefined;
      if (
        body.resolvedCategoryIdMap &&
        typeof body.resolvedCategoryIdMap === 'object' &&
        !Array.isArray(body.resolvedCategoryIdMap)
      ) {
        const sanitized: Partial<Record<ProductCategory, string>> = {};
        for (const [slug, id] of Object.entries(
          body.resolvedCategoryIdMap as Record<string, unknown>
        )) {
          if (isValidProductCategory(slug) && typeof id === 'string' && isValidKalodataId(id.trim())) {
            sanitized[slug] = id.trim();
          }
        }
        if (Object.keys(sanitized).length > 0) resolvedCategoryIdMap = sanitized;
      }

      let clientCachedDetails: Record<string, KalodataProductDetailEnrichmentRecord> | undefined;
      if (
        body.clientCachedDetails &&
        typeof body.clientCachedDetails === 'object' &&
        !Array.isArray(body.clientCachedDetails)
      ) {
        const sanitizedDetails: Record<string, KalodataProductDetailEnrichmentRecord> = {};
        let count = 0;
        for (const [pid, rec] of Object.entries(
          body.clientCachedDetails as Record<string, unknown>
        )) {
          if (count >= 100) break;
          if (
            typeof pid === 'string' &&
            pid.trim().length > 0 &&
            rec &&
            typeof rec === 'object' &&
            !Array.isArray(rec) &&
            typeof (rec as Record<string, unknown>).productId === 'string'
          ) {
            sanitizedDetails[pid.trim()] = rec as KalodataProductDetailEnrichmentRecord;
            count += 1;
          }
        }
        if (count > 0) clientCachedDetails = sanitizedDetails;
      }

      const rawWeight =
        typeof body.salesWeightPct === 'number' && Number.isFinite(body.salesWeightPct)
          ? Math.max(10, Math.min(90, Math.round(body.salesWeightPct)))
          : 50;

      const result = await searchSimilarProducts({
        referenceProduct: rawProduct as unknown as ResearchProduct,
        customKeyword: typeof body.customKeyword === 'string' ? body.customKeyword.slice(0, 100) : undefined,
        resolvedCategoryIdMap,
        clientCachedDetails,
        spendingLimitCredits: clampLinkSpendingLimit(body.spendingLimitCredits),
        salesWeightPct: rawWeight,
        userConfirmedPaidExecution: body.userConfirmedPaidExecution === true,
        forceRefresh: body.forceRefresh === true,
        idempotencyKey:
          typeof body.idempotencyKey === 'string' ? body.idempotencyKey.slice(0, 128) : undefined,
      });

      res.status(200).json(result);
    } catch (error) {
      if (error instanceof SimilarProductApiError) {
        res.status(error.status).json({
          ok: false,
          code: error.code,
          error: error.message,
          errorMy: error.errorMy,
          quotaPaused: error.code === 'RESEARCH_PAUSED',
          quotaStatus: error.code === 'RESEARCH_PAUSED' ? getResearchQuotaStatus() : undefined,
          budgetSnapshot: error.budgetSnapshot,
        });
        return;
      }

      res.status(500).json({
        ok: false,
        code: 'SIMILAR_SEARCH_INTERNAL_ERROR',
        error: sanitizeServerError(error, 'Unexpected server error while searching similar products.'),
        errorMy: 'ဆင်တူ Product များ ရှာဖွေစဉ် မမျှော်လင့်သော Server အမှား ဖြစ်ပွားခဲ့ပါသည်။',
      });
    }
  });

  // Clean JSON error middleware for malformed JSON payloads or oversized requests
  app.use(
    (
      err: Error & { status?: number; type?: string },
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (res.headersSent) {
        next(err);
        return;
      }
      if (err?.type === 'entity.too.large' || err?.status === 413) {
        res.status(413).json({
          ok: false,
          error: 'Request payload is too large (max 1MB).',
          errorMy: 'ပေးပို့သော Request ဒေတာပမာဏ ကြီးလွန်းနေပါသည် (အများဆုံး 1MB)။',
          code: 'PAYLOAD_TOO_LARGE',
        });
        return;
      }
      if (err instanceof SyntaxError || err?.type === 'entity.parse.failed' || err?.status === 400) {
        res.status(400).json({
          ok: false,
          error: 'Malformed JSON request body.',
          errorMy: 'Request JSON ပုံစံ မမှန်ကန်ပါ။',
          code: 'INVALID_JSON',
        });
        return;
      }
      if (req.path.startsWith('/api/')) {
        res.status(500).json({
          ok: false,
          error: 'Internal server error.',
          code: 'INTERNAL_ERROR',
        });
        return;
      }
      next(err);
    }
  );

  if (!IS_PRODUCTION) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SiamPick server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
