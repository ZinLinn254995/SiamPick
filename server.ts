import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type {
  BothCategoryMode,
  CategoryFilter,
  ProductCategory,
  ResearchConfig,
  ResearchMode,
  ResearchQuantity,
  StrategyPreset,
} from './src/types/product.ts';
import {
  clampDeepDiveCount,
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
import { isAllowlistedImageUrl, isSafeExternalUrl } from './server/imageRetriever.ts';
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

  let selectedCategories: ProductCategory[];
  if (Array.isArray(input.selectedCategories)) {
    selectedCategories = Array.from(
      new Set(
        input.selectedCategories.filter(
          (item): item is ProductCategory =>
            item === 'womens-fashion' || item === 'cosmetics-beauty'
        )
      )
    );
  } else {
    const legacyCategory: CategoryFilter =
      input.category === 'womens-fashion' ||
      input.category === 'cosmetics-beauty' ||
      input.category === 'all'
        ? input.category
        : 'all';
    selectedCategories =
      legacyCategory === 'all'
        ? ['womens-fashion', 'cosmetics-beauty']
        : [legacyCategory];
  }

  const category: CategoryFilter =
    selectedCategories.length === 1 ? selectedCategories[0] : 'all';

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

  return {
    config: {
      market: 'Thailand TikTok Shop',
      category,
      selectedCategories,
      bothCategoryMode,
      researchMode,
      deepDiveCount,
      includeReviewInsights,
      spendingLimitCredits,
      priceLimit: 'unrestricted',
      strategyPreset,
      salesWeightPct,
      quantity,
    },
    forceResume: input.forceResume === true,
  };
}

async function startServer() {
  const app = express();
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
    const result = await fetchKalodataCreditBalance();
    res.status(200).json(result);
  });

  app.post('/api/kalodata/product-rank', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
    const sortInput =
      body.sort_field && typeof body.sort_field === 'object'
        ? (body.sort_field as Record<string, unknown>)
        : {};

    const params: KalodataProductRankRequest = {
      region: typeof body.region === 'string' && body.region.trim() ? body.region.trim() : 'TH',
      language:
        typeof body.language === 'string' && body.language.trim() ? body.language.trim() : 'en-US',
      currency:
        typeof body.currency === 'string' && body.currency.trim() ? body.currency.trim() : 'THB',
      date_range:
        typeof body.date_range === 'string' && body.date_range.trim()
          ? body.date_range.trim()
          : 'last7Day',
      page_number:
        typeof body.page_number === 'number' && Number.isInteger(body.page_number) && body.page_number >= 1
          ? body.page_number
          : 1,
      page_size:
        typeof body.page_size === 'number' &&
        Number.isInteger(body.page_size) &&
        body.page_size >= 1 &&
        body.page_size <= 100
          ? body.page_size
          : 10,
      sort_field: {
        field:
          typeof sortInput.field === 'string' && sortInput.field.trim()
            ? sortInput.field.trim()
            : 'revenue',
        type: sortInput.type === 'ASC' ? 'ASC' : 'DESC',
      },
    };

    if (body.is_affiliate === 0 || body.is_affiliate === 1) {
      params.is_affiliate = body.is_affiliate;
    }
    if (body.need_image === 0 || body.need_image === 1 || body.need_image === 2) {
      params.need_image = body.need_image;
    }
    if (typeof body.need_extra === 'boolean') {
      params.need_extra = body.need_extra;
    }
    if (Array.isArray(body.category_ids)) {
      const ids = body.category_ids.filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
      if (ids.length > 0) params.category_ids = ids;
    }
    if (typeof body.commission_rate === 'string' && body.commission_rate.trim()) {
      params.commission_rate = body.commission_rate.trim();
    }
    if (typeof body.unit_price_range === 'string' && body.unit_price_range.trim()) {
      params.unit_price_range = body.unit_price_range.trim();
    }
    if (typeof body.keyword === 'string' && body.keyword.trim()) {
      params.keyword = body.keyword.trim();
    }

    const result = await fetchKalodataProductRank(params);
    res.status(200).json(result);
  });

  app.post('/api/kalodata/category-rank', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
    const sortInput =
      body.sort_field && typeof body.sort_field === 'object'
        ? (body.sort_field as Record<string, unknown>)
        : {};

    const allowedRegions = new Set([
      'US', 'BR', 'MX', 'ID', 'JP', 'MY', 'PH', 'SG', 'TH', 'VN',
      'GB', 'ES', 'DE', 'FR', 'IT', 'PL', 'NL', 'BE', 'CZ', 'AT', 'GR', 'PT', 'HU', 'IE',
    ]);
    const allowedLanguages = new Set([
      'zh-CN', 'en-US', 'id-ID', 'th-TH', 'vi-VN', 'es-ES', 'ja-JP', 'pt-BR',
      'ko-KR', 'fr-FR', 'de-DE', 'pl-PL', 'nl-NL', 'cs-CZ', 'el-GR', 'hu-HU', 'pt-PT', 'it-IT',
    ]);
    const allowedCurrencies = new Set([
      'CNY', 'USD', 'IDR', 'VND', 'THB', 'MYR', 'JPY', 'PHP', 'GBP', 'SGD',
      'MXN', 'EUR', 'BRL', 'PLN', 'CZK', 'HUF',
    ]);
    const allowedDateRanges = new Set<KalodataCategoryRankDateRange>([
      'last7Day',
      'last30Day',
      'last90Day',
      'last180Day',
      'last365Day',
    ]);
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
      region: allowedRegions.has(rawRegion) ? rawRegion : 'TH',
      language: allowedLanguages.has(rawLanguage) ? rawLanguage : 'en-US',
      currency: allowedCurrencies.has(rawCurrency) ? rawCurrency : 'THB',
      date_range: allowedDateRanges.has(rawDateRange as KalodataCategoryRankDateRange)
        ? (rawDateRange as KalodataCategoryRankDateRange)
        : 'last30Day',
      page_number:
        typeof body.page_number === 'number' && Number.isInteger(body.page_number) && body.page_number >= 1
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
        .filter((id): id is string => typeof id === 'string' && id.trim().length > 0 && id.trim().length <= 64)
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
  });

  app.post('/api/kalodata/product-detail', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
    const kind =
      body.kind === 'shop' || body.kind === 'comments' ? body.kind : 'product';
    const region = typeof body.region === 'string' && body.region.trim() ? body.region.trim() : 'TH';
    const language =
      typeof body.language === 'string' && body.language.trim() ? body.language.trim() : 'en-US';
    const currency =
      typeof body.currency === 'string' && body.currency.trim() ? body.currency.trim() : 'THB';
    const dateRange =
      typeof body.date_range === 'string' && body.date_range.trim()
        ? body.date_range.trim()
        : 'last30Day';

    if (kind === 'shop') {
      const shopId = typeof body.shop_id === 'string' ? body.shop_id.trim() : '';
      if (!shopId) {
        res.status(400).json({ ok: false, error: 'shop_id is required.' });
        return;
      }
      const result = await fetchKalodataShopDetail({
        region,
        language,
        currency,
        date_range: dateRange,
        shop_id: shopId,
        need_extra: true,
      });
      res.status(200).json(result);
      return;
    }

    const productId = typeof body.product_id === 'string' ? body.product_id.trim() : '';
    if (!productId) {
      res.status(400).json({ ok: false, error: 'product_id is required.' });
      return;
    }

    if (kind === 'comments') {
      const result = await fetchKalodataProductCommentInsight({
        product_id: productId,
        country_code: region.toLowerCase(),
      });
      res.status(200).json(result);
      return;
    }

    const result = await fetchKalodataProductDetail({
      region,
      language,
      currency,
      date_range: dateRange,
      product_id: productId,
      need_extra: true,
    });
    res.status(200).json(result);
  });

  /**
   * Verified Product Image Proxy:
   * Streams ONLY server-verified, allowlisted https:// image/* URLs so browser hotlink/Referer
   * policies never break legitimate official brand/listing product photos.
   */
  app.get('/api/image-proxy', async (req, res) => {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url : '';
    if (!rawUrl || !isSafeExternalUrl(rawUrl) || !isAllowlistedImageUrl(rawUrl)) {
      res.status(403).end();
      return;
    }

    try {
      const upstream = await fetch(rawUrl, {
        redirect: 'follow',
        signal: AbortSignal.timeout(5000),
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          Accept: 'image/avif,image/webp,image/png,image/jpeg,*/*;q=0.8',
        },
      });

      if (!upstream.ok) {
        res.status(404).end();
        return;
      }

      const contentType = (upstream.headers.get('content-type') ?? '').toLowerCase();
      if (!/^image\/(jpeg|jpg|png|webp|avif)/.test(contentType)) {
        res.status(415).end();
        return;
      }

      const buffer = Buffer.from(await upstream.arrayBuffer());
      if (buffer.byteLength < 1024) {
        res.status(404).end();
        return;
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(buffer);
    } catch {
      res.status(502).end();
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
      const message =
        error instanceof Error ? error.message : 'Unexpected server error during research.';
      res.status(500).json({
        error: message,
        code: 'INTERNAL_ERROR',
      });
    }
  });

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
