import type {
  DeepDiveAnalysisDefinition,
  DeepDiveAnalysisId,
  DeepDiveAnalysisSlotState,
  DeepDiveOriginView,
  DeepDiveSourceContext,
  DeepDiveWorkspaceState,
} from '../types/deepDive';
import type { ResearchMode, ResearchProduct } from '../types/product';
import { getCanonicalProductId } from './scoring';

/**
 * Canonical registry of the 8 independent Deep Dive analysis modules (Phase 9.1 Foundation).
 * All 8 modules have independent identities, concise default summaries, and full 6-part
 * Progressive Disclosure documentation in both English and Burmese.
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
      'Low credit impact — reuses already-fetched product data first; optional Product Detail lookup uses ~0.1 credit only if needed (Phase 9.2). No credits are spent in Phase 9.1.',
    estimatedCostNoteMy:
      'Credit ကုန်ကျစရိတ်နည်းသည် — ရှိပြီးသား Product Data ကို အရင်ပြန်သုံးပြီး လိုအပ်မှသာ Product Detail API (~0.1 cr) ခေါ်မည် (Phase 9.2)။ Phase 9.1 တွင် Credit လုံးဝ မကုန်ပါ။',
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
      'Kalodata Product Rank & Product Detail metrics + Product Trend API (if daily/weekly breakdown is requested in Phase 9.2).',
    requiredDataSourcesMy:
      'Kalodata Product Rank နှင့် Product Detail Data + Product Trend API (Phase 9.2 တွင် အချိန်အလိုက် Trend လိုအပ်ပါက)။',
    estimatedCostNoteEn:
      'Low to moderate credit impact — baseline 7-day sales & revenue come from existing research data; historical trend queries may use additional credits in Phase 9.2. Zero credits used in Phase 9.1.',
    estimatedCostNoteMy:
      'Credit ကုန်ကျစရိတ် နည်းမှအလယ်အလတ် — ၇ ရက် ရောင်းအား/ဝင်ငွေကို ရှိပြီးသား Data မှ ယူနိုင်ပြီး အချိန်အလိုက် Trend API အတွက် Phase 9.2 တွင် Credit အနည်းငယ် ထပ်ကုန်နိုင်သည်။ Phase 9.1 တွင် Credit မကုန်ပါ။',
    costSensitivity: 'low',
    missingDataBehaviorEn:
      'If Daily / Weekly / Monthly trend series are not returned by the API, the report explicitly states trend data is unavailable rather than interpolating fake charts.',
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
      'Existing verified price & commission rate + optional Kalodata Product Detail API for promotion/SKU price range (Phase 9.2).',
    requiredDataSourcesMy:
      'ရှိပြီးသား တရားဝင်ဈေးနှုန်းနှင့် ကော်မရှင်နှုန်း + လိုအပ်ပါက Promotion/SKU ဈေးအတွက် Product Detail API (Phase 9.2)။',
    estimatedCostNoteEn:
      'Lowest credit impact — core profit calculations run locally from existing verified price & commission data with zero extra API calls when already present. Zero credits used in Phase 9.1.',
    estimatedCostNoteMy:
      'Credit ကုန်ကျစရိတ် အနည်းဆုံး — ဈေးနှုန်းနှင့် ကော်မရှင် Data ရှိပြီးသားဖြစ်ပါက API ထပ်မခေါ်ဘဲ Local တွင် တွက်ချက်နိုင်သည်။ Phase 9.1 တွင် Credit လုံးဝ မကုန်ပါ။',
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
      'Existing creator count metric + Kalodata Product Creators / Creator Rank API (Phase 9.2).',
    requiredDataSourcesMy:
      'ရှိပြီးသား Creator အရေအတွက် + Kalodata Product Creators / Creator Rank API (Phase 9.2)။',
    estimatedCostNoteEn:
      'Moderate credit impact — fetching top creator lists and sales shares requires dedicated Creator API query in Phase 9.2 (~0.1–0.3 cr). Zero credits used in Phase 9.1.',
    estimatedCostNoteMy:
      'Credit ကုန်ကျစရိတ် အလယ်အလတ် — ထိပ်တန်း Creator စာရင်းနှင့် ရောင်းအားဝေစုအတွက် Phase 9.2 တွင် Creator API (~0.1–0.3 cr) ခေါ်ရန်လိုအပ်နိုင်သည်။ Phase 9.1 တွင် Credit မကုန်ပါ။',
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
      'Existing matched video signals (from Video-First discovery if present) + Kalodata Product Video Rank API (Phase 9.2).',
    requiredDataSourcesMy:
      'ရှိပြီးသား Myanmar Video Signal များ + Kalodata Product Video Rank API (Phase 9.2)။',
    estimatedCostNoteEn:
      'Moderate credit impact — querying product-linked videos typically uses ~0.1–0.2 credits per product in Phase 9.2. Zero credits used in Phase 9.1.',
    estimatedCostNoteMy:
      'Credit ကုန်ကျစရိတ် အလယ်အလတ် — Product နှင့်ချိတ်ထားသော Video များရယူရန် Phase 9.2 တွင် ~0.1–0.2 cr ခန့် ကုန်ကျနိုင်သည်။ Phase 9.1 တွင် Credit မကုန်ပါ။',
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
      'Kalodata Product Review / Comment API — strictly opt-in and only invoked when the user explicitly selects this option in Phase 9.2.',
    requiredDataSourcesMy:
      'Kalodata Product Review / Comment API — အသုံးပြုသူက ဤ Option ကို ကိုယ်တိုင်ရွေးချယ်မှသာ Phase 9.2 တွင် ခေါ်ယူမည်ဖြစ်သည်။',
    estimatedCostNoteEn:
      'High credit sensitivity (Opt-In Only) — Review API calls cost significantly more (~1.0 cr/request). This option will NEVER run automatically; API calls happen only if you explicitly select it in Phase 9.2. Zero credits used in Phase 9.1.',
    estimatedCostNoteMy:
      'ကုန်ကျစရိတ်မြင့်နိုင်သည် (ကိုယ်တိုင်ရွေးမှသာ ခေါ်မည်) — Review API သည် Credit ကုန်ကျစရိတ်များနိုင်သောကြောင့် (~1.0 cr) ဤ Option ကို ရွေးချယ်မှသာ Phase 9.2 တွင် ခေါ်မည်ဖြစ်သည်။ Phase 9.1 တွင် Credit လုံးဝ မကုန်ပါ။',
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
      'Same-category peer products from current research session + optional Kalodata category peer lookup (Phase 9.2).',
    requiredDataSourcesMy:
      'လက်ရှိ Research Session ရှိ Category တူ Product များ + လိုအပ်ပါက Kalodata Category Peer API (Phase 9.2)။',
    estimatedCostNoteEn:
      'Low to moderate credit impact — compares against already-fetched peer products first (0 cr) and only fetches extra competitors if explicitly requested in Phase 9.2. Zero credits used in Phase 9.1.',
    estimatedCostNoteMy:
      'Credit ကုန်ကျစရိတ် နည်းမှအလယ်အလတ် — ရှိပြီးသား Category တူ Product များဖြင့် အရင်နှိုင်းယှဉ်ပြီး (0 cr) ထပ်မံရှာဖွေရန်လိုမှသာ Phase 9.2 တွင် Credit သုံးမည်။ Phase 9.1 တွင် Credit မကုန်ပါ။',
    costSensitivity: 'moderate',
    missingDataBehaviorEn:
      'If fewer than 2 comparable peer products or specific competitor metrics are unavailable, comparisons are limited strictly to verified fields and gaps are disclosed.',
    missingDataBehaviorMy:
      'နှိုင်းယှဉ်ရန် အလားတူ Product မလုံလောက်ပါက သို့မဟုတ် Data မပြည့်စုံပါက အတည်ပြုပြီး Data များကိုသာ နှိုင်းယှဉ်ပြီး မရှိသည့်အချက်များကို ရှင်းပြပါမည်။',
  },
  {
    id: 'ai-strategic-recommendation',
    order: 8,
    nameEn: 'AI Strategic Recommendation',
    nameMy: 'AI Strategic Recommendation (AI ဗျူဟာအကြံပြုချက်)',
    shortDescriptionEn: 'Synthesize verified data into opportunity score context, risks, audience, video ideas, and go/no-go advice.',
    shortDescriptionMy: 'ရရှိထားသော Data များကို ပေါင်းစပ်ပြီး Opportunity Score၊ Risks၊ Target Audience၊ Video Ideas နှင့် လုပ်သင့်/မလုပ်သင့် အကြံပြုရန်။',
    whatItDoesEn:
      'Synthesizes all available verified product and Deep Dive findings into a practical affiliate go-to-market plan with clear go/no-go guidance.',
    whatItDoesMy:
      'ရရှိထားသော တကယ့် Product Data နှင့် Deep Dive အချက်အလက်များကို ပေါင်းစပ်၍ လက်တွေ့အသုံးချနိုင်မည့် Affiliate Marketing ဗျူဟာနှင့် လုပ်သင့်/မလုပ်သင့် အကြံပြုချက် ထုတ်ပေးပါသည်။',
    whatItChecksEn: [
      'Product Opportunity Score Context',
      'Product Strengths / Weaknesses',
      'Potential Risks',
      'Target Audience',
      'Video Content Ideas',
      'Affiliate Marketing Strategy',
      'Go / No-Go Recommendation',
    ],
    whatItChecksMy: [
      'Product Opportunity Score',
      'Product အားသာချက် / အားနည်းချက်',
      'Potential Risks (ဖြစ်နိုင်ခြေရှိသော အန္တရာယ်များ)',
      'Target Audience (ပစ်မှတ်ဝယ်သူအုပ်စု)',
      'Video Content Ideas (ဗီဒီယိုအကြံဉာဏ်များ)',
      'Affiliate Marketing Strategy (Affiliate ဗျူဟာ)',
      'လုပ်သင့်၊ မလုပ်သင့် အကြံပြုချက်',
    ],
    expectedOutcomeEn:
      'An actionable affiliate launch strategy grounded strictly in verified metrics—never fabricated assumptions.',
    expectedOutcomeMy:
      'Affiliate လုပ်ငန်းအတွက် လက်တွေ့အသုံးချနိုင်မည့် ရှင်းလင်းသော Strategy နှင့် ဆုံးဖြတ်ချက်အကြံပြုချက် ရရှိမည်ဖြစ်သည်။',
    requiredDataSourcesEn:
      'Verified product metrics + results from any other selected Deep Dive modules + Gemini AI analysis endpoint (Phase 9.2).',
    requiredDataSourcesMy:
      'အတည်ပြုပြီး Product Data + အခြားရွေးချယ်ထားသော Deep Dive ရလဒ်များ + Gemini AI Analysis Endpoint (Phase 9.2)။',
    estimatedCostNoteEn:
      'Uses 0 Kalodata credits (relies on already-fetched data) and 1 Gemini AI call when executed in Phase 9.2. Zero API calls or credits are used in Phase 9.1.',
    estimatedCostNoteMy:
      'Kalodata Credit 0 cr (ရှိပြီးသား Data ကိုသာ အသုံးပြုသည်) ဖြစ်ပြီး Phase 9.2 တွင် Gemini AI Call ၁ ကြိမ်သာ သုံးမည်။ Phase 9.1 တွင် မည်သည့် API မျှ မခေါ်ပါ။',
    costSensitivity: 'low',
    missingDataBehaviorEn:
      'AI strictly NEVER fabricates missing metrics. Whenever inputs (e.g., reviews, videos, or creator shares) are incomplete, AI explicitly explains those data limitations and lowers confidence accordingly.',
    missingDataBehaviorMy:
      'AI သည် မရှိသော Data ကို လုံးဝ ဖန်တီးမပြပါ။ အချက်အလက်မပြည့်စုံပါက ထိုအပေါ်အခြေခံ၍ ကန့်သတ်ချက်များကို ပွင့်လင်းရှင်းလင်းစွာ ရှင်းပြပေးပါမည်။',
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
      status: 'not-implemented',
      updatedAt: null,
      result: null,
      statusNoteEn: 'Not Implemented Yet — Execution engine will be connected in Phase 9.2.',
      statusNoteMy: 'မလုပ်ဆောင်ရသေးပါ (Not Implemented Yet) — Phase 9.2 တွင် Analysis Engine ချိတ်ဆက်မည်ဖြစ်သည်။',
    };
  }
  return slots;
}

/**
 * Initial per-product Deep Dive workspace state:
 * - Zero options pre-selected (strict manual opt-in)
 * - All 8 Progressive Disclosure panels collapsed by default
 * - 8 strictly isolated per-analysis execution slots
 */
export function createInitialDeepDiveWorkspaceState(): DeepDiveWorkspaceState {
  return {
    selectedIds: [],
    expandedIds: [],
    slots: createInitialDeepDiveSlots(),
    lastAttemptedRunIds: [],
    lastAttemptedRunAt: null,
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
