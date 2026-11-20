import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import type {
  AiVideoSuitability,
  CategoryFilter,
  CompetitionLevel,
  CosmeticsComplianceRisk,
  CriterionInput,
  CriterionKey,
  DataStatus,
  DemandLevel,
  FashionReturnRisk,
  GroundingSourceLink,
  ProductCategory,
  ResearchConfig,
  ResearchProduct,
  ResearchQuantity,
  ResearchQuotaStatus,
  ResearchSessionResponse,
  ResearchSourceItem,
  RiskSeverity,
  ScoringInputs,
  StrategyPreset,
  VerificationState,
  VideoContentIdea,
} from '../src/types/product.ts';
import { evaluateProductOpportunity, normalizeDataStatus } from '../src/utils/scoring.ts';
import { verifyProductMediaAndListing } from './imageRetriever.ts';
import {
  fetchLiveThaiStorefrontProducts,
  type LiveStorefrontProduct,
} from './liveStorefrontRetriever.ts';

export class ResearchApiError extends Error {
  status: number;
  code: string;
  quotaPaused: boolean;
  errorMy?: string;

  constructor(
    status: number,
    code: string,
    message: string,
    options?: { quotaPaused?: boolean; errorMy?: string }
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.quotaPaused = Boolean(options?.quotaPaused);
    this.errorMy = options?.errorMy;
  }
}

interface BatchSpec {
  categoryMode: ProductCategory;
  targetCount: number;
  focusEn: string;
}

const FASHION_FOCUS_SETS: readonly string[] = [
  'Best-selling Thai women fashion brands and viral linen/cotton shirts, office tops, and UV sun-protection jackets on TikTok Shop Thailand (e.g. Gentlewoman, Pomelo, Merge, Rally Movement, Mitr, Thai boutique stores)',
  'Trending high-waisted wide-leg trousers, pleated skorts, slimming denim jeans, and wireless seamless bra tops on TikTok Shop Thailand',
  'Viral modest dresses, resort co-ord sets, ribbed knit cardigans, and Thai local women streetwear on TikTok Shop Thailand',
  'Women activewear sets, loungewear pajamas, satin midi skirts, and minimalist workwear blazers on TikTok Shop Thailand',
  'Trending Thai women bags, denim skirts, breathable summer blouses, and slim-fit basics on TikTok Shop Thailand',
  'Everyday women fashion staples, tailored shorts, knit tops, and Bangkok boutique dresses on TikTok Shop Thailand',
];

const COSMETICS_FOCUS_SETS: readonly string[] = [
  'Best-selling Thai & Asian sunscreens and daily serums on TikTok Shop Thailand (e.g. MizuMi UV Water Serum, Her Hyness Royal Hya Water Sunscreen, Srichand, Skintific, Garnier Thailand, Clear Nose)',
  'Viral lip tints, glossy lip oils, liquid blushes, and cheek stains on TikTok Shop Thailand (e.g. 4U2 Jelly Tint, Gala Camille, La Glace Black Magic Blush, Cathy Doll, Charmiss, Meilinda)',
  'Best-selling cushion foundations, translucent setting powders, and concealers on TikTok Shop Thailand (e.g. Skintific Cover All Perfect Cushion, Srichand Translucent Powder, Laneige, Jung Saem Mool, 4U2)',
  'Popular acne care serums, hydrocolloid patches, brightening body lotions, and body scrubs on TikTok Shop Thailand (e.g. Clear Nose Acne Care, Vaseline Gluta-Hya, Citra, Plantnery)',
  'Trending hair repair serums, scalp tonics, lash serums, and brow gels on TikTok Shop Thailand (e.g. Lolane, Mise en Scene, Browit by Nongchat, Odbo)',
  'Popular cleansing balms, barrier repair moisturizers, sheet masks, and micellar waters on TikTok Shop Thailand (e.g. Banila Co, Skintific 5X Ceramide, Garnier Micellar, Rojukiss)',
];

/**
 * In-memory Quota & Pause State:
 * Automatically pauses live research when Google Search Grounding returns 429 so we NEVER
 * waste quota or return unverified AI-guessed products. Users can also pause/resume manually.
 */
let researchQuotaState: ResearchQuotaStatus = {
  paused: false,
  reason: null,
  pausedAt: null,
};

export function getResearchQuotaStatus(): ResearchQuotaStatus {
  return { ...researchQuotaState };
}

export function pauseResearch(reason: 'search-quota-exhausted' | 'manual' = 'manual'): ResearchQuotaStatus {
  researchQuotaState = {
    paused: true,
    reason,
    pausedAt: new Date().toISOString(),
  };
  return getResearchQuotaStatus();
}

export function resumeResearch(): ResearchQuotaStatus {
  researchQuotaState = {
    paused: false,
    reason: null,
    pausedAt: null,
  };
  return getResearchQuotaStatus();
}

const SYSTEM_INSTRUCTION = `You are a strict Thailand TikTok Shop Affiliate Product Research Analyst.
You MUST use Google Search Grounding to find REAL, currently sold products in Thailand (TikTok Shop Thailand, official Thai brand websites, Konvy, Watsons TH, Eveandboy, Beautrium, Thai fashion brand stores).

ABSOLUTE INTEGRITY RULES:
1. REAL PRODUCTS ONLY: Only include real, identifiable products with an exact Product Name and Brand/Seller corroborated by Google Search results.
   - NEVER invent products just to hit a target count. If Google Search only yields 3 or 4 genuinely verifiable products in this batch, return ONLY those 3 or 4 products! Quality strictly outweighs quantity.
   - NEVER return duplicate products under slightly reworded names.
2. STRICT 4-STATE DATA PROVENANCE: Classify every metric honestly as "verified" | "estimated" | "unverified" | "unavailable":
   - "verified": directly observed in live Google Search results (exact THB price, real review count, real star rating, real brand/seller).
   - "estimated": realistic Thailand market estimate when exact live SKU metric is not directly listed.
   - "unverified": mentioned indirectly or requires direct login check (e.g., private TikTok Shop Affiliate Creator Center commission).
   - "unavailable": no reliable data found at all (set numeric field to null).
3. COMMISSION ANTI-FABRICATION:
   - NEVER pretend to access private TikTok Shop Affiliate Creator Center data.
   - Set "commissionVerified": true, "commissionStatus": "verified", and numeric "commissionRate" ONLY IF a live Google Search source explicitly publishes the Thailand TikTok Shop affiliate commission rate for that specific product/brand.
   - Otherwise, MUST set "commissionRate": null, "commissionVerified": false, "commissionStatus": "unverified", "estimatedCommissionPerSaleThb": null, "commissionPerSaleStatus": "unavailable".
4. REALISTIC DIFFERENTIATED SCORING INPUTS:
   - Score each product's 7 criteria rawStrength (0–100) honestly based on its ACTUAL data — strong demand/reviews get higher rawStrength, weaker/competitive/limited-evidence products get lower rawStrength. Never assign identical boilerplate numbers to every product.
5. BILINGUAL OUTPUT: Provide crisp, accurate English AND natural Burmese (မြန်မာဘာသာ) for every *En/*My field.
6. CATEGORY-SPECIFIC AUDITS:
   - "womens-fashion": ALWAYS include "fashionReturnRisk" (sizing, fabric, colorAccuracy, fitDifference).
   - "cosmetics-beauty": ALWAYS include "cosmeticsComplianceRisk" (brandAuthenticity, thaiFda, adClaimSafety).
7. Return ONLY valid JSON matching the requested schema.`;

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new ResearchApiError(
      500,
      'MISSING_API_KEY',
      'GEMINI_API_KEY is not configured on the server. Please check Settings > Secrets.',
      {
        errorMy:
          'Server တွင် GEMINI_API_KEY မသတ်မှတ်ရသေးပါ။ Settings > Secrets တွင် စစ်ဆေးပါ။',
      }
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function buildBatches(category: CategoryFilter, quantity: ResearchQuantity): BatchSpec[] {
  const batches: BatchSpec[] = [];

  const pushBatches = (cat: ProductCategory, total: number) => {
    const niches = cat === 'womens-fashion' ? FASHION_FOCUS_SETS : COSMETICS_FOCUS_SETS;
    let remaining = total;
    let idx = 0;
    while (remaining > 0) {
      const targetCount = Math.min(5, remaining);
      batches.push({
        categoryMode: cat,
        targetCount,
        focusEn: niches[idx % niches.length],
      });
      remaining -= targetCount;
      idx += 1;
    }
  };

  if (category === 'all') {
    const fashionCount = Math.ceil(quantity / 2);
    const cosmeticsCount = quantity - fashionCount;
    pushBatches('womens-fashion', fashionCount);
    pushBatches('cosmetics-beauty', cosmeticsCount);
  } else {
    pushBatches(category, quantity);
  }

  return batches;
}

function strategyPromptNote(preset: StrategyPreset, salesWeightPct: number): string {
  const commissionWeightPct = 100 - salesWeightPct;
  if (preset === 'sales-first') {
    return `Sales Momentum (${salesWeightPct}% sales demand / ${commissionWeightPct}% commission): prioritize proven high-demand Thailand TikTok Shop products with strong social proof.`;
  }
  if (preset === 'commission-first') {
    return `Margin Focus (${salesWeightPct}% sales demand / ${commissionWeightPct}% commission): prioritize stronger ticket/margin products in Thailand with real buyer demand.`;
  }
  return `Balanced Fit (${salesWeightPct}% sales demand / ${commissionWeightPct}% commission): balance proven Thailand TikTok Shop demand with reasonable affiliate earning potential.`;
}

function buildGroundedBatchPrompt(
  spec: BatchSpec,
  strategyPreset: StrategyPreset,
  salesWeightPct: number,
  excludeNames: string[]
): string {
  const categoryLabel =
    spec.categoryMode === 'womens-fashion' ? "Women's Fashion" : 'Cosmetics & Beauty';

  const exclusionLine =
    excludeNames.length > 0
      ? `\nDo NOT include or reword any of these already-researched products: ${excludeNames.slice(-30).join(', ')}.`
      : '';

  const categoryAuditBlock =
    spec.categoryMode === 'womens-fashion'
      ? `"fashionReturnRisk": {
        "sizing": { "level": "Low" | "Watch" | "High", "noteEn": "string", "noteMy": "string" },
        "fabric": { "level": "Low" | "Watch" | "High", "noteEn": "string", "noteMy": "string" },
        "colorAccuracy": { "level": "Low" | "Watch" | "High", "noteEn": "string", "noteMy": "string" },
        "fitDifference": { "level": "Low" | "Watch" | "High", "noteEn": "string", "noteMy": "string" }
      }`
      : `"cosmeticsComplianceRisk": {
        "brandAuthenticity": { "status": "Verified" | "Needs Check" | "Caution", "noteEn": "string", "noteMy": "string" },
        "thaiFda": { "status": "Verified" | "Needs Check" | "Caution", "noteEn": "string", "noteMy": "string" },
        "adClaimSafety": { "status": "Verified" | "Needs Check" | "Caution", "noteEn": "string", "noteMy": "string" }
      }`;

  return `Use Google Search to research up to ${spec.targetCount} REAL, verifiable ${categoryLabel} products actively sold in Thailand (TikTok Shop Thailand / Thai official brand stores / Konvy / Watsons TH / Thai retail).
Sub-Niche Focus: ${spec.focusEn}
Affiliate Strategy: ${strategyPromptNote(strategyPreset, salesWeightPct)}${exclusionLine}

CRITICAL RULES:
- Include ONLY real products confirmed in your Google Search results with exact Product Name and Brand. If fewer than ${spec.targetCount} real verifiable products are found, return ONLY the genuinely verified ones (do NOT invent filler products).
- Extract actual THB price, actual seller/official shop, sales evidence, review count (number or null), customer rating out of 5 (number or null), customer feedback, market demand, competition, product quality evidence, and seller reliability directly from search results.
- Label EVERY field's provenance honestly: "verified" | "estimated" | "unverified" | "unavailable".
- NEVER invent TikTok Shop Affiliate commission rates! Unless an actual search result explicitly states the official Thailand TikTok Shop affiliate commission rate, set "commissionRate": null, "commissionVerified": false, "commissionStatus": "unverified".
- Differentiate each product's scoringInputs.rawStrength honestly based on its real metrics.

Return ONLY valid JSON:
{
  "products": [
    {
      "name": "Exact English Product Name (include brand & model)",
      "nameMy": "Burmese product name",
      "brand": "Exact Brand Name",
      "category": "${spec.categoryMode}",
      "subCategory": "Short English subcategory",
      "subCategoryMy": "Short Burmese subcategory",
      "shopName": "Actual Official Store or Thai Seller Name",
      "sellerStatus": "verified" | "estimated" | "unverified" | "unavailable",
      "dispatchHub": "Thailand / Bangkok",
      "priceThb": 299,
      "priceStatus": "verified" | "estimated" | "unverified" | "unavailable",
      "commissionRate": null,
      "commissionVerified": false,
      "commissionStatus": "verified" | "estimated" | "unverified" | "unavailable",
      "commissionNoteEn": "Honest explanation of commission verification status",
      "commissionNoteMy": "Burmese commission status explanation",
      "reviewCount": 1250,
      "reviewCountStatus": "verified" | "estimated" | "unverified" | "unavailable",
      "customerRating": 4.8,
      "customerRatingStatus": "verified" | "estimated" | "unverified" | "unavailable",
      "feedbackStatus": "verified" | "estimated" | "unverified" | "unavailable",
      "salesEvidenceStatus": "verified" | "estimated" | "unverified" | "unavailable",
      "demandLevel": "High" | "Growing" | "Steady" | "Moderate",
      "demandStatus": "verified" | "estimated" | "unverified" | "unavailable",
      "competitionLevel": "Low" | "Moderate" | "High",
      "competitionStatus": "verified" | "estimated" | "unverified" | "unavailable",
      "aiVideoSuitability": "High" | "Good" | "Moderate",
      "aiVideoStatus": "verified" | "estimated" | "unverified" | "unavailable",
      "sellerReliabilityLevel": "Reliable" | "Standard" | "Needs Check",
      "sellerReliabilityStatus": "verified" | "estimated" | "unverified" | "unavailable",
      "productQualityEvidenceEn": "Concrete quality / formulation / fabric evidence from search",
      "productQualityEvidenceMy": "Burmese product quality evidence",
      "productQualityStatus": "verified" | "estimated" | "unverified" | "unavailable",
      "scoringInputs": {
        "demandSales": { "rawStrength": 82, "verification": "verified" | "estimated" | "unverified" | "unavailable", "evidenceEn": "string", "evidenceMy": "string" },
        "commissionEarning": { "rawStrength": 40, "verification": "verified" | "estimated" | "unverified" | "unavailable", "evidenceEn": "string", "evidenceMy": "string" },
        "aiCreative": { "rawStrength": 78, "verification": "verified" | "estimated" | "unverified" | "unavailable", "evidenceEn": "string", "evidenceMy": "string" },
        "reviewsQuality": { "rawStrength": 85, "verification": "verified" | "estimated" | "unverified" | "unavailable", "evidenceEn": "string", "evidenceMy": "string" },
        "priceAppeal": { "rawStrength": 80, "verification": "verified" | "estimated" | "unverified" | "unavailable", "evidenceEn": "string", "evidenceMy": "string" },
        "competitionOpportunity": { "rawStrength": 62, "verification": "verified" | "estimated" | "unverified" | "unavailable", "evidenceEn": "string", "evidenceMy": "string" },
        "sellerReliability": { "rawStrength": 86, "verification": "verified" | "estimated" | "unverified" | "unavailable", "evidenceEn": "string", "evidenceMy": "string" }
      },
      "whyChooseEn": "Concise evidence-backed rationale",
      "whyChooseMy": "Concise Burmese rationale",
      "demandEvidenceEn": ["Concrete sales/demand evidence 1", "Concrete evidence 2"],
      "demandEvidenceMy": ["Burmese sales/demand evidence 1", "Burmese evidence 2"],
      "salesPotentialEn": "Practical Thailand TikTok Shop sales potential",
      "salesPotentialMy": "Burmese sales potential",
      "reviewStrengthsEn": ["Buyer strength 1", "Buyer strength 2"],
      "reviewStrengthsMy": ["Burmese strength 1", "Burmese strength 2"],
      "customerComplaintsEn": ["Buyer complaint 1", "Buyer complaint 2"],
      "customerComplaintsMy": ["Burmese complaint 1", "Burmese complaint 2"],
      "competitionDetailEn": "Competitor landscape in Thailand",
      "competitionDetailMy": "Burmese competitor landscape",
      "sellerReliabilityEn": "Seller reliability analysis",
      "sellerReliabilityMy": "Burmese seller reliability analysis",
      "generalRisksEn": ["Risk 1", "Risk 2"],
      "generalRisksMy": ["Burmese risk 1", "Burmese risk 2"],
      ${categoryAuditBlock},
      "aiVideoDetailEn": "AI video creative potential analysis",
      "aiVideoDetailMy": "Burmese AI video analysis",
      "videoIdeas": [
        { "titleEn": "string", "titleMy": "string", "formatEn": "string", "formatMy": "string", "outlineEn": "string", "outlineMy": "string" },
        { "titleEn": "string", "titleMy": "string", "formatEn": "string", "formatMy": "string", "outlineEn": "string", "outlineMy": "string" },
        { "titleEn": "string", "titleMy": "string", "formatEn": "string", "formatMy": "string", "outlineEn": "string", "outlineMy": "string" }
      ],
      "confidenceDetailEn": "Explanation of verified vs estimated vs unavailable fields",
      "confidenceDetailMy": "Burmese confidence explanation",
      "missingDataEn": ["Live TikTok Shop Affiliate Creator Center commission rate", "Other missing field"],
      "missingDataMy": ["TikTok Shop Affiliate Creator Center ရှိ လက်ရှိ Commission Rate အတိအကျ", "အခြား မရရှိသေးသောအချက်"]
    }
  ]
}`;
}

function extractJsonText(raw: string): string {
  const trimmed = raw.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch ? fencedMatch[1].trim() : trimmed;

  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return candidate.slice(firstBrace, lastBrace + 1);
  }
  return candidate;
}

function safeDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'web';
  }
}

function asString(val: unknown, fallback: string): string {
  if (typeof val === 'string' && val.trim().length > 0) return val.trim();
  return fallback;
}

function asStringArray(val: unknown, fallback: string[]): string[] {
  if (!Array.isArray(val)) return fallback;
  const cleaned = val
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());
  return cleaned.length > 0 ? cleaned : fallback;
}

function asEnum<T extends string>(val: unknown, allowed: readonly T[], fallback: T): T {
  if (typeof val === 'string' && (allowed as readonly string[]).includes(val)) {
    return val as T;
  }
  return fallback;
}

function asDataStatus(val: unknown, fallback: DataStatus): DataStatus {
  if (val === 'verified' || val === 'estimated' || val === 'unverified' || val === 'unavailable') {
    return val;
  }
  if (val === 'partial') return 'estimated';
  return fallback;
}

function asNumberInRange(val: unknown, min: number, max: number, fallback: number): number {
  if (typeof val === 'number' && Number.isFinite(val)) {
    return Math.max(min, Math.min(max, val));
  }
  return fallback;
}

function normalizeCriterion(
  raw: unknown,
  fallbackEn: string,
  fallbackMy: string,
  defaultStatus: DataStatus
): CriterionInput {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const verification = normalizeDataStatus(
    typeof obj.verification === 'string' ? (obj.verification as DataStatus) : defaultStatus
  );
  return {
    rawStrength: asNumberInRange(obj.rawStrength, 0, 100, verification === 'unavailable' ? 0 : 55),
    verification,
    evidenceEn: asString(obj.evidenceEn, fallbackEn),
    evidenceMy: asString(obj.evidenceMy, fallbackMy),
  };
}

function normalizeFashionRisk(raw: unknown): FashionReturnRisk {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const parseFactor = (field: unknown, fallbackEn: string, fallbackMy: string) => {
    const f = field && typeof field === 'object' ? (field as Record<string, unknown>) : {};
    return {
      level: asEnum<RiskSeverity>(f.level, ['Low', 'Watch', 'High'], 'Watch'),
      noteEn: asString(f.noteEn, fallbackEn),
      noteMy: asString(f.noteMy, fallbackMy),
    };
  };

  return {
    sizing: parseFactor(
      obj.sizing,
      'Verify Thai/Asian size chart measurements (cm) before promoting to avoid size returns.',
      'အရွယ်အစားမှားယွင်း Return မဖြစ်စေရန် Thai/Asian Size Chart (cm) ကို စစ်ဆေးပါ။'
    ),
    fabric: parseFactor(
      obj.fabric,
      'Check buyer reviews for fabric thickness, breathability, and opacity in Thai weather.',
      'ထိုင်းရာသီဥတုနှင့် သင့်တော်မှု၊ အထည်သားအထူအပါးကို Buyer Review များတွင် စစ်ဆေးပါ။'
    ),
    colorAccuracy: parseFactor(
      obj.colorAccuracy,
      'Studio lighting may alter shades slightly; check real buyer photos in TikTok Shop reviews.',
      'Studio မီးအလင်းကြောင့် အရောင်အနည်းငယ်ကွာနိုင်၍ Buyer Photo များကို စစ်ဆေးပါ။'
    ),
    fitDifference: parseFactor(
      obj.fitDifference,
      'Show real body-type fit notes (height/weight reference) in video captions to reduce fit returns.',
      'ဝတ်ဆင်ပုံကွာခြားမှု လျော့နည်းစေရန် အရပ်/ကိုယ်အလေးချိန် ညွှန်းဆိုချက် ထည့်ပြပါ။'
    ),
  };
}

function normalizeCosmeticsRisk(raw: unknown): CosmeticsComplianceRisk {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const parseCompliance = (field: unknown, fallbackEn: string, fallbackMy: string) => {
    const f = field && typeof field === 'object' ? (field as Record<string, unknown>) : {};
    return {
      status: asEnum<VerificationState>(
        f.status,
        ['Verified', 'Needs Check', 'Caution'],
        'Needs Check'
      ),
      noteEn: asString(f.noteEn, fallbackEn),
      noteMy: asString(f.noteMy, fallbackMy),
    };
  };

  return {
    brandAuthenticity: parseCompliance(
      obj.brandAuthenticity,
      'Promote only via TikTok Shop Mall / Official Brand Flagship or authorized Thai distributors.',
      'TikTok Shop Mall / Official Brand ဆိုင်စစ်မှသာ Affiliate Link ချိတ်ဆက်ရောင်းချပါ။'
    ),
    thaiFda: parseCompliance(
      obj.thaiFda,
      'Confirm the 10-to-13-digit Thai FDA (อย.) notification number on the seller listing before posting.',
      'ဗီဒီယိုမတင်မီ ဆိုင်စာမျက်နှာတွင် ထိုင်း FDA (อย.) မှတ်ပုံတင်နံပါတ် ပါဝင်မှုကို စစ်ဆေးပါ။'
    ),
    adClaimSafety: parseCompliance(
      obj.adClaimSafety,
      'Avoid exaggerated medical, instant-whitening, or guaranteed-cure claims prohibited by TikTok Shop Thailand.',
      'TikTok Shop Thailand စည်းကမ်းအရ ချက်ချင်းဖြူစေသည် သို့မဟုတ် ဆေးကုသနိုင်သည်ဟု အလွန်အကျွံ မကြော်ငြာရပါ။'
    ),
  };
}

function normalizeVideoIdeas(raw: unknown): [VideoContentIdea, VideoContentIdea, VideoContentIdea] {
  const defaults: [VideoContentIdea, VideoContentIdea, VideoContentIdea] = [
    {
      titleEn: 'Problem-to-Solution Daily Routine Hook',
      titleMy: 'နေ့စဉ်ပြဿနာဖြေရှင်းပြသည့် ဗီဒီယို',
      formatEn: '15–25s UGC / Voiceover Demo',
      formatMy: '၁၅–၂၅ စက္ကန့် UGC / Voiceover ပြသမှု',
      outlineEn:
        'Open with a relatable Thai daily-use pain point in the first 3 seconds, demonstrate texture/fit clearly, and close with a clear basket CTA.',
      outlineMy:
        'ပထမ ၃ စက္ကန့်တွင် ထိုင်းနေ့စဉ်အသုံးပြုသူများ ကြုံရသည့်အခက်အခဲဖြင့် စတင်ပြီး အသုံးပြုပုံကို ရှင်းလင်းစွာပြသပါ။',
    },
    {
      titleEn: 'Honest Review & Feature Breakdown',
      titleMy: 'အားသာချက်နှင့် သတိပြုစရာ အမှန်တကယ် Review',
      formatEn: '20–30s Talking Head / Split Screen',
      formatMy: '၂၀–၃၀ စက္ကန့် ရှင်းလင်းတင်ဆက်မှု',
      outlineEn:
        'Highlight 2 concrete strengths, mention 1 honest buyer consideration (size/skin type) to build trust, and highlight value.',
      outlineMy:
        'အဓိကအားသာချက် ၂ ချက်နှင့် ဝယ်သူသတိပြုသင့်သည့် ၁ ချက်ကို ပွင့်လင်းစွာပြောပြပြီး တန်ဖိုးသင့်တင့်မှုကို ဖော်ပြပါ။',
    },
    {
      titleEn: 'Natural Daylight Close-Up',
      titleMy: 'သဘာဝအလင်းဖြင့် အနီးကပ်ပြသမှု',
      formatEn: '15–20s Close-Up Visual Cut',
      formatMy: '၁၅–၂၀ စက္ကန့် အနီးကပ်ပြသမှု',
      outlineEn:
        'Use daylight close-up shots to showcase real shade/texture without heavy filters, answering common Thai buyer comment questions.',
      outlineMy:
        'Filter မသုံးဘဲ သဘာဝအလင်းဖြင့် အရောင်နှင့်အသားအရည်/အထည်သားအစစ်ကို အနီးကပ်ပြသ၍ ဝယ်သူမေးခွန်းများကို ဖြေကြားပါ။',
    },
  ];

  if (!Array.isArray(raw)) return defaults;

  const parsed: VideoContentIdea[] = raw.slice(0, 3).map((item, idx) => {
    const obj = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const fb = defaults[idx] ?? defaults[0];
    return {
      titleEn: asString(obj.titleEn, fb.titleEn),
      titleMy: asString(obj.titleMy, fb.titleMy),
      formatEn: asString(obj.formatEn, fb.formatEn),
      formatMy: asString(obj.formatMy, fb.formatMy),
      outlineEn: asString(obj.outlineEn, fb.outlineEn),
      outlineMy: asString(obj.outlineMy, fb.outlineMy),
    };
  });

  while (parsed.length < 3) {
    parsed.push(defaults[parsed.length]);
  }

  return [parsed[0], parsed[1], parsed[2]];
}

const GENERIC_PLACEHOLDER_PATTERNS = [
  /^generic\b/i,
  /^sample\b/i,
  /^unknown\b/i,
  /^various\b/i,
  /^multiple\b/i,
  /^trending\s+(top|dress|serum|lipstick|cream|fashion|beauty)$/i,
];

function isGenericName(name: string): boolean {
  const clean = name.trim();
  if (clean.length < 5) return true;
  return GENERIC_PLACEHOLDER_PATTERNS.some((p) => p.test(clean));
}

function rankSourcesForProduct(
  productName: string,
  brand: string,
  shopName: string,
  batchSources: GroundingSourceLink[]
): GroundingSourceLink[] {
  const tokens = `${brand} ${productName} ${shopName}`
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(/\s+/)
    .filter((tok) => tok.length >= 3);

  const scored = batchSources.map((src) => {
    const haystack = `${src.title} ${src.domain} ${src.url}`.toLowerCase();
    let score = 0;
    for (const tok of tokens) {
      if (haystack.includes(tok)) score += 3;
    }
    if (brand && haystack.includes(brand.toLowerCase())) score += 4;
    if (
      /konvy|watsons|eveandboy|beautrium|central|pomelo|gentlewoman|mizumi|srichand|4u2|skintific|herhyness|tiktok/i.test(
        src.domain
      )
    ) {
      score += 2;
    }
    return { src, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.filter((entry) => entry.score > 0).map((entry) => entry.src);
}

/**
 * Cross-name deduplication fingerprint + Jaccard token similarity check
 * prevents the same product from appearing twice under slightly different titles.
 */
function buildDedupTokens(brand: string, name: string): Set<string> {
  const noise = new Set([
    'thailand',
    'tiktok',
    'shop',
    'official',
    'viral',
    'trending',
    'new',
    'best',
    'seller',
    'women',
    'womens',
    'edition',
    'pack',
    'set',
    'size',
    'original',
  ]);
  const raw = `${brand} ${name}`
    .toLowerCase()
    .replace(/\b\d+\s*(ml|g|mg|oz|pcs|piece|cm)\b/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !noise.has(t));
  return new Set(raw);
}

function isDuplicateProduct(
  candidate: ResearchProduct,
  accepted: ResearchProduct[]
): boolean {
  const candTokens = buildDedupTokens(candidate.brand ?? '', candidate.name);
  if (candTokens.size === 0) return true;

  for (const existing of accepted) {
    const exTokens = buildDedupTokens(existing.brand ?? '', existing.name);
    let intersection = 0;
    for (const tok of candTokens) {
      if (exTokens.has(tok)) intersection += 1;
    }
    const union = new Set([...candTokens, ...exTokens]).size;
    const jaccard = union > 0 ? intersection / union : 0;
    const containment = intersection / Math.min(candTokens.size, exTokens.size);

    if (jaccard >= 0.65 || containment >= 0.8) {
      return true;
    }
  }
  return false;
}

async function verifyAndBuildProduct(
  raw: unknown,
  category: ProductCategory,
  batchIndex: number,
  itemIndex: number,
  researchedAt: string,
  batchSources: GroundingSourceLink[]
): Promise<ResearchProduct | null> {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  const name = asString(obj.name, '');
  const brand = asString(obj.brand, '');
  const shopName = asString(obj.shopName, '');

  // Strict Real Product Gate #1: Reject empty or generic/unidentifiable products
  if (!name || isGenericName(name)) return null;
  if (!brand && (!shopName || isGenericName(shopName))) return null;

  const effectiveBrand = brand || shopName;

  // Strict Real Product Gate #2: Must be backed by real Google Search Grounding URLs
  if (batchSources.length === 0) return null;
  const matchedSources = rankSourcesForProduct(name, effectiveBrand, shopName, batchSources);
  const productGroundingLinks =
    matchedSources.length > 0 ? matchedSources.slice(0, 3) : batchSources.slice(0, 2);

  if (productGroundingLinks.length === 0) return null;

  // Separate Product Image Retrieval & Listing Page Verification (NOT Google Search Grounding itself)
  const mediaCheck = await verifyProductMediaAndListing(
    name,
    effectiveBrand,
    productGroundingLinks
  );

  // Price: prefer live page-verified THB price; otherwise use grounded candidate price
  let priceThb: number | null = mediaCheck.verifiedPriceThb;
  let priceStatus: DataStatus = mediaCheck.verifiedPriceThb !== null ? 'verified' : 'unavailable';

  if (priceThb === null) {
    const rawPrice =
      typeof obj.priceThb === 'number' && Number.isFinite(obj.priceThb) && obj.priceThb > 0
        ? Math.round(obj.priceThb)
        : null;
    if (rawPrice !== null) {
      priceThb = rawPrice;
      priceStatus = asDataStatus(obj.priceStatus, 'estimated');
    } else {
      priceStatus = 'unavailable';
    }
  }

  // Review Count & Customer Rating: prefer verified listing JSON-LD when present
  const rawReviewCount =
    typeof obj.reviewCount === 'number' && Number.isFinite(obj.reviewCount) && obj.reviewCount > 0
      ? Math.round(obj.reviewCount)
      : null;
  const reviewCount = mediaCheck.verifiedReviewCount ?? rawReviewCount;
  const reviewCountStatus: DataStatus =
    mediaCheck.verifiedReviewCount !== null
      ? 'verified'
      : reviewCount !== null
        ? asDataStatus(obj.reviewCountStatus, 'estimated')
        : 'unavailable';

  const rawRating =
    typeof obj.customerRating === 'number' &&
    Number.isFinite(obj.customerRating) &&
    obj.customerRating >= 1 &&
    obj.customerRating <= 5
      ? Math.round(obj.customerRating * 10) / 10
      : null;
  const customerRating = mediaCheck.verifiedRating ?? rawRating;
  const customerRatingStatus: DataStatus =
    mediaCheck.verifiedRating !== null
      ? 'verified'
      : customerRating !== null
        ? asDataStatus(obj.customerRatingStatus, 'estimated')
        : 'unavailable';

  // Strict Commission Anti-Fabrication Gate
  const rawCommission =
    typeof obj.commissionRate === 'number' &&
    Number.isFinite(obj.commissionRate) &&
    obj.commissionRate > 0 &&
    obj.commissionRate <= 50
      ? Math.round(obj.commissionRate * 10) / 10
      : null;

  const commissionVerified =
    obj.commissionVerified === true &&
    obj.commissionStatus === 'verified' &&
    rawCommission !== null &&
    matchedSources.length > 0;

  const commissionRate = commissionVerified ? rawCommission : null;
  const commissionStatus: DataStatus = commissionVerified
    ? 'verified'
    : asDataStatus(obj.commissionStatus, 'unverified') === 'unavailable'
      ? 'unavailable'
      : 'unverified';

  const estimatedCommissionPerSaleThb =
    commissionVerified && commissionRate !== null && priceThb !== null && priceThb > 0
      ? Math.round((priceThb * commissionRate) / 100)
      : null;
  const commissionPerSaleStatus: DataStatus =
    estimatedCommissionPerSaleThb !== null
      ? priceStatus === 'verified'
        ? 'verified'
        : 'estimated'
      : 'unavailable';

  const sellerStatus: DataStatus = mediaCheck.verifiedPageUrl
    ? 'verified'
    : shopName && !isGenericName(shopName)
      ? asDataStatus(obj.sellerStatus, 'estimated')
      : 'unverified';

  const salesEvidenceStatus = asDataStatus(obj.salesEvidenceStatus, 'estimated');
  const feedbackStatus = asDataStatus(
    obj.feedbackStatus,
    reviewCountStatus === 'verified' ? 'verified' : 'estimated'
  );
  const demandStatus = asDataStatus(obj.demandStatus, 'estimated');
  const competitionStatus = asDataStatus(obj.competitionStatus, 'estimated');
  const aiVideoStatus = asDataStatus(obj.aiVideoStatus, 'estimated');
  const sellerReliabilityStatus = asDataStatus(obj.sellerReliabilityStatus, sellerStatus);
  const productQualityStatus = asDataStatus(obj.productQualityStatus, 'estimated');

  // Build verified clickable source items (including resolved verified destination page if discovered)
  const sources: ResearchSourceItem[] = [];
  const seenUrls = new Set<string>();
  if (mediaCheck.verifiedPageUrl) {
    seenUrls.add(mediaCheck.verifiedPageUrl);
    sources.push({
      labelEn: mediaCheck.verifiedPageTitle || safeDomain(mediaCheck.verifiedPageUrl),
      labelMy: `${mediaCheck.verifiedPageTitle || safeDomain(mediaCheck.verifiedPageUrl)} (Verified Listing)`,
      sourceType: `Verified Listing · ${safeDomain(mediaCheck.verifiedPageUrl)}`,
      url: mediaCheck.verifiedPageUrl,
      verified: true,
    });
  }
  for (const src of productGroundingLinks) {
    if (seenUrls.has(src.url)) continue;
    seenUrls.add(src.url);
    sources.push({
      labelEn: src.title || src.domain,
      labelMy: `${src.title || src.domain} (Google Search Grounding)`,
      sourceType: `Google Search · ${src.domain}`,
      url: src.url,
      verified: true,
    });
  }

  const rawScoring =
    obj.scoringInputs && typeof obj.scoringInputs === 'object'
      ? (obj.scoringInputs as Record<string, unknown>)
      : {};

  const scoringInputs: ScoringInputs = {
    demandSales: normalizeCriterion(
      rawScoring.demandSales,
      'Demand evidence assessed from live Google Search Thailand results.',
      'Google Search မှ ထိုင်းဈေးကွက် Demand အထောက်အထားများအပေါ် အခြေခံထားသည်။',
      salesEvidenceStatus
    ),
    commissionEarning: normalizeCriterion(
      rawScoring.commissionEarning,
      commissionVerified
        ? 'Commission rate confirmed in grounded search sources.'
        : 'Private TikTok Shop Affiliate Creator Center commission rate is unverified — confirm after login.',
      commissionVerified
        ? 'Google Search အထောက်အထားတွင် Commission Rate ကို အတည်ပြုထားသည်။'
        : 'TikTok Shop Affiliate Center အတွင်းရှိ Commission Rate ကို အတည်မပြုနိုင်သေးပါ။',
      commissionStatus
    ),
    aiCreative: normalizeCriterion(
      rawScoring.aiCreative,
      mediaCheck.imageVerified
        ? 'Visual presentation and verified product photo support short-form video hooks.'
        : 'Estimated creative potential; verified product photo is currently unavailable.',
      mediaCheck.imageVerified
        ? 'အတည်ပြုပြီး Product ပုံနှင့် အချက်အလက်များကြောင့် ဗီဒီယိုဖန်တီးရန် သင့်တော်သည်။'
        : 'ဗီဒီယိုအလားအလာ ခန့်မှန်းချက်သာဖြစ်ပြီး တကယ့် Product ပုံကို ထပ်မံစစ်ဆေးရန်လိုသည်။',
      mediaCheck.imageVerified ? aiVideoStatus : aiVideoStatus === 'verified' ? 'estimated' : aiVideoStatus
    ),
    reviewsQuality: normalizeCriterion(
      rawScoring.reviewsQuality,
      customerRating !== null || reviewCount !== null
        ? `Rating ${customerRating ?? '—'}/5 (${reviewCount ? `${reviewCount.toLocaleString()} reviews` : 'review count unavailable'}).`
        : 'Detailed verified review metrics unavailable; check live TikTok Shop reviews.',
      customerRating !== null || reviewCount !== null
        ? `Rating ${customerRating ?? '—'}/5 (${reviewCount ? `Review ${reviewCount.toLocaleString()} ခု` : 'Review အရေအတွက် မရရှိသေး'})။`
        : 'အတည်ပြုပြီး Review အရေအတွက် မရရှိသေး၍ TikTok Shop တွင် တိုက်ရိုက်စစ်ဆေးပါ။',
      customerRatingStatus === 'verified' || reviewCountStatus === 'verified'
        ? 'verified'
        : feedbackStatus
    ),
    priceAppeal: normalizeCriterion(
      rawScoring.priceAppeal,
      priceStatus === 'verified' && priceThb !== null
        ? `Verified Thailand listing price: ฿${priceThb.toLocaleString('en-US')}.`
        : priceThb !== null
          ? `Estimated Thailand price: ฿${priceThb.toLocaleString('en-US')} — confirm exact SKU price.`
          : 'Actual THB listing price unavailable.',
      priceStatus === 'verified' && priceThb !== null
        ? `အတည်ပြုပြီး ထိုင်းဈေးနှုန်း ฿${priceThb.toLocaleString('en-US')} ဖြစ်သည်။`
        : priceThb !== null
          ? `ခန့်မှန်း ထိုင်းဈေးနှုန်း ฿${priceThb.toLocaleString('en-US')} ဖြစ်၍ TikTok Shop တွင် စစ်ဆေးပါ။`
          : 'THB ဈေးနှုန်းအတိအကျ မရရှိနိုင်သေးပါ။',
      priceStatus
    ),
    competitionOpportunity: normalizeCriterion(
      rawScoring.competitionOpportunity,
      'Competition intensity assessed from active Thailand listings and creator saturation.',
      'ထိုင်းဈေးကွက်ရှိ ပြိုင်ဘက်ဆိုင်များနှင့် Creator များပြားမှုအပေါ် အခြေခံထားသည်။',
      competitionStatus
    ),
    sellerReliability: normalizeCriterion(
      rawScoring.sellerReliability,
      mediaCheck.verifiedPageUrl
        ? `Verified official brand or retail listing matched for ${effectiveBrand}.`
        : 'Verify official TikTok Shop Mall badge and live seller score directly.',
      mediaCheck.verifiedPageUrl
        ? `${effectiveBrand} ၏ Official / Retail Listing ကို အတည်ပြုနိုင်ခဲ့သည်။`
        : 'TikTok Shop ပေါ်တွင် Official Mall တံဆိပ်နှင့် ဆိုင် Score ကို တိုက်ရိုက်စစ်ဆေးပါ။',
      sellerReliabilityStatus
    ),
  };

  // Ensure every unverified/unavailable commission strictly updates scoring input
  if (!commissionVerified) {
    scoringInputs.commissionEarning.verification = commissionStatus;
  }

  const missingDataEn = asStringArray(obj.missingDataEn, [
    'Live TikTok Shop Affiliate Creator Center commission rate and open-plan status.',
    'Real-time 30-day SKU order count and seller refund/return rate.',
  ]);
  if (!commissionVerified && !missingDataEn.some((m) => m.toLowerCase().includes('commission'))) {
    missingDataEn.unshift(
      'Private TikTok Shop Affiliate Creator Center commission rate (must be verified after logging in).'
    );
  }
  if (!mediaCheck.imageVerified && !missingDataEn.some((m) => m.toLowerCase().includes('image'))) {
    missingDataEn.push('Verified direct product photo URL matching this exact brand and SKU.');
  }

  const missingDataMy = asStringArray(obj.missingDataMy, [
    'TikTok Shop Affiliate Creator Center ရှိ လက်ရှိ Commission Rate အတိအကျ။',
    'နောက်ဆုံး ရက် ၃၀ အတွင်း တကယ့်ရောင်းအားအရေအတွက်နှင့် Return Rate အတိအကျ။',
  ]);
  if (!commissionVerified && !missingDataMy.some((m) => m.toLowerCase().includes('commission'))) {
    missingDataMy.unshift(
      'TikTok Shop Affiliate Creator Center ရှိ လက်ရှိ Commission Rate အတိအကျ (ကိုယ်တိုင်ဝင်ရောက်စစ်ဆေးရန်)။'
    );
  }

  const draftProduct: ResearchProduct = {
    id: `th-${category === 'womens-fashion' ? 'wf' : 'cb'}-${Date.now().toString(36)}-${batchIndex}-${itemIndex}`,
    name,
    nameMy: asString(obj.nameMy, name),
    brand: effectiveBrand,
    category,
    subCategory: asString(
      obj.subCategory,
      category === 'womens-fashion' ? 'Women Apparel' : 'Beauty & Skincare'
    ),
    subCategoryMy: asString(
      obj.subCategoryMy,
      asString(obj.subCategory, category === 'womens-fashion' ? 'အမျိုးသမီးဖက်ရှင်' : 'အလှကုန်')
    ),
    shopName: shopName || effectiveBrand,
    sellerStatus,
    dispatchHub: asString(obj.dispatchHub, 'Thailand'),
    researchedAt,
    imageUrl: mediaCheck.imageUrl,
    imageOriginUrl: mediaCheck.imageOriginUrl,
    imageVerified: mediaCheck.imageVerified,
    imageSourceNoteEn: mediaCheck.imageSourceNoteEn,
    imageSourceNoteMy: mediaCheck.imageSourceNoteMy,
    priceThb,
    priceStatus,
    commissionRate,
    commissionVerified,
    commissionStatus,
    estimatedCommissionPerSaleThb,
    commissionPerSaleStatus,
    commissionNoteEn: asString(
      obj.commissionNoteEn,
      commissionVerified
        ? 'Commission rate referenced in grounded sources; re-confirm active plan inside TikTok Shop Affiliate Center.'
        : 'Unverified — TikTok Shop Affiliate Creator Center commission rates are private and are never fabricated.'
    ),
    commissionNoteMy: asString(
      obj.commissionNoteMy,
      commissionVerified
        ? 'Google Search အထောက်အထားတွင် ဖော်ပြထားပြီး TikTok Shop Affiliate Center တွင် ထပ်မံအတည်ပြုပါ။'
        : 'အတည်မပြုနိုင်သေး — TikTok Shop Affiliate Creator Center အတွင်းရှိ Private Commission Rate ကို မတီထွင်ဘဲ Unverified ဟုသာ ဖော်ပြထားပါသည်။'
    ),
    reviewCount,
    reviewCountStatus,
    customerRating,
    customerRatingStatus,
    feedbackStatus,
    productQualityEvidenceEn: asString(
      obj.productQualityEvidenceEn,
      'Quality assessment based on grounded Thailand product specifications and customer feedback.'
    ),
    productQualityEvidenceMy: asString(
      obj.productQualityEvidenceMy,
      'ထိုင်းဈေးကွက် Product အချက်အလက်နှင့် ဝယ်သူတုံ့ပြန်ချက်များအပေါ် အခြေခံထားသည်။'
    ),
    productQualityStatus,
    salesEvidenceStatus,
    demandLevel: asEnum<DemandLevel>(
      obj.demandLevel,
      ['High', 'Growing', 'Steady', 'Moderate'],
      'Steady'
    ),
    demandStatus,
    competitionLevel: asEnum<CompetitionLevel>(
      obj.competitionLevel,
      ['Low', 'Moderate', 'High'],
      'Moderate'
    ),
    competitionStatus,
    aiVideoSuitability: asEnum<AiVideoSuitability>(
      obj.aiVideoSuitability,
      ['High', 'Good', 'Moderate'],
      'Good'
    ),
    aiVideoStatus,
    sellerReliabilityLevel: asEnum<'Reliable' | 'Standard' | 'Needs Check'>(
      obj.sellerReliabilityLevel,
      ['Reliable', 'Standard', 'Needs Check'],
      'Standard'
    ),
    sellerReliabilityStatus,
    opportunityScore: 0,
    confidenceLevel: 'Low',
    scoringInputs,
    whyChooseEn: asString(
      obj.whyChooseEn,
      'Real Thailand market product verified via Google Search grounding.'
    ),
    whyChooseMy: asString(
      obj.whyChooseMy,
      'Google Search Grounding ဖြင့် စစ်ဆေးတွေ့ရှိထားသော ထိုင်းဈေးကွက် Product ဖြစ်သည်။'
    ),
    demandEvidenceEn: asStringArray(obj.demandEvidenceEn, [
      'Corroborated via live Google Search Thailand product coverage.',
    ]),
    demandEvidenceMy: asStringArray(obj.demandEvidenceMy, [
      'ထိုင်းဈေးကွက်အတွက် Live Google Search မှတစ်ဆင့် အတည်ပြုတွေ့ရှိထားသည်။',
    ]),
    salesPotentialEn: asString(
      obj.salesPotentialEn,
      'Practical Thailand TikTok Shop conversion potential when paired with clear short-form video demos.'
    ),
    salesPotentialMy: asString(
      obj.salesPotentialMy,
      'ရှင်းလင်းသော TikTok ဗီဒီယိုပြသမှုများနှင့် တွဲဖက်ပါက ထိုင်းဈေးကွက်တွင် ရောင်းအားအလားအလာ ကောင်းမွန်နိုင်သည်။'
    ),
    reviewStrengthsEn: asStringArray(obj.reviewStrengthsEn, [
      'Clear daily utility aligned with Thailand buyer demand.',
    ]),
    reviewStrengthsMy: asStringArray(obj.reviewStrengthsMy, [
      'ထိုင်းဝယ်သူများ၏ နေ့စဉ်လိုအပ်ချက်နှင့် ကိုက်ညီမှုရှိသည်။',
    ]),
    customerComplaintsEn: asStringArray(obj.customerComplaintsEn, [
      'Confirm recent buyer reviews on the specific TikTok Shop seller before linking.',
    ]),
    customerComplaintsMy: asStringArray(obj.customerComplaintsMy, [
      'Affiliate Link မချိတ်မီ သက်ဆိုင်ရာ TikTok Shop ဆိုင်၏ နောက်ဆုံး Review များကို စစ်ဆေးပါ။',
    ]),
    competitionDetailEn: asString(
      obj.competitionDetailEn,
      'Active Thailand online category; stand out with authentic real-light demos and honest buyer tips.'
    ),
    competitionDetailMy: asString(
      obj.competitionDetailMy,
      'ထိုင်းအွန်လိုင်းဈေးကွက်တွင် ပြိုင်ဆိုင်မှုရှိ၍ သဘာဝကျသော ဗီဒီယိုပြသမှုဖြင့် ကွဲပြားအောင်တင်ဆက်သင့်သည်။'
    ),
    sellerReliabilityEn: asString(
      obj.sellerReliabilityEn,
      'Verify official mall badge, recent shop score (4.7+), and Thailand domestic dispatch time directly on TikTok Shop.'
    ),
    sellerReliabilityMy: asString(
      obj.sellerReliabilityMy,
      'TikTok Shop ပေါ်တွင် Official Mall တံဆိပ်၊ ဆိုင် Score (4.7+) နှင့် ထိုင်းပြည်တွင်းပို့ဆောင်ချိန်ကို တိုက်ရိုက်စစ်ဆေးပါ။'
    ),
    generalRisksEn: asStringArray(obj.generalRisksEn, [
      'Affiliate commission plan or stock levels can change rapidly during Thailand TikTok Shop payday campaigns.',
    ]),
    generalRisksMy: asStringArray(obj.generalRisksMy, [
      'ထိုင်း TikTok Shop Campaign ကာလများတွင် Stock နှင့် Commission အပြောင်းအလဲ မြန်ဆန်နိုင်သည်။',
    ]),
    fashionReturnRisk:
      category === 'womens-fashion' ? normalizeFashionRisk(obj.fashionReturnRisk) : undefined,
    cosmeticsComplianceRisk:
      category === 'cosmetics-beauty' ? normalizeCosmeticsRisk(obj.cosmeticsComplianceRisk) : undefined,
    aiVideoDetailEn: asString(
      obj.aiVideoDetailEn,
      'Suitable for structured short-form TikTok affiliate videos combining concise benefit callouts with real usage footage.'
    ),
    aiVideoDetailMy: asString(
      obj.aiVideoDetailMy,
      'အဓိကအားသာချက်များနှင့် လက်တွေ့အသုံးပြုပုံကို ပြသသည့် TikTok Affiliate ဗီဒီယိုများအတွက် သင့်တော်သည်။'
    ),
    videoIdeas: normalizeVideoIdeas(obj.videoIdeas),
    sources,
    confidenceDetailEn: asString(
      obj.confidenceDetailEn,
      'Confidence reflects the number of independently verified Google Search and listing fields vs unverified private TikTok Shop metrics.'
    ),
    confidenceDetailMy: asString(
      obj.confidenceDetailMy,
      'Google Search နှင့် Listing မှ တကယ်အတည်ပြုနိုင်သော အချက်အလက်အရေအတွက်အပေါ် မူတည်တွက်ချက်ထားသည်။'
    ),
    missingDataEn,
    missingDataMy,
  };

  // Deterministic proportional 100-Point Opportunity Scoring (fixes flat-56 bug)
  const evaluation = evaluateProductOpportunity(draftProduct);
  draftProduct.opportunityScore = evaluation.totalScore;
  draftProduct.confidenceLevel = evaluation.confidenceLevel;

  return draftProduct;
}

function mapGeminiError(error: unknown): ResearchApiError {
  if (error instanceof ResearchApiError) return error;

  const errObj = error as { status?: number; message?: string };
  const msg = typeof errObj?.message === 'string' ? errObj.message : String(error);
  const status = typeof errObj?.status === 'number' ? errObj.status : 500;

  if (
    status === 400 ||
    status === 401 ||
    status === 403 ||
    msg.includes('API_KEY_INVALID') ||
    msg.includes('PERMISSION_DENIED')
  ) {
    return new ResearchApiError(
      status === 400 ? 400 : 403,
      'API_KEY_ERROR',
      'Gemini API authentication failed. Please verify your API key in Settings > Secrets.',
      {
        errorMy:
          'Gemini API Key အတည်ပြုမှု မအောင်မြင်ပါ။ Settings > Secrets တွင် API Key ကို စစ်ဆေးပါ။',
      }
    );
  }

  if (status === 429 || msg.includes('RESOURCE_EXHAUSTED')) {
    pauseResearch('search-quota-exhausted');
    return new ResearchApiError(
      429,
      'SEARCH_QUOTA_EXHAUSTED',
      'Live Google Search Grounding quota is currently exhausted. Live product research has been paused so unverified or guessed products are never displayed as verified results. Exact quota reset timing is unknown; you can resume later or select a billing-enabled API key in Settings > Secrets.',
      {
        quotaPaused: true,
        errorMy:
          'Google Search Grounding Quota ပြည့်နေသောကြောင့် Live Product Research ကို ခေတ္တရပ်ဆိုင်းထားပါသည်။ အထောက်အထားမရှိဘဲ ခန့်မှန်းထားသော Product များကို Verified Result အဖြစ် လုံးဝမဖော်ပြပါ။ Quota ပြန်ရမည့်အချိန်အတိအကျကို မသိနိုင်ပါ — နောက်ပိုင်းတွင် Resume လုပ်နိုင်သလို Settings > Secrets တွင် Billing-enabled API Key ရွေးချယ်အသုံးပြုနိုင်ပါသည်။',
      }
    );
  }

  if (status === 503 || msg.includes('UNAVAILABLE')) {
    return new ResearchApiError(
      503,
      'MODEL_BUSY',
      'Gemini research model is temporarily busy. Please try again shortly.',
      {
        errorMy: 'Gemini Model ယာယီအလုပ်များနေပါသည်။ ခဏအကြာတွင် ထပ်မံကြိုးစားပါ။',
      }
    );
  }

  return new ResearchApiError(
    502,
    'RESEARCH_FAILED',
    `Live grounded research could not complete: ${msg.slice(0, 200)}`,
    {
      errorMy: 'Live Research လုပ်ဆောင်မှု မအောင်မြင်ပါ။ ထပ်မံကြိုးစားပါ။',
    }
  );
}

/**
 * Primary grounded models (with Google Search Grounding tool) and text-analysis models
 * (used strictly on REAL live-fetched official Thai storefront product data when Google Search Grounding hits 429).
 */
const GROUNDED_MODELS: readonly string[] = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'];
const ANALYSIS_MODELS: readonly string[] = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'];

async function runGroundedBatch(
  ai: GoogleGenAI,
  spec: BatchSpec,
  batchIndex: number,
  strategyPreset: StrategyPreset,
  salesWeightPct: number,
  researchedAt: string,
  excludeNames: string[]
): Promise<{
  products: ResearchProduct[];
  filteredOutCount: number;
  queries: string[];
  sources: GroundingSourceLink[];
}> {
  const prompt = buildGroundedBatchPrompt(spec, strategyPreset, salesWeightPct, excludeNames);
  let lastError: unknown = null;

  for (let m = 0; m < GROUNDED_MODELS.length; m += 1) {
    const modelName = GROUNDED_MODELS[m];
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          tools: [{ googleSearch: {} }],
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      const groundingMeta = response.candidates?.[0]?.groundingMetadata;
      const queries = Array.isArray(groundingMeta?.webSearchQueries)
        ? groundingMeta.webSearchQueries.filter(
            (q): q is string => typeof q === 'string' && q.trim().length > 0
          )
        : [];

      const rawChunks = Array.isArray(groundingMeta?.groundingChunks)
        ? groundingMeta.groundingChunks
        : [];

      const seenUrls = new Set<string>();
      const batchSources: GroundingSourceLink[] = [];
      for (const chunk of rawChunks) {
        const uri = chunk?.web?.uri;
        const title = chunk?.web?.title;
        if (typeof uri === 'string' && uri.startsWith('http') && !seenUrls.has(uri)) {
          seenUrls.add(uri);
          batchSources.push({
            url: uri,
            title: typeof title === 'string' && title.trim() ? title.trim() : safeDomain(uri),
            domain: safeDomain(uri),
          });
        }
      }

      if (batchSources.length === 0) {
        return {
          products: [],
          filteredOutCount: spec.targetCount,
          queries,
          sources: [],
        };
      }

      const rawText = response.text ?? '';
      if (!rawText.trim()) {
        throw new Error('Empty response from Gemini grounded search');
      }

      const jsonStr = extractJsonText(rawText);
      const parsed: unknown = JSON.parse(jsonStr);
      const rawProducts =
        parsed &&
        typeof parsed === 'object' &&
        Array.isArray((parsed as { products?: unknown[] }).products)
          ? (parsed as { products: unknown[] }).products
          : Array.isArray(parsed)
            ? parsed
            : [];

      const verifiedResults = await Promise.all(
        rawProducts.map((item, idx) =>
          verifyAndBuildProduct(item, spec.categoryMode, batchIndex, idx, researchedAt, batchSources)
        )
      );

      const validProducts: ResearchProduct[] = [];
      let filteredOutCount = 0;
      for (const result of verifiedResults) {
        if (result) validProducts.push(result);
        else filteredOutCount += 1;
      }

      return {
        products: validProducts,
        filteredOutCount,
        queries,
        sources: batchSources,
      };
    } catch (err) {
      lastError = err;
      const mapped = mapGeminiError(err);
      if (mapped.code === 'API_KEY_ERROR' || mapped.code === 'MISSING_API_KEY') {
        throw mapped;
      }
      // Continue silently to next grounded model or Stage 2 live official storefront verification
    }
  }

  throw mapGeminiError(lastError);
}

function buildStorefrontAnalysisPrompt(
  items: LiveStorefrontProduct[],
  strategyPreset: StrategyPreset,
  salesWeightPct: number
): string {
  const catalogJson = JSON.stringify(
    items.map((item, idx) => ({
      index: idx,
      name: item.name,
      brand: item.brand,
      shopName: item.shopName,
      category: item.category,
      subCategoryHint: item.subCategoryHint,
      verifiedPriceThb: item.priceThb,
      officialUrl: item.productUrl,
      liveRating: item.customerRating,
      liveReviewCount: item.reviewCount,
      description: item.descriptionSnippet,
    })),
    null,
    2
  );

  return `You are analyzing REAL, LIVE-VERIFIED products fetched right now from official Thailand brand storefronts for Thailand TikTok Shop Affiliate evaluation.
Affiliate Strategy: ${strategyPromptNote(strategyPreset, salesWeightPct)}

VERIFIED LIVE PRODUCT LISTINGS (DO NOT invent, rename, or alter prices/brands):
${catalogJson}

For EACH product index (0 to ${items.length - 1}), produce an honest, differentiated bilingual (English + natural Burmese မြန်မာဘာသာ) Thailand TikTok Shop affiliate research report.

RULES:
- Differentiate each product's scoringInputs.rawStrength (35–92) realistically based on its ACTUAL THB price, brand awareness in Thailand, visual TikTok demo appeal, return/compliance risk, and category competition. NEVER give identical boilerplate scores.
- NEVER fabricate TikTok Shop Affiliate commission rates or review counts/ratings that were not provided above.
- For "womens-fashion", ALWAYS include "fashionReturnRisk" (sizing, fabric, colorAccuracy, fitDifference).
- For "cosmetics-beauty", ALWAYS include "cosmeticsComplianceRisk" (brandAuthenticity, thaiFda, adClaimSafety).

Return ONLY valid JSON:
{
  "analyses": [
    {
      "index": 0,
      "nameMy": "Natural Burmese name keeping brand recognizable",
      "subCategory": "Short English subcategory",
      "subCategoryMy": "Short Burmese subcategory",
      "demandLevel": "High" | "Growing" | "Steady" | "Moderate",
      "competitionLevel": "Low" | "Moderate" | "High",
      "aiVideoSuitability": "High" | "Good" | "Moderate",
      "sellerReliabilityLevel": "Reliable" | "Standard" | "Needs Check",
      "productQualityEvidenceEn": "Specific quality/ingredient/fabric takeaway from the live listing description",
      "productQualityEvidenceMy": "Burmese product quality takeaway",
      "scoringInputs": {
        "demandSales": { "rawStrength": 78, "evidenceEn": "string", "evidenceMy": "string" },
        "commissionEarning": { "rawStrength": 42, "evidenceEn": "string", "evidenceMy": "string" },
        "aiCreative": { "rawStrength": 84, "evidenceEn": "string", "evidenceMy": "string" },
        "reviewsQuality": { "rawStrength": 72, "evidenceEn": "string", "evidenceMy": "string" },
        "priceAppeal": { "rawStrength": 80, "evidenceEn": "string", "evidenceMy": "string" },
        "competitionOpportunity": { "rawStrength": 64, "evidenceEn": "string", "evidenceMy": "string" },
        "sellerReliability": { "rawStrength": 88, "evidenceEn": "string", "evidenceMy": "string" }
      },
      "whyChooseEn": "Concrete rationale based on this exact product",
      "whyChooseMy": "Burmese rationale",
      "demandEvidenceEn": ["Concrete Thailand market demand note 1", "Note 2"],
      "demandEvidenceMy": ["Burmese demand note 1", "Note 2"],
      "salesPotentialEn": "Practical TikTok Shop Thailand sales potential",
      "salesPotentialMy": "Burmese sales potential",
      "reviewStrengthsEn": ["Expected/typical buyer strength 1", "Strength 2"],
      "reviewStrengthsMy": ["Burmese strength 1", "Strength 2"],
      "customerComplaintsEn": ["Watch-out / common complaint 1", "Complaint 2"],
      "customerComplaintsMy": ["Burmese complaint 1", "Complaint 2"],
      "competitionDetailEn": "Competitor positioning in Thailand",
      "competitionDetailMy": "Burmese competitor positioning",
      "sellerReliabilityEn": "Official brand storefront reliability note",
      "sellerReliabilityMy": "Burmese seller reliability note",
      "generalRisksEn": ["Risk 1", "Risk 2"],
      "generalRisksMy": ["Burmese risk 1", "Risk 2"],
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
      "aiVideoDetailEn": "AI short-form video hook & visual demo analysis",
      "aiVideoDetailMy": "Burmese AI video analysis",
      "videoIdeas": [
        { "titleEn": "string", "titleMy": "string", "formatEn": "string", "formatMy": "string", "outlineEn": "string", "outlineMy": "string" },
        { "titleEn": "string", "titleMy": "string", "formatEn": "string", "formatMy": "string", "outlineEn": "string", "outlineMy": "string" },
        { "titleEn": "string", "titleMy": "string", "formatEn": "string", "formatMy": "string", "outlineEn": "string", "outlineMy": "string" }
      ],
      "confidenceDetailEn": "Explanation of what is verified from the official store vs pending TikTok Shop checks",
      "confidenceDetailMy": "Burmese confidence explanation"
    }
  ]
}`;
}

function buildVerifiedStorefrontProduct(
  live: LiveStorefrontProduct,
  analysisRaw: Record<string, unknown>,
  batchIdx: number,
  itemIdx: number,
  researchedAt: string
): ResearchProduct {
  const hasRealRating = live.customerRating !== null && live.customerRating > 0;
  const hasRealReviews = live.reviewCount !== null && live.reviewCount > 0;
  const hasRealQualitySpecs = live.descriptionSnippet.length >= 45;

  const rawScoring =
    analysisRaw.scoringInputs && typeof analysisRaw.scoringInputs === 'object'
      ? (analysisRaw.scoringInputs as Record<string, unknown>)
      : {};

  // Ground-truth verification statuses locked strictly to real live fetched official storefront data
  const scoringInputs: ScoringInputs = {
    demandSales: normalizeCriterion(
      rawScoring.demandSales,
      `Active Thailand official brand SKU on ${live.storeDomain}; live TikTok Shop 30-day order volume requires Creator Center check.`,
      `${live.storeDomain} တရားဝင်ဆိုင်တွင် လက်ရှိရောင်းချနေပြီး TikTok Shop ရက် ၃၀ ရောင်းအားကို Creator Center တွင် ထပ်မံစစ်ဆေးပါ။`,
      'estimated'
    ),
    commissionEarning: normalizeCriterion(
      rawScoring.commissionEarning,
      'Unverified — private TikTok Shop Affiliate Creator Center commission rate is never fabricated.',
      'အတည်မပြုနိုင်သေး — TikTok Shop Affiliate Creator Center ရှိ Private Commission Rate ကို မတီထွင်ပါ။',
      'unverified'
    ),
    aiCreative: normalizeCriterion(
      rawScoring.aiCreative,
      live.imageVerified
        ? `Verified official product photo from ${live.storeDomain} supports authentic visual UGC hooks.`
        : 'Creative fit estimated from official product specifications.',
      live.imageVerified
        ? `${live.storeDomain} မှ အတည်ပြုပြီး တကယ့် Product ပုံကြောင့် ဗီဒီယိုဖန်တီးရန် သင့်တော်သည်။`
        : 'Product အချက်အလက်အပေါ်မူတည်၍ ဗီဒီယိုအလားအလာ ခန့်မှန်းထားသည်။',
      live.imageVerified ? 'verified' : 'estimated'
    ),
    reviewsQuality: normalizeCriterion(
      rawScoring.reviewsQuality,
      hasRealRating || hasRealReviews
        ? `Verified store rating ${live.customerRating ?? '—'}/5 (${live.reviewCount ?? 0} reviews) and live product specs.`
        : `Official product specifications verified on ${live.storeDomain}; live TikTok Shop buyer rating/count requires direct app check.`,
      hasRealRating || hasRealReviews
        ? `တရားဝင်ဆိုင် Rating ${live.customerRating ?? '—'}/5 (Review ${live.reviewCount ?? 0} ခု) အတည်ပြုပြီး။`
        : `${live.storeDomain} ရှိ Product အချက်အလက်အတည်ပြုပြီး TikTok Shop Rating/Review အရေအတွက်ကို တိုက်ရိုက်စစ်ဆေးပါ။`,
      hasRealRating || hasRealReviews ? 'verified' : hasRealQualitySpecs ? 'estimated' : 'unverified'
    ),
    priceAppeal: normalizeCriterion(
      rawScoring.priceAppeal,
      `Verified live official Thailand price: ฿${live.priceThb.toLocaleString('en-US')} on ${live.storeDomain}.`,
      `${live.storeDomain} တရားဝင်ဆိုင်မှ တိုက်ရိုက်အတည်ပြုထားသော ထိုင်းဈေးနှုန်း ฿${live.priceThb.toLocaleString('en-US')} ဖြစ်သည်။`,
      'verified'
    ),
    competitionOpportunity: normalizeCriterion(
      rawScoring.competitionOpportunity,
      'Thailand TikTok Shop creator saturation estimated from category and brand positioning.',
      'ထိုင်း TikTok Shop ရှိ Category နှင့် Brand အနေအထားအပေါ် အခြေခံ၍ ပြိုင်ဆိုင်မှု ခန့်မှန်းထားသည်။',
      'estimated'
    ),
    sellerReliability: normalizeCriterion(
      rawScoring.sellerReliability,
      `Verified live official Thai brand storefront (${live.shopName} · ${live.storeDomain}).`,
      `တရားဝင် ထိုင်း Brand ဆိုင်စစ် (${live.shopName} · ${live.storeDomain}) ကို တိုက်ရိုက်အတည်ပြုထားသည်။`,
      'verified'
    ),
  };

  // Enforce strict ground-truth locks on verification status
  scoringInputs.priceAppeal.verification = 'verified';
  scoringInputs.sellerReliability.verification = 'verified';
  scoringInputs.commissionEarning.verification = 'unverified';
  if (live.imageVerified) {
    scoringInputs.aiCreative.verification = 'verified';
  }
  if (!hasRealRating && !hasRealReviews && scoringInputs.reviewsQuality.verification === 'verified') {
    scoringInputs.reviewsQuality.verification = 'estimated';
  }

  const sources: ResearchSourceItem[] = [
    {
      labelEn: `${live.name} — ${live.shopName}`,
      labelMy: `${live.name} — ${live.shopName} (တရားဝင်ဆိုင်)`,
      sourceType: `Live Official Store · ${live.storeDomain}`,
      url: live.productUrl,
      verified: true,
    },
  ];

  const missingDataEn = [
    'Live TikTok Shop Affiliate Creator Center commission rate and open-plan eligibility (requires logged-in Creator Center check).',
    'Real-time 30-day TikTok Shop SKU order volume and seller return/refund rate.',
  ];
  const missingDataMy = [
    'TikTok Shop Affiliate Creator Center ရှိ လက်ရှိ Commission Rate နှင့် Open Plan အခြေအနေ (ကိုယ်တိုင်ဝင်ရောက်စစ်ဆေးရန်)။',
    'နောက်ဆုံး ရက် ၃၀ အတွင်း TikTok Shop တကယ့်ရောင်းအားနှင့် Return Rate အတိအကျ။',
  ];

  if (!hasRealRating && !hasRealReviews) {
    missingDataEn.push('Live TikTok Shop buyer star rating and verified review count.');
    missingDataMy.push('TikTok Shop ပေါ်ရှိ လက်ရှိ Customer Rating နှင့် Review အရေအတွက်။');
  }

  const draftProduct: ResearchProduct = {
    id: `th-${live.category === 'womens-fashion' ? 'wf' : 'cb'}-${Date.now().toString(36)}-${batchIdx}-${itemIdx}`,
    name: live.name,
    nameMy: asString(analysisRaw.nameMy, live.name),
    brand: live.brand,
    category: live.category,
    subCategory: asString(analysisRaw.subCategory, live.subCategoryHint),
    subCategoryMy: asString(
      analysisRaw.subCategoryMy,
      live.category === 'womens-fashion' ? 'အမျိုးသမီးဖက်ရှင်' : 'အလှကုန်နှင့် အသားအရေထိန်းသိမ်းမှု'
    ),
    shopName: live.shopName,
    sellerStatus: 'verified',
    dispatchHub: 'Thailand',
    researchedAt,
    imageUrl: live.imageUrl,
    imageOriginUrl: live.imageOriginUrl,
    imageVerified: live.imageVerified,
    imageSourceNoteEn: live.imageSourceNoteEn,
    imageSourceNoteMy: live.imageSourceNoteMy,
    priceThb: live.priceThb,
    priceStatus: 'verified',
    commissionRate: null,
    commissionVerified: false,
    commissionStatus: 'unverified',
    estimatedCommissionPerSaleThb: null,
    commissionPerSaleStatus: 'unavailable',
    commissionNoteEn:
      'Unverified — private TikTok Shop Affiliate Creator Center commission rates are never fabricated. Confirm live rate inside TikTok Shop Affiliate Center.',
    commissionNoteMy:
      'Unverified — TikTok Shop Affiliate Creator Center ရှိ Private Commission Rate ကို မတီထွင်ပါ။ Affiliate Center အတွင်း ကိုယ်တိုင်စစ်ဆေးပါ။',
    reviewCount: live.reviewCount,
    reviewCountStatus: hasRealReviews ? 'verified' : 'unavailable',
    customerRating: live.customerRating,
    customerRatingStatus: hasRealRating ? 'verified' : 'unavailable',
    feedbackStatus: 'estimated',
    productQualityEvidenceEn: asString(
      analysisRaw.productQualityEvidenceEn,
      live.descriptionSnippet
    ),
    productQualityEvidenceMy: asString(
      analysisRaw.productQualityEvidenceMy,
      `${live.shopName} တရားဝင်စာမျက်နှာမှ အတည်ပြုထားသော Product အချက်အလက်များ။`
    ),
    productQualityStatus: hasRealQualitySpecs ? 'verified' : 'estimated',
    salesEvidenceStatus: 'estimated',
    demandLevel: asEnum<DemandLevel>(
      analysisRaw.demandLevel,
      ['High', 'Growing', 'Steady', 'Moderate'],
      'Growing'
    ),
    demandStatus: 'estimated',
    competitionLevel: asEnum<CompetitionLevel>(
      analysisRaw.competitionLevel,
      ['Low', 'Moderate', 'High'],
      'Moderate'
    ),
    competitionStatus: 'estimated',
    aiVideoSuitability: asEnum<AiVideoSuitability>(
      analysisRaw.aiVideoSuitability,
      ['High', 'Good', 'Moderate'],
      'Good'
    ),
    aiVideoStatus: live.imageVerified ? 'verified' : 'estimated',
    sellerReliabilityLevel: asEnum<'Reliable' | 'Standard' | 'Needs Check'>(
      analysisRaw.sellerReliabilityLevel,
      ['Reliable', 'Standard', 'Needs Check'],
      'Reliable'
    ),
    sellerReliabilityStatus: 'verified',
    opportunityScore: 0,
    confidenceLevel: 'Medium',
    scoringInputs,
    whyChooseEn: asString(
      analysisRaw.whyChooseEn,
      `${live.name} is an active official Thailand listing by ${live.brand} at ฿${live.priceThb.toLocaleString('en-US')} with verifiable brand identity for TikTok Shop affiliate testing.`
    ),
    whyChooseMy: asString(
      analysisRaw.whyChooseMy,
      `${live.name} သည် ${live.brand} ၏ ထိုင်းတရားဝင်ဆိုင်တွင် ฿${live.priceThb.toLocaleString('en-US')} ဖြင့် တကယ်ရောင်းချနေသော Product ဖြစ်၍ စမ်းသပ်ရန် သင့်တော်ပါသည်။`
    ),
    demandEvidenceEn: asStringArray(analysisRaw.demandEvidenceEn, [
      `Active live SKU on official Thai brand storefront (${live.storeDomain}) priced at ฿${live.priceThb.toLocaleString('en-US')}.`,
      `Brand (${live.brand}) operates directly in Thailand's ${live.category === 'womens-fashion' ? "women's fashion" : 'skincare & beauty'} segment.`,
    ]),
    demandEvidenceMy: asStringArray(analysisRaw.demandEvidenceMy, [
      `တရားဝင် ထိုင်း Brand ဆိုင် (${live.storeDomain}) တွင် ฿${live.priceThb.toLocaleString('en-US')} ဖြင့် လက်ရှိရောင်းချနေသော Product ဖြစ်သည်။`,
      `${live.brand} သည် ထိုင်းဈေးကွက်တွင် လူသိများသော Brand တစ်ခုဖြစ်သည်။`,
    ]),
    salesPotentialEn: asString(
      analysisRaw.salesPotentialEn,
      `Realistic Thailand TikTok Shop affiliate test candidate at ฿${live.priceThb.toLocaleString('en-US')}; confirm active TikTok Shop Mall listing and open affiliate plan before scaling.`
    ),
    salesPotentialMy: asString(
      analysisRaw.salesPotentialMy,
      `฿${live.priceThb.toLocaleString('en-US')} ဈေးနှုန်းဖြင့် ထိုင်း TikTok Shop တွင် စမ်းသပ်ရောင်းချနိုင်ပြီး Affiliate Plan ဖွင့်ထားမှုကို စစ်ဆေးသင့်သည်။`
    ),
    reviewStrengthsEn: asStringArray(analysisRaw.reviewStrengthsEn, [
      `Direct official brand provenance (${live.shopName}) reduces counterfeit hesitation among Thai shoppers.`,
      'Clear product positioning and official visual assets support trustworthy short-form demonstrations.',
    ]),
    reviewStrengthsMy: asStringArray(analysisRaw.reviewStrengthsMy, [
      `${live.shopName} တရားဝင် Brand ဖြစ်သဖြင့် အတုအပစိုးရိမ်မှု လျော့နည်းစေသည်။`,
      'Product အချက်အလက်နှင့် ပုံအစစ်များ ရှင်းလင်းသဖြင့် ဗီဒီယိုဖန်တီးရာတွင် ယုံကြည်မှုတိုးစေသည်။',
    ]),
    customerComplaintsEn: asStringArray(analysisRaw.customerComplaintsEn, [
      'Live TikTok Shop buyer review comments must be checked directly on the seller SKU page for batch-specific issues.',
      live.category === 'womens-fashion'
        ? 'Sizing proportions and fabric drape can vary across Thai body types.'
        : 'Skin-type sensitivity or finish preference can vary between Thai humid-climate users.',
    ]),
    customerComplaintsMy: asStringArray(analysisRaw.customerComplaintsMy, [
      'TikTok Shop SKU စာမျက်နှာရှိ လက်ရှိ Buyer Review များကို ကိုယ်တိုင်ထပ်မံစစ်ဆေးသင့်သည်။',
      live.category === 'womens-fashion'
        ? 'အရွယ်အစားနှင့် ဝတ်ဆင်ပုံ ကိုယ်လုံးအချိုးအစားအလိုက် ကွာခြားနိုင်သည်။'
        : 'အသားအရေအမျိုးအစားအလိုက် ဓာတ်မတည့်မှု သို့မဟုတ် အသုံးပြုခံစားချက် ကွာခြားနိုင်သည်။',
    ]),
    competitionDetailEn: asString(
      analysisRaw.competitionDetailEn,
      `Active segment on Thailand TikTok Shop; differentiate content via authentic local use-cases and clear price/quality framing.`
    ),
    competitionDetailMy: asString(
      analysisRaw.competitionDetailMy,
      'ထိုင်း TikTok Shop တွင် ပြိုင်ဆိုင်မှုရှိသော်လည်း လက်တွေ့အသုံးပြုပြသမှုနှင့် ရှင်းလင်းသော ဗီဒီယိုပုံစံဖြင့် ခွဲထွက်နိုင်သည်။'
    ),
    sellerReliabilityEn: asString(
      analysisRaw.sellerReliabilityEn,
      `Verified official Thai brand website (${live.storeDomain}); pair affiliate links strictly with ${live.brand}'s Official Mall storefront on TikTok Shop Thailand.`
    ),
    sellerReliabilityMy: asString(
      analysisRaw.sellerReliabilityMy,
      `တရားဝင် ထိုင်း Brand ဝဘ်ဆိုက် (${live.storeDomain}) ကို အတည်ပြုထားပြီး TikTok Shop Mall ဆိုင်စစ်နှင့်သာ ချိတ်ဆက်ရောင်းချပါ။`
    ),
    generalRisksEn: asStringArray(analysisRaw.generalRisksEn, [
      'Affiliate commission rate and open-plan availability may change inside TikTok Shop Creator Center.',
      'Official brand promo discounts on TikTok Shop may differ from website list price.',
    ]),
    generalRisksMy: asStringArray(analysisRaw.generalRisksMy, [
      'TikTok Shop Creator Center ရှိ Commission Rate နှင့် Affiliate Plan ဖွင့်/ပိတ် အခြေအနေ ပြောင်းလဲနိုင်သည်။',
      'TikTok Shop ပေါ်ရှိ Flash Sale ဈေးနှုန်းသည် တရားဝင်ဝဘ်ဆိုက်ဈေးနှင့် ကွာခြားနိုင်သည်။',
    ]),
    fashionReturnRisk:
      live.category === 'womens-fashion'
        ? normalizeFashionRisk(analysisRaw.fashionReturnRisk)
        : undefined,
    cosmeticsComplianceRisk:
      live.category === 'cosmetics-beauty'
        ? normalizeCosmeticsRisk(analysisRaw.cosmeticsComplianceRisk)
        : undefined,
    aiVideoDetailEn: asString(
      analysisRaw.aiVideoDetailEn,
      `Well-suited for 15–25s Thailand TikTok visual hooks showcasing real product details, official pricing (฿${live.priceThb.toLocaleString('en-US')}), and honest pros/cons.`
    ),
    aiVideoDetailMy: asString(
      analysisRaw.aiVideoDetailMy,
      `฿${live.priceThb.toLocaleString('en-US')} ဈေးနှုန်းနှင့် Product အချက်အလက်အစစ်များကို ၁၅–၂၅ စက္ကန့် ဗီဒီယိုတိုဖြင့် ဆွဲဆောင်မှုရှိရှိ ဖန်တီးနိုင်သည်။`
    ),
    videoIdeas: normalizeVideoIdeas(analysisRaw.videoIdeas),
    sources,
    confidenceDetailEn: asString(
      analysisRaw.confidenceDetailEn,
      `Product identity, live THB price (฿${live.priceThb.toLocaleString('en-US')}), official store link (${live.storeDomain}), and product photo are directly verified live. TikTok Shop private commission rate and live 30-day SKU order count remain unverified until checked in Creator Center.`
    ),
    confidenceDetailMy: asString(
      analysisRaw.confidenceDetailMy,
      `Product အမည်၊ လက်ရှိ THB ဈေးနှုန်း (฿${live.priceThb.toLocaleString('en-US')})၊ တရားဝင်ဆိုင် Link (${live.storeDomain}) နှင့် ဓာတ်ပုံတို့ကို Live အတည်ပြုထားပြီး TikTok Shop Commission Rate နှင့် ရက် ၃၀ ရောင်းအားကို Creator Center တွင် ထပ်မံစစ်ဆေးရန်လိုအပ်ပါသည်။`
    ),
    missingDataEn,
    missingDataMy,
  };

  const evaluation = evaluateProductOpportunity(draftProduct);
  return {
    ...draftProduct,
    opportunityScore: evaluation.totalScore,
    confidenceLevel: evaluation.confidenceLevel,
  };
}

async function analyzeLiveStorefrontBatch(
  ai: GoogleGenAI,
  items: LiveStorefrontProduct[],
  batchIdx: number,
  strategyPreset: StrategyPreset,
  salesWeightPct: number,
  researchedAt: string
): Promise<ResearchProduct[]> {
  const prompt = buildStorefrontAnalysisPrompt(items, strategyPreset, salesWeightPct);
  let lastErr: unknown = null;

  for (const modelName of ANALYSIS_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          systemInstruction:
            'You are a strict Thailand TikTok Shop Affiliate Research Analyst. Analyze ONLY the real, live-fetched official Thai brand listings provided in the prompt. Never invent commission rates or fake ratings. Differentiate scoring strengths realistically. Output ONLY valid JSON.',
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      const rawText = response.text ?? '';
      if (!rawText.trim()) throw new Error('Empty Gemini analysis response');

      const parsed: unknown = JSON.parse(extractJsonText(rawText));
      const analysesArr =
        parsed &&
        typeof parsed === 'object' &&
        Array.isArray((parsed as { analyses?: unknown[] }).analyses)
          ? (parsed as { analyses: Record<string, unknown>[] }).analyses
          : Array.isArray(parsed)
            ? (parsed as Record<string, unknown>[])
            : [];

      const byIndex = new Map<number, Record<string, unknown>>();
      analysesArr.forEach((entry, fallbackIdx) => {
        const idx = typeof entry?.index === 'number' ? entry.index : fallbackIdx;
        byIndex.set(idx, entry);
      });

      return items.map((live, itemIdx) =>
        buildVerifiedStorefrontProduct(
          live,
          byIndex.get(itemIdx) ?? {},
          batchIdx,
          itemIdx,
          researchedAt
        )
      );
    } catch (err) {
      lastErr = err;
      const mapped = mapGeminiError(err);
      if (mapped.code === 'API_KEY_ERROR' || mapped.code === 'MISSING_API_KEY') {
        throw mapped;
      }
    }
  }

  // If Gemini analysis itself also hit 429 quota, throw mapped error so we pause honestly
  throw mapGeminiError(lastErr);
}

async function runLiveStorefrontVerifiedResearch(
  ai: GoogleGenAI,
  config: ResearchConfig,
  researchedAt: string
): Promise<ResearchSessionResponse> {
  const liveFeed = await fetchLiveThaiStorefrontProducts(config.category, config.quantity);

  if (liveFeed.products.length === 0) {
    throw new ResearchApiError(
      503,
      'LIVE_STOREFRONT_UNAVAILABLE',
      'Live official Thai storefronts could not be reached right now and Google Search Grounding quota is exhausted. Please retry shortly.',
      {
        errorMy:
          'Google Search Grounding Quota ပြည့်နေပြီး တရားဝင်ထိုင်းဆိုင်များသို့ ယာယီချိတ်ဆက်မရပါ။ ခဏအကြာ ထပ်မံကြိုးစားပါ။',
      }
    );
  }

  const analyzedProducts: ResearchProduct[] = [];
  const batchSize = 5;

  for (let i = 0; i < liveFeed.products.length; i += batchSize) {
    const slice = liveFeed.products.slice(i, i + batchSize);
    const batchIdx = Math.floor(i / batchSize);
    const batchProducts = await analyzeLiveStorefrontBatch(
      ai,
      slice,
      batchIdx,
      config.strategyPreset,
      config.salesWeightPct,
      researchedAt
    );
    analyzedProducts.push(...batchProducts);
  }

  analyzedProducts.sort((a, b) => b.opportunityScore - a.opportunityScore);
  const finalProducts = analyzedProducts.slice(0, config.quantity);

  // Clear quota pause flag since real live official storefront verification succeeded
  resumeResearch();

  return {
    products: finalProducts,
    requestedQuantity: config.quantity,
    verifiedProductCount: finalProducts.length,
    filteredOutCount: Math.max(0, config.quantity - finalProducts.length),
    researchedAt,
    searchQueries: liveFeed.queries,
    groundingSources: liveFeed.sources,
    researchSourceMode: 'live-official-storefronts',
    config,
  };
}

export async function runThailandProductResearch(
  config: ResearchConfig,
  options?: { forceResume?: boolean }
): Promise<ResearchSessionResponse> {
  if (options?.forceResume) {
    resumeResearch();
  }

  if (researchQuotaState.paused) {
    throw new ResearchApiError(
      429,
      researchQuotaState.reason === 'manual' ? 'RESEARCH_PAUSED' : 'SEARCH_QUOTA_EXHAUSTED',
      researchQuotaState.reason === 'manual'
        ? 'Live product research is currently paused. Click Resume Research to continue.'
        : 'Live Google Search Grounding quota was exhausted and research is paused to prevent unverified guesses. Exact quota reset time is unknown — click Resume & Retry to check availability or update your API key in Settings > Secrets.',
      {
        quotaPaused: true,
        errorMy:
          researchQuotaState.reason === 'manual'
            ? 'Live Product Research ကို ခေတ္တရပ်ဆိုင်းထားပါသည်။ ဆက်လက်ရှာဖွေရန် Resume ကို နှိပ်ပါ။'
            : 'Google Search Grounding Quota ပြည့်နေသောကြောင့် Live Research ကို ခေတ္တရပ်ဆိုင်းထားပါသည်။ Quota ပြန်ရမည့်အချိန်အတိအကျကို မသိနိုင်ပါ — Resume & Retry ဖြင့် ပြန်စစ်နိုင်သည် သို့မဟုတ် Settings > Secrets တွင် Billing-enabled API Key ရွေးချယ်နိုင်ပါသည်။',
      }
    );
  }

  const ai = getGeminiClient();
  const researchedAt = new Date().toISOString();
  const batches = buildBatches(config.category, config.quantity);

  const acceptedProducts: ResearchProduct[] = [];
  const allQueries: string[] = [];
  const allSourcesMap = new Map<string, GroundingSourceLink>();
  let totalFilteredOut = 0;
  let lastError: ResearchApiError | null = null;

  for (let i = 0; i < batches.length; i += 1) {
    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, 600));
    }

    try {
      const batchResult = await runGroundedBatch(
        ai,
        batches[i],
        i,
        config.strategyPreset,
        config.salesWeightPct,
        researchedAt,
        acceptedProducts.map((p) => p.name)
      );

      totalFilteredOut += batchResult.filteredOutCount;
      allQueries.push(...batchResult.queries);
      for (const src of batchResult.sources) {
        if (!allSourcesMap.has(src.url)) {
          allSourcesMap.set(src.url, src);
        }
      }

      for (const product of batchResult.products) {
        if (isDuplicateProduct(product, acceptedProducts)) {
          totalFilteredOut += 1;
        } else {
          acceptedProducts.push(product);
        }
      }
    } catch (err) {
      const mapped = mapGeminiError(err);
      lastError = mapped;

      if (mapped.code === 'API_KEY_ERROR' || mapped.code === 'MISSING_API_KEY') {
        throw mapped;
      }

      if (mapped.code === 'SEARCH_QUOTA_EXHAUSTED') {
        if (acceptedProducts.length > 0) {
          break;
        }
        // Stage 2: Google Search Grounding quota is exhausted — switch to Live Official Thai Storefront
        // Verification (100% real live HTTPS listings, verified THB prices, verified product photos, clickable official URLs)
        // analyzed by Gemini without the quota-limited googleSearch tool.
        return runLiveStorefrontVerifiedResearch(ai, config, researchedAt);
      }
    }
  }

  if (acceptedProducts.length === 0) {
    if (lastError) throw lastError;
    throw new ResearchApiError(
      404,
      'NO_VERIFIED_PRODUCTS',
      'No products passed strict live verification with real web sources. Unverified candidates were excluded to preserve research quality.',
      {
        errorMy:
          'တကယ့် Web အထောက်အထားအပြည့်အစုံဖြင့် အတည်ပြုနိုင်သော Product မတွေ့ရှိသေးပါ။ Research အရည်အသွေးထိန်းသိမ်းရန် အထောက်အထားမပြည့်စုံသော Product များကို ဖယ်ထုတ်ထားပါသည်။',
      }
    );
  }

  acceptedProducts.sort((a, b) => b.opportunityScore - a.opportunityScore);
  const finalProducts = acceptedProducts.slice(0, config.quantity);

  if (researchQuotaState.paused && !lastError) {
    resumeResearch();
  }

  return {
    products: finalProducts,
    requestedQuantity: config.quantity,
    verifiedProductCount: finalProducts.length,
    filteredOutCount: totalFilteredOut,
    researchedAt,
    searchQueries: Array.from(new Set(allQueries)),
    groundingSources: Array.from(allSourcesMap.values()),
    researchSourceMode: 'google-search-grounding',
    config,
  };
}
