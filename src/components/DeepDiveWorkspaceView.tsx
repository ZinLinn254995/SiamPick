import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ChevronsDownUp,
  ChevronsUpDown,
  Clapperboard,
  Clock,
  Coins,
  Copy,
  Download,
  ExternalLink,
  FileText,
  History,
  ImageOff,
  Layers,
  Loader2,
  MessageSquareText,
  Package,
  Play,
  RefreshCw,
  RotateCw,
  Scale,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  TrendingUp,
  Users,
  Video,
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
  DeepDiveVideoCreativeOptions,
  DeepDiveWorkspaceState,
} from '../types/deepDive';
import type {
  AiRecommendationVerdict,
  DataStatus,
  Language,
  OpportunityEvaluation,
  ProductDecisionVerdict,
  ResearchMode,
} from '../types/product';
import {
  canRunDeepDiveSelection,
  DEEP_DIVE_ANALYSIS_OPTIONS,
  DEFAULT_DEEP_DIVE_VIDEO_CREATIVE_OPTIONS,
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
  getScrollBehavior,
  prefersReducedMotion,
  useBodyScrollLock,
} from '../hooks/useDialogA11y';
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
import {
  MOTION_TRANSITIONS,
  MOTION_VARIANTS,
  TACTILE_INTERACTIONS,
} from '../utils/motionPresets';
import { InfoPopover } from './InfoPopover';
import { ProductImage } from './ProductImage';
import { TechnicalSignalStrip } from './TechnicalSignalStrip';
import { AnimatedNumber, ScoreRing, StateMessage, StatusDot, VerdictBadge } from './visual';
import {
  DeepDiveVideoCreativePanel,
  VideoCreativeConfigBar,
} from './DeepDiveVideoCreativePanel';

function mapAiVerdictToDecisionVerdict(
  verdict: AiRecommendationVerdict
): ProductDecisionVerdict {
  if (verdict === 'priority-test') return 'recommended';
  if (verdict === 'test-with-caution' || verdict === 'monitor') return 'worth-testing';
  if (verdict === 'skip') return 'not-recommended';
  return 'need-more-data';
}

function getCreditDecimals(value: number): number {
  if (!Number.isFinite(value) || value === 0 || Number.isInteger(value)) return 0;
  return Math.abs(value * 10 - Math.round(value * 10)) < 1e-6 ? 1 : 2;
}

interface ModuleHeadlineSummary {
  status: DataStatus;
  tone: 'emerald' | 'amber' | 'red' | 'zinc';
  primaryText: string;
  secondaryText?: string;
}

function getModuleHeadlineSummary(
  slot: DeepDiveAnalysisSlotState,
  language: Language
): ModuleHeadlineSummary {
  const isMy = language === 'my';
  const t = TRANSLATIONS[language];

  if (slot.status === 'error' && slot.error) {
    return {
      status: 'unavailable',
      tone: 'red',
      primaryText: t.deepDiveHeadlineError,
      secondaryText: slot.error.code,
    };
  }

  const result = slot.result;
  if (!result) {
    return {
      status: 'unavailable',
      tone: 'zinc',
      primaryText:
        slot.status === 'running'
          ? isMy
            ? 'လုပ်ဆောင်နေသည်...'
            : 'Running...'
          : t.deepDiveHeadlineNotRun,
    };
  }

  // Module 08: AI Business Verdict chip
  if (result.analysisId === 'ai-strategic-recommendation' && result.aiMeta?.verdict) {
    const verdict = result.aiMeta.verdict;
    const tone: ModuleHeadlineSummary['tone'] =
      verdict === 'priority-test'
        ? 'emerald'
        : verdict === 'test-with-caution'
          ? 'amber'
          : verdict === 'skip'
            ? 'red'
            : 'zinc';
    return {
      status: result.dataStatus,
      tone,
      primaryText: t.aiVerdictLabels[verdict],
    };
  }

  // Module 09: Ad Video Creative Blueprint count chip
  if (result.analysisId === 'ad-video-creative-blueprint' && result.videoCreative) {
    const bp = result.videoCreative;
    const text = t.deepDiveHeadlineReadyScript
      .replace('{hooks}', String(bp.hooks.length))
      .replace('{scenes}', String(bp.scriptScenes.length));
    return {
      status: result.dataStatus,
      tone: bp.hooks.length > 0 ? 'emerald' : 'zinc',
      primaryText: text,
    };
  }

  // Modules 01-07 (and fallback): First available key metric
  const primaryMetric =
    result.metrics.find((m) => m.status !== 'unavailable') ?? result.metrics[0];
  if (primaryMetric) {
    const tone: ModuleHeadlineSummary['tone'] =
      primaryMetric.status === 'verified'
        ? 'emerald'
        : primaryMetric.status === 'estimated'
          ? 'amber'
          : 'zinc';
    return {
      status: primaryMetric.status,
      tone,
      primaryText: isMy ? primaryMetric.valueMy : primaryMetric.valueEn,
      secondaryText: isMy ? primaryMetric.labelMy : primaryMetric.labelEn,
    };
  }

  return {
    status: result.dataStatus,
    tone: result.dataStatus === 'verified' ? 'emerald' : result.dataStatus === 'estimated' ? 'amber' : 'zinc',
    primaryText: isMy ? result.headlineMy : result.headlineEn,
  };
}

function headlineChipClass(tone: ModuleHeadlineSummary['tone']): string {
  if (tone === 'emerald') {
    return 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/70';
  }
  if (tone === 'amber') {
    return 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/70';
  }
  if (tone === 'red') {
    return 'bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800/70';
  }
  return 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700';
}

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
  onUpdateVideoCreativeOptions?: (next: DeepDiveVideoCreativeOptions) => void;
  onRunSelected: (userConfirmedPaidExecution?: boolean) => void;
  onRunSingle: (
    id: DeepDiveAnalysisId,
    forceRefresh?: boolean,
    userConfirmedPaidExecution?: boolean
  ) => void;
  historyRecords?: DeepDiveHistoryRecord[];
  onDeleteHistoryRecord?: (recordId: string) => void;
  onBack: () => void;
  backLabelOverride?: string;
  onOpenProductDetail: () => void;
  language: Language;
}

const API_REFRESHABLE_MODULES = new Set<DeepDiveAnalysisId>([
  'product-intelligence',
  'sales-market-intelligence',
  'creator-competition-analysis',
  'video-intelligence',
  'customer-review-intelligence',
  'ad-video-creative-blueprint',
]);

function getOriginModeLabel(mode: ResearchMode, language: Language): string {
  const t = TRANSLATIONS[language];
  if (mode === 'deep') return t.modeDeepTitle;
  if (mode === 'balanced') return t.modeBalancedTitle;
  return t.modeFastTitle;
}

const DEEP_DIVE_CHIP_ICONS: Record<DeepDiveAnalysisId, typeof Package> = {
  'product-intelligence': Package,
  'sales-market-intelligence': TrendingUp,
  'affiliate-profit-analysis': Coins,
  'creator-competition-analysis': Users,
  'video-intelligence': Video,
  'customer-review-intelligence': MessageSquareText,
  'market-competitor-comparison': Scale,
  'ai-strategic-recommendation': Sparkles,
  'ad-video-creative-blueprint': Clapperboard,
};

function formatClockTimeHms(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function formatCompletedTime(
  iso: string | null,
  language: Language,
  includeSeconds = false
): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat(language === 'my' ? 'en-GB' : 'en-US', {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      ...(includeSeconds ? { second: '2-digit' } : {}),
    }).format(date);
  } catch {
    return date.toISOString().slice(0, includeSeconds ? 19 : 16).replace('T', ' ');
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

interface ModuleRunFeedbackState {
  phase: 'pulsing' | 'updated';
  mode: 'cache-local' | 'live';
  triggeredAt: number;
  completedAtIso: string;
}

interface ModuleResultPanelProps {
  slot: DeepDiveAnalysisSlotState;
  language: Language;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  runFeedback?: ModuleRunFeedbackState | null;
  onRerun: (forceRefresh?: boolean) => void;
  onApplyConceptToBrief?: (suggestionText: string) => void;
}

function ModuleResultPanel({
  slot,
  language,
  isCollapsed,
  onToggleCollapse,
  runFeedback = null,
  onRerun,
  onApplyConceptToBrief,
}: ModuleResultPanelProps) {
  const isMy = language === 'my';
  const prefersReduced = useReducedMotion();
  const t = TRANSLATIONS[language];
  const isRunning = slot.status === 'running';
  const isVisuallyRunning = isRunning || runFeedback?.phase === 'pulsing';
  const isRecentlyUpdated = !isVisuallyRunning && runFeedback?.phase === 'updated';
  const result: DeepDiveModuleResult | null = slot.result;
  const hasError = slot.status === 'error' && Boolean(slot.error);
  const canForceRefresh = API_REFRESHABLE_MODULES.has(slot.analysisId);

  if (!hasError && !result) return null;

  const errorBanner =
    hasError && slot.error ? (
      <div
        role="alert"
        className="px-4 py-3.5 border-t border-red-200 dark:border-red-800/60 bg-red-50/80 dark:bg-red-950/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
      >
        <div className="flex items-start sm:items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-950/80 text-red-600 dark:text-red-400 inline-flex items-center justify-center shrink-0">
            <AlertCircle className="w-4 h-4" aria-hidden="true" />
          </div>
          <p className="text-red-900 dark:text-red-200 leading-snug min-w-0">
            <span className="font-semibold">
              {isMy ? slot.error.messageMy : slot.error.messageEn}
            </span>{' '}
            <span className="font-mono text-red-700 dark:text-red-400">({slot.error.code})</span>
          </p>
        </div>

        <button
          type="button"
          onClick={() => onRerun(false)}
          disabled={isVisuallyRunning}
          className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3.5 py-1.5 text-xs font-medium text-white bg-red-700 hover:bg-red-800 dark:bg-red-600 dark:hover:bg-red-500 rounded-lg transition-colors cursor-pointer shrink-0 whitespace-nowrap disabled:opacity-60"
        >
          <RotateCw
            className={`w-3.5 h-3.5 shrink-0 ${isVisuallyRunning ? 'animate-spin motion-reduce:animate-none' : ''}`}
            aria-hidden="true"
          />
          <span>{isMy ? 'ထပ်စမ်းမည်' : 'Retry'}</span>
        </button>
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
      <div
        className={`border-t border-[var(--sp-border)] transition-colors duration-300 ${
          isRecentlyUpdated
            ? 'bg-emerald-500/[0.06] dark:bg-[#10F5A0]/[0.06]'
            : isVisuallyRunning
              ? 'bg-cyan-500/[0.06] dark:bg-[#25F4EE]/[0.06]'
              : 'bg-[var(--sp-surface-muted)]'
        }`}
      >
        {/* Collapsible Result Summary Bar + Unmistakable Re-run Feedback */}
        <div className="px-3.5 sm:px-4 py-2.5 flex items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0 text-zinc-500 dark:text-zinc-400">
            {isVisuallyRunning ? (
              <span className="inline-flex items-center gap-1.5 font-semibold text-cyan-700 dark:text-[#25F4EE]">
                <Loader2 className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none shrink-0" aria-hidden="true" />
                <span>{isMy ? 'ပြန် Run နေသည်...' : 'Re-running module...'}</span>
              </span>
            ) : isRecentlyUpdated ? (
              <span
                role="status"
                data-testid={`deep-dive-rerun-feedback-${slot.analysisId}`}
                className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400"
              >
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>
                  {runFeedback?.mode === 'live'
                    ? isMy
                      ? 'ယခုလေးတင် Data အသစ်ယူပြီး'
                      : 'Updated just now · Live Refreshed'
                    : isMy
                      ? 'ယခုလေးတင် ပြန် Run ပြီး · Cache/Local (0 cr)'
                      : 'Updated just now · Cache/Local (0 cr)'}
                </span>
              </span>
            ) : (
              <span className={`font-semibold ${getDataStatusStyle(result.dataStatus)}`}>
                Data Status: {dataStatusLabel}
              </span>
            )}
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {isMy ? 'Last Updated' : 'Last Updated'}:{' '}
              {formatCompletedTime(result.completedAt, language, true)}
            </span>
            {!isRecentlyUpdated &&
              !isVisuallyRunning &&
              result.reusedFromCache &&
              result.apiCallsMade === 0 &&
              !result.isAiInterpretation && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono text-emerald-700 dark:text-emerald-400">
                    Cache / Local (0 cr)
                  </span>
                </>
              )}
          </div>

          <button
            type="button"
            onClick={onToggleCollapse}
            aria-expanded={!isCollapsed}
            aria-controls={`deep-dive-result-body-${slot.analysisId}`}
            className="inline-flex items-center gap-1 min-h-[36px] px-2.5 py-1 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-50 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 rounded-md transition-colors cursor-pointer shrink-0 whitespace-nowrap"
          >
            <span>
              {isCollapsed
                ? isMy
                  ? 'ရလဒ်ကြည့်မည်'
                  : 'Show Result'
                : isMy
                  ? 'ရလဒ်ခေါက်မည်'
                  : 'Hide Result'}
            </span>
            {isCollapsed ? (
              <ChevronDown className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <ChevronUp className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            )}
          </button>
        </div>

        {/* Compact 1-Line Preview When Result Is Collapsed */}
        {isCollapsed && (
          <div className="px-3.5 sm:px-4 pb-3 pt-0.5 text-xs text-zinc-600 dark:text-zinc-400 truncate">
            <span className="font-medium text-zinc-800 dark:text-zinc-200">{headline}</span>
          </div>
        )}

        <AnimatePresence initial={false}>
          {!isCollapsed && (
            <motion.div
              key={`result-body-${slot.analysisId}`}
              initial={prefersReduced ? false : { height: 0, opacity: 0 }}
              animate={{
                height: 'auto',
                opacity: 1,
                transitionEnd: { overflow: 'visible' },
              }}
              exit={prefersReduced ? undefined : { height: 0, opacity: 0, overflow: 'hidden' }}
              transition={MOTION_TRANSITIONS.accordion}
              className="overflow-hidden"
            >
              <div
                id={`deep-dive-result-body-${slot.analysisId}`}
                className={`px-3.5 sm:px-4 pb-4 pt-2.5 border-t border-[var(--sp-border)] space-y-3.5 text-xs transition-opacity duration-200 ${
                  isVisuallyRunning ? 'opacity-60' : 'opacity-100'
                }`}
              >
                {/* Executive Stamped GO / CAUTION / NO-GO Verdict Lock-In (Module 08) */}
                {result.analysisId === 'ai-strategic-recommendation' && result.aiMeta?.verdict && (() => {
                  const aiVerdict = result.aiMeta.verdict;
                  const bannerClass =
                    aiVerdict === 'priority-test'
                      ? 'bg-emerald-500/[0.08] dark:bg-[#10F5A0]/[0.09] border-emerald-500/35 dark:border-[#10F5A0]/40'
                      : aiVerdict === 'test-with-caution' || aiVerdict === 'monitor'
                        ? 'bg-amber-500/[0.08] dark:bg-amber-400/[0.09] border-amber-500/35 dark:border-amber-400/35'
                        : aiVerdict === 'skip'
                          ? 'bg-rose-500/[0.08] dark:bg-[#FE2C55]/[0.10] border-rose-500/35 dark:border-[#FE2C55]/40'
                          : 'bg-[var(--sp-surface)] border-[var(--sp-border)]';
                  return (
                    <div
                      className={`p-3 rounded-xl border flex flex-wrap items-center justify-between gap-2.5 ${bannerClass}`}
                    >
                      <div className="flex flex-wrap items-center gap-2.5 min-w-0">
                        <VerdictBadge
                          verdict={mapAiVerdictToDecisionVerdict(aiVerdict)}
                          size="md"
                          language={language}
                          animateStamp
                        />
                        <div className="min-w-0">
                          <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                            {isMy ? 'AI စီးပွားရေးဆုံးဖြတ်ချက်' : 'Executive AI Verdict'}
                          </div>
                          <div className="font-display text-sm font-bold text-zinc-950 dark:text-zinc-50 leading-snug">
                            {t.aiVerdictLabels[aiVerdict]}
                          </div>
                        </div>
                      </div>
                      <span className="font-mono text-[11px] tabular-nums text-zinc-600 dark:text-zinc-300 px-2 py-0.5 rounded-md bg-[var(--sp-surface)] border border-[var(--sp-border)]">
                        {isMy ? 'Market Data #01–#07 အခြေခံ' : 'Grounded in #01–#07'}
                      </span>
                    </div>
                  );
                })()}

                {/* Strict Separation Banner for AI Interpretation vs Verified Market Data */}
                {result.isAiInterpretation && (
                  <div className="flex items-start gap-2 pb-2.5 border-b border-cyan-500/20 dark:border-[#25F4EE]/20 text-cyan-950 dark:text-cyan-100">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-600 dark:text-[#25F4EE] shrink-0 mt-0.5" aria-hidden="true" />
                    <div className="leading-relaxed">
                      <span className="font-semibold">
                        {result.analysisId === 'ad-video-creative-blueprint'
                          ? isMy
                            ? 'AI Content Creative Studio (Video ဖန်တီးမှု Blueprint)'
                            : 'AI Ad Video Creative Studio (Production & SEO Blueprint)'
                          : isMy
                            ? 'AI စီးပွားရေးဆုံးဖြတ်ချက် (လုပ်သင့်/မလုပ်သင့်)'
                            : 'AI Business Decision (Strategic Go / No-Go)'}
                      </span>
                      <span className="text-cyan-900/85 dark:text-cyan-200/85">
                        {' — '}
                        {result.analysisId === 'ad-video-creative-blueprint'
                          ? isMy
                            ? 'AI Content Video ရိုက်ကူးတင်ရန်အတွက် Script၊ Hooks၊ SEO Title/Keywords/Hashtags နှင့် မူဝါဒသတိပေးချက်များကို Gemini မှ ထုတ်ပေးထားပါသည်။'
                            : 'Actionable ad video production blueprint (concepts, hooks, script, TikTok SEO & policy guard) generated by Gemini AI.'
                          : isMy
                            ? 'အတည်ပြုပြီး Market Data (#01–#07) အပေါ် အခြေခံ၍ ဤကုန်ပစ္စည်းကို စမ်းသပ်ရောင်းချသင့်/မသင့် စီးပွားရေးဆုံးဖြတ်ချက် သီးသန့်ဖြစ်ပါသည်။'
                            : 'Pure business Go/No-Go synthesis grounded in verified market data (#01–#07) — separate from ad video production (#09).'}
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
              <dt className="flex items-center justify-between gap-2 text-xs text-zinc-500 dark:text-zinc-400">
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
          <table className="w-full text-left border-collapse text-xs">
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
          <div className="divide-y divide-zinc-200/70 dark:divide-zinc-800/70 border border-zinc-200/70 dark:border-zinc-800/80 rounded-lg overflow-hidden sp-surface-muted">
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
                      className="inline-flex items-center gap-0.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50 shrink-0"
                    >
                      <span>{isMy ? 'ဖွင့်မည်' : 'Open'}</span>
                      <ExternalLink className="w-3 h-3" aria-hidden="true" />
                    </a>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-zinc-500 dark:text-zinc-400 font-mono tabular-nums">
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

      {/* Module #09 Rich Interactive Ad Video Creative & SEO Blueprint Panel */}
      {result.analysisId === 'ad-video-creative-blueprint' && result.videoCreative ? (
        <DeepDiveVideoCreativePanel
          blueprint={result.videoCreative}
          language={language}
          onApplyConceptToBrief={onApplyConceptToBrief}
        />
      ) : (
        /* Structured Sections (Modules #01–#08) */
        result.sections.map((section) => {
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
        })
      )}

      {/* Honest Unavailable / Limitations Disclosure */}
      {unavailableNotes.length > 0 && (
        <div className="pt-2.5 border-t border-zinc-200/70 dark:border-zinc-800/80 space-y-1 text-xs text-amber-800 dark:text-amber-300/90">
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
      <div className="pt-2.5 border-t border-zinc-200/80 dark:border-zinc-800 flex flex-col gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
            <span className={`font-semibold ${getDataStatusStyle(result.dataStatus)}`}>
              {isMy ? 'Data အဆင့်' : 'Status'}: {dataStatusLabel}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {isMy ? 'ပြီးစီးချိန်' : 'Completed'}: {formatCompletedTime(result.completedAt, language, true)}
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
                    const kaloPart =
                      result.creditsUsed > 0
                        ? `${formatCredits(result.creditsUsed)} Kalodata cr`
                        : result.reusedFromCache && result.analysisId === 'ad-video-creative-blueprint'
                          ? '0 Kalodata cr (Cache)'
                          : '0 Kalodata cr';
                    return isMy
                      ? `${kaloPart} · +1 Gemini AI call${tokenPart} (AI စရိတ် သီးခြားရှိ)`
                      : `${kaloPart} · +1 Gemini AI call${tokenPart} (separate AI billing)`;
                  })()
                : result.creditsUsed > 0
                  ? `${formatCredits(result.creditsUsed)} Kalodata cr`
                  : result.reusedFromCache
                    ? '0 cr (Cache / Local)'
                    : '0 Kalodata cr'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => onRerun(false)}
              disabled={isVisuallyRunning}
              className="inline-flex items-center gap-1 min-h-[36px] px-2.5 py-1 rounded-md font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-50 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 disabled:opacity-45 transition-colors cursor-pointer shrink-0 whitespace-nowrap"
            >
              <RotateCw
                className={`w-3 h-3 shrink-0 ${isVisuallyRunning ? 'animate-spin motion-reduce:animate-none text-sky-600 dark:text-sky-400' : ''}`}
                aria-hidden="true"
              />
              <span>
                {isVisuallyRunning
                  ? isMy
                    ? 'ပြန် Run နေ...'
                    : 'Re-running...'
                  : isMy
                    ? 'ပြန် Run (Cache)'
                    : 'Re-run (Cache)'}
              </span>
            </button>

            {canForceRefresh && (
              <button
                type="button"
                onClick={() => onRerun(true)}
                disabled={isVisuallyRunning}
                className="inline-flex items-center gap-1 min-h-[36px] px-2.5 py-1 rounded-md font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 disabled:opacity-45 transition-colors cursor-pointer shrink-0 whitespace-nowrap"
              >
                <RefreshCw
                  className={`w-3 h-3 shrink-0 ${isVisuallyRunning ? 'animate-spin motion-reduce:animate-none' : ''}`}
                  aria-hidden="true"
                />
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
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function formatModuleCostShort(
  item: DeepDiveModuleCostEstimate,
  isMy: boolean
): string {
  if (item.separateAiBilling && item.estimatedCredits > 0) {
    return `${formatCredits(item.estimatedCredits)} cr (${formatUsd(item.estimatedUsd)}) + Gemini AI`;
  }
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
  onUpdateVideoCreativeOptions,
  onRunSelected,
  onRunSingle,
  historyRecords = [],
  onDeleteHistoryRecord,
  onBack,
  backLabelOverride,
  onOpenProductDetail,
  language,
}: DeepDiveWorkspaceViewProps) {
  const t = TRANSLATIONS[language];
  const isMy = language === 'my';
  const prefersReduced = useReducedMotion();
  const { product, originalProductId, canonicalProductId, originResearchMode, originView } = context;

  const [localVideoCreativeOptions, setLocalVideoCreativeOptions] =
    useState<DeepDiveVideoCreativeOptions>(
      workspaceState.videoCreativeOptions ?? { ...DEFAULT_DEEP_DIVE_VIDEO_CREATIVE_OPTIONS }
    );
  const videoCreativeOptions = workspaceState.videoCreativeOptions ?? localVideoCreativeOptions;

  const handleVideoCreativeOptionsChange = (next: DeepDiveVideoCreativeOptions) => {
    setLocalVideoCreativeOptions(next);
    onUpdateVideoCreativeOptions?.(next);
  };

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

  const [pendingRun, setPendingRun] = useState<PendingRunTarget | null>(null);
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState<boolean>(false);
  const [collapsedResultIds, setCollapsedResultIds] = useState<DeepDiveAnalysisId[]>([]);
  const [jumpHighlightId, setJumpHighlightId] = useState<DeepDiveAnalysisId | null>(null);
  const [moduleFeedbackById, setModuleFeedbackById] = useState<
    Partial<Record<DeepDiveAnalysisId, ModuleRunFeedbackState>>
  >({});
  const [runFeedbackToast, setRunFeedbackToast] = useState<{
    id: number;
    tone: 'success' | 'error' | 'info';
    title: string;
    detail?: string;
  } | null>(null);
  const [liveRunAnnouncement, setLiveRunAnnouncement] = useState<string>('');

  const cardRefs = useRef<Partial<Record<DeepDiveAnalysisId, HTMLElement | null>>>({});
  const videoStudioCardRef = useRef<HTMLElement | null>(null);
  const checkoutModalRef = useRef<HTMLDivElement | null>(null);
  const lastFocusedBeforeModalRef = useRef<HTMLElement | null>(null);
  const feedbackTimersRef = useRef<Record<string, number>>({});
  const jumpHighlightTimerRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const trackedRunsRef = useRef<
    Map<
      DeepDiveAnalysisId,
      {
        mode: 'cache-local' | 'live';
        isRerun: boolean;
        startedAt: number;
        priorUpdatedAt: string | null;
      }
    >
  >(new Map());
  const latestSlotsRef = useRef(workspaceState.slots);
  latestSlotsRef.current = workspaceState.slots;

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

  const isCheckoutModalOpen = Boolean(pendingRun) || isBudgetModalOpen;

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      Object.values(feedbackTimersRef.current).forEach((timerId) => window.clearTimeout(timerId));
      if (jumpHighlightTimerRef.current !== null) {
        window.clearTimeout(jumpHighlightTimerRef.current);
      }
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  // Cancel stale confirmation, modal, collapse & snapshot inspection if product changes
  useEffect(() => {
    setPendingRun(null);
    setIsBudgetModalOpen(false);
    setCollapsedResultIds([]);
    setJumpHighlightId(null);
    setModuleFeedbackById({});
    setRunFeedbackToast(null);
    trackedRunsRef.current.clear();
    setInspectedHistoryId(null);
    setExpandedHistoryIds([]);
    setCopiedReportNotice(false);
    setCopiedTikTokLink(false);
  }, [canonicalProductId]);

  useBodyScrollLock(isCheckoutModalOpen);

  // Escape closes Checkout / Budget Modal & traps keyboard focus inside dialog/bottom sheet
  useEffect(() => {
    if (!isCheckoutModalOpen) return;

    lastFocusedBeforeModalRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const getFocusableElements = (): HTMLElement[] => {
      const container = checkoutModalRef.current;
      if (!container) return [];
      return Array.from(
        container.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null || el.getClientRects().length > 0);
    };

    const rafId = window.requestAnimationFrame(() => {
      const focusables = getFocusableElements();
      if (focusables.length > 0) {
        focusables[0].focus();
      } else {
        checkoutModalRef.current?.focus();
      }
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPendingRun(null);
        setIsBudgetModalOpen(false);
        return;
      }

      if (event.key === 'Tab') {
        const focusables = getFocusableElements();
        if (focusables.length === 0) {
          event.preventDefault();
          checkoutModalRef.current?.focus();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;

        if (event.shiftKey) {
          if (!active || active === first || !checkoutModalRef.current?.contains(active)) {
            event.preventDefault();
            last.focus();
          }
        } else if (!active || active === last || !checkoutModalRef.current?.contains(active)) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('keydown', handleKeyDown);
      if (lastFocusedBeforeModalRef.current?.isConnected) {
        lastFocusedBeforeModalRef.current.focus();
      }
    };
  }, [isCheckoutModalOpen]);

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

  // Recompute live Pre-Run Cost Estimate whenever selection, product, options, or completed runs (cache) change
  const videoOptionsKey = [
    videoCreativeOptions.includeCompetitorVideos ? '1' : '0',
    videoCreativeOptions.scriptLanguage,
    videoCreativeOptions.videoStyle,
    videoCreativeOptions.duration,
    videoCreativeOptions.tone ?? '',
    videoCreativeOptions.framework ?? '',
    videoCreativeOptions.targetAudience ?? '',
    (videoCreativeOptions.sellingFocuses ?? []).join(','),
    videoCreativeOptions.ctaStyle ?? '',
    videoCreativeOptions.aiVideoTool ?? '',
    videoCreativeOptions.customSuggestion ?? '',
    videoCreativeOptions.customKeyword ?? '',
  ].join(':');
  const cacheRefreshKey = `${workspaceState.lastAttemptedRunAt ?? ''}:${completedCount}:${sessionCreditsSpent}:${videoOptionsKey}`;

  const selectedCostEstimate = useMemo(
    () =>
      estimateDeepDiveExecutionCost(product, workspaceState.selectedIds, {
        videoCreativeOptions,
      }),
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
        const singleEst = estimateDeepDiveExecutionCost(product, [opt.id], {
          videoCreativeOptions,
        });
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
            videoCreativeOptions,
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

  const showRunToast = (
    title: string,
    detail: string | undefined,
    tone: 'success' | 'error' | 'info' = 'success'
  ) => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    setRunFeedbackToast({ id: Date.now(), tone, title, detail });
    toastTimerRef.current = window.setTimeout(() => {
      setRunFeedbackToast(null);
      toastTimerRef.current = null;
    }, 4200);
  };

  const finalizeVisualFeedback = (
    ids: DeepDiveAnalysisId[],
    mode: 'cache-local' | 'live',
    isRerun: boolean
  ) => {
    const nowIso = new Date().toISOString();
    const erroredIds: DeepDiveAnalysisId[] = [];
    const succeededIds: DeepDiveAnalysisId[] = [];

    for (const id of ids) {
      const slot = latestSlotsRef.current[id];
      trackedRunsRef.current.delete(id);
      if (slot?.status === 'error') {
        erroredIds.push(id);
        setModuleFeedbackById((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      } else {
        succeededIds.push(id);
        setModuleFeedbackById((prev) => ({
          ...prev,
          [id]: {
            phase: 'updated',
            mode,
            triggeredAt: Date.now(),
            completedAtIso: slot?.result?.completedAt ?? nowIso,
          },
        }));
        const clearKey = `clear:${id}`;
        if (feedbackTimersRef.current[clearKey]) {
          window.clearTimeout(feedbackTimersRef.current[clearKey]);
        }
        feedbackTimersRef.current[clearKey] = window.setTimeout(() => {
          setModuleFeedbackById((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
          delete feedbackTimersRef.current[clearKey];
        }, 3000);
      }
    }

    const hmsTime = formatClockTimeHms(nowIso);

    if (erroredIds.length > 0) {
      const errNums = erroredIds
        .map((id) => getDeepDiveOptionById(id))
        .filter(Boolean)
        .map((d) => `0${d!.order}`)
        .join(', ');
      setLiveRunAnnouncement(
        t.deepDiveAriaFailed.replace('{nums}', errNums || erroredIds[0]).replace('{time}', hmsTime)
      );
      const firstDef = getDeepDiveOptionById(erroredIds[0]);
      const modLabel = firstDef
        ? `0${firstDef.order} · ${isMy ? firstDef.nameMy : firstDef.nameEn}`
        : erroredIds[0];
      showRunToast(
        isMy
          ? `${modLabel} လုပ်ဆောင်မှု မအောင်မြင်ပါ`
          : `${modLabel} encountered an error`,
        isMy
          ? 'အသေးစိတ်ကို သက်ဆိုင်ရာကတ်တွင် ကြည့်နိုင်ပါသည်။'
          : 'Check the module card for details.',
        'error'
      );
      return;
    }

    if (succeededIds.length > 0) {
      const okNums = succeededIds
        .map((id) => getDeepDiveOptionById(id))
        .filter(Boolean)
        .map((d) => `0${d!.order}`)
        .join(', ');
      setLiveRunAnnouncement(
        t.deepDiveAriaFinished
          .replace('{nums}', okNums || succeededIds[0])
          .replace('{time}', hmsTime)
      );
      const timeText = formatCompletedTime(nowIso, language, true);
      if (succeededIds.length === 1) {
        const def = getDeepDiveOptionById(succeededIds[0]);
        const label = def ? `0${def.order} · ${isMy ? def.nameMy : def.nameEn}` : succeededIds[0];
        showRunToast(
          isMy
            ? `${label} ${isRerun ? 'ပြန် Run ပြီးပါပြီ' : 'Run ပြီးပါပြီ'}`
            : `${label} ${isRerun ? 're-run complete' : 'completed'}`,
          mode === 'live'
            ? isMy
              ? `Live Refresh / AI · ${timeText}`
              : `Live Refreshed / AI · ${timeText}`
            : isMy
              ? `Cache / Local ပြန်သုံးထားသည် (0 cr) · ${timeText}`
              : `Reused Cache / Local (0 cr) · ${timeText}`,
          'success'
        );
      } else {
        const nums = succeededIds
          .map((id) => getDeepDiveOptionById(id))
          .filter(Boolean)
          .map((d) => `0${d!.order}`)
          .join(' · ');
        showRunToast(
          isMy
            ? `Analysis ${succeededIds.length} ခု (${nums}) ပြီးစီးပါပြီ`
            : `${succeededIds.length} modules (${nums}) completed`,
          mode === 'live'
            ? isMy
              ? `Live / AI ပါဝင်သည် · ${timeText}`
              : `Includes Live / AI updates · ${timeText}`
            : isMy
              ? `Cache / Local (0 cr) · ${timeText}`
              : `Cache / Local (0 cr) · ${timeText}`,
          'success'
        );
      }
    }
  };

  const triggerVisualRunFeedback = (
    ids: DeepDiveAnalysisId[],
    mode: 'cache-local' | 'live',
    isRerun: boolean
  ) => {
    if (ids.length === 0) return;
    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    const runningNums = ids
      .map((id) => getDeepDiveOptionById(id))
      .filter(Boolean)
      .map((d) => `0${d!.order}`)
      .join(', ');
    setLiveRunAnnouncement(t.deepDiveAriaRunning.replace('{nums}', runningNums || ids[0]));

    // Always auto-expand target module results so user immediately sees updates
    setCollapsedResultIds((prev) => prev.filter((id) => !ids.includes(id)));

    setModuleFeedbackById((prev) => {
      const next = { ...prev };
      for (const id of ids) {
        next[id] = {
          phase: 'pulsing',
          mode,
          triggeredAt: now,
          completedAtIso: nowIso,
        };
      }
      return next;
    });

    for (const id of ids) {
      trackedRunsRef.current.set(id, {
        mode,
        isRerun,
        startedAt: now,
        priorUpdatedAt: latestSlotsRef.current[id]?.updatedAt ?? null,
      });
      const existingTimer = feedbackTimersRef.current[`pulse:${id}`];
      if (existingTimer) {
        window.clearTimeout(existingTimer);
      }
    }

    // For instant cache/local runs, guarantee a smooth ~380ms visible feedback pulse even if React completes in <2ms
    if (mode === 'cache-local') {
      const batchKey = `pulse:${ids.join(',')}`;
      if (feedbackTimersRef.current[batchKey]) {
        window.clearTimeout(feedbackTimersRef.current[batchKey]);
      }
      feedbackTimersRef.current[batchKey] = window.setTimeout(() => {
        const settled = ids.filter(
          (id) =>
            trackedRunsRef.current.has(id) && latestSlotsRef.current[id]?.status !== 'running'
        );
        if (settled.length > 0) {
          finalizeVisualFeedback(settled, mode, isRerun);
        }
        delete feedbackTimersRef.current[batchKey];
      }, 380);
    }
  };

  // Watch async live/AI runs transitioning out of 'running' to finalize visual feedback cleanly
  useEffect(() => {
    if (trackedRunsRef.current.size === 0) return;
    const readyToFinalize: Array<{
      id: DeepDiveAnalysisId;
      mode: 'cache-local' | 'live';
      isRerun: boolean;
      startedAt: number;
    }> = [];

    trackedRunsRef.current.forEach((meta, id) => {
      const slot = workspaceState.slots[id];
      if (!slot) return;
      const changedTimestamp = slot.updatedAt !== null && slot.updatedAt !== meta.priorUpdatedAt;
      if (slot.status !== 'running' && (changedTimestamp || slot.status === 'error')) {
        readyToFinalize.push({
          id,
          mode: meta.mode,
          isRerun: meta.isRerun,
          startedAt: meta.startedAt,
        });
      }
    });

    if (readyToFinalize.length === 0) return;

    // Group by mode so batch completions produce one crisp toast
    const byMode = new Map<string, typeof readyToFinalize>();
    for (const item of readyToFinalize) {
      const key = `${item.mode}:${item.isRerun ? '1' : '0'}`;
      const list = byMode.get(key) ?? [];
      list.push(item);
      byMode.set(key, list);
    }

    byMode.forEach((group) => {
      const earliestStart = Math.min(...group.map((g) => g.startedAt));
      const remainingMinPulseMs = Math.max(0, 360 - (Date.now() - earliestStart));
      const ids = group.map((g) => g.id);
      const mode = group[0].mode;
      const isRerun = group[0].isRerun;

      for (const id of ids) {
        trackedRunsRef.current.delete(id);
      }

      if (remainingMinPulseMs > 0) {
        const tKey = `settle:${ids.join(',')}`;
        if (feedbackTimersRef.current[tKey]) {
          window.clearTimeout(feedbackTimersRef.current[tKey]);
        }
        feedbackTimersRef.current[tKey] = window.setTimeout(() => {
          finalizeVisualFeedback(ids, mode, isRerun);
          delete feedbackTimersRef.current[tKey];
        }, remainingMinPulseMs);
      } else {
        finalizeVisualFeedback(ids, mode, isRerun);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceState.slots, workspaceState.lastAttemptedRunAt]);

  const handleJumpToCard = (id: DeepDiveAnalysisId) => {
    const reduced = prefersReducedMotion();
    const el = cardRefs.current[id];
    if (el) {
      el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
    }
    if (reduced) return;
    setJumpHighlightId(id);
    if (jumpHighlightTimerRef.current !== null) {
      window.clearTimeout(jumpHighlightTimerRef.current);
    }
    jumpHighlightTimerRef.current = window.setTimeout(() => {
      setJumpHighlightId(null);
      jumpHighlightTimerRef.current = null;
    }, 1500);
  };

  const cardsWithResultIds = useMemo(
    () =>
      DEEP_DIVE_ANALYSIS_OPTIONS.filter((opt) => Boolean(workspaceState.slots[opt.id]?.result)).map(
        (opt) => opt.id
      ),
    [workspaceState.slots]
  );

  const allResultsCollapsed =
    cardsWithResultIds.length > 0 &&
    cardsWithResultIds.every((id) => collapsedResultIds.includes(id));

  const handleToggleAllResultsCollapse = () => {
    if (allResultsCollapsed) {
      setCollapsedResultIds([]);
    } else {
      setCollapsedResultIds([...cardsWithResultIds]);
    }
  };

  const handleToggleSingleResultCollapse = (id: DeepDiveAnalysisId) => {
    setCollapsedResultIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const paidBlockedByBudgetStorage =
    budgetStorageUnavailable && selectedCostEstimate.plannedKalodataApiCalls > 0;
  const pendingPaidBlockedByBudgetStorage =
    budgetStorageUnavailable && (pendingCostEstimate?.plannedKalodataApiCalls ?? 0) > 0;

  const handleRequestBatchRun = () => {
    if (!canRun || isAnyRunning) return;
    const needsModal =
      selectedCostEstimate.requiresExplicitConfirmation ||
      selectedBudgetGuard.exceedsSpendingLimit ||
      selectedBudgetGuard.exceedsLiveBalance ||
      paidBlockedByBudgetStorage;
    if (!needsModal) {
      // 0 Kalodata calls & 0 Gemini calls (100% local/cached) — execute directly with immediate visual feedback
      const ids = [...workspaceState.selectedIds];
      const isRerun = ids.some((id) => Boolean(workspaceState.slots[id]?.result));
      setPendingRun(null);
      setIsBudgetModalOpen(false);
      triggerVisualRunFeedback(ids, 'cache-local', isRerun);
      onRunSelected(false);
      return;
    }
    setPendingRun({
      mode: 'batch',
      analysisIds: [...workspaceState.selectedIds],
      forceRefresh: false,
    });
  };

  const handleRequestSingleRun = (id: DeepDiveAnalysisId, forceRefresh = false) => {
    const singleEst = estimateDeepDiveExecutionCost(product, [id], {
      forceRefresh,
      videoCreativeOptions,
    });
    if (!singleEst.requiresExplicitConfirmation) {
      // 0 Kalodata calls & 0 Gemini calls (100% local/cached) — execute directly with unmistakable visual feedback
      const isRerun = Boolean(workspaceState.slots[id]?.result);
      setPendingRun(null);
      setIsBudgetModalOpen(false);
      triggerVisualRunFeedback([id], 'cache-local', isRerun);
      onRunSingle(id, forceRefresh, false);
      return;
    }
    setPendingRun({
      mode: 'single',
      analysisIds: [id],
      forceRefresh,
    });
  };

  const handleConfirmPendingRun = () => {
    if (!pendingRun || !pendingCostEstimate || !pendingBudgetGuard) return;
    if (!pendingBudgetGuard.canProceedWithoutLimitChange) return;
    if (pendingPaidBlockedByBudgetStorage) return;
    const target = pendingRun;
    const ids =
      target.mode === 'batch' ? [...workspaceState.selectedIds] : [...target.analysisIds];
    const isRerun = ids.some((id) => Boolean(workspaceState.slots[id]?.result));
    const hasLiveOrAi =
      pendingCostEstimate.plannedKalodataApiCalls > 0 || pendingCostEstimate.plannedGeminiCalls > 0;

    setPendingRun(null);
    setIsBudgetModalOpen(false);
    triggerVisualRunFeedback(ids, hasLiveOrAi ? 'live' : 'cache-local', isRerun);

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
        ? 'သိမ်းထားသော ကုန်ပစ္စည်းများသို့ ပြန်သွားမည်'
        : 'Back to Saved Products'
      : originView === 'history'
        ? isMy
          ? 'ရှာဖွေမှု မှတ်တမ်းသို့ ပြန်သွားမည်'
          : 'Back to Research History'
        : isMy
          ? 'ရှာဖွေမှု ရလဒ်များသို့ ပြန်သွားမည်'
          : 'Back to Research Results';

  const copy = isMy
    ? {
        heading: 'Deep Dive Analysis',
        subheading: 'ရွေးချယ်ထားသော ကုန်ပစ္စည်းကို အတည်ပြုပြီး API နှင့် ရှိပြီးသားဒေတာများဖြင့် အသေးစိတ် စစ်ဆေးရန်',
        infoTitle: 'Deep Dive အကြောင်း',
        infoBody:
          'Deep Dive သည် ရှာဖွေမှု Mode အသစ်တစ်ခု မဟုတ်ပါ။ Fast / Balanced / Deep Mode မှ ရှာဖွေပြီးသား ကုန်ပစ္စည်းကို ကိုယ်တိုင်ရွေးချယ်ပြီး လိုအပ်သော Analysis များကိုသာ တစ်ခုချင်း သို့မဟုတ် စုပေါင်း Run နိုင်ပါသည်။ ရှိပြီးသားဒေတာနှင့် Cache ကို အရင်ပြန်သုံးပြီး မူရင်းရှာဖွေမှုရလဒ်များနှင့် Ranking ကို လုံးဝ မပြောင်းလဲပါ။',
        openDetailBtn: 'အစီရင်ခံစာ ကြည့်ရန်',
        productIdLabel: 'Product ID',
        originModeLabel: 'မူရင်း ရှာဖွေမှု Mode',
        priceLabel: 'ဈေးနှုန်း',
        commissionLabel: 'ကော်မရှင်',
        scoreLabel: 'အလားအလာအမှတ်',
        selectionHeading: `Deep Dive Analysis ${totalCount} မျိုး (ကိုယ်တိုင်ရွေးချယ် Run ရန်)`,
        selectedCounter: (count: number, total: number) => `${total} ခုထဲမှ ${count} ခု ရွေးချယ်ထားသည်`,
        completedCounter: (count: number) => `ပြီးစီးပြီး ${count} ခု`,
        selectAllBtn: 'အားလုံးရွေးမည်',
        clearAllBtn: 'အားလုံးဖြုတ်မည်',
        selectedListLabel: 'ရွေးချယ်ထားသည်များ',
        noneSelectedHint: 'စစ်ဆေးလိုသော Analysis အနည်းဆုံး 1 ခုကို ရွေးချယ်ပါ သို့မဟုတ် ကတ်တစ်ခုချင်းစီမှ Run နှိပ်ပါ။',
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
          whatItDoes: '1. ဒီ Analysis က ဘာလုပ်ပေးနိုင်သလဲ',
          whatItChecks: '2. စစ်ဆေးမည့် အချက်အလက်များ',
          expectedOutcome: '3. ရရှိမည့် ရလဒ်',
          requiredSources: '4. လိုအပ်နိုင်သည့် Data Source / API များ',
          estimatedCost: '5. ခန့်မှန်းကုန်ကျစရိတ်နှင့် Credit သုံးစွဲမှု',
          missingData: '6. Data မရရှိနိုင်သည့်အခါ ဖော်ပြပုံ',
        },
        runBtn: (count: number, running: boolean) =>
          running
            ? 'Analysis များ လုပ်ဆောင်နေပါသည်...'
            : count > 0
              ? `ရွေးထားသည့် Analysis (${count}) ခုကို Run မည်`
              : 'Analysis ရွေးချယ်ပြီးမှ Run နိုင်မည်',
        runDisabledHint: 'စုပေါင်း Run ရန် Analysis အနည်းဆုံး 1 ခုကို အရင်ရွေးချယ်ပါ။',
        runEngineNote:
          'ရှိပြီးသားဒေတာနှင့် Cache ကို ဦးစားပေးပြန်သုံးပါမည် · Review API သည် ရွေးချယ်မှသာ ခေါ်မည် · မူရင်း Ranking မပြောင်းလဲပါ။',
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
        selectionHeading: `${totalCount} Deep Dive Analysis Modules (Manual Selection)`,
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
    <div className="space-y-5 sm:space-y-6 pb-[calc(9.5rem+env(safe-area-inset-bottom))] sm:pb-[calc(6.5rem+env(safe-area-inset-bottom))]">
      {/* Persistent polite live region announcing Deep Dive module run start/finish/error with exact HH:MM:SS */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {liveRunAnnouncement}
      </div>
      {/* Top Navigation & Heading Row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="sp-btn-ghost -ml-2 text-xs sm:text-sm"
        >
          <ArrowLeft className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{backLabelOverride ?? backLabel}</span>
        </button>

        <button
          type="button"
          onClick={onOpenProductDetail}
          className="sp-btn-ghost -mr-2 text-xs text-zinc-700 dark:text-zinc-300"
        >
          <span>{copy.openDetailBtn}</span>
          <ArrowUpRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        </button>
      </div>

      {/* Workspace Title */}
      <section className="space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h1
            className={`font-display text-xl sm:text-3xl font-bold text-zinc-950 dark:text-zinc-50 ${
              isMy ? 'tracking-normal leading-[1.3]' : 'tracking-tight leading-[1.2]'
            }`}
          >
            {copy.heading}
          </h1>
          <InfoPopover
            variant="info"
            label={copy.infoTitle}
            title={copy.infoTitle}
            content={copy.infoBody}
          />
        </div>
        <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400">
          {copy.subheading}
        </p>
      </section>

      {/* Connected Read-Only Product Context Hero Card */}
      <section
        aria-label={displayName}
        className="rounded-2xl bg-[var(--sp-surface)] border border-[var(--sp-border)] p-4 sm:p-5 space-y-4 shadow-sm"
      >
        <div className="flex items-start justify-between gap-3 sm:gap-4">
          <div className="flex items-start gap-3 sm:gap-4 min-w-0 flex-1">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden bg-[var(--sp-surface-muted)] border border-[var(--sp-border)] shrink-0">
              {imageConfig.canRender && imageConfig.src ? (
                <ProductImage
                  src={imageConfig.src}
                  fallbackSrc={imageConfig.fallbackSrc}
                  productId={imageConfig.productId}
                  alt={product.name}
                  title={displayName}
                  unavailableLabel={t.cardImageUnverified}
                  compact
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <ImageOff className="w-5 h-5 text-zinc-400 dark:text-zinc-500" aria-hidden="true" />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                <span className="font-medium text-cyan-700 dark:text-[#25F4EE]">{categoryLabel}</span>
                <span aria-hidden="true">·</span>
                <span className="font-medium text-zinc-700 dark:text-zinc-300">
                  {copy.originModeLabel}: {originModeLabel}
                </span>
                <span aria-hidden="true" className="hidden sm:inline">·</span>
                <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400 tabular-nums truncate max-w-full">
                  {copy.productIdLabel}: {canonicalProductId}
                </span>
                {originalProductId !== canonicalProductId && (
                  <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
                    ({originalProductId})
                  </span>
                )}
              </div>

              <h2 className="font-display text-sm sm:text-lg font-semibold text-zinc-950 dark:text-zinc-50 leading-snug line-clamp-2 sm:line-clamp-none">
                {displayName}
              </h2>
            </div>
          </div>

          <div className="shrink-0 hidden sm:flex items-center">
            <ScoreRing value={evaluation.totalScore} max={100} size={56} animate />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3.5 border-t border-[var(--sp-border)] text-xs">
          <div className="flex items-center gap-3 sm:gap-6 flex-wrap">
            <div className="sm:hidden shrink-0">
              <ScoreRing value={evaluation.totalScore} max={100} size={48} animate />
            </div>
            <dl className="grid grid-cols-3 gap-3 sm:flex sm:flex-wrap sm:items-center sm:gap-x-6 sm:gap-y-2 flex-1 sm:flex-initial">
              <div>
                <dt className="text-xs text-zinc-500 dark:text-zinc-400">{copy.priceLabel}</dt>
                <dd className="font-mono text-sm sm:text-base font-bold text-zinc-950 dark:text-zinc-50 tabular-nums mt-0.5">
                  {product.priceThb !== null ? (
                    <AnimatedNumber
                      value={product.priceThb}
                      prefix="฿"
                      decimals={Number.isInteger(product.priceThb) ? 0 : 2}
                    />
                  ) : (
                    t.dataStatusLabels.unavailable
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500 dark:text-zinc-400">
                  {copy.commissionLabel}
                </dt>
                <dd className="font-mono text-sm sm:text-base font-bold text-emerald-700 dark:text-[#10F5A0] tabular-nums mt-0.5">
                  {product.commissionRate !== null ? (
                    <AnimatedNumber
                      value={product.commissionRate}
                      suffix="%"
                      decimals={Number.isInteger(product.commissionRate) ? 0 : 1}
                      highlightSignal={
                        product.commissionVerified === true && product.commissionRate >= 10
                          ? 'emerald-sheen'
                          : 'none'
                      }
                    />
                  ) : (
                    t.dataStatusLabels.unavailable
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500 dark:text-zinc-400">{copy.scoreLabel}</dt>
                <dd className="font-mono text-sm sm:text-base font-bold text-zinc-950 dark:text-zinc-50 tabular-nums mt-0.5">
                  <AnimatedNumber value={evaluation.totalScore} decimals={0} suffix="/100" />
                </dd>
              </div>
            </dl>
          </div>

          {(() => {
            const tiktokUrl = resolvedTikTokUrl ?? getTikTokShopProductUrl(product);
            if (!tiktokUrl) return null;
            return (
              <div className="flex items-center gap-2">
                <a
                  href={tiktokUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="sp-btn-secondary flex-1 sm:flex-initial"
                >
                  <span className="truncate">
                    {isMy ? 'TikTok Shop တွင် ကြည့်ရန်' : 'Open on TikTok Shop'}
                  </span>
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                </a>
                <motion.button
                  type="button"
                  whileTap={prefersReduced ? undefined : TACTILE_INTERACTIONS.buttonTap}
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
                  className="sp-btn-secondary px-3 shrink-0"
                >
                  {copiedTikTokLink ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-[#10F5A0] shrink-0" aria-hidden="true" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  )}
                  <span>{copiedTikTokLink ? (isMy ? 'ကူးပြီး' : 'Copied') : (isMy ? 'ကူးရန်' : 'Copy')}</span>
                </motion.button>
              </div>
            );
          })()}
        </div>
      </section>

      {/* Affiliate Technical Signal Strip (Detailed Zero-Extra-Credit Engine Breakdown) */}
      <TechnicalSignalStrip
        product={product}
        evaluation={evaluation}
        language={language}
        variant="detailed"
      />

      {/* Manual Selection Controls, 01–09 Quick-Jump Bar & Result Collapse Controls */}
      <section aria-labelledby="deep-dive-selection-heading" className="space-y-3.5 sm:space-y-4">
        <div className="sp-card p-3.5 sm:p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3">
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
                {' · '}
                {isMy
                  ? `Limit ${formatCredits(effectiveSpendingLimit)} cr`
                  : `Limit ${formatCredits(effectiveSpendingLimit)} cr`}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 max-w-full">
              {cardsWithResultIds.length > 0 && (
                <button
                  type="button"
                  data-testid="deep-dive-toggle-all-results"
                  onClick={handleToggleAllResultsCollapse}
                  className="sp-btn-secondary px-3"
                >
                  {allResultsCollapsed ? (
                    <ChevronsUpDown className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  ) : (
                    <ChevronsDownUp className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  )}
                  <span>
                    {allResultsCollapsed
                      ? isMy
                        ? 'ရလဒ်အားလုံး ဖွင့်မည်'
                        : 'Expand All Results'
                      : isMy
                        ? 'ရလဒ်အားလုံး ခေါက်မည်'
                        : 'Collapse All Results'}
                  </span>
                </button>
              )}
              <button
                type="button"
                onClick={onSelectAll}
                disabled={allSelected || isAnyRunning}
                className="sp-btn-secondary px-3"
              >
                {copy.selectAllBtn}
              </button>
              <button
                type="button"
                onClick={onClearAll}
                disabled={selectedCount === 0 || isAnyRunning}
                className="sp-btn-secondary px-3"
              >
                {copy.clearAllBtn}
              </button>
            </div>
          </div>

          {/* 01–09 Quick-Jump Strip: Swipeable single row on mobile, compact grid on sm+ */}
          <div
            data-testid="deep-dive-quick-jump-bar"
            className="pt-2.5 border-t border-zinc-100 dark:border-zinc-800/70 space-y-2"
          >
            <div className="flex items-center justify-between gap-2 text-xs text-zinc-500 dark:text-zinc-400">
              <span>
                {isMy
                  ? 'အမြန်ခုန်ကြည့်ရန် (01–09) · နံပါတ်နှိပ်ပြီး သက်ဆိုင်ရာကတ်သို့ တိုက်ရိုက်သွားနိုင်သည်'
                  : 'Quick Jump (01–09) · Click any number to jump straight to that module'}
              </span>
              <span className="hidden sm:inline font-mono tabular-nums">
                {selectedOptionNames.length > 0
                  ? `${selectedCount} ${isMy ? 'ရွေးထား' : 'selected'}`
                  : isMy
                    ? 'မရွေးရသေး'
                    : '0 selected'}
              </span>
            </div>

            <div className="flex sm:grid sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9 gap-1.5 overflow-x-auto no-scrollbar sm:overflow-visible -mx-0.5 px-0.5 pb-0.5 sm:mx-0 sm:px-0 sm:pb-0">
              {DEEP_DIVE_ANALYSIS_OPTIONS.map((opt) => {
                const isOptSelected = workspaceState.selectedIds.includes(opt.id);
                const optSlot = workspaceState.slots[opt.id];
                const optFeedback = moduleFeedbackById[opt.id];
                const isOptRunning =
                  optSlot?.status === 'running' || optFeedback?.phase === 'pulsing';
                const isOptCompleted = optSlot?.status === 'completed';
                const isOptError = optSlot?.status === 'error';
                const optLabel = isMy ? opt.nameMy : opt.nameEn;
                const shortChipName = t.deepDiveChipShortNames[opt.id];
                const ChipIcon = DEEP_DIVE_CHIP_ICONS[opt.id];

                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleJumpToCard(opt.id)}
                    title={`0${opt.order}. ${optLabel}`}
                    aria-label={`Jump to 0${opt.order}. ${optLabel}`}
                    className={`inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 sm:px-2.5 py-1.5 text-xs font-medium rounded-xl border transition-colors cursor-pointer shrink-0 sm:shrink sm:min-w-0 whitespace-nowrap ${
                      isOptRunning
                        ? 'bg-cyan-500/12 dark:bg-[#25F4EE]/15 text-cyan-800 dark:text-[#25F4EE] border-cyan-500/50 dark:border-[#25F4EE]/50'
                        : isOptSelected
                          ? 'bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950 border-zinc-950 dark:border-zinc-100'
                          : isOptCompleted
                            ? 'bg-emerald-500/[0.08] dark:bg-[#10F5A0]/[0.09] text-emerald-800 dark:text-[#10F5A0] border-emerald-500/35 dark:border-[#10F5A0]/35 hover:border-emerald-500/60'
                            : isOptError
                              ? 'bg-rose-500/[0.08] dark:bg-[#FE2C55]/[0.10] text-rose-800 dark:text-[#FE2C55] border-rose-500/35 dark:border-[#FE2C55]/40'
                              : 'bg-[var(--sp-surface-muted)] text-zinc-700 dark:text-zinc-300 border-[var(--sp-border)] hover:border-zinc-400 dark:hover:border-zinc-500'
                    }`}
                  >
                    <ChipIcon className="w-3.5 h-3.5 shrink-0 opacity-80" aria-hidden="true" />
                    <span className="font-mono tabular-nums font-semibold shrink-0">
                      0{opt.order}
                    </span>
                    <span className="truncate">{shortChipName}</span>
                    {isOptRunning ? (
                      <Loader2 className="w-3 h-3 animate-spin motion-reduce:animate-none shrink-0" aria-hidden="true" />
                    ) : isOptError ? (
                      <AlertCircle className="w-3 h-3 shrink-0" aria-hidden="true" />
                    ) : isOptCompleted ? (
                      <Check
                        className={`w-3 h-3 shrink-0 ${
                          isOptSelected
                            ? 'text-emerald-400 dark:text-emerald-700'
                            : 'text-emerald-600 dark:text-[#10F5A0]'
                        }`}
                        aria-hidden="true"
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Fail-Closed Budget Storage Notice (Only shown if persistent budget storage is unavailable) */}
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
        </div>

        {/* 9 Independent Deep Dive Analysis Option Cards (Progressive Disclosure Preserved) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 items-start">
          {DEEP_DIVE_ANALYSIS_OPTIONS.map((option) => {
            const isSelected = workspaceState.selectedIds.includes(option.id);
            const isExpanded = workspaceState.expandedIds.includes(option.id);
            const isResultCollapsed = collapsedResultIds.includes(option.id);
            const runFeedback = moduleFeedbackById[option.id] ?? null;
            const isJumpHighlighted = jumpHighlightId === option.id;
            const slot: DeepDiveAnalysisSlotState = workspaceState.slots[option.id] ?? {
              analysisId: option.id,
              status: 'idle',
              updatedAt: null,
              result: null,
              error: null,
              statusNoteEn: 'Ready — Run this module individually or with your selection.',
              statusNoteMy: 'အဆင်သင့် — ဤ Analysis ကို တစ်ခုချင်း သို့မဟုတ် ရွေးချယ်ပြီး Run နိုင်ပါသည်။',
            };
            const isRunning = slot.status === 'running';
            const isVisuallyRunning = isRunning || runFeedback?.phase === 'pulsing';
            const isRecentlyUpdated = !isVisuallyRunning && runFeedback?.phase === 'updated';
            const hasRunResult = Boolean(slot.result || slot.error);
            const statusDisplay = getExecutionStatusDisplay(
              isVisuallyRunning ? 'running' : slot.status,
              isMy
            );
            const isVideoStudioCard = option.id === 'ad-video-creative-blueprint';

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
                id={`deep-dive-card-${option.id}`}
                ref={(el) => {
                  cardRefs.current[option.id] = el;
                  if (isVideoStudioCard) {
                    videoStudioCardRef.current = el;
                  }
                }}
                data-analysis-id={option.id}
                data-execution-status={slot.status}
                className={`relative bg-[var(--sp-surface)] border rounded-2xl overflow-hidden transition-[border-color,box-shadow,opacity] duration-200 ${
                  isVideoStudioCard ? 'lg:col-span-2' : ''
                } ${
                  isRecentlyUpdated
                    ? 'border-emerald-500/70 dark:border-[#10F5A0]/60 ring-2 ring-emerald-500/20 dark:ring-[#10F5A0]/20'
                    : isVisuallyRunning
                      ? 'border-cyan-500/65 dark:border-[#25F4EE]/55 ring-2 ring-cyan-500/20 dark:ring-[#25F4EE]/20'
                      : isJumpHighlighted
                        ? 'border-cyan-500 dark:border-[#25F4EE] ring-2 ring-cyan-500/25 dark:ring-[#25F4EE]/25'
                        : isSelected
                          ? 'border-zinc-900 dark:border-zinc-200'
                          : 'border-[var(--sp-border)] hover:border-zinc-300 dark:hover:border-zinc-700'
                }`}
              >
                {/* Running Module Radar Cyan Top Scan-Beam Rail */}
                {isVisuallyRunning && (
                  <div
                    aria-hidden="true"
                    className="relative h-[2.5px] w-full overflow-hidden bg-cyan-500/15 dark:bg-[#25F4EE]/15"
                  >
                    <div className="sp-scan-beam absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-cyan-500 dark:via-[#25F4EE] to-emerald-400 dark:to-[#10F5A0]" />
                  </div>
                )}

                {/* Default Compact Visible Area */}
                <div className="p-3.5 sm:p-4 space-y-2.5">
                  {/* Compact Headline Row (Key Number / Verdict Chip + StatusDot, always visible even when collapsed) */}
                  {(() => {
                    const hl = getModuleHeadlineSummary(slot, language);
                    return (
                      <div className="flex items-center justify-between gap-2 pb-2 border-b border-zinc-100 dark:border-zinc-800/70">
                        <div className="inline-flex items-center gap-1.5 min-w-0">
                          <StatusDot status={hl.status} language={language} size="sm" />
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md border text-xs font-semibold font-mono tabular-nums truncate max-w-[220px] sm:max-w-[260px] ${headlineChipClass(
                              hl.tone
                            )}`}
                            title={hl.primaryText}
                          >
                            {hl.primaryText}
                          </span>
                        </div>
                        {hl.secondaryText && (
                          <span className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                            {hl.secondaryText}
                          </span>
                        )}
                      </div>
                    );
                  })()}

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
                          <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
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

                  {/* Module #09 Configurable Production & Competitor Scan Controls */}
                  {isVideoStudioCard && (
                    <VideoCreativeConfigBar
                      product={product}
                      options={videoCreativeOptions}
                      disabled={isVisuallyRunning}
                      onChange={handleVideoCreativeOptionsChange}
                      language={language}
                    />
                  )}

                  {/* Compact Status, Per-Module Run Trigger & Independent Progressive Disclosure Row */}
                  <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/70 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <span
                        className={`inline-flex items-center gap-1 font-medium whitespace-nowrap ${
                          isSelected
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-zinc-500 dark:text-zinc-400'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
                        <span>{isSelected ? copy.statusSelected : copy.statusNotSelected}</span>
                      </span>

                      <span className="text-zinc-300 dark:text-zinc-700" aria-hidden="true">
                        ·
                      </span>

                      <span
                        className={`inline-flex items-center gap-1 font-medium whitespace-nowrap ${
                          isRecentlyUpdated || slot.status === 'completed'
                            ? 'text-emerald-700 dark:text-[#10F5A0]'
                            : isVisuallyRunning
                              ? 'text-cyan-700 dark:text-[#25F4EE]'
                              : statusDisplay.toneClass
                        }`}
                      >
                        {isVisuallyRunning ? (
                          <Loader2 className="w-3 h-3 animate-spin motion-reduce:animate-none shrink-0" aria-hidden="true" />
                        ) : isRecentlyUpdated || slot.status === 'completed' ? (
                          <motion.span
                            key={`done-chip-${option.id}-${slot.updatedAt ?? 'ok'}`}
                            variants={MOTION_VARIANTS.chipPop}
                            initial={prefersReduced ? false : 'initial'}
                            animate="animate"
                            className="inline-flex items-center"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          </motion.span>
                        ) : null}
                        <span>
                          {isRecentlyUpdated
                            ? isMy
                              ? 'အပ်ဒိတ်ပြီး'
                              : 'Updated'
                            : statusDisplay.label}
                        </span>
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
                            <span className={`text-xs font-mono tabular-nums font-medium ${toneClass}`}>
                              {formatModuleCostShort(modEst, isMy)}
                            </span>
                          </>
                        );
                      })()}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Per-Module Execute / Re-run Action (routed through Pre-Run Checkout Modal for paid/AI calls) */}
                      <button
                        type="button"
                        onClick={() => handleRequestSingleRun(option.id, false)}
                        disabled={isVisuallyRunning}
                        className={`inline-flex items-center gap-1 min-h-[36px] px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed ${
                          isRecentlyUpdated
                            ? 'text-emerald-900 dark:text-emerald-100 bg-emerald-100 dark:bg-emerald-950/70'
                            : 'text-zinc-900 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                        }`}
                      >
                        {isVisuallyRunning ? (
                          <Loader2 className="w-3 h-3 animate-spin motion-reduce:animate-none shrink-0 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                        ) : isRecentlyUpdated ? (
                          <Check className="w-3 h-3 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                        ) : hasRunResult ? (
                          <RotateCw className="w-3 h-3 shrink-0" aria-hidden="true" />
                        ) : (
                          <Play className="w-3 h-3 shrink-0" aria-hidden="true" />
                        )}
                        <span>
                          {isVisuallyRunning
                            ? copy.runningBtn
                            : isRecentlyUpdated
                              ? isMy
                                ? 'ပြီးပါပြီ'
                                : 'Updated'
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
                        className="inline-flex items-center gap-1 min-h-[36px] px-2.5 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
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

                {/* Progressive Disclosure Expanded Details (All 6 Required Sections, Myanmar-safe accordion) */}
                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      key={`details-accordion-${option.id}`}
                      initial={prefersReduced ? false : { height: 0, opacity: 0 }}
                      animate={{
                        height: 'auto',
                        opacity: 1,
                        transitionEnd: { overflow: 'visible' },
                      }}
                      exit={prefersReduced ? undefined : { height: 0, opacity: 0, overflow: 'hidden' }}
                      transition={MOTION_TRANSITIONS.accordion}
                      className="overflow-hidden"
                    >
                      <div
                        id={`deep-dive-details-${option.id}`}
                        className="px-3.5 sm:px-4 pb-3.5 sm:pb-4 pt-3 border-t border-[var(--sp-border)] bg-[var(--sp-surface-muted)] space-y-3 text-xs"
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
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Per-Module Isolated Execution Output (Collapsible Result / Unavailable / Error) */}
                {(slot.result || slot.error) && (
                  <ModuleResultPanel
                    slot={slot}
                    language={language}
                    isCollapsed={isResultCollapsed}
                    onToggleCollapse={() => handleToggleSingleResultCollapse(option.id)}
                    runFeedback={runFeedback}
                    onRerun={(forceRefresh) => handleRequestSingleRun(option.id, forceRefresh)}
                    onApplyConceptToBrief={
                      isVideoStudioCard
                        ? (suggestionText) => {
                            handleVideoCreativeOptionsChange({
                              ...videoCreativeOptions,
                              customSuggestion: suggestionText.slice(0, 600),
                            });
                            window.requestAnimationFrame(() => {
                              videoStudioCardRef.current?.scrollIntoView({
                                behavior: getScrollBehavior(),
                                block: 'start',
                              });
                            });
                          }
                        : undefined
                    }
                  />
                )}
              </article>
            );
          })}
        </div>
      </section>

      {/* Compact Post-Run Summary: Estimated vs Actual Cost, Cache Reuse, API Calls & Remaining Budget */}
      {workspaceState.lastRunSummary && (
        <section
          aria-label="Last Deep Dive Run Summary"
          data-testid="deep-dive-post-run-summary"
          className="sp-card p-3.5 sm:p-5 space-y-2.5 text-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">
              {isMy
                ? 'နောက်ဆုံး Run ရလဒ် — ခန့်မှန်း vs အမှန်တကယ် ကုန်ကျစရိတ်'
                : 'Last Run Summary — Estimated vs Actual Cost'}
            </span>
            <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
              {formatCompletedTime(workspaceState.lastRunSummary.completedAt, language, true)}
            </span>
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
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
        </section>
      )}

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
            className="sp-card p-3.5 sm:p-5 space-y-4"
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
                      ? 'Deep Dive စုစည်းအစီရင်ခံစာ'
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
                        {isMy ? 'အပ်ဒိတ်' : 'Updated'}:{' '}
                        {formatCompletedTime(finalReport.lastUpdatedAt, language)}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 max-w-full">
                {hasAnyRunOutput && (
                  <>
                    <button
                      type="button"
                      onClick={() => void handleCopyFinalReport()}
                      className="sp-btn-secondary px-3"
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
                            ? 'အစီရင်ခံစာ ကူးယူမည်'
                            : 'Copy Report'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={handleExportMarkdown}
                      className="sp-btn-secondary px-3"
                    >
                      <Download className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>Markdown</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleExportJson}
                      className="sp-btn-secondary px-3"
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
                  className="inline-flex items-center gap-1 min-h-[40px] px-3.5 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                >
                  <span>
                    {isReportExpanded
                      ? isMy
                        ? 'အစီရင်ခံစာ ပိတ်မည်'
                        : 'Hide Report'
                      : isMy
                        ? 'စုစည်းအစီရင်ခံစာ ကြည့်မည်'
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
                      ? `မှတ်တမ်း (${formatCompletedTime(inspectedHistoryRecord.analyzedAt, language)}) ကို ပြန်ကြည့်နေပါသည် — API မခေါ်ပါ။`
                      : `Inspecting historical snapshot from ${formatCompletedTime(inspectedHistoryRecord.analyzedAt, language)} — 0 API calls.`}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setInspectedHistoryId(null)}
                  className="inline-flex items-center justify-center min-h-[36px] px-3 py-1.5 text-xs font-medium text-sky-900 dark:text-sky-100 bg-sky-100/80 dark:bg-sky-950/60 hover:bg-sky-200/80 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
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
                    <dt className="text-xs text-zinc-500 dark:text-zinc-400">
                      {isMy ? 'အလားအလာအမှတ်' : '7-Factor Score'}
                    </dt>
                    <dd className="font-mono text-sm font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums mt-0.5">
                      {finalReport.overallScore}/100{' '}
                      <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">
                        ({finalReport.confidencePct}%)
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-zinc-500 dark:text-zinc-400">
                      {isMy ? 'AI ဆုံးဖြတ်ချက် (သီးခြား)' : 'AI Verdict (Separate)'}
                    </dt>
                    <dd className="font-mono text-sm font-semibold text-zinc-950 dark:text-zinc-50 mt-1 flex flex-wrap items-center gap-1.5">
                      {(() => {
                        const rawAiVerdict = !inspectedHistoryRecord
                          ? workspaceState.slots['ai-strategic-recommendation']?.result?.aiMeta?.verdict
                          : null;
                        if (rawAiVerdict) {
                          return (
                            <VerdictBadge
                              verdict={mapAiVerdictToDecisionVerdict(rawAiVerdict)}
                              size="sm"
                              language={language}
                              animateStamp
                            />
                          );
                        }
                        return finalReport.aiVerdict ?? (isMy ? 'မ Run ရသေး' : 'Not Run');
                      })()}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-zinc-500 dark:text-zinc-400">
                      {isMy ? 'Kalodata စရိတ် (အစီရင်ခံစာ)' : 'Kalodata Cost (Report)'}
                    </dt>
                    <dd className="font-mono text-sm font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums mt-0.5">
                      {formatCredits(finalReport.totalKalodataCreditsUsed)} cr{' '}
                      <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">
                        ({formatUsd(finalReport.totalKalodataUsdUsed)})
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-zinc-500 dark:text-zinc-400">
                      {isMy ? 'Gemini AI Calls (သီးခြား)' : 'Gemini AI Calls (Separate)'}
                    </dt>
                    <dd className="font-mono text-sm font-semibold text-sky-700 dark:text-sky-400 tabular-nums mt-0.5">
                      {finalReport.totalGeminiApiCalls}{' '}
                      <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">
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
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500 dark:text-zinc-400">
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
                                className="inline-flex items-center gap-1 min-h-[36px] px-2.5 py-1.5 text-xs font-medium text-zinc-800 dark:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-45 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
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
                                <dt className="flex items-center justify-between gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
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
                          <div className="text-xs text-amber-800 dark:text-amber-300/90 space-y-0.5">
                            {secNotes.slice(0, 3).map((note, idx) => (
                              <p key={`${sec.id}-n-${idx}`} className="leading-relaxed">
                                • {note}
                              </p>
                            ))}
                          </div>
                        )}

                        {secSources.length > 0 && (
                          <div className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
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
                <div className="pt-3 border-t border-zinc-200/80 dark:border-zinc-800 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">
                    {isMy ? 'Report Data Sources:' : 'Report Data Sources:'}
                  </span>{' '}
                  {(isMy ? finalReport.allDataSourcesMy : finalReport.allDataSourcesEn).length > 0
                    ? (isMy ? finalReport.allDataSourcesMy : finalReport.allDataSourcesEn).join(' · ')
                    : isMy
                      ? 'မူလရှာဖွေမှု ဒေတာ (Deep Dive Module များ မ Run ရသေးပါ)'
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
        className="sp-card p-3.5 sm:p-5 space-y-3"
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
                  ? 'Deep Dive မှတ်တမ်း'
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
            className="sp-btn-secondary shrink-0 self-start sm:self-auto"
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
              <StateMessage
                variant="empty"
                compact
                icon={<History className="w-4 h-4" aria-hidden="true" />}
                reason={
                  isMy
                    ? 'ဤကုန်ပစ္စည်းအတွက် Deep Dive မှတ်တမ်း မရှိသေးပါ။'
                    : 'No Deep Dive history saved for this product yet.'
                }
                actionLabel={isMy ? 'အပိုင်း 01-09 ကြည့်မည်' : 'Go to Modules'}
                onAction={() => {
                  const first = cardRefs.current['product-intelligence'];
                  first?.scrollIntoView({ behavior: getScrollBehavior(), block: 'start' });
                }}
              />
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
                          <div className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
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
                            <div className="text-xs text-zinc-500 dark:text-zinc-400">
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
                                    behavior: getScrollBehavior(),
                                    block: 'nearest',
                                  });
                                });
                              }
                            }}
                            className={`inline-flex items-center gap-1 min-h-[36px] px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
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
                                  ? 'အစီရင်ခံစာတွင် ကြည့်မည်'
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
                            className="inline-flex items-center gap-1 min-h-[36px] px-2.5 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
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
                              className="inline-flex items-center justify-center min-h-[36px] min-w-[36px] text-zinc-500 dark:text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </div>

                      {isExpandedRec && rec.moduleEntries.length > 0 && (
                        <div className="pt-2 pl-2 border-t border-zinc-100 dark:border-zinc-800/70 space-y-1.5 text-xs">
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

      {/* Non-blocking Floating Run Feedback Toast + Full-Width Docked Mobile / Floating Desktop Run Bar */}
      <div className="fixed inset-x-0 bottom-0 z-[35] sm:sticky sm:inset-x-auto sm:bottom-3 pointer-events-none sm:space-y-2">
        <AnimatePresence>
          {runFeedbackToast && (
            <motion.div
              key="deep-dive-run-toast-wrap"
              initial={prefersReduced ? false : { opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={prefersReduced ? undefined : { opacity: 0, y: 8, scale: 0.98 }}
              transition={MOTION_TRANSITIONS.snappy}
              className="px-3 pb-2 sm:px-0 sm:pb-0"
            >
              <div
                role="status"
                aria-live="polite"
                data-testid="deep-dive-run-toast"
                className={`pointer-events-auto mx-auto max-w-2xl flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border shadow-md backdrop-blur-md text-xs transition-colors ${
                  runFeedbackToast.tone === 'error'
                    ? 'bg-rose-50/95 dark:bg-rose-950/95 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-100'
                    : 'bg-zinc-950/95 dark:bg-zinc-100/95 border-zinc-800 dark:border-zinc-300 text-white dark:text-zinc-950'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {runFeedbackToast.tone === 'error' ? (
                    <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" aria-hidden="true" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 dark:text-emerald-600 shrink-0" aria-hidden="true" />
                  )}
                  <div className="min-w-0 truncate">
                    <span className="font-semibold">{runFeedbackToast.title}</span>
                    {runFeedbackToast.detail && (
                      <span
                        className={`ml-2 font-mono text-xs tabular-nums ${
                          runFeedbackToast.tone === 'error'
                            ? 'text-rose-700 dark:text-rose-300'
                            : 'text-zinc-300 dark:text-zinc-600'
                        }`}
                      >
                        {runFeedbackToast.detail}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setRunFeedbackToast(null)}
                  aria-label={isMy ? 'ပိတ်မည်' : 'Dismiss'}
                  className="w-10 h-10 -my-1.5 -mr-1.5 inline-flex items-center justify-center rounded-lg opacity-80 hover:opacity-100 transition-opacity cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Docked Mobile Bottom Bar / Floating Desktop Action Bar: Unclipped Selection Chips, Live Cost & Direct Run */}
        <div
          data-testid="deep-dive-sticky-bar"
          role="region"
          aria-label={isMy ? 'Deep Dive အမြန် Run ဘား' : 'Deep Dive sticky action bar'}
          className="pointer-events-auto sp-glass border-t border-[var(--sp-border)] shadow-[0_-8px_28px_rgba(0,0,0,0.12)] dark:shadow-[0_-10px_32px_rgba(0,0,0,0.55)] px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] sm:rounded-2xl sm:border sm:shadow-xl sm:px-4 sm:py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-2.5"
        >
          {/* Row 1 (Mobile) / Left Zone (Desktop): Unclipped Selected Module Chips + Live Cost */}
          <div
            className={`${
              selectedCount > 0 ? 'flex' : 'hidden sm:flex'
            } items-center justify-between sm:justify-start gap-2 min-w-0 sm:flex-1`}
          >
            {selectedCount > 0 ? (
              <>
                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar min-w-0">
                  {workspaceState.selectedIds
                    .map((id) => getDeepDiveOptionById(id))
                    .filter((opt): opt is NonNullable<typeof opt> => Boolean(opt))
                    .sort((a, b) => a.order - b.order)
                    .map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onToggleOption(opt.id)}
                        disabled={isAnyRunning}
                        title={
                          isMy
                            ? `0${opt.order}. ${opt.nameMy} ဖြုတ်မည်`
                            : `Remove 0${opt.order}. ${opt.nameEn}`
                        }
                        className="inline-flex items-center gap-1 min-h-[32px] px-2 py-1 text-xs font-mono tabular-nums font-semibold text-zinc-900 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-800 hover:bg-rose-100 dark:hover:bg-rose-950/60 hover:text-rose-800 dark:hover:text-rose-300 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <span>0{opt.order}</span>
                        <X className="w-3 h-3 opacity-75" aria-hidden="true" />
                      </button>
                    ))}
                </div>

                <span className="hidden sm:inline text-zinc-300 dark:text-zinc-700 shrink-0" aria-hidden="true">
                  ·
                </span>

                <div className="flex items-center gap-1.5 text-xs font-mono tabular-nums whitespace-nowrap shrink-0">
                  <span
                    className={`font-semibold ${
                      selectedBudgetGuard.exceedsSpendingLimit ||
                      selectedBudgetGuard.exceedsLiveBalance ||
                      paidBlockedByBudgetStorage
                        ? 'text-rose-700 dark:text-[#FE2C55]'
                        : selectedCostEstimate.estimatedCredits > 0
                          ? 'text-zinc-950 dark:text-zinc-50'
                          : 'text-emerald-700 dark:text-[#10F5A0]'
                    }`}
                  >
                    <AnimatedNumber
                      value={selectedCostEstimate.estimatedCredits}
                      decimals={getCreditDecimals(selectedCostEstimate.estimatedCredits)}
                      suffix=" cr"
                    />
                  </span>
                  {selectedCostEstimate.estimatedCredits > 0 && (
                    <span className="text-xs text-zinc-500 dark:text-zinc-400 hidden sm:inline">
                      ({formatUsd(selectedCostEstimate.estimatedUsd)})
                    </span>
                  )}
                  {selectedCostEstimate.plannedGeminiCalls > 0 && (
                    <span className="text-xs font-medium text-sky-700 dark:text-sky-400">
                      +{selectedCostEstimate.plannedGeminiCalls} AI
                    </span>
                  )}
                  {(selectedBudgetGuard.exceedsSpendingLimit ||
                    selectedBudgetGuard.exceedsLiveBalance) && (
                    <AlertTriangle
                      className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0"
                      aria-label={isMy ? 'Spending Limit ကျော်လွန်နေသည်' : 'Exceeds Spending Limit'}
                    />
                  )}
                </div>
              </>
            ) : (
              <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                {isMy
                  ? 'Analysis (01–09) ရွေးချယ်ပါ သို့မဟုတ် ကတ်တစ်ခုချင်းမှ Run နှိပ်ပါ'
                  : 'Select modules (01–09) or click Run on any card'}
              </p>
            )}
          </div>

          {/* Row 2 (Mobile) / Right Zone (Desktop): Budget Button, Clear & Primary Run CTA */}
          <div className="flex items-center gap-1.5 w-full sm:w-auto sm:shrink-0">
            <button
              type="button"
              data-testid="deep-dive-open-budget-modal-btn"
              onClick={() => setIsBudgetModalOpen(true)}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-2.5 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
              title={isMy ? 'Spending Limit နှင့် ကုန်ကျစရိတ် စစ်ဆေးရန်' : 'Spending Limit & Cost Details'}
            >
              <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span className="font-mono tabular-nums text-xs">
                {formatCredits(selectedBudgetGuard.remainingBudgetBeforeRun)}/
                {formatCredits(effectiveSpendingLimit)} cr
              </span>
            </button>

            {selectedCount > 0 && (
              <button
                type="button"
                onClick={onClearAll}
                disabled={isAnyRunning}
                className="min-h-[40px] px-2.5 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-50 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-45 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                {isMy ? 'ဖြုတ်' : 'Clear'}
              </button>
            )}

            <motion.button
              type="button"
              data-testid="deep-dive-sticky-run-btn"
              whileTap={prefersReduced || !canRun || isAnyRunning ? undefined : TACTILE_INTERACTIONS.buttonTap}
              onClick={handleRequestBatchRun}
              disabled={!canRun || isAnyRunning}
              className="sp-btn-volt flex-1 sm:flex-initial px-4 text-xs"
            >
              {isAnyRunning ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none shrink-0" aria-hidden="true" />
              ) : (
                <Play className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              )}
              <span>
                {isAnyRunning
                  ? isMy
                    ? 'လုပ်ဆောင်နေ...'
                    : 'Running...'
                  : selectedCount === 0
                    ? isMy
                      ? 'Run မည်'
                      : 'Run'
                    : selectedCostEstimate.requiresExplicitConfirmation ||
                        selectedBudgetGuard.exceedsSpendingLimit ||
                        selectedBudgetGuard.exceedsLiveBalance ||
                        paidBlockedByBudgetStorage
                      ? isMy
                        ? `စစ်ပြီး Run (${selectedCount})`
                        : `Review & Run (${selectedCount})`
                      : isMy
                        ? `Run Selected (${selectedCount})`
                        : `Run Selected (${selectedCount})`}
              </span>
            </motion.button>
          </div>
        </div>
      </div>

      {/* Centered Checkout & Budget Control Pop-up Modal (Option A) */}
      <AnimatePresence>
      {isCheckoutModalOpen &&
        (() => {
          const isConfirmationMode = Boolean(pendingRun && pendingCostEstimate && pendingBudgetGuard);
          const modalEstimate = isConfirmationMode ? pendingCostEstimate! : selectedCostEstimate;
          const modalBudgetGuard = isConfirmationMode ? pendingBudgetGuard! : selectedBudgetGuard;
          const modalBlockedByStorage = isConfirmationMode
            ? pendingPaidBlockedByBudgetStorage
            : paidBlockedByBudgetStorage;
          const canRemoveModulesInModal = !pendingRun || pendingRun.mode === 'batch';

          const closeModal = () => {
            setPendingRun(null);
            setIsBudgetModalOpen(false);
          };

          return (
            <motion.div
              key="deep-dive-checkout-backdrop"
              variants={MOTION_VARIANTS.backdrop}
              initial={prefersReduced ? false : 'initial'}
              animate="animate"
              exit={prefersReduced ? undefined : 'exit'}
              className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-zinc-950/70 backdrop-blur-sm"
              onClick={closeModal}
            >
              <motion.div
                key="deep-dive-checkout-panel"
                ref={checkoutModalRef}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-labelledby="deep-dive-checkout-modal-title"
                data-testid="deep-dive-pre-run-confirmation"
                variants={MOTION_VARIANTS.modalScale}
                initial={prefersReduced ? false : 'initial'}
                animate="animate"
                exit={prefersReduced ? undefined : 'exit'}
                onClick={(e) => e.stopPropagation()}
                className="w-full sm:max-w-xl max-h-[90dvh] flex flex-col bg-[var(--sp-surface)] border border-[var(--sp-border)] rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden text-xs focus:outline-none"
              >
                {/* Mobile Bottom-Sheet Drag Handle Indicator */}
                <div className="sm:hidden pt-2.5 pb-1 flex justify-center shrink-0" aria-hidden="true">
                  <span className="sp-sheet-handle" />
                </div>

                {/* Modal Header */}
                <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-zinc-200/80 dark:border-zinc-800 flex items-start justify-between gap-3 shrink-0">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <ShieldCheck
                      className="w-4 h-4 text-zinc-900 dark:text-zinc-100 shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <div className="space-y-0.5 min-w-0">
                      <h2
                        id="deep-dive-checkout-modal-title"
                        className="font-display text-sm sm:text-base font-semibold text-zinc-950 dark:text-zinc-50 leading-snug"
                      >
                        {isConfirmationMode
                          ? isMy
                            ? 'Run မလုပ်မီ ကုန်ကျစရိတ် အတည်ပြုပါ (Paid / AI API)'
                            : 'Confirm Paid / AI API Execution Before Running'
                          : isMy
                            ? 'Deep Dive Budget နှင့် ကုန်ကျစရိတ် ထိန်းချုပ်ရန်'
                            : 'Deep Dive Budget & Cost Controls'}
                      </h2>
                      <p className="text-zinc-500 dark:text-zinc-400 leading-relaxed">
                        {isConfirmationMode
                          ? isMy
                            ? `Analysis ${modalEstimate.analysisIds.length} ခုအတွက် အောက်ပါ ခန့်မှန်းစရိတ်ကို စစ်ဆေးအတည်ပြုပါ — အတည်မပြုမချင်း Paid API မခေါ်ပါ။`
                            : `Review estimated cost for ${modalEstimate.analysisIds.length} analysis module(s) — no paid or AI API is called until you confirm.`
                          : isMy
                            ? 'Spending Limit ချိန်ညှိပြီး ရွေးချယ်ထားသော Analysis ကုန်ကျစရိတ်များကို စစ်ဆေးနိုင်ပါသည်။'
                            : 'Adjust your Spending Limit and review live API/cost estimates for selected modules.'}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={closeModal}
                    aria-label={isMy ? 'ပိတ်မည်' : 'Close dialog'}
                    className="inline-flex items-center justify-center min-h-[40px] min-w-[40px] text-zinc-500 hover:text-zinc-950 dark:hover:text-zinc-50 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer shrink-0"
                  >
                    <X className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>

                {/* Modal Scrollable Body */}
                <div className="flex-1 min-h-0 px-4 sm:px-5 py-3.5 sm:py-4 overflow-y-auto space-y-4">
                  {/* Cost & Billing Summary Grid (Strictly Separating Kalodata Credits vs Gemini AI Billing) */}
                  <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 sp-surface-muted border border-zinc-200/70 dark:border-zinc-800 rounded-xl p-3.5">
                    <div className="space-y-0.5">
                      <dt className="text-xs text-zinc-500 dark:text-zinc-400">
                        {isMy ? 'Kalodata Credits' : 'Kalodata Credits'}
                      </dt>
                      <dd className="font-mono text-sm font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums">
                        {formatCredits(modalEstimate.estimatedCredits)} cr{' '}
                        <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">
                          ({formatUsd(modalEstimate.estimatedUsd)})
                        </span>
                      </dd>
                      <dd className="text-xs font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                        {modalEstimate.plannedKalodataApiCalls} API · Cache/Local{' '}
                        {modalEstimate.cachedOrLocalModuleCount}
                      </dd>
                    </div>

                    <div className="space-y-0.5 sm:border-l sm:border-zinc-200/80 sm:dark:border-zinc-800 sm:pl-3">
                      <dt className="text-xs text-zinc-500 dark:text-zinc-400">
                        {isMy ? 'Gemini AI API (သီးခြား)' : 'Gemini AI API (Separate)'}
                      </dt>
                      {modalEstimate.plannedGeminiCalls > 0 ? (
                        <>
                          <dd className="font-mono text-sm font-semibold text-sky-700 dark:text-sky-400 tabular-nums">
                            {isMy
                              ? `${modalEstimate.plannedGeminiCalls} call · ခန့်မှန်း/မတွက်နိုင်သေး`
                              : `${modalEstimate.plannedGeminiCalls} call · Est. / Unavailable`}
                          </dd>
                          <dd className="text-xs text-zinc-500 dark:text-zinc-400 leading-snug">
                            {isMy
                              ? 'Google Gemini pricing အပေါ်မူတည်သည် (အခမဲ့ မဟုတ်ပါ)'
                              : 'Depends on token usage & Google Gemini pricing (NOT free)'}
                          </dd>
                        </>
                      ) : (
                        <dd className="font-mono text-sm font-semibold text-zinc-700 dark:text-zinc-300 tabular-nums">
                          0 calls
                        </dd>
                      )}
                    </div>

                    <div className="space-y-0.5 sm:border-l sm:border-zinc-200/80 sm:dark:border-zinc-800 sm:pl-3">
                      <dt className="text-xs text-zinc-500 dark:text-zinc-400">
                        {isMy ? 'Run ပြီးကျန်မည့် Budget' : 'Budget After Run'}
                      </dt>
                      <dd
                        className={`font-mono text-sm font-semibold tabular-nums ${
                          modalBudgetGuard.exceedsSpendingLimit
                            ? 'text-rose-700 dark:text-rose-400'
                            : 'text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        {formatCredits(Math.max(0, modalBudgetGuard.remainingBudgetAfterRun))} /{' '}
                        {formatCredits(modalBudgetGuard.spendingLimitCredits)} cr
                      </dd>
                      {liveBalanceCredits !== null && (
                        <dd className="text-xs font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                          Kalodata Bal: {formatCredits(liveBalanceCredits)} cr
                        </dd>
                      )}
                    </div>
                  </dl>

                  {/* Module List Inside Modal (With Inline Remove to Lower Cost Instantly) */}
                  {modalEstimate.modules.length > 0 ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                        <span>
                          {isMy
                            ? `ပါဝင်သော Analysis များ (${modalEstimate.modules.length})`
                            : `Included Modules (${modalEstimate.modules.length})`}
                        </span>
                        <span>{isMy ? 'ခန့်မှန်းစရိတ်' : 'Est. Cost'}</span>
                      </div>

                      <div className="divide-y divide-zinc-100 dark:divide-zinc-800/80 border border-zinc-200/80 dark:border-zinc-800 rounded-xl overflow-hidden">
                        {modalEstimate.modules.map((item) => {
                          const def = getDeepDiveOptionById(item.analysisId);
                          const label = def ? (isMy ? def.nameMy : def.nameEn) : item.analysisId;
                          return (
                            <div
                              key={item.analysisId}
                              className="px-3.5 py-2.5 flex items-center justify-between gap-3 bg-white dark:bg-zinc-900"
                            >
                              <div className="min-w-0">
                                <div className="font-medium text-zinc-950 dark:text-zinc-50 truncate">
                                  {def ? (
                                    <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400 mr-1.5">
                                      0{def.order}.
                                    </span>
                                  ) : null}
                                  {label}
                                </div>
                                <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                                  {isMy ? item.apiLabelMy : item.apiLabelEn}
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <span className="font-mono text-xs tabular-nums font-medium text-zinc-800 dark:text-zinc-200 whitespace-nowrap">
                                  {formatModuleCostShort(item, isMy)}
                                </span>
                                {canRemoveModulesInModal && (
                                  <button
                                    type="button"
                                    onClick={() => onToggleOption(item.analysisId)}
                                    disabled={isAnyRunning}
                                    aria-label={isMy ? `${label} ဖြုတ်မည်` : `Remove ${label}`}
                                    className="inline-flex items-center justify-center min-h-[36px] min-w-[36px] text-zinc-500 dark:text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                                  >
                                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <p className="text-zinc-500 dark:text-zinc-400">
                      {copy.noneSelectedHint}
                    </p>
                  )}

                  {/* Dedicated 1.0 Credit Review Insight Warning */}
                  {modalEstimate.hasHighCostReviewInsight && (
                    <div
                      role="status"
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/60 rounded-xl text-xs text-amber-900 dark:text-amber-200"
                    >
                      <div className="flex items-start gap-2 min-w-0">
                        <AlertTriangle
                          className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5"
                          aria-hidden="true"
                        />
                        <p className="leading-relaxed">
                          {isMy
                            ? `Review Insight (Option #6) သည် Cache မရှိသေးသဖြင့် Kalodata Comment Insight API ${KALODATA_COMMENT_INSIGHT_CREDIT.toFixed(1)} credit (${formatUsd(KALODATA_COMMENT_INSIGHT_CREDIT * KALODATA_USD_PER_CREDIT)}) ထပ်မံကုန်ကျပါမည်။`
                            : `Review Insight (Option #6) is uncached and adds ${KALODATA_COMMENT_INSIGHT_CREDIT.toFixed(1)} Kalodata credit (${formatUsd(KALODATA_COMMENT_INSIGHT_CREDIT * KALODATA_USD_PER_CREDIT)}).`}
                        </p>
                      </div>
                      {canRemoveModulesInModal && (
                        <button
                          type="button"
                          onClick={() => onToggleOption('customer-review-intelligence')}
                          disabled={isAnyRunning}
                          className="inline-flex items-center justify-center gap-1 min-h-[40px] px-3 py-1.5 text-xs font-medium text-amber-950 dark:text-amber-100 bg-amber-100/80 dark:bg-amber-950/60 hover:bg-amber-200/80 border border-amber-300 dark:border-amber-800 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
                        >
                          <X className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          <span>
                            {isMy ? 'ဖြုတ်မည် (-1.0 cr)' : 'Remove (-1.0 cr)'}
                          </span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* Fail-Closed Budget Storage Alert inside Modal */}
                  {modalBlockedByStorage && (
                    <div
                      role="alert"
                      className="flex items-start gap-2 p-3 bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200/80 dark:border-rose-900/60 rounded-xl text-xs text-rose-900 dark:text-rose-200"
                    >
                      <AlertCircle
                        className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                      <p className="leading-relaxed">
                        {isMy
                          ? (budgetStorageErrorMy ??
                            'Persistent Budget Storage မရရှိနိုင်သေးသဖြင့် Paid Kalodata API ခေါ်ဆိုမှုကို ပိတ်ထားပါသည်။')
                          : (budgetStorageErrorEn ??
                            'Paid Kalodata API calls are safely blocked until persistent budget storage is available.')}
                      </p>
                    </div>
                  )}

                  {/* Hard Spending Limit / Live Balance Alert */}
                  {(modalBudgetGuard.exceedsSpendingLimit || modalBudgetGuard.exceedsLiveBalance) && (
                    <div
                      role="alert"
                      data-testid="deep-dive-confirm-limit-alert"
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200/80 dark:border-rose-900/60 rounded-xl text-xs text-rose-900 dark:text-rose-200"
                    >
                      <div className="flex items-start gap-2 min-w-0">
                        <AlertCircle
                          className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5"
                          aria-hidden="true"
                        />
                        <p className="leading-relaxed">
                          {modalBudgetGuard.exceedsSpendingLimit
                            ? isMy
                              ? `ခန့်မှန်းကုန်ကျစရိတ် (${formatCredits(modalEstimate.estimatedCredits)} cr) သည် ကျန်ရှိသော Spending Limit (${formatCredits(modalBudgetGuard.remainingBudgetBeforeRun)} cr) ထက် ကျော်လွန်နေသဖြင့် Paid API ခေါ်ဆိုမှုကို ပိတ်ထားပါသည်။`
                              : `Estimated cost (${formatCredits(modalEstimate.estimatedCredits)} cr) exceeds your remaining Spending Limit (${formatCredits(modalBudgetGuard.remainingBudgetBeforeRun)} cr). Paid API execution is blocked.`
                            : isMy
                              ? `ခန့်မှန်းကုန်ကျစရိတ် (${formatCredits(modalEstimate.estimatedCredits)} cr) သည် လက်ရှိ Kalodata Balance (${formatCredits(modalBudgetGuard.liveBalanceCredits ?? 0)} cr) ထက် ကျော်လွန်နေပါသည်။`
                              : `Estimated cost (${formatCredits(modalEstimate.estimatedCredits)} cr) exceeds your live Kalodata credit balance (${formatCredits(modalBudgetGuard.liveBalanceCredits ?? 0)} cr).`}
                        </p>
                      </div>
                      {modalBudgetGuard.exceedsSpendingLimit && (
                        <button
                          type="button"
                          onClick={() =>
                            handleSpendingLimitUpdate(modalBudgetGuard.recommendedMinimumLimit)
                          }
                          className="inline-flex items-center justify-center min-h-[40px] px-3 py-1.5 text-xs font-medium text-rose-950 dark:text-rose-100 bg-rose-100/80 dark:bg-rose-950/60 hover:bg-rose-200/80 border border-rose-300 dark:border-rose-800 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
                        >
                          {isMy
                            ? `Limit ကို ${formatCredits(modalBudgetGuard.recommendedMinimumLimit)} cr သို့ တိုးမည်`
                            : `Raise Limit to ${formatCredits(modalBudgetGuard.recommendedMinimumLimit)} cr`}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Spending Limit Adjustment Controls Right Inside the Checkout Modal */}
                  <div className="pt-3 border-t border-zinc-200/80 dark:border-zinc-800 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label
                        htmlFor="deep-dive-spending-limit"
                        className="text-xs font-medium text-zinc-600 dark:text-zinc-300"
                      >
                        {isMy ? 'Spending Limit (Credits)' : 'Spending Limit (Credits)'}
                      </label>
                      <span className="font-mono text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                        {isMy
                          ? `ကျန် Budget: ${formatCredits(modalBudgetGuard.remainingBudgetBeforeRun)} cr`
                          : `Remaining: ${formatCredits(modalBudgetGuard.remainingBudgetBeforeRun)} cr`}
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
                        className="w-24 min-h-[40px] px-2.5 py-1.5 text-xs font-mono tabular-nums text-zinc-950 dark:text-zinc-50 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-300"
                      />
                      {SPENDING_LIMIT_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => handleSpendingLimitUpdate(preset)}
                          className={`min-h-[40px] px-3 py-1.5 text-xs font-mono tabular-nums rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
                            Math.abs(effectiveSpendingLimit - preset) < 1e-6
                              ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950 border-zinc-900 dark:border-zinc-100'
                              : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:border-zinc-400'
                          }`}
                        >
                          {formatCredits(preset)} cr
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="px-4 sm:px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-3.5 border-t border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/50 flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="sp-btn-secondary"
                  >
                    {isConfirmationMode
                      ? isMy
                        ? 'မလုပ်တော့ပါ (Cancel)'
                        : 'Cancel'
                      : isMy
                        ? 'ပိတ်မည်'
                        : 'Done'}
                  </button>

                  {isConfirmationMode ? (
                    <button
                      type="button"
                      onClick={handleConfirmPendingRun}
                      disabled={
                        isAnyRunning ||
                        !modalBudgetGuard.canProceedWithoutLimitChange ||
                        modalBlockedByStorage
                      }
                      className="sp-btn-primary text-xs"
                    >
                      <Check className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>{isMy ? 'အတည်ပြုပြီး Run မည်' : 'Confirm & Run'}</span>
                    </button>
                  ) : selectedCount > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        setIsBudgetModalOpen(false);
                        handleRequestBatchRun();
                      }}
                      disabled={
                        isAnyRunning ||
                        !modalBudgetGuard.canProceedWithoutLimitChange ||
                        modalBlockedByStorage
                      }
                      className="sp-btn-primary text-xs"
                    >
                      <Play className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>
                        {modalEstimate.requiresExplicitConfirmation
                          ? isMy
                            ? `အတည်ပြုပြီး Run (${selectedCount})`
                            : `Review & Run (${selectedCount})`
                          : isMy
                            ? `Run Selected (${selectedCount})`
                            : `Run Selected (${selectedCount})`}
                      </span>
                    </button>
                  ) : null}
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}
