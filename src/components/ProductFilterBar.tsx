import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUpDown,
  Braces,
  ChevronDown,
  Download,
  FileSpreadsheet,
  Filter,
  RotateCcw,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import {
  AiVideoSuitability,
  CategoryFilter,
  CompetitionLevel,
  ConfidenceLevel,
  DecisionFilter,
  Language,
  ProductCategory,
  ProductDecisionVerdict,
  ProductResultsFilterState,
  ProductSortField,
  ResearchMode,
  SortDirection,
} from '../types/product';
import {
  countActiveFilters,
  DEFAULT_PRODUCT_FILTERS,
} from '../utils/productAnalytics';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { getCategoryLabel, UNIVERSAL_CATEGORIES } from '../utils/categoryRegistry';
import {
  MOTION_TRANSITIONS,
  MOTION_VARIANTS,
  TACTILE_INTERACTIONS,
} from '../utils/motionPresets';
import { TRANSLATIONS } from '../i18n/translations';
import { AnimatedNumber } from './visual';

interface ProductFilterBarProps {
  filters: ProductResultsFilterState;
  onChangeFilters: (next: ProductResultsFilterState) => void;
  decisionFilter: DecisionFilter;
  onChangeDecisionFilter: (next: DecisionFilter) => void;
  queueCounts: { active: number; saved: number; rejected: number };
  sortField: ProductSortField;
  onChangeSortField: (next: ProductSortField) => void;
  sortDirection: SortDirection;
  onToggleSortDirection: () => void;
  exportDisabled: boolean;
  onExportCsv: () => void;
  onExportJson: () => void;
  availableCategories?: readonly ProductCategory[];
  categoryCounts?: Readonly<Partial<Record<ProductCategory, number>>>;
  language: Language;
}

const SORT_FIELDS: readonly ProductSortField[] = [
  'overallScore',
  'salesPerformance',
  'revenuePerformance',
  'revenueGrowth',
  'commissionPotential',
  'competition',
  'aiContentSuitability',
  'dataConfidence',
] as const;

interface ActiveFilterChip {
  key: keyof ProductResultsFilterState;
  label: string;
  valueLabel: string;
}

export const ProductFilterBar = memo(function ProductFilterBar({
  filters,
  onChangeFilters,
  decisionFilter,
  onChangeDecisionFilter,
  queueCounts,
  sortField,
  onChangeSortField,
  sortDirection,
  onToggleSortDirection,
  exportDisabled,
  onExportCsv,
  onExportJson,
  availableCategories,
  categoryCounts,
  language,
}: ProductFilterBarProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const prefersReduced = useReducedMotion();
  const t = TRANSLATIONS[language];
  const isMy = language === 'my';
  const activeFilterCount = countActiveFilters(filters);

  useEffect(() => {
    if (!exportMenuOpen) return;
    const handleOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setExportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [exportMenuOpen]);

  const quickSwitchCategories: ProductCategory[] =
    availableCategories && availableCategories.length > 0
      ? [...availableCategories]
      : ['womens-fashion', 'cosmetics-beauty', 'home-living'];

  const totalInActiveQueue =
    decisionFilter === 'active'
      ? queueCounts.active
      : decisionFilter === 'saved'
        ? queueCounts.saved
        : queueCounts.rejected;

  const updateFilter = <K extends keyof ProductResultsFilterState>(
    key: K,
    value: ProductResultsFilterState[K]
  ) => {
    onChangeFilters({
      ...filters,
      [key]: value,
    });
  };

  const queueOptions = useMemo(
    () =>
      [
        {
          id: 'active' as const,
          label: t.queueActive,
          count: queueCounts.active,
          pillBorderClass: 'border-emerald-500/40 dark:border-[#10F5A0]/35',
          activeTextClass: 'text-zinc-950 dark:text-zinc-50 font-semibold',
          countActiveClass: 'text-emerald-700 dark:text-[#10F5A0]',
        },
        {
          id: 'saved' as const,
          label: t.queueSaved,
          count: queueCounts.saved,
          pillBorderClass: 'border-cyan-500/45 dark:border-[#25F4EE]/35',
          activeTextClass: 'text-cyan-950 dark:text-cyan-100 font-semibold',
          countActiveClass: 'text-cyan-700 dark:text-[#25F4EE]',
        },
        {
          id: 'rejected' as const,
          label: t.queueRejected,
          count: queueCounts.rejected,
          pillBorderClass: 'border-rose-500/40 dark:border-[#FE2C55]/35',
          activeTextClass: 'text-rose-950 dark:text-rose-100 font-semibold',
          countActiveClass: 'text-rose-600 dark:text-[#FE2C55]',
        },
      ] as const,
    [t.queueActive, t.queueSaved, t.queueRejected, queueCounts]
  );

  const activeQueueIndex = Math.max(
    0,
    queueOptions.findIndex((q) => q.id === decisionFilter)
  );
  const activeQueueMeta = queueOptions[activeQueueIndex];

  const activeChips = useMemo<ActiveFilterChip[]>(() => {
    const chips: ActiveFilterChip[] = [];

    if (filters.scoreRange !== 'all') {
      const scoreMap = {
        '80+': t.filterScore80Plus,
        '65-79': t.filterScore65To79,
        'under-65': t.filterScoreUnder65,
      } as const;
      chips.push({
        key: 'scoreRange',
        label: t.filterScoreRangeLabel,
        valueLabel: scoreMap[filters.scoreRange],
      });
    }
    if (filters.recommendationTier !== 'all') {
      chips.push({
        key: 'recommendationTier',
        label: t.filterDecisionLabel,
        valueLabel: t.decisionVerdictLabels[filters.recommendationTier],
      });
    }
    if (filters.confidenceLevel !== 'all') {
      chips.push({
        key: 'confidenceLevel',
        label: t.filterConfidenceLabel,
        valueLabel: t.confidenceLabels[filters.confidenceLevel],
      });
    }
    if (filters.competitionLevel !== 'all') {
      chips.push({
        key: 'competitionLevel',
        label: t.filterCompetitionLabel,
        valueLabel:
          filters.competitionLevel === 'unavailable'
            ? t.filterPerfUnavailable
            : t.competitionLabels[filters.competitionLevel],
      });
    }
    if (filters.salesPerformance !== 'all') {
      const perfMap = {
        strong: t.filterPerfStrong,
        moderate: t.filterPerfModerate,
        low: t.filterPerfLow,
        unavailable: t.filterPerfUnavailable,
      } as const;
      chips.push({
        key: 'salesPerformance',
        label: t.filterSalesLabel,
        valueLabel: perfMap[filters.salesPerformance],
      });
    }
    if (filters.commissionPotential !== 'all') {
      const commMap = {
        high: t.filterPerfStrong,
        medium: t.filterPerfModerate,
        low: t.filterPerfLow,
        unavailable: t.filterPerfUnavailable,
      } as const;
      chips.push({
        key: 'commissionPotential',
        label: t.filterCommissionLabel,
        valueLabel: commMap[filters.commissionPotential],
      });
    }
    if (filters.category !== 'all') {
      chips.push({
        key: 'category',
        label: t.filterCategoryLabel,
        valueLabel: getCategoryLabel(filters.category, language, { short: true }),
      });
    }
    if (filters.researchMode !== 'all') {
      const modeMap = {
        fast: t.modeFastTitle,
        balanced: t.modeBalancedTitle,
        deep: t.modeDeepTitle,
      } as const;
      chips.push({
        key: 'researchMode',
        label: t.filterModeLabel,
        valueLabel: modeMap[filters.researchMode],
      });
    }
    if (filters.aiContentSuitability !== 'all') {
      chips.push({
        key: 'aiContentSuitability',
        label: t.filterAiSuitabilityLabel,
        valueLabel: t.aiVideoLabels[filters.aiContentSuitability],
      });
    }
    if (filters.myanmarLanguageOnly) {
      chips.push({
        key: 'myanmarLanguageOnly',
        label: t.filterMyanmarSignalLabel,
        valueLabel: t.filterMyanmarSignalOnlyOption,
      });
    }

    return chips;
  }, [filters, language, t]);

  const selectClassName = (isActive: boolean) =>
    `w-full min-h-[40px] px-3 py-2 text-xs rounded-xl border transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:focus-visible:ring-[#10F5A0] ${
      isActive
        ? 'border-emerald-500/75 dark:border-[#10F5A0]/60 bg-emerald-50/55 dark:bg-[#10F5A0]/[0.08] text-emerald-950 dark:text-[#10F5A0] font-semibold'
        : 'bg-[var(--sp-surface)] border-[var(--sp-border-strong)] text-zinc-900 dark:text-zinc-100 hover:border-zinc-400 dark:hover:border-white/25'
    }`;

  return (
    <div className="mt-3.5 sm:mt-4 relative rounded-2xl border border-[var(--sp-border)] bg-[var(--sp-surface)] shadow-[0_1px_2px_rgba(15,23,42,0.03)] dark:shadow-none dark:ring-1 dark:ring-inset dark:ring-white/[0.03]">
      {/* Tier 1: Unified Category Quick Rail + Sliding Queue Switcher */}
      <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between border-b border-[var(--sp-border)]">
        {/* Category Quick Rail */}
        <div className="relative flex-1 min-w-0 px-3 py-2 sm:px-4 sm:py-2.5 border-b lg:border-b-0 lg:border-r border-[var(--sp-border)]">
          <div
            className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pr-6"
            role="group"
            aria-label={t.settingCategoryLabel}
          >
            <button
              type="button"
              onClick={() => updateFilter('category', 'all')}
              aria-pressed={filters.category === 'all'}
              className={`inline-flex items-center gap-1.5 min-h-[38px] sm:min-h-[36px] px-3 py-1.5 text-xs rounded-xl whitespace-nowrap shrink-0 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:focus-visible:ring-[#10F5A0] ${
                filters.category === 'all'
                  ? 'bg-emerald-600 dark:bg-[#10F5A0] text-white dark:text-[#06070A] font-semibold shadow-xs'
                  : 'font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-100 hover:bg-zinc-100/80 dark:hover:bg-white/[0.06]'
              }`}
            >
              <span>{t.categoryAll}</span>
              <span
                className={`font-mono text-[11px] tabular-nums ${
                  filters.category === 'all'
                    ? 'text-white/90 dark:text-[#06070A]/80'
                    : 'text-zinc-400 dark:text-zinc-500'
                }`}
              >
                {totalInActiveQueue}
              </span>
            </button>

            {quickSwitchCategories.map((catId) => {
              const isSelected = filters.category === catId;
              const catCount = categoryCounts?.[catId];

              return (
                <button
                  key={catId}
                  type="button"
                  onClick={() => updateFilter('category', catId)}
                  aria-pressed={isSelected}
                  className={`inline-flex items-center gap-1.5 min-h-[38px] sm:min-h-[36px] px-3 py-1.5 text-xs rounded-xl whitespace-nowrap shrink-0 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:focus-visible:ring-[#10F5A0] ${
                    isSelected
                      ? 'bg-emerald-600 dark:bg-[#10F5A0] text-white dark:text-[#06070A] font-semibold shadow-xs'
                      : 'font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-100 hover:bg-zinc-100/80 dark:hover:bg-white/[0.06]'
                  }`}
                >
                  <span>{getCategoryLabel(catId, language, { short: true })}</span>
                  {catCount !== undefined && (
                    <span
                      className={`font-mono text-[11px] tabular-nums ${
                        isSelected
                          ? 'text-white/90 dark:text-[#06070A]/80'
                          : 'text-zinc-400 dark:text-zinc-500'
                      }`}
                    >
                      {catCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Right-edge scroll fade mask */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white via-white/80 dark:from-[#0E1118] dark:via-[#0E1118]/80 to-transparent"
          />
        </div>

        {/* Sliding-Indicator Queue Switcher (Active · Saved · Rejected) */}
        <div className="px-3 py-2 sm:px-4 sm:py-2 lg:w-[348px] shrink-0">
          <div
            className="relative grid grid-cols-3 p-1 rounded-xl bg-zinc-100/90 dark:bg-[#090C12] border border-[var(--sp-border)]"
            role="group"
            aria-label={isMy ? 'ရလဒ်အုပ်စုများ' : 'Review queue'}
          >
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute top-1 bottom-1 left-1 w-[calc((100%-8px)/3)] rounded-lg bg-white dark:bg-[#161D2B] shadow-xs border transition-[transform,border-color] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${activeQueueMeta.pillBorderClass}`}
              style={{ transform: `translateX(${activeQueueIndex * 100}%)` }}
            />
            {queueOptions.map((q) => {
              const isActive = decisionFilter === q.id;
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => onChangeDecisionFilter(q.id)}
                  aria-pressed={isActive}
                  className={`relative z-10 min-h-[38px] sm:min-h-[34px] px-1.5 sm:px-2.5 py-1 text-[11px] sm:text-xs rounded-lg flex items-center justify-center gap-1 min-w-0 transition-colors duration-150 cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:focus-visible:ring-[#10F5A0] ${
                    isActive
                      ? q.activeTextClass
                      : 'text-zinc-600 dark:text-zinc-400 font-medium hover:text-zinc-950 dark:hover:text-zinc-100'
                  }`}
                >
                  <span className="truncate">{q.label}</span>
                  <span
                    className={`font-mono text-[10px] sm:text-[11px] font-bold tabular-nums shrink-0 ${
                      isActive ? q.countActiveClass : 'text-zinc-400 dark:text-zinc-500'
                    }`}
                  >
                    <AnimatedNumber value={q.count} />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tier 2: Precision Sort Capsule + Filter Studio Trigger + Export Dock */}
      <div
        className={`px-3 py-2.5 sm:px-4 sm:py-2.5 bg-zinc-50/70 dark:bg-[#090C12]/55 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 ${
          !filtersOpen && activeChips.length === 0 ? 'rounded-b-2xl' : ''
        }`}
      >
        {/* Connected Sort Field + 180deg Rotating Direction Pill */}
        <div className="flex items-center w-full sm:w-auto sm:flex-1 sm:max-w-[330px] rounded-xl bg-[var(--sp-surface)] border border-[var(--sp-border-strong)] overflow-hidden focus-within:border-emerald-500/80 dark:focus-within:border-[#10F5A0]/65 transition-colors">
          <ArrowUpDown
            className="w-3.5 h-3.5 text-cyan-600 dark:text-[#25F4EE] ml-3 shrink-0 pointer-events-none"
            aria-hidden="true"
          />
          <label htmlFor="results-sort-field" className="sr-only">
            {t.sortLabel}
          </label>
          <select
            id="results-sort-field"
            value={sortField}
            onChange={(e) => onChangeSortField(e.target.value as ProductSortField)}
            aria-label={t.sortLabel}
            className="flex-1 min-w-0 min-h-[40px] h-10 px-2 bg-transparent text-xs font-medium text-zinc-900 dark:text-zinc-100 focus:outline-none cursor-pointer"
          >
            {SORT_FIELDS.map((field) => (
              <option key={field} value={field} className="bg-white dark:bg-[#0E1118]">
                {t.sortFieldLabels[field]}
              </option>
            ))}
          </select>

          <span aria-hidden="true" className="w-px h-5 bg-[var(--sp-border-strong)] shrink-0" />

          <button
            type="button"
            onClick={onToggleSortDirection}
            aria-label={sortDirection === 'desc' ? t.sortDirHighest : t.sortDirLowest}
            className="min-h-[40px] h-10 px-3 inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100/80 dark:hover:bg-white/[0.06] transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 dark:focus-visible:ring-[#10F5A0]"
          >
            <ArrowDown
              className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
                sortDirection === 'asc'
                  ? 'rotate-180 text-cyan-600 dark:text-[#25F4EE]'
                  : 'rotate-0 text-emerald-600 dark:text-[#10F5A0]'
              }`}
              aria-hidden="true"
            />
            <span>{sortDirection === 'desc' ? t.sortDirHighest : t.sortDirLowest}</span>
          </button>
        </div>

        {/* Right Split Dock: Filter Studio + Export Popover */}
        <div
          className={`grid gap-2 w-full sm:w-auto sm:flex sm:items-center ${
            exportDisabled ? 'grid-cols-1' : 'grid-cols-2'
          }`}
        >
          <button
            type="button"
            onClick={() => setFiltersOpen((prev) => !prev)}
            aria-expanded={filtersOpen}
            className={`min-h-[40px] h-10 px-3.5 rounded-xl border text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:focus-visible:ring-[#10F5A0] ${
              filtersOpen || activeFilterCount > 0
                ? 'bg-emerald-600 dark:bg-[#10F5A0] text-white dark:text-[#06070A] border-transparent shadow-xs'
                : 'bg-[var(--sp-surface)] text-zinc-800 dark:text-zinc-200 border-[var(--sp-border-strong)] hover:border-emerald-500/50 dark:hover:border-[#10F5A0]/45'
            }`}
          >
            <Filter className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>{t.filtersToggleBtn}</span>
            {activeFilterCount > 0 && (
              <span className="font-mono text-[11px] font-bold tabular-nums px-1.5 py-0.5 rounded-md bg-white/20 dark:bg-[#06070A]/15">
                <AnimatedNumber value={activeFilterCount} />
              </span>
            )}
            <ChevronDown
              className={`w-3.5 h-3.5 shrink-0 opacity-85 transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
                filtersOpen ? 'rotate-180' : 'rotate-0'
              }`}
              aria-hidden="true"
            />
          </button>

          {!exportDisabled && (
            <div ref={exportMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setExportMenuOpen((prev) => !prev)}
                aria-haspopup="menu"
                aria-expanded={exportMenuOpen}
                className={`w-full sm:w-auto min-h-[40px] h-10 px-3.5 rounded-xl border text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 dark:focus-visible:ring-[#25F4EE] ${
                  exportMenuOpen
                    ? 'bg-zinc-950 dark:bg-zinc-100 text-white dark:text-[#06070A] border-transparent shadow-xs'
                    : 'bg-[var(--sp-surface)] text-zinc-800 dark:text-zinc-200 border-[var(--sp-border-strong)] hover:border-cyan-500/50 dark:hover:border-[#25F4EE]/45'
                }`}
              >
                <Download className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{t.exportDropdownBtn}</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 shrink-0 opacity-80 transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
                    exportMenuOpen ? 'rotate-180' : 'rotate-0'
                  }`}
                  aria-hidden="true"
                />
              </button>

              <AnimatePresence>
                {exportMenuOpen && (
                  <motion.div
                    key="export-dropdown-menu"
                    role="menu"
                    aria-label={t.exportDropdownBtn}
                    variants={MOTION_VARIANTS.popover}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="origin-top-right absolute right-0 mt-2 z-[70] min-w-[214px] rounded-2xl sp-glass overflow-hidden"
                  >
                    <div className="p-1.5 space-y-1">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setExportMenuOpen(false);
                          onExportCsv();
                        }}
                        className="w-full flex items-center gap-2.5 min-h-[44px] px-2.5 py-2 rounded-xl text-left hover:bg-emerald-500/10 dark:hover:bg-[#10F5A0]/10 transition-colors cursor-pointer"
                      >
                        <span className="w-7 h-7 rounded-lg bg-emerald-500/12 dark:bg-[#10F5A0]/14 text-emerald-700 dark:text-[#10F5A0] inline-flex items-center justify-center shrink-0">
                          <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-semibold text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                            {t.exportCsvBtn}
                          </span>
                          <span className="block text-[11px] text-zinc-500 dark:text-zinc-400">
                            Excel / Google Sheets
                          </span>
                        </span>
                      </button>

                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setExportMenuOpen(false);
                          onExportJson();
                        }}
                        className="w-full flex items-center gap-2.5 min-h-[44px] px-2.5 py-2 rounded-xl text-left hover:bg-cyan-500/10 dark:hover:bg-[#25F4EE]/10 transition-colors cursor-pointer"
                      >
                        <span className="w-7 h-7 rounded-lg bg-cyan-500/12 dark:bg-[#25F4EE]/14 text-cyan-700 dark:text-[#25F4EE] inline-flex items-center justify-center shrink-0">
                          <Braces className="w-3.5 h-3.5" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-semibold text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                            {t.exportJsonBtn}
                          </span>
                          <span className="block text-[11px] text-zinc-500 dark:text-zinc-400">
                            {isMy ? 'ဒေတာဖိုင် (JSON)' : 'Structured Data'}
                          </span>
                        </span>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* Tier 3: Live Active Filter Summary Strip (1-tap removal chips) */}
      <AnimatePresence initial={false}>
        {activeChips.length > 0 && (
          <motion.div
            key="active-filter-chips-strip"
            initial={prefersReduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={
              prefersReduced
                ? { opacity: 1 }
                : { height: 'auto', opacity: 1, transitionEnd: { overflow: 'visible' } }
            }
            exit={
              prefersReduced
                ? { opacity: 0 }
                : { height: 0, opacity: 0, overflow: 'hidden' }
            }
            transition={MOTION_TRANSITIONS.accordion}
            className={`overflow-hidden border-t border-[var(--sp-border)] bg-emerald-500/[0.04] dark:bg-[#10F5A0]/[0.04] ${
              !filtersOpen ? 'rounded-b-2xl' : ''
            }`}
          >
            <div className="px-3 py-2 sm:px-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar min-w-0">
                <AnimatePresence initial={false}>
                  {activeChips.map((chip) => (
                    <motion.button
                      key={chip.key}
                      type="button"
                      layout={prefersReduced ? false : 'position'}
                      variants={MOTION_VARIANTS.chipPop}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      whileTap={prefersReduced ? undefined : TACTILE_INTERACTIONS.buttonTap}
                      onClick={() => updateFilter(chip.key, DEFAULT_PRODUCT_FILTERS[chip.key])}
                      aria-label={`${chip.label}: ${chip.valueLabel} — ${t.filtersClearAllBtn}`}
                      className="inline-flex items-center gap-1 min-h-[30px] px-2.5 py-1 rounded-lg bg-[var(--sp-surface)] border border-emerald-500/35 dark:border-[#10F5A0]/30 text-[11px] font-medium text-zinc-800 dark:text-zinc-200 hover:border-rose-400 dark:hover:border-[#FE2C55] transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <span className="text-zinc-500 dark:text-zinc-400">{chip.label}:</span>
                      <span className="font-semibold text-emerald-700 dark:text-[#10F5A0]">
                        {chip.valueLabel}
                      </span>
                      <X
                        className="w-3 h-3 text-zinc-400 hover:text-rose-500 dark:hover:text-[#FE2C55] ml-0.5 shrink-0"
                        aria-hidden="true"
                      />
                    </motion.button>
                  ))}
                </AnimatePresence>
              </div>

              <button
                type="button"
                onClick={() => onChangeFilters({ ...DEFAULT_PRODUCT_FILTERS })}
                className="inline-flex items-center gap-1 min-h-[30px] px-2 py-1 rounded-lg text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-50 hover:bg-zinc-200/60 dark:hover:bg-white/[0.08] transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3 h-3" aria-hidden="true" />
                <span className="hidden sm:inline">{t.filtersClearAllBtn}</span>
                <span className="sm:hidden">{isMy ? 'ရှင်းမည်' : 'Reset'}</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tier 4: Architectural 3-Zone Expandable Multi-Filter Studio */}
      <AnimatePresence initial={false}>
        {filtersOpen && (
          <motion.div
            key="multi-filter-studio"
            initial={prefersReduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={
              prefersReduced
                ? { opacity: 1 }
                : { height: 'auto', opacity: 1, transitionEnd: { overflow: 'visible' } }
            }
            exit={
              prefersReduced
                ? { opacity: 0 }
                : { height: 0, opacity: 0, overflow: 'hidden' }
            }
            transition={MOTION_TRANSITIONS.accordion}
            className="overflow-hidden border-t border-[var(--sp-border)] bg-[var(--sp-surface)] rounded-b-2xl"
          >
            <div className="p-3.5 sm:p-5 space-y-4">
              <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[var(--sp-border)]">
                <div className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                  <SlidersHorizontal
                    className="w-3.5 h-3.5 text-emerald-600 dark:text-[#10F5A0] shrink-0"
                    aria-hidden="true"
                  />
                  <span>{t.filtersToggleBtn}</span>
                  {activeFilterCount > 0 && (
                    <span className="font-mono text-[11px] font-bold tabular-nums text-emerald-700 dark:text-[#10F5A0]">
                      · {activeFilterCount}
                    </span>
                  )}
                </div>

                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={() => onChangeFilters({ ...DEFAULT_PRODUCT_FILTERS })}
                    className="inline-flex items-center gap-1.5 min-h-[34px] px-2.5 py-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-50 hover:bg-zinc-100 dark:hover:bg-white/[0.06] rounded-lg transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{t.filtersClearAllBtn}</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Zone 1 (Mint/Emerald): Performance & Value */}
                <div className="space-y-3">
                  <div className="text-[11px] font-semibold text-emerald-700 dark:text-[#10F5A0]">
                    {isMy ? '၁. စွမ်းဆောင်ရည်နှင့် အမြတ်နှုန်း' : '01. Performance & Value'}
                  </div>
                  <div className="space-y-2.5">
                    <label className="block space-y-1 text-xs">
                      <span className="font-medium text-zinc-600 dark:text-zinc-400">
                        {t.filterScoreRangeLabel}
                      </span>
                      <select
                        value={filters.scoreRange}
                        onChange={(e) =>
                          updateFilter(
                            'scoreRange',
                            e.target.value as ProductResultsFilterState['scoreRange']
                          )
                        }
                        className={selectClassName(filters.scoreRange !== 'all')}
                      >
                        <option value="all">{t.filtersAllOption}</option>
                        <option value="80+">{t.filterScore80Plus}</option>
                        <option value="65-79">{t.filterScore65To79}</option>
                        <option value="under-65">{t.filterScoreUnder65}</option>
                      </select>
                    </label>

                    <label className="block space-y-1 text-xs">
                      <span className="font-medium text-zinc-600 dark:text-zinc-400">
                        {t.filterSalesLabel}
                      </span>
                      <select
                        value={filters.salesPerformance}
                        onChange={(e) =>
                          updateFilter(
                            'salesPerformance',
                            e.target.value as ProductResultsFilterState['salesPerformance']
                          )
                        }
                        className={selectClassName(filters.salesPerformance !== 'all')}
                      >
                        <option value="all">{t.filtersAllOption}</option>
                        <option value="strong">{t.filterPerfStrong}</option>
                        <option value="moderate">{t.filterPerfModerate}</option>
                        <option value="low">{t.filterPerfLow}</option>
                        <option value="unavailable">{t.filterPerfUnavailable}</option>
                      </select>
                    </label>

                    <label className="block space-y-1 text-xs">
                      <span className="font-medium text-zinc-600 dark:text-zinc-400">
                        {t.filterCommissionLabel}
                      </span>
                      <select
                        value={filters.commissionPotential}
                        onChange={(e) =>
                          updateFilter(
                            'commissionPotential',
                            e.target.value as ProductResultsFilterState['commissionPotential']
                          )
                        }
                        className={selectClassName(filters.commissionPotential !== 'all')}
                      >
                        <option value="all">{t.filtersAllOption}</option>
                        <option value="high">{t.filterPerfStrong}</option>
                        <option value="medium">{t.filterPerfModerate}</option>
                        <option value="low">{t.filterPerfLow}</option>
                        <option value="unavailable">{t.filterPerfUnavailable}</option>
                      </select>
                    </label>
                  </div>
                </div>

                {/* Zone 2 (Cyan): Quality & Market Risk */}
                <div className="space-y-3 pt-4 border-t border-[var(--sp-border)] lg:pt-0 lg:border-t-0 lg:border-l lg:pl-5">
                  <div className="text-[11px] font-semibold text-cyan-700 dark:text-[#25F4EE]">
                    {isMy ? '၂. အရည်အသွေးနှင့် ပြိုင်ဆိုင်မှု' : '02. Quality & Risk'}
                  </div>
                  <div className="space-y-2.5">
                    <label className="block space-y-1 text-xs">
                      <span className="font-medium text-zinc-600 dark:text-zinc-400">
                        {t.filterDecisionLabel}
                      </span>
                      <select
                        value={filters.recommendationTier}
                        onChange={(e) =>
                          updateFilter(
                            'recommendationTier',
                            e.target.value as 'all' | ProductDecisionVerdict
                          )
                        }
                        className={selectClassName(filters.recommendationTier !== 'all')}
                      >
                        <option value="all">{t.filtersAllOption}</option>
                        <option value="recommended">{t.decisionVerdictLabels.recommended}</option>
                        <option value="worth-testing">{t.decisionVerdictLabels['worth-testing']}</option>
                        <option value="need-more-data">
                          {t.decisionVerdictLabels['need-more-data']}
                        </option>
                        <option value="not-recommended">
                          {t.decisionVerdictLabels['not-recommended']}
                        </option>
                      </select>
                    </label>

                    <label className="block space-y-1 text-xs">
                      <span className="font-medium text-zinc-600 dark:text-zinc-400">
                        {t.filterConfidenceLabel}
                      </span>
                      <select
                        value={filters.confidenceLevel}
                        onChange={(e) =>
                          updateFilter('confidenceLevel', e.target.value as 'all' | ConfidenceLevel)
                        }
                        className={selectClassName(filters.confidenceLevel !== 'all')}
                      >
                        <option value="all">{t.filtersAllOption}</option>
                        <option value="High">{t.confidenceLabels.High}</option>
                        <option value="Medium">{t.confidenceLabels.Medium}</option>
                        <option value="Low">{t.confidenceLabels.Low}</option>
                      </select>
                    </label>

                    <label className="block space-y-1 text-xs">
                      <span className="font-medium text-zinc-600 dark:text-zinc-400">
                        {t.filterCompetitionLabel}
                      </span>
                      <select
                        value={filters.competitionLevel}
                        onChange={(e) =>
                          updateFilter(
                            'competitionLevel',
                            e.target.value as 'all' | CompetitionLevel | 'unavailable'
                          )
                        }
                        className={selectClassName(filters.competitionLevel !== 'all')}
                      >
                        <option value="all">{t.filtersAllOption}</option>
                        <option value="Low">{t.competitionLabels.Low}</option>
                        <option value="Moderate">{t.competitionLabels.Moderate}</option>
                        <option value="High">{t.competitionLabels.High}</option>
                        <option value="unavailable">{t.filterPerfUnavailable}</option>
                      </select>
                    </label>
                  </div>
                </div>

                {/* Zone 3 (Zinc/Mint): Catalog & AI Signals */}
                <div className="space-y-3 pt-4 border-t border-[var(--sp-border)] lg:pt-0 lg:border-t-0 lg:border-l lg:pl-5">
                  <div className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                    {isMy ? '၃. ကဏ္ဍနှင့် AI အချက်ပြမှုများ' : '03. Catalog & AI Signals'}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2.5">
                    <label className="block space-y-1 text-xs">
                      <span className="font-medium text-zinc-600 dark:text-zinc-400">
                        {t.filterCategoryLabel}
                      </span>
                      <select
                        value={filters.category}
                        onChange={(e) => updateFilter('category', e.target.value as CategoryFilter)}
                        className={selectClassName(filters.category !== 'all')}
                      >
                        <option value="all">{t.categoryAll}</option>
                        {UNIVERSAL_CATEGORIES.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {getCategoryLabel(cat.id, language)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block space-y-1 text-xs">
                      <span className="font-medium text-zinc-600 dark:text-zinc-400">
                        {t.filterModeLabel}
                      </span>
                      <select
                        value={filters.researchMode}
                        onChange={(e) =>
                          updateFilter('researchMode', e.target.value as 'all' | ResearchMode)
                        }
                        className={selectClassName(filters.researchMode !== 'all')}
                      >
                        <option value="all">{t.filtersAllOption}</option>
                        <option value="fast">{t.modeFastTitle}</option>
                        <option value="balanced">{t.modeBalancedTitle}</option>
                        <option value="deep">{t.modeDeepTitle}</option>
                      </select>
                    </label>

                    <label className="block space-y-1 text-xs">
                      <span className="font-medium text-zinc-600 dark:text-zinc-400">
                        {t.filterAiSuitabilityLabel}
                      </span>
                      <select
                        value={filters.aiContentSuitability}
                        onChange={(e) =>
                          updateFilter(
                            'aiContentSuitability',
                            e.target.value as 'all' | AiVideoSuitability
                          )
                        }
                        className={selectClassName(filters.aiContentSuitability !== 'all')}
                      >
                        <option value="all">{t.filtersAllOption}</option>
                        <option value="High">{t.aiVideoLabels.High}</option>
                        <option value="Good">{t.aiVideoLabels.Good}</option>
                        <option value="Moderate">{t.aiVideoLabels.Moderate}</option>
                      </select>
                    </label>

                    <label className="block space-y-1 text-xs">
                      <span className="font-medium text-zinc-600 dark:text-zinc-400">
                        {t.filterMyanmarSignalLabel}
                      </span>
                      <select
                        value={filters.myanmarLanguageOnly ? 'matched' : 'all'}
                        onChange={(e) =>
                          updateFilter('myanmarLanguageOnly', e.target.value === 'matched')
                        }
                        className={selectClassName(Boolean(filters.myanmarLanguageOnly))}
                      >
                        <option value="all">{t.filtersAllOption}</option>
                        <option value="matched">{t.filterMyanmarSignalOnlyOption}</option>
                      </select>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
