import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import type { ResearchProduct } from '../src/types/product.ts';
import type { DeepDiveVideoCreativeBlueprint } from '../src/types/deepDive.ts';
import {
  ALL_DEEP_DIVE_ANALYSIS_IDS,
  buildDeepDiveTargetContext,
  buildSmartVideoCreativeTemplates,
  createInitialDeepDiveWorkspaceState,
  DEEP_DIVE_ANALYSIS_OPTIONS,
  DEFAULT_DEEP_DIVE_VIDEO_CREATIVE_OPTIONS,
  getDeepDiveOptionById,
  isSmartVideoCreativeTemplateActive,
  normalizeDeepDiveVideoCreativeOptions,
} from '../src/utils/deepDiveRegistry.ts';
import {
  estimateDeepDiveExecutionCost,
  runDeepDiveModules,
  type DeepDiveCacheSnapshot,
} from '../src/utils/deepDiveEngine.ts';
import {
  buildDeepDiveFinalReport,
  buildDeepDiveReportMarkdown,
} from '../src/utils/deepDiveReportBuilder.ts';
import {
  createDeepDiveHistoryRecord,
  hydrateWorkspaceStateFromHistory,
} from '../src/utils/deepDiveHistoryStorage.ts';
import {
  validateDeepDiveStrategyJson,
  buildDeepDiveAiPrompt,
} from '../server/deepDiveAiService.ts';
import {
  buildDeepDiveVideoCreativePrompt,
  clearDeepDiveVideoCreativeCache,
  DeepDiveVideoCreativeApiError,
  generateDeepDiveVideoCreativeBlueprint,
  VIDEO_CREATIVE_COMPETITOR_SCAN_CREDITS,
} from '../server/deepDiveVideoCreativeService.ts';
import { PersistentBudgetLedger } from '../server/budgetLedgerService.ts';
import { evaluateProductOpportunity } from '../src/utils/scoring.ts';

function makeProduct(overrides: Partial<ResearchProduct> = {}): ResearchProduct {
  return {
    id: 'kalodata-th-1731661332013680750',
    name: '[1แถม2] วิตามินซี อเซโรล่า เชอร์รี่ Vitamin C ACEROLA CHERRY ตรา inzent',
    nameMy: '[1แถม2] Vitamin C Acerola Cherry ตรา inzent',
    category: 'health-personal-care',
    subCategory: 'Vitamins & Supplements',
    subCategoryMy: 'ဗီတာမင်နှင့် ဖြည့်စွက်စာ',
    priceThb: 139,
    commissionRate: 10,
    commissionVerified: true,
    estimatedCommissionPerSaleThb: 13.9,
    commissionNoteEn: '10% verified affiliate commission',
    commissionNoteMy: '10% တရားဝင်ကော်မရှင်',
    shopName: 'DR.SURAPOL SHOP',
    dispatchHub: 'Bangkok',
    imageUrl: null,
    imageVerified: false,
    imageSourceNoteEn: 'Test fixture',
    imageSourceNoteMy: 'စမ်းသပ်ဒေတာ',
    demandEvidenceEn: ['42,177 units sold (last7Day)'],
    demandEvidenceMy: ['၇ ရက်အတွင်း 42,177 ခု ရောင်းရသည်'],
    opportunityScore: 87,
    competitionLevel: 'High',
    competitionDetailEn: '2,820 creators promoting',
    competitionDetailMy: 'Creator 2,820 ဦး ကြော်ငြာနေသည်',
    customerRating: null,
    reviewCount: 38699,
    demandLevel: 'High',
    aiVideoSuitability: 'High',
    aiVideoDetailEn: 'Strong visual fit for close-up bottle reveal.',
    aiVideoDetailMy: 'အနီးကပ်ပြသရန် သင့်တော်သည်။',
    sellerReliabilityLevel: 'Reliable',
    sellerReliabilityEn: 'Verified TH shop',
    sellerReliabilityMy: 'တရားဝင် ထိုင်းဆိုင်',
    whyChooseEn: 'Explosive 7-day sales volume.',
    whyChooseMy: '၇ ရက်အတွင်း ရောင်းအားမြင့်မားသည်။',
    salesPotentialEn: '42,177 units sold (last7Day).',
    salesPotentialMy: '၇ ရက်အတွင်း 42,177 ခု ရောင်းရသည်။',
    confidenceLevel: 'High',
    confidenceDetailEn: 'Verified Kalodata metrics.',
    confidenceDetailMy: 'Kalodata တကယ့်ဒေတာ။',
    reviewStrengthsEn: ['Affordable 1-get-2 value'],
    reviewStrengthsMy: ['1-Get-2 ဈေးတန်သည်'],
    customerComplaintsEn: ['Check seal before use'],
    customerComplaintsMy: ['ဘူးအဖုံးစစ်ဆေးရန်'],
    generalRisksEn: ['Health supplement ad policy rules'],
    generalRisksMy: ['ကျန်းမာရေးဖြည့်စွက်စာ ကြော်ငြာစည်းကမ်း သတိပြုရန်'],
    missingDataEn: [],
    missingDataMy: [],
    sources: [],
    scoringInputs: {
      demandSales: { rawStrength: 92, verification: 'verified', evidenceEn: '42,177 sold', evidenceMy: '42,177 ခု' },
      commissionEarning: { rawStrength: 62, verification: 'verified', evidenceEn: '10%', evidenceMy: '10%' },
      aiCreative: { rawStrength: 80, verification: 'estimated', evidenceEn: 'Visual bottle', evidenceMy: 'ပုံရိပ်ရှင်း' },
      reviewsQuality: { rawStrength: 75, verification: 'verified', evidenceEn: '38,699 reviews', evidenceMy: 'Review 38,699' },
      priceAppeal: { rawStrength: 88, verification: 'verified', evidenceEn: '฿139', evidenceMy: '฿139' },
      competitionOpportunity: { rawStrength: 40, verification: 'verified', evidenceEn: '2,820 creators', evidenceMy: '2,820 creators' },
      sellerReliability: { rawStrength: 82, verification: 'verified', evidenceEn: 'DR.SURAPOL SHOP', evidenceMy: 'DR.SURAPOL SHOP' },
    },
    videoIdeas: [
      {
        titleEn: 'Bundle Reveal',
        titleMy: 'Bundle ဖွင့်ပြခြင်း',
        formatEn: '15s Demo',
        formatMy: '၁၅ စက္ကန့်',
        outlineEn: 'Show 3 bottles for ฿139.',
        outlineMy: '฿139 ဖြင့် ၃ ဘူးပြသပါ။',
      },
      {
        titleEn: 'Daily Routine',
        titleMy: 'နေ့စဉ်သောက်သုံးမှု',
        formatEn: '30s UGC',
        formatMy: '၃၀ စက္ကန့်',
        outlineEn: 'Morning routine clip.',
        outlineMy: 'မနက်ခင်းပုံမှန်သောက်သုံးမှု။',
      },
      {
        titleEn: 'Value Math',
        titleMy: 'တစ်ဘူးတန်ဖိုးတွက်ပြခြင်း',
        formatEn: '30s Faceless',
        formatMy: '၃၀ စက္ကန့်',
        outlineEn: 'Break down price per bottle.',
        outlineMy: 'တစ်ဘူးကျသင့်ငွေ တွက်ပြပါ။',
      },
    ],
    kalodataMetrics: {
      productId: '1731661332013680750',
      salesVolume: 42177,
      revenueThb: 6289641,
      revenueGrowthRate: 271.3,
      unitPriceThb: 139,
      commissionRatePct: 10,
      creatorNumber: 2820,
      videoNumber: 412,
      videoRevenueThb: 6046726,
      liveRevenueThb: 242616,
      showcaseRevenueThb: 299,
      launchDate: '2025-01-21',
      sellerId: 'shop_surapol',
      sellerName: 'DR.SURAPOL SHOP',
      skuCount: 1,
      priCategory: null,
      secCategory: null,
      terCategory: null,
      categoryIdsRequested: ['601450'],
      dateRange: 'last7Day',
      researchMode: 'fast',
    },
    ...overrides,
  };
}

function makeMockCreativeJson(): string {
  return JSON.stringify({
    competitorTeardownSummaryEn:
      'Top Thailand TikTok Shop videos lead with the 1-get-2 bundle price shock and a quick close-up pour of the cherry capsules.',
    competitorTeardownSummaryMy:
      'ထိုင်း TikTok Shop ရှိ ရောင်းကောင်း Video များသည် 1-Get-2 ဈေးတန်မှုနှင့် ဆေးတောင့်အနီးကပ်ရိုက်ကွက်ကို ပထမ ၃ စက္ကန့်တွင် ပြသကြသည်။',
    winningPatternsEn: [
      'Lead with 1-Get-2 bundle value at ฿139 in the opening 3 seconds',
      'Show physical bottle unsealing and capsule size close-up',
      'Pin yellow basket CTA right when showing price per bottle',
    ],
    winningPatternsMy: [
      'ပထမ ၃ စက္ကန့်တွင် ฿139 ဖြင့် 1แถม2 ဈေးတန်မှုကို ပြောပြခြင်း',
      'ဘူးဖွင့်ပြခြင်းနှင့် ဆေးတောင့်အရွယ်အစား အနီးကပ်ပြသခြင်း',
      'တစ်ဘူးကျသင့်ငွေပြချိန်တွင် တောင်းဝါ (Yellow Basket) ညွှန်ပြခြင်း',
    ],
    creativeGapEn:
      'Most clips only read the promo label; add a clean morning routine comparison showing cost per day.',
    creativeGapMy:
      'အများစုက ပရိုမိုးရှင်းစာသားသာ ဖတ်ပြကြ၍ တစ်နေ့ကျသင့်ငွေ နှိုင်းယှဉ်ပြသည့် Morning Routine ပုံစံဖြင့် ဖောက်ထွက်နိုင်သည်။',
    concepts: [
      {
        id: 'c1',
        titleEn: '1-Get-2 Price Breakdown POV',
        titleMy: '1แถม2 တစ်ဘူးဈေးနှုန်း တွက်ပြ POV',
        formatLabel: 'Price-Value POV',
        angleSummaryEn: 'Unbox all 3 bottles on desk and calculate THB per bottle.',
        angleSummaryMy: 'ဘူး ၃ ဘူးလုံး စားပွဲပေါ်တင်ပြီး တစ်ဘူးဘယ်လောက်ကျသလဲ တွက်ပြခြင်း။',
        whyItConvertsEn: 'Instant visual value shock triggers impulse yellow-basket clicks.',
        whyItConvertsMy: 'ဈေးတန်မှုကို မျက်မြင်ချက်ချင်းမြင်ရသဖြင့် တောင်းဝါနှိပ်ဝယ်နှုန်း မြင့်သည်။',
      },
      {
        id: 'c2',
        titleEn: 'Office Desk Morning Routine',
        titleMy: 'ရုံးစားပွဲ မနက်ခင်း Routine',
        formatLabel: 'UGC Lifestyle',
        angleSummaryEn: 'Natural daily vitamin habit with glass of water after breakfast.',
        angleSummaryMy: 'မနက်စာစားပြီး ရေတစ်ခွက်နှင့် သောက်သုံးသည့် သဘာဝ Lifestyle ရိုက်ကွက်။',
        whyItConvertsEn: 'Feels authentic rather than hard-selling.',
        whyItConvertsMy: 'ကြော်ငြာဆန်မနေဘဲ သဘာဝကျ၍ ယုံကြည်မှုရသည်။',
      },
      {
        id: 'c3',
        titleEn: 'Hands-Only Capsule Close-Up ASMR',
        titleMy: 'မျက်နှာမပြ ဘူးဖွင့် ASMR',
        formatLabel: 'Faceless Hands-Only',
        angleSummaryEn: 'Crisp seal peel, capsule close-up, and clean text callouts.',
        angleSummaryMy: 'ဘူးအဖုံးဖွင့်သံ၊ ဆေးတောင့်အနီးကပ်ပြကွက်နှင့် စာတန်းထိုးရိုးရှင်းစွာ ရိုက်ကူးခြင်း။',
        whyItConvertsEn: 'Fast to shoot without showing face and high watch completion.',
        whyItConvertsMy: 'မျက်နှာပြစရာမလိုဘဲ ရိုက်ကူးရလွယ်ပြီး အဆုံးထိကြည့်နှုန်းကောင်းသည်။',
      },
    ],
    hooks: [
      {
        id: 'h1',
        hookText: 'จ่ายแค่ 139 บาท แต่ได้ถึง 3 กระปุกจริงดิ?!',
        meaningMy: '฿139 တည်းပေးရပြီး ၃ ဘူးတောင်ရတာ တကယ်လား?!',
        visualActionEn: 'Drop 3 bottles onto the table one by one in fast rhythm.',
        visualActionMy: 'ဘူး ၃ ဘူးကို စားပွဲပေါ် တစ်ဘူးချင်း မြန်မြန်ချပြပါ။',
        hookType: 'Price Shock',
      },
      {
        id: 'h2',
        hookText: 'ใครกำลังหาวิตามินซีทานทุกวัน หยุดดูคลิปนี้ก่อน!',
        meaningMy: 'နေ့တိုင်းသောက်ဖို့ Vitamin C ရှာနေသူတွေ ဒီဗီဒီယိုကို အရင်ရပ်ကြည့်ပါ!',
        visualActionEn: 'Hold bottle close to lens then pull back to reveal 1-get-2 pack.',
        visualActionMy: 'ဘူးကို ကင်မရာနားကပ်ပြပြီး 1แถม2 အတွဲကို နောက်ဆုတ်ပြပါ။',
        hookType: 'Audience Callout',
      },
      {
        id: 'h3',
        hookText: 'เปิดให้ดูชัดๆ ข้างในกระปุกวิตามินซีตัวดังเป็นยังไง',
        meaningMy: 'နာမည်ကြီး Vitamin C ဘူးထဲမှာ ဘယ်လိုပုံစံလဲ အနီးကပ်ဖွင့်ပြမယ်',
        visualActionEn: 'Peel foil seal close to microphone for crisp ASMR sound.',
        visualActionMy: 'ဘူးအလုံပိတ်ခွာသံကို မိုက်နားကပ်၍ အသံကြည်လင်စွာ ရိုက်ပါ။',
        hookType: 'Curiosity',
      },
      {
        id: 'h4',
        hookText: 'โปร 1 แถม 2 ตัวนี้หมดไวมาก รีบเช็คตะกร้าก่อนเลย',
        meaningMy: 'ဒီ 1แถม2 ပရိုမိုးရှင်းက ကုန်တာအရမ်းမြန်တယ် တောင်းဝါမှာ အရင်စစ်ကြည့်',
        visualActionEn: 'Point down toward lower-left TikTok Shop yellow basket position.',
        visualActionMy: 'ဘယ်ဘက်အောက်ခြေ TikTok Shop တောင်းဝါနေရာကို လက်ညှိုးထိုးပြပါ။',
        hookType: 'Urgency',
      },
      {
        id: 'h5',
        hookText: 'ตกกระปุกละไม่ถึง 50 บาท คุ้มเกินเรื่อง!',
        meaningMy: 'တစ်ဘူးကို ฿50 တောင်မကျဘူး တကယ်ကိုတန်လွန်းတယ်!',
        visualActionEn: 'Show large bold text overlay "฿139 = 3 ขวด" while tapping bottle.',
        visualActionMy: 'ဖန်သားပြင်ပေါ် "฿139 = 3 ဘူး" စာတန်းကြီးပြပြီး ဘူးကိုလက်နဲ့ထောက်ပြပါ။',
        hookType: 'Value Math',
      },
    ],
    scriptTitle: '1-Get-2 Acerola Cherry Value Hook (30s)',
    scriptScenes: [
      {
        sceneNumber: 1,
        timeRange: '0–3s',
        phaseLabel: 'Hook',
        voiceover: 'จ่ายแค่ 139 บาท แต่ได้วิตามินซีถึง 3 กระปุกจริงดิ?!',
        voiceoverMy: '฿139 တည်းပေးရပြီး Vitamin C ၃ ဘူးတောင်ရတာ တကယ်လား?!',
        onScreenText: '139฿ ได้ 3 กระปุก!!',
        shotDirectionEn: 'Top-down close-up dropping 3 bottles rapidly onto clean desk.',
        shotDirectionMy: 'စားပွဲရှင်းရှင်းပေါ် ဘူး ၃ ဘူးကို အပေါ်စီးမှ မြန်မြန်ချပြရိုက်ကွက်။',
        aiVideoPromptEn:
          'Vertical 9:16 commercial macro shot, warm morning sunlight on clean beige desk, hands placing three red-and-white vitamin C supplement bottles rapidly in center frame, crisp focus, UGC authentic lighting.',
      },
      {
        sceneNumber: 2,
        timeRange: '3–12s',
        phaseLabel: 'Product Demo',
        voiceover: 'ตัวนี้คือวิตามินซี อเซโรล่า เชอร์รี่ ตรา inzent เม็ดทานง่าย พกไปทำงานก็สะดวก',
        voiceoverMy: 'ဒါက inzent တံဆိပ် Acerola Cherry Vitamin C ဖြစ်ပြီး သောက်ရလွယ်ကူသလို ရုံးယူသွားဖို့လည်း အဆင်ပြေတယ်',
        onScreenText: 'อเซโรล่า เชอร์รี่ ตรา inzent',
        shotDirectionEn: 'Unscrew cap, pour 1-2 capsules onto palm in natural daylight.',
        shotDirectionMy: 'အဖုံးဖွင့်ပြီး လက်ဖဝါးပေါ် ဆေးတောင့် ၁-၂ တောင့် ထုတ်ပြရိုက်ကွက်။',
        aiVideoPromptEn:
          'Vertical 9:16 close-up hands opening supplement bottle cap and pouring two capsules gently into palm, soft daylight, sharp depth of field.',
      },
      {
        sceneNumber: 3,
        timeRange: '12–22s',
        phaseLabel: 'Value Proof',
        voiceover: 'ปกติซื้อกระปุกเดียวก็คุ้มแล้ว แต่นี่จัดโปร 1 แถม 2 ตกกระปุกละไม่ถึง 50 บาท',
        voiceoverMy: 'ပုံမှန်တစ်ဘူးတည်းဝယ်ရင်တောင် တန်နေပြီ၊ အခု 1แถม2 ဆိုတော့ တစ်ဘူးကို ฿50 တောင်မကျဘူး',
        onScreenText: 'โปร 1 แถม 2 คุ้มมาก',
        shotDirectionEn: 'Line up all 3 bottles with clean label facing camera.',
        shotDirectionMy: 'ဘူး ၃ ဘူးလုံး တံဆိပ်ရှေ့လှည့်၍ တန်းစီပြရိုက်ကွက်။',
        aiVideoPromptEn:
          'Vertical 9:16 smooth slow push-in on three aligned vitamin supplement bottles with glass of fresh water beside them, bright clean aesthetic.',
      },
      {
        sceneNumber: 4,
        timeRange: '22–30s',
        phaseLabel: 'CTA',
        voiceover: 'ใครอยากตุนไว้ทานเองหรือแบ่งที่บ้าน กดดูโปรในตะกร้าเหลืองซ้ายล่างได้เลยนะ',
        voiceoverMy: 'ကိုယ်တိုင်သောက်ဖို့ဖြစ်ဖြစ် အိမ်သားတွေနဲ့ မျှသောက်ဖို့ဖြစ်ဖြစ် ဘယ်ဘက်အောက်က တောင်းဝါထဲမှာ နှိပ်ဝယ်နိုင်ပါပြီ',
        onScreenText: 'พิกัดตะกร้าเหลือง ↙️',
        shotDirectionEn: 'Hold bottle in one hand and gesture cleanly toward bottom-left yellow basket.',
        shotDirectionMy: 'လက်တစ်ဖက်က ဘူးကိုင်ပြီး ဘယ်ဘက်အောက်ခြေ တောင်းဝါနေရာသို့ လက်ညှိုးညွှန်ပြပါ။',
        aiVideoPromptEn:
          'Vertical 9:16 creator hand holding vitamin bottle neatly in frame, bright warm lighting, clean background leaving lower-left space for TikTok Shop basket.',
      },
    ],
    seoPack: {
      titles: [
        {
          style: 'search-seo',
          labelEn: 'Search SEO Title',
          labelMy: 'TikTok Search SEO Title',
          titleText: 'รีวิว วิตามินซี อเซโรล่า เชอร์รี่ ตรา inzent โปร 1 แถม 2 คุ้มไหม?',
          meaningMy: 'inzent Acerola Cherry Vitamin C 1แถม2 ပရိုမိုးရှင်း တန်ရဲ့လား Review',
        },
        {
          style: 'curiosity-hook',
          labelEn: 'Curiosity Hook Title',
          labelMy: 'စပ်စုချင်စိတ်ဆွဲ Title',
          titleText: '139 บาท ได้ 3 กระปุกจริงเหรอ?! แกะกล่องวิตามินซีตัวดังให้ดูชัดๆ',
          meaningMy: '฿139 နဲ့ ၃ ဘူးတကယ်ရတာလား?! နာမည်ကြီး Vitamin C ဘူးဖွင့်ပြမယ်',
        },
        {
          style: 'direct-sell',
          labelEn: 'Direct-Sell Promo Title',
          labelMy: 'တိုက်ရိုက်ရောင်း Promo Title',
          titleText: 'โปรแรง 1 แถม 2 วิตามินซี อเซโรล่า เชอร์รี่ ตกกระปุกละไม่ถึง 50 บาท พิกัดตะกร้าเหลือง',
          meaningMy: '1แถม2 ပရိုမိုးရှင်း Acerola Cherry Vitamin C တစ်ဘူး ฿50 မပြည့် — တောင်းဝါထဲမှာ',
        },
      ],
      searchKeywords: [
        'วิตามินซี อเซโรล่า เชอร์รี่',
        'วิตามินซี inzent รีวิว',
        'วิตามินซี 1 แถม 2',
        'วิตามินซี ราคาถูก tiktok',
        'อเซโรล่า เชอร์รี่ ตรา inzent',
        'วิตามินซีทานทุกวัน',
      ],
      hashtagsBroad: ['#รีวิวTikTok', '#ของดีบอกต่อ'],
      hashtagsNiche: ['#วิตามินซี', '#อเซโรล่าเชอร์รี่', '#วิตามินซีinzent'],
      hashtagsBuyerIntent: ['#โปร1แถม2', '#พิกัดตะกร้าเหลือง'],
      captionTemplate:
        'จ่ายแค่ 139฿ ได้วิตามินซี อเซโรล่า เชอร์รี่ ตรา inzent ถึง 3 กระปุก 🍒 คุ้มมาก พิกัดตะกร้าเหลืองซ้ายล่างเลย!\n#วิตามินซี #อเซโรล่าเชอร์รี่ #โปร1แถม2 #ของดีบอกต่อ #พิกัดตะกร้าเหลือง',
    },
    policyGuards: [
      {
        riskyClaim: 'รักษาโรคหวัดหายขาด 100% / ขาวใสใน 3 วัน',
        reasonEn: 'Medical cure claims and guaranteed rapid whitening violate TikTok Shop Thailand supplement ad policies.',
        reasonMy: 'ရောဂါပျောက်ကင်းစေသည် သို့မဟုတ် ၃ ရက်အတွင်း အသားဖြူသည်ဟု အာမခံပြောဆိုခြင်းသည် TikTok Shop ကြော်ငြာစည်းကမ်း ချိုးဖောက်ပြီး အကောင့်ပိတ်ခံရနိုင်သည်။',
        safeAlternative: 'วิตามินซีสำหรับทานเสริมประจำวัน คุ้มค่าด้วยโปร 1 แถม 2',
      },
      {
        riskyClaim: 'การันตีเห็นผลทุกคน ไม่มีผลข้างเคียง 100%',
        reasonEn: 'Absolute guarantees are flagged as exaggerated claims by TikTok Shop moderation.',
        reasonMy: 'လူတိုင်း 100% အာမခံရလဒ်ရသည်ဟု ပြောဆိုခြင်းသည် ချဲ့ကားပြောဆိုမှုအဖြစ် Flag ပြခံရနိုင်သည်။',
        safeAlternative: 'ทานง่าย เหมาะสำหรับคนอยากดูแลตัวเองทุกวัน (ผลลัพธ์ขึ้นอยู่กับแต่ละบุคคล)',
      },
    ],
    dataLimitationsEn: ['No TikTok Shop star rating available in Kalodata baseline payload.'],
    dataLimitationsMy: ['Kalodata အခြေခံ Data တွင် 5-Star Rating မပါဝင်ပါ။'],
  });
}

test('Registry enforces strict separation: 9 modules, 08 has no Video Ideas, 09 is AI Ad Video Creative Studio', () => {
  assert.equal(DEEP_DIVE_ANALYSIS_OPTIONS.length, 9);
  assert.equal(ALL_DEEP_DIVE_ANALYSIS_IDS.length, 9);

  const mod8 = getDeepDiveOptionById('ai-strategic-recommendation');
  const mod9 = getDeepDiveOptionById('ad-video-creative-blueprint');

  assert.ok(mod8);
  assert.ok(mod9);
  assert.equal(mod8.order, 8);
  assert.equal(mod9.order, 9);

  // Module 08 must NOT include Video Content Ideas anymore
  assert.equal(
    mod8.whatItChecksEn.some((item) => /video content ideas/i.test(item)),
    false
  );
  assert.equal(
    mod8.whatItChecksMy.some((item) => /ဗီဒီယိုအကြံဉာဏ်/.test(item)),
    false
  );

  // Module 09 has full 6-part disclosure and defaults to includeCompetitorVideos: false (0 cr)
  assert.ok(mod9.whatItDoesEn.length > 20);
  assert.ok(mod9.whatItDoesMy.length > 20);
  assert.ok(mod9.whatItChecksEn.length >= 5);
  assert.ok(mod9.missingDataBehaviorEn.length > 20);
  assert.equal(DEFAULT_DEEP_DIVE_VIDEO_CREATIVE_OPTIONS.includeCompetitorVideos, false);

  const initState = createInitialDeepDiveWorkspaceState();
  assert.equal(initState.selectedIds.length, 0);
  assert.equal(Object.keys(initState.slots).length, 9);
  assert.equal(initState.videoCreativeOptions?.includeCompetitorVideos, false);
});

test('Module 08 server strategy validator & prompt cleanly exclude videoIdeasEn/My', () => {
  const product = makeProduct();
  const evaluation = evaluateProductOpportunity(product, { salesWeightPct: 50 });
  const prompt = buildDeepDiveAiPrompt(product, evaluation, []);

  assert.match(prompt, /Module #09/);
  assert.equal(/videoIdeasEn/.test(prompt), false);

  const valid08Json = JSON.stringify({
    verdict: 'test-with-caution',
    headlineEn: 'High velocity supplement with steep creator competition',
    headlineMy: 'ရောင်းအားမြင့်သော်လည်း Creator ပြိုင်ဆိုင်မှုများသော Supplement',
    summaryEn: 'Strong 7-day sales velocity at 10% commission, but 2,820 active creators.',
    summaryMy: '၇ ရက်ရောင်းအားကောင်းပြီး ကော်မရှင် 10% ရှိသော်လည်း Creator 2,820 ဦး ပြိုင်နေသည်။',
    strengthsEn: ['42,177 units sold in 7 days'],
    strengthsMy: ['၇ ရက်အတွင်း 42,177 ခု ရောင်းထွက်သည်'],
    weaknessesEn: ['2,820 competing creators'],
    weaknessesMy: ['ပြိုင်ဘက် Creator 2,820 ဦးရှိသည်'],
    risksEn: ['Strict health supplement ad policies'],
    risksMy: ['ဖြည့်စွက်စာ ကြော်ငြာစည်းကမ်း တင်းကျပ်သည်'],
    targetAudienceEn: 'Value-conscious Thai office workers seeking daily vitamin C',
    targetAudienceMy: 'နေ့စဉ် Vitamin C သောက်လိုသော ဈေးတန်ရှာ ဝန်ထမ်းများ',
    affiliateStrategyEn: 'Focus on Video channel (96% of GMV) with bundle value positioning.',
    affiliateStrategyMy: 'GMV 96% ရနေသော Video Channel ကို ဦးစားပေးပြီး Bundle တန်ဖိုးဖြင့် ရောင်းချပါ။',
    goNoGoReasonEn: 'Test with caution using differentiated creative angles.',
    goNoGoReasonMy: 'ထူးခြားသော Angle ဖြင့် သတိထားစမ်းသပ်သင့်သည်။',
    dataLimitationsEn: ['Customer ratings unavailable in baseline data.'],
    dataLimitationsMy: ['Customer Rating မရရှိနိုင်သေးပါ။'],
  });

  const validated = validateDeepDiveStrategyJson(valid08Json, 'gemini-3.1-flash-lite', []);
  assert.ok(validated);
  assert.equal(validated.videoIdeasEn, undefined);
  assert.equal(validated.videoIdeasMy, undefined);
});

test('Cost estimator for Module 09 accurately toggles between 0 cr (OFF) and 0.1 cr (ON) + 1 Gemini AI call', () => {
  const product = makeProduct();
  const emptyCache: DeepDiveCacheSnapshot = {
    productDetail: null,
    shopDetail: null,
    reviewInsight: null,
  };

  const estOff = estimateDeepDiveExecutionCost(product, ['ad-video-creative-blueprint'], {
    cacheSnapshot: emptyCache,
    videoCreativeOptions: { includeCompetitorVideos: false },
  });
  assert.equal(estOff.plannedKalodataApiCalls, 0);
  assert.equal(estOff.estimatedCredits, 0);
  assert.equal(estOff.plannedGeminiCalls, 1);
  assert.equal(estOff.hasSeparateAiBilling, true);
  assert.equal(estOff.requiresExplicitConfirmation, true);

  const estOn = estimateDeepDiveExecutionCost(product, ['ad-video-creative-blueprint'], {
    cacheSnapshot: emptyCache,
    videoCreativeOptions: { includeCompetitorVideos: true },
  });
  assert.equal(estOn.plannedKalodataApiCalls, 1);
  assert.equal(estOn.estimatedCredits, VIDEO_CREATIVE_COMPETITOR_SCAN_CREDITS);
  assert.equal(estOn.plannedGeminiCalls, 1);
  assert.equal(estOn.hasSeparateAiBilling, true);
  assert.equal(estOn.requiresExplicitConfirmation, true);
  assert.ok(estOn.deduplicatedLayers.includes('videoRank'));
});

test('Server service Module 09 enforces confirmation, runs 0-credit default, and runs fail-closed +0.1 cr cached competitor scan', async () => {
  clearDeepDiveVideoCreativeCache();
  const product = makeProduct();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'siampick-vc-ledger-'));
  const ledgerPath = path.join(tmpDir, 'budget.sqlite');
  const ledger = new PersistentBudgetLedger({ sqlitePath: ledgerPath });

  try {
    // 1. Confirmation gate enforced
    await assert.rejects(
      () =>
        generateDeepDiveVideoCreativeBlueprint({
          product,
          userConfirmedPaidExecution: false,
          options: { includeCompetitorVideos: false },
          testOverrides: {
            budgetLedger: ledger,
            budgetScopeKey: 'test-scope-vc',
            generateCreativeJson: async () => ({
              rawText: makeMockCreativeJson(),
              modelUsed: 'gemini-4-hydrogen',
            }),
          },
        }),
      (err: unknown) =>
        err instanceof DeepDiveVideoCreativeApiError && err.code === 'CONFIRMATION_REQUIRED'
    );

    // 2. Default mode (includeCompetitorVideos: false) -> 0 Kalodata calls, 0 cr, 1 Gemini call
    let videoRankCalls = 0;
    const resZeroCr = await generateDeepDiveVideoCreativeBlueprint({
      product,
      userConfirmedPaidExecution: true,
      options: {
        includeCompetitorVideos: false,
        scriptLanguage: 'th-with-my',
        videoStyle: 'ai-video',
        duration: '30s',
      },
      testOverrides: {
        budgetLedger: ledger,
        budgetScopeKey: 'test-scope-vc',
        fetchVideoRank: async () => {
          videoRankCalls += 1;
          return { ok: true, httpStatus: 200, items: [] };
        },
        generateCreativeJson: async () => ({
          rawText: makeMockCreativeJson(),
          modelUsed: 'gemini-4-hydrogen',
          tokenUsage: {
            promptTokens: 800,
            outputTokens: 1200,
            totalTokens: 2000,
            pricingStatus: 'unavailable',
            costNoteEn: 'Gemini API',
            costNoteMy: 'Gemini API',
          },
        }),
      },
    });
    assert.equal(videoRankCalls, 0);
    assert.equal(resZeroCr.kalodataApiCallsMade, 0);
    assert.equal(resZeroCr.kalodataCreditsUsed, 0);
    assert.equal(resZeroCr.blueprint.competitorScanStatus, 'skipped-zero-credit');
    assert.equal(resZeroCr.blueprint.competitorVideos.length, 0);
    assert.equal(resZeroCr.blueprint.concepts.length, 3);
    assert.equal(resZeroCr.blueprint.hooks.length, 5);
    assert.equal(resZeroCr.blueprint.scriptScenes.length, 4);

    // 3. Competitor Scan ON -> 1 Kalodata video/rank call (+0.1 cr settled in ledger)
    const resScan = await generateDeepDiveVideoCreativeBlueprint({
      product,
      userConfirmedPaidExecution: true,
      spendingLimitCredits: 1.0,
      options: {
        includeCompetitorVideos: true,
        scriptLanguage: 'th-with-my',
        videoStyle: 'ugc-face',
        duration: '30s',
      },
      testOverrides: {
        budgetLedger: ledger,
        budgetScopeKey: 'test-scope-vc',
        fetchCreditBalance: async () => ({ ok: true, balance: 5.0 }),
        fetchVideoRank: async () => {
          videoRankCalls += 1;
          return {
            ok: true,
            httpStatus: 200,
            items: [
              {
                video_id: '7441234567890123456',
                video_description: '139 บาท ได้ 3 กระปุก วิตามินซี #วิตามินซี #โปร1แถม2',
                creator_handle: 'thai_creator_1',
                revenue: 425000,
                sales_volume: 3050,
                views: 580000,
                duration: 28,
              },
            ],
          };
        },
        generateCreativeJson: async ({ competitorVideos }) => {
          assert.equal(competitorVideos.length, 1);
          assert.equal(competitorVideos[0].videoId, '7441234567890123456');
          assert.equal(competitorVideos[0].durationSec, 28);
          assert.ok(competitorVideos[0].hashtags.includes('#วิตามินซี'));
          return {
            rawText: makeMockCreativeJson(),
            modelUsed: 'gemini-4-hydrogen',
          };
        },
      },
    });
    assert.equal(videoRankCalls, 1);
    assert.equal(resScan.kalodataApiCallsMade, 1);
    assert.equal(resScan.kalodataCreditsUsed, 0.1);
    assert.equal(resScan.reusedCompetitorCache, false);
    assert.equal(resScan.blueprint.competitorScanStatus, 'scanned');
    assert.equal(resScan.blueprint.competitorVideos.length, 1);
    assert.equal(resScan.budgetSnapshot?.spentCredits, 0.1);

    // 4. Repeat Competitor Scan within 24h -> 0 Kalodata calls, 0 cr (24h cache hit!)
    const resCached = await generateDeepDiveVideoCreativeBlueprint({
      product,
      userConfirmedPaidExecution: true,
      spendingLimitCredits: 1.0,
      options: {
        includeCompetitorVideos: true,
        scriptLanguage: 'my',
        videoStyle: 'faceless-hands',
        duration: '15s',
      },
      testOverrides: {
        budgetLedger: ledger,
        budgetScopeKey: 'test-scope-vc',
        fetchVideoRank: async () => {
          videoRankCalls += 1;
          return { ok: true, httpStatus: 200, items: [] };
        },
        generateCreativeJson: async () => ({
          rawText: makeMockCreativeJson(),
          modelUsed: 'gemini-4-hydrogen',
        }),
      },
    });
    assert.equal(videoRankCalls, 1); // Did NOT call Kalodata again!
    assert.equal(resCached.kalodataApiCallsMade, 0);
    assert.equal(resCached.kalodataCreditsUsed, 0);
    assert.equal(resCached.reusedCompetitorCache, true);
    assert.equal(resCached.blueprint.competitorVideos.length, 1);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('End-to-end Deep Dive engine runs 08 + 09 together cleanly, populates 9-section Final Report & History', async () => {
  const product = makeProduct();
  const parsedBp = JSON.parse(makeMockCreativeJson());
  const mockBlueprint: DeepDiveVideoCreativeBlueprint = {
    ...parsedBp,
    optionsUsed: {
      includeCompetitorVideos: false,
      scriptLanguage: 'th-with-my',
      videoStyle: 'ugc-face',
      duration: '30s',
    },
    competitorScanStatus: 'skipped-zero-credit',
    competitorKeywordUsed: null,
    competitorVideos: [],
    modelUsed: 'gemini-4-hydrogen',
    usedProductImage: false,
    modulesReferenced: ['affiliate-profit-analysis'],
    generatedAt: '2026-11-22T06:00:00.000Z',
    tokenUsage: {
      promptTokens: 500,
      outputTokens: 900,
      totalTokens: 1400,
      pricingStatus: 'unavailable',
      costNoteEn: 'Gemini API',
      costNoteMy: 'Gemini API',
    },
  };

  const outcome = await runDeepDiveModules({
    product,
    analysisIds: [
      'affiliate-profit-analysis',
      'ai-strategic-recommendation',
      'ad-video-creative-blueprint',
    ],
    requireExplicitConfirmation: true,
    userConfirmedPaidExecution: true,
    videoCreativeOptions: {
      includeCompetitorVideos: false,
      scriptLanguage: 'th-with-my',
      videoStyle: 'ugc-face',
      duration: '30s',
    },
    deps: {
      getCacheFn: () => ({ productDetail: null, shopDetail: null, reviewInsight: null }),
      runAiStrategyFn: async () => ({
        ok: true,
        strategy: {
          verdict: 'priority-test',
          headlineEn: 'Go — Strong volume and high video conversion share',
          headlineMy: 'လုပ်သင့်သည် — ရောင်းအားမြင့်ပြီး Video Channel အားကောင်း',
          summaryEn: 'Verified 96% Video GMV share with 10% commission.',
          summaryMy: 'Video GMV 96% ရှိပြီး ကော်မရှင် 10% ဖြစ်သည်။',
          strengthsEn: ['High 7-day sales velocity'],
          strengthsMy: ['၇ ရက်ရောင်းအား အလွန်ကောင်းသည်'],
          weaknessesEn: ['High creator count'],
          weaknessesMy: ['Creator အရေအတွက် များသည်'],
          risksEn: ['Supplement compliance rules'],
          risksMy: ['ဖြည့်စွက်စာ စည်းကမ်းချက်'],
          targetAudienceEn: 'Thai office buyers looking for daily vitamin C',
          targetAudienceMy: 'နေ့စဉ် Vitamin C ဝယ်သူများ',
          affiliateStrategyEn: 'Prioritize short-form video channel over Live.',
          affiliateStrategyMy: 'Live ထက် Video Channel ကို ဦးစားပေးပါ။',
          goNoGoReasonEn: 'Go with differentiated creative angle via Module #09.',
          goNoGoReasonMy: 'Module #09 မှ Video Creative ဖြင့် စတင်စမ်းသပ်သင့်သည်။',
          dataLimitationsEn: ['No star ratings returned.'],
          dataLimitationsMy: ['Star Rating မပါဝင်ပါ။'],
          modelUsed: 'gemini-3.1-flash-lite',
          modulesSynthesized: ['affiliate-profit-analysis'],
          generatedAt: '2026-11-22T06:00:00.000Z',
          tokenUsage: {
            promptTokens: 300,
            outputTokens: 300,
            totalTokens: 600,
            pricingStatus: 'unavailable',
            costNoteEn: 'Gemini API',
            costNoteMy: 'Gemini API',
          },
        },
      }),
      runVideoCreativeFn: async () => ({
        ok: true,
        blueprint: mockBlueprint,
        kalodataApiCallsMade: 0,
        kalodataCreditsUsed: 0,
        reusedCompetitorCache: false,
        aiApiCallsMade: 1,
      }),
    },
  });

  assert.equal(outcome.failedIds.length, 0);
  assert.equal(outcome.completedIds.length, 3);
  assert.equal(outcome.runSummary?.actualGeminiCalls, 2);
  assert.equal(outcome.runSummary?.geminiTokenUsage?.totalTokens, 2000);

  // Module 08 has NO ai-video-ideas section
  const mod8Slot = outcome.slots['ai-strategic-recommendation'];
  assert.ok(mod8Slot?.result);
  assert.equal(
    mod8Slot.result.sections.some((s) => s.id === 'ai-video-ideas'),
    false
  );

  // Module 09 has rich videoCreative blueprint
  const mod9Slot = outcome.slots['ad-video-creative-blueprint'];
  assert.ok(mod9Slot?.result?.videoCreative);
  assert.equal(mod9Slot.result.videoCreative.seoPack.titles.length, 3);

  // Final Report has 9 sections and includes section #9
  const ctx = buildDeepDiveTargetContext(product, 'hunting');
  const report = buildDeepDiveFinalReport({ context: ctx, slots: outcome.slots });
  assert.equal(report.totalModulesCount, 9);
  assert.equal(report.sections.length, 9);
  const sec9 = report.sections.find((s) => s.id === 'video-creative-blueprint');
  assert.ok(sec9);
  assert.equal(sec9.isAiInterpretation, true);

  const md = buildDeepDiveReportMarkdown(report, 'my');
  assert.match(md, /၉။ ကြော်ငြာ Video ဖန်တီးမှုနှင့် SEO Blueprint/);

  // History record & hydration preserves Module 09 cleanly
  const record = createDeepDiveHistoryRecord({
    canonicalProductId: ctx.canonicalProductId,
    productName: product.name,
    productNameMy: product.nameMy,
    analysisIds: ['ai-strategic-recommendation', 'ad-video-creative-blueprint'],
    slots: outcome.slots,
    runSummary: outcome.runSummary,
    runType: 'initial',
  });
  assert.ok(record.slotsSnapshot['ad-video-creative-blueprint']?.result?.videoCreative);

  const hydrated = hydrateWorkspaceStateFromHistory(createInitialDeepDiveWorkspaceState(), [record]);
  assert.equal(hydrated.slots['ad-video-creative-blueprint'].status, 'completed');
  assert.ok(hydrated.slots['ad-video-creative-blueprint'].result?.videoCreative);
});

test('Expanded creative controls, customSuggestion brief, aiVideoTool, and modular 5-hook prompt rules work cleanly', async () => {
  const product = makeProduct();
  const normalized = normalizeDeepDiveVideoCreativeOptions({
    includeCompetitorVideos: false,
    scriptLanguage: 'my-th-mix',
    videoStyle: 'ai-video',
    duration: '60-90s',
    tone: 'urgent-deal',
    framework: 'bundle-math',
    targetAudience: 'myanmar-in-th',
    sellingFocuses: ['price-bundle', 'reviews-proof'],
    ctaStyle: 'comment-engagement',
    aiVideoTool: 'veo-kling-cinematic',
    customSuggestion: '  1แถม2 ဈေးတန်မှုကို အသားပေးပြောပြီး ဖုန်း ၁ လုံးတည်းရိုက်ရလွယ်အောင် ရေးပေးပါ  ',
  });

  assert.equal(normalized.scriptLanguage, 'my-th-mix');
  assert.equal(normalized.videoStyle, 'ai-video');
  assert.equal(normalized.duration, '60-90s');
  assert.equal(normalized.tone, 'urgent-deal');
  assert.equal(normalized.framework, 'bundle-math');
  assert.equal(normalized.targetAudience, 'myanmar-in-th');
  assert.deepEqual(normalized.sellingFocuses, ['price-bundle', 'reviews-proof']);
  assert.equal(normalized.ctaStyle, 'comment-engagement');
  assert.equal(normalized.aiVideoTool, 'veo-kling-cinematic');
  assert.equal(
    normalized.customSuggestion,
    '1แถม2 ဈေးတန်မှုကို အသားပေးပြောပြီး ဖုန်း ၁ လုံးတည်းရိုက်ရလွယ်အောင် ရေးပေးပါ'
  );

  // Also verify unboxing-first-try is accepted cleanly
  const unboxingNorm = normalizeDeepDiveVideoCreativeOptions({
    videoStyle: 'unboxing-first-try',
    duration: '7-12s',
  });
  assert.equal(unboxingNorm.videoStyle, 'unboxing-first-try');
  assert.equal(unboxingNorm.duration, '7-12s');

  // Verify prompt contains customSuggestion, aiVideoTool, and modular hook A/B architecture
  const prompt = buildDeepDiveVideoCreativePrompt({
    product,
    options: normalized,
    completedModules: [],
    competitorScanStatus: 'skipped-zero-credit',
    competitorKeywordUsed: null,
    competitorVideos: [],
    usedProductImage: false,
  });
  assert.match(prompt, /CREATOR'S CUSTOM SUGGESTION/);
  assert.match(prompt, /1แถม2 ဈေးတန်မှုကို/);
  assert.match(prompt, /veo-kling-cinematic/);
  assert.match(prompt, /modular scroll-stopping 3-second hooks/i);

  // Verify service parses modular hook onScreenText & aiVideoPromptEn cleanly
  const rawWithModularHooks = JSON.parse(makeMockCreativeJson());
  rawWithModularHooks.hooks[0].onScreenText = '1แถม2 = ฿46/ขวด!';
  rawWithModularHooks.hooks[0].aiVideoPromptEn = 'Vertical 9:16 macro shot of 3 vitamin C bottles.';

  const res = await generateDeepDiveVideoCreativeBlueprint({
    product,
    options: normalized,
    userConfirmedPaidExecution: true,
    testOverrides: {
      generateCreativeJson: async () => ({
        rawText: JSON.stringify(rawWithModularHooks),
        modelUsed: 'gemini-4-hydrogen',
      }),
    },
  });
  assert.equal(res.blueprint.optionsUsed.aiVideoTool, 'veo-kling-cinematic');
  assert.equal(res.blueprint.hooks[0].onScreenText, '1แถม2 = ฿46/ขวด!');
  assert.equal(
    res.blueprint.hooks[0].aiVideoPromptEn,
    'Vertical 9:16 macro shot of 3 vitamin C bottles.'
  );
});

test('Smart Product-Aware Setting Templates adapt cleanly to product category/bundle signals (0 cr local)', () => {
  // 1. Bundle Vitamin C product -> Best Fit recommends bundle-math + urgent-deal
  const bundleProduct = makeProduct();
  const bundleTemplates = buildSmartVideoCreativeTemplates(bundleProduct);
  assert.equal(bundleTemplates.length, 4);
  assert.equal(bundleTemplates[0].id, 'best-fit');
  assert.equal(bundleTemplates[0].isRecommended, true);
  assert.equal(bundleTemplates[0].patch.framework, 'bundle-math');
  assert.equal(bundleTemplates[0].patch.tone, 'urgent-deal');
  assert.deepEqual(bundleTemplates[0].patch.sellingFocuses, ['price-bundle', 'reviews-proof']);
  assert.match(bundleTemplates[0].reasonEn, /฿139/);

  // Applying template patch preserves includeCompetitorVideos and user's customSuggestion
  const appliedBundle = {
    ...DEFAULT_DEEP_DIVE_VIDEO_CREATIVE_OPTIONS,
    includeCompetitorVideos: true,
    customSuggestion: 'Keep my brief intact',
    ...bundleTemplates[0].patch,
  };
  assert.equal(appliedBundle.includeCompetitorVideos, true);
  assert.equal(appliedBundle.customSuggestion, 'Keep my brief intact');
  assert.equal(isSmartVideoCreativeTemplateActive(appliedBundle, bundleTemplates[0]), true);
  assert.equal(isSmartVideoCreativeTemplateActive(appliedBundle, bundleTemplates[1]), false);

  // 2. Skincare product (non-bundle) -> Best Fit recommends before-after-demo + expert-honest
  const skincareProduct = makeProduct({
    name: 'CreamLab Radiance Vitamin Serum 30ml',
    nameMy: 'CreamLab မျက်နှာလိမ်း Serum',
    category: 'cosmetics-beauty',
    subCategory: 'Skincare Serums',
    priceThb: 390,
    kalodataMetrics: undefined,
  });
  const skincareTemplates = buildSmartVideoCreativeTemplates(skincareProduct);
  assert.equal(skincareTemplates[0].patch.videoStyle, 'before-after-demo');
  assert.equal(skincareTemplates[0].patch.tone, 'expert-honest');
  assert.equal(skincareTemplates[0].patch.targetAudience, 'beauty-selfcare');

  // 3. Home / Kitchen gadget -> Best Fit recommends faceless-hands 15s PAS
  const kitchenProduct = makeProduct({
    name: 'Mini Electric Garlic Chopper USB',
    nameMy: 'ကြက်သွန်ကြိတ်စက်အသေး',
    category: 'kitchen',
    subCategory: 'Kitchen Tools',
    priceThb: 129,
    kalodataMetrics: undefined,
  });
  const kitchenTemplates = buildSmartVideoCreativeTemplates(kitchenProduct);
  assert.equal(kitchenTemplates[0].patch.videoStyle, 'faceless-hands');
  assert.equal(kitchenTemplates[0].patch.duration, '15s');
  assert.equal(kitchenTemplates[0].patch.framework, 'pas');

  // 4. Myanmar-in-Thailand template sets my-th-mix + myanmar-in-th audience
  const myanmarTpl = bundleTemplates.find((t) => t.id === 'myanmar-in-th');
  assert.ok(myanmarTpl);
  assert.equal(myanmarTpl.patch.scriptLanguage, 'my-th-mix');
  assert.equal(myanmarTpl.patch.targetAudience, 'myanmar-in-th');
});


