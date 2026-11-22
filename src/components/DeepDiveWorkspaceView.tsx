import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FileText,
  History,
  ImageOff,
  Layers,
  Loader2,
  Play,
  RefreshCw,
  RotateCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type {
  DeepDiveAnalysisId,
  DeepDiveAnalysisSlotState,
  DeepDiveExecutionStatus,
  DeepDiveHistoryRecord,
  DeepDiveModuleCostEstimate,
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
import {
  estimateDeepDiveExecutionCost,
  evaluateDeepDiveBudgetGuard,
} from '../utils/deepDiveEngine';
import {
  buildDeepDiveFinalReport,
  buildDeepDiveReportJson,
  buildDeepDiveReportMarkdown,
} from '../utils/deepDiveReportBuilder';
import { triggerFileDownload } from '../utils/exportReports';
import { getCategoryLabel } from '../utils/categoryRegistry';
import {
  extractCanonicalTikTokNumericId,
  fetchResolvedTikTokProductUrl,
  formatThb,
  getTikTokShopProductUrl,
  hasResolvedCanonicalTikTokSlug,
  resolveProductImageDisplayConfig,
} from '../utils/format';
import {
  DEFAULT_SPENDING_LIMIT_CREDITS,
  formatCredits,
  formatUsd,
  KALODATA_COMMENT_INSIGHT_CREDIT,
  KALODATA_USD_PER_CREDIT,
  MAX_SPENDING_LIMIT_CREDITS,
  MIN_SPENDING_LIMIT_CREDITS,
} from '../utils/kalodataPricing';
import { evaluateProductOpportunity } from '../utils/scoring';
import { TRANSLATIONS } from '../i18n/translations';
import { InfoPopover } from './InfoPopover';
import { ProductImage } from './ProductImage';

interface DeepDiveWorkspaceViewProps {
  context: DeepDiveSourceContext;
  workspaceState: DeepDiveWorkspaceState;
  evaluation?: OpportunityEvaluation | null;
  salesWeightPct: number;
  spendingLimitCredits?: number;
  onSpendingLimitChange?: (nextLimit: number) => void;
  liveBalanceCredits?: number | null;
  serverCommittedCredits?: number | null;
  budgetStorageUnavailable?: boolean;
  budgetStorageErrorEn?: string | null;
  budgetStorageErrorMy?: string | null;
  onToggleOption: (id: DeepDiveAnalysisId) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  onToggleExpand: (id: DeepDiveAnalysisId) => void;
  onRunSelected: (userConfirmedPaidExecution?: boolean) => void;
  onRunSingle: (
    id: DeepDiveAnalysisId,
    forceRefresh?: boolean,
    userConfirmedPaidExecution?: boolean
  ) => void;
  historyRecords?: DeepDiveHistoryRecord[];
  onDeleteHistoryRecord?: (recordId: string) => void;
  onBack: () => void;
  onOpenProductDetail: () => void;
  language: Language;
}

const API_REFRESHABLE_MODULES = new Set<DeepDiveAnalysisId>([
  'product-intelligence',
  'sales-market-intelligence',
  'creator-competition-analysis',
  'video-intelligence',
  'customer-review-intelligence',
]);

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
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 16).replace('T', ' ');
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
  const result: DeepDiveModuleResult | null = slot.result;
  const hasError = slot.status === 'error' && Boolean(slot.error);
  const canForceRefresh = API_REFRESHABLE_MODULES.has(slot.analysisId);

  if (!hasError && !result) return null;

  const errorBanner =
    hasError && slot.error ? (
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
          {result
            ? isMy
              ? 'အခြား Deep Dive Analysis များကို ထိခိုက်မှုမရှိပါ — အရင်ရရှိထားသော ရလဒ်ကို အောက်တွင် ဆက်လက်ထိန်းသိမ်းထားပါသည်။'
              : 'Isolated failure — your previous verified result is safely preserved below.'
            : isMy
              ? 'အခြား Deep Dive Analysis များကို ထိခိုက်မှုမရှိပါ။'
              : 'Isolated failure — other Deep Dive modules are unaffected.'}
        </div>
      </div>
    ) : null;

  if (!result) {
    return errorBanner;
  }

  const dataStatusLabel = t.dataStatusLabels[result.dataStatus];
  const headline = isMy ? result.headlineMy : result.headlineEn;
  const summary = isMy ? result.summaryMy : result.summaryEn;
  const unavailableNotes = isMy ? result.unavailableNotesMy : result.unavailableNotesEn;
  const dataSources = isMy ? result.dataSourcesMy : result.dataSourcesEn;

  return (
    <div>
      {errorBanner}
      <div className="px-4 py-4 border-t border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/40 space-y-3.5 text-xs">
        {/* Phase 9.4 Top Provenance Strip: Clear Data Status & Last Updated */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-zinc-500 dark:text-zinc-400">
          <span className={`font-semibold ${getDataStatusStyle(result.dataStatus)}`}>
            {isMy ? 'Data Status' : 'Data Status'}: {dataStatusLabel}
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">
            {isMy ? 'Last Updated' : 'Last Updated'}: {formatCompletedTime(result.completedAt, language)}
          </span>
          {result.reusedFromCache && result.apiCallsMade === 0 && !result.isAiInterpretation && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-mono text-emerald-700 dark:text-emerald-400">
                {isMy ? 'Cache / Local (0 cr)' : 'Cache / Local (0 cr)'}
              </span>
            </>
          )}
        </div>

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
              {result.isAiInterpretation || (result.aiApiCallsMade ?? 0) > 0
                ? (() => {
                    const tokens = result.aiMeta?.tokenUsage?.totalTokens;
                    const tokenPart =
                      typeof tokens === 'number' && Number.isFinite(tokens)
                        ? ` · ${tokens.toLocaleString('en-US')} tokens`
                        : '';
                    return isMy
                      ? `0 Kalodata cr · +1 Gemini AI API call${tokenPart} (ခန့်မှန်း/မတွက်နိုင်သေး · AI စရိတ် သီးခြားရှိ)`
                      : `0 Kalodata cr · +1 Gemini AI call${tokenPart} (Est./Unavailable · separate AI billing)`;
                  })()
                : result.creditsUsed > 0
                  ? `${formatCredits(result.creditsUsed)} Kalodata cr`
                  : result.reusedFromCache
                    ? '0 cr (Cache / Local)'
                    : '0 Kalodata cr'}
            </span>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => onRerun(false)}
              disabled={isRunning}
              className="inline-flex items-center gap-1 font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-50 disabled:opacity-45 cursor-pointer shrink-0 whitespace-nowrap"
            >
              <RotateCw className="w-3 h-3 shrink-0" aria-hidden="true" />
              <span>{isMy ? 'ပြန် Run (Cache)' : 'Re-run (Cache)'}</span>
            </button>

            {canForceRefresh && (
              <button
                type="button"
                onClick={() => onRerun(true)}
                disabled={isRunning}
                className="inline-flex items-center gap-1 font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50 disabled:opacity-45 cursor-pointer shrink-0 whitespace-nowrap"
              >
                <RefreshCw className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span>{isMy ? 'Data အသစ်ယူမည်' : 'Refresh Live'}</span>
              </button>
            )}
          </div>
        </div>

        <div className="leading-relaxed">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            {isMy ? 'Data Source:' : 'Data Source:'}
          </span>{' '}
          <span>{dataSources.join(' · ')}</span>
        </div>
      </div>
      </div>
    </div>
  );
}

function formatModuleCostShort(
  item: DeepDiveModuleCostEstimate,
  isMy: boolean
): string {
  if (item.separateAiBilling) {
    return isMy
      ? '0 Kalodata cr · Gemini AI (ခန့်မှန်း/မတွက်နိုင်သေး)'
      : '0 Kalodata cr · Gemini AI (Est./Unavailable)';
  }
  if (item.isSharedDeduplicated) {
    return isMy ? '0 extra cr (Shared)' : '0 extra cr (Shared)';
  }
  if (item.estimatedCredits > 0) {
    return `${formatCredits(item.estimatedCredits)} cr (${formatUsd(item.estimatedUsd)})`;
  }
  if (item.costKind === 'cached-reuse') {
    return isMy ? '0 cr (Cache)' : '0 cr (Cache)';
  }
  if (item.costKind === 'unavailable-api') {
    return isMy ? '0 cr (Unavailable)' : '0 cr (Unavailable)';
  }
  return isMy ? '0 cr (Local)' : '0 cr (Local)';
}

interface PendingRunTarget {
  mode: 'batch' | 'single';
  analysisIds: DeepDiveAnalysisId[];
  forceRefresh: boolean;
}

const SPENDING_LIMIT_PRESETS = [0.5, 1.5, 5] as const;

export function DeepDiveWorkspaceView({
  context,
  workspaceState,
  evaluation: providedEvaluation,
  salesWeightPct,
  spendingLimitCredits: providedSpendingLimit,
  onSpendingLimitChange,
  liveBalanceCredits = null,
  serverCommittedCredits = null,
  budgetStorageUnavailable = false,
  budgetStorageErrorEn = null,
  budgetStorageErrorMy = null,
  onToggleOption,
  onSelectAll,
  onClearAll,
  onToggleExpand,
  onRunSelected,
  onRunSingle,
  historyRecords = [],
  onDeleteHistoryRecord,
  onBack,
  onOpenProductDetail,
  language,
}: DeepDiveWorkspaceViewProps) {
  const t = TRANSLATIONS[language];
  const isMy = language === 'my';
  const { product, originalProductId, canonicalProductId, originResearchMode, originView } = context;

  const [localSpendingLimit, setLocalSpendingLimit] = useState<number>(
    providedSpendingLimit ?? DEFAULT_SPENDING_LIMIT_CREDITS
  );
  const effectiveSpendingLimit = providedSpendingLimit ?? localSpendingLimit;

  const handleSpendingLimitUpdate = (nextRaw: number) => {
    if (!Number.isFinite(nextRaw)) return;
    const clamped =
      Math.round(
        Math.max(MIN_SPENDING_LIMIT_CREDITS, Math.min(MAX_SPENDING_LIMIT_CREDITS, nextRaw)) * 1000
      ) / 1000;
    setLocalSpendingLimit(clamped);
    onSpendingLimitChange?.(clamped);
  };

  const [limitInputDraft, setLimitInputDraft] = useState<string>(
    formatCredits(effectiveSpendingLimit)
  );
  useEffect(() => {
    setLimitInputDraft(formatCredits(effectiveSpendingLimit));
  }, [effectiveSpendingLimit]);

  const [showCostBreakdown, setShowCostBreakdown] = useState<boolean>(false);
  const [pendingRun, setPendingRun] = useState<PendingRunTarget | null>(null);
  const confirmPanelRef = useRef<HTMLDivElement | null>(null);

  // Phase 9.4: Final Report & Browser Local History Progressive Disclosure state
  const [showFinalReport, setShowFinalReport] = useState<boolean>(false);
  const [showHistorySection, setShowHistorySection] = useState<boolean>(false);
  const [inspectedHistoryId, setInspectedHistoryId] = useState<string | null>(null);
  const [expandedHistoryIds, setExpandedHistoryIds] = useState<string[]>([]);
  const [copiedReportNotice, setCopiedReportNotice] = useState<boolean>(false);
  const [copiedTikTokLink, setCopiedTikTokLink] = useState<boolean>(false);
  const [resolvedTikTokUrl, setResolvedTikTokUrl] = useState<string | null>(() =>
    getTikTokShopProductUrl(product)
  );
  const finalReportRef = useRef<HTMLElement | null>(null);

  // Cancel stale confirmation & snapshot inspection if product changes
  useEffect(() => {
    setPendingRun(null);
    setInspectedHistoryId(null);
    setExpandedHistoryIds([]);
    setCopiedReportNotice(false);
    setCopiedTikTokLink(false);
  }, [canonicalProductId]);

  useEffect(() => {
    const syncUrl = getTikTokShopProductUrl(product);
    setResolvedTikTokUrl(syncUrl);

    const numericId = extractCanonicalTikTokNumericId(product);
    if (!numericId || hasResolvedCanonicalTikTokSlug(product)) return;

    const controller = new AbortController();
    fetchResolvedTikTokProductUrl(numericId, controller.signal).then((canonicalUrl) => {
      if (canonicalUrl && !controller.signal.aborted) {
        setResolvedTikTokUrl(canonicalUrl);
      }
    });
    return () => controller.abort();
  }, [canonicalProductId, product?.id, product?.kalodataMetrics?.productId]);

  const evaluation =
    providedEvaluation ??
    evaluateProductOpportunity(product, {
      salesWeightPct,
    });

  const displayName = isMy ? product.nameMy : product.name;
  const categoryLabel = getCategoryLabel(product.category, language);
  const originModeLabel = getOriginModeLabel(originResearchMode, language);
  const imageConfig = resolveProductImageDisplayConfig(product);

  const selectedCount = workspaceState.selectedIds.length;
  const totalCount = DEEP_DIVE_ANALYSIS_OPTIONS.length;
  const allSelected = selectedCount === totalCount;
  const canRun = canRunDeepDiveSelection(workspaceState);
  const sessionCreditsSpent =
    typeof serverCommittedCredits === 'number' && Number.isFinite(serverCommittedCredits)
      ? serverCommittedCredits
      : (workspaceState.totalCreditsUsedInSession ?? 0);

  const isAnyRunning = DEEP_DIVE_ANALYSIS_OPTIONS.some(
    (opt) => workspaceState.slots[opt.id]?.status === 'running'
  );
  const completedCount = DEEP_DIVE_ANALYSIS_OPTIONS.filter(
    (opt) => workspaceState.slots[opt.id]?.status === 'completed'
  ).length;

  // Recompute live Pre-Run Cost Estimate whenever selection, product, or completed runs (cache) change
  const cacheRefreshKey = `${workspaceState.lastAttemptedRunAt ?? ''}:${completedCount}:${sessionCreditsSpent}`;

  const selectedCostEstimate = useMemo(
    () => estimateDeepDiveExecutionCost(product, workspaceState.selectedIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [product, workspaceState.selectedIds, cacheRefreshKey]
  );

  // Per-module live cost map for compact card labels (reflects live cache & shared deduplication)
  const moduleCostMap = useMemo(() => {
    const map = new Map<DeepDiveAnalysisId, DeepDiveModuleCostEstimate>();
    for (const item of selectedCostEstimate.modules) {
      map.set(item.analysisId, item);
    }
    for (const opt of DEEP_DIVE_ANALYSIS_OPTIONS) {
      if (!map.has(opt.id)) {
        const singleEst = estimateDeepDiveExecutionCost(product, [opt.id]);
        if (singleEst.modules[0]) {
          map.set(opt.id, singleEst.modules[0]);
        }
      }
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product, selectedCostEstimate, cacheRefreshKey]);

  const selectedBudgetGuard = useMemo(
    () =>
      evaluateDeepDiveBudgetGuard(selectedCostEstimate, {
        spendingLimitCredits: effectiveSpendingLimit,
        sessionCreditsAlreadySpent: sessionCreditsSpent,
        liveBalanceCredits,
      }),
    [selectedCostEstimate, effectiveSpendingLimit, sessionCreditsSpent, liveBalanceCredits]
  );

  // Active pending run target (keeps batch selection live if user removes modules while confirming!)
  const activePendingIds = useMemo<DeepDiveAnalysisId[]>(() => {
    if (!pendingRun) return [];
    if (pendingRun.mode === 'batch') {
      return [...workspaceState.selectedIds];
    }
    return pendingRun.analysisIds;
  }, [pendingRun, workspaceState.selectedIds]);

  const pendingCostEstimate = useMemo(
    () =>
      activePendingIds.length > 0
        ? estimateDeepDiveExecutionCost(product, activePendingIds, {
            forceRefresh: pendingRun?.forceRefresh === true,
          })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [product, activePendingIds, pendingRun?.forceRefresh, cacheRefreshKey]
  );

  const pendingBudgetGuard = useMemo(
    () =>
      pendingCostEstimate
        ? evaluateDeepDiveBudgetGuard(pendingCostEstimate, {
            spendingLimitCredits: effectiveSpendingLimit,
            sessionCreditsAlreadySpent: sessionCreditsSpent,
            liveBalanceCredits,
          })
        : null,
    [pendingCostEstimate, effectiveSpendingLimit, sessionCreditsSpent, liveBalanceCredits]
  );

  // If user clears all selected modules while batch confirmation is open, close confirmation cleanly
  useEffect(() => {
    if (pendingRun?.mode === 'batch' && workspaceState.selectedIds.length === 0) {
      setPendingRun(null);
    }
  }, [pendingRun, workspaceState.selectedIds.length]);

  const scrollToConfirmPanel = () => {
    window.requestAnimationFrame(() => {
      confirmPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  };

  const handleRequestBatchRun = () => {
    if (!canRun || isAnyRunning) return;
    if (!selectedCostEstimate.requiresExplicitConfirmation) {
      // 0 Kalodata calls & 0 Gemini calls (100% local/cached) — execute directly with 0 paid APIs
      setPendingRun(null);
      onRunSelected(false);
      return;
    }
    setPendingRun({
      mode: 'batch',
      analysisIds: [...workspaceState.selectedIds],
      forceRefresh: false,
    });
    scrollToConfirmPanel();
  };

  const handleRequestSingleRun = (id: DeepDiveAnalysisId, forceRefresh = false) => {
    const singleEst = estimateDeepDiveExecutionCost(product, [id], { forceRefresh });
    if (!singleEst.requiresExplicitConfirmation) {
      // 0 Kalodata calls & 0 Gemini calls (100% local/cached) — execute directly
      setPendingRun(null);
      onRunSingle(id, forceRefresh, false);
      return;
    }
    setPendingRun({
      mode: 'single',
      analysisIds: [id],
      forceRefresh,
    });
    scrollToConfirmPanel();
  };

  const paidBlockedByBudgetStorage =
    budgetStorageUnavailable && selectedCostEstimate.plannedKalodataApiCalls > 0;
  const pendingPaidBlockedByBudgetStorage =
    budgetStorageUnavailable && (pendingCostEstimate?.plannedKalodataApiCalls ?? 0) > 0;

  const handleConfirmPendingRun = () => {
    if (!pendingRun || !pendingCostEstimate || !pendingBudgetGuard) return;
    if (!pendingBudgetGuard.canProceedWithoutLimitChange) return;
    if (pendingPaidBlockedByBudgetStorage) return;
    const target = pendingRun;
    setPendingRun(null);
    if (target.mode === 'batch') {
      onRunSelected(true);
    } else if (target.analysisIds[0]) {
      onRunSingle(target.analysisIds[0], target.forceRefresh, true);
    }
  };

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
        aiCostTag: '0 Kalodata cr · Gemini API စရိတ် သီးခြားရှိ',
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
        aiCostTag: '0 Kalodata cr · Separate Gemini API billing',
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
            {imageConfig.canRender && imageConfig.src ? (
              <ProductImage
                src={imageConfig.src}
                fallbackSrc={imageConfig.fallbackSrc}
                productId={imageConfig.productId}
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

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-zinc-100 dark:border-zinc-800/70 text-xs">
              <dl className="flex flex-wrap items-center gap-x-6 gap-y-2">
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

              {(() => {
                const tiktokUrl = resolvedTikTokUrl ?? getTikTokShopProductUrl(product);
                if (!tiktokUrl) return null;
                return (
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={tiktokUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 min-h-[34px] px-3 py-1.5 text-xs font-medium text-zinc-900 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
                    >
                      <span>
                        {isMy ? 'TikTok Shop တွင် ကြည့်ရန်' : 'Open on TikTok Shop'}
                      </span>
                      <ExternalLink className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    </a>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(tiktokUrl);
                          setCopiedTikTokLink(true);
                          setTimeout(() => setCopiedTikTokLink(false), 1600);
                        } catch {
                          // Ignore clipboard errors
                        }
                      }}
                      title={isMy ? 'လင့်ခ်ကူးယူရန်' : 'Copy link'}
                      aria-label={isMy ? 'လင့်ခ်ကူးယူရန်' : 'Copy link'}
                      className="inline-flex items-center gap-1 min-h-[34px] px-2.5 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      {copiedTikTokLink ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      )}
                      <span>{copiedTikTokLink ? (isMy ? 'ကူးပြီး' : 'Copied') : (isMy ? 'ကူးရန်' : 'Copy')}</span>
                    </button>
                  </div>
                );
              })()}
            </div>
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

                      {(() => {
                        const modEst = moduleCostMap.get(option.id);
                        if (!modEst) return null;
                        const toneClass = modEst.separateAiBilling
                          ? 'text-sky-700 dark:text-sky-400'
                          : modEst.estimatedCredits >= KALODATA_COMMENT_INSIGHT_CREDIT
                            ? 'text-amber-700 dark:text-amber-400'
                            : modEst.estimatedCredits > 0
                              ? 'text-zinc-700 dark:text-zinc-300'
                              : 'text-emerald-700 dark:text-emerald-400';
                        return (
                          <>
                            <span className="text-zinc-300 dark:text-zinc-700" aria-hidden="true">
                              ·
                            </span>
                            <span className={`text-[11px] font-mono tabular-nums font-medium ${toneClass}`}>
                              {formatModuleCostShort(modEst, isMy)}
                            </span>
                          </>
                        );
                      })()}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Per-Module Execute / Re-run Action (routed through Phase 9.3 Pre-Run Confirmation for paid/AI calls) */}
                      <button
                        type="button"
                        onClick={() => handleRequestSingleRun(option.id, false)}
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
                    onRerun={(forceRefresh) => handleRequestSingleRun(option.id, forceRefresh)}
                  />
                )}
              </article>
            );
          })}
        </div>
      </section>

      {/* Phase 9.3: Minimal Pre-Run Cost Control, Spending Limit, Inline Confirmation & Post-Run Summary */}
      <section
        aria-label="Deep Dive cost management and execution controls"
        className="bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-xl p-4 sm:p-5 space-y-4"
      >
        {/* Row 1: Pre-Run Cost Summary (Strictly Separating Kalodata Credits vs Gemini AI Billing) & Spending Limit */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 text-xs">
          {/* Kalodata Credits Column */}
          <div className="space-y-1 min-w-0">
            <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              {isMy ? 'Kalodata ခန့်မှန်းကုန်ကျစရိတ်' : 'Kalodata Estimated Cost'}
            </div>
            <div className="font-mono text-sm font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums">
              {formatCredits(selectedCostEstimate.estimatedCredits)} cr{' '}
              <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">
                ({formatUsd(selectedCostEstimate.estimatedUsd)})
              </span>
            </div>
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono tabular-nums">
              {isMy
                ? `API ${selectedCostEstimate.plannedKalodataApiCalls} ကြိမ် · Cache/Local ${selectedCostEstimate.cachedOrLocalModuleCount}${selectedCostEstimate.sharedDeduplicatedModuleCount > 0 ? ` · Shared ${selectedCostEstimate.sharedDeduplicatedModuleCount}` : ''}`
                : `${selectedCostEstimate.plannedKalodataApiCalls} API call(s) · Cache/Local ${selectedCostEstimate.cachedOrLocalModuleCount}${selectedCostEstimate.sharedDeduplicatedModuleCount > 0 ? ` · Shared ${selectedCostEstimate.sharedDeduplicatedModuleCount}` : ''}`}
            </div>
          </div>

          {/* Gemini AI Billing Column (Strictly Separate — NEVER Free) */}
          <div className="space-y-1 min-w-0 md:border-l md:border-zinc-100 md:dark:border-zinc-800 md:pl-4">
            <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              {isMy ? 'Gemini AI API Billing (သီးခြား)' : 'Gemini AI API Billing (Separate)'}
            </div>
            {selectedCostEstimate.plannedGeminiCalls > 0 ? (
              <>
                <div className="font-mono text-sm font-semibold text-sky-700 dark:text-sky-400 tabular-nums">
                  {isMy
                    ? `${selectedCostEstimate.plannedGeminiCalls} AI Call · ခန့်မှန်း/မတွက်နိုင်သေး`
                    : `${selectedCostEstimate.plannedGeminiCalls} AI Call · Est. / Unavailable`}
                </div>
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug">
                  {isMy
                    ? 'Token usage နှင့် Google Gemini Pricing အပေါ်မူတည်သည် (အခမဲ့ မဟုတ်ပါ)'
                    : 'Depends on token usage & Google Gemini pricing (NOT free)'}
                </div>
              </>
            ) : (
              <>
                <div className="font-mono text-sm font-semibold text-zinc-700 dark:text-zinc-300 tabular-nums">
                  {isMy ? '0 AI Calls' : '0 AI Calls'}
                </div>
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {isMy ? 'Option #8 မရွေးထားပါ' : 'Option #8 not selected'}
                </div>
              </>
            )}
          </div>

          {/* Spending Limit & Remaining Budget Control */}
          <div className="space-y-1.5 min-w-0 md:border-l md:border-zinc-100 md:dark:border-zinc-800 md:pl-4">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="deep-dive-spending-limit"
                className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400"
              >
                {isMy ? 'Spending Limit (Credits)' : 'Spending Limit (Credits)'}
              </label>
              <span
                className={`font-mono text-[11px] tabular-nums font-medium ${
                  selectedBudgetGuard.exceedsSpendingLimit
                    ? 'text-rose-700 dark:text-rose-400'
                    : 'text-emerald-700 dark:text-emerald-400'
                }`}
              >
                {isMy
                  ? `ကျန် Budget: ${formatCredits(selectedBudgetGuard.remainingBudgetBeforeRun)} cr`
                  : `Remaining: ${formatCredits(selectedBudgetGuard.remainingBudgetBeforeRun)} cr`}
              </span>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <input
                id="deep-dive-spending-limit"
                type="number"
                min={MIN_SPENDING_LIMIT_CREDITS}
                max={MAX_SPENDING_LIMIT_CREDITS}
                step={0.1}
                value={limitInputDraft}
                onChange={(e) => {
                  const val = e.target.value;
                  setLimitInputDraft(val);
                  const parsed = Number.parseFloat(val);
                  if (Number.isFinite(parsed) && parsed >= MIN_SPENDING_LIMIT_CREDITS) {
                    handleSpendingLimitUpdate(parsed);
                  }
                }}
                onBlur={() => {
                  const parsed = Number.parseFloat(limitInputDraft);
                  if (!Number.isFinite(parsed) || parsed < MIN_SPENDING_LIMIT_CREDITS) {
                    setLimitInputDraft(formatCredits(effectiveSpendingLimit));
                  } else {
                    handleSpendingLimitUpdate(parsed);
                  }
                }}
                className="w-20 min-h-[32px] px-2 py-1 text-xs font-mono tabular-nums text-zinc-950 dark:text-zinc-50 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-md focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-300"
              />
              {SPENDING_LIMIT_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handleSpendingLimitUpdate(preset)}
                  className={`min-h-[32px] px-2 py-1 text-[11px] font-mono tabular-nums rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
                    Math.abs(effectiveSpendingLimit - preset) < 1e-6
                      ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950 border-zinc-900 dark:border-zinc-100'
                      : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:border-zinc-400'
                  }`}
                >
                  {formatCredits(preset)}
                </button>
              ))}
            </div>

            {liveBalanceCredits !== null && (
              <div className="text-[11px] font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                {isMy
                  ? `Kalodata Balance: ${formatCredits(liveBalanceCredits)} cr`
                  : `Kalodata Balance: ${formatCredits(liveBalanceCredits)} cr`}
              </div>
            )}
          </div>
        </div>

        {/* Dedicated 1.0 Credit Review Insight Warning (Only when uncached paid call is planned) */}
        {selectedCostEstimate.hasHighCostReviewInsight && (
          <div
            role="status"
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-3 border-t border-amber-200/80 dark:border-amber-900/60 text-xs text-amber-900 dark:text-amber-200"
          >
            <div className="flex items-start gap-2 min-w-0">
              <AlertTriangle
                className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <p className="leading-relaxed">
                {isMy
                  ? `Review Insight (Option #6) သည် Cache မရှိသေးသဖြင့် Kalodata Comment Insight API ${KALODATA_COMMENT_INSIGHT_CREDIT.toFixed(1)} credit (${formatUsd(KALODATA_COMMENT_INSIGHT_CREDIT * KALODATA_USD_PER_CREDIT)}) ထပ်မံကုန်ကျပါမည်။ မလိုအပ်ပါက ဖြုတ်ပြီး ကုန်ကျစရိတ်လျှော့နိုင်ပါသည်။`
                  : `Review Insight (Option #6) is uncached and adds ${KALODATA_COMMENT_INSIGHT_CREDIT.toFixed(1)} Kalodata credit (${formatUsd(KALODATA_COMMENT_INSIGHT_CREDIT * KALODATA_USD_PER_CREDIT)}). Remove it to lower cost if not needed.`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onToggleOption('customer-review-intelligence')}
              disabled={isAnyRunning}
              className="inline-flex items-center justify-center gap-1 min-h-[34px] px-3 py-1 text-xs font-medium text-amber-950 dark:text-amber-100 bg-amber-100/80 dark:bg-amber-950/60 hover:bg-amber-200/80 dark:hover:bg-amber-900/60 border border-amber-300 dark:border-amber-800 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <X className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>
                {isMy ? 'Review Insight ဖြုတ်မည် (-1.0 cr)' : 'Remove Review Insight (-1.0 cr)'}
              </span>
            </button>
          </div>
        )}

        {/* Phase 9.3.1: Fail-Closed Persistent Budget Storage Unavailable Banner */}
        {budgetStorageUnavailable && (
          <div
            role="alert"
            data-testid="deep-dive-budget-storage-unavailable"
            className="flex items-start gap-2.5 pt-3 border-t border-rose-200/80 dark:border-rose-900/60 text-xs text-rose-900 dark:text-rose-200"
          >
            <AlertCircle
              className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <div className="space-y-0.5 min-w-0">
              <div className="font-semibold text-rose-950 dark:text-rose-100">
                {isMy
                  ? 'Persistent Budget Storage မရရှိနိုင်ပါ — Paid Kalodata API ခေါ်ဆိုမှုကို ပိတ်ထားသည်'
                  : 'Persistent Budget Storage Unavailable — Paid Kalodata Calls Blocked (Fail-Closed)'}
              </div>
              <p className="leading-relaxed text-rose-800 dark:text-rose-300">
                {isMy
                  ? (budgetStorageErrorMy ??
                    'ကုန်ကျစရိတ်လုံခြုံရေးအတွက် Persistent Budget Storage မရရှိနိုင်သေးမချင်း Paid Kalodata API များကို ယာယီပိတ်ထားပါသည်။ Local / Cache ရှိပြီးသား Analysis (0 cr) များကို ဆက်လက်အသုံးပြုနိုင်ပါသည်။')
                  : (budgetStorageErrorEn ??
                    'Paid Kalodata API calls are safely blocked until persistent budget storage is available. Zero-cost local and cached analyses remain available.')}
              </p>
            </div>
          </div>
        )}

        {/* Hard Spending Limit / Live Balance Warning */}
        {(selectedBudgetGuard.exceedsSpendingLimit || selectedBudgetGuard.exceedsLiveBalance) && (
          <div
            role="alert"
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-3 border-t border-rose-200/80 dark:border-rose-900/60 text-xs text-rose-900 dark:text-rose-200"
          >
            <div className="flex items-start gap-2 min-w-0">
              <AlertCircle
                className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <p className="leading-relaxed">
                {selectedBudgetGuard.exceedsSpendingLimit
                  ? isMy
                    ? `ခန့်မှန်းကုန်ကျစရိတ် (${formatCredits(selectedCostEstimate.estimatedCredits)} cr) သည် ကျန်ရှိသော Spending Limit (${formatCredits(selectedBudgetGuard.remainingBudgetBeforeRun)} cr) ထက် ကျော်လွန်နေသဖြင့် Paid API ခေါ်ဆိုမှုကို ပိတ်ထားပါသည်။ Analysis အချို့ဖြုတ်ပါ သို့မဟုတ် Limit တိုးပါ။`
                    : `Estimated cost (${formatCredits(selectedCostEstimate.estimatedCredits)} cr) exceeds your remaining Spending Limit (${formatCredits(selectedBudgetGuard.remainingBudgetBeforeRun)} cr). Paid API calls are blocked until you remove analyses or raise the limit.`
                  : isMy
                    ? `ခန့်မှန်းကုန်ကျစရိတ် (${formatCredits(selectedCostEstimate.estimatedCredits)} cr) သည် လက်ရှိ Kalodata Balance (${formatCredits(selectedBudgetGuard.liveBalanceCredits ?? 0)} cr) ထက် ကျော်လွန်နေပါသည်။`
                    : `Estimated cost (${formatCredits(selectedCostEstimate.estimatedCredits)} cr) exceeds your live Kalodata credit balance (${formatCredits(selectedBudgetGuard.liveBalanceCredits ?? 0)} cr).`}
              </p>
            </div>
            {selectedBudgetGuard.exceedsSpendingLimit && (
              <button
                type="button"
                onClick={() =>
                  handleSpendingLimitUpdate(selectedBudgetGuard.recommendedMinimumLimit)
                }
                className="inline-flex items-center justify-center min-h-[34px] px-3 py-1 text-xs font-medium text-rose-950 dark:text-rose-100 bg-rose-100/80 dark:bg-rose-950/60 hover:bg-rose-200/80 border border-rose-300 dark:border-rose-800 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                {isMy
                  ? `Limit ကို ${formatCredits(selectedBudgetGuard.recommendedMinimumLimit)} cr သို့ တိုးမည်`
                  : `Raise Limit to ${formatCredits(selectedBudgetGuard.recommendedMinimumLimit)} cr`}
              </button>
            )}
          </div>
        )}

        {/* Progressive Disclosure: Per-Analysis API, Data & Cost Breakdown (With Inline Remove to Reduce Cost) */}
        {selectedCount > 0 && (
          <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/70 space-y-2.5">
            <button
              type="button"
              onClick={() => setShowCostBreakdown((prev) => !prev)}
              aria-expanded={showCostBreakdown}
              aria-controls="deep-dive-cost-breakdown"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-50 transition-colors cursor-pointer"
            >
              <span>
                {showCostBreakdown
                  ? isMy
                    ? `ကုန်ကျစရိတ် အသေးစိတ် ပိတ်မည် (${selectedCount})`
                    : `Hide Cost Breakdown (${selectedCount})`
                  : isMy
                    ? `ကုန်ကျစရိတ်နှင့် API အသေးစိတ် ကြည့်မည် (${selectedCount})`
                    : `Show API & Cost Breakdown (${selectedCount})`}
              </span>
              {showCostBreakdown ? (
                <ChevronUp className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              )}
            </button>

            {showCostBreakdown && (
              <div
                id="deep-dive-cost-breakdown"
                className="overflow-x-auto border-t border-zinc-100 dark:border-zinc-800/70 pt-2"
              >
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-zinc-200/80 dark:border-zinc-800 text-[11px] text-zinc-500 dark:text-zinc-400">
                      <th className="py-1.5 pr-3 font-medium">
                        {isMy ? 'Analysis' : 'Analysis'}
                      </th>
                      <th className="py-1.5 px-2 font-medium">
                        {isMy ? 'API / Source' : 'API / Source'}
                      </th>
                      <th className="py-1.5 px-2 font-medium hidden sm:table-cell">
                        {isMy ? 'အသုံးပြုမည့် Data' : 'Data Used'}
                      </th>
                      <th className="py-1.5 px-2 font-medium text-right">
                        {isMy ? 'ခန့်မှန်းစရိတ်' : 'Est. Cost'}
                      </th>
                      <th className="py-1.5 pl-2 font-medium text-right">
                        {isMy ? 'လုပ်ဆောင်ချက်' : 'Action'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
                    {selectedCostEstimate.modules.map((item) => {
                      const def = getDeepDiveOptionById(item.analysisId);
                      const label = def ? (isMy ? def.nameMy : def.nameEn) : item.analysisId;
                      return (
                        <tr key={item.analysisId} className="align-top">
                          <td className="py-2 pr-3 font-medium text-zinc-900 dark:text-zinc-100">
                            {label}
                          </td>
                          <td className="py-2 px-2 text-[11px] text-zinc-600 dark:text-zinc-300">
                            {isMy ? item.apiLabelMy : item.apiLabelEn}
                          </td>
                          <td className="py-2 px-2 text-[11px] text-zinc-500 dark:text-zinc-400 hidden sm:table-cell">
                            {isMy ? item.dataUsedMy : item.dataUsedEn}
                          </td>
                          <td className="py-2 px-2 text-right font-mono text-[11px] tabular-nums whitespace-nowrap text-zinc-900 dark:text-zinc-100">
                            {formatModuleCostShort(item, isMy)}
                          </td>
                          <td className="py-2 pl-2 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => onToggleOption(item.analysisId)}
                              disabled={isAnyRunning}
                              className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 hover:text-rose-700 dark:hover:text-rose-400 disabled:opacity-40 cursor-pointer"
                            >
                              {isMy ? 'ဖြုတ်မည်' : 'Remove'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Inline Explicit Pre-Run Confirmation Panel (Zero Modal Dialogs — Required Before Any Paid/AI API Call) */}
        {pendingRun && pendingCostEstimate && pendingBudgetGuard && (
          <div
            ref={confirmPanelRef}
            data-testid="deep-dive-pre-run-confirmation"
            role="region"
            aria-label={
              isMy ? 'Run မလုပ်မီ ကုန်ကျစရိတ် အတည်ပြုချက်' : 'Pre-run cost confirmation'
            }
            className="pt-3.5 border-t border-zinc-300 dark:border-zinc-700 space-y-3 text-xs"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2 min-w-0">
                <ShieldCheck
                  className="w-4 h-4 text-zinc-900 dark:text-zinc-100 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div className="space-y-0.5 min-w-0">
                  <div className="font-semibold text-zinc-950 dark:text-zinc-50">
                    {isMy
                      ? 'Run မလုပ်မီ ကုန်ကျစရိတ် အတည်ပြုပါ (Paid / AI API)'
                      : 'Confirm Paid / AI API Execution Before Running'}
                  </div>
                  <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    {isMy
                      ? `ရွေးထားသည့် Analysis ${pendingCostEstimate.analysisIds.length} ခုကို Run ရန် အောက်ပါ ခန့်မှန်းစရိတ်ကို အတည်ပြုပါ — အတည်မပြုမချင်း Paid API မခေါ်ပါ။`
                      : `Review estimated cost for ${pendingCostEstimate.analysisIds.length} analysis module(s) — no paid or AI API is called until you confirm.`}
                  </p>
                </div>
              </div>
            </div>

            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-zinc-50/80 dark:bg-zinc-950/60 border border-zinc-200/80 dark:border-zinc-800 rounded-lg p-3">
              <div>
                <dt className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {isMy ? 'Kalodata Credits' : 'Kalodata Credits'}
                </dt>
                <dd className="font-mono font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums mt-0.5">
                  {formatCredits(pendingCostEstimate.estimatedCredits)} cr (
                  {formatUsd(pendingCostEstimate.estimatedUsd)}) ·{' '}
                  {pendingCostEstimate.plannedKalodataApiCalls} API
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {isMy ? 'Gemini AI API (သီးခြား)' : 'Gemini AI API (Separate)'}
                </dt>
                <dd className="font-mono font-semibold text-sky-700 dark:text-sky-400 tabular-nums mt-0.5">
                  {pendingCostEstimate.plannedGeminiCalls > 0
                    ? isMy
                      ? `${pendingCostEstimate.plannedGeminiCalls} call · ခန့်မှန်း/မတွက်နိုင်သေး`
                      : `${pendingCostEstimate.plannedGeminiCalls} call · Est. / Unavailable`
                    : '0 calls'}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {isMy ? 'Run ပြီးကျန်မည့် Budget' : 'Budget After Run'}
                </dt>
                <dd
                  className={`font-mono font-semibold tabular-nums mt-0.5 ${
                    pendingBudgetGuard.exceedsSpendingLimit
                      ? 'text-rose-700 dark:text-rose-400'
                      : 'text-emerald-700 dark:text-emerald-400'
                  }`}
                >
                  {formatCredits(Math.max(0, pendingBudgetGuard.remainingBudgetAfterRun))} /{' '}
                  {formatCredits(pendingBudgetGuard.spendingLimitCredits)} cr
                </dd>
              </div>
            </dl>

            {(pendingBudgetGuard.exceedsSpendingLimit || pendingBudgetGuard.exceedsLiveBalance) && (
              <div
                role="alert"
                data-testid="deep-dive-confirm-limit-alert"
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-2.5 bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200/80 dark:border-rose-900/60 rounded-lg text-xs text-rose-900 dark:text-rose-200"
              >
                <div className="flex items-start gap-2 min-w-0">
                  <AlertCircle
                    className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <p className="leading-relaxed">
                    {pendingBudgetGuard.exceedsSpendingLimit
                      ? isMy
                        ? `ခန့်မှန်းကုန်ကျစရိတ် (${formatCredits(pendingCostEstimate.estimatedCredits)} cr) သည် ကျန်ရှိသော Spending Limit (${formatCredits(pendingBudgetGuard.remainingBudgetBeforeRun)} cr) ထက် ကျော်လွန်နေသဖြင့် Paid API ခေါ်ဆိုမှုကို ပိတ်ထားပါသည်။`
                        : `Estimated cost (${formatCredits(pendingCostEstimate.estimatedCredits)} cr) exceeds your remaining Spending Limit (${formatCredits(pendingBudgetGuard.remainingBudgetBeforeRun)} cr). Paid API execution is blocked.`
                      : isMy
                        ? `ခန့်မှန်းကုန်ကျစရိတ် (${formatCredits(pendingCostEstimate.estimatedCredits)} cr) သည် လက်ရှိ Kalodata Balance (${formatCredits(pendingBudgetGuard.liveBalanceCredits ?? 0)} cr) ထက် ကျော်လွန်နေပါသည်။`
                        : `Estimated cost (${formatCredits(pendingCostEstimate.estimatedCredits)} cr) exceeds your live Kalodata credit balance (${formatCredits(pendingBudgetGuard.liveBalanceCredits ?? 0)} cr).`}
                  </p>
                </div>
                {pendingBudgetGuard.exceedsSpendingLimit && (
                  <button
                    type="button"
                    onClick={() =>
                      handleSpendingLimitUpdate(pendingBudgetGuard.recommendedMinimumLimit)
                    }
                    className="inline-flex items-center justify-center min-h-[32px] px-2.5 py-1 text-xs font-medium text-rose-950 dark:text-rose-100 bg-rose-100/80 dark:bg-rose-950/60 hover:bg-rose-200/80 border border-rose-300 dark:border-rose-800 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {isMy
                      ? `Limit ကို ${formatCredits(pendingBudgetGuard.recommendedMinimumLimit)} cr သို့ တိုးမည်`
                      : `Raise Limit to ${formatCredits(pendingBudgetGuard.recommendedMinimumLimit)} cr`}
                  </button>
                )}
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingRun(null)}
                className="inline-flex items-center justify-center min-h-[40px] px-4 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-200 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                {isMy ? 'မလုပ်တော့ပါ (Cancel)' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleConfirmPendingRun}
                disabled={
                  isAnyRunning ||
                  !pendingBudgetGuard.canProceedWithoutLimitChange ||
                  pendingPaidBlockedByBudgetStorage
                }
                className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-5 py-2 text-xs font-semibold text-white dark:text-zinc-950 bg-zinc-950 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                <Check className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>
                  {isMy ? 'အတည်ပြုပြီး Run မည်' : 'Confirm & Run'}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Primary Batch Action Row */}
        {!pendingRun && (
          <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/70 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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
              onClick={handleRequestBatchRun}
              disabled={
                !canRun ||
                isAnyRunning ||
                selectedBudgetGuard.exceedsSpendingLimit ||
                selectedBudgetGuard.exceedsLiveBalance ||
                paidBlockedByBudgetStorage
              }
              className="inline-flex items-center justify-center gap-2 min-h-[42px] px-5 py-2 text-xs sm:text-sm font-medium text-white dark:text-zinc-950 bg-zinc-950 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 w-full sm:w-auto"
            >
              {isAnyRunning ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" aria-hidden="true" />
              ) : (
                <Play className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              )}
              <span>
                {isAnyRunning
                  ? copy.runBtn(selectedCount, true)
                  : selectedCount > 0 && selectedCostEstimate.requiresExplicitConfirmation
                    ? isMy
                      ? `စရိတ်စစ်ပြီး Run မည် (${selectedCount})`
                      : `Review & Run (${selectedCount})`
                    : copy.runBtn(selectedCount, false)}
              </span>
            </button>
          </div>
        )}

        {/* Post-Run Summary: Estimated vs Actual Cost, Cache Reuse, API Calls & Remaining Budget */}
        {workspaceState.lastRunSummary && (
          <div
            data-testid="deep-dive-post-run-summary"
            className="pt-3.5 border-t border-zinc-200/80 dark:border-zinc-800 space-y-2 text-xs"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                {isMy
                  ? 'နောက်ဆုံး Run ရလဒ် — ခန့်မှန်း vs အမှန်တကယ် ကုန်ကျစရိတ်'
                  : 'Last Run Summary — Estimated vs Actual Cost'}
              </span>
              <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                {formatCompletedTime(workspaceState.lastRunSummary.completedAt, language)}
              </span>
            </div>

            <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-[11px]">
              <div>
                <dt className="text-zinc-500 dark:text-zinc-400">
                  {isMy ? 'Kalodata (ခန့်မှန်း → အမှန်)' : 'Kalodata (Est. → Actual)'}
                </dt>
                <dd className="font-mono font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums mt-0.5">
                  {formatCredits(workspaceState.lastRunSummary.estimatedKalodataCredits)} cr →{' '}
                  {formatCredits(workspaceState.lastRunSummary.actualKalodataCredits)} cr (
                  {formatUsd(workspaceState.lastRunSummary.actualKalodataUsd)})
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500 dark:text-zinc-400">
                  {isMy ? 'API Calls နှင့် Cache Reuse' : 'API Calls & Cache Reuse'}
                </dt>
                <dd className="font-mono font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums mt-0.5">
                  {isMy
                    ? `API ${workspaceState.lastRunSummary.actualKalodataApiCalls} · Cache/Local ${workspaceState.lastRunSummary.cacheOrLocalReuseCount} · Shared ${workspaceState.lastRunSummary.deduplicatedSharedCallsCount}`
                    : `API ${workspaceState.lastRunSummary.actualKalodataApiCalls} · Cache/Local ${workspaceState.lastRunSummary.cacheOrLocalReuseCount} · Shared ${workspaceState.lastRunSummary.deduplicatedSharedCallsCount}`}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500 dark:text-zinc-400">
                  {isMy ? 'Gemini AI API (သီးခြား)' : 'Gemini AI API (Separate)'}
                </dt>
                <dd className="font-mono font-semibold text-sky-700 dark:text-sky-400 tabular-nums mt-0.5">
                  {workspaceState.lastRunSummary.actualGeminiCalls > 0
                    ? (() => {
                        const tok = workspaceState.lastRunSummary.geminiTokenUsage?.totalTokens;
                        return typeof tok === 'number'
                          ? `${workspaceState.lastRunSummary.actualGeminiCalls} call · ${tok.toLocaleString('en-US')} tok · ${isMy ? 'ခန့်မှန်း/မတွက်နိုင်သေး' : 'Est./Unavailable'}`
                          : `${workspaceState.lastRunSummary.actualGeminiCalls} call · ${isMy ? 'ခန့်မှန်း/မတွက်နိုင်သေး' : 'Est./Unavailable'}`;
                      })()
                    : '0 calls'}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500 dark:text-zinc-400">
                  {isMy ? 'ကျန်ရှိသော Budget' : 'Remaining Budget'}
                </dt>
                <dd className="font-mono font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums mt-0.5">
                  {formatCredits(workspaceState.lastRunSummary.remainingBudgetCredits)} /{' '}
                  {formatCredits(workspaceState.lastRunSummary.spendingLimitCredits)} cr
                  {workspaceState.lastRunSummary.liveBalanceAfter !== null && (
                    <span className="text-zinc-500 dark:text-zinc-400 font-normal">
                      {' '}
                      · Bal {formatCredits(workspaceState.lastRunSummary.liveBalanceAfter)}
                    </span>
                  )}
                </dd>
              </div>
            </dl>
          </div>
        )}
      </section>

      {/* Phase 9.4: Consolidated Final Deep Dive Report (Inline Progressive Disclosure, Zero Modals) */}
      {(() => {
        const inspectedHistoryRecord =
          inspectedHistoryId
            ? (historyRecords.find((rec) => rec.id === inspectedHistoryId) ?? null)
            : null;
        const reportSlots = inspectedHistoryRecord
          ? inspectedHistoryRecord.slotsSnapshot
          : workspaceState.slots;
        const finalReport = buildDeepDiveFinalReport({
          context,
          slots: reportSlots,
          evaluation,
          salesWeightPct,
        });
        const hasAnyRunOutput =
          finalReport.completedModulesCount +
            finalReport.unavailableModulesCount +
            finalReport.errorModulesCount >
          0;
        const isReportExpanded = showFinalReport || Boolean(inspectedHistoryRecord);

        const handleCopyFinalReport = async () => {
          const markdown = buildDeepDiveReportMarkdown(finalReport, language);
          try {
            if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
              await navigator.clipboard.writeText(markdown);
              setCopiedReportNotice(true);
              window.setTimeout(() => setCopiedReportNotice(false), 2200);
            }
          } catch {
            // Clipboard unavailable in restricted context — fallback to download
            triggerFileDownload(
              markdown,
              `siampick-deep-dive-${canonicalProductId}.md`,
              'text/markdown;charset=utf-8'
            );
          }
        };

        const handleExportMarkdown = () => {
          const markdown = buildDeepDiveReportMarkdown(finalReport, language);
          triggerFileDownload(
            markdown,
            `siampick-deep-dive-${canonicalProductId}.md`,
            'text/markdown;charset=utf-8'
          );
        };

        const handleExportJson = () => {
          const jsonStr = buildDeepDiveReportJson(finalReport);
          triggerFileDownload(
            jsonStr,
            `siampick-deep-dive-${canonicalProductId}.json`,
            'application/json;charset=utf-8'
          );
        };

        return (
          <section
            ref={finalReportRef}
            data-testid="deep-dive-final-report"
            aria-labelledby="deep-dive-final-report-heading"
            className="bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-xl p-4 sm:p-5 space-y-4"
          >
            {/* Report Header & Export Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <FileText
                    className="w-4 h-4 text-zinc-500 dark:text-zinc-400 shrink-0"
                    aria-hidden="true"
                  />
                  <h2
                    id="deep-dive-final-report-heading"
                    className="font-display text-sm sm:text-base font-semibold text-zinc-950 dark:text-zinc-50"
                  >
                    {isMy
                      ? 'Deep Dive စုစည်းအစီရင်ခံစာ (Final Report)'
                      : 'Consolidated Deep Dive Final Report'}
                  </h2>
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500 dark:text-zinc-400 font-mono tabular-nums">
                  <span>
                    {isMy
                      ? `ပြီးစီးပြီး ${finalReport.completedModulesCount}/${finalReport.totalModulesCount}`
                      : `${finalReport.completedModulesCount}/${finalReport.totalModulesCount} completed`}
                  </span>
                  {finalReport.unavailableModulesCount > 0 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-amber-700 dark:text-amber-400">
                        {finalReport.unavailableModulesCount}{' '}
                        {isMy ? 'မရရှိနိုင်' : 'unavailable'}
                      </span>
                    </>
                  )}
                  <span aria-hidden="true">·</span>
                  <span>
                    {finalReport.notRunModulesCount} {isMy ? 'မ Run ရသေး' : 'not run'}
                  </span>
                  {finalReport.lastUpdatedAt && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>
                        {isMy ? 'Updated' : 'Updated'}:{' '}
                        {formatCompletedTime(finalReport.lastUpdatedAt, language)}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                {hasAnyRunOutput && (
                  <>
                    <button
                      type="button"
                      onClick={() => void handleCopyFinalReport()}
                      className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                    >
                      {copiedReportNotice ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      )}
                      <span>
                        {copiedReportNotice
                          ? isMy
                            ? 'ကူးယူပြီး'
                            : 'Copied'
                          : isMy
                            ? 'Report ကူးယူမည်'
                            : 'Copy Report'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={handleExportMarkdown}
                      className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>Markdown</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleExportJson}
                      className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>JSON</span>
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => {
                    if (inspectedHistoryRecord) {
                      setInspectedHistoryId(null);
                    }
                    setShowFinalReport((prev) => !prev);
                  }}
                  aria-expanded={isReportExpanded}
                  aria-controls="deep-dive-final-report-body"
                  className="inline-flex items-center gap-1 min-h-[36px] px-3 py-1.5 text-xs font-medium text-zinc-900 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                >
                  <span>
                    {isReportExpanded
                      ? isMy
                        ? 'Report ပိတ်မည်'
                        : 'Hide Report'
                      : isMy
                        ? 'Final Report ကြည့်မည်'
                        : 'View Final Report'}
                  </span>
                  {isReportExpanded ? (
                    <ChevronUp className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            {/* Historical Snapshot Inspection Notice */}
            {inspectedHistoryRecord && (
              <div
                role="status"
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-3 border-t border-sky-200/80 dark:border-sky-900/60 text-xs text-sky-900 dark:text-sky-200"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Clock className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" aria-hidden="true" />
                  <span>
                    {isMy
                      ? `History မှတ်တမ်း (${formatCompletedTime(inspectedHistoryRecord.analyzedAt, language)}) ကို ပြန်ကြည့်နေပါသည် — API မခေါ်ပါ။`
                      : `Inspecting historical snapshot from ${formatCompletedTime(inspectedHistoryRecord.analyzedAt, language)} — 0 API calls.`}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setInspectedHistoryId(null)}
                  className="inline-flex items-center justify-center min-h-[30px] px-2.5 py-1 text-xs font-medium text-sky-900 dark:text-sky-100 bg-sky-100/80 dark:bg-sky-950/60 hover:bg-sky-200/80 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  {isMy ? 'လက်ရှိရလဒ်သို့ ပြန်သွားမည်' : 'Return to Latest'}
                </button>
              </div>
            )}

            {isReportExpanded && (
              <div
                id="deep-dive-final-report-body"
                className="pt-3.5 border-t border-zinc-200/80 dark:border-zinc-800 space-y-5"
              >
                {/* Decision Overview Strip */}
                <dl className="grid grid-cols-2 lg:grid-cols-4 gap-4 pb-4 border-b border-zinc-100 dark:border-zinc-800/80 text-xs">
                  <div>
                    <dt className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      {isMy ? '7-Factor Score' : '7-Factor Score'}
                    </dt>
                    <dd className="font-mono text-sm font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums mt-0.5">
                      {finalReport.overallScore}/100{' '}
                      <span className="text-[11px] font-normal text-zinc-500 dark:text-zinc-400">
                        ({finalReport.confidencePct}%)
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      {isMy ? 'AI Verdict (သီးခြား)' : 'AI Verdict (Separate)'}
                    </dt>
                    <dd className="font-mono text-sm font-semibold text-zinc-950 dark:text-zinc-50 mt-0.5">
                      {finalReport.aiVerdict ?? (isMy ? 'မ Run ရသေး' : 'Not Run')}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      {isMy ? 'Kalodata စရိတ် (Report)' : 'Kalodata Cost (Report)'}
                    </dt>
                    <dd className="font-mono text-sm font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums mt-0.5">
                      {formatCredits(finalReport.totalKalodataCreditsUsed)} cr{' '}
                      <span className="text-[11px] font-normal text-zinc-500 dark:text-zinc-400">
                        ({formatUsd(finalReport.totalKalodataUsdUsed)})
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      {isMy ? 'Gemini AI Calls (သီးခြား)' : 'Gemini AI Calls (Separate)'}
                    </dt>
                    <dd className="font-mono text-sm font-semibold text-sky-700 dark:text-sky-400 tabular-nums mt-0.5">
                      {finalReport.totalGeminiApiCalls}{' '}
                      <span className="text-[11px] font-normal text-zinc-500 dark:text-zinc-400">
                        {finalReport.totalGeminiApiCalls > 0
                          ? isMy
                            ? '· ခန့်မှန်း/မတွက်နိုင်သေး'
                            : '· Est./Unavailable'
                          : isMy
                            ? 'call'
                            : 'calls'}
                      </span>
                    </dd>
                  </div>
                </dl>

                {/* All 8 Consolidated Decision Sections (Unrun / Unavailable explicitly shown — never hidden) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                  {finalReport.sections.map((sec) => {
                    const secTitle = isMy ? sec.titleMy : sec.titleEn;
                    const secHeadline = isMy ? sec.headlineMy : sec.headlineEn;
                    const secSummary = isMy ? sec.summaryMy : sec.summaryEn;
                    const secHighlights = isMy ? sec.highlightsMy : sec.highlightsEn;
                    const secNotes = isMy ? sec.unavailableNotesMy : sec.unavailableNotesEn;
                    const secSources = isMy ? sec.dataSourcesMy : sec.dataSourcesEn;
                    const primaryRunId = sec.sourceAnalysisIds[0];

                    return (
                      <div
                        key={sec.id}
                        data-report-section-id={sec.id}
                        className="pt-3.5 border-t border-zinc-200/80 dark:border-zinc-800 space-y-2.5 text-xs"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-0.5 min-w-0">
                            <h3 className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-50 leading-snug">
                              {secTitle}
                            </h3>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                              <span className={`font-semibold ${getDataStatusStyle(sec.dataStatus)}`}>
                                {t.dataStatusLabels[sec.dataStatus]}
                              </span>
                              {sec.availability === 'not-run' && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span>{isMy ? 'မ Run ရသေး' : 'Not Run'}</span>
                                </>
                              )}
                              {sec.isAiInterpretation && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="text-sky-700 dark:text-sky-400 font-medium">
                                    {isMy ? 'AI Interpretation (သီးခြား)' : 'AI Interpretation'}
                                  </span>
                                </>
                              )}
                              {sec.lastUpdatedAt && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="font-mono tabular-nums">
                                    {formatCompletedTime(sec.lastUpdatedAt, language)}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          {sec.availability === 'not-run' &&
                            !inspectedHistoryRecord &&
                            primaryRunId && (
                              <button
                                type="button"
                                onClick={() => handleRequestSingleRun(primaryRunId, false)}
                                disabled={isAnyRunning}
                                className="inline-flex items-center gap-1 min-h-[30px] px-2.5 py-1 text-[11px] font-medium text-zinc-800 dark:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-45 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
                              >
                                <Play className="w-3 h-3 shrink-0" aria-hidden="true" />
                                <span>{isMy ? 'Run မည်' : 'Run'}</span>
                              </button>
                            )}
                        </div>

                        <div className="space-y-1">
                          <div className="font-medium text-zinc-900 dark:text-zinc-100 leading-snug">
                            {secHeadline}
                          </div>
                          <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                            {secSummary}
                          </p>
                        </div>

                        {sec.metrics.length > 0 && (
                          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 pt-2 border-t border-zinc-100 dark:border-zinc-800/70">
                            {sec.metrics.map((metric) => (
                              <div key={`${sec.id}-${metric.key}`} className="min-w-0">
                                <dt className="flex items-center justify-between gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                                  <span className="truncate">
                                    {isMy ? metric.labelMy : metric.labelEn}
                                  </span>
                                  <span
                                    className={`font-medium shrink-0 ${getDataStatusStyle(metric.status)}`}
                                  >
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

                        {secHighlights.length > 0 && (
                          <ul className="space-y-1 text-zinc-600 dark:text-zinc-300 list-disc pl-4">
                            {secHighlights.map((item, idx) => (
                              <li key={`${sec.id}-h-${idx}`} className="leading-relaxed">
                                {item}
                              </li>
                            ))}
                          </ul>
                        )}

                        {secNotes.length > 0 && (
                          <div className="text-[11px] text-amber-800 dark:text-amber-300/90 space-y-0.5">
                            {secNotes.slice(0, 3).map((note, idx) => (
                              <p key={`${sec.id}-n-${idx}`} className="leading-relaxed">
                                • {note}
                              </p>
                            ))}
                          </div>
                        )}

                        {secSources.length > 0 && (
                          <div className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                            <span className="font-medium text-zinc-700 dark:text-zinc-300">
                              Source:
                            </span>{' '}
                            {secSources.join(' · ')}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Consolidated Report Sources Footer */}
                <div className="pt-3 border-t border-zinc-200/80 dark:border-zinc-800 text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">
                    {isMy ? 'Report Data Sources:' : 'Report Data Sources:'}
                  </span>{' '}
                  {(isMy ? finalReport.allDataSourcesMy : finalReport.allDataSourcesEn).length > 0
                    ? (isMy ? finalReport.allDataSourcesMy : finalReport.allDataSourcesEn).join(' · ')
                    : isMy
                      ? 'Baseline Research Product Data (Deep Dive Module များ မ Run ရသေးပါ)'
                      : 'Baseline Research Product Data (no Deep Dive modules executed yet)'}
                </div>
              </div>
            )}
          </section>
        );
      })()}

      {/* Phase 9.4: Per-Product Deep Dive Analysis History (Transparent Browser Local Storage) */}
      <section
        data-testid="deep-dive-analysis-history"
        aria-labelledby="deep-dive-history-heading"
        className="bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-xl p-4 sm:p-5 space-y-3"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <History
                className="w-4 h-4 text-zinc-500 dark:text-zinc-400 shrink-0"
                aria-hidden="true"
              />
              <h2
                id="deep-dive-history-heading"
                className="font-display text-sm sm:text-base font-semibold text-zinc-950 dark:text-zinc-50"
              >
                {isMy
                  ? 'Deep Dive Analysis မှတ်တမ်း (Analysis History)'
                  : 'Deep Dive Analysis History'}
              </h2>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              <span className="font-mono tabular-nums">
                {historyRecords.length}{' '}
                {isMy ? 'ကြိမ် သိမ်းဆည်းထားသည်' : historyRecords.length === 1 ? 'saved run' : 'saved runs'}
              </span>
              {' · '}
              {isMy
                ? 'ဤ Browser localStorage ထဲတွင်သာ သိမ်းဆည်းထားသည် (Cloud Database မဟုတ်ပါ)'
                : 'Stored locally in this browser (localStorage — not synced to a remote database)'}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowHistorySection((prev) => !prev)}
            aria-expanded={showHistorySection}
            aria-controls="deep-dive-history-list"
            className="inline-flex items-center gap-1 min-h-[36px] px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 self-start sm:self-auto"
          >
            <span>
              {showHistorySection
                ? isMy
                  ? 'မှတ်တမ်း ပိတ်မည်'
                  : 'Hide History'
                : isMy
                  ? `မှတ်တမ်း ကြည့်မည် (${historyRecords.length})`
                  : `View History (${historyRecords.length})`}
            </span>
            {showHistorySection ? (
              <ChevronUp className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            )}
          </button>
        </div>

        {showHistorySection && (
          <div
            id="deep-dive-history-list"
            className="pt-3 border-t border-zinc-200/80 dark:border-zinc-800 space-y-3 text-xs"
          >
            {historyRecords.length === 0 ? (
              <p className="text-zinc-500 dark:text-zinc-400 leading-relaxed">
                {isMy
                  ? 'ဤ Product အတွက် Deep Dive Analysis မှတ်တမ်း မရှိသေးပါ။ အထက်ပါ Module တစ်ခုခုကို Run လိုက်သည်နှင့် Analysis Date၊ Data Source၊ Cost နှင့် Result Status များကို ဤနေရာတွင် အလိုအလျောက် သိမ်းဆည်းပေးပါမည်။'
                  : 'No Deep Dive history saved for this product yet. Once you run any analysis module above, its date, data sources, cost, and result status will be saved here automatically.'}
              </p>
            ) : (
              <div className="divide-y divide-zinc-200/80 dark:divide-zinc-800">
                {historyRecords.map((rec) => {
                  const isExpandedRec = expandedHistoryIds.includes(rec.id);
                  const isInspected = inspectedHistoryId === rec.id;
                  const recSources = isMy ? rec.dataSourcesMy : rec.dataSourcesEn;
                  const runTypeLabel =
                    rec.runType === 'refresh'
                      ? isMy
                        ? 'Data အသစ်ယူမှု'
                        : 'Live Refresh'
                      : rec.runType === 'rerun'
                        ? isMy
                          ? 'ပြန် Run'
                          : 'Re-run'
                        : isMy
                          ? 'ပထမအကြိမ်'
                          : 'Initial Run';
                  const statusTone =
                    rec.overallStatus === 'completed'
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : rec.overallStatus === 'error'
                        ? 'text-rose-700 dark:text-rose-400'
                        : 'text-amber-700 dark:text-amber-400';

                  return (
                    <div key={rec.id} className="py-3 first:pt-0 last:pb-0 space-y-2">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span className="font-mono font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums">
                              {formatCompletedTime(rec.analyzedAt, language)}
                            </span>
                            <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-700">
                              ·
                            </span>
                            <span className={`font-semibold ${statusTone}`}>
                              {rec.overallStatus === 'completed'
                                ? isMy
                                  ? 'ပြီးစီးပြီး'
                                  : 'Completed'
                                : rec.overallStatus === 'partial'
                                  ? isMy
                                    ? 'တစ်စိတ်တစ်ပိုင်း'
                                    : 'Partial'
                                  : rec.overallStatus === 'unavailable'
                                    ? isMy
                                      ? 'Unavailable'
                                      : 'Unavailable'
                                    : isMy
                                      ? 'Error'
                                      : 'Error'}
                            </span>
                            <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-700">
                              ·
                            </span>
                            <span className="text-zinc-600 dark:text-zinc-300">{runTypeLabel}</span>
                            <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-700">
                              ·
                            </span>
                            <span className="font-mono tabular-nums text-zinc-600 dark:text-zinc-400">
                              {formatCredits(rec.kalodataCreditsUsed)} cr ({formatUsd(rec.kalodataUsdUsed)})
                              {rec.geminiApiCalls > 0
                                ? ` · +${rec.geminiApiCalls} Gemini AI`
                                : ''}
                            </span>
                          </div>
                          <div className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                            <span>
                              {rec.analysisIds
                                .map((id) => {
                                  const opt = getDeepDiveOptionById(id);
                                  return opt ? (isMy ? opt.nameMy : opt.nameEn) : id;
                                })
                                .join(' · ')}
                            </span>
                          </div>
                          {recSources.length > 0 && (
                            <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                              <span className="font-medium text-zinc-700 dark:text-zinc-300">
                                Sources:
                              </span>{' '}
                              {recSources.join(' · ')}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setInspectedHistoryId(isInspected ? null : rec.id);
                              if (!isInspected) {
                                setShowFinalReport(true);
                                window.requestAnimationFrame(() => {
                                  finalReportRef.current?.scrollIntoView({
                                    behavior: 'smooth',
                                    block: 'nearest',
                                  });
                                });
                              }
                            }}
                            className={`inline-flex items-center gap-1 min-h-[30px] px-2.5 py-1 text-[11px] font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
                              isInspected
                                ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950 border-zinc-900 dark:border-zinc-100'
                                : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700 hover:border-zinc-400'
                            }`}
                          >
                            <span>
                              {isInspected
                                ? isMy
                                  ? 'ကြည့်နေသည်'
                                  : 'Viewing'
                                : isMy
                                  ? 'Report တွင်ကြည့်မည်'
                                  : 'Inspect in Report'}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setExpandedHistoryIds((prev) =>
                                prev.includes(rec.id)
                                  ? prev.filter((item) => item !== rec.id)
                                  : [...prev, rec.id]
                              )
                            }
                            aria-expanded={isExpandedRec}
                            className="inline-flex items-center gap-1 min-h-[30px] px-2 py-1 text-[11px] font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50 rounded-md cursor-pointer whitespace-nowrap"
                          >
                            <span>{isExpandedRec ? (isMy ? 'ပိတ်' : 'Hide') : isMy ? 'အသေးစိတ်' : 'Details'}</span>
                            {isExpandedRec ? (
                              <ChevronUp className="w-3 h-3 shrink-0" aria-hidden="true" />
                            ) : (
                              <ChevronDown className="w-3 h-3 shrink-0" aria-hidden="true" />
                            )}
                          </button>

                          {onDeleteHistoryRecord && (
                            <button
                              type="button"
                              onClick={() => {
                                if (inspectedHistoryId === rec.id) {
                                  setInspectedHistoryId(null);
                                }
                                onDeleteHistoryRecord(rec.id);
                              }}
                              aria-label={isMy ? 'မှတ်တမ်းဖျက်မည်' : 'Delete history entry'}
                              className="inline-flex items-center justify-center min-h-[30px] min-w-[30px] text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-md transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </div>

                      {isExpandedRec && rec.moduleEntries.length > 0 && (
                        <div className="pt-2 pl-2 border-t border-zinc-100 dark:border-zinc-800/70 space-y-1.5 text-[11px]">
                          {rec.moduleEntries.map((entry) => {
                            const opt = getDeepDiveOptionById(entry.analysisId);
                            const modName = opt
                              ? isMy
                                ? opt.nameMy
                                : opt.nameEn
                              : entry.analysisId;
                            return (
                              <div
                                key={`${rec.id}-${entry.analysisId}`}
                                className="flex flex-wrap items-baseline justify-between gap-2 text-zinc-600 dark:text-zinc-300"
                              >
                                <div className="min-w-0">
                                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                                    {modName}
                                  </span>
                                  {' — '}
                                  <span>{isMy ? entry.headlineMy : entry.headlineEn}</span>
                                </div>
                                <div className="font-mono tabular-nums text-zinc-500 dark:text-zinc-400 whitespace-nowrap shrink-0">
                                  {entry.dataStatus
                                    ? t.dataStatusLabels[entry.dataStatus]
                                    : entry.status}
                                  {' · '}
                                  {entry.aiApiCallsMade > 0
                                    ? `0 cr · +${entry.aiApiCallsMade} AI`
                                    : entry.creditsUsed > 0
                                      ? `${formatCredits(entry.creditsUsed)} cr`
                                      : entry.reusedFromCache
                                        ? '0 cr (Cache)'
                                        : '0 cr'}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
