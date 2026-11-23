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
import { getCategoryLabel, UNIVERSAL_CATEGORIES } from '../utils/categoryRegistry';
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
          pillBorderClass: 'border-emerald-500/40 dark:border-emerald-400/35',
          activeTextClass: 'text-zinc-950 dark:text-zinc-50 font-semibold',
          countActiveClass: 'text-emerald-700 dark:text-emerald-400',
        },
        {
          id: 'saved' as const,
          label: t.queueSaved,
          count: queueCounts.saved,
          pillBorderClass: 'border-cyan-500/45 dark:border-cyan-400/40',
          activeTextClass: 'text-cyan-950 dark:text-cyan-100 font-semibold',
          countActiveClass: 'text-cyan-700 dark:text-cyan-400',
        },
        {
          id: 'rejected' as const,
          label: t.queueRejected,
          count: queueCounts.rejected,
          pillBorderClass: 'border-rose-500/40 dark:border-rose-400/35',
          activeTextClass: 'text-rose-950 dark:text-rose-100 font-semibold',
          countActiveClass: 'text-rose-600 dark:text-rose-400',
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
    `w-full min-h-[40px] px-3 py-2 text-xs rounded-xl border transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
      isActive
        ? 'border-emerald-500/80 dark:border-emerald-400/70 bg-emerald-50/55 dark:bg-emerald-950/35 text-emerald-950 dark:text-emerald-100 font-semibold'
        : 'bg-white dark:bg-zinc-900 border-zinc-200/90 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 hover:border-zinc-300 dark:hover:border-zinc-700'
    }`;

  return (
    <div className="mt-3.5 sm:mt-4 relative rounded-2xl border border-zinc-200/90 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/95 shadow-xs">
      {/* Top Architectural Gradient Rim + Ambient Sheen (Clipped cleanly to top edge) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-20 rounded-t-2xl overflow-hidden"
      >
        <div className="h-[2px] w-full bg-gradient-to-r from-emerald-500 via-cyan-500 to-indigo-500" />
        <div className="h-full w-full bg-[radial-gradient(ellipse_at_top_left,rgba(16,185,129,0.07),transparent_55%),radial-gradient(ellipse_at_top_right,rgba(99,102,241,0.06),transparent_55%)] dark:bg-[radial-gradient(ellipse_at_top_left,rgba(16,185,129,0.12),transparent_55%),radial-gradient(ellipse_at_top_right,rgba(99,102,241,0.1),transparent_55%)]" />
      </div>

      {/* Tier 1: Unified Category Quick Rail + Sliding Queue Switcher */}
      <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between border-b border-zinc-200/75 dark:border-zinc-800/80">
        {/* Category Quick Rail (Always 1-tap horizontal rail — zero clunky full-width native select) */}
        <div className="relative flex-1 min-w-0 px-3 py-2 sm:px-4 sm:py-2.5 border-b lg:border-b-0 lg:border-r border-zinc-200/75 dark:border-zinc-800/80">
          <div
            className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pr-6"
            role="group"
            aria-label={t.settingCategoryLabel}
          >
            <button
              type="button"
              onClick={() => updateFilter('category', 'all')}
              aria-pressed={filters.category === 'all'}
              className={`inline-flex items-center gap-1.5 min-h-[38px] sm:min-h-[36px] px-3 py-1.5 text-xs rounded-xl whitespace-nowrap shrink-0 transition-all duration-150 active:scale-[0.97] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                filters.category === 'all'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-500 dark:from-emerald-400 dark:to-cyan-400 text-white dark:text-zinc-950 font-semibold shadow-sm shadow-emerald-600/20'
                  : 'font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-100 hover:bg-zinc-100/80 dark:hover:bg-zinc-800/70'
              }`}
            >
              <span>{t.categoryAll}</span>
              <span
                className={`font-mono text-[11px] tabular-nums ${
                  filters.category === 'all'
                    ? 'text-white/90 dark:text-zinc-950/80'
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
                  className={`inline-flex items-center gap-1.5 min-h-[38px] sm:min-h-[36px] px-3 py-1.5 text-xs rounded-xl whitespace-nowrap shrink-0 transition-all duration-150 active:scale-[0.97] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                    isSelected
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-500 dark:from-emerald-400 dark:to-cyan-400 text-white dark:text-zinc-950 font-semibold shadow-sm shadow-emerald-600/20'
                      : 'font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-100 hover:bg-zinc-100/80 dark:hover:bg-zinc-800/70'
                  }`}
                >
                  <span>{getCategoryLabel(catId, language, { short: true })}</span>
                  {catCount !== undefined && (
                    <span
                      className={`font-mono text-[11px] tabular-nums ${
                        isSelected
                          ? 'text-white/90 dark:text-zinc-950/80'
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
            className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white via-white/80 dark:from-zinc-900 dark:via-zinc-900/80 to-transparent"
          />
        </div>

        {/* Sliding-Indicator Queue Switcher (Active · Saved · Rejected) */}
        <div className="px-3 py-2 sm:px-4 sm:py-2 lg:w-[348px] shrink-0">
          <div
            className="relative grid grid-cols-3 p-1 rounded-xl bg-zinc-100/90 dark:bg-zinc-950/75 border border-zinc-200/75 dark:border-zinc-800"
            role="group"
            aria-label={isMy ? 'ရလဒ်အုပ်စုများ' : 'Review queue'}
          >
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute top-1 bottom-1 left-1 w-[calc((100%-8px)/3)] rounded-lg bg-white dark:bg-zinc-800 shadow-xs border transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${activeQueueMeta.pillBorderClass}`}
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
                  className={`relative z-10 min-h-[38px] sm:min-h-[34px] px-1.5 sm:px-2.5 py-1 text-[11px] sm:text-xs rounded-lg flex items-center justify-center gap-1 min-w-0 transition-colors duration-150 cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
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
        className={`px-3 py-2.5 sm:px-4 sm:py-2.5 bg-zinc-50/75 dark:bg-zinc-950/45 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 ${
          !filtersOpen && activeChips.length === 0 ? 'rounded-b-2xl' : ''
        }`}
      >
        {/* Connected Sort Field + 180deg Rotating Direction Pill */}
        <div className="flex items-center w-full sm:w-auto sm:flex-1 sm:max-w-[330px] rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-700/80 shadow-2xs overflow-hidden focus-within:border-emerald-500/80 dark:focus-within:border-emerald-400/70 transition-colors">
          <ArrowUpDown
            className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 ml-3 shrink-0 pointer-events-none"
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
              <option key={field} value={field} className="bg-white dark:bg-zinc-900">
                {t.sortFieldLabels[field]}
              </option>
            ))}
          </select>

          <span aria-hidden="true" className="w-px h-5 bg-zinc-200/90 dark:bg-zinc-700/80 shrink-0" />

          <button
            type="button"
            onClick={onToggleSortDirection}
            aria-label={sortDirection === 'desc' ? t.sortDirHighest : t.sortDirLowest}
            className="min-h-[40px] h-10 px-3 inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800/70 active:scale-[0.97] transition-all cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500"
          >
            <ArrowDown
              className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
                sortDirection === 'asc'
                  ? 'rotate-180 text-indigo-600 dark:text-indigo-400'
                  : 'rotate-0 text-emerald-600 dark:text-emerald-400'
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
            className={`min-h-[40px] h-10 px-3.5 rounded-xl border text-xs font-semibold inline-flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
              filtersOpen || activeFilterCount > 0
                ? 'bg-gradient-to-r from-emerald-600 to-teal-500 dark:from-emerald-400 dark:to-cyan-400 text-white dark:text-zinc-950 border-transparent shadow-sm shadow-emerald-600/20 dark:shadow-emerald-500/15'
                : 'bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 border-zinc-200/90 dark:border-zinc-700/80 hover:border-emerald-400/70 dark:hover:border-emerald-500/50'
            }`}
          >
            <Filter className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>{t.filtersToggleBtn}</span>
            {activeFilterCount > 0 && (
              <span className="font-mono text-[11px] font-bold tabular-nums px-1.5 py-0.5 rounded-md bg-white/20 dark:bg-zinc-950/15">
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
                className={`w-full sm:w-auto min-h-[40px] h-10 px-3.5 rounded-xl border text-xs font-semibold inline-flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                  exportMenuOpen
                    ? 'bg-indigo-600 dark:bg-indigo-400 text-white dark:text-zinc-950 border-transparent shadow-sm shadow-indigo-600/20'
                    : 'bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200 border-indigo-200/90 dark:border-indigo-700/60 hover:bg-indigo-100/80 dark:hover:bg-indigo-900/50'
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

              {exportMenuOpen && (
                <div
                  role="menu"
                  aria-label={t.exportDropdownBtn}
                  className="sp-popover-enter origin-top-right absolute right-0 mt-2 z-[70] min-w-[208px] rounded-xl bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-zinc-200/90 dark:border-zinc-700/80 shadow-xl overflow-hidden"
                >
                  <div
                    aria-hidden="true"
                    className="h-[2px] w-full bg-gradient-to-r from-emerald-500 via-cyan-500 to-indigo-500"
                  />
                  <div className="p-1.5 space-y-1">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setExportMenuOpen(false);
                        onExportCsv();
                      }}
                      className="w-full flex items-center gap-2.5 min-h-[44px] px-2.5 py-2 rounded-lg text-left hover:bg-emerald-50/80 dark:hover:bg-emerald-950/35 transition-colors cursor-pointer"
                    >
                      <span className="w-7 h-7 rounded-lg bg-emerald-100/80 dark:bg-emerald-900/45 text-emerald-700 dark:text-emerald-400 inline-flex items-center justify-center shrink-0">
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
                      className="w-full flex items-center gap-2.5 min-h-[44px] px-2.5 py-2 rounded-lg text-left hover:bg-indigo-50/80 dark:hover:bg-indigo-950/35 transition-colors cursor-pointer"
                    >
                      <span className="w-7 h-7 rounded-lg bg-indigo-100/80 dark:bg-indigo-900/45 text-indigo-700 dark:text-indigo-400 inline-flex items-center justify-center shrink-0">
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
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Tier 3: Live Active Filter Summary Strip (1-tap removal chips) */}
      {activeChips.length > 0 && (
        <div
          className={`sp-rise-in px-3 py-2 sm:px-4 border-t border-zinc-200/75 dark:border-zinc-800/80 bg-emerald-50/35 dark:bg-emerald-950/15 flex items-center justify-between gap-2 ${
            !filtersOpen ? 'rounded-b-2xl' : ''
          }`}
        >
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar min-w-0">
            {activeChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={() => updateFilter(chip.key, DEFAULT_PRODUCT_FILTERS[chip.key])}
                aria-label={`${chip.label}: ${chip.valueLabel} — ${t.filtersClearAllBtn}`}
                className="inline-flex items-center gap-1 min-h-[30px] px-2.5 py-1 rounded-lg bg-white dark:bg-zinc-900 border border-emerald-300/80 dark:border-emerald-700/70 text-[11px] font-medium text-zinc-800 dark:text-zinc-200 hover:border-rose-400 dark:hover:border-rose-500 active:scale-[0.97] transition-all cursor-pointer whitespace-nowrap shrink-0"
              >
                <span className="text-zinc-500 dark:text-zinc-400">{chip.label}:</span>
                <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                  {chip.valueLabel}
                </span>
                <X className="w-3 h-3 text-zinc-400 hover:text-rose-500 ml-0.5 shrink-0" aria-hidden="true" />
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => onChangeFilters({ ...DEFAULT_PRODUCT_FILTERS })}
            className="inline-flex items-center gap-1 min-h-[30px] px-2 py-1 rounded-lg text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-50 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3 h-3" aria-hidden="true" />
            <span className="hidden sm:inline">{t.filtersClearAllBtn}</span>
            <span className="sm:hidden">{isMy ? 'ရှင်းမည်' : 'Reset'}</span>
          </button>
        </div>
      )}

      {/* Tier 4: Architectural 3-Zone Expandable Multi-Filter Studio */}
      {filtersOpen && (
        <div className="sp-rise-in border-t border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900 rounded-b-2xl p-3.5 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-zinc-100 dark:border-zinc-800/80">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
              <SlidersHorizontal
                className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0"
                aria-hidden="true"
              />
              <span>{t.filtersToggleBtn}</span>
              {activeFilterCount > 0 && (
                <span className="font-mono text-[11px] font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                  · {activeFilterCount}
                </span>
              )}
            </div>

            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={() => onChangeFilters({ ...DEFAULT_PRODUCT_FILTERS })}
                className="inline-flex items-center gap-1.5 min-h-[34px] px-2.5 py-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-50 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{t.filtersClearAllBtn}</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Zone 1 (Emerald): Performance & Value */}
            <div className="space-y-3">
              <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
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
            <div className="space-y-3 pt-4 border-t border-zinc-100 dark:border-zinc-800/80 lg:pt-0 lg:border-t-0 lg:border-l lg:pl-5">
              <div className="text-[11px] font-semibold text-cyan-700 dark:text-cyan-400">
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

            {/* Zone 3 (Indigo): Catalog & AI Signals */}
            <div className="space-y-3 pt-4 border-t border-zinc-100 dark:border-zinc-800/80 lg:pt-0 lg:border-t-0 lg:border-l lg:pl-5">
              <div className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-400">
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
      )}
    </div>
  );
});
