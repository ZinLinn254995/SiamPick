import type {
  DeepDiveAnalysisId,
  DeepDiveAnalysisSlotState,
  DeepDiveFinalReport,
  DeepDiveFinalReportSection,
  DeepDiveFinalReportSectionId,
  DeepDiveMetricRow,
  DeepDiveModuleResult,
  DeepDiveReportSectionAvailability,
  DeepDiveSourceContext,
} from '../types/deepDive.ts';
import type {
  AiRecommendationVerdict,
  DataStatus,
  Language,
  OpportunityEvaluation,
  ResearchProduct,
} from '../types/product.ts';
import { getCategoryLabel } from './categoryRegistry.ts';
import { DEEP_DIVE_ANALYSIS_OPTIONS } from './deepDiveRegistry.ts';
import { formatThb } from './format.ts';
import { formatCredits, formatUsd, KALODATA_USD_PER_CREDIT } from './kalodataPricing.ts';
import { evaluateProductOpportunity } from './scoring.ts';

const SECRET_KEY_PATTERN =
  /api[_-]?key|secret|token|authorization|cookie|password|credential|private[_-]?key/i;

function stripSensitiveKeys<T>(input: T): T {
  if (input === null || input === undefined || typeof input !== 'object') {
    return input;
  }
  if (Array.isArray(input)) {
    return input.map((item) => stripSensitiveKeys(item)) as unknown as T;
  }
  const clean: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(input as Record<string, unknown>)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      continue;
    }
    clean[key] = stripSensitiveKeys(val);
  }
  return clean as T;
}

function roundCredits(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function roundUsd(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function dedupeStrings(items: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function latestIso(timestamps: readonly (string | null | undefined)[]): string | null {
  let best: string | null = null;
  let bestMs = -1;
  for (const ts of timestamps) {
    if (!ts) continue;
    const ms = Date.parse(ts);
    if (Number.isFinite(ms) && ms > bestMs) {
      bestMs = ms;
      best = ts;
    }
  }
  return best;
}

function collectHighlights(result: DeepDiveModuleResult | null, lang: 'en' | 'my'): string[] {
  if (!result) return [];
  const bullets: string[] = [];
  for (const sec of result.sections) {
    const list = lang === 'my' ? sec.bulletsMy : sec.bulletsEn;
    for (const item of list) {
      if (item.trim()) bullets.push(item.trim());
    }
  }
  return dedupeStrings(bullets).slice(0, 6);
}

function getSlotResult(
  slots: Partial<Record<DeepDiveAnalysisId, DeepDiveAnalysisSlotState>>,
  id: DeepDiveAnalysisId
): { slot: DeepDiveAnalysisSlotState | null; result: DeepDiveModuleResult | null } {
  const slot = slots[id] ?? null;
  const result = slot?.result ?? null;
  return { slot, result };
}

function buildNotRunSection(params: {
  id: DeepDiveFinalReportSectionId;
  titleEn: string;
  titleMy: string;
  sourceAnalysisIds: DeepDiveAnalysisId[];
  isAiInterpretation?: boolean;
  noteEn: string;
  noteMy: string;
  errorSlot?: DeepDiveAnalysisSlotState | null;
}): DeepDiveFinalReportSection {
  const hasError = params.errorSlot?.status === 'error' && Boolean(params.errorSlot.error);
  return {
    id: params.id,
    titleEn: params.titleEn,
    titleMy: params.titleMy,
    sourceAnalysisIds: params.sourceAnalysisIds,
    availability: hasError ? 'unavailable' : 'not-run',
    dataStatus: 'unavailable',
    isAiInterpretation: params.isAiInterpretation === true,
    headlineEn: hasError
      ? `Analysis failed (${params.errorSlot?.error?.code ?? 'ERROR'})`
      : 'Analysis not run yet',
    headlineMy: hasError
      ? `Analysis မအောင်မြင်ပါ (${params.errorSlot?.error?.code ?? 'ERROR'})`
      : 'ဤ Analysis ကို မ Run ရသေးပါ',
    summaryEn: hasError
      ? (params.errorSlot?.error?.messageEn ?? params.noteEn)
      : params.noteEn,
    summaryMy: hasError
      ? (params.errorSlot?.error?.messageMy ?? params.noteMy)
      : params.noteMy,
    metrics: [],
    highlightsEn: [],
    highlightsMy: [],
    unavailableNotesEn: [params.noteEn],
    unavailableNotesMy: [params.noteMy],
    dataSourcesEn: [],
    dataSourcesMy: [],
    lastUpdatedAt: params.errorSlot?.updatedAt ?? null,
  };
}

function buildSectionFromSingleModule(params: {
  id: DeepDiveFinalReportSectionId;
  titleEn: string;
  titleMy: string;
  analysisId: DeepDiveAnalysisId;
  slots: Partial<Record<DeepDiveAnalysisId, DeepDiveAnalysisSlotState>>;
  notRunNoteEn: string;
  notRunNoteMy: string;
  isAiInterpretation?: boolean;
}): DeepDiveFinalReportSection {
  const { slot, result } = getSlotResult(params.slots, params.analysisId);
  if (!result) {
    return buildNotRunSection({
      id: params.id,
      titleEn: params.titleEn,
      titleMy: params.titleMy,
      sourceAnalysisIds: [params.analysisId],
      isAiInterpretation: params.isAiInterpretation,
      noteEn: params.notRunNoteEn,
      noteMy: params.notRunNoteMy,
      errorSlot: slot,
    });
  }

  const availability: DeepDiveReportSectionAvailability =
    result.outcome === 'unavailable' || result.dataStatus === 'unavailable'
      ? 'unavailable'
      : result.unavailableNotesEn.length > 0
        ? 'partial'
        : 'available';

  return {
    id: params.id,
    titleEn: params.titleEn,
    titleMy: params.titleMy,
    sourceAnalysisIds: [params.analysisId],
    availability,
    dataStatus: result.dataStatus,
    isAiInterpretation: result.isAiInterpretation || params.isAiInterpretation === true,
    headlineEn: result.headlineEn,
    headlineMy: result.headlineMy,
    summaryEn: result.summaryEn,
    summaryMy: result.summaryMy,
    metrics: result.metrics.slice(0, 6),
    highlightsEn: collectHighlights(result, 'en'),
    highlightsMy: collectHighlights(result, 'my'),
    unavailableNotesEn: dedupeStrings(result.unavailableNotesEn),
    unavailableNotesMy: dedupeStrings(result.unavailableNotesMy),
    dataSourcesEn: dedupeStrings(result.dataSourcesEn),
    dataSourcesMy: dedupeStrings(result.dataSourcesMy),
    lastUpdatedAt: result.completedAt,
  };
}

function buildProductOverviewSection(
  product: ResearchProduct,
  evaluation: OpportunityEvaluation,
  slots: Partial<Record<DeepDiveAnalysisId, DeepDiveAnalysisSlotState>>
): DeepDiveFinalReportSection {
  const { result } = getSlotResult(slots, 'product-intelligence');
  if (result) {
    return buildSectionFromSingleModule({
      id: 'product-overview',
      titleEn: '1. Product Overview',
      titleMy: '1. Product အကျဉ်းချုပ်',
      analysisId: 'product-intelligence',
      slots,
      notRunNoteEn: '',
      notRunNoteMy: '',
    });
  }

  // Even if Option #1 wasn't run yet, surface verified baseline product facts honestly without fabricating
  const baselineMetrics: DeepDiveMetricRow[] = [
    {
      key: 'price',
      labelEn: 'Unit Price',
      labelMy: 'ဈေးနှုန်း',
      valueEn: product.priceThb !== null ? formatThb(product.priceThb) : 'Unavailable',
      valueMy: product.priceThb !== null ? formatThb(product.priceThb) : 'မရရှိနိုင်ပါ',
      status: product.priceThb !== null ? 'verified' : 'unavailable',
    },
    {
      key: 'commission',
      labelEn: 'Commission Rate',
      labelMy: 'ကော်မရှင်နှုန်း',
      valueEn:
        product.commissionRate !== null ? `${product.commissionRate}%` : 'Unavailable',
      valueMy:
        product.commissionRate !== null ? `${product.commissionRate}%` : 'မရရှိနိုင်ပါ',
      status:
        product.commissionVerified && product.commissionRate !== null
          ? 'verified'
          : product.commissionRate !== null
            ? 'unverified'
            : 'unavailable',
    },
    {
      key: 'score',
      labelEn: '7-Factor Score',
      labelMy: '7-Factor Score',
      valueEn: `${evaluation.totalScore}/100 (${evaluation.confidenceLevel} · ${evaluation.confidencePct}%)`,
      valueMy: `${evaluation.totalScore}/100 (${evaluation.confidenceLevel} · ${evaluation.confidencePct}%)`,
      status: evaluation.confidenceLevel === 'High' ? 'verified' : 'estimated',
    },
    {
      key: 'shop',
      labelEn: 'Shop',
      labelMy: 'ဆိုင်အမည်',
      valueEn: product.shopName || 'Unavailable',
      valueMy: product.shopName || 'မရရှိနိုင်ပါ',
      status: product.shopName && product.shopName !== 'Unavailable' ? 'verified' : 'unavailable',
    },
  ];

  return {
    id: 'product-overview',
    titleEn: '1. Product Overview',
    titleMy: '1. Product အကျဉ်းချုပ်',
    sourceAnalysisIds: ['product-intelligence'],
    availability: 'partial',
    dataStatus: evaluation.verifiedCount > 0 ? 'verified' : 'unverified',
    isAiInterpretation: false,
    headlineEn: 'Baseline Research Profile (Product Intelligence module not run yet)',
    headlineMy: 'အခြေခံ ရှာဖွေမှု Profile (Product Intelligence ကို မ Run ရသေးပါ)',
    summaryEn:
      'Showing verified baseline fields from initial research. Run Product Intelligence (#1) to inspect SKU variants, price range, and extended product detail.',
    summaryMy:
      'မူရင်း ရှာဖွေမှုမှ အတည်ပြုပြီး အခြေခံအချက်အလက်များကိုသာ ပြသထားပါသည်။ SKU၊ ဈေးနှုန်းအပိုင်းအခြားနှင့် အသေးစိတ်အတွက် Product Intelligence (#1) ကို Run နိုင်ပါသည်။',
    metrics: baselineMetrics,
    highlightsEn: [],
    highlightsMy: [],
    unavailableNotesEn: [
      'Product Intelligence (#1) has not been executed yet — SKU and extended detail metrics are not included.',
    ],
    unavailableNotesMy: [
      'Product Intelligence (#1) ကို မ Run ရသေးသဖြင့် SKU နှင့် Product Detail အသေးစိတ်များ မပါဝင်သေးပါ။',
    ],
    dataSourcesEn: ['Baseline Research Product Data'],
    dataSourcesMy: ['မူရင်း ရှာဖွေမှု Product Data'],
    lastUpdatedAt: product.researchedAt ?? null,
  };
}

function buildCompetitionSection(
  slots: Partial<Record<DeepDiveAnalysisId, DeepDiveAnalysisSlotState>>
): DeepDiveFinalReportSection {
  const creator = getSlotResult(slots, 'creator-competition-analysis');
  const peer = getSlotResult(slots, 'market-competitor-comparison');

  if (!creator.result && !peer.result) {
    return buildNotRunSection({
      id: 'competition',
      titleEn: '4. Competition & Market Position',
      titleMy: '4. ပြိုင်ဆိုင်မှုနှင့် ဈေးကွက်အနေအထား',
      sourceAnalysisIds: ['creator-competition-analysis', 'market-competitor-comparison'],
      noteEn:
        'Neither Creator Competition (#4) nor Market Competitor Comparison (#7) has been run yet.',
      noteMy:
        'Creator Competition (#4) နှင့် Market Competitor Comparison (#7) တို့ကို မ Run ရသေးပါ။',
      errorSlot: creator.slot?.status === 'error' ? creator.slot : peer.slot,
    });
  }

  const results = [creator.result, peer.result].filter(
    (r): r is DeepDiveModuleResult => r !== null
  );
  const metrics = results.flatMap((r) => r.metrics.slice(0, 3));
  const highlightsEn = dedupeStrings(results.flatMap((r) => collectHighlights(r, 'en'))).slice(0, 6);
  const highlightsMy = dedupeStrings(results.flatMap((r) => collectHighlights(r, 'my'))).slice(0, 6);
  const unavailableNotesEn = dedupeStrings(results.flatMap((r) => r.unavailableNotesEn));
  const unavailableNotesMy = dedupeStrings(results.flatMap((r) => r.unavailableNotesMy));
  if (!creator.result) {
    unavailableNotesEn.push('Creator Competition Analysis (#4) has not been run yet.');
    unavailableNotesMy.push('Creator Competition Analysis (#4) ကို မ Run ရသေးပါ။');
  }
  if (!peer.result) {
    unavailableNotesEn.push('Market Competitor Comparison (#7) has not been run yet.');
    unavailableNotesMy.push('Market Competitor Comparison (#7) ကို မ Run ရသေးပါ။');
  }

  const allUnavailable = results.every((r) => r.outcome === 'unavailable' || r.dataStatus === 'unavailable');
  const hasVerified = results.some((r) => r.dataStatus === 'verified');
  const dataStatus: DataStatus = allUnavailable
    ? 'unavailable'
    : hasVerified
      ? 'verified'
      : results[0].dataStatus;
  const availability: DeepDiveReportSectionAvailability = allUnavailable
    ? 'unavailable'
    : creator.result && peer.result && unavailableNotesEn.length === 0
      ? 'available'
      : 'partial';

  return {
    id: 'competition',
    titleEn: '4. Competition & Market Position',
    titleMy: '4. ပြိုင်ဆိုင်မှုနှင့် ဈေးကွက်အနေအထား',
    sourceAnalysisIds: ['creator-competition-analysis', 'market-competitor-comparison'],
    availability,
    dataStatus,
    isAiInterpretation: false,
    headlineEn: results.map((r) => r.headlineEn).join(' · '),
    headlineMy: results.map((r) => r.headlineMy).join(' · '),
    summaryEn: results.map((r) => r.summaryEn).join(' '),
    summaryMy: results.map((r) => r.summaryMy).join(' '),
    metrics,
    highlightsEn,
    highlightsMy,
    unavailableNotesEn: dedupeStrings(unavailableNotesEn),
    unavailableNotesMy: dedupeStrings(unavailableNotesMy),
    dataSourcesEn: dedupeStrings(results.flatMap((r) => r.dataSourcesEn)),
    dataSourcesMy: dedupeStrings(results.flatMap((r) => r.dataSourcesMy)),
    lastUpdatedAt: latestIso(results.map((r) => r.completedAt)),
  };
}

function buildRisksSection(
  product: ResearchProduct,
  evaluation: OpportunityEvaluation,
  slots: Partial<Record<DeepDiveAnalysisId, DeepDiveAnalysisSlotState>>
): DeepDiveFinalReportSection {
  const risksEn: string[] = [];
  const risksMy: string[] = [];
  const missingEn: string[] = [];
  const missingMy: string[] = [];
  const dataSourcesEn: string[] = ['7-Factor Opportunity Evaluation'];
  const dataSourcesMy: string[] = ['7-Factor Opportunity Evaluation'];
  const timestamps: (string | null)[] = [];

  for (const r of evaluation.risksEn ?? []) risksEn.push(r);
  for (const r of evaluation.risksMy ?? []) risksMy.push(r);
  for (const r of product.generalRisksEn ?? []) risksEn.push(r);
  for (const r of product.generalRisksMy ?? []) risksMy.push(r);

  const notRunNamesEn: string[] = [];
  const notRunNamesMy: string[] = [];

  for (const opt of DEEP_DIVE_ANALYSIS_OPTIONS) {
    const slot = slots[opt.id];
    if (!slot || (!slot.result && slot.status !== 'error')) {
      notRunNamesEn.push(opt.nameEn);
      notRunNamesMy.push(opt.nameMy);
      continue;
    }
    if (slot.status === 'error' && slot.error) {
      missingEn.push(`${opt.nameEn} failed (${slot.error.code}): ${slot.error.messageEn}`);
      missingMy.push(`${opt.nameMy} မအောင်မြင်ပါ (${slot.error.code}): ${slot.error.messageMy}`);
    }
    if (slot.result) {
      timestamps.push(slot.result.completedAt);
      for (const s of slot.result.dataSourcesEn) dataSourcesEn.push(s);
      for (const s of slot.result.dataSourcesMy) dataSourcesMy.push(s);
      for (const note of slot.result.unavailableNotesEn) missingEn.push(note);
      for (const note of slot.result.unavailableNotesMy) missingMy.push(note);
      // Surface complaint/risk sections from reviews or AI
      for (const sec of slot.result.sections) {
        if (/risk|complaint|pain|weakness|drawback|limitation/i.test(sec.id + ' ' + sec.titleEn)) {
          for (const b of sec.bulletsEn) risksEn.push(b);
          for (const b of sec.bulletsMy) risksMy.push(b);
        }
      }
    }
  }

  if (notRunNamesEn.length > 0) {
    missingEn.push(`Unrun Deep Dive modules (${notRunNamesEn.length}): ${notRunNamesEn.join(', ')}.`);
    missingMy.push(`မ Run ရသေးသော Deep Dive Module များ (${notRunNamesMy.length}): ${notRunNamesMy.join('၊ ')}။`);
  }

  const dedupedRisksEn = dedupeStrings(risksEn).slice(0, 8);
  const dedupedRisksMy = dedupeStrings(risksMy).slice(0, 8);
  const dedupedMissingEn = dedupeStrings(missingEn).slice(0, 8);
  const dedupedMissingMy = dedupeStrings(missingMy).slice(0, 8);

  const hasContent = dedupedRisksEn.length > 0 || dedupedMissingEn.length > 0;
  return {
    id: 'risks',
    titleEn: '7. Risks & Data Limitations',
    titleMy: '7. စိုးရိမ်ချက်များနှင့် Data ကန့်သတ်ချက်များ',
    sourceAnalysisIds: DEEP_DIVE_ANALYSIS_OPTIONS.map((o) => o.id),
    availability: hasContent ? (notRunNamesEn.length > 0 ? 'partial' : 'available') : 'unavailable',
    dataStatus: evaluation.verifiedCount > 0 ? 'verified' : 'estimated',
    isAiInterpretation: false,
    headlineEn:
      dedupedRisksEn.length > 0
        ? `${dedupedRisksEn.length} risk signal(s) · ${notRunNamesEn.length} module(s) not yet run`
        : `No explicit risk flags detected · ${notRunNamesEn.length} module(s) not yet run`,
    headlineMy:
      dedupedRisksMy.length > 0
        ? `စိုးရိမ်ချက် ${dedupedRisksMy.length} ချက် · မ Run ရသေးသော Module ${notRunNamesMy.length} ခု`
        : `အထူးစိုးရိမ်ချက် မတွေ့ရသေးပါ · မ Run ရသေးသော Module ${notRunNamesMy.length} ခု`,
    summaryEn:
      'Aggregates verified risks, customer complaints (if Review Insight ran), and explicit unavailable/unrun data gaps so decisions are never based on hidden omissions.',
    summaryMy:
      'အတည်ပြုပြီး စိုးရိမ်ချက်များ၊ ဝယ်သူအခက်အခဲများ (Review Insight Run ထားပါက) နှင့် မရရှိသေး/မ Run ရသေးသော Data ကွက်လပ်များကို ပွင့်လင်းစွာ စုစည်းဖော်ပြထားပါသည်။',
    metrics: [
      {
        key: 'riskCount',
        labelEn: 'Risk Signals',
        labelMy: 'သတိပြုရန်အချက်',
        valueEn: `${dedupedRisksEn.length}`,
        valueMy: `${dedupedRisksMy.length} ချက်`,
        status: dedupedRisksEn.length > 0 ? 'verified' : 'estimated',
      },
      {
        key: 'unrunModules',
        labelEn: 'Unrun Modules',
        labelMy: 'မ Run ရသေးသော Module',
        valueEn: `${notRunNamesEn.length} of ${DEEP_DIVE_ANALYSIS_OPTIONS.length}`,
        valueMy: `${DEEP_DIVE_ANALYSIS_OPTIONS.length} ခုအနက် ${notRunNamesMy.length} ခု`,
        status: notRunNamesEn.length === 0 ? 'verified' : 'unavailable',
      },
    ],
    highlightsEn: dedupedRisksEn,
    highlightsMy: dedupedRisksMy,
    unavailableNotesEn: dedupedMissingEn,
    unavailableNotesMy: dedupedMissingMy,
    dataSourcesEn: dedupeStrings(dataSourcesEn),
    dataSourcesMy: dedupeStrings(dataSourcesMy),
    lastUpdatedAt: latestIso(timestamps),
  };
}

/**
 * Phase 9.4 Final Report Assembler.
 * Compiles all 8 decision sections from actual Deep Dive results & verified baseline product data.
 * Never fabricates unavailable or unrun analyses, and keeps AI Recommendations strictly separated.
 */
export function buildDeepDiveFinalReport(params: {
  context: DeepDiveSourceContext;
  slots: Partial<Record<DeepDiveAnalysisId, DeepDiveAnalysisSlotState>>;
  evaluation?: OpportunityEvaluation | null;
  salesWeightPct?: number;
  generatedAt?: string;
}): DeepDiveFinalReport {
  const { context, slots } = params;
  const product = context.product;
  const evaluation =
    params.evaluation ??
    evaluateProductOpportunity(product, {
      salesWeightPct: params.salesWeightPct ?? 50,
    });

  let completedModulesCount = 0;
  let unavailableModulesCount = 0;
  let errorModulesCount = 0;
  let notRunModulesCount = 0;
  let totalKalodataCreditsUsed = 0;
  let totalKalodataApiCalls = 0;
  let totalGeminiApiCalls = 0;
  const allSourcesEn: string[] = [];
  const allSourcesMy: string[] = [];
  const allTimestamps: (string | null)[] = [];
  let aiVerdict: AiRecommendationVerdict | null = null;

  for (const opt of DEEP_DIVE_ANALYSIS_OPTIONS) {
    const slot = slots[opt.id];
    if (!slot || slot.status === 'idle' || slot.status === 'not-implemented') {
      notRunModulesCount += 1;
      continue;
    }
    if (slot.status === 'completed') completedModulesCount += 1;
    else if (slot.status === 'unavailable') unavailableModulesCount += 1;
    else if (slot.status === 'error') errorModulesCount += 1;
    else if (slot.status === 'running' || slot.status === 'queued') {
      if (slot.result) completedModulesCount += 1;
      else notRunModulesCount += 1;
    }

    if (slot.result) {
      totalKalodataCreditsUsed = roundCredits(totalKalodataCreditsUsed + slot.result.creditsUsed);
      totalKalodataApiCalls += slot.result.apiCallsMade;
      totalGeminiApiCalls += slot.result.aiApiCallsMade ?? 0;
      allTimestamps.push(slot.result.completedAt);
      for (const s of slot.result.dataSourcesEn) allSourcesEn.push(s);
      for (const s of slot.result.dataSourcesMy) allSourcesMy.push(s);
      if (opt.id === 'ai-strategic-recommendation' && slot.result.aiMeta?.verdict) {
        aiVerdict = slot.result.aiMeta.verdict;
      }
    }
  }

  const sections: DeepDiveFinalReportSection[] = [
    buildProductOverviewSection(product, evaluation, slots),
    buildSectionFromSingleModule({
      id: 'market-opportunity',
      titleEn: '2. Market Opportunity',
      titleMy: '2. ဈေးကွက်အလားအလာ',
      analysisId: 'sales-market-intelligence',
      slots,
      notRunNoteEn:
        'Sales & Market Intelligence (#2) has not been run yet. Run module #2 to include verified sales volume, GMV, growth rate, and channel split.',
      notRunNoteMy:
        'Sales & Market Intelligence (#2) ကို မ Run ရသေးပါ။ ရောင်းအား၊ GMV၊ တိုးတက်မှုနှုန်းနှင့် Channel ခွဲခြမ်းစိတ်ဖြာမှုအတွက် Module #2 ကို Run ပါ။',
    }),
    buildSectionFromSingleModule({
      id: 'affiliate-profit',
      titleEn: '3. Affiliate Profit',
      titleMy: '3. Affiliate အမြတ်တွက်ချက်မှု',
      analysisId: 'affiliate-profit-analysis',
      slots,
      notRunNoteEn:
        'Affiliate Profit Analysis (#3) has not been run yet (0 cr local calculation). Run module #3 to compute verified per-sale THB commission and sales-volume scenarios.',
      notRunNoteMy:
        'Affiliate Profit Analysis (#3) ကို မ Run ရသေးပါ (0 cr Local တွက်ချက်မှု)။ တစ်ခုရောင်းရအမြတ်နှင့် ခန့်မှန်းဝင်ငွေအတွက် Module #3 ကို Run ပါ။',
    }),
    buildCompetitionSection(slots),
    buildSectionFromSingleModule({
      id: 'video-insights',
      titleEn: '5. Video Insights',
      titleMy: '5. Video နှင့် Content သုံးသပ်ချက်',
      analysisId: 'video-intelligence',
      slots,
      notRunNoteEn:
        'Video Intelligence (#5) has not been run yet. Run module #5 to evaluate product video count, Video GMV, and matched Myanmar videos.',
      notRunNoteMy:
        'Video Intelligence (#5) ကို မ Run ရသေးပါ။ Video အရေအတွက်၊ Video GMV နှင့် ချိတ်ဆက် မြန်မာ Video များစစ်ဆေးရန် Module #5 ကို Run ပါ။',
    }),
    buildSectionFromSingleModule({
      id: 'customer-reviews',
      titleEn: '6. Customer Reviews (Opt-in)',
      titleMy: '6. ဝယ်သူ Review သုံးသပ်ချက်',
      analysisId: 'customer-review-intelligence',
      slots,
      notRunNoteEn:
        'Customer Review Intelligence (#6) has not been run yet (strictly opt-in; 1.0 Kalodata credit if uncached). Review insights are not fabricated.',
      notRunNoteMy:
        'Customer Review Intelligence (#6) ကို မ Run ရသေးပါ (ကိုယ်တိုင်ရွေးမှသာ ခေါ်မည့် Opt-in · Cache မရှိပါက 1.0 credit)။ Review ဒေတာကို ခန့်မှန်းဖန်တီးမပြပါ။',
    }),
    buildRisksSection(product, evaluation, slots),
    buildSectionFromSingleModule({
      id: 'ai-recommendations',
      titleEn: '8. AI Business Recommendation (Go / No-Go)',
      titleMy: '8. AI စီးပွားရေးဆုံးဖြတ်ချက် (Go / No-Go)',
      analysisId: 'ai-strategic-recommendation',
      slots,
      isAiInterpretation: true,
      notRunNoteEn:
        'AI Strategic Recommendation (#8) has not been run yet (0 Kalodata cr · requires 1 separate server-side Gemini AI API call). No AI verdict is fabricated.',
      notRunNoteMy:
        'AI Strategic Recommendation (#8) ကို မ Run ရသေးပါ (0 Kalodata cr · သီးခြား Server-side Gemini AI API 1 ကြိမ်လိုအပ်)။ AI အကြံပြုချက်ကို အတုအယောင် ဖန်တီးမပြပါ။',
    }),
    buildSectionFromSingleModule({
      id: 'video-creative-blueprint',
      titleEn: '9. Ad Video Creative & SEO Blueprint (AI Studio)',
      titleMy: '9. AI Content Video ဖန်တီးမှုနှင့် SEO Blueprint',
      analysisId: 'ad-video-creative-blueprint',
      slots,
      isAiInterpretation: true,
      notRunNoteEn:
        'AI Ad Video Creative Studio (#9) has not been run yet (0 Kalodata cr default or +0.1 cr with Competitor Video Scan · 1 Gemini AI call). No scripts or competitor videos are fabricated.',
      notRunNoteMy:
        'AI Content Video Studio (#9) ကို မ Run ရသေးပါ (မူလ 0 Kalodata cr သို့မဟုတ် ပြိုင်ဘက် Video စစ်ဆေးပါက +0.1 cr · Gemini AI 1 ကြိမ်)။ Script နှင့် ပြိုင်ဘက် Video များကို အတုအယောင် ဖန်တီးမပြပါ။',
    }),
  ];

  return {
    reportVersion: 1,
    generatedAt: params.generatedAt ?? new Date().toISOString(),
    canonicalProductId: context.canonicalProductId,
    originalProductId: context.originalProductId,
    productName: product.name,
    productNameMy: product.nameMy,
    categoryLabelEn: getCategoryLabel(product.category, 'en'),
    categoryLabelMy: getCategoryLabel(product.category, 'my'),
    shopName: product.shopName || 'Unavailable',
    originResearchMode: context.originResearchMode,
    overallScore: evaluation.totalScore,
    confidenceLevel: evaluation.confidenceLevel,
    confidencePct: evaluation.confidencePct,
    completedModulesCount,
    unavailableModulesCount,
    errorModulesCount,
    notRunModulesCount,
    totalModulesCount: DEEP_DIVE_ANALYSIS_OPTIONS.length,
    aiVerdict,
    totalKalodataCreditsUsed,
    totalKalodataUsdUsed: roundUsd(totalKalodataCreditsUsed * KALODATA_USD_PER_CREDIT),
    totalKalodataApiCalls,
    totalGeminiApiCalls,
    lastUpdatedAt: latestIso(allTimestamps),
    allDataSourcesEn: dedupeStrings(allSourcesEn),
    allDataSourcesMy: dedupeStrings(allSourcesMy),
    sections,
  };
}

const DATA_STATUS_LABEL_EN: Record<DataStatus, string> = {
  verified: 'Verified',
  estimated: 'Estimated',
  unverified: 'Unverified',
  unavailable: 'Unavailable',
};

const DATA_STATUS_LABEL_MY: Record<DataStatus, string> = {
  verified: 'Verified (အတည်ပြုပြီး)',
  estimated: 'Estimated (ခန့်မှန်း)',
  unverified: 'Unverified (အတည်မပြုရသေး)',
  unavailable: 'Unavailable (မရရှိနိုင်ပါ)',
};

/**
 * Exports a clean, decision-ready Markdown Deep Dive Report (for clipboard copy or .md download).
 */
export function buildDeepDiveReportMarkdown(
  report: DeepDiveFinalReport,
  language: Language
): string {
  const isMy = language === 'my';
  const statusMap = isMy ? DATA_STATUS_LABEL_MY : DATA_STATUS_LABEL_EN;
  const title = isMy ? report.productNameMy : report.productName;
  const category = isMy ? report.categoryLabelMy : report.categoryLabelEn;
  const sources = isMy ? report.allDataSourcesMy : report.allDataSourcesEn;

  const lines: string[] = [
    `# SiamPick — ${isMy ? 'Deep Dive စုစည်းအစီရင်ခံစာ (Final Report)' : 'Deep Dive Final Report'}`,
    ``,
    `- **${isMy ? 'Product' : 'Product'}:** ${title}`,
    `- **Product ID:** \`${report.canonicalProductId}\``,
    `- **${isMy ? 'Category' : 'Category'}:** ${category}`,
    `- **${isMy ? 'ဆိုင်အမည်' : 'Shop'}:** ${report.shopName}`,
    `- **${isMy ? '7-Factor Score' : '7-Factor Score'}:** ${report.overallScore}/100 (${report.confidenceLevel} · ${report.confidencePct}%)`,
    `- **${isMy ? 'Modules ပြီးစီးမှု' : 'Modules Coverage'}:** ${report.completedModulesCount}/${report.totalModulesCount} ${isMy ? 'ပြီးစီးပြီး' : 'completed'} · ${report.unavailableModulesCount} ${isMy ? 'မရရှိနိုင်' : 'unavailable'} · ${report.notRunModulesCount} ${isMy ? 'မ Run ရသေး' : 'not run'}`,
    `- **${isMy ? 'AI Verdict' : 'AI Verdict'}:** ${report.aiVerdict ?? (isMy ? 'Not Run (မ Run ရသေးပါ)' : 'Not Run')}`,
    `- **${isMy ? 'Kalodata စရိတ်' : 'Kalodata Cost'}:** ${formatCredits(report.totalKalodataCreditsUsed)} cr (${formatUsd(report.totalKalodataUsdUsed)}) · ${report.totalKalodataApiCalls} API call(s)`,
    `- **${isMy ? 'Gemini AI API' : 'Gemini AI API'}:** ${report.totalGeminiApiCalls} call(s) (${isMy ? 'သီးခြား AI Billing' : 'Separate Gemini billing'})`,
    `- **${isMy ? 'နောက်ဆုံးအပ်ဒိတ်' : 'Last Updated'}:** ${report.lastUpdatedAt ?? 'Unavailable'}`,
    `- **${isMy ? 'Data Sources' : 'Data Sources'}:** ${sources.length > 0 ? sources.join(' · ') : 'Baseline Research Product Data'}`,
    ``,
    `---`,
    ``,
  ];

  for (const sec of report.sections) {
    const secTitle = isMy ? sec.titleMy : sec.titleEn;
    const headline = isMy ? sec.headlineMy : sec.headlineEn;
    const summary = isMy ? sec.summaryMy : sec.summaryEn;
    const highlights = isMy ? sec.highlightsMy : sec.highlightsEn;
    const notes = isMy ? sec.unavailableNotesMy : sec.unavailableNotesEn;
    const secSources = isMy ? sec.dataSourcesMy : sec.dataSourcesEn;

    lines.push(`## ${secTitle}`);
    lines.push(
      `> **${isMy ? 'Data Status' : 'Data Status'}:** ${statusMap[sec.dataStatus]}${sec.isAiInterpretation ? (isMy ? ' · AI Interpretation (Verified Market Data နှင့် သီးခြား)' : ' · AI Interpretation (Separate from Verified Market Data)') : ''}${sec.lastUpdatedAt ? ` · **${isMy ? 'Updated' : 'Updated'}:** ${sec.lastUpdatedAt}` : ''}`
    );
    lines.push(``);
    lines.push(`**${headline}**`);
    lines.push(``);
    lines.push(summary);
    lines.push(``);

    if (sec.metrics.length > 0) {
      for (const m of sec.metrics) {
        lines.push(
          `- **${isMy ? m.labelMy : m.labelEn}:** ${isMy ? m.valueMy : m.valueEn} _(${statusMap[m.status]})_`
        );
      }
      lines.push(``);
    }

    if (highlights.length > 0) {
      for (const item of highlights) {
        lines.push(`- ${item}`);
      }
      lines.push(``);
    }

    if (notes.length > 0) {
      lines.push(`**${isMy ? 'ကန့်သတ်ချက် / မရရှိနိုင်သော Data' : 'Unavailable Data & Limitations'}:**`);
      for (const n of notes) {
        lines.push(`- ${n}`);
      }
      lines.push(``);
    }

    if (secSources.length > 0) {
      lines.push(`_${isMy ? 'Data Source' : 'Data Source'}: ${secSources.join(' · ')}_`);
      lines.push(``);
    }
  }

  return lines.join('\n').trim() + '\n';
}

/**
 * Exports a structured, secret-scrubbed JSON Deep Dive Final Report.
 */
export function buildDeepDiveReportJson(report: DeepDiveFinalReport): string {
  const payload = {
    app: 'SiamPick',
    reportType: 'deep-dive-final-report',
    market: 'Thailand TikTok Shop',
    currency: 'THB',
    ...report,
  };
  return JSON.stringify(stripSensitiveKeys(payload), null, 2);
}
