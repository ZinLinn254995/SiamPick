import {
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ImageOff,
  Layers,
  Loader2,
  Play,
  RotateCw,
  Sparkles,
} from 'lucide-react';
import type {
  DeepDiveAnalysisId,
  DeepDiveAnalysisSlotState,
  DeepDiveExecutionStatus,
  DeepDiveModuleResult,
  DeepDiveSourceContext,
  DeepDiveWorkspaceState,
} from '../types/deepDive';
import type { DataStatus, Language, OpportunityEvaluation, ResearchMode } from '../types/product';
import {
  canRunDeepDiveSelection,
  DEEP_DIVE_ANALYSIS_OPTIONS,
  getDeepDiveOptionById,
} from '../utils/deepDiveRegistry';
import { getCategoryLabel } from '../utils/categoryRegistry';
import { formatThb } from '../utils/format';
import { formatCredits } from '../utils/kalodataPricing';
import { evaluateProductOpportunity } from '../utils/scoring';
import { TRANSLATIONS } from '../i18n/translations';
import { InfoPopover } from './InfoPopover';
import { ProductImage } from './ProductImage';

interface DeepDiveWorkspaceViewProps {
  context: DeepDiveSourceContext;
  workspaceState: DeepDiveWorkspaceState;
  evaluation?: OpportunityEvaluation | null;
  salesWeightPct: number;
  onToggleOption: (id: DeepDiveAnalysisId) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  onToggleExpand: (id: DeepDiveAnalysisId) => void;
  onRunSelected: () => void;
  onRunSingle: (id: DeepDiveAnalysisId, forceRefresh?: boolean) => void;
  onBack: () => void;
  onOpenProductDetail: () => void;
  language: Language;
}

function getOriginModeLabel(mode: ResearchMode, language: Language): string {
  const t = TRANSLATIONS[language];
  if (mode === 'deep') return t.modeDeepTitle;
  if (mode === 'balanced') return t.modeBalancedTitle;
  return t.modeFastTitle;
}

function formatCompletedTime(iso: string | null, language: Language): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat(language === 'my' ? 'en-GB' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().slice(11, 19);
  }
}

function getDataStatusStyle(status: DataStatus): string {
  switch (status) {
    case 'verified':
      return 'text-emerald-700 dark:text-emerald-400';
    case 'estimated':
      return 'text-sky-700 dark:text-sky-400';
    case 'unverified':
      return 'text-amber-700 dark:text-amber-400';
    case 'unavailable':
    default:
      return 'text-zinc-500 dark:text-zinc-400';
  }
}

function getExecutionStatusDisplay(
  status: DeepDiveExecutionStatus,
  isMy: boolean
): { label: string; toneClass: string } {
  switch (status) {
    case 'running':
      return {
        label: isMy ? 'လုပ်ဆောင်နေသည်...' : 'Running...',
        toneClass: 'text-sky-700 dark:text-sky-400',
      };
    case 'completed':
      return {
        label: isMy ? 'ပြီးစီးပြီး' : 'Completed',
        toneClass: 'text-emerald-700 dark:text-emerald-400',
      };
    case 'unavailable':
      return {
        label: isMy ? 'Data မရရှိနိုင်ပါ (Unavailable)' : 'Unavailable',
        toneClass: 'text-amber-700 dark:text-amber-400',
      };
    case 'error':
      return {
        label: isMy ? 'အမှားဖြစ်ပွားသည် (Error)' : 'Error',
        toneClass: 'text-rose-700 dark:text-rose-400',
      };
    case 'not-implemented':
      return {
        label: isMy ? 'မလုပ်ဆောင်ရသေး' : 'Idle',
        toneClass: 'text-zinc-500 dark:text-zinc-400',
      };
    case 'idle':
    default:
      return {
        label: isMy ? 'အဆင်သင့်' : 'Idle',
        toneClass: 'text-zinc-500 dark:text-zinc-400',
      };
  }
}

interface ModuleResultPanelProps {
  slot: DeepDiveAnalysisSlotState;
  language: Language;
  onRerun: (forceRefresh?: boolean) => void;
}

function ModuleResultPanel({ slot, language, onRerun }: ModuleResultPanelProps) {
  const isMy = language === 'my';
  const t = TRANSLATIONS[language];
  const isRunning = slot.status === 'running';

  if (slot.status === 'error' && slot.error) {
    return (
      <div
        role="alert"
        className="px-4 py-3.5 border-t border-rose-200/80 dark:border-rose-900/60 bg-rose-50/60 dark:bg-rose-950/30 space-y-2.5 text-xs"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <AlertCircle
              className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <div className="space-y-0.5 min-w-0">
              <div className="font-semibold text-rose-900 dark:text-rose-200">
                {isMy ? 'Analysis လုပ်ဆောင်မှု မအောင်မြင်ပါ' : 'Analysis Failed'}
                <span className="font-mono text-[11px] font-normal text-rose-700 dark:text-rose-300 ml-1.5">
                  ({slot.error.code})
                </span>
              </div>
              <p className="text-rose-800 dark:text-rose-300 leading-relaxed">
                {isMy ? slot.error.messageMy : slot.error.messageEn}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onRerun(false)}
            disabled={isRunning}
            className="inline-flex items-center gap-1 min-h-[30px] px-2.5 py-1 text-xs font-medium text-rose-800 dark:text-rose-200 bg-white dark:bg-zinc-900 border border-rose-300 dark:border-rose-800 rounded-md hover:border-rose-500 transition-colors cursor-pointer shrink-0 whitespace-nowrap"
          >
            <RotateCw className="w-3 h-3 shrink-0" aria-hidden="true" />
            <span>{isMy ? 'ထပ်စမ်းမည်' : 'Retry'}</span>
          </button>
        </div>

        <div className="text-[11px] text-rose-700/90 dark:text-rose-300/80">
          {isMy
            ? 'အခြား Deep Dive Analysis များကို ထိခိုက်မှုမရှိပါ။'
            : 'Isolated failure — other Deep Dive modules are unaffected.'}
        </div>
      </div>
    );
  }

  const result: DeepDiveModuleResult | null = slot.result;
  if (!result) return null;

  const dataStatusLabel = t.dataStatusLabels[result.dataStatus];
  const headline = isMy ? result.headlineMy : result.headlineEn;
  const summary = isMy ? result.summaryMy : result.summaryEn;
  const unavailableNotes = isMy ? result.unavailableNotesMy : result.unavailableNotesEn;
  const dataSources = isMy ? result.dataSourcesMy : result.dataSourcesEn;

  return (
    <div className="px-4 py-4 border-t border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/40 space-y-3.5 text-xs">
      {/* Strict Separation Banner for AI Interpretation vs Verified Market Data */}
      {result.isAiInterpretation && (
        <div className="flex items-start gap-2 pb-2.5 border-b border-sky-200/70 dark:border-sky-900/60 text-sky-900 dark:text-sky-200">
          <Sparkles className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="leading-relaxed">
            <span className="font-semibold">
              {isMy
                ? 'AI Interpretation (AI ဗျူဟာသုံးသပ်ချက်)'
                : 'AI Interpretation (Strategic Synthesis)'}
            </span>
            <span className="text-sky-800/90 dark:text-sky-300/90">
              {' — '}
              {isMy
                ? 'အတည်ပြုပြီး Market Data များအပေါ် အခြေခံ၍ Gemini AI မှ ထုတ်ပေးသော သုံးသပ်အကြံပြုချက်ဖြစ်ပါသည် (Verified Market Data နှင့် သီးခြားခွဲခြားထားသည်)။'
                : 'Generated by Gemini AI on top of verified market data — clearly separated from raw Verified Market Data.'}
            </span>
          </div>
        </div>
      )}

      {/* Headline & Summary */}
      <div className="space-y-1">
        <div className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-50 leading-snug">
          {headline}
        </div>
        <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed">{summary}</p>
      </div>

      {/* Structured Verified Metrics Grid */}
      {result.metrics.length > 0 && (
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2.5 pt-2.5 border-t border-zinc-200/70 dark:border-zinc-800/80">
          {result.metrics.map((metric) => (
            <div key={metric.key} className="min-w-0">
              <dt className="flex items-center justify-between gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                <span className="truncate">{isMy ? metric.labelMy : metric.labelEn}</span>
                <span className={`font-medium shrink-0 ${getDataStatusStyle(metric.status)}`}>
                  {t.dataStatusLabels[metric.status]}
                </span>
              </dt>
              <dd className="font-mono text-xs font-semibold text-zinc-950 dark:text-zinc-100 tabular-nums mt-0.5 break-words">
                {isMy ? metric.valueMy : metric.valueEn}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {/* Competitor Comparison Table (Option #7) */}
      {result.competitorRows && result.competitorRows.length > 0 && (
        <div className="pt-2.5 border-t border-zinc-200/70 dark:border-zinc-800/80 overflow-x-auto">
          <table className="w-full text-left border-collapse text-[11px]">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400">
                <th className="py-1.5 pr-2 font-medium">#</th>
                <th className="py-1.5 pr-2 font-medium">{isMy ? 'Product' : 'Product'}</th>
                <th className="py-1.5 px-2 font-medium text-right">{isMy ? 'ဈေးနှုန်း' : 'Price'}</th>
                <th className="py-1.5 px-2 font-medium text-right">{isMy ? 'ရောင်းအား' : 'Sales'}</th>
                <th className="py-1.5 px-2 font-medium text-right">{isMy ? 'ကော်မရှင်' : 'Comm.'}</th>
                <th className="py-1.5 pl-2 font-medium text-right">{isMy ? 'အမှတ်' : 'Score'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
              {result.competitorRows.map((row) => (
                <tr
                  key={row.canonicalProductId}
                  className={
                    row.isTarget
                      ? 'bg-zinc-900/5 dark:bg-zinc-100/10 font-semibold text-zinc-950 dark:text-zinc-50'
                      : 'text-zinc-700 dark:text-zinc-300'
                  }
                >
                  <td className="py-1.5 pr-2 font-mono tabular-nums">#{row.rankPosition}</td>
                  <td className="py-1.5 pr-2 max-w-[180px] truncate" title={isMy ? row.nameMy : row.name}>
                    {row.isTarget ? (isMy ? '★ ' : '★ ') : ''}
                    {isMy ? row.nameMy : row.name}
                  </td>
                  <td className="py-1.5 px-2 text-right font-mono tabular-nums whitespace-nowrap">
                    {row.priceThb !== null ? formatThb(row.priceThb) : '—'}
                  </td>
                  <td className="py-1.5 px-2 text-right font-mono tabular-nums whitespace-nowrap">
                    {row.salesVolume !== null ? row.salesVolume.toLocaleString('en-US') : '—'}
                  </td>
                  <td className="py-1.5 px-2 text-right font-mono tabular-nums whitespace-nowrap">
                    {row.commissionRatePct !== null ? `${row.commissionRatePct}%` : '—'}
                  </td>
                  <td className="py-1.5 pl-2 text-right font-mono tabular-nums whitespace-nowrap">
                    {row.score}/100
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Matched Videos List (Option #5) */}
      {result.videoItems && result.videoItems.length > 0 && (
        <div className="pt-2.5 border-t border-zinc-200/70 dark:border-zinc-800/80 space-y-2">
          <div className="font-semibold text-zinc-900 dark:text-zinc-100">
            {isMy ? 'အတည်ပြုပြီး ချိတ်ဆက် မြန်မာ Video များ' : 'Verified Matched Myanmar Videos'}
          </div>
          <div className="divide-y divide-zinc-200/70 dark:divide-zinc-800/70 border border-zinc-200/80 dark:border-zinc-800 rounded-lg overflow-hidden bg-white dark:bg-zinc-900">
            {result.videoItems.map((vid) => (
              <div key={vid.videoId} className="p-2.5 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-zinc-800 dark:text-zinc-200 leading-snug line-clamp-2">
                    {vid.captionSnippet}
                  </p>
                  {vid.videoUrl && (
                    <a
                      href={vid.videoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 text-[11px] font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50 shrink-0"
                    >
                      <span>{isMy ? 'ဖွင့်မည်' : 'Open'}</span>
                      <ExternalLink className="w-3 h-3" aria-hidden="true" />
                    </a>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-zinc-500 dark:text-zinc-400 font-mono tabular-nums">
                  {vid.creatorHandle && <span>@{vid.creatorHandle.replace(/^@+/, '')}</span>}
                  {vid.views !== null && <span>{vid.views.toLocaleString('en-US')} views</span>}
                  {vid.salesVolume !== null && <span>{vid.salesVolume.toLocaleString('en-US')} sold</span>}
                  {vid.revenueThb !== null && <span>{formatThb(vid.revenueThb)}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Structured Sections */}
      {result.sections.map((section) => {
        const bullets = isMy ? section.bulletsMy : section.bulletsEn;
        if (bullets.length === 0) return null;
        return (
          <div
            key={section.id}
            className="pt-2.5 border-t border-zinc-200/70 dark:border-zinc-800/80 space-y-1.5"
          >
            <div className="font-semibold text-zinc-900 dark:text-zinc-100">
              {isMy ? section.titleMy : section.titleEn}
            </div>
            <ul className="space-y-1 text-zinc-600 dark:text-zinc-300 list-disc pl-4">
              {bullets.map((line, idx) => (
                <li key={`${section.id}-${idx}`} className="leading-relaxed">
                  {line}
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      {/* Honest Unavailable / Limitations Disclosure */}
      {unavailableNotes.length > 0 && (
        <div className="pt-2.5 border-t border-zinc-200/70 dark:border-zinc-800/80 space-y-1 text-[11px] text-amber-800 dark:text-amber-300/90">
          <div className="font-semibold">
            {isMy ? 'မရရှိနိုင်သော Data / ကန့်သတ်ချက်များ' : 'Unavailable Data & Limitations'}
          </div>
          <ul className="space-y-0.5 list-disc pl-4">
            {unavailableNotes.map((note, idx) => (
              <li key={idx} className="leading-relaxed">
                {note}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Provenance Footer: Data Source, Data Status, Timestamp, Credits/Cache & Re-run */}
      <div className="pt-2.5 border-t border-zinc-200/80 dark:border-zinc-800 flex flex-col gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
            <span className={`font-semibold ${getDataStatusStyle(result.dataStatus)}`}>
              {isMy ? 'Data အဆင့်' : 'Status'}: {dataStatusLabel}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {isMy ? 'ပြီးစီးချိန်' : 'Completed'}: {formatCompletedTime(result.completedAt, language)}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {result.creditsUsed > 0
                ? `${formatCredits(result.creditsUsed)} cr`
                : result.reusedFromCache
                  ? isMy
                    ? '0 cr (Cache / Local)'
                    : '0 cr (Cache / Local)'
                  : '0 Kalodata cr'}
            </span>
          </div>

          <button
            type="button"
            onClick={() => onRerun(false)}
            disabled={isRunning}
            className="inline-flex items-center gap-1 font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-50 disabled:opacity-45 cursor-pointer shrink-0 whitespace-nowrap"
          >
            <RotateCw className="w-3 h-3 shrink-0" aria-hidden="true" />
            <span>{isMy ? 'ပြန် Run မည်' : 'Re-run'}</span>
          </button>
        </div>

        <div className="leading-relaxed">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            {isMy ? 'Data Source:' : 'Data Source:'}
          </span>{' '}
          <span>{dataSources.join(' · ')}</span>
        </div>
      </div>
    </div>
  );
}

export function DeepDiveWorkspaceView({
  context,
  workspaceState,
  evaluation: providedEvaluation,
  salesWeightPct,
  onToggleOption,
  onSelectAll,
  onClearAll,
  onToggleExpand,
  onRunSelected,
  onRunSingle,
  onBack,
  onOpenProductDetail,
  language,
}: DeepDiveWorkspaceViewProps) {
  const t = TRANSLATIONS[language];
  const isMy = language === 'my';
  const { product, originalProductId, canonicalProductId, originResearchMode, originView } = context;

  const evaluation =
    providedEvaluation ??
    evaluateProductOpportunity(product, {
      salesWeightPct,
    });

  const displayName = isMy ? product.nameMy : product.name;
  const categoryLabel = getCategoryLabel(product.category, language);
  const originModeLabel = getOriginModeLabel(originResearchMode, language);
  const hasVerifiedImage = Boolean(product.imageUrl && product.imageVerified !== false);

  const selectedCount = workspaceState.selectedIds.length;
  const totalCount = DEEP_DIVE_ANALYSIS_OPTIONS.length;
  const allSelected = selectedCount === totalCount;
  const canRun = canRunDeepDiveSelection(workspaceState);

  const isAnyRunning = DEEP_DIVE_ANALYSIS_OPTIONS.some(
    (opt) => workspaceState.slots[opt.id]?.status === 'running'
  );
  const completedCount = DEEP_DIVE_ANALYSIS_OPTIONS.filter(
    (opt) => workspaceState.slots[opt.id]?.status === 'completed'
  ).length;

  const selectedOptionNames = workspaceState.selectedIds.map((id) => {
    const def = getDeepDiveOptionById(id);
    return def ? (isMy ? def.nameMy : def.nameEn) : id;
  });

  const backLabel =
    originView === 'saved'
      ? isMy
        ? 'သိမ်းထားသော Product များသို့ ပြန်သွားမည်'
        : 'Back to Saved Products'
      : originView === 'history'
        ? isMy
          ? 'Research History သို့ ပြန်သွားမည်'
          : 'Back to Research History'
        : isMy
          ? 'Research Results သို့ ပြန်သွားမည်'
          : 'Back to Research Results';

  const copy = isMy
    ? {
        heading: 'Deep Dive Analysis',
        subheading: 'ရွေးချယ်ထားသော Product ကို အတည်ပြုပြီး API နှင့် ရှိပြီးသား Data များဖြင့် အသေးစိတ် စစ်ဆေးရန်',
        infoTitle: 'Deep Dive Analysis အကြောင်း',
        infoBody:
          'Deep Dive သည် Research Mode အသစ်တစ်ခု မဟုတ်ပါ။ Fast / Balanced / Deep Research မှ ရှာဖွေပြီးသား Product ကို ကိုယ်တိုင်ရွေးချယ်ပြီး လိုအပ်သော Analysis များကိုသာ တစ်ခုချင်း သို့မဟုတ် စုပေါင်း Run နိုင်ပါသည်။ ရှိပြီးသား Data နှင့် Cache ကို အရင်ပြန်သုံးပြီး မူရင်း Research Results၊ Ranking နှင့် Product Data များကို လုံးဝ မပြောင်းလဲပါ။',
        openDetailBtn: 'Product Detail ကြည့်ရန်',
        productIdLabel: 'Product ID',
        originModeLabel: 'မူရင်း Research Mode',
        priceLabel: 'ဈေးနှုန်း',
        commissionLabel: 'ကော်မရှင်',
        scoreLabel: '7-Factor Score',
        selectionHeading: 'Deep Dive Analysis ၈ မျိုး (ကိုယ်တိုင်ရွေးချယ် Run ရန်)',
        selectedCounter: (count: number, total: number) => `${total} ခုထဲမှ ${count} ခု ရွေးချယ်ထားသည်`,
        completedCounter: (count: number) => `ပြီးစီးပြီး ${count} ခု`,
        selectAllBtn: 'အားလုံးရွေးမည်',
        clearAllBtn: 'အားလုံးဖြုတ်မည်',
        selectedListLabel: 'ရွေးချယ်ထားသည်များ',
        noneSelectedHint: 'စစ်ဆေးလိုသော Analysis အနည်းဆုံး ၁ ခုကို ရွေးချယ်ပါ သို့မဟုတ် ကတ်တစ်ခုချင်းစီမှ Run နှိပ်ပါ။',
        statusSelected: 'ရွေးထားသည်',
        statusNotSelected: 'မရွေးရသေး',
        detailsExpand: 'အသေးစိတ်',
        detailsCollapse: 'ပိတ်မည်',
        runSingleBtn: 'Run မည်',
        rerunSingleBtn: 'ပြန် Run',
        runningBtn: 'လုပ်ဆောင်နေ...',
        highCostTag: 'Opt-in (1.0 cr · Cache မရှိမှ)',
        disclosureLabels: {
          whatItDoes: '၁။ ဒီ Analysis က ဘာလုပ်ပေးနိုင်သလဲ',
          whatItChecks: '၂။ စစ်ဆေးမည့် အချက်အလက်များ',
          expectedOutcome: '၃။ ရရှိမည့် ရလဒ်',
          requiredSources: '၄။ လိုအပ်နိုင်သည့် Data Source / API များ',
          estimatedCost: '၅။ ခန့်မှန်းကုန်ကျစရိတ်နှင့် Credit သုံးစွဲမှု',
          missingData: '၆။ Data မရရှိနိုင်သည့်အခါ ဖော်ပြပုံ',
        },
        runBtn: (count: number, running: boolean) =>
          running
            ? 'Analysis များ လုပ်ဆောင်နေပါသည်...'
            : count > 0
              ? `ရွေးထားသည့် Analysis (${count}) ခုကို Run မည်`
              : 'Analysis ရွေးချယ်ပြီးမှ Run နိုင်မည်',
        runDisabledHint: 'စုပေါင်း Run ရန် Analysis အနည်းဆုံး ၁ ခုကို အရင်ရွေးချယ်ပါ။',
        runEngineNote:
          'ရှိပြီးသား Data နှင့် Cache ကို ဦးစားပေးပြန်သုံးပါမည် · Review API သည် ရွေးချယ်မှသာ ခေါ်မည် · မူရင်း Ranking မပြောင်းလဲပါ။',
      }
    : {
        heading: 'Deep Dive Analysis',
        subheading: 'On-demand single-product execution workspace using verified APIs and cached data',
        infoTitle: 'About Deep Dive Analysis',
        infoBody:
          'Deep Dive is not a new Research Mode. Run any individual analysis module or run your selected set on any Fast, Balanced, or Deep Research product. Existing data and caches are reused first, Review Insight is strictly opt-in, and your original Research Results, Rankings, and Product Data remain untouched.',
        openDetailBtn: 'Open Product Detail',
        productIdLabel: 'Product ID',
        originModeLabel: 'Origin Mode',
        priceLabel: 'Price',
        commissionLabel: 'Commission',
        scoreLabel: '7-Factor Score',
        selectionHeading: '8 Deep Dive Analysis Modules (Manual Selection)',
        selectedCounter: (count: number, total: number) => `${count} of ${total} selected`,
        completedCounter: (count: number) => `${count} completed`,
        selectAllBtn: 'Select All',
        clearAllBtn: 'Clear All',
        selectedListLabel: 'Selected',
        noneSelectedHint: 'Select 1 or more modules to run together, or click Run on any individual module card.',
        statusSelected: 'Selected',
        statusNotSelected: 'Not Selected',
        detailsExpand: 'Details',
        detailsCollapse: 'Hide',
        runSingleBtn: 'Run',
        rerunSingleBtn: 'Re-run',
        runningBtn: 'Running...',
        highCostTag: 'Opt-in (1.0 cr if uncached)',
        disclosureLabels: {
          whatItDoes: '1. What this analysis does',
          whatItChecks: '2. Data points checked',
          expectedOutcome: '3. Expected result',
          requiredSources: '4. Required Data Sources / APIs',
          estimatedCost: '5. Estimated cost & credit guidance',
          missingData: '6. Missing or unavailable data policy',
        },
        runBtn: (count: number, running: boolean) =>
          running
            ? 'Running Selected Analyses...'
            : count > 0
              ? `Run Selected Deep Dive (${count})`
              : 'Select Options to Run',
        runDisabledHint: 'Select at least 1 analysis option before batch running.',
        runEngineNote:
          'Prioritizes existing data & cache · Review API strictly opt-in · Original rankings stay untouched.',
      };

  return (
    <div className="space-y-6">
      {/* Top Navigation & Heading Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50 transition-colors cursor-pointer py-1"
        >
          <ArrowLeft className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{backLabel}</span>
        </button>

        <button
          type="button"
          onClick={onOpenProductDetail}
          className="inline-flex items-center gap-1 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-50 transition-colors cursor-pointer py-1 whitespace-nowrap"
        >
          <span>{copy.openDetailBtn}</span>
          <ArrowUpRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        </button>
      </div>

      {/* Workspace Title */}
      <section className="space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50 leading-[1.2]">
            {copy.heading}
          </h1>
          <InfoPopover
            variant="info"
            label={copy.infoTitle}
            title={copy.infoTitle}
            content={copy.infoBody}
          />
        </div>
        <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
          {copy.subheading}
        </p>
      </section>

      {/* Connected Read-Only Product Context Card */}
      <section
        aria-label={displayName}
        className="bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-xl p-4 sm:p-5"
      >
        <div className="flex flex-col sm:flex-row items-start gap-4">
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-800 shrink-0">
            {hasVerifiedImage && product.imageUrl ? (
              <ProductImage
                src={product.imageUrl}
                fallbackSrc={product.imageOriginUrl}
                alt={product.name}
                title={displayName}
                unavailableLabel={t.cardImageUnverified}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <ImageOff className="w-5 h-5 text-zinc-400 dark:text-zinc-500" aria-hidden="true" />
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-2.5">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                <span>{categoryLabel}</span>
                <span aria-hidden="true">·</span>
                <span className="font-medium text-zinc-700 dark:text-zinc-300">
                  {copy.originModeLabel}: {originModeLabel}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                  {copy.productIdLabel}: {canonicalProductId}
                </span>
                {originalProductId !== canonicalProductId && (
                  <span className="font-mono text-[11px] text-zinc-400 dark:text-zinc-500 tabular-nums">
                    ({originalProductId})
                  </span>
                )}
              </div>

              <h2 className="font-display text-base sm:text-lg font-semibold text-zinc-950 dark:text-zinc-50 leading-snug">
                {displayName}
              </h2>
            </div>

            <dl className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-2 border-t border-zinc-100 dark:border-zinc-800/70 text-xs">
              <div>
                <dt className="text-[11px] text-zinc-500 dark:text-zinc-400">{copy.priceLabel}</dt>
                <dd className="font-mono font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums mt-0.5">
                  {product.priceThb !== null ? formatThb(product.priceThb) : t.dataStatusLabels.unavailable}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {copy.commissionLabel}
                </dt>
                <dd className="font-mono font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums mt-0.5">
                  {product.commissionRate !== null
                    ? `${product.commissionRate}%`
                    : t.dataStatusLabels.unavailable}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-zinc-500 dark:text-zinc-400">{copy.scoreLabel}</dt>
                <dd className="font-mono font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums mt-0.5">
                  {evaluation.totalScore}/100
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      {/* Manual Selection Controls & Live Selection Summary */}
      <section aria-labelledby="deep-dive-selection-heading" className="space-y-4">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-xl p-4 sm:p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Layers className="w-4 h-4 text-zinc-500 dark:text-zinc-400 shrink-0" aria-hidden="true" />
                <h2
                  id="deep-dive-selection-heading"
                  className="font-display text-sm sm:text-base font-semibold text-zinc-950 dark:text-zinc-50"
                >
                  {copy.selectionHeading}
                </h2>
              </div>
              <p className="font-mono text-xs tabular-nums text-zinc-600 dark:text-zinc-400">
                {copy.selectedCounter(selectedCount, totalCount)}
                {completedCount > 0 ? ` · ${copy.completedCounter(completedCount)}` : ''}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onSelectAll}
                disabled={allSelected || isAnyRunning}
                className="min-h-[36px] px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:border-zinc-400 dark:hover:border-zinc-500 hover:text-zinc-950 dark:hover:text-zinc-50 disabled:opacity-45 disabled:cursor-not-allowed transition-colors cursor-pointer whitespace-nowrap"
              >
                {copy.selectAllBtn}
              </button>
              <button
                type="button"
                onClick={onClearAll}
                disabled={selectedCount === 0 || isAnyRunning}
                className="min-h-[36px] px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:border-zinc-400 dark:hover:border-zinc-500 hover:text-zinc-950 dark:hover:text-zinc-50 disabled:opacity-45 disabled:cursor-not-allowed transition-colors cursor-pointer whitespace-nowrap"
              >
                {copy.clearAllBtn}
              </button>
            </div>
          </div>

          <div className="pt-2.5 border-t border-zinc-100 dark:border-zinc-800/70 text-xs leading-relaxed">
            {selectedOptionNames.length > 0 ? (
              <div className="text-zinc-700 dark:text-zinc-300">
                <span className="font-semibold text-zinc-950 dark:text-zinc-50">
                  {copy.selectedListLabel} ({selectedCount}):
                </span>{' '}
                <span>{selectedOptionNames.join(' · ')}</span>
              </div>
            ) : (
              <p className="text-zinc-500 dark:text-zinc-400">{copy.noneSelectedHint}</p>
            )}
          </div>
        </div>

        {/* 8 Independent Deep Dive Analysis Option Cards (Progressive Disclosure Preserved) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 items-start">
          {DEEP_DIVE_ANALYSIS_OPTIONS.map((option) => {
            const isSelected = workspaceState.selectedIds.includes(option.id);
            const isExpanded = workspaceState.expandedIds.includes(option.id);
            const slot = workspaceState.slots[option.id];
            const isRunning = slot.status === 'running';
            const hasRunResult = Boolean(slot.result || slot.error);
            const statusDisplay = getExecutionStatusDisplay(slot.status, isMy);

            const name = isMy ? option.nameMy : option.nameEn;
            const shortDesc = isMy ? option.shortDescriptionMy : option.shortDescriptionEn;
            const whatItDoes = isMy ? option.whatItDoesMy : option.whatItDoesEn;
            const whatItChecks = isMy ? option.whatItChecksMy : option.whatItChecksEn;
            const expectedOutcome = isMy ? option.expectedOutcomeMy : option.expectedOutcomeEn;
            const requiredSources = isMy
              ? option.requiredDataSourcesMy
              : option.requiredDataSourcesEn;
            const estimatedCost = isMy ? option.estimatedCostNoteMy : option.estimatedCostNoteEn;
            const missingData = isMy
              ? option.missingDataBehaviorMy
              : option.missingDataBehaviorEn;

            return (
              <article
                key={option.id}
                data-analysis-id={option.id}
                data-execution-status={slot.status}
                className={`bg-white dark:bg-zinc-900 border rounded-xl overflow-hidden transition-colors ${
                  isSelected
                    ? 'border-zinc-900 dark:border-zinc-200'
                    : 'border-zinc-200/90 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
                }`}
              >
                {/* Default Compact Visible Area */}
                <div className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <label
                      htmlFor={`deep-dive-opt-${option.id}`}
                      className="flex items-start gap-2.5 min-w-0 flex-1 cursor-pointer select-none"
                    >
                      <input
                        id={`deep-dive-opt-${option.id}`}
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleOption(option.id)}
                        className="mt-1 h-4 w-4 rounded border-zinc-300 dark:border-zinc-700 accent-zinc-950 dark:accent-zinc-100 cursor-pointer shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="font-mono text-[11px] text-zinc-400 dark:text-zinc-500 tabular-nums">
                            0{option.order}.
                          </span>
                          <span className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-50 leading-snug">
                            {name}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                          {shortDesc}
                        </p>
                      </div>
                    </label>
                  </div>

                  {/* Compact Status, Per-Module Run Trigger & Independent Progressive Disclosure Row */}
                  <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/70 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <span
                        className={`inline-flex items-center gap-1 font-medium whitespace-nowrap ${
                          isSelected
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-zinc-400 dark:text-zinc-500'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
                        <span>{isSelected ? copy.statusSelected : copy.statusNotSelected}</span>
                      </span>

                      <span className="text-zinc-300 dark:text-zinc-700" aria-hidden="true">
                        ·
                      </span>

                      <span
                        className={`inline-flex items-center gap-1 font-medium whitespace-nowrap ${statusDisplay.toneClass}`}
                      >
                        {isRunning && (
                          <Loader2 className="w-3 h-3 animate-spin shrink-0" aria-hidden="true" />
                        )}
                        <span>{statusDisplay.label}</span>
                      </span>

                      {option.costSensitivity === 'high' && (
                        <>
                          <span className="text-zinc-300 dark:text-zinc-700" aria-hidden="true">
                            ·
                          </span>
                          <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
                            {copy.highCostTag}
                          </span>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Per-Module Execute / Re-run Action */}
                      <button
                        type="button"
                        onClick={() => onRunSingle(option.id, false)}
                        disabled={isRunning}
                        className="inline-flex items-center gap-1 min-h-[30px] px-2.5 py-1 text-xs font-medium text-zinc-900 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-45 disabled:cursor-not-allowed rounded-md transition-colors cursor-pointer whitespace-nowrap"
                      >
                        {isRunning ? (
                          <Loader2 className="w-3 h-3 animate-spin shrink-0" aria-hidden="true" />
                        ) : hasRunResult ? (
                          <RotateCw className="w-3 h-3 shrink-0" aria-hidden="true" />
                        ) : (
                          <Play className="w-3 h-3 shrink-0" aria-hidden="true" />
                        )}
                        <span>
                          {isRunning
                            ? copy.runningBtn
                            : hasRunResult
                              ? copy.rerunSingleBtn
                              : copy.runSingleBtn}
                        </span>
                      </button>

                      {/* Independent Expand / Collapse Trigger (Never alters selection!) */}
                      <button
                        type="button"
                        onClick={() => onToggleExpand(option.id)}
                        aria-expanded={isExpanded}
                        aria-controls={`deep-dive-details-${option.id}`}
                        className="inline-flex items-center gap-1 min-h-[30px] px-2 py-1 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <span>{isExpanded ? copy.detailsCollapse : copy.detailsExpand}</span>
                        {isExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Progressive Disclosure Expanded Details (All 6 Required Sections) */}
                {isExpanded && (
                  <div
                    id={`deep-dive-details-${option.id}`}
                    className="px-4 pb-4 pt-3.5 border-t border-zinc-100 dark:border-zinc-800/70 bg-zinc-50/70 dark:bg-zinc-800/40 space-y-3 text-xs"
                  >
                    <div>
                      <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                        {copy.disclosureLabels.whatItDoes}
                      </div>
                      <p className="mt-1 text-zinc-600 dark:text-zinc-300 leading-relaxed">
                        {whatItDoes}
                      </p>
                    </div>

                    <div>
                      <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                        {copy.disclosureLabels.whatItChecks}
                      </div>
                      <ul className="mt-1 space-y-1 text-zinc-600 dark:text-zinc-300 list-disc pl-4">
                        {whatItChecks.map((point) => (
                          <li key={point} className="leading-relaxed">
                            {point}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                        {copy.disclosureLabels.expectedOutcome}
                      </div>
                      <p className="mt-1 text-zinc-600 dark:text-zinc-300 leading-relaxed">
                        {expectedOutcome}
                      </p>
                    </div>

                    <div>
                      <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                        {copy.disclosureLabels.requiredSources}
                      </div>
                      <p className="mt-1 text-zinc-600 dark:text-zinc-300 leading-relaxed">
                        {requiredSources}
                      </p>
                    </div>

                    <div>
                      <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                        {copy.disclosureLabels.estimatedCost}
                      </div>
                      <p
                        className={`mt-1 leading-relaxed ${
                          option.costSensitivity === 'high'
                            ? 'text-amber-800 dark:text-amber-300 font-medium'
                            : 'text-zinc-600 dark:text-zinc-300'
                        }`}
                      >
                        {estimatedCost}
                      </p>
                    </div>

                    <div>
                      <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                        {copy.disclosureLabels.missingData}
                      </div>
                      <p className="mt-1 text-zinc-600 dark:text-zinc-300 leading-relaxed">
                        {missingData}
                      </p>
                    </div>
                  </div>
                )}

                {/* Per-Module Isolated Execution Output (Result / Unavailable / Error) */}
                {(slot.result || slot.error) && (
                  <ModuleResultPanel
                    slot={slot}
                    language={language}
                    onRerun={(forceRefresh) => onRunSingle(option.id, forceRefresh)}
                  />
                )}
              </article>
            );
          })}
        </div>
      </section>

      {/* Batch Execution Action Bar */}
      <section
        aria-label="Deep Dive execution controls"
        className="bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-xl p-4 sm:p-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <p className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
              {canRun ? copy.selectedCounter(selectedCount, totalCount) : copy.runDisabledHint}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
              {copy.runEngineNote}
            </p>
          </div>

          <button
            type="button"
            onClick={onRunSelected}
            disabled={!canRun || isAnyRunning}
            className="inline-flex items-center justify-center gap-2 min-h-[42px] px-5 py-2 text-xs sm:text-sm font-medium text-white dark:text-zinc-950 bg-zinc-950 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 w-full sm:w-auto"
          >
            {isAnyRunning ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" aria-hidden="true" />
            ) : (
              <Play className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            )}
            <span>{copy.runBtn(selectedCount, isAnyRunning)}</span>
          </button>
        </div>
      </section>
    </div>
  );
}
