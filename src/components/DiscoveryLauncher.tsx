import { type ComponentProps, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ChevronRight,
  Compass,
  ImageOff,
  Link2,
  Radar,
  SlidersHorizontal,
} from 'lucide-react';
import type {
  Language,
  ResearchCostSummary,
  ResearchMode,
  ResearchQuantity,
  SingleProductHistoryRecord,
} from '../types/product';
import { getCategoryLabel } from '../utils/categoryRegistry';
import { formatThb, resolveProductImageDisplayConfig } from '../utils/format';
import { formatCredits } from '../utils/kalodataPricing';
import {
  MOTION_DURATIONS,
  MOTION_EASE,
  MOTION_TRANSITIONS,
  TACTILE_INTERACTIONS,
} from '../utils/motionPresets';
import { formatResearchDateTime } from '../utils/savedProductsStorage';
import { evaluateProductOpportunity } from '../utils/scoring';
import { TRANSLATIONS } from '../i18n/translations';
import { ProductImage } from './ProductImage';
import { ProductLinkImportPanel } from './ProductLinkImportPanel';
import { ResearchSettingsPanel } from './ResearchSettingsPanel';
import { AnimatedNumber } from './visual';

type ResearchSettingsProps = Omit<
  ComponentProps<typeof ResearchSettingsPanel>,
  'compactTop' | 'canCollapse' | 'onCollapse' | 'layout'
>;

type LinkImportProps = Omit<
  ComponentProps<typeof ProductLinkImportPanel>,
  'compactTop' | 'layout' | 'onClose'
>;

export interface LauncherPerformanceMetrics {
  totalProducts: number;
  priorityCount: number;
  topScore: number | null;
  maxCommissionPct: number | null;
}

interface DiscoveryLauncherProps {
  language: Language;
  settingsExpanded: boolean;
  onExpandSettingsChange: (expanded: boolean) => void;
  singleDrawerOpen: boolean;
  onSingleDrawerOpenChange: (open: boolean) => void;
  recentSingleRecord: SingleProductHistoryRecord | null;
  onOpenRecentSingleResult: () => void;
  salesWeightPct: number;
  hasResults: boolean;
  performanceMetrics?: LauncherPerformanceMetrics | null;
  lastCostSummary: ResearchCostSummary | null;
  singleHistoryCount: number;
  settingsProps: ResearchSettingsProps;
  linkImportProps: LinkImportProps;
}

function getCompactModeLabel(mode: ResearchMode, language: Language): string {
  const t = TRANSLATIONS[language];
  if (mode === 'fast') return t.modeFastTitle;
  if (mode === 'balanced') return t.modeBalancedTitle;
  return t.modeDeepTitle;
}

function formatCompactCategoriesLabel(
  selectedCategories: ResearchSettingsProps['selectedCategories'],
  selectedSubcategoryIds: readonly string[],
  language: Language
): string {
  const isMy = language === 'my';
  if (selectedCategories.length === 0) {
    return isMy ? 'Category မရွေးရသေးပါ' : 'No category';
  }

  let primaryLabel: string;
  if (selectedCategories.length <= 2) {
    primaryLabel = selectedCategories
      .map((cat) => getCategoryLabel(cat, language, { short: true }))
      .join(' · ');
  } else {
    const first = getCategoryLabel(selectedCategories[0], language, { short: true });
    primaryLabel = isMy
      ? `${first} +${selectedCategories.length - 1} မျိုး`
      : `${first} +${selectedCategories.length - 1} more`;
  }

  if (selectedSubcategoryIds.length > 0) {
    return isMy
      ? `${primaryLabel} (${selectedSubcategoryIds.length} L2)`
      : `${primaryLabel} (${selectedSubcategoryIds.length} sub)`;
  }
  return primaryLabel;
}

function formatCompactQuantity(quantity: ResearchQuantity, language: Language): string {
  return language === 'my' ? `${quantity} ခု` : `${quantity} items`;
}

export function DiscoveryLauncher({
  language,
  settingsExpanded,
  onExpandSettingsChange,
  singleDrawerOpen,
  onSingleDrawerOpenChange,
  recentSingleRecord,
  onOpenRecentSingleResult,
  salesWeightPct,
  hasResults,
  performanceMetrics,
  lastCostSummary,
  singleHistoryCount,
  settingsProps,
  linkImportProps,
}: DiscoveryLauncherProps) {
  const t = TRANSLATIONS[language];
  const isMy = language === 'my';
  const prefersReduced = useReducedMotion();
  const [activeDeckMode, setActiveDeckMode] = useState<'batch' | 'link'>('batch');

  const showBatchDrawer = hasResults && settingsExpanded && !settingsProps.isHunting;

  const categoriesLabel = formatCompactCategoriesLabel(
    settingsProps.selectedCategories,
    settingsProps.selectedSubcategoryIds,
    language
  );
  const modeLabel = getCompactModeLabel(settingsProps.researchMode, language);
  const quantityLabel = formatCompactQuantity(settingsProps.quantity, language);
  const limitLabel = `${formatCredits(settingsProps.spendingLimitCredits)} cr`;

  const recentSingleScore = useMemo(() => {
    if (!recentSingleRecord) return null;
    return evaluateProductOpportunity(recentSingleRecord.product, { salesWeightPct }).totalScore;
  }, [recentSingleRecord, salesWeightPct]);

  const recentProduct = recentSingleRecord?.product ?? null;
  const recentImgConfig = recentProduct ? resolveProductImageDisplayConfig(recentProduct) : null;

  const topScore = performanceMetrics?.topScore ?? null;
  const priorityCount = performanceMetrics?.priorityCount ?? 0;
  const totalProducts = performanceMetrics?.totalProducts ?? 0;
  const maxCommissionPct = performanceMetrics?.maxCommissionPct ?? null;
  const scoreScale = topScore !== null ? Math.max(0, Math.min(1, topScore / 100)) : 0;

  return (
    <div className="mt-2.5 sm:mt-4">
      {hasResults ? (
        /* Obsidian Hunter Command Radar Deck (Inline Batch Radar <-> Link X-Ray Morph) */
        <section
          aria-label={t.settingsHeading}
          className="relative rounded-2xl overflow-hidden bg-[var(--sp-surface)] border border-[var(--sp-border)] shadow-sm dark:shadow-none dark:ring-1 dark:ring-inset dark:ring-white/[0.03] sp-rise-in"
        >
          {/* Signature Hero 2px Mint-to-Cyan Gradient Rim + Subtle Top Ambient Glow */}
          <div
            aria-hidden="true"
            className="h-[2px] w-full bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-500 dark:from-[#10F5A0] dark:via-[#25F4EE] dark:to-[#10F5A0]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(ellipse_at_top_left,rgba(5,150,105,0.08),transparent_60%),radial-gradient(ellipse_at_top_right,rgba(8,145,178,0.07),transparent_60%)] dark:bg-[radial-gradient(ellipse_at_top_left,rgba(16,245,160,0.12),transparent_60%),radial-gradient(ellipse_at_top_right,rgba(37,244,238,0.10),transparent_60%)]"
          />

          {/* 1. Top Command Header Strip: Mode Switcher + Compact Config Pill */}
          <div className="relative px-3.5 sm:px-5 pt-3 pb-2.5 flex flex-wrap items-center justify-between gap-2.5">
            {/* Segmented Mode Switcher: [Batch Radar] | [Link X-Ray] */}
            <div
              role="tablist"
              aria-label={isMy ? 'Radar Mode ရွေးချယ်ရန်' : 'Command Radar mode'}
              className="inline-flex items-center gap-1 p-1 rounded-xl bg-zinc-200/65 dark:bg-white/[0.05] border border-zinc-200/80 dark:border-white/[0.08]"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeDeckMode === 'batch'}
                onClick={() => setActiveDeckMode('batch')}
                className={`relative inline-flex items-center gap-1.5 min-h-[34px] px-3 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:focus-visible:ring-[#10F5A0] ${
                  activeDeckMode === 'batch'
                    ? 'text-zinc-950 dark:text-zinc-50 font-semibold'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-100'
                }`}
              >
                {activeDeckMode === 'batch' && (
                  <motion.span
                    layoutId="radar-deck-mode-pill"
                    transition={MOTION_TRANSITIONS.snappy}
                    aria-hidden="true"
                    className="absolute inset-0 rounded-lg bg-white dark:bg-[#182030] shadow-xs border border-zinc-200/80 dark:border-white/[0.1]"
                  />
                )}
                <Radar
                  className="relative z-10 w-3.5 h-3.5 text-emerald-600 dark:text-[#10F5A0] shrink-0"
                  aria-hidden="true"
                />
                <span className="relative z-10">
                  {isMy ? 'Batch Radar' : 'Batch Radar'}
                </span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeDeckMode === 'link'}
                onClick={() => setActiveDeckMode('link')}
                className={`relative inline-flex items-center gap-1.5 min-h-[34px] px-3 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 dark:focus-visible:ring-[#25F4EE] ${
                  activeDeckMode === 'link'
                    ? 'text-zinc-950 dark:text-zinc-50 font-semibold'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-100'
                }`}
              >
                {activeDeckMode === 'link' && (
                  <motion.span
                    layoutId="radar-deck-mode-pill"
                    transition={MOTION_TRANSITIONS.snappy}
                    aria-hidden="true"
                    className="absolute inset-0 rounded-lg bg-white dark:bg-[#182030] shadow-xs border border-zinc-200/80 dark:border-white/[0.1]"
                  />
                )}
                <Link2
                  className="relative z-10 w-3.5 h-3.5 text-cyan-600 dark:text-[#25F4EE] shrink-0"
                  aria-hidden="true"
                />
                <span className="relative z-10">
                  {isMy ? 'Link X-Ray' : 'Link X-Ray'}
                </span>
                {singleHistoryCount > 0 && (
                  <span className="relative z-10 font-mono text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
                    ({singleHistoryCount})
                  </span>
                )}
              </button>
            </div>

            {/* Right: Clickable Compact Batch Config Pill */}
            <button
              type="button"
              disabled={settingsProps.isHunting}
              onClick={() => onExpandSettingsChange(true)}
              className="inline-flex items-center gap-1.5 min-w-0 max-w-full min-h-[36px] px-3 py-1 rounded-xl bg-zinc-100/80 dark:bg-white/[0.04] border border-zinc-200/80 dark:border-white/[0.08] hover:border-emerald-500/40 dark:hover:border-[#10F5A0]/40 text-left text-xs text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-50 transition-colors cursor-pointer disabled:opacity-50 group"
            >
              <SlidersHorizontal
                className="w-3.5 h-3.5 text-emerald-600 dark:text-[#10F5A0] shrink-0"
                aria-hidden="true"
              />
              <span className="font-semibold text-zinc-900 dark:text-zinc-100 truncate max-w-[140px] sm:max-w-[200px] group-hover:underline">
                {categoriesLabel}
              </span>
              <span aria-hidden="true" className="text-zinc-300 dark:text-white/20 shrink-0">
                ·
              </span>
              <span className="hidden sm:inline truncate shrink-0">{modeLabel}</span>
              <span aria-hidden="true" className="hidden sm:inline text-zinc-300 dark:text-white/20 shrink-0">
                ·
              </span>
              <span className="font-mono tabular-nums shrink-0">{quantityLabel}</span>
              <span aria-hidden="true" className="text-zinc-300 dark:text-white/20 shrink-0">
                ·
              </span>
              <span className="font-mono tabular-nums text-emerald-700 dark:text-[#10F5A0] font-semibold shrink-0">
                {lastCostSummary?.actualCredits != null
                  ? `${formatCredits(lastCostSummary.actualCredits)}/${limitLabel}`
                  : limitLabel}
              </span>
              {settingsProps.myanmarLanguageOnly && (
                <span className="hidden md:inline font-sans font-medium text-emerald-700 dark:text-[#10F5A0] ml-1 shrink-0">
                  · {t.myanmarFilterActiveBadge}
                </span>
              )}
            </button>
          </div>

          {/* 2. Mode-Morphing Body */}
          <AnimatePresence mode="wait" initial={false}>
            {activeDeckMode === 'batch' ? (
              <motion.div
                key="radar-deck-batch-body"
                initial={prefersReduced ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={prefersReduced ? undefined : { opacity: 0, y: -4 }}
                transition={MOTION_TRANSITIONS.crossFade}
              >
                {/* Live Money Telemetry Tiles */}
                <div className="relative grid grid-cols-3 divide-x divide-zinc-200/75 dark:divide-white/[0.07] border-t border-[var(--sp-border)]">
                  {/* KPI 1: Top Opportunity Score */}
                  <motion.div
                    initial={prefersReduced ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={
                      prefersReduced
                        ? { duration: 0 }
                        : { duration: MOTION_DURATIONS.base, ease: MOTION_EASE.expoOut, delay: 0 }
                    }
                    className="px-3 sm:px-5 py-3 sm:py-3.5 min-w-0"
                  >
                    <div className="text-[11px] sm:text-xs font-medium text-zinc-600 dark:text-zinc-400 truncate leading-snug">
                      {isMy ? 'ထိပ်တန်းရမှတ်' : 'Top Score'}
                    </div>
                    <div className="mt-1 flex items-baseline gap-0.5 font-mono leading-none">
                      {topScore !== null ? (
                        <>
                          <AnimatedNumber
                            value={topScore}
                            highlightSignal={topScore >= 80 ? 'emerald-pulse' : 'none'}
                            className="text-xl sm:text-2xl font-bold text-emerald-600 dark:text-[#10F5A0]"
                          />
                          <span className="text-[11px] sm:text-xs text-zinc-400 dark:text-zinc-500">
                            /100
                          </span>
                        </>
                      ) : (
                        <span className="text-xl sm:text-2xl font-bold text-zinc-400">—</span>
                      )}
                    </div>
                    <div
                      aria-hidden="true"
                      className="mt-2 h-[3px] w-full rounded-full bg-zinc-200/80 dark:bg-white/10 overflow-hidden"
                    >
                      <motion.div
                        className="h-full w-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400 dark:from-[#10F5A0] dark:to-[#25F4EE] origin-left"
                        initial={prefersReduced ? false : { scaleX: 0 }}
                        animate={{ scaleX: scoreScale }}
                        transition={prefersReduced ? { duration: 0 } : MOTION_TRANSITIONS.ticker}
                      />
                    </div>
                  </motion.div>

                  {/* KPI 2: 70+ Priority Picks */}
                  <motion.div
                    initial={prefersReduced ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={
                      prefersReduced
                        ? { duration: 0 }
                        : { duration: MOTION_DURATIONS.base, ease: MOTION_EASE.expoOut, delay: 0.05 }
                    }
                    className="px-3 sm:px-5 py-3 sm:py-3.5 min-w-0"
                  >
                    <div className="text-[11px] sm:text-xs font-medium text-zinc-600 dark:text-zinc-400 truncate leading-snug">
                      {isMy ? '70+ ရမှတ်' : '70+ Picks'}
                    </div>
                    <div className="mt-1 flex items-baseline gap-0.5 font-mono leading-none">
                      <AnimatedNumber
                        value={priorityCount}
                        className="text-xl sm:text-2xl font-bold text-cyan-600 dark:text-[#25F4EE]"
                      />
                      <span className="text-[11px] sm:text-xs text-zinc-400 dark:text-zinc-500">
                        /{totalProducts}
                      </span>
                    </div>
                    <div className="mt-1.5 text-[11px] text-zinc-500 dark:text-zinc-400 truncate leading-snug">
                      {isMy ? 'အကြံပြုရလဒ်' : 'Priority picks'}
                    </div>
                  </motion.div>

                  {/* KPI 3: Max Verified Commission */}
                  <motion.div
                    initial={prefersReduced ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={
                      prefersReduced
                        ? { duration: 0 }
                        : { duration: MOTION_DURATIONS.base, ease: MOTION_EASE.expoOut, delay: 0.1 }
                    }
                    className="px-3 sm:px-5 py-3 sm:py-3.5 min-w-0"
                  >
                    <div className="text-[11px] sm:text-xs font-medium text-zinc-600 dark:text-zinc-400 truncate leading-snug">
                      {isMy ? 'အမြင့်ဆုံး %' : 'Top Comm.'}
                    </div>
                    <div className="mt-1 flex items-baseline gap-0.5 font-mono leading-none">
                      {maxCommissionPct !== null ? (
                        <AnimatedNumber
                          value={maxCommissionPct}
                          decimals={maxCommissionPct % 1 !== 0 ? 1 : 0}
                          suffix="%"
                          highlightSignal={maxCommissionPct >= 12 ? 'emerald-sheen' : 'none'}
                          className={`text-xl sm:text-2xl font-bold ${
                            maxCommissionPct >= 12
                              ? 'text-emerald-600 dark:text-[#10F5A0]'
                              : 'text-amber-600 dark:text-amber-400'
                          }`}
                        />
                      ) : (
                        <span className="text-xl sm:text-2xl font-bold text-zinc-400">—</span>
                      )}
                    </div>
                    <div className="mt-1.5 text-[11px] text-zinc-500 dark:text-zinc-400 truncate leading-snug">
                      {isMy ? 'ကော်မရှင်နှုန်း' : 'Max verified rate'}
                    </div>
                  </motion.div>
                </div>

                {/* Active Hunting Scan Beam */}
                {settingsProps.isHunting && (
                  <div
                    aria-hidden="true"
                    className="relative h-[3px] w-full bg-emerald-500/15 dark:bg-[#10F5A0]/15 overflow-hidden"
                  >
                    <div className="sp-scan-beam h-full rounded-full bg-gradient-to-r from-transparent via-[#25F4EE] to-[#10F5A0]" />
                  </div>
                )}

                {/* Compact Bottom Action Dock */}
                <div className="relative px-3.5 sm:px-5 py-2.5 sm:py-3 border-t border-[var(--sp-border)] bg-zinc-50/80 dark:bg-[#090C12]/75 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
                  <div className="flex items-center gap-2">
                    <motion.button
                      type="button"
                      disabled={settingsProps.isHunting}
                      onClick={() => onExpandSettingsChange(true)}
                      whileTap={
                        prefersReduced || settingsProps.isHunting
                          ? undefined
                          : TACTILE_INTERACTIONS.buttonTap
                      }
                      transition={MOTION_TRANSITIONS.snappy}
                      className="sp-btn-volt relative overflow-hidden min-h-[42px] sm:min-h-[40px] px-4 sm:px-5 flex-1 sm:flex-none"
                    >
                      {!settingsProps.isHunting && (
                        <span aria-hidden="true" className="sp-shimmer-sheen" />
                      )}
                      <Compass className="w-4 h-4 shrink-0 relative z-10" aria-hidden="true" />
                      <span className="relative z-10 sm:hidden">
                        {settingsProps.isHunting
                          ? t.huntingInProgress
                          : isMy
                            ? 'အသစ်ရှာမည်'
                            : 'New Hunt'}
                      </span>
                      <span className="relative z-10 hidden sm:inline">
                        {settingsProps.isHunting ? t.huntingInProgress : t.launcherTabBatch}
                      </span>
                    </motion.button>

                    <motion.button
                      type="button"
                      onClick={() => setActiveDeckMode('link')}
                      whileTap={prefersReduced ? undefined : TACTILE_INTERACTIONS.buttonTap}
                      transition={MOTION_TRANSITIONS.snappy}
                      className="inline-flex items-center justify-center gap-1.5 min-h-[42px] sm:min-h-[40px] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-white dark:bg-[#131823] text-cyan-800 dark:text-[#25F4EE] border border-cyan-500/30 dark:border-[#25F4EE]/25 hover:border-cyan-500/60 dark:hover:border-[#25F4EE]/55 transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 dark:focus-visible:ring-[#25F4EE]"
                    >
                      <Link2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span>{isMy ? 'Link စစ်မည်' : 'Link X-Ray'}</span>
                    </motion.button>
                  </div>

                  {/* Compact Recent Single-Link 1-Tap Strip (if available) */}
                  {recentSingleRecord && recentProduct && (
                    <button
                      type="button"
                      onClick={onOpenRecentSingleResult}
                      className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-white/80 dark:bg-white/[0.04] border border-zinc-200/80 dark:border-white/[0.08] hover:border-cyan-500/40 dark:hover:border-[#25F4EE]/40 flex items-center justify-between gap-2.5 text-left group cursor-pointer transition-colors min-w-0 sm:max-w-[360px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 dark:focus-visible:ring-[#25F4EE]"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="w-7 h-7 rounded-md overflow-hidden bg-zinc-100 dark:bg-white/[0.06] border border-zinc-200/80 dark:border-white/[0.1] shrink-0">
                          {recentImgConfig?.canRender && recentImgConfig.src ? (
                            <ProductImage
                              src={recentImgConfig.src}
                              fallbackSrc={recentImgConfig.fallbackSrc}
                              productId={recentImgConfig.productId}
                              alt={recentProduct.name}
                              title={isMy ? recentProduct.nameMy : recentProduct.name}
                              unavailableLabel={t.cardImageUnverified}
                              compact
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <ImageOff
                                className="w-3.5 h-3.5 text-zinc-400"
                                aria-hidden="true"
                              />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex items-center gap-1.5 text-xs">
                          <span className="font-semibold text-cyan-700 dark:text-[#25F4EE] shrink-0">
                            {t.singleRecentLabel}:
                          </span>
                          <span className="text-zinc-800 dark:text-zinc-200 font-medium truncate group-hover:underline">
                            {isMy ? recentProduct.nameMy : recentProduct.name}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 text-xs font-mono tabular-nums">
                        {typeof recentProduct.priceThb === 'number' && (
                          <span className="hidden lg:inline text-zinc-500 dark:text-zinc-400">
                            {formatThb(recentProduct.priceThb)}
                          </span>
                        )}
                        {recentSingleScore !== null && (
                          <span className="font-bold text-emerald-700 dark:text-[#10F5A0]">
                            {recentSingleScore}/100
                          </span>
                        )}
                        <ChevronRight
                          className="w-3.5 h-3.5 text-zinc-400 group-hover:translate-x-0.5 transition-transform"
                          aria-hidden="true"
                        />
                      </div>
                    </button>
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="radar-deck-link-body"
                initial={prefersReduced ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={prefersReduced ? undefined : { opacity: 0, y: -4 }}
                transition={MOTION_TRANSITIONS.crossFade}
                className="relative border-t border-[var(--sp-border)] p-3.5 sm:p-5 bg-zinc-50/40 dark:bg-[#090C12]/60"
              >
                <ProductLinkImportPanel
                  {...linkImportProps}
                  layout="inline"
                  compactTop
                />
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      ) : (
        /* First Visit (No Batch Results Yet): Obsidian/Porcelain Quick Link Bar + Inline Batch Setup */
        <>
          <section
            aria-label={t.linkImportHeading}
            className="relative rounded-2xl overflow-hidden border border-[var(--sp-border)] bg-[var(--sp-surface)] shadow-sm dark:shadow-none dark:ring-1 dark:ring-inset dark:ring-white/[0.03] sp-rise-in"
          >
            <div
              aria-hidden="true"
              className="h-[2px] w-full bg-gradient-to-r from-cyan-500 via-teal-400 to-emerald-500 dark:from-[#25F4EE] dark:via-[#10F5A0] dark:to-[#25F4EE]"
            />
            <div className="px-3.5 sm:px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              {recentSingleRecord && recentProduct ? (
                <button
                  type="button"
                  onClick={onOpenRecentSingleResult}
                  className="flex items-center gap-3 min-w-0 flex-1 text-left group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 dark:focus-visible:ring-[#25F4EE] rounded-lg"
                >
                  <div className="w-10 h-10 rounded-lg overflow-hidden bg-zinc-100 dark:bg-white/[0.06] border border-zinc-200/80 dark:border-white/[0.1] shrink-0">
                    {recentImgConfig?.canRender && recentImgConfig.src ? (
                      <ProductImage
                        src={recentImgConfig.src}
                        fallbackSrc={recentImgConfig.fallbackSrc}
                        productId={recentImgConfig.productId}
                        alt={recentProduct.name}
                        title={isMy ? recentProduct.nameMy : recentProduct.name}
                        unavailableLabel={t.cardImageUnverified}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageOff className="w-4 h-4 text-zinc-500 dark:text-zinc-400" aria-hidden="true" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                      <span className="font-semibold text-cyan-700 dark:text-[#25F4EE]">
                        {t.singleRecentLabel}
                      </span>
                      <span aria-hidden="true" className="text-zinc-300 dark:text-white/20">
                        ·
                      </span>
                      <span>{getCategoryLabel(recentProduct.category, language, { short: true })}</span>
                      {typeof recentProduct.priceThb === 'number' && (
                        <>
                          <span aria-hidden="true" className="text-zinc-300 dark:text-white/20">
                            ·
                          </span>
                          <span className="font-mono tabular-nums text-zinc-800 dark:text-zinc-200">
                            {formatThb(recentProduct.priceThb)}
                          </span>
                        </>
                      )}
                      {recentSingleScore !== null && (
                        <>
                          <span aria-hidden="true" className="text-zinc-300 dark:text-white/20">
                            ·
                          </span>
                          <span className="font-mono font-semibold tabular-nums text-emerald-700 dark:text-[#10F5A0]">
                            {recentSingleScore}/100
                          </span>
                        </>
                      )}
                      <span aria-hidden="true" className="hidden md:inline text-zinc-300 dark:text-white/20">
                        ·
                      </span>
                      <span className="hidden md:inline font-mono tabular-nums">
                        {formatResearchDateTime(recentSingleRecord.researchedAt, language)}
                      </span>
                    </div>

                    <div className="text-xs sm:text-[13px] font-semibold text-zinc-950 dark:text-zinc-50 group-hover:underline truncate">
                      {isMy ? recentProduct.nameMy : recentProduct.name}
                    </div>
                  </div>
                </button>
              ) : (
                <div className="text-xs sm:text-[13px] text-zinc-600 dark:text-zinc-400 min-w-0 leading-relaxed">
                  {t.singleEmptyBarHint}
                </div>
              )}

              <motion.button
                type="button"
                onClick={() => onSingleDrawerOpenChange(true)}
                whileTap={prefersReduced ? undefined : TACTILE_INTERACTIONS.buttonTap}
                transition={MOTION_TRANSITIONS.snappy}
                className="inline-flex items-center justify-center gap-1.5 min-h-[42px] px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-cyan-50/80 dark:bg-[#25F4EE]/10 text-cyan-900 dark:text-[#25F4EE] border border-cyan-500/30 dark:border-[#25F4EE]/25 hover:bg-cyan-100/70 dark:hover:bg-[#25F4EE]/16 transition-colors whitespace-nowrap shrink-0 self-start sm:self-center cursor-pointer"
              >
                <Link2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{isMy ? 'Link စစ်မည်' : t.launcherTabSingle}</span>
                {singleHistoryCount > 0 && (
                  <span className="font-mono text-xs tabular-nums opacity-75">
                    ({singleHistoryCount})
                  </span>
                )}
              </motion.button>
            </div>
          </section>

          <ResearchSettingsPanel
            {...settingsProps}
            layout="inline"
            compactTop
            canCollapse={false}
          />
        </>
      )}

      {/* Full-Height Slide-over Batch Settings Drawer */}
      {showBatchDrawer && (
        <ResearchSettingsPanel
          {...settingsProps}
          layout="drawer"
          canCollapse
          onCollapse={() => onExpandSettingsChange(false)}
        />
      )}

      {/* Full-Height Slide-over Single Link Research Drawer */}
      <AnimatePresence>
        {singleDrawerOpen && (
          <ProductLinkImportPanel
            key="single-link-drawer"
            {...linkImportProps}
            layout="drawer"
            onClose={() => onSingleDrawerOpenChange(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
