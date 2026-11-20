import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import type {
  CompetitionLevel,
  CosmeticsComplianceRisk,
  FashionReturnRisk,
  ProductCategory,
  ResearchMode,
  ResearchProduct,
  RiskSeverity,
  StrategyPreset,
  VerificationState,
  VideoContentIdea,
} from '../src/types/product.ts';

const GEMINI_KALODATA_ANALYSIS_MODELS: readonly string[] = [
  'gemini-4-hydrogen',
  'gemini-3.1-flash-lite',
];
const GEMINI_CALL_TIMEOUT_MS = 8_000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Gemini timeout after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface ParsedProductDetail {
  productId: string;
  productShopId: string | null;
  minPriceThb: number | null;
  maxPriceThb: number | null;
  unitPriceThb: number | null;
  revenueThb: number | null;
  salesVolume: number | null;
  videoRevenueThb: number | null;
  liveRevenueThb: number | null;
  shoppingMallRevenueThb: number | null;
  commissionRatePct: number | null;
  creatorNumber: number | null;
  videoNumber: number | null;
  liveNumber: number | null;
  deliveryType: string | null;
  productReviewCount: number | null;
  launchDate: string | null;
  trendPointsCount: number;
  trendPeakThb: number | null;
  trendAvgThb: number | null;
}

export interface ParsedShopDetail {
  shopId: string;
  shopName: string | null;
  sellerType: string | null;
  revenueThb: number | null;
  affiliateRevenueThb: number | null;
  selfAccountRevenueThb: number | null;
  shoppingMallRevenueThb: number | null;
  salesVolume: number | null;
  unitPriceThb: number | null;
  creatorNumber: number | null;
  productNumber: number | null;
  videoNumber: number | null;
  liveNumber: number | null;
}

export interface ParsedCommentInsight {
  productId: string;
  summary: string | null;
  positivePoints: { point: string; mentions: number }[];
  painPoints: { point: string; mentions: number }[];
  usageScenarios: { point: string; mentions: number }[];
  commentsAnalyzed: number;
  averageRating: number | null;
  ratedCommentCount: number;
}

function toFinite(val: unknown): number | null {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string' && val.trim() !== '') {
    const n = Number(val);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function toCleanString(val: unknown): string | null {
  if (typeof val === 'string' && val.trim().length > 0) return val.trim();
  if (typeof val === 'number' && Number.isFinite(val)) return String(val);
  return null;
}

function normalizeCommissionPct(raw: number | null): number | null {
  if (raw === null || raw <= 0) return null;
  if (raw < 1) return Math.round(raw * 10000) / 100;
  return Math.round(raw * 100) / 100;
}

export function parseKalodataProductDetail(
  productId: string,
  data: Record<string, unknown> | null
): ParsedProductDetail | null {
  if (!data) return null;

  // Kalodata product/detail revenue_trend values arrive ×100 (per official Kalodata CLI spec)
  const rawTrend = Array.isArray(data.revenue_trend) ? data.revenue_trend : [];
  const trendValues: number[] = [];
  for (const pt of rawTrend) {
    const direct = toFinite(pt);
    if (direct !== null) {
      trendValues.push(Math.round((direct / 100) * 100) / 100);
    } else if (pt && typeof pt === 'object') {
      for (const v of Object.values(pt as Record<string, unknown>)) {
        const n = toFinite(v);
        if (n !== null) trendValues.push(Math.round((n / 100) * 100) / 100);
      }
    }
  }

  const trendPeakThb = trendValues.length > 0 ? Math.max(...trendValues) : null;
  const trendAvgThb =
    trendValues.length > 0
      ? Math.round((trendValues.reduce((a, b) => a + b, 0) / trendValues.length) * 100) / 100
      : null;

  return {
    productId,
    productShopId:
      toCleanString(data.product_shop_id) ??
      toCleanString(data.shop_id) ??
      toCleanString(data.seller_id),
    minPriceThb: toFinite(data.min_price),
    maxPriceThb: toFinite(data.max_price),
    unitPriceThb: toFinite(data.unit_price),
    revenueThb: toFinite(data.revenue),
    salesVolume: toFinite(data.sales_volumn ?? data.sales_volume),
    videoRevenueThb: toFinite(data.video_revenue),
    liveRevenueThb: toFinite(data.live_revenue),
    shoppingMallRevenueThb: toFinite(data.shopping_mall_revenue),
    commissionRatePct: normalizeCommissionPct(toFinite(data.commission_rate)),
    creatorNumber: toFinite(data.creator_number),
    videoNumber: toFinite(data.video_number),
    liveNumber: toFinite(data.live_number),
    deliveryType: toCleanString(data.delivery_type),
    productReviewCount: toFinite(data.product_review_count),
    launchDate: toCleanString(data.launch_date),
    trendPointsCount: trendValues.length,
    trendPeakThb,
    trendAvgThb,
  };
}

export function parseKalodataShopDetail(
  shopId: string,
  data: Record<string, unknown> | null
): ParsedShopDetail | null {
  if (!data) return null;
  return {
    shopId,
    shopName: toCleanString(data.shop_name),
    sellerType: toCleanString(data.seller_type ?? data.shop_type),
    revenueThb: toFinite(data.revenue),
    affiliateRevenueThb: toFinite(data.affiliate_revenue),
    selfAccountRevenueThb: toFinite(data.self_account_revenue ?? data.self_promotion_revenue),
    shoppingMallRevenueThb: toFinite(data.shoppingmall_revenue ?? data.shopping_mall_revenue),
    salesVolume: toFinite(data.sales_volumn ?? data.sales_volume),
    unitPriceThb: toFinite(data.unit_price),
    creatorNumber: toFinite(data.creator_number),
    productNumber: toFinite(data.product_number ?? data.on_sell_product_count),
    videoNumber: toFinite(data.video_number),
    liveNumber: toFinite(data.live_number),
  };
}

function parseInsightPoints(raw: unknown): { point: string; mentions: number }[] {
  if (!Array.isArray(raw)) return [];
  const out: { point: string; mentions: number }[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const point = toCleanString(obj.view_point);
    if (!point) continue;
    const mentions = Array.isArray(obj.id_list) ? obj.id_list.length : 1;
    out.push({ point, mentions });
  }
  out.sort((a, b) => b.mentions - a.mentions);
  return out;
}

export function parseKalodataCommentInsight(
  productId: string,
  data: Record<string, unknown> | null
): ParsedCommentInsight | null {
  if (!data) return null;
  const commentSummary =
    data.comment_summary && typeof data.comment_summary === 'object'
      ? toCleanString((data.comment_summary as Record<string, unknown>).summary)
      : null;

  const originalComments = Array.isArray(data.original_comments) ? data.original_comments : [];
  const ratings: number[] = [];
  for (const c of originalComments) {
    if (!c || typeof c !== 'object') continue;
    const obj = c as Record<string, unknown>;
    const nested =
      obj.review && typeof obj.review === 'object'
        ? (obj.review as Record<string, unknown>)
        : {};
    const r = toFinite(nested.rating ?? obj.rating);
    if (r !== null && r >= 1 && r <= 5) {
      ratings.push(r);
    }
  }

  const averageRating =
    ratings.length > 0
      ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
      : null;

  return {
    productId,
    summary: commentSummary,
    positivePoints: parseInsightPoints(data.positive_points),
    painPoints: parseInsightPoints(data.pain_points),
    usageScenarios: parseInsightPoints(data.usage_scenarios),
    commentsAnalyzed: originalComments.length,
    averageRating,
    ratedCommentCount: ratings.length,
  };
}

export function deriveCompetitionFromCreatorNumber(creatorNumber: number): {
  level: CompetitionLevel;
  rawStrength: number;
} {
  // For an affiliate creator, lower-to-moderate active creator count with strong demand means better opportunity
  if (creatorNumber <= 25) {
    return { level: 'Low', rawStrength: 86 };
  }
  if (creatorNumber <= 120) {
    return { level: 'Moderate', rawStrength: 68 };
  }
  return { level: 'High', rawStrength: 44 };
}

export function deriveSellerReliabilityFromShop(shop: ParsedShopDetail): {
  level: 'Reliable' | 'Standard' | 'Needs Check';
  rawStrength: number;
} {
  const isBrand = (shop.sellerType ?? '').toUpperCase() === 'BRAND';
  const rev = shop.revenueThb ?? 0;
  const affRev = shop.affiliateRevenueThb ?? 0;
  const affShare = rev > 0 ? affRev / rev : 0;

  let score = 58;
  if (isBrand) score += 20;
  if (rev >= 10_000_000) score += 14;
  else if (rev >= 1_000_000) score += 9;
  else if (rev >= 200_000) score += 4;
  if (affShare >= 0.15) score += 6;

  const clamped = Math.max(40, Math.min(96, score));
  const level =
    clamped >= 78 ? 'Reliable' : clamped >= 58 ? 'Standard' : 'Needs Check';
  return { level, rawStrength: clamped };
}

export interface RankCandidateRow {
  item: Record<string, unknown>;
  category: ProductCategory;
  categoryIds: string[];
}

/**
 * Balanced & Deep Mode multi-signal candidate filtering & ranking:
 * Evaluates a wider pool from Kalodata Product Rank (within the same 100-row cost bracket)
 * to compare revenue, sales volume, commission rate, growth stability, and video channel fit.
 */
export function selectBestCandidatesForMode(
  rows: RankCandidateRow[],
  targetCount: number,
  salesWeightPct: number,
  strategyPreset: StrategyPreset
): RankCandidateRow[] {
  if (rows.length <= targetCount) return rows;

  const salesW = Math.max(0.15, Math.min(0.85, salesWeightPct / 100));
  const commW = 1 - salesW;

  const scored = rows.map((row, idx) => {
    const it = row.item;
    const revenue = Math.max(0, toFinite(it.revenue) ?? 0);
    const sales = Math.max(0, toFinite(it.sales_volumn) ?? 0);
    const growth = toFinite(it.revenue_growth_rate) ?? 0;
    const rawComm = toFinite(it.commission_rate) ?? 0;
    const comm = normalizeCommissionPct(rawComm) ?? 0;
    const videoRev = Math.max(0, toFinite(it.video_revenue) ?? 0);
    const price = Math.max(0, toFinite(it.unit_price) ?? 0);

    const demandScore =
      Math.min(55, Math.log10(revenue + 10) * 9) +
      Math.min(35, Math.log10(sales + 10) * 9) +
      Math.max(-10, Math.min(12, growth * 0.15));

    const commissionEarningPerSale = (price * comm) / 100;
    const commScore =
      Math.min(65, comm * 4.5) +
      Math.min(35, Math.log10(commissionEarningPerSale + 1) * 18);

    const videoShare = revenue > 0 ? videoRev / revenue : 0;
    const videoBonus = Math.min(10, videoShare * 18);
    // Light penalty for steep revenue collapse when better candidates exist
    const stabilityPenalty = growth < -35 ? -10 : sales < 10 ? -6 : 0;

    const presetBoost =
      strategyPreset === 'commission-first'
        ? comm * 0.4
        : strategyPreset === 'sales-first'
          ? Math.log10(sales + 10) * 2
          : 0;

    const composite =
      demandScore * salesW + commScore * commW + videoBonus + stabilityPenalty + presetBoost;

    return { row, composite, idx };
  });

  scored.sort((a, b) => b.composite - a.composite || a.idx - b.idx);
  return scored.slice(0, targetCount).map((entry) => entry.row);
}

function extractJsonObject(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const first = candidate.indexOf('{');
  const last = candidate.lastIndexOf('}');
  if (first !== -1 && last > first) {
    return candidate.slice(first, last + 1);
  }
  return candidate;
}

function cleanText(val: unknown, fallback: string): string {
  return typeof val === 'string' && val.trim().length > 0 ? val.trim() : fallback;
}

function cleanStringList(val: unknown, fallback: string[]): string[] {
  if (!Array.isArray(val)) return fallback;
  const items = val
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .map((v) => v.trim());
  return items.length > 0 ? items : fallback;
}

function mergeFashionRisk(
  raw: unknown,
  existing: FashionReturnRisk | undefined
): FashionReturnRisk | undefined {
  if (!existing) return undefined;
  if (!raw || typeof raw !== 'object') return existing;
  const obj = raw as Record<string, unknown>;
  const parse = (
    field: unknown,
    fb: FashionReturnRisk[keyof FashionReturnRisk]
  ): FashionReturnRisk[keyof FashionReturnRisk] => {
    if (!field || typeof field !== 'object') return fb;
    const f = field as Record<string, unknown>;
    const level: RiskSeverity =
      f.level === 'Low' || f.level === 'Watch' || f.level === 'High' ? f.level : fb.level;
    return {
      level,
      noteEn: cleanText(f.noteEn, fb.noteEn),
      noteMy: cleanText(f.noteMy, fb.noteMy),
    };
  };
  return {
    sizing: parse(obj.sizing, existing.sizing),
    fabric: parse(obj.fabric, existing.fabric),
    colorAccuracy: parse(obj.colorAccuracy, existing.colorAccuracy),
    fitDifference: parse(obj.fitDifference, existing.fitDifference),
  };
}

function mergeCosmeticsRisk(
  raw: unknown,
  existing: CosmeticsComplianceRisk | undefined
): CosmeticsComplianceRisk | undefined {
  if (!existing) return undefined;
  if (!raw || typeof raw !== 'object') return existing;
  const obj = raw as Record<string, unknown>;
  const parse = (
    field: unknown,
    fb: CosmeticsComplianceRisk[keyof CosmeticsComplianceRisk]
  ): CosmeticsComplianceRisk[keyof CosmeticsComplianceRisk] => {
    if (!field || typeof field !== 'object') return fb;
    const f = field as Record<string, unknown>;
    const status: VerificationState =
      f.status === 'Verified' || f.status === 'Needs Check' || f.status === 'Caution'
        ? f.status
        : fb.status;
    return {
      status,
      noteEn: cleanText(f.noteEn, fb.noteEn),
      noteMy: cleanText(f.noteMy, fb.noteMy),
    };
  };
  return {
    brandAuthenticity: parse(obj.brandAuthenticity, existing.brandAuthenticity),
    thaiFda: parse(obj.thaiFda, existing.thaiFda),
    adClaimSafety: parse(obj.adClaimSafety, existing.adClaimSafety),
  };
}

function mergeVideoIdeas(
  raw: unknown,
  existing: [VideoContentIdea, VideoContentIdea, VideoContentIdea]
): [VideoContentIdea, VideoContentIdea, VideoContentIdea] {
  if (!Array.isArray(raw) || raw.length === 0) return existing;
  const out = existing.map((fb, idx) => {
    const item = raw[idx];
    if (!item || typeof item !== 'object') return fb;
    const o = item as Record<string, unknown>;
    return {
      titleEn: cleanText(o.titleEn, fb.titleEn),
      titleMy: cleanText(o.titleMy, fb.titleMy),
      formatEn: cleanText(o.formatEn, fb.formatEn),
      formatMy: cleanText(o.formatMy, fb.formatMy),
      outlineEn: cleanText(o.outlineEn, fb.outlineEn),
      outlineMy: cleanText(o.outlineMy, fb.outlineMy),
    };
  });
  return [out[0], out[1], out[2]];
}

/**
 * Uses Gemini (gemini-4-hydrogen) STRICTLY to analyze already-fetched Kalodata OpenAPI data
 * in Balanced and Deep Research modes.
 * - ZERO Google Search Grounding (no tools passed).
 * - NEVER fabricates or overwrites numeric metrics or DataStatus provenance flags.
 * - Graceful failure: if Gemini is unavailable or errors, returns original products untouched
 *   so paid Kalodata data is never lost.
 */
export async function analyzeKalodataProductsWithGemini(
  products: ResearchProduct[],
  mode: Exclude<ResearchMode, 'fast'>,
  strategyPreset: StrategyPreset,
  salesWeightPct: number
): Promise<{ products: ResearchProduct[]; applied: boolean }> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || products.length === 0) {
    return { products, applied: false };
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  // Analyze up to top 20 products in chunks of 10 to keep response time fast and deterministic
  const maxToAnalyze = Math.min(products.length, 20);
  const updated = [...products];
  let anyApplied = false;

  const systemInstruction =
    mode === 'deep'
      ? `You are a senior Thailand TikTok Shop Affiliate Research Analyst performing a DEEP RESEARCH AUDIT strictly on the provided Kalodata OpenAPI JSON data.
ABSOLUTE RULES:
1. Analyze ONLY the supplied Kalodata metrics (sales, revenue, growth, commission, creator count, review count, shop metrics, delivery type, and any buyer review insight).
2. NEVER invent missing numbers, star ratings, review counts, Thai FDA numbers, or unprovided metrics. Explicitly highlight missing/unverified items as risks to check before promoting.
3. Produce deeply practical, differentiated bilingual English (*En) and natural Burmese (*My) analysis covering concrete strengths, weaknesses, competition/saturation risk, delivery/return risk, and Thailand TikTok short-video angles tailored to each exact product.
4. Return ONLY valid JSON matching the requested schema.`
      : `You are a Thailand TikTok Shop Affiliate Research Analyst performing a BALANCED COMPARATIVE ANALYSIS strictly on the provided Kalodata OpenAPI JSON data.
ABSOLUTE RULES:
1. Analyze ONLY the supplied Kalodata metrics. NEVER invent star ratings, review counts, or external facts not present in the JSON.
2. Compare products against their peer group in this batch and deliver concise, practical English (*En) and natural Burmese (*My) strengths, risks, and short-video hooks.
3. Return ONLY valid JSON matching the requested schema.`;

  for (let start = 0; start < maxToAnalyze; start += 10) {
    const slice = products.slice(start, Math.min(maxToAnalyze, start + 10));
    const compactPayload = slice.map((p, idx) => {
      const m = p.kalodataMetrics;
      return {
        index: start + idx,
        name: p.name,
        category: p.category,
        subCategory: p.subCategory,
        shopName: p.shopName,
        depthTag: p.researchDepthTag ?? 'rank-only',
        priceThb: p.priceThb,
        minPriceThb: m?.minPriceThb ?? null,
        maxPriceThb: m?.maxPriceThb ?? null,
        commissionRatePct: p.commissionRate,
        estCommissionPerSaleThb: p.estimatedCommissionPerSaleThb ?? null,
        dateRange: m?.dateRange ?? 'last30Day',
        salesVolume: m?.salesVolume ?? null,
        revenueThb: m?.revenueThb ?? null,
        revenueGrowthRatePct: m?.revenueGrowthRate ?? null,
        videoRevenueThb: m?.videoRevenueThb ?? null,
        liveRevenueThb: m?.liveRevenueThb ?? null,
        showcaseRevenueThb: m?.showcaseRevenueThb ?? null,
        shoppingMallRevenueThb: m?.shoppingMallRevenueThb ?? null,
        creatorNumber: m?.creatorNumber ?? null,
        videoNumber: m?.videoNumber ?? null,
        liveNumber: m?.liveNumber ?? null,
        deliveryType: m?.deliveryType ?? null,
        productReviewCount: p.reviewCount ?? null,
        customerRating: p.customerRating ?? null,
        shopSellerType: m?.shopSellerType ?? null,
        shopRevenueThb: m?.shopRevenueThb ?? null,
        shopAffiliateRevenueThb: m?.shopAffiliateRevenueThb ?? null,
        shopCreatorNumber: m?.shopCreatorNumber ?? null,
        shopProductNumber: m?.shopProductNumber ?? null,
        verifiedReviewStrengths: p.reviewStrengthsEn.slice(0, 4),
        verifiedBuyerPainPoints: p.customerComplaintsEn.slice(0, 4),
      };
    });

    const prompt = `Research Mode: ${mode.toUpperCase()} | Strategy: ${strategyPreset} (${salesWeightPct}% sales / ${100 - salesWeightPct}% commission)
Analyze each Thailand TikTok Shop affiliate product below using ONLY these real Kalodata metrics. Do NOT fabricate any null/missing field.

Products JSON:
${JSON.stringify(compactPayload)}

Return ONLY valid JSON:
{
  "analyses": [
    {
      "index": 0,
      "whyChooseEn": "Concise comparative affiliate rationale grounded in the exact Kalodata metrics",
      "whyChooseMy": "Natural Burmese affiliate rationale grounded in the exact Kalodata metrics",
      "salesPotentialEn": "Practical sales velocity & channel split insight (Video vs Live vs Mall)",
      "salesPotentialMy": "Burmese sales potential & channel split insight",
      "generalRisksEn": ["Concrete weakness or risk 1 based on the data or missing fields", "Risk 2", "Risk 3"],
      "generalRisksMy": ["Burmese risk 1", "Burmese risk 2", "Burmese risk 3"],
      "aiVideoDetailEn": "Specific video/creative angle suited to this product and its video revenue share",
      "aiVideoDetailMy": "Burmese video creative angle",
      "fashionReturnRisk": {
        "sizing": { "level": "Low" | "Watch" | "High", "noteEn": "string", "noteMy": "string" },
        "fabric": { "level": "Low" | "Watch" | "High", "noteEn": "string", "noteMy": "string" },
        "colorAccuracy": { "level": "Low" | "Watch" | "High", "noteEn": "string", "noteMy": "string" },
        "fitDifference": { "level": "Low" | "Watch" | "High", "noteEn": "string", "noteMy": "string" }
      },
      "cosmeticsComplianceRisk": {
        "brandAuthenticity": { "status": "Verified" | "Needs Check" | "Caution", "noteEn": "string", "noteMy": "string" },
        "thaiFda": { "status": "Verified" | "Needs Check" | "Caution", "noteEn": "string", "noteMy": "string" },
        "adClaimSafety": { "status": "Verified" | "Needs Check" | "Caution", "noteEn": "string", "noteMy": "string" }
      },
      "videoIdeas": [
        { "titleEn": "string", "titleMy": "string", "formatEn": "string", "formatMy": "string", "outlineEn": "string", "outlineMy": "string" },
        { "titleEn": "string", "titleMy": "string", "formatEn": "string", "formatMy": "string", "outlineEn": "string", "outlineMy": "string" },
        { "titleEn": "string", "titleMy": "string", "formatEn": "string", "formatMy": "string", "outlineEn": "string", "outlineMy": "string" }
      ]
    }
  ]
}
Note: Only include fashionReturnRisk for womens-fashion items and cosmeticsComplianceRisk for cosmetics-beauty items.`;

    let sliceApplied = false;
    for (const modelName of GEMINI_KALODATA_ANALYSIS_MODELS) {
      try {
        const response = await withTimeout(
          ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: {
              systemInstruction,
              responseMimeType: 'application/json',
              thinkingConfig: {
                thinkingLevel: ThinkingLevel.LOW,
              },
            },
          }),
          GEMINI_CALL_TIMEOUT_MS
        );

        const rawText = (response.text ?? '').trim();
        if (!rawText) continue;

        const parsed: unknown = JSON.parse(extractJsonObject(rawText));
        const list: Record<string, unknown>[] =
          parsed &&
          typeof parsed === 'object' &&
          Array.isArray((parsed as { analyses?: unknown[] }).analyses)
            ? (parsed as { analyses: Record<string, unknown>[] }).analyses
            : Array.isArray(parsed)
              ? (parsed as Record<string, unknown>[])
              : [];

        if (list.length === 0) continue;

        list.forEach((entry, fallbackIdx) => {
          if (!entry || typeof entry !== 'object') return;
          const idx =
            typeof entry.index === 'number' ? entry.index : start + fallbackIdx;
          if (idx < start || idx >= start + slice.length) return;
          const base = updated[idx];
          if (!base) return;

          updated[idx] = {
            ...base,
            whyChooseEn: cleanText(entry.whyChooseEn, base.whyChooseEn),
            whyChooseMy: cleanText(entry.whyChooseMy, base.whyChooseMy),
            salesPotentialEn: cleanText(entry.salesPotentialEn, base.salesPotentialEn),
            salesPotentialMy: cleanText(entry.salesPotentialMy, base.salesPotentialMy),
            generalRisksEn: cleanStringList(entry.generalRisksEn, base.generalRisksEn),
            generalRisksMy: cleanStringList(entry.generalRisksMy, base.generalRisksMy),
            aiVideoDetailEn: cleanText(entry.aiVideoDetailEn, base.aiVideoDetailEn),
            aiVideoDetailMy: cleanText(entry.aiVideoDetailMy, base.aiVideoDetailMy),
            fashionReturnRisk:
              base.category === 'womens-fashion'
                ? mergeFashionRisk(entry.fashionReturnRisk, base.fashionReturnRisk)
                : undefined,
            cosmeticsComplianceRisk:
              base.category === 'cosmetics-beauty'
                ? mergeCosmeticsRisk(entry.cosmeticsComplianceRisk, base.cosmeticsComplianceRisk)
                : undefined,
            videoIdeas: mergeVideoIdeas(entry.videoIdeas, base.videoIdeas),
          };
          anyApplied = true;
          sliceApplied = true;
        });

        if (sliceApplied) break;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[SiamPick Gemini Kalodata Analysis] ${modelName} skipped: ${msg.slice(0, 180)}`);
        if (msg.includes('Gemini timeout')) {
          break;
        }
      }
    }
  }

  return { products: updated, applied: anyApplied };
}
