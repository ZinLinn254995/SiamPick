import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type {
  CategoryFilter,
  ResearchConfig,
  ResearchQuantity,
  StrategyPreset,
} from './src/types/product.ts';
import {
  getResearchQuotaStatus,
  pauseResearch,
  ResearchApiError,
  resumeResearch,
  runThailandProductResearch,
} from './server/researchService.ts';
import { isAllowlistedImageUrl, isSafeExternalUrl } from './server/imageRetriever.ts';
import {
  fetchKalodataCreditBalance,
  fetchKalodataProductRank,
  type KalodataProductRankRequest,
} from './server/kalodataService.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

function validateConfig(body: unknown): { config: ResearchConfig; forceResume: boolean } {
  const input = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};

  const category: CategoryFilter =
    input.category === 'womens-fashion' ||
    input.category === 'cosmetics-beauty' ||
    input.category === 'all'
      ? input.category
      : 'all';

  const quantity: ResearchQuantity =
    input.quantity === 10 || input.quantity === 20 || input.quantity === 30
      ? input.quantity
      : 10;

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
