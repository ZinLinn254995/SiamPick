import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Download,
  Filter,
  RotateCcw,
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

export function ProductFilterBar({
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
  language,
}: ProductFilterBarProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const t = TRANSLATIONS[language];
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

  const updateFilter = <K extends keyof ProductResultsFilterState>(
    key: K,
    value: ProductResultsFilterState[K]
  ) => {
    onChangeFilters({
      ...filters,
      [key]: value,
    });
  };

  return (
    <div className="mt-4 sm:mt-5 space-y-3">
      {/* Primary Controls Row: Category Tabs, Queue Tabs, Sort + Direction, Filters Toggle, Export */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2.5 sm:gap-3 min-w-0">
          {/* Category Quick Switch (Compact — expands cleanly via Filters dropdown when >4 categories) */}
          {quickSwitchCategories.length <= 4 ? (
            <div className="relative max-w-full min-w-0">
              <div
                className="sp-segmented flex max-w-full overflow-x-auto no-scrollbar pr-7 sm:pr-1"
                role="group"
                aria-label={t.settingCategoryLabel}
              >
                <button
                  type="button"
                  onClick={() => updateFilter('category', 'all')}
                  className={`sp-segmented-item shrink-0 ${
                    filters.category === 'all'
                      ? 'bg-white dark:bg-zinc-900 text-zinc-950 dark:text-zinc-50 shadow-xs'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50'
                  }`}
                >
                  {t.categoryAll}
                </button>
                {quickSwitchCategories.map((catId) => (
                  <button
                    key={catId}
                    type="button"
                    onClick={() => updateFilter('category', catId)}
                    className={`sp-segmented-item shrink-0 ${
                      filters.category === catId
                        ? 'bg-white dark:bg-zinc-900 text-zinc-950 dark:text-zinc-50 shadow-xs'
                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50'
                    }`}
                  >
                    {getCategoryLabel(catId, language, { short: true })}
                  </button>
                ))}
              </div>
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 right-0 w-7 rounded-r-lg bg-gradient-to-l from-zinc-100 dark:from-zinc-800 to-transparent sm:hidden"
              />
            </div>
          ) : (
            <select
              value={filters.category}
              onChange={(e) => updateFilter('category', e.target.value as CategoryFilter)}
              aria-label={t.settingCategoryLabel}
              className="w-full sm:w-auto min-h-[40px] px-3 py-2 text-xs sm:text-sm font-medium bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-300 cursor-pointer"
            >
              <option value="all">{t.categoryAll}</option>
              {quickSwitchCategories.map((catId) => (
                <option key={catId} value={catId}>
                  {getCategoryLabel(catId, language)}
                </option>
              ))}
            </select>
          )}

          {/* Active / Saved / Rejected Queue Switch */}
          <div className="relative max-w-full min-w-0">
            <div
              className="flex max-w-full items-center gap-4 text-xs font-medium pl-1 pr-7 sm:pr-1 overflow-x-auto no-scrollbar border-b border-zinc-200/70 dark:border-zinc-800/80 sm:border-b-0"
              role="group"
              aria-label="Review queue"
            >
              {(
                [
                  { id: 'active', label: t.queueActive, count: queueCounts.active },
                  { id: 'saved', label: t.queueSaved, count: queueCounts.saved },
                  { id: 'rejected', label: t.queueRejected, count: queueCounts.rejected },
                ] as const
              ).map((q) => (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => onChangeDecisionFilter(q.id)}
                  className={`min-h-[40px] py-2 border-b-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    decisionFilter === q.id
                      ? 'text-zinc-950 dark:text-zinc-50 border-zinc-950 dark:border-zinc-100 font-semibold'
                      : 'text-zinc-600 dark:text-zinc-400 border-transparent hover:text-zinc-900 dark:hover:text-zinc-100'
                  }`}
                >
                  {q.label}{' '}
                  <span className="font-mono tabular-nums text-zinc-500 dark:text-zinc-400">({q.count})</span>
                </button>
              ))}
            </div>
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-0 w-7 bg-gradient-to-l from-[#FAFAFA] dark:from-zinc-950 to-transparent sm:hidden"
            />
          </div>
        </div>

        {/* Right Controls: Clean 2-row grid on mobile (Sort+Dir, Filters+Export), 1 row from 640px up */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full xl:w-auto">
          <div className="flex items-center gap-2 w-full sm:w-auto sm:flex-1 xl:flex-initial">
            <label htmlFor="results-sort-field" className="text-xs font-medium text-zinc-500 dark:text-zinc-400 sr-only">
              {t.sortLabel}
            </label>
            <select
              id="results-sort-field"
              value={sortField}
              onChange={(e) => onChangeSortField(e.target.value as ProductSortField)}
              aria-label={t.sortLabel}
              className="flex-1 min-w-0 sm:min-w-[160px] xl:flex-initial xl:w-auto min-h-[40px] h-10 px-3 py-2 text-xs sm:text-sm font-medium bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-300 cursor-pointer"
            >
              {SORT_FIELDS.map((field) => (
                <option key={field} value={field}>
                  {t.sortFieldLabels[field]}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={onToggleSortDirection}
              aria-label={
                sortDirection === 'desc' ? t.sortDirHighest : t.sortDirLowest
              }
              className="sp-btn-secondary h-10 px-3 shrink-0"
            >
              {sortDirection === 'desc' ? (
                <>
                  <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{t.sortDirHighest}</span>
                </>
              ) : (
                <>
                  <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{t.sortDirLowest}</span>
                </>
              )}
            </button>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setFiltersOpen((prev) => !prev)}
              aria-expanded={filtersOpen}
              className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 min-h-[40px] h-10 px-3 py-2 text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-200 ${
                filtersOpen || activeFilterCount > 0
                  ? 'bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950 border-zinc-950 dark:border-zinc-100'
                  : 'bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500'
              }`}
            >
              <Filter className="w-3.5 h-3.5" aria-hidden="true" />
              <span>
                {t.filtersToggleBtn}
                {activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
              </span>
            </button>

            {!exportDisabled && (
              <div ref={exportMenuRef} className="relative flex-1 sm:flex-initial shrink-0">
                <button
                  type="button"
                  onClick={() => setExportMenuOpen((prev) => !prev)}
                  aria-haspopup="menu"
                  aria-expanded={exportMenuOpen}
                  className="sp-btn-secondary w-full sm:w-auto h-10 px-3"
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{t.exportDropdownBtn}</span>
                  <ChevronDown className="w-3.5 h-3.5 opacity-75" aria-hidden="true" />
                </button>

                {exportMenuOpen && (
                  <div
                    role="menu"
                    aria-label={t.exportDropdownBtn}
                    className="absolute right-0 mt-1.5 z-[70] min-w-[168px] rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 shadow-lg py-1"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setExportMenuOpen(false);
                        onExportCsv();
                      }}
                      className="w-full flex items-center gap-2 min-h-[40px] px-3.5 py-2 text-xs font-medium text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer text-left whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400 shrink-0" aria-hidden="true" />
                      <span>{t.exportCsvBtn}</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setExportMenuOpen(false);
                        onExportJson();
                      }}
                      className="w-full flex items-center gap-2 min-h-[40px] px-3.5 py-2 text-xs font-medium text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer text-left whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400 shrink-0" aria-hidden="true" />
                      <span>{t.exportJsonBtn}</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Expandable 9-Criteria Multi-Filter Panel */}
      {filtersOpen && (
        <div className="sp-card p-3.5 sm:p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* 1. Score Range */}
            <label className="block space-y-1 text-xs">
              <span className="font-medium text-zinc-600 dark:text-zinc-400">{t.filterScoreRangeLabel}</span>
              <select
                value={filters.scoreRange}
                onChange={(e) =>
                  updateFilter(
                    'scoreRange',
                    e.target.value as ProductResultsFilterState['scoreRange']
                  )
                }
                className="w-full min-h-[40px] px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-300 cursor-pointer"
              >
                <option value="all">{t.filtersAllOption}</option>
                <option value="80+">{t.filterScore80Plus}</option>
                <option value="65-79">{t.filterScore65To79}</option>
                <option value="under-65">{t.filterScoreUnder65}</option>
              </select>
            </label>

            {/* 2. Recommendation Tier */}
            <label className="block space-y-1 text-xs">
              <span className="font-medium text-zinc-600 dark:text-zinc-400">{t.filterDecisionLabel}</span>
              <select
                value={filters.recommendationTier}
                onChange={(e) =>
                  updateFilter(
                    'recommendationTier',
                    e.target.value as 'all' | ProductDecisionVerdict
                  )
                }
                className="w-full min-h-[40px] px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-300 cursor-pointer"
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

            {/* 3. Data Confidence */}
            <label className="block space-y-1 text-xs">
              <span className="font-medium text-zinc-600 dark:text-zinc-400">{t.filterConfidenceLabel}</span>
              <select
                value={filters.confidenceLevel}
                onChange={(e) =>
                  updateFilter('confidenceLevel', e.target.value as 'all' | ConfidenceLevel)
                }
                className="w-full min-h-[40px] px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-300 cursor-pointer"
              >
                <option value="all">{t.filtersAllOption}</option>
                <option value="High">{t.confidenceLabels.High}</option>
                <option value="Medium">{t.confidenceLabels.Medium}</option>
                <option value="Low">{t.confidenceLabels.Low}</option>
              </select>
            </label>

            {/* 4. Competition Level */}
            <label className="block space-y-1 text-xs">
              <span className="font-medium text-zinc-600 dark:text-zinc-400">{t.filterCompetitionLabel}</span>
              <select
                value={filters.competitionLevel}
                onChange={(e) =>
                  updateFilter(
                    'competitionLevel',
                    e.target.value as 'all' | CompetitionLevel | 'unavailable'
                  )
                }
                className="w-full min-h-[40px] px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-300 cursor-pointer"
              >
                <option value="all">{t.filtersAllOption}</option>
                <option value="Low">{t.competitionLabels.Low}</option>
                <option value="Moderate">{t.competitionLabels.Moderate}</option>
                <option value="High">{t.competitionLabels.High}</option>
                <option value="unavailable">{t.filterPerfUnavailable}</option>
              </select>
            </label>

            {/* 5. Sales Performance */}
            <label className="block space-y-1 text-xs">
              <span className="font-medium text-zinc-600 dark:text-zinc-400">{t.filterSalesLabel}</span>
              <select
                value={filters.salesPerformance}
                onChange={(e) =>
                  updateFilter(
                    'salesPerformance',
                    e.target.value as ProductResultsFilterState['salesPerformance']
                  )
                }
                className="w-full min-h-[40px] px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-300 cursor-pointer"
              >
                <option value="all">{t.filtersAllOption}</option>
                <option value="strong">{t.filterPerfStrong}</option>
                <option value="moderate">{t.filterPerfModerate}</option>
                <option value="low">{t.filterPerfLow}</option>
                <option value="unavailable">{t.filterPerfUnavailable}</option>
              </select>
            </label>

            {/* 6. Commission Potential */}
            <label className="block space-y-1 text-xs">
              <span className="font-medium text-zinc-600 dark:text-zinc-400">{t.filterCommissionLabel}</span>
              <select
                value={filters.commissionPotential}
                onChange={(e) =>
                  updateFilter(
                    'commissionPotential',
                    e.target.value as ProductResultsFilterState['commissionPotential']
                  )
                }
                className="w-full min-h-[40px] px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-300 cursor-pointer"
              >
                <option value="all">{t.filtersAllOption}</option>
                <option value="high">{t.filterPerfStrong}</option>
                <option value="medium">{t.filterPerfModerate}</option>
                <option value="low">{t.filterPerfLow}</option>
                <option value="unavailable">{t.filterPerfUnavailable}</option>
              </select>
            </label>

            {/* 7. Product Category */}
            <label className="block space-y-1 text-xs">
              <span className="font-medium text-zinc-600 dark:text-zinc-400">{t.filterCategoryLabel}</span>
              <select
                value={filters.category}
                onChange={(e) => updateFilter('category', e.target.value as CategoryFilter)}
                className="w-full min-h-[40px] px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-300 cursor-pointer"
              >
                <option value="all">{t.categoryAll}</option>
                {UNIVERSAL_CATEGORIES.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {getCategoryLabel(cat.id, language)}
                  </option>
                ))}
              </select>
            </label>

            {/* 8. Research Mode */}
            <label className="block space-y-1 text-xs">
              <span className="font-medium text-zinc-600 dark:text-zinc-400">{t.filterModeLabel}</span>
              <select
                value={filters.researchMode}
                onChange={(e) =>
                  updateFilter('researchMode', e.target.value as 'all' | ResearchMode)
                }
                className="w-full min-h-[40px] px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-300 cursor-pointer"
              >
                <option value="all">{t.filtersAllOption}</option>
                <option value="fast">{t.modeFastTitle}</option>
                <option value="balanced">{t.modeBalancedTitle}</option>
                <option value="deep">{t.modeDeepTitle}</option>
              </select>
            </label>

            {/* 9. AI Content Suitability */}
            <label className="block space-y-1 text-xs">
              <span className="font-medium text-zinc-600 dark:text-zinc-400">{t.filterAiSuitabilityLabel}</span>
              <select
                value={filters.aiContentSuitability}
                onChange={(e) =>
                  updateFilter(
                    'aiContentSuitability',
                    e.target.value as 'all' | AiVideoSuitability
                  )
                }
                className="w-full min-h-[40px] px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-300 cursor-pointer"
              >
                <option value="all">{t.filtersAllOption}</option>
                <option value="High">{t.aiVideoLabels.High}</option>
                <option value="Good">{t.aiVideoLabels.Good}</option>
                <option value="Moderate">{t.aiVideoLabels.Moderate}</option>
              </select>
            </label>

            {/* 10. Optional Myanmar Language Signal Filter (0 extra credits) */}
            <label className="block space-y-1 text-xs">
              <span className="font-medium text-zinc-600 dark:text-zinc-400">{t.filterMyanmarSignalLabel}</span>
              <select
                value={filters.myanmarLanguageOnly ? 'matched' : 'all'}
                onChange={(e) =>
                  updateFilter('myanmarLanguageOnly', e.target.value === 'matched')
                }
                className="w-full min-h-[40px] px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-300 cursor-pointer"
              >
                <option value="all">{t.filtersAllOption}</option>
                <option value="matched">{t.filterMyanmarSignalOnlyOption}</option>
              </select>
            </label>
          </div>

          {activeFilterCount > 0 && (
            <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/70 flex items-center justify-end">
              <button
                type="button"
                onClick={() => onChangeFilters({ ...DEFAULT_PRODUCT_FILTERS })}
                className="sp-btn-ghost"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{t.filtersClearAllBtn}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
