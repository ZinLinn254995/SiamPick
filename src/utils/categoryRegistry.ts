import type {
  AiAdCreativeFormat,
  CategoryApiSupportStatus,
  CategoryVerificationStatus,
  KalodataSubcategoryOption,
  Language,
  ProductCategory,
  ResearchProduct,
  ScoreFactorKey,
  SyncedKalodataCategoryCache,
} from '../types/product.ts';

/**
 * Phase 8 — Universal Product Category Registry for Thailand TikTok Shop.
 *
 * Design principles:
 * 1. Extensible single source of truth — adding a new category requires only adding one entry here.
 * 2. Strict API honesty — ONLY live-verified or official-docs-verified Kalodata/TikTok Shop TH IDs
 *    are stored statically. Unverified categories stay 'requires-sync' (disabled for live hunting)
 *    until the user explicitly runs the 0.1-credit Kalodata TH Category Rank L1 sync.
 *    If live Kalodata TH sync returns no matching category, it is honestly marked 'unsupported'.
 * 3. Category-aware 7-Factor 100-Point Scoring & Gemini AI Analysis profiles.
 */

export interface CategoryScoringProfile {
  /**
   * Relative integer delta nudges from the 7-factor balanced baseline [20, 20, 15, 15, 10, 10, 10].
   * INVARIANT: All deltas MUST sum to exactly 0 so total score ALWAYS stays out of 100 points.
   */
  weightDeltas: Record<ScoreFactorKey, number>;
  /**
   * Optional sweet-spot unit price band (THB) used for category context notes (not fabricated).
   */
  typicalPriceBandThb: [number, number];
  /**
   * Keywords that signal strong short-form / AI creative visual suitability in this category.
   */
  strongCreativeKeywords: readonly string[];
  /**
   * Keywords that signal sensitive, low-visual, or policy-constrained SKUs in this category.
   */
  weakCreativeKeywords: readonly string[];
  formatLabelEn: string;
  formatLabelMy: string;
  strongFitReasonEn: string;
  strongFitReasonMy: string;
  weakFitReasonEn: string;
  weakFitReasonMy: string;
}

export interface CategoryAiStrategyProfile {
  adFormat: AiAdCreativeFormat;
  contentPotentialDirectiveEn: string;
  targetAudienceDefaultEn: string;
  targetAudienceDefaultMy: string;
  sellingPointsFocusEn: string;
  riskChecklistEn: readonly string[];
  riskChecklistMy: readonly string[];
  affiliateStrategyFocusEn: string;
  affiliateStrategyFocusMy: string;
  creativeAnglesEn: readonly [string, string];
  creativeAnglesMy: readonly [string, string];
  cautionsEn: readonly [string, string];
  cautionsMy: readonly [string, string];
}

export interface UniversalCategoryDefinition {
  id: ProductCategory;
  labelEn: string;
  labelMy: string;
  shortLabelEn: string;
  shortLabelMy: string;
  /**
   * Static Thailand TikTok Shop / Kalodata L1 category_id ONLY when verified via live API or official docs.
   * null = NOT guessed; must be resolved via user-initiated Kalodata TH Category Rank L1 sync.
   */
  defaultKalodataId: string | null;
  defaultSupportStatus: 'verified' | 'docs-verified' | 'requires-sync';
  defaultKalodataName: string | null;
  /**
   * Case-insensitive patterns used to match live Kalodata TH Category Rank L1 & L2 category_name values.
   */
  kalodataNamePatterns: readonly RegExp[];
  /**
   * Strong title keywords used ONLY for sanity-checking obvious category mismatches.
   */
  mismatchSignatureKeywords: readonly string[];
  scoringProfile: CategoryScoringProfile;
  aiProfile: CategoryAiStrategyProfile;
}

export interface EffectiveCategoryEntry extends UniversalCategoryDefinition {
  kalodataId: string | null;
  kalodataName: string | null;
  apiSupportStatus: CategoryApiSupportStatus;
  selectable: boolean;
  subcategories: KalodataSubcategoryOption[];
}

const ZERO_DELTAS: Record<ScoreFactorKey, number> = {
  salesPerformance: 0,
  revenuePerformance: 0,
  revenueGrowth: 0,
  commissionPotential: 0,
  competition: 0,
  marketDemand: 0,
  aiContentSuitability: 0,
};

export const UNIVERSAL_CATEGORIES: readonly UniversalCategoryDefinition[] = [
  {
    id: 'womens-fashion',
    labelEn: 'Fashion & Apparel',
    labelMy: 'ဖက်ရှင်နှင့် အဝတ်အထည်',
    shortLabelEn: 'Fashion',
    shortLabelMy: 'ဖက်ရှင်',
    defaultKalodataId: '601152',
    defaultSupportStatus: 'verified',
    defaultKalodataName: 'Womenswear & Underwear',
    kalodataNamePatterns: [
      /womenswear/i,
      /women.*fashion/i,
      /fashion/i,
      /apparel/i,
      /menswear/i,
      /clothing/i,
      /shoes|footwear|bags/i,
    ],
    mismatchSignatureKeywords: [
      'dress', 'blouse', 'skirt', 'cardigan', 'jeans', 'trouser', 'pants', 'jacket', 'blazer',
      'hoodie', 'sweater', 't-shirt', 'shirt', 'jumpsuit', 'set', 'outfit', 'เดรส', 'เสื้อ', 'กางเกง', 'กระโปรง',
    ],
    scoringProfile: {
      weightDeltas: { ...ZERO_DELTAS }, // Preserve exact Phase 2–7 balanced baseline [20,20,15,15,10,10,10]
      typicalPriceBandThb: [150, 790],
      strongCreativeKeywords: [
        'dress', 'blouse', 'shirt', 'top', 'skirt', 'pants', 'trouser', 'jeans', 'jacket',
        'cardigan', 'blazer', 'coat', 'jumpsuit', 'romper', 'set', 'coord', 'knit', 'sweater',
        'hoodie', 'polo', 'bag', 'tote', 'handbag', 'crossbody', 'heels', 'sandals', 'sneakers',
        'เดรส', 'เสื้อ', 'กางเกง', 'กระโปรง', 'ชุดเซต', 'กระเป๋า', 'รองเท้า',
      ],
      weakCreativeKeywords: [
        'underwear', 'lingerie', 'bra', 'panty', 'panties', 'brief', 'thong', 'shapewear',
        'corset', 'bikini', 'swimwear', 'nipple', 'pasties', 'sock', 'insole', 'lace tape',
        'กางเกงใน', 'ชุดชั้นใน', 'บรา', 'บิกินี่', 'ถุงเท้า',
      ],
      formatLabelEn: 'AI Virtual Female Model Ad',
      formatLabelMy: 'AI Virtual Female Model Content',
      strongFitReasonEn: 'clear wearable garment/bag silhouette fits AI virtual female model showcase',
      strongFitReasonMy: 'ဝတ်ဆင်ပုံထင်ရှားသော Fashion ပစ္စည်းဖြစ်၍ AI Virtual Female Model ပြသရန် သင့်တော်သည်',
      weakFitReasonEn: 'intimate/accessory or low-silhouette item poses policy/visual risk for AI virtual model try-on',
      weakFitReasonMy: 'အတွင်းခံ/အသေးစားပစ္စည်းဖြစ်၍ AI Virtual Female Model Content အတွက် ကန့်သတ်ချက်ရှိသည်',
    },
    aiProfile: {
      adFormat: 'ai-virtual-female-model',
      contentPotentialDirectiveEn:
        'Fashion & Apparel: evaluate suitability for AI Virtual Female Model lookbook/try-on short videos (silhouette clarity, drape, color fidelity, TikTok modesty compliance).',
      targetAudienceDefaultEn:
        'Thai female TikTok Shop shoppers seeking wearable daily, office, or trend-driven apparel (AI Market Inference).',
      targetAudienceDefaultMy:
        'နေ့စဉ်နှင့် ရုံးဝတ် ဖက်ရှင်ရှာဖွေသော ထိုင်းအမျိုးသမီး TikTok Shop ဝယ်ယူသူများ (AI Market Inference)။',
      sellingPointsFocusEn: 'silhouette drape, styling versatility, Thai climate fabric comfort, value-for-price',
      riskChecklistEn: [
        'Verify sizing chart accuracy (Thai/Asian vs free-size) to prevent size-related returns.',
        'Check fabric thickness, sheer risk, and real-light color consistency before scaling ads.',
      ],
      riskChecklistMy: [
        'Size မကိုက်၍ Return များနိုင်ခြေကို လျှော့ချရန် Size Chart တိကျမှုကို စစ်ဆေးပါ။',
        'အထည်သားအထူအပါးနှင့် အရောင်ကွာဟမှုကို Content မတင်မီ အတည်ပြုပါ။',
      ],
      affiliateStrategyFocusEn:
        'Lead with 3-outfit styling hooks or body-fit demos using a clean AI virtual model; pin size & height references in captions to reduce returns.',
      affiliateStrategyFocusMy:
        'AI Virtual Model ဖြင့် ဝတ်ဆင်ပုံ 3 မျိုးပြသသည့် ဗီဒီယိုတိုများဖြင့် စတင်ပြီး Return လျှော့ချရန် Size/အရပ် အညွှန်းကို Caption တွင် ထည့်ပါ။',
      creativeAnglesEn: [
        'AI virtual model 360-degree drape & daily Thai outfit styling showcase.',
        'Office-to-weekend outfit transition highlighting neckline, cut, and colorways.',
      ],
      creativeAnglesMy: [
        'AI Virtual Model ဖြင့် နေ့စဉ်ဝတ်ဆင်ပုံနှင့် အထည်ကျပုံ 360° ပြသမှု။',
        'ရုံးတက်နှင့် အပြင်ထွက် 2 မျိုးလုံးဝတ်နိုင်ပုံ ဖက်ရှင်ပြောင်းလဲပြသမှု။',
      ],
      cautionsEn: [
        'Keep AI model framing consistent with actual garment length, color, and fabric sheen.',
        'Avoid over-promising slimming or custom-tailored fit beyond verified seller measurements.',
      ],
      cautionsMy: [
        'AI Model ပုံစံသည် အထည်အစစ်၏ အရှည်၊ အရောင်နှင့် အသားအနေအထားနှင့် ကိုက်ညီအောင် ထိန်းပါ။',
        'Size တိုင်းတာမှုထက် ကျော်လွန်သော ချဲ့ကားပြောဆိုမှုများကို ရှောင်ပါ။',
      ],
    },
  },
  {
    id: 'cosmetics-beauty',
    labelEn: 'Cosmetics & Beauty',
    labelMy: 'အလှကုန်နှင့် အသားအရေထိန်းသိမ်းမှု',
    shortLabelEn: 'Beauty',
    shortLabelMy: 'အလှကုန်',
    defaultKalodataId: '601450',
    defaultSupportStatus: 'verified',
    defaultKalodataName: 'Beauty & Personal Care',
    kalodataNamePatterns: [
      /beauty\s*&?\s*personal\s*care/i,
      /cosmetics?/i,
      /skincare/i,
      /makeup/i,
      /beauty/i,
    ],
    mismatchSignatureKeywords: [
      'serum', 'sunscreen', 'spf', 'cleanser', 'toner', 'moisturizer', 'lipstick', 'lip gloss',
      'cushion', 'foundation', 'mascara', 'blush', 'perfume', 'shampoo', 'mask', 'เซรั่ม', 'กันแดด', 'ลิป', 'คุชชั่น',
    ],
    scoringProfile: {
      weightDeltas: { ...ZERO_DELTAS }, // Preserve exact Phase 2–7 balanced baseline [20,20,15,15,10,10,10]
      typicalPriceBandThb: [120, 690],
      strongCreativeKeywords: [
        'serum', 'cream', 'sunscreen', 'spf', 'toner', 'essence', 'ampoule', 'lotion', 'gel',
        'cleanser', 'foam', 'mask', 'balm', 'oil', 'lipstick', 'lip', 'tint', 'gloss',
        'cushion', 'foundation', 'powder', 'blush', 'palette', 'mascara', 'eyeliner', 'perfume',
        'mist', 'shampoo', 'conditioner', 'scrub', 'body', 'เซรั่ม', 'ครีม', 'กันแดด', 'ลิป',
        'คุชชั่น', 'แป้ง', 'มาสคาร่า', 'คลีนซิ่ง', 'น้ำหอม',
      ],
      weakCreativeKeywords: [
        'sachet', 'refill', 'pouch', 'cotton pad', 'cotton bud', 'swab', 'tissue', 'wipe',
        'razor', 'blade', 'tweezer', 'sponge', 'puff', 'voucher', 'clinic', 'mystery', 'random',
        'sample', 'ซอง', 'รีฟิล', 'สำลี', 'ทิชชู่', 'มีดโกน',
      ],
      formatLabelEn: 'Product-Only 3D Commercial',
      formatLabelMy: 'Product-only 3D Commercial Content',
      strongFitReasonEn: 'clear hero beauty packaging/texture fits product-only 3D commercial renders',
      strongFitReasonMy: 'Packaging နှင့် Texture ထင်ရှားသော Beauty ပစ္စည်းဖြစ်၍ Product-only 3D Commercial ဖန်တီးရန် သင့်တော်သည်',
      weakFitReasonEn: 'pouch/consumable/utility format limits hero-packaging 3D commercial impact',
      weakFitReasonMy: 'အထုပ်သေး/Refill/အသုံးအဆောင်ပုံစံဖြစ်၍ Product-only 3D Commercial အတွက် ဆွဲဆောင်မှုနည်းနိုင်သည်',
    },
    aiProfile: {
      adFormat: 'product-only-3d-commercial',
      contentPotentialDirectiveEn:
        'Cosmetics & Beauty: evaluate suitability for Product-Only 3D Commercial short videos (packaging hero shot, texture macro liquid/cream dynamics, ingredient callouts, Thai FDA-safe copy).',
      targetAudienceDefaultEn:
        'Thai beauty and skincare shoppers looking for tropical-weather formulas and daily makeup essentials (AI Market Inference).',
      targetAudienceDefaultMy:
        'ထိုင်းရာသီဥတုနှင့် ကိုက်ညီသော Skincare နှင့် နေ့စဉ်အလှကုန် ရှာဖွေသော TikTok Shop ဝယ်ယူသူများ (AI Market Inference)။',
      sellingPointsFocusEn: 'packaging aesthetic, formula texture, Thai humidity suitability, repeat-purchase replenishment',
      riskChecklistEn: [
        'Confirm Thai FDA (อย. / Ay.) notification number and official seller/brand authorization.',
        'Avoid unverified medical, whitening, or instant-cure claims that trigger TikTok Shop ad rejection.',
      ],
      riskChecklistMy: [
        'ထိုင်း FDA (อย.) မှတ်ပုံတင်နံပါတ်နှင့် တရားဝင် Brand ခွင့်ပြုချက်ကို စစ်ဆေးပါ။',
        'TikTok Shop Policy နှင့် ငြိစွန်းနိုင်သော ဆေးဘက်ဆိုင်ရာ/ချက်ချင်းဖြူစေသည်ဟူသော စကားလုံးများကို ရှောင်ပါ။',
      ],
      affiliateStrategyFocusEn:
        'Use clean 3D texture macro visuals and clear ingredient/usage routines; pair with bundle or repeat-buy hooks while keeping claims strictly compliant.',
      affiliateStrategyFocusMy:
        '3D Texture အနီးကပ်ပြသမှုနှင့် ပါဝင်ပစ္စည်းအသုံးပြုပုံကို ရှင်းလင်းစွာတင်ဆက်ပြီး Policy လိုက်နာသော စာသားများဖြင့် Repeat-buy ကို ဦးတည်ပါ။',
      creativeAnglesEn: [
        'Product-only 3D macro liquid/cream texture pour with clean key-ingredient callouts.',
        'Studio 3D packaging rotation paired with Thai-humidity routine benefit captions.',
      ],
      creativeAnglesMy: [
        'Product-only 3D ဖြင့် Cream/Serum Texture အနီးကပ်ပြသမှုနှင့် အဓိကပါဝင်ပစ္စည်း မိတ်ဆက်မှု။',
        'Studio 3D Packaging လှည့်ပြသမှုနှင့် ထိုင်းရာသီဥတုအတွက် အသုံးပြုပုံ ရှင်းလင်းချက်။',
      ],
      cautionsEn: [
        'Never use exaggerated before/after skin transformation claims or unverified medical cures.',
        'Verify Thai FDA (อย.) registration and genuine brand packaging before scaling ad spend.',
      ],
      cautionsMy: [
        'အလွန်အကျွံ Before/After ပြောင်းလဲမှုများနှင့် ဆေးဘက်ဆိုင်ရာ ကုသမှုအာမခံချက်များ မသုံးပါနှင့်။',
        'Content မတင်မီ ထိုင်း FDA (อย.) မှတ်ပုံတင်နှင့် Brand အစစ်အမှန်ကို စစ်ဆေးပါ။',
      ],
    },
  },
  {
    id: 'electronics',
    labelEn: 'Electronics & Gadgets',
    labelMy: 'အီလက်ထရွန်းနစ်နှင့် ဂက်ဂျက်များ',
    shortLabelEn: 'Electronics',
    shortLabelMy: 'အီလက်ထရွန်းနစ်',
    defaultKalodataId: null,
    defaultSupportStatus: 'requires-sync',
    defaultKalodataName: null,
    kalodataNamePatterns: [
      /phones?\s*&?\s*electronics/i,
      /electronics/i,
      /computers?\s*&?\s*office/i,
      /mobile|gadget|audio|camera/i,
    ],
    mismatchSignatureKeywords: [
      'earbud', 'headphone', 'powerbank', 'power bank', 'charger', 'cable', 'usb', 'bluetooth',
      'speaker', 'smartwatch', 'smart watch', 'keyboard', 'mouse', 'camera', 'tripod', 'fan',
      'หูฟัง', 'พาวเวอร์แบงค์', 'สายชาร์จ', 'ลำโพง', 'สมาร์ทวอทช์',
    ],
    scoringProfile: {
      // Electronics emphasizes demand, price/sales momentum & competition over aesthetic AI model style (sum = 0)
      weightDeltas: {
        salesPerformance: 2,
        revenuePerformance: 1,
        revenueGrowth: 0,
        commissionPotential: -1,
        competition: 1,
        marketDemand: 1,
        aiContentSuitability: -4,
      },
      typicalPriceBandThb: [190, 2900],
      strongCreativeKeywords: [
        'earbud', 'earphone', 'headphone', 'speaker', 'powerbank', 'power bank', 'charger',
        'magsafe', 'smartwatch', 'watch', 'keyboard', 'mouse', 'microphone', 'mic', 'tripod',
        'gimbal', 'projector', 'camera', 'mini fan', 'cooler', 'hub', 'lamp', 'led', 'vacuum',
        'หูฟัง', 'พาวเวอร์แบงค์', 'ลำโพง', 'พัดลม', 'ไมโครโฟน', 'คีย์บอร์ด', 'เมาส์',
      ],
      weakCreativeKeywords: [
        'adapter', 'fuse', 'resistor', 'motherboard', 'replacement part', 'spare part', 'screen film',
        'tempered glass', 'sim tray', 'battery cell', 'อะไหล่', 'ฟิล์มกันรอย',
      ],
      formatLabelEn: 'Tech Feature & Spec Demo',
      formatLabelMy: 'Tech Feature နှင့် လုပ်ဆောင်ချက် Demo',
      strongFitReasonEn: 'tangible tech features and specs demonstrate clearly in fast split-screen/3D feature clips',
      strongFitReasonMy: 'လုပ်ဆောင်ချက်နှင့် Spec ထင်ရှားသော Gadget ဖြစ်၍ Feature Demo ဗီဒီယိုဖန်တီးရန် သင့်တော်သည်',
      weakFitReasonEn: 'commodity spare part or generic cable has low visual differentiation on TikTok feeds',
      weakFitReasonMy: 'အပိုပစ္စည်း/သာမန်ကြိုးအမျိုးအစားဖြစ်၍ TikTok Feed တွင် ဆွဲဆောင်မှုနည်းနိုင်သည်',
    },
    aiProfile: {
      adFormat: 'tech-feature-demo',
      contentPotentialDirectiveEn:
        'Electronics & Gadgets: evaluate suitability for Tech Feature Demo short videos (unboxing, speed/battery/sound proof, spec callouts, problem-solving desk/mobile setups).',
      targetAudienceDefaultEn:
        'Thai mobile-first shoppers, students, gamers, and office workers seeking high-value practical tech gadgets (AI Market Inference).',
      targetAudienceDefaultMy:
        'လက်တွေ့အသုံးဝင်ပြီး တန်ဖိုးသင့်သော Gadget ရှာဖွေသော ထိုင်းကျောင်းသား၊ ရုံးဝန်ထမ်းနှင့် ဂိမ်းကစားသူများ (AI Market Inference)။',
      sellingPointsFocusEn: 'measurable specs (mAh, wattage, noise cancellation), compatibility, warranty support, price-to-spec value',
      riskChecklistEn: [
        'Check Thai TISI (มอก.) safety certification for chargers, power banks, and mains-powered electronics.',
        'Verify warranty terms and defect/DOA return rate — electronics carry higher technical return sensitivity.',
      ],
      riskChecklistMy: [
        'Charger၊ Power Bank နှင့် လျှပ်စစ်ပစ္စည်းများအတွက် ထိုင်း TISI (มอก.) စံချိန်စံညွှန်းလက်မှတ်ကို စစ်ဆေးပါ။',
        'အာမခံ (Warranty) နှင့် စက်ချို့ယွင်းမှု Return Rate ကို ကြိုတင်စစ်ဆေးပါ။',
      ],
      affiliateStrategyFocusEn:
        'Hook viewers within 3 seconds with a live stress test or real-world problem fix; highlight verified specs, compatibility, and local Thailand warranty.',
      affiliateStrategyFocusMy:
        'ပထမ 3 စက္ကန့်အတွင်း လက်တွေ့စမ်းသပ်ပြသမှုဖြင့် ဆွဲဆောင်ပြီး Spec တိကျမှုနှင့် ထိုင်းပြည်တွင်း Warranty ကို အသားပေးပါ။',
      creativeAnglesEn: [
        '3-second problem-to-spec live test showing speed, output, or convenience in action.',
        'Side-by-side comparison vs standard accessory highlighting compact build and key specs.',
      ],
      creativeAnglesMy: [
        '3 စက္ကန့်အတွင်း အမြန်နှုန်း/စွမ်းဆောင်ရည် လက်တွေ့စမ်းသပ်ပြသမှု။',
        'သာမန်ပစ္စည်းနှင့် ယှဉ်ပြပြီး ဒီဇိုင်းကျစ်လျစ်မှုနှင့် Spec အားသာချက် မိတ်ဆက်မှု။',
      ],
      cautionsEn: [
        'Never exaggerate battery capacity, charging wattage, or waterproof ratings beyond verified seller specs.',
        'Confirm Thailand TISI (มอก.) compliance and authentic brand warranty before promoting.',
      ],
      cautionsMy: [
        'ဘက်ထရီပမာဏ၊ အားသွင်းနှုန်းနှင့် ရေစိုခံနိုင်မှု Spec များကို အစစ်ထက် ချဲ့ကားမပြောပါနှင့်။',
        'ထိုင်း TISI (มอก.) လက်မှတ်နှင့် Warranty အခြေအနေကို ကြိုတင်အတည်ပြုပါ။',
      ],
    },
  },
  {
    id: 'home-living',
    labelEn: 'Home & Living',
    labelMy: 'အိမ်သုံးနှင့် နေထိုင်မှုပစ္စည်းများ',
    shortLabelEn: 'Home',
    shortLabelMy: 'အိမ်သုံး',
    defaultKalodataId: '600001',
    defaultSupportStatus: 'docs-verified',
    defaultKalodataName: 'Home Supplies',
    kalodataNamePatterns: [
      /home\s*supplies/i,
      /home\s*&?\s*living/i,
      /home\s*improvement/i,
      /furniture/i,
      /household/i,
      /textiles?\s*&?\s*soft\s*furnishings/i,
    ],
    mismatchSignatureKeywords: [
      'organizer', 'storage box', 'shelf', 'rack', 'mop', 'broom', 'bedsheet', 'pillow',
      'curtain', 'lamp', 'hanger', 'towel', 'detergent', 'diffuser', 'ชั้นวาง', 'กล่องเก็บของ', 'ผ้าปูที่นอน', 'ไม้ถูพื้น',
    ],
    scoringProfile: {
      // Home & Living emphasizes practical demand & sales stability (sum = 0)
      weightDeltas: {
        salesPerformance: 1,
        revenuePerformance: 0,
        revenueGrowth: 0,
        commissionPotential: 0,
        competition: 1,
        marketDemand: 1,
        aiContentSuitability: -3,
      },
      typicalPriceBandThb: [99, 1290],
      strongCreativeKeywords: [
        'organizer', 'storage', 'rack', 'shelf', 'mop', 'cleaning', 'vacuum', 'lint',
        'lamp', 'light', 'diffuser', 'humidifier', 'pillow', 'bedsheet', 'blanket', 'curtain',
        'hanger', 'basket', 'hook', 'mat', 'rug', 'ชั้นวาง', 'กล่องเก็บของ', 'ไม้ถูพื้น', 'โคมไฟ', 'ผ้าปู',
      ],
      weakCreativeKeywords: [
        'screw', 'nail', 'washer', 'gasket', 'pipe fitting', 'cement', 'sandpaper', 'spare',
        'น็อต', 'ตะปู', 'อะไหล่',
      ],
      formatLabelEn: 'Problem-Solution Home Demo',
      formatLabelMy: 'အိမ်သုံး Problem-Solution Demo',
      strongFitReasonEn: 'clear before/after organization or cleaning transformation drives high TikTok retention',
      strongFitReasonMy: 'မသုံးမီနှင့် သုံးပြီး ကွာခြားချက်ထင်ရှားသော အိမ်သုံးပစ္စည်းဖြစ်၍ Demo ဗီဒီယိုအတွက် သင့်တော်သည်',
      weakFitReasonEn: 'small hardware/spare utility item lacks strong visual hook for short-form video',
      weakFitReasonMy: 'အသေးစား Hardware ပစ္စည်းဖြစ်၍ ဗီဒီယိုတိုတွင် ဆွဲဆောင်မှုအားနည်းနိုင်သည်',
    },
    aiProfile: {
      adFormat: 'home-problem-solution-demo',
      contentPotentialDirectiveEn:
        'Home & Living: evaluate suitability for Problem-Solution Demo videos (clutter-to-organized transformation, effortless cleaning demo, condo/bedroom space-saving utility).',
      targetAudienceDefaultEn:
        'Thai condo residents, families, and home-organization enthusiasts seeking practical space-saving upgrades (AI Market Inference).',
      targetAudienceDefaultMy:
        'ကွန်ဒိုနှင့် အိမ်ခန်းသပ်ရပ်လှပစေမည့် လက်တွေ့အိမ်သုံးပစ္စည်း ရှာဖွေသော ထိုင်းဝယ်ယူသူများ (AI Market Inference)။',
      sellingPointsFocusEn: 'space-saving design, ease of installation/cleaning, durability, Thai condo aesthetics',
      riskChecklistEn: [
        'Check shipping weight/dimensions — bulky home items can carry high shipping fees or transit damage risk.',
        'Verify material thickness/load capacity so product matches buyer expectations.',
      ],
      riskChecklistMy: [
        'ပစ္စည်းအရွယ်အစား/အလေးချိန်ကြီးပါက ပို့ဆောင်ခမြင့်ခြင်းနှင့် ထိခိုက်ပျက်စီးနိုင်ခြေကို စစ်ဆေးပါ။',
        'ပစ္စည်းအသားအထူအပါးနှင့် အလေးချိန်ခံနိုင်ရည် တိကျမှုကို စစ်ဆေးပါ။',
      ],
      affiliateStrategyFocusEn:
        'Open with a relatable Thai condo/home clutter or cleaning pain point and show a fast 10-second transformation; emphasize easy setup and bundle value.',
      affiliateStrategyFocusMy:
        'အိမ်ခန်းရှုပ်ပွမှု သို့မဟုတ် သန့်ရှင်းရေးအခက်အခဲဖြင့် စတင်ပြီး 10 စက္ကန့်အတွင်း ပြောင်းလဲပုံကို လက်တွေ့ပြသပါ။',
      creativeAnglesEn: [
        'Before/after Thai condo organization makeover showing instant space gain.',
        'ASMR-style cleaning or setup sequence demonstrating effortless daily use.',
      ],
      creativeAnglesMy: [
        'ကွန်ဒို/အိမ်ခန်း မစီမီနှင့် စီပြီး သပ်ရပ်သွားပုံ ချက်ချင်းပြောင်းလဲမှုပြသခြင်း။',
        'တပ်ဆင်ရလွယ်ကူပြီး နေ့စဉ်သုံးရအဆင်ပြေပုံ ASMR ပုံစံ Demo ဗီဒီယို။',
      ],
      cautionsEn: [
        'Verify real dimensions and weight-bearing limits before quoting specs in video captions.',
        'Watch for fragile packaging complaints in buyer reviews.',
      ],
      cautionsMy: [
        'အရွယ်အစားနှင့် အလေးချိန်ခံနိုင်ရည်ကို ဗီဒီယိုတွင် မပြောမီ အတည်ပြုပါ။',
        'ပို့ဆောင်စဉ် ကျိုးပဲ့ပျက်စီးမှု Complaint ရှိမရှိ Review တွင် စစ်ဆေးပါ။',
      ],
    },
  },
  {
    id: 'kitchen',
    labelEn: 'Kitchen & Appliances',
    labelMy: 'မီးဖိုချောင်နှင့် အိမ်သုံးလျှပ်စစ်ပစ္စည်းများ',
    shortLabelEn: 'Kitchen',
    shortLabelMy: 'မီးဖိုချောင်',
    defaultKalodataId: null,
    defaultSupportStatus: 'requires-sync',
    defaultKalodataName: null,
    kalodataNamePatterns: [
      /kitchenware/i,
      /kitchen/i,
      /household\s*appliances/i,
      /home\s*appliances/i,
      /tableware|cookware/i,
    ],
    mismatchSignatureKeywords: [
      'air fryer', 'blender', 'kettle', 'rice cooker', 'pan', 'pot', 'wok', 'knife',
      'tumbler', 'flask', 'lunch box', 'chopper', 'grinder', 'กระทะ', 'หม้อ', 'แก้วเก็บความเย็น', 'เครื่องปั่น',
    ],
    scoringProfile: {
      weightDeltas: {
        salesPerformance: 1,
        revenuePerformance: 1,
        revenueGrowth: 0,
        commissionPotential: 0,
        competition: 1,
        marketDemand: 0,
        aiContentSuitability: -3,
      },
      typicalPriceBandThb: [120, 1890],
      strongCreativeKeywords: [
        'air fryer', 'blender', 'juicer', 'mixer', 'kettle', 'cooker', 'pan', 'nonstick', 'pot',
        'tumbler', 'bottle', 'flask', 'chopper', 'slicer', 'knife', 'grinder', 'coffee', 'espresso',
        'lunch box', 'container', 'rack', 'กระทะ', 'หม้อ', 'แก้วเก็บความเย็น', 'เครื่องปั่น', 'หม้อทอด',
      ],
      weakCreativeKeywords: [
        'rubber ring', 'gasket', 'replacement blade', 'spare lid', 'scouring pad', 'อะไหล่', 'ยางรอง',
      ],
      formatLabelEn: 'Kitchen Demo & Time-Saver Clip',
      formatLabelMy: 'မီးဖိုချောင် လက်တွေ့ Demo ဗီဒီယို',
      strongFitReasonEn: 'visual cooking, blending, or ice-retention tests perform strongly on TikTok Shop Thailand',
      strongFitReasonMy: 'ချက်ပြုတ်/ဖျော်စပ်/အအေးခံ လက်တွေ့စမ်းသပ်ပြသမှုများသည် TikTok Shop တွင် ဆွဲဆောင်မှုအားကောင်းသည်',
      weakFitReasonEn: 'generic replacement part or low-ticket consumable has limited demonstration hook',
      weakFitReasonMy: 'အပိုပစ္စည်းအသေးဖြစ်၍ Demo ဗီဒီယိုဖြင့် ရောင်းချရန် အားနည်းနိုင်သည်',
    },
    aiProfile: {
      adFormat: 'home-problem-solution-demo',
      contentPotentialDirectiveEn:
        'Kitchen & Appliances: evaluate suitability for Kitchen Problem-Solution Demo videos (non-stick slide test, cold-retention tumbler test, 1-minute meal prep).',
      targetAudienceDefaultEn:
        'Thai home cooks, busy condo dwellers, and cafe-at-home shoppers seeking time-saving kitchenware (AI Market Inference).',
      targetAudienceDefaultMy:
        'အိမ်ချက်ဝါသနာရှင်များ၊ ကွန်ဒိုနေထိုင်သူများနှင့် အချိန်ကုန်သက်သာစေမည့် မီးဖိုချောင်ပစ္စည်းရှာဖွေသူများ (AI Market Inference)။',
      sellingPointsFocusEn: 'time-saving prep, non-stick/thermal performance, food-grade safety, easy cleanup',
      riskChecklistEn: [
        'Verify Thai TISI (มอก.) plug/safety certification and 220V compatibility for electric appliances.',
        'Check food-grade material claims (304 stainless steel, BPA-free) and non-stick durability reviews.',
      ],
      riskChecklistMy: [
        'လျှပ်စစ်မီးဖိုချောင်ပစ္စည်းများအတွက် 220V ကိုက်ညီမှုနှင့် ထိုင်း TISI (มอก.) စံချိန်စံညွှန်းကို စစ်ဆေးပါ။',
        'Food-grade ပစ္စည်းအရည်အသွေး (304 Stainless, BPA-free) နှင့် Review များကို စစ်ဆေးပါ။',
      ],
      affiliateStrategyFocusEn:
        'Film a satisfying real-time cooking, ice-retention, or easy-wash demo; focus on busy Thai weekday convenience and food-grade trust.',
      affiliateStrategyFocusMy:
        'ချက်ပြုတ်မှု/ရေခဲခံနိုင်မှု/ဆေးကြောရလွယ်ကူမှုကို လက်တွေ့ရိုက်ကူးပြသပြီး အလုပ်များသူများအတွက် အချိန်သက်သာပုံကို အသားပေးပါ။',
      creativeAnglesEn: [
        'Satisfying real-time food prep or non-stick/ice-retention proof test.',
        'Before/after cleanup speed showing why it saves daily kitchen time.',
      ],
      creativeAnglesMy: [
        'အစားအစာပြင်ဆင်မှု သို့မဟုတ် မကပ်/အအေးခံ လက်တွေ့စမ်းသပ်ပြသမှု။',
        'သုံးပြီးနောက် ဆေးကြောရလွယ်ကူမြန်ဆန်ပုံ လက်တွေ့ Demo။',
      ],
      cautionsEn: [
        'Confirm Thailand 220V plug compatibility and safety certification for electric appliances.',
        'Do not make unverified food-grade material claims not stated on the listing.',
      ],
      cautionsMy: [
        'လျှပ်စစ်ပစ္စည်းဖြစ်ပါက ထိုင်း 220V ပလပ်ကိုက်ညီမှုနှင့် လုံခြုံရေးလက်မှတ်ကို စစ်ဆေးပါ။',
        'Listing တွင် မပါဝင်သော Food-grade အာမခံချက်များကို မထည့်ပါနှင့်။',
      ],
    },
  },
  {
    id: 'health-personal-care',
    labelEn: 'Health & Personal Care',
    labelMy: 'ကျန်းမာရေးနှင့် တစ်ကိုယ်ရေစောင့်ရှောက်မှု',
    shortLabelEn: 'Health',
    shortLabelMy: 'ကျန်းမာရေး',
    defaultKalodataId: null,
    defaultSupportStatus: 'requires-sync',
    defaultKalodataName: null,
    kalodataNamePatterns: [
      /^health$/i,
      /health\s*&?\s*wellness/i,
      /health\s*&?\s*personal\s*care/i,
      /supplement|wellness|medical|nutrition/i,
    ],
    mismatchSignatureKeywords: [
      'vitamin', 'collagen', 'probiotic', 'supplement', 'protein', 'fiber', 'electrolyte',
      'massager', 'toothpaste', 'mouthwash', 'deodorant', 'วิตามิน', 'คอลลาเจน', 'โปรตีน', 'อาหารเสริม',
    ],
    scoringProfile: {
      // Health emphasizes repeat sales/revenue & compliance trust over visual AI rendering (sum = 0)
      weightDeltas: {
        salesPerformance: 2,
        revenuePerformance: 1,
        revenueGrowth: 1,
        commissionPotential: 0,
        competition: 0,
        marketDemand: 0,
        aiContentSuitability: -4,
      },
      typicalPriceBandThb: [150, 990],
      strongCreativeKeywords: [
        'collagen', 'vitamin', 'probiotic', 'fiber', 'protein', 'electrolyte', 'omega',
        'massager', 'toothbrush', 'flosser', 'mouthwash', 'deodorant', 'patch', 'balm', 'inhaler',
        'คอลลาเจน', 'วิตามิน', 'โปรตีน', 'ไฟเบอร์', 'ยาสีฟัน', 'เครื่องนวด',
      ],
      weakCreativeKeywords: [
        'prescription', 'medicine', 'drug', 'injection', 'syringe', 'blood test', 'clinic',
        'slim pill', 'diet pill', 'ยา', 'ยาลดน้ำหนัก',
      ],
      formatLabelEn: 'Compliant Wellness & Routine Demo',
      formatLabelMy: 'Policy လိုက်နာသော ကျန်းမာရေး Routine Demo',
      strongFitReasonEn: 'daily wellness routine or personal-care device fits clean educational/3D packaging clips',
      strongFitReasonMy: 'နေ့စဉ်ကျန်းမာရေး Routine သို့မဟုတ် Personal Care ပစ္စည်းဖြစ်၍ ရှင်းလင်းသော Demo ဖန်တီးနိုင်သည်',
      weakFitReasonEn: 'strict TikTok Health policy restricts medical/weight-loss claims and regulated drugs',
      weakFitReasonMy: 'TikTok Health Policy တင်းကျပ်သော ဆေးဝါး/အလေးချိန်ကျဆေးအမျိုးအစားဖြစ်၍ သတိပြုရမည်',
    },
    aiProfile: {
      adFormat: 'consumable-trust-demo',
      contentPotentialDirectiveEn:
        'Health & Personal Care: evaluate suitability for compliant Consumable Trust / Routine Demo videos (Thai FDA อย. transparency, daily habit framing, zero medical/cure claims).',
      targetAudienceDefaultEn:
        'Health-conscious Thai consumers building daily wellness, oral care, or recovery routines (AI Market Inference).',
      targetAudienceDefaultMy:
        'နေ့စဉ်ကျန်းမာရေးနှင့် တစ်ကိုယ်ရေစောင့်ရှောက်မှု ဂရုစိုက်သော ထိုင်းဝယ်ယူသူများ (AI Market Inference)။',
      sellingPointsFocusEn: 'Thai FDA transparency, repeat consumption value, convenient dosage/format, clean taste or ergonomics',
      riskChecklistEn: [
        'Strictly verify Thai FDA (อย.) approval number — health supplements face strict TikTok Shop Thailand moderation.',
        'Avoid disease cure, weight-loss miracle, or medical-effect claims that cause immediate video/account violations.',
      ],
      riskChecklistMy: [
        'ထိုင်း FDA (อย.) ခွင့်ပြုချက်နံပါတ်ကို မဖြစ်မနေစစ်ဆေးပါ — TikTok Shop တွင် Health Policy အလွန်တင်းကျပ်သည်။',
        'ရောဂါပျောက်ကင်းသည်/ကိုယ်အလေးချိန်ချက်ချင်းကျသည် စသည့် ဆေးဘက်ဆိုင်ရာ စကားလုံးများ လုံးဝရှောင်ပါ။',
      ],
      affiliateStrategyFocusEn:
        'Position strictly around daily lifestyle routines, taste/convenience, and official brand trust; highlight multi-pack value for repeat subscribers.',
      affiliateStrategyFocusMy:
        'နေ့စဉ် Lifestyle Routine၊ သောက်သုံးရလွယ်ကူမှုနှင့် တရားဝင် Brand ယုံကြည်စိတ်ချရမှုကိုသာ အသားပေးပြီး Multi-pack တန်ဖိုးဖြင့် ရောင်းချပါ။',
      creativeAnglesEn: [
        'Clean daily wellness routine showing format convenience, texture/mixability, and official label.',
        'Ingredient transparency breakdown focusing strictly on permitted nutrition facts.',
      ],
      creativeAnglesMy: [
        'နေ့စဉ်အသုံးပြုပုံ Routine နှင့် အရသာ/ဖျော်စပ်ရလွယ်ကူမှု ပြသခြင်း။',
        'ခွင့်ပြုထားသော အာဟာရပါဝင်ပစ္စည်းအချက်အလက် ရှင်းလင်းတင်ဆက်မှု။',
      ],
      cautionsEn: [
        'Zero medical, disease-treatment, or guaranteed body-transformation claims.',
        'Verify Thai FDA (อย.) registration and official storefront authenticity before promoting.',
      ],
      cautionsMy: [
        'ရောဂါကုသမှု သို့မဟုတ် ခန္ဓာကိုယ်ပြောင်းလဲမှု အာမခံချက်များ လုံးဝမသုံးပါနှင့်။',
        'ထိုင်း FDA (อย.) မှတ်ပုံတင်နှင့် တရားဝင်ဆိုင်ဖြစ်ကြောင်း ကြိုတင်စစ်ဆေးပါ။',
      ],
    },
  },
  {
    id: 'food-beverages',
    labelEn: 'Food & Beverages',
    labelMy: 'အစားအစာနှင့် အဖျော်ယမကာ',
    shortLabelEn: 'Food & Drink',
    shortLabelMy: 'အစားအစာ',
    defaultKalodataId: null,
    defaultSupportStatus: 'requires-sync',
    defaultKalodataName: null,
    kalodataNamePatterns: [
      /food\s*&?\s*beverages?/i,
      /snacks?/i,
      /grocery|beverages?|drinks?/i,
    ],
    mismatchSignatureKeywords: [
      'snack', 'coffee', 'tea', 'matcha', 'chocolate', 'noodle', 'sauce', 'chili', 'honey',
      'cookie', 'chips', 'drink', 'syrup', 'ขนม', 'กาแฟ', 'ชา', 'น้ำพริก', 'ซอส', 'บะหมี่',
    ],
    scoringProfile: {
      // Food & Beverages relies heavily on sales velocity & repeat demand (sum = 0)
      weightDeltas: {
        salesPerformance: 2,
        revenuePerformance: 0,
        revenueGrowth: 1,
        commissionPotential: 0,
        competition: -1,
        marketDemand: 1,
        aiContentSuitability: -3,
      },
      typicalPriceBandThb: [59, 390],
      strongCreativeKeywords: [
        'coffee', 'matcha', 'tea', 'cocoa', 'snack', 'chips', 'crispy', 'chili', 'sauce', 'noodle',
        'honey', 'granola', 'nut', 'cookie', 'candy', 'jelly', 'syrup', 'powder', 'mix',
        'กาแฟ', 'ชาเขียว', 'ขนม', 'น้ำพริก', 'ซอส', 'โกโก้', 'อบกรอบ',
      ],
      weakCreativeKeywords: [
        'fresh', 'frozen', 'raw meat', 'seafood', 'ice cream', 'perishable', 'สด', 'แช่แข็ง',
      ],
      formatLabelEn: 'Taste, Crunch & Pour Demo',
      formatLabelMy: 'အရသာနှင့် ဖျော်စပ်ပြသမှု Demo',
      strongFitReasonEn: 'appetizing pour/crunch/mixing visuals and low impulse price convert quickly on TikTok Thailand',
      strongFitReasonMy: 'ဖျော်စပ်ပုံ/ကြွပ်ရွမှုပြသချက်နှင့် ဝယ်ယူရလွယ်ကူသောဈေးနှုန်းကြောင့် TikTok တွင် ရောင်းအားမြန်နိုင်သည်',
      weakFitReasonEn: 'perishable/frozen food carries cold-chain shipping and shelf-life fulfillment risk',
      weakFitReasonMy: 'လတ်ဆတ်/အေးခဲအစားအစာဖြစ်၍ ပို့ဆောင်ချိန်အတွင်း ပျက်စီးနိုင်ခြေမြင့်သည်',
    },
    aiProfile: {
      adFormat: 'consumable-trust-demo',
      contentPotentialDirectiveEn:
        'Food & Beverages: evaluate suitability for appetizing Consumable Demo videos (ASMR crunch/pour shots, cafe-at-home prep, flavor variety, Thai FDA/Halal trust cues).',
      targetAudienceDefaultEn:
        'Thai snack lovers, home-cafe drinkers, and impulse pantry shoppers on TikTok Shop (AI Market Inference).',
      targetAudienceDefaultMy:
        'သရေစာကြိုက်နှစ်သက်သူများနှင့် အိမ်တွင်းကော်ဖီ/လက်ဖက်ရည်ဖျော်သောက်သူ ထိုင်းဝယ်ယူသူများ (AI Market Inference)။',
      sellingPointsFocusEn: 'flavor/texture appeal, low impulse price, multi-pack value, shelf stability & Thai FDA/Halal marks',
      riskChecklistEn: [
        'Verify shelf life, packaging seal quality, and heat-sensitivity during Thailand daytime courier transit.',
        'Check Thai FDA (อย.) and allergen/Halal labeling accuracy where applicable.',
      ],
      riskChecklistMy: [
        'သက်တမ်း (Shelf Life)၊ ထုပ်ပိုးမှုလုံခြုံမှုနှင့် ထိုင်းအပူချိန်အတွင်း ပို့ဆောင်ရာ၌ မပျက်စီးနိုင်မှုကို စစ်ဆေးပါ။',
        'ထိုင်း FDA (อย.) နှင့် ဓာတ်မတည့်ပစ္စည်း/Halal အညွှန်းတိကျမှုကို စစ်ဆေးပါ။',
      ],
      affiliateStrategyFocusEn:
        'Use sensory ASMR pour/crunch hooks in the first 2 seconds and bundle multi-flavor packs to raise average order value and affiliate earnings per click.',
      affiliateStrategyFocusMy:
        'ပထမ 2 စက္ကန့်အတွင်း ASMR ဖျော်စပ်/စားသုံးမှုဖြင့် ဆွဲဆောင်ပြီး Order တန်ဖိုးမြှင့်ရန် Multi-pack / Combo တွဲဖက်ရောင်းချပါ။',
      creativeAnglesEn: [
        'Sensory ASMR pour, mix, or crunch close-up with quick preparation steps.',
        'Cafe-at-home cost-per-cup or family snack-pack value breakdown.',
      ],
      creativeAnglesMy: [
        'အနီးကပ် ASMR ဖျော်စပ်မှု/ကြွပ်ရွမှုပြသခြင်းနှင့် အမြန်ပြင်ဆင်နည်း။',
        'အိမ်မှာဖျော်သောက်ပါက တစ်ခွက်ကုန်ကျစရိတ်သက်သာပုံ တန်ဖိုးတွက်ပြခြင်း။',
      ],
      cautionsEn: [
        'Avoid unverified health/slimming claims on food or coffee products.',
        'Check buyer reviews for stale stock, melted items, or broken seals during delivery.',
      ],
      cautionsMy: [
        'အစားအစာ/ကော်ဖီများတွင် ကျန်းမာရေး/အဆီကျအာမခံချက်များ မထည့်ပါနှင့်။',
        'ပို့ဆောင်စဉ် ပျက်စီးခြင်း/သက်တမ်းနီးခြင်း Complaint ရှိမရှိ Review တွင် စစ်ဆေးပါ။',
      ],
    },
  },
  {
    id: 'baby-kids',
    labelEn: 'Baby & Kids',
    labelMy: 'ကလေးနှင့် မိခင်သုံးပစ္စည်းများ',
    shortLabelEn: 'Baby & Kids',
    shortLabelMy: 'ကလေးသုံး',
    defaultKalodataId: null,
    defaultSupportStatus: 'requires-sync',
    defaultKalodataName: null,
    kalodataNamePatterns: [
      /baby\s*&?\s*maternity/i,
      /baby\s*&?\s*kids/i,
      /kids?['’]?\s*fashion/i,
      /maternity|infant|toddler/i,
    ],
    mismatchSignatureKeywords: [
      'diaper', 'stroller', 'baby bottle', 'pacifier', 'milk powder', 'baby wipe', 'crib',
      'kids', 'toddler', 'newborn', 'ผ้าอ้อม', 'ขวดนม', 'รถเข็นเด็ก', 'เด็กอ่อน',
    ],
    scoringProfile: {
      weightDeltas: {
        salesPerformance: 1,
        revenuePerformance: 1,
        revenueGrowth: 0,
        commissionPotential: 0,
        competition: 1,
        marketDemand: 0,
        aiContentSuitability: -3,
      },
      typicalPriceBandThb: [120, 1490],
      strongCreativeKeywords: [
        'diaper', 'wipe', 'bottle', 'sterilizer', 'stroller', 'carrier', 'bib', 'bowl', 'spoon',
        'sippy', 'blanket', 'lotion', 'wash', 'clothes', 'romper', 'learning', 'chair',
        'ผ้าอ้อม', 'ทิชชู่เปียก', 'ขวดนม', 'รถเข็น', 'เสื้อผ้าเด็ก',
      ],
      weakCreativeKeywords: [
        'formula', 'infant milk', 'medication', 'fever', 'นมผงทารก',
      ],
      formatLabelEn: 'Parent Trust & Practical Demo',
      formatLabelMy: 'မိဘယုံကြည်မှုနှင့် လက်တွေ့ Demo',
      strongFitReasonEn: 'practical parenting time-savers and gentle safety demos earn strong parent trust and repeat buys',
      strongFitReasonMy: 'မိဘများအတွက် အချိန်သက်သာပြီး ဘေးကင်းသော ကလေးသုံးပစ္စည်းဖြစ်၍ လက်တွေ့ Demo ဖြင့် ယုံကြည်မှုရနိုင်သည်',
      weakFitReasonEn: 'regulated infant formula/medical items carry strict platform ad restrictions',
      weakFitReasonMy: 'မွေးကင်းစနို့မှုန့်/ဆေးဝါးများသည် ပလက်ဖောင်းမူဝါဒတင်းကျပ်သော အမျိုးအစားဖြစ်သည်',
    },
    aiProfile: {
      adFormat: 'lifestyle-usage-demo',
      contentPotentialDirectiveEn:
        'Baby & Kids: evaluate suitability for Parent Trust & Practical Demo videos (safety materials, gentle texture, spill/absorption tests, zero child-exploitation policy risks).',
      targetAudienceDefaultEn:
        'Thai parents and expecting mothers prioritizing safety, gentle materials, and repeat-purchase value (AI Market Inference).',
      targetAudienceDefaultMy:
        'ဘေးကင်းလုံခြုံမှုနှင့် နူးညံ့သောပစ္စည်းအရည်အသွေးကို ဦးစားပေးသော ထိုင်းမိဘများ (AI Market Inference)။',
      sellingPointsFocusEn: 'child-safe materials (BPA-free/hypoallergenic), ease of use for parents, durability, bulk pack savings',
      riskChecklistEn: [
        'Strictly check safety certifications, age recommendations, and choking-hazard warnings.',
        'Ensure TikTok child-safety compliance — keep product demos focused on product features and parent handling.',
      ],
      riskChecklistMy: [
        'ကလေးအသက်အရွယ်သတ်မှတ်ချက်၊ ဘေးကင်းရေးလက်မှတ်နှင့် အန္တရာယ်သတိပေးချက်များကို သေချာစစ်ဆေးပါ။',
        'TikTok Child-safety Policy လိုက်နာရန် ပစ္စည်းအရည်အသွေးနှင့် မိဘအသုံးပြုပုံကိုသာ အဓိကရိုက်ကူးပါ။',
      ],
      affiliateStrategyFocusEn:
        'Lead with parent pain-point relief and transparent material safety tests (absorption, BPA-free, soft touch); promote multi-pack value for high-repeat essentials.',
      affiliateStrategyFocusMy:
        'မိဘများ၏ အခက်အခဲဖြေရှင်းပုံနှင့် ဘေးကင်းရေးစမ်းသပ်မှုကို ဦးစားပေးပြသပြီး ပြန်လည်ဝယ်ယူမှုများသော Multi-pack များကို အသားပေးပါ။',
      creativeAnglesEn: [
        'Hands-on parent test showing absorption, softness, or one-hand convenience.',
        'Material safety checklist highlighting gentle design and practical daily routine.',
      ],
      creativeAnglesMy: [
        'စုပ်ယူမှု/နူးညံ့မှု/လက်တစ်ဖက်တည်းဖြင့် သုံးရလွယ်ကူပုံ လက်တွေ့စမ်းသပ်မှု။',
        'ကလေးအတွက် ဘေးကင်းသော ပစ္စည်းအချက်အလက် ရှင်းလင်းမိတ်ဆက်မှု။',
      ],
      cautionsEn: [
        'Never make unverified pediatric or medical safety claims.',
        'Follow TikTok child-safety creative guidelines strictly.',
      ],
      cautionsMy: [
        'ဆရာဝန်အတည်ပြုချက်မရှိသော ကလေးကျန်းမာရေးအာမခံချက်များ မသုံးပါနှင့်။',
        'TikTok Child-safety Content စည်းကမ်းများကို တိကျစွာလိုက်နာပါ။',
      ],
    },
  },
  {
    id: 'sports-outdoor',
    labelEn: 'Sports & Outdoor',
    labelMy: 'အားကစားနှင့် ပြင်ပလှုပ်ရှားမှုပစ္စည်းများ',
    shortLabelEn: 'Sports',
    shortLabelMy: 'အားကစား',
    defaultKalodataId: null,
    defaultSupportStatus: 'requires-sync',
    defaultKalodataName: null,
    kalodataNamePatterns: [
      /sports?\s*&?\s*outdoor/i,
      /fitness|camping|outdoor/i,
    ],
    mismatchSignatureKeywords: [
      'dumbbell', 'yoga mat', 'resistance band', 'camping', 'tent', 'running shoe', 'jersey',
      'badminton', 'pickleball', 'bicycle', 'helm', 'เสื่อโยคะ', 'ดัมเบล', 'เต็นท์', 'แคมป์ปิ้ง',
    ],
    scoringProfile: {
      weightDeltas: {
        salesPerformance: 1,
        revenuePerformance: 0,
        revenueGrowth: 1,
        commissionPotential: 0,
        competition: 0,
        marketDemand: 0,
        aiContentSuitability: -2,
      },
      typicalPriceBandThb: [149, 1690],
      strongCreativeKeywords: [
        'yoga', 'mat', 'dumbbell', 'resistance', 'band', 'running', 'gym', 'fitness', 'camping',
        'tent', 'chair', 'lantern', 'bottle', 'badminton', 'pickleball', 'jersey', 'legging',
        'sock', 'glove', 'helmet', 'เสื่อโยคะ', 'ดัมเบล', 'แคมป์ปิ้ง', 'ฟิตเนส', 'ออกกำลังกาย',
      ],
      weakCreativeKeywords: [
        'barbell plate', 'heavy weight', 'treadmill', 'spare spoke', 'ลู่วิ่ง', 'อะไหล่จักรยาน',
      ],
      formatLabelEn: 'Active Lifestyle & Action Demo',
      formatLabelMy: 'အားကစားနှင့် လှုပ်ရှားမှု Demo',
      strongFitReasonEn: 'actionable home-workout or outdoor-gear demonstrations create strong visual hooks',
      strongFitReasonMy: 'အိမ်တွင်းလေ့ကျင့်ခန်းနှင့် ပြင်ပအသုံးပြုပုံ လက်တွေ့ပြသနိုင်၍ ဗီဒီယိုဆွဲဆောင်မှုကောင်းသည်',
      weakFitReasonEn: 'heavy bulky equipment faces high shipping cost and slower impulse conversion',
      weakFitReasonMy: 'အလေးချိန်ကြီးမားသော စက်ပစ္စည်းဖြစ်၍ ပို့ဆောင်ခမြင့်ပြီး ချက်ချင်းဝယ်ယူမှုနှေးနိုင်သည်',
    },
    aiProfile: {
      adFormat: 'lifestyle-usage-demo',
      contentPotentialDirectiveEn:
        'Sports & Outdoor: evaluate suitability for Active Lifestyle & Action Demo videos (portable workout setup, quick-fold camping gear, durability/grip proof).',
      targetAudienceDefaultEn:
        'Thai fitness beginners, runners, pickleball/badminton players, and weekend campers (AI Market Inference).',
      targetAudienceDefaultMy:
        'အားကစားလေ့ကျင့်သူများ၊ ပြေးသူများနှင့် Weekend Camping သွားတတ်သော ထိုင်းဝယ်ယူသူများ (AI Market Inference)။',
      sellingPointsFocusEn: 'portability, grip/durability, quick setup, breathable Thai-climate comfort',
      riskChecklistEn: [
        'Check weight/shipping surcharge on heavy fitness equipment and durability complaints under load.',
        'Avoid exaggerated body-transformation timelines in fitness gear ads.',
      ],
      riskChecklistMy: [
        'အလေးချိန်ကြီးသော အားကစားပစ္စည်းများတွင် ပို့ဆောင်ခနှင့် ခံနိုင်ရည် Complaint များကို စစ်ဆေးပါ။',
        'ခန္ဓာကိုယ်အလျင်အမြန်ပြောင်းလဲစေမည်ဟူသော ချဲ့ကားပြောဆိုမှုများကို ရှောင်ပါ။',
      ],
      affiliateStrategyFocusEn:
        'Demonstrate a 5-minute home workout or 10-second outdoor setup; highlight portability, grip stability, and weather resistance.',
      affiliateStrategyFocusMy:
        '5 မိနစ် အိမ်တွင်းလေ့ကျင့်ခန်း သို့မဟုတ် 10 စက္ကန့် Camping တပ်ဆင်ပုံကို လက်တွေ့ပြသပြီး သယ်ဆောင်ရလွယ်ကူမှုကို အသားပေးပါ။',
      creativeAnglesEn: [
        'Fast 10-second setup & real-use action clip at home or outdoors.',
        'Durability, grip, and portability test tailored for Thailand weather.',
      ],
      creativeAnglesMy: [
        'အိမ်တွင်း/ပြင်ပတွင် 10 စက္ကန့်အတွင်း အသုံးပြုပြသသည့် Action ဗီဒီယို။',
        'ခံနိုင်ရည်၊ ချော်ထွက်မှုကာကွယ်ခြင်းနှင့် သယ်ဆောင်ရလွယ်ကူမှု စမ်းသပ်ပြသခြင်း။',
      ],
      cautionsEn: [
        'Do not promise specific weight-loss or muscle-gain results.',
        'Verify load limits and sizing guidance before publishing.',
      ],
      cautionsMy: [
        'တိကျသော ကိုယ်အလေးချိန်ကျမှု/ကြွက်သားတက်မှု အာမခံချက်များ မထည့်ပါနှင့်။',
        'အလေးချိန်ခံနိုင်ရည်နှင့် Size အညွှန်းကို ကြိုတင်စစ်ဆေးပါ။',
      ],
    },
  },
  {
    id: 'automotive',
    labelEn: 'Automotive & Motorcycle',
    labelMy: 'ကားနှင့် မော်တော်ဆိုင်ကယ်ပစ္စည်းများ',
    shortLabelEn: 'Automotive',
    shortLabelMy: 'ကား/ဆိုင်ကယ်',
    defaultKalodataId: null,
    defaultSupportStatus: 'requires-sync',
    defaultKalodataName: null,
    kalodataNamePatterns: [
      /automotive/i,
      /motorcycle/i,
      /car\s*&?\s*motorbike/i,
      /vehicles?/i,
    ],
    mismatchSignatureKeywords: [
      'car', 'dashcam', 'dash cam', 'tire', 'wax', 'car wash', 'helmet', 'motorcycle',
      'windshield', 'phone mount', 'sunshade', 'รถยนต์', 'มอเตอร์ไซค์', 'กล้องติดรถยนต์', 'เคลือบสี',
    ],
    scoringProfile: {
      weightDeltas: {
        salesPerformance: 1,
        revenuePerformance: 1,
        revenueGrowth: 0,
        commissionPotential: 0,
        competition: 1,
        marketDemand: 0,
        aiContentSuitability: -3,
      },
      typicalPriceBandThb: [120, 1590],
      strongCreativeKeywords: [
        'dashcam', 'dash cam', 'phone holder', 'mount', 'sunshade', 'car wash', 'wax', 'coating',
        'spray', 'vacuum', 'inflator', 'pump', 'charger', 'air freshener', 'seat', 'organizer',
        'helmet', 'raincoat', 'glove', 'รถยนต์', 'มอเตอร์ไซค์', 'กล้องติดรถ', 'เคลือบสี', 'ที่วางโทรศัพท์',
      ],
      weakCreativeKeywords: [
        'brake pad', 'spark plug', 'engine oil filter', 'gasket', 'ecu', 'clutch', 'อะไหล่เครื่อง',
      ],
      formatLabelEn: 'Car/Bike Upgrade & Cleaning Demo',
      formatLabelMy: 'ကား/ဆိုင်ကယ် လက်တွေ့ Demo',
      strongFitReasonEn: 'visual car-care water-beading, sunshade cooling, or mount stability demos convert well in Thailand',
      strongFitReasonMy: 'ကားရေမတင်အောင်เคลือบခြင်း/နေကာ/ဖုန်းတင်ခုံ လက်တွေ့စမ်းသပ်ပြသမှုများသည် ထိုင်းဈေးကွက်တွင် ဆွဲဆောင်မှုကောင်းသည်',
      weakFitReasonEn: 'model-specific mechanical replacement parts have narrow compatibility and higher wrong-fit returns',
      weakFitReasonMy: 'ကား/ဆိုင်ကယ်မော်ဒယ်အလိုက် ကန့်သတ်ချက်ရှိသော စက်အပိုပစ္စည်းဖြစ်၍ မှားဝယ် Return များနိုင်သည်',
    },
    aiProfile: {
      adFormat: 'home-problem-solution-demo',
      contentPotentialDirectiveEn:
        'Automotive & Motorcycle: evaluate suitability for practical Car/Bike Problem-Solution Demo videos (sun-heat relief, coating water-beading proof, dashcam night clarity, universal mount stability).',
      targetAudienceDefaultEn:
        'Thai daily commuters, car owners, and motorcycle riders seeking practical care, safety, and comfort accessories (AI Market Inference).',
      targetAudienceDefaultMy:
        'နေ့စဉ်သွားလာနေသော ထိုင်းကားပိုင်ရှင်များနှင့် မော်တော်ဆိုင်ကယ်စီးနင်းသူများ (AI Market Inference)။',
      sellingPointsFocusEn: 'universal compatibility, Thai heat/rain protection, instant visual result, easy DIY install',
      riskChecklistEn: [
        'Verify universal vs vehicle-model-specific fitment to avoid wrong-model returns.',
        'Check safety compliance (e.g., helmet TISI / dashcam wiring safety) and realistic chemical claims.',
      ],
      riskChecklistMy: [
        'ကား/ဆိုင်ကယ်အားလုံးသုံးနိုင်မှု (Universal) သို့မဟုတ် မော်ဒယ်ကန့်သတ်ချက်ကို ရှင်းလင်းစွာစစ်ဆေးပါ။',
        'ဦးထုပ်/လျှပ်စစ်ပစ္စည်းများတွင် ဘေးကင်းရေးစံချိန်စံညွှန်းကို စစ်ဆေးပါ။',
      ],
      affiliateStrategyFocusEn:
        'Prioritize universal-fit accessories with obvious 5-second visual results (water-beading wax, sunshade heat drop, pothole mount test) tailored to Bangkok traffic & weather.',
      affiliateStrategyFocusMy:
        'ကား/ဆိုင်ကယ်အများစုနှင့် ကိုက်ညီသော ပစ္စည်းများကို ရွေးချယ်ပြီး 5 စက္ကန့်အတွင်း ရလဒ်ထင်ရှားသော Demo ဖြင့် ရောင်းချပါ။',
      creativeAnglesEn: [
        '5-second before/after water-beading, stain removal, or heat-shield test.',
        'Real Thai road/commute POV showing quick DIY installation and stability.',
      ],
      creativeAnglesMy: [
        '5 စက္ကန့်အတွင်း ရေမတင်ခြင်း/အစွန်းချွတ်ခြင်း/အပူကာကွယ်ခြင်း လက်တွေ့စမ်းသပ်မှု။',
        'ထိုင်းလမ်းမပေါ်တွင် လွယ်ကူစွာတပ်ဆင်အသုံးပြုပုံ POV ဗီဒီယို။',
      ],
      cautionsEn: [
        'Clearly state vehicle compatibility so buyers do not order incompatible parts.',
        'Never film unsafe driving behaviors while demonstrating car or bike gear.',
      ],
      cautionsMy: [
        'မော်ဒယ်ကိုက်ညီမှုကို ရှင်းလင်းစွာဖော်ပြပြီး မှားဝယ် Return ကို ကာကွယ်ပါ။',
        'ယာဉ်မောင်းနှင်နေစဉ် အန္တရာယ်ရှိသော ရိုက်ကူးမှုများကို ရှောင်ပါ။',
      ],
    },
  },
  {
    id: 'pet-supplies',
    labelEn: 'Pet Supplies',
    labelMy: 'အိမ်မွေးတိရစ္ဆာန်သုံးပစ္စည်းများ',
    shortLabelEn: 'Pets',
    shortLabelMy: 'အိမ်မွေးတိရစ္ဆာန်',
    defaultKalodataId: null,
    defaultSupportStatus: 'requires-sync',
    defaultKalodataName: null,
    kalodataNamePatterns: [
      /pet\s*supplies?/i,
      /\bpets?\b/i,
    ],
    mismatchSignatureKeywords: [
      'cat litter', 'dog food', 'cat food', 'pet', 'leash', 'collar', 'scratcher', 'grooming',
      'treat', 'flea', 'ทรายแมว', 'อาหารแมว', 'อาหารสุนัข', 'สัตว์เลี้ยง',
    ],
    scoringProfile: {
      weightDeltas: {
        salesPerformance: 2,
        revenuePerformance: 0,
        revenueGrowth: 1,
        commissionPotential: 0,
        competition: 0,
        marketDemand: 0,
        aiContentSuitability: -3,
      },
      typicalPriceBandThb: [89, 890],
      strongCreativeKeywords: [
        'cat', 'dog', 'pet', 'litter', 'treat', 'snack', 'food', 'brush', 'grooming', 'feeder',
        'fountain', 'bowl', 'toy', 'scratcher', 'bed', 'carrier', 'leash', 'shampoo', 'wipe',
        'แมว', 'สุนัข', 'หมา', 'ทรายแมว', 'ขนมแมว', 'อาหารสัตว์',
      ],
      weakCreativeKeywords: [
        'prescription', 'veterinary drug', 'antibiotic', 'injection', 'ยารักษาโรคสัตว์',
      ],
      formatLabelEn: 'Pet Reaction & Care Demo',
      formatLabelMy: 'အိမ်မွေးတိရစ္ဆာန် လက်တွေ့ Demo',
      strongFitReasonEn: 'pet reactions, odor/clumping tests, and hair-removal demos generate high organic engagement in Thailand',
      strongFitReasonMy: 'ကြောင်/ခွေးတုံ့ပြန်မှုနှင့် သန့်ရှင်းရေးစမ်းသပ်ချက်များသည် ထိုင်း TikTok တွင် Engagement အလွန်ကောင်းသည်',
      weakFitReasonEn: 'regulated veterinary medications carry strict compliance restrictions',
      weakFitReasonMy: 'တိရစ္ဆာန်ဆေးဝါးများသည် ပလက်ဖောင်းမူဝါဒတင်းကျပ်သော အမျိုးအစားဖြစ်သည်',
    },
    aiProfile: {
      adFormat: 'lifestyle-usage-demo',
      contentPotentialDirectiveEn:
        'Pet Supplies: evaluate suitability for Pet Reaction & Care Demo videos (clumping/odor proof for cat litter, grooming hair removal, water fountain appeal, pet-safe ingredients).',
      targetAudienceDefaultEn:
        'Thai cat and dog owners ("ทาสแมว / pet parents") who buy repeat consumables and care upgrades monthly (AI Market Inference).',
      targetAudienceDefaultMy:
        'လစဉ်ပြန်လည်ဝယ်ယူမှုများသော ထိုင်းကြောင်/ခွေးချစ်သူ အိမ်မွေးတိရစ္ဆာန်ပိုင်ရှင်များ (AI Market Inference)။',
      sellingPointsFocusEn: 'odor/mess control, pet enjoyment, safe ingredients, repeat monthly replenishment value',
      riskChecklistEn: [
        'Check heavy-bag shipping fees (cat litter / dry kibble) and ingredient/expiry transparency.',
        'Avoid veterinary disease-cure claims on pet supplements or shampoos.',
      ],
      riskChecklistMy: [
        'ทรายแมว/အစာအိတ်ကြီးများတွင် ပို့ဆောင်ခနှင့် သက်တမ်း (Expiry) ကို စစ်ဆေးပါ။',
        'တိရစ္ဆာန်ရောဂါကုသနိုင်သည်ဟူသော ဆေးဘက်ဆိုင်ရာ စကားလုံးများကို ရှောင်ပါ။',
      ],
      affiliateStrategyFocusEn:
        'Open with an authentic pet reaction or odor/hair-removal proof test; highlight multi-pack savings to capture recurring monthly pet-parent orders.',
      affiliateStrategyFocusMy:
        'အိမ်မွေးတိရစ္ဆာန်တုံ့ပြန်မှု သို့မဟုတ် အမွေး/အနံ့ဖယ်ရှားမှုစမ်းသပ်ချက်ဖြင့် စတင်ပြီး လစဉ်သုံး Multi-pack များကို ဦးစားပေးပါ။',
      creativeAnglesEn: [
        'Real pet reaction test paired with mess-free or odor-control demonstration.',
        'Monthly cost-per-use breakdown showing value for multi-pet households.',
      ],
      creativeAnglesMy: [
        'ကြောင်/ခွေးလက်တွေ့တုံ့ပြန်မှုနှင့် အနံ့/အညစ်အကြေးထိန်းချုပ်မှု စမ်းသပ်ပြသခြင်း။',
        'တစ်လစာကုန်ကျစရိတ်သက်သာပုံ တန်ဖိုးတွက်ချက်ပြသမှု။',
      ],
      cautionsEn: [
        'Verify ingredient safety and avoid veterinary medical claims.',
        'Check reviews for torn heavy bags or missing scoops during transit.',
      ],
      cautionsMy: [
        'ပါဝင်ပစ္စည်းဘေးကင်းမှုကို စစ်ဆေးပြီး တိရစ္ဆာန်ဆေးကုသမှုအာမခံချက်များ မသုံးပါနှင့်။',
        'ပို့ဆောင်စဉ် အိတ်ပေါက်ပြဲမှု Complaint ရှိမရှိ Review တွင် စစ်ဆေးပါ။',
      ],
    },
  },
  {
    id: 'toys-hobbies',
    labelEn: 'Toys & Hobbies',
    labelMy: 'အရုပ်နှင့် ဝါသနာဆိုင်ရာပစ္စည်းများ',
    shortLabelEn: 'Toys',
    shortLabelMy: 'အရုပ်များ',
    defaultKalodataId: null,
    defaultSupportStatus: 'requires-sync',
    defaultKalodataName: null,
    kalodataNamePatterns: [
      /toys?\s*&?\s*hobbies?/i,
      /collectibles?/i,
      /\btoys?\b/i,
    ],
    mismatchSignatureKeywords: [
      'plush', 'blind box', 'figure', 'art toy', 'lego', 'building block', 'rc car', 'board game',
      'puzzle', 'doll', 'กล่องสุ่ม', 'ของเล่น', 'ตุ๊กตา', 'ฟิกเกอร์',
    ],
    scoringProfile: {
      weightDeltas: {
        salesPerformance: 1,
        revenuePerformance: 0,
        revenueGrowth: 1,
        commissionPotential: 0,
        competition: -1,
        marketDemand: 0,
        aiContentSuitability: -1,
      },
      typicalPriceBandThb: [99, 1290],
      strongCreativeKeywords: [
        'blind box', 'art toy', 'figure', 'plush', 'doll', 'block', 'puzzle', 'board game',
        'rc', 'drone', 'car', 'robot', 'magnetic', 'educational', 'craft', 'diy', 'slime', 'squishy',
        'กล่องสุ่ม', 'อาร์ตทอย', 'ตุ๊กตา', 'ตัวต่อ', 'ของเล่น', 'บอร์ดเกม',
      ],
      weakCreativeKeywords: [
        'counterfeit', 'replica', 'knockoff', 'bb gun', 'airsoft', 'ของปลอม',
      ],
      formatLabelEn: 'Unboxing & Play-Value Showcase',
      formatLabelMy: 'Unboxing နှင့် ကစားပြသမှု Showcase',
      strongFitReasonEn: 'blind-box reveals, tactile plush/blocks, and play demos trigger strong viral curiosity on TikTok',
      strongFitReasonMy: 'Unboxing နှင့် လက်တွေ့ကစားပြသမှုများသည် TikTok တွင် ကြည့်ရှုသူစိတ်ဝင်စားမှု မြင့်မားသည်',
      weakFitReasonEn: 'IP-infringing replicas or restricted projectile toys carry severe account suspension risk',
      weakFitReasonMy: 'မူပိုင်ခွင့်ချိုးဖောက်သော ပစ္စည်းအတုများသည် Account ပိတ်ခံရနိုင်ခြေ မြင့်မားသည်',
    },
    aiProfile: {
      adFormat: 'lifestyle-usage-demo',
      contentPotentialDirectiveEn:
        'Toys & Hobbies: evaluate suitability for Unboxing & Play-Value videos (tactile reveal, gift appeal, collectibles authenticity, age-safety compliance).',
      targetAudienceDefaultEn:
        'Thai collectible/art-toy fans, gift shoppers, and parents looking for engaging educational toys (AI Market Inference).',
      targetAudienceDefaultMy:
        'Art Toy/Collectible စုဆောင်းသူများ၊ လက်ဆောင်ဝယ်သူများနှင့် ကလေးကစားစရာရှာဖွေသော မိဘများ (AI Market Inference)။',
      sellingPointsFocusEn: 'unboxing excitement, collectible/gift value, build quality, educational play engagement',
      riskChecklistEn: [
        'Verify official IP licensing/authenticity — counterfeit collectibles/characters trigger strict TikTok IP takedowns.',
        'Check small-parts age ratings and Thai TISI (มอก.) toy safety marks for children’s toys.',
      ],
      riskChecklistMy: [
        'Art Toy/Character ပစ္စည်းများတွင် တရားဝင်မူပိုင်ခွင့် (Official IP) ရှိမရှိ စစ်ဆေးပါ — ပစ္စည်းအတုသည် IP Violation ဖြစ်နိုင်သည်။',
        'ကလေးအရုပ်များအတွက် အသက်သတ်မှတ်ချက်နှင့် ထိုင်း TISI (มอก.) ဘေးကင်းရေးလက်မှတ်ကို စစ်ဆေးပါ။',
      ],
      affiliateStrategyFocusEn:
        'Use suspenseful 3-second unboxing or tactile play hooks; highlight official authenticity and gift-ready packaging during seasonal peaks.',
      affiliateStrategyFocusMy:
        'စိတ်ဝင်စားဖွယ် 3 စက္ကန့် Unboxing ဖြင့် စတင်ပြီး တရားဝင်အစစ်အမှန်ဖြစ်ကြောင်းနှင့် လက်ဆောင်ပေးရန်သင့်တော်မှုကို အသားပေးပါ။',
      creativeAnglesEn: [
        'Fast unboxing reveal highlighting detail finish, texture, and giftability.',
        'Hands-on play or display desk-setup clip showing real scale and interactivity.',
      ],
      creativeAnglesMy: [
        'အသေးစိတ်လက်ရာနှင့် လက်ဆောင်ပေးရန်သင့်တော်မှုကို ပြသသော Unboxing ဗီဒီယို။',
        'အရွယ်အစားအစစ်နှင့် လက်တွေ့ကစား/အလှဆင်ပြသမှု။',
      ],
      cautionsEn: [
        'Never promote unlicensed counterfeit characters or replica branded toys.',
        'Clearly note recommended age range for toys containing small parts.',
      ],
      cautionsMy: [
        'မူပိုင်ခွင့်မရှိသော Character အတုများကို လုံးဝ Promote မလုပ်ပါနှင့်။',
        'အစိတ်အပိုင်းအသေးပါသော အရုပ်များတွင် သင့်တော်သောအသက်အရွယ်ကို ဖော်ပြပါ။',
      ],
    },
  },
  {
    id: 'books-stationery',
    labelEn: 'Books & Stationery',
    labelMy: 'စာအုပ်နှင့် စာရေးကိရိယာများ',
    shortLabelEn: 'Books',
    shortLabelMy: 'စာအုပ်/စာရေး',
    defaultKalodataId: null,
    defaultSupportStatus: 'requires-sync',
    defaultKalodataName: null,
    kalodataNamePatterns: [
      /books?,?\s*magazines?\s*&?\s*audio/i,
      /books?\s*&?\s*stationery/i,
      /office\s*&?\s*school/i,
      /stationery|\bbooks?\b/i,
    ],
    mismatchSignatureKeywords: [
      'book', 'notebook', 'planner', 'gel pen', 'marker', 'highlighter', 'pencil case',
      'sticker', 'binder', 'flashcard', 'หนังสือ', 'สมุด', 'ปากกา', 'เครื่องเขียน',
    ],
    scoringProfile: {
      weightDeltas: {
        salesPerformance: 1,
        revenuePerformance: 0,
        revenueGrowth: 0,
        commissionPotential: 1,
        competition: 1,
        marketDemand: 0,
        aiContentSuitability: -3,
      },
      typicalPriceBandThb: [59, 490],
      strongCreativeKeywords: [
        'book', 'planner', 'notebook', 'journal', 'pen', 'marker', 'highlighter', 'pencil case',
        'desk', 'sticker', 'tape', 'flashcard', 'workbook', 'english', 'study', 'exam', 'art set',
        'หนังสือ', 'สมุด', 'ปากกา', 'เครื่องเขียน', 'เตรียมสอบ', 'ไฮไลท์',
      ],
      weakCreativeKeywords: [
        'photocopy', 'pdf', 'digital download', 'ebook', 'ไฟล์ pdf',
      ],
      formatLabelEn: 'Desk Aesthetic & Page-Flip Demo',
      formatLabelMy: 'စာကြည့်စားပွဲနှင့် စာမျက်နှာလှန် Demo',
      strongFitReasonEn: 'clean desk-aesthetic ASMR writing tests and page-flip summaries perform reliably with Thai students',
      strongFitReasonMy: 'စာရေးစမ်းသပ်မှု ASMR နှင့် စာအုပ်အတွင်းပိုင်းလှန်ပြမှုများသည် ကျောင်းသား/စာဖတ်သူများကြား ရေပန်းစားသည်',
      weakFitReasonEn: 'unauthorized digital/photocopy listings pose copyright and fulfillment issues',
      weakFitReasonMy: 'မူပိုင်ခွင့်မသေချာသော Digital/Copy ပစ္စည်းများသည် စည်းကမ်းချိုးဖောက်မှု ဖြစ်နိုင်သည်',
    },
    aiProfile: {
      adFormat: 'lifestyle-usage-demo',
      contentPotentialDirectiveEn:
        'Books & Stationery: evaluate suitability for Desk-Aesthetic / Page-Flip Demo videos (smooth ink test, study takeaway hook, organized desk/back-to-school appeal).',
      targetAudienceDefaultEn:
        'Thai students, exam-prep learners, self-improvement readers, and aesthetic stationery collectors (AI Market Inference).',
      targetAudienceDefaultMy:
        'ထိုင်းကျောင်းသားများ၊ စာမေးပွဲပြင်ဆင်သူများ၊ စာဖတ်ဝါသနာရှင်များနှင့် စာရေးကိရိယာချစ်သူများ (AI Market Inference)။',
      sellingPointsFocusEn: 'practical learning value, smooth writing/paper quality, back-to-school utility, aesthetic set pricing',
      riskChecklistEn: [
        'Verify publisher authenticity (no pirated prints) and low-price commission math (bundle sets help AOV).',
        'Check paper bleed-through or dried-ink complaints in buyer reviews.',
      ],
      riskChecklistMy: [
        'စာအုပ်များတွင် မူရင်းထုတ်ဝေသူအစစ်ဖြစ်ကြောင်း စစ်ဆေးပြီး ဈေးနည်းပစ္စည်းများအတွက် Set/Bundle Commission ကို တွက်ချက်ပါ။',
        'မင်ခြောက်ခြင်း/စက္ကူပါးလွန်းခြင်း Complaint ရှိမရှိ Review တွင် စစ်ဆေးပါ။',
      ],
      affiliateStrategyFocusEn:
        'Share one actionable takeaway from the book or a satisfying ink/paper ASMR test; promote multi-pen or study-bundle SKUs to boost commission per order.',
      affiliateStrategyFocusMy:
        'စာအုပ်မှ အသုံးဝင်သောအချက်တစ်ချက် သို့မဟုတ် မင်/စက္ကူစမ်းသပ်မှု ASMR ဖြင့် ဆွဲဆောင်ပြီး Bundle Set များဖြင့် Commission မြှင့်ပါ။',
      creativeAnglesEn: [
        'Satisfying ink-glide / highlighter smudge test or clean page-flip preview.',
        'One key life/study lesson hook that naturally introduces the book or planner.',
      ],
      creativeAnglesMy: [
        'မင်ချောမွေ့မှု/စက္ကူအရည်အသွေး စမ်းသပ်ပြသမှု သို့မဟုတ် စာမျက်နှာလှန်ပြသခြင်း။',
        'စာအုပ်ထဲမှ လက်တွေ့အသုံးဝင်သည့် အချက်တစ်ခုဖြင့် စတင်မိတ်ဆက်မှု။',
      ],
      cautionsEn: [
        'Ensure books are authentic publisher editions, never pirated copies.',
        'Watch low unit prices — calculate THB commission per sale before spending ad budget.',
      ],
      cautionsMy: [
        'မူရင်းထုတ်ဝေသူစာအုပ်အစစ်ဖြစ်ကြောင်း အတည်ပြုပါ။',
        'ဈေးနှုန်းနည်းသောပစ္စည်းများတွင် တစ်ခုရောင်းရလျှင်ရမည့် THB Commission ကို တွက်ချက်ပါ။',
      ],
    },
  },
  {
    id: 'jewelry-accessories',
    labelEn: 'Jewelry & Accessories',
    labelMy: 'လက်ဝတ်ရတနာနှင့် ဖက်ရှင်အသုံးအဆောင်များ',
    shortLabelEn: 'Jewelry',
    shortLabelMy: 'လက်ဝတ်ရတနာ',
    defaultKalodataId: null,
    defaultSupportStatus: 'requires-sync',
    defaultKalodataName: null,
    kalodataNamePatterns: [
      /jewelry/i,
      /jewellery/i,
      /fashion\s*accessories/i,
      /watches?\s*&?\s*accessories/i,
      /eyewear|sunglasses/i,
    ],
    mismatchSignatureKeywords: [
      'necklace', 'bracelet', 'earring', 'ring', 'pendant', 'anklet', 'brooch', 'sunglasses',
      'hair clip', 'watch', 'สร้อยคอ', 'กำไล', 'ต่างหู', 'แหวน', 'แว่นกันแดด',
    ],
    scoringProfile: {
      weightDeltas: {
        salesPerformance: 0,
        revenuePerformance: 0,
        revenueGrowth: 0,
        commissionPotential: 1,
        competition: -1,
        marketDemand: 0,
        aiContentSuitability: 0,
      },
      typicalPriceBandThb: [99, 1290],
      strongCreativeKeywords: [
        'necklace', 'bracelet', 'bangle', 'earring', 'ring', 'pendant', 'anklet', 'watch',
        'sunglasses', 'eyewear', 'hair clip', 'claw clip', 'headband', 'belt', 'scarf', 'pearl',
        'silver', 'gold plated', 'amulet', 'สร้อย', 'กำไล', 'ต่างหู', 'แหวน', 'แว่นตา', 'นาฬิกา',
      ],
      weakCreativeKeywords: [
        'investment gold', 'gold bar', 'bullion', 'pawn', 'loose diamond', 'ทองคำแท่ง',
      ],
      formatLabelEn: 'Macro Sparkle & Styling Showcase',
      formatLabelMy: 'အနီးကပ် Macro နှင့် ဝတ်ဆင်ပြသမှု Showcase',
      strongFitReasonEn: 'macro sparkle, water/tarnish-resistance proof, and gift-box styling translate cleanly to short-form visuals',
      strongFitReasonMy: 'အနီးကပ်တောက်ပမှု၊ အရောင်မကျစမ်းသပ်ချက်နှင့် ဝတ်ဆင်ပြသမှုများသည် ဗီဒီယိုတိုတွင် ဆွဲဆောင်မှုအားကောင်းသည်',
      weakFitReasonEn: 'precious bullion/fine-investment items face strict TikTok Shop category authorization rules',
      weakFitReasonMy: 'ရွှေတုံး/တန်ဖိုးကြီးရတနာများသည် TikTok Shop ခွင့်ပြုချက်ကန့်သတ်ချက် တင်းကျပ်သည်',
    },
    aiProfile: {
      adFormat: 'product-only-3d-commercial',
      contentPotentialDirectiveEn:
        'Jewelry & Accessories: evaluate suitability for Macro 3D Sparkle & Styling videos (close-up shine, waterproof/tarnish resistance, gift-box presentation, auspicious/lucky Thai styling appeal).',
      targetAudienceDefaultEn:
        'Thai fashion-conscious shoppers, gift buyers, and auspicious-accessory (สายมู) enthusiasts (AI Market Inference).',
      targetAudienceDefaultMy:
        'ဖက်ရှင်အသုံးအဆောင်ကြိုက်နှစ်သက်သူများ၊ လက်ဆောင်ဝယ်သူများနှင့် ထိုင်းအဆောင်/လက်ဝတ်ရတနာနှစ်သက်သူများ (AI Market Inference)။',
      sellingPointsFocusEn: 'tarnish/water resistance, delicate finish, gift-ready box, affordable luxury look',
      riskChecklistEn: [
        'Verify material accuracy (e.g., 925 silver / 316L stainless steel vs alloy) to prevent tarnish/allergy complaints.',
        'Avoid unverified supernatural wealth/luck guarantees or fake precious-metal hallmark claims.',
      ],
      riskChecklistMy: [
        'အရောင်ကျခြင်း/အရေပြားဓာတ်မတည့်ခြင်းမဖြစ်စေရန် ပစ္စည်းအမျိုးအစား (925 Silver / Stainless) တိကျမှုကို စစ်ဆေးပါ။',
        'မမှန်ကန်သော ရွှေ/ငွေစစ်အာမခံချက်နှင့် လွန်ကဲသော ကံကောင်းမှုအာမခံချက်များကို ရှောင်ပါ။',
      ],
      affiliateStrategyFocusEn:
        'Lead with high-contrast macro lighting and wrist/neck scale shots; emphasize waterproof daily wear and gift-box readiness.',
      affiliateStrategyFocusMy:
        'အနီးကပ် Macro အလင်းရောင်ဖြင့် တောက်ပမှုနှင့် ဝတ်ဆင်ပုံအရွယ်အစားကို ပြသပြီး ရေစိုခံနေ့စဉ်ဝတ်နိုင်မှုနှင့် Gift Box ကို အသားပေးပါ။',
      creativeAnglesEn: [
        'Macro studio sparkle rotation transitioning into natural daylight skin-tone wear.',
        'Waterproof / sweat-resistant daily-wear durability showcase with gift packaging.',
      ],
      creativeAnglesMy: [
        'Studio အနီးကပ်တောက်ပမှုမှ သဘာဝအလင်းရောင် ဝတ်ဆင်ပြသမှုသို့ ပြောင်းလဲပြသခြင်း။',
        'ရေစို/ချွေးခံနိုင်မှုနှင့် လက်ဆောင်ဘူးအလှ ပြသမှု။',
      ],
      cautionsEn: [
        'State plating vs solid metal honestly based on verified seller specs.',
        'Watch for small-scale illusion — show real size on hand/neck.',
      ],
      cautionsMy: [
        'ရွှေချ/ငွေချ သို့မဟုတ် သတ္တုအမျိုးအစားကို ဆိုင်ဖော်ပြချက်အတိုင်း ရိုးသားစွာဖော်ပြပါ။',
        'အရွယ်အစားအစစ်ကို ဝယ်ယူသူသိစေရန် လက်/လည်ပင်းပေါ်တွင် ယှဉ်ပြပါ။',
      ],
    },
  },
];

export const CATEGORY_BY_ID: Readonly<Record<ProductCategory, UniversalCategoryDefinition>> =
  Object.fromEntries(
    UNIVERSAL_CATEGORIES.map((def) => [def.id, def])
  ) as Record<ProductCategory, UniversalCategoryDefinition>;

export const ALL_PRODUCT_CATEGORIES: readonly ProductCategory[] = UNIVERSAL_CATEGORIES.map(
  (def) => def.id
);

export const DEFAULT_SELECTED_CATEGORIES: readonly ProductCategory[] = [];

export const SYNCED_CATEGORIES_STORAGE_KEY = 'siampick_kalodata_categories_v1';
export const SYNCED_CATEGORIES_SCHEMA_VERSION = 1;

export function isValidProductCategory(value: unknown): value is ProductCategory {
  return typeof value === 'string' && value in CATEGORY_BY_ID;
}

export function getCategoryDefinition(category: ProductCategory): UniversalCategoryDefinition {
  return CATEGORY_BY_ID[category] ?? CATEGORY_BY_ID['womens-fashion'];
}

export function getCategoryLabel(
  category: ProductCategory,
  language: Language,
  options?: { short?: boolean }
): string {
  const def = getCategoryDefinition(category);
  if (options?.short) {
    return language === 'my' ? def.shortLabelMy : def.shortLabelEn;
  }
  return language === 'my' ? def.labelMy : def.labelEn;
}

/**
 * Matches a real Kalodata category_name string (e.g., "Phones & Electronics", "Home Supplies",
 * "Beauty & Personal Care", "Pet Supplies") to one of our 14 canonical ProductCategory slugs.
 * Returns null if no confident match exists (never guesses randomly).
 */
export function matchKalodataCategoryNameToSlug(
  categoryName: string | null | undefined
): ProductCategory | null {
  const raw = (categoryName ?? '').trim();
  if (!raw) return null;

  // Check more specific multi-word / collision-prone categories BEFORE broad patterns:
  // - 'books-stationery' BEFORE 'electronics' so "Books, Magazines & Audio" is never stolen by /audio/i
  // - 'jewelry-accessories' & 'baby-kids' BEFORE 'womens-fashion' so "Fashion Accessories" & "Kids' Fashion"
  //   are never stolen by /fashion/i
  // - 'cosmetics-beauty' BEFORE 'health-personal-care' so "Beauty & Personal Care" matches cosmetics-beauty
  // - 'kitchen' BEFORE 'home-living' so "Kitchenware" matches kitchen
  const priorityOrder: ProductCategory[] = [
    'cosmetics-beauty',
    'books-stationery',
    'jewelry-accessories',
    'baby-kids',
    'womens-fashion',
    'kitchen',
    'home-living',
    'electronics',
    'health-personal-care',
    'food-beverages',
    'sports-outdoor',
    'automotive',
    'pet-supplies',
    'toys-hobbies',
  ];

  for (const slug of priorityOrder) {
    const def = CATEGORY_BY_ID[slug];
    if (def.kalodataNamePatterns.some((pattern) => pattern.test(raw))) {
      return slug;
    }
  }
  return null;
}

/**
 * Resolves a product's assigned category vs its title + Kalodata priCategory evidence.
 * If the title or Kalodata primary category strongly contradicts the assigned category,
 * marks the category as 'unverified' with a bilingual explanation.
 */
export function verifyProductCategoryAlignment(product: ResearchProduct): {
  status: CategoryVerificationStatus;
  suspectedCategory: ProductCategory | null;
  noteEn: string;
  noteMy: string;
} {
  const assigned = product.category;
  const assignedDef = getCategoryDefinition(assigned);

  // 1. Check Kalodata priCategory name if present
  const priName = product.kalodataMetrics?.priCategory?.category_name?.trim() ?? '';
  if (priName) {
    const matchedPri = matchKalodataCategoryNameToSlug(priName);
    if (matchedPri && matchedPri !== assigned) {
      // Allow home-living <-> kitchen and beauty <-> health overlap without false alarm
      const acceptableAdjacent =
        (matchedPri === 'home-living' && assigned === 'kitchen') ||
        (matchedPri === 'kitchen' && assigned === 'home-living') ||
        (matchedPri === 'cosmetics-beauty' && assigned === 'health-personal-care') ||
        (matchedPri === 'health-personal-care' && assigned === 'cosmetics-beauty');

      if (!acceptableAdjacent) {
        const matchedDef = getCategoryDefinition(matchedPri);
        return {
          status: 'unverified',
          suspectedCategory: matchedPri,
          noteEn: `Category Unverified — Kalodata primary category ("${priName}") aligns more closely with ${matchedDef.labelEn} than ${assignedDef.labelEn}.`,
          noteMy: `Category မအတည်ပြုနိုင်သေးပါ (Unverified) — Kalodata မူရင်း Category ("${priName}") သည် ${assignedDef.labelMy} ထက် ${matchedDef.labelMy} နှင့် ပိုမိုကိုက်ညီနေပါသည်။`,
        };
      }
    }
  }

  // 2. Check product title & subCategory signature keywords
  const haystack = `${product.name ?? ''} ${product.subCategory ?? ''}`.toLowerCase();
  const assignedHits = assignedDef.mismatchSignatureKeywords.filter((kw) =>
    haystack.includes(kw)
  ).length;

  if (assignedHits === 0) {
    let bestOther: ProductCategory | null = null;
    let bestHits = 0;

    for (const def of UNIVERSAL_CATEGORIES) {
      if (def.id === assigned) continue;
      const hits = def.mismatchSignatureKeywords.filter((kw) => haystack.includes(kw)).length;
      if (hits > bestHits) {
        bestHits = hits;
        bestOther = def.id;
      }
    }

    // Require >= 2 distinct signature keyword hits from another category to flag mismatch
    if (bestOther && bestHits >= 2) {
      const otherDef = getCategoryDefinition(bestOther);
      return {
        status: 'unverified',
        suspectedCategory: bestOther,
        noteEn: `Category Unverified — Product title cues match ${otherDef.labelEn} rather than assigned ${assignedDef.labelEn}. Verify product listing before relying on category-specific advice.`,
        noteMy: `Category မအတည်ပြုနိုင်သေးပါ (Unverified) — Product အမည်ပါ အချက်အလက်များသည် ${assignedDef.labelMy} ထက် ${otherDef.labelMy} နှင့် ပိုတူနေပါသည်။ Listing အစစ်ကို စစ်ဆေးပါ။`,
      };
    }
  }

  return {
    status: 'verified',
    suspectedCategory: null,
    noteEn: `Category verified as ${assignedDef.labelEn}.`,
    noteMy: `${assignedDef.labelMy} Category အဖြစ် အတည်ပြုပြီး။`,
  };
}

// ---------- LocalStorage Sync Cache for Live Kalodata TH Categories & Subcategories ----------

function getBrowserStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
    if (
      typeof globalThis !== 'undefined' &&
      'localStorage' in globalThis &&
      globalThis.localStorage
    ) {
      return globalThis.localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

export function createEmptySyncedCategoryCache(): SyncedKalodataCategoryCache {
  return {
    schemaVersion: SYNCED_CATEGORIES_SCHEMA_VERSION,
    syncedAt: null,
    subcategoriesSyncedAt: null,
    l1IdBySlug: {},
    l1NameBySlug: {},
    unsupportedSlugs: [],
    subcategories: [],
  };
}

export function loadSyncedKalodataCategories(): SyncedKalodataCategoryCache {
  const storage = getBrowserStorage();
  if (!storage) return createEmptySyncedCategoryCache();

  try {
    const raw = storage.getItem(SYNCED_CATEGORIES_STORAGE_KEY);
    if (!raw) return createEmptySyncedCategoryCache();
    const parsed = JSON.parse(raw) as Partial<SyncedKalodataCategoryCache> | null;
    if (!parsed || typeof parsed !== 'object') return createEmptySyncedCategoryCache();

    const l1IdBySlug: Partial<Record<ProductCategory, string>> = {};
    if (parsed.l1IdBySlug && typeof parsed.l1IdBySlug === 'object') {
      for (const [k, v] of Object.entries(parsed.l1IdBySlug)) {
        if (isValidProductCategory(k) && typeof v === 'string' && /^[A-Za-z0-9_-]{3,64}$/.test(v.trim())) {
          l1IdBySlug[k] = v.trim();
        }
      }
    }

    const l1NameBySlug: Partial<Record<ProductCategory, string>> = {};
    if (parsed.l1NameBySlug && typeof parsed.l1NameBySlug === 'object') {
      for (const [k, v] of Object.entries(parsed.l1NameBySlug)) {
        if (isValidProductCategory(k) && typeof v === 'string' && v.trim()) {
          l1NameBySlug[k] = v.trim();
        }
      }
    }

    const unsupportedSlugs = Array.from(
      new Set(
        Array.isArray(parsed.unsupportedSlugs)
          ? parsed.unsupportedSlugs.filter(
              (slug): slug is ProductCategory =>
                isValidProductCategory(slug) && !CATEGORY_BY_ID[slug].defaultKalodataId
            )
          : []
      )
    );

    // Ensure unsupported slugs never simultaneously hold stale dynamic IDs
    for (const slug of unsupportedSlugs) {
      delete l1IdBySlug[slug];
      delete l1NameBySlug[slug];
    }

    const subcategories: KalodataSubcategoryOption[] = Array.isArray(parsed.subcategories)
      ? parsed.subcategories.filter(
          (item): item is KalodataSubcategoryOption =>
            Boolean(item) &&
            typeof item === 'object' &&
            typeof item.id === 'string' &&
            item.id.trim().length >= 3 &&
            typeof item.name === 'string' &&
            item.name.trim().length > 0
        )
      : [];

    return {
      schemaVersion: SYNCED_CATEGORIES_SCHEMA_VERSION,
      syncedAt: typeof parsed.syncedAt === 'string' ? parsed.syncedAt : null,
      subcategoriesSyncedAt:
        typeof parsed.subcategoriesSyncedAt === 'string' ? parsed.subcategoriesSyncedAt : null,
      l1IdBySlug,
      l1NameBySlug,
      unsupportedSlugs,
      subcategories,
    };
  } catch {
    return createEmptySyncedCategoryCache();
  }
}

export function saveSyncedKalodataCategories(cache: SyncedKalodataCategoryCache): boolean {
  const storage = getBrowserStorage();
  if (!storage) return false;
  try {
    storage.setItem(SYNCED_CATEGORIES_STORAGE_KEY, JSON.stringify(cache));
    return true;
  } catch {
    return false;
  }
}

export interface KalodataCategoryRankLikeItem {
  category_id: string;
  category_name: string;
  rank?: number | null;
  revenue?: number | null;
  parent_category_id?: string | null;
}

/**
 * Merges live Kalodata TH L1 category rank items into the synced cache.
 * - Recomputes dynamic L1 mappings cleanly from the latest live list so re-syncs
 *   automatically update statuses and counts (both newly unlocked and newly unsupported).
 * - Empty liveItems leaves `previous` untouched so failed/empty calls never corrupt cache.
 * - Categories with no static verified ID AND no match in the live L1 list are honestly
 *   marked in `unsupportedSlugs` so SiamPick NEVER pretends an unsupported category works.
 */
export function mergeSyncedL1Categories(
  previous: SyncedKalodataCategoryCache,
  liveItems: readonly KalodataCategoryRankLikeItem[],
  syncedAt = new Date().toISOString()
): SyncedKalodataCategoryCache {
  const validItems = liveItems
    .map((item) => ({
      id: String(item.category_id ?? '').trim(),
      name: String(item.category_name ?? '').trim(),
    }))
    .filter((item) => /^[A-Za-z0-9_-]{3,64}$/.test(item.id) && item.name.length > 0);

  if (validItems.length === 0) {
    return previous;
  }

  const nextIdMap: Partial<Record<ProductCategory, string>> = {};
  const nextNameMap: Partial<Record<ProductCategory, string>> = {};
  const matchedSlugs = new Set<ProductCategory>();

  for (const item of validItems) {
    // First check exact static ID match
    const byStaticId = UNIVERSAL_CATEGORIES.find((def) => def.defaultKalodataId === item.id);
    const matchedSlug = byStaticId?.id ?? matchKalodataCategoryNameToSlug(item.name);

    if (matchedSlug && !matchedSlugs.has(matchedSlug)) {
      matchedSlugs.add(matchedSlug);
      nextIdMap[matchedSlug] = item.id;
      nextNameMap[matchedSlug] = item.name;
    }
  }

  // Honestly mark unmatched categories (that have no verified static fallback) as unsupported
  const unsupportedSlugs: ProductCategory[] = [];
  for (const def of UNIVERSAL_CATEGORIES) {
    if (!matchedSlugs.has(def.id) && !def.defaultKalodataId) {
      unsupportedSlugs.push(def.id);
    }
  }

  return {
    ...previous,
    schemaVersion: SYNCED_CATEGORIES_SCHEMA_VERSION,
    syncedAt,
    l1IdBySlug: nextIdMap,
    l1NameBySlug: nextNameMap,
    unsupportedSlugs,
  };
}

/**
 * Merges live Kalodata TH L2 subcategory rank items into the synced cache.
 */
export function mergeSyncedL2Subcategories(
  previous: SyncedKalodataCategoryCache,
  liveItems: readonly KalodataCategoryRankLikeItem[],
  parentHint?: { parentCategory?: ProductCategory | null; parentCategoryId?: string | null },
  syncedAt = new Date().toISOString()
): SyncedKalodataCategoryCache {
  const byId = new Map<string, KalodataSubcategoryOption>();
  for (const existing of previous.subcategories) {
    byId.set(existing.id, existing);
  }

  // Build reverse lookup from L1 Kalodata ID -> ProductCategory slug for accurate parent linking
  const slugByL1Id = new Map<string, ProductCategory>();
  for (const def of UNIVERSAL_CATEGORIES) {
    const id = previous.l1IdBySlug[def.id] ?? def.defaultKalodataId;
    if (id) slugByL1Id.set(id, def.id);
  }

  for (const item of liveItems) {
    const id = String(item.category_id ?? '').trim();
    const name = String(item.category_name ?? '').trim();
    if (!/^[A-Za-z0-9_-]{3,64}$/.test(id) || !name) continue;

    const itemParentId =
      typeof item.parent_category_id === 'string' && item.parent_category_id.trim()
        ? item.parent_category_id.trim()
        : null;
    const effectiveParentId =
      itemParentId ?? parentHint?.parentCategoryId ?? byId.get(id)?.parentCategoryId ?? null;

    const guessedParent =
      (effectiveParentId ? slugByL1Id.get(effectiveParentId) : null) ??
      parentHint?.parentCategory ??
      matchKalodataCategoryNameToSlug(name) ??
      byId.get(id)?.parentCategory ??
      null;

    byId.set(id, {
      id,
      name,
      parentCategory: guessedParent,
      parentCategoryId: effectiveParentId,
      rank: typeof item.rank === 'number' && Number.isFinite(item.rank) ? item.rank : null,
      revenueThb:
        typeof item.revenue === 'number' && Number.isFinite(item.revenue) ? item.revenue : null,
    });
  }

  return {
    ...previous,
    schemaVersion: SYNCED_CATEGORIES_SCHEMA_VERSION,
    subcategoriesSyncedAt: syncedAt,
    subcategories: Array.from(byId.values()).sort(
      (a, b) => (a.rank ?? 9999) - (b.rank ?? 9999)
    ),
  };
}

/**
 * Combines static verified IDs with user-synced Kalodata TH L1/L2 catalog into the effective UI/runtime view.
 */
export function getEffectiveCategoryCatalog(
  syncedCache?: SyncedKalodataCategoryCache | null
): EffectiveCategoryEntry[] {
  const cache = syncedCache ?? createEmptySyncedCategoryCache();
  const unsupportedSet = new Set<ProductCategory>(cache.unsupportedSlugs);

  return UNIVERSAL_CATEGORIES.map((def) => {
    const isMarkedUnsupported = unsupportedSet.has(def.id) && !def.defaultKalodataId;
    const syncedId = isMarkedUnsupported ? null : (cache.l1IdBySlug[def.id] ?? null);
    const syncedName = isMarkedUnsupported ? null : (cache.l1NameBySlug[def.id] ?? null);
    const kalodataId = syncedId ?? def.defaultKalodataId;
    const kalodataName = syncedName ?? def.defaultKalodataName;

    let apiSupportStatus: CategoryApiSupportStatus;
    if (isMarkedUnsupported) {
      apiSupportStatus = 'unsupported';
    } else if (syncedId) {
      apiSupportStatus = def.defaultSupportStatus === 'verified' ? 'verified' : 'synced';
    } else if (def.defaultKalodataId) {
      apiSupportStatus = def.defaultSupportStatus;
    } else {
      apiSupportStatus = 'requires-sync';
    }

    const selectable = Boolean(kalodataId) && apiSupportStatus !== 'unsupported';
    const subcategories = cache.subcategories.filter((sub) => sub.parentCategory === def.id);

    return {
      ...def,
      kalodataId: selectable ? kalodataId : null,
      kalodataName: selectable ? kalodataName : null,
      apiSupportStatus,
      selectable,
      subcategories,
    };
  });
}

export type CategorySyncState = 'unsynced' | 'syncing' | 'synced' | 'error';

export interface CategoryCatalogCounts {
  total: number;
  supported: number;
  verified: number;
  synced: number;
  requiresSync: number;
  unsupported: number;
  syncState: CategorySyncState;
}

/**
 * Single source of truth for Total / Supported / Pending Sync / Unsupported category counts
 * across unsynced, syncing, synced, and error states.
 */
export function getCategoryCatalogCounts(
  syncedCache?: SyncedKalodataCategoryCache | null,
  options?: { isSyncing?: boolean; hasError?: boolean }
): CategoryCatalogCounts {
  const cache = syncedCache ?? createEmptySyncedCategoryCache();
  const catalog = getEffectiveCategoryCatalog(cache);

  let verified = 0;
  let synced = 0;
  let requiresSync = 0;
  let unsupported = 0;

  for (const entry of catalog) {
    if (entry.apiSupportStatus === 'verified' || entry.apiSupportStatus === 'docs-verified') {
      verified += 1;
    } else if (entry.apiSupportStatus === 'synced') {
      synced += 1;
    } else if (entry.apiSupportStatus === 'unsupported') {
      unsupported += 1;
    } else {
      requiresSync += 1;
    }
  }

  const supported = verified + synced;
  let syncState: CategorySyncState;
  if (options?.isSyncing) {
    syncState = 'syncing';
  } else if (options?.hasError) {
    syncState = 'error';
  } else if (cache.syncedAt) {
    syncState = 'synced';
  } else {
    syncState = 'unsynced';
  }

  return {
    total: catalog.length,
    supported,
    verified,
    synced,
    requiresSync,
    unsupported,
    syncState,
  };
}

/**
 * Formats an honest, unambiguous category count summary:
 * - After sync (0 pending): "14 Total · 13 Supported · 1 Unsupported"
 * - Before sync (11 pending): "14 Total · 3 Supported · 11 Pending Sync · 0 Unsupported"
 */
export function formatCategoryCatalogCountSummary(
  counts: CategoryCatalogCounts,
  language: Language
): string {
  if (language === 'my') {
    if (counts.requiresSync > 0) {
      return `စုစုပေါင်း ${counts.total} · ပံ့ပိုး ${counts.supported} · Sync လို ${counts.requiresSync} · မပံ့ပိုး ${counts.unsupported}`;
    }
    return `စုစုပေါင်း ${counts.total} · ပံ့ပိုး ${counts.supported} · မပံ့ပိုး ${counts.unsupported}`;
  }

  if (counts.requiresSync > 0) {
    return `${counts.total} Total · ${counts.supported} Supported · ${counts.requiresSync} Pending Sync · ${counts.unsupported} Unsupported`;
  }
  return `${counts.total} Total · ${counts.supported} Supported · ${counts.unsupported} Unsupported`;
}

/**
 * Builds the runtime map of { [ProductCategory]: kalodataCategoryId } for verified/synced categories ONLY.
 */
export function buildResolvedCategoryIdMap(
  syncedCache?: SyncedKalodataCategoryCache | null
): Partial<Record<ProductCategory, string>> {
  const map: Partial<Record<ProductCategory, string>> = {};
  for (const entry of getEffectiveCategoryCatalog(syncedCache)) {
    if (entry.selectable && entry.kalodataId) {
      map[entry.id] = entry.kalodataId;
    }
  }
  return map;
}

export function getSelectableCategories(
  syncedCache?: SyncedKalodataCategoryCache | null
): ProductCategory[] {
  return getEffectiveCategoryCatalog(syncedCache)
    .filter((entry) => entry.selectable)
    .map((entry) => entry.id);
}
