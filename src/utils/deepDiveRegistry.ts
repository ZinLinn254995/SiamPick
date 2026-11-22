import type {
  DeepDiveAiVideoToolStyle,
  DeepDiveAnalysisDefinition,
  DeepDiveAnalysisId,
  DeepDiveAnalysisSlotState,
  DeepDiveOriginView,
  DeepDiveSourceContext,
  DeepDiveVideoCreativeOptions,
  DeepDiveVideoCtaStyle,
  DeepDiveVideoFramework,
  DeepDiveVideoProductionStyle,
  DeepDiveVideoScriptLanguage,
  DeepDiveVideoSellingFocus,
  DeepDiveVideoTargetAudience,
  DeepDiveVideoTargetDuration,
  DeepDiveVideoTone,
  DeepDiveWorkspaceState,
} from '../types/deepDive';
import type { ResearchMode, ResearchProduct } from '../types/product';
import { getCanonicalProductId } from './scoring';

export const MAX_VIDEO_CREATIVE_SUGGESTION_CHARS = 600;

export const DEFAULT_DEEP_DIVE_VIDEO_CREATIVE_OPTIONS: DeepDiveVideoCreativeOptions = {
  includeCompetitorVideos: false,
  scriptLanguage: 'th-with-my',
  videoStyle: 'ugc-face',
  duration: '30s',
  tone: 'friendly-bestie',
  framework: 'auto',
  targetAudience: 'auto',
  sellingFocuses: [],
  ctaStyle: 'urgent-basket',
  aiVideoTool: 'general-9-16',
};

const VALID_SCRIPT_LANGUAGES = new Set<DeepDiveVideoScriptLanguage>([
  'th-with-my',
  'my',
  'my-th-mix',
  'th-with-en',
]);
const VALID_PRODUCTION_STYLES = new Set<DeepDiveVideoProductionStyle>([
  'ugc-face',
  'faceless-hands',
  'ai-video',
  'unboxing-first-try',
  'voiceover-broll',
  'before-after-demo',
  'greenscreen-reaction',
]);
const VALID_TARGET_DURATIONS = new Set<DeepDiveVideoTargetDuration>([
  '7-12s',
  '15s',
  '30s',
  '45-60s',
  '60-90s',
]);
const VALID_TONES = new Set<DeepDiveVideoTone>([
  'friendly-bestie',
  'urgent-deal',
  'expert-honest',
  'funny-relatable',
  'luxury-aesthetic',
]);
const VALID_FRAMEWORKS = new Set<DeepDiveVideoFramework>([
  'auto',
  'pas',
  'hook-demo-proof-cta',
  'storytelling',
  'objection-killer',
  'bundle-math',
]);
const VALID_AUDIENCES = new Set<DeepDiveVideoTargetAudience>([
  'auto',
  'budget-hunters',
  'office-students',
  'moms-household',
  'beauty-selfcare',
  'myanmar-in-th',
]);
const VALID_SELLING_FOCUSES = new Set<DeepDiveVideoSellingFocus>([
  'price-bundle',
  'reviews-proof',
  'fast-convenience',
  'quality-ingredients',
  'daily-gift',
]);
const VALID_CTA_STYLES = new Set<DeepDiveVideoCtaStyle>([
  'soft-recommend',
  'urgent-basket',
  'comment-engagement',
]);
const VALID_AI_VIDEO_TOOLS = new Set<DeepDiveAiVideoToolStyle>([
  'general-9-16',
  'veo-kling-cinematic',
  'heygen-avatar',
  'image-to-video',
]);

export function normalizeDeepDiveVideoCreativeOptions(
  raw?: Partial<DeepDiveVideoCreativeOptions> | null
): DeepDiveVideoCreativeOptions {
  const scriptLanguage: DeepDiveVideoScriptLanguage =
    raw?.scriptLanguage && VALID_SCRIPT_LANGUAGES.has(raw.scriptLanguage)
      ? raw.scriptLanguage
      : DEFAULT_DEEP_DIVE_VIDEO_CREATIVE_OPTIONS.scriptLanguage;

  const videoStyle: DeepDiveVideoProductionStyle =
    raw?.videoStyle && VALID_PRODUCTION_STYLES.has(raw.videoStyle)
      ? raw.videoStyle
      : DEFAULT_DEEP_DIVE_VIDEO_CREATIVE_OPTIONS.videoStyle;

  const duration: DeepDiveVideoTargetDuration =
    raw?.duration && VALID_TARGET_DURATIONS.has(raw.duration)
      ? raw.duration
      : DEFAULT_DEEP_DIVE_VIDEO_CREATIVE_OPTIONS.duration;

  const tone: DeepDiveVideoTone =
    raw?.tone && VALID_TONES.has(raw.tone)
      ? raw.tone
      : DEFAULT_DEEP_DIVE_VIDEO_CREATIVE_OPTIONS.tone!;

  const framework: DeepDiveVideoFramework =
    raw?.framework && VALID_FRAMEWORKS.has(raw.framework)
      ? raw.framework
      : DEFAULT_DEEP_DIVE_VIDEO_CREATIVE_OPTIONS.framework!;

  const targetAudience: DeepDiveVideoTargetAudience =
    raw?.targetAudience && VALID_AUDIENCES.has(raw.targetAudience)
      ? raw.targetAudience
      : DEFAULT_DEEP_DIVE_VIDEO_CREATIVE_OPTIONS.targetAudience!;

  const sellingFocuses: DeepDiveVideoSellingFocus[] = Array.isArray(raw?.sellingFocuses)
    ? Array.from(
        new Set(
          raw.sellingFocuses.filter(
            (item): item is DeepDiveVideoSellingFocus =>
              typeof item === 'string' && VALID_SELLING_FOCUSES.has(item as DeepDiveVideoSellingFocus)
          )
        )
      ).slice(0, 5)
    : [];

  const ctaStyle: DeepDiveVideoCtaStyle =
    raw?.ctaStyle && VALID_CTA_STYLES.has(raw.ctaStyle)
      ? raw.ctaStyle
      : DEFAULT_DEEP_DIVE_VIDEO_CREATIVE_OPTIONS.ctaStyle!;

  const aiVideoTool: DeepDiveAiVideoToolStyle =
    raw?.aiVideoTool && VALID_AI_VIDEO_TOOLS.has(raw.aiVideoTool)
      ? raw.aiVideoTool
      : DEFAULT_DEEP_DIVE_VIDEO_CREATIVE_OPTIONS.aiVideoTool!;

  const customSuggestion =
    typeof raw?.customSuggestion === 'string' && raw.customSuggestion.trim().length > 0
      ? raw.customSuggestion.trim().slice(0, MAX_VIDEO_CREATIVE_SUGGESTION_CHARS)
      : undefined;

  const customKeyword =
    typeof raw?.customKeyword === 'string' && raw.customKeyword.trim().length > 0
      ? raw.customKeyword.trim().slice(0, 80)
      : undefined;

  return {
    includeCompetitorVideos: raw?.includeCompetitorVideos === true,
    scriptLanguage,
    videoStyle,
    duration,
    tone,
    framework,
    targetAudience,
    sellingFocuses,
    ctaStyle,
    aiVideoTool,
    ...(customSuggestion ? { customSuggestion } : {}),
    ...(customKeyword ? { customKeyword } : {}),
  };
}

export const VIDEO_CREATIVE_LANGUAGE_LABELS: Record<
  DeepDiveVideoScriptLanguage,
  { en: string; my: string }
> = {
  'th-with-my': { en: 'TH + MY', my: 'ထိုင်း + မြန်မာပြန်' },
  my: { en: 'MY Only', my: 'မြန်မာသီးသန့်' },
  'my-th-mix': { en: 'MY + TH Mix', my: 'မြန်မာ + ထိုင်းရော' },
  'th-with-en': { en: 'TH + EN', my: 'ထိုင်း + English' },
};

export const VIDEO_CREATIVE_STYLE_LABELS: Record<
  DeepDiveVideoProductionStyle,
  { en: string; my: string }
> = {
  'ugc-face': { en: 'UGC', my: 'UGC (မျက်နှာပြ)' },
  'faceless-hands': { en: 'Hands-Only', my: 'Hands-Only (မျက်နှာမပြ)' },
  'ai-video': { en: 'AI Video', my: 'AI Video (Prompt ပါ)' },
  'unboxing-first-try': { en: 'Unboxing / First Try', my: 'ပါဆယ်ဖောက် / စမ်းသုံးပြ' },
  'voiceover-broll': { en: 'Voiceover + B-Roll', my: 'Voiceover + B-Roll' },
  'before-after-demo': { en: 'Before/After Demo', my: 'လက်တွေ့စမ်းပြ (Demo)' },
  'greenscreen-reaction': { en: 'Green Screen', my: 'Green Screen / Reaction' },
};

export const VIDEO_CREATIVE_TONE_LABELS: Record<
  DeepDiveVideoTone,
  { en: string; my: string }
> = {
  'friendly-bestie': { en: 'Friendly Bestie', my: 'သူငယ်ချင်းလိုညွှန်း' },
  'urgent-deal': { en: 'Urgent Deal', my: 'ဈေးတန်အမြန်ဝယ်' },
  'expert-honest': { en: 'Honest Review', my: 'ပွင့်လင်း Review' },
  'funny-relatable': { en: 'Funny / Relatable', my: 'ဟာသနှော' },
  'luxury-aesthetic': { en: 'Luxury / ASMR', my: 'သပ်ရပ် Premium' },
};

export const VIDEO_CREATIVE_FRAMEWORK_LABELS: Record<
  DeepDiveVideoFramework,
  { en: string; my: string }
> = {
  auto: { en: 'Auto (AI Picks)', my: 'Auto (AI ရွေး)' },
  pas: { en: 'PAS (Problem-Solution)', my: 'PAS (ပြဿနာ→ဖြေရှင်း)' },
  'hook-demo-proof-cta': { en: 'Hook-Demo-Proof-CTA', my: 'Hook→Demo→Proof→CTA' },
  storytelling: { en: 'Storytelling / Vlog', my: 'Storytelling / Vlog' },
  'objection-killer': { en: 'Objection Killer', my: 'သံသယရှင်းရောင်းနည်း' },
  'bundle-math': { en: 'Price / Bundle Math', my: 'ဈေးတန်တွက်ပြနည်း' },
};

export const VIDEO_CREATIVE_AUDIENCE_LABELS: Record<
  DeepDiveVideoTargetAudience,
  { en: string; my: string }
> = {
  auto: { en: 'Auto (By Product)', my: 'Auto (Product အလိုက်)' },
  'budget-hunters': { en: 'Promo / Value Hunters', my: 'ဈေးတန်/Promo ရှာသူ' },
  'office-students': { en: 'Office & Students', my: 'ရုံးဝန်ထမ်း/ကျောင်းသား' },
  'moms-household': { en: 'Moms & Household', my: 'အိမ်ရှင်မ/မိသားစု' },
  'beauty-selfcare': { en: 'Beauty & Self-Care', my: 'အလှအပ/ကျန်းမာရေး' },
  'myanmar-in-th': { en: 'Myanmar in Thailand', my: 'ထိုင်းရောက်မြန်မာများ' },
};

export const VIDEO_CREATIVE_FOCUS_LABELS: Record<
  DeepDiveVideoSellingFocus,
  { en: string; my: string }
> = {
  'price-bundle': { en: 'Price / Bundle', my: 'ဈေးတန်/Bundle' },
  'reviews-proof': { en: 'Reviews & Sales Proof', my: 'ရောင်းအား/Review များ' },
  'fast-convenience': { en: 'Fast & Easy Use', my: 'အသုံးပြုရလွယ်မြန်' },
  'quality-ingredients': { en: 'Quality & Ingredients', my: 'အရည်အသွေး/ပါဝင်ပစ္စည်း' },
  'daily-gift': { en: 'Daily Essential / Gift', my: 'နေ့စဉ်သုံး/လက်ဆောင်' },
};

export const VIDEO_CREATIVE_CTA_LABELS: Record<
  DeepDiveVideoCtaStyle,
  { en: string; my: string }
> = {
  'soft-recommend': { en: 'Soft Recommend', my: 'Soft ညွှန်းပုံ' },
  'urgent-basket': { en: 'Urgent Yellow Basket', my: 'တောင်းဝါအမြန်နှိပ်ခိုင်း' },
  'comment-engagement': { en: 'Comment + Basket', my: 'Comment မေးခွန်း + တောင်းဝါ' },
};

export const VIDEO_CREATIVE_AI_TOOL_LABELS: Record<
  DeepDiveAiVideoToolStyle,
  { en: string; my: string }
> = {
  'general-9-16': { en: 'General 9:16', my: 'General 9:16' },
  'veo-kling-cinematic': { en: 'Veo / Kling Cinematic', my: 'Veo / Kling Cinematic' },
  'heygen-avatar': { en: 'HeyGen / AI Avatar', my: 'HeyGen / AI Avatar' },
  'image-to-video': { en: 'Image-to-Video Shot', my: 'Image-to-Video Product Shot' },
};

export type SmartVideoCreativeTemplateId =
  | 'best-fit'
  | 'easy-faceless'
  | 'ai-creator'
  | 'myanmar-in-th';

export interface SmartVideoCreativeTemplate {
  id: SmartVideoCreativeTemplateId;
  isRecommended?: boolean;
  titleEn: string;
  titleMy: string;
  specEn: string;
  specMy: string;
  reasonEn: string;
  reasonMy: string;
  patch: Partial<DeepDiveVideoCreativeOptions>;
}

/**
 * 100% deterministic, 0-credit local template recommender for Module #09.
 * Reads ONLY verified fields already present on the selected ResearchProduct
 * (category, title signals, price, reviews/sales) to suggest 4 ready-to-click
 * creative setting combinations without ever calling external APIs or inventing metrics.
 */
export function buildSmartVideoCreativeTemplates(
  product?: ResearchProduct | null
): SmartVideoCreativeTemplate[] {
  const titleRaw = product
    ? [product.name, product.nameMy, product.subCategory, product.subCategoryMy]
        .filter(Boolean)
        .join(' ')
    : '';
  const category = product?.category ?? null;
  const price =
    typeof product?.kalodataMetrics?.unitPriceThb === 'number' &&
    product.kalodataMetrics.unitPriceThb > 0
      ? product.kalodataMetrics.unitPriceThb
      : typeof product?.priceThb === 'number' && product.priceThb > 0
        ? product.priceThb
        : null;
  const reviewCount =
    product?.kalodataMetrics?.productReviewCount ?? product?.reviewCount ?? null;
  const salesVolume = product?.kalodataMetrics?.salesVolume ?? null;

  const hasBundleSignal =
    /1\s*แถม\s*\d|2\s*แถม\s*\d|ซื้อ\s*\d\s*แถม|แถมฟรี|เซต|แพ็ค|แพ็ก|\bset\b|\bbundle\b|\bpack\b|1\s*get\s*\d|buy\s*\d\s*get/i.test(
      titleRaw
    );
  const isBudgetPrice = price !== null && price <= 200;
  const hasHighReviews = typeof reviewCount === 'number' && reviewCount >= 500;
  const hasHighSales = typeof salesVolume === 'number' && salesVolume >= 1000;

  const isSkincareOrBeauty =
    category === 'cosmetics-beauty' ||
    /cream|serum|sunscreen|spf|cleanser|toner|mask|lotion|lip|tint|makeup|skincare|ครีม|เซรั่ม|กันแดด|ลิป|โฟมล้างหน้า|มาส์ก/i.test(
      titleRaw
    );
  const isSupplementOrHealth =
    category === 'health-personal-care' ||
    /vitamin|collagen|supplement|probiotic|fiber|วิตามิน|คอลลาเจน|อาหารเสริม|ไฟเบอร์/i.test(
      titleRaw
    );
  const isHomeOrGadget =
    category === 'home-living' ||
    category === 'kitchen' ||
    category === 'electronics' ||
    category === 'automotive' ||
    category === 'pet-supplies';
  const isFoodOrSnack = category === 'food-beverages';
  const isFashionOrGift =
    category === 'womens-fashion' ||
    category === 'jewelry-accessories' ||
    category === 'baby-kids' ||
    category === 'toys-hobbies';

  const priceTag = price !== null ? `฿${Math.round(price).toLocaleString('en-US')}` : null;

  let bestFit: SmartVideoCreativeTemplate;

  if (hasBundleSignal) {
    const focuses: DeepDiveVideoSellingFocus[] =
      hasHighReviews || hasHighSales ? ['price-bundle', 'reviews-proof'] : ['price-bundle'];
    const audience: DeepDiveVideoTargetAudience =
      isSupplementOrHealth || isSkincareOrBeauty ? 'beauty-selfcare' : 'budget-hunters';
    bestFit = {
      id: 'best-fit',
      isRecommended: true,
      titleEn: 'Bundle Deal + Value Math',
      titleMy: 'Bundle ဈေးတန်တွက်ပြ + Review',
      specEn: 'UGC · 30s · Urgent Deal · Bundle Math',
      specMy: 'UGC · 30s · ဈေးတန်အမြန်ဝယ် · ဈေးတန်တွက်ပြ',
      reasonEn: priceTag
        ? `Bundle promo at ${priceTag}${hasHighReviews ? ` with ${reviewCount!.toLocaleString('en-US')} reviews` : ''} — breaking down unit value converts fastest.`
        : 'Bundle promo detected — breaking down price per unit in 30s converts fastest.',
      reasonMy: priceTag
        ? `Bundle ပရိုမိုးရှင်းပါပြီး ဈေး ${priceTag}${hasHighReviews ? ` · Review ${reviewCount!.toLocaleString('en-US')} ခုရှိ၍` : ' ဖြစ်၍'} တစ်ခုကျသင့်ငွေ တွက်ပြရောင်းနည်း အသင့်တော်ဆုံး။`
        : 'Bundle ပရိုမိုးရှင်းပါဝင်၍ တစ်ခုကျသင့်ငွေ တွက်ပြရောင်းနည်းက အသင့်တော်ဆုံး။',
      patch: {
        videoStyle: 'ugc-face',
        duration: '30s',
        tone: 'urgent-deal',
        framework: 'bundle-math',
        targetAudience: audience,
        sellingFocuses: focuses,
        ctaStyle: 'urgent-basket',
      },
    };
  } else if (isSkincareOrBeauty) {
    bestFit = {
      id: 'best-fit',
      isRecommended: true,
      titleEn: 'Texture Demo + Honest Review',
      titleMy: 'လက်တွေ့စမ်းပြ + ပွင့်လင်း Review',
      specEn: 'Before/After Demo · 30s · Honest Review',
      specMy: 'လက်တွေ့စမ်းပြ · 30s · ပွင့်လင်း Review',
      reasonEn:
        'Skincare & beauty buyers trust close-up texture demos with honest, policy-safe recommendations.',
      reasonMy:
        'အလှအပ/Skincare ဖြစ်၍ လက်တွေ့ Texture စမ်းပြပြီး ပွင့်လင်းစွာညွှန်းပုံက ယုံကြည်မှုအရဆုံး။',
      patch: {
        videoStyle: 'before-after-demo',
        duration: '30s',
        tone: 'expert-honest',
        framework: 'hook-demo-proof-cta',
        targetAudience: 'beauty-selfcare',
        sellingFocuses: hasHighReviews
          ? ['quality-ingredients', 'reviews-proof']
          : ['quality-ingredients', 'fast-convenience'],
        ctaStyle: 'soft-recommend',
      },
    };
  } else if (isSupplementOrHealth) {
    bestFit = {
      id: 'best-fit',
      isRecommended: true,
      titleEn: 'Routine + Objection Killer',
      titleMy: 'နေ့စဉ်သုံး + သံသယရှင်း Review',
      specEn: 'UGC · 30s · Honest Review · Objection Killer',
      specMy: 'UGC · 30s · ပွင့်လင်း Review · သံသယရှင်း',
      reasonEn:
        'Health & supplement items sell safely by answering buyer doubts with daily-routine framing.',
      reasonMy:
        'ကျန်းမာရေး/ဖြည့်စွက်စာ ဖြစ်၍ ဝယ်သူသံသယရှင်းပြီး နေ့စဉ်သုံးပြပုံက Policy ဘေးကင်းပြီး ရောင်းကောင်းသည်။',
      patch: {
        videoStyle: 'ugc-face',
        duration: '30s',
        tone: 'expert-honest',
        framework: 'objection-killer',
        targetAudience: 'beauty-selfcare',
        sellingFocuses: hasHighReviews
          ? ['reviews-proof', 'quality-ingredients']
          : ['quality-ingredients', 'daily-gift'],
        ctaStyle: 'urgent-basket',
      },
    };
  } else if (isHomeOrGadget) {
    bestFit = {
      id: 'best-fit',
      isRecommended: true,
      titleEn: 'Problem → Solution Demo',
      titleMy: 'ပြဿနာ→ဖြေရှင်း 15s Demo',
      specEn: 'Hands-Only · 15s · PAS Framework',
      specMy: 'Hands-Only · 15s · PAS ပြဿနာ→ဖြေရှင်း',
      reasonEn:
        'Home, kitchen & gadget products convert quickest via visual 15s problem-to-solution demos.',
      reasonMy:
        'အိမ်သုံး/Gadget ဖြစ်၍ ပြဿနာပြပြီး ၁၅ စက္ကန့်အတွင်း လက်တွေ့ဖြေရှင်းပြပုံက ဝယ်လိုအားအမြန်ဆုံး။',
      patch: {
        videoStyle: 'faceless-hands',
        duration: '15s',
        tone: 'friendly-bestie',
        framework: 'pas',
        targetAudience:
          category === 'home-living' || category === 'kitchen' ? 'moms-household' : 'auto',
        sellingFocuses: isBudgetPrice
          ? ['fast-convenience', 'price-bundle']
          : ['fast-convenience', 'quality-ingredients'],
        ctaStyle: 'urgent-basket',
      },
    };
  } else if (isFoodOrSnack) {
    bestFit = {
      id: 'best-fit',
      isRecommended: true,
      titleEn: 'First-Bite Unboxing',
      titleMy: 'ပါဆယ်ဖောက် စားပြ/သောက်ပြ',
      specEn: 'Unboxing · 15s · Relatable · Comment CTA',
      specMy: 'ပါဆယ်ဖောက် · 15s · ဟာသနှော · Comment CTA',
      reasonEn:
        'Food & beverage items gain fast reach with real first-taste reactions and comment prompts.',
      reasonMy:
        'အစားအသောက် ဖြစ်၍ ဖောက်စားပြ Reaction နှင့် Comment မေးခွန်းတွဲရိုက်ပုံက Viral ဖြစ်လွယ်သည်။',
      patch: {
        videoStyle: 'unboxing-first-try',
        duration: '15s',
        tone: 'funny-relatable',
        framework: 'hook-demo-proof-cta',
        targetAudience: 'budget-hunters',
        sellingFocuses: hasHighReviews
          ? ['price-bundle', 'reviews-proof']
          : ['price-bundle', 'daily-gift'],
        ctaStyle: 'comment-engagement',
      },
    };
  } else if (isFashionOrGift) {
    bestFit = {
      id: 'best-fit',
      isRecommended: true,
      titleEn: 'Unboxing & Real-Fit Showcase',
      titleMy: 'ပါဆယ်ဖောက် အပြင်ပုံစံပြ',
      specEn: 'Unboxing · 15s · Friendly Bestie',
      specMy: 'ပါဆယ်ဖောက် · 15s · သူငယ်ချင်းလိုညွှန်း',
      reasonEn:
        'Fashion & gift items convert well when viewers see true texture, fit, and real unboxing.',
      reasonMy:
        'ဖက်ရှင်/လက်ဆောင်ပစ္စည်း ဖြစ်၍ ပါဆယ်ဖောက်ပြီး အပြင်ပုံစံအတိအကျပြပေးခြင်းက တောင်းဝါနှိပ်နှုန်းကောင်းသည်။',
      patch: {
        videoStyle: 'unboxing-first-try',
        duration: '15s',
        tone: 'friendly-bestie',
        framework: 'hook-demo-proof-cta',
        targetAudience: category === 'baby-kids' ? 'moms-household' : 'auto',
        sellingFocuses: isBudgetPrice
          ? ['price-bundle', 'daily-gift']
          : ['quality-ingredients', 'daily-gift'],
        ctaStyle: 'urgent-basket',
      },
    };
  } else {
    bestFit = {
      id: 'best-fit',
      isRecommended: true,
      titleEn: 'High-Conversion 30s UGC',
      titleMy: 'ရောင်းကောင်း 30s UGC ပုံစံ',
      specEn: `UGC · 30s · ${isBudgetPrice ? 'Urgent Deal' : 'Friendly Bestie'} · Hook→Demo`,
      specMy: `UGC · 30s · ${isBudgetPrice ? 'ဈေးတန်အမြန်ဝယ်' : 'သူငယ်ချင်းလိုညွှန်း'} · Hook→Demo`,
      reasonEn:
        'Proven all-round TikTok Shop affiliate structure balancing fast hook, clear demo, and yellow basket CTA.',
      reasonMy:
        'TikTok Shop တွင် ယေဘုယျ ရောင်းအားအမြန်ဆုံး Hook→Demo→Proof→CTA 30s ပုံစံ။',
      patch: {
        videoStyle: 'ugc-face',
        duration: '30s',
        tone: isBudgetPrice ? 'urgent-deal' : 'friendly-bestie',
        framework: 'hook-demo-proof-cta',
        targetAudience: isBudgetPrice ? 'budget-hunters' : 'auto',
        sellingFocuses: hasHighReviews
          ? ['reviews-proof', 'price-bundle']
          : ['fast-convenience'],
        ctaStyle: 'urgent-basket',
      },
    };
  }

  const easyFaceless: SmartVideoCreativeTemplate = {
    id: 'easy-faceless',
    titleEn: 'Quick Hands-Only (No Face)',
    titleMy: 'မျက်နှာမပြ အမြန်ရိုက် (15s)',
    specEn: 'Hands-Only · 15s · Friendly · Basket CTA',
    specMy: 'Hands-Only · 15s · သူငယ်ချင်းလို · တောင်းဝါ',
    reasonEn: 'Film alone with 1 phone showing only hands & product — easiest 15s edit.',
    reasonMy: 'မျက်နှာမပြဘဲ ဖုန်း ၁ လုံးတည်း လက်နဲ့ကိုင်ပြ အမြန်ရိုက်တင်လိုသူများအတွက်။',
    patch: {
      videoStyle: 'faceless-hands',
      duration: '15s',
      tone: 'friendly-bestie',
      framework: 'hook-demo-proof-cta',
      targetAudience: 'auto',
      sellingFocuses: isBudgetPrice ? ['fast-convenience', 'price-bundle'] : ['fast-convenience'],
      ctaStyle: 'urgent-basket',
    },
  };

  const aiCreator: SmartVideoCreativeTemplate = {
    id: 'ai-creator',
    titleEn: 'AI Video Creator Pack',
    titleMy: 'AI Video ဖန်တီးမည် (Prompt ပါ)',
    specEn: 'AI Video · 15s · Veo / Kling Cinematic',
    specMy: 'AI Video · 15s · Veo / Kling Prompt',
    reasonEn: 'Ready-to-paste 9:16 Veo/Kling prompts per scene — no camera filming required.',
    reasonMy: 'ကိုယ်တိုင်မရိုက်ဘဲ Veo / Kling AI Video Prompt များဖြင့် ကြော်ငြာဖန်တီးရန်။',
    patch: {
      videoStyle: 'ai-video',
      duration: '15s',
      tone: isBudgetPrice ? 'urgent-deal' : 'luxury-aesthetic',
      framework: 'pas',
      targetAudience: 'auto',
      sellingFocuses: hasBundleSignal ? ['price-bundle'] : ['quality-ingredients'],
      ctaStyle: 'urgent-basket',
      aiVideoTool: 'veo-kling-cinematic',
    },
  };

  const myanmarInTh: SmartVideoCreativeTemplate = {
    id: 'myanmar-in-th',
    titleEn: 'Myanmar Shoppers in Thailand',
    titleMy: 'ထိုင်းရောက်မြန်မာဝယ်သူ ပစ်မှတ်',
    specEn: 'MY+TH Mix · UGC · 30s · Myanmar in TH',
    specMy: 'မြန်မာ+ထိုင်းရော · UGC · 30s · ထိုင်းရောက်မြန်မာ',
    reasonEn: 'Warm Myanmar + Thai mix tailored directly for Myanmar buyers living in Thailand.',
    reasonMy: 'ထိုင်းရောက်မြန်မာဝယ်သူများအတွက် မြန်မာ+ထိုင်းရော ရင်းရင်းနှီးနှီးညွှန်းရောင်းပုံ။',
    patch: {
      scriptLanguage: 'my-th-mix',
      videoStyle: 'ugc-face',
      duration: '30s',
      tone: 'friendly-bestie',
      framework: hasBundleSignal ? 'bundle-math' : 'storytelling',
      targetAudience: 'myanmar-in-th',
      sellingFocuses:
        hasBundleSignal || isBudgetPrice
          ? ['price-bundle', 'reviews-proof']
          : ['reviews-proof', 'fast-convenience'],
      ctaStyle: 'urgent-basket',
    },
  };

  return [bestFit, easyFaceless, aiCreator, myanmarInTh];
}

export function isSmartVideoCreativeTemplateActive(
  options: DeepDiveVideoCreativeOptions,
  template: SmartVideoCreativeTemplate
): boolean {
  const norm = normalizeDeepDiveVideoCreativeOptions(options);
  const p = template.patch;
  if (p.scriptLanguage !== undefined && norm.scriptLanguage !== p.scriptLanguage) return false;
  if (p.videoStyle !== undefined && norm.videoStyle !== p.videoStyle) return false;
  if (p.duration !== undefined && norm.duration !== p.duration) return false;
  if (p.tone !== undefined && norm.tone !== p.tone) return false;
  if (p.framework !== undefined && norm.framework !== p.framework) return false;
  if (p.targetAudience !== undefined && norm.targetAudience !== p.targetAudience) return false;
  if (p.ctaStyle !== undefined && norm.ctaStyle !== p.ctaStyle) return false;
  if (p.aiVideoTool !== undefined && norm.aiVideoTool !== p.aiVideoTool) return false;
  if (p.sellingFocuses !== undefined) {
    const a = [...(norm.sellingFocuses ?? [])].sort();
    const b = [...p.sellingFocuses].sort();
    if (a.length !== b.length || a.some((val, i) => val !== b[i])) return false;
  }
  return true;
}

/**
 * Canonical registry of the 9 independent Deep Dive analysis modules.
 * Strict separation of responsibilities:
 * - #01–#07: Verified market metrics & peer comparisons
 * - #08: AI Strategic Recommendation (Business Go / No-Go Decision ONLY)
 * - #09: AI Ad Video Creative Studio (Competitor Video Study + Script + SEO Execution ONLY)
 */
export const DEEP_DIVE_ANALYSIS_OPTIONS: readonly DeepDiveAnalysisDefinition[] = [
  {
    id: 'product-intelligence',
    order: 1,
    nameEn: 'Product Intelligence',
    nameMy: 'Product Intelligence (ထုတ်ကုန်အသေးစိတ်)',
    shortDescriptionEn: 'Inspect product profile, category fit, price range, SKUs, and core strengths/weaknesses.',
    shortDescriptionMy: 'ထုတ်ကုန်အသေးစိတ်၊ Category၊ ဈေးနှုန်းအပိုင်းအခြား၊ SKU နှင့် အားသာချက်/အားနည်းချက်များကို စစ်ဆေးရန်။',
    whatItDoesEn:
      'Builds a structured breakdown of the selected product profile so you understand what is being sold, how variants are priced, and what quality signals exist.',
    whatItDoesMy:
      'ရွေးချယ်ထားသော Product ၏ အခြေခံအချက်အလက်များ၊ Variant ဈေးနှုန်းများနှင့် အရည်အသွေးလက္ခဏာများကို စနစ်တကျ အသေးစိတ် ခွဲခြမ်းစိတ်ဖြာပေးပါသည်။',
    whatItChecksEn: [
      'Product Details',
      'Product Category',
      'Price & Price Range',
      'SKU Information',
      'Rating & Review Count',
      'Product Strengths / Weaknesses',
    ],
    whatItChecksMy: [
      'Product Details (ထုတ်ကုန်အသေးစိတ်)',
      'Product Category (အမျိုးအစား)',
      'Price & Price Range (ဈေးနှုန်းနှင့် ဈေးနှုန်းအပိုင်းအခြား)',
      'SKU Information (SKU အချက်အလက်များ)',
      'Rating & Review Count (အဆင့်သတ်မှတ်ချက်နှင့် Review အရေအတွက်)',
      'Product အားသာချက် / အားနည်းချက်',
    ],
    expectedOutcomeEn:
      'A clear, factual product snapshot helping you understand the product condition and variant structure before promoting.',
    expectedOutcomeMy:
      'Product ၏ လက်ရှိအခြေအနေနှင့် အသေးစိတ်ဖွဲ့စည်းပုံကို မကြော်ငြာမီ ရှင်းလင်းစွာ နားလည်နိုင်မည်ဖြစ်သည်။',
    requiredDataSourcesEn:
      'Existing research product payload + Kalodata Product Detail API (when missing from Fast Mode).',
    requiredDataSourcesMy:
      'လက်ရှိရရှိထားသော Product Data + Kalodata Product Detail API (Fast Mode တွင် မပါသေးပါက)။',
    estimatedCostNoteEn:
      'Low credit impact — reuses already-fetched product data & cache first (0 cr); calls verified Product Detail API (0.1 cr) only if missing.',
    estimatedCostNoteMy:
      'Credit ကုန်ကျစရိတ်နည်းသည် — ရှိပြီးသား Product Data နှင့် Cache ကို အရင်ပြန်သုံးပြီး (0 cr) လိုအပ်မှသာ Product Detail API (0.1 cr) ခေါ်ပါမည်။',
    costSensitivity: 'low',
    missingDataBehaviorEn:
      'Any unavailable field (such as SKU list or rating count) is explicitly labeled as Unavailable without guessing or filling placeholder numbers.',
    missingDataBehaviorMy:
      'SKU သို့မဟုတ် Rating ကဲ့သို့ မရရှိနိုင်သော အချက်အလက်များကို ခန့်မှန်းမဖြည့်ဘဲ “Unavailable (မရရှိနိုင်ပါ)” ဟု တိကျစွာ ဖော်ပြပါမည်။',
  },
  {
    id: 'sales-market-intelligence',
    order: 2,
    nameEn: 'Sales & Market Intelligence',
    nameMy: 'Sales & Market Intelligence (ရောင်းအားနှင့် ဈေးကွက်)',
    shortDescriptionEn: 'Examine sales volume, GMV/revenue, growth momentum, time trends, and market demand.',
    shortDescriptionMy: 'ရောင်းအားပမာဏ၊ GMV/ဝင်ငွေ၊ တိုးတက်မှုနှုန်း၊ အချိန်အလိုက် Trend နှင့် ဈေးကွက်ဝယ်လိုအားကို စစ်ဆေးရန်။',
    whatItDoesEn:
      'Evaluates real sales velocity, revenue scale, growth trajectory, and market demand stability across Thailand TikTok Shop.',
    whatItDoesMy:
      'ထိုင်း TikTok Shop ပေါ်ရှိ တကယ့်ရောင်းအားအရှိန်၊ ဝင်ငွေပမာဏ၊ တိုးတက်မှုလမ်းကြောင်းနှင့် ဈေးကွက်ဝယ်လိုအား တည်ငြိမ်မှုကို စစ်ဆေးပေးပါသည်။',
    whatItChecksEn: [
      'Sales Volume',
      'GMV / Revenue',
      'Sales Growth',
      'Daily / Weekly / Monthly Trend (when available)',
      'Market Demand',
      'Market Trend',
    ],
    whatItChecksMy: [
      'Sales Volume (ရောင်းအားအရေအတွက်)',
      'GMV / Revenue (စုစုပေါင်းရောင်းရငွေ)',
      'Sales Growth (ရောင်းအားတိုးတက်နှုန်း)',
      'Daily / Weekly / Monthly Trend (Data ရရှိပါက)',
      'Market Demand (ဈေးကွက်ဝယ်လိုအား)',
      'Market Trend (ဈေးကွက်လမ်းကြောင်း)',
    ],
    expectedOutcomeEn:
      'Clear visibility into whether sales are rising, steady, or cooling down so you can judge true demand.',
    expectedOutcomeMy:
      'Product ၏ ရောင်းအားတက်နေသည်လား၊ တည်ငြိမ်နေသည်လား နှင့် ဈေးကွက်အခြေအနေအမှန်ကို ရှင်းလင်းစွာ နားလည်နိုင်မည်ဖြစ်သည်။',
    requiredDataSourcesEn:
      'Existing Kalodata Sales & Revenue metrics + optional Product Detail API (0.1 cr only if missing). Historical Daily/Weekly/Monthly Trend API is currently Unavailable / Not Verified.',
    requiredDataSourcesMy:
      'ရှိပြီးသား Kalodata ရောင်းအားနှင့် ဝင်ငွေ Data + လိုအပ်မှသာ Product Detail API (0.1 cr)။ Daily/Weekly/Monthly Trend API သည် လက်ရှိတွင် Unavailable / Not Verified ဖြစ်သည်။',
    estimatedCostNoteEn:
      'Low credit impact — reuses existing verified sales & revenue metrics (0 cr) and never calls unverified trend endpoints.',
    estimatedCostNoteMy:
      'Credit ကုန်ကျစရိတ်နည်းသည် — ရှိပြီးသား ရောင်းအား/ဝင်ငွေ Data ကို ပြန်သုံးပြီး (0 cr) အတည်မပြုရသေးသော Trend API များ မခေါ်ပါ။',
    costSensitivity: 'low',
    missingDataBehaviorEn:
      'If Daily / Weekly / Monthly trend series are not returned by a verified API, the report explicitly states trend data is unavailable rather than interpolating fake charts.',
    missingDataBehaviorMy:
      'Daily / Weekly / Monthly Trend Data မရရှိပါက အတုအယောင် ဂရပ်မဆွဲဘဲ Trend Data မရရှိနိုင်ကြောင်း ရှင်းလင်းစွာ ဖော်ပြပါမည်။',
  },
  {
    id: 'affiliate-profit-analysis',
    order: 3,
    nameEn: 'Affiliate Profit Analysis',
    nameMy: 'Affiliate Profit Analysis (Affiliate အမြတ်တွက်ချက်မှု)',
    shortDescriptionEn: 'Calculate commission rate, THB earned per sale, discount impact, and earning scenarios.',
    shortDescriptionMy: 'Affiliate ကော်မရှင်နှုန်း၊ တစ်ခုရောင်းရဝင်ငွေ၊ လျှော့ဈေးသက်ရောက်မှုနှင့် ခန့်မှန်းဝင်ငွေတွက်ချက်ရန်။',
    whatItDoesEn:
      'Translates product price, affiliate commission rate, and promotion structure into concrete per-sale and volume-based THB earning scenarios.',
    whatItDoesMy:
      'ထုတ်ကုန်ဈေးနှုန်း၊ Affiliate ကော်မရှင်နှုန်းနှင့် ပရိုမိုးရှင်းလျှော့ဈေးများကို အခြေခံ၍ တစ်ခုရောင်းရလျှင် ရမည့်ဝင်ငွေနှင့် ရောင်းအားအလိုက် ခန့်မှန်းအမြတ်ကို တွက်ချက်ပေးပါသည်။',
    whatItChecksEn: [
      'Affiliate Commission Rate',
      'Commission per Sale',
      'Price-based Earning Calculation',
      'Promotion / Discount Impact',
      'Estimated Earning Scenarios',
      'Profit Potential',
    ],
    whatItChecksMy: [
      'Affiliate Commission Rate (ကော်မရှင်ရာခိုင်နှုန်း)',
      'Commission per Sale (တစ်ခုရောင်းရလျှင် ရမည့်ကော်မရှင်)',
      'ဈေးနှုန်းအလိုက် ဝင်ငွေတွက်ချက်မှု',
      'Promotion / Discount (လျှော့ဈေးနှင့် ပရိုမိုးရှင်း)',
      'Estimated Earning Scenarios (ခန့်မှန်းဝင်ငွေတွက်ချက်မှုများ)',
      'Profit Potential (အမြတ်အစွန်းအလားအလာ)',
    ],
    expectedOutcomeEn:
      'Practical THB income projections so you know how much affiliate profit you can realistically earn per 10, 50, or 100 sales.',
    expectedOutcomeMy:
      'Affiliate လုပ်ပါက တစ်ခုချင်းစီနှင့် အရေအတွက်အလိုက် ဘယ်လောက်ဝင်ငွေရနိုင်မလဲဆိုတာ လက်တွေ့ကျကျ တွက်ချက်သိရှိနိုင်မည်ဖြစ်သည်။',
    requiredDataSourcesEn:
      'Existing verified price & affiliate commission rate (100% local computation).',
    requiredDataSourcesMy:
      'ရှိပြီးသား တရားဝင်ဈေးနှုန်းနှင့် ကော်မရှင်နှုန်း (100% Local တွက်ချက်မှု)။',
    estimatedCostNoteEn:
      'Zero credit impact (0 cr) — all profit scenarios calculate locally from verified price & commission with zero extra API calls.',
    estimatedCostNoteMy:
      'Credit ကုန်ကျစရိတ် 0 cr — ဈေးနှုန်းနှင့် ကော်မရှင် Data ဖြင့် API ထပ်မခေါ်ဘဲ Local တွင် တိုက်ရိုက်တွက်ချက်ပေးပါသည်။',
    costSensitivity: 'low',
    missingDataBehaviorEn:
      'If commission rate or unit price is unavailable, earning scenarios are withheld and the missing input is clearly flagged instead of assuming a default rate.',
    missingDataBehaviorMy:
      'ကော်မရှင်နှုန်း သို့မဟုတ် ဈေးနှုန်းမရှိပါက ခန့်မှန်းနှုန်းထား အတုဖြင့်မတွက်ဘဲ လိုအပ်သော Data မရရှိနိုင်ကြောင်း ရှင်းလင်းစွာ ဖော်ပြပါမည်။',
  },
  {
    id: 'creator-competition-analysis',
    order: 4,
    nameEn: 'Creator Competition Analysis',
    nameMy: 'Creator Competition Analysis (Creator ပြိုင်ဆိုင်မှု)',
    shortDescriptionEn: 'Analyze promoting creator count, top creators, sales share, and market entry space.',
    shortDescriptionMy: 'Promote လုပ်နေသော Creator အရေအတွက်၊ ထိပ်တန်း Creator များ၊ ရောင်းအားဝေစုနှင့် ဝင်ရောက်ယှဉ်ပြိုင်နိုင်ခြေ စစ်ဆေးရန်။',
    whatItDoesEn:
      'Maps how crowded the affiliate landscape is for this product, who drives the majority of sales, and whether new creators still have room to break in.',
    whatItDoesMy:
      'ဤ Product ကို Creator မည်မျှ ကြော်ငြာနေသည်၊ မည်သူတို့က ရောင်းအားအများဆုံးရနေသည်နှင့် Creator အသစ်များ ဝင်ရောက်ယှဉ်ပြိုင်ရန် အခွင့်အလမ်းရှိမရှိကို စစ်ဆေးပေးပါသည်။',
    whatItChecksEn: [
      'Number of Creators Promoting the Product',
      'Top Performing Creators',
      'Creator Sales Contribution',
      'Creator Competition Level',
      'Market Entry Opportunity',
    ],
    whatItChecksMy: [
      'Product ကို Promote လုပ်နေသော Creator အရေအတွက်',
      'Top Performing Creators (ရောင်းအားအကောင်းဆုံး Creator များ)',
      'Creator Sales Contribution (Creator များ၏ ရောင်းအားပါဝင်မှု)',
      'Creator Competition (ပြိုင်ဆိုင်မှုအခြေအနေ)',
      'Market Entry Opportunity (ဝင်ရောက်ယှဉ်ပြိုင်နိုင်ခြေ)',
    ],
    expectedOutcomeEn:
      'Clear assessment of affiliate saturation and whether the product is dominated by one mega-creator or open to new affiliates.',
    expectedOutcomeMy:
      'ပြိုင်ဆိုင်မှု ပြင်းထန်မှုအခြေအနေနှင့် ကိုယ်တိုင်ဝင်ရောက်ယှဉ်ပြိုင်နိုင်ခြေ ရှိမရှိကို ရှင်းလင်းစွာ သိရှိနိုင်မည်ဖြစ်သည်။',
    requiredDataSourcesEn:
      'Existing creator count + Kalodata Product Detail API (0.1 cr only if missing). Creator Rank / Top Creators Breakdown API is currently Unavailable / Not Verified.',
    requiredDataSourcesMy:
      'ရှိပြီးသား Creator အရေအတွက် + လိုအပ်မှသာ Product Detail API (0.1 cr)။ Creator Rank / Top Creators API သည် လက်ရှိတွင် Unavailable / Not Verified ဖြစ်သည်။',
    estimatedCostNoteEn:
      'Low credit impact — reuses existing/cached Creator Count (0 cr) or shares 1 Product Detail call (0.1 cr) if missing.',
    estimatedCostNoteMy:
      'Credit ကုန်ကျစရိတ်နည်းသည် — ရှိပြီးသား/Cache ထဲရှိ Creator အရေအတွက်ကို ပြန်သုံးပြီး (0 cr) မရှိသေးမှသာ Product Detail (0.1 cr) ခေါ်ပါမည်။',
    costSensitivity: 'moderate',
    missingDataBehaviorEn:
      'If top creator breakdown is unavailable, only verified aggregate creator counts (if present) are displayed and missing creator lists are marked Unavailable.',
    missingDataBehaviorMy:
      'ထိပ်တန်း Creator စာရင်း မရရှိနိုင်ပါက အတည်ပြုပြီး စုစုပေါင်း Creator အရေအတွက်ကိုသာပြပြီး ကျန်အပိုင်းကို Unavailable ဟု ဖော်ပြပါမည်။',
  },
  {
    id: 'video-intelligence',
    order: 5,
    nameEn: 'Video Intelligence',
    nameMy: 'Video Intelligence (Affiliate ဗီဒီယိုများ စစ်ဆေးမှု)',
    shortDescriptionEn: 'Inspect linked affiliate videos, top performers, views, engagement, patterns, and Myanmar videos.',
    shortDescriptionMy: 'Product နှင့် ချိတ်ထားသော Affiliate Video များ၊ Views၊ Engagement၊ Content Pattern နှင့် မြန်မာ Video များ စစ်ဆေးရန်။',
    whatItDoesEn:
      'Examines real affiliate videos linked to this product to uncover which hooks, angles, engagement styles, and Myanmar-language videos drive actual sales.',
    whatItDoesMy:
      'ဤ Product နှင့် ချိတ်ဆက်ထားသော Affiliate Video များကို စစ်ဆေးပြီး မည်သည့် Video ပုံစံ၊ Hook နှင့် မြန်မာဘာသာ Video များက ရောင်းအားကောင်းစေသည်ကို ဖော်ထုတ်ပေးပါသည်။',
    whatItChecksEn: [
      'Affiliate Videos Linked to Product',
      'Top Performing Videos',
      'Video Views',
      'Engagement',
      'Video Sales Performance',
      'Video Content Patterns',
      'Myanmar-Language Related Videos',
    ],
    whatItChecksMy: [
      'Product နှင့် ချိတ်ထားသည့် Affiliate Videos',
      'Top Performing Videos (ရောင်းအား/ကြည့်ရှုမှုအကောင်းဆုံး ဗီဒီယိုများ)',
      'Video Views (ကြည့်ရှုမှုအရေအတွက်)',
      'Engagement (တုံ့ပြန်ပါဝင်မှု)',
      'Video Sales Performance (ဗီဒီယိုမှ ရောင်းအားစွမ်းဆောင်ရည်)',
      'Video Content Patterns (ဗီဒီယိုဖန်တီးမှုပုံစံများ)',
      'မြန်မာဘာသာနှင့် သက်ဆိုင်သည့် Video များ',
    ],
    expectedOutcomeEn:
      'Actionable understanding of what video styles actually convert buyers for this product, including Myanmar creator examples when present.',
    expectedOutcomeMy:
      'ဘယ်လို Video ပုံစံတွေက ဒီ Product ကို ရောင်းအားကောင်းစေသလဲဆိုတာ တိကျစွာ နားလည်နိုင်မည်ဖြစ်သည်။',
    requiredDataSourcesEn:
      'Existing matched Myanmar video signals + Kalodata Product Video Channel metrics (0.1 cr Product Detail only if missing). Product-scoped Video List API is Unavailable / Not Verified.',
    requiredDataSourcesMy:
      'ရှိပြီးသား မြန်မာ Video Signal များ + Kalodata Product Video Channel Data (လိုအပ်မှသာ 0.1 cr)။ Product-scoped Video List API သည် Unavailable / Not Verified ဖြစ်သည်။',
    estimatedCostNoteEn:
      'Low credit impact — reuses existing video metrics & matched videos (0 cr); never wastes credits on unverified broad video scans.',
    estimatedCostNoteMy:
      'Credit ကုန်ကျစရိတ်နည်းသည် — ရှိပြီးသား Video Data နှင့် ချိတ်ဆက် Video များကို ပြန်သုံးပြီး (0 cr) မလိုအပ်ဘဲ broad video scan မခေါ်ပါ။',
    costSensitivity: 'moderate',
    missingDataBehaviorEn:
      'If no linked affiliate videos or no Myanmar-language videos are found, the module reports 0 matched videos honestly without fabricating sample links or metrics.',
    missingDataBehaviorMy:
      'ချိတ်ဆက်ထားသော Affiliate Video သို့မဟုတ် မြန်မာဘာသာ Video မတွေ့ရှိပါက အတုအယောင်မဖြည့်ဘဲ မတွေ့ရှိကြောင်း ရိုးသားစွာ ဖော်ပြပါမည်။',
  },
  {
    id: 'customer-review-intelligence',
    order: 6,
    nameEn: 'Customer Review Intelligence',
    nameMy: 'Customer Review Intelligence (ဝယ်သူ Review များ)',
    shortDescriptionEn: 'Analyze buyer reviews, likes/dislikes, complaint patterns, and Myanmar review presence (optional API).',
    shortDescriptionMy: 'ဝယ်သူ Review များ၊ အကောင်း/အဆိုး တုံ့ပြန်ချက်များနှင့် မြန်မာဘာသာ Review ရှိ/မရှိ စစ်ဆေးရန် (ရွေးချယ်မှသာ API ခေါ်မည်)။',
    whatItDoesEn:
      'Inspects real customer feedback to highlight what buyers praise, what causes returns or complaints, and whether Myanmar-language customer reviews exist.',
    whatItDoesMy:
      'တကယ့်ဝယ်သူများ၏ Review များကို စစ်ဆေးပြီး ဝယ်သူကြိုက်နှစ်သက်သည့်အချက်၊ မကြိုက်သည့်အချက်နှင့် မြန်မာဘာသာ Review ရှိမရှိကို ဖော်ထုတ်ပေးပါသည်။',
    whatItChecksEn: [
      'Customer Reviews',
      'Positive / Negative Feedback',
      'What Customers Like',
      'What Customers Dislike / Complaints',
      'Myanmar-Language Review Presence',
    ],
    whatItChecksMy: [
      'Customer Reviews (ဝယ်သူ Review များ)',
      'Positive / Negative Feedback (အကောင်း / အဆိုး တုံ့ပြန်ချက်များ)',
      'Customer ကြိုက်နှစ်သက်သည့်အချက်များ',
      'Customer မကြိုက်သည့်အချက်များ',
      'မြန်မာဘာသာ Review ရှိ၊ မရှိ',
    ],
    expectedOutcomeEn:
      'Honest view of real buyer satisfaction and objections so your affiliate videos address real questions and avoid high-return products.',
    expectedOutcomeMy:
      'Customer များ၏ အမြင်အမှန်နှင့် Product အပေါ် တုံ့ပြန်မှုကို နားလည်ပြီး ပြန်ပို့နှုန်းများနိုင်သည့် Product များကို ရှောင်ရှားနိုင်မည်ဖြစ်သည်။',
    requiredDataSourcesEn:
      'Kalodata Product Comment Insight API (1.0 cr) — strictly opt-in and only invoked when explicitly selected and not already cached.',
    requiredDataSourcesMy:
      'Kalodata Product Comment Insight API (1.0 cr) — အသုံးပြုသူက ဤ Option ကို ကိုယ်တိုင်ရွေးချယ်ပြီး Cache မရှိသေးမှသာ ခေါ်ယူမည်ဖြစ်သည်။',
    estimatedCostNoteEn:
      'High credit sensitivity (Opt-In Only) — Comment Insight API costs 1.0 cr per uncached product (0 cr if already cached). This option will NEVER run automatically.',
    estimatedCostNoteMy:
      'ကုန်ကျစရိတ်မြင့်နိုင်သည် (ကိုယ်တိုင်ရွေးမှသာ ခေါ်မည်) — Comment Insight API သည် Cache မရှိသေးပါက 1.0 cr ကုန်ကျမည်ဖြစ်၍ ဤ Option ကို ရွေးချယ်မှသာ ခေါ်မည်ဖြစ်သည်။',
    costSensitivity: 'high',
    missingDataBehaviorEn:
      'If reviews are unavailable or restricted by the upstream API, the module clearly reports “Reviews Unavailable” instead of summarizing nonexistent comments.',
    missingDataBehaviorMy:
      'Review Data မရရှိနိုင်ပါက မရှိသော Comment များကို မဖန်တီးဘဲ “Review Data မရရှိနိုင်ပါ (Unavailable)” ဟု ရှင်းလင်းစွာ ဖော်ပြပါမည်။',
  },
  {
    id: 'market-competitor-comparison',
    order: 7,
    nameEn: 'Market & Competitor Comparison',
    nameMy: 'Market & Competitor Comparison (ပြိုင်ဘက်နှိုင်းယှဉ်မှု)',
    shortDescriptionEn: 'Compare similar products on price, sales, commission, and overall market positioning.',
    shortDescriptionMy: 'အလားတူ Product များနှင့် ဈေးနှုန်း၊ ရောင်းအား၊ ကော်မရှင်နှင့် အခွင့်အလမ်းများကို နှိုင်းယှဉ်စစ်ဆေးရန်။',
    whatItDoesEn:
      'Benchmarks your selected product against peer and competing Thailand TikTok Shop products to identify whether this listing or a rival offers the stronger affiliate opportunity.',
    whatItDoesMy:
      'ရွေးချယ်ထားသော Product ကို ထိုင်း TikTok Shop ရှိ အလားတူပြိုင်ဘက် Product များနှင့် နှိုင်းယှဉ်ပြီး ဘယ် Product က ပိုကောင်းသည့် Affiliate အခွင့်အလမ်းရှိသလဲ စစ်ဆေးပေးပါသည်။',
    whatItChecksEn: [
      'Similar / Peer Products',
      'Price Comparison',
      'Sales Comparison',
      'Commission Comparison',
      'Competitor Performance',
      'Which Product Offers Better Opportunity',
    ],
    whatItChecksMy: [
      'အလားတူ Product များ',
      'ဈေးနှုန်းနှိုင်းယှဉ်မှု',
      'Sales (ရောင်းအား) နှိုင်းယှဉ်မှု',
      'Commission (ကော်မရှင်) နှိုင်းယှဉ်မှု',
      'Competitor Performance (ပြိုင်ဘက်စွမ်းဆောင်ရည်)',
      'ဘယ် Product က ပိုကောင်းတဲ့ အခွင့်အရေးရှိသလဲ',
    ],
    expectedOutcomeEn:
      'Side-by-side market positioning showing whether your product is competitively priced and rewarded versus category peers.',
    expectedOutcomeMy:
      'ရွေးချယ်ထားသော Product ၏ ပြိုင်ဘက်များနှင့် ဈေးကွက်အနေအထားကို ရှင်းလင်းစွာ နှိုင်းယှဉ်နားလည်နိုင်မည်ဖြစ်သည်။',
    requiredDataSourcesEn:
      'Same-category peer products already present in the current Research Results session (100% local comparison).',
    requiredDataSourcesMy:
      'လက်ရှိ Research Results Session ရှိ Category တူ Product များ (100% Local နှိုင်းယှဉ်မှု)။',
    estimatedCostNoteEn:
      'Zero credit impact (0 cr) — compares strictly against already-fetched same-category peer products in your current session with zero extra API calls.',
    estimatedCostNoteMy:
      'Credit ကုန်ကျစရိတ် 0 cr — လက်ရှိ Session ထဲရှိ ရှာဖွေပြီးသား Category တူ Product များဖြင့်သာ API ထပ်မခေါ်ဘဲ နှိုင်းယှဉ်ပေးပါသည်။',
    costSensitivity: 'low',
    missingDataBehaviorEn:
      'If no comparable same-category peer products exist in the current session, the module honestly reports Unavailable without calling extra paid APIs.',
    missingDataBehaviorMy:
      'လက်ရှိ Session တွင် နှိုင်းယှဉ်ရန် Category တူ Product မရှိပါက Credit ထပ်မသုံးဘဲ Unavailable ဟု ရိုးသားစွာ ဖော်ပြပါမည်။',
  },
  {
    id: 'ai-strategic-recommendation',
    order: 8,
    nameEn: 'AI Strategic Recommendation (Go / No-Go)',
    nameMy: 'AI Strategic Recommendation (လုပ်သင့်/မလုပ်သင့် ဗျူဟာဆုံးဖြတ်ချက်)',
    shortDescriptionEn:
      'Pure business decision: synthesize verified data into Go/No-Go verdict, strengths, risks, target buyer psychology, and channel strategy.',
    shortDescriptionMy:
      'လုပ်သင့်/မလုပ်သင့် စီးပွားရေးဆုံးဖြတ်ချက် သီးသန့် — Data များပေါင်းစပ်ပြီး Verdict၊ အားသာချက်/အန္တရာယ်၊ ပစ်မှတ်ဝယ်သူနှင့် ဈေးကွက်ဗျူဟာ သုံးသပ်ရန်။',
    whatItDoesEn:
      'Synthesizes verified product metrics and completed Deep Dive data (#01–#07) strictly into a business Go/No-Go decision, target buyer profile, risk audit, and promotion channel strategy. (For video scripts, titles, hashtags, and competitor video teardowns, use Module #09.)',
    whatItDoesMy:
      'ရရှိထားသော တကယ့် Product Data နှင့် Deep Dive (#01–#07) ရလဒ်များကို ပေါင်းစပ်ပြီး ဤ Product ကို ကြော်ငြာသင့်/မသင့် စီးပွားရေးဆုံးဖြတ်ချက်၊ ပစ်မှတ်ဝယ်သူ၊ အန္တရာယ်နှင့် ဈေးကွက်ဗျူဟာကို သီးသန့်သုံးသပ်ပေးပါသည်။ (Video Script၊ Title နှင့် Hashtag များအတွက် Module #09 ကို အသုံးပြုပါ။)',
    whatItChecksEn: [
      'Product Opportunity Score Context',
      'Data-Backed Strengths & Weaknesses',
      'Competition, Margin & Compliance Risks',
      'Target Buyer Profile & Buying Psychology',
      'Affiliate Channel & Go-to-Market Strategy',
      'Go / No-Go Verdict & Next Action',
    ],
    whatItChecksMy: [
      'Product Opportunity Score သုံးသပ်ချက်',
      'Data အခြေခံ အားသာချက် / အားနည်းချက်',
      'ပြိုင်ဆိုင်မှု၊ အမြတ်နှင့် Compliance အန္တရာယ်များ',
      'ပစ်မှတ်ဝယ်သူအုပ်စုနှင့် ဝယ်ယူမှုစိတ်ပညာ',
      'Affiliate Channel နှင့် ဈေးကွက်ဝင်ရောက်ဗျူဟာ',
      'လုပ်သင့် / မလုပ်သင့် ဆုံးဖြတ်ချက် (Go / No-Go)',
    ],
    expectedOutcomeEn:
      'A crisp, unbiased business Go/No-Go recommendation grounded strictly in verified metrics—without diluting into generic video ideas.',
    expectedOutcomeMy:
      'ဤ Product ကို အချိန်နှင့်ငွေ ရင်းနှီးပြီး ကြော်ငြာသင့်/မသင့် တိကျရှင်းလင်းသော စီးပွားရေးဆုံးဖြတ်ချက် ရရှိမည်ဖြစ်သည်။',
    requiredDataSourcesEn:
      'Verified product metrics + results from completed Deep Dive modules (#01–#07) + server-side Gemini AI synthesis endpoint.',
    requiredDataSourcesMy:
      'အတည်ပြုပြီး Product Data + ပြီးစီးထားသော Deep Dive (#01–#07) ရလဒ်များ + Server-side Gemini AI Endpoint။',
    estimatedCostNoteEn:
      '0 Kalodata credits (reuses already-fetched data), PLUS 1 server-side Gemini AI API call (billed separately by Google Gemini API — NOT free). Output is clearly labeled as AI Interpretation.',
    estimatedCostNoteMy:
      'Kalodata Credit 0 cr (ရှိပြီးသား Data ကိုသာ အသုံးပြုသည်) ဖြစ်သော်လည်း Server-side Gemini AI API Call ၁ ကြိမ်အတွက် Google Gemini API ကုန်ကျစရိတ် သီးခြားရှိပါမည် (အခမဲ့ မဟုတ်ပါ)။ ရလဒ်ကို AI Interpretation ဟု ရှင်းလင်းစွာ ခွဲခြားဖော်ပြပါမည်။',
    costSensitivity: 'low',
    missingDataBehaviorEn:
      'AI strictly NEVER fabricates missing metrics. Whenever inputs (e.g., reviews, videos, or creator shares) are incomplete, AI explicitly explains those data limitations and lowers confidence accordingly.',
    missingDataBehaviorMy:
      'AI သည် မရှိသော Data ကို လုံးဝ ဖန်တီးမပြပါ။ အချက်အလက်မပြည့်စုံပါက ထိုအပေါ်အခြေခံ၍ ကန့်သတ်ချက်များကို ပွင့်လင်းရှင်းလင်းစွာ ရှင်းပြပေးပါမည်။',
  },
  {
    id: 'ad-video-creative-blueprint',
    order: 9,
    nameEn: 'AI Ad Video Creative Studio',
    nameMy: 'AI Ad Video Creative Studio (ကြော်ငြာ Video ဖန်တီးမှုနှင့် SEO)',
    shortDescriptionEn:
      'Ad video production blueprint: study winning competitor videos, generate 3 concepts, 5 hooks, timed shooting script, SEO titles/keywords/hashtags & policy guard.',
    shortDescriptionMy:
      'ကြော်ငြာ Video ဖန်တီးရန် သီးသန့် — အခြားသူများ၏ ရောင်းကောင်း Video လေ့လာချက်၊ Concept ၃ မျိုး၊ 3-Sec Hook ၅ ခု၊ အချိန်အတိအကျ Script၊ Title/Keyword/Hashtag နှင့် Policy သတိပေးချက်များ။',
    whatItDoesEn:
      'Turns your chosen product (and optional real top-selling Thailand TikTok Shop competitor videos) into a ready-to-shoot ad video production pack: competitor teardown, 3 winning concepts, 5 scroll-stopping 3-second hooks, scene-by-scene shooting script, TikTok SEO titles/keywords/hashtags, and ad compliance guard.',
    whatItDoesMy:
      'ရွေးချယ်ထားသော Product နှင့် (ရွေးချယ်ပါက) ထိုင်း TikTok Shop ရှိ ရောင်းအားအကောင်းဆုံး ပြိုင်ဘက် Video များကို လေ့လာပြီး ချက်ချင်းရိုက်ကူးတင်နိုင်မည့် Concept ၃ မျိုး၊ 3-Sec Hook ၅ ခု၊ Scene အလိုက် Script၊ Title/Keywords/Hashtags နှင့် Policy စည်းကမ်းသတိပေးချက်များ ထုတ်ပေးပါသည်။',
    whatItChecksEn: [
      'Optional Competitor Top-Selling Video Scan (+0.1 cr, 24h cached)',
      'Winning Competitor Patterns & Creative Differentiation Gap',
      '3 Distinct Ad Video Concepts / Formats',
      '5 Scroll-Stopping 3-Second Hooks (Spoken + Visual Action)',
      'Scene-by-Scene Timed Script + On-Screen Text + Camera/AI Prompts',
      'TikTok SEO Pack (3 Title Styles, Search Keywords, Curated Hashtags)',
      'TikTok Shop Category Compliance & Banned-Claim Guard',
    ],
    whatItChecksMy: [
      'ရောင်းအားအကောင်းဆုံး ပြိုင်ဘက် Video များ စစ်ဆေးလေ့လာမှု (ရွေးချယ်မှ +0.1 cr · 24h Cache)',
      'အခြားသူများ အောင်မြင်နေသည့် Pattern နှင့် ကိုယ်ဖောက်ထွက်နိုင်မည့် Creative Gap',
      'ကြော်ငြာ Video Concept / ပုံစံ ၃ မျိုး',
      'ပထမ ၃ စက္ကန့်အတွင်း ဆွဲဆောင်မည့် 3-Second Hook ၅ ခု (စကား + ရိုက်ကွက်)',
      'စက္ကန့်အလိုက် Scene-by-Scene Script + စာတန်းထိုး + ရိုက်ကွက်/AI Prompt',
      'TikTok SEO Pack (Title ၃ ပုံစံ၊ Search Keywords၊ ခွဲခြားထားသော Hashtags)',
      'TikTok Shop ကြော်ငြာစည်းကမ်းနှင့် ရှောင်ရမည့်စကားလုံး သတိပေးချက်',
    ],
    expectedOutcomeEn:
      'A complete, copy-ready ad video production & TikTok SEO blueprint tailored to your chosen language (Thai+Burmese or Burmese), shooting style (UGC / Hands-Only / AI Video), and video length.',
    expectedOutcomeMy:
      'ကိုယ်ရွေးထားသော ဘာသာစကား (ထိုင်း+မြန်မာ သို့မဟုတ် မြန်မာ)၊ ရိုက်ကူးပုံစံ (UGC / Hands-Only / AI Video) နှင့် အချိန်အတိုင်း ချက်ချင်းကူးယူရိုက်တင်နိုင်မည့် ကြော်ငြာ Video Blueprint အပြည့်အစုံ ရရှိမည်ဖြစ်သည်။',
    requiredDataSourcesEn:
      'Product details & thumbnail + completed Deep Dive buyer/review insights + server-side Gemini AI + optional Kalodata Video Rank API (0.1 cr only when Competitor Video Scan toggle is ON and uncached).',
    requiredDataSourcesMy:
      'Product အချက်အလက်နှင့် ပုံ + Deep Dive ဝယ်သူ/Review အချက်အလက်များ + Server-side Gemini AI + (Toggle ဖွင့်မှသာ) Kalodata Video Rank API (0.1 cr · 24h Cache)။',
    estimatedCostNoteEn:
      'Default: 0 Kalodata credits + 1 server-side Gemini AI call (separate Gemini billing). Optional Competitor Video Scan toggle adds +0.1 Kalodata credit (24h cached -> 0 cr on repeat).',
    estimatedCostNoteMy:
      'မူလ: Kalodata 0 cr + Server-side Gemini AI Call ၁ ကြိမ် (Gemini စရိတ် သီးခြားရှိ)။ ပြိုင်ဘက် Video များပါ စစ်ဆေးလိုပါက Toggle ဖွင့်မှ +0.1 Kalodata cr (24h Cache) ကုန်ကျပါမည်။',
    costSensitivity: 'low',
    missingDataBehaviorEn:
      'When Competitor Video Scan is OFF (or if Kalodata returns 0 matching videos), Gemini NEVER fabricates fake TikTok video links or views—it explicitly states no competitor videos were scanned and builds the creative blueprint strictly from verified product & review data.',
    missingDataBehaviorMy:
      'ပြိုင်ဘက် Video စစ်ဆေးမှု Toggle ပိတ်ထားလျှင် (သို့မဟုတ် ကိုက်ညီသော Video မတွေ့လျှင်) AI သည် TikTok Video Link နှင့် Views အတုများ လုံးဝ မဖန်တီးဘဲ ရှိပြီးသား Product/Review Data များဖြင့်သာ Script နှင့် SEO ဖန်တီးပေးပါမည်။',
  },
];

export const ALL_DEEP_DIVE_ANALYSIS_IDS: readonly DeepDiveAnalysisId[] =
  DEEP_DIVE_ANALYSIS_OPTIONS.map((option) => option.id);

export function getDeepDiveOptionById(
  id: DeepDiveAnalysisId
): DeepDiveAnalysisDefinition | undefined {
  return DEEP_DIVE_ANALYSIS_OPTIONS.find((option) => option.id === id);
}

export function createInitialDeepDiveSlots(): Record<
  DeepDiveAnalysisId,
  DeepDiveAnalysisSlotState
> {
  const slots = {} as Record<DeepDiveAnalysisId, DeepDiveAnalysisSlotState>;
  for (const option of DEEP_DIVE_ANALYSIS_OPTIONS) {
    slots[option.id] = {
      analysisId: option.id,
      status: 'idle',
      updatedAt: null,
      result: null,
      error: null,
      statusNoteEn: 'Ready — Run this module individually or with your selection.',
      statusNoteMy: 'အဆင်သင့် — ဤ Analysis ကို တစ်ခုချင်း သို့မဟုတ် ရွေးချယ်ပြီး Run နိုင်ပါသည်။',
    };
  }
  return slots;
}

/**
 * Initial per-product Deep Dive workspace state:
 * - Zero options pre-selected (strict manual opt-in)
 * - All 9 Progressive Disclosure panels collapsed by default
 * - 9 strictly isolated per-analysis execution slots
 */
export function createInitialDeepDiveWorkspaceState(): DeepDiveWorkspaceState {
  return {
    selectedIds: [],
    expandedIds: [],
    slots: createInitialDeepDiveSlots(),
    lastAttemptedRunIds: [],
    lastAttemptedRunAt: null,
    totalCreditsUsedInSession: 0,
    videoCreativeOptions: { ...DEFAULT_DEEP_DIVE_VIDEO_CREATIVE_OPTIONS },
  };
}

export function toggleDeepDiveSelection(
  state: DeepDiveWorkspaceState,
  id: DeepDiveAnalysisId
): DeepDiveWorkspaceState {
  const exists = state.selectedIds.includes(id);
  const nextSelected = exists
    ? state.selectedIds.filter((item) => item !== id)
    : ALL_DEEP_DIVE_ANALYSIS_IDS.filter((optId) => optId === id || state.selectedIds.includes(optId));

  return {
    ...state,
    selectedIds: nextSelected,
  };
}

export function selectAllDeepDiveOptions(
  state: DeepDiveWorkspaceState
): DeepDiveWorkspaceState {
  return {
    ...state,
    selectedIds: [...ALL_DEEP_DIVE_ANALYSIS_IDS],
  };
}

export function clearAllDeepDiveOptions(
  state: DeepDiveWorkspaceState
): DeepDiveWorkspaceState {
  return {
    ...state,
    selectedIds: [],
  };
}

/**
 * Expands or collapses a single option independently without EVER mutating selectedIds.
 */
export function toggleDeepDiveExpansion(
  state: DeepDiveWorkspaceState,
  id: DeepDiveAnalysisId
): DeepDiveWorkspaceState {
  const isExpanded = state.expandedIds.includes(id);
  const nextExpanded = isExpanded
    ? state.expandedIds.filter((item) => item !== id)
    : [...state.expandedIds, id];

  return {
    ...state,
    expandedIds: nextExpanded,
  };
}

export function canRunDeepDiveSelection(state: DeepDiveWorkspaceState): boolean {
  return state.selectedIds.length > 0;
}

/**
 * Phase 9.1 Execution Foundation handler:
 * - Refuses to run when nothing is selected
 * - Makes ZERO network / API calls
 * - Never fabricates fake analysis results
 * - Records an honest 'not-implemented' status timestamp strictly on the selected isolated slots
 */
export function recordNotImplementedRunAttempt(
  state: DeepDiveWorkspaceState,
  timestampIso: string = new Date().toISOString()
): DeepDiveWorkspaceState {
  if (!canRunDeepDiveSelection(state)) {
    return state;
  }

  const nextSlots: Record<DeepDiveAnalysisId, DeepDiveAnalysisSlotState> = {
    ...state.slots,
  };

  for (const id of state.selectedIds) {
    nextSlots[id] = {
      analysisId: id,
      status: 'not-implemented',
      updatedAt: timestampIso,
      result: null,
      statusNoteEn:
        'Not Implemented Yet — Selected and queued cleanly for Phase 9.2. No API call or credit was used.',
      statusNoteMy:
        'မလုပ်ဆောင်ရသေးပါ (Not Implemented Yet) — Phase 9.2 Analysis Engine အတွက် အဆင်သင့်ပြင်ဆင်ထားပါသည်။ API Call နှင့် Credit လုံးဝ မသုံးစွဲထားပါ။',
    };
  }

  return {
    ...state,
    slots: nextSlots,
    lastAttemptedRunIds: [...state.selectedIds],
    lastAttemptedRunAt: timestampIso,
  };
}

/**
 * Builds an immutable Deep Dive source context from any Fast / Balanced / Deep Research product.
 * Never mutates the original product object, research results list, or 7-Factor ranking.
 */
export function buildDeepDiveTargetContext(
  product: ResearchProduct,
  originView: DeepDiveOriginView,
  fallbackResearchMode: ResearchMode = 'fast',
  researchDate: string | null = null
): DeepDiveSourceContext {
  const originResearchMode: ResearchMode =
    product.researchMode ?? product.kalodataMetrics?.researchMode ?? fallbackResearchMode;

  return {
    product,
    originalProductId: product.id,
    canonicalProductId: getCanonicalProductId(product),
    originResearchMode,
    originView,
    researchDate: researchDate ?? product.researchedAt ?? null,
  };
}
