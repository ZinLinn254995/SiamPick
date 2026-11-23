import { useMemo, useState } from 'react';
import {
  Activity,
  Check,
  ChevronDown,
  Gauge,
  Info,
  Minus,
  Radio,
  X,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type {
  Language,
  OpportunityEvaluation,
  ResearchProduct,
} from '../types/product';
import { formatThb } from '../utils/format';
import { MOTION_TRANSITIONS } from '../utils/motionPresets';
import {
  computeProductTechnicalAnalysis,
  type AsiBand,
  type AsiCompleteness,
  type ConfluenceSignalId,
  type ConfluenceVerdict,
} from '../utils/technicalAnalysis';

export interface TechnicalSignalStripProps {
  product: ResearchProduct;
  evaluation?: OpportunityEvaluation;
  language: Language;
  variant?: 'compact' | 'detailed';
  className?: string;
}

function getAsiBandMeta(band: AsiBand, isMy: boolean): {
  shortLabel: string;
  fullLabel: string;
  dotClass: string;
  textClass: string;
  strokeClass: string;
  pillClass: string;
} {
  switch (band) {
    case 'early':
      return {
        shortLabel: isMy ? 'အစော' : 'Early',
        fullLabel: isMy ? 'Early Opportunity (အခွင့်အလမ်းကောင်း)' : 'Early Opportunity',
        dotClass: 'bg-emerald-500 dark:bg-[#10F5A0]',
        textClass: 'text-emerald-700 dark:text-[#10F5A0]',
        strokeClass: 'stroke-emerald-500 dark:stroke-[#10F5A0]',
        pillClass:
          'bg-emerald-500/10 dark:bg-[#10F5A0]/12 border-emerald-500/25 dark:border-[#10F5A0]/25 text-emerald-700 dark:text-[#10F5A0]',
      };
    case 'sweet-spot':
      return {
        shortLabel: isMy ? 'သင့်တော်' : 'Sweet Spot',
        fullLabel: isMy ? 'Active Sweet Spot (အကောင်းဆုံးအချိန်)' : 'Active Sweet Spot',
        dotClass: 'bg-cyan-500 dark:bg-[#25F4EE]',
        textClass: 'text-cyan-700 dark:text-[#25F4EE]',
        strokeClass: 'stroke-cyan-500 dark:stroke-[#25F4EE]',
        pillClass:
          'bg-cyan-500/10 dark:bg-[#25F4EE]/12 border-cyan-500/25 dark:border-[#25F4EE]/25 text-cyan-700 dark:text-[#25F4EE]',
      };
    case 'saturated':
      return {
        shortLabel: isMy ? 'ပြိုင်များ' : 'Saturated',
        fullLabel: isMy ? 'Saturated (ပြိုင်ဆိုင်မှုပြင်းထန်)' : 'Saturated',
        dotClass: 'bg-rose-500 dark:bg-[#FE2C55]',
        textClass: 'text-rose-700 dark:text-[#FE2C55]',
        strokeClass: 'stroke-rose-500 dark:stroke-[#FE2C55]',
        pillClass:
          'bg-rose-500/10 dark:bg-[#FE2C55]/12 border-rose-500/25 dark:border-[#FE2C55]/25 text-rose-700 dark:text-[#FE2C55]',
      };
    default:
      return {
        shortLabel: isMy ? 'မရှိ' : 'N/A',
        fullLabel: isMy ? 'Unavailable (တွက်ချက်မရသေး)' : 'Unavailable',
        dotClass: 'bg-zinc-400 dark:bg-zinc-600',
        textClass: 'text-zinc-500 dark:text-zinc-400',
        strokeClass: 'stroke-zinc-400 dark:stroke-zinc-600',
        pillClass:
          'bg-zinc-100/80 dark:bg-white/[0.04] border-zinc-200/80 dark:border-white/[0.08] text-zinc-500 dark:text-zinc-400',
      };
  }
}

function getCompletenessMeta(completeness: AsiCompleteness, isMy: boolean): {
  label: string;
  badgeClass: string;
} {
  switch (completeness) {
    case 'full':
      return {
        label: isMy ? 'ဒေတာပြည့်စုံ (3/3)' : 'Full (3/3)',
        badgeClass:
          'bg-emerald-500/10 text-emerald-700 dark:bg-[#10F5A0]/12 dark:text-[#10F5A0] border-emerald-500/25 dark:border-[#10F5A0]/25',
      };
    case 'partial':
      return {
        label: isMy ? 'တစ်စိတ်တစ်ပိုင်း (2/3)' : 'Partial (2/3)',
        badgeClass:
          'bg-amber-500/10 text-amber-700 dark:bg-amber-400/12 dark:text-amber-300 border-amber-500/25 dark:border-amber-400/25',
      };
    default:
      return {
        label: isMy ? 'မပြည့်စုံ' : 'Unavailable',
        badgeClass:
          'bg-zinc-100 dark:bg-white/[0.05] text-zinc-500 dark:text-zinc-400 border-zinc-200/80 dark:border-white/[0.08]',
      };
  }
}

function getVerdictMeta(verdict: ConfluenceVerdict, isMy: boolean): {
  label: string;
  badgeClass: string;
} {
  switch (verdict) {
    case 'strong-setup':
      return {
        label: isMy ? 'Strong Setup (အလွန်ကောင်း)' : 'Strong Setup',
        badgeClass:
          'bg-emerald-500/12 text-emerald-700 dark:bg-[#10F5A0]/14 dark:text-[#10F5A0] border-emerald-500/30 dark:border-[#10F5A0]/30',
      };
    case 'promising-setup':
      return {
        label: isMy ? 'Promising Setup (အလားအလာကောင်း)' : 'Promising Setup',
        badgeClass:
          'bg-cyan-500/12 text-cyan-700 dark:bg-[#25F4EE]/14 dark:text-[#25F4EE] border-cyan-500/30 dark:border-[#25F4EE]/30',
      };
    case 'mixed-signals':
      return {
        label: isMy ? 'Mixed Signals (အချက်အလက်ရောနှော)' : 'Mixed Signals',
        badgeClass:
          'bg-amber-500/12 text-amber-700 dark:bg-amber-400/14 dark:text-amber-300 border-amber-500/30 dark:border-amber-400/30',
      };
    case 'weak-setup':
      return {
        label: isMy ? 'Weak Setup (အားနည်း)' : 'Weak Setup',
        badgeClass:
          'bg-rose-500/12 text-rose-700 dark:bg-[#FE2C55]/14 dark:text-[#FE2C55] border-rose-500/30 dark:border-[#FE2C55]/30',
      };
    default:
      return {
        label: isMy ? 'Insufficient Data (ဒေတာမလုံလောက်)' : 'Insufficient Data',
        badgeClass:
          'bg-zinc-100 dark:bg-white/[0.05] text-zinc-600 dark:text-zinc-300 border-zinc-200/80 dark:border-white/[0.08]',
      };
  }
}

export function TechnicalSignalStrip({
  product,
  evaluation,
  language,
  variant = 'detailed',
  className = '',
}: TechnicalSignalStripProps) {
  const isMy = language === 'my';
  const prefersReduced = useReducedMotion();
  const [expandedSignalId, setExpandedSignalId] = useState<ConfluenceSignalId | null>(null);

  const analysis = useMemo(
    () => computeProductTechnicalAnalysis(product, evaluation),
    [product, evaluation]
  );

  const asiMeta = getAsiBandMeta(analysis.asi.band, isMy);
  const completenessMeta = getCompletenessMeta(analysis.asi.completeness, isMy);
  const verdictMeta = getVerdictMeta(analysis.confluence.verdict, isMy);

  // =========================================================================
  // COMPACT VARIANT — Single-row micro telemetry strip for Product Cards
  // =========================================================================
  if (variant === 'compact') {
    const videoPct = analysis.channelMix.videoSharePct;
    const videoScale = videoPct !== null ? Math.max(0, Math.min(1, videoPct / 100)) : 0;

    return (
      <div
        className={`flex items-center justify-between gap-2 py-1.5 px-2 rounded-lg bg-zinc-100/75 dark:bg-[#131823]/90 border border-zinc-200/70 dark:border-white/[0.06] ${className}`}
      >
        {/* Left: Micro Tracked Channel Mix Bar */}
        <div className="flex items-center gap-1.5 min-w-0">
          {analysis.channelMix.available && videoPct !== null ? (
            <>
              <span
                aria-hidden="true"
                className="relative inline-flex w-14 sm:w-16 h-1.5 rounded-full bg-cyan-500/35 dark:bg-[#25F4EE]/30 overflow-hidden shrink-0"
              >
                <motion.span
                  initial={false}
                  animate={{ scaleX: videoScale }}
                  transition={MOTION_TRANSITIONS.ticker}
                  className="block w-full h-full origin-left rounded-full bg-emerald-500 dark:bg-[#10F5A0]"
                />
              </span>
              <span className="font-mono text-[11px] font-medium tabular-nums text-zinc-700 dark:text-zinc-200 truncate leading-snug">
                Video {Math.round(videoPct)}%
              </span>
            </>
          ) : (
            <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug">
              {isMy ? 'Channel —' : 'Channel —'}
            </span>
          )}
        </div>

        {/* Right: Compact ASI Saturation Pill */}
        <div
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[11px] font-medium whitespace-nowrap shrink-0 leading-snug ${asiMeta.pillClass}`}
          title={
            analysis.asi.score !== null
              ? `ASI ${analysis.asi.score}/100 · ${asiMeta.fullLabel} (${completenessMeta.label})`
              : asiMeta.fullLabel
          }
        >
          <span
            aria-hidden="true"
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${asiMeta.dotClass}`}
          />
          <span className="font-mono font-semibold tabular-nums">
            {analysis.asi.score !== null ? `ASI ${analysis.asi.score}` : 'ASI —'}
          </span>
          {analysis.asi.score !== null && (
            <span className="hidden xs:inline sm:inline text-[10px] opacity-85">
              {asiMeta.shortLabel}
            </span>
          )}
          {analysis.asi.completeness === 'partial' && (
            <span
              title={isMy ? 'ဒေတာတစ်စိတ်တစ်ပိုင်း (2/3)' : 'Partial ASI data (2/3 factors)'}
              className="w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber-400 shrink-0"
            />
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // DETAILED VARIANT — 3-part Technical Dashboard for Report & Deep Dive
  // =========================================================================
  const asiScore = analysis.asi.score;
  const asiRatio = asiScore !== null ? Math.max(0, Math.min(1, asiScore / 100)) : 0;
  const videoShare = analysis.channelMix.videoSharePct;
  const liveShare = analysis.channelMix.liveSharePct;

  const channelClassLabel =
    analysis.channelMix.classification === 'video-led'
      ? isMy
        ? 'Video ဦးဆောင်'
        : 'Video-Led'
      : analysis.channelMix.classification === 'hybrid'
        ? isMy
          ? 'Video + Live မျှတ'
          : 'Hybrid'
        : analysis.channelMix.classification === 'live-dominated'
          ? isMy
            ? 'Live ဦးဆောင်'
            : 'Live-Dominated'
          : isMy
            ? 'မရရှိနိုင်သေး'
            : 'Unavailable';

  return (
    <section
      aria-label={isMy ? 'Affiliate Technical Signals' : 'Affiliate Technical Signals'}
      className={`sp-card p-4 sm:p-5 space-y-5 ${className}`}
    >
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-zinc-200/80 dark:border-white/[0.08]">
        <div className="flex items-center gap-2 min-w-0">
          <Activity
            className="w-4 h-4 text-emerald-600 dark:text-[#10F5A0] shrink-0"
            aria-hidden="true"
          />
          <h3 className="text-sm sm:text-base font-bold tracking-tight text-zinc-950 dark:text-zinc-50 leading-snug">
            {isMy ? 'Affiliate Technical Signals' : 'Affiliate Technical Signals'}
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {analysis.dataWindowLabel && (
            <span className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-white/[0.05] text-zinc-600 dark:text-zinc-300 border border-zinc-200/80 dark:border-white/[0.08]">
              {analysis.dataWindowLabel}
            </span>
          )}
          <span className="text-[11px] px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-white/[0.05] text-zinc-700 dark:text-zinc-200 border border-zinc-200/80 dark:border-white/[0.08] leading-snug">
            {isMy ? analysis.tierThresholds.labelMy : analysis.tierThresholds.labelEn}
            {analysis.priceTierFallback
              ? isMy
                ? ' (ပုံသေ)'
                : ' (Fallback)'
              : ''}
          </span>
        </div>
      </div>

      {/* Part 1 & Part 2 Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* PART 1: ASI Saturation Gauge & Factor Breakdown */}
        <div className="sp-surface-muted border border-zinc-200/75 dark:border-white/[0.07] p-3.5 sm:p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex items-center gap-1.5">
              <Gauge
                className="w-4 h-4 text-zinc-600 dark:text-zinc-300 shrink-0"
                aria-hidden="true"
              />
              <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 leading-snug">
                {isMy ? 'Affiliate Saturation Index (ASI)' : 'Affiliate Saturation Index (ASI)'}
              </span>
            </div>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-medium leading-snug ${completenessMeta.badgeClass}`}
            >
              {completenessMeta.label}
            </span>
          </div>

          <div className="flex items-center gap-4">
            {/* Semi-Circular Arc SVG Gauge */}
            <div className="relative w-[112px] h-[68px] shrink-0 flex items-end justify-center">
              <svg
                viewBox="0 0 120 72"
                className="w-full h-full overflow-visible"
                aria-hidden="true"
              >
                {/* Background Track Arc */}
                <path
                  d="M 12 62 A 48 48 0 0 1 108 62"
                  fill="none"
                  strokeWidth={10}
                  strokeLinecap="round"
                  className="stroke-zinc-200 dark:stroke-white/10"
                />
                {/* Active Progress Arc */}
                {asiScore !== null && (
                  <motion.path
                    d="M 12 62 A 48 48 0 0 1 108 62"
                    fill="none"
                    strokeWidth={10}
                    strokeLinecap="round"
                    initial={prefersReduced ? { pathLength: asiRatio } : { pathLength: 0 }}
                    animate={{ pathLength: asiRatio }}
                    transition={MOTION_TRANSITIONS.ticker}
                    className={asiMeta.strokeClass}
                  />
                )}
              </svg>
              <div className="absolute bottom-0 inset-x-0 text-center">
                <span className="font-mono text-lg font-bold tabular-nums text-zinc-950 dark:text-zinc-50 leading-none">
                  {asiScore !== null ? asiScore : '—'}
                </span>
                <span className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
                  /100
                </span>
              </div>
            </div>

            <div className="min-w-0 space-y-1 flex-1">
              <div className={`text-xs sm:text-sm font-semibold leading-snug ${asiMeta.textClass}`}>
                {asiMeta.fullLabel}
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                {isMy
                  ? '0–35 အစောပိုင်း · 36–65 သင့်တော် · 66–100 ပြိုင်ဆိုင်မှုပြင်းထန်'
                  : '0–35 Early · 36–65 Active Sweet Spot · 66–100 Saturated'}
              </p>
            </div>
          </div>

          {/* 3-Factor Breakdown */}
          <div className="space-y-2 pt-2 border-t border-zinc-200/75 dark:border-white/[0.07] text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-zinc-600 dark:text-zinc-400 leading-snug">
                {isMy ? '1. Creator Density (45%)' : '1. Creator Density (45%)'}
              </span>
              <span className="font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
                {analysis.asi.factors.creatorDensity.available &&
                analysis.asi.factors.creatorDensity.rawValue !== null
                  ? `${analysis.asi.factors.creatorDensity.rawValue.toLocaleString('en-US')} creators · ${Math.round(analysis.asi.factors.creatorDensity.score ?? 0)}`
                  : '—'}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-zinc-600 dark:text-zinc-400 leading-snug">
                {isMy
                  ? '2. Yield Dilution · Revenue per Creator (35%)'
                  : '2. Yield Dilution · Revenue per Creator (35%)'}
              </span>
              <span className="font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
                {analysis.asi.factors.yieldDilution.available &&
                analysis.revPerCreator !== null
                  ? `${formatThb(analysis.revPerCreator)}/cr · ${Math.round(analysis.asi.factors.yieldDilution.score ?? 0)}`
                  : '—'}
              </span>
            </div>

            <div className="space-y-0.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-zinc-600 dark:text-zinc-400 leading-snug">
                  {isMy ? '3. Trend Momentum (20%)' : '3. Trend Momentum (20%)'}
                </span>
                <span className="font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
                  {analysis.asi.factors.trendMomentum.available &&
                  analysis.asi.factors.trendMomentum.rawValue !== null
                    ? `${analysis.asi.factors.trendMomentum.rawValue >= 0 ? '+' : ''}${analysis.asi.factors.trendMomentum.rawValue.toFixed(1)}% · ${Math.round(analysis.asi.factors.trendMomentum.score ?? 0)}`
                    : '—'}
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed flex items-start gap-1">
                <Info className="w-3 h-3 mt-0.5 shrink-0 opacity-75" aria-hidden="true" />
                <span>
                  {isMy
                    ? 'Trend Momentum သည် ရာသီအလိုက် သို့မဟုတ် Campaign အတက်အကျကြောင့် ပြောင်းလဲနိုင်သည်။'
                    : 'Trend Momentum may reflect short-term campaign or seasonal spikes.'}
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* PART 2: Tracked Channel Revenue Mix & Efficiency */}
        <div className="sp-surface-muted border border-zinc-200/75 dark:border-white/[0.07] p-3.5 sm:p-4 space-y-3 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="inline-flex items-center gap-1.5">
                <Radio
                  className="w-4 h-4 text-cyan-600 dark:text-[#25F4EE] shrink-0"
                  aria-hidden="true"
                />
                <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 leading-snug">
                  {isMy ? 'Tracked Channel Revenue Mix' : 'Tracked Channel Revenue Mix'}
                </span>
              </div>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-white dark:bg-[#0E1118] border border-zinc-200/80 dark:border-white/[0.09] text-zinc-700 dark:text-zinc-200 leading-snug">
                {channelClassLabel}
              </span>
            </div>

            {analysis.channelMix.available && videoShare !== null && liveShare !== null ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-mono tabular-nums">
                  <span className="text-emerald-700 dark:text-[#10F5A0] font-semibold">
                    Video {videoShare.toFixed(1)}% ({formatThb(analysis.channelMix.videoRevenueThb)})
                  </span>
                  <span className="text-cyan-700 dark:text-[#25F4EE] font-semibold">
                    Live {liveShare.toFixed(1)}% ({formatThb(analysis.channelMix.liveRevenueThb)})
                  </span>
                </div>

                <div
                  aria-hidden="true"
                  className="relative w-full h-2.5 rounded-full bg-cyan-500/35 dark:bg-[#25F4EE]/30 overflow-hidden"
                >
                  <motion.div
                    initial={prefersReduced ? false : { scaleX: 0 }}
                    animate={{ scaleX: Math.max(0, Math.min(1, videoShare / 100)) }}
                    transition={MOTION_TRANSITIONS.ticker}
                    className="w-full h-full origin-left rounded-full bg-emerald-500 dark:bg-[#10F5A0]"
                  />
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  {isMy
                    ? 'Video နှင့် Live ရောင်းချဝင်ငွေအချိုး (Shop/Mall ဝင်ငွေများ သီးခြားရှိနိုင်သည်)။'
                    : 'Share of tracked Video vs. Live revenue (total GMV may also include Shop/Mall channels).'}
                </p>
              </div>
            ) : (
              <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed py-2">
                {isMy
                  ? 'Video နှင့် Live ခွဲခြားဝင်ငွေ အချက်အလက် မရရှိနိုင်သေးပါ။'
                  : 'Video and Live channel split revenue is unavailable for this product.'}
              </p>
            )}
          </div>

          {/* Efficiency Metrics Row */}
          <div className="grid grid-cols-3 gap-2 pt-3 border-t border-zinc-200/75 dark:border-white/[0.07]">
            <div className="space-y-0.5">
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug">
                {isMy ? 'Rev / Video' : 'Revenue / Video'}
              </div>
              <div className="font-mono text-xs sm:text-sm font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">
                {formatThb(analysis.revPerVideo)}
              </div>
            </div>

            <div className="space-y-0.5">
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug">
                {isMy ? 'Rev / Creator' : 'Revenue / Creator'}
              </div>
              <div className="font-mono text-xs sm:text-sm font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">
                {formatThb(analysis.revPerCreator)}
              </div>
            </div>

            <div className="space-y-0.5">
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug">
                {isMy ? 'Shop Affiliate %' : 'Shop Affiliate %'}
              </div>
              <div className="font-mono text-xs sm:text-sm font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">
                {analysis.channelMix.shopAffiliateSharePct !== null
                  ? `${analysis.channelMix.shopAffiliateSharePct.toFixed(1)}%`
                  : '—'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* PART 3: 5-Point Winning Setup Confluence Checklist */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 leading-snug">
              {isMy ? '5-Point Winning Setup Confluence' : '5-Point Winning Setup Confluence'}
            </span>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-semibold leading-snug ${verdictMeta.badgeClass}`}
            >
              {verdictMeta.label}
            </span>
          </div>

          <span className="font-mono text-xs tabular-nums text-zinc-600 dark:text-zinc-400">
            <strong className="text-zinc-950 dark:text-zinc-50">
              {analysis.confluence.passedCount} / {analysis.confluence.evaluatedCount}
            </strong>{' '}
            {isMy ? 'အောင်မြင်' : 'passed'}
            {analysis.confluence.unavailableCount > 0 && (
              <span>
                {' '}
                · {analysis.confluence.unavailableCount}{' '}
                {isMy ? 'မရရှိနိုင်' : 'unavailable'}
              </span>
            )}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
          {analysis.confluence.signals.map((signal) => {
            const isOpen = expandedSignalId === signal.id;
            const stateStyle =
              signal.state === 'pass'
                ? 'border-emerald-500/30 dark:border-[#10F5A0]/30 bg-emerald-500/[0.06] dark:bg-[#10F5A0]/[0.07]'
                : signal.state === 'fail'
                  ? 'border-rose-500/25 dark:border-[#FE2C55]/25 bg-rose-500/[0.05] dark:bg-[#FE2C55]/[0.06]'
                  : 'border-zinc-200/80 dark:border-white/[0.08] bg-zinc-100/70 dark:bg-white/[0.03]';

            return (
              <div
                key={signal.id}
                className={`rounded-xl border transition-colors ${stateStyle}`}
              >
                <button
                  type="button"
                  onClick={() =>
                    setExpandedSignalId((prev) => (prev === signal.id ? null : signal.id))
                  }
                  aria-expanded={isOpen}
                  className="w-full text-left p-2.5 flex flex-col gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:focus-visible:ring-[#10F5A0] rounded-xl"
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="inline-flex items-center gap-1.5 min-w-0">
                      {signal.state === 'pass' ? (
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-600 dark:bg-[#10F5A0] text-white dark:text-[#06070A] shrink-0">
                          <Check className="w-2.5 h-2.5 stroke-[3]" aria-hidden="true" />
                        </span>
                      ) : signal.state === 'fail' ? (
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-rose-600 dark:bg-[#FE2C55] text-white shrink-0">
                          <X className="w-2.5 h-2.5 stroke-[3]" aria-hidden="true" />
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-zinc-300 dark:bg-white/15 text-zinc-700 dark:text-zinc-300 shrink-0">
                          <Minus className="w-2.5 h-2.5 stroke-[3]" aria-hidden="true" />
                        </span>
                      )}
                      <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate leading-snug">
                        {isMy ? signal.labelMy : signal.labelEn}
                      </span>
                    </span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400 shrink-0 transition-transform ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                      aria-hidden="true"
                    />
                  </div>

                  <div className="font-mono text-[11px] tabular-nums text-zinc-700 dark:text-zinc-300 pl-5 leading-snug">
                    {signal.valueLabel}
                  </div>
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={prefersReduced ? false : { opacity: 0, y: -3 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={prefersReduced ? undefined : { opacity: 0, y: -3 }}
                      transition={MOTION_TRANSITIONS.accordion}
                      className="px-2.5 pb-2.5 pt-1 border-t border-zinc-200/60 dark:border-white/[0.06]"
                    >
                      <p className="text-[11px] text-zinc-600 dark:text-zinc-300 leading-relaxed">
                        {isMy ? signal.reasonMy : signal.reasonEn}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
