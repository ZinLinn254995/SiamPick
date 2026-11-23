import { type ComponentProps, useMemo } from 'react';
import {
  ChevronRight,
  Compass,
  ImageOff,
  Link2,
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
        /* Option B: Live Performance Banner + Color-Coded Quick Switcher Dock */
        <section
          aria-label={t.settingsHeading}
          className="relative rounded-2xl overflow-hidden border border-zinc-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs sp-rise-in"
        >
          {/* Subtle Top Gradient Rim + Atmospheric Ambient Glow */}
          <div
            aria-hidden="true"
            className="h-[2px] w-full bg-gradient-to-r from-emerald-500 via-cyan-500 to-indigo-500"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(ellipse_at_top_left,rgba(16,185,129,0.08),transparent_60%),radial-gradient(ellipse_at_top_right,rgba(99,102,241,0.07),transparent_60%)] dark:bg-[radial-gradient(ellipse_at_top_left,rgba(16,185,129,0.14),transparent_60%),radial-gradient(ellipse_at_top_right,rgba(99,102,241,0.12),transparent_60%)]"
          />

          {/* 1. Interactive Config Summary Strip (Click to tweak batch parameters) */}
          <div className="relative px-3.5 sm:px-5 pt-2.5 pb-2 flex items-center justify-between gap-2.5">
            <button
              type="button"
              disabled={settingsProps.isHunting}
              onClick={() => onExpandSettingsChange(true)}
              className="inline-flex items-center gap-1.5 min-w-0 min-h-[34px] -ml-1 px-1 rounded-md text-left text-xs text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-50 transition-colors cursor-pointer disabled:opacity-50 group"
            >
              <SlidersHorizontal
                className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0"
                aria-hidden="true"
              />
              <span className="font-semibold text-zinc-900 dark:text-zinc-100 truncate group-hover:underline">
                {categoriesLabel}
              </span>
              <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-600 shrink-0">
                ·
              </span>
              <span className="truncate shrink-0">{modeLabel}</span>
              <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-600 shrink-0">
                ·
              </span>
              <span className="font-mono tabular-nums shrink-0">{quantityLabel}</span>
            </button>

            <div className="flex items-center gap-2 text-xs font-mono tabular-nums text-zinc-500 dark:text-zinc-400 shrink-0">
              {settingsProps.myanmarLanguageOnly && (
                <span className="hidden sm:inline font-sans font-medium text-emerald-700 dark:text-emerald-400">
                  {t.myanmarFilterActiveBadge}
                </span>
              )}
              <span>
                {lastCostSummary?.actualCredits != null
                  ? `${formatCredits(lastCostSummary.actualCredits)} / ${limitLabel}`
                  : limitLabel}
              </span>
            </div>
          </div>

          {/* 2. Live Performance Telemetry Banner (Real Session Metrics with Animated Count-Up) */}
          <div className="relative grid grid-cols-3 divide-x divide-zinc-200/75 dark:divide-zinc-800/80 border-t border-zinc-100 dark:border-zinc-800/80">
            {/* KPI 1: Top Opportunity Score */}
            <div className="px-3 sm:px-5 py-2.5 sm:py-3 min-w-0">
              <div className="text-[11px] sm:text-xs font-medium text-zinc-600 dark:text-zinc-400 truncate">
                {isMy ? 'ထိပ်တန်းရမှတ်' : 'Top Score'}
              </div>
              <div className="mt-0.5 flex items-baseline gap-0.5 font-mono leading-none">
                {topScore !== null ? (
                  <>
                    <AnimatedNumber
                      value={topScore}
                      className="text-lg sm:text-2xl font-bold text-emerald-700 dark:text-emerald-400"
                    />
                    <span className="text-[11px] sm:text-xs text-zinc-400 dark:text-zinc-500">
                      /100
                    </span>
                  </>
                ) : (
                  <span className="text-lg sm:text-2xl font-bold text-zinc-400">—</span>
                )}
              </div>
              <div
                aria-hidden="true"
                className="mt-1.5 h-[3px] w-full rounded-full bg-zinc-200/80 dark:bg-zinc-800 overflow-hidden"
              >
                <div
                  className="h-full w-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400 origin-left transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
                  style={{ transform: `scaleX(${scoreScale})` }}
                />
              </div>
            </div>

            {/* KPI 2: 70+ Priority Picks */}
            <div className="px-3 sm:px-5 py-2.5 sm:py-3 min-w-0">
              <div className="text-[11px] sm:text-xs font-medium text-zinc-600 dark:text-zinc-400 truncate">
                {isMy ? '70+ ရမှတ်' : '70+ Picks'}
              </div>
              <div className="mt-0.5 flex items-baseline gap-0.5 font-mono leading-none">
                <AnimatedNumber
                  value={priorityCount}
                  className="text-lg sm:text-2xl font-bold text-cyan-700 dark:text-cyan-400"
                />
                <span className="text-[11px] sm:text-xs text-zinc-400 dark:text-zinc-500">
                  /{totalProducts}
                </span>
              </div>
              <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                {isMy ? 'အကြံပြုရလဒ်' : 'Priority picks'}
              </div>
            </div>

            {/* KPI 3: Max Verified Commission */}
            <div className="px-3 sm:px-5 py-2.5 sm:py-3 min-w-0">
              <div className="text-[11px] sm:text-xs font-medium text-zinc-600 dark:text-zinc-400 truncate">
                {isMy ? 'အမြင့်ဆုံး %' : 'Top Comm.'}
              </div>
              <div className="mt-0.5 flex items-baseline gap-0.5 font-mono leading-none">
                {maxCommissionPct !== null ? (
                  <AnimatedNumber
                    value={maxCommissionPct}
                    decimals={maxCommissionPct % 1 !== 0 ? 1 : 0}
                    suffix="%"
                    className="text-lg sm:text-2xl font-bold text-amber-700 dark:text-amber-400"
                  />
                ) : (
                  <span className="text-lg sm:text-2xl font-bold text-zinc-400">—</span>
                )}
              </div>
              <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                {isMy ? 'ကော်မရှင်နှုန်း' : 'Max rate'}
              </div>
            </div>
          </div>

          {/* Active Hunting Scan Beam */}
          {settingsProps.isHunting && (
            <div
              aria-hidden="true"
              className="relative h-[3px] w-full bg-emerald-500/15 overflow-hidden"
            >
              <div className="sp-scan-beam h-full rounded-full bg-gradient-to-r from-transparent via-emerald-400 to-cyan-400" />
            </div>
          )}

          {/* 3. Color-Coded Quick Switcher Action Dock */}
          <div className="relative px-3 sm:px-5 py-2.5 sm:py-3 border-t border-zinc-200/75 dark:border-zinc-800/80 bg-zinc-50/75 dark:bg-zinc-950/55">
            <div className="grid grid-cols-2 sm:flex sm:items-center sm:justify-between gap-2 sm:gap-3">
              {/* Primary CTA: Emerald -> Teal Gradient + Light Sweep */}
              <button
                type="button"
                disabled={settingsProps.isHunting}
                onClick={() => onExpandSettingsChange(true)}
                className="relative overflow-hidden inline-flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-[40px] px-3 sm:px-5 py-2 rounded-xl text-xs sm:text-sm font-semibold text-white dark:text-zinc-950 bg-gradient-to-r from-emerald-600 to-teal-500 dark:from-emerald-400 dark:to-cyan-400 shadow-sm shadow-emerald-600/20 dark:shadow-emerald-500/15 hover:brightness-105 active:scale-[0.98] disabled:opacity-55 disabled:cursor-not-allowed transition-all cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-950"
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
              </button>

              {/* Secondary CTA: Indigo Accent Link Checker */}
              <button
                type="button"
                onClick={() => onSingleDrawerOpenChange(true)}
                className="inline-flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-[40px] px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-900 dark:text-indigo-200 border border-indigo-200/90 dark:border-indigo-700/70 hover:bg-indigo-100/80 dark:hover:bg-indigo-900/60 active:scale-[0.98] transition-all cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-950"
              >
                <Link2
                  className="w-4 h-4 shrink-0 text-indigo-600 dark:text-indigo-400"
                  aria-hidden="true"
                />
                <span className="sm:hidden">{isMy ? 'Link စစ်မည်' : 'Check Link'}</span>
                <span className="hidden sm:inline">{t.launcherTabSingle}</span>
                {singleHistoryCount > 0 && (
                  <span className="font-mono text-xs tabular-nums opacity-75">
                    ({singleHistoryCount})
                  </span>
                )}
              </button>
            </div>

            {/* Compact Recent Single-Link Strip (if available) */}
            {recentSingleRecord && recentProduct && (
              <button
                type="button"
                onClick={onOpenRecentSingleResult}
                className="mt-2 pt-2 border-t border-zinc-200/65 dark:border-zinc-800/75 w-full min-h-[38px] flex items-center justify-between gap-2.5 text-left group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-lg"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className="w-7 h-7 rounded-md overflow-hidden bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 shrink-0">
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
                    <span className="font-semibold text-indigo-700 dark:text-indigo-400 shrink-0">
                      {t.singleRecentLabel}:
                    </span>
                    <span className="text-zinc-800 dark:text-zinc-200 font-medium truncate group-hover:underline">
                      {isMy ? recentProduct.nameMy : recentProduct.name}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 text-xs font-mono tabular-nums">
                  {typeof recentProduct.priceThb === 'number' && (
                    <span className="hidden sm:inline text-zinc-500 dark:text-zinc-400">
                      {formatThb(recentProduct.priceThb)}
                    </span>
                  )}
                  {recentSingleScore !== null && (
                    <span className="font-bold text-emerald-700 dark:text-emerald-400">
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
        </section>
      ) : (
        /* First Visit (No Batch Results Yet): Crisp Quick Link Bar + Inline Batch Setup */
        <>
          <section
            aria-label={t.linkImportHeading}
            className="relative rounded-2xl overflow-hidden border border-zinc-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs sp-rise-in"
          >
            <div
              aria-hidden="true"
              className="h-[2px] w-full bg-gradient-to-r from-indigo-500 via-cyan-500 to-emerald-500"
            />
            <div className="px-3.5 sm:px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              {recentSingleRecord && recentProduct ? (
                <button
                  type="button"
                  onClick={onOpenRecentSingleResult}
                  className="flex items-center gap-3 min-w-0 flex-1 text-left group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-lg"
                >
                  <div className="w-10 h-10 rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 shrink-0">
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
                      <span className="font-semibold text-indigo-700 dark:text-indigo-400">
                        {t.singleRecentLabel}
                      </span>
                      <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-600">
                        ·
                      </span>
                      <span>{getCategoryLabel(recentProduct.category, language, { short: true })}</span>
                      {typeof recentProduct.priceThb === 'number' && (
                        <>
                          <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-600">
                            ·
                          </span>
                          <span className="font-mono tabular-nums text-zinc-800 dark:text-zinc-200">
                            {formatThb(recentProduct.priceThb)}
                          </span>
                        </>
                      )}
                      {recentSingleScore !== null && (
                        <>
                          <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-600">
                            ·
                          </span>
                          <span className="font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                            {recentSingleScore}/100
                          </span>
                        </>
                      )}
                      <span aria-hidden="true" className="hidden md:inline text-zinc-300 dark:text-zinc-600">
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
                <div className="text-xs sm:text-[13px] text-zinc-600 dark:text-zinc-400 min-w-0">
                  {t.singleEmptyBarHint}
                </div>
              )}

              <button
                type="button"
                onClick={() => onSingleDrawerOpenChange(true)}
                className="inline-flex items-center justify-center gap-1.5 min-h-[42px] px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-900 dark:text-indigo-200 border border-indigo-200/90 dark:border-indigo-700/70 hover:bg-indigo-100/80 dark:hover:bg-indigo-900/60 active:scale-[0.98] transition-all whitespace-nowrap shrink-0 self-start sm:self-center cursor-pointer"
              >
                <Link2 className="w-4 h-4 shrink-0 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
                <span>{isMy ? 'Link စစ်မည်' : t.launcherTabSingle}</span>
                {singleHistoryCount > 0 && (
                  <span className="font-mono text-xs tabular-nums opacity-75">
                    ({singleHistoryCount})
                  </span>
                )}
              </button>
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
      {singleDrawerOpen && (
        <ProductLinkImportPanel
          {...linkImportProps}
          layout="drawer"
          onClose={() => onSingleDrawerOpenChange(false)}
        />
      )}
    </div>
  );
}
